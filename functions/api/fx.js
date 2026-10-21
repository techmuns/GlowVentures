// Cloudflare Pages Function — daily USD→INR reference rate.
// Primary source: ECB reference rates via Frankfurter; fallback: open.er-api.com.
// Both are free, keyless and CORS-friendly. Edge-cached for the day so every
// viewer shares a single upstream call. Behind the same site-password middleware
// as the rest of /api/*. The client falls back to a static rate if this fails,
// so the dashboard always renders.

const PRIMARY = "https://api.frankfurter.app/latest?from=USD&to=INR";
const FALLBACK = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_S = 21600; // 6h — a daily reference rate doesn't move intraday
const TIMEOUT_MS = 8000;

function json(obj, cacheControl) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": cacheControl || "no-store" },
  });
}

async function fetchRate(url, signal) {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (!r.ok) return null;
  const d = await r.json();
  const rate = d && d.rates && d.rates.INR;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const date = typeof d.date === "string" ? d.date.slice(0, 10)
    : typeof d.time_last_update_utc === "string" ? new Date(d.time_last_update_utc).toISOString().slice(0, 10)
    : null;
  return { rate, date };
}

export async function onRequest(context) {
  const cache = caches.default;
  // Same-origin key: Cloudflare will not store anything under an invented
  // hostname, so the old https://fx.cache/... key cached nothing and the rate
  // was re-fetched on every page load.
  const key = new Request(`${new URL(context.request.url).origin}/__cache/fx/v1/usd-inr`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let out = null;
  try {
    out = await fetchRate(PRIMARY, controller.signal);
    if (!out) out = await fetchRate(FALLBACK, controller.signal);
  } catch {
    out = null;
  } finally {
    clearTimeout(timer);
  }
  if (!out) return json({ ok: false, reason: "upstream_error" });

  const resp = json(
    { ok: true, inrPerUsd: out.rate, date: out.date, source: "ECB / Frankfurter" },
    `public, max-age=${CACHE_TTL_S}`,
  );
  await cache.put(key, resp.clone());
  return resp;
}
