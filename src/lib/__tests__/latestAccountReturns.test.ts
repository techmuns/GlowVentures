import assert from 'node:assert/strict';
import { measuredAccountsReturn, accountReturnInputs } from '../returns';
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
const tile = bookMoneyWeighted(statement, statement, new Date('2026-10-15'));
assert.equal(tile.lastClose, current.lastClose);
assert.equal(tile.measuredValue, current.measuredMV);
assert(Math.abs(tile.result.pct! - current.toDatePct!) < 1e-9);
assert.equal(tile.flows.length, current.parts.reduce((n, p) => n + p.flows.length + 1, 0));

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
console.log(`PASS current corpus returns: ${current.toDatePct?.toFixed(1)}%, through ${current.lastClose}; latest source and named gaps shared across return surfaces`);
