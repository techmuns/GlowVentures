#!/usr/bin/env node
// Verify the actual prepared publication, not a second financial derivation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const manifest = JSON.parse(fs.readFileSync('src/data/readModels.json', 'utf8'));
const root = `public/views/${manifest.revision}`;
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const f = read('financial/integrity.json'), book = read('canonical/book.json'), publication = read('publication.json');
assert.equal(f.readerRevision, publication.readerRevision);
assert.equal(f.bookRevision, publication.bookRevision);
assert.equal(f.summary.positions, book.BOOK_POSITIONS.length);
assert.equal(f.mode, 'advisory');
assert.deepEqual(f.blockingIssues, []);
assert.equal(new Set(f.graph.nodes.map(n => n.id)).size, f.graph.nodes.length);
assert.equal(new Set(f.events.map(n => n.id)).size, f.events.length);
for (const event of f.events) {
  assert.equal(event.postings.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n), 0n, `Unbalanced event ${event.id}`);
  if (event.status === 'supporting-evidence') assert.equal(event.postings.length, 0);
  if (event.kind === 'income') assert.equal(event.cashAmountMinor, null, 'Gross income is not silently treated as settled cash');
}
for (const metric of f.metrics) {
  if (['missing', 'at-cost', 'disputed', 'partial', 'mixed-basis'].includes(metric.status)) assert.equal(metric.usableValue, null, metric.id);
  if (metric.unit === 'money') assert.equal(metric.currency, 'INR');
  if (metric.value != null) assert.ok(Number.isFinite(metric.value), metric.id);
}
for (const check of f.checks.filter(c => c.status === 'disputed' && ['cost-lots', 'unit-lots'].includes(c.kind))) {
  const name = check.kind === 'cost-lots' ? 'costBasis' : 'quantity';
  assert.equal(f.metrics.find(m => m.positionId === check.positionId && m.metric === name)?.status, 'disputed');
}
for (const point of book.BOOK_NAV_HISTORY) {
  assert.ok(['modified-dietz', 'end-dated-approximation', 'unproven'].includes(point.returnMethod));
  if (point.flowTimingKnown) assert.ok(Number.isFinite(point.flowWeighted));
  else assert.equal(point.flowWeighted, null, 'Undated money has no invented day weight');
}
const sources = publication.statementDocuments.map(d => read(d.evidence));
const summary = { revision: manifest.revision, readerRevision: f.readerRevision, bookRevision: f.bookRevision, ...f.summary,
  auditStatus: f.auditStatus, advisoryIssues: f.issues,
  nodes: f.graph.nodes.length, events: f.events.length, disputedChecks: f.checks.filter(c => c.status === 'disputed'),
  documents: sources.length, documentsWithRawChecksums: sources.filter(s => s.source.sha256).length };
fs.mkdirSync('.cache/backend-integrity', { recursive: true });
fs.writeFileSync('.cache/backend-integrity/publication-check.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
