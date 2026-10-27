import test from 'node:test';
import assert from 'node:assert/strict';
import { rapidProcessor, ReaderVersionChanged } from '../rapid-processor.mjs';
import { CANONICAL_BOOK_KEYS } from '../../../shared/canonicalBookKeys.mjs';
import { makeBatch, withBatch, queuedFiles, waitingStatementFiles } from '../../../shared/statementInbox.mjs';

const id = n => `20261027T10000${n}Z-test`;
const revision = n => String(n).padStart(20, '0');
function harness({ refuseSave = false, decision = 'verified', copyInBatch = false } = {}) {
  const book = Object.fromEntries(CANONICAL_BOOK_KEYS.map(k => [k, []]));
  const initial = { schemaVersion: 1, readerRevision: 'a'.repeat(64), revision: revision(0), book,
    documents: [], manifest: [], records: {}, originals: {}, previews: {}, lookthrough: {} };
  let log = { version: 1, batches: [] }, stored = null, saved = initial, publications = 0, prepared = [];
  const versions = new Map([[initial.revision, initial]]), projections = [];
  for (let n = 1; n <= 2; n++) {
    const batch = makeBatch(id(n), [{ name: `statement${n}.pdf`, size: 12, blob: 'b'.repeat(40) }]);
    batch.files[0].processor = 'rapid'; log = withBatch(log, batch);
    if (copyInBatch && n === 1) batch.files.push({ ...batch.files[0], name: 'copy.pdf' });
  }
  const inbox = { read: async () => ({ log: structuredClone(log) }), commit: async ({ mutate }) => {
    log = mutate(log); return { log, commit: 'c'.repeat(40) };
  } };
  const store = { read: async () => stored ?? { head: null, tree: null, state: null }, load: async () => saved,
    loadVersion: async key => versions.get(key), blob: async () => Buffer.from('%PDF-fixture'),
    publish: async (before, snapshot, receipt) => {
      if (refuseSave) throw Error('Repository unavailable');
      assert.equal(processor.status().revision, saved.revision, 'Candidate is invisible before durable promotion');
      publications++; saved = structuredClone(snapshot); versions.set(saved.revision, saved);
      stored = { head: 'c'.repeat(40), tree: 'd'.repeat(40), state: { revision: saved.revision,
        receipts: { ...(stored?.state.receipts ?? {}), [receipt.id]: receipt } } }; return stored;
    } };
  const model = Object.fromEntries(['deriveTransactions', 'deriveRealisedLots', 'deriveIncome', 'deriveSales', 'buildConsolidatedSheet']
    .map(name => [name, docs => { projections.push({ name, docs: docs.map(d => d.docKey) }); return docs; }]));
  model.deriveStockLedger = (docs, securityKey) => ({ securityKey, txns: docs });
  const processor = rapidProcessor({ store, inbox, initial, references: {}, passwords: [], dashboardPassword: '',
    instantiate: () => model, baseAsset: async () => null,
    prepare: async ({ baseline, files }) => {
      prepared.push(baseline.map(d => d.docKey));
      if (decision !== 'verified') return { decision, duplicates: [], issues: [{ code: 'READ_GAP' }] };
      const doc = { docKey: files[0].name.replace('.pdf', ''), provider: 'Fixture', warnings: [], holdings: [], sourcePages: null };
      return { decision: 'verified', revision: revision(baseline.length + 1), readerRevision: initial.readerRevision,
        book, documents: [...baseline, doc], records: [{ name: files[0].name, manifest: { ...doc, sourcePath: `source/${files[0].name}` },
          files: { 'document.json': doc } }], duplicates: copyInBatch ? [{ document: 'statement1-2', sameAs: doc.docKey, name: 'copy.pdf' }] : [] };
    } });
  return { processor, initial, versions, log: () => log, saved: () => saved, prepared, publications: () => publications, projections };
}

test('a new statement publishes one complete version before Ready; old views stay pinned', async () => {
  const h = harness(); await h.processor.initialize();
  const receipt = await h.processor.submit(id(1));
  assert.equal(receipt.files[0].status, 'landed');
  assert.equal(h.processor.status().revision, revision(1));
  assert.deepEqual((await h.processor.asset(revision(1), 'audit/manifest.json')).map(d => d.docKey), ['statement1']);
  assert.deepEqual(await h.processor.asset(revision(0), 'audit/manifest.json'), []);
  assert.equal(h.publications(), 1);
  for (const name of ['deriveTransactions', 'deriveRealisedLots', 'deriveIncome', 'deriveSales', 'buildConsolidatedSheet']) {
    assert.ok(h.projections.some(p => p.name === name && p.docs.join() === 'statement1'), name);
  }
  assert.equal(queuedFiles(h.log()).length, 0, 'A claimed file cannot also reach the legacy processor');
  assert.equal(waitingStatementFiles(h.log()).length, 0, 'Scheduled legacy recovery cannot steal a rapid claim');
});
test('concurrent uploads serialize against the latest complete version; repeat requests are idempotent', async () => {
  const h = harness(); await h.processor.initialize();
  await Promise.all([h.processor.submit(id(1)), h.processor.submit(id(2))]);
  assert.deepEqual(h.prepared, [[], ['statement1']]);
  assert.equal(h.saved().documents.length, 2);
  await h.processor.submit(id(1)); assert.equal(h.publications(), 2);
});
test('two copies in one new batch share the newly published document and provider', async () => {
  const h = harness({ copyInBatch: true }); await h.processor.initialize();
  const receipt = await h.processor.submit(id(1));
  assert.equal(receipt.files[0].status, 'landed'); assert.equal(receipt.files[1].status, 'duplicate');
  assert.deepEqual(receipt.files[1].docKeys, receipt.files[0].docKeys);
  assert.deepEqual(receipt.files[1].providers, ['Fixture']);
  assert.equal(h.saved().documents.length, 1);
});
test('a repository failure leaves every financial collection on the old version and offers Retry', async () => {
  const h = harness({ refuseSave: true }); await h.processor.initialize();
  await assert.rejects(h.processor.submit(id(1)));
  assert.deepEqual(h.processor.snapshot().book, h.initial.book);
  assert.equal(h.processor.status().revision, revision(0));
  assert.equal(h.log().batches.find(b => b.id === id(1)).files[0].status, 'held');
});
test('a read gap saves its review outcome while preserving all published figures', async () => {
  const h = harness({ decision: 'needs_review' }); await h.processor.initialize();
  const receipt = await h.processor.submit(id(1));
  assert.equal(receipt.files[0].status, 'held');
  assert.deepEqual(h.saved(), h.initial);
});
test('old source facts remain inspectable but newer rules cannot compute an old reader’s reports', async () => {
  const h = harness(); await h.processor.initialize();
  const old = { ...structuredClone(h.initial), revision: revision(9), readerRevision: 'b'.repeat(64) };
  h.versions.set(old.revision, old);
  assert.deepEqual(await h.processor.asset(old.revision, 'canonical/book.json'), h.initial.book);
  await assert.rejects(h.processor.asset(old.revision, 'ledger/transactions.json'), ReaderVersionChanged);
  assert.equal(h.projections.length, 0);
});
