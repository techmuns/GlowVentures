import assert from 'node:assert/strict';
import { earlierBalanceOptions, heldAtLastValue, statementNavWindow, tradedWindow } from '../periodRules';
import { periodEvidence } from '../../../scripts/lib/periodEvidence.mjs';
import { measureWindow, pmeWindowRows, type AccountWindow } from '../periodReturns';
import { periodLine, valueOn, windowOn } from '../periodLine';
import type { Account, EarlierBalance, Position } from '../types';

/**
 * THE RETURN CARDS' EXTRA STARTS (Stage 10la): each first value the archive
 * carries is used only where its own evidence holds, and whatever none of them
 * measures is held at its last value — a named 0%, never a blended zero.
 */
const near = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} != ${b}`);
const acct = { accountId: 'd', accountNo: '49', owner: 'Owner D', provider: 'Demat', asOf: '2026-10-31', engagement: 'Direct' } as Account;
const feed = { version: 1, capturedAt: '2026-11-03T00:00:00Z', requestedFrom: '2023-01-01', requestedTo: '2027-01-01', verifiedThrough: '2026-11-03',
  symbols: ['EXD'], isins: [], sourceUrl: 'fixture', rows: [] };
const hist = { ok: true as const, version: 2, symbol: 'EXD.NS', isin: null, name: 'Example D', source: 'Public price fixture', basis: 'adjusted-close' as const,
  first: '2026-01-01', last: '2026-11-03', t: ['2026-03-30', '2026-06-01', '2026-10-31', '2026-11-03'], v: [1, 1, 1, 1], c: [100, 110, 120, 121], splits: [] as { date: string; factor: number }[] };
const held = { accountId: 'd', securityKey: 'example-d', security: 'Example D', isin: 'INE000000009', symbol: 'EXD', assetClass: 'Equity', marketSide: 'listed',
  quantity: 150, marketValue: 150 * 120, costBasis: null } as unknown as Position;
const book = (trades: object[], h = hist) => ({ positions: [held], unvalued: [], trades: { 'd|example-d': trades }, movements: {}, moves: [], actions: feed,
  instruments: new Map([['example-d', { key: 'example-d', query: 'symbol=EXD' }]]), histories: { 'example-d': h } }) as never;
const march: EarlierBalance[] = [{ accountId: 'd', securityKey: 'example-d', isin: 'INE000000009', asOf: '2026-03-31', quantity: 100, docKey: 'march' }];

// AN OLDER BALANCE AND THE BROKER'S TRADES SINCE: 100 on 31 Mar + 50 bought 1 Jun = 150 held.
{
  const buy = { date: '2026-06-01', side: 'buy', quantity: 50, price: 110, amount: 5500 };
  const f = tradedWindow(held, acct, '2026-03-31', '2026-11-03', book([buy]), march);
  assert.ok(f && 'window' in f, f && 'reason' in f ? f.reason : 'no window');
  if (f && 'window' in f) {
    assert.equal(f.window.openDate, '2026-03-30'); near(f.window.openValue, 100 * 100);
    assert.equal(f.window.closeDate, '2026-11-03'); near(f.window.closeValue, 150 * 121);
    assert.deepEqual(f.window.flows.map(x => [x.date, x.amount]), [['2026-06-01', -5500]]);
    near(f.window.gain, 150 * 121 - 10000 - 5500);
    assert.equal(f.unit.basis, 'broker-trades');
  }
  // Trades that do not take the older balance to the units held now are not used.
  assert.equal(tradedWindow(held, acct, '2026-03-31', '2026-11-03', book([{ ...buy, quantity: 40 }]), march), null);
  // A trade without an amount or price is not used.
  assert.equal(tradedWindow(held, acct, '2026-03-31', '2026-11-03', book([{ ...buy, amount: null, price: null }]), march), null);
  // A split inside the span leaves it to the engine.
  assert.equal(tradedWindow(held, acct, '2026-03-31', '2026-11-03', book([buy], { ...hist, splits: [{ date: '2026-07-01', factor: 2 }] }), march), null);
  // Opening later than the trade: the units held then, at that day's close, and no flow.
  const late = tradedWindow(held, acct, '2026-06-01', '2026-11-03', book([buy]), march);
  assert.ok(late && 'window' in late);
  if (late && 'window' in late) { near(late.window.openValue, 150 * 110); assert.equal(late.window.flows.length, 0); }
}

// AN OLDER BALANCE OF THE SAME UNITS, nothing traded since: the anchor; otherwise none.
{
  const same: EarlierBalance[] = [{ ...march[0], quantity: 150 }];
  assert.deepEqual(earlierBalanceOptions(held, book([]), same), { anchor: { quantity: 150, date: '2026-03-31' }, fromListing: true });
  assert.deepEqual(earlierBalanceOptions(held, book([{ date: '2026-06-01', side: 'buy', quantity: 1, price: 1, amount: 1 }]), same), { fromListing: true });
  assert.deepEqual(earlierBalanceOptions(held, book([]), march), { fromListing: true });
}

// A FUND'S UNITS AT A NAV A LATER STATEMENT PRINTS.
{
  const fund = { ...held, securityKey: 'fund-a2', quantity: 10, marketValue: 1000, marketSide: 'listed' } as Position;
  const fa = { ...acct, asOf: '2026-06-30' } as Account;
  const navs = { 'fund-a2': { isin: 'INF000000001', navs: [{ date: '2026-09-30', nav: 105, docKey: 'sep' }, { date: '2026-10-30', nav: 110, docKey: 'oct' }] } };
  const f = statementNavWindow(fund, fa, '2026-03-31', '2026-11-03', navs);
  assert.ok(f && 'window' in f);
  if (f && 'window' in f) {
    assert.equal(f.window.openDate, '2026-06-30'); near(f.window.openValue, 1000);
    assert.equal(f.window.closeDate, '2026-10-30'); near(f.window.closeValue, 1100); near(f.window.gain, 100);
    assert.equal(f.unit.basis, 'statement-nav'); assert.match(f.unit.assumption!.source, /oct/);
  }
  // A period that opens after the statement is not this rule's.
  assert.equal(statementNavWindow(fund, fa, '2026-07-01', '2026-11-03', navs), null);
  // No NAV printed after the statement: said, not guessed.
  const none = statementNavWindow(fund, { ...fa, asOf: '2026-10-30' } as Account, '2026-03-31', '2026-11-03', navs);
  assert.ok(none && 'reason' in none && /No statement after/.test(none.reason));
  // An unlinked holding is not touched.
  assert.equal(statementNavWindow(held, fa, '2026-03-31', '2026-11-03', navs), null);
}

// HELD AT ITS LAST VALUE: a named 0% from its valuation date; private too (Stage 10nu), never nil.
{
  const fund = { ...held, quantity: 5, marketValue: 2e6, navDate: '2026-08-06' } as Position;
  const u = heldAtLastValue(fund, acct, '2026-03-31', '2026-11-03', 'One statement only.');
  assert.ok(u);
  assert.equal(u!.gain, 0); assert.equal(u!.from, '2026-08-06'); assert.equal(u!.to, '2026-08-06'); assert.equal(u!.window!.carriedTo, '2026-11-03');
  near(u!.window!.openValue, 2e6); near(u!.window!.closeValue, 2e6); assert.deepEqual(u!.held, { date: '2026-08-06', reason: 'One statement only.' });
  // Valued before the period opens: held from the opening.
  assert.equal(heldAtLastValue({ ...fund, navDate: '2026-01-15' } as Position, acct, '2026-03-31', '2026-11-03', 'x')!.from, '2026-03-31');
  const priv = heldAtLastValue({ ...fund, marketSide: 'private' } as Position, acct, '2026-03-31', '2026-11-03', 'x');
  assert.equal(priv!.gain, 0); assert.equal(priv!.from, '2026-08-06'); near(priv!.close, 2e6);
  assert.equal(heldAtLastValue({ ...fund, marketValue: 0 } as Position, acct, '2026-03-31', '2026-11-03', 'x'), null);
  assert.equal(heldAtLastValue({ ...fund, navDate: '2026-11-03' } as Position, acct, '2026-03-31', '2026-11-03', 'x'), null);
}

// THE BUILD'S EVIDENCE: older balances, printed NAVs and unchanged-unit windows.
{
  const doc = (asOf: string, holdings: object[], o: object = {}) => ({ docKey: `doc-${asOf}`, asOf, status: 'ok', reportType: 'holdings', holdings, ...o });
  const accounts = [{ accountId: 'x', provider: 'P', accountNo: '1', asOf: '2026-10-31' }, { accountId: 'y', provider: 'Q', accountNo: '2', asOf: '2026-09-30' },
    { accountId: 'z', provider: 'R', accountNo: '3', asOf: '2026-06-30' }];
  const positions = [{ accountId: 'x', securityKey: 'esds', isin: 'INE1', quantity: 10, marketSide: 'listed' },
    { accountId: 'y', securityKey: 'fund', isin: null, quantity: 5, marketSide: 'listed' },
    { accountId: 'z', securityKey: 'aif-a2', isin: null, quantity: 7, marketSide: 'listed' }];
  const byAccount = new Map([
    ['P::1', [doc('2026-03-31', [{ securityKey: 'esds-old-name', isin: 'INE1', quantity: 10 }, { securityKey: 'sold', quantity: 3 },
      { securityKey: 'aif', isin: 'INF9', quantity: 7, marketValue: 700 }]), doc('2026-10-31', [{ securityKey: 'esds', isin: 'INE1', quantity: 10 },
      { securityKey: 'aif', isin: 'INF9', quantity: 7, marketValue: 770, priceAsOn: '2026-10-30' }])]],
    ['Q::2', [doc('2026-07-31', [{ securityKey: 'fund', quantity: 5, marketValue: 100 }]), doc('2026-08-31', [{ securityKey: 'fund', quantity: 5.04, marketValue: 104 }], { reportType: 'appraisal', docKey: 'appraisal-08-31' }),
      doc('2026-08-31', [{ securityKey: 'fund', quantity: 5.0004, marketValue: 104 }]),
      doc('2026-09-30', [{ securityKey: 'fund', quantity: 5, marketValue: 110 }])]],
  ]);
  const records = { x: { record: null }, y: { record: null } };
  const links = [{ securityKey: 'aif-a2', isin: 'INF9' }];
  const e = periodEvidence({ byAccount, accounts, positions, accountReturnRecords: records, links });
  // Joined by ISIN where the key changed; a holding the book no longer carries is left out.
  assert.deepEqual(e.earlierBalances.filter((b: { accountId: string }) => b.accountId === 'x'), [{ accountId: 'x', securityKey: 'esds', isin: 'INE1', asOf: '2026-03-31', quantity: 10, docKey: 'doc-2026-03-31' }]);
  assert.deepEqual(e.statementUnitNavs, { 'aif-a2': { isin: 'INF9', navs: [{ date: '2026-03-31', nav: 100, docKey: 'doc-2026-03-31' }, { date: '2026-10-30', nav: 110, docKey: 'doc-2026-10-31' }] } });
  // On 31 Aug the holdings report (5.0004, inside the rounding) is read before the appraisal (5.04): one unchanged run.
  assert.deepEqual(e.unitWindows.y.valuations.map((v: { date: string; docKey: string }) => [v.date, v.docKey]),
    [['2026-07-31', 'doc-2026-07-31'], ['2026-08-31', 'doc-2026-08-31'], ['2026-09-30', 'doc-2026-09-30']]);
  assert.equal(e.unitWindows.x, undefined); // its statements print no values
  assert.match(e.unitWindows.y.evidence, /same units of the same holding/);
  // An account with a verified record keeps none of these.
  assert.deepEqual(periodEvidence({ byAccount, accounts, positions, accountReturnRecords: { x: { record: {} }, y: { record: {} } }, links }).earlierBalances, []);
  // A NAV link whose units tie to no book holding throws rather than price another security.
  assert.throws(() => periodEvidence({ byAccount, accounts, positions: positions.slice(0, 2), accountReturnRecords: records, links }), /not verified/);
}

// CARRIED AT ITS LATEST VALUE TO THE END: a record that closes on 30 Sep stays
// invested in the pool — the same gain, never money withdrawn on 30 Sep.
{
  const w = (closeDate: string, closeValue: number, carriedTo?: string): AccountWindow => ({ accountId: closeDate, label: closeDate, owner: '', openDate: '2026-03-31',
    openValue: 100, openedInWindow: false, closeDate, closeValue, carriedTo, flows: [], capitalIn: 0, capitalOut: 0, gain: closeValue - 100 });
  const rows = [w('2026-09-30', 110), w('2026-10-31', 100)];
  const plain = measureWindow(rows, 'absolute', String), carried = measureWindow([{ ...rows[0], carriedTo: '2026-10-31' }, rows[1]], 'absolute', String);
  near(plain.working!.gain, 10); near(carried.working!.gain, 10);
  near(carried.pct!, 10 / 200 * 100); // both at work all 214 days
  assert.ok(plain.pct! > carried.pct!, 'an early close read as a withdrawal shrinks the base');
}

// THE RETURN LINE (Stage 10la): the card's measure ended on each day — its last
// point is the card; between marks a record holds its value, plus money moved.
{
  const a: AccountWindow = { accountId: 'a', label: 'a', owner: '', openDate: '2026-03-31', openValue: 100, openedInWindow: false,
    closeDate: '2026-09-30', closeValue: 150, marks: [{ date: '2026-06-30', value: 120 }], carriedTo: '2026-10-31',
    flows: [{ date: '2026-07-15', amount: -20 }], capitalIn: 20, capitalOut: 0, gain: 30 };
  const b: AccountWindow = { accountId: 'b', label: 'b', owner: '', openDate: '2026-08-06', openValue: 50, openedInWindow: false,
    closeDate: '2026-08-06', closeValue: 50, carriedTo: '2026-10-31', flows: [], capitalIn: 0, capitalOut: 0, gain: 0 };
  near(valueOn(a, '2026-05-01'), 100); near(valueOn(a, '2026-07-01'), 120); near(valueOn(a, '2026-07-20'), 140); near(valueOn(a, '2026-10-01'), 150);
  assert.equal(windowOn(b, '2026-08-01'), null, 'a record joins on its own first value');
  const line = periodLine([a, b], 'xirr', '2026-03-31', '2026-10-31');
  assert.equal(line[0].date, '2026-03-31'); near(line[0].pct!, 0);
  near(line.at(-1)!.pct!, measureWindow([a, b], 'xirr', String).working!.periodPct!, 1e-9);
  near(line.at(-1)!.gain, 30);
  assert.ok(line.some((p) => p.date === '2026-06-30') && line.some((p) => p.date === '2026-08-06'), 'drawn through every mark and opening');
  // The index on the same money: its last point is the card's own comparison.
  const level = (d: string) => (d < '2026-06-01' ? 1000 : d < '2026-09-01' ? 1100 : 1050);
  const pme = periodLine([a, b], 'xirr', '2026-03-31', '2026-10-31', { level });
  near(pme.at(-1)!.pct!, measureWindow(pmeWindowRows([a, b], level).rows!, 'xirr', String).working!.periodPct!, 1e-9);
}

console.log('ok   period rules — broker trades, earlier balances, printed NAVs, held at last value, build evidence');
