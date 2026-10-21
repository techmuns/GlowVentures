#!/usr/bin/env node
// Read-only verification. Used by the upload worker, delivery preparer and CI.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessPublication, safeKey, stable } from './lib/publication.mjs';
import { reconcile } from './reconcile.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function git(args, options = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr?.toString().trim() ?? r.error?.message}`);
  return r.stdout;
}
export function readArchive(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('An empty archive cannot replace the verified book.');
  return manifest.map(entry => {
    if (!safeKey(entry.docKey)) throw new Error('Unsafe document key in manifest');
    const doc = JSON.parse(fs.readFileSync(path.join(directory, entry.docKey, 'document.json'), 'utf8'));
    for (const k of ['docKey', 'provider', 'accountNo', 'ownerId', 'asOf', 'sourcePath', 'status']) {
      if ((doc[k] ?? null) !== (entry[k] ?? null)) throw new Error(`Archive identity disagreement: ${entry.docKey}/${k}`);
    }
    return doc;
  });
}
export function readBaseline(ref, runGit = git) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.startsWith('-')) throw new Error('Invalid baseline ref');
  const commit = runGit(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const manifest = JSON.parse(runGit(['show', `${commit}:public/audit/manifest.json`]));
  if (!Array.isArray(manifest) || !manifest.length || manifest.some(d => !safeKey(d.docKey))) throw new Error('Invalid baseline archive');
  const names = manifest.map(d => `${commit}:public/audit/${d.docKey}/document.json`);
  const data = runGit(['cat-file', '--batch'], { input: names.join('\n') + '\n', encoding: 'buffer' });
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let offset = 0;
  const documents = [];
  for (const name of names) {
    const end = bytes.indexOf(10, offset), header = bytes.subarray(offset, end).toString();
    if (!/^[a-f0-9]+ blob \d+$/.test(header)) throw new Error(`Missing baseline statement: ${name}`);
    const length = Number(header.split(' ')[2]);
    offset = end + 1;
    documents.push(JSON.parse(bytes.subarray(offset, offset + length).toString()));
    offset += length + 1;
  }
  return { commit, documents };
}
export function verify({ baseRef = 'origin/main', auditDir = path.join(ROOT, 'public/audit'), expected = {} } = {}) {
  const baseline = readBaseline(baseRef), documents = readArchive(auditDir);
  const result = assessPublication({ baseline: baseline.documents, documents, expected,
    baselineReport: reconcile(structuredClone(baseline.documents)), report: reconcile(structuredClone(documents)) });
  return { ...result, baseCommit: baseline.commit };
}
export function argsOf(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z-]+$/.test(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Expected --option value: ${args[i]}`);
    out[args[i].slice(2)] = args[i + 1];
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = argsOf(process.argv.slice(2));
    const expected = args.request ? JSON.parse(fs.readFileSync(path.resolve(args.request), 'utf8')).expected ?? {} : {};
    const result = verify({ baseRef: args['base-ref'] ?? process.env.GLOW_PUBLICATION_BASE ?? 'origin/main', auditDir: args.audit ? path.resolve(args.audit) : undefined, expected });
    if (args.out) { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(args.out, stable(result) + '\n'); }
    console.log(JSON.stringify({ decision: result.decision, changedDocuments: result.changed.length, issues: result.issues, duplicates: result.duplicates }, null, 2));
    // A duplicate is a completed intake, but MUST NOT be published as extra rows.
    if (!['verified', 'unchanged'].includes(result.decision)) process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
