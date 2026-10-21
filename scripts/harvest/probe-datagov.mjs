#!/usr/bin/env node
// PROBE — discover which data.gov.in resources can actually back the Economy page.
//
// This is a DISCOVERY tool, not part of the harvest. It exists because
// data.gov.in's catalogue quality varies sharply by ministry: a resource whose
// ministry stopped publishing in 2019 still serves HTTP 200 with a full JSON
// envelope, so "the call worked" says nothing about whether the figure is
// current. The only way to know is to read the newest observation off each
// candidate and look at its date.
//
// It runs in GitHub Actions rather than locally because the API key lives in
// the repository secrets and is never printed here: the script reads
// DATA_GOV_IN_KEY from the environment, sends it, and redacts it from every URL
// it logs. What reaches the log is the catalogue metadata and a sample row.
//
// Usage (locally, if you hold a key):  DATA_GOV_IN_KEY=… node scripts/harvest/probe-datagov.mjs
// Usage (CI):                          workflow_dispatch on probe-datagov.yml

const KEY = process.env.DATA_GOV_IN_KEY || "";
if (!KEY) {
  console.error("DATA_GOV_IN_KEY is not set — nothing to probe.");
  process.exit(1);
}

const BASE = "https://api.data.gov.in";
const UA = "Mozilla/5.0 (compatible; GlowVenturesHarvest/1.0)";

// Never let the key reach a log line, an error message or a stack trace.
const redact = (s) => String(s).split(KEY).join("<API-KEY>");

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${redact(url)} — ${redact(body).slice(0, 300)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`non-JSON response for ${redact(url)} — ${redact(body).slice(0, 300)}`);
  }
}

// What the FOOS spec's Economy section asks for, and the words a data.gov.in
// title would use for it. Matching is on the TITLE, deliberately broad here —
// the point of a probe is to see everything plausible and judge it by hand,
// not to auto-select. Each group is judged separately in the output.
const WANTED = [
  { key: "cpi", label: "Consumer Price Index / inflation", any: ["consumer price index", "cpi ", " cpi", "inflation rate"] },
  { key: "iip", label: "Index of Industrial Production", any: ["index of industrial production", "industrial production", "iip"] },
  { key: "wpi", label: "Wholesale Price Index", any: ["wholesale price index", "wpi"] },
  { key: "gst", label: "GST collections", any: ["gst collection", "goods and services tax", "gst revenue"] },
  { key: "vehicle", label: "Vehicle sales / registrations", any: ["vehicle registration", "vehicle sales", "vahan", "motor vehicle"] },
  { key: "housing", label: "Housing / house prices", any: ["house price", "housing price", "residex", "housing start"] },
  { key: "capacity", label: "Capacity utilisation", any: ["capacity utilisation", "capacity utilization"] },
  { key: "unemp", label: "Unemployment / labour force", any: ["unemployment rate", "labour force participation", "periodic labour force"] },
];

const matchGroup = (title) => {
  const t = String(title || "").toLowerCase();
  for (const g of WANTED) if (g.any.some((n) => t.includes(n))) return g;
  return null;
};

/**
 * Does the catalogue support a server-side title search? If it does, the whole
 * brute-force scan below is unnecessary and — more importantly — a truncated
 * scan can no longer be mistaken for a complete one.
 */
async function probeSearchParams() {
  const forms = [
    ["filters[title]", `${BASE}/lists?format=json&api-key=${KEY}&limit=5&filters[title]=Consumer Price Index`],
    ["q", `${BASE}/lists?format=json&api-key=${KEY}&limit=5&q=Consumer Price Index`],
    ["title", `${BASE}/lists?format=json&api-key=${KEY}&limit=5&title=Consumer Price Index`],
  ];
  for (const [name, url] of forms) {
    try {
      const d = await getJson(encodeURI(url));
      const recs = d?.records || [];
      const hits = recs.filter((r) => String(r?.title || "").toLowerCase().includes("consumer price")).length;
      console.log(`  search form "${name}": ${recs.length} returned, ${hits} actually match the title — ${hits > 0 && hits === recs.length ? "WORKS" : "ignored by the API"}`);
    } catch (e) {
      console.log(`  search form "${name}": ${redact(e.message).slice(0, 160)}`);
    }
  }
}

async function listCatalogue({ pageSize = 500, maxPages = 400 } = {}) {
  const found = [];
  let offset = 0;
  let declaredTotal = null;
  let exhausted = false;
  for (let page = 0; page < maxPages; page++) {
    const url = `${BASE}/lists?format=json&api-key=${KEY}&offset=${offset}&limit=${pageSize}&filters[active]=1`;
    const d = await getJson(url);
    if (declaredTotal == null) {
      declaredTotal = d?.total ?? null;
      console.log(`  catalogue declares total=${declaredTotal}`);
    }
    const records = d?.records || d?.data || [];
    if (!Array.isArray(records) || records.length === 0) {
      console.log(`  catalogue exhausted at offset ${offset} (page ${page + 1})`);
      exhausted = true;
      break;
    }
    for (const rec of records) {
      const g = matchGroup(rec?.title);
      if (g) found.push({ group: g.key, title: rec.title, id: rec.index_name || rec.resource_id || rec.id, org: (rec.org || []).join(" / "), updated: rec.updated || rec.updated_date || null, sector: (rec.sector || []).join(" / ") });
    }
    offset += records.length;
    if (records.length < pageSize) {
      console.log(`  catalogue exhausted at offset ${offset} (short page)`);
      exhausted = true;
      break;
    }
    if (page % 20 === 19) console.log(`  …scanned ${offset} resources, ${found.length} candidates so far`);
  }
  // A TRUNCATED SCAN IS NOT A COMPLETE ONE, and the difference decides whether
  // "data.gov.in carries nothing current for this" is a finding or a guess.
  if (!exhausted) console.log(`  !! SCAN TRUNCATED at ${offset} of ${declaredTotal ?? "unknown"} — raise maxPages before drawing any conclusion`);
  return { found, scanned: offset, declaredTotal, exhausted };
}

// A resource is only useful if its NEWEST row is recent. This reads a few rows
// and reports the date range, so a ministry that stopped publishing in 2019 is
// visible as such rather than as a working endpoint.
async function inspect(id) {
  const url = `${BASE}/resource/${encodeURIComponent(id)}?api-key=${KEY}&format=json&limit=3`;
  const d = await getJson(url);
  const fields = (d?.field || []).map((f) => `${f.id}:${f.type}`);
  const total = d?.total ?? null;
  const sample = (d?.records || [])[0] || null;
  return { total, count: d?.count ?? null, fields, sample, updated: d?.updated_date || d?.updated || null };
}

/**
 * THE WIRED RESOURCES, CHECKED FOR EXTENT.
 *
 * Both wired series stop in 2023 even though their catalogue records were
 * touched today. That is either the ministry having quietly stopped appending —
 * the exact "record touched, data frozen" trap this probe exists to catch — or
 * this reader seeing only part of the record. The two are indistinguishable
 * from the series alone and lead to opposite actions, so they are separated
 * here: this prints the FULL field count and the last few month columns the API
 * returns, with and without an explicit `fields` request.
 */
const WIRED = [
  { id: "india-wpi", resource: "239ac3d0-f08d-40d0-b03c-9b7a426a62d5", rowField: "COMM_NAME", rowValue: "All Commodities" },
  { id: "india-iip", resource: "31d53713-46c6-48bd-951a-4d986272fd96", rowField: "description", rowValue: "General" },
];

async function extent() {
  console.log("\n\n========== EXTENT OF THE WIRED RESOURCES ==========");
  for (const w of WIRED) {
    try {
      const d = await getJson(`${BASE}/resource/${w.resource}?api-key=${KEY}&format=json&limit=5`);
      const declared = (d?.field || []).map((f) => f.id);
      const rec = (d?.records || [])[0] || {};
      const onRecord = Object.keys(rec);
      console.log(`\n  ${w.id} (${w.resource})`);
      console.log(`    total=${d?.total}  declared fields=${declared.length}  fields on a record=${onRecord.length}`);
      console.log(`    LAST 6 declared : ${declared.slice(-6).join(", ")}`);
      console.log(`    LAST 6 on record: ${onRecord.slice(-6).join(", ")}`);
      // If the declared schema runs further than the returned record, the read
      // is being truncated and the fix is here, not a stale-source note.
      if (declared.length > onRecord.length) {
        console.log(`    !! RECORD IS SHORTER THAN THE SCHEMA by ${declared.length - onRecord.length} fields — the read is truncated, not the source`);
      } else {
        console.log(`    -> record carries every declared field: the SOURCE stops here, not the reader`);
      }
    } catch (e) {
      console.log(`  ${w.id}: FAILED ${redact(e.message).slice(0, 200)}`);
    }
  }
}

(async () => {
  if (process.argv.includes("--extent")) { await extent(); return; }
  console.log("=== data.gov.in catalogue probe ===\n");
  console.log("Does the API support a server-side title search?");
  await probeSearchParams();
  console.log("\nScanning the active catalogue for Economy-page candidates…");
  const { found, scanned, declaredTotal, exhausted } = await listCatalogue();
  console.log(`\nScanned ${scanned} of ${declaredTotal ?? "unknown"} (${exhausted ? "COMPLETE" : "TRUNCATED"}) — ${found.length} candidates\n`);

  for (const g of WANTED) {
    const rows = found.filter((f) => f.group === g.key);
    console.log(`\n===== ${g.label} — ${rows.length} candidate(s) =====`);
    if (!rows.length) { console.log("  (none in the catalogue under these words)"); continue; }
    // Newest-updated first: a live ministry feed sorts to the top. `updated` is
    // a unix timestamp in seconds, so it is compared as a NUMBER — sorted as a
    // string, a shorter timestamp would outrank a later one.
    rows.sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
    for (const r of rows.slice(0, 12)) {
      const when = Number(r.updated) ? new Date(Number(r.updated) * 1000).toISOString().slice(0, 10) : "unknown";
      console.log(`  • ${r.title}`);
      console.log(`      id=${r.id}  org=${r.org}  updated=${when}`);
    }
    // Inspect the three most recently updated — enough to see the shape and the
    // real coverage without hammering the API.
    for (const r of rows.slice(0, 3)) {
      try {
        const info = await inspect(r.id);
        console.log(`\n    -- inspect ${r.id} (${r.title})`);
        console.log(`       rows=${info.total} fields=${info.fields.join(", ")}`);
        console.log(`       sample=${JSON.stringify(info.sample)}`);
      } catch (e) {
        console.log(`\n    -- inspect ${r.id} FAILED: ${redact(e.message)}`);
      }
    }
  }
  // THE VERDICT, LAST, IN ONE BLOCK.
  //
  // A reader of this log has to answer one question per indicator: is there a
  // resource here that is CURRENT and is a TIME SERIES? The detail above is
  // hundreds of lines and the answer scrolls off the top. So each group ends
  // with its freshest candidate and how recently the catalogue touched it.
  //
  // Recency of the RECORD is not recency of the DATA — a 2026 upload of a
  // 2011-12 survey is a fresh record of a stale figure — so the title is
  // printed beside the date and the judgement stays with the reader.
  // ROLLING RESOURCES — the ones that are actually a live series.
  //
  // Nearly everything in this catalogue is a SNAPSHOT: a parliamentary answer,
  // a survey round, a table "up to December 2022" that will never gain another
  // row. A handful are different — they carry a rolling window in the title
  // ("till last month") and the ministry appends to them. Those are the only
  // entries that can back a series, and they do not necessarily sort to the top
  // by record date, so they need finding by name rather than by recency.
  const ROLLING = /till last month|latest month|last month|upto date|up to date|monthly|month-wise|month wise/i;
  const rolling = found.filter((f) => ROLLING.test(f.title));
  console.log(`\n\n========== ROLLING CANDIDATES (${rolling.length}) ==========`);
  console.log("these carry a moving window in the title, so the ministry appends to them.\n");
  rolling.sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
  for (const r of rolling.slice(0, 25)) {
    const when = Number(r.updated) ? new Date(Number(r.updated) * 1000).toISOString().slice(0, 10) : "unknown";
    console.log(`  [${r.group}] ${when}  id=${r.id}`);
    console.log(`      ${r.title.slice(0, 160)}`);
  }
  // Inspect the freshest few properly: a rolling title is a claim, and the
  // newest row in the data is what settles it.
  for (const r of rolling.slice(0, 6)) {
    try {
      const info = await inspect(r.id);
      console.log(`\n    -- inspect ${r.id} (${r.title.slice(0, 90)})`);
      console.log(`       rows=${info.total}`);
      console.log(`       fields=${info.fields.join(", ").slice(0, 900)}`);
      console.log(`       sample=${JSON.stringify(info.sample).slice(0, 900)}`);
    } catch (e) {
      console.log(`\n    -- inspect ${r.id} FAILED: ${redact(e.message).slice(0, 200)}`);
    }
  }

  console.log("\n\n========== VERDICT ==========");
  console.log("freshest catalogue entry per indicator. NOTE: the update date is when the RECORD");
  console.log("was touched, NOT the period the data covers — read the title for that.\n");
  for (const g of WANTED) {
    const rows = found.filter((f) => f.group === g.key);
    if (!rows.length) { console.log(`${g.label.padEnd(34)} : NONE in catalogue`); continue; }
    rows.sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
    const top = rows[0];
    const when = Number(top.updated) ? new Date(Number(top.updated) * 1000).toISOString().slice(0, 10) : "unknown";
    console.log(`${g.label.padEnd(34)} : ${String(rows.length).padStart(4)} candidates · newest record ${when} · id=${top.id}`);
    console.log(`${" ".repeat(37)}${top.title.slice(0, 150)}`);
  }
  console.log("\n=== probe complete ===");
})().catch((e) => {
  console.error("PROBE FAILED:", redact(e?.stack || e?.message || e));
  process.exit(1);
});
