/**
 * ── ONE SECTOR SOURCE FOR EVERY COMPANY: screener.in (Stage 10md) ──────────
 *
 *   "We need to make sure every single holdings' sector classification is
 *    correct, [Unclassified] needs to be as low as possible. Make sure to use
 *    same sector classification for all the holdings, for eg. if you're using
 *    sector classification based on screener.in then every holding should be
 *    based on it only"                                   — the family, 6 Nov 2026
 *
 * Until this stage a company's sector came from whichever of three sources
 * answered first: the family's own statement (each platform's private
 * taxonomy — "Heavy Electrical Equip", "BASIC MATERIALS", "Consulting
 * Services"), then the AMFI industry a fund filed, then screener.in for the
 * rest. Measured on 6 Nov: 90 companies by a statement, 327 by a filing, 57 by
 * screener and 174 issuers unplaced — and Engineers India read Information
 * Technology because one PMS calls it "Consulting Services".
 *
 * Now EVERY company is asked of screener.in, and its answer wins wherever it
 * has one. screener publishes NSE's own four-level industry classification
 * (Broad Sector › Sector › Broad Industry › Industry); its BROAD INDUSTRY level
 * is the AMFI industry list every fund's monthly portfolio files under ("Capital
 * Markets", "Finance", "Realty", "Pharmaceuticals & Biotechnology"). So the GICS
 * sector is resolved off THAT level, through `shared/sectors.mjs` — the same
 * table entry a fund's filing of the same industry goes through. A company
 * screener has no page for (an unlisted one) is placed by its funds' filing of
 * that same vocabulary, and only then by a statement.
 *
 * ── WHAT IS ASKED ABOUT ─────────────────────────────────────────────────────
 *
 * `scripts/lib/sectorUniverse.ts` — `companyExposure` itself, over every share
 * the statements and the depository report and every EQUITY line the funds
 * disclose. Debt-only issuers are not companies the sector tables sort.
 *
 * ── HOW A COMPANY REACHES ITS PAGE, STRONGEST JOIN FIRST ────────────────────
 *
 *   1. the symbol the app already resolves (statement → `nseSymbols.json`);
 *   2. an ISIN it is reached through, exact, in NSE's mainboard or SME master;
 *   3. its ISIN's issuer code (the 7 characters before the security type), where
 *      NSE lists exactly ONE symbol under it;
 *   4. its name, normalised through `securityKeyOf`, equal to exactly ONE
 *      master name — the join key everything else in this book uses;
 *   5. `LISTED_AS` below — a reviewed table for the handful the identifiers
 *      cannot bridge (a renamed company, a BSE-only listing, a listed trust).
 *
 * ── AND EVERY PAGE PROVES IT IS THE COMPANY ASKED FOR ───────────────────────
 *
 * A page is accepted only where it echoes the identifier asked for — `NSE:
 * <symbol>`, or the BSE scrip code in its own exchange link — or, for a page
 * with neither, where its company name agrees under `securityKeyOf`. Stage 10e
 * is why: moneycontrol's resolver returned a different company on 4 of 15.
 *
 * Output: `src/data/screenerSectors.json` (by NSE symbol, or BSE scrip code
 * where NSE lists none), `src/data/screenerKeys.json` (company key → that id,
 * for every company the app's own symbol tier does not reach) and
 * `docs/SCREENER-SECTORS.md`. Generated, never hand-edited.
 *
 *   npm run build-sectors              every page fetched again
 *   REUSE=1 npm run build-sectors      pages already in the store are kept
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { resolveSector, UNCLASSIFIED } from "../shared/sectors.mjs";
import { securityKeyOf, stripDepositoryTail } from "../shared/securityKey.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "src/data/screenerSectors.json");
const KEYS_OUT = path.join(ROOT, "src/data/screenerKeys.json");
const DOC = path.join(ROOT, "docs/SCREENER-SECTORS.md");
const UA = "Mozilla/5.0 (compatible; GlowVenturesSectorBuild/1.0)";
const DELAY_MS = Number(process.env.SCREENER_DELAY_MS ?? 900);
const REUSE = process.env.REUSE === "1";

/**
 * THE COMPANIES NO IDENTIFIER JOINS, each checked by hand against the page it
 * names (6 Nov 2026). The page must still prove itself at run time — its own
 * symbol or scrip code echoed back — so a typo here is refused, never stored.
 *
 * Not listed, on purpose: HEG Graphite (the demerged graphite business, not
 * HEG Advanced Materials, its parent), GSPL India Transco and Talwandi Sabo
 * Power (demerged, unlisted) and Gujarat Gas (merged; its page keeps no
 * classification). They keep their funds' filing where it prints one.
 */
const LISTED_AS = {
  "national-stock-exchange-of-india": "544937",     // its BSE listing; NSE does not list itself
  "yash-highvoltage": "544310",                     // BSE SME
  "sotefin-bharat": "544832",                       // BSE SME
  "poojaa-precision-engineering": "544844",         // BSE SME, "Poojaa Precision Engg. Ltd"
  "credit-access-grameen": "CREDITACC",             // NSE prints "CreditAccess Grameen"
  "punjab-chem-and-crop-prot-l": "PUNJABCHEM",      // the statement clips the name
  "affle-india": "AFFLE",                           // renamed Affle 3i
  "gujarat-gas": "GUJRATGAS",                       // screener keeps the merged company's page
  "manali-petrochemical": "MANALIPETC",
  "chambal-fertilisers-and-chemicals": "CHAMBLFERT", // NSE spells it "Fertilizers"
  "sasken-communication-technologies": "SASKEN",    // renamed Sasken Technologies
  "red-tape": "REDTAPE",
  "ltimindtree": "LTM",                             // renamed LTM Limited, ISIN INE214T01019 unchanged
  // Listed trusts, which NSE's equity masters do not carry.
  "embassy-office-parks-reit": "EMBASSY",
  "mindspace-business-parks-reit": "MINDSPACE",
  "brookfield-india-real-estate-trust": "BIRET",
  "nexus-select-trust": "NXST",
  "indigrid-infrastructure-trust": "INDIGRID",
  "powergrid-infrastructure-investment-trust": "PGINVIT",
  "irb-invit-fund": "IRBINVIT",
  "indus-infra-trust": "INDUSINVIT",
  "raajmarg-infra-investment-trust": "RIIT",
  "altius-telecom-infrastructure-trust": "543225",  // BSE only
};

// ── NSE's own masters (cached beside `build-symbols`' copies, gitignored) ───
const MASTERS = [
  { url: "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", cache: "scripts/.nse-equity-master.csv",
    cols: { symbol: "SYMBOL", name: "NAME OF COMPANY", isin: "ISIN NUMBER" } },
  { url: "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv", cache: "scripts/.nse-sme-master.csv",
    cols: { symbol: "SYMBOL", name: "NAME_OF_COMPANY", isin: "ISIN_NUMBER" } },
];
async function masterRows() {
  const out = [];
  for (const m of MASTERS) {
    const file = path.join(ROOT, m.cache);
    let text = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (!text) {
      const res = await fetch(m.url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`${m.url} answered ${res.status}`);
      text = await res.text();
      writeFileSync(file, text);
    }
    // By HEADER TEXT, never column index (`lib/table.mjs`'s rule).
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(",").map((c) => c.trim());
    const at = (k) => { const i = cols.indexOf(m.cols[k]); if (i < 0) throw new Error(`${m.cache}: no column ${m.cols[k]}`); return i; };
    const [s, n, i] = [at("symbol"), at("name"), at("isin")];
    for (const l of lines) {
      const c = l.split(",").map((x) => x.trim());
      if (c[s] && /^IN[EF][A-Z0-9]{9}$/.test(c[i])) out.push({ symbol: c[s], name: c[n], isin: c[i] });
    }
  }
  return out;
}

// ── The universe, struck by the app's own code ──────────────────────────────
async function universe() {
  const dir = mkdtempSync(path.join(tmpdir(), "glow-sectors-"));
  try {
    const outfile = path.join(dir, "universe.mjs");
    await build({
      entryPoints: [path.join(ROOT, "scripts/lib/sectorUniverse.ts")], bundle: true, platform: "node",
      format: "esm", outfile, alias: { "@": path.join(ROOT, "src") }, logLevel: "error",
    });
    const { sectorUniverse } = await import(pathToFileURL(outfile).href);
    const index = JSON.parse(readFileSync(path.join(ROOT, "public/lookthrough/index.json"), "utf8"));
    const codes = [...new Set(Object.values(index.schemes ?? {}).map((s) => s.schemecode))];
    const portfolios = Object.fromEntries(codes.map((c) => [c, JSON.parse(readFileSync(path.join(ROOT, `public/lookthrough/${c}.json`), "utf8"))]));
    return await sectorUniverse({ index, portfolios });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const decode = (s) => String(s)
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, " ").replace(/ /g, " ").replace(/\s+/g, " ").trim();
/** A name as this book joins on it, with the company-form suffix dropped. */
const nameKey = (s) => securityKeyOf(stripDepositoryTail(String(s).replace(/\*+/g, ""))).replace(/-(ltd|limited)$/, "");

/**
 * THE CLASSIFICATION BREADCRUMB, READ BY EACH ANCHOR'S OWN `title` and never
 * by position — a company carrying three levels instead of four would shift
 * every label one place up and each would still look like a sector.
 */
function classification(html) {
  const out = {};
  const re = /<a\s+href="\/market\/([A-Z0-9/]+)\/"[^>]*?title="([^"]+)"\s*>\s*([^<]+?)\s*<\/a>/gs;
  for (const m of html.matchAll(re)) {
    const key = { "Broad Sector": "broad", "Sector": "sector", "Broad Industry": "broadIndustry", "Industry": "industry" }[m[2]];
    if (key && !out[key]) out[key] = { code: m[1], label: decode(m[3]) };
  }
  return out;
}
const titleOf = (h) => decode(/<title>\s*([^<|]+?)\s*(?:share price|\||<)/i.exec(h)?.[1] ?? "?");
/** Decoded first, then matched — `NSE: J&amp;KBANK` matched raw stops at `J&`. */
const echoedSymbol = (html) => /NSE\s*[:/]\s*([A-Z0-9&\-]+)/.exec(decode(html))?.[1] ?? null;
/** The BSE scrip code in the page's own exchange link. */
const echoedScrip = (html) => /bseindia\.com\/stock-share-price\/[^/"]+\/[^/"]+\/(\d{6})\//.exec(html)?.[1] ?? null;
function nameAgrees(html, name) {
  const a = nameKey(titleOf(html)), b = nameKey(name);
  return !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchOne(id, name) {
  const url = `https://www.screener.in/company/${encodeURIComponent(id)}/`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return { skip: "screener has no page for this id" };
      if (res.status === 429) { await sleep(15_000); continue; }
      if (!res.ok) { await sleep(2500); continue; }
      const html = await res.text();
      const isScrip = /^\d{6}$/.test(id);
      // REFUSED RATHER THAN GUESSED: a page that is not demonstrably the
      // company asked about might be another, with a perfectly correct table.
      const echoed = isScrip ? echoedScrip(html) : echoedSymbol(html);
      let via;
      if (echoed === id) via = isScrip ? "bse-code" : "nse-symbol";
      else if (echoed && !isScrip) return { skip: `the page names NSE: ${echoed}, not ${id}` };
      else if (nameAgrees(html, name)) via = "name";
      else return { skip: `the page is "${titleOf(html)}" and echoes no ${isScrip ? "scrip code" : "symbol"} ${id}` };
      const c = classification(html);
      if (!c.sector) return { skip: "the page carries no classification" };
      return { ok: c, via, title: titleOf(html) };
    } catch (e) { if (attempt === 2) return { skip: `fetch failed — ${e.message}` }; await sleep(2500); }
  }
  return { skip: "screener did not answer" };
}

/**
 * GICS FROM THE BROAD INDUSTRY — the level a fund's filing shares — and from
 * the Sector level only where the committed table carries no entry for it.
 */
function gicsOf(c) {
  for (const [level, v] of [["broadIndustry", c.broadIndustry], ["sector", c.sector]]) {
    const hit = v ? resolveSector(v.label) : null;
    if (hit?.matchedBy) return { gics: hit.sector, level };
  }
  return { gics: UNCLASSIFIED, level: null };
}

// ── Run ─────────────────────────────────────────────────────────────────────
const masters = await masterRows();
const byIsin = new Map(masters.map((m) => [m.isin, m]));
const byIssuer = new Map();
for (const m of masters) { const k = m.isin.slice(0, 7); (byIssuer.get(k) ?? byIssuer.set(k, []).get(k)).push(m); }
const byName = new Map();
for (const m of masters) { const k = nameKey(m.name); (byName.get(k) ?? byName.set(k, []).get(k)).push(m); }
const unique = (ms) => { const s = new Set(ms.map((m) => m.symbol)); return s.size === 1 ? [...s][0] : null; };

const companies = (await universe()).sort((a, b) => b.value - a.value);
const joins = [];
for (const c of companies) {
  let id = null, joinedBy = null;
  if (c.symbol) { id = c.symbol; joinedBy = "app-symbol"; }
  if (!id) for (const i of c.isins) { const m = byIsin.get(i); if (m) { id = m.symbol; joinedBy = "isin"; break; } }
  if (!id) { const s = unique(c.isins.flatMap((i) => byIssuer.get(i.slice(0, 7)) ?? [])); if (s) { id = s; joinedBy = "issuer-code"; } }
  if (!id) { const s = unique(byName.get(nameKey(c.name)) ?? []); if (s) { id = s; joinedBy = "name"; } }
  if (!id && LISTED_AS[c.key]) { id = LISTED_AS[c.key]; joinedBy = "listed-as"; }
  joins.push({ ...c, id, joinedBy });
}
const ids = [...new Map(joins.filter((j) => j.id).map((j) => [j.id, j])).values()];
console.log(`${companies.length} companies; ${ids.length} distinct listings to ask screener.in about; ${joins.filter((j) => !j.id).length} with none\n`);

const prior = REUSE && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const store = {}, skipped = [], unmapped = new Map();
let n = 0;
for (const j of ids) {
  n += 1;
  if (prior[j.id]?.screenerBroadIndustry !== undefined) {
    // The page is kept; its GICS is re-derived, so a map change lands without a refetch.
    const p = prior[j.id];
    const { gics, level } = gicsOf({ broadIndustry: p.screenerBroadIndustry ? { label: p.screenerBroadIndustry } : null, sector: { label: p.screenerSector } });
    if (!level) unmapped.set(p.screenerBroadIndustry ?? p.screenerSector, j.id);
    store[j.id] = { ...p, gics, gicsFrom: level };
    continue;
  }
  const r = await fetchOne(j.id, j.name);
  if (r.skip) { skipped.push({ ...j, why: r.skip }); console.log(`  ${String(n).padStart(3)} ${j.id.padEnd(14)} SKIP  ${r.skip}`); await sleep(DELAY_MS); continue; }
  const { gics, level } = gicsOf(r.ok);
  if (!level) unmapped.set(r.ok.broadIndustry?.label ?? r.ok.sector.label, j.id);
  store[j.id] = {
    gics,
    gicsFrom: level,
    screenerBroadSector: r.ok.broad?.label ?? null,
    screenerSector: r.ok.sector.label,
    screenerSectorCode: r.ok.sector.code,
    screenerBroadIndustry: r.ok.broadIndustry?.label ?? null,
    screenerIndustry: r.ok.industry?.label ?? r.ok.broadIndustry?.label ?? null,
    joinedBy: r.via,
    page: r.title,
  };
  console.log(`  ${String(n).padStart(3)} ${j.id.padEnd(14)} ${gics.padEnd(24)} ← ${r.ok.broadIndustry?.label ?? r.ok.sector.label}`);
  await sleep(DELAY_MS);
}

// SORTED, so both files regenerate byte-identically when nothing moved.
const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
writeFileSync(OUT, JSON.stringify(sorted(store), null, 2) + "\n");
const keyMap = {};
// Every listing joined, a page that gave no sector included — so the app can
// say "screener gives no sector for it" rather than "nothing keys the lookup".
for (const j of joins) if (j.id && j.joinedBy !== "app-symbol") keyMap[j.key] = j.id;
writeFileSync(KEYS_OUT, JSON.stringify(sorted(keyMap), null, 2) + "\n");

const cr = (v) => `₹${(v / 1e7).toFixed(2)} Cr`;
const placed = joins.filter((j) => j.id && store[j.id] && store[j.id].gics !== UNCLASSIFIED);
const notPlaced = joins.filter((j) => !placed.includes(j));
const tally = {};
for (const j of placed) tally[j.joinedBy] = (tally[j.joinedBy] ?? 0) + 1;
const byJoin = Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · ");
console.log(`\nplaced ${placed.length} of ${joins.length} (${byJoin}); ${skipped.length} pages refused or unanswered`);
if (unmapped.size) {
  console.log("SCREENER LABELS THE COMMITTED MAP DOES NOT CARRY — add them to shared/sectors.mjs:");
  for (const [label, id] of unmapped) console.log(`   ${label}  (${id})`);
}
writeFileSync(DOC, [
  "# Sector classification from screener.in",
  "",
  "Generated by `npm run build-sectors`. Never hand-edited.",
  "",
  "Every company the sector tables can draw — the shares the statements and the",
  "depository report and every equity line the family's funds disclose — is asked",
  "of screener.in, which publishes NSE's industry classification. Its **Broad",
  "Industry** level (the AMFI industry list funds file under) is resolved to GICS",
  "through `shared/sectors.mjs`, and that answer wins wherever there is one.",
  "",
  `- **${placed.length} of ${joins.length} companies placed** (${byJoin}).`,
  `- ${notPlaced.length} not placed by screener.in; the app places these from their funds' filing, then their statement, and names any it cannot.`,
  "",
  "## Not placed by screener.in",
  "",
  "| Company | Value | Why |", "| --- | ---: | --- |",
  ...notPlaced.map((j) => `| ${j.name} | ${cr(j.value)} | ${!j.id ? "no NSE or BSE listing bridges to it"
    : skipped.find((s) => s.id === j.id)?.why ?? `screener's "${store[j.id]?.screenerBroadIndustry}" has no entry in the map`} |`),
  "",
  "## Joined by name or by the reviewed table",
  "",
  "Identifiers carry the rest; these are the joins a reviewer should read.",
  "",
  "| Company | screener.in page | Joined by |", "| --- | --- | --- |",
  ...joins.filter((j) => (j.joinedBy === "name" || j.joinedBy === "listed-as") && store[j.id])
    .map((j) => `| ${j.name} | ${store[j.id].page} (${j.id}) | ${j.joinedBy} |`),
  "",
].join("\n"));
console.log("wrote src/data/screenerSectors.json, src/data/screenerKeys.json and docs/SCREENER-SECTORS.md");
