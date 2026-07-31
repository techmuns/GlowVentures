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
  console.log(`  /api/quotes /api/fx /api/news /api/announcements /api/insider are mocked;`);
  console.log(`  everything else is served from dist/. Coverage: /__mock/stats`);
});
