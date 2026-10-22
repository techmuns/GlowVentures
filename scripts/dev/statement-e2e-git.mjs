// Local GitHub service boundary for the upload browser rehearsal. The upload
// handler and intake runner are real; these REST/CLI operations write only an
// isolated bare Git repository under this checkout's ignored .cache directory.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyAutomaticPublication } from '../ingest/lib/automaticPublication.mjs';
export function localGit(remote) {
  assert.ok(path.isAbsolute(remote) && remote.includes('/.cache/') && remote.endsWith('/local-remote.git'));
  return (args, input, env = {}) => execFileSync('git', ['--git-dir', remote, ...args], {
    input, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Local upload test', GIT_AUTHOR_EMAIL: 'test@invalid.example',
      GIT_COMMITTER_NAME: 'Local upload test', GIT_COMMITTER_EMAIL: 'test@invalid.example', ...env },
  }).trim();
}
export const readControl = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeControl = (file, value) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); };
export function inboxService({ remote, stateFile, dispatched }) {
  const git = localGit(remote);
  const reply = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const maybe = args => { try { return git(args); } catch { return null; } };
  const blob = bytes => git(['hash-object', '-w', '--stdin'], bytes);
  return async (url, init = {}) => {
    const u = new URL(url); assert.equal(u.origin, 'https://api.github.com');
    assert.ok(u.pathname.startsWith('/repos/local/statement-test/'));
    const p = decodeURIComponent(u.pathname.slice('/repos/local/statement-test'.length));
    const method = init.method ?? 'GET';
    const raw = init.body instanceof Blob ? await init.body.text() : init.body;
    const body = raw ? JSON.parse(raw) : null;
    if (method === 'GET' && p === '/git/ref/heads/statement-inbox') {
      const sha = maybe(['rev-parse', '--verify', 'refs/heads/statement-inbox']); return sha ? reply(200, { object: { sha } }) : reply(404, {});
    }
    if (method === 'GET' && p.startsWith('/git/commits/')) {
      const sha = p.split('/').at(-1); return reply(200, { sha, tree: { sha: git(['rev-parse', sha + '^{tree}']) } });
    }
    if (method === 'GET' && p.startsWith('/contents/')) {
      const name = p.slice('/contents/'.length), ref = u.searchParams.get('ref');
      const sha = maybe(['rev-parse', ref + ':' + name]);
      return sha ? reply(200, { sha, content: Buffer.from(git(['show', ref + ':' + name])).toString('base64') }) : reply(404, {});
    }
    if (method === 'POST' && p === '/git/blobs') return reply(201, { sha: blob(Buffer.from(body.content, 'base64')) });
    if (method === 'POST' && p === '/git/trees') {
      const index = path.join(path.dirname(remote), 'index-' + randomUUID()), env = { GIT_INDEX_FILE: index };
      try {
        git(body.base_tree ? ['read-tree', body.base_tree] : ['read-tree', '--empty'], undefined, env);
        const entries = body.tree.map(e => (e.sha === null ? '0 ' + '0'.repeat(40) : e.mode + ' ' + (e.content !== undefined ? blob(e.content) : e.sha)) + '\t' + e.path + '\0').join('');
        git(['update-index', '-z', '--index-info'], entries, env);
        return reply(201, { sha: git(['write-tree'], undefined, env) });
      } finally { fs.rmSync(index, { force: true }); }
    }
    if (method === 'POST' && p === '/git/commits') return reply(201, { sha: git(['commit-tree', body.tree, ...body.parents.flatMap(p => ['-p', p])], body.message) });
    if ((method === 'PATCH' && p === '/git/refs/heads/statement-inbox') || (method === 'POST' && p === '/git/refs')) {
      if (body.ref) assert.equal(body.ref, 'refs/heads/statement-inbox');
      const old = maybe(['rev-parse', '--verify', 'refs/heads/statement-inbox']);
      if (old && (method === 'POST' || maybe(['merge-base', '--is-ancestor', old, body.sha]) === null)) return reply(422, {});
      git(['update-ref', 'refs/heads/statement-inbox', body.sha, old ?? '0'.repeat(40)]); return reply(method === 'POST' ? 201 : 200, {});
    }
    if (method === 'POST' && p === '/dispatches') {
      const c = readControl(stateFile); c.dispatches++; writeControl(stateFile, c);
      dispatched(); return reply(204, null);
    }
    throw new Error('Unexpected local inbox REST call: ' + method + ' ' + p);
  };
}
export function cli() {
  const file = process.env.GLOW_E2E_CONTROL;
  assert.ok(file?.includes('/.cache/') && path.isAbsolute(file));
  const c = readControl(file), git = localGit(c.remote), args = process.argv.slice(2);
  const option = name => args[args.indexOf(name) + 1];
  const out = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
  if (args[0] === 'repo') return out({ nameWithOwner: 'local/statement-test' });
  if (args[0] === 'api') return out({ data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } } } } } });
  if (args[0] === 'workflow') { c.ciRequested = true; writeControl(file, c); return; }
  if (args[0] !== 'pr') throw new Error('Unexpected local GitHub command');
  if (args[1] === 'list') return out(c.pr && c.pr.branch === option('--head') ? [{ url: c.pr.url }] : []);
  if (args[1] === 'create') {
    const branch = option('--head'); assert.match(branch, /^codex\/statement-delivery-[a-f0-9]{16}$/);
    c.pr = { number: 1, url: 'https://local-only.invalid/pull/1', branch, state: 'OPEN', headRefOid: git(['rev-parse', 'refs/heads/' + branch]),
      reviewDecision: '', reviews: [], comments: [], statusCheckRollup: ['build', 'statements'].map(name => ({ name, status: 'IN_PROGRESS' })) };
    writeControl(file, c); return out(c.pr.url);
  }
  if (args[1] === 'view') return out(c.pr);
  if (args[1] === 'close') { c.pr.state = 'CLOSED'; writeControl(file, c); return; }
  if (args[1] === 'merge') {
    assert.equal(option('--match-head-commit'), c.pr.headRefOid);
    assert.ok(c.ciPassed, 'The real candidate checks must complete before merge');
    const receiptName = git(['diff', '--name-only', c.baseCommit, c.pr.headRefOid, '--', 'public/audit/deliveries']).trim();
    const receipt = JSON.parse(git(['show', `${c.pr.headRefOid}:${receiptName}`]));
    const proof = verifyAutomaticPublication({ branch: c.pr.branch, commit: c.pr.headRefOid, baseCommit: c.baseCommit,
      archiveRevision: receipt.archiveRevision, documentVersions: receipt.documents.map(({ document, revision }) => ({ document, revision })) }, {
      fetchHead: false, runGit: (args, options = {}) => execFileSync('git', ['--git-dir', c.remote, ...args], { encoding: 'utf8', maxBuffer: 128 << 20, ...options }),
    });
    assert.equal(proof.commit, c.pr.headRefOid);
    git(['update-ref', 'refs/heads/' + c.publishedBranch, c.pr.headRefOid, c.baseCommit]);
    c.pr.state = 'MERGED'; c.pr.mergeCommit = { oid: c.pr.headRefOid }; c.merges++;
    writeControl(file, c); return;
  }
  throw new Error('Unexpected local PR command');
}
