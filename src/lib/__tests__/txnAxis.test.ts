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
 * LOAD-BEARING. Some funded account must be mixed when its empty lines are
 * COUNTED — or the rule above is exercised by nothing in this book, and every
 * check here would pass on a book where it did no work.
 */
const mixedIfCounted = funded.filter((a) => GROUP_AXES.some((axis) =>
  new Set(BOOK_POSITIONS.filter((p) => p.accountId === a).map((p) => groupKeyFor(axis, idx, p))).size > 1));
ok("the rule does work on this book: an account is mixed only while its ₹0 line is counted",
  mixedIfCounted.length > 0, mixedIfCounted.join(", "));

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall txnAxis checks passed");
process.exit(fails ? 1 : 0);
