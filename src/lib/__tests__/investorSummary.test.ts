import assert from "node:assert/strict";
import type { Portfolio } from "../types";
import { investorPeriodReturn, investorPeriodStart } from "../investorSummary";

const today = new Date(2026, 8, 28, 12);
const emptyFunds = { peFunds: [], preIpoFunds: [], unlistedCompanies: [], debtFunds: [], closedFunds: [], startups: [] };
function book(): Portfolio {
  return {
    accounts: [{ accountId: "one", accountNo: "1", asOf: "2026-09-01" }],
    positions: [{ accountId: "one", marketValue: 150 }],
    accountCashFlows: { one: [
      { date: "2026-04-01", amount: -100, description: "Opening portfolio value" },
      { date: "2026-06-01", amount: -50, description: "Contribution" },
    ] },
    privateMarkets: emptyFunds,
  } as unknown as Portfolio;
}
assert.equal(investorPeriodStart(new Date(2026, 2, 31), "fytd"), "2025-04-01");
assert.equal(investorPeriodStart(new Date(2026, 3, 1), "fytd"), "2026-04-01");
assert.equal(investorPeriodStart(today, "ytd"), "2026-01-01");

// A 50% increase supplied entirely by a contribution is a zero return.
let r = investorPeriodReturn(book(), today, "fytd");
assert.equal(r.reason, null);
assert.ok(Math.abs(r.pct!) < 1e-6);
assert.equal(r.gain, 0);
assert.equal(r.end, "2026-09-01");

const gain = book();
gain.positions[0].marketValue = 165;
r = investorPeriodReturn(gain, today, "fytd");
assert.equal(r.gain, 15);
assert.ok(r.pct! > 10 && r.pct! < 15); // contribution timing changes the rate

const withdrawal = book();
withdrawal.accountCashFlows!.one.push({ date: "2026-08-01", amount: 25, description: "Withdrawal" });
withdrawal.positions[0].marketValue = 125;
r = investorPeriodReturn(withdrawal, today, "fytd");
assert.equal(r.gain, 0);
assert.ok(Math.abs(r.pct!) < 1e-6);

const calendar = book();
calendar.accountCashFlows!.one[0].date = "2026-01-01";
assert.equal(investorPeriodReturn(calendar, today, "ytd").reason, null);
assert.equal(investorPeriodReturn(calendar, today, "fytd").pct, null);

const partial = book();
partial.accounts.push({ accountId: "two", accountNo: "2", asOf: "2026-09-01" } as Portfolio["accounts"][number]);
partial.positions.push({ accountId: "two", marketValue: 1000 } as Portfolio["positions"][number]);
r = investorPeriodReturn(partial, today, "fytd");
assert.equal(r.pct, null);
assert.equal(r.gain, null);
assert.equal(r.covered, 1);
assert.equal(r.total, 2);

const skew = structuredClone(partial);
skew.accountCashFlows!.two = [{ date: "2026-04-01", amount: -1000, description: "Opening portfolio value" }];
skew.accounts[1].asOf = "2026-08-01";
r = investorPeriodReturn(skew, today, "fytd");
assert.equal(r.covered, 2);
assert.equal(r.pct, null);
assert.equal(r.reason, "Matching valuation dates needed");

const wrongYear = book();
wrongYear.accountCashFlows!.one[0].date = "2025-04-01";
assert.equal(investorPeriodReturn(wrongYear, today, "fytd").pct, null);
assert.equal(investorPeriodReturn(book(), today, "ytd").pct, null);
assert.equal(investorPeriodReturn(book(), new Date(2027, 4, 1), "fytd").covered, 0);

const laterFlow = book();
laterFlow.accountCashFlows!.one.push({ date: "2026-09-20", amount: -50 });
assert.equal(investorPeriodReturn(laterFlow, today, "fytd").pct, null);
const shortRecord = book();
shortRecord.accounts[0].capitalRecordTo = "2026-06-01";
assert.equal(investorPeriodReturn(shortRecord, today, "fytd").pct, null);
const partiallyValued = book();
partiallyValued.accounts[0].partialValuation = "One holding has no valuation";
assert.equal(investorPeriodReturn(partiallyValued, today, "fytd").pct, null);
const invalidDate = book();
invalidDate.accounts[0].asOf = "2026-08-bad";
assert.equal(investorPeriodReturn(invalidDate, today, "fytd").pct, null);
const twoOpenings = book();
twoOpenings.accountCashFlows!.one.push({ ...twoOpenings.accountCashFlows!.one[0] });
assert.equal(investorPeriodReturn(twoOpenings, today, "fytd").pct, null);
const future = book();
future.accounts[0].asOf = "2026-10-01";
assert.equal(investorPeriodReturn(future, today, "fytd").pct, null);

const overlap = book();
overlap.positions[0].dedupeGroup = "joint";
overlap.positions.push({ ...overlap.positions[0] });
assert.equal(investorPeriodReturn(overlap, today, "fytd").pct, null);
const empty = book();
empty.accounts = [];
empty.positions = [];
assert.equal(investorPeriodReturn(empty, today, "fytd").pct, null);
console.log("Investor period returns: cash flows, coverage, dates and missing history passed");
