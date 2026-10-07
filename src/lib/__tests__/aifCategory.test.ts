// THE AIF CATEGORY READ, CHECKED AGAINST THE BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "when you're drilling down in the AIF … make it cat one, cat two, cat three
//    … club कर दो कि these are cat two AIFs, these are cat three AIFs, this is
//    cat one AIF"   and   "create another private equity fund line item".
//
// A SECTION HEADING LOOKS EXACTLY AS AUTHORITATIVE WHICHEVER ROWS SIT UNDER IT.
// That is the whole risk here: a page that filed every AIF under a plausible
// category would render perfectly, reconcile perfectly, and be a fabricated
// classification — `VAL_METHODS[i % 5]` arriving through a heading. So the
// category is READ from what the statements print, and the failures worth
// catching are all failures of reading:
//
//   • `III` read as `I`, which files every Category III fund under Category I;
//   • `Class A2` or `Series II` read as a category, which invents one;
//   • `Category I/II` resolved to one of the two, which is this book choosing
//     what the issuer declined to;
//   • the two printed fields disagreeing and one silently winning;
//   • Private Equity swallowing a category rather than sitting beside it, or
//     the sections failing to partition so a fund is counted twice.
//
// Every expectation is derived from `glowData.ts` on the run, or written as a
// relation that survives the next drop moving it.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_REVIEW_SUPERSEDED } from "@/data/glowData";
import type { Account } from "@/lib/types";
import { accountIndex } from "@/lib/accounts";
import { currentHoldings, dedupedPositions, sum } from "@/lib/analytics";
import {
  categoriesNamedIn, readAifCategory, aifCategoryOf, aifSectionOf, aifCategoryWhy,
  readsAsPrivateEquity, isAifHolding, unvaluedAifFolios,
  AIF_SECTION_ORDER, aifSectionOrd, PRIVATE_EQUITY_SECTION, AIF_UNSTATED_SECTION,
  CATEGORY_I, CATEGORY_II, CATEGORY_III, DECLARED_AIF_CATEGORY, declaredAifCategory,
  familyMarketDecision,
} from "@/lib/aifCategory";
import { readFileSync } from "node:fs";

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
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

// ── THE READER, AGAINST STRINGS THIS BOOK ACTUALLY PRINTS ───────────────────
console.log("\n── what a printed phrase names ──");
eq("CAT-III inside a fund name", categoriesNamedIn("Sanshi Fund-I (Open Ended AIF CAT-III) — Class E"), [CATEGORY_III]);
eq("CATEGORY III in caps", categoriesNamedIn("BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4"), [CATEGORY_III]);
eq("a parenthesised category", categoriesNamedIn("360 ONE SPECIAL OPPORTUNITIES FUND (AIF CATEGORY II)"), [CATEGORY_II]);
eq("a Category I angel fund", categoriesNamedIn("Category I Alternative Investment Fund – Angel Fund"), [CATEGORY_I]);
eq("an arabic numeral", categoriesNamedIn("Category 3 AIF"), [CATEGORY_III]);
eq("an en-dash separator", categoriesNamedIn("Category II AIF — drawdown private equity fund"), [CATEGORY_II]);

// `III` MUST NEVER BE READ AS `I` — it would file ₹297.78 Cr, 84% of this
// book's AIF row, under the wrong heading, silently.
ok("III is never read as I", !categoriesNamedIn("CAT-III").includes(CATEGORY_I));
ok("II is never read as I", !categoriesNamedIn("Category II").includes(CATEGORY_I));
ok("III is never read as II", !categoriesNamedIn("CAT-III").includes(CATEGORY_II));

// ── AND WHAT ACTUALLY GUARDS IT IS THE TRAILING `\b`, NOT THE ORDERING ─────
//
// Reintroducing the reordered alternation produced a CLEAN sweep and a clean
// suite, which is how this was found: the boundary alone is enough, because
// matching `I` out of `III` leaves `II` after it and `\b` between two word
// characters fails, so the engine backtracks. The ordering is the backup.
//
// Both variants are asserted directly, so the claim is about the PROPERTY the
// pattern must have rather than about the spelling this file happens to use —
// and a future edit that loosens the boundary fails here rather than silently
// depending on an ordering nobody knew was load-bearing.
{
  const build = (alt: string, boundary: boolean) => new RegExp(
    String.raw`\b(?:categor(?:y|ies)|cat)[\s\u2010-\u2015-]*((?:${alt})(?:\s*\/\s*(?:${alt}))*)` + (boundary ? String.raw`\b` : ""),
    "gi");
  const first = (re: RegExp, t: string) => [...t.matchAll(re)].map((m) => m[1])[0] ?? null;
  eq("longest-first alternation, with the boundary", first(build("III|II|I|[123]", true), "CAT-III"), "III");
  eq("shortest-first alternation, with the boundary", first(build("I|II|III|[123]", true), "CAT-III"), "III");
  eq("longest-first alternation, without it", first(build("III|II|I|[123]", false), "CAT-III"), "III");
  // THE ONE COMBINATION THAT BREAKS, named so the guard is provably needed
  // rather than merely present.
  eq("shortest-first AND no boundary is the failure", first(build("I|II|III|[123]", false), "CAT-III"), "I");
}

// ── AND THE FALSE POSITIVES THAT WOULD INVENT ONE ───────────────────────────
console.log("\n── what must name nothing ──");
for (const t of [
  "Class A2", "Class B1/B2/B3", "Series II", "Motilal Oswal Founders Fund Series II — Class G1",
  "Sanshi Fund-I — Class E", "Transition Venture Capital Fund I", "Carnelian Bharat Amritkaal Fund",
  "Neo Infra Income Opportunities Fund I — Class A5", "duplicate", "communication",
]) eq(`"${t}" names no category`, categoriesNamedIn(t), []);
eq("null names nothing", categoriesNamedIn(null), []);
eq("an empty string names nothing", categoriesNamedIn(""), []);

// ── A PHRASE NAMING TWO CATEGORIES RESOLVES TO NEITHER ──────────────────────
// A statement reading `Category I/II` is the issuer declining to commit, and
// picking one would be this book inventing the answer the document withheld.
// Constructed, because NO STATEMENT IN THIS BOOK PRINTS ONE: the account that
// used to carry this phrase was Transition Venture's, and its reader wrote it —
// both statements print a blank `Sebi Reg. no.-` and no category at all.
console.log("\n── ambiguity ──");
eq("Category I/II names both", categoriesNamedIn("Category I/II AIF — drawdown"), [CATEGORY_I, CATEGORY_II]);
{
  const r = readAifCategory({ security: "x" }, { providerEngagement: "Category I/II AIF — drawdown" } as Account);
  eq("…and resolves to no category", r.category, null);
  eq("…with `ambiguous` as the reason", r.why, "ambiguous");
  ok("…whose wording names both", /Category I and Category II/.test(aifCategoryWhy(r)), aifCategoryWhy(r));
}

// ── THE TWO PRINTED FIELDS MUST AGREE WHERE BOTH SPEAK ──────────────────────
console.log("\n── the agreement guard ──");
{
  const conflict = readAifCategory(
    { security: "A Fund (AIF CATEGORY II)" },
    { providerEngagement: "Category III AIF Scheme" } as Account,
  );
  eq("a disagreement yields no category", conflict.category, null);
  eq("…and says the two fields disagree", conflict.why, "conflict");
  ok("…and its wording names both sides",
    /name.*says/i.test(aifCategoryWhy(conflict)) && /Category II/.test(aifCategoryWhy(conflict)) && /Category III/.test(aifCategoryWhy(conflict)));
  // …AND AGREEMENT IS NOT A CONFLICT. Both fields naming the same category is
  // the ordinary case on this book (Sanshi prints it in both) and must resolve.
  const agree = readAifCategory(
    { security: "Sanshi Fund-I (Open Ended AIF CAT-III)" },
    { providerEngagement: "Open Ended AIF CAT-III" } as Account,
  );
  eq("two fields agreeing resolve", agree.category, CATEGORY_III);
}
{
  const unstated = readAifCategory({ security: "Some Fund" }, { providerEngagement: "a fund" } as Account);
  eq("neither field naming one yields `unstated`", unstated.why, "unstated");
  ok("…and its wording says no statement prints one", /no statement/i.test(aifCategoryWhy(unstated)));
}

// ── PRIVATE EQUITY IS READ, NEVER INFERRED FROM BEING A DRAWDOWN FUND ───────
console.log("\n── private equity ──");
ok("a fund whose own name says private equity",
  readsAsPrivateEquity({ security: "Baring Private Equity India Fund 6 — Class A1" }, undefined));
ok("a fund whose own name says venture capital",
  readsAsPrivateEquity({ security: "Transition Venture Capital Fund I — Class A1" }, undefined));
// AND NOT FROM THE STRUCTURE. This book holds five drawdown AIFs; calling all
// of them private equity would file an infrastructure income fund and a
// listed-equity growth fund under a discipline neither claims.
ok("a drawdown fund is not private equity by itself", !readsAsPrivateEquity(
  { security: "Neo Infra Income Opportunities Fund I — Class A5" },
  { providerEngagement: "drawdown fund — the statement prints a capital commitment, dated drawdowns and a quarterly NAV; its manager block prints the SEBI registration \"AIF -Category-II No : IN/AIF2/22-23/1042\"" } as Account));
// A REAL Category II engagement, not the Founders string this used to borrow —
// Founders prints no category, and its "Category II AIF - drawdown…" was its
// reader's invention (the figure audit, PM-C3's sibling).
ok("a Category II AIF is not private equity by itself", !readsAsPrivateEquity(
  { security: "360 ONE Special Opportunities Fund - Series 8 — Class A3" },
  { providerEngagement: "Category II AIF — pass-through" } as Account));
ok("the word `venture` alone is not enough",
  !readsAsPrivateEquity({ security: "Venture Technologies Limited" }, undefined));

// PE TAKES PRECEDENCE OVER THE CATEGORY, which is the family's own answer to
// the overlap — and the row still carries its category, which the page asserts.
{
  const idx = new Map<string, Account>([["a", { accountId: "a", providerEngagement: "Category II AIF — drawdown private equity fund" } as Account]]);
  const p = { accountId: "a", security: "Baring Private Equity India Fund 6", assetClass: "AIF" } as never;
  eq("a PE fund is filed under Private Equity", aifSectionOf(idx as never, p), PRIVATE_EQUITY_SECTION);
  eq("…and still reads as Category II", aifCategoryOf(idx as never, p).category, CATEGORY_II);
}

// ── THE SECTIONS PARTITION THE BOOK'S OWN AIF ROW ───────────────────────────
console.log("\n── against the book ──");
const accts = accountIndex(BOOK_ACCOUNTS);
const aif = currentHoldings(dedupedPositions(BOOK_POSITIONS)).filter((p) => isAifHolding(accts, p));
const total = sum(aif.map((p) => p.marketValue));

// THE LOAD-BEARING GATE: a suite passing over no input claims confidence nobody
// earned, and every equality below is trivially true on an empty set.
ok("the book carries AIF holdings to section", aif.length > 0, `${aif.length} rows · ${cr(total)}`);

const bySection = new Map<string, number>();
for (const p of aif) bySection.set(aifSectionOf(accts, p), (bySection.get(aifSectionOf(accts, p)) ?? 0) + p.marketValue);
for (const [k, v] of [...bySection].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(22)} ${cr(v)}`);

ok("every holding lands in exactly one section",
  aif.every((p) => AIF_SECTION_ORDER.includes(aifSectionOf(accts, p))));
ok("the sections sum to the AIF row, to the rupee",
  Math.abs([...bySection.values()].reduce((a, b) => a + b, 0) - total) < 1);
// A SECTION THE PAGE DRAWS MUST HOLD MONEY. The first draft of this line read
// `v !== 0 || true`, which is always true — a check that cannot fail, which is
// exactly what this repo forbids and what the bug-reintroduction pass exists to
// find. A section keyed on something no holding produces would draw an empty
// heading, and that is the shape this catches.
ok("every section drawn holds money", [...bySection.values()].every((v) => v > 0),
  [...bySection].map(([k, v]) => `${k}=${cr(v)}`).join(" · "));
ok("the reading order puts the three categories first",
  aifSectionOrd(CATEGORY_I) < aifSectionOrd(CATEGORY_II)
  && aifSectionOrd(CATEGORY_II) < aifSectionOrd(CATEGORY_III)
  && aifSectionOrd(CATEGORY_III) < aifSectionOrd(PRIVATE_EQUITY_SECTION)
  && aifSectionOrd(PRIVATE_EQUITY_SECTION) < aifSectionOrd(AIF_UNSTATED_SECTION));
ok("an unknown section sorts last", aifSectionOrd("something else") >= AIF_SECTION_ORDER.length);

// THE AGREEMENT GUARD, MEASURED AND REPORTED AT ZERO. A guard that only speaks
// when it fires is indistinguishable, on a clean run, from one that was deleted.
{
  let both = 0, disagree = 0;
  for (const p of aif) {
    const r = aifCategoryOf(accts, p);
    if (r.fromSecurity.length && r.fromEngagement.length) { both++; if (r.why === "conflict") disagree++; }
  }
  ok("the guard is exercised by this book", both > 0, `${both} holdings print a category in both fields`);
  ok("…and nothing disagrees", disagree === 0, `${disagree} conflicts`);
}

// EVERY HOLDING WITHOUT A CATEGORY CARRIES A REASON, and the reasons differ by
// cause — a statement naming two categories and one naming none send a reader
// to different documents.
{
  const unstated = aif.map((p) => aifCategoryOf(accts, p)).filter((r) => !r.category);
  ok("every uncategorised holding names its cause",
    unstated.every((r) => !!r.why && aifCategoryWhy(r).length > 20), `${unstated.length} uncategorised`);
  const whys = new Set(unstated.map((r) => r.why));
  ok("…and the causes are told apart", whys.size >= 1, [...whys].join(", "));
}

// ── AND THE FOLIOS NO STATEMENT VALUES ──────────────────────────────────────
// Every Category I AIF this family owns is an angel fund publishing no NAV, so
// a holdings table can never draw one. If that stopped being named the page
// would tell a reader they hold no Category I at all.
{
  const withPositions = new Set(BOOK_POSITIONS.map((p) => p.accountId));
  const un = unvaluedAifFolios(BOOK_ACCOUNTS, withPositions, new Map());
  if (un.length) {
    ok("every one carries a section", un.every((f) => AIF_SECTION_ORDER.includes(f.section)));
    ok("every one names its owner and account", un.every((f) => !!f.owner && !!f.accountNo));
  } else {
    // SINCE Stage 10dh THE FAMILY'S CONSOLIDATED REVIEW CARRIES EVERY SUCH FOLIO
    // — India SME at the review's own value, Sky Capital's angel folios at cost —
    // so no AIF account is left holding nothing on this book. That is evidence,
    // not a pass: the folios the statements valued nothing for must each be a
    // review row now, or the list is empty because a folio went missing.
    const tookOver = new Set(BOOK_REVIEW_SUPERSEDED.filter((s) => s.kind === "unvalued").map((s) => s.accountId));
    const aifTaken = BOOK_ACCOUNTS.filter((a) => a.engagement === "AIF" && tookOver.has(a.accountId));
    ok("no AIF folio is left valuing nothing — the review carries each one a statement did not value",
      aifTaken.length > 0 && aifTaken.every((a) => BOOK_POSITIONS.some((p) => p.accountId === a.accountId && p.review)),
      aifTaken.map((a) => a.accountId).join(", "));
    // …AND THE RULE IS HELD ON A CONSTRUCTED FOLIO, so the list still names one
    // the day a drop brings an angel fund nothing values: Sky Capital's own
    // account as it stood before the review carried it.
    const sky = BOOK_ACCOUNTS.find((a) => a.accountId === "sky-capital-rising-titans-fund-SKY022");
    const built = sky ? unvaluedAifFolios(
      [{ ...sky, noPositionsReason: "this fund publishes no NAV: its statement carries 1 holding(s) with units and the capital drawn against a commitment, and no valuation" }],
      new Set(), new Map(),
    ) : [];
    ok("a constructed folio publishing no NAV is named, under Category I, with its owner and account",
      built.length === 1 && built[0].section === CATEGORY_I && !!built[0].owner && !!built[0].accountNo,
      JSON.stringify(built[0] ?? null));
    console.log("NOT CHECKED the unvalued list's sections and owners on this book: it leaves no AIF folio unvalued since Stage 10dh, so the constructed folio above holds the rule");
  }
  const catI = un.filter((f) => f.section === CATEGORY_I);
  const drawnI = bySection.has(CATEGORY_I);
  // THE CLAIM THE LIST EXISTS FOR, struck either way: Category I is on the page,
  // drawn in the table or named under it — never silently absent.
  ok("Category I is shown — drawn as a holding or named as an unvalued folio", drawnI || catI.length > 0,
    `drawn: ${drawnI}, named: ${catI.length}`);
  if (catI.length > 0) {
    ok("Category I appears in the unvalued list where no holding carries it",
      !drawnI, `${catI.length} Category I folios, drawn in the table: ${drawnI}`);
  } else {
    console.log("ok   (this book values every Category I AIF it holds)");
  }
  // AND NOTHING WITH A POSITION IS IN IT — the two lists must not overlap, or
  // the same folio is reported as both held and unvalued.
  ok("no folio appears in both the table and the unvalued list",
    un.every((f) => !withPositions.has(f.accountId)));
}

// ── WHAT THE FAMILY DECLARED, AND THE THREE RULES IT MUST KEEP ─────────────
//
//   "Motilal Oswal Wealth Delphi Equity Fund and Neo Infra Income Opportunities
//    Fund I — Class A5: classify both of these AIFs as Category 2 funds."
//
// A declaration FILLS A SILENT STATEMENT and nothing else; it is keyed on the
// securityKey, never on a name; and the read says where the category came from.
console.log("\n── the family's declared categories ──");
{
  const keys = Object.keys(DECLARED_AIF_CATEGORY);
  eq("the family declared exactly the two funds they named", keys.sort(),
    ["motilal-oswal-wealth-delphi-equity-fund", "neo-infra-income-opportunities-fund-i-class-a5"]);
  ok("every declaration is Category II, as they said",
    keys.every((k) => DECLARED_AIF_CATEGORY[k].category === CATEGORY_II));

  // LOAD-BEARING: a declaration may only ever FILL a silent statement. Where
  // a declared fund's own paperwork prints a category, it must AGREE with the
  // declaration — a disagreement is a conflict to show a human, never a value
  // to take — and the read must say the STATEMENT answered it, not the family.
  //
  // Neo Infra is that case since the figure audit: its statement prints
  // `AIF -Category II` on its SEBI registration line, which the reader used to
  // drop, so the category now comes off the document and the family's word is
  // a corroboration. Delphi's statement is still silent and still reads the
  // declaration — and at least one declared fund must, or nothing live
  // exercises the declared tier at all.
  let readFromFamily = 0;
  for (const k of keys) {
    const rows = BOOK_POSITIONS.filter((p) => p.securityKey === k);
    ok(`${k} is in the book`, rows.length > 0);
    for (const p of rows) {
      const a = accts.get(p.accountId);
      const printed = [...categoriesNamedIn(p.security), ...categoriesNamedIn(a?.providerEngagement)];
      const r = aifCategoryOf(accts, p);
      if (printed.length === 0) {
        readFromFamily += 1;
        eq(`…its statement is silent, so it reads the declared category (${p.accountId})`,
          [r.category, r.source, r.why], [CATEGORY_II, "family", null]);
      } else {
        ok(`…its statement prints a category, and it AGREES with the declaration (${p.accountId})`,
          printed.every((c) => c === DECLARED_AIF_CATEGORY[k].category), printed.join(","));
        eq(`…so the statement answers it, not the family (${p.accountId})`,
          [r.category, r.source, r.why], [CATEGORY_II, "statement", null]);
      }
      eq(`…files under that section`, aifSectionOf(accts, p), CATEGORY_II);
      // THE SIDE IS NOT THE DECLARATION'S TO DECIDE. The family's own placing
      // (`FAMILY_MARKET_SIDE`, Stage 10bw) outranks any category: Delphi is a
      // Category II fund investing in listed equity — the Founders Fund's case
      // — and Neo Infra a private one. So the side is whatever their placing
      // says, and the declared category decides the drill-down section alone.
      const placed = familyMarketDecision(p.security, a)?.side ?? null;
      ok(`…and its side is the family's placing, not the category (${p.accountId})`,
        placed != null && p.marketSide === placed, `${p.marketSide} vs placed ${placed}`);
    }
  }

  ok("at least one declared fund still reads the family's declaration (the tier is exercised live)",
    readFromFamily > 0, `${readFromFamily} position(s)`);

  // THE STATEMENT WINS. A declaration never reaches a fund whose paperwork
  // prints a category — constructed, because no declared fund here prints one.
  const k0 = keys[0];
  const printedIII = readAifCategory({ security: "Some Fund (AIF CAT-III)", securityKey: k0 }, undefined);
  eq("a printed category beats a declaration on the same key", [printedIII.category, printedIII.source], [CATEGORY_III, "statement"]);
  const ambiguous = readAifCategory({ security: "Some Fund", securityKey: k0 },
    { providerEngagement: "Category I/II AIF — drawdown" } as Account);
  eq("…and so does a statement naming TWO (it stays unstated rather than taking the declaration)",
    [ambiguous.category, ambiguous.why], [null, "ambiguous"]);
  // KEYED ON THE KEY, NEVER THE NAME — the browser renders a display label in
  // `security`, and a name matcher here would be a fuzzy tier.
  const byName = readAifCategory({ security: "Motilal Oswal Wealth Delphi Equity Fund" }, undefined);
  eq("the fund's NAME alone does not reach the declaration", [byName.category, byName.why], [null, "unstated"]);
  eq("an unknown key has no declaration", declaredAifCategory("not-a-fund"), null);
  ok("a printed category says it came from a statement",
    readAifCategory({ security: "Sanshi Fund-I (Open Ended AIF CAT-III) — Class E" }, undefined).source === "statement");

  // WHAT THE ARCHIVE CORROBORATES, re-read from the committed text rather than
  // trusted from the comment that says so. Neo Infra's own statement prints its
  // manager's Category II registration; Delphi's prints nothing, and its entry
  // says so by carrying no corroboration.
  const neo = JSON.stringify(JSON.parse(readFileSync(
    "public/audit/neo-infra-income-opportunities-fund-9039920536-2026-06-30-holdings/pages.json", "utf8")));
  ok("Neo Infra's own statement prints a Category II registration", /Category-II No : IN\/AIF2\//.test(neo));
  ok("…and its declaration names that corroboration",
    /IN\/AIF2/.test(DECLARED_AIF_CATEGORY["neo-infra-income-opportunities-fund-i-class-a5"].corroboration ?? ""));
  const delphi = JSON.stringify(JSON.parse(readFileSync(
    "public/audit/motilal-oswal-delphi-equity-fund-9049241536-2026-06-30-holdings/pages.json", "utf8")));
  ok("Delphi's statement prints no category and no registration", !/categor|IN\/AIF/i.test(delphi));
  eq("…so its declaration claims no corroboration", DECLARED_AIF_CATEGORY["motilal-oswal-wealth-delphi-equity-fund"].corroboration, null);
}

console.log(fails ? `\n${fails} FAILED` : "\nall AIF category checks passed");
process.exit(fails ? 1 : 0);
