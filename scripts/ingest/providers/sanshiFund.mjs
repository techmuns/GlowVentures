// SANSHI FUND-I — Category-III AIF, monthly account statement (KFin Technologies).
//
// THE LARGEST BLOCK OF FAMILY WEALTH IN THIS DROP, and it was unread. Five
// folios across four people total ₹204.48 Cr — more than double everything the
// cockpit showed before this reader existed.
//
// SHAPE. One page of investor identity, then a single summary row, then the
// transaction ledger:
//
//   NAV
//   Account   NAV Date   NAV*   Units    Units Balance   Contribution   Valuation
//   Summary                     redeemed                 Amount
//   Class A2  30-06-2026 125.3582  -    23,41,480.851  24,99,87,500.62  29,35,23,824.82
//
// WHAT IS A PRIMITIVE HERE. Units and NAV are the primitives; the valuation is
// units × NAV and is DERIVED, with the printed figure kept as a check. Contribution
// is the capital put in, not a market value, and is carried as a flow.
//
// TWO THINGS THIS STATEMENT SAYS THAT MATTER AND ARE EASY TO GET WRONG
//
//   • THE PRINTED NAV IS PRE-TAX. Every statement carries a footnote — "The Post
//     Tax Nav is 122.6471/- per unit as on Nav date" — and the summary row's NAV
//     is the PRE-tax one. Both are recorded: the valuation is struck on the NAV
//     the fund itself uses in that row, and the post-tax NAV rides alongside as
//     `postTaxNav` so nobody has to guess which basis a figure is on.
//   • THE FEE IS NOT IN THE NAV. "The NAV has been calculated without accounting
//     for the applicable Investment Manager's annual performance fees, which will
//     be factored in at the end of the financial year." So this valuation is
//     before a fee that is certain to be charged. Recorded as a warning on the
//     document rather than silently adjusted — we do not know the rate.
//
// The investor's PAN is read because it is the only identity these statements
// share with the rest of the drop. Two of the four printed names match no
// canonical owner, and the PAN is what settles who they are — see shared/owners.mjs.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeFlows, makeCashFlow } from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";

export const PROVIDER = "Sanshi Fund";

/** The scheme, exactly as the statement titles itself. */
const SCHEME = "Sanshi Fund-I (Open Ended AIF CAT-III)";

const warn = (warnings, code, detail) => warnings.push({ code, detail });

/**
 * The summary row: `Class A2 30-06-2026 125.3582 - 23,41,480.851 24,99,87,500.62 29,35,23,824.82`
 *
 * `Units redeemed` prints as a bare `-` when nothing was redeemed, which is a
 * REPORTED ZERO and not a missing figure — the column exists and the fund is
 * telling us it is empty. Matched explicitly so a redemption that does occur
 * cannot be read as part of the units balance.
 */
const SUMMARY_ROW = new RegExp(
  String.raw`(Class\s+[A-Z]\d?)\s+` +          // 1 class
  String.raw`(\d{2}-\d{2}-\d{4})\s+` +         // 2 NAV date
  String.raw`([\d,]+\.\d+)\s+` +               // 3 NAV per unit
  String.raw`(-|[\d,]+\.?\d*)\s+` +            // 4 units redeemed ("-" = none)
  String.raw`([\d,]+\.\d+)\s+` +               // 5 units balance
  String.raw`([\d,]+\.\d+)\s+` +               // 6 contribution amount
  String.raw`([\d,]+\.\d+)`,                   // 7 valuation
);

/**
 * A labelled header field.
 *
 * The page has no line breaks worth trusting and the labels run together, so an
 * unanchored capture after `Investor Name :` reads straight on into the next
 * column — it returned `AARTI AJAY JAISINGHANI Bank Name : HDFC BANK`, and the
 * folio came back as `9039671821 Date: 30 Jun 2026`. Each field is therefore cut
 * at the first token that starts another label, and the folio is matched as
 * DIGITS ONLY because that is what a folio is.
 */
const NEXT_LABEL = /\s+(?:Bank|Address|Date|Tel|Mobile|Email|Nominee|POA|Distributor|Joint|Mode|PAN|Status|Folio|Investor|IFSC|MICR)\b/i;

const FIELD = (text, label, pattern = String.raw`([^\n]{1,80}?)`) => {
  const m = new RegExp(label + String.raw`\s*:?\s*` + pattern + String.raw`(?=\s{2,}|\n|$)`, "i").exec(text);
  if (!m) return null;
  return m[1].split(NEXT_LABEL)[0].trim() || null;
};

/** `Date  Transactions  Allotment/Redemption NAV  Units Allotted/Redeemed  Balance Units  Balance Amount` */
const TXN_ROW = new RegExp(
  String.raw`(\d{2}-\d{2}-\d{4})\s+` +                       // 1 date
  String.raw`([A-Za-z][A-Za-z @%.\d/]*?)\s+` +               // 2 description
  String.raw`(-|[\d,]+\.\d+)\s+` +                           // 3 allotment NAV
  String.raw`(-|[\d,]+\.\d+)\s+` +                           // 4 units allotted/redeemed
  String.raw`(-|[\d,]+\.\d+)\s+` +                           // 5 balance units
  String.raw`\(?(-?[\d,]+\.\d+)\)?`,                         // 6 balance amount (parenthesised = negative)
  "g",
);

export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const text = pages.map((p) => p.text).join("\n");
  const flat = text.replace(/[ \t]+/g, " ");

  // ── identity ──────────────────────────────────────────────────────────────
  const folio = (/Folio\s*No\s*:?\s*(\d{6,})/i.exec(flat) || [])[1] || null;
  const owner = trimPersonName(FIELD(flat, "Investor Name"));
  // PAN sits in a table: `1st Holder AACPJ2099J Verified Y …`. Anchored on the
  // holder label so a nominee's PAN elsewhere on the page cannot be read as the
  // investor's.
  const pan = (/1st\s+Holder\s+([A-Z]{5}\d{4}[A-Z])/i.exec(flat) || [])[1] || null;
  const asOfRaw = (/Date\s*:\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i.exec(flat) || [])[1];
  const summary = SUMMARY_ROW.exec(flat);
  const asOf = summary ? toIso(summary[2].replace(/-/g, "/")) : (asOfRaw ? toIso(asOfRaw) : null);

  if (!folio) warn(warnings, "folio-not-read", "no `Folio No:` on the statement");
  if (!owner) warn(warnings, "owner-not-read", "no `Investor Name:` on the statement");
  if (!pan) warn(warnings, "pan-not-read", "no `1st Holder <PAN>` row — identity cannot be joined on PAN");

  if (!summary) {
    warn(warnings, "summary-row-not-matched",
      "the Class / NAV date / NAV / units / contribution / valuation row did not match; nothing is inferred from the rest of the page");
    return {
      provider: PROVIDER, accountNo: folio, owner, asOf, strategy: SCHEME,
      engagement: "AIF", providerEngagement: "Open Ended AIF CAT-III",
      pan, holdings: [], totals: null, warnings, status: "failed",
    };
  }

  const [, klass, , navRaw, redeemedRaw, unitsRaw, contribRaw, valuationRaw] = summary;
  const nav = parseNum(navRaw);
  const units = parseNum(unitsRaw);
  const contribution = parseNum(contribRaw);
  const printedValuation = parseNum(valuationRaw);
  // "-" means the fund reported NO redemption, which is a zero it measured.
  const unitsRedeemed = redeemedRaw === "-" ? 0 : parseNum(redeemedRaw);

  // The post-tax NAV from the footnote. Carried, never substituted: the
  // valuation row is struck on the pre-tax NAV and mixing the two would produce
  // a figure the statement does not contain.
  const postTaxNav = parseNum((/Post\s+Tax\s+Nav\s+is\s+([\d,]+\.\d+)/i.exec(flat) || [])[1]);
  if (/without accounting for the applicable Investment Manager'?s annual performance fee/i.test(flat)) {
    warn(warnings, "nav-excludes-performance-fee",
      "the fund states this NAV excludes the Investment Manager's annual performance fee, charged at financial year end — the valuation is before a fee that will be levied");
  }

  // ── the holding ───────────────────────────────────────────────────────────
  // ONE holding: units of one class of one scheme. Market value is DERIVED from
  // NAV x units; the printed valuation rides in `printed.marketValue` as the
  // check, exactly as the PMS appraisals do.
  const security = `${SCHEME} — ${klass}`;
  const holding = makeHolding({
    security,
    assetClass: "AIF",
    quantity: units,
    marketPrice: nav,
    // The summary row's Contribution Amount is this holding's cost basis, and
    // it is NET of the 0.005% stamp duty the fund deducted at allotment — the
    // ledger below prints the GROSS it was deducted from ("Initial Contribution
    // 75,00,00,000.00", then "Stamp Duty @ 0.005% (37,498.13)"), so the
    // statement does carry the amount the family paid; this reader does not
    // take it. Every other fund reader here (Helios, Active Momentum, Founders,
    // Delphi) takes the gross its statement prints, so the book states cost on
    // two bases (the figure audit's VD-24). Changing it here alone would break
    // the tie between this cost and the FIFO lots `build-book` strikes from the
    // capital record's net `invested`, so the basis moves in both places at once.
    totalCost: contribution,
    marketValue: printedValuation,
    source,
  });

  const totals = makeTotals({
    totalMarketValue: printedValuation,
    totalCost: contribution,
    source,
  });

  // ── the transaction ledger ────────────────────────────────────────────────
  const cashFlows = [];
  const seen = new Set();
  for (const m of flat.matchAll(TXN_ROW)) {
    const [, dateRaw, descRaw, , unitsCol, , amountRaw] = m;
    const date = toIso(dateRaw.replace(/-/g, "/"));
    const desc = descRaw.trim();
    const amount = parseNum(amountRaw);
    if (!date || amount === null) continue;
    const key = `${date}|${desc}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cashFlows.push(makeCashFlow({
      date,
      description: desc,
      security,
      // A contribution is money the family PUT IN. The statement prints stamp
      // duty as a parenthesised negative on its own line — "(37,498.13)" — but
      // TXN_ROW's parentheses sit OUTSIDE the captured group, so parseNum never
      // sees them and the amount is stored as a MAGNITUDE: +37,498.13, typed
      // `expense`. The kind is what carries the direction, and `build-book`
      // reads a charge as `Math.abs` for exactly that reason. (This comment used
      // to say parseNum read the sign off the page; it never did.)
      kind: /redemption|redeem/i.test(desc) ? "redemption"
        : /stamp\s*duty|expense|fee/i.test(desc) ? "expense"
        : "contribution",
      units: unitsCol === "-" ? null : parseNum(unitsCol),
      amount,
      source,
    }));
  }
  if (!cashFlows.length) warn(warnings, "transaction-ledger-not-read", "no dated rows matched under `Transactions`");

  const flows = makeFlows({
    contribution,
    // The window closes at the fund's own printed VALUATION — the figure the
    // holding carries. This read `corpus: contribution`, which made every
    // Sanshi value bridge close at the money paid in: ₹157.49 Cr across the
    // five folios against the ₹204.48 Cr the fund values them at, so a reader
    // saw contributions equal to the closing value and read a 0% return.
    corpus: printedValuation,
    periodFrom: cashFlows.length ? cashFlows.map((c) => c.date).sort()[0] : null,
    periodTo: asOf,
    source,
  });

  return {
    provider: PROVIDER,
    accountNo: folio,
    owner,
    pan,
    asOf,
    strategy: SCHEME,
    engagement: "AIF",
    providerEngagement: "Open Ended AIF CAT-III",
    holdings: [holding],
    totals,
    flows,
    cashFlows,
    returns: [],
    // Carried so a reader can see the basis without opening the PDF.
    postTaxNav,
    unitsRedeemed,
    sections: {
      summary: {
        name: "summary",
        rows: [
          ["class", "navDate", "nav", "unitsRedeemed", "unitsBalance", "contribution", "valuation"],
          [klass, asOf, String(nav), String(unitsRedeemed), String(units), String(contribution), String(printedValuation)],
        ],
      },
      transactions: {
        name: "transactions",
        rows: [["date", "description", "kind", "units", "amount"],
          ...cashFlows.map((c) => [c.date, c.description, c.kind, c.units ?? "", c.amount])],
      },
    },
    warnings,
    status: warnings.some((w) => w.code.endsWith("not-read") || w.code.endsWith("not-matched")) ? "partial" : "ok",
  };
}
