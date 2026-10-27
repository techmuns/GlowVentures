import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { rapidStatementRequest, rapidStatementsEnabled } from '../../../shared/rapidStatementBackend.mjs';
import { sameFinancialStatement } from '../lib/publication.mjs';
import { onRequestGet as statementData } from '../../../functions/api/statement-data/[[path]].js';
import { runtimeStore } from '../runtime-store.mjs';

test('several account statements in one PDF retain one unambiguous original in the Git tree', async () => {
  let tree;
  const store = runtimeStore({ token: 'isolated-test-only', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/git/blobs')) {
      const bytes = Buffer.from(body.content, 'base64');
      return Response.json({ sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') });
    }
    if (url.endsWith('/git/trees')) { tree = body.tree; return Response.json({ sha: 'b'.repeat(40) }); }
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'c'.repeat(40) });
    if (url.endsWith('/git/refs')) return Response.json({ object: { sha: 'c'.repeat(40) } });
    throw Error('Unexpected Git operation');
  } });
  const original = { sourcePath: 'source/uploads-rapid-fixture/accounts.pdf', blob: 'a'.repeat(40) };
  const snapshot = { revision: 'd'.repeat(20), readerRevision: 'e'.repeat(64), originals: { accountA: original, accountB: { ...original } } };
  const previous = { head: null, tree: null, state: null }, receipt = { id: 'fixture', completedAt: '2026-10-27T00:00:00Z', files: [] };
  await store.publish(previous, snapshot, receipt);
  assert.equal(tree.filter(entry => entry.path === original.sourcePath).length, 1);
  assert.equal(new Set(tree.map(entry => entry.path)).size, tree.length);
  tree = null;
  await assert.rejects(store.publish(previous, { ...snapshot, originals: { ...snapshot.originals, accountB: { ...original, blob: 'f'.repeat(40) } } }, receipt), /Conflicting original source bytes/);
  assert.equal(tree, null, 'Conflicting originals cannot create or promote a publication tree');
});

test('the optional Pages catch-all serves bootstrap and status at the bare directory', async () => {
  for (const path of [[], '', undefined]) {
    const request = new Request('https://dashboard.test/api/statement-data');
    assert.equal((await statementData({ env: {}, request, params: { path } })).status, 204);
  }
  for (const [query, expected] of [['', '/bootstrap'], ['?status=1', '/current']]) {
    const env = { GLOW_RAPID_STATEMENTS_ENABLED: 'true', GLOW_RAPID_STATEMENTS_TOKEN: 'test-only-private-credential-at-least-32-characters',
      GLOW_RAPID_STATEMENTS: { fetch: async request => {
        assert.equal(new URL(request.url).pathname, expected);
        return Response.json({ revision: 'a'.repeat(20) });
      } } };
    const response = await statementData({ env, request: new Request('https://dashboard.test/api/statement-data' + query), params: { path: [] } });
    assert.equal(response.status, 200); assert.equal((await response.json()).revision, 'a'.repeat(20));
  }
});

test('a later static copy cannot erase a previously verified financial row', () => {
  const before = { docKey: 'fixture', sourcePath: 'source/new.pdf', status: 'ok', warnings: [],
    cashFlows: [{ date: '2026-10-01', amount: 1, source: 'fixture' }, { date: '2026-10-02', amount: 2, source: 'fixture' }] };
  assert.equal(sameFinancialStatement(before, { ...before, sourcePath: 'source/later.pdf', warnings: [{ code: 'pdf-encrypted' }], pages: 4 }), true);
  assert.equal(sameFinancialStatement(before, { ...before, cashFlows: before.cashFlows.slice(0, 1) }), false);
});

test('a private service binding preserves the request and never exposes its credential in the URL', async () => {
  let received;
  const token = 'test-only-private-credential-at-least-32-characters';
  const response = await rapidStatementRequest({ GLOW_RAPID_STATEMENTS_ENABLED: 'true', GLOW_RAPID_STATEMENTS_TOKEN: token,
    GLOW_RAPID_STATEMENTS: { fetch: async request => { received = request; return Response.json({ ok: true }); } } },
  '/process', { method: 'POST', headers: new Headers({ 'Content-Type': 'application/json' }), body: '{"batch":"fixture"}' });
  assert.equal(response.status, 200);
  assert.equal(received.url, 'https://statement-processor.internal/process');
  assert.equal(received.headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(received.headers.get('Content-Type'), 'application/json');
  assert.equal(await received.text(), '{"batch":"fixture"}');
  assert.equal(rapidStatementsEnabled(undefined), false);
  assert.equal(rapidStatementsEnabled({ GLOW_RAPID_STATEMENTS_URL: 'https://unused.example', GLOW_RAPID_STATEMENTS_TOKEN: token }), false, 'A configured endpoint alone cannot activate production');
  assert.equal(await rapidStatementRequest({}, '/bootstrap'), null);
});

test('the container gate checks credentials, waits for readiness and forwards the intact body without storing data', async () => {
  const source = fs.readFileSync(new URL('../../../services/statement-processor/worker.js', import.meta.url), 'utf8')
    .replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  const { StatementProcessor, default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const token = 'test-only-private-credential-at-least-32-characters';
  let started = 0, health = 0, forwarded = 0, timeout;
  const env = { GLOW_RAPID_STATEMENTS_TOKEN: token, GLOW_GITHUB_TOKEN: 'isolated-test-token', GLOW_DASHBOARD_PASSWORD: 'test-only' };
  const container = { running: false, start(options) { started++; this.running = true; assert.equal(options.enableInternet, true); },
    setInactivityTimeout: async value => { timeout = value; }, getTcpPort(port) {
      assert.equal(port, 8788);
      return { fetch: async request => {
        if (typeof request === 'string') { health++; return Response.json({ ready: true }); }
        forwarded++; assert.equal(await request.text(), '{"batch":"fixture"}'); return Response.json({ ok: true });
      } };
    } };
  const ctx = { container, storage: new Proxy({}, { get() { throw Error('Canonical data must stay in GitHub'); } }) };
  const instance = new StatementProcessor(ctx, env);
  env.STATEMENT_PROCESSOR = { getByName(name) { assert.equal(name, 'glow-family-office'); return instance; } };
  assert.equal((await worker.fetch(new Request('https://private/process'), env)).status, 401);
  assert.equal(started, 0);
  const result = await worker.fetch(new Request('https://private/process', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{"batch":"fixture"}' }), env);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(started, 1); assert.equal(health, 1); assert.equal(forwarded, 1); assert.equal(timeout, 900_000);
});
