// THE ABSOLUTE / CAGR GUARD.  npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// "More than one year it'll be CAGR, less than one year I'd rather see
// absolute… a position held under a year renders absolute, never an annualised
// extrapolation."
//
// This repo has already shipped that exact failure once: the Morning CIO strip
// read +99.0% because a 132-day window was compounded onto a full year, and
// every step of it reproduced. The same figure is sitting in the archive right
// now — `positionIrrPct`, published per position by the PMS statements, reaches
// **+47,695%** on this book and reads 193.9% for a holding whose return on cost
// is 56.5%. It is a provider annualising a few months, so `holdingReturn` must
// never reach for it, and the test below asserts the guard rather than the
// happy path: a rule that only fires on data that happens to be long enough is
// indistinguishable from no rule at all.
//
// The window can only come from `Position.heldSince`, which `build-book` emits
// under the same gate as the ST/LT split — the lots must account for the units
// held exactly. On this book that is 3 of 371 positions, and the assertions
// below are written as RELATIONS against the generated book so they cannot go
// stale when the next drop moves it.
import { BOOK_POSITIONS, BOOK_SUMMARY, BOOK_ACCOUNTS } from "@/data/glowData";
import {
  holdingReturn, returnModeCoverage, YEAR_DAYS, type Holdable,
  measuredReturn, returnCoverage, RETURN_MEASURES, isFixedIncome, type ReturnInput,
  valueDateOf, commonValueDate, MIXED_VALUE_DATES, holdingYtd,
} from "@/lib/analytics";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number, want: number, tol: number) =>
  ok(name, Math.abs(got - want) <= tol, `${got.toFixed(4)} vs ${want} (±${tol})`);

const ASOF = "2026-08-13";
const h = (returnPct: number | null, heldSince: string | null): Holdable => ({ returnPct, heldSince });

// ── 1. ABSOLUTE MODE NEVER ANNUALISES ANYTHING ──────────────────────────────
for (const [label, since] of [["a long hold", "2020-01-01"], ["a short hold", "2026-07-01"], ["an unknown start", null]] as const) {
  const r = holdingReturn(h(40, since), "absolute", ASOF);
  ok(`absolute mode returns the figure on cost — ${label}`, r.kind === "absolute" && r.pct === 40);
}

// ── 2. THE GUARD ────────────────────────────────────────────────────────────
// One day short of a year is still short of a year. Asserted at the boundary,
// because a `>` written for a `>=` fails nowhere else.
const dayBefore = new Date(Date.parse(ASOF) - (YEAR_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
const atYear = new Date(Date.parse(ASOF) - YEAR_DAYS * 86_400_000).toISOString().slice(0, 10);
ok("364 days is NOT annualised", holdingReturn(h(40, dayBefore), "cagr", ASOF).kind === "absolute");
ok("365 days IS annualised", holdingReturn(h(40, atYear), "cagr", ASOF).kind === "cagr");
{
  const r = holdingReturn(h(40, dayBefore), "cagr", ASOF);
  ok("...and the sub-year fallback carries the UNCHANGED absolute figure, not a scaled one",
     r.kind === "absolute" && r.pct === 40, r.kind === "absolute" ? String(r.pct) : r.kind);
}
{
  const r = holdingReturn(h(40, null), "cagr", ASOF);
  ok("an unknown start is ABSENT, never annualised and never silently absolute", r.kind === "absent");
  ok("...and the reason names what is missing and what to do",
     r.kind === "absent" && /purchase date/i.test(r.reason) && /Holding Period Return/.test(r.reason));
}
ok("no cost basis is absent", holdingReturn(h(null, "2020-01-01"), "cagr", ASOF).kind === "absent");
// A holding worth nothing against its cost has no compound rate: (1 + −1)^x is 0
// for every x, so a "rate" here would claim the loss repeats annually forever.
ok("a total loss has no compound rate", holdingReturn(h(-100, "2020-01-01"), "cagr", ASOF).kind === "absent");

// ── 3. THE ARITHMETIC, worked by hand ───────────────────────────────────────
// Exactly two years, +21% total → 1.21^(1/2) − 1 = 10%.
{
  const twoYears = new Date(Date.parse(ASOF) - 730 * 86_400_000).toISOString().slice(0, 10);
  const r = holdingReturn(h(21, twoYears), "cagr", ASOF);
  near("+21% over two years annualises to +10%", r.kind === "cagr" ? r.pct : NaN, 10, 0.05);
}
// The book's own case: Crompton, −27.78% on cost over 527 days.
// (1 − 0.2778)^(365/527) − 1 = −20.18%.
{
  const r = holdingReturn(h(-27.78, "2025-03-04"), "cagr", ASOF);
  near("Crompton's real figures annualise to −20.18%", r.kind === "cagr" ? r.pct : NaN, -20.18, 0.05);
  ok("...and an annualised LOSS is smaller in magnitude than the total loss",
     r.kind === "cagr" && r.pct > -27.78, r.kind === "cagr" ? r.pct.toFixed(2) : r.kind);
}

// ── 4. THE GUARD IS LOAD-BEARING ON THIS BOOK ───────────────────────────────
// The same shape as accountXirr.test.ts: prove that removing the guard would
// MOVE figures, so this suite cannot pass by accident on a book where the two
// happen to coincide.
{
  const short = BOOK_POSITIONS.filter((p) => {
    if (!p.heldSince || p.returnPct === null) return false;
    return Math.round((Date.parse(ASOF) - Date.parse(p.heldSince)) / 86_400_000) < YEAR_DAYS;
  });
  ok("the book actually contains sub-year holdings for the guard to catch", short.length > 0, `${short.length}`);
  const wouldMove = short.filter((p) => {
    const days = Math.round((Date.parse(ASOF) - Date.parse(p.heldSince!)) / 86_400_000);
    const annualised = (Math.pow(1 + p.returnPct! / 100, YEAR_DAYS / days) - 1) * 100;
    return Math.abs(annualised - p.returnPct!) > 1;
  });
  ok("...and annualising them would move every one by more than a point",
     short.length > 0 && wouldMove.length === short.length, `${wouldMove.length} of ${short.length}`);
}

// ── 5. COVERAGE IS COUNTED, NOT CLAIMED ─────────────────────────────────────
{
  const cov = returnModeCoverage(BOOK_POSITIONS, "cagr", ASOF);
  ok("coverage partitions the book — every position lands in exactly one state",
     cov.cagr + cov.absolute + cov.absent === cov.total && cov.total === BOOK_POSITIONS.length,
     `${cov.cagr} cagr / ${cov.absolute} abs / ${cov.absent} absent of ${cov.total}`);
  // Anchored on the GENERATED book rather than a literal: heldSince is emitted
  // by build-book under the lot-coverage gate, so the two move together.
  const dated = BOOK_POSITIONS.filter((p) => p.heldSince).length;
  ok("every annualised or guarded row is one the book gives a start date",
     cov.cagr + cov.absolute <= dated, `${cov.cagr + cov.absolute} <= ${dated}`);
  ok("most of the book has no reported purchase date, and the column says so",
     cov.absent > cov.cagr, `${cov.absent} absent vs ${cov.cagr} annualised`);
  // In absolute mode nothing is absent for want of a DATE — only for want of a cost.
  const abs = returnModeCoverage(BOOK_POSITIONS, "absolute", ASOF);
  const noCost = BOOK_POSITIONS.filter((p) => p.returnPct === null).length;
  ok("absolute mode is absent only where there is no cost", abs.absent === noCost, `${abs.absent} vs ${noCost}`);
  ok("...so absolute mode covers far more rows than CAGR", abs.absent < cov.absent);
}

// A generated-book sanity anchor, so a drop that drops `heldSince` is loud.
ok("the book still carries a report date for the window to close against", !!BOOK_SUMMARY.asOf);


// ── 6. YEAR TO DATE ON THE HOLDING ──────────────────────────────────────────
// "Build YTD return as well; if it is not possible to show data then just show
// a dash." The dash is the common case here and the suite asserts WHY, so a
// future change that starts filling the column has to change these too.
{
  const { holdingYtd, ytdCoverage } = await import("@/lib/analytics");

  // Held since before the year began → absent. The share's own market move
  // since January exists and is deliberately NOT substituted for it.
  {
    const y = holdingYtd(h(30, "2025-06-01"), ASOF);
    ok("a holding already held on 1 January has no measurable YTD", y.kind === "absent");
    ok("...and the reason names the missing opening value, not a vague 'no data'",
       y.kind === "absent" && /1 January/.test(y.reason) && /opening value/.test(y.reason));
  }
  // No start date at all → absent, for a different stated reason.
  {
    const y = holdingYtd(h(30, null), ASOF);
    ok("an unknown start has no measurable YTD either", y.kind === "absent");
    ok("...and says so differently from a holding whose start IS known",
       y.kind === "absent" && /when it was bought/.test(y.reason));
  }
  // THE ONE MEASURABLE CASE: opened during the year, so nothing is missing.
  {
    const y = holdingYtd(h(12.5, "2026-03-02"), ASOF);
    ok("a holding OPENED during the year has a measurable YTD", y.kind === "since-open");
    ok("...and it is the whole return since purchase, unscaled",
       y.kind === "since-open" && y.pct === 12.5, y.kind === "since-open" ? String(y.pct) : y.kind);
  }
  // The boundary: 1 January itself counts as within the year.
  ok("1 January is inside the year", holdingYtd(h(5, "2026-01-01"), ASOF).kind === "since-open");
  ok("31 December is not", holdingYtd(h(5, "2025-12-31"), ASOF).kind === "absent");
  // Opened this year but no cost reported → absent for want of a cost, not a date.
  {
    const y = holdingYtd(h(null, "2026-03-02"), ASOF);
    ok("opened this year with no cost is absent for want of a COST", y.kind === "absent" && /cost/.test(y.reason));
  }
  // THE WINDOW IS THE BOOK'S YEAR, NOT TODAY'S. Same holding, same figures, a
  // book struck in a different year gives a different answer — which is the
  // whole reason `asOf` is threaded through instead of calling new Date().
  ok("the year comes from the book's as-of, not the wall clock",
     holdingYtd(h(9, "2026-03-02"), "2027-01-05").kind === "absent"
     && holdingYtd(h(9, "2026-03-02"), "2026-08-13").kind === "since-open");

  // On THIS book: every row is a dash, and the coverage helper says so rather
  // than the column quietly implying otherwise. Written as a relation to the
  // generated book so a drop that brings a within-year purchase through the lot
  // gate flips it without editing the test.
  const cov = ytdCoverage(BOOK_POSITIONS, ASOF);
  ok("YTD coverage partitions the book", cov.measured + cov.absent === cov.total && cov.total === BOOK_POSITIONS.length,
     `${cov.measured} measured / ${cov.absent} absent`);
  const openedThisYear = BOOK_POSITIONS.filter((p) => p.heldSince && p.heldSince >= "2026-01-01").length;
  ok("...and measures exactly the holdings opened during the year", cov.measured === openedThisYear,
     `${cov.measured} vs ${openedThisYear}`);
}

// ── 7. THE RETURN-METHODOLOGY LAYER — WHICH RETURN, AND SAY WHICH ────────────
//
// "When you say return… I can give you ten different returns for one scheme." So
// the reader picks the measure and each cell is labelled with it. The default is
// the family's rule: equity under a year absolute, a year or more CAGR, fixed
// income XIRR. Everything below obeys the two standing rules — never annualise a
// sub-year window, never invent a figure this book cannot strike.
{
  const mr = (returnPct: number | null, heldSince: string | null, assetClass = "Equity", costNA = false): ReturnInput =>
    ({ returnPct, heldSince, assetClass, costNA });
  const long = "2020-01-01";                          // years ago
  const short = "2026-07-01";                          // under a year before ASOF
  const twoYears = new Date(Date.parse(ASOF) - 730 * 86_400_000).toISOString().slice(0, 10);

  // The picker offers every measure, auto first.
  ok("the picker offers auto + the five concrete measures, auto first",
     RETURN_MEASURES[0].key === "auto"
     && ["auto", "absolute", "cagr", "xirr", "ytd", "calendar"].every((k) => RETURN_MEASURES.some((m) => m.key === k)));

  // The former "Absolute — holding period" is the Holding Period Return now: same
  // figure (return on cost, not annualised), reader-facing label and tag renamed
  // at the family's request. The key stays "absolute" — the URL (`?ret=absolute`)
  // and the internal not-annualised basis share the one identifier — and NOTHING
  // prints the old "ABS" tag any more, in any branch.
  {
    const hpr = RETURN_MEASURES.find((m) => m.key === "absolute")!;
    ok("the holding-period measure is labelled 'Holding Period Return' and tagged HPR",
       hpr.label === "Holding Period Return" && hpr.tag === "HPR");
    ok("no measure is still tagged ABS", RETURN_MEASURES.every((m) => m.tag !== "ABS"));
  }

  // ABSOLUTE — the return on cost, whatever the window, never annualised.
  for (const [label, since] of [["long", long], ["short", short], ["no date", null]] as const) {
    const r = measuredReturn(mr(40, since), "absolute", ASOF);
    ok(`absolute shows the return on cost, tagged HPR — ${label}`, r.shown && r.pct === 40 && r.tag === "HPR");
  }
  ok("absolute with no cost is absent, naming the depository",
     (() => { const r = measuredReturn(mr(null, long), "absolute", ASOF); return !r.shown && /cost/.test(r.reason); })());

  // CAGR — annualised at a year or more, absolute under a year, absent with no date.
  ok("CAGR annualises a two-year hold and tags it CAGR",
     (() => { const r = measuredReturn(mr(21, twoYears), "cagr", ASOF); return r.shown && r.tag === "CAGR" && Math.abs(r.pct - 10) <= 0.05; })());
  ok("CAGR under a year shows the absolute figure, tagged HPR (the guard, visible)",
     (() => { const r = measuredReturn(mr(40, short), "cagr", ASOF); return r.shown && r.tag === "HPR" && r.pct === 40; })());
  ok("CAGR with no purchase date is absent, never silently absolute",
     (() => { const r = measuredReturn(mr(40, null), "cagr", ASOF); return !r.shown && /purchase date/i.test(r.reason); })());

  // AUTO — the methodology, tagging each cell with the measure it resolved to.
  ok("auto annualises a year-old equity holding (CAGR)",
     (() => { const r = measuredReturn(mr(21, twoYears, "Equity"), "auto", ASOF); return r.shown && r.tag === "CAGR" && Math.abs(r.pct - 10) <= 0.05; })());
  ok("auto shows a sub-year equity holding as the absolute figure (HPR), never annualised",
     (() => { const r = measuredReturn(mr(40, short, "Equity"), "auto", ASOF); return r.shown && r.tag === "HPR" && r.pct === 40; })());
  ok("auto with no purchase date shows the return on cost (HPR), because it cannot know the window",
     (() => { const r = measuredReturn(mr(40, null, "Equity"), "auto", ASOF); return r.shown && r.tag === "HPR" && r.pct === 40; })());
  ok("auto with no cost is absent",
     (() => { const r = measuredReturn(mr(null, long, "Equity"), "auto", ASOF); return !r.shown; })());
  // FIXED INCOME → the rule wants XIRR, which this book cannot strike per holding,
  // so the return on cost stands, tagged HPR, and the note names the ideal measure.
  ok("Bond is fixed income and routes to XIRR in the methodology", isFixedIncome("Bond") && !isFixedIncome("Equity"));
  ok("auto on fixed income shows the return on cost (HPR) and its note names XIRR",
     (() => { const r = measuredReturn(mr(6, long, "Bond"), "auto", ASOF); return r.shown && r.tag === "HPR" && !!r.note && /XIRR/.test(r.note); })());

  // XIRR — never a per-holding figure on this book; a dash with the reason.
  {
    const r = measuredReturn(mr(40, long, "Equity"), "xirr", ASOF);
    ok("XIRR per holding is absent — the statements carry no cash-flow history per security", !r.shown && r.tag === "XIRR");
    ok("...and its reason names the money-weighted basis and points to Performance",
       !r.shown && /money-weighted/i.test(r.reason) && /Performance/.test(r.reason));
  }
  ok("XIRR never reads the banned per-position IRR — even a real returnPct yields a dash",
     !measuredReturn(mr(193.9, long, "Equity"), "xirr", ASOF).shown);

  // YTD — measurable only where a holding was opened during the year.
  ok("YTD is absent for a holding already held on 1 January",
     !measuredReturn(mr(30, "2025-06-01"), "ytd", ASOF).shown);
  ok("YTD is the whole return since purchase for a within-year buy, tagged YTD",
     (() => { const r = measuredReturn(mr(12.5, "2026-03-02"), "ytd", ASOF); return r.shown && r.tag === "YTD" && r.pct === 12.5; })());

  // CALENDAR — no prior-year window in this book at all.
  ok("a calendar-year return is absent, naming the missing prior-year window",
     (() => { const r = measuredReturn(mr(40, long), "calendar", ASOF); return !r.shown && r.tag === "CY" && /year/.test(r.reason); })());

  // COVERAGE partitions the book for every measure — shown + absent === total.
  for (const m of RETURN_MEASURES) {
    const cov = returnCoverage(BOOK_POSITIONS, m.key, ASOF);
    ok(`${m.key} coverage partitions the book`, cov.shown + cov.absent === cov.total && cov.total === BOOK_POSITIONS.length,
       `${cov.shown} shown / ${cov.absent} absent of ${cov.total}`);
  }
  // AUTO and ABSOLUTE cover the SAME rows on this book: auto only annualises where
  // a date exists, and otherwise shows the very return on cost absolute does —
  // so the two are absent on exactly the costless positions and nowhere else.
  {
    const auto = returnCoverage(BOOK_POSITIONS, "auto", ASOF);
    const abs = returnCoverage(BOOK_POSITIONS, "absolute", ASOF);
    const noCost = BOOK_POSITIONS.filter((p) => p.returnPct === null).length;
    ok("auto is absent only where there is no cost", auto.absent === noCost, `${auto.absent} vs ${noCost}`);
    ok("...and covers exactly the rows absolute does", auto.shown === abs.shown, `${auto.shown} vs ${abs.shown}`);
    // The methodology's CAGR branch fires on the same rows the CAGR measure annualises.
    const cagr = returnCoverage(BOOK_POSITIONS, "cagr", ASOF);
    ok("auto annualises exactly the rows CAGR does", auto.cagr === cagr.cagr, `${auto.cagr} vs ${cagr.cagr}`);
  }
  // XIRR and CALENDAR are absent on EVERY row — this book cannot strike either.
  ok("XIRR is absent on every position", returnCoverage(BOOK_POSITIONS, "xirr", ASOF).shown === 0);
  ok("calendar year is absent on every position", returnCoverage(BOOK_POSITIONS, "calendar", ASOF).shown === 0);
}

// ── 8. THE WINDOW ENDS AT THE VALUATION, NOT AT THE BOOK'S NEWEST DATE ──────
//
// Every caller passed `portfolio.asOf` as the window's end — the book's NEWEST
// statement date, 29 Aug 2026, which is the date of two quantity-only trust
// demats that value nothing. So Crompton's LKP holding, marked on its 31 Mar
// statement, read CAGR −19.65% over 543 days where its own window is 392 days
// and −26.14%. The window ends where the VALUE is struck: `valuedAt`.
console.log("\n── 8. the window ends at the valuation ──");
{
  // Three hundred and sixty-four days to the valuation, four hundred to the
  // fallback: the figure must NOT annualise, because the value was struck
  // before the year was up.
  const valuedAt = "2026-07-31";
  const since = new Date(Date.parse(valuedAt) - (YEAR_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const later = "2026-09-04";
  const r = holdingReturn({ returnPct: 7.91, heldSince: since, valuedAt }, "cagr", later);
  ok("364 days to the valuation is NOT annualised, whatever the fallback date says",
     r.kind === "absolute" && r.pct === 7.91 && r.heldDays === YEAR_DAYS - 1,
     r.kind === "absolute" ? `${r.heldDays} days` : r.kind);
  const wrong = holdingReturn({ returnPct: 7.91, heldSince: since }, "cagr", later);
  ok("...where closing on the fallback date alone WOULD have annualised it (load-bearing)", wrong.kind === "cagr");

  // A row whose holdings are valued on different dates has no single window.
  const mixed = holdingReturn({ returnPct: 12, heldSince: "2024-01-01", valuedAt: null }, "cagr", later);
  ok("a row valued on different dates is not annualised, and says why",
     mixed.kind === "absent" && mixed.reason === MIXED_VALUE_DATES);
  ok("...while its holding-period figure still stands (it needs no window)",
     holdingReturn({ returnPct: 12, heldSince: "2024-01-01", valuedAt: null }, "absolute", later).kind === "absolute");
  const autoMixed = measuredReturn({ returnPct: 12, heldSince: "2024-01-01", valuedAt: null, assetClass: "Equity" }, "auto", later);
  ok("auto on a mixed row shows the return on cost, tagged HPR, naming the reason",
     autoMixed.shown && autoMixed.tag === "HPR" && autoMixed.pct === 12 && !!autoMixed.note && autoMixed.note.includes("different dates"));

  // The year a YTD runs over is the valuation's.
  ok("YTD takes its year from the valuation, not the fallback",
     holdingYtd({ returnPct: 5, heldSince: "2025-06-01", valuedAt: "2025-12-31" }, "2026-02-01").kind === "since-open"
     && holdingYtd({ returnPct: 5, heldSince: "2025-06-01" }, "2026-02-01").kind === "absent");

  // valueDateOf: a live quote on its own IST day, a NAV on AMFI's date, else the statement's.
  const nowMs = Date.parse("2026-09-22T20:00:00Z");          // 01:30 IST on 23 Sep
  ok("a live value is dated on the exchange's calendar (IST), from the quote's own age",
     valueDateOf({ live: true, quoteAgeS: 0 }, "2026-07-31", nowMs) === "2026-09-23"
     && valueDateOf({ live: true, quoteAgeS: 3 * 3600 }, "2026-07-31", nowMs) === "2026-09-22");
  ok("a published NAV is dated on AMFI's date",
     valueDateOf({ navPriced: true, navDate: "2026-09-22" }, "2026-07-31", nowMs) === "2026-09-22");
  ok("a statement mark is dated on its statement's date, never on the clock",
     valueDateOf({}, "2026-07-31", nowMs) === "2026-07-31");
  ok("one date across a set is that date; two dates are none; no dates are none",
     commonValueDate(["2026-07-31", "2026-07-31"]) === "2026-07-31"
     && commonValueDate(["2026-07-31", "2026-08-13"]) === null
     && commonValueDate([]) === null && commonValueDate([null]) === null);

  // THE BOOK'S OWN CASE, derived rather than typed: every position carrying a
  // purchase date, measured to its OWN statement date. At least one must count
  // a different number of days than the book's newest date would — or this
  // section would pass against the window it replaced.
  const asOfOf = (accountId: string) => BOOK_ACCOUNTS.find((a) => a.accountId === accountId)?.asOf ?? null;
  const dated = BOOK_POSITIONS.filter((p) => p.heldSince && p.returnPct !== null);
  let moved = 0;
  for (const p of dated) {
    const end = asOfOf(p.accountId)!;
    const r = holdingReturn({ ...p, valuedAt: end }, "cagr", BOOK_SUMMARY.asOf);
    const own = Math.round((Date.parse(end) - Date.parse(p.heldSince!)) / 86_400_000);
    const book = Math.round((Date.parse(BOOK_SUMMARY.asOf) - Date.parse(p.heldSince!)) / 86_400_000);
    if (own !== book) moved++;
    ok(`${p.security} counts ${own} days to its own statement (${end})`,
       r.kind !== "absent" && r.heldDays === own, r.kind !== "absent" ? `${r.heldDays}` : r.kind);
    if (own >= YEAR_DAYS && r.kind === "cagr") {
      const want = (Math.pow(1 + p.returnPct! / 100, YEAR_DAYS / own) - 1) * 100;
      near(`${p.security} annualises over its own window`, r.pct, want, 0.005);
    }
  }
  ok("some dated holding is valued before the book's newest date (load-bearing)", moved > 0,
     `${moved} of ${dated.length}; newest date ${BOOK_SUMMARY.asOf}`);
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
