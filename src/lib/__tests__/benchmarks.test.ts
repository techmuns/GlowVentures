// THE BENCHMARK CATALOGUE AND ITS IDENTITY GATE.
//   npm run test:family
//
// ── WHY ─────────────────────────────────────────────────────────────────────
//
//   "Allow us to select different benchmarks to compare the portfolio returns
//    with and make sure that the benchmark returns are live just like the
//    Nifty 500 benchmark."
//
// Every benchmark is fetched through `/api/prices`, and every one is checked
// by the NAME the upstream reports before a close is drawn — because a symbol
// that looks right answers 200 with a well-formed figure for a different index
// (trap 2 in `functions/api/indices.js`, measured on this very upstream). A
// line from the wrong index renders perfectly, so the gate is checked here
// against the spellings the live service actually returned, and the Function is
// checked to hand that name back at all: a gate reading a field the service
// never sends refuses every benchmark, silently, on the deployed site only.
import { BENCHMARKS, benchmarkByKey, benchmarkIdentity, DEFAULT_BENCHMARK } from "@/lib/benchmarks";
import { NIFTY_500_SYMBOL } from "@/lib/indices";
import type { PriceHistory } from "@/lib/prices";
import { onRequest } from "../../../functions/api/prices.js";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * WHAT THE LIVE UPSTREAM REPORTED, measured 2026-09-23 — `longName` and
 * `shortName` were identical for every one. Written here rather than read out of
 * `benchmarks.ts`, so a catalogue whose expected names drifted from the real
 * spellings fails rather than agreeing with itself.
 */
const LIVE: Record<string, string> = {
  "^CRSLDX": "NIFTY 500",
  "^NSEI": "NIFTY 50",
  "^NSMIDCP": "NIFTY NEXT 50",
  "NIFTYMIDCAP150.NS": "NIFTY MIDCAP 150",
  "NIFTYSMLCAP250.NS": "NIFTY SMLCAP 250",
  "^BSESN": "S&P BSE SENSEX",
  "BSE-500.BO": "S&P BSE 500 INDEX",
};
const hist = (name: string | null): PriceHistory => ({
  ok: true, source: "fixture", symbol: "x", currency: "INR", exchange: "NSE",
  name, longName: name, shortName: name,
  first: "2026-01-01", last: "2026-01-02", count: 2, last_value: 1,
  returns: {}, spans: {}, high52: null, low52: null, t: ["2026-01-01", "2026-01-02"], v: [1, 1],
});

// ── 1. THE CATALOGUE ─────────────────────────────────────────────────────────
console.log("\n── the catalogue ──");
ok("the Nifty 500 is first, so the default and every existing link are unchanged",
   BENCHMARKS[0].key === "nifty-500" && DEFAULT_BENCHMARK.key === "nifty-500");
ok("…and it is the SAME symbol the index strip uses, not a second spelling of it",
   BENCHMARKS[0].symbol === NIFTY_500_SYMBOL);
ok("keys and symbols are unique", new Set(BENCHMARKS.map((b) => b.key)).size === BENCHMARKS.length
   && new Set(BENCHMARKS.map((b) => b.symbol)).size === BENCHMARKS.length);
ok("an unknown ?bench= lands on the default rather than on nothing",
   benchmarkByKey("no-such-index").key === "nifty-500" && benchmarkByKey(null).key === "nifty-500");
ok("every benchmark says it is a price index, from the live service, checked by name",
   BENCHMARKS.every((b) => /a price index/i.test(b.title) && /live price service/i.test(b.title) && /checked by the name/i.test(b.title)));
ok("every symbol has a measured live name", BENCHMARKS.every((b) => LIVE[b.symbol] != null),
   BENCHMARKS.filter((b) => LIVE[b.symbol] == null).map((b) => b.symbol).join(", "));

// ── 2. THE GATE PASSES THE REAL SPELLINGS ────────────────────────────────────
console.log("\n── the gate accepts each index under the name the live service gives it ──");
for (const b of BENCHMARKS) {
  ok(`${b.label} accepts "${LIVE[b.symbol]}"`, benchmarkIdentity(hist(LIVE[b.symbol]), b).ok);
}

// ── 3. …AND REFUSES EVERY OTHER ONE ──────────────────────────────────────────
// Each benchmark against every OTHER benchmark's real name: a gate loose enough
// to take "NIFTY 50" for the Nifty 500, or "NIFTY MIDCAP 150" for the Next 50,
// passes section 2 and fails here.
console.log("\n── …and refuses every other index's name ──");
let crossed = 0;
for (const b of BENCHMARKS) {
  for (const other of BENCHMARKS) {
    if (other.key === b.key) continue;
    if (benchmarkIdentity(hist(LIVE[other.symbol]), b).ok) {
      crossed++;
      ok(`${b.label} must refuse "${LIVE[other.symbol]}"`, false);
    }
  }
}
ok(`no benchmark accepts another's name (${BENCHMARKS.length * (BENCHMARKS.length - 1)} pairs)`, crossed === 0);
const wrong = benchmarkIdentity(hist("NIFTY MIDCAP 50"), benchmarkByKey("nifty-next-50"));
ok("the measured decoy — a Next 50 symbol answering as a Midcap 50 — is refused, naming what answered",
   !wrong.ok && wrong.reportedName === "NIFTY MIDCAP 50");
const unnamed = benchmarkIdentity(hist(null), benchmarkByKey("nifty-500"));
ok("a history carrying NO name is refused — unverified is not a match",
   !unnamed.ok && unnamed.reportedName === null);

// ── 4. THE FUNCTION HANDS THE NAME BACK ──────────────────────────────────────
// Without this the gate above is a gate on a field that never arrives, and it
// refuses every benchmark on the deployed site while every other check passes.
console.log("\n── /api/prices returns the name the upstream reported ──");
{
  const day = (d: string) => Date.parse(`${d}T03:45:00Z`) / 1000;
  (globalThis as { fetch: unknown }).fetch = async () =>
    new Response(JSON.stringify({ chart: { result: [{
      meta: { currency: "INR", fullExchangeName: "BSE", longName: "S&P BSE SENSEX", shortName: "S&P BSE SENSEX" },
      timestamp: [day("2026-01-05"), day("2026-01-06")],
      indicators: { quote: [{ close: [74000, 74500] }] },
    }] } }), { headers: { "content-type": "application/json" } });
  const puts: string[] = [];
  (globalThis as { caches?: unknown }).caches = {
    default: { match: async () => undefined, put: async (k: Request) => { puts.push(k.url); } },
  };
  const res = await onRequest({
    request: new Request("https://glow.example/api/prices?symbol=%5EBSESN"),
    waitUntil: () => undefined,
  });
  const body = await res.json() as PriceHistory;
  ok("the body carries the upstream's own name", body.name === "S&P BSE SENSEX"
     && body.longName === "S&P BSE SENSEX" && body.shortName === "S&P BSE SENSEX");
  ok("…and the gate accepts the Sensex off that very body", benchmarkIdentity(body, benchmarkByKey("sensex")).ok);
  ok("…and refuses it as any other benchmark", !benchmarkIdentity(body, benchmarkByKey("bse-500")).ok);
  ok("the edge cache is keyed v2, so a v1 body with no name is never served to the gate",
     puts.length === 1 && puts[0].includes("/__cache/prices/v2/"), puts.join(", "));
}

console.log(fails ? `\n${fails} failed` : "\nall benchmark checks passed");
process.exit(fails ? 1 : 0);
