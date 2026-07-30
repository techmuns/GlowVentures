import { useEffect, useMemo, useState } from "react";
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
import { loadReturns, loadStartupSchedule, type ReturnsData } from "@/lib/ledger";
import { fundXirr, startupXirr, xirrWithTerminal, xirrPct, type XirrResult, type StartupSchedule } from "@/lib/bucketXirr";
import { Auditable } from "@/components/Auditable";
import { auditHref, LEDGER, type PrivateSheet } from "@/lib/auditFormulas";
import { netMultiple, netMultipleKind } from "@/lib/privateValue";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";

// Morning CIO — asset-class cockpit (Phase 1 of the redesign). Summarises the whole
// book by asset class (Direct Equity, Startups, Unlisted, PE/VC, Pre-IPO, Debt) with
// invested / current / return, plus capital deployment, concentration and book
// performance — all from data we already hold. Live-data panels (market overview,
// benchmark, consensus, scanners) are mapped in the roadmap strip for later phases.
export function MorningCIO() {
  const { portfolio, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  // The dated ledger backs the listed XIRRs and the private workbook's follow-on
  // rounds back the startup one; undefined = still loading, null = not reachable,
  // in which case those cells say "—" rather than guess.
  const [returns, setReturns] = useState<ReturnsData | null | undefined>(undefined);
  const [stSchedule, setStSchedule] = useState<StartupSchedule | null>(null);
  useEffect(() => {
    let alive = true;
    loadReturns().then((r) => { if (alive) setReturns(r); });
    loadStartupSchedule().then((s) => { if (alive) setStSchedule(s); });
    return () => { alive = false; };
  }, []);
  // One "today" for every XIRR on the page, so every figure closes on the same
  // date against the same valuation. The ledger also carries its own XIRR closed
  // against the workbook's month-old marks; using that here would put 17.4% in the
  // headline tile beside 16.7% in the table for the same book.
  const today = useMemo(() => new Date(), []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    const p = portfolio.positions;
    const listedMV = sum(p.map((x) => x.marketValue));
    const listedCost = sum(p.map((x) => x.costBasis));
    const listedPnL = sum(p.map((x) => x.unrealizedPnL));
    const listedRet = listedCost > 0 ? (listedPnL / listedCost) * 100 : 0;

    const pm = portfolio.privateMarkets;
    const peF = fundTotals(pm.peFunds);
    const preF = fundTotals(pm.preIpoFunds);
    const unlF = fundTotals(pm.unlistedCompanies);
    const debtF = fundTotals(pm.debtFunds);
    const st = startupTotals(pm.startups);
    // Fund-commitment lifecycle (incl. fully-exited "closed" funds).
    const deploy = fundTotals([...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]);
    const closedF = fundTotals(pm.closedFunds);

    const totalValue = portfolio.totalValue;
    const privateCurrent = portfolio.privateValue;
    // Capital currently deployed = cost of listed holdings + drawn private (excl. fully-exited funds).
    const privateInvested = st.invested + peF.drawn + preF.drawn + unlF.drawn + debtF.drawn;
    const totalInvested = listedCost + privateInvested;
    const privateGain = privateCurrent - privateInvested;
    // Cash returned by holdings still in the book (startups distribute nothing).
    // Kept on the same basis as privateInvested — fully-exited funds sit outside
    // both, and are covered by the lifecycle Distributions KPI above.
    const privateDistributed = peF.distributed + preF.distributed + unlF.distributed + debtF.distributed;
    const privateTotalGain = privateCurrent + privateDistributed - privateInvested;
    const privateNet = privateInvested > 0 ? (privateCurrent + privateDistributed) / privateInvested : 0;
    // Embedded gain = the two book components (so it reconciles with the Book-performance
    // card), using the audited listed P&L so cost-unavailable names aren't counted as pure gain.
    const embeddedGain = listedPnL + privateGain;
    const gainPct = totalInvested > 0 ? (embeddedGain / totalInvested) * 100 : 0;
    const privateRet = privateInvested > 0 ? (privateGain / privateInvested) * 100 : 0;

    // Listed book split by vehicle: in-house "Direct Equity" vs externally-managed
    // "PMS / Managed" — the standard family-office cut. It now reads the account
    // registry's `engagement` field, which the statement states outright, instead
    // of pattern-matching manager names out of an account label.
    const accIdx = accountIndex(portfolio.accounts);
    const managedRow = (x: (typeof p)[number]) => {
      const a = accIdx.get(x.accountId);
      return a ? !isDirect(a) : true;   // unattributed defaults to managed, not direct
    };
    const eqGroup = (rows: typeof p) => {
      const cost = sum(rows.map((x) => x.costBasis));
      const mv = sum(rows.map((x) => x.marketValue));
      const pnl = sum(rows.map((x) => x.unrealizedPnL));
      return { cost, mv, ret: cost > 0 ? (pnl / cost) * 100 : 0 };
    };
    const directEq = eqGroup(p.filter((x) => !managedRow(x)));
    const pmsEq = eqGroup(p.filter(managedRow));
    // Ledger account strings for each side, so the XIRRs below pull the right
    // dated flows out of the archive. Both an accountId and the printed account
    // number are accepted, because the archive may key on either.
    const keysFor = (managed: boolean) => {
      const out = new Set<string>();
      for (const x of p) {
        if (managedRow(x) !== managed) continue;
        const a = accIdx.get(x.accountId);
        out.add(x.accountId);
        if (a?.accountNo) out.add(a.accountNo);
      }
      return out;
    };
    const directKeys = keysFor(false), pmsKeys = keysFor(true);

    // Each bucket carries an XIRR (the comparable, time-aware return) plus its
    // money-multiple, which stays available in the popover — MOIC/TVPI is what the
    // fund managers report, and dropping it entirely would lose the tie to their
    // statements. `xirr` is null while the sources load or when a bucket has no
    // dated flows; the cell renders "—" rather than a placeholder number.
    //
    // Every one of these goes through the same solver, so they are all XIRR in the
    // Excel sense. What varies is how finely the source dates the money, which is
    // what `xirrBasis` names: the ledger dates every trade, the startup sheet dates
    // every round, the fund sheet dates only the first investment.
    //
    // The listed XIRRs close against today's LIVE market value, so they move with
    // the price feed like everything else here. The private ones close against
    // their last marks — those don't tick intraday.
    const listedXirr = (mv: number, keys: Set<string>): number | null => {
      if (!returns) return null;
      const flows = returns.accounts.filter((c) => keys.has(c.key)).flatMap((c) => c.flows);
      return flows.length ? xirrWithTerminal(flows, mv, today) : null;
    };
    const stX = startupXirr(pm.startups, today, stSchedule);
    const unlX = fundXirr(pm.unlistedCompanies, today);
    const peX = fundXirr(pm.peFunds, today);
    const preX = fundXirr(pm.preIpoFunds, today);
    const debtX = fundXirr(pm.debtFunds, today);

    type Basis = "ledger" | "rounds" | "first-investment";
    type Bucket = {
      key: string; color: string; invested: number; current: number;
      kind: "MOIC" | "TVPI"; metric: number | null;   // money-multiple, for the popover
      retPct: number | null;                          // total return on cost, for the popover
      distributed: number;                            // cash already returned; 0 for listed & startups
      xirr: number | null;                            // annualised money-weighted return
      xirrBasis: Basis; xirrNote: string | null;
      sheet: PrivateSheet | null;
    };
    const fundBasis = (r: XirrResult) =>
      r.dated < r.total ? `${r.total - r.dated} of ${r.total} holdings carry no dated first investment and sit outside this XIRR.` : null;
    const startupNote = stSchedule
      ? `Built from ${stSchedule.companies} companies and ${stSchedule.followOns} separately dated follow-on rounds.${stSchedule.undatedCapital > 0 ? ` ${fmtFromBase(stSchedule.undatedCapital, { compact: true })} of capital the sheet records without a date is placed at first investment.` : ""}`
      : fundBasis(stX);
    const fundBucket = (
      key: string, color: string, f: ReturnType<typeof fundTotals>, x: XirrResult, sheet: PrivateSheet,
    ): Bucket => ({
      key, color, invested: f.drawn, current: f.currentValue, distributed: f.distributed,
      kind: netMultipleKind(f.distributed),
      metric: netMultiple(f.drawn, f.currentValue, f.distributed),
      retPct: f.drawn > 0 ? ((f.currentValue + f.distributed - f.drawn) / f.drawn) * 100 : null,
      xirr: x.pct, xirrBasis: "first-investment", xirrNote: fundBasis(x), sheet,
    });
    const buckets: Bucket[] = ([
      { key: "Direct Equity", color: "#d9c48f", invested: directEq.cost, current: directEq.mv, kind: "MOIC", metric: directEq.cost > 0 ? directEq.mv / directEq.cost : null, retPct: directEq.ret, distributed: 0, xirr: listedXirr(directEq.mv, directKeys), xirrBasis: "ledger", xirrNote: null, sheet: null },
      { key: "PMS / Managed", color: "#c3a962", invested: pmsEq.cost, current: pmsEq.mv, kind: "MOIC", metric: pmsEq.cost > 0 ? pmsEq.mv / pmsEq.cost : null, retPct: pmsEq.ret, distributed: 0, xirr: listedXirr(pmsEq.mv, pmsKeys), xirrBasis: "ledger", xirrNote: null, sheet: null },
      { key: "Startups", color: "#6366f1", invested: st.invested, current: st.fairValue, kind: "MOIC", metric: st.moic, retPct: st.invested > 0 ? ((st.fairValue - st.invested) / st.invested) * 100 : null, distributed: 0, xirr: stX.pct, xirrBasis: stSchedule ? "rounds" : "first-investment", xirrNote: startupNote, sheet: "startup" },
      // Fund buckets: the multiple and the return-on-cost both count cash already
      // returned, so a bucket in repayment isn't read as a loss. Marking a debt
      // fund at 0.33× while it has paid back 98% of capital is what this fixes.
      fundBucket("Unlisted Companies", "#10b981", unlF, unlX, "pre-ipo"),
      fundBucket("PE / VC Funds", "#e0709b", peF, peX, "private-equity-funds"),
      fundBucket("Pre-IPO Funds", "#38bdf8", preF, preX, "pre-ipo"),
      fundBucket("Debt Funds", "#818cf8", debtF, debtX, "debt-fund"),
    ] as Bucket[]).sort((a, b) => b.current - a.current);

    // Book-level XIRR: every listed ledger flow closed against the live listed
    // value, pooled with the startup book's dated rounds and the funds' calls and
    // marks. It inherits the funds' conservatism, so it reads as a floor.
    const privateFlows = [
      ...(stSchedule
        ? [...stSchedule.outflows, { date: today, amount: st.fairValue }]
        : pm.startups.filter((s) => s.investDate && s.invested > 0)
            .flatMap((s) => [{ date: new Date(s.investDate!), amount: -s.invested }, { date: today, amount: s.fairValue }])),
      ...[...pm.peFunds, ...pm.preIpoFunds, ...pm.unlistedCompanies, ...pm.debtFunds, ...pm.closedFunds]
        .filter((f) => f.firstInvest && f.drawn > 0)
        .flatMap((f) => [{ date: new Date(f.firstInvest!), amount: -f.drawn }, { date: today, amount: f.distributed + f.currentValue }]),
    ];
    const listedFlows = returns ? returns.accounts.flatMap((c) => c.flows) : [];
    const listedXirrPct = returns ? xirrWithTerminal(listedFlows, listedMV, today) : null;
    const bookXirr = returns
      ? xirrPct([...listedFlows, { date: today, amount: listedMV }, ...privateFlows])
      : null;

    // Concentration, consolidated on securityKey across accounts. ISIN cannot do
    // this here: the same company arrives from two platforms with two spellings
    // and, more often than not, no ISIN on either side.
    const byKey = new Map<string, number>();
    for (const x of p) byKey.set(x.securityKey, (byKey.get(x.securityKey) ?? 0) + x.marketValue);
    // Overlap: securities held by more than one owning entity.
    const ownersByKey = new Map<string, Set<string>>();
    for (const x of p) {
      const s = ownersByKey.get(x.securityKey) ?? new Set<string>();
      s.add(ownerOf(accIdx, x));
      ownersByKey.set(x.securityKey, s);
    }
    const crossHeld = [...ownersByKey.values()].filter((s) => s.size >= 2).length;
    const consolidated = [...byKey.entries()].sort((a, b) => b[1] - a[1]);
    const top10Pct = listedMV > 0 ? (sum(consolidated.slice(0, 10).map(([, v]) => v)) / listedMV) * 100 : 0;
    const largest = consolidated[0];
    const largestName = (largest && p.find((x) => x.securityKey === largest[0])?.security) || "\u2014";
    const largestPct = largest && listedMV > 0 ? (largest[1] / listedMV) * 100 : 0;
    const winners = p.filter((x) => !x.costUnavailable && x.returnPct > 0).length;
    const losers = p.filter((x) => !x.costUnavailable && x.returnPct < 0).length;

    // NAV history is optional: a book assembled from current-holdings statements
    // has no year-end series until performance reports are ingested. The card
    // says so rather than drawing a trajectory from one point or from zeros.
    const navSeries = portfolio.navHistory.map((n) => ({ period: n.period, value: convertFromBase(n.nav) }));
    const navFirst = portfolio.navHistory[0] ?? null;
    const navLast = portfolio.navHistory[portfolio.navHistory.length - 1] ?? null;
    const navGrowth = navFirst && navLast && navFirst.nav > 0 ? (navLast.nav / navFirst.nav - 1) * 100 : 0;

    return {
      p, listedMV, listedCost, listedPnL, listedRet,
      totalValue, privateCurrent, privateInvested, totalInvested, embeddedGain, gainPct,
      privateNet, privateGain, privateTotalGain, privateDistributed, privateRet, deploy,
      closedInvested: closedF.drawn, closedDistributed: closedF.distributed,
      buckets, bookXirr, listedXirrPct, distinctNames: byKey.size, crossHeld, top10Pct, largestName, largestKey: largest?.[0] ?? "", largestPct, winners, losers,
      navSeries, navFirst, navGrowth,
    };
  }, [portfolio, convertFromBase, fmtFromBase, returns, stSchedule, today]);

  if (!portfolio || !model) return null;
  const m = model;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  const calledPct = m.deploy.committed > 0 ? (m.deploy.drawn / m.deploy.committed) * 100 : 0;
  const undrawnPct = 100 - calledPct;
  const donutData = m.buckets.map((b) => ({ name: b.key, value: convertFromBase(b.current), color: b.color }));

  const bucketHref = (b: { sheet: PrivateSheet | null }) => b.sheet ? auditHref({ file: "private", sheet: b.sheet }) : auditHref(LEDGER);
  // XIRR, with the multiple and the return-on-cost kept a click away. All three
  // bases run the identical solver; what each popover explains is how finely its
  // source dates the money.
  const XIRR_EXCEL = "= XIRR(dated cash flows, today's value)";
  const xirrCell = (b: typeof m.buckets[number]) => {
    if (returns === undefined && b.xirrBasis === "ledger") return <span className="text-slate-600">…</span>;
    if (b.xirr == null) return <span className="text-slate-600" title="No dated cash flows for this bucket, so there is no money-weighted return to show.">—</span>;
    const mult = b.metric == null ? "—" : `${b.metric.toFixed(2)}×`;
    const roc = b.retPct == null ? "—" : fmtPct(b.retPct, { sign: true, decimals: 1 });
    const plain: Record<typeof b.xirrBasis, string> = {
      ledger: "The yearly growth rate that makes every dated purchase and sale balance against what the holdings are worth right now — exactly what Excel's XIRR() returns. Every trade in the ledger carries its own date, so nothing here is estimated.",
      rounds: "Excel's XIRR() over the startup book's dated cheques: the first investment and each follow-on round on the date it was funded, closed against today's fair value.",
      "first-investment": "Excel's XIRR() over this bucket's dated flows — capital called at first investment, closed against distributions plus today's NAV. The workbook dates the first investment but not the distributions, so cash already returned is credited as if it arrived today, which makes this a conservative floor.",
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
        right={<BasisPill liveText="Consolidated · listed live" hint="Listed holdings are priced live where a quote exists; the private book is marked as of its last statement." />} />

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Consolidated NAV"
          value={<Auditable formula={{ title: "Consolidated NAV", excel: "= Listed value + Private value", plain: "Your whole book — the listed portfolio plus the private-markets book, at latest marks.", worked: `= ${money(m.listedMV)} + ${money(m.privateCurrent)} = ${money(m.totalValue)}` }}>{fmtFromBase(m.totalValue, { compact: true })}</Auditable>}
          sub={`Listed ${money(m.listedMV)} · Private ${money(m.privateCurrent)}`} icon={<Briefcase className="h-4 w-4" />} />
        <Kpi label="Capital invested"
          value={<Auditable formula={{ title: "Capital invested", excel: "= Listed cost + Private drawn (current holdings)", plain: "Money currently deployed — cost of listed holdings plus capital called into private assets still held.", worked: `= ${money(m.listedCost)} + ${money(m.privateInvested)} = ${money(m.totalInvested)}` }}>{fmtFromBase(m.totalInvested, { compact: true })}</Auditable>}
          sub="cost in, across listed & private" icon={<Wallet className="h-4 w-4" />} />
        <Kpi label="Embedded gain"
          value={<span className={changeColor(m.embeddedGain)}><Auditable formula={{ title: "Embedded gain", excel: "= Listed unrealised P&L + Private markup", plain: "On-paper gain across the whole book — the listed book's unrealised P&L plus the private book's markup over invested cost.", worked: `= ${money(m.listedPnL)} + ${money(m.privateGain)} = ${money(m.embeddedGain, true)}` }}>{fmtFromBase(m.embeddedGain, { compact: true, sign: true })}</Auditable></span>}
          delta={m.gainPct} sub="on invested" icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="Listed XIRR"
          value={returns === undefined ? "…" : m.listedXirrPct == null ? "—" : <span className={changeColor(m.listedXirrPct)}><Auditable formula={{ title: "Listed XIRR p.a.", excel: "= XIRR(dated buys & sells, live market value today)", plain: "The single yearly growth rate that makes every dated buy and sell balance against what the listed book is worth right now — exactly what Excel's XIRR() returns. Closed against live prices, so it matches the per-bucket XIRRs below rather than the workbook's month-old marks.", auditHref: auditHref(LEDGER) }}>{fmtPct(m.listedXirrPct, { sign: true, decimals: 1 })}</Auditable></span>}
          sub="p.a. · money-weighted" icon={<Percent className="h-4 w-4" />} />
        <Kpi label="Dry powder"
          value={<span className="text-amber-400"><Auditable formula={{ title: "Dry powder", excel: "= Σ (Committed − Called) across funds", plain: "Capital you've committed to funds that hasn't been called yet — still to be deployed.", worked: `= ${money(m.deploy.committed)} − ${money(m.deploy.drawn)} = ${money(m.deploy.unfunded)}`, auditHref: auditHref({ file: "private" }) }}>{fmtFromBase(m.deploy.unfunded, { compact: true })}</Auditable></span>}
          sub="undrawn fund commitments" icon={<Fuel className="h-4 w-4" />} />
        <Kpi label="Distributions"
          value={<Auditable to={auditHref({ file: "private" })} title="Distributions — trace to the private-markets workbook">{fmtFromBase(m.deploy.distributed, { compact: true })}</Auditable>}
          sub="cash returned to date · incl. exited funds" icon={<Coins className="h-4 w-4" />} />
      </div>

      {/* Allocation hero + right column */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Allocation by asset class"
          subtitle="Invested, current value & annualised return per bucket — the CIO's first view"
          right={<Pill tone="info">{m.buckets.length} buckets</Pill>}>
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="relative mx-auto shrink-0" style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={74} stroke="none">
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
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
                  {m.buckets.map((b, i) => (
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
                      <td className="px-2 py-2.5 text-right mono text-slate-400">{(m.totalValue > 0 ? (b.current / m.totalValue) * 100 : 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 font-semibold">
                    <td className="px-2 py-2.5 text-left text-slate-200">Total</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-300 whitespace-nowrap">{money(m.totalInvested)}</td>
                    <td className="px-2 py-2.5 text-right mono text-slate-100 whitespace-nowrap">{money(m.totalValue)}</td>
                    <td className={`px-2 py-2.5 text-right whitespace-nowrap mono ${m.bookXirr == null ? "text-slate-500" : changeColor(m.bookXirr)}`}>
                      {returns === undefined ? "…" : m.bookXirr == null ? "—" : (
                        <Auditable formula={{
                          title: "Whole-book XIRR p.a.",
                          excel: "= XIRR(every dated flow, listed & private, + today's value)",
                          plain: "One money-weighted return across the entire book — the ledger's dated buys and sells closed against live prices, pooled with the private book's capital calls and latest marks. Private distributions carry no date in the workbook, so they are credited as if received today; that makes this figure a floor rather than a best case.",
                          worked: `${money(m.totalInvested)} invested → ${money(m.totalValue)} today = ${fmtPct(m.bookXirr, { sign: true, decimals: 1 })} p.a.`,
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
          <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
            <span className="font-medium text-slate-400">XIRR p.a.</span> is the money-weighted annual return — Excel's <span className="mono">XIRR()</span> over dated cash flows. Because it accounts for <em>when</em> capital went in, a listed book and a ten-year fund are comparable on one scale. Every row uses the same calculation; what differs is how finely the source dates the money, and each popover says which. The listed buckets date every buy and sell from the ledger and close against live prices. Startups date the first cheque and each follow-on round from the private workbook. The funds date only the first investment — distributions carry no date, so cash already returned is credited as if it arrived today, making those a conservative floor. <span className="font-medium text-slate-400">Money-multiples</span> (MOIC / TVPI) and return-on-cost are in each popover. <span className="font-medium text-slate-400">PMS / Managed</span> is listed equity run through external managers, taken from each account\u2019s stated engagement in the registry rather than guessed from its label; the rest is held direct. Invested is capital currently deployed; fully-exited funds ({money(m.closedInvested)} in → {money(m.closedDistributed)} back) are excluded from the rows but included in the whole-book XIRR.
          </p>
        </Card>

        <div className="grid gap-5 content-start lg:col-span-1">
          <Card title="Capital deployment" subtitle="Fund commitments &amp; dry powder">
            <ul className="text-sm">
              <li className="flex items-center justify-between py-2"><span className="text-slate-400">Fund commitments</span><span className="mono text-slate-100">{money(m.deploy.committed)}</span></li>
              <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Called / drawn</span><span className="mono text-slate-100">{money(m.deploy.drawn)}</span></li>
              <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Undrawn — dry powder</span><span className="mono text-amber-400">{money(m.deploy.unfunded)}</span></li>
              <li className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Distributions received</span><span className="mono text-slate-100">{money(m.deploy.distributed)}</span></li>
            </ul>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
              <div style={{ width: `${calledPct}%`, background: CHART_COLORS[0] }} />
              <div style={{ width: `${undrawnPct}%`, background: "rgba(245,158,11,.45)" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
              <span>Called {calledPct.toFixed(1)}%</span><span>Undrawn {undrawnPct.toFixed(1)}%</span>
            </div>
          </Card>

          <Card title="Concentration &amp; risk">
            <div className="grid grid-cols-2 gap-x-6 text-sm">
              <div className="flex items-center justify-between py-2"><span className="text-slate-400">Positions</span><span className="mono text-slate-100">{fmtNum(m.p.length)}</span></div>
              <div className="flex items-center justify-between py-2"><span className="text-slate-400">Distinct names</span><span className="mono text-slate-100">{fmtNum(m.distinctNames)}</span></div>
              <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Cross-held</span><span className="mono text-slate-100" title="Securities held by two or more entities">{fmtNum(m.crossHeld)}</span></div>
              <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Top-10 conc.</span><span className="mono text-slate-100">{m.top10Pct.toFixed(0)}%</span></div>
              <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Listed / Private</span><span className="mono text-slate-100">{(m.listedMV / m.totalValue * 100).toFixed(0)} / {(m.privateCurrent / m.totalValue * 100).toFixed(0)}</span></div>
              <div className="col-span-2 flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Largest name</span><span className="mono text-slate-100 truncate pl-3" title={m.largestName}><StockLink securityKey={m.largestKey} name={m.largestName} /> · {m.largestPct.toFixed(1)}%</span></div>
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
                <div><div className="text-[11px] text-slate-500">Return</div><div className={`mono text-[15px] font-semibold ${changeColor(m.listedRet)}`}>{fmtPct(m.listedRet, { sign: true, decimals: 1 })}</div></div>
                <div><div className="text-[11px] text-slate-500">XIRR p.a.</div><div className="mono text-[15px] font-semibold text-slate-100">{returns === undefined ? "…" : m.listedXirrPct == null ? "—" : fmtPct(m.listedXirrPct, { sign: true, decimals: 1 })}</div></div>
              </div>
            </div>
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <div className="label-xs flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[1] }} />Private book</div>
              <div className="mt-2.5 text-[13px] text-slate-400"><span className="font-semibold text-slate-100">{money(m.privateInvested)}</span> invested → <span className="font-semibold text-slate-100">{money(m.privateCurrent)}</span> today</div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                <div><div className="text-[11px] text-slate-500">Total gain</div><div className={`mono text-[15px] font-semibold ${changeColor(m.privateTotalGain)}`}>{money(m.privateTotalGain, true)}</div></div>
                <div><div className="text-[11px] text-slate-500">Total return</div><div className="mono text-[15px] font-semibold text-slate-100">{m.privateNet.toFixed(2)}×</div></div>
                <div><div className="text-[11px] text-slate-500">Distributions</div><div className="mono text-[15px] font-semibold text-slate-100">{money(m.privateDistributed)}</div></div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col" title="Listed NAV trajectory" subtitle="Listed book, financial year-ends"
          right={m.navFirst ? <Pill tone="info">+{m.navGrowth.toFixed(0)}% since {fmtFyPeriod(m.navFirst.period)}</Pill> : <Pill>no history yet</Pill>}>
          {m.navSeries.length < 2 ? (
            <div className="grid min-h-[14rem] flex-1 place-items-center px-6 text-center text-[12px] leading-relaxed text-slate-500">
              No NAV history in the book yet. It appears once performance-history statements are ingested \u2014
              a single snapshot is not a trajectory, so nothing is drawn from one.
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
        <p className="mt-2.5 text-[11px] text-slate-500">Mapped from the client deck; these activate once the live market-data feed &amp; fundamentals source are wired in later phases. Phase 1 ships everything above using data we already hold.</p>
      </div>
    </div>
  );
}
