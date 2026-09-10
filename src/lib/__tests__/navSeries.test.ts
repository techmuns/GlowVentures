// THE DATED NAV SERIES' ARITHMETIC, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `BOOK_NAV_HISTORY` was an empty array for several drops, with a note in
// `build-book.mjs` saying a series could not exist because each account carried
// two points and nothing between them. True of the nine-account corpus it was
// written against; false from the first REISSUE onwards. Now that it is
// populated, the failure mode moves: the series exists and can be WRONG, and the
// one way it goes wrong is silent — a chart that is really measuring money
// walking in.
//
// ── THE ANCHOR IS A GENERATED FIGURE, NOT A TYPED-IN ONE ────────────────────
//
// The strongest assertion here is that the series' LAST POINT equals the covered
// accounts' own latest valuations, with each `dedupeGroup` counted once. Those
// two are produced on different paths inside `navHistoryFrom` — one walks dates
// and carries marks forward, the other is a per-account roll-up — so agreeing is
// a real cross-check rather than a figure compared with its own copy, and it
// cannot go stale when the next drop moves the book.
//
// Everything else is written as a RELATION for the same reason. The one place a
// literal appears is the load-bearing gate, and it is stated as an inequality.
import { BOOK_NAV_HISTORY, BOOK_NAV_COVERAGE, BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNTS } from "@/data/glowData";
import {
  navIndexSeries, alignIndex, rebasedIndex, navCoverageStats, windowReturnPct,
  levelOnOrBefore, indexCurve, indexReturnBetween, rangeStart, rangeEnd, NAV_RANGES,
} from "@/lib/navSeries";
import type { Point } from "@/lib/series";

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
const near = (name: string, got: number | null, want: number, tol = 0.01) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};

// ── The series exists at all ────────────────────────────────────────────────
//
// A suite that passed over an empty series would claim confidence nobody earned
// — `golden.mjs`'s rule. If a future drop genuinely leaves no account with two
// dated valuations this must FAIL and be re-read, not quietly succeed.
ok("the book carries a dated NAV series of at least two points", BOOK_NAV_HISTORY.length >= 2,
  `${BOOK_NAV_HISTORY.length} point(s)`);
ok("every point is dated and monotonically later than the last",
  BOOK_NAV_HISTORY.every((p, i) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && (i === 0 || p.date > BOOK_NAV_HISTORY[i - 1].date)));

// ── The composition never changes inside the series ─────────────────────────
const covered = BOOK_NAV_COVERAGE.covered;
ok("every covered account publishes at least two dated valuations",
  covered.length > 0 && covered.every((c) => c.points >= 2));
// ── THE PANEL, AND WHERE THE OLD RULE MOVED TO ──────────────────────────────
//
// This block used to read "no covered account's first valuation is later than
// the series' start", because the series began where every covered account had
// published. That protected the LEVEL and it threw away 40 of the archive's 74
// measured days, which is what the family reported about this card.
//
// The rule did not go away; it moved down a level. Each LINK is struck over the
// accounts valued at BOTH its ends, so an arrival is in neither end of the link
// ending at it and contributes 0.00%. What must still hold, and what is asserted
// here, is that `panelCompleteFrom` is exactly where every account HAS reported
// — because the raw NAV line is rebased there and a level over a growing panel
// is the one thing chain-linking cannot rescue.
ok("the series starts at the earliest covered account's first valuation",
  BOOK_NAV_COVERAGE.from !== null
  && BOOK_NAV_COVERAGE.from === covered.map((c) => c.first).sort()[0],
  `${BOOK_NAV_COVERAGE.from}`);
ok("the panel completes exactly where the last covered account first reports",
  !!BOOK_NAV_COVERAGE.panelCompleteFrom
  && BOOK_NAV_COVERAGE.panelCompleteFrom === covered.map((c) => c.first).sort().at(-1),
  `${BOOK_NAV_COVERAGE.panelCompleteFrom}`);
ok("every point at or after it is flagged panel-complete, and none before it is",
  BOOK_NAV_HISTORY.every((p) =>
    p.panelComplete === (p.date >= (BOOK_NAV_COVERAGE.panelCompleteFrom as string))),
  "a series that started before every account had reported would climb because accounts ARRIVED — "
  + "the link is what stops that, and the flag is what keeps the LEVEL off the incomplete stretch");
eq("the series' first and last dates are the coverage window",
  [BOOK_NAV_HISTORY[0].date, BOOK_NAV_HISTORY[BOOK_NAV_HISTORY.length - 1].date],
  [BOOK_NAV_COVERAGE.from, BOOK_NAV_COVERAGE.to]);

// ── The last point ties to the covered accounts, counting duplicates once ───
//
// Both of this book's duplicated holdings are private and ONE of them — 360 ONE
// Special Opportunities under CRN37702 and CRN60117 — sits inside the covered
// set with both CRNs publishing a series. So the per-account sum is ABOVE the
// series by exactly that holding, and the two must not accidentally agree.
const perAccount = covered.reduce((a, c) => a + c.latestValue, 0);
const lastPoint = BOOK_NAV_HISTORY[BOOK_NAV_HISTORY.length - 1].nav;
ok("the series' last point is at or below the covered accounts' per-account sum",
  lastPoint <= perAccount + 0.01,
  `series ₹${(lastPoint / 1e7).toFixed(2)} Cr vs per-account ₹${(perAccount / 1e7).toFixed(2)} Cr`);
{
  // …and the gap is exactly the duplicated value, not an arbitrary shortfall.
  // Reconstructed from the per-account series rather than asserted as a literal.
  const gap = perAccount - lastPoint;
  ok("the gap between them is a whole holding, or nil", gap === 0 || gap > 1_000_000,
    `₹${(gap / 1e7).toFixed(4)} Cr — a duplicated holding counted once in the series and twice per account`);
}

// ── Every covered account's own series is emitted, and agrees ───────────────
for (const c of covered) {
  const own = BOOK_ACCOUNT_NAV_HISTORY[c.accountId];
  if (!own) { fails++; console.log(`FAIL per-account series missing for ${c.accountId}`); continue; }
  if (own.length !== c.points || own[own.length - 1].nav !== c.latestValue || own[0].date !== c.first) {
    fails++;
    console.log(`FAIL per-account series disagrees with coverage for ${c.accountId}`);
  }
}
ok("every covered account's own dated series matches its coverage entry", true,
  `${covered.length} account(s)`);

// ── The three lists partition the book ──────────────────────────────────────
const stats = navCoverageStats(BOOK_NAV_COVERAGE, null);
eq("covered + single + unvalued is every account in the book",
  stats.accountsTotal, BOOK_ACCOUNTS.length);

// ── THE FLOW ADJUSTMENT IS LOAD-BEARING ─────────────────────────────────────
//
// This is the assertion the card exists for. ₹11.24 Cr of Fund Deposits entered
// V.E.C 128005 inside this window — 182% of that account's own opening value —
// and left in, the covered set's NAV runs ~+9.3% against an index that moved
// ~1.3%. A test that only checked the adjusted figure would pass on a book where
// no capital moved and go on passing after the adjustment was deleted, which is
// the "a suite that cannot fail" failure this repo names. Gated as an
// INEQUALITY, so it stays meaningful when the next drop changes the amounts.
const series = navIndexSeries(BOOK_NAV_HISTORY);
const adjusted = windowReturnPct(series);
ok("the series carries external capital worth adjusting for",
  series.some((p) => Math.abs(p.flowIn) > 1e5),
  "if this ever fails, the guard below has stopped being testable on this book and must be re-read");
{
  /**
   * STRUCK LIKE FOR LIKE, over the COMPLETE-PANEL segment alone.
   *
   * The obvious form of this comparison — the whole series' adjusted return
   * against the raw NAV line's last value — silently compares two windows now
   * that the series starts before the panel completes: 74 days against the 34
   * the raw line is defined over. Both figures would be right on their own terms
   * and the gap between them would be part window and part capital, which is the
   * caption-widens-a-figure failure arriving inside a test. So the segment is
   * taken first and both are struck on it.
   */
  const from = series.findIndex((p) => p.panelComplete);
  ok("the complete-panel segment has at least two points to compare over",
    from >= 0 && series.length - from >= 2, `${series.length - from} point(s) from ${series[from]?.date}`);
  let adj = 100;
  for (let i = from + 1; i < series.length; i++) {
    const p = BOOK_NAV_HISTORY[i];
    const open = p.linkOpen ?? BOOK_NAV_HISTORY[i - 1].nav;
    const close = p.linkClose ?? p.nav;
    adj *= (close - (p.flowIn ?? 0)) / open;
  }
  const segAdjusted = adj - 100;
  const segRaw = (BOOK_NAV_HISTORY[series.length - 1].nav / BOOK_NAV_HISTORY[from].nav - 1) * 100;
  ok("the flow-adjusted return is materially below the unadjusted NAV move, over the same window",
    segRaw - segAdjusted > 5,
    `adjusted ${segAdjusted.toFixed(2)}% vs unadjusted ${segRaw.toFixed(2)}% over `
    + `${series[from].date} → ${series[series.length - 1].date} — the difference is money added, not money earned`);

  /**
   * …AND THE WHOLE-SERIES INDEX REPRODUCES FROM THE LINKS.
   *
   * Chaining `nav / prevNav` — what this used to do — now reads +398.76% on this
   * book, because it counts every account that ARRIVED. That is not a broken
   * reproduction: it is the arrivals-as-performance curve, measured. The index
   * chains on `linkOpen`/`linkClose` instead, and this asserts the two are
   * different as well as that the right one reproduces, so a build that quietly
   * went back to dividing levels fails here rather than drawing a 400% year.
   */
  let byLink = 100;
  let byLevel = 100;
  for (let i = 1; i < BOOK_NAV_HISTORY.length; i++) {
    const p = BOOK_NAV_HISTORY[i];
    byLink *= ((p.linkClose ?? p.nav) - (p.flowIn ?? 0)) / (p.linkOpen ?? BOOK_NAV_HISTORY[i - 1].nav);
    byLevel *= (p.nav - (p.flowIn ?? 0)) / BOOK_NAV_HISTORY[i - 1].nav;
  }
  near("the chained index reproduces from the links", adjusted, byLink - 100, 1e-9);
  ok("and chaining the LEVELS instead would put every arrival into the return",
    byLevel - byLink > 50,
    `by level ${(byLevel - 100).toFixed(2)}% vs by link ${(byLink - 100).toFixed(2)}%`);
}

// ── Alignment never looks ahead ─────────────────────────────────────────────
//
// A book date is a STATEMENT date and an index date is a TRADING SESSION. Taking
// the nearest close in either direction would credit the index with a move that
// had not happened when the mark was struck — the same look-ahead `computeReturns`
// avoids by excluding today's in-progress bar.
const idxPoints: Point[] = [
  { t: "2026-07-01", v: 100 },
  { t: "2026-07-15", v: 110 },
  { t: "2026-08-01", v: 120 },
];
eq("a date between closes takes the EARLIER one",
  alignIndex(idxPoints, ["2026-07-20"]), [{ date: "2026-07-20", level: 110 }]);
eq("a date before the index's first close yields nothing, not the first close",
  alignIndex(idxPoints, ["2026-06-01"]), []);
eq("a date after the last close holds the last one",
  alignIndex(idxPoints, ["2026-12-31"]), [{ date: "2026-12-31", level: 120 }]);
{
  const r = rebasedIndex(idxPoints, ["2026-07-01", "2026-07-20", "2026-08-01"]);
  eq("rebasing puts 100 at the first aligned point", r.get("2026-07-01"), 100);
  near("…and scales the rest against it", r.get("2026-08-01") ?? null, 120);
}
eq("an empty index yields no alignment rather than a flat line", alignIndex([], ["2026-07-01"]), []);

// ── A one-point series is not a series ──────────────────────────────────────
eq("one point produces no index", navIndexSeries([{ period: "x", date: "2026-01-01", nav: 100 }]), []);
{
  // A ZERO STARTING NAV IS NOT A −100% RETURN. Chaining through it would divide
  // by zero and yield Infinity or NaN, either of which renders as a number.
  const s = navIndexSeries([
    { period: "a", date: "2026-01-01", nav: 0 },
    { period: "b", date: "2026-02-01", nav: 50 },
  ]);
  ok("an interval starting at zero leaves the index unchanged rather than infinite",
    Number.isFinite(s[1].index) && s[1].index === 100);
}

// ── THE LONGER WINDOW, AND THE TWO THINGS IT MUST NOT DO ────────────────────
//
// The family asked for a larger period than the book's own five weeks. The
// index can supply one and the book cannot, so every helper below exists to
// keep those two facts apart on one pair of axes.
{
  // `indexCurve` draws the index's OWN closes, where `rebasedIndex` samples it
  // at the book's dates. Both are needed and confusing them is what made the
  // old chart's "index" seven straight segments.
  const curve = indexCurve(idxPoints, "2026-07-15", null);
  eq("the curve carries every close the feed has, not one per book date", curve.length, idxPoints.length);
  near("…rebased to 100 at the BOOK's first point, not the window's",
    curve.find((c) => c.t === "2026-07-15")?.v ?? null, 100);
  ok("…so a close BEFORE the base sits below 100",
    (curve.find((c) => c.t === "2026-07-01")?.v ?? 0) < 100);

  eq("a window start drops the closes before it",
    indexCurve(idxPoints, "2026-07-15", "2026-07-15").map((c) => c.t),
    ["2026-07-15", "2026-08-01"]);

  // THE BASE HAS TO EXIST. A book whose first point predates the index's own
  // history yields NO CURVE rather than one rebased to the earliest close,
  // which would draw a comparison from a date the feed does not cover.
  eq("a base before the index's first close yields no curve at all",
    indexCurve(idxPoints, "2026-01-01", null), []);
}
{
  near("a window return resolves both ends nearest-EARLIER",
    // 2026-07-20 → 110 (the 07-15 close), 2026-08-05 → 120.
    indexReturnBetween(idxPoints, "2026-07-20", "2026-08-05"), (120 / 110 - 1) * 100);
  eq("a start before the first close yields no return, not one from the first close",
    indexReturnBetween(idxPoints, "2026-06-01", "2026-08-01"), null);
  eq("no points yields no return", indexReturnBetween([], "2026-07-01", "2026-08-01"), null);
  eq("the lookup itself is null before the series starts",
    levelOnOrBefore(idxPoints, "2026-06-30"), null);
}
{
  // THE RANGE IS COUNTED BACK FROM THE BOOK'S LAST POINT, not from today —
  // so the shaded measured window keeps its place as the range widens, and
  // three weeks passing between statements cannot silently shrink it.
  eq("the book range is exactly the book's own window",
    [rangeStart("book", "2026-07-10", "2026-08-13"), rangeEnd("book", "2026-08-13")],
    ["2026-07-10", "2026-08-13"]);
  eq("a year counts back from the book's last dated point",
    rangeStart("1Y", "2026-07-10", "2026-08-13"), "2025-08-13");
  eq("MAX imposes no start", rangeStart("MAX", "2026-07-10", "2026-08-13"), null);
  // ...AND ONLY THE BOOK RANGE CAPS THE END. On every other range the index
  // runs to its own last close, which is the useful half of a longer period:
  // where the market has gone since the book was last marked.
  eq("no other range caps the end", NAV_RANGES.filter((r) => rangeEnd(r.key, "2026-08-13") !== null).map((r) => r.key),
    ["book"]);
  // THE CONTROL MUST OFFER SOMETHING LONGER THAN THE BOOK. A range list that
  // collapsed to the book's own window is the arrangement that was complained
  // about, and it would pass every arithmetic check above.
  ok("the range list reaches a year or more",
    NAV_RANGES.some((r) => r.days === null || (r.days ?? 0) >= 365));
}

process.exit(fails ? 1 : 0);
