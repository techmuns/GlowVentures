// A normal application deployment must retain statements processed since its
// compiled baseline. Rebuild the union under the new verified reader rules.
import { assessPublication, digest, positionEvidenceReader, holdingKey, sameFinancialStatement } from './lib/publication.mjs';
import { reconcile } from './reconcile.mjs';
import { buildCanonicalBook, canonicalBookValues } from '../build-book.mjs';

export function migrateRapidPublication(previous, initial, references, instantiate) {
  const baseline = initial.documents, baseKeys = new Set(baseline.map(d => d.docKey));
  const byKey = new Map(baseline.map(d => [d.docKey, d]));
  for (const doc of previous.documents) if (previous.records[doc.docKey] && byKey.has(doc.docKey)
    && !sameFinancialStatement(doc, byKey.get(doc.docKey))) {
    throw Error('The main archive conflicts with a previously verified runtime statement; retain it for review');
  }
  let runtime = previous.documents.filter(d => !baseKeys.has(d.docKey) && previous.records[d.docKey]);
  let documents = structuredClone([...baseline, ...runtime]);
  const before = reconcile(structuredClone(baseline), { symbolMap: references.symbols });
  let report = reconcile(documents, { symbolMap: references.symbols });
  let assessment = assessPublication({ baseline, documents, baselineReport: before, report });
  if (assessment.duplicates.length) {
    const copies = new Set(assessment.duplicates.map(d => d.document));
    runtime = runtime.filter(d => !copies.has(d.docKey));
    documents = documents.filter(d => !copies.has(d.docKey));
    report = reconcile(documents, { symbolMap: references.symbols });
    assessment = assessPublication({ baseline, documents, baselineReport: before, report });
  }
  if (!['verified', 'unchanged'].includes(assessment.decision)) throw Error('Saved statements conflict with the new verified baseline; retain the previous publication for review');
  const kept = new Set(runtime.map(d => d.docKey));
  const records = Object.fromEntries(Object.entries(previous.records).filter(([key]) => kept.has(key)));
  const pagesByDocument = { ...references.pagesByDocument, ...Object.fromEntries(Object.entries(records)
    .map(([key, record]) => [key, record.files['pages.json']?.pages.map(p => p.text).join('\n') ?? null])) };
  const book = canonicalBookValues(buildCanonicalBook(documents.filter(d => d.status !== 'failed'), documents.length, { ...references, pagesByDocument }));
  const evidence = positionEvidenceReader(documents, book.BOOK_ACCOUNTS), identities = new Set();
  for (const position of book.BOOK_POSITIONS) {
    const key = holdingKey(position);
    if (identities.has(key) || (!position.review && !position.statementRecord)) throw Error('Invalid selected statement record after reader migration');
    identities.add(key); evidence(position);
  }
  const model = instantiate(book);
  for (const name of ['deriveTransactions', 'deriveRealisedLots', 'deriveIncome', 'deriveSales', 'buildConsolidatedSheet']) model[name](documents);
  const archiveRevision = assessment.candidateRevision;
  const revision = digest({ readerRevision: initial.readerRevision, baseCommit: initial.baseCommit, archiveRevision, book }).slice(0, 20);
  return { ...initial, revision, archiveRevision, book, documents, records,
    manifest: [...initial.manifest, ...runtime.map(d => records[d.docKey].manifest)],
    originals: { ...initial.originals, ...Object.fromEntries(Object.entries(previous.originals).filter(([key]) => kept.has(key))) },
    previews: previous.previews,
  };
}
