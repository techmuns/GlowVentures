#!/usr/bin/env node
// Ask the four questions that decide a large part of the remaining backlog,
// against the live muns API, through `functions/api/probe.js`.
//
//   GLOW_PASSWORD='…' node scripts/dev/probe-catalogue.mjs
//
// It checks a KNOWN-GOOD endpoint first and refuses to report on the four if
// that one is down. Without that control, an API outage reads as "web_reader
// does not work" — which is the FRED mistake exactly: an absence recorded
// against the wrong cause, telling a reader to stop looking for something that
// is available. The muns API was measured down twice in eighteen hours while
// this was being written, so the control is not hypothetical.
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.GLOW_URL ?? "https://glowventures-1xw.pages.dev";
const PASSWORD = process.env.GLOW_PASSWORD ?? "";
// GLOW_COOKIE lets a caller supply an already-issued `glow_auth=…` instead of
// the password — useful in an environment that has a browser session but not
// the plaintext. One or the other is required; neither is stored here.
const COOKIE_IN = process.env.GLOW_COOKIE ?? "";
if (!PASSWORD && !COOKIE_IN) { console.error("Set GLOW_PASSWORD or GLOW_COOKIE."); process.exit(2); }

async function signIn() {
  if (COOKIE_IN) return COOKIE_IN.startsWith("glow_auth=") ? COOKIE_IN : `glow_auth=${COOKIE_IN}`;
  const r = await fetch(`${BASE}/__auth/login?next=%2F`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  const m = /glow_auth=([^;]+)/.exec(r.headers.get("set-cookie") ?? "");
  if (!m) throw new Error(`login failed (${r.status})`);
  return `glow_auth=${m[1]}`;
}

const cookie = await signIn();
const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, error: "non-JSON", preview: t.slice(0, 200) }; }
};

// ── The control ─────────────────────────────────────────────────────────────
process.stdout.write("control · is the muns API answering at all? ");
let up = false;
for (let i = 0; i < 3 && !up; i++) {
  const r = await fetch(`${BASE}/api/quotes`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ symbols: ["RELIANCE"], probe: true }),
  }).then((x) => x.json()).catch(() => null);
  up = !!r?.ok;
  if (!up) { process.stdout.write(`no (attempt ${i + 1}) `); await sleep(15000); }
}
if (!up) {
  console.log("\n\nThe muns API is not responding. NOT REPORTING on the four questions:\n" +
    "a timeout during an outage is not evidence that an endpoint does not work.\n" +
    "Re-run when the control passes.");
  process.exit(3);
}
console.log("yes\n");

// ── The four questions ──────────────────────────────────────────────────────
const QUESTIONS = [
  ["1. web_reader on the moneycontrol URL that ratio_source hands back — does it complete that chain?",
   `/api/probe?call=web-reader&url=${encodeURIComponent("https://www.moneycontrol.com/financials/relianceindustries/ratiosVI/RI")}`],
  ["2. web_reader on an Indian government host this container cannot reach — does muns get through?",
   `/api/probe?call=web-reader&url=${encodeURIComponent("https://mospi.gov.in/")}`],
  ["3. combined_financials for India — does it carry the cash flow that financial_tables lacks?",
   "/api/probe?call=combined-financials&ticker=RELIANCE&country=India"],
  ["4. market_data with csv=true — a full series, or the four-row preview on record?",
   "/api/probe?call=market-data&ticker=RELIANCE&start=2026-01-01&end=2026-08-01"],
  ["5. financials (POST /financials/{ticker}) — structured JSON instead of markdown?",
   "/api/probe?call=financials-json&ticker=RELIANCE"],
  ["6. drhp_filings — does the document repository gain prospectuses?",
   "/api/probe?call=drhp&ticker=PAYTM"],
];

for (const [q, path] of QUESTIONS) {
  console.log(`\n${"─".repeat(78)}\n${q}`);
  const d = await get(path);
  console.log(`   status=${d.status} ok=${d.ok} bytes=${d.bytes ?? "-"} ms=${d.durationMs ?? "-"}${d.error ? ` error=${d.error}` : ""}`);
  if (d.parsedAs) console.log(`   shape: ${d.parsedAs}${d.topLevelKeys ? ` · keys ${JSON.stringify(d.topLevelKeys)}` : ""}`);
  if (d.markdownSections?.length) console.log(`   sections: ${d.markdownSections.join(" | ")}`);
  if (d.pipeTableRows) console.log(`   pipe-table rows: ${d.pipeTableRows}   lines: ${d.lineCount}`);
  if (d.preview) console.log(`   preview: ${d.preview.replace(/\s+/g, " ").slice(0, 400)}`);
}
console.log(`\n${"─".repeat(78)}\ndone`);
