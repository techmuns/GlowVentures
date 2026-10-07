// HDFC BANK'S NSDL HOLDING STATEMENT — the third depository layout in this book,
// and the first document read through OCR.
//
// `source/august-2026-f/`'s two statements carry no text at all: every glyph is
// stored as its exact bezier outline (see `classifyInk` in lib/layout.mjs), so
// pdfjs returns nothing and poppler returns one character. `lib/ocr.mjs` renders
// the outlines at 600 dpi and hands the recovered words back in the SAME
// `{x,y,width,height,text}` shape a native page produces, so everything below is
// an ordinary coordinate-aware reader — it does not know or care that the text
// arrived by OCR.
//
// ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
//
// A figure recovered by OCR is only publishable if the document itself can check
// it, so this reader will not emit a holding unless the rows it read reproduce
// the statement's own printed `Total Valuation (Rs.)` TO THE PAISA. On a
// mismatch it emits nothing and says so. That is the whole licence for reading an
// outlined document at all: the page's own arithmetic is the witness.
//
// ── AND THE ROW IS QUANTITY-ONLY ────────────────────────────────────────────
//
// The one holding on each statement is 347 units of a `0.01% PRE SERIES A PREF`
// in an unlisted private company, at a Market Rate of exactly 100.000 — the FACE
// VALUE a preference share was issued at, not a mark anyone struck. `nsdlDemat`'s
// `faceValueBasis` grades that, and its verdict here is `par`: the holding
// carries its QUANTITY and NO VALUE. So these two documents add ₹0 to NAV, which
// is the correct answer rather than a disappointing one — reading them as a mark
// would put ₹34,700 of invented valuation into the book twice.
//
// ── THE FILENAME NAMES THE WRONG HOLDER, FOR THE FOURTH TIME ────────────────
//
// Both files are named for a Bharat Jaisinghani family trust; both statements
// print `AJAY T JAISINGHANI` and `AARTI AJAY JAISINGHANI` as joint holders at
// Ajay's own address. The account is therefore resolved on the `DP Account No:`
// the page prints — 67786547 and 67786137 — which is `motilalDemat.mjs`'s rule
// arriving through a third issuer.
//
// ── AND THE HOLDER LINE PRINTS THE TRUSTEES, NOT THE TRUST ──────────────────
//
//   "Bharat Jaisinghani Trust looks empty on holdings, so check that as well
//    since the client has provided half of the statements already."
//
// CLAUDE.md named this join and never made it: *"a reader must resolve each
// account on the `DP Account No:` the page prints and attribute it to a trust
// through the register. That is a join to establish, not a document to
// request."* Until it was made, the trusts' only holding in this book was a
// Transition Venture commitment and these two statements sat under Ajay.
//
// `BENEFICIAL_OWNER_BY_DP_ACCOUNT` below is that join, committed and cited.
// What licenses it is the family's OWN investment register, whose
// `TRUST INVESTMENT` sheet is the only place in the corpus that records who
// holds this instrument:
//
//   row 1  SWAPECO SOLUTIONS PRIVATE LIMITED   BHARAT JAISINGHANI FAMILY TRUST 2
//          "2807 PRE SERIRES A CCPS OF FACE VALUE RS. 100 EACH
//           (NO OF PREFERENCE SHARE 347)"                      ₹1,35,00,875
//   row 2  …the same line, under FAMILY TRUST 3                ₹1,35,00,875
//
// Four things have to hold before a statement is re-attributed against the
// holder it prints, and all four do:
//
//   1. THE QUANTITY TIES. 347 preference shares per trust; 347 × ₹100 face =
//      ₹34,700, which is the Total Valuation BOTH statements print to the paisa.
//   2. THE INSTRUMENT TIES. A Pre-Series-A CCPS of ₹100 face, not the equity.
//   3. NOBODY ELSE HOLDS IT. Searched across all eight sheets of the register:
//      Swapeco appears exactly three times — 347 CCPS under each trust, and 244
//      EQUITY shares (a DIFFERENT instrument and quantity) under Bharat
//      personally. Neither Ajay nor Aarti holds Swapeco anywhere in it.
//   4. THE COUNTS MATCH. Two such statements exist and there are two trusts.
//
// A TRUSTEE IS NOT A BENEFICIAL OWNER, which is the whole point: Ajay and Aarti
// hold these accounts FOR the trusts, and filing them under Ajay puts a trust's
// assets into a person's net worth — "wrong as tax, wrong as estate planning
// and wrong on screen", in `shared/owners.mjs`'s own words about these same two
// trusts.
//
// ── WHICH TRUST IS WHICH IS THE FILENAME, AND IT COSTS NOTHING TO GET WRONG ─
//
// The register records the two trusts as holding the IDENTICAL line — same
// instrument, same 347 units, same ₹1,35,00,875 — so it cannot say which DP
// account belongs to which, and the statements name neither. The filenames do,
// and this file has just finished explaining why a filename is the weakest
// evidence here. It is used for this ONE field and no other, and what makes
// that safe is measurable rather than hoped for: **the two trusts hold exactly
// the same thing, so swapping the mapping moves no figure on any screen.** What
// the join establishes is that these are the TRUSTS' accounts and not Ajay's,
// and that does not depend on the filename at all.
//
// ── AND A SECOND LAYOUT WITH A TEXT LAYER: AJAY'S OWN ACCOUNT ───────────────
//
// `source/october-2026/Demat Holding Query Stmt_…PDF` is the same depository's
// holding statement for Ajay's own DP account 10295743 (DP ID IN300476), from a
// different export: it carries a REAL text layer, a different column set and a
// different title — `HDFC Bank Depository Holding Details`. It is read by
// `readNative` below, natively, and nothing about the OCR path changes: that
// branch still runs for the two outlined-text statements, and the
// `text-recovered-by-rendering` warning is now emitted only where the grid says
// its text WAS recovered by rendering (`grid.textSource === "ocr"`) — on a
// native page that warning would be a false statement about how it was read.
import { makeHolding, makeTotals } from "../lib/document.mjs";
import { parseNum } from "../lib/parseNum.mjs";
import { faceValueBasis, assetClassOf } from "./nsdlDemat.mjs";

export const PROVIDER = "HDFC Bank (NSDL demat)";

/**
 * The letterhead, not the whole document. `IN301549` is HDFC Bank's own NSDL DP
 * ID and it sits beside the bank's name in the footer — matching either alone
 * would claim any statement that merely mentions HDFC, which this corpus is full
 * of (Sanshi prints the investor's HDFC bank details; Transition Venture prints
 * an HDFC IFSC code).
 */
export const LETTERHEAD = /DP\s*ID\s*IN301549/i;
/**
 * The title of the native export (Ajay's DP account 10295743). It names the bank
 * and the kind of document in one line, which is what the classifier keys on —
 * this export does not print `IN301549`, so `LETTERHEAD` never fires for it.
 */
export const NATIVE_TITLE = /HDFC\s+Bank\s+Depository\s+Holding\s+Details/i;
export const matches = (text) =>
  (LETTERHEAD.test(text ?? "") && /HDFC\s+Bank\s+Limited/i.test(text ?? "")) || NATIVE_TITLE.test(text ?? "");

/**
 * DP ACCOUNT NUMBER → THE OWNER THE REGISTER RECORDS, where the holder line the
 * statement prints is the TRUSTEE rather than the beneficial owner.
 *
 * Keyed on the account number the PAGE prints — never the filename, never the
 * holder line. See the long note at the top of this file for the four things
 * that had to hold before a statement was re-attributed against the name on it.
 *
 * `via` is the evidence, in words, and it rides into the archive as a warning
 * on every document this fires for: a re-attribution nobody can trace is worse
 * than none, and this is the one field in this reader that does not come from
 * the page in front of it.
 */
export const BENEFICIAL_OWNER_BY_DP_ACCOUNT = {
  67786547: {
    owner: "Bharat Jaisinghani Family Trust 2",
    via: "the family's own investment register (`NEW INVESTMENT SHEET.xlsx`, sheet `TRUST INVESTMENT`, "
      + "row 1) records 347 Swapeco Pre-Series-A CCPS of ₹100 face under this trust — the exact instrument "
      + "and quantity this statement prints, whose 347 × ₹100 is the ₹34,700 total it prints. The holder "
      + "line names the TRUSTEES; no Swapeco holding appears under them anywhere in the register.",
  },
  67786137: {
    owner: "Bharat Jaisinghani Family Trust 3",
    via: "the family's own investment register (`NEW INVESTMENT SHEET.xlsx`, sheet `TRUST INVESTMENT`, "
      + "row 2) records 347 Swapeco Pre-Series-A CCPS of ₹100 face under this trust — the exact instrument "
      + "and quantity this statement prints, whose 347 × ₹100 is the ₹34,700 total it prints. The holder "
      + "line names the TRUSTEES; no Swapeco holding appears under them anywhere in the register.",
  },
};

const n = (v) => parseNum(v);
const warn = (warnings, code, detail) => warnings.push({ code, detail });

/** Every word on the page, in reading order, for the header fields. */
const flatten = (grid) =>
  (grid?.pages ?? []).map((p) => (p.rows ?? []).map((r) => r.cells.map((c) => c.text).join(" ")).join("\n")).join("\n");

export function extract({ grid, meta = {} }) {
  const warnings = [];
  const text = flatten(grid);
  const source = meta.source ?? null;

  /**
   * THE ACCOUNT IS THE ONE THE PAGE PRINTS. Never the filename — see the header.
   */
  const accountNo = (/DP\s*Account\s*No\s*:?\s*(\d{6,})/i.exec(text) ?? [])[1] ?? null;
  const asOf = (() => {
    const m = /Holding\s+Statement\s+as\s+on\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  })();
  /**
   * The holder line is the two names between the account number and the address.
   * Taken verbatim: `shared/owners.mjs` resolves it, and a reader that trims a
   * name is how two trusts became the man they are named after.
   */
  const printedHolder = (/DP\s*Account\s*No\s*:?\s*\d{6,}\s*\n\s*([A-Z][A-Z .]+)/i.exec(text) ?? [])[1]?.trim() ?? null;

  /**
   * THE BENEFICIAL OWNER, where the register names one for this DP account.
   *
   * Applied AFTER the account number is read and only on an exact numeric
   * match, so a statement this map does not name keeps the holder it prints —
   * which is every other document any reader in this pipeline handles.
   */
  const beneficial = accountNo ? BENEFICIAL_OWNER_BY_DP_ACCOUNT[Number(accountNo)] ?? null : null;
  const owner = beneficial?.owner ?? printedHolder;
  if (beneficial) {
    warn(warnings, "owner-from-register",
      `DP account ${accountNo} is attributed to ${beneficial.owner}, not to the "${printedHolder}" the `
      + `holder line prints: ${beneficial.via}`);
  }

  if (!accountNo) {
    warn(warnings, "no-account-number",
      "no `DP Account No :` was found on the page, and this reader will not fall back to the file name — "
      + "both files in this delivery are named for a holder the statement itself does not print.");
    return { accountNo: null, owner: null, asOf: null, holdings: [], status: "failed", warnings };
  }

  /**
   * THE NATIVE EXPORT HAS ITS OWN COLUMNS, SO IT HAS ITS OWN READER. Chosen on
   * the title the page prints AND on the text being native: an OCR'd page is
   * never sent down the native path, whatever it seems to say.
   */
  if (grid?.textSource !== "ocr" && NATIVE_TITLE.test(text)) {
    return readNative({ grid, text, meta, accountNo, owner, asOf, warnings });
  }

  // ── the holding rows ──────────────────────────────────────────────────────
  // One row per ISIN. The layout is ISIN | Company Name | Scrip Type | Balance |
  // Market Rate | Market Value | Status, and the reader keys on the ISIN rather
  // than a column index so a shifted column surfaces as "no rows" instead of
  // wrong figures.
  const holdings = [];
  const printedValues = [];
  const unpriced = [];
  for (const page of grid?.pages ?? []) {
    for (const row of page.rows ?? []) {
      const cells = row.cells.map((c) => c.text.trim()).filter(Boolean);
      const joined = cells.join(" ");
      const isin = (/\b(IN[EF][0-9A-Z]{9})\b/.exec(joined) ?? [])[1];
      if (!isin) continue;
      /**
       * THE THREE FIGURES ARE THE LAST THREE NUMBERS ON THE ROW, in printed
       * order: Balance, Market Rate, Market Value. Read positionally from the
       * END rather than by column index, because the Scrip Type cell wraps onto
       * a second line and shifts everything after it — the `0.01% PRE SERIES A
       * PREF 01SP45` cell is two lines tall in a one-line row.
       */
      const nums = joined.match(/[\d,]+\.\d{2,3}/g) ?? [];
      if (nums.length < 3) continue;
      const [qty, rate, value] = nums.slice(-3).map(n);
      if (qty == null || value == null) continue;

      const name = (() => {
        const after = joined.slice(joined.indexOf(isin) + isin.length);
        const m = /^[\s|]*([A-Z][A-Za-z .&'()-]{4,})/.exec(after);
        return m ? m[1].replace(/\s+/g, " ").trim() : isin;
      })();

      printedValues.push(value);
      const face = faceValueBasis({ isin, name, quantity: qty, value });
      if (face) unpriced.push(`${name} (${qty} at ${face.price.toFixed(4)})`);

      holdings.push(makeHolding({
        security: name,
        isin,
        assetClass: assetClassOf(isin, name),
        quantity: qty,
        /**
         * The statement DOES print a Market Rate, unlike ICICI's. It is still not
         * a price where `faceValueBasis` calls it par — 100.000 on an unlisted
         * preference share is what it was issued at.
         */
        marketPrice: face ? null : rate,
        marketValue: face ? null : value,
        faceValue: face ? face.price : null,
        source,
      }));
    }
  }

  /**
   * THE PRINTED TOTAL IS THE WITNESS, and on an OCR'd document it is not
   * optional. Every other reader in this pipeline treats a row-sum mismatch as a
   * finding to report; here it REFUSES the document, because the text was
   * recovered by rendering rather than read, and a figure nothing can check is
   * exactly what this book does not publish.
   */
  const printedTotal = n((/Total\s+Valuation\s*\(Rs\.?\)\s*:?\s*([\d,]+\.\d{2})/i.exec(text) ?? [])[1]);
  const rowSum = printedValues.reduce((t, v) => t + v, 0);
  if (printedTotal == null) {
    warn(warnings, "no-printed-total",
      "the statement's own `Total Valuation (Rs.)` was not found, so the rows read cannot be checked against "
      + "anything the document printed. Nothing is emitted: the text on this document was recovered by rendering "
      + "its outlined glyphs, and a recovered figure is only publishable where the page can witness it.");
    return { accountNo, owner, asOf, holdings: [], status: "failed", warnings };
  }
  if (Math.abs(rowSum - printedTotal) > 0.01) {
    warn(warnings, "rows-do-not-sum-to-printed-total",
      `the ${holdings.length} row(s) read sum to ${rowSum.toFixed(2)} against the statement's own printed `
      + `\`Total Valuation (Rs.)\` of ${printedTotal.toFixed(2)}. Nothing is emitted. On a document whose text was `
      + "recovered by rendering, this check is the only independent evidence the figures are right, so it is a "
      + "refusal rather than a warning.");
    return { accountNo, owner, asOf, holdings: [], status: "failed", warnings };
  }

  /**
   * ONLY WHERE IT IS TRUE. The grid says how its text was obtained; a page read
   * from a real text layer must never carry a warning that it was rendered.
   */
  if (grid?.textSource === "ocr") {
    warn(warnings, "text-recovered-by-rendering",
      `this statement carries no text layer — its glyphs are vector outlines — so the words were recovered by `
      + `rendering the page at 600 dpi and reading it (lib/ocr.mjs). The ${holdings.length} row(s) read reproduce the `
      + `statement's own printed Total Valuation of ${printedTotal.toFixed(2)} to the paisa, which is the check that `
      + "licenses publishing them. Ask HDFC for a re-export with fonts embedded to remove the need for it.");
  }

  if (unpriced.length) {
    warn(warnings, "value-is-face-value-par",
      `${unpriced.length} holding(s) carry units and NO market value: the implied price is exactly a face-value `
      + `denomination with no paise, on a name that declares none. A depository records the value a security was `
      + `allotted at where it has no price for it, and multiplying by that produces a valuation nobody struck. `
      + `Rows: ${unpriced.join("; ")}.`);
  }

  const dpId = (/DP\s*ID\s*(IN\d{6})/i.exec(text) ?? [])[1] ?? null;
  const acType = (/Account\s*Type\s*:?\s*([A-Za-z ]+?)\s*(?:\n|ISIN)/i.exec(text) ?? [])[1]?.trim() ?? null;

  /**
   * A READER RETURNS THE FIELDS IT PRODUCED, NEVER A WHOLE DOCUMENT.
   *
   * `extractOne` merges this over a `base` it built — `{ ...base, ...result }` —
   * which carries `docKey`, `sourcePath`, `pages` and `sourcePages`. Returning
   * `makeDocument(...)` here spread that object's OWN defaults over the base, so
   * `sourcePath` came back `undefined` and `pages` `null`: two documents in the
   * archive that named no file. Nothing failed and nothing said so — the figures
   * were right, the provenance was gone — and `npm run coverage:source` reported
   * both PDFs as UNREAD, which is the check doing exactly its job. Every other
   * provider in this directory returns a partial object; this one now does too.
   */
  return {
    accountNo,
    owner,
    asOf,
    /**
     * A DEPOSITORY ACCOUNT IS A DIRECT CUSTODY RELATIONSHIP, and saying so is
     * not cosmetic: `Account.engagement` is never defaulted (§5), and an account
     * left `unknown` warns and lands outside every engagement-keyed view. Same
     * value and same shape as `nsdlDemat.mjs`, because it is the same kind of
     * account at a different bank.
     */
    engagement: "Direct",
    providerEngagement: `NSDL depository account at ${dpId ?? "DP not read"} — ${acType || "type not read"}`,
    holdings,
    status: holdings.length ? "ok" : "partial",
    warnings,
  };
}

// ── THE NATIVE EXPORT ──────────────────────────────────────────────────────
//
// `HDFC Bank Depository Holding Details`, read from its own text layer. Eight
// columns, each with a printed header:
//
//   Account Type | ISIN | Company Name | Scrip Type | Balance | Rate (Rs.) |
//   Value (Rs.) | Status
//
// Every rule below is a wrong answer this layout makes easy:
//
//   • THE HEADER IS FOUND BY ITS WORDS, never by an index. All eight labels must
//     be on one line, or nothing is read — a changed export is reported as a
//     header that did not match rather than as columns read at a guessed x.
//   • A FIGURE BELONGS TO THE COLUMN WHOSE RIGHT EDGE IT SHARES. The three money
//     columns are right-aligned under their headings (Balance 533.2, Rate 608.0,
//     Value 692.4 on this statement), so a figure is placed by its right edge,
//     and one under no heading is refused rather than guessed at.
//   • A WRAPPED NAME CONTINUES ON THE LINES BELOW ITS ISIN. `DEEPAK FERTILISERS
//     AND` / `PETROCHEMICALS CORPORATION` / `LTD` is one company on three lines,
//     and every continuation line belongs to the record ABOVE it — the record's
//     ISIN line is always its first. Nearest-by-y would hand `(INDIA) LIMITED`
//     under KINGFA to the next record whenever the gap below is smaller.
//   • TEXT IS PLACED BY ITS LEFT EDGE, which is where a left-aligned column
//     starts. The company names start at x201.6 — LEFT of their own centred
//     heading (x245.9) — so a boundary halfway between two headings would file
//     the first word of every name under the ISIN column.
//   • THE DOCUMENT'S OWN TOTAL IS THE WITNESS. `Total Valuation` is struck over
//     every row the statement printed, the face-valued ones included, and the
//     rows read must reproduce it to the paisa or nothing is emitted. Every row's
//     own balance × rate must also be its printed value, which is the second
//     check: a figure read from the wrong row would still pass a sum.

/** The eight column headings, matched on the whole text of one item each. */
const NATIVE_HEADER = {
  accountType: /^Account\s*Type$/i,
  isin: /^ISIN$/i,
  company: /^Company\s*Name$/i,
  scrip: /^Scrip\s*Type$/i,
  balance: /^Balance$/i,
  rate: /^Rate\s*\(Rs\.?\)$/i,
  value: /^Value\s*\(Rs\.?\)$/i,
  status: /^Status$/i,
};
/** The furniture below the table — the first line carrying any of these ends it. */
const NATIVE_STOP = /Market\s+Rate\s+Date|Total\s+Valuation|Nomination\s+Details|Registered\s*:|Page\s+Number|Authorised\s+Signatory/i;
/**
 * An ISIN, and only an ISIN. Twelve characters ending in the check DIGIT — the
 * trailing digit is what keeps a word like `INTELLIGENCE` out.
 */
const ISIN_ITEM = /^IN[0-9A-Z]{9}[0-9]$/;
/** A printed figure: grouped digits with decimals, nothing else in the item. */
const FIGURE_ITEM = /^[\d,]+\.\d+$/;
/**
 * How far a right-aligned figure's right edge may sit from its heading's. The
 * statement's own figures sit within 0.1pt; the slack is wide enough for a
 * renderer's rounding and far narrower than the 75pt between two columns.
 */
const RIGHT_EDGE_SLACK = 6;

const itemsOfRow = (row) =>
  (row.items ?? [])
    .map((c) => ({ x: c.x ?? 0, width: c.width ?? 0, text: String(c.text ?? "").trim() }))
    .filter((c) => c.text)
    .sort((a, b) => a.x - b.x);

/** The header row on one page: each label's left and right edge, or null. */
function nativeHeaderOf(page) {
  for (const [index, row] of (page.rows ?? []).entries()) {
    const items = itemsOfRow(row);
    const found = {};
    for (const [key, re] of Object.entries(NATIVE_HEADER)) {
      const it = items.find((c) => re.test(c.text));
      if (!it) break;
      found[key] = { left: it.x, right: it.x + it.width };
    }
    if (Object.keys(found).length === Object.keys(NATIVE_HEADER).length) return { index, cols: found };
  }
  return null;
}

/** Which text column an item belongs to, by its left edge. */
function textColumnOf(item, cols) {
  if (item.x < cols.isin.left) return "accountType";
  if (item.x < (cols.company.right + cols.scrip.left) / 2) return "company";
  if (item.x < cols.balance.left) return "scrip";
  if (item.x >= (cols.value.right + cols.status.left) / 2) return "status";
  return null;   // inside the money columns, and not a figure
}

/** Which figure column an item belongs to, by its right edge. */
function figureColumnOf(item, cols) {
  const right = item.x + item.width;
  for (const key of ["balance", "rate", "value"]) {
    if (Math.abs(right - cols[key].right) <= RIGHT_EDGE_SLACK) return key;
  }
  return null;
}

const join = (parts) => parts.join(" ").replace(/\s+/g, " ").trim();
const isoOf = (d, m, y) => `${y}-${m}-${d}`;

/**
 * Is a printed Scrip Type the ordinary share of the company it names?
 *
 * `EQ`, `EQ NEW FV RS 2/-`, `EQ NEW.RS. 5/-`, `EQ NEW F.V. RS.2''/-` — the
 * depository's own description of WHICH LINE in its books this is, after a
 * split or a change of face value. None of it is identity (Stage 10ak), and the
 * odd quote marks would carry straight into a key no strip rule reaches. So the
 * holding is named for the COMPANY, and an instrument that is NOT ordinary
 * equity — a preference share, a warrant, a partly paid share — keeps its scrip
 * type in its name, because that is a different holding.
 */
const isOrdinaryEquity = (scrip) => /^EQ\b/i.test(scrip) && !/\b(?:PREF|WARRANT|PP|PARTLY)\b/i.test(scrip);

function readNative({ grid, text, meta, accountNo, owner, asOf, warnings }) {
  const source = meta.docKey ?? null;
  const fail = (code, detail) => {
    warn(warnings, code, detail);
    return { accountNo, owner, asOf, holdings: [], status: "failed", warnings };
  };

  const pages = grid?.pages ?? [];
  const headers = pages.map(nativeHeaderOf);
  if (!headers.some(Boolean)) {
    return fail("header-not-matched",
      "the `Account Type | ISIN | Company Name | Scrip Type | Balance | Rate (Rs.) | Value (Rs.) | Status` header "
      + "was not found on one line, so no column could be placed from the document. Nothing is read rather than "
      + "reading columns at a guessed x.");
  }

  /**
   * THE RECORDS. One per ISIN line; every line below it that carries no ISIN,
   * up to the next one, continues it. Carried across a page break, because a
   * name can wrap onto the next page under a reprinted header.
   */
  const records = [];
  let current = null;
  let accountType = null;
  for (const [pi, page] of pages.entries()) {
    const header = headers[pi];
    if (!header) continue;
    const rows = page.rows ?? [];
    for (let ri = header.index + 1; ri < rows.length; ri++) {
      const items = itemsOfRow(rows[ri]);
      if (items.some((c) => NATIVE_STOP.test(c.text))) break;
      const isinItems = items.filter((c) => ISIN_ITEM.test(c.text));
      if (isinItems.length > 1) {
        return fail("two-isins-on-one-line",
          `page ${pi + 1} prints ${isinItems.map((c) => c.text).join(" and ")} on one line, so the figures on it `
          + "cannot be told apart. Nothing is read.");
      }
      if (isinItems.length === 1) {
        current = {
          isin: isinItems[0].text, page: pi + 1,
          accountType: [], company: [], scrip: [], status: [], figures: {},
        };
        records.push(current);
      }
      for (const item of items) {
        if (ISIN_ITEM.test(item.text)) continue;
        if (FIGURE_ITEM.test(item.text)) {
          const col = figureColumnOf(item, header.cols);
          if (!col) {
            return fail("figure-not-under-a-column",
              `page ${pi + 1} prints ${item.text} at x${item.x.toFixed(1)}, whose right edge sits under none of the `
              + "Balance, Rate and Value headings. Nothing is read rather than placing a figure by guesswork.");
          }
          if (!isinItems.length) {
            return fail("figure-without-isin",
              `page ${pi + 1} prints ${item.text} in the ${col} column on a line carrying no ISIN, so it cannot `
              + "be tied to a holding. Nothing is read.");
          }
          if (current.figures[col] != null) {
            return fail("two-figures-in-one-column",
              `${current.isin} prints two figures in the ${col} column. Nothing is read.`);
          }
          current.figures[col] = item.text;
          continue;
        }
        const col = textColumnOf(item, header.cols);
        if (!col) {
          return fail("text-in-a-figure-column",
            `page ${pi + 1} prints "${item.text}" inside the money columns, where only figures belong. `
            + "Nothing is read rather than dropping or misfiling it.");
        }
        if (!current) {
          if (col === "accountType") { accountType = join([accountType ?? "", item.text]); continue; }
          return fail("text-before-first-holding",
            `page ${pi + 1} prints "${item.text}" below the header and above the first ISIN, so it belongs to no `
            + "holding. Nothing is read rather than guessing which one.");
        }
        if (col === "accountType") {
          /**
           * THE ACCOUNT TYPE IS PRINTED ONCE PER GROUP. `Free Balance` stands on
           * the first row and governs every row below it until another type is
           * printed — so it starts a new group on an ISIN line, and continues the
           * current label on a line without one (a label too wide for its column).
           */
          accountType = isinItems.length ? item.text : join([accountType ?? "", item.text]);
          continue;
        }
        current[col].push(item.text);
      }
      if (isinItems.length) current.accountType = accountType;
    }
  }

  /**
   * EVERY ISIN THE DOCUMENT PRINTS MUST BE A RECORD. A table that runs onto a
   * page whose header did not match, or an ISIN printed below the table's end,
   * would otherwise drop a holding without a word — and the printed total check
   * below can only see that where the dropped row carried a value.
   */
  const isinsPrinted = pages.flatMap((p) => (p.rows ?? []).flatMap((r) => itemsOfRow(r)))
    .filter((c) => ISIN_ITEM.test(c.text)).length;
  if (isinsPrinted !== records.length) {
    return fail("isin-outside-the-table",
      `the statement prints ${isinsPrinted} ISIN(s) and ${records.length} were read as holdings, so at least one `
      + "sits outside the table this reader found. Nothing is read rather than dropping a holding.");
  }
  if (!records.length) {
    return fail("no-holding-rows",
      "the header was found and no line under it carried an ISIN. Nothing is read.");
  }

  /** One record per ISIN, the balance types summed — see the warning below. */
  const byIsin = new Map();
  const notFree = [];
  for (const r of records) {
    const company = join(r.company);
    const scrip = join(r.scrip);
    const status = join(r.status);
    const qty = n(r.figures.balance);
    const rate = n(r.figures.rate);
    const value = n(r.figures.value);
    if (!company || qty == null || rate == null || value == null) {
      return fail("row-incomplete",
        `${r.isin} on page ${r.page} does not print all of a company name, a balance, a rate and a value `
        + `(read: "${company}", ${r.figures.balance ?? "—"}, ${r.figures.rate ?? "—"}, ${r.figures.value ?? "—"}). `
        + "Nothing is read.");
    }
    /**
     * THE ROW'S OWN ARITHMETIC. The statement prints the balance to three
     * decimals and the rate and value to two, so the product may differ from the
     * printed value by half a paisa on the rate times the balance, and no more.
     */
    if (Math.abs(qty * rate - value) > 0.005 * qty + 0.01) {
      return fail("row-value-is-not-balance-times-rate",
        `${company} (${r.isin}) prints a balance of ${r.figures.balance} at ${r.figures.rate} and a value of `
        + `${r.figures.value}, which is not their product. A figure read from the wrong line would pass a column `
        + "sum and fail here, so nothing is read.");
    }
    if (!/^Free\b/i.test(status) || (r.accountType && !/^Free\b/i.test(r.accountType))) {
      notFree.push(`${company} (${r.accountType ?? "type not printed"}; status ${status || "not printed"})`);
    }
    const prior = byIsin.get(r.isin);
    if (prior) {
      if (prior.rate !== rate || prior.company !== company || prior.scrip !== scrip) {
        return fail("one-isin-two-descriptions",
          `${r.isin} is printed twice with a different name, scrip type or rate. Nothing is read.`);
      }
      prior.qty += qty;
      prior.value += value;
      prior.types.push(r.accountType ?? "type not printed");
      continue;
    }
    byIsin.set(r.isin, { isin: r.isin, company, scrip, rate, qty, value, types: [r.accountType ?? "type not printed"] });
  }

  /**
   * THE PRINTED TOTAL, struck over every row the statement printed. Read before
   * the face-value decision below drops a value, so the check is against what
   * the document said rather than against what this reader chose to carry.
   */
  const printedTotal = n((/Total\s+Valuation\s*(?:\(Rs\.?\))?\s*:?\s*([\d,]+\.\d{2})/i.exec(text) ?? [])[1]);
  const rowSum = [...byIsin.values()].reduce((t, r) => t + r.value, 0);
  if (printedTotal == null) {
    return fail("no-printed-total",
      "the statement's own `Total Valuation` was not found, so the rows read cannot be checked against anything "
      + "the document printed. Nothing is emitted.");
  }
  if (Math.abs(rowSum - printedTotal) > 0.01) {
    return fail("rows-do-not-sum-to-printed-total",
      `the ${byIsin.size} row(s) read sum to ${rowSum.toFixed(2)} against the statement's own printed Total `
      + `Valuation of ${printedTotal.toFixed(2)}. Nothing is emitted: a row read twice, missed or misread is exactly `
      + "what this check exists to stop.");
  }

  /**
   * THE RATES ARE STRUCK ON A DIFFERENT DAY FROM THE BALANCES, and the statement
   * says so. The balances are `as on` 05/10/2026; the `Market Rate Date/Time`
   * is 06/10/2026 11:13 — a moment inside the trading session, so the rate is
   * not a settled close. Every value is dated by the rate's own date, which is
   * what `priceAsOn` is for, and never by the balance date.
   */
  const rateAt = /Market\s+Rate\s+Date\s*\/\s*Time\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*\/\s*(\d{1,2}:\d{2}(?::\d{2})?))?/i.exec(text);
  const priceAsOn = rateAt ? isoOf(rateAt[1], rateAt[2], rateAt[3]) : null;
  if (!priceAsOn) {
    warn(warnings, "no-price-date",
      "the statement prints no `Market Rate Date/Time`, so the rates carry no date of their own. They are not "
      + "dated by the balance date, which is a claim about the units rather than about the prices.");
  } else if (asOf && priceAsOn !== asOf) {
    warn(warnings, priceAsOn > asOf ? "price-date-follows-holding-date" : "price-date-precedes-holding-date",
      `the balances are stated as on ${asOf} and the rates as at ${priceAsOn}${rateAt[4] ? ` ${rateAt[4]}` : ""}, `
      + "both in the statement's own words. A rate taken during a trading session is not a settled close; the "
      + "values are dated by the rates' own date and the account by its balances.");
  }

  const holdings = [];
  const unpriced = { declared: [], scheme: [], par: [] };
  const summed = [];
  for (const r of byIsin.values()) {
    const described = join([r.company, r.scrip]);
    const name = isOrdinaryEquity(r.scrip) || !r.scrip ? r.company : `${r.company} - ${r.scrip}`;
    const face = faceValueBasis({ isin: r.isin, name: described, quantity: r.qty, value: r.value });
    if (face) unpriced[face.tier].push(`${name} (${r.qty} at ${face.price.toFixed(4)})`);
    if (r.types.length > 1) summed.push(`${name}: ${r.types.join(" + ")}`);
    holdings.push(makeHolding({
      security: name,
      isin: r.isin,
      assetClass: assetClassOf(r.isin, described),
      quantity: r.qty,
      /**
       * THIS EXPORT PRINTS A RATE, and the rate is the primitive: value is
       * derived from it and the printed value is kept as the check. Where the
       * rate is a face value the depository records for want of a price, the
       * row carries its units and NO value — `faceValueBasis` decides, with the
       * same three tiers as ICICI's NSDL statement.
       */
      marketPrice: face ? null : r.rate,
      marketValue: face ? null : r.value,
      faceValue: face ? face.price : null,
      priceAsOn,
      source,
    }));
  }

  if (summed.length) {
    warn(warnings, "balance-types-summed",
      `${summed.length} security(ies) are printed on more than one line, one per balance type, and are carried as `
      + `one holding of the summed units — the same shares held under two depository balances are one position. `
      + `Rows: ${summed.join("; ")}.`);
  }
  if (notFree.length) {
    warn(warnings, "balance-not-free",
      `${notFree.length} holding(s) are not printed as a free balance: ${notFree.join("; ")}. They are still the `
      + "account's holdings and are carried; whether they can be sold today is what this line records.");
  }
  for (const [tier, rows] of Object.entries(unpriced)) {
    if (!rows.length) continue;
    const why = {
      declared: "the SCRIP TYPE declares this face value and the printed rate is exactly it",
      scheme: "the identifier is an `INF` fund or AIF scheme and the rate is exactly a unit's issue price, never a NAV",
      par: "the rate is exactly a face-value denomination with no paise, on a scrip type that declares none",
    }[tier];
    warn(warnings, `value-is-face-value-${tier}`,
      `${rows.length} holding(s) carry units and NO market value, because ${why}. A depository records the value `
      + "a security was allotted at where it has no price for it, and multiplying by that produces a valuation "
      + `nobody struck. Rows: ${rows.join("; ")}.`);
  }

  const dpId = (/DP\s*ID\s*:?\s*(IN\d{6})/i.exec(text) ?? [])[1] ?? null;
  const types = [...new Set([...byIsin.values()].flatMap((r) => r.types))];
  const priced = holdings.filter((h) => h.printed?.marketValue != null);
  return {
    accountNo,
    owner,
    asOf,
    engagement: "Direct",
    providerEngagement: `NSDL depository account at ${dpId ?? "DP not read"} — ${types.join(", ")}`,
    holdings,
    /**
     * THE TOTAL OF WHAT IS CARRIED, so the reconciler's row-sum check compares
     * like with like. The statement's own Total Valuation includes the
     * face-valued rows this book does not value; it is the witness above, and
     * the difference between the two is exactly those rows.
     */
    totals: makeTotals({
      totalMarketValue: priced.length ? priced.reduce((t, h) => t + h.printed.marketValue, 0) : null,
      positionCount: holdings.length,
      source,
    }),
    status: "ok",
    warnings,
  };
}
