// A FUND'S OWN PORTFOLIO DISCLOSURE — read, archived, and worth NOTHING to the book.
//
// `White Oak - Ajay.xlsx` is WhiteOak Capital Multi Asset Allocation Fund's
// monthly portfolio statement: the SCHEME's holdings, published under SEBI's
// disclosure rules, 348 rows of what the fund owns. What it does not contain,
// anywhere, is a client. No folio, no units, no PAN, no Jaisinghani.
//
// ── WHY THAT NEEDS A READER RATHER THAN A SHRUG ─────────────────────────────
//
// Because unread it looked like a gap. It sat in the coverage table as a file
// the pipeline could not open, next to four managers whose statements really
// were unreadable — and a reader working through that table would go looking for
// a ₹X Cr holding that does not exist in this document. "We could not read it"
// and "we read it and there is no position in it" are different answers, and
// only the second one is true.
//
// It was also being read as something else entirely. `360 One WAM Limited` is a
// listed company and this fund holds ₹10.16 Cr of it, so the classifier's
// whole-text match for `360 ONE` filed a scheme disclosure under 360 ONE Private
// Wealth and handed it to a client-report reader. Same trap as SVAN-as-Edelweiss
// and Sanshi-as-HDFC, one layer earlier; fixed in classify.mjs, and this reader
// is what the file resolves to instead.
//
// ── WHAT IS KEPT ────────────────────────────────────────────────────────────
//
// The scheme's holdings, in full, as an archived sheet with ISINs — because they
// are the LOOK-THROUGH for any family position in this fund, and the drop may
// yet contain one. `contributesToBook: false` and `excludedFromBook` say why the
// account総 is absent, so nothing has to infer it from an empty holdings array.
//
// The family holds no units of this scheme in any statement here. If a later
// drop brings the folio, this disclosure is what turns "₹X in a multi-asset
// fund" into "₹X, of which 2.91% is ICICI Bank".
import { parseNum } from "../lib/parseNum.mjs";
import { toIso } from "../lib/classify.mjs";
import { splitSecurityName } from "../../../shared/securityKey.mjs";

export const PROVIDER = "Scheme portfolio disclosure";

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const num = (s) => parseNum(s);

/** `Monthly Portfolio Statement as on June 30, 2026` */
const AS_ON = /Portfolio Statement as on\s+([A-Za-z]{3,}\s+\d{1,2},\s*\d{4})/i;

/**
 * A holding row of the disclosure:
 *   `IBCL05 | ICICI Bank Limited | | INE090A01021 | Banks | 1642209 | 22583.66 | 0.0291`
 *
 * Located by the ISIN column, not by position: the sheet has a scrip-code column
 * some rows leave blank (gold and silver bars carry no ISIN), and reading by
 * index would shift every figure on those rows.
 */
export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const sheets = grid.sheets ?? [];
  const flat = (grid.pages ?? []).map((p) => p.text).join("\n");

  const schemeName = sheets[0]?.rows?.flat().find((c) => /Fund$|Scheme$/i.test(String(c ?? "").trim()))
    ?? (/^\s*(.*Fund)\s*$/m.exec(flat) || [])[1]
    ?? null;
  const asOnRaw = (AS_ON.exec(flat) || [])[1];
  const asOf = asOnRaw ? toIso(asOnRaw.replace(",", "")) : null;

  // ── the scheme's holdings ─────────────────────────────────────────────────
  const rows = [];
  let totalValue = 0;
  for (const sheet of sheets) {
    for (const cells of sheet.rows ?? []) {
      const isinAt = cells.findIndex((c) => /^IN[EF][0-9A-Z]{9}$/.test(String(c ?? "").trim()));
      if (isinAt < 1) continue;
      const isin = String(cells[isinAt]).trim();
      // The instrument name is the last non-empty cell BEFORE the ISIN; the
      // industry, quantity, value and weight are the cells after it.
      const name = [...cells.slice(0, isinAt)].reverse().find((c) => String(c ?? "").trim().length > 3);
      if (!name) continue;
      const after = cells.slice(isinAt + 1).map((c) => String(c ?? "").trim());
      const industry = after.find((c) => c && !/^-?[\d.]+(?:E-?\d+)?$/.test(c)) ?? null;
      const nums = after.filter((c) => /^-?[\d.]+(?:E-?\d+)?$/i.test(c)).map(Number);
      const [quantity, valueLakhs, weight] = nums;
      // The disclosure states value in LAKHS and the weight as a FRACTION —
      // 2.91E-2 is 2.91%, not 0.0291%. Converted once, here, to the units the
      // rest of this pipeline uses: rupees and percent.
      const marketValue = Number.isFinite(valueLakhs) ? Math.round(valueLakhs * 1e5 * 100) / 100 : null;
      if (marketValue !== null) totalValue += marketValue;
      const clean = splitSecurityName(String(name).trim());
      rows.push({
        security: clean.security,
        isin: clean.isin ?? isin,
        industry,
        quantity: Number.isFinite(quantity) ? quantity : null,
        marketValue,
        pctNetAssets: Number.isFinite(weight) ? Math.round(weight * 100 * 1e4) / 1e4 : null,
      });
    }
  }
  if (!rows.length) warn(warnings, "scheme-holdings-not-read", "no row carrying an ISIN matched in the disclosure");

  const excludedFromBook =
    "this is the SCHEME's own portfolio disclosure, not a client statement. It carries no folio, no units and no holder — "
    + "there is no family position in it to consolidate. The holdings are archived as the LOOK-THROUGH for any future "
    + "statement that does report units of this scheme.";
  warn(warnings, "no-client-position", excludedFromBook);

  return {
    provider: PROVIDER,
    accountNo: null,
    owner: null,
    asOf,
    strategy: schemeName ? String(schemeName).trim() : null,
    engagement: "unknown",
    providerEngagement: "SEBI monthly scheme portfolio disclosure",
    // EMPTY, and deliberately so: an empty holdings array here means "this
    // document reports no position of ours", which is exactly true.
    holdings: [],
    totals: null,
    returns: [],
    excludedFromBook,
    /** The scheme's own holdings, for look-through. Never summed into the book. */
    schemeHoldings: rows,
    sections: {
      schemePortfolio: {
        name: "schemePortfolio",
        rows: [["security", "isin", "industry", "quantity", "marketValue", "pctNetAssets"],
          ...rows.map((r) => [r.security, r.isin, r.industry ?? "", r.quantity ?? "", r.marketValue ?? "", r.pctNetAssets ?? ""]),
          ["Total", "", "", "", Math.round(totalValue * 100) / 100, ""]],
      },
    },
    warnings,
    // `ok` — it was read, completely. The warning says why it contributes
    // nothing, which is a fact about the document rather than a failure to read
    // it. Reporting it as failed would put it back beside the files that really
    // cannot be opened.
    status: rows.length ? "ok" : "failed",
  };
}
