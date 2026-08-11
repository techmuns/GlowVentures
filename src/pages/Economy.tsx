import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Percent, Users, Landmark, Building, Home, PiggyBank, ShoppingCart, BarChart3, CalendarClock, Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { PreviewBadge, PreviewNum } from "@/components/Preview";
import { SeriesChart } from "@/components/SeriesChart";
import {
  fetchSeriesIndex, fetchSeriesPoints, fmtReturn, returnTone,
  type SeriesIndex, type SeriesEntry, type Point,
} from "@/lib/series";

// LAYER 2 · B–H (FOOS spec) — Macro economic indicators, Fixed income & credit,
// Banking, Housing, Household, Consumption, Capital markets.
//
// THE LIVE ROWS NOW COME FROM THE SERIES STORE, NOT A LATEST-VALUE CALL.
// This page used to read `/api/economy`, which returns an indicator's newest
// observation and its predecessor: enough to fill a tile, useless for the chart
// and the history the spec asks for. The same World Bank indicators are now
// harvested into `public/series/` with their FULL run — India's CPI goes back to
// 1960 — so a row carries sixty-five years behind it and can be charted.
//
// These are ANNUAL and LAGGED, and the page says so rather than implying they
// are current. They are also RATES, so the change is in percentage points; a
// "percentage return" on an inflation rate is the same category error as one on
// a bond yield.

// `seriesId` maps a row to a harvested series; rows without one stay preview.
type Row = { name: string; value: string; chg: string; seriesId?: string };

const CATEGORIES: { title: string; icon: typeof TrendingUp; rows: Row[] }[] = [
  {
    title: "Economic growth", icon: TrendingUp, rows: [
      { name: "GDP growth (YoY)", value: "6.7%", chg: "+0.3pp", seriesId: "india-gdp-growth" },
      // NOT wired to `india-iip`, deliberately. That series is real published
      // history (2012-04 → 2023-02) but MoSPI stopped appending to the
      // data.gov.in resource in February 2023 while its record metadata keeps
      // being touched. A three-year-old reading in a row a reader takes as
      // current is a wrong figure no badge repairs, so this row states the
      // absence and the history lives on the series page with its own dates.
      { name: "Industrial Production", value: "5.2%", chg: "+0.6pp" },
      { name: "Manufacturing PMI", value: "58.1", chg: "+1.2" },
      { name: "Capacity Utilisation", value: "76.4%", chg: "+0.8pp" },
    ],
  },
  {
    title: "Inflation", icon: Percent, rows: [
      { name: "CPI (YoY)", value: "4.8%", chg: "-0.2pp", seriesId: "india-cpi" },
      { name: "Core CPI", value: "3.9%", chg: "-0.1pp" },
      // Same as Industrial Production above: `india-wpi` carries 2012-04 →
      // 2023-10 and the source has not appended since. History, not a current
      // reading, so this row stays unwired.
      { name: "WPI", value: "2.6%", chg: "+0.4pp" },
      { name: "Rural / Urban CPI", value: "5.1 / 4.5%", chg: "-0.1pp" },
    ],
  },
  {
    title: "Labour market", icon: Users, rows: [
      { name: "Unemployment Rate", value: "7.1%", chg: "-0.3pp", seriesId: "india-unemployment" },
      { name: "Labour Participation", value: "42.4%", chg: "+0.2pp" },
      { name: "US Non-Farm Payrolls", value: "206k", chg: "-38k" },
      { name: "Wage Growth", value: "4.1%", chg: "+0.2pp" },
    ],
  },
  {
    title: "Government", icon: Landmark, rows: [
      { name: "Fiscal Deficit (% GDP)", value: "5.1%", chg: "-0.2pp" },
      { name: "Govt Debt / GDP", value: "81.2%", chg: "+0.4pp", seriesId: "india-govt-debt-gdp" },
      { name: "GST Collections", value: "₹1.82 L Cr", chg: "+8.4%" },
      { name: "E-way Bills", value: "103.2 mn", chg: "+6.1%" },
    ],
  },
  {
    title: "Fixed income & credit", icon: BarChart3, rows: [
      // MONTHLY, via FRED's republication of the OECD long-term government bond
      // yield. The daily RBI benchmark still needs a reader; this is the figure
      // that exists, and the series carries its own frequency so no 1-day move
      // is ever computed from it.
      { name: "India 10Y", value: "6.98%", chg: "-4bp", seriesId: "india-10y" },
      { name: "US 10Y", value: "4.28%", chg: "+6bp", seriesId: "us-10y" },
      { name: "AAA Credit Spread", value: "62bp", chg: "+3bp" },
      // The CURVE ITSELF is now drawn on Macro Research from the four stored
      // Treasury tenors. This row stays unwired because it asks for 10Y–2Y
      // specifically and no series here carries the 2-year; the curve page
      // shows 10Y–3M and says so rather than interpolating a 2-year off its
      // neighbours, which would put a yield nobody quoted beside quoted ones.
      { name: "Yield Curve (10Y–2Y)", value: "+18bp", chg: "+2bp" },
    ],
  },
  {
    title: "Banking & policy", icon: Building, rows: [
      { name: "Repo Rate", value: "6.50%", chg: "0bp", seriesId: "india-repo-rate" },
      { name: "Cash Reserve Ratio", value: "4.5%", chg: "0bp", seriesId: "india-crr" },
      { name: "Statutory Liquidity Ratio", value: "18.0%", chg: "0bp", seriesId: "india-slr" },
      { name: "Bank Rate", value: "6.75%", chg: "0bp", seriesId: "india-bank-rate" },
    ],
  },
  {
    title: "Housing", icon: Home, rows: [
      { name: "House Price Index", value: "+6.2%", chg: "+0.3pp" },
      { name: "Affordability Index", value: "3.4x", chg: "-0.1x" },
      { name: "Registrations (MoM)", value: "+4.8%", chg: "+1.1pp" },
      { name: "Inventory (months)", value: "22.6", chg: "-0.9" },
    ],
  },
  {
    title: "Household", icon: PiggyBank, rows: [
      // The spec asks for HOUSEHOLD debt and savings, not the national gross
      // savings rate. That series was carried, wired to this row, and is neither
      // of the two — so it is gone and the row now names what the spec actually
      // asks for, unwired because no free source publishes it.
      { name: "Household Debt / GDP", value: "38.9%", chg: "+0.6pp" },
      { name: "Financial Savings", value: "5.3% GDP", chg: "-0.2pp" },
      { name: "Physical Savings", value: "12.1% GDP", chg: "+0.3pp" },
      { name: "Equity in Asset Mix", value: "6.4%", chg: "+0.4pp" },
    ],
  },
  {
    title: "Consumption", icon: ShoppingCart, rows: [
      { name: "Passenger Vehicles", value: "+3.9%", chg: "-1.2pp" },
      { name: "Two Wheelers", value: "+11.4%", chg: "+2.1pp" },
      { name: "Tractors", value: "-2.6%", chg: "-3.0pp" },
      { name: "FMCG Volumes", value: "+5.8%", chg: "+0.7pp" },
    ],
  },
  {
    title: "Capital markets", icon: BarChart3, rows: [
      { name: "Equity MF Flows", value: "₹34,700 Cr", chg: "+12.4%" },
      { name: "SIP Flows", value: "₹21,260 Cr", chg: "+3.1%" },
      { name: "Demat Accounts", value: "161.2 mn", chg: "+2.4 mn" },
      { name: "F&O Turnover", value: "₹412 L Cr", chg: "-6.8%" },
    ],
  },
];

const RELEASES = [
  { s: "India CPI (YoY)", date: "12 Aug", prev: "5.08%", cons: "4.90%", act: "4.83%", note: "Cooler than expected on food; keeps a rate cut on the table for Q4." },
  { s: "US Non-Farm Payrolls", date: "02 Aug", prev: "218k", cons: "185k", act: "206k", note: "Labour market resilient; wage growth steady, no dovish tilt yet." },
  { s: "RBI Policy Rate", date: "08 Aug", prev: "6.50%", cons: "6.50%", act: "6.50%", note: "Held as expected; stance stays 'withdrawal of accommodation'." },
  { s: "China GDP (YoY)", date: "15 Jul", prev: "5.3%", cons: "5.1%", act: "4.7%", note: "Miss on weak property and consumption; stimulus expectations rising." },
];

export function Economy() {
  const [index, setIndex] = useState<SeriesIndex | null | undefined>(undefined);
  const [charted, setCharted] = useState<string | null>(null);
  const [points, setPoints] = useState<Record<string, Point[]>>({});

  useEffect(() => {
    let alive = true;
    fetchSeriesIndex().then((i) => { if (alive) setIndex(i); });
    return () => { alive = false; };
  }, []);

  /** Harvested series, by id — the row lookup for every live figure below. */
  const byId = useMemo(() => {
    const m = new Map<string, SeriesEntry>();
    for (const s of index?.series ?? []) m.set(s.id, s);
    return m;
  }, [index]);

  const chartedSeries = charted ? byId.get(charted) ?? null : null;
  useEffect(() => {
    if (!chartedSeries || points[chartedSeries.id]) return;
    let alive = true;
    fetchSeriesPoints(chartedSeries).then((p) => {
      if (alive) setPoints((prev) => ({ ...prev, [chartedSeries.id]: p }));
    });
    return () => { alive = false; };
  }, [chartedSeries, points]);

  const liveCount = CATEGORIES.reduce(
    (n, c) => n + c.rows.filter((r) => r.seriesId && byId.has(r.seriesId)).length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2B"
        title="Economy & Macro Indicators"
        subtitle="Growth, inflation, labour, government, fixed income, banking, housing, household, consumption and capital-market series — with a release calendar and AI commentary."
        right={liveCount > 0
          ? <Pill tone="gain">{liveCount} live · series store</Pill>
          : <PreviewBadge />}
      />

      <div className="mb-5 rounded-lg border border-ink-700 bg-ink-800/40 px-4 py-3 text-[12px] leading-relaxed text-slate-400">
        {liveCount > 0 ? (
          <>Growth, inflation, unemployment, government debt, gross savings and the US 10-year are{" "}
          <span className="text-gain">live</span> from the harvested series store — each with its full history
          (India's CPI runs from 1960), so any of them can be charted by clicking the row. The World Bank series are
          ANNUAL and lagged; the observation year is shown on every figure. The remaining rows — the rest of fixed
          income, banking, housing, household, consumption and capital markets — come from Indian statistical sources
          with no API and arrive with the Phase 2 India harvest; they stay illustrative until then.</>
        ) : (
          <>The series store did not load. Every live figure on this page is read from{" "}
          <span className="mono">public/series/</span>, which is committed and served statically — so this is a
          deployment problem rather than a missing feed. All figures below are illustrative until it loads.</>
        )}
      </div>

      {/* Release calendar — the spec's signature macro feature */}
      <Card className="preview-hatch" title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-champagne-400" /> Data release calendar</span>}
        subtitle="Previous · consensus · actual · surprise vs consensus, each with an AI-generated 2–3 line note" right={<PreviewBadge />} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Series</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Date</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Previous</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Consensus</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Actual</th>
                <th className="label-xs px-4 py-2 text-left font-medium"><span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI commentary</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {RELEASES.map((r) => (
                <tr key={r.s} className="hover:bg-ink-700/30">
                  <td className="px-4 py-2.5 font-medium text-slate-300">{r.s}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.date}</td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.prev}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.cons}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.act}</PreviewNum></td>
                  <td className="px-4 py-2.5 max-w-md text-[11.5px] text-slate-500" title="Placeholder — not live data">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Chart — opens when a live indicator row is clicked. A rate series is a
          BAR chart on purpose: consecutive annual rates are separate readings,
          and joining them with a line implies a path between two yearly figures
          that nothing measured. */}
      {chartedSeries && (
        <Card className="mb-5"
          title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-champagne-400" />{chartedSeries.label}</span>}
          subtitle={`${chartedSeries.unit} · ${chartedSeries.source.name} · ${chartedSeries.count} ${chartedSeries.frequency} observations, ${chartedSeries.first.slice(0, 4)} to ${chartedSeries.last.slice(0, 4)}`}
          right={
            <button onClick={() => setCharted(null)}
              className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-[11px] text-slate-400 hover:bg-ink-700/60">
              Close
            </button>
          }>
          {points[chartedSeries.id]?.length
            ? <SeriesChart series={[{ meta: chartedSeries, points: points[chartedSeries.id] }]} type="bar" height={260} />
            : <div className="grid h-[260px] place-items-center text-[12px] text-slate-500">Loading observations…</div>}
          {chartedSeries.staleSince && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-400/90">
              The source has published nothing since {chartedSeries.staleSince.slice(0, 4)}. The figure shown is that
              year's reading, not an estimate of today.
            </p>
          )}
        </Card>
      )}

      {/* Indicator grid */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
        {CATEGORIES.map((cat) => {
          const catLive = cat.rows.filter((r) => r.seriesId && byId.has(r.seriesId)).length;
          const catAllPreview = catLive === 0;
          return (
          <Card key={cat.title} className={catAllPreview ? "preview-hatch" : undefined} title={<span className="flex items-center gap-2 text-[13px]"><cat.icon className="h-4 w-4 text-slate-500" />{cat.title}</span>} right={catLive > 0 ? <Pill tone="gain">{catLive} live</Pill> : <PreviewBadge />}>
            <ul className="space-y-2">
              {cat.rows.map((r) => {
                const e = r.seriesId ? byId.get(r.seriesId) : undefined;
                if (e) {
                  // The year-on-year move, in percentage points — these are all
                  // rates, so a ratio "return" on them would be meaningless.
                  const yoy = e.returns.y1;
                  return (
                    <li key={r.name}>
                      <button onClick={() => setCharted(e.id)}
                        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-[12px] transition-colors hover:bg-ink-700/40">
                        <span className="text-slate-300">{r.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-gain"
                            title={`Live · ${e.source.name} · ${e.frequency} · observation dated ${e.last}`} />
                          <span className="tabular-nums font-medium text-slate-200">
                            {e.last_value.toFixed(1)}{e.unit === "%" ? "%" : ""}
                          </span>
                          <span className={`text-[10px] ${returnTone(yoy)}`} title={`Change over one year, to ${e.last}`}>
                            {fmtReturn(yoy, e.kind)}
                          </span>
                        </span>
                      </button>
                      <div className="px-1 text-[9.5px] text-slate-600">
                        {e.last.slice(0, 4)}{e.staleSince ? " · source has not updated since" : ""}
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={r.name} className="flex items-center justify-between gap-2 px-1 text-[12px]">
                    <span className="text-slate-400">{r.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <PreviewNum>{r.value}</PreviewNum>
                      <span className="text-[10px] text-slate-600" title="Placeholder — not live data">{r.chg}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Each series would carry daily / weekly / monthly / quarterly / year-end history, a returns table, cross-series
        comparison and export to Excel · PDF · PowerPoint — the cross-cutting research functionality the spec asks for.
      </p>
    </div>
  );
}
