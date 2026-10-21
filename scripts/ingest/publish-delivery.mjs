#!/usr/bin/env node
// Atomic publication uses a Git tree/commit. There is no sequence of overwrites
// to the live book. A stale base, changed artifact or failed check publishes none.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { argsOf, git, ROOT, verify } from './verify-publication.mjs';
import { sourceFiles, atomicJson } from './prepare-delivery.mjs';
import { digest } from './lib/publication.mjs';

const permitted = name => !/[\r\n\t\\\0]/.test(name) && !name.split('/').some(p => !p || ['.', '..'].includes(p))
  && (name.startsWith('source/') || name.startsWith('public/audit/') || /^docs\/[A-Za-z0-9._-]+$/.test(name) || name === 'src/data/glowData.ts');
export function checkSeal(seal, { currentBase, read = file => fs.readFileSync(file) } = {}) {
  if (seal.schemaVersion !== 1 || seal.state !== 'verified' || !/^[a-f0-9]{64}$/.test(seal.id) || !Array.isArray(seal.artifacts) || !seal.artifacts.length) throw new Error('Only a verified delivery seal can be published.');
  if (currentBase !== seal.baseCommit) throw new Error('STALE_BASE: the verified book changed; prepare the delivery against the new main.');
  const seen = new Set();
  const objects = new Map();
  for (const file of seal.artifacts) {
    if (!permitted(file.path) || seen.has(file.path)) throw new Error('Invalid or duplicate publication path.');
    seen.add(file.path);
    const bytes = read(file.artifact);
    if (digest(bytes) !== file.sha256) throw new Error(`ARTIFACT_CHANGED: ${file.path}`);
    objects.set(file.path, createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'));
  }
  if (!seen.has('src/data/glowData.ts') || !seen.has('public/audit/manifest.json')) throw new Error('Publication must include the complete book and archive manifest.');
  return objects;
}
export function commitDelivery(seal, { runGit = git, indexPath } = {}) {
  const objects = checkSeal(seal, { currentBase: seal.baseCommit });
  const branch = `codex/statement-delivery-${seal.id.slice(0, 16)}`;
  const env = { ...process.env, GIT_INDEX_FILE: indexPath ?? path.join(seal.directory, `publish-${process.pid}.index`) };
  try {
    runGit(['read-tree', seal.sourceCommit], { env });
    const entries = [];
    for (let i = 0; i < seal.artifacts.length; i += 50) {
      const batch = seal.artifacts.slice(i, i + 50);
      const hashes = runGit(['hash-object', '-w', '--no-filters', '--', ...batch.map(f => f.artifact)]).trim().split('\n');
      batch.forEach((file, n) => {
        if (hashes[n] !== objects.get(file.path)) throw new Error(`ARTIFACT_CHANGED during publication: ${file.path}`);
        entries.push(`100644 ${hashes[n]}\t${file.path}\0`);
      });
    }
    runGit(['update-index', '-z', '--index-info'], { env, input: entries.join('') });
    const tree = runGit(['write-tree'], { env }).trim();
    let commit;
    try {
      const existing = runGit(['rev-parse', '--verify', `refs/heads/${branch}`]).trim();
      if (runGit(['rev-parse', `${existing}^{tree}`]).trim() !== tree) throw new Error('Delivery branch already exists with different data.');
      commit = existing;
    } catch (error) {
      if (!String(error.message).includes('git rev-parse failed')) throw error;
      commit = runGit(['commit-tree', tree, '-p', seal.sourceCommit], { input: `Publish verified statement delivery ${seal.id.slice(0, 16)}\n\nArchive revision: ${seal.archiveRevision}\n` }).trim();
      runGit(['update-ref', `refs/heads/${branch}`, commit, '0'.repeat(40)]);
    }
    return { branch, commit };
  } finally { if (fs.existsSync(env.GIT_INDEX_FILE)) fs.unlinkSync(env.GIT_INDEX_FILE); }
}
export function publish(seal, { push = false } = {}) {
  if (push) git(['fetch', 'origin', 'main']);
  const currentBase = git(['rev-parse', 'origin/main']).trim();
  checkSeal(seal, { currentBase }); sourceFiles(seal.request);
  const assessment = verify({ baseRef: seal.baseCommit, auditDir: path.join(seal.directory, 'audit'), expected: seal.request.expected ?? {} });
  if (assessment.decision !== 'verified' || assessment.candidateRevision !== seal.archiveRevision) throw new Error('Candidate no longer passes publication validation.');
  if (git(['merge-base', seal.baseCommit, seal.sourceCommit]).trim() !== seal.baseCommit) throw new Error('Candidate is not based on the verified book.');
  const lock = path.join(seal.directory, 'publishing.lock'), fd = fs.openSync(lock, 'wx');
  try {
    const { branch, commit } = commitDelivery(seal);
    const result = { schemaVersion: 1, id: seal.id, state: 'prepared_pr', branch, commit, archiveRevision: seal.archiveRevision };
    atomicJson(path.join(seal.directory, 'publication.json'), result);
    if (push) {
      // An isolated codex branch only. Existing CI and Pages handle publication.
      git(['push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`]);
      const gh = args => {
        const r = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', env: process.env });
        if (r.status !== 0) throw new Error(`GitHub publication failed: ${r.stderr?.trim()}`);
        return r.stdout.trim();
      };
      const body = path.join(seal.directory, 'pull-request.md');
      fs.writeFileSync(body, `Publish a complete verified statement delivery. Owner/account/security matching and format/field coverage checks passed; no new unresolved reconciliation findings were accepted.\n\nArchive revision: ${seal.archiveRevision}\n\nRequired CI re-extracts the source, regenerates the book, checks statement publication and tests the dashboard. Merge follows repository review and branch-protection requirements; Pages publishes the merged commit.\n`);
      const existing = JSON.parse(gh(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'url']));
      const url = existing[0]?.url ?? gh(['pr', 'create', '--base', 'main', '--head', branch, '--title', `Publish verified statement delivery ${seal.id.slice(0, 12)}`, '--body-file', body]);
      result.pullRequest = url; result.state = 'awaiting_ci_and_review';
      atomicJson(path.join(seal.directory, 'publication.json'), result);
    }
    return result;
  } finally {
    fs.closeSync(fd); fs.unlinkSync(lock);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = argsOf(process.argv.slice(2));
    if (!args.seal) throw new Error('Use --seal .cache/statement-jobs/<id>/seal.json [--push true].');
    const result = publish(JSON.parse(fs.readFileSync(args.seal, 'utf8')), { push: args.push === 'true' });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
