import assert from "node:assert/strict";
import { xirrWorking } from "../xirrWorking";
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
const measured = measuredAccountsReturn(statement, BOOK_ACCOUNTS);
const actual = xirrWorking(measured.parts.flatMap((p) => [...p.flows, { date: p.asOf, amount: p.terminalValue }]),
  measured.annPct, measured.windowDays, false)!;
near(actual.pct, measured.toDatePct!);
assert.ok(Math.abs(actual.paidAtStart - actual.returnedAtStart) < 0.01);
near(actual.growthFactor, 1 + measured.toDatePct! / 100);
console.log("XIRR working: late money, yearly/period conversion, balanced dated amounts, zero/loss and missing inputs passed");
