import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts";
import { Briefcase, Wallet, TrendingUp, Percent, Fuel, Coins } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { Kpi } from "@/components/Kpi";
import { StockLink } from "@/components/StockLink";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, fundTotals, startupTotals, sumOrNull, publicPrivateSplit } from "@/lib/analytics";
import { accountIndex, isDirect, ownerOf } from "@/lib/accounts";
import { fmtPct, fmtCurrency, changeColor, fmtFyPeriod, fmtNum } from "@/lib/format";
import { xirrWithTerminal, xirrPct, pooledXirr, totalReturnFromXirr, type XirrResult, fundXirr, startupXirr } from "@/lib/bucketXirr";
import { Auditable } from "@/components/Auditable";
import { auditHref, LEDGER, type PrivateSheet } from "@/lib/auditFormulas";
import { netMultiple, netMultipleKind } from "@/lib/privateValue";
import { AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";

// Morning CIO — asset-class cockpit. Summarises the whole book by asset class
// (Direct Equity, PMS / Managed, Startups, Unlisted, PE/VC, Pre-IPO, Debt) with
// invested / current / return, plus capital deployment, concentration and book
// performance.
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
export function MorningCIO() {
  const { consolidated, portfolio, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  // One "today" for every XIRR on the page, so every figure closes on the same
  // date against the same valuation.
  const today = useMemo(() => new Date(), []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    // CONSOLIDATED throughout this page — every figure spans all nine accounts,
    // so each dedupeGroup counts once. `portfolio.positions` still carries both
    // rows for the per-account views elsewhere.
    const p = consolidated;
    const listedMV = sum(p.map((x) => x.marketValue));
    // `sumOrNull`: a position whose statement carries no cost must not enter a
    // book-wide cost as zero — it would understate the basis and overstate the
    // return on everything else.
    const listedCost = sumOrNull(p.map((x) => x.costBasis));
    const listedPnL = sumOrNull(p.map((x) => x.unrealizedPnL));
    // Both sides must be present AND on the same basis. `sumOrNull` returns null
    // when no position reported a cost, and a return struck against a missing
    // denominator is not a small error — it is a different question.
    const listedRet = listedCost !== null && listedPnL !== null && listedCost > 0
      ? (listedPnL / listedCost) * 100
      : null;

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
    // listedMV / listedCost / listedPnL already carry the whole book. The
    // fund-of-funds model (privateMarkets) is the only thing SEPARATE from
    // positions, and it is empty here; its markup adds on top, but the AIF VALUE
    // must never be added again, because listedPnL already holds the AIF's gain.
    const privateInvested = st.invested + peF.drawn + preF.drawn + unlF.drawn + debtF.drawn;
    const privateCurrent = st.fairValue + peF.currentValue + preF.currentValue + unlF.currentValue + debtF.currentValue;
    const totalInvested = sumOrNull([listedCost, privateCount ? privateInvested : null]);
    const privateGain = privateCurrent - privateInvested;
    // Cash returned by holdings still in the book (startups distribute nothing).
    const privateDistributed = peF.distributed + preF.distributed + unlF.distributed + debtF.distributed;
    const privateTotalGain = privateCurrent + privateDistributed - privateInvested;
    const privateNet = privateInvested > 0 ? (privateCurrent + privateDistributed) / privateInvested : null;
    // Embedded gain = the book's own unrealised P&L (AIF units already inside it)
    // plus the fund model's markup where one exists. Adding `portfolio.privateValue
    // − 0` on top — the AIF value against a fund model that reports no cost — is
    // what put embedded gain at 99.8% of invested, almost the whole NAV.
    const embeddedGain = sumOrNull([listedPnL, privateCount ? privateGain : null]);
    const gainPct = totalInvested !== null && embeddedGain !== null && totalInvested > 0
      ? (embeddedGain / totalInvested) * 100
      : null;
    // Asset-class listed/private split, the same rule the rest of the app uses:
    // the AIF book is private even though the fund-of-funds model is empty. Drives
    // the NAV caption and the concentration line so neither claims "no private".
    const pp = publicPrivateSplit(p);
    const hasPrivateClass = pp.private > 0;

    // Listed book split by vehicle: in-house "Direct Equity" vs externally-managed
    // "PMS / Managed" — read from the account registry's `engagement` field,
    // which the statement states outright, rather than pattern-matched out of an
    // account label.
    const accIdx = accountIndex(portfolio.accounts);
    const managedRow = (x: (typeof p)[number]) => {
      const a = accIdx.get(x.accountId);
      return a ? !isDirect(a) : true;   // unattributed defaults to managed, not direct
    };
    const eqGroup = (rows: typeof p) => {
      const cost = sumOrNull(rows.map((x) => x.costBasis));
      const mv = sum(rows.map((x) => x.marketValue));
      const pnl = sumOrNull(rows.map((x) => x.unrealizedPnL));
      return {
        count: rows.length, cost, mv,
        ret: cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
      };
    };
    // Equity ONLY on the vehicle split — the AIF units, mutual funds and cash
    // that also sit in `p` were being folded into "PMS / Managed" and shown as
    // equity, which is exactly why the allocation read as one asset class. They
    // now get their own buckets below.
    const isEquity = (x: (typeof p)[number]) => x.assetClass === "Equity" || x.assetClass === "ETF";
    const directEq = eqGroup(p.filter((x) => isEquity(x) && !managedRow(x)));
    const pmsEq = eqGroup(p.filter((x) => isEquity(x) && managedRow(x)));
    // Non-equity asset classes, each as its own bucket. AIF is 62% of this book.
    const classGroup = (cls: string) => eqGroup(p.filter((x) => x.assetClass === cls));
    const aifEq = classGroup("AIF");
    const mfEq = classGroup("Mutual Fund");
    const cashEq = classGroup("Cash");

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
    const hasOpening = (accountId: string) =>
      (portfolio.accountCashFlows?.[accountId] ?? [])
        .some((f) => /^opening portfolio value/i.test(f.description ?? ""));
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
        const accountMv = sum(p.filter((x) => x.accountId === a.accountId).map((x) => x.marketValue));
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
      distributed: number;                            // cash already returned; 0 for listed & startups
      xirr: number | null;                            // annualised money-weighted return
      xirrBasis: Basis; xirrNote: string | null;
      sheet: PrivateSheet | null;
    };
    const fundBasis = (r: XirrResult) =>
      r.dated < r.total ? `${r.total - r.dated} of ${r.total} holdings carry no dated first investment and sit outside this XIRR.` : null;
    function xirrCoverage(excluded: string[]) {
      return excluded.length
        ? `${excluded.length === 1 ? "Account" : "Accounts"} ${excluded.join(", ")} ${excluded.length === 1 ? "is" : "are"} excluded on BOTH sides — ${excluded.length === 1 ? "its statements carry" : "their statements carry"} no opening portfolio value, and counting ${excluded.length === 1 ? "its market value without its" : "their market value without their"} opening stake would overstate the rate.`
        : null;
    }
    const fundBucket = (
      key: string, color: string, count: number, f: ReturnType<typeof fundTotals>, x: XirrResult, sheet: PrivateSheet,
    ): Bucket => ({
      key, color, count, invested: f.drawn, current: f.currentValue, distributed: f.distributed,
      kind: netMultipleKind(f.distributed),
      metric: netMultiple(f.drawn, f.currentValue, f.distributed),
      retPct: f.drawn > 0 ? ((f.currentValue + f.distributed - f.drawn) / f.drawn) * 100 : null,
      xirr: x.pct, xirrBasis: "first-investment", xirrNote: fundBasis(x), sheet,
    });
    // A bucket for a non-equity asset class — no dated capital-movement flows, so
    // no money-weighted rate; its total return on cost is what the row shows.
    const classBucket = (key: string, color: string, g: typeof directEq): Bucket => ({
      key, color, count: g.count, invested: g.cost, current: g.mv, kind: "MOIC",
      metric: g.cost !== null && g.cost > 0 ? g.mv / g.cost : null,
      retPct: g.ret, distributed: 0, xirr: null, xirrBasis: "ledger", xirrNote: null, sheet: null,
    });
    const allBuckets: Bucket[] = [
      { key: "Direct Equity", color: "#d9c48f", count: directEq.count, invested: directEq.cost, current: directEq.mv, kind: "MOIC", metric: directEq.cost !== null && directEq.cost > 0 ? directEq.mv / directEq.cost : null, retPct: directEq.ret, distributed: 0, xirr: listedXirr(directSide.parts), xirrBasis: "ledger", xirrNote: xirrCoverage(directSide.excluded), sheet: null },
      { key: "PMS / Managed", color: "#c3a962", count: pmsEq.count, invested: pmsEq.cost, current: pmsEq.mv, kind: "MOIC", metric: pmsEq.cost !== null && pmsEq.cost > 0 ? pmsEq.mv / pmsEq.cost : null, retPct: pmsEq.ret, distributed: 0, xirr: listedXirr(pmsSide.parts), xirrBasis: "ledger", xirrNote: xirrCoverage(pmsSide.excluded), sheet: null },
      classBucket("AIF", "#a855f7", aifEq),
      classBucket("Mutual Fund", "#22d3ee", mfEq),
      classBucket("Cash", "#64748b", cashEq),
      { key: "Startups", color: "#6366f1", count: pm.startups.length, invested: st.invested, current: st.fairValue, kind: "MOIC", metric: st.moic, retPct: st.invested > 0 ? ((st.fairValue - st.invested) / st.invested) * 100 : null, distributed: 0, xirr: stX.pct, xirrBasis: "first-investment", xirrNote: fundBasis(stX), sheet: "startup" },
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
    const emptyBuckets = allBuckets.filter((b) => b.count === 0).map((b) => b.key);

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
    const top10Pct = listedMV > 0 ? (sum(bySecurity.slice(0, 10).map(([, v]) => v)) / listedMV) * 100 : null;
    const largest = bySecurity[0];
    const largestName = (largest && p.find((x) => x.securityKey === largest[0])?.security) || null;
    const largestPct = largest && listedMV > 0 ? (largest[1] / listedMV) * 100 : null;
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
      p, listedMV, listedCost, listedPnL, listedRet,
      totalValue, accrued, accruedCount, privateCurrent, privateInvested, totalInvested, embeddedGain, gainPct,
      pp, hasPrivateClass,
      privateNet, privateGain, privateTotalGain, privateDistributed, deploy, commitments,
      privateCount, fundCount,
      closedInvested: closedF.drawn, closedDistributed: closedF.distributed,
      buckets, emptyBuckets, bookXirr, listedXirrPct, listedTotalReturn, bookTotalReturn,
      measuredMV, xirrExcluded, xirrWindowDays,
      distinctNames: byKey.size, crossHeld, top10Pct,
      largestName, largestKey: largest?.[0] ?? "", largestPct, winners, losers,
      navSeries, navFirst, navGrowth,
    };
  }, [portfolio, convertFromBase, today]);

  if (!portfolio || !model) return null;
  const m = model;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  const donutData = m.buckets.map((b) => ({ name: b.key, value: convertFromBase(b.current) }));
  // Fund commitments exist or they don't. `committed === 0` across zero funds is
  // the absence of a commitment schedule, not a schedule that commits nothing.
  // A commitment schedule exists if ANY source reports one — a drawdown AIF's
  // capital account counts, not only a fund-of-funds block.
  const hasCommitments = (m.fundCount > 0 || m.commitments.length > 0) && m.deploy.committed > 0;
  const calledPct = hasCommitments ? (m.deploy.drawn / m.deploy.committed) * 100 : null;

  const bucketHref = (b: { sheet: PrivateSheet | null }) => b.sheet ? auditHref({ file: "private", sheet: b.sheet }) : auditHref(LEDGER);
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
      return (
        <span className="text-slate-500" title="No cost basis reported for this bucket, so there is no return to show.">
          {DASH}
        </span>
      );
    }
    const mult = b.metric == null ? DASH : `${b.metric.toFixed(2)}×`;
    const formula = {
      title: `${b.key} — total return to date`,
      excel: b.distributed > 0 ? "= (Current value + Cash returned − Invested) ÷ Invested" : "= (Current value − Invested) ÷ Invested",
      plain: `The total return this bucket has produced to date on the capital in it — the cumulative gain, NOT an annualised rate. ${money(b.invested)} invested is worth ${money(b.current)} now${b.distributed > 0 ? `, plus ${money(b.distributed)} already returned` : ""}.`,
      worked: `${money(b.invested)} invested → ${money(b.current)} today${b.distributed > 0 ? ` + ${money(b.distributed)} returned` : ""} · ${b.kind} ${mult} · ${fmtPct(b.retPct, { sign: true, decimals: 1 })} total`,
      auditHref: bucketHref(b),
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Consolidated NAV"
          value={<Auditable formula={{
            title: "Consolidated NAV",
            excel: m.privateCount ? "= Listed value + Private value" : "= Σ market value of every holding",
            plain: m.privateCount
              ? "Your whole book — the listed portfolio plus the private-markets book, at latest marks."
              : "Your whole book. Every holding in it is listed, so this is the listed portfolio's market value; there is no private book to add.",
            worked: m.privateCount
              ? `= ${money(m.listedMV)} + ${money(m.privateCurrent)} = ${money(m.totalValue)}`
              : `= ${money(m.listedMV)} across ${m.p.length} positions`,
          }}>{fmtFromBase(m.totalValue, { compact: true })}</Auditable>}
          sub={<>
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

        <Kpi label="Capital invested"
          value={<Auditable formula={{
            title: "Capital invested",
            excel: m.privateCount ? "= Listed cost + Private drawn (current holdings)" : "= Σ cost basis of every holding",
            plain: m.privateCount
              ? "Money currently deployed — cost of listed holdings plus capital called into private assets still held."
              : "Money currently deployed — the cost basis of every listed holding. No private capital has been called, because the book holds no private assets.",
            worked: m.privateCount
              ? `= ${money(m.listedCost)} + ${money(m.privateInvested)} = ${money(m.totalInvested)}`
              : `= ${money(m.listedCost)}`,
          }}>{fmtFromBase(m.totalInvested, { compact: true })}</Auditable>}
          sub={m.privateCount ? "cost in, across listed & private" : "cost in · listed only"}
          icon={<Wallet className="h-4 w-4" />} />

        <Kpi label="Embedded gain"
          value={<span className={changeColor(m.embeddedGain)}><Auditable formula={{
            title: "Embedded gain",
            excel: m.privateCount ? "= Listed unrealised P&L + Private markup" : "= Market value − Cost basis",
            plain: m.privateCount
              ? "On-paper gain across the whole book — the listed book's unrealised P&L plus the private book's markup over invested cost."
              : "On-paper gain across the book — market value less what was paid. Nothing here is realised.",
            worked: m.privateCount
              ? `= ${money(m.listedPnL)} + ${money(m.privateGain)} = ${money(m.embeddedGain, true)}`
              : `= ${money(m.listedMV)} − ${money(m.listedCost)} = ${money(m.embeddedGain, true)}`,
          }}>{fmtFromBase(m.embeddedGain, { compact: true, sign: true })}</Auditable></span>}
          delta={m.gainPct ?? undefined} sub="on invested" icon={<TrendingUp className="h-4 w-4" />} />

        <Kpi label="Listed return"
          value={m.listedTotalReturn == null
            ? <AbsentValue />
            : <span className={changeColor(m.listedTotalReturn)}><Auditable formula={{
                title: "Listed return to date (money-weighted)",
                excel: "= (1 + XIRR)^(window ÷ 365) − 1",
                plain: `The money-weighted return the listed book has actually earned to date — Excel's XIRR() over each account's dated capital movements (capital register or bank book, with the window's opening portfolio value first), de-annualised to the window it covers so it reads as a return to date rather than a yearly pace. Trades are excluded because they move cash inside an account, not into or out of it.${
                  m.xirrExcluded.length ? ` ${m.xirrExcluded.length === 1 ? "Account" : "Accounts"} ${m.xirrExcluded.join(", ")} ${m.xirrExcluded.length === 1 ? "is" : "are"} excluded on BOTH sides for want of an opening portfolio value, so this covers ${money(m.measuredMV)} of the book's ${money(m.listedMV)}.` : ""
                }${m.xirrWindowDays && m.listedXirrPct != null ? ` Over a ${m.xirrWindowDays}-day window; that is ${fmtPct(m.listedXirrPct, { sign: true, decimals: 1 })} p.a. annualised.` : ""}`,
                auditHref: auditHref(LEDGER),
              }}>{fmtPct(m.listedTotalReturn, { sign: true, decimals: 1 })}</Auditable></span>}
          sub={m.listedTotalReturn == null
            ? <span className="text-slate-500">no dated capital movements in these statements</span>
            : m.xirrWindowDays
              ? <span title="Money-weighted return to date, over the window these flows cover (opening on 1 April).">to date · {m.xirrWindowDays}-day window</span>
              : "to date · money-weighted"}
          icon={<Percent className="h-4 w-4" />} />

        {/* Dry powder and Distributions are COMMITMENT facts. With no commitment
            in the book they have no denominator — "₹0 undrawn" would assert a
            schedule that draws nothing, which is a different claim entirely. */}
        <Kpi label="Dry powder"
          value={hasCommitments
            ? <span className="text-amber-400"><Auditable formula={{ title: "Dry powder", excel: "= Σ (Committed − Called) across funds", plain: "Capital you've committed to funds that hasn't been called yet — still to be deployed.", worked: `= ${money(m.deploy.committed)} − ${money(m.deploy.drawn)} = ${money(m.deploy.unfunded)}`, auditHref: auditHref({ file: "private" }) }}>{fmtFromBase(m.deploy.unfunded, { compact: true })}</Auditable></span>
            : <AbsentValue />}
          sub={hasCommitments
            ? "undrawn fund commitments"
            : <span className="text-slate-500">no statement in this book reports a capital commitment</span>}
          icon={<Fuel className="h-4 w-4" />} />

        <Kpi label="Distributions"
          value={hasCommitments
            ? <Auditable to={auditHref({ file: "private" })} title="Distributions — trace to the private-markets source">{fmtFromBase(m.deploy.distributed, { compact: true })}</Auditable>
            : <AbsentValue />}
          sub={hasCommitments
            ? "cash returned to date · incl. exited funds"
            : <span className="text-slate-500">no fund has distributed, because none is held</span>}
          icon={<Coins className="h-4 w-4" />} />
      </div>

      {/* Allocation hero + right column */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Allocation by asset class"
          subtitle="Invested, current value & total return to date per bucket — the CIO's first view"
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
                    <th className="label-xs px-2 py-2 text-left font-medium">Asset class</th>
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
                        <span className="flex items-center gap-2 font-medium text-slate-100">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                          {b.key}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">{money(b.invested)}</td>
                      <td className="px-2 py-2.5 text-right mono text-slate-200 whitespace-nowrap"><Auditable to={bucketHref(b)} title={`${b.key} — trace to source`}>{money(b.current)}</Auditable></td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">{returnCell(b)}</td>
                      <td className="px-2 py-2.5 text-right mono text-slate-400">{m.totalValue > 0 ? `${((b.current / m.totalValue) * 100).toFixed(1)}%` : DASH}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 font-semibold">
                    <td className="px-2 py-2.5 text-left text-slate-200">Total</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-300 whitespace-nowrap">{money(m.totalInvested)}</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-100 whitespace-nowrap">{money(m.totalValue)}</td>
                    <td className={`px-2 py-2.5 text-right whitespace-nowrap mono ${m.bookTotalReturn == null ? "text-slate-500" : changeColor(m.bookTotalReturn)}`}>
                      {m.bookTotalReturn == null ? DASH : (
                        <Auditable formula={{
                          title: "Whole-book return to date (money-weighted)",
                          excel: "= (1 + XIRR)^(window ÷ 365) − 1",
                          plain: `${m.privateCount
                            ? "One money-weighted return across the entire book — the accounts' dated capital movements closed against their market value, pooled with the private book's capital calls and latest marks. Private distributions carry no date, so they are credited as if received today; that makes this figure a floor rather than a best case."
                            : "One money-weighted return across the entire book. Every holding here is listed, so this is the same measurement as the listed return above — there is no private flow to pool with it."} This is the return actually earned over the ${m.xirrWindowDays ?? "measured"}-day window — the annualised XIRR is de-annualised to it, so it reads as a return to date rather than a yearly pace the book has not run for a year.${
                            m.xirrExcluded.length ? ` ${m.xirrExcluded.length === 1 ? "Account" : "Accounts"} ${m.xirrExcluded.join(", ")} ${m.xirrExcluded.length === 1 ? "is" : "are"} excluded on both sides for want of an opening portfolio value.` : ""}`,
                          worked: `${money(m.measuredMV)} of the book's ${money(m.totalValue)} is covered, closed at ${portfolio.asOf} = ${fmtPct(m.bookTotalReturn, { sign: true, decimals: 1 })} to date${m.bookXirr != null ? ` (${fmtPct(m.bookXirr, { sign: true, decimals: 1 })} p.a. annualised)` : ""}`,
                          auditHref: auditHref(LEDGER),
                        }}>{fmtPct(m.bookTotalReturn, { sign: true, decimals: 1 })}</Auditable>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right mono text-slate-300">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          {m.emptyBuckets.length > 0 && (
            <p className="mt-3 rounded-lg border border-dashed border-ink-600/70 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">{DASH} Not held:</span>{" "}
              {m.emptyBuckets.join(", ")}. No statement in this book carries a holding in {m.emptyBuckets.length === 1 ? "that class" : "those classes"},
              so {m.emptyBuckets.length === 1 ? "it is" : "they are"} named here rather than shown as a row of zeros — an empty bucket and a bucket
              worth nothing are different facts.
            </p>
          )}
          <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
            <span className="font-medium text-slate-400">Return (total)</span> on each row is the cumulative return to date on the capital in that bucket — market value against cost, not annualised — so a strong quarter reads as the quarter's gain, not a yearly pace the book has not run for a year. The <span className="font-medium text-slate-400">whole-book total</span> is money-weighted: Excel's <span className="mono">XIRR()</span> over every account's dated capital movements, closed against market value, then de-annualised to the window it covers. Each popover carries the money-multiple and, for the book total, the annualised p.a. figure behind it. <span className="font-medium text-slate-400">PMS / Managed</span> is listed equity run through external managers, taken from each account's stated engagement in the registry rather than guessed from its label; the rest is held direct. <span className="font-medium text-slate-400">AIF</span>, <span className="font-medium text-slate-400">Mutual Fund</span> and <span className="font-medium text-slate-400">Cash</span> are shown as their own asset classes rather than folded into the equity buckets.
            {m.closedInvested > 0 && <> Invested is capital currently deployed; fully-exited funds ({money(m.closedInvested)} in → {money(m.closedDistributed)} back) are excluded from the rows but included in the whole-book return.</>}
            {" "}<span className="font-medium text-slate-400">Every return here closes at {portfolio.asOf}</span>, the book's own report date — the same terminal date the per-account table on NAV &amp; Performance uses, so the two pages state one measurement rather than two.
            {m.xirrExcluded.length > 0 && <> Account {m.xirrExcluded.join(", ")} sits outside the money-weighted whole-book figure, flows AND market value: its statements carry no opening portfolio value, and counting what it is worth without what it started from would overstate the return.</>}
            {m.xirrWindowDays ? <> The measured window is {m.xirrWindowDays} days; the whole-book figure is the money-weighted return earned over it — the annualised p.a. rate sits in its popover, not on the tile, because an unlabelled +140% reads as a sustained yearly return.</> : null}
          </p>
        </Card>

        <div className="grid gap-5 content-start lg:col-span-1">
          <Card title="Capital deployment" subtitle="Fund commitments &amp; dry powder">
            {hasCommitments ? (
              <>
                <ul className="text-sm">
                  <li className="flex items-center justify-between py-2"><span className="text-slate-400">Fund commitments</span><span className="mono text-slate-100">{money(m.deploy.committed)}</span></li>
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

          <Card title="Concentration &amp; risk">
            <div className="grid grid-cols-2 gap-x-6 text-sm">
              <div className="flex items-center justify-between py-2"><span className="text-slate-400">Positions</span><span className="mono text-slate-100">{fmtNum(m.p.length)}</span></div>
              <div className="flex items-center justify-between py-2"><span className="text-slate-400">Distinct names</span><span className="mono text-slate-100">{fmtNum(m.distinctNames)}</span></div>
              <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Cross-held</span><span className="mono text-slate-100" title="Securities held by two or more entities">{fmtNum(m.crossHeld)}</span></div>
              <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Top-10 conc.</span><span className="mono text-slate-100">{m.top10Pct == null ? DASH : `${m.top10Pct.toFixed(0)}%`}</span></div>
              <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2">
                <span className="text-slate-400">Listed / Private</span>
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
                    : <><StockLink securityKey={m.largestKey} name={m.largestName} /> · {m.largestPct.toFixed(1)}%</>}
                </span>
              </div>
              <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Winners / losers</span><span className="mono text-slate-100"><span className="text-gain">{m.winners}</span> / <span className="text-loss">{m.losers}</span></span></div>
            </div>
          </Card>
        </div>
      </div>

      {/* Book performance + NAV trajectory */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Book performance" subtitle="Listed vs private, on a like-for-like basis">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <div className="label-xs flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[0] }} />Listed book</div>
              <div className="mt-2.5 text-[13px] text-slate-400"><span className="font-semibold text-slate-100">{money(m.listedCost)}</span> invested → <span className="font-semibold text-slate-100">{money(m.listedMV)}</span> today</div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                <div><div className="text-[11px] text-slate-500">Unrealized</div><div className={`mono text-[15px] font-semibold ${changeColor(m.listedPnL)}`}>{money(m.listedPnL, true)}</div></div>
                <div><div className="text-[11px] text-slate-500">Return</div><div className={`mono text-[15px] font-semibold ${m.listedRet == null ? "text-slate-500" : changeColor(m.listedRet)}`}>{m.listedRet == null ? DASH : fmtPct(m.listedRet, { sign: true, decimals: 1 })}</div></div>
                <div>
                  <div className="text-[11px] text-slate-500">Return (money-wtd)</div>
                  <div className={`mono text-[15px] font-semibold ${m.listedTotalReturn == null ? "text-slate-500" : "text-slate-100"}`}
                    title={`Money-weighted return to date${m.xirrWindowDays ? ` over a ${m.xirrWindowDays}-day window` : ""}${m.listedXirrPct != null && m.xirrWindowDays ? ` (${fmtPct(m.listedXirrPct, { sign: true, decimals: 1 })} p.a. annualised)` : ""}.${m.xirrExcluded.length ? ` Covers ${money(m.measuredMV)} of ${money(m.listedMV)} — account ${m.xirrExcluded.join(", ")} publishes no opening portfolio value.` : ""}`}>
                    {m.listedTotalReturn == null ? DASH : fmtPct(m.listedTotalReturn, { sign: true, decimals: 1 })}
                  </div>
                </div>
              </div>
            </div>
            {m.privateCount ? (
              <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
                <div className="label-xs flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[1] }} />Private book</div>
                <div className="mt-2.5 text-[13px] text-slate-400"><span className="font-semibold text-slate-100">{money(m.privateInvested)}</span> invested → <span className="font-semibold text-slate-100">{money(m.privateCurrent)}</span> today</div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <div><div className="text-[11px] text-slate-500">Total gain</div><div className={`mono text-[15px] font-semibold ${changeColor(m.privateTotalGain)}`}>{money(m.privateTotalGain, true)}</div></div>
                  <div><div className="text-[11px] text-slate-500">Total return</div><div className="mono text-[15px] font-semibold text-slate-100">{m.privateNet == null ? DASH : `${m.privateNet.toFixed(2)}×`}</div></div>
                  <div><div className="text-[11px] text-slate-500">Distributions</div><div className="mono text-[15px] font-semibold text-slate-100">{money(m.privateDistributed)}</div></div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-ink-600/70 bg-ink-900/60 p-4">
                <div className="label-xs flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-ink-600" />Private book</div>
                <div className="mt-2.5 text-[19px] font-semibold text-slate-500">{DASH}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                  There is no private book to compare against. Invested, gain, multiple and distributions all need
                  a private holding to measure, and no statement in this drop carries one.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col" title="Listed NAV trajectory" subtitle="Listed book, financial year-ends"
          right={m.navFirst && m.navGrowth != null
            ? <Pill tone="info">{m.navGrowth >= 0 ? "+" : ""}{m.navGrowth.toFixed(0)}% since {fmtFyPeriod(m.navFirst.period)}</Pill>
            : <Pill>{DASH} no history yet</Pill>}>
          {m.navSeries.length < 2 ? (
            <div className="flex-1">
              <AbsentSection
                what="No valuation series in this book"
                needs="A trajectory needs a dated series of portfolio values. Each account's statements carry exactly two — the
                  opening figure on the performance summary and the closing one — and two points are not a curve. A line
                  between them would assert a path nothing measured, so nothing is drawn. Periodic (monthly or quarterly)
                  valuation statements per account are what this needs." />
            </div>
          ) : (
          <div className="min-h-[14rem] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.navSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="navv2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d9c48f" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#d9c48f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="period" stroke="#6b6880" fontSize={11} tickFormatter={fmtFyPeriod} />
                <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "NAV"]} />
                <Area type="monotone" dataKey="value" stroke="#d9c48f" strokeWidth={2} fill="url(#navv2)" name="NAV" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>
      </div>

      {/* Roadmap — deferred live-data panels */}
      <div className="mt-5 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 p-4">
        <div className="text-[12.5px] font-semibold text-slate-400">Coming as live data lands — the rest of the CIO vision</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {["Market overview — Nifty / Sensex / global", "NAV vs benchmark (dynamic)", "Consensus & target prices", ">10% weekly-drop risk flags", "Technical & concall scanners", "Earnings hub & catalyst tracker"].map((c) => (
            <span key={c} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-[11.5px] text-slate-400">◷ {c}</span>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-slate-500">These activate once the live market-data feed &amp; fundamentals source are wired in. Everything above is built from the ingested statements alone.</p>
      </div>
    </div>
  );
}
