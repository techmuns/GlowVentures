// 360 ONE ALTERNATES — AIF distribution letters and statements of earnings.
//
// A DIFFERENT ISSUER FROM 360 ONE PRIVATE WEALTH, and the distinction is the
// reason this file exists. The wealth arm publishes a client-level PORTFOLIO
// ANALYSIS REPORT covering everything a CRN holds; the alternates arm publishes
// per-FOLIO correspondence about one fund. `providers/threeSixtyOne.mjs` reads
// the first and reported "no reader for this report type" about the second —
// correctly, and about five documents carrying facts no other statement here has.
//
// WHAT THEY CARRY
//
//   INCOME DISTRIBUTION LETTER      what was paid, when, and the FY-by-FY
//                                   breakdown behind it (income, and recoveries
//                                   of expenses accrued in earlier years)
//   STATEMENT OF EARNINGS           the investor's pro-rata share of the fund's
//                                   income by TAX HEAD — long-term, short-term,
//                                   debt/liquid — plus expenses and TDS
//   distribution advice e-mail      the announcement, with no figures
//
// WHY THE TAX HEADS MATTER. A Category-II AIF has pass-through status: its
// income is taxed in the investor's hands, in the same character it had in the
// fund. So this statement is the ONLY place in the drop that says how much of
// this family's AIF income is long-term, how much short-term, and how much came
// from debt — three different rates. Collapsing them into one "income" figure
// would lose exactly the distinction the pass-through exists to preserve.
//
// A DISTRIBUTION IS NOT A GAIN, AND IS NOT ADDED TO ONE. `distributedIncome` on
// the 360 ONE holding is what the wealth arm's holding statement reports; this
// is the dated event behind it. Both are carried; neither is summed into the
// other, and the reconciler compares them.
//
// UNITS AND FOLIO ARE THE CROSS-CHECK. `Folio No: 1000633 … Total Units:
// 9,90,429.684 … Class A3` — the same class of the same fund the holding
// statement marks at ₹1,45,80,412.51 under two family members. That duplicate is
// this book's one live case of check (c), and these letters name the folio it
// actually belongs to.
import { parseNum } from "../lib/parseNum.mjs";
import { makeIncomeEvent, makeCashFlow } from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";

export const PROVIDER = "360 ONE Alternates Asset Management";

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const num = (s) => parseNum(s);

/** The scheme, as these letters title themselves. */
const SCHEME = /360\s*ONE\s+Special\s+Opportunities\s+Fund\s*[–-]\s*Series\s+(\d+)/i;

/**
 * `1 Long Term Capital Gain/(Loss) on Listed Equity Share (STT Paid) (1,767)`
 *
 * A parenthesised figure is NEGATIVE — that is the statement's own convention,
 * and `parseNum` already reads it as one. The head is captured verbatim because
 * its exact wording is the tax character, and paraphrasing it here would put a
 * judgement about tax treatment into a parser.
 */
const INCOME_ROW = /^\s*(\d)\s+(.*?(?:Capital Gain\/\(Loss\)[^()]*(?:\([^)]*\))?|Total Income|Total Expenses|Net Income Post Expenses))\s+\(?(-?[\d,]+)\)?\s*$/;

/** `Financial Year 2024-25 Income net of expenses Pre TDS (A)*  3,37,879` */
const FY_ROW = /Financial Year (\d{4}-\d{2}) Income net of expenses (Pre|Post) TDS \([A-G]\)\*?\s+\(?(-?[\d,]+)\)?/gi;

/** `Recovery for FY 21-22 (D)**  (2,21,006)` */
const RECOVERY_ROW = /Recovery for FY (\d{2}-\d{2}) \([A-G]\)\*{0,2}\s+(?:\(([\d,]+)\)|(-)|([\d,]+))/gi;

export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const pages = grid.pages ?? [];
  const text = pages.map((p) => p.text).join("\n");
  const flat = text.replace(/[ \t]+/g, " ");

  // ── identity ──────────────────────────────────────────────────────────────
  const series = SCHEME.exec(flat);
  const scheme = series ? `360 ONE Special Opportunities Fund - Series ${series[1]}` : null;
  // `Folio No: 1000633` on the letters, and `… Series 8 : Folio\n1000633` in the
  // advice e-mail, where the subject line wraps. Both forms, one pattern.
  const folio = (/Folio\s*(?:No\.?)?\s*:?\s*\n?\s*(\d{5,})/i.exec(flat) || [])[1] || null;
  const pan = (/PAN\s*No\.?\s*:?\s*([A-Z]{5}\d{4}[A-Z])/i.exec(flat) || [])[1] || null;
  const klass = (/(?:Unit\s*)?Class\s*(?:of\s*Units)?\s*:?\s*([A-Z]\d?)\b/i.exec(flat) || [])[1] || null;
  const units = num((/Total\s*Units\s*(?:Outstanding)?\s*:?\s*([\d,]+\.\d+)/i.exec(flat) || [])[1]);
  // `Dear Bharat Jaisinghani,` is the most reliable name on the page — the
  // address block wraps and the letterhead is the manager's.
  const owner = trimPersonName((/Dear\s+([A-Z][A-Za-z .']{3,50}?)\s*,/.exec(flat) || [])[1]);

  if (!folio) warn(warnings, "folio-not-read", "no `Folio No` on the letter");
  if (!scheme) warn(warnings, "scheme-not-read", "no `360 ONE Special Opportunities Fund – Series N` title");

  const isEarnings = /STATEMENT\s+OF\s+EARNINGS/i.test(flat);
  const isDistribution = /INCOME\s+DISTRIBUTION\s+LETTER/i.test(flat);

  // ── the statement of earnings: income by TAX HEAD ─────────────────────────
  const incomeHeads = [];
  let totalIncome = null;
  let totalExpenses = null;
  let netIncome = null;
  let tds = null;
  if (isEarnings) {
    for (const line of flat.split("\n")) {
      const m = INCOME_ROW.exec(line.trim());
      if (!m) continue;
      const [, , head, amountRaw] = m;
      /**
       * THE PARENTHESES THAT MAKE A FIGURE NEGATIVE ARE THE ONES AROUND IT.
       *
       * Every row on this statement contains `(Loss)` and most contain
       * `(STT Paid)`, so testing the LINE for a bracket negated all six heads and
       * turned +7,38,106 of income into -7,41,640. `INCOME_ROW` captures the
       * amount without its brackets, so the test is whether the character just
       * before the capture is one — which is what the fund actually means by it.
       */
      const negated = new RegExp(String.raw`\(` + amountRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + String.raw`\)`).test(line);
      const magnitude = num(amountRaw);
      if (magnitude === null) continue;
      const amount = negated ? -Math.abs(magnitude) : magnitude;
      const label = head.replace(/\s+/g, " ").trim();
      if (/^Total Income$/i.test(label)) totalIncome = amount;
      else if (/^Total Expenses$/i.test(label)) totalExpenses = amount;
      else if (/^Net Income Post Expenses$/i.test(label)) netIncome = amount;
      else incomeHeads.push({ head: label, amount });
    }
    tds = num((/Total Estimated Tax to be deducted at source[\s\S]{0,220}?\((-?[\d,]+)\)/i.exec(flat) || [])[1]);
    if (tds !== null) tds = -Math.abs(tds);
    if (!incomeHeads.length) {
      warn(warnings, "income-heads-not-read",
        "no `<n> <tax head> <amount>` row matched under `Details of Income` — the pass-through character of this income is what this document alone carries");
    }
    // The statement's own arithmetic, checked rather than assumed: the heads
    // must sum to the printed Total Income.
    const summed = incomeHeads.reduce((t, h) => t + h.amount, 0);
    if (totalIncome !== null && Math.abs(summed - totalIncome) > 1) {
      warn(warnings, "income-heads-do-not-sum",
        `the tax heads sum to ${summed.toLocaleString("en-IN")} against a printed Total Income of ${totalIncome.toLocaleString("en-IN")}`);
    }
  }

  // ── the distribution letter: what was paid, and the FY behind it ──────────
  const distributionFy = [];
  let netDistributed = null;
  let paidOn = null;
  if (isDistribution) {
    for (const m of flat.matchAll(FY_ROW)) {
      distributionFy.push({ fy: m[1], basis: `${m[2]} TDS`, amount: num(m[3]) });
    }
    for (const m of flat.matchAll(RECOVERY_ROW)) {
      // `-` means the fund reported NO recovery for that year, which is a zero it
      // measured; a parenthesised figure is the recovery, and it is negative.
      const amount = m[2] ? -Math.abs(num(m[2])) : m[3] ? 0 : num(m[4]);
      distributionFy.push({ fy: `20${m[1]}`, basis: "expense recovery", amount });
    }
    netDistributed = num((/Net Amount Distributed \(G\)[^\n]*?\s(-?[\d,]+)\s*$/im.exec(flat) || [])[1]);
    paidOn = toIso((/processed on\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\s+(\d{4})/i.exec(flat) || []).slice(1).join(" ").trim() || null);
    if (netDistributed === null) {
      warn(warnings, "distribution-amount-not-read", "no `Net Amount Distributed (G)` row matched in the investor-level summary");
    }
  }

  const letterDate = toIso((/Date\s*:?\s*(\d{1,2})\s*(?:st|nd|rd|th)\s+([A-Za-z]{3,})\s+(\d{4})/i.exec(flat) || []).slice(1).join(" ").trim() || null);
  const asOf = paidOn ?? letterDate;

  if (!isEarnings && !isDistribution) {
    warn(warnings, "advice-only",
      "this is the distribution ADVICE e-mail: it announces a payout of ~6.90% of capital commitment and carries no figures. The detailed letter it promises is the document with the numbers.");
  }

  // ── the dated events ──────────────────────────────────────────────────────
  const income = [];
  const cashFlows = [];
  const security = `${scheme ?? "360 ONE Special Opportunities Fund"}${klass ? ` Class ${klass}` : ""}`;
  if (netDistributed !== null) {
    income.push(makeIncomeEvent({
      security,
      kind: "distribution",
      exDate: letterDate,
      receivedDate: paidOn,
      quantity: units,
      netAmount: netDistributed,
      source,
    }));
    cashFlows.push(makeCashFlow({
      date: paidOn ?? letterDate,
      description: "AIF income distribution, net of expenses and TDS",
      security,
      kind: "distribution",
      units,
      amount: netDistributed,
      source,
    }));
  }

  const sections = {};
  if (incomeHeads.length) {
    sections.incomeByTaxHead = {
      name: "incomeByTaxHead",
      rows: [["head", "amount"],
        ...incomeHeads.map((h) => [h.head, h.amount]),
        ["Total Income", totalIncome ?? ""],
        ["Total Expenses", totalExpenses ?? ""],
        ["Net Income Post Expenses", netIncome ?? ""],
        ["TDS", tds ?? ""]],
    };
  }
  if (distributionFy.length) {
    sections.distribution = {
      name: "distribution",
      rows: [["financialYear", "basis", "amount"],
        ...distributionFy.map((d) => [d.fy, d.basis, d.amount]),
        ["net distributed", "", netDistributed ?? ""]],
    };
  }

  return {
    provider: PROVIDER,
    accountNo: folio,
    owner,
    pan,
    asOf,
    strategy: scheme,
    engagement: "AIF",
    providerEngagement: "Category II AIF — pass-through",
    holdings: [],
    totals: null,
    returns: [],
    income,
    cashFlows,
    /**
     * INCOME BY TAX HEAD — carried as its own fact, never collapsed.
     * A Category-II AIF passes income through in the character it earned it, and
     * long-term, short-term and debt income are taxed at three different rates.
     */
    aifEarnings: incomeHeads.length
      ? { heads: incomeHeads, totalIncome, totalExpenses, netIncome, tds, units, folio, class: klass }
      : null,
    sections,
    warnings,
    status: incomeHeads.length || netDistributed !== null
      ? (warnings.length ? "partial" : "ok")
      : "partial",
  };
}
