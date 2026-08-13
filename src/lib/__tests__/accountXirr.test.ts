// THE ACCOUNT XIRR, CHECKED AGAINST THE MANAGERS' OWN PRINTED RETURNS.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// A money-weighted return is now the headline figure on the Morning CIO, and
// nothing on screen lets a reader check it: the solver is iterative, the flows
// come from six different capital registers, and a wrong answer is a plausible
// percentage rather than an error. Every other figure in this book ties to a
// printed one — that is the whole discipline — and this one can too.
//
// FIVE OF THE SEVEN MEASURABLE ACCOUNTS PRINT THEIR OWN FINANCIAL-YEAR-TO-DATE
// RETURN, on the same report date the book closes them on. So the check is the
// same shape as the ingest reconciliation: reproduce the manager's own figure
// from our own inputs, per account, and classify what is left.
//
//     Carnelian 3517383     ours 26.51%   printed 26.98%   −0.47 pp
//     Goldstandard 100022   ours 20.37%   printed 20.57%   −0.20 pp
//     Goldstandard 100023   ours 20.89%   printed 21.08%   −0.19 pp
//     V.E.C 128004          ours 52.32%   printed 52.27%   +0.05 pp
//     V.E.C 128005          ours 49.63%   printed 49.59%   +0.04 pp
//
// ── WHY A TOLERANCE AT ALL, AND WHY THIS ONE ────────────────────────────────
//
// These are two different measurements of the same window and they are not
// meant to be identical. The manager publishes a TIME-weighted return (what a
// rupee left alone would have done); this is MONEY-weighted (what the family's
// rupees actually did). They diverge exactly to the extent that capital moved
// mid-window, and in these accounts the only movements are TDS transfers of a
// few thousand rupees against crores — so they should agree closely, and do.
// The gate is 1.0 pp: wide enough that the basis difference cannot fail it,
// narrow enough that a real defect cannot pass. Reading the flows in the wrong
// sign, dropping the opening value, closing on the wrong date or pooling the
// accounts on one terminal date each move a figure here by tens of points.
//
// ── WHAT IS DELIBERATELY NOT CHECKED ────────────────────────────────────────
//
// Green Lantern's two accounts. They are measurable and they are in the tile,
// but their FYTD is printed on a performance-benchmark drawn 2026-08-10 while
// their holdings close 2026-07-27 — two weeks of market movement between the
// two figures. Comparing them reports a −3.82 pp "failure" that is a date
// mismatch and nothing else, so they are counted as NOT CHECKED and named,
// rather than compared against the wrong date or quietly dropped. Same rule as
// `golden.mjs`: a case with no valid input is never reported as a pass.
import { xirr } from "@/lib/xirr";
import { moneyWeightedReturn, MIN_ANNUALISE_DAYS } from "@/lib/bucketXirr";
import { BOOK_ACCOUNTS, BOOK_ACCOUNT_CASH_FLOWS, BOOK_ACCOUNT_RETURNS, BOOK_POSITIONS, BOOK_AS_OF } from "@/data/glowData";

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

/** Market value of one account, from EVERY row it reports (never the deduped set). */
const accountMV = (accountId: string) =>
  BOOK_POSITIONS.filter((x) => x.accountId === accountId).reduce((s, x) => s + x.marketValue, 0);

const hasOpening = (accountId: string) =>
  (BOOK_ACCOUNT_CASH_FLOWS[accountId] ?? []).some((f) => /^opening portfolio value/i.test(f.description ?? ""));

/**
 * The printed FYTD for this account DRAWN ON THE SAME DATE as its holdings.
 * Null when the manager publishes none on that date — which is a "not checked",
 * not a pass.
 */
function printedFytdSameDay(accountId: string, asOf: string): { pct: number; reportType: string } | null {
  for (const block of BOOK_ACCOUNT_RETURNS[accountId] ?? []) {
    const date = /(\d{4}-\d{2}-\d{2})/.exec(block.source ?? "")?.[1] ?? null;
    if (date !== asOf) continue;
    for (const s of block.series) if (!s.isBenchmark && s.fytd != null) return { pct: s.fytd, reportType: block.reportType };
  }
  return null;
}

/** Our figure: annualised XIRR, and the total return over the window it covers. */
function ourReturn(accountId: string, asOf: string) {
  const flows = (BOOK_ACCOUNT_CASH_FLOWS[accountId] ?? []).map((f) => ({ date: new Date(f.date), amount: f.amount }));
  if (!flows.length) return null;
  const terminal = { date: new Date(asOf), amount: accountMV(accountId) };
  const r = xirr([...flows, terminal]);
  if (r == null) return null;
  const start = flows.reduce((a, f) => (f.date < a ? f.date : a), flows[0].date);
  const days = (new Date(asOf).getTime() - start.getTime()) / 864e5;
  return { annualPct: r * 100, toDatePct: ((1 + r) ** (days / 365) - 1) * 100, days };
}

const TOLERANCE_PP = 1.0;
const measurable = BOOK_ACCOUNTS.filter((a) => hasOpening(a.accountId));
const notChecked: string[] = [];
let checked = 0;

ok("at least one account carries an opening portfolio value",
  measurable.length > 0, `${measurable.length} of ${BOOK_ACCOUNTS.length} accounts are measurable`);

for (const a of measurable) {
  const ours = ourReturn(a.accountId, a.asOf);
  const printed = printedFytdSameDay(a.accountId, a.asOf);
  if (!ours) { fails++; console.log(`FAIL ${a.accountNo}: measurable but no rate came out of the solver`); continue; }
  if (!printed) { notChecked.push(`${a.provider} ${a.accountNo}`); continue; }
  checked++;
  const delta = ours.toDatePct - printed.pct;
  ok(`${a.provider} ${a.accountNo} reproduces its own printed FYTD`,
    Math.abs(delta) <= TOLERANCE_PP,
    `ours ${ours.toDatePct.toFixed(2)}% vs printed ${printed.pct.toFixed(2)}% (${printed.reportType}, ${a.asOf}) = ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pp`);
}

// A SUITE THAT CHECKED NOTHING MUST NOT REPORT SUCCESS. If every account fell
// into "not checked" the loop above would print nothing and exit 0, which is a
// green run over no input.
ok("the comparison actually ran against printed figures", checked >= 3,
  `${checked} account(s) compared, ${notChecked.length} not checked${notChecked.length ? ` (${notChecked.join(", ")} — no FYTD printed on the same report date)` : ""}`);

// ── The two failure modes that produce a plausible wrong number ─────────────
//
// Neither throws, and both have been live in this repo's history.

// 1. Closing every account on ONE date rather than its own. The accounts do not
//    share a report date; the earliest here closes fifteen days before the
//    latest, and pooling them on the newest credits the early ones with a
//    stretch of standing still.
{
  const newest = measurable.reduce((a, x) => (x.asOf > a ? x.asOf : a), measurable[0].asOf);
  const own = measurable.map((a) => ourReturn(a.accountId, a.asOf)?.annualPct ?? 0);
  const pooled = measurable.map((a) => ourReturn(a.accountId, newest)?.annualPct ?? 0);
  const moved = own.some((v, i) => Math.abs(v - pooled[i]) > 0.5);
  ok("closing on a shared date instead of each account's own would change the answer",
    moved, `at least one account moves by more than 0.5 pp when closed on ${newest} instead of its own as-of`);
}

// 2. Dropping the opening portfolio value. Without it the account looks like it
//    started from nothing, so its whole market value reads as gain.
{
  const a = measurable[0];
  const withoutOpening = (BOOK_ACCOUNT_CASH_FLOWS[a.accountId] ?? [])
    .filter((f) => !/^opening portfolio value/i.test(f.description ?? ""))
    .map((f) => ({ date: new Date(f.date), amount: f.amount }));
  const r = xirr([...withoutOpening, { date: new Date(a.asOf), amount: accountMV(a.accountId) }]);
  const real = ourReturn(a.accountId, a.asOf)!.annualPct;
  ok("dropping the opening portfolio value would not silently return the same rate",
    r == null || Math.abs(r * 100 - real) > 10,
    r == null ? "no rate at all without it" : `${(r * 100).toFixed(0)}% vs the real ${real.toFixed(0)}%`);
}

// ── THE +99% REGRESSION, GUARDED ───────────────────────────────────────────
//
// The Morning CIO shipped a tile reading "+99.0% XIRR". Nothing was
// miscalculated: ₹78.8 Cr became ₹99.4 Cr over the 132 days from 1 April, which
// is +28.3% money-weighted, and compounding 0.36 of a year onto a full one
// gives +99.0%. It was wrong because an annualised figure is a claim about a
// YEAR, and the managers' own annualised since-inception returns for these very
// accounts run about 7% to 31%.
//
// The knowledge existed in prose before and came back anyway the moment a tile
// asked for "XIRR". So it is a function with a threshold now, and these cases
// are what stop it being quietly reverted.
{
  // The real book: a sub-year window must NOT be annualised.
  const parts = measurable.map((a) => {
    const fl = (BOOK_ACCOUNT_CASH_FLOWS[a.accountId] ?? []).map((f) => ({ date: new Date(f.date), amount: f.amount }));
    return [...fl, { date: new Date(a.asOf), amount: accountMV(a.accountId) }];
  }).flat();
  const r = xirr(parts);
  const start = parts.reduce((m, f) => (f.date < m ? f.date : m), parts[0].date);
  const days = Math.round((Date.parse(BOOK_AS_OF) - start.getTime()) / 864e5);
  const mw = moneyWeightedReturn(r == null ? null : r * 100, days);

  ok("this book's flows really do span less than a year", days < MIN_ANNUALISE_DAYS, `${days} days`);
  ok("so the figure on screen is NOT annualised", mw.annualised === false, `annualised=${mw.annualised}`);
  ok("and it is the return earned over the window, not the yearly pace",
    mw.pct != null && mw.annualPct != null && mw.pct < mw.annualPct,
    `shown ${mw.pct?.toFixed(1)}% over ${days} days · annualised would be ${mw.annualPct?.toFixed(1)}%`);
  // The guard has to be doing real work: if the two figures were close, this
  // test would pass whether or not the threshold existed.
  ok("the guard is load-bearing — annualising would more than double it",
    mw.pct != null && mw.annualPct != null && mw.annualPct > mw.pct * 2,
    `${mw.annualPct?.toFixed(1)}% vs ${mw.pct?.toFixed(1)}%`);
  // The specific number the family objected to must not be reachable.
  ok("the headline figure is not a triple-digit rate", mw.pct != null && Math.abs(mw.pct) < 100,
    `${mw.pct?.toFixed(1)}%`);
  // AND IT MUST NOT BE MORE THAN THE MANAGERS' OWN ANNUALISED FIGURES ALLOW.
  // Their published annualised since-inception returns top out near 31%; a
  // whole-book figure far above that is the extrapolation returning.
  ok("and it is in the range the managers' own since-inception figures support",
    mw.pct != null && mw.pct < 60, `${mw.pct?.toFixed(1)}% vs a manager high of 31.1% annualised`);
}
{
  // A window that DOES reach a year annualises, so the rule is a threshold and
  // not a blanket refusal — otherwise the tile would stay de-annualised forever.
  const long = moneyWeightedReturn(18, 400);
  eq("a window past a year returns the annual rate", [long.pct, long.annualised], [18, true]);
  const short = moneyWeightedReturn(99, 132);
  ok("a 132-day window is de-annualised to its own window",
    short.annualised === false && Math.abs((short.pct ?? 0) - 28.3) < 0.5, `${short.pct?.toFixed(1)}%`);
  eq("exactly one year annualises", moneyWeightedReturn(20, 365).annualised, true);
  eq("one day short does not", moneyWeightedReturn(20, 364).annualised, false);
  eq("no rate in, no rate out", moneyWeightedReturn(null, 132).pct, null);
}

process.exit(fails ? 1 : 0);
