// A mutual-fund folio's own purchase rows (Stage 10cy), and their four checks.
// Run: node scripts/ingest/__tests__/mfPurchase.test.mjs
//
// Written against statements in Helios's (CAMS) and Motilal Oswal Active
// Momentum's (KFintech) own layouts, through the real `extract()`. Every case
// after the first is a MUTATION that must withhold the whole dated record: a
// suite that only asserts the happy path proves the regex matches, and nothing
// about the licence to publish a date the family will read as when they invested.
import { extract } from "../providers/altFundStatements.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("mfPurchase");

const HELIOS = `
HELIOS MUTUAL FUND
Account Summary as on 07-AUG-2026 THANK YOU FOR INVESTING WITH HELIOS MUTUAL FUND
Scheme Maturity Date Mode of Investment Last NAV Date NAV Units Cost (INR)
Helios Flexi Cap Fund - Direct Lump sum 06-Aug-2026 16.21 19,123,041.380 310,000,000.00 309,984,500.77
Growth
H02 / Helios Flexi Cap Fund - Direct * Growth - INF0R8701046
Gross Ongoing Purchase 310,000,000.00
Less: Stamp Duty 15,499.23
06/08/2026 Net Purchase 16.21 309,984,500.77 16.2100 19,123,041.380 19,123,041.380
07/08/2026 ***Registration of Nominee***
`;
const MOMENTUM = `
Portfolio Summary as on 06/08/2026
Scheme Name Units Allotted Cost of Investment NAV Current Value
Motilal Oswal Active Momentum Fund - Direct Plan Growth Option 1,52,45,765.959 21,42,00,000.00 14.0491 21,41,89,290.53
06/08/2026 Gross Purchase 21,42,00,000.00
06/08/2026 Stamp Duty 10,709.46
06/08/2026 Net Purchase ( Transaction Date : 06/08/2026 ) 21,41,89,290.54 14.0491 15245765.959 15245765.959
`;
const read = (text) => {
  const out = extract({ grid: { pages: [{ text }] } });
  return { flows: out?.cashFlows ?? [], holdings: out?.holdings ?? [], warns: (out?.warnings ?? []).map((w) => w.code ?? w) };
};

for (const [name, text, gross, net, stamp, units, sec] of [
  ["Helios", HELIOS, 310000000, 309984500.77, 15499.23, 19123041.38, "Helios Flexi Cap Fund - Direct Growth"],
  ["Active Momentum", MOMENTUM, 214200000, 214189290.54, 10709.46, 15245765.959, "Motilal Oswal Active Momentum Fund - Direct Plan Growth Option"],
]) {
  const { flows, holdings } = read(text);
  ok(`${name}: one dated purchase is read`, flows.length === 1, JSON.stringify(flows));
  const f = flows[0] ?? {};
  ok(`${name}: on 2026-08-06, gross ${gross} and net ${net}`, f.date === "2026-08-06" && f.amount === gross && f.netAmount === net,
    `${f.date} ${f.amount} ${f.netAmount}`);
  // THE CHARGE IS CARRIED AS PRINTED (Stage 10cz): the Stamp Duty line is VD-24's
  // `expenses`, so a cost struck on every rupee paid — and the lot engine, which
  // counts a row's net plus the charges it prints — reads the statement's own
  // figure. Left null, the engine would cost these units at the net while the
  // book costs them at the gross: two rules for one purchase.
  ok(`${name}: the Stamp Duty line is carried as the row's charge, ${stamp}`, f.expenses === stamp
    && Math.abs(f.netAmount + f.expenses - f.amount) <= 0.005, `expenses ${f.expenses}`);
  ok(`${name}: typed a contribution, with the units allotted`, f.kind === "contribution" && f.units === units);
  ok(`${name}: named as the holding it bought, so it joins that position`,
    f.securityKey === holdings[0]?.securityKey && f.security === sec, `${f.securityKey} vs ${holdings[0]?.securityKey}`);
}

const withheld = (label, text, code) => {
  const { flows, warns } = read(text);
  ok(`${label} — nothing is published`, flows.length === 0, JSON.stringify(flows));
  ok(`${label} — and it says why`, warns.includes(code), JSON.stringify(warns));
};
withheld("gross less stamp duty is not the printed net",
  HELIOS.replace("Less: Stamp Duty 15,499.23", "Less: Stamp Duty 15,400.00"), "dated-table-does-not-tie");
withheld("the net is not units × NAV",
  MOMENTUM.replace("21,41,89,290.54 14.0491", "21,41,89,290.54 14.1491"), "dated-table-does-not-tie");
withheld("the running units do not reach the printed balance",
  HELIOS.replace("19,123,041.380 19,123,041.380", "19,123,041.380 19,123,042.380"), "dated-table-does-not-tie");
withheld("the purchases do not allot the units the Account Summary holds",
  MOMENTUM.replace("1,52,45,765.959 21,42,00,000.00", "1,52,45,775.959 21,42,00,000.00"), "dated-table-does-not-tie");
withheld("a dated row of a type this reader does not declare",
  MOMENTUM + "12/08/2026 Switch Out 1,00,000.00 14.2000 7042.254 15238723.705\n", "transaction-type-not-declared");

// A DATED ISSUE (Stage 10hn): the window it prints, its joint holder, and three
// purchases walked to the Account Summary's units, as folio 10056128 prints them.
const HELIOS_DATED = `
Account Statement
(From 07-AUG-2024 To 26-OCT-2026)
Folio No. : 10056128 / 71 Statement Date : 26-Oct-2026
Joint Holder 1 : AARTI AJAY JAISINGHANI
Ajay T Jaisinghani Joint Holder 2 :
Account Summary as on 26-OCT-2026 THANK YOU FOR INVESTING WITH HELIOS MUTUAL FUND
Helios Flexi Cap Fund - Direct Lump sum 23-Oct-2026 14.83 3,245,281.682 46,000,000.00 48,127,527.34
Growth
H02 / Helios Flexi Cap Fund - Direct * Growth - INF0R8701046
Gross Ongoing Purchase 25,000,000.00
Less: Stamp Duty 1,249.94
07/08/2024 Net Purchase 13.74 24,998,750.06 13.7400 1,819,414.124 1,819,414.124
Gross Ongoing Purchase 6,000,000.00
Less: Stamp Duty 299.99
16/10/2024 Net Purchase 14.50 5,999,700.01 14.5000 413,772.414 2,233,186.538
Gross Ongoing Purchase 15,000,000.00
Less: Stamp Duty 749.96
10/07/2025 Net Purchase 14.82 14,999,250.04 14.8200 1,012,095.144 3,245,281.682
06/10/2026 ***Demat To Remat -Accept***
`;
{
  const out = extract({ grid: { pages: [{ text: HELIOS_DATED }] } });
  ok("dated Helios issue: the printed window is the document's period",
    out.periodFrom === "2024-08-07" && out.periodTo === "2026-10-26", `${out.periodFrom} → ${out.periodTo}`);
  ok("…the joint holder is carried, the first holder stays the owner",
    JSON.stringify(out.jointHolders) === '["AARTI AJAY JAISINGHANI"]' && out.owner === "Ajay T Jaisinghani",
    `${JSON.stringify(out.jointHolders)} / ${out.owner}`);
  ok("…all three purchases are read, and no since-inception scope is claimed",
    out.cashFlows.length === 3 && out.cashFlows.at(-1).balance === 3245281.682
      && !out.cashFlows.some((f) => /since inception/.test(f.notes ?? "")), JSON.stringify(out.cashFlows.map((f) => f.notes)));
  const single = extract({ grid: { pages: [{ text: HELIOS }] } });
  ok("a since-inception issue prints no window and no joint holder",
    !single.periodFrom && !single.periodTo && (single.jointHolders ?? []).length === 0, JSON.stringify(single.jointHolders));
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
