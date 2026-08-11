#!/usr/bin/env node
// PROBE — which upstreams are reachable from the HARVEST ENVIRONMENT.
//
// `docs/SERIES-REPORT.md` declares several series absent with the reason "FRED
// is unreachable from the harvest environment (connection refused, not a proxy
// fix)". That was measured in a development container, and the nightly harvest
// does not run there — it runs on a GitHub Actions runner, on a completely
// different network. An absence recorded against the wrong network is a
// declared gap that might not exist, which is its own kind of wrong figure:
// it tells a reader to stop looking for something that is available.
//
// So this checks each candidate upstream from the place the harvester actually
// runs, and reports status, latency and a first line of the body. Nothing is
// stored and no series is written — the point is to decide whether a catalogue
// entry is worth writing, not to write one.

const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";

// Each entry names the SERIES it would unblock, so the output reads as a
// decision list rather than a connectivity dump.
const TARGETS = [
  {
    name: "FRED — DGS10 (US 10Y, already served by ^TNX)",
    unblocks: "nothing new; the canary for whether FRED works at all",
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10",
  },
  {
    name: "FRED — BAMLC0A0CM (ICE BofA US corporate OAS)",
    unblocks: "credit-spreads (declared absent)",
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLC0A0CM",
  },
  {
    name: "FRED — INDIRLTLT01STM (India long-term govt bond yield)",
    unblocks: "india-10y (declared absent)",
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=INDIRLTLT01STM",
  },
  {
    name: "ECB — EUR reference rates (daily, keyless)",
    unblocks: "moving FX from a spot call to stored history",
    url: "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=5&format=csvdata",
  },
  {
    name: "World Bank Pink Sheet landing page (already used)",
    unblocks: "nothing; the control — this one is known to work",
    url: "https://www.worldbank.org/en/research/commodity-markets",
  },
  {
    name: "Yahoo chart (already used)",
    unblocks: "nothing; the control",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=1735689600&period2=1738368000&interval=1d",
  },
];

async function check(t) {
  const started = Date.now();
  try {
    // A 20s ceiling: a source that cannot answer in twenty seconds cannot be
    // relied on by a nightly job either, so a timeout is a real answer here.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    const r = await fetch(t.url, { headers: { "User-Agent": UA }, signal: ctl.signal, redirect: "follow" });
    clearTimeout(timer);
    const body = await r.text();
    const ms = Date.now() - started;
    const first = body.split("\n").find((l) => l.trim())?.slice(0, 120) ?? "(empty body)";
    // HTTP 200 with an HTML error page is not success, so the first line is
    // printed rather than trusting the status alone.
    console.log(`  ${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(4)} ${ms}ms  ${t.name}`);
    console.log(`         unblocks: ${t.unblocks}`);
    console.log(`         first line: ${first}`);
    return r.ok;
  } catch (e) {
    const ms = Date.now() - started;
    console.log(`  FAIL ---  ${ms}ms  ${t.name}`);
    console.log(`         unblocks: ${t.unblocks}`);
    console.log(`         error: ${String(e?.message || e).slice(0, 200)}`);
    return false;
  }
}

(async () => {
  console.log("=== upstream reachability, from the harvest environment ===\n");
  const results = [];
  for (const t of TARGETS) results.push([t, await check(t)]);

  console.log("\n========== VERDICT ==========");
  for (const [t, ok] of results) console.log(`${ok ? "REACHABLE  " : "UNREACHABLE"}  ${t.name}`);
  const controlsOk = results.filter(([t]) => t.unblocks.startsWith("nothing; the control")).every(([, ok]) => ok);
  if (!controlsOk) {
    console.log("\n!! A CONTROL FAILED — the runner's network is degraded, so no UNREACHABLE above");
    console.log("   should be recorded as a property of the source. Re-run before concluding anything.");
  }
})();
