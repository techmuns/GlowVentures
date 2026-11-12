import assert from 'node:assert/strict';
import { xirr, xirrAmbiguity } from '../xirr';
const annual = (amounts: number[]) => amounts.map((amount, i) => ({ date: new Date(Date.UTC(2021, 0, 1) + i * 365 * 864e5), amount }));
for (const amount of [NaN, Infinity, -Infinity]) assert.equal(xirr(annual([-100, amount])), null);
assert.equal(xirr([{ date: new Date('invalid'), amount: -100 }, ...annual([110])]), null);
assert.equal(xirr(annual([100, -100]).map(f => ({ ...f, date: new Date('2021-01-01') }))), null);
for (const [a, b] of [[.30, .31], [.10, .1001], [-.80, -.70], [.2, 120]]) {
  const flows = annual([-100, 100 * (2 + a + b), -100 * (1 + a) * (1 + b)]);
  assert.equal(xirr(flows), null, `two valid roots ${a}, ${b} must be refused`);
  assert.match(xirrAmbiguity(flows)!, /different money-weighted rates/);
}
// Analytic one-year answers are independent of the implementation and cover
// losses, near-zero returns and rates outside the old scan's arbitrary bounds.
for (const rate of [-.99999, -.95, -.1, 0, 1e-6, .3, 150]) {
  const flows = annual([-100, 100 * (1 + rate)]);
  const actual = xirr(flows);
  assert.ok(actual !== null && Math.abs(actual - rate) < 1e-9 * Math.max(1, Math.abs(rate)), `${rate}: ${actual}`);
  for (const scale of [.01, 1e8]) assert.ok(Math.abs(xirr(flows.map(f => ({ ...f, amount: f.amount * scale })))! - rate) < 1e-8);
  assert.ok(Math.abs(xirr([...flows].reverse())! - rate) < 1e-8);
  assert.ok(Math.abs(xirr(flows.flatMap(f => [{ ...f, amount: f.amount / 2 }, { ...f, amount: f.amount / 2 }]))! - rate) < 1e-8);
}
console.log('XIRR invalid-input, exhaustive-root and analytic invariant checks passed');
