// THE FAMILY'S OWN CONSOLIDATED REVIEW, USED AS THE CROSS-CHECK IT WAS ALWAYS
// MEANT TO BE — and never as a source.
//
// `source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30
// June 2026.xlsx` is the adviser's 25-tab aggregation of the whole book. It has
// no reader in `scripts/ingest/` BY DECISION: every figure in this book traces
// to the statement of the institution that struck it, and folding an aggregation
// in would end that guarantee on the first cell.
//
// Its proper use is the one `golden.mjs` serves for the extractors — an
// INDEPENDENT check on the generated book. That is what this script is. It reads
// the workbook and `src/data/glowData.ts` and reports where they agree, where
// they differ for a REASON THIS BOOK CAN NAME, and where they differ for a reason
// nobody has established yet. Nothing here ever writes to the book.
//
// ── THE THREE REASONS THE TWO TOTALS CANNOT BE COMPARED DIRECTLY ────────────
//
// Anyone reading "Rs 1,300.05 Cr" against the book's managed total and concluding
// the dashboard is wrong has hit one of these, and all three are decisions about
// what belongs in a portfolio total rather than defects on either side:
//
//   1. THE PROMOTER STOCK IS OUTSIDE THE TOTAL ON BOTH SIDES. The review's
//      `Promoter Holding` tab lists 2,37,29,601 Polycab shares — Ajay's
//      1,39,01,229 among them, sourced, in the review's own words, from the "ICIC
//      Demat" — with a market value column of 0, on a tab outside the portfolio
//      total. This book ingested that same statement and carries the same
//      1,39,01,229 shares at the Rs 8,885.00 the depository marks them at, which
//      is Rs 12,351.24 Cr — but ring-fences it into `BOOK_POLYCAB`, out of every
//      consolidated total and onto the Polycab page alone (see
//      RINGFENCED_SECURITY_KEYS in build-book.mjs). So both keep the promoter
//      block out of the managed total; they agree on the quantity to the share,
//      and differ only in that the review carries it at zero while the book
//      carries what the statement says the account holds.
//   2. THE AS-OF DATES ARE NOT THE SAME. The review is struck at 30 June 2026.
//      This book carries each account at ITS OWN statement date, spread from
//      31 March to 13 August 2026 (§3). Every price-driven difference below is
//      partly this, and a line whose QUANTITY matches exactly while its value
//      does not is almost always only this.
//   3. PRIVATE HOLDINGS ARE CARRIED AT COST IN THE REVIEW. On the `Private
//      Investments` tab cost and market value are equal on every row. This book
//      carries what each statement reports, which for a depository row with no
//      price is no value at all (see `nsdlDemat.mjs`).
//
// Run: node scripts/review-reconcile.mjs   ->  docs/REVIEW-RECONCILIATION.md
import { readFileSync, writeFileSync } from "node:fs";
import { readSpreadsheet } from "./ingest/lib/sheet.mjs";
import { securityKeyOf } from "../shared/securityKey.mjs";
import { makeSecurityMatcher } from "../shared/nameMatch.mjs";

const WORKBOOK = "source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx";
const BOOK = "src/data/glowData.ts";
const OUT = "docs/REVIEW-RECONCILIATION.md";

const CR = 1e7;
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const cr = (v, dp = 2) =>
  v == null ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const qty = (v) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 3 }));

/** Pull one `export const NAME = <literal>` out of the generated book. */
function grab(src, name) {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`${name} not found in ${BOOK}`);
  const eq = src.indexOf("=", i);
  const st = src.slice(eq + 1).search(/\S/) + eq + 1;
  let depth = 0, inStr = false, esc = false;
  for (let k = st; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) return JSON.parse(src.slice(st, k + 1)); }
  }
  throw new Error(`${name}: unterminated literal`);
}

// ── the book ────────────────────────────────────────────────────────────────
const src = readFileSync(BOOK, "utf8");
const POSITIONS = grab(src, "BOOK_POSITIONS");
// The ring-fenced promoter stock lives in its own export now (see
// RINGFENCED_SECURITY_KEYS in build-book.mjs) — out of BOOK_POSITIONS and every
// book total, on the Polycab page alone. It is read here so the promoter
// reconciliation below still fires: the review carries it outside its total too.
const POLYCAB = grab(src, "BOOK_POLYCAB");
const ACCOUNTS = grab(src, "BOOK_ACCOUNTS");
const SUMMARY = grab(src, "BOOK_SUMMARY");
const ACC = new Map(ACCOUNTS.map((a) => [a.accountId, a]));

/** Consolidated: each dedupeGroup once, exactly as every headline figure is struck. */
const CONSOLIDATED = (() => {
  const seen = new Set(); const out = [];
  for (const p of POSITIONS) {
    if (p.dedupeGroup) { if (seen.has(p.dedupeGroup)) continue; seen.add(p.dedupeGroup); }
    out.push(p);
  }
  return out;
})();

// ── the review ──────────────────────────────────────────────────────────────
const wb = readSpreadsheet(readFileSync(WORKBOOK));
const sheet = (name) => {
  const s = wb.sheets.find((x) => x.name === name);
  if (!s) throw new Error(`sheet "${name}" is not in the workbook — its tabs are: ${wb.sheets.map((x) => x.name).join(", ")}`);
  return s.rows ?? [];
};

/**
 * THE WORKBOOK'S FIGURES ARE IN CRORES, WHATEVER ITS HEADERS SAY.
 *
 * `Asset Allocation` heads its column "Market Value in Lakhs" and totals it at
 * 1300.05 — which is Rs 1,300.05 CRORE, not Rs 13 crore. Every other tab agrees
 * with it in crores (`Equity` totals 1024.999 against Asset Allocation's Equity
 * row of 1024.999). Read as lakhs the whole review would be a hundredth of a
 * book whose smallest single mandate is Rs 1.16 Cr, so the unit is established
 * from the sheets agreeing with each other rather than from a header.
 */
const REVIEW_UNIT_NOTE = "crores (the `in Lakhs` header on Asset Allocation is wrong — its own total of 1300.05 ties to the Equity tab's 1024.999 in crores)";

// ── (A) top level ───────────────────────────────────────────────────────────
function assetAllocation() {
  const rows = sheet("Asset Allocation");
  const out = [];
  for (const r of rows) {
    const label = String(r[1] ?? "").trim();
    if (!label || /^(Asset Class|Note|Particulars)/i.test(label)) continue;
    const mv = num(r[2]);
    if (mv == null) continue;
    out.push({ label, mv });
    if (/^Total$/i.test(label)) break;
  }
  return out;
}

// ── (B) per holder ──────────────────────────────────────────────────────────
function investorwise() {
  const rows = sheet("Investorwise Summary");
  const hdr = (rows.find((r) => r.some((c) => String(c ?? "").trim() === "Category")) ?? []).map((c) => String(c ?? "").trim());
  const cols = [];
  for (let c = 2; c < hdr.length; c++) if (hdr[c] && !/^Allocation/i.test(hdr[c])) cols.push({ name: hdr[c], col: c });
  const total = rows.find((r) => r.some((c) => String(c ?? "").trim() === "Total"));
  const seen = new Map();
  return cols.map(({ name, col }) => {
    /**
     * THE SHEET PRINTS "Bharat Jaisinghani Family Trust II" TWICE, and the two
     * columns carry different money. This book has Trust 2 and Trust 3 as
     * separate taxpayers with separate PANs, so the second occurrence is
     * Trust III — a header typo in the review, recorded rather than silently
     * merged, because merging them would collapse two taxpayers into one.
     */
    const n = seen.has(name) ? name.replace(/\bII$/, "III") : name;
    seen.set(name, true);
    return { holder: n, printedAs: n === name ? null : name, mv: num(total?.[col]) };
  });
}

/** Book, per owner. A PER-OWNER figure, so it dedupes (each group once) but never across owners. */
function bookByOwner() {
  const m = new Map();
  for (const p of CONSOLIDATED) {
    const o = ACC.get(p.accountId)?.owner ?? "Unattributed";
    m.set(o, (m.get(o) ?? 0) + p.marketValue);
  }
  return m;
}

// ── (C) the review's own line items, per asset sheet ────────────────────────
/**
 * A SECTION HEADER CARRIES A SUBTOTAL AND MUST NEVER BE SUMMED WITH ITS ROWS.
 *
 * The Equity tab interleaves them: "Multi Cap" is a heading whose figure is the
 * sum of the eight product rows under it, and "Equity - Managed Strategies" on
 * the Investorwise tab is a heading over five more headings. Added together the
 * review would read about twice its own total. A row is a PRODUCT when it names
 * an advisor or an investor; a row with neither is a heading. That is the same
 * rule `amfi.mjs` follows for AMFI's Grand Total and `dataGovIn.mjs` for WPI's
 * weighted aggregate: the headline row is NAMED, never re-derived.
 */
function equityLines() {
  const rows = sheet("Equity");
  const out = [];
  let section = null;
  rows.forEach((r, i) => {
    if (i < 2) return;
    const c = r.map((x) => String(x ?? "").trim());
    const product = c[1];
    if (!product || /^Note:|^\d\./.test(product)) return;
    /**
     * THE INVESTOR COLUMN IS WHAT SAYS "THIS IS A HOLDING", NOT THE ADVISOR.
     *
     * A first draft keyed the section test on "no advisor AND no investor" and
     * missed the biggest section on the sheet: `Direct Equity - Non MO` prints
     * `Demat` in the ADVISOR column, so it read as a product, its own subtotal
     * of Rs 222.36 Cr was compared against a security nobody holds, and its 34
     * company rows inherited whatever heading came before them. A heading names
     * no investor because a heading belongs to nobody; every real holding names
     * at least one. A literal `0` in the cell is the sheet's own empty.
     */
    const blank = (v) => !v || v === "0";
    const advisor = blank(c[2]) ? "" : c[2];
    const investor = blank(c[3]) ? "" : c[3];
    const line = { row: i + 1, product, advisor, investor, qty: num(c[5]), cost: num(c[6]), mv: num(c[7]) };
    if (!investor) { section = product; line.isSection = true; }
    line.section = line.isSection ? null : section;
    out.push(line);
  });
  return out;
}

function simpleSheetLines(name, { productCol = 1, qtyCol = null, costCol, mvCol }) {
  const rows = sheet(name);
  const out = [];
  rows.forEach((r, i) => {
    const c = r.map((x) => String(x ?? "").trim());
    const product = c[productCol];
    if (!product || /^(Product|Total|from Live|Note|Refer)/i.test(product)) return;
    out.push({
      row: i + 1, sheet: name, product,
      qty: qtyCol == null ? null : num(c[qtyCol]),
      cost: num(c[costCol]), mv: num(c[mvCol]),
    });
  });
  return out;
}

// ── matching the review's names to the book ─────────────────────────────────
/**
 * WHAT THE REVIEW CALLS A THING vs WHAT ITS STATEMENT CALLS IT.
 *
 * Matched on `securityKeyOf` on both sides first — the same normalisation the
 * book's own join key uses, so "Yash High Voltage Ltd." and "YASH HIGHVOLTAGE
 * LIMITED - EQ NEW FV RS. 5/-" meet without either being rewritten. What it
 * cannot bridge is a name the review INVENTED for a mandate ("Aristos Equity
 * Potrfolio - SB" for two Goldstandard accounts, its own typo included), so
 * those are a COMMITTED map, one entry per line, and anything unmatched is
 * REPORTED rather than guessed at.
 */
const MANDATE_ALIASES = [
  [/carnelian bespoke/i, "Carnelian Asset Management and Advisors Pvt Ltd"],
  [/aristos equity/i, "Goldstandard Wealth Private Limited"],
  [/green lantern/i, "Green Lantern Capital LLP"],
  [/svan investment/i, "SVAN Investment Managers LLP"],
  [/vec small and mid ?cap|v\.e\.c/i, "V.E.C Assago Capital Management LLP"],
  [/molecule growth/i, "Molecule Ventures LLP"],
  [/buoyant opportunities/i, "Buoyant Capital"],
  [/helios flexi cap/i, "Helios Mutual Fund"],
  [/motilal oswal founders fund/i, "Motilal Oswal Founders Fund"],
  [/3p india equity/i, "3P Investment Managers"],
  [/carnelian bharat amritkaal/i, "Carnelian Bharat Amritkaal Fund"],
  [/fund of funds/i, "Motilal Oswal Delphi Equity Fund"],
  [/sanshi fund/i, "Sanshi Fund"],
  [/india sme/i, "India SME Investments"],
  [/sky capital/i, "Sky Capital Rising Titans Fund"],
  [/transition venture/i, "Transition Venture Capital"],
  [/neo .*(infra|special credit)/i, "Neo Infra Income Opportunities Fund"],
  [/baring/i, "Baring Private Equity India Fund"],
  [/lkp sec/i, "LKP Securities"],
  [/active momentum/i, "Motilal Oswal Active Momentum Fund"],
];
const providerFor = (product) => MANDATE_ALIASES.find(([re]) => re.test(product))?.[1] ?? null;

/** Book value held with a given provider, across every account of it. */
function bookByProvider(provider) {
  const ids = new Set(ACCOUNTS.filter((a) => a.provider === provider).map((a) => a.accountId));
  const ps = CONSOLIDATED.filter((p) => ids.has(p.accountId));
  return { count: ps.length, mv: ps.reduce((s, p) => s + p.marketValue, 0), accounts: [...ids].length };
}

/** Book positions carrying a securityKey, with their quantity and value. */
const BY_KEY = (() => {
  const m = new Map();
  for (const p of CONSOLIDATED) {
    const e = m.get(p.securityKey) ?? { qty: 0, mv: 0, rows: [] };
    e.qty += p.quantity ?? 0; e.mv += p.marketValue; e.rows.push(p);
    m.set(p.securityKey, e);
  }
  return m;
})();

/**
 * WHAT THE ARCHIVE HOLDS THAT THE BOOK DOES NOT.
 *
 * "Not in the book" runs together two completely different findings, and only
 * one of them is a gap in the corpus:
 *
 *   - no statement in `source/` reports this holding at all — a document is
 *     genuinely missing, and that is the line to send the client;
 *   - a statement DOES report it and this book carries no POSITION for it,
 *     because the depository recorded it at the face value it was allotted at
 *     and `Position.marketValue` is `number`. National Stock Exchange of India
 *     Ltd is the plainest case: 1,25,000 shares are in the archive, at Re 1.00
 *     each, which is par and not a mark. The units are known; the value is not.
 *
 * Telling a reader to go and find a statement that is already read would be the
 * absent-recorded-against-the-wrong-cause failure this repo keeps meeting, so
 * the archive is consulted before anything is called missing.
 */
/**
 * WHY AN ACCOUNT REPORTS NOTHING, IN ITS OWN STATEMENT'S WORDS.
 *
 * Read from the archive rather than written here, so a drop that supplies the
 * missing statement empties section F1 by itself instead of leaving a sentence
 * behind that has stopped being true — which is the stale-absence failure this
 * repo has recorded five times.
 */
const ZERO_REASON = (() => {
  const m = new Map();
  let manifest;
  try { manifest = JSON.parse(readFileSync("public/audit/manifest.json", "utf8")); }
  catch { return m; }
  for (const d of manifest) {
    let doc;
    try { doc = JSON.parse(readFileSync(`public/audit/${d.docKey}/document.json`, "utf8")); }
    catch { continue; }
    const w = (doc.warnings ?? []).find((x) => x.detail);
    if (w && !m.has(d.provider)) m.set(d.provider, w.detail);
  }
  return m;
})();

const ARCHIVE_KEYS = (() => {
  const m = new Map();
  let manifest;
  try { manifest = JSON.parse(readFileSync("public/audit/manifest.json", "utf8")); }
  catch { return m; }
  for (const d of manifest) {
    let doc;
    try { doc = JSON.parse(readFileSync(`public/audit/${d.docKey}/document.json`, "utf8")); }
    catch { continue; }
    for (const h of doc.holdings ?? []) {
      if (!h.securityKey) continue;
      const e = m.get(h.securityKey) ?? { qty: 0, docs: new Set(), faceValue: null };
      e.qty += h.quantity ?? 0;
      e.docs.add(d.docKey);
      if (h.faceValue != null) e.faceValue = h.faceValue;
      m.set(h.securityKey, e);
    }
  }
  return m;
})();

/**
 * A REVIEW NAME MEETS A BOOK NAME ON `securityKeyOf`, THEN ON A PREFIX.
 *
 * The exact key matches most of them. The rest differ because the DEPOSITORY
 * appends what the scrip is ("- EQ NEW FV RS. 5/-") while the review prints the
 * company, so the book's key STARTS WITH the review's. A prefix match is
 * accepted only when it is unambiguous — exactly one book key starts with the
 * review's — because "Vedanta" against five different Vedanta entities is
 * precisely the join that must not be guessed.
 */
const SECURITY_ALIASES = new Map([
  // The review prints the trading name; the depository prints the registered
  // one. Each of these was established by reading BOTH documents, and each is
  // one line so it can be challenged on its own.
  // The review's trading name against the depository's registered one. Both
  // were read off their own documents; neither was inferred from the other.
  ["jaro-education", "jaro-institute-of-technology-management-and-research-limited-eq"],
  ["parth-electrical-and-engineering", "parth-electricals-and-engineering-limited-eq"],
  ["m-s-grand-continent-hotels", "grand-continent-hotels-limited-eq"],
]);

/**
 * The tiers live in `shared/nameMatch.mjs` so this reconciler and
 * `register-reconcile.mjs` cannot drift apart about whether the book carries a
 * name. Two matchers are built because the two questions are different: does
 * the BOOK carry it, and — if not — did we READ it and simply fail to value it?
 *
 * Both used to come from one function whose `index` parameter was honoured on
 * two tiers out of four, the alias and prefix tiers reading `BY_KEY` whatever
 * they were passed. The archive question therefore searched the book, could
 * return a key `ARCHIVE_KEYS` does not hold, and reported a line as
 * "no statement in `source/` reports this" when one does. That verdict is what
 * puts a line on the section D1 ASK LIST, so the defect asks the client for
 * documents already in hand. Measured on this corpus it changed no line — the
 * report regenerates byte-identically — which is precisely why it had to be
 * fixed structurally rather than left to be found by the first line that hit it.
 */
const matchSecurity = makeSecurityMatcher(BY_KEY, SECURITY_ALIASES);
const matchInArchive = makeSecurityMatcher(ARCHIVE_KEYS, SECURITY_ALIASES);

// ═══════════════════════════════════════════════════════════════════════════
const L = [];
const say = (s = "") => L.push(s);

say("# The generated book against the family's consolidated review");
say();
say("Generated by `node scripts/review-reconcile.mjs` — **do not edit by hand**.");
say();
say(`Review: \`${WORKBOOK}\`, struck **30 June 2026**, figures in ${REVIEW_UNIT_NOTE}.`);
say(`Book: \`${BOOK}\`, ${CONSOLIDATED.length} consolidated positions across ${ACCOUNTS.length} accounts, each at its own statement date.`);
say();
say("The review is **not a source and never becomes one** — every figure in this book traces");
say("to the statement of the institution that struck it. This is the independent check on the");
say("generated book, the role `golden.mjs` plays for the extractors.");
say();

// ── A. why the totals differ before a single line is compared ───────────────
// The promoter stock is read from BOOK_POLYCAB, not CONSOLIDATED: this book now
// ring-fences it out of every total, exactly as the review carries it outside
// its own — so the two totals below are BOTH ex-promoter and directly comparable.
const poly = POLYCAB.find((p) => /polycab/i.test(p.security)) ?? null;
const promoterRows = sheet("Promoter Holding")
  .map((r) => r.map((x) => String(x ?? "").trim()))
  .filter((c) => c.some(Boolean));
const alloc = assetAllocation();
const reviewTotal = alloc.find((r) => /^Total$/i.test(r.label))?.mv ?? null;
const bookTotal = SUMMARY.totalValue / CR;   // already EXCLUDES the promoter stock
const polyCr = poly ? poly.marketValue / CR : 0;
// The book total is already ex-promoter (BOOK_POLYCAB is outside every total), so
// the "less the promoter stock" figure the bridge below reconciles against IS it.
const bookExPromoter = bookTotal;

say("## A. Three reasons the two totals are not comparable line for line");
say();
say("| | Review (30 Jun 2026) | Book |");
say("| --- | ---: | ---: |");
say(`| Managed portfolio total | **₹${cr(reviewTotal)} Cr** | **₹${cr(bookTotal)} Cr** |`);
say(`| Promoter holding — outside the total | — (own tab, carried at zero) | ₹${cr(polyCr)} Cr (own page, ring-fenced) |`);
say();
say("**1. THE PROMOTER STOCK IS OUTSIDE THE TOTAL ON BOTH SIDES.**");
say("The review carries it on a `Promoter Holding` tab, at zero, outside the portfolio total;");
say("this book ring-fences it into `BOOK_POLYCAB` and shows it on the Polycab page alone, out of");
say("every consolidated total — so the two totals above are both ex-promoter and comparable as");
say("they stand. The review's tab reads, verbatim:");
say();
say("```");
for (const c of promoterRows) say("  " + c.filter(Boolean).join("  |  "));
say("```");
say();
if (poly) {
  const ajay = promoterRows.find((c) => /Ajay JS/i.test(c.join(" ")));
  const ajayQty = ajay ? num(ajay.find((x) => num(x) != null && num(x) > 1000)) : null;
  say(`The book carries **${qty(poly.quantity)} shares** of Polycab at ₹${cr(polyCr)} Cr, from`);
  say("Ajay's ICICI Bank NSDL statement. The review's own line for it is");
  say(`\`Ajay JS: Individual ${qty(ajayQty)}\` — **the same quantity**, sourced in the review's own words`);
  say("from the \"ICIC Demat\", the very document this book read.");
  say();
  say(ajayQty === poly.quantity
    ? "**The two agree on the quantity to the share.** They differ only on whether that holding"
    : `**They differ on quantity by ${qty(Math.abs((ajayQty ?? 0) - poly.quantity))} shares**, which needs an explanation. Separately, they differ on whether the holding`);
  say("belongs in a portfolio total, and that is a decision about the family's affairs rather");
  say("than a parsing rule — removing its key from `RINGFENCED_SECURITY_KEYS` folds it back in one line.");
}
say();
say("**2. THE AS-OF DATES ARE NOT THE SAME.** The review is struck at 30 June 2026; this book");
say("carries each account at its own statement date (§3). Per-account dates in the book:");
say();
const byDate = new Map();
for (const a of ACCOUNTS) byDate.set(a.asOf, (byDate.get(a.asOf) ?? 0) + 1);
say("| As-of | Accounts |");
say("| --- | ---: |");
for (const [d, n] of [...byDate].sort()) say(`| ${d} | ${n} |`);
say();
say("A line whose QUANTITY matches exactly while its value does not is almost always only this.");
say();
say("**3. PRIVATE HOLDINGS ARE CARRIED AT COST IN THE REVIEW.** On the `Private Investments`");
say("tab, cost and market value are equal on every row. This book carries what each statement");
say("reports, and for a depository row with no price that is no value at all.");
say();

// ── B. per holder ──────────────────────────────────────────────────────────
say("## B. Per holder");
say();
const iw = investorwise();
const bo = bookByOwner();
/**
 * THE "LESS THE PROMOTER STOCK" COLUMN IS GONE, AND ITS REMOVAL IS THE FIX.
 *
 * It subtracted Polycab from each holder's book total back when `CONSOLIDATED`
 * still carried it. It no longer does — the holding is ring-fenced into
 * `BOOK_POLYCAB`, so every figure `bookByOwner` returns is ALREADY ex-promoter —
 * and subtracting again put **−₹12,001.70 Cr** against Ajay and **−₹11,640.85 Cr**
 * on the Total row of the one document whose job is to be the independent check
 * on the generated book. A negative market value is not a small error: it is the
 * "a total must tie to its own columns" rule failing in the report that exists to
 * enforce it.
 *
 * Deleted rather than zeroed, because a column identical to the one beside it
 * invites the next session to "restore" the subtraction. Section A states the
 * promoter figure once, where it belongs.
 */
say("| Holder | Review | Book (ex-promoter) | Difference |");
say("| --- | ---: | ---: | ---: |");
const OWNER_ALIAS = new Map([
  ["Aarti Ajay Jaisinghani", "Aarti Jaisinghani"],
  ["Bharat Jaisinghani Family Trust II", "Bharat Jaisinghani Family Trust 2"],
  ["Bharat Jaisinghani Family Trust III", "Bharat Jaisinghani Family Trust 3"],
]);
let revSum = 0, bookSum = 0, absentHolders = 0;
for (const { holder, mv } of iw) {
  const bookName = OWNER_ALIAS.get(holder) ?? holder;
  const b = bo.get(bookName) ?? null;
  const bookCr = b == null ? null : b / CR;
  revSum += mv ?? 0; bookSum += bookCr ?? 0;
  if (b == null) absentHolders += mv ?? 0;
  const diff = bookCr == null || mv == null ? null : bookCr - mv;
  say(`| ${holder}${bookName !== holder ? ` <br><sub>book: ${bookName}</sub>` : ""} | ₹${cr(mv)} Cr | ${bookCr == null ? "— *not in the book*" : "₹" + cr(bookCr) + " Cr"} | ${diff == null ? "—" : (diff >= 0 ? "+" : "") + cr(diff) + " Cr"} |`);
}
// Owners the book has and the review's columns do not.
for (const [o, v] of bo) if (!iw.some(({ holder }) => (OWNER_ALIAS.get(holder) ?? holder) === o)) {
  say(`| — *not a review column* | — | ₹${cr(v / CR)} Cr | — |`);
  bookSum += v / CR;
}
say(`| **Total** | **₹${cr(revSum)} Cr** | **₹${cr(bookSum)} Cr** | **${(bookSum - revSum >= 0 ? "+" : "") + cr(bookSum - revSum)} Cr** |`);
say();
say("Every book figure here is ex-promoter by construction: Polycab is ring-fenced into");
say("`BOOK_POLYCAB` and reaches no per-owner total. Section A states it once, on its own.");
say();
say("`Hope India Trust` is a review column and deliberately NOT in this book: its four");
say("mutual-fund folios are filed by each AMC as `Status : Trust`, a separate taxpayer. One");
say("entry in `shared/owners.mjs` reverses that if the family says it belongs here.");
say();

// ── C. managed strategies, per manager ─────────────────────────────────────
say("## C. The review's product lines against the book");
say();
say("Matched on the manager or fund the line names, then on `securityKeyOf` for a company.");
say("A line this book cannot match is listed with what it would take to close it — that list");
say("IS the deliverable, because it names exactly which statements are still missing.");
say();
let gapNoStatement = 0;
const eq = equityLines();
const products = eq.filter((l) => !l.isSection && l.mv != null && l.mv !== 0);
const matchedProviders = new Map();
const unmatchedLines = [];
const securityLines = [];
for (const l of products) {
  const prov = providerFor(l.product);
  if (prov) {
    const e = matchedProviders.get(prov) ?? { review: 0, lines: [] };
    e.review += l.mv; e.lines.push(l); matchedProviders.set(prov, e);
  } else if (l.section && /Direct Equity|Unlisted/i.test(l.section)) {
    securityLines.push(l);
  } else {
    unmatchedLines.push(l);
  }
}
say("### C1. Managed strategies — matched to a manager in the book");
say();
say("| Review line | Review MV | Book (same manager) | Difference | Book accounts |");
say("| --- | ---: | ---: | ---: | ---: |");
let c1rev = 0, c1book = 0;
const zeroedManagers = [];
for (const [prov, e] of [...matchedProviders].sort((a, b) => b[1].review - a[1].review)) {
  const b = bookByProvider(prov);
  c1rev += e.review; c1book += b.mv / CR;
  const d = b.mv / CR - e.review;
  // A matched manager the book values at ZERO is a missing document, not drift.
  if (e.review > 0 && b.mv === 0) {
    zeroedManagers.push({ product: e.lines.map((l) => l.product).join(", "), prov, reviewMV: e.review });
  }
  say(`| ${e.lines.map((l) => l.product).join("<br>")} <br><sub>-> ${prov}</sub> | ₹${cr(e.review)} Cr | ₹${cr(b.mv / CR)} Cr | ${(d >= 0 ? "+" : "") + cr(d)} Cr | ${b.accounts} |`);
}
say(`| **Total matched** | **₹${cr(c1rev)} Cr** | **₹${cr(c1book)} Cr** | **${(c1book - c1rev >= 0 ? "+" : "") + cr(c1book - c1rev)} Cr** | |`);
say();

// ── C2. direct equity, name by name ────────────────────────────────────────
say("### C2. Direct equity — name by name, on QUANTITY");
say();
say("Quantity is the check that matters here: it does not move with a price date, so a line");
say("whose quantity ties exactly is READ CORRECTLY however far its value has drifted. The");
say("review names the custodian per line, which is what makes this joinable at all.");
say();
say("| Review line | Custodian | Review qty | Book qty | Book MV | Verdict |");
say("| --- | --- | ---: | ---: | ---: | --- |");
let tiedQty = 0, missing = 0, partial = 0, over = 0, unvalued = 0;
const notInBook = [];
for (const l of securityLines.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0))) {
  const m = matchSecurity(l.product);
  const b = m.key ? BY_KEY.get(m.key) : null;
  let verdict;
  if (!b) {
    // Before calling anything missing, ask whether a statement we already read
    // reports it and simply could not value it.
    const am = matchInArchive(l.product);
    const a = am.key ? ARCHIVE_KEYS.get(am.key) : null;
    if (a) {
      verdict = `in the archive, **not valued** — ${qty(a.qty)} unit(s)${a.faceValue != null ? ` recorded at a face value of ${a.faceValue}` : ", no price published"}`;
      unvalued++; l.archive = a;
    } else { verdict = "**no statement in `source/` reports this**"; missing++; notInBook.push(l); }
  }
  else if (l.qty != null && Math.abs(b.qty - l.qty) < 0.5) { verdict = "quantity ties exactly"; tiedQty++; }
  else if (l.qty != null && b.qty > l.qty) {
    /**
     * THE BOOK HOLDING MORE THAN THE REVIEW IS NOT A SHORTFALL AND MUST NOT BE
     * FILED AS ONE. A missing account makes the book hold LESS; the book holding
     * MORE means the two are counting different things — a different date, or a
     * name the review splits and the depository does not. It is reported on its
     * own so it cannot be read as coverage.
     */
    verdict = `**book holds MORE** — ${qty(b.qty)} against the review's ${qty(l.qty)}`; over++;
  }
  else { verdict = `book holds ${qty(b.qty)} of ${qty(l.qty)}`; partial++; }
  say(`| ${l.product} | ${l.advisor || "—"} | ${qty(l.qty)} | ${b ? qty(b.qty) : "—"} | ${b ? "₹" + cr(b.mv / CR) + " Cr" : "—"} | ${verdict}${b ? ` <br><sub>joined: ${m.how}</sub>` : ""} |`);
}
say();
say(`**${tiedQty} of ${securityLines.length}** direct-equity lines tie on quantity exactly, ${partial} are partly held,`);
say(`${over} show the book holding MORE than the review, ${unvalued} are read from a statement but carry`);
say(`no value this book may publish, and **${missing} are reported by no statement in \`source/\` at all**.`);
say();

// ── D. what the review carries and the book does not ───────────────────────
say("## D. What the review carries that this book does not — and what would close it");
say();
if (!notInBook.length && !unmatchedLines.length) {
  say("Nothing: every review line matched a manager or a security in the book.");
} else {
  say("| Review line | Custodian / advisor | Review MV | Why it is not here |");
  say("| --- | --- | ---: | --- |");
  const custodianNote = (adv) =>
    /HDFC/i.test(adv ?? "") ? "held at **HDFC Bank NSDL** — that statement is in `source/august-2026-e/` and is a SCAN with no text layer, so no reader can read it"
      : /ICICI/i.test(adv ?? "") ? "the ICICI NSDL statement is read; this line is not on it, so it sits in another account"
      : /MOPWM|Motilal/i.test(adv ?? "") ? "held at **Motilal Oswal**; the drop carries a holding statement for three of its demat accounts and a transaction tape only for a fourth"
      : /Private/i.test(adv ?? "") ? "a private holding the review carries at cost; no statement in the drop values it"
      : "no statement in `source/` reports this holding";
  for (const l of [...notInBook, ...unmatchedLines].sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0)))
    say(`| ${l.product} | ${l.advisor || "—"} | ₹${cr(l.mv)} Cr | ${custodianNote(l.advisor)} |`);
  gapNoStatement = [...notInBook, ...unmatchedLines].reduce((s, l) => s + (l.mv ?? 0), 0);
  const gap = gapNoStatement;
  say();
  say(`**₹${cr(gap)} Cr of review lines have no counterpart in this book.**`);
  say();
  /**
   * THE SAME LIST, GROUPED BY THE DOCUMENT THAT WOULD CLOSE IT.
   *
   * A list of 21 holdings is something to read; a list of 3 documents is
   * something to ACT on. This is the section to put in front of the client.
   */
  say("### D1. Grouped by the one document that would close each");
  say();
  const asks = new Map();
  for (const l of [...notInBook, ...unmatchedLines]) {
    const adv = l.advisor ?? "";
    const k = /HDFC/i.test(adv) ? "Bharat's HDFC Bank NSDL holding statement — **as a text PDF, not a scan**"
      : /ICICI/i.test(adv) ? "an ICICI Bank NSDL statement for the account this line sits in"
      : /MOPWM|Motilal/i.test(adv) ? "Motilal Oswal holding statements for the demat and PWM accounts not in the drop"
      : /Private/i.test(adv) ? "a valuation for the private holdings the review carries at cost"
      : "a statement from whoever holds this";
    const e = asks.get(k) ?? { n: 0, mv: 0, names: [] };
    e.n++; e.mv += l.mv ?? 0; e.names.push(l.product);
    asks.set(k, e);
  }
  say("| Ask the client for | Lines | Value it would bring in |");
  say("| --- | ---: | ---: |");
  for (const [k, e] of [...asks].sort((a, b) => b[1].mv - a[1].mv))
    say(`| ${k} | ${e.n} | **₹${cr(e.mv)} Cr** |`);
  say();
  say("Every figure in that last column is the REVIEW's, not this book's — it is what the");
  say("review says those holdings are worth at 30 June, and it is the size of the ask rather");
  say("than a number this book will publish when the statements arrive.");
}
say();

// ── E. what the book carries and the review does not ───────────────────────
say("## E. What this book carries that the review does not");
say();
const reviewNames = new Set(products.map((l) => securityKeyOf(l.product)));
const orphan = CONSOLIDATED.filter((p) => {
  // The promoter-stock skip that used to sit here is GONE, not disabled: `poly`
  // is read from `BOOK_POLYCAB` and `p` iterates `CONSOLIDATED`, so `p === poly`
  // can never be true and the branch was dead. Ring-fencing already keeps the
  // holding out of this list. A dead branch with a confident purpose is how a
  // future session "fixes" a rule that was never broken — this file names that
  // failure elsewhere, so it does not get to keep one of its own.
  if (!reviewNames.has(p.securityKey)) {
    const prov = ACC.get(p.accountId)?.provider;
    return !matchedProviders.has(prov);
  }
  return false;
});
const orphanBy = new Map();
for (const p of orphan) {
  const k = ACC.get(p.accountId)?.provider ?? "—";
  const e = orphanBy.get(k) ?? { n: 0, mv: 0 };
  e.n++; e.mv += p.marketValue; orphanBy.set(k, e);
}
say("| Provider | Positions | Market value |");
say("| --- | ---: | ---: |");
for (const [k, e] of [...orphanBy].sort((a, b) => b[1].mv - a[1].mv)) say(`| ${k} | ${e.n} | ₹${cr(e.mv / CR)} Cr |`);
say(`| **Total** | **${orphan.length}** | **₹${cr(orphan.reduce((s, p) => s + p.marketValue, 0) / CR)} Cr** |`);
say();
say("A holding here and not in the review is not automatically an error on either side: the");
say("review is a quarter older, and it excludes the promoter block and the Hope India Trust");
say("folios by decision.");
say();

// ── F. the bridge, which must close or say where it does not ───────────────
say("## F. The bridge — review total to book total");
say();
say("A reconciliation that does not close is an anecdote. This one closes to a residual that");
say("is NAMED rather than plugged: no step below is fitted to make the arithmetic work.");
say();
const steps = [
  ["Review portfolio total, 30 June 2026", reviewTotal, null],
  ["less: holders with no account in this book", -absentHolders,
    "Hope India Trust (a separate taxpayer, held out by decision) and the Bharat Jaisinghani family trusts whose statements the drop does not carry"],
  ["less: lines no statement in `source/` reports", -gapNoStatement,
    "section D — the Motilal Oswal and HDFC Bank statements that have not been supplied"],
];
let running = 0;
say("| Step | Amount | Running | Why |");
say("| --- | ---: | ---: | --- |");
for (const [label, amt, why] of steps) {
  running += amt ?? 0;
  say(`| ${label} | ${amt == null ? "—" : (amt >= 0 ? "" : "−") + "₹" + cr(Math.abs(amt)) + " Cr"} | ₹${cr(running)} Cr | ${why ?? ""} |`);
}
const residual = bookExPromoter - running;
say(`| **What the book would carry on those two adjustments alone** | | **₹${cr(running)} Cr** | |`);
// "less the promoter stock" would now describe a subtraction that no longer
// happens — the book total is ex-promoter by construction. The caption says what
// the figure IS rather than how it once got there.
say(`| **What the book actually carries (ex-promoter)** | | **₹${cr(bookExPromoter)} Cr** | |`);
say(`| **Residual** | | **${(residual >= 0 ? "+" : "−") + "₹" + cr(Math.abs(residual))} Cr** | see below |`);
say();
/**
 * ONE COMPONENT OF THE RESIDUAL *CAN* BE QUANTIFIED, AND LEAVING IT INSIDE
 * "MARKET MOVEMENT" HID A ₹52 Cr ASK.
 *
 * A manager matched in C1 whose book value is ZERO while the review carries real
 * money is not drift and is not a valuation basis: it is an account whose own
 * statement reports nothing to value. That is a MISSING DOCUMENT, and it belongs
 * on the ask list in D1 rather than in a paragraph about six weeks of prices.
 *
 * 3P is the case that forced this. Its 31 July statement prints all three classes
 * at ZERO UNITS with its own warning — "the fund reclassified them out on
 * 31-03-2026 and prints the zero. Where the units went is not on this document" —
 * while the depository still carries 3P units and two ICICI payment advices dated
 * 04/08/2026 name folios 3000048 and 3000049 for ₹52.49 Cr between them. Folio
 * 3000049 appears NOWHERE in this book: it has no account, and its only trace in
 * the whole archive is a filename on a payment receipt.
 *
 * The reason is read off each account's own zero rather than typed here, so a
 * drop that supplies the destination statement empties this row by itself.
 */
const zeroed = [...zeroedManagers].sort((a, b) => b.reviewMV - a.reviewMV);
const zeroedTotal = zeroed.reduce((t, m) => t + m.reviewMV, 0);
if (zeroed.length) {
  say("### F1. The part of the residual that is a MISSING DOCUMENT, not a price");
  say();
  say("A manager matched in C1 whose book value is **zero** while the review carries real money");
  say("is not market drift: its own statement reports nothing to value. Each of these belongs on");
  say("the ask list, and together they are a quantified slice of the residual above.");
  say();
  say("| Manager | Review MV | Book | What its own statement says |");
  say("| --- | ---: | ---: | --- |");
  for (const m of zeroed) {
    say(`| ${m.product} <br><sub>-> ${m.prov}</sub> | ₹${cr(m.reviewMV)} Cr | ₹0.00 Cr | ${ZERO_REASON.get(m.prov) ?? "the account reports no value at its statement date"} |`);
  }
  say();
  say(`**₹${cr(zeroedTotal)} Cr of the residual is this**, and it is the most actionable part of it:`);
  say("a price gap closes by itself next month, a missing statement never does.");
  say();
}
say("**THE REST OF THE RESIDUAL IS NOT A PLUG AND IS NOT ZERO.** It is the sum of three things");
say("this reconciliation can name but cannot yet quantify line by line, and saying so is the");
say("honest position — a bridge forced to zero would be a fabricated figure with a badge on it:");
say();
say("1. **Six weeks of market movement.** The review is struck 30 June; most of this book's");
say("   accounts are dated July or August, and the two ICICI-sourced accounts 31 March. Every");
say("   line in section C2 whose quantity ties exactly and whose value does not is this.");
say("2. **Partly-held names.** Nine direct-equity lines are held in this book at a smaller");
say("   quantity than the review carries — Clean Max at exactly half, Insolation short by the");
say("   91,000 shares that sit on the unreadable HDFC statement. The missing part of each is");
say("   already counted in step 2 above only where the WHOLE line was absent, never where part");
say("   of it is here.");
say("3. **Private holdings the review carries at cost and this book cannot value.** The");
say("   `Private Investments` tab prices every row at its cost; a depository row with no price");
say("   carries no value here at all.");
say();
say("Closing the residual line by line needs the statements in section D1. Until they arrive");
say("it stays stated rather than distributed across the book.");
say();

writeFileSync(OUT, L.join("\n") + "\n");
console.log(`${OUT}`);
console.log(`  review total      ₹${cr(reviewTotal)} Cr`);
console.log(`  book total        ₹${cr(bookTotal)} Cr`);
console.log(`  book ex-promoter  ₹${cr(bookExPromoter)} Cr`);
console.log(`  direct equity     ${tiedQty} of ${securityLines.length} tie exactly, ${partial} partial, ${over} book-holds-more, ${unvalued} unvalued, ${missing} absent`);
