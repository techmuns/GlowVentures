import assert from "node:assert/strict";
import {
  RETURN_TYPES, daysBetween, measureWindow, measureInception, windowReturns, accountInputs, periodStart,
  pmeWindowRows, pmeInceptionRows, OPENING_MARK_TOLERANCE_DAYS,
  type AccountWindow, type InceptionRow, type ReturnType,
} from "../periodReturns";
import { measuredAccountsReturn } from "../returns";
import { capitalMovesWithCalls, capitalRollup } from "../tranches";
import type { Portfolio } from "../types";
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_RETURN_RECORDS, BOOK_ACCOUNT_NAV_HISTORY,
  BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_REVIEW_FLOWS, BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION,
  BOOK_NAV_COVERAGE, BOOK_UNDATED_CAPITAL,
} from "../../data/glowData";

const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const money = (n: number) => String(n);
const methods: ReturnType[] = ["absolute", "cagr", "xirr"];
assert.deepEqual(RETURN_TYPES.map((r) => r.key), ["xirr", "absolute", "cagr"]);
const row: AccountWindow = { accountId: "a", label: "Account A", owner: "Owner", openDate: "2025-01-01", openValue: 100,
  openedInWindow: false, closeDate: "2026-01-01", closeValue: 100 * 1.2 + 100 * 1.2 ** (182 / 365),
  flows: [{ date: "2025-07-03", amount: -100 }], capitalIn: 100, capitalOut: 0, gain: 0 };
row.gain = row.closeValue - 200;
for (const type of methods) {
  const m = measureWindow([row], type, money), w = m.working!;
  assert.ok(m.shown && w);
  near(w.opening, 100); near(w.capitalIn, 100); near(w.closing, row.closeValue); near(w.gain, row.gain);
  assert.equal(w.days, 365); assert.equal(w.flows.length, 3);
  // Stage 10fz: a dated window's Absolute return is Modified Dietz — the same
  // day-weighted money at work CAGR strikes — never gain ÷ (V₀ + capital in).
  if (type === "absolute") {
    const expected = 100 + 100 * daysBetween("2025-07-03", "2026-01-01") / 365;
    near(w.base!, expected);
    near(m.pct!, row.gain / expected * 100);
    assert.ok(Math.abs(m.pct! - row.gain / 200 * 100) > 1, "not the simple gain over money in");
    assert.match(m.formula, /Modified Dietz/);
  }
  if (type === "xirr") near(w.annualPct!, 20, 1e-5);
  if (type === "cagr") {
    const expected = 100 + 100 * daysBetween("2025-07-03", "2026-01-01") / 365;
    near(w.base!, expected);
    near(w.weighted!.reduce((s, f) => s + f.weighted, 0), expected);
    near(w.periodPct!, row.gain / expected * 100);
    near(m.pct!, w.periodPct!);
  }
}

// Each account closes on its own date, including the earlier terminal-value adjustment.
const early = { ...row, accountId: "b", closeDate: "2025-10-01", closeValue: 170, gain: -30 };
const pooled = measureWindow([row, early], "cagr", money);
const expectedBase = 200 + 200 * daysBetween("2025-07-03", "2026-01-01") / 365 - 170 * daysBetween("2025-10-01", "2026-01-01") / 365;
near(pooled.working!.base!, expectedBase);
near(pooled.pct!, (row.gain - 30) / expectedBase * 100);

// Stage 10hk: a CAGR asked of under a year shows the absolute return, named so.
const short = { ...row, closeDate: "2025-10-01" };
const shortCagr = measureWindow([short], "cagr", money);
assert.equal(shortCagr.shown, true);
assert.equal(shortCagr.shownAs, "absolute");
assert.equal(shortCagr.basis, "window");
assert.equal(shortCagr.working!.days, 273);
near(shortCagr.pct!, measureWindow([short], "absolute", money).pct!, 1e-12);
assert.match(shortCagr.worked!, /273 days is under a year, so this is the absolute return, not a CAGR/);
// ...and debt alone is compounded to a year under a year.
const shortDebt = measureWindow([short], "cagr", money, { debt: true });
assert.equal(shortDebt.basis, "annual"); assert.equal(shortDebt.shownAs, undefined);
near(shortDebt.pct!, ((1 + shortDebt.working!.periodPct! / 100) ** (365 / 273) - 1) * 100);
assert.equal(measureWindow([], "absolute", money).working, undefined);

const inception: InceptionRow = { accountId: "a", label: "Account A", owner: "Owner", first: "2024-01-01", valueAsOf: "2026-01-01",
  paidIn: 100, takenOut: 0, value: 144, flows: [{ date: "2024-01-01", amount: -100 }] };
for (const type of methods) {
  const m = measureInception([inception], type, money), w = m.working!;
  assert.ok(m.shown);
  near(w.gain, 44); near(w.opening, 0); near(w.capitalIn, 100);
  if (type === "absolute") near(m.pct!, 44);
  if (type === "cagr") near(m.pct!, (1.44 ** (365 / 731) - 1) * 100);
  if (type === "xirr") near(w.annualPct!, m.pct!);
}
assert.equal(measureInception([{ ...inception, flows: [...inception.flows, { date: "2025-01-01", amount: -5 }] }], "cagr", money).shown, false);

// Regression: the selected YTD subset has a small loss, not a zero return.
const ytd = [
  { ...row, openDate: "2025-12-31", openValue: 0, openedInWindow: true, closeDate: "2026-08-07", closeValue: 309984500.77, capitalIn: 310000000, flows: [{ date: "2026-08-06", amount: -310000000 }], gain: -15499.23 },
  { ...row, accountId: "b", openDate: "2025-12-31", openValue: 0, openedInWindow: true, closeDate: "2026-08-06", closeValue: 214189290.53, capitalIn: 214200000, flows: [{ date: "2026-08-06", amount: -214200000 }], gain: -10709.47 },
];
const tiny = measureWindow(ytd, "absolute", money);
near(tiny.working!.gain, -26208.70);
// Every account opens at nil, so the Modified Dietz period starts on the first
// day money is at work (Stage 10fz) — never a one-day loss over 219 days'
// share of the money, which would read −1.85%.
assert.equal(tiny.working!.from, "2026-08-06");
assert.equal(tiny.working!.days, 1);
near(tiny.pct!, -26208.70 / (310000000 + 214200000 - 214189290.53) * 100);
assert.ok(tiny.pct! < 0 && tiny.pct! > -0.01, `${tiny.pct}`);

const window = windowReturns([
  { accountId: "ok", label: "Complete", owner: "Owner", valuations: [{ date: "2025-01-01", value: 100 }, { date: "2026-01-01", value: 110 }], flows: [], knownFrom: null, knownTo: null, flowsUnknown: null, undated: [] },
  { accountId: "gap", label: "Missing record", owner: "Owner", valuations: [], flows: [], knownFrom: null, knownTo: null, flowsUnknown: "missing dated capital record", undated: [] },
], "2025-01-01", "2026-01-01");
assert.equal(window.included.length, 1);
assert.equal(window.excluded[0].reason, "missing dated capital record");
near(measureWindow(window.included, "absolute", money).pct!, 10);

// ── Stage 10hk: under a year an XIRR or CAGR asked for is the absolute return —
// the very figure Absolute shows — named so; a year or more is a rate per year;
// debt alone is annualised under a year.
{
  const half: AccountWindow = { accountId: "h", label: "Half year", owner: "Owner", openDate: "2026-03-31", openValue: 100,
    openedInWindow: false, closeDate: "2026-09-30", closeValue: 112, flows: [], capitalIn: 0, capitalOut: 0, gain: 12 };
  const abs = measureWindow([half], "absolute", money);
  assert.equal(abs.basis, "window"); assert.equal(abs.shownAs, undefined); near(abs.pct!, 12, 1e-9);
  for (const t of ["xirr", "cagr"] as const) {
    const m = measureWindow([half], t, money);
    assert.equal(m.shownAs, "absolute", `${t} under a year`); assert.equal(m.basis, "window");
    near(m.pct!, abs.pct!, 1e-12);
    assert.match(m.worked!, /183 days is under a year/);
  }
  const debt = measureWindow([half], "xirr", money, { debt: true });
  assert.equal(debt.basis, "annual"); assert.equal(debt.shownAs, undefined);
  near(debt.pct!, (1.12 ** (365 / 183) - 1) * 100, 1e-6); near(debt.working!.periodPct!, 12, 1e-6);
  const year = measureWindow([{ ...half, closeDate: "2027-03-31" }], "xirr", money);
  assert.equal(year.basis, "annual"); assert.equal(year.shownAs, undefined); near(year.pct!, 12, 1e-6);
  const incHalf: InceptionRow = { accountId: "h", label: "Half", owner: "O", first: "2026-03-31", valueAsOf: "2026-09-30",
    paidIn: 100, takenOut: 0, value: 112, flows: [{ date: "2026-03-31", amount: -100 }] };
  for (const t of ["xirr", "cagr"] as const) {
    const m = measureInception([incHalf], t, money);
    assert.equal(m.shownAs, "absolute"); assert.equal(m.basis, "cumulative"); near(m.pct!, 12, 1e-9);
  }
  const iDebt = measureInception([incHalf], "xirr", money, { debt: true });
  assert.equal(iDebt.basis, "annual"); near(iDebt.pct!, iDebt.working!.annualPct!); near(iDebt.working!.periodPct!, 12, 1e-6);
}

// ── D4 (Stage 10fz): an opening mark more than a week old is not this window's opening.
{
  const acct = (id: string, mark: string) => ({ accountId: id, label: id, owner: "Owner",
    valuations: [{ date: mark, value: 100 }, { date: "2026-10-07", value: 101 }], flows: [], knownFrom: null, knownTo: null, flowsUnknown: null, undated: [] });
  const mtd = windowReturns([acct("fresh", "2026-09-30"), acct("week", "2026-09-23"), acct("stale", "2026-08-11")], "2026-09-30", "2026-10-07");
  assert.deepEqual(mtd.included.map((x) => x.accountId), ["fresh", "week"]);
  assert.match(mtd.excluded[0].reason, /dated 2026-08-11, 50 days earlier/);
  assert.equal(OPENING_MARK_TOLERANCE_DAYS, 7);
}

// ── D1 (Stage 10fz): the Returns tab reads the verified return record — one record, every surface.
{
  const statement = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS,
    accountReturnRecords: BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: {} } as unknown as Portfolio;
  const groups = capitalRollup(capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_REVIEW_FLOWS),
    BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, "all", "recent", { commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION });
  const inputs = accountInputs({ accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, returnRecords: BOOK_ACCOUNT_RETURN_RECORDS,
    navHistory: BOOK_ACCOUNT_NAV_HISTORY, cashFlows: BOOK_ACCOUNT_CASH_FLOWS, groups, coverage: BOOK_NAV_COVERAGE.covered,
    undated: BOOK_UNDATED_CAPITAL, fromInception: BOOK_CAPITAL_FROM_INCEPTION, labelOf: (a) => a.provider });
  const tile = measuredAccountsReturn(statement, BOOK_ACCOUNTS);
  const end = inputs.flatMap((a) => a.valuations.map((v) => v.date)).sort().at(-1)!;
  assert.equal(end, tile.lastClose, "the tab's closing date is the tile's");
  const fytd = windowReturns(inputs, periodStart("fytd", end)!, end);
  assert.deepEqual(fytd.included.map((x) => x.accountId).sort(), tile.parts.map((p) => p.accountId).sort(),
    "FYTD covers exactly the tile's accounts");
  for (const p of tile.parts) {
    const r = fytd.included.find((x) => x.accountId === p.accountId)!;
    assert.equal(r.closeDate, p.asOf.toISOString().slice(0, 10), `${p.accountNo} closes on its record's date`);
    near(r.closeValue, p.terminalValue, 0.01);
  }
  // FYTD is under a year, so its XIRR is the absolute return (Stage 10hk). The
  // money-weighted rate over the same record — struck here as it would be for
  // debt — still ties to the tile's pooled return to date.
  const x = measureWindow(fytd.included, "xirr", money);
  const abs = measureWindow(fytd.included, "absolute", money);
  assert.equal(x.shownAs, "absolute"); near(x.pct!, abs.pct!, 1e-12);
  const mw = measureWindow(fytd.included, "xirr", money, { debt: true });
  assert.equal(mw.basis, "annual");
  // The only difference is the opening's date — the close of 31 Mar here, the
  // record's 1 Apr row on the tile — one day over 189.
  // Whole or absent (Stage 10fc): the book-level rate is withheld while any
  // account holding value lacks a record, so the tab is held to the pooled
  // rate over exactly the accounts both read.
  if (!tile.whole) assert.equal(tile.toDatePct, null, "a partial pool strikes no book-level rate");
  const measuredSet = { ...statement, accounts: BOOK_ACCOUNTS.filter((a) => tile.parts.some((p) => p.accountId === a.accountId)) } as unknown as Portfolio;
  const pooled = measuredAccountsReturn(measuredSet, measuredSet.accounts);
  assert.ok(Math.abs(mw.working!.periodPct! - pooled.toDatePct!) < 0.05, `FYTD ${mw.working!.periodPct} vs the same accounts pooled ${pooled.toDatePct}`);
  const gl = fytd.included.find((r) => r.accountId === "green-lantern-capital-llp-510854")!;
  assert.equal(gl.closeDate, BOOK_ACCOUNT_RETURN_RECORDS[gl.accountId].record!.asOf, "Green Lantern closes on its verified record, not its 27 Jul holdings");
  const am = fytd.excluded.find((e) => e.accountId === "motilal-oswal-active-momentum-fund-904168868444")!;
  assert.match(am.reason, /verified return record refuses it — opening valuation and complete dated cash flows are missing/,
    "an account the record refuses is excluded with its reason, never opened at nil");
  // ...in EVERY window, not only FYTD: the rollup's nil origin is not read in its place.
  const y1 = windowReturns(inputs, periodStart("y1", end)!, end);
  assert.ok(!y1.included.some((r) => r.accountId === "sanshi-fund-9039671912"), "Sanshi 9039671912 is not opened at nil over 1Y");
  assert.ok(!y1.included.some((r) => r.accountId === "motilal-oswal-active-momentum-fund-904168868444"));
  // A record opening at a witnessed nil whose unit balance starts from nil may open at nil in an earlier window.
  const helios = y1.included.find((r) => r.accountId === "helios-mutual-fund-10355977");
  assert.ok(helios?.openedInWindow, "Helios opens at nil inside 1Y on its own evidence");
  // D2: Absolute return over the same accounts is Modified Dietz, the CAGR's own denominator.
  const cagr = measureWindow(fytd.included, "cagr", money);
  near(abs.pct!, cagr.working!.periodPct!);
  assert.equal(cagr.shownAs, "absolute");
  assert.ok(Math.abs(abs.pct! - mw.working!.periodPct!) < 1, `Modified Dietz ${abs.pct} sits beside the money-weighted ${mw.working!.periodPct}, not at half of it`);
  // D4 on the book: October MTD opens on no August mark.
  const mtd = windowReturns(inputs, periodStart("mtd", end)!, end);
  assert.ok(mtd.included.every((r) => daysBetween(r.openDate, mtd.start) <= OPENING_MARK_TOLERANCE_DAYS));
  assert.ok(mtd.excluded.some((e) => e.accountId === "goldstandard-wealth-private-limited-100022" && /dated 2026-08-11/.test(e.reason)));
}

// ── D5 (Stage 10fz): the index on the portfolio's own flows (PME).
{
  const acct: AccountWindow = { accountId: "p", label: "P", owner: "O", openDate: "2026-01-01", openValue: 100, openedInWindow: false,
    closeDate: "2026-07-01", closeValue: 0, flows: [{ date: "2026-04-01", amount: -100 }], capitalIn: 100, capitalOut: 0, gain: 0 };
  // The index rises 50% and gives it all back: its own close-to-close move is nil.
  const index: Record<string, number> = { "2026-01-01": 1000, "2026-04-01": 1500, "2026-07-01": 1000 };
  const level = (d: string) => Object.entries(index).filter(([k]) => k <= d).sort().at(-1)?.[1] ?? null;
  // The account earned exactly what the index did on each rupee: its PME is itself, and the gap nil.
  const mirrored = { ...acct, closeValue: 100 + 100 * (1000 / 1500) };
  mirrored.gain = mirrored.closeValue - 200;
  const p = pmeWindowRows([mirrored], level);
  assert.ok(p.rows);
  near(p.rows![0].closeValue, mirrored.closeValue, 1e-9);
  for (const t of ["xirr", "absolute"] as const) near(measureWindow(p.rows!, t, money).pct!, measureWindow([mirrored], t, money).pct!, 1e-9);
  // ...and differs from the index's own close-to-close move (nil), which ignores that the top-up bought at the peak.
  assert.ok(measureWindow(p.rows!, "absolute", money).pct! < -10, "the same flows in the index lost money");
  assert.match(pmeWindowRows([mirrored], () => null).reason ?? "", /no close on or before/);
  const inc = pmeInceptionRows([{ accountId: "i", label: "I", owner: "O", first: "2026-01-01", valueAsOf: "2026-07-01",
    paidIn: 100, takenOut: 0, value: 130, flows: [{ date: "2026-01-01", amount: -100 }] }], level);
  near(inc.rows![0].value, 100, 1e-9);
}
console.log("Selected return working: all methods, date weights, duration policy, exclusions and rounding passed.");
