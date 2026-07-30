// Cloudflare Pages Function — server-side proxy for the muns news-search API.
//
// Holds MUNS_TOKEN in the Pages environment (context.env) so the token is NEVER
// exposed to the browser. Gated by the site password too: functions/_middleware.js
// runs on /api/* as well, so only a signed-in user ever reaches this endpoint.
//
// The client POSTs the holdings to search for; we fetch news per holding, cache
// each query at the edge for the day (so the upstream API is hit ~once/day per
// name), then return a de-duplicated, newest-first feed. The token appears only in
// the outbound Authorization header — never in the response sent to the client.
//
// SETUP: add MUNS_TOKEN as an environment variable / secret on the Cloudflare Pages
// project (Settings → Environment variables, Production + Preview). No token → the
// endpoint returns { ok:false, reason:"not_configured" } and the page shows a notice.

import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const UPSTREAM = "https://hostapi.muns.io/tools/news-search";
const MAX_HOLDINGS = 24;        // cap upstream calls per request
const PER_HOLDING = 4;          // max articles kept per holding
const MAX_ARTICLES = 60;        // cap the returned feed
const UPSTREAM_TIMEOUT_MS = 9000;
const CACHE_TTL_S = 86400;
const RETRYABLE = (s) => s === 0 || s === 429 || s >= 500; // rate-limit / 5xx / timeout      // 1 day

function cleanName(raw) {
  return String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(limited|ltd\.?|private|pvt\.?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function fetchNewsFor(name, token, signal) {
  const query = `${cleanName(name)} stock news`.trim();
  const r = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, country: "India" }),
    signal,
  });
  if (!r.ok) return { status: r.status, articles: [] };
  let data;
  try { data = await r.json(); } catch { return { status: 200, articles: [] }; }
  const results = Array.isArray(data?.results) ? data.results : [];
  const articles = results
    .filter((a) => a && a.url && a.title)
    .slice(0, PER_HOLDING)
    .map((a) => ({
      title: String(a.title),
      url: String(a.url),
      description: String(a.description ?? ""),
      source: String(a.profile?.name ?? ""),
      age: String(a.age ?? ""),
      publishedAt: String(a.page_age ?? ""),
    }));
  return { status: 200, articles };
}

// Cache key for one holding's daily news query.
const newsKey = (date, name) => `${date}|${cleanName(name).toLowerCase()}`;

// Fetch one holding's news. The caller reads and writes the shared bundle around
// this, so nothing here touches the cache.
async function fetchOneHolding(name, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetchNewsFor(name, token, controller.signal);
  } catch {
    return { status: 0, articles: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, reason: "method" }, 405);

  const token = env && env.MUNS_TOKEN;
  if (!token) return json({ ok: false, reason: "not_configured" }, 200);

  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const refresh = !!payload.refresh;

  const holdings = (Array.isArray(payload.holdings) ? payload.holdings : [])
    .filter((h) => h && typeof h.name === "string" && h.name.trim())
    .slice(0, MAX_HOLDINGS)
    .map((h) => ({ name: String(h.name).slice(0, 120), key: String(h.key || "").slice(0, 160) }));

  if (!holdings.length) {
    return json({ ok: true, generatedAt: new Date().toISOString(), count: 0, articles: [], holdingsSearched: 0 });
  }

  const date = todayUTC();
  const cache = bundleCache("news", { ttlS: CACHE_TTL_S, request });
  // One cache read covers every holding. Previously this was one read + one write
  // per holding, which put the request over Cloudflare's free-plan subrequest
  // budget — the reads and fetches fit, but every write was refused, so nothing
  // ever cached and the upstream was hit for all 24 names on every single load.
  const bundle = refresh ? {} : await cache.read();
  const now = Date.now();
  const pending = holdings.filter((h) => ageS(bundle, newsKey(date, h.name), now) >= CACHE_TTL_S);
  const fetchedByName = new Map();
  if (pending.length) {
    const results = await Promise.allSettled(pending.map((h) => fetchOneHolding(h.name, token)));
    const at = Date.now();
    let stored = 0;
    results.forEach((r, i) => {
      const res = r.status === "fulfilled" ? r.value : { status: 0, articles: [] };
      fetchedByName.set(pending[i].name, res);
      if (res.status === 200) { bundle[newsKey(date, pending[i].name)] = { v: res.articles, at }; stored++; }
    });
    if (stored) await cache.write(bundle);   // one write for the whole feed
  }
  const settled = holdings.map((h) => {
    const fresh = fetchedByName.get(h.name);
    if (fresh) return { status: "fulfilled", value: fresh };
    const rec = bundle[newsKey(date, h.name)];
    return { status: "fulfilled", value: { status: 200, articles: rec ? rec.v : [] } };
  });

  const seen = new Set();
  const articles = [];
  let okCount = 0;
  const failed = [];
  const statusTally = {};
  settled.forEach((res, i) => {
    const val = res.status === "fulfilled" ? res.value : { status: 0, articles: [] };
    const h = holdings[i];
    if (val.status === 200) {
      okCount++;
      for (const a of val.articles) {
        if (!a.url || seen.has(a.url)) continue;
        seen.add(a.url);
        articles.push({ ...a, holding: h.name, key: h.key });
      }
    } else if (RETRYABLE(val.status)) {
      failed.push(h.key);
      statusTally[val.status] = (statusTally[val.status] || 0) + 1;
    } else {
      statusTally[val.status] = (statusTally[val.status] || 0) + 1;
    }
  });

  if (okCount === 0 && failed.length === 0) {
    const top = Object.entries(statusTally).sort((a, b) => b[1] - a[1])[0];
    return json({ ok: false, reason: "upstream_error", status: top ? Number(top[0]) : 0, holdingsSearched: 0 });
  }

  articles.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: Math.min(articles.length, MAX_ARTICLES),
    articles: articles.slice(0, MAX_ARTICLES),
    holdingsSearched: okCount,
    holdingsWithData: okCount,
    failed,
  });
}
