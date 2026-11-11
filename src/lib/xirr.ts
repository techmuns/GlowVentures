// XIRR solves sum(cash / (1 + rate) ** elapsedYears) = 0. A rate is
// published only after its inputs, uniqueness and numerical residual are checked.
export type DatedFlow = { date: Date; amount: number };
type Term = { time: number; sign: number; log: number };
type Solution = { rate: number | null; reason: string | null };
const YEAR_MS = 365 * 864e5;
const cache = new Map<string, Solution>();

function termsOf(flows: readonly DatedFlow[]): Term[] | null {
  if (!Array.isArray(flows) || flows.some(f => !f || !(f.date instanceof Date)
    || !Number.isFinite(f.date.getTime()) || !Number.isFinite(f.amount))) return null;
  // Cash on the same instant is one event for the equation. Compensated sums
  // keep the result invariant to row order and to splitting one cash flow.
  const groups = new Map<number, number[]>();
  for (const f of flows) (groups.get(f.date.getTime()) ?? groups.set(f.date.getTime(), []).get(f.date.getTime())!).push(f.amount);
  const rows = [...groups].sort(([a], [b]) => a - b).map(([date, amounts]) => {
    let value = 0, correction = 0;
    for (const amount of amounts.sort((a, b) => Math.abs(a) - Math.abs(b))) {
      const next = value + amount;
      correction += Math.abs(value) >= Math.abs(amount) ? value - next + amount : amount - next + value;
      value = next;
    }
    return { date, amount: value + correction };
  }).filter(f => f.amount !== 0);
  if (rows.some(f => !Number.isFinite(f.amount))) return null;
  const origin = rows[0]?.date ?? 0;
  return rows.map(f => ({ time: (f.date - origin) / YEAR_MS, sign: Math.sign(f.amount), log: Math.log(Math.abs(f.amount)) }));
}

function solve(flows: readonly DatedFlow[]): Solution {
  const terms = termsOf(flows);
  if (!terms) return { rate: null, reason: 'a cash flow has an invalid date or non-finite amount' };
  if (terms.length < 2 || !terms.some(t => t.sign < 0) || !terms.some(t => t.sign > 0))
    return { rate: null, reason: 'dated cash flows do not establish a return' };
  const key = terms.map(t => `${t.time}:${t.sign}:${t.log}`).join('|');
  const cached = cache.get(key);
  if (cached) return cached;
  let evaluations = 0;
  // Work in log(1 + rate), with log-scaled coefficients. Neither very old flows
  // nor rates near -100% can overflow the NPV into a fabricated answer.
  const evaluate = (ts: Term[], x: number) => {
    if (++evaluations > 100_000) throw Error('the rate could not be verified within the calculation budget');
    const logs = ts.map(t => t.log - t.time * x), scale = Math.max(...logs);
    let value = 0, compensation = 0, magnitude = 0;
    for (let i = 0; i < ts.length; i++) {
      const amount = ts[i].sign * Math.exp(logs[i] - scale);
      magnitude += Math.abs(amount);
      const adjusted = amount - compensation, next = value + adjusted;
      compensation = next - value - adjusted; value = next;
    }
    return { value, zero: Math.abs(value) <= 16 * Number.EPSILON * magnitude };
  };
  const bisect = (ts: Term[], left: number, right: number) => {
    let a = left, b = right, fa = evaluate(ts, a).value;
    for (let i = 0; i < 180; i++) {
      const mid = a + (b - a) / 2, f = evaluate(ts, mid);
      if (f.zero || mid === a || mid === b) return mid;
      if (Math.sign(fa) !== Math.sign(f.value)) b = mid;
      else { a = mid; fa = f.value; }
    }
    throw Error('the rate did not converge');
  };
  let stationaryRoot = false;
  const rootsOf = (input: Term[], depth = 0): number[] => {
    if (depth > 1024) throw Error('the rate uniqueness could not be verified');
    if (input.length < 2) return [];
    const first = input[0], last = input[input.length - 1];
    const ts = input.map(t => ({ ...t, time: t.time - first.time }));
    // Outside these bounds one end coefficient exceeds the sum of every other
    // term. Thus ALL real roots are inside: no fixed scan can miss nearby roots
    // or silently ignore negative rates / rates above an arbitrary ceiling.
    const padding = Math.log(2 * (ts.length - 1));
    const lo = Math.min(0, ...input.slice(0, -1).map(t => -(padding + t.log - last.log) / (last.time - t.time))) - 1;
    const hi = Math.max(0, ...input.slice(1).map(t => (padding + t.log - first.log) / (t.time - first.time))) + 1;
    if (![lo, hi].every(Number.isFinite)) throw Error('the rate bounds could not be verified');
    const variations = ts.slice(1).filter((t, i) => t.sign !== ts[i].sign).length;
    if (!variations) return [];
    if (variations === 1) return [bisect(ts, lo, hi)];
    // Divide by the first exponential, then differentiate. Its constant drops
    // out. Recursively isolate derivative roots; between consecutive stationary
    // points the original equation is monotone, so bisection is exhaustive.
    const derivative = ts.slice(1).map(t => ({ time: t.time, sign: -t.sign, log: t.log + Math.log(t.time) }));
    const critical = rootsOf(derivative, depth + 1).filter(x => x > lo && x < hi);
    const boundaries = [lo, ...critical, hi], values = boundaries.map(x => evaluate(ts, x));
    const roots: number[] = [];
    for (let i = 1; i < boundaries.length - 1; i++) if (values[i].zero) {
      if (depth === 0) stationaryRoot = true; roots.push(boundaries[i]);
    }
    for (let i = 1; i < boundaries.length; i++) {
      if (!values[i - 1].zero && !values[i].zero && Math.sign(values[i - 1].value) !== Math.sign(values[i].value))
        roots.push(bisect(ts, boundaries[i - 1], boundaries[i]));
    }
    return roots.sort((a, b) => a - b);
  };
  let result: Solution;
  try {
    const roots = rootsOf(terms);
    if (roots.length > 1) result = { rate: null, reason: `these dated flows admit ${roots.length} different money-weighted rates, so no one of them is the return` };
    else if (stationaryRoot) result = { rate: null, reason: 'the cash-flow equation has a numerically unstable stationary root, so a unique stable return cannot be verified' };
    else if (!roots.length) result = { rate: null, reason: 'these dated flows do not solve to a rate' };
    else {
      const rate = Math.expm1(roots[0]);
      const residual = evaluate(terms, Math.log1p(rate));
      const representableError = 32 * Number.EPSILON * Math.max(1, terms.at(-1)!.time) * Math.max(1, Math.abs(rate)) / (1 + rate);
      result = Number.isFinite(rate) && rate > -1 && (residual.zero || Math.abs(residual.value) <= representableError)
        ? { rate, reason: null } : { rate: null, reason: 'the rate did not pass its cash-flow residual check' };
    }
  } catch (error) { result = { rate: null, reason: error instanceof Error ? error.message : 'the rate could not be verified' }; }
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

export function xirrAmbiguity(flows: readonly DatedFlow[]): string | null { return solve(flows).reason; }
export function xirr(flows: DatedFlow[]): number | null { return solve(flows).rate; }
