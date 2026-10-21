// The dated tables three fund statements print under their summaries — Motilal
// Oswal's `Transaction Details` (Founders, Delphi, Hedged Equity), Carnelian
// Amritkaal's `Transaction Details` and Baring's `Capital Transactions` — and the
// checks that license each of them.
// Run: node scripts/ingest/__tests__/fundTxnDetails.test.mjs
//
// Every statement below is SYNTHETIC text in the shape the reader meets after
// `extract()` collapses whitespace. Each check is then broken one figure at a
// time and the reader must refuse the WHOLE record and say why: a dated record
// with a row missing reads on screen exactly like a complete one.
import { moFlows, amritkaalFlows, baringFlows, extract } from "../providers/altFundStatements.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("fundTxnDetails");

const run = (fn, text, ...args) => {
  const warns = [];
  const rows = fn(text, (code, detail) => warns.push({ code, detail }), ...args);
  return { rows, warns, codes: warns.map((w) => w.code) };
};
const mutate = (text, from, to) => {
  if (!text.includes(from)) throw new Error(`fixture no longer contains ${JSON.stringify(from)}`);
  return text.replace(from, to);
};
const near = (a, b, eps = 1e-6) => typeof a === "number" && Math.abs(a - b) <= eps;
const refused = (r, code = "dated-table-does-not-tie") => r.rows.length === 0 && r.codes.includes(code);

// ── A FOUNDERS-SHAPED FOLIO: three purchases, a table that runs onto page 2 ───
const FOUNDERS = [
  "Account Statement",
  "Account No : 90000000001",
  "As on : 30 Sep 2026",
  "Motilal Oswal Founders Fund Series II",
  "Name : TEST INVESTOR Bank Name : SOME BANK",
  "Account Summary",
  "Class Details NAV Date Post Tax Unit Commitment Contribution Valuation XIRR",
  "CLASS G1 30-09-2026 11.6809 95,14,997.798 10,00,00,000.00 10,00,00,000.00 11,11,43,737.78",
  "Total 95,14,997.798 10,00,00,000.00 10,00,00,000.00 11,11,43,737.78 5.26",
  "Investment Summary",
  "CLASS G1 10,00,00,000.00 10,00,00,000.00 - 10,00,00,000.00 -",
  "Transaction Details : CLASS G1",
  "Date Transactions Allotment NAV Units Allotted Amount (INR)",
  "06-08-2024 Contribution - - 5,00,00,000.00",
  "06-08-2024 Stamp Duty as per SEBI circular dated 30th June 2020 @ - - (2,499.88)",
  "0.005%",
  "06-08-2024 Units Allotment 10.0000 49,99,750.012 4,99,97,500.12",
  "09-09-2024 Contribution - - 1,00,00,000.00",
  "09-09-2024 Stamp Duty as per SEBI circular dated 30th June 2020 @ 0.005% - - (499.98)",
  "09-09-2024 Units Allotment 10.4520 9,56,706.852 99,99,500.02",
  "Account Statement",
  "Account No : 90000000001",
  "As on : 30 Sep 2026",
  "Motilal Oswal Founders Fund Series II",
  "16-10-2024 Contribution - - 4,00,00,000.00",
  "16-10-2024 Stamp Duty as per SEBI circular dated 30th June 2020 @ 0.005% - - (1,999.90)",
  "16-10-2024 Units Allotment 11.2400 35,58,540.934 3,99,98,000.10",
  "Disclaimer",
  "1. This is a statement of account.",
].join("\n");
const g1 = (c) => `Motilal Oswal Founders Fund Series II — Class ${c}`;
{
  const base = run(moFlows, FOUNDERS, g1);
  ok("MO: the synthetic Founders table is published", base.rows.length === 3 && base.warns.length === 0,
    `${base.rows.length} rows ${JSON.stringify(base.warns)}`);
  const [a, b, c] = base.rows;
  ok("MO: a purchase is ONE contribution — the gross, the allotment as its net, the stamp duty as its charge",
    a?.kind === "contribution" && a.amount === 50000000 && a.netAmount === 49997500.12 && a.expenses === 2499.88
      && near(a.units, 4999750.012) && a.date === "2024-08-06" && a.description === "Contribution");
  ok("MO: the running units reach the Account Summary's Unit", near(c?.balance, 9514997.798) && near(b?.balance, 5956456.864));
  ok("MO: every row is named as the holding is, so the two share a securityKey",
    base.rows.every((r) => r.security === g1("G1")));

  ok("MO (1): a stamp duty that is not the gap between the gross and the allotment refuses",
    refused(run(moFlows, mutate(FOUNDERS, "(499.98)", "(498.98)"), g1)));
  ok("MO (2): units × NAV that is not the allotment's amount refuses",
    refused(run(moFlows, mutate(FOUNDERS, "10.4520 9,56,706.852", "10.4520 9,56,716.852"), g1)));
  ok("MO (3): units that do not reach the Account Summary's Unit refuse",
    refused(run(moFlows, mutate(FOUNDERS, "G1 30-09-2026 11.6809 95,14,997.798", "G1 30-09-2026 11.6809 95,14,998.798"), g1)));
  ok("MO (4): Contribution rows that do not sum to the summary's Contribution column refuse",
    refused(run(moFlows, mutate(FOUNDERS, "10,00,00,000.00 10,00,00,000.00 11,11,43,737.78", "10,00,00,000.00 10,00,10,000.00 11,11,43,737.78"), g1)));
  const undeclared = run(moFlows, mutate(FOUNDERS, "Disclaimer", "20-10-2024 Unit Redemption 11.0000 1,000.000 11,000.00\nDisclaimer"), g1);
  ok("MO: a dated row of an undeclared type withholds the record and names it",
    refused(undeclared, "transaction-type-not-declared"));
  ok("MO: a line of the table nothing claimed withholds the record",
    refused(run(moFlows, mutate(FOUNDERS, "Disclaimer", "Some stray figure 1,234.00\nDisclaimer"), g1), "transaction-line-not-read"));
  ok("MO: a rate wrap NOT under a stamp-duty label is not furniture",
    refused(run(moFlows, mutate(FOUNDERS, "09-09-2024 Contribution", "0.005%\n09-09-2024 Contribution"), g1), "transaction-line-not-read"));
  const twoClasses = mutate(mutate(FOUNDERS, "Total 95,14,997.798",
    "CLASS G2 30-09-2026 10.0000 1,000.000 10,000.00 10,000.00 10,000.00\nTotal 95,14,997.798"),
  "Disclaimer", "Transaction Details : CLASS G2\n01-10-2024 Contribution - - 10,000.00\n01-10-2024 Units Allotment 10.0000 1,000.000 10,000.00\nDisclaimer");
  ok("MO: two classes under their own names are both published", run(moFlows, twoClasses, g1).rows.length === 4);
  const merged = run(moFlows, twoClasses, () => "one name");
  ok("MO: two classes carried under ONE name refuse rather than merge",
    refused(merged) && /would merge/.test(merged.warns[0]?.detail ?? ""));
}

// ── A HEDGED-EQUITY-SHAPED FOLIO: a class switch, a payout, both classes at nil ─
const HEDGED = [
  "Account No : 90000000002 As on : 31 Jul 2026",
  "Motilal Oswal Hedged Equity Multi Factor Strategy",
  "Name : TEST INVESTOR Bank Name : SOME BANK",
  "Account Summary Post Tax",
  "Class Details NAV Date Post Tax NAV Unit Commitment Contribution Valuation XIRR",
  "Class B2 31-07-2026 8.9812 - 13,00,00,000.00 13,00,00,000.00 -",
  "Class F1 31-07-2025 8.5353 - 13,11,05,601.80 13,11,05,601.75 -",
  "Total - - -",
  "Transaction Details : Class B2",
  "Date Transactions Allotment NAV Units Allotted Amount (INR)",
  "29-07-2024 Contribution - - 13,00,00,000.00",
  "29-07-2024 Stamp Duty as per SEBI circular dated 30th June 2020 @ - - (6,499.68)",
  "0.005%",
  "29-07-2024 Units Allotment 10.8357 1,19,96,779.195 12,99,93,500.32",
  "31-07-2024 Contribution - - -",
  "31-07-2024 Switch Out 10.9284 1,19,96,779.195 13,11,05,601.75",
  "Account No : 90000000002 As on : 31 Jul 2026",
  "Motilal Oswal Hedged Equity Multi Factor Strategy",
  "Transaction Details : Class F1",
  "Date Transactions Allotment NAV Units Allotted Amount (INR)",
  "31-07-2024 Contribution - - 13,11,05,601.75",
  "31-07-2024 Stamp Duty as per SEBI circular dated 30th June 2020 @ - - (6,554.95)",
  "0.005%",
  "31-07-2024 Switch in 10.0000 1,31,09,904.680 13,10,99,046.80",
  "31-07-2025 Unit Redemption-Payout 8.5353 (1,31,09,904.680) (11,18,96,969.42)",
  "Disclaimer:",
].join("\n");
const he = (c) => `Motilal Oswal Hedged Equity Multi Factor Strategy — Class ${c}`;
{
  const base = run(moFlows, HEDGED, he);
  ok("MO switch: the synthetic Hedged Equity table is published", base.rows.length === 4 && base.warns.length === 0,
    `${base.rows.length} rows ${JSON.stringify(base.warns)}`);
  const [buy, out, inn, paid] = base.rows;
  ok("MO switch: the external purchase is the one contribution", buy?.kind === "contribution" && buy.amount === 130000000
    && buy.netAmount === 129993500.32 && buy.expenses === 6499.68 && buy.security === he("B2"));
  ok("MO switch: the switch is TWO reclassification legs, never capital", out?.kind === "reclassification"
    && inn?.kind === "reclassification" && out.amount === -131105601.75 && inn.amount === 131105601.75
    && near(out.units, -11996779.195) && near(inn.units, 13109904.68) && out.security === he("B2") && inn.security === he("F1"));
  ok("MO switch: the leg out comes before the leg in, and the legs net to nil in rupees",
    out.date === inn.date && out.amount + inn.amount === 0 && base.rows.indexOf(out) < base.rows.indexOf(inn));
  ok("MO switch: the stamp duty the transfer paid rides on the leg in, as printed",
    inn.expenses === 6554.95 && inn.netAmount === 131099046.8);
  ok("MO switch: the payout is a withdrawal signed as printed, its units out of the folio",
    paid?.kind === "withdrawal" && paid.amount === -111896969.42 && near(paid.units, -13109904.68) && paid.balance === 0);
  ok("MO switch: no row is struck for the `Contribution - - -` that prints no figure",
    base.rows.filter((r) => r.kind === "contribution").length === 1);

  ok("MO (5): a Switch Out whose rupees fund no Switch in refuses",
    refused(run(moFlows, mutate(HEDGED, "31-07-2024 Switch Out 10.9284 1,19,96,779.195 13,11,05,601.75", "31-07-2024 Switch Out 10.9284 1,19,96,779.195 13,11,05,601.75".replace("13,11,05,601.75", "13,11,05,611.75")), he)));
  ok("MO (5): a Switch in nothing switched out of refuses",
    refused(run(moFlows, mutate(HEDGED, "31-07-2024 Switch Out 10.9284 1,19,96,779.195 13,11,05,601.75\n", ""), he)));
  ok("MO (3): a dash Unit is nil only where the record reaches nil",
    refused(run(moFlows, mutate(HEDGED, "31-07-2025 Unit Redemption-Payout 8.5353 (1,31,09,904.680) (11,18,96,969.42)\n", ""), he)));
  ok("MO (2): a payout whose units × NAV is not its amount refuses",
    refused(run(moFlows, mutate(HEDGED, "(11,18,96,969.42)", "(11,18,97,969.42)"), he)));

  // Through the reader: both classes become MEASURED zeros, only because the
  // record ties. A dash beside a record that does not tie stays no holding.
  const grid = (t) => ({ pages: [{ text: t }] });
  const doc = extract({ grid: grid(HEDGED) });
  ok("MO extract: both classes are carried at nil units, the printed post-tax NAV and its date, and no cost",
    doc.holdings.length === 2 && doc.holdings.every((h) => h.quantity === 0 && h.totalCost === null && h.printed.marketValue === null)
      && doc.holdings[0].marketPrice === 8.9812 && doc.holdings[0].priceAsOn === "2026-07-31"
      && doc.holdings[1].marketPrice === 8.5353 && doc.holdings[1].priceAsOn === "2025-07-31",
    JSON.stringify(doc.holdings.map((h) => [h.security, h.quantity, h.marketPrice, h.priceAsOn, h.totalCost])));
  ok("MO extract: the nil is a statement note, not a read gap", doc.warnings.some((w) => w.code === "redeemed-to-nil")
    && !doc.warnings.some((w) => w.code === "class-redeemed-to-nil"));
  ok("MO extract: the dated record rides with the holdings", doc.cashFlows.length === 4);
  const broken = extract({ grid: grid(mutate(HEDGED, "(11,18,96,969.42)", "(11,18,97,969.42)")) });
  ok("MO extract: with a record that does not tie, a dash stays a dash — no holding, the reason named",
    broken.holdings.length === 0 && broken.cashFlows.length === 0
      && broken.warnings.some((w) => w.code === "account-holds-nothing")
      && broken.warnings.some((w) => w.code === "dated-table-does-not-tie"));
}

// ── CARNELIAN AMRITKAAL: a drawdown topped up by reinvested fund income ───────
const AMRITKAAL = [
  "CARNELIAN BHARAT AMRITKAAL FUND",
  "Summary of Capital Contributions and Distributions",
  "Capital Commitment (INR) Capital Called (INR) Amount Contributed (INR) Net Contribution (INR)",
  "15,00,00,000.00 15,00,00,000.00 15,00,02,925.10 14,99,95,425.33",
  "Transaction Details",
  "Carnelian Bharat Amritkaal Fund",
  "Transaction Gross Allotment",
  "Transaction Description Class Distribution (INR) Units Allotted Net Contribution",
  "Date Contribution (INR) NAV (INR)",
  "31-Aug-2025 Contribution Amount CLASS A2 - 10,00,00,000.00 - - -",
  "31-Aug-2025 Stamp Duty @ 0.005% CLASS A2 - (4,999.75) - - -",
  "31-Aug-2025 Unit Allotment CLASS A2 - - 11.3953 87,75,109.058 9,99,95,000.25",
  "31-Dec-2025 DRAWDOWN Transaction CLASS A2 - 5,00,00,000.00 - - -",
  "Net Income Earned From MF",
  "31-Dec-2025 CLASS A2 - 2,925.10 11.8541 42,17,985.767 2,925.10",
  "Investments",
  "31-Dec-2025 Stamp Duty @ 0.005% CLASS A2 - (2,500.02) - - -",
  "31-Dec-2025 Unit Allotment CLASS A2 - - 11.8541 42,17,985.767 5,00,00,425.08",
  "Closing Unit Balance :",
  "Summary as on 31-Jul-2026 Pre tax NAV : 12.5540 Closing Value : 16,31,15,312.43 Pledge : 0.000",
  "1,29,93,094.825",
].join("\n");
{
  const base = run(amritkaalFlows, AMRITKAAL);
  ok("Amritkaal: the synthetic table is published", base.rows.length === 2 && base.warns.length === 0,
    `${base.rows.length} rows ${JSON.stringify(base.warns)}`);
  const [a, b] = base.rows;
  ok("Amritkaal: each allotment is one contribution — the external rupees, the net, the stamp duty",
    a?.amount === 100000000 && a.netAmount === 99995000.25 && a.expenses === 4999.75 && near(a.units, 8775109.058)
      && b?.amount === 50000000 && b.netAmount === 50000425.08 && b.expenses === 2500.02 && near(b.units, 4217985.767));
  ok("Amritkaal: the reinvested income is named, not counted as money in or as units twice",
    /2925\.1 Net Income Earned From MF Investments/.test(b?.notes ?? "") && near(b?.balance, 12993094.825));
  ok("Amritkaal: the per-date tie refuses a stamp duty that is not the gap",
    refused(run(amritkaalFlows, mutate(AMRITKAAL, "(2,500.02)", "(2,500.12)"))));
  ok("Amritkaal: the Closing Unit Balance refuses units that do not reach it",
    refused(run(amritkaalFlows, mutate(AMRITKAAL, "1,29,93,094.825", "1,29,93,095.825"))));
  ok("Amritkaal: Amount Contributed refuses a table that does not reach it",
    refused(run(amritkaalFlows, mutate(AMRITKAAL, "15,00,02,925.10", "15,00,03,925.10"))));
  ok("Amritkaal: a Gross Distribution is money out on an undeclared row, and refuses",
    refused(run(amritkaalFlows, mutate(AMRITKAAL, "31-Aug-2025 Stamp Duty @ 0.005% CLASS A2 - (4,999.75)", "31-Aug-2025 Stamp Duty @ 0.005% CLASS A2 1.00 (4,999.75)"))));
  ok("Amritkaal: an undeclared dated type withholds the record",
    refused(run(amritkaalFlows, mutate(AMRITKAAL, "Closing Unit Balance :", "15-Jan-2026 Redemption CLASS A2 - - 12.0000 1,000.000 12,000.00\nClosing Unit Balance :")), "transaction-type-not-declared"));
  ok("Amritkaal: an income row reprinting different units than its allotment refuses",
    refused(run(amritkaalFlows, mutate(AMRITKAAL, "11.8541 42,17,985.767 2,925.10", "11.8541 246.757 2,925.10"))));
}

// ── BARING: four drawdowns at face value ─────────────────────────────────────
const BARING = [
  "Baring Private Equity India Fund 6",
  "Class of Units /",
  "Class A1 / INF15Q422013 Hurdle Rate 10%.",
  "Capital Commitment A 5,00,00,000 - -",
  "Capital Call B 2,02,50,000 - 40.50%",
  "Capital Contribution C 2,02,50,000 - 40.50%",
  "Pending Contribution D = B - C - - -",
  "Capital Distribution (Re-callable) 3 E - - -",
  "Capital Distribution (Not Re-callable) 4 F - - -",
  "Balance Capital H = C - E - F 2,02,50,000 - -",
  "Balance Units I = H / Face Value - 202.50 -",
  "TRANSACTION ALLOTMENT/ FACE VALUE/",
  "CAPITAL TRANSACTIONS UNITS AMOUNT (INR)",
  "DATE REDEMPTION DATE NAV (INR)",
  "DRAWDOWN 1 03/10/2024 09/10/2024 1,00,000 65.00 65,00,000",
  "DRAWDOWN 2 05/12/2024 27/12/2024 1,00,000 50.00 50,00,000",
  "DRAWDOWN 3 22/07/2025 26/07/2025 1,00,000 25.00 25,00,000",
  "DRAWDOWN 4 25/09/2025 25/09/2025 1,00,000 62.50 62,50,000",
  "INCOME TRANSACTIONS DATE Gross Income (INR) TDS (INR) NET (INR)",
].join("\n");
{
  const base = run(baringFlows, BARING);
  ok("Baring: the synthetic table is published", base.rows.length === 4 && base.warns.length === 0,
    `${base.rows.length} rows ${JSON.stringify(base.warns)}`);
  ok("Baring: each drawdown is a contribution on its TRANSACTION date, its own net, its units",
    base.rows[0]?.date === "2024-10-03" && base.rows[0].amount === 6500000 && base.rows[0].netAmount === 6500000
      && base.rows[0].units === 65 && /allotted 2024-10-09/.test(base.rows[0].notes)
      && base.rows[3].balance === 202.5 && base.rows.every((r) => r.security === "Baring Private Equity India Fund 6 — Class A1" && r.isin === "INF15Q422013"));
  ok("Baring: a row that is not its units at face value refuses",
    refused(run(baringFlows, mutate(BARING, "50.00 50,00,000", "50.00 50,10,000"))));
  ok("Baring: units that are not Balance Units I refuse",
    refused(run(baringFlows, mutate(BARING, "Face Value - 202.50", "Face Value - 203.50"))));
  ok("Baring: rupees that are not Capital Contribution C refuse",
    refused(run(baringFlows, mutate(BARING, "Capital Contribution C 2,02,50,000", "Capital Contribution C 2,03,50,000"))));
  ok("Baring: capital distributed (E) is money out on no declared row, and refuses",
    refused(run(baringFlows, mutate(BARING, "(Re-callable) 3 E - - -", "(Re-callable) 3 E 1,00,000 - -"))));
  ok("Baring: a dated row of another type withholds the record",
    refused(run(baringFlows, mutate(BARING, "INCOME TRANSACTIONS", "REDEMPTION 1 01/01/2026 01/01/2026 1,00,000 1.00 1,00,000\nINCOME TRANSACTIONS")), "transaction-type-not-declared"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
