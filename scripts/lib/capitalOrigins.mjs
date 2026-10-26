import { UNIT_TIE } from "./classSwitch.mjs";
const isNum = v => typeof v === "number" && Number.isFinite(v);
const CAPITAL_KINDS = new Set(["contribution", "withdrawal"]);

/**
 * ── DOES THIS ACCOUNT'S CAPITAL RECORD START AT INCEPTION? ──────────────────
 *
 *   *"how can net invested be negative?"* — 3P, whose record could not carry a
 *   return at all, because nothing said its list of purchases was the whole of
 *   them.
 *
 * A fund statement that prints a RUNNING UNIT BALANCE beside each allotment
 * answers the question itself: where a class's EARLIEST row allots exactly the
 * units its printed balance then stands at, the balance was ZERO before it — the
 * record begins where the holding does. 3P prints it on every row of every class
 * (its reader refuses the table unless the running total reproduces every printed
 * balance), and so does Sanshi.
 *
 * A SERIES NAMED FOR THE DAY IT WAS ISSUED ANSWERS IT ANOTHER WAY. ASK's
 * statement prints no running balance; it names each series for its issue date
 * (`Class A6 Series 31/01/2025`, carried as `seriesIssued`). A class's earliest
 * row that is a contribution dated ON that day is the first allotment the series
 * can have had — nothing of it existed the day before — so its balance was zero
 * before it, which is the same fact 3P's printed balance states. Both folios
 * the September 2026 delivery brings start that way, each allotting its first
 * units at ₹1,000.00 apiece, and the reader will not publish the table unless
 * its units run to the Account Summary's own printed balance.
 *
 * STRUCK PER CLASS AND REQUIRED OF EVERY ONE. A single class that begins
 * mid-stream would leave some purchase unrecorded, so every contribution row must
 * carry a security, units and one of the two pieces of evidence, and every
 * class's first row must start from zero: within half the last printed decimal
 * of its printed balance, or on its series' own issue date. Anything less is not
 * evidence and the account is not listed — the caller then falls back to the
 * other two tests, and failing those, withholds the return with the reason.
 */
export function capitalRecordFromInception(cashFlows) {
  const all = cashFlows ?? [];
  /**
   * A CLASS CAN BEGIN WITH A SWITCH (Stage 10fj). Motilal Oswal's Hedged Equity
   * moved its whole B2 holding into F1 on 31 Jul 2024, and Buoyant's A4 class
   * was born of A1 the same way: the new class's first row is the switch's
   * INCOMING leg, not a contribution. It is the class's origin exactly as a
   * first purchase is — provided the same day carries the equal and opposite
   * outgoing leg of another class, so the money demonstrably came from inside
   * the account and not from a purchase this record lacks.
   */
  const legIn = (c) => c.kind === "reclassification" && isNum(c.amount) && c.amount > 0 && !!c.securityKey
    && all.some((o) => o.kind === "reclassification" && o.date === c.date && o.securityKey && o.securityKey !== c.securityKey
      && isNum(o.amount) && Math.abs(o.amount + c.amount) <= 1);
  // An explicit opening is part of the origin test even when that scheme has
  // no later external purchase. Otherwise another scheme's zero-based buys
  // could certify a folio whose main holdings arrived before this ledger.
  const openings = all.filter((c) => c.kind === "opening-units");
  if (openings.some((c) => !c.date || !c.securityKey || !isNum(c.units) || !isNum(c.balance))) return false;
  const rows = all.filter((c) => c.date && (CAPITAL_KINDS.has(c.kind) || legIn(c) || c.kind === "opening-units"));
  const ins = rows.filter((c) => c.kind === "contribution");
  if (!ins.length) return false;
  const evidenced = (c) => isNum(c.balance) || !!c.seriesIssued;
  if (!ins.every((c) => c.securityKey && isNum(c.units) && evidenced(c))) return false;
  const first = new Map();
  for (const c of [...rows].filter((r) => r.securityKey && isNum(r.units) && evidenced(r)).sort((a, b) => a.date.localeCompare(b.date))) {
    if (!first.has(c.securityKey)) first.set(c.securityKey, c);
  }
  return [...first.values()].every((c) => c.kind === "opening-units"
    ? Math.abs(c.units) <= UNIT_TIE && Math.abs(c.balance) <= UNIT_TIE
    : (c.kind === "contribution" || legIn(c)) && (isNum(c.balance)
      ? Math.abs(Math.abs(c.balance) - Math.abs(c.units)) <= UNIT_TIE
      : c.date === c.seriesIssued));
}

