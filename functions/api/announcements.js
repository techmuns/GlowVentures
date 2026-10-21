// Cloudflare Pages Function — server-side proxy for the muns corporate-announcements
// (NSE/BSE filings) API. Same guarantees as functions/api/news.js: MUNS_TOKEN stays
// in the Pages env (never sent to the browser), the endpoint is behind the site
// password (the auth middleware runs on /api/* too), and each ticker's filings are
// edge-cached for the day.
//
// The client sends the holdings' NSE symbols (resolved from ISIN via
// src/data/nseSymbols.json). We query the last WINDOW_DAYS of filings per symbol,
// tag each with its holding, de-duplicate, and return a newest-first feed.
//
// Failure honesty: if EVERY ticker call fails (e.g. the token doesn't authorize this
// host), we return { ok:false, reason:"upstream_error", status } so the UI can say so
// — instead of an empty list that reads like "no filings exist".

import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const UPSTREAM = "https://birdnest.muns.io/filings/corp/announcements";
const MAX_SYMBOLS = 24;
const PER_SYMBOL = 6;
const MAX_ITEMS = 80;
const WINDOW_DAYS = 180;
const UPSTREAM_TIMEOUT_MS = 12000;
const FETCH_CONCURRENCY = 5;   // tickers hit at once per invocation — gentle on the
                               // upstream so it doesn't rate-limit the whole batch
const CACHE_TTL_S = 86400;
const RETRYABLE = (s) => s === 0 || s === 429 || s >= 500; // rate-limit / 5xx / timeout

function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); } // YYYYMMDD

// Run `fn` over `arr` with at most `limit` in flight; preserves order. Never throws
// (each fn already resolves to a {status,…} object), mirroring Promise.allSettled.
async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  const worker = async () => { while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx], idx); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, arr.length)) }, worker));
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Returns { status, items }: status is the upstream HTTP status (200 on success,
// the error code otherwise, 0 on network/timeout). items only populated on 200.
async function fetchAnnFor(symbol, token, fromDate, toDate, signal) {
  const url = `${UPSTREAM}/${encodeURIComponent(symbol)}?fromDate=${fromDate}&toDate=${toDate}`;
  const r = await fetch(url, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal,
  });
  if (!r.ok) return { status: r.status, items: [] };
  let data;
  try { data = await r.json(); } catch { return { status: 200, items: [] }; }
  const out = [];
  const sources = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? [data] : []);
  for (const src of sources) {
    const source = src && src.source ? String(src.source) : "";
    const items = src && Array.isArray(src.data) ? src.data : [];
    for (const it of items) {
      if (!it || !it.title) continue;
      out.push({
        title: String(it.title),
        desc: String(it.desc ?? it.description ?? ""),
        date: String(it.date ?? ""),
        attachment: it.attachment ? String(it.attachment) : "",
        source,
        symbol: String(it.symbol ?? symbol),
      });
    }
  }
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { status: 200, items: out.slice(0, PER_SYMBOL) };
}

// Cache key for one symbol's daily announcements pull.
const annKey = (day, symbol) => `${day}|${symbol}`;

// Fetch one symbol. The caller reads and writes the shared bundle around this,
// so nothing here touches the cache.
async function fetchOneSymbol(symbol, token, fromDate, toDate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetchAnnFor(symbol, token, fromDate, toDate, controller.signal);
  } catch {
    return { status: 0, items: [] };
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
    .filter((h) => h && typeof h.symbol === "string" && /^[A-Za-z0-9&-]{1,20}$/.test(h.symbol))
    .slice(0, MAX_SYMBOLS)
    .map((h) => ({ symbol: String(h.symbol).toUpperCase(), name: String(h.name || h.symbol).slice(0, 120), key: String(h.key || "").slice(0, 160) }));

  if (!holdings.length) {
    return json({ ok: true, generatedAt: new Date().toISOString(), count: 0, items: [], symbolsSearched: 0, symbolsWithData: 0 });
  }

  const today = new Date();
  const from = new Date(today.getTime() - WINDOW_DAYS * 864e5);
  const toDate = ymd(today);
  const fromDate = ymd(from);
  const day = toDate;

  // One cache read for every symbol, one write at the end. This used to be a
  // read and a write per symbol, which pushed the request past Cloudflare's
  // free-plan subrequest budget — the writes were refused, so nothing cached and
  // the upstream was hit for every symbol on every load.
  const cache = bundleCache("announcements", { ttlS: CACHE_TTL_S, request });
  const bundle = refresh ? {} : await cache.read();
  const now = Date.now();
  const pending = holdings.filter((h) => ageS(bundle, annKey(day, h.symbol), now) >= CACHE_TTL_S);
  const fetched = new Map();
  if (pending.length) {
    const got = await mapLimit(pending, FETCH_CONCURRENCY, (h) => fetchOneSymbol(h.symbol, token, fromDate, toDate));
    const at = Date.now();
    let stored = 0;
    got.forEach((res, i) => {
      fetched.set(pending[i].symbol, res);
      if (res && res.status === 200) { bundle[annKey(day, pending[i].symbol)] = { v: res.items, at }; stored++; }
    });
    if (stored) await cache.write(bundle);
  }
  const results = holdings.map((h) => {
    const fresh = fetched.get(h.symbol);
    if (fresh) return fresh;
    const rec = bundle[annKey(day, h.symbol)];
    return { status: 200, items: rec ? rec.v : [] };
  });

  const seen = new Set();
  const items = [];
  let okCount = 0;
  const failed = [];
  const statusTally = {};
  results.forEach((res, i) => {
    const val = res || { status: 0, items: [] };
    const h = holdings[i];
    if (val.status === 200) {
      okCount++;
      for (const a of val.items) {
        const dedupe = a.attachment || `${a.symbol}|${a.title}|${a.date}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        items.push({ ...a, holding: h.name, key: h.key });
      }
    } else if (RETRYABLE(val.status)) {
      failed.push(h.key);
      statusTally[val.status] = (statusTally[val.status] || 0) + 1;
    } else {
      statusTally[val.status] = (statusTally[val.status] || 0) + 1;
    }
  });

  // A hard failure only if nothing succeeded AND nothing is worth retrying (e.g. auth).
  // Retryable failures (rate-limit / 5xx / timeout) go back to the client in `failed`.
  if (okCount === 0 && failed.length === 0) {
    const top = Object.entries(statusTally).sort((a, b) => b[1] - a[1])[0];
    return json({ ok: false, reason: "upstream_error", status: top ? Number(top[0]) : 0, symbolsSearched: 0 });
  }

  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    count: Math.min(items.length, MAX_ITEMS),
    items: items.slice(0, MAX_ITEMS),
    symbolsSearched: okCount,
    symbolsWithData: okCount,
    failed,
  });
}
