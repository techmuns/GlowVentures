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
//     Carnelian 3517383     ours 26.49%   printed 26.98%   −0.49 pp
//     Goldstandard 100022   ours 20.36%   printed 20.57%   −0.21 pp
//     Goldstandard 100023   ours 20.87%   printed 21.08%   −0.21 pp
//     V.E.C 128004          ours 51.09%   printed 51.41%   −0.32 pp
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
// ── AND WHY THAT PREMISE HAS TO BE MEASURED, NOT ASSUMED ────────────────────
//
// V.E.C 128005 broke it. The account took ₹11.24 Cr of new capital on 28 and 29
// July and closes 13 August — **182% of its own opening value, sixteen days
// before the terminal date**. Its money-weighted return came out 39.13% against
// a printed 46.44%, and the suite reported a 7.31 pp FAILURE for an account
// where nothing is wrong: the manager's rupee-left-alone figure cannot see that
// deposit and ours must.
//
// NOTHING IS MISREAD, AND THE STATEMENT ITSELF SETTLES IT. Strip the deposits
// out and the account's gain over its opening value is
//
//     (20,28,79,639.73 − 6,17,98,643.42 − 11,24,00,000 + 9,162) / 6,17,98,643.42
//       = 46.43%   against the manager's printed 46.44%
//
// — 0.01 pp, on the same flows and the same terminal value the money-weighted
// figure uses. So both of our inputs are right and only the BASIS differs, which
// is the one thing a tolerance must never be widened to absorb: 1.0 pp is what
// makes a dropped flow or a wrong sign fail, and 8 pp would let one through.
//
// The comparison is therefore GATED ON THE PREMISE IT NEEDS. Mid-window external
// capital is measured against the opening value, and an account where it exceeds
// 5% is not compared. The gate is struck on that ratio and never on an account
// number: typing "128005" here would stop checking it forever, including in the
// drop where its flows go quiet again and it becomes comparable. This book's
// seven measurable accounts separate cleanly on it — six between 0.012% and
// 0.045%, all of them TDS transfers of a few thousand rupees, and this one at
// 181.9%. The threshold sits three orders of magnitude above the comparable set
// and 36× below the excluded one.
//
// An excluded account is not dropped. It gets the reconciliation above as its
// own case, which is what proves the exclusion is a basis difference rather than
// somewhere to hide a defect.
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
import { measuredAccountsReturn } from "@/lib/returns";
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

/**
 * MID-WINDOW EXTERNAL CAPITAL, AS A SHARE OF THE OPENING VALUE.
 *
 * The premise the comparison rests on: a time-weighted return and a
 * money-weighted one measure the same window and differ only to the extent that
 * capital moved inside it. This is that extent, measured — not assumed.
 */
function flowShareOfOpening(accountId: string): number | null {
  const flows = BOOK_ACCOUNT_CASH_FLOWS[accountId] ?? [];
  const opening = flows.find((f) => /^opening portfolio value/i.test(f.description ?? ""));
  if (!opening || !opening.amount) return null;
  const moved = flows.filter((f) => f !== opening).reduce((t, f) => t + Math.abs(f.amount), 0);
  return moved / Math.abs(opening.amount);
}
const MAX_FLOW_SHARE = 0.05;

/**
 * The other reading of the same statement, for an account the gate excludes:
 * gain over the opening value, with external capital removed. It is what a
 * time-weighted return collapses to when the new money arrived too late to earn
 * anything, and on 128005 it reproduces the printed figure to 0.01 pp.
 *
 * IT IS NOT A SECOND FORMULA FOR THE TILE and is never rendered. Capital that
 * landed in April would earn its share of the year and this identity would not
 * hold, so it is checked LOOSELY — wide enough that the timing of a deposit
 * cannot fail it, narrow enough that a dropped flow, a wrong sign or a terminal
 * value read off the wrong statement still moves it by tens of points.
 */
const GAIN_ON_OPENING_TOLERANCE_PP = 5.0;
function gainOverOpeningPct(accountId: string): number | null {
  const flows = BOOK_ACCOUNT_CASH_FLOWS[accountId] ?? [];
  const opening = flows.find((f) => /^opening portfolio value/i.test(f.description ?? ""));
  if (!opening || !opening.amount) return null;
  const open = Math.abs(opening.amount);
  // Flows are signed from the investor's side: money IN is negative. Removing
  // them from the terminal value leaves what the opening stake alone became.
  const net = flows.filter((f) => f !== opening).reduce((t, f) => t + f.amount, 0);
  return ((accountMV(accountId) + net - open) / open) * 100;
}

const measurable = BOOK_ACCOUNTS.filter((a) => hasOpening(a.accountId));
const notChecked: string[] = [];
const flowGated: { label: string; accountId: string; asOf: string; share: number }[] = [];
let checked = 0;

ok("at least one account carries an opening portfolio value",
  measurable.length > 0, `${measurable.length} of ${BOOK_ACCOUNTS.length} accounts are measurable`);

for (const a of measurable) {
  const ours = ourReturn(a.accountId, a.asOf);
  const printed = printedFytdSameDay(a.accountId, a.asOf);
  if (!ours) { fails++; console.log(`FAIL ${a.accountNo}: measurable but no rate came out of the solver`); continue; }
  if (!printed) { notChecked.push(`${a.provider} ${a.accountNo} — no FYTD printed on the same report date`); continue; }
  // THE PREMISE, CHECKED BEFORE THE COMPARISON IT LICENSES.
  const share = flowShareOfOpening(a.accountId);
  if (share != null && share > MAX_FLOW_SHARE) {
    flowGated.push({ label: `${a.provider} ${a.accountNo}`, accountId: a.accountId, asOf: a.asOf, share });
    notChecked.push(`${a.provider} ${a.accountNo} — ${(share * 100).toFixed(1)}% of its opening value moved mid-window, so time-weighted and money-weighted cannot meet`);
    continue;
  }
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
  `${checked} account(s) compared, ${notChecked.length} not checked${notChecked.length ? ` (${notChecked.join("; ")})` : ""}`);

// ── AN ACCOUNT THE FLOW GATE EXCLUDED IS STILL RECONCILED ──────────────────
//
// Otherwise the gate is somewhere to put a failure. On the basis that DOES
// apply to it, our own flows and our own terminal value have to reproduce the
// manager's printed figure — and on 128005 they do, to 0.01 pp.
for (const g of flowGated) {
  const printed = printedFytdSameDay(g.accountId, g.asOf);
  const ours = gainOverOpeningPct(g.accountId);
  if (!printed || ours == null) {
    fails++;
    console.log(`FAIL ${g.label}: excluded from the money-weighted comparison and nothing reconciles it on the other basis either`);
    continue;
  }
  const delta = ours - printed.pct;
  ok(`${g.label} reproduces its printed FYTD as gain over opening value, external capital removed`,
    Math.abs(delta) <= GAIN_ON_OPENING_TOLERANCE_PP,
    `ours ${ours.toFixed(2)}% vs printed ${printed.pct.toFixed(2)}% (${printed.reportType}, ${g.asOf}) = ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pp, with ${(g.share * 100).toFixed(1)}% of opening value moved mid-window`);
}

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
  // THE WINDOW ENDS WHERE THE POOL CLOSES — its latest account's statement date
  // — never at `BOOK_AS_OF`. This test ended it on the book's newest date (29
  // Aug 2026, two quantity-only trust demats), and so enforced the defect it
  // was written beside: the tile read +30.1% over 150 days where the pool
  // closes on 13 Aug, 134 days, and +26.5%. Section "the window ends where the
  // pool closes" below guards it.
  const end = parts.reduce((m, f) => (f.date > m ? f.date : m), parts[0].date);
  const days = Math.round((end.getTime() - start.getTime()) / 864e5);
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

// ── THE WINDOW ENDS WHERE THE POOL CLOSES, ON STATEMENT VALUES ─────────────
//
// Morning CIO, /performance and each Family & Entities member row all strike
// this rate through `measuredAccountsReturn` now. Re-expressed here from the
// generated book by a second path — each measurable account's own flows, its
// own statement value, its own statement date — and the helper must agree.
console.log("\n── the window ends where the pool closes ──");
{
  const stmt = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS } as never;
  const got = measuredAccountsReturn(stmt, BOOK_ACCOUNTS);
  const mine = measurable.filter((a) => accountMV(a.accountId) > 0);
  const flows = mine.flatMap((a) => [
    ...(BOOK_ACCOUNT_CASH_FLOWS[a.accountId] ?? []).map((f) => ({ date: new Date(f.date), amount: f.amount })),
    { date: new Date(a.asOf), amount: accountMV(a.accountId) },
  ]);
  const ann = xirr(flows);
  const lastClose = mine.reduce((m, a) => (a.asOf > m ? a.asOf : m), "");
  const firstFlow = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date);
  const days = Math.round((Date.parse(lastClose) - firstFlow.getTime()) / 864e5);
  eq("the helper covers exactly the accounts with an opening value and a value to close on",
    got.parts.map((x) => x.accountId).sort(), mine.map((a) => a.accountId).sort());
  ok("its annual rate is the pooled XIRR of those accounts, each on its own date",
    ann != null && got.annPct != null && Math.abs(got.annPct - ann * 100) < 1e-6,
    `${got.annPct?.toFixed(4)} vs ${(ann ?? NaN) * 100}`);
  eq("its window runs from the first flow to the LATEST close", [got.windowDays, got.lastClose], [days, lastClose]);
  const mw = moneyWeightedReturn(got.annPct, got.windowDays);
  ok("and the tile's figure is that rate de-annualised over that window",
    mw.pct != null && got.toDatePct != null && Math.abs(mw.pct - got.toDatePct) < 1e-9, `${mw.pct?.toFixed(2)}%`);
  // LOAD-BEARING: the book's newest date must lie after the pool's last close,
  // or ending the window on it would change nothing and this would pass against
  // the defect.
  ok("the book's newest date lies after the pool's last close, so the rule is doing work",
    BOOK_AS_OF > lastClose, `${BOOK_AS_OF} vs ${lastClose}`);
  const wrongDays = Math.round((Date.parse(BOOK_AS_OF) - firstFlow.getTime()) / 864e5);
  const wrong = moneyWeightedReturn(got.annPct, wrongDays);
  ok("...and ending it there would move the figure by more than a point",
    mw.pct != null && wrong.pct != null && Math.abs(wrong.pct - mw.pct) > 1,
    `${wrong.pct?.toFixed(2)}% over ${wrongDays} days vs ${mw.pct?.toFixed(2)}% over ${got.windowDays}`);
  // THE TERMINAL VALUE IS THE STATEMENT'S. A value struck today, dated to a
  // statement weeks old, is two measurements in one flow: priced at x1.10 the
  // helper must be handed the STATEMENT portfolio and so not move at all.
  const lifted = { accounts: BOOK_ACCOUNTS, accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS,
    positions: BOOK_POSITIONS.map((p) => ({ ...p, marketValue: p.marketValue * 1.1 })) } as never;
  const liftedR = measuredAccountsReturn(lifted, BOOK_ACCOUNTS);
  ok("a portfolio priced away from its statements gives a DIFFERENT rate — so callers must pass the statement one",
    liftedR.annPct != null && got.annPct != null && Math.abs(liftedR.annPct - got.annPct) > 5,
    `${liftedR.annPct?.toFixed(1)}% vs ${got.annPct?.toFixed(1)}%`);
}

process.exit(fails ? 1 : 0);
