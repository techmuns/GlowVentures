import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/market-history.js';
const originalNow = Date.now, originalFetch = globalThis.fetch;
Date.now = () => Date.parse('2026-10-22T08:00:00Z'); // India: market still open.
const cache = new Map<string, Response>(), pending: Promise<unknown>[] = [];
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
 match: async (r: Request) => cache.get(r.url)?.clone(), put: async (r: Request, v: Response) => { cache.set(r.url, v.clone()); },
} } });
let calls = 0;
const stamp = (date: string) => Date.parse(`${date}T10:00:00Z`) / 1000;
const stock = () => ({ chart: { result: [{ meta: { symbol: 'KARURVYSYA.NS', currency: 'INR', longName: 'Karur Vysya Bank', currentTradingPeriod: { regular: { start: stamp('2026-10-22')-3600, end: stamp('2026-10-22')+3600 } } }, timestamp: [stamp('2026-10-20'), stamp('2026-10-21'), stamp('2026-10-22')], indicators: { adjclose: [{ adjclose: [100, 120, 130] }], quote: [{ close: [1000, 1200, 1300] }] } }] } });
let payload: unknown = stock();
globalThis.fetch = async (url, opts) => { calls++; assert.ok(/^https:\/\/(query1.finance.yahoo.com|api.mfapi.in)\//.test(String(url))); assert.equal(opts?.redirect, 'manual'); assert.equal((opts?.headers as Record<string,string>).cookie, undefined); assert.equal((opts?.headers as Record<string,string>).authorization, undefined); return Response.json(payload); };
const request = async (query = 'symbol=KARURVYSYA') => (await onRequest({ request: new Request(`https://local.test/api/market-history?${query}`, { headers: { cookie: 'private', authorization: 'private' } }), waitUntil: p => { pending.push(p); } })).json();
assert.equal((await request('symbol=https://evil.invalid')).ok, false); assert.equal(calls, 0);
const first = await request(); assert.deepEqual(first.v, [100, 120]); assert.equal(first.last, '2026-10-21'); assert.equal(first.basis, 'adjusted-close');
assert.equal(first.version,2); assert.deepEqual(first.c,[1000,1200]); assert.deepEqual(first.splits,[]);
await Promise.all(pending.splice(0)); await request(); assert.equal(calls, 1, 'public identity cache is reused');
cache.clear(); payload=stock(); (payload as any).chart.result[0].events={splits:{today:{date:stamp('2026-10-22'),numerator:2,denominator:1}}};
const intraday=await request();assert.equal(intraday.last,'2026-10-21');assert.deepEqual(intraday.splits,[{date:'2026-10-22',factor:2}],'keep today’s split basis while excluding the unfinished close');
cache.clear(); Date.now = () => Date.parse('2026-10-22T12:00:00Z'); assert.equal((await request()).last, '2026-10-22', 'settled close is usable the same day');
cache.clear(); payload = stock(); (payload as ReturnType<typeof stock>).chart.result[0].meta.currency = 'USD'; assert.equal((await request()).ok, false);
cache.clear(); payload = stock(); delete (payload as any).chart.result[0].indicators.adjclose; assert.match((await request()).reason, /adjusted/);
payload = { meta: { scheme_code: 131666, isin_growth: 'INF084M01AB8', scheme_name: 'Exact fund' }, data: [{ date: '21-10-2026', nav: '120' }, { date: '20-10-2026', nav: '100' }, { date: '99-99-2026', nav: '200' }, { date: '22-10-2099', nav: '300' }, { date: '19-10-2026', nav: '0' }] };
const nav = await request('fund=131666&isin=INF084M01AB8'); assert.equal(nav.basis, 'nav'); assert.deepEqual(nav.v, [100,120]); assert.equal(nav.isin, 'INF084M01AB8');
cache.clear(); assert.equal((await request('fund=131666&isin=INF084M01AB9')).ok, false, 'similar fund name never substitutes for exact ISIN');
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { match: async () => { throw new Error('offline'); }, put: async () => { throw new Error('offline'); } } } });
payload = stock(); assert.equal((await request()).ok, true, 'cache failure does not hide a usable provider');
globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }); assert.equal((await request()).ok, false);
globalThis.fetch = async () => { throw new Error('provider unavailable'); }; assert.equal((await request()).ok, false);
Date.now = originalNow; globalThis.fetch = originalFetch;
console.log('History feed: identity, adjusted prices, exact fund ISIN, settled dates, cache, malformed inputs and upstream failure passed.');
