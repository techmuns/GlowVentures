// Run by the trusted intake worker on main, never by code from the proposed PR.
// A validated statement delivery can publish without waiting for a code reviewer.
import { git, readBaseline } from '../verify-publication.mjs';
import { assessPublication, digest, documentRevision, stable } from './publication.mjs';
import { reconcile } from '../reconcile.mjs';
import { listEntries, readEntry, isMacMetadata } from './unzip.mjs';
import { describePreview } from '../../../shared/statementPreviewCrypto.mjs';

const generated = new Set([
  'src/data/glowData.ts', 'src/data/reviewColumns.ts', 'src/data/nseSymbols.json', 'src/data/privateProfiles.json',
  ...['BOOK-REPORT.md', 'COST-RECOVERY.md', 'RETURN-COVERAGE.md', 'SECURITY-IDENTIFIERS.md',
    'ingest-inventory.json', 'INGEST-INVENTORY.md', 'extraction-report.json', 'EXTRACTION-REPORT.md'].map(p => `docs/${p}`),
]);
const safePath = p => typeof p === 'string' && !/[\r\n\t\\\0]/.test(p) && !p.split('/').some(x => !x || x === '.' || x === '..');
const statementPath = p => safePath(p) && /^source\/.+\.(pdf|xlsx?|csv|zip)$/i.test(p);
const accountsHeader = '| Provider | Account | Owner | As of | Market value |';
function withoutAccountsTable(bytes) {
  const lines = bytes.toString().split('\n'), starts = lines.flatMap((l, i) => l === accountsHeader ? [i] : []);
  if (starts.length !== 1 || lines[starts[0] + 1] !== '| --- | --- | --- | --- | ---: |') throw new Error('Invalid generated accounts table.');
  let end = starts[0] + 2;
  while (lines[end]?.startsWith('|')) end++;
  return [...lines.slice(0, starts[0]), ...lines.slice(end)].join('\n');
}
// Match inventory's nested ZIP destinations without writing any extracted files.
function expandedSources(files, read) {
  const sources = new Map();
  const add = (name, bytes, depth = 0) => {
    if (!safePath(name) || depth > 6) throw new Error('Unsafe or excessively nested statement archive.');
    if (sources.has(name) && digest(sources.get(name)) !== digest(bytes)) throw new Error('Conflicting archive member bytes.');
    sources.set(name, bytes);
    if (!/\.zip$/i.test(name)) return;
    const dest = (name.startsWith('source/_extracted/') ? name : name.replace(/^source\//, 'source/_extracted/')).replace(/\.zip$/i, '');
    for (const entry of listEntries(bytes)) {
      if (entry.name.endsWith('/') || isMacMetadata(entry.name)) continue;
      const member = entry.name.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^[a-zA-Z]:/, '');
      if (!safePath(member)) throw new Error('Unsafe statement archive member.');
      add(`${dest}/${member}`, readEntry(bytes, entry), depth + 1);
    }
  };
  for (const file of files) {
    if (!statementPath(file.path)) throw new Error('Invalid receipt source path.');
    const bytes = read(file.path);
    if (digest(bytes) !== file.sha256) throw new Error(`Upload checksum mismatch: ${file.path}`);
    add(file.path, bytes);
  }
  return sources;
}
export function verifyAutomaticPublication(file, { runGit = git, fetchHead = true } = {}) {
  if (!/^codex\/statement-delivery-[a-f0-9]{16}$/.test(file.branch)
    || !/^[a-f0-9]{40}$/.test(file.commit) || !/^[a-f0-9]{40}$/.test(file.baseCommit)) throw new Error('Invalid verified delivery identity.');
  if (fetchHead) runGit(['fetch', '--no-tags', 'origin', `refs/heads/${file.branch}`]);
  const parents = runGit(['rev-list', '--parents', '-n', '1', file.commit]).trim().split(/\s+/);
  if (parents.length !== 2 || parents[1] !== file.baseCommit) throw new Error('Automatic publication requires one data commit on the verified base.');
  const read = p => runGit(['show', `${file.commit}:${p}`], { encoding: null });
  const diff = runGit(['diff', '--raw', '-z', '--no-abbrev', '--no-renames', file.baseCommit, file.commit]).split('\0');
  const changes = new Map();
  for (let i = 0; i < diff.length - 1; i += 2) {
    const m = /^:(\d+) (\d+) [a-f0-9]+ [a-f0-9]+ ([AMD])$/.exec(diff[i]), p = diff[i + 1];
    if (!m || !safePath(p) || (m[1] !== '100644' && m[1] !== '000000') || (m[2] !== '100644' && m[2] !== '000000')) throw new Error('Unexpected delivery change or file mode.');
    const audit = /^public\/audit\/(?:manifest\.json|[a-zA-Z0-9][a-zA-Z0-9._-]*\/[^/]+\.json)$/.test(p);
    const preview = /^public\/statement-previews\/[a-f0-9]{64}\.bin$/.test(p);
    if (!(generated.has(p) || p === 'CLAUDE.md' || audit || preview || statementPath(p))) throw new Error(`Automatic statement publication cannot change code or policy: ${p}`);
    if (preview && m[3] !== 'A') throw new Error('A delivery cannot overwrite or delete an earlier statement preview.');
    if (m[3] === 'D' && (!audit || p.startsWith('public/audit/deliveries/'))) throw new Error('A delivery cannot delete source, receipts or generated book files.');
    if (p.startsWith('source/') && m[3] !== 'A') throw new Error('A delivery cannot overwrite earlier statement bytes.');
    if (p === 'CLAUDE.md' && withoutAccountsTable(read(p)) !== withoutAccountsTable(runGit(['show', `${file.baseCommit}:${p}`], { encoding: null }))) throw new Error('A statement delivery cannot change repository instructions.');
    changes.set(p, m[3]);
  }
  const receipts = [...changes].filter(([p, status]) => p.startsWith('public/audit/deliveries/') && status === 'A');
  if (receipts.length !== 1) throw new Error('A delivery requires one new immutable checksum receipt.');
  const [receiptPath] = receipts[0], receipt = JSON.parse(read(receiptPath)), { id, ...body } = receipt;
  if (receipt.schemaVersion !== 1 || digest(body) !== id || receiptPath !== `public/audit/deliveries/${id}.json`
    || file.branch !== `codex/statement-delivery-${id.slice(0, 16)}` || receipt.baseCommit !== file.baseCommit
    || receipt.archiveRevision !== file.archiveRevision || !receipt.files?.length || !receipt.documents?.length) throw new Error('Delivery receipt does not match the prepared publication.');
  if ([...changes].some(([p]) => p.startsWith('public/audit/deliveries/') && p !== receiptPath)) throw new Error('Earlier delivery receipts are immutable.');
  const uploaded = receipt.files.map(f => f.path).sort(), addedSources = [...changes.keys()].filter(p => p.startsWith('source/')).sort();
  if (stable(uploaded) !== stable(addedSources)) throw new Error('Source changes must exactly match the receipted uploads.');
  const baseline = readBaseline(file.baseCommit, runGit).documents, candidate = readBaseline(file.commit, runGit).documents;
  const assessment = assessPublication({ baseline, documents: candidate,
    baselineReport: reconcile(structuredClone(baseline)), report: reconcile(structuredClone(candidate)) });
  if (assessment.decision !== 'verified' || assessment.candidateRevision !== receipt.archiveRevision) throw new Error(`Statement data needs review: ${assessment.issues.map(i => i.code).join(', ') || assessment.decision}`);
  const sources = expandedSources(receipt.files, read), byKey = new Map(candidate.map(d => [d.docKey, d]));
  // A new statement can deterministically update an older document's stitching
  // or twin links. Those records retain their immutable earlier source bytes.
  const retained = runGit(['ls-tree', '-r', '--name-only', '-z', file.baseCommit, '--', 'source']).split('\0').filter(Boolean);
  const readRetained = p => runGit(['show', `${file.baseCommit}:${p}`], { encoding: null });
  const sourceBytes = p => {
    if (sources.has(p)) return sources.get(p);
    if (retained.includes(p) && statementPath(p)) return readRetained(p);
    for (const zip of retained.filter(f => /\.zip$/i.test(f) && p.startsWith(f.replace(/^source\//, 'source/_extracted/').replace(/\.zip$/i, '') + '/'))) {
      const bytes = readRetained(zip);
      for (const [name, data] of expandedSources([{ path: zip, sha256: digest(bytes) }], () => bytes)) sources.set(name, data);
    }
    return sources.get(p);
  };
  const expected = assessment.changed.map(key => {
    const d = byKey.get(key), bytes = sourceBytes(d.sourcePath);
    if (!bytes) throw new Error(`Changed document has no retained or uploaded source evidence: ${key}`);
    return { document: key, revision: documentRevision(d), sourcePath: d.sourcePath, sha256: digest(bytes) };
  });
  const sorted = values => [...values].sort((a, b) => a.document.localeCompare(b.document));
  if (stable(sorted(expected)) !== stable(sorted(receipt.documents))
    || stable(sorted(expected.map(({ document, revision }) => ({ document, revision })))) !== stable(sorted(file.documentVersions ?? []))) throw new Error('Receipt document rows or versions do not match verified source bytes.');
  for (const p of changes.keys()) {
    if (!p.startsWith('public/statement-previews/')) continue;
    const originalHash = p.split('/').pop().slice(0, -4);
    if (!expected.some(d => d.sha256 === originalHash)) throw new Error('Statement preview must be bound to a verified source document.');
    describePreview(read(p));
  }
  return { commit: file.commit, archiveRevision: assessment.candidateRevision, documents: expected.length };
}
