// DIAGNOSTIC — exercise muns catalogue endpoints this dashboard does NOT yet
// use, against the live API, from the one place `MUNS_TOKEN` exists.
//
// WHY IT HAS TO BE AN ENDPOINT. The token lives in the Cloudflare Pages
// environment and nowhere else, so no local script can call these. Four
// questions decide a large part of the remaining backlog and none of them can
// be answered by reading the documentation — which this repo has already caught
// being wrong: it still documents `type: "stockquote"` for the batch quote
// endpoint, and that value 422s (`stockquote_batch` is required).
//
// ── WHY IT IS AN ALLOWLIST AND NOT A PROXY ──────────────────────────────────
//
// The obvious version of this file takes a URL and forwards it with the house
// token attached. That is a token-exfiltration surface: point it at a host that
// logs request headers and the token leaves the building. The site password
// does not fix that — it narrows who can do it, not what it does.
//
// So NOTHING here is caller-supplied except values interpolated into a fixed
// upstream URL, and `web-reader`'s target must match one of a few declared
// prefixes. The `Authorization` header only ever travels to fastapi.muns.io or
// devde.muns.io, and this endpoint cannot be used as a general web scraper on
// the family's quota.
//
// It is safe to leave deployed. Its output is a shape report, never a figure
// the dashboard renders — nothing in the app reads it.

const FASTAPI = "https://fastapi.muns.io";
const NESTJS = "https://devde.muns.io";

/**
 * Hosts `web-reader` may be pointed at.
 *
 * Two groups, and each is a question:
 *   • moneycontrol — `ratio_source` answers with a moneycontrol URL and the
 *     literal instruction "Use WebReader Tool". This is the other half of that
 *     chain, and whether it returns a readable ratio table decides ~15 items.
 *   • the Indian statistical sources — MoSPI, RBI, CEA, NHB and the rest refuse
 *     connections from both a dev container and a GitHub runner, which are both
 *     outside India. If muns can read them, that replaces an infrastructure
 *     decision (a self-hosted Indian runner) with an API call.
 */
const READER_PREFIXES = [
  "https://www.moneycontrol.com/",
  "https://www.screener.in/",
  "https://mospi.gov.in/",
  "https://www.mospi.gov.in/",
  "https://rbi.org.in/",
  "https://website.rbi.org.in/",
  "https://rbidocs.rbi.org.in/",
  "https://cea.nic.in/",
  "https://nhb.org.in/",
  "https://www.nsdl.co.in/",
  "https://nsdl.co.in/",
  "https://www.pib.gov.in/",
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** What a body looks like, without dumping megabytes into the response. */
function describe(text, contentType) {
  const out = { contentType, bytes: text.length, preview: text.slice(0, 1200) };
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const j = JSON.parse(t);
      out.parsedAs = Array.isArray(j) ? "array" : "object";
      out.topLevelKeys = Array.isArray(j) ? `${j.length} items` : Object.keys(j).slice(0, 30);
      if (Array.isArray(j) && j.length) out.firstItemKeys = Object.keys(j[0] ?? {}).slice(0, 30);
    } catch { out.parsedAs = "looked like JSON but did not parse"; }
  } else {
    // Markdown sections and pipe tables are what the financials reader needs, so
    // they are counted explicitly rather than left for a human to eyeball.
    out.parsedAs = "text";
    out.markdownSections = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 40);
    out.pipeTableRows = (text.match(/^\s*\|/gm) ?? []).length;
    out.lineCount = text.split("\n").length;
  }
  return out;
}

async function call(url, { method = "GET", token, body }) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort("timeout"), 45000);
  try {
    const r = await fetch(url, {
      method,
      headers: {
        accept: "*/*",
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      signal: ctl.signal,
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, durationMs: Date.now() - started, upstream: url, ...describe(text, r.headers.get("content-type")) };
  } catch (e) {
    return { ok: false, status: null, durationMs: Date.now() - started, upstream: url, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const token = env && env.MUNS_TOKEN;
  const u = new URL(request.url);
  const name = u.searchParams.get("call") ?? "";
  const meta = { version: "probe-fn/1", tokenPresent: !!token };

  const CALLS = {
    /** The other half of `ratio_source`'s "Use WebReader Tool" instruction. */
    "web-reader": () => {
      const target = u.searchParams.get("url") ?? "";
      if (!READER_PREFIXES.some((p) => target.startsWith(p))) {
        return { error: "url not in the declared prefix allowlist", allowed: READER_PREFIXES };
      }
      return {
        url: `${FASTAPI}/tools/web-reader`,
        method: "POST",
        body: JSON.stringify({ urls: [target], task: u.searchParams.get("task") || undefined }),
      };
    },
    "web-search": () => ({
      url: `${FASTAPI}/tools/web-search`,
      method: "POST",
      body: JSON.stringify({ query: u.searchParams.get("q") || "India CPI latest release", country: "IN" }),
    }),
    /** Documented to carry cash flow and a calendar for the USA path. Does India? */
    "combined-financials": () => ({
      url: `${NESTJS}/filings/combined_financials`,
      method: "POST",
      body: JSON.stringify({
        ticker: (u.searchParams.get("ticker") || "RELIANCE").toUpperCase(),
        country: u.searchParams.get("country") || "India",
        q: "consolidated",
      }),
    }),
    /** JSON financial statements — structured, if it works, beats parsing markdown. */
    "financials-json": () => ({
      url: `${FASTAPI}/financials/${encodeURIComponent((u.searchParams.get("ticker") || "RELIANCE").toUpperCase())}`,
      method: "POST",
      body: JSON.stringify({ period: u.searchParams.get("period") || "annual" }),
    }),
    /** Does `csv=true` return a full series, or the four-row preview on record? */
    "market-data": () => {
      const t = encodeURIComponent((u.searchParams.get("ticker") || "RELIANCE").toUpperCase());
      const start = u.searchParams.get("start") || "2024-01-01";
      const end = u.searchParams.get("end") || "2026-08-01";
      const csv = u.searchParams.get("csv") === "0" ? "" : "&csv=true";
      return { url: `${FASTAPI}/market_data?ticker=${t}&start=${start}&end=${end}&country=India${csv}`, method: "GET" };
    },
    "drhp": () => ({
      url: `${NESTJS}/filings/drhp/${encodeURIComponent((u.searchParams.get("ticker") || "PAYTM").toUpperCase())}`,
      method: "GET",
    }),
  };

  if (!CALLS[name]) return json({ ok: false, error: "unknown call", calls: Object.keys(CALLS), ...meta }, 400);
  if (!token) return json({ ok: false, error: "MUNS_TOKEN is not configured on this deployment", ...meta });

  const spec = CALLS[name]();
  if (spec.error) return json({ ok: false, call: name, ...spec, ...meta }, 400);

  const result = await call(spec.url, { method: spec.method, token, body: spec.body });
  return json({ call: name, ...result, ...meta });
}
