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

async function listCatalogue({ pageSize = 500, maxPages = 40 } = {}) {
  const found = [];
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = `${BASE}/lists?format=json&api-key=${KEY}&offset=${offset}&limit=${pageSize}&filters[active]=1`;
    const d = await getJson(url);
    const records = d?.records || d?.data || [];
    if (!Array.isArray(records) || records.length === 0) {
      console.log(`  catalogue exhausted at offset ${offset} (page ${page + 1})`);
      break;
    }
    for (const rec of records) {
      const g = matchGroup(rec?.title);
      if (g) found.push({ group: g.key, title: rec.title, id: rec.index_name || rec.resource_id || rec.id, org: (rec.org || []).join(" / "), updated: rec.updated || rec.updated_date || null, sector: (rec.sector || []).join(" / ") });
    }
    offset += records.length;
    if (records.length < pageSize) {
      console.log(`  catalogue exhausted at offset ${offset} (short page)`);
      break;
    }
    if (page % 5 === 4) console.log(`  …scanned ${offset} resources, ${found.length} candidates so far`);
  }
  return found;
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

(async () => {
  console.log("=== data.gov.in catalogue probe ===\n");
  console.log("Scanning the active catalogue for Economy-page candidates…");
  const found = await listCatalogue();
  console.log(`\nTotal candidates: ${found.length}\n`);

  for (const g of WANTED) {
    const rows = found.filter((f) => f.group === g.key);
    console.log(`\n===== ${g.label} — ${rows.length} candidate(s) =====`);
    if (!rows.length) { console.log("  (none in the catalogue under these words)"); continue; }
    // Newest-updated first: a live ministry feed sorts to the top.
    rows.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
    for (const r of rows.slice(0, 12)) {
      console.log(`  • ${r.title}`);
      console.log(`      id=${r.id}  org=${r.org}  updated=${r.updated}`);
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
  console.log("\n=== probe complete ===");
})().catch((e) => {
  console.error("PROBE FAILED:", redact(e?.stack || e?.message || e));
  process.exit(1);
});
