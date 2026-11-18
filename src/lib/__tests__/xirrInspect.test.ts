import assert from 'node:assert/strict';
import { xirr } from '../xirr';
import { npvAtRate, xirrConvergence } from '../xirrInspect';

const annual = (amounts: number[]) =>
  amounts.map((amount, i) => ({ date: new Date(Date.UTC(2021, 0, 1) + i * 365 * 864e5), amount }));

// 1. NPV is zero (to numerical tolerance) at the solved rate — the Inspector
//    illustrates the SAME equation the figure was solved from.
for (const rate of [-0.5, -0.1, 0, 0.1, 0.3, 1, 1.5]) {
  const flows = annual([-100, 100 * (1 + rate)]);
  const solved = xirr(flows);
  assert.ok(solved !== null && Math.abs(solved - rate) < 1e-9, `solve ${rate} → ${solved}`);
  assert.ok(Math.abs(npvAtRate(flows, solved!)) < 1e-6, `NPV at the solved rate ${rate} is ~0`);
}

// 2. NPV of a normal investment is strictly decreasing in the rate, so the
//    sign change at the IRR is real, not an artefact.
{
  const flows = annual([-100, 130]);
  let prev = Infinity;
  for (const r of [-0.2, 0, 0.1, 0.3, 0.6, 1]) {
    const v = npvAtRate(flows, r);
    assert.ok(v < prev, `NPV decreases as the rate rises (${r})`);
    prev = v;
  }
}

// 3. The convergence sweep includes exactly one solution row, at ~0 NPV, and
//    straddles it (a positive NPV below and a negative NPV above).
{
  const flows = annual([-100, 130]); // IRR = 0.30
  const solved = xirr(flows)!;
  const rows = xirrConvergence(flows, solved);
  const sol = rows.filter((r) => r.solution);
  assert.equal(sol.length, 1, 'one solution row');
  assert.ok(Math.abs(sol[0].rate - solved) < 1e-12, 'the solution row is the solved rate');
  assert.ok(Math.abs(sol[0].npv) < 1e-6, 'the solution row has ~0 NPV');
  assert.ok(rows.some((r) => r.npv > 0) && rows.some((r) => r.npv < 0), 'the sweep straddles the root');
  assert.ok(rows.every((r) => r.rate > -1), 'no rate at or below -100%');
  // The sweep is sorted and the NPV crosses zero exactly once (monotone).
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].rate > rows[i - 1].rate, 'rates ascend');
  const crossings = rows.slice(1).filter((r, i) => Math.sign(r.npv) !== Math.sign(rows[i].npv)).length;
  assert.ok(crossings === 1, `exactly one sign change, got ${crossings}`);
}

// 4. Guards: no flows, or an impossible rate, yield no sweep and a NaN NPV
//    rather than a fabricated number.
assert.deepEqual(xirrConvergence([], 0.1), []);
assert.deepEqual(xirrConvergence(annual([-100, 130]), -1.5), []);
assert.ok(Number.isNaN(npvAtRate([], 0.1)));
assert.ok(Number.isNaN(npvAtRate(annual([-100, 130]), -2)));

console.log('xirrInspect: all assertions passed');
