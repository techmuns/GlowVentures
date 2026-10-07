#!/usr/bin/env node
// Regenerate src/data/nseSymbols.json — securityKey → NSE trading symbol.
//
//   npm run build-symbols
//
// ── ISIN FIRST, THEN NAME. AND THE ISIN TIER IS NEW ─────────────────────────
//
// This file used to open: "KEYED ON NAME, NOT ISIN … not one of the 51
// statements in this book prints an ISIN." That was TRUE when it was written and
// is FALSE now. The depository statements that arrived with `august-2026-d` and
// `-e` — seven CDSL demat accounts at Motilal Oswal, LKP's, and ICICI Bank's
// NSDL account — print an ISIN on every row. Measured on the current book: 69 of
// 214 distinct securities carry one.
//
// That is this repo's own recurring failure, for the FOURTH time (FRED, the RBI,
// the release calendar, and now this): a capability declared impossible against a
// premise that has since changed, and nobody re-measured. The cost here was
// visible on screen — AXIS BANK, ICICI BANK, SBI, INDUSIND BANK, FEDERAL BANK,
// KARUR VYSYA, CITY UNION, RBL, CROMPTON, KAYNES, ZAGGLE and PG ELECTROPLAST all
// sat unpriced, because the depository prints them as `AXIS BANK EQ`,
// `ICICI BANK-EQ`, `SBI - EQ`, `CITY UNION -EQ RE1/`, and no name tier bridges
// that. Their ISINs match the NSE master exactly.
//
// So the tiers are now:
//
//   0. ISIN        — an IDENTIFIER, not a spelling. NSE publishes it on every
//                    master, so this is an exact join and it goes first.
//   1. exact       — normalized names identical.
//   2. securityKey — both sides through securityKeyOf(), which strips legal
//                    suffixes but preserves anything that distinguishes real
//                    instruments (series, class, tranche).
//   3. override    — a committed, hand-checked table for the rest.
//
// A WRONG SYMBOL IS FAR WORSE THAN A MISSING ONE. A missing symbol means a
// position shows no quote and is flagged not-live — visibly incomplete. A wrong
// symbol means it shows SOMEONE ELSE'S price, marked live, and nothing on screen
// says so. So the matching stays deliberately conservative, and adding an
// identifier tier ABOVE the name tiers makes it stricter rather than looser:
// where both fire they are cross-checked, and a DISAGREEMENT is reported and the
// security left unresolved rather than either side winning silently. Measured on
// this book that check fires zero times — the ISIN and the name agree on every
// security where both resolve, which is what earns the tier its place.
//
// There is still no fuzzy tier. Nothing is matched by edit distance, token
// overlap or "closest candidate": a name that matches two listings, or none, is
// reported unresolved and left out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { securityKeyOf, stripDepositoryTail } from "../shared/securityKey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = path.join(ROOT, "public", "audit");
const OUT = path.join(ROOT, "src", "data", "nseSymbols.json");
// HTTP/1.1: the archive host's HTTP/2 stream fails through an intermediary
// ("stream not closed cleanly"), and node's fetch offers no downgrade — so the
// fetch is done with curl, which does.
//
// THREE MASTERS, BECAUSE NSE PUBLISHES THE UNIVERSE IN THREE FILES and a book
// that holds only mainboard equity is not this book. The SME board carries four
// of this family's holdings (EMA Partners, Grand Continent Hotels, Infinium
// Pharma, Parth Electricals) and the ETF list carries their two precious-metal
// ETFs; neither appears on `EQUITY_L.csv`, so before this they were indistinguishable
// from an unlisted company — reported "no NSE listing" about names NSE lists.
//
// Each declares its own column NAMES rather than positions: the three files
// disagree on both spelling and order (`ISIN NUMBER` with a leading space,
// `ISIN_NUMBER`, `ISINNumber`), and this repo's own rule for the statement PDFs
// is to match on header text so a layout change surfaces as "column not matched"
// instead of as wrong figures. The same rule earns its place here — the previous
// positional read (`const [symbol, name, series] = parts`) would have returned a
// different column, silently, the first time NSE inserted one.
const MASTERS = [
  {
    id: "mainboard",
    url: "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
    cache: ".nse-equity-master.csv",
    cols: { symbol: "SYMBOL", name: "NAME OF COMPANY", isin: "ISIN NUMBER", series: "SERIES" },
    // Cash-market equity only. SME and ETF rows carry their own series values and
    // are taken from their own files, so this filter stays exactly as strict.
    series: new Set(["EQ", "BE"]),
    // The name index is built from the mainboard alone, unchanged: the SME and
    // ETF names are matched by ISIN, which needs no normalisation to be right.
    names: true,
    encoding: "utf8",
  },
  {
    id: "sme",
    url: "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv",
    cache: ".nse-sme-master.csv",
    cols: { symbol: "SYMBOL", name: "NAME_OF_COMPANY", isin: "ISIN_NUMBER", series: "SERIES" },
    series: null,
    names: false,
    encoding: "utf8",
  },
  {
    id: "etf",
    url: "https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv",
    cache: ".nse-etf-master.csv",
    cols: { symbol: "Symbol", name: "SecurityName", isin: "ISINNumber", series: null },
    series: null,
    names: false,
    // NOT utf8 — this one carries an en dash in a fund name as a single 0x96
    // byte, which is cp1252. Read as utf8 it throws or mangles the row; the ISIN
    // and symbol columns are ASCII either way, so latin1 reads them intact.
    encoding: "latin1",
  },
];

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
  // HEG Limited renamed itself HEG Advanced Materials. NSE's own equity master
  // carries ONE such row — HEGAM, "HEG Advanced Materials Limited", series EQ,
  // ISIN INE545A01024, listed 10-MAY-1995 — which is HEG Limited's own listing
  // record under its new name. SVAN's appraisal still prints "HEG Ltd" and no
  // ISIN, so neither name tier reaches it and there is nothing to compare an
  // identifier against; the listing date and the ISIN on NSE's side are the
  // corroboration. Added on the run that first regenerated this map after the
  // rename (Stage 10di), which is where the symbol would otherwise have been
  // lost for a holding that had one the day before.
  "heg": "HEGAM",                              // renamed HEG Advanced Materials
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
  // NSE lists "Crompton Greaves Consumer ElectricalS Limited"; V.E.C's appraisal
  // prints the singular. One letter, and neither automatic tier bridges it.
  "crompton-greaves-consumer-electrical": "CROMPTON",
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

/**
 * One master list, fetched or served from its cache.
 *
 * A master that cannot be fetched AND has no cache is reported and skipped
 * rather than throwing: losing the SME list must not cost the 2,559 mainboard
 * listings. The mainboard is the one exception — with none of it there is no
 * mapping worth writing, and `main` says so.
 */
async function fetchMaster(m) {
  const cachePath = path.join(ROOT, "scripts", m.cache);
  const env = process.env[`GLOW_NSE_CSV_${m.id.toUpperCase()}`]
    ?? (m.id === "mainboard" ? process.env.GLOW_NSE_CSV : null);
  if (env) return { text: fs.readFileSync(env, m.encoding), from: "env" };
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("curl", [
    "-sSL", "--http1.1", "--max-time", "60",
    "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "-H", "Accept: text/csv,*/*", m.url,
  ], { encoding: m.encoding, maxBuffer: 32 << 20 });
  // Checked by CONTENT, not by exit status: this repo has already been bitten by
  // a source that answers 200 with the wrong body (the Pink Sheet\'s .XLSX, the
  // gate\'s login page for /api/*). The header row carrying the ISIN column is the
  // cheapest proof the real file arrived.
  if (r.status === 0 && (r.stdout ?? "").split("\n", 1)[0].includes(m.cols.isin)) {
    // Cached so the mapping is reproducible without the network, and so a run
    // that cannot reach NSE says which master it used rather than silently
    // resolving fewer securities than the last one did.
    fs.writeFileSync(cachePath, r.stdout, { encoding: m.encoding });
    return { text: r.stdout, from: "network" };
  }
  if (fs.existsSync(cachePath)) {
    console.warn(`  ! NSE ${m.id} unreachable (${r.stderr?.trim() || `exit ${r.status}`}); using scripts/${m.cache}`);
    return { text: fs.readFileSync(cachePath, m.encoding), from: "cache" };
  }
  return { text: null, from: "missing", error: r.stderr?.trim() || `exit ${r.status}` };
}

/** CSV → objects keyed by HEADER TEXT, trimmed both sides (see MASTERS). */
function rowsOf(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(",").map((c) => c.trim());
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/**
 * Every distinct security the archive carries, with the identifiers it carries.
 *
 * TWO PASSES, AND THE FAMILY'S OWN STATEMENT IS THE STRONGER TIER.
 *
 * Pass 1 is every holding on every statement issued to this family. Pass 2 is
 * what a fund DISCLOSED it holds — Buoyant's Portfolio Snap prints 40 companies
 * and a weight each — and it is FILL-ONLY: it adds a key pass 1 did not produce
 * and never touches one it did. That is `shared/sectors.mjs`' own rule (a lower
 * tier only ever FILLS AN EMPTY value and can never overrule a statement)
 * applied to a NAME, and why it matters is measured rather than feared: 9 of
 * those 40 companies are already in this book under the family's own spelling —
 * the fund prints `ICICI BANK LTD` where a depository prints `ICICI BANK EQ` and
 * a PMS appraisal `ICICI Bank Ltd.` — so letting the fund's spelling win would
 * re-name the security behind an existing resolution for no gain. Pass 1
 * therefore runs over EVERY document before pass 2 starts, so a fund's spelling
 * can never beat a holding that happens to sit in a later-sorted docKey.
 *
 * PASS 2 IS GATED ON THE DOCUMENT ALSO REPORTING A HOLDING OF THIS FAMILY'S,
 * which is `deriveFundDisclosures`' rule in `src/lib/ledgerModel.ts` — where it
 * is written down, and where the screen reads the same disclosures. It is what
 * keeps WhiteOak's scheme-portfolio filing out: 176 disclosed lines, no folio,
 * no holder, archived for look-through (§"a fund's own SEBI portfolio
 * disclosure — archived for look-through, worth nothing to the book"). A
 * disclosure about a fund this family does not hold is no exposure here, so
 * resolving symbols for it would put 150-odd companies — NCDs, REITs and InvITs
 * among them — into a map whose whole claim is that it is THIS book's
 * securities. Measured: ungated the pass adds 183 keys, gated it adds 31.
 *
 * A DISCLOSED-ONLY ROW IS MARKED, because what a reader can do about it is
 * different. No statement of the family's reports it, so "ask the issuer for an
 * ISIN" is advice that cannot work: the only document is the fund's own
 * disclosure, which prints a NAME and a WEIGHT and no identifier at all.
 * `docs/SECURITY-IDENTIFIERS.md` names them apart for that reason.
 *
 * The ISIN rule is pass 1's and is unchanged: collected per securityKey and
 * kept ONLY where every statement that prints one agrees. Two different ISINs
 * under one key means the key has merged two instruments — a real defect in
 * `securityKeyOf`, not something to resolve a symbol from — so the conflict is
 * recorded and the ISIN dropped for that key rather than one issuer's winning
 * by iteration order. A disclosed line carries no ISIN on this corpus; the same
 * rule is applied to it anyway, because a reader of the next drop should not
 * have to find out which pass the rule lived in.
 *
 * THE RING-FENCE IS NOT THIS BUILDER'S CONCERN, and that was checked rather
 * than assumed: `polycab-india` has resolved `POLYCAB` in `nseSymbols.json`
 * since the first pass existed, because the fence is a decision about which
 * figures a DASHBOARD sums and is applied at the book layer
 * (`RINGFENCED_SECURITY_KEYS`) and on every screen. Filtering it out of pass 2
 * alone would be inconsistent with pass 1 and a change nobody asked for.
 */
function securitiesFromArchive() {
  const out = new Map();          // securityKey -> { name, isin, isinConflict, disclosedBy }
  if (!fs.existsSync(AUDIT_DIR)) return out;

  const docs = [];
  for (const dir of fs.readdirSync(AUDIT_DIR).sort()) {
    const f = path.join(AUDIT_DIR, dir, "document.json");
    if (!fs.existsSync(f)) continue;
    try { docs.push([dir, JSON.parse(fs.readFileSync(f, "utf8"))]); } catch { /* unreadable */ }
  }

  /** One ISIN rule for both passes — see the note above. */
  const withIsin = (e, raw) => {
    const isin = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (!/^IN[EF][0-9A-Z]{9}$/.test(isin)) return e;
    if (e.isin && e.isin !== isin) e.isinConflict = [e.isin, isin].sort().join(" vs ");
    else e.isin = isin;
    return e;
  };

  // PASS 1 — what the family's own statements report.
  for (const [, doc] of docs) {
    for (const h of doc.holdings ?? []) {
      if (!h.security || !h.securityKey) continue;
      if (h.assetClass === "Cash") continue;
      const e = out.get(h.securityKey)
        ?? { name: h.security, isin: null, isinConflict: null, disclosedBy: null };
      out.set(h.securityKey, withIsin(e, h.isin));
    }
  }

  // PASS 2 — what a fund the family HOLDS disclosed it holds. Fill-only.
  for (const [docKey, doc] of docs) {
    if (!(doc.schemeHoldings ?? []).length) continue;
    if (!(doc.holdings ?? []).some((h) => h.securityKey)) continue;   // the gate
    for (const h of doc.schemeHoldings) {
      if (typeof h.security !== "string" || !h.security.trim()) continue;
      const key = securityKeyOf(h.security);
      if (!key || key === "unknown") continue;
      const have = out.get(key);
      if (have && !have.disclosedBy) continue;      // a statement's own — untouched
      out.set(key, withIsin(
        have ?? { name: h.security, isin: null, isinConflict: null, disclosedBy: docKey },
        h.isin,
      ));
    }
  }
  return out;
}

async function main() {
  const byName = new Map();     // normalized name -> Set<symbol>
  const byKey = new Map();      // securityKey     -> Set<symbol>
  const byIsin = new Map();     // ISIN            -> { symbol, board }
  const validSymbols = new Set();
  const loaded = [];

  for (const m of MASTERS) {
    const { text, from, error } = await fetchMaster(m);
    if (!text) { loaded.push(`${m.id}: UNAVAILABLE (${error})`); continue; }
    let n = 0;
    for (const r of rowsOf(text)) {
      const symbol = r[m.cols.symbol];
      const name = r[m.cols.name];
      const isin = (r[m.cols.isin] ?? "").toUpperCase();
      if (!symbol || !name) continue;
      if (m.series && m.cols.series && r[m.cols.series] && !m.series.has(r[m.cols.series])) continue;
      validSymbols.add(symbol);
      n++;
      // AN ISIN IS AN IDENTIFIER: first writer wins across boards, and a second
      // board claiming the same ISIN is a contradiction in NSE's own files
      // rather than an ambiguity in ours — reported, never silently overwritten.
      if (/^IN[EF][0-9A-Z]{9}$/.test(isin) && !byIsin.has(isin)) byIsin.set(isin, { symbol, board: m.id });
      if (!m.names) continue;
      const nm = normalize(name);
      const k = securityKeyOf(name);
      if (nm) (byName.get(nm) ?? byName.set(nm, new Set()).get(nm)).add(symbol);
      if (k) (byKey.get(k) ?? byKey.set(k, new Set()).get(k)).add(symbol);
    }
    loaded.push(`${m.id}: ${n} listing(s) from ${from}`);
  }
  if (!byName.size) {
    throw new Error("the NSE MAINBOARD master could not be read and no cache exists — "
      + "refusing to write a symbol map that would silently resolve almost nothing");
  }

  const securities = securitiesFromArchive();
  const map = {};
  const unresolved = [];
  const ambiguous = [];
  const notListed = [];
  const contradictions = [];
  const isinConflicts = [];
  const by = { isin: 0, exact: 0, "security-key": 0, override: 0 };

  for (const [key, rec] of [...securities].sort((a, b) => a[0].localeCompare(b[0]))) {
    const name = rec.name;
    if (rec.isinConflict) isinConflicts.push({ key, name, conflict: rec.isinConflict });
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

    // What each tier independently says this security is. The ISIN is an
    // identifier and the names are spellings, so where both answer they are
    // COMPARED rather than ranked: agreement is the evidence the tier is safe,
    // and a disagreement means one of them is about a different company — which
    // is the single worst outcome here, so neither is used.
    const viaIsin = rec.isin ? byIsin.get(rec.isin) ?? null : null;
    let viaName = null, flagged = false;
    for (const [tier, index, probe] of [["exact", byName, normalize(name)], ["security-key", byKey, key]]) {
      const hit = index.get(probe);
      if (!hit) continue;
      if (hit.size > 1) { ambiguous.push({ key, name, candidates: [...hit] }); flagged = true; break; }
      viaName = { symbol: [...hit][0], tier };
      break;
    }
    if (viaIsin && viaName && viaIsin.symbol !== viaName.symbol) {
      contradictions.push({ key, name, isin: rec.isin, byIsin: viaIsin.symbol, byName: viaName.symbol });
      continue;
    }
    if (viaIsin) { map[key] = viaIsin.symbol; by.isin++; continue; }
    if (viaName) { map[key] = viaName.symbol; by[viaName.tier]++; continue; }
    if (!flagged) {
      unresolved.push({
        key, name,
        reason: rec.isin
          ? `ISIN ${rec.isin} is on no NSE master (mainboard, SME or ETF), and no listing matched by name`
          : "no ISIN on any statement, and no NSE listing matched by name or security key",
      });
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, Object.keys(map).sort(), 1) + "\n");

  /**
   * WHAT EACH API NEEDS, PER SECURITY — docs/SECURITY-IDENTIFIERS.md.
   *
   * Every live endpoint this dashboard calls is keyed on the NSE TRADING SYMBOL
   * and nothing else: `quotes` posts `ticker_symbol`, `insider` and `research`
   * post `ticker`, `/financials` wants `<SYMBOL>.NS`, `prices` takes `symbol`.
   * NONE of them accepts an ISIN or a name. So "can this security reach the
   * APIs?" reduces to "did a symbol resolve?", and this table is that question
   * answered per security, with the identifier that answered it and — where it
   * did not — the reason, which is the thing a reader can actually act on.
   */
  const REPORT = path.join(ROOT, "docs", "SECURITY-IDENTIFIERS.md");
  const symbolFor = new Map(Object.entries(map));
  const rows = [...securities].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const L = [];
  L.push("# Security identifiers — what each API needs, and what this book has");
  L.push("");
  L.push("Generated by `npm run build-symbols` — **do not edit by hand**.");
  L.push("");
  L.push("Every live endpoint is keyed on the **NSE trading symbol**. None takes an ISIN");
  L.push("or a name, so a security reaches the APIs if and only if a symbol resolved:");
  L.push("");
  L.push("| Endpoint | Sends | Needs |");
  L.push("| --- | --- | --- |");
  L.push("| `/api/quotes` | `ticker_symbol`, `country` | NSE symbol |");
  L.push("| `/api/prices` | `symbol` (+ `.NS` suffix) | NSE symbol |");
  L.push("| `/api/insider` | `ticker`, `country` | NSE symbol |");
  L.push("| `/api/announcements` | `symbol` | NSE symbol |");
  L.push("| `/api/news` | holding name + symbol | NSE symbol |");
  L.push("| `/api/research` — street estimates, concalls, filings | `ticker` | NSE symbol |");
  L.push("| `/api/research` — `/financials` | `<SYMBOL>.NS` | NSE symbol |");
  L.push("| `/api/ratios` | `tickers` | NSE symbol |");
  L.push("");
  const notSec = rows.filter(([, r]) => NOT_LISTED.some((re) => re.test(r.name)));
  const live = rows.filter(([k, r]) => symbolFor.has(k) && !NOT_LISTED.some((re) => re.test(r.name)));
  const dark = rows.filter(([k, r]) => !symbolFor.has(k) && !NOT_LISTED.some((re) => re.test(r.name)));
  // The three add to the whole, stated so, because a total that does not tie to
  // its own parts is the failure this book keeps writing rules about.
  L.push(`**${live.length} reachable · ${dark.length} not reachable · ${notSec.length} not securities at all**`);
  L.push(`(cash and receivables) — ${live.length} + ${dark.length} + ${notSec.length} = ${rows.length}, every distinct`);
  L.push("security the archive carries.");
  L.push("");
  // WHERE A ROW COMES FROM IS NOT CHROME: it decides what a reader can do about
  // one that did not resolve. A disclosed-only company is on no statement of
  // this family's — the only document is the fund's own Portfolio Snap, which
  // prints a NAME and a WEIGHT and no identifier — so there is no issuer to ask
  // for an ISIN. It is carried so the AIF & PMS movers can price the companies
  // INSIDE a fund rather than the wrapper's own move.
  const disclosed = rows.filter(([, r]) => r.disclosedBy);
  const from = (r) => (r.disclosedBy ? "fund disclosure" : "statement");
  L.push(`Of those, **${disclosed.length} are companies no statement of this family's reports** —`);
  L.push("lines a fund they hold DISCLOSED, carried so the AIF & PMS movers can price");
  L.push("what is inside a mandate or a folio. No quantity, cost or mark here is theirs.");
  L.push("");
  L.push("## Reachable — a symbol resolved");
  L.push("");
  L.push("| Security | NSE symbol | ISIN printed | Resolved by | From |");
  L.push("| --- | --- | --- | --- | --- |");
  for (const [k, r] of live) {
    const how = OVERRIDES[k] ? "override"
      : r.isin && byIsin.get(r.isin)?.symbol === symbolFor.get(k) ? `ISIN (${byIsin.get(r.isin).board})`
      : "name";
    L.push(`| ${stripDepositoryTail(r.name)} | \`${symbolFor.get(k)}\` | ${r.isin ? `\`${r.isin}\`` : "—"} | ${how} | ${from(r)} |`);
  }
  L.push("");
  L.push("## Not reachable — no symbol, so no API can answer for it");
  L.push("");
  L.push("| Security | ISIN printed | From | Why not, and what would fix it |");
  L.push("| --- | --- | --- | --- |");
  // A FUND IS NOT A COMPANY, and telling a reader to "get its ISIN" is advice
  // that cannot work: an AIF/PMS folio is one purchase of a manager's portfolio,
  // and NSE lists no equity symbol for it however it is identified. Naming that
  // apart from a genuinely missing identifier is the whole point of the column —
  // one says give up, the other says exactly what to ask the issuer for.
  const FUNDY = /\b(fund|scheme|aif|pms|portfolio|strategy|trust|series|class|growth|liquid|flexi|advantage)\b/i;
  for (const [, r] of dark) {
    const isFund = /^INF/.test(r.isin ?? "") || FUNDY.test(r.name);
    const why = isFund
      ? "**A fund, not a company.** An AIF / PMS / mutual-fund unit is one purchase of a manager's portfolio. NSE lists no equity symbol for it, so no research endpoint can ever answer — this is a permanent absence, not a missing identifier. Look through to the underlying only if the manager publishes a scheme portfolio."
      // A DISCLOSED-ONLY ROW HAS NO ISSUER TO ASK, so the statement advice below
      // would send a reader after a document that does not exist. The fund's
      // disclosure is a name and a weight; the only fixes are NSE's own spelling
      // matching, or a hand-checked override. There is still no fuzzy tier.
      : r.disclosedBy
        ? "**Disclosed by a fund, and the name does not match an NSE listing.** No statement of this family's reports it, so there is no issuer to ask for an ISIN — the disclosure prints a name and a weight and nothing else. Fix: a hand-checked `OVERRIDES` entry, or a re-export from the manager whose spelling matches the exchange's."
      : !r.isin
        ? "**No ISIN printed and no NSE name match.** This is a company, so a symbol should exist. Fix: ask the issuer for a statement carrying the ISIN, or add a hand-checked `OVERRIDES` entry."
        : `**ISIN \`${r.isin}\` is on no NSE master** (mainboard, SME or ETF). Unlisted, delisted, or a warrant / preference line rather than the equity. Fix: nothing until it lists.`;
    L.push(`| ${stripDepositoryTail(r.name)} | ${r.isin ? `\`${r.isin}\`` : "—"} | ${from(r)} | ${why} |`);
  }
  L.push("");
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, L.join("\n"));

  const total = securities.size - notListed.length;
  for (const l of loaded) console.log(`  master ${l}`);
  console.log(`NSE symbols: ${Object.keys(map).length} of ${total} listed securities resolved.`);
  console.log(`  ISIN ${by.isin} · exact ${by.exact} · security-key ${by["security-key"]} · override ${by.override}`);
  // PRINTED EVEN AT ZERO, for the reason the contradiction count below is: a
  // pass that silently stopped contributing reads exactly like one that never
  // ran, and this one is the whole reason a company only a fund discloses can
  // reach a quote at all.
  const disclosedOnly = [...securities].filter(([, r]) => r.disclosedBy);
  const disclosedResolved = disclosedOnly.filter(([k]) => map[k]).length;
  console.log(`  ${disclosedOnly.length} disclosed-only compan${disclosedOnly.length === 1 ? "y" : "ies"} `
    + `(no statement of this family's reports them) — ${disclosedResolved} resolved, `
    + `${disclosedOnly.length - disclosedResolved} named in the report.`);
  for (const [k, r] of disclosedOnly) {
    if (!map[k]) console.log(`    unresolved: ${r.name}  (${k}) — disclosed by ${r.disclosedBy}`);
  }
  // THE CROSS-CHECK IS PRINTED EVEN WHEN IT IS ZERO. A safety check that only
  // speaks up when it fires is indistinguishable, on a clean run, from one that
  // was quietly removed — and this one is the whole argument for trusting the
  // ISIN tier above the name tiers.
  console.log(`  ${contradictions.length} ISIN/name contradiction(s) — where these disagree NEITHER symbol is used.`);
  for (const c of contradictions) {
    console.log(`    ${c.name}: ISIN ${c.isin} says ${c.byIsin}, the name says ${c.byName} — left unresolved`);
  }
  if (isinConflicts.length) {
    console.log(`  ${isinConflicts.length} securityKey(s) carry TWO different ISINs — the key has merged two instruments:`);
    for (const c of isinConflicts) console.log(`    ${c.name} (${c.key}) — ${c.conflict}`);
  }
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
