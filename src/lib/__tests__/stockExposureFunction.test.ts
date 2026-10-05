import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestPost } from '../../../functions/api/stock-exposure';
import manifest from '../../data/readModels.json';
import { BOOK_POSITIONS, BOOK_POLYCAB } from '../../data/glowData';
import { heldFundVehicles, bookIsinBridge, loadStockExposure } from '../lookthrough';
import { dedupedPositions, isCompanyShare } from '../analytics';
const source = JSON.parse(fs.readFileSync(`public/views/${manifest.revision}/lookthrough.json`, 'utf8'));
const funds = heldFundVehicles(dedupedPositions(BOOK_POSITIONS));
const identities = bookIsinBridge(BOOK_POSITIONS).index;
const companyKeys = new Set(BOOK_POSITIONS.filter(isCompanyShare).map(p => p.securityKey));
const body = { revision: manifest.revision, funds, identities: [...identities], companyKeys: [...companyKeys] };
const cache = new Map<string, Response>();
Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
  match: async (r: Request) => cache.get(r.url)?.clone(), put: async (r: Request, v: Response) => { cache.set(r.url, v.clone()); },
} } });
let reads = 0;
const pending: Promise<unknown>[] = [];
const context = (value: unknown = body) => ({ request: new Request('https://local.test/api/stock-exposure', { method: 'POST', body: JSON.stringify(value) }),
  env: { ASSETS: { fetch: async (request: Request) => { reads++; assert.match(request.url, /\/views\/.*\/lookthrough.json$/); return Response.json(source); } } },
  waitUntil(p: Promise<unknown>) { pending.push(p); },
});
const r = await onRequestPost(context()); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
const value = await r.json();
const expected = await loadStockExposure(funds, identities, { keys: new Set(BOOK_POLYCAB.map(p => p.securityKey)), isins: new Set(BOOK_POLYCAB.flatMap(p => p.isin ? [p.isin] : [])) }, companyKeys, source);
assert.equal(expected.status, 'ok');
if (expected.status === 'ok') assert.deepEqual(value, JSON.parse(JSON.stringify({ ...expected, byKey: [...expected.byKey] })));
await Promise.all(pending);
assert.deepEqual(await (await onRequestPost(context())).json(), value);
assert.equal(reads, 1, 'the whole aggregation is reused at the edge');
assert.equal((await onRequestPost(context({ ...body, revision: 'previous' }))).status, 409, 'old browser and new source cannot mix');
assert.equal((await onRequestPost(context({ ...body, funds: [...funds, funds[0]] }))).status, 400);
assert.equal((await onRequestPost(context(null))).status, 400);
assert.equal((await onRequestPost(context({ ...body, funds: [{ ...funds[0], marketValue: -1 }] }))).status, 400);
assert.equal((await onRequestPost(context('x'.repeat(130 * 1024)))).status, 413);
console.log('PASS server exposure parity, source revision gate, ring fence, private responses, cache reuse and bounded inputs');
