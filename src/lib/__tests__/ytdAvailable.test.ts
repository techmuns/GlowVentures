// YTD FROM THE FIRST DATE WE HAVE (Stage 10jl).   npm run test:family (ONLY="ytd from the first date")
import assert from 'node:assert/strict';
import { ytdBook } from '../ytdAvailable';
import { measuredReturn } from '../analytics';
import { statementReturnInputs } from '../availableCardReturns';
import type { AccountInput } from '../periodReturns';
import type { Account, Portfolio, Position } from '../types';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_RETURN_RECORDS } from '../../data/glowData';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const accounts = [{ accountId: 'a', accountNo: '111', owner: 'Ajay', provider: 'Manager', asOf: '2026-09-30' }] as Account[];
const pos = (o: Partial<Position>) => ({ accountId: 'a', securityKey: 'x', security: 'Share X', marketValue: 132, costBasis: 100,
  quantity: 1, assetClass: 'Equity', ...o }) as Position;
const held = [pos({}), pos({ securityKey: 'y', security: 'Share Y', marketValue: 0, quantity: 0 })];
const input: AccountInput = { accountId: 'a', label: 'Manager · 111', owner: 'Ajay',
  valuations: [{ date: '2026-03-31', value: 100 }, { date: '2026-09-30', value: 132 }],
  flows: [{ date: '2026-06-30', amount: -20 }], knownFrom: '2026-03-31', knownTo: '2026-09-30', flowsUnknown: null, undated: [] };
const money = String;
const book = ytdBook({ inputs: [input], held, accounts, end: '2026-10-30', assumptions: null, money });

// A WHOLE ACCOUNT, from its first verified value this year — Modified Dietz.
const whole = book.of(held);
assert.ok(whole.shown);
if (whole.shown) {
  assert.equal(whole.from, '2026-03-31'); assert.equal(whole.to, '2026-09-30');
  assert.equal(whole.fullYear, false); assert.equal(whole.assumed, false); assert.deepEqual(whole.accounts, ['a']);
  const D = 183, w = 92;   // 31 Mar → 30 Sep; the 30 Jun money is at work for 92 of them
  near(whole.pct, (132 - 100 - 20) / (100 + 20 * w / D) * 100);
  assert.match(whole.note, /not annualised/); assert.match(whole.note, /31 Mar 2026/);
}
// …tagged with its start under the YTD measure, never as a full year to date.
const r = measuredReturn({ returnPct: 32, heldSince: null, assetClass: 'Equity', ytdFrom: whole }, 'ytd', '2026-09-30');
assert.ok(r.shown && r.tag === 'from 31 Mar' && r.from === '2026-03-31');
// A holding opened this year keeps its full year to date, whatever the account says.
const opened = measuredReturn({ returnPct: 12.5, heldSince: '2026-03-02', assetClass: 'Equity', ytdFrom: whole }, 'ytd', '2026-09-30');
assert.ok(opened.shown && opened.tag === 'YTD' && opened.pct === 12.5);

// PART OF AN ACCOUNT is never handed the account's return: with no published
// prices to carry its units, it is a dash naming why.
const part = ytdBook({ inputs: [input], held: [...held, pos({ securityKey: 'z', security: 'Share Z' })], accounts, end: '2026-10-30', assumptions: null, money }).of([held[0]]);
assert.ok(!part.shown && /prices are still loading/i.test(part.reason) && part.pending === true);
const dash = measuredReturn({ returnPct: 32, heldSince: null, assetClass: 'Equity', ytdFrom: part }, 'ytd', '2026-09-30');
assert.ok(!dash.shown && /1 January/.test(dash.reason) && /From a later date this year/.test(dash.reason));

// A VALUE ON 31 DECEMBER IS A FULL YEAR TO DATE, and is tagged as one.
const full = ytdBook({ inputs: [{ ...input, valuations: [{ date: '2025-12-31', value: 90 }, ...input.valuations], knownFrom: '2025-06-30' }],
  held, accounts, end: '2026-10-30', assumptions: null, money }).of(held);
assert.ok(full.shown && full.fullYear && full.from === '2025-12-31');
const fullTag = measuredReturn({ returnPct: 32, heldSince: null, assetClass: 'Equity', ytdFrom: full }, 'ytd', '2026-09-30');
assert.ok(fullTag.shown && fullTag.tag === 'YTD');

// A REFUSED RECORD stays a dash with the record's own reason.
const refused = ytdBook({ inputs: [{ ...input, valuations: [], flows: [], flowsUnknown: 'no dated record' }], held, accounts, end: '2026-10-30', assumptions: null, money }).of(held);
assert.ok(!refused.shown && /no dated record/.test(refused.reason));

// THE REAL ARCHIVE: Carnelian 3517383 opens on its verified 31 March value.
const empty = { peFunds: [], preIpoFunds: [], unlistedCompanies: [], debtFunds: [], closedFunds: [], startups: [] };
const statement = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS,
  accountReturnRecords: BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: empty } as unknown as Portfolio;
const real = ytdBook({ inputs: statementReturnInputs(statement), held: BOOK_POSITIONS, accounts: BOOK_ACCOUNTS, end: '2026-10-30', assumptions: null, money });
const id = 'carnelian-asset-management-and-advisors-pvt-ltd-3517383';
const carnelian = real.of(BOOK_POSITIONS.filter((p) => p.accountId === id));
assert.ok(carnelian.shown && carnelian.from === '2026-03-31' && carnelian.accounts.join() === id && Number.isFinite(carnelian.pct));
// …AND PARTS VALUED ON DIFFERENT DATES ARE NOT POOLED: V.E.C 128005 closes on
// 13 Aug and 128004 on 7 Oct, and pooled the earlier value would read as money
// taken out. Each account still carries its own.
const vec = ['v-e-c-assago-capital-management-llp-128005', 'v-e-c-assago-capital-management-llp-128004'];
const vecRow = real.of(BOOK_POSITIONS.filter((p) => vec.includes(p.accountId)));
assert.ok(!vecRow.shown && /different dates/.test(vecRow.reason), vecRow.shown ? `${vecRow.pct}` : vecRow.reason);
for (const v of vec) { const one = real.of(BOOK_POSITIONS.filter((p) => p.accountId === v)); assert.ok(one.shown && one.from === '2026-03-31'); }

// A FULL YEAR TO DATE FROM THE PURCHASE RECORD (Stage 10jo): the units held on
// 1 January at 31 December's close, this year's sales on their dates, and the
// units carried from the statement at published closes, assumed still held.
{
  const acct = { accountId: 'd', accountNo: '222', owner: 'Owner D', provider: 'Demat', asOf: '2026-07-31', engagement: 'Direct' } as Account;
  const record = { accountId: 'd', isin: 'INE000000009', quantity: 43, asOf: '2026-07-31', costBasis: 4300, realizedPnL: 900, costOfUnitsSold: 4700, dividendReceived: null,
    heldPurchases: { first: '2024-11-13', last: '2024-11-13', lots: 1 },
    cashRecord: [{ date: '2024-11-13', side: 'buy' as const, amount: 9000 }, { date: '2026-05-18', side: 'sell' as const, amount: 4200 }, { date: '2026-05-27', side: 'sell' as const, amount: 1560 }],
    unitRecord: [{ date: '2024-11-13', units: 90 }, { date: '2026-05-18', units: 55 }, { date: '2026-05-27', units: 43 }],
    evidence: [], notes: [] };
  const held = { accountId: 'd', securityKey: 'example-d', security: 'Example D', isin: 'INE000000009', symbol: 'EXD', assetClass: 'Equity', marketSide: 'listed',
    quantity: 43, marketValue: 43 * 150, costBasis: 4300, live: true, recoveredCost: record } as unknown as Position;
  const feed = { version: 1, capturedAt: '2026-10-29T00:00:00Z', requestedFrom: '2023-01-01', requestedTo: '2027-01-01', verifiedThrough: '2026-10-29', symbols: ['EXD'], isins: [], sourceUrl: 'fixture', rows: [] };
  const hist = { ok: true as const, version: 2, symbol: 'EXD.NS', isin: null, name: 'Example D', source: 'Public price fixture', basis: 'adjusted-close' as const,
    first: '2025-12-31', last: '2026-10-29', t: ['2025-12-31', '2026-07-31', '2026-10-29'], v: [1, 1, 1], c: [100, 140, 150], splits: [] };
  const assumptions = { positions: [held], unvalued: [{ accountId: 'd', securityKey: 'example-d', isin: 'INE000000009', quantity: 43, asOf: '2026-07-31' }],
    trades: {}, movements: {}, moves: [], actions: feed, instruments: new Map([['example-d', { key: 'example-d', query: 'symbol=EXD' }]]), histories: { 'example-d': hist } } as never;
  const y = ytdBook({ inputs: [], held: [held], accounts: [acct], end: '2026-10-30', assumptions, money }).of([held]);
  assert.ok(y.shown, y.shown ? '' : y.reason);
  if (y.shown) {
    assert.equal(y.from, '2025-12-31'); assert.equal(y.to, '2026-10-29'); assert.ok(y.fullYear && y.assumed);
    const D = 302, V0 = 90 * 100, V1 = 43 * 150, out1 = 4200, out2 = 1560;   // 31 Dec → 29 Oct; sales on days 138 and 147
    near(y.pct, (V1 - V0 + out1 + out2) / (V0 - out1 * (D - 138) / D - out2 * (D - 147) / D) * 100);
    assert.match(y.note, /reconciled purchase record/); assert.match(y.note, /Owner D still holds/);
    const tag = measuredReturn({ returnPct: 30, heldSince: '2024-11-13', assetClass: 'Equity', ytdFrom: y }, 'ytd', '2026-10-30');
    assert.ok(tag.shown && tag.tag === 'YTD' && tag.assumed === true, 'a full year to date, labelled assumed');
  }
  // A split this year before the statement leaves the record's units on another basis: the old path.
  const split = ytdBook({ inputs: [], held: [held], accounts: [acct], end: '2026-10-30', money,
    assumptions: { ...(assumptions as object), histories: { 'example-d': { ...hist, splits: [{ date: '2026-03-01', factor: 2 }] } } } as never }).of([held]);
  assert.ok(!split.shown || split.from !== '2025-12-31', 'no 1 January start across an unchecked split');
}
console.log('ok   ytd from the first date we have — whole accounts, part accounts, a full year, a refused record, parts valued apart, the purchase record and the archive');
