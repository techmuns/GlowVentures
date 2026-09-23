// Cloudflare Pages Function — the full daily price history for ONE security,
// plus the spec's returns table computed from it.
//
// WHY A PROXY HERE AND A STORE FOR MACRO
// ──────────────────────────────────────
// Macro Research shows forty series in one table, so forty live fetches per page
// load is not an option and `public/series/` is harvested nightly instead. A
// COMPANY page shows one company. One edge-cached fetch answers it completely,
// with no repository storage and no nightly churn — committing 140 securities'
// daily history would add megabytes of git objects every trading day forever.
// Store what is read in aggregate; proxy what is read one at a time.
//
// WHAT THIS REPLACES. `functions/api/history.js` asks the muns `market_data`
// endpoint one question per date because that endpoint returns a four-row
// PREVIEW of any window and cannot yield a series (see the note at the top of
// that file). So the company page had a returns table built from ten individual
// lookups and NO CHART AT ALL. Yahoo's chart endpoint returns the whole daily
// history in one call — Aurobindo Pharma comes back with 7,672 closes from 1996
// — which makes both the chart and an honest max-available CAGR possible.
//
// THE RETURNS MATH IS SHARED WITH THE HARVESTER, deliberately: `computeReturns`
// lives in `shared/seriesReturns.mjs` and is imported by both, so the horizon
// rules — every horizon independent, a horizon the series cannot reach is null,
// a yield is never a CAGR — cannot drift between the macro page and this one.
import { computeReturns } from "../../shared/seriesReturns.mjs";

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (compatible; GlowVenturesDashboard/1.0)";
const TIMEOUT_MS = 20000;
// Closes are final; only today's bar can still move, and it is excluded anyway.
// Six hours keeps a company page instant without pinning a stale last close.
const CACHE_TTL_S = 6 * 3600;

const json = (obj, cacheControl) =>
  new Response(JSON.stringify(obj), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl || "no-store",
    },
  });

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get("symbol") || "").trim();
  if (!symbol) return json({ ok: false, reason: "no symbol" });
  // NSE listings need the .NS suffix; the caller passes the bare NSE symbol and
  // the exchange suffix is applied here so one convention lives in one place.
  const suffix = url.searchParams.get("suffix") ?? ".NS";
  const yahooSymbol = symbol.includes(".") || symbol.startsWith("^") ? symbol : symbol + suffix;

  const cache = caches.default;
  // v2: the body carries the instrument's NAME now (see below), and an entry
  // cached under v1 would hand a benchmark a history with no name to check —
  // which it correctly refuses, so a stale v1 hit would blank a working line.
  const key = new Request(`${url.origin}/__cache/prices/v2/${encodeURIComponent(yahooSymbol)}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let data;
  try {
    // `period1/period2` rather than `range=max`: a long `range` comes back
    // COARSENED to weekly or monthly bars, which is fine for a decade-long chart
    // and silently ruins every short-horizon return computed from it.
    const r = await fetch(
      `${CHART}/${encodeURIComponent(yahooSymbol)}?period1=0&period2=9999999999&interval=1d`,
      { headers: { "User-Agent": UA, accept: "application/json" }, signal: controller.signal },
    );
    if (!r.ok) return json({ ok: false, reason: `http_${r.status}`, symbol: yahooSymbol });
    data = await r.json();
  } catch (e) {
    return json({ ok: false, reason: e.name === "AbortError" ? "timeout" : "unreachable", symbol: yahooSymbol });
  } finally {
    clearTimeout(timer);
  }

  const res = data?.chart?.result?.[0];
  if (!res) {
    const err = data?.chart?.error?.description || "no result";
    return json({ ok: false, reason: err, symbol: yahooSymbol });
  }

  const stamps = res.timestamp ?? [];
  const closes = res.indicators?.quote?.[0]?.close ?? [];
  // ONLY SETTLED SESSIONS. Yahoo appends an in-progress bar whose "close" is the
  // last trade and moves all day; including it would measure a 1-day return
  // against a price that was never a close. The live price belongs to the quote
  // feed, which the page already reads separately and labels as live.
  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map();
  for (let i = 0; i < stamps.length; i++) {
    const v = closes[i];
    if (!Number.isFinite(v)) continue;
    const t = new Date(stamps[i] * 1000).toISOString().slice(0, 10);
    if (t >= today) continue;
    byDate.set(t, v);
  }
  const points = [...byDate.entries()]
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

  if (!points.length) return json({ ok: false, reason: "no settled closes", symbol: yahooSymbol });

  const stats = computeReturns(points, "price", "daily");

  const body = {
    ok: true,
    source: "Yahoo Finance",
    symbol: yahooSymbol,
    currency: res.meta?.currency ?? null,
    exchange: res.meta?.fullExchangeName ?? null,
    // WHAT THE UPSTREAM CALLED IT, handed back verbatim. The NAV chart's
    // benchmark control checks this against the name each index declares
    // before drawing a close — trap 2 in `indices.js`: a symbol that looks
    // right answers 200 with a well-formed figure for a different instrument.
    // Reported, never corrected here; the caller decides what it will accept.
    name: res.meta?.longName ?? res.meta?.shortName ?? null,
    longName: res.meta?.longName ?? null,
    shortName: res.meta?.shortName ?? null,
    first: points[0].t,
    last: points[points.length - 1].t,
    count: points.length,
    last_value: stats.last,
    returns: stats.returns,
    spans: stats.spans,
    high52: stats.high52 == null ? null : Number(stats.high52.toFixed(4)),
    low52: stats.low52 == null ? null : Number(stats.low52.toFixed(4)),
    // Columnar, like the series store's chunks — a 7,000-point history is
    // meaningfully smaller as two arrays than as 7,000 objects.
    t: points.map((p) => p.t),
    v: points.map((p) => Number(p.v.toFixed(4))),
  };

  const resp = json(body, `public, max-age=${CACHE_TTL_S}`);
  context.waitUntil(cache.put(key, resp.clone()));
  return resp;
}
