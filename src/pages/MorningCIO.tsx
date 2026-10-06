import { useMemo } from "react";
import { Briefcase, Wallet, TrendingUp, TrendingDown, Percent, Fuel, Coins, Landmark, Layers, Users, Target, Scale, PieChart, Banknote, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { SelectableTiles, type TileMetric } from "@/components/SelectableTiles";
import { StockLink } from "@/components/StockLink";
import { Link } from "react-router-dom";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, fundTotals, startupTotals, sumOrNull, marketSides, isPrivateClass,
  holdingBucket, bucketLabel, MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET,
  costCoversSet, currentHoldings, droppedHoldings, NEGLIGIBLE_VALUE_FLOOR,
} from "@/lib/analytics";
import { accountIndex, engagementOf, ownerOf } from "@/lib/accounts";
/**
 * THE THREE AXES THE ALLOCATION TABLE CAN BE GROUPED ON, decided once for this
 * screen and the Portfolio Monitor alike — see the header of `groupAxis.ts`.
 */
import {
  GROUP_AXES, GROUP_VIEWS, type GroupAxis, groupKeyFor, groupSourceFor,
  groupCount, GROUP_COLUMN_HEAD, GROUP_NOUN,
} from "@/lib/groupAxis";
import {
  BASKET_ORDER, FAMILY_CLASS_ORDER, UNCLASSIFIED, UNCLASSIFIED_WHY,
} from "@/lib/familyTaxonomy";
import { useViewParam } from "@/components/ViewToggle";
import { AllAlerts } from "@/components/AllAlerts";
import { usePriceAlerts } from "@/lib/usePriceAlerts";
import { drilldownHref, AXIS_SCOPE, TOP_NAMES, bookMoneyWeighted, bookReturnOnCost, costedSetLabel, SIDE_NOTE } from "@/lib/drilldown";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";

/** The allocation table's columns, in the order its rows write their cells. */
const ALLOC_COLS = ["section", "invested", "current", "return", "weight"] as const;
import { useTableView, sortRows } from "@/lib/tableView";
import { fmtPct, fmtCurrency, changeColor, fmtFyPeriod, fmtNum, fmtDate } from "@/lib/format";
import { type XirrResult, fundXirr, startupXirr } from "@/lib/bucketXirr";
import { fifoTotals, investedWithCapital, type FifoTotals } from "@/lib/fifo";
import { type PrivateSheet, stockHref } from "@/lib/auditFormulas";
import { netMultiple, netMultipleKind } from "@/lib/privateValue";
import { countedOnceNote, commitmentTotals } from "@/lib/privateMarket";
import { privateBookFolios, figuresOf, distributionLeftOutNote } from "@/lib/privateBook";
import { BOOK_CORPORATE_ACTIONS } from "@/data/glowData";
import { AbsentCell, AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { costedFigures, VACUOUS_COST_REASON } from "@/lib/clubbedFigures";
import { NavVsIndex } from "@/components/NavVsIndex";
import { valuationDates, valuationNote, dateSpan } from "@/components/BasisPill";
import { BENCHMARKS, benchmarkByKey } from "@/lib/benchmarks";
import { DailyMovers } from "@/components/DailyMovers";
import { CHART_COLORS } from "@/lib/chartTheme";
import { INVESTOR_DEFAULT_TILES, investorPeriodReturn, investorAnnualReturn } from "@/lib/investorSummary";

// Morning CIO — the whole book in one screen: invested / current / return per
// bucket, plus capital deployment, concentration and book performance. Every
// figure is CONSOLIDATED: each dedupeGroup counted once.
//
// THE ALLOCATION BUCKETS ARE NOT PURE ASSET CLASSES, AND THAT IS THE POINT.
// This page grouped strictly on what a holding IS, so shares a discretionary
// manager chose and shares the family bought in its own demat were one "Equity"
// row separated by a caption. The family asked three times for that difference —
// and the third time made it plain that they were asking for a GROUPING, not a
// better word: a share held through a mandate belongs inside that mandate.
// `holdingBucket` in analytics.ts decides it, once, for every surface; §5 is
// untouched, because a PMS is still an ENGAGEMENT and never an `assetClass`.
// What changed is how the rows GROUP, and the heading says so.
//
// WHAT CHANGED FOR THIS BOOK, AND WHY. Every private-market bucket is EMPTY —
// these five accounts are discretionary PMS mandates in listed Indian equity,
// and no statement in the drop carries a fund, an unlisted company or a startup.
// The page previously rendered that as a strip of ₹0 tiles: "DRY POWDER ₹0",
// "DISTRIBUTIONS ₹0", a private book of "₹0 invested → ₹0 today", and a
// deployment bar showing 100% undrawn against nothing committed. Every one of
// those reads as a measurement — the family committed capital and drew none —
// when the truth is that there is nothing here to measure.
//
// So an empty bucket is never a row, never a tile value and never a chart
// segment. It is named, once, as absent. All of it is driven by the book's own
// collections: ingest a private-market statement and the buckets, the deployment
// card and the private half of the performance card populate themselves.
//
// THE XIRRs COME FROM THE BOOK, NOT A LEDGER FETCH. They used to be loaded from
// `audit/current/holdings.json` — a workbook-shaped sheet this pipeline does not
// write, so they resolved to "—" on every load. They now read the same dated
// flows the Performance page uses (`accountCashFlows`, from each account's
// capital register or bank book), so the headline figure and the per-account
// table on /performance are the same measurement rather than two.
/**
 * ONE COLOUR PER BUCKET, so the donut and the table beside it agree.
 *
 * Direct Equity keeps the champagne the equity row has always had; the mandate
 * bucket takes its darker sibling, because the two are the same asset held two
 * ways and reading as neighbours is the point. Anything the book produces that
 * is not named here takes the shared categorical palette in order — a class
 * this drop does not carry must arrive with a colour rather than a blank swatch.
 */
const BUCKET_COLOR: Record<string, string> = {
  [DIRECT_EQUITY_BUCKET]: "#d9c48f",
  [MANDATE_BUCKET]: "#c3a962",
  [UNROUTED_EQUITY_BUCKET]: "#f59e0b",
  AIF: "#a855f7",
  "Mutual Fund": "#22d3ee",
  ETF: "#0ea5e9",
  Cash: "#64748b",
};
const bucketColor = (key: string, i: number) => BUCKET_COLOR[key] ?? CHART_COLORS[i % CHART_COLORS.length];

/**
 * ONE COLOUR PER SECTION ON THE FAMILY'S OWN TWO AXES, for the same reason as
 * the map above: the donut and the table beside it have to agree, and a section
 * the book produces that is not named here must still arrive with a colour
 * rather than a blank swatch.
 *
 * THE UNCLASSIFIED SECTION IS DELIBERATELY OFF THE PALETTE. It is not one of the
 * family's four baskets or four asset classes — it is the holdings their review
 * does not place — so it takes a muted slate that reads as a remainder rather
 * than as a fifth choice they made.
 */
const BASKET_COLOR: Record<string, string> = {
  // The two biggest baskets on this book are 58% and 34% of it, so they take
  // colours from opposite ends of the palette. Drawn as two champagne shades
  // (the first cut) the donut read as one wedge covering 92% of the NAV.
  "Stable Growth": "#c3a962",
  "Thematic & Tactical": "#a855f7",
  "Entrepreneurial Growth": "#10b981",
  Liquidity: "#22d3ee",
};
const FAMILY_CLASS_COLOR: Record<string, string> = {
  Equity: "#c3a962",
  Debt: "#818cf8",
  Alternate: "#a855f7",
  Cash: "#22d3ee",
};
const UNPLACED_COLOR = "#64748b";
/**
 * WHAT THE CARD IS CALLED ON EACH AXIS. The category title is unchanged — it
 * predates the regroup and is not a perfect description of that axis, but it is
 * the heading the family reads and `check:pages` uses it as a section boundary
 * on this page. The other two say plainly whose taxonomy they are.
 */
const ALLOC_TITLE: Record<GroupAxis, string> = {
  category: "Allocation by asset class & mandate",
  assetClass: "Allocation by asset class — the family's own",
  basket: "Allocation by basket — the family's own",
};
/**
 * ── ONE PAGE, THREE PANELS, AND NO PAGE SCROLL ───────────────────────────────
 *
 * *"Divide the Morning CIO into three separate sections and tabs… the KPI tiles
 * at the top of the page will remain the same for all the three tabs… after
 * making the tabs the single scroll page should be gone, it should be a
 * non-scrollable page with a tab switch option to see more data rather than
 * scrolling the page."*
 *
 * THE TABS SWITCH WHICH QUESTION THE PAGE ANSWERS, not which subset of one
 * measurement it shows — which is why this is a layout split and not the shape
 * `DailyMovers`' own toggle has. What moved in one session, how the book is
 * allocated, and what it has earned against the index are three different
 * measurements over three different windows; nothing on this page was ever
 * summed across those boundaries, so not one figure moves with the split.
 *
 * THE KPI STRIP IS OUTSIDE THE PANEL, DELIBERATELY. The family asked for it on
 * every tab, and it is also the only part of this page that is true of all
 * three: a day's move, an allocation and a NAV series are each struck over a
 * subset that the panels state and the strip does not. Keeping it fixed is also
 * most of what makes the page fit without scrolling — the strip is what a
 * reader used to scroll past to reach anything.
 *
 * THE PANEL SCROLLS, THE PAGE DOES NOT. `overflow-y-auto` on the panel rather
 * than nothing at all: a window short enough to clip the NAV chart would
 * otherwise hide a figure with no way to reach it, which is worse than the
 * scroll the family asked to be rid of. What they asked for is that the
 * headline and the tiles stop moving, and they no longer do.
 *
 * IN `?tab=` LIKE EVERY OTHER VIEW IN THIS APP, so a panel is a link rather
 * than an instruction, `check:pages` reaches each one by URL rather than by
 * clicking, and Back steps between them. The first is param-free and is the
 * movers card, which is the panel the family named first.
 *
 * THE LABELS ARE DELIBERATELY NOT THE CARD HEADINGS THEY OPEN. A tab's text
 * sits in `innerText` on every one of this page's routes, so a label repeating
 * a heading would satisfy a check on a tab that heading is not drawn on. One in
 * particular is BANNED: this page's own roadmap-absence check asserts the words
 * "NAV vs benchmark" never return, because they once named a promised feature —
 * so the third tab is named for the index it actually charts.
 */
const CIO_TABS = [
  // NOT "today" (MNT-11): the funds branch is a published NAV struck on its own
  // business day, a fortnight old on this book, and the direct-equity branch is
  // the last session the quote feed priced. Each card dates its own figure.
  { key: "movers", label: "Daily Movers", title: "The latest move — the family's own direct equity on its last priced session, and their funds' last published NAV, each dated on its own card" },
  { key: "allocation", label: "Allocation & Risk", title: "How the book is split, what is still to be called, and where it is concentrated" },
  { key: "nav", label: "NAV vs Nifty 500", title: "The book's own dated valuation series against the index, net of capital in and out" },
  /**
   * ...AND A FOURTH, THE FAMILY'S OWN PRICE ALERTS (Stage 10cq). *"in morning
   * CIO can you make an ALL alerts tab where … whenever the alerts which have
   * been set are triggered they show simply."* It goes LAST so the three the
   * family arranged keep their places and the default stays the movers panel;
   * what makes it findable from any of them is the count badge on the tab
   * itself, which says how many have fired without the tab being open.
   */
  { key: "alerts", label: "All alerts", title: "Every price alert you have set, and which have been reached" },
] as const;
// Fresh visits show the investor's value, gain, yearly rate and FYTD return.
// Keep the storage key: an explicitly customised layout remains the reader's.
const CIO_TILES_KEY = "glow:cioTiles:v1";

const sectionColor = (axis: GroupAxis, key: string, i: number) => {
  if (key === UNCLASSIFIED) return UNPLACED_COLOR;
  if (axis === "category") return bucketColor(key, i);
  const map = axis === "basket" ? BASKET_COLOR : FAMILY_CLASS_COLOR;
  return map[key] ?? CHART_COLORS[i % CHART_COLORS.length];
};

export function MorningCIO() {
  const { consolidated, portfolio, statementPortfolio, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  /**
   * WHICH AXIS THE ALLOCATION CARD IS GROUPED ON. In the URL (`?alloc=`) like
   * every other view in this app, and for the reason the Portfolio Monitor's
   * own axis is: the family asked for three ways to read one book, and "send me
   * the basket view" has to be a link rather than an instruction. The default
   * stays param-free and stays CATEGORY, which is the table they already read.
   */
  const [allocAxis, setAllocAxis] = useViewParam(GROUP_VIEWS, {}, "alloc");
  // WHICH PANEL IS ON SCREEN. See `CIO_TABS` above for what the three are and
  // why the choice lives in the URL.
  const [tab, setTab] = useViewParam(CIO_TABS, {}, "tab");
  // THE ALERTS, CHECKED ON EVERY PANEL — not only the alerts panel — because
  // the tab's badge is how a reader on any of the other panels learns something
  // has fired. A HOOK, so it sits up here with the others, above the early return.
  const alerts = usePriceAlerts();
  /**
   * THE THIRD TAB NAMES THE BENCHMARK THE CHART BEHIND IT DRAWS. The NAV card
   * lets the reader pick one (`?bench=`, read by `NavVsIndex` off the same
   * param), and a tab still reading "Nifty 500" over a chart of the Sensex is a
   * label not describing its panel. The default is unchanged, so the tab reads
   * exactly what it always did until a reader picks another.
   */
  const [benchKey] = useViewParam(BENCHMARKS, {}, "bench");
  const navTabLabel = `NAV vs ${benchmarkByKey(benchKey).label}`;
  // A HOOK, so it is declared here rather than beside the rows it arranges:
  // this component returns early on an unloaded book, and a hook after that is
  // a different bug from the one being fixed.
  const allocView = useTableView("cio-allocation", ALLOC_COLS);
  // One "today" for every XIRR on the page, so every figure closes on the same
  // date against the same valuation.
  const today = useMemo(() => new Date(), []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    // CONSOLIDATED throughout this page — every figure spans every account in
    // the book, so each dedupeGroup counts once. `portfolio.positions` still
    // carries both rows for the per-account views elsewhere.
    //
    // NAMED `book*`, NOT `listed*`, AND THE TILES SAY SO. These sums have always
    // run over `consolidated`, which is EVERY position — the AIF folios, the
    // mutual funds and the cash sweeps included. They were called `listed*` from
    // the days when every account in the drop was a listed-equity mandate, and
    // the Capital invested tile went on printing "cost in · listed only" over a
    // figure covering ₹461 Cr of which 62% is private by asset class. A caption
    // that narrows a figure it does not narrow is the same failure as one that
    // widens it: the reader believes a scope nothing measured.
    /**
     * CURRENT HOLDINGS, SO THIS PAGE COUNTS WHAT ITS DRILL-DOWNS LIST.
     *
     * *"exclude closed rows from morning cio positions too."* The drill-downs
     * already list current holdings only; this tile counted every row the book
     * carries, so Positions read 369 over a page listing 364 — a figure
     * disagreeing with the page it opens, which is the one failure
     * `drilldown.ts` exists to prevent.
     *
     * IT MOVES NO MONEY, which is why the filter belongs at `p` rather than on
     * the two counts alone: every closed row carries `marketValue: 0` and
     * `costBasis: null`, so every sum below is identical and `sumOrNull` was
     * already skipping them. What changes is the COUNTS — Positions, Distinct
     * names, and the cost-coverage count on the Capital invested tile, which
     * used to read "60 of 369" against a drill-down facet showing 55.
     *
     * Through `currentHoldings` rather than an inline `isRedeemedToNil`: the
     * Portfolio Monitor, Private Market, the fund look-through and
     * `resolveDrilldown` all read that one helper, and a fifth copy of what
     * "current" means is a fifth chance for one screen to disagree with the
     * others about which rows the family still holds.
     */
    const p = currentHoldings(consolidated);
    // What the ₹1,000 floor took out of the counts and out of `bookMV`. Named on
    // the Positions tile rather than left for a reader to notice the count move.
    const smallRows = droppedHoldings(consolidated).negligible;
    const smallDropped = { count: smallRows.length, value: sum(smallRows.map((x) => x.marketValue)) };
    const bookMV = sum(p.map((x) => x.marketValue));
    // `sumOrNull`: a position whose statement carries no cost must not enter a
    // book-wide cost as zero — it would understate the basis and overstate the
    // return on everything else. The positions it SKIPS are counted, because a
    // total that covers 303 of 309 positions has to say so on its own tile.
    const bookCost = sumOrNull(p.map((x) => x.costBasis));
    const bookPnL = sumOrNull(p.map((x) => x.unrealizedPnL));
    const noCost = p.filter((x) => x.costBasis == null);
    const noCostMV = sum(noCost.map((x) => x.marketValue));

    const pm = portfolio.privateMarkets;
    const peF = fundTotals(pm.peFunds);
    const preF = fundTotals(pm.preIpoFunds);
    const unlF = fundTotals(pm.unlistedCompanies);
    const debtF = fundTotals(pm.debtFunds);
    const st = startupTotals(pm.startups);
    // Fund-commitment lifecycle (incl. fully-exited "closed" funds).
    /**
     * CAPITAL DEPLOYMENT — from the COMMITMENTS the statements print, not from
     * `privateMarkets`.
     *
     * `privateMarkets` describes fund-of-funds investments with their own TVPI
     * and DPI, and this book holds none. What it DOES hold is two drawdown AIF
     * commitments — ₹1.5 Cr each, half called — printed on the Transition
     * Venture capital-account statements. Reading only `privateMarkets`, this
     * tile said "no fund commitments in this book" while ₹1.5 Cr of undrawn
     * capital sat in the archive, callable at any time.
     *
     * `undrawn` is taken as each statement PRINTS it rather than derived from
     * committed − drawn: the fund states all three, and the build records
     * whether they agree.
     */
    /**
     * ── AND ONLY THE PRIVATE-MARKET FUNDS' CAPITAL ACCOUNTS ─────────────────
     *
     *   "private market fund needs to be here in private market only" — sent
     *    with the family's own classification of every capital account.
     *
     * Every figure on this card and on the two KPI tiles that read it opens
     * `/private-market`, and that page now carries the capital accounts of
     * PRIVATE-market funds only: Carnelian Bharat Amritkaal, Motilal Oswal
     * Delphi and both Founders Fund folios call capital against a commitment
     * and invest in listed equity, so they are named there and counted
     * nowhere on it. A tile that kept counting them would open a page whose
     * own total is ₹55 Cr smaller — the disagreement `drilldown.ts` exists to
     * prevent, one link over. `capitalScope` is the one rule both read.
     *
     * The distribution figure is the page's own: `privateBookFolios` builds
     * the private book once for both, so this tile counts what that page's
     * Distributions tile counts — each fund's distribution once, from its
     * capital account or from the fund's own letter (360 ONE's two income-only
     * folios report theirs nowhere else) — and not ₹50 L beside its ₹57 L
     * (B-10). Built off the STATEMENT book, as that page's rows are: a
     * distribution is a commitment fact no price moves.
     *
     * AND EACH CAPITAL ACCOUNT IS COUNTED ONCE WITH ITS HOLDING, as the page's
     * tiles count it (`privateCapital`, the one set both read). Transition
     * Venture Fund I is one holding under both family trusts (§4c), so its
     * second trust's capital is in no figure here either: still to call reads
     * the page's ₹15.23 Cr, not the ₹15.98 Cr both statements add to. The
     * hovers name what is left out and what it would add.
     */
    const pbook = privateBookFolios(statementPortfolio ?? portfolio, BOOK_CORPORATE_ACTIONS);
    const cap = pbook.cap;
    const commitments = cap.onPage;
    const counted = cap.counting.counted;
    const distFig = figuresOf(pbook.folios, true);
    const fundDeploy = fundTotals([...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]);
    const deploy = commitments.length
      ? {
        committed: sum(counted.map((c) => c.committed)) + fundDeploy.committed,
        drawn: sumOrNull([...counted.map((c) => c.drawn), fundDeploy.drawn]) ?? 0,
        distributed: sumOrNull([distFig.distributed, fundDeploy.distributed]) ?? 0,
        currentValue: fundDeploy.currentValue,
        unfunded: sumOrNull([...counted.map((c) => c.undrawn), fundDeploy.unfunded]) ?? 0,
        tvpi: fundDeploy.tvpi,
        dpi: fundDeploy.dpi,
      }
      : fundDeploy;
    const closedF = fundTotals(pm.closedFunds);
    /**
     * WHAT THE TWO COMMITMENT TILES COVER, AND WHEN (CK-C9). Each is summed as
     * the statements print it, so each is a figure over the capital accounts
     * that print that line — a floor where some do not — struck on each
     * account's own statement date. Counted here, off the same `counted` set
     * the figures are summed over — each capital account once with its holding
     * — so a tile cannot claim a coverage its sum does not have. Distributions
     * names its own coverage: it is the private book's once-per-fund count
     * (B-10), which reads the funds' letters as well as their capital accounts.
     */
    const capCoverage = (() => {
      const dates = [...new Set(counted.map((c) => c.asOf).filter((d): d is string => !!d))].sort();
      const undrawnOf = counted.filter((c) => c.undrawn != null).length;
      const oldest = dates[0] ?? null;
      const oldestUndrawn = oldest ? sum(counted.filter((c) => c.asOf === oldest).map((c) => c.undrawn ?? 0)) : 0;
      return { count: counted.length, undrawnOf, first: oldest, last: dates[dates.length - 1] ?? null, oldestUndrawn };
    })();
    // How many private instruments the book actually carries. Zero means the
    // segment is ABSENT, not that it measured nothing — every private figure
    // below is gated on this rather than on a flag.
    const privateCount = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length
      + pm.debtFunds.length + pm.closedFunds.length + pm.startups.length;
    const fundCount = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length
      + pm.debtFunds.length + pm.closedFunds.length;

    const totalValue = portfolio.totalValue;
    /**
     * ACCRUED INCOME — declared, not yet received, and NOT in the NAV above.
     *
     * §4b keeps accrued income out of market value on purpose: the managers fold
     * it in on some rows and not others, so the book carries it as its own field
     * and every market value stays price × quantity on one basis. That is right,
     * and it left ₹32.94 L on 85 positions appearing NOWHERE on screen — so the
     * consolidated NAV sat below the managers' own printed totals by exactly that
     * amount, with nothing to explain the gap to a reader holding the statement.
     *
     * Stating it is the other half of the rule. The NAV does not change; the tile
     * says what is not in it.
     */
    const accrued = sumOrNull(p.map((x) => x.accruedIncome));
    const accruedCount = p.filter((x) => typeof x.accruedIncome === "number" && x.accruedIncome !== 0).length;
    // `p` (consolidated) holds EVERY position — the AIF units included — so
    // bookMV / bookCost / bookPnL already carry the whole book. The
    // fund-of-funds model (privateMarkets) is the only thing SEPARATE from
    // positions, and it is empty here; its markup adds on top, but the AIF VALUE
    // must never be added again, because bookPnL already holds the AIF's gain.
    const privateInvested = st.invested + peF.drawn + preF.drawn + unlF.drawn + debtF.drawn;
    const privateCurrent = st.fairValue + peF.currentValue + preF.currentValue + unlF.currentValue + debtF.currentValue;
    /**
     * CAPITAL INVESTED IS THE SUM OF THE ALLOCATION ROWS' INVESTED, and each
     * WHOLE PMS mandate enters those rows at the capital the family paid into
     * it rather than the cost of the shares it holds now — what its FIFO return
     * is divided by (`investedWithCapital`). Struck over EVERY holding, exactly
     * as the rows are, so the tile, the footer and the rows are one sum; the
     * cost of the mandates' shares is in the footer's hover.
     */
    const bookWhole = fifoTotals(p, { accounts: portfolio.accounts, universe: p });
    const bookInvested = investedWithCapital(bookCost, bookWhole);
    const totalInvested = sumOrNull([bookInvested, privateCount ? privateInvested : null]);
    const privateGain = privateCurrent - privateInvested;
    // Cash returned by holdings still in the book (startups distribute nothing).
    const privateDistributed = peF.distributed + preF.distributed + unlF.distributed + debtF.distributed;
    const privateTotalGain = privateCurrent + privateDistributed - privateInvested;
    const privateNet = privateInvested > 0 ? (privateCurrent + privateDistributed) / privateInvested : null;
    // Embedded gain = the book's own unrealised P&L (AIF units already inside it)
    // plus the fund model's markup where one exists. Adding `portfolio.privateValue
    // − 0` on top — the AIF value against a fund model that reports no cost — is
    // what put embedded gain at 99.8% of invested, almost the whole NAV.
    /**
     * ── FIFO, OVER THE HOLDINGS THAT REPORT A COST ─────────────────────────
     *
     * This was `Σ unrealised ÷ Σ cost of what is still held`, which leaves out
     * every gain already realised on units sold — the mandates' above all,
     * whose managers sell their winners. `fifoTotals` adds the realised half
     * back and strikes each WHOLE mandate on its capital since inception, over
     * the same costed set the tile has always covered (the page it opens is
     * `?of=invested`, the holdings reporting a cost).
     */
    // THE SET IS `costedBookSet`'s (B-07): the tile, the allocation Total row
    // and the page the tile opens all name it on their face from this object.
    const { set: costedSet, fifo: bookFifo } = bookReturnOnCost(p, { accounts: portfolio.accounts, universe: p });
    const embeddedGain = sumOrNull([bookFifo.gain, privateCount ? privateGain : null]);
    const deployedCapital = sumOrNull([bookFifo.deployed, privateCount ? privateInvested : null]);
    const gainPct = deployedCapital !== null && embeddedGain !== null && deployedCapital > 0
      ? (embeddedGain / deployedCapital) * 100
      : null;
    /**
     * ── ONE WHOLE-BOOK RETURN, OVER ONE SET, WITH THE SAME LABEL (B-07) ──────
     *
     * The allocation table's Total row refused this figure — a bare "—" — on
     * the grounds that its Invested and Current do not cover the same set, while
     * the tile printed it and the Portfolio Monitor's footer printed it too:
     * one quantity gated on one surface and not on the others. The rule is now
     * one: the whole-book return on cost is struck over the holdings that
     * report a cost (Stage 10ca), and every surface that prints it names that
     * set ON ITS FACE — "on the ₹X of ₹Y valued against a cost · N of M
     * holdings" (`costedSetLabel`). A reader dividing Current by Invested in
     * the Total row is told, beside the figure, that it is not struck on those.
     * Since Stage 10dh the set is narrower than "reports a cost": a line the
     * family's review holds at cost reports one and carries no valuation of its
     * own, so it is in Invested and in no gain (`costedSet.struck`).
     */
    const costedMV = costedSet.costedValue + (privateCount ? privateCurrent : 0);
    const costCoversBook = totalValue > 0 && Math.abs(costedMV - totalValue) <= totalValue * 0.005;
    const footerPct = gainPct;
    // ── THE SIDES OF THE BOOK, in order, each with its own reason ──
    //
    // `marketSides` is the one list — see its note in `analytics.ts`. It used
    // to be a two-field `publicPrivateSplit` rendered as `listed / private`,
    // and those two percentages stopped summing to 100 the moment a third side
    // existed: a reader who adds the printed cells and gets 98 has found the
    // contradiction the allocation footer already cost this page once.
    const sides = marketSides(p);

    // The account registry, read for every question below that asks how an
    // account is RUN — the allocation buckets. `engagement` is what each
    // statement states outright; nothing here is pattern-matched out of a label.
    const accIdx = accountIndex(portfolio.accounts);
    const eqGroup = (rows: typeof p) => {
      /**
       * COST AND ITS GAIN OVER ONE SET — and none over nothing (A-14). The Cash
       * row holds two nil sleeves reporting a cost of ₹0 beside ₹14.2 Cr of
       * liquid funds whose statements report none; `sumOrNull` over the cost
       * was ₹0, and the row printed Invested ₹0 beside Current ₹14.2 Cr — a
       * measured zero over the only part of the row worth nothing.
       * `costedFigures` is the one test for that, shared with the Portfolio
       * Monitor's section totals, which print the same buckets.
       */
      const cf = costedFigures(rows);
      const cost = cf.cost;
      const mv = sum(rows.map((x) => x.marketValue));
      const pnl = cf.unrealised;
      // WHICH ROWS THE COST SIDE ACTUALLY COVERS. `sumOrNull` skips a position
      // whose statement reports no cost rather than entering it as zero, which
      // is right and leaves Invested covering a narrower set than Current in the
      // same row. Counting the skipped ones is the other half of that rule: the
      // row can then say so instead of inviting a reader to divide one printed
      // cell by another and land somewhere neither figure claims.
      const noCost = rows.filter((x) => x.costBasis == null);
      const withoutCostMV = sum(noCost.map((x) => x.marketValue));
      // …AND WHAT THAT SET IS WORTH. `cost` is struck over the holdings that
      // report one; `mv` is struck over all of them. Every ratio between the two
      // — the return AND the money multiple — has to be struck over the costed
      // side of both, or it divides one set of holdings by another and prints a
      // number neither column claims. This is the same figure `costedMV` is for
      // the whole book, one level down.
      const costedMV = sum(rows.filter((x) => x.costBasis != null).map((x) => x.marketValue));
      /**
       * A RETURN IS STRUCK ONLY WHERE THE COST SIDE COVERS THE ROW.
       *
       * Naming the coverage in a caption is not enough on its own, and this row
       * is where that became obvious: after the regroup, Direct Equity reports a
       * cost for 9 of its 38 holdings, so a return on cost read **−18.9%** in a
       * row printing ₹1.22 Cr invested and ₹12,446.1 Cr current. Every figure was
       * correct on its own terms and the three together were indefensible —
       * exactly the contradiction the footer already refuses ("No whole-book
       * return in the Total row"), arriving one row down because the regroup
       * isolated the depository holdings, which report what is held and never
       * what it cost.
       *
       * So the row uses the FOOTER'S OWN TEST, per bucket: the return is shown
       * only when the costed holdings account for essentially the whole row's
       * current value, to the same 0.5%. On this book that keeps AIF (+20.0%,
       * ₹98,742 uncovered out of ₹352.3 Cr) and PMS mandates (+11.4%, fully
       * costed), and correctly refuses Direct Equity and Mutual Fund, where the
       * two columns describe different sets of holdings.
       *
       * `costCoversSet`, not a copy of it: the Portfolio Monitor's per-category
       * totals row prints a return over the SAME buckets, and two copies of one
       * test are two chances for one screen to show a return the other refuses
       * for the category a reader is comparing them on.
       */
      const costCoversRow = costCoversSet(mv, withoutCostMV);
      // FIFO over the row's own holdings — realised on units sold stays in the
      // return, and a whole mandate is struck on its capital (`fifoTotals`).
      const fifo = fifoTotals(rows, { accounts: portfolio.accounts, universe: p });
      return {
        count: rows.length, cost, mv, pnl,
        vacuous: cf.vacuous,
        withoutCost: noCost.length,
        withoutCostMV,
        costedMV,
        costCoversRow,
        fifo,
        /**
         * *"Invested shows what FIFO divides by: ₹121.7 Cr paid into the PMS
         * mandates, with ₹124.6 Cr (cost of shares held) in the hover."* A
         * whole mandate's return is struck on its capital, so beside the cost
         * of its surviving shares the row's Return does not follow from its
         * Invested and Current. Each whole mandate enters at what was paid in;
         * everything else stays at the cost of what is held.
         */
        invested: investedWithCapital(cost, fifo),
        ret: costCoversRow ? fifo.returnPct : null,
      };
    };
    /**
     * ── ALLOCATION IS GROUPED THE WAY THE FAMILY HOLDS THE BOOK ──
     *
     * These rows were keyed on `assetClass` with a hardcoded "Equity" bucket, so
     * the shares a discretionary manager chose sat in the same row as the ones
     * the family bought in its own demat accounts, distinguished only by a
     * caption underneath. The family asked three times for that difference to be
     * a GROUPING rather than a word: a share held through a mandate belongs
     * inside that mandate, and Direct Equity means shares held directly.
     *
     * `holdingBucket` in analytics.ts is THE ONE PLACE THAT DECIDES IT. A bucket
     * re-derived per screen is a bucket that disagrees with itself, which is
     * exactly how the words "Direct Equity" survived on this row for a release
     * after every other surface had stopped using them. The engagement comes
     * from the ACCOUNT (`engagementOf`) and never from the position: how a
     * holding is run is a fact about the account that holds it, and reading it
     * off the position is what would put two rows of one mandate in two buckets.
     *
     * A MANDATE TAKES ITS CASH SLEEVE WITH IT, so its row ties to the totals its
     * own statements print. What moves with it is NAMED at both ends — cash
     * disappearing out of the Cash row into a bucket that does not mention it is
     * the same silence this page has already been fixed for once.
     */
    /**
     * ── AND IT IS GROUPED THREE WAYS, BECAUSE THE FAMILY ASKED FOR ALL THREE ──
     *
     * *"I have given you my baskets… how is the core doing, how is the satellite
     * portfolio doing, how is the liquidity portfolio doing. This should be the
     * Morning CIO page. Add a selector in the allocation section to select asset
     * class wise / category wise / basket wise allocation and performance
     * overview."*
     *
     * The Portfolio Monitor grew these three axes first; this is the same
     * request arriving on a second screen, so the axis is decided by the SAME
     * function both screens group on (`groupKeyFor`, in `lib/groupAxis.ts`)
     * rather than by a copy living here. A basket that means one thing on the
     * Monitor and another on this page is the failure that file exists to stop.
     *
     * ALL THREE ARE BUILT ON EVERY RENDER, not just the active one. It is a
     * group-by over 369 rows and it keeps the axis out of this memo's
     * dependencies — the memo also pools every account's XIRR, and recomputing
     * that because a reader pressed a segment would be work for nothing.
     */
    const rowsByAxis = new Map<GroupAxis, Map<string, typeof p>>();
    for (const axis of GROUP_AXES) {
      const m = new Map<string, typeof p>();
      for (const x of p) {
        const key = groupKeyFor(axis, accIdx, x);
        const rows = m.get(key) ?? [];
        rows.push(x);
        m.set(key, rows);
      }
      rowsByAxis.set(axis, m);
    }
    const bucketRows = rowsByAxis.get("category")!;
    const rowsIn = (key: string) => bucketRows.get(key) ?? [];
    // ── Money-weighted returns, from the book's own dated flows ──
    //
    // Each account's external capital movements (capital register, or the bank
    // book where a manager issues none) plus the window's opening portfolio
    // value, closed against that side's market value.
    //
    // TWO RULES, BOTH LOAD-BEARING, both matching /performance exactly so the
    // headline here and the table there are one measurement rather than two:
    //
    //   1. ONLY ACCOUNTS WITH AN OPENING VALUE COUNT — flows AND market value.
    //      510854 publishes no FY performance summary, so its flows carry no
    //      opening portfolio value. Pooling it anyway put ₹5.92 Cr into the
    //      terminal flow with no opening stake behind it and returned 174.3%
    //      against 109.7% for the accounts that can be measured.
    //
    //   2. EACH ACCOUNT CLOSES ON ITS OWN STATEMENT DATE, ON ITS STATEMENT
    //      VALUE, AND THE WINDOW ENDS AT THE LATEST OF THOSE DATES — never at
    //      `portfolio.asOf` and never at `new Date()`. This ended the window on
    //      `portfolio.asOf`, the book's newest date (29 Aug, two quantity-only
    //      trust demats that value nothing), so the tile de-annualised over 150
    //      days where the pool closes on 13 Aug — +30.1% here against +26.5% on
    //      /performance for the same seven accounts. And it closed each account
    //      on its LIVE value dated to its statement: the flows are complete only
    //      to the statement date, so a price struck today does not belong there.
    //
    // Both rules live in `measuredAccountsReturn`, which /performance and the
    // Family & Entities rows call too, so the three are one computation — and
    // `bookMoneyWeighted` wraps it for this tile AND the `?of=measured` page it
    // opens (B-06), so the rate a reader clicks is the rate they land on.
    const mwb = bookMoneyWeighted(portfolio, statementPortfolio ?? null, today);

    const stX = startupXirr(pm.startups, today, null);
    const unlX = fundXirr(pm.unlistedCompanies, today);
    const peX = fundXirr(pm.peFunds, today);
    const preX = fundXirr(pm.preIpoFunds, today);
    const debtX = fundXirr(pm.debtFunds, today);

    type Basis = "ledger" | "first-investment";
    type Bucket = {
      key: string; color: string; count: number;
      /** NULL where no statement in the bucket reports a cost — never 0, see Position.costBasis. */
      invested: number | null;
      /** The bucket's only costed lines are nil balances beside uncosted value — `costedFigures` (A-14). */
      vacuous?: boolean;
      current: number;
      kind: "MOIC" | "TVPI"; metric: number | null;   // money-multiple, for the popover
      retPct: number | null;                          // total return on cost, for the popover
      /**
       * The market value of the holdings `invested` covers — the numerator of
       * BOTH ratios above. It equals `current` wherever every holding reports a
       * cost, and is smaller wherever one does not; the popover prints this
       * figure rather than `current`, and says how many holdings it spans.
       */
      costedMV: number;
      distributed: number;                            // cash already returned; 0 for listed & startups
      xirr: number | null;                            // annualised money-weighted return
      xirrBasis: Basis; xirrNote: string | null;
      /**
       * WHETHER THIS ROW HAS HOLDINGS TO OPEN — and therefore whether it links.
       *
       * Most rows are POSITION buckets and every one of them drills down. The
       * rest come from the fund-of-funds model (`privateMarkets.peFunds` and its
       * siblings), which carries fund-level records and no per-holding rows
       * anywhere in this book, so a link on one would open a table that could
       * only ever be empty — "a card that can NEVER be filled must not look like
       * one that is waiting", with a hyperlink on it. Every fund bucket is empty
       * in this drop and therefore renders no row at all; this flag is what keeps
       * that honest the day one does.
       */
      fromPositions: boolean;
      /** How many of `count` report no cost — Invested and Return cover the rest. */
      withoutCost: number;
      /** …and what they are worth, so the row can say what stands behind no cost. */
      withoutCostMV: number;
      /**
       * WHY INVESTED IS NOT THE COST OF WHAT IS HELD, where it is not — a row
       * holding WHOLE mandates prints their capital paid in, which is what its
       * return divides by, and names the cost of their shares beside it
       * (`investedBasisNote`, worded at render time in the reader's currency).
       * Null on every row that is not a position bucket.
       */
      investedFifo: FifoTotals | null;
      /**
       * Value in this section placed by the family's STATED RULE rather than
       * named product by product in their review. Zero on the category axis,
       * which asks nothing of them. A section filled entirely by a rule and one
       * the review states line by line are the same heading on screen, so the
       * row prints the difference rather than collapsing it.
       */
      ruleMV: number;
      /**
       * …and the value placed by their OTHER rule — the instruction that
       * arbitrage and liquid funds are cash. Kept apart from `ruleMV` because
       * the two are different rules and the paragraph under the table names
       * each one; see `TaxonomySource`.
       */
      cashRuleMV: number;
      /**
       * …and the value filed by WHAT THE INSTRUMENT IS rather than by either
       * (CK-C2): on the asset-class axis a company share the review does not
       * name is Equity and cash is Cash (`classByDerivation`). The note under
       * the table said nothing there was inferred from the instrument; this is
       * what was.
       */
      derivedMV: number;
      /**
       * TRUE where the family's review places this row nowhere — the
       * unclassified section, and any fund-of-funds row on a family axis. The
       * row says so rather than sitting under a heading that would read as a
       * basket the family chose.
       */
      unplaced: boolean;
      sheet: PrivateSheet | null;
    };
    const fundBasis = (r: XirrResult) =>
      r.dated < r.total ? `${r.total - r.dated} of ${r.total} holdings carry no dated first investment and sit outside this XIRR.` : null;
    // (The per-bucket XIRR note that used to live here went with the "Equity"
    // row: a rate struck over whole ACCOUNTS cannot be attributed to a bucket
    // that now splits their holdings by how they are held. The book-wide
    // money-weighted return, and the accounts it excludes, are stated in full on
    // the tile above and in the allocation footer's popover.)
    const fundBucket = (
      key: string, color: string, count: number, f: ReturnType<typeof fundTotals>, x: XirrResult, sheet: PrivateSheet,
    ): Bucket => ({
      key, color, count, invested: f.drawn, current: f.currentValue, distributed: f.distributed, investedFifo: null,
      kind: netMultipleKind(f.distributed), fromPositions: false,
      metric: netMultiple(f.drawn, f.currentValue, f.distributed),
      // A fund's drawn capital covers the whole of it, so the multiple's
      // numerator IS the bucket's current value.
      costedMV: f.currentValue,
      retPct: f.drawn > 0 ? ((f.currentValue + f.distributed - f.drawn) / f.drawn) * 100 : null,
      xirr: x.pct, xirrBasis: "first-investment", xirrNote: fundBasis(x), sheet,
      // A fund's drawn capital IS its cost, on every fund in the model — there
      // is no such thing as a drawdown with no call behind it.
      withoutCost: 0, withoutCostMV: 0,
      // The family's review classifies products and names none of these.
      ruleMV: 0, cashRuleMV: 0, derivedMV: 0, unplaced: false,
    });
    // A bucket of POSITIONS — no dated capital-movement flows at bucket level,
    // so no money-weighted rate; its total return on cost is what the row shows.
    const positionBucket = (axis: GroupAxis, key: string, i: number): Bucket => {
      const rows = rowsByAxis.get(axis)?.get(key) ?? [];
      const g = eqGroup(rows);
      /**
       * HOW MUCH OF THIS SECTION THE FAMILY NAMED, AND HOW MUCH THEIR RULE
       * PLACED. On the two family axes a section can be filled two ways — their
       * review naming a product, or their own stated rule ("all the direct
       * stocks belong to Thematic & Tactical") — and on screen both are just
       * rows under one heading. The difference is printed rather than
       * collapsed, exactly as the Portfolio Monitor's section headings print
       * it. Zero on the category axis, which asks nothing of the family.
       */
      const ruleMV = sum(rows.filter((x) => groupSourceFor(axis, accIdx, x) === "rule").map((x) => x.marketValue));
      const cashRuleMV = sum(rows.filter((x) => groupSourceFor(axis, accIdx, x) === "cash-rule").map((x) => x.marketValue));
      const derivedMV = sum(rows.filter((x) => groupSourceFor(axis, accIdx, x) === "derived").map((x) => x.marketValue));
      return {
        key, color: sectionColor(axis, key, i), count: g.count, invested: g.invested, current: g.mv, kind: "MOIC",
        investedFifo: g.fifo, vacuous: g.vacuous,
        fromPositions: true, ruleMV, cashRuleMV, derivedMV, unplaced: key === UNCLASSIFIED,
        // THE MULTIPLE IS STRUCK OVER THE ROWS THE COST COVERS, like the return
        // beside it. It was `mv / cost` — the WHOLE bucket's market value over a
        // cost `sumOrNull` struck on part of it — which on Direct Equity is
        // ₹12,446.1 Cr over the ₹1.22 Cr that 9 of its 38 holdings report, and
        // renders "MOIC 10240.51×". Nothing in the book multiplied by ten
        // thousand; two different sets of holdings were divided by each other.
        metric: g.invested !== null && g.invested > 0 ? g.costedMV / g.invested : null,
        retPct: g.ret, distributed: 0, xirr: null, xirrBasis: "ledger", xirrNote: null, sheet: null,
        withoutCost: g.withoutCost, withoutCostMV: g.withoutCostMV, costedMV: g.costedMV,
      };
    };
    /**
     * THE SECTIONS THIS BOOK IS DECLARED TO HAVE, PLUS ANY THE POSITIONS PRODUCE.
     *
     * The declared list is per AXIS and is in that axis's own vocabulary — so
     * the category list can no longer name "Equity", a bucket that no longer
     * exists, and the family lists are the family's own four names in their own
     * reading order. Anything `groupKeyFor` returns that is not declared (a
     * class this drop does not carry, equity whose account states no
     * engagement, a holding the family's review does not place) still gets its
     * own row: a section the book HAS must never be silently dropped for not
     * being on a list written before it arrived.
     */
    const DECLARED: Record<GroupAxis, readonly string[]> = {
      category: [MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, "AIF", "Mutual Fund", "ETF", "Cash"],
      basket: BASKET_ORDER,
      assetClass: FAMILY_CLASS_ORDER,
    };
    /**
     * THE FUND-OF-FUNDS ROWS, WHICH ARE THE SAME ON EVERY AXIS AND SAY SO.
     *
     * These come from `privateMarkets.*` — fund-level records rather than
     * positions — so `groupKeyFor` has nothing to key them on and the family's
     * review, which classifies PRODUCTS, does not name them. They therefore keep
     * their own rows on the two family axes and are marked `unplaced`, so a row
     * under a table of BASKETS never reads as a basket the family chose. Every
     * one of them is empty in this book, so none renders; this is what keeps it
     * honest the day one does.
     */
    const fundModelBuckets: Bucket[] = [
      { key: "Startups", color: "#6366f1", fromPositions: false, count: pm.startups.length, invested: st.invested, current: st.fairValue, kind: "MOIC", metric: st.moic, retPct: st.invested > 0 ? ((st.fairValue - st.invested) / st.invested) * 100 : null, distributed: 0, xirr: stX.pct, xirrBasis: "first-investment", xirrNote: fundBasis(stX), sheet: "startup", investedFifo: null, withoutCost: 0, withoutCostMV: 0, costedMV: st.fairValue, ruleMV: 0, cashRuleMV: 0, derivedMV: 0, unplaced: false },
      // Fund buckets: the multiple and the return-on-cost both count cash already
      // returned, so a bucket in repayment isn't read as a loss.
      fundBucket("Unlisted Companies", "#10b981", pm.unlistedCompanies.length, unlF, unlX, "pre-ipo"),
      fundBucket("PE / VC Funds", "#e0709b", pm.peFunds.length, peF, peX, "private-equity-funds"),
      fundBucket("Pre-IPO Funds", "#38bdf8", pm.preIpoFunds.length, preF, preX, "pre-ipo"),
      fundBucket("Debt Funds", "#818cf8", pm.debtFunds.length, debtF, debtX, "debt-fund"),
    ];
    const bucketsFor = (axis: GroupAxis): Bucket[] => {
      const declared = DECLARED[axis];
      const keys = [
        ...declared,
        ...[...(rowsByAxis.get(axis)?.keys() ?? [])].filter((k) => !declared.includes(k)),
      ];
      const all = [
        ...keys.map((k, i) => positionBucket(axis, k, i)),
        // A fund-model record carries no family taxonomy — see above.
        ...fundModelBuckets.map((b) => (axis === "category" ? b : { ...b, unplaced: true })),
      ];
      // A section the book holds NOTHING in is not a row of zeros — it is left
      // out entirely, so a reader can tell "nothing here" from "nothing left".
      // This is the whole §0 rule applied to the allocation view.
      return all.filter((b) => b.count > 0).sort((a, b) => b.current - a.current);
    };
    const bucketsByAxis = { category: bucketsFor("category"), assetClass: bucketsFor("assetClass"), basket: bucketsFor("basket") } as Record<GroupAxis, Bucket[]>;
    const buckets = bucketsByAxis.category;

    // The book-level XIRR — the per-account parts pooled with the fund-of-funds
    // model's calls and marks — is `bookMoneyWeighted`'s, above: one function
    // for this tile and the page it opens.

    // Concentration, consolidated on securityKey across accounts. ISIN cannot do
    // this here: the same company arrives from two platforms with two spellings
    // and, more often than not, no ISIN on either side.
    const byKey = new Map<string, number>();
    for (const x of p) byKey.set(x.securityKey, (byKey.get(x.securityKey) ?? 0) + x.marketValue);
    const ownersByKey = new Map<string, Set<string>>();
    for (const x of p) {
      const s = ownersByKey.get(x.securityKey) ?? new Set<string>();
      s.add(ownerOf(accIdx, x));
      ownersByKey.set(x.securityKey, s);
    }
    const crossHeld = [...ownersByKey.values()].filter((s) => s.size >= 2).length;
    const bySecurity = [...byKey.entries()].sort((a, b) => b[1] - a[1]);
    // TOP_NAMES, not a literal 10: the drill-down ranks the same list and a
    // second copy of the cutoff is a second chance for the tile and the page it
    // opens to cover different sets.
    const topNames = bySecurity.slice(0, TOP_NAMES);
    const top10Pct = bookMV > 0 ? (sum(topNames.map(([, v]) => v)) / bookMV) * 100 : null;
    const largest = bySecurity[0];
    const largestRow = largest ? p.find((x) => x.securityKey === largest[0]) ?? null : null;
    const largestName = largestRow?.security ?? null;
    const largestPct = largest && bookMV > 0 ? (largest[1] / bookMV) * 100 : null;
    // CONCENTRATION IS A BOOK-WIDE RISK MEASURE AND STAYS BOOK-WIDE — the
    // largest single name here IS a fund folio, and narrowing to companies
    // would hide the book's real biggest exposure. What it must not do is read
    // as a stock: the tile carries the class so a fund is not mistaken for one.
    //
    // IT CARRIES THE BUCKET, NOT THE RAW CLASS, and it is never suppressed.
    // The chip read `assetClass` and was hidden for the one value the reader
    // most needs qualified: a share. Today's largest name is the family's own
    // promoter holding, so the tile said nothing and nothing was wrong; the day
    // the largest is a name a discretionary manager picked, an unqualified line
    // is the exact claim of directness the family reported three times. The
    // label comes from the one helper that chooses these words.
    const largestBucket = largestRow
      ? bucketLabel(holdingBucket(largestRow, engagementOf(accIdx, largestRow)))
      : null;
    const priced = p.filter((x) => !x.costUnavailable);
    const winners = priced.filter((x) => (x.returnPct ?? 0) > 0).length;
    const losers = priced.filter((x) => (x.returnPct ?? 0) < 0).length;

    // NAV history is optional: a book assembled from current-holdings statements
    // has no year-end series until periodic valuation reports are ingested.
    const navSeries = portfolio.navHistory.map((n) => ({ period: n.period, value: convertFromBase(n.nav) }));
    const navFirst = portfolio.navHistory[0] ?? null;
    const navLast = portfolio.navHistory[portfolio.navHistory.length - 1] ?? null;
    const navGrowth = navFirst && navLast && navFirst.nav > 0 ? (navLast.nav / navFirst.nav - 1) * 100 : null;

    return {
      p, bookMV, bookCost, bookWhole, bookPnL, noCostCount: noCost.length, noCostMV, smallDropped,
      // Statement lines behind the consolidated count, for the Positions hover (CK-C8).
      rawLines: currentHoldings(portfolio.positions).length,
      accountCount: portfolio.accounts.length,
      ownerCount: new Set(portfolio.accounts.map((a) => a.owner)).size,
      totalValue, accrued, accruedCount, privateCurrent, privateInvested, totalInvested, embeddedGain, gainPct,
      footerPct, costedMV, costCoversBook, costedSet, capCoverage,
      sides,
      privateNet, privateGain, privateTotalGain, privateDistributed, deploy, commitments,
      capitalCounting: cap.counting,
      // The private book's folios, for the Distributions tile to name what it
      // counts once as the page it opens names it (B-10).
      privateFolios: pbook.folios,
      distReported: distFig.distributedOf,
      distAccounts: distFig.distributionAccounts,
      // No capital account and no letter reports one, and no fund-of-funds row
      // carries one: the tile is absent, never a summed ₹0.
      distAbsent: distFig.distributed == null && fundCount === 0,
      capitalAlso: commitmentTotals(cap.counting.alsoReported.map((x) => x.commitment)),
      privateCount, fundCount,
      closedInvested: closedF.drawn, closedDistributed: closedF.distributed,
      buckets, bucketsByAxis,
      // Where the pool closes — stated in the tile's hover beside the window.
      mwLastClose: mwb.lastClose,
      mwb,
      annual: investorAnnualReturn(statementPortfolio ?? portfolio),
      periods: (["fytd", "ytd"] as const).map((period) => ({
        period, ...investorPeriodReturn(statementPortfolio ?? portfolio, today, period),
      })),
      // THE ONE PLACE THE TILE'S FIGURE IS DECIDED. `moneyWeightedReturn`
      // refuses to annualise a window shorter than a year, so a strong quarter
      // can no longer reach the screen as a yearly rate — see the note on it.
      bookMW: mwb.result,
      distinctNames: byKey.size, crossHeld, top10Pct,
      largestName, largestKey: largest?.[0] ?? "", largestBucket, largestPct, winners, losers,
      navSeries, navFirst, navGrowth,
    };
  }, [portfolio, statementPortfolio, convertFromBase, today]);

  if (!portfolio || !model) return null;
  const m = model;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * THE CAPITAL COUNTED ONCE WITH ITS HOLDING, said the way the Private Market
   * tiles say it — the same function writes both, so the two pages cannot
   * describe the pair pending the family's answer two ways.
   */
  const accName = (id: string) => {
    const a = portfolio.accounts.find((x) => x.accountId === id);
    return a ? `${a.provider} ${a.accountNo}` : id;
  };
  const onceNote = (extra: number | null | undefined, what: string) =>
    countedOnceNote(m.capitalCounting, accName, (n) => money(n), extra, what);
  // The distribution a consolidated total leaves out, in the page's own words.
  const distAlso = distributionLeftOutNote(m.privateFolios, accName, (n) => money(n));
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  /**
   * THE SECTIONS THE CARD IS CURRENTLY DRAWING. All three are built in the
   * model; this picks one. Every figure in them is the same arithmetic over the
   * same holdings — only the grouping moves — which is why the footer, the
   * weight base and the cost-coverage refusal below need no branch of their own.
   */
  const sectionLabel = (key: string) => (allocAxis === "category" ? bucketLabel(key) : key);
  /**
   * The allocation table's own arrangement. Its default order is the axis's own
   * (largest first), which a third click on any heading hands back.
   */
  const sections = sortRows(m.bucketsByAxis[allocAxis] ?? m.buckets, allocView.sort, {
    section: (b) => sectionLabel(b.key),
    invested: (b) => b.invested,
    current: (b) => b.current,
    return: (b) => b.retPct,
    // Weight is `current ÷ the book`, so it orders exactly as Current does.
    weight: (b) => b.current,
  });
  // The bar chart above the table scales each bar against the LARGEST bucket's
  // current value, so the biggest fills the track and the rest read proportional
  // to it. The actual figure and weight print beside every bar, so the bar is a
  // visual encoding rather than one of the page's figures.
  const maxCurrent = Math.max(0, ...sections.map((b) => b.current));
  /**
   * HOW MUCH OF THIS VIEW THE FAMILY NAMED PRODUCT BY PRODUCT, summed off the
   * rows on screen rather than recomputed from the book — a caption struck on a
   * different set from the table under it is the failure this page has already
   * paid for twice.
   */
  const ruleMV = sections.reduce((a, b) => a + b.ruleMV, 0);
  const cashRuleMV = sections.reduce((a, b) => a + b.cashRuleMV, 0);
  const derivedMV = sections.reduce((a, b) => a + b.derivedMV, 0);
  // Fund commitments exist or they don't. `committed === 0` across zero funds is
  // the absence of a commitment schedule, not a schedule that commits nothing.
  // A commitment schedule exists if ANY source reports one — a drawdown AIF's
  // capital account counts, not only a fund-of-funds block.
  const hasCommitments = (m.fundCount > 0 || m.commitments.length > 0) && m.deploy.committed > 0;
  const calledPct = hasCommitments ? (m.deploy.drawn / m.deploy.committed) * 100 : null;

  /**
   * ── THE TILES A READER CAN PUT ON THE STRIP ─────────────────────────────────
   *
   * Every figure here is one this page ALREADY COMPUTES — the model above, the
   * Concentration card, the Capital deployment card — so a tile a reader picks
   * is a second rendering of a measurement, never a new one. Each carries ONE
   * destination: the drill-down that lists the set it is struck over, or
   * Private Market for a commitment fact, which is not a holding. A tile whose
   * figure the book does not carry renders an em dash WITH ITS REASON, because
   * an em dash must always name its cause.
   *
   * The investor summary keeps the paired figures, dates and coverage visible.
   * Detailed methodology stays in the hover and the destination page.
   */
  const absentWhy = (why: string) => <span className="text-slate-500">{why}</span>;
  const pct1 = (v: number | null | undefined, sign = true) =>
    v == null ? <AbsentValue /> : <span className={sign ? changeColor(v) : undefined}>{fmtPct(v, { sign, decimals: 1 })}</span>;
  const side = (key: string) => m.sides.find((x) => x.key === key) ?? null;
  const sideShare = (v: number) => (m.totalValue > 0 ? ` — ${((v / m.totalValue) * 100).toFixed(1)}% of the book` : "");
  const cashBucket = m.buckets.find((b) => b.key === "Cash") ?? null;
  /**
   * WHY INVESTED IS NOT THE COST OF WHAT IS HELD, IN THIS TABLE'S OWN TERMS
   * (DL-18). `investedBasisNote` is worded for the Portfolio Monitor, which
   * carries Unrealised and Realised columns — "Unrealised P&L is struck on
   * that", "Invested + Unrealised + Realised comes to…" — and this table and
   * these tiles carry neither, so a reader was pointed at columns that are not
   * here. Same three figures, off the same FIFO totals, without them.
   */
  const capitalNote = (f: FifoTotals | null) => {
    if (!f || !f.wholeMandates.length) return "";
    const n = f.wholeMandates.length;
    return [
      `${n === 1 ? "One whole PMS mandate enters" : `${n} whole PMS mandates enter`} at the capital paid in, ${money(f.wholeContributed)} — what ${n === 1 ? "its" : "their"} return is divided by`,
      `the cost of the shares ${n === 1 ? "it holds" : "they hold"} now is ${money(f.wholeCostHeld)}`,
      f.wholeWithdrawn > 0 ? `${money(f.wholeWithdrawn)} has been withdrawn from ${n === 1 ? "it" : "them"} since inception` : "",
    ].filter(Boolean).join(" · ");
  };
  /**
   * WHAT THE TWO COUNTS COUNT, IN THEIR OWN UNITS (CK-C8). The Positions hover
   * called 358 "one row per statement line" — it is the CONSOLIDATED count,
   * each holding two statements both report once — and both hovers promised
   * the page draws that unit, where it draws one row per name and per mandate.
   */
  const POSITIONS_WHAT = `Open every holding in the book. ${fmtNum(m.p.length)} is the count of current holdings with each one two statements both report counted once${m.rawLines !== m.p.length ? ` — ${fmtNum(m.rawLines)} statement lines, ${fmtNum(m.rawLines - m.p.length)} of them a second report of a holding already counted` : ""}; the page lists them grouped one row per name and per mandate.`;
  const NAMES_WHAT = `Open every holding in the book. ${fmtNum(m.distinctNames)} is the count of distinct securities across every account; the page lists them grouped one row per name and per mandate, so a mandate's names are one row there.`;
  const cioTiles: TileMetric[] = [
    /**
     * CURRENT VALUE OF HOLDINGS — AND WHAT WAS INVESTED IN THEM, ON ONE TILE.
     *
     * *"Capital invested and current value of holdings can be a single KPI tile
     * rather than being two separate KPI tiles and opening two separate pages.
     * Make a single KPI tile and show the invested capital."* The value is the
     * tile's figure and the capital invested is the second figure under it —
     * two measurements of the same holdings, so they belong on one card and
     * open one page, which lists both row by row.
     *
     * THE ACCRUED-INCOME DISCLOSURE STAYS IN THE HOVER. It has been moved twice
     * and must not vanish: our value differs from a manager's printed total by
     * exactly this, and a reader reconciling the two would otherwise find the gap
     * and no explanation.
     */
    {
      id: "value", label: "Portfolio value", icon: <Briefcase className="h-4 w-4" />,
      href: drilldownHref("book"),
      hrefTitle: `Open every holding in the book — what each is worth today and what was invested in it, each holding two statements both report counted once. The listed, private and not-placed sides, and the holdings whose statement reports a cost, are toggles on that page.${
        (() => { const note = valuationNote(valuationDates(portfolio), (n) => fmtFromBase(n, { compact: true })); return note ? ` ${note}` : ""; })()
      }${
        m.accrued == null || !m.accruedCount ? "" :
        ` NOT IN THIS FIGURE: ${fmtFromBase(m.accrued, { compact: true })} of accrued income — dividends and interest declared on ${m.accruedCount} holding${m.accruedCount === 1 ? "" : "s"} here and not yet received. The managers' printed totals fold it into market value on some rows and not others, so the book carries it as its own field and every market value on this site excludes it; a statement whose total runs above ours by about this much is agreeing with us, not disagreeing.`
      }${m.totalInvested == null ? "" : ` INVESTED is the cost the statements report, over the ${fmtNum(m.p.length - m.noCostCount)} of ${fmtNum(m.p.length)} holdings that report one, except that each whole PMS mandate enters at the capital paid into it — what its FIFO return divides by; ${fmtNum(m.noCostCount)} holdings worth ${fmtFromBase(m.noCostMV, { compact: true })} report no cost and are in the value and not in the capital invested, so the two figures are not a gain apart: the book's FIFO gain is ${m.embeddedGain == null ? "not struck" : fmtFromBase(m.embeddedGain, { compact: true, sign: true })}.`}`,
      value: fmtFromBase(m.totalValue, { compact: true }),
      second: m.totalInvested == null
        ? <span title="No statement in this book reports a cost basis, so there is no capital invested to show.">Invested <span className="text-slate-500">{DASH}</span></span>
        : <span className="whitespace-normal">Recorded invested <span className="mono font-semibold text-slate-100">{fmtFromBase(m.totalInvested, { compact: true })}</span>
          {/* ITS OWN COVERAGE, ON ITS FACE (DL-11). The value covers every
              holding and Invested the ones that report a cost, so the two are
              not a gain apart — the hover names the figure that is. The counts
              are `costedBookSet`'s, the set the Consolidated return names. */}
          </span>,
      sub: <>{m.costedSet.costedCount < m.costedSet.holdings && <>{fmtNum(m.costedSet.costedCount)} of {fmtNum(m.costedSet.holdings)} report a cost<br /></>}
        {(() => {
          const dates = valuationDates(portfolio);
          const span = dateSpan([...new Set([...dates.statement, ...dates.nav].map((d) => d.date))].sort());
          return `${dates.live.count ? "Live quotes" : "Valuations"}${span ? `${dates.live.count ? " + marks" : ""} · ${span}` : ""}`;
        })()}</>,
    },
    {
      id: "gain", label: "Gain / loss", icon: <TrendingUp className="h-4 w-4" />,
      href: drilldownHref("book", undefined, "costed"),
      hrefTitle: `Open the holdings whose statement reports a cost. The gain is struck over the ${fmtNum(m.costedSet.struckCount)} of them that also carry a valuation of their own, worth ${fmtFromBase(m.costedSet.struckValue, { compact: true })}. FIFO: the unrealised gain on what is held plus the gain already realised on units sold (for a whole PMS mandate, its value plus withdrawals less the capital paid in). Return on recorded capital is this gain over the capital deployed.${
        m.costedSet.atCost > 0 ? ` The ${fmtNum(m.costedSet.atCost)} line${m.costedSet.atCost === 1 ? "" : "s"} the family's consolidated review holds at cost (${fmtFromBase(m.costedSet.atCostValue, { compact: true })}) ${m.costedSet.atCost === 1 ? "is" : "are"} in the capital invested and in no gain: the review records what was paid and no valuation.` : ""
      } This is the recorded gain, not a complete since-inception total return: separate dividends and fund distributions and sales outside the available statements are not included, except within a whole PMS mandate.`,
      value: m.embeddedGain == null ? <AbsentValue />
        : <span className={changeColor(m.embeddedGain)}>{fmtFromBase(m.embeddedGain, { compact: true, sign: true })}</span>,
      second: m.gainPct == null ? undefined : <>Return on capital {pct1(m.gainPct)}</>,
      sub: m.embeddedGain == null ? absentWhy("No recorded cost or gain")
        : <>Recorded · {fmtNum(m.costedSet.struckCount)} of {fmtNum(m.costedSet.holdings)} holdings<br />Separate income excluded</>,
    },
    {
      id: "annualised", label: "Annualised return", icon: <TrendingUp className="h-4 w-4" />,
      href: "/performance?summary=annualised#investor-return",
      hrefTitle: `XIRR over statement accounts only, excluding separately modelled private investments. Covers ${m.annual.covered} of ${m.annual.total} accounts, worth ${money(m.annual.measuredValue)}. ${m.annual.start ? `Recorded window ${m.annual.start} to ${m.annual.end}. ` : ""}${m.annual.reason ?? "Annualised over at least one year."} Open the same return, dates and coverage in NAV & Performance.`,
      value: m.annual.pct != null ? <>{pct1(m.annual.pct)} <span className="text-sm">p.a.</span></> : <AbsentValue />,
      second: <span className="whitespace-normal">XIRR · {m.annual.covered} of {m.annual.total} accounts</span>,
      sub: m.annual.reason ? <>{m.annual.issueLabel}<br />{m.annual.reason}</>
        : <>{m.annual.windowDays} days{m.annual.end ? ` · to ${fmtDate(m.annual.end)}` : ""}</>,
    },
    ...m.periods.map((r): TileMetric => ({
      id: r.period, label: r.period === "fytd" ? "Return this financial year" : "Return this calendar year",
      icon: <CalendarDays className="h-4 w-4" />,
      href: `/performance?summary=${r.period}#investor-return`,
      hrefTitle: `${r.period.toUpperCase()}: ${fmtDate(r.start)}${r.end ? ` to the latest eligible statement, ${fmtDate(r.end)}` : " onwards"}. Whole-portfolio money-weighted return, not annualised, adjusted for dated contributions and withdrawals. ${r.covered} of ${r.total} accounts have usable opening values and cash flows for this period. ${r.reason ? `${r.reason}. Supply opening valuations at the start of the period and capital movements through matching closing valuations for every account; live prices cannot fill missing history.` : "Gain includes income retained in the accounts or paid out through their recorded withdrawals."}`,
      value: pct1(r.pct),
      second: <span className="whitespace-normal">{r.period.toUpperCase()} · since {fmtDate(r.start)}{r.gain != null ? <> · {money(r.gain, true)}</> : null}</span>,
      sub: r.reason ? <>Insufficient history · {r.covered} of {r.total} accounts<br />{r.reason}</>
        : <>Through {r.end ? fmtDate(r.end) : "—"} · all {r.total} accounts</>,
    })),
    /**
     * MONEY-WEIGHTED RETURN — an XIRR over the accounts that publish an opening
     * portfolio value. `moneyWeightedReturn` refuses to annualise a window
     * under a year (this tile once read +99.0% for exactly that reason, with
     * nothing miscalculated), and the hover is where the window and that refusal
     * are stated — Stage 10g(ii)'s guard, which must keep a home.
     */
    {
      id: "mwr", label: m.bookMW.annualised ? "XIRR (annualised)" : "Money-weighted return",
      icon: <TrendingUp className="h-4 w-4" />,
      href: drilldownHref("measured"),
      hrefTitle: `Open the holdings of the accounts this rate covers — those whose statements carry an opening portfolio value — with the accounts it cannot cover a toggle away on the same page. It covers ${m.mwb.accountIds.length} of the book's ${m.mwb.bookAccounts} accounts, worth ${fmtFromBase(m.mwb.measuredValue, { compact: true })} on their own statements${m.totalValue > 0 ? ` — ${((m.mwb.measuredValue / m.totalValue) * 100).toFixed(1)}% of the ${fmtFromBase(m.totalValue, { compact: true })} current value of holdings` : ""}; the rest publish no opening value and are outside this rate, not outside the book.${
        m.bookMW.windowDays == null ? "" :
        m.bookMW.annualised
          ? ` The window is ${m.bookMW.windowDays} days, so this is a genuine annual rate.`
          : ` THE WINDOW IS ${m.bookMW.windowDays} DAYS${m.mwLastClose ? `, TO ${m.mwLastClose}` : ""}, AND THE RATE IS NOT ANNUALISED: it is what these accounts have actually earned over that window — each account valued on its own statement, on the date that statement strikes it. Compounding it onto a full year would be a projection rather than a year the book has lived — this tile once read +99.0% for exactly that reason, with nothing miscalculated, against the managers' own annualised since-inception figures of about 7% to 31% for these very accounts.`
      }`,
      value: pct1(m.bookMW.pct),
      sub: m.bookMW.pct == null ? absentWhy("no statement in this book carries an opening portfolio value") : undefined,
    },
    /**
     * CONSOLIDATED RETURN — return on the capital actually invested, over the
     * whole book. It opens the same page as the value tile, on the holdings the
     * return is struck over: both figures divide by the same capital.
     */
    {
      id: "return", label: "Consolidated return", icon: <Percent className="h-4 w-4" />,
      href: drilldownHref("book", undefined, "costed"),
      hrefTitle: `Open the holdings whose statement reports a cost — the ${fmtNum(m.costedSet.costedCount)} of ${fmtNum(m.costedSet.holdings)}, worth ${fmtFromBase(m.costedSet.costedValue, { compact: true })} of the ${fmtFromBase(m.costedSet.bookValue, { compact: true })} book — on the Current Value of Holdings page. The return is struck over the ${fmtNum(m.costedSet.struckCount)} of them that also carry a valuation of their own, worth ${fmtFromBase(m.costedSet.struckValue, { compact: true })}${
        m.costedSet.atCost > 0 ? `; the ${fmtNum(m.costedSet.atCost)} line${m.costedSet.atCost === 1 ? "" : "s"} the family's consolidated review holds at cost (${fmtFromBase(m.costedSet.atCostValue, { compact: true })}) ${m.costedSet.atCost === 1 ? "is" : "are"} in the capital invested and in no gain` : ""
      }; the ${fmtFromBase(m.costedSet.bookValue - m.costedSet.costedValue, { compact: true })} that reports no cost is outside it. FIFO: the unrealised gain on what is held plus the gain realised on units already sold, over the capital deployed — the cost of the units held plus the cost of the units sold, and each whole PMS mandate at the capital paid into it. Cumulative, not annualised. Dividends and fund distributions are not in it, except inside a whole mandate's capital.`,
      value: pct1(m.gainPct),
      // THE SET, ON ITS FACE (B-07) — the same words the allocation table's
      // Total row prints beside the same figure, from `costedSetLabel`.
      second: m.gainPct == null ? undefined
        : <span data-costed-label className="whitespace-normal text-[11px] text-slate-400">{costedSetLabel(m.costedSet, (n) => fmtFromBase(n, { compact: true }))}</span>,
      sub: m.gainPct == null ? absentWhy("no statement in this book reports a cost basis") : undefined,
    },
    /* Uncalled capital and Distributions are COMMITMENT facts. With no
       commitment in the book they have no denominator — "₹0 undrawn" would
       assert a schedule that draws nothing, a different claim entirely. The
       figure is summed as each statement prints it, never derived from
       committed − called; the page it opens says so beside the rows. */
    {
      id: "uncalled", label: "Uncalled capital", icon: <Fuel className="h-4 w-4" />,
      href: hasCommitments ? "/private-market" : undefined,
      hrefTitle: `Open the capital accounts behind it — committed, called and still to call, folio by folio. Undrawn capital is not a holding and has no row in the book's positions, so it is on the Private Market page rather than in the holdings drill-down.${
        m.capCoverage.count ? ` Summed as each statement prints it, over the ${m.capCoverage.undrawnOf} of the ${m.capCoverage.count} private-market capital accounts that print an undrawn figure${m.capCoverage.undrawnOf < m.capCoverage.count ? " — a floor, since the rest print none" : ""}; each on its own statement, dated ${m.capCoverage.first}${m.capCoverage.last && m.capCoverage.last !== m.capCoverage.first ? ` to ${m.capCoverage.last}` : ""}${m.capCoverage.oldestUndrawn > 0 && m.capCoverage.last !== m.capCoverage.first ? `, of which ${fmtFromBase(m.capCoverage.oldestUndrawn, { compact: true })} is on the ${m.capCoverage.first} statements — a call made since would not show` : ""}.` : ""}`
        + onceNote(m.capitalAlso.undrawn, "uncalled balance"),
      value: hasCommitments ? <span className="text-amber-400">{fmtFromBase(m.deploy.unfunded, { compact: true })}</span> : <AbsentValue />,
      sub: hasCommitments ? undefined : absentWhy("no statement in this book reports a capital commitment"),
    },
    {
      id: "distributions", label: "Distributions", icon: <Coins className="h-4 w-4" />,
      // THE PAGE IT OPENS SHOWS THIS FIGURE (CK-C9): Private Market's strip
      // opens with its own Distributions tile, the same once-per-fund count (B-10).
      href: hasCommitments ? "/private-market?tiles=distributed,value,cost,uncalled" : undefined,
      hrefTitle: "Open the capital accounts behind it, with Private Market's own Distributions tile on the strip. Cash a fund has already returned is a movement on a capital account, not a position, so it lives with those accounts on the Private Market page."
        + ` Counted as that page counts it: each fund's distribution once — from its capital account (income and principal, before TDS) or from the fund's own distribution letter (the cash remitted, after expenses and TDS) — ${m.distReported} of the ${m.distAccounts} private-market accounts that could report one do, and the rest are skipped, never counted as nil.`
        + (distAlso ? ` ${distAlso}` : ""),
      value: hasCommitments && !m.distAbsent ? fmtFromBase(m.deploy.distributed, { compact: true }) : <AbsentValue />,
      sub: !hasCommitments ? absentWhy("no fund has distributed, because none is held")
        : m.distAbsent ? absentWhy("no private-market fund's papers report a distribution") : undefined,
    },
    /* ── EVERY OTHER FIGURE THIS PAGE CARRIES, one picker away ─────────────── */
    {
      id: "invested", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,
      href: drilldownHref("book", undefined, "costed"),
      hrefTitle: `Open the holdings whose statement reports a cost — the set this figure is summed over — on the Current Value of Holdings page. ${fmtNum(m.noCostCount)} holding${m.noCostCount === 1 ? "" : "s"} report none and sit outside it, a toggle away.${(() => { const note = capitalNote(m.bookWhole); return note ? ` ${note}.` : ""; })()}`,
      value: m.totalInvested == null ? <AbsentValue /> : fmtFromBase(m.totalInvested, { compact: true }),
      sub: m.totalInvested == null ? absentWhy("no statement in this book reports a cost basis") : undefined,
    },
    {
      id: "committed", label: "Committed to funds", icon: <Landmark className="h-4 w-4" />,
      href: hasCommitments ? "/private-market" : undefined,
      hrefTitle: "Open the capital accounts behind it — the full amount signed for, whether or not the fund has asked for it yet. Not money spent, and in no market value."
        + onceNote(m.capitalAlso.committed, "commitment"),
      value: hasCommitments ? fmtFromBase(m.deploy.committed, { compact: true }) : <AbsentValue />,
      sub: hasCommitments ? undefined : absentWhy("no statement in this book reports a capital commitment"),
    },
    ...(["listed", "private", "unplaced"] as const).flatMap((k) => {
      const x = side(k);
      if (!x) return [];
      return [{
        id: k, label: k === "listed" ? "Listed value" : k === "private" ? "Private value" : "Not placed",
        icon: k === "private" ? <Landmark className="h-4 w-4" /> : <Scale className="h-4 w-4" />,
        href: drilldownHref("book", undefined, k),
        hrefTitle: `${SIDE_NOTE[k]}${sideShare(x.value)}. Opens the book's own drill-down with this side selected.`,
        value: fmtFromBase(x.value, { compact: true }),
      } satisfies TileMetric];
    }),
    {
      id: "positions", label: "Positions", icon: <Layers className="h-4 w-4" />,
      href: drilldownHref("book"),
      hrefTitle: `${POSITIONS_WHAT}${m.smallDropped.count > 0 ? ` It leaves out ${m.smallDropped.count} holding${m.smallDropped.count === 1 ? "" : "s"} worth under ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)}, ${fmtFromBase(m.smallDropped.value)} in total, dropped automatically at the family's instruction.` : ""}`,
      value: fmtNum(m.p.length),
    },
    {
      id: "names", label: "Distinct names", icon: <Layers className="h-4 w-4" />,
      href: drilldownHref("book"),
      hrefTitle: NAMES_WHAT,
      value: fmtNum(m.distinctNames),
    },
    {
      id: "top-10", label: `Top-${TOP_NAMES} concentration`, icon: <PieChart className="h-4 w-4" />,
      href: drilldownHref("top-names"),
      hrefTitle: `Open the ${TOP_NAMES} largest names and the accounts holding them — their share of the ${fmtFromBase(m.totalValue, { compact: true })} current value of holdings.`,
      value: m.top10Pct == null ? <AbsentValue /> : `${m.top10Pct.toFixed(1)}%`,
      sub: m.top10Pct == null ? absentWhy("the book carries no holding to rank") : undefined,
    },
    {
      id: "cross-held", label: "Cross-held names", icon: <Users className="h-4 w-4" />,
      href: drilldownHref("cross-held"),
      hrefTitle: "Open the securities two or more entities each hold. This is NOT the duplicate policy: a cross-held name is two members each genuinely owning some of it, counted once per member; a duplicate is one holding that two statements both report, and the consolidated set has already collapsed those.",
      value: fmtNum(m.crossHeld),
    },
    {
      id: "winners", label: "Holdings showing a gain", icon: <TrendingUp className="h-4 w-4" />,
      href: drilldownHref("winners"),
      hrefTitle: "Open the holdings showing a gain against their own cost.",
      value: <span className="text-gain">{fmtNum(m.winners)}</span>,
    },
    {
      id: "losers", label: "Holdings showing a loss", icon: <TrendingDown className="h-4 w-4" />,
      href: drilldownHref("losers"),
      hrefTitle: "Open the holdings showing a loss against their own cost.",
      value: <span className="text-loss">{fmtNum(m.losers)}</span>,
    },
    {
      id: "largest", label: "Largest holding", icon: <Target className="h-4 w-4" />,
      href: m.largestKey ? stockHref(m.largestKey) : undefined,
      hrefTitle: m.largestName ? `Open ${m.largestName} — the single largest name in the book, by value across every account that holds it.` : undefined,
      value: m.largestPct == null ? <AbsentValue /> : `${m.largestPct.toFixed(1)}%`,
      second: m.largestName ? <span className="block max-w-full truncate" title={m.largestName}>{m.largestName}</span> : undefined,
      sub: m.largestPct == null ? absentWhy("the book carries no holding to rank") : undefined,
    },
    {
      id: "accrued", label: "Accrued income", icon: <Banknote className="h-4 w-4" />,
      href: drilldownHref("book"),
      hrefTitle: "Dividends and interest declared on holdings here and not yet received. NOT in the current value of holdings: the managers fold it into market value on some rows and not others, so the book carries it as its own field.",
      value: m.accrued == null ? <AbsentValue /> : fmtFromBase(m.accrued, { compact: true }),
      sub: m.accrued == null ? absentWhy("no statement in this book reports accrued income") : undefined,
    },
    ...(cashBucket ? [{
      id: "cash", label: "Cash", icon: <Wallet className="h-4 w-4" />,
      href: drilldownHref(AXIS_SCOPE.category, cashBucket.key),
      hrefTitle: "Open the cash holdings — bank sweeps, liquid funds and liquid ETFs held outside a manager's mandate. A mandate's own cash sleeve stays with its mandate.",
      value: fmtFromBase(cashBucket.current, { compact: true }),
    } satisfies TileMetric] : []),
  ];

  // "10 mandates", "1 mandate" — a count and its noun, agreeing.
  const many = (n: number, one: string, plural = `${one}s`) => `${n} ${n === 1 ? one : plural}`;
  // XIRR, with the multiple and the return-on-cost kept a click away. Both bases
  // run the identical solver; what each popover explains is how finely its
  // source dates the money.
  // TOTAL RETURN TO DATE per bucket — not annualised. An XIRR annualises a
  // sub-year window into a rate the book has not sustained for a year (>100% p.a.
  // off one strong quarter); the family asked to see the return actually earned
  // to date, so every row shows total return on the capital in it, and the
  // money-weighted figure (de-annualised) lives once in the footer total.
  /**
   * WHAT A ROW'S INVESTED COVERS, WITH THE FIGURE IT IS (CK-C3 · CK-C10). The
   * sentence put the costed holdings' CURRENT value where Invested was meant —
   * "₹98.6 L of the ₹94.9 Cr" beside an Invested cell of ₹1.22 Cr — and it was
   * only in the Return cell's hover, only where the return was refused. It is
   * the Invested cell's own hover now, on every row that covers part of itself.
   */
  const investedCoverage = (b: typeof sections[number]) =>
    `Invested covers the ${b.count - b.withoutCost} of ${b.count} holdings here that report a cost — ${money(b.invested)} of capital, on holdings now worth ${money(b.costedMV)} of the ${money(b.current)} beside it — and Current covers all of them: ${many(b.withoutCost, "holding")} worth ${money(b.withoutCostMV)} report${b.withoutCost === 1 ? "s" : ""} no cost.`;
  const returnCell = (b: typeof sections[number]) => {
    if (b.retPct == null) {
      /**
       * WHICH ABSENCE THIS IS, NAMED — a reader acts differently on each, and a
       * confidently wrong cause sends them to the wrong place.
       *
       * There are three, and the Cash row is why the third had to be written.
       * The regroup moved every PMS cash sleeve onto the mandate row, leaving
       * two fund statements that report a balance of ₹0 AGAINST A COST OF ₹0 —
       * both figures printed, neither missing. Told "no statement reports what
       * these cost", a reader goes looking for a statement that is already in
       * the archive and already says so. A measured zero is not an absence; what
       * it lacks is capital to strike a return against.
       */
      const why = b.vacuous
        ? `${VACUOUS_COST_REASON.charAt(0).toUpperCase()}${VACUOUS_COST_REASON.slice(1)}, and a return on cost has nothing to divide.`
        : b.invested == null
        ? `No statement reports what ${b.count === 1 ? "this holding" : "these holdings"} cost, so there is no return to strike — the cost is absent, not zero.`
        : b.withoutCost > 0
          ? `${investedCoverage(b)} A percentage across those two would divide one set of holdings by another, so it is not shown.`
          : b.invested <= 0
            ? `The statements report a cost of ${money(b.invested)} for ${many(b.count, "holding")} here — a measured ${b.invested === 0 ? "zero" : "figure"}, not a missing one — so there is no capital to strike a return against.`
            : b.current === 0
              ? `Current is ${money(0)} against ${money(b.invested)} of reported cost, so this row carries no value to measure a return against and none is struck.`
              : `No unrealised gain is reported against the ${money(b.invested)} of cost here, so the return would have to be assumed rather than measured.`;
      return <span className="text-slate-500" title={why}>{DASH}</span>;
    }
    const mult = b.metric == null ? DASH : `${b.metric.toFixed(2)}×`;
    /**
     * THE POPOVER STANDS ON THE SAME SET AS THE FIGURE IT EXPLAINS.
     *
     * It read "₹X invested is worth ₹Y now" with Y the bucket's WHOLE current
     * value while X covered only the holdings that report a cost — the row
     * caption's disclosure ("Invested and Return cover 9 of 38 holdings")
     * missing from the one place the two cells are explicitly divided. It prints
     * the costed side's own market value now, and says how many holdings that
     * spans whenever it is fewer than all of them.
     */
    /**
     * NO POPOVER, AND THEREFORE NO DASHED UNDERLINE. *"remove the underlines
     * from the allocation table too."* The dashed underline WAS the popover's
     * affordance, so removing only the decoration would leave a click target
     * nobody could see — which is why this is the same change the KPI tiles
     * took: the arithmetic moves to the page the row already opens.
     *
     * Everything the popover said is on that page and was checked before this
     * was deleted: `?of=bucket&key=<b>` prints the bucket's Invested, its
     * Current value and its Return on cost as tiles, states "cumulative, not
     * annualised" on the return, names the holdings reporting no cost, and
     * REFUSES the return on exactly the buckets this cell refuses it on. Its
     * formula card carries the same worked example.
     */
    return (
      <span className={`rounded-md bg-ink-700 px-1.5 py-0.5 text-[11px] font-semibold mono ${changeColor(b.retPct)}`}>
        {fmtPct(b.retPct, { sign: true, decimals: 1 })}
      </span>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── NO BASIS PILL ───────────────────────────────────────────────────
          *"remove — 'LIVE · Consolidated · listed live / 49 accounts behind'
          part from the UI."*

          IT IS THE ONE REMOVAL IN THIS ROUND THAT TOUCHES A STANDING RULE, and
          that is recorded rather than glossed: §6 of the conventions says every
          consolidated figure carries a `<BasisPill>`, because a reader who
          cannot tell a statement mark from a live one cannot check anything,
          and because a consolidated total here is a BLEND of report dates that
          `portfolio.asOf` states only the newest of.

          What survives, and where: the LIVE half is visible on every route
          anyway — `IndexStrip` sits above this page carrying four NSE levels
          and the top bar carries the quote clock — and the quote feed's own
          failure states still name themselves on the cards that use them
          (Today's movers has three). The dates the value is struck on are the
          top bar's own line (the statement marks' span and AMFI's NAV date) and
          the Current Value of Holdings tile's hover (CK-C1) — this comment used
          to claim every KPI tile's hover carried them, and none did. The
          pages that must RECONCILE to a document — Capital Gains, Data Audit,
          Ledger Insights — keep their `<BasisPill statement>` untouched, which
          is the half of §6 that is a correctness guarantee rather than a label.
          `check:pages` asserts both: gone here, kept there.

          PRIVATE MARKET WAS IN THAT LIST AND IS NOT ANY MORE — the family asked
          for its header pills too, one round later, and this sentence is
          corrected rather than left standing. It still reads
          `statementPortfolio`, so the GUARANTEE is intact there; what went is
          the label. What that costs is measured rather than assumed and is
          checked every run (`PRIVATE_QUOTABLE`): no private holding resolves an
          NSE symbol, so no row on that page could drift even on the live
          portfolio. See CLAUDE.md §6 and Stage 10ap. */}
      <PageHeader eyebrow="Daily Briefing" title="Good morning — here's where the book stands"
        right={
          /* `right`, not `beside`. The family asked for these "on the right most
             side of the line", and `PageHeader` pins `right` hard against the
             far edge while `beside` keeps a control next to the title — which
             is the Portfolio Monitor's Holdings/Transactions case, not this one.

             KEYED `data-cio-tab-key`, because a claim about which panels this
             page offers must not be struck on three labels a redesign is free
             to reword. Same contract `data-movers-scope` and `data-alloc-axis`
             already carry on this page. */
          <div role="tablist" aria-label="Which part of the briefing to show" data-cio-tabs
            className="inline-flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
            {CIO_TABS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={tab === v.key}
                title={v.title} data-cio-tab-key={v.key}
                onClick={() => setTab(v.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === v.key
                    ? "bg-champagne-500 text-ink-950 shadow-glow"
                    : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
                }`}>
                {v.key === "nav" ? navTabLabel : v.label}
                {/* HOW MANY ALERTS HAVE FIRED, on the tab itself — shown only
                    when some have, so a quiet day adds nothing to the header. */}
                {v.key === "alerts" && alerts.counts.reached > 0 && (
                  <span data-cio-alert-badge={alerts.counts.reached}
                    title={`${alerts.counts.reached} of your price alerts ${alerts.counts.reached === 1 ? "has" : "have"} been reached`}
                    className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full border border-loss/40 bg-loss/15 px-1 text-[10px] font-semibold leading-4 text-loss">
                    {alerts.counts.reached}
                  </span>
                )}
              </button>
            ))}
          </div>
        } />

      {/* ── THE KPI STRIP: THE READER'S OWN TILES ────────────────────────────
          *"After consolidating both the KPI tiles as a single one, we need to
          make sure that the KPI tiles on morning CIO page are also editable just
          like they are in the private market page. We should be able to select
          different metrics and also add or remove number of KPI tiles."*

          `SelectableTiles` is the Private Market strip's own component, in its
          `kpi` variant: each tile keeps its raised, clickable surface and its
          ONE destination, and the metric picker, remove and add controls sit
          above that click target. The catalogue is `cioTiles`, below — every
          figure in it is one this page already computes, so nothing on a tile a
          reader picks is a new measurement.

          ONE LINK PER TILE, STILL ASSERTED ON THE DOM. `check:pages` counts the
          anchors inside each card and requires at most one — a claim about what
          a reader can click, which no amount of matching innerText can make. */}
      <div className="shrink-0">
        <SelectableTiles variant="kpi" page="cio" storageKey={CIO_TILES_KEY}
          defaults={INVESTOR_DEFAULT_TILES} metrics={cioTiles} />
      </div>
      {/* ── THE PANEL ───────────────────────────────────────────────────────
          ONE OF THE THREE, NEVER TWO. The inactive panels are UNMOUNTED rather
          than hidden: `display:none` keeps a node in the DOM but takes it out
          of `innerText`, so every text-struck check would read exactly what it
          reads now while the page still paid to render three panels' worth of
          tables. There is nothing to be gained by keeping them, and a mounted
          card nobody can see is a card whose feed still fetches.

          `min-h-0` is what makes `flex-1` shrink rather than grow the column
          past the window — without it the panel is as tall as its content and
          the page scrolls again, which is the whole of what was asked. */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto" data-cio-panel={tab}>

        {/* DAILY MOVERS — the first thing the family asked for, and the first
            card under the strip for that reason. It is the only figure on this
            page that is about ONE SESSION rather than the book to date, which is
            why it carries its own coverage line rather than borrowing the page's:
            every other total here spans 369 positions, and a day change spans the
            ones that can be priced at all.

            TWO CARDS STOOD HERE AND NOW THERE IS ONE WITH A TOGGLE —
            *"give a toggle button in the direct equity daily movers for 'direct
            equity/ETF & Mutual Funds', and remove the separate daily movers for
            ETF and Mutual Funds."*

            THE TOGGLE SWITCHES WHICH MEASUREMENT IS SHOWN, and that is the whole
            of why they are still two components behind one control rather than
            one model with a scope field. Direct Equity is a live intraday price
            against the previous session's close; ETFs & mutual funds is a
            scheme's own published NAV against the one before it, on dates a week
            behind and not even shared between rows. Each branch keeps its own
            title, its own as-of and its own coverage line; they are never summed
            and never dated alike. See `DailyMovers.tsx`. */}
        {tab === "movers" && (
          <div className="grid gap-5 lg:grid-cols-3" data-cio-section="movers">
          <DailyMovers />
          </div>
        )}

        {/* Allocation hero + right column */}
        {tab === "allocation" && (
          <div className="grid gap-5 lg:grid-cols-3" data-cio-section="allocation">
          {/* THE SUBTITLE IS GONE at the family's request, after the long
              explanatory block beneath this table went the same way.

              Two of the things it said are facts a reader ACTS on rather than
              chrome: that every return here is CUMULATIVE rather than annualised,
              and the DATE each figure closes at. The first is still on this page
              outside this card — the Consolidated return tile states "cumulative,
              not annualised" on its face.

              THE SECOND HAS SINCE LOST ITS OTHER HOME, and this comment is
              corrected rather than left standing: it read "the header's
              `<BasisPill>` states the as-of and how many accounts are behind it",
              and the family have now asked for that pill. The dates the value is
              struck on are the top bar's line and the value tile's hover (CK-C1);
              this page no longer prints a report date on its face.
              That is the family's decision, recorded in CLAUDE.md with what it
              costs, and it is why the sentence above no longer claims otherwise.

              AND THE PILL KEEPS THE WORD "HELD". Two other invariants read the
              bucket count out of `N buckets held`; rewording it to `N buckets ·
              cumulative · <date>` — the first draft of this change — made both
              report a missing figure on a page rendering correctly. A caption is
              chrome; a count inside it is not. */}
          {/*
              ── ONE BOOK, THREE SLICES, AND THE FAMILY PICKS ──────────────────

              *"I have given you my baskets… how is the core doing, how is the
              satellite portfolio doing, how is the liquidity portfolio doing.
              This should be the Morning CIO page. Add a selector in the
              allocation section to select asset class wise / category wise /
              basket wise allocation and performance overview."*

              The segments regroup THE SAME ROWS. Invested, Current, Return and
              Weight are the identical arithmetic over the identical holdings on
              every axis, and all three sum to the same NAV — so the footer, the
              weight base and the cost-coverage refusal are untouched and stay
              correct by construction. Only the section key moves, and it moves
              through `groupKeyFor`, which is also what the Portfolio Monitor
              sections on: one answer to "which basket is this holding in",
              shared, rather than one per screen.

              THE TITLE FOLLOWS THE AXIS, because a table of BASKETS headed
              "Allocation by asset class & mandate" is the caption-does-not-
              describe-its-figure failure this page has already paid for twice.
              The category title is left exactly as it was — it predates the
              regroup and is not a perfect description of that axis, but it is the
              one the family has learnt and renaming it is not what they asked for.

              AND THE PILL'S NOUN FOLLOWS TOO. Two `check:pages` invariants read
              this table's row count out of the pill, so the count is not chrome —
              but "6 buckets held" over a table of baskets would be wrong about
              what it counted. `groupCount` supplies the noun per axis. */}
          <Card className="lg:col-span-2 self-start" title={ALLOC_TITLE[allocAxis]}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Group the allocation by"
                  className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5">
                  {GROUP_VIEWS.map((v) => (
                    <button key={v.key} type="button" role="tab" aria-selected={allocAxis === v.key} title={v.title}
                      data-alloc-axis={v.key}
                      onClick={() => setAllocAxis(v.key)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${allocAxis === v.key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                      {v.label}
                    </button>
                  ))}
                </div>
                {/* THE COUNT IS OF THE SECTIONS THE AXIS NAMES (CK-C11): "5 baskets
                    held" counted the Not-classified row, which is no basket of
                    the family's four — it is named beside the count instead. */}
                <Pill tone="info">
                  <span data-alloc-held={sections.filter((b) => !b.unplaced).length} data-alloc-unplaced={sections.filter((b) => b.unplaced).length}>
                    {groupCount(allocAxis, sections.filter((b) => !b.unplaced).length)} held
                    {sections.some((b) => b.unplaced) && <> · {sections.filter((b) => b.unplaced).length} not classified</>}
                  </span>
                </Pill>
              </div>
            }>
            {/* THE ALLOCATION BAR CHART, above the table. The donut this replaced
                was removed for restating the Weight column as a wedge; a horizontal
                bar chart is the same encoding without the wasted centre, and it
                fills the space the donut's removal left below the table (the card
                is `self-start`, so its height is its content).

                EACH BAR IS THE SAME LINK ITS ROW IS. A `fromPositions` section is a
                `<Link>` to `drilldownHref(AXIS_SCOPE[allocAxis], b.key)` — the exact
                href the row builds — so a bar and its row open the same drill-down;
                a fund-of-funds row carries no positions and its bar is a plain
                `<div>`, exactly as the row is not a link. The bar WIDTH is relative
                to the largest bucket; the value and weight print beside it, so the
                bar encodes nothing the row does not also state as a figure. Keyed by
                `data-alloc-bar` so `check:pages` can pair each bar with its row. */}
            <div className="mb-5 flex flex-col gap-2" data-alloc-bars>
              {sections.map((b) => {
                const pct = m.totalValue > 0 ? (b.current / m.totalValue) * 100 : 0;
                const barW = maxCurrent > 0 ? (b.current / maxCurrent) * 100 : 0;
                const inner = (
                  <>
                    <span className="flex min-w-[8.5rem] max-w-[8.5rem] items-center gap-2 text-sm font-medium text-slate-100">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                      <span className="truncate">{sectionLabel(b.key)}</span>
                    </span>
                    <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,0.16)" }}>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${barW}%`, background: b.color }} />
                    </span>
                    <span className="mono w-24 shrink-0 text-right text-sm text-slate-200 whitespace-nowrap">{money(b.current)}</span>
                    <span className="w-14 shrink-0 text-right text-xs text-slate-400">{m.totalValue > 0 ? `${pct.toFixed(1)}%` : DASH}</span>
                  </>
                );
                return b.fromPositions ? (
                  <Link key={b.key} data-alloc-bar={b.key} to={drilldownHref(AXIS_SCOPE[allocAxis], b.key)}
                    title={`Open the ${b.count} ${b.count === 1 ? "holding" : "holdings"} behind ${sectionLabel(b.key)}`}
                    className="flex items-center gap-3 rounded px-1 py-1 transition-colors hover:bg-ink-700/40 hover:text-champagne-400">
                    {inner}
                  </Link>
                ) : (
                  <div key={b.key} data-alloc-bar={b.key} data-alloc-bar-static
                    className="flex items-center gap-3 rounded px-1 py-1"
                    title="This row comes from the fund-of-funds model, which carries fund-level records and no per-holding rows — there is no holdings list to open.">
                    {inner}
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
                {/* `data-alloc-table` / `data-alloc-axis` are the STRUCTURAL handle
                    this table is asserted through. `check:pages` used to find it
                    by matching the words "ASSET CLASS" in its header, which is a
                    claim about prose the axis selector is free to change — and on
                    the basket view that finder returns nothing, so every
                    invariant struck on it would have abstained rather than
                    failed. Same contract `data-section` and `data-mandate`
                    already carry on the Portfolio Monitor. */}
                <table className="min-w-full text-sm" data-alloc-table data-alloc-axis={allocAxis}>
                  <thead>
                    <Tr view={allocView} className="border-b border-ink-700">
                      <SortHeader col="section" view={allocView} align="left" pad="px-2 py-2">{GROUP_COLUMN_HEAD[allocAxis]}</SortHeader>
                      <SortHeader col="invested" view={allocView} pad="px-2 py-2">Invested</SortHeader>
                      <SortHeader col="current" view={allocView} pad="px-2 py-2">Current</SortHeader>
                      <SortHeader col="return" view={allocView} pad="px-2 py-2" className="whitespace-nowrap"
                        title={`The holding-period return to date on the capital each ${GROUP_NOUN[allocAxis].one} deployed, FIFO: the unrealised gain on what is held plus the gain realised on units already sold, over the cost of the units held plus the cost of the units sold — and a whole PMS mandate on its capital since inception. Cumulative, not annualised. Dividends and fund distributions are not in it, except inside a whole mandate's capital.`}>Return (HPR)</SortHeader>
                      <SortHeader col="weight" view={allocView} pad="px-2 py-2">Weight</SortHeader>
                    </Tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/60">
                    {sections.map((b) => (
                      <Tr view={allocView} key={b.key} className="hover:bg-ink-700/40" data-alloc-row={b.key} data-alloc-unplaced-row={b.unplaced ? "1" : undefined}>
                        <td className="px-2 py-2.5">
                          {/* THE ROW OPENS THE HOLDINGS BEHIND IT — on whichever
                              axis the table is grouped by. AIF, PMS mandates,
                              Mutual Fund, Direct Equity, ETF, and every basket
                              and family asset class alike: the destination lists
                              exactly the holdings this row's three figures are
                              summed over, because `drilldownHref` and the page it
                              opens both read the section from `groupKeyFor`.
                              `AXIS_SCOPE` is the one place the axis chooses the
                              scope, so a link built here and a set resolved there
                              cannot name different things.

                              A row the fund-of-funds model produced carries no
                              positions and is deliberately NOT a link (see
                              `fromPositions`): a link to a table that could only
                              be empty reads as a feed that failed. */}
                          {b.fromPositions ? (
                            <Link to={drilldownHref(AXIS_SCOPE[allocAxis], b.key)}
                              title={`Open the ${b.count} ${b.count === 1 ? "holding" : "holdings"} behind ${sectionLabel(b.key)}`}
                              className="flex items-center gap-2 font-medium text-slate-100 transition-colors hover:text-champagne-400">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                              {sectionLabel(b.key)}
                            </Link>
                          ) : (
                            <span className="flex items-center gap-2 font-medium text-slate-100"
                              title="This row comes from the fund-of-funds model, which carries fund-level records and no per-holding rows — there is no holdings list to open.">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                              {sectionLabel(b.key)}
                            </span>
                          )}
                          {/* AN UNPLACED ROW NAMES ITS CAUSE, and it is the one
                              row here that is not a fact about the holdings under
                              it. "Other" would read as a section the family
                              chose; this says their review does not list these
                              and what would fill it — the rule every absent
                              figure on this site follows, applied to a row label.
                              A fund-of-funds row carries it on a family axis for
                              the same reason: their review classifies products
                              and names none of those. */}
                          {b.unplaced && (
                            <span className="mt-0.5 block text-[10.5px] leading-snug text-amber-400/80" title={UNCLASSIFIED_WHY}>
                              the family&rsquo;s review does not place {b.count === 1 ? "this holding" : "these holdings"}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap"
                          title={[
                            b.invested != null && b.withoutCost > 0 ? investedCoverage(b) : "",
                            (b.investedFifo && capitalNote(b.investedFifo)) || "",
                          ].filter(Boolean).join(" · ") || undefined}
                          data-invested-covers={b.invested != null && b.withoutCost > 0 ? `${b.count - b.withoutCost}/${b.count}` : undefined}
                          data-invested-capital={b.investedFifo?.wholeMandates.length ? b.invested ?? undefined : undefined}>
                          {/* NEVER A BARE DASH (C-04), AND NEVER ₹0 OVER NOTHING (A-14). */}
                          {b.invested === null
                            ? <AbsentCell reason={b.vacuous ? VACUOUS_COST_REASON
                              : b.fromPositions
                              ? `no statement behind ${b.count === 1 ? "this holding" : "these holdings"} reports what ${b.count === 1 ? "it" : "they"} cost — a depository records what is held and never what was paid for it`
                              : "no statement in this book reports a drawn amount for this structure"} />
                            : money(b.invested)}</td>
                        <td className="px-2 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{money(b.current)}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">{returnCell(b)}</td>
                        <td className="px-2 py-2.5 text-right mono text-slate-400">{m.totalValue > 0 ? `${((b.current / m.totalValue) * 100).toFixed(1)}%` : DASH}</td>
                      </Tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <TrFoot view={allocView} className="border-t-2 border-ink-600 px-2 py-2.5 text-left font-semibold text-slate-200"
                      label={
                        <Link to={drilldownHref("book")}
                          title={`Open every holding in the book. Current is summed over all ${fmtNum(m.p.length)} of them; Invested over the ${fmtNum(m.p.length - m.noCostCount)} whose statement reports a cost, with each whole PMS mandate at the capital paid into it — ${fmtNum(m.noCostCount)} report no cost, worth ${money(m.noCostMV)}, and are in Current and in no Invested.`}
                          className="transition-colors hover:text-champagne-400">Total</Link>
                      }
                      cells={{
                      invested: <td key="invested" className="border-t-2 border-ink-600 px-2 py-2.5 text-right mono font-semibold text-slate-300 whitespace-nowrap"
                        title={[
                          `Invested covers ${fmtNum(m.p.length - m.noCostCount)} of the ${fmtNum(m.p.length)} holdings — ${fmtNum(m.noCostCount)} report no cost and are in Current only.`,
                          capitalNote(m.bookWhole),
                        ].filter(Boolean).join(" · ")}
                        data-invested-capital={m.bookWhole.wholeMandates.length ? m.totalInvested ?? undefined : undefined}>{money(m.totalInvested)}</td>,
                      current: <td key="current" className="border-t-2 border-ink-600 px-2 py-2.5 text-right mono font-semibold text-slate-100 whitespace-nowrap">{money(m.totalValue)}</td>,
                      /* THE TOTAL IS ON THE SAME BASIS AS THE ROWS ABOVE IT.
                          This cell used to carry the MONEY-WEIGHTED whole-book
                          return, which is a different measurement from every row
                          in its own column and covers only the accounts that
                          publish an opening portfolio value — so the footer read
                          +28.3% beside its own Invested ₹394.1 Cr and Current
                          ₹461.0 Cr, which is +17.0%. A reader who divides one
                          printed cell by another and gets a third answer has
                          found a contradiction, and the long paragraph that used
                          to explain it away is gone. It now ties to its own two
                          columns; the money-weighted figure keeps its place in
                          the popover and on the Book performance card, each
                          stating the fraction of the book it covers. */
                      return: (
                      <td key="return" className={`border-t-2 border-ink-600 px-2 py-2.5 text-right whitespace-nowrap mono font-semibold ${m.footerPct == null ? "text-slate-500" : changeColor(m.footerPct)}`}
                        data-alloc-total-return={m.footerPct ?? ""}
                        title={m.footerPct == null ? undefined
                          : `The whole-book return on cost, FIFO — the unrealised gain on what is held plus the gain realised on units sold, over the capital deployed — struck over the holdings that report a cost and carry a valuation of their own. It is not Current ÷ Invested: Current covers every holding and Invested the costed ones${m.costedSet.atCost > 0 ? `, the ${fmtNum(m.costedSet.atCost)} line${m.costedSet.atCost === 1 ? "" : "s"} the family's consolidated review holds at cost included — in Invested and in no gain` : ""}. Cumulative, not annualised.`}>
                        {/* ONE FIGURE, ONE SET, ONE LABEL (B-07). This read "—"
                            with no reason while the tile and the Portfolio
                            Monitor's footer printed the figure; it prints the
                            figure now and names the set it is struck over, on
                            its face, in the words the tile uses. The old
                            refusal's own reason — the two columns beside it do
                            not cover one set — is the sentence in its hover. */}
                        {m.footerPct == null
                          ? <AbsentCell reason={m.costedSet.costedCount === 0
                            ? "no statement in this book reports a cost, so there is no return on cost to strike"
                            : "the capital deployed over the costed holdings is not positive, so no return on it is struck"} />
                          : fmtPct(m.footerPct, { sign: true, decimals: 1 })}
                        {m.footerPct != null && (
                          <span data-costed-label className="mt-0.5 block max-w-[13rem] whitespace-normal text-right text-[10.5px] font-normal leading-snug text-slate-500">
                            {costedSetLabel(m.costedSet, (n) => money(n))}
                          </span>
                        )}
                      </td>
                      ),
                      weight: <td key="weight" className="border-t-2 border-ink-600 px-2 py-2.5 text-right mono font-semibold text-slate-300">100%</td>,
                    }} />
                  </tfoot>
                </table>
                {/*
                  ── WHOSE JUDGEMENT THIS VIEW IS, WHERE IT IS ONE ────────────────

                  The two family axes are not derived from any statement: they are
                  the family's own consolidated review, product by product, plus
                  one rule they stated themselves ("all the direct stocks belong
                  to Thematic & Tactical") that fills the gaps their review leaves.
                  On screen both are just rows under one heading, so the
                  difference is printed rather than collapsed — the same
                  disclosure the Portfolio Monitor's section headings carry.

                  RENDERED ONLY ON A FAMILY AXIS AND ONLY WHEN THE RULE ACTUALLY
                  PLACED SOMETHING. The category axis asks nothing of the family
                  and has nothing to disclose; a view the review states line by
                  line has nothing either, and a sentence about a rule that placed
                  no holding is chrome.
                */}
                {/* TWO SHORT LINES, the reasoning in their hovers — the family asked
                    for the notes under the tables to go. Whose taxonomy this is,
                    and the value each of their two rules placed, stay on screen:
                    those are figures a reader acts on. */}
                {allocAxis !== "category" && (
                  <div className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-slate-500">
                    {/* ONE SHORT LINE (Stage 10cp): whose taxonomy it is and the
                        value their direct-stock rule placed are the figures; how
                        the review states it is the hover. */}
                    <p data-testid="alloc-taxonomy-source"
                      data-derived-mv={derivedMV}
                      title={`Grouped by the family's own ${GROUP_NOUN[allocAxis].one}, as their consolidated review states it, product by product. No statement in the archive carries ${GROUP_NOUN[allocAxis].one === "basket" ? "a basket" : "one"}.${derivedMV > 0
                        ? ` ${money(derivedMV)} of the ${money(m.totalValue)} above is filed by what the instrument is, where the review does not name the product: a company share is equity exposure under any taxonomy, and cash is cash.`
                        : " Nothing here is inferred from what the instrument is."}${ruleMV > 0 ? ` ${money(ruleMV)} of the ${money(m.totalValue)} above is placed by their stated rule instead — "all the direct stocks" belong to Thematic & Tactical — because the review does not name those holdings individually.` : ""}`}>
                      The family&rsquo;s own {GROUP_NOUN[allocAxis].many}
                      {ruleMV > 0 && <> · {money(ruleMV)} by their direct-stock rule</>}
                      {/* WHAT WAS INFERRED, NAMED (CK-C2): the hover said nothing
                          was, over ₹11.2 Cr filed by instrument type. A figure,
                          so on the face beside the rule's. */}
                      {derivedMV > 0 && <> · {money(derivedMV)} by what the instrument is</>}
                    </p>
                    {/* THE OTHER RULE, NAMED AS ITSELF. Their review files its
                        arbitrage funds as Debt; the family have said arbitrage is
                        cash, so those funds are placed by that instruction — and a
                        line crediting them to the direct-stock rule above would be
                        about the wrong rule. */}
                    {cashRuleMV > 0 && (
                      <p data-testid="alloc-cash-rule" data-cash-rule-mv={cashRuleMV}
                        title="Placed by the family's instruction that arbitrage and liquid funds are cash. Their consolidated review files its arbitrage funds as Debt, and the instruction overrules it.">
                        {money(cashRuleMV)} is {allocAxis === "basket" ? "Liquidity" : "Cash"} by their cash instruction
                      </p>
                    )}
                  </div>
                )}
            </div>
          </Card>

          <div className="grid gap-5 content-start lg:col-span-1">
            {/* WHAT THE CARD COVERS IS ITS TITLE'S HOVER (Stage 10cp) — the line
                under the title restated it, and the family asked for those to go. */}
            <Card title={<span title={"Private-market funds: commitments & uncalled capital — the same capital accounts the Private Market page counts, each counted once with its holding." + onceNote(null, "capital")} data-card-title-hint>Capital deployment</span>}>
              {hasCommitments ? (
                <>
                  {/*
                    ── EVERY FIGURE HERE OPENS THE DETAIL, AND IT IS ONE LINK ────

                      *"What is the capital deployed for private equity?… I told
                       you — details, because it's not very clear. We discussed
                       it. Right?"*  /  *"I'll make it clickable. And so you'll be
                       redirected to the private page, and then we can show the
                       details there."*

                    This card carried ONE link, on the words "Fund commitments",
                    and the figure the family were actually asking about — what
                    has been CALLED — was not it. The reasoning for linking once
                    stands and is why this is not four links: all four figures come
                    off the same capital accounts, so four anchors to one address
                    reads as four different destinations.

                    So the LIST is the link. One anchor, one destination, and
                    every figure on it is a click target — which is the whole of
                    what was asked for. `/private-market` is where the detail is:
                    committed, drawn, still to call and distributions, folio by
                    folio, each with the fraction of the accounts that publish it.
                  */}
                  <Link to="/private-market" data-cio-deploy-link
                    title="Open the capital accounts all four of these figures come from — committed, called, still to call and distributed, folio by folio"
                    className="block rounded-md transition-colors hover:bg-ink-700/30">
                    <ul className="text-sm">
                      <li className="flex items-center justify-between py-2"><span className="text-slate-400">Fund commitments</span><span className="mono text-slate-100">{money(m.deploy.committed)}</span></li>
                      <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Called / drawn &mdash; capital deployed</span><span className="mono text-slate-100">{money(m.deploy.drawn)}</span></li>
                      <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Undrawn &mdash; uncalled capital</span><span className="mono text-amber-400">{money(m.deploy.unfunded)}</span></li>
                      <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Distributions received</span><span className="mono text-slate-100" title={m.distAbsent ? "No private-market fund's papers report a distribution" : undefined}>{m.distAbsent ? DASH : money(m.deploy.distributed)}</span></li>
                    </ul>
                  </Link>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
                    <div style={{ width: `${calledPct}%`, background: CHART_COLORS[0] }} />
                    <div style={{ width: `${100 - (calledPct ?? 0)}%`, background: "rgba(245,158,11,.45)" }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
                    <span>Called {(calledPct ?? 0).toFixed(1)}%</span>
                    {/* THE DENOMINATOR, NAMED (CK-C12): both shares are of what was committed. */}
                    <span className="text-slate-600">of the {fmtFromBase(m.deploy.committed, { compact: true })} committed</span>
                    <span>Undrawn {(100 - (calledPct ?? 0)).toFixed(1)}%</span>
                  </div>
                </>
              ) : (
                <AbsentSection
                  what="No fund commitments"
                  needs="Commitments, capital calls, undrawn capital and distributions come from a drawdown fund's capital account. No statement in this book reports one, so there is no commitment schedule to draw against — the bar and its four figures are absent, not zero." />
              )}
            </Card>

            {/* EVERY FIGURE ON THIS CARD OPENS THE HOLDINGS BEHIND IT.
                Each is a count or a share over a subset of the same consolidated
                book, and each subset is resolved by `src/lib/drilldown.ts` — the
                same function the destination page lists rows with, so the count
                here and the rows there cannot describe two different sets.

                Two of them share one destination on purpose: Positions counts the
                ROWS of the whole book and Distinct names counts its NAMES, so both
                open the same set and the page carries both counts and a toggle
                between the two units. A second page would have been a second
                derivation of one set. */}
            {/* THE DENOMINATOR, NAMED (CK-C12) — in the title's hover, which is
                where a card's line now lives (Stage 10cp): every share below is
                of the one current value of holdings, the value tile's figure. */}
            <Card title="Concentration &amp; risk"
              subtitle={`Every share on this card is of the ${fmtFromBase(m.totalValue, { compact: true })} current value of holdings — the Current Value of Holdings tile's figure.`}>
              <div className="grid grid-cols-2 gap-x-6 text-sm">
                <div className="flex items-center justify-between py-2"><ConcLink to={drilldownHref("book")} title={`${POSITIONS_WHAT}${m.smallDropped.count > 0 ? ` It leaves out ${m.smallDropped.count} holding${m.smallDropped.count === 1 ? "" : "s"} worth under ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)}, ${fmtFromBase(m.smallDropped.value)} in total, dropped automatically at the family's instruction.` : ""}`}>Positions</ConcLink><span className="mono text-slate-100">{fmtNum(m.p.length)}</span></div>
                <div className="flex items-center justify-between py-2"><ConcLink to={drilldownHref("book")} title={NAMES_WHAT}>Distinct names</ConcLink><span className="mono text-slate-100">{fmtNum(m.distinctNames)}</span></div>
                <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><ConcLink to={drilldownHref("cross-held")} title="Open the securities two or more entities each hold. This is NOT the duplicate policy: a cross-held name is two members each genuinely owning some of it, counted once per member; a duplicate is one holding that two statements both report, and the consolidated set has already collapsed those.">Cross-held</ConcLink><span className="mono text-slate-100" title="Securities held by two or more entities">{fmtNum(m.crossHeld)}</span></div>
                <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><ConcLink to={drilldownHref("top-names")} title={`Open the ${TOP_NAMES} largest names and the accounts holding them — their share of the ${fmtFromBase(m.totalValue, { compact: true })} current value of holdings.`}>Top-10 conc.</ConcLink><span className="mono text-slate-100">{m.top10Pct == null ? DASH : `${m.top10Pct.toFixed(1)}%`}</span></div>
                <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2">
                  {/* ONE LINK PER SIDE, AND THE LABELS IN THE SAME ORDER AS
                      THE FIGURES. Each opens the book's own drill-down with
                      that side selected, so a reader never has to guess which
                      half they are about to see; the others are one toggle
                      away. The list is `marketSides`, so a side the book does
                      not have is in neither the labels nor the percentages —
                      and the percentages therefore always add to 100. */}
                  <span className="text-slate-400">
                    {m.sides.map((x, i) => (
                      <span key={x.key}>
                        {i > 0 && " / "}
                        <ConcLink
                          to={drilldownHref("book", undefined, x.key)}
                          title={`${x.why} Opens the book\u2019s own drill-down with this side selected; the others are one toggle away.`}
                        >{x.label}</ConcLink>
                      </span>
                    ))}
                  </span>
                  {/* ROUNDED TO WHOLE POINTS, so three shares of 92.32 / 5.33
                      / 2.35 print as 92 / 5 / 2 and add to 99. The hover
                      carries each side to one decimal AND its rupee figure, so
                      a reader who adds the printed cells and comes up short can
                      see why without leaving the row. Nothing is re-based to
                      force a 100: a percentage this book prints is its own
                      rounded value, never one adjusted to make a row tidy. */}
                  <span className="mono text-slate-100"
                    title={m.sides.length === 0 ? undefined
                      : `${m.sides.map((x) => `${x.label} ${(x.value / m.totalValue * 100).toFixed(1)}% (${fmtFromBase(x.value, { compact: true })})`).join(" · ")}`
                        + ". Rounded to whole points above, so they may add to 99 or 101."}>
                    {m.sides.length === 0
                      ? <span title="No holding in this book carries a value, so there is no split to strike.">{DASH}</span>
                      : m.sides.map((x) => (m.totalValue ? (x.value / m.totalValue * 100).toFixed(0) : "0")).join(" / ")}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2">
                  <span className="text-slate-400">Largest name</span>
                  <span className="mono text-slate-100 truncate pl-3" title={m.largestName ?? undefined}>
                    {m.largestName == null || m.largestPct == null ? DASH
                      : <><StockLink securityKey={m.largestKey} name={m.largestName} />
                          {m.largestBucket && <span className="ml-1.5 text-[10.5px] text-slate-500">{m.largestBucket}</span>}
                          {" · "}{m.largestPct.toFixed(1)}%</>}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2">
                  <span className="text-slate-400">
                    <ConcLink to={drilldownHref("winners")} title="Open the holdings showing a gain against their own cost">Winners</ConcLink>
                    {" / "}
                    <ConcLink to={drilldownHref("losers")} title="Open the holdings showing a loss against their own cost">losers</ConcLink>
                  </span>
                  <span className="mono text-slate-100"><span className="text-gain">{m.winners}</span> / <span className="text-loss">{m.losers}</span></span>
                </div>
              </div>
            </Card>
          </div>
          </div>
        )}

        {/* THE BOOK PERFORMANCE CARD IS REMOVED, at the family’s request.

            It sat here reading "Listed vs private, on a like-for-like basis" over
            two tiles: the listed book invested → today with its unrealised gain,
            return and money-weighted return, and the same for the private (AIF)
            half. Every one of those figures is still on this page and still
            derived — invested and current value per bucket in the allocation
            table, the money-weighted return in its own KPI tile with its own
            coverage line, and the sides of the book on Concentration & risk,
            which links each to the holdings behind it. So this is a LAYOUT
            removal and not a measurement one, and `marketSides` in the model
            above still feeds that row.

            `listedBook` and `privateBook` were named here too and fed NOTHING —
            this card was their only reader and they outlived it. A local that
            carries the right number into no caller is the failure this repo
            keeps naming, and they were the pair whose meaning silently changed
            when the split stopped being a class list, so they are gone.

            `check:pages` asserts the card STAYS gone AND that the figures it
            carried are still reachable — a removal is verified by asserting it
            happened, never by deleting the test alongside the feature. */}
        {/* ALL ALERTS — the family's own price levels, checked against the
            live price (a fund's against its published NAV). See `AllAlerts`. */}
        {tab === "alerts" && (
          <div data-cio-section="alerts">
            <AllAlerts />
          </div>
        )}

        {tab === "nav" && (
          <div data-cio-section="nav">

          {/* THE NAV SERIES REPLACES AN ABSENCE THAT HAD STOPPED BEING TRUE.
              This slot held "No valuation series in this book · each account's
              statements carry exactly two points, and two points are not a curve".
              Correct against the nine-account corpus; false since the first drop
              REISSUED a statement. Thirteen accounts publish two or more dated
              valuations today, so the series is measured and the accounts that
              cannot supply one are NAMED — which is the rest of the same request.
              See `navHistoryFrom` in build-book.mjs and `NavVsIndex`. */}
          <NavVsIndex />
          </div>
        )}
      </div>

      {/* ── RETURN ATTRIBUTION WAS REMOVED AT THE FAMILY'S REQUEST ──────────
          *"remove return attribution section from the dashboard UI."*

          It sat here, under the NAV chart, because it decomposed THAT LINE: the
          four-term bridge (opening → price / trading / bought in / sold out /
          not split → closing), the ranked contributors and detractors, the
          managers' own published one-year returns beside their own benchmarks,
          and the per-account windows.

          WHAT WENT WITH IT, SAID PLAINLY RATHER THAN GLOSSED. Unlike the Book
          performance card of Stage 10t — every figure of which was already
          elsewhere on this page — the bridge, the contributors and the
          per-account windows are NOWHERE ELSE. The family asked for the section
          and that is their call; what this file owes them is not pretending the
          figures survived. Only the manager-year table has a home: `/performance`
          renders `BOOK_ACCOUNT_RETURNS` per account and per window, which is
          where the card's own footnote already pointed.

          WHAT DID NOT GO WITH IT. `BOOK_ATTRIBUTION` is GENERATED — `build-book`
          still emits it, and deleting it would rewrite `glowData.ts`, which is a
          re-measurement of the book rather than a UI change. `src/lib/attribution.ts`
          stays with it: it is that data's presentation half, and its suite is the
          only thing that checks the generated bridge ties AND carries the
          chain-linked NAV-series assertions the chart above still depends on. Its
          header says plainly that nothing renders it, so it is a documented
          no-caller and not the silent orphan a future session wires back
          believing it load-bearing. */}

      {/* ── THE ROADMAP PLACEHOLDER IS GONE ─────────────────────────────────
          *"remove the placeholder for not live data from the dashboard ui."*

          It was a dashed panel headed "Coming as live data lands — the rest of
          the CIO vision" carrying four chips — consensus and target prices, a
          >10% weekly-drop risk flag, technical and concall scanners, and an
          earnings hub — over a line saying they activate once the live
          market-data feed and fundamentals source are wired in.

          NOT ONE OF THEM WAS A MEASUREMENT, which is why this goes cleanly
          where the paragraphs above needed an audit first: a chip named a
          feature that does not exist, so there was nothing on it to move and
          nothing a reader could act on. The gaps it stood for are recorded in
          CLAUDE.md's Stage 8 table, which is where an unbuildable feature
          belongs — a dashed frame on the dashboard reads, during an upstream
          outage, as four more things that have broken. That is the company
          page's own lesson (its four permanently-absent cards were removed for
          exactly this) applied one page over.

          Two of the chips that used to be here — "Market overview — Nifty /
          Sensex / global" and "NAV vs benchmark (dynamic)" — had already been
          removed when both shipped. `check:pages` asserts the whole panel STAYS
          gone, and it still asserts those two in particular, so a future edit
          cannot reintroduce a promise for something already on screen. */}
    </div>
  );
}

/**
 * A CONCENTRATION LABEL THAT OPENS ITS OWN SET.
 *
 * The label carries the link and the FIGURE stays plain, for the same reason the
 * KPI tiles link their label: several of these figures are one number beside
 * another ("169 / 120", "50 / 50") and underlining a digit reads as a footnote
 * marker on the number rather than a way into it. The label is also the part
 * that names the set, which is what the reader is asking to see.
 *
 * The text is unchanged by wrapping it, which keeps every `check:pages`
 * invariant that finds a figure by its label still able to find it.
 */
function ConcLink({ to, title, children }: { to: string; title: string; children: React.ReactNode }) {
  return (
    <Link to={to} title={title}
      className="text-slate-400 underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
      {children}
    </Link>
  );
}
