import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rapidStatementRequest, rapidStatementsEnabled } from '../../../shared/rapidStatementBackend.mjs';

test('a private service binding preserves the request and never exposes its credential in the URL', async () => {
  let received;
  const token = 'test-only-private-credential-at-least-32-characters';
  const response = await rapidStatementRequest({ GLOW_RAPID_STATEMENTS_TOKEN: token,
    GLOW_RAPID_STATEMENTS: { fetch: async request => { received = request; return Response.json({ ok: true }); } } },
  '/process', { method: 'POST', headers: new Headers({ 'Content-Type': 'application/json' }), body: '{"batch":"fixture"}' });
  assert.equal(response.status, 200);
  assert.equal(received.url, 'https://statement-processor.internal/process');
  assert.equal(received.headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(received.headers.get('Content-Type'), 'application/json');
  assert.equal(await received.text(), '{"batch":"fixture"}');
  assert.equal(rapidStatementsEnabled(undefined), false);
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
