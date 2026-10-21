import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as expected from './archiveLedger';
import manifest from '../../data/readModels.json';
import { BOOK_CAPITAL_GAINS, BOOK_POSITIONS } from '../../data/glowData';
let calls = 0, offline = false;
globalThis.fetch = async (url) => {
  calls++;
  assert.match(String(url), new RegExp(`/views/${manifest.revision}/ledger/`), 'browser never reads raw statements');
  if (offline) throw new Error('offline');
  return Response.json(JSON.parse(readFileSync(`public${url}`, 'utf8')));
};
const wire = (value: unknown) => JSON.parse(JSON.stringify(value));
const L = await import('../ledger');
const [one, same] = await Promise.all([L.loadTransactions(), L.loadTransactions()]);
assert.equal(calls, 1, 'concurrent cards share one read');
assert.equal(one, same);
assert.deepEqual(one, wire(await expected.loadTransactions()));
const lots = await L.loadRealisedLots();
assert.deepEqual(lots, wire(await expected.loadRealisedLots()));
assert.equal(Math.round(lots!.lots.reduce((s, l) => s + l.gain, 0) * 100),
  Math.round(BOOK_CAPITAL_GAINS.reduce((s, r) => s + (r.realisedST ?? 0) + (r.realisedLT ?? 0), 0) * 100), 'compiled result reconciles independently to the book');
assert.deepEqual(await L.loadSales(), wire(await expected.loadSales()));
offline = true;
assert.equal(await L.loadIncome(), null);
offline = false;
assert.deepEqual(await L.loadIncome(), wire(await expected.loadIncome()), 'failed reads can recover on a later visit');
for (const key of new Set(BOOK_POSITIONS.map(p => p.securityKey))) assert.deepEqual(await L.loadStockLedger(key), wire(await expected.loadStockLedger(key)));
for (const key of new Set((await expected.loadArchive()).flatMap(d => (d.income ?? []).map(r => r.securityKey)))) {
  assert.ok(manifest.stockKeys.includes(key), 'income-only links have prepared views');
  assert.deepEqual(await L.loadStockLedger(key), wire(await expected.loadStockLedger(key)));
}
const beforeEmpty = calls;
offline = true;
assert.deepEqual(await L.loadStockLedger('fund-only-regression-company'), wire(await expected.loadStockLedger('fund-only-regression-company')));
assert.equal(calls, beforeEmpty, 'the complete build manifest proves an absent key has no ledger; no missing-file request');
offline = false;
assert.equal(await L.loadStockLedger('../private'), null);
console.log('PASS prepared ledger views equal canonical source derivations and book totals; deduped reads, failure recovery and exact per-stock views');
