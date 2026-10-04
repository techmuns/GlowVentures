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
/**
 * A PER-OWNER FIGURE DOES NOT DEDUPE, AND THIS ONE DID.
 *
 * CLAUDE.md states it plainly: "a consolidated figure counts each `dedupeGroup`
 * ONCE; a per-account or per-owner figure does not." Reading `CONSOLIDATED` here
 * broke that, and it broke it on the one holding in this book that makes the
 * error visible.
 *
 * Transition Venture Capital Fund I — Class A1 is reported under BOTH Bharat
 * Jaisinghani family trusts, ₹1,71,46,374.76 each, sharing one `dedupeGroup`.
 * Deduped, whichever trust sorted second lost its ONLY position — so section B
 * reported "Bharat Jaisinghani Family Trust III — *not in the book*" against a
 * book that holds ₹1.71 Cr for it, and the missing row silently joined the
 * "holders with no account in this book" step of the bridge.
 *
 * That is the same failure, in the same direction, that CLAUDE.md already
 * records once: deduping a per-account breakdown emptied Bharat's 360 ONE row to
 * `0 · ₹0 · ₹0` for an account holding ₹1.46 Cr. The consolidated TOTAL below
 * still dedupes, because that one is consolidated.
 */
function bookByOwner() {
  const m = new Map();
  for (const p of POSITIONS) {
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

/**
 * THE OTHER THREE ASSET TABS — Debt, Cash and Alternate, read line by line.
 *
 * `simpleSheetLines` used to sit here, defined and called by nothing: section C
 * had only ever examined the Equity tab, so ₹275.05 Cr of the review reached the
 * bridge untested and section F could state only the SIZE of that hole. It was
 * deleted rather than wired, because wiring it naively is worse than the gap —
 * it skipped rows starting "Product|Total|from Live|Note|Refer" and would have
 * counted every level of a nested tab at several times its own total.
 *
 * ── THE HEADING RULE, MEASURED RATHER THAN GUESSED ─────────────────────────
 *
 * These tabs have no investor column, which is what `equityLines` uses to tell a
 * heading from a holding. What they DO have is `Investment Date Range`, and it
 * separates them cleanly: a HOLDING was bought over a window and the cell reads
 * `Jul-25 - Jul-25`, `Sept 20 - March 24`, or the sheet's own `#N/A`. A HEADING
 * is not a purchase, so the cell is blank or carries a stray Excel date serial
 * (`43984`, `219849`) left over from a formula. Verified against all three tabs:
 * the rule classifies every one of their 30 rows the way a reader would.
 *
 * ── A HEADING WITH NO CHILDREN IS A LINE, NOT A SUBTOTAL ───────────────────
 *
 * This is the distinction that makes the tab add up. `Alternate` prints
 * `PE Funds ₹32.71 Cr` above six funds that sum to exactly that — a SUBTOTAL, to
 * be skipped in favour of its children. It also prints `Private Equity
 * ₹136.16 Cr` above nothing at all: that block's constituents live on the
 * `Private Investments` tab, and it is reported here only in aggregate. Skipping
 * it as a subtotal loses ₹136.16 Cr; counting the ones that DO have children
 * double-counts. So a heading is emitted as a line only where nothing itemises
 * it, and it is MARKED as an aggregate so no reader takes it for a holding.
 *
 * ── AND CONSECUTIVE IDENTICAL HEADINGS ARE ONE ─────────────────────────────
 *
 * `Alternate` prints `Private Equity ₹136.15930288800004` on two consecutive
 * rows, the second tagged `EG` in its left-hand column. Same block, restated
 * once with a tag; counted twice it invents ₹136.16 Cr.
 *
 * ── THE TAB'S OWN TOTAL IS THE WITNESS, AND A MISMATCH REFUSES THE TAB ──────
 *
 * Every rule above is a judgement about a layout, so none of them is trusted:
 * what is emitted must reproduce the tab's own printed `Total` row. On a
 * mismatch the tab yields NOTHING and says so, and section F goes back to
 * reporting its size — which is exactly the state before this existed, rather
 * than a set of lines nobody can check. Measured today all three reproduce their
 * printed total to the paisa.
 */
const ASSET_TABS = ["Debt", "Alternate", "Cash"];

function assetTabLines(name) {
  const rows = sheet(name);
  const cells = (r) => (r ?? []).map((x) => String(x ?? "").trim());

  // MATCH ON HEADER TEXT, NEVER ON COLUMN INDEX — `Alternate` has no Quantity
  // column at all, so every column after it sits one place left of where Debt
  // and Cash put it. A positional read returns the wrong column silently.
  let head = -1, col = {};
  for (let i = 0; i < rows.length && head < 0; i++) {
    const c = cells(rows[i]);
    if (!c.some((x) => /^Product$/i.test(x)) || !c.some((x) => /^Market Value$/i.test(x))) continue;
    head = i;
    c.forEach((label, k) => { if (label) col[label.toLowerCase()] = k; });
  }
  const need = ["product", "investment date range", "market value"];
  const missing = need.filter((k) => col[k] == null);
  if (head < 0 || missing.length) {
    return { name, lines: [], printedTotal: null, ok: false,
      why: head < 0 ? "no header row carrying both `Product` and `Market Value`"
        : `the header row does not carry ${missing.join(", ")}` };
  }

  const at = (c, k) => (col[k] == null ? "" : c[col[k]] ?? "");
  const isSerialOrBlank = (v) => !v || /^-?[\d.]+$/.test(v);

  let printedTotal = null;
  const raw = [];
  for (let i = head + 1; i < rows.length; i++) {
    const c = cells(rows[i]);
    const product = at(c, "product");
    if (!product || /^\*?Note[: ]|^from Live/i.test(product)) continue;
    const mv = num(at(c, "market value"));
    /**
     * A TAB'S HOLDINGS ARE THE ROWS ABOVE ITS OWN TOTAL, and stopping there is
     * what keeps the narrative out. `Debt` carries a "Debt Investment Plan /
     * Recommendation" table below its total — a second table, whose rows are
     * proposals ("Neo Special Credit Opportunities Fund — Add 20 Cr") and not
     * holdings; `Alternate` carries six `*Note:` lines whose text sits in the
     * PRODUCT column, so a keyword filter on that column misses them. Both are
     * ₹0 and would not have broken the tie-out, which is exactly why the tab
     * would have gone on listing them as holdings worth nothing.
     */
    if (/^Total$/i.test(product)) { printedTotal = mv; break; }
    raw.push({
      row: i + 1,
      product,
      qty: num(at(c, "quantity")),
      cost: num(at(c, "investment at cost")),
      mv,
      isHeading: isSerialOrBlank(at(c, "investment date range")),
    });
  }

  // Collapse a heading immediately restated with the same figure.
  const rowsOut = [];
  for (const r of raw) {
    const prev = rowsOut[rowsOut.length - 1];
    if (r.isHeading && prev?.isHeading && prev.product === r.product && prev.mv === r.mv) continue;
    rowsOut.push(r);
  }

  const lines = [];
  for (let i = 0; i < rowsOut.length; i++) {
    const r = rowsOut[i];
    if (!r.isHeading) { lines.push({ ...r, tab: name, section: null, aggregate: false }); continue; }
    let kids = 0;
    for (let j = i + 1; j < rowsOut.length && !rowsOut[j].isHeading; j++) kids++;
    if (kids) {                                    // a subtotal: its children carry it
      for (let j = i + 1; j <= i + kids; j++) rowsOut[j].section = r.product;
      continue;
    }
    lines.push({ ...r, tab: name, section: null, aggregate: true });   // nothing itemises it
  }

  const sum = lines.reduce((t, l) => t + (l.mv ?? 0), 0);
  const ok = printedTotal != null && Math.abs(sum - printedTotal) < 0.005;
  return { name, lines: ok ? lines : [], printedTotal, sum, ok,
    why: ok ? null : printedTotal == null ? "the tab prints no `Total` row to check against"
      : `the ${lines.length} line(s) read sum to ${cr(sum)} against the tab's own printed total of ${cr(printedTotal)}` };
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
/**
 * AN ACCOUNT AT ZERO BECAUSE IT WAS REDEEMED IS NOT A MISSING DOCUMENT.
 *
 * The first draft of F1 called every matched-manager zero "a missing document"
 * and put it on the ask list. 3P is the case that shows why that is wrong, and
 * its own statement settles it on page 2: Class B1 and B2 were reclassified INTO
 * Class B3 on 31-03-2026, and Class B3 was then `Full Units Redemption` on
 * 31-07-2026 for ₹31,05,82,835.17, payout to `HDFC0000084` — the exact figure
 * and the exact bank on the ICICI advice filed as `3P_Folio 3000048.pdf`.
 *
 * So the book's zero is CORRECT AND COMPLETE, the extractor's warning that
 * "where the units went is not on this document" is contradicted by page 2 of
 * that same document, and asking 3P for a statement would close nothing. The
 * real question is where ₹52.49 Cr of proceeds went after 04-08-2026.
 *
 * Read from the archive's own page text, so this row disappears by itself if a
 * later drop supersedes the statement.
 */
const EXITED = (() => {
  const m = new Map();
  let manifest;
  try { manifest = JSON.parse(readFileSync("public/audit/manifest.json", "utf8")); }
  catch { return m; }
  for (const d of manifest) {
    let text = "";
    try {
      const pj = JSON.parse(readFileSync(`public/audit/${d.docKey}/pages.json`, "utf8"));
      text = (pj.pages ?? []).map((p) => p.text ?? "").join("\n");
    } catch { continue; }
    // "31-07-2026 Full Units Redemption - - - (31,05,82,835.17)"
    const red = text.match(/(\d{2}-\d{2}-\d{4})\s+Full Units Redemption[^\n(]*\(([\d,]+\.\d{2})\)/);
    if (!red) continue;
    const amount = Number(red[2].replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    const bank = text.match(/Primary Bank Account\s*:\s*\S*\/\S*\/([A-Z][A-Z .]+?)\//)?.[1]?.trim() ?? "the registered bank account";
    const prev = m.get(d.provider);
    m.set(d.provider, {
      amount: (prev?.amount ?? 0) + amount,
      bank,
      detail: `**fully redeemed ${red[1]}** — the statement's own transaction history closes every class to nil`,
    });
  }
  return m;
})();

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
      const e = m.get(h.securityKey) ?? { qty: 0, docs: new Set(), faceValue: null, lastMovement: false };
      e.qty += h.quantity ?? 0;
      e.docs.add(d.docKey);
      if (h.faceValue != null) e.faceValue = h.faceValue;
      // A Motilal CDSL line's rate is the price of its LAST DEPOSITORY
      // MOVEMENT (Stage 10cz) — a price the statement did print, for a date
      // that is not the statement's, so "no price published" would be false.
      if (h.lastMovementRate != null) e.lastMovement = true;
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
  ["jaro-education", "jaro-institute-of-technology-management-and-research"],
  ["parth-electrical-and-engineering", "parth-electricals-and-engineering"],
  ["m-s-grand-continent-hotels", "grand-continent-hotels"],
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
say("**If you read one section, read G** — it answers the question this audit was commissioned");
say("for (*is invested capital too low, and does NAV follow?*), and **D1** is the list of");
say("documents to send the client. Everything between them is the evidence.");
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
/**
 * AND THE FOOTER MUST SAY WHY IT IS NOT THE HEADLINE TOTAL.
 *
 * This column is PER-OWNER, so it does not dedupe (see `bookByOwner`) and it
 * sums to the raw book. Section A's consolidated figure counts each
 * `dedupeGroup` once. Both are right on their own basis and they differ by
 * exactly the two duplicated holdings — a reader who adds this column and gets a
 * third answer has found the contradiction the allocation footer already cost
 * this book once, so the difference is stated here rather than left to be found.
 */
{
  const consolidatedSum = CONSOLIDATED.reduce((t, p) => t + p.marketValue, 0) / CR;
  const dd = bookSum - consolidatedSum;
  if (Math.abs(dd) > 0.005) {
    say(`This column is **per-owner and therefore does not dedupe** — each family member is shown`);
    say(`what their own statements report. It sums to ₹${cr(bookSum)} Cr against the consolidated`);
    say(`₹${cr(consolidatedSum)} Cr in section A, and the ₹${cr(dd)} Cr between them is the two holdings`);
    say("reported under two members each: 360 ONE Special Opportunities under both CRNs, and");
    say("Transition Venture Fund I under both Bharat family trusts. Counted once consolidated,");
    say("shown to both owners here. Neither figure is wrong; they answer different questions.");
    say();
  }
}
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

/**
 * THE OTHER THREE TABS JOIN THE SAME PIPELINE, rather than getting one of their
 * own. Every line below runs the identical manager match, then the identical
 * security match, then lands in C1, C2, D0 or D like an Equity line — because a
 * fund is a fund whichever tab the adviser filed it under, and a second pipeline
 * is a second chance for the two to disagree about one workbook.
 *
 * Wiring them corrected three rows in section E, which is the check that this was
 * a real gap rather than a tidy-up: Neo Infra (Debt), Baring PE and Transition
 * Venture (both Alternate) were all reported as holdings the review does not
 * carry, while the review carried every one of them on a tab nothing read.
 */
const assetTabs = ASSET_TABS.map(assetTabLines);
const assetRefused = assetTabs.filter((t) => !t.ok);
const assetLines = assetTabs.flatMap((t) => t.lines.map((l) => ({
  product: l.product,
  advisor: `${l.tab} tab`,
  investor: "",
  qty: l.qty,
  cost: l.cost,
  mv: l.mv,
  section: l.section,
  aggregate: l.aggregate,
  tab: l.tab,
  isSection: false,
})));

const products = [...eq.filter((l) => !l.isSection), ...assetLines]
  .filter((l) => l.mv != null && l.mv !== 0);
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
      verdict = `in the archive, **not valued** — ${qty(a.qty)} unit(s)${a.faceValue != null ? ` recorded at a face value of ${a.faceValue}`
        : a.lastMovement ? ", the statement's rate being the price of its last depository movement, not a mark" : ", no price published"}`;
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
// The book's holdings the review has no line for. Computed HERE because both
// section D (as an upper-bound caveat on the ask) and section E (as its own
// table) read it, and two copies would be two chances for the caveat and the
// table to disagree about the same positions.
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
const orphanByProvider = (prov) => orphan.reduce(
  (e, p) => (ACC.get(p.accountId)?.provider === prov ? { n: e.n + 1, mv: e.mv + p.marketValue } : e),
  { n: 0, mv: 0 });

/**
 * BEFORE CALLING A LINE MISSING, ASK WHETHER THE BOOK ALREADY CARRIES IT.
 *
 * `securityLines` — the Direct Equity and Unlisted sections — run the security
 * matcher and then the archive matcher, and the comment on ARCHIVE_KEYS says
 * exactly why: "telling a reader to go and find a statement that is already read
 * would be the absent-recorded-against-the-wrong-cause failure this repo keeps
 * meeting". `unmatchedLines` never ran either. Every line the review carries
 * outside those two sections and outside a named manager went STRAIGHT to
 * section D under the verdict "no statement in `source/` reports this" — a claim
 * nothing had tested.
 *
 * These are the review's fund and scheme lines, and the book demonstrably holds
 * some of them: it reads Motilal Oswal's demat statements, and those carry the
 * mutual-fund units the review lists under MOPWM. The cost of the defect is not
 * an arithmetic error in the bridge — the money is genuinely not in the book's
 * matched total either way — it is that the CLIENT ASK LIST in D1 asks for
 * documents already in hand.
 *
 * The same two tiers are applied here, in the same order, and a line that
 * resolves is reported in D0 instead of being asked for.
 */
const alreadyHeld = [];
const trulyAbsent = [];
for (const l of unmatchedLines) {
  const m = matchSecurity(l.product);
  const b = m.key ? BY_KEY.get(m.key) : null;
  if (b) { alreadyHeld.push({ l, b, how: m.how, where: "valued in the book" }); continue; }
  const am = matchInArchive(l.product);
  const a = am.key ? ARCHIVE_KEYS.get(am.key) : null;
  if (a) { alreadyHeld.push({ l, b: null, arch: a, how: am.how, where: "read, but carries no value" }); continue; }
  trulyAbsent.push(l);
}
if (alreadyHeld.length) {
  say("### D0. Review lines this book DOES carry — tested before being asked for");
  say();
  say("Each of these reached the missing list untested, because a review line outside the Direct");
  say("Equity and Unlisted sections never ran the security matcher. They are held here, so they are");
  say("reported rather than requested.");
  say();
  say("| Review line | Custodian / advisor | Review MV | Book | Joined |");
  say("| --- | --- | ---: | --- | --- |");
  for (const h of alreadyHeld.sort((x, y) => (y.l.mv ?? 0) - (x.l.mv ?? 0))) {
    const bookCell = h.b
      ? `₹${cr(h.b.mv / CR)} Cr <br><sub>${h.b.rows[0]?.security ?? "—"}${h.b.rows.length > 1 ? ` +${h.b.rows.length - 1} more row(s)` : ""}</sub>`
      : `— <br><sub>in the archive, ${qty(h.arch.qty)} unit(s), no value published</sub>`;
    say(`| ${h.l.product} | ${h.l.advisor || "—"} | ₹${cr(h.l.mv)} Cr | ${bookCell} | ${h.how} |`);
  }
  say();
  say(`**₹${cr(alreadyHeld.reduce((t, h) => t + (h.l.mv ?? 0), 0))} Cr of review lines were on the ask list and should not have been.**`);
  say();
}

/**
 * WHAT WOULD CLOSE THIS LINE, AND THE ANSWER IS DIFFERENT FOR AN AGGREGATE.
 *
 * The Equity tab names a custodian per line, which is what makes that half of
 * this joinable at all. The three asset tabs name none, so their lines are
 * routed on WHAT THE LINE IS instead: an AGGREGATE heading nothing itemises is
 * not a missing statement and must not be asked for as one — `Private Equity
 * ₹136.16 Cr` is a block whose constituents sit on the review's own
 * `Private Investments` tab, and asking a custodian for it would be asking for
 * a document nobody issues. A named fund is an AMC folio, and the document
 * that carries it is that AMC's account statement or a CAS, never a demat
 * holding statement — a depository moves units without a price (§precedence).
 */
const custodianNote = (l) => {
  const adv = l.advisor ?? "";
  if (l.aggregate) {
    return "**an AGGREGATE line, not a holding** — the review reports this block only as a total on the "
      + "`" + l.tab + "` tab and itemises it nowhere. Its constituents are on the review's own "
      + "`Private Investments` tab and in the family's investment register (`docs/REGISTER-RECONCILIATION.md`); no custodian issues "
      + "a statement for it, so this is not a document to ask for";
  }
  if (l.tab) {
    return `a fund line on the **${l.tab}** tab. What carries it is the AMC's own folio statement or a `
      + "consolidated account statement (CAS) — not a demat holding statement, which moves units without a price";
  }
  return /HDFC/i.test(adv) ? (/bharat/i.test(l.investor ?? "") && !/ajay/i.test(l.investor ?? "")
      ? "held at **HDFC Bank NSDL** — Bharat's statement is in `source/august-2026-e/` and is a SCAN with no text layer, so no reader can read it"
      : "held at **HDFC Bank** — no holding statement for Ajay's HDFC Bank demat is in the drop (Bharat's is a SCAN)")
    : /ICICI/i.test(adv) ? "the ICICI NSDL statement is read; this line is not on it, so it sits in another account"
    : /MOPWM|Motilal/i.test(adv) ? "held at **Motilal Oswal**; the drop carries a holding statement for three of its demat accounts and a transaction tape only for a fourth"
    : /Private/i.test(adv) ? "a private holding the review carries at cost; no statement in the drop values it"
    : "no statement in `source/` reports this holding";
};

/**
 * AND THE ONE DOCUMENT THAT WOULD CLOSE IT.
 *
 * A list of 21 holdings is something to read; a list of 3 documents is something
 * to ACT on. Hoisted beside `custodianNote` because BOTH the report below and
 * `src/data/reviewGaps.ts` read them: two copies would be two chances for the
 * ask list and the dashboard to name different documents for one line, which is
 * the drift `registerRead.mjs` was extracted to stop one workbook over.
 */
const askFor = (l) => {
  const adv = l.advisor ?? "";
  // An AGGREGATE is not a document anybody issues — see custodianNote. It is
  // counted apart so the ask list stays a list of things a client can send.
  return l.aggregate ? "NOTHING TO ASK FOR — an aggregate block the review itemises on another tab"
    : l.tab ? "AMC folio statements or a CAS for the mutual-fund and liquid holdings on the Debt / Cash / Alternate tabs"
    : /HDFC/i.test(adv) ? "HDFC Bank demat holding statements — Ajay's (none in the drop) and Bharat's **as a text PDF, not a scan**"
    : /ICICI/i.test(adv) ? "an ICICI Bank NSDL statement for the account this line sits in"
    : /MOPWM|Motilal/i.test(adv) ? "Motilal Oswal holding statements for the demat and PWM accounts not in the drop"
    : /Private/i.test(adv) ? "a valuation for the private holdings the review carries at cost"
    : "a statement from whoever holds this";
};

say("## D. What the review carries that this book does not — and what would close it");
say();
if (!notInBook.length && !trulyAbsent.length) {
  say("Nothing: every review line matched a manager or a security in the book.");
} else {
  say("| Review line | Custodian / advisor | Review MV | Why it is not here |");
  say("| --- | --- | ---: | --- |");
  for (const l of [...notInBook, ...trulyAbsent].sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0)))
    say(`| ${l.product} | ${l.advisor || "—"} | ₹${cr(l.mv)} Cr | ${custodianNote(l)} |`);
  gapNoStatement = [...notInBook, ...trulyAbsent].reduce((s, l) => s + (l.mv ?? 0), 0);
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
  for (const l of [...notInBook, ...trulyAbsent]) {
    const k = askFor(l);
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
  say();
  /**
   * AND THE MOTILAL ASK IS AN UPPER BOUND, BECAUSE THE DEPOSITORY ABBREVIATES.
   *
   * D0 above tests every line against the book and the archive and joins none of
   * these — correctly, because no tier here guesses. But the book DOES hold
   * Motilal demat fund positions the review has no match for, and the names make
   * it obvious why neither side joins: the depository clips a scheme to
   * `WOC MAAF D-GROW` and `ICICI IOPPF D-GRW` where the review writes
   * "WhiteOak Capital Multi Asset Allocation Fund-Direct(G)" and "ICICI Pru
   * India Opportunities Fund". Neither string prefixes the other and no rule
   * short of a committed alias can bridge them.
   *
   * So the two lists overlap by an amount nobody can yet state, and the honest
   * thing is to say so with both figures rather than let the ask read as fully
   * incremental. `stripDepositoryTail` already exists for exactly this family of
   * name; what is missing is an ABBREVIATION table, which is a hand-checked
   * artefact and not something to infer.
   */
  // Same precedence D1 groups on — HDFC first — or a line advised
  // "HDFC Bank / MOPWM" is counted against both asks at once.
  const mopwmAsk = [...notInBook, ...trulyAbsent]
    .filter((l) => !/HDFC/i.test(l.advisor ?? "") && /MOPWM|Motilal/i.test(l.advisor ?? ""))
    .reduce((t, l) => t + (l.mv ?? 0), 0);
  const demat = orphanByProvider("Motilal Oswal Financial Services (demat)");
  if (mopwmAsk > 0 && demat.mv > 0) {
    say(`**THE MOTILAL FIGURE IS AN UPPER BOUND.** The book already carries **₹${cr(demat.mv / CR)} Cr`);
    say(`across ${demat.n} Motilal demat positions** that no review line matches (section E), against`);
    say(`the ₹${cr(mopwmAsk)} Cr asked for here. The two lists certainly overlap: the depository clips a`);
    say("scheme name to `WOC MAAF D-GROW` and `ICICI IOPPF D-GRW` where the review writes them out in");
    say("full, so neither string prefixes the other and no tier above may join them. Closing that gap");
    say("needs a hand-checked ABBREVIATION table, not another statement — and until it exists the");
    say("incremental value of this ask is smaller than the figure printed, by an amount nobody here");
    say("can responsibly state.");
    say();
  }
}
say();

// ── E. what the book carries and the review does not ───────────────────────
say("## E. What this book carries that the review does not");
say();
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
/**
 * THE AGGREGATE BLOCK IS COUNTED APART EVERYWHERE IT APPEARS, because it is a
 * different KIND of gap. Every other line in section D is a holding some
 * institution can send a statement for. `Private Equity ₹136.16 Cr` is not: the
 * review reports it only as a total, itemises it on its own `Private
 * Investments` tab, and no custodian issues a document for a block. Read by
 * section G, by the D1 ask list and by the bridge, from one place.
 */
const aggregateLines = [...notInBook, ...trulyAbsent].filter((l) => l.aggregate);
const aggregateTotal = aggregateLines.reduce((t, l) => t + (l.mv ?? 0), 0);

/**
 * ── G. THE QUESTION THIS AUDIT WAS ASKED ───────────────────────────────────
 *
 * "Invested capital is incorrect and should be higher, and THUS consolidated NAV
 * will also be higher."
 *
 * The first half is right and is measured below. The second half does not follow,
 * and the distinction is the single most useful thing in this document, because
 * the two halves need DIFFERENT documents to fix:
 *
 *   NAV      = Σ marketValue    over every position
 *   Invested = Σ costBasis      over the positions that report one
 *
 * They are different columns over different subsets. A position the book already
 * carries at its market value but with NO COST is understating invested capital
 * by its whole cost and understating NAV by nothing at all — supplying its
 * contract note moves the first and cannot move the second by a rupee. Only a
 * holding that is ABSENT ENTIRELY moves both.
 *
 * So the gap is split on exactly that line, and each half is given the document
 * that closes it.
 */
const reviewCost = (() => {
  // Each tab's own cost total, read from the tab's own total row — never summed
  // from the leaves, which is the headline-row rule the ingest already follows.
  const out = [];
  for (const t of assetTabs) {
    const rows = sheet(t.name);
    let head = -1, col = {};
    for (let i = 0; i < rows.length && head < 0; i++) {
      const c = rows[i].map((x) => String(x ?? "").trim());
      if (c.some((x) => /^Product$/i.test(x)) && c.some((x) => /^Market Value$/i.test(x))) {
        head = i; c.forEach((l, k) => { if (l) col[l.toLowerCase()] = k; });
      }
    }
    const tot = rows.slice(head + 1).find((r) => /^Total$/i.test(String(r?.[col.product] ?? "").trim()));
    out.push([t.name, tot && col["investment at cost"] != null ? num(tot[col["investment at cost"]]) : null]);
  }
  /**
   * THE EQUITY TAB PRINTS NO `Total` ROW — its grand total is the last SECTION
   * row, labelled `Equity`. That is identified by TYING IT to the Asset
   * Allocation tab's own Equity figure rather than by taking the last row, so a
   * re-ordered sheet fails loudly instead of reporting a section as the total.
   */
  const eqAlloc = alloc.find((r) => /^Equity$/i.test(r.label))?.mv ?? null;
  const eqTotal = eq.find((l) => l.isSection && eqAlloc != null && Math.abs((l.mv ?? -1) - eqAlloc) < 0.005) ?? null;
  out.unshift(["Equity", eqTotal?.cost ?? null]);
  return { rows: out, total: out.every(([, v]) => v != null) ? out.reduce((t, [, v]) => t + v, 0) : null };
})();

const costed = CONSOLIDATED.filter((p) => p.costBasis != null);
const costless = CONSOLIDATED.filter((p) => p.costBasis == null);
const bookInvested = costed.reduce((t, p) => t + p.costBasis, 0) / CR;
const costlessMV = costless.reduce((t, p) => t + p.marketValue, 0) / CR;
const absentValue = gapNoStatement - aggregateTotal;

say("## G. Invested capital — the client's own question, answered");
say();
say("> *\"the invested capital is incorrect and should be higher, and thus consolidated NAV will");
say("> also be higher\"*");
say();
say("**The first half is right. The second does not follow from it**, and separating them is the");
say("most actionable thing here, because the two halves need different documents.");
say();
say("| | |");
say("| --- | ---: |");
say(`| Review, invested at cost (its own tab totals) | **₹${cr(reviewCost.total)} Cr** |`);
say(`| Book, invested at cost | **₹${cr(bookInvested)} Cr** |`);
say(`| **Shortfall** | **₹${cr((reviewCost.total ?? 0) - bookInvested)} Cr** |`);
say();
say("Per tab, so the shortfall can be attributed rather than asserted:");
say();
say("| Review tab | Invested at cost |");
say("| --- | ---: |");
for (const [n, v] of reviewCost.rows) say(`| ${n} | ${v == null ? "**not printed**" : "₹" + cr(v) + " Cr"} |`);
say(`| **Total** | **${reviewCost.total == null ? "—" : "₹" + cr(reviewCost.total) + " Cr"}** |`);
say();
say("### G1. The shortfall has two halves, and only one of them moves NAV");
say();
say("```");
say("  NAV      = the sum of marketValue over EVERY position");
say("  Invested = the sum of costBasis   over the positions that REPORT one");
say("```");
say();
say("They are different columns over different subsets, which is why the client's inference");
say("does not hold in general. Split on exactly that line:");
say();
say("| Cause | Invested | NAV | Size |");
say("| --- | :---: | :---: | ---: |");
say(`| **A. Held, valued, and no cost reported** — ${costless.length} of ${CONSOLIDATED.length} positions | understated | **not affected** | ₹${cr(costlessMV)} Cr of market value already in NAV |`);
say(`| **B. Not in the book at all** — section D | understated | understated | ₹${cr(absentValue)} Cr at the review's marks |`);
say(`| **C. An aggregate block the review itemises nowhere** | understated | understated | ₹${cr(aggregateTotal)} Cr at the review's marks |`);
say();
say("**CAUSE A IS THE WHOLE OF WHY INVESTED CAPITAL LOOKS WRONG WITHOUT NAV LOOKING WRONG.**");
say(`Every one of those ${costless.length} positions is in a DEPOSITORY account:`);
say();
say("| Account | Costless rows | Their market value |");
say("| --- | ---: | ---: |");
{
  const byAcct = new Map();
  for (const p of costless) {
    const e = byAcct.get(p.accountId) ?? { n: 0, mv: 0 };
    e.n++; e.mv += p.marketValue; byAcct.set(p.accountId, e);
  }
  for (const [id, e] of [...byAcct].sort((a, b) => b[1].mv - a[1].mv)) {
    const a = ACC.get(id);
    say(`| ${a?.provider ?? id} ${a?.accountNo ?? ""} | ${e.n} | ₹${cr(e.mv / CR)} Cr |`);
  }
}
say();
say("A depository holds the shares; it did not buy them, so its statement prints ISIN, quantity,");
say("rate and value and **no cost**. That is not a parsing failure and not a missing join —");
say("across the WHOLE audit archive not one of those (account, security) pairs carries a cost on");
say("any record type. The dashboard renders `—` there, with the custodian named, and that is the");
say("honest answer until a contract note arrives.");
say();
say("**WHAT WOULD CLOSE CAUSE A:** a transaction statement or contract note from **ICICI Bank**");
say("and **Motilal Oswal** for those accounts — the buy prices, not another holding statement.");
say("The family's own investment register already covers part of it: `npm run reconcile:register`");
say("measures which, in `docs/REGISTER-RECONCILIATION.md`.");
say();
say("**AND CAUSE A CANNOT RAISE NAV.** Those rows are already in the ₹" + cr(SUMMARY.totalValue / CR) + " Cr at their");
say("statement marks. Supplying their cost raises invested capital, lowers the reported return on");
say("cost, and leaves NAV where it is. NAV rises only on B and C — the holdings that are absent.");
say();

say("## F. The bridge — review total to book total");
say();
say("A reconciliation that does not close is an anecdote. This one closes to a residual that");
say("is NAMED rather than plugged: no step below is fitted to make the arithmetic work.");
say();
// The aggregate block gets its OWN step rather than being folded into "lines no
// statement reports": that would put the largest single number on the ask list
// behind a request nobody can fulfil. See its declaration above section G.
const steps = [
  ["Review portfolio total, 30 June 2026", reviewTotal, null],
  ["less: holders with no account in this book", -absentHolders,
    "Hope India Trust (a separate taxpayer, held out by decision) and the Bharat Jaisinghani family trusts whose statements the drop does not carry"],
  ["less: aggregate blocks the review itemises nowhere", -aggregateTotal,
    `${aggregateLines.map((l) => "`" + l.product + "`").join(", ") || "—"} — reported on the \`Alternate\` tab as a total only. Not a missing statement: see \`docs/REGISTER-RECONCILIATION.md\`, which measures the family's own record of this money`],
  ["less: lines no statement in `source/` reports", -(gapNoStatement - aggregateTotal),
    "section D — the Motilal Oswal, HDFC Bank and AMC statements that have not been supplied"],
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
  say("### F1. The part of the residual where the money LEFT, and is not a price");
  say();
  say("A manager matched in C1 whose book value is **zero** while the review carries real money is");
  say("not market drift — its own statement reports nothing to value. But zero has two very");
  say("different causes and they lead to opposite actions, so the statement is read for which:");
  say();
  say("| Manager | Review MV, 30 Jun | Book | What its own statement says | Action |");
  say("| --- | ---: | ---: | --- | --- |");
  for (const m of zeroed) {
    const exited = EXITED.get(m.prov);
    const action = exited
      ? `**follow the money, do not ask for a statement** — ₹${cr(exited.amount / CR)} Cr was paid out to ${exited.bank}`
      : "ask the manager for a current statement";
    say(`| ${m.product} <br><sub>-> ${m.prov}</sub> | ₹${cr(m.reviewMV)} Cr | ₹0.00 Cr | ${exited ? exited.detail : (ZERO_REASON.get(m.prov) ?? "the account reports no value at its statement date")} | ${action} |`);
  }
  say();
  say(`**₹${cr(zeroedTotal)} Cr of the residual is this.** Where a statement records a REDEMPTION the`);
  say("book's zero is correct and complete, and the open question is not the manager's paperwork but");
  say("**where the proceeds went** — cash that left one account and has to have landed in another.");
  say("Asking the manager to re-send a statement they have already sent correctly would close");
  say("nothing. Where no redemption is recorded, the manager's current statement is the ask.");
  say();
}
/**
 * F2 USED TO REPORT A HOLE, AND NOW REPORTS THE MEASUREMENT THAT CLOSED IT.
 *
 * Section C matched line by line against the EQUITY tab only, so the Debt,
 * Alternate and Cash tabs could appear in neither the matched total nor section
 * D and fell straight into the residual — ₹275.05 Cr of it, against a residual
 * of ₹263.10 Cr, which is to say the bridge could not tell whether the tabs
 * explained all of it, none of it or something between.
 *
 * `assetTabLines` reads all three now, and every printed total below is read
 * from the tab's OWN `Total` row rather than re-derived — the same rule
 * `amfi.mjs` follows for a headline row, and the witness for everything above.
 */
say("### F2. Every tab IS line-matched now, and each ties to its own printed total");
say();
say("This section used to report a hole: section C read the **Equity tab only**, so the Debt,");
say("Alternate and Cash tabs reached the bridge untested and only their SIZE could be stated.");
say("All three are read line by line now, through the same manager and security matchers as the");
say("Equity tab — a fund is a fund whichever tab the adviser filed it under.");
say();
say("**A heading is told from a holding by `Investment Date Range`.** A holding was bought over a");
say("window (`Jul-25 - Jul-25`); a heading is not a purchase, so the cell is blank or carries a");
say("stray Excel serial. A heading whose children sum to it is a SUBTOTAL and is skipped in favour");
say("of them; a heading nothing itemises is an AGGREGATE line and is carried, marked as one.");
say();
say("| Review tab | Lines read | They sum to | Its own printed total | |");
say("| --- | ---: | ---: | ---: | --- |");
for (const t of assetTabs) {
  say(`| ${t.name} | ${t.ok ? t.lines.length : "—"} | ${t.ok ? "₹" + cr(t.sum) + " Cr" : "—"} | ₹${cr(t.printedTotal)} Cr | ${t.ok ? "**ties**" : "**REFUSED** — " + t.why} |`);
}
say(`| **All three** | **${assetTabs.reduce((n, t) => n + (t.ok ? t.lines.length : 0), 0)}** | | **₹${cr(assetTabs.reduce((v, t) => v + (t.printedTotal ?? 0), 0))} Cr** | |`);
say();
say("**THE TAB'S OWN TOTAL IS THE WITNESS.** Every rule above is a judgement about a layout, so");
say("none is trusted: what is read must reproduce the tab's printed `Total`. A tab that does not");
say("yields NOTHING and says so here — a set of lines nobody can check is worse than a gap that is");
say("honestly measured, which is the state this section used to describe for all three.");
say();
if (assetRefused.length) {
  say(`**${assetRefused.length} tab(s) fail that check and contribute no lines**, so their value is back in the`);
  say("residual untested. Fix the heading rule for them before reading anything above.");
  say();
}
say("What reading them corrected — which is the check that this was a real gap and not a tidy-up:");
say();
say("- **Three rows left section E.** Neo Infra (Debt), Baring PE and Transition Venture (both");
say("  Alternate) were reported as holdings the review does not carry, while the review carried");
say("  every one of them on a tab nothing read.");
say("- **Five managers joined C1** — India SME, Sky Capital, Neo Infra, Transition Venture and");
say("  Baring PE — two of them the ₹0 case F1 exists for.");
say("- **The DSP Gold and Silver ETFs joined D0**: held in the book through the Motilal demat, and");
say("  on the client ask list until this ran.");
say("- **The residual fell from −₹263.10 Cr to what section F now prints.**");
say();

say("**THE REST OF THE RESIDUAL IS NOT A PLUG AND IS NOT ZERO.** It is the sum of three things");
say("this reconciliation can name but cannot yet quantify line by line, and saying so is the");
say("honest position — a bridge forced to zero would be a fabricated figure with a badge on it:");
say();
say("1. **Six weeks of market movement.** The review is struck 30 June; most of this book's");
say("   accounts are dated July or August, and the two ICICI-sourced accounts 31 March. Every");
say("   line in section C2 whose quantity ties exactly and whose value does not is this.");
say("2. **Partly-held names.** Nine direct-equity lines are held in this book at a smaller");
say("   quantity than the review carries — Clean Max at exactly half (Ankita's 94,967 are kept as a");
say("   quantity at the family's decision), Insolation short by Bharat's 91,260 shares, which the review");
say("   places at ICICI Bank in an account no statement in the drop covers. The missing part of each is");
say("   already counted in step 2 above only where the WHOLE line was absent, never where part");
say("   of it is here.");
say("3. **Private holdings the review carries at cost and this book cannot value.** The");
say("   `Private Investments` tab prices every row at its cost; a depository row with no price");
say("   carries no value here at all.");
say();
say("Closing the residual line by line needs the statements in section D1. Until they arrive");
say("it stays stated rather than distributed across the book.");
say();

/**
 * ── H. EVERY CLOSING THE REVIEW PRINTS, HOLDER BY HOLDER ──────────────────
 *
 * *"Make sure all the newly added and old data on the dashboard is as per this
 *  consolidated excel file."* Sections A–G compare the review's TOTALS and its
 * tab lines against the book. This one goes a level down: the review's own
 * `Transactions since inception` tab ends every holding with a `Closing` row —
 * one holder, one product, one date, the units and the value the adviser
 * carried — and each is set against THE SAME HOLDER'S OWN STATEMENTS.
 *
 * Four rules keep it a measurement rather than a resemblance:
 *
 * - **THE HOLDER IS PART OF THE JOIN.** A unit count that ties on somebody
 *   else's statement is a coincidence, not a witness.
 * - **THE PRODUCT IS JOINED BY IDENTIFIER WHERE ONE EXISTS** — the ISINs
 *   `src/lib/reviewGaps.ts` commits per review line (mirrored here, never
 *   imported, so the report and the dashboard are two derivations), then this
 *   reconciler's own name tiers, widened to every key that carries one of the
 *   ISINs found. That is how Helios's AMC folio and its depository spelling
 *   meet. There is no fuzzy tier.
 * - **ACCOUNT BY ACCOUNT, AT THE CLOSING'S OWN DATE.** A depository balance on
 *   that exact day (the tape's own running balance) is used where a window
 *   covers it; otherwise the statement nearest the date, preferring an earlier
 *   one, and the gap in days is printed. A statement of another date is carried
 *   to the review's date over the units its own dated record shows moving between
 *   (`H_MOVES`), and an account whose record shows it held nothing then is not
 *   that closing's statement. Where one holder's product is split
 *   across two closings (Deepak Fertilisers at HDFC Bank and at Motilal Oswal),
 *   an account one closing ties to is not offered to the other.
 * - **UNITS TIE TO THE THIRD DECIMAL THE STATEMENTS PRINT.** A value-only line
 *   (a PMS mandate) ties where the holder's statement from that manager PRINTS
 *   the review's figure; those printed totals include accrued income and
 *   declared dividends, which this book keeps out of market value (§4b).
 *
 * The review is still not a source: nothing here reaches `glowData.ts` or
 * `src/data/reviewGaps.ts`, and every figure below is labelled by whose it is.
 */
const H_ROWS = sheet("Transactions since inception");
const hSerial = (v) => (/^\d+(\.\d+)?$/.test(String(v ?? "").trim())
  ? new Date(Date.UTC(1899, 11, 30) + Number(v) * 864e5).toISOString().slice(0, 10) : String(v ?? "").trim());
const H_CLOSINGS = [];
H_ROWS.forEach((r, i) => {
  const c = (r ?? []).map((x) => String(x ?? "").trim());
  if (i < 4 || c[6] !== "Closing") return;
  H_CLOSINGS.push({ row: i + 1, investor: c[1], advisor: c[2], tab: c[3], product: c[5],
    date: hSerial(c[7]), qty: num(c[8]), qtyDp: (String(c[8]).split(".")[1] ?? "").length, rate: num(c[9]), value: num(c[10]) });
});
const H_OWNER = new Map([
  ["Aarti Ajay Jaisinghani", "aarti-jaisinghani"], ["Ajay Jaisinghani", "ajay-jaisinghani"],
  ["Ankita Jaisinghani", "ankita-jaisinghani"], ["Bharat Jaisinghani", "bharat-jaisinghani"],
  ["Bharat Jaisinghani Family Trust II", "bharat-jaisinghani-family-trust-2"],
  ["Bharat Jaisinghani Family Trust III", "bharat-jaisinghani-family-trust-3"],
  ["Bharat Jaisinghani Family Trust", "bharat-jaisinghani-family-trust"],
]);
/** Mirror of `REVIEW_LINE_ISINS` in src/lib/reviewGaps.ts — kept in step by hand, on purpose. */
const H_LINE_ISINS = new Map([
  ["Motilal Oswal Arbitrage Fund Direct (G)", ["INF247L01ED1"]], ["HDFC Liquid Fund -Direct(G)", ["INF179KB1HP9"]],
  ["Aditya Birla SL Balanced Advantage Fund(G)", ["INF084M01AB8"]],
  ["Bandhan Large & Mid Cap Fund - Direct Plan - Growth", ["INF194K01V89"]],
  ["ICICI Pru India Opportunities Fund", ["INF109KC1RH9"]], ["ICICI Prudential Equity Savings Fund - Direct Plan", ["INF109KA11J9"]],
  ["Kotak Large & Midcap Fund - Direct- Growth", ["INF174K01LF9"]], ["Kotak Multicap Fund-Direct Plan-Growth", ["INF174KA1HV3"]],
  ["IFB Inds.", ["INE559A01017"]], ["NLC INDIA", ["INE589A01014"]], ["Zepto", ["INE143403066", "INE143401029"]],
  ["Nippon India ETF Nifty 1D Rate Liquid Bees-IDCW", ["INF732E01037"]],
  ["HDFC Balanced Advantage Fund", ["INF179K01830", "INF179K01WA6"]], ["ICICI Pru Balanced Advantage Fund", ["INF109K012B0"]],
  ["ICICI Pru Liquid Fund-Direct(G)", ["INF109K01Q49"]], ["WhiteOak Capital Multi Asset Allocation Fund-Direct(G)", ["INF03VN01761"]],
  ["Invesco India Arbitrage Fund-Direct(G)", ["INF205K01KR8"]],
]);
const hUp = (s) => String(s ?? "").trim().toUpperCase();
/** A report type the classifier could not name is still a statement — never printed as "unknown of <date>". */
const hKind = (t) => (!t || t === "unknown" ? "statement" : t);
const hOwnerOfAccount = new Map(ACCOUNTS.map((a) => [a.accountId, a.ownerId]));
const hEngagement = new Map(ACCOUNTS.map((a) => [a.accountId, a.engagement]));
const hProviderOf = new Map(ACCOUNTS.map((a) => [a.accountId, a.provider]));
const hNameKey = (s) => securityKeyOf(String(s ?? "").split("#")[0]);
const hAccountOf = (provider, accountNo) => ACCOUNTS.find((a) => a.provider === provider && a.accountNo === accountNo)?.accountId ?? `${provider} ${accountNo}`;
const H_DOCS = new Map();
const hDoc = (k) => { if (!H_DOCS.has(k)) { try { H_DOCS.set(k, JSON.parse(readFileSync(`public/audit/${k}/document.json`, "utf8"))); } catch { H_DOCS.set(k, {}); } } return H_DOCS.get(k); };
const H_MANIFEST = (() => { try { return JSON.parse(readFileSync("public/audit/manifest.json", "utf8")); } catch { return []; } })();
/** Every holding row any statement in the archive prints, with whose and when. */
const H_ROWS_ARCHIVE = [];
for (const d of H_MANIFEST) {
  if (!d.ownerId || !d.asOf) continue;
  for (const h of hDoc(d.docKey).holdings ?? []) {
    if (typeof h.quantity !== "number") continue;
    H_ROWS_ARCHIVE.push({ ownerId: d.ownerId, key: h.securityKey ?? null, isin: hUp(h.isin), units: h.quantity, provider: d.provider, nameKey: hNameKey(h.security),
      date: d.asOf, account: hAccountOf(d.provider, d.accountNo), how: `${d.provider} ${d.accountNo}, ${hKind(d.reportType)} of ${d.asOf}` });
  }
}
const H_WINDOWS = Object.values(grab(src, "BOOK_SHARE_MOVEMENTS"));
/** The depository's own balance on `date`, read off the tape's running balance — the same date, never the nearest. */
function hBalancesOn(date) {
  const out = [];
  for (const w of H_WINDOWS) {
    if (w.reason != null || !w.source || !w.periodFrom || !w.periodTo || date < w.periodFrom || date > w.periodTo) continue;
    const isin = hUp(w.isin);
    const before = (hDoc(w.source).transactions ?? []).filter((t) => hUp(t.isin) === isin && (t.date ?? "") <= date);
    const printed = before.length ? /balance ([\d.,]+)/.exec(before[before.length - 1].description ?? "")?.[1] : null;
    const units = before.length ? Number(String(printed ?? "").replace(/,/g, "")) : w.opening;
    if (!Number.isFinite(units)) continue;
    // The tape's next printed balance after the day, so a difference says when it ended.
    const after = (hDoc(w.source).transactions ?? []).find((t) => hUp(t.isin) === isin && (t.date ?? "") > date
      && Number(String(/balance ([\d.,]+)/.exec(t.description ?? "")?.[1] ?? "").replace(/,/g, "")) !== units);
    const nextBal = after ? /balance ([\d.,]+)/.exec(after.description ?? "")?.[1] : null;
    out.push({ ownerId: hOwnerOfAccount.get(w.accountId) ?? null, key: w.securityKey, isin, units, date, provider: hProviderOf.get(w.accountId) ?? "", nameKey: hNameKey(w.security),
      account: w.accountId, how: `the depository's own balance on ${date} (${w.accountId.replace(/^.*-(\d{6,})$/, "a/c $1")})`
        + (nextBal ? `; next printed balance ${hUnits(Number(nextBal.replace(/,/g, "")))} on ${after.date}` : "") });
  }
  return out;
}
/**
 * UNITS THAT MOVED BETWEEN A STATEMENT'S DATE AND THE REVIEW'S. A fund's own
 * dated record (`BOOK_CAPITAL_MOVES`, units signed) and a broker's own buys and
 * sells on an Execution or Direct account. A depository's tape is not read here:
 * `hBalancesOn` already reads its running balance. A trade two issues of one tape
 * both print counts once, by the ordinal rule `datedRowsAcross` uses.
 */
const H_MOVES = (() => {
  const out = [];
  for (const m of grab(src, "BOOK_CAPITAL_MOVES")) {
    if (typeof m.units === "number" && m.units !== 0) out.push({ account: m.accountId, key: m.securityKey ?? null, isin: "", date: m.date, units: m.units, label: m.label });
  }
  const counts = new Map();
  for (const d of H_MANIFEST) {
    if (!/transaction/.test(d.reportType ?? "")) continue;
    const account = hAccountOf(d.provider, d.accountNo);
    if (!["Execution", "Direct"].includes(hEngagement.get(account))) continue;
    const seen = new Map();
    for (const t of hDoc(d.docKey).transactions ?? []) {
      if (!["buy", "sell"].includes(t.side) || typeof t.quantity !== "number" || !t.date) continue;
      const sig = [account, t.date, t.side, Math.abs(t.quantity), t.securityKey].join("|");
      const n = (seen.get(sig) ?? 0) + 1;
      seen.set(sig, n);
      if (n <= (counts.get(sig) ?? 0)) continue;
      counts.set(sig, n);
      out.push({ account, key: t.securityKey ?? null, isin: hUp(t.isin), date: t.date,
        units: t.side === "sell" ? -Math.abs(t.quantity) : Math.abs(t.quantity), label: t.side === "sell" ? "sold" : "bought" });
    }
  }
  return out;
})();
/** A statement's units carried to `date` over the moves dated between the two; null where nothing moved. */
function hRolled(r, date, keys, isins) {
  if (r.date === date) return null;
  const lo = r.date < date ? r.date : date, hi = r.date < date ? date : r.date;
  const between = H_MOVES.filter((m) => m.account === r.account && ((m.key && keys.has(m.key)) || (m.isin && isins.has(m.isin)))
    && m.date > lo && m.date <= hi).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!between.length) return null;
  const net = between.reduce((s, m) => s + m.units, 0);
  return { units: r.date < date ? r.units + net : r.units - net, between };
}
const hMovesText = (roll) => roll.between.map((m) => `${m.units < 0 ? "−" : "+"}${hUnits(Math.abs(m.units))} ${m.label.toLowerCase()} ${m.date}`).join(", ");
/** Within the third decimal the statements print, or the review's own rounding where it printed fewer. */
const hSame = (a, b, dp = 3) => Math.abs(a - b) < Math.max(0.001, 0.5 * 10 ** -Math.min(dp, 3) + 1e-9);
const hDays = (a, b) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 864e5);
/** Keys and ISINs one review product names, widened through each other. */
function hIdentity(product) {
  const keys = new Set(), isins = new Set(H_LINE_ISINS.get(product) ?? []);
  for (const m of [matchInArchive(product), matchSecurity(product)]) if (m.key) keys.add(m.key);
  for (const r of H_ROWS_ARCHIVE) if (keys.has(r.key) && r.isin) isins.add(r.isin);
  for (const w of H_WINDOWS) if (keys.has(w.securityKey) && w.isin) isins.add(hUp(w.isin));
  for (const r of H_ROWS_ARCHIVE) if (r.isin && isins.has(r.isin) && r.key) keys.add(r.key);
  return { keys, isins };
}
const hInd = (x, dp) => { const [i, f] = Math.abs(x).toFixed(dp).split("."); const a = i.length > 3 ? i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + i.slice(-3) : i; return a + (f ? "." + f : ""); };
const hWest = (x, dp) => { const [i, f] = Math.abs(x).toFixed(dp).split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); };
/** Where a manager's own statement for this holder PRINTS the review's figure. */
function hPrintedBy(ownerId, provider, value) {
  const forms = new Set();
  for (const dp of [0, 2]) if (Math.abs(Number(value.toFixed(dp)) - value) < 0.005) { forms.add(hInd(value, dp)); forms.add(hWest(value, dp)); }
  const hits = [];
  for (const d of H_MANIFEST) {
    if (d.ownerId !== ownerId || d.provider !== provider) continue;
    let text = "";
    try { text = (JSON.parse(readFileSync(`public/audit/${d.docKey}/pages.json`, "utf8")).pages ?? []).map((p) => p.text ?? "").join("\n"); } catch { continue; }
    for (const f of forms) if (new RegExp(`(^|[^\\d,.])${f.replace(/\./g, "\\.")}(?![\\d]|[.,]\\d)`).test(text)) { hits.push(d); break; }
  }
  return hits.sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}
const hUnits = (x) => (x == null ? "—" : x.toLocaleString("en-IN", { maximumFractionDigits: 4 }));
const hRupees = (x) => (x == null ? "—" : `₹${x.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

const hResults = [];
const hClaimed = new Set(); // owner|account|key-group an earlier closing tied to
const hOrdered = [...H_CLOSINGS].sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0));
for (const pass of ["tie", "rest"]) for (const c of hOrdered) {
  if (hResults.some((r) => r.c === c)) continue;
  const ownerId = H_OWNER.get(c.investor) ?? null;
  const put = (verdict, statement) => hResults.push({ c, verdict, statement });
  if (/hope india/i.test(c.investor)) { if (pass === "rest") put("kept out", "HOPE INDIA TRUST is a separate taxpayer this book keeps out by decision; its folio statements are read and named in `docs/BOOK-REPORT.md`"); continue; }
  if (!ownerId) { if (pass === "rest") put("unresolved holder", `"${c.investor}" names no member of this book`); continue; }
  if (!c.qty && !c.value) { if (pass === "rest") put("nil", "the review carries nil — nothing to reconcile"); continue; }
  if (!c.qty) {
    if (pass === "tie") continue;
    const provider = providerFor(c.product);
    const hits = provider ? hPrintedBy(ownerId, provider, c.value) : [];
    if (hits.length) put("ties (printed total)", `printed on ${hits.length} of the holder's ${provider} statements, first ${hKind(hits[0].reportType)} of ${hits[0].asOf}; a manager's printed total includes accrued income and declared dividends, which this book keeps out of market value`);
    else if (provider) {
      const near = H_MANIFEST.filter((d) => d.ownerId === ownerId && d.provider === provider && d.asOf).map((d) => d.asOf).sort((a, b) => hDays(a, c.date) - hDays(b, c.date))[0];
      put(near === c.date ? "differs (same date)" : near ? "not on a statement of that date" : "no statement", near === c.date
        ? `the holder's ${provider} statement of ${near} does not print ${hRupees(c.value)}`
        : near
        ? `no ${provider} statement for this holder prints ${hRupees(c.value)}; the nearest is dated ${near}, ${hDays(near, c.date)} days ${near < c.date ? "before" : "after"} the review — a mandate's value moves daily`
        : `no ${provider} statement for this holder is in the drop`);
    } else put("no statement", "a value-only line no manager or statement in this book is matched to — the review carries it at a figure only");
    continue;
  }
  const { keys, isins } = hIdentity(c.product);
  const reviewKey = securityKeyOf(c.product);
  /** Two names the review clips its own way, checked by hand against LKP's statement (same holder, same units). */
  const aliasKey = SECURITY_ALIASES.get(reviewKey)
    ?? new Map([["crompton-gr-con", "crompton-greaves-consumer-electrical"], ["transrail-lighting-lkp", "transrail-lighting"]]).get(reviewKey) ?? null;
  const fundHouse = providerFor(c.product);
  /**
   * The family's OWN lines are compared with the family's own accounts: a share a
   * discretionary manager holds for this holder is the manager's position, not the
   * review's demat line (MPS on Goldstandard is not Ajay's 4,878 at Motilal Oswal).
   * And an advisor that IS a depository names the account: a line the review files
   * at ICICI Bank is not answered by a Motilal Oswal statement.
   */
  const depository = /ICICI/i.test(c.advisor) ? /ICICI Bank/ : /HDFC/i.test(c.advisor) ? /HDFC Bank/ : /LKP/i.test(c.advisor) ? /LKP/ : null;
  const otherDepository = /ICICI Bank \(NSDL|HDFC Bank \(NSDL|LKP Securities/;
  const rows = [...H_ROWS_ARCHIVE, ...hBalancesOn(c.date)]
    .filter((r) => r.ownerId === ownerId && hEngagement.get(r.account) !== "PMS")
    .filter((r) => (depository ? depository.test(r.provider) : !otherDepository.test(r.provider)))
    .filter((r) => (r.key && keys.has(r.key)) || (r.isin && isins.has(r.isin))
      || (r.nameKey && (r.nameKey === reviewKey || r.nameKey === aliasKey))
      || (fundHouse && (r.provider === fundHouse || (r.nameKey ?? "").startsWith(`${reviewKey}-`))));
  if (rows.length) for (const r of rows) { if (r.key) keys.add(r.key); }
  const byAccount = new Map();
  for (const r of rows) {
    const best = byAccount.get(r.account);
    const score = (x) => (x.date === c.date ? 0 : (x.date < c.date ? 1 : 2) * 1e5 + hDays(x.date, c.date));
    if (!best || score(r) < score(best)) byAccount.set(r.account, r);
  }
  const claim = (r) => hClaimed.add(`${ownerId}|${r.account}|${[...keys].sort()[0] ?? [...isins][0]}`);
  const free = [...byAccount.values()].filter((r) => !hClaimed.has(`${ownerId}|${r.account}|${[...keys].sort()[0] ?? [...isins][0]}`));
  const tie = free.find((r) => hSame(r.units, c.qty, c.qtyDp));
  const at = (r) => (r.date === c.date ? `on the same date — ${r.how}` : `${r.how}, ${hDays(r.date, c.date)} days ${r.date < c.date ? "before" : "after"} the review`);
  if (tie) { claim(tie); put(tie.date === c.date ? "ties" : "ties (other date)", `${hUnits(tie.units)} units ${at(tie)}`); continue; }
  /**
   * A statement of another date, carried to the review's date over the units
   * that moved between. It is a verdict only where the result is the review's
   * own figure; anything short of that is reported as it was.
   */
  const rolledTie = free.map((r) => ({ r, roll: hRolled(r, c.date, keys, isins) }))
    .find((x) => x.roll && hSame(x.roll.units, c.qty, c.qtyDp));
  if (rolledTie) {
    const { r, roll } = rolledTie;
    claim(r);
    put("ties (carried to the review's date)", `${hUnits(r.units)} units ${at(r)}; ${hMovesText(roll)} → ${hUnits(roll.units)} units on ${c.date}`);
    continue;
  }
  if (pass === "tie") continue;
  /**
   * An account whose dated record shows it held nothing on the review's date —
   * every unit it reports was bought after — is not this closing's statement.
   * Helios's AMC folio opened on 6 August is not the review's 30 June line.
   */
  const laterOnly = free.filter((r) => { const x = r.date > c.date ? hRolled(r, c.date, keys, isins) : null; return x != null && Math.abs(x.units) < 0.001; });
  if (laterOnly.length && laterOnly.length === free.length) {
    const began = laterOnly.map((r) => `${r.how.replace(/, [a-z-]+ of \d{4}-\d{2}-\d{2}$/, "")} first holds it on ${hRolled(r, c.date, keys, isins).between[0].date}, after the review`).join("; ");
    put("no statement", `no statement of this holder's reports it on ${c.date} — ${began}; ${custodianNote({ advisor: c.advisor, investor: c.investor })}`);
    continue;
  }
  if (!rows.length && !keys.size && !isins.size) { put("no statement", `no statement of this holder's names this product — ${custodianNote({ advisor: c.advisor, investor: c.investor })}`); continue; }
  if (!free.length && depository !== undefined) {
    const elsewhere = [...H_ROWS_ARCHIVE, ...hBalancesOn(c.date)].filter((r) => r.ownerId === ownerId && hEngagement.get(r.account) !== "PMS"
      && ((r.key && keys.has(r.key)) || (r.isin && isins.has(r.isin)) || (r.nameKey && (r.nameKey === reviewKey || r.nameKey === aliasKey)))
      && hSame(r.units, c.qty, c.qtyDp) && !hClaimed.has(`${ownerId}|${r.account}|${[...keys].sort()[0] ?? [...isins][0]}`));
    if (elsewhere.length) { claim(elsewhere[0]); put("ties (other custodian)", `${hUnits(elsewhere[0].units)} units — ${elsewhere[0].how}; the review files it under ${c.advisor}`); continue; }
  }
  if (!free.length) { put("no statement", `no statement of this holder's reports it — ${custodianNote({ advisor: c.advisor, investor: c.investor })}`); continue; }
  const held = free.filter((r) => !laterOnly.includes(r));
  const total = held.reduce((s, r) => s + r.units, 0);
  if (held.length > 1 && hSame(total, c.qty, c.qtyDp)) { held.forEach(claim); put("ties (across accounts)", `${hUnits(total)} units over ${held.length} accounts`); continue; }
  const when = held.every((r) => r.date === c.date) ? "same date" : held.every((r) => r.date > c.date) ? "later statement" : "earlier statement";
  put(`differs (${when})`, held.map((r) => {
    const x = hRolled(r, c.date, keys, isins);
    return `${hUnits(r.units)} units ${at(r)}` + (x ? `; carried to ${c.date} over ${hMovesText(x)}: ${hUnits(x.units)} units` : "");
  }).join("; "));
}
hResults.sort((a, b) => a.c.row - b.c.row);

say("## H. Every closing the review prints, holder by holder");
say();
say("The review's `Transactions since inception` tab closes each holding with one row: holder, product,");
say("date, units, value. Each is set against **the same holder's own statements**, account by account,");
say("at the closing's own date where a depository tape covers it and otherwise at the nearest statement,");
say("whose date is printed. A statement of another date is carried to the review's date over the units");
say("its dated record shows moving between the two (a fund's own allotments and redemptions, a broker's");
say("trades), and that is a tie only where it lands on the review's figure. Units tie to the third decimal");
say("the statements print. The review's figures are the review's (30 June 2026) and reach no total in this book.");
say();
const hTally = new Map();
for (const r of hResults) hTally.set(r.verdict, (hTally.get(r.verdict) ?? 0) + 1);
say("| Verdict | Closings |");
say("| --- | ---: |");
for (const [v, n] of [...hTally].sort((a, b) => b[1] - a[1])) say(`| ${v} | ${n} |`);
say(`| **All** | **${hResults.length}** |`);
say();
say("| Row | Holder | Review line | Date | Review units · value | Verdict | What the holder's statements say |");
say("| ---: | --- | --- | --- | --- | --- | --- |");
for (const r of hResults) {
  const c = r.c;
  say(`| ${c.row} | ${c.investor} | ${c.product} (${c.advisor || "—"}) | ${c.date} | ${hUnits(c.qty)} · ${hRupees(c.value)} | ${r.verdict} | ${r.statement} |`);
}
say();

const CHECK = process.argv.includes("--check");
if (CHECK) {
  const was = readFileSync(OUT, "utf8");
  if (was !== L.join("\n") + "\n") { console.error(`${OUT} would change — run \`npm run reconcile:review\``); process.exitCode = 1; }
} else {
  writeFileSync(OUT, L.join("\n") + "\n");
}
console.log(`${OUT}`);
console.log(`  review total      ₹${cr(reviewTotal)} Cr`);
console.log(`  book total        ₹${cr(bookTotal)} Cr`);
console.log(`  book ex-promoter  ₹${cr(bookExPromoter)} Cr`);
console.log(`  direct equity     ${tiedQty} of ${securityLines.length} tie exactly, ${partial} partial, ${over} book-holds-more, ${unvalued} unvalued, ${missing} absent`);

/**
 * ── AND THE SAME FINDING, WHERE A READER WILL ACTUALLY MEET IT ─────────────
 *
 * `src/data/reviewGaps.ts` — every review line no statement in `source/`
 * reports, so a reader who searches the dashboard for one is told WHY it is
 * absent and WHICH document would close it, instead of a bare "no holdings
 * match". That sentence is the defect this file already names twice: the
 * family opened Fractal Analytics, saw four dashed tiles and asked whether the
 * data was absent or the dashboard was broken, and *that question is the
 * defect*. A search returning nothing is the same question one layer up, and a
 * reader who cannot tell "no custodian sent this" from "the dashboard lost it"
 * assumes the second.
 *
 * NOT ONE FIGURE OF THE REVIEW'S CROSSES OVER, and that is the whole licence
 * for publishing any of it. The consolidated review is NOT A SOURCE — by
 * decision — because it carries someone else's choices about what to include
 * and how to value it, and folding a cell in would end this book's own
 * guarantee on the first one. What travels here is the NAME, where the review
 * says it is held, and the two sentences the report above already prints: an
 * ABSENCE and a document to ask for, neither of which is a valuation. The
 * emitter refuses to write a numeric field, and `reviewGaps.test.ts` asserts
 * the refusal is load-bearing rather than merely true today.
 *
 * AN AGGREGATE IS LEFT OUT, for the reason `askFor` already states: `Private
 * Equity ₹136.16 Cr` is a block the review itemises on another tab and no
 * custodian issues a statement for it, so it is not a name anybody searches and
 * there is no document to name.
 */
const GAPS_OUT = "src/data/reviewGaps.ts";

/**
 * SPELLINGS THE FAMILY USE THAT THE REVIEW DOES NOT PRINT.
 *
 * Committed, cited, and deliberately tiny. A search alias JOINS NOTHING and
 * MOVES NO MONEY — it only decides whether a reader finds a sentence about an
 * absence — so unlike `SECURITY_ALIASES` above, getting one wrong costs a
 * wrong sentence rather than a wrong figure. It is still a hand-checked table
 * and never a fuzzy tier: `shared/nameMatch.mjs` records what a token-overlap
 * rule did to this corpus (`KIRANAKART TECHNOLOGIES` matched to `TATA
 * TECHNOLOGIES`), and nothing here resembles anything.
 */
const SEARCH_ALIASES = new Map([
  // The family asked for this holding by both names in the same sentence:
  // "It is named either Bombay Stock Exchange or BSE." BSE Ltd. is the listed
  // company that was the Bombay Stock Exchange, and the review prints only the
  // short form — so a reader typing the long one finds nothing without this.
  ["BSE Ltd.", ["Bombay Stock Exchange"]],
]);

const plain = (s) => s.replace(/\*\*/g, "").replace(/`/g, "");

{
  const gaps = [...notInBook, ...trulyAbsent]
    .filter((l) => !l.aggregate)
    .map((l) => ({
      name: l.product,
      aliases: SEARCH_ALIASES.get(l.product) ?? [],
      custodian: l.advisor || null,
      why: plain(custodianNote(l)),
      ask: plain(askFor(l)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /**
   * THE REFUSAL, STRUCK ON THE EMITTED OBJECT RATHER THAN TRUSTED TO THE MAP
   * ABOVE. A future edit that adds `mv` to the projection fails the run instead
   * of shipping a review valuation onto the dashboard.
   */
  for (const g of gaps)
    for (const [k, v] of Object.entries(g))
      if (typeof v === "number")
        throw new Error(`reviewGaps: ${g.name} carries a numeric field "${k}" — the review's figures may never reach the dashboard`);

  // The review's own as-of, read from the document's own filename rather than
  // typed: it is the date the workbook calls itself.
  const asOf = /as on (\d{1,2}) (\w+) (\d{4})/i.exec(WORKBOOK);
  const REVIEW_AS_OF = asOf ? `${asOf[1]} ${asOf[2]} ${asOf[3]}` : null;
  if (!REVIEW_AS_OF) throw new Error("reviewGaps: the workbook's filename no longer states its as-of date");

  const ts = [
    "// GENERATED by `npm run reconcile:review` — do not edit by hand.",
    "//",
    "// Every line the family's own consolidated review carries that NO STATEMENT",
    "// in `source/` reports. It exists so a reader who searches this dashboard for",
    "// one of these names is told why it is absent and which document would close",
    "// it, rather than being shown an empty result they cannot tell from a defect.",
    "//",
    "// NOT A SOURCE, AND NOT ONE FIGURE OF ONE. The consolidated review is held",
    "// out of the book by decision; what travels here is a NAME, a custodian and",
    "// two sentences — an absence and a document to ask for. There is deliberately",
    "// no value and no quantity on this type, and the generator throws rather than",
    "// emit one. Nothing here reaches `glowData.ts`, any total, or any allocation.",
    "",
    "export interface ReviewGap {",
    "  /** The review's own line name, verbatim. */",
    "  name: string;",
    "  /** Spellings the family use that the review does not print. Hand-checked. */",
    "  aliases: string[];",
    "  /** Where the review says it is held. Not a valuation. */",
    "  custodian: string | null;",
    "  /** Why this book carries no figure for it. */",
    "  why: string;",
    "  /** The one document that would close it. */",
    "  ask: string;",
    "}",
    "",
    "/** The as-of the review calls itself, read from its own filename. */",
    `export const REVIEW_AS_OF = ${JSON.stringify(REVIEW_AS_OF)};`,
    "",
    `export const REVIEW_GAPS: ReviewGap[] = ${JSON.stringify(gaps, null, 2)};`,
    "",
  ].join("\n");

  if (CHECK) {
    const was = readFileSync(GAPS_OUT, "utf8");
    if (was !== ts) { console.error(`${GAPS_OUT} would change — run \`npm run reconcile:review\``); process.exitCode = 1; }
  } else {
    writeFileSync(GAPS_OUT, ts);
  }
  console.log(`  review gaps       ${gaps.length} line(s) no statement reports -> ${GAPS_OUT}`);
}
