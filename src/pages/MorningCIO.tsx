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
import { sum, fundTotals, startupTotals } from "@/lib/analytics";
import { accountIndex, isDirect, ownerOf } from "@/lib/accounts";
import { fmtPct, fmtCurrency, changeColor, fmtFyPeriod, fmtNum } from "@/lib/format";
import { xirrWithTerminal, xirrPct, type XirrResult, fundXirr, startupXirr } from "@/lib/bucketXirr";
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
    const listedCost = sum(p.map((x) => x.costBasis));
    const listedPnL = sum(p.map((x) => x.unrealizedPnL));
    const listedRet = listedCost > 0 ? (listedPnL / listedCost) * 100 : null;

    const pm = portfolio.privateMarkets;
    const peF = fundTotals(pm.peFunds);
    const preF = fundTotals(pm.preIpoFunds);
    const unlF = fundTotals(pm.unlistedCompanies);
    const debtF = fundTotals(pm.debtFunds);
    const st = startupTotals(pm.startups);
    // Fund-commitment lifecycle (incl. fully-exited "closed" funds).
    const deploy = fundTotals([...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]);
    const closedF = fundTotals(pm.closedFunds);
    // How many private instruments the book actually carries. Zero means the
    // segment is ABSENT, not that it measured nothing — every private figure
    // below is gated on this rather than on a flag.
    const privateCount = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length
      + pm.debtFunds.length + pm.closedFunds.length + pm.startups.length;
    const fundCount = pm.peFunds.length + pm.preIpoFunds.length + pm.unlistedCompanies.length
      + pm.debtFunds.length + pm.closedFunds.length;

    const totalValue = portfolio.totalValue;
    const privateCurrent = portfolio.privateValue;
    // Capital currently deployed = cost of listed holdings + drawn private (excl. fully-exited funds).
    const privateInvested = st.invested + peF.drawn + preF.drawn + unlF.drawn + debtF.drawn;
    const totalInvested = listedCost + privateInvested;
    const privateGain = privateCurrent - privateInvested;
    // Cash returned by holdings still in the book (startups distribute nothing).
    const privateDistributed = peF.distributed + preF.distributed + unlF.distributed + debtF.distributed;
    const privateTotalGain = privateCurrent + privateDistributed - privateInvested;
    const privateNet = privateInvested > 0 ? (privateCurrent + privateDistributed) / privateInvested : null;
    // Embedded gain = the two book components (so it reconciles with the
    // Book-performance card). With no private book it IS the listed P&L, and the
    // worked formula below says so rather than adding a phantom "+ ₹0".
    const embeddedGain = listedPnL + privateGain;
    const gainPct = totalInvested > 0 ? (embeddedGain / totalInvested) * 100 : null;

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
      const cost = sum(rows.map((x) => x.costBasis));
      const mv = sum(rows.map((x) => x.marketValue));
      const pnl = sum(rows.map((x) => x.unrealizedPnL));
      return { count: rows.length, cost, mv, ret: cost > 0 ? (pnl / cost) * 100 : null };
    };
    const directEq = eqGroup(p.filter((x) => !managedRow(x)));
    const pmsEq = eqGroup(p.filter(managedRow));

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
      const flows: { date: Date; amount: number }[] = [];
      let mv = 0;
      const excluded: string[] = [];
      for (const a of portfolio.accounts) {
        if (sideOf(a) !== managed) continue;
        if (!hasOpening(a.accountId)) { excluded.push(a.accountNo); continue; }
        for (const f of portfolio.accountCashFlows?.[a.accountId] ?? []) {
          flows.push({ date: new Date(f.date), amount: f.amount });
        }
        mv += sum(p.filter((x) => x.accountId === a.accountId).map((x) => x.marketValue));
      }
      return { flows, mv, excluded };
    };
    const listedXirr = (mv: number, flows: { date: Date; amount: number }[]): number | null =>
      flows.length && mv > 0 ? xirrWithTerminal(flows, mv, asOfDate) : null;
    const directSide = measured(false), pmsSide = measured(true);
    const xirrExcluded = [...directSide.excluded, ...pmsSide.excluded];

    const stX = startupXirr(pm.startups, today, null);
    const unlX = fundXirr(pm.unlistedCompanies, today);
    const peX = fundXirr(pm.peFunds, today);
    const preX = fundXirr(pm.preIpoFunds, today);
    const debtX = fundXirr(pm.debtFunds, today);

    type Basis = "ledger" | "first-investment";
    type Bucket = {
      key: string; color: string; count: number; invested: number; current: number;
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
    const allBuckets: Bucket[] = [
      { key: "Direct Equity", color: "#d9c48f", count: directEq.count, invested: directEq.cost, current: directEq.mv, kind: "MOIC", metric: directEq.cost > 0 ? directEq.mv / directEq.cost : null, retPct: directEq.ret, distributed: 0, xirr: listedXirr(directSide.mv, directSide.flows), xirrBasis: "ledger", xirrNote: xirrCoverage(directSide.excluded), sheet: null },
      { key: "PMS / Managed", color: "#c3a962", count: pmsEq.count, invested: pmsEq.cost, current: pmsEq.mv, kind: "MOIC", metric: pmsEq.cost > 0 ? pmsEq.mv / pmsEq.cost : null, retPct: pmsEq.ret, distributed: 0, xirr: listedXirr(pmsSide.mv, pmsSide.flows), xirrBasis: "ledger", xirrNote: xirrCoverage(pmsSide.excluded), sheet: null },
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
    const listedFlows = [...directSide.flows, ...pmsSide.flows];
    const measuredMV = directSide.mv + pmsSide.mv;
    const listedXirrPct = listedXirr(measuredMV, listedFlows);
    const bookXirr = listedFlows.length
      ? xirrPct([...listedFlows, { date: asOfDate, amount: measuredMV }, ...privateFlows])
      : null;
    const xirrWindowStart = listedFlows.reduce<Date | null>((a, f) => (!a || f.date < a ? f.date : a), null);
    const xirrWindowDays = xirrWindowStart
      ? Math.round((asOfDate.getTime() - xirrWindowStart.getTime()) / 864e5)
      : null;

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
    const winners = priced.filter((x) => x.returnPct > 0).length;
    const losers = priced.filter((x) => x.returnPct < 0).length;

    // NAV history is optional: a book assembled from current-holdings statements
    // has no year-end series until periodic valuation reports are ingested.
    const navSeries = portfolio.navHistory.map((n) => ({ period: n.period, value: convertFromBase(n.nav) }));
    const navFirst = portfolio.navHistory[0] ?? null;
    const navLast = portfolio.navHistory[portfolio.navHistory.length - 1] ?? null;
    const navGrowth = navFirst && navLast && navFirst.nav > 0 ? (navLast.nav / navFirst.nav - 1) * 100 : null;

    return {
      p, listedMV, listedCost, listedPnL, listedRet,
      totalValue, privateCurrent, privateInvested, totalInvested, embeddedGain, gainPct,
      privateNet, privateGain, privateTotalGain, privateDistributed, deploy,
      privateCount, fundCount,
      closedInvested: closedF.drawn, closedDistributed: closedF.distributed,
      buckets, emptyBuckets, bookXirr, listedXirrPct,
      measuredMV, xirrExcluded, xirrWindowDays,
      distinctNames: byKey.size, crossHeld, top10Pct,
      largestName, largestKey: largest?.[0] ?? "", largestPct, winners, losers,
      navSeries, navFirst, navGrowth,
    };
  }, [portfolio, convertFromBase, today]);

  if (!portfolio || !model) return null;
  const m = model;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  const donutData = m.buckets.map((b) => ({ name: b.key, value: convertFromBase(b.current) }));
  // Fund commitments exist or they don't. `committed === 0` across zero funds is
  // the absence of a commitment schedule, not a schedule that commits nothing.
  const hasCommitments = m.fundCount > 0 && m.deploy.committed > 0;
  const calledPct = hasCommitments ? (m.deploy.drawn / m.deploy.committed) * 100 : null;

  const bucketHref = (b: { sheet: PrivateSheet | null }) => b.sheet ? auditHref({ file: "private", sheet: b.sheet }) : auditHref(LEDGER);
  // XIRR, with the multiple and the return-on-cost kept a click away. Both bases
  // run the identical solver; what each popover explains is how finely its
  // source dates the money.
  const XIRR_EXCEL = "= XIRR(dated cash flows, today's value)";
  const xirrCell = (b: typeof m.buckets[number]) => {
    if (b.xirr == null) {
      return (
        <span className="text-slate-500" title="No dated capital movements for this bucket, so there is no money-weighted return to show.">
          {DASH}
        </span>
      );
    }
    const mult = b.metric == null ? DASH : `${b.metric.toFixed(2)}×`;
    const roc = b.retPct == null ? DASH : fmtPct(b.retPct, { sign: true, decimals: 1 });
    const plain: Record<typeof b.xirrBasis, string> = {
      ledger: "The yearly growth rate that makes every dated capital movement balance against what the holdings are worth right now — exactly what Excel's XIRR() returns. The flows are each account's own capital register or bank book, with the window's opening portfolio value as the first entry.",
      "first-investment": "Excel's XIRR() over this bucket's dated flows — capital called at first investment, closed against distributions plus today's NAV. The source dates the first investment but not the distributions, so cash already returned is credited as if it arrived today, which makes this a conservative floor.",
    };
    const formula = {
      title: `${b.key} — XIRR p.a.`,
      excel: XIRR_EXCEL,
      plain: `${plain[b.xirrBasis]}${b.xirrNote ? ` ${b.xirrNote}` : ""}`,
      worked: b.xirrBasis === "ledger"
        ? `${money(b.invested)} invested → ${money(b.current)} today · ${mult} · ${roc} on cost`
        : `${money(b.invested)} invested → ${money(b.current)} today${b.distributed > 0 ? ` + ${money(b.distributed)} already returned` : ""} · ${b.kind} ${mult} · ${roc} total`,
      auditHref: b.xirrBasis === "ledger" ? auditHref(LEDGER) : bucketHref(b),
    };
    return (
      <span className={`rounded-md bg-ink-700 px-1.5 py-0.5 text-[11px] font-semibold mono ${changeColor(b.xirr)}`}>
        <Auditable formula={formula}>{fmtPct(b.xirr, { sign: true, decimals: 1 })}</Auditable>
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
          sub={m.privateCount
            ? `Listed ${money(m.listedMV)} · Private ${money(m.privateCurrent)}`
            : `${m.p.length} listed positions · no private holdings`}
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

        <Kpi label="Listed XIRR"
          value={m.listedXirrPct == null
            ? <AbsentValue />
            : <span className={changeColor(m.listedXirrPct)}><Auditable formula={{
                title: "Listed XIRR p.a.",
                excel: `= XIRR(dated capital movements, market value at ${portfolio.asOf})`,
                plain: `The single yearly growth rate that makes every dated capital movement balance against what the book is worth — exactly what Excel's XIRR() returns. The flows are each account's own capital register or bank book, with the window's opening portfolio value as the first entry; trades are excluded because they move cash inside an account, not into or out of it.${
                  m.xirrExcluded.length ? ` ${m.xirrExcluded.length === 1 ? "Account" : "Accounts"} ${m.xirrExcluded.join(", ")} ${m.xirrExcluded.length === 1 ? "is" : "are"} excluded on BOTH sides for want of an opening portfolio value, so this covers ${money(m.measuredMV)} of the book's ${money(m.listedMV)}.` : ""
                }${m.xirrWindowDays ? ` The window is ${m.xirrWindowDays} days, so this annualises about a quarter — a real measurement of that period, not a rate sustained for a year.` : ""}`,
                auditHref: auditHref(LEDGER),
              }}>{fmtPct(m.listedXirrPct, { sign: true, decimals: 1 })}</Auditable></span>}
          sub={m.listedXirrPct == null
            ? <span className="text-slate-500">no dated capital movements in these statements</span>
            : m.xirrWindowDays
              ? <span title="These flows open on 1 April; the rate annualises that window.">p.a. · {m.xirrWindowDays}-day window</span>
              : "p.a. · money-weighted"}
          icon={<Percent className="h-4 w-4" />} />

        {/* Dry powder and Distributions are FUND facts. With no fund in the book
            they have no denominator — "₹0 undrawn" would assert a commitment
            schedule that draws nothing, which is a different claim entirely. */}
        <Kpi label="Dry powder"
          value={hasCommitments
            ? <span className="text-amber-400"><Auditable formula={{ title: "Dry powder", excel: "= Σ (Committed − Called) across funds", plain: "Capital you've committed to funds that hasn't been called yet — still to be deployed.", worked: `= ${money(m.deploy.committed)} − ${money(m.deploy.drawn)} = ${money(m.deploy.unfunded)}`, auditHref: auditHref({ file: "private" }) }}>{fmtFromBase(m.deploy.unfunded, { compact: true })}</Auditable></span>
            : <AbsentValue />}
          sub={hasCommitments
            ? "undrawn fund commitments"
            : <span className="text-slate-500">no fund commitments in this book</span>}
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
          subtitle="Invested, current value & annualised return per bucket — the CIO's first view"
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
                    <th className="label-xs px-2 py-2 text-right font-medium whitespace-nowrap">XIRR p.a.</th>
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
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">{xirrCell(b)}</td>
                      <td className="px-2 py-2.5 text-right mono text-slate-400">{m.totalValue > 0 ? `${((b.current / m.totalValue) * 100).toFixed(1)}%` : DASH}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 font-semibold">
                    <td className="px-2 py-2.5 text-left text-slate-200">Total</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-300 whitespace-nowrap">{money(m.totalInvested)}</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-100 whitespace-nowrap">{money(m.totalValue)}</td>
                    <td className={`px-2 py-2.5 text-right whitespace-nowrap mono ${m.bookXirr == null ? "text-slate-500" : changeColor(m.bookXirr)}`}>
                      {m.bookXirr == null ? DASH : (
                        <Auditable formula={{
                          title: "Whole-book XIRR p.a.",
                          excel: "= XIRR(every dated flow, listed & private, + today's value)",
                          plain: `${m.privateCount
                            ? "One money-weighted return across the entire book — the accounts' dated capital movements closed against their market value, pooled with the private book's capital calls and latest marks. Private distributions carry no date, so they are credited as if received today; that makes this figure a floor rather than a best case."
                            : "One money-weighted return across the entire book. Every holding here is listed, so this is the same measurement as the listed XIRR above — there is no private flow to pool with it."}${
                            m.xirrExcluded.length ? ` ${m.xirrExcluded.length === 1 ? "Account" : "Accounts"} ${m.xirrExcluded.join(", ")} ${m.xirrExcluded.length === 1 ? "is" : "are"} excluded on both sides for want of an opening portfolio value.` : ""}`,
                          worked: `${money(m.measuredMV)} of the book's ${money(m.totalValue)} is covered, closed at ${portfolio.asOf} = ${fmtPct(m.bookXirr, { sign: true, decimals: 1 })} p.a.`,
                          auditHref: auditHref(LEDGER),
                        }}>{fmtPct(m.bookXirr, { sign: true, decimals: 1 })}</Auditable>
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
            <span className="font-medium text-slate-400">XIRR p.a.</span> is the money-weighted annual return — Excel's <span className="mono">XIRR()</span> over dated cash flows. Because it accounts for <em>when</em> capital went in, a listed book and a ten-year fund are comparable on one scale. Every row uses the same calculation; what differs is how finely the source dates the money, and each popover says which. The listed buckets take each account's external capital movements from its capital register or bank book and close against live prices. Fund buckets date only the first investment — distributions carry no date, so cash already returned is credited as if it arrived today, making those a conservative floor. <span className="font-medium text-slate-400">Money-multiples</span> (MOIC / TVPI) and return-on-cost are in each popover. <span className="font-medium text-slate-400">PMS / Managed</span> is listed equity run through external managers, taken from each account's stated engagement in the registry rather than guessed from its label; the rest is held direct.
            {m.closedInvested > 0 && <> Invested is capital currently deployed; fully-exited funds ({money(m.closedInvested)} in → {money(m.closedDistributed)} back) are excluded from the rows but included in the whole-book XIRR.</>}
            {" "}<span className="font-medium text-slate-400">Every XIRR here closes at {portfolio.asOf}</span>, the book's own report date — the same terminal date the per-account table on NAV &amp; Performance uses, so the two pages state one measurement rather than two.
            {m.xirrExcluded.length > 0 && <> Account {m.xirrExcluded.join(", ")} sits outside every XIRR on this page, flows AND market value: its statements carry no opening portfolio value, and counting what it is worth without what it started from would overstate the rate.</>}
            {m.xirrWindowDays ? <> The flows open on 1 April, so these rates annualise a {m.xirrWindowDays}-day window — a real measurement of that period, not a rate the book has sustained for a year.</> : null}
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
                needs="Commitments, capital calls, undrawn dry powder and distributions are fund facts. This book holds no PE, VC, pre-IPO or debt fund, so there is no commitment schedule to draw against — the bar and its four figures are absent, not zero." />
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
                  {m.privateCount
                    ? `${(m.listedMV / m.totalValue * 100).toFixed(0)} / ${(m.privateCurrent / m.totalValue * 100).toFixed(0)}`
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
                  <div className="text-[11px] text-slate-500">XIRR p.a.</div>
                  <div className={`mono text-[15px] font-semibold ${m.listedXirrPct == null ? "text-slate-500" : "text-slate-100"}`}
                    title={m.xirrExcluded.length
                      ? `Covers ${money(m.measuredMV)} of ${money(m.listedMV)} — account ${m.xirrExcluded.join(", ")} publishes no opening portfolio value. Annualised over a ${m.xirrWindowDays}-day window.`
                      : m.xirrWindowDays ? `Annualised over a ${m.xirrWindowDays}-day window.` : undefined}>
                    {m.listedXirrPct == null ? DASH : fmtPct(m.listedXirrPct, { sign: true, decimals: 1 })}
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
