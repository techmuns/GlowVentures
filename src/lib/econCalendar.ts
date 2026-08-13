// The economic release calendar — types, fetch and the derived figures.
//
// Backed by `functions/api/econ-calendar.js`; see the note at the top of that
// file for what was measured and why this source was chosen over Bloomberg,
// TradingEconomics, moneycontrol, Sensibull and Nasdaq.
//
// EVERY RULE IN HERE IS ONE WHERE THE WRONG ANSWER LOOKS PLAUSIBLE ON SCREEN.
import { isOutage, outageSentence } from "@/lib/upstreamStatus";

export type EconEvent = {
  id: string;
  /** ISO-8601 UTC instant the figure is released. */
  date: string;
  country: string | null;
  title: string;
  indicator: string | null;
  category: string | null;
  /** The month/quarter the reading is FOR — "Jul", "Q2". Not the release date. */
  period: string | null;
  referenceDate: string | null;
  /** -1 low · 0 medium · 1 high, as the upstream ranks it. Null = unranked. */
  importance: number | null;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit: string | null;
  currency: string | null;
  source: string | null;
  sourceUrl: string | null;
  comment: string | null;
};

export type CalendarResponse = {
  ok: true;
  from: string; to: string; countries: string[];
  events: EconEvent[];
  count: number;
  truncated: boolean;
  truncatedSlices: number;
  slices: number;
  slicesFailed: number;
  source: string;
  fetchedAt: string;
  cached?: boolean;
  stale?: boolean;
  ageS?: number;
  upstreamFailure?: { failureCode: string; upstreamStatus?: number | null; detail?: string | null };
};
export type CalendarError = { ok: false; failureCode: string; upstreamStatus?: number | null; detail?: string | null };

export const isCalendarError = (r: CalendarResponse | CalendarError): r is CalendarError => r.ok === false;

export async function fetchCalendar(from: string, to: string, countries: string[]): Promise<CalendarResponse | CalendarError> {
  const q = new URLSearchParams({ from, to });
  if (countries.length) q.set("countries", countries.join(","));
  try {
    const r = await fetch(`/api/econ-calendar?${q}`);
    const d = await r.json().catch(() => null);
    if (!d || d.ok !== true) {
      return { ok: false, failureCode: d?.failureCode ?? `HTTP_${r.status}`, upstreamStatus: d?.upstreamStatus ?? null, detail: d?.detail ?? null };
    }
    return d as CalendarResponse;
  } catch (e) {
    return { ok: false, failureCode: "NETWORK", upstreamStatus: null, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The reader's sentence for a calendar that could not be fetched. */
export function calendarReason(e: CalendarError): string {
  if (e.failureCode === "RANGE_TOO_WIDE") return "That date range is wider than this feed will answer in one request.";
  if (e.failureCode === "BAD_RANGE") return "That date range could not be read.";
  if (isOutage(e)) return outageSentence(e, "the release calendar");
  return `The calendar feed returned an error${e.upstreamStatus ? ` (${e.upstreamStatus})` : ""}.`;
}

// ── Importance ──────────────────────────────────────────────────────────────
//
// THE MAPPING WAS VERIFIED, NOT ASSUMED. Across three weeks of US events the
// upstream's `1` is Non Farm Payrolls, Unemployment Rate, Inflation Rate YoY,
// Core Inflation Rate and the ISM PMIs; its `-1` is bill auctions and PMI
// finals. So -1 = low, 0 = medium, 1 = high. Reading it the other way round
// would put "High" against a 3-month bill auction — a fabricated classification
// of exactly the kind this book caught once before in `VAL_METHODS[i % 5]`.
//
// An UNRANKED event (null) is not silently demoted to low: it reports as
// unranked, so a filter on importance can say what it is excluding.
export type Impact = "high" | "medium" | "low" | "unranked";
export const impactOf = (importance: number | null): Impact =>
  importance === 1 ? "high" : importance === 0 ? "medium" : importance === -1 ? "low" : "unranked";

export const IMPACT_LABEL: Record<Impact, string> = {
  high: "High", medium: "Medium", low: "Low", unranked: "Unranked",
};

/** The upstream's category codes, spelled out. An unknown code shows as-is. */
export const CATEGORY_LABEL: Record<string, string> = {
  prce: "Prices & inflation",
  lbr: "Labour",
  gdp: "Growth",
  mny: "Money & rates",
  gov: "Government",
  trd: "Trade",
  bsnss: "Business",
  cnsm: "Consumer",
  hse: "Housing",
  bnd: "Bonds",
  enrg: "Energy",
  mrkt: "Markets",
};
export const categoryLabel = (c: string | null) => (c ? CATEGORY_LABEL[c] ?? c : "Uncategorised");

// ── Formatting a value, WITH ITS UNIT ───────────────────────────────────────
//
// A release calendar's whole content is numbers whose meaning is in their unit:
// 4.45 is a percent, 692.87 is billions of dollars, 1800 is thousands of jobs.
// The upstream gives the unit, so it travels with the figure — the same rule
// the harvest store applies to a commodity price, and for the same reason
// (reading ¢639 as $639 is a 100x error that looks like an ordinary price).
export function fmtEconValue(v: number | null, unit: string | null, currency: string | null): string | null {
  if (v == null) return null;
  const n = Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (!unit) return n;
  const u = unit.trim();
  // A leading-symbol unit ($, €) prefixes; everything else suffixes.
  if (/^[$€£¥₹]$/.test(u)) return `${u}${n}`;
  if (u === "%") return `${n}%`;
  // K / M / B / T are magnitudes and read better joined to the number.
  if (/^[KMBT]$/.test(u)) return `${n}${u}`;
  return `${n} ${u}${currency && /^(USD|INR|EUR|GBP|JPY)$/.test(currency) && !/[$€£¥₹]/.test(u) ? "" : ""}`;
}

/**
 * SURPRISE — actual less consensus, and ONLY when BOTH are numbers.
 *
 * This is the one figure on the page a reader acts on, and it is the same shape
 * as the IPS gap that this book already refused to compute against a defaulted
 * target: a surprise struck against a missing consensus is not a small error,
 * it is the whole actual dressed up as a beat. Most rows on a forward calendar
 * have no actual yet and many have no consensus at all, so null is the common
 * case and must stay null.
 */
export function surpriseOf(e: EconEvent): number | null {
  if (e.actual == null || e.forecast == null) return null;
  return e.actual - e.forecast;
}

/**
 * Whether a surprise is GOOD or BAD is a judgement this dashboard does not make.
 *
 * A CPI print above consensus is a bad surprise; a GDP print above consensus is
 * a good one; for an unemployment rate it is bad again. Nothing in the feed says
 * which way round an indicator runs, and colouring every beat green would assert
 * a direction for hundreds of indicators nobody classified. So the surprise is
 * shown with its SIGN and no verdict — above or below consensus, which is a
 * fact — and the reader supplies the meaning.
 */
export const surpriseDirection = (s: number | null) => (s == null ? null : s > 0 ? "above" : s < 0 ? "below" : "in line");

/** Local-time HH:MM for an event, in the reader's own zone. */
export function eventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Local calendar day (YYYY-MM-DD) for grouping — never the UTC day. */
export function eventDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * SOME EVENTS CARRY NO TIME, only a date.
 *
 * The upstream stamps those at midnight UTC (India's vehicle-sales release, for
 * instance, arrives as `2026-08-14T00:00:00.000Z`). Rendered in a local zone
 * that is behind UTC, midnight UTC lands on the PREVIOUS day — so an event with
 * no announced time would silently move a day. Treated as day-only and shown
 * without a clock, which is what the source actually knows.
 */
export const isDayOnly = (iso: string) => iso.endsWith("T00:00:00.000Z") || iso.endsWith("T00:00:00Z");
export const dayOf = (iso: string) => (isDayOnly(iso) ? iso.slice(0, 10) : eventDay(iso));

/** Group events into days, in chronological order. */
export function byDay(events: EconEvent[]): { day: string; events: EconEvent[] }[] {
  const m = new Map<string, EconEvent[]>();
  for (const e of events) {
    const d = dayOf(e.date);
    (m.get(d) ?? m.set(d, []).get(d)!).push(e);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, evs]) => ({ day, events: evs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title))) }));
}

/** ISO date N days from a base, as YYYY-MM-DD. */
export function shiftDate(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
