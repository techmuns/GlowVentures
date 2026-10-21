// A stand-in for the live layer, so it can be exercised without a token.
//
// WHY THIS EXISTS. Every live path — quotes, FX, and the three holdings feeds —
// runs through Cloudflare Functions that need `MUNS_TOKEN`. Without one the whole
// layer is untestable locally, and a live layer nobody can test is a live layer
// nobody does test: the symbol lookup was keyed on ISIN against a
// securityKey-keyed map for an entire prompt cycle, resolving nothing for 143 of
// 143 positions, with no error anywhere to show for it.
//
// WHAT MAKES IT A TEST RATHER THAN A DEMO. Each symbol is priced at ITS OWN
// statement mark × a fixed factor. That matters twice over:
//
//   • Every price stays plausible for that security, so `priceLooksLikeSameSecurity`
//     in quotes.ts (which rejects a live price more than 10× from the mark)
//     doesn't quietly discard the whole feed and leave you testing nothing.
//   • The expected consolidated total is exactly computable. At FACTOR=1.10 the
//     priceable book must rise exactly 10% and the unpriceable remainder — cash,
//     the receivable, the liquid-fund sweep — must not move at all. If cost basis,
//     realised gains or any cash flow moves, the basis discipline has broken.
//
// The feed endpoints record which holdings were asked about, so
// /__mock/stats proves the fan-out reaches every holding rather than the largest
// few.
//
//   npm run build && npm run dev:mock-quotes      # → http://127.0.0.1:4174
//   FACTOR=0.9 npm run dev:mock-quotes            # a falling market
//   curl -s localhost:4174/__mock/stats | jq      # coverage the run actually achieved
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 4174);
const FACTOR = Number(process.env.FACTOR ?? 1.10);   // every live price = mark × FACTOR
/**
 * THE INDEX MOVE IS SET SEPARATELY FROM THE BOOK'S, AND THE DEFAULT IS THE
 * FAMILY'S OWN SCENARIO: "my stocks and ETFs are up, Sensex is down this much".
 *
 * Tying the indices to FACTOR would make the book and the market move together
 * by construction, and the one figure the movers card exists to show — the book
 * SET AGAINST the index — would be a constant zero in every mock run. At the
 * defaults the priced book is +10.00% and every index is −1.00%, so the gap is
 * exactly 11.00 points and a check can assert it rather than eyeball it.
 */
const INDEX_FACTOR = Number(process.env.INDEX_FACTOR ?? 0.99);

if (!fs.existsSync(DIST)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

// Statement marks per symbol, from the book itself.
const src = fs.readFileSync(path.join(ROOT, "src/data/glowData.ts"), "utf8");
const symbols = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nseSymbols.json"), "utf8"));
const positions = [...src.matchAll(
  /"securityKey": "([^"]+)"[\s\S]{0,900}?"currentPrice": ([\d.]+)/g,
)].map((m) => ({ key: m[1], price: Number(m[2]) }));
const markBySymbol = new Map();
for (const p of positions) {
  const sym = symbols[p.key];
  if (sym && !markBySymbol.has(sym)) markBySymbol.set(sym, p.price);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

let quoteCalls = 0, symbolsAsked = new Set();
const feedCalls = {}, feedAsked = {};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, body, type) => { res.writeHead(code, { "content-type": type, "access-control-allow-origin": "*" }); res.end(body); };

  if (url.pathname === "/api/quotes" && req.method === "POST") {
    let raw = ""; for await (const c of req) raw += c;
    const { symbols: want = [] } = JSON.parse(raw || "{}");
    quoteCalls++;
    for (const s of want) symbolsAsked.add(s);
    const quotes = {}; const missing = [];
    for (const s of want) {
      const mark = markBySymbol.get(s);
      if (!mark) { missing.push(s); continue; }
      const price = Math.round(mark * FACTOR * 100) / 100;
      quotes[s] = {
        price, prevClose: Math.round(mark * 100) / 100, open: price, dayLow: price, dayHigh: price,
        low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null, ageS: 0,
      };
    }
    return send(200, JSON.stringify({
      ok: true, quotes, asOf: "2026-07-31T10:00:00.000Z", missing,
      fresh: Object.keys(quotes).length, stale: 0,
    }), "application/json");
  }
  // News / announcements / insider all POST { holdings: [...] } in chunks.
  if (["/api/news", "/api/announcements", "/api/insider"].includes(url.pathname) && req.method === "POST") {
    let raw = ""; for await (const c of req) raw += c;
    const { holdings = [] } = JSON.parse(raw || "{}");
    const k = url.pathname;
    feedCalls[k] = (feedCalls[k] ?? 0) + 1;
    (feedAsked[k] ??= new Set());
    for (const h of holdings) feedAsked[k].add(h.symbol ?? h.key ?? h.name);
    const field = k === "/api/news" ? "articles" : "items";
    return send(200, JSON.stringify({ ok: true, [field]: [], generatedAt: "2026-07-31T10:00:00.000Z", count: 0, failed: [], searched: holdings.length }), "application/json");
  }
  /**
   * THE FOUR NSE INDICES. Levels are round numbers and the previous close is the
   * level ÷ INDEX_FACTOR, so `changePct` is exactly `(INDEX_FACTOR − 1) × 100` on
   * every one of them — a figure a check can assert to the decimal.
   *
   * `name` is present and CORRECT on each, because the real Function refuses an
   * index whose upstream reports a different instrument (`NIFTY_MIDCAP_150.NS`
   * answers 200 with a well-formed number for something that is not the Nifty
   * Midcap 150). A mock that omitted the name would exercise the refusal path
   * rather than the render path and quietly stop testing the strip.
   */
  if (url.pathname === "/api/indices") {
    const LEVELS = [
      ["nifty-50", "Nifty 50", "^NSEI", "NIFTY 50", 24000],
      ["nifty-500", "Nifty 500", "^CRSLDX", "NIFTY 500", 23000],
      ["nifty-midcap-150", "Nifty Midcap 150", "NIFTYMIDCAP150.NS", "NIFTY MIDCAP 150", 22000],
      ["nifty-smallcap-250", "Nifty Smallcap 250", "NIFTYSMLCAP250.NS", "NIFTY SMLCAP 250", 18000],
    ];
    const indices = LEVELS.map(([id, label, symbol, name, prev]) => {
      const level = Math.round(prev * INDEX_FACTOR * 100) / 100;
      return {
        id, label, symbol, ok: true, reason: null, name, currency: "INR", exchange: "NSE",
        level, prevClose: prev, prevCloseDate: "2026-08-12",
        change: Math.round((level - prev) * 100) / 100,
        changePct: (INDEX_FACTOR - 1) * 100,
        dayHigh: level, dayLow: level, high52: prev * 1.2, low52: prev * 0.8,
        asOf: "2026-08-13T10:00:00.000Z",
      };
    });
    return send(200, JSON.stringify({
      ok: true, source: "mock", fetchedAt: "2026-08-13T10:00:00.000Z",
      resolved: indices.length, requested: indices.length, indices,
    }), "application/json");
  }
  /**
   * ONE SECURITY'S (OR INDEX'S) DAILY CLOSE HISTORY, on a LINEAR ramp.
   *
   * Linear rather than random so the rebased comparison the NAV card draws is
   * exactly computable: the close on day N is `1000 × (1 + PRICE_SLOPE × N)`
   * from 2026-01-01, so the index's return between any two dates is a closed
   * form and a check can assert the gap against the book rather than eyeball a
   * chart. Only SETTLED sessions, like the real Function: today is excluded.
   */
  if (url.pathname === "/api/prices") {
    const SLOPE = Number(process.env.PRICE_SLOPE ?? 0.0004);
    const t = [], v = [];
    const start = Date.UTC(2026, 0, 1);
    const today = new Date().toISOString().slice(0, 10);
    for (let n = 0; n < 400; n++) {
      const d = new Date(start + n * 86400000).toISOString().slice(0, 10);
      if (d >= today) break;
      t.push(d);
      v.push(Math.round(1000 * (1 + SLOPE * n) * 10000) / 10000);
    }
    return send(200, JSON.stringify({
      ok: true, source: "mock", symbol: url.searchParams.get("symbol") ?? "?",
      currency: "INR", exchange: "NSE", first: t[0], last: t[t.length - 1], count: t.length,
      last_value: v[v.length - 1], returns: {}, spans: {}, high52: null, low52: null, t, v,
    }), "application/json");
  }
  if (url.pathname === "/api/fx") {
    return send(200, JSON.stringify({ ok: true, inrPerUsd: 88.25, date: "2026-07-31" }), "application/json");
  }
  if (url.pathname === "/__mock/stats") {
    return send(200, JSON.stringify({ quoteCalls, symbolsAsked: [...symbolsAsked].sort(), priced: markBySymbol.size, feedCalls, feedAsked: Object.fromEntries(Object.entries(feedAsked).map(([k,v])=>[k,[...v].sort()])) }), "application/json");
  }
  if (url.pathname.startsWith("/api/")) return send(200, JSON.stringify({ ok: false, reason: "not mocked" }), "application/json");

  let f = path.join(DIST, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  send(200, fs.readFileSync(f), MIME[path.extname(f)] ?? "application/octet-stream");
});

server.listen(PORT, () => {
  console.log(`Mock live layer on http://127.0.0.1:${PORT}`);
  console.log(`  ${markBySymbol.size} symbols priced at their statement mark × ${FACTOR}`);
  console.log(`  /api/quotes /api/indices /api/prices /api/fx /api/news /api/announcements /api/insider are mocked;`);
  console.log(`  indices at × ${INDEX_FACTOR} (book × ${FACTOR}), so the movers card shows a real gap`);
  console.log(`  everything else is served from dist/. Coverage: /__mock/stats`);
});
