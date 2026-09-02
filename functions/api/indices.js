// Cloudflare Pages Function — LIVE LEVELS for the four Indian equity indices the
// family asked to see at all times: Nifty 50, Nifty 500, Nifty Midcap 150 and
// Nifty Smallcap 250.
//
// WHY NOT THE QUOTE FEED, AND WHY NOT THE HARVEST STORE
// ─────────────────────────────────────────────────────
// `/api/quotes` works in NSE TRADING SYMBOLS and posts `ticker_symbol` to the
// muns API; an index has no trading symbol and is not in that catalogue.
// `public/series/` carries `nifty-50` and `sensex` as DAILY CLOSES harvested
// nightly — right for a ten-year chart, and it cannot answer "where is the Nifty
// right now", which is the whole of this request. So this is a proxy, by the
// same rule `/api/prices` follows: store what is read in aggregate, proxy what is
// read live.
//
// ── TWO MEASURED TRAPS, EACH OF WHICH PRINTS A PLAUSIBLE WRONG NUMBER ────────
//
// 1. `chartPreviousClose` IS NOT THE PREVIOUS CLOSE. It is the close preceding
//    the requested RANGE. Measured on ^NSEI on 2026-09-02 with `range=5d`, it
//    returned 24,090.85 — the close of 27 August — while the previous SESSION
//    closed at 24,055.80 on 1 September. Read as the previous close it puts the
//    day's move at −1.15% against a true −1.01%: wrong, and indistinguishable
//    from right on screen. The previous close is therefore taken from the LAST
//    SETTLED BAR of the series, which is the same rule `/api/prices` already
//    applies when it excludes today's in-progress bar.
//
// 2. A SYMBOL THAT LOOKS RIGHT IS NOT THE INDEX. Measured the same day:
//      NIFTYMIDCAP150.NS   → "NIFTY MIDCAP 150"   22,949.95   ← the index
//      NIFTY_MIDCAP_150.NS → an unnamed instrument 7,757.15   ← not the index
//      NIFTYSMLCAP250.NS   → "NIFTY SMLCAP 250"   18,166.10   ← the index
//      NIFTY_SMLCAP_250.NS → an unnamed instrument 5,861.60   ← not the index
//      ^NSMIDCP            → "NIFTY NEXT 50"                  ← the NAME lies
//    Every one of those answers 200 with a well-formed number in rupees. So each
//    index DECLARES the name its own upstream must report, the response is
//    checked against it, and a mismatch returns the index UNVERIFIED with no
//    level rather than a figure from whatever instrument answered. Same rule as
//    `lib/table.mjs`: match on the label the source prints, never on the shape
//    of the key.
const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (compatible; GlowVenturesDashboard/1.0)";
const TIMEOUT_MS = 12000;
// A LIVE LEVEL, so the cache is a burst absorber and nothing more. 60s matches
// `/api/quotes`, so the strip and the holdings on the same screen cannot be a
// quarter of an hour apart.
const CACHE_TTL_S = 60;

/**
 * The four indices, each with the name its upstream must report.
 *
 * `expect` is matched case-insensitively against `meta.longName` and
 * `meta.shortName` after stripping non-alphanumerics, because Yahoo prints
 * "NIFTY SMLCAP 250" where NSE writes "Nifty Smallcap 250" — the abbreviation is
 * the source's own spelling of the same index and is not a different instrument.
 * What it must NOT tolerate is a different index or an unnamed one.
 */
const INDICES = [
  { id: "nifty-50", label: "Nifty 50", symbol: "^NSEI", expect: ["nifty50"] },
  { id: "nifty-500", label: "Nifty 500", symbol: "^CRSLDX", expect: ["nifty500"] },
  { id: "nifty-midcap-150", label: "Nifty Midcap 150", symbol: "NIFTYMIDCAP150.NS", expect: ["niftymidcap150"] },
  { id: "nifty-smallcap-250", label: "Nifty Smallcap 250", symbol: "NIFTYSMLCAP250.NS", expect: ["niftysmlcap250", "niftysmallcap250"] },
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const json = (obj, cacheControl) =>
  new Response(JSON.stringify(obj), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl || "no-store",
    },
  });

async function readIndex(spec, signal) {
  const base = { id: spec.id, label: spec.label, symbol: spec.symbol };
  let data;
  try {
    // A MONTH, not five days. `range=5d` returned four usable bars around a
    // holiday on the day this was written; a long weekend plus a market holiday
    // can leave a five-day window with one settled close and no room to skip
    // today's. A month costs ~20 numbers and cannot run out.
    const r = await fetch(`${CHART}/${encodeURIComponent(spec.symbol)}?range=1mo&interval=1d`, {
      headers: { "User-Agent": UA, accept: "application/json" },
      signal,
    });
    if (!r.ok) return { ...base, ok: false, reason: `http_${r.status}` };
    data = await r.json();
  } catch (e) {
    return { ...base, ok: false, reason: e.name === "AbortError" ? "timeout" : "unreachable" };
  }

  const res = data?.chart?.result?.[0];
  if (!res) return { ...base, ok: false, reason: data?.chart?.error?.description || "no result" };
  const meta = res.meta ?? {};

  // IDENTITY BEFORE FIGURES. Trap 2 above.
  const reported = [meta.longName, meta.shortName].filter(Boolean);
  const matches = reported.some((n) => spec.expect.includes(norm(n)));
  if (!matches) {
    return {
      ...base, ok: false, reason: "identity_mismatch",
      reportedName: reported[0] ?? null,
    };
  }

  // The previous close is the last SETTLED session. Trap 1 above.
  const stamps = res.timestamp ?? [];
  const closes = res.indicators?.quote?.[0]?.close ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const settled = [];
  for (let i = 0; i < stamps.length; i++) {
    const v = closes[i];
    if (!Number.isFinite(v)) continue;              // holidays come back null
    const t = new Date(stamps[i] * 1000).toISOString().slice(0, 10);
    if (t >= today) continue;                        // today's bar is still moving
    settled.push({ t, v });
  }
  settled.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const prev = settled.at(-1) ?? null;

  const level = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : null;
  // A LEVEL WITH NO PREVIOUS CLOSE IS A LEVEL AND NOT A MOVE. Both halves are
  // reported separately so the strip can print the level and dash the change
  // rather than withholding both or inventing a zero.
  const changePct = level !== null && prev && prev.v > 0 ? ((level - prev.v) / prev.v) * 100 : null;

  return {
    ...base,
    ok: level !== null,
    reason: level === null ? "no level" : null,
    name: reported[0] ?? null,
    currency: meta.currency ?? null,
    exchange: meta.fullExchangeName ?? null,
    level,
    prevClose: prev ? prev.v : null,
    prevCloseDate: prev ? prev.t : null,
    change: changePct === null ? null : level - prev.v,
    changePct,
    dayHigh: Number.isFinite(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null,
    dayLow: Number.isFinite(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null,
    high52: Number.isFinite(meta.fiftyTwoWeekHigh) ? meta.fiftyTwoWeekHigh : null,
    low52: Number.isFinite(meta.fiftyTwoWeekLow) ? meta.fiftyTwoWeekLow : null,
    asOf: Number.isFinite(meta.regularMarketTime) ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const refresh = url.searchParams.get("refresh") === "1";

  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/indices/v1/nse-four`);
  if (!refresh) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let rows;
  try {
    rows = await Promise.all(INDICES.map((s) => readIndex(s, controller.signal)));
  } finally {
    clearTimeout(timer);
  }

  // ok:false ONLY when nothing resolved. One index the upstream could not price
  // must not blank the other three — the strip renders each on its own state.
  const okCount = rows.filter((r) => r.ok).length;
  const body = {
    ok: okCount > 0,
    source: "Yahoo Finance",
    fetchedAt: new Date().toISOString(),
    resolved: okCount,
    requested: rows.length,
    indices: rows,
  };
  const resp = json(body, okCount > 0 ? `public, max-age=${CACHE_TTL_S}` : "no-store");
  if (okCount > 0) context.waitUntil(cache.put(key, resp.clone()));
  return resp;
}
