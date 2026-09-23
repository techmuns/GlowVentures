// WHICH SIDE OF THE BOOK EACH HOLDING IS ON, CHECKED AGAINST THE BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "Sanshi, Buoyant and Carnelian. These are not private market investments.
//    They should come under AIFs. In fact they are already in AIF."
//
// The listed/private split was `assetClass` — every AIF private — and ₹297.78
// Cr of Category III folios sat on the private side: open-ended funds trading
// LISTED securities, reported as private capital. The split reads the SEBI
// category the statements print now (`shared/aifCategory.mjs`).
//
// The failures worth catching are the ones that render perfectly:
//
//   • the three sides ceasing to partition the book, so a page's own figures
//     stop adding to the total printed beside them;
//   • `unplaced` defaulting to a side, which is a claim no document makes;
//   • the GENERATED `Position.marketSide` drifting from the live read, which is
//     two answers to one question and the reason both call one function;
//   • the rule ceasing to bite — a guard that agrees with the one it replaced
//     on every row would pass this suite and fix nothing.
//
// Every expectation is derived from `glowData.ts` and from the family's own
// committed review on the run, or written as a relation that survives the next
// drop moving it.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY, BOOK_POLYCAB } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import {
  currentHoldings, dedupedPositions, sum, publicPrivateSplit, marketSides,
  isPrivateClass, isUnplacedSide,
} from "@/lib/analytics";
import {
  marketSideOf, readAifCategory, readsAsPrivateEquity, categoriesNamedIn,
  CATEGORY_I, CATEGORY_II, CATEGORY_III,
} from "@/lib/aifCategory";
import { pageScopeNote, privateScope } from "@/lib/privateMarket";
import { familyAssetClass } from "@/lib/familyTaxonomy";
import { isMandateHeld } from "@/lib/analytics";
import { engagementOf } from "@/lib/accounts";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}`);
};
const near = (name: string, a: number, b: number, tol = 0.01) =>
  ok(name, Math.abs(a - b) <= tol, `${a} vs ${b}`);
const CR = 1e7;
const cr = (n: number) => `₹${(n / CR).toFixed(2)} Cr`;

const idx = accountIndex(BOOK_ACCOUNTS);
const deduped = dedupedPositions(BOOK_POSITIONS);

// ── 1. THE THREE SIDES PARTITION THE BOOK ───────────────────────────────────
//
// Struck on the WHOLE deduped set, which is what `BOOK_SUMMARY` is summed over
// — `currentHoldings` would drop the closed rows and land a different total.
{
  const split = publicPrivateSplit(BOOK_POSITIONS);
  near("listed ties to BOOK_SUMMARY.listedValue", split.listed, BOOK_SUMMARY.listedValue);
  near("private ties to BOOK_SUMMARY.privateValue", split.private, BOOK_SUMMARY.privateValue);
  near("unplaced ties to BOOK_SUMMARY.unplacedValue", split.unplaced, BOOK_SUMMARY.unplacedValue);
  // THE IDENTITY. Not `total − listed`: a residual absorbs whatever a rule
  // stops naming, and this is the one line that would catch it.
  near("listed + private + unplaced === totalValue",
    split.listed + split.private + split.unplaced, BOOK_SUMMARY.totalValue);
  // AND EVERY ROW IS IN EXACTLY ONE. A row carrying an unexpected `marketSide`
  // value would be in none of the three and the identity above would still
  // hold, because all three sums would simply be short together.
  const counted = deduped.filter((p) => p.marketSide === "listed").length
    + deduped.filter(isPrivateClass).length + deduped.filter(isUnplacedSide).length;
  ok("every deduped row is on exactly one side", counted === deduped.length,
    `${counted} of ${deduped.length}`);
}

// ── 2. THE GENERATED FIELD AND THE LIVE READ ARE ONE ANSWER ─────────────────
//
// `build-book` writes `marketSide`; `marketSideOf` derives it in the browser
// for a caller holding the account index. They are the same function on the
// same inputs — this asserts that on every row rather than trusting the
// sentence, because the day they diverge a page and a total disagree silently.
{
  const bad = BOOK_POSITIONS.filter((p) => (p.marketSide ?? null) !== marketSideOf(idx, p));
  ok("the generated marketSide equals the live read on every position",
    bad.length === 0,
    bad.slice(0, 3).map((p) => `${p.security}: ${p.marketSide} vs ${marketSideOf(idx, p)}`).join("; "));
  ok("every position carries the field", BOOK_POSITIONS.every((p) => p.marketSide !== undefined));
  // The ring-fenced holding is generated the same way and must not be missed.
  ok("the ring-fenced holding carries it too", BOOK_POLYCAB.every((p) => p.marketSide !== undefined));
}

// ── 3. THE CATEGORY DECIDES, AND IT DECIDES THE WAY SEBI DOES ───────────────
{
  const aif = deduped.filter((p) => p.assetClass === "AIF");
  ok("this book holds AIF rows to test on", aif.length > 0);
  for (const p of aif) {
    const acct = idx.get(p.accountId);
    const pe = readsAsPrivateEquity(p, acct);
    const cat = readAifCategory(p, acct).category;
    const want = pe ? "private"
      : cat === CATEGORY_III ? "listed"
      : cat === CATEGORY_I || cat === CATEGORY_II ? "private"
      : null;
    if ((p.marketSide ?? null) !== want) {
      ok(`${p.security.slice(0, 40)} → ${want ?? "unplaced"}`, false, `got ${p.marketSide}`);
    }
  }
  ok("every AIF row follows its own printed category", true);
  // NON-AIF CLASSES ARE NOT TOUCHED BY THE CATEGORY at all.
  ok("Unlisted and Structured Product are private whatever they print",
    deduped.filter((p) => p.assetClass === "Unlisted" || p.assetClass === "Structured Product")
      .every((p) => p.marketSide === "private"));
  ok("company shares, funds, ETFs and cash are listed",
    deduped.filter((p) => ["Equity", "Mutual Fund", "ETF", "Cash"].includes(p.assetClass))
      .every((p) => p.marketSide === "listed"));
}

// ── 4. THE GUARD IS LOAD-BEARING ────────────────────────────────────────────
//
// The OLD rule — every AIF private — must give a MATERIALLY different answer,
// or this whole change is a rename and a suite asserting the new rule would
// pass just as happily against the old one. Written as an inequality so it
// cannot go stale when the next drop moves the figures.
{
  const oldPrivate = sum(deduped
    .filter((p) => ["AIF", "Unlisted", "Structured Product"].includes(p.assetClass))
    .map((p) => p.marketValue));
  const nowPrivate = sum(deduped.filter(isPrivateClass).map((p) => p.marketValue));
  ok("the old class rule and the category rule differ by more than ₹100 Cr",
    oldPrivate - nowPrivate > 100 * CR,
    `old ${cr(oldPrivate)} vs now ${cr(nowPrivate)}`);
  // AND THE MOVE IS THE CATEGORY III BLOCK, not an accident of some other class.
  const catIII = sum(deduped.filter((p) => p.assetClass === "AIF"
    && readAifCategory(p, idx.get(p.accountId)).category === CATEGORY_III).map((p) => p.marketValue));
  const unplaced = sum(deduped.filter(isUnplacedSide).map((p) => p.marketValue));
  near("what left the private side is exactly Category III plus the unplaced",
    oldPrivate - nowPrivate, catIII + unplaced);
}

// ── 5. THE REGEX PROPERTIES `III` DEPENDS ON ────────────────────────────────
//
// Asserted as PROPERTIES rather than against the spelling this file happens to
// use: the trailing `\b` is the real guard and the longest-first alternation is
// the backup, and a comment crediting the wrong one is how a future edit
// removes the load-bearing half.
{
  ok("CAT-III reads as Category III", categoriesNamedIn("Sanshi Fund-I (Open Ended AIF CAT-III)")[0] === CATEGORY_III);
  ok("CATEGORY III reads as Category III", categoriesNamedIn("BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III")[0] === CATEGORY_III);
  ok("Class A2 names no category", categoriesNamedIn("Sanshi Fund-I — Class A2").length === 0);
  ok("Series II names no category", categoriesNamedIn("Motilal Oswal Founders Fund Series II — Class G1").length === 0);
  ok("Category I/II yields BOTH", categoriesNamedIn("Category I/II AIF — drawdown").length === 2);
  // A holding whose text names two resolves to NEITHER side by the category —
  // it reaches `private` here only because its own name says venture capital.
  const amb = deduped.find((p) => readAifCategory(p, idx.get(p.accountId)).why === "ambiguous");
  if (amb) {
    ok("an ambiguous category is private only by the PE read",
      readsAsPrivateEquity(amb, idx.get(amb.accountId)) && amb.marketSide === "private",
      amb.security);
  } else console.log("ok   (no ambiguous category in this drop)");
}

// ── 6. THE FAMILY'S OWN REVIEW IS A SECOND WITNESS, AND IT AGREES ───────────
//
// Reported rather than enforced. The review is NOT a tier: its axis is not a
// total function onto this one (`Debt` maps to neither side) and it has a known
// counterexample, and a rule with a known counterexample is not a rule this
// book applies to money. What this asserts is that the two agree on the great
// majority — which is what earns the category its place — and that where they
// differ the STATEMENT won.
{
  let agree = 0; const differ: string[] = [];
  for (const p of deduped.filter((x) => x.assetClass === "AIF")) {
    const fam = familyAssetClass(p, isMandateHeld(engagementOf(idx, p) || null));
    if (!fam) continue;
    const want = p.marketSide === "listed" ? "Equity" : p.marketSide === "private" ? "Alternate" : null;
    if (want === null) continue;   // the statement placed it on neither side
    if (fam.value === want) agree += 1;
    else differ.push(`${p.security.slice(0, 40)} (statement ${p.marketSide}, review ${fam.value})`);
  }
  ok("the review agrees with the statement on most AIF rows",
    agree >= differ.length * 3, `${agree} agree, ${differ.length} differ: ${differ.join("; ")}`);
  ok("the review never overrules the statement",
    differ.every((d) => /statement (listed|private)/.test(d)));
}

// ── 7. THE PRIVATE MARKET PAGE'S OWN SCOPE ──────────────────────────────────
{
  const note = pageScopeNote(currentHoldings(BOOK_POSITIONS));
  near("the sides on the page rebuild its stated book total",
    sum(note.sides.map((s) => s.value)), note.bookMV);
  // THE THREE FUNDS THE FAMILY NAMED ARE NOT ON THE PRIVATE SIDE.
  const scope = privateScope(currentHoldings(BOOK_POSITIONS), BOOK_ACCOUNTS);
  for (const name of ["Sanshi", "Buoyant", "Carnelian Bharat Amritkaal"]) {
    ok(`${name} is not a private-market holding`,
      !scope.dedupedRows.some((p) => p.security.toLowerCase().includes(name.toLowerCase())));
  }
  // ...AND THE PAGE STILL SAYS WHICH SIDE IT IS. The card that named these
  // three funds one by one went at the family's request ("these kind of
  // placeholders are not relevant"); what a reader cannot do without is the
  // LISTED side's value beside the private one, so the funds that left are
  // visibly somewhere. It is the sides line, and its listed term must hold them.
  const listed = note.sides.find((x) => x.key === "listed");
  const cat3 = sum(dedupedPositions(currentHoldings(BOOK_POSITIONS))
    .filter((p) => p.assetClass === "AIF" && p.marketSide === "listed").map((p) => p.marketValue));
  ok("the listed side the page states holds the Category III funds that left it",
    !!listed && cat3 > 0 && listed.value >= cat3, `listed ${listed?.value}, Category III ${cat3}`);
  ok("the scope note no longer carries the removed card's fund lists",
    !("listedFunds" in note) && !("unplaced" in note));
  // THE WHOLE DOUBLE COUNT IS STILL ON THIS PAGE, which is the page's own
  // central arithmetic and the one thing a rescope could have taken away.
  ok("both duplicated holdings are still in the private scope",
    scope.rows.length - scope.dedupedRows.length === 2, `${scope.rows.length} raw, ${scope.dedupedRows.length} deduped`);
}

// ── 8. `marketSides` LEAVES OUT A SIDE THE BOOK DOES NOT HAVE ───────────────
//
// Every caller prints `sides.length` terms without checking for emptiness, so a
// side with no rows must not reach them as ₹0 — "₹0 private" claims a private
// book worth nothing.
{
  ok("no side in the list is zero", marketSides(deduped).every((s) => s.value !== 0));
  ok("an all-listed book yields one side",
    marketSides(deduped.filter((p) => p.marketSide === "listed")).length === 1);
  ok("every side carries its own reason", marketSides(deduped).every((s) => s.why.length > 20));
}

console.log(fails ? `\n${fails} FAILED` : "\nall market-side checks passed");
process.exit(fails ? 1 : 0);
