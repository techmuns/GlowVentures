import assert from 'node:assert/strict';
import { FUND_UNIT_ACTIONS, fundUnitBasis, acquisitionIdentity } from '../../../shared/fundUnitActions.mjs';
import { recoveredCostFor } from '../../../shared/recoveredCosts.mjs';
import { BOOK_ACCOUNTS, BOOK_UNVALUED_HOLDINGS, BOOK_POSITIONS, BOOK_RECOVERED_COSTS } from '../../data/glowData';
import { BOOK_FUND_NAVS } from '../../data/fundNavs';
import { unpricedStatementUnits, applyFundNavs } from '../fundNavs';
import { recordedLines, recordedFor, recordedInvestmentDateOf } from '../recordedHoldings';
import { investedOnOf } from '../investedOn';
import { holdingSourceTrace } from '../sourceTrace';
import { unvaluedStatementLinesOf } from '../accounts';

const near = (a: number | null | undefined, b: number) => assert.ok(typeof a === 'number' && Math.abs(a-b) < .01, `${a} != ${b}`);
const oldGold = 'INF740KA1SW3', newGold = 'INF740KA1ZP2';
const before = fundUnitBasis(oldGold, '2026-07-31', '2026-08-27');
assert.equal(before.isin, oldGold); assert.equal(before.factor, 1);
const after = fundUnitBasis(oldGold, '2026-07-31', '2026-08-28');
assert.equal(after.isin, newGold); assert.equal(after.factor, 10);
assert.ok(fundUnitBasis(oldGold, '2026-08-28', '2026-10-23').reason, 'a retired ISIN after ex-date needs reconciliation');
assert.equal(fundUnitBasis(newGold, '2026-08-28', '2026-10-23').factor, 1, 'a new statement is never split twice');
assert.ok(fundUnitBasis(oldGold, null, '2026-10-23').reason);
assert.ok(fundUnitBasis(oldGold, '2026-10-23', '2026-07-31').reason);
assert.ok(fundUnitBasis(oldGold, '2026-07-31', '2026-10-23', [...FUND_UNIT_ACTIONS, FUND_UNIT_ACTIONS[0]]).reason);
const chain = [...FUND_UNIT_ACTIONS, {oldIsin:newGold,newIsin:'INF000000001',exDate:'2026-09-01',factor:2,sources:['test']}];
assert.equal(fundUnitBasis(oldGold, '2026-07-31', '2026-10-23', chain).factor, 20);

const live = unpricedStatementUnits();
const cases = [
  ['12838316', oldGold, newGold, 2050000, 30193698.9, '2026-01-22', '2026-01-22'],
  ['12838335', oldGold, newGold, 11950000, 203682805.64, '2026-01-29', '2026-01-30'],
  ['12838316', 'INF740KA1RE3', 'INF740KA1ZQ0', 1230000, 17222067.17, '2025-09-30', '2025-09-30'],
] as const;
for (const [suffix, oldIsin, newIsin, quantity, cost, first, last] of cases) {
  const p = live.find(p => p.accountId.endsWith(suffix) && p.isin === newIsin)!;
  assert.ok(p, `${suffix}/${oldIsin}: the documented converted holding reaches the live portfolio`);
  assert.equal(p.quantity, quantity);
  const nav = BOOK_FUND_NAVS.find(n => n.isin === oldIsin)!;
  assert.equal(nav.pricingIsin, newIsin); assert.ok(nav.usableForValue);
  near(p.marketValue, quantity * nav.nav); near(p.costBasis, cost); near(p.avgCost, cost / quantity);
  assert.equal(p.priceEvidence?.instrument, newIsin);
  assert.equal(investedOnOf([p])?.first, first); assert.equal(investedOnOf([p])?.last, last);
  const original = acquisitionIdentity(p);
  assert.equal(original.isin, oldIsin); assert.equal(original.quantity, quantity / 10);
  const again = applyFundNavs(applyFundNavs([p]))[0];
  assert.equal(again.quantity, quantity); near(again.marketValue, p.marketValue); near(again.avgCost, cost / quantity);
  assert.equal(recoveredCostFor({...p,quantity:quantity+1}, BOOK_RECOVERED_COSTS), undefined, 'an edited count loses the original lot match');
  assert.equal(investedOnOf([{...p,quantity:quantity+1}]), null);
  const trace = holdingSourceTrace([p], 'quantity');
  assert.equal(trace.sources[0].value, quantity / 10, 'the original statement link searches for its printed quantity');
  assert.equal(trace.sources[0].isin, oldIsin); assert.ok(trace.notes.some(n=>n.includes('multiply')));
  assert.equal(recordedFor(p.securityKey, live).length, 0, 'the old identity is not counted again as unvalued');
}

// This would have caught the original omission even though NAV publication
// and every source statement individually passed their existing checks.
for (const u of BOOK_UNVALUED_HOLDINGS.filter(u => u.assetClass === 'ETF' && !u.sameUnitsReportedBy))
  assert.ok(live.some(p => p.accountId === u.accountId && p.securityKey === u.securityKey), `${u.security}: held ETFs must have an explicit valuation path`);

// Price availability cannot erase acquisition evidence. Exercise the held
// inventory without any live position, as during a source outage.
const recorded = recordedLines().filter(l => l.homeKey === 'dsp-gold-etf');
assert.equal(recorded.length, 2); near(recorded.reduce((n,l)=>n+l.costBasis!,0),233876504.54);
assert.equal(recordedInvestmentDateOf(recorded)?.first,'2026-01-22');
assert.equal(recordedInvestmentDateOf(recorded)?.last,'2026-01-30');
assert.equal(recordedInvestmentDateOf(recorded)?.payments,3);
assert.ok(recorded.every(l=>l.recoveredCost?.evidence.length));
for (const owner of ['Ankita Jaisinghani', 'Aarti Jaisinghani']) {
  const lines = unvaluedStatementLinesOf(owner, BOOK_ACCOUNTS, [...BOOK_POSITIONS,...live], BOOK_UNVALUED_HOLDINGS);
  assert.ok(lines.flatMap(a=>a.lines).filter(l=>l.row.securityKey==='dsp-gold-etf').every(l=>l.valuedLive), 'account audit agrees with the live converted identity');
}
console.log('ETF continuity: dates, conversion terms, exact source lots, current NAV, source links and outage inventory passed');
