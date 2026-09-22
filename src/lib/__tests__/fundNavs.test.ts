/**
 * ── THE PUBLISHED NAV: WHAT IT MAY MOVE, AND WHAT IT MUST NOT ──────────────
 *
 * Anchored on the two GENERATED artefacts — `glowData.ts` and `fundNavs.ts` —
 * rather than on a fixture, so every expectation is derived on the run and a
 * hand-written pair cannot prove only that two inventions agree.
 *
 * The load-bearing ones are the REFUSALS. An overlay that priced everything,
 * or one that quietly moved a cost, renders a page full of plausible figures
 * and no structural check can see it.
 */
import { readFileSync } from "node:fs";
import { applyFundNavs, fundNavFor, FUND_NAV_COUNT } from "../fundNavs";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";
import { BOOK_POSITIONS } from "@/data/glowData";
import type { Position } from "../types";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};

console.log("──── Fund NAVs");

// ── the join ────────────────────────────────────────────────────────────────
console.log("── every scheme is reached by an identifier, never by a name ──");
ok("the store is not empty — a suite that passes over no input claims nothing",
  BOOK_FUND_NAVS.length > 0, `${BOOK_FUND_NAVS.length} scheme(s), ${FUND_NAV_COUNT} usable`);
ok("every entry carries the ISIN it was joined on",
  BOOK_FUND_NAVS.every((e) => /^IN[EF][0-9A-Z]{9}$/.test(e.isin)));
ok("...and says which tier supplied it",
  BOOK_FUND_NAVS.every((e) => e.isinFrom === "statement" || e.isinFrom === "look-through"));
ok("both tiers are actually in use, so neither is dead",
  BOOK_FUND_NAVS.some((e) => e.isinFrom === "statement") && BOOK_FUND_NAVS.some((e) => e.isinFrom === "look-through"));
ok("every NAV is a positive finite number with its own publication date",
  BOOK_FUND_NAVS.every((e) => Number.isFinite(e.nav) && e.nav > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));

// A REFUSAL MUST NAME ITS CAUSE — the rule `Absent.tsx` enforces on screen,
// applied to the data that decides whether a figure appears at all.
console.log("── a refused scheme carries its NAV and its reason ──");
ok("every scheme refused for value names why",
  BOOK_FUND_NAVS.filter((e) => !e.usableForValue).every((e) => !!e.notUsableReason && e.notUsableReason.length > 20));
ok("...and every usable one carries no reason, so the field cannot drift into prose",
  BOOK_FUND_NAVS.filter((e) => e.usableForValue).every((e) => e.notUsableReason === null));

// ── the basis gate, which is what stops a ten-fold error ────────────────────
console.log("── the units and the NAV are on one basis, or the NAV does not value ──");
const marksOf = (key: string) => BOOK_POSITIONS
  .filter((p) => p.securityKey === key && typeof p.currentPrice === "number")
  .map((p) => p.currentPrice as number);
ok("every scheme cleared for value is within a factor of two of the book's own mark",
  BOOK_FUND_NAVS.filter((e) => e.usableForValue).every((e) => {
    const m = marksOf(e.securityKey);
    return m.length === 0 || m.some((x) => e.nav / x >= 0.5 && e.nav / x <= 2);
  }));
/**
 * LOAD-BEARING, AND STATED AS AN INEQUALITY. On this book DSP Gold is marked
 * ₹151.10 against a NAV of ₹14.7633 — a share-count break. The gate is only
 * worth having if applying it would actually change an answer, so the suite
 * asserts a holding EXISTS that the naive `quantity × NAV` would misprice by
 * more than a factor of two, whether or not the join currently reaches it.
 */
const wouldBreak = BOOK_POSITIONS.filter((p) => {
  const e = fundNavFor(p);
  if (!e || !(p.currentPrice as number) || !(p.quantity > 0)) return false;
  const r = e.nav / (p.currentPrice as number);
  return r < 0.5 || r > 2;
});
if (wouldBreak.length === 0) {
  /**
   * NOT EXERCISED ON THIS BOOK, AND SAID OUT LOUD RATHER THAN PASSED OVER
   * NOTHING. `[].every(...)` is true, so the obvious assertion here would
   * report a working gate on a run where the gate never ran — `golden.mjs`'s
   * rule, arriving through an empty set.
   *
   * Both share-count breaks in this book are the DSP metal ETFs, and AMFI does
   * not list the ISINs their statements carry, so the join never reaches them
   * and the band has no subject. The gate stays because the next drop could
   * bring one that resolves; what cannot be claimed is that this run proved it.
   */
  console.log("NOT CHECKED  the basis gate refuses a share-count break — no scheme in this book both RESOLVES and sits outside the band (the two that break it, the DSP metal ETFs, are not in AMFI's file at all)");
} else {
  ok("no holding the overlay accepts would be mispriced by a factor of two",
    wouldBreak.every((p) => !fundNavFor(p)?.usableForValue),
    `${wouldBreak.length} holding(s) sit outside the band`);
}

// ── the overlay itself ──────────────────────────────────────────────────────
console.log("── the overlay moves the price and the value, and nothing else ──");
const before = BOOK_POSITIONS as Position[];
const after = applyFundNavs(before);
ok("it returns one row per row, in order", after.length === before.length
  && after.every((p, i) => p.securityKey === before[i].securityKey));

const moved = after.filter((p, i) => p.marketValue !== before[i].marketValue);
ok("it moved at least one holding — an overlay that priced nothing is not wired",
  moved.length > 0, `${moved.length} row(s) repriced`);

/**
 * §6, ASSERTED FIELD BY FIELD. This is the whole guarantee: a published price
 * is evidence about what a unit is worth and about nothing else. A future edit
 * that let it touch a cost or a realised figure would render perfectly.
 */
const FROZEN = ["quantity", "costBasis", "realizedPnL", "dividendReceived", "accruedIncome",
  "stCostBasis", "ltCostBasis", "heldSince", "investedOn", "accountId", "securityKey",
  "assetClass", "sector", "isin", "dayChange", "dayChangePct", "prevClose", "live"] as const;
ok("quantity, cost, realised, dividends, dated fields and the INTRADAY fields are untouched",
  after.every((p, i) => FROZEN.every((f) =>
    JSON.stringify((p as Record<string, unknown>)[f]) === JSON.stringify((before[i] as Record<string, unknown>)[f]))));

ok("a repriced row's value is exactly its own units times the published NAV",
  moved.every((p) => {
    const e = fundNavFor(p);
    return !!e && Math.abs(p.marketValue - p.quantity * e.nav) < 0.000001;
  }));
ok("...and its price IS that NAV, never a value divided back out",
  moved.every((p) => p.currentPrice === fundNavFor(p)?.nav));
ok("every repriced row is marked as NAV-priced and carries the publication date",
  moved.every((p) => p.navPriced === true && /^\d{4}-\d{2}-\d{2}$/.test(p.navDate ?? "")));
ok("...and NONE of them is marked live — a NAV is not an intraday quote",
  moved.every((p) => !p.live));

// A LIVE QUOTE WINS. One scheme in this book resolves an NSE symbol, and an
// intraday price is fresher than a NAV published for the previous business day.
const asLive = before.map((p) => (fundNavFor(p)?.usableForValue ? { ...p, live: true } : p));
ok("a holding the quote feed already priced is left alone",
  applyFundNavs(asLive).every((p, i) => p.marketValue === asLive[i].marketValue));

// A HOLDING WITH NO UNITS IS NOT PRICED INTO EXISTENCE. `quantity × NAV` on a
// closed position is a measured zero either way, and overlaying it would mark a
// row the family no longer holds as though it had been revalued.
ok("a holding with no units is never repriced",
  after.every((p, i) => (before[i].quantity > 0) || p.marketValue === before[i].marketValue));

/**
 * ── AND THE MARK IN THE BOOK IS A PRIMITIVE, WHICH THE PAGE CAN NO LONGER SHOW
 *
 * `check:pages` carried a route for this — the one holding whose statement
 * prints a rate its own value column contradicts (ICICI NFT NT 50 DP G: 60.4
 * against an implied 60.4167). The NAV overlay sets `marketValue = quantity ×
 * NAV`, so on every overlaid holding the two are equal BY CONSTRUCTION and
 * that holding is itself overlaid — the rendered page can no longer witness the
 * distinction at all, and a route asserting it would pass trivially.
 *
 * The claim is still true of the BOOK, which is where it was always about: the
 * ingest READS the printed rate rather than deriving it (§4b). So it is
 * asserted here, against `glowData.ts`, and the route was retired rather than
 * left unable to fail.
 */
console.log("── the book's own mark is read, not derived ──");
const primitive = BOOK_POSITIONS.filter((p) =>
  typeof p.currentPrice === "number" && p.quantity > 0
  && Math.abs((p.currentPrice as number) - p.marketValue / p.quantity) >= 0.005);
ok("at least one holding's printed rate is NOT its value over quantity",
  primitive.length > 0,
  primitive.map((p) => `${p.securityKey} ${p.currentPrice} vs ${(p.marketValue / p.quantity).toFixed(4)}`).join("; ") || "none — the ingest may have started deriving it");

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All fund-NAV checks passed.");
