import assert from 'node:assert/strict';
import { buildAccountReturnRecords, registerWindow, bankWindow, coveringRegister } from '../../lib/accountReturnRecords.mjs';

const row = (date, amount, balance, description = 'Corpus deposit') => ({ date, amount, balance, description, kind: 'capital-register' });
const register = { docKey: 'register', status: 'ok', reportType: 'capital-register', asOf: '2026-05-31', cashFlows: [
  row('2026-04-01', 0, 100, 'Opening balance'), row('2026-04-10', 50, 150), row('2026-05-10', -10, 140, 'Withdrawal'),
] };
const closing = { docKey: 'closing-may', status: 'ok', reportType: 'fact-sheet', asOf: '2026-05-31', flows: {
  periodFrom: '2026-04-01', periodTo: '2026-05-31', corpus: 183, contribution: 50, withdrawal: 10,
} };
const account = { accountId: 'one', accountNo: '1', provider: 'Manager', asOf: '2026-04-30' };
const flows = { one: [{ date: '2026-04-01', amount: -100, description: 'Opening portfolio value' },
  { date: '2026-04-10', amount: -50, description: 'Corpus deposit' }] };
const build = (docs, accounts = [account], input = flows) => buildAccountReturnRecords({ accounts, accountCashFlows: input,
  byAccount: new Map([['Manager::1', docs]]) });

let result = build([register, closing]).one;
assert.equal(result.record.asOf, '2026-05-31');
assert.equal(result.record.value, 183);
assert.equal(result.record.flows.length, 3);
assert.equal(result.record.flows.at(-1).amount, 10);
assert.equal(result.gap, null);
assert.equal(account.asOf, '2026-04-30', 'a return endpoint must not red-date holdings');
assert.deepEqual(build([register, closing]), build([closing, register]), 'source discovery order cannot change the return');
assert.equal(build([register, closing], [{...account,asOf:'2025-12-31'}]).one.record.asOf,'2026-05-31',
  'the current financial year comes from the valuation, independently of stale holdings');

const june = { ...closing, docKey: 'closing-june', asOf: '2026-06-30', flows: { ...closing.flows, periodTo: '2026-06-30', corpus: 200 } };
result = build([june, register, closing]).one;
assert.equal(result.latestValuationDate, '2026-06-30');
assert.equal(result.record.asOf, '2026-05-31', 'retain the last verified endpoint during a later coverage gap');
assert.match(result.gap, /ends 2026-05-31/);

const extended = { ...register, docKey: 'register-june', asOf: '2026-06-30' };
result = build([june, extended, closing]).one;
assert.equal(result.record.asOf, '2026-06-30', 'a complete newer statement advances automatically');
assert.equal(result.gap, null);

const tampered = structuredClone(register); tampered.cashFlows[1].amount = 60;
assert.equal(registerWindow(tampered), null, 'every printed running balance is checked');
const cancelledError = structuredClone(register); cancelledError.cashFlows[1].amount += 5; cancelledError.cashFlows[2].amount -= 5;
assert.equal(registerWindow(cancelledError), null, 'offsetting errors cannot pass the closing-only reconciliation');
assert.equal(build([tampered, closing]).one.record, null);
const noDates = structuredClone(register); noDates.cashFlows[1].date = null;
assert.equal(registerWindow(noDates), null);
const switchRow = structuredClone(register); switchRow.cashFlows[1].description = 'Security in';
assert.equal(registerWindow(switchRow), null, 'class switches cannot become external capital');

const wrongCapital = structuredClone(closing); wrongCapital.flows.withdrawal = 20;
assert.equal(build([register, wrongCapital]).one.record, null, 'the closing statement independently witnesses capital');
const oldConflict = structuredClone(flows); oldConflict.one[1].amount = -40;
assert.equal(build([register, closing], [account], oldConflict).one.record, null, 'older captured flows cannot silently disappear');
assert.equal(build([register, closing], [account], {}).one.record, null, 'missing opening value is never zero');
assert.equal(build([register, closing], [{ ...account, accountNo: '2' }]).one.record, null, 'never match across accounts');

const fromNil = { ...register, cashFlows: [row('2026-01-01', 100, 100), row('2026-04-10', 50, 150), row('2026-05-10', -10, 140)] };
assert.equal(registerWindow(fromNil).opening, 0, 'a witnessed first deposit proves inception from nil');

const first = registerWindow(register);
const second = registerWindow({ ...extended, cashFlows: [row('2026-06-01', 0, 140, 'Opening balance'), row('2026-06-10', 20, 160)] });
assert.equal(coveringRegister([first, second], '2026-04-01', '2026-06-30').end, '2026-06-30');
const gap = { ...second, start: '2026-06-02' };
assert.equal(coveringRegister([first, gap], '2026-04-01', '2026-06-30'), null, 'a missing calendar interval is not assumed empty');
const wrongOpening = { ...second, opening: 145 };
assert.equal(coveringRegister([first, wrongOpening], '2026-04-01', '2026-06-30'), null);

const overlap = registerWindow({ ...extended, cashFlows: [row('2026-05-01', 0, 150, 'Opening balance'), row('2026-05-10', -10, 140), row('2026-06-10', 20, 160)] });
assert.equal(coveringRegister([first, overlap], '2026-04-01', '2026-06-30').moves.length, 3, 'overlapping records count each flow once');
assert.equal(coveringRegister([first, { ...overlap, moves: [] }], '2026-04-01', '2026-06-30'), null);

const closeDay = { ...extended, cashFlows: [...register.cashFlows, row('2026-06-30', -3, 137, 'TDS')] };
result = build([closeDay, june]).one;
assert.equal(result.record.flows.at(-1).date, '2026-05-10', 'an exact same-day capital witness determines pre-posting valuation timing');
const impossible = { ...june, flows: { ...june.flows, withdrawal: 11.5 } };
assert.equal(build([closeDay, impossible]).one.record, null, 'never remove arbitrary earlier rows to make totals fit');

const advanced = { ...account, asOf: '2026-06-30' };
const allFlows = { one: [...flows.one, { date: '2026-05-10', amount: 10, description: 'Withdrawal' }] };
assert.equal(build([june, register, closing], [advanced], allFlows).one.record.asOf, '2026-05-31',
  'newer holdings cannot replace an older verified return with an unsupported later endpoint');
const bank = { ...register, reportType: 'bank-book', cashFlows: register.cashFlows.map(r => ({ ...r,
  kind: 'bank-book', depositWithdrawal: r.amount, buySellAmount: 0, income: 0, expenses: 0 })) };
assert.equal(bankWindow(bank).moves.length, 2);
const brokenBank = structuredClone(bank); brokenBank.cashFlows[1].expenses = 5;
assert.equal(bankWindow(brokenBank), null, 'bank trades, income and expenses must reconcile too');
assert.equal(build([bank, closing]).one.record.asOf, '2026-05-31');
const futureWindow = { ...closing, flows: { ...closing.flows, periodFrom: '2026-06-01', netCapitalInOut: 0 } };
assert.equal(build([register, futureWindow]).one.record, null, 'a future capital window cannot witness an earlier valuation');

console.log('PASS latest return records: complete windows, latest selection, missing/invalid sources, overlap, same-day posting and unchanged holdings');
