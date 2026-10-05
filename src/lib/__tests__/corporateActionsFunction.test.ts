import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet, readBoundedJson } from '../../../functions/api/corporate-actions.js';
import { normalizeActionFeed } from '../../../shared/corporateActions.mjs';
const raw = JSON.parse(fs.readFileSync('src/lib/__tests__/fixtures/corporate-actions-source.json', 'utf8'));
let now = Date.parse(raw.capturedAt);
Date.now = () => now;
const cache = new Map<string, Response>();
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
  match: async (r: Request) => cache.get(r.url)?.clone(),
  put: async (r: Request, v: Response) => { cache.set(r.url, v.clone()); },
} } });
const pending: Promise<unknown>[] = [];
const settle = async () => { await Promise.all(pending.splice(0)); };
const context = (query = 'symbols=CUB,JAMNAAUTO', asset?: unknown) => ({
  request: new Request(`https://local.test/api/corporate-actions?${query}`, { headers: { cookie: 'private-session', authorization: 'never-forward' } }),
  waitUntil: (p: Promise<unknown>) => { pending.push(p); },
  ...(asset ? { env: { ASSETS: { fetch: async () => Response.json(asset) } } } : {}),
});
let calls: string[] = [];
globalThis.fetch = async (input, options) => {
  calls.push(String(input));
  assert.equal(options?.headers, undefined, 'private cookies and holdings never go upstream');
  assert.equal(options?.redirect, 'manual');
  assert.ok(!String(input).includes('symbols='));
  return Response.json(raw);
};
assert.equal((await onRequestGet(context('symbols=bad%20symbol'))).status, 400);
assert.equal((await onRequestGet(context('symbols=CUB&isins=bad'))).status, 400);
assert.equal(calls.length, 0);
const first = await (await onRequestGet(context())).json();
assert.equal(first.retained, false);
assert.equal(first.feed.rows.length, 2);
assert.equal(calls.length, 2, 'independent transports run together');
await onRequestGet(context('symbols=V2RETAIL'));
assert.equal(calls.length, 2, 'all holding filters reuse one market capture');

// A blocked upstream cannot hold a cached response hostage. Resolve it only
// AFTER the response has arrived; an accidental await would fail the deadline.
now += 16 * 60_000;
let unblock!: () => void;
const blocked = new Promise<void>(resolve => { unblock = resolve; });
globalThis.fetch = async () => { await blocked; throw new Error('offline'); };
const fast = await Promise.race([onRequestGet(context()), new Promise<never>((_, reject) => {
  const timer = setTimeout(() => reject(new Error('saved response waited on upstream')), 500); timer.unref();
})]);
const held = await fast.json();
assert.equal(held.refreshing, true);
assert.equal(held.retained, true);
assert.deepEqual(held.feed.rows, first.feed.rows);
unblock(); await settle();
assert.equal((await (await onRequestGet(context())).json()).refreshing, false, 'failed refresh backs off');

// A cold edge opens from the deployment asset, also without waiting for upstream.
cache.clear(); calls = [];
let release!: () => void;
const wait = new Promise<void>(r => { release = r; });
globalThis.fetch = async (input) => { calls.push(String(input)); await wait; return Response.json(raw); };
const cold = await (await onRequestGet(context('symbols=CUB', normalizeActionFeed(raw)))).json();
assert.equal(cold.feed.rows.length, 1);
assert.equal(cold.refreshing, true);
release(); await settle();
assert.equal((await (await onRequestGet(context())).json()).retained, false);

// Regression, malformed, shrunken and future captures never replace evidence.
for (const bad of [{ ...raw, capturedAt: '2020-01-01T00:00:00Z' }, { ...raw, rows: [raw.rows[0]], rowCount: 1 },
  { version: 1, rows: [] }, { ...raw, capturedAt: '2099-01-01T00:00:00Z' }]) {
  now += 16 * 60_000;
  globalThis.fetch = async () => Response.json(bad);
  const result = await (await onRequestGet(context())).json(); await settle();
  assert.equal(result.feed.capturedAt, raw.capturedAt);
  assert.equal((await (await onRequestGet(context())).json()).feed.capturedAt, raw.capturedAt);
}

// A reachable stale primary cannot hide a newer mirror. No concurrent writes.
cache.clear();
const newerTime = new Date(now).toISOString();
const newer = { ...raw, capturedAt: newerTime, sources: {
  nse: { ...raw.sources.nse, capturedAt: newerTime }, screener: { ...raw.sources.screener, capturedAt: newerTime },
} };
globalThis.fetch = async (input) => Response.json(String(input).includes('workers.dev') ? raw : newer);
assert.equal((await (await onRequestGet(context())).json()).feed.capturedAt, newerTime);
cache.clear();
globalThis.fetch = async (input) => String(input).includes('workers.dev')
  ? new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid' } }) : Response.json(newer);
const redirect = await (await onRequestGet(context())).json();
assert.equal(redirect.ok, true); assert.match(redirect.errors[0].reason, /302/);
cache.clear();
globalThis.fetch = async () => { throw new Error('offline'); };
assert.equal((await onRequestGet(context())).status, 503, 'absence cannot become empty success');

Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
  match: async () => { throw new Error('cache failed'); }, put: async () => { throw new Error('cache failed'); },
} } });
globalThis.fetch = async () => Response.json(newer);
assert.equal((await (await onRequestGet(context())).json()).ok, true); await settle();
await assert.rejects(() => readBoundedJson(new Response('x', { headers: { 'Content-Length': String(17 * 1024 * 1024) } })), /too large/);
await assert.rejects(() => readBoundedJson(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(17 * 1024 * 1024)); c.close(); } }))), /too large/);
assert.deepEqual(await readBoundedJson(Response.json({ ok: true })), { ok: true });
console.log('PASS immediate saved/cold responses, background recovery/backoff, privacy, monotonic evidence, fallback transports and bounded reads');
