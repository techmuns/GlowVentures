/**
 * Build `src/data/amfiMarketCap.json` — SEBI's large / mid cap list as AMFI
 * publishes it, keyed by ISIN, for the holding benchmark (Stage 10kd).
 *
 *   npm run build-amfi-market-cap                       the newest half-year AMFI serves
 *   npm run build-amfi-market-cap -- --period 30Jun2026 one named list
 *   npm run build-amfi-market-cap -- --file <xlsx>      a list already downloaded
 *
 * ── WHY A LIST AND NOT A THRESHOLD ─────────────────────────────────────────
 *
 * SEBI's circular of 6 Oct 2017 defines the size classes by RANK across every
 * listed company: the 100 largest by six-month average market value are large
 * cap, the next 150 mid cap, the rest small cap. AMFI computes that rank twice
 * a year and publishes it ("Average Market Capitalization of listed companies
 * during the six months ended …"). `marketCap.ts` uses round rupee thresholds
 * because it had 140 quotes to rank; this file uses the published rank itself,
 * so a holding's size class is AMFI's, not ours.
 *
 * The 250 large and mid cap rows keep their rank and exchange symbols, so a
 * line that carries a symbol and no ISIN still joins. The small-cap tail keeps
 * only its ISINs and NSE symbols: enough to tell a listed small cap from a
 * company the list does not carry at all (unlisted, or listed after it).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/amfiMarketCap.json");
const URL_OF = (period) => `https://www.amfiindia.com/spages/AverageMarketCapitalization${period}.xlsx`;
const MONTHS = { Jun: "06", Dec: "12" };

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

/** The half-years AMFI may have published by today, newest first. */
function candidatePeriods(today = new Date()) {
  const out = [];
  for (let y = today.getUTCFullYear(); y >= today.getUTCFullYear() - 1; y--) for (const m of ["Dec", "Jun"]) {
    const end = new Date(Date.UTC(y, m === "Dec" ? 11 : 5, m === "Dec" ? 31 : 30));
    if (end < today) out.push(`${m === "Dec" ? 31 : 30}${m}${y}`);
  }
  return out;
}

async function fetchList(period) {
  const r = await fetch(URL_OF(period), { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  // A missing file answers 200 with an HTML page on some AMFI paths: the bytes decide.
  return buf.subarray(0, 2).toString() === "PK" ? { period, buf, source: URL_OF(period) } : null;
}

async function load() {
  const file = arg("--file");
  if (file) {
    const m = /(\d{2})(Jun|Dec)(\d{4})/.exec(path.basename(file));
    if (!m) throw new Error(`cannot tell the half-year from ${file}; name it AverageMarketCapitalization<30Jun2026>.xlsx`);
    return { period: m[0], buf: fs.readFileSync(file), source: URL_OF(m[0]) };
  }
  const periods = arg("--period") ? [arg("--period")] : candidatePeriods();
  for (const p of periods) {
    const got = await fetchList(p);
    if (got) return got;
  }
  throw new Error(`AMFI served none of ${periods.join(", ")}`);
}

const { period, buf, source } = await load();
const m = /(\d{2})(Jun|Dec)(\d{4})/.exec(period);
const asOf = `${m[3]}-${MONTHS[m[2]]}-${m[1]}`;
const wb = XLSX.read(buf, { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });

// Columns found by HEADER TEXT, never by index (lib/table.mjs's rule).
const head = rows.findIndex((r) => r?.some((c) => /^ISIN$/i.test(String(c ?? "").trim())));
if (head < 0) throw new Error("no ISIN header in the AMFI list");
const h = rows[head].map((c) => String(c ?? "").trim());
const col = (re) => { const i = h.findIndex((c) => re.test(c)); if (i < 0) throw new Error(`no column ${re}`); return i; };
const cRank = col(/^Sr\.? ?No/i), cName = col(/^Company name/i), cIsin = col(/^ISIN$/i);
const cBse = col(/^BSE Symbol/i), cNse = col(/^NSE Symbol/i), cCat = col(/^Categori[sz]ation/i);
const cAvg = col(/^Average of All Exchanges/i);

const sym = (v) => { const s = String(v ?? "").trim(); return s && s !== "-" ? s : null; };
const large = [], mid = [], small = [], smallNse = [];
let total = 0, largeFloorCr = null, midFloorCr = null;
for (const r of rows.slice(head + 1)) {
  const isin = sym(r?.[cIsin]);
  if (!isin || !/^IN[A-Z0-9]{10}$/.test(isin)) continue;
  total++;
  const cat = String(r[cCat] ?? "").trim();
  const row = [isin, Number(r[cRank]), sym(r[cNse]), sym(r[cBse]), String(r[cName] ?? "").replace(/\s+/g, " ").trim()];
  // The smallest large and mid cap's average value: the floors a company
  // listed after the list is measured against (`holdingBenchmark.ts`).
  const avg = Number(r[cAvg]);
  if (/^Large/i.test(cat)) { large.push(row); largeFloorCr = Math.min(largeFloorCr ?? avg, avg); }
  else if (/^Mid/i.test(cat)) { mid.push(row); midFloorCr = Math.min(midFloorCr ?? avg, avg); }
  else { small.push(isin); if (row[2]) smallNse.push(row[2]); }
}
// SEBI's rule fixes the counts; a list that does not keep them is read wrong.
if (large.length !== 100 || mid.length !== 150) throw new Error(`expected 100 large and 150 mid cap rows, read ${large.length} and ${mid.length}`);

// The small-cap tail as two space-joined strings — what tells a listed small cap
// from a company AMFI does not list at all (unlisted, or listed after the list).
const out = { asOf, source, listed: total, largeFloorCr: Math.round(largeFloorCr), midFloorCr: Math.round(midFloorCr),
  large, mid, small: small.join(" "), smallNse: smallNse.join(" ") };
const text = `${JSON.stringify(out, null, 0).replace(/\],\[/g, "],\n[")}\n`;
if (process.argv.includes("--check")) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  console.log(now === text ? "amfiMarketCap.json is current" : "amfiMarketCap.json would change");
  process.exit(now === text ? 0 : 1);
}
fs.writeFileSync(OUT, text);
console.log(`AMFI list of ${asOf}: ${total} listed companies, ${large.length} large and ${mid.length} mid cap kept → ${path.relative(ROOT, OUT)}`);
