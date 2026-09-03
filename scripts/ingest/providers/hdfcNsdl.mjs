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
// arriving through a third issuer. The register in the same delivery records 347
// Swapeco preference shares under EACH trust, so the trust attribution is a JOIN
// through that document rather than anything this statement says.
import { makeHolding } from "../lib/document.mjs";
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
export const matches = (text) => LETTERHEAD.test(text ?? "") && /HDFC\s+Bank\s+Limited/i.test(text ?? "");

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
  const owner = (/DP\s*Account\s*No\s*:?\s*\d{6,}\s*\n\s*([A-Z][A-Z .]+)/i.exec(text) ?? [])[1]?.trim() ?? null;

  if (!accountNo) {
    warn(warnings, "no-account-number",
      "no `DP Account No :` was found on the page, and this reader will not fall back to the file name — "
      + "both files in this delivery are named for a holder the statement itself does not print.");
    return { accountNo: null, owner: null, asOf: null, holdings: [], status: "failed", warnings };
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

  warn(warnings, "text-recovered-by-rendering",
    `this statement carries no text layer — its glyphs are vector outlines — so the words were recovered by `
    + `rendering the page at 600 dpi and reading it (lib/ocr.mjs). The ${holdings.length} row(s) read reproduce the `
    + `statement's own printed Total Valuation of ${printedTotal.toFixed(2)} to the paisa, which is the check that `
    + "licenses publishing them. Ask HDFC for a re-export with fonts embedded to remove the need for it.");

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
