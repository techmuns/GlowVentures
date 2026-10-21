/**
 * ── A SCHEME'S OWN RETURNS, AND THE ONES ITS NAV SERIES CANNOT SUPPORT ───────
 *
 * The fund look-through carries each scheme's published returns (1M … 10Y),
 * each struck from one NAV to another. Passed through verbatim, DSP's Gold ETF
 * read 1M −89.3% · 3M −89.9% · 6M −90.4% · 1Y −86.1% · 3Y −36.9% p.a., and the
 * card called those returns complete. Gold did not fall 89% in a month: the
 * store's own figures say the NAV was 137.7268 on 3 Aug 2026 and 14.7633 on
 * 9 Sep 2026. That is the scheme's UNIT changing (a 1:10 split of its units),
 * not its value, and every return whose window spans the step compares a price
 * per old unit with a price per new unit.
 *
 * THE RULE, AND WHY IT IS A CLAIM ABOUT MARKETS RATHER THAN A FITTED TOLERANCE.
 * No scheme's NAV halves or doubles inside a quarter by market movement — the
 * same claim the published-NAV gate (Stage 10bn) makes between two statement
 * dates. So where two consecutive points of the series a return is struck on,
 * at most `UNIT_BREAK_MAX_DAYS` apart, differ by `UNIT_BREAK_FACTOR` or more
 * either way, the series crosses a unit event and every return spanning that
 * step is REFUSED with the reason, naming the step.
 *
 * THE INTERVAL BOUND IS LOAD-BEARING, AND THIS STORE PROVES IT. DSP's Silver
 * ETF genuinely rose 2.07× between 9 Sep 2025 and 9 Mar 2026 (181 days) — a
 * factor-of-two rule with no interval would refuse a real rally. Measured over
 * every scheme in `public/lookthrough/`, the largest move between points a
 * quarter or less apart that is NOT a unit event is +20.8% (Motilal Oswal
 * Active Momentum over 92 days); the two unit events are ÷9.3 in 36 days.
 *
 * NEVER ADJUSTED. The source publishes no split factor, and the step itself
 * mixes the split with a month of market movement, so any factor derived from
 * it would be a figure nobody published — Stage 10e's `shareCountBreaks` rule:
 * reported, never corrected. A return whose window lies wholly after the step
 * (or wholly before it) is untouched and shown as the source struck it.
 *
 * WHAT IT CANNOT SEE, stated rather than papered over: a unit event further back
 * than the series' quarterly sampling (between the 1Y and 3Y start points, two
 * years apart) is indistinguishable here from the market, so it is not refused.
 */
import type { FundPortfolio, FundReturn } from "./lookthrough";
import { fmtDate, fmtNum } from "./format";

/** A step of at least this factor, either way… */
export const UNIT_BREAK_FACTOR = 2;
/** …between two points at most this many days apart, is a unit event. */
export const UNIT_BREAK_MAX_DAYS = 92;

export type NavPoint = { date: string; nav: number };

/** A step in the NAV series no market makes: a change in the unit. */
export type UnitBreak = {
  from: NavPoint;
  to: NavPoint;
  /** `to.nav / from.nav` — below 1 where the units were split. */
  factor: number;
  days: number;
};

export type SchemeReturn = FundReturn & {
  /** The source's own label — `1M`, `3Y`. */
  period: string;
  /**
   * The source's own basis, read case-insensitively. The store writes `cagr`;
   * a test for `"CAGR"` alone marked every annualised figure "Simple".
   */
  annualised: boolean;
  /** The unit event this window spans, where it spans one — the return is then refused. */
  crosses: UnitBreak | null;
  /** Why the figure is not shown, or null where it is. */
  refused: string | null;
};

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const isNav = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Every dated NAV the store states for this scheme — each return's start and
 * end, and the current NAV with the one before it — in date order. One value
 * per date (the first stated wins; the store states each date once).
 */
export function navSeries(p: Pick<FundPortfolio, "nav" | "returns">): NavPoint[] {
  const pts = new Map<string, number>();
  const add = (d: string | null | undefined, v: number | null | undefined) => {
    if (d && isNav(v) && !pts.has(d)) pts.set(d, v);
  };
  for (const r of Object.values(p.returns ?? {})) {
    add(r.startDate, r.startNav);
    add(r.endDate, r.endNav);
  }
  add(p.nav?.prevDate, p.nav?.prev);
  add(p.nav?.date, p.nav?.value);
  return [...pts].map(([date, nav]) => ({ date, nav })).sort((a, b) => a.date.localeCompare(b.date));
}

/** The steps between consecutive points that are unit events rather than market moves. */
export function unitBreaks(series: readonly NavPoint[]): UnitBreak[] {
  const out: UnitBreak[] = [];
  for (let i = 1; i < series.length; i++) {
    const from = series[i - 1], to = series[i];
    const d = days(from.date, to.date);
    const factor = to.nav / from.nav;
    if (d <= UNIT_BREAK_MAX_DAYS && (factor >= UNIT_BREAK_FACTOR || factor <= 1 / UNIT_BREAK_FACTOR)) {
      out.push({ from, to, factor, days: d });
    }
  }
  return out;
}

/** The factor in words a reader can check against the two NAVs: "÷ 9.3" or "× 2.4". */
export const stepWords = (b: UnitBreak) =>
  b.factor < 1 ? `÷ ${(1 / b.factor).toFixed(1)}` : `× ${b.factor.toFixed(1)}`;

/** The sentence a refused return carries — the step, its size, and why it is not a return. */
export function unitBreakReason(b: UnitBreak): string {
  return `The NAV this return is struck on steps from ${fmtNum(b.from.nav, 4)} on ${fmtDate(b.from.date)} to ${fmtNum(b.to.nav, 4)} on ${fmtDate(b.to.date)} — ${stepWords(b)} in ${b.days} days. No scheme's NAV halves or doubles inside a quarter by market movement: this is a change in the unit (a split or consolidation of the scheme's units), so a return across it compares two different units. It is not adjusted — the source publishes no split factor.`;
}

/**
 * The scheme's returns in the source's own order, each marked annualised or
 * not, and each REFUSED where its window spans a unit event.
 */
export function schemeReturns(p: Pick<FundPortfolio, "nav" | "returns">): {
  rows: SchemeReturn[];
  breaks: UnitBreak[];
  refused: number;
} {
  const breaks = unitBreaks(navSeries(p));
  const rows = Object.entries(p.returns ?? {}).map(([period, r]): SchemeReturn => {
    const crosses = r.startDate && r.endDate
      ? breaks.find((b) => b.from.date >= r.startDate! && b.to.date <= r.endDate!) ?? null
      : null;
    return {
      ...r,
      period,
      annualised: /^cagr$/i.test(r.kind ?? ""),
      crosses,
      refused: crosses ? unitBreakReason(crosses) : null,
    };
  });
  return { rows, breaks, refused: rows.filter((r) => r.refused).length };
}

/**
 * The unit event, if any, that falls AFTER a holding's statement date — which
 * means the statement counts the scheme's EARLIER unit and the NAV now published
 * is on the new one. A statement dated after the step counts the new unit.
 */
export function breakAfter(breaks: readonly UnitBreak[], statementDate: string | null | undefined): UnitBreak | null {
  if (!statementDate) return null;
  return breaks.find((b) => b.from.date >= statementDate) ?? null;
}
