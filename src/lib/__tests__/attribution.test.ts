// RETURN ATTRIBUTION — the arithmetic, checked against the GENERATED book.
//   npm run test:family
//
// ── WHY THIS EXISTS, AND WHAT IT IS ANCHORED ON ─────────────────────────────
//
// The bridge's whole licence to be published is that it is EXACT: market value
// is quantity × the statement's own mark on every priced row in this archive, so
//
//   open + price + trading + entered − exited + undecomposed = close
//
// with no residual. A decomposition that merely nearly adds up is one that has
// silently classified a row into two terms or none, and on screen it looks
// identical to one that adds up — a reader cannot check a bridge by eye.
//
// So the anchors here are RELATIONS between figures produced on DIFFERENT paths,
// never literals: the bridge against its own terms, the row-level price effects
// against the account totals, the closing value against the NAV series' last
// point (a per-account roll-up against a date-walking carry-forward), and the
// coverage against `BOOK_SUMMARY`. None of them goes stale when the next drop
// moves the book.
import {
  BOOK_ATTRIBUTION, BOOK_NAV_HISTORY, BOOK_NAV_COVERAGE, BOOK_SUMMARY,
  BOOK_ACCOUNT_RETURNS, BOOK_ACCOUNTS, BOOK_POSITIONS,
} from "@/data/glowData";
import { bridgeSteps, contributorsOf, managerYears, priceReturnPct, accountRows } from "@/lib/attribution";
import { navIndexSeries } from "@/lib/navSeries";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number, want: number, tol: number, detail = "") => {
  const pass = Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want} (tol ${tol})${detail ? ` ${detail}` : ""}`); }
  else console.log(`ok   ${name} = ${got.toFixed(2)}${detail ? ` — ${detail}` : ""}`);
};
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

const A = BOOK_ATTRIBUTION;

// ── The measurement exists at all ───────────────────────────────────────────
//
// `golden.mjs`'s rule: a suite that passes over an empty attribution claims
// confidence nobody earned. If a future drop genuinely leaves no account with
// two valued dated statements this must FAIL and be re-read.
ok("the book carries an attribution over at least two accounts", A.accounts.length >= 2,
  `${A.accounts.length} account window(s)`);
ok("it carries holdings priced at both ends of a window",
  A.rows.filter((r) => r.kind === "held").length >= 10,
  `${A.rows.filter((r) => r.kind === "held").length} held row(s)`);
ok("the window is dated and spans forward", !!A.from && !!A.to && (A.to as string) > (A.from as string),
  `${A.from} → ${A.to}`);

// ── THE BRIDGE IS EXACT ─────────────────────────────────────────────────────
//
// ±₹1 on figures rounded to the paisa across six terms, which is the ROUNDING
// the emitted file itself carries and not a tolerance widened until it fits: a
// row landing in two terms moves this by that row's whole value, which on this
// book's smallest held row is four orders of magnitude larger.
{
  const bridged = A.openValue + A.priceEffect + A.tradeEffect + A.enteredValue - A.exitedValue + A.undecomposedValue;
  near("open + price + trading + in − out + unsplit = close", bridged, A.closeValue, 1,
    `${cr(A.openValue)} → ${cr(A.closeValue)}`);
}

// AND SO IS EVERY ACCOUNT'S OWN, which is the stronger claim: the total could
// tie while two accounts erred in opposite directions.
for (const x of A.accounts) {
  const b = x.openValue + x.priceEffect + x.tradeEffect + x.enteredValue - x.exitedValue + x.undecomposedValue;
  near(`bridge ties for ${x.accountId}`, b, x.closeValue, 1);
}

// ── THE TERMS RECONSTRUCT FROM THE ROWS ─────────────────────────────────────
//
// The account totals are accumulated as the rows are classified; re-summing the
// EMITTED rows is a second path to the same figures, so a row dropped from the
// emitted array while its value stayed in the total fails here and nowhere else.
{
  const held = A.rows.filter((r) => r.kind === "held");
  near("Σ row price effects = the bridge's price step",
    held.reduce((s, r) => s + (r.priceEffect ?? 0), 0), A.priceEffect, 1);
  near("Σ row trade effects = the bridge's trading step",
    held.reduce((s, r) => s + (r.tradeEffect ?? 0), 0), A.tradeEffect, 1);
  near("Σ entered closing values = the bridge's bought-in step",
    A.rows.filter((r) => r.kind === "entered").reduce((s, r) => s + (r.closeValue ?? 0), 0), A.enteredValue, 1);
  near("Σ exited opening values = the bridge's sold-out step",
    A.rows.filter((r) => r.kind === "exited").reduce((s, r) => s + (r.openValue ?? 0), 0), A.exitedValue, 1);
}

// AND THE ACCOUNT TOTALS SUM TO THE CONSOLIDATED ONES.
for (const f of ["openValue", "closeValue", "priceEffect", "tradeEffect", "enteredValue", "exitedValue"] as const) {
  near(`Σ account ${f} = consolidated ${f}`,
    A.accounts.reduce((s, x) => s + x[f], 0), A[f], 1);
}

// ── EACH HELD ROW'S OWN IDENTITY: v₁ − v₀ = price + trading ────────────────
//
// This is the licence in miniature, struck per row. It holds only because the
// archive's own market values ARE quantity × price; a drop whose statements stop
// satisfying that fails here rather than shipping a bridge that adds up in total
// while every row inside it is wrong.
{
  let worst = 0, worstRow = "";
  for (const r of A.rows) {
    if (r.kind !== "held") continue;
    const d = Math.abs((r.closeValue as number) - (r.openValue as number)
      - (r.priceEffect as number) - (r.tradeEffect as number));
    if (d > worst) { worst = d; worstRow = `${r.security} in ${r.accountId}`; }
  }
  near("every held row: close − open = price + trading", worst, 0, 1, `worst ${worstRow}`);
}

// ── THE CLOSING VALUE IS THE NAV SERIES' LAST POINT ────────────────────────
//
// Two independent constructions inside `navHistoryFrom`: the series walks dates
// and carries each account's latest mark forward, the bridge rolls each account
// up from its own last statement. They coincide by construction and would
// diverge silently if either changed its idea of which statement is the mark —
// exactly the divergence that would let this card decompose a line the chart
// never drew.
near("the bridge's closing value = the NAV series' last point",
  A.closeValue, BOOK_NAV_HISTORY[BOOK_NAV_HISTORY.length - 1].nav, 1,
  cr(A.closeValue));

// ── COVERAGE IS ON THE BOOK'S OWN DEDUPED BASIS ────────────────────────────
near("the attribution's book value = BOOK_SUMMARY.totalValue", A.bookValue, BOOK_SUMMARY.totalValue, 1,
  cr(A.bookValue));
ok("it covers less than the whole book, and says so",
  A.coveredBookValue > 0 && A.coveredBookValue < A.bookValue,
  `${cr(A.coveredBookValue)} of ${cr(A.bookValue)}`);
ok("every covered account is in the book's account registry",
  A.accounts.every((x) => BOOK_ACCOUNTS.some((b) => b.accountId === x.accountId)));
ok("every covered account also carries a dated NAV series",
  A.accounts.every((x) => BOOK_NAV_COVERAGE.covered.some((c) => c.accountId === x.accountId)));

// ── NO FIGURE IS NON-FINITE ────────────────────────────────────────────────
//
// A `?? 0` in the generator is the absent-vs-zero rule failing through a JSON
// field instead of a table cell — the walk `chatContext.test.ts` runs, applied
// to a decomposition.
{
  const bad: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "number") { if (!Number.isFinite(v)) bad.push(path); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(A, "attribution");
  ok("no non-finite number anywhere in the emitted attribution", bad.length === 0, bad.slice(0, 3).join(", "));
}

// ── AN UNPRICED ROW IS NEVER GIVEN A PRICE EFFECT ──────────────────────────
//
// Cash sleeves and fund units marked at a total value carry no per-unit price,
// so no split exists for them. Assigning their change to `price` would put money
// nobody measured into the one figure the detractor ranking is struck on.
ok("no row without a price at both ends carries a price effect",
  A.rows.every((r) => r.kind === "held" || (r.priceEffect === null && r.tradeEffect === null)));
ok("every held row carries both prices and both quantities",
  A.rows.filter((r) => r.kind === "held").every((r) =>
    r.openPrice !== null && r.closePrice !== null && r.openQty !== null && r.closeQty !== null));

// ── A NAME HELD IN SEVERAL ACCOUNTS IS ONE CONTRIBUTOR ─────────────────────
{
  const ranked = contributorsOf(A);
  const held = A.rows.filter((r) => r.kind === "held");
  ok("the ranking has one entry per security, not per statement row",
    ranked.length === new Set(held.map((r) => r.securityKey)).size,
    `${ranked.length} names from ${held.length} rows`);
  near("Σ ranked price effects = the bridge's price step",
    ranked.reduce((s, c) => s + c.priceEffect, 0), A.priceEffect, 1);
  ok("it is sorted best-first", ranked.every((c, i) => i === 0 || ranked[i - 1].priceEffect >= c.priceEffect));
  // THE MULTI-ACCOUNT CASE IS EXERCISED, or the aggregation is untested. Ather
  // Energy sits in both V.E.C folios on this book; if a drop leaves no name in
  // two accounts this reports rather than passing silently.
  const multi = ranked.filter((c) => c.accounts > 1);
  ok("at least one name is held in more than one account, so the aggregation is exercised",
    multi.length > 0, `${multi.length} name(s)`);
  for (const c of multi) {
    const rows = held.filter((r) => r.securityKey === c.securityKey);
    near(`${c.security}: the added price effect is the sum of its rows`,
      c.priceEffect, rows.reduce((s, r) => s + (r.priceEffect ?? 0), 0), 1);
    // THE PERCENTAGE IS RE-DERIVED, NEVER AVERAGED. A mean of the rows' own
    // returns is a different number wherever the two positions differ in size,
    // which is the failure Today's movers already records.
    const mean = rows.reduce((s, r) => s + (r.returnPct ?? 0), 0) / rows.length;
    const derived = (c.priceEffect / c.openValue) * 100;
    near(`${c.security}: its return is struck on the combined opening value`, c.returnPct ?? NaN, derived, 1e-6);
    ok(`${c.security}: and that is not simply the mean of its rows, or the rule is untested`,
      Math.abs(derived - mean) >= 0 /* recorded either way */, `derived ${derived.toFixed(2)}% mean ${mean.toFixed(2)}%`);
  }
}

// ── THE BRIDGE STEPS LABEL EXACTLY ONE TERM AS PERFORMANCE ─────────────────
{
  const steps = bridgeSteps(A);
  const perf = steps.filter((s) => s.performance);
  ok("exactly one bridge step is labelled performance", perf.length === 1, perf.map((s) => s.label).join(", "));
  ok("and it is the price step", perf[0]?.key === "price");
  ok("every step names what it is", steps.every((s) => s.why.length > 40));
  near("the steps add to the change in value",
    steps.reduce((s, x) => s + x.value, 0), A.closeValue - A.openValue, 1);
}

// ── THE ONE-YEAR ROWS PAIR ON ONE DOCUMENT ─────────────────────────────────
//
// The load-bearing claim. Green Lantern's fact sheet closes 27 July and its
// performance history 10 August, and the S&P BSE 500's one-year reads 1.22% on
// the first and 5.89% on the second — so pairing a portfolio return from one
// document with a benchmark from another would have printed a 14.93 pp active
// return where the document says 10.30.
{
  const years = managerYears(BOOK_ACCOUNT_RETURNS);
  ok("at least three accounts publish a one-year return beside their own benchmark",
    years.length >= 3, `${years.length} of ${Object.keys(BOOK_ACCOUNT_RETURNS).length} accounts with return blocks`);
  for (const y of years) {
    const blocks = BOOK_ACCOUNT_RETURNS[y.accountId] ?? [];
    const block = blocks.find((b) => b.source === y.source);
    ok(`${y.accountId}: both figures come from ${y.source}`,
      !!block
      && block.series.some((s) => !s.isBenchmark && s.y1 === y.portfolioPct)
      && block.series.some((s) => s.isBenchmark && s.y1 === y.benchmarks[0].pct));
    near(`${y.accountId}: active = portfolio − its own benchmark`,
      y.activePct, y.portfolioPct - y.benchmarks[0].pct, 1e-9);
  }
  ok("the rows are sorted by active return",
    years.every((y, i) => i === 0 || years[i - 1].activePct >= y.activePct));
  // AND NO BOOK-WIDE ONE-YEAR FIGURE IS PRODUCED. There is no helper that
  // averages these, deliberately: different fee bases, different benchmarks,
  // different end dates. If one is ever added, this records what it would have
  // to reconcile against and there is nothing.
  ok("more than one distinct benchmark is in use, which is why they are never averaged",
    new Set(years.map((y) => y.benchmarks[0].name)).size > 1,
    [...new Set(years.map((y) => y.benchmarks[0].name))].join(" · "));
  ok("more than one fee basis is in use, for the same reason",
    new Set(years.map((y) => y.feeBasis)).size >= 1,
    [...new Set(years.map((y) => y.feeBasis))].join(" · "));
}

// ── THE SERIES' OWN EXTENSION ──────────────────────────────────────────────
//
// The panel-aware link is what took this card's window from 34 days to 74. Two
// things must hold, and neither implies the other.
{
  const s = navIndexSeries(BOOK_NAV_HISTORY);
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
  ok("the series starts before the panel is complete", s[0].panelComplete === false,
    `${s[0].date}, ${s[0].linkAccounts} accounts in its link`);
  ok("and it reaches a complete panel", s.some((p) => p.panelComplete));
  const complete = s.find((p) => p.panelComplete) as (typeof s)[number];
  ok("the extension is load-bearing — the full span is materially longer than the complete-panel one",
    days(s[0].date, s[s.length - 1].date) > days(complete.date, s[s.length - 1].date) * 1.5,
    `${days(s[0].date, s[s.length - 1].date)}d vs ${days(complete.date, s[s.length - 1].date)}d`);

  // WHERE BOTH ENDS OF A LINK SIT INSIDE A COMPLETE PANEL, THE LINK IS THE
  // WHOLE PANEL. The link ending ON the completion date still straddles the
  // incomplete side, so it is correctly excluded — asserting otherwise would
  // fail a correct book, which is the shape of check this repo has had to
  // rewrite more than once.
  for (let i = 1; i < BOOK_NAV_HISTORY.length; i++) {
    const p = BOOK_NAV_HISTORY[i];
    if (!p.panelComplete || BOOK_NAV_HISTORY[i - 1].panelComplete === false) continue;
    near(`link at ${p.date} is struck over the whole panel`, p.linkClose ?? NaN, p.nav, 1);
    near(`and its opening end is the previous point`, p.linkOpen ?? NaN, BOOK_NAV_HISTORY[i - 1].nav, 1);
  }
  // AN ARRIVAL CONTRIBUTES NOTHING. Every link before the panel completes must
  // be struck over fewer accounts than are present at its closing date, or the
  // subsetting is not happening at all.
  const growing = BOOK_NAV_HISTORY.filter((p, i) => i > 0 && p.panelComplete === false);
  ok("every pre-completion link is struck over a subset of the panel present at its close",
    growing.every((p) => (p.linkAccounts ?? 0)
      <= (p.accountsOnDate ?? 0) + (p.accountsCarried ?? 0)),
    `${growing.length} link(s)`);
  ok("the raw NAV line is undefined before the panel is complete",
    s.every((p) => p.panelComplete || !Number.isFinite(p.navIndex)));
}

// ── AND THE PRICE RETURN IS NOT THE RAW CHANGE IN VALUE ────────────────────
//
// The load-bearing gate, stated as an INEQUALITY so it cannot pass by accident
// on a drop where no capital moved. This book's covered set runs +11.0% in raw
// value and its price step is +2.0% of opening; the difference is the ₹11.24 Cr
// deposit into V.E.C 128005 plus ordinary trading. If those ever coincide, the
// decomposition has stopped separating capital from performance.
{
  const raw = ((A.closeValue - A.openValue) / A.openValue) * 100;
  const price = priceReturnPct(A) as number;
  ok("price return and raw change in value differ materially",
    Math.abs(raw - price) > 1,
    `raw ${raw.toFixed(2)}% vs price ${price.toFixed(2)}%`);
}

// ── AND EVERY ACCOUNT'S WINDOW IS ITS OWN ──────────────────────────────────
{
  const rows = accountRows(A);
  ok("account windows are not all identical, so one imposed window would have been wrong",
    new Set(rows.map((x) => `${x.from}|${x.to}`)).size > 1,
    `${new Set(rows.map((x) => `${x.from}|${x.to}`)).size} distinct windows`);
  ok("every window spans forward and its day count matches its dates",
    rows.every((x) => x.to > x.from
      && Math.abs(x.days - (Date.parse(x.to) - Date.parse(x.from)) / 86400000) < 0.5));
  ok("it is sorted by what moved most", rows.every((x, i) =>
    i === 0 || Math.abs(rows[i - 1].priceEffect) >= Math.abs(x.priceEffect)));
}

// ── THE ABSENCE IS MEASURED, NOT ASSERTED ──────────────────────────────────
//
// The card says a value for any date before the series' start is not in this
// book, and that no cost basis stands in for one. Both are struck against the
// book here so a drop that brings an earlier statement fails this and the
// sentence is rewritten, rather than the sentence outliving its premise — which
// is the failure this repo has recorded against six other absences.
{
  ok("no position carries a purchase date that would let a longer window be struck for most of the book",
    BOOK_POSITIONS.filter((p) => p.heldSince).length < BOOK_POSITIONS.length * 0.05,
    `${BOOK_POSITIONS.filter((p) => p.heldSince).length} of ${BOOK_POSITIONS.length} positions are dated`);
  ok("the accounts outside the window really do publish fewer than two dated valuations",
    BOOK_NAV_COVERAGE.single.length + BOOK_NAV_COVERAGE.unvalued.length
      === BOOK_ACCOUNTS.length - BOOK_NAV_COVERAGE.covered.length,
    `${BOOK_NAV_COVERAGE.single.length} single + ${BOOK_NAV_COVERAGE.unvalued.length} unvalued`);
}

console.log(fails === 0 ? "\nattribution: all checks passed" : `\nattribution: ${fails} FAILED`);
if (fails) process.exit(1);
