import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Percent, Users, Landmark, Building, Home, PiggyBank, ShoppingCart, BarChart3, Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { PreviewBadge } from "@/components/Preview";
import { AbsentCell } from "@/components/Absent";
import { SeriesChart } from "@/components/SeriesChart";
import { EconomicCalendar } from "@/components/EconomicCalendar";
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

// `seriesId` maps a row to a harvested series. A row WITHOUT one renders absent.
//
// THE `value` AND `chg` FIELDS ARE GONE FROM THIS TYPE ON PURPOSE. Every row
// used to carry a hardcoded pair — "Manufacturing PMI 58.1 +1.2", "Capacity
// Utilisation 76.4% +0.8pp", "Household Debt / GDP 38.9%" — and a row whose
// series resolved in the store overwrote them while a row without one printed
// them greyed. Those are real Indian macro statistics with real published
// values, and the ones here were invented.
//
// Deleting the render would have left the numbers one line away from being
// shown again. Deleting the FIELD makes it a type error to reintroduce one, so
// a future row can only be a name plus a series that exists — the same reason
// `custodianOf()` was removed rather than corrected.
type Row = { name: string; seriesId?: string };

const CATEGORIES: { title: string; icon: typeof TrendingUp; rows: Row[] }[] = [
  {
    title: "Economic growth", icon: TrendingUp, rows: [
      { name: "GDP growth (YoY)", seriesId: "india-gdp-growth" },
      // NOT wired to `india-iip`, deliberately. That series is real published
      // history (2012-04 → 2023-02) but MoSPI stopped appending to the
      // data.gov.in resource in February 2023 while its record metadata keeps
      // being touched. A three-year-old reading in a row a reader takes as
      // current is a wrong figure no badge repairs, so this row states the
      // absence and the history lives on the series page with its own dates.
      { name: "Industrial Production", },
      { name: "Manufacturing PMI", },
      { name: "Capacity Utilisation", },
    ],
  },
  {
    title: "Inflation", icon: Percent, rows: [
      { name: "CPI (YoY)", seriesId: "india-cpi" },
      { name: "Core CPI", },
      // Same as Industrial Production above: `india-wpi` carries 2012-04 →
      // 2023-10 and the source has not appended since. History, not a current
      // reading, so this row stays unwired.
      { name: "WPI", },
      { name: "Rural / Urban CPI", },
    ],
  },
  {
    title: "Labour market", icon: Users, rows: [
      { name: "Unemployment Rate", seriesId: "india-unemployment" },
      { name: "Labour Participation", },
      { name: "US Non-Farm Payrolls", },
      { name: "Wage Growth", },
    ],
  },
  {
    title: "Government", icon: Landmark, rows: [
      { name: "Fiscal Deficit (% GDP)", },
      { name: "Govt Debt / GDP", seriesId: "india-govt-debt-gdp" },
      { name: "GST Collections", },
      { name: "E-way Bills", },
    ],
  },
  {
    title: "Fixed income & credit", icon: BarChart3, rows: [
      // MONTHLY, via FRED's republication of the OECD long-term government bond
      // yield. The daily RBI benchmark still needs a reader; this is the figure
      // that exists, and the series carries its own frequency so no 1-day move
      // is ever computed from it.
      { name: "India 10Y", seriesId: "india-10y" },
      { name: "US 10Y", seriesId: "us-10y" },
      { name: "AAA Credit Spread", },
      // The CURVE ITSELF is now drawn on Macro Research from the four stored
      // Treasury tenors. This row stays unwired because it asks for 10Y–2Y
      // specifically and no series here carries the 2-year; the curve page
      // shows 10Y–3M and says so rather than interpolating a 2-year off its
      // neighbours, which would put a yield nobody quoted beside quoted ones.
      { name: "Yield Curve (10Y–2Y)", },
    ],
  },
  {
    title: "Banking & policy", icon: Building, rows: [
      { name: "Repo Rate", seriesId: "india-repo-rate" },
      { name: "Cash Reserve Ratio", seriesId: "india-crr" },
      { name: "Statutory Liquidity Ratio", seriesId: "india-slr" },
      { name: "Bank Rate", seriesId: "india-bank-rate" },
    ],
  },
  {
    title: "Housing", icon: Home, rows: [
      { name: "House Price Index", },
      { name: "Affordability Index", },
      { name: "Registrations (MoM)", },
      { name: "Inventory (months)", },
    ],
  },
  {
    title: "Household", icon: PiggyBank, rows: [
      // The spec asks for HOUSEHOLD debt and savings, not the national gross
      // savings rate. That series was carried, wired to this row, and is neither
      // of the two — so it is gone and the row now names what the spec actually
      // asks for, unwired because no free source publishes it.
      { name: "Household Debt / GDP", },
      { name: "Financial Savings", },
      { name: "Physical Savings", },
      { name: "Equity in Asset Mix", },
    ],
  },
  {
    title: "Consumption", icon: ShoppingCart, rows: [
      { name: "Passenger Vehicles", },
      { name: "Two Wheelers", },
      { name: "Tractors", },
      { name: "FMCG Volumes", },
    ],
  },
  {
    // AMFI's monthly report, read from the workbook it publishes — see
    // `scripts/harvest/adapters/amfi.mjs`. SIP stays unwired because that
    // workbook does not carry it and the monthly-report page links no SIP file:
    // checked, not assumed. Demat accounts and F&O turnover need NSDL and the
    // exchanges, neither of which answered.
    title: "Capital markets", icon: BarChart3, rows: [
      { name: "Mutual Fund AUM", seriesId: "india-mf-aum" },
      { name: "Mutual Fund Net Flows", seriesId: "india-mf-net-flows" },
      { name: "Equity MF Flows", seriesId: "india-mf-equity-flows" },
      { name: "Debt MF Flows", seriesId: "india-mf-debt-flows" },
      { name: "Gold ETF Flows", seriesId: "india-etf-gold-flows" },
      { name: "Other ETF Flows", seriesId: "india-etf-other-flows" },
      { name: "Mutual Fund Folios", seriesId: "india-mf-folios" },
      { name: "SIP Flows", },
      { name: "Demat Accounts", },
      { name: "F&O Turnover", },
    ],
  },
];

// THERE IS NO RELEASE TABLE HERE ANY MORE, AND THERE MUST NOT BE ONE.
//
// This file carried four rows of invented macro prints — "India CPI (YoY), 12
// Aug, prev 5.08%, cons 4.90%, actual 4.83%", "RBI Policy Rate, 08 Aug, held as
// expected; stance stays 'withdrawal of accommodation'", "China GDP (YoY) …
// actual 4.7%, miss on weak property" — each with a two-line AI-styled note.
//
// A greyed number reads as illustrative. A SENTENCE DOES NOT. "Held as
// expected" is a statement about a real central bank decision on a real date,
// and a reader who takes away an inflation print or a policy stance has learnt
// something false; no badge unlearns it. This is the same failure the book
// already fixed when alerts asserted that a real fund manager had resigned.
//
// The irony that settles it: the RBI policy rate is IN the harvest store —
// `adapters/rbi.mjs` collects repo, SDF, MSF, bank rate, reverse repo, CRR and
// SLR — so this table was printing a fabricated policy rate on a page that
// carries the real one a few rows above.
//
// What a release calendar actually needs is a SCHEDULE (when the next print is
// due) and a CONSENSUS (what the street expects). Neither is in any source
// wired here, and consensus is licensed data. The card below states that.

/**
 * A series value in its own unit.
 *
 * `toFixed(1)` alone was fine while every live row was a percentage. It is not
 * once a row carries rupees or a headcount: AMFI's mutual-fund AUM printed as
 * "8575656.5" and its folio count as "280865000.0", which a reader has to
 * count digits to interpret.
 *
 * INDIAN GROUPING, AND THE SOURCE'S OWN SCALE. AMFI publishes in crore and this
 * keeps it there rather than rescaling to lakh-crore — a unit the reader can
 * check against the source document beats one that reads more naturally, and
 * rescaling is where a factor of a hundred gets introduced.
 */
function fmtByUnit(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "INR Cr") return `${Math.round(v).toLocaleString("en-IN")} Cr`;
  if (unit === "count") return Math.round(v).toLocaleString("en-IN");
  return v.toFixed(1);
}

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

      {/* RELEASE CALENDAR — the spec's signature macro feature, and for a long
          time the one piece of it nothing here could serve. That card said a
          calendar needed "a SCHEDULE … and a CONSENSUS … licensed products sold
          by paid vendors", which was an absence recorded against an UNCHECKED
          premise — the third time in this repo, after FRED and the RBI. Probed
          2026-08-13: TradingEconomics' free API is discontinued (HTTP 410) and
          Bloomberg 403s, but TradingView's calendar endpoint answers with all
          four columns, an impact rank and the publishing agency per row. See
          `functions/api/econ-calendar.js`. */}
      <EconomicCalendar />

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
                            {fmtByUnit(e.last_value, e.unit)}
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
                // NOT WIRED — and now shown as absent rather than as a greyed
                // sample. The reason is specific per row where the store knows
                // one, because "no data" tells a reader nothing about whether
                // the figure is coming or can never come.
                return (
                  <li key={r.name} className="flex items-center justify-between gap-2 px-1 text-[12px]">
                    <span className="text-slate-400">{r.name}</span>
                    <AbsentCell reason={`no series in the harvest store answers ${r.name} — the FOOS spec asks for it and no free source wired here publishes it`} />
                  </li>
                );
              })}
            </ul>
          </Card>
          );
        })}
      </div>

    </div>
  );
}
