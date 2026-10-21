#!/usr/bin/env node
// Handoff for the upload job. Raw files must already be durably saved under
// source/ in an isolated codex branch. This command touches only its own cache;
// it NEVER uploads, deletes an inbox object, deploys or changes production data.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { argsOf, git, ROOT, verify } from './verify-publication.mjs';
import { digest, stable, documentRevision } from './lib/publication.mjs';

export function sourceFiles(request, root = ROOT) {
  if (request.schemaVersion !== 1 || !Array.isArray(request.files) || !request.files.length) throw new Error('A version 1 request with files is required.');
  return request.files.map(file => {
    if (typeof file.path !== 'string' || !file.path.startsWith('source/') || file.path.split('/').some(p => !p || ['.', '..'].includes(p)) || /[\r\n\\\0]/.test(file.path)) throw new Error('Uploads must name a safe repository path under source/.');
    const absolute = path.resolve(root, file.path), real = fs.realpathSync(absolute);
    if (real !== absolute || !fs.statSync(real).isFile()) throw new Error('An upload cannot be a symbolic link or directory.');
    if (!/\.(pdf|xlsx?|csv|zip)$/i.test(file.path)) throw new Error('Unsupported statement file extension.');
    const sha256 = digest(fs.readFileSync(real));
    if (sha256 !== file.sha256) throw new Error(`Upload checksum mismatch: ${file.path}`);
    return { path: file.path, absolute, sha256 };
  });
}
export function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, stable(data) + '\n', { flag: 'wx' }); fs.renameSync(temporary, file);
}
export function duplicateBytes(files, baseCommit, runGit = git) {
  const known = new Set(runGit(['ls-tree', '-r', '--format=%(objectname)', baseCommit, '--', 'source']).trim().split('\n'));
  return files.every(file => {
    const blob = runGit(['hash-object', '--no-filters', '--', file.absolute]).trim();
    return known.has(blob) && digest(runGit(['cat-file', 'blob', blob], { encoding: 'buffer' })) === file.sha256;
  });
}
export function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Candidate artifacts cannot be symbolic links.');
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}
export function prepare(request, { baseRef = 'origin/main', runStage } = {}) {
  const files = sourceFiles(request), sourceCommit = git(['rev-parse', 'HEAD']).trim();
  const baseCommit = git(['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]).trim();
  const id = digest({ request, baseCommit, sourceCommit });
  const directory = path.join(ROOT, '.cache/statement-jobs', id);
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, 'preparing.lock');
  const fd = fs.openSync(lock, 'wx');
  const status = (state, extra = {}) => atomicJson(path.join(directory, 'status.json'), { schemaVersion: 1, id, state, baseCommit, ...extra });
  try {
    const sealPath = path.join(directory, 'seal.json');
    if (fs.existsSync(sealPath)) return JSON.parse(fs.readFileSync(sealPath, 'utf8'));
    status('processing');
    const audit = path.join(directory, 'audit'), docs = path.join(directory, 'docs'), book = path.join(directory, 'glowData.ts');
    fs.mkdirSync(docs, { recursive: true });
    const env = { ...process.env, GLOW_SOURCE_DIR: path.join(ROOT, 'source'), GLOW_AUDIT_DIR: audit,
      GLOW_CARRY_DIR: path.join(ROOT, 'public/audit'), GLOW_DOCS_DIR: docs, GLOW_BOOK_OUT: book, GLOW_BOOK_REPORT: path.join(docs, 'BOOK-REPORT.md') };
    const stage = runStage ?? ((script) => {
      const log = fs.openSync(path.join(directory, `${path.basename(script)}.log`), 'w');
      try {
        const r = spawnSync(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, env, stdio: ['ignore', log, log] });
        if (r.status !== 0) throw new Error(`${script} failed; inspect its job log.`);
      } finally { fs.closeSync(log); }
    });
    stage('scripts/ingest/inventory.mjs');
    stage('scripts/ingest/extract.mjs');
    const assessment = verify({ baseRef: baseCommit, auditDir: audit, expected: request.expected ?? {} });
    atomicJson(path.join(directory, 'assessment.json'), assessment);
    if (assessment.decision === 'duplicate' || (assessment.decision === 'unchanged' && duplicateBytes(files, baseCommit))) {
      status('duplicate', { assessment: 'assessment.json' });
      return { schemaVersion: 1, id, state: 'duplicate', directory, baseCommit };
    }
    if (assessment.decision === 'unchanged') {
      assessment.decision = 'needs_review';
      assessment.issues.push({ code: 'NO_NEW_DOCUMENTS', document: null, pointer: '', reason: 'The new bytes produced no new normalized document. That is not proof of a duplicate.' });
      atomicJson(path.join(directory, 'assessment.json'), assessment);
    }
    if (assessment.decision !== 'verified') {
      status('needs_review', { assessment: 'assessment.json' });
      return { schemaVersion: 1, id, state: 'needs_review', directory, baseCommit };
    }
    stage('scripts/build-book.mjs');
    // The ordinary source coverage / book-date checks run on the candidate too.
    env.GLOW_BOOK_TS = book;
    stage('scripts/ingest/verify-book.mjs');
    stage('scripts/check-reads.mjs');
    stage('scripts/source-coverage.mjs');
    // Receipts survive ephemeral workers and preserve the upload/expanded-leaf
    // checksums in Git. No password, cookie or environment is serialized.
    const receipt = { schemaVersion: 1, id, baseCommit, sourceCommit, archiveRevision: assessment.candidateRevision,
      files: files.map(({ path, sha256 }) => ({ path, sha256 })),
      documents: assessment.changed.map(key => {
        const d = JSON.parse(fs.readFileSync(path.join(audit, key, 'document.json'), 'utf8'));
        const source = path.resolve(ROOT, d.sourcePath);
        if (!source.startsWith(path.join(ROOT, 'source') + path.sep)) throw new Error('Statement source escaped source/.');
        return { document: key, revision: documentRevision(d), sourcePath: d.sourcePath, sha256: digest(fs.readFileSync(source)) };
      }) };
    atomicJson(path.join(audit, 'deliveries', `${id}.json`), receipt);
    // A retained staging file is never cleared by this backend. Publication is
    // a Git commit and then a PR, using the existing CI/Pages deployment path.
    const artifacts = [
      ...files.map(f => ({ path: f.path, artifact: f.absolute })),
      ...listFiles(audit).map(file => ({ path: `public/audit/${path.relative(audit, file).split(path.sep).join('/')}`, artifact: file })),
      ...listFiles(docs).filter(file => !file.endsWith('.log')).map(file => ({ path: `docs/${path.basename(file)}`, artifact: file })),
      { path: 'src/data/glowData.ts', artifact: book },
    ].map(f => ({ ...f, sha256: digest(fs.readFileSync(f.artifact)) }));
    // Detect an upload or script modifying its inputs while extraction ran.
    sourceFiles(request);
    const seal = { schemaVersion: 1, id, state: 'verified', directory, baseCommit, sourceCommit,
      archiveRevision: assessment.candidateRevision, request, artifacts };
    atomicJson(sealPath, seal); status('verified', { seal: 'seal.json' });
    return seal;
  } catch (error) { status('failed', { reason: error.message }); throw error; }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = argsOf(process.argv.slice(2));
    if (!args.request) throw new Error('Use --request path/to/request.json [--base-ref origin/main].');
    const result = prepare(JSON.parse(fs.readFileSync(args.request, 'utf8')), { baseRef: args['base-ref'] });
    console.log(JSON.stringify({ id: result.id, state: result.state, directory: result.directory }));
    if (result.state === 'needs_review') process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
