// THE SERIES STORE, read side.
//
// `public/series/` is written by `npm run harvest` (see scripts/harvest/) and
// served statically, exactly like `public/audit/`. The manifest carries every
// series' metadata AND its precomputed returns table, so one fetch renders a
// whole page of figures; the year chunks are fetched only when a chart actually
// needs them, and only for the years the chosen range covers.
//
// NOTHING IS COMPUTED FROM A PARTIAL SERIES HERE. The returns in the manifest
// were computed by the harvester against the full stored history, with every
// horizon independent — a horizon the series cannot reach back to is `null` and
// renders as absent, never as a shorter window silently relabelled.

export type SeriesKind = "price" | "yield";

export type SeriesSource = {
  name: string; symbol: string; url: string;
  exchange: string | null; upstreamCurrency: string | null;
};

export type SeriesMeta = {
  id: string; label: string; category: string; group: string;
  unit: string; kind: SeriesKind; frequency: string;
  provenance: string; source: SeriesSource; note: string | null;
  /**
   * True when the source publishes only a CURRENT value and the store is
   * building the history itself, one run at a time (RBI's policy rates, IEX's
   * day-ahead price). The UI must say "accumulating since" rather than present
   * two observations as though they were a record going back years.
   */
  accumulating?: boolean;
  first: string; last: string; count: number;
  retrievedAt: string;
  /** Set when the source has not published within its own cadence. */
  staleSince: string | null;
};

export type HorizonKey = "d1" | "w1" | "m1" | "m3" | "m6" | "qtd" | "ytd" | "y1" | "y3" | "y5" | "y10" | "max";

export type SeriesEntry = SeriesMeta & {
  last_value: number;
  returns: Partial<Record<HorizonKey, number | null>>;
  spans: Partial<Record<HorizonKey, [string, string]>>;
  high52: number | null;
  low52: number | null;
};

/** A series the FOOS spec asks for that no source in this phase can serve. */
export type AbsentSeries = { id: string; label: string; category: string; group: string; unit: string; absent: string };
export type FailedSeries = { id: string; label: string; category: string; group: string; error: string; kept: number };

export type SeriesIndex = {
  generatedAt: string;
  categories: { key: string; label: string }[];
  series: SeriesEntry[];
  absent: AbsentSeries[];
  failed: FailedSeries[];
};

export type Point = { t: string; v: number };

/** The columns the spec lists, in its order. */
export const HORIZON_COLS: { key: HorizonKey; label: string; annualised?: boolean }[] = [
  { key: "d1", label: "1D" }, { key: "w1", label: "1W" }, { key: "m1", label: "1M" },
  { key: "m3", label: "3M" }, { key: "m6", label: "6M" },
  { key: "qtd", label: "QTD" }, { key: "ytd", label: "YTD" }, { key: "y1", label: "1Y" },
  { key: "y3", label: "3Y", annualised: true }, { key: "y5", label: "5Y", annualised: true },
  { key: "y10", label: "10Y", annualised: true }, { key: "max", label: "Max", annualised: true },
];

const BASE = "/series";

export async function fetchSeriesIndex(): Promise<SeriesIndex | null> {
  try {
    const r = await fetch(`${BASE}/index.json`);
    if (!r.ok) return null;
    return (await r.json()) as SeriesIndex;
  } catch {
    return null;
  }
}

/**
 * Load a series' points for a date range.
 *
 * Daily series are stored one file per calendar year, so a 1-year window costs
 * one or two small fetches rather than pulling a 14,000-point history to draw a
 * 250-point line. Missing years resolve to nothing rather than throwing — a gap
 * in coverage is a gap, not an error.
 */
export async function fetchSeriesPoints(meta: SeriesMeta, fromYear?: number): Promise<Point[]> {
  // ONLY DAILY SERIES ARE CHUNKED BY YEAR. A monthly or annual series is small
  // enough to live in one `series.json`, which is what the store writes for it
  // (see `writeSeries` in scripts/harvest/lib/store.mjs). Asking for year chunks
  // regardless returned 404 for every one of them and resolved to an EMPTY
  // series — so all fifteen Pink Sheet commodities and all nine World Bank
  // indicators rendered a blank chart while their returns table, which is served
  // from the manifest, looked perfectly healthy. A chart that quietly draws
  // nothing is worse than one that says it has nothing.
  if (meta.frequency !== "daily") {
    try {
      const r = await fetch(`${BASE}/${meta.id}/series.json`);
      if (!r.ok) return [];
      const c = (await r.json()) as { t: string[]; v: number[] };
      const out: Point[] = [];
      for (let i = 0; i < (c?.t?.length ?? 0); i++) out.push({ t: c.t[i], v: c.v[i] });
      return out;
    } catch {
      return [];
    }
  }

  const firstYear = Number(meta.first.slice(0, 4));
  const lastYear = Number(meta.last.slice(0, 4));
  const start = Math.max(firstYear, fromYear ?? firstYear);
  const years: number[] = [];
  for (let y = start; y <= lastYear; y++) years.push(y);

  const chunks = await Promise.all(years.map(async (y) => {
    try {
      const r = await fetch(`${BASE}/${meta.id}/${y}.json`);
      if (!r.ok) return null;
      return (await r.json()) as { t: string[]; v: number[] };
    } catch {
      return null;
    }
  }));

  const out: Point[] = [];
  for (const c of chunks) {
    if (!c?.t) continue;
    for (let i = 0; i < c.t.length; i++) out.push({ t: c.t[i], v: c.v[i] });
  }
  out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return out;
}

// ── Chart ranges ────────────────────────────────────────────────────────────
export type RangeKey = "1M" | "6M" | "1Y" | "5Y" | "10Y" | "MAX";
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1M", label: "1M", days: 30 },
  { key: "6M", label: "6M", days: 182 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "5Y", label: "5Y", days: 365 * 5 },
  { key: "10Y", label: "10Y", days: 365 * 10 },
  { key: "MAX", label: "Max", days: null },
];

/** First calendar year a range needs, so the loader fetches no more than that. */
export function yearForRange(meta: SeriesMeta, range: RangeKey): number | undefined {
  const days = RANGES.find((r) => r.key === range)?.days;
  if (days == null) return undefined;
  const from = new Date(Date.parse(meta.last + "T00:00:00Z") - days * 86400000);
  return from.getUTCFullYear();
}

export function sliceRange(points: Point[], meta: SeriesMeta, range: RangeKey): Point[] {
  const days = RANGES.find((r) => r.key === range)?.days;
  if (days == null) return points;
  const cutoff = Date.parse(meta.last + "T00:00:00Z") - days * 86400000;
  return points.filter((p) => Date.parse(p.t + "T00:00:00Z") >= cutoff);
}

// ── Frequency resampling ────────────────────────────────────────────────────
//
// The spec asks for every series "daily, weekly, monthly, quarterly, year-end
// and maximum available history". The store keeps each series at its NATIVE
// frequency — whatever its source publishes — and this converts a stored series
// down to a coarser view.
//
// DOWN ONLY, AND THE UI MUST NOT OFFER OTHERWISE. A daily series has a weekly
// view: take the last close in each week. A MONTHLY series does not — there is
// no observation inside the month to take, and the only ways to produce one are
// to interpolate or to repeat the month's value across its weeks. Both invent
// readings that were never published, which is the failure this whole book is
// built to avoid. `availableFrequencies` returns only the legitimate options so
// the coarser-than-native ones are never rendered as a choice a reader can make
// and then quietly get a fabricated answer to.
//
// PERIOD END, NOT PERIOD AVERAGE. Each bucket takes its LAST observation, which
// is what "year-end" means and what every one of these publishers quotes. An
// average would be a different measurement wearing the same label.

export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

/** Coarseness order. A series can be resampled to its own frequency or coarser. */
const FREQ_ORDER: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

export const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Year-end",
};

/**
 * The frequencies this series can honestly be shown at: its own, and every
 * coarser one. Never a finer one — see the note above.
 */
export function availableFrequencies(native: string | undefined): Frequency[] {
  const i = FREQ_ORDER.indexOf((native ?? "daily") as Frequency);
  return FREQ_ORDER.slice(i < 0 ? 0 : i);
}

/** The bucket a date falls in, as a sortable key. */
function bucketKey(t: string, to: Frequency): string {
  const [y, m, d] = t.split("-");
  switch (to) {
    case "annual": return y;
    case "quarterly": return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
    case "monthly": return `${y}-${m}`;
    case "weekly": {
      // ISO week, so a week that straddles a month or a year stays one bucket.
      const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      const day = dt.getUTCDay() || 7;              // Monday = 1 … Sunday = 7
      dt.setUTCDate(dt.getUTCDate() + 4 - day);     // Thursday decides the year
      const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
      const week = Math.ceil(((dt.getTime() - yearStart) / 86400000 + 1) / 7);
      return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    }
    default: return t;
  }
}

export type Resampled = {
  points: Point[];
  /**
   * True when the final bucket has not closed yet — the current month is not
   * over, the year is still running. The point is still the latest thing the
   * source published, so it is kept, but a caller that labels the view
   * "year-end" has to say that the last one is not a year end.
   */
  lastBucketOpen: boolean;
};

/**
 * Resample to a coarser frequency, taking the LAST observation in each bucket.
 *
 * A request to resample to the series' own frequency, or to a finer one, returns
 * the points untouched rather than throwing: the UI should not offer a finer
 * option at all, and if one reaches here the honest fallback is the real data.
 */
export function resample(points: Point[], native: string | undefined, to: Frequency): Resampled {
  const from = (native ?? "daily") as Frequency;
  if (!points.length) return { points, lastBucketOpen: false };
  if (FREQ_ORDER.indexOf(to) <= FREQ_ORDER.indexOf(from)) return { points, lastBucketOpen: false };

  const last = new Map<string, Point>();
  for (const p of points) last.set(bucketKey(p.t, to), p);   // insertion order = chronological
  const out = [...last.values()];

  // Has the last bucket closed? Compared against the series' own newest
  // observation rather than today's date, because a series is often days or
  // weeks behind and "today" would call every final bucket open.
  const newest = points[points.length - 1].t;
  const [y, m, d] = newest.split("-").map(Number);
  const endsBucket =
    to === "annual" ? m === 12 && d >= 28
    : to === "quarterly" ? m % 3 === 0 && d >= 28
    : to === "monthly" ? d >= 28
    : new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;      // Friday
  return { points: out, lastBucketOpen: !endsBucket };
}

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * A level in its OWN unit. The unit travels with the series from the catalogue,
 * because Yahoo quotes the grains, cotton, sugar and coffee in US CENTS: reading
 * 639.75 as $639/bushel rather than ¢639 is a 100x error that looks like a
 * perfectly ordinary price on a chart.
 */
export function fmtLevel(v: number | null | undefined, unit: string): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const dp = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : Math.abs(v) >= 1 ? 3 : 4;
  const n = v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  if (unit === "%") return `${n}%`;
  if (unit === "index") return n;
  if (unit.startsWith("USc")) return `¢${n}`;
  if (unit.startsWith("USD")) return `$${n}`;
  if (unit.startsWith("INR")) return `₹${n}`;
  return n;
}

/** The unit's denominator, for an axis label — "USD/bbl" → "per bbl". */
export function unitSuffix(unit: string): string {
  const i = unit.indexOf("/");
  return i === -1 ? "" : ` per ${unit.slice(i + 1)}`;
}

/**
 * A return, formatted for what it IS.
 *
 * A yield series reports the ABSOLUTE change in basis points, because the
 * percentage change of a percentage is not a thing anyone means: the US 10-year
 * going 0.52% → 4.28% is "+376bp", not "+723%".
 */
export function fmtReturn(v: number | null | undefined, kind: SeriesKind): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (kind === "yield") {
    const bp = Math.round(v * 100);
    return `${bp >= 0 ? "+" : ""}${bp}bp`;
  }
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export const returnTone = (v: number | null | undefined) =>
  typeof v !== "number" || !Number.isFinite(v) ? "text-slate-500" : v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-slate-400";

/** Group entries by their `group` field, preserving catalogue order. */
export function groupBy<T extends { group: string }>(rows: T[]): { group: string; rows: T[] }[] {
  const m = new Map<string, T[]>();
  for (const r of rows) (m.get(r.group) ?? m.set(r.group, []).get(r.group)!).push(r);
  return [...m.entries()].map(([group, rs]) => ({ group, rows: rs }));
}

/**
 * Rebase a series to 100 at its first point.
 *
 * The only honest way to overlay a ₹-denominated index, a $/bbl price and a
 * ratio on one axis. It is a presentation transform, not a new measurement, and
 * the chart says "rebased to 100" whenever it is on — a reader must never think
 * they are looking at levels.
 */
export function rebase(points: Point[]): Point[] {
  const base = points.find((p) => Number.isFinite(p.v) && p.v !== 0)?.v;
  if (!base) return points;
  return points.map((p) => ({ t: p.t, v: (p.v / base) * 100 }));
}
