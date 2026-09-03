// THE FAMILY'S THREE SLICES OF ONE BOOK.  npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The Portfolio Monitor can now section the same holdings three ways: by
// category (unchanged, and still the default), by the family's asset class, and
// by their baskets. The first is derived from the book. The other two come from
// `familyTaxonomy.ts` — a committed map read off the family's own consolidated
// review — and a wrong entry there is the most dangerous kind of defect this
// repo has: it files a real holding under the wrong basket, and a basket
// heading looks exactly as authoritative whichever rows are under it.
//
// So the assertions below are RELATIONS against the generated book rather than
// literals. When the next drop moves the book both sides move together, and a
// map entry that stops matching anything fails loudly instead of going quiet.
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY } from "@/data/glowData";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { holdingBucket, MANDATE_BUCKET, dedupedPositions } from "@/lib/analytics";
import {
  FAMILY_TAXONOMY, BASKET_ORDER, FAMILY_CLASS_ORDER, UNCLASSIFIED,
  basketKeyOf, familyClassKeyOf, familyBasket, familyAssetClass, productKeyOf,
} from "@/lib/familyTaxonomy";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

const idx = accountIndex(BOOK_ACCOUNTS);
const isM = (p: (typeof BOOK_POSITIONS)[number]) =>
  holdingBucket(p, engagementOf(idx, p) || null) === MANDATE_BUCKET;

// ── 1. NO DEAD ENTRIES ──────────────────────────────────────────────────────
// A key that matches no holding is a TYPO, and a typo is invisible: the holding
// it was meant for simply falls into "not classified" and the section still
// reads correctly. This is the check that makes the map maintainable.
{
  const live = new Set(BOOK_POSITIONS.map((p) => productKeyOf(p, isM(p))));
  const dead = Object.keys(FAMILY_TAXONOMY).filter((k) => !live.has(k));
  ok("every map entry matches a holding in the book — a typo would show here",
     dead.length === 0, dead.length ? dead.join(", ") : `${Object.keys(FAMILY_TAXONOMY).length} entries`);
}

// ── 2. EVERY HOLDING LANDS SOMEWHERE, ON BOTH AXES ──────────────────────────
// The safety property of regrouping: the same holdings, rearranged. A key that
// returned undefined would drop a row off the table entirely.
for (const [axis, key] of [["basket", basketKeyOf], ["asset class", familyClassKeyOf]] as const) {
  const keys = BOOK_POSITIONS.map((p) => key(p, isM(p)));
  ok(`every holding gets a ${axis} key`, keys.every((k) => typeof k === "string" && k.length > 0));
  const allowed = new Set<string>([
    ...(axis === "basket" ? BASKET_ORDER : FAMILY_CLASS_ORDER) as readonly string[], UNCLASSIFIED,
  ]);
  const stray = [...new Set(keys)].filter((k) => !allowed.has(k));
  ok(`...and only ever the family's own ${axis} names`, stray.length === 0, stray.join(", ") || "none");
}

// ── 3. THE PARTITION TIES TO THE BOOK'S OWN TOTAL ───────────────────────────
// On the DEDUPED basis, because that is what the page's footer and
// `BOOK_SUMMARY.totalValue` are on. Two independent paths to one figure: this
// sums sections, that comes from build-book.mjs.
{
  const deduped = dedupedPositions(BOOK_POSITIONS);
  for (const [axis, key] of [["basket", basketKeyOf], ["asset class", familyClassKeyOf]] as const) {
    const byKey = new Map<string, number>();
    for (const p of deduped) {
      const k = key(p, isM(p));
      byKey.set(k, (byKey.get(k) ?? 0) + p.marketValue);
    }
    const sum = [...byKey.values()].reduce((a, b) => a + b, 0);
    ok(`the ${axis} sections sum to BOOK_SUMMARY.totalValue to the rupee`,
       Math.abs(sum - BOOK_SUMMARY.totalValue) < 0.5,
       `${cr(sum)} vs ${cr(BOOK_SUMMARY.totalValue)} across ${byKey.size} sections`);
  }
}

// ── 4. THE MAP AGREES WITH ITSELF ACROSS THE TWO AXES ───────────────────────
// Both come from the same entry, so a holding the review NAMES must be
// classified on both axes or neither. Only a rule- or derivation-filled holding
// may differ, and the test says which.
{
  const bad = BOOK_POSITIONS.filter((p) => {
    const b = familyBasket(p, isM(p)), a = familyAssetClass(p, isM(p));
    return (b?.source === "review") !== (a?.source === "review");
  });
  ok("a holding the review names is classified on BOTH axes, never one",
     bad.length === 0, bad.length ? bad[0].security : "");
}

// ── 5. THE RULE IS A FALLBACK, NEVER AN OVERRIDE ────────────────────────────
// The family's email puts "PMS" under Thematic & Tactical; their own workbook
// puts the Carnelian PMS under Stable Growth. The more specific statement wins,
// and this asserts it on the real holding — because a rule applied over the map
// would be invisible, the section would just quietly hold the wrong mandate.
{
  const carnelian = BOOK_POSITIONS.filter((p) => /carnelian-asset-management/.test(p.accountId));
  ok("the Carnelian mandate is in the book for this check to bite on", carnelian.length > 0,
     `${carnelian.length} position(s)`);
  ok("...and it is Stable Growth, as the family's workbook says — not the email's PMS rule",
     carnelian.every((p) => basketKeyOf(p, isM(p)) === "Stable Growth"));
  ok("...on the review's authority, not a rule",
     carnelian.every((p) => familyBasket(p, isM(p))?.source === "review"));
}

// ── 6. THE RULE ONLY EVER TOUCHES DIRECT STOCKS ─────────────────────────────
// "All the direct stocks" is the one clause applied. A mandate or a fund
// reaching the rule would mean the other clauses had crept back in.
{
  const ruled = BOOK_POSITIONS.filter((p) => familyBasket(p, isM(p))?.source === "rule");
  ok("the rule fires on this book at all, so the guard below is testable", ruled.length > 0, `${ruled.length} positions`);
  ok("...and only ever on company shares the review does not name",
     ruled.every((p) => p.assetClass === "Equity" && !isM(p)));
  ok("...placing them in Thematic & Tactical, as the family stated",
     ruled.every((p) => basketKeyOf(p, isM(p)) === "Thematic & Tactical"));
}

// ── 7. THE AMBIGUOUS CLASSES ARE REALLY AMBIGUOUS ───────────────────────────
// This is the measurement that justifies the whole map: if our own AssetClass
// could answer the family's, the map would be dead weight. It cannot — and the
// day it could, this test says so rather than the map silently outliving its
// reason.
{
  const spread = new Map<string, Set<string>>();
  for (const p of BOOK_POSITIONS) {
    const fam = familyAssetClass(p, isM(p));
    if (!fam || fam.source !== "review") continue;
    (spread.get(p.assetClass) ?? spread.set(p.assetClass, new Set()).get(p.assetClass)!).add(fam.value);
  }
  const ambiguous = [...spread.entries()].filter(([, v]) => v.size > 1);
  ok("at least one of our asset classes maps to more than one of the family's",
     ambiguous.length > 0,
     ambiguous.map(([k, v]) => `${k} → ${[...v].join("/")}`).join("; "));
}

// ── 8. THE UNCLASSIFIED REMAINDER IS SMALL AND NAMED ────────────────────────
// Not a literal: a relation. If a future drop pushes it far up, that is a real
// finding about a stale review rather than a test to relax.
{
  const deduped = dedupedPositions(BOOK_POSITIONS);
  const un = deduped.filter((p) => basketKeyOf(p, isM(p)) === UNCLASSIFIED);
  const unMV = un.reduce((s, p) => s + p.marketValue, 0);
  ok("the family's review covers the great majority of the book by value",
     unMV / BOOK_SUMMARY.totalValue < 0.1,
     `${cr(unMV)} unclassified of ${cr(BOOK_SUMMARY.totalValue)} — ${(unMV / BOOK_SUMMARY.totalValue * 100).toFixed(1)}%`);
  ok("...and every unclassified holding can be named, so the page can say which",
     un.every((p) => typeof p.security === "string" && p.security.length > 0),
     un.map((p) => p.security).slice(0, 3).join("; "));
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
