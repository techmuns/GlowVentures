// Cloudflare Pages Function — the muns `ratio_source` and `fetch_formula` APIs.
//
// WHAT THESE ARE FOR. The client spec asks to "compare up to four companies
// across Financials, Ratios, Valuation, Returns", and `ratio_source` is the only
// endpoint in the catalogue that takes SEVERAL tickers and SEVERAL metrics in one
// call. Everything else is one ticker per request.
//
// WHAT COMES BACK IS PROSE, AND IT STAYS PROSE
// ────────────────────────────────────────────
// Both endpoints return `text/plain`. Neither documents a schema, and the muns
// docs have already been wrong about stock_data_batch's `type` value, its ticker
// cap and its response format, and about market_data's entire return shape. So
// this endpoint passes the upstream's own words through verbatim and computes
// NOTHING from them. Mining a headline PE out of an undocumented prose blob is
// exactly how a wrong number enters a dashboard whose whole claim is that every
// figure traces to a source.
//
// `fetch_formula` is included because a ratio without its definition is not
// checkable: two providers' "ROCE" are not the same measurement, and the page
// can show what this one means beside the value.
//
// UNVERIFIED AGAINST THE LIVE API. MUNS_TOKEN exists only in the Cloudflare
// environment, so — like research.js — the response shape here could not be
// exercised before shipping. Everything is defensive: an unexpected shape yields
// ok:false with the raw body preview attached rather than a confidently empty
// panel. GET /api/ratios?probe=1&tickers=RELIANCE,TCS&q=PE returns one live
// upstream response for eyeballing on the deployed site.
import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const VERSION = "ratios-fn/1";
const RATIO_SOURCE = "https://fastapi.muns.io/data/ratio_source";
const FETCH_FORMULA = "https://fastapi.muns.io/data/fetch_formula";
const UPSTREAM_TIMEOUT_MS = 20000;
const CACHE_TTL_S = 86400;      // a day — none of this moves intraday
const FRESH_S = 43200;          // 12h
const MAX_TICKERS = 4;          // the spec's own ceiling: "compare up to four"
const MAX_METRICS = 12;
const COUNTRY = "INDIA";
const BODY_PREVIEW = 600;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const errInfo = (e) => ({
  errorName: e && e.name ? String(e.name) : "Error",
  errorMessage: e && e.message ? String(e.message).slice(0, 300) : String(e).slice(0, 300),
});

/** Tickers and metric names are put in a URL, so they are whitelisted, not escaped. */
const cleanTicker = (s) => (/^[A-Za-z0-9&.\-]{1,20}$/.test(s) ? s.toUpperCase() : null);
const cleanMetric = (s) => (/^[A-Za-z0-9 %/().\-_]{1,40}$/.test(s) ? s.trim() : null);

/** `q=PE&q=PB` — the upstream takes repeated params, not a comma-joined list. */
function repeated(name, values) {
  return values.map((v) => `${name}=${encodeURIComponent(v)}`).join("&");
}

async function fetchText(url, token, label) {
  const d = { label, url: url.slice(0, 200), status: null, durationMs: null, bytes: 0 };
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort("timeout"), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { accept: "text/plain", authorization: `Bearer ${token}` },
      signal: ctl.signal,
    });
    d.status = r.status;
    const text = await r.text();
    d.durationMs = Date.now() - started;
    d.bytes = text.length;
    if (!r.ok) { d.bodyPreview = text.slice(0, BODY_PREVIEW); return { diag: d, text: null }; }
    const body = text.trim();
    if (!body) { d.note = "empty body"; return { diag: d, text: null }; }
    return { diag: d, text: body.slice(0, 60000) };
  } catch (e) {
    d.durationMs = Date.now() - started;
    Object.assign(d, errInfo(e), { aborted: ctl.signal.aborted });
    return { diag: d, text: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const started = Date.now();
  const token = env && env.MUNS_TOKEN;
  const meta = {
    version: VERSION,
    deploymentId: (env && (env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BRANCH)) || null,
    colo: request.cf && request.cf.colo ? request.cf.colo : null,
    tokenPresent: !!token,
  };

  // GET probe — one live call, no cache, full diagnostics. This is how the shape
  // gets confirmed on the deployed site, since the token exists nowhere else.
  if (request.method === "GET") {
    const u = new URL(request.url);
    if (!u.searchParams.get("probe")) {
      return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED", hint: "POST {tickers, metrics} or GET ?probe=1", ...meta }, 405);
    }
    if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", ...meta });
    const tickers = (u.searchParams.get("tickers") || "RELIANCE").split(",").map(cleanTicker).filter(Boolean).slice(0, MAX_TICKERS);
    const metrics = (u.searchParams.get("q") || "PE").split(",").map(cleanMetric).filter(Boolean).slice(0, MAX_METRICS);
    const url = `${RATIO_SOURCE}?${repeated("q", metrics)}&${repeated("tickers", tickers)}&${repeated("countries", tickers.map(() => COUNTRY))}`;
    const { diag, text } = await fetchText(url, token, "ratio_source");
    return json({ ok: !!text, failureCode: text ? null : "PROBE_FAILED", tickers, metrics, text, diagnostics: [diag], ...meta });
  }

  if (request.method !== "POST") return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED" }, 405);
  if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", reason: "not_configured", ...meta });

  let body = {};
  try { body = await request.json(); } catch { /* defaults below */ }

  const tickers = [...new Set((Array.isArray(body.tickers) ? body.tickers : [])
    .map((t) => cleanTicker(String(t ?? "")))
    .filter(Boolean))].slice(0, MAX_TICKERS);
  const metrics = [...new Set((Array.isArray(body.metrics) ? body.metrics : [])
    .map((m) => cleanMetric(String(m ?? "")))
    .filter(Boolean))].slice(0, MAX_METRICS);
  // Definitions are optional and cost a second subrequest, so they are asked for
  // explicitly rather than fetched on every comparison.
  const wantFormulas = !!body.formulas;

  if (!tickers.length) return json({ ok: false, failureCode: "NO_TICKERS", ...meta }, 400);
  if (!metrics.length) return json({ ok: false, failureCode: "NO_METRICS", ...meta }, 400);

  // Cached on the WHOLE ask, because the upstream answers the whole ask in one
  // prose blob — there is no per-ticker value to cache separately without
  // parsing the blob, and parsing it is exactly what this endpoint will not do.
  const key = `${tickers.join(",")}|${metrics.join(",")}`;
  const cache = bundleCache("ratios", { ttlS: CACHE_TTL_S, version: "v1", request });
  const bundle = await cache.read();
  const now = Date.now();
  if (ageS(bundle, key, now) < FRESH_S && bundle[key] && bundle[key].v) {
    return json({
      ok: true, cached: true, tickers, metrics,
      ...bundle[key].v, totalDurationMs: Date.now() - started, cacheStats: cache.stats, ...meta,
    });
  }

  const url = `${RATIO_SOURCE}?${repeated("q", metrics)}&${repeated("tickers", tickers)}&${repeated("countries", tickers.map(() => COUNTRY))}`;
  const ratios = await fetchText(url, token, "ratio_source");

  let formulas = { diag: null, text: null };
  if (wantFormulas) {
    formulas = await fetchText(`${FETCH_FORMULA}?${repeated("q", metrics)}`, token, "fetch_formula");
  }

  const value = ratios.text ? { text: ratios.text, formulas: formulas.text ?? null, format: "text" } : null;
  if (value) {
    bundle[key] = { v: value, at: now };
    await cache.write(bundle);
  }

  const d = ratios.diag;
  const failureCode = value ? null
    : d.status == null ? "UPSTREAM_NO_RESPONSE"
    : d.status === 401 || d.status === 403 ? "UPSTREAM_UNAUTHORISED"
    : d.status !== 200 ? "UPSTREAM_ERROR"
    : "EMPTY_RESPONSE";

  return json({
    ok: !!value,
    failureCode,
    cached: false,
    tickers, metrics,
    ...(value || {}),
    upstreamStatus: d.status,
    totalDurationMs: Date.now() - started,
    cacheStats: cache.stats,
    diagnostics: [d, ...(formulas.diag ? [formulas.diag] : [])],
    ...meta,
  });
}
