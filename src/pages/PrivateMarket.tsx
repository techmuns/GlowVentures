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
import { Auditable } from "@/components/Auditable";
import { AbsentCell, AbsentSection, absentTile, DASH } from "@/components/Absent";
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
import { schemeCalls, callTotals, callHistory, callWindows } from "@/lib/capitalCalls";
import { weightFormula } from "@/lib/auditFormulas";
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
const BOOK_COLS = ["name", "committed", "called", "paid", "uncalled", "units", "cost", "value", "return", "weight", "asOf"] as const;
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
// and the AIFs that are not private market at all (closed, marked).
//
// ── THE AXIS IS THE HOLDING'S OWN MARKET SIDE ───────────────────────────────
//
// `isPrivateClass` — which is `marketSide === "private"`, read from the SEBI
// category the statements print — and never `Account.engagement`. On this book
// keying on engagement would drop three real private holdings and pull in two
// cash sleeves. The Category III folios (Sanshi, Buoyant, Carnelian Bharat
// Amritkaal) are listed exposure — *"These are not private market
// investments"* — so they sit in the closed not-private section, named with
// their value, and in no private total.
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
type RowFigures = Pick<BookFigures, "committed" | "called" | "paid" | "uncalled" | "units" | "cost" | "value" | "returnPct" | "asOf">;

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
const bookAccessors = (label: (r: RowFigures & { label?: string }) => string | null): Record<string, Accessor<RowFigures & { label?: string }>> => ({
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
    /**
     * The windows run from the NEWEST capital-account date rather than from
     * `new Date()`, because that is the date the uncalled balances are struck
     * at — the same reason `pooledXirr` closes each account on its own as-of.
     */
    const asOfCalls = schemes.map((r) => r.asOf).filter(Boolean).sort().pop() ?? null;
    const windows = asOfCalls ? callWindows(schemes, asOfCalls) : [];
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
      schemes, cc, history, windows, asOfCalls,
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
   * Each entry's `value`, `sub` and `hint` are the ones the fixed tiles carried,
   * moved verbatim — the coverage lines, the four "must not be subtracted"
   * warnings and the two absences with their own reasons. Nothing here is
   * derived that was not derived before.
   */
  const tileMetrics: TileMetric[] = [
    {
      id: "value", label: "Private market value", icon: <Handshake className="h-4 w-4" />,
      value: <Auditable formula={weightFormula(m.privMV, m.bookMV, m.bookMV > 0 ? (m.privMV / m.bookMV) * 100 : null, money, "the consolidated book")}>{money(m.privMV)}</Auditable>,
      sub: `${m.bookMV > 0 ? fmtPct((m.privMV / m.bookMV) * 100, { decimals: 2 }) : DASH} of the ${money(m.bookMV)} book · across ${m.scope.accounts.length} accounts · each holding counted once`,
    },
    {
      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,
      value: money(m.privCost),
      sub: `cost in · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one`,
    },
    {
      id: "pnl", label: "Unrealised P&L", icon: <TrendingUp className="h-4 w-4" />,
      value: <span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>,
      sub: m.privCost != null && m.privCost > 0
        ? `on the ${money(m.privCost)} these statements report as cost, covering ${money(m.costedMV)} of the ${money(m.privMV)} above`
        : "no statement here reports a cost to measure a gain against",
    },
    /*
        *"How are you calculating this uncalled capital of 16 crores? …
         Something seems amiss here. According to me, the number is not 16
         crores."* — the client, on this tile, a round after it first grew a
        definition.

        THE ARITHMETIC WAS RIGHT AND THE TILE WAS STILL WRONG, and both halves
        of that are worth stating because only the second is fixable:

          · the ₹15.98 Cr ties. Summed as printed over the 13 accounts that
            print an uncalled line it is ₹15,97,50,000, and committed less
            CALLED over all 15 comes to the same figure to the rupee. Two
            paths, one answer, and the per-scheme table below shows every row.
          · IT IS A FLOOR AND THE TILE NEVER SAID SO. It covers the capital
            accounts this book HAS A STATEMENT FOR, and those are a minority of
            the family's private accounts. A fund whose capital account nobody
            sent contributes nothing to this figure and can still call money
            tomorrow, so a reader who knows about such a commitment is right
            that the number is too small — and the tile gave them no way to see
            that.

        So the tile states the coverage as its own sub-line rather than burying
        it, and the card below names which accounts are outside it.
    */
    {
      id: "uncalled", label: "Still to call (uncalled capital)", icon: <Fuel className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.ct.undrawn)}</span>,
      /**
       * TWO COUNTS FROM TWO SETS, AND THE CAPTION MUST NOT MAKE ONE A FRACTION
       * OF THE OTHER. This read `${m.ct.count} of this page's ${...} private
       * accounts` — which was true while the page carried every AIF and stopped
       * being true the moment it stopped: three of the capital accounts belong
       * to funds shown elsewhere (a Category III fund with a real drawdown
       * structure, and two the statements place on neither side), so 15 is not
       * a subset of 18 and a reader who reads it as one is reading a fraction
       * that does not exist.
       */
      sub: `across ${m.ct.count} capital accounts`
        + (m.capOutside > 0 ? `, ${m.capOutside} of them in funds that are not private market` : "")
        + ` · a fund whose capital account nobody sent contributes nothing, so this is a floor`,
      hint: "Money promised to these funds that they have not yet asked for. A bill that can arrive any day — not an asset, and never added to a value on this page.",
    },
    /* ── COMMITTED vs CALLED vs INVESTED — three figures, not two ────────────
        *"Capital committed, or is it capital invested? What is capital
         committed versus invested? … Because committed can be one thing. I
         would commit 10 crores, but I may have only invested so far 5 crores,
         and 5 crores is remaining to be drawn."*

        The client is describing the model exactly, and the page was printing
        two of its three figures under one word. `Drawn` was whichever of
        CALLED and PAID each fund's own layout happened to match — the same
        field meaning two things across fifteen rows. They are separate now,
        each read off the line its own statement labels, and each tile says
        which of the four quantities it is in the client's own words. */
    {
      id: "committed", label: "Committed", icon: <Landmark className="h-4 w-4" />,
      value: money(m.ct.committed), sub: `${m.ct.committedOf} of ${m.ct.count} capital accounts`,
      hint: "The full amount signed for, whether or not the fund has asked for it yet. Not money spent, and in no market value on this page.",
    },
    {
      id: "called", label: "Called by the funds", icon: <Banknote className="h-4 w-4" />,
      value: m.cc.called == null ? DASH : money(m.cc.called),
      sub: `${m.cc.calledOf} of ${m.cc.count} capital accounts print a called line`,
      hint: "What the funds have demanded so far. It covers a different set of accounts from Invested, so the two must never be subtracted.",
    },
    {
      id: "paid", label: "Invested (paid in)", icon: <Wallet className="h-4 w-4" />,
      value: m.cc.paid == null ? DASH : money(m.cc.paid),
      sub: `${m.cc.paidOf} of ${m.cc.count} capital accounts · cash that has actually left the family's bank`,
      hint: "Cash that has actually left the family’s bank. Not the same set as Capital invested above, which is the cost of every private holding.",
    },
    {
      id: "due", label: "Due now (called, unpaid)", icon: <CalendarClock className="h-4 w-4" />,
      value: m.cc.dueNow == null ? DASH : <span className={m.cc.dueNow > 0 ? "text-amber-400" : undefined}>{money(m.cc.dueNow)}</span>,
      sub: m.cc.dueNowOf === 0
        ? "no statement here prints a called-but-unpaid line"
        : `${m.cc.dueNowOf} of ${m.cc.count} accounts print this line · a measured figure, not an assumption`,
      hint: "Called by the fund and not yet paid — the one figure here that is genuinely owed rather than merely possible.",
    },
    /* THE FIGURE THIS PAGE EXISTS FOR. Real money, paid, and in NO total above
        it: adding drawn capital to a market value reports what was paid as
        what the stake is worth.

        THE LABEL WAS THE CLIENT'S THIRD QUESTION — *"Drawn against no
        valuation means?"* — and it was jargon twice over: "drawn" is the
        fund's word for having taken the money, and "against no valuation" is a
        property of the STATEMENT rather than of the money. */
    {
      id: "unvalued", label: "Paid in, but never valued", icon: <HelpCircle className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.unvaluedDrawn)}</span>,
      sub: `${m.unvaluedNoNav.length} folios in funds that publish no NAV at all · not in the private market value above`,
      hint: "Cash paid into funds that have never published a valuation. Real money, and in no total on this page.",
    },
    /* *"what is distributions?"* — same treatment, and the label carries the
        client's own word beside the plain one rather than only the plain one:
        the sub-line under this tile has always said "distribution figure", so a
        reader who asks what a distribution is was reading a word the tile used
        and never defined. */
    {
      id: "distributed", label: "Distributions (cash returned)", icon: <Coins className="h-4 w-4" />,
      value: money(m.ct.distributed),
      sub: `${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`,
      hint: "Cash these funds have already paid back. Not part of the value above, and it does not reduce what a fund can still call.",
    },
    /* ── THE TWO THAT ARE ABSENT BY MEASUREMENT ──────────────────────────────
        They are OFFERED like every other metric, because the family asked for
        every metric they might want to see and the answer to both is a fact
        about this corpus rather than a gap in the picker. A catalogue that
        silently omitted them would take with it the two things a reader of a
        private book most needs told. */
    {
      id: "realised", label: "Realised gain", icon: <Coins className="h-4 w-4" />,
      ...absentTile(
        "no capital gain statement covers any private account in this drop",
        "Every AIF-engagement account carries that absence verbatim in the book's capital-gain record. Their redemptions are real; what they realised was never reported to this book, so it is absent rather than nil."),
    },
    /* ITS REASON WAS HALF FALSE THE MOMENT THE CALLS WERE READ, and this repo
        has recorded that failure — an absence standing on a premise nobody
        rechecked — often enough to catch it in its own change. It read "none
        publishes its calls as dated data", which was true when written and is
        now false of every one of these fifteen accounts. What is still missing
        is the OTHER half, and only that half: a distribution figure on 12 of
        the 15. */
    {
      id: "multiple", label: "Net multiple (TVPI / DPI)", icon: <Handshake className="h-4 w-4" />,
      ...absentTile(
        `only ${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`,
        `A multiple divides what has come back plus what is still inside by what went in. The last of those three is now measurable per folio — ${m.cc.callCount} dated calls, each reconciled against its own statement — and the first is not: ${m.ct.count - m.ct.distributedOf} of these ${m.ct.count} accounts print no distribution line at all. Reading those as nil would report a fund that has returned nothing when its statement simply does not say, and a DPI built on that understates every folio it touches.`),
    },
    /* ── AND THE FIGURES THE REMOVED SUBTITLE USED TO CARRY ──────────────────
        *"Give option for every single metric the user might want to see."* The
        subtitle counted this page's funds, accounts and owners and went at the
        family's request because the tables state two of the three; as OPTIONAL
        tiles they cost nothing and a reader who wants the count can have it
        back. Each is a count of a set this page already draws, so none is a new
        measurement. */
    {
      id: "funds", label: "Funds held", icon: <Handshake className="h-4 w-4" />,
      value: fmtNum(m.funds.length),
      sub: `distinct funds · each counted once however many members hold it`,
    },
    {
      id: "folios", label: "Folio rows", icon: <Layers className="h-4 w-4" />,
      value: fmtNum(m.folios.length),
      sub: `one per statement line · ${m.folios.length - m.funds.length} more than the fund count above`,
      hint: "Every statement as printed. Two holdings here are reported under two members each, which is why this is the larger number.",
    },
    {
      id: "owners", label: "Owners", icon: <Users className="h-4 w-4" />,
      value: fmtNum(m.owners.length),
      sub: "family members and trusts holding something private",
    },
    {
      id: "accounts", label: "Capital accounts", icon: <Landmark className="h-4 w-4" />,
      value: fmtNum(m.ct.count),
      /**
       * AND THE SAME CROSSED FRACTION THE UNCALLED TILE WAS FIXED FOR, ON THIS
       * TILE. It read `${m.ct.count} of this page's ${...} private accounts` —
       * 15 of 18 — while three of those 15 belong to funds this page does not
       * carry, so 15 is not a subset of 18 and the "other 3" a reader infers
       * does not exist. The two counts PARTITION the tile's own figure now,
       * which is the only form in which both can be printed together.
       */
      sub: `${m.ct.count - m.capOutside} of this page's ${m.scope.accounts.length} private accounts send one`
        + (m.capOutside > 0 ? ` · ${m.capOutside} more come from funds that are not private market` : ""),
      hint: "A capital account is the statement that prints a commitment and what has been called against it. The rest report a holding and no commitment.",
    },
    {
      id: "calls", label: "Dated capital calls", icon: <CalendarClock className="h-4 w-4" />,
      value: fmtNum(m.cc.callCount),
      sub: `across ${m.ct.count} capital accounts · every one reconciled against its own statement's printed total`,
      hint: "Each call the funds have made, with its own date. A statement whose rows did not reproduce its own printed total publishes none of them here.",
    },
    /* THE RAW TOTAL, OFFERED WITH ITS OWN DOUBLE COUNT NAMED. The folio view's
        footer already prints it, and a reader who wants it on the strip is
        entitled to it — but a private total that is ₹3.17 Cr above the
        consolidated one must never appear without saying why, which is the
        whole reason this is a tile with a sub-line rather than a second
        unlabelled figure. */
    {
      id: "raw", label: "Private value, as printed", icon: <Layers className="h-4 w-4" />,
      value: money(m.rawMV),
      sub: `every statement as printed · ${money(m.scope.doubleCounted)} of it is two holdings reported under two members each`,
      hint: "Not the consolidated figure. Use it to tie this page to the statements one by one; the Private market value tile counts each holding once.",
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
  const nameAcc = bookAccessors((r) => r.label ?? null);
  const pct = (v: number | null) => (v == null || !(book.privateValue > 0) ? null : (v / book.privateValue) * 100);

  // ── THE CELLS, ONE WRITER FOR EVERY ROW KIND ────────────────────────────────
  //
  // Every row of the master table writes its ten figure cells here, keyed by
  // column, so a section band, a fund, a folio and a total cannot put one
  // figure under two headings. `kind` decides only the weight of the type and
  // what an absent cell SAYS — never which column a figure lands in.
  type CellKind = "group" | "folio" | "section" | "total" | "capital";
  type Cells = Partial<Record<(typeof BOOK_COLS)[number], ReactNode>>;
  const pad = (k: CellKind) => (k === "folio" ? "px-2.5 py-1.5" : k === "section" ? "px-2.5 py-2" : "px-2.5 py-2.5");
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
    if (holdingRow || k === "section") {
      const first = r.asOf[0], last = r.asOf[r.asOf.length - 1];
      out.asOf = (
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
    }
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
      g.folios.map((f) => ({ f, fig: folioFigures(f), label: grouping === "fund" ? f.owner : f.fundName })),
      bookView.sort,
      Object.fromEntries(Object.entries(nameAcc).map(([c, a]) => [c, (x: { fig: RowFigures; label: string }) => a({ ...x.fig, label: x.label })])),
    );
    const scheme = (f: BookFolio) => f.capital;
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
          {inOrder(figureCells(g, "group", {
            noCapital: g.capitalAccounts === 0 ? noCapitalWhy(g.section, "group") : undefined,
            noValue: valueWhy(g.status, g.folios[0]?.reason ?? null),
            nil: g.status === "redeemed" ? valueWhy("redeemed", null) : undefined,
            noHolding: g.holdings === 0 ? "no valued holding on these statements" : undefined,
            weight: inPrivate ? pct(g.value) : null,
            weightWhy: weightWhy(g.section),
            stale: g.staleDays,
            ties: g.ties,
          }), "group")}
        </Tr>
        {open && kids.map(({ f, fig }, i) => {
          const s = scheme(f);
          return (
            <Tr view={bookView} key={f.key} className={TREE_ROW.child}
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
              {inOrder(figureCells(fig, "folio", {
                noCapital: s ? undefined : noCapitalWhy(g.section, "folio"),
                noValue: valueWhy(f.status, f.reason),
                nil: f.status === "redeemed" ? valueWhy("redeemed", null) : undefined,
                noHolding: f.position ? undefined : "no valued holding on this statement",
                weight: inPrivate ? pct(f.value) : null,
                weightWhy: weightWhy(g.section),
                stale: s?.staleDays ?? null,
                ties: s?.uncalledTies ?? null,
                implied: s?.impliedUncalled ?? null,
              }), "folio")}
            </Tr>
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
    const title = id === "elsewhere" && s.groups.every((g) => g.folios.every((f) => f.position?.assetClass === "AIF"))
      ? "Other AIFs" : copy.title;
    const open = sectionOpen(id);
    const shown = sortRows(s.groups.filter(groupMatches), bookView.sort, nameAcc as Record<string, Accessor<BookGroup>>);
    const noun = grouping === "fund" ? (s.groups.length === 1 ? "fund" : "funds") : (s.groups.length === 1 ? "member" : "members");
    const sub = id === "private"
      ? `${s.groups.length} ${noun} · ${s.folios} folios · ${grouping === "fund" ? "each holding counted once" : "each statement as printed"}`
      : id === "unvalued"
        ? `${s.groups.length} ${noun} · ${s.folios} folios · the statements carry no value, so ${money(s.paid)} paid in is in no value total`
        : `${s.groups.length} ${noun} · ${s.folios} folios · Category III trades listed shares, and the rest print no category. Shown in Portfolio Monitor; in no private total.`;
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
  /**
   * Which statements the uncalled figure is stale on — one entry per fund and
   * date, with how many accounts share it, so two trusts holding one fund read
   * as one fund held twice rather than as the same name printed twice.
   */
  const staleFunds = [...m.cc.staleRows.reduce((acc, r) => {
    const k = `${r.fund}|${r.asOf}`;
    acc.set(k, { fund: r.fund, asOf: r.asOf!, n: (acc.get(k)?.n ?? 0) + 1 });
    return acc;
  }, new Map<string, { fund: string; asOf: string; n: number }>()).values()];
  const staleNote = m.cc.staleUncalled != null && m.cc.staleUncalled > 0
    ? `${money(m.cc.staleUncalled)} of it is on statements older than the newest here (${staleFunds.map((x) => `${x.fund}${x.n > 1 ? ` ×${x.n} accounts` : ""} · ${fmtDate(x.asOf)}`).join("; ")}), so a call made since would not show.`
    : null;

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
                  <SortHeader col="name" view={bookView} align="left" className="min-w-[16.5rem]">{grouping === "fund" ? "Fund" : "Family member"}</SortHeader>
                  <SortHeader col="committed" view={bookView} pad="px-2.5 py-2" note="promised"
                    title="What the family signed up to invest, whether or not the fund has asked for it yet.">Committed</SortHeader>
                  <SortHeader col="called" view={bookView} pad="px-2.5 py-2" note="asked for"
                    title="What the fund has demanded so far, off the line its own statement labels.">Called</SortHeader>
                  <SortHeader col="paid" view={bookView} pad="px-2.5 py-2" note="cash sent"
                    title="Cash that has actually left the family's bank for this fund — its capital account.">Paid in</SortHeader>
                  <SortHeader col="uncalled" view={bookView} pad="px-2.5 py-2" note="not yet asked"
                    title="Promised and not yet asked for, exactly as the fund prints it — never worked out as committed − called. A bill that can arrive any day, never added to a value.">Still to call</SortHeader>
                  <SortHeader col="units" view={bookView} pad="px-2.5 py-2">Units</SortHeader>
                  <SortHeader col="cost" view={bookView} pad="px-2.5 py-2" note="of units held"
                    title="What the units held cost, off the holding statement — a different document from the capital account's Paid in.">Cost</SortHeader>
                  <SortHeader col="value" view={bookView} pad="px-2.5 py-2" note="fund's mark"
                    title="What the holding is worth on the fund's own statement date.">Value</SortHeader>
                  <SortHeader col="return" view={bookView} pad="px-2.5 py-2" note="on cost">Return</SortHeader>
                  <SortHeader col="weight" view={bookView} pad="px-2.5 py-2" note="of private"
                    title="The row's value as a share of the private market value — the same denominator on every row.">Weight</SortHeader>
                  <SortHeader col="asOf" view={bookView} pad="px-2.5 py-2" align="left">As of</SortHeader>
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
                {/* WHAT CAN STILL BE CALLED — measured where the statements
                    measure it, and a named absence where they do not. NOT ONE
                    document in this archive publishes a forward drawdown
                    schedule, so the three windows are empty by measurement and
                    the one bucket that holds money is the one no window can
                    claim. A forecast from the observed cadence would read as the
                    sixteenth measured figure, which is why there is none. */}
                <tr className={TREE_ROW.section} data-pm-call-section="upcoming">
                  <TreeSectionCell colSpan={callView.order.length} title="What can still be called"
                    sub={<>
                      {m.asOfCalls ? `From ${fmtDate(m.asOfCalls)}, the newest capital-account date here. ` : ""}
                      <span className="text-slate-400">No fund in this book publishes a forward drawdown schedule</span> — a
                      {" "}drawdown notice or a commitment-period schedule from each fund is what would fill the windows.
                    </>} />
                </tr>
                <Tr view={callView} data-call-bucket="due-now" className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 font-medium text-slate-200">Due now</td>
                  <td className="px-4 py-2 text-slate-300">Called by a fund and not yet paid</td>
                  <td className="px-4 py-2 text-slate-400">
                    {m.cc.dueNowOf === 0 ? "no statement here prints the line" : `${m.cc.dueNowOf} of ${m.cc.count} accounts print this line`}
                  </td>
                  <td className="px-4 py-2 text-[11.5px] text-slate-500">
                    measured where printed — the rest are skipped, never counted as nil
                  </td>
                  <td data-call-amount className="px-4 py-2 text-right mono text-slate-100">{m.cc.dueNow == null ? <AbsentCell reason="no statement prints a called-but-unpaid line" /> : money(m.cc.dueNow)}</td>
                </Tr>
                {m.windows.map((w) => (
                  <Tr view={callView} key={w.key} data-call-bucket={w.key} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 font-medium text-slate-200">{w.label}</td>
                    <td className="px-4 py-2 text-slate-300">Calls a fund has dated into this window</td>
                    <td className="px-4 py-2 text-slate-400">{w.scheduled.length ? `${w.scheduled.length} scheduled` : "none scheduled"}</td>
                    <td className="px-4 py-2 text-[11.5px] text-slate-500">{w.scheduled.length ? "from the funds' own notices" : "no fund publishes a schedule"}</td>
                    <td data-call-amount className="px-4 py-2 text-right mono text-slate-400">
                      {w.scheduled.length === 0
                        ? <AbsentCell reason="no fund in this book publishes a forward drawdown schedule, so nothing can be placed in this window. A drawdown notice or a commitment-period schedule from the fund is what would fill it." />
                        : money(sum(w.scheduled.map((c) => c.amount)))}
                    </td>
                  </Tr>
                ))}
                <Tr view={callView} data-call-bucket="unscheduled" className="hover:bg-ink-700/40">
                  <td className="px-4 py-2 font-medium text-amber-400">Promised, no date</td>
                  <td className="px-4 py-2 text-slate-300">
                    Still to call — the funds can ask for it on any day
                    {staleNote && <div className="text-[11px] text-slate-500">{staleNote}</div>}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{m.ct.undrawnOf} of {m.ct.count} accounts</td>
                  <td className="px-4 py-2 text-[11.5px] text-slate-500">not in a window because no fund has scheduled it, not because it is far off</td>
                  <td data-call-amount className="px-4 py-2 text-right mono text-amber-400">{money(m.ct.undrawn)}</td>
                </Tr>

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
                made so far, dated.
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
