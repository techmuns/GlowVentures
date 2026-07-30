// Cloudflare Pages Function — historical closes from the muns `market_data` API.
//
// WHAT THIS ENDPOINT CAN AND CANNOT DO
// ────────────────────────────────────
// The doc says market_data "returns application/json market/OHLC series (or
// CSV-oriented payload when csv=true)". It does not. Whatever you send — csv in
// the query, csv in the body, any Accept header — it returns a fixed ~860-byte
// human-readable PREVIEW: a header row, the first two rows, a literal "...", and
// the last two rows. The real series is written to a path on the API's own disk
// (/shared/csv/<TICKER>.csv) and no endpoint in the documented set serves it.
//
// So a 250-row year of data comes back as four rows, and there is no full price
// history to be had here. That rules out the things a series is needed for —
// rolling returns, RSI, distance from the 52-week high, a daily drawdown curve.
//
// What it CAN do reliably is answer "what did this close at, on or before date D",
// because the last preview row of a window ending at D is exactly that. This
// endpoint does only that, one window per requested date, and says so.
//
// Two upstream quirks worth knowing:
//   • `country=India` forces a .NS/.BO suffix, so indices are unreachable that
//     way. `^NSEI` (Nifty 50) and `^BSESN` (Sensex) resolve under `country=USA`,
//     which passes the ticker through untouched.
//   • `end` is exclusive, so a window must end the day AFTER the date wanted.
//
// Unauthenticated in testing, like stock-data/batch. MUNS_TOKEN is sent anyway
// and still required — depending on an open path that might close later is a trap.
import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const VERSION = "history-fn/1";
const UPSTREAM = "https://fastapi.muns.io/market_data";
// A single call takes ~8s upstream, so these run concurrently. Six NAV dates at
// this width finish in about the time one does.
const CONCURRENCY = 6;
const MAX_DATES = 16;             // cap upstream calls per request
const CALL_TIMEOUT_MS = 20000;
const LOOKBACK_DAYS = 12;         // window width — long enough to clear a holiday run
// Historical closes are final; only a date within the last few days can still
// move. One week of cache, and the client only ever asks for settled dates.
const CACHE_TTL_S = 7 * 86400;
const FRESH_S = 6 * 86400;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const shiftDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function errInfo(e) {
  return {
    errorName: e && e.name ? String(e.name) : "Error",
    errorMessage: e && e.message ? String(e.message).slice(0, 300) : String(e).slice(0, 300),
    errorStack: e && e.stack ? String(e.stack).slice(0, 600) : null,
  };
}

/**
 * Pull the rows out of the preview block.
 *
 * The column order is read from the header rather than assumed — the daily
 * response labels its first column "Date" and the intraday one "Datetime", and a
 * positional guess would silently take the wrong column if that ever shifts.
 */
export function parsePreview(text) {
  const lines = String(text || "").split("\n");
  let cols = null;
  const rows = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!cols && /^(date|datetime)\s*,/i.test(line)) {
      cols = line.split(",").map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!cols || !line.includes("|")) continue;
    const cells = line.split("|").map((s) => s.trim());
    if (cells.length < cols.length) continue;
    const at = (name) => {
      const i = cols.indexOf(name);
      return i < 0 ? null : cells[i];
    };
    const stamp = cells[0];
    const close = Number(at("close"));
    if (!/^\d{4}-\d{2}-\d{2}/.test(stamp) || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date: stamp.slice(0, 10), close });
  }
  return rows;
}

/** The close on `on`, or the last close before it. One upstream call. */
async function closeOn(ticker, country, on, token, diags) {
  const start = shiftDays(on, -LOOKBACK_DAYS);
  const end = shiftDays(on, 1); // `end` is exclusive upstream
  const url = `${UPSTREAM}?ticker=${encodeURIComponent(ticker)}&start=${start}&end=${end}&country=${encodeURIComponent(country)}`;
  const d = { on, ticker, country, window: [start, end], fetchStarted: Date.now(), status: null, durationMs: null };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort("timeout"), CALL_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: ctl.signal,
    });
    d.status = r.status;
    const text = await r.text();
    d.durationMs = Date.now() - d.fetchStarted;
    if (!r.ok) {
      d.bodyPreview = text.slice(0, 300);
      diags.push(d);
      return null;
    }
    const rows = parsePreview(text);
    d.rowsParsed = rows.length;
    // Rows at or before the date asked for. The preview's last row is normally it,
    // but a window that straddles a holiday can end early, so pick explicitly.
    const usable = rows.filter((x) => x.date <= on);
    if (!usable.length) {
      d.note = rows.length ? "no row on or before the requested date" : "no rows in preview";
      d.bodyPreview = text.slice(0, 220);
      diags.push(d);
      return null;
    }
    const pick = usable[usable.length - 1];
    d.picked = pick;
    diags.push(d);
    return pick;
  } catch (e) {
    d.durationMs = Date.now() - d.fetchStarted;
    Object.assign(d, errInfo(e), { aborted: ctl.signal.aborted, abortReason: String(ctl.signal.reason ?? "") });
    diags.push(d);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, width, run) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await run(items[i], i);
      }
    }),
  );
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, failureCode: "METHOD_NOT_ALLOWED" }, 405);

  const started = Date.now();
  const token = env && env.MUNS_TOKEN;
  const meta = {
    version: VERSION,
    deploymentId: (env && (env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BRANCH)) || null,
    colo: request.cf && request.cf.colo ? request.cf.colo : null,
    tokenPresent: !!token,
  };
  if (!token) return json({ ok: false, failureCode: "NOT_CONFIGURED", reason: "not_configured", ...meta }, 200);

  let body = {};
  try { body = await request.json(); } catch { /* defaults below */ }
  const ticker = typeof body.ticker === "string" && body.ticker.trim() ? body.ticker.trim() : "^NSEI";
  // Indices only resolve when the ticker is passed through unmodified, which is
  // what country=USA does; Indian equities need country=India for the .NS suffix.
  const country = typeof body.country === "string" && body.country.trim() ? body.country.trim() : "USA";
  const wanted = Array.isArray(body.dates) ? body.dates.filter(isDate) : [];
  if (!wanted.length) return json({ ok: false, failureCode: "NO_DATES", ...meta }, 400);

  const ns = `history/${ticker}/${country}`;
  const cache = bundleCache(ns, { ttlS: CACHE_TTL_S, version: "v1", request });
  const bundle = await cache.read();
  const now = Date.now();

  const closes = {};
  const stale = [];
  const missing = [];
  for (const on of wanted.slice(0, MAX_DATES)) {
    const age = ageS(bundle, on, now);
    if (age < FRESH_S && bundle[on] && bundle[on].v) closes[on] = bundle[on].v;
    else missing.push(on);
  }

  const diags = [];
  if (missing.length) {
    const got = await pool(missing, CONCURRENCY, (on) => closeOn(ticker, country, on, token, diags));
    got.forEach((row, i) => {
      const on = missing[i];
      if (row) {
        closes[on] = row;
        bundle[on] = { v: row, at: now };
      } else if (bundle[on] && bundle[on].v) {
        closes[on] = bundle[on].v;   // last good value beats a gap in the chart
        stale.push(on);
      }
    });
    await cache.write(bundle);
  }

  const resolved = Object.keys(closes).length;
  const unresolved = wanted.filter((d) => !closes[d]);
  const anyResponse = diags.some((d) => d.status != null);
  const failureCode = resolved > 0 ? null
    : !anyResponse ? "UPSTREAM_NO_RESPONSE"
    : diags.some((d) => d.status && d.status !== 200) ? "UPSTREAM_ERROR"
    : "NO_CLOSES";

  return json({
    ok: resolved > 0,
    failureCode,
    ticker, country,
    closes,                       // { "2026-03-31": { date, close } }
    unresolved,
    stale,
    datesRequested: wanted.length,
    callsAttempted: diags.length,
    callsSucceeded: diags.filter((d) => d.picked).length,
    totalDurationMs: Date.now() - started,
    cacheStats: cache.stats,
    diagnostics: diags,
    ...meta,
  });
}
