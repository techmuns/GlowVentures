import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Fuel, LineChart as LineIcon, DollarSign, CalendarClock, Download, Percent, BarChart3, AreaChart as AreaIcon, ScatterChart as ScatterIcon, Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { ViewToggle, type ViewDef } from "@/components/ViewToggle";
import { PreviewBadge } from "@/components/Preview";
import { AbsentSection } from "@/components/Absent";
import { SeriesChart, type ChartType, type ChartSeries } from "@/components/SeriesChart";
import { YieldCurve } from "@/components/YieldCurve";
import { exportChartPng, exportCsv } from "@/lib/exportChart";
import {
  fetchSeriesIndex, fetchSeriesPoints, sliceRange, yearForRange, groupBy,
  resample, availableFrequencies, FREQ_LABEL, type Frequency,
  fmtLevel, fmtReturn, returnTone, HORIZON_COLS, RANGES,
  type SeriesIndex, type SeriesEntry, type Point, type RangeKey,
} from "@/lib/series";

// LAYER 2 · A. MACRO RESEARCH (FOOS spec) — Commodities, Global Equity Indices,
// Currencies, and as much of Fixed Income as a free daily feed reaches.
//
// EVERY FIGURE ON THIS PAGE COMES FROM A STORED SERIES, not from a quote call.
// `public/series/` is harvested nightly by `npm run harvest` and committed, so
// the returns table is computed against the full history (the S&P's runs to
// 14,000 daily closes from 1970) rather than against whatever a live endpoint
// happens to return. That is what makes a 10-year CAGR, a max-available CAGR and
// an interactive chart possible at all — the muns `market_data` endpoint returns
// a four-row preview of any window and cannot answer them.
//
// A SERIES THE SPEC ASKS FOR AND NOTHING SERVES IS NAMED, NOT DRAWN. Thermal
// coal, iron ore, the LME metals, palm oil, rubber, the CRB and the Baltic Dry
// have no free daily feed; they are listed at the bottom with the reason and the
// phase that will fill them, rather than shown as an illustrative number.

type View = "commodities" | "indices" | "currencies" | "rates";

const VIEWS: ViewDef<View>[] = [
  { key: "commodities", label: "Commodities", icon: Fuel },
  { key: "indices", label: "Global Indices", icon: LineIcon },
  { key: "currencies", label: "Currencies", icon: DollarSign },
  { key: "rates", label: "Rates & Bonds", icon: Percent },
];

const CHART_TYPES: { key: ChartType; label: string; icon: typeof LineIcon }[] = [
  { key: "line", label: "Line", icon: LineIcon },
  { key: "area", label: "Area", icon: AreaIcon },
  { key: "bar", label: "Bar", icon: BarChart3 },
  { key: "scatter", label: "Scatter", icon: ScatterIcon },
];

const MAX_COMPARE = 6;

export function MacroResearch() {
  const [view, setView] = useState<View>("commodities");
  const [index, setIndex] = useState<SeriesIndex | null | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [range, setRange] = useState<RangeKey>("5Y");
  const [chartType, setChartType] = useState<ChartType>("line");
  // The spec's "daily / weekly / monthly / quarterly / year-end" view. Stored
  // series keep their native frequency; this only ever coarsens.
  const [freq, setFreq] = useState<Frequency>("daily");
  const chartRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Record<string, Point[]>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSeriesIndex().then((i) => { if (alive) setIndex(i); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(
    () => (index?.series ?? []).filter((s) => s.category === view),
    [index, view],
  );
  const absentRows = useMemo(
    () => (index?.absent ?? []).filter((s) => s.category === view),
    [index, view],
  );

  // Default the chart to the first series of whichever tab is open.
  useEffect(() => {
    if (rows.length && !rows.some((r) => selected.includes(r.id))) setSelected([rows[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rows.length]);

  const chosen = useMemo(
    () => (index?.series ?? []).filter((s) => selected.includes(s.id)),
    [index, selected],
  );

  // Load only the year chunks the chosen range needs — a 1-year window on a
  // 26-year series fetches one file, not the whole history.
  useEffect(() => {
    let alive = true;
    const missing = chosen.filter((s) => !points[`${s.id}@${range}`]);
    if (!missing.length) return;
    setBusy(true);
    Promise.all(missing.map(async (s) => {
      const pts = await fetchSeriesPoints(s, yearForRange(s, range));
      return [`${s.id}@${range}`, sliceRange(pts, s, range)] as const;
    })).then((pairs) => {
      if (!alive) return;
      setPoints((p) => ({ ...p, ...Object.fromEntries(pairs) }));
      setBusy(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, range]);

  // FREQUENCIES OFFERED ARE THE INTERSECTION ACROSS THE OVERLAY. Comparing a
  // daily index against a monthly commodity, the finest HONEST shared view is
  // monthly: showing the pair "weekly" would have to invent weekly readings for
  // the monthly one. So the toggle offers only what every chosen series can
  // actually be resampled to.
  const freqOptions: Frequency[] = useMemo(() => {
    if (!chosen.length) return ["daily"];
    const sets = chosen.map((s) => new Set(availableFrequencies(s.frequency)));
    return (["daily", "weekly", "monthly", "quarterly", "annual"] as Frequency[])
      .filter((f) => sets.every((set) => set.has(f)));
  }, [chosen]);

  // Keep the selection legal when the overlay changes under it.
  useEffect(() => {
    if (freqOptions.length && !freqOptions.includes(freq)) setFreq(freqOptions[0]);
  }, [freqOptions, freq]);

  const resampled = chosen
    .map((s) => {
      const raw = points[`${s.id}@${range}`] ?? [];
      const r = resample(raw, s.frequency, freq);
      return { meta: s, points: r.points, lastBucketOpen: r.lastBucketOpen };
    })
    .filter((s) => s.points.length > 0);

  const chartSeries: ChartSeries[] = resampled.map(({ meta, points: pts }) => ({ meta, points: pts }));
  const anyOpenBucket = resampled.some((s) => s.lastBucketOpen);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? (prev.length === 1 ? prev : prev.filter((x) => x !== id))
        : prev.length >= MAX_COMPARE ? [...prev.slice(1), id] : [...prev, id]);

  // PNG of the chart as drawn, with its own caption band — see exportChart.ts
  // for why an exported chart has to carry its title, unit, source and date.
  async function onExportPng() {
    if (!chartSeries.length) return;
    const one = chosen.length === 1 ? chosen[0] : null;
    await exportChartPng(chartRef.current, {
      title: one ? one.label : `${chosen.length} series compared`,
      subtitle: one
        ? `${one.unit} · ${one.source.name} (${one.source.symbol})`
        : chosen.map((c) => c.label).join(" · "),
      footer: `${FREQ_LABEL[freq]} · ${range} window · from the committed series store · exported ${new Date().toISOString().slice(0, 10)}`,
    });
  }

  // CSV of exactly what the chart is drawing, at the frequency on screen.
  function onExportCsv() {
    if (!chartSeries.length) return;
    const dates = [...new Set(chartSeries.flatMap((s) => s.points.map((p) => p.t)))].sort();
    const byId = chartSeries.map((s) => [s.meta.id, new Map(s.points.map((p) => [p.t, p.v]))] as const);
    exportCsv(
      `glow_series_${freq}_${range}_${new Date().toISOString().slice(0, 10)}.csv`,
      ["date", ...chartSeries.map((s) => `${s.meta.label} (${s.meta.unit})`)],
      // A date a series has no observation for stays EMPTY, never 0 — these
      // series settle on different calendars and a zero would be read as a
      // measurement of nothing.
      dates.map((d) => [d, ...byId.map(([, m]) => m.get(d) ?? null)]),
    );
  }

  async function onExport() {
    if (!index) return;
    const pointsById: Record<string, Point[]> = {};
    // Export the observations behind the chart, so every figure in the returns
    // sheet can be rebuilt from the sheet next to it.
    // ExcelJS is ~940 KB and is loaded ONLY when someone actually exports —
    // importing it at module scope puts it in the main bundle for every page.
    const [{ exportSeriesExcel }] = await Promise.all([
      import("@/lib/exportSeries"),
      ...rows.map(async (s) => {
        pointsById[s.id] = points[`${s.id}@${range}`]
          ?? await fetchSeriesPoints(s, yearForRange(s, range)).then((p) => sliceRange(p, s, range));
      }),
    ]);
    await exportSeriesExcel(rows, pointsById, { fileLabel: `macro_${view}`, generatedAt: index.generatedAt });
  }

  if (index === undefined) {
    return (
      <div>
        <PageHeader eyebrow="Research · Layer 2A" title="Macro Research" subtitle="Loading the series store…" />
      </div>
    );
  }

  if (index === null) {
    return (
      <div>
        <PageHeader eyebrow="Research · Layer 2A" title="Macro Research" />
        <AbsentSection
          what="The series store did not respond"
          needs="Every figure on this page is read from public/series/, which is committed to the repository and served statically. If this persists the deployment is incomplete rather than the data being missing — nothing here depends on a live API or a token." />
      </div>
    );
  }

  const asOf = rows.length ? rows.map((r) => r.last).sort().slice(-1)[0] : null;
  const totalPoints = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2A"
        title="Macro Research"
        subtitle="Historical prices, returns and comparison for commodities, global equity indices, currencies and benchmark yields — every figure computed from a stored daily series."
        right={<div className="flex items-center gap-2">
          <Pill tone="gain">{rows.length} live</Pill>
          <Pill tone="info">{totalPoints.toLocaleString()} observations</Pill>
        </div>} />

      <p className="mb-5 text-[12px] leading-relaxed text-slate-500">
        Levels, the full returns table, the 52-week range and every chart are computed from
        daily closes stored under <span className="mono text-slate-400">public/series/</span>, harvested from{" "}
        <span className="text-slate-400">Yahoo Finance</span> and committed with each series' source, symbol and unit.
        {asOf && <> Last settled close <span className="text-slate-400">{asOf}</span>.</>}{" "}
        Only completed sessions are stored, so today's in-progress move is not in these figures.
        {absentRows.length > 0 && <> {absentRows.length} series the spec asks for {absentRows.length === 1 ? "has" : "have"} no free feed and {absentRows.length === 1 ? "is" : "are"} named below.</>}
      </p>

      <ViewToggle
        views={VIEWS} active={view} onChange={setView}
        right={
          <div className="flex items-center gap-1.5">
            <button onClick={onExportPng} title="Download the chart as a PNG, with its title, unit, source and window drawn into the image"
              className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-ink-700/60">
              <ImageIcon className="h-3.5 w-3.5" /> Chart PNG
            </button>
            <button onClick={onExportCsv} title="Download exactly what the chart is drawing, at the frequency on screen"
              className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-ink-700/60">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={onExport}
              className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-ink-700/60">
              <Download className="h-3.5 w-3.5" /> Export Excel
            </button>
          </div>
        } />

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <Card
        title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-champagne-400" />
          {chosen.length === 1 ? chosen[0].label : `${chosen.length} series compared`}</span>}
        subtitle={chosen.length === 1
          ? `${chosen[0].unit} · ${chosen[0].source.name} (${chosen[0].source.symbol}) · ${chosen[0].count.toLocaleString()} closes from ${chosen[0].first}`
          : "Click any row in the table below to add or remove a series from the overlay"}
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
            {/* Frequency. Only the options every chosen series can honestly be
                resampled to — never a finer one, which would mean inventing
                readings the source never published. */}
            {freqOptions.length > 1 && (
              <>
                <select value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}
                  title="Show the series at this frequency. Only frequencies coarser than or equal to the source's own are offered."
                  className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] font-medium text-slate-300 ring-focus">
                  {freqOptions.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                </select>
                <span className="mx-1 h-4 w-px bg-ink-700" />
              </>
            )}
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
        {chartSeries.length === 0 ? (
          <div className="grid h-[320px] place-items-center text-[12px] text-slate-500">
            {busy ? "Loading observations…" : "No observations in this window."}
          </div>
        ) : (
          <>
            <div ref={chartRef}>
              <SeriesChart series={chartSeries} type={chartType} height={320} />
            </div>
            {freq !== "daily" && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {FREQ_LABEL[freq]} view — each point is the <span className="text-slate-400">last observation</span> in
                its period, which is what a period-end figure means. An average over the period would be a different
                measurement under the same label.
                {anyOpenBucket && (
                  <> The final point sits in a period that <span className="text-slate-400">has not closed yet</span>,
                  so it is the latest reading rather than a period end.</>
                )}
              </p>
            )}
          </>
        )}
        {chosen.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chosen.map((s) => (
              <button key={s.id} onClick={() => toggle(s.id)}
                className="rounded-full border border-champagne-500/30 bg-champagne-500/10 px-2 py-0.5 text-[11px] text-champagne-400 hover:bg-champagne-500/20">
                {s.label} ×
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Yield curve ────────────────────────────────────────────────────
          Only on Rates & Bonds: it plots MANY instruments at ONE moment with
          maturity on the x-axis, which is a different question from every other
          chart on this page and belongs where the tenors are. */}
      {view === "rates" && index && (
        <Card className="mt-5"
          title={<span className="flex items-center gap-2"><Percent className="h-4 w-4 text-champagne-400" /> US Treasury yield curve</span>}
          subtitle="Maturity on the x-axis, today against a year earlier — the spec's 'yield curve', drawn only from tenors the store holds">
          <YieldCurve index={index.series} />
        </Card>
      )}

      {/* ── Returns table ──────────────────────────────────────────────────── */}
      <Card className="mt-5"
        title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-champagne-400" /> Returns table</span>}
        subtitle="Daily · Weekly · Monthly · 3M · 6M · QTD · YTD · 1Y · 3Y · 5Y · 10Y · Max CAGR, with the 52-week high and low — computed from the full stored series"
        right={<Pill tone="gain">{rows.length} live</Pill>} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="sticky top-0 bg-ink-800">
              <tr className="border-b border-ink-700">
                <th className="label-xs px-4 py-2 text-left font-medium">Series</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Last</th>
                {HORIZON_COLS.map((c) => (
                  <th key={c.key} className="label-xs px-3 py-2 text-right font-medium"
                    title={c.annualised ? `${c.label} compound annual growth rate` : `${c.label} return`}>
                    {c.label}{c.annualised ? "*" : ""}
                  </th>
                ))}
                <th className="label-xs px-3 py-2 text-right font-medium">52W H</th>
                <th className="label-xs px-3 py-2 text-right font-medium">52W L</th>
              </tr>
            </thead>
            {groupBy(rows).map(({ group, rows: grs }) => (
              <tbody key={group} className="divide-y divide-ink-700/60">
                <tr><td colSpan={HORIZON_COLS.length + 4} className="bg-ink-900/40 px-4 py-1.5 text-[10.5px] uppercase tracking-wide text-slate-500">{group}</td></tr>
                {grs.map((r) => (
                  <SeriesRow key={r.id} row={r} active={selected.includes(r.id)} onClick={() => toggle(r.id)} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-400">*</span> 3Y/5Y/10Y/Max are annualised (CAGR); the shorter
          horizons are cumulative. <span className="font-medium text-slate-400">Every horizon is independent</span> — a
          cell is <span className="mono">—</span> when the series does not reach back that far, never a shorter window
          relabelled, so Nifty's history starting in 2007 shows a real 10-year CAGR and an honest max.
          {rows.some((r) => r.kind === "yield") && <> A <span className="font-medium text-slate-400">yield</span> series
          reports the absolute change in <span className="font-medium text-slate-400">basis points</span>, not a
          percentage return — the US 10-year going 0.5% to 4.3% is +380bp, and calling it "+760%" would be a category error.</>}
          {rows.some((r) => r.accumulating) && <> A row marked <span className="font-medium text-slate-400">building</span> comes
          from a source that publishes only its current value — RBI's policy rates and IEX's day-ahead price have no
          downloadable history — so the store accumulates one observation per run and every horizon stays absent until
          it can answer one. A two-point series is shown as two points, not as a trend.</>}
          {" "}Click any row to chart it; click several to overlay them.
        </p>
      </Card>

      {/* ── Declared absent ────────────────────────────────────────────────── */}
      {absentRows.length > 0 && (
        <Card className="mt-5" title="Asked for by the spec, not yet sourced"
          subtitle="Named with the reason rather than shown as an illustrative number"
          right={<Pill>{absentRows.length}</Pill>}>
          <ul className="space-y-2">
            {absentRows.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 border-b border-ink-700/50 pb-2 last:border-0 last:pb-0">
                <span className="text-[12.5px] font-medium text-slate-300">{a.label} <span className="text-slate-600">· {a.group}</span></span>
                <span className="text-[11px] leading-relaxed text-slate-500">{a.absent}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Release calendar — the one genuinely unsourceable piece ────────
          This listed "US CPI (MoM) prev 0.3% cons 0.2% actual 0.1%", "India IIP
          (YoY) actual 5.2%" and "China GDP (YoY) actual 4.7%" as sample figures.
          Its own caption was already correct about why a consensus cannot be
          shown — and it printed three consensus figures anyway, alongside three
          ACTUALS, which are not licensed at all but simply were not measured.
          Cropped out of a screenshot, "China GDP (YoY) actual 4.7%" is a false
          economic fact a reader can act on. */}
      <Card className="mt-5"
        title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-500" /> Data release calendar</span>}
        subtitle="Previous · consensus · actual · surprise">
        <AbsentSection
          what="No release calendar is available"
          needs="A calendar needs a publication SCHEDULE and a CONSENSUS. Consensus and the surprise measured against it
            are licensed products sold by paid vendors; the schedule is published per agency and is not in the
            catalogue. Previous and actual come from each agency's own release — where the harvest store carries the
            series, its latest reading and release date are already in the tables above." />
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Rather than invent a forecast, this shows the releases the store actually holds and leaves consensus absent
          until a vendor is chosen. Sample prints here would be indistinguishable from real ones once a screenshot is
          cropped, which is why none is drawn.
        </p>
      </Card>
    </div>
  );
}

function SeriesRow({ row, active, onClick }: { row: SeriesEntry; active: boolean; onClick: () => void }) {
  return (
    <tr onClick={onClick}
      className={`cursor-pointer transition-colors ${active ? "bg-champagne-500/[0.07]" : "hover:bg-ink-700/30"}`}>
      <td className="px-4 py-2 font-medium text-slate-300">
        <span className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-champagne-400" : "bg-gain"}`}
            title={active ? "Charted" : `Live · ${row.source.name} · close ${row.last}`} />
          {row.label}
          {row.accumulating && (
            <span className="text-[10px] text-slate-500"
              title={`${row.source.name} publishes only the current value — no history is available to download. This series is being built one observation per harvest, and has ${row.count} so far since ${row.first}. Every horizon stays absent until the store has held it long enough to answer one.`}>
              building · {row.count}
            </span>
          )}
          {row.staleSince && (
            <span className="text-[10px] text-amber-400" title={`The source has not published since ${row.staleSince}. The level shown is that day's close.`}>
              stale
            </span>
          )}
          {row.note && <span className="text-[10px] text-slate-600" title={row.note}>ⓘ</span>}
        </span>
      </td>
      <td className="px-3 py-2 text-right mono text-slate-100">{fmtLevel(row.last_value, row.unit)}</td>
      {HORIZON_COLS.map((c) => {
        const v = row.returns[c.key];
        return (
          <td key={c.key} className={`px-3 py-2 text-right mono ${returnTone(v)}`}
            title={row.spans[c.key] ? `${row.spans[c.key]![0]} → ${row.spans[c.key]![1]}` : "Series does not reach back this far"}>
            {fmtReturn(v, row.kind)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right mono text-slate-400">{fmtLevel(row.high52, row.unit)}</td>
      <td className="px-3 py-2 text-right mono text-slate-400">{fmtLevel(row.low52, row.unit)}</td>
    </tr>
  );
}
