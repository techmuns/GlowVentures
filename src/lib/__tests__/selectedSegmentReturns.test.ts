import assert from 'node:assert/strict';
import { selectedSegmentReturns, sinceInvestmentUnits, returnGapText, UNSPLIT_RETURNS, EXITED_HOLDINGS, type ReturnSelection, type SelectedLine } from '../selectedSegmentReturns';
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
// Stage 10hk: under a year XIRR and CAGR show the absolute return, named so, and
// its contributions add up as Absolute's do; a line of debt keeps its yearly rate.
const halfW: AccountWindow = { ...w, openDate: '2025-07-01', closeDate: '2026-01-01', openValue: 200, closeValue: 230, flows: [], capitalIn: 0, gain: 30 };
const halfA = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, type: 'absolute', windows: [halfW] });
near(halfA.total.returnPct, 15, 1e-9);
for (const type of ['xirr', 'cagr'] as const) {
  const half = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, type, windows: [halfW] });
  near(half.total.returnPct, 15, 1e-9); near(half.total.periodPct, 15, 1e-9);
  assert.equal(half.total.measured!.shownAs, 'absolute', `${type} under a year is the absolute return`);
  near(half.total.contribution, halfA.total.contribution!, 1e-12);
}
const debtPs = [pos({ assetClass: 'Bond' }), pos({ accountId: 'b', securityKey: 'two', marketValue: 300 })];
const halfDebt = selectedSegmentReturns(debtPs, [], [acct('a'), acct('b')], 'category', { ...sel, type: 'xirr', windows: [halfW] });
near(halfDebt.total.returnPct, (1.15 ** (365 / 184) - 1) * 100, 1e-6); near(halfDebt.total.periodPct, 15, 1e-6);
assert.equal(halfDebt.total.measured!.shownAs, undefined);
const shortW = { ...w, openDate: '2025-12-01' };
const short = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, type: 'cagr', windows: [shortW] });
near(short.total.returnPct, measureWindow([shortW], 'absolute', String).pct!, 1e-12); near(short.total.gain, 50);
assert.equal(short.total.measured!.shownAs, 'absolute');
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
// Stage 10ik: an account under a segment opens into its holdings. Their values add
// to the account's; a holding gain comes only from a record of that holding alone,
// so under a whole-account record every holding is a dash naming the account's
// return, and otherwise the holdings' gains (exits included) add to the account's.
function addsUp(account: SelectedLine, axis: string) {
  if (axis === 'security') { assert.equal(account.children.length, 0, 'All Securities rows are already one security'); return; }
  if (!account.positions.length) return;
  const hs = account.children;
  assert.ok(hs.length > 0, `${account.label} opens into its holdings`);
  near(hs.reduce((s, h) => s + h.value, 0), account.value, 1);
  if (account.units.some(u => u.key === u.accountId)) {
    assert.ok(hs.every(h => h.gain == null && h.missing.length > 0), `${account.label}: a whole-account gain is never shared out`);
  } else if (account.gain != null) near(hs.reduce((s, h) => s + (h.gain ?? 0), 0), account.gain, 1);
}
const wholeSplit = selectedSegmentReturns([pos(), pos({ securityKey: 'two', security: 'Two', marketValue: 80 })], [], [acct('a')], 'category', { ...sel, excluded: [] });
const wholeAccount = wholeSplit.rows[0].children[0];
near(wholeAccount.gain, 50);
assert.deepEqual(wholeAccount.children.map(h => h.label), ['One', 'Two']);
assert.ok(wholeAccount.children.every(h => h.gain == null && /whole account/.test(returnGapText(h.missing[0].reason, null))));
addsUp(wholeAccount, 'category');
const perHolding = selectedSegmentReturns([pos(), bad, noCost, atCost], [exit], [acct('a')], 'category', { ...sel, inception: true, windows: [] });
const perAccount = perHolding.rows[0].children[0];
addsUp(perAccount, 'category');
near(perAccount.children.find(h => h.label === 'One')!.gain, 20);
near(perAccount.children.find(h => h.key.endsWith(EXITED_HOLDINGS))!.gain, 10);
assert.ok(perAccount.children.find(h => h.label === 'Bad sale')!.missing.some(g => /sale/.test(g.reason)), 'a holding names its own gap');
assert.equal(selectedSegmentReturns([pos(), bad], [exit], [acct('a')], 'security', { ...sel, inception: true, windows: [] })
  .rows.flatMap(r => r.children).every(c => c.children.length === 0), true);

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
   for (const p of current) assert.ok(a.total.units.some(u => u.positions.some(x => x.accountId === p.accountId && x.securityKey === p.securityKey))
     || a.total.missing.some(g => g.accountId === p.accountId && (!g.securityKey || g.securityKey === p.securityKey)), 'every displayed holding is covered or explained');
   assert.equal(a.total.gain, baseline.total.gain); assert.equal(a.total.returnPct, baseline.total.returnPct);
   near(a.rows.reduce((s,r) => s + r.value, 0), a.total.value, 1);
   if (a.total.gain != null) near(a.rows.reduce((s,r) => s + (r.gain ?? 0), 0), a.total.gain, 1);
   if (a.total.returnPct != null) near(a.rows.reduce((s,r) => s + (r.contribution ?? 0), 0), a.total.returnPct);
   for (const c of a.rows.flatMap(r => r.children)) addsUp(c, axis);
 }
}
assert.ok(new Set(snapshots.map(s => s.gain)).size >= 3, 'actual archive changes with the selected period');
console.log(snapshots);
console.log('Selected attribution periods, measures, covered totals, exits, gaps and unsplit accounts passed.');

// Quotes change display values, never a historical return or its closing date.
const quoted = selectedSegmentReturns([pos({ marketValue: 999 }), noCost], [], [acct('a')], 'security', { ...sel, inception: true }, () => null, [pos()]);
near(quoted.total.value, 1119); near(quoted.total.gain, 20); near(quoted.total.returnPct, 20);
assert.equal(quoted.total.missing.length, 1); near(quoted.closingValue, 120);

assert.match(returnGapText('Opening valuation and complete dated cash flows are missing', '2026-03-31'), /worth at the start.*money added and taken out/);
assert.match(returnGapText("the family's review values its lines on one date, so no window can be struck over it", '2026-03-31'), /value at the start and end/);
assert.match(returnGapText('The purchase cost is missing or has not been verified.', null), /purchase statement showing the amount paid/);
assert.match(returnGapText('The purchase date is unavailable.', null), /purchase statement showing the date/);
assert.doesNotMatch(returnGapText('Only the purchase cost is recorded.', null), /purchase cost is missing/, 'cost-only records need a later value, not another cost');
assert.match(returnGapText('Only the purchase cost is recorded.', null), /later value/);
assert.match(returnGapText('This statement gives a return for the whole account. It does not give separate opening values and money movements for these holdings.', null), /separate values and dated payments for each holding/);

// A return-bearing exit cannot disappear from an account's segment decision.
const mixedExit = selectedSegmentReturns([pos()], [exit], [acct('a')], 'security', { ...sel, excluded: [] });
near(mixedExit.rows.find(r => r.key === UNSPLIT_RETURNS)!.gain, 50);
assert.equal(mixedExit.rows.find(r => r.key === 'one')!.gain, null);
const mixedSectorExit = selectedSegmentReturns([pos()], [exit], [acct('a')], 'sector', { ...sel, excluded: [] }, key => key === 'one' ? 'Technology' : 'Financials');
near(mixedSectorExit.rows.find(r => r.key === UNSPLIT_RETURNS)!.gain, 50);
// Live-only lines still count in display value and must be named among gaps.
for (const inception of [false, true]) {
 const outside = selectedSegmentReturns(ps, [], [acct('a'), acct('b')], 'category', { ...sel, inception, type: 'xirr', excluded: [],
   outside: [{ accountId: 'b', label: 'Custody b', reason: 'no statement in this book values this account' }] });
 assert.ok(outside.total.missing.some(g => g.accountId === 'b' && g.securityKey === 'two'));
 assert.match(returnGapText(outside.total.missing.find(g => g.accountId === 'b')!.reason, sel.start), /worth at the start/);
}
assert.match(returnGapText('it held nothing across the window', sel.start), /outside this period/);

// A closed PMS account's tiny bank balance cannot claim its equity gains as Cash.
const closedCash = pos({ securityKey: 'cash', security: 'Bank balance', assetClass: 'Cash', marketValue: 0.34, costBasis: 0.34 });
const closedAccount = acct('a', { engagement: 'PMS', capital: { contributed: 100, withdrawn: 150 } as Account['capital'] });
for (const axis of ['sector', 'security', 'assetClass', 'basket'] as const) {
 const closed = selectedSegmentReturns([], [closedCash], [closedAccount], axis, { ...sel, inception: true });
 near(closed.closingValue, 0.34); near(closed.total.gain, 50.34); near(closed.rows.find(r => r.key === UNSPLIT_RETURNS)!.gain, 50.34);
}
