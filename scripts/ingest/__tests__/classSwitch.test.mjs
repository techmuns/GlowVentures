// A fund's class switch, and the family's cost and dates carried through it.
// Run: node scripts/ingest/__tests__/classSwitch.test.mjs
//
// ON CONSTRUCTED INPUTS, because the real book cannot exercise a gate: both
// Buoyant folios pass every one, so a working gate and a deleted one would draw
// the same two rows. Each gate is broken here once and made to refuse, and the
// case says what it refused on — `buoyantFlows.test.mjs`'s method, one layer up.
import {
  reclassificationsFrom, carryLotsThroughSwitches, carryCostThroughSwitches, UNIT_TIE,
} from "../../lib/classSwitch.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("classSwitch");

const A1 = "fund-class-a1", A4 = "fund-class-a4", A5 = "fund-class-a5";
const leg = (date, key, amount, units) => ({
  date, kind: "reclassification", security: `Fund — Class ${key.slice(-2).toUpperCase()}`, securityKey: key, amount, units,
});

// ── reclassificationsFrom: the two legs, paired ─────────────────────────────
{
  const notes = [];
  const s = reclassificationsFrom([
    leg("2025-06-01", A1, -2100600, -14004), leg("2025-06-01", A4, 2100600, 17505),
    { date: "2025-06-01", kind: "contribution", securityKey: A4, amount: 600000, units: 5000 },
  ], "acct", notes, "t");
  ok("a same-day, same-rupee pair across two classes is one switch", s.length === 1 && !notes.length,
    JSON.stringify({ s, notes }));
  ok("...from the old class to the new", s[0]?.from === A1 && s[0]?.to === A4);
  ok("...with both unit counts as positives", s[0]?.fromUnits === 14004 && s[0]?.toUnits === 17505);
  ok("...and a contribution on the same day is not a leg", s[0]?.amount === 2100600);
}
{
  const notes = [];
  const s = reclassificationsFrom([leg("2025-06-01", A1, -2100600.38, -14004), leg("2025-06-01", A4, 2100600.32, 17505)],
    "acct", notes, "t");
  ok("a ₹0.06 residual still pairs — each leg is rounded at its own NAV", s.length === 1, JSON.stringify(notes));
}
{
  const notes = [];
  const s = reclassificationsFrom([leg("2025-06-01", A1, -2100602, -14004), leg("2025-06-01", A4, 2100600, 17505)],
    "acct", notes, "t");
  ok("a ₹2 residual is not rounding — nothing pairs", s.length === 0);
  ok("...and BOTH unpaired legs are named", notes.length === 2 && notes.every((n) => /nothing is carried/.test(n)),
    notes.join(" | "));
}
{
  const notes = [];
  const s = reclassificationsFrom([leg("2025-06-01", A1, -2100600, -14004), leg("2025-06-02", A4, 2100600, 17505)],
    "acct", notes, "t");
  ok("legs a day apart are not a switch", s.length === 0 && notes.length === 2);
}
{
  const notes = [];
  const s = reclassificationsFrom([leg("2025-06-01", A1, -2100600, -14004), leg("2025-06-01", A1, 2100600, 14004)],
    "acct", notes, "t");
  ok("a redemption and an allotment of the SAME class are not a switch", s.length === 0);
}

// ── carryLotsThroughSwitches: the money moves with the units ────────────────
const move = (date, key, invested, units, extra = {}) => ({
  accountId: "acct", date, direction: "in", label: "Cash Deposits", amount: invested, invested, units,
  security: `Fund — Class ${key.slice(-2).toUpperCase()}`, securityKey: key, ...extra,
});
const SWITCH = { accountId: "acct", date: "2025-06-01", from: A1, fromSecurity: "Fund — Class A1", fromUnits: 14004,
  to: A4, toSecurity: "Fund — Class A4", toUnits: 17505, amount: 2100600 };
const lotsOf = (moves) => {
  const m = new Map();
  for (const x of moves) m.set(`acct|${x.securityKey}`, [...(m.get(`acct|${x.securityKey}`) ?? []), x]);
  return m;
};
{
  const moves = [move("2024-06-01", A1, 1000000, 10000), move("2025-04-01", A1, 500500, 4004),
    move("2025-06-01", A4, 600000, 5000), move("2025-09-01", A1, 100000, 800)];
  const notes = [];
  const byKey = carryLotsThroughSwitches(lotsOf(moves), [SWITCH], moves, notes);
  const a4 = byKey.get(`acct|${A4}`) ?? [];
  const carried = a4.filter((m) => m.carriedFrom);
  ok("every lot allotted into the old class before the switch moves into the new one", carried.length === 2,
    JSON.stringify(a4));
  ok("...keeping the date it was PAID", carried.map((m) => m.date).join(",") === "2024-06-01,2025-04-01");
  ok("...and what it COST", carried.map((m) => m.invested).join(",") === "1000000,500500");
  ok("...with its units converted at the switch's OWN ratio",
    Math.abs(carried[0].units - 10000 * (17505 / 14004)) <= 1e-4, String(carried[0].units));
  ok("...so the carried units sum to what the switch delivered",
    Math.abs(carried.reduce((t, m) => t + m.units, 0) - 17505) <= UNIT_TIE);
  ok("...and each records what it was BOUGHT as",
    carried[0].carriedFrom.securityKey === A1 && carried[0].carriedFrom.units === 10000
      && carried[0].carriedFrom.switchedOn === "2025-06-01");
  ok("the new class's own contribution is untouched", a4.some((m) => !m.carriedFrom && m.units === 5000));
  ok("a lot bought into the old class AFTER the switch stays there",
    (byKey.get(`acct|${A1}`) ?? []).length === 1 && byKey.get(`acct|${A1}`)[0].date === "2025-09-01");
  ok("the carry is named in the notes", notes.some((n) => /carries 2 dated contribution/.test(n)), notes.join(" | "));
  ok("the input record itself is never mutated", moves.every((m) => !m.carriedFrom) && moves[0].units === 10000);
}
{
  // GATE: the lots must be the whole of what moved.
  const moves = [move("2024-06-01", A1, 1000000, 10000)];
  const notes = [];
  const byKey = carryLotsThroughSwitches(lotsOf(moves), [SWITCH], moves, notes);
  ok("a partial switch is refused — which units moved would be a lot selection",
    !(byKey.get(`acct|${A4}`) ?? []).length && (byKey.get(`acct|${A1}`) ?? []).length === 1);
  ok("...and says how many units the lots account for", notes.some((n) => /account for 10000 unit\(s\) against the 14004/.test(n)),
    notes.join(" | "));
}
{
  // GATE: nothing may have been redeemed from the old class for cash first.
  const moves = [move("2024-06-01", A1, 1000000, 10000), move("2025-04-01", A1, 500500, 4004),
    { accountId: "acct", date: "2025-05-01", direction: "out", label: "Redemption", amount: 1000, invested: null,
      units: -8, security: "Fund — Class A1", securityKey: A1 }];
  const notes = [];
  const byKey = carryLotsThroughSwitches(lotsOf(moves.filter((m) => m.direction === "in")), [SWITCH], moves, notes);
  ok("a class that paid cash out before the switch is not carried", !(byKey.get(`acct|${A4}`) ?? []).length);
  ok("...and the reason names the lot selection", notes.some((n) => /redeemed from the old class for cash/.test(n)),
    notes.join(" | "));
}
{
  // Two switches in a row: A1 → A4 → A5. The lot keeps what it was first BOUGHT as.
  const moves = [move("2024-06-01", A1, 1000000, 10000), move("2025-04-01", A1, 500500, 4004)];
  const second = { accountId: "acct", date: "2026-01-01", from: A4, fromSecurity: "Fund — Class A4", fromUnits: 17505,
    to: A5, toSecurity: "Fund — Class A5", toUnits: 35010, amount: 2500000 };
  const notes = [];
  const byKey = carryLotsThroughSwitches(lotsOf(moves), [second, SWITCH], moves, notes);
  const a5 = byKey.get(`acct|${A5}`) ?? [];
  ok("switches are applied in DATE order, whatever order they arrive in", a5.length === 2, JSON.stringify(notes));
  ok("...and a lot through two switches keeps its first class and units",
    a5[0]?.carriedFrom?.securityKey === A1 && a5[0]?.carriedFrom?.units === 10000);
  ok("...dated to the switch that last moved it", a5[0]?.carriedFrom?.switchedOn === "2026-01-01");
  ok("...with units through BOTH ratios", Math.abs(a5.reduce((t, m) => t + m.units, 0) - 35010) <= UNIT_TIE);
}

// ── carryCostThroughSwitches: the two gates ─────────────────────────────────
//   paid: 10,00,000 + 5,00,500 (switched) + 6,00,000 = 21,00,500
//   the statement's cost: 21,00,600 (switch-day value) + 6,00,000 = 27,00,600
//   the gap the switch restated: 6,00,100 — and the appraisal's Realized Gain.
const TRANCHES = () => ({
  [`acct|${A4}`]: {
    accountId: "acct", securityKey: A4, units: 22505,
    moves: [
      move("2024-06-01", A4, 1000000, 12500, { carriedFrom: { security: "Fund — Class A1", securityKey: A1, units: 10000, switchedOn: "2025-06-01" } }),
      move("2025-04-01", A4, 500500, 5005, { carriedFrom: { security: "Fund — Class A1", securityKey: A1, units: 4004, switchedOn: "2025-06-01" } }),
      move("2025-06-01", A4, 600000, 5000),
    ],
  },
});
const position = (over = {}) => ({
  accountId: "acct", securityKey: A4, security: "Fund — Class A4", quantity: 22505, marketValue: 2925650,
  costBasis: 2700600, avgCost: 120, unrealizedPnL: 225050, returnPct: 8.33, costBasisSource: undefined,
  printedCostBasis: undefined, ...over,
});
const BRIDGE = (realized) => ({ acct: [{ basis: "since-inception", realized }] });
{
  const p = position();
  const notes = [];
  carryCostThroughSwitches([p], TRANCHES(), [SWITCH], BRIDGE(600100), notes);
  ok("the cost becomes what the contributions PAID", p.costBasis === 2100500, String(p.costBasis));
  ok("...the statement's own figure is kept beside it as the check", p.printedCostBasis === 2700600);
  ok("...and the position says where its cost came from", p.costBasisSource === "carried-through-switch");
  ok("the unrealised gain moves with the cost, never the market value",
    p.unrealizedPnL === 825150 && p.marketValue === 2925650, String(p.unrealizedPnL));
  ok("...and so do the return and the average cost",
    p.returnPct === 39.28 && Math.abs(p.avgCost - 2100500 / 22505) < 1e-4, `${p.returnPct} ${p.avgCost}`);
  ok("the note names the witness", notes.some((n) => /prints exactly that as Realized Gain \(600100\)/.test(n)),
    notes.join(" | "));
}
{
  // GATE A — the printed cost must be the allotments at their own amounts.
  const p = position({ costBasis: 2650000 });
  const notes = [];
  carryCostThroughSwitches([p], TRANCHES(), [SWITCH], BRIDGE(549500), notes);
  ok("(A) a printed cost that is not the allotments is left alone",
    p.costBasis === 2650000 && p.costBasisSource === undefined && p.printedCostBasis === undefined);
  ok("(A) ...and says why", notes.some((n) => /not its allotments at their own amounts/.test(n)), notes.join(" | "));
}
{
  // GATE B — where the account holds nothing else, its own Realized Gain must agree.
  const p = position();
  const notes = [];
  carryCostThroughSwitches([p], TRANCHES(), [SWITCH], BRIDGE(600000), notes);
  ok("(B) a Realized Gain that disagrees with the restated gap leaves the cost alone",
    p.costBasis === 2700600 && p.costBasisSource === undefined);
  ok("(B) ...and names both figures", notes.some((n) => /restated 600100 of gain/.test(n) && /600000/.test(n)),
    notes.join(" | "));
}
{
  // ...and the witness is only asked where it can speak for this holding alone.
  const p = position();
  const other = { accountId: "acct", securityKey: "other", security: "Other", quantity: 1, marketValue: 5000, costBasis: 4000 };
  const notes = [];
  carryCostThroughSwitches([p, other], TRANCHES(), [SWITCH], BRIDGE(600000), notes);
  ok("(B) an account holding other positions is not held to its account-wide realised figure",
    p.costBasis === 2100500);
  ok("(B) ...and the note says the witness could not apply, rather than that there was none",
    notes.some((n) => /holds other positions/.test(n)), notes.join(" | "));
  ok("...and the other position is untouched", other.costBasis === 4000 && other.costBasisSource === undefined);
}
{
  // No witness at all is allowed, and SAID.
  const p = position();
  const notes = [];
  carryCostThroughSwitches([p], TRANCHES(), [SWITCH], {}, notes);
  ok("no performance appraisal: carried, on gate A alone", p.costBasis === 2100500);
  ok("...and the absence of a witness is stated", notes.some((n) => /no performance appraisal/.test(n)));
}
{
  // A holding whose contributions were never carried through a switch keeps its statement cost.
  const t = TRANCHES();
  t[`acct|${A4}`].moves = t[`acct|${A4}`].moves.map(({ carriedFrom, ...m }) => m);
  const p = position();
  carryCostThroughSwitches([p], t, [], BRIDGE(600100), []);
  ok("no carried tranche — no switch to undo — nothing moves", p.costBasis === 2700600 && p.costBasisSource === undefined);
}
{
  const p = position({ quantity: 0, marketValue: 0 });
  carryCostThroughSwitches([p], TRANCHES(), [SWITCH], BRIDGE(600100), []);
  ok("a closed position is never re-costed", p.costBasis === 2700600);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
