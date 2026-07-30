import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, TrendingUp, Crosshair, Gauge, Percent } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum } from "@/lib/analytics";
import { fmtPct, fmtCurrency, changeColor, fmtFyPeriod } from "@/lib/format";
import { loadReturns, type ReturnsData } from "@/lib/ledger";
import { xirrWithTerminal } from "@/lib/bucketXirr";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
import { auditHref, LEDGER, embeddedReturnFormula } from "@/lib/auditFormulas";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";

export function Performance() {
  const { portfolio, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  // Money-weighted return (XIRR) over the real dated ledger flows, closed against
  // the live listed value rather than the ledger's own month-old marks — so this
  // agrees with the Morning CIO's figure instead of running ~0.6pp above it.
  // undefined = still loading, null = unavailable (e.g. session expired) →
  // rendered honestly as "—", never estimated.
  const [returns, setReturns] = useState<ReturnsData | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadReturns().then((r) => { if (alive) setReturns(r); });
    return () => { alive = false; };
  }, []);
  const today = useMemo(() => new Date(), []);
  if (!portfolio) return null;
  const nav = portfolio.navHistory;
  const p = portfolio.positions;
  const priced = p.filter((x) => !x.costUnavailable);
  const listedMV = sum(p.map((x) => x.marketValue));
  const xirrPct = returns === undefined ? undefined
    : returns == null ? null
    : xirrWithTerminal(returns.accounts.flatMap((c) => c.flows), listedMV, today);
  const listedCost = sum(priced.map((x) => x.costBasis));
  const listedPnL = sum(priced.map((x) => x.unrealizedPnL));
  const embeddedRet = listedCost > 0 ? (listedPnL / listedCost) * 100 : 0;
  // A book assembled from current-holdings statements carries no year-end NAV
  // series. Growth and CAGR need two dated points; with fewer they render "\u2014"
  // rather than a number computed against a missing baseline.
  const first = nav[0] ?? null, last = nav.length ? nav[nav.length - 1] : null;
  const hasSeries = nav.length >= 2 && !!first && !!last;
  const growth = hasSeries && first.nav > 0 ? (last.nav / first.nav - 1) * 100 : 0;
  const years = hasSeries ? (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 864e5) : 0;
  const cagr = hasSeries && years > 0 && first.nav > 0 ? (Math.pow(last.nav / first.nav, 1 / years) - 1) * 100 : 0;
  const navSeries = nav.map((n) => ({ period: n.period, value: convertFromBase(n.nav) }));
  const yoy = nav.map((n, i) => (i === 0 ? null : { period: n.period, pct: (n.nav / nav[i - 1].nav - 1) * 100 })).filter(Boolean) as { period: string; pct: number }[];
  // Consolidated single-name weights for concentration.
  const consolidated = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of p) m.set(x.securityKey, (m.get(x.securityKey) ?? 0) + x.marketValue);
    return [...m.values()].sort((a, b) => b - a);
  }, [p]);
  const top10Val = sum(consolidated.slice(0, 10));
  const top10 = listedMV > 0 ? (top10Val / listedMV) * 100 : 0;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const bands = [
    { label: "< -20%", test: (r: number) => r < -20 },
    { label: "-20 – 0%", test: (r: number) => r >= -20 && r < 0 },
    { label: "0 – 25%", test: (r: number) => r >= 0 && r < 25 },
    { label: "25 – 100%", test: (r: number) => r >= 25 && r < 100 },
    { label: "> 100%", test: (r: number) => r >= 100 },
  ];
  const dist = bands.map((b) => ({ label: b.label, value: sum(priced.filter((x) => b.test(x.returnPct)).map((x) => x.marketValue)) }));
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  return (
    <div>
      <PageHeader eyebrow="Analytics" title="NAV & Performance"
        subtitle="Listed book value over time, growth, embedded return and concentration. NAV history comes from ingested performance-history statements."
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Listed NAV and embedded return are rebuilt from live prices where a quote exists; NAV snapshots are as reported." />
          <Pill tone="info">{nav.length} snapshot{nav.length === 1 ? "" : "s"}</Pill>
        </div>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Listed NAV" value={<Auditable to={auditHref(LEDGER)} title="Sum of every holding's market value — trace to the ledger">{fmtFromBase(listedMV, { compact: true })}</Auditable>} sub={`${p.length} positions`} icon={<Activity className="h-4 w-4" />} />
        {hasSeries ? (
        <StatTile label={`NAV growth since ${first.period}`} value={<Auditable formula={{ title: `NAV growth since ${first.period}`, excel: "= (Latest NAV ÷ First NAV − 1) × 100", plain: "How much the listed book's net asset value has grown from the first year-end snapshot to now. Includes money added over time, not just market gains.", worked: `= (${money(last.nav)} ÷ ${money(first.nav)} − 1) × 100 = +${growth.toFixed(0)}%` }}>{`+${growth.toFixed(0)}%`}</Auditable>} sub={<><Auditable formula={{ title: "CAGR (compound annual growth rate)", excel: "= (Latest NAV ÷ First NAV) ^ (1 ÷ years) − 1", plain: "The smoothed yearly growth rate that would take the first NAV snapshot to the latest over the elapsed years. Like NAV growth, it includes money added over time.", worked: `= (${money(last.nav)} ÷ ${money(first.nav)}) ^ (1 ÷ ${years.toFixed(1)}) − 1 = ${cagr.toFixed(0)}%` }}>{`${cagr.toFixed(0)}%`}</Auditable> CAGR \u00b7 incl. net contributions</>} icon={<TrendingUp className="h-4 w-4" />} />
        ) : (
          <StatTile label="NAV growth" value={<span className="text-slate-500">\u2014</span>}
            sub="needs at least two NAV snapshots" icon={<TrendingUp className="h-4 w-4" />} />
        )}
        <StatTile label="Embedded return" value={<Auditable formula={embeddedReturnFormula(listedPnL, listedCost, embeddedRet, money, auditHref(LEDGER))}>{fmtPct(embeddedRet, { sign: true })}</Auditable>} sub={<><Auditable to={auditHref(LEDGER)} title="Unrealised gain on listed cost — trace to the ledger">{fmtFromBase(listedPnL, { compact: true, sign: true })}</Auditable> unrealized</>} delta={embeddedRet} icon={<Gauge className="h-4 w-4" />} />
        <StatTile label="Money-weighted return (XIRR)"
          value={xirrPct === undefined ? "…" : xirrPct == null ? "—" : <Auditable formula={{ title: "Money-weighted return (XIRR)", excel: "= XIRR(dated buys & sells, live market value today)", plain: "The single yearly growth rate that makes all your dated buys and sells balance to what the book is worth right now — exactly like Excel's XIRR(). Dated transactions from the ledger, closed against live prices.", auditHref: auditHref(LEDGER) }}><span className={changeColor(xirrPct)}>{fmtPct(xirrPct, { sign: true, decimals: 1 })}</span></Auditable>}
          sub="p.a., from dated ledger flows"
          icon={<Percent className="h-4 w-4" />} />
        <StatTile label="Top-10 concentration" value={<Auditable formula={{ title: "Top-10 concentration", excel: "= Top 10 holdings' value ÷ Total market value × 100", plain: "How much of the listed book sits in just its ten biggest single names — a concentration and single-name-risk gauge.", worked: `= ${money(top10Val)} ÷ ${money(listedMV)} × 100 = ${top10.toFixed(0)}%`, auditHref: auditHref(LEDGER) }}>{`${top10.toFixed(0)}%`}</Auditable>} sub="of listed NAV in the 10 biggest names" icon={<Crosshair className="h-4 w-4" />} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="NAV trajectory" subtitle="Listed book, year-end snapshots">
          {navSeries.length < 2 ? (
            <div className="grid h-64 place-items-center px-6 text-center text-[12px] leading-relaxed text-slate-500">
              No NAV history ingested yet \u2014 a trajectory needs at least two dated snapshots.
            </div>
          ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={navSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="perf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d9c48f" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#d9c48f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="period" stroke="#6b6880" fontSize={11} tickFormatter={fmtFyPeriod} />
                <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "NAV"]} />
                <Area type="monotone" dataKey="value" stroke="#d9c48f" strokeWidth={2} fill="url(#perf)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>
        <Card title="Period growth" subtitle="Change between snapshots">
          {yoy.length === 0 ? (
            <div className="grid h-64 place-items-center px-6 text-center text-[12px] leading-relaxed text-slate-500">
              Nothing to compare yet \u2014 period growth needs consecutive NAV snapshots.
            </div>
          ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yoy} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="period" stroke="#6b6880" fontSize={10} tickFormatter={fmtFyPeriod} />
                <YAxis stroke="#6b6880" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, "Growth"]} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                  {yoy.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2" title="Return distribution" subtitle="Listed market value by return band (cost-priced positions)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" stroke="#6b6880" fontSize={11} />
                <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={84} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(v: number) => [fmtCurrency(v, displayCurrency, { compact: true }), "Value"]} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {dist.map((_, i) => <Cell key={i} fill={i < 2 ? "#ef4444" : "#10b981"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Risk snapshot">
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center justify-between"><span className="text-slate-400">Positions</span><span className="mono text-slate-100">{p.length}</span></li>
            <li className="flex items-center justify-between"><span className="text-slate-400">Distinct names</span><span className="mono text-slate-100">{new Set(p.map((x) => x.securityKey)).size}</span></li>
            <li className="flex items-center justify-between"><span className="text-slate-400">Top-10 concentration</span><span className="mono text-slate-100"><Auditable formula={{ title: "Top-10 concentration", excel: "= Top 10 holdings' value ÷ Total market value × 100", plain: "How much of the listed book sits in just its ten biggest single names.", worked: `= ${money(top10Val)} ÷ ${money(listedMV)} × 100 = ${top10.toFixed(0)}%`, auditHref: auditHref(LEDGER) }}>{`${top10.toFixed(0)}%`}</Auditable></span></li>
            <li className="flex items-center justify-between"><span className="text-slate-400">Cost-unavailable</span><span className="mono text-slate-100">{p.filter((x) => x.costUnavailable).length}</span></li>
            <li className="flex items-center justify-between"><span className="text-slate-400">Winners / losers</span><span className="mono text-slate-100">{priced.filter((x) => x.returnPct > 0).length} / {priced.filter((x) => x.returnPct < 0).length}</span></li>
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">NAV growth includes net capital contributions across periods, not just market return; embedded return isolates unrealized gain on current cost.</p>
        </Card>
      </div>
    </div>
  );
}
