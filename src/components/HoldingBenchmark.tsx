// ── THE INDEX LINE UNDER A HOLDING'S RETURN (Stage 10kd) ────────────────────
//
// One line, inside the return cell it qualifies, never a column of its own:
// the index the holding is compared with (`holdingBenchmark.ts`) and that
// index's return on the same dated money, struck with the measure the cell
// shows. The hover names the index, why it was chosen, and the dates and
// payments it was bought with.
import { useEffect, useMemo, useState } from "react";
import { AbsentCell } from "@/components/Absent";
import { BENCHMARKS, benchmarkIdentity, benchmarkMismatchReason, type BenchmarkKey } from "@/lib/benchmarks";
import { BENCH_SHORT, benchGapLabel, type HoldingBenchmark, type IndexFigure } from "@/lib/holdingBenchmark";
import { closeOnOrBefore, fetchPriceHistory, priceErrorReason, settledPriceHistory, type PriceResult } from "@/lib/prices";
import type { IndexLevel } from "@/lib/periodReturns";
import { fmtPct } from "@/lib/format";

/** `pending`: the closes are still loading, not a failure (Stage 10mr). */
export type BenchLevels = (key: BenchmarkKey) => { level: IndexLevel } | { reason: string; pending?: true };

/**
 * Every index the table needs, each fetched once through the NAV card's own
 * pipe and drawn only after the upstream names it (`benchmarkIdentity`).
 */
export function useBenchmarkLevels(keys: readonly BenchmarkKey[]): BenchLevels {
  const wanted = useMemo(() => BENCHMARKS.filter((b) => keys.includes(b.key)), [keys.join("|")]);
  const [hist, setHist] = useState<Partial<Record<BenchmarkKey, PriceResult>>>(() =>
    Object.fromEntries(wanted.map((b) => [b.key, settledPriceHistory(b.symbol)]).filter(([, h]) => h)));
  useEffect(() => {
    let live = true;
    for (const b of wanted) {
      void fetchPriceHistory(b.symbol).then((r) => { if (live) setHist((h) => (h[b.key] === r ? h : { ...h, [b.key]: r })); });
    }
    return () => { live = false; };
  }, [wanted]);
  return useMemo<BenchLevels>(() => {
    const cache = new Map<BenchmarkKey, { level: IndexLevel } | { reason: string; pending?: true }>();
    return (key) => {
      let hit = cache.get(key);
      if (hit) return hit;
      const b = BENCHMARKS.find((x) => x.key === key)!, h = hist[key];
      if (!h) hit = { reason: `Fetching the ${b.name} closes`, pending: true };
      else if (!h.ok) hit = { reason: priceErrorReason(h, true) };
      else {
        const id = benchmarkIdentity(h, b);
        hit = id.ok ? { level: (d: string) => closeOnOrBefore(h, d)?.value ?? null } : { reason: benchmarkMismatchReason(b, id.reportedName) };
      }
      cache.set(key, hit);
      return hit;
    };
  }, [hist]);
}

const PRICE_BASIS = "A price index: dividends are not in it.";

/**
 * The line itself. `inline-block w-full` puts it under the figure without a
 * line break in the cell's text, which the page sweep reads row by row.
 */
export function BenchLine({ hb, fig, holdingPct }: { hb: HoldingBenchmark; fig: IndexFigure | null; holdingPct: number | null }) {
  if (!hb.bench) {
    return <span data-bench="none" title={hb.why} className="inline-block w-full whitespace-nowrap text-[10px] leading-tight text-slate-500">no index</span>;
  }
  const b = hb.bench;
  const gap = fig?.shown && holdingPct != null ? holdingPct - fig.pct : null;
  const title = [`${b.name}. ${hb.why}`,
    fig?.shown ? `${fig.how} ${PRICE_BASIS}` : fig ? `No index figure: ${fig.reason}.` : null,
    gap != null ? `The holding ${gap >= 0 ? "is ahead of" : "trails"} it by ${Math.abs(gap).toFixed(1)} percentage points.` : null,
  ].filter(Boolean).join(" ");
  return (
    <span data-bench={b.key} data-bench-pct={fig?.shown ? fig.pct : ""} data-bench-from={fig?.shown ? fig.from : undefined}
      data-bench-to={fig?.shown ? fig.to : undefined} data-bench-annual={fig?.shown && fig.annual ? "true" : undefined} data-bench-feed={fig && !fig.shown && fig.feed ? "" : undefined}
      title={title} className="inline-block w-full whitespace-nowrap text-[10px] leading-tight text-slate-500">
      {BENCH_SHORT[b.key]}{" "}
      {/* A gap in the record names its cause in a few words, as the return cell
          above does; the feed's own state keeps the plain dash (Stage 10lc). */}
      {fig?.shown ? <span className="mono">{fmtPct(fig.pct, { sign: true, decimals: 1 })}</span>
        : <AbsentCell reason={fig?.reason} label={fig && !fig.feed ? benchGapLabel(fig.reason) : undefined} />}
    </span>
  );
}
