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
//
// ── AND THE FAMILY ANSWERED THE DUPLICATE QUESTION ─────────────────────────
//
// *"both are separate investments"* (28 Sep 2026). 360 ONE Special
// Opportunities under both CRNs and Transition Venture Fund I under both trusts
// are each TWO holdings, so nothing on this page is counted once any more: 6 raw
// rows are 6 deduped, and the ₹3.17 Cr the consolidated total used to leave out
// is in it (`SEPARATE_INVESTMENTS`, shared/separateInvestments.mjs). The book
// itself now carries no double count, so every claim below that was struck on
// one — a fund counting more folios than rows, a per-owner total above the
// consolidated one — is struck on a TAGGED COPY of the same four rows instead:
// the policy still stands for the next pair a drop brings, and its arithmetic
// must still be proven rather than left unexercised.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_COMMITMENTS, BOOK_SUMMARY } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import { sum, sumOrNull } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals,
  unvaluedAccounts, unvaluedDrawn, COST_COVERAGE_MIN, capitalScope, distributionOf,
  capitalCountedOnce, incomeOnlyViewOf, INCOME_ONLY_VIEWS,
} from "@/lib/privateMarket";
import type { Commitment, Position } from "@/lib/types";
import { SEPARATE_INVESTMENTS } from "../../../shared/separateInvestments.mjs";
import { withPairsTagged } from "./taggedPairs";

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
// NOTHING IS COUNTED ONCE: both pairs the policy used to tag are separate
// investments on the family's word, so the deduped set is the raw set.
eq("deduped private rows — the same six, nothing counted once", scope.dedupedRows.length, 6);
ok("no private row carries a dedupe group", scope.rows.every((p) => !p.dedupeGroup && !(p.alsoReportedUnder ?? []).length));
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
near("the double count is nil — the family confirmed both pairs separate", scope.doubleCounted, 0);
ok("…and so is the whole book's: every position is in its consolidated total",
  Math.abs(sum(BOOK_POSITIONS.map((p) => p.marketValue)) - BOOK_SUMMARY.totalValue) <= 0.01);
/**
 * THE ANSWER IS LOAD-BEARING, NOT A LABEL. Each pair the family named holds a
 * row under every account named, and counting each pair once would take out
 * exactly the ₹3.17 Cr this page used to leave out — the second statement's
 * value of each. A table whose key had drifted would match no row and this
 * would fail rather than pass over nothing.
 */
{
  const pairs = SEPARATE_INVESTMENTS.map((d) => scope.rows.filter((p) => p.securityKey === d.securityKey));
  ok("each pair the family named is on this page, one row per account named",
    pairs.every((rows, i) => rows.length === SEPARATE_INVESTMENTS[i].accounts.length),
    pairs.map((rows) => rows.length).join(" + "));
  const onceWouldDrop = sum(pairs.map((rows) => sum(rows.map((p) => p.marketValue)) - Math.max(...rows.map((p) => p.marketValue))));
  near("…and counting each once would drop ₹3.17 Cr the page now counts", onceWouldDrop, 14580412.51 + 17145962.25);
}

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
//
// AND THE SECOND STATEMENT OF EACH SEPARATE PAIR IS COST TOO (28 Sep 2026):
// Bharat's 360 ONE units cost ₹98,66,647 and the second trust's Transition
// Venture units ₹75,00,000, and each adds its own gain — value less that cost.
near("cost", sumOrNull(funds.map((f) => f.cost)), 87616647 - 1416280 + 9866647 + 7500000);
near("unrealised P&L", sumOrNull(funds.map((f) => f.pnl)),
  18538189.9 + 1416280 + (14580412.51 - 9866647) + (17145962.25 - 7500000));
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
  // Each separate pair is ONE fund row over TWO folios and TWO counted rows: the
  // count and the value beside it are on one basis now, because nothing is
  // counted once. The inequality this used to assert is proven on a tagged copy
  // of the same rows below (§ "the count-once policy, on a tagged copy").
  const pairFunds = funds.filter((f) => SEPARATE_INVESTMENTS.some((d) => d.securityKey === f.securityKey));
  ok("each separate pair is one fund row over two folios, each counted",
    pairFunds.length === SEPARATE_INVESTMENTS.length
      && pairFunds.every((f) => f.folios === 2 && scope.dedupedRows.filter((p) => p.securityKey === f.securityKey).length === 2),
    pairFunds.map((f) => `${f.securityKey}: ${f.folios}`).join(", "));
}

console.log("\n── folios (per-account: NOT deduped) ──");
const folios = folioRows(scope.rows, accIdx);
eq("folio rows", folios.length, 6);
near("folio rows add to the RAW total", sum(folios.map((f) => f.position.marketValue)), rawMV);
const dual = folios.filter((f) => f.alsoCount > 1);
eq("rows reported under more than one account — none, both pairs are separate", dual.length, 0);
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
// …which on this book IS the consolidated total, nothing being counted once.
// That the two differ where a pair IS tagged — deduping a per-owner view is
// what once emptied an account holding ₹1.46 Cr — is proven on the tagged copy
// below, where it can still happen.
near("…which is the consolidated total too, nothing being counted once", sum(owners.map((o) => o.mv)), dedupedMV);
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

console.log("\n── a capital account counted once with its holding: every branch, on constructed inputs ──");
{
  /**
   * `capitalCountedOnce` has branches this book cannot reach — a group whose
   * KEPT member carries no capital account, an account holding two funds — so
   * each is exercised here on constructed rows rather than left unproven.
   */
  const pos = (accountId: string, securityKey: string, dedupeGroup?: string) =>
    ({ ...BOOK_POSITIONS[0], accountId, securityKey, dedupeGroup }) as Position;
  const com = (accountId: string) => ({ ...BOOK_COMMITMENTS[0], accountId }) as Commitment;
  const ids = (xs: Commitment[]) => xs.map((c) => c.accountId).sort();
  // 1. Both members carry capital: the kept (first) member's counts, the other's is named.
  const a = capitalCountedOnce([com("A"), com("B")], [pos("A", "f", "g"), pos("B", "f", "g")]);
  eq("both members carry capital: the first stands for the group", ids(a.counted), ["A"]);
  eq("…and the second is named with who it is counted as", a.alsoReported.map((x) => [x.commitment.accountId, x.countedAs]), [["B", "A"]]);
  // 2. The kept member carries none: the group's capital is still counted ONCE, never zero times.
  const b = capitalCountedOnce([com("B")], [pos("A", "f", "g"), pos("B", "f", "g")]);
  eq("the kept member carries no capital: the other member's is counted, never dropped", ids(b.counted), ["B"]);
  // 3. An account holding a second fund is not one holding's view — its capital stays counted.
  const c = capitalCountedOnce([com("A"), com("B")], [pos("A", "f", "g"), pos("B", "f", "g"), pos("B", "h")]);
  eq("an account holding two funds keeps its capital counted", ids(c.counted), ["A", "B"]);
  // 4. No duplicate at all: every capital account counts.
  const d = capitalCountedOnce([com("A"), com("B")], [pos("A", "f"), pos("B", "h")]);
  eq("no dedupe group: every capital account counts", ids(d.counted), ["A", "B"]);
  eq("…and none is left out", d.alsoReported.length, 0);
}

console.log("\n── an income-only folio folds only where its units tie ──");
{
  const v = INCOME_ONLY_VIEWS[0];
  const acc = BOOK_ACCOUNTS.find((x) => x.accountId === v.accountId)!;
  const real = BOOK_POSITIONS.filter((p) => p.securityKey === v.securityKey);
  ok("the join finds the valued holding on the book", incomeOnlyViewOf(acc, real, accIdx) != null);
  // One unit off, and the join refuses rather than folding a folio under a holding it does not describe.
  const off = real.map((p) => ({ ...p, quantity: (p.quantity ?? 0) + 1 }));
  eq("a unit count that does not tie folds nothing", incomeOnlyViewOf(acc, off, accIdx), null);
  // Another member's holding of the same fund is not this folio's.
  const other = real.filter((p) => accIdx.get(p.accountId)?.ownerId !== acc.ownerId);
  eq("another member's holding of the fund is never this folio's", incomeOnlyViewOf(acc, other, accIdx), null);
}

console.log("\n── the count-once policy, on a tagged copy ──");
{
  /**
   * THE BOOK NO LONGER CARRIES A DOUBLE COUNT — the family confirmed both pairs
   * separate — so the claims that were struck on one are struck here, on a copy
   * of the same rows tagged exactly as `applyDedupePolicy` tagged them before
   * the answer (`taggedPairs.ts`). The policy is how the next pair a drop
   * brings is carried until the family answers for it, and one line of
   * `shared/separateInvestments.mjs` puts either pair back under it — so its
   * arithmetic is proven, not left unexercised.
   */
  const tagged = withPairsTagged(BOOK_POSITIONS, BOOK_ACCOUNTS);
  ok("the tagged copy reaches two rows of every pair the family named",
    tagged.pairsFound.length === SEPARATE_INVESTMENTS.length && tagged.pairsFound.every((x) => x.rows >= 2),
    tagged.pairsFound.map((x) => `${x.securityKey.slice(0, 24)}: ${x.rows}`).join(", "));
  const t = privateScope(tagged.positions, BOOK_ACCOUNTS);
  eq("raw private rows are the same six", t.rows.length, scope.rows.length);
  eq("…and one row of each pair is left out of the counted set", t.dedupedRows.length, scope.rows.length - SEPARATE_INVESTMENTS.length);
  const counted = sum(t.dedupedRows.map((p) => p.marketValue));
  near("the double count is the second statement of each pair", t.doubleCounted, tagged.secondStatements);
  near("…the ₹3.17 Cr the consolidated total used to leave out", t.doubleCounted, 14580412.51 + 17145962.25);
  const tFunds = fundRollup(t.dedupedRows, accIdx, t.rows);
  near("the fund rollup ties to the COUNTED total, not the raw one", sum(tFunds.map((f) => f.mv)), counted);
  eq("the folio count still adds to the raw rows", sum(tFunds.map((f) => f.folios)), t.rows.length);
  const tagFunds = tFunds.filter((f) => SEPARATE_INVESTMENTS.some((d) => d.securityKey === f.securityKey));
  ok("…so each tagged fund counts MORE folios than counted rows",
    tagFunds.length === SEPARATE_INVESTMENTS.length
      && tagFunds.every((f) => f.folios > t.dedupedRows.filter((p) => p.securityKey === f.securityKey).length),
    tagFunds.map((f) => `${f.securityKey.slice(0, 24)}: ${f.folios}`).join(", "));
  const tFolios = folioRows(t.rows, accIdx);
  eq("folio rows are every statement, never deduped", tFolios.length, t.rows.length);
  eq("…and each tagged row names the other statement", tFolios.filter((f) => f.alsoCount > 1).length, 2 * SEPARATE_INVESTMENTS.length);
  const tOwners = ownerRollup(t.rows, accIdx);
  near("per-owner subtotals add to the RAW total", sum(tOwners.map((o) => o.mv)), sum(t.rows.map((p) => p.marketValue)));
  ok("…which is above the counted one by exactly the double count",
    Math.abs(sum(tOwners.map((o) => o.mv)) - counted - t.doubleCounted) <= 0.01);
  // DEDUPING A PER-OWNER VIEW is what once emptied an account holding ₹1.46 Cr:
  // the member whose statement the consolidated total leaves out still has it
  // on that member's own row, at their own statement's figure.
  const leftOut = tagged.positions.filter((p) => p.dedupeGroup && !t.dedupedRows.includes(p));
  ok("every member whose statement the counted set leaves out keeps it on their own row",
    leftOut.length === SEPARATE_INVESTMENTS.length && leftOut.every((p) => {
      const owner = accIdx.get(p.accountId)?.owner;
      const row = tOwners.find((o) => o.owner === owner);
      return !!row && row.mv >= p.marketValue;
    }), leftOut.map((p) => `${accIdx.get(p.accountId)?.owner}: ${p.marketValue}`).join(", "));
}

process.exit(fails ? 1 : 0);
