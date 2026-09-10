/**
 * ── A THIRD SECTOR TIER: WHAT THE EXCHANGE'S OWN DATA VENDOR PUBLISHES ──────
 *
 *   "majority of the classification of the securities is in the unclassified
 *    section, look up all the holding securities sector classification on the
 *    screener.in website or any other website and show them in their
 *    appropriate sector classification"
 *
 * Measured before a line of this was written: of 173 distinct company shares in
 * the book, **89 carry no sector at all** — every one of them a depository row,
 * because a demat statement prints an ISIN, a quantity and a rate and no
 * industry anywhere. That is ₹129.69 Cr the sector table could not place, and
 * on the Direct Equity view it is 71% of what a reader sees.
 *
 * ── WHY THIS IS A LOOKUP AND NOT A JUDGEMENT ────────────────────────────────
 *
 * The one thing this must not be is a model assigning sectors from memory.
 * That is `VAL_METHODS[i % 5]` with better prose — a categorical attribution
 * about a REAL, NAMED company, which reads as authoritative and traces to
 * nothing. So every label here is FETCHED from a named source, joined on an
 * IDENTIFIER, committed to the repo, and re-derivable by re-running this file.
 *
 * ── THE JOIN IS THE NSE SYMBOL, AND THE PAGE HAS TO ECHO IT BACK ────────────
 *
 * screener.in keys its company pages on the NSE trading symbol, which is the
 * identifier `build-symbols` already resolves through NSE's own masters and
 * records per security in `docs/SECURITY-IDENTIFIERS.md`. So this asks for a
 * symbol the exchange itself issued.
 *
 * AND THE ANSWER IS VERIFIED RATHER THAN TRUSTED. Every page prints `NSE: <SYM>`
 * and a request is only accepted where that equals the symbol asked for. Stage
 * 10e is why: moneycontrol's resolver returned an ENTIRELY DIFFERENT COMPANY on
 * 4 of the first 15 holdings tried, each page carrying a complete, correct table
 * for the company it was really about — the worst fabrication available here,
 * because there is nothing on such a screen a reader could catch it by. Same
 * rule as `functions/api/indices.js` checking `meta.longName` before it believes
 * a level: match on the label the source prints, never on the shape of the key.
 *
 * ── AND THE TIER IS CROSS-CHECKED AGAINST THE BOOK BEFORE IT IS BELIEVED ────
 *
 * 84 company shares carry a sector from the family's OWN statements AND resolve
 * a symbol, so screener can be asked about a set where the answer is already
 * known. That agreement rate is printed on every run — it is the evidence that
 * this vendor's taxonomy lines up with the one the book is already built on,
 * and it costs 84 extra requests to have it rather than assume it.
 *
 * ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────
 *
 * Ten holdings resolve NO NSE symbol, so nothing keys this lookup for them.
 * screener's own search DOES find some by name — `Yash Highvoltage Ltd` comes
 * back as a BSE scrip — and that is refused, because screener's pages print no
 * ISIN, so a name is the ONLY thing that would join them and nothing would
 * corroborate it. That is the fuzzy tier `shared/nameMatch.mjs` already refuses
 * after it matched KIRANAKART to TATA TECHNOLOGIES. They are LISTED instead,
 * with their value, for a human to commit.
 *
 * Output: `src/data/screenerSectors.json` (generated, never hand-edited) and
 * `docs/SCREENER-SECTORS.md`. Re-run with `npm run build-sectors`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveSector, UNCLASSIFIED } from "../shared/sectors.mjs";
import { securityKeyOf, stripDepositoryTail } from "../shared/securityKey.mjs";

const OUT = new URL("../src/data/screenerSectors.json", import.meta.url);
const DOC = new URL("../docs/SCREENER-SECTORS.md", import.meta.url);
const UA = "Mozilla/5.0 (compatible; GlowVenturesSectorBuild/1.0)";
const DELAY_MS = Number(process.env.SCREENER_DELAY_MS ?? 900);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const src = readFileSync(new URL("../src/data/glowData.ts", import.meta.url), "utf8");
function bookArray(name) {
  const i = src.indexOf(`export const ${name}`);
  const start = src.indexOf("= [", i);
  const end = src.indexOf("\n];", start);
  return JSON.parse(src.slice(start + 2, end + 2));
}

/** One entry per COMPANY, deduped exactly as every consolidated figure is. */
function companyShares() {
  const positions = bookArray("BOOK_POSITIONS");
  const symbols = JSON.parse(readFileSync(new URL("../src/data/nseSymbols.json", import.meta.url), "utf8"));
  const seen = new Set(), deduped = [];
  for (const p of positions) {
    if (p.dedupeGroup) { if (seen.has(p.dedupeGroup)) continue; seen.add(p.dedupeGroup); }
    deduped.push(p);
  }
  const byKey = new Map();
  for (const p of deduped.filter((x) => x.assetClass === "Equity")) {
    const e = byKey.get(p.securityKey)
      ?? { key: p.securityKey, name: p.security, bookSector: null, symbol: null, mv: 0 };
    e.mv += p.marketValue;
    e.symbol ||= p.symbol ?? symbols[p.securityKey] ?? null;
    if (p.sector && p.sector !== UNCLASSIFIED) e.bookSector ||= p.sector;
    byKey.set(p.securityKey, e);
  }
  return [...byKey.values()].sort((a, b) => b.mv - a.mv);
}

/**
 * THE CLASSIFICATION BREADCRUMB, READ BY ITS OWN `title` RATHER THAN BY
 * POSITION. screener prints four nested levels — Broad Sector, Sector, Broad
 * Industry, Industry — each an anchor to a CODED path (`/market/IN08/IN0801/`).
 * Read positionally, a company that carries three levels instead of four shifts
 * every label one place up and every one of them still looks like a sector.
 * `lib/table.mjs`'s rule, arriving through a breadcrumb.
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
/**
 * ENTITIES ARE DECODED BEFORE ANYTHING IS COMPARED, and that was a real defect
 * rather than a nicety. screener writes `NSE: J&amp;KBANK`, so a symbol regex
 * run on the raw HTML matched `J&` and stopped — refusing J&K Bank and M&M as
 * "the page names a different company" when both pages were exactly right. The
 * title carries the same escape, which refused PARTH ELECTRICALS on the name
 * fallback for the same reason. Three of three skips, one cause. This file's
 * own rule about screener's non-breaking space, one field over.
 */
const decode = (s) => String(s)
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** The identifier round-trip: the page must name the symbol we asked it for. */
function echoedSymbol(html) {
  // DECODED FIRST, THEN MATCHED — never matched around the escape. An
  // alternation that tries to accept `&amp;` inline still lets the plain
  // character class win the race and return `J&`, which is how this bug
  // survived its own first fix.
  return /NSE\s*[:/]\s*([A-Z0-9&\-]+)/.exec(decode(html))?.[1] ?? null;
}

/**
 * …AND THE SECOND CORROBORATION, FOR THE PAGES THAT CARRY NO EXCHANGE LINE.
 *
 * Measured rather than assumed: an SME listing (GRAND CONTINENT HOTELS, PARTH
 * ELECTRICALS) gets no `NSE: <sym>` block on screener at all, so the round-trip
 * above refuses a page that IS the right company. Refusing those outright would
 * throw away exactly the depository-held small caps this tier exists for.
 *
 * So the fallback is the company's own NAME, normalised through THIS BOOK'S OWN
 * `securityKeyOf` — the identity function everything else here joins on, with
 * the depository's furniture stripped first (`GRAND CONTINENT HOTELS LIMITED -
 * EQ` against screener's `Grand Continent Hotels Ltd`, both `grand-continent-
 * hotels`). That is the check Stage 10e already sanctions for this precise
 * purpose, where moneycontrol's H1 and URL were both put through it.
 *
 * IT IS A CORROBORATION AND NEVER A SEARCH. The candidate page was reached by
 * an EXCHANGE-ISSUED SYMBOL; this only asks whether the company it describes is
 * the one we hold. A page whose name does not agree is refused, and the report
 * names it — never resolved on the symbol alone.
 */
function nameAgrees(html, bookName) {
  const title = /<title>\s*([^<|]+?)\s*(?:share price|\||<)/i.exec(html)?.[1];
  if (!title || !bookName) return null;
  const a = securityKeyOf(stripDepositoryTail(decode(title)));
  const b = securityKeyOf(stripDepositoryTail(decode(bookName)));
  if (!a || !b) return null;
  return a === b || a.startsWith(b) || b.startsWith(a) ? decode(title) : false;
}

async function fetchOne(symbol, bookName) {
  const titleOf = (h) => decode(/<title>\s*([^<|]+?)\s*(?:share price|\||<)/i.exec(h)?.[1] ?? "?");
  const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return { skip: "screener has no page for this symbol" };
      if (!res.ok) { if (attempt) return { skip: `screener answered ${res.status}` }; await sleep(2500); continue; }
      const html = await res.text();
      // REFUSED RATHER THAN GUESSED. A page that is not demonstrably the
      // company we asked about might be a different one, and its table would
      // look perfectly correct — see the header note.
      const echoed = echoedSymbol(html);
      let via = null;
      if (echoed === symbol) via = "nse-symbol";
      else if (echoed) return { skip: `the page names NSE: ${echoed}, not ${symbol}` };
      else {
        const agreed = nameAgrees(html, bookName);
        if (agreed) via = "name";
        else if (agreed === false) return { skip: `no NSE line, and the page is "${titleOf(html)}"` };
        else return { skip: "no NSE line and no readable company name" };
      }
      const c = classification(html);
      if (!c.sector) return { skip: "the page carries no classification breadcrumb" };
      return { ok: c, via, url };
    } catch (e) { if (attempt) return { skip: `fetch failed — ${e.message}` }; await sleep(2500); }
  }
  return { skip: "fetch failed twice" };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const companies = companyShares().filter((c) => c.symbol && (!ONLY || ONLY.has(c.symbol)));
console.log(`screener.in — ${companies.length} company shares carry an NSE symbol\n`);

const resolved = {}, unmapped = new Map(), skipped = [], disagreed = [], agreed = [];
let done = 0;
for (const c of companies) {
  const r = await fetchOne(c.symbol, c.name);
  done += 1;
  if (r.skip) { skipped.push({ ...c, why: r.skip }); console.log(`  ${String(done).padStart(3)} ${c.symbol.padEnd(14)} SKIP  ${r.skip}`); await sleep(DELAY_MS); continue; }

  // ONE COMMITTED TABLE, exactly as `build-book` resolves the book's own
  // labels. A vendor taxonomy resolved by a second private map would be a
  // second definition of what a GICS sector is.
  const hit = resolveSector(r.ok.sector.label);
  const gics = hit.matchedBy ? hit.sector : UNCLASSIFIED;
  if (!hit.matchedBy) unmapped.set(r.ok.sector.label, (unmapped.get(r.ok.sector.label) ?? 0) + 1);

  resolved[c.symbol] = {
    gics,
    screenerSector: r.ok.sector.label,
    screenerSectorCode: r.ok.sector.code,
    screenerBroadSector: r.ok.broad?.label ?? null,
    screenerIndustry: r.ok.industry?.label ?? r.ok.broadIndustry?.label ?? null,
    joinedBy: r.via,
  };
  if (c.bookSector) (c.bookSector === gics ? agreed : disagreed).push({ ...c, screener: gics });
  console.log(`  ${String(done).padStart(3)} ${c.symbol.padEnd(14)} ${gics === UNCLASSIFIED ? "UNMAPPED" : gics.padEnd(24)} ← ${r.ok.sector.label}`);
  await sleep(DELAY_MS);
}

const cr = (n) => `₹${(n / 1e7).toFixed(2)} Cr`;
const checked = agreed.length + disagreed.length;
console.log(`\nresolved ${Object.keys(resolved).length} · skipped ${skipped.length} · unmapped labels ${unmapped.size}`);
console.log(`CROSS-CHECK against the book's own sector: ${agreed.length} of ${checked} agree` +
  (checked ? ` (${((agreed.length / checked) * 100).toFixed(1)}%)` : ""));
for (const d of disagreed) console.log(`   differs: ${d.symbol.padEnd(14)} book ${String(d.bookSector).padEnd(24)} screener ${d.screener}   ${d.name}`);
if (unmapped.size) {
  console.log(`\nSCREENER LABELS THE COMMITTED MAP DOES NOT CARRY — add them to shared/sectors.mjs:`);
  for (const [label, n] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}x  ${label}`);
}

// SORTED, so the file regenerates byte-identically when nothing moved.
const ordered = Object.fromEntries(Object.keys(resolved).sort().map((k) => [k, resolved[k]]));
writeFileSync(OUT, JSON.stringify(ordered, null, 2) + "\n");

const noSymbol = companyShares().filter((c) => !c.symbol);
writeFileSync(DOC, [
  "# Sector classification from screener.in",
  "",
  "Generated by `npm run build-sectors`. Never hand-edited.",
  "",
  "A depository statement prints an ISIN, a quantity and a rate and **no industry**,",
  "so the family's own demat holdings reach the book with no sector. This is the",
  "third tier that places them: the classification screener.in publishes for the",
  "NSE symbol `build-symbols` resolved, joined on that identifier and verified by",
  "requiring the page to print `NSE: <symbol>` back.",
  "",
  `- **${Object.keys(resolved).length} placed**, of ${companies.length} company shares carrying a symbol.`,
  `- **Cross-checked against the family's own statements: ${agreed.length} of ${checked} agree**` +
    (checked ? ` (${((agreed.length / checked) * 100).toFixed(1)}%).` : "."),
  `- ${skipped.length} refused by the guard or unanswered; ${noSymbol.length} carry no NSE symbol at all.`,
  "",
  "## Where the book and screener disagree",
  "",
  disagreed.length
    ? ["The book's own statement WINS — this tier only ever fills an empty sector.", "",
       "| Company | The statement says | screener says |", "| --- | --- | --- |",
       ...disagreed.map((d) => `| ${d.name} | ${d.bookSector} | ${d.screener} |`)].join("\n")
    : "None.",
  "",
  "## Carrying no NSE symbol, so nothing keys this lookup",
  "",
  "screener's own search finds some of these by NAME, and that is refused: its",
  "pages print no ISIN, so a name would be the only thing joining them and",
  "nothing would corroborate it. Listed here for a human to commit.",
  "",
  "| Company | Value |", "| --- | ---: |",
  ...noSymbol.map((c) => `| ${c.name} | ${cr(c.mv)} |`),
  "",
  "## Refused or unanswered",
  "",
  skipped.length ? ["| Company | Symbol | Why |", "| --- | --- | --- |",
    ...skipped.map((s) => `| ${s.name} | ${s.symbol} | ${s.why} |`)].join("\n") : "None.",
  "",
].join("\n"));
console.log(`\nwrote src/data/screenerSectors.json and docs/SCREENER-SECTORS.md`);
