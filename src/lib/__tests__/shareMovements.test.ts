/**
 * OPENING, PLUS, MINUS, CLOSING — the identity, and the terms that must never
 * be folded into it.
 *
 * Anchored on the GENERATED book rather than on a fixture: a hand-written pair
 * would prove only that two inventions agree with each other, and the whole
 * claim here is that the demat statements' own arithmetic reproduces itself.
 */
import { BOOK_SHARE_MOVEMENTS, BOOK_POSITIONS, BOOK_ACCOUNTS } from "@/data/glowData";
import type { ShareMovement } from "@/lib/types";
import { movementIdentityHolds, movementNet } from "@/lib/shareMovements";
import { securityKeyOf } from "@/lib/securityKey";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`ok   ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? " — " + detail : ""}`); }
};

const all = Object.values(BOOK_SHARE_MOVEMENTS) as ShareMovement[];
const split = all.filter((m) => m.unitsIn != null);

console.log("\n── share movements ──\n");

// ── 1. There is something to check ────────────────────────────────────────────
// `golden.mjs`'s rule: a suite that passes over no input claims a confidence
// nobody earned. If the demat reader ever stops reading, this fails first.
ok("the book carries share movements at all", all.length > 0, `${all.length} holding-window(s)`);
ok("...and essentially all of them carry an opening-to-closing split",
  split.length > 0 && split.length === all.length, `${split.length} of ${all.length}`);

// ── 2. THE IDENTITY, which is the whole licence for publishing the table ──────
// opening + unitsIn - unitsOut + corporateAction = closing, to the 3 decimals
// the statements print units at. A block that does not walk is refused by the
// reader, so every entry carrying a split must satisfy it.
const offenders = split.filter((m) => !movementIdentityHolds(m));
ok("every split walks its own printed opening balance to its own printed closing",
  offenders.length === 0,
  offenders.length ? offenders.slice(0, 3).map((m) => `${m.security}: ${m.opening}+${m.unitsIn}-${m.unitsOut}+${m.corporateAction} ≠ ${m.closing}`).join(" · ")
    : `${split.length} of ${split.length}`);

// ── 3. AND THE IDENTITY IS LOAD-BEARING RATHER THAN TRIVIAL ───────────────────
// If every movement term were zero the identity would hold by doing nothing.
// These windows must actually contain movement, or the check proves nothing.
const moved = split.filter((m) => (m.unitsIn ?? 0) + (m.unitsOut ?? 0) + Math.abs(m.corporateAction ?? 0) > 0);
ok("...and the windows really do contain movement, so the identity is not trivial",
  moved.length >= 20, `${moved.length} of ${split.length} moved units`);
const changed = split.filter((m) => (m.opening ?? 0) !== (m.closing ?? 0));
ok("...including windows whose opening and closing differ", changed.length >= 10, `${changed.length}`);

// ── 4. A TERM IS NULL OR IT IS MEASURED — never a zero standing in ────────────
// A zero here reads as "nothing moved in that window", which is a measurement.
// A refused block must carry nulls and a reason instead.
const halfNull = all.filter((m) => {
  const terms = [m.unitsIn, m.unitsOut, m.corporateAction];
  return terms.some((t) => t == null) && terms.some((t) => t != null);
});
ok("no entry carries some movement terms and not others", halfNull.length === 0);
const refusedNoReason = all.filter((m) => m.unitsIn == null && !m.reason);
ok("a refused block names why rather than showing a bare absence", refusedNoReason.length === 0);

// ── 5. ENCUMBRANCE IS COUNTED AND NEVER SUMMED ───────────────────────────────
// A pledge moves units between free and pledged without any leaving the
// account. Folded into unitsIn it would report the holding at twice its size,
// so it is a COUNT and the identity above must hold WITHOUT it.
const withPledges = split.filter((m) => (m.encumbranceMoves ?? 0) > 0);
ok("this book exercises the encumbrance case", withPledges.length > 0, `${withPledges.length} window(s) carry a pledge or unpledge`);
ok("...and those windows still satisfy the identity without counting them",
  withPledges.every(movementIdentityHolds));
// The load-bearing half: counting them would BREAK the identity, which is what
// says the exclusion is doing work rather than describing a set that is empty.
const wouldBreak = withPledges.filter((m) =>
  Math.abs(((m.opening ?? 0) + (m.unitsIn ?? 0) + (m.encumbranceMoves ?? 0) - (m.unitsOut ?? 0) + (m.corporateAction ?? 0)) - (m.closing ?? 0)) > 5e-4);
ok("...and counting a pledge as a movement would break it", wouldBreak.length > 0,
  `${wouldBreak.length} window(s) would stop reconciling`);

// ── 6. A CORPORATE ACTION IS ITS OWN TERM ────────────────────────────────────
// Folded into unitsIn it would report the family as having bought units nobody
// ordered — a dividend reinvested, an AIF redeemed.
const withCa = split.filter((m) => (m.corporateAction ?? 0) !== 0);
ok("this book exercises the corporate-action term", withCa.length > 0, `${withCa.length} window(s)`);
ok("...in both directions", withCa.some((m) => (m.corporateAction ?? 0) > 0) && withCa.some((m) => (m.corporateAction ?? 0) < 0));

// ── 7. THE WINDOW IS STATED, because an opening balance is a claim about a date
const dated = all.filter((m) => m.periodFrom && m.periodTo);
ok("every window names the period its two balances bound", dated.length === all.length, `${dated.length} of ${all.length}`);
const fyStart = all.filter((m) => m.periodFrom?.endsWith("-04-01"));
ok("...and these run the Indian financial year, not the calendar year",
  fyStart.length === all.length, `all start ${all[0]?.periodFrom}`);

// ── 8. THE JOIN REACHES REAL HOLDINGS, and the rest are named ────────────────
const held = new Set(BOOK_POSITIONS.map((p) => `${p.accountId}|${p.securityKey}`));
const joined = all.filter((m) => held.has(`${m.accountId}|${m.securityKey}`));
ok("the movements join positions this book actually carries", joined.length > 0, `${joined.length} of ${all.length}`);
ok("...and the rest are securities the account no longer holds, which is the point",
  all.length - joined.length > 0, `${all.length - joined.length} window(s) closed during the year`);
const knownAcct = new Set(BOOK_ACCOUNTS.map((a) => a.accountId));
ok("every movement names an account in the registry",
  all.every((m) => knownAcct.has(m.accountId)));

// ── 9. NET IS DERIVED FROM THE TERMS, never from the two balances ────────────
// The net a reader can check by adding the printed columns must equal the one
// the two printed balances imply — two paths to one figure.
const netOff = split.filter((m) => Math.abs(movementNet(m)! - ((m.closing ?? 0) - (m.opening ?? 0))) > 5e-4);
ok("the movement columns' own net equals the two balances' difference", netOff.length === 0);

// ── 10. A HELD COMPANY'S WINDOW IS KEYED ON THE COMPANY ──────────────────────
//
//   "Kaynes Technologies Limited is also a holding… of the family entity Ajay's
//    account."
//
// Ajay's demat carried Kaynes from 16,300 shares to nil inside the window, and
// its transaction statement spells the company its own way — so the window was
// keyed on that spelling, sat under a key no position carries, and reached no
// page: the one record in the archive saying Ajay held Kaynes this year was on
// an orphan key. `build-book` now keys a window on the BOOK's company wherever
// the window's ISIN is carried by exactly one company this book holds.
//
// Re-derived here from `BOOK_POSITIONS`, never read from the builder's notes: a
// check that reads the builder's own count agrees with it by construction.
const keysByIsin = new Map<string, Set<string>>();
const fundIsins = new Set<string>();
for (const p of BOOK_POSITIONS) {
  const i = (p.isin ?? "").trim().toUpperCase();
  if (!i) continue;
  if (p.assetClass === "AIF") { fundIsins.add(i); continue; }
  (keysByIsin.get(i) ?? keysByIsin.set(i, new Set()).get(i)!).add(p.securityKey);
}
const bridgeable = all.filter((m) => {
  const i = (m.isin ?? "").trim().toUpperCase();
  return !!i && !fundIsins.has(i) && keysByIsin.get(i)?.size === 1;
});
const strayed = bridgeable.filter((m) => !keysByIsin.get((m.isin ?? "").toUpperCase())!.has(m.securityKey));
ok("every window whose ISIN names one company this book holds is keyed on that company",
  strayed.length === 0,
  strayed.length ? strayed.slice(0, 3).map((m) => `${m.accountId} ${m.security} on ${m.securityKey}`).join(" · ")
    : `${bridgeable.length} window(s)`);
// LOAD-BEARING: some of those windows spell the company differently from the
// book, so keying on the window's own spelling would have left them orphaned.
// Zero here would mean the rule above is satisfied by a book with nothing to
// bridge — which is exactly what it looked like before it was written.
const respelled = bridgeable.filter((m) => m.security && securityKeyOf(m.security) !== m.securityKey);
ok("...and some of them reach the company only because of the ISIN", respelled.length > 0,
  `${respelled.length}, e.g. ${respelled.slice(0, 2).map((m) => `${m.security} → ${m.securityKey}`).join(", ")}`);
// AND THE CASE THAT WAS ASKED ABOUT: a window in an account that no longer
// holds the company, keyed on the company another account still holds. That is
// what the Monitor's expansion and the stock page draw as "sold out in this
// window" — without it they have nothing to draw and Ajay's Kaynes vanishes.
const bookKeysAll = new Set(BOOK_POSITIONS.map((p) => p.securityKey));
const elsewhere = all.filter((m) => !held.has(`${m.accountId}|${m.securityKey}`) && bookKeysAll.has(m.securityKey));
ok("some windows record a company this account no longer holds and another account still does",
  elsewhere.length > 0,
  `${elsewhere.length}, e.g. ${elsewhere.slice(0, 2).map((m) => `${m.securityKey} in ${m.accountId.slice(-16)} (${m.opening} → ${m.closing})`).join(", ")}`);
// A DEPOSITORY'S COPY OF AIF UNITS IS NOT THE FUND'S RECORD. The fund reports
// its own units; a window on the depository's copy keyed onto the fund's key
// would stand beside the fund's statement as a second account of the same units.
const fundCopies = all.filter((m) => fundIsins.has((m.isin ?? "").trim().toUpperCase()));
const fundKeys = new Set(BOOK_POSITIONS.filter((p) => p.assetClass === "AIF").map((p) => p.securityKey));
ok("a depository's copy of AIF units is never keyed onto the fund",
  fundCopies.every((m) => !fundKeys.has(m.securityKey)), `${fundCopies.length} window(s) left on their own key`);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
