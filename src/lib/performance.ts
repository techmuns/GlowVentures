// Return, drawdown & benchmark analytics derived from the listed book's NAV
// history (financial year-end snapshots in BOOK_NAV_HISTORY). Every figure is
// coarse at annual granularity — the book carries only year-end marks — and the
// Return & Drawdown page says so. Trade statistics (win rate, profit factor,
// avg gain/loss) come separately from the dated ledger (loadTradeStats).
import type { NavPoint } from "./types";

// Fallback Nifty 50 closes at the NAV snapshot dates, used only when the live
// index feed can't be reached. Two of these were materially wrong — FY2025-26 was
// seeded at 24,000 against a real 22,331 (7.0% out) and Q1 FY26-27 at 24,650
// against 23,866 — which flattered alpha by about 4.5 points. They are kept only
// so a feed outage leaves a chart rather than a blank panel, and the UI says
// "estimated closes" whenever they are what's on screen.
export const NIFTY_SEED: Record<string, number> = {
  "FY2021-22": 17464, // 31 Mar 2022
  "FY2022-23": 17360, // 31 Mar 2023
  "FY2023-24": 22327, // 28 Mar 2024
  "FY2024-25": 23519, // 28 Mar 2025
  "FY2025-26": 24000, // 31 Mar 2026 — estimate, real close 22,331
  "Q1 FY26-27": 24650, // 30 Jun 2026 — estimate, real close 23,866
};

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const yearsBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / YEAR_MS;

export type YearReturn = { period: string; pct: number };
export type GrowthPoint = { period: string; portfolio: number; benchmark: number | null };
export type UnderwaterPoint = { period: string; dd: number };

export type NavAnalytics = {
  first: NavPoint; last: NavPoint; years: number;
  totalReturnPct: number; cagrPct: number;
  maxDrawdownPct: number; maxDrawdownPeriod: string;
  currentDrawdownPct: number; atHigh: boolean; recoveryLabel: string;
  bestYearPct: number; bestYearPeriod: string;
  worstYearPct: number; worstYearPeriod: string;
  positiveYears: number; totalYears: number;
  yearly: YearReturn[]; growth: GrowthPoint[]; underwater: UnderwaterPoint[];
  benchmarkReturnPct: number | null; alphaPct: number | null; benchmarkSeeded: boolean;
};

/**
 * @param benchmarkCloses Live index closes keyed by the NAV snapshot's *date*
 *   (not its period label). Omit — or pass null — to fall back to NIFTY_SEED,
 *   which the caller must then label as estimated.
 */
export function navAnalytics(nav: NavPoint[], benchmarkCloses?: Record<string, number> | null): NavAnalytics | null {
  if (!nav || nav.length < 2) return null;
  const first = nav[0], last = nav[nav.length - 1];
  const years = yearsBetween(first.date, last.date);
  const totalReturnPct = first.nav > 0 ? (last.nav / first.nav - 1) * 100 : 0;
  const cagrPct = years > 0 && first.nav > 0 ? (Math.pow(last.nav / first.nav, 1 / years) - 1) * 100 : 0;

  // Year-on-year change between consecutive snapshots.
  const yearly: YearReturn[] = [];
  for (let i = 1; i < nav.length; i++) {
    yearly.push({ period: nav[i].period, pct: nav[i - 1].nav > 0 ? (nav[i].nav / nav[i - 1].nav - 1) * 100 : 0 });
  }
  const positiveYears = yearly.filter((y) => y.pct > 0).length;
  const best = yearly.reduce((a, b) => (b.pct > a.pct ? b : a), yearly[0]);
  const worst = yearly.reduce((a, b) => (b.pct < a.pct ? b : a), yearly[0]);

  // Drawdown vs the running peak at each snapshot (0 or negative).
  let peak = nav[0].nav;
  let maxDrawdownPct = 0, maxDrawdownPeriod = nav[0].period, troughIdx = 0;
  const underwater: UnderwaterPoint[] = nav.map((pt, i) => {
    if (pt.nav > peak) peak = pt.nav;
    const dd = peak > 0 ? (pt.nav / peak - 1) * 100 : 0;
    if (dd < maxDrawdownPct) { maxDrawdownPct = dd; maxDrawdownPeriod = pt.period; troughIdx = i; }
    return { period: pt.period, dd };
  });
  const currentDrawdownPct = underwater[underwater.length - 1].dd;
  const atHigh = currentDrawdownPct > -0.05;

  // Recovery: first snapshot after the trough that regains the prior peak.
  let recoveryLabel = "no drawdown";
  if (maxDrawdownPct < 0) {
    const recoverIdx = underwater.findIndex((u, i) => i > troughIdx && u.dd > -0.05);
    if (recoverIdx > troughIdx) {
      const yrs = yearsBetween(nav[troughIdx].date, nav[recoverIdx].date);
      recoveryLabel = yrs <= 1.25 ? "~1 year" : `~${yrs.toFixed(1)} years`;
    } else {
      recoveryLabel = "in progress";
    }
  }

  // Growth of ₹100 — portfolio vs benchmark, rebased to the first snapshot.
  // Live closes win outright; the seed is only reached for when the feed is down,
  // and it's all-or-nothing so the line can never mix real and estimated points.
  const live = benchmarkCloses && benchmarkCloses[first.date] ? benchmarkCloses : null;
  const closeAt = (pt: NavPoint) => (live ? live[pt.date] : NIFTY_SEED[pt.period]) ?? null;
  const b0 = closeAt(first);
  const growth: GrowthPoint[] = nav.map((pt) => {
    const b = closeAt(pt);
    return {
      period: pt.period,
      portfolio: first.nav > 0 ? (pt.nav / first.nav) * 100 : 100,
      benchmark: b0 && b ? (b / b0) * 100 : null,
    };
  });
  const bLast = closeAt(last);
  const benchmarkReturnPct = b0 && bLast ? (bLast / b0 - 1) * 100 : null;
  const alphaPct = benchmarkReturnPct == null ? null : totalReturnPct - benchmarkReturnPct;

  return {
    first, last, years, totalReturnPct, cagrPct,
    maxDrawdownPct, maxDrawdownPeriod, currentDrawdownPct, atHigh, recoveryLabel,
    bestYearPct: best.pct, bestYearPeriod: best.period,
    worstYearPct: worst.pct, worstYearPeriod: worst.period,
    positiveYears, totalYears: yearly.length,
    yearly, growth, underwater,
    benchmarkReturnPct, alphaPct, benchmarkSeeded: !live,
  };
}
