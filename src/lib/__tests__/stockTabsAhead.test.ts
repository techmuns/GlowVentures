// Stage 10ik — the stock page's Price & returns and Research tabs load ahead.
import assert from 'node:assert/strict';
import { onRequest as prices } from '../../../functions/api/prices.js';
import { onRequest as research } from '../../../functions/api/research.js';
import { fetchPriceHistory, settledPriceHistory } from '../prices';
import { fetchResearch, settledResearch } from '../research';

const cache = new Map<string, Response>();
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
  match: async (r: Request) => cache.get(r.url)?.clone(), put: async (r: Request, value: Response) => { cache.set(r.url, value.clone()); },
} } });
const pending: Promise<unknown>[] = [];
const ctx = (request: Request) => ({ request, env: { MUNS_TOKEN: 'test-only-token' }, waitUntil(p: Promise<unknown>) { pending.push(p); } });

// 1. A price history carries the time it was fetched upstream, and a cached
//    answer keeps that time — the browser keeps a copy no longer than the edge.
const day = 86400;
globalThis.fetch = async () => Response.json({ chart: { result: [{ meta: { currency: 'INR' },
  timestamp: [day * 20000, day * 20001], indicators: { quote: [{ close: [100, 101] }] } }] } });
const before = Date.now();
const first = await (await prices(ctx(new Request('https://local.test/api/prices?symbol=TEST')))).json();
await Promise.all(pending);
assert.equal(first.ok, true);
assert.ok(first.fetchedAt >= before && first.fetchedAt <= Date.now(), 'a live price history is dated');
globalThis.fetch = async () => { throw new Error('the edge cache should answer'); };
const again = await (await prices(ctx(new Request('https://local.test/api/prices?symbol=TEST')))).json();
assert.equal(again.fetchedAt, first.fetchedAt, 'a cached history keeps its original fetch time');
console.log('PASS price histories carry their upstream fetch time through the edge cache');

// 2. Research is cached ONE ENTRY PER COMPANY: two companies fetched at once
//    both stay cached. In one shared entry each write dropped the other's.
let upstream = 0;
globalThis.fetch = async () => { upstream++; await new Promise((r) => setTimeout(r, 10)); return new Response(`Financial evidence ${upstream}`); };
const ask = (ticker: string) => research(ctx(new Request('https://local.test/api/research', { method: 'POST', body: JSON.stringify({ kind: 'financials', ticker }) })));
const live = await Promise.all([ask('AAA'), ask('BBB')]).then((rs) => Promise.all(rs.map((r) => r.json())));
assert.equal(upstream, 2);
assert.ok(live.every((d) => d.ok && typeof d.fetchedAt === 'number'), 'a live research answer is dated');
upstream = 0;
const hits = await Promise.all([ask('AAA'), ask('BBB')]).then((rs) => Promise.all(rs.map((r) => r.json())));
assert.equal(upstream, 0, 'both companies were kept although they were fetched at the same time');
assert.deepEqual(hits.map((d) => d.cached), [true, true]);
assert.deepEqual(hits.map((d) => d.fetchedAt), live.map((d) => d.fetchedAt), 'a cached research answer keeps its original fetch time');
console.log('PASS research is cached per company, so concurrent fetches never drop one another');

// 3. What the page fetched ahead is ready on a tab's first paint; a failure is not.
globalThis.fetch = async () => Response.json({ ok: true, kind: 'financials', label: 'Financial tables', format: 'markdown', text: 'Doc', cached: false, fetchedAt: Date.now() });
assert.equal(settledResearch('financials', 'READY'), undefined);
await fetchResearch('financials', 'READY');
assert.equal((settledResearch('financials', 'READY') as { text?: string } | undefined)?.text, 'Doc');
globalThis.fetch = async () => { throw new Error('offline'); };
await fetchResearch('financials', 'DOWN');
assert.equal(settledResearch('financials', 'DOWN'), undefined, 'a failed answer is never drawn as ready');
globalThis.fetch = async () => Response.json({ ...first, symbol: 'READY.NS' });
assert.equal(settledPriceHistory('READY'), undefined);
// Without browser storage (Node has none) `keep` quietly fetches as before.
const h = await fetchPriceHistory('READY', { keep: true });
assert.equal(h.ok, true);
assert.equal(settledPriceHistory('READY')?.symbol, 'READY.NS');
globalThis.fetch = async () => { throw new Error('offline'); };
await fetchPriceHistory('NOPE', { keep: true });
assert.equal(settledPriceHistory('NOPE'), undefined);
console.log('PASS answers fetched ahead are ready on first paint; failures are retried, never kept');
