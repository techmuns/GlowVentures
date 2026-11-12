// A PMS account's 31 Dec and 31 Mar values rebuilt from its own ledgers (Stage 10ni).
import assert from "node:assert/strict";
import { tradeOpenings, inceptionLedgers, openingDays } from "../../lib/tradeOpenings.mjs";

assert.deepEqual(openingDays("2026-11-04"), ["2025-12-31", "2026-03-31"]);
assert.deepEqual(openingDays("2026-02-10"), ["2025-03-31", "2025-12-31"]);

const P = "Manager", N = "1";
const base = (reportType, asOf, extra) => ({ docKey: `${reportType}-${asOf}`, provider: P, accountNo: N, engagement: "PMS", status: "ok", reportType, asOf, ...extra });
const trade = (date, side, securityKey, quantity) => ({ date, side, securityKey, quantity, security: securityKey, assetClass: "Equity" });
const bankRow = (date, balance, extra = {}) => ({ date, settlementDate: date, balance, buySellAmount: 0, income: 0, expenses: 0, depositWithdrawal: 0, description: "Buy", ...extra });
// 100 deposited 2025-06-01; 10 A at 5 bought; 2:1 split on 2026-02-01; 4 B at 10 bought 2026-04-15.
const tx = base("transaction-statement", "2026-07-31", { periodFrom: "2025-06-01", periodTo: "2026-07-31",
  transactions: [trade("2025-06-02", "buy", "a", 10), trade("2026-04-15", "buy", "b", 4)] });
const bank = base("bank-book", "2026-07-31", { periodFrom: "2025-06-01", periodTo: "2026-07-31", cashFlows: [
  bankRow("2025-06-01", 100, { depositWithdrawal: 100, description: "Corpus Deposits" }),
  bankRow("2025-06-02", 50, { buySellAmount: -50 }),
  bankRow("2026-04-15", 10, { buySellAmount: -40 }),
] });
const cap = base("capital-register", "2026-07-31", { periodFrom: "2025-06-01", periodTo: "2026-07-31", cashFlows: [
  { date: "2025-06-01", amount: 100, description: "Corpus Deposits" }, { date: "2026-05-10", amount: -1, description: "TDS on Payout" }] });
// The manager's statements: A 20 (after the split) and B 4.
const statement = (asOf, total) => base("appraisal", asOf, { holdings: [{ securityKey: "a", security: "A", quantity: 20 }, { securityKey: "b", security: "B", quantity: 4 }],
  totals: { totalMarketValue: total } });
const closes = {
  a: { symbol: "AAA", closes: { "2025-12-31": { on: "2025-12-31", close: 8 }, "2026-03-31": { on: "2026-03-30", close: 3 }, "2026-05-31": { on: "2026-05-29", close: 4 }, "2026-06-30": { on: "2026-06-30", close: 5 } } },
  b: { symbol: "BBB", closes: { "2026-05-31": { on: "2026-05-29", close: 10 }, "2026-06-30": { on: "2026-06-30", close: 11 } } },
};
const saved = { from: "2023-01-01", through: "2026-11-05", bySymbol: new Map([["AAA", [{ type: "split", exDate: "2026-02-01", factor: 2, purpose: "Split" }]]]) };
const accounts = [{ accountId: "m-1", provider: P, accountNo: N, engagement: "PMS" }];
// Manager totals: May 20×4 + 4×10 + cash 10 = 130; June 20×5 + 4×11 + 10 = 154.
const docs = [tx, bank, cap, statement("2026-05-31", 130), statement("2026-06-30", 154)];
const run = (d = docs, c = closes) => tradeOpenings({ byAccount: new Map([[`${P}::${N}`, d]]), accounts, saved, closes: c, asOf: "2026-07-31" });

let r = run();
assert.deepEqual(r.refused, []);
const o = r.openings["m-1"];
// 31 Dec: 10 A (before the split) × 8 + cash 50 = 130. 31 Mar: 20 A × 3 + 50 = 110.
assert.deepEqual(o.openings.map((x) => [x.date, x.value, x.cash]), [["2025-12-31", 130, 50], ["2026-03-31", 110, 50]]);
assert.deepEqual(o.checks.map((c) => c.diffPct), [0, 0]);
assert.deepEqual(o.flows, [{ date: "2026-05-10", amount: 1, description: "TDS on Payout" }], "the register's money after the first opening, investor's view");

// The rebuild must reproduce the manager: a total 2% off refuses the account.
r = run([tx, bank, cap, statement("2026-05-31", 130 * 1.02), statement("2026-06-30", 154)]);
assert.equal(r.openings["m-1"], undefined);
assert.match(r.refused[0], /misses the manager's value/);
// One reproducible statement is not enough.
r = run([tx, bank, cap, statement("2026-05-31", 130)]);
assert.match(r.refused[0], /two are needed/);
// A share with no close on an opening day, not a demerger awaiting listing, refuses that day.
r = run(docs, { ...closes, a: { ...closes.a, closes: { ...closes.a.closes, "2025-12-31": undefined } } });
assert.deepEqual(r.openings["m-1"].openings.map((x) => x.date), ["2026-03-31"]);
assert.match(r.refused[0], /a has no exchange close on 2025-12-31/);

// Ledgers that open on a carried-in balance are not from inception.
assert.match(inceptionLedgers([tx, bank, { ...cap, cashFlows: [{ date: "2025-06-01", amount: 0, description: "Opening Balance" }, ...cap.cashFlows] }]).reason, /carried-in balance/);
assert.match(inceptionLedgers([tx, { ...bank, periodFrom: "2026-04-01" }, cap]).reason, /bank book starts 2026-04-01/);
// No closes file: nothing rebuilt, nothing refused.
assert.deepEqual(tradeOpenings({ byAccount: new Map(), accounts, saved, closes: null, asOf: "2026-07-31" }), { openings: {}, refused: [] });

console.log("tradeOpenings: openings rebuilt from trades, splits, bank book and closes; refused unless they reproduce the manager's totals.");
