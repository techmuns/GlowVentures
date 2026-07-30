// Cloudflare Pages Function — the three research endpoints behind Stock Info:
// street estimates, screener financial tables, and concall / filing documents.
//
// One function rather than three because they share everything that matters: the
// same token, the same one-ticker-per-request shape, the same edge cache, and the
// same "hand the upstream's own words through, don't mine them for numbers"
// contract. `kind` in the POST body selects which.
//
// WHY NOTHING HERE IS PARSED INTO NUMBERS
// ───────────────────────────────────────
// street_estimates returns text/plain and financial_tables_markdown returns
// markdown scraped from screener.in. Turning prose into headline figures is
// exactly where a wrong number enters a dashboard whose whole claim is that every
// figure traces to a source. So these are passed through verbatim for a human to
// read, and nothing on the page computes against them.
//
// UNVERIFIED RESPONSE SHAPES
// ──────────────────────────
// All three refuse an unauthenticated request (403 on fastapi, 401 on devde), and
// MUNS_TOKEN only exists in the Cloudflare environment — so unlike the quote and
// history feeds, these could not be exercised against the real API before
// shipping. The doc has already been wrong about stock_data_batch's `type` value,
// its ticker cap, its response format, and market_data's entire return shape, so
// treat the field mapping below as a first guess, not a fact. Everything is
// defensive: an unexpected shape yields `ok:false` with the raw body preview
// attached rather than a confidently empty panel. GET /api/research?probe=<kind>
// returns one live upstream response for eyeballing on the deployed site.
import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const VERSION = "research-fn/1";
const UPSTREAM_TIMEOUT_MS = 20000;
const CACHE_TTL_S = 86400;   // a day — none of this moves intraday
const FRESH_S = 43200;       // 12h

const KINDS = {
  estimates: {
    label: "Street estimates",
    url: (t) => `https://fastapi.muns.io/data/street_estimates?ticker=${encodeURIComponent(t)}&country=INDIA`,
    method: "GET",
    accept: "text/plain",
    format: "text",
  },
  financials: {
    label: "Financial tables",
    url: (t) => `https://devde.muns.io/filings/financial_tables/markdown/${encodeURIComponent(t)}?form=consolidated`,
    method: "GET",
    accept: "text/plain",
    format: "markdown",
  },
  concalls: {
    label: "Concalls & filings",
    url: () => "https://devde.muns.io/filings/domestic",
    method: "POST",
    accept: "application/json",
    body: (t) => JSON.stringify({ ticker: t, form: "concalls" }),
    format: "json",
  },
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function errInfo(e) {
  return {
    errorName: e && e.name ? String(e.name) : "Error",
    errorMessage: e && e.message ? String(e.message).slice(0, 300) : String(e).slice(0, 300),
    errorStack: e && e.stack ? String(e.stack).slice(0, 600) : null,
  };
}

/**
 * Pull document links out of whatever filings/domestic actually returns.
 *
 * The doc doesn't give the response shape, so rather than guess one key this
 * walks the JSON and collects anything that looks like a document: an object with
 * a URL-ish string in it. Unrecognised shapes come back as zero documents plus
 * the raw payload, never as a silent empty list.
 */
export function collectDocs(payload, cap = 40) {
  const out = [];
  const seen = new Set();
  const urlish = (v) => typeof v === "string" && /^https?:\/\//i.test(v) && v.length < 2000;
  const walk = (node, depth) => {
    if (out.length >= cap || depth > 6 || node == null) return;
    if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
    if (typeof node !== "object") return;
    let url = null, title = null, date = null;
    for (const [k, v] of Object.entries(node)) {
      const key = k.toLowerCase();
      if (!url && urlish(v) && /(url|link|href|pdf|doc|file)/.test(key)) url = v;
      if (!title && typeof v === "string" && /(title|name|subject|desc|heading)/.test(key)) title = v;
      if (!date && typeof v === "string" && /(date|period|quarter|time)/.test(key)) date = v;
    }
    if (!url) for (const v of Object.values(node)) if (urlish(v)) { url = v; break; }
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push({ url, title: (title || "Document").slice(0, 200), date: date ? String(date).slice(0, 40) : null });
    }
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(payload, 0);
  return out;
}

async function fetchOne(kind, ticker, token) {
  const spec = KINDS[kind];
  const d = { kind, ticker, fetchStarted: Date.now(), status: null, durationMs: null };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort("timeout"), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(spec.url(ticker), {
      method: spec.method,
      headers: {
        accept: spec.accept,
        authorization: `Bearer ${token}`,
        ...(spec.body ? { "content-type": "application/json" } : {}),
      },
      ...(spec.body ? { body: spec.body(ticker) } : {}),
      signal: ctl.signal,
    });
    d.status = r.status;
    const text = await r.text();
    d.durationMs = Date.now() - d.fetchStarted;
    d.bytes = text.length;
    if (!r.ok) { d.bodyPreview = text.slice(0, 400); return { diag: d, value: null }; }

    if (spec.format === "json") {
      let payload = null;
      try { payload = JSON.parse(text); } catch { /* handled below */ }
      if (payload == null) {
        d.note = "upstream did not return JSON";
        d.bodyPreview = text.slice(0, 400);
        return { diag: d, value: null };
      }
      const docs = collectDocs(payload);
      d.docs = docs.length;
      // Zero documents from a 200 is more likely an unexpected shape than a
      // company with no concalls, so the raw payload rides along for inspection.
      return { diag: d, value: { format: "documents", documents: docs, raw: docs.length ? null : text.slice(0, 4000) } };
    }

    const body = text.trim();
    if (!body) { d.note = "empty body"; return { diag: d, value: null }; }
    return { diag: d, value: { format: spec.format, text: body.slice(0, 60000) } };
  } catch (e) {
    d.durationMs = Date.now() - d.fetchStarted;
    Object.assign(d, errInfo(e), { aborted: ctl.signal.aborted, abortReason: String(ctl.signal.reason ?? "") });
    return { diag: d, value: null };
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

  // GET /api/research?probe=financials&ticker=RELIANCE — one live call, no cache,
  // full diagnostics. This is how the response shapes get confirmed on the
  // deployed site, since the token doesn't exist anywhere else.
  if (request.method === "GET") {
    const u = new URL(request.url);
    const kind = u.searchParams.get("probe");
    if (!kind || !KINDS[kind]) return json({ ok: false, failureCode: "BAD_KIND", kinds: Object.keys(KINDS), ...meta }, 400);
    if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", ...meta });
    const ticker = (u.searchParams.get("ticker") || "RELIANCE").toUpperCase();
    const { diag, value } = await fetchOne(kind, ticker, token);
    return json({ ok: !!value, failureCode: value ? null : "PROBE_FAILED", kind, ticker, value, diagnostics: [diag], ...meta });
  }
  if (request.method !== "POST") return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED" }, 405);
  if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", reason: "not_configured", ...meta });

  let body = {};
  try { body = await request.json(); } catch { /* defaults below */ }
  const kind = typeof body.kind === "string" ? body.kind : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!KINDS[kind]) return json({ ok: false, failureCode: "BAD_KIND", kinds: Object.keys(KINDS), ...meta }, 400);
  if (!ticker) return json({ ok: false, failureCode: "NO_TICKER", ...meta }, 400);

  const cache = bundleCache(`research/${kind}`, { ttlS: CACHE_TTL_S, version: "v1", request });
  const bundle = await cache.read();
  const now = Date.now();
  if (ageS(bundle, ticker, now) < FRESH_S && bundle[ticker] && bundle[ticker].v) {
    return json({
      ok: true, kind, ticker, label: KINDS[kind].label, cached: true,
      ...bundle[ticker].v, totalDurationMs: Date.now() - started, cacheStats: cache.stats, ...meta,
    });
  }

  const { diag, value } = await fetchOne(kind, ticker, token);
  if (value) {
    bundle[ticker] = { v: value, at: now };
    await cache.write(bundle);
  }
  const failureCode = value ? null
    : diag.status == null ? "UPSTREAM_NO_RESPONSE"
    : diag.status === 401 || diag.status === 403 ? "UPSTREAM_UNAUTHORISED"
    : diag.status !== 200 ? "UPSTREAM_ERROR"
    : "EMPTY_RESPONSE";

  return json({
    ok: !!value,
    failureCode,
    kind, ticker, label: KINDS[kind].label, cached: false,
    ...(value || {}),
    upstreamStatus: diag.status,
    totalDurationMs: Date.now() - started,
    cacheStats: cache.stats,
    diagnostics: [diag],
    ...meta,
  });
}
