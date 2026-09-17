// THE ₹1,000 FLOOR, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "यह तो ना यहां पर irrelevant items हैं. यह सबको हटा दो यह. 54 rupees क्या
//    होता है? … or we can just say that less than thousand rupees remove
//    automatically."
//
// This is the first filter in this app that DROPS A ROW AND MOVES MONEY WITH
// IT. The closed-position filter beside it is free — a redeemed holding is a
// measured ₹0, so every total is identical either way — and that is exactly
// why it is the wrong precedent to reason from. Four things can go wrong here
// and NOT ONE of them shows on a rendered page, because ₹848.24 against a
// ₹710 Cr book is invisible at the one-decimal-crore precision every surface
// prints:
//
//   • the test struck on the statement ROW rather than the HOLDING, so a name
//     held in five small lots vanishes although the family owns ₹4,500 of it;
//   • the sign dropped, so V.E.C's two negative cash payables go and two
//     mandates silently gain ₹2.22 L;
//   • the floor applied on one surface and not another, so a tile opens a
//     table that disagrees with it;
//   • the filter wired up and quietly matching nothing, which looks exactly
//     like a clean book.
//
// ── THE ANCHOR IS `glowData.ts`, AND THE EXPECTATIONS ARE DERIVED ───────────
//
// Every figure below is computed from the generated book on this run, or
// written as a RELATION that survives the next drop moving it. The one literal
// is the floor itself, which is the family's instruction and the thing under
// test.
import fs from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS, BOOK_SUMMARY } from "@/data/glowData";
import {
  NEGLIGIBLE_VALUE_FLOOR, currentHoldings, droppedHoldings, negligibleKeys,
  dedupedPositions, isRedeemedToNil, sum,
} from "@/lib/analytics";

const AUDIT = path.resolve(process.cwd(), "public/audit");

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const rs = (n: number) => `₹${n.toFixed(2)}`;

const book = BOOK_POSITIONS;
const held = currentHoldings(book);
const { closed, negligible } = droppedHoldings(book);

// ── 1. THE FILTER IS DOING WORK ─────────────────────────────────────────────
// A suite that passes over no input claims confidence nobody earned — the rule
// `golden.mjs` already holds. Every check below is satisfied trivially by a
// floor wired to nothing, so this one comes first and is a FAILURE, never an
// abstention: the family pointed at a specific ₹54 row, so a book where the
// floor catches nothing means the floor stopped working, not that the book
// changed.
ok("the floor actually drops holdings — a rule matching nothing would pass every check below",
   negligible.length > 0, `${negligible.length} rows, ${rs(sum(negligible.map((p) => p.marketValue)))}`);

// ── 2. THE THREE SETS PARTITION THE BOOK ────────────────────────────────────
// Held + closed + negligible must rebuild the book exactly. This is what
// catches a row counted under both reasons (which would double-count it in any
// disclosure that adds the two counts) and a row that falls out of all three.
{
  const total = held.length + closed.length + negligible.length;
  ok("held + closed + negligible = every position in the book",
     total === BOOK_POSITIONS.length, `${held.length} + ${closed.length} + ${negligible.length} = ${total} vs ${BOOK_POSITIONS.length}`);
  const overlap = closed.filter((c) => negligible.some((n) => n === c));
  ok("no row is counted under both reasons — a redeemed ₹0 is under the floor too, and `closed` must win",
     overlap.length === 0, `${overlap.length} in both`);
}

// ── 3. WHAT IT COSTS, STATED AS A FIGURE ────────────────────────────────────
// `BOOK_SUMMARY.totalValue` is produced by `build-book.mjs` on a completely
// different path from this filter, so the two are independent. The floor is
// carried as an EXPLICIT TERM rather than a widened tolerance: that is what
// keeps a drop of ₹848 from growing into a drop of ₹8 Cr unnoticed.
{
  const bookMV = sum(dedupedPositions(BOOK_POSITIONS).map((p) => p.marketValue));
  const heldMV = sum(currentHoldings(dedupedPositions(BOOK_POSITIONS)).map((p) => p.marketValue));
  const droppedMV = sum(droppedHoldings(dedupedPositions(BOOK_POSITIONS)).negligible.map((p) => p.marketValue));
  ok("consolidated NAV, less exactly what the floor took, is the book's own total",
     Math.abs((heldMV + droppedMV) - bookMV) < 0.005, `${rs(heldMV)} + ${rs(droppedMV)} vs ${rs(bookMV)}`);
  ok("...and the book's own total is BOOK_SUMMARY.totalValue, so the two paths meet",
     Math.abs(bookMV - BOOK_SUMMARY.totalValue) < 0.005, `${rs(bookMV)} vs ${rs(BOOK_SUMMARY.totalValue)}`);
  // The floor must stay a rounding-error share of the book. If a future drop
  // pushes it past this it is no longer "irrelevant items" and the family are
  // owed the decision again rather than having it applied silently.
  ok("what the floor removes is a negligible share of the book — it is a speck filter, not a policy on real money",
     Math.abs(droppedMV) / BOOK_SUMMARY.totalValue < 0.0001,
     `${rs(droppedMV)} of ${rs(BOOK_SUMMARY.totalValue)}`);
}

// ── 4. IT MOVES MARKET VALUE AND NOTHING ELSE ───────────────────────────────
// Measured rather than assumed: every row the floor takes reports no cost, no
// realised gain and no dividend, so Capital invested, Realised P&L and income
// are untouched. If a future drop brings a costed speck this fails, and it
// SHOULD — a holding with a cost basis is one the family paid for, and dropping
// it silently understates what they put in.
{
  const withCost = negligible.filter((p) => p.costBasis != null);
  const withDiv = negligible.filter((p) => p.dividendReceived != null);
  ok("no dropped holding reports a cost — so Capital invested cannot move",
     withCost.length === 0, withCost.map((p) => p.security).join(", "));
  ok("no dropped holding reports a dividend — so income cannot move",
     withDiv.length === 0, withDiv.map((p) => p.security).join(", "));
  /**
   * REALISED IS NOT A FIELD ON `Position` — it is reported PER SECURITY and
   * joined at runtime by `ledger.ts` out of `public/audit/`. The first draft of
   * this check read `p.realizedPnL`, found `undefined` on all six rows and
   * PASSED while asserting nothing, which is the shape of a check that cannot
   * fail. So it is struck on the archive the Realised column actually joins to,
   * read off disk the way the stock-exposure suite reads the look-through store
   * — a hand-written fixture would prove only that two inventions agree.
   */
  const dropped = new Set(negligible.map((p) => p.securityKey));
  const realisedKeys = new Set<string>();
  let lotCount = 0;
  for (const dir of fs.readdirSync(AUDIT)) {
    const f = path.join(AUDIT, dir, "document.json");
    if (!fs.existsSync(f)) continue;
    const doc = JSON.parse(fs.readFileSync(f, "utf8")) as { capitalGains?: { securityKey?: string }[] };
    for (const lot of doc.capitalGains ?? []) { lotCount++; if (lot.securityKey) realisedKeys.add(lot.securityKey); }
  }
  const clash = [...dropped].filter((k) => realisedKeys.has(k));
  ok("no dropped holding has a capital-gain lot against it — so Realised P&L cannot move",
     clash.length === 0, clash.join(", ") || `${realisedKeys.size} securities carry a realised lot, none of them dropped`);
  ok("...and that check can actually fail — the archive does carry realised lots to clash with",
     realisedKeys.size > 0 && lotCount > 0, `${lotCount} lots across ${realisedKeys.size} securities`);
}

// ── 5. THE SIGN IS LOAD-BEARING ─────────────────────────────────────────────
// V.E.C's `CASH Rec/Payable` rows are −₹84,556.96 and −₹1,37,488.47: a naive
// `value < FLOOR` is TRUE of both, so it would drop ₹2.22 L of real liability
// and inflate two mandates by exactly that. `Math.abs` is what stops it, and
// this asserts the book still contains the case that makes it necessary —
// otherwise the guard could be deleted and nothing here would notice.
{
  /**
   * AND THIS BOOK CANNOT EXERCISE THE GUARD, WHICH IS WHY THE CASES BELOW ARE
   * CONSTRUCTED. Found by reintroducing the bug: replacing `Math.abs(value)`
   * with `value` — the exact defect this section exists for — left the whole
   * suite GREEN.
   *
   * The reason is the floor being struck on the SECURITY. Both negative rows
   * are `CASH Rec/Payable` in two V.E.C mandates, and that securityKey is also
   * carried by three POSITIVE rows: the key totals ₹2.07 Cr, so it is nowhere
   * near the floor from either direction. Measured over the whole book there is
   * NO NEGATIVE KEY TOTAL AT ALL, so a real payable can never reach the branch.
   *
   * A gate that cannot fail on the live book is not a reason to drop it — it is
   * a reason to exercise it somewhere it can, which is the treatment the
   * tranche suite already gives its own unreachable coverage gate.
   */
  const negatives = BOOK_POSITIONS.filter((p) => p.marketValue < 0);
  ok("the book still carries negative-value rows — the reason the guard is written at all",
     negatives.length > 0, `${negatives.length} rows, ${rs(sum(negatives.map((p) => p.marketValue)))}`);
  const negKeyTotals = new Map<string, number>();
  for (const p of dedupedPositions(BOOK_POSITIONS)) {
    negKeyTotals.set(p.securityKey, (negKeyTotals.get(p.securityKey) ?? 0) + p.marketValue);
  }
  ok("...but no security in this book is net negative, so the guard is unreachable here and is checked on constructed rows",
     [...negKeyTotals.values()].every((v) => v >= 0),
     `${[...negKeyTotals.values()].filter((v) => v < 0).length} net-negative securities`);

  // THE DISCRIMINATING CASE. A payable of −₹84,556.96 — V.E.C's own figure,
  // taken from the book rather than invented — standing alone as a security.
  // Under `Math.abs` it is kept; under a plain `value < FLOOR` it is dropped and
  // the mandate holding it silently gains that much.
  const payable = [{ ...BOOK_POSITIONS[0], securityKey: "constructed-lone-payable", dedupeGroup: undefined, marketValue: -84556.96 }];
  ok("a security whose whole value is a large NEGATIVE balance is KEPT — a payable is not a speck",
     !negligibleKeys(payable).has("constructed-lone-payable"), "−₹84,556.96 stands");
  // ...and the other half of `Math.abs`: a genuinely tiny payable IS a speck,
  // for the same reason a tiny holding is. Without this the guard could be
  // "fixed" by refusing every negative, which is a different rule.
  const tinyPayable = [{ ...BOOK_POSITIONS[0], securityKey: "constructed-tiny-payable", dedupeGroup: undefined, marketValue: -54 }];
  ok("...while a security whose whole value is −₹54 still goes — the floor is the magnitude, not the sign",
     negligibleKeys(tinyPayable).has("constructed-tiny-payable"), "−₹54 is as irrelevant as +₹54");
}

// ── 6. THE TEST IS THE HOLDING, NEVER THE STATEMENT ROW ─────────────────────
// A name held at ₹900 in five accounts is ₹4,500 the family owns. Per-row the
// floor deletes all five rows and the holding with them; per-security it keeps
// every one. This book has no such case — the smallest row belonging to a
// multi-row security is ₹6,208 — so the two readings agree HERE, which is
// exactly why the difference has to be asserted on constructed input rather
// than waited for.
{
  const dangerous = [...negligibleKeys(book)].filter((k) => {
    const rows = BOOK_POSITIONS.filter((p) => p.securityKey === k);
    return rows.length > 1;
  });
  ok("no security is dropped whose rows the book reports separately — the two readings agree on this book",
     dangerous.length === 0, dangerous.join(", ") || "checked against every multi-row security");

  // The constructed case: one holding, three rows, each under the floor and the
  // holding well over it. Per-row this returns the key; per-security it must not.
  const lots = [0, 1, 2].map((i) => ({
    ...BOOK_POSITIONS[0], securityKey: "constructed-many-small-lots",
    accountId: `acct-${i}`, dedupeGroup: undefined, marketValue: 900,
  }));
  ok("a holding split into lots each under the floor is NOT dropped — the floor is struck on the holding",
     !negligibleKeys(lots).has("constructed-many-small-lots"),
     "3 × ₹900 = ₹2,700, which the family owns");
  // ...and the same shape genuinely under the floor still goes, so the check
  // above is not passing because the function stopped dropping anything.
  const specks = lots.map((l) => ({ ...l, securityKey: "constructed-real-speck", marketValue: 18 }));
  ok("...while a holding that really is under the floor across all its lots still goes",
     negligibleKeys(specks).has("constructed-real-speck"), "3 × ₹18 = ₹54");
}

// ── 7. THE VERDICT DOES NOT DEPEND ON WHO ASKS ──────────────────────────────
// Callers hand this either `portfolio.positions` or the already-deduped
// `consolidated` set. `dedupedPositions` is idempotent, so summing by key over
// either gives one answer — and it must, or a row appears on one page and
// vanishes from the next, which is the one disagreement this seam exists to
// prevent.
{
  const a = [...negligibleKeys(book)].sort();
  const b = [...negligibleKeys(dedupedPositions(BOOK_POSITIONS))].sort();
  ok("the same keys are dropped whether the caller passes every row or the deduped set",
     a.length === b.length && a.every((k, i) => k === b[i]), `${a.length} vs ${b.length}`);
}

// ── 8. THE FLOOR IS THE FAMILY'S NUMBER ─────────────────────────────────────
// A literal, because it is an instruction rather than a measurement — and
// asserted so that moving it is a deliberate edit with a failing test beside
// it, never a silent drift.
ok("the floor is ₹1,000, as asked for", NEGLIGIBLE_VALUE_FLOOR === 1000, `${NEGLIGIBLE_VALUE_FLOOR}`);
// The row the family actually pointed at — "54 rupees क्या होता है?" — must be
// one of the rows that goes. Found by VALUE rather than by name, so the next
// drop picks its own and a renamed scheme does not silently retire the case.
{
  const theRow = negligible.find((p) => Math.round(p.marketValue) === 54);
  ok("the ₹54 holding the family pointed at is one of the rows that goes",
     theRow !== undefined, theRow ? theRow.security : "no ₹54 row among the dropped");
}

// ── 9. CLOSED ROWS STILL GO, AND STILL FOR THEIR OWN REASON ─────────────────
// The floor catches every redeemed row too (they are ₹0), so a careless merge
// of the two rules would leave `closed` empty and the /holdings subtitle would
// describe five redemptions as specks.
ok("the closed set is still populated and every one of it is genuinely redeemed",
   closed.length > 0 && closed.every((p) => isRedeemedToNil(p)), `${closed.length} closed`);

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
