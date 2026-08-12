#!/usr/bin/env node
// PROBE — is the RBI Weekly Statistical Supplement ADDRESSABLE from the runner?
//
// Reachability is settled. `probe-reach.mjs`, run on a GitHub Actions runner on
// 2026-08-12, got HTTP 200 from `rbi.org.in` in 1,226 ms with both controls
// passing. The thirteen WSS series were declared absent as "geo-blocked", and
// that was measured in a development container — the same mistake FRED cost
// this repo, filed against the same wrong network.
//
// WHAT IS NOT SETTLED is whether a nightly job can find the CURRENT issue.
// `BS_ViewWSS.aspx` is an ASP.NET form: read through muns' web_reader it comes
// back as a subsection dropdown and no figures, and `WSSView.aspx?Id=25253` —
// the one issue URL there is, found in a search result — is from April 2022.
// A harvester that cannot address this week's supplement can harvest nothing.
//
// So this reads the RAW HTML rather than a markdown rendering of it, because
// the two are not the same evidence: an anchor whose text is an icon survives
// in HTML and vanishes in markdown, and the question here is entirely about
// anchors. It reports what it finds and writes nothing.
//
//   node scripts/harvest/probe-rbi.mjs

const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";

const PAGES = [
  { name: "WSS landing (the form)", url: "https://rbi.org.in/Scripts/BS_ViewWSS.aspx" },
  { name: "WSS extract (the weekly press release)", url: "https://rbi.org.in/Scripts/BS_ViewWSSExtract.aspx" },
  { name: "a known issue page", url: "https://rbi.org.in/Scripts/WSSView.aspx?Id=25253" },
];

async function get(url) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctl.signal, redirect: "follow" });
    const body = await r.text();
    return { ok: r.ok, status: r.status, ms: Date.now() - started, body, type: r.headers.get("content-type") };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - started, body: "", error: String(e?.message ?? e) };
  } finally { clearTimeout(timer); }
}

/** Every WSS-ish link on a page, deduped, with the text that labels it. */
function wssLinks(html) {
  const out = new Map();
  const re = /<a[^>]+href="([^"]*(?:WSSView|WssExtract|Wss\/)[^"]*)"[^>]*>([\s\S]{0,140}?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1].replace(/&amp;/g, "&");
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!out.has(href)) out.set(href, text);
  }
  return [...out.entries()];
}

/** The `Id=` values present, so a range can be judged rather than guessed. */
const idsIn = (html) => [...new Set([...html.matchAll(/[?&]Id=(\d+)/gi)].map((m) => Number(m[1])))].sort((a, b) => b - a);

console.log("=== RBI WSS addressability, from the harvest environment ===\n");

for (const p of PAGES) {
  const r = await get(p.url);
  console.log(`── ${p.name}`);
  console.log(`   ${r.ok ? "OK" : "FAIL"} ${r.status ?? r.error}  ${r.ms}ms  ${r.type ?? ""}  ${r.body.length} bytes`);
  if (!r.ok) { console.log(); continue; }

  const links = wssLinks(r.body);
  const ids = idsIn(r.body);
  console.log(`   WSS-ish links: ${links.length}   distinct Id values: ${ids.length}${ids.length ? ` (newest ${ids[0]}, oldest ${ids[ids.length - 1]})` : ""}`);
  for (const [href, text] of links.slice(0, 12)) console.log(`     ${text.slice(0, 60).padEnd(60)} ${href.slice(0, 90)}`);

  // A DATE ON THE PAGE IS THE THING THAT MAKES AN ISSUE ADDRESSABLE. If the
  // landing page prints the current supplement's date beside a link, a reader
  // can follow it; if it only prints a dropdown, it cannot.
  const dates = [...new Set([...r.body.matchAll(/\b([A-Z][a-z]{2}\s+\d{1,2},\s+20\d{2})\b/g)].map((m) => m[1]))];
  console.log(`   dates printed: ${dates.slice(0, 6).join(" | ") || "(none)"}`);

  // An ASP.NET form can sometimes be driven with a POST; whether it can is a
  // different question from whether it must be, and the answer starts here.
  const isForm = /__VIEWSTATE/.test(r.body);
  console.log(`   ASP.NET postback form: ${isForm ? "yes — the index is behind __VIEWSTATE" : "no"}`);
  console.log();
}

// The XLSX route, which `probe-reach.mjs` reported as OK 200 — and whose first
// line was `<!DOCTYPE html>`. A 200 serving HTML where a workbook was asked for
// is the failure that prober's own comment warns about, so it is checked by
// CONTENT rather than status.
const XLSX = "https://rbidocs.rbi.org.in/rdocs/Wss/DOCs/6T_15042022581B32E54D0F45659D16814A71480E61.XLSX";
const x = await get(XLSX);
console.log("── the linked XLSX, checked by content and not by status");
console.log(`   ${x.status} ${x.type} ${x.body.length} bytes`);
const head = x.body.slice(0, 8);
const looksZip = head.startsWith("PK");
const looksOle = /^�?ÐÏà/.test(head) || head.charCodeAt(0) === 0xd0;
console.log(`   first bytes: ${JSON.stringify(head)}`);
console.log(`   verdict: ${looksZip ? "a real OOXML workbook" : looksOle ? "a legacy BIFF workbook" : "NOT a workbook — HTTP 200 serving something else"}`);
