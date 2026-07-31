#!/usr/bin/env node
// Regenerate src/data/nseSymbols.json — securityKey → NSE trading symbol.
//
//   npm run build-symbols
//
// KEYED ON NAME, NOT ISIN. The earlier version of this script matched on ISIN,
// which is correct in general and useless here: not one of the 51 statements in
// this book prints an ISIN. Every security arrives as a name and nothing else,
// so the join has to be name → symbol, with NSE's own equity master as the
// authority for both sides.
//
// A WRONG SYMBOL IS FAR WORSE THAN A MISSING ONE. A missing symbol means a
// position shows no quote and is flagged not-live — visibly incomplete. A wrong
// symbol means it shows SOMEONE ELSE'S price, marked live, and nothing on screen
// says so. So the matching here is deliberately conservative:
//
//   1. exact       — normalized names identical.
//   2. securityKey — both sides through securityKeyOf(), which strips legal
//                    suffixes but preserves anything that distinguishes real
//                    instruments (series, class, tranche).
//   3. override    — a committed, hand-checked table for the rest.
//
// There is no fuzzy tier. Nothing is matched by edit distance, token overlap or
// "closest candidate": a name that matches two listings, or none, is reported
// unresolved and left out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { securityKeyOf } from "../shared/securityKey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = path.join(ROOT, "public", "audit");
const OUT = path.join(ROOT, "src", "data", "nseSymbols.json");
const CACHE = path.join(ROOT, "scripts", ".nse-equity-master.csv");

// HTTP/1.1: the archive host's HTTP/2 stream fails through an intermediary
// ("stream not closed cleanly"), and node's fetch offers no downgrade — so the
// fetch is done with curl, which does.
const NSE_CSV = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

/**
 * Hand-checked, and each one is a name difference the automatic tiers cannot
 * bridge — a renamed listing, or a symbol that contracts the company name.
 *
 * Every entry is verified against the master list at run time: an override that
 * names a symbol NSE does not list is reported unresolved rather than written,
 * because a typo here quotes another company's price under this one's name.
 */
export const OVERRIDES = {
  // Renamed listings — the statement still uses the former name.
  "zydus-lifesciences": "ZYDUSLIFE",           // formerly Cadila Healthcare
  "alivus-life-sciences": "ALIVUS",            // formerly Glenmark Life Sciences
  // Listings NSE symbolises as a contraction of the printed name.
  "life-insurance-corp-of-india": "LICI",
  "indian-energy-exchange": "IEX",
  "hdfc-asset-management": "HDFCAMC",
  "icici-bank": "ICICIBANK",
  "state-bank-of-india": "SBIN",
  "punjab-national-bank": "PNB",
  "bharat-heavy-electricals": "BHEL",
  "mahindra-and-mahindra": "M&M",
  "transport-corp-of-india": "TCI",
  "kovai-medical-center-and-hospital": "KOVAI",
  "indraprastha-medical": "INDRAMEDCO",
  "eih": "EIHOTEL",                            // "EIH Limited"; EIH Associated Hotels is a different listing
  "mps": "MPSLTD",
  "bls-international-services": "BLS",
  "can-fin-homes": "CANFINHOME",
  "karur-vysya-bank": "KARURVYSYA",
  "engineers-india": "ENGINERSIN",
  "jammu-and-kashmir-bank": "J&KBANK",
  "gujarat-ambuja-exports": "GAEL",
  "kaveri-seed": "KSCL",
  "ratnamani-metals-and-tubes": "RATNAMANI",
  "gmm-pfaudler": "GMMPFAUDLR",
  "the-anup-engineering": "ANUP",
  "mishra-dhatu-nigam": "MIDHANI",
  "hindustan-aeronautics": "HAL",
  "glaxosmithkline-pharmaceuticals": "GLAXO",
  "jindal-stainless": "JSL",
  "kalpataru-projects-international": "KPIL",
  "banco-products-india": "BANCOINDIA",        // listed as "Banco Products (I) Limited"
  "ingersollrand-india": "INGERRAND",          // listed as "Ingersoll Rand (India) Limited"
  "jamna-auto-ind": "JAMNAAUTO",               // listed as "Jamna Auto Industries Limited"
  "rural-electrification": "RECLTD",           // renamed REC Limited in 2023
  // Green Lantern prints "Jammu Kashmir Bank Ltd" with no ampersand, so it keys
  // apart from Goldstandard's "Jammu & Kashmir Bank Ltd." — same listing, and
  // both are mapped rather than one of them being quietly merged into the other.
  "jammu-kashmir-bank": "J&KBANK",
};

/** Rows the book carries that are not listed securities at all. */
const NOT_LISTED = [
  /^cash/i, /dividend\s*\/?\s*interest\s*receivable/i, /liquid\s*fund/i,
  /mutual\s*fund/i, /^axis\b.*fund/i,
];

const normalize = (s) => String(s ?? "")
  .toUpperCase()
  .replace(/&/g, " AND ")
  .replace(/\b(LIMITED|LTD|PVT|PRIVATE|CORPORATION|CORP|COMPANY|CO|INC|PLC|THE)\b/g, " ")
  .replace(/[^A-Z0-9]+/g, " ")
  .trim();

async function equityMaster() {
  if (process.env.GLOW_NSE_CSV) return fs.readFileSync(process.env.GLOW_NSE_CSV, "utf8");
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("curl", [
    "-sSL", "--http1.1", "--max-time", "60",
    "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "-H", "Accept: text/csv,*/*", NSE_CSV,
  ], { encoding: "utf8", maxBuffer: 32 << 20 });
  if (r.status === 0 && (r.stdout ?? "").includes("SYMBOL")) {
    // Cached so the mapping is reproducible without the network, and so a run
    // that cannot reach NSE says which master it used rather than silently
    // resolving fewer securities than the last one did.
    fs.writeFileSync(CACHE, r.stdout);
    return r.stdout;
  }
  if (fs.existsSync(CACHE)) {
    console.warn(`  ! NSE unreachable (${r.stderr?.trim() || `exit ${r.status}`}); using the cached master at scripts/.nse-equity-master.csv`);
    return fs.readFileSync(CACHE, "utf8");
  }
  throw new Error(`could not fetch the NSE equity master and no cache exists: ${r.stderr?.trim() || `exit ${r.status}`}`);
}

/** Every distinct security name in the audit archive. */
function securitiesFromArchive() {
  const out = new Map();
  if (!fs.existsSync(AUDIT_DIR)) return out;
  for (const dir of fs.readdirSync(AUDIT_DIR)) {
    const f = path.join(AUDIT_DIR, dir, "document.json");
    if (!fs.existsSync(f)) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
    for (const h of doc.holdings ?? []) {
      if (!h.security || !h.securityKey) continue;
      if (h.assetClass === "Cash") continue;
      out.set(h.securityKey, h.security);
    }
  }
  return out;
}

async function main() {
  const csv = await equityMaster();
  const rows = csv.split("\n").slice(1).map((l) => l.split(",").map((s) => s.trim()));

  const byName = new Map();     // normalized name -> Set<symbol>
  const byKey = new Map();      // securityKey     -> Set<symbol>
  const validSymbols = new Set();
  for (const parts of rows) {
    const [symbol, name, series] = parts;
    if (!symbol || !name) continue;
    if (series && series !== "EQ" && series !== "BE") continue;   // cash-market equity only
    validSymbols.add(symbol);
    const n = normalize(name);
    const k = securityKeyOf(name);
    if (n) (byName.get(n) ?? byName.set(n, new Set()).get(n)).add(symbol);
    if (k) (byKey.get(k) ?? byKey.set(k, new Set()).get(k)).add(symbol);
  }

  const securities = securitiesFromArchive();
  const map = {};
  const unresolved = [];
  const ambiguous = [];
  const notListed = [];
  const by = { exact: 0, "security-key": 0, override: 0 };

  for (const [key, name] of [...securities].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (NOT_LISTED.some((re) => re.test(name))) { notListed.push(name); continue; }

    if (OVERRIDES[key]) {
      if (!validSymbols.has(OVERRIDES[key])) {
        unresolved.push({ key, name, reason: `override "${OVERRIDES[key]}" is not on the NSE equity master` });
        continue;
      }
      map[key] = OVERRIDES[key];
      by.override++;
      continue;
    }

    let flagged = false;
    for (const [tier, index, probe] of [["exact", byName, normalize(name)], ["security-key", byKey, key]]) {
      const hit = index.get(probe);
      if (!hit) continue;
      if (hit.size > 1) { ambiguous.push({ key, name, candidates: [...hit] }); flagged = true; break; }
      map[key] = [...hit][0];
      by[tier]++;
      break;
    }
    if (!map[key] && !flagged) {
      unresolved.push({ key, name, reason: "no NSE listing matched by name or security key" });
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, Object.keys(map).sort(), 1) + "\n");

  const total = securities.size - notListed.length;
  console.log(`NSE symbols: ${Object.keys(map).length} of ${total} listed securities resolved.`);
  console.log(`  exact ${by.exact} · security-key ${by["security-key"]} · override ${by.override}`);
  if (notListed.length) console.log(`  ${notListed.length} row(s) are not listed securities (cash, receivables, fund units).`);
  if (ambiguous.length) {
    console.log(`  ${ambiguous.length} AMBIGUOUS — matched more than one listing, left out:`);
    for (const a of ambiguous) console.log(`    ${a.name} → ${a.candidates.join(", ")}`);
  }
  if (unresolved.length) {
    console.log(`  ${unresolved.length} UNRESOLVED — no symbol, so no quote; the statement mark stands:`);
    for (const u of unresolved) console.log(`    ${u.name}  (${u.key}) — ${u.reason}`);
  }
  console.log(`  src/data/nseSymbols.json`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
