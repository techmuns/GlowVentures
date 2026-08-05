import { useMemo, useState } from "react";
import {
  Wallet, Landmark, Droplets, Gauge, TrendingUp, HeartHandshake, PhoneCall, ClipboardCheck, Building2, PieChart,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { AbsentCell } from "@/components/Absent";
import { PreviewBadge, PreviewNum, PreviewPill, previewTile } from "@/components/Preview";
import { usePortfolio } from "@/context/PortfolioContext";
import { byEntity, bySecurity, consolidatedMarketValue, dedupedPositions } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { entityXirrPct } from "@/lib/returns";
import { fmtPct, changeColor } from "@/lib/format";

// LAYER 6 — FAMILY DASHBOARD (FOOS spec). Per family member and for the whole
// family: net worth, portfolio value, cash, liquidity coverage, annual return,
// benchmark, charity pool, capital calls, buckets, public/private, top exposures
// and decisions required.
//
// MIXED page. Portfolio value, the public/private split and the top exposures are
// REAL and carry a basis pill. Net worth (needs off-book assets), cash, liquidity
// coverage, benchmark, charity, capital calls and decisions are family facts no
// statement in this book carries — those render as clearly-marked PREVIEW.

const FAMILY = "Whole family";

// Sample per-scope figures for the fields the book cannot supply, so switching
// member shows plausibly different placeholders.
const PREVIEW_FIGS: Record<string, { networth: string; cash: string; liq: string; bench: string; charity: string }> = {
  [FAMILY]: { networth: "₹128.4 Cr", cash: "₹6.2 Cr", liq: "14 mo", bench: "+11.8%", charity: "₹3.1 Cr" },
};
const FALLBACK = { networth: "—", cash: "₹1.4 Cr", liq: "9 mo", bench: "+11.8%", charity: "₹0.6 Cr" };

export function FamilyDashboard() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const [scope, setScope] = useState<string>(FAMILY);

  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);
  const entities = useMemo(() => (portfolio ? byEntity(portfolio.positions, portfolio.accounts) : []), [portfolio]);

  // Positions in scope: the whole (deduped) book for the family, or one owner's
  // rows (NOT deduped — a per-owner figure shows each statement as printed).
  const scoped = useMemo(() => {
    if (!portfolio) return [];
    if (scope === FAMILY) return consolidated;
    return portfolio.positions.filter((p) => ownerOf(accIdx, p) === scope);
  }, [portfolio, consolidated, scope, accIdx]);

  const mv = useMemo(() => (scope === FAMILY ? consolidatedMarketValue(scoped) : scoped.reduce((s, p) => s + p.marketValue, 0)), [scoped, scope]);
  const cost = useMemo(() => scoped.reduce((s, p) => s + p.costBasis, 0), [scoped]);
  const retPct = cost > 0 ? ((mv - cost) / cost) * 100 : 0;
  const xirr = useMemo(() => (portfolio && scope !== FAMILY ? entityXirrPct(portfolio, scope, mv) : null), [portfolio, scope, mv]);

  // Top exposures by security, aggregated across accounts in scope.
  const topExposures = useMemo(() => {
    const nameByKey = new Map<string, string>();
    for (const p of scoped) if (!nameByKey.has(p.securityKey)) nameByKey.set(p.securityKey, p.security);
    return bySecurity(scope === FAMILY ? scoped : dedupedPositions(scoped))
      .slice(0, 10)
      .map((b) => ({ ...b, name: nameByKey.get(b.key) ?? b.key }));
  }, [scoped, scope]);

  if (!portfolio) return null;
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const figs = PREVIEW_FIGS[scope] ?? FALLBACK;

  return (
    <div>
      <PageHeader
        eyebrow="Family Dashboard · Layer 6"
        title="Family Dashboard"
        subtitle="Net worth, portfolio, liquidity and buckets — for each family member and for the family as a whole."
        right={<BasisPill liveText="Portfolio value marked live" hint="Portfolio value, public/private split and top exposures are live from the book. Net worth, cash, liquidity, benchmark, charity and capital calls are illustrative placeholders." />}
      />

      {/* Member selector */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {[FAMILY, ...entities.map((e) => e.key)].map((m) => {
          const active = scope === m;
          return (
            <button key={m} onClick={() => setScope(m)}
              className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
                active ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {m}
            </button>
          );
        })}
      </div>

      {/* KPI strip — real + preview side by side, each labelled */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Portfolio value" value={money(mv)} sub={`${scoped.length} positions · live`} icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Net worth" {...previewTile(figs.networth, "incl. off-book assets")} icon={<Landmark className="h-4 w-4" />} />
        <StatTile label="Cash available" {...previewTile(figs.cash, "across bank accounts")} icon={<Droplets className="h-4 w-4" />} />
        <StatTile label="Liquidity coverage" {...previewTile(figs.liq, "of committed outflows")} icon={<Gauge className="h-4 w-4" />} />
        <StatTile
          label={scope === FAMILY ? "Return on cost" : "Annual return (XIRR)"}
          value={scope === FAMILY
            ? <span className={changeColor(retPct)}>{fmtPct(retPct, { sign: true })}</span>
            : xirr == null
              ? <span className="text-slate-500" title="No dated capital movements for this entity">—</span>
              : <span className={changeColor(xirr)}>{fmtPct(xirr, { sign: true })}</span>}
          sub={scope === FAMILY ? "holding-period, live" : xirr == null ? "not measurable" : "money-weighted"}
          icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Benchmark return" {...previewTile(figs.bench, "blended benchmark")} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* IPS buckets — preview (mapping is a family decision) */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><PieChart className="h-4 w-4 text-champagne-400" /> IPS buckets</span>}
          subtitle="Growth · Liquidity · Tactical · Hedge" right={<PreviewBadge />}>
          <ul className="space-y-2.5">
            {[
              { b: "Growth", w: "62%" }, { b: "Liquidity", w: "18%" }, { b: "Tactical", w: "12%" }, { b: "Hedge", w: "8%" },
            ].map((r) => (
              <li key={r.b}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-300">{r.b}</span><PreviewNum>{r.w}</PreviewNum>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-champagne-500/40" style={{ width: r.w }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">Bucket mapping is a family IPS decision, not a statement figure.</p>
        </Card>

        {/* Public vs private — real */}
        <Card title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-champagne-400" /> Public vs private</span>}
          subtitle="Live from the book" right={<Pill tone="info">live</Pill>}>
          <div className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-sm">
            <span className="text-slate-400">Public (listed)</span>
            <span className="mono text-slate-200">{money(mv)}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-400">Private markets</span>
            <AbsentCell reason="no private-market holding in this book — the ingested accounts are listed-equity PMS mandates and one AIF unit" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            The book carries no PE / VC / unlisted holding, so private shows absent rather than ₹0 — a zero would claim
            the family holds a private book worth nothing.
          </p>
        </Card>

        {/* Charity + capital calls — preview */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-champagne-400" /> Charity & commitments</span>} right={<PreviewBadge />}>
          <div className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-[12.5px]">
            <span className="text-slate-400">Charity pool</span><PreviewNum>{figs.charity}</PreviewNum>
          </div>
          <div className="flex items-center justify-between border-b border-ink-700/60 py-2.5 text-[12.5px]">
            <span className="flex items-center gap-1.5 text-slate-400"><PhoneCall className="h-3.5 w-3.5" /> Upcoming capital calls</span><PreviewNum>₹2.4 Cr</PreviewNum>
          </div>
          <div className="flex items-center justify-between py-2.5 text-[12.5px]">
            <span className="text-slate-400">Upcoming commitments</span><PreviewNum>₹5.0 Cr</PreviewNum>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* Top exposures — real */}
        <Card className="lg:col-span-2" title="Top 10 exposures" subtitle={`${scope} · live from the book`} right={<Pill tone="info">live</Pill>} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {topExposures.map((t) => (
                  <tr key={t.key} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={t.key} name={t.name} /></td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">{money(t.mv)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">{(t.weight * 100).toFixed(1)}%</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(t.returnPct)}`}>{fmtPct(t.returnPct, { sign: true })}</td>
                  </tr>
                ))}
                {topExposures.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">No holdings in scope.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Decisions required — preview */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-champagne-400" /> Decisions required</span>} right={<PreviewBadge />}>
          <ul className="space-y-2.5">
            {[
              { t: "Approve GLC Growth Fund top-up", tag: "Commitment" },
              { t: "Rebalance: Growth bucket over target", tag: "IPS" },
              { t: "Review FM change at Aristos", tag: "Manager" },
              { t: "Fund capital call due 20 Aug", tag: "Liquidity" },
            ].map((d) => (
              <li key={d.t} className="flex items-start justify-between gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                <span className="text-[12.5px] text-slate-300" title="Placeholder — not live data">{d.t}</span>
                <PreviewPill>{d.tag}</PreviewPill>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
