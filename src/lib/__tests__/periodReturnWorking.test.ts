import assert from "node:assert/strict";
import { RETURN_TYPES, daysBetween, measureWindow, measureInception, windowReturns, type AccountWindow, type InceptionRow, type ReturnType } from "../periodReturns";

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
  if (type === "absolute") near(m.pct!, row.gain / 200 * 100);
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

const short = { ...row, closeDate: "2025-10-01" };
const shortCagr = measureWindow([short], "cagr", money);
assert.equal(shortCagr.shown, false);
assert.equal(shortCagr.working!.days, 273);
assert.match(shortCagr.reason!, /This app.*at least 365 days/);
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
near(tiny.pct!, -0.004999752);
assert.equal(tiny.pct!.toFixed(2), "-0.00");

const window = windowReturns([
  { accountId: "ok", label: "Complete", owner: "Owner", valuations: [{ date: "2025-01-01", value: 100 }, { date: "2026-01-01", value: 110 }], flows: [], knownFrom: null, knownTo: null, flowsUnknown: null, undated: [] },
  { accountId: "gap", label: "Missing record", owner: "Owner", valuations: [], flows: [], knownFrom: null, knownTo: null, flowsUnknown: "missing dated capital record", undated: [] },
], "2025-01-01", "2026-01-01");
assert.equal(window.included.length, 1);
assert.equal(window.excluded[0].reason, "missing dated capital record");
near(measureWindow(window.included, "absolute", money).pct!, 10);
console.log("Selected return working: all methods, date weights, duration policy, exclusions and rounding passed.");
