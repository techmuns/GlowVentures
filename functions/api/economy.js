// Cloudflare Pages Function — free macro-economic indicators for India from the
// World Bank Open Data API. Keyless and CORS-agnostic (server-side), edge-cached
// for a day. World Bank series are ANNUAL and often a year or two lagged, so the
// client labels them "latest annual" rather than presenting them as real-time —
// an honest use of a free source, not an overclaim.
//
// Each indicator returns its most recent non-null value with the year, plus the
// prior year for a change. A series the API has no recent data for is simply
// omitted, and the page keeps its illustrative preview for it.

const CACHE_TTL_S = 86400;
const TIMEOUT_MS = 9000;

// The indicators the World Bank reliably publishes for India, mapped to the codes
// the client asks for. Kept server-side so the upstream shape stays here.
const INDICATORS = {
  gdp_growth: "NY.GDP.MKTP.KD.ZG",
  cpi: "FP.CPI.TOTL.ZG",
  govt_debt_gdp: "GC.DOD.TOTL.GD.ZS",
  gross_savings_gdp: "NY.GNS.ICTR.ZS",
  exports_gdp: "NE.EXP.GNFS.ZS",
  unemployment: "SL.UEM.TOTL.ZS",
};

function json(obj, cacheControl) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": cacheControl || "no-store" },
  });
}

async function fetchIndicator(code, signal) {
  const url = `https://api.worldbank.org/v2/country/IN/indicator/${code}?format=json&per_page=6&mrv=6`;
  const r = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (!r.ok) return null;
  const d = await r.json();
  const rows = Array.isArray(d) && Array.isArray(d[1]) ? d[1] : [];
  const withVal = rows.filter((x) => x && x.value != null && Number.isFinite(x.value));
  if (!withVal.length) return null;
  // rows come newest-first; take the two most recent that have values.
  const latest = withVal[0];
  const prior = withVal.find((x) => Number(x.date) < Number(latest.date)) || null;
  return { value: latest.value, year: latest.date, prev: prior ? prior.value : null, prevYear: prior ? prior.date : null };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/economy/v1/india`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const out = {};
  try {
    const entries = Object.entries(INDICATORS);
    const results = await Promise.all(entries.map(([, code]) => fetchIndicator(code, controller.signal).catch(() => null)));
    entries.forEach(([k], i) => { if (results[i]) out[k] = results[i]; });
  } catch {
    // fall through with whatever resolved
  } finally {
    clearTimeout(timer);
  }
  if (!Object.keys(out).length) return json({ ok: false, reason: "upstream_error" });

  const resp = json({ ok: true, source: "World Bank", country: "India", generatedAt: new Date().toISOString(), indicators: out }, `public, max-age=${CACHE_TTL_S}`);
  await cache.put(key, resp.clone());
  return resp;
}
