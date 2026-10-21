import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as book from '../../data/glowData';
import manifest from '../../data/readModels.json';
import { applyQuotes, quoteSymbolFor } from '../quotes';
import type { QuoteFeed } from '../quotes';
import { depositoryFundHoldings, unpricedStatementUnits } from '../fundNavs';
import { investedOnOf } from '../investedOn';
const read = (name: string) => JSON.parse(readFileSync(`public/views/${manifest.revision}/${name}`, 'utf8'));
const publication = read('publication.json');
const root = JSON.parse(readFileSync('public/publication.json', 'utf8'));
assert.equal(root.revision, manifest.revision);
assert.equal(root.archiveRevision, publication.archiveRevision);
const canonical = read(publication.canonical);
assert.deepEqual(canonical, JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(book).filter(([name]) => name.startsWith('BOOK_'))))));
const evidence = read(publication.positions);
assert.equal(evidence.length, book.BOOK_POSITIONS.length);
for (const [i, p] of book.BOOK_POSITIONS.entries()) {
  const e = evidence[i];
  assert.equal(e.identity, JSON.stringify([p.accountId, p.memberId ?? null, p.securityKey]));
  if (!p.statementRecord) { assert.ok(p.review, 'Every statement holding has an explicit source record'); continue; }
  assert.equal(e.record.document, p.statementRecord.document);
  assert.equal(e.record.pointer, p.statementRecord.pointer);
  const d = JSON.parse(readFileSync(`public/audit/${e.record.document}/document.json`, 'utf8'));
  const a = book.BOOK_ACCOUNTS.find(a => a.accountId === p.accountId)!;
  assert.equal(d.provider, a.provider); assert.equal(d.accountNo, a.accountNo); assert.equal(d.ownerId, a.ownerId);
  const sourceRow = d.holdings[Number(e.record.pointer.split('/').at(-1))];
  assert.equal(sourceRow.securityKey, p.securityKey); assert.equal(sourceRow.quantity, p.quantity);
  const fieldEvidence = read(`provenance/documents/${e.record.document}.json`);
  assert.equal(fieldEvidence.revision, e.record.revision);
  assert.equal(fieldEvidence.fields[`${e.record.pointer}/quantity`].value, p.quantity);
  assert.equal(fieldEvidence.fields[`${e.record.pointer}/marketValue`].value, sourceRow.marketValue);
}
for (const [account, first] of [['hdfc-mutual-fund-15644806', '2022-08-03'], ['hdfc-mutual-fund-16002141', '2022-08-05']]) {
  const index = book.BOOK_POSITIONS.findIndex(p => p.accountId === account && p.isin === 'INF179K01830');
  assert.ok(index >= 0); assert.equal(evidence[index].investmentDate.value.first, first);
}
for (const holding of book.BOOK_UNVALUED_HOLDINGS) {
  assert.ok(holding.statementRecord, 'Unpriced custody units retain their own statement row');
  const d = read(`canonical/documents/${holding.statementRecord.document}.json`);
  const row = d.holdings[Number(holding.statementRecord.pointer.split('/').at(-1))];
  const account = book.BOOK_ACCOUNTS.find(a => a.accountId === holding.accountId)!;
  assert.equal(d.provider, account.provider); assert.equal(d.accountNo, account.accountNo);
  assert.equal(row.securityKey, holding.securityKey); assert.equal(row.quantity, holding.quantity);
}
const custodyFunds = [...depositoryFundHoldings(), ...unpricedStatementUnits()];
for (const [suffix, first] of [['12539150', '2025-03-06'], ['12838316', '2025-11-06'], ['12838320', '2025-07-11']]) {
  const holding = custodyFunds.find(p => p.accountId.endsWith(suffix) && p.isin === 'INF109KC1RH9');
  assert.ok(holding); assert.equal(investedOnOf([holding])?.first, first);
  const movement = book.BOOK_SHARE_MOVEMENTS[`${holding.accountId}|${holding.securityKey}`];
  if (movement) {
    assert.equal(holding.depositoryUnits?.source, movement.source);
    assert.equal(holding.quantity, movement.closing);
  } else {
    const raw = book.BOOK_UNVALUED_HOLDINGS.find(p => p.accountId === holding.accountId && p.isin === holding.isin);
    assert.ok(raw); assert.deepEqual(holding.statementRecord, raw.statementRecord);
    assert.equal(holding.quantity, raw.quantity);
  }
  assert.equal(holding.recoveredCost?.accountId, holding.accountId);
  assert.equal(holding.recoveredCost?.isin, holding.isin);
  assert.equal(holding.priceEvidence?.instrument, holding.isin);
}
const p = book.BOOK_POSITIONS.find(p => p.quantity != null && p.currentPrice && quoteSymbolFor(p) && !p.review && p.assetClass === 'Equity')!;
const symbol = quoteSymbolFor(p)!;
const feed = { asOf: '2026-10-21T10:00:00Z', quotes: { [symbol]: { price: p.currentPrice! * 1.01, prevClose: p.currentPrice!, source: 'upstox', ageS: 0,
  tradedAt: '2026-10-21T09:59:00Z', observedAt: '2026-10-21T10:00:00Z' } }, missing: [], pending: [], fresh: 1, stale: 0 } as unknown as QuoteFeed;
const live = applyQuotes([p], feed)[0];
assert.deepEqual(live.statementRecord, p.statementRecord);
assert.equal(live.priceEvidence?.source, 'upstox'); assert.equal(live.priceEvidence?.instrument, symbol);
assert.equal(live.priceEvidence?.effectiveAt, '2026-10-21T09:59:00Z');
assert.equal(p.priceEvidence, undefined, 'The original statement remains unchanged');
console.log('PASS published canonical book and every statement source row share one revision; live prices retain separate identity/time');
