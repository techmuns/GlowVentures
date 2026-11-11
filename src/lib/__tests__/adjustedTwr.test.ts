import assert from 'node:assert/strict';
import { adjustedTwr, twrPeriodStart, TWR_COLUMNS, type TwrRecord } from '../adjustedTwr';
import { daysBetween, type AccountWindow } from '../periodReturns';

const near = (actual: number | null, expected: number, eps = 1e-9) => assert.ok(actual != null && Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
const rec = (overrides: Partial<AccountWindow> = {}, key = 'a'): TwrRecord => {
  const w = { accountId: key, label: key, owner: 'Owner', openDate: '2026-01-01', closeDate: '2026-11-11', openValue: 100,
    closeValue: 121, openedInWindow: false, flows: [], ...overrides };
  return { key, label: key, inceptionKnown: true, window: { ...w,
    capitalIn: w.flows.filter(f => f.amount < 0).reduce((s, f) => s - f.amount, 0),
    capitalOut: w.flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0), gain: 0 } };
};
const run = (rs: TwrRecord[], extra = {}) => adjustedTwr(rs, { start: '2026-01-01', end: '2026-11-11', ...extra });
const missing = (r: ReturnType<typeof adjustedTwr>, pattern?: RegExp) => {
  assert.equal(r.pct, null); assert.ok(r.gaps.length > 0); if (pattern) assert.match(r.gaps.map(g => g.reason).join(' '), pattern);
};

assert.equal(twrPeriodStart('mtd', '2026-01-15'), '2025-12-31');
assert.equal(twrPeriodStart('mtd', '2024-03-15'), '2024-02-29');
assert.equal(twrPeriodStart('qtd', '2026-01-15'), '2025-12-31');
assert.equal(twrPeriodStart('qtd', '2026-04-01'), '2026-03-31');
assert.equal(twrPeriodStart('qtd', '2026-07-22'), '2026-06-30');
assert.equal(twrPeriodStart('qtd', '2026-11-11'), '2026-09-30');
assert.equal(twrPeriodStart('ytd', '2026-11-11'), '2025-12-31');
assert.equal(twrPeriodStart('inception', '2026-11-11'), null);
assert.equal(TWR_COLUMNS.length, 4); assert.ok(TWR_COLUMNS.every(c => c.label.includes('INR')));

near(run([rec()]).pct, 21);
const deposit = rec({ marks: [{ date: '2026-07-01', value: 220 }], flows: [{ date: '2026-07-01', amount: -100 }], closeValue: 242 });
near(run([deposit]).pct, 32); // 120/100 × 242/220 − 1; money added is not profit.
near(run([rec({ marks: [{ date: '2026-07-01', value: 60 }], flows: [{ date: '2026-07-01', amount: 60 }], closeValue: 66 })]).pct, 32);
near(run([rec({ marks: [{ date: '2026-07-01', value: 95 }], flows: [{ date: '2026-07-01', amount: 10 }], closeValue: 104.5 })]).pct, 15.5, 1e-8); // Dividend paid out, added once.
near(run([rec({ marks: [{ date: '2026-07-01', value: 200 }], flows: [{ date: '2026-07-01', amount: -100 }], closeValue: 200 })]).pct, 0);
near(run([rec({ marks: [{ date: '2026-07-01', value: 199 }], flows: [{ date: '2026-07-01', amount: -100 }], closeValue: 199 })]).pct, -1); // Fee inside NAV stays a cost.
near(run([rec({ closeValue: 100 })]).pct, 0); // A correctly split-adjusted value has no false return.

const other = rec({ openValue: 300, closeValue: 297, marks: [{ date: '2026-07-01', value: 270 }] }, 'b');
near(run([deposit, other]).pct, 7.25); // (490−100)/400 × 539/490 − 1, not averaged row percentages.
missing(run([deposit, rec({}, 'b')]), /valuation on 2026-07-01/);
missing(run([{ ...deposit, window: { ...deposit.window, marks: [] } }]), /valuation on 2026-07-01/);
// Both deposits and withdrawals on a date must still split the chain when net capital is zero.
near(run([rec({ marks: [{ date: '2026-07-01', value: 110 }], flows: [{ date: '2026-07-01', amount: -30 }, { date: '2026-07-01', amount: 30 }] })]).pct, 21);

const scaled = [deposit, other].map(r => ({ ...r, window: { ...r.window, openValue: r.window.openValue * 1e7,
  closeValue: r.window.closeValue * 1e7, capitalIn: r.window.capitalIn * 1e7, capitalOut: r.window.capitalOut * 1e7,
  marks: r.window.marks?.map(m => ({ ...m, value: m.value * 1e7 })), flows: r.window.flows.map(f => ({ ...f, amount: f.amount * 1e7 })) } }));
near(run(scaled).pct, run([deposit, other]).pct!); // INR magnitudes or a display-only scale cannot change returns.

const initial = rec({ openDate: '2024-01-01', openValue: 0, openedInWindow: true, closeValue: 144,
  flows: [{ date: '2024-01-02', amount: -100 }], closeDate: '2026-01-02' });
const si = adjustedTwr([initial], { start: null, end: '2026-01-02', annualise: true });
near(si.periodPct, 44); near(si.pct, (1.44 ** (365 / daysBetween('2024-01-02', '2026-01-02')) - 1) * 100);
assert.equal(si.from, '2024-01-02'); assert.equal(si.annual, true);
missing(adjustedTwr([{ ...initial, inceptionKnown: false }], { start: null, end: '2026-01-02', annualise: true }), /first investment/);
const short = run([rec()], { annualise: true }); near(short.pct, 21); assert.equal(short.annual, false);
const debt = run([rec()], { annualise: true, debt: true }); assert.equal(debt.annual, true);
near(debt.pct, (1.21 ** (365 / daysBetween('2026-01-01', '2026-11-11')) - 1) * 100);
const firstDay = rec({ openValue: 0, openedInWindow: true, marks: [{ date: '2026-01-02', value: 110 }], flows: [{ date: '2026-01-02', amount: -100 }] });
near(run([firstDay]).pct, 21); // First-day investment gain is retained, not thrown away with the first payment.
near(run([rec({ closeValue: 0 })]).pct, -100);

missing(run([rec({ openDate: '2026-03-01' })]), /opening valuation/);
near(adjustedTwr([rec({ openDate: '2026-10-30' })], { start: '2026-10-31', end: '2026-11-11' }).pct, 21);
missing(adjustedTwr([rec({ openDate: '2026-10-29' })], { start: '2026-10-31', end: '2026-11-11' }), /opening valuation/);
missing(run([rec({ closeDate: '2026-09-30' })]), /recent closing/);
const recent = rec({ closeDate: '2026-11-10', closeValue: 120 });
const newer = rec({ marks: [{ date: '2026-11-10', value: 120 }], closeValue: 999 }, 'b');
const common = run([recent, newer]); assert.equal(common.to, '2026-11-10'); near(common.pct, 20);
const laterMoney = rec({ marks: [{ date: '2026-11-10', value: 120 }], closeValue: 220, flows: [{ date: '2026-11-11', amount: -100 }] }, 'b');
missing(run([recent, laterMoney]), /after the last common valuation/);
missing(run([rec(), rec()]), /twice/);
missing(run([rec({ closeValue: Number.NaN })]), /invalid/);
missing(run([rec({ closeValue: -1 })]), /invalid/);
missing(run([rec({ marks: [{ date: '2026-05-01', value: 100 }, { date: '2026-05-01', value: 101 }] })]), /disagree/);
missing(run([rec({ flows: [{ date: '2026-12-01', amount: -100 }] })]), /outside/);
missing(run([rec()], { end: '2026-02-31' }), /ending date/);
missing(run([{ ...deposit, window: { ...deposit.window, capitalIn: 99 } }]), /reconcile/);
missing(run([rec({ marks: [{ date: '2026-05-01', value: 0 }, { date: '2026-06-01', value: 100 }],
  flows: [{ date: '2026-05-01', amount: 100 }, { date: '2026-06-01', amount: -100 }] })]), /no positive invested capital/);
missing(run([rec()], { gaps: [{ label: 'Unpriced holding', reason: 'A valuation is missing.' }] }), /missing/);
console.log('INR adjusted TWR: calendar boundaries, contributions, withdrawals, dividends, fees, geometric linking, grouped INR values, inception, annualisation, currency invariance and missing-data gates passed.');
