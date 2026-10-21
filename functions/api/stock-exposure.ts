import { loadStockExposure, type FundPortfolio, type HeldFund, type Index } from '../../src/lib/lookthrough';
import { BOOK_POLYCAB } from '../../src/data/glowData';
import manifest from '../../src/data/readModels.json';

type Context = { request: Request; env: { ASSETS: { fetch(request: Request): Promise<Response> } }; waitUntil(p: Promise<unknown>): void };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const key = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,200}$/.test(v);

export async function onRequestPost(context: Context) {
  let body;
  try {
    // The request contains only the current fund values and exact identifiers.
    // Bound the decoded body, including requests with no Content-Length.
    const reader = context.request.body?.getReader();
    if (!reader) return json({ status: 'invalid' }, 400);
    const decoder = new TextDecoder(); let text = '', bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 128 * 1024) { await reader.cancel(); return json({ status: 'too_large' }, 413); }
        text += decoder.decode(part.value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    body = JSON.parse(text + decoder.decode());
  } catch { return json({ status: 'invalid' }, 400); }
  if (!body || typeof body !== 'object') return json({ status: 'invalid' }, 400);
  if (body.revision !== manifest.revision) return json({ status: 'revision_changed' }, 409);
  if (!Array.isArray(body.funds) || body.funds.length > 200 || !body.funds.every((f: HeldFund) => f && key(f.securityKey)
    && typeof f.name === 'string' && f.name.length <= 500 && typeof f.assetClass === 'string' && f.assetClass.length <= 100
    && Number.isFinite(f.marketValue) && f.marketValue >= 0)
    || !Array.isArray(body.identities) || body.identities.length > 1000 || !body.identities.every((p: unknown[]) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && /^[A-Z0-9]{12}$/.test(p[0]) && key(p[1]))
    || !Array.isArray(body.companyKeys) || body.companyKeys.length > 1000 || !body.companyKeys.every(key)) return json({ status: 'invalid' }, 400);
  if (new Set(body.funds.map((f: HeldFund) => f.securityKey)).size !== body.funds.length) return json({ status: 'invalid' }, 400);
  const edgeCache = typeof caches === 'undefined' ? undefined : (caches as CacheStorage & { default: Cache }).default;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
  const origin = new URL(context.request.url).origin;
  const cacheKey = new Request(`${origin}/__cache/stock-exposure/v1/${manifest.revision}/${hash}`);
  try {
    const cached = await edgeCache?.match(cacheKey);
    if (cached) return json(await cached.json());
  } catch { /* A cache outage cannot discard the source. */ }
  try {
    // One local asset read replaces 20+ browser requests. All issuer matching,
    // deduplication, aggregation and the promoter ring-fence execute here.
    const response = await context.env.ASSETS.fetch(new Request(`${origin}/views/${manifest.revision}/lookthrough.json`));
    if (!response.ok) return json({ status: 'unreachable' }, 503);
    const source = await response.json() as { index: Index; portfolios: Record<string, FundPortfolio> };
    const result = await loadStockExposure(body.funds, new Map(body.identities), {
      keys: new Set(BOOK_POLYCAB.map(p => p.securityKey)),
      isins: new Set(BOOK_POLYCAB.flatMap(p => p.isin ? [p.isin.trim().toUpperCase()] : [])),
    }, new Set(body.companyKeys), source);
    if (result.status !== 'ok') return json(result, 503);
    const value = { ...result, byKey: [...result.byKey] };
    if (edgeCache) context.waitUntil(Promise.resolve().then(() => edgeCache.put(cacheKey, Response.json(value, { headers: { 'Cache-Control': 'public, max-age=86400' } }))).catch(() => {}));
    return json(value);
  } catch { return json({ status: 'unreachable' }, 503); }
}
