// TRANSITION VENTURE CAPITAL FUND I — AIF capital-account statement.
//
// A DRAWDOWN fund, and that is the whole point of reading it. Every other
// account in this book is fully funded: the family put money in and it is
// invested. Here they have COMMITTED ₹1.5 Cr per trust and drawn only half —
// ₹75 L each is still undrawn and will be called.
//
// The cockpit's Morning CIO said "DRY POWDER — no fund commitments in this book"
// while these two statements sat in `source/` unread. That is exactly the figure
// the client's spec asks for under "Upcoming Capital Calls", and it was being
// denied rather than reported.
//
// SHAPE
//   Summary of Capital Contributions   commitment, contributed, NAV/unit, units,
//                                      UNDRAWN COMMITMENT
//   Summary of Capital Distributions   distributions, TDS, fees — all zero here
//   Transaction Details                dated purchases
//   Closing Summary                    NAV date, class, amount, NAV/unit, units
//   Nav Details                        the capital account: source of funds,
//                                      income, expenditure, closing balance
//
// TWO TRUSTS, IDENTICAL FIGURES, AND THEY ARE NOT A DUPLICATE. `BHARAT
// JAISINGHANI FAMILY TRUST 2` and `TRUST 3` each committed ₹1.5 Cr, each drew
// ₹75 L on the same day at the same NAV, and each holds 7,500 units. Two separate
// legal entities that made the same investment — so both count, and the
// duplicate check (c) will flag them for a human exactly as it should.
import { parseNum } from "../lib/parseNum.mjs";
import { makeHolding, makeTotals, makeFlows, makeCashFlow } from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";

export const PROVIDER = "Transition Venture Capital";

const SCHEME = "Transition Venture Capital Fund I";
const warn = (warnings, code, detail) => warnings.push({ code, detail });

/** A labelled figure: `Total Capital Commitment 15,000,000.00`. */
function labelled(text, label) {
  const m = new RegExp(label + String.raw`\s+\(?(-?[\d,]+\.?\d*)\)?`, "i").exec(text);
  return m ? parseNum(m[1]) : null;
}

/** `31 Mar 2026 A1 17,145,961.88 2,286.1283 7,500.000 7,500.000` */
const CLOSING = new RegExp(
  String.raw`(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+` +   // 1 NAV date
  String.raw`([A-Z]\d?)\s+` +                        // 2 class
  String.raw`([\d,]+\.\d{2})\s+` +                   // 3 amount
  String.raw`([\d,]+\.\d{2,})\s+` +                  // 4 NAV per unit
  String.raw`([\d,]+\.\d{3})\s+` +                   // 5 units
  String.raw`([\d,]+\.\d{3})`,                       // 6 balance units
);

/** `17-Oct-2025 Purchase 7,500,000.00 1,000.0000 7,500.000 7,500.000` */
const TXN = new RegExp(
  String.raw`(\d{1,2}-[A-Za-z]{3}-\d{4})\s+` +       // 1 date
  String.raw`([A-Za-z][A-Za-z ]*?)\s+` +             // 2 description
  String.raw`([\d,]+\.\d{2})\s+` +                   // 3 amount
  String.raw`([\d,]+\.\d{2,})\s+` +                  // 4 NAV per unit
  String.raw`([\d,]+\.\d{3})\s+` +                   // 5 units
  String.raw`([\d,]+\.\d{3})`,                       // 6 balance units
  "g",
);

/** `Management Fees Expenditure 0.00 -89,261.78 -89,261.78` — the capital account. */
const NAV_DETAIL = new RegExp(
  String.raw`([A-Za-z][A-Za-z ]*?)\s+` +                                  // 1 particular
  String.raw`(Source of Funds|Income|Expenditure|Application of Funds)\s+` + // 2 type
  String.raw`(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})`,  // 3-5 opening, FY, closing
  "g",
);

export function extract({ grid, meta }) {
  const warnings = [];
  const source = meta.docKey;
  const flat = (grid.pages ?? []).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");

  // ── identity ──────────────────────────────────────────────────────────────
  // The holder here is a TRUST, not a natural person, so the name is taken
  // verbatim rather than through trimPersonName — "BHARAT JAISINGHANI FAMILY
  // TRUST 2" would lose its distinguishing numeral to a person-name trimmer, and
  // Trust 2 and Trust 3 would become one entity holding twice as much.
  const owner = (/\bName\s+([A-Z][A-Z0-9 .&'-]*?TRUST\s*\d*)\b/i.exec(flat) || [])[1]?.trim()
    ?? (/\bName\s+([A-Z][A-Z .'-]{4,60}?)(?=\s+Name|\s+Address|\n)/.exec(flat) || [])[1]?.trim() ?? null;
  const investorCode = (/Investor Code\s*:?\s*([A-Z]{2,6}\d{2,})/i.exec(flat) || [])[1] || null;
  const klass = (/\bClass\s*:?\s*([A-Z]\d?)\b/.exec(flat) || [])[1] || null;
  const pan = (/First Holder\s+([A-Z]{5}\d{4}[A-Z])/i.exec(flat) || [])[1] || null;
  const asOf = toIso((/Statement Date\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(flat) || [])[1]);

  if (!owner) warn(warnings, "owner-not-read", "no `Name <holder>` on the investor block");
  if (!investorCode) warn(warnings, "investor-code-not-read", "no `Investor Code :` on the statement");
  if (!pan) warn(warnings, "pan-not-read", "no `First Holder <PAN>` — identity cannot be joined on PAN");

  // ── commitment and drawdown ───────────────────────────────────────────────
  const commitment = labelled(flat, "Total Capital Commitment");
  const contributed = labelled(flat, "Capital Contributed Net of Initial Expenses");
  const undrawn = labelled(flat, "Undrawn Capital Commitment");
  const navPerUnit = labelled(flat, "Current Nav\\s*\\/\\s*Unit");
  const units = labelled(flat, "No\\. of Outstanding Unit");
  const distributed = labelled(flat, "Net Distribution");

  const closing = CLOSING.exec(flat);
  const closingValue = closing ? parseNum(closing[3]) : labelled(flat, "Closing Value\\(INR\\)");
  if (!closing) warn(warnings, "closing-summary-not-matched", "the NAV date / class / amount / NAV / units row did not match");

  // ── the holding ───────────────────────────────────────────────────────────
  // Units and NAV are the primitives; the closing amount is the printed check.
  const security = `${SCHEME}${klass ? ` — Class ${klass}` : ""}`;
  const holding = makeHolding({
    security,
    assetClass: "AIF",
    quantity: units,
    marketPrice: navPerUnit,
    totalCost: contributed,
    marketValue: closingValue,
    source,
  });

  const totals = makeTotals({
    totalMarketValue: closingValue,
    totalCost: contributed,
    positionCount: 1,
    source,
  });

  // ── dated rows ────────────────────────────────────────────────────────────
  const cashFlows = [];
  const seen = new Set();
  for (const m of flat.matchAll(TXN)) {
    const [, dateRaw, descRaw, amountRaw, , unitsRaw] = m;
    const date = toIso(dateRaw);
    const amount = parseNum(amountRaw);
    if (!date || amount === null) continue;
    const desc = descRaw.trim();
    const key = `${date}|${desc}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cashFlows.push(makeCashFlow({
      date, description: desc, security,
      kind: /redemption|distribution/i.test(desc) ? "distribution" : "contribution",
      units: parseNum(unitsRaw),
      amount,
      source,
    }));
  }

  // The capital account — where the fund's income and charges are itemised.
  const capitalAccount = [];
  for (const m of flat.matchAll(NAV_DETAIL)) {
    const [, particular, type, opening, forYear, closingBal] = m;
    capitalAccount.push({
      particular: particular.trim(), type,
      opening: parseNum(opening), forYear: parseNum(forYear), closing: parseNum(closingBal),
    });
  }
  const pick = (re) => capitalAccount.find((r) => re.test(r.particular))?.forYear ?? null;

  const flows = makeFlows({
    contribution: contributed,
    withdrawal: distributed,
    corpus: closingValue,
    income: pick(/market gain|income/i),
    fees: pick(/management fee/i),
    expenses: pick(/other expenses|bank charges/i),
    periodTo: asOf,
    source,
  });

  return {
    provider: PROVIDER,
    accountNo: investorCode,
    owner,
    pan,
    asOf,
    strategy: SCHEME,
    engagement: "AIF",
    providerEngagement: "Category I/II AIF — drawdown",
    holdings: [holding],
    totals,
    flows,
    cashFlows,
    returns: [],
    /**
     * THE COMMITMENT BLOCK. Carried as its own fact because a commitment is not
     * a holding: `undrawn` is money the family OWES the fund on demand, and it
     * belongs in dry powder and upcoming capital calls, never in NAV.
     */
    /**
     * `called` and `paid` are the SAME printed figure here, and that is the
     * statement's own arithmetic rather than an assumption: `Undrawn Capital
     * Commitment` = `Total Capital Commitment` − `Capital Contributed`, so this
     * fund strikes its uncalled balance on the contribution and leaves no room
     * between what it has demanded and what it has received.
     *
     * `calls` reuses the dated rows read above, keeping ONE reading of this
     * table rather than a second regex over the same text — and is published
     * only where the contribution rows reproduce the contributed figure the
     * summary block prints, which is the licence every dated table in this
     * pipeline needs. A distribution is not a call and is excluded by kind.
     */
    commitment: {
      total: commitment, contributed, undrawn, distributed,
      called: contributed, paid: contributed,
      calls: (() => {
        const rows = cashFlows.filter((c) => c.kind === "contribution" && c.date && typeof c.amount === "number");
        if (!rows.length || contributed == null) return [];
        const sum = Math.round(rows.reduce((t, c) => t + c.amount, 0) * 100) / 100;
        if (Math.abs(sum - contributed) > 1) {
          warn(warnings, "capital-calls-do-not-tie",
            `${rows.length} dated contributions sum to ${sum} against a printed Capital Contributed of ${contributed}; none is carried`);
          return [];
        }
        return rows.map((c) => ({ date: c.date, label: c.description, amount: c.amount }))
          .sort((a, b) => a.date.localeCompare(b.date));
      })(),
    },
    capitalAccount,
    sections: {
      commitment: {
        name: "commitment",
        rows: [["totalCommitment", "contributed", "undrawn", "navPerUnit", "units", "closingValue"],
          [commitment, contributed, undrawn, navPerUnit, units, closingValue]],
      },
      transactions: {
        name: "transactions",
        rows: [["date", "description", "kind", "units", "amount"],
          ...cashFlows.map((c) => [c.date, c.description, c.kind, c.units ?? "", c.amount])],
      },
      capitalAccount: {
        name: "capitalAccount",
        rows: [["particular", "type", "opening", "forTheYear", "closing"],
          ...capitalAccount.map((r) => [r.particular, r.type, r.opening, r.forYear, r.closing])],
      },
    },
    warnings,
    status: closingValue === null ? "failed" : warnings.length ? "partial" : "ok",
  };
}
