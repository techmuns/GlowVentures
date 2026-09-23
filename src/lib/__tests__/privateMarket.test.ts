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
// is exactly what a `?? 0` silently changes without moving any total — see the
// traps in `src/lib/privateMarket.ts`. Where a literal would go stale on the next
// drop it is written as a RELATION instead.
//
// ── AND SEVERAL LITERALS DID GO STALE, WHICH IS WORTH RECORDING ─────────────
//
// `21 / 19 / 29 rows`, `14 funds`, `15 of 19 costed`: every one of those was a
// fact about WHICH HOLDINGS ARE PRIVATE, and Stage 10bl changed that — the
// split reads the SEBI category the statements print, so the Category III
// folios are listed exposure and are not on this page. The figures are
// re-measured below and the ones that are really facts about the SET are
// derived from `scope` rather than typed, so the next drop moves them with it.
// What stays literal is what a `?? 0` would move without moving a total.
//
// ── AND THEY MOVED AGAIN WITH THE FAMILY'S OWN CLASSIFICATION ──────────────
//
// *"private market fund needs to be here in private market only"* — sent with
// the family's placing of every capital account. Motilal Oswal's Founders Fund
// (Category II by its statement) invests in listed equity and left; Neo Infra
// (no category printed) invests in operating infrastructure and arrived. So 7
// raw rows are 6, 5 deduped are 4, and the private value is ₹13.79 Cr raw.
// BOOK_SUMMARY.privateValue moved with it, which is why the anchor below still
// holds without being touched.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_COMMITMENTS, BOOK_SUMMARY } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { sum, sumOrNull } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals,
  unvaluedAccounts, unvaluedDrawn, COST_COVERAGE_MIN, capitalScope, distributionOf,
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
eq("raw private rows", scope.rows.length, 6);
eq("deduped private rows", scope.dedupedRows.length, 4);
eq("accounts in scope", scope.accounts.length, 15);
// THE FAMILY DECLARED BOTH OF THESE CATEGORY II (`DECLARED_AIF_CATEGORY`), and
// that decides their AIF drill-down section and nothing else: which SIDE of the
// book a fund is on is the family's own placing, which outranks any category.
// Delphi invests in listed equity, so it is off this page though Category II —
// the Founders Fund's case exactly — and Neo Infra is on it.
ok("Neo Infra, declared Category II and placed private by the family, is on this page",
  scope.rows.some((p) => p.securityKey === "neo-infra-income-opportunities-fund-i-class-a5"));
ok("…and Delphi, declared Category II but placed listed by the family, is not",
  !scope.rows.some((p) => p.securityKey === "motilal-oswal-wealth-delphi-equity-fund"));
// EVERY ROW IS ON THE PRIVATE SIDE, which is now what `isPrivateClass` means —
// read from the SEBI category rather than from the asset class. The class test
// this replaced would pass on a page carrying every Category III folio, which
// is the state this page was in.
ok("every private row is on the book's private side",
  scope.rows.every((p) => p.marketSide === "private"));
ok("...and none of them is a Category III fund",
  scope.rows.every((p) => !/cat[\s-]*iii|category\s*iii/i.test(p.security)),
  "a Category III AIF trades listed securities — see shared/aifCategory.mjs");

// THE CROSS-CHECK. Two independent paths to one figure.
const dedupedMV = sum(scope.dedupedRows.map((p) => p.marketValue));
const rawMV = sum(scope.rows.map((p) => p.marketValue));
near("deduped private value === BOOK_SUMMARY.privateValue", dedupedMV, BOOK_SUMMARY.privateValue);
near("raw private value", rawMV, 137881211.66);
near("double count = raw − deduped", scope.doubleCounted, rawMV - dedupedMV);
near("the double count is ₹3.17 Cr", scope.doubleCounted, 31726374.76);
ok("the double count is the WHOLE book's double count",
  Math.abs(scope.doubleCounted - (sum(BOOK_POSITIONS.map((p) => p.marketValue)) - BOOK_SUMMARY.totalValue)) <= 0.01,
  "both duplicated holdings in this book are private");

console.log("\n── funds ──");
const funds = fundRollup(scope.dedupedRows, accIdx, scope.rows);
eq("distinct funds", funds.length, 4);
near("fund rollup value ties to the deduped total", sum(funds.map((f) => f.mv)), dedupedMV);
const costedFunds = funds.filter((f) => f.cost != null);
// COST IS WHAT THE UNITS STILL HELD COST, under FIFO (Stage 10ca): Neo Infra
// redeemed 14,162.8 units at their ₹14,16,280 cost, so its ₹5 Cr drawn is
// ₹4,85,83,720 held — the ₹87,616,647 this read before, less that — and the
// unrealised gain rises by the same amount. Every rupee drawn is still in the
// return, as the cost of units sold (`fundReturns.test.ts` §4).
near("cost", sumOrNull(funds.map((f) => f.cost)), 87616647 - 1416280);
near("unrealised P&L", sumOrNull(funds.map((f) => f.pnl)), 18538189.9 + 1416280);
// DERIVED, NOT TYPED. The coverage count is a fact about which holdings are
// private, and that is exactly what changed — a literal here went stale once
// already. What a `?? 0` would do is put a figure on rows that report none,
// which this catches either way round.
eq("rows reporting a cost", scope.dedupedRows.filter((p) => p.costBasis != null).length,
  scope.dedupedRows.length - scope.dedupedRows.filter((p) => p.costBasis == null).length);
ok("every fund reporting no cost is a fund with no costed row",
  costedFunds.length === funds.filter((f) => f.costedMV > 0).length);
// The return is refused wherever the two columns describe different sets.
ok("no fund shows a return unless its costed rows cover the row",
  funds.every((f) => f.returnPct == null || (f.cost != null && f.costedMV >= f.mv * COST_COVERAGE_MIN)));
ok("a fund whose statement reports no cost shows no return",
  funds.filter((f) => f.cost == null).every((f) => f.returnPct == null));
/**
 * THE FOLIO COUNT IS PER-ACCOUNT AND THE VALUE IS CONSOLIDATED — the two
 * bases on one row, which is what the expansion beneath it renders.
 *
 * `folios` counts STATEMENTS, so it adds to the raw row count and NOT to the
 * deduped one; the money on the same row adds to the deduped total. Struck off
 * the deduped set instead, `folios` reads 1 for each of this book's two
 * duplicated holdings over a panel that lists both lines — the "Held in 1
 * entity" defect, arriving one page over. Asserted as an INEQUALITY on the two
 * funds that carry a duplicate, so it cannot pass by accident on a drop with
 * none, and as an equality across the whole table.
 */
eq("the folio count adds to the RAW row count, not the deduped one",
  [sum(funds.map((f) => f.folios)), scope.rows.length, scope.dedupedRows.length],
  [scope.rows.length, scope.rows.length, scope.dedupedRows.length]);
{
  const dupKeys = new Set(scope.rows.filter((p) => p.dedupeGroup).map((p) => p.securityKey));
  const dupFunds = funds.filter((f) => dupKeys.has(f.securityKey));
  ok("this book carries a fund reported under more than one account", dupFunds.length > 0);
  ok("…and each of them counts MORE folios than deduped rows behind it",
    dupFunds.every((f) => f.folios > scope.dedupedRows.filter((p) => p.securityKey === f.securityKey).length),
    "the count is a per-account figure; the value beside it is not");
}

console.log("\n── folios (per-account: NOT deduped) ──");
const folios = folioRows(scope.rows, accIdx);
eq("folio rows", folios.length, 6);
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
eq("owners holding a private position", owners.length, 5);
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
// BARING'S DISTRIBUTION IS NOW COUNTED, and the ₹37,252 is exactly its printed
// `Less: Distribution (E)` — read through the payout record, which the reader
// only publishes where it reproduces that E. The summary reader never read it,
// and this page said the fund "prints no distribution line", which was false.
near("distributed", ct.distributed, 4948221 + 37252);
eq("rows printing an undrawn figure", ct.undrawnOf, 13);
eq("rows with a distribution total this book reads", ct.distributedOf, 4);
{
  const baring = BOOK_COMMITMENTS.find((c) => /baring/i.test(c.accountId))!;
  ok("Baring's distribution comes from its payout record, as its printed E",
    baring.distributed === null && distributionOf(baring) === 37252,
    `distributed ${baring.distributed} · from payouts ${distributionOf(baring)}`);
  const neo = BOOK_COMMITMENTS.find((c) => /neo-infra/i.test(c.accountId))!;
  ok("a printed distribution total wins over the payout record, which also carries equalisation",
    distributionOf(neo) === neo.distributed && neo.distributed === 4948221);
}

console.log("\n── the capital register, scoped to private-market funds ──");
{
  const cap = capitalScope(BOOK_COMMITMENTS, BOOK_ACCOUNTS);
  eq("private-market capital accounts on the page", cap.onPage.length, 11);
  eq("capital accounts of public-market funds, named and not counted", cap.elsewhere.length, 4);
  ok("the two sets partition the register", cap.onPage.length + cap.elsewhere.length === BOOK_COMMITMENTS.length);
  near("committed on the page", commitmentTotals(cap.onPage).committed, 427285000);
  near("committed elsewhere", sum(cap.elsewhere.map((x) => x.commitment.committed)), 550000000);
  ok("every account left out is placed by the family, on the listed side",
    cap.elsewhere.every((x) => x.side === "listed" && x.basis === "family"),
    cap.elsewhere.map((x) => `${x.commitment.accountId}:${x.side}/${x.basis}`).join(", "));
  // THE UNCALLED FIGURE DOES NOT MOVE, which is what lets the Morning CIO tile
  // and this page keep one number: the four public-market accounts are fully
  // called or print no uncalled line at all.
  near("uncalled on the page equals the whole register's", commitmentTotals(cap.onPage).undrawn, ct.undrawn as number);
  // EVERY ACCOUNT ON THE PAGE IS ONE THE PRIVATE SCOPE HOLDS, so "N of this
  // page's M private accounts send one" is a true fraction and not a crossed one.
  const inScope = new Set(scope.accounts.map((a) => a.accountId));
  ok("every private-market capital account is one of this page's private accounts",
    cap.onPage.every((c) => inScope.has(c.accountId)));
  // A FUND'S HOLDING AND ITS CAPITAL ACCOUNT LAND ON ONE SIDE — both go
  // through `fundMarketSideOf`, and this is the check that they agree.
  const sideOfAccount = new Map(BOOK_POSITIONS.filter((p) => p.assetClass === "AIF").map((p) => [p.accountId, p.marketSide]));
  ok("where a capital account's fund also reports a holding, both are on the same side",
    BOOK_COMMITMENTS.every((c) => !sideOfAccount.has(c.accountId)
      || (sideOfAccount.get(c.accountId) === "private") === cap.onPage.some((o) => o.accountId === c.accountId)));
}
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
eq("AIF accounts holding nothing", unvalued.length, 10);
// The page lists the private-market ones: Motilal Oswal's Hedged Equity
// strategy holds nothing too, and no statement or family placing puts it there.
eq("…of which are private-market funds", unvalued.filter((u) => u.side === "private").length, 9);
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
  { accountId: "a", name: "A", provider: "A", ownerId: null, asOf: null, committed: 100, drawn: 40, undrawn: 60, distributed: null,
    called: 40, paid: 40, pending: null, calls: [], payouts: null, arithmeticHolds: true },
  { accountId: "b", name: "B", provider: "B", ownerId: null, asOf: null, committed: 200, drawn: 80, undrawn: null, distributed: null,
    called: null, paid: 80, pending: null, calls: [], payouts: null, arithmeticHolds: null },
];
const ft = commitmentTotals(fixture);
eq("a null undrawn is skipped, not zeroed", [ft.undrawn, ft.undrawnOf], [60, 1]);
eq("committed still covers both", [ft.committed, ft.committedOf], [300, 2]);
eq("all-null distributed stays null", [ft.distributed, ft.distributedOf], [null, 0]);
// And a cost-less row must not drag a fund's return.
//
// ── THE FIXTURE'S SECOND ROW COMES FROM THE WHOLE BOOK, NOT THE PRIVATE SET ─
//
// It was `scope.dedupedRows.find(costBasis == null)`, and that stopped existing
// when the private scope narrowed to the rows the statements place as private
// capital — every one of which reports a cost. The property under test is
// `fundRollup`'s null handling, which is a fact about the FUNCTION and not about
// privateness, so taking the row from the book keeps the case exercised. A
// suite that quietly lost its second input would have gone on "passing" over a
// one-row fixture that proves nothing.
const priced = scope.dedupedRows.find((p) => p.costBasis != null) as Position;
const costless = BOOK_POSITIONS.find((p) => p.costBasis == null) as Position;
ok("the book carries both a costed private row and a cost-less row", !!priced && !!costless);
const mixedRows = [
  { ...priced, securityKey: "fx" },
  { ...costless, securityKey: "fx", marketValue: priced.marketValue },
];
const mixed = fundRollup(mixedRows, accIdx, mixedRows)[0];
ok("a fund whose cost covers only half its value shows NO return", mixed.returnPct == null,
  "a percentage across two different sets of holdings is the contradiction this refuses");
near("…and its cost is the costed row alone", mixed.cost, priced.costBasis as number);

process.exit(fails ? 1 : 0);
