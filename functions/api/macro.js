// Cloudflare Pages Function — free macro market data (indices, commodities,
// currencies) from Yahoo Finance's public chart endpoint. Keyless and
// CORS-agnostic (this runs server-side), edge-cached for an hour so every viewer
// shares one upstream call per symbol set.
//
// The client sends Yahoo symbols (e.g. ^GSPC, GC=F, USDINR=X); this fetches each
// one's daily close series, then computes the FOOS returns table server-side —
// last price, 1D/1W/1M/QTD/YTD/1Y and 3Y/5Y/10Y/Max CAGR, plus the 52-week range
// from the meta. Returns are computed from real closes on-or-before each target
// date; a horizon the history does not reach comes back null (rendered "—"),
// never faked from a nearer date.
//
// This is the same discipline the rest of the book keeps: a figure that traces to
// a real close, or an honest absence. Yahoo is a free source with no SLA, so the
// client degrades to the illustrative preview when this is unreachable.

const CACHE_TTL_S = 3600;
const TIMEOUT_MS = 9000;
const MAX_SYMBOLS = 40;

function json(obj, cacheControl) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": cacheControl || "no-store" },
  });
}

const DAY = 86400e3;
const YEAR = 365.25 * DAY;

// Nearest close at or before targetMs. times are seconds (Yahoo), closes aligned.
function closeOnOrBefore(times, closes, targetMs) {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] * 1000 <= targetMs) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  // Walk back over any null closes at that index.
  while (ans >= 0 && (closes[ans] == null || !Number.isFinite(closes[ans]))) ans--;
  return ans >= 0 ? { close: closes[ans], ms: times[ans] * 1000 } : null;
}

function computeReturns(times, closes, lastMs, last) {
  const at = (ms) => closeOnOrBefore(times, closes, ms);
  const simple = (past) => (past && past.close > 0 ? (last / past.close - 1) * 100 : null);
  const cagr = (past, years) => {
    if (!past || past.close <= 0 || years <= 0) return null;
    const yrs = (lastMs - past.ms) / YEAR;
    if (yrs < years * 0.6) return null; // not enough history to call it an N-year CAGR
    return ((last / past.close) ** (1 / yrs) - 1) * 100;
  };
  const d = new Date(lastMs);
  const qStart = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
  const yStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const first = closes.findIndex((c) => c != null && Number.isFinite(c));
  const maxYears = first >= 0 ? (lastMs - times[first] * 1000) / YEAR : 0;
  return {
    d1: simple(at(lastMs - 1.5 * DAY)),
    w1: simple(at(lastMs - 7 * DAY)),
    m1: simple(at(lastMs - 31 * DAY)),
    qtd: simple(at(qStart - DAY)),
    ytd: simple(at(yStart - DAY)),
    y1: simple(at(lastMs - YEAR)),
    y3: cagr(at(lastMs - 3 * YEAR), 3),
    y5: cagr(at(lastMs - 5 * YEAR), 5),
    y10: cagr(at(lastMs - 10 * YEAR), 10),
    max: first >= 0 && maxYears > 0.05 ? ((last / closes[first]) ** (1 / maxYears) - 1) * 100 : null,
  };
}

async function fetchSymbol(symbol, signal) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" }, signal });
  if (!r.ok) return null;
  const d = await r.json();
  const res = d && d.chart && d.chart.result && d.chart.result[0];
  const meta = res && res.meta;
  const times = res && res.timestamp;
  const closes = res && res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close;
  if (!meta || !Array.isArray(times) || !Array.isArray(closes) || !times.length) return null;
  const last = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes[closes.length - 1];
  if (!Number.isFinite(last) || last <= 0) return null;
  const lastMs = (meta.regularMarketTime ? meta.regularMarketTime : times[times.length - 1]) * 1000;
  return {
    symbol,
    last,
    asOf: new Date(lastMs).toISOString().slice(0, 10),
    currency: meta.currency || null,
    high52: Number.isFinite(meta.fiftyTwoWeekHigh) ? meta.fiftyTwoWeekHigh : null,
    low52: Number.isFinite(meta.fiftyTwoWeekLow) ? meta.fiftyTwoWeekLow : null,
    returns: computeReturns(times, closes, lastMs, last),
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const raw = (url.searchParams.get("symbols") || "").trim();
  if (!raw) return json({ ok: false, reason: "no_symbols" });
  const symbols = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SYMBOLS);
  if (!symbols.length) return json({ ok: false, reason: "no_symbols" });

  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/macro/v1/${encodeURIComponent(symbols.slice().sort().join(","))}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let series = {};
  try {
    const results = await Promise.all(symbols.map((s) => fetchSymbol(s, controller.signal).catch(() => null)));
    for (const r of results) if (r) series[r.symbol] = r;
  } catch {
    series = {};
  } finally {
    clearTimeout(timer);
  }
  if (!Object.keys(series).length) return json({ ok: false, reason: "upstream_error" });

  const resp = json({ ok: true, source: "Yahoo Finance", generatedAt: new Date().toISOString(), series }, `public, max-age=${CACHE_TTL_S}`);
  await cache.put(key, resp.clone());
  return resp;
}
