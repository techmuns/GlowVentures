// ICICI Prudential's folio statement (the october-2026-b delivery), through the
// real `extract()` of providers/mutualFundFolio.mjs.
// Run: node scripts/ingest/__tests__/iciciFolio.test.mjs
//
// Written against the archived layout with INVENTED holders, folio and figures.
// Every case after the first is a MUTATION that must withhold the whole dated
// record: a purchase the statement's own figures do not tie is never published.
import { extract } from "../providers/mutualFundFolio.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("iciciFolio");

const BASE = `
ICICI Prudential Mutual Fund
Folio No. : 12345678 / 81
Asha Testholder Bank Account Number : SB / XXXXXXXX1234
12 Sample Road Tax Status : Individual
2 nd Holder Ravi Testholder XXXXXX6221
ACCOUNT SUMMARY
9999 Sample Low Volatility ETF FOF
10.5000 01-Oct-2026 99,995.001 999,950.01 0.00 0.00 1,049,947.51
9999 / INF109KC1Z99 / ICICI Prudential Sample Low Volatility ETF FOF - Direct Plan Growth
Opening Balance as on 23/10/2024 0.000
23/10/2024 Purchase - DIRECT 999,950.01 10.0000 10.0000 99,995.001 99,995.001
Gross Amount: Rs.1000000/-; Stamp Duty charges Levied ~ 49.99
`;
const read = (text) => {
  const out = extract({ grid: { pages: [{ text }] }, meta: { docKey: "t" } });
  return { out, flows: out.cashFlows ?? [], holdings: out.holdings ?? [], warns: (out.warnings ?? []).map((w) => w.code ?? w) };
};

{
  const { out, flows, holdings, warns } = read(BASE);
  ok("one holding read", holdings.length === 1, JSON.stringify(holdings));
  const h = holdings[0] ?? {};
  ok("ISIN from the ledger head", h.isin === "INF109KC1Z99", h.isin);
  ok("units", h.quantity === 99995.001, h.quantity);
  ok("cost", h.totalCost === 999950.01, h.totalCost);
  ok("NAV and its date", h.marketPrice === 10.5 && h.priceAsOn === "2026-10-01", `${h.marketPrice} ${h.priceAsOn}`);
  ok("folio without the branch suffix", out.accountNo === "12345678", out.accountNo);
  ok("holder from the Bank Account Number line", out.owner === "Asha Testholder", out.owner);
  ok("joint holder named", (out.jointHolders ?? []).includes("Ravi Testholder"), JSON.stringify(out.jointHolders));
  ok("individual, so not excluded", out.excludedFromBook === null, out.excludedFromBook);
  ok("one dated purchase", flows.length === 1, JSON.stringify(flows));
  const f = flows[0] ?? {};
  ok("purchase is gross, net and stamp duty as printed", f.amount === 1000000 && f.netAmount === 999950.01 && f.expenses === 49.99, JSON.stringify(f));
  ok("purchase dated", f.date === "2024-10-23", f.date);
  ok("no withheld-purchase warning", !warns.includes("purchases-not-published"), JSON.stringify(warns));
}

const mutations = [
  ["stamp duty does not tie gross to net", BASE.replace("~ 49.99", "~ 59.99")],
  ["units × NAV is not the net", BASE.replace("10.0000 10.0000 99,995.001 99,995.001", "11.0000 11.0000 99,995.001 99,995.001")],
  ["running balance does not reach the printed balance", BASE.replace("99,995.001 99,995.001\n", "99,995.001 99,996.001\n")],
  ["no printed gross", BASE.replace(/Gross Amount:.*\n/, "\n")],
  ["the ledger does not end at the summary's units", BASE.replace("01-Oct-2026 99,995.001", "01-Oct-2026 99,999.001")],
];
for (const [label, text] of mutations) {
  const { flows, warns } = read(text);
  ok(`${label}: nothing published`, flows.length === 0, JSON.stringify(flows));
  ok(`${label}: says why`, warns.includes("purchases-not-published"), JSON.stringify(warns));
}

// ── Layout 6: ICICI Prudential's DISTRIBUTOR LISTING ─────────────────────────
// The account summary prints code, name and figures on one line; the ledgers
// belong to two schemes it does not list, both closed to nil. A pre-July-2020
// purchase prints no gross/stamp line; an IDCW reinvestment is an allotment; a
// redemption is a parenthesised net with its STT on the next line — once in one
// line and once with its type cell WRAPPED onto the date's line. Invented
// holder, folio and figures, each tied by construction.
const LISTING = `
Partial Transaction Listing
For transactions through SAMPLE DISTRIBUTOR LTD
Statement Date : 01-Oct-2026
Statement Period : From 04-Nov-2019 To 01-Oct-2026 Page 1 of 2
Folio No. : 87654321 / 80
Mira Testholder Bank Account Number : CA / XXXXXXXXXX1111
12 Sample Road Tax Status : Individual
ACCOUNT SUMMARY AS ON 01-OCT-2026
SMPLG Sample Balanced Fund Growth 50.00 30-Sep-2026 0.000 0.00 0.00 0.00 0.00
Total : 0.000 0.00 0.00 0.00 0.00
~ Effective from July 01, 2020, stamp duty @ 0.005% will be deducted from the Net investment amount.
1111 / INF109K01Z11 / ICICI Prudential Sample Arbitrage Fund - Direct Plan - IDCW
Date Transaction Type Amount (INR) NAV(INR) Price (INR) No. of Units Balance Units
Opening Balance as on 04/11/2019 0.000
04/11/2019 Purchase Appln : 0000012345 - INP000000001 1,000,000.00 10.0000 10.0000 100,000.000 100,000.000
06/02/2020 IDCW Reinvested @ Rs.0.0200 per unit 2,000.00 10.0000 10.0000 200.000 100,200.000
28/02/2020 Redemption - REF12345 less STT (1,001,989.98) 10.0000 10.0000 (100,200.000) 0.000
*** STT Paid *** (10.02)
... continued on next page
Folio No. : 87654321 / 80 Page 2 of 2
1112 / INF109K01Z12 / ICICI Prudential Sample Arbitrage Fund - Direct Plan - Growth
Date Transaction Type Amount (INR) NAV(INR) Price (INR) No. of Units Balance Units
Opening Balance as on 05/03/2020 0.000
05/03/2020 Purchase - INP000000001 1,001,989.00 20.0000 20.0000 50,099.450 50,099.450
Redemption - ELECTRONIC PAYMENT - (1,102,176.88) 22.0000 22.0000 (50,099.450)
15/04/2021 REF67890 less STT 0.000
*** STT Paid *** (11.02)
Note : This is not the Account Statement but only a listing of transactions in this folio carried out through SAMPLE DISTRIBUTOR LTD.
`;
{
  const { out, flows, holdings, warns } = read(LISTING);
  ok("listing: read completely", out.status === "ok" && warns.length === 0, `${out.status} ${JSON.stringify(warns)}`);
  ok("listing: folio, holder, statement date, period", out.accountNo === "87654321" && out.owner === "Mira Testholder"
    && out.asOf === "2026-10-01" && out.periodFrom === "2019-11-04" && out.periodTo === "2026-10-01",
    JSON.stringify([out.accountNo, out.owner, out.asOf, out.periodFrom, out.periodTo]));
  ok("listing: three holdings — the summary row and two closed ledgers", holdings.length === 3, JSON.stringify(holdings.map((h) => h.security)));
  const summary = holdings.find((h) => h.security === "Sample Balanced Fund Growth") ?? {};
  ok("listing: one-line summary row read as printed", summary.quantity === 0 && summary.marketPrice === 50 && summary.priceAsOn === "2026-09-30"
    && summary.printed?.marketValue === 0 && summary.isin === null, JSON.stringify(summary));
  const closed = holdings.filter((h) => /Arbitrage/.test(h.security));
  // Closed by a redemption, each carries THAT redemption's NAV dated to its day
  // — the fund pricing units no longer held, which is what marks it redeemed to
  // nil (src/lib/analytics.ts `isRedeemedToNil`); never a current mark.
  ok("listing: closed ledgers are nil holdings with their ISINs and their closing redemption's dated NAV", closed.length === 2
    && closed.every((h) => h.quantity === 0 && h.printed?.marketValue === 0)
    && closed.map((h) => `${h.isin}@${h.marketPrice}@${h.priceAsOn}`).join()
      === "INF109K01Z11@10@2020-02-28,INF109K01Z12@22@2021-04-15", JSON.stringify(closed));
  ok("listing: five dated rows", flows.length === 5, JSON.stringify(flows.map((f) => [f.date, f.kind])));
  const [buy, idcw, sell, buy2, sell2] = flows;
  ok("listing: pre-stamp-duty purchase is gross = net with no charge", buy?.kind === "contribution" && buy.amount === 1000000
    && buy.netAmount === 1000000 && buy.expenses === null && buy.units === 100000, JSON.stringify(buy));
  ok("listing: IDCW reinvestment is an allotment, not capital", idcw?.kind === "allotment" && idcw.amount === 2000 && idcw.units === 200
    && idcw.balance === 100200, JSON.stringify(idcw));
  ok("listing: redemption is the net paid, negative, with STT as its charge", sell?.kind === "withdrawal" && sell.amount === -1001989.98
    && sell.expenses === 10.02 && sell.units === -100200 && sell.balance === 0 && sell.date === "2020-02-28", JSON.stringify(sell));
  ok("listing: second purchase", buy2?.kind === "contribution" && buy2.units === 50099.45 && buy2.date === "2020-03-05", JSON.stringify(buy2));
  ok("listing: wrapped redemption re-joined onto its date", sell2?.kind === "withdrawal" && sell2.date === "2021-04-15"
    && sell2.amount === -1102176.88 && sell2.expenses === 11.02 && sell2.units === -50099.45 && sell2.balance === 0
    && /ELECTRONIC PAYMENT.*REF67890 less STT/.test(sell2.description), JSON.stringify(sell2));
  ok("listing: individual, so not excluded", out.excludedFromBook === null, out.excludedFromBook);
}
const listingMutations = [
  // [label, text, warning code, rows still published — only the failing scheme is withheld]
  ["STT does not tie the gross to the net", LISTING.replace("(10.02)", "(110.02)"), "ledger-not-published", 2],
  ["wrapped redemption does not reach its printed balance", LISTING.replace("REF67890 less STT 0.000", "REF67890 less STT 1.000"), "ledger-not-published", 3],
  ["a post-July-2020 purchase with no stamp duty line", LISTING.replace("05/03/2020 Purchase", "05/08/2020 Purchase"), "purchases-not-published", 3],
  ["an unread movement", LISTING.replace("IDCW Reinvested @", "IDCW Paid @"), "unsupported-movement", 2],
];
for (const [label, text, code, left] of listingMutations) {
  const { flows, warns } = read(text);
  ok(`listing, ${label}: that scheme's rows withheld`, flows.length === left, JSON.stringify(flows.map((f) => [f.date, f.kind])));
  ok(`listing, ${label}: says why`, warns.includes(code), JSON.stringify(warns));
}

// ── Layout 5: CAMS's PARTIAL TRANSACTION LISTING (ABSL) ─────────────────────
// Daily IDCW reinvestment net of TDS, the TDS on its own dated line, the scheme
// heading repeated on the continuation page, and a closing line carrying the
// folio's units, value and cost. A trust holder. Invented throughout.
const CAMS = `
Partial Transaction Listing
For transactions through SAMPLE ADVISORY PVT LTD
Statement Period From 01-Sep-2026 To 30-Sep-2026
55555555 Res : N.A additional addresses listed overleaf.
Sample Family Trust BSL AMC - Somewhere
Statement Date : 06-10-2026
Folio No. : 55555555
B999ZZ-Aditya Birla Sun Life Sample Liquid Fund - Daily IDCW-Direct Plan NAV as on 05-10-2026 : 100.0000
Amount Price Number of Balance
Date Transaction Type
in INR in INR Units Units
01-09-2026 IDCW Reinvestment @ Rs.0.02000000 per unitLess TDS 180.00 100.0000 1.800 1,001.800
01-09-2026 *** TDS on Above *** 20.00
02-09-2026 IDCW Reinvestment @ Rs.0.01000000 per unitLess TDS 90.00 100.0000 0.900 1,002.700
02-09-2026 *** TDS on Above *** 10.00
Partial Transaction Listing
Statement Date : 06-10-2026
B999ZZ-Aditya Birla Sun Life Sample Liquid Fund - Daily IDCW-Direct Plan NAV as on 05-10-2026 : 100.0000
03-09-2026 IDCW Reinvestment @ Rs.0.01000000 per unitLess TDS 90.00 100.0000 0.900 1,003.600
03-09-2026 *** TDS on Above *** 10.00
Current Unit Balance : 1,003.600 Current Investment Value : 100,360.00 Cost Value : 100,400.00
Current Unit Balance through this Intermediary : 3.600
PAN KYC Compliant
First Holder ABCTS1234Z KYC OK
Unitholder (UH) : Sample Family Trust PAN: ABCTS1234Z KYC : Folio No : 55555555
Tax Status : Trust
`;
const readCams = (text) => {
  const out = extract({ grid: { pages: [{ text }] }, meta: { docKey: "t", reportType: "unknown" } });
  return { out, flows: out.cashFlows ?? [], holdings: out.holdings ?? [], warns: (out.warnings ?? []).map((w) => w.code ?? w) };
};
{
  const { out, flows, holdings, warns } = readCams(CAMS);
  ok("cams: read completely", out.status === "ok" && warns.length === 0, `${out.status} ${JSON.stringify(warns)}`);
  ok("cams: folio, holder from the transaction slip, PAN, numeric statement date", out.accountNo === "55555555"
    && out.owner === "Sample Family Trust" && out.pan === "ABCTS1234Z" && out.asOf === "2026-10-06",
    JSON.stringify([out.accountNo, out.owner, out.pan, out.asOf]));
  ok("cams: period", out.periodFrom === "2026-09-01" && out.periodTo === "2026-09-30", `${out.periodFrom} ${out.periodTo}`);
  ok("cams: an unknown-typed listing with schemes read is a holdings document", out.reportType === "holdings", out.reportType);
  ok("cams: one holding despite the repeated heading", holdings.length === 1, JSON.stringify(holdings.map((h) => h.security)));
  const h = holdings[0] ?? {};
  ok("cams: units, NAV, NAV date, value and cost as printed", h.quantity === 1003.6 && h.marketPrice === 100
    && h.priceAsOn === "2026-10-05" && h.printed?.marketValue === 100360 && h.totalCost === 100400 && h.isin === null, JSON.stringify(h));
  ok("cams: three allotments across the page break", flows.length === 3 && flows.every((f) => f.kind === "allotment"),
    JSON.stringify(flows.map((f) => [f.date, f.kind])));
  ok("cams: TDS line carried on its reinvestment", flows.map((f) => f.expenses).join() === "20,10,10", JSON.stringify(flows.map((f) => f.expenses)));
  ok("cams: amounts, units and balances as printed", flows[0]?.amount === 180 && flows[0]?.units === 1.8 && flows[2]?.balance === 1003.6,
    JSON.stringify(flows[0]));
  ok("cams: a trust is excluded from the book", /Trust/.test(out.excludedFromBook ?? ""), out.excludedFromBook);
}
const camsMutations = [
  ["running balance breaks", CAMS.replace("0.900 1,002.700", "0.900 1,002.800"), "ledger-not-published"],
  ["ledger does not end at the Current Unit Balance", CAMS.replace("Current Unit Balance : 1,003.600 Current Investment Value : 100,360.00",
    "Current Unit Balance : 1,004.600 Current Investment Value : 100,460.00"), "ledger-not-published"],
  ["units × price is not the amount", CAMS.replace("180.00 100.0000 1.800", "185.00 100.0000 1.800"), "ledger-not-published"],
  ["an unread movement", CAMS.replace("03-09-2026 *** TDS on Above *** 10.00", "03-09-2026 *** TDS on Above *** 10.00\n04-09-2026 Redemption 100.00 100.0000 (1.000) 1,002.600"), "unsupported-movement"],
];
for (const [label, text, code] of camsMutations) {
  const { flows, warns, holdings } = readCams(text);
  ok(`cams, ${label}: nothing published`, flows.length === 0, JSON.stringify(flows));
  ok(`cams, ${label}: says why`, warns.includes(code), JSON.stringify(warns));
  ok(`cams, ${label}: the holding still stands`, holdings.length === 1, JSON.stringify(holdings));
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
