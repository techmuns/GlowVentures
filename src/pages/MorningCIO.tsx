import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts";
import { Briefcase, Wallet, TrendingUp, Percent, Fuel, Coins } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { Kpi } from "@/components/Kpi";
import { StockLink } from "@/components/StockLink";
import { Link } from "react-router-dom";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, fundTotals, startupTotals, sumOrNull, publicPrivateSplit, isPrivateClass,
  holdingBucket, bucketLabel, MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET,
  costCoversSet,
} from "@/lib/analytics";
import { accountIndex, engagementOf, isDirect, ownerOf } from "@/lib/accounts";
import { drilldownHref, TOP_NAMES } from "@/lib/drilldown";
import { accountHasOpeningValue } from "@/lib/returns";
import { fmtPct, fmtCurrency, changeColor, fmtFyPeriod, fmtNum } from "@/lib/format";
import { xirrWithTerminal, xirrPct, pooledXirr, totalReturnFromXirr, moneyWeightedReturn, type XirrResult, fundXirr, startupXirr } from "@/lib/bucketXirr";
import { Auditable } from "@/components/Auditable";
import { type PrivateSheet } from "@/lib/auditFormulas";
import { netMultiple, netMultipleKind } from "@/lib/privateValue";
import { AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { NavVsIndex } from "@/components/NavVsIndex";
import { TodaysMovers } from "@/components/TodaysMovers";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";

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

export function MorningCIO() {
  const { consolidated, portfolio, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
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
    const p = consolidated;
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
    const commitments = portfolio.commitments ?? [];
    const fundDeploy = fundTotals([...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]);
    const deploy = commitments.length
      ? {
        committed: sum(commitments.map((c) => c.committed)) + fundDeploy.committed,
        drawn: sumOrNull([...commitments.map((c) => c.drawn), fundDeploy.drawn]) ?? 0,
        distributed: sumOrNull([...commitments.map((c) => c.distributed), fundDeploy.distributed]) ?? 0,
        currentValue: fundDeploy.currentValue,
        unfunded: sumOrNull([...commitments.map((c) => c.undrawn), fundDeploy.unfunded]) ?? 0,
        tvpi: fundDeploy.tvpi,
        dpi: fundDeploy.dpi,
      }
      : fundDeploy;
    const closedF = fundTotals(pm.closedFunds);
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
    const totalInvested = sumOrNull([bookCost, privateCount ? privateInvested : null]);
    const privateGain = privateCurrent - privateInvested;
    // Cash returned by holdings still in the book (startups distribute nothing).
    const privateDistributed = peF.distributed + preF.distributed + unlF.distributed + debtF.distributed;
    const privateTotalGain = privateCurrent + privateDistributed - privateInvested;
    const privateNet = privateInvested > 0 ? (privateCurrent + privateDistributed) / privateInvested : null;
    // Embedded gain = the book's own unrealised P&L (AIF units already inside it)
    // plus the fund model's markup where one exists. Adding `portfolio.privateValue
    // − 0` on top — the AIF value against a fund model that reports no cost — is
    // what put embedded gain at 99.8% of invested, almost the whole NAV.
    const embeddedGain = sumOrNull([bookPnL, privateCount ? privateGain : null]);
    const gainPct = totalInvested !== null && embeddedGain !== null && totalInvested > 0
      ? (embeddedGain / totalInvested) * 100
      : null;
    /**
     * AND THE FOOTER CELL ONLY EXISTS WHERE ITS TWO COLUMNS COVER THE SAME BOOK.
     *
     * `gainPct` is return on cost over the positions that HAVE a cost, which is
     * the right figure for the tile that names its own coverage. The allocation
     * table's Total row is a different claim: it sits between a printed Invested
     * and a printed Current, and a reader divides one by the other.
     *
     * Those two stopped covering the same set the moment the depository
     * statements landed. A CDSL account reports what is held and never what it
     * cost, so 43 positions worth ₹102 Cr are in Current and in no Invested —
     * and the footer would have read one answer beside two cells that give
     * another. That is the contradiction this table was already fixed for once.
     *
     * So the cell is struck only when the costed set accounts for the whole
     * book, and otherwise renders absent WITH THE REASON. The return itself is
     * not lost: it keeps the Consolidated return tile, which states the fraction
     * of the book it covers on its face.
     */
    const costedMV = sum(p.filter((x) => x.costBasis != null).map((x) => x.marketValue))
      + (privateCount ? privateCurrent : 0);
    const costCoversBook = totalValue > 0 && Math.abs(costedMV - totalValue) <= totalValue * 0.005;
    const footerPct = costCoversBook ? gainPct : null;
    // Asset-class listed/private split, the same rule the rest of the app uses:
    // the AIF book is private even though the fund-of-funds model is empty. Drives
    // the NAV caption and the concentration line so neither claims "no private".
    const pp = publicPrivateSplit(p);
    const hasPrivateClass = pp.private > 0;

    // The account registry, read for every question below that asks how an
    // account is RUN — the allocation buckets, and the two sides the
    // money-weighted return is measured over. `engagement` is what each
    // statement states outright; nothing here is pattern-matched out of a label.
    const accIdx = accountIndex(portfolio.accounts);
    /** Run by an external manager — the side split the XIRR below is pooled on. */
    const managedRow = (x: (typeof p)[number]) => {
      const a = accIdx.get(x.accountId);
      return a ? !isDirect(a) : true;   // unattributed defaults to managed, not direct
    };
    const eqGroup = (rows: typeof p) => {
      const cost = sumOrNull(rows.map((x) => x.costBasis));
      const mv = sum(rows.map((x) => x.marketValue));
      const pnl = sumOrNull(rows.map((x) => x.unrealizedPnL));
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
      return {
        count: rows.length, cost, mv, pnl,
        withoutCost: noCost.length,
        withoutCostMV,
        costedMV,
        costCoversRow,
        ret: costCoversRow && cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
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
    const bucketRows = new Map<string, typeof p>();
    for (const x of p) {
      const key = holdingBucket(x, engagementOf(accIdx, x));
      const rows = bucketRows.get(key) ?? [];
      rows.push(x);
      bucketRows.set(key, rows);
    }
    const rowsIn = (key: string) => bucketRows.get(key) ?? [];
    // The "Book performance — Listed vs private" card must split on ASSET CLASS,
    // not on the fund-of-funds model. That model (privateMarkets.*) is empty here,
    // so gating the private card on it labelled the ₹207.65 Cr AIF book as
    // "Listed". listedBook = non-private classes; privateBook = AIF/Unlisted/etc.
    const listedBook = eqGroup(p.filter((x) => !isPrivateClass(x)));
    const privateBook = eqGroup(p.filter(isPrivateClass));

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
    //   2. THE TERMINAL DATE IS THE BOOK'S AS-OF, not `new Date()`. Closing
    //      against today while /performance closes against the report date gave
    //      the same figure two values (130.3% here, 174.3% there).
    const asOfDate = new Date(portfolio.asOf);
    // `accountHasOpeningValue`, not a copy of it: the drill-down this tile now
    // opens lists the holdings of exactly the accounts this line selects, and
    // two copies of the test are two chances for the coverage stated here and
    // the set shown there to describe different accounts.
    const hasOpening = (accountId: string) => accountHasOpeningValue(portfolio, accountId);
    const sideOf = (a: (typeof portfolio.accounts)[number]) => {
      const anyRow = p.find((x) => x.accountId === a.accountId);
      return anyRow ? managedRow(anyRow) : !isDirect(a);
    };
    /** Flows and terminal market value for one side, measurable accounts only. */
    const measured = (managed: boolean) => {
      /**
       * PER-ACCOUNT PARTS, each with its OWN as-of.
       *
       * These were pooled into one flow list and closed on one page-wide date.
       * The accounts in this book do not share a report date, so that gave the
       * ones valued earlier a stretch of flat performance they never had — and
       * produced a different rate here from the one `/performance` showed for
       * the same accounts. See `pooledXirr`.
       */
      const parts: { flows: { date: Date; amount: number }[]; terminalValue: number; asOf: Date }[] = [];
      let mv = 0;
      const excluded: string[] = [];
      for (const a of portfolio.accounts) {
        if (sideOf(a) !== managed) continue;
        if (!hasOpening(a.accountId)) { excluded.push(a.accountNo); continue; }
        // A PER-ACCOUNT TERMINAL VALUE READS `portfolio.positions`, NOT THE
        // DEDUPED SET. `p` counts each dedupeGroup once, which is right for
        // every book-wide figure on this page and wrong here: the account whose
        // row lost the coin-toss would close against a market value smaller
        // than the one its own statement prints, and its XIRR would be
        // understated by exactly that holding. No account carrying a duplicate
        // publishes an opening portfolio value in this drop, so nothing on
        // screen moves — which is precisely why it had to be fixed before the
        // rate went on a tile, rather than after a drop where it bites.
        const accountMv = sum(portfolio.positions.filter((x) => x.accountId === a.accountId).map((x) => x.marketValue));
        parts.push({
          flows: (portfolio.accountCashFlows?.[a.accountId] ?? []).map((f) => ({ date: new Date(f.date), amount: f.amount })),
          terminalValue: accountMv,
          asOf: new Date(a.asOf),
        });
        mv += accountMv;
      }
      return { parts, mv, excluded };
    };
    const listedXirr = (parts: { flows: { date: Date; amount: number }[]; terminalValue: number; asOf: Date }[]): number | null =>
      pooledXirr(parts);
    const directSide = measured(false), pmsSide = measured(true);
    const xirrExcluded = [...directSide.excluded, ...pmsSide.excluded];

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
      key, color, count, invested: f.drawn, current: f.currentValue, distributed: f.distributed,
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
    });
    // A bucket of POSITIONS — no dated capital-movement flows at bucket level,
    // so no money-weighted rate; its total return on cost is what the row shows.
    const positionBucket = (key: string, i: number): Bucket => {
      const g = eqGroup(rowsIn(key));
      return {
        key, color: bucketColor(key, i), count: g.count, invested: g.cost, current: g.mv, kind: "MOIC",
        fromPositions: true,
        // THE MULTIPLE IS STRUCK OVER THE ROWS THE COST COVERS, like the return
        // beside it. It was `mv / cost` — the WHOLE bucket's market value over a
        // cost `sumOrNull` struck on part of it — which on Direct Equity is
        // ₹12,446.1 Cr over the ₹1.22 Cr that 9 of its 38 holdings report, and
        // renders "MOIC 10240.51×". Nothing in the book multiplied by ten
        // thousand; two different sets of holdings were divided by each other.
        metric: g.cost !== null && g.cost > 0 ? g.costedMV / g.cost : null,
        retPct: g.ret, distributed: 0, xirr: null, xirrBasis: "ledger", xirrNote: null, sheet: null,
        withoutCost: g.withoutCost, withoutCostMV: g.withoutCostMV, costedMV: g.costedMV,
      };
    };
    /**
     * THE BUCKETS THIS BOOK IS DECLARED TO HAVE, PLUS ANY THE POSITIONS PRODUCE.
     *
     * The declared list is in the BUCKET vocabulary, so it can no longer name
     * "Equity" — a bucket that no longer exists — and a declared bucket holding
     * nothing is named as absent below rather than drawn as a row of zeros.
     * Anything `holdingBucket` returns that is not declared (a class this drop
     * does not carry, or equity whose account states no engagement) still gets
     * its own row: a bucket the book HAS must never be silently dropped for not
     * being on a list written before it arrived.
     */
    const DECLARED_BUCKETS = [MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, "AIF", "Mutual Fund", "ETF", "Cash"];
    const positionKeys = [
      ...DECLARED_BUCKETS,
      ...[...bucketRows.keys()].filter((k) => !DECLARED_BUCKETS.includes(k)),
    ];
    const allBuckets: Bucket[] = [
      ...positionKeys.map(positionBucket),
      { key: "Startups", color: "#6366f1", fromPositions: false, count: pm.startups.length, invested: st.invested, current: st.fairValue, kind: "MOIC", metric: st.moic, retPct: st.invested > 0 ? ((st.fairValue - st.invested) / st.invested) * 100 : null, distributed: 0, xirr: stX.pct, xirrBasis: "first-investment", xirrNote: fundBasis(stX), sheet: "startup", withoutCost: 0, withoutCostMV: 0, costedMV: st.fairValue },
      // Fund buckets: the multiple and the return-on-cost both count cash already
      // returned, so a bucket in repayment isn't read as a loss.
      fundBucket("Unlisted Companies", "#10b981", pm.unlistedCompanies.length, unlF, unlX, "pre-ipo"),
      fundBucket("PE / VC Funds", "#e0709b", pm.peFunds.length, peF, peX, "private-equity-funds"),
      fundBucket("Pre-IPO Funds", "#38bdf8", pm.preIpoFunds.length, preF, preX, "pre-ipo"),
      fundBucket("Debt Funds", "#818cf8", pm.debtFunds.length, debtF, debtX, "debt-fund"),
    ];
    // A bucket the book holds NOTHING in is not a row of zeros — it is named
    // below the table as absent, so a reader can tell "nothing here" from
    // "nothing left". This is the whole §0 rule applied to the allocation view.
    const buckets = allBuckets.filter((b) => b.count > 0).sort((a, b) => b.current - a.current);

    // Book-level XIRR: every listed dated flow closed against the live listed
    // value, pooled with the private book's calls and marks.
    const privateFlows = [
      ...pm.startups.filter((s) => s.investDate && s.invested > 0)
        .flatMap((s) => [{ date: new Date(s.investDate!), amount: -s.invested }, { date: today, amount: s.fairValue }]),
      ...[...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]
        .filter((f) => f.firstInvest && f.drawn > 0)
        .flatMap((f) => [{ date: new Date(f.firstInvest!), amount: -f.drawn }, { date: today, amount: f.distributed + f.currentValue }]),
    ];
    const listedParts = [...directSide.parts, ...pmsSide.parts];
    const listedFlows = listedParts.flatMap((x) => x.flows);
    const measuredMV = directSide.mv + pmsSide.mv;
    const listedXirrPct = listedXirr(listedParts);
    // The book-wide rate adds the private flows to the SAME per-account parts,
    // each still closing on its own as-of — not on one page-wide date.
    const bookXirr = listedParts.length
      ? xirrPct([
        ...listedParts.flatMap((x) => [...x.flows, { date: x.asOf, amount: x.terminalValue }]),
        ...privateFlows,
      ])
      : null;
    const xirrWindowStart = listedFlows.reduce<Date | null>((a, f) => (!a || f.date < a ? f.date : a), null);
    const xirrWindowDays = xirrWindowStart
      ? Math.round((asOfDate.getTime() - xirrWindowStart.getTime()) / 864e5)
      : null;
    // The family reads the headline as an ANNUAL return, so an XIRR annualised
    // over a quarter (>100% p.a. in a strong quarter) misleads. De-annualise it
    // to the money-weighted return actually earned over the window — the total to
    // date, which is what these pages now show.
    const listedTotalReturn = totalReturnFromXirr(listedXirrPct, xirrWindowDays);
    const bookTotalReturn = totalReturnFromXirr(bookXirr, xirrWindowDays);

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
      p, bookMV, bookCost, bookPnL, noCostCount: noCost.length, noCostMV,
      accountCount: portfolio.accounts.length,
      ownerCount: new Set(portfolio.accounts.map((a) => a.owner)).size,
      totalValue, accrued, accruedCount, privateCurrent, privateInvested, totalInvested, embeddedGain, gainPct,
      footerPct, costedMV, costCoversBook,
      pp, hasPrivateClass,
      privateNet, privateGain, privateTotalGain, privateDistributed, deploy, commitments,
      privateCount, fundCount,
      closedInvested: closedF.drawn, closedDistributed: closedF.distributed,
      listedBook, privateBook,
      buckets, bookXirr, listedXirrPct, listedTotalReturn, bookTotalReturn,
      measuredMV, xirrExcluded, xirrWindowDays,
      xirrAccounts: listedParts.length,
      // THE ONE PLACE THE TILE'S FIGURE IS DECIDED. `moneyWeightedReturn`
      // refuses to annualise a window shorter than a year, so a strong quarter
      // can no longer reach the screen as a yearly rate — see the note on it.
      bookMW: moneyWeightedReturn(bookXirr, xirrWindowDays),
      distinctNames: byKey.size, crossHeld, top10Pct,
      largestName, largestKey: largest?.[0] ?? "", largestBucket, largestPct, winners, losers,
      navSeries, navFirst, navGrowth,
    };
  }, [portfolio, convertFromBase, today]);

  if (!portfolio || !model) return null;
  const m = model;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  const donutData = m.buckets.map((b) => ({ name: bucketLabel(b.key), value: convertFromBase(b.current) }));
  // Fund commitments exist or they don't. `committed === 0` across zero funds is
  // the absence of a commitment schedule, not a schedule that commits nothing.
  // A commitment schedule exists if ANY source reports one — a drawdown AIF's
  // capital account counts, not only a fund-of-funds block.
  const hasCommitments = (m.fundCount > 0 || m.commitments.length > 0) && m.deploy.committed > 0;
  const calledPct = hasCommitments ? (m.deploy.drawn / m.deploy.committed) * 100 : null;

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
  const returnCell = (b: typeof m.buckets[number]) => {
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
      const why = b.invested == null
        ? `No statement reports what ${b.count === 1 ? "this holding" : "these holdings"} cost, so there is no return to strike — the cost is absent, not zero.`
        : b.withoutCost > 0
          ? `Invested covers ${b.count - b.withoutCost} of ${b.count} holdings here (${money(b.costedMV)} of the ${money(b.current)} beside it) and Current covers all of them — ${money(b.withoutCostMV)} reports no cost. A percentage across those two would divide one set of holdings by another, so it is not shown.`
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
    const covered = b.count - b.withoutCost;
    const partial = b.withoutCost > 0
      ? ` It covers ${covered} of ${many(b.count, "holding")}: the other ${b.withoutCost} report no cost, and their ${money(b.withoutCostMV)} stands in the Current column beside this and on neither side of this ratio.`
      : "";
    const formula = {
      title: `${bucketLabel(b.key)} — total return to date`,
      // The formula names the SET as well as the fields where the two differ:
      // "Current value" over a row whose Current column covers more holdings
      // than its Invested one is the same widened caption, in Excel's words.
      excel: b.distributed > 0
        ? `= (${b.withoutCost > 0 ? "Value of the costed holdings" : "Current value"} + Cash returned − Invested) ÷ Invested`
        : `= (${b.withoutCost > 0 ? "Value of the costed holdings" : "Current value"} − Invested) ÷ Invested`,
      plain: `The total return this bucket has produced to date on the capital in it — the cumulative gain, NOT an annualised rate. ${money(b.invested)} invested is worth ${money(b.costedMV)} now${b.distributed > 0 ? `, plus ${money(b.distributed)} already returned` : ""}.${partial}`,
      worked: `${money(b.invested)} invested → ${money(b.costedMV)} today${b.distributed > 0 ? ` + ${money(b.distributed)} returned` : ""} · ${b.kind} ${mult} · ${fmtPct(b.retPct, { sign: true, decimals: 1 })} total${b.withoutCost > 0 ? ` · over ${covered} of ${b.count} holdings` : ""}`,
    };
    return (
      <span className={`rounded-md bg-ink-700 px-1.5 py-0.5 text-[11px] font-semibold mono ${changeColor(b.retPct)}`}>
        <Auditable formula={formula}>{fmtPct(b.retPct, { sign: true, decimals: 1 })}</Auditable>
      </span>
    );
  };

  return (
    <div>
      <PageHeader eyebrow="Daily Briefing" title="Good morning — here's where the book stands"
        right={<BasisPill liveText="Consolidated · listed live" hint="Listed holdings are priced live where a quote exists; anything the quote feed could not supply keeps its statement mark and is flagged as not-live." />} />

      {/* KPI strip */}
      {/* ONE LINK PER TILE, ASSERTED ON THE DOM. `check:pages` counts the
          anchors inside each card here and requires at most one — a claim about
          what a reader can click, which no amount of matching innerText can
          make. See the `cio` invariant "each KPI tile offers exactly one
          destination". */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="kpi-strip">
        <Kpi label="Consolidated NAV"
          href={drilldownHref("book")}
          hrefTitle="Open every holding in the book — the set this figure is summed over, each holding two statements both report counted once. The listed and private halves are a toggle on that page."
          value={<Auditable formula={{
            title: "Consolidated NAV",
            excel: m.privateCount ? "= Σ market value of every holding + Private-markets value" : "= Σ market value of every holding",
            plain: `The whole book across all ${m.accountCount} accounts and ${m.ownerCount} holders, at latest marks, with each holding reported twice counted once.${
              m.hasPrivateClass ? ` It spans both halves by asset class — ${money(m.pp.listed)} listed and ${money(m.pp.private)} private (AIF, unlisted).` : ""
            }`,
            worked: m.privateCount
              ? `= ${money(m.bookMV)} + ${money(m.privateCurrent)} = ${money(m.totalValue)}`
              : `= ${money(m.bookMV)} across ${m.p.length} positions in ${m.accountCount} accounts`,
          }}>{fmtFromBase(m.totalValue, { compact: true })}</Auditable>}
          sub={<>
            {/* THE TWO HALVES ARE FIGURES, NOT LINKS. They had an address each,
                so this one tile offered three destinations — and the reader had
                to know which of them answered their question. Both halves are
                now a TOGGLE inside the tile's own drill-down, which is where a
                reader who wants one of them can also see the other. */}
            {m.hasPrivateClass
              ? `Listed ${money(m.pp.listed)} · Private ${money(m.pp.private)}`
              : `${m.p.length} listed positions · no private holdings`}
            {m.accrued !== null && (
              <span className="block text-slate-500" title={`Dividends and interest declared and not yet received on ${m.accruedCount} position(s). The managers' printed totals include this; the market value column does not, so it is stated here rather than folded in.`}>
                + {money(m.accrued)} accrued income, not in this figure
              </span>
            )}
          </>}
          icon={<Briefcase className="h-4 w-4" />} />

        {/* CAPITAL INVESTED — the whole book, and its caption says which
            positions it does NOT cover. This tile printed "cost in · listed
            only" over a sum that has always run across every account, listed
            and private alike; a scope stated narrower than the figure is as
            misleading as one stated wider. `sumOrNull` skips a position whose
            statement carries no cost rather than entering it as zero, so the
            count of those positions belongs on the tile, not in a tooltip. */}
        <Kpi label="Capital invested"
          href={drilldownHref("invested")}
          hrefTitle="Open the holdings whose statement reports a cost — with the ones that report none, and sit outside this figure, a toggle away on the same page."
          value={<Auditable formula={{
            title: "Capital invested — consolidated",
            excel: m.privateCount ? "= Σ cost basis of every holding + Private drawn" : "= Σ cost basis of every holding",
            plain: `Money currently deployed, across all ${m.accountCount} accounts — the cost basis of every holding the statements price, listed and private alike, each dedupeGroup counted once.${
              m.noCostCount ? ` ${m.noCostCount} position${m.noCostCount === 1 ? "" : "s"} (${money(m.noCostMV)} of market value) sit${m.noCostCount === 1 ? "s" : ""} outside it: a depository statement reports what is held, not what it cost, and entering a missing cost as zero would report the whole of that market value as profit.` : ""
            }`,
            worked: m.privateCount
              ? `= ${money(m.bookCost)} + ${money(m.privateInvested)} = ${money(m.totalInvested)}`
              : `= ${money(m.bookCost)} across ${m.p.length - m.noCostCount} of ${m.p.length} positions`,
          }}>{fmtFromBase(m.totalInvested, { compact: true })}</Auditable>}
          sub={<>
            {/* A COUNT OF POSITIONS IS NOT A SHARE OF THE BOOK, and this caption
                said only the count. "61 positions carry no cost basis" reads as
                a footnote about 16% of the rows; those rows are 96% of the
                book's VALUE, because one of them is a promoter holding worth
                more than everything else put together. A reader comparing
                ₹471.9 Cr against a ₹13,063.2 Cr NAV needs the second number to
                understand the first, so the caption leads with the coverage and
                the count follows it. Same rule as the tile that read "listed
                only" over a whole-book sum: a scope stated wrong in either
                direction is the same failure. */}
            cost in · {m.costedMV > 0 ? <>covers {money(m.costedMV)} of {money(m.totalValue)}</> : <>whole book</>}
            {m.noCostCount > 0 && (
              /* NAMED HERE, OPENED BY THE TILE. A reader told that 60 positions
                 worth ₹165.9 Cr carry no cost needs to find out WHICH — the
                 answer decides whether they chase a custodian for a cost
                 statement or accept a permanent absence. That set had its own
                 address and its own link inside this tile; it is a TOGGLE on
                 the tile's drill-down now, beside the rows that do report a
                 cost, so the two halves of one figure sit on one page. */
              <span className="block text-slate-500"
                title="These positions' statements report a holding without a cost — a depository knows what is held, not what was paid for it. Their market value is in the NAV; their cost is absent rather than zero. Open this tile to see them beside the holdings that do report one.">
                {m.noCostCount} position{m.noCostCount === 1 ? "" : "s"} worth {money(m.noCostMV)} carry no cost basis
              </span>
            )}
          </>}
          icon={<Wallet className="h-4 w-4" />} />

        {/* MONEY-WEIGHTED RETURN — an XIRR, in place of Embedded gain (whose
            rupee figure is the difference between this table's Invested and
            Current columns, and is on the Book performance card).

            THIS TILE READ +99.0% AND THAT WAS INDEFENSIBLE. Nothing was
            miscalculated — ₹78.8 Cr became ₹99.4 Cr over 132 days, +28.3%
            money-weighted, and compounding 0.36 of a year onto a full one gives
            +99.0%. It was wrong because an annualised figure is a claim about a
            YEAR and this book has four months of dated flows. The managers'
            own annualised since-inception returns for these accounts settle it:
            Carnelian 19.83%, Green Lantern 11.45% and 10.6%, Molecule 7.31%.

            `moneyWeightedReturn` now refuses to annualise a window under a
            year, so the tile shows the return the book has ACTUALLY EARNED over
            its window and says the window on its face. The annualised rate is
            in the popover, named as an extrapolation. When the flows reach a
            year the same call starts returning a genuine annual rate and the
            caption changes itself.

            IT ALSO NAMES ITS COVERAGE, for the same reason this figure is not
            called "consolidated": it can only be struck where a statement
            carries an opening portfolio value — 7 of 30 accounts, about a fifth
            of the book. On the tile, not behind it.

            THE CALCULATION IS VERIFIED, not asserted. Five of the seven publish
            their own FYTD return on the same report date; ours reproduces every
            one to within 0.47 pp, two to 0.05 pp. That comparison is a test —
            `npm run test:family` — so a change to the solver, the flow set or
            the terminal value fails rather than drifts. */}
        <Kpi label={m.bookMW.annualised ? "XIRR (annualised)" : "Money-weighted return"}
          href={drilldownHref("measured")}
          hrefTitle="Open the holdings of the accounts this rate covers — those whose statements carry an opening portfolio value — with the accounts it cannot cover a toggle away on the same page."
          value={m.bookMW.pct == null
            ? <AbsentValue />
            : <span className={changeColor(m.bookMW.pct)}><Auditable formula={{
                title: m.bookMW.annualised ? "XIRR — money-weighted, annualised" : "Money-weighted return over the measured window",
                excel: m.bookMW.annualised
                  ? "= XIRR(each account's dated flows + its market value on its own report date)"
                  : "= (1 + XIRR)^(window ÷ 365) − 1",
                plain: `Excel's XIRR() over every dated capital movement the statements carry — the window's opening portfolio value first, then each contribution, withdrawal and TDS transfer on the day it happened — closed against each account's market value ON ITS OWN REPORT DATE. Trades are not flows: a sale moves cash inside an account rather than out of it, and its proceeds are already inside the closing value.\n\n${
                  m.bookMW.annualised
                    ? `The flows span ${m.bookMW.windowDays ?? "—"} days, so this is a genuine annual rate.`
                    : `THIS IS NOT ANNUALISED, AND THAT IS DELIBERATE. The flows span only ${m.bookMW.windowDays} days. Compounding that onto a full year gives ${m.bookMW.annualPct == null ? "—" : fmtPct(m.bookMW.annualPct, { sign: true, decimals: 1 })} p.a., which is a projection of ${m.bookMW.windowDays} strong days rather than a year the book has lived — and it would contradict the managers' own annualised since-inception figures for these very accounts, which run from about 7% to 31%. So the figure shown is what the book has actually earned over the window it has.`
                }\n\nIt covers ${m.xirrAccounts} of ${m.accountCount} accounts — ${money(m.measuredMV)} of ${money(m.totalValue)}. The rest publish no opening portfolio value, and closing an account's market value against a stake nobody stated would overstate the rate rather than approximate it${m.xirrExcluded.length ? ` (${m.xirrExcluded.join(", ")})` : ""}.\n\nCHECKED AGAINST THE MANAGERS' OWN FIGURES: five of these accounts print a financial-year-to-date return on the same report date, and this calculation reproduces all five to within 0.47 percentage points — V.E.C's two to within 0.05.`,
                worked: `${m.xirrAccounts} accounts · ${money(m.measuredMV)} · closed at each account's own as-of = ${fmtPct(m.bookMW.pct, { sign: true, decimals: 1 })}${m.bookMW.annualised ? " p.a." : ` over ${m.bookMW.windowDays} days`}`,
                
              }}>{fmtPct(m.bookMW.pct, { sign: true, decimals: 1 })}</Auditable></span>}
          sub={m.bookMW.pct == null
            ? <span className="text-slate-500">no statement in this book carries an opening portfolio value</span>
            : <>
                {m.bookMW.annualised
                  ? `annualised${m.bookMW.windowDays ? ` · ${m.bookMW.windowDays}-day window` : ""}`
                  : `${m.bookMW.windowDays}-day window · not annualised`}
                <span className="block text-slate-500" title={`Only an account whose statements carry an opening portfolio value can be measured this way. ${m.xirrExcluded.length ? `Excluded: ${m.xirrExcluded.join(", ")}.` : ""}`}>
                  {m.xirrAccounts} of {m.accountCount} accounts · {money(m.measuredMV)} of {money(m.totalValue)}
                </span>
              </>}
          icon={<TrendingUp className="h-4 w-4" />} />

        {/* CONSOLIDATED RETURN — return on the capital actually invested, over
            the WHOLE book. It sits beside the money-weighted figure because
            they answer different questions and cover different sets: this one
            spans every account and every asset class, and is cumulative on
            cost; the one before it is money-weighted, dated, and can only be
            struck where a statement carries an opening portfolio value. Neither
            is a substitute for the other, which is why both are on the strip
            and each states its own scope. */}
        <Kpi label="Consolidated return"
          href={drilldownHref("invested")}
          hrefTitle="Open the holdings this return is struck over — the ones whose statement reports a cost"
          value={m.gainPct == null
            ? <AbsentValue />
            : <span className={changeColor(m.gainPct)}><Auditable formula={{
                title: "Consolidated return to date",
                excel: "= Embedded gain ÷ Capital invested",
                plain: `The return the whole book has produced to date on the capital in it — cumulative, not annualised, so a strong quarter reads as the quarter's gain rather than a yearly pace the book has not run for a year.${
                  m.noCostCount ? ` Struck over the ${m.p.length - m.noCostCount} positions carrying a cost; the other ${m.noCostCount} are in neither the numerator nor the denominator.` : ""
                }${
                  m.bookMW.pct != null
                    ? ` It covers the WHOLE book, where the money-weighted figure beside it covers ${money(m.measuredMV)} of ${money(m.totalValue)} — the accounts whose statements carry an opening portfolio value. Over that narrower set the money-weighted answer is ${fmtPct(m.bookMW.pct, { sign: true, decimals: 1 })}${m.bookMW.annualised ? " p.a." : ` over ${m.bookMW.windowDays} days`}.`
                    : ""
                }`,
                worked: `= ${money(m.embeddedGain, true)} ÷ ${money(m.totalInvested)} = ${fmtPct(m.gainPct, { sign: true, decimals: 1 })}`,
                
              }}>{fmtPct(m.gainPct, { sign: true, decimals: 1 })}</Auditable></span>}
          sub={m.gainPct == null
            ? <span className="text-slate-500">no statement in this book reports a cost basis</span>
            : <>
                on capital invested · whole book
                <span className="block text-slate-500" title="Cumulative return on invested capital across every account — not annualised.">
                  cumulative, not annualised
                </span>
              </>}
          icon={<Percent className="h-4 w-4" />} />

        {/* Dry powder and Distributions are COMMITMENT facts. With no commitment
            in the book they have no denominator — "₹0 undrawn" would assert a
            schedule that draws nothing, which is a different claim entirely. */}
        <Kpi label="Dry powder"
          href={hasCommitments ? "/private-market" : undefined}
          hrefTitle="Open the capital accounts behind it — committed, called and still to call, folio by folio. Undrawn capital is not a holding and has no row in the book's positions, so it is on the Private Market page rather than in the holdings drill-down."
          value={hasCommitments
            ? <span className="text-amber-400"><Auditable formula={{ title: "Dry powder", excel: "= Σ (Committed − Called) across funds", plain: "Capital you've committed to funds that hasn't been called yet — still to be deployed.", worked: `= ${money(m.deploy.committed)} − ${money(m.deploy.drawn)} = ${money(m.deploy.unfunded)}`,  }}>{fmtFromBase(m.deploy.unfunded, { compact: true })}</Auditable></span>
            : <AbsentValue />}
          sub={hasCommitments
            ? "undrawn fund commitments"
            : <span className="text-slate-500">no statement in this book reports a capital commitment</span>}
          icon={<Fuel className="h-4 w-4" />} />

        <Kpi label="Distributions"
          href={hasCommitments ? "/private-market" : undefined}
          hrefTitle="Open the capital accounts behind it. Cash a fund has already returned is a movement on a capital account, not a position, so it lives with those accounts on the Private Market page."
          value={hasCommitments
            ? fmtFromBase(m.deploy.distributed, { compact: true })
            : <AbsentValue />}
          sub={hasCommitments
            ? "cash returned to date · incl. exited funds"
            : <span className="text-slate-500">no fund has distributed, because none is held</span>}
          icon={<Coins className="h-4 w-4" />} />
      </div>

      {/* TODAY'S MOVERS — the first thing the family asked for, and the first
          card under the strip for that reason. It is the only figure on this
          page that is about ONE SESSION rather than the book to date, which is
          why it carries its own coverage line rather than borrowing the page's:
          every other total here spans 369 positions, and a day change spans the
          ones the quote feed can price. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <TodaysMovers />
      </div>

      {/* Allocation hero + right column */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* THE SUBTITLE IS GONE at the family's request, after the long
            explanatory block beneath this table went the same way.

            Two of the things it said are facts a reader ACTS on rather than
            chrome: that every return here is CUMULATIVE rather than annualised,
            and the DATE each figure closes at. Neither is dropped, because both
            are ALREADY ON THIS PAGE outside this card — the Consolidated
            return tile states "cumulative, not annualised" on its face, and the
            header's `<BasisPill>` states the as-of and how many accounts are
            behind it. Each figure's own popover still carries the coverage and
            the excluded accounts in full. So nothing here is reachable only by
            hover, and what has gone is the description of how the buckets
            GROUP — which the rows themselves show.

            AND THE PILL KEEPS THE WORD "HELD". Two other invariants read the
            bucket count out of `N buckets held`; rewording it to `N buckets ·
            cumulative · <date>` — the first draft of this change — made both
            report a missing figure on a page rendering correctly. A caption is
            chrome; a count inside it is not. */}
        <Card className="lg:col-span-2" title="Allocation by asset class &amp; mandate"
          right={<Pill tone="info">{m.buckets.length} bucket{m.buckets.length === 1 ? "" : "s"} held</Pill>}>
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="relative mx-auto shrink-0" style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={74} stroke="none">
                    {m.buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                    formatter={(v: number) => fmtCurrency(v, displayCurrency, { compact: true })} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="label-xs">Total NAV</div>
                <div className="mono text-base font-semibold text-slate-100">{fmtFromBase(m.totalValue, { compact: true })}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">current value</div>
              </div>
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700">
                    <th className="label-xs px-2 py-2 text-left font-medium">Asset class / mandate</th>
                    <th className="label-xs px-2 py-2 text-right font-medium">Invested</th>
                    <th className="label-xs px-2 py-2 text-right font-medium">Current</th>
                    <th className="label-xs px-2 py-2 text-right font-medium whitespace-nowrap" title="Total return to date on the capital in each bucket — cumulative, not annualised.">Return (total)</th>
                    <th className="label-xs px-2 py-2 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {m.buckets.map((b) => (
                    <tr key={b.key} className="hover:bg-ink-700/40">
                      <td className="px-2 py-2.5">
                        {/* THE ROW OPENS THE HOLDINGS BEHIND IT — the whole of
                            this change. AIF, PMS mandates, Mutual Fund, Direct
                            Equity and ETF alike: the destination lists exactly
                            the holdings this row's three figures are summed
                            over, because `drilldownHref` and the page it opens
                            both read the same bucket from `holdingBucket`.

                            A row the fund-of-funds model produced carries no
                            positions and is deliberately NOT a link (see
                            `fromPositions`): a link to a table that could only
                            be empty reads as a feed that failed. */}
                        {b.fromPositions ? (
                          <Link to={drilldownHref("bucket", b.key)}
                            title={`Open the ${b.count} ${b.count === 1 ? "holding" : "holdings"} behind ${bucketLabel(b.key)}`}
                            className="flex items-center gap-2 font-medium text-slate-100 transition-colors hover:text-champagne-400">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                            <span className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px]">{bucketLabel(b.key)}</span>
                          </Link>
                        ) : (
                          <span className="flex items-center gap-2 font-medium text-slate-100"
                            title="This row comes from the fund-of-funds model, which carries fund-level records and no per-holding rows — there is no holdings list to open.">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                            {bucketLabel(b.key)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">{money(b.invested)}</td>
                      <td className="px-2 py-2.5 text-right mono text-slate-200 whitespace-nowrap">{money(b.current)}</td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">{returnCell(b)}</td>
                      <td className="px-2 py-2.5 text-right mono text-slate-400">{m.totalValue > 0 ? `${((b.current / m.totalValue) * 100).toFixed(1)}%` : DASH}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 font-semibold">
                    <td className="px-2 py-2.5 text-left text-slate-200">
                      <Link to={drilldownHref("book")} title="Open every holding in the book — the set this footer's Invested and Current columns are summed over"
                        className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400">Total</Link>
                    </td>
                    <td className="px-2 py-2.5 text-right mono text-slate-300 whitespace-nowrap">{money(m.totalInvested)}</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-100 whitespace-nowrap">{money(m.totalValue)}</td>
                    {/* THE TOTAL IS ON THE SAME BASIS AS THE ROWS ABOVE IT.
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
                        stating the fraction of the book it covers. */}
                    <td className={`px-2 py-2.5 text-right whitespace-nowrap mono ${m.footerPct == null ? "text-slate-500" : changeColor(m.footerPct)}`}>
                      {m.footerPct == null ? DASH : (
                        <Auditable formula={{
                          title: "Whole-book return to date",
                          excel: "= (Current − Invested) ÷ Invested",
                          plain: `The cumulative return the whole book has produced on the capital in it, on the same basis as every row above — market value against cost, not annualised.${
                            m.noCostCount ? ` The ${m.noCostCount} position${m.noCostCount === 1 ? "" : "s"} whose statement reports no cost are in neither column.` : ""
                          }${
                            m.bookTotalReturn != null
                              ? ` A MONEY-WEIGHTED return — Excel's XIRR() over each account's dated capital movements, closed against its own report date and de-annualised to the window — answers a different question and can only be struck where a statement carries an opening portfolio value. On that basis the book is ${fmtPct(m.bookTotalReturn, { sign: true, decimals: 1 })} to date over ${m.xirrWindowDays ?? "the measured"} days${m.bookXirr != null ? ` (${fmtPct(m.bookXirr, { sign: true, decimals: 1 })} p.a. annualised)` : ""}, covering ${money(m.measuredMV)} of ${money(m.totalValue)}${m.xirrExcluded.length ? `; accounts ${m.xirrExcluded.join(", ")} publish no opening value and sit outside it on both sides` : ""}.`
                              : ""
                          }`,
                          worked: `= (${money(m.totalValue)} − ${money(m.totalInvested)}) ÷ ${money(m.totalInvested)} = ${fmtPct(m.footerPct, { sign: true, decimals: 1 })}, closed at ${portfolio.asOf}`,
                          
                        }}>{fmtPct(m.footerPct, { sign: true, decimals: 1 })}</Auditable>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right mono text-slate-300">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 content-start lg:col-span-1">
          <Card title="Capital deployment" subtitle="Fund commitments &amp; dry powder">
            {hasCommitments ? (
              <>
                {/* Each line is a figure off a drawdown fund's capital account.
                    The card links ONCE rather than four times: all four come off
                    the same accounts, and four links to one destination reads as
                    four different destinations. */}
                <ul className="text-sm">
                  <li className="flex items-center justify-between py-2"><span className="text-slate-400">
                    <Link to="/private-market" title="Open the capital accounts these four figures come from — committed, called and still to call, folio by folio"
                      className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400">Fund commitments</Link></span><span className="mono text-slate-100">{money(m.deploy.committed)}</span></li>
                  <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Called / drawn</span><span className="mono text-slate-100">{money(m.deploy.drawn)}</span></li>
                  <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Undrawn — dry powder</span><span className="mono text-amber-400">{money(m.deploy.unfunded)}</span></li>
                  <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Distributions received</span><span className="mono text-slate-100">{money(m.deploy.distributed)}</span></li>
                </ul>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
                  <div style={{ width: `${calledPct}%`, background: CHART_COLORS[0] }} />
                  <div style={{ width: `${100 - (calledPct ?? 0)}%`, background: "rgba(245,158,11,.45)" }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
                  <span>Called {(calledPct ?? 0).toFixed(1)}%</span><span>Undrawn {(100 - (calledPct ?? 0)).toFixed(1)}%</span>
                </div>
              </>
            ) : (
              <AbsentSection
                what="No fund commitments"
                needs="Commitments, capital calls, undrawn dry powder and distributions come from a drawdown fund's capital account. No statement in this book reports one, so there is no commitment schedule to draw against — the bar and its four figures are absent, not zero." />
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
          <Card title="Concentration &amp; risk">
            <div className="grid grid-cols-2 gap-x-6 text-sm">
              <div className="flex items-center justify-between py-2"><ConcLink to={drilldownHref("book")} title="Open every holding in the book, one row per statement line — the unit this count counts">Positions</ConcLink><span className="mono text-slate-100">{fmtNum(m.p.length)}</span></div>
              <div className="flex items-center justify-between py-2"><ConcLink to={drilldownHref("book")} title="Open every holding in the book, grouped one row per name and per mandate — the unit this count counts">Distinct names</ConcLink><span className="mono text-slate-100">{fmtNum(m.distinctNames)}</span></div>
              <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><ConcLink to={drilldownHref("cross-held")} title="Open the securities two or more entities each hold">Cross-held</ConcLink><span className="mono text-slate-100" title="Securities held by two or more entities">{fmtNum(m.crossHeld)}</span></div>
              <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><ConcLink to={drilldownHref("top-names")} title={`Open the ${TOP_NAMES} largest names and the accounts holding them`}>Top-10 conc.</ConcLink><span className="mono text-slate-100">{m.top10Pct == null ? DASH : `${m.top10Pct.toFixed(0)}%`}</span></div>
              <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2">
                {/* TWO SETS, TWO LINKS. The split is on ASSET CLASS — what a
                    holding IS — so each half opens its own holdings rather than
                    one link standing for both and leaving the reader to guess
                    which half they are about to see. */}
                <span className="text-slate-400">
                  <ConcLink to={drilldownHref("book", undefined, "listed")} title="Open the listed half — every holding whose class is not an AIF, an unlisted company or a structured product. It opens the book\u2019s own drill-down with that half selected; the private half is one toggle away.">Listed</ConcLink>
                  {" / "}
                  <ConcLink to={drilldownHref("book", undefined, "private")} title="Open the private half — the AIF folios and anything else a manager rather than an exchange marks. It opens the book\u2019s own drill-down with that half selected; the listed half is one toggle away.">Private</ConcLink>
                </span>
                <span className="mono text-slate-100">
                  {m.hasPrivateClass
                    ? `${(m.pp.listed / m.totalValue * 100).toFixed(0)} / ${(m.pp.private / m.totalValue * 100).toFixed(0)}`
                    : <span title="Every holding in this book is listed. There is no private-market statement in the drop, so the private share is absent rather than 0%.">100% listed · private {DASH}</span>}
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

      {/* THE BOOK PERFORMANCE CARD IS REMOVED, at the family’s request.

          It sat here reading "Listed vs private, on a like-for-like basis" over
          two tiles: the listed book invested → today with its unrealised gain,
          return and money-weighted return, and the same for the private (AIF)
          half. Every one of those figures is still on this page and still
          derived — invested and current value per bucket in the allocation
          table, the money-weighted return in its own KPI tile with its own
          coverage line, and the listed/private split in the Consolidated NAV
          tile and on Concentration & risk, which links each half to the
          holdings behind it. So this is a LAYOUT removal and not a measurement
          one, and `publicPrivateSplit`, `listedBook`, `privateBook` and
          `listedTotalReturn` in the model above still feed those surfaces.

          `check:pages` asserts the card STAYS gone AND that the figures it
          carried are still reachable — a removal is verified by asserting it
          happened, never by deleting the test alongside the feature. */}
      <div className="mt-5">

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

      {/* Roadmap — deferred live-data panels */}
      <div className="mt-5 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 p-4">
        <div className="text-[12.5px] font-semibold text-slate-400">Coming as live data lands — the rest of the CIO vision</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {/* "Market overview — Nifty / Sensex / global" and "NAV vs benchmark
              (dynamic)" WERE ON THIS LIST and have been removed, because both now
              exist: the persistent index strip carries four live NSE levels on
              every route, and the card above charts the book's dated NAV against
              the Nifty 500. A roadmap chip promising a feature that shipped is the
              same defect as an absence recorded against a premise that changed —
              it tells a reader to wait for something already on their screen. */}
          {["Consensus & target prices", ">10% weekly-drop risk flags", "Technical & concall scanners", "Earnings hub & catalyst tracker"].map((c) => (
            <span key={c} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-[11.5px] text-slate-400">◷ {c}</span>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-slate-500">These activate once the live market-data feed &amp; fundamentals source are wired in. Everything above is built from the ingested statements alone.</p>
      </div>
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
