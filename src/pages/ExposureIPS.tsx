import { useMemo } from "react";
import {
  Scale, Target, Globe2, Layers, Clock, ScrollText, TrendingUp, TrendingDown, CalendarRange, Receipt,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { PreviewBadge, PreviewNum, PreviewChart } from "@/components/Preview";
import { usePortfolio } from "@/context/PortfolioContext";
import { bySector, bySecurity, consolidatedMarketValue } from "@/lib/analytics";
import { fmtPct, changeColor } from "@/lib/format";

// LAYER 3 — PORTFOLIO & EXPOSURE (FOOS spec). Family charter & IPS buckets, GAP
// analysis (actual vs desired), top holdings/sectors, MOM/QOQ/YOY movement and
// attribution, plus the monthwise capital-call & tax-liability chart.
//
// MIXED. Actual exposure, top-10 lists and attribution are LIVE from the book.
// Desired allocations, the family charter, the geography/market-cap/duration GAP
// and the monthwise projections are family decisions or need a valuation series —
// those render as clearly-marked PREVIEW.

// Illustrative desired weights per sector name — a family IPS decision the book
// does not carry. Keyed loosely; anything unmatched shows a sample target.
const DESIRED_BY_SECTOR: Record<string, number> = {
  "Financial Services": 24, Financials: 24, "Information Technology": 14, Industrials: 12,
  "Consumer Discretionary": 10, "Health Care": 8, Materials: 8, Energy: 6, "Consumer Staples": 6,
};

export function ExposureIPS() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();

  const totalMV = useMemo(() => consolidatedMarketValue(consolidated), [consolidated]);
  const sectors = useMemo(() => bySector(consolidated), [consolidated]);
  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) if (!m.has(p.securityKey)) m.set(p.securityKey, p.security);
    return m;
  }, [consolidated]);
  const topHoldings = useMemo(() => bySecurity(consolidated).slice(0, 10).map((b) => ({ ...b, name: nameByKey.get(b.key) ?? b.key })), [consolidated, nameByKey]);
  const contributors = useMemo(() => [...consolidated].sort((a, b) => b.unrealizedPnL - a.unrealizedPnL).slice(0, 5), [consolidated]);
  const laggards = useMemo(() => [...consolidated].sort((a, b) => a.unrealizedPnL - b.unrealizedPnL).slice(0, 5), [consolidated]);

  if (!portfolio) return null;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  return (
    <div>
      <PageHeader
        eyebrow="Allocation · Layer 3"
        title="Exposure & IPS"
        subtitle="The family charter and IPS buckets, GAP analysis of actual vs desired exposure, top holdings and sectors, movement and attribution."
        right={<BasisPill liveText="Exposure marked live" hint="Actual exposure, top-10 lists and attribution are live. Desired weights, the charter, and the monthwise projections are illustrative." />}
      />

      {/* Family charter — preview */}
      <Card className="preview-hatch" title={<span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-champagne-400" /> Family charter & decision framework</span>}
        subtitle="The one-page IPS the whole book is measured against" right={<PreviewBadge />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { b: "Growth", d: "Compounders held for the long term", w: "60%" },
            { b: "Liquidity", d: "Cash & liquid funds for calls and opportunities", w: "18%" },
            { b: "Tactical", d: "Shorter-horizon, higher-conviction positions", w: "12%" },
            { b: "Hedge", d: "Downside protection & uncorrelated assets", w: "6%" },
            { b: "Charity", d: "Ring-fenced philanthropic pool", w: "4%" },
          ].map((x) => (
            <div key={x.b} className="rounded-lg border border-ink-700 bg-ink-800/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-200">{x.b}</span>
                <PreviewNum>{x.w}</PreviewNum>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Target weights and the charter text are the family's IPS decisions — placeholders until recorded.</p>
      </Card>

      {/* GAP analysis by sector — actual real, desired preview */}
      <Card className="mt-5" title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-champagne-400" /> GAP analysis — by sector</span>}
        subtitle="Actual weight is live from the book; desired weight is the illustrative IPS target" right={<Pill tone="info">actual live · desired preview</Pill>} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Actual %</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Desired %</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sectors.slice(0, 12).map((s) => {
                const actual = s.weight * 100;
                const desired = DESIRED_BY_SECTOR[s.key] ?? 5;
                const gap = actual - desired;
                return (
                  <tr key={s.key} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 font-medium text-slate-200">{s.key}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{money(s.mv)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">{actual.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right"><PreviewNum>{desired}%</PreviewNum></td>
                    <td className="px-4 py-2.5 text-right"><span className="preview-num mono" title="Illustrative — needs a desired weight">{gap >= 0 ? "+" : ""}{gap.toFixed(1)}pp</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          The GAP also spans geography, market-cap, duration, tangible vs intangible, entity and advisor allocation — actuals
          for those need a look-through the book does not yet carry, so they are previewed below.
        </p>
      </Card>

      {/* Other GAP dimensions — preview */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { t: "By geography", icon: Globe2, rows: [["India", "88%", "80%"], ["US", "7%", "12%"], ["Other", "5%", "8%"]] },
          { t: "By market cap", icon: Layers, rows: [["Large", "54%", "50%"], ["Mid", "28%", "30%"], ["Small", "18%", "20%"]] },
          { t: "By duration / liquidity", icon: Clock, rows: [["Liquid", "82%", "75%"], ["Semi-liquid", "12%", "15%"], ["Illiquid", "6%", "10%"]] },
        ].map((g) => (
          <Card key={g.t} className="preview-hatch" title={<span className="flex items-center gap-2 text-[13px]"><g.icon className="h-4 w-4 text-slate-500" />{g.t}</span>} right={<PreviewBadge />}>
            <table className="w-full text-[12px]">
              <thead><tr className="text-slate-500"><th className="py-1 text-left font-medium">Segment</th><th className="py-1 text-right font-medium">Actual</th><th className="py-1 text-right font-medium">Desired</th></tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r[0]}><td className="py-1 text-slate-400">{r[0]}</td><td className="py-1 text-right"><PreviewNum>{r[1]}</PreviewNum></td><td className="py-1 text-right"><PreviewNum>{r[2]}</PreviewNum></td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      {/* Top holdings & sectors — real */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title="Top 10 holdings" subtitle="Live from the book" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-ink-700"><tr>
              <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
            </tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {topHoldings.map((t) => (
                <tr key={t.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={t.key} name={t.name} /></td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(t.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{(t.weight * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Top 10 sectors" subtitle="Live from the book" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-ink-700"><tr>
              <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
              <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
            </tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {sectors.slice(0, 10).map((s) => (
                <tr key={s.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-200">{s.key}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(s.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{(s.weight * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Attribution — real */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gain" /> Largest contributors</span>} subtitle="By unrealised P&L · live" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <tbody className="divide-y divide-ink-700/60">
              {contributors.map((p) => (
                <tr key={p.securityKey + p.accountId} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={p.securityKey} name={p.security} /></td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.unrealizedPnL)}`}>{money(p.unrealizedPnL, true)}</td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.returnPct)}`}>{fmtPct(p.returnPct, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={<span className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-loss" /> Largest laggards</span>} subtitle="By unrealised P&L · live" right={<Pill tone="info">live</Pill>} pad={false}>
          <table className="min-w-full text-[13px]">
            <tbody className="divide-y divide-ink-700/60">
              {laggards.map((p) => (
                <tr key={p.securityKey + p.accountId} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={p.securityKey} name={p.security} /></td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.unrealizedPnL)}`}>{money(p.unrealizedPnL, true)}</td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(p.returnPct)}`}>{fmtPct(p.returnPct, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Movement + monthwise projections — preview */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-champagne-400" /> Portfolio movement</span>}
          subtitle="MoM · QoQ · YoY" right={<PreviewBadge />}>
          {[["Month on month", "+2.1%"], ["Quarter on quarter", "+6.4%"], ["Year on year", "+18.7%"]].map((r) => (
            <div key={r[0]} className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-[12.5px] last:border-0">
              <span className="text-slate-400">{r[0]}</span><PreviewNum>{r[1]}</PreviewNum>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-slate-500">Needs a dated valuation series — the book carries two dates per account, not a monthly track.</p>
        </Card>
        <Card className="lg:col-span-2 preview-hatch" title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-champagne-400" /> Monthwise: capital calls & tax liability</span>}
          subtitle="Expected fund calls and estimated tax by month" right={<PreviewBadge />}>
          <div className="h-48"><PreviewChart kind="bars" height={190} /></div>
        </Card>
      </div>
    </div>
  );
}
