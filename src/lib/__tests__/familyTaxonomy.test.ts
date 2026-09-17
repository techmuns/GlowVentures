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
import path from "node:path";
import fs from "node:fs";
import XLSX from "xlsx";
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY } from "@/data/glowData";
import { accountIndex, engagementOf } from "@/lib/accounts";
import {
  holdingBucket, MANDATE_BUCKET, dedupedPositions,
  CASH_EQUIVALENT_KEYS, isCashEquivalent, cashEquivalentCandidates,
} from "@/lib/analytics";
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

// ── 9. THE MAP IS CHECKED AGAINST THE FAMILY'S OWN WORKBOOK ────────────────
// Sections 1-8 assert that the map is INTERNALLY sound: no dead keys, a total
// partition, the rule as a fallback. Not one of them can see a well-formed
// entry that files a real holding under the wrong basket — which is the most
// dangerous defect this map can carry, because a basket heading looks exactly
// as authoritative whichever rows sit under it.
//
// So this reads the family's committed workbook and holds every entry to the
// row it cites. It is the same discipline `review-reconcile.mjs` applies to the
// book: an INDEPENDENT cross-check against the family's own document, never a
// second source the app reads at runtime. The workbook is test-only — nothing
// under `src/pages` may import `xlsx`.
{
  // The bundle runs from a temp dir, so `import.meta.url` resolves next to the
  // BUNDLE. `GLOW_FIXTURES` is the repo-anchored path the runner passes in.
  const ROOT = process.env.GLOW_FIXTURES
    ? path.resolve(process.env.GLOW_FIXTURES, "../../../..")
    : process.cwd();
  const WB = path.join(ROOT, "source/august-2026-d",
    "Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");

  // A MISSING WORKBOOK IS A FAILURE, NEVER A QUIET PASS. This map's entire
  // authority is that document; a suite that skipped when it could not find it
  // would claim confidence nobody earned (`golden.mjs`'s rule).
  ok("the family's consolidated review is on disk to check against", fs.existsSync(WB), WB);

  if (fs.existsSync(WB)) {
    const wb = XLSX.readFile(WB);
    const grid = (n: string) =>
      XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: "" }) as unknown[][];
    const S = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
    const num = (x: unknown) => (typeof x === "number" ? x : Number(String(x).replace(/,/g, "")) || 0);

    type Say = { basket?: string; assetClass?: string; where: string[] };
    const W = new Map<string, Say>();
    // FIRST WRITER WINS, and the ORDER OF THE THREE LOOPS BELOW IS THE WHOLE
    // RULE — there is deliberately no second mechanism. A `num(cost) === 0`
    // guard was written first and removed: with first-writer-wins it could
    // never fire, so it was a branch that documented a rule it did not enforce,
    // which is this repo's dead-code-that-looks-alive failure. What the order
    // does is asserted below instead.
    const say = (p: string, patch: Partial<Say>, where: string) => {
      const e = W.get(p) ?? { where: [] as string[] };
      if (patch.basket && !e.basket) e.basket = patch.basket;
      if (patch.assetClass && !e.assetClass) e.assetClass = patch.assetClass;
      e.where.push(where);
      W.set(p, e);
    };
    // The four BASKET sheets: the sheet a product is listed on IS its basket.
    for (const [sheet, basket] of [
      ["Stable Growth", "Stable Growth"], ["Entrepreneruial Growth", "Entrepreneurial Growth"],
      ["Thematic,Tactical", "Thematic & Tactical"], ["Liquid", "Liquidity"],
    ] as const)
      for (const r of grid(sheet).slice(1)) {
        const p = S(r[0]);
        if (p && p !== "Total") say(p, { basket }, `basket:${sheet}`);
      }
    // The four ASSET-CLASS sheets, whose product name is the SECOND column
    // (the first carries the basket code).
    for (const [sheet, cls] of [
      ["Equity", "Equity"], ["Cash", "Cash"], ["Debt", "Debt"], ["Alternate", "Alternate"],
    ] as const)
      for (const r of grid(sheet)) {
        const p = S(r[1]);
        if (p && !/^(Product|Total|Note|\*Note|\d\.)/i.test(p)) say(p, { assetClass: cls }, `class:${sheet}`);
      }
    // THE PRIVATE-EQUITY TAB LAST, so it can only fill gaps — see the block of
    // the same name in `familyTaxonomy.ts` for why that order is load-bearing.
    const contested: { p: string; live: string; cost: number }[] = [];
    for (const r of grid("Private Investments ").slice(1)) {
      const p = S(r[0]);
      if (!p || p === "Total" || p === "Private Equity" || p === "Product") continue;
      const live = W.get(p)?.basket;
      if (live) contested.push({ p, live, cost: num(r[2]) });
      say(p, { basket: "Entrepreneurial Growth", assetClass: "Alternate" }, "privateEquity");
    }
    ok("the workbook parses into a product classification", W.size > 100, `${W.size} products`);

    // THE TWO WITNESSES DISAGREE ON EXACTLY THE PRODUCTS THAT LEFT PRIVATE
    // CAPITAL WHEN THEY LISTED, and the live sheet has to win. Both are ₹0 on
    // the private tab and carry real figures on Thematic,Tactical; Parth's own
    // remark there reads "Listed in Aug'25". Read the other way round this
    // refiles ₹5.31 Cr of listed equity as Alternate — so the order is asserted
    // rather than commented, and this fails the moment the loops are swapped.
    ok("the private-equity tab is contested by a live sheet, so the order below can bite",
       contested.length > 0, contested.map((c) => `${c.p} (live ${c.live}, private ₹${c.cost} Cr)`).join("; "));
    ok("...and on every contested product the live sheet wins",
       contested.every((c) => W.get(c.p)?.basket === c.live),
       contested.map((c) => `${c.p} → ${W.get(c.p)?.basket}`).join("; "));
    ok("...each of them a zeroed private stub, which is why it is a stub and not a rival",
       contested.every((c) => c.cost === 0));

    // (a) EVERY CITATION RESOLVES. A `reviewProduct` naming no row in the
    // family's document is a citation nobody can follow — which is exactly the
    // defect that prompted this section (a stray double space).
    const entries = Object.entries(FAMILY_TAXONOMY);
    const unfound = entries.filter(([, e]) => !W.has(e.reviewProduct));
    ok("every entry cites a product the workbook actually carries",
       unfound.length === 0,
       unfound.length ? unfound.map(([k, e]) => `${k} → "${e.reviewProduct}"`).join("; ") : `${entries.length} citations`);

    // (b) AND THE WORKBOOK'S ANSWER IS OURS, on both axes, wherever it speaks.
    const wrong: string[] = [];
    let sawBasket = 0, sawClass = 0;
    for (const [key, e] of entries) {
      const w = W.get(e.reviewProduct);
      if (!w) continue;
      if (w.basket) { sawBasket++; if (w.basket !== e.basket) wrong.push(`${key}: basket ours ${e.basket} vs workbook ${w.basket} [${w.where.join(",")}]`); }
      if (w.assetClass) { sawClass++; if (w.assetClass !== e.assetClass) wrong.push(`${key}: class ours ${e.assetClass} vs workbook ${w.assetClass} [${w.where.join(",")}]`); }
    }
    ok("...and every basket and asset class matches what the family's sheet says",
       wrong.length === 0, wrong.length ? wrong.join("; ") : `${sawBasket} baskets and ${sawClass} classes witnessed`);

    // (c) THE COMPARISON ACTUALLY HAPPENED. A workbook whose sheets were renamed
    // parses to an empty map, every lookup misses, and (b) passes over nothing.
    ok("...over essentially every entry, so (b) cannot pass by matching nothing",
       sawBasket >= entries.length - 1 && sawClass >= entries.length - 1,
       `${sawBasket}/${sawClass} of ${entries.length}`);
  }
}

// ── 10. CASH IS CASH, WHATEVER WRAPPER IT ARRIVED IN ────────────────────────
//
//   "why should an ETF show here? Like, a liquid ETF should actually show in
//    cash… Cash is liquid, arbitrage. All of it is cash."
//
// `CASH_EQUIVALENT_KEYS` sends a liquid fund or a liquid ETF to the Cash bucket
// on the CATEGORY axis, overriding the class its issuing document printed. That
// is a family decision applied over a measurement, so it earns the same
// treatment `familyTaxonomy` gets above: every entry cited, nothing derived from
// a name, and the thing it CANNOT see asserted rather than left to be noticed.
{
  const bucketOf = (p: (typeof BOOK_POSITIONS)[number]) => holdingBucket(p, engagementOf(idx, p) || null);

  // (a) NO DEAD ENTRIES — the same rule section 1 applies to the taxonomy. A key
  // that matches no holding is a typo, and a typo here is invisible: the liquid
  // fund it was meant for simply stays under Mutual Fund.
  const keys = Object.keys(CASH_EQUIVALENT_KEYS);
  const held = new Set(BOOK_POSITIONS.map((p) => p.securityKey));
  const dead = keys.filter((k) => !held.has(k));
  ok("every cash-equivalent key matches a holding in the book",
     dead.length === 0, dead.length ? dead.join("; ") : `${keys.length} keys`);

  // (b) EVERY ENTRY CITES THE FAMILY'S OWN DOCUMENT. The map's whole authority
  // is that workbook; an entry with no citation is one somebody typed.
  const uncited = Object.entries(CASH_EQUIVALENT_KEYS).filter(([, why]) => !/\S/.test(why));
  ok("...and every one cites the review row it came from", uncited.length === 0,
     uncited.map(([k]) => k).join("; "));

  // (c) THEY ACTUALLY REACH THE CASH BUCKET — except inside a mandate, where the
  // mandate wins BY DESIGN, because its row has to tie to its own statement.
  // Asserted in both directions: a rule that sent everything to Cash would pass
  // the first half and fail the second.
  const eq = BOOK_POSITIONS.filter((p) => isCashEquivalent(p));
  const inMandate = eq.filter((p) => engagementOf(idx, p) === "PMS");
  const outside = eq.filter((p) => engagementOf(idx, p) !== "PMS");
  ok("a cash equivalent outside a mandate buckets as Cash",
     outside.length > 0 && outside.every((p) => bucketOf(p) === "Cash"),
     `${outside.length} rows`);
  ok("...and one INSIDE a mandate stays with the mandate, which ties to its statement",
     inMandate.length > 0 && inMandate.every((p) => bucketOf(p) === MANDATE_BUCKET),
     `${inMandate.length} rows`);

  // (d) THE REGROUPING MOVES NO MONEY. Buckets are a view of one book: the
  // category sections must still reconstruct `BOOK_SUMMARY.totalValue`, or this
  // stopped being a regrouping and became a re-measurement.
  const ded = dedupedPositions([...BOOK_POSITIONS]);
  const byBucket = new Map<string, number>();
  for (const p of ded) byBucket.set(bucketOf(p), (byBucket.get(bucketOf(p)) ?? 0) + p.marketValue);
  const total = [...byBucket.values()].reduce((a, b) => a + b, 0);
  ok("the category sections still reconstruct the book's own total",
     Math.abs(total - BOOK_SUMMARY.totalValue) < 1,
     `${cr(total)} vs ${cr(BOOK_SUMMARY.totalValue)}`);

  // (e) THE RULE IS LOAD-BEARING. Without it the Cash section reads ₹0.00 Cr on
  // this book — every real rupee of cash either inside a mandate or filed under
  // Mutual Fund and ETF — so a suite that only checked (d) would pass just as
  // happily with the whole rule deleted.
  const cashWith = byBucket.get("Cash") ?? 0;
  const cashWithout = ded
    .filter((p) => engagementOf(idx, p) !== "PMS" && p.assetClass === "Cash")
    .reduce((a, p) => a + p.marketValue, 0);
  ok("...and it is what puts the family's cash on screen at all",
     cashWith > cashWithout && cashWithout < 1e7,
     `Cash ${cr(cashWithout)} → ${cr(cashWith)}`);

  /**
   * (f) ── WHAT THE MAP DOES NOT NAME, WHICH IS THE HALF THAT GOES STALE ──────
   *
   * The family named ARBITRAGE in the same breath as liquid, and their review
   * carries ₹41.08 Cr of it across four funds — the largest ₹30.99 Cr. Not one
   * is in this book, so the map has no arbitrage entry and the screen shows
   * none; saying otherwise would be a claim about a row that does not exist.
   *
   * That is exactly how a typed list dies quietly, so this is the line that
   * speaks up. `cashEquivalentCandidates` reads the NAMES — the one place a
   * name rule is allowed here, because it decides nothing and moves no money —
   * and the first drop bringing a liquid or arbitrage fund this map does not
   * carry FAILS here, naming it, so a human commits it with a citation.
   *
   * It is not a licence to bucket on the pattern. A name matched
   * "Motilal Oswal Active Momentum Fund" to "Motilal Oswal Founders Fund II" on
   * a shared house, and a section heading looks equally authoritative whichever
   * rows sit under it.
   */
  const missed = cashEquivalentCandidates(BOOK_POSITIONS);
  ok("no holding reads as a cash equivalent that the map does not carry",
     missed.length === 0,
     missed.length
       ? `commit these to CASH_EQUIVALENT_KEYS with a citation, or record why they are not cash: ${
           [...new Set(missed.map((p) => `${p.securityKey} ("${p.security}")`))].join("; ")}`
       : "checked every position by name");

  // (g) AND THE DETECTOR CAN ACTUALLY FIRE. A pattern that matched nothing
  // would satisfy (f) for ever, including after the rule was deleted — so it is
  // shown to catch the map's own entries when they are taken out of it.
  const selfFound = cashEquivalentCandidates(
    BOOK_POSITIONS.filter((p) => p.securityKey === "absl-liqf-d-growth")
      .map((p) => ({ ...p, securityKey: "not-in-the-map" })),
  );
  ok("...and the detector is not a pattern that can never match",
     selfFound.length > 0, `${selfFound.length} caught when a mapped key is hidden from it`);
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
