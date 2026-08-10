// THE RETURNS TABLE, computed from a real stored series.
//
// The FOOS spec asks for the same table under every research module: Daily,
// Weekly, Monthly, QTD, YTD, 1 Year, 3 / 5 / 10 Year CAGR, Maximum available
// CAGR, and the 52-week high and low. With a full series on disk each of these
// is an exact lookup rather than an estimate, so this file has no interpolation
// in it anywhere.
//
// THREE RULES THAT KEEP A FIGURE HONEST
//
// 1. EVERY HORIZON IS INDEPENDENT, AND A HORIZON THE SERIES CANNOT REACH IS
//    NULL. Nifty's history here starts in 2007, so its 20-year "max" is real but
//    a 10-year CAGR on a 5-year series is not — and falling back to the earliest
//    available point would label a 5-year return as a 10-year one. If there is no
//    observation at or before the horizon's start date, the cell is absent.
//
// 2. A YIELD IS NOT A PRICE. Asking "what was the return on the US 10-year
//    yield" is a category error: it went from 0.52% to 4.28%, which is +723% as
//    a ratio and +376 basis points as the thing anyone actually means. Series
//    declared `kind: "yield"` report ABSOLUTE change in percentage points, and
//    never a CAGR.
//
// 3. A RATIO ACROSS A SIGN CHANGE IS MEANINGLESS. WTI settled at −$37.63 in
//    April 2020. Any horizon whose starting value is zero or negative returns
//    null rather than a number with no interpretation.

const DAY = 86400000;
const ms = (t) => Date.parse(t + "T00:00:00Z");

/**
 * Latest point on or before `target`. Binary search — these series run to 14,000
 * points and the table asks twelve questions of each.
 * Returns null when the series does not reach back that far, which is the whole
 * point of rule 1 above.
 */
export function closeOnOrBefore(points, targetMs) {
  let lo = 0, hi = points.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ms(points[mid].t) <= targetMs) { best = points[mid]; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best;
}

/** The horizons, in the order the spec lists them. */
export const HORIZONS = [
  { key: "d1", label: "1D", back: (a) => a - 1 * DAY, annualised: false },
  { key: "w1", label: "1W", back: (a) => a - 7 * DAY, annualised: false },
  { key: "m1", label: "1M", back: (a) => a - 30 * DAY, annualised: false },
  { key: "m3", label: "3M", back: (a) => a - 91 * DAY, annualised: false },
  { key: "m6", label: "6M", back: (a) => a - 182 * DAY, annualised: false },
  { key: "qtd", label: "QTD", back: (a) => { const d = new Date(a); return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1) - DAY; }, annualised: false },
  // CALENDAR year-to-date. These are global market series and the calendar year
  // is the convention every one of their publishers quotes them on; the book's
  // own 1-April financial year governs the FAMILY's portfolio pages, not this.
  { key: "ytd", label: "YTD", back: (a) => { const d = new Date(a); return Date.UTC(d.getUTCFullYear(), 0, 1) - DAY; }, annualised: false },
  { key: "y1", label: "1Y", back: (a) => a - 365 * DAY, annualised: false },
  { key: "y3", label: "3Y", back: (a) => a - 3 * 365 * DAY, annualised: true },
  { key: "y5", label: "5Y", back: (a) => a - 5 * 365 * DAY, annualised: true },
  { key: "y10", label: "10Y", back: (a) => a - 10 * 365 * DAY, annualised: true },
  { key: "max", label: "Max", back: () => null, annualised: true },
];

/** How many days one observation covers, per publication frequency. */
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 28, quarterly: 89, annual: 360 };

/**
 * @param points ascending [{t,v}]
 * @param kind   "price" (ratio returns, CAGR over a year) | "yield" (absolute pp change)
 * @param frequency how often the source publishes — governs which horizons EXIST
 * @returns { asOf, last, returns: {key: number|null}, high52, low52, spans: {key: [from,to]} }
 */
export function computeReturns(points, kind = "price", frequency = "daily") {
  if (!points.length) return null;
  const lastPt = points[points.length - 1];
  const asOfMs = ms(lastPt.t);
  const firstMs = ms(points[0].t);
  const periodDays = PERIOD_DAYS[frequency] ?? 1;
  const out = { asOf: lastPt.t, last: lastPt.v, returns: {}, spans: {}, high52: null, low52: null };

  for (const h of HORIZONS) {
    const targetMs = h.back(asOfMs);

    // A HORIZON SHORTER THAN THE PUBLICATION PERIOD DOES NOT EXIST.
    //
    // The World Bank publishes commodity prices MONTHLY. Asking for a "1 day"
    // return of a monthly series and resolving it by nearest-earlier
    // observation returns LAST MONTH's price — a month-over-month change
    // rendered under a column headed "1D". Every horizon whose own window is
    // shorter than one observation period is absent instead, which is the same
    // rule as "a horizon the series cannot reach back to is null", applied at
    // the other end of the scale.
    if (targetMs !== null && (asOfMs - targetMs) < periodDays * 86400000) {
      out.returns[h.key] = null;
      continue;
    }

    // `max` runs from the first observation; every other horizon needs the
    // series to actually reach its start date.
    const fromPt = targetMs === null ? points[0] : (targetMs < firstMs ? null : closeOnOrBefore(points, targetMs));
    if (!fromPt || fromPt.t === lastPt.t) { out.returns[h.key] = null; continue; }

    const years = (asOfMs - ms(fromPt.t)) / (365.25 * DAY);
    let value = null;
    if (kind === "yield") {
      // Absolute change in percentage points. Never annualised — a yield that
      // moved 376bp over five years did not "compound" at anything.
      value = lastPt.v - fromPt.v;
    } else if (fromPt.v > 0 && lastPt.v > 0) {
      value = h.annualised && years >= 1
        ? ((lastPt.v / fromPt.v) ** (1 / years) - 1) * 100
        : (lastPt.v / fromPt.v - 1) * 100;
    }
    out.returns[h.key] = value === null || !Number.isFinite(value) ? null : value;
    out.spans[h.key] = [fromPt.t, lastPt.t];
  }

  // 52-week high / low over the trailing year of actual observations.
  const cutoff = asOfMs - 365 * DAY;
  let hi = -Infinity, lo = Infinity, seen = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (ms(points[i].t) < cutoff) break;
    const v = points[i].v;
    if (!Number.isFinite(v)) continue;
    if (v > hi) hi = v;
    if (v < lo) lo = v;
    seen++;
  }
  // A "52-WEEK HIGH" HAS TO DESCRIBE A YEAR, and two readings do not.
  //
  // An accumulating series starts with a single point, and reporting its own
  // value as both the high and the low of the year states a range nothing
  // measured. An ANNUAL series is worse: it has one or two observations inside
  // any 365-day window, so its "52-week range" would just be this year's figure
  // against last year's — a year-on-year change wearing the wrong label. So the
  // window must hold several observations AND span most of a year, and annual
  // series never report one at all.
  const oldestInWindow = points.find((p) => ms(p.t) >= cutoff);
  const windowDays = oldestInWindow ? (asOfMs - ms(oldestInWindow.t)) / DAY : 0;
  if (frequency !== "annual" && seen >= 8 && windowDays >= 180) { out.high52 = hi; out.low52 = lo; }
  return out;
}
