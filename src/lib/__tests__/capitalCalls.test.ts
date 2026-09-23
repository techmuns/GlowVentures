// THE CAPITAL-CALL MODEL, CHECKED AGAINST THE BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "How are you calculating this uncalled capital of 16 crores? … Something
//    seems amiss here. According to me, the number is not 16 crores."
//   "Capital committed, or is it capital invested? … I would commit 10 crores,
//    but I may have only invested so far 5 crores."
//
// The first question is arithmetic and the page now shows its working two ways.
// THE DANGER IS THAT THE TWO WAYS ARE NOT STRUCK OVER THE SAME SET: `called`
// covers 14 of these 15 accounts and `committed` covers 15, so subtracting the
// footers gives ₹26 Cr against a printed ₹16 Cr — both figures right, and a
// contradiction a reader who subtracts finds immediately. That shipped in the
// first draft of the page's own working line and is case 2 below.
//
// The second question is a MODEL defect: `drawn` carried whichever of CALLED
// and PAID each fund's layout matched, and on this drop the two differ by
// ₹2,925.10 — small enough that nothing on screen was visibly wrong, which is
// the condition under which a field means two things for a drop and a half.
//
// Every expectation is derived from `glowData.ts` on the run, or written as a
// RELATION that survives the next drop moving the book. The one thing this file
// must never do is re-implement `capitalCalls.ts`: a test that computes the
// answer the same way agrees with it by construction.
import { BOOK_COMMITMENTS, BOOK_ACCOUNTS } from "@/data/glowData";
import * as capitalCalls from "@/lib/capitalCalls";
import { schemeCalls, callTotals, callHistory } from "@/lib/capitalCalls";
import type { Commitment } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail: unknown = "") => {
  const d = detail === "" || detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  if (!pass) { fails++; console.log(`FAIL ${name}${d}`); } else console.log(`ok   ${name}${d}`);
};

const rows = schemeCalls(BOOK_COMMITMENTS, (c) => c.name, (c) => c.ownerId);
const t = callTotals(rows);
const R2 = (n: number) => Math.round(n * 100) / 100;

// ── 1. THE REGISTER SURVIVES THE ROLL-UP ────────────────────────────────────
ok("every commitment becomes exactly one scheme row", rows.length === BOOK_COMMITMENTS.length,
  `${rows.length} of ${BOOK_COMMITMENTS.length}`);
ok("...and the book carries some", BOOK_COMMITMENTS.length > 0, BOOK_COMMITMENTS.length);
ok("committed is the whole register, unfiltered",
  R2(t.committed) === R2(BOOK_COMMITMENTS.reduce((a, c) => a + c.committed, 0)), t.committed);

// ── 2. THE CLIENT'S QUESTION: TWO PATHS TO ONE FIGURE, ON ONE SET ───────────
//
// THE LOAD-BEARING PART IS `committedWhereCalled`. Struck against the whole
// register this reads ₹26 Cr and the assertion below would fail — which is what
// says the matched denominator is doing work rather than being a tidier name
// for the same sum. Both are asserted, so the day they coincide (every account
// printing a called line) the second case stops proving anything and says so.
{
  const printed = t.uncalled;
  const implied = t.called != null && t.committedWhereCalled != null
    ? R2(t.committedWhereCalled - t.called) : null;
  ok("uncalled summed as printed and committed − called agree, to the rupee",
    printed != null && implied != null && Math.abs(printed - implied) <= 1,
    JSON.stringify({ printed, implied }));

  const naive = t.called != null ? R2(t.committed - t.called) : null;
  ok("...and the UNMATCHED subtraction really is different, so the matched one is load-bearing",
    t.calledOf === t.count
      ? naive === implied   // every account prints a called line: the two coincide, honestly
      : naive != null && implied != null && Math.abs(naive - implied) > 1,
    JSON.stringify({ naive, implied, calledOf: t.calledOf, of: t.count }));
}

// ── 3. COVERAGE IS NEVER A ZERO, AND NEVER A FULL SET BY DEFAULT ────────────
//
// A `?? 0` anywhere in `callTotals` widens a coverage count to every row and
// leaves the FIGURE untouched wherever the missing values would have been nil —
// which is every `pending` in this drop. The count is the only tell, so it is
// asserted against the book rather than against another rendering of itself.
for (const [name, got, want] of [
  ["called", t.calledOf, BOOK_COMMITMENTS.filter((c) => c.called != null).length],
  ["paid", t.paidOf, BOOK_COMMITMENTS.filter((c) => c.paid != null).length],
  ["uncalled", t.uncalledOf, BOOK_COMMITMENTS.filter((c) => c.undrawn != null).length],
  ["due now", t.dueNowOf, BOOK_COMMITMENTS.filter((c) => c.pending != null).length],
] as const) {
  ok(`${name} covers exactly the accounts whose statement prints it`, got === want, `${got} vs ${want}`);
}

// A MEASURED ZERO IS NOT AN ABSENT ONE, in the direction that matters here: a
// fund that prints "pending nil" has said nothing is outstanding, and a fund
// that prints no such line has said nothing at all. Both must survive the sum.
{
  const measured = BOOK_COMMITMENTS.filter((c) => c.pending === 0).length;
  ok("a printed nil pending is kept as a measured zero",
    measured === 0 || (t.dueNow != null && t.dueNowOf >= measured),
    JSON.stringify({ measured, dueNow: t.dueNow, of: t.dueNowOf }));
  ok("...and an all-null total would be NULL, never 0",
    callTotals(rows.map((r) => ({ ...r, pending: null }))).dueNow === null);
}

// ── 4. EVERY DATED CALL REACHED THE BOOK THROUGH ITS OWN STATEMENT'S TOTAL ──
//
// The reader emits NOTHING for a fund whose rows did not reconcile, so a
// non-empty `calls` array is a set that tied. This checks the consequence the
// page depends on: a fund's calls add to what that fund reports as called or
// paid. Anything else means a partial schedule reached the book, which
// understates what the family has paid and looks complete on screen.
{
  let checked = 0;
  for (const c of BOOK_COMMITMENTS) {
    if (!c.calls.length) continue;
    const sum = R2(c.calls.reduce((a, k) => a + k.amount, 0));
    const target = c.called ?? c.paid;
    if (target == null) continue;
    checked += 1;
    ok(`${c.accountId}: its dated calls reproduce its own printed total`,
      Math.abs(sum - target) <= 1, JSON.stringify({ sum, target }));
  }
  // A SUITE THAT PASSES OVER NO INPUT CLAIMS CONFIDENCE NOBODY EARNED.
  ok("...and there were dated calls to check", checked >= 10, checked);
  ok("the history holds every call and loses none",
    callHistory(rows).length === BOOK_COMMITMENTS.reduce((a, c) => a + c.calls.length, 0),
    callHistory(rows).length);
  ok("the history is newest first",
    callHistory(rows).every((c, i, a) => i === 0 || a[i - 1].date >= c.date));
  ok("every call carries a date and a finite amount",
    callHistory(rows).every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && Number.isFinite(c.amount)));
}

// ── 5. THE FORWARD WINDOWS ARE GONE, AND SO IS EVERYTHING THEY READ ───────
//
// *"These kind of placeholders are not relevant."* The page's 1/3/6-month
// windows could only ever read "nothing scheduled" — no fund in this archive
// publishes a forward schedule — so the family asked for them to go and for the
// forward view to be the calls THEY enter. The helper and its constant went
// with the card rather than being left exported with no caller, and the removal
// is asserted rather than the case being deleted alongside it.
{
  const exported = capitalCalls as Record<string, unknown>;
  ok("the forward-window helper is gone with the card that drew it",
    !("callWindows" in exported) && !("CALL_WINDOWS" in exported));
  ok("...and the stale-uncalled aggregate only that card printed is gone too",
    !("staleUncalled" in t) && !("staleRows" in t));
}

// ── 6. STALENESS IS MEASURED AGAINST THE NEWEST ACCOUNT, NOT AGAINST TODAY ──
//
// A page that dated these balances by `new Date()` would report every one of
// them as months old and the figure would drift every day it was opened.
{
  const newest = rows.map((r) => r.asOf).filter(Boolean).sort().pop();
  ok("the newest capital account is zero days behind itself",
    rows.filter((r) => r.asOf === newest).every((r) => r.staleDays === 0));
  ok("nothing is ahead of the newest", rows.every((r) => (r.staleDays ?? 0) >= 0));
}

// ── 7. THE PAGE'S OWN DENOMINATOR: A FLOOR, NOT A TOTAL ────────────────────
//
// The register is a MINORITY of the private accounts, which is the answer to
// "the number is not 16 crores" and the one thing the tile has to say. A drop
// that brought a capital account for every private folio would make the floor
// wording false, and this is what would notice.
{
  const priv = new Set(BOOK_ACCOUNTS.filter((a) => a.engagement === "AIF").map((a) => a.accountId));
  ok("the capital register covers fewer accounts than the book has AIF-engagement ones",
    rows.length < priv.size, `${rows.length} of ${priv.size}`);
}

// ── 8. NULL-HANDLING, ON CONSTRUCTED ROWS ──────────────────────────────────
//
// The traps here are absent values in shapes this drop does not contain, so
// they are built rather than waited for — the same reason `privateMarket.test`
// carries a fixture beside its real-book cases.
{
  const mk = (over: Partial<Commitment>): Commitment => ({
    accountId: "x", name: "X", provider: "X", ownerId: null, asOf: "2026-01-01",
    committed: 100, drawn: null, undrawn: null, distributed: null,
    called: null, paid: null, pending: null, calls: [], arithmeticHolds: null, ...over,
  });
  const empty = callTotals(schemeCalls([], (c) => c.name, () => null));
  ok("an empty register totals NULL, never 0",
    [empty.called, empty.paid, empty.uncalled, empty.dueNow, empty.committedWhereCalled]
      .every((v) => v === null));

  const one = schemeCalls([mk({ called: 40 })], (c) => c.name, () => null)[0];
  ok("committed − called is offered as ARITHMETIC where no uncalled line is printed",
    one.uncalled === null && one.impliedUncalled === 60);
  ok("...and the row is NOT marked as tying, because there is nothing to tie against",
    one.uncalledTies === null);

  const both = schemeCalls([mk({ called: 40, undrawn: 60 })], (c) => c.name, () => null)[0];
  ok("a row whose printed and implied figures agree is marked as tying", both.uncalledTies === true);
  const off = schemeCalls([mk({ called: 40, undrawn: 55 })], (c) => c.name, () => null)[0];
  ok("...and one that disagrees is marked FALSE, not null", off.uncalledTies === false);

  // A commitment with no called line must not drag `committedWhereCalled`.
  const mixed = callTotals(schemeCalls(
    [mk({ accountId: "a", called: 40 }), mk({ accountId: "b", committed: 500 })],
    (c) => c.name, () => null));
  ok("committedWhereCalled skips the row with no called figure",
    mixed.committedWhereCalled === 100 && mixed.committed === 600,
    JSON.stringify({ w: mixed.committedWhereCalled, all: mixed.committed }));
}

if (fails) { console.log(`\n${fails} capital-call check(s) failed`); process.exit(1); }
console.log("\nall capital-call checks passed");
