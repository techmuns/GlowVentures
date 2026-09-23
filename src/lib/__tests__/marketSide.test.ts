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
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY, BOOK_POLYCAB, BOOK_COMMITMENTS } from "@/data/glowData";
import { accountIndex } from "@/lib/accounts";
import {
  currentHoldings, dedupedPositions, sum, publicPrivateSplit, marketSides,
  isPrivateClass, isUnplacedSide,
} from "@/lib/analytics";
import {
  marketSideOf, readAifCategory, readsAsPrivateEquity, categoriesNamedIn,
  CATEGORY_I, CATEGORY_II, CATEGORY_III, FAMILY_MARKET_SIDE,
} from "@/lib/aifCategory";
import { privateScope } from "@/lib/privateMarket";
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

// ── 3. THE FAMILY'S PLACING, THEN PRIVATE EQUITY, THEN THE CATEGORY ─────────
//
// The expected side is RE-EXPRESSED here from the committed table and the two
// printed reads, rather than by calling `fundMarketSideOf` — a check that calls
// the helper it is checking agrees with it by construction. The family's table
// is read as DATA: its patterns, its sides, and the haystack the module states
// it reads (the fund's own name, the account's strategy and its provider).
const familyHay = (p: { security: string }, acct: { strategy?: string | null; provider?: string | null } | undefined) =>
  [p.security, acct?.strategy, acct?.provider].filter(Boolean).join(" · ");
const familyEntries = (p: { security: string }, acct: { strategy?: string | null; provider?: string | null } | undefined) =>
  FAMILY_MARKET_SIDE.filter((d) => d.match.test(familyHay(p, acct)));
{
  const aif = deduped.filter((p) => p.assetClass === "AIF");
  ok("this book holds AIF rows to test on", aif.length > 0);
  let wrong = 0;
  for (const p of aif) {
    const acct = idx.get(p.accountId);
    const fam = familyEntries(p, acct);
    const pe = readsAsPrivateEquity(p, acct);
    const cat = readAifCategory(p, acct).category;
    const want = fam.length ? fam[0].side
      : pe ? "private"
      : cat === CATEGORY_III ? "listed"
      : cat === CATEGORY_I || cat === CATEGORY_II ? "private"
      : null;
    if ((p.marketSide ?? null) !== want) {
      wrong += 1;
      ok(`${p.security.slice(0, 40)} → ${want ?? "unplaced"}`, false, `got ${p.marketSide}`);
    }
  }
  ok("every AIF row follows the family's placing, then its own paperwork", wrong === 0, `${wrong} differ`);
  // NON-AIF CLASSES ARE NOT TOUCHED BY THE CATEGORY at all.
  ok("Unlisted and Structured Product are private whatever they print",
    deduped.filter((p) => p.assetClass === "Unlisted" || p.assetClass === "Structured Product")
      .every((p) => p.marketSide === "private"));
  ok("company shares, funds, ETFs and cash are listed",
    deduped.filter((p) => ["Equity", "Mutual Fund", "ETF", "Cash"].includes(p.assetClass))
      .every((p) => p.marketSide === "listed"));
}

// ── 3b. THE FAMILY'S OWN PLACING, FUND BY FUND ──────────────────────────────
//
//   "private market fund needs to be here in private market only" — and the
//   family said which funds those are, by what each invests in.
//
// Asserted against the BOOK and the ACCOUNT REGISTRY, because the placing has
// to reach a capital account with no valued position (India SME and Sky
// Capital publish no NAV) exactly as it reaches a holding.
{
  // NO TWO ENTRIES MAY MATCH ONE FUND. First-match-wins would otherwise decide
  // a fund's side by the ORDER of a table, which is the index-cycled
  // classification failure in miniature.
  const hays = [
    ...deduped.filter((p) => p.assetClass === "AIF").map((p) => familyHay(p, idx.get(p.accountId))),
    ...BOOK_ACCOUNTS.map((a) => familyHay({ security: a.strategy ?? "" }, a)),
  ];
  const doubles = hays.filter((h) => FAMILY_MARKET_SIDE.filter((d) => d.match.test(h)).length > 1);
  ok("no fund in the book is matched by two of the family's entries", doubles.length === 0, doubles.slice(0, 2).join(" | "));
  // EVERY ENTRY REACHES SOMETHING IN THE BOOK — a placing that matches nothing
  // is a sentence about a fund this book does not hold, and would go on
  // "classifying" silently after a rename broke its pattern.
  const dead = FAMILY_MARKET_SIDE.filter((d) => !hays.some((h) => d.match.test(h)));
  ok("every entry in the family's table matches a fund this book carries", dead.length === 0,
    dead.map((d) => d.fund).join(", "));
  // THE CASE THE CATEGORY GOT WRONG, BY THE FAMILY'S OWN ACCOUNT: Founders Fund
  // prints Category II and invests in listed equities. The family won, and the
  // statement's category is still read (and still printed) underneath.
  const founders = deduped.filter((p) => /motilal oswal founders fund/i.test(p.security));
  ok("this book holds the Founders Fund", founders.length > 0);
  ok("the Founders Fund is listed although it prints Category II",
    founders.every((p) => p.marketSide === "listed"
      && readAifCategory(p, idx.get(p.accountId)).category === CATEGORY_II),
    founders.map((p) => `${p.marketSide}/${readAifCategory(p, idx.get(p.accountId)).category}`).join(", "));
  // THE TWO THE STATEMENTS NEVER PLACED.
  for (const [re, side] of [[/delphi equity fund/i, "listed"], [/neo infra income opportunities/i, "private"]] as const) {
    const rows = deduped.filter((p) => re.test(p.security));
    ok(`${re.source} is on the ${side} side`, rows.length > 0 && rows.every((p) => p.marketSide === side),
      rows.map((p) => `${p.security.slice(0, 30)}=${p.marketSide}`).join(", "));
    ok(`${re.source} prints no category of its own — the family placed it`,
      rows.every((p) => readAifCategory(p, idx.get(p.accountId)).category === null));
  }
  // THE FIFTEEN CAPITAL ACCOUNTS SPLIT THE WAY THE FAMILY SAID: eleven private
  // (India SME ×3, Baring, Transition ×2, Neo Infra, Sky Capital ×4), four
  // public (Carnelian Bharat Amritkaal, Delphi, Founders Fund ×2) — ₹42.7 Cr
  // committed against ₹55.0 Cr. Struck on `BOOK_COMMITMENTS`, which is the set
  // the family counted, and on each commitment's OWN name and account.
  const byC = BOOK_COMMITMENTS.map((c) => {
    const a = idx.get(c.accountId);
    const e = familyEntries({ security: c.name }, a);
    return { c, side: e.length ? e[0].side : null };
  });
  const priv = byC.filter((x) => x.side === "private");
  const pub = byC.filter((x) => x.side === "listed");
  ok("the book carries fifteen capital accounts", BOOK_COMMITMENTS.length === 15, String(BOOK_COMMITMENTS.length));
  ok("every capital account is placed by the family's own table", byC.every((x) => x.side !== null),
    byC.filter((x) => x.side === null).map((x) => x.c.name).join(", "));
  ok("the family's private-market capital accounts are the eleven they named", priv.length === 11,
    `${priv.length}: ${priv.map((x) => x.c.name.slice(0, 24)).join(", ")}`);
  ok("the family's public-market drawdown funds are the four they named", pub.length === 4,
    `${pub.length}: ${pub.map((x) => x.c.name.slice(0, 24)).join(", ")}`);
  near("private-market commitments are ₹42.73 Cr (the family's ₹42.7 Cr)",
    sum(priv.map((x) => x.c.committed)) / CR, 42.7285, 0.0001);
  near("public-market commitments are ₹55.00 Cr (the family's ₹55.0 Cr)",
    sum(pub.map((x) => x.c.committed)) / CR, 55, 0.0001);
  // AND THE CAPITAL ACCOUNT AND THE HOLDING LAND ON ONE SIDE. A fund whose
  // capital account sat on the private page while its holding sat on the listed
  // side would be the same fund on both halves of the book.
  // Struck as a COUNT, with a floor on how many pairs were compared: a summary
  // line that printed `true` would pass on a book where no capital account's
  // fund reports a holding at all, which is a check that cannot fail.
  let compared = 0;
  const disagree: string[] = [];
  for (const x of byC) {
    const held = deduped.filter((p) => p.accountId === x.c.accountId && p.assetClass === "AIF");
    compared += held.length;
    for (const p of held) {
      if (p.marketSide !== x.side) disagree.push(`${x.c.name.slice(0, 30)}: ${p.security.slice(0, 30)}=${p.marketSide} vs ${x.side}`);
    }
  }
  ok("every capital account's own holdings sit on the capital account's side",
    compared > 0 && disagree.length === 0, `${compared} compared · ${disagree.join("; ")}`);
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
  ok("the old class rule and today's rule differ by more than ₹100 Cr",
    oldPrivate - nowPrivate > 100 * CR,
    `old ${cr(oldPrivate)} vs now ${cr(nowPrivate)}`);
  // AND WHAT MOVED IS NAMED, NOT MERELY SIZED. Everything that left the private
  // side is an AIF the family or the category put on the LISTED side, or an
  // AIF nothing places — so the move reconstructs from those two sets exactly,
  // and a guard that moved the right AMOUNT of the wrong funds fails here.
  const aifListed = sum(deduped.filter((p) => p.assetClass === "AIF" && p.marketSide === "listed").map((p) => p.marketValue));
  const unplaced = sum(deduped.filter(isUnplacedSide).map((p) => p.marketValue));
  near("what left the private side is exactly the AIFs placed listed plus the unplaced",
    oldPrivate - nowPrivate, aifListed + unplaced);
  // THE CATEGORY III BLOCK IS INSIDE IT, and so is what the family moved. Both
  // halves asserted, so neither rule can be dropped without this firing.
  const catIII = sum(deduped.filter((p) => p.assetClass === "AIF"
    && readAifCategory(p, idx.get(p.accountId)).category === CATEGORY_III).map((p) => p.marketValue));
  const familyListedOnly = sum(deduped.filter((p) => p.assetClass === "AIF"
    && p.marketSide === "listed"
    && readAifCategory(p, idx.get(p.accountId)).category !== CATEGORY_III).map((p) => p.marketValue));
  ok("the Category III block is on the listed side", catIII > 0 && catIII <= aifListed + 0.01, `${cr(catIII)} of ${cr(aifListed)}`);
  ok("the family moved listed-equity AIFs the category did not", familyListedOnly > 0, cr(familyListedOnly));
  near("the listed AIFs are exactly Category III plus the family's own placings",
    aifListed, catIII + familyListedOnly);
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
// total function onto this one (`Debt` maps to neither side). What this asserts
// is that the two agree on the great majority — and that where they differ the
// book's side has a basis of its OWN (the family's placing, or the category the
// statement prints), never the review's answer taken over.
//
// The family's placing closed the one disagreement this section used to report:
// Motilal Oswal's Founders Fund, Category II by its statement and Equity by the
// review, is listed now because the family said it invests in listed equities.
{
  let agree = 0; const differ: { p: typeof deduped[number]; line: string }[] = [];
  for (const p of deduped.filter((x) => x.assetClass === "AIF")) {
    const fam = familyAssetClass(p, isMandateHeld(engagementOf(idx, p) || null));
    if (!fam) continue;
    const want = p.marketSide === "listed" ? "Equity" : p.marketSide === "private" ? "Alternate" : null;
    if (want === null) continue;   // nothing placed it on either side
    if (fam.value === want) agree += 1;
    else differ.push({ p, line: `${p.security.slice(0, 40)} (book ${p.marketSide}, review ${fam.value})` });
  }
  ok("the review agrees with the book's side on most AIF rows",
    agree >= differ.length * 3, `${agree} agree, ${differ.length} differ: ${differ.map((d) => d.line).join("; ")}`);
  ok("where the review differs, the book's side comes from the family's table or the statement's category",
    differ.every(({ p }) => {
      const acct = idx.get(p.accountId);
      return familyEntries(p, acct).length > 0 || readsAsPrivateEquity(p, acct) || readAifCategory(p, acct).category !== null;
    }), differ.map((d) => d.line).join("; "));
}

// ── 7. THE PRIVATE MARKET PAGE'S OWN SCOPE ──────────────────────────────────
//
// The line that stated the book's sides under the fund table went at the
// family's request ("Why do i need all this garbage written"), and
// `pageScopeNote` with it. What stays true, and is what a reader relies on, is
// WHICH funds the page carries — so that is what is asserted.
{
  const scope = privateScope(currentHoldings(BOOK_POSITIONS), BOOK_ACCOUNTS);
  // THE THREE FUNDS THE FAMILY NAMED ARE NOT ON THE PRIVATE SIDE.
  for (const name of ["Sanshi", "Buoyant", "Carnelian Bharat Amritkaal"]) {
    ok(`${name} is not a private-market holding`,
      !scope.dedupedRows.some((p) => p.security.toLowerCase().includes(name.toLowerCase())));
  }
  // ...AND THE LISTED SIDE STILL HOLDS THEM. Every AIF on the listed side — the
  // Category III folios, and since the family's own placing, Founders and
  // Delphi too — is in `marketSides`' listed term, so the funds that left this
  // page are visibly somewhere in the split Morning CIO prints.
  const current = dedupedPositions(currentHoldings(BOOK_POSITIONS));
  const listed = marketSides(current).find((x) => x.key === "listed");
  const listedAifs = sum(current
    .filter((p) => p.assetClass === "AIF" && p.marketSide === "listed").map((p) => p.marketValue));
  ok("the book's listed side holds the listed-side AIFs that left this page",
    !!listed && listedAifs > 0 && listed.value >= listedAifs, `listed ${listed?.value}, listed AIFs ${listedAifs}`);
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
