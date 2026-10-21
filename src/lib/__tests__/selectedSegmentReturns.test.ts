import assert from 'node:assert/strict';
import { selectedSegmentReturns, sinceInvestmentUnits, UNSPLIT_RETURNS, type ReturnSelection } from '../selectedSegmentReturns';
import { accountInputs, windowReturns, periodStart, measureWindow, type AccountWindow } from '../periodReturns';
import { currentHoldings, dedupedPositions } from '../analytics';
import { exitedRows } from '../drilldown';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_RETURN_RECORDS, BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNT_CASH_FLOWS, BOOK_NAV_COVERAGE, BOOK_UNDATED_CAPITAL, BOOK_CAPITAL_FROM_INCEPTION } from '../../data/glowData';
import type { Account, Position } from '../types';
import { SEGMENT_AXES } from '../segmentReturns';
const near = (a: number | null | undefined, b: number, tol = 1e-7) => assert.ok(a != null && Math.abs(a-b) < tol, `${a} != ${b}`);
const pos = (o: Partial<Position> = {}) => ({ accountId: 'a', securityKey: 'one', security: 'One', assetClass: 'Equity', marketValue: 120, costBasis: 100, ...o } as Position);
const acct = (id: string, extra: Partial<Account> = {}) => ({ accountId: id, accountNo: id, provider: 'Broker', owner: 'Owner', engagement: 'Direct', asOf: '2026-01-01', ...extra } as Account);
const w: AccountWindow = { accountId: 'a', label: 'Broker · a', owner: 'Owner', openDate: '2024-01-01', openValue: 100,
  openedInWindow: false, closeDate: '2026-01-01', closeValue: 250, flows: [{ date: '2025-01-01', amount: -100 }], capitalIn: 100, capitalOut: 0, gain: 50 };
const sel: ReturnSelection = { inception: false, type: 'absolute', start: w.openDate, end: w.closeDate, windows: [w], inceptionRows: [],
  excluded: [{ accountId: 'b', label: 'Missing account b', reason: 'opening value missing' }] };
const ps = [pos(), pos({ accountId: 'b', securityKey: 'two', marketValue: 300 })];
for (const type of ['absolute', 'xirr', 'cagr'] as const) {
  const a = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, type });
  near(a.total.gain, 50); near(a.total.returnPct, measureWindow([w], type, String).pct!);
  assert.equal(a.total.missing[0].accountId, 'b'); assert.equal(a.coveredHoldings, 1); near(a.coveredValue, 120);
  near(a.total.value, 420); assert.equal(a.accounts, 1);
  assert.equal(a.total.contribution == null, type !== 'absolute', 'do not add annualised or money weighted rates');
}
const abs = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', sel);
const irr = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, type: 'xirr' });
assert.notEqual(abs.total.returnPct, irr.total.returnPct, 'return type changes actual calculation');
const short = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, type: 'cagr', windows: [{ ...w, openDate: '2025-12-01' }] });
assert.equal(short.total.returnPct, null); near(short.total.gain, 50); assert.match(short.total.measured!.reason!, /at least 365 days/);
const split = selectedSegmentReturns([pos(), pos({ securityKey: 'two' })], [], [acct('a')], 'security', { ...sel, excluded: [] });
assert.equal(split.rows.filter(r => r.key !== UNSPLIT_RETURNS).every(r => r.gain == null), true);
near(split.rows.find(r => r.key === UNSPLIT_RETURNS)!.gain, 50);
near(split.rows.reduce((s, r) => s + (r.gain ?? 0), 0), split.total.gain!);
assert.ok(split.rows[0].missing.some(g => /whole account/.test(g.reason)), 'name the unavailable split');
// Absolute since investment keeps good records when one holding has an unresolved sale.
const bad = pos({ securityKey: 'bad', security: 'Bad sale', hprUnavailableReason: 'sale proceeds missing' });
const noCost = pos({ securityKey: 'cost', costBasis: null, costUnavailable: true });
const atCost = pos({ securityKey: 'at-cost', valuedAtCost: true });
const exit = pos({ securityKey: 'exited', marketValue: 0, costBasis: 0, costOfUnitsSold: 50, realizedPnL: 10 });
const inc = selectedSegmentReturns([pos(), bad, noCost, atCost], [exit], [acct('a')], 'security', { ...sel, inception: true, windows: [] });
near(inc.total.gain, 30); near(inc.total.invested, 150); near(inc.total.returnPct, 20);
assert.equal(inc.total.missing.length, 3); assert.equal(inc.coveredHoldings, 1);
near(inc.rows.reduce((s, r) => s + (r.gain ?? 0), 0), 30);
assert.equal(inc.rows.find(r => r.key === 'one')!.missing.length, 0, 'do not blame a different security in the same account');
assert.equal(inc.rows.find(r => r.key === 'bad')!.missing.length, 1);
// An entire managed account includes all its holdings and exits exactly once.
const managed = sinceInvestmentUnits([pos(), pos({ securityKey: 'two', marketValue: 80 })], [exit], [acct('a', { engagement: 'PMS', capital: { contributed: 150, withdrawn: 20 } as Account['capital'] })]);
assert.equal(managed.units.length, 1); near(managed.units[0].gain, 70); near(managed.units[0].invested, 150);
// Actual archive: every toolbar period reselects the records, every axis ties out.
const current = currentHoldings(dedupedPositions(BOOK_POSITIONS));
const left = exitedRows(dedupedPositions(BOOK_POSITIONS));
const inputs = accountInputs({ accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, returnRecords: BOOK_ACCOUNT_RETURN_RECORDS,
 navHistory: BOOK_ACCOUNT_NAV_HISTORY, cashFlows: BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: BOOK_NAV_COVERAGE.covered,
 undated: BOOK_UNDATED_CAPITAL, fromInception: BOOK_CAPITAL_FROM_INCEPTION, labelOf: a => a.provider });
const end = inputs.flatMap(i => i.valuations.map(v => v.date)).sort().at(-1)!;
const snapshots = [];
for (const period of ['fytd', 'mtd', 'ytd', 'y1', 'y2', 'y3'] as const) {
 const start = periodStart(period, end)!; const win = windowReturns(inputs, start, end);
 const selection = { ...sel, start, end, windows: win.included, excluded: win.excluded };
 const baseline = selectedSegmentReturns(current, left, BOOK_ACCOUNTS, 'category', selection);
 snapshots.push({ period, accounts: baseline.accounts, gain: baseline.total.gain, return: baseline.total.returnPct });
 for (const axis of SEGMENT_AXES) {
   const a = selectedSegmentReturns(current, left, BOOK_ACCOUNTS, axis, selection, () => 'Sector');
   assert.equal(a.total.gain, baseline.total.gain); assert.equal(a.total.returnPct, baseline.total.returnPct);
   near(a.rows.reduce((s,r) => s + r.value, 0), a.total.value, 1);
   if (a.total.gain != null) near(a.rows.reduce((s,r) => s + (r.gain ?? 0), 0), a.total.gain, 1);
   if (a.total.returnPct != null) near(a.rows.reduce((s,r) => s + (r.contribution ?? 0), 0), a.total.returnPct);
 }
}
assert.ok(new Set(snapshots.map(s => s.gain)).size >= 3, 'actual archive changes with the selected period');
console.log(snapshots);
console.log('Selected attribution periods, measures, covered totals, exits, gaps and unsplit accounts passed.');
