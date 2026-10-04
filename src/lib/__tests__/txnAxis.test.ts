// WHICH SECTION AN ACCOUNT'S OWN CAPITAL RECORD LANDS IN.
//   npm run test:family
//
// `sectionsFor(...).forAccount` files an account's dated capital record under
// the section its HOLDINGS sit in, and names a MIXED account rather than filing
// it under its first key. Buoyant broke the premise that no funded account was
// mixed: each of its folios carries an empty (₹0) cash sleeve beside the fund
// units its deposits bought, so both were "mixed" on every axis and their
// payments were drawn under the heading that says no statement stated what the
// instrument is. A line that holds nothing is set aside where the account holds
// something else — and only there.
//
// Constructed inputs first, because they are the only way to exercise the
// boundaries; then the book, which is the only way to know the premise holds.
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_CAPITAL_MOVES } from "@/data/glowData";
import { sectionsFor, TXN_UNSECTIONED } from "@/lib/txnAxis";
import { groupKeyFor, GROUP_AXES } from "@/lib/groupAxis";
import { accountIndex } from "@/lib/accounts";
import type { Account, Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── constructed ─────────────────────────────────────────────────────────────
// Only what the category axis reads: the account's engagement, and the
// holding's class, key and value. A fund folio's account, not a mandate —
// a mandate is one section whatever it holds.
const acct = (id: string, engagement = "AIF"): Account => ({
  accountId: id, owner: "Test Owner", provider: "Test Fund", accountNo: id, strategy: null,
  engagement, providerEngagement: engagement === "AIF" ? "Category III AIF" : null, asOf: "2026-07-31", members: [],
} as unknown as Account);
const pos = (accountId: string, securityKey: string, assetClass: string, marketValue: number): Position => ({
  accountId, securityKey, security: securityKey, assetClass, marketValue, quantity: marketValue ? 1 : 0,
  costBasis: null, sector: "Unclassified",
} as unknown as Position);

const accounts = [acct("f1"), acct("f2"), acct("f3"), acct("f4"), acct("f5"), acct("f6", "unknown")];
const positions = [
  // f1 — fund units and an EMPTY cash sleeve: Buoyant's shape.
  pos("f1", "some-fund-class-a4", "AIF", 5e8), pos("f1", "cash", "Cash", 0),
  // f2 — genuinely mixed: something in both.
  pos("f2", "some-fund-class-a4", "AIF", 5e8), pos("f2", "cash", "Cash", 1e6),
  // f3 — redeemed to nil: 3P's shape, nothing but ₹0 lines, all one class.
  pos("f3", "other-fund-class-b1", "AIF", 0), pos("f3", "other-fund-class-b2", "AIF", 0),
  // f4 — nothing but ₹0 lines of two classes: still mixed, still named.
  pos("f4", "other-fund-class-b1", "AIF", 0), pos("f4", "cash", "Cash", 0),
  // f5 — holds nothing at all, in an account whose statement calls it an AIF:
  //      India SME's and Sky Capital's shape (Stage 10cd).
  // f6 — holds nothing at all, and nothing says what the account is.
];
const s = sectionsFor(accounts, positions);
const aif = groupKeyFor("category", accountIndex(accounts), positions[0]);
ok("an empty cash sleeve beside the fund units does not make the account mixed",
  s.forAccount("category", "f1") === aif && aif !== TXN_UNSECTIONED, s.forAccount("category", "f1"));
ok("an account with money in two sections is still named mixed",
  s.forAccount("category", "f2") === TXN_UNSECTIONED);
ok("an account redeemed to nil is still filed under what it held",
  s.forAccount("category", "f3") === aif);
ok("…and one holding nothing but empty lines of two classes is still named mixed",
  s.forAccount("category", "f4") === TXN_UNSECTIONED);
ok("an account holding nothing, with nothing saying what it is, is not filed",
  s.forAccount("category", "f6") === TXN_UNSECTIONED);
// Stage 10cd: a drawdown fund's dated CALLS put accounts that hold no valued
// position on the Transactions card. The ACCOUNT's engagement is the
// statement's own wording, so it answers the CATEGORY question — and only that
// one; a basket or a family asset class is the family's review, keyed on a
// product no row here carries.
ok("an account holding nothing, whose statement calls it an AIF, is filed under AIF on the category axis",
  s.forAccount("category", "f5") === aif, s.forAccount("category", "f5"));
ok("…and on no other axis",
  s.forAccount("basket", "f5") === TXN_UNSECTIONED && s.forAccount("assetClass", "f5") === TXN_UNSECTIONED,
  `${s.forAccount("basket", "f5")} / ${s.forAccount("assetClass", "f5")}`);

// ── MT-10: a trade classified through the ONE book security its ISIN names ──
//
// LKP's tape prints its Liquid BeES sale under its own spelling, with no ISIN;
// the book carries those units as `nip-etnf1d-rtliqbees`, which is a CASH
// equivalent. The capital gain lot that settles the sale prints the ISIN, and
// `ledger.ts` lends it to the sale. Constructed first — the only way to reach
// the refusals — with the REAL cash-equivalent key, so the category axis must
// answer Cash exactly as the Holdings table does for the position.
{
  const own = acct("lkp", "Execution");
  const liquid = { ...pos("lkp", "nip-etnf1d-rtliqbees", "Mutual Fund", 17111.17), isin: "INF732E01037" } as Position;
  const other = { ...pos("lkp", "some-other-key", "Equity", 1000), isin: "INF732E01037" } as Position;
  const sale = { provider: own.provider, accountNo: own.accountNo, securityKey: "nippon-india-etf-liquid-bees", assetClass: "Equity", isin: "INF732E01037" };
  const one = sectionsFor([own], [liquid]);
  const holdingSection = groupKeyFor("category", accountIndex([own]), liquid);
  ok("MT-10: a sale whose ISIN names exactly one book security files where that security's holding does",
    one.forTxn("category", sale) === holdingSection && holdingSection === "Cash", `${one.forTxn("category", sale)} vs ${holdingSection}`);
  ok("MT-10: …on every axis",
    GROUP_AXES.every((axis) => one.forTxn(axis, sale) === groupKeyFor(axis, accountIndex([own]), liquid)),
    GROUP_AXES.map((axis) => `${axis}: ${one.forTxn(axis, sale)}`).join(" · "));
  ok("MT-10: with no ISIN it falls back to its own key, as before",
    one.forTxn("category", { ...sale, isin: null }) !== "Cash", one.forTxn("category", { ...sale, isin: null }));
  const two = sectionsFor([own], [liquid, other]);
  ok("MT-10: an ISIN two book keys carry is ambiguous and classifies through neither",
    two.forTxn("category", sale) === one.forTxn("category", { ...sale, isin: null }), two.forTxn("category", sale));
  ok("MT-10: an ISIN no book key carries changes nothing",
    one.forTxn("category", { ...sale, isin: "INE000000000" }) === one.forTxn("category", { ...sale, isin: null }));
}

// ── the book ────────────────────────────────────────────────────────────────
const book = sectionsFor(BOOK_ACCOUNTS, BOOK_POSITIONS);
const idx = accountIndex(BOOK_ACCOUNTS);
const funded = [...new Set(BOOK_CAPITAL_MOVES.map((m) => m.accountId))].sort();
ok("the book has funded accounts to file", funded.length > 0, `${funded.length} account(s)`);
for (const axis of GROUP_AXES) {
  const stray = funded.filter((a) => book.forAccount(axis, a) === TXN_UNSECTIONED);
  ok(`every funded account files under a real section — ${axis}`, stray.length === 0, stray.join(", ") || "all filed");
}

/**
 * LOAD-BEARING WHERE THE BOOK GIVES IT A SUBJECT. A funded account that is
 * mixed only while its empty lines are COUNTED is the case the rule exists for.
 * Buoyant's two folios were that case until the September 2026 delivery: their
 * 31 Aug portfolio snaps supersede the 31 Jul appraisals and print no ₹0 cash
 * sleeve. Measured on this book, no funded account now carries a ₹0 line beside
 * a valued one in another section — 3P and both ASK Absolute Return folios hold
 * nothing BUT ₹0 lines, and Molecule's ₹0 TDS line sits in a mandate, which is
 * one section whatever it holds. So the claim abstains, with that evidence,
 * and the constructed f1 case above still asserts the rule as a hard failure:
 * the abstention never stands alone.
 */
const mixedIfCounted = funded.filter((a) => GROUP_AXES.some((axis) =>
  new Set(BOOK_POSITIONS.filter((p) => p.accountId === a).map((p) => groupKeyFor(axis, idx, p))).size > 1));
const zeroBesideValued = funded.filter((a) => {
  const ps = BOOK_POSITIONS.filter((p) => p.accountId === a);
  return ps.some((p) => p.marketValue === 0) && ps.some((p) => p.marketValue !== 0);
});
if (zeroBesideValued.length === 0) {
  console.log(`NOT CHECKED the rule does work on this book — no funded account carries a ₹0 line beside a valued one (${funded.length} funded account(s) measured); the constructed f1 case holds it`);
  // …and it must still be TRUE that none is mixed, or the measurement above is wrong.
  ok("…and no funded account is mixed while its ₹0 lines are counted", mixedIfCounted.length === 0, mixedIfCounted.join(", ") || "none");
} else {
  ok("the rule does work on this book: an account is mixed only while its ₹0 line is counted",
    mixedIfCounted.length > 0, `${mixedIfCounted.join(", ")} of ${zeroBesideValued.join(", ")}`);
}

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall txnAxis checks passed");
process.exit(fails ? 1 : 0);
