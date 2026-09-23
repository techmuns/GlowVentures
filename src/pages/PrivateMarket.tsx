import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Handshake, Landmark, Wallet, TrendingUp, Fuel, Coins, Banknote, HelpCircle, CalendarClock, Layers, Users, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { SelectableTiles, type TileMetric } from "@/components/SelectableTiles";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { useViewParam } from "@/components/ViewToggle";
import { AbsentCell, AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { CallCell, CallEditor } from "@/components/EnteredCalls";
import {
  TREE_ROW, TREE_CELL, useExpanded, rowToggle, TreeNameCell, TreeSectionCell, ExpandAllButton,
} from "@/components/TreeTable";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { stockHref } from "@/lib/auditFormulas";
import { sum, sumOrNull, consolidatedMarketValue, currentHoldings } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals, unvaluedAccounts, unvaluedDrawn,
  pageScopeNote,
} from "@/lib/privateMarket";
import {
  bookFolios, privateBook, BOOK_SECTIONS,
  type BookFigures, type BookFolio, type BookGroup, type BookSectionId, type Overlap, type PrivateBook,
} from "@/lib/privateBook";
import { schemeCalls, callTotals, callHistory } from "@/lib/capitalCalls";
import { useEnteredCalls, headlineCall, todayIso } from "@/lib/enteredCalls";
import { fmtPct, fmtNum, fmtDate, changeColor } from "@/lib/format";

/**
 * WHICH FOUR TILES THE STRIP OPENS ON, and where a reader's own choice is kept.
 *
 * The default is the row that was already first on this page, which is the
 * smallest surprise available: what the top of the page always showed stays
 * where it was and the other twelve metrics are one dropdown away. Versioned,
 * so a set saved against an older catalogue can be retired by bumping it
 * rather than by rendering ids this build does not have.
 */
const PM_TILES_KEY = "glow:pmTiles:v1";
const PM_DEFAULT_TILES = ["value", "cost", "pnl", "uncalled"] as const;

/**
 * THE MASTER TABLE'S COLUMNS, in the order every row writes its cells — the
 * section bands, the fund or member rows, the folios under them, the "counted
 * once" lines and both totals. ONE list for By fund and By owner, so a column a
 * reader drags on one grouping is where they left it on the other.
 *
 * The two capital-account columns a reader could confuse are named apart:
 * PAID IN is cash that left the family's bank (the capital account), COST is
 * what the units held cost (the holding statement). They agree on most funds and
 * they are different documents; the header says which is which.
 */
const BOOK_COLS = ["name", "committed", "called", "paid", "uncalled", "units", "cost", "value", "return", "weight", "asOf", "call"] as const;
/**
 * THE CAPITAL-CALL COLUMN'S OWN HOVER, and the one place the reason it exists
 * is stated: no fund publishes a forward schedule, so the calls a fund has
 * announced — in a notice, an email, a phone call — are typed in here. It is
 * also where the one rule a reader of this column must not get wrong lives:
 * these are the family's figures, never added into a statement total.
 *
 * `call` IS THE FAMILY'S OWN COLUMN, and LAST, because it is the one column a
 * reader writes to rather than reads — and a stored arrangement that predates
 * it gets it appended rather than losing it (`useTableView`).
 */
const CALL_COLUMN_TITLE = "Upcoming capital calls, entered by the family and saved for everyone who opens this dashboard. "
  + "No fund in this book publishes a forward drawdown schedule, so a call a fund has announced is entered here. "
  + "An entered call is never added into Called, Paid in or Still to call — those are what the funds' own statements print.";
/**
 * THE KEY A FUND'S ENTERED CALLS ARE SAVED UNDER.
 *
 * A fund with a valued holding keys on its own `securityKey` — the join the
 * shared store was built on. A fund NO statement values has no securityKey, and
 * those are exactly the funds most likely to call: India SME's three folios hold
 * most of the money still to call in this book. So it keys on its own name,
 * slugged the way the book slugs one (`account:<slug>` → `fund-<slug>`), which
 * is the shape the store accepts. If such a fund one day publishes a NAV its row
 * will key on the securityKey instead, and calls entered under the name will
 * need re-entering — a limit stated here rather than discovered.
 */
const callKeyOf = (fundKey: string, securityKey: string | null) =>
  securityKey ?? fundKey.replace(/^account:/, "fund-");
/** The Transactions tab: what can still be called, then every dated call. */
const CALL_COLS = ["date", "fund", "owner", "label", "amount"] as const;

// PRIVATE MARKET — the private book this drop actually carries, as ONE table.
//
// ── WHAT THIS PAGE IS, AND WHAT IT IS NOT ───────────────────────────────────
//
// It is NOT the fund-of-funds tracker removed at Stage 10f. That page read
// `portfolio.privateMarkets` — six arrays which are all EMPTY in this book — so
// it drew "₹0 invested → ₹0 today" tiles and a deployment bar showing 100%
// undrawn against nothing committed, every one of which reads as a measurement
// when the truth is there was nothing to measure. Nothing here touches those
// arrays or `src/lib/privateValue.ts`.
//
// ── ONE TABLE, BECAUSE IT WAS ALWAYS ONE SET OF FOLIOS ──────────────────────
//
//   *"Why are these two tables separate they need to be in one master table
//    itself … One table that can show me everything that is required to be
//    seen."* — and of the capital calls, *"cant it be a transactions tab in the
//    same table view"*, and of the accounts nothing values, *"this needs to be
//    like a hidden drop down clearly marked"*.
//
// The page drew the private book in five cards: the funds, the capital accounts
// scheme by scheme, the accounts with no value, the funds it did not carry, and
// the calls — plus a timeline. They were five views of ONE set of folios, so
// `src/lib/privateBook.ts` builds that set once and this page draws it once:
//
//   By fund       one row per fund, each holding counted once. A row opens
//                 into its folios IN THE SAME COLUMNS — the standard in
//                 `src/components/TreeTable.tsx`.
//   By owner      the same folios grouped by family member, as printed.
//   Transactions  what can still be called, and every dated call.
//
// and three sections inside the first two: the private funds with a value
// (open), the private accounts with NO value (closed, marked "missing data"),
// and the CAPITAL ACCOUNTS of AIFs that are not private market (closed,
// marked) — only their capital accounts, because those count in the page's
// capital totals; their holdings are listed exposure and are not drawn here.
//
// ── THE AXIS IS THE HOLDING'S OWN MARKET SIDE ───────────────────────────────
//
// `isPrivateClass` — which is `marketSide === "private"`, read from the SEBI
// category the statements print — and never `Account.engagement`. On this book
// keying on engagement would drop three real private holdings and pull in two
// cash sleeves. The Category III folios (Sanshi, Buoyant, Carnelian Bharat
// Amritkaal) are listed exposure — *"These are not private market
// investments"* — so they are in no private total, and none is drawn here
// except where a real drawdown capital account keeps it in the capital totals.
// *"Remove this, please. This is not relevant. These kind of placeholders are
// not relevant."* was said of the card that listed them with their values;
// what stays is a capital account's figures and nothing else.
//
// ── AND THE WHOLE OF THIS BOOK'S DOUBLE COUNT IS PRIVATE ────────────────────
//
// Both duplicated holdings — 360 ONE Special Opportunities under two CRNs, and
// Transition Venture Fund I under both family trusts — are on this page. A fund
// row counts each once; its folios show every statement; a "counted once" line
// between them makes the folios add to the row. By owner is on the printed
// basis and carries the same line at the foot of its section. Both views close
// on the same private total, and `privateBook.test.ts` asserts it.
//
// STATEMENT BASIS THROUGHOUT. A reader checks this page by opening a fund's own
// capital account, which is the Capital Gains / Data Audit / Ledger Insights
// contract — so it reads `statementPortfolio`. The `<BasisPill statement>` was
// removed at the family's request; the SOURCE is the guarantee and it has not
// moved. No private holding resolves an NSE symbol, so no quote could touch
// these rows even on the live portfolio, and `check:pages` asserts that premise.

/**
 * THE THREE TABS OF THE ONE CARD. Each carries its own title and subtitle,
 * because By fund and By owner are on different BASES (counted once, and as
 * printed) and one caption over both would describe neither.
 */
const BOOK_VIEWS = [
  {
    key: "funds", label: "By fund",
    title: "One row per fund, each holding counted once. Click a row for its folios.",
    cardTitle: "Private market — every fund",
    cardSub: "One row per fund, each holding counted once. Click a row to see each family member's folio in the same columns.",
  },
  {
    key: "owners", label: "By owner",
    title: "One row per family member, each statement as printed. Click a row for their folios.",
    cardTitle: "Private market — by family member",
    cardSub: "One row per family member, each statement exactly as printed. Click a row to see their folios.",
  },
  {
    key: "transactions", label: "Transactions",
    title: "What can still be called, and every capital call the funds have made.",
    cardTitle: "Private market — capital calls",
    cardSub: "What the funds can still ask for, and every capital call they have made, newest first.",
  },
] as const;

/** The section bands' own words — what each holds, and the marker a reader sees when it is closed. */
const SECTION_COPY: Record<BookSectionId, { title: string; marker: ReactNode; defaultOpen: boolean }> = {
  private: { title: "Private funds", marker: null, defaultOpen: true },
  unvalued: {
    title: "Not valued",
    marker: <Pill tone="warn" className="whitespace-nowrap">missing data</Pill>,
    defaultOpen: false,
  },
  elsewhere: {
    title: "Not private market",
    marker: <Pill className="whitespace-nowrap">not private market</Pill>,
    defaultOpen: false,
  },
};

/** A row of figures in the shape the accessors read — a group, a section, a total or a folio. */
type RowFigures = Pick<BookFigures, "committed" | "called" | "paid" | "uncalled" | "units" | "cost" | "value" | "returnPct" | "asOf">
  & {
    /** The fund whose entered calls this row's Capital call cell shows — none on a member row or a band. */
    callKey?: string | null;
  };

const folioFigures = (f: BookFolio): RowFigures => ({
  committed: f.capital?.committed ?? null,
  called: f.capital?.called ?? null,
  paid: f.capital?.paid ?? null,
  uncalled: f.capital?.uncalled ?? null,
  units: f.units,
  cost: f.cost,
  value: f.value,
  returnPct: f.cost != null && f.cost > 0 && f.pnl != null ? (f.pnl / f.cost) * 100 : null,
  asOf: f.asOf ? [f.asOf] : [],
});

/** One set of accessors for every row kind, so a column sorts parents and their folios alike. */
const bookAccessors = (
  label: (r: RowFigures & { label?: string }) => string | null,
  callDate: (key: string | null | undefined) => string | null,
): Record<string, Accessor<RowFigures & { label?: string }>> => ({
  name: (r) => label(r),
  committed: (r) => r.committed,
  called: (r) => r.called,
  paid: (r) => r.paid,
  uncalled: (r) => r.uncalled,
  units: (r) => r.units,
  cost: (r) => r.cost,
  value: (r) => r.value,
  return: (r) => r.returnPct,
  // Weight is value ÷ one denominator, so it orders exactly as value does; a
  // second expression of one figure would be a second chance to disagree.
  weight: (r) => r.value,
  asOf: (r) => r.asOf[r.asOf.length - 1] ?? null,
  // The date of the call the cell shows. A row with none sorts last in both
  // directions, like every absent value in this app.
  call: (r) => callDate(r.callKey),
});

/** Why a folio or a fund has no value — the book's own reason where it has one. */
const valueWhy = (status: BookGroup["status"], reason: string | null): string => {
  if (status === "no-nav") return "the fund publishes no NAV — its statement carries units and the capital paid in, and no valuation. Missing data, not a zero.";
  if (status === "income-only") return "income-only folio — its documents report earnings and distributions and no valuation; the units are valued under another account";
  if (status === "redeemed") return "redeemed to nil — every holding on this statement has been paid back, which is a measurement and not a gap";
  return reason ?? "no statement for this account carries a valuation";
};

/** The start of a date range — its year dropped where the end shares it ("30 Jun" → "31 Jul 2026"). */
const rangeStart = (a: string, b: string) =>
  a.slice(0, 4) === b.slice(0, 4) ? fmtDate(a).replace(/\s\d{4}$/, "") : fmtDate(a);

export function PrivateMarket() {
  const { statementPortfolio: portfolio, fmtFromBase } = usePortfolio();
  const [q, setQ] = useState("");
  /**
   * WHICH TAB. In the URL like every other view in this app, so a tab is a link
   * a reader can send and the sweep can hold each one to the light rather than
   * guessing at a click. `useViewParam` keeps the default param-free.
   */
  const [view, setView] = useViewParam(BOOK_VIEWS, {}, "view");
  /** Open fund / member rows, keyed `<grouping>:<key>` so the two tabs keep their own. */
  const rows = useExpanded();
  /** Open sections — the private funds start open, the two marked sections closed. */
  const sections = useExpanded(BOOK_SECTIONS.filter((s) => SECTION_COPY[s].defaultOpen));
  const bookView = useTableView("pm-book", BOOK_COLS);
  const callView = useTableView("pm-calls", CALL_COLS);
  /**
   * THE CALLS THE FAMILY HAS ENTERED, and which row's editor is open. Called up
   * here with the page's other hooks, before any early return — a hook below
   * one runs on some renders and not others.
   */
  const entered = useEnteredCalls();
  const [openCall, setOpenCall] = useState<string | null>(null);
  const today = todayIso();

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  const m = useMemo(() => {
    if (!portfolio) return null;
    const accIdx = accountIndex(portfolio.accounts);
    /**
     * CURRENT HOLDINGS, LIKE EVERY OTHER ALLOCATION SURFACE — and deliberately
     * NOT for `unvaluedAccounts`, which asks whether an account reports any
     * holding at all. Narrowing it would fold 3P's account into the list of
     * funds that publish no NAV, which is the opposite of true: it publishes
     * one and redeemed against it.
     */
    const current = currentHoldings(portfolio.positions);
    const scope = privateScope(current, portfolio.accounts);
    const commitments = portfolio.commitments ?? [];

    const funds = fundRollup(scope.dedupedRows, accIdx, scope.rows);
    const folios = folioRows(scope.rows, accIdx);
    const owners = ownerRollup(scope.rows, accIdx);
    const ct = commitmentTotals(commitments);
    /**
     * THE CAPITAL ACCOUNTS, per scheme — read ONCE and handed to the table, the
     * tiles and the Transactions tab alike, so they cannot describe different
     * registers.
     */
    const schemes = schemeCalls(
      commitments,
      (c) => c.name,
      (c) => (c.ownerId ? ownerDisplayName(c.ownerId) : null),
    );
    const cc = callTotals(schemes);
    const history = callHistory(schemes);
    const unvalued = unvaluedAccounts(portfolio.accounts, portfolio.positions, commitments);

    // CONSOLIDATED — each dedupeGroup once — SUMMED FROM THE FUND ROWS, never
    // struck independently: a total must tie to its own columns.
    const privMV = sum(funds.map((f) => f.mv));
    const privCost = sumOrNull(funds.map((f) => f.cost));
    const privPnL = sumOrNull(funds.map((f) => f.pnl));
    const costedRows = scope.dedupedRows.filter((p) => p.costBasis != null);
    const costedMV = sum(funds.map((f) => f.costedMV));
    const bookMV = consolidatedMarketValue(portfolio.positions);
    // RAW — every statement as printed. Never the same number, by design.
    const rawMV = sum(scope.rows.map((p) => p.marketValue));

    // THE MASTER TABLE, both groupings off one set of folios.
    const all = bookFolios({
      positions: current, allPositions: portfolio.positions, accounts: portfolio.accounts,
      commitments, accIdx, schemes,
    });

    // The as-of spread is derived from the accounts IN SCOPE. `portfolio.asOf` is
    // the book's newest date and NO private holding here is marked at it.
    const dates = [...new Set(scope.accounts.map((a) => a.asOf).filter(Boolean))].sort();

    return {
      scope, funds, folios, owners, ct, unvalued, commitments,
      schemes, cc, history,
      privMV, privCost, privPnL, costedMV, costedCount: costedRows.length, bookMV, rawMV,
      unvaluedDrawn: unvaluedDrawn(unvalued),
      unvaluedNoNav: unvalued.filter((u) => u.kind === "no-nav"),
      dates,
      scopeNote: pageScopeNote(current),
      /**
       * CAPITAL ACCOUNTS OUTSIDE THE PRIVATE SCOPE — measured, never assumed. A
       * drawdown structure is how an account funds itself and not where it
       * invests, so the capital columns cover every capital account while the
       * private total covers the private side. This is the size of the gap.
       */
      capOutside: commitments.filter(
        (c) => c.accountId && !scope.accounts.some((a) => a.accountId === c.accountId),
      ).length,
      byFund: privateBook(all, "fund"),
      byOwner: privateBook(all, "owner"),
    };
  }, [portfolio]);

  if (!portfolio || !m) return null;

  // Nothing private at all — one absent state, no tiles and no empty frames.
  if (!m.scope.rows.length && !m.unvalued.length && !m.commitments.length) {
    return (
      <div>
        <PageHeader eyebrow="Daily" title="Private Market" />
        <AbsentSection
          what="This book reports no private-market holding"
          needs="Every position in it is listed equity, a mutual fund, an ETF or cash. A private holding would arrive as an AIF, Unlisted or Structured Product row from a fund's own statement, or as a capital account from a drawdown fund." />
      </div>
    );
  }

  /**
   * ── THE METRIC CATALOGUE ────────────────────────────────────────────────────
   *
   * Every figure this page can measure, as data rather than as markup, so the
   * picker's option list and the tiles are ONE declaration: a second list of
   * labels beside the tiles would be a second chance for a dropdown to offer a
   * metric the strip cannot draw.
   *
   * ── A TILE IS A LABEL, A FIGURE AND ONE SHORT LINE ─────────────────────────
   *
   *   *"these are action cards. They need to have the major figure and a very
   *    short description, not such long lines. No one will read this on the
   *    dashboard; it needs to be absolutely simple and clear so people can
   *    understand. It should be concise and crisp."*
   *
   * Each tile carried a coverage line and a two-sentence definition, and the
   * labels were long enough to be cut off ("PRIVATE MARKET VAL…", "STILL TO
   * CALL (UNCALLED CAPIT…"). So every label is now short enough to fit, every
   * `sub` is ONE line of a few words saying what the figure IS, and the
   * coverage counts and the working that were paragraphs are `detail` — the
   * tile's own hover. Nothing was deleted to get there: every count and every
   * warning that stood on a tile is in its `detail`, word for word where the
   * sweep reads it, and the working behind the capital-account figures is also
   * printed in full under the table, beside the rows it sums.
   *
   * THE ONE THING A SHORT LINE MUST STILL DO is say what the figure is, so a
   * reader who never hovers is not left guessing: "Promised, not yet called",
   * "Cash sent to funds", "Cash paid back so far". An absent tile's line is its
   * REASON, in a few words, because an em dash must always name its cause.
   *
   * WHAT A HOVER COSTS, stated rather than glossed: it is not read by someone
   * scanning. The two claims on this strip that a reader could be misled by
   * without it — that uncalled capital is a liability in no total, and that
   * Called and Paid in must not be subtracted — are ALSO printed under the
   * table, which is where a reader doing that arithmetic already is.
   */
  const retPct = m.privCost != null && m.privCost > 0 && m.privPnL != null ? (m.privPnL / m.privCost) * 100 : null;
  const share = (a: number, b: number, decimals: number) => (b > 0 ? fmtPct((a / b) * 100, { decimals }) : DASH);
  const absentLine = (why: string) => <span className="text-slate-500">{why}</span>;
  const tileMetrics: TileMetric[] = [
    {
      id: "value", label: "Market value", icon: <Handshake className="h-4 w-4" />,
      value: money(m.privMV),
      sub: `${share(m.privMV, m.bookMV, 1)} of the ${money(m.bookMV)} book`,
      detail: `${money(m.privMV)} ÷ ${money(m.bookMV)} = ${share(m.privMV, m.bookMV, 2)} of the consolidated book. `
        + `Across this page's ${m.scope.accounts.length} private accounts · each holding counted once.`,
    },
    {
      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,
      value: money(m.privCost),
      sub: "Cost of these holdings",
      detail: `The cost these statements report · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one.`,
    },
    {
      id: "pnl", label: "Unrealised P&L", icon: <TrendingUp className="h-4 w-4" />,
      value: <span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>,
      sub: retPct == null ? absentLine("No cost to measure against") : `${fmtPct(retPct, { sign: true, decimals: 1 })} on cost`,
      detail: m.privCost != null && m.privCost > 0
        ? `On the ${money(m.privCost)} these statements report as cost, covering ${money(m.costedMV)} of the ${money(m.privMV)} market value.`
        : "No statement here reports a cost to measure a gain against.",
    },
    /* *"How are you calculating this uncalled capital of 16 crores? …
        Something seems amiss here."* — the arithmetic ties two ways (see the
        working line under the scheme table) and the figure is a FLOOR: it
        covers only the capital accounts this book has a statement for. Both
        halves ride in the hover now, and the floor is also stated under the
        scheme table, which is where a reader checking the figure already is. */
    {
      id: "uncalled", label: "Still to call", icon: <Fuel className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.ct.undrawn)}</span>,
      sub: "Promised, not yet called",
      /**
       * TWO COUNTS FROM TWO SETS, AND THE WORDING MUST NOT MAKE ONE A FRACTION
       * OF THE OTHER: three of the capital accounts belong to funds that are not
       * private market, so "15 of this page's 18" would be a fraction that does
       * not exist. Stage 10bp's fix, kept in the hover.
       */
      detail: "Money promised to these funds that they have not yet asked for — a bill that can arrive any day, "
        + "not an asset, and never added to a value on this page. "
        + `Across ${m.ct.count} capital accounts`
        + (m.capOutside > 0 ? `, ${m.capOutside} of them in funds that are not private market` : "")
        + ". A fund whose capital account nobody sent contributes nothing, so this is a floor.",
    },
    /* ── COMMITTED vs CALLED vs PAID IN — three figures, not two ─────────────
        *"Capital committed, or is it capital invested? … I would commit 10
         crores, but I may have only invested so far 5 crores."* Each is read
        off the line its own statement labels, and each short line says which
        of the three it is in the client's own words. */
    {
      id: "committed", label: "Committed", icon: <Landmark className="h-4 w-4" />,
      value: money(m.ct.committed),
      sub: "Total promised to funds",
      detail: `${m.ct.committedOf} of ${m.ct.count} capital accounts. The full amount signed for, whether or not the fund has asked for it yet — not money spent, and in no market value on this page.`,
    },
    {
      id: "called", label: "Called", icon: <Banknote className="h-4 w-4" />,
      value: m.cc.called == null ? <AbsentValue /> : money(m.cc.called),
      sub: m.cc.called == null ? absentLine("No statement prints it") : "Asked for so far",
      detail: `${m.cc.calledOf} of ${m.cc.count} capital accounts print a called line. It covers a different set of accounts from Paid in, so the two must never be subtracted.`,
    },
    {
      id: "paid", label: "Paid in", icon: <Wallet className="h-4 w-4" />,
      value: m.cc.paid == null ? <AbsentValue /> : money(m.cc.paid),
      sub: m.cc.paid == null ? absentLine("No statement prints it") : "Cash sent to funds",
      detail: `${m.cc.paidOf} of ${m.cc.count} capital accounts · cash that has actually left the family's bank. Not the same set as Capital invested, which is the cost of the holdings in the table below.`,
    },
    {
      id: "due", label: "Due now", icon: <CalendarClock className="h-4 w-4" />,
      value: m.cc.dueNow == null ? <AbsentValue /> : <span className={m.cc.dueNow > 0 ? "text-amber-400" : undefined}>{money(m.cc.dueNow)}</span>,
      sub: m.cc.dueNowOf === 0 ? absentLine("No statement prints it") : "Called, not yet paid",
      detail: m.cc.dueNowOf === 0
        ? "No statement here prints a called-but-unpaid line."
        : `${m.cc.dueNowOf} of ${m.cc.count} accounts print this line · a measured figure, not an assumption. The rest are skipped, never counted as nil.`,
    },
    /* Real money, paid, and in NO total on this page: adding drawn capital to
        a market value reports what was paid as what the stake is worth. */
    {
      id: "unvalued", label: "Never valued", icon: <HelpCircle className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.unvaluedDrawn)}</span>,
      sub: "Paid into funds with no NAV",
      detail: `${m.unvaluedNoNav.length} folios in funds that publish no NAV at all. Real money, not in Market value, and in no total on this page.`,
    },
    /* *"what is distributions?"* — the label is the client's own word and the
        short line under it is the answer. */
    {
      id: "distributed", label: "Distributions", icon: <Coins className="h-4 w-4" />,
      value: money(m.ct.distributed),
      sub: "Cash paid back so far",
      detail: `${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure. Not part of the value above, and it does not reduce what a fund can still call.`,
    },
    /* ── THE TWO THAT ARE ABSENT BY MEASUREMENT ──────────────────────────────
        Offered like every other metric: the answer to both is a fact about this
        corpus rather than a gap in the picker. The short line is the REASON,
        and the full reason and what would fill it is the hover. */
    {
      id: "realised", label: "Realised gain", icon: <Coins className="h-4 w-4" />,
      value: <AbsentValue />,
      sub: absentLine("No statement reports it"),
      detail: "No capital gain statement covers any private account in this drop. Every AIF-engagement account carries that absence verbatim in the book's capital-gain record. Their redemptions are real; what they realised was never reported to this book, so it is absent rather than nil.",
    },
    {
      id: "multiple", label: "TVPI / DPI", icon: <Handshake className="h-4 w-4" />,
      value: <AbsentValue />,
      sub: absentLine("Too few distribution figures"),
      detail: `Only ${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure. A multiple divides what has come back plus what is still inside by what went in; ${m.ct.count - m.ct.distributedOf} of these ${m.ct.count} accounts print no distribution line at all, and reading those as nil would report a fund that has returned nothing when its statement simply does not say.`,
    },
    /* Counts of sets this page already draws, so none is a new measurement. */
    {
      id: "funds", label: "Funds", icon: <Handshake className="h-4 w-4" />,
      value: fmtNum(m.funds.length),
      sub: "Distinct funds held",
      detail: "Each fund counted once however many members hold it.",
    },
    {
      id: "folios", label: "Folios", icon: <Layers className="h-4 w-4" />,
      value: fmtNum(m.folios.length),
      sub: "Statement lines",
      detail: `One per statement line — ${m.folios.length - m.funds.length} more than the fund count, because a fund held in several folios is one fund row.`,
    },
    {
      id: "owners", label: "Owners", icon: <Users className="h-4 w-4" />,
      value: fmtNum(m.owners.length),
      sub: "Members and trusts",
      detail: "Family members and trusts holding something private.",
    },
    {
      id: "accounts", label: "Capital accounts", icon: <Landmark className="h-4 w-4" />,
      value: fmtNum(m.ct.count),
      sub: "Drawdown statements",
      /**
       * THE SAME CROSSED FRACTION THE UNCALLED TILE WAS FIXED FOR: three of
       * these capital accounts belong to funds that are not private market, so the
       * two counts PARTITION the tile's own figure — the only form in which both
       * can be printed together.
       */
      detail: `${m.ct.count - m.capOutside} of this page's ${m.scope.accounts.length} private accounts send one`
        + (m.capOutside > 0 ? ` · ${m.capOutside} more come from funds that are not private market` : "")
        + ". A capital account is the statement that prints a commitment and what has been called against it.",
    },
    {
      id: "calls", label: "Capital calls", icon: <CalendarClock className="h-4 w-4" />,
      value: fmtNum(m.cc.callCount),
      sub: "Dated calls so far",
      detail: `Across ${m.ct.count} capital accounts, every one reconciled against its own statement's printed total.`,
    },
    /* THE RAW TOTAL, and it never appears without its own double count named. */
    {
      id: "raw", label: "Value as printed", icon: <Layers className="h-4 w-4" />,
      value: money(m.rawMV),
      sub: `Includes ${money(m.scope.doubleCounted)} double count`,
      detail: `Every statement as printed. ${money(m.scope.doubleCounted)} of it is two holdings reported under two members each; Market value counts each once.`,
    },
  ];

  const active = BOOK_VIEWS.find((v) => v.key === view)!;
  const book: PrivateBook = view === "owners" ? m.byOwner : m.byFund;
  const grouping = book.grouping;
  const needle = q.trim().toLowerCase();
  const folioText = (f: BookFolio) => [f.owner, f.fundName, f.provider, f.accountNo].join(" ").toLowerCase();
  const groupMatches = (g: BookGroup) => !needle || g.label.toLowerCase().includes(needle) || g.folios.some((f) => folioText(f).includes(needle));
  const rowKey = (g: BookGroup) => `${grouping}:${g.key}`;
  const allGroups = BOOK_SECTIONS.flatMap((s) => book.sections[s].groups);
  /** A search opens what it found, so a match inside a closed section is not hidden by the section. */
  const sectionOpen = (s: BookSectionId) => sections.isOpen(s) || (!!needle && book.sections[s].groups.some(groupMatches));
  const allOpen = BOOK_SECTIONS.every((s) => sections.isOpen(s)) && allGroups.every((g) => rows.isOpen(rowKey(g)));
  const toggleAll = () => {
    if (allOpen) {
      rows.setMany(allGroups.map(rowKey), false);
      sections.setMany(BOOK_SECTIONS.filter((s) => !SECTION_COPY[s].defaultOpen), false);
    } else {
      rows.setMany(allGroups.map(rowKey), true);
      sections.setMany(BOOK_SECTIONS, true);
    }
  };
  /** The date of the call a fund's cell shows, for the sort — null where none is entered or the store is not read. */
  const callDate = (key: string | null | undefined) =>
    key && entered.state.status === "ready" ? headlineCall(entered.state.calls, key, today)?.call.date ?? null : null;
  const nameAcc = bookAccessors((r) => r.label ?? null, callDate);
  /** A FUND row's call key. A member row is not a fund, so it has none. */
  const groupCallKey = (g: BookGroup) => (g.kind === "fund" ? callKeyOf(g.key, g.securityKey) : null);
  const folioCallKey = (f: BookFolio) => callKeyOf(f.fundKey, f.securityKey);
  /**
   * ── THE CAPITAL CALL CELL, AND THE EDITOR IT OPENS ─────────────────────────
   *
   * *"it simply needs to be a editable coloumn in this table itself which people
   *  can add and edit capital call and save and it stays same for all."*
   *
   * ONE CELL PER FUND, and on the FUND level of whichever grouping is drawn: By
   * fund it is the fund row itself, By owner it is each member's line in a fund.
   * A member is not a fund and a band is not one either, so those carry none —
   * the same tree rule the other columns follow, where a figure sits on the
   * level it describes. Every fund row gets one, in every section, and that is
   * what closes the gap the column shipped with: a fund NO statement values
   * (India SME, Sky Capital) used to have no row to type a call against, and
   * India SME holds most of the money still to call in this book.
   */
  const callCell = (rowId: string, fund: string, fundName: string) => (
    <td key="call" data-col-cell="call" data-pm-call-cell={fund} className="px-2 py-1.5 whitespace-nowrap">
      <CallCell fund={fund} fundName={fundName} state={entered.state} today={today}
        open={openCall === rowId} money={money}
        onToggle={() => setOpenCall((cur) => (cur === rowId ? null : rowId))} />
    </td>
  );
  /** The editor, as a row under the one that opened it — never a floating panel the table's scroll could clip. */
  const callEditorRow = (rowId: string, fund: string, fundName: string) => openCall === rowId && (
    <tr key={`${rowId}-editor`} className="bg-ink-900/60" data-pm-call-editor={fund}>
      <td colSpan={bookView.order.length} className="px-3 pb-3 pt-1">
        <CallEditor fund={fund} fundName={fundName} state={entered.state} money={money}
          onSave={entered.save} onDelete={entered.remove} onClose={() => setOpenCall(null)} />
      </td>
    </tr>
  );
  const pct = (v: number | null) => (v == null || !(book.privateValue > 0) ? null : (v / book.privateValue) * 100);

  // ── THE CELLS, ONE WRITER FOR EVERY ROW KIND ────────────────────────────────
  //
  // Every row of the master table writes its ten figure cells here, keyed by
  // column, so a section band, a fund, a folio and a total cannot put one
  // figure under two headings. `kind` decides only the weight of the type and
  // what an absent cell SAYS — never which column a figure lands in.
  type CellKind = "group" | "folio" | "section" | "total" | "capital";
  type Cells = Partial<Record<(typeof BOOK_COLS)[number], ReactNode>>;
  const pad = (k: CellKind) => (k === "folio" ? "px-2 py-1.5" : k === "section" ? "px-2 py-2" : "px-2 py-2.5");
  const tone = (k: CellKind) => (k === "total" || k === "capital" ? "font-semibold text-slate-100"
    : k === "section" ? "font-medium text-slate-300" : k === "folio" ? "text-slate-300" : "text-slate-200");
  /**
   * "14 of 15 accounts" — on a band or a total, where a figure covers fewer
   * capital accounts than the row holds. ON ITS OWN LINE under the figure, so
   * the column is as wide as the figure and not as wide as the caveat.
   */
  const covered = (n: number, of: number, k: CellKind) =>
    (k === "total" || k === "section" || k === "capital") && of > 0 && n < of
      ? <div className="text-[10px] font-normal leading-tight text-slate-500" data-covered={`${n}/${of}`}>{n} of {of} accounts</div>
      : null;

  const figureCells = (r: RowFigures & Partial<BookFigures>, k: CellKind, ctx: {
    /** Why the row carries no capital account at all. Absent means it carries one. */
    noCapital?: string;
    /** Why there is no value. */
    noValue?: string;
    /** Why there is no holding (units / cost). */
    noHolding?: string;
    /** `undefined` leaves the cell empty; `null` is an absence with `weightWhy`. */
    weight?: number | null;
    weightWhy?: string;
    stale?: number | null;
    ties?: boolean | null;
    implied?: number | null;
    /**
     * A ROW THAT CARRIES ONLY ITS CAPITAL ACCOUNT — an AIF that is not private
     * market. Its holding columns stay EMPTY rather than dashed: the model does
     * not carry the holding at all, so there is nothing absent to explain on the
     * row, and the band above it says why in one line.
     */
    capitalOnly?: boolean;
    /**
     * A MEASURED NIL — the account was redeemed and its statement's balance is
     * nothing. It renders ₹0 with the word beside it, never the dash an absent
     * value gets: the two must never look the same. Carried in the words rather
     * than in the figure, so it is never summed into a band where the other
     * rows are genuinely unvalued and a ₹0 total would claim they were nil too.
     */
    nil?: string;
  }): Cells => {
    const p = pad(k);
    const t = tone(k);
    const holdingRow = k === "group" || k === "folio";
    const td = (col: string, body: ReactNode, extra = "") => (
      <td key={col} data-col-cell={col} className={`${p} whitespace-nowrap text-right mono ${t} ${extra}`}>{body}</td>
    );
    const absent = (col: string, why: string) => td(col, <AbsentCell reason={why} />);
    const cap = (col: string, v: number | null | undefined, why: string, of?: [number, number]) =>
      ctx.noCapital ? absent(col, ctx.noCapital)
        : v == null ? absent(col, why)
          : td(col, <>{money(v)}{of && covered(of[0], of[1], k)}</>);
    const out: Cells = {
      committed: cap("committed", r.committed, "no commitment on this statement"),
      called: cap("called", r.called,
        "this statement prints a contribution column and no called line, so what the fund has demanded is not stated — reading the contribution as the call would assert the two are equal",
        [r.calledOf ?? 0, r.capitalAccounts ?? 0]),
      paid: cap("paid", r.paid, "this statement reports no contribution figure", [r.paidOf ?? 0, r.capitalAccounts ?? 0]),
      uncalled: ctx.noCapital ? absent("uncalled", ctx.noCapital)
        : r.uncalled == null
          ? absent("uncalled", ctx.implied != null
            ? `this statement prints no uncalled line. Its own committed − called comes to ${fmtNum(ctx.implied, 0)}, shown here as arithmetic rather than as the fund's figure.`
            : "this statement prints no uncalled line — a zero here would assert the fund has nothing left to call")
          : td("uncalled", <>
            {r.uncalled === 0
              ? <span className="text-slate-400" title="fully called — the statement prints nil still to call">{money(0)}</span>
              : <span className="text-amber-400">{money(r.uncalled)}</span>}
            {ctx.ties === true && <span className="ml-1 text-[10px] text-gain" title="checked: committed − called = still to call, to the rupee, on this statement" data-ties="true">✓</span>}
            {ctx.ties === false && <span className="ml-1 text-[10px] text-amber-400" title="the statement disagrees with itself: committed − called ≠ the still-to-call it prints" data-ties="false">≠</span>}
            {covered(r.uncalledOf ?? 0, r.capitalAccounts ?? 0, k)}
          </>),
    };
    // A capital-only total says nothing about holdings: those columns are left
    // for `TrFoot` to fill, which is what a total with no figure in a column is.
    if (k === "capital") return out;
    const asOfCell = () => {
      const first = r.asOf[0], last = r.asOf[r.asOf.length - 1];
      return (
        <td key="asOf" data-col-cell="asOf" data-as-of={r.asOf.join(" ") || undefined} className={`${p} whitespace-nowrap text-slate-400`}>
          {r.asOf.length === 0 ? <AbsentCell reason="this account states no report date" />
            : r.asOf.length === 1 ? fmtDate(first)
              // A RANGE IS TWO DATES, AND IT SAYS SO: the folios behind this row
              // are marked on different statement dates, and one date here would
              // present a blend as one clean as-of.
              : <><div>{rangeStart(first, last)} →</div><div>{fmtDate(last)}</div></>}
          {(ctx.stale ?? 0) > 31 && <div className="text-[10.5px] text-amber-400">{ctx.stale}d behind</div>}
        </td>
      );
    };
    // The capital account's own statement date is still its date.
    if (ctx.capitalOnly) {
      out.asOf = asOfCell();
      return out;
    }
    // A band or a total spans several funds, and a unit of one fund is not a
    // unit of another: the cell says so rather than sitting blank.
    out.units = r.units != null ? td("units", fmtNum(r.units, 3), "text-slate-400")
      : absent("units", holdingRow
        ? ctx.noHolding ?? "units of different funds do not add up, so a member's row carries none"
        : "units of different funds are not the same unit, so a band or a total carries none");
    out.cost = r.cost != null ? td("cost", money(r.cost))
      : absent("cost", ctx.noHolding ?? "this statement reports a value and no cost — a depository holds the units, it did not buy them, and a zero cost would report the whole value as profit");
    out.value = r.value != null ? td("value", money(r.value), k === "folio" ? "text-slate-200" : "text-slate-100")
      : ctx.nil ? td("value", <span title={ctx.nil} data-pm-nil>{money(0)} <span className="text-[10px] font-normal text-slate-500">redeemed</span></span>, "text-slate-400")
        : absent("value", ctx.noValue ?? "no statement here carries a valuation");
    out.return = r.returnPct != null
      ? td("return", <span className={changeColor(r.returnPct)}>{fmtPct(r.returnPct, { sign: true, decimals: 1 })}</span>)
      : absent("return", r.value == null ? "no value to strike a return on"
        : r.cost == null ? "no cost is reported, so there is no capital to strike a return against"
          : "the cost reported here covers only part of this row's value, and a percentage across the two would divide one set of holdings by another");
    if (ctx.weight !== undefined) {
      out.weight = ctx.weight == null ? absent("weight", ctx.weightWhy ?? "no value to weigh")
        : td("weight", `${ctx.weight.toFixed(1)}%`, "text-slate-400");
    }
    if (holdingRow || k === "section") out.asOf = asOfCell();
    return out;
  };
  /** A row's cells in the DECLARED order `<Tr>` expects, an empty cell where a column has none. */
  const inOrder = (c: Cells, k: CellKind) =>
    BOOK_COLS.slice(1).map((col) => c[col] ?? <td key={col} className={pad(k)} />);

  /** The words under a fund's or a member's name: what it is, never a figure another column holds. */
  const groupSub = (g: BookGroup): ReactNode => {
    const bits: ReactNode[] = [];
    if (g.kind === "fund" && g.category) bits.push(g.category);
    bits.push(`${g.folios.length} ${g.folios.length === 1 ? "folio" : "folios"}`);
    if (g.calls > 0) bits.push(`${g.calls} ${g.calls === 1 ? "call" : "calls"}`);
    if (g.overlap) bits.push(<span key="ov" className="text-amber-400">reported twice · counted once</span>);
    if (g.status === "no-nav") bits.push(<span key="st" className="text-amber-400">no NAV published</span>);
    if (g.status === "income-only") bits.push("income-only folios");
    if (g.status === "redeemed") bits.push("redeemed to nil");
    return bits.map((b, i) => <Fragment key={i}>{i > 0 && " · "}{b}</Fragment>);
  };

  const noCapitalWhy = (section: BookSectionId, kind: "group" | "folio") =>
    kind === "folio"
      ? "this account sends no capital-account statement — it reports the holding without a commitment"
      : section === "elsewhere" || section === "private"
        ? "no folio of this fund sends a capital-account statement — the holding is reported without a commitment"
        : "no capital-account statement for these folios";

  const weightWhy = (section: BookSectionId) => section === "elsewhere"
    ? "not part of the private market value — this column is a share of that one figure"
    : "no value to weigh — a share of the private market value needs a value";

  /** A fund or member row, its folios when open, and its "counted once" line. */
  const renderGroup = (g: BookGroup) => {
    const key = rowKey(g);
    const open = rows.isOpen(key) || (!!needle && !g.label.toLowerCase().includes(needle) && g.folios.some((f) => folioText(f).includes(needle)));
    const toggle = () => rows.toggle(key);
    const inPrivate = g.section === "private";
    const kids = sortRows(
      g.folios.map((f) => ({
        f, label: grouping === "fund" ? f.owner : f.fundName,
        fig: { ...folioFigures(f), callKey: grouping === "owner" ? folioCallKey(f) : null },
      })),
      bookView.sort,
      Object.fromEntries(Object.entries(nameAcc).map(([c, a]) => [c, (x: { fig: RowFigures; label: string }) => a({ ...x.fig, label: x.label })])),
    );
    const scheme = (f: BookFolio) => f.capital;
    const capitalOnly = g.section === "elsewhere";
    const fundCall = groupCallKey(g);
    const fundRowId = `fund:${g.key}`;
    return (
      <Fragment key={key}>
        <Tr view={bookView} className={TREE_ROW.parent} {...rowToggle(toggle)}
          data-pm-group={g.key} data-pm-kind={g.kind} data-pm-row-section={g.section}
          {...(g.kind === "fund" ? { "data-pm-fund": g.key } : { "data-pm-owner": g.key })}
          data-pm-folios={g.folios.length} data-pm-value={g.value ?? undefined}
          data-pm-cost-absent={g.cost == null ? "" : undefined} data-pm-return-absent={g.returnPct == null ? "" : undefined}
          data-pm-committed={g.committed ?? undefined} data-pm-uncalled={g.uncalled ?? undefined}>
          <TreeNameCell depth={0} open={open} onToggle={toggle}
            toggleLabel={open ? "Hide the folios behind this row" : `Show the ${g.folios.length} ${g.folios.length === 1 ? "folio" : "folios"} behind this row`}
            toggleData={{ "data-pm-folio-toggle": g.key, "data-pm-folio-rows": g.folios.length, "data-pm-folio-gap": Math.round(g.overlap?.value ?? 0) }}
            title={<>
              {g.label}
              {/* THE FUND'S OWN PAGE, as its own small link — the row itself
                  opens the folios, so the name is not a second click target. */}
              {g.securityKey && (
                <Link to={stockHref(g.securityKey)} title={`${g.label} — open its page`} data-no-row-toggle
                  className="ml-1.5 inline-flex align-[-2px] text-slate-500 transition-colors hover:text-champagne-400">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </>}
            sub={groupSub(g)} />
          {inOrder({
            ...figureCells(g, "group", {
            capitalOnly,
            noCapital: g.capitalAccounts === 0 ? noCapitalWhy(g.section, "group") : undefined,
            noValue: valueWhy(g.status, g.folios[0]?.reason ?? null),
            nil: g.status === "redeemed" ? valueWhy("redeemed", null) : undefined,
            noHolding: g.holdings === 0 ? "no valued holding on these statements" : undefined,
            weight: inPrivate ? pct(g.value) : null,
            weightWhy: weightWhy(g.section),
            stale: g.staleDays,
            ties: g.ties,
            }),
            ...(fundCall ? { call: callCell(fundRowId, fundCall, g.label) } : {}),
          }, "group")}
        </Tr>
        {fundCall && callEditorRow(fundRowId, fundCall, g.label)}
        {open && kids.map(({ f, fig }, i) => {
          const s = scheme(f);
          // BY OWNER the folio is the fund level, so the call cell is here.
          const folioCall = grouping === "owner" ? folioCallKey(f) : null;
          const folioRowId = `owner:${g.key}:${f.key}`;
          return (
            <Fragment key={f.key}>
            <Tr view={bookView} className={TREE_ROW.child}
              data-pm-folio-row={g.key} data-pm-row-section={g.section} data-account={f.accountId}
              data-pm-value={f.value ?? undefined} data-pm-counted={f.counted ? "" : undefined}
              data-calls={s ? s.calls.length : undefined}>
              <TreeNameCell depth={1} last={i === kids.length - 1 && !(grouping === "fund" && g.overlap)}
                title={grouping === "fund" ? f.owner : f.fundName}
                sub={<>
                  {f.provider} {f.accountNo}
                  {s && s.calls.length > 0 && <> · {s.calls.length} {s.calls.length === 1 ? "call" : "calls"}</>}
                  {/* ONE HOLDING ON TWO STATEMENTS — said on the line, in the
                      colour the "Counted once" row below it uses, rather than
                      as a chip that doubles the row's height. */}
                  {f.alsoCount > 1 && (
                    <> · <span className="text-amber-400" data-pm-also={f.alsoReportedUnder.join(",")}>
                      also reported under {f.alsoReportedUnder.map(ownerDisplayName).join(", ") || "another account"}
                    </span></>
                  )}
                </>} />
              {inOrder({
                ...figureCells(fig, "folio", {
                capitalOnly,
                noCapital: s ? undefined : noCapitalWhy(g.section, "folio"),
                noValue: valueWhy(f.status, f.reason),
                nil: f.status === "redeemed" ? valueWhy("redeemed", null) : undefined,
                noHolding: f.position ? undefined : "no valued holding on this statement",
                weight: inPrivate ? pct(f.value) : null,
                weightWhy: weightWhy(g.section),
                stale: s?.staleDays ?? null,
                ties: s?.uncalledTies ?? null,
                implied: s?.impliedUncalled ?? null,
                }),
                ...(folioCall ? { call: callCell(folioRowId, folioCall, f.fundName) } : {}),
              }, "folio")}
            </Tr>
            {folioCall && callEditorRow(folioRowId, folioCall, f.fundName)}
            </Fragment>
          );
        })}
        {open && grouping === "fund" && g.overlap && overlapRow(g.overlap, g.key, g.overlap.statements, inPrivate)}
      </Fragment>
    );
  };

  /**
   * THE "COUNTED ONCE" LINE — the arithmetic that makes the lines above add to
   * the row. In the columns it adjusts and empty in the ones it does not: the
   * capital accounts are separate statements and are never deduped.
   */
  const overlapRow = (o: Overlap, key: string, statements: number, weigh: boolean) => (
    <Tr view={bookView} key={`${key}-overlap`} className={TREE_ROW.adjust}
      data-pm-overlap={key} data-printed={Math.round(o.printed)} data-consolidated={Math.round(o.consolidated)} data-overlap={Math.round(o.value)}>
      <TreeNameCell depth={1} last
        title={<span className="text-amber-400">Counted once</span>}
        sub={grouping === "fund"
          ? `the same holding is reported on ${statements} statements; the row above counts it once`
          : `${statements} statements report 2 holdings twice between them; the total counts each once`} />
      <td key="committed" className={pad("folio")} />
      <td key="called" className={pad("folio")} />
      <td key="paid" className={pad("folio")} />
      <td key="uncalled" className={pad("folio")} />
      <td key="units" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>{o.units != null ? `−${fmtNum(o.units, 3)}` : ""}</td>
      <td key="cost" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>{o.cost != null ? `−${money(o.cost)}` : ""}</td>
      <td key="value" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`} data-col-cell="value">−{money(o.value)}</td>
      <td key="return" className={pad("folio")} />
      <td key="weight" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>{weigh && pct(o.value) != null ? `−${pct(o.value)!.toFixed(1)}%` : ""}</td>
      <td key="asOf" className={pad("folio")} />
      <td key="call" className={pad("folio")} />
    </Tr>
  );

  /** A section band — heading, marker, and the section's own totals in their columns. */
  const renderSection = (id: BookSectionId) => {
    const s = book.sections[id];
    if (!s.groups.length) return null;
    const copy = SECTION_COPY[id];
    /**
     * EVERY ROW HERE IS AN AIF BY CONSTRUCTION — `sectionOf` files a Category III
     * AIF or one printing no category — so the band can say so in two words. It
     * is checked rather than assumed, and falls back to the general words the
     * day a drop files anything else here.
     */
    // `category` is set on an AIF's folio and on nothing else, and it survives
    // the holding being dropped from this section — which `position` does not.
    const title = id === "elsewhere" && s.groups.every((g) => g.folios.every((f) => f.category != null))
      ? "Other AIFs" : copy.title;
    const open = sectionOpen(id);
    const shown = sortRows(s.groups.filter(groupMatches), bookView.sort, nameAcc as Record<string, Accessor<BookGroup>>);
    const noun = grouping === "fund" ? (s.groups.length === 1 ? "fund" : "funds") : (s.groups.length === 1 ? "member" : "members");
    const sub = id === "private"
      ? `${s.groups.length} ${noun} · ${s.folios} folios · ${grouping === "fund" ? "each holding counted once" : "each statement as printed"}`
      : id === "unvalued"
        ? `${s.groups.length} ${noun} · ${s.folios} folios · the statements carry no value, so ${money(s.paid)} paid in is in no value total`
        : `${s.groups.length} ${noun} · capital accounts only — ${s.groups.length === 1 && grouping === "fund" ? "this fund holds" : "these funds hold"} listed shares or print no category, so the holdings are on the Portfolio Monitor and in no private total`;
    return (
      <Fragment key={id}>
        <Tr view={bookView} className={`${TREE_ROW.section} ${id === "private" ? "" : "cursor-pointer"}`}
          {...(id === "private" ? {} : rowToggle(() => sections.toggle(id)))}
          data-pm-section={id} data-pm-section-funds={s.groups.length} data-pm-section-folios={s.folios}
          data-pm-section-open={open ? "true" : "false"}>
          <TreeSectionCell title={title} marker={copy.marker && <span data-pm-marker={id}>{copy.marker}</span>} sub={sub}
            open={open} onToggle={() => sections.toggle(id)}
            toggleData={{ "data-pm-section-toggle": id }} />
          {inOrder(figureCells(s, "section", {
            capitalOnly: id === "elsewhere",
            noCapital: s.capitalAccounts === 0 ? "no capital account in this section" : undefined,
            noValue: id === "unvalued" ? "nothing in this section is valued — missing data, never a zero" : "no value",
            noHolding: id === "unvalued" ? "no valued holding in this section" : undefined,
            weight: id === "private" ? pct(s.value) : null,
            weightWhy: weightWhy(id),
          }), "section")}
        </Tr>
        {open && shown.map(renderGroup)}
        {open && grouping === "owner" && s.overlap && overlapRow(s.overlap, `section-${id}`, s.overlap.statements, id === "private")}
      </Fragment>
    );
  };

  /** A total row, drawn with `TrFoot` so its label span follows the reader's column order. */
  const totalRow = (key: "private" | "capital", fig: BookFigures, label: ReactNode, capitalOnly: boolean) => (
    <TrFoot view={bookView} key={key} data-pm-total={key}
      className={`${TREE_ROW.total} border-t-2 border-ink-600 ${TREE_CELL.parent} font-semibold text-slate-200`}
      label={label}
      cells={figureCells(fig, capitalOnly ? "capital" : "total", {
        noCapital: fig.capitalAccounts === 0 ? "no capital account on this page" : undefined,
        noValue: "no value",
        weight: capitalOnly ? undefined : 100,
      }) as Record<string, ReactNode>} />
  );

  // ── THE TRANSACTIONS TAB ─────────────────────────────────────────────────────
  const callsShown = sortRows(
    m.history.filter((c) => !needle || [c.fund, c.owner ?? "", c.label ?? ""].join(" ").toLowerCase().includes(needle)),
    callView.sort,
    {
      date: (c) => c.date,
      fund: (c) => c.fund,
      owner: (c) => c.owner ?? null,
      label: (c) => c.label ?? null,
      amount: (c) => c.amount,
    },
  );
  const tabs = (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
      role="tablist" aria-label="What the private market table shows">
      {BOOK_VIEWS.map((v) => (
        <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
          data-pm-view={v.key} title={v.title}
          onClick={() => setView(v.key)}
          className={["whitespace-nowrap rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors",
            view === v.key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
          {v.label}
          {v.key === "transactions" && <span data-pm-view-count={m.history.length} className={view === v.key ? "ml-1 opacity-70" : "ml-1 text-slate-500"}>{m.history.length}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="Daily" title="Private Market" />

      {/* THE DATE SPREAD, DERIVED — never `portfolio.asOf`, which is newer than
          every mark on this page. */}
      {m.dates.length > 0 && (
        <p className="mb-4 text-[11.5px] text-slate-500">
          Marks span <span className="text-slate-300">{fmtDate(m.dates[0])}</span>
          {m.dates.length > 1 && <> → <span className="text-slate-300">{fmtDate(m.dates[m.dates.length - 1])}</span></>}
          . Each fund is valued on its own statement's date, shown on every row below.
        </p>
      )}

      <SelectableTiles storageKey={PM_TILES_KEY} defaults={PM_DEFAULT_TILES} metrics={tileMetrics} />

      {/* ── THE ONE TABLE ────────────────────────────────────────────────────
          Three tabs of one card. The first two are the same folios grouped two
          ways, in the same columns; the third is the dated record. See the note
          at the top of this file for what each section holds and why two of
          them start closed. */}
      <Card className="mt-5" pad={false} title={active.cardTitle} subtitle={active.cardSub}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <SearchInput value={q} onChange={setQ}
              placeholder={view === "transactions" ? "Search calls…" : view === "owners" ? "Search members or funds…" : "Search funds or members…"}
              className="w-56"
              suggestions={view === "transactions"
                ? [...new Set(m.history.map((c) => c.fund))]
                : allGroups.map((g) => g.label)} />
            {view !== "transactions" && <ExpandAllButton allOpen={allOpen} onClick={toggleAll} />}
          </div>
        }>

        {view !== "transactions" && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]" data-pm-table={view}>
              <thead className="border-b border-ink-700">
                <Tr view={bookView}>
                  <SortHeader col="name" view={bookView} align="left" className="min-w-[15rem]">{grouping === "fund" ? "Fund" : "Family member"}</SortHeader>
                  <SortHeader col="committed" view={bookView} pad="px-2 py-2" note="promised"
                    title="What the family signed up to invest, whether or not the fund has asked for it yet.">Committed</SortHeader>
                  <SortHeader col="called" view={bookView} pad="px-2 py-2" note="asked for"
                    title="What the fund has demanded so far, off the line its own statement labels.">Called</SortHeader>
                  <SortHeader col="paid" view={bookView} pad="px-2 py-2" note="cash sent"
                    title="Cash that has actually left the family's bank for this fund — its capital account.">Paid in</SortHeader>
                  <SortHeader col="uncalled" view={bookView} pad="px-2 py-2" note="not yet asked"
                    title="Promised and not yet asked for, exactly as the fund prints it — never worked out as committed − called. A bill that can arrive any day, never added to a value.">Still to<br />call</SortHeader>
                  <SortHeader col="units" view={bookView} pad="px-2 py-2">Units</SortHeader>
                  <SortHeader col="cost" view={bookView} pad="px-2 py-2" note="of units held"
                    title="What the units held cost, off the holding statement — a different document from the capital account's Paid in.">Cost</SortHeader>
                  <SortHeader col="value" view={bookView} pad="px-2 py-2" note="fund's mark"
                    title="What the holding is worth on the fund's own statement date.">Value</SortHeader>
                  <SortHeader col="return" view={bookView} pad="px-2 py-2" note="on cost">Return</SortHeader>
                  <SortHeader col="weight" view={bookView} pad="px-2 py-2" note="of private"
                    title="The row's value as a share of the private market value — the same denominator on every row.">Weight</SortHeader>
                  <SortHeader col="asOf" view={bookView} pad="px-2 py-2" align="left">As of</SortHeader>
                  {/* THE COLUMN THAT REPLACED THE CAPITAL-CALL TIMELINE. Its hover
                      is where the reason it exists lives — no fund publishes a
                      forward schedule — and while the store cannot be read the
                      header says so once, rather than every row repeating it. */}
                  <SortHeader col="call" view={bookView} pad="px-2 py-2" align="left"
                    title={CALL_COLUMN_TITLE}
                    note={entered.state.status === "unavailable" ? "not available" : "you enter"}
                    noteTitle={entered.state.status === "unavailable" ? entered.state.reason : undefined}>Capital<br />call</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {renderSection("private")}
                {renderSection("unvalued")}
                {totalRow("private", book.privateTotal, <div>
                  <div>Private market total</div>
                  <div className="text-[11px] font-normal text-slate-500">the private side, each holding counted once</div>
                </div>, false)}
                {renderSection("elsewhere")}
              </tbody>
              <tfoot>
                {totalRow("capital", book.allCapital, <div>
                  <div>All capital accounts · {book.allCapital.capitalAccounts}</div>
                  <div className="text-[11px] font-normal text-slate-500">every section, including not private — what the capital tiles add to</div>
                </div>, true)}
              </tfoot>
            </table>
          </div>
        )}

        {view === "transactions" && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]" data-pm-table="transactions">
              <thead className="border-b border-ink-700">
                <Tr view={callView}>
                  <SortHeader col="date" view={callView} align="left">Date</SortHeader>
                  <SortHeader col="fund" view={callView} align="left">Fund</SortHeader>
                  <SortHeader col="owner" view={callView} align="left">Family member</SortHeader>
                  <SortHeader col="label" view={callView} align="left"
                    title="The fund's own wording for each call, exactly as its statement prints it.">Type</SortHeader>
                  <SortHeader col="amount" view={callView}>Amount</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {/* THE "WHAT CAN STILL BE CALLED" ROWS THAT STOOD HERE ARE GONE, at
                    the family's request — *"remove this, it simply needs to be a
                    editable coloumn in this table itself … We are trying to see
                    all views on master table itself instead of having such
                    clutter."* Three of their five figures were permanently empty
                    (no fund publishes a forward schedule), and the two real ones
                    survive where the family reads them: Due now is a tile, and
                    the undated still to call is a tile, a column and the total
                    above. What could fill the empty windows is the family's own
                    upcoming calls, and they are the Capital call column now. */}
                <tr className={TREE_ROW.section} data-pm-call-section="history">
                  <TreeSectionCell colSpan={callView.order.length} title="Every capital call made"
                    sub={`${m.history.length} calls, newest first — each fund's rows reproduce the total its own statement prints, or none of them are shown`} />
                </tr>
                {callsShown.map((c, i) => (
                  <Tr view={callView} key={`${c.accountId}-${c.date}-${i}`} className="hover:bg-ink-700/40" data-call-row={c.date}>
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-2 text-slate-200">{c.fund}</td>
                    <td className="px-4 py-2 text-slate-400">{c.owner ?? DASH}</td>
                    <td className="px-4 py-2 text-slate-500">{c.label ?? DASH}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{money(c.amount)}</td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <TrFoot view={callView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                  label={<>Total · {callsShown.length} calls{needle ? ` of ${m.history.length}` : ""}</>}
                  cells={{
                    amount: <td key="amount" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(sum(callsShown.map((c) => c.amount)))}</td>,
                  }} />
              </tfoot>
            </table>
          </div>
        )}

        {/* HOW THE CAPITAL TOTALS ARE WORKED OUT — one click away rather than a
            wall of prose under the table. The family asked twice for fewer
            explanations on this page; the arithmetic is still here for the
            reader who asks "how are you calculating this?". */}
        {view !== "transactions" && (
          <details className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11.5px] leading-relaxed text-slate-500" data-pm-working>
            <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-200">How the capital totals are worked out</summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <span className="text-slate-300">Still to call is summed exactly as each fund prints it</span> — {money(m.cc.uncalled)} over
                the {m.cc.uncalledOf} accounts that print the line — and never derived from committed − called, because a fund
                that prints no uncalled figure has not said it has nothing left to call. The ✓ beside a figure means that
                statement&rsquo;s own committed − called reproduces it to the rupee.
              </li>
              {m.cc.called != null && m.cc.committedWhereCalled != null && (
                <li>
                  <span className="text-slate-300">The same figure the other way:</span> committed {money(m.cc.committedWhereCalled)} less
                  called {money(m.cc.called)} is {money(m.cc.committedWhereCalled - m.cc.called)}, both struck over the same {m.cc.calledOf} accounts.
                </li>
              )}
              <li>
                <span className="text-slate-300">Called and Paid in cover different accounts and must not be subtracted from each other:</span> the
                {" "}{m.cc.count - m.cc.calledOf} account{m.cc.count - m.cc.calledOf === 1 ? "" : "s"} missing from the first
                {m.cc.count - m.cc.calledOf === 1 ? " is" : " are"} present in the second.
              </li>
              <li>
                <span className="text-slate-300">This is every capital account in the book and not every commitment the family has.</span>{" "}
                {m.cc.count - m.capOutside} of this page&rsquo;s {m.scope.accounts.length} private accounts send a
                capital-account statement; a commitment behind any other is invisible here, and the family&rsquo;s own
                investment register names funds with no statement in this book at all. So {money(m.cc.uncalled)} is the floor
                of what can still be called, never the ceiling.
              </li>
              <li>
                <span className="text-slate-300">No fund in this book publishes a forward drawdown schedule</span>, so
                nothing here says when the {money(m.cc.uncalled)} will be called — the Transactions tab lists every call
                made so far, dated, and a call a fund has announced is entered in the Capital call column, where it
                stays the family&rsquo;s figure and is never added into Called, Paid in or Still to call.
              </li>
              <li>
                Where two statements report one holding, the fund row counts it once and its folios show both, with a
                {" "}<span className="text-amber-400">Counted once</span> line so the folios add to the row.
              </li>
            </ul>
          </details>
        )}

        {/* WHICH SIDE OF THE BOOK THIS PAGE IS — on every tab, because it is a
            claim about the page rather than about one of its tables. */}
        {m.scopeNote.sides.length > 1 && (
          <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            This page is the private side of the book:{" "}
            {m.scopeNote.sides.map((x) => `${x.label} ${money(x.value)}`).join(" · ")}
            {" "}· Total {money(m.scopeNote.bookMV)}.
          </p>
        )}
      </Card>
    </div>
  );
}
