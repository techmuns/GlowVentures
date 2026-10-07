// ── LIVE PRICES FROM UPSTOX, READ ONCE FOR THE WHOLE BOOK ────────────────────
//
// *"I have got the upstox token for live current market prices for all tickers
// in the dashboard."*
//
// Imported by `functions/api/quotes.js` (Cloudflare) and by its test suite, so
// the parse the deployment runs is the parse the tests exercise. Nothing here
// holds a token: the caller passes it in, and no function below ever puts it in
// anything it returns.
//
// ── WHY UPSTOX IS THE PRIMARY FEED ──────────────────────────────────────────
//
// The muns batch endpoint prices a BOUNDED SLICE per request (64 of this book's
// original direct-holdings scope), so the dashboard used to need three rounds before Today's movers
// could rank anything. Upstox's full market quote answers up to 500 instruments
// per batch, so the full company scope lands in the first round. muns stays as the
// fallback for whatever Upstox could not price.
//
// ── THE TOKEN IS SHARED, SO THE CALLS ARE FEW ───────────────────────────────
//
// The same Analytics Token serves Glow Central Research and Sattva Central
// Research. Upstox enforces its limits PER API, PER USER (50/s, 500/min,
// 2,000/30 min), so the three dashboards share one budget. This function spends
// one call per 500 mapped symbols at each edge cache refresh, every 60 seconds
// at most per data centre.
//
// ── FOUR RULES, EACH A WRONG FIGURE AVOIDED ─────────────────────────────────
//
//   1. IDENTITY GATE. A row is used only if it echoes the instrument key that
//      was asked for AND the trading symbol the committed map expects. A price
//      for the wrong instrument is a complete, well-formed figure nothing on
//      screen could catch — Glow Central Research applies the same pair.
//   2. THE PREVIOUS CLOSE IS `last_price − net_change`. `ohlc.close` is TODAY's
//      close (Upstox's own sample prints it equal to the last price), and
//      reading it as yesterday's would make every day's move zero.
//   3. NO REDIRECT IS FOLLOWED. `redirect: "manual"` keeps the bearer token from
//      travelling to wherever a redirect points; a 3xx is a failed call.
//   4. AN ABSENT FIGURE IS NULL. Upstox's full quote carries no 52-week range
//      and no market cap, so those are null — never 0 — and the company page
//      takes its 52-week range from the price history instead.
import { UPSTOX_INSTRUMENTS } from "./upstoxInstruments.mjs";

export const UPSTOX_QUOTES_URL = "https://api.upstox.com/v2/market-quote/quotes";
/** Upstox's own documented cap: "Data of only 500 instrument keys can be requested in single API call". */
export const UPSTOX_BATCH = 500;
const TIMEOUT_MS = 10000;
const CLIENT = "GlowVentures/1.0";

/**
 * Where the token may be set, in order. `UPSTOX_ACCESS_TOKEN` is the name the
 * two sister dashboards use, so a token copied across under that name works
 * here too; `UPSTOX_TOKEN` is accepted as well.
 */
export const UPSTOX_TOKEN_VARS = ["UPSTOX_ACCESS_TOKEN", "UPSTOX_TOKEN"];

/**
 * The configured token and the NAME it was found under, or null. A value pasted
 * with a leading `Bearer ` or wrapped in quotes is cleaned, because that is the
 * easiest mistake to make in a secrets form and it reads exactly like an
 * expired token (HTTP 401).
 */
export function upstoxToken(env) {
  for (const name of UPSTOX_TOKEN_VARS) {
    const raw = env && env[name];
    if (typeof raw !== "string") continue;
    const token = raw.trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
    if (token) return { name, token };
  }
  return null;
}

/** The committed instrument for an NSE symbol or BSE quote key, or null. */
export function instrumentFor(symbol) {
  return Object.prototype.hasOwnProperty.call(UPSTOX_INSTRUMENTS, symbol) ? UPSTOX_INSTRUMENTS[symbol] : null;
}

const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
// Upstox serialises prices as single-precision floats (its own sample prints
// 52.04999923706055 for ₹52.05). Four decimals removes that noise and can never
// truncate a real tick, which is at least a paisa.
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const pos = (v) => { const n = fin(v); return n != null && n > 0 ? r4(n) : null; };

/**
 * One full-quote row → the quote shape `/api/quotes` has always returned, or
 * null when it carries no usable price.
 */
export function shapeUpstoxRow(row) {
  const price = pos(row && row.last_price);
  if (price == null) return null;
  const change = fin(row.net_change);
  const prev = change == null ? null : r4(row.last_price - change);
  const ohlc = (row && row.ohlc) || {};
  const traded = Number(row.last_trade_time);
  return {
    price,
    prevClose: prev != null && prev > 0 ? prev : null,
    open: pos(ohlc.open),
    dayLow: pos(ohlc.low),
    dayHigh: pos(ohlc.high),
    low52: null,
    high52: null,
    marketCap: null,
    volume: fin(row.volume),
    yearChangePct: null,
    tradedAt: Number.isFinite(traded) && traded > 0 ? new Date(traded).toISOString() : null,
    source: "upstox",
  };
}

/** The first error Upstox reported in a body, whichever spelling it used. */
function upstoxError(body) {
  const e = body && Array.isArray(body.errors) ? body.errors[0] : null;
  if (!e) return { code: null, message: null };
  return {
    code: e.errorCode ?? e.error_code ?? null,
    message: typeof e.message === "string" ? e.message.slice(0, 300) : null,
  };
}

/**
 * Price NSE symbols and exchange-qualified BSE quote keys from Upstox in
 * batches of at most 500. Never throws. Returns what was priced, what was
 * not and why — each symbol asked for lands in exactly one of `quotes`,
 * `unmapped` (no instrument in the committed map), `refused` (the row did not
 * echo the identity it was asked for) or `notReturned` (asked, and no row came
 * back — including every symbol in a batch whose call failed).
 */
export async function fetchUpstoxQuotes(symbols, token, { fetcher = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const quotes = {};
  const unmapped = [];
  const refused = [];
  const calls = [];
  const wanted = [];
  for (const s of symbols) {
    const inst = instrumentFor(s);
    if (inst) wanted.push([s, inst]);
    else unmapped.push(s);
  }

  for (let i = 0; i < wanted.length; i += UPSTOX_BATCH) {
    const batch = wanted.slice(i, i + UPSTOX_BATCH);
    const byKey = new Map();
    for (const [s, inst] of batch) byKey.set(inst.key, [...(byKey.get(inst.key) ?? []), [s, inst]]);
    const url = new URL(UPSTOX_QUOTES_URL);
    url.searchParams.set("instrument_key", [...byKey.keys()].join(","));
    const call = { batch: calls.length, requested: byKey.size, status: null, durationMs: 0, rows: 0, errorCode: null, errorMessage: null };
    calls.push(call);
    const startedAt = Date.now();
    try {
      const res = await fetcher(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": CLIENT },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      call.status = res.status;
      const body = await res.json().catch(() => null);
      call.durationMs = Date.now() - startedAt;
      if (!res.ok || !body || body.status !== "success" || !body.data || typeof body.data !== "object") {
        const e = upstoxError(body);
        call.errorCode = e.code ?? (res.ok ? "UNEXPECTED_BODY" : `HTTP_${res.status}`);
        call.errorMessage = e.message;
        continue;
      }
      for (const row of Object.values(body.data)) {
        const hits = row && byKey.get(row.instrument_token);
        if (!hits) continue;
        call.rows++;
        for (const [s, inst] of hits) {
          if (row.symbol !== inst.tradingSymbol) {
            refused.push({ symbol: s, reason: `Upstox answered ${inst.key} as ${JSON.stringify(row.symbol)}, not ${inst.tradingSymbol}` });
            continue;
          }
          const q = shapeUpstoxRow(row);
          if (q) quotes[s] = q;
        }
      }
    } catch (e) {
      call.durationMs = Date.now() - startedAt;
      call.errorCode = e && e.name === "TimeoutError" ? "TIMEOUT" : "FETCH_FAILED";
      call.errorMessage = String((e && e.message) || e).slice(0, 300);
    }
  }

  const refusedSet = new Set(refused.map((r) => r.symbol));
  const notReturned = wanted.map(([s]) => s).filter((s) => !quotes[s] && !refusedSet.has(s));
  return { quotes, unmapped, refused, notReturned, calls };
}
