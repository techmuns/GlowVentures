// Money-weighted annualized return (XIRR) over irregularly-dated cash flows.
// Solves for r in  Σ cf_i / (1 + r)^(days_i / 365) = 0 , the same figure Excel's
// XIRR() returns. Sign convention: money leaving the investor is negative
// (contributions / buys), money returning is positive (sales, distributions,
// and the terminal market value).
export type DatedFlow = { date: Date; amount: number };

const YEAR_MS = 365 * 864e5;

function npv(rate: number, flows: DatedFlow[], t0: number): number {
  let acc = 0;
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / YEAR_MS;
    acc += f.amount / Math.pow(1 + rate, years);
  }
  return acc;
}

function npvDeriv(rate: number, flows: DatedFlow[], t0: number): number {
  let acc = 0;
  const base = 1 + rate;
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / YEAR_MS;
    acc += (-years * f.amount) / Math.pow(base, years + 1);
  }
  return acc;
}

// Returns the annualized rate as a decimal (0.185 = 18.5%), or null when the
// flows can't yield a rate (fewer than two flows, no sign change, no convergence).
export function xirr(flows: DatedFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  // Newton–Raphson from a 10% guess.
  let rate = 0.1;
  for (let i = 0; i < 60; i++) {
    const f = npv(rate, sorted, t0);
    const d = npvDeriv(rate, sorted, t0);
    if (!isFinite(f) || !isFinite(d) || d === 0) break;
    const next = rate - f / d;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) return next > -1 ? next : null;
    rate = next <= -0.999999 ? -0.999999 : next;
  }

  // Bisection fallback: bracket a sign change between -99.99% and a large rate.
  let lo = -0.9999, hi = 100;
  let flo = npv(lo, sorted, t0);
  if (flo * npv(hi, sorted, t0) > 0) return null; // no bracket → give up rather than guess
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid, sorted, t0);
    if (Math.abs(fmid) < 1e-7 || (hi - lo) / 2 < 1e-9) return mid;
    if (flo * fmid < 0) hi = mid;
    else { lo = mid; flo = fmid; }
  }
  return (lo + hi) / 2;
}
