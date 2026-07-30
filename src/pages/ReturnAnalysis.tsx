import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, Cell, LabelList,
  ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, ReferenceLine,
} from "recharts";
import { TrendingUp, Percent, Activity, TrendingDown, Target, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtPct, changeColor, fmtFyPeriod } from "@/lib/format";
import { loadReturns, loadTradeStats, type TradeStats, type ReturnsData } from "@/lib/ledger";
import { xirrWithTerminal } from "@/lib/bucketXirr";
import { fetchCloses, NIFTY } from "@/lib/history";
import { navAnalytics } from "@/lib/performance";
import { Auditable } from "@/components/Auditable";
import { auditHref, LEDGER } from "@/lib/auditFormulas";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle } from "@/lib/chartTheme";

const GAIN = "#10b981", LOSS = "#ef4444", GOLD = "#d9c48f", INDIGO = "#6366f1";

// Return & Drawdown Analysis (Phase 3 of the redesign). Time- and money-weighted
// returns, drawdown & trade statistics — all derived from data we already hold:
// the listed book's year-end NAV history (navAnalytics) and the dated ledger
// (XIRR + trade stats). The Nifty benchmark line is a seeded placeholder until a
// live index feed lands; deeper daily-NAV & rolling-return work is mapped below.
export function ReturnAnalysis() {
  const { portfolio, fmtFromBase } = usePortfolio();
  // The ledger's dated flows, closed against the live listed value rather than the
  // workbook's marks — so this XIRR matches the one on Morning CIO and Performance.
  const [returns, setReturns] = useState<ReturnsData | null | undefined>(undefined);
  const [trade, setTrade] = useState<TradeStats | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadReturns().then((r) => { if (alive) setReturns(r); });
    loadTradeStats().then((t) => { if (alive) setTrade(t ?? null); });
    return () => { alive = false; };
  }, []);
  const today = useMemo(() => new Date(), []);
  const xirrPct = useMemo(() => {
    if (returns === undefined) return undefined;
    if (!returns || !portfolio) return null;
    const listedMV = portfolio.positions.reduce((s, x) => s + x.marketValue, 0);
    return xirrWithTerminal(returns.accounts.flatMap((c) => c.flows), listedMV, today);
  }, [returns, portfolio, today]);

  // Live Nifty closes at the NAV snapshot dates. The upstream can't hand back a
  // full series (see functions/api/history.js), but it answers "close on date D"
  // reliably — and since NAV is only captured at year-ends, that is exactly the
  // granularity the comparison needs. Falls back to the stored estimates, which
  // the chart then labels as such.
  const [bench, setBench] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!portfolio) return;
    let alive = true;
    fetchCloses(portfolio.navHistory.map((n) => n.date), NIFTY).then((r) => {
      if (!alive || !r) return;
      const m: Record<string, number> = {};
      for (const [asked, c] of Object.entries(r.closes)) m[asked] = c.close;
      setBench(Object.keys(m).length ? m : null);
    });
    return () => { alive = false; };
  }, [portfolio]);

  const a = useMemo(() => (portfolio ? navAnalytics(portfolio.navHistory, bench) : null), [portfolio, bench]);
  if (!portfolio || !a) return null;

  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const pct1 = (n: number) => fmtPct(n, { sign: true, decimals: 1 });
  const idx = (v: number) => `₹${Math.round(v)}`;
  const ddDomainMin = Math.min(-1, Math.floor(a.maxDrawdownPct * 1.4));

  // Wait / missing states for the two async ledger reads.
  const xirrCell = xirrPct === undefined ? "…" : xirrPct == null ? "—" : pct1(xirrPct);
  const winCell = trade === undefined ? "…" : trade == null ? "—" : fmtPct(trade.winRatePct, { decimals: 1 });
  const pfCell = trade === undefined ? "…" : trade == null || trade.profitFactor == null ? "—" : `${trade.profitFactor.toFixed(2)}`;

  return (
    <div>
      <PageHeader eyebrow="Analytics" title="Return &amp; Drawdown Analysis"
        subtitle="Listed book — time- &amp; money-weighted returns, drawdown and trade statistics"
        right={<Pill tone="info">Since inception · {fmtFyPeriod(a.first.period)} → {fmtFyPeriod(a.last.period)}</Pill>} />

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="CAGR"
          value={<span className={changeColor(a.cagrPct)}><Auditable formula={{ title: "CAGR (annualised)", excel: "= (NAV_end / NAV_start)^(1 / years) − 1", plain: "The steady yearly growth rate that turns the first year-end NAV into the latest, over the elapsed years.", worked: `= (${money(a.last.nav)} / ${money(a.first.nav)})^(1/${a.years.toFixed(1)}) − 1 = ${pct1(a.cagrPct)}` }}>{pct1(a.cagrPct)}</Auditable></span>}
          sub={`listed NAV · ~${a.years.toFixed(1)}y`} icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="XIRR (money-wtd)"
          value={xirrPct == null && xirrPct !== undefined ? "—" : xirrPct === undefined ? "…" : <span className={changeColor(xirrPct)}><Auditable formula={{ title: "Money-weighted return (XIRR)", excel: "= XIRR(dated buys & sells, live market value today)", plain: "The single yearly growth rate that makes every dated buy and sell balance against what the book is worth right now — like Excel's XIRR(). Dated transactions from the ledger, closed against live prices.", auditHref: auditHref(LEDGER) }}>{pct1(xirrPct)}</Auditable></span>}
          sub="p.a. · dated flows" icon={<Percent className="h-4 w-4" />} />
        <Kpi label="Total return"
          value={<span className={changeColor(a.totalReturnPct)}><Auditable formula={{ title: "Total return since inception", excel: "= NAV_end / NAV_start − 1", plain: "Cumulative growth of the listed book's NAV from the first year-end snapshot to the latest.", worked: `= ${money(a.last.nav)} / ${money(a.first.nav)} − 1 = ${pct1(a.totalReturnPct)}` }}>{pct1(a.totalReturnPct)}</Auditable></span>}
          sub={`since ${fmtFyPeriod(a.first.period)}`} icon={<Activity className="h-4 w-4" />} />
        <Kpi label="Max drawdown"
          value={<span className="text-loss"><Auditable formula={{ title: "Maximum drawdown", excel: "= min over time of (NAV / running peak − 1)", plain: "The deepest fall from a prior year-end high to a later trough. Year-end granularity, so troughs within a year aren't captured.", worked: `= ${fmtPct(a.maxDrawdownPct, { sign: true, decimals: 1 })} at ${fmtFyPeriod(a.maxDrawdownPeriod)}` }}>{fmtPct(a.maxDrawdownPct, { sign: true, decimals: 1 })}</Auditable></span>}
          sub={`${fmtFyPeriod(a.maxDrawdownPeriod)} · ${a.atHigh ? "recovered" : "current"}`} icon={<TrendingDown className="h-4 w-4" />} />
        <Kpi label="Win rate" value={winCell}
          sub={trade && trade.sold > 0 ? `${trade.wins} W / ${trade.losses} L lots` : "of closed lots"} icon={<Target className="h-4 w-4" />} />
        <Kpi label="Profit factor" value={pfCell} sub="gross gain ÷ loss" icon={<Scale className="h-4 w-4" />} />
      </div>

      {/* Portfolio vs benchmark + Drawdown & risk */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col lg:col-span-2" title="Portfolio vs benchmark"
          subtitle="Growth of ₹100 · listed book vs Nifty 50, financial year-ends"
          right={a.alphaPct == null ? undefined : <Pill tone={a.alphaPct >= 0 ? "gain" : "loss"}>{fmtPct(a.alphaPct, { sign: true, decimals: 0 })} alpha</Pill>}>
          <div className="min-h-[15rem] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={a.growth} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="period" stroke="#6b6880" fontSize={11} tickFormatter={fmtFyPeriod} />
                <YAxis stroke="#6b6880" fontSize={11} width={48} tickFormatter={(v: number) => idx(v)} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  labelFormatter={(l: string) => fmtFyPeriod(l)}
                  formatter={(v: number, n: string) => [idx(v), n === "portfolio" ? "Portfolio" : a.benchmarkSeeded ? "Nifty 50 (estimated)" : "Nifty 50"]} />
                <Line type="monotone" dataKey="portfolio" stroke={GOLD} strokeWidth={2.5} dot={false} name="portfolio" />
                <Line type="monotone" dataKey="benchmark" stroke={INDIGO} strokeWidth={2} strokeDasharray="5 4" dot={false} name="benchmark" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-dashed border-ink-700 pt-2.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded-full" style={{ background: GOLD }} />Portfolio {pct1(a.totalReturnPct)}</span>
            {a.benchmarkReturnPct != null && (
              <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: INDIGO }} />Nifty 50 {pct1(a.benchmarkReturnPct)}</span>
            )}
            <span className="text-slate-600">{a.benchmarkSeeded ? "· estimated closes — the live index feed is unavailable" : "· live index closes at each year-end"}</span>
          </div>
        </Card>

        <Card title="Drawdown &amp; risk">
          <div className="text-sm">
            <div className="flex items-center justify-between py-2"><span className="text-slate-400">Max drawdown</span><span className="mono font-semibold text-loss">{fmtPct(a.maxDrawdownPct, { sign: true, decimals: 1 })}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Current drawdown</span><span className="mono text-slate-100">{fmtPct(a.currentDrawdownPct, { decimals: 1 })}{a.atHigh && <span className="text-slate-500"> · at high</span>}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Recovery period</span><span className="mono text-slate-100">{a.recoveryLabel}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Best year</span><span className="mono font-semibold text-gain">{pct1(a.bestYearPct)} <span className="font-normal text-slate-500">({fmtFyPeriod(a.bestYearPeriod)})</span></span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2"><span className="text-slate-400">Positive years</span><span className="mono text-slate-100">{a.positiveYears} of {a.totalYears}</span></div>
          </div>
          <div className="mt-3 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={a.underwater} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LOSS} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={LOSS} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="period" hide />
                <YAxis hide domain={[ddDomainMin, 0]} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  labelFormatter={(l: string) => fmtFyPeriod(l)} formatter={(v: number) => [fmtPct(v, { decimals: 1 }), "Drawdown"]} />
                <Area type="monotone" dataKey="dd" stroke={LOSS} strokeWidth={1.5} fill="url(#ddfill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Underwater curve · % below the running peak</div>
        </Card>
      </div>

      {/* Performance summary + Year-wise returns */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Performance summary" subtitle="Headline return &amp; trade statistics">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCell label="CAGR" value={pct1(a.cagrPct)} tone={a.cagrPct} sub="annualised" />
            <StatCell label="XIRR" value={xirrCell} tone={xirrPct ?? undefined} sub="money-weighted" />
            <StatCell label="Total return" value={pct1(a.totalReturnPct)} tone={a.totalReturnPct} sub="since inception" />
            <StatCell label="Win rate" value={winCell} sub="of closed lots" />
            <StatCell label="Profitable days" value="—" sub="needs daily NAV" muted />
            <StatCell label="Avg gain" value={trade === undefined ? "…" : trade == null ? "—" : money(trade.avgGain, true)} tone={trade ? 1 : undefined} sub="per winning lot" />
            <StatCell label="Avg loss" value={trade === undefined ? "…" : trade == null ? "—" : money(-trade.avgLoss, true)} tone={trade ? -1 : undefined} sub="per losing lot" />
            <StatCell label="Profit factor" value={pfCell} sub={trade && trade.profitFactor != null ? `${money(trade.grossProfit)} ÷ ${money(trade.grossLoss)}` : "gross gain ÷ loss"} />
          </div>
        </Card>

        <Card className="flex flex-col" title="Year-wise returns" subtitle="NAV change between snapshots">
          <div className="min-h-[14rem] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.yearly} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#2b2668" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="period" stroke="#6b6880" fontSize={10} interval={0} tickFormatter={fmtFyPeriod} />
                <YAxis stroke="#6b6880" fontSize={11} width={40} tickFormatter={(v: number) => `${Math.round(v)}%`} />
                <ReferenceLine y={0} stroke="#6b6880" />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  cursor={{ fill: "rgba(120,120,160,0.08)" }} labelFormatter={(l: string) => fmtFyPeriod(l)}
                  formatter={(v: number) => [fmtPct(v, { sign: true, decimals: 1 }), "Return"]} />
                <Bar dataKey="pct" radius={[3, 3, 0, 0]} maxBarSize={46}>
                  {a.yearly.map((y, i) => <Cell key={i} fill={y.pct >= 0 ? GAIN : LOSS} />)}
                  <LabelList dataKey="pct" position="top" className="mono"
                    formatter={(v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`}
                    style={{ fontSize: 10, fill: "#8a8aa0" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Deferred — deepens as data lands */}
      <div className="mt-5 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 p-4">
        <div className="text-[12.5px] font-semibold text-slate-400">◇ Deepens as data lands — later phases</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {[
            "Midcap / Smallcap benchmarks alongside the Nifty",
            "Rolling returns across 1 / 3 / 5-yr horizons",
            "Month-wise return & drawdown with a date-range filter",
            "Daily-NAV metrics — profitable days, downside deviation, Sharpe / Sortino, Beta",
          ].map((c) => (
            <span key={c} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-[11.5px] text-slate-400">◷ {c}</span>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
          The Nifty line is now live — real index closes pulled at each NAV snapshot date. What stays coarse is the granularity: our NAV is captured only at financial year-ends, so drawdown and rolling returns are annual. Sharpening them needs a monthly or daily NAV series, and the price API returns only a four-row preview of any window rather than the full history, so that series can't be reconstructed from it — it needs either a different data contract or NAV snapshots captured more often. Portfolio figures above are live from the NAV history &amp; the dated ledger.
        </p>
      </div>
    </div>
  );
}

// One cell of the Performance-summary grid. tone: >0 green, <0 red, else neutral.
function StatCell({ label, value, sub, tone, muted }: { label: string; value: React.ReactNode; sub: string; tone?: number; muted?: boolean }) {
  const color = muted ? "text-slate-500" : typeof tone === "number" ? changeColor(tone) : "text-slate-100";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
      <div className="label-xs">{label}</div>
      <div className={`mt-1.5 mono whitespace-nowrap text-[18px] font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}
