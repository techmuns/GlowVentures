// ── THE XIRR MADE VISIBLE (the "Inspector", Addepar-style) ──────────────────
//
// The money-weighted return (XIRR) is the one figure on the dashboard whose
// working a reader cannot see: `xirr()` (lib/xirr.ts) solves
// Σ CFₜ ÷ (1 + r)^((t − t₀)/365) = 0 for the rate r, but only the answer is
// shown. This exposes HOW that answer is found — the same transparency a
// competitor's "Inspector" panel gives: the net present value of the row's own
// dated cash flows at a sweep of candidate yearly rates, crossing zero at the
// rate the figure reports.
//
// It never invents a number: it evaluates the SAME flows the figure was solved
// from (`ReturnWorking.flows`), at rates around the SAME solved rate. The solver
// stays the single source of the published rate; this only illustrates it.

import type { DatedFlow } from "./xirr";

const YEAR_MS = 365 * 864e5;

/**
 * The net present value of a set of dated cash flows at a yearly rate — the
 * left-hand side of the XIRR equation. Zero at the solved rate; the sign tells
 * a reader which way the rate would move. Time runs from the earliest flow, the
 * same origin the solver uses.
 */
export function npvAtRate(flows: readonly DatedFlow[], rate: number): number {
  if (!flows.length || !(rate > -1)) return NaN;
  const origin = Math.min(...flows.map((f) => f.date.getTime()));
  let npv = 0;
  for (const f of flows) {
    const years = (f.date.getTime() - origin) / YEAR_MS;
    npv += f.amount / Math.pow(1 + rate, years);
  }
  return npv;
}

export type ConvergenceRow = {
  /** The candidate yearly rate, as a fraction (0.25 = 25%). */
  rate: number;
  /** The NPV of the flows at that rate. */
  npv: number;
  /** True on the row that is the solved rate — where NPV is zero. */
  solution: boolean;
};

/**
 * A sweep of candidate yearly rates around the solved rate, with the NPV at
 * each — the root-finding made legible. The solved rate is always included and
 * flagged; the sweep straddles it so the NPV's sign change is visible. Returns
 * [] when no valid solved rate is given.
 */
export function xirrConvergence(flows: readonly DatedFlow[], rate: number, points = 8): ConvergenceRow[] {
  if (!flows.length || !Number.isFinite(rate) || !(rate > -1)) return [];
  const span = Math.max(0.4, Math.abs(rate) * 0.5 + 0.2); // always wide enough to straddle the root
  const lo = Math.max(-0.95, rate - span), hi = rate + span;
  const seen = new Set<number>();
  const rows: ConvergenceRow[] = [];
  const add = (r: number, solution = false) => {
    if (!(r > -1)) return;
    const key = Math.round(r * 1e6);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ rate: r, npv: npvAtRate(flows, r), solution });
  };
  const n = Math.max(2, points);
  for (let i = 0; i < n; i++) add(lo + ((hi - lo) * i) / (n - 1));
  add(rate, true);
  return rows.sort((a, b) => a.rate - b.rate);
}
