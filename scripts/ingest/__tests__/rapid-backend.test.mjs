import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { githubStatementReader } from '../../../shared/githubStatementBackend.mjs';
import { sameFinancialStatement } from '../lib/publication.mjs';
import { onRequestGet as statementData } from '../../../functions/api/statement-data/[[path]].js';
import { runtimeStore } from '../runtime-store.mjs';
import { gitPublicationStore } from '../git-publication-store.mjs';
import { inboxService, writeControl } from '../../dev/statement-e2e-git.mjs';
import { queuedFiles, waitingStatementFiles, makeBatch } from '../../../shared/statementInbox.mjs';

const sha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const rev = 'd'.repeat(20), reader = 'e'.repeat(64);
const fixture = (extra = {}) => ({ revision: rev, readerRevision: reader, baseCommit: 'f'.repeat(40), originals: {}, ...extra });
const receipt = { id: 'fixture', completedAt: '2026-10-27T00:00:00Z', files: [] };
const empty = { head: null, tree: null, state: null };
const encoded = JSON.stringify;

test('several account statements in one PDF retain one unambiguous original in the Git tree', async () => {
  let tree, message;
  const store = runtimeStore({ token: 'isolated-test-only', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/git/blobs')) return Response.json({ sha: sha(Buffer.from(body.content, 'base64')) });
    if (url.endsWith('/git/trees')) { tree = body.tree; return Response.json({ sha: 'b'.repeat(40) }); }
    if (url.endsWith('/git/commits')) { message = body.message; return Response.json({ sha: 'c'.repeat(40) }); }
    if (url.endsWith('/git/refs')) return Response.json({ object: { sha: 'c'.repeat(40) } });
    throw Error('Unexpected Git operation');
  } });
  const original = { sourcePath: 'source/uploads-rapid-fixture/accounts.pdf', blob: 'a'.repeat(40) };
  await store.publish(empty, fixture({ originals: { accountA: original, accountB: { ...original } } }), receipt);
  assert.equal(tree.filter(entry => entry.path === original.sourcePath).length, 1);
  assert.match(message, /^\[CF-Pages-Skip\]/, 'Data publication must not start a Pages build');
  tree = null;
  await assert.rejects(store.publish(empty, fixture({ originals: { accountA: original, accountB: { ...original, blob: 'f'.repeat(40) } } }), receipt), /Conflicting original source bytes/);
  assert.equal(tree, null);
});

test('the Pages gateway discovers first GitHub data without a deployment and keeps credentials server-side', async () => {
  const files = new Map(); let calls = 0;
  const env = { GLOW_GITHUB_TOKEN: 'isolated-test-only', ASSETS: { fetch: async () => Response.json({ revision: 'a'.repeat(20) }) } };
  const fetchImpl = async (url, init) => {
    calls++; assert.equal(init.headers.Authorization, `Bearer ${env.GLOW_GITHUB_TOKEN}`);
    assert.ok(!url.includes(env.GLOW_GITHUB_TOKEN)); assert.equal(init.method, undefined, 'Delivery is read-only');
    const name = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]), content = files.get(name);
    return content ? new Response(content) : new Response(null, { status: 404 });
  };
  for (const path of [[], '', undefined]) {
    const request = new Request('https://dashboard.test/api/statement-data');
    assert.equal((await statementData({ env: {}, request, params: { path } }, fetchImpl)).status, 204);
    const response = await statementData({ env, request, params: { path } }, fetchImpl);
    assert.equal(response.status, 204); assert.equal(response.headers.get('X-Glow-Statement-Storage'), 'github');
  }
  const status = await statementData({ env, request: new Request('https://dashboard.test/api/statement-data?status=1'), params: {} }, fetchImpl);
  assert.equal((await status.json()).revision, 'a'.repeat(20));
  files.set('current.json', JSON.stringify({ schemaVersion: 1, storage: 'github-actions-v1', revision: rev, readerRevision: reader, receipts: {} }));
  files.set(`views/${rev}/bootstrap.json`, encoded({ revision: rev }));
  const response = await statementData({ env, request: new Request('https://dashboard.test/api/statement-data'), params: {} }, fetchImpl);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { revision: rev });
  const scoped = githubStatementReader(env, fetchImpl); const before = calls;
  await Promise.all([scoped.state(), scoped.state()]); assert.equal(calls - before, 1, 'One pointer read per request');
  const brokenFetch = async () => new Response('unavailable', { status: 503 });
  assert.equal((await statementData({ env, request: new Request('https://dashboard.test/api/statement-data'), params: {} }, brokenFetch)).status, 503);
});

test('atomic Git pack publication leaves the checkout untouched, preserves history and refuses races', async () => {
  const root = process.cwd(), output = fs.mkdtempSync(path.join(root, '.cache/github-publisher-test-'));
  const remote = path.join(output, 'local-remote.git'), publisher = path.join(output, 'publisher.git'), control = path.join(output, 'control.json');
  for (const dir of [remote, publisher]) execFileSync('git', ['init', '--bare', dir], { stdio: 'ignore' });
  writeControl(control, { dispatches: 0 });
  const fetchImpl = inboxService({ remote, stateFile: control, dispatched: () => { throw Error('No dispatch from a publication'); } });
  const indexBefore = execFileSync('git', ['diff', '--cached']).toString();
  const branchBefore = execFileSync('git', ['branch', '--show-current']).toString();
  const options = { root, remote, gitDir: publisher, token: 'test-only', repo: 'local/statement-test', fetchImpl,
    materialize: async snapshot => [{ path: `views/${snapshot.revision}/bootstrap.json`, mode: '100644', type: 'blob', content: encoded({ revision: snapshot.revision }) }] };
  const store = gitPublicationStore(options);
  const original = Buffer.from('exact source bytes'), blob = await store.putBlob(original);
  const first = await store.publish(empty, fixture({ originals: { fixture: { sourcePath: 'source/uploads-rapid-fixture/with spaces.pdf', blob } } }), receipt);
  assert.equal(first.state.storage, 'github-actions-v1');
  assert.equal((await store.load(first.state)).revision, rev);
  const nextPublisher = path.join(output, 'fresh-publisher.git');
  execFileSync('git', ['init', '--bare', nextPublisher], { stdio: 'ignore' });
  const recovered = gitPublicationStore({ ...options, gitDir: nextPublisher });
  const second = await recovered.publish(first, fixture({ revision: 'b'.repeat(20) }), { ...receipt, id: 'second' });
  assert.equal((await store.loadVersion(rev)).revision, rev);
  await assert.rejects(store.publish(first, fixture({ revision: 'c'.repeat(20) }), { ...receipt, id: 'race' }), /newer publication/);
  assert.equal((await store.read()).head, second.head);
  assert.equal(execFileSync('git', ['diff', '--cached']).toString(), indexBefore);
  assert.equal(execFileSync('git', ['branch', '--show-current']).toString(), branchBefore);
  const read = githubStatementReader({ GLOW_GITHUB_TOKEN: 'test-only', GLOW_GITHUB_REPO: 'local/statement-test' }, fetchImpl);
  assert.deepEqual(await (await read.request(`/views/${rev}/bootstrap.json`)).json(), { revision: rev });
});

test('a later static copy cannot erase a previously verified financial row', () => {
  const before = { docKey: 'fixture', sourcePath: 'source/new.pdf', status: 'ok', warnings: [],
    cashFlows: [{ date: '2026-10-01', amount: 1, source: 'fixture' }, { date: '2026-10-02', amount: 2, source: 'fixture' }] };
  assert.equal(sameFinancialStatement(before, { ...before, sourcePath: 'source/later.pdf', warnings: [{ code: 'pdf-encrypted' }], pages: 4 }), true);
  assert.equal(sameFinancialStatement(before, { ...before, cashFlows: before.cashFlows.slice(0, 1) }), false);
});

test('the full reader cannot claim GitHub processing work', () => {
  const batch = makeBatch('20261027T100001Z-test', [{ name: 'statement.pdf', size: 12, blob: 'a'.repeat(40) }]);
  batch.files[0].processor = 'github';
  for (const status of ['queued', 'processing']) {
    batch.files[0].status = status;
    assert.equal(queuedFiles({ batches: [batch] }).length, 0);
    assert.equal(waitingStatementFiles({ batches: [batch] }).length, 0);
  }
});

test('an existing compiled browser keeps polling GitHub when no data publication exists yet', async () => {
  const { build } = await import('esbuild');
  const bundle = await build({ entryPoints: ['src/lib/runtimeBook.ts'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error' });
  const browser = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 204, headers: { 'X-Glow-Statement-Storage': 'github' } });
    await browser.bootstrapRuntimeBook();
    assert.equal(browser.publicationDiscoveryPath, '/api/statement-data?status=1');
    assert.equal(browser.bootstrapWarning, false);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await browser.bootstrapRuntimeBook();
    assert.equal(browser.publicationDiscoveryPath, '/publication.json', 'Unconfigured previews retain static discovery');
  } finally { globalThis.fetch = originalFetch; }
});
