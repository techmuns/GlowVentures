import assert from 'node:assert/strict';
import { measuredAccountsReturn, accountReturnInputs, entityYtdPct } from '../returns';
import { bookMoneyWeighted } from '../drilldown';
import { investorPeriodReturn } from '../investorSummary';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_RETURN_RECORDS } from '../../data/glowData';
import type { Portfolio } from '../types';

const empty = { peFunds: [], preIpoFunds: [], unlistedCompanies: [], debtFunds: [], closedFunds: [], startups: [] };
const statement = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS,
  accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS, accountReturnRecords: BOOK_ACCOUNT_RETURN_RECORDS,
  privateMarkets: empty } as unknown as Portfolio;
const before = measuredAccountsReturn({ ...statement, accountReturnRecords: undefined }, statement.accounts);
const current = measuredAccountsReturn(statement, statement.accounts);
assert(current.lastClose! >= '2026-10-07');
assert(current.parts.length > before.parts.length, 'unit-ledger openings add previously excluded accounts');
assert.equal(current.windowStart, '2026-04-01');
assert.equal(current.windowDays, Math.round((Date.parse(current.lastClose!) - Date.parse(current.windowStart!)) / 86400000));
const id = 'green-lantern-capital-llp-510861';
const part = current.parts.find(p => p.accountId === id)!;
assert.equal(part.terminalValue, 116019848);
assert.equal(part.asOf.toISOString().slice(0, 10), '2026-09-22');
assert(part.flows.some(f => f.date.toISOString().slice(0, 10) === '2026-09-17'));
assert(current.gaps.some(g => g.accountId === id && g.asOf === '2026-10-06' && /2026-09-22/.test(g.reason)));
// Stage 10fc — NEVER A PARTIAL POOL. Accounts holding value without a verified
// record leave the book's rate absent, named; those with nothing of their own to
// measure are outside it, not gaps in it.
assert.equal(current.whole, false);
assert.equal(current.annPct, null);
assert.equal(current.toDatePct, null);
assert(current.reason && /no whole return/.test(current.reason));
for (const no of ['9039671821', '103473', '49794950']) assert(current.missing.some(m => m.accountNo === no), `${no} holds value without a verified record`);
for (const no of ['3041491081', '67786137', '1000632']) assert(current.outside.some(m => m.accountNo === no), `${no} has nothing of its own to measure`);
assert(!current.missing.some(m => current.parts.some(p => p.accountId === m.accountId)));
assert.equal(current.parts.length + current.missing.length + current.outside.length, statement.accounts.length, 'every account is accounted for once');
const blocked = bookMoneyWeighted(statement, statement, new Date('2026-10-15'));
assert.equal(blocked.result.pct, null);
assert.equal(blocked.flows.length, 0, 'no rate, no partial inputs');
assert.equal(blocked.bookAccounts, current.parts.length + current.missing.length);
assert.equal(blocked.reason, current.reason);
// Over the accounts that ARE wholly measured, the tile and the pool agree.
const recorded = { ...statement, accounts: statement.accounts.filter(a => current.parts.some(p => p.accountId === a.accountId)) };
const pooled = measuredAccountsReturn(recorded, recorded.accounts);
assert.equal(pooled.whole, true);
const tile = bookMoneyWeighted(recorded, recorded, new Date('2026-10-15'));
assert.equal(tile.lastClose, current.lastClose);
assert.equal(tile.measuredValue, current.measuredMV);
assert(Math.abs(tile.result.pct! - pooled.toDatePct!) < 1e-9);
assert.equal(tile.flows.length, pooled.parts.reduce((n, p) => n + p.flows.length + 1, 0));
// Stage 10fz: a fund-of-funds line carries no valuation date and runs since
// inception, so it is named and never pooled into the FY-window accounts' rate —
// nor dated at the page's clock.
{
  const withFund = { ...recorded, privateMarkets: { ...empty, peFunds: [{ name: 'Constructed fund', firstInvest: '2023-01-01', committed: 100, drawn: 100, distributed: 0, currentValue: 150, tvpi: null, dpi: null }] } } as unknown as Portfolio;
  const t2 = bookMoneyWeighted(withFund, recorded, new Date('2026-10-15'));
  assert.equal(t2.flows.length, tile.flows.length, 'a private leg is not pooled into the accounts window');
  assert(Math.abs(t2.result.pct! - tile.result.pct!) < 1e-12);
  assert.deepEqual(t2.privateExcluded.map(x => x.name), ['Constructed fund']);
  assert.deepEqual(tile.privateExcluded, []);
}

// Whole-portfolio FYTD still requires all accounts and one closing date.
assert.equal(investorPeriodReturn(statement, new Date(2026, 9, 15), 'fytd').pct, null);
const one = { ...statement, accounts: statement.accounts.filter(a => a.accountId === id), positions: statement.positions.filter(p => p.accountId === id) };
const fytd = investorPeriodReturn(one, new Date(2026, 9, 15), 'fytd');
assert.equal(fytd.end, '2026-09-22');
assert.equal(fytd.reason, null);
assert(Math.abs(fytd.pct! - measuredAccountsReturn(one, one.accounts).toDatePct!) < 1e-9);
assert.equal(accountReturnInputs(statement, one.accounts[0]).source, BOOK_ACCOUNT_RETURN_RECORDS[id].record!.source);
const laterHoldings = { ...one.accounts[0], asOf: '2026-10-06' };
assert.equal(accountReturnInputs(statement, laterHoldings).asOf, '2026-09-22', 'a later holdings date cannot invalidate the last verified return');
const missingRecord = { ...one, accountReturnRecords: { [id]: { ...BOOK_ACCOUNT_RETURN_RECORDS[id], record: null } } };
assert.equal(measuredAccountsReturn(missingRecord, missingRecord.accounts).parts.length, 0, 'an explicitly unverified endpoint cannot fall back to incomplete flows');
const carnelian = current.parts.find(p => p.accountNo === '3517383')!;
assert.equal(carnelian.asOf.toISOString().slice(0, 10), '2026-10-07', 'newly retrieved reconciled capital advances the closing');
for (const no of ['3000048','10355977','36378950','36379637','3041491145','90414963315','15644806','15725046','16002141','7125255']) {
  assert(current.parts.some(p => p.accountNo === no), `recovered verified inputs include ${no}`);
}
assert.equal(current.parts.find(p => p.accountNo === '3000048')!.terminalValue,0);
assert.equal(current.parts.find(p => p.accountNo === '36378950')!.asOf.toISOString().slice(0,10),'2026-10-01','NAV date, not statement print date');
const redeemed = { ...one, accountReturnRecords: { [id]: { latestValuationDate: '2026-09-22', gap: null, record: {
  ...BOOK_ACCOUNT_RETURN_RECORDS[id].record!, value: 0, flows: [
    { date: '2026-04-01', amount: -100, description: 'Opening portfolio value' },
    { date: '2026-09-22', amount: 110, description: 'Redemption' },
  ],
} } } };
const redeemedReturn = measuredAccountsReturn(redeemed, redeemed.accounts);
assert.equal(redeemedReturn.parts.length, 1);
assert(Math.abs(redeemedReturn.toDatePct! - 10) < 1e-7, 'a verified closing zero still includes redemption proceeds');
assert.equal(bookMoneyWeighted(redeemed, redeemed, new Date('2026-10-15')).result.pct, redeemedReturn.toDatePct);

// D9 (Stage 10fz): an entity's FYTD return is struck on ISO dates (a 1 Apr
// opening NAV is kept in any time zone), closes on its own latest STATEMENT
// NAV — never the live value the caller passes — and weights each dated flow
// for the days it was invested (Modified Dietz).
{
  const ent = { asOf: '2026-10-07',
    entityNavHistory: { E: [{ period: 'o', date: '2026-04-01', nav: 100 }, { period: 'c', date: '2026-09-30', nav: 160 }] },
    entityCashFlows: { E: [{ date: '2026-07-01', amount: -50, description: 'Contribution' }] } } as unknown as Portfolio;
  const span = 182, held = 91;
  const want = (160 - 100 - 50) / (100 + 50 * held / span) * 100;
  assert.ok(Math.abs(entityYtdPct(ent, 'E', 999)! - want) < 1e-9, `${entityYtdPct(ent, 'E', 999)} vs ${want}`);
  assert.equal(entityYtdPct(ent, 'E', 999), entityYtdPct(ent, 'E', 1), 'the live value passed in is not read');
  assert.equal(entityYtdPct({ ...ent, entityNavHistory: {} } as unknown as Portfolio, 'E', 1), null);
}
console.log('PASS entity FYTD: ISO dates, statement close, Modified Dietz');
console.log(`PASS ${current.parts.length} verified accounts (${pooled.toDatePct?.toFixed(1)}% over them alone), ${current.missing.length} holding value without a record, ${current.outside.length} with nothing to measure; the book's rate is absent until every account is measured`);
