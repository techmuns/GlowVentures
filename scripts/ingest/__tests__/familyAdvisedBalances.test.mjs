// The family's note of its liquid holdings (Stage 10ka): each value is units ×
// AMFI's 21 Oct 2026 NAV to the paisa, and a demat line carries exactly one
// recorded Motilal balance of the same owner and ISIN to the note's count.
import assert from "node:assert/strict";
import { adviseBalances, unitsFor, ADVISED_NAVS, FAMILY_ADVISED_BALANCES } from "../reference/familyAdvisedBalances.mjs";

// The date is the NAV's: two recorded counts — Aarti's HDFC Overnight folio and
// the arbitrage units MOPWM records bought on 13 Oct — give the note's values at
// 21 Oct's NAV and not at a neighbouring day's.
const at = (units, nav) => Math.round(units * nav * 100) / 100;
assert.equal(at(48.183, ADVISED_NAVS.INF179KB1HT1), 197896.10);
assert.notEqual(at(48.183, 4106.5472), 197896.10);
assert.notEqual(at(48.183, 4107.8028), 197896.10);
assert.equal(at(2473221.627, ADVISED_NAVS.INF247L01ED1), 28118056.68);
assert.notEqual(at(2473221.627, 11.3693), 28118056.68);
assert.equal(unitsFor(28118056.68, ADVISED_NAVS.INF247L01ED1), 2473221.627);
assert.equal(unitsFor(197896.10, ADVISED_NAVS.INF179KB1HT1), 48.183);
// …and a value no count reproduces is refused.
assert.equal(unitsFor(197896.12, ADVISED_NAVS.INF179KB1HT1), null);
for (const l of FAMILY_ADVISED_BALANCES) assert.ok(l.isin && unitsFor(l.amount, ADVISED_NAVS[l.isin]) !== null, l.printed);

const DEMAT = "Motilal Oswal Financial Services (demat)";
const accounts = [
  { accountId: "ajay-demat", provider: DEMAT, ownerId: "ajay-jaisinghani", transactionsOnly: true },
  { accountId: "bharat-demat", provider: DEMAT, ownerId: "bharat-jaisinghani" },
  { accountId: "aarti-demat", provider: DEMAT, ownerId: "aarti-jaisinghani" },
  { accountId: "aarti-hdfc", provider: "HDFC Mutual Fund", ownerId: "aarti-jaisinghani", asOf: "2026-10-01" },
];
const LIQUID = "INF732E01037";
const lines = FAMILY_ADVISED_BALANCES.filter((l) => l.ownerId !== "ankita-jaisinghani");
const out = adviseBalances({
  accounts, lines,
  positions: [{ accountId: "aarti-hdfc", isin: "INF179KB1HT1", quantity: 48.183 }],
  unvalued: [
    { accountId: "bharat-demat", isin: LIQUID, quantity: 3828.05, asOf: "2026-07-31" },
    { accountId: "aarti-demat", isin: LIQUID, quantity: 7679.495, asOf: "2026-07-31" },
  ],
  movements: {
    a: { accountId: "ajay-demat", isin: "INF247L01ED1", closing: 28067435.434, periodTo: "2026-07-31", reason: null },
    b: { accountId: "ajay-demat", isin: LIQUID, closing: 49.071, periodTo: "2026-07-31", reason: null },
  },
});
assert.deepEqual(out.balances.map((b) => [b.accountId, b.isin, b.recordQuantity, b.quantity]), [
  ["aarti-demat", LIQUID, 7679.495, 7748.67],
  ["ajay-demat", "INF247L01ED1", 28067435.434, 2473221.627],
  ["ajay-demat", LIQUID, 49.071, 8986.08],
  ["bharat-demat", LIQUID, 3828.05, 3862.532],
]);
assert.ok(out.balances.every((b) => b.on === "2026-10-21"));
assert.equal(out.confirmed.length, 1);
assert.deepEqual(out.refused, []);

// No recorded balance, or two, and the line lands nowhere; a physical line that
// disagrees with its folio changes nothing.
const refused = adviseBalances({
  accounts: [...accounts, { accountId: "bharat-demat-2", provider: DEMAT, ownerId: "bharat-jaisinghani" }],
  lines: FAMILY_ADVISED_BALANCES.filter((l) => l.ownerId === "bharat-jaisinghani" || l.mode === "physical"),
  positions: [{ accountId: "aarti-hdfc", isin: "INF179KB1HT1", quantity: 40 }],
  unvalued: [
    { accountId: "bharat-demat", isin: LIQUID, quantity: 3828.05, asOf: "2026-07-31" },
    { accountId: "bharat-demat-2", isin: LIQUID, quantity: 10, asOf: "2026-07-31" },
  ],
  movements: {},
});
assert.equal(refused.balances.length, 0);
assert.equal(refused.refused.length, 2);
// A record dated on or after the note is never carried backwards.
const later = adviseBalances({
  accounts, lines: lines.filter((l) => l.ownerId === "bharat-jaisinghani"), positions: [],
  unvalued: [{ accountId: "bharat-demat", isin: LIQUID, quantity: 3870, asOf: "2026-10-31" }], movements: {},
});
assert.equal(later.balances.length, 0);
assert.match(later.refused[0], /not before the note/);

console.log("familyAdvisedBalances: ok");
