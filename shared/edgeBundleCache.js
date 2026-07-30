// One edge-cache entry holding many items, instead of one entry per item.
//
// Why this exists
// ───────────────
// Cloudflare counts every Cache API call as a subrequest, and the free plan
// allows 50 per invocation. Our proxies all cached per holding, so a request for
// N symbols spent 2N subrequests on cache traffic alone:
//
//   quotes         128 reads + 4 fetches + 127 writes  = ~259   → budget gone
//                                                                 BEFORE the first
//                                                                 fetch, so it
//                                                                 returned nothing
//   news           24 reads + 24 fetches + 24 writes   =  ~72   → fetches squeaked
//   insider        24 reads + 24 fetches + 24 writes   =  ~72     in under 50, but
//   announcements  24 reads + 24 fetches + 24 writes   =  ~72     every write failed,
//                                                                 so nothing ever
//                                                                 cached and the
//                                                                 upstream was hit
//                                                                 on every load
//
// Reading and writing a single bundled entry makes cache cost 2 subrequests flat,
// whatever N is. Per-item freshness survives: each item keeps its own timestamp
// inside the bundle, so callers can still decide per item what is fresh, stale or
// missing.
//
// Failures are counted rather than swallowed. A cache call that throws is the
// signal that the budget is exhausted, and it needs to reach the response.

export function bundleCache(namespace, { ttlS, version = "v1", request } = {}) {
  // The cache key MUST be on a hostname this zone serves. Cloudflare silently
  // refuses to store anything under an invented host, so the original keys
  // (https://quotes.cache/…, https://news.cache/…) never persisted a single
  // entry — which is why nothing was ever served from cache even when the
  // subrequest budget allowed the write. Deriving the key from the incoming
  // request keeps it same-origin. The /__cache/ path is never routed: it only
  // ever exists as a cache key, never as a real request.
  const origin = request ? new URL(request.url).origin : "https://cache.invalid";
  const key = () => new Request(`${origin}/__cache/${namespace}/${version}/bundle`);
  const stats = { reads: 0, writes: 0, readErrors: 0, writeErrors: 0, firstError: null };

  const note = (op, e) => {
    if (!stats.firstError) {
      stats.firstError = {
        op,
        errorName: e && e.name ? String(e.name) : "Error",
        errorMessage: e && e.message ? String(e.message).slice(0, 300) : String(e).slice(0, 300),
      };
    }
  };

  return {
    stats,

    /** The whole bundle: `{ [itemKey]: { v: <value>, at: <epoch ms> } }`. */
    async read() {
      try {
        stats.reads++;
        const hit = await caches.default.match(key());
        if (!hit) return {};
        const obj = await hit.json();
        return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
      } catch (e) {
        stats.readErrors++;
        note("cache.match", e);
        return {};
      }
    },

    /** Write the bundle back, dropping anything past its TTL so it can't grow forever. */
    async write(bundle) {
      try {
        stats.writes++;
        const now = Date.now();
        const kept = {};
        for (const [k, rec] of Object.entries(bundle || {})) {
          if (rec && typeof rec.at === "number" && now - rec.at < ttlS * 1000) kept[k] = rec;
        }
        await caches.default.put(key(), new Response(JSON.stringify(kept), {
          headers: { "content-type": "application/json", "Cache-Control": `public, max-age=${ttlS}` },
        }));
      } catch (e) {
        stats.writeErrors++;
        note("cache.put", e);
      }
    },
  };
}

/** Age of a bundle entry in seconds, or Infinity when absent. */
export function ageS(bundle, itemKey, now = Date.now()) {
  const rec = bundle && bundle[itemKey];
  return rec && typeof rec.at === "number" ? (now - rec.at) / 1000 : Infinity;
}
