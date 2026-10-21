import assert from "node:assert/strict";
import { xirrWorking } from "../xirrWorking";
import { xirr, xirrAmbiguity } from "../xirr";
import { pooledXirr, fundXirr, startupXirr, xirrPct } from "../bucketXirr";
import { measuredAccountsReturn } from "../returns";
import { BOOK_ACCOUNTS, BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_RETURN_RECORDS, BOOK_POSITIONS } from "@/data/glowData";
import type { Portfolio } from "../types";

const flow = (date: string, amount: number) => ({ date: new Date(date), amount });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

// A late deposit earns only its own 73 days, not the whole year's growth.
const end = 100 * 1.2 + 100 * 1.2 ** (73 / 365);
const dated = [flow("2025-01-01", -100), flow("2025-10-20", -100), flow("2026-01-01", end)];
const annual = xirrWorking(dated, 20, 365, true)!;
near(annual.pct, 20);
near(annual.paid, 200);
near(annual.gain, end - 200);
near(annual.paidAtStart, annual.returnedAtStart);
assert.ok(annual.paidAtStart < annual.paid);
assert.ok(annual.gain / annual.paid * 100 < annual.pct);

// 100 → 110 over half a year: the intermediate yearly rate is 21%,
// while the card's earned return is 10%. Don't confuse the two.
const period = xirrWorking([flow("2025-01-01", -100), flow("2025-07-02T12:00:00Z", 110)], 21, 182.5, false)!;
near(period.growthFactor, 1.1);
near(period.pct, 10);
near(period.paidAtStart, period.returnedAtStart);

const zero = xirrWorking([flow("2025-01-01", -100), flow("2026-01-01", 100)], 0, 365, true)!;
near(zero.pct, 0);
near(zero.paidAtStart, zero.returnedAtStart);
const loss = xirrWorking([flow("2025-01-01", -100), flow("2026-01-01", 75)], -25, 365, true)!;
near(loss.pct, -25);
near(loss.paidAtStart, loss.returnedAtStart);

assert.equal(xirrWorking(dated, null, 365, true), null);
assert.equal(xirrWorking(dated, -100, 365, true), null);
assert.equal(xirrWorking(dated, Infinity, 365, true), null);
assert.equal(xirrWorking(dated, 20, null, false), null);
assert.equal(xirrWorking([], 20, 365, true), null);
assert.equal(xirrWorking([flow("bad", -100)], 20, 365, true), null);
assert.equal(xirrWorking([flow("2025-01-01", NaN)], 20, 365, true), null);

// Real card inputs: prove the missing numerical bridge reaches the same rate
// and balances the whole dated pool, including its different closing dates.
const statement = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS, accountReturnRecords:BOOK_ACCOUNT_RETURN_RECORDS } as unknown as Portfolio;
// Over the wholly measured accounts: the book's own pool is absent until every
// account is measured (Stage 10fc), so the bridge is proved on the ones that are.
const verified = measuredAccountsReturn(statement, BOOK_ACCOUNTS).parts.map((p) => p.accountId);
const measured = measuredAccountsReturn(statement, BOOK_ACCOUNTS.filter((a) => verified.includes(a.accountId)));
assert.ok(measured.whole);
const actual = xirrWorking(measured.parts.flatMap((p) => [...p.flows, { date: p.asOf, amount: p.terminalValue }]),
  measured.annPct, measured.windowDays, false)!;
near(actual.pct, measured.toDatePct!);
assert.ok(Math.abs(actual.paidAtStart - actual.returnedAtStart) < 0.01);
near(actual.growthFactor, 1 + measured.toDatePct! / 100);
// ── Stage 10fz: a set of flows with more than one rate yields none, and says why.
{
  // −100, +230, −132: NPV is nil near both +10% and +20% a year.
  const two = [flow("2024-01-01", -100), flow("2025-01-01", 230), flow("2026-01-01", -132)];
  assert.equal(xirr(two), null, "two roots: no rate is picked by a starting guess");
  assert.match(xirrAmbiguity(two) ?? "", /admit 2 different money-weighted rates/);
  // A book-shaped pool — opening, TDS payouts, a deposit, a close — has one.
  const one = [flow("2026-04-01", -100), flow("2026-06-15", 0.01), flow("2026-07-28", -50), flow("2026-10-07", 160)];
  assert.equal(xirrAmbiguity(one), null);
  assert.ok(xirr(one) != null);
  // Every flow on one day: no time passes, so there is no rate (not a bisection midpoint).
  assert.equal(xirr([flow("2026-08-06", -310), flow("2026-08-06", 310)]), null);
}

// ── Stage 10fz: bucketXirr's pooled and private-market rates.
{
  // D11: a redeemed part (terminal ₹0) keeps its calls and paybacks in the pool.
  const live = { flows: [flow("2025-01-01", -100)], terminalValue: 110, asOf: new Date("2026-01-01") };
  const redeemed = { flows: [flow("2025-01-01", -100), flow("2025-07-02", 150)], terminalValue: 0, asOf: new Date("2025-07-02") };
  const both = pooledXirr([live, redeemed])!;
  assert.ok(both > pooledXirr([live])! + 5, `the redeemed folio's 50% gain is in the pool: ${both}`);
  near(both, xirrPct([...live.flows, { date: live.asOf, amount: 110 }, ...redeemed.flows])!);
  // D8: a fund is rated on its own dated calls and distributions, at its own valuation date — never today.
  const fund = { name: "F", firstInvest: "2024-01-01", committed: 300, drawn: 200, distributed: 50, currentValue: 220, tvpi: null, dpi: null };
  assert.deepEqual(fundXirr([fund], new Date()), { pct: null, dated: 0, total: 1 }, "no dated calls: not rated");
  const datedFund = { ...fund, valueAsOf: "2026-03-31",
    calls: [{ date: "2024-01-01", amount: 100 }, { date: "2025-01-01", amount: 100 }],
    distributions: [{ date: "2025-12-31", amount: 50 }] };
  const r = fundXirr([datedFund], new Date("2030-01-01"));
  assert.equal(r.dated, 1);
  near(r.pct!, xirrPct([flow("2024-01-01", -100), flow("2025-01-01", -100), flow("2025-12-31", 50), flow("2026-03-31", 220)])!);
  near(fundXirr([datedFund], new Date("2027-01-01")).pct!, r.pct!);
  assert.equal(fundXirr([{ ...datedFund, calls: [{ date: "2024-01-01", amount: 150 }] }]).dated, 0, "calls that do not reproduce `drawn` are not rated");
  const st = [{ name: "S", investDate: "2024-01-01", invested: 100, fairValue: 150, ownershipPct: 1, moic: 1.5 }];
  assert.equal(startupXirr(st, new Date()).pct, null, "no valuation date: not rated");
  near(startupXirr(st.map((s) => ({ ...s, valueAsOf: "2026-01-01" })), new Date("2030-01-01")).pct!,
    xirrPct([flow("2024-01-01", -100), flow("2026-01-01", 150)])!);
}
console.log("XIRR working: late money, yearly/period conversion, balanced dated amounts, zero/loss and missing inputs passed");
