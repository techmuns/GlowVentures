// THE CASH FLOW STATEMENT AND THE EARNINGS CALENDAR — the two things the
// company page asks for that no wired endpoint supplied.
//
// `/api/research?kind=statements` fetches `fastapi.muns.io/financials/<T>.NS`.
// Measured 2026-08-12 (see `docs/API-PROBE.md`) it returns four sections —
// Income Statement, Balance Sheet, **Cash Flow Statement**, **Calendar
// Information** — where the screener document behind `kind=financials` carries
// neither of the last two. The plain ticker (`RELIANCE`, no suffix) returns
// "No data available" for every section, which reads as "India is unsupported"
// and is not: the endpoint is yfinance-backed and wants the exchange suffix.
//
// ── THE CURRENCY SYMBOL IN THIS DOCUMENT CARRIES NO INFORMATION ─────────────
//
// Every figure is printed with a leading `$`. The figures are RUPEES:
//
//     Reliance, 2025-03-31   Net Income  "$696.48B"  → ₹69,648 crore, as reported
//                            D&A         "$531.36B"  → ₹53,136 crore, as reported
//
// and the document proves the symbol is a formatter artifact rather than a
// currency claim entirely on its own — it prints
//
//     | Basic Average Shares | $2.61B |
//
// A share count is not dollars. The `$` is applied to every numeric cell in the
// response, so it says nothing about any of them.
//
// ── WHICH IS WHY THE UNIT IS RECONCILED, NEVER ASSUMED ──────────────────────
//
// Knowing the symbol is meaningless is not the same as knowing the figures are
// rupees, and "it must be rupees, it's an NSE ticker" is a plausible default —
// the exact thing this book refuses. So the unit is ESTABLISHED AT RUNTIME
// against the screener document the page already holds for the same company,
// and money is rendered only where that check passes. Two independent
// comparisons, because they establish different things:
//
//   • EPS — a per-share figure carries no crore/million scaling, so agreement
//     between the two sources establishes the CURRENCY.
//   • Revenue — screener prints ₹ crore and this prints plain rupees, so a
//     ratio of 1e7 establishes the SCALE.
//
// Measured on ABCAPITAL: EPS 14.41 against screener's 14.75, and revenue
// 459.27e9 / 1e7 = 45,927 against screener's 45,513 — 0.9% apart. A company
// where either check fails renders absent with the failure named, because a
// cash flow statement in the wrong currency is worse than no cash flow
// statement: every figure on it is wrong by a factor of ninety.
//
// ── AND THE FIGURES ARE PRE-ROUNDED ─────────────────────────────────────────
//
// "$1.07T" is three significant figures. Nothing may be DERIVED from these —
// no margin, no growth rate, no total — because the error compounds and the
// result would look as precise as the arithmetic that produced it. They are
// displayed at the precision they arrive with and the panel says so.

import {
  parseFinancials, parsePeriod, rowAny, tableNamed,
  type FinancialDoc, type Period,
} from "@/lib/financialTables";

export type ScaledCell = {
  /** The value in base units — rupees for money, plain count for shares. */
  value: number | null;
  /** The magnitude suffix the source printed, if any. */
  suffix: "T" | "B" | "M" | "K" | null;
  /** True when the source prefixed a currency symbol. Says nothing about WHICH. */
  symbol: boolean;
  /** The cell exactly as printed, for a tooltip and for the check report. */
  raw: string;
};

const MAGNITUDES: Record<string, number> = { T: 12, B: 9, M: 6, K: 3 };

/**
 * Apply a magnitude suffix by MOVING THE DECIMAL POINT, not by multiplying.
 *
 * `1.07 * 1e12` is 1070000000000.0001 in binary floating point. That is not a
 * rounding curiosity in a book whose whole discipline is that a figure ties to
 * its source: the source printed 1.07T and the stored value must be the number
 * that string names, or a reconciliation against another document fails on
 * arithmetic nobody performed. Shifting the point in the decimal string gives
 * exactly the printed figure.
 */
function shiftDecimal(mantissa: string, places: number): number {
  const neg = mantissa.startsWith("-");
  let s = neg ? mantissa.slice(1) : mantissa;
  if (s.startsWith(".")) s = `0${s}`;
  const dot = s.indexOf(".");
  const digits = dot < 0 ? s : s.slice(0, dot) + s.slice(dot + 1);
  let point = (dot < 0 ? s.length : dot) + places;
  let padded = digits;
  if (point < 1) { padded = "0".repeat(1 - point) + digits; point = 1; }
  while (padded.length < point) padded += "0";
  const text = point >= padded.length ? padded : `${padded.slice(0, point)}.${padded.slice(point)}`;
  return Number(`${neg ? "-" : ""}${text}`);
}

/**
 * One printed cell of the yfinance-backed statements.
 *
 * `N/A` IS NOT ZERO. It fills the oldest column of every table here (the
 * five-year cash flow reports four years of figures), and reading it as 0 would
 * put a measured-looking zero at the start of every series.
 */
export function parseScaled(raw: string): ScaledCell {
  const t = (raw ?? "").trim();
  const out: ScaledCell = { value: null, suffix: null, symbol: false, raw: t };
  if (!t || /^n\.?\/?a\.?$/i.test(t) || t === "-" || t === "—") return out;

  let s = t;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  // The symbol may sit before or after the sign — "$-48.80M" and "-$48.80M" are
  // both in this corpus.
  if (/[$₹]/.test(s)) { out.symbol = true; s = s.replace(/[$₹]/g, ""); }
  s = s.replace(/[,\s]/g, "");

  const m = /^(-?\d*\.?\d+)([TBMK])?$/i.exec(s);
  if (!m) return out;
  if (!Number.isFinite(Number(m[1]))) return out;
  const suffix = m[2] ? (m[2].toUpperCase() as "T" | "B" | "M" | "K") : null;
  out.suffix = suffix;
  const v = shiftDecimal(m[1], suffix ? MAGNITUDES[suffix] : 0);
  out.value = neg ? -v : v;
  return out;
}

export type ScaledRow = { label: string; cells: ScaledCell[] };
export type ScaledTable = { name: string; periods: Period[]; rows: ScaledRow[] };

export type CalendarEntry = { label: string; value: string; date: string | null; number: number | null };

export type StatementsDoc = {
  tables: ScaledTable[];
  calendar: CalendarEntry[];
  /** True when the document is the "No data available" stub — a missing suffix. */
  empty: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the statements document.
 *
 * Sectioning and the pipe grid come from `parseFinancials`, which already keeps
 * every cell's RAW TEXT on the row — so the cells are re-read here with this
 * document's own magnitude rules without touching the screener parser or its
 * fixture-backed behaviour.
 */
export function parseStatements(markdown: string): StatementsDoc {
  const doc: FinancialDoc = parseFinancials(markdown ?? "");
  const tables: ScaledTable[] = doc.tables.map((t) => ({
    name: t.name,
    periods: t.periods,
    rows: t.rows.map((r) => ({ label: r.label, cells: r.text.slice(1).map(parseScaled) })),
  }));

  // Calendar Information is not a table — it is "**Earnings Date**: 2026-10-29"
  // lines, which `parseFinancials` keeps as prose rather than discarding.
  const calendar: CalendarEntry[] = [];
  const cal = doc.prose.find((p) => /^calendar information$/i.test(p.name));
  if (cal) {
    for (const line of cal.text.split("\n")) {
      const m = /^\s*\*{0,2}([^:*]+?)\*{0,2}\s*:\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2].trim();
      const n = Number(value.replace(/[,\s]/g, ""));
      calendar.push({
        label: m[1].trim(),
        value,
        date: ISO_DATE.test(value) ? value : null,
        number: Number.isFinite(n) && !ISO_DATE.test(value) ? n : null,
      });
    }
  }

  const empty = !tables.length && !calendar.length
    && /no data available/i.test(markdown ?? "");
  return { tables, calendar, empty };
}

// ── Reading it ──────────────────────────────────────────────────────────────

export const statementNamed = (d: StatementsDoc, name: string): ScaledTable | null =>
  d.tables.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;

/** A row by exact label, case-insensitively. No fuzzy matching, same rule as the screener side. */
export function scaledRow(t: ScaledTable | null, label: string): ScaledRow | null {
  if (!t) return null;
  const want = label.trim().toLowerCase();
  return t.rows.find((r) => r.label.trim().toLowerCase() === want) ?? null;
}

/** The first row matching any label, in the order given. */
export function scaledRowAny(t: ScaledTable | null, labels: string[]): ScaledRow | null {
  for (const l of labels) {
    const r = scaledRow(t, l);
    if (r) return r;
  }
  return null;
}

/** The value of one row at the period whose year (and month, when both name one) matches. */
export function valueAtYear(t: ScaledTable | null, row: ScaledRow | null, year: number): number | null {
  if (!t || !row) return null;
  const i = t.periods.findIndex((p) => p.year === year);
  if (i < 0) return null;
  return row.cells[i]?.value ?? null;
}

// ── The unit check ──────────────────────────────────────────────────────────

export type UnitCheck = {
  what: string;
  /** What this comparison would establish if it passes. */
  establishes: "currency" | "scale";
  year: number | null;
  ours: number | null;
  theirs: number | null;
  /** The ratio we expect if the reading is right: 1 for EPS, 1e7 for rupees vs crore. */
  expectedRatio: number;
  ratio: number | null;
  agrees: boolean;
};

export type UnitVerdict = {
  /**
   * `confirmed` — both checks agree, money may be rendered as rupees.
   * `contradicted` — a check ran and disagreed. Render nothing monetary.
   * `unmeasurable` — the comparison could not be made at all (no screener
   *   document, or neither source reports a comparable line). Also renders
   *   nothing monetary: an unrun check is not a passed one.
   */
  verdict: "confirmed" | "contradicted" | "unmeasurable";
  checks: UnitCheck[];
  reason: string;
};

/** Within `tolerance` of the expected ratio, proportionally. */
const near = (ratio: number | null, expected: number, tolerance: number) =>
  ratio !== null && Number.isFinite(ratio) && Math.abs(ratio / expected - 1) <= tolerance;

/**
 * Establish what unit the statements are in, by reconciling against the
 * screener document for the same company.
 *
 * Tolerances are wide on purpose — 12% on EPS and 15% on revenue. The two
 * sources are not the same measurement: one is yfinance's consolidated view and
 * the other screener's, and they differ on minority interest, on which
 * subsidiaries consolidate, and on restatements. What is being tested is not
 * whether they agree to the rupee but whether they are the SAME ORDER OF
 * MAGNITUDE IN THE SAME CURRENCY — and the failure this guards against is a
 * factor of ninety, not a factor of 1.03.
 */
export function checkUnits(st: StatementsDoc, screener: FinancialDoc | null): UnitVerdict {
  const checks: UnitCheck[] = [];
  if (!screener) {
    return { verdict: "unmeasurable", checks, reason: "the screener financials for this company have not loaded, so there is nothing to reconcile the unit against" };
  }
  const pl = tableNamed(screener, "Profit & Loss");
  const income = statementNamed(st, "Income Statement");
  if (!pl || !income) {
    return { verdict: "unmeasurable", checks, reason: "one of the two documents carries no income statement, so the unit cannot be established" };
  }

  /** The newest year both documents report, so the comparison is like for like. */
  const theirYears = new Set(pl.periods.filter((p) => !p.ttm && p.year !== null).map((p) => p.year as number));
  const common = income.periods
    .map((p) => p.year)
    .filter((y): y is number => y !== null && theirYears.has(y))
    .sort((a, b) => b - a);
  const year = common[0] ?? null;

  const theirAt = (labels: string[], y: number): number | null => {
    const row = rowAny(pl, labels);
    if (!row) return null;
    const i = pl.periods.findIndex((p) => p.year === y && !p.ttm);
    return i < 0 ? null : row.values[i] ?? null;
  };

  if (year !== null) {
    // (a) CURRENCY — EPS carries no scaling, so agreement means one currency.
    const ourEps = valueAtYear(income, scaledRowAny(income, ["Basic Eps", "Diluted Eps"]), year);
    const theirEps = theirAt(["EPS in Rs", "EPS"], year);
    checks.push({
      what: "Earnings per share", establishes: "currency", year,
      ours: ourEps, theirs: theirEps, expectedRatio: 1,
      ratio: ourEps !== null && theirEps ? ourEps / theirEps : null,
      agrees: near(ourEps !== null && theirEps ? ourEps / theirEps : null, 1, 0.12),
    });

    // (b) SCALE — screener prints crore, this prints rupees.
    const ourRev = valueAtYear(income, scaledRowAny(income, ["Total Revenue", "Operating Revenue"]), year);
    const theirRev = theirAt(["Revenue", "Sales"], year);
    checks.push({
      what: "Revenue", establishes: "scale", year,
      ours: ourRev, theirs: theirRev, expectedRatio: 1e7,
      ratio: ourRev !== null && theirRev ? ourRev / theirRev : null,
      agrees: near(ourRev !== null && theirRev ? ourRev / theirRev : null, 1e7, 0.15),
    });
  }

  const ran = checks.filter((c) => c.ratio !== null);
  if (!ran.length) {
    return {
      verdict: "unmeasurable", checks,
      reason: year === null
        ? "the two documents report no year in common, so no figure can be compared"
        : "neither earnings per share nor revenue is reported under a name both documents use",
    };
  }
  const bad = ran.filter((c) => !c.agrees);
  if (bad.length) {
    return {
      verdict: "contradicted", checks,
      reason: `${bad.map((c) => c.what.toLowerCase()).join(" and ")} disagrees with the screener statements for ${year}, so the unit these figures are in is not established`,
    };
  }
  // Both checks passing is the strong case; one passing where the other could
  // not run is reported as confirmed WITH what actually ran, and the panel
  // prints the checks rather than a verdict on its own.
  return {
    verdict: "confirmed", checks,
    reason: `reconciled against the screener statements for ${year}: ${ran.map((c) => c.what.toLowerCase()).join(" and ")} agree`,
  };
}

// ── The calendar ────────────────────────────────────────────────────────────

export type EarningsCalendar = {
  earningsDate: string | null;
  exDividendDate: string | null;
  /** Analyst estimates, per share. Present only when the unit check passed. */
  epsHigh: number | null;
  epsLow: number | null;
  epsAverage: number | null;
  revenueHigh: number | null;
  revenueLow: number | null;
  revenueAverage: number | null;
};

const calNum = (d: StatementsDoc, label: string): number | null =>
  d.calendar.find((c) => c.label.toLowerCase() === label.toLowerCase())?.number ?? null;
const calDate = (d: StatementsDoc, label: string): string | null =>
  d.calendar.find((c) => c.label.toLowerCase() === label.toLowerCase())?.date ?? null;

export function earningsCalendar(d: StatementsDoc): EarningsCalendar {
  return {
    earningsDate: calDate(d, "Earnings Date"),
    exDividendDate: calDate(d, "Ex-Dividend Date"),
    epsHigh: calNum(d, "Earnings High"),
    epsLow: calNum(d, "Earnings Low"),
    epsAverage: calNum(d, "Earnings Average"),
    revenueHigh: calNum(d, "Revenue High"),
    revenueLow: calNum(d, "Revenue Low"),
    revenueAverage: calNum(d, "Revenue Average"),
  };
}

/**
 * Is a calendar date in the future, against the day the page is rendered?
 *
 * The response carries an ex-dividend date that has already passed as readily as
 * an earnings date that has not, and a past date under a heading that says
 * "next" is a wrong figure. The caller labels them differently rather than
 * hiding one.
 */
export function isUpcoming(iso: string | null, today = new Date()): boolean | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return t >= Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
}

/** The cash-flow lines worth surfacing, each by the label yfinance prints. */
export const CASH_FLOW_LINES: { label: string; labels: string[]; hint?: string }[] = [
  { label: "Operating cash flow", labels: ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"] },
  { label: "Investing cash flow", labels: ["Investing Cash Flow", "Cash Flow From Continuing Investing Activities"] },
  { label: "Financing cash flow", labels: ["Financing Cash Flow", "Cash Flow From Continuing Financing Activities"] },
  { label: "Capital expenditure", labels: ["Capital Expenditure", "Capital Expenditure Reported"] },
  { label: "Free cash flow", labels: ["Free Cash Flow"], hint: "operating cash flow less capital expenditure, as the source reports it" },
  { label: "Cash dividends paid", labels: ["Cash Dividends Paid", "Common Stock Dividend Paid"] },
  { label: "Change in working capital", labels: ["Change In Working Capital"] },
  { label: "Depreciation & amortisation", labels: ["Depreciation And Amortization", "Depreciation Amortization Depletion"] },
  { label: "Net change in cash", labels: ["Changes In Cash", "Net Income From Continuing Operations"] },
  { label: "End cash position", labels: ["End Cash Position"] },
];

export { parsePeriod };
