import { useEffect, useMemo, useState } from "react";
import { LineChart as LineIcon, AreaChart as AreaIcon, BarChart3 } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection } from "@/components/Absent";
import { SeriesChart, type ChartType } from "@/components/SeriesChart";
import { changeColor } from "@/lib/format";
import { fetchPriceHistory, toPoints, priceErrorReason, type PriceHistory } from "@/lib/prices";
import { HORIZON_COLS, RANGES, fmtLevel, fmtReturn, type RangeKey, type SeriesMeta, type Point } from "@/lib/series";

// THE SPEC'S RETURNS TABLE AND PRICE CHART, for one security.
//
//   1 Day · 1 Week · 1 Month · 3M · 6M · QTD · YTD · 1 Year · 3 / 5 / 10 Year
//   CAGR · Max available CAGR · 52-week high and low
//
// WHAT CHANGED, AND WHY THE CHART EXISTS NOW
// ──────────────────────────────────────────
// This card used to say a chart was impossible, and it was right at the time:
// the muns `market_data` endpoint returns a four-row PREVIEW of any window and
// never the series, so the table was assembled from ten separate lookups and
// there was nothing to plot. `/api/prices` returns the whole daily history in
// one call — Aurobindo comes back with 7,672 closes from 1996 — so the chart the
// spec asks for is now drawn from real closes, and the max-available CAGR is
// measured from the security's actual first trading day rather than a guess.
//
// EVERY HORIZON IS STILL INDEPENDENT. A horizon the listing does not reach back
// to renders `—`, never a nearer date silently relabelled: a company listed in
// 2023 has no 10-year CAGR, and showing its since-listing return in that column
// would be a different measurement wearing the wrong name. The rule is enforced
// once, in `shared/seriesReturns.mjs`, shared with the macro harvester.

const CHART_TYPES: { key: ChartType; icon: typeof LineIcon; label: string }[] = [
  { key: "line", icon: LineIcon, label: "Line" },
  { key: "area", icon: AreaIcon, label: "Area" },
  { key: "bar", icon: BarChart3, label: "Bar" },
];

export function ReturnsTable({ ticker, name }: {
  /** NSE symbol. Null when the security has none — the card says so. */
  ticker: string | null;
  /** Display name, for the chart legend. */
  name: string;
}) {
  const [data, setData] = useState<PriceHistory | { ok: false; reason: string } | null | undefined>(undefined);
  const [range, setRange] = useState<RangeKey>("5Y");
  const [chartType, setChartType] = useState<ChartType>("area");

  useEffect(() => {
    let alive = true;
    setData(undefined);
    if (!ticker) { setData(null); return; }
    fetchPriceHistory(ticker).then((r) => { if (alive) setData(r); });
    return () => { alive = false; };
  }, [ticker]);

  const live = data && data.ok ? data : null;

  // A synthetic meta so the shared chart component can render this the same way
  // it renders a macro series — one chart implementation, not two.
  const meta: SeriesMeta | null = useMemo(() => live && ({
    id: live.symbol, label: name, category: "company", group: "",
    unit: live.currency === "INR" ? "INR" : live.currency ?? "index",
    kind: "price", frequency: "daily", provenance: "official-api",
    source: { name: live.source, symbol: live.symbol, url: `https://finance.yahoo.com/quote/${encodeURIComponent(live.symbol)}`, exchange: live.exchange, upstreamCurrency: live.currency },
    note: null, first: live.first, last: live.last, count: live.count,
    retrievedAt: "", staleSince: null,
  }), [live, name]);

  const points: Point[] = useMemo(() => {
    if (!live || !meta) return [];
    const all = toPoints(live);
    const days = RANGES.find((r) => r.key === range)?.days;
    if (days == null) return all;
    const cutoff = Date.parse(live.last + "T00:00:00Z") - days * 86400000;
    return all.filter((p) => Date.parse(p.t + "T00:00:00Z") >= cutoff);
  }, [live, meta, range]);

  if (data === undefined) {
    return <Card className="mt-5" title="Price history & returns" subtitle="Loading closes…"><div className="h-56" /></Card>;
  }

  if (!live) {
    const reason = priceErrorReason(
      (data as { ok: false; reason: string }) ?? { ok: false, reason: "no symbol" },
      !!ticker,
    );
    return (
      <Card className="mt-5" title="Price history & returns">
        <AbsentSection what="No price history for this security" needs={reason} />
      </Card>
    );
  }

  const unit = meta!.unit;

  return (
    <Card className="mt-5"
      title="Price history & returns"
      subtitle={`${live.count.toLocaleString()} daily closes from ${live.first} · ${live.source} (${live.symbol})${live.exchange ? ` · ${live.exchange}` : ""}`}
      right={
        <div className="flex flex-wrap items-center gap-1">
          {CHART_TYPES.map((t) => (
            <button key={t.key} onClick={() => setChartType(t.key)} title={t.label}
              className={`rounded-md border px-2 py-1 transition-colors ${chartType === t.key
                ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400"
                : "border-ink-700 bg-ink-800 text-slate-400 hover:bg-ink-700/60"}`}>
              <t.icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-ink-700" />
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${range === r.key
                ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400"
                : "border-ink-700 bg-ink-800 text-slate-400 hover:bg-ink-700/60"}`}>
              {r.label}
            </button>
          ))}
        </div>
      }>
      {points.length > 1
        ? <SeriesChart series={[{ meta: meta!, points }]} type={chartType} height={260} />
        : <div className="grid h-[260px] place-items-center text-[12px] text-slate-500">Not enough closes in this window to draw a chart.</div>}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full whitespace-nowrap text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-700">
              {HORIZON_COLS.map((c) => (
                <th key={c.key} className="label-xs px-3 py-2 text-right font-medium"
                  title={c.annualised ? `${c.label} compound annual growth rate` : `${c.label} return`}>
                  {c.label}{c.annualised ? "*" : ""}
                </th>
              ))}
              <th className="label-xs px-3 py-2 text-right font-medium">52W High</th>
              <th className="label-xs px-3 py-2 text-right font-medium">52W Low</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {HORIZON_COLS.map((c) => {
                const v = live.returns[c.key];
                const span = live.spans[c.key];
                return (
                  <td key={c.key} className={`px-3 py-2.5 text-right mono ${v == null ? "text-slate-600" : changeColor(v)}`}
                    title={span ? `${span[0]} → ${span[1]}` : "This listing does not reach back that far, so the horizon is absent rather than measured over a shorter window."}>
                    {fmtReturn(v, "price")}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-right mono text-slate-300">{fmtLevel(live.high52, unit)}</td>
              <td className="px-3 py-2.5 text-right mono text-slate-300">{fmtLevel(live.low52, unit)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
        <span className="font-medium text-slate-400">*</span> 3Y/5Y/10Y/Max are annualised (CAGR); the shorter horizons
        are cumulative. Measured on settled closes only, to{" "}
        <span className="text-slate-400">{live.last}</span> — today's in-progress move is not in these figures, and the
        live price above is a separate measurement.{" "}
        <span className="font-medium text-slate-400">Every horizon is independent</span>: a cell is{" "}
        <span className="mono">—</span> when this listing does not reach back that far, never a shorter window
        relabelled, so a company listed in 2023 shows no 10-year CAGR and an honest max from its first trading day
        ({live.first}).
      </p>
    </Card>
  );
}
