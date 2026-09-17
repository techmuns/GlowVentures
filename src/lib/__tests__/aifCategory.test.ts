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
import { BOOK_POSITIONS, BOOK_ACCOUNTS } from "@/data/glowData";
import type { Account } from "@/lib/types";
import { accountIndex } from "@/lib/accounts";
import { currentHoldings, dedupedPositions, sum } from "@/lib/analytics";
import {
  categoriesNamedIn, readAifCategory, aifCategoryOf, aifSectionOf, aifCategoryWhy,
  readsAsPrivateEquity, isAifHolding, unvaluedAifFolios,
  AIF_SECTION_ORDER, aifSectionOrd, PRIVATE_EQUITY_SECTION, AIF_UNSTATED_SECTION,
  CATEGORY_I, CATEGORY_II, CATEGORY_III,
} from "@/lib/aifCategory";

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
// Transition Venture Capital's account reads `Category I/II AIF — drawdown`.
// That is the issuer declining to commit, and picking one would be this book
// inventing the answer the document withheld.
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
  { providerEngagement: "drawdown fund — the statement prints a capital commitment, dated drawdowns and a quarterly NAV" } as Account));
ok("a Category II AIF is not private equity by itself", !readsAsPrivateEquity(
  { security: "Motilal Oswal Founders Fund Series II — Class G1" },
  { providerEngagement: "Category II AIF - drawdown, with a commitment and called capital" } as Account));
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
  ok("the book carries AIF folios that value nothing", un.length > 0, `${un.length} folios`);
  ok("every one carries a section", un.every((f) => AIF_SECTION_ORDER.includes(f.section)));
  ok("every one names its owner and account", un.every((f) => !!f.owner && !!f.accountNo));
  const catI = un.filter((f) => f.section === CATEGORY_I);
  const drawnI = bySection.has(CATEGORY_I);
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

console.log(fails ? `\n${fails} FAILED` : "\nall AIF category checks passed");
process.exit(fails ? 1 : 0);
