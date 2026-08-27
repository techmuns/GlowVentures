// THE PRIVATE BOOK'S ARITHMETIC, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The Private Market page is the one screen in this app where the whole of the
// book's double count lives: both duplicated holdings — 360 ONE Special
// Opportunities under two CRNs, and Transition Venture Fund I under two family
// trusts — are private. Getting the dedupe backwards is therefore GUARANTEED to
// be wrong here, in one direction or the other, and both directions have shipped
// in this repo before: a raw sum once put ₹1.46 Cr into a consolidated NAV twice,
// and deduping a per-account view once emptied an account holding ₹1.46 Cr to ₹0.
//
// ── THE ANCHOR IS A GENERATED FIGURE, NOT A TYPED-IN ONE ────────────────────
//
// The strongest assertion here is that the deduped private total equals
// `BOOK_SUMMARY.privateValue` TO THE RUPEE. That field is produced by
// `build-book.mjs` from `source/` on a completely separate path from
// `dedupedPositions`, so the two agreeing is a real cross-check rather than a
// figure compared with its own copy. It also cannot go stale: when the next drop
// moves the private book, both sides move together and this still passes, while
// a page that started summing the raw rows fails immediately.
//
// The literal figures below are asserted alongside it because a coverage COUNT
// (15 of 19, 13 of 15) is exactly what a `?? 0` silently changes without moving
// any total — see the traps in `src/lib/privateMarket.ts`. Where a literal would
// go stale on the next drop it is written as a RELATION instead.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_COMMITMENTS, BOOK_SUMMARY } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { sum, sumOrNull } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals,
  unvaluedAccounts, unvaluedDrawn, COST_COVERAGE_MIN,
} from "@/lib/privateMarket";
import type { Commitment, Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};
/** To the rupee, the tolerance every reconciliation in this repo uses. */
const near = (name: string, got: number | null, want: number, tol = 0.01) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};

const accIdx = accountIndex(BOOK_ACCOUNTS);
const scope = privateScope(BOOK_POSITIONS, BOOK_ACCOUNTS);

console.log("\n── the private set ──");
eq("raw private rows", scope.rows.length, 21);
eq("deduped private rows", scope.dedupedRows.length, 19);
eq("accounts in scope", scope.accounts.length, 29);
ok("every private row is AIF, Unlisted or Structured Product",
  scope.rows.every((p) => ["AIF", "Unlisted", "Structured Product"].includes(p.assetClass)));

// THE CROSS-CHECK. Two independent paths to one figure.
const dedupedMV = sum(scope.dedupedRows.map((p) => p.marketValue));
const rawMV = sum(scope.rows.map((p) => p.marketValue));
near("deduped private value === BOOK_SUMMARY.privateValue", dedupedMV, BOOK_SUMMARY.privateValue);
near("raw private value", rawMV, 3555201779.81);
near("double count = raw − deduped", scope.doubleCounted, rawMV - dedupedMV);
near("the double count is ₹3.17 Cr", scope.doubleCounted, 31726374.76);
ok("the double count is the WHOLE book's double count",
  Math.abs(scope.doubleCounted - (sum(BOOK_POSITIONS.map((p) => p.marketValue)) - BOOK_SUMMARY.totalValue)) <= 0.01,
  "both duplicated holdings in this book are private");

console.log("\n── funds ──");
const funds = fundRollup(scope.dedupedRows, accIdx);
eq("distinct funds", funds.length, 14);
near("fund rollup value ties to the deduped total", sum(funds.map((f) => f.mv)), dedupedMV);
const costedFunds = funds.filter((f) => f.cost != null);
near("cost", sumOrNull(funds.map((f) => f.cost)), 2937305263.23);
near("unrealised P&L", sumOrNull(funds.map((f) => f.pnl)), 586071399.82);
eq("rows reporting a cost", scope.dedupedRows.filter((p) => p.costBasis != null).length, 15);
ok("a cost-less row is skipped, never entered as zero",
  scope.dedupedRows.some((p) => p.costBasis == null) && costedFunds.length < funds.length);
// The return is refused wherever the two columns describe different sets.
ok("no fund shows a return unless its costed rows cover the row",
  funds.every((f) => f.returnPct == null || (f.cost != null && f.costedMV >= f.mv * COST_COVERAGE_MIN)));
ok("a fund whose statement reports no cost shows no return",
  funds.filter((f) => f.cost == null).every((f) => f.returnPct == null));

console.log("\n── folios (per-account: NOT deduped) ──");
const folios = folioRows(scope.rows, accIdx);
eq("folio rows", folios.length, 21);
near("folio rows add to the RAW total", sum(folios.map((f) => f.position.marketValue)), rawMV);
const dual = folios.filter((f) => f.alsoCount > 1);
eq("rows reported under more than one account", dual.length, 4);
ok("the duplicate count is struck on the raw set, so it exceeds 1",
  dual.every((f) => f.alsoCount === 2),
  "over the deduped set this could never exceed 1 — the 'Held in 1 entity' defect");
// The two 360 ONE marks are NO LONGER equal: each row must keep its own figure.
const soppy = folios.filter((f) => f.position.securityKey.startsWith("360-one-special-opportunities"));
eq("360 ONE Special Opportunities is reported twice", soppy.length, 2);
ok("its two statements carry DIFFERENT marks, each kept as printed",
  soppy[0].position.marketValue !== soppy[1].position.marketValue,
  `${soppy[0].position.marketValue} vs ${soppy[1].position.marketValue}`);

console.log("\n── owners (per-owner: NOT deduped) ──");
const owners = ownerRollup(scope.rows, accIdx);
eq("owners holding a private position", owners.length, 6);
near("per-owner subtotals add to the RAW total, not the consolidated one",
  sum(owners.map((o) => o.mv)), rawMV);
ok("and therefore NOT to the consolidated total", Math.abs(sum(owners.map((o) => o.mv)) - dedupedMV) > 1,
  "deduping here is what once emptied an account holding ₹1.46 Cr");
ok("both family trusts are owners in their own right",
  owners.filter((o) => /Family Trust/i.test(o.owner)).length === 2,
  "a trust is a separate taxpayer, not a nickname for the man it is named after");

console.log("\n── capital accounts ──");
const ct = commitmentTotals(BOOK_COMMITMENTS);
eq("capital accounts", ct.count, 15);
near("committed", ct.committed, 977285000);
near("drawn", ct.drawn, 817535000);
near("undrawn — AS PRINTED", ct.undrawn, 159750000);
near("distributed", ct.distributed, 4948221);
eq("rows printing an undrawn figure", ct.undrawnOf, 13);
eq("rows printing a distribution", ct.distributedOf, 3);
ok("undrawn covers FEWER rows than the register holds", ct.undrawnOf < ct.count,
  "two folios print a commitment and a drawdown and no undrawn — a 0 would assert the fund has nothing left to call");
ok("undrawn is NOT derived from committed − drawn",
  // It happens to coincide today only because those two folios have committed === drawn.
  // Asserting the coverage COUNT is what catches a derivation, since deriving it
  // would put a figure on all 15.
  ct.undrawnOf === 13);
ok("arithmeticHolds is three-valued, not a boolean",
  BOOK_COMMITMENTS.some((c) => c.arithmeticHolds === null) && BOOK_COMMITMENTS.some((c) => c.arithmeticHolds === true),
  "`!c.arithmeticHolds` would accuse a statement that agrees with itself");

console.log("\n── the accounts nothing values ──");
const unvalued = unvaluedAccounts(BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_COMMITMENTS);
eq("private accounts holding nothing", unvalued.length, 10);
near("drawn against no valuation", unvaluedDrawn(unvalued), 182285000);
eq("of which publish no NAV", unvalued.filter((u) => u.kind === "no-nav").length, 7);
eq("income-only folios", unvalued.filter((u) => u.kind === "income-only").length, 2);
eq("redeemed to nil", unvalued.filter((u) => u.kind === "redeemed").length, 1);
ok("every one carries the book's own reason verbatim", unvalued.every((u) => !!u.reason && u.reason.length > 20));
ok("their drawn capital is in NO total on this page",
  Math.abs(dedupedMV - BOOK_SUMMARY.privateValue) <= 0.01,
  "₹18.23 Cr paid is not, and must never be, inside the ₹352.35 Cr");

console.log("\n── null handling, proven on a fixture ──");
// Real data alone cannot prove a null is SKIPPED rather than coerced: the book
// happens to have no case where `?? 0` and `sumOrNull` differ in the total. A
// fixture can, and this is the failure mode every figure on the page depends on.
const emptyTotals = commitmentTotals([]);
eq("an empty register totals NULL, never 0", [
  emptyTotals.committed, emptyTotals.drawn, emptyTotals.undrawn, emptyTotals.distributed,
], [null, null, null, null]);
const fixture: Commitment[] = [
  { accountId: "a", name: "A", provider: "A", ownerId: null, asOf: null, committed: 100, drawn: 40, undrawn: 60, distributed: null, arithmeticHolds: true },
  { accountId: "b", name: "B", provider: "B", ownerId: null, asOf: null, committed: 200, drawn: 80, undrawn: null, distributed: null, arithmeticHolds: null },
];
const ft = commitmentTotals(fixture);
eq("a null undrawn is skipped, not zeroed", [ft.undrawn, ft.undrawnOf], [60, 1]);
eq("committed still covers both", [ft.committed, ft.committedOf], [300, 2]);
eq("all-null distributed stays null", [ft.distributed, ft.distributedOf], [null, 0]);
// And a cost-less row must not drag a fund's return.
const priced = scope.dedupedRows.find((p) => p.costBasis != null) as Position;
const costless = scope.dedupedRows.find((p) => p.costBasis == null) as Position;
ok("the book carries both a costed and a cost-less private row", !!priced && !!costless);
const mixed = fundRollup(
  [{ ...priced, securityKey: "fx" }, { ...costless, securityKey: "fx", marketValue: priced.marketValue }],
  accIdx,
)[0];
ok("a fund whose cost covers only half its value shows NO return", mixed.returnPct == null,
  "a percentage across two different sets of holdings is the contradiction this refuses");
near("…and its cost is the costed row alone", mixed.cost, priced.costBasis as number);

process.exit(fails ? 1 : 0);
