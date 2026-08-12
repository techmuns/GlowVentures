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

const VERSION = "ratios-fn/2";
const RATIO_SOURCE = "https://fastapi.muns.io/data/ratio_source";
const FETCH_FORMULA = "https://fastapi.muns.io/data/fetch_formula";
const WEB_READER = "https://fastapi.muns.io/tools/web-reader";
/**
 * `ratio_source` hands back a moneycontrol URL, and only moneycontrol.
 *
 * The prefix is checked before the URL is fetched, for the same reason
 * `functions/api/probe.js` allowlists its reader targets: this call carries the
 * house token, and following an arbitrary URL out of an upstream response with
 * an Authorization header attached is a token-exfiltration surface — one where
 * the untrusted party is the upstream itself.
 */
const READER_ALLOWED = ["https://www.moneycontrol.com/", "https://moneycontrol.com/"];
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

/**
 * The OTHER HALF of `ratio_source`'s answer.
 *
 * It does not return ratios. It returns a moneycontrol URL and the literal
 * instruction "Use WebReader Tool", which is why this endpoint's prose is
 * passed through verbatim and nothing is computed from it. Probed on
 * 2026-08-12, following that instruction returns ~32 KB in which the ratio
 * table IS present and labelled on both axes — seven year-ends of per-share
 * ratios, margins, returns and liquidity. So the chain completes, and a table
 * with an "Indicators" row axis and "Mar 26 … Mar 20" columns is a table, not
 * a sentence to be mined.
 *
 * ── AND THE RESOLVER GETS THE COMPANY WRONG ─────────────────────────────────
 *
 * Measured across six tickers, five resolved correctly and ABCAPITAL resolved
 * to `moneycontrol.com/financials/TATACAPITAL/ratiosVI/TCL06` — a different
 * company. Rendering that under Aditya Birla Capital's name would be a
 * fabricated attribution of the worst kind: every figure real, every one
 * belonging to somebody else.
 *
 * So the page's own H1 ("# Reliance Key Financial Ratios") is extracted and
 * returned as `sourceCompany`, and the CALLER — which knows what company it
 * asked about — refuses the table when it does not match. The check is not
 * made here because this function does not know the holding's name; it reports
 * what the page says it is, which is the fact it can establish.
 */
async function fetchRatioTable(ticker, token, diagnostics) {
  const srcUrl = `${RATIO_SOURCE}?q=${encodeURIComponent("Key Financial Ratios")}&tickers=${encodeURIComponent(ticker)}&countries=${COUNTRY}`;

  // ONE RETRY, BECAUSE THE MEASURED FAILURE IS A FLAP AND NOT A VERDICT.
  // This upstream answers 502 in under a second and then answers properly
  // moments later — observed repeatedly on 2026-08-12, on tickers that work.
  // A single attempt therefore reports "no ratios for this company" about a
  // company whose ratios are there, which is an absence recorded against the
  // wrong cause. Bounded at one: a retry loop against a genuinely dead service
  // is just a slower failure.
  let src = await fetchText(srcUrl, token, "ratio_source");
  diagnostics.push(src.diag);
  if (!src.text && (src.diag.status === 502 || src.diag.status === 503 || src.diag.status == null)) {
    await new Promise((r) => setTimeout(r, 1200));
    src = await fetchText(srcUrl, token, "ratio_source (retry)");
    diagnostics.push(src.diag);
  }
  if (!src.text) return { value: null, failure: src.diag.status == null ? "UPSTREAM_NO_RESPONSE" : "UPSTREAM_ERROR", upstreamStatus: src.diag.status };

  const url = (src.text.match(/https?:\/\/\S+/) ?? [null])[0];
  if (!url) return { value: null, failure: "NO_SOURCE_URL", pointer: src.text.slice(0, 400) };
  if (!READER_ALLOWED.some((p) => url.startsWith(p))) {
    return { value: null, failure: "SOURCE_URL_NOT_ALLOWED", pointer: url };
  }

  const d = { label: "web-reader", url: url.slice(0, 200), status: null, durationMs: null, bytes: 0 };
  const startedAt = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort("timeout"), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(WEB_READER, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ urls: [url] }),
      signal: ctl.signal,
    });
    d.status = r.status;
    const text = await r.text();
    d.durationMs = Date.now() - startedAt;
    d.bytes = text.length;
    diagnostics.push(d);
    if (!r.ok) { d.bodyPreview = text.slice(0, BODY_PREVIEW); return { value: null, failure: "READER_ERROR", pointer: url }; }

    let payload = null;
    try { payload = JSON.parse(text); } catch { /* handled below */ }
    const content = payload && Array.isArray(payload.results) ? String(payload.results[0]?.content ?? "") : "";
    if (!content || /failed to extract readable text/i.test(content)) {
      d.note = "reader returned no readable text";
      return { value: null, failure: "READER_EMPTY", pointer: url };
    }
    // "# Reliance Key Financial Ratios" — the page's own claim about whose
    // ratios these are. Reported, never trusted silently.
    const h1 = /^#\s+(.+?)\s+Key Financial Ratios\s*$/m.exec(content);
    return {
      value: {
        format: "ratio-table",
        sourceUrl: url,
        sourceCompany: h1 ? h1[1].trim() : null,
        text: content.slice(0, 120000),
      },
      failure: null,
    };
  } catch (e) {
    d.durationMs = Date.now() - startedAt;
    Object.assign(d, errInfo(e), { aborted: ctl.signal.aborted });
    diagnostics.push(d);
    return { value: null, failure: "UPSTREAM_NO_RESPONSE", pointer: url };
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

  // POST { table: true, ticker } — the ratio_source → web_reader chain, one
  // company at a time, cached on the ticker.
  if (body.table) {
    const ticker = cleanTicker(String(body.ticker ?? ""));
    if (!ticker) return json({ ok: false, failureCode: "NO_TICKERS", ...meta }, 400);
    const cache = bundleCache("ratio-table", { ttlS: CACHE_TTL_S, version: "v1", request });
    const bundle = await cache.read();
    const now = Date.now();
    if (ageS(bundle, ticker, now) < FRESH_S && bundle[ticker] && bundle[ticker].v) {
      return json({ ok: true, cached: true, ticker, ...bundle[ticker].v, totalDurationMs: Date.now() - started, ...meta });
    }
    const diagnostics = [];
    const { value, failure, pointer, upstreamStatus } = await fetchRatioTable(ticker, token, diagnostics);
    if (value) {
      bundle[ticker] = { v: value, at: now };
      await cache.write(bundle);
      return json({ ok: true, cached: false, ticker, ...value, totalDurationMs: Date.now() - started, diagnostics, ...meta });
    }
    // STALE BEATS NOTHING, and the age travels with it — the same rule the
    // research endpoint follows, and for the same reason: a ratio table does
    // not move intraday, and this upstream was measured down twice in nineteen
    // hours.
    const held = bundle[ticker];
    if (held && held.v) {
      return json({
        ok: true, cached: true, stale: true, ticker,
        ageS: Math.round(ageS(bundle, ticker, now)), servedAt: new Date(held.at).toISOString(),
        upstreamFailure: failure, ...held.v,
        totalDurationMs: Date.now() - started, diagnostics, ...meta,
      });
    }
    return json({ ok: false, failureCode: failure, ticker, pointer: pointer ?? null, upstreamStatus: upstreamStatus ?? null, diagnostics, totalDurationMs: Date.now() - started, ...meta });
  }

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
