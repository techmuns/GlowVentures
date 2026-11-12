import assert from 'node:assert/strict';
import { availableCardReturns, statementReturnInputs } from '../availableCardReturns';
import { currentHoldings, dedupedPositions } from '../analytics';
import { returnGapText } from '../selectedSegmentReturns';
import type { Account, Portfolio, Position } from '../types';
import { windowReturns, type AccountInput } from '../periodReturns';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_RETURN_RECORDS, BOOK_UNIT_WINDOWS } from '../../data/glowData';

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
near(r.gain.total.units.reduce((s, u) => s + Object.values(u.gainParts ?? {}).reduce<number>((n, v) => n + (v ?? 0), 0), 0), r.gain.total.gain!);
// GAIN SINCE INVESTMENT OVER EVERY INVESTMENT (Stage 10la; "make coverage 100%"):
// what no purchase record or first value measures is held at its value — no
// gain, in the base, and named with the record it still needs.
near(r.gain.total.invested, 15000 + 40000 + 3000); near(r.gain.total.returnPct, 3000 / 58000 * 100);
assert.equal(r.gain.coveredHoldings, 3); near(r.gain.coveredValue, 55000);
const heldAtValue = r.gain.total.units.filter(u => u.held);
assert.ok(heldAtValue.every(u => u.gain === 0));
assert.ok(heldAtValue.some(u => /Missing purchase/.test(u.label) && /purchase cost/.test(u.held!.reason)));
assert.ok(heldAtValue.some(u => /Unchecked sale/.test(u.label) && /sale record/.test(u.held!.reason)));
assert.deepEqual([r.gain.gainCoverage.heldCount, r.gain.gainCoverage.sinceFirstCount], [2, 0]);
near(r.gain.gainCoverage.sinceInvestmentValue, 12000);
// A holding with no purchase cost but two values on record counts from the first of them.
{
  const fundAcct = { accountId: 'c', accountNo: '333', owner: 'Aarti', provider: 'Fund', asOf: '2026-09-30' } as Account;
  const fundPos = position({ accountId: 'c', securityKey: 'fund', security: 'Fund units', marketValue: 110, costBasis: null, unrealizedPnL: null });
  const fundIn: AccountInput = { ...input, accountId: 'c', owner: 'Aarti', label: 'Fund · 333', flows: [],
    valuations: [{ date: '2026-03-31', value: 10000 }, { date: '2026-09-30', value: 11000 }] };
  const g = availableCardReturns({ ...statement, accounts: [...accounts, fundAcct], positions: [...positions, fundPos] }, [...positions, fundPos],
    [input, missing, fundIn], today).gain;
  const first = g.total.units.find(u => u.sinceFirst);
  assert.equal(first?.accountId, 'c'); near(first!.gain, 1000); near(first!.invested, 10000);
  near(g.total.gain, 4000); assert.equal(g.gainCoverage.sinceFirstCount, 1); near(g.gainCoverage.sinceFirstValue, 11000);
}
const saleExplanation = returnGapText('Sale proceeds are unverified on review row(s) 474; original lots establish remaining cost only', null);
assert.match(saleExplanation, /sale statement showing what was sold/);
assert.doesNotMatch(saleExplanation, /review row|original lots/);
near(r.fytd.total.gain, 12); near(r.history.total.gain, 12);
assert.equal(r.history.to, '2026-09-30'); // Never advanced to today / a live mark.
assert.equal(r.history.total.measured?.basis, 'window');
assert.ok(r.fytd.total.returnPct! > 0); assert.equal(r.fytd.coveredAccounts, 1);
assert.equal(r.fytd.totalAccounts, 2);
assert.ok(r.fytd.total.missing.some(g => g.accountId === 'b'));
assert.equal(r.fytd.fullPeriod, true);
// YTD FROM THE FIRST DATE WE HAVE (Stage 10kq): no record values 'a' on
// 31 Dec, so the year opens on its first verified value — never a 1-holding card.
near(r.ytd.total.gain, 12); assert.equal(r.ytd.coveredAccounts, 1); assert.equal(r.ytd.selection.start, '2025-12-31');
assert.equal(r.ytd.from, '2026-03-31'); assert.equal(r.ytd.fullPeriod, false);
assert.deepEqual(r.ytd.starts, [{ date: '2026-03-31', close: 132 }]);
near(r.ytd.total.returnPct!, r.fytd.total.returnPct!);
assert.ok(r.ytd.total.missing.some(g => g.accountId === 'b'));
// Money first put in this year opens at nil: a full year to date.
const fresh: AccountInput = { ...input, knownFrom: null, valuations: [{ date: '2026-09-30', value: 105 }], flows: [{ date: '2026-08-06', amount: -100 }] };
const opened = availableCardReturns(statement, positions, [fresh], today).ytd;
assert.equal(opened.fullPeriod, true); assert.deepEqual(opened.starts, [{ date: null, close: 105 }]); near(opened.total.gain, 5);
// Today's quotes change only the displayed coverage value, never recorded gain or return.
const live = availableCardReturns(statement, positions.map(p => ({ ...p, marketValue: p.marketValue * 2 })), [input, missing], today);
near(live.gain.total.gain, 3000); near(live.fytd.total.gain, 12); near(live.history.total.returnPct, r.history.total.returnPct!);
near(live.gain.coveredValue, 110000); // every holding, at today's values
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
// Every current holding holding value is in the gain card: measured from cost, from its first value, or held (Stage 10la).
assert.ok(actual.gain.total.gain != null && actual.gain.coveredHoldings === currentHoldings(display).length);
assert.ok(actual.gain.gainCoverage.sinceInvestmentValue > 0 && actual.gain.gainCoverage.heldValue > 0);
// THE FINANCIAL YEAR FROM THE FIRST VALUE ON RECORD (Stage 10la): the 17
// accounts verified from 31 March, unchanged, plus the six whose consecutive
// statements hold the same units (Buoyant ×2, Founders ×2, Mirae, ABSL),
// each from its first statement this year.
const verified = windowReturns(statementReturnInputs(book), '2026-03-31', '2026-10-22').included;
// 17 verified records, plus SVAN 8710067 and 8710090 opened on their rebuilt 31 March values (Stage 10ni).
assert.equal(verified.length, 19);
for (const w of verified) near(actual.fytd.total.units.find(u => u.accountId === w.accountId)?.gain ?? null, w.gain);
const unitWindowed = actual.fytd.total.units.filter(u => BOOK_UNIT_WINDOWS[u.accountId]);
assert.deepEqual(unitWindowed.map(u => u.from).sort(), ['2026-07-01', '2026-07-02', '2026-07-31', '2026-07-31', '2026-07-31', '2026-07-31']);
// SVAN's two accounts from their rebuilt 31 March values (Stage 10ni) add ₹4,02,59,338.13 and ₹2,83,35,982.54.
near(actual.fytd.total.gain, 198576986.99 + 40259338.13 + 28335982.54);
assert.equal(actual.fytd.coveredAccounts, 25);
// The calendar-year card reads at least every account the financial year does.
assert.ok(actual.ytd.coveredAccounts >= actual.fytd.coveredAccounts && actual.ytd.coveredHoldings >= actual.fytd.coveredHoldings);
assert.ok(actual.history.total.returnPct != null);
assert.ok(actual.history.total.missing.length > 0);
console.log('available headline returns: verified gain, exits, partial periods, live isolation, real coverage');

// THE OPENING VALUES WE REBUILT (Stage 10ni): a refused account opens on its
// rebuilt 31 Dec value, takes the ledger's money, the manager's later values,
// and closes where its capital register reaches; a record already opening on
// the day is left alone.
{
  const { withTradeOpening, tradeOpeningNote } = await import('../availableCardReturns');
  const o = { openings: [{ date: '2025-12-31', value: 100, equity: 90, cash: 10, names: 2, entries: [{ date: '2026-01-09', securityKey: 'new-co', units: 1, close: 5, value: 5 }] },
    { date: '2026-03-31', value: 90, equity: 80, cash: 10, names: 3, entries: [] }],
    flows: [{ date: '2026-01-09', amount: -5, description: 'new-co joins' }, { date: '2026-05-10', amount: 1, description: 'TDS on Payout' }],
    capitalTo: '2026-09-30', checks: [{ date: '2026-05-31', docKey: 'x', rebuilt: 120, printed: 120.02, diffPct: -0.02 }, { date: '2026-06-30', docKey: 'y', rebuilt: 130, printed: 130, diffPct: 0 }], sources: [] };
  const opened = withTradeOpening(missing, o, [{ date: '2026-06-30', nav: 130 }, { date: '2026-09-30', nav: 140 }]);
  assert.equal(opened.flowsUnknown, null); assert.equal(opened.knownFrom, '2025-12-31'); assert.equal(opened.knownTo, '2026-09-30'); assert.equal(opened.tradeOpening, true);
  assert.deepEqual(opened.valuations.map(v => v.date), ['2025-12-31', '2026-03-31', '2026-06-30', '2026-09-30']);
  const ytd = windowReturns([opened], '2025-12-31', '2026-10-22').included[0];
  // 140 − 100 − 5 in + 1 out = 36.
  near(ytd.gain, 36); assert.equal(ytd.openDate, '2025-12-31');
  near(windowReturns([opened], '2026-03-31', '2026-10-22').included[0].gain, 140 - 90 + 1);
  const kept = { ...input, knownFrom: '2025-12-31' };
  assert.equal(withTradeOpening(kept, o), kept, 'a record already opening on the day is kept');
  assert.equal(withTradeOpening({ ...missing, outside: 'nothing to measure' }, o).flowsUnknown, missing.flowsUnknown);
  assert.match(tradeOpeningNote(o, '2025-12-31'), /rebuilt from the manager's own records.*within 0.02%.*New Co was not yet listed/);
  assert.doesNotMatch(tradeOpeningNote(o, '2026-03-31'), /not yet listed/);
}
console.log('available card returns: rebuilt openings open a refused account on the period\'s first day.');
