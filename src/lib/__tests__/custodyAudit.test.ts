import assert from 'node:assert/strict';
import { custodyAuditRows } from '../custodyAudit';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, BOOK_SHARE_MOVEMENTS, BOOK_RECOVERED_COSTS, BOOK_POLYCAB } from '../../data/glowData';
const input = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, unvalued: BOOK_UNVALUED_HOLDINGS,
  movements: BOOK_SHARE_MOVEMENTS, recoveredCosts: BOOK_RECOVERED_COSTS, BOOK_POLYCAB };
const rows = custodyAuditRows(input);
for (const [suffix, first, last] of [['12539150', '2025-03-06', '2026-03-23'], ['12838316', '2025-11-06', '2025-11-06'], ['12838320', '2025-07-11', '2025-07-11']]) {
  const p = rows.find(p => p.accountId.endsWith(suffix) && p.isin === 'INF109KC1RH9'); assert.ok(p);
  assert.equal(p.cost?.heldPurchases?.first, first); assert.equal(p.cost?.heldPurchases?.last, last);
  assert.equal(p.cost?.quantity, p.quantity); assert.equal(p.cost?.asOf, p.asOf); assert.ok(p.source);
  assert.ok(!('marketValue' in p) && !('currentPrice' in p), 'Retaining custody facts cannot invent a valuation');
}
const row = rows.find(p => p.accountId.endsWith('12838316') && p.isin === 'INF109KC1RH9')!;
const raw = input.unvalued.find(p => p.accountId === row.accountId && p.isin === row.isin)!;
const changed = (patch: Partial<typeof raw>) => custodyAuditRows({ ...input, unvalued: [{ ...raw, ...patch }], movements: {} })[0];
assert.equal(changed({ quantity: raw.quantity! + 1 }).cost, undefined, 'Another quantity cannot borrow these purchase dates');
assert.equal(changed({ isin: 'different-instrument' }).cost, undefined, 'Another ISIN cannot borrow these purchase dates');
assert.equal(changed({ asOf: '2026-08-31' }).cost, undefined, 'A later balance needs its own reconciliation');
assert.throws(() => changed({ ownerId: 'wrong-owner' }), /canonical account/);
assert.equal(custodyAuditRows({ ...input, unvalued: [raw], movements: {}, positions: [{ accountId: raw.accountId, securityKey: raw.securityKey }] }).length, 0);
assert.equal(custodyAuditRows({ ...input, accounts: [], unvalued: [raw], movements: {} }).length, 0);
assert.equal(custodyAuditRows({ ...input, unvalued: [raw], movements: {}, excludedSecurities: new Set([raw.securityKey]) }).length, 0);
const movement = Object.values(input.movements).find(w => w.accountId.endsWith('12539150') && w.isin === 'INF109KC1RH9')!;
assert.equal(custodyAuditRows({ ...input, unvalued: [], movements: { one: { ...movement, reason: 'Unreconciled test block' } } }).length, 0);
assert.equal(custodyAuditRows({ ...input, unvalued: [], movements: { one: { ...movement, closing: 0 } } }).length, 0);
console.log('PASS audit custody rows: all three exact MF dates, source accounts, snapshot/unit guards and no invented valuations');
