// The full unit ledger HDFC, Kotak and ABSL print inside each scheme block
// (layout 7 of providers/mutualFundFolio.mjs, Stage 10ff), through the real
// `extract()`. Run: node scripts/ingest/__tests__/schemeLedger.test.mjs
//
// Written against the archived layouts with INVENTED holders, folios, schemes
// and figures, each tied by construction. Every mutation must withhold the
// document's whole ledger and say why — a half-read history reads like a whole one.
import { extract } from "../providers/mutualFundFolio.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("schemeLedger");

const read = (text) => {
  const out = extract({ grid: { pages: [{ text }] }, meta: { docKey: "t" } });
  return { out, flows: out.cashFlows ?? [], holdings: out.holdings ?? [], warns: (out.warnings ?? []).map((w) => w.code ?? w) };
};
const of = (flows, security) => flows.filter((f) => f.security === security);

// ── HDFC: a since-inception statement, two schemes, a switch across dates ────
const HDFC = `
For any enquiries, Email : hello@hdfcfund.com
Account Statement (From 01-APR-2019 To 31-AUG-2026)
Folio No. : 11112222 / 01 Statement Date : 01-Oct-2026
Asha Testholder
Mode of Holding : Single
Tax Status : Individual
Account Summary as on 31-AUG-2026
Sample Equity Lump sum 31-Aug-2026 20.000 NA 900.000 15,000.25 18,000.00
1111 / Sample Liquid Fund - Direct Plan - IDCW Daily Reinvest* - INF000A01AA1 UCC : MFX0001 ,
Option : Reinvest
NAV Amount Price Number of Balance
Opening Balance as on 01/04/2019 0.000
01/04/2019 Purchase 1,000.0000 100,000.00 1,000.0000 100.000 100.000
02/04/2019 IDCW Reinvested @ Rs.0.2 per unit 1,000.0000 20.00 1,000.0000 0.020 100.020
03/04/2019 ***Power of Attorney (For UnitHolder)***
05/04/2019 Switch Out - To Sample Equity Fund - Direct Growth 1,000.0000 (10,000.00) 1,000.0000 (10.000) 90.020
10/04/2019 Redemption - Direct Credit 1,000.0000 (90,020.00) 1,000.0000 (90.020) 0.000  EISC-SAMPLE-16.18.0
Available Units to Redeem : 0.000
Market Value of Balance Units at NAV of 1,000.0000 on 31/08/2026 (INR) : 0.00 Total Units Under Lien : 0.000
IDCW reinvested / paid (INR) : 20.00 Total IDCW reinvested / paid (INR) : 20.00
2222 / Sample Equity Fund - Direct Growth* - INF000A01BB2 UCC : MFX0002
Opening Balance as on 08/04/2019 0.000
08/04/2019 Switch-In - From Sample Liquid Fund-DP-Dly Div 10.000 10,000.00 10.000 1,000.000 1,000.000
Gross Purchase Physical 5,000.25
Less: Stamp Duty 0.25
03/08/2022 Net Purchase 10.000 5,000.00 10.0000 500.000 1,500.000
continued...
Page 2 of 2
Account Statement (Folio No. : 11112222 / 01)
2222 / Sample Equity Fund - Direct Growth* - INF000A01BB2 UCC : MFX0002
14/01/2023 *Redemption - Direct Credit , less STT 20.000 (9,995.00) 20.0000 (500.000) 1,000.000
*** STT Paid *** (5.00)
29/05/2025 25.000 (2,497.50) 25.000 (100.000) 900.000
Redemption - Direct Credit , less STT
*** STT Paid *** (2.50)
Available Units to Redeem : 900.000
Market Value of Balance Units at NAV of 20.000 on 31/08/2026 (INR) : 18,000.00 Total Units Under Lien : 0.000
IDCW reinvested / paid (INR) : 0.00 Total IDCW reinvested / paid (INR) : 0.00
Non Financial Transaction(s)
18/04/2019 Address Updated from KRA Data
`;
const LIQ = "Sample Liquid Fund - Direct Plan - IDCW Daily Reinvest", EQ = "Sample Equity Fund - Direct Growth";
{
  const { out, flows, holdings, warns } = read(HDFC);
  ok("hdfc: read completely", out.status === "ok" && warns.length === 0, `${out.status} ${JSON.stringify(out.warnings)}`);
  ok("hdfc: both schemes held, one redeemed to nil", holdings.length === 2 && holdings.find((h) => h.isin === "INF000A01AA1")?.quantity === 0
    && holdings.find((h) => h.isin === "INF000A01BB2")?.quantity === 900, JSON.stringify(holdings.map((h) => [h.security, h.quantity])));
  ok("hdfc: every printed movement, plus each scheme's printed opening", flows.length === 10, JSON.stringify(flows.map((f) => [f.date, f.kind])));
  const liq = of(flows, LIQ), eq = of(flows, EQ);
  ok("hdfc: the printed opening is an opening-units row", liq[0]?.kind === "opening-units" && liq[0]?.units === 0 && liq[0]?.date === "2019-04-01"
    && eq[0]?.kind === "opening-units" && eq[0]?.date === "2019-04-08", JSON.stringify([liq[0], eq[0]]));
  const buy = liq[1] ?? {};
  ok("hdfc: a pre-July-2020 purchase is gross = net, no charge line", buy.kind === "contribution" && buy.amount === 100000
    && buy.netAmount === 100000 && buy.expenses === null && buy.units === 100, JSON.stringify(buy));
  ok("hdfc: IDCW reinvested is an allotment", liq[2]?.kind === "allotment" && liq[2]?.amount === 20 && liq[2]?.units === 0.02, JSON.stringify(liq[2]));
  const out1 = liq[3] ?? {}, in1 = eq[1] ?? {};
  ok("hdfc: a switch inside the folio is two reclassification legs for the same rupees", out1.kind === "reclassification" && out1.amount === -10000
    && in1.kind === "reclassification" && in1.amount === 10000 && out1.units === -10 && in1.units === 1000, JSON.stringify([out1, in1]));
  ok("hdfc: the out-leg names the in-leg's printed date as its settlement", out1.date === "2019-04-05" && out1.settlementDate === "2019-04-08"
    && in1.date === "2019-04-08", JSON.stringify([out1.date, out1.settlementDate, in1.date]));
  ok("hdfc: a redemption with no STT pays what it prints", liq[4]?.kind === "withdrawal" && liq[4]?.amount === -90020 && liq[4]?.expenses === null
    && liq[4]?.balance === 0, JSON.stringify(liq[4]));
  const net = eq[2] ?? {};
  ok("hdfc: gross and stamp duty printed ABOVE the net purchase", net.kind === "contribution" && net.amount === 5000.25 && net.netAmount === 5000
    && net.expenses === 0.25 && net.date === "2022-08-03", JSON.stringify(net));
  ok("hdfc: a redemption prints the paid amount, STT as its charge", eq[3]?.amount === -9995 && eq[3]?.expenses === 5 && eq[3]?.units === -500,
    JSON.stringify(eq[3]));
  ok("hdfc: a type cell wrapped below its figures is still the redemption", eq[4]?.kind === "withdrawal" && eq[4]?.amount === -2497.5
    && eq[4]?.expenses === 2.5 && /less STT/.test(eq[4]?.description ?? "") && eq[4]?.balance === 900, JSON.stringify(eq[4]));
  ok("hdfc: no Stage 10em placeholder opening once the ledger is read",
    !flows.some((f) => /Prior unit balance/.test(f.description)), JSON.stringify(flows.map((f) => f.description)));
}
const hdfcMutations = [
  ["STT does not tie the paid amount to units × price", HDFC.replace("*** STT Paid *** (5.00)", "*** STT Paid *** (6.00)"), "ledger-not-published"],
  ["running balance breaks", HDFC.replace("500.000 1,500.000", "500.000 1,501.000"), "ledger-not-published"],
  ["the switch-in falls outside the settlement week", HDFC.replace("08/04/2019 Switch-In", "20/04/2019 Switch-In"), "ledger-not-published"],
  ["the IDCW the block prints is not the reinvestments read", HDFC.replace("IDCW reinvested / paid (INR) : 20.00", "IDCW reinvested / paid (INR) : 21.00"), "ledger-not-published"],
  ["a gross line with no stamp duty after July 2020", HDFC.replace("Less: Stamp Duty 0.25\n", ""), "ledger-not-published"],
  ["an unread dated movement", HDFC.replace("10/04/2019 Redemption", "09/04/2019 Transmission - Out 1,000.0000 0.00 1,000.0000 0.000 90.020\n10/04/2019 Redemption"), "unsupported-movement"],
  ["the ledger does not end at the scheme's closing units", HDFC.replace("Available Units to Redeem : 900.000", "Available Units to Redeem : 901.000")
    .replace("900.000 15,000.25", "901.000 15,000.25"), "ledger-not-published"],
];
for (const [label, text, code] of hdfcMutations) {
  const { flows, warns, holdings } = read(text);
  ok(`hdfc, ${label}: nothing published`, flows.length === 0, JSON.stringify(flows.map((f) => [f.date, f.kind])));
  ok(`hdfc, ${label}: says why`, warns.includes(code), JSON.stringify(warns));
  ok(`hdfc, ${label}: the holdings still stand`, holdings.length === 2, JSON.stringify(holdings.map((h) => h.security)));
}

// ── Kotak: duty BELOW the row, an IDCW wholly withheld, a notice, a one-legged switch ──
const KOTAK = `
For any queries https://info.kotakmf.com/write-to-us
Account Statement (From 01-JUN-2026 To 30-JUN-2026)
Folio Number : 33334444 Statement Date : 01-Jul-2026
Hope India Trust Email Address :
Tax Status : Trust
Account Summary as on 30-JUN-2026 THANK YOU FOR INVESTING WITH KOTAK MUTUAL FUND
LIQ / Sample Kotak Liquid Fund Direct Plan Daily - IDCW # * - INF000K01CC3 UCC : MFKOTAK9 , Option : Reinvest
Opening Balance as on 01/06/2026 100.000
01/06/2026 IDCW Reinvested @ Rs.0.5 per unit less TDS 1,000.0000 1,000.0000 100.000
*** TDS on Cumulative IDCW *** 50.00
02/06/2026 IDCW Reinvested @ Rs.0.5 per unit less TDS 1,000.0000 45.00 1,000.0000 0.045 100.045
Less: Stamp Duty 0.01
*** TDS on Cumulative IDCW *** 5.00
02/06/2026 IDCW Reinvested 02-JUN-2026_Duplicate Request received 100.045
05/06/2026 Switch-In - From Sample Kotak Overnight Fund Direct 1,000.0000 999.95 1,000.0000 1.000 101.045
Less: Stamp Duty 0.05
Available Units to Redeem : 101.045
Market Value of Balance Units at NAV of 1,000.0000 on 30/06/2026 (INR) : 101,045.00 Total Units Under Lien : 0.000
IDCW reinvested / paid (INR) : 45.00 Total IDCW reinvested / paid (INR) : 45.00
`;
{
  const { out, flows, warns } = read(KOTAK);
  ok("kotak: read completely", out.status === "ok" && warns.length === 0, `${out.status} ${JSON.stringify(out.warnings)}`);
  ok("kotak: opening, two IDCW rows and the switch-in (the notice is not a movement)", flows.map((f) => f.kind).join() === "opening-units,allotment,allotment,contribution",
    JSON.stringify(flows.map((f) => [f.date, f.kind])));
  const nil = flows[1] ?? {};
  ok("kotak: an IDCW wholly withheld as TDS: no amount, no units, its TDS", nil.amount === null && nil.units === null && nil.expenses === 50
    && nil.balance === 100, JSON.stringify(nil));
  ok("kotak: duty BELOW a reinvestment is carried with its TDS", flows[2]?.amount === 45 && flows[2]?.expenses === 5.01, JSON.stringify(flows[2]));
  const sw = flows[3] ?? {};
  ok("kotak: a switch-in whose out-leg is not printed is money in, under its own words", sw.kind === "contribution" && sw.amount === 1000
    && sw.netAmount === 999.95 && sw.expenses === 0.05 && /Switch-In - From/.test(sw.description), JSON.stringify(sw));
  ok("kotak: a registered trust (shared/owners.mjs) is in the book", out.excludedFromBook === null && out.owner === "Hope India Trust"
    && out.providerEngagement === "folio held by a trust", JSON.stringify([out.excludedFromBook, out.owner, out.providerEngagement]));
}
{
  const { flows, warns } = read(KOTAK.replace("1,000.0000 1,000.0000 100.000", "1,000.0000 1,000.0000 100.500"));
  ok("kotak, a row with no units whose balance moves: nothing published", flows.length === 0 && warns.includes("ledger-not-published"), JSON.stringify(warns));
}
{
  const { flows, warns } = read(KOTAK.replace("Duplicate Request received 100.045", "Duplicate Request received 100.046"));
  ok("kotak, a notice whose balance disagrees: nothing published", flows.length === 0 && warns.includes("ledger-not-published"), JSON.stringify(warns));
}
{
  const { out } = read(KOTAK.replace("Hope India Trust Email", "Sample Charitable Trust Email"));
  ok("kotak: an unregistered trust is still held out, with the reason", /Trust/.test(out.excludedFromBook ?? ""), out.excludedFromBook);
}

// ── ABSL account statement: newest-first, gross/stamp line, a wrapped TDS, an all-TDS day ──
const ABSL = `
ADITYA BIRLA SUN LIFE MUTUAL FUND
From 01-JUN-2026 To 30-JUN-2026
Page 1 of 2
NON-TRANSFERABLE Mode of Holding : Single
Status : Trust
Nominee 1 : Not Applicable
Hope India Trust Nominee 2 : Not Applicable
Folio Number : 55556666 Statement Date : 01-Jul-2026
PORTFOLIO SUMMARY
Scheme Unit Balance NAV as on NAV NAV as of Current Value Cost of Investment IDCW Earned
ABSL Sample Liquid Fund -Direct-IDCW Daily - 1,010.000 30-Jun-2026 100.0000 101,000.00 101,000.00 950.00
TOTAL : 101,000.00 101,000.00 950.00
B999DZ Aditya Birla Sun Life Sample Liquid Fund - Daily IDCW # -Direct Plan - NAV as on 30/06/2026 : 100.0000
Reinvestment - INF000B01DD4
Closing Balance as on 30/06/2026 : 101,000.00 1,010.000
30/06/2026 IDCW Reinvestment @ Rs.0.5 per unit 500.00 100.0000 100.0000 5.000 1,010.000
Gross Amount: Rs.500.03/-; Stamp Duty charges Levied 0.03
*** TDS on Cumulative IDCW ***  EISC-SAMPLE-16.17.0
55.00
02/06/2026 IDCW Reinvestment @ Rs.0.4 per unit 450.00 100.0000 100.0000 4.500 1,005.000
*** TDS on Cumulative IDCW *** 50.00
01/06/2026 IDCW Reinvestment @ Rs.0.1 per unit 100.0000 100.0000
*** TDS on Cumulative IDCW *** 100.00
Opening Balance as on 01/06/2026 1,000.500
Your Advisor/Sub broker ARN/Sub Broker Code/EUIN : INA000000000 - SAMPLE
`;
{
  const { out, flows, warns } = read(ABSL);
  ok("absl: read completely", out.status === "ok" && warns.length === 0, `${out.status} ${JSON.stringify(out.warnings)}`);
  ok("absl: walked oldest-first from the printed opening", flows.map((f) => f.date).join() === "2026-06-01,2026-06-01,2026-06-02,2026-06-30"
    && flows[0].kind === "opening-units" && flows[0].units === 1000.5, JSON.stringify(flows.map((f) => [f.date, f.kind, f.units])));
  ok("absl: rows carry the summary holding's name", flows.every((f) => f.security === "ABSL Sample Liquid Fund -Direct-IDCW Daily"), JSON.stringify(flows.map((f) => f.security)));
  ok("absl: an all-TDS day allots nothing and carries its TDS", flows[1]?.amount === null && flows[1]?.units === null && flows[1]?.expenses === 100,
    JSON.stringify(flows[1]));
  ok("absl: the TDS figure wrapped onto the next line is read", flows[3]?.expenses === 55.03 && flows[3]?.amount === 500 && flows[3]?.units === 5,
    JSON.stringify(flows[3]));
  ok("absl: a registered trust is in the book", out.excludedFromBook === null, out.excludedFromBook);
}
{
  const { flows, warns } = read(ABSL.replace("101,000.00 950.00\nTOTAL", "101,000.00 960.00\nTOTAL"));
  ok("absl, IDCW Earned is not the reinvestments read: nothing published", flows.length === 0 && warns.includes("ledger-not-published"), JSON.stringify(warns));
}
{
  const { flows, warns } = read(ABSL.replace("Rs.500.03/-; Stamp Duty charges Levied 0.03", "Rs.500.13/-; Stamp Duty charges Levied 0.03"));
  ok("absl, gross less duty is not the amount: nothing published", flows.length === 0 && warns.includes("ledger-not-published"), JSON.stringify(warns));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
