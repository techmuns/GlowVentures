// Cloudflare Pages Function — server-side proxy for the muns batch stock-quote API.
//
// Holds MUNS_TOKEN in the Pages environment (context.env) so the token is NEVER
// exposed to the browser. Gated by the site password too: functions/_middleware.js
// runs on /api/* as well, so only a signed-in user ever reaches this endpoint.
//
// Measured behaviour of the upstream (fastapi.muns.io/stock-data/batch), which the
// published docs get wrong in three places:
//   • `type` must be "stockquote_batch". The docs say "stockquote"; that 422s.
//   • Hard cap of 80 tickers per request ("Maximum 80 tickers are allowed").
//   • The quote body is a comma-separated key=value STRING (`rawQuote`), not JSON.
//     `currentPrice` is the only field the upstream pre-parses for us.
//
// ── Why this file is heavily instrumented ────────────────────────────────────
// The first version swallowed every failure. `fetchChunk` caught with a bare
// `catch {}` — no error binding — and returned a synthetic `status: 0`, which
// then surfaced as `upstreamStatus: 0` and nothing else. In production every
// chunk threw within ~100ms and the page showed "Live · 149 not live" with no
// way to tell why. A proxy that can fail must say how it failed, so every fetch
// and every cache operation now records what actually happened, and the endpoint
// reports ok:false when it resolved nothing rather than dressing a total failure
// as success.
//
// That instrumentation found the cause: this ran one cache read per symbol, so
// 128 symbols cost ~259 subrequests against Cloudflare's free-plan budget of 50.
// The budget was exhausted during the cache reads, so every fetch that followed
// threw "Too many subrequests" before leaving the building — which is why it
// failed in ~100ms rather than timing out. Quotes now share one bundled cache
// entry (see shared/edgeBundleCache.js): 1 read + 4 fetches + 1 write = 6.

import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const VERSION = "quotes-fn/4";
const UPSTREAM = "https://fastapi.muns.io/stock-data/batch";
const COUNTRY = "INDIA";
const CHUNK = 32;               // upstream caps at 80; 32 is where timeouts stop
const CONCURRENCY = 4;
const UPSTREAM_BUDGET_MS = 20000;
const CHUNK_TIMEOUT_MS = 26000;
const MAX_SYMBOLS = 400;
const FRESH_S = 60;
const STALE_S = 900;
const BODY_PREVIEW = 300;
// Symbols fetched per request. The upstream returns only part of a large ask
// within its own budget, so demanding all 128 at once yields a slow request that
// prices a fraction of the book. Fetching a bounded slice per poll and serving
// everything else from the bundle lets coverage build over the first few minutes
// and then stay complete, with every request short.
const MAX_FETCH_PER_REQUEST = 64;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function parseRawQuote(raw) {
  const out = {};
  for (const part of String(raw || "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Returns null for a blank/absent field. The first version used Number("") === 0
// and treated a missing price as 0, which quietly counted a failed ticker as a
// successful quote of zero.
const num = (v) => {
  const s = String(v ?? "").replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function parseRange(v) {
  const parts = String(v ?? "").split("-").map((s) => num(s));
  return parts.length === 2 && parts[0] != null && parts[1] != null ? parts : [null, null];
}

function shapeQuote(item) {
  const price = num(item.currentPrice);
  if (price == null || price <= 0) return null;
  const f = parseRawQuote(item.rawQuote);
  const [dayLow, dayHigh] = parseRange(f["Day Range"]);
  const [low52, high52] = parseRange(f["52-Week Range"]);
  return {
    price,
    prevClose: num(f["Previous Close"]),
    open: num(f["Opening Price"]),
    dayLow, dayHigh, low52, high52,
    marketCap: num(f["Market Cap"]),
    volume: num(f["Last Volume"]),
    yearChangePct: num(f["Yearly Change (%)"]),
  };
}

const errInfo = (e) => ({
  errorName: e && e.name ? String(e.name) : "Error",
  errorMessage: e && e.message ? String(e.message).slice(0, 400) : String(e).slice(0, 400),
  errorStack: e && e.stack ? String(e.stack).slice(0, 900) : null,
});

/**
 * One upstream chunk, fully accounted for. Never throws — it returns a record
 * describing exactly what happened, including the real exception when fetch
 * fails before any response exists.
 */
async function fetchChunk(index, symbols, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("chunk-timeout"), CHUNK_TIMEOUT_MS);
  const startedAt = Date.now();
  const d = {
    chunk: index,
    symbolsRequested: symbols.length,
    fetchStarted: true,
    fetchCompleted: false,
    status: null,          // null = no HTTP response was ever obtained
    durationMs: 0,
    bodyPreview: null,
    errorName: null, errorMessage: null, errorStack: null,
    aborted: false, abortReason: null,
  };
  try {
    const res = await fetch(UPSTREAM, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        country: symbols.map(() => COUNTRY).join(","),
        ticker_symbol: symbols.join(","),
        type: "stockquote_batch",
        timeout_ms: UPSTREAM_BUDGET_MS,
      }),
    });
    d.fetchCompleted = true;
    d.status = res.status;
    d.durationMs = Date.now() - startedAt;
    if (!res.ok) {
      d.bodyPreview = (await res.text().catch(() => "")).slice(0, BODY_PREVIEW);
      return { d, items: [] };
    }
    const body = await res.json();
    const items = (body && body.data && Array.isArray(body.data.items)) ? body.data.items : [];
    if (!items.length) d.bodyPreview = JSON.stringify(body).slice(0, BODY_PREVIEW);
    return { d, items };
  } catch (e) {
    // The case the first version threw away. `status` stays null — there is no
    // HTTP status, because no response was ever received.
    Object.assign(d, errInfo(e));
    d.durationMs = Date.now() - startedAt;
    d.aborted = ctrl.signal.aborted;
    d.abortReason = ctrl.signal.aborted ? String(ctrl.signal.reason ?? "aborted") : null;
    return { d, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export async function onRequest(context) {
  const startedAt = Date.now();
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED" }, 405);

  const token = env && env.MUNS_TOKEN;
  const meta = {
    version: VERSION,
    deployment: (env && (env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BRANCH)) || null,
    colo: (request.cf && request.cf.colo) || null,
    tokenPresent: !!token,
  };
  if (!token) {
    return json({ ok: false, failureCode: "NOT_CONFIGURED", quotes: {}, fresh: 0, stale: 0, missing: [], errors: [], ...meta });
  }

  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const refresh = !!payload.refresh;
  // `probe` isolates the fetch from the cache: one small chunk, no cache reads
  // or writes at all. If a probe succeeds while a normal call fails, the cache
  // layer is what breaks the request, not the upstream.
  const probe = !!payload.probe;

  const symbols = [...new Set((Array.isArray(payload.symbols) ? payload.symbols : [])
    .filter((s) => typeof s === "string" && /^[A-Za-z0-9&.\-]{1,20}$/.test(s))
    .map((s) => s.toUpperCase()))].slice(0, probe ? 3 : MAX_SYMBOLS);

  const cache = bundleCache("quotes", { ttlS: STALE_S, request });
  const cacheTally = cache.stats;

  if (!symbols.length) {
    return json({
      ok: false, failureCode: "NO_SYMBOLS", upstreamStatus: null,
      quotes: {}, fresh: 0, stale: 0, missing: [], errors: [],
      symbolsReceived: Array.isArray(payload.symbols) ? payload.symbols.length : 0,
      chunksAttempted: 0, chunksSucceeded: 0, chunksFailed: 0,
      totalDurationMs: Date.now() - startedAt, cache: cacheTally, ...meta,
    });
  }

  const now = Date.now();
  const quotes = {};

  // 1. One cache read for every symbol at once. Each entry keeps its own
  //    timestamp, so per-symbol freshness still works.
  const bundle = probe ? {} : await cache.read();
  let needed = [];
  if (probe || refresh) {
    needed = symbols.slice(0, probe ? symbols.length : MAX_FETCH_PER_REQUEST);
  } else {
    const candidates = [];
    for (const sym of symbols) {
      const age = ageS(bundle, sym, now);
      if (age < FRESH_S) quotes[sym] = { ...bundle[sym].v, ageS: Math.round(age) };
      else candidates.push({ sym, age });
    }
    // Never-seen symbols first, then the most stale — so the book fills in
    // quickly and then refreshes in rotation.
    candidates.sort((a, b) => b.age - a.age);
    needed = candidates.slice(0, MAX_FETCH_PER_REQUEST).map((c) => c.sym);
  }

  // 2. Fetch the rest.
  const chunkDiags = [];
  let upstreamStatus = null;   // stays null unless a real HTTP response arrives
  if (needed.length) {
    const chunks = [];
    for (let i = 0; i < needed.length; i += CHUNK) chunks.push(needed.slice(i, i + CHUNK));
    const results = await mapLimit(
      chunks.map((c, i) => ({ c, i })),
      CONCURRENCY,
      ({ c, i }) => fetchChunk(i, c, token),
    );
    const at = Date.now();
    let fetched = 0;
    for (const r of results) {
      chunkDiags.push(r.d);
      if (upstreamStatus == null && r.d.status != null) upstreamStatus = r.d.status;
      for (const item of r.items) {
        const sym = String(item.ticker || "").toUpperCase();
        const q = shapeQuote(item);
        if (!sym || !q) continue;
        quotes[sym] = { ...q, ageS: 0 };
        bundle[sym] = { v: q, at };
        fetched++;
      }
    }
    // One write for the whole book, and only when there is something new.
    if (!probe && fetched) await cache.write(bundle);
  }

  // 3. Last-good fallback for anything this round dropped, so a name doesn't
  //    flicker out of "live" on one bad round.
  let stale = 0;
  const missing = [];
  for (const sym of symbols) {
    if (quotes[sym]) continue;
    const age = ageS(bundle, sym, now);
    if (age < STALE_S) { quotes[sym] = { ...bundle[sym].v, ageS: Math.round(age) }; stale++; }
    else missing.push(sym);
  }

  const fresh = symbols.length - stale - missing.length;
  const chunksFailed = chunkDiags.filter((d) => !d.fetchCompleted || d.status !== 200).length;
  const chunksSucceeded = chunkDiags.length - chunksFailed;
  const errors = chunkDiags
    .filter((d) => d.errorMessage || (d.status != null && d.status !== 200))
    .map((d) => ({
      chunk: d.chunk, status: d.status, durationMs: d.durationMs,
      errorName: d.errorName, errorMessage: d.errorMessage, aborted: d.aborted, abortReason: d.abortReason,
      bodyPreview: d.bodyPreview,
    }));
  if (cacheTally.firstError) errors.push({ chunk: null, ...cacheTally.firstError });

  // Resolving nothing is a failure, not a success with an empty payload. The
  // first version returned ok:true here, which is why the UI confidently
  // rendered "Live" over a book that had no live prices in it at all.
  const nothingResolved = fresh === 0 && stale === 0 && missing.length > 0;
  const noResponseAtAll = chunkDiags.length > 0 && chunkDiags.every((d) => d.status == null);
  const failureCode = !nothingResolved ? null
    : noResponseAtAll ? "UPSTREAM_NO_RESPONSE"
    : upstreamStatus != null ? "UPSTREAM_ERROR"
    : "NO_QUOTES";

  return json({
    ok: !nothingResolved,
    ...(failureCode ? { failureCode } : {}),
    upstreamStatus,
    asOf: new Date().toISOString(),
    quotes, fresh, stale, missing,
    errors,
    symbolsReceived: Array.isArray(payload.symbols) ? payload.symbols.length : 0,
    symbolsAccepted: symbols.length,
    chunksAttempted: chunkDiags.length,
    chunksSucceeded,
    chunksFailed,
    chunks: chunkDiags,
    cache: cacheTally,
    totalDurationMs: Date.now() - startedAt,
    probe,
    ...meta,
  });
}
