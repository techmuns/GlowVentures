import assert from 'node:assert/strict';
import { availableCardReturns, statementReturnInputs } from '../availableCardReturns';
import { currentHoldings, dedupedPositions } from '../analytics';
import type { Account, Portfolio, Position } from '../types';
import type { AccountInput } from '../periodReturns';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_RETURN_RECORDS } from '../../data/glowData';

const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const position = (o: Partial<Position>) => {
  const p = { accountId: 'a', securityKey: 'good', security: 'Verified stock', marketValue: 120, costBasis: 100,
    unrealizedPnL: 20, quantity: 1, assetClass: 'Equity', side: 'listed', ...o } as Position;
  // Keep fixture holdings above the dashboard's speck threshold.
  for (const field of ['marketValue', 'costBasis', 'unrealizedPnL', 'realizedPnL', 'costOfUnitsSold'] as const) {
    if (p[field] != null) p[field] = p[field]! * 100;
  }
  return p;
};
const accounts = [{ accountId: 'a', accountNo: '111', owner: 'Ajay', provider: 'Broker', asOf: '2026-09-30' },
  { accountId: 'b', accountNo: '222', owner: 'Ankita', provider: 'Bank', asOf: '2026-09-30' }] as Account[];
const positions = [position({}), position({ accountId: 'b', securityKey: 'missing', security: 'Missing purchase', marketValue: 400, costBasis: null }),
  position({ securityKey: 'sale', security: 'Unchecked sale', costBasis: 20, marketValue: 30, hprUnavailableReason: 'Sale proceeds need verification' }),
  position({ securityKey: 'exit', assetClass: 'Mutual Fund', quantity: 0, currentPrice: 1, marketValue: 0, costBasis: 0, unrealizedPnL: 0, costOfUnitsSold: 50, realizedPnL: 10 })];
const statement = { accounts, positions, privateMarkets: {}, accountReturnRecords: {} } as Portfolio;
const input: AccountInput = { accountId: 'a', label: 'Broker · 111', owner: 'Ajay',
  valuations: [{ date: '2026-03-31', value: 100 }, { date: '2026-09-30', value: 132 }],
  flows: [{ date: '2026-06-30', amount: -20 }], knownFrom: '2026-03-31', knownTo: '2026-09-30', flowsUnknown: null, undated: [] };
const missing: AccountInput = { ...input, accountId: 'b', owner: 'Ankita', label: 'Bank · 222', valuations: [], flows: [], flowsUnknown: 'No opening valuation or dated money record' };
const today = new Date(2026, 9, 22);
const r = availableCardReturns(statement, positions, [input, missing], today);
near(r.gain.total.gain, 3000); // 20 held + 10 sold, without the unverified sale.
near(r.gain.total.invested, 15000); near(r.gain.total.returnPct, 20);
assert.equal(r.gain.coveredHoldings, 1); near(r.gain.coveredValue, 12000);
assert.ok(r.gain.total.missing.some(g => /Missing purchase/.test(g.label) && /purchase cost/.test(g.reason)));
assert.ok(r.gain.total.missing.some(g => /Unchecked sale/.test(g.label) && /sale record/.test(g.reason)));
near(r.fytd.total.gain, 12); near(r.history.total.gain, 12);
assert.equal(r.history.to, '2026-09-30'); // Never advanced to today / a live mark.
assert.equal(r.history.total.measured?.basis, 'window');
assert.ok(r.fytd.total.returnPct! > 0); assert.equal(r.fytd.coveredAccounts, 1);
assert.equal(r.fytd.totalAccounts, 2);
assert.ok(r.fytd.total.missing.some(g => g.accountId === 'b'));
// Today's quotes change only the displayed coverage value, never recorded gain or return.
const live = availableCardReturns(statement, positions.map(p => ({ ...p, marketValue: p.marketValue * 2 })), [input, missing], today);
near(live.gain.total.gain, 3000); near(live.fytd.total.gain, 12); near(live.history.total.returnPct, r.history.total.returnPct!);
near(live.gain.coveredValue, 24000);
// A genuine break-even measurement is a number; empty or unavailable records stay absent.
const zero = availableCardReturns({ ...statement, positions: [position({ marketValue: 100, unrealizedPnL: 0 })] }, [position({ marketValue: 100, unrealizedPnL: 0 })], [], today);
near(zero.gain.total.gain, 0); near(zero.gain.total.returnPct, 0);
const empty = availableCardReturns({ ...statement, positions: [], accounts: [] }, [], [], today);
assert.equal(empty.gain.total.gain, null); assert.equal(empty.history.total.returnPct, null);
// Long verified history is labelled annual; liquidated accounts retain their proceeds.
const long = { ...input, knownFrom: '2024-03-31', valuations: [{ date: '2024-03-31', value: 100 }, { date: '2026-09-30', value: 132 }] };
assert.equal(availableCardReturns(statement, positions, [long], today).history.total.measured?.basis, 'annual');
const closed = { ...input, valuations: [{ date: '2026-03-31', value: 100 }, { date: '2026-09-30', value: 0 }], flows: [{ date: '2026-09-30', amount: 110 }] };
near(availableCardReturns(statement, positions, [closed], today).history.total.gain, 10);
// Real archive: headline gain agrees with the same since-investment measured pool;
// dated cards must not be poisoned by the other accounts or today's price overlay.
const book = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountReturnRecords: BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: {} } as Portfolio;
const display = dedupedPositions(BOOK_POSITIONS), actual = availableCardReturns(book, display, statementReturnInputs(book), today);
assert.ok(actual.gain.total.gain != null && actual.gain.coveredHoldings > 0 && actual.gain.coveredHoldings < currentHoldings(display).length);
near(actual.fytd.total.gain, 214060780.04);
assert.equal(actual.fytd.coveredAccounts, 17);
assert.ok(actual.history.total.returnPct != null);
assert.ok(actual.history.total.missing.length > 0);
console.log('available headline returns: verified gain, exits, partial periods, live isolation, real coverage');
