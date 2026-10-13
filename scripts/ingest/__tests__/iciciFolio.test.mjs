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

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
