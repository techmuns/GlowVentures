import assert from 'node:assert/strict';
import { capitalIssues } from '../../../shared/capitalValidation.mjs';
import { decimalMinor, sumMoney } from '../../../shared/financialArithmetic.mjs';
import { validateInputChanges, CAPITAL_INPUTS, type InputRecord } from '../tableInputs';
assert.equal(decimalMinor('1.005'), 101n); assert.equal(decimalMinor('-1.005'), -101n);
assert.equal(decimalMinor('1.2e3'), 120000n); assert.equal(sumMoney([.1, .2, -.3]), 0);
const r: InputRecord = { id: 'capital:test', kind: 'capital', label: 'Test', account: 'Test', asOf: '2026-11-01', source: 'source', fields: CAPITAL_INPUTS,
  values: { committed: 100, called: 50, paid: 40, undrawn: 50, pending: 10 }, versions: {}, originalValues: { committed: 100, called: 50, paid: 40, undrawn: 50, pending: 10 } };
const change = (field: string, value: number | null) => ({ id: r.id, field, value, version: '', source: r.source });
assert.match(validateInputChanges([change('called', 10), change('paid', 5000)], [r])!, /exceeds/);
assert.equal(validateInputChanges([change('called', 70), change('paid', 60), change('undrawn', 30)], [r]), null);
assert.match(validateInputChanges([change('called', 70)], [r])!, /still-to-call|unpaid/);
assert.equal(capitalIssues({ committed: 100, called: 100, paid: 105, pending: 0, undrawn: 0 }, { nonCalledPaidIn: 5 }).length, 0);
assert.ok(capitalIssues({ committed: 100, called: 100, paid: 106 }, { nonCalledPaidIn: 5 }).length);
assert.equal(capitalIssues({ committed: null, called: null, paid: 100 }).length, 0, 'missing calls are not invented');
assert.equal(validateInputChanges([{ ...change('called', null), reset: true }], [r]), null, 'restore uses the original value when validating the batch');
console.log('Capital batch identities, exact money and evidenced reinvestment checks passed');
