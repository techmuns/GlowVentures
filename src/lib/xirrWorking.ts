import type { DatedFlow } from "./xirr";

/** Explain the existing XIRR result without substituting a different return. */
export function xirrWorking(flows: readonly DatedFlow[], annualPct: number | null, days: number | null, annualised: boolean) {
  if (annualPct == null || !Number.isFinite(annualPct) || annualPct <= -100
    || days == null || !Number.isFinite(days) || days <= 0 || !flows.length
    || flows.some((f) => !Number.isFinite(f.amount) || !Number.isFinite(f.date.getTime()))) return null;
  const start = Math.min(...flows.map((f) => f.date.getTime()));
  const yearFactor = 1 + annualPct / 100;
  let paid = 0, returned = 0, paidAtStart = 0, returnedAtStart = 0;
  for (const f of flows) {
    const atStart = f.amount / yearFactor ** ((f.date.getTime() - start) / (365 * 864e5));
    if (f.amount < 0) { paid -= f.amount; paidAtStart -= atStart; }
    else { returned += f.amount; returnedAtStart += atStart; }
  }
  const growthFactor = annualised ? yearFactor : yearFactor ** (days / 365);
  if (![paid, returned, paidAtStart, returnedAtStart, growthFactor].every(Number.isFinite)
    || !(paid > 0) || !(returned > 0)) return null;
  return {
    paid, returned, gain: returned - paid, start: new Date(start).toISOString().slice(0, 10),
    paidAtStart, returnedAtStart, yearFactor, growthFactor,
    pct: (growthFactor - 1) * 100,
  };
}
