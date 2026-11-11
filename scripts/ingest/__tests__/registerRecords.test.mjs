// THE FAMILY'S INVESTMENT REGISTER, WHERE IT DATES MONEY (Stage 10mv).
// Read off the committed workbook, and broken on copies of it: each claim the
// book makes from a register row must refuse when the row, the second document
// or the reconciliation it rests on is not there.
import assert from "node:assert/strict";
import {
  readRegisterWorkbook, registerInceptions, inceptionMoves, registerAllotment, registerReviewFlows, registerRedate, OPENING_TOLERANCE,
} from "../../lib/registerRecords.mjs";
import { loadMopwmTransactions } from "../../lib/mopwmTransactions.mjs";

const wb = readRegisterWorkbook(".");
const copy = () => structuredClone(wb);
const cell = (w, sheet, row, col, v) => { w.sheets.find((s) => s.name.trim() === sheet).rows[row - 1][col] = v; return w; };

// ── 1. the three opening payments, exactly as the register prints them ──
const inc = registerInceptions(wb);
assert.deepEqual(inc.map((i) => [i.accountId, i.date, i.amount]), [
  ["v-e-c-assago-capital-management-llp-128005", "2025-07-30", 75000000],
  ["goldstandard-wealth-private-limited-100023", "2025-12-26", 175000000],
  ["goldstandard-wealth-private-limited-100022", "2025-12-26", 75000000],
]);
// A row renamed or moved under another holder stops the build, never a guess.
assert.throws(() => registerInceptions(cell(copy(), "ATJ-AAJ FUND HOUSE", 84, 1, "VEC ASSAGO AIF")));
assert.throws(() => registerInceptions(cell(copy(), "ATJ-AAJ FUND HOUSE", 84, 4, "ANKITA")));

// ── 2. the opening payment is listed only where the manager's opening balance reconciles it ──
const vec = inc[0];
const account = { accountId: vec.accountId, inceptionDate: "2025-07-30" };
const issues = (balance) => [{ reportType: "capital-register", cashFlows: [{ kind: "capital-register", date: "2026-04-01", description: "Opening Balance", balance }] }];
const ok = inceptionMoves(vec, { account, allIssues: issues(74978469), typed: [] });
assert.equal(ok.reach, "2026-03-31");
assert.deepEqual(ok.moves.map((m) => [m.date, m.direction, m.amount, !!m.assumedDate]), [["2025-07-30", "in", 75000000, false], ["2026-03-31", "out", 21531, true]]);
assert.ok(ok.moves.every((m) => m.fromRegister?.row === 84));
// exact balance: no assumed row at all
assert.equal(inceptionMoves(vec, { account, allIssues: issues(75000000), typed: [] }).moves.length, 1);
// refusals: another inception date, a gap over the tolerance, a balance above the payment, an earlier dated row, no register
assert.ok(inceptionMoves(vec, { account: { ...account, inceptionDate: "2025-08-01" }, allIssues: issues(74978469), typed: [] }).reason);
assert.ok(inceptionMoves(vec, { account, allIssues: issues(75000000 * (1 - OPENING_TOLERANCE) - 10), typed: [] }).reason);
assert.ok(inceptionMoves(vec, { account, allIssues: issues(75000001), typed: [] }).reason);
assert.ok(inceptionMoves(vec, { account, allIssues: issues(74978469), typed: [{ date: "2026-02-01", direction: "in", amount: 1 }] }).reason);
assert.ok(inceptionMoves(vec, { account, allIssues: [], typed: [] }).reason);

// ── 3. Sotefin: two purchases and the prospectus's bonus are every unit held ──
const so = registerAllotment(wb, { isin: "INE12Z301012", ownerId: "ajay-jaisinghani" });
assert.equal(so.quantity, 171879);
assert.equal(so.costBasis, 20000400);
assert.deepEqual(so.unitRecord, [{ date: "2024-07-12", units: 11364 }, { date: "2025-06-25", units: 125004 }, { date: "2025-11-03", units: 171879 }]);
assert.equal(registerAllotment(wb, { isin: "INE12Z301012", ownerId: "ankita-jaisinghani" }), null);
// units × rate that is not the amount, or a bonus that is not its ratio, refuses
assert.throws(() => registerAllotment(cell(copy(), "AJAY SIR - AARTI", 41, 5, "12500000"), { isin: "INE12Z301012", ownerId: "ajay-jaisinghani" }));
assert.throws(() => registerAllotment(cell(copy(), "AJAY SIR - AARTI", 41, 6, "11000 EQUITY SHARES OF RS. 1100 EACH."), { isin: "INE12Z301012", ownerId: "ajay-jaisinghani" }));

// ── 4. NSE: Ankita's two payments, carried to 75,000 by the bonus MOPWM's report records ──
const mopwm = loadMopwmTransactions(".");
const nse = registerReviewFlows(wb, { key: "national-stock-exchange-of-india", owner: "ankita-jaisinghani", quantity: 75000, mopwm });
assert.equal(nse.paid, 42763713);
assert.deepEqual(nse.flows.map((f) => [f.date, f.amount, f.register.row]), [["2022-12-09", 6412500, 74], ["2023-01-27", 36351213, 75]]);
assert.ok(registerReviewFlows(wb, { key: "national-stock-exchange-of-india", owner: "ankita-jaisinghani", quantity: 74000, mopwm }).reason);
assert.equal(registerReviewFlows(wb, { key: "national-stock-exchange-of-india", owner: "ajay-jaisinghani", quantity: 125000, mopwm }), null);
assert.throws(() => registerReviewFlows(wb, { key: "national-stock-exchange-of-india", owner: "ankita-jaisinghani", quantity: 75000,
  mopwm: { rows: mopwm.rows.filter((r) => !/BONUS/.test(r.ref ?? "")) } }));
assert.throws(() => registerReviewFlows(cell(copy(), "PVT INV", 75, 5, "36351000"), { key: "national-stock-exchange-of-india", owner: "ankita-jaisinghani", quantity: 75000, mopwm }));

// ── 4. the purchase the review and the register date differently: the register's day (Stage 10nd) ──
const zepto = [{ date: "2025-02-24", kind: "purchase", amount: 150015960, units: 4716, rate: 31810, reviewRow: 443 }];
const z = registerRedate(wb, { key: "zepto", owner: "ajay-jaisinghani", flows: zepto });
assert.deepEqual(z.flows.map((f) => [f.date, f.amount, f.units, f.register.row]), [["2024-11-13", 150015960, 4716, 65]]);
const tvc = registerRedate(wb, { key: "transition-venture-capital-fund-i-class-a1", owner: "ankita-jaisinghani",
  flows: [{ date: "2025-08-01", kind: "purchase", amount: 2500000, units: 2500, rate: 1000, reviewRow: 82 }] });
assert.equal(tvc.date, "2024-12-20");
assert.equal(registerRedate(wb, { key: "zepto", owner: "ankita-jaisinghani", flows: zepto }), null);
// …and refuses where the two records stop describing one payment.
assert.throws(() => registerRedate(wb, { key: "zepto", owner: "ajay-jaisinghani", flows: [{ ...zepto[0], amount: 150000000 }] }));
assert.throws(() => registerRedate(wb, { key: "zepto", owner: "ajay-jaisinghani", flows: [{ ...zepto[0], units: 4700 }] }));
assert.throws(() => registerRedate(wb, { key: "zepto", owner: "ajay-jaisinghani", flows: [{ ...zepto[0], reviewRow: 444 }] }));
assert.throws(() => registerRedate(cell(copy(), "AJAY SIR - AARTI", 65, 6, "4716 SHARES OF RS 31000 EACH"), { key: "zepto", owner: "ajay-jaisinghani", flows: zepto }));
assert.throws(() => registerRedate(cell(copy(), "FUND HOUSE", 91, 4, "BHARAT"), { key: "transition-venture-capital-fund-i-class-a1", owner: "ankita-jaisinghani",
  flows: [{ date: "2025-08-01", kind: "purchase", amount: 2500000, units: 2500, rate: 1000, reviewRow: 82 }] }));

console.log("registerRecords: opening payments reconciled to the manager's balance, Sotefin through its bonus, NSE through MOPWM's bonus — and each refusal");
