// THE LIVE COMPANY-LEVEL RECORD BEHIND THE RING-FENCED HOLDING.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   *"Every single data point in the Polycab Page should be live and
//    automatically updated everyday, there must be no placeholders. Daily fetch
//    all such information for the Polycab promoter activity,
//    dividend/split/bonus/pledge."*
//
// `npm run build-polycab` commits `src/data/polycabLive.ts` every morning and
// `/api/polycab` serves the intraday price on top of it. Every failure this file
// exists for is INVISIBLE ON A RENDERED PAGE, which is the whole reason it is
// written as arithmetic rather than left to the sweep:
//
//   • a figure about the WRONG COMPANY. The store is keyed on a BSE scrip code,
//     and a wrong one answers with a complete, correct, well-formed record. This
//     is not hypothetical: probing moneycontrol for Polycab during the same
//     session returned a page whose promoter holding was 55.03% against 61.5%.
//     Nothing on screen would have caught it.
//   • a PLEDGE fabricated as 0. A promoter block is the single worst place in
//     this book to invent a nil, and `0` and `null` render as `0.0%` and `—`
//     side by side in a way only a type check can tell apart.
//   • a MEASURED NIL claimed on an INCOMPLETE record. "No bonus has ever been
//     declared" and "the fetch was truncated" produce the identical empty list.
//   • the company-level record LEAKING into the family's own figures, which
//     would put a ₹12,351 Cr promoter block back into a book the family asked
//     to have it out of.
//
// ── THE ANCHORS ARE TWO GENERATED ARTEFACTS, NEVER TYPED-IN FIGURES ─────────
//
// `glowData.ts` comes from `source/` through `build-book`; `polycabLive.ts`
// comes from the exchange through `build-polycab`. They move on their own
// schedules — the second one DAILY — so every expectation below is either
// derived from both on this run or written as a RELATION that survives either
// moving. A literal share count or dividend here would fail the first morning
// the company declared one.
import { BOOK_POLYCAB } from "@/data/glowData";
import { POLYCAB_LIVE } from "@/data/polycabLive";
import {
  dividendActions, shareCountActions, unclassifiedActions, shareActionsMeasuredNil,
  latestPromoter, entitlements, markedValue, effectiveQuote,
} from "@/lib/polycabLive";
import { classifyAction, parseQuote, parseIdentity, parseTickertapeHoldings, pageIdentity, mergePaymentDates } from "../../../shared/polycabSources.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const fenced = BOOK_POLYCAB;
const bookShares = fenced.reduce((a, p) => a + (p.quantity ?? 0), 0);

console.log("── the store describes the holding the BOOK carries, and nothing else ──");

/**
 * THE IDENTITY GATE, ASSERTED FROM THE BOOK'S SIDE.
 *
 * The builder refuses to publish anything from the exchange unless the ISIN it
 * echoes equals the one on the ring-fenced holding. That gate lives in a script
 * that runs daily and unattended, so the thing to check HERE is the thing the
 * gate is supposed to have guaranteed: that the committed store is about this
 * book's own security. A store rebuilt against a different scrip passes every
 * structural check in this file and fails this one.
 */
ok("the book carries a ring-fenced holding to describe", fenced.length > 0, `${fenced.length} row(s)`);
ok("the store's ISIN is the one the book carries",
  !!POLYCAB_LIVE.bookIsin && POLYCAB_LIVE.bookIsin === String(fenced[0]?.isin ?? "").toUpperCase(),
  `${POLYCAB_LIVE.bookIsin} vs ${fenced[0]?.isin}`);
ok("…and the exchange echoed that same ISIN back",
  POLYCAB_LIVE.identity === null || POLYCAB_LIVE.identity.isin === POLYCAB_LIVE.bookIsin,
  POLYCAB_LIVE.identity ? POLYCAB_LIVE.identity.isin : "no identity stored");
ok("the store's share count is the book's own",
  POLYCAB_LIVE.bookShares === null || POLYCAB_LIVE.bookShares === bookShares,
  `${POLYCAB_LIVE.bookShares} vs ${bookShares}`);

console.log("\n── an absent figure is null, and a pledge is never a fabricated zero ──");

/**
 * THE MOST CONSEQUENTIAL ZERO IN THIS BOOK.
 *
 * `0` and `null` are one character apart in a builder and render as `0.0%` and
 * `—` on screen. On a promoter block, a pledge nobody measured printed as nil is
 * the worst available fabrication — which is why the store types it
 * `number | null` and why a quarter is required to carry a SOURCE for any pledge
 * figure it publishes. A `0` with no source behind it is a defaulted zero.
 */
for (const q of POLYCAB_LIVE.promoterQuarters ?? []) {
  ok(`${q.asOf}: a published pledge names the source that carried it`,
    q.pledgePct === null ? q.pledgeSource === null : typeof q.pledgeSource === "string" && q.pledgeSource.length > 0,
    `pledge ${q.pledgePct} from ${q.pledgeSource ?? "nothing"}`);
  ok(`${q.asOf}: neither figure is NaN or a coerced string`,
    (q.holdingPct === null || Number.isFinite(q.holdingPct)) && (q.pledgePct === null || Number.isFinite(q.pledgePct)));
}

/** A parser that coerces a missing field to 0 is the failure; assert it does not. */
ok("the parser yields null rather than 0 for a quarter carrying no figures",
  parseTickertapeHoldings(JSON.stringify({})) === null);
{
  const withNulls = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { securitySummary: { holdings: { holdings: [
      { date: "2026-06-30T00:00:00.000Z", data: { pmPctT: 61.5 } },          // no pledge field at all
      { date: "2026-03-31T00:00:00.000Z", data: { pmPctT: 61.4, pmPctP: 0 } }, // a PUBLISHED zero
    ] } } } },
  })}</script>`;
  // Selected BY DATE rather than by position: the parser sorts newest-first, so
  // an index here would encode the sort order into a claim about null-vs-zero
  // and break the moment either changed. (It did, on the first run of this file.)
  const parsed = parseTickertapeHoldings(withNulls) as { asOf: string; pledgePct: number | null }[] | null;
  const at = (d: string) => parsed?.find((q) => q.asOf === d);
  ok("a quarter whose block omits the pledge yields null, not 0",
    at("2026-06-30")?.pledgePct === null, JSON.stringify(at("2026-06-30")));
  ok("…and a quarter that PUBLISHES 0 keeps its measured zero",
    at("2026-03-31")?.pledgePct === 0, JSON.stringify(at("2026-03-31")));
}

console.log("\n── a measured nil is gated on a COMPLETE record ──");

/**
 * "No bonus, split or spin-off has ever been declared" is the one claim on this
 * page that is stronger than an absence, and it is only true where the record
 * was fetched WHOLE. A truncated response and a company that never declared one
 * produce the identical empty list, so the claim rests on `actionsComplete` —
 * and this asserts the implication holds in the direction that matters: the page
 * can never make that claim off a record the builder did not vouch for.
 */
ok("the measured nil is never claimed on an incomplete record",
  !shareActionsMeasuredNil() || POLYCAB_LIVE.actionsComplete === true);
ok("…and it is never claimed while a share-count action is on the record",
  !shareActionsMeasuredNil() || shareCountActions().length === 0);
ok("every action carries the exchange's own words, so a classification can be challenged",
  (POLYCAB_LIVE.corporateActions ?? []).every((a) => typeof a.purpose === "string" && a.purpose.length > 0));

/**
 * THE CLASSIFIER, ON THE SHAPES THE EXCHANGE ACTUALLY PRINTS — and on the one
 * that would fabricate a per-share amount. `Bonus issue 1:1` contains digits, so
 * a naive number-scrape reports a bonus "worth ₹1". The amount is anchored on
 * the currency marker for exactly that reason.
 */
{
  const d = classifyAction("Final Dividend - Rs. - 47.0000");
  ok("a dividend classifies, with its amount", d.kind === "dividend" && d.amountPerShare === 47, JSON.stringify(d));
  const b = classifyAction("Bonus issue 1:1");
  ok("a bonus classifies, with a ratio and NO amount",
    b.kind === "bonus" && b.ratio === "1:1" && b.amountPerShare === null, JSON.stringify(b));
  const s = classifyAction("Stock  Split From Rs.10/- to Rs.2/-");
  ok("a split classifies, and its ratio is not read as an amount",
    s.kind === "split" && s.amountPerShare === null, JSON.stringify(s));
  const u = classifyAction("Scheme of Amalgamation");
  ok("an unrecognised purpose is carried, never dropped and never guessed",
    u.amountPerShare === null && u.purpose === "Scheme of Amalgamation");
}
ok("nothing the classifier could not place is in the share-count table",
  shareCountActions().every((a) => a.kind === "bonus" || a.kind === "split" || a.kind === "spinoff"));
ok("…and what it could not place is counted rather than hidden",
  unclassifiedActions().every((a) => a.kind === "other" || a.kind === "rights"));

console.log("\n── the entitlement is DERIVED, and says what it assumes ──");

/**
 * The exchange states an amount PER SHARE. The rupee figure for this holding is
 * that times a share count taken from ONE statement at ONE date — so an ex-date
 * the statement does not span is an entitlement computed on a balance nobody
 * reported on that day. The flag is what lets the page say so; these assert it
 * is set from the dates rather than defaulted, in both directions.
 */
{
  const asOf = "2026-03-31";
  const ent = entitlements(bookShares, asOf);
  ok("an entitlement is struck for every declared dividend", ent.length === dividendActions().length);
  ok("each amount is the declared per-share times the book's own share count",
    ent.every((e) => e.amount === null
      ? e.action.amountPerShare === null
      : Math.abs(e.amount - (e.action.amountPerShare as number) * bookShares) < 0.01));
  ok("an ex-date the statement does not span is flagged, not silently multiplied",
    ent.every((e) => e.exDateWithinStatement === (!!e.action.exDate && e.action.exDate <= asOf)));
  const after = ent.filter((e) => !e.exDateWithinStatement);
  ok("…and this book actually exercises that branch",
    after.length > 0 || dividendActions().every((a) => (a.exDate ?? "") <= asOf),
    `${after.length} action(s) fall outside the statement's date`);
  ok("no entitlement is produced where the share count is unknown",
    entitlements(null, asOf).every((e) => e.amount === null));
}

console.log("\n── the live layer may move the PRICE and nothing else ──");

/**
 * §6, applied to this page. A quote is not evidence about a dividend, a pledge
 * or a share count, so the only figure the feed is allowed to change is the
 * mark and what is derived from it. `effectiveQuote` is the seam, and a stored
 * fallback must be a real dated figure rather than an empty one.
 */
{
  const live = effectiveQuote({ status: "live", quote: { ltp: 1, prevClose: 1, open: null, high: null, low: null, change: 0, changePct: 0, printedChange: null, printedChangePct: null }, retrievedAt: "" });
  ok("a live response is used as the mark", live.live && live.quote?.ltp === 1);
  const stored = effectiveQuote({ status: "stored", reason: "x" });
  ok("a failed feed falls back to the committed close rather than to nothing",
    stored.live === false && stored.quote === POLYCAB_LIVE.quote);
  ok("a still-loading feed is not reported as live",
    effectiveQuote({ status: "loading" }).live === false);
}
ok("the marked value is the share count at the mark, and null where either is",
  markedValue(null, POLYCAB_LIVE.quote) === null
  && (POLYCAB_LIVE.quote === null
    ? markedValue(bookShares, null) === null
    : markedValue(bookShares, POLYCAB_LIVE.quote) === bookShares * POLYCAB_LIVE.quote.ltp));

/**
 * THE DAY CHANGE IS DERIVED FROM TWO FIGURES THE STORE ALSO CARRIES, and checked
 * against the exchange's own printed one. `/api/indices` once differenced a level
 * against its OWN session and printed +0.00% across four indices, with a residual
 * of a few paise as the only tell — so the derived and the printed are both kept
 * and are required to agree.
 */
if (POLYCAB_LIVE.quote) {
  const q = POLYCAB_LIVE.quote;
  ok("the day change is last-traded less previous close",
    q.change === null || q.prevClose === null || Math.abs(q.change - (q.ltp - q.prevClose)) < 0.005,
    `${q.change} vs ${q.ltp} − ${q.prevClose}`);
  ok("…and it reconciles with the exchange's own printed change",
    q.change === null || q.printedChange === null || Math.abs(q.change - q.printedChange) <= 0.05,
    `derived ${q.change} vs printed ${q.printedChange}`);
  ok("a quote whose previous close is absent carries no change rather than a zero",
    q.prevClose !== null || q.change === null);
}

/** The parser refuses a response with no price rather than returning a zero. */
ok("a quote response with no LTP yields null, never 0",
  parseQuote({ CurrRate: {}, Header: { PrevClose: "8360" } }) === null);
ok("an identity response with no well-formed ISIN yields null",
  parseIdentity({ SecurityId: "POLYCAB", ISIN: "" }) === null
  && parseIdentity({ ISIN: "NOTANISIN" }) === null);

console.log("\n── the identity gate refuses a weaker match than the book's own ──");
ok("a page carrying the ISIN passes on the strongest tier",
  pageIdentity(`…${POLYCAB_LIVE.bookIsin}…`, POLYCAB_LIVE.bookIsin) === "isin");
ok("a page carrying only the scrip code and symbol passes on the weaker tier",
  pageIdentity("…542652… POLYCAB …", POLYCAB_LIVE.bookIsin) === "scrip");
ok("a page carrying neither is refused outright",
  pageIdentity("a page about another company entirely", POLYCAB_LIVE.bookIsin) === null);

/** The payment-date join only ever FILLS an empty field, and never overwrites. */
{
  const base = [{ exDate: "2026-06-19", paymentDate: null }, { exDate: "2025-06-24", paymentDate: "2025-01-01" }] as never[];
  const merged = mergePaymentDates(base, [
    { Ex_date: "19 Jun 2026", PAYMENT_DATE: "2026-07-30T00:00:00" },
    { Ex_date: "24 Jun 2025", PAYMENT_DATE: "2025-07-31T00:00:00" },
  ]);
  ok("an empty payment date is filled from the short record",
    (merged[0] as { paymentDate: string | null }).paymentDate === "2026-07-30");
  ok("…and a payment date already present is never overwritten",
    (merged[1] as { paymentDate: string | null }).paymentDate === "2025-01-01");
}

console.log("\n── and none of it reaches the family's own figures ──");

/**
 * THE RING-FENCE, FROM THE OTHER SIDE. The whole point of `BOOK_POLYCAB` is that
 * this holding is in no book total; the whole point of this store is that it
 * describes the COMPANY. Neither may acquire the other's job, so: the store
 * carries no position-shaped field that could be summed into a portfolio, and
 * the page's own market value still comes from the book rather than from a quote.
 */
ok("the store carries no cost, no portfolio weight and no book total",
  !("costBasis" in POLYCAB_LIVE) && !("weight" in POLYCAB_LIVE) && !("totalValue" in POLYCAB_LIVE));
ok("the promoter figures are percentages of the GROUP, never of this book",
  (POLYCAB_LIVE.promoterQuarters ?? []).every((q) =>
    (q.holdingPct === null || (q.holdingPct >= 0 && q.holdingPct <= 100))
    && (q.pledgePct === null || (q.pledgePct >= 0 && q.pledgePct <= 100))));

/**
 * THE LATEST QUARTER IS THE NEWEST ONE CARRYING A FIGURE, not simply the first
 * row — a store whose newest quarter had both figures refused would otherwise
 * report the page as having no promoter disclosure at all.
 */
{
  const latest = latestPromoter();
  const qs = POLYCAB_LIVE.promoterQuarters ?? [];
  ok("the quarters are newest-first",
    qs.every((q, i) => i === 0 || qs[i - 1].asOf >= q.asOf));
  ok("the latest promoter row is the newest carrying a figure",
    latest === null || (latest.holdingPct !== null || latest.pledgePct !== null));
}

/** A run that published nothing at all is a finding, not a pass. */
ok("the store is not empty — a suite that passes over no input claims nothing",
  (POLYCAB_LIVE.corporateActions?.length ?? 0) > 0 || (POLYCAB_LIVE.promoterQuarters?.length ?? 0) > 0,
  `${POLYCAB_LIVE.corporateActions?.length ?? 0} action(s), ${POLYCAB_LIVE.promoterQuarters?.length ?? 0} quarter(s)`);

console.log(fails === 0 ? "\nAll Polycab live-record checks passed." : `\n${fails} FAILED`);
if (fails) process.exit(1);
