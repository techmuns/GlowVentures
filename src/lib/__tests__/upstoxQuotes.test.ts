// UPSTOX AS THE PRIMARY QUOTE FEED, AGAINST A STUBBED UPSTREAM.  npm run test:family
//
// *"I have got the upstox token for live current market prices for all tickers
// in the dashboard."*
//
// The token lives in the Cloudflare environment and nowhere else, so the real
// API is out of reach from a test — the same position `quotesFunction.test.ts`
// records for muns. What IS reachable is every branch around the call, and each
// of them is a wrong figure if it breaks: which instrument a row is taken for,
// what the previous close is, what happens when the token is refused, and that
// the token never travels anywhere but Upstox's own host.
//
// The symbols are REAL entries from the committed instrument map, so the
// identity gate is exercised against the keys the deployment will send.
import { onRequest } from "../../../functions/api/quotes.js";
import { fetchUpstoxQuotes, shapeUpstoxRow, upstoxToken } from "../../../shared/upstoxQuotes.mjs";
import { UPSTOX_INSTRUMENTS, UPSTOX_INSTRUMENT_COVERAGE } from "../../../shared/upstoxInstruments.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const TOKEN = "stub-analytics-token-7f3a91";
const MAPPED = Object.keys(UPSTOX_INSTRUMENTS);
const SOME = MAPPED.slice(0, 6);
const UNMAPPED = UPSTOX_INSTRUMENT_COVERAGE.unmapped[0] ?? "NOTMAPPED";

type Row = Record<string, unknown>;
type Seen = { url: string; headers: Record<string, string>; redirect?: string; keys: string[] };

/** A well-formed full-quote row for one mapped symbol, as Upstox's own sample shapes it. */
function row(sym: string, over: Row = {}): Row {
  const inst = UPSTOX_INSTRUMENTS[sym];
  return {
    ohlc: { open: 101, high: 104, low: 99, close: 102.5 },
    timestamp: "2026-09-23T10:21:51.099+05:30",
    instrument_token: inst.key,
    symbol: inst.tradingSymbol,
    last_price: 102.5,
    volume: 12345,
    net_change: 2.5,
    last_trade_time: "1790141511000",
    ...over,
  };
}

/**
 * ONE CALL, WITH BOTH UPSTREAMS AND THE EDGE CACHE STUBBED.
 *
 * `upstox` decides Upstox's answer from the instrument keys it was asked for;
 * `munsPriceable` is what the muns stub will price. Every request is recorded,
 * headers included, so a test can say exactly where the token went.
 */
async function call(opts: {
  env: Record<string, string | undefined>;
  symbols?: string[];
  method?: string;
  url?: string;
  upstox?: (keys: string[]) => { status: number; body: unknown };
  munsPriceable?: (s: string) => boolean;
  bundle?: Record<string, unknown>;
}) {
  const upstoxSeen: Seen[] = [];
  const munsAsked: string[][] = [];
  let stored: Record<string, unknown> = { ...(opts.bundle ?? {}) };
  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch, realCaches = g.caches;
  g.fetch = async (input: string | URL, init: { headers?: Record<string, string>; body?: string; redirect?: string } = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.upstox.com/")) {
      const keys = (new URL(url).searchParams.get("instrument_key") ?? "").split(",").filter(Boolean);
      upstoxSeen.push({ url, headers: init.headers ?? {}, redirect: init.redirect, keys });
      const a = (opts.upstox ?? ((k: string[]) => ({
        status: 200,
        body: { status: "success", data: Object.fromEntries(k.map((key) => {
          const sym = MAPPED.find((s) => UPSTOX_INSTRUMENTS[s].key === key)!;
          return [`NSE_EQ:${sym}`, row(sym)];
        })) },
      })))(keys);
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
    }
    const body = JSON.parse(init.body ?? "{}");
    const want: string[] = String(body.ticker_symbol ?? "").split(",").filter(Boolean);
    munsAsked.push(want);
    const priceable = opts.munsPriceable ?? (() => true);
    return new Response(JSON.stringify({
      data: { items: want.filter(priceable).map((s) => ({ ticker: s, currentPrice: 100, rawQuote: "Previous Close=90,Opening Price=91" })) },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  g.caches = {
    default: {
      async match() { return new Response(JSON.stringify(stored)); },
      async put(_k: unknown, res: Response) { stored = await res.json(); },
    },
  };
  try {
    const method = opts.method ?? "POST";
    const res = await onRequest({
      env: opts.env,
      request: new Request(opts.url ?? "https://example.test/api/quotes", {
        method,
        ...(method === "POST" ? { body: JSON.stringify({ symbols: opts.symbols ?? [] }) } : {}),
      }),
    });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) as Record<string, any>, upstoxSeen, munsAsked, stored };
  } finally {
    g.fetch = realFetch; g.caches = realCaches;
  }
}

const priced = (b: Record<string, any>) => Object.keys(b.quotes ?? {});

// ── 0. THE COMMITTED MAP IS WHAT THIS FEED STANDS ON ────────────────────────
ok("the committed instrument map covers the book's symbols",
   MAPPED.length === UPSTOX_INSTRUMENT_COVERAGE.mapped && MAPPED.length >= 150,
   `${MAPPED.length} of ${UPSTOX_INSTRUMENT_COVERAGE.asked} mapped · not mapped: ${UPSTOX_INSTRUMENT_COVERAGE.unmapped.join(", ") || "none"}`);
ok("every mapped key is an NSE cash-market ISIN key",
   Object.values(UPSTOX_INSTRUMENTS).every((i) => /^NSE_EQ\|IN[A-Z0-9]{10}$/.test(i.key)));

// ── 1. THE WHOLE ASK IN ONE ROUND, AND NOTHING LEFT PENDING ─────────────────
// The point of the change: muns prices 64 a request, Upstox answers every
// mapped symbol in one call, so the movers card no longer waits three rounds.
{
  const symbols = [...MAPPED, UNMAPPED];
  const { body, upstoxSeen, munsAsked } = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN }, symbols });
  ok("every mapped symbol is priced by Upstox in ONE call",
     upstoxSeen.length === 1 && upstoxSeen[0].keys.length === MAPPED.length
     && MAPPED.every((s) => body.quotes[s]?.source === "upstox"),
     `${upstoxSeen.length} call · ${upstoxSeen[0]?.keys.length} keys · ${priced(body).length} priced`);
  ok("with no muns token, nothing is pending — the unmapped symbol is `missing`",
     body.pending.length === 0 && body.missing.includes(UNMAPPED) && munsAsked.length === 0,
     `pending ${body.pending.length} · missing ${body.missing.join(",")}`);
  const seen = [...priced(body), ...body.missing, ...body.pending];
  ok("the partition holds: every symbol in exactly one of quotes / missing / pending",
     seen.length === symbols.length && new Set(seen).size === symbols.length);
  ok("the response counts which feed priced what",
     body.sources?.upstox === MAPPED.length && body.upstox?.priced === MAPPED.length,
     JSON.stringify(body.sources));
}

// ── 2. THE PREVIOUS CLOSE IS last_price − net_change, NEVER ohlc.close ──────
// Upstox's own sample prints ohlc.close EQUAL to the last price; read as the
// previous close, every day's move is zero. The float noise is its own sample's.
{
  const q = shapeUpstoxRow(row(SOME[0], {
    last_price: 52.04999923706055, net_change: -1.0500000000000043,
    ohlc: { open: 53.4, high: 53.8, low: 51.75, close: 52.05 },
  }));
  ok("previous close is struck from net_change, not from ohlc.close",
     q?.price === 52.05 && q?.prevClose === 53.1 && q?.open === 53.4 && q?.dayLow === 51.75 && q?.dayHigh === 53.8,
     JSON.stringify(q));
  ok("a figure Upstox does not carry is null, never 0",
     q?.low52 === null && q?.high52 === null && q?.marketCap === null && q?.yearChangePct === null);
  const noChange = shapeUpstoxRow(row(SOME[0], { net_change: undefined }));
  ok("no net_change means no previous close — not the price itself",
     noChange?.prevClose === null && noChange?.price === 102.5);
  ok("a row with no usable price is refused",
     shapeUpstoxRow(row(SOME[0], { last_price: 0 })) === null && shapeUpstoxRow(row(SOME[0], { last_price: "x" })) === null);
  ok("an unopened session's zero open is null, not ₹0",
     shapeUpstoxRow(row(SOME[0], { ohlc: { open: 0, high: 0, low: 0, close: 0 } }))?.open === null);
}

// ── 3. THE IDENTITY GATE ────────────────────────────────────────────────────
// A price for the wrong instrument is a complete, well-formed figure that
// nothing on screen could catch. A row must echo the key AND the symbol.
{
  const [a, b] = SOME;
  const { body } = await call({
    env: { UPSTOX_ACCESS_TOKEN: TOKEN },
    symbols: [a, b],
    upstox: () => ({ status: 200, body: { status: "success", data: {
      [`NSE_EQ:${a}`]: row(a, { symbol: "SOMEONEELSE" }),
      [`NSE_EQ:${b}`]: row(b),
      "NSE_EQ:NOTASKED": { ...row(b), instrument_token: "NSE_EQ|INE000000000", symbol: "NOTASKED" },
    } } }),
  });
  ok("a row echoing the right key under another symbol is refused, not priced",
     !body.quotes[a] && body.missing.includes(a) && body.upstox.refused.some((r: { symbol: string }) => r.symbol === a),
     JSON.stringify(body.upstox.refused));
  ok("a row for an instrument nobody asked for is ignored",
     !body.quotes.NOTASKED && body.quotes[b]?.source === "upstox");
}

// ── 4. WHERE THE TOKEN GOES, AND WHERE IT DOES NOT ─────────────────────────
{
  const { text, upstoxSeen } = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN, MUNS_TOKEN: "muns-stub" }, symbols: [...SOME, UNMAPPED] });
  const h = upstoxSeen[0]?.headers ?? {};
  ok("the Upstox call carries the token as a bearer header, to Upstox's own host",
     h.Authorization === `Bearer ${TOKEN}` && upstoxSeen[0].url.startsWith("https://api.upstox.com/v2/market-quote/quotes?"));
  ok("no redirect is followed with the token attached", upstoxSeen[0]?.redirect === "manual");
  ok("the token appears nowhere in the response", !text.includes(TOKEN) && !text.includes(TOKEN.slice(0, 10)));
}
{
  const t1 = upstoxToken({ UPSTOX_TOKEN: `  Bearer ${TOKEN}  ` });
  const t2 = upstoxToken({ UPSTOX_ACCESS_TOKEN: `"${TOKEN}"`, UPSTOX_TOKEN: "other" });
  ok("the name the sister dashboards use wins, and the other name works too",
     t1?.name === "UPSTOX_TOKEN" && t2?.name === "UPSTOX_ACCESS_TOKEN");
  ok("a token pasted with `Bearer ` or quotes is cleaned, not sent doubled",
     t1?.token === TOKEN && t2?.token === TOKEN);
  ok("an empty variable is not a token", upstoxToken({ UPSTOX_ACCESS_TOKEN: "   " }) === null && upstoxToken(undefined) === null);
}

// ── 5. muns PRICES ONLY WHAT UPSTOX DID NOT ─────────────────────────────────
{
  const { body, munsAsked } = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN, MUNS_TOKEN: "muns-stub" }, symbols: [...SOME, UNMAPPED] });
  const askedMuns = munsAsked.flat();
  ok("with both tokens, muns is asked only for the symbol Upstox has no instrument for",
     askedMuns.length === 1 && askedMuns[0] === UNMAPPED && body.quotes[UNMAPPED]?.source === "muns",
     `muns asked for ${askedMuns.join(",") || "nothing"}`);
  ok("...and the sources say so", body.sources?.upstox === SOME.length && body.sources?.muns === 1, JSON.stringify(body.sources));
}

// ── 6. A REFUSED TOKEN ──────────────────────────────────────────────────────
const refused401 = () => ({ status: 401, body: { status: "error", errors: [{ errorCode: "UDAPI100050", message: "Invalid token used to access API" }] } });
{
  const { body, munsAsked } = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN, MUNS_TOKEN: "muns-stub" }, symbols: SOME, upstox: refused401 });
  ok("a refused token falls back to muns for the whole ask",
     body.ok === true && munsAsked.flat().length === SOME.length && SOME.every((s) => body.quotes[s]?.source === "muns"));
  ok("...and names the refusal first among the errors",
     body.errors[0]?.source === "upstox" && body.errors[0]?.status === 401 && body.errors[0]?.errorName === "UDAPI100050",
     JSON.stringify(body.errors[0]));
}
{
  const { body } = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN }, symbols: SOME, upstox: refused401 });
  ok("with nothing to fall back to, a refused token is its own failure — not an outage",
     body.ok === false && body.failureCode === "UPSTOX_UNAUTHORIZED" && body.upstreamStatus === 401,
     `${body.failureCode} · ${body.upstreamStatus}`);
}
{
  const { body } = await call({ env: {}, symbols: SOME });
  ok("no token of either kind is NOT_CONFIGURED", body.ok === false && body.failureCode === "NOT_CONFIGURED");
}

// ── 7. THE EDGE CACHE: ONE UPSTOX CALL A MINUTE, WHATEVER THE TRAFFIC ───────
// The token is shared with two other dashboards, so a second request inside the
// freshness window must not spend another call — and keeps its source.
{
  const first = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN }, symbols: SOME });
  const second = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN }, symbols: SOME, bundle: first.stored });
  ok("a request inside the freshness window is served from the edge cache",
     second.upstoxSeen.length === 0 && SOME.every((s) => second.body.quotes[s]?.source === "upstox"),
     `${second.upstoxSeen.length} Upstox calls on the second request`);
}

// ── 8. `GET /api/quotes?check=1` — THE ONE-SENTENCE HEALTH CHECK ───────────
{
  const none = await call({ env: {}, method: "GET", url: "https://example.test/api/quotes?check=1" });
  ok("with no token, the check says so and names the variable to set",
     none.status === 200 && none.body.ok === false && /UPSTOX_ACCESS_TOKEN/.test(none.body.verdict) && none.upstoxSeen.length === 0,
     none.body.verdict);
  const good = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN }, method: "GET", url: "https://example.test/api/quotes?check=1" });
  ok("with a working token, the check prices three stocks in one call and says Upstox is working",
     good.body.ok === true && /Upstox is working/.test(good.body.verdict) && good.body.upstox.sample.length === 3
     && good.upstoxSeen.length === 1 && good.body.tokenVariable === "UPSTOX_ACCESS_TOKEN",
     good.body.verdict);
  ok("...and the token appears nowhere in it", !good.text.includes(TOKEN));
  const bad = await call({ env: { UPSTOX_TOKEN: TOKEN }, method: "GET", url: "https://example.test/api/quotes?check=1", upstox: refused401 });
  ok("with a refused token, the check says REFUSED and names the likely causes",
     bad.body.ok === false && /REFUSED/.test(bad.body.verdict) && /3:30 AM/.test(bad.body.verdict) && bad.body.upstox.httpStatus === 401,
     bad.body.verdict);
  const plainGet = await call({ env: { UPSTOX_ACCESS_TOKEN: TOKEN }, method: "GET" });
  ok("a GET without ?check is still refused", plainGet.status === 405 && plainGet.upstoxSeen.length === 0);
}

// ── 9. THE HELPER ITSELF: EVERY SYMBOL LANDS IN EXACTLY ONE PLACE ───────────
{
  const g = globalThis as unknown as Record<string, unknown>;
  const real = g.fetch;
  g.fetch = async () => { throw Object.assign(new Error("boom"), { name: "TypeError" }); };
  try {
    const r = await fetchUpstoxQuotes([...SOME, UNMAPPED], TOKEN);
    const all = [...Object.keys(r.quotes), ...r.unmapped, ...r.refused.map((x) => x.symbol), ...r.notReturned];
    ok("a failed call leaves every mapped symbol `notReturned` and the unmapped one `unmapped`",
       Object.keys(r.quotes).length === 0 && r.notReturned.length === SOME.length && r.unmapped[0] === UNMAPPED
       && all.length === SOME.length + 1 && new Set(all).size === all.length && r.calls[0].errorCode === "FETCH_FAILED");
  } finally { g.fetch = real; }
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
