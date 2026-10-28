// Stage 10in — the stock page's Price & returns and Research tabs load ahead.
import assert from 'node:assert/strict';
import { onRequest as prices } from '../../../functions/api/prices.js';
import { onRequest as research } from '../../../functions/api/research.js';
import { fetchPriceHistory, settledPriceHistory } from '../prices';
import { fetchResearch, settledResearch } from '../research';
import { getHoldingsInsider } from '../insider';

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

// 4. A page left open past the window asks again: a history in memory lives no
//    longer than the kept copy would, and insider deals no longer than the UTC
//    day the endpoint keys them by.
const RealDate = Date;
const shiftClock = (ms: number) => {
  globalThis.Date = class extends RealDate {
    constructor(...a: unknown[]) { if (a.length) super(...(a as [number])); else super(RealDate.now() + ms); }
    static now() { return RealDate.now() + ms; }
  } as DateConstructor;
};
let asked = 0;
globalThis.fetch = async () => { asked++; return Response.json({ ...first, symbol: 'OPEN.NS', fetchedAt: Date.now() }); };
await fetchPriceHistory('OPEN', { keep: true });
await fetchPriceHistory('OPEN', { keep: true });
assert.equal(asked, 1, 'one request while the history is fresh');
shiftClock(6 * 3600_000 + 1000);
assert.equal(settledPriceHistory('OPEN'), undefined, 'a six-hour-old history is not drawn as ready');
await fetchPriceHistory('OPEN', { keep: true });
assert.equal(asked, 2, 'a page left open past six hours fetches the history again');
globalThis.Date = RealDate;

let insiderCalls = 0;
globalThis.fetch = async () => { insiderCalls++; return Response.json({ ok: true, items: [], count: 0, searched: 1, withData: 0, failed: [] }); };
const holding = [{ symbol: 'OPEN', name: 'Open Ltd', key: 'OPEN', weight: 0 }];
await getHoldingsInsider(holding);
await getHoldingsInsider(holding);
assert.equal(insiderCalls, 1, 'one insider request within the day');
shiftClock(86400_000);
await getHoldingsInsider(holding);
assert.equal(insiderCalls, 2, 'a new UTC day asks for insider deals again');
globalThis.Date = RealDate;
console.log('PASS a page left open asks again once prices pass six hours and insider deals pass the day');

// 5. A research copy near the service's twelve-hour cutoff is held in memory
//    only until that cutoff, never the full five minutes after it arrived.
let researchAsks = 0;
const nearCutoff = Date.now() - 12 * 3600_000 + 30_000;
globalThis.fetch = async () => { researchAsks++; return Response.json({ ok: true, kind: 'financials', label: 'Financial tables', format: 'markdown', text: 'Old doc', cached: true, fetchedAt: nearCutoff }); };
await fetchResearch('financials', 'CUTOFF');
assert.ok(settledResearch('financials', 'CUTOFF'), 'drawn while inside the fresh window');
shiftClock(60_000);
assert.equal(settledResearch('financials', 'CUTOFF'), undefined, 'not drawn once the service would call it stale');
await fetchResearch('financials', 'CUTOFF');
assert.equal(researchAsks, 2, 'asked again past the cutoff');
globalThis.Date = RealDate;
console.log('PASS research held in memory expires at the service\'s own fresh cutoff');
