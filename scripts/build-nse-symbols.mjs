#!/usr/bin/env node
// Regenerate src/data/nseSymbols.json — an ISIN → NSE trading-symbol map for the
// portfolio's holdings, used to fetch corporate announcements (which are keyed by
// ticker, not ISIN). Run this whenever the baked-in book changes:
//
//   node scripts/build-nse-symbols.mjs
//
// It pulls NSE's authoritative equity master list (ISIN ↔ SYMBOL) and keeps only
// the ISINs present in src/data/glowData.ts. Many positions in this book carry
// no ISIN at all and simply do not appear here — they keep their statement mark. ETF / mutual-fund ISINs (INF…) and
// anything not on the NSE cash list simply won't map — those holdings just won't
// show announcements.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NSE_CSV = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

const res = await fetch(NSE_CSV, { headers: { "User-Agent": "Mozilla/5.0", accept: "text/csv,*/*" } });
if (!res.ok) { console.error(`Failed to fetch NSE master list: ${res.status}`); process.exit(1); }
const csv = await res.text();

const isinToSym = {};
for (const line of csv.split("\n").slice(1)) {
  if (!line.trim()) continue;
  const parts = line.split(",").map((s) => s.trim());
  const sym = parts[0];
  const isin = parts.find((p) => /^IN[A-Z0-9]{10}$/.test(p) && p.length === 12);
  if (sym && isin && /^[A-Z0-9&-]+$/.test(sym)) isinToSym[isin] = sym;
}

const data = fs.readFileSync(path.join(ROOT, "src/data/glowData.ts"), "utf8");
const isins = [...new Set([...data.matchAll(/"isin":"([^"]+)"/g)].map((m) => m[1]))];

const map = {};
let unmapped = 0;
for (const isin of isins) { if (isinToSym[isin]) map[isin] = isinToSym[isin]; else unmapped++; }

fs.writeFileSync(path.join(ROOT, "src/data/nseSymbols.json"), JSON.stringify(map));
console.log(`NSE master: ${Object.keys(isinToSym).length} symbols`);
console.log(`Portfolio ISINs: ${isins.length} · mapped: ${Object.keys(map).length} · unmapped (ETFs/non-NSE): ${unmapped}`);
console.log("Wrote src/data/nseSymbols.json");
