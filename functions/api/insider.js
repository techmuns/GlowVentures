// Cloudflare Pages Function — server-side proxy for the muns insider-trades API.
// Same guarantees as the news / announcements proxies: MUNS_TOKEN stays in the
// Pages env (never sent to the browser), behind the site password, edge-cached per
// ticker per day, and honest about upstream failures (all-failed →
// { ok:false, reason:"upstream_error", status }).
//
// The upstream may return JSON (array or object) OR a Markdown table (as the docs
// example shows), so the parser accepts both and normalizes column names.

import { bundleCache, ageS } from "../../shared/edgeBundleCache.js";

const UPSTREAM = "https://devde.muns.io/filings/data/insider_trades";
const MAX_SYMBOLS = 24;
const PER_SYMBOL = 8;
const MAX_ITEMS = 100;
const UPSTREAM_TIMEOUT_MS = 12000;
const FETCH_CONCURRENCY = 5;   // tickers hit at once per invocation — gentle on the
                               // upstream so it doesn't rate-limit the whole batch
const CACHE_TTL_S = 86400;
const RETRYABLE = (s) => s === 0 || s === 429 || s >= 500; // rate-limit / 5xx / timeout

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
function todayUTC() { return new Date().toISOString().slice(0, 10); }

const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Canonical field → candidate source keys (normalized: lowercase, alphanumeric only).
const ALIASES = {
  company: ["company", "symbol", "ticker", "scrip"],
  insider: ["insider", "name", "personname", "acquirerdisposername", "nameofacquirerdisposer"],
  category: ["category", "relationship", "personcategory", "categoryofperson"],
  securityType: ["securitytype", "typeofsecurity"],
  transaction: ["transaction", "transactiontype", "acquisitiondisposal", "buysell"],
  shares: ["tradeshares", "shares", "noofsecurities", "numberofsecurities", "qty", "tradedshares"],
  tradePct: ["tradepct", "trade", "tradepercent"],
  value: ["tradevalue", "value", "transactionvalue", "valueofsecurity"],
  postShares: ["postholdingshares", "postsharesheld", "securitiespostheld"],
  postPct: ["postholdingpct", "postholding", "postholdingpercent"],
  mode: ["mode", "modeofacquisition", "transactionmode"],
  fromDate: ["fromdate", "from"],
  toDate: ["todate", "to"],
  broadcastDate: ["broadcastdate", "broadcast", "disseminationdate", "date"],
  source: ["source"],
};

function normalizeRow(obj) {
  const m = {};
  for (const [k, v] of Object.entries(obj)) m[normKey(k)] = v;
  const pick = (field) => {
    for (const a of ALIASES[field]) if (m[a] != null && String(m[a]).trim() !== "") return m[a];
    return "";
  };
  return {
    company: str(pick("company")),
    insider: str(pick("insider")),
    category: str(pick("category")),
    securityType: str(pick("securityType")),
    transaction: str(pick("transaction")),
    shares: num(pick("shares")),
    tradePct: str(pick("tradePct")),
    value: num(pick("value")),
    postShares: num(pick("postShares")),
    postPct: str(pick("postPct")),
    mode: str(pick("mode")),
    fromDate: str(pick("fromDate")),
    toDate: str(pick("toDate")),
    broadcastDate: str(pick("broadcastDate")),
    source: str(pick("source")),
  };
}

function parseMarkdownTable(text) {
  const lines = String(text).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 2) return [];
  const header = lines[0].split("|").slice(1, -1).map((s) => s.trim());
  const out = [];
  for (const line of lines.slice(1)) {
    if (/^\|?[\s\-:|]+\|?$/.test(line)) continue; // separator row (|---|---|)
    const cells = line.split("|").slice(1, -1).map((s) => s.trim());
    if (cells.length < 2) continue;
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
    out.push(obj);
  }
  return out;
}

// Coerce whatever the upstream returned (JSON array/object or a Markdown string)
// into an array of raw row objects.
function toRawRows(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (data === null) return parseMarkdownTable(text);
  if (typeof data === "string") return parseMarkdownTable(data);
  if (Array.isArray(data)) {
    if (data.length && data[0] && typeof data[0] === "object" && !Array.isArray(data[0]) && (data[0].data || data[0].rows)) {
      const rows = [];
      for (const s of data) {
        if (typeof s.data === "string") rows.push(...parseMarkdownTable(s.data));
        else if (Array.isArray(s.data)) rows.push(...s.data);
        else if (Array.isArray(s.rows)) rows.push(...s.rows);
      }
      return rows;
    }
    return data;
  }
  if (data && typeof data === "object") {
    if (typeof data.data === "string") return parseMarkdownTable(data.data);
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.trades)) return data.trades;
  }
  return [];
}

async function fetchInsiderFor(symbol, token, signal) {
  const r = await fetch(UPSTREAM, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ ticker: symbol, country: "India" }),
    signal,
  });
  if (!r.ok) return { status: r.status, trades: [] };
  const text = await r.text();
  const trades = toRawRows(text).map(normalizeRow).filter((t) => t.insider || t.transaction || t.shares);
  trades.sort((a, b) => String(b.broadcastDate || b.toDate).localeCompare(String(a.broadcastDate || a.toDate)));
  return { status: 200, trades: trades.slice(0, PER_SYMBOL) };
}

// Cache key for one symbol's daily insider pull.
const insiderKey = (day, symbol) => `${day}|${symbol}`;

// Fetch one symbol. The caller reads and writes the shared bundle around this,
// so nothing here touches the cache.
async function fetchOneSymbol(symbol, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetchInsiderFor(symbol, token, controller.signal);
  } catch {
    return { status: 0, trades: [] };
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

  const day = todayUTC();
  // One cache read for every symbol, one write at the end. This used to be a
  // read and a write per symbol, which pushed the request past Cloudflare's
  // free-plan subrequest budget — the writes were refused, so nothing cached and
  // the upstream was hit for every symbol on every load.
  const cache = bundleCache("insider", { ttlS: CACHE_TTL_S, request });
  const bundle = refresh ? {} : await cache.read();
  const now = Date.now();
  const pending = holdings.filter((h) => ageS(bundle, insiderKey(day, h.symbol), now) >= CACHE_TTL_S);
  const fetched = new Map();
  if (pending.length) {
    const got = await mapLimit(pending, FETCH_CONCURRENCY, (h) => fetchOneSymbol(h.symbol, token));
    const at = Date.now();
    let stored = 0;
    got.forEach((res, i) => {
      fetched.set(pending[i].symbol, res);
      if (res && res.status === 200) { bundle[insiderKey(day, pending[i].symbol)] = { v: res.trades, at }; stored++; }
    });
    if (stored) await cache.write(bundle);
  }
  const results = holdings.map((h) => {
    const fresh = fetched.get(h.symbol);
    if (fresh) return fresh;
    const rec = bundle[insiderKey(day, h.symbol)];
    return { status: 200, trades: rec ? rec.v : [] };
  });

  const seen = new Set();
  const items = [];
  let okCount = 0;
  const failed = [];
  const statusTally = {};
  results.forEach((res, i) => {
    const val = res || { status: 0, trades: [] };
    const h = holdings[i];
    if (val.status === 200) {
      okCount++;
      for (const t of val.trades) {
        const dedupe = `${t.company}|${t.insider}|${t.transaction}|${t.shares}|${t.broadcastDate}|${t.value}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        items.push({ ...t, holding: h.name, key: h.key, symbol: h.symbol });
      }
    } else if (RETRYABLE(val.status)) {
      failed.push(h.key);
      statusTally[val.status] = (statusTally[val.status] || 0) + 1;
    } else {
      statusTally[val.status] = (statusTally[val.status] || 0) + 1;
    }
  });

  if (okCount === 0 && failed.length === 0) {
    const top = Object.entries(statusTally).sort((a, b) => b[1] - a[1])[0];
    return json({ ok: false, reason: "upstream_error", status: top ? Number(top[0]) : 0, symbolsSearched: 0 });
  }

  items.sort((a, b) => String(b.broadcastDate || b.toDate).localeCompare(String(a.broadcastDate || a.toDate)));
  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: Math.min(items.length, MAX_ITEMS),
    items: items.slice(0, MAX_ITEMS),
    symbolsSearched: okCount,
    symbolsWithData: okCount,
    failed,
  });
}
