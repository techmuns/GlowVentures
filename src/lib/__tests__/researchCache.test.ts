import assert from 'node:assert/strict';
import { onRequest as ratios } from '../../../functions/api/ratios.js';
import { onRequest } from '../../../functions/api/research.js';
import { fetchResearch, isResearchError, stalenessNote } from '../research';
const now = Date.now();
const cache = new Map<string, Response>();
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
  match: async (r: Request) => cache.get(r.url)?.clone(), put: async (r: Request, value: Response) => { cache.set(r.url, value.clone()); },
} } });
const key = 'https://local.test/__cache/research/financials/v1/bundle';
cache.set(key, Response.json({ TEST: { at: now - 13 * 3600_000, v: { format: 'markdown', text: 'Saved financial evidence' } } }));
const pending: Promise<unknown>[] = [];
const ctx = () => ({ request: new Request('https://local.test/api/research', { method: 'POST', body: JSON.stringify({ kind: 'financials', ticker: 'TEST' }) }), env: { MUNS_TOKEN: 'test-only-token' }, waitUntil(p: Promise<unknown>) { pending.push(p); } });
let release!: () => void;
const hold = new Promise<void>(r => { release = r; });
globalThis.fetch = async () => { await hold; return new Response('Updated financial evidence'); };
const response = await Promise.race([onRequest(ctx()), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('saved research waited on upstream')), 500); timer.unref(); })]);
const saved = await response.json();
assert.equal(saved.text, 'Saved financial evidence'); assert.equal(saved.refreshing, true); assert.equal(saved.stale, true);
assert.ok(saved.ageS >= 13 * 3600); assert.match(stalenessNote(saved)!, /while it refreshes/);
release(); await Promise.all(pending);
assert.equal((await (await onRequest(ctx())).json()).text, 'Updated financial evidence');
let reads = 0;
globalThis.fetch = async () => { reads++; return Response.json({ ok: true, kind: 'financials', format: 'markdown', text: 'Test', cached: true }); };
await Promise.all([fetchResearch('financials', 'CACHE'), fetchResearch('financials', 'CACHE')]);
await fetchResearch('financials', 'CACHE'); assert.equal(reads, 1, 'tab changes reuse a recent response');
globalThis.fetch = async () => { reads++; throw new Error('offline'); };
assert.ok(isResearchError(await fetchResearch('financials', 'FAIL')));
assert.ok(isResearchError(await fetchResearch('financials', 'FAIL')));
assert.equal(reads, 3, 'failures are not pinned into the session');
console.log('PASS saved research immediately returned with honest age, background recovery, request sharing and retry after failure');

cache.set('https://local.test/__cache/ratio-table/v1/bundle', Response.json({ TEST: { at: now - 13 * 3600_000, v: { text: 'Saved ratios', sourceUrl: 'https://www.screener.in/company/TEST/' } } }));
globalThis.fetch = async () => { throw new Error('offline'); };
const ratio = await ratios({ ...ctx(), request: new Request('https://local.test/api/ratios', { method: 'POST', body: JSON.stringify({ table: true, ticker: 'TEST' }) }) });
const table = await ratio.json();
assert.equal(table.text, 'Saved ratios'); assert.equal(table.refreshing, true); assert.equal(table.stale, true);
await Promise.all(pending);
console.log('PASS ratios use the same immediate saved-response contract');
