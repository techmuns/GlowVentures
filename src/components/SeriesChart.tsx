import { useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ScatterChart, Scatter,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { fmtLevel, rebase, type Point, type SeriesMeta } from "@/lib/series";

// THE CHART THE SPEC ASKS FOR, ON A REAL SERIES.
//
// "Interactive price charts · historical time-series · multiple chart types
// (line, bar, area, scatter) · overlay multiple datasets on a single chart ·
// adjustable time periods" — all of it needs a stored series, which is why this
// component reads `public/series/` rather than a quote endpoint.
//
// OVERLAYING SERIES WITH DIFFERENT UNITS IS REBASED, AND SAYS SO.
// Brent is $/bbl, the Nifty is index points, USD/INR is a ratio. Drawing them on
// one linear axis makes the largest number the only visible line and invites a
// reader to compare a level against a level that has no relationship to it. When
// more than one unit is on screen the chart rebases every series to 100 at the
// start of the window — a presentation transform, labelled on the axis and in
// the caption, never silently applied to a single-series level chart.

export type ChartType = "line" | "area" | "bar" | "scatter";

export type ChartSeries = { meta: SeriesMeta; points: Point[] };

export function SeriesChart({
  series, type = "line", height = 320, forceRebase,
}: {
  series: ChartSeries[];
  type?: ChartType;
  height?: number;
  /** Override the automatic rule (used by the compare view's explicit toggle). */
  forceRebase?: boolean;
}) {
  const units = useMemo(() => new Set(series.map((s) => s.meta.unit)), [series]);
  const rebased = forceRebase ?? (units.size > 1 && series.length > 1);

  // One row per date across every series, so recharts can align them.
  const { rows, keys } = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    const ks: { key: string; label: string; color: string }[] = [];
    series.forEach((s, i) => {
      const key = s.meta.id;
      ks.push({ key, label: s.meta.label, color: CHART_COLORS[i % CHART_COLORS.length] });
      const pts = rebased ? rebase(s.points) : s.points;
      for (const p of pts) {
        const row = byDate.get(p.t) ?? { t: p.t };
        row[key] = p.v;
        byDate.set(p.t, row);
      }
    });
    return {
      rows: [...byDate.values()].sort((a, b) => (String(a.t) < String(b.t) ? -1 : 1)),
      keys: ks,
    };
  }, [series, rebased]);

  if (!rows.length) return null;

  const unit = rebased ? "index" : series[0]?.meta.unit ?? "";
  const spanDays = rows.length ? (Date.parse(String(rows[rows.length - 1].t)) - Date.parse(String(rows[0].t))) / 86400000 : 0;

  /**
   * TICKS ARE CHOSEN, NOT FORMATTED INTO SUBMISSION.
   *
   * Letting recharts place ticks and then shortening each to its year prints
   * "2021 2021 2022 2022 2022" — several ticks land inside one year and all
   * format to the same label. So one tick is emitted per period (year, quarter
   * or month depending on the span), taken from the first observation in that
   * period, and then strided down to at most twelve so a decade of daily data
   * does not crowd the axis.
   */
  const { ticks, tickFmt } = useMemo(() => {
    const period = spanDays > 365 * 3 ? "year" : spanDays > 200 ? "quarter" : spanDays > 60 ? "month" : "none";
    if (period === "none") {
      return { ticks: undefined as string[] | undefined, tickFmt: (t: string) => t.slice(5) };
    }
    const keyOf = (t: string) =>
      period === "year" ? t.slice(0, 4)
        : period === "quarter" ? `${t.slice(0, 4)}Q${Math.floor(Number(t.slice(5, 7)) / 3.01) + 1}`
          : t.slice(0, 7);
    const firsts: string[] = [];
    let last = "";
    for (const r of rows) {
      const t = String(r.t);
      const k = keyOf(t);
      if (k !== last) { firsts.push(t); last = k; }
    }
    const stride = Math.max(1, Math.ceil(firsts.length / 12));
    return {
      ticks: firsts.filter((_, i) => i % stride === 0),
      tickFmt: (t: string) => (period === "year" ? t.slice(0, 4) : t.slice(0, 7)),
    };
  }, [rows, spanDays]);

  const axisFmt = (v: number) =>
    Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v) >= 1 ? v.toFixed(Math.abs(v) >= 100 ? 0 : 1) : v.toFixed(3);

  const common = (
    <>
      <CartesianGrid stroke="var(--chart-grid, #2b2668)" strokeDasharray="2 4" vertical={false} />
      <XAxis dataKey="t" stroke="#6b6880" fontSize={11} tickFormatter={tickFmt} ticks={ticks} minTickGap={20} />
      <YAxis stroke="#6b6880" fontSize={11} tickFormatter={axisFmt} width={64} domain={["auto", "auto"]} />
      <Tooltip
        contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
        formatter={(v: number, name: string) => [rebased ? v.toFixed(1) : fmtLevel(v, unit), name]}
      />
      {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
    </>
  );

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "area" ? (
          <AreaChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {keys.map((k) => (
                <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={k.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {common}
            {keys.map((k) => (
              <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color}
                strokeWidth={1.8} fill={`url(#g-${k.key})`} dot={false} connectNulls />
            ))}
          </AreaChart>
        ) : type === "bar" ? (
          <BarChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            {common}
            {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color} />)}
          </BarChart>
        ) : type === "scatter" ? (
          <ScatterChart margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            {common}
            {keys.map((k) => <Scatter key={k.key} data={rows} dataKey={k.key} name={k.label} fill={k.color} />)}
          </ScatterChart>
        ) : (
          <LineChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            {common}
            {keys.map((k) => (
              <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color}
                strokeWidth={1.8} dot={false} connectNulls />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
      {rebased && (
        <p className="mt-1.5 text-[11px] text-slate-500">
          Rebased to 100 at the start of the window — these series are quoted in different units
          ({[...units].join(", ")}), so levels are not comparable and only their paths are.
        </p>
      )}
    </div>
  );
}
