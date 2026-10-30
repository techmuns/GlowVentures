import assert from 'node:assert/strict';
import { compareToIndex, datedSinceInvestment } from '../cardBenchmark';
import { availableCardReturns } from '../availableCardReturns';
import type { AccountWindow } from '../periodReturns';
import type { ReturnSelection, ReturnUnit, SelectedLine } from '../selectedSegmentReturns';
import type { Account, CapitalMove, Portfolio, Position } from '../types';

const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-6, `${a} != ${b}`);
// An index at 100 until 30 Jun, 110 after, 121 from 30 Sep.
const level = (d: string) => (d < '2026-01-01' ? null : d < '2026-06-30' ? 100 : d < '2026-09-30' ? 110 : 121);
const account = (accountId: string) => ({ accountId, asOf: '2026-09-30' }) as Account;
const unit = (key: string, gain: number, invested: number, whole = false): ReturnUnit => ({
  key: whole ? key : `${key}|s`, accountId: key, label: key, gain, invested, close: 0, from: null, to: '2026-09-30',
  positions: [{ accountId: key, securityKey: 's', marketValue: 1, assetClass: 'Equity' } as Position] });
const move = (accountId: string, date: string, direction: 'in' | 'out', amount: number | null): CapitalMove =>
  ({ accountId, date, direction, amount, securityKey: 's' }) as CapitalMove;

// Since investment: gain ÷ money invested, on the same dated money.
const dated = unit('a', 50, 100);    // 100 in at 100, holding to 121.
const undated = unit('b', 500, 400); // No record of when: in neither figure.
const sold = unit('c', 10, 100);     // 100 in at 100; 55 out at 110; the rest stays.
const offTie = unit('d', 5, 100);    // Dates only 50 of its 100.
const unpriced = unit('e', 5, 100);  // A movement with no gross amount.
const moves = [move('a', '2026-03-31', 'in', 100), move('c', '2026-03-31', 'in', 100), move('c', '2026-06-30', 'out', 55),
  move('d', '2026-03-31', 'in', 50), move('e', '2026-03-31', 'in', 100), move('e', '2026-04-30', 'in', null)];
const cov = datedSinceInvestment([dated, undated, sold, offTie, unpriced], moves, {}, ['a', 'b', 'c', 'd', 'e'].map(account));
assert.deepEqual(cov.dated.map((d) => d.unit.accountId), ['a', 'c']);
assert.deepEqual(cov.undated.map((u) => u.accountId), ['b', 'd', 'e']);
near(cov.datedInvested, 200); near(cov.totalInvested, 800);

const card = { total: { returnPct: 83 } as SelectedLine, selection: { inception: true } as ReturnSelection };
const since = compareToIndex(card, level, cov);
// a: 100 × 1.21 − 100 = 21. c: (100 × 1.21 − 55 × 1.1) + 55 − 100 = 15.5. Over 200 paid in.
near(since.index, (21 + 15.5) / 200 * 100);
// The book is struck over the SAME 200, never the tile's 83% over all 800.
near(since.book, (50 + 10) / 200 * 100);
near(since.gap, 30 - 18.25);
assert.equal(since.annual, false);

// An index with no close by the first purchase is absent, with the date named.
const late = compareToIndex(card, (d) => (d < '2026-06-30' ? null : 110), cov);
assert.equal(late.index, null); assert.equal(late.gap, null); assert.match(late.reason!, /no close on or before 2026-03-31/);
const empty = compareToIndex(card, level, datedSinceInvestment([undated], [], {}, [account('b')]));
assert.equal(empty.book, null); assert.equal(empty.index, null); assert.ok(empty.reason);

// A whole mandate is dated from its account's own moves, whatever the security.
const mandate = datedSinceInvestment([unit('m', 1, 100, true)], [{ ...move('m', '2026-03-31', 'in', 100), securityKey: null }], {}, [account('m')]);
assert.equal(mandate.dated.length, 1);

// Period tile: the tile's own measure over its own windows.
const win = (o: Partial<AccountWindow>): AccountWindow => ({ accountId: 'a', label: 'a', owner: 'o', openDate: '2026-03-31', closeDate: '2026-09-30',
  openValue: 100, closeValue: 150, capitalIn: 0, capitalOut: 0, flows: [], gain: 50, ...o } as AccountWindow);
const windowCard = (w: AccountWindow, returnPct: number | null) => ({
  total: { returnPct, units: [{ ...unit('a', w.gain, 100), window: w }] } as unknown as SelectedLine,
  selection: { inception: false, type: 'xirr' } as ReturnSelection });
const period = compareToIndex(windowCard(win({}), 50), level, null);
near(period.index, 21); near(period.gap, 29); assert.equal(period.book, 50); assert.equal(period.coverage, null);
assert.equal(compareToIndex(windowCard(win({}), null), level, null).index, null);
assert.ok(compareToIndex(windowCard(win({ openDate: '2020-01-01' }), 50), level, null).reason);

// The closing date is each record's own: never advanced to today.
near(compareToIndex(windowCard(win({ closeDate: '2026-06-30' }), 50), level, null).index, 10);

// End to end, off the card the tile reads.
const p = { accountId: 'x', securityKey: 'g', security: 'G', marketValue: 13200, costBasis: 10000, unrealizedPnL: 3200, quantity: 1, assetClass: 'Equity', side: 'listed' } as unknown as Position;
const a = { accountId: 'x', accountNo: '1', owner: 'O', provider: 'P', asOf: '2026-09-30' } as Account;
const r = availableCardReturns({ accounts: [a], positions: [p], privateMarkets: {}, accountReturnRecords: {} } as Portfolio, [p],
  [{ accountId: 'x', label: 'P · 1', owner: 'O', valuations: [{ date: '2026-03-31', value: 10000 }, { date: '2026-09-30', value: 13200 }], flows: [],
    knownFrom: '2026-03-31', knownTo: '2026-09-30', flowsUnknown: null, undated: [] }], new Date(2026, 9, 22));
near(r.fytd.total.returnPct, 32);
const e2e = compareToIndex(r.fytd, level, null);
near(e2e.index, 21); near(e2e.gap, 11);
console.log('cardBenchmark ok');
