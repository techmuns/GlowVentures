// The Neo Infra UNIT-FLOW reader, and the checks that license it.
// Run: node scripts/ingest/__tests__/neoFlows.test.mjs
//
// (Buoyant's reader has its own suite, `buoyantFlows.test.mjs`.)
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
import { neoFlows } from "../providers/altFundStatements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("neoFlows");

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
