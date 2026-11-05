import assert from 'node:assert/strict';
import { selectionMarket, selectionMarketOf, unitOwnReturn } from '../selectionMarket';
import { investedThisYear, placeEveryHolding, type FirstValueUnit } from '../investedThisYear';
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
  // One row's figure is the same holdings' returns.
  const row = selectionMarketOf(m, [b, h, priv]);
  assert.equal(row.count, 2); near(row.pct, (600 * 20) / 800, 1e-6); assert.equal(row.gaps.length, 1);
}

// INVESTED THIS YEAR: EVERY HOLDING PLACED FROM THE YEAR'S OWN SELECTION.
{
  const bought = pos('d', 'bought', 110), before = pos('d', 'before', 200), firstMay = pos('acct', 'may', 300), firstMay2 = pos('acct', 'may2', 100);
  const opened = pos('d', 'opened', 50), none = pos('d', 'none', 80), older = pos('d', 'older', 40);
  const included = [{ position: bought, lots: [{ date: '2026-05-02', quantity: 1, cost: 100 }], cost: 100, value: 110, gain: 10, first: '2026-05-02', last: '2026-05-02',
    valuedOn: '2026-11-03', periodPct: 10, pct: 10, annual: false, returnMissing: null }];
  const result = { included, missing: [before, firstMay, firstMay2, opened, none].map((position) => ({ position, reason: 'We need purchase dates.' })), older: [older],
    cost: 100, value: 110, gain: 10, pct: 10, periodPct: 10, weightValue: 110, annual: false };
  const units: FirstValueUnit[] = [
    // A whole account first valued on 15 May: its holdings share its money by value.
    { positions: [firstMay, firstMay2], from: '2026-05-15', to: '2026-10-31', invested: 360, close: 400, gain: 40, ownPct: 40 / 360 * 100 },
    // A record that opens on the year's own opening value was held before the year.
    { positions: [opened], from: '2026-03-31', to: '2026-10-31', invested: 45, close: 50, gain: 5, ownPct: 5 / 45 * 100 },
  ];
  const r = placeEveryHolding(result as unknown as ReturnType<typeof investedThisYear>, units, '2026-03-31', (p) => p === before);
  assert.deepEqual(r.older.map((p) => p.securityKey).sort(), ['before', 'older', 'opened']);
  assert.deepEqual(r.missing.map((g) => g.position.securityKey), ['none'], 'only what no record values stays named');
  assert.equal(r.firstValued.length, 2);
  const may = r.firstValued.find((x) => x.position === firstMay)!;
  assert.equal(may.first, '2026-05-15'); near(may.cost, 360 * 300 / 400); near(may.gain, 40 * 300 / 400); near(may.pct!, 40 / 360 * 100);
  assert.equal(r.included.length + r.missing.length + r.older.length, 7, 'every holding placed once');
  near(r.cost, 100 + 360); near(r.gain, 10 + 40); near(r.value, 110 + 400);
  near(r.pct!, (110 * 10 + 400 * (40 / 360 * 100)) / 510, 1e-9);
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
