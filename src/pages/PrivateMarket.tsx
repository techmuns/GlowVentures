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
import {
  sum, sumOrNull, consolidatedMarketValue, currentHoldings, returnMeasureDef,
  type MeasuredReturn, type ReturnMeasure,
} from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals, unvaluedAccounts, unvaluedDrawn,
  capitalScope,
} from "@/lib/privateMarket";
import {
  fundDatedRecords, fundMeasuredReturn, fundReturnColumnMeta, pooledFundXirr,
  PM_AGG_NO_MEASURE, PM_RETURN_HINTS, type FundDated,
} from "@/lib/fundReturns";
import { ReturnMeasureSelect, useReturnMeasures } from "@/components/ReturnMeasureSelect";
import { withReturnCols, returnAccessorsFor, returnColId } from "@/lib/returnColumns";
import {
  bookFolios, privateBook, figuresOf, BOOK_SECTIONS,
  type BookFigures, type BookFolio, type BookGroup, type BookSectionId, type Overlap, type PrivateBook,
} from "@/lib/privateBook";
import { schemeCalls, callTotals, callHistory } from "@/lib/capitalCalls";
import { useEnteredCalls, headlineCall, todayIso, CAUSE_WORD } from "@/lib/enteredCalls";
import { fmtPct, fmtNum, fmtDate, changeColor } from "@/lib/format";
import { fifoTotals, positionFifoReturn } from "@/lib/fifo";

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
 * `return` IS A PLACEHOLDER, NOT A COLUMN — the Monitor's own mechanics, shared
 * since Stage 10bw (`returnColumns.ts`). The reader's picker (`?ret=`) expands it
 * to ONE COLUMN PER PICKED MEASURE, each headed with its own name, so a cell
 * never has to say which of five returns it is by position alone. Every writer
 * below walks the EXPANDED list, so a band, a fund, a folio and a total all put
 * their return under the same measure's heading.
 */
type BookCol = string;
/**
 * THE CAPITAL-CALL COLUMN'S OWN HOVER, and the one place the reason it exists
 * is stated: no fund publishes a forward schedule, so the calls a fund has
 * announced — in a notice, an email, a phone call — are typed in here. It is
 * also where the one rule a reader of this column must not get wrong lives:
 * these are the family's figures, never added into a statement total.
 *
 * `call` IS THE FAMILY'S OWN COLUMN, and LAST, because it is the one column a
 * reader writes to rather than reads — and a stored arrangement that predates
 * it gets it placed after the column it is declared after (`useTableView`).
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
/** The Transactions tab: every dated call, newest first. */
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
//   Transactions  every dated call, newest first.
//
// and two sections inside the first two: the private funds with a value
// (open), and the private accounts with NO value (closed, marked "missing
// data").
//
// ── THE AXIS IS THE HOLDING'S OWN MARKET SIDE ───────────────────────────────
//
// `isPrivateClass` — which is the generated `marketSide === "private"`: the
// family's own placing of each fund first, then the SEBI category the
// statements print (Stage 10bw) — and never `Account.engagement`. On this book
// keying on engagement would drop real private holdings and pull in cash
// sleeves. Sanshi, Buoyant, Carnelian Bharat Amritkaal, Delphi and both Founders
// Fund folios invest in listed equity, so none is on this page.
//
// ── AND THE CAPITAL ACCOUNTS FOLLOW THE FUND ────────────────────────────────
//
//   *"private market fund needs to be here in private market only"* — sent with
//    the family's own classification of all fifteen capital accounts.
//
// This table used to carry a third section: the capital accounts of AIFs that
// are not private market, closed and marked, so its capital columns would add
// to every capital account in the book. That is a public-market fund on a
// private-market page however it is marked, so it went. `capitalScope` places
// each capital account by what its FUND invests in, through the same rule that
// places the holding, and the ones it leaves out are NAMED under the table in
// one clause — counted nowhere, dropped nowhere.
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
 * THE THREE TABS OF THE ONE CARD. Each carries its own title, because By fund
 * and By owner are on different BASES (counted once, and as printed) and one
 * title over both would describe neither.
 *
 * ── AND NO SUBTITLE ──────────────────────────────────────────────────────────
 *
 *   *"Why do i need all this garbage written please remove its obvious from the
 *    table what it is … The customer is literally looking at the table and
 *    seeing the values inside it."*
 *
 * Each tab had a sentence under the card title saying what the table shows.
 * The title says it, the table shows it, and the basis each is on is the tab's
 * own hover and the total row's — so the sentence went, and `check:pages`
 * asserts no card on this page carries one.
 */
const BOOK_VIEWS = [
  {
    key: "funds", label: "By fund",
    title: "One row per fund, each holding counted once. Click a row for its folios.",
    cardTitle: "Private market — every fund",
  },
  {
    key: "owners", label: "By owner",
    title: "One row per family member, each statement as printed. Click a row for their folios.",
    cardTitle: "Private market — by family member",
  },
  {
    key: "transactions", label: "Transactions",
    title: "Every capital call the funds have made, newest first.",
    cardTitle: "Private market — capital calls",
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
};

/** A row of figures in the shape the accessors read — a group, a section, a total or a folio. */
type RowFigures = Pick<BookFigures, "committed" | "called" | "paid" | "uncalled" | "units" | "cost" | "value" | "returnPct" | "asOf">
  & {
    /** The fund whose entered calls this row's Capital call cell shows — none on a member row or a band. */
    callKey?: string | null;
    /**
     * HOW THIS ROW RESOLVES A RETURN MEASURE — the ONE resolution its cells, the
     * sort and the header counts all read, so a column cannot sort on one figure
     * and draw another. A fund and a folio resolve on their own dated record
     * (`fundMeasuredReturn`); a band, a member and a total on the set's.
     */
    ret?: (measure: ReturnMeasure) => RowReturn;
  };

/**
 * A RESOLVED RETURN, and — on a SET's pooled XIRR — how many of its records it
 * pools. A total over part of a table has to say which part on its face, so the
 * cell prints "· 3 of 4" beside the rate and the sweep reads both counts off
 * the cell (Stage 10bw's footer rule, carried onto every band and total).
 */
type RowReturn = MeasuredReturn & { pool?: { covers: number; of: number } };

const folioFigures = (f: BookFolio): RowFigures => ({
  committed: f.capital?.committed ?? null,
  called: f.capital?.called ?? null,
  paid: f.capital?.paid ?? null,
  uncalled: f.capital?.uncalled ?? null,
  units: f.units,
  cost: f.cost,
  value: f.value,
  // The folio's own FIFO return — a redeemed unit's gain and cost stay in it.
  returnPct: f.position && f.cost != null && f.cost > 0 && f.pnl != null ? positionFifoReturn(f.position) : null,
  asOf: f.asOf ? [f.asOf] : [],
});

/** A resolution with nothing to show — the fallback for a row that states no resolver. */
const NO_RETURN: RowReturn = { shown: false, tag: "—", reason: "no return is struck on this row" };

/**
 * WHAT A SET'S HPR COUNTS OF THE CASH PAID BACK — a member's row, a band, the
 * total. The fund note's own rule (`fundMeasuredReturn`) over several funds:
 * the figure is FIFO (`fifoTotals`), the gain on the units held plus the gain
 * on units redeemed over the capital deployed in both, so the principal a fund
 * returned by REDEEMING units is inside it — their cost in what was paid in,
 * any gain on them in the gain. Income, equalisation and a distribution that
 * redeemed no units are not units, and XIRR is what counts them.
 *
 * It read "cash the funds have paid back is not in it" until Stage 10cj — true
 * before Stage 10ca and false after it of Neo Infra's ₹14.16 L principal, on
 * the one cell that sums the whole private book.
 */
const aggHprNote = (held: BookFolio[]): string =>
  held.some((f) => (f.position?.costOfUnitsSold ?? 0) > 0)
    ? "FIFO, not annualised: the gain on the units held plus the gain on units redeemed, over the capital paid in for both. The principal returned on redeemed units is in it; income, equalisation and any payout that redeemed no units are not — XIRR counts those."
    : "FIFO, not annualised: the gain on the units held, over the capital paid in for them. Cash the funds have paid back is not in it — XIRR counts it.";

/** One set of accessors for every row kind, so a column sorts parents and their folios alike. */
const bookAccessors = (
  label: (r: RowFigures & { label?: string }) => string | null,
  callDate: (key: string | null | undefined) => string | null,
  measures: readonly ReturnMeasure[],
): Record<string, Accessor<RowFigures & { label?: string }>> => ({
  name: (r) => label(r),
  committed: (r) => r.committed,
  called: (r) => r.called,
  paid: (r) => r.paid,
  uncalled: (r) => r.uncalled,
  units: (r) => r.units,
  cost: (r) => r.cost,
  value: (r) => r.value,
  // ONE ACCESSOR PER PICKED MEASURE, reading the figure its own column prints —
  // `returnAccessorsFor` sorts an absent return LAST in both directions, which
  // `sortRows` does for every null.
  ...returnAccessorsFor<RowFigures & { label?: string }>(measures, (r, m) => (r.ret ? r.ret(m) : NO_RETURN)),
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
  /** Open sections — the private funds start open, the marked one closed. */
  const sections = useExpanded(BOOK_SECTIONS.filter((s) => SECTION_COPY[s].defaultOpen));
  /**
   * WHICH RETURN(S) THE TABLE SHOWS — the Monitor's own picker (Stage 10bw):
   * every measure by default, the reader's pick remembered for this page, and a
   * `?ret=` address still winning, so "send me the XIRR view" is a link and the
   * sweep reaches each measure by address. One column per ticked measure,
   * expanded from the `return` placeholder exactly as on the Monitor.
   *
   * MEMOISED ON THE MEASURES, NOT REBUILT PER RENDER.
   */
  const [returnMeasures, setReturnMeasures, returnSource] = useReturnMeasures("private-market");
  const measureKey = returnMeasures.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bookCols = useMemo(() => withReturnCols(BOOK_COLS, returnMeasures), [measureKey]);
  const bookView = useTableView("pm-book", bookCols);
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
    /**
     * ── THE CAPITAL ACCOUNTS OF PRIVATE-MARKET FUNDS, AND ONLY THOSE ─────────
     *
     *   *"private market fund needs to be here in private market only"* — sent
     *    with the family's own classification of all fifteen capital accounts.
     *
     * `capitalScope` places each capital account by what its FUND invests in,
     * through the same rule that places its holding, so a fund's holding and its
     * capital account cannot land on different sides of the page. The ones it
     * leaves out — Carnelian Bharat Amritkaal, Motilal Oswal Delphi and both
     * Founders Fund folios, which call capital and invest in listed equity — are
     * NAMED under the table with their figures, never dropped.
     */
    const cap = capitalScope(portfolio.commitments ?? [], portfolio.accounts);
    const commitments = cap.onPage;

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
    // PRIVATE-MARKET ACCOUNTS ONLY, by the same rule as the capital register:
    // Motilal Oswal's Hedged Equity strategy is an AIF holding nothing too, and
    // it is not a private-market fund.
    const unvalued = unvaluedAccounts(portfolio.accounts, portfolio.positions, commitments)
      .filter((u) => u.side === "private");

    // CONSOLIDATED — each dedupeGroup once — SUMMED FROM THE FUND ROWS, never
    // struck independently: a total must tie to its own columns.
    const privMV = sum(funds.map((f) => f.mv));
    const privCost = sumOrNull(funds.map((f) => f.cost));
    const privPnL = sumOrNull(funds.map((f) => f.pnl));
    const costedRows = scope.dedupedRows.filter((p) => p.costBasis != null);
    // FIFO over the holdings that report a cost — the same aggregator every
    // other return on the dashboard is struck with, so a redemption's realised
    // gain stays in the private book's return rather than leaving it.
    const privFifo = fifoTotals(costedRows);
    const costedMV = sum(funds.map((f) => f.costedMV));
    const bookMV = consolidatedMarketValue(portfolio.positions);
    // RAW — every statement as printed. Never the same number, by design.
    const rawMV = sum(scope.rows.map((p) => p.marketValue));

    // THE MASTER TABLE, both groupings off one set of folios.
    const all = bookFolios({
      positions: current, allPositions: portfolio.positions, accounts: portfolio.accounts,
      commitments, accIdx, schemes,
    });

    return {
      accIdx, scope, funds, folios, owners, ct, unvalued, commitments,
      schemes, cc, history,
      privMV, privCost, privPnL, privFifo, costedMV, costedCount: costedRows.length, bookMV, rawMV,
      unvaluedDrawn: unvaluedDrawn(unvalued),
      unvaluedNoNav: unvalued.filter((u) => u.kind === "no-nav"),
      /**
       * THE CAPITAL ACCOUNTS OF PUBLIC-MARKET FUNDS — left out of every figure
       * on this page and named, in one clause, under the table.
       */
      capElsewhere: cap.elsewhere,
      /**
       * Capital accounts the page COUNTS whose own account is not in its scope.
       * Zero on this book, because `capitalScope` and `privateScope` place an
       * account by the same rule; kept because the two could part on a drop
       * where a private fund's capital account and its holding sit in
       * different accounts, and the counts printed beside it must say so then.
       */
      capOutside: commitments.filter(
        (c) => c.accountId && !scope.accounts.some((a) => a.accountId === c.accountId),
      ).length,
      /**
       * WHETHER CALLED AND PAID IN ARE STRUCK OVER ONE SET OF ACCOUNTS. Where
       * they are, the two may be set against each other; where they are not,
       * the page must say they cannot. Measured per account rather than by
       * comparing two counts — equal counts over different accounts is exactly
       * the case the warning exists for.
       */
      calledPaidSameSet: schemes.every((r) => (r.called == null) === (r.paid == null)),
      owned: new Set(portfolio.positions.map((p) => p.accountId)),
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
   * AND A LINE THAT SAYS NOTHING THE LABEL DOES NOT IS REMOVED, NOT KEPT FOR
   * SYMMETRY. *"make sure these sub-texts are shorter and direct so the user can
   * actually read them. If it is irrelevant then remove them."* "Capital
   * invested — Cost of these holdings", "Funds — Distinct funds held" and
   * "Folios — Statement lines" each restated their own heading, so those three
   * tiles are a label and a figure; every line that stays carries something the
   * label does not (a share, a return, a definition, a reason).
   *
   * WHAT A HOVER COSTS, stated rather than glossed: it is not read by someone
   * scanning. The two claims on this strip that a reader could be misled by
   * without it — that uncalled capital is a liability in no total, and that
   * Called and Paid in must not be subtracted — are ALSO printed under the
   * table, which is where a reader doing that arithmetic already is.
   */
  const retPct = m.privFifo.returnPct;
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
      detail: `The cost these statements report · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one.`,
    },
    {
      id: "pnl", label: "Unrealised P&L", icon: <TrendingUp className="h-4 w-4" />,
      value: <span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>,
      sub: retPct == null ? absentLine("No cost to measure against") : `${fmtPct(retPct, { sign: true, decimals: 1 })} return · FIFO`,
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
       * OF THE OTHER: three of the capital accounts belong to funds this page
       * does not carry, so "15 of this page's 18" would be a fraction that does
       * not exist. Stage 10bp's fix, kept verbatim in the hover.
       */
      detail: "Money promised to these funds that they have not yet asked for — a bill that can arrive any day, "
        + "not an asset, and never added to a value on this page. "
        + `Across ${m.ct.count} capital accounts of private-market funds`
        + (m.capOutside > 0 ? `, ${m.capOutside} of them in funds this page does not carry` : "")
        + (m.capElsewhere.length > 0
          ? `; the ${m.capElsewhere.length} in public-market funds are not counted`
          : "")
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
      detail: `${m.ct.committedOf} of ${m.ct.count} capital accounts of private-market funds`
        + (m.capElsewhere.length > 0
          ? ` — ${m.capElsewhere.length} more, in public-market funds, are not counted`
          : "")
        + ". The full amount signed for, whether or not the fund has asked for it yet — not money spent, and in no market value on this page.",
    },
    {
      id: "called", label: "Called", icon: <Banknote className="h-4 w-4" />,
      value: m.cc.called == null ? <AbsentValue /> : money(m.cc.called),
      sub: m.cc.called == null ? absentLine("No statement prints it") : "Asked for so far",
      detail: `${m.cc.calledOf} of ${m.cc.count} capital accounts print a called line.`
        + (m.calledPaidSameSet
          ? " Paid in covers the same accounts."
          : " It covers a different set of accounts from Paid in, so the two must never be subtracted."),
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
      detail: `${m.unvaluedNoNav.length} folios in funds that publish no NAV at all. Real money, not in Market value, and never added to a value on this page.`,
    },
    /* *"what is distributions?"* — the label is the client's own word and the
        short line under it is the answer. */
    {
      id: "distributed", label: "Distributions", icon: <Coins className="h-4 w-4" />,
      value: money(m.ct.distributed),
      sub: "Cash paid back so far",
      detail: `${m.ct.distributedOf} of ${m.ct.count} capital accounts have a distribution total this book reads. Not part of the value above, and it does not reduce what a fund can still call.`,
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
      detail: `Only ${m.ct.distributedOf} of ${m.ct.count} capital accounts have a distribution total this book reads. A multiple divides what has come back plus what is still inside by what went in; for the other ${m.ct.count - m.ct.distributedOf} this book carries no distribution total — the statement prints none, or prints one no reader here captures yet — and reading those as nil would report a fund that has returned nothing when its statement does not say so.`,
    },
    /* Counts of sets this page already draws, so none is a new measurement. */
    {
      id: "funds", label: "Funds", icon: <Handshake className="h-4 w-4" />,
      value: fmtNum(m.funds.length),
      detail: "Each fund counted once however many members hold it.",
    },
    {
      id: "folios", label: "Folios", icon: <Layers className="h-4 w-4" />,
      value: fmtNum(m.folios.length),
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
       * these capital accounts belong to funds this page does not carry, so the
       * two counts PARTITION the tile's own figure — the only form in which both
       * can be printed together.
       */
      detail: `${m.ct.count - m.capOutside} of this page's ${m.scope.accounts.length} private accounts send one`
        + (m.capOutside > 0 ? ` · ${m.capOutside} more come from funds this page does not carry` : "")
        + (m.capElsewhere.length > 0 ? ` · ${m.capElsewhere.length} more, in public-market funds, are not counted` : "")
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
  const nameAcc = bookAccessors((r) => r.label ?? null, callDate, returnMeasures);
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

  // ── WHICH RETURN A ROW SHOWS, AND SAYING WHICH ──────────────────────────────
  //
  //   *"The customer is confused about what kind of return this is that we're
  //    showing in the private market table."* (Stage 10bw)
  //
  // Every return cell is resolved here, once per row and measure, and the cell,
  // the sort and the header's count all read that one resolution. Built in the
  // render rather than in `m` because its sentences carry figures in the DISPLAY
  // currency, which `m` is not keyed on.
  //
  //   a FUND row    `fundMeasuredReturn` on the fund's own dated record, over the
  //                 row's deduped folios — Stage 10bw's resolution, unchanged;
  //   a FOLIO       the same function on ONE statement: its own holding against
  //                 its own account's calls and payouts, so a line under a fund
  //                 says the same KIND of thing the fund row does;
  //   a band, a     the whole-book rule Stage 10bw set for the footer: the return
  //   member, the   on cost under HPR and the methodology, a POOLED money-weighted
  //   total         return under XIRR, and CAGR, YTD and CY absent with the reason
  //                 — a set of funds has no one date the money went in.
  const moneyN = (n: number) => money(n);
  /** Per FUND, over the fund rows' own deduped positions — the record Stage 10bw built. */
  const fundDated = fundDatedRecords(m.scope.dedupedRows, m.commitments, m.accIdx, moneyN, fmtDate);
  /** Per FOLIO — one statement's own holding and its own capital account. */
  const folioDated = new Map(m.byFund.folios.filter((f) => f.position).map((f) =>
    [f.key, fundDatedRecords([f.position!], m.commitments, m.accIdx, moneyN, fmtDate).get(f.position!.securityKey)]));
  /** A row with no value has no return on any measure, and every measure says so. */
  const noValueReturn = (why: string) => (measure: ReturnMeasure): MeasuredReturn =>
    ({ shown: false, tag: measure === "auto" ? "AUTO" : returnMeasureDef(measure).tag, reason: why });
  const NO_VALUE_RETURN = "no value to strike a return on — nothing here values the holding";
  const groupRet = (g: BookGroup) => (g.kind !== "fund" || g.value == null
    ? (g.kind === "fund" ? noValueReturn(NO_VALUE_RETURN) : aggRet(g.folios, false, "member"))
    : (measure: ReturnMeasure) => fundMeasuredReturn(g, fundDated.get(g.securityKey ?? ""), measure, moneyN, fmtDate));
  const folioRet = (f: BookFolio) => (f.value == null ? noValueReturn(NO_VALUE_RETURN)
    : (measure: ReturnMeasure) => fundMeasuredReturn(
      { returnPct: folioFigures(f).returnPct, cost: f.cost }, folioDated.get(f.key), measure, moneyN, fmtDate));
  /**
   * A SET OF FOLIOS — a family member's row, a section band, the total.
   *
   * `consolidated` picks the dated records the pooled XIRR is struck over, and it
   * follows the set's own basis: counted once (a fund's record over its deduped
   * folios, which is the total Stage 10bw's footer struck) or as printed (each
   * statement's own record — a per-owner figure never dedupes). A record that
   * cannot carry a dated return is NAMED in the cell's hover and left out, never
   * pooled with a gap in it.
   */
  function aggRet(folios: BookFolio[], consolidated: boolean, scope: "member" | "section" | "total") {
    const fig = figuresOf(folios, consolidated);
    const held = folios.filter((f) => f.position && (!consolidated || f.counted));
    const recs = consolidated
      ? [...new Set(held.map((f) => f.fundKey))].map((k) => {
        const f = held.find((x) => x.fundKey === k)!;
        return { name: f.fundName, d: fundDated.get(k) };
      })
      : held.map((f) => ({ name: grouping === "owner" && scope !== "member" ? `${f.owner} — ${f.fundName}` : f.fundName, d: folioDated.get(f.key) }));
    const complete = (d: FundDated | undefined): d is FundDated => !!d && !d.gap && d.payouts !== "unknown";
    const pooledIn = recs.filter((r) => complete(r.d));
    const pooledOut = recs.filter((r) => !complete(r.d));
    const whose = scope === "total" ? "This is the whole private book, not one fund"
      : scope === "section" ? "This band spans several funds" : "A family member's row spans their funds";
    const unit = (n: number) => (consolidated ? (n === 1 ? "fund" : "funds") : (n === 1 ? "statement" : "statements"));
    return (measure: ReturnMeasure): RowReturn => {
      // A REFUSED cell under the methodology says AUTO, as a refused fund row
      // and a refused Monitor row do: "HPR —" would name a measure the row
      // does not show.
      const tag = measure === "auto" ? "AUTO" : returnMeasureDef(measure).tag;
      if (fig.value == null) return { shown: false, tag, reason: NO_VALUE_RETURN };
      if (measure === "auto" || measure === "absolute") {
        if (fig.returnPct == null) {
          return { shown: false, tag, reason: fig.cost == null
            ? "no cost is reported across these holdings, so there is no capital to strike a return against"
            : "the cost reported here covers only part of this row's value, and a percentage across the two would divide one set of holdings by another" };
        }
        return { shown: true, pct: fig.returnPct, tag: "HPR", note: aggHprNote(held) };
      }
      if (measure === "xirr") {
        // WHICH RECORDS THE RATE POOLS, carried whether or not it shows one: a
        // refused rate over "0 of 4" says as much as a struck one over "3 of 4".
        const pool = { covers: pooledIn.length, of: recs.length };
        if (!pooledIn.length) {
          return { shown: false, tag, pool, reason: "no fund here carries a complete dated record of what went in and what came back, so no money-weighted return can be struck across them" };
        }
        const pooled = pooledFundXirr(pooledIn.map((r) => r.d!));
        if (!pooled || pooled.pct == null) return { shown: false, tag, pool, reason: "the pooled flows do not solve to a rate" };
        if (!pooled.annualised) {
          return { shown: false, tag, pool, reason: `the pooled flows span ${pooled.windowDays} days — under a year, so an annual rate would be a projection; the holding-period return is under HPR` };
        }
        const left = pooledOut.map((r) => `${r.name} — ${r.d?.gap ?? "its payout record is not carried"}`).join("; ");
        return { shown: true, pct: pooled.pct, tag, pool,
          note: `Pooled across ${pooledIn.length} of ${recs.length} ${unit(recs.length)}: every dated call, every dated payout and each fund's own valuation date, annualised over the ${pooled.windowDays} days since the first call.`
            + (pooledOut.length ? ` Not in it: ${left}.` : "") };
      }
      return { shown: false, tag, reason: `${whose}: ${PM_AGG_NO_MEASURE[measure] ?? "no such figure applies"}` };
    };
  }
  /**
   * THE FUND ROWS' RESOLVED CELLS — what each return heading's count and hover
   * are struck on. Always the funds, whichever grouping is drawn: the measures
   * resolve per FUND, and "2 money-weighted of 4" is a statement about the four
   * funds a reader can open on either tab.
   */
  const fundCells = (measure: ReturnMeasure) =>
    m.byFund.sections.private.groups.filter((g) => g.value != null).map((g) => groupRet(g)(measure));

  // ── THE CELLS, ONE WRITER FOR EVERY ROW KIND ────────────────────────────────
  //
  // Every row of the master table writes its ten figure cells here, keyed by
  // column, so a section band, a fund, a folio and a total cannot put one
  // figure under two headings. `kind` decides only the weight of the type and
  // what an absent cell SAYS — never which column a figure lands in.
  type CellKind = "group" | "folio" | "section" | "total";
  type Cells = Partial<Record<BookCol, ReactNode>>;
  const pad = (k: CellKind) => (k === "folio" ? "px-2 py-1.5" : k === "section" ? "px-2 py-2" : "px-2 py-2.5");
  const tone = (k: CellKind) => (k === "total" ? "font-semibold text-slate-100"
    : k === "section" ? "font-medium text-slate-300" : k === "folio" ? "text-slate-300" : "text-slate-200");
  /**
   * "14 of 15 accounts" — on a band or a total, where a figure covers fewer
   * capital accounts than the row holds. ON ITS OWN LINE under the figure, so
   * the column is as wide as the figure and not as wide as the caveat.
   */
  const covered = (n: number, of: number, k: CellKind) =>
    (k === "total" || k === "section") && of > 0 && n < of
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
    /**
     * A HOVER PER COLUMN — how a figure is arrived at, on the figure itself.
     * *"Why do i need all this garbage written please remove its obvious from
     * the table what it is."* The working that stood in a drop-down and a line
     * under this table is the hover on the total it explains now, which is
     * where a reader who asks "how is this calculated?" already is.
     */
    titles?: Partial<Record<string, string>>;
  }): Cells => {
    const p = pad(k);
    const t = tone(k);
    const holdingRow = k === "group" || k === "folio";
    const td = (col: string, body: ReactNode, extra = "") => (
      <td key={col} data-col-cell={col} title={ctx.titles?.[col]} className={`${p} whitespace-nowrap text-right mono ${t} ${extra}`}>{body}</td>
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
    // ONE CELL PER PICKED MEASURE, each labelled where its header does not
    // already name what it shows: always under the methodology (whose header
    // can only say "Return"), and under a concrete measure only where the guard
    // fired — a part-year fund under CAGR or XIRR shows its holding-period
    // return, and an untagged figure under a heading reading XIRR would assert
    // an annual rate for a year the money has not been invested. What the
    // figure is struck over rides in its hover.
    for (const measure of returnMeasures) {
      const id = returnColId(measure);
      const res = r.ret ? r.ret(measure) : NO_RETURN;
      const off = measure === "auto" || res.tag !== returnMeasureDef(measure).tag;
      const part = res.pool && res.pool.covers < res.pool.of ? res.pool : null;
      out[id] = (
        <td key={id} data-col-cell={id} data-return-cell={measure} data-return-tag={off ? res.tag : undefined}
          data-return-shown={res.shown ? "1" : "0"} data-return-pct={res.shown ? res.pct.toFixed(4) : undefined}
          {...(k === "total" ? {
            "data-return-foot": measure,
            "data-return-foot-covers": res.pool?.covers,
            "data-return-foot-of": res.pool?.of,
          } : {})}
          className={`${p} whitespace-nowrap text-right mono ${t}`}>
          {off && <span className="ret-tag mr-0.5">{res.tag}</span>}
          {res.shown
            ? <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true, decimals: 1 })}
                {part && <span className="text-[10.5px] font-normal text-slate-500"> · {part.covers} of {part.of}</span>}</span>
            : <AbsentCell reason={res.reason} />}
        </td>
      );
    }
    if (ctx.weight !== undefined) {
      out.weight = ctx.weight == null ? absent("weight", ctx.weightWhy ?? "no value to weigh")
        : td("weight", `${ctx.weight.toFixed(1)}%`, "text-slate-400");
    }
    if (holdingRow || k === "section") out.asOf = asOfCell();
    return out;
  };
  /**
   * A row's cells in the DECLARED order `<Tr>` expects, an empty cell where a
   * column has none — walked over the EXPANDED list, so a return column the
   * reader picked is a column on every row.
   */
  const inOrder = (c: Cells, k: CellKind) =>
    bookCols.slice(1).map((col) => c[col] ?? <td key={col} className={pad(k)} />);

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
      : section === "private"
        ? "no folio of this fund sends a capital-account statement — the holding is reported without a commitment"
        : "no capital-account statement for these folios";

  const weightWhy = (_section: BookSectionId) => "no value to weigh — a share of the private market value needs a value";

  /** A fund or member row, its folios when open, and its "counted once" line. */
  const renderGroup = (g: BookGroup) => {
    const key = rowKey(g);
    const open = rows.isOpen(key) || (!!needle && !g.label.toLowerCase().includes(needle) && g.folios.some((f) => folioText(f).includes(needle)));
    const toggle = () => rows.toggle(key);
    const inPrivate = g.section === "private";
    const kids = sortRows(
      g.folios.map((f) => ({
        f, label: grouping === "fund" ? f.owner : f.fundName,
        fig: { ...folioFigures(f), callKey: grouping === "owner" ? folioCallKey(f) : null, ret: folioRet(f) },
      })),
      bookView.sort,
      Object.fromEntries(Object.entries(nameAcc).map(([c, a]) => [c, (x: { fig: RowFigures; label: string }) => a({ ...x.fig, label: x.label })])),
    );
    const scheme = (f: BookFolio) => f.capital;
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
            ...figureCells({ ...g, ret: groupRet(g) }, "group", {
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
              data-pm-capital-account={f.capital?.accountId ?? undefined}
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
  // A RETURN IS NOT AN ADJUSTMENT: the line is arithmetic on the holding
  // columns, so every return column is an empty cell here, whichever are picked.
  const overlapRow = (o: Overlap, key: string, statements: number, weigh: boolean) => (
    <Tr view={bookView} key={`${key}-overlap`} className={TREE_ROW.adjust}
      data-pm-overlap={key} data-printed={Math.round(o.printed)} data-consolidated={Math.round(o.consolidated)} data-overlap={Math.round(o.value)}>
      <TreeNameCell depth={1} last
        title={<span className="text-amber-400">Counted once</span>}
        hint={grouping === "fund"
          ? `The same holding is reported on ${statements} statements; the row above counts it once, and this line takes the overlap out so the folios add to the row.`
          : `${statements} statements report the same holdings twice between them; the total counts each once, and this line takes the overlap out.`} />
      {inOrder({
        units: <td key="units" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>{o.units != null ? `−${fmtNum(o.units, 3)}` : ""}</td>,
        cost: <td key="cost" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>{o.cost != null ? `−${money(o.cost)}` : ""}</td>,
        value: <td key="value" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`} data-col-cell="value">−{money(o.value)}</td>,
        weight: <td key="weight" className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>{weigh && pct(o.value) != null ? `−${pct(o.value)!.toFixed(1)}%` : ""}</td>,
      }, "folio")}
    </Tr>
  );

  /** A section band — heading, marker, and the section's own totals in their columns. */
  const renderSection = (id: BookSectionId) => {
    const s = book.sections[id];
    if (!s.groups.length) return null;
    const copy = SECTION_COPY[id];
    const title = copy.title;
    const open = sectionOpen(id);
    // EACH ROW CARRIES ITS OWN RETURN RESOLVER before it is sorted, so the
    // return columns order the rows on the figure each one prints.
    const shown = sortRows(
      s.groups.filter(groupMatches).map((g) => ({ ...g, ret: groupRet(g) })),
      bookView.sort, nameAcc as Record<string, Accessor<BookGroup & { ret: (m: ReturnMeasure) => MeasuredReturn }>>);
    const noun = grouping === "fund" ? (s.groups.length === 1 ? "fund" : "funds") : (s.groups.length === 1 ? "member" : "members");
    // COUNTS ON THE FACE, THE BASIS IN THE HOVER. *"its obvious from the table
    // what it is"* — the band said which basis it is on and why the missing-data
    // section adds to no value in a line of its own; both ride on the band's
    // hover now, and the band keeps its counts, which are data.
    const sub = `${s.groups.length} ${noun} · ${s.folios} folios`;
    const hint = id === "private"
      ? (grouping === "fund"
        ? "Each holding counted once. Where two statements report one holding, the fund row counts it once and its folios show both, with a Counted once line so they add to the row."
        : "Each statement as printed. A holding two members' statements both report is on both of their rows, and the Counted once line at the foot of this section takes the overlap out.")
      : `The statements carry no value, so the ${money(s.paid)} paid in here is in no value total on this page — missing data, never a zero.`;
    return (
      <Fragment key={id}>
        <Tr view={bookView} className={`${TREE_ROW.section} ${id === "private" ? "" : "cursor-pointer"}`}
          {...(id === "private" ? {} : rowToggle(() => sections.toggle(id)))}
          data-pm-section={id} data-pm-section-funds={s.groups.length} data-pm-section-folios={s.folios}
          data-pm-section-open={open ? "true" : "false"}>
          <TreeSectionCell title={title} marker={copy.marker && <span data-pm-marker={id}>{copy.marker}</span>} sub={sub} hint={hint}
            open={open} onToggle={() => sections.toggle(id)}
            toggleData={{ "data-pm-section-toggle": id }} />
          {inOrder(figureCells({ ...s, ret: aggRet(s.groups.flatMap((g) => g.folios), grouping === "fund", "section") }, "section", {
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

  /**
   * THE TOTAL — the whole table, each holding counted once, and every capital
   * account on the page in its capital columns. ONE row, because since the
   * family placed their funds (Stage 10bw) there is no capital account on this
   * page outside the two sections: the private total and "every capital
   * account" are the same set. Drawn with `TrFoot` so its label span follows the
   * reader's column order.
   */
  const totalRow = (fig: BookFigures, label: ReactNode, extra: {
    labelTitle?: string;
    titles?: Partial<Record<string, string>>;
    attrs?: Record<`data-${string}`, string | undefined>;
  } = {}) => (
    <TrFoot view={bookView} key="private" data-pm-total="private" data-pm-capital-accounts={fig.capitalAccounts}
      {...(extra.attrs ?? {})}
      className={`${TREE_ROW.total} border-t-2 border-ink-600 ${TREE_CELL.parent} font-semibold text-slate-200`}
      label={label} labelTitle={extra.labelTitle}
      cells={figureCells({ ...fig, ret: aggRet(book.folios, true, "total") }, "total", {
        noCapital: fig.capitalAccounts === 0 ? "no capital account on this page" : undefined,
        noValue: "no value",
        weight: 100,
        titles: extra.titles,
      }) as Record<string, ReactNode>} />
  );

  /**
   * ── THE WORKING, ON THE TOTAL IT EXPLAINS ─────────────────────────────────
   *
   *   *"Why do i need all this garbage written please remove its obvious from
   *    the table what it is … We have such random one-liners, two-liners, and
   *    footnotes everywhere across the product."*
   *
   * A drop-down under this table ("How the capital totals are worked out") and
   * a line beneath it ("This page is the private side of the book…") carried
   * the arithmetic behind the capital totals and a clause naming the capital
   * accounts this page leaves out. Both went. What they said that a reader can
   * act on is the HOVER ON THE TOTAL IT QUALIFIES — the client's own question
   * was *"how are you calculating this uncalled capital of 16 crores?"*, and
   * the place a reader asks it is the figure. The sides of the book line went
   * without a new home: the Market value tile states this page's share of the
   * whole book, and Morning CIO's Concentration card prints every side.
   *
   * THE PUBLIC-MARKET FUNDS' CAPITAL ACCOUNTS ARE STILL NAMED, NEVER DROPPED —
   * in the Committed total's hover, beside the figure they are left out of,
   * and on the total row's own handles so the sweep can hold them to the book.
   * Every clause is conditioned on what is true of these accounts rather than
   * of this book's four (Stage 10bw).
   */
  const capElsewhereClause = (() => {
    const els = m.capElsewhere;
    if (!els.length) return null;
    const n = els.length;
    const one = n === 1;
    const listed = els.every((x) => x.side === "listed");
    const byFamily = listed && els.every((x) => x.basis === "family");
    const held = els.every((x) => m.owned.has(x.commitment.accountId));
    return `${n} more capital account${one ? " belongs" : "s belong"} to `
      + `${listed ? "public-market funds" : "funds this page does not place on the private side"} — `
      + `${[...new Set(els.map((x) => x.commitment.name))].join(", ")}, `
      + `${money(sumOrNull(els.map((x) => x.commitment.committed)))} committed — and ${one ? "is" : "are"} counted nowhere on this page`
      + (byFamily ? `: the family class ${one ? "that fund" : "those funds"} as investing in listed equity` : "")
      + (held ? `, and ${one ? "its holding is" : "their holdings are"} in the Portfolio Monitor’s AIF section` : "")
      + ".";
  })();
  const capCount = book.privateTotal.capitalAccounts;
  const capTitles: Partial<Record<string, string>> = {
    committed: [
      `Promised across the ${capCount} private-market capital account${capCount === 1 ? "" : "s"} on this page.`,
      capElsewhereClause,
    ].filter(Boolean).join(" "),
    // WHETHER CALLED AND PAID IN MAY BE SET AGAINST EACH OTHER IS MEASURED PER
    // ACCOUNT (Stage 10bw): where the two cover different accounts the hover on
    // the Called total says not to subtract them, and where they cover one set
    // it says they may — a warning about a valid subtraction would be false.
    called: m.calledPaidSameSet
      ? `Asked for by the funds so far, over the ${m.cc.calledOf} accounts that print a called line — the same accounts Paid in covers.`
      : `Called and Paid in cover different accounts and must not be subtracted from each other: the ${m.cc.count - m.cc.calledOf} account${m.cc.count - m.cc.calledOf === 1 ? "" : "s"} missing from the first ${m.cc.count - m.cc.calledOf === 1 ? "is" : "are"} present in the second.`,
    uncalled: [
      `Summed exactly as each fund prints it — ${money(m.cc.uncalled)} over the ${m.cc.uncalledOf} accounts that print the line — and never derived from committed − called, because a fund that prints no uncalled figure has not said it has nothing left to call.`,
      m.cc.called != null && m.cc.committedWhereCalled != null
        ? `The same figure the other way: committed ${money(m.cc.committedWhereCalled)} less called ${money(m.cc.called)} is ${money(m.cc.committedWhereCalled - m.cc.called)}, both struck over the same ${m.cc.calledOf} accounts.`
        : null,
      `${m.cc.count - m.capOutside} of this page’s ${m.scope.accounts.length} private accounts send a capital-account statement, and the family’s own investment register names funds with no statement in this book at all — so ${money(m.cc.uncalled)} is the floor of what the funds can still call, never the ceiling.`,
    ].filter(Boolean).join(" "),
  };

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

      {/* THE "MARKS SPAN" LINE IS GONE, at the family's request (*"its obvious
          from the table what it is"*). Every row's As of cell carries its own
          statement's date — never `portfolio.asOf`, which is newer than every
          mark on this page — and `check:pages` holds the newest of them to the
          book's own newest private mark. */}

      <SelectableTiles page="private-market" storageKey={PM_TILES_KEY} defaults={PM_DEFAULT_TILES} metrics={tileMetrics} />

      {/* ── THE ONE TABLE ────────────────────────────────────────────────────
          Three tabs of one card. The first two are the same folios grouped two
          ways, in the same columns; the third is the dated record. See the note
          at the top of this file for what each section holds and why two of
          them start closed. */}
      <Card className="mt-5" pad={false} title={active.cardTitle}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <SearchInput value={q} onChange={setQ}
              placeholder={view === "transactions" ? "Search calls…" : view === "owners" ? "Search members or funds…" : "Search funds or members…"}
              className="w-56"
              suggestions={view === "transactions"
                ? [...new Set(m.history.map((c) => c.fund))]
                : allGroups.map((g) => g.label)} />
            {/* THE RETURN PICKER, where the return columns are. The Monitor's own
                control and its own `?ret=` param, with the hints this page's
                funds make true (`PM_RETURN_HINTS`) — the Monitor's XIRR hint
                says the statements carry no per-holding cash flows, which is
                false of a drawdown fund. */}
            {view !== "transactions" && (
              <ReturnMeasureSelect measures={returnMeasures} onChange={setReturnMeasures} hints={PM_RETURN_HINTS} source={returnSource} />
            )}
            {view !== "transactions" && <ExpandAllButton allOpen={allOpen} onClick={toggleAll} />}
          </div>
        }>

        {view !== "transactions" && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]" data-pm-table={view}>
              <thead className="border-b border-ink-700">
                <Tr view={bookView}>
                  <SortHeader col="name" view={bookView} align="left" className="min-w-[15rem]">{grouping === "fund" ? "Fund" : "Family member"}</SortHeader>
                  {/* ── THE LABELS ALONE, THE MEANING IN THE HOVER ─────────────────
                      Each heading carried a word under it — "promised", "asked
                      for", "cash sent". The family asked for the lines that say
                      what the table is to go (*"its obvious from the table what
                      it is"*), and every one of those words is the first thing
                      its heading's own hover already says. */}
                  <SortHeader col="committed" view={bookView} pad="px-2 py-2"
                    title="Promised: what the family signed up to invest, whether or not the fund has asked for it yet.">Committed</SortHeader>
                  <SortHeader col="called" view={bookView} pad="px-2 py-2"
                    title="Asked for: what the fund has demanded so far, off the line its own statement labels.">Called</SortHeader>
                  <SortHeader col="paid" view={bookView} pad="px-2 py-2"
                    title="Cash sent: what has actually left the family's bank for this fund — its capital account.">Paid in</SortHeader>
                  <SortHeader col="uncalled" view={bookView} pad="px-2 py-2"
                    title="Not yet asked for: promised and not yet called, exactly as the fund prints it — never worked out as committed − called. A bill that can arrive any day, never added to a value.">Still to<br />call</SortHeader>
                  <SortHeader col="units" view={bookView} pad="px-2 py-2">Units</SortHeader>
                  <SortHeader col="cost" view={bookView} pad="px-2 py-2"
                    title="Of the units held: what they cost, off the holding statement — a different document from the capital account's Paid in.">Cost</SortHeader>
                  <SortHeader col="value" view={bookView} pad="px-2 py-2"
                    title="The fund's own mark: what the holding is worth on the fund's own statement date.">Value</SortHeader>
                  {/* ONE HEADING PER PICKED MEASURE, each a `SortHeader` like its
                      neighbours. The count of FUNDS the measure answers and the
                      reason the rest do not are the heading's HOVER — the count
                      rides on `data-col-coverage` rather than as a line under the
                      label — both struck on the SAME resolved cells the fund rows
                      draw, so the count and the dashes cannot describe different
                      sets. `auto` gets neither: it resolves per row, and every
                      cell's own tag says which return it is. */}
                  {returnMeasures.map((measure) => {
                    const def = returnMeasureDef(measure);
                    const auto = measure === "auto";
                    const meta = fundReturnColumnMeta(measure, fundCells(measure), PM_RETURN_HINTS[measure] ?? def.hint);
                    return (
                      <SortHeader key={measure} col={returnColId(measure)} view={bookView} pad="px-2 py-2"
                        title={auto ? PM_RETURN_HINTS.auto : meta?.title}
                        coverage={meta?.note}>
                        {auto ? "Return" : def.tag}
                      </SortHeader>
                    );
                  })}
                  <SortHeader col="weight" view={bookView} pad="px-2 py-2"
                    title="Of the private book: the row's value as a share of the private market value — the same denominator on every row.">Weight</SortHeader>
                  <SortHeader col="asOf" view={bookView} pad="px-2 py-2" align="left">As of</SortHeader>
                  {/* THE COLUMN THAT REPLACED THE CAPITAL-CALL TIMELINE. Its hover
                      is where the reason it exists lives — no fund publishes a
                      forward schedule. While the store cannot be read the note
                      under the heading names the cause, and every cell names it
                      too, in a word, and opens the editor that says why: a
                      column of dashes read as "nothing entered". */}
                  <SortHeader col="call" view={bookView} pad="px-2 py-2" align="left"
                    title={CALL_COLUMN_TITLE}
                    note={entered.state.status === "unavailable" ? CAUSE_WORD[entered.state.cause].toLowerCase() : "you enter"}
                    noteTitle={entered.state.status === "unavailable" ? entered.state.reason : undefined}>Capital<br />call</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {renderSection("private")}
                {renderSection("unvalued")}
              </tbody>
              <tfoot>
                {totalRow(book.privateTotal, "Private market total", {
                  labelTitle: `Each holding counted once, and the ${capCount} capital account${capCount === 1 ? "" : "s"} on this page — what the capital tiles add to.`,
                  titles: capTitles,
                  // THE ACCOUNTS ONLY NAMED, on the row whose Committed total
                  // names them — the ids, and the clause itself, so the sweep
                  // reads what the hover says rather than a paragraph.
                  attrs: m.capElsewhere.length ? {
                    "data-pm-cap-elsewhere": m.capElsewhere.map((x) => x.commitment.accountId).join(" "),
                    "data-pm-cap-elsewhere-text": capElsewhereClause ?? undefined,
                  } : undefined,
                })}
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
                    sub={`${m.history.length} calls`}
                    hint="A fund's calls are listed only where they reproduce the total its own statement prints — otherwise none of that fund's are shown." />
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

        {/* THE DROP-DOWN "How the capital totals are worked out" AND THE LINE
            "This page is the private side of the book…" STOOD HERE, and both
            went at the family's request: *"Why do i need all this garbage
            written please remove its obvious from the table what it is."* The
            working is the hover on the capital totals it explains (see
            `capTitles`), and the capital accounts of public-market funds are
            named in the Committed total's hover. */}
      </Card>
    </div>
  );
}
