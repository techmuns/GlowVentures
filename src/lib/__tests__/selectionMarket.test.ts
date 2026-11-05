import assert from 'node:assert/strict';
import { selectionMarket, selectionMarketOf, unitOwnReturn } from '../selectionMarket';
import { heldBeforeYear, investedThisYear, placeEveryHolding, type FirstValueUnit } from '../investedThisYear';
import type { ReturnGap, ReturnUnit } from '../selectedSegmentReturns';
import type { AccountWindow } from '../periodReturns';
import type { Position } from '../types';

/**
 * THE RETURNS TAB'S ONE SELECTION (Stage 10lg): Market performance is each
 * holding's own return over its part of the period — the same units the
 * investment figure pools — weighted by today's value; Invested this year
 * places every holding from the financial year's own selection.
 */
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} != ${b}`);
const pos = (accountId: string, securityKey: string, marketValue: number, extra: Partial<Position> = {}) =>
  ({ accountId, securityKey, security: securityKey, marketValue, marketSide: 'listed', assetClass: 'Equity', ...extra }) as unknown as Position;
const win = (accountId: string, openDate: string, openValue: number, closeDate: string, closeValue: number, flows: AccountWindow['flows'] = []): AccountWindow => {
  const capitalIn = flows.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const capitalOut = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  return { accountId, label: accountId, owner: 'Owner', openDate, openValue, openedInWindow: openValue === 0, closeDate, closeValue, flows, capitalIn, capitalOut,
    gain: closeValue - openValue - capitalIn + capitalOut };
};
const unit = (key: string, positions: Position[], w: AccountWindow | null, extra: Partial<ReturnUnit> = {}): ReturnUnit => ({
  key, accountId: positions[0].accountId, label: key, positions, gain: w?.gain ?? 0, invested: w ? w.openValue + w.capitalIn : 0,
  close: w?.closeValue ?? 0, from: w?.openDate ?? null, to: w?.closeDate ?? '2026-11-05', ...(w ? { window: w } : {}), ...extra });

// A UNIT'S OWN RETURN: its window's period return, carried or not; 0% where held; null where nothing was invested.
{
  const w = win('a', '2026-03-31', 100, '2026-09-30', 110);
  near(unitOwnReturn(unit('a', [pos('a', 'x', 110)], w)), 10, 1e-6);
  // Carrying the record to the period's end adds no return of its own.
  near(unitOwnReturn(unit('a', [pos('a', 'x', 110)], { ...w, carriedTo: '2026-11-05' })), 10, 1e-6);
  assert.equal(unitOwnReturn(unit('h', [pos('h', 'y', 50)], null, { held: { date: '2026-06-30', reason: 'no second value' } })), 0);
  near(unitOwnReturn(unit('g', [pos('g', 'z', 120)], null, { gain: 20, invested: 100 })), 20);
  assert.equal(unitOwnReturn(unit('n', [pos('n', 'z', 120)], null, { gain: 20, invested: 0 })), null);
}

// EVERY HOLDING ITS OWN RETURN, WEIGHTED BY TODAY'S VALUE.
{
  const a1 = pos('acct', 'one', 300), a2 = pos('acct', 'two', 100);     // one whole account: both its holdings take its return
  const b = pos('demat', 'share', 600);                                  // one holding on its own window
  const h = pos('demat', 'flat', 200);                                   // held at its last value
  const loading = pos('demat', 'loading', 50), failed = pos('demat', 'failed', 70), priv = pos('aif', 'private', 900, { marketSide: 'private', assetClass: 'AIF' });
  const nil = pos('demat', 'nil', 0);
  const units = [
    unit('acct', [a1, a2], win('acct', '2026-03-31', 400, '2026-10-31', 440)),                               // +10%
    unit('demat|share', [b], win('demat|share', '2026-04-15', 500, '2026-11-03', 600)),                       // +20%
    unit('demat|flat', [h], null, { held: { date: '2026-02-01', reason: 'no second value' }, from: '2026-02-01', to: '2026-02-01' }),
  ];
  const missing: ReturnGap[] = [
    { accountId: 'demat', label: 'demat', reason: 'An account-level reason.' },
    { accountId: 'demat', securityKey: 'loading', label: 'loading', reason: 'Prices are still loading. No new statement is needed yet.' },
    { accountId: 'demat', securityKey: 'failed', label: 'failed', reason: 'Historical prices could not load. Retry the price history; no new statement is needed yet.',
      detail: 'The price source returned HTTP 404 for this listing.' },
  ];
  const m = selectionMarket([a1, a2, b, h, loading, failed, priv, nil], units, missing, '2026-03-31', '2026-11-05');
  assert.equal(m.count, 4);
  near(m.pct, (300 * 10 + 100 * 10 + 600 * 20 + 200 * 0) / 1200, 1e-6);
  near(m.value, 1200);
  assert.equal(m.annual, false, 'each holding over its own part of the period, never annualised');
  assert.equal(m.pending, 1, 'still loading waits for prices');
  const gap = (k: string) => m.gaps.find((g) => g.position.securityKey === k);
  assert.equal(gap('failed')?.code, 'source');
  assert.match(gap('failed')!.reason, /HTTP 404/, 'the holding’s own gap names the source’s answer, not its account’s');
  assert.equal(gap('private')?.code, 'unmatched');
  assert.match(gap('private')!.reason, /private/i);
  assert.equal(gap('nil')?.code, 'value');
  assert.equal(m.units.length + m.gaps.length + m.pending, 8, 'every holding is counted once');
  // The dates measured: a holding held at its last value sets neither.
  assert.equal(m.from, '2026-03-31'); assert.equal(m.to, '2026-11-03');
  assert.match(m.units.find((u) => u.position === h)!.source!, /held at its last value since 2026-02-01/);
  // One row's figure is the same holdings' returns; its dates, like the total's, skip the held one.
  const row = selectionMarketOf(m, [b, h, priv]);
  assert.equal(row.count, 2); near(row.pct, (600 * 20) / 800, 1e-6); assert.equal(row.gaps.length, 1);
  assert.equal(row.from, '2026-04-15'); assert.equal(row.to, '2026-11-03');
  const flat = selectionMarketOf(m, [h]);
  assert.equal(flat.count, 1); assert.equal(flat.from, null); assert.equal(flat.to, null, 'a row held at its last value claims no other holdings’ dates');
  // A private holding inside a measured unit: apart on a period, counted Since investment.
  const pv = pos('acct2', 'unlisted', 100, { marketSide: 'private' }), pl = pos('acct2', 'listed', 100);
  const both = [unit('acct2', [pv, pl], win('acct2', '2026-03-31', 100, '2026-10-31', 200))];
  const period = selectionMarket([pv, pl], both, [], '2026-03-31', '2026-11-05');
  assert.equal(period.count, 0, 'an account return that carries private investments is not the public holding’s own');
  assert.equal(period.gaps.length, 2); assert.ok(period.gaps.every((g) => /private/i.test(g.reason)));
  assert.equal(selectionMarket([pv, pl], both, [], '2026-03-31', '2026-11-05', { inception: true }).count, 2);
}

// INVESTED THIS YEAR: EVERY HOLDING PLACED FROM THE YEAR'S OWN SELECTION, ON ITS OWN EVIDENCE.
{
  const bought = pos('d', 'bought', 110), before = pos('d', 'before', 200, { quantity: 10 }), firstMay = pos('acct', 'may', 300), firstMay2 = pos('acct', 'may2', 100);
  const opened = pos('d', 'opened', 50), none = pos('d', 'none', 80), older = pos('d', 'older', 40);
  const mixed = pos('pms', 'mixed', 70), sold = pos('pms2', 'sold', 60), atCost = pos('d', 'at-cost', 90, { valuedAtCost: true }), noValue = pos('d', 'no-value', 30);
  const bond = pos('debt', 'bond', 105, { assetClass: 'Bond' });
  const included = [{ position: bought, lots: [{ date: '2026-05-02', quantity: 1, cost: 100 }], cost: 100, value: 110, gain: 10, first: '2026-05-02', last: '2026-05-02',
    valuedOn: '2026-11-03', periodPct: 10, pct: 10, annual: false, returnMissing: null }];
  const purchases = (position: Position) => ({ position, need: 'purchases' as const, reason: 'We need purchase dates.' });
  const result = { included, older: [older],
    missing: [...[before, firstMay, firstMay2, opened, none, mixed, sold, atCost, bond].map(purchases),
      { position: noValue, need: 'value' as const, reason: 'We need a dated market value after these purchases.' }],
    cost: 100, value: 110, gain: 10, pct: 10, periodPct: 10, weightValue: 110, annual: false };
  const units: FirstValueUnit[] = [
    // A whole account first valued on 15 May at 300, 60 added on 1 Aug: its holdings share that money by value today.
    { positions: [firstMay, firstMay2], from: '2026-05-15', to: '2026-10-31', invested: 360, close: 410, gain: 50, ownPct: 13,
      openValue: 300, capitalIn: 60, capitalOut: 0, flows: [{ date: '2026-08-01', amount: -60 }] },
    // A record that opens on the year's own opening value, nothing added: held before the year.
    { positions: [opened], from: '2026-03-31', to: '2026-10-31', invested: 45, close: 50, gain: 5, ownPct: 5 / 45 * 100, openValue: 45, capitalIn: 0, capitalOut: 0 },
    // Held before the year AND added to this year: this year's units cannot be told apart.
    { positions: [mixed], from: '2026-03-31', to: '2026-10-31', invested: 65, close: 70, gain: 5, ownPct: 7, openValue: 40, capitalIn: 25, capitalOut: 0 },
    // First valued this year, then money taken out: the units still held cannot be told from those sold.
    { positions: [sold], from: '2026-06-30', to: '2026-10-31', invested: 80, close: 60, gain: 5, ownPct: 6, openValue: 80, capitalIn: 0, capitalOut: 25 },
    // Verified purchases at cost, and a verified purchase with no value: they keep their own reasons.
    { positions: [atCost], from: '2026-06-30', to: '2026-10-31', invested: 90, close: 90, gain: 0, ownPct: 0, openValue: 90 },
    { positions: [noValue], from: '2026-06-30', to: '2026-10-31', invested: 30, close: 30, gain: 0, ownPct: 0, openValue: 30 },
    // Debt first valued on 5 May at 100.
    { positions: [bond], from: '2026-05-05', to: '2026-11-03', invested: 100, close: 105, gain: 5, ownPct: 5, openValue: 100, capitalIn: 0, capitalOut: 0 },
  ];
  const quantities = [{ accountId: 'd', securityKey: 'before', asOf: '2026-03-31', quantity: 10 }];
  // A first-valued share that paid a dividend still holds its units; one valued only before its first value has no close.
  const paid = pos('d', 'paid', 120), stale = pos('d', 'stale', 50);
  result.missing.push(purchases(paid), purchases(stale));
  units.push({ positions: [paid], from: '2026-06-30', to: '2026-11-03', invested: 100, close: 120, gain: 22, ownPct: 22, openValue: 100, capitalIn: 0, capitalOut: 2,
    flows: [{ date: '2026-08-01', amount: 2, description: 'Gross dividend entitlement' }] },
    { positions: [stale], from: '2026-12-01', to: '2026-12-31', invested: 40, close: 50, gain: 10, ownPct: 25, openValue: 40, capitalIn: 0, capitalOut: 0 });
  const place = (type: 'absolute' | 'xirr' | 'cagr') => placeEveryHolding(result as unknown as ReturnType<typeof investedThisYear>, units, '2026-03-31',
    (p) => heldBeforeYear(p, '2026-03-31', quantities, {}), { type, valuedOn: () => '2026-11-03' });
  const r = place('absolute');
  assert.deepEqual(r.older.map((p) => p.securityKey).sort(), ['before', 'older', 'opened']);
  assert.deepEqual(r.missing.map((g) => g.position.securityKey).sort(), ['at-cost', 'mixed', 'no-value', 'none', 'sold', 'stale'], 'what no record separates stays named, with its reason');
  assert.ok(r.firstValued.some((x) => x.position === paid), 'a dividend is not a sale');
  assert.match(r.missing.find((g) => g.position === stale)!.reason, /on or after its first value/);
  assert.match(r.missing.find((g) => g.position === mixed)!.reason, /money added this year/);
  assert.match(r.missing.find((g) => g.position === sold)!.reason, /taken out/);
  assert.match(r.missing.find((g) => g.position === noValue)!.reason, /market value/, 'a missing value keeps its reason');
  assert.equal(r.firstValued.length, 4);
  const may = r.firstValued.find((x) => x.position === firstMay)!;
  assert.equal(may.first, '2026-05-15'); near(may.cost, 360 * 300 / 400); near(may.value, 300);
  near(may.gain, may.value - may.cost, 1e-9); near(may.pct!, (may.value / may.cost - 1) * 100, 1e-9);
  for (const x of r.included) near(x.gain, x.value - x.cost, 1e-9);
  near(r.gain, r.value - r.cost, 1e-9); near(r.cost, 100 + 360 + 100 + 100);
  assert.equal(r.included.length + r.missing.length + r.older.length, 14, 'every holding placed once');
  // An older balance of OTHER units than held now, or a trade since, is no proof the holding predates the year.
  assert.equal(heldBeforeYear(before, '2026-03-31', [{ ...quantities[0], quantity: 6 }], {}), false);
  assert.equal(heldBeforeYear(before, '2026-03-31', quantities, { 'd|before': [{ date: '2026-06-01' }] }), false);
  assert.equal(heldBeforeYear(before, '2026-03-30', quantities, {}), false);
  // XIRR: equities under a year stay absolute; first-valued debt is annualised as purchased debt is.
  const x = place('xirr');
  const xb = x.firstValued.find((y) => y.position === bond)!, xm = x.firstValued.find((y) => y.position === firstMay)!;
  assert.equal(xm.annual, false); near(xm.pct!, may.pct!, 1e-9);
  assert.equal(xb.annual, true); assert.ok(xb.pct! > 5, `${xb.pct}: a yearly rate above the 5% over six months`);
  const c = place('cagr').firstValued.find((y) => y.position === bond)!;
  near(c.pct!, (Math.pow(105 / 100, 365 / 182) - 1) * 100, 1e-6);
}

console.log('selection market: every holding its own return weighted by value, loading vs failed vs private gaps, row figures, and every holding placed this year passed.');

// THE TAB'S SELECTION IS THE CARDS' (the family, 5 Nov 2026): on the page's own
// rows, FYTD, YTD and Since investment strike the same figures as the three
// return cards and the Gain / Loss card, and Market performance pools the same units.
{
  const { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_RETURN_RECORDS } = await import('../../data/glowData');
  const { pageConsolidated, failedHistoryBook } = await import('../../../scripts/dev/page-book');
  const { availableCardReturns, statementReturnInputs } = await import('../availableCardReturns');
  const { returnSelectionFor } = await import('../useReturnSelection');
  const { selectedSegmentReturns } = await import('../selectedSegmentReturns');
  const { currentHoldings, dedupedPositions } = await import('../analytics');
  const { exitedRows } = await import('../drilldown');
  const { periodStart } = await import('../periodReturns');
  const statement = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountReturnRecords: BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: {} } as never;
  const consolidated = pageConsolidated(null), current = currentHoldings(consolidated), assumptions = failedHistoryBook(consolidated, null);
  const end = '2026-11-05', cards = availableCardReturns(statement, consolidated, statementReturnInputs(statement), new Date(`${end}T12:00:00`), assumptions);
  const recorded = dedupedPositions(BOOK_POSITIONS);
  const tab = (period: 'fytd' | 'ytd' | 'inception', type: 'xirr' | 'absolute') => {
    const selection = returnSelectionFor({ period, start: period === 'inception' ? null : periodStart(period, end), end, type, statement, current, assumptions })!;
    return selectedSegmentReturns(current, exitedRows(recorded), BOOK_ACCOUNTS, 'category', selection, () => null, currentHoldings(recorded)).total;
  };
  const same = (a: { returnPct: number | null; gain: number | null; units: readonly ReturnUnit[] }, b: typeof a, what: string) => {
    assert.ok(a.returnPct != null && Number.isFinite(a.returnPct), `${what}: a figure`);
    near(a.returnPct, b.returnPct!, 1e-9); near(a.gain, b.gain!, 1e-3);
    assert.equal(a.units.length, b.units.length, `${what}: the same units`);
  };
  same(tab('fytd', 'xirr'), cards.fytd.total, 'FYTD');
  same(tab('ytd', 'xirr'), cards.ytd.total, 'YTD');
  same(tab('inception', 'xirr'), cards.history.total, 'Since investment · XIRR');
  same(tab('inception', 'absolute'), cards.gain.total, 'Since investment · absolute');
  // Market performance covers every holding the FYTD figure measures.
  const fy = tab('fytd', 'xirr'), m = selectionMarket(current, fy.units, fy.missing, periodStart('fytd', end), end);
  const pooled = new Set(fy.units.flatMap((u) => u.positions.filter((p) => p.marketValue > 0).map((p) => `${p.accountId}|${p.securityKey}`)));
  assert.equal(m.count, current.filter((p) => pooled.has(`${p.accountId}|${p.securityKey}`)).length);
  console.log(`the tab's selection: FYTD ${fy.returnPct!.toFixed(2)}% = card, YTD, since investment (XIRR and absolute) = cards; market over ${m.count} holdings.`);
}
