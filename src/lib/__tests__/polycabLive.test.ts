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
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { BOOK_POLYCAB, BOOK_ACCOUNTS } from "@/data/glowData";
import { POLYCAB_LIVE } from "@/data/polycabLive";
import {
  dividendActions, shareCountActions, unclassifiedActions, shareActionsMeasuredNil,
  latestPromoter, entitlements, markedValue, effectiveQuote,
  quoteDating, blockShares, statementDates, balanceReportedOn, paymentDateWhy,
  sourcesFor, witnessCounts, holdingWhy, pledgeWhy, type StatementBalance,
} from "@/lib/polycabLive";
import {
  classifyAction, parseQuote, parseIdentity, parseTickertapeHoldings, pageIdentity, mergePaymentDates,
  sessionPhase, settledQuote, mergePromoterQuarters, actionsRecordCheck,
} from "../../../shared/polycabSources.mjs";

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
/**
 * THE PLEDGE IS STRUCK ON ONE BASIS. `pmPctP` ("Promoter Holding Pledged") is a
 * share of the group's OWN holding; `plPctT` ("Pledged") is a share of the
 * company's TOTAL equity. The parser used to fall back to the second where a
 * block lacked the first, so one column could hold either basis row by row —
 * and the store recorded only "tickertape", so which was which was lost.
 */
{
  const otherBasis = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { securitySummary: { holdings: { holdings: [
      { date: "2026-06-30T00:00:00.000Z", data: { pmPctT: 61.5, plPctT: 1.2, uPlPctT: 60.3 } },
    ] } } } },
  })}</script>`;
  const parsed = parseTickertapeHoldings(otherBasis) as { pledgePct: number | null }[] | null;
  ok("a block carrying only the total-equity `Pledged` field yields NO pledge, never a figure on the other basis",
    parsed?.[0]?.pledgePct === null, JSON.stringify(parsed));
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
  // The statement date comes off the BOOK — the ring-fenced rows' own accounts —
  // never typed: a literal here would pass the day a second statement landed.
  const asOfs = [...new Set(fenced.map((p) => BOOK_ACCOUNTS.find((a) => a.accountId === p.accountId)?.asOf ?? null))];
  const balances = fenced.map((p) => ({
    shares: typeof p.quantity === "number" ? p.quantity : null,
    asOf: BOOK_ACCOUNTS.find((a) => a.accountId === p.accountId)?.asOf ?? null,
  }));
  ok("the book states a report date for the ring-fenced demat", asOfs.length > 0 && asOfs.every((d) => !!d), asOfs.join(", "));
  const ent = entitlements(balances);
  ok("an entitlement is struck for every declared dividend", ent.length === dividendActions().length);
  ok("each amount is the declared per-share times the book's own share count",
    ent.every((e) => e.amount === null
      ? e.action.amountPerShare === null
      : Math.abs(e.amount - (e.action.amountPerShare as number) * bookShares) < 0.01));
  /**
   * THE FLAG IS TWO-SIDED. A statement of holding is a snapshot, so it reports
   * the balance on ITS OWN DATE and on no other — before it as much as after it.
   * This used to be `exDate <= asOf`, which left seven ex-dates from 2019 to 2025
   * unmarked as if a 31 Mar 2026 statement vouched for the balance on each.
   * Re-expressed here from the dates alone rather than read back off the helper.
   */
  ok("an ex-date is unmarked only where every statement is dated ON it — before and after alike",
    ent.every((e) => e.balanceReportedOnExDate === (!!e.action.exDate && balances.every((b) => b.asOf === e.action.exDate))));
  const before = ent.filter((e) => !!e.action.exDate && asOfs.every((d) => (e.action.exDate as string) < (d as string)));
  const afterRows = ent.filter((e) => !!e.action.exDate && asOfs.every((d) => (e.action.exDate as string) > (d as string)));
  ok("…and this book exercises the BEFORE branch, which the one-sided rule left unmarked",
    before.length > 0 && before.every((e) => !e.balanceReportedOnExDate),
    `${before.length} ex-date(s) before the statement, ${before.filter((e) => e.balanceReportedOnExDate).length} unmarked`);
  ok("…and the after branch stays marked",
    afterRows.every((e) => !e.balanceReportedOnExDate), `${afterRows.length} ex-date(s) after it`);
  ok("each entitlement names the statement dates its share count came from",
    ent.every((e) => JSON.stringify(e.statementDates) === JSON.stringify([...asOfs].sort())));
  ok("no entitlement is produced where the share count is unknown",
    entitlements([{ shares: null, asOf: asOfs[0] }]).every((e) => e.amount === null));
}

console.log("\n── a second demat is a second balance, never folded into the first one's date ──");

/**
 * THE MULTI-ROW PATH, ON CONSTRUCTED BALANCES — the book has one demat today, so
 * this is the only place it can be exercised. The page used to take the FIRST
 * row's date for every figure while summing every row's shares: two demats
 * reported on different days would have been totalled as if one statement
 * struck them both.
 */
{
  const two: StatementBalance[] = [{ shares: 100, asOf: "2026-03-31" }, { shares: 50, asOf: "2026-06-30" }];
  const div = dividendActions().find((a) => a.amountPerShare !== null && a.exDate);
  if (div) {
    const e2 = entitlements(two).find((e) => e.action === div);
    ok("the entitlement sums every balance's shares", !!e2 && e2.amount === 150 * (div.amountPerShare as number),
      `${e2?.amount} vs ${150 * (div.amountPerShare as number)}`);
    ok("…names BOTH statement dates", !!e2 && JSON.stringify(e2.statementDates) === JSON.stringify(["2026-03-31", "2026-06-30"]));
    ok("…and is reported on an ex-date only where EVERY balance is dated on it",
      !balanceReportedOn("2026-03-31", two) && balanceReportedOn("2026-03-31", [{ shares: 1, asOf: "2026-03-31" }, { shares: 2, asOf: "2026-03-31" }]));
  } else {
    ok("the store carries a dated dividend to exercise the multi-row path on", false);
  }
  ok("a balance that reports no share count contributes nothing rather than zero",
    blockShares([{ shares: null, asOf: "2026-03-31" }, { shares: 7, asOf: "2026-03-31" }]) === 7
    && blockShares([{ shares: null, asOf: "2026-03-31" }]) === null);
  ok("the statement dates are distinct and ordered",
    JSON.stringify(statementDates([{ shares: 1, asOf: "2026-06-30" }, { shares: 1, asOf: "2026-03-31" }, { shares: 1, asOf: "2026-06-30" }]))
      === JSON.stringify(["2026-03-31", "2026-06-30"]));
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

console.log("\n── when was the price on screen fetched, and was the market open (PC-02, PC-03) ──");

/**
 * INDIA TIME IS UTC+5:30 WITH NO DAYLIGHT SAVING, so these are arithmetic on a
 * fixed offset and the expectations are exact. BSE trades 09:00–16:00 IST on a
 * weekday (pre-open and the closing session included); holidays are not known,
 * which is why the page says a price fetched inside those hours MAY be intraday.
 */
{
  const cases: [string, boolean, string, string][] = [
    ["2026-09-22T15:56:39.171Z", false, "2026-09-22", "21:26"], // a weekday evening — the last session's close
    ["2026-09-22T04:09:20.027Z", true, "2026-09-22", "09:39"],  // mid-morning, in session
    ["2026-09-26T06:00:00.000Z", false, "2026-09-26", "11:30"], // a Saturday
    ["2026-09-23T03:00:00.000Z", false, "2026-09-23", "08:30"], // before the open
    ["2026-09-23T10:29:00.000Z", true, "2026-09-23", "15:59"],  // the last minute in
    ["2026-09-23T10:30:00.000Z", false, "2026-09-23", "16:00"], // the first minute out
    ["2026-09-22T20:00:00.000Z", false, "2026-09-23", "01:30"], // crosses midnight into the NEXT India day
  ];
  for (const [iso, inSession, d, t] of cases) {
    const ph = sessionPhase(iso);
    ok(`${iso} is ${inSession ? "in" : "out of"} session, at ${t} IST on ${d}`,
      ph?.inSession === inSession && ph?.istDate === d && ph?.istTime === t, JSON.stringify(ph));
  }
  ok("an unparseable timestamp has no phase, never a guessed one",
    sessionPhase("not a date") === null && sessionPhase(null) === null && sessionPhase(undefined) === null);
}

{
  const q = POLYCAB_LIVE.quote;
  if (!q) ok("the store carries a quote to date", false, "no quote in the store");
  else {
    const at = (fetchedAt: string | null | undefined) => ({ quote: { ...q, fetchedAt } }) as Pick<typeof POLYCAB_LIVE, "quote">;
    const stored = { status: "stored", reason: "the market is shut" } as const;
    ok("a stored price fetched after the close is the last session's close",
      quoteDating(stored, at("2026-09-22T15:56:39.171Z")).basis === "close");
    ok("a stored price fetched MID-SESSION is marked possibly intraday — never called a close",
      quoteDating(stored, at("2026-09-22T04:09:20.027Z")).basis === "intraday");
    ok("a stored price with no fetch time is undated — never called a close",
      quoteDating(stored, at(null)).basis === "undated" && quoteDating(stored, at(undefined)).basis === "undated");
    ok("a live price fetched in session is live",
      quoteDating({ status: "live", quote: q, retrievedAt: "2026-09-23T05:00:00.000Z" }).basis === "live");
    ok("a live price fetched after the close is that session's close, not 'live'",
      quoteDating({ status: "live", quote: q, retrievedAt: "2026-09-23T12:00:00.000Z" }).basis === "close");
    const loading = quoteDating({ status: "loading" }, at("2026-09-22T15:56:39.171Z"));
    ok("while the live price is fetching, the date shown is the stored price's own",
      loading.basis === "fetching" && loading.istDate === "2026-09-22" && loading.istTime === "21:26", JSON.stringify(loading));
    /**
     * THE COMMITTED QUOTE MUST CARRY ITS OWN DATE. A price with no date under a
     * column reading "last close" is the defect itself: nothing on the page could
     * say which session's close it was.
     */
    const ph = sessionPhase(q.fetchedAt ?? null);
    const quoteFailed = (POLYCAB_LIVE.notes ?? []).some((n) => n.rule === "quote" && n.severity === "fail");
    ok("the stored quote carries the moment it was fetched, and it parses — or the notes say the fetch failed",
      ph !== null || quoteFailed, String(q.fetchedAt));
  }
}

{
  const q = POLYCAB_LIVE.quote;
  if (q) {
    const after = "2026-09-22T15:56:39.171Z", during = "2026-09-23T05:00:00.000Z";
    const settled = { ...q, fetchedAt: after };
    const keep = settledQuote({ ...q, ltp: q.ltp + 1 }, during, settled);
    ok("a fetch during trading hours keeps the settled close already stored",
      keep.quote === settled && keep.note?.severity === "info", JSON.stringify(keep.note));
    const none = settledQuote({ ...q, ltp: q.ltp + 1 }, during, null);
    ok("…and with no settled close stored, keeps the intraday price WITH its fetch time, and warns",
      none.quote.fetchedAt === during && none.quote.ltp === q.ltp + 1 && none.note?.severity === "warn");
    const undatedPrev = settledQuote({ ...q, ltp: q.ltp + 1 }, during, { ...q, fetchedAt: null });
    ok("…and an UNDATED stored price is not treated as a settled close",
      undatedPrev.quote.fetchedAt === during && undatedPrev.note?.severity === "warn");
    const close = settledQuote({ ...q, ltp: q.ltp + 1 }, "2026-09-23T12:00:00.000Z", settled);
    ok("a fetch after the close replaces the stored close, with no note",
      close.quote.fetchedAt === "2026-09-23T12:00:00.000Z" && close.quote.ltp === q.ltp + 1 && close.note === null);
  }
}

console.log("\n── the promoter holding is counted by its witnesses, never claimed (PC-06, PC-07) ──");
{
  const tt = [
    { asOf: "2026-06-30", holdingPct: 61.5, pledgePct: 0 },
    { asOf: "2026-03-31", holdingPct: 61.6, pledgePct: 0 },
  ];
  const sc = [
    { quarter: "Jun 2026", holdingPct: 61.52 },
    { quarter: "Mar 2026", holdingPct: 61.9 },
    { quarter: "Dec 2025", holdingPct: 61.7 },
  ];
  const m = mergePromoterQuarters(tt, sc);
  const by = new Map((m?.quarters ?? []).map((q) => [q.asOf, q]));
  const jun = by.get("2026-06-30"), mar = by.get("2026-03-31"), dec = by.get("2025-12-31");
  ok("a quarter both carry and agree on is published, with TWO witnesses",
    jun?.holdingPct === 61.5 && jun?.witnesses === 2 && jun?.holdingRefused === false, JSON.stringify(jun));
  ok("a quarter they disagree on is refused — and still records that both carried it",
    mar?.holdingPct === null && mar?.holdingRefused === true && mar?.witnesses === 2, JSON.stringify(mar));
  ok("a quarter only one carries has ONE witness, never 'two independent sources'",
    dec?.witnesses === 1 && dec?.holdingPct === 61.7 && dec?.holdingRefused === false, JSON.stringify(dec));
  ok("…and its pledge is absent — never the other source's zero",
    dec?.pledgePct === null && dec?.pledgeSource === null);
  ok("compared counts only the overlap, and disagreed names the refused quarter",
    m?.compared === 2 && m?.disagreed.length === 1, JSON.stringify({ compared: m?.compared, disagreed: m?.disagreed }));
}
{
  const qs = POLYCAB_LIVE.promoterQuarters ?? [];
  const wc = witnessCounts(qs);
  ok("every stored quarter records how many sources carried it",
    qs.length > 0 && qs.every((q) => q.witnesses === 1 || q.witnesses === 2), `${qs.length} quarter(s)`);
  ok("the witness counts partition the stored quarters", wc.both + wc.one === wc.total && wc.total === qs.length, JSON.stringify(wc));
  ok("the store's own agreement count is exactly its two-witness quarters",
    POLYCAB_LIVE.promoterAgreement === null || POLYCAB_LIVE.promoterAgreement.compared === wc.both,
    `${POLYCAB_LIVE.promoterAgreement?.compared} compared against ${wc.both} two-witness quarter(s)`);
  ok("every stored quarter says whether its holding was refused",
    qs.every((q) => q.holdingRefused === true || q.holdingRefused === false || q.holdingRefused === null));
  const base = qs[0];
  if (base) {
    ok("a refused holding says the two sources disagreed",
      /disagreed/.test(holdingWhy({ ...base, holdingPct: null, holdingRefused: true })));
    ok("a holding no source carried says so — and does not claim a disagreement",
      !/disagreed/.test(holdingWhy({ ...base, holdingPct: null, holdingRefused: false }))
      && /no source/.test(holdingWhy({ ...base, holdingPct: null, holdingRefused: false })));
    ok("a stored quarter that does not record which says it cannot tell",
      /does not say which/.test(holdingWhy({ ...base, holdingPct: null, holdingRefused: null })));
  }
  /**
   * THE PLEDGE'S DASH IS A STATEMENT ABOUT WHAT THIS PAGE READS. It said "no
   * source published an encumbrance figure", which is false of a listed company
   * that files one every quarter.
   */
  const carried = qs.filter((q) => q.pledgePct !== null);
  const dashed = qs.filter((q) => q.pledgePct === null);
  const source = POLYCAB_LIVE.sources.find((s) => s.feeds?.includes("promoter") && /tickertape/i.test(s.name))?.name ?? "Tickertape";
  ok("no dashed pledge claims that no source published one",
    dashed.every((q) => !/no source published/i.test(pledgeWhy(q, qs, source))));
  ok("every dashed pledge says the company's own disclosure is not read by this page",
    dashed.every((q) => /company's own quarterly encumbrance disclosure is not read/.test(pledgeWhy(q, qs, source))));
  const older = dashed.filter((q) => carried.length && q.asOf < carried.map((x) => x.asOf).sort()[0]);
  ok("a pledge older than the source's reach names that reach, counted off the store",
    older.every((q) => pledgeWhy(q, qs, source).includes(`reaches back only ${carried.length} quarter`)
      && pledgeWhy(q, qs, source).includes(source)),
    `${older.length} older quarter(s), ${carried.length} carried`);
  /** A parser that took a figure on another basis for this one is the defect PC-07 names. */
  const otherBasis = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { securitySummary: { holdings: { holdings: [
      { date: "2026-06-30T00:00:00.000Z", data: { pmPctT: 61.5, pmPctP: 0.4, plPctT: 1.2 } },
    ] } } } },
  })}</script>`;
  const parsed = parseTickertapeHoldings(otherBasis) as { pledgePct: number | null }[] | null;
  ok("the pledge is read from the group-holding basis the column is headed with",
    parsed?.[0]?.pledgePct === 0.4, JSON.stringify(parsed));
}

console.log("\n── a whole record is checked, never assumed from a non-empty one (PC-14) ──");
{
  const a = (exDate: string, purpose = "Dividend - Rs. - 10.0000") => ({
    exDate, kind: "dividend" as const, purpose, amountPerShare: 10, ratio: null,
    recordDate: null, bookClosureFrom: null, bookClosureTo: null, paymentDate: null,
  });
  const recent = [{ Ex_date: "19 Jun 2026" }];
  const full = [a("2026-06-19"), a("2025-06-24")];
  ok("an empty fetch is never whole", actionsRecordCheck([], null, recent).whole === false);
  ok("a fetch that reaches the newest recent action and loses nothing is whole",
    actionsRecordCheck(full, full, recent).whole === true);
  const lost = actionsRecordCheck([a("2026-06-19")], full, recent);
  ok("a fetch that lost a row a previous refresh stored is NOT whole — and the lost row is kept",
    lost.whole === false && (lost.merged ?? []).some((x) => x.exDate === "2025-06-24"), lost.why ?? "");
  ok("a fetch that stops short of the exchange's most recent action is NOT whole",
    actionsRecordCheck([a("2025-06-24")], null, recent).whole === false);
  ok("with no recent-actions record to check against, the claim is not made",
    actionsRecordCheck(full, full, null).whole === false && actionsRecordCheck(full, full, []).whole === false);
  ok("a row the exchange rewords is the same row — still whole",
    actionsRecordCheck([a("2026-06-19", "Final Dividend - Rs. - 10.0000"), a("2025-06-24")], full, recent).whole === true);
  ok("the committed record claims to be whole only where it carries an action at all",
    !POLYCAB_LIVE.actionsComplete || (POLYCAB_LIVE.corporateActions?.length ?? 0) > 0);
}

console.log("\n── a dashed payment date names its own cause (PC-08) ──");
{
  const mk = (exDate: string, paymentDate: string | null) => ({ exDate, paymentDate, kind: "dividend" }) as never;
  const all = [mk("2025-06-24", "2025-07-31"), mk("2024-07-09", null), mk("2023-06-21", "2023-07-30"), mk("2019-06-18", null)];
  ok("a dash INSIDE the span the record dates says it covered the period and printed no date",
    /covers this period/.test(paymentDateWhy(all[1], all)));
  ok("a dash OLDER than every dated row says the record does not reach it",
    /older than any it dates/.test(paymentDateWhy(all[3], all)));
  ok("a record that dated nothing says so, rather than guessing a reach",
    /carried no date for any action/.test(paymentDateWhy(all[1], [mk("2024-07-09", null)])));
  // The same two branches, struck on the committed record.
  const store = POLYCAB_LIVE.corporateActions ?? [];
  const dated = store.filter((x) => x.paymentDate && x.exDate).map((x) => x.exDate as string).sort();
  const dashedStore = store.filter((x) => x.kind === "dividend" && !x.paymentDate && x.exDate);
  ok("on the committed record every dashed payment date carries the reason its position implies",
    dashedStore.every((x) => (dated.length && (x.exDate as string) < dated[0])
      ? /older than any it dates/.test(paymentDateWhy(x, store))
      : /covers this period|carried no date/.test(paymentDateWhy(x, store))),
    `${dashedStore.length} dashed payment date(s)`);
}

console.log("\n── each table credits the sources its own figures came from (PC-18) ──");
{
  const srcs = POLYCAB_LIVE.sources;
  ok("every stored source says which of the page's tables it feeds",
    srcs.length > 0 && srcs.every((s) => Array.isArray(s.feeds) && s.feeds.length > 0));
  const actions = sourcesFor("actions"), promoter = sourcesFor("promoter");
  ok("the corporate-actions line credits only the sources that feed it",
    actions.length > 0 && actions.every((s) => s.feeds?.includes("actions")));
  ok("…so a promoter-only source is never credited for the dividends",
    srcs.filter((s) => !s.feeds?.includes("actions")).every((s) => !actions.includes(s)));
  ok("the promoter line credits the promoter sources, and only them",
    promoter.length > 0 && promoter.every((s) => s.feeds?.includes("promoter")));
  ok("a source stored before `feeds` existed is credited everywhere, as the page always did",
    sourcesFor("actions", [{ name: "x", url: "u", carries: "c" }]).length === 1);
}

console.log("\n── the committed store and report are what the builder renders from the store ──");
{
  /**
   * `--offline --check` fetches nothing: it re-renders `polycabLive.ts` and
   * `docs/POLYCAB-LIVE.md` from the committed record through the builder's own
   * renderers and reports whether either would change. A renderer edited without
   * regenerating — or a hand-edited generated file — fails here.
   */
  const root = path.resolve(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../..");
  const r = spawnSync(process.execPath, [path.join(root, "scripts/build-polycab-live.mjs"), "--offline", "--check"], {
    cwd: root, encoding: "utf8",
  });
  ok("the builder's offline re-render of the committed store changes nothing",
    r.status === 0 && /No change\./.test(r.stdout), `${r.status} ${(r.stdout + r.stderr).trim().slice(0, 300)}`);
  /**
   * …AND WHAT IT RENDERS SAYS WHAT THE STORE CARRIES. The report printed a dash
   * in its Record column over the five book-closure windows the exchange DID
   * publish, and raw floats (`61.461685149737356%`) where the page prints two
   * decimals. Struck on the committed report against the committed store, so a
   * renderer reverted AND regenerated still fails.
   */
  const doc = readFileSync(path.join(root, "docs/POLYCAB-LIVE.md"), "utf8");
  const rows = doc.split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l));
  const windows = (POLYCAB_LIVE.corporateActions ?? []).filter((x) => !x.recordDate && x.bookClosureFrom && x.bookClosureTo);
  ok("the report prints the book-closure window wherever the exchange published one instead of a record date",
    windows.every((x) => rows.some((l) => l.startsWith(`| ${x.exDate} |`) && l.includes(`book closure ${x.bookClosureFrom} → ${x.bookClosureTo}`))),
    `${windows.length} window(s)`);
  const pcts = doc.match(/-?\d[\d.]*%/g) ?? [];
  ok("the report prints every percentage at two decimals, never a raw float",
    pcts.length > 0 && pcts.every((p) => /^-?\d+\.\d{2}%$/.test(p)), pcts.filter((p) => !/^-?\d+\.\d{2}%$/.test(p)).join(", "));
}

/** A run that published nothing at all is a finding, not a pass. */
ok("the store is not empty — a suite that passes over no input claims nothing",
  (POLYCAB_LIVE.corporateActions?.length ?? 0) > 0 || (POLYCAB_LIVE.promoterQuarters?.length ?? 0) > 0,
  `${POLYCAB_LIVE.corporateActions?.length ?? 0} action(s), ${POLYCAB_LIVE.promoterQuarters?.length ?? 0} quarter(s)`);

console.log(fails === 0 ? "\nAll Polycab live-record checks passed." : `\n${fails} FAILED`);
if (fails) process.exit(1);
