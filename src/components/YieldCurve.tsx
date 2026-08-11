import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { AbsentSection } from "@/components/Absent";
import { fetchSeriesPoints, type Point, type SeriesEntry } from "@/lib/series";

// THE YIELD CURVE — the spec asks for it twice, under Government Bonds and
// again under Credit Markets.
//
// A curve is a different shape of question from everything else on this page:
// the other charts plot ONE instrument across TIME, and this plots MANY
// instruments at ONE MOMENT, with maturity on the x-axis. That is why it needs
// its own component rather than another call to `SeriesChart`.
//
// IT IS BUILT ONLY FROM TENORS THE STORE ACTUALLY HOLDS. Four US Treasury
// points are harvested — 13-week, 5-year, 10-year and 30-year — and those four
// are what is drawn. The 2-year, which the classic 10Y–2Y spread needs, is not
// carried by any series here, so that spread is NOT shown and is named as
// absent instead. Interpolating a 2-year off the neighbouring points would
// produce a yield nobody quoted, sitting on a chart of quoted yields.
//
// EVERY POINT IS AN OBSERVATION ON OR BEFORE THE DATE, NEVER AFTER. Tenors
// settle on slightly different days — a holiday closes one market and not
// another — so each is read at the last observation at or before the chosen
// date. Reading forward would put tomorrow's yield on today's curve.

/** Maturity in years, for the x-axis. Only tenors the store carries appear. */
const TENORS: { id: string; years: number; label: string }[] = [
  { id: "us-3m", years: 0.25, label: "3M" },
  { id: "us-5y", years: 5, label: "5Y" },
  { id: "us-10y", years: 10, label: "10Y" },
  { id: "us-30y", years: 30, label: "30Y" },
];

/** The last observation at or before `iso`, or null when the series starts later. */
function at(points: Point[], iso: string): number | null {
  let out: number | null = null;
  for (const p of points) {
    if (p.t > iso) break;
    out = p.v;
  }
  return out;
}

const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

export function YieldCurve({ index }: { index: SeriesEntry[] }) {
  const available = useMemo(
    () => TENORS.map((t) => ({ ...t, meta: index.find((s) => s.id === t.id) })).filter((t) => t.meta),
    [index],
  );
  const [points, setPoints] = useState<Record<string, Point[]>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!available.length) return;
    let alive = true;
    setBusy(true);
    // A curve needs about a year of history to draw the comparison line, and
    // no more — the year chunks make that a small fetch.
    Promise.all(available.map(async (t) => [t.id, await fetchSeriesPoints(t.meta!, new Date().getUTCFullYear() - 1)] as const))
      .then((pairs) => { if (alive) { setPoints(Object.fromEntries(pairs)); setBusy(false); } });
    return () => { alive = false; };
  }, [available]);

  const { rows, asOf, priorDate, missing } = useMemo(() => {
    const loaded = available.filter((t) => (points[t.id] ?? []).length);
    if (!loaded.length) return { rows: [], asOf: null as string | null, priorDate: null as string | null, missing: [] as string[] };

    // THE CURVE CLOSES ON THE OLDEST OF THE TENORS' NEWEST DATES. Taking the
    // newest date overall would read one tenor today and the others at
    // whatever they last printed, which is a curve assembled from different
    // days wearing one date.
    const asOfDate = loaded
      .map((t) => points[t.id][points[t.id].length - 1].t)
      .sort()[0];
    const prior = shift(asOfDate, 365);

    const out = loaded.map((t) => ({
      label: t.label,
      years: t.years,
      now: at(points[t.id], asOfDate),
      then: at(points[t.id], prior),
    }));
    return {
      rows: out,
      asOf: asOfDate,
      priorDate: prior,
      missing: available.filter((t) => !(points[t.id] ?? []).length).map((t) => t.label),
    };
  }, [available, points]);

  if (!available.length) {
    return (
      <AbsentSection
        what="No benchmark yields are stored"
        needs="The curve is drawn from harvested Treasury tenors. None is in the series store, so there is nothing to plot." />
    );
  }
  if (busy && !rows.length) {
    return <div className="grid h-[300px] place-items-center text-[12px] text-slate-500">Loading tenors…</div>;
  }
  if (!rows.length) {
    return (
      <AbsentSection
        what="The stored tenors carry no observations in this window"
        needs="Each tenor's own year chunk returned nothing. The harvest report says when each was last measured." />
    );
  }

  const nowLine = rows.filter((r) => r.now != null);
  const thenLine = rows.filter((r) => r.then != null);
  // 10Y minus 3M, LABELLED AS SUCH. The spread a reader most often wants is
  // 10Y–2Y, and the 2-year is not stored — so this is the one that can be
  // computed from what exists, and it is named rather than passed off as the
  // other. Both are recession indicators and they are not the same number.
  const y10 = rows.find((r) => r.label === "10Y")?.now ?? null;
  const m3 = rows.find((r) => r.label === "3M")?.now ?? null;
  const spread = y10 != null && m3 != null ? y10 - m3 : null;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--chart-axis)" }} width={52}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(2)}%`}
            domain={["auto", "auto"]} />
          <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
            formatter={(v: number | string) => (typeof v === "number" ? `${v.toFixed(3)}%` : "—")} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {thenLine.length > 1 && (
            <Line type="monotone" dataKey="then" name={`A year earlier (${priorDate})`}
              stroke={CHART_COLORS[1]} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2.5 }} />
          )}
          <Line type="monotone" dataKey="now" name={`Current (${asOf})`}
            stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3.5 }} />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px]">
        <span className="text-slate-400">
          10Y − 3M{" "}
          {spread == null ? <span className="text-slate-500">—</span> : (
            <span className={spread < 0 ? "text-rose-400" : "text-emerald-400"}>
              {spread >= 0 ? "+" : ""}{(spread * 100).toFixed(0)} bp
            </span>
          )}
          {spread != null && spread < 0 && <span className="ml-1 text-rose-400">· inverted</span>}
        </span>
        <span className="text-slate-500">{nowLine.length} of {TENORS.length} tenors stored</span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Built from the {nowLine.length} Treasury tenors in the series store, each read at its last observation
        <span className="text-slate-400"> on or before {asOf}</span> — tenors settle on slightly different days, and
        reading forward would put a later yield on this date's curve. The curve closes on the
        <span className="text-slate-400"> oldest</span> of the tenors' newest dates, so every point is from the same day.
        {" "}The <span className="text-slate-400">2-year is not carried</span> by any series here, so the classic
        10Y–2Y spread is not shown; the spread above is 10Y–3M and is labelled as that, because the two are different
        numbers and interpolating a 2-year off its neighbours would put a yield nobody quoted on a chart of quoted ones.
        {missing.length > 0 && <> {missing.join(", ")} returned no observations in this window.</>}
      </p>
    </div>
  );
}
