import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Handshake, Landmark, Wallet, TrendingUp, Fuel, Coins, Banknote, HelpCircle, CalendarClock, Layers, Users, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { SelectableTiles, type TileMetric } from "@/components/SelectableTiles";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { withReviewAccessors, type ReviewScope } from "@/lib/reviewColumns";
import { EditColumns } from "@/components/EditColumns";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { useViewParam } from "@/components/ViewToggle";
import { AbsentCell, AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { CallCell, CallEditor } from "@/components/EnteredCalls";
import {
  TREE_ROW, TREE_CELL, useExpanded, rowToggle, TreeNameCell, TreeSectionCell, ExpandAllButton,
} from "@/components/TreeTable";
import { usePortfolio } from "@/context/PortfolioContext";
import { ownerDisplayName } from "@/lib/owners";
import { stockHref } from "@/lib/auditFormulas";
import {
  sum, sumOrNull, consolidatedMarketValue, returnMeasureDef, isPrivateClass, dedupedPositions,
  isValuedAtCost, AT_COST_RETURN,
  type MeasuredReturn, type ReturnMeasure,
} from "@/lib/analytics";
import { BOOK_CORPORATE_ACTIONS, BOOK_CAPITAL_MOVES, BOOK_SHARE_MOVEMENTS, BOOK_REVIEW_FLOWS } from "@/data/glowData";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals, unvaluedAccounts, unvaluedDrawn,
  countedOnceNote,
} from "@/lib/privateMarket";
import { isValuedByNoStatement } from "@/lib/aifCategory";
import {
  fundDatedRecords, fundMeasuredReturn, fundReturnColumnMeta, pooledFundXirr,
  PM_AGG_NO_MEASURE, PM_RETURN_HINTS, type FundDated,
} from "@/lib/fundReturns";
import { ReturnMeasureSelect, useReturnMeasures } from "@/components/ReturnMeasureSelect";
import { withReturnCols, returnAccessorsFor, returnColId } from "@/lib/returnColumns";
import {
  privateBookFolios, distributionLeftOutNote, privateBook, figuresOf, BOOK_SECTIONS,
  type BookFigures, type BookFolio, type BookGroup, type BookSectionId, type Overlap, type PrivateBook,
} from "@/lib/privateBook";
import { callTotals, callHistory } from "@/lib/capitalCalls";
import { useEnteredCalls, headlineCall, todayIso, CAUSE_WORD } from "@/lib/enteredCalls";
import { fmtPct, fmtNum, fmtDate, changeColor } from "@/lib/format";
import { fifoTotals, positionFifoReturn, atCostNote } from "@/lib/fifo";

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
// and three sections inside the first two: the private funds with a value
// (open), the private investments the family's consolidated review records at
// what was paid and no valuation (open — Stage 10dh), and the private accounts
// with NO value (closed, marked "missing data").
//
// ── THE CONSOLIDATED REVIEW IS THE SOURCE FOR PRIVATE MARKETS ──────────────
//
//   *"for private market data you can use the MOPWM as the source, no need to
//    make it a separate tab... just integrate it normally as the source"*
//
// So the review's private lines are book positions (`scripts/lib/reviewBook.mjs`,
// Stage 10dh) and arrive here like any other holding, under their member's
// "Consolidated review (MOPWM)" account and on the review's own date. There is
// no review tab any more. A line the review holds at cost is valued at that
// cost and sits under Held at cost, where it is in the value and in Invested and
// in no gain or return.
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
  /*
   * THE FAMILY'S PRIVATE INVESTMENTS AT COST (Stage 10dh): the lines their
   * consolidated review records at what was paid and no valuation. Open on
   * arrival, because they are most of the private book's value; a band of their
   * own, because a return struck over them would be a 0% nobody measured.
   */
  atCost: { title: "Private Companies ( Held at cost )", marker: null, defaultOpen: true },
  unvalued: {
    title: "Not valued",
    marker: <Pill tone="warn" className="whitespace-nowrap">missing data</Pill>,
    defaultOpen: false,
  },
};

/** A row of figures in the shape the accessors read — a group, a section, a total or a folio. */
type RowFigures = Pick<BookFigures, "committed" | "called" | "paid" | "uncalled" | "units" | "cost" | "value" | "returnPct" | "deployed" | "deployedHeld" | "asOf">
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
type RowReturn = MeasuredReturn & {
  pool?: { covers: number; of: number };
  /** The pooled records held under a year, and the pool without them (PM-D3). */
  subYear?: { name: string; days: number }[];
  withoutSubYear?: number | null;
};

const folioReviewScope = (f: BookFolio): ReviewScope => ({ positions: f.position ? [f.position] : [], securityKey: f.securityKey ?? undefined, accountId: f.accountId });
const groupReviewScope = (g: BookGroup): ReviewScope => ({ positions: g.folios.flatMap((f) => f.position ? [f.position] : []), securityKey: g.securityKey ?? undefined });
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
  // …and what it divides by: the cost of the units held plus what the units
  // already redeemed cost (DL-16), null wherever the return is.
  deployed: f.position && f.cost != null && f.cost > 0 && f.pnl != null && positionFifoReturn(f.position) != null
    ? f.cost + (f.position.costOfUnitsSold ?? 0) : null,
  // …and the part of it the Cost column shows, so a row's hover names its two
  // parts without subtracting the Cost cell (Stage 10dh).
  deployedHeld: f.position && f.cost != null && f.cost > 0 && f.pnl != null && positionFifoReturn(f.position) != null
    ? f.cost : null,
  asOf: f.asOf ? [f.asOf] : [],
});

/** A small count in words, the way the page's sentences say it; a figure past ten stays a figure. */
const countWord = (n: number): string =>
  ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);

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
    ? "FIFO, not annualised: the gain on the units held plus the gain on units redeemed, over what those units cost — not a return on Paid in. The principal returned on redeemed units is in it; income, equalisation and any payout that redeemed no units are not — XIRR counts those."
    : "FIFO, not annualised: the gain on the units held, over what they cost — not a return on Paid in. Cash the funds have paid back is not in it — XIRR counts it.";

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
  /**
   * TWO BASES, EACH WHERE IT BELONGS (B-01). The ROWS are statement marks — a
   * reader checks them against each fund's own capital account (§6), and no
   * private holding resolves a symbol a quote could move. The BOOK every "of the
   * book" is struck against is the one the top bar shows (`live`): every holding
   * at its current value, a live price where a quote has landed and each mutual
   * fund at its published NAV. One figure, one value, on one screen.
   */
  const { statementPortfolio: portfolio, portfolio: live, fmtFromBase } = usePortfolio();
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
  const bookView = useTableView("pm-book", bookCols, { reviewKind: "holding", manualEditor: true });
  const callView = useTableView("pm-calls", CALL_COLS, { manualEditor: true });
  /**
   * THE CALLS THE FAMILY HAS ENTERED, and which row's editor is open. Called up
   * here with the page's other hooks, before any early return — a hook below
   * one runs on some renders and not others.
   */
  const entered = useEnteredCalls();
  const [openCall, setOpenCall] = useState<string | null>(null);
  const today = todayIso();

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * THE RUPEE AS THE STATEMENT PRINTS IT (PM-D2). A dated call is read against
   * the fund's own letter, and compact rounding printed Sky Capital's ₹1,35,000
   * drawdown as "₹1.4 L" — a figure that letter does not carry. A table of
   * statement rows, and a hover that reconciles one amount against another,
   * print the rupee; the tiles and the master table keep the compact figure.
   */
  const moneyFull = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: false, sign });

  const m = useMemo(() => {
    if (!portfolio) return null;
    /**
     * ONE BUILD OF THE PRIVATE BOOK — `privateBookFolios`, which Morning CIO's
     * Distributions tile reads too, so the tile and this page cannot count the
     * funds' distributions two ways (B-10).
     */
    const pb = privateBookFolios(portfolio, BOOK_CORPORATE_ACTIONS, ownerDisplayName);
    const accIdx = pb.accIdx;
    /**
     * CURRENT HOLDINGS, LIKE EVERY OTHER ALLOCATION SURFACE — and deliberately
     * NOT for `unvaluedAccounts`, which asks whether an account reports any
     * holding at all. Narrowing it would fold 3P's account into the list of
     * funds that publish no NAV, which is the opposite of true: it publishes
     * one and redeemed against it.
     */
    const current = pb.current;
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
    const cap = pb.cap;
    const commitments = cap.onPage;

    const funds = fundRollup(scope.dedupedRows, accIdx, scope.rows);
    const folios = folioRows(scope.rows, accIdx);
    const owners = ownerRollup(scope.rows, accIdx);
    /**
     * ── EACH CAPITAL ACCOUNT ONCE WITH ITS HOLDING ────────────────────────────
     *
     * The tiles and the table's total count a capital account on the basis its
     * holding is counted — `capitalCountedOnce`, the one rule `privateBook.ts`
     * applies to every consolidated row. Struck over the same private holdings
     * the table draws, in book order, so the capital that stands for a dedupe
     * group is the capital of the member whose holding does. The accounts it
     * leaves out are NAMED in each capital tile's hover with their figures.
     */
    const counting = cap.counting;
    const countedIds = new Set(counting.counted.map((c) => c.accountId));
    const ct = commitmentTotals(counting.counted);
    /**
     * THE CAPITAL ACCOUNTS, per scheme — read ONCE and handed to the table, the
     * tiles and the Transactions tab alike, so they cannot describe different
     * registers.
     */
    const schemes = pb.schemes;
    // Money totals over the COUNTED capital accounts; the dated history below is
    // every call as its own statement prints it, a per-account record.
    const cc = callTotals(schemes.filter((s) => countedIds.has(s.accountId)));
    // …AND WHAT THE ACCOUNTS LEFT OUT WOULD ADD, so every hover can say it in
    // rupees: "if these are two investments, add ₹X".
    const alsoIds = new Set(counting.alsoReported.map((x) => x.commitment.accountId));
    const alsoCt = commitmentTotals(counting.alsoReported.map((x) => x.commitment));
    const alsoCc = callTotals(schemes.filter((s) => alsoIds.has(s.accountId)));
    const history = callHistory(schemes);
    // PRIVATE-MARKET ACCOUNTS ONLY, by the same rule as the capital register:
    // Motilal Oswal's Hedged Equity strategy is an AIF holding nothing too, and
    // it is not a private-market fund. AND ONLY THE ONES HELD AND VALUED BY NO
    // STATEMENT — `isValuedByNoStatement`, the definition the AIF drill-down
    // reads too: an income-only folio's units are valued under another account,
    // and a redeemed one holds nothing to value.
    const unvalued = unvaluedAccounts(portfolio.accounts, portfolio.positions, commitments)
      .filter((u) => u.side === "private" && isValuedByNoStatement(u.account));

    // CONSOLIDATED — each dedupeGroup once — SUMMED FROM THE FUND ROWS, never
    // struck independently: a total must tie to its own columns.
    const privMV = sum(funds.map((f) => f.mv));
    const privCost = sumOrNull(funds.map((f) => f.cost));
    const privPnL = sumOrNull(funds.map((f) => f.pnl));
    const costedRows = scope.dedupedRows.filter((p) => p.costBasis != null);
    // FIFO over the holdings that report a cost — the same aggregator every
    // other return on the dashboard is struck with, so a redemption's realised
    // gain stays in the private book's return rather than leaving it.
    //
    // …AND CARRY A VALUE (Stage 10dh). A private investment the family's
    // consolidated review holds at cost has no gain to strike, and folded in it
    // would refuse the whole book's return: `fifoTotals` refuses a set mostly
    // held at cost, and these are most of the private value. So the return is
    // struck over the valued holdings and the at-cost part is NAMED beside it —
    // the Portfolio Monitor footer's own split (B-07).
    const atCostRows = costedRows.filter(isValuedAtCost);
    const privFifo = fifoTotals(costedRows.filter((p) => !isValuedAtCost(p)));
    const privAtCost = { atCost: atCostRows.length, atCostValue: sum(atCostRows.map((p) => p.marketValue)) };
    const costedMV = sum(funds.map((f) => f.costedMV));
    // THE TOP BAR'S BOOK — the same consolidated figure, from the same positions.
    const bookPositions = live?.positions ?? portfolio.positions;
    const bookMV = live?.totalValue ?? consolidatedMarketValue(portfolio.positions);
    // …and the private side OF that book, to say on screen that it is these rows.
    const privLive = sum(dedupedPositions(bookPositions).filter(isPrivateClass).map((p) => p.marketValue));
    // RAW — every statement as printed. Never the same number, by design.
    const rawMV = sum(scope.rows.map((p) => p.marketValue));

    // THE MASTER TABLE, both groupings off one set of folios.
    // The funds' own distribution letters are in it — 360 ONE's two
    // income-only folios report theirs nowhere else (B-10).
    const all = pb.folios;

    return {
      accIdx, scope, funds, folios, owners, ct, unvalued, commitments,
      schemes, cc, history, counting, alsoCt, alsoCc,
      privMV, privCost, privPnL, privFifo, privAtCost, costedMV, costedCount: costedRows.length, bookMV, rawMV,
      unvaluedDrawn: unvaluedDrawn(unvalued),
      unvaluedNoNav: unvalued.filter((u) => u.kind === "no-nav"),
      // THE PRIVATE SIDE OF THE TOP BAR'S BOOK, for the value tile's hover to
      // say it is these rows (B-01). The sides line that also printed it went
      // at the family's request (Stage 10co); the tile states the page's share.
      privLive,
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
      /**
       * ── WHAT THE PRIVATE HOLDINGS REALISED, AND WHY THE REST CARRY NOTHING ──
       *
       * DL-13. Struck on the holdings the table counts. A realised figure the
       * book carries is FIFO off the fund's own dated record — Neo Infra's
       * 14,162.8 units redeemed at their cost, a measured nil — and is shown for
       * those; each of the rest names its account's own reason, verbatim from
       * the book's capital-gain record, and whether any redemption of its units
       * is on record at all. Never "no statement covers any private account"
       * over a holding the book measured.
       *
       * THE REASONS ARE GROUPED, because several accounts share one (Stage
       * 10dh): the holdings that carry it are listed and the sentence is
       * printed once. Printed per holding it ran to 11,940 characters with one
       * sentence repeated 76 times, which is the hover nobody reads that this
       * book's own prose rule exists to stop.
       */
      realised: (() => {
        /*
         * STRUCK ON THE HOLDINGS A FUND VALUES, AND THE REST NAMED IN A CLAUSE
         * (Stage 10dh). It was every private holding, so the denominator read
         * "1 of 90" over a tile whose subject is the funds that publish a
         * capital account, and the hover printed one sentence 76 times — 11,940
         * characters — about review lines that record a payment and no sale.
         */
        const rows = scope.dedupedRows.filter((p) => !isValuedAtCost(p));
        const atCost = scope.dedupedRows.filter(isValuedAtCost);
        const cg = new Map((portfolio.capitalGains ?? []).map((e) => [e.accountId, e]));
        const redeemed = (p: (typeof rows)[number]) => BOOK_CAPITAL_MOVES.filter((x) => x.accountId === p.accountId
          && x.securityKey === p.securityKey && x.direction === "out" && x.units != null && x.units < 0);
        return {
          value: sumOrNull(rows.map((p) => p.realizedPnL ?? null)),
          of: rows.length,
          covered: rows.filter((p) => p.realizedPnL != null).map((p) => ({ position: p, redeemed: redeemed(p) })),
          missing: rows.filter((p) => p.realizedPnL == null).map((p) => ({
            position: p, why: cg.get(p.accountId)?.absent ?? null, redeemed: redeemed(p),
          })),
          atCost: { atCost: atCost.length, atCostValue: sum(atCost.map((p) => p.marketValue)) },
        };
      })(),
      /**
       * ── UNITS A DEPOSITORY HOLDS BEYOND THE FUND'S OWN STATEMENT (VD-6) ──
       *
       * Joined on the ISIN, the holder and the date, never on a name: a
       * depository window for the same ISIN in another account of the SAME
       * holder that runs past the fund statement's own date and closes on a
       * different unit count. Baring's 31 Mar statement prints 202.5 units, and
       * Ankita's Motilal Oswal demat holds 252.5 at 31 Jul — so the row is a
       * statement the depository has since overtaken, and says so.
       */
      newerUnits: (() => {
        const out = new Map<string, { accountId: string; closing: number; periodFrom: string; periodTo: string; held: number; asOf: string | null }>();
        const windows = Object.values(BOOK_SHARE_MOVEMENTS);
        for (const p of scope.dedupedRows) {
          if (!p.isin) continue;
          const own = accIdx.get(p.accountId);
          const asOf = own?.asOf ?? null;
          for (const w of windows) {
            if (w.isin !== p.isin || w.accountId === p.accountId || w.closing == null || !w.periodFrom || !w.periodTo) continue;
            if (accIdx.get(w.accountId)?.ownerId !== own?.ownerId) continue;
            if (asOf && w.periodTo <= asOf) continue;
            if (p.quantity === null || Math.abs(w.closing - p.quantity) < 0.0005) continue;
            out.set(p.securityKey, { accountId: w.accountId, closing: w.closing, periodFrom: w.periodFrom, periodTo: w.periodTo, held: p.quantity, asOf });
          }
        }
        return out;
      })(),
      byFund: privateBook(all, "fund"),
      byOwner: privateBook(all, "owner"),
    };
  }, [portfolio, live]);

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
  /** An account as a reader finds it on its own statement: the platform and the number it prints. */
  const accName = (id: string) => {
    const a = m.accIdx.get(id);
    return a ? `${a.provider} ${a.accountNo}` : id;
  };
  /**
   * ── THE CAPITAL ACCOUNT COUNTED ONCE WITH ITS HOLDING, SAID IN EVERY HOVER ─
   *
   * A capital tile counts a capital account on the basis its holding is counted
   * (`capitalCountedOnce`). Where two statements report one holding, the second
   * statement's capital is left out — and every tile that sums capital NAMES
   * it, says what it would add, and says the pair is pending the family's
   * answer (PM-A1: whether it is one investment reported twice or two
   * investments of the same size is theirs to say, and §4c's counted-once
   * policy stands until they do).
   */
  const alsoNote = (extra: number | null | undefined, what: string) =>
    countedOnceNote(m.counting, accName, (n) => money(n), extra, what);
  const moneyN = (n: number) => money(n);
  /** Per FUND, over the fund rows' own deduped positions — the record Stage 10bw built. */
  const fundDated = fundDatedRecords(m.scope.dedupedRows, m.commitments, BOOK_REVIEW_FLOWS, m.accIdx, moneyN, fmtDate);
  /**
   * ── WHAT THE FUNDS PAID BACK, AND HOW IT MEETS THE XIRR (B-10) ───────────
   *
   * The tile sums what each fund's own papers report as a DISTRIBUTION, on the
   * table's own counted-once basis: a capital account's distribution total
   * (income and principal, before TDS; never equalisation, which the statements
   * print apart) and an income-only folio's distribution letters (the amount the
   * letter says was remitted). Each fund's XIRR counts a different set of the
   * same cash — every payout dated on or before its own valuation, equalisation
   * included — so the tile's hover walks from one to the other, fund by fund,
   * in the XIRR's own figures rather than a restatement of them.
   */
  const distFig = m.byFund.privateTotal;
  const distParts = m.byFund.folios
    .filter((f) => f.distributed != null && f.distributionCounted)
    .sort((a, b) => (b.distributed ?? 0) - (a.distributed ?? 0));
  const distLeftOut = m.byFund.folios.filter((f) => f.distributed != null && !f.distributionCounted && f.distributedBasis != null);
  const distWords = (f: BookFolio) => f.distributedBasis === "letter"
    ? `${money(f.distributed)} — the amount ${f.provider} ${f.accountNo}'s distribution letter says was remitted, after the fund's expenses and TDS`
    : f.distributed === 0
      ? `${money(0)} — its capital account reports no distribution, a measured nil`
      : `${money(f.distributed)} — its capital account's distribution total: income and principal, before TDS`;
  const distReconcile = distParts.filter((f) => f.distributedBasis === "capital-account" && f.securityKey).map((f) => {
    const d = fundDated.get(f.securityKey!);
    if (!d || d.payouts !== "measured" || !d.valuedAt) return null;
    const eq = d.paidOutByKind.equalisation;
    // What the distribution total holds that the XIRR leaves inside the value:
    // payments after the valuation that the statement's own total already runs to.
    const late = (f.distributed ?? 0) - d.paidOutByKind.income - d.paidOutByKind.capital;
    if (Math.abs(d.paidOut - (f.distributed ?? 0)) <= 1) return null;
    return `${f.fundName}: its XIRR counts ${money(d.paidOut)} paid back by its ${fmtDate(d.valuedAt)} valuation`
      + (eq > 1 ? ` — ${money(eq)} of equalisation more than this tile` : "")
      + (late > 1 ? `${eq > 1 ? ", and" : " —"} ${money(late)} less: the part of its distribution total paid after that date, which is inside the value the XIRR closes on` : "")
      + ".";
  }).filter((x): x is string => !!x);
  /**
   * WHAT THE TABLE DRAWS, counted off the table's own model (PM-C5) — so the
   * Funds and Folios tiles describe the rows a reader sees under them, never a
   * narrower set of valued ones under a caption that does not say so.
   */
  const tableCounts = (() => {
    const priv = m.byFund.sections.private.groups;
    const atc = m.byFund.sections.atCost.groups;
    const unv = m.byFund.sections.unvalued.groups;
    const lines = (gs: BookGroup[]) => gs.flatMap((g) => g.folios);
    return {
      funds: priv.length + atc.length + unv.length,
      valuedFunds: priv.length,
      atCostFunds: atc.length,
      noNavFunds: unv.length,
      folios: lines(priv).length + lines(atc).length + lines(unv).length,
      valuedLines: lines(priv).filter((f) => f.position).length,
      atCostLines: lines(atc).length,
      views: lines(priv).filter((f) => f.viewOf).length,
      noNavLines: lines(unv).length,
    };
  })();
  const tileMetrics: TileMetric[] = [
    {
      id: "value", label: "Market value", icon: <Handshake className="h-4 w-4" />,
      value: money(m.privMV),
      sub: `${share(m.privMV, m.bookMV, 1)} of the ${money(m.bookMV)} book`,
      // THE BOOK IS THE TOP BAR'S (B-01), and the hover says what that book is
      // and that its private side is these rows — never a second book.
      detail: `${money(m.privMV)} ÷ ${money(m.bookMV)} = ${share(m.privMV, m.bookMV, 2)} of the consolidated book the top bar shows: `
        + "every holding at its current value, a live price where a quote has landed and each mutual fund at its published NAV. "
        + (Math.abs(m.privLive - m.privMV) <= 1
          ? "Its private side is exactly these rows: they are each fund's own statement mark, and no quote or NAV moves a private holding. "
          : `Its private side reads ${money(m.privLive)}; the rows here stay on their statements' own marks, ${money(Math.abs(m.privLive - m.privMV))} apart. `)
        // PM-C5: the value is NOT struck over every account named here, AND IT
        // IS NOT ONE MEASUREMENT (Stage 10dh) — most of these rows are what the
        // family's consolidated review records as PAID, with no valuation, so
        // their value IS their cost. The hover splits the two, counts the
        // holdings, and says how many accounts value nothing at all.
        + `Across this page's ${m.scope.accounts.length} private accounts · each holding counted once: `
        + `${m.scope.rows.length - m.scope.rows.filter(isValuedAtCost).length} statements value a private holding `
        + `and ${m.scope.rows.filter(isValuedAtCost).length} are what the family's consolidated review records as paid, with no valuation `
        + `— ${m.scope.dedupedRows.length} holdings in all — `
        + `and the other ${m.scope.accounts.length - new Set(m.scope.rows.map((p) => p.accountId)).size} accounts value none.`,
    },
    {
      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,
      value: money(m.privCost),
      detail: `The cost of the units held — as a fund's own statement reports it, or what the family's consolidated review records as paid where it is the source · ${m.costedCount} of ${m.scope.dedupedRows.length} holdings report one, each holding counted once.`
        + (m.privAtCost.atCost > 0 ? ` ${atCostNote(m.privAtCost, (n) => money(n))}.` : ""),
    },
    {
      id: "pnl", label: "Unrealised P&L", icon: <TrendingUp className="h-4 w-4" />,
      value: <span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>,
      sub: retPct == null
        ? absentLine(m.privFifo.holdings === 0 && m.privAtCost.atCost > 0 ? "Held at cost — no gain" : "No cost to measure against")
        : `${fmtPct(retPct, { sign: true, decimals: 1 })} ${m.privAtCost.atCost > 0 ? "on valued holdings" : "return"} · FIFO`,
      // THE RETURN BESIDE THE FIGURE IS FIFO, SO THE HOVER NAMES ITS
      // DENOMINATOR (DL-16): the capital deployed, which is the cost reported
      // for the units held plus what the units already redeemed cost — not the
      // cost alone, which a reader would otherwise divide by and get a return
      // this tile does not print. AND IT IS STRUCK OVER THE VALUED HOLDINGS
      // ONLY (Stage 10dh): what the review holds at cost is named, not divided.
      detail: (() => {
        const f = m.privFifo;
        const ac = m.privAtCost.atCost > 0 ? ` ${atCostNote(m.privAtCost, (n) => money(n))}.` : "";
        if (f.returnPct == null || f.deployed == null || f.costHeld == null) {
          return (f.holdings === 0 && m.privAtCost.atCost > 0
            ? "Every private holding here is held at cost, so there is no gain to measure."
            : "No document here reports a cost to measure a gain against.") + ac;
        }
        const head = Math.abs(f.deployed - f.costHeld) > 1
          ? `The return beside it is FIFO, over the ${money(f.deployed)} deployed in the ${money(f.marketValue)} of valued holdings: the ${money(f.costHeld)} reported as cost for the units still held, and ${money(f.deployed - f.costHeld)} that the units already redeemed cost.`
            + ((f.realised ?? 0) !== 0 ? ` ${money(f.realised, true)} of the gain is on units redeemed.` : "")
          : `FIFO over the ${money(f.costHeld)} reported as cost for the ${money(f.marketValue)} of valued holdings — no unit here has been redeemed, so that cost is all the return divides by.`;
        return head + ac;
      })(),
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
        + `Across ${m.commitments.length} capital accounts of private-market funds`
        + (m.capOutside > 0 ? `, ${m.capOutside} of them in funds this page does not carry` : "")
        + (m.capElsewhere.length > 0
          ? `; the ${m.capElsewhere.length} in public-market funds are not counted`
          : "")
        + "."
        + alsoNote(m.alsoCt.undrawn, "uncalled balance")
        + " A fund whose capital account nobody sent contributes nothing, so this is a floor.",
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
      detail: `${m.ct.committedOf} of ${m.ct.count} capital accounts of private-market funds counted`
        + (m.capElsewhere.length > 0
          ? ` — ${m.capElsewhere.length} more, in public-market funds, are not counted`
          : "")
        + ". The full amount signed for, whether or not the fund has asked for it yet — not money spent, and in no market value on this page."
        + alsoNote(m.alsoCt.committed, "commitment"),
    },
    {
      id: "called", label: "Called", icon: <Banknote className="h-4 w-4" />,
      value: m.cc.called == null ? <AbsentValue /> : money(m.cc.called),
      sub: m.cc.called == null ? absentLine("No statement prints it") : "Asked for so far",
      detail: `${m.cc.calledOf} of ${m.cc.count} capital accounts carry a called figure: the fund's own called line where its statement prints one, and otherwise the capital drawn plus any call it prints as unpaid.`
        + (m.calledPaidSameSet
          ? " Paid in covers the same accounts."
          : " It covers a different set of accounts from Paid in, so the two must never be subtracted.")
        + alsoNote(m.alsoCc.called, "call"),
    },
    {
      id: "paid", label: "Paid in", icon: <Wallet className="h-4 w-4" />,
      value: m.cc.paid == null ? <AbsentValue /> : money(m.cc.paid),
      sub: m.cc.paid == null ? absentLine("No statement prints it") : "Cash sent to funds",
      detail: `${m.cc.paidOf} of ${m.cc.count} capital accounts · cash that has actually left the family's bank. Not the same set as Capital invested, which is the cost of the holdings in the table below.`
        + alsoNote(m.alsoCc.paid, "payment"),
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
      /*
       * AN ABSENCE NAMES ITS CAUSE, AND THE CAUSE IS THE REVIEW (Stage 10dh).
       * "0 folios … Real money, not in Market value" was a sentence about money
       * that does not exist. No private fund in this book publishes no NAV at
       * all: a fund's own statement values one, or the family's consolidated
       * review records what was paid for it — Sky Capital's four folios are the
       * ones that moved, from this tile into the at-cost section.
       */
      detail: m.unvaluedNoNav.length
        ? `${m.unvaluedNoNav.length} folios in funds that publish no NAV at all. Real money, not in Market value, and never added to a value on this page.`
        : "No private fund here publishes no NAV at all: a fund's own statement values one, or the family's consolidated review records what was paid for it.",
    },
    /* *"what is distributions?"* — the label is the client's own word and the
        short line under it is the answer. */
    /* WHAT IT SUMS IS WHAT IT SAYS (B-10, VD-22): distributions as each fund's
        own papers report them — income and principal — and never equalisation,
        which the statements print apart. Counted once, like every figure on this
        strip; and the hover walks to each fund's XIRR, which counts a different
        set of the same cash. */
    {
      id: "distributed", label: "Distributions", icon: <Coins className="h-4 w-4" />,
      value: distFig.distributed == null ? <AbsentValue /> : money(distFig.distributed),
      sub: distFig.distributed == null ? absentLine("No fund reports one") : "Cash paid back · income + principal",
      detail: (distFig.distributed == null
        ? "No private-market fund's papers in this book report a distribution. "
        : `Income and principal the funds' own papers report paying back, each counted once: `
          + distParts.map((f) => `${f.fundName} ${distWords(f)}`).join("; ") + ". ")
        + `${distFig.distributedOf} of the ${distFig.distributionAccounts} private-market accounts that could report one do; the rest print no distribution line and are skipped, never counted as nil. `
        + "Equalisation is not a distribution — the statements print it apart — and is not in this figure. "
        + (distReconcile.length ? distReconcile.join(" ") + " " : "")
        + (distLeftOut.length ? distributionLeftOutNote(m.byFund.folios, accName, money) + " " : "")
        + "Not part of the value above, and it does not reduce what a fund can still call.",
    },
    /* ── THE TWO THAT ARE ABSENT BY MEASUREMENT ──────────────────────────────
        Offered like every other metric: the answer to both is a fact about this
        corpus rather than a gap in the picker. The short line is the REASON,
        and the full reason and what would fill it is the hover. */
    {
      id: "realised", label: "Realised gain", icon: <Coins className="h-4 w-4" />,
      value: m.realised.value == null ? <AbsentValue />
        : <span className={changeColor(m.realised.value)}>{money(m.realised.value, true)}</span>,
      sub: m.realised.value == null ? absentLine("No statement reports it")
        : `${m.realised.covered.length} of ${m.realised.of} holdings · ${m.realised.value === 0 ? "a measured nil" : "FIFO"}`,
      detail: [
        ...m.realised.covered.map(({ position: p, redeemed }) => redeemed.length
          ? `${p.security}: ${fmtNum(Math.abs(redeemed.reduce((t, x) => t + (x.units ?? 0), 0)), 1)} units redeemed on ${redeemed.map((x) => fmtDate(x.date)).join(", ")} for ${moneyFull(sum(redeemed.map((x) => x.amount ?? 0)))}. FIFO books them at their cost of ${moneyFull(p.costOfUnitsSold ?? null)} — a realised gain of ${moneyFull(p.realizedPnL ?? null, true)}, measured off the fund's own dated record.`
          : `${p.security}: a realised gain of ${moneyFull(p.realizedPnL ?? null, true)}, FIFO, off the fund's own dated record.`),
        m.realised.missing.length
          ? `The other ${m.realised.missing.length} carry no realised figure — `
            + [...m.realised.missing.reduce((g, { position: pos, why, redeemed }) => {
              const reason = (why ?? "no realised figure is reported for its account")
                + (redeemed.length ? ", though its record redeems units" : ", and no redemption of its units is on record");
              g.set(reason, [...(g.get(reason) ?? []), pos.security]);
              return g;
            }, new Map<string, string[]>()).entries()]
              .map(([reason, names]) => `${names.join(", ")}: ${reason}`).join("; ")
            + " — so each is absent rather than nil."
          : "",
        m.realised.atCost.atCost
          ? `${m.realised.atCost.atCost === 1 ? "1 private investment" : `${m.realised.atCost.atCost} private investments`} held at cost (${money(m.realised.atCost.atCostValue)}) ${m.realised.atCost.atCost === 1 ? "is" : "are"} in neither count: the family's consolidated review records what was paid and reports no sale.`
          : "",
        "Income a fund pays out is not a realised gain here; it is under Distributions.",
      ].filter(Boolean).join(" "),
    },
    {
      id: "multiple", label: "TVPI / DPI", icon: <Handshake className="h-4 w-4" />,
      value: <AbsentValue />,
      sub: absentLine("Too few distribution figures"),
      detail: `Only ${distFig.distributedOf} of the ${distFig.distributionAccounts} private-market accounts that could report a distribution do. A multiple divides what has come back plus what is still inside by what went in; for the other ${distFig.distributionAccounts - distFig.distributedOf} this book carries no distribution total — the statement prints none, or prints one no reader here captures yet — and reading those as nil would report a fund that has returned nothing when its statement does not say so.`,
    },
    /* Counts of sets this page already draws, so none is a new measurement. */
    {
      id: "funds", label: "Funds", icon: <Handshake className="h-4 w-4" />,
      value: fmtNum(tableCounts.funds),
      // Each part only where the table draws its section — a band with no
      // rows is not drawn, so a count of nil would name a section that is not there.
      sub: [
        `${tableCounts.valuedFunds} valued`,
        tableCounts.atCostFunds ? `${tableCounts.atCostFunds} at cost` : null,
        tableCounts.noNavFunds ? `${tableCounts.noNavFunds} with no NAV` : null,
      ].filter(Boolean).join(" · "),
      detail: `Every fund row the table draws: the ${tableCounts.valuedFunds} under Private funds, each counted once however many folios hold it`
        + (tableCounts.atCostFunds ? `, the ${tableCounts.atCostFunds} under ${SECTION_COPY.atCost.title}, which the family's consolidated review records at what was paid and no valuation` : "")
        + (tableCounts.noNavFunds ? `, and the ${tableCounts.noNavFunds} under Not valued, which publish no NAV` : "")
        + ".",
    },
    {
      id: "folios", label: "Folios", icon: <Layers className="h-4 w-4" />,
      value: fmtNum(tableCounts.folios),
      sub: `${tableCounts.valuedLines} valued`
        + (tableCounts.atCostLines ? ` · ${tableCounts.atCostLines} at cost` : "")
        + (tableCounts.views ? ` · ${tableCounts.views} income-only` : "")
        + (tableCounts.noNavLines ? ` · ${tableCounts.noNavLines} with no NAV` : ""),
      detail: `Every folio line under those rows: the ${tableCounts.valuedLines} that value a holding — a fund's own statement, or the family's consolidated review where it is the source`
        + (tableCounts.atCostLines ? `, the ${tableCounts.atCostLines} the review records at cost` : "")
        + (tableCounts.views ? `, the ${tableCounts.views} income-only ${tableCounts.views === 1 ? "folio whose units are" : "folios whose units are"} valued on another line` : "")
        + (tableCounts.noNavLines ? `, and the ${tableCounts.noNavLines} under Not valued` : "")
        + ".",
    },
    {
      id: "owners", label: "Owners", icon: <Users className="h-4 w-4" />,
      value: fmtNum(m.owners.length),
      sub: "Members and trusts",
      detail: "Family members and trusts holding something private.",
    },
    {
      id: "accounts", label: "Capital accounts", icon: <Landmark className="h-4 w-4" />,
      // EVERY STATEMENT, whichever the capital figures count: this tile is a
      // count of documents, and each of them is real paper the family holds.
      value: fmtNum(m.commitments.length),
      sub: "Drawdown statements",
      /**
       * THE SAME CROSSED FRACTION THE UNCALLED TILE WAS FIXED FOR: three of
       * these capital accounts belong to funds this page does not carry, so the
       * two counts PARTITION the tile's own figure — the only form in which both
       * can be printed together.
       */
      detail: `${m.commitments.length - m.capOutside} of this page's ${m.scope.accounts.length} private accounts send one`
        + (m.capOutside > 0 ? ` · ${m.capOutside} more come from funds this page does not carry` : "")
        + (m.capElsewhere.length > 0 ? ` · ${m.capElsewhere.length} more, in public-market funds, are not counted` : "")
        + ". A capital account is the statement that prints a commitment and what has been called against it."
        + (m.counting.alsoReported.length
          ? ` The capital tiles count ${m.ct.count} of them:` + alsoNote(null, "capital")
          : ""),
    },
    {
      // AS PRINTED, like the Transactions tab it summarises — a count of dated
      // calls, each as its own statement prints it.
      id: "calls", label: "Capital calls", icon: <CalendarClock className="h-4 w-4" />,
      value: fmtNum(m.history.length),
      sub: "Dated calls so far",
      detail: `Across ${m.commitments.length} capital accounts, every one reconciled against its own statement's printed total — each call as its statement prints it, listed on the Transactions tab.`
        + (m.counting.alsoReported.length
          ? ` The Called tile leaves out ${m.alsoCc.callCount} of them: `
            + `${m.counting.alsoReported.map((x) => accName(x.commitment.accountId)).join(" and ")} ${m.counting.alsoReported.length === 1 ? "is the second statement" : "are second statements"} of a holding counted once, pending the family's answer.`
          : ""),
    },
    /* THE RAW TOTAL, and it never appears without its own double count named. */
    {
      id: "raw", label: "Value as printed", icon: <Layers className="h-4 w-4" />,
      value: money(m.rawMV),
      sub: `Includes ${money(m.scope.doubleCounted)} double count`,
      // THE HOLDINGS BEHIND THE DOUBLE COUNT ARE COUNTED OFF THE BOOK — the
      // hover read "two holdings reported under two members each" as typed
      // words, true of this book and of no other.
      detail: m.scope.doubleCountedHoldings === 0
        ? "Every statement as printed. No private holding here is reported on more than one statement, so this is Market value."
        : `Every statement as printed. ${money(m.scope.doubleCounted)} of it is `
          + `${countWord(m.scope.doubleCountedHoldings)} ${m.scope.doubleCountedHoldings === 1 ? "holding" : "holdings"} reported on `
          + (new Set(m.scope.doubleCountedStatements).size === 1
            ? `${countWord(m.scope.doubleCountedStatements[0])} statements${m.scope.doubleCountedHoldings === 1 ? "" : " each"}`
            : "more than one statement each")
          + "; Market value counts each once.",
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
  /**
   * BY OWNER THE WEIGHT COLUMN ADDS TO MORE THAN 100% (PM-D1), and its heading
   * says by how much and where it comes back. Every member's statement is
   * printed, over the one consolidated private value, so a holding two members'
   * statements both report is weighed on both rows — the Counted once line at
   * the foot of the section takes it back. The arithmetic is right; a column of
   * shares that adds to 129.9% under "Weight" needs its own hover to say so.
   */
  /*
   * BOTH PRIVATE BANDS (Stage 10dh). The Weight column spans the private funds
   * AND the lines the family's consolidated review records at cost, over one
   * denominator, so what it adds to is both bands' overlap. Read off the
   * `private` band alone the heading would describe one of the two columns it
   * is on, and say nothing about an at-cost holding two members both report.
   */
  const ownerOverlapValue = grouping === "owner"
    ? BOOK_SECTIONS.filter((id) => id !== "unvalued")
        .reduce((a, id) => a + (book.sections[id].overlap?.value ?? 0), 0)
    : 0;
  const ownerPrintedValue = grouping === "owner"
    ? BOOK_SECTIONS.filter((id) => id !== "unvalued")
        .reduce((a, id) => a + (book.sections[id].overlap?.printed ?? 0), 0)
    : 0;
  const ownerSum = ownerOverlapValue > 1 ? pct(ownerPrintedValue) : null;
  const ownerBack = ownerOverlapValue > 1 ? pct(ownerOverlapValue) : null;
  const weightHeadTitle = "Of the private book: the row's value as a share of the private market value — the same denominator on every row."
    + (ownerSum != null && ownerBack != null
      ? ` By owner every statement is printed, so the members' rows add to ${ownerSum.toFixed(1)}%, and the Counted once line at the foot of the section takes back ${ownerBack.toFixed(1)}% — the holdings two members' statements both report.`
      : "");

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
  /** Per FUND — `fundDated`, built above the tiles, which reconcile against it. */
  /** Per FOLIO — one statement's own holding and its own capital account. */
  const folioDated = new Map(m.byFund.folios.filter((f) => f.position).map((f) =>
    [f.key, fundDatedRecords([f.position!], m.commitments, BOOK_REVIEW_FLOWS, m.accIdx, moneyN, fmtDate).get(f.position!.securityKey)]));
  /** A row with no value has no return on any measure, and every measure says so. */
  const noValueReturn = (why: string) => (measure: ReturnMeasure): MeasuredReturn =>
    ({ shown: false, tag: measure === "auto" ? "AUTO" : returnMeasureDef(measure).tag, reason: why });
  const NO_VALUE_RETURN = "no value to strike a return on — nothing here values the holding";
  const groupRet = (g: BookGroup) => {
    if (g.kind === "fund") {
      return g.value == null ? noValueReturn(NO_VALUE_RETURN)
        : (measure: ReturnMeasure) => fundMeasuredReturn(
          // A fund every line of which is held at cost (Stage 10dh) refuses
          // every measure with that reason, ahead of any other.
          { ...g, atCost: g.holdings > 0 && g.atCostHoldings === g.holdings },
          fundDated.get(g.securityKey ?? ""), measure, moneyN, fmtDate);
    }
    // A MEMBER WHO HOLDS ONE FUND IS THAT FOLIO (PM-C10): the row's figures are
    // that folio's, so its return is resolved the folio's own way — an
    // aggregate reason ("spans their funds") would be false of it, and a
    // refused pool beside the folio's own HPR would contradict the line below.
    const held = g.folios.filter((f) => f.position);
    return held.length === 1 ? folioRet(held[0]) : aggRet(g.folios, false, "member");
  };
  const folioRet = (f: BookFolio) => (f.value == null ? noValueReturn(f.viewOf
    ? `an income-only folio holds no units of its own to strike a return on — the ${accName(f.viewOf)} line carries them, and the fund row carries the return`
    : NO_VALUE_RETURN)
    : (measure: ReturnMeasure) => fundMeasuredReturn(
      { returnPct: folioFigures(f).returnPct, cost: f.cost, atCost: !!f.position && isValuedAtCost(f.position) },
      folioDated.get(f.key), measure, moneyN, fmtDate));
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
    const allHeld = folios.filter((f) => f.position && (!consolidated || f.counted));
    /**
     * HELD AT COST IS NOT A RECORD TO POOL (Stage 10dh). A private investment
     * the family's consolidated review records at what was paid and no
     * valuation has no gain, so it is in no HPR and no XIRR. It is counted in
     * the pool's "of" — a rate over 3 of 69 funds says how little of the set it
     * describes — and summarised once in the hover rather than listed by name.
     */
    const atCostHeld = allHeld.filter((f) => isValuedAtCost(f.position!));
    const held = allHeld.filter((f) => !atCostHeld.includes(f));
    const allAtCost = allHeld.length > 0 && atCostHeld.length === allHeld.length;
    const atCostFunds = consolidated ? new Set(atCostHeld.map((f) => f.fundKey)).size : atCostHeld.length;
    const atCostClause = atCostHeld.length
      ? `${atCostFunds} ${consolidated ? (atCostFunds === 1 ? "fund" : "funds") : (atCostFunds === 1 ? "statement" : "statements")} held at cost (${money(fig.atCostValue)}), which the family's consolidated review records at what was paid and no valuation`
      : "";
    const recs = consolidated
      ? [...new Set(held.map((f) => f.fundKey))].map((k) => {
        const f = held.find((x) => x.fundKey === k)!;
        return { name: f.fundName, d: fundDated.get(k) };
      })
      : held.map((f) => ({ name: grouping === "owner" && scope !== "member" ? `${f.owner} — ${f.fundName}` : f.fundName, d: folioDated.get(f.key) }));
    const complete = (d: FundDated | undefined): d is FundDated => !!d && !d.gap && d.payouts !== "unknown";
    const pooledIn = recs.filter((r) => complete(r.d));
    const pooledOut = recs.filter((r) => !complete(r.d));
    const poolOf = recs.length + atCostFunds;
    const whose = scope === "total" ? "This is the whole private book, not one fund"
      : scope === "section" ? "This band spans several funds" : "A family member's row spans their funds";
    const unit = (n: number) => (consolidated ? (n === 1 ? "fund" : "funds") : (n === 1 ? "statement" : "statements"));
    return (measure: ReturnMeasure): RowReturn => {
      // A REFUSED cell under the methodology says AUTO, as a refused fund row
      // and a refused Monitor row do: "HPR —" would name a measure the row
      // does not show.
      const tag = measure === "auto" ? "AUTO" : returnMeasureDef(measure).tag;
      if (fig.value == null) return { shown: false, tag, reason: NO_VALUE_RETURN };
      if (allAtCost) return { shown: false, tag, reason: AT_COST_RETURN };
      if (measure === "auto" || measure === "absolute") {
        if (fig.returnPct == null) {
          return { shown: false, tag, reason: fig.cost == null
            ? "no cost is reported across these holdings, so there is no capital to strike a return against"
            : "the cost reported here covers only part of this row's value, and a percentage across the two would divide one set of holdings by another" };
        }
        return { shown: true, pct: fig.returnPct, tag: "HPR",
          note: aggHprNote(held) + (fig.atCostHoldings > 0 ? ` Struck on the valued holdings only: ${atCostNote({ atCost: fig.atCostHoldings, atCostValue: fig.atCostValue }, (n) => money(n))}.` : "") };
      }
      if (measure === "xirr") {
        // WHICH RECORDS THE RATE POOLS, carried whether or not it shows one: a
        // refused rate over "0 of 4" says as much as a struck one over "3 of 4".
        const pool = { covers: pooledIn.length, of: poolOf };
        if (!pooledIn.length) {
          return { shown: false, tag, pool, reason: "no fund here carries a complete dated record of what went in and what came back, so no money-weighted return can be struck across them"
            + (atCostClause ? `; ${atCostClause}` : "") };
        }
        const pooled = pooledFundXirr(pooledIn.map((r) => r.d!));
        if (!pooled || pooled.pct == null) return { shown: false, tag, pool, reason: "the pooled flows do not solve to a rate" };
        if (!pooled.annualised) {
          return { shown: false, tag, pool, reason: `the pooled flows span ${pooled.windowDays} days — under a year, so an annual rate would be a projection; the holding-period return is under HPR` };
        }
        const left = [
          ...pooledOut.map((r) => `${r.name} — ${r.d?.gap ?? "its payout record is not carried"}`),
          ...(atCostClause ? [atCostClause] : []),
        ].join("; ");
        /**
         * A RECORD HELD UNDER A YEAR, INSIDE A POOL THAT IS ANNUALISED (PM-D3).
         * Its own row refuses to annualise and shows its holding-period return;
         * inside the pool its gain is compounded at the pool's annual rate, and
         * on this book one 165-day holding carries half of the +21.1%. Not a
         * rule break — the pool's window is over a year — but the hover names
         * the record and what the pool reads without it, so a reader never
         * takes the rate for years of that return.
         */
        const own = pooledIn.map((r) => ({ r, w: pooledFundXirr([r.d!]) }));
        const subYear = own.filter((x) => x.w?.windowDays != null && x.w.windowDays < 365);
        const rest = own.filter((x) => !subYear.includes(x)).map((x) => x.r.d!);
        const without = subYear.length && rest.length ? pooledFundXirr(rest) : null;
        const one = subYear.length === 1;
        const subNote = subYear.length
          ? ` ${subYear.map((x) => `${x.r.name} has been held ${x.w!.windowDays} days`).join("; ")} — under a year, so ${one ? "its own row shows its" : "their own rows show their"} holding-period return, while in this pool ${one ? "its gain is" : "their gains are"} compounded at the pool's annual rate.`
            + (without?.pct != null && without.annualised
              ? ` Without ${one ? "it" : "them"}, the pool reads ${fmtPct(without.pct, { sign: true, decimals: 1 })}.`
              : "")
          : "";
        return { shown: true, pct: pooled.pct, tag, pool,
          subYear: subYear.map((x) => ({ name: x.r.name, days: x.w!.windowDays! })),
          withoutSubYear: without?.pct != null && without.annualised ? without.pct : null,
          note: `Pooled across ${pooledIn.length} of ${poolOf} ${unit(poolOf)}: every dated call, every dated payout and each fund's own valuation date, annualised over the ${pooled.windowDays} days since the first call.`
            + (left ? ` Not in it: ${left}.` : "") + subNote };
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
    [...m.byFund.sections.private.groups, ...m.byFund.sections.atCost.groups]
      .filter((g) => g.value != null).map((g) => groupRet(g)(measure));

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
  const covered = (n: number, of: number, k: CellKind, cc?: BookFigures["capitalCover"]) => {
    const lines = (k === "total" || k === "section") && of > 0 && n < of;
    // PM-C6: WHERE THE ROW'S CAPITAL COLUMNS COVER FEWER OF ITS FUNDS (OR
    // FOLIOS) THAN IT CARRIES — Paid in beside a Cost and a Value struck over a
    // different set is a pair a reader would divide.
    const wider = k !== "folio" && !!cc && cc.with > 0 && cc.with < cc.of;
    if (!lines && !wider) return null;
    return (
      <div className="text-[10px] font-normal leading-tight text-slate-500">
        {lines && <span data-covered={`${n}/${of}`}>{n} of {of} accounts</span>}
        {lines && wider && " · "}
        {wider && <span data-cap-cover={`${cc!.with}/${cc!.of}`} data-cap-unit={cc!.unit}
          title={`Committed, Called, Paid in and Still to call add the ${cc!.with} ${cc!.unit}s on this row that send a capital account; the other ${cc!.of - cc!.with} ${cc!.of - cc!.with === 1 ? "sends" : "send"} none, so these columns cover a different set from Cost and Value beside them.`}>
          {cc!.with} of {cc!.of} {cc!.unit}s</span>}
      </div>
    );
  };

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
    /**
     * A CAPITAL ACCOUNT THE TOTALS COUNT WITH ANOTHER STATEMENT'S (PM-A2). Said
     * on the figure — the capital cells in the Counted once line's amber, the
     * reason in their hover — rather than as words on the line under the name,
     * which main keeps to the counts a reader scans.
     */
    capAlso?: { id: string; title: string };
  }): Cells => {
    const p = pad(k);
    const t = tone(k);
    const holdingRow = k === "group" || k === "folio";
    const capCols = new Set(["committed", "called", "paid", "uncalled"]);
    const td = (col: string, body: ReactNode, extra = "") => (
      <td key={col} data-col-cell={col}
        title={ctx.titles?.[col] ?? (ctx.capAlso && capCols.has(col) ? ctx.capAlso.title : undefined)}
        className={`${p} whitespace-nowrap text-right mono ${t} ${extra}`}>{body}</td>
    );
    const absent = (col: string, why: string) => td(col, <AbsentCell reason={why} />);
    const cap = (col: string, v: number | null | undefined, why: string, of?: [number, number]) =>
      ctx.noCapital ? absent(col, ctx.noCapital)
        : v == null ? absent(col, why)
          : td(col, <>{ctx.capAlso
            ? <span className="text-amber-400" data-pm-capital-also={ctx.capAlso.id}>{money(v)}</span>
            : money(v)}{covered(of?.[0] ?? 0, of?.[1] ?? 0, k, r.capitalCover)}</>);
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
            {covered(r.uncalledOf ?? 0, r.capitalAccounts ?? 0, k, r.capitalCover)}
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
      // WHAT AN HPR DIVIDES BY, WHERE IT IS NOT THE COST COLUMN (DL-16). FIFO
      // strikes the gain over the capital deployed — the cost of the units held
      // AND of the units already redeemed — so on a row holding a fund that
      // redeemed units, Value − Cost over Cost is a third answer the row does
      // not print. The denominator is a figure, so it sits on the figure; the
      // two parts of it are its hover.
      //
      // AND IT IS THE STRUCK SET'S OWN TWO PARTS, NOT THE COST CELL (Stage
      // 10dh): where a row holds a line the review records at cost, the Cost
      // column spans that line too and FIFO's denominator does not, so
      // `deployed - cost` reads ₹140.5 Cr of at-cost capital as a redemption.
      // `deployedHeld` is the cost of the units still held over the same set
      // FIFO was struck on, and the hover says "the Cost column" only where
      // that cell really is that figure.
      const held = r.deployedHeld ?? r.cost;
      const dep = res.shown && res.tag === "HPR" && r.deployed != null && held != null
        && Math.abs(r.deployed - held) > 1 ? r.deployed : null;
      const heldIsCostCell = held != null && r.cost != null && Math.abs(r.cost - held) <= 1;
      out[id] = (
        <td key={id} data-col-cell={id} data-return-cell={measure} data-return-tag={off ? res.tag : undefined}
          data-return-shown={res.shown ? "1" : "0"} data-return-pct={res.shown ? res.pct.toFixed(4) : undefined}
          {...(k === "total" ? {
            "data-return-foot": measure,
            "data-return-foot-covers": res.pool?.covers,
            "data-return-foot-of": res.pool?.of,
          } : {})}
          data-return-subyear={res.shown && res.subYear?.length ? res.subYear.map((x) => `${x.days}`).join(" ") : undefined}
          data-return-without-subyear={res.shown && res.withoutSubYear != null ? res.withoutSubYear.toFixed(4) : undefined}
          className={`${p} whitespace-nowrap text-right mono ${t}`}>
          {off && <span className="ret-tag mr-0.5">{res.tag}</span>}
          {res.shown
            ? <span className={changeColor(res.pct)} title={res.note}>{fmtPct(res.pct, { sign: true, decimals: 1 })}
                {part && <span className="text-[10.5px] font-normal text-slate-500"> · {part.covers} of {part.of}</span>}</span>
            : <AbsentCell reason={res.reason} />}
          {dep != null && (
            <div className="text-[10.5px] font-normal text-slate-500" data-return-deployed={Math.round(dep)}
              title={`FIFO divides the gain by the ${money(dep)} deployed: the ${money(held)} ${heldIsCostCell ? "the Cost column shows" : "reported as cost"} for the units still held, and ${money(dep - (held ?? 0))} that the units already redeemed cost.`}>
              on {money(dep)}
            </div>
          )}
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

  /**
   * ── A STATEMENT THE DEPOSITORY HAS SINCE OVERTAKEN (VD-6) ────────────────
   * One short line on the row and on its folio, the working in the hover: the
   * units the depository holds beyond the statement's, and the statement that
   * would show them. Never a figure for the units the statement does not carry.
   */
  const nextQuarterEnd = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const q = Math.floor(d.getUTCMonth() / 3);
    let end = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)).toISOString().slice(0, 10);
    if (end <= iso) end = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 6, 0)).toISOString().slice(0, 10);
    return end;
  };
  const newerUnitsNote = (securityKey: string | null, accountId?: string) => {
    const nu = securityKey ? m.newerUnits.get(securityKey) : undefined;
    if (!nu || (accountId && accountId !== m.scope.dedupedRows.find((p) => p.securityKey === securityKey)?.accountId)) return null;
    const dep = m.accIdx.get(nu.accountId);
    const more = nu.closing - nu.held;
    return (
      <span className="text-amber-400" data-pm-newer-units={nu.closing} data-pm-newer-account={nu.accountId}
        title={`${dep ? `${dep.owner}'s ${dep.provider} ${dep.accountNo}` : nu.accountId} holds ${fmtNum(nu.closing, 3)} units of this fund at ${fmtDate(nu.periodTo)} — ${fmtNum(Math.abs(more), 3)} ${more > 0 ? "more" : "fewer"} than the ${nu.asOf ? fmtDate(nu.asOf) : "fund's"} statement this row is struck on; the depository recorded the change between ${fmtDate(nu.periodFrom)} and ${fmtDate(nu.periodTo)}. This row's units, value and capital account are that statement's, and the change is in none of them. A newer statement from the fund${nu.asOf ? ` — its quarter ending ${fmtDate(nextQuarterEnd(nu.asOf))} or later —` : ""} is needed.`}>
        newer statement needed
      </span>
    );
  };
  /** The words under a fund's or a member's name: what it is, never a figure another column holds. */
  const groupSub = (g: BookGroup): ReactNode => {
    const bits: ReactNode[] = [];
    if (g.kind === "fund" && g.category) bits.push(g.category);
    const views = g.folios.filter((f) => f.viewOf).length;
    const held = g.folios.length - views;
    bits.push(`${held} ${held === 1 ? "folio" : "folios"}`);
    if (views > 0) bits.push(<span key="vw" data-pm-views={views}>{views} income-only {views === 1 ? "folio" : "folios"}</span>);
    if (g.calls > 0) bits.push(`${g.calls} ${g.calls === 1 ? "call" : "calls"}`);
    // THE PAIR IS THE FAMILY'S TO CALL (PM-A1): counted once under §4c's policy
    // until they say whether it is one investment reported twice or two.
    if (g.overlap) bits.push(<span key="ov" className="text-amber-400" data-pm-pending>reported twice · counted once, pending the family&rsquo;s answer</span>);
    if (g.status === "no-nav") bits.push(<span key="st" className="text-amber-400">no NAV published</span>);
    if (g.status === "income-only") bits.push("income-only folios");
    if (g.status === "redeemed") bits.push("redeemed to nil");
    const newer = g.kind === "fund" ? newerUnitsNote(g.securityKey) : null;
    if (newer) bits.push(<Fragment key="nu">{newer}</Fragment>);
    return bits.map((b, i) => <Fragment key={i}>{i > 0 && " · "}{b}</Fragment>);
  };

  const noCapitalWhy = (section: BookSectionId, kind: "group" | "member" | "folio") =>
    kind === "folio"
      ? "this account sends no capital-account statement — it reports the holding without a commitment"
      : kind === "member"
        ? "none of this member's folios here sends a capital-account statement — the holdings are reported without a commitment"
      : section !== "unvalued"
        ? "no folio of this fund sends a capital-account statement — the holding is reported without a commitment"
        : "no capital-account statement for these folios";

  const weightWhy = (_section: BookSectionId) => "no value to weigh — a share of the private market value needs a value";

  /** A fund or member row, its folios when open, and its "counted once" line. */
  const renderGroup = (g: BookGroup) => {
    const key = rowKey(g);
    const open = rows.isOpen(key) || (!!needle && !g.label.toLowerCase().includes(needle) && g.folios.some((f) => folioText(f).includes(needle)));
    const toggle = () => rows.toggle(key);
    // A ROW WITH A VALUE HAS A WEIGHT — the measured funds AND the ones held at
    // cost, whose value is in the private market value the weights divide.
    const inPrivate = g.section !== "unvalued";
    const kids = sortRows(
      g.folios.map((f) => ({
        f, label: grouping === "fund" ? f.owner : f.fundName,
        fig: { ...folioFigures(f), callKey: grouping === "owner" ? folioCallKey(f) : null, ret: folioRet(f) },
      })),
      bookView.sort,
      withReviewAccessors(Object.fromEntries(Object.entries(nameAcc).map(([c, a]) => [c, (x: { fig: RowFigures; label: string; f: BookFolio }) => a({ ...x.fig, label: x.label })])), (x) => folioReviewScope(x.f)),
    );
    const scheme = (f: BookFolio) => f.capital;
    const fundCall = groupCallKey(g);
    const fundRowId = `fund:${g.key}`;
    return (
      <Fragment key={key}>
        <Tr view={bookView} reviewScope={groupReviewScope(g)} className={TREE_ROW.parent} {...rowToggle(toggle)}
          data-pm-group={g.key} data-pm-kind={g.kind} data-pm-row-section={g.section}
          {...(g.kind === "fund" ? { "data-pm-fund": g.key } : { "data-pm-owner": g.key })}
          data-pm-folios={g.folios.length} data-pm-value={g.value ?? undefined}
          data-pm-cost-absent={g.cost == null ? "" : undefined} data-pm-return-absent={g.returnPct == null ? "" : undefined}
          data-pm-committed={g.committed ?? undefined} data-pm-uncalled={g.uncalled ?? undefined}
          data-pm-called={g.called ?? undefined} data-pm-paid={g.paid ?? undefined}>
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
            noCapital: g.capitalAccounts === 0 ? noCapitalWhy(g.section, g.kind === "owner" ? "member" : "group") : undefined,
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
          // BY OWNER the folio is the fund level, so the call cell is here — on
          // the folio that holds the units, never on an income-only view of it,
          // which would put a second editor for one fund under one member.
          const folioCall = grouping === "owner" && !f.viewOf ? folioCallKey(f) : null;
          const folioRowId = `owner:${g.key}:${f.key}`;
          const viewOfLine = f.viewOf ? accName(f.viewOf) : null;
          return (
            <Fragment key={f.key}>
            <Tr view={bookView} reviewScope={folioReviewScope(f)} className={TREE_ROW.child}
              data-pm-folio-row={g.key} data-pm-row-section={g.section} data-account={f.accountId}
              data-pm-capital-account={f.capital?.accountId ?? undefined}
              data-pm-capital-counted={f.capital ? (f.capitalCounted ? "true" : "false") : undefined}
              data-pm-capital-counted-as={f.capitalCountedAs ?? undefined}
              data-pm-view-of={f.viewOf ?? undefined}
              data-pm-committed={fig.committed ?? undefined} data-pm-called={fig.called ?? undefined}
              data-pm-paid={fig.paid ?? undefined} data-pm-uncalled={fig.uncalled ?? undefined}
              data-pm-value={f.value ?? undefined} data-pm-counted={f.counted ? "" : undefined}
              data-pm-review={f.position?.review && f.position.reviewSource
                ? `${f.position.reviewSource.sheet}:${f.position.reviewSource.row}` : undefined}
              data-calls={s ? s.calls.length : undefined}>
              <TreeNameCell depth={1} last={i === kids.length - 1 && !(grouping === "fund" && g.overlap)}
                title={grouping === "fund" ? f.owner : f.fundName}
                sub={<>
                  {f.provider} {f.accountNo}
                  {/* VALUED ON THE REVIEW (Stage 10dh). The family's consolidated
                      review is the source for private-market lines, and where
                      the line sits in a fund's own statement account the account
                      alone would read as that statement's figure — so the line
                      says whose figure it is, and the hover says which review
                      line and how it was split. A review holder's own account
                      already names the review, so it says nothing more. */}
                  {f.position?.review && !m.accIdx.get(f.accountId)?.reviewHolder && (
                    <> · <span className="text-slate-400" data-pm-review-note
                      title={f.position.reviewNote ?? "Valued on the family's consolidated review (MOPWM)."}>MOPWM review</span></>
                  )}
                  {s && s.calls.length > 0 && <> · {s.calls.length} {s.calls.length === 1 ? "call" : "calls"}</>}
                  {/* AN INCOME-ONLY VIEW OF A HOLDING ANOTHER LINE VALUES — said
                      on the line, so a reader never looks for its units here. */}
                  {viewOfLine && <> · <span className="text-slate-400" data-pm-view-note={f.viewOf}
                    title={`An income-only folio: its documents report earnings and distributions and no valuation. Its units are valued on the ${viewOfLine} line, and counting them here too would count them twice.`}>
                    income-only · units valued on the {m.accIdx.get(f.viewOf!)?.accountNo ?? viewOfLine} line</span></>}
                  {/* ONE HOLDING ON TWO STATEMENTS — said on the line, in the
                      colour the "Counted once" row below it uses, rather than
                      as a chip that doubles the row's height. */}
                  {f.position && newerUnitsNote(f.position.securityKey, f.accountId) && (
                    <> · {newerUnitsNote(f.position.securityKey, f.accountId)}</>
                  )}
                  {f.alsoCount > 1 && (
                    <> · <span className="text-amber-400" data-pm-also={f.alsoReportedUnder.join(",")}>
                      also reported under {f.alsoReportedUnder.map(ownerDisplayName).join(", ") || "another account"}
                    </span></>
                  )}
                </>} />
              {inOrder({
                ...figureCells(fig, "folio", {
                noCapital: s ? undefined
                  : viewOfLine ? "an income-only folio — its documents report earnings and distributions, and no commitment"
                    : noCapitalWhy(g.section, "folio"),
                noValue: viewOfLine
                  ? `income-only folio — its documents report earnings and distributions and no valuation; these units are valued on the ${viewOfLine} line, and counting them here too would count them twice`
                  : valueWhy(f.status, f.reason),
                nil: f.status === "redeemed" ? valueWhy("redeemed", null) : undefined,
                noHolding: f.position ? undefined
                  : viewOfLine ? `income-only folio — the units are counted on the ${viewOfLine} line, not here`
                    : "no valued holding on this statement",
                weight: inPrivate ? pct(f.value) : null,
                weightWhy: weightWhy(g.section),
                stale: s?.staleDays ?? null,
                ties: s?.uncalledTies ?? null,
                implied: s?.impliedUncalled ?? null,
                // A REVIEW LINE'S VALUE SAYS WHOSE FIGURE IT IS, on the figure.
                titles: f.position?.review && f.position.reviewNote
                  ? { value: f.position.reviewNote, cost: f.position.reviewNote } : undefined,
                capAlso: f.capital && !f.capitalCounted && f.capitalCountedAs
                  ? {
                    id: f.capitalCountedAs,
                    title: `Counted once, with ${accName(f.capitalCountedAs)}'s capital account (${m.accIdx.get(f.capitalCountedAs)?.accountNo ?? "the other statement"}): the fund's row and the totals do not add this statement's capital again, pending the family's answer on whether the two are one investment or two.`,
                  }
                  : undefined,
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
   * the row, in EVERY column it adjusts: the holding's units, cost and value,
   * and — since a capital account is counted once with its holding — the second
   * statement's commitment, calls and still-to-call too. Empty in a column with
   * no difference, never a "−₹0" standing for one.
   */
  // A RETURN IS NOT AN ADJUSTMENT: the line is arithmetic on the columns above,
  // so every return column is an empty cell here, whichever are picked.
  // NO LINE UNDER "Counted once" (Stage 10co): what the line does is its hover.
  const overlapRow = (o: Overlap, key: string, statements: number, weigh: boolean) => {
    const adj = (col: string, v: number | null, body?: string) => (
      <td key={col} data-col-cell={col} data-pm-adjust={v != null ? Math.round(v) : undefined}
        className={`${pad("folio")} whitespace-nowrap text-right mono text-amber-400`}>
        {v != null ? body ?? `−${money(v)}` : ""}
      </td>
    );
    const capital = [o.committed, o.called, o.paid, o.uncalled].some((v) => v != null);
    return (
      <Tr view={bookView} key={`${key}-overlap`} className={TREE_ROW.adjust}
        data-pm-overlap={key} data-printed={Math.round(o.printed)} data-consolidated={Math.round(o.consolidated)} data-overlap={Math.round(o.value)}>
        <TreeNameCell depth={1} last
          title={<span className="text-amber-400">Counted once</span>}
          hint={grouping === "fund"
            ? `The same holding is reported on ${statements} statements; the row above counts it once${capital ? " — and its capital account once too" : ""}, and this line takes the overlap out so the folios add to the row.`
            : `${statements} statements report the same holdings twice between them; the total counts each once${capital ? " — and each capital account once too" : ""}, and this line takes the overlap out.`} />
        {inOrder({
          committed: adj("committed", o.committed),
          called: adj("called", o.called),
          paid: adj("paid", o.paid),
          uncalled: adj("uncalled", o.uncalled),
          units: adj("units", o.units, o.units != null ? `−${fmtNum(o.units, 3)}` : undefined),
          cost: adj("cost", o.cost),
          value: adj("value", o.value > 0 ? o.value : null),
          weight: adj("weight", weigh && o.value > 0 && pct(o.value) != null ? o.value : null,
            weigh && o.value > 0 && pct(o.value) != null ? `−${pct(o.value)!.toFixed(1)}%` : undefined),
        }, "folio")}
      </Tr>
    );
  };

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
      bookView.sort, withReviewAccessors(nameAcc as Record<string, Accessor<BookGroup & { ret: (m: ReturnMeasure) => MeasuredReturn }>>, groupReviewScope));
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
      : id === "atCost"
        // HELD AT COST (Stage 10dh): the family's consolidated review records
        // what was paid into these and no valuation, so each is in the value at
        // its cost and in no gain — a return struck on a cost standing in for a
        // value would be a measured 0% nobody measured.
        ? `The family's consolidated review records what was paid into these private investments and no valuation, so the ${money(s.value)} here is their cost: it is in the value and in Invested, and in no gain or return.`
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
            weight: id !== "unvalued" ? pct(s.value) : null,
            weightWhy: weightWhy(id),
          }), "section")}
        </Tr>
        {open && shown.map(renderGroup)}
        {open && grouping === "owner" && s.overlap && overlapRow(s.overlap, `section-${id}`, s.overlap.statements, id !== "unvalued")}
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
    <TrFoot view={bookView} key="private" data-pm-total="private"
      // EVERY capital-account statement the row's capital draws on, and the
      // ones its capital columns COUNT — the second is what the tiles add to,
      // the first is what the named public-market accounts complement.
      data-pm-capital-accounts={fig.capitalAccounts + fig.capitalAlso} data-pm-capital-counted={fig.capitalAccounts}
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
  /**
   * THE SECOND STATEMENT OF A HOLDING COUNTED ONCE (PM-A2): its capital is left
   * out of these totals, and each total's hover says, in rupees, what it would
   * add — the same clause every capital tile's hover carries.
   */
  const alsoNames = m.counting.alsoReported.map((x) => accName(x.commitment.accountId)).join(" and ");
  const alsoClause = (v: number | null | undefined, what: string) =>
    m.counting.alsoReported.length && v != null && v > 0
      ? `${alsoNames} ${m.counting.alsoReported.length === 1 ? "is the second statement" : "are second statements"} of a holding counted once and would add ${money(v)} ${what} — pending the family's answer on whether each pair is one investment or two.`
      : null;
  const capTitles: Partial<Record<string, string>> = {
    committed: [
      `Promised across the ${capCount} private-market capital account${capCount === 1 ? "" : "s"} this total counts.`,
      alsoClause(m.alsoCt.committed, "committed"),
      capElsewhereClause,
    ].filter(Boolean).join(" "),
    // WHETHER CALLED AND PAID IN MAY BE SET AGAINST EACH OTHER IS MEASURED PER
    // ACCOUNT (Stage 10bw): where the two cover different accounts the hover on
    // the Called total says not to subtract them, and where they cover one set
    // it says they may — a warning about a valid subtraction would be false.
    // AND IT NEVER SAYS EVERY ACCOUNT PRINTS A CALLED LINE (PM-C4): one does;
    // the rest carry the capital drawn plus any call printed as unpaid.
    called: [
      m.calledPaidSameSet
        ? `Asked for by the funds so far, over the ${m.cc.calledOf} accounts that carry a called figure — the fund's own called line where its statement prints one, and otherwise the capital drawn plus any call it prints as unpaid — the same accounts Paid in covers.`
        : `Called and Paid in cover different accounts and must not be subtracted from each other: the ${m.cc.count - m.cc.calledOf} account${m.cc.count - m.cc.calledOf === 1 ? "" : "s"} missing from the first ${m.cc.count - m.cc.calledOf === 1 ? "is" : "are"} present in the second.`,
      alsoClause(m.alsoCc.called, "called"),
    ].filter(Boolean).join(" "),
    paid: alsoClause(m.alsoCc.paid, "paid in") ?? undefined,
    uncalled: [
      `Summed exactly as each fund prints it — ${money(m.cc.uncalled)} over the ${m.cc.uncalledOf} accounts that print the line — and never derived from committed − called, because a fund that prints no uncalled figure has not said it has nothing left to call.`,
      m.cc.called != null && m.cc.committedWhereCalled != null
        ? `The same figure the other way: committed ${money(m.cc.committedWhereCalled)} less called ${money(m.cc.called)} is ${money(m.cc.committedWhereCalled - m.cc.called)}, both struck over the same ${m.cc.calledOf} accounts.`
        : null,
      alsoClause(m.alsoCt.undrawn, "still to call"),
      // EVERY STATEMENT, not the counted set: a second statement of a holding
      // counted once is still an account that sends one.
      `${m.schemes.length - m.capOutside} of this page’s ${m.scope.accounts.length} private accounts send a capital-account statement, and the family’s own investment register names funds with no statement in this book at all — so ${money(m.cc.uncalled)} is the floor of what the funds can still call, never the ceiling.`,
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
          at the top of this file for what each section holds and why the
          missing-data one starts closed. */}
      <Card className="mt-5" pad={false} title={active.cardTitle}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <EditColumns view={view === "transactions" ? callView : bookView} />
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
            {(view === "funds" || view === "owners") && (
              <ReturnMeasureSelect measures={returnMeasures} onChange={setReturnMeasures} hints={PM_RETURN_HINTS} source={returnSource} />
            )}
            {(view === "funds" || view === "owners") && <ExpandAllButton allOpen={allOpen} onClick={toggleAll} />}
          </div>
        }>

        {(view === "funds" || view === "owners") && (
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
                    title={weightHeadTitle}>Weight</SortHeader>
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
                {renderSection("atCost")}
                {renderSection("unvalued")}
              </tbody>
              <tfoot>
                {totalRow(book.privateTotal, "Private market total", {
                  // NO LINE UNDER THE LABEL (Stage 10co): what the row counts,
                  // and the capital a pair reported twice leaves out, pending
                  // the family's answer (PM-A2), is the label's hover.
                  labelTitle: `Each holding, and its capital account, counted once, and the ${capCount} capital account${capCount === 1 ? "" : "s"} it counts on this page — what the capital tiles add to.`
                    + (book.privateTotal.capitalAlso > 0
                      ? ` ${book.privateTotal.capitalAlso} more ${book.privateTotal.capitalAlso === 1 ? "statement reports a holding" : "statements report holdings"} counted once; ${book.privateTotal.capitalAlso === 1 ? "its" : "their"} capital is not added, pending the family's answer on whether each pair is one investment or two.`
                      : ""),
                  titles: capTitles,
                  // THE ACCOUNTS ONLY NAMED, on the row whose Committed total
                  // names them — the ids, and the clause itself, so the sweep
                  // reads what the hover says rather than a paragraph.
                  attrs: {
                    "data-pm-total-also": String(book.privateTotal.capitalAlso),
                    ...(m.capElsewhere.length ? {
                      "data-pm-cap-elsewhere": m.capElsewhere.map((x) => x.commitment.accountId).join(" "),
                      "data-pm-cap-elsewhere-text": capElsewhereClause ?? undefined,
                    } : {}),
                  },
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
                    hint={"A fund's calls are listed only where they reproduce the total its own statement prints — otherwise none of that fund's are shown."
                      + (m.counting.alsoReported.length
                        ? ` The Called tile leaves out ${money(m.alsoCc.called)} of these: ${m.counting.alsoReported.map((x) => accName(x.commitment.accountId)).join(" and ")} ${m.counting.alsoReported.length === 1 ? "is the second statement" : "are second statements"} of a holding counted once, pending the family's answer.`
                        : "")} />
                </tr>
                {callsShown.map((c, i) => (
                  <Tr view={callView} key={`${c.accountId}-${c.date}-${i}`} className="hover:bg-ink-700/40" data-call-row={c.date}>
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-2 text-slate-200">{c.fund}</td>
                    <td className="px-4 py-2 text-slate-400">{c.owner ?? DASH}</td>
                    <td className="px-4 py-2 text-slate-500">{c.label ?? DASH}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{moneyFull(c.amount)}</td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <TrFoot view={callView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                  label={<>Total · {callsShown.length} calls{needle ? ` of ${m.history.length}` : ""}</>}
                  cells={{
                    amount: <td key="amount" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{moneyFull(sum(callsShown.map((c) => c.amount)))}</td>,
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
