// The Buoyant and Neo Infra UNIT-FLOW readers, and the checks that license them.
// Run: node scripts/ingest/__tests__/unitFlows.test.mjs
//
// FIFO matches every unit sold against the earliest unit bought, so a dated unit
// record that is missing a row — or reads a class switch as a sale — prints a
// return that looks perfectly ordinary and is wrong. Each reader therefore
// publishes its table ONLY if the statement's own arithmetic witnesses it.
//
// Every case below is a MUTATION of the committed statement's own text, rebuilt
// exactly as `extract()` and `npm run replay:flows` join it. A suite that only
// asserts the happy path proves the regex matches; breaking one figure at a
// time and watching the reader refuse is what proves each check is load-bearing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buoyantFlows, neoFlows } from "../providers/altFundStatements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("unitFlows");

const textOf = (docKey) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "public/audit", docKey, "pages.json"), "utf8"));
  return (j.pages ?? []).map((x) => x.text ?? "").join("\n").replace(/[ \t]+/g, " ");
};
const run = (fn, text) => {
  const warns = [];
  const rows = fn(text, (code, detail) => warns.push({ code, detail }));
  return { rows, warns, codes: warns.map((w) => w.code) };
};
const mutate = (text, from, to) => {
  if (!text.includes(from)) throw new Error(`fixture no longer contains ${JSON.stringify(from)}`);
  return text.replace(from, to);
};

// ── BUOYANT 103473 — four deposits, an A1 → A4 switch, a reinvested gain ──
{
  const T = textOf("buoyant-capital-103473-2026-07-31-holdings");
  const base = run(buoyantFlows, T);
  const kinds = {};
  for (const r of base.rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  ok("Buoyant: the real statement is published", base.rows.length > 0 && base.warns.length === 0,
    JSON.stringify(base.warns));
  ok("Buoyant: the A1 → A4 switch is a RECLASSIFICATION pair, never a sale", kinds.reclassification === 2,
    JSON.stringify(kinds));
  ok("Buoyant: …so no row is a withdrawal", !kinds.withdrawal);
  ok("Buoyant: the gain distribution is its own kind", kinds.distribution === 1);
  const a4 = base.rows.filter((r) => /Class A4/.test(r.security ?? "")).reduce((s, r) => s + (r.units ?? 0), 0);
  ok("Buoyant: Class A4 runs to the balance the Account Summary prints", Math.abs(a4 - 3416657.4167) < 0.0005, String(a4));
  const switchOut = base.rows.find((r) => r.kind === "reclassification" && r.amount < 0);
  const switchIn = base.rows.find((r) => r.kind === "reclassification" && r.amount > 0);
  ok("Buoyant: the switch carries the same rupees both ways",
    !!switchOut && !!switchIn && Math.abs(switchOut.amount + switchIn.amount) <= 1);

  // (1) units × NAV — one allotment's amount moved by a lakh.
  const b1 = run(buoyantFlows, mutate(T, "3,50,00,000.00\n16/07/2025 Units", "3,50,10,000.00\n16/07/2025 Units"));
  ok("Buoyant (1): an allotment that is not its units at its NAV withholds the table",
    b1.rows.length === 0 && b1.codes.includes("dated-table-does-not-tie"), JSON.stringify(b1.warns));

  // (2) a class that does not run to the printed balance.
  const b2 = run(buoyantFlows, mutate(T, "34,16,657.4167 47,53,53,990.90 144.2878", "34,16,658.4167 47,53,53,990.90 144.2878"));
  ok("Buoyant (2): a class that does not run to the Account Summary's balance withholds the table",
    b2.rows.length === 0 && b2.codes.includes("dated-table-does-not-tie"));

  // (3) the deposits no longer tie to the allotments they funded.
  const b3 = run(buoyantFlows, mutate(T, "01/06/2024 Cash Deposits 3,50,00,000.00", "01/06/2024 Cash Deposits 3,50,00,100.00"));
  ok("Buoyant (3): deposits that do not fund the allotments withhold the table",
    b3.rows.length === 0 && b3.codes.includes("dated-table-does-not-tie"));

  // A redemption no same-day allotment in another class accounts for is money
  // leaving the family, which this statement would print as a withdrawal it
  // does not carry — the switch must be declared by the pairing, not assumed.
  const b4 = run(buoyantFlows, mutate(T, "01/06/2026 Unit Redemption", "02/06/2026 Unit Redemption"));
  ok("Buoyant: a redemption funding no same-day allotment is not read as a switch",
    b4.rows.length === 0 && b4.codes.includes("dated-table-does-not-tie")
    && /fund no same-day allotment/.test(JSON.stringify(b4.warns)));

  // An undeclared row type withholds the WHOLE table.
  const b5 = run(buoyantFlows, mutate(T, "Transactions : Other Liabilities and Assets",
    "15/07/2026 Unit Switch 1.0000 1.0000 1.00\nTransactions : Other Liabilities and Assets"));
  ok("Buoyant: an undeclared dated row withholds the whole table",
    b5.rows.length === 0 && b5.codes.includes("transaction-type-not-declared"));
}

// ── NEO INFRA — five drawdowns and a capital redemption, beside income rows ──
{
  const T = textOf("neo-infra-income-opportunities-fund-9039920536-2026-06-30-holdings");
  const base = run(neoFlows, T);
  ok("Neo: the real statement is published", base.rows.length === 7 && base.warns.length === 0,
    `${base.rows.length} rows ${JSON.stringify(base.warns)}`);
  const out = base.rows.filter((r) => r.kind === "withdrawal");
  ok("Neo: the capital redemption is ONE withdrawal, with its units", out.length === 1
    && Math.abs(out[0].units + 14162.8) < 1e-6 && out[0].amount === -1416280);
  ok("Neo: the income rows are not read as capital", base.rows.every((r) => /Contribution|Drawdown|Redemption/.test(r.description)));
  ok("Neo: every contribution is a self-contained row (its own net)",
    base.rows.filter((r) => r.kind === "contribution").every((r) => r.netAmount === r.amount));

  // (1) units at face value — the redemption's units moved.
  const n1 = run(neoFlows, mutate(T, "-14,162.80 -14,16,280", "-14,172.80 -14,16,280"));
  ok("Neo (1): a row that is not its units at face value withholds the record",
    n1.rows.length === 0 && n1.codes.includes("dated-table-does-not-tie"));

  // (2)+(3) the redemption dropped: the units no longer run to the printed
  // balance and nothing ties to the Principal Payout.
  const n2 = run(neoFlows, mutate(T, "05-Jan-26 Capital Redemption -14,162.80 -14,16,280 - - -\n", ""));
  ok("Neo (2,3): a missing redemption withholds the record rather than overstating the units held",
    n2.rows.length === 0 && n2.codes.includes("dated-table-does-not-tie")
    && /Principal Payout/.test(JSON.stringify(n2.warns)));

  // A dated capital row the columns do not match is a row this reader would drop.
  const n3 = run(neoFlows, mutate(T, "22-Apr-26 Fifth Drawdown", "22-Apr-26 Fifth Drawdown (see note)"));
  const n3b = run(neoFlows, mutate(T, "22-Apr-26 Fifth Drawdown 1,50,000.00 1,50,00,000", "22-Apr-26 Fifth Drawdown 1,50,000.00"));
  ok("Neo: a dated capital row that does not match the columns withholds the record",
    n3b.rows.length === 0 && n3b.codes.includes("transaction-type-not-declared"), JSON.stringify(n3b.warns));
  ok("Neo: …while a description the columns still match is read", n3.rows.length === 7);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
