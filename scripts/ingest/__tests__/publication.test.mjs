import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeDocument, makeHolding, deriveDocument } from '../lib/document.mjs';
import { assessPublication, digest, stable, archiveRevision, documentRevision, documentEvidence, positionEvidence } from '../lib/publication.mjs';
import { sourceFiles, duplicateBytes } from '../prepare-delivery.mjs';
import { checkSeal, commitDelivery } from '../publish-delivery.mjs';
import { finalizationGate } from '../finalize-delivery.mjs';
import { completedBotReview, unresolvedBotFindings, deploymentContains, monitorPublication } from '../lib/intakePublication.mjs';
import { verifyAutomaticPublication } from '../lib/automaticPublication.mjs';
import { git as repositoryGit } from '../verify-publication.mjs';
import { refreshForPublication, startPublicationRefresh, publicationRefreshBlocked } from '../../../shared/publicationRefresh.mjs';
import { extractLayout } from '../lib/layout.mjs';
import { findTable, readRows } from '../lib/table.mjs';
import { parseNum } from '../lib/parseNum.mjs';
import { makeGridPdf } from './fixtures/makePdf.mjs';
import { readDeliveryReceipts, writeDeliveryReceipts } from '../lib/deliveryReceipts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
const doc = (overrides = {}) => deriveDocument(makeDocument({ docKey: 'hdfc-123-2026-10-01', provider: 'HDFC Mutual Fund',
  accountNo: '123', owner: 'Ajay Jaisinghani', ownerId: 'ajay-jaisinghani', asOf: '2026-10-01', reportType: 'holdings', status: 'ok',
  sourcePath: 'source/test.pdf', holdings: [makeHolding({ security: 'Example Fund', isin: 'INF000000001', quantity: 10, totalCost: 90, marketPrice: 12, source: overrides.docKey ?? 'hdfc-123-2026-10-01' })], ...overrides }));
const later = (overrides = {}) => doc({ docKey: 'hdfc-123-2026-10-21', asOf: '2026-10-21', ...overrides });
const assess = (documents, baseline = [doc()], extra = {}) => assessPublication({ baseline, documents, ...extra });
const has = (r, code) => r.issues.some(i => i.code === code);

test('archive rebuild retains exact delivery receipt bytes from the archive and its carry history', () => {
  const directory = fs.mkdtempSync(path.join(ROOT, '.cache/publication-receipts-'));
  const current = path.join(directory, 'current'), carry = path.join(directory, 'carry');
  const name = 'a'.repeat(64) + '.json', other = 'b'.repeat(64) + '.json';
  const bytes = Buffer.from('{ "id": "immutable", "documents": [] }\n');
  for (const archive of [current, carry]) { fs.mkdirSync(path.join(archive, 'deliveries'), { recursive: true }); fs.writeFileSync(path.join(archive, 'deliveries', name), bytes); }
  fs.writeFileSync(path.join(carry, 'deliveries', other), 'historical bytes\n');
  const receipts = readDeliveryReceipts([current, carry, current]);
  assert.equal(receipts.size, 2);
  fs.rmSync(current, { recursive: true }); fs.mkdirSync(current);
  writeDeliveryReceipts(current, receipts);
  assert.deepEqual(fs.readFileSync(path.join(current, 'deliveries', name)), bytes);
  assert.equal(fs.readFileSync(path.join(current, 'deliveries', other), 'utf8'), 'historical bytes\n');
  assert.equal(readDeliveryReceipts([path.join(directory, 'missing')]).size, 0);
  fs.writeFileSync(path.join(carry, 'deliveries', name), 'conflicting bytes');
  assert.throws(() => readDeliveryReceipts([current, carry]), /Conflicting delivery receipt/);
  assert.deepEqual(fs.readFileSync(path.join(current, 'deliveries', name)), bytes);
});
test('receipt preservation refuses unsafe filenames and symbolic links before replacing the archive', () => {
  const directory = fs.mkdtempSync(path.join(ROOT, '.cache/publication-receipts-'));
  const deliveries = path.join(directory, 'deliveries'); fs.mkdirSync(deliveries);
  fs.writeFileSync(path.join(deliveries, 'unexpected.json'), 'opaque');
  assert.throws(() => readDeliveryReceipts([directory]), /Unsafe delivery receipt/);
  fs.renameSync(path.join(deliveries, 'unexpected.json'), path.join(directory, 'original'));
  fs.symlinkSync(path.join(directory, 'original'), path.join(deliveries, 'c'.repeat(64) + '.json'));
  assert.throws(() => readDeliveryReceipts([directory]), /Unsafe delivery receipt/);
  assert.equal(fs.readFileSync(path.join(directory, 'original'), 'utf8'), 'opaque');
  const linked = path.join(directory, 'linked'); fs.mkdirSync(linked);
  fs.symlinkSync(path.join(directory, 'absent-target'), path.join(linked, 'deliveries'));
  assert.throws(() => readDeliveryReceipts([linked]), /regular directory/);
});

test('verified later snapshot preserves the earlier document and is deterministic', () => {
  const old = doc(), next = later();
  const result = assess([old, next]);
  assert.equal(result.decision, 'verified'); assert.equal(result.changed.length, 1);
  assert.equal(archiveRevision([old, next]), archiveRevision([next, old]));
  assert.equal(assess([old]).decision, 'unchanged');
});
test('new owner cannot replace another holder using the same provider/account', () => {
  const next = later({ owner: 'Ankita Jaisinghani', ownerId: 'ankita-jaisinghani' });
  assert.ok(has(assess([doc(), next]), 'ACCOUNT_OWNER_CONFLICT'));
});
test('owner name and canonical owner must agree; the folder does not override the statement', () => {
  assert.ok(has(assess([doc(), later({ owner: 'Ankita Jaisinghani' })]), 'UNVERIFIED_OWNER'));
  assert.ok(has(assess([doc(), later()], [doc()], { expected: { provider: 'Another Broker' } }), 'FOLDER_MISMATCH'));
});
test('new formats cannot borrow the only known account when no identifier was printed', () => {
  assert.ok(has(assess([doc(), later({ accountNoSource: 'sole-account' })]), 'UNVERIFIED_ACCOUNT'));
  const old = doc({ clientCode: 'CLIENT1' });
  const next = later({ clientCode: 'CLIENT1', accountNoSource: 'client-code' });
  assert.equal(assess([old, next], [old]).decision, 'verified');
});
test('an issuer/account may have several securities and the same security may belong to several owners', () => {
  const next = later({ accountNo: '456', owner: 'Ankita Jaisinghani', ownerId: 'ankita-jaisinghani' });
  assert.equal(assess([doc(), next]).decision, 'verified');
});
test('an equal-valued row cannot borrow another account’s source document or dates', () => {
  const next = later({ accountNo: '456', owner: 'Ankita Jaisinghani', ownerId: 'ankita-jaisinghani' });
  next.holdings[0].source = doc().docKey;
  assert.ok(has(assess([doc(), next]), 'CROSS_ACCOUNT_SOURCE'));
});
test('a new ISIN cannot quietly reuse an existing security key', () => {
  const next = later(); next.holdings[0].isin = 'INF999999999';
  assert.ok(has(assess([doc(), next]), 'SECURITY_CONFLICT'));
});
test('a renamed security with the same ISIN needs a verified alias instead of a second holding', () => {
  const next = later(); next.holdings[0].securityKey = 'a-second-name';
  assert.ok(has(assess([doc(), next]), 'SECURITY_SPLIT'));
});
test('a pairing the verified book already carries does not block a row filed under it; a new key still does', () => {
  // The depository's name and the fund's own for one ISIN, both in the verified book.
  const fund = doc({ docKey: 'fund-789-2026-10-01', accountNo: '789' });
  fund.holdings[0].securityKey = 'example-fund-class-a';
  const baseline = [doc(), fund];
  assert.equal(assess([...baseline, later()], baseline).decision, 'verified');
  const third = later(); third.holdings[0].securityKey = 'a-third-name';
  assert.ok(has(assess([...baseline, third], baseline), 'SECURITY_SPLIT'));
});
test('a layout silently dropping a previously populated field is quarantined', () => {
  const next = later(); next.holdings[0].totalCost = null;
  assert.ok(has(assess([doc(), next]), 'FIELD_COVERAGE_LOSS'));
});
test('real coordinate reader survives reordered, inserted, wrapped and renamed known headers', async () => {
  const aliases = { security: [/^security/], quantity: [/^quantity/, /^units/], totalCost: [/^total cost/, /^amount invested/],
    marketPrice: [/^market price/, /^nav/], marketValue: [/^market value/, /^current value/] };
  const values = { security: 'Example Fund', quantity: '10', totalCost: '90', marketPrice: '12', marketValue: '120', reference: 'REF1' };
  const variants = [
    [['security', 'Security'], ['quantity', 'Quantity'], ['totalCost', 'Total Cost'], ['marketPrice', 'Market Price'], ['marketValue', 'Market Value']],
    [['security', 'Security'], ['marketPrice', 'NAV'], ['reference', 'Broker Ref'], ['marketValue', 'Current Value'], ['quantity', 'Units'], ['totalCost', 'Amount Invested']],
    [['security', 'Security'], ['totalCost', 'Total\nCost'], ['quantity', 'Quantity'], ['marketValue', 'Market\nValue'], ['marketPrice', 'Market\nPrice']],
  ];
  for (const variant of variants) {
    const spans = [];
    variant.forEach(([field, label], i) => {
      label.split('\n').forEach((line, n) => spans.push([25 + i * 125, 700 - n * 12, line]));
      spans.push([25 + i * 125, 650, values[field]]);
    });
    const grid = await extractLayout(makeGridPdf(spans, { mediaBox: [0, 0, 900, 800] }));
    assert.equal(grid.error, null);
    // Two unwrapped anchors locate the block; the complete wrapped header must
    // then resolve EVERY required field before a reader may use it.
    const table = findTable(grid.pages[0], aliases, { minFields: 2 });
    assert.ok(table, `All required semantic headers must be located: ${JSON.stringify({ variant, found: findTable(grid.pages[0], aliases, { minFields: 1 })?.columns })}`);
    assert.deepEqual(table.missing, []);
    const rows = readRows(grid.pages[0], table, { requireField: 'security' }).rows;
    assert.equal(rows.length, 1);
    const fields = rows[0].fields;
    assert.equal(fields.security, 'Example Fund');
    for (const key of ['quantity', 'totalCost', 'marketPrice', 'marketValue']) assert.equal(parseNum(fields[key]), Number(values[key]), key);
    // Swapping quantity with price would still pass quantity * price = value.
    // These assertions prove the labels, rather than that arithmetic, matched.
    assert.equal(parseNum(fields.quantity), 10); assert.equal(parseNum(fields.marketPrice), 12);
  }
});
test('unknown and partial formats are not publishable even when some rows parsed', () => {
  assert.ok(has(assess([doc(), later({ reportType: 'unknown' })]), 'UNKNOWN_FORMAT'));
  assert.ok(has(assess([doc(), later({ status: 'partial' })]), 'READ_GAP'));
});
test('same-date restatements with different facts require review', () => {
  const next = doc({ docKey: 'a-corrected-file' }); next.holdings[0].quantity = 11;
  assert.ok(has(assess([doc(), next]), 'CONFLICTING_ISSUE'));
});
test('a repeated statement under a different filename is a no-op delivery', () => {
  const next = doc({ docKey: 'a-renamed-file', sourcePath: 'source/copy.pdf' });
  const result = assess([doc(), next]);
  assert.equal(result.decision, 'duplicate'); assert.equal(result.duplicates[0].sameAs, doc().docKey);
});
test('a mixed duplicate delivery never silently drops its genuinely new statement', () => {
  const copy = doc({ docKey: 'copy', sourcePath: 'source/copy.pdf' });
  assert.ok(has(assess([doc(), copy, later()]), 'MIXED_DUPLICATE_DELIVERY'));
});
test('two rows targeting one holding cannot accidentally overwrite each other', () => {
  const next = later(); next.holdings.push(structuredClone(next.holdings[0]));
  assert.ok(has(assess([doc(), next]), 'AMBIGUOUS_HOLDING'));
});
test('archive loss and document path traversal both block publication', () => {
  assert.ok(has(assess([later()]), 'ARCHIVE_LOSS'));
  assert.ok(has(assess([doc(), later({ docKey: '../wrong' })]), 'UNSAFE_DOCUMENT_KEY'));
});
test('a failed reading gives way to a reading of the same file; dropped without one it is still an archive loss', () => {
  const unread = doc({ docKey: 'unknown-unknown-unknown-holdings', provider: '(unidentified)', accountNo: null, owner: null, ownerId: null,
    asOf: null, reportType: 'unknown', status: 'failed', sourcePath: 'source/scan.pdf', holdings: [] });
  const read = later({ accountNo: '456', owner: 'Ankita Jaisinghani', ownerId: 'ankita-jaisinghani', sourcePath: 'source/scan.pdf' });
  assert.equal(assess([doc(), read], [doc(), unread]).decision, 'verified');
  assert.ok(has(assess([doc(), later()], [doc(), unread]), 'ARCHIVE_LOSS'));
});
test('a removal notice where a statement should be publishes nothing, and is not a read gap', () => {
  const notice = (n) => doc({ docKey: `notice-${n}`, provider: '(unidentified)', accountNo: null, owner: null, ownerId: null,
    reportType: 'unknown', status: 'failed', sourcePath: `source/lkp/${n}.xls`, holdings: [],
    warnings: [{ code: 'attachment-removed', detail: `${n}.xls NEVER ARRIVED` }] });
  const result = assess([doc(), notice(1), notice(2)]);
  assert.equal(result.decision, 'verified'); assert.deepEqual(result.issues, []);
  const unreadable = notice(3); unreadable.warnings = [{ code: 'no-extractor', detail: 'no reader' }];
  assert.ok(has(assess([doc(), unreadable]), 'READ_GAP'));
});
test('invalid days cannot date a transaction or investment', () => {
  const next = later(); next.transactions = [{ date: '2026-02-30' }];
  assert.ok(has(assess([doc(), next]), 'INVALID_DATE'));
});
test('a renamed or dropped date column cannot silently remove verified transaction/lot dates', () => {
  const old = doc(); old.transactions = [{ date: '2026-09-01', securityKey: 'example-fund', quantity: 10 }];
  const next = later(); next.transactions = [{ date: null, securityKey: 'example-fund', quantity: 10 }];
  assert.ok(has(assess([old, next], [old]), 'DATE_COVERAGE_LOSS'));
});
test('new material discrepancies cannot hide behind the same historical count', () => {
  const baselineReport = { rowSumChecks: [{ docKey: 'old', severity: 'material', delta: 7 }] };
  const report = { rowSumChecks: [{ docKey: 'new', severity: 'material', delta: 7 }] };
  assert.ok(has(assess([doc(), later()], [doc()], { baselineReport, report }), 'RECONCILIATION_FAILED'));
  assert.equal(assess([doc(), later()], [doc()], { baselineReport, report: baselineReport }).decision, 'verified');
});
test('evidence retains calendar dates, nulls, exact pointers, inputs and reader version', () => {
  const d = doc(), e = documentEvidence(d, { readerRevision: 'reader-v2' });
  assert.equal(e.fields['/asOf'].value, '2026-10-01'); assert.equal(e.fields['/holdings/0/unitCost'].kind, 'missing');
  assert.deepEqual(e.fields['/holdings/0/marketValue'].inputs, ['/holdings/0/quantity', '/holdings/0/marketPrice']);
  assert.equal(e.readerRevision, 'reader-v2'); assert.equal(e.source.precision, 'document');
  assert.equal(e.source.sha256, null); // no invented raw-file fingerprint or page
});
test('position source resolution requires the exact account, member and row, even at equal values', () => {
  const d = doc(), account = { accountId: 'acct123', provider: d.provider, accountNo: '123', ownerId: d.ownerId };
  const p = { accountId: 'acct123', securityKey: d.holdings[0].securityKey, memberId: null, quantity: 10, marketValue: 120,
    statementRecord: { document: d.docKey, pointer: '/holdings/0' } };
  assert.equal(positionEvidence(p, [d], [account]).record.pointer, '/holdings/0');
  assert.throws(() => positionEvidence(p, [d], [{ ...account, ownerId: 'ankita-jaisinghani' }]), /Wrong statement account/);
  assert.throws(() => positionEvidence({ ...p, securityKey: 'other' }, [d], [account]), /Wrong statement row/);
  assert.throws(() => positionEvidence({ ...p, quantity: 11 }, [d], [account]), /value\/quantity/);
});
test('raw checksum is standard SHA-256 and tampered/stale candidate sets publish no files', () => {
  assert.equal(digest(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const bytes = Buffer.from('candidate');
  const seal = { schemaVersion: 1, state: 'verified', id: 'a'.repeat(64), baseCommit: 'base', artifacts: [
    { path: 'src/data/glowData.ts', artifact: 'book', sha256: digest(bytes) },
    { path: 'public/audit/manifest.json', artifact: 'manifest', sha256: digest(bytes) },
  ] };
  assert.doesNotThrow(() => checkSeal(seal, { currentBase: 'base', read: () => bytes }));
  assert.throws(() => checkSeal(seal, { currentBase: 'newer', read: () => bytes }), /STALE_BASE/);
  assert.throws(() => checkSeal(seal, { currentBase: 'base', read: () => Buffer.from('changed') }), /ARTIFACT_CHANGED/);
  assert.throws(() => checkSeal({ ...seal, artifacts: [{ ...seal.artifacts[0], path: 'functions/evil.js' }] }, { currentBase: 'base', read: () => bytes }), /Invalid/);
});
test('no extracted document is never treated as proof that new uploaded bytes were a duplicate', () => {
  const files = [{ absolute: 'new.pdf', sha256: digest(Buffer.from('new statement')) }];
  const fakeGit = args => args[0] === 'ls-tree' ? 'old-blob\n' : args[0] === 'hash-object' ? 'new-blob\n' : Buffer.from('old statement');
  assert.equal(duplicateBytes(files, 'base', fakeGit), false);
  const knownGit = args => args[0] === 'ls-tree' || args[0] === 'hash-object' ? 'same-blob\n' : Buffer.from('new statement');
  assert.equal(duplicateBytes(files, 'base', knownGit), true);
});
test('binary Git reads preserve source bytes on the CI Node runtime', () => {
  const bytes = repositoryGit(['show', 'HEAD:.gitignore'], { encoding: null });
  assert.ok(Buffer.isBuffer(bytes)); assert.ok(bytes.includes(Buffer.from('.cache/')));
});
test('upload requests reject paths outside source, missing digests and symbolic links', () => {
  const directory = fs.mkdtempSync(path.join(ROOT, '.cache/publication-test-'));
  fs.mkdirSync(path.join(directory, 'source')); fs.writeFileSync(path.join(directory, 'source/a.csv'), 'one,two\n1,2');
  const file = { path: 'source/a.csv', sha256: digest(fs.readFileSync(path.join(directory, 'source/a.csv'))) };
  assert.equal(sourceFiles({ schemaVersion: 1, files: [file] }, directory).length, 1);
  assert.throws(() => sourceFiles({ schemaVersion: 1, files: [{ ...file, path: 'source/../a.csv' }] }, directory), /safe/);
  assert.throws(() => sourceFiles({ schemaVersion: 1, files: [{ ...file, sha256: 'wrong' }] }, directory), /checksum/);
  fs.symlinkSync(path.join(directory, 'source/a.csv'), path.join(directory, 'source/link.csv'));
  assert.throws(() => sourceFiles({ schemaVersion: 1, files: [{ ...file, path: 'source/link.csv' }] }, directory), /symbolic/);
});
test('Git publishes a complete immutable tree on codex, keeps HEAD/index untouched and replays idempotently', () => {
  const directory = fs.mkdtempSync(path.join(ROOT, '.cache/publication-git-'));
  const runGit = (args, options = {}) => {
    const r = spawnSync('git', args, { cwd: directory, encoding: 'utf8', ...options });
    if (r.status) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
    return r.stdout;
  };
  runGit(['init', '-b', 'codex/fixture-base']); runGit(['config', 'user.name', 'Publication Test']); runGit(['config', 'user.email', 'test@example.invalid']);
  fs.writeFileSync(path.join(directory, 'original'), 'unchanged'); runGit(['add', 'original']); runGit(['commit', '-m', 'Fixture baseline']);
  const base = runGit(['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(directory, 'candidate-book'), 'verified book'); fs.writeFileSync(path.join(directory, 'candidate-manifest'), '["verified"]');
  const seal = { schemaVersion: 1, state: 'verified', id: 'b'.repeat(64), sourceCommit: base, baseCommit: base, directory, archiveRevision: 'new', artifacts: [
    { path: 'src/data/glowData.ts', artifact: path.join(directory, 'candidate-book'), sha256: digest(Buffer.from('verified book')) },
    { path: 'public/audit/manifest.json', artifact: path.join(directory, 'candidate-manifest'), sha256: digest(Buffer.from('["verified"]')) },
  ] };
  const before = runGit(['status', '--porcelain']);
  const one = commitDelivery(seal, { runGit, indexPath: path.join(directory, 'isolated.index') });
  assert.match(one.branch, /^codex\//); assert.equal(runGit(['rev-parse', 'HEAD']).trim(), base);
  assert.equal(runGit(['status', '--porcelain']), before);
  assert.equal(runGit(['show', `${one.commit}:src/data/glowData.ts`]), 'verified book');
  assert.equal(runGit(['show', `${one.commit}:public/audit/manifest.json`]), '["verified"]');
  assert.deepEqual(commitDelivery(seal, { runGit, indexPath: path.join(directory, 'isolated.index') }), one);
});
test('merge finalization requires green CI, reviewed exact head and all protected review gates', () => {
  const publication = { commit: 'abc' }, review = { commit: 'abc', kind: 'local', feedbackAddressed: true, automatedUnavailableReason: 'Review service unavailable; diff reviewed locally.' };
  const pr = { headRefOid: 'abc', reviewDecision: '', statusCheckRollup: ['build', 'statements'].map(name => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })), reviews: [] };
  assert.doesNotThrow(() => finalizationGate(pr, review, publication));
  assert.throws(() => finalizationGate({ ...pr, statusCheckRollup: pr.statusCheckRollup.slice(0, 1) }, review, publication), /required statements/);
  assert.throws(() => finalizationGate({ ...pr, statusCheckRollup: [pr.statusCheckRollup[0], { name: 'statements', status: 'COMPLETED', conclusion: 'SKIPPED' }] }, review, publication), /required statements/);
  assert.throws(() => finalizationGate({ ...pr, headRefOid: 'changed' }, review, publication), /exact prepared commit/);
  assert.throws(() => finalizationGate({ ...pr, statusCheckRollup: [] }, review, publication), /No CI/);
  assert.throws(() => finalizationGate({ ...pr, reviewDecision: 'REVIEW_REQUIRED' }, review, publication), /Review gate/);
  assert.throws(() => finalizationGate({ ...pr, statusCheckRollup: [{ name: 'build', status: 'IN_PROGRESS' }] }, review, publication), /still running/);
  assert.throws(() => finalizationGate(pr, { ...review, automatedUnavailableReason: null }, publication), /unavailable/);
  assert.throws(() => finalizationGate({ ...pr, unresolvedThreads: true }, review, publication), /feedback/);
});
test('a bot summary must name the exact head and have no unresolved findings', () => {
  const comment = (sha, author = 'chatgpt-codex-connector') => ({ author: { login: author }, body: `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: {
    commit_sha: sha, status: 'completed', has_any_findings: false, has_unresolved_findings: false } })} -->` });
  assert.ok(completedBotReview({ headRefOid: 'abc', comments: [comment('abc')] }));
  assert.equal(completedBotReview({ headRefOid: 'changed', comments: [comment('abc')] }), null);
  assert.equal(completedBotReview({ headRefOid: 'abc', comments: [comment('abc', 'untrusted-user')] }), null);
  const finding = comment('abc'); finding.body = finding.body.replace('"has_unresolved_findings":false', '"has_unresolved_findings":true');
  assert.equal(completedBotReview({ headRefOid: 'abc', comments: [comment('abc'), finding] }), null);
  assert.equal(unresolvedBotFindings({ headRefOid: 'abc', comments: [comment('abc'), finding] }), true);
  assert.equal(unresolvedBotFindings({ headRefOid: 'new', comments: [finding] }), false);
  const outage = { ...finding, body: finding.body.replace('"status":"completed"', '"status":"failed"') };
  assert.equal(unresolvedBotFindings({ headRefOid: 'abc', comments: [outage] }), false, 'Failed quota summaries are not actual findings');
  assert.equal(unresolvedBotFindings({ headRefOid: 'abc', comments: [finding, outage] }), true, 'An outage cannot erase earlier completed findings');
});
function storedZip(name, bytes) {
  const label = Buffer.from(name), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(label.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(label.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + label.length, 12); end.writeUInt32LE(local.length + label.length + bytes.length, 16);
  return Buffer.concat([local, label, bytes, central, label, end]);
}
function automaticFixture({ changeDocument = d => d, mutate = () => {}, changeReceipt = r => r, zip = false, relinkHistory = false, historyZip = false } = {}) {
  const directory = fs.mkdtempSync(path.join(ROOT, '.cache/automatic-publication-'));
  const runGit = (args, options = {}) => {
    const r = spawnSync('git', args, { cwd: directory, encoding: 'utf8', ...options });
    if (r.status) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
    return r.stdout;
  };
  const put = (name, bytes) => { fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true }); fs.writeFileSync(path.join(directory, name), bytes); };
  const archive = documents => {
    put('public/audit/manifest.json', JSON.stringify(documents));
    for (const d of documents) put(`public/audit/${d.docKey}/document.json`, JSON.stringify(d));
  };
  runGit(['init', '-b', 'codex/automatic-fixture']); runGit(['config', 'user.name', 'Publication Test']); runGit(['config', 'user.email', 'test@example.invalid']);
  const baseline = doc(historyZip ? { sourcePath: 'source/_extracted/history/statement.pdf' } : {});
  archive([baseline]); put(historyZip ? 'source/history.zip' : 'source/test.pdf', historyZip ? storedZip('statement.pdf', Buffer.from('%PDF-original')) : '%PDF-original'); put('src/data/glowData.ts', 'original book');
  put('CLAUDE.md', 'Policy stays unchanged\n\n| Provider | Account | Owner | As of | Market value |\n| --- | --- | --- | --- | ---: |\n| old | account | owner | date | value |\n');
  runGit(['add', '-A']); runGit(['commit', '-m', 'Verified baseline']);
  const baseCommit = runGit(['rev-parse', 'HEAD']).trim();
  const uploadPath = zip ? 'source/uploads-test/statements.zip' : 'source/uploads-test/statement.pdf';
  const sourcePath = zip ? 'source/_extracted/uploads-test/statements/inner/statement.pdf' : uploadPath;
  const bytes = zip ? storedZip('inner.zip', storedZip('statement.pdf', Buffer.from('%PDF-new-statement'))) : Buffer.from('%PDF-new-statement');
  const candidate = changeDocument(later({ sourcePath })), historical = relinkHistory ? { ...baseline, stitches: [{ source: candidate.docKey }] } : baseline;
  archive([historical, candidate]); put(uploadPath, bytes); put('src/data/glowData.ts', 'generated candidate');
  let receipt = { schemaVersion: 1, baseCommit, archiveRevision: archiveRevision([historical, candidate]),
    files: [{ path: uploadPath, sha256: digest(bytes) }], documents: [{ document: candidate.docKey, revision: documentRevision(candidate), sourcePath, sha256: digest('%PDF-new-statement') }] };
  if (relinkHistory) receipt.documents.push({ document: historical.docKey, revision: documentRevision(historical), sourcePath: historical.sourcePath, sha256: digest('%PDF-original') });
  receipt = changeReceipt(receipt);
  const id = digest(receipt); put(`public/audit/deliveries/${id}.json`, JSON.stringify({ ...receipt, id }));
  mutate({ directory, put, runGit }); runGit(['add', '-A']); runGit(['commit', '-m', 'Verified data delivery']);
  const file = { commit: runGit(['rev-parse', 'HEAD']).trim(), baseCommit, archiveRevision: receipt.archiveRevision,
    branch: `codex/statement-delivery-${id.slice(0, 16)}`, ciDispatched: true, pullRequest: 'pr1',
    documentVersions: receipt.documents.map(({ document, revision }) => ({ document, revision })) };
  return { file, check: f => verifyAutomaticPublication(f, { runGit, fetchHead: false }) };
}
test('verified data automatically merges with green CI and no completed reviewer callback', async () => {
  const { file, check } = automaticFixture(); assert.equal(check(file).documents, 1);
  const pr = { number: 1, state: 'OPEN', headRefOid: file.commit, reviews: [], comments: [],
    statusCheckRollup: ['build', 'statements'].map(name => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })) };
  const calls = [];
  const gh = args => {
    calls.push(args);
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'example/repo' });
    if (args[0] === 'api') return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: {} } } } } });
    return JSON.stringify(pr);
  };
  for (const comments of [[], [{ author: { login: 'chatgpt-codex-connector' }, body: `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: file.commit, status: 'failed', has_any_findings: true, has_unresolved_findings: true } })} -->` }]]) {
    pr.comments = comments;
    assert.equal((await monitorPublication(file, { gh, currentBase: file.baseCommit, verifyData: check })).status, 'processing');
    assert.equal(calls.at(-1)[1], 'merge'); assert.equal(calls.at(-1).at(-1), file.commit);
  }
  const count = calls.filter(c => c[1] === 'merge').length;
  for (const blocked of [{ reviewDecision: 'REVIEW_REQUIRED' }, { reviews: [{ author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' }] }, { headRefOid: 'changed-head' }, { statusCheckRollup: [{ name: 'build', status: 'COMPLETED', conclusion: 'FAILURE' }] }]) {
    const original = structuredClone(pr); Object.assign(pr, blocked);
    assert.equal((await monitorPublication(file, { gh, currentBase: file.baseCommit, verifyData: check })).status, 'held');
    Object.keys(pr).forEach(k => delete pr[k]); Object.assign(pr, original);
  }
  assert.equal(calls.filter(c => c[1] === 'merge').length, count);
});
test('automatic publication holds missing, unclear and conflicting financial records', () => {
  for (const [changeDocument, error] of [
    [d => ({ ...d, accountNo: null }), /MISSING_IDENTITY/],
    [d => ({ ...d, reportType: 'unknown' }), /UNKNOWN_FORMAT/],
    [d => ({ ...d, owner: 'Ankita Jaisinghani', ownerId: 'ankita-jaisinghani' }), /OWNER_CONFLICT/],
    [d => ({ ...d, holdings: d.holdings.map(h => ({ ...h, quantity: null })) }), /FIELD_COVERAGE_LOSS/],
    [d => ({ ...d, holdings: d.holdings.map(h => ({ ...h, purchaseDate: '03\/04\/2026' })) }), /INVALID_DATE/],
  ]) {
    const { file, check } = automaticFixture({ changeDocument }); assert.throws(() => check(file), error);
  }
});
test('automatic publication verifies nested ZIP leaf bytes at their exact inventory paths', () => {
  const { file, check } = automaticFixture({ zip: true }); assert.equal(check(file).documents, 1);
  const wrong = automaticFixture({ zip: true, changeDocument: d => ({ ...d, sourcePath: d.sourcePath.replace('/inner/', '/wrong-account/') }) });
  assert.throws(() => wrong.check(wrong.file), /no retained or uploaded source evidence/);
});
test('a new delivery may update historical document links while retaining exact earlier source bytes', () => {
  for (const historyZip of [false, true]) {
    const { file, check } = automaticFixture({ relinkHistory: true, historyZip }); assert.equal(check(file).documents, 2);
  }
  const wrong = automaticFixture({ relinkHistory: true, changeReceipt: r => ({ ...r, documents: r.documents.map(d => d.sourcePath === 'source/test.pdf' ? { ...d, sha256: 'different-history' } : d) }) });
  assert.throws(() => wrong.check(wrong.file), /document rows or versions/);
});
test('automatic publication rejects code, policy, symlinks and unreceipted or altered bytes', () => {
  for (const [options, error] of [
    [{ mutate: ({ put }) => put('src/App.tsx', 'unexpected code') }, /cannot change code/],
    [{ mutate: ({ put }) => put('CLAUDE.md', 'new instructions') }, /accounts table/],
    [{ mutate: ({ directory }) => fs.symlinkSync('test.pdf', path.join(directory, 'source/link.pdf')) }, /file mode/],
    [{ mutate: ({ put }) => put('source/test.pdf', 'overwrite history') }, /overwrite earlier/],
    [{ mutate: ({ put }) => put('source/extra.pdf', 'unreceipted source') }, /exactly match/],
    [{ mutate: ({ put }) => put('source/uploads-test/statement.pdf', 'changed bytes') }, /checksum/],
    [{ changeReceipt: r => ({ ...r, documents: r.documents.map(d => ({ ...d, revision: 'wrong-row' })) }) }, /document rows or versions/],
  ]) { const { file, check } = automaticFixture(options); assert.throws(() => check(file), error); }
});
test('deployment verification requires exact document versions, not just document names or a successful merge', async () => {
  const file = { pullRequest: 'https://github.com/example/repo/pull/1', commit: 'head', baseCommit: 'base',
    documentVersions: [{ document: 'doc-a', revision: 'correct-row-version' }], docKeys: ['doc-a'] };
  assert.equal(deploymentContains({ statementDocuments: [{ document: 'doc-a', revision: 'wrong' }] }, file.documentVersions), false);
  const merged = JSON.stringify({ state: 'MERGED', mergeCommit: { oid: 'merged-sha' } });
  const mockFetch = good => async url => Response.json(url.endsWith('/publication.json') && !url.includes('/views/')
    ? { manifest: `/views/${'a'.repeat(20)}/publication.json` }
    : { statementDocuments: [{ document: 'doc-a', revision: good ? 'correct-row-version' : 'wrong' }] });
  const pending = await monitorPublication(file, { gh: () => merged, credential: 'test-only-credential', fetchImpl: mockFetch(false) });
  assert.equal(pending.status, 'processing');
  const live = await monitorPublication(file, { gh: () => merged, credential: 'test-only-credential', fetchImpl: mockFetch(true) });
  assert.equal(live.status, 'landed'); assert.equal(live.commit, 'merged-sha');
});
test('pending uploads retain bytes and never skip missing required checks', async () => {
  const file = { pullRequest: 'pr1', commit: 'head', baseCommit: 'base', documentVersions: [{ document: 'd', revision: 'r' }] };
  const pr = { state: 'OPEN', headRefOid: 'head', statusCheckRollup: [{ name: 'build', status: 'IN_PROGRESS' }] };
  const commands = [];
  const gh = args => { commands.push(args); return JSON.stringify(pr); };
  assert.equal((await monitorPublication(file, { gh, currentBase: 'base' })).status, 'processing');
  pr.statusCheckRollup = [{ name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }];
  assert.equal((await monitorPublication(file, { gh, currentBase: 'base' })).status, 'held', 'A passing build alone cannot bypass statement checks');
  assert.ok(!commands.some(a => a[0] === 'pr' && a[1] === 'merge'));
  const stale = await monitorPublication(file, { gh, currentBase: 'newer' });
  assert.equal(stale.status, 'queued'); assert.equal(stale.pullRequest, null);
  assert.ok(commands.some(a => a[1] === 'close'));
});
test('a worker resumes the saved branch after PR/CI network failures without duplicating the delivery', async () => {
  const file = { branch: `codex/statement-delivery-${'a'.repeat(16)}`, commit: 'head', baseCommit: 'base', ciDispatched: false,
    documentVersions: [{ document: 'd', revision: 'r' }] };
  let creates = 0, dispatches = 0;
  const gh = args => {
    if (args[1] === 'list') return '[]';
    if (args[1] === 'create') { creates++; return 'https://github.com/example/repo/pull/2'; }
    if (args[1] === 'view') return JSON.stringify({ state: 'OPEN', headRefOid: 'head', statusCheckRollup: [] });
    if (args[0] === 'workflow') { dispatches++; if (dispatches === 1) throw new Error('temporary network failure'); return ''; }
    throw new Error('Unexpected side effect');
  };
  const first = await monitorPublication(file, { gh, currentBase: 'base' });
  assert.equal(first.status, 'processing'); assert.equal(first.ciDispatched, false); assert.match(first.pullRequest, /pull\/2$/);
  const next = await monitorPublication(first, { gh, currentBase: 'base' });
  assert.equal(next.status, 'processing'); assert.equal(next.ciDispatched, true); assert.equal(creates, 1); assert.equal(dispatches, 2);
});

function refreshBrowser() {
  const values = new Map(), listeners = new Map(), wake = new Map(), loads = [];
  const doc = { visibilityState: 'visible', activeElement: {}, busy: false, hasFocus: () => true,
    querySelector: () => doc.busy ? {} : null,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const browser = { document: doc, navigator: { onLine: true }, sessionStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
    location: { pathname: '/audit', reload: () => loads.push(browser.location.pathname) },
    setTimeout: (fn, delay) => { if (delay === 0) queueMicrotask(fn); return 2; }, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    addEventListener: (name, fn) => wake.set(name, fn), removeEventListener: name => wake.delete(name),
  };
  return { browser, doc, listeners, values, loads };
}
test('new book versions reload as a whole once, preserve the route and avoid storage/offline loops', () => {
  const { browser, loads } = refreshBrowser();
  const options = { revision: 'a'.repeat(20), published: { schemaVersion: 1, revision: 'b'.repeat(20) }, browser, now: 1000 };
  assert.equal(refreshForPublication({ ...options, blocked: true }), false);
  assert.equal(refreshForPublication(options), true); assert.deepEqual(loads, ['/audit']);
  assert.equal(refreshForPublication({ ...options, now: 2000 }), false);
  assert.equal(refreshForPublication({ ...options, published: { schemaVersion: 1, revision: '<invalid>' } }), false);
  browser.navigator.onLine = false; assert.equal(refreshForPublication({ ...options, now: 400000 }), false);
  browser.navigator.onLine = true; browser.sessionStorage.setItem = () => { throw new Error('storage disabled'); };
  assert.equal(refreshForPublication({ ...options, now: 400000 }), false);
});
test('draft edits defer data replacement until navigation; controllers clean up', async () => {
  const { browser, doc, listeners, loads } = refreshBrowser();
  let published = { schemaVersion: 1, revision: 'a'.repeat(20) };
  browser.fetch = async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => published });
  const controller = startPublicationRefresh({ revision: published.revision, browser });
  await new Promise(resolve => setTimeout(resolve, 0));
  listeners.get('input')({ target: { tagName: 'TEXTAREA' } });
  assert.equal(publicationRefreshBlocked(browser), true, 'The existing version-mismatch screen must not unmount a draft');
  published = { schemaVersion: 1, revision: 'b'.repeat(20) };
  await controller.check(); assert.equal(loads.length, 0);
  browser.location.pathname = '/monitor'; await controller.check(); assert.deepEqual(loads, ['/monitor']);
  controller.stop(); assert.equal(listeners.size, 0); assert.equal(publicationRefreshBlocked(browser), false);
  await controller.check(); assert.equal(loads.length, 1);
});
test('upload activity defers refresh, and file selection does not leave a permanent dirty flag', async () => {
  const { browser, doc, listeners, loads } = refreshBrowser();
  browser.fetch = async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ schemaVersion: 1, revision: 'b'.repeat(20) }) });
  doc.busy = true;
  const controller = startPublicationRefresh({ revision: 'a'.repeat(20), browser });
  await new Promise(resolve => setTimeout(resolve, 0));
  listeners.get('change')({ target: { tagName: 'INPUT', type: 'file' } });
  await controller.check(); assert.equal(loads.length, 0);
  doc.busy = false; await controller.check(); assert.equal(loads.length, 1);
  controller.stop();
});
test('unmounting with a pending version request cannot reload a replaced page', async () => {
  const { browser, loads } = refreshBrowser();
  let respond, signal;
  browser.fetch = (_url, options) => { signal = options.signal; return new Promise(resolve => { respond = resolve; }); };
  const controller = startPublicationRefresh({ revision: 'a'.repeat(20), browser });
  controller.stop(); assert.equal(signal.aborted, true);
  respond({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ schemaVersion: 1, revision: 'b'.repeat(20) }) });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(loads.length, 0);
});
