import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { prepareRapidStatement } from './rapid-core.mjs';
import { applyUpdates, isBatchId, extOf } from '../../shared/statementInbox.mjs';
import { digest, documentEvidence, positionEvidenceReader } from './lib/publication.mjs';
import { unlockPdf, previewKey } from '../lib/statementPreviewPdf.mjs';
import { describePreview, previewKeyBytes, sealPreview } from '../../shared/statementPreviewCrypto.mjs';
import { VersionConflict } from './runtime-store.mjs';
import { migrateRapidPublication } from './migrate-rapid-publication.mjs';
import { immutable } from './lib/immutable.mjs';
export class ReaderVersionChanged extends Error {}

export function rapidProcessor({ store, inbox, initial, references, instantiate, passwords, dashboardPassword, baseAsset, prepare = prepareRapidStatement, seed = false, processorName = 'rapid', recover = true, dispatchFallback = true }) {
  let current = initial, state = null, queue = Promise.resolve(), ready = false;
  const versions = new Map(), models = new Map(), jobs = new Map(), evidenceReaders = new WeakMap();
  const evidenceFor = snap => {
    if (!evidenceReaders.has(snap)) evidenceReaders.set(snap, positionEvidenceReader(snap.documents, snap.book.BOOK_ACCOUNTS));
    return evidenceReaders.get(snap);
  };
  const remember = snapshot => {
    immutable(snapshot);
    versions.set(snapshot.revision, snapshot);
    while (versions.size > 2) { const oldest = versions.keys().next().value; versions.delete(oldest); models.delete(oldest); }
    return snapshot;
  };
  const modelFor = snapshot => {
    if (snapshot.readerRevision !== initial.readerRevision) throw new ReaderVersionChanged('Reload before requesting projections from a newer reader');
    let value = models.get(snapshot.revision);
    if (!value) { value = instantiate(snapshot.book); models.set(snapshot.revision, value); }
    return value;
  };
  async function initialize() {
    state = await store.read();
    if (state.state) {
      current = await store.load(state.state);
      remember(current);
      if (current.readerRevision !== initial.readerRevision || current.baseCommit !== initial.baseCommit) {
        const migrated = migrateRapidPublication(current, initial, references, instantiate);
        state = await store.publish(state, migrated, { id: `baseline-${initial.baseCommit}`, files: [], completedAt: new Date().toISOString() });
        current = migrated;
      }
    } else if (seed) {
      state = await store.publish(state, initial, { id: `baseline-${initial.baseCommit}`, files: [], completedAt: new Date().toISOString() });
    }
    remember(current); modelFor(current); ready = true;
    if (seed && recover) {
      const { log } = await inbox.read();
      for (const batch of log.batches) if (batch.files.some(f => f.processor === processorName && ['queued', 'processing'].includes(f.status))) {
        void submit(batch.id).catch(() => {}); // durable inbox recovery after a compute restart
      }
    }
  }
  async function version(revision) {
    return versions.get(revision) ?? remember(await store.loadVersion(revision));
  }
  async function processBatch(id) {
    if (!ready) throw Error('Statement processor is not ready');
    const started = performance.now();
    // The repository is authoritative after a crash, never the resident cache.
    state = await store.read();
    if (state.state?.revision !== current.revision && state.state) {
      const next = await store.load(state.state);
      if (next.readerRevision !== initial.readerRevision) throw new ReaderVersionChanged('A newer reader must handle this publication');
      current = next;
    }
    if (state.state?.receipts?.[id]?.files.every(f => ['landed', 'duplicate'].includes(f.status))) {
      const receipt = state.state.receipts[id];
      await inbox.commit({ message: `Statements ${id}: restore completed status`, mutate: log => applyUpdates(log,
        receipt.files.map(f => ({ ...f, batch: id }))) });
      return receipt;
    }
    const { log } = await inbox.read();
    const batch = log.batches.find(b => b.id === id);
    const pending = batch?.files.filter(f => f.processor === processorName && ['queued', 'processing'].includes(f.status)) ?? [];
    if (!pending.length) return null;
    const fullReader = async () => {
      await inbox.commit({ message: `Statements ${id}: full reader`, mutate: log => applyUpdates(log,
        pending.map(f => ({ batch: id, name: f.name, processor: null, status: 'queued', hold: null, reason: null }))) });
      if (dispatchFallback) await inbox.dispatch({ batch: id });
      return { id, files: pending.map(f => ({ name: f.name, status: 'queued' })) };
    };
    // Bound resident file memory. Larger folders, ZIPs and scans continue
    // automatically through the existing complete reader, with their history.
    if (pending.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024 || pending.some(f => extOf(f.name) === 'zip')) return fullReader();
    await inbox.commit({ message: `Reading statements ${id}`, mutate: log => applyUpdates(log,
      pending.map(f => ({ batch: id, name: f.name, status: 'processing' }))) });
    const files = []; let actualBytes = 0;
    for (const file of pending) {
      const bytes = await store.blob(file.blob); actualBytes += bytes.length;
      if (actualBytes > 50 * 1024 * 1024) return fullReader();
      files.push({ ...file, bytes, size: bytes.length });
    }
    let candidate = await prepare({ baseline: current.documents, files, references, passwords,
      sourcePrefix: `source/uploads-rapid-${id}`, readerRevision: initial.readerRevision });
    if (candidate.decision === 'slow_path') return fullReader();
    const verified = candidate.decision === 'verified', duplicate = candidate.decision === 'duplicate';
    const now = new Date().toISOString();
    const receipt = { id, completedAt: now, files: pending.map(f => {
      const records = verified ? candidate.records.filter(r => r.name === f.name) : [];
      const duplicateKeys = candidate.duplicates?.filter(d => d.name === f.name).map(d => d.sameAs) ?? [];
      const publishedDocuments = verified ? candidate.documents : current.documents;
      const sourceDocs = records.length ? records.map(r => r.manifest) : duplicateKeys.map(k => publishedDocuments.find(d => d.docKey === k)).filter(Boolean);
      return { name: f.name, status: records.length ? 'landed' : duplicate || (verified && duplicateKeys.length) ? 'duplicate' : 'held',
        docKeys: sourceDocs.map(d => d.docKey), providers: [...new Set(sourceDocs.map(d => d.provider))],
        landedAs: records.map(r => r.manifest.sourcePath), updatedAt: now,
        hold: verified || duplicate ? null : candidate.decision === 'slow_path' ? 'needs-reader' : 'check-failed',
        reason: verified || duplicate ? null : 'This statement needs a full reading before it can update the dashboard.' };
    }) };
    if (verified) {
      const records = { ...current.records };
      for (const record of candidate.records) records[record.manifest.docKey] = record;
      const manifest = current.manifest.map(d => ({ ...d }));
      for (const record of candidate.records) manifest.push(record.manifest);
      const originals = { ...current.originals }, previews = { ...current.previews };
      for (const file of files) {
        const associated = candidate.records.filter(r => r.name === file.name);
        if (!associated.length) continue;
        const encrypted = associated.some(r => r.files['document.json'].warnings.some(w => w.code === 'pdf-encrypted'));
        let preview;
        if (encrypted) {
          const pdf = await unlockPdf(file.bytes, passwords);
          if (!pdf) throw Error('The statement was read but its protected preview could not be prepared');
          const filename = previewKey(file.bytes), hash = filename.slice(0, -4);
          const dashboardHash = createHash('sha256').update(`glow-ventures-family-office::pw::v1\n${dashboardPassword}`).digest('hex');
          const sealed = await sealPreview(pdf, await previewKeyBytes(dashboardPassword), hash, dashboardHash);
          // Keep large encrypted derivatives out of the JSON snapshot. Git
          // stores each blob once and the publication commits its address.
          previews[filename] = { blob: await store.putBlob(sealed), bytes: sealed.length };
          preview = { file: filename, bytes: describePreview(sealed).bytes };
        }
        for (const record of associated) originals[record.manifest.docKey] = {
          file: `${record.manifest.docKey}.${file.name.split('.').at(-1).toLowerCase()}`, bytes: file.size,
          encrypted, preview, blob: file.blob, sourcePath: record.manifest.sourcePath,
          sha256: createHash('sha256').update(file.bytes).digest('hex'),
          part: record.files['document.json'].sourcePages ? { from: record.files['document.json'].sourcePages.from,
            to: record.files['document.json'].sourcePages.to } : null,
        };
      }
      immutable(candidate.book); immutable(candidate.documents);
      const model = instantiate(candidate.book);
      // Validate the core reporting projections before publishing, while stock
      // ledgers are derived lazily against this same immutable book.
      model.deriveTransactions(candidate.documents); model.deriveRealisedLots(candidate.documents);
      model.deriveIncome(candidate.documents); model.deriveSales(candidate.documents);
      model.buildConsolidatedSheet(candidate.documents);
      candidate = { ...current, ...candidate, records, manifest, originals, previews };
      delete candidate.timings; delete candidate.duplicates;
    } else candidate = current;
    const saved = await store.publish(state, candidate, receipt);
    // Only a confirmed GitHub ref promotion can become the active version.
    state = saved; current = remember(candidate); modelFor(current);
    try {
      await inbox.commit({ message: `Statements ${id}: completed`, mutate: log => applyUpdates(log,
        receipt.files.map(f => ({ ...f, batch: id }))) });
    } catch { /* The durable publication receipt remains authoritative. */ }
    receipt.processingMs = performance.now() - started;
    return receipt;
  }
  const submit = id => {
    if (!isBatchId(id)) throw Error('Invalid statement batch');
    if (!jobs.has(id)) {
      const job = queue.then(async () => {
        for (let attempt = 0; ; attempt++) {
          try { return await processBatch(id); }
          catch (error) { if (!(error instanceof VersionConflict) || attempt >= 2) throw error; }
        }
      }).catch(async error => {
        await inbox.commit({ message: `Statements ${id}: processing interrupted`, mutate: log => applyUpdates(log,
          (log.batches.find(b => b.id === id)?.files ?? []).filter(f => f.processor === processorName && ['queued', 'processing'].includes(f.status))
            .map(f => ({ batch: id, name: f.name, status: 'held', hold: 'intake-error', reason: 'Processing was interrupted. Retry this statement.' }))) });
        throw error;
      });
      queue = job.catch(() => {});
      jobs.set(id, job);
      job.finally(() => jobs.delete(id)).catch(() => {});
    }
    return jobs.get(id);
  };
  return {
    initialize, submit, version,
    stockLedgers: () => modelFor(current).deriveStockLedgers(current.documents, stockKeys(current)),
    status: () => ({ ready, revision: current.revision, readerRevision: current.readerRevision, receipts: state?.state?.receipts ?? {} }),
    published: () => ({ manifest: current.manifest, index: { files: current.originals, missing: current.missingOriginals ?? {} } }),
    snapshot: () => ({ schemaVersion: 1, revision: current.revision, readerRevision: current.readerRevision, book: current.book,
      stockKeys: stockKeys(current), emptyLedger: modelFor(current).deriveStockLedger(current.documents, '') }),
    async exposure(revision, body) {
      const snap = await version(revision), model = modelFor(snap);
      const result = await model.loadStockExposure(body.funds, new Map(body.identities), {
        keys: new Set(snap.book.BOOK_POLYCAB.map(p => p.securityKey)),
        isins: new Set(snap.book.BOOK_POLYCAB.flatMap(p => p.isin ? [p.isin.trim().toUpperCase()] : [])),
      }, new Set(body.companyKeys), snap.lookthrough);
      return result.status === 'ok' ? { ...result, byKey: [...result.byKey] } : result;
    },
    async asset(revision, name) {
      const snap = await version(revision);
      if (name === 'canonical/book.json') return snap.book;
      if (name === 'publication.json') return { schemaVersion: 1, readerRevision: snap.readerRevision,
        archiveRevision: snap.archiveRevision, bookRevision: digest(snap.book),
        statementDocuments: snap.documents.map(d => ({ document: d.docKey, revision: digest(d), evidence: `provenance/documents/${d.docKey}.json` })),
        canonical: 'canonical/book.json', positions: 'provenance/positions.json',
        overlays: { livePrices: 'Quotes and NAVs retain their own provider/time; they do not overwrite the statement evidence.',
          enteredData: 'Entered capital calls and investment profiles retain their separate dashboard-store history.' } };
      if (name === 'audit/manifest.json') return snap.manifest;
      const audit = /^audit\/([a-z0-9._-]+)\/([a-zA-Z0-9._-]+\.json)$/.exec(name);
      if (audit) {
        if (audit[2] === 'document.json') return snap.documents.find(d => d.docKey === audit[1]) ?? null;
        return snap.records[audit[1]]?.files[audit[2]] ?? baseAsset(snap.baseCommit, name);
      }
      if (name === 'audit/formats.json') return baseAsset(snap.baseCommit, name);
      if (name === 'statement-files/index.json') return { files: snap.originals, missing: snap.missingOriginals };
      const original = /^statement-files\/([a-zA-Z0-9._-]+)$/.exec(name);
      if (original) {
        const item = Object.values(snap.originals).find(f => f.file === original[1]);
        return item?.blob ? { bytes: await store.blob(item.blob), type: original[1].endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' } : null;
      }
      const preview = /^statement-previews\/([a-f0-9]{64}\.pdf)$/.exec(name);
      if (preview) return snap.previews[preview[1]] ? { bytes: await store.blob(snap.previews[preview[1]].blob), type: 'application/octet-stream' }
        : baseAsset(snap.baseCommit, `statement-previews/${preview[1].replace(/\.pdf$/, '.bin')}`, true);
      const doc = /^(canonical|provenance)\/documents\/([a-z0-9._-]+)\.json$/.exec(name);
      if (doc) {
        const d = snap.documents.find(d => d.docKey === doc[2]);
        if (!d || doc[1] === 'canonical') return d ?? null;
        if (snap.readerRevision !== initial.readerRevision) throw new ReaderVersionChanged('Document projections require their matching reader');
        return documentEvidence(d, { readerRevision: snap.readerRevision, sourceSha256: snap.originals[d.docKey]?.sha256 ?? null });
      }
      // Old canonical facts and source bytes remain readable. Derived reports
      // must never apply the new reader's rules to an older version's book.
      const model = modelFor(snap);
      if (name === 'provenance/positions.json') return snap.book.BOOK_POSITIONS.map(p => ({ ...evidenceFor(snap)(p),
        investmentDate: { value: model.investedOnOf([p]), inputs: { accountId: p.accountId, memberId: p.memberId ?? null,
          securityKey: p.securityKey, heldSince: p.heldSince ?? null, heldPurchases: p.recoveredCost?.heldPurchases ?? null,
          supplementary: p.recoveredCost?.evidence ?? [], review: p.reviewSource ?? null,
          tranches: snap.book.BOOK_POSITION_TRANCHES[`${p.accountId}|${p.securityKey}`] ?? null } } }));
      const simple = { 'ledger/transactions.json': 'deriveTransactions', 'ledger/lots.json': 'deriveRealisedLots',
        'ledger/income.json': 'deriveIncome', 'ledger/sales.json': 'deriveSales', 'consolidated/book.json': 'buildConsolidatedSheet' };
      if (simple[name]) return model[simple[name]](snap.documents);
      const stock = /^ledger\/stocks\/([a-z0-9-]+)\.json$/.exec(name);
      if (stock) return model.deriveStockLedger(snap.documents, stock[1]);
      if (name === 'fund-disclosures.json') return model.deriveFundDisclosures(snap.documents, new Set(snap.book.BOOK_POLYCAB.map(p => p.securityKey)));
      if (name === 'lookthrough.json') return snap.lookthrough;
      return null;
    },
  };
}
function stockKeys(snapshot) {
  return [...new Set([...snapshot.book.BOOK_POSITIONS.map(p => p.securityKey), ...snapshot.documents.flatMap(d =>
    ['transactions', 'capitalGains', 'holdings', 'income'].flatMap(k => (d[k] ?? []).map(r => r.securityKey)))])].filter(Boolean).sort();
}
