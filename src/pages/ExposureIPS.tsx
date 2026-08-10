import { useMemo, useRef, useState } from "react";
import {
  Scale, Target, Globe2, Layers, Clock, ScrollText, TrendingUp, TrendingDown, CalendarRange, Receipt, Download, Upload,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { PreviewBadge, PreviewNum, PreviewChart } from "@/components/Preview";
import { AbsentCell } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { bySector, bySecurity, consolidatedMarketValue, isPrivateClass, byAssetClass } from "@/lib/analytics";
import {
  IPS_BUCKETS, readFamilyInputs, writeFamilyInputs, ipsTargetTotal, pct,
  exportFamilyInputs, importFamilyInputs, type FamilyInputs, type IpsBucketKey,
} from "@/lib/familyInputs";
import { bucketActuals, bucketWeightPct } from "@/lib/alertEngine";
import { fmtPct, changeColor } from "@/lib/format";

// LAYER 3 — PORTFOLIO & EXPOSURE (FOOS spec). Family charter & IPS buckets, GAP
// analysis (actual vs desired), top holdings/sectors, MOM/QOQ/YOY movement and
// attribution, plus the monthwise capital-call & tax-liability chart.
//
// MIXED. Actual exposure, top-10 lists and attribution are LIVE from the book.
// Desired allocations, the family charter, the geography/market-cap/duration GAP
// and the monthwise projections are family decisions or need a valuation series —
// those render as clearly-marked PREVIEW.

// THERE IS NO DESIRED-WEIGHT TABLE HERE, AND THERE MUST NOT BE ONE.
//
// This held nine sector targets, with `?? 5` for anything unmatched, and the
// column beside it printed `gap = actual − desired` in percentage points. The
// actual side is real, measured off the family's own holdings; the desired side
// was typed into this file; and the GAP — the only figure a reader looks at, the
// one that says buy or sell — was arithmetic between the two.
//
// CLAUDE.md names this exact case in the list of things no current source can
// serve: the actuals are in the book, "the DESIRED allocations are a family
// decision nobody has supplied, and inventing a target weight would fabricate
// the entire gap". A greyed +6.7pp against Financial Services is not a shape,
// it is an instruction, and it was produced by subtracting a real number from an
// invented one.
//
// So the actual column stays live and the desired and gap columns render `—`
// with the reason. When the family records an IPS, one map here fills both.

export function ExposureIPS() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();

  const [inputs, setInputs] = useState<FamilyInputs>(() => readFamilyInputs());
  const save = (next: FamilyInputs) => setInputs(writeFamilyInputs(next));
  const fileRef = useRef<HTMLInputElement>(null);

  const totalMV = useMemo(() => consolidatedMarketValue(consolidated), [consolidated]);
  /** Asset classes actually in the book — what the family maps to IPS buckets. */
  const classes = useMemo(() => byAssetClass(consolidated), [consolidated]);
  const actuals = useMemo(
    () => (portfolio ? bucketActuals(portfolio, inputs) : null),
    [portfolio, inputs],
  );
  const targetTotal = ipsTargetTotal(inputs);
  // Sector GAP is a LISTED-equity view. An AIF/private holding is a fund wrapper
  // with no equity sector, so folding it in put 62% of the book under a single
  // "Unclassified" slice. The private book is named as excluded below.
  const listed = useMemo(() => consolidated.filter((x) => !isPrivateClass(x)), [consolidated]);
  const listedMV = useMemo(() => consolidatedMarketValue(listed), [listed]);
  const sectors = useMemo(() => bySector(listed), [listed]);
  const nameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) if (!m.has(p.securityKey)) m.set(p.securityKey, p.security);
    return m;
  }, [consolidated]);
  const topHoldings = useMemo(() => bySecurity(consolidated).slice(0, 10).map((b) => ({ ...b, name: nameByKey.get(b.key) ?? b.key })), [consolidated, nameByKey]);
  // costBasis / unrealizedPnL are nullable where no statement reported a cost;
  // a missing figure sorts as 0 (neutral) rather than distorting the ranking.
  const contributors = useMemo(() => [...consolidated].sort((a, b) => (b.unrealizedPnL ?? 0) - (a.unrealizedPnL ?? 0)).slice(0, 5), [consolidated]);
  const laggards = useMemo(() => [...consolidated].sort((a, b) => (a.unrealizedPnL ?? 0) - (b.unrealizedPnL ?? 0)).slice(0, 5), [consolidated]);

  if (!portfolio) return null;
  const money = (n: number | null, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  return (
    <div>
      <PageHeader
        eyebrow="Allocation · Layer 3"
        title="Exposure & IPS"
        subtitle="The family charter and IPS buckets, GAP analysis of actual vs desired exposure, top holdings and sectors, movement and attribution."
        right={<BasisPill liveText="Exposure marked live" hint="Actual exposure, top-10 lists and attribution are live. Desired weights, the charter, and the monthwise projections are illustrative." />}
      />

      {/* ── Family charter & IPS — the family's own decisions ─────────── */}
      <Card title={<span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-champagne-400" /> Family charter &amp; IPS buckets</span>}
        subtitle="The one-page IPS the whole book is measured against — recorded by the family, not read from a statement"
        right={
          <div className="flex items-center gap-1.5">
            <button onClick={() => exportFamilyInputs(inputs)}
              className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-700/60">
              <Download className="h-3 w-3" /> Export
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-700/60">
              <Upload className="h-3 w-3" /> Import
            </button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { try { setInputs(await importFamilyInputs(f)); } catch { /* malformed file */ } }
                e.target.value = "";
              }} />
          </div>
        }>
        <textarea
          value={inputs.charter}
          onChange={(e) => save({ ...inputs, charter: e.target.value })}
          rows={3}
          placeholder="Write the family's investment charter here — the principles every decision below is measured against."
          className="w-full rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2 text-[12.5px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />

        {/* Asset class -> bucket. Without this mapping no actual can be measured. */}
        <div className="mt-4">
          <div className="label-xs mb-1.5">Which IPS bucket does each asset class belong to?</div>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <label key={c.key} className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800/60 px-2.5 py-1.5">
                <span className="text-[12px] text-slate-300">{c.key}</span>
                <span className="text-[10px] text-slate-600">{money(c.mv)}</span>
                <select
                  value={inputs.bucketByAssetClass[c.key] ?? ""}
                  onChange={(e) => save({
                    ...inputs,
                    bucketByAssetClass: { ...inputs.bucketByAssetClass, [c.key]: (e.target.value || null) as IpsBucketKey | null },
                  })}
                  className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none">
                  <option value="">not mapped</option>
                  {IPS_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {/* The GAP itself — actual from the book, target from the family. */}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-2 py-2 text-left font-medium">Bucket</th>
                <th className="label-xs px-2 py-2 text-right font-medium">Actual %</th>
                <th className="label-xs px-2 py-2 text-right font-medium">Target %</th>
                <th className="label-xs px-2 py-2 text-right font-medium">Gap (pp)</th>
                <th className="label-xs px-2 py-2 text-left font-medium">What it is for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {IPS_BUCKETS.map((b) => {
                const actual = actuals ? bucketWeightPct(actuals, b.key) : null;
                const target = inputs.ipsTargets[b.key] ?? null;
                {/* THE GAP EXISTS ONLY WHEN BOTH SIDES DO. Either half missing and
                    this is a dash: a gap against a defaulted target is a
                    fabricated instruction to buy or sell. */}
                const gap = actual != null && target != null ? actual - target : null;
                return (
                  <tr key={b.key} className="hover:bg-ink-700/30">
                    <td className="px-2 py-2 font-medium text-slate-200">{b.label}</td>
                    <td className="px-2 py-2 text-right mono text-slate-300">
                      {actual == null
                        ? <AbsentCell reason={`No asset class is mapped to ${b.label}, so the book's actual weight in it cannot be measured.`} />
                        : `${actual.toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        inputMode="decimal"
                        value={target ?? ""}
                        placeholder="—"
                        onChange={(e) => save({ ...inputs, ipsTargets: { ...inputs.ipsTargets, [b.key]: pct(e.target.value) } })}
                        className="w-16 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-right mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                    </td>
                    <td className={`px-2 py-2 text-right mono ${gap == null ? "" : changeColor(gap)}`}>
                      {gap == null
                        ? <AbsentCell reason={target == null ? "No target weight recorded for this bucket — the gap is actual minus target, and half of it is missing." : `Nothing is mapped to ${b.label}, so there is no actual to compare.`} />
                        : `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}`}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-500">{b.hint}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
          {targetTotal == null
            ? <>No target weights recorded yet. Every gap stays absent until one is — a gap measured against a defaulted zero would read as an instruction to sell.</>
            : Math.abs(targetTotal - 100) > 0.5
              ? <><span className="font-medium text-amber-400">Targets sum to {targetTotal.toFixed(1)}%, not 100%.</span> Each gap is still that bucket&rsquo;s own actual minus its own target — they do not assume the rest.</>
              : <>Targets sum to 100%.</>}
          {actuals && actuals.unmappedValue > 0 && (
            <> {money(actuals.unmappedValue)} ({((actuals.unmappedValue / actuals.total) * 100).toFixed(0)}% of the book) sits in{" "}
              <span className="font-medium text-slate-400">{actuals.unmappedClasses.join(", ")}</span>, mapped to no bucket — so the actual column is a partial view until it is.</>
          )}
          {" "}These are the family&rsquo;s own entries and live in this browser only. <span className="font-medium text-slate-400">Export</span> writes them to a JSON file you can back up, share and re-import; a shared always-on view would need a server-side store.
        </p>
      </Card>

      {/* GAP analysis by sector — actual real, desired preview */}
      <Card className="mt-5" title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-champagne-400" /> GAP analysis — by sector</span>}
        subtitle="Actual weight is live from the book; the desired weight is a family IPS decision, and none has been recorded" right={<Pill tone="info">actual live · desired yours</Pill>} pad={false}>
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
              {sectors.slice(0, 12).map((s) => (
                <tr key={s.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 font-medium text-slate-200">{s.key}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-300">{money(s.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{(s.weight * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right">
                    <input inputMode="decimal" value={inputs.sectorTargets[s.key] ?? ""} placeholder="—"
                      onChange={(e) => save({ ...inputs, sectorTargets: { ...inputs.sectorTargets, [s.key]: pct(e.target.value) } })}
                      className="w-16 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-right mono text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none" />
                  </td>
                  <td className="px-4 py-2.5 text-right mono">
                    {(() => {
                      const t = inputs.sectorTargets[s.key] ?? null;
                      const gap = t == null ? null : s.weight * 100 - t;
                      return gap == null
                        ? <AbsentCell reason="the gap is actual minus desired, and no desired weight is recorded for this sector" />
                        : <span className={changeColor(gap)}>{gap >= 0 ? "+" : ""}{gap.toFixed(1)}</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          Sectors cover the <span className="font-medium text-slate-400">listed book</span> ({money(listedMV)}); the
          private book ({money(totalMV - listedMV)} of AIF units) carries no equity sector and is excluded here rather
          than shown as one large "Unclassified" slice. The GAP also spans geography, market-cap, duration, tangible vs
          intangible, entity and advisor allocation — actuals for those need a look-through the book does not yet carry,
          so they are previewed below.
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
