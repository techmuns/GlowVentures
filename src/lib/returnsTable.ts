// The client spec's RETURNS TABLE, for one security.
//
//   Daily · Weekly · Monthly · Quarter-to-Date · Year-to-Date · 1 Year ·
//   3 / 5 / 10 Year CAGR · Maximum available CAGR · 52-week high / low
//
// WHY THIS IS A TABLE AND NOT A CHART
// ───────────────────────────────────
// The spec also asks for interactive price charts over adjustable periods. The
// muns `market_data` endpoint cannot serve one: whatever you send, it returns a
// four-row PREVIEW of the window — a header, the first two rows, a literal
// "...", and the last two — and the real series is written to a path on the
// API's own disk that no documented endpoint serves. See the long note at the
// top of functions/api/history.js.
//
// What that preview DOES answer reliably is "what did this close at, on or
// before date D", because the last row of a window ending at D is exactly that.
// A returns table is a set of such questions, so it is buildable and a chart is
// not. Nothing here interpolates between the points it has: the page says a
// chart needs a full-series endpoint rather than drawing a line through ten
// closes and calling it a price history.
//
// EVERY HORIZON IS INDEPENDENT. A close the feed cannot resolve leaves that ONE
// row absent with its reason; it never falls back to a nearer date, which would
// label a 9-month return as a 1-year one.
import { fetchCloses, type Close } from "./history";

/** Horizon keys, in the order the spec lists them. */
export type HorizonKey =
  | "1D" | "1W" | "1M" | "3M" | "6M" | "QTD" | "YTD"
  | "1Y" | "3Y" | "5Y" | "10Y" | "MAX";

export type Horizon = {
  key: HorizonKey;
  label: string;
  /** Days back from the as-of date, or a function for the calendar-anchored ones. */
  from: (asOf: Date) => Date;
  /** True when the window is over a year, so the return is annualised (CAGR). */
  annualised: boolean;
  years: number;
};

const d = (base: Date, days: number) => new Date(base.getTime() - days * 86400000);

/**
 * `MAX` is deliberately 20 years and labelled "Max available", not "20-year".
 * The upstream returns the earliest close it HAS within the window, so a listing
 * younger than the window answers from its own first trading day — and the row
 * shows that date, so a reader can see the period the figure actually covers.
 */
export const HORIZONS: Horizon[] = [
  { key: "1D",  label: "1 day",     from: (a) => d(a, 1),    annualised: false, years: 1 / 365 },
  { key: "1W",  label: "1 week",    from: (a) => d(a, 7),    annualised: false, years: 7 / 365 },
  { key: "1M",  label: "1 month",   from: (a) => d(a, 30),   annualised: false, years: 30 / 365 },
  { key: "3M",  label: "3 months",  from: (a) => d(a, 91),   annualised: false, years: 91 / 365 },
  { key: "6M",  label: "6 months",  from: (a) => d(a, 182),  annualised: false, years: 182 / 365 },
  {
    key: "QTD", label: "Quarter to date", annualised: false, years: 0,
    from: (a) => new Date(Date.UTC(a.getUTCFullYear(), Math.floor(a.getUTCMonth() / 3) * 3, 1)),
  },
  {
    // The INDIAN financial year, 1 April — the same window the book's own
    // performance summaries run, so the two are comparable. A calendar-year YTD
    // here would not line up with any statement in the archive.
    key: "YTD", label: "FY to date", annualised: false, years: 0,
    from: (a) => new Date(Date.UTC(a.getUTCMonth() >= 3 ? a.getUTCFullYear() : a.getUTCFullYear() - 1, 3, 1)),
  },
  { key: "1Y",  label: "1 year",           from: (a) => d(a, 365),      annualised: false, years: 1 },
  { key: "3Y",  label: "3 year (CAGR)",    from: (a) => d(a, 365 * 3),  annualised: true,  years: 3 },
  { key: "5Y",  label: "5 year (CAGR)",    from: (a) => d(a, 365 * 5),  annualised: true,  years: 5 },
  { key: "10Y", label: "10 year (CAGR)",   from: (a) => d(a, 365 * 10), annualised: true,  years: 10 },
  { key: "MAX", label: "Max available (CAGR)", from: (a) => d(a, 365 * 20), annualised: true, years: 20 },
];

export type HorizonRow = {
  key: HorizonKey;
  label: string;
  /** Date asked for. */
  askedFor: string;
  /** Trading day the close actually came from — often a day or two earlier. */
  from: Close | null;
  /** Return over the window, percent. Null when the close could not be resolved. */
  pct: number | null;
  /** True when `pct` is annualised. */
  annualised: boolean;
  /** Years actually elapsed between `from.date` and the as-of date. */
  elapsedYears: number | null;
  /** Why the row is absent, when it is. */
  reason: string | null;
};

export type ReturnsTable = {
  ticker: string;
  /** The price every return is measured TO. */
  to: number;
  asOf: string;
  rows: HorizonRow[];
  /** Horizons the feed could not answer at all. */
  unresolved: HorizonKey[];
};

const iso = (x: Date) => x.toISOString().slice(0, 10);
const YEAR_MS = 365.25 * 86400000;

/**
 * Build the table. `to` is the price the returns are measured to — the live
 * quote where one exists, otherwise the statement mark, and the caller says
 * which so the page can label the basis.
 *
 * One request, one round trip: /api/history takes a list of dates and answers
 * them concurrently, so twelve horizons cost one call rather than twelve.
 */
export async function fetchReturnsTable(
  ticker: string,
  to: number,
  asOf: Date = new Date(),
): Promise<ReturnsTable | null> {
  if (!ticker || !(to > 0)) return null;

  const wanted = HORIZONS.map((h) => ({ h, date: iso(h.from(asOf)) }));
  // The same calendar date can serve two horizons (a quarter that began 30 days
  // ago is both QTD and 1M), so the feed is asked once per DISTINCT date.
  const dates = [...new Set(wanted.map((w) => w.date))];

  const set = await fetchCloses(dates, { ticker, country: "India" });
  if (!set) return null;

  const rows: HorizonRow[] = [];
  const unresolved: HorizonKey[] = [];
  for (const { h, date } of wanted) {
    const from = set.closes[date] ?? null;
    if (!from || !(from.close > 0)) {
      unresolved.push(h.key);
      rows.push({
        key: h.key, label: h.label, askedFor: date, from: null, pct: null,
        annualised: h.annualised, elapsedYears: null,
        reason: `the feed returned no close on or before ${date}`,
      });
      continue;
    }
    // Elapsed years are measured from the day the close ACTUALLY came from, not
    // the day asked for. On a 10-year horizon for a listing five years old those
    // differ by five years, and annualising over the wrong one is not a rounding
    // error — it is a different number.
    const elapsedYears = (asOf.getTime() - new Date(from.date + "T00:00:00Z").getTime()) / YEAR_MS;
    const total = (to - from.close) / from.close;
    const pct = h.annualised && elapsedYears >= 1
      ? (Math.pow(1 + total, 1 / elapsedYears) - 1) * 100
      : total * 100;
    rows.push({
      key: h.key, label: h.label, askedFor: date, from, pct,
      // A window the feed could only answer from inside a year is NOT annualised,
      // whatever the horizon claims: raising a 4-month return to the power of
      // three turns a 20% move into 74% a year.
      annualised: h.annualised && elapsedYears >= 1,
      elapsedYears,
      reason: null,
    });
  }
  return { ticker: set.ticker, to, asOf: iso(asOf), rows, unresolved };
}
