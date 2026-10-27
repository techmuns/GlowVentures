// Trusted request-time ingestion. It prepares a complete candidate without
// touching disk, a repository branch, or the currently published version.
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { extractLayout } from './lib/layout.mjs';
import { extractDocuments, gridFromSpreadsheet, archiveRecord, backfillStatementDocuments } from './extract.mjs';
import { settleStatus } from './lib/readStatus.mjs';
import { reconcile } from './reconcile.mjs';
import { assessPublication, archiveRevision, digest, holdingKey, positionEvidenceReader } from './lib/publication.mjs';
import { buildCanonicalBook, canonicalBookValues } from '../build-book.mjs';
import { checkUpload, extOf } from '../../shared/statementInbox.mjs';
import { checkStatementBytes } from '../../shared/statementBytes.mjs';

const withoutSections = doc => { const { sections, ...facts } = doc; return facts; };

/** Renaming an archive collision never changes a row's evidence identity. */
function distinguish(doc, keys) {
  const old = doc.docKey;
  let key = old;
  for (let n = 2; keys.has(key); n++) key = `${old}-${n}`;
  if (key !== old) {
    const move = value => Array.isArray(value) ? value.map(move) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'source' && v === old ? key : move(v)])) : value;
    doc = move(doc); doc.docKey = key;
  }
  keys.add(key);
  return doc;
}

export async function prepareRapidStatement({ baseline, files, references, passwords = [], sourcePrefix, readerRevision, readPdf = extractLayout }) {
  const start = performance.now(), timings = {};
  if (!/^source\/uploads-rapid-[a-zA-Z0-9-]+$/.test(sourcePrefix)) throw Error('Unsafe statement source prefix');
  if (!Array.isArray(files) || !files.length || files.length > 200) throw Error('Invalid statement batch');
  const keys = new Set(baseline.map(d => d.docKey)), produced = [];
  for (const file of files) {
    const v = checkUpload({ name: file.name, size: file.bytes.byteLength });
    if (v.error) throw Error(v.error);
    if (extOf(v.name) === 'zip') return { decision: 'slow_path', reason: 'Archive expansion needs the full intake reader.' };
    const bytes = new Uint8Array(file.bytes);
    const check = checkStatementBytes(bytes, v.name);
    if (!check.ok) return { decision: 'needs_review', issues: [{ code: 'INVALID_FILE', reason: check.why }] };
    const grid = extOf(v.name) === 'pdf'
      ? await readPdf(bytes, { passwords, ocr: false })
      : gridFromSpreadsheet(Buffer.from(bytes));
    // Scans and unfamiliar layouts retain the full intake path, including OCR.
    if (grid.error) return { decision: 'slow_path', reason: 'The statement needs the full reader.' };
    for (const part of extractDocuments(path.resolve(sourcePrefix, v.name), grid)) {
      const doc = distinguish(part.doc, keys);
      settleStatus(doc);
      produced.push({ doc, grid: part.grid, name: v.name });
    }
  }
  timings.readMs = performance.now() - start;
  // Reuse the offline reader's exact-witness backfills. The publication gate
  // still refuses sole-known-account assumptions and unresolved identities.
  const original = baseline.map(withoutSections);
  const completed = [...structuredClone(original), ...produced.map(p => p.doc)];
  const grids = new Map(produced.map(p => [p.doc, p.grid]));
  backfillStatementDocuments(completed, grids);
  // Provider recovery can replace a new document object; retain its grid and
  // original upload name, then distinguish any key changed by a backfill.
  for (let i = 0; i < produced.length; i++) {
    const doc = completed[original.length + i];
    produced[i].grid = grids.get(doc) ?? produced[i].grid;
    produced[i].doc = doc;
  }
  const finalKeys = new Set(original.map(d => d.docKey));
  for (const part of produced) { part.doc = distinguish(part.doc, finalKeys); settleStatus(part.doc); }
  // Historical records are witnesses here, never silently reinterpreted without
  // rereading their source files. Only the new documents receive the backfills.
  let candidate = [...structuredClone(original), ...produced.map(p => p.doc)].map(withoutSections);
  const t = performance.now();
  const beforeReport = reconcile(structuredClone(original), { symbolMap: references.symbols });
  let report = reconcile(candidate, { symbolMap: references.symbols });
  let assessment = assessPublication({ baseline: original, documents: candidate, baselineReport: beforeReport, report });
  if (assessment.duplicates.length) {
    // Mixed deliveries are re-assessed after removing only proven semantic
    // duplicates; new documents must still pass every publication check.
    const duplicateKeys = new Set(assessment.duplicates.map(d => d.document));
    candidate = candidate.filter(d => !duplicateKeys.has(d.docKey));
    report = reconcile(candidate, { symbolMap: references.symbols });
    const checked = assessPublication({ baseline: original, documents: candidate, baselineReport: beforeReport, report });
    assessment = { ...checked, duplicates: assessment.duplicates };
  }
  timings.validationMs = performance.now() - t;
  assessment.duplicates = assessment.duplicates.map(d => ({ ...d, name: produced.find(p => p.doc.docKey === d.document)?.name }));
  if (assessment.decision === 'needs_review') return { ...assessment, timings };
  if (assessment.decision === 'unchanged') return { ...assessment, decision: 'duplicate', timings };
  const records = produced.filter(p => candidate.some(d => d.docKey === p.doc.docKey)).map(p => ({ ...archiveRecord(p.doc, p.grid), name: p.name }));
  const pagesByDocument = { ...references.pagesByDocument,
    ...Object.fromEntries(records.map(r => [r.manifest.docKey, r.files['pages.json'].pages.map(p => p.text).join('\n')])) };
  const buildStart = performance.now();
  const book = canonicalBookValues(buildCanonicalBook(candidate.filter(d => d.status !== 'failed'), candidate.length, { ...references, pagesByDocument }));
  // The same selected-record checks as statements:verify-book, in memory.
  const identities = new Set();
  const evidenceForPosition = positionEvidenceReader(candidate, book.BOOK_ACCOUNTS);
  for (const position of book.BOOK_POSITIONS) {
    const key = holdingKey(position);
    if (identities.has(key)) throw Error(`Ambiguous canonical holding: ${key}`);
    identities.add(key);
    if (!position.review && !position.statementRecord) throw Error(`Missing statement record: ${key}`);
    evidenceForPosition(position);
  }
  // Tags produced by reconciliation are part of the archived facts as well.
  for (const record of records) record.files['document.json'] = candidate.find(d => d.docKey === record.manifest.docKey);
  timings.buildMs = performance.now() - buildStart;
  const archive = assessment.candidateRevision;
  const revision = digest({ readerRevision, archiveRevision: archive, book }).slice(0, 20);
  timings.totalMs = performance.now() - start;
  return { decision: 'verified', schemaVersion: 1, readerRevision, revision, archiveRevision: archive,
    documents: candidate, book, records, duplicates: assessment.duplicates, timings };
}
