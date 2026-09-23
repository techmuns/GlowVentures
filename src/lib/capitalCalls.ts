// THE CAPITAL-CALL TIMELINE — what was demanded, when, and what can still come.
//
// *"Where is it pending? Then for the next six months or for this year … what
//  is the timeline? When is the commitment expected? Or is there something
//  which is due in the next one month, three months, six months?"* and *"labels
//  are there, but they just need more granularity and timeline and dates and
//  also the schemes."* — the family, on the Private Market page.
//
// ── THE ONE THING THIS FILE MUST NOT DO ─────────────────────────────────────
//
// NOT ONE OF THE 265 DOCUMENTS IN THIS ARCHIVE PUBLISHES A FORWARD DRAWDOWN
// SCHEDULE. Measured, not assumed: no commitment-period end date, no call
// notice dated ahead of its statement, no expected-drawdown table, nothing. A
// drawdown fund calls its capital when it finds something to buy, and none of
// these funds has told the family when that will be.
//
// So the 1/3/6-month buckets a reader asks for CANNOT be filled from a
// schedule, and the tempting substitute — projecting the next call from the
// observed cadence — is a forecast. A forecast rendered beside fifteen measured
// figures reads as the sixteenth, which is this book's founding failure with a
// date on it.
//
// ── AND THE WINDOWS ARE GONE, BECAUSE THE FAMILY ASKED ──────────────────────
//
// The page drew them — three boxes reading "nothing scheduled" beside a due-now
// figure and the undated uncalled total — until the family called them what
// they were: *"These kind of placeholders are not relevant … it simply needs to
// be a editable coloumn in this table itself which people can add and edit
// capital call and save and it stays same for all."* So the forward view is now
// what the FAMILY knows and no statement says: the calls they have been told
// are coming, entered on the fund table and saved for everyone
// (`src/lib/enteredCalls.ts`). `callWindows` and `CALL_WINDOWS` went with the
// card rather than being left exported and uncalled.
//
// What IS measurable, and is what the page still shows:
//
//   · DUE NOW — capital the fund has CALLED and not yet been PAID. Two layouts
//     print it (`Pending Contribution D = B - C`, `Pending Drawdown`) and on
//     this drop it is a MEASURED ZERO on the one account in scope, which is a
//     different statement from "we do not know". A tile a reader can pick.
//   · UNCALLED AND UNSCHEDULED — the ₹15.98 Cr, which can arrive on any day:
//     the default "Still to call" tile and the scheme table's own footer.
//   · THE CALL HISTORY — 52 dated calls across 15 capital accounts, each one
//     reconciled by its reader against the total its own statement prints.
import type { Commitment, CapitalCall } from "./types";
import { sumOrNull } from "./analytics";

export type DatedCall = CapitalCall & {
  accountId: string;
  fund: string;
  owner: string | null;
};

/** One drawdown fund's capital position, in the words its own statement uses. */
export type SchemeCall = {
  accountId: string;
  fund: string;
  owner: string | null;
  asOf: string | null;
  /** How many days behind the newest capital account this one's statement is. */
  staleDays: number | null;
  committed: number;
  /** What the fund has DEMANDED. Null where its statement labels no such line. */
  called: number | null;
  /** What the family has PAID — capital invested. */
  paid: number | null;
  /** Called and not yet paid. A measured zero where printed, null where not. */
  pending: number | null;
  /** Uncalled, AS PRINTED. Never committed − called. */
  uncalled: number | null;
  /** What committed − called comes to, for the row to be checked against. Null if either side is. */
  impliedUncalled: number | null;
  /** True where the printed and the implied figures agree to the rupee. */
  uncalledTies: boolean | null;
  calls: CapitalCall[];
  firstCall: string | null;
  lastCall: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * One row per capital account, sorted by what can still be called.
 *
 * `impliedUncalled` is derived and is DELIBERATELY NOT a fallback for a missing
 * printed figure: it exists so the row can be CHECKED, which is what the family
 * asked for ("how are you calculating this?"). Where a statement prints no
 * uncalled line, the cell stays absent and the implied figure is shown beside it
 * as what the two other columns come to — a reader can see the arithmetic
 * without this book publishing it as the fund's own number.
 */
export function schemeCalls(
  commitments: Commitment[],
  nameOf: (c: Commitment) => string,
  ownerOf: (c: Commitment) => string | null,
): SchemeCall[] {
  const newest = commitments.map((c) => c.asOf).filter(Boolean).sort().pop() ?? null;
  return commitments
    .map((c) => {
      const impliedUncalled = c.called != null ? r2(c.committed - c.called) : null;
      const calls = [...(c.calls ?? [])].sort((a, b) => a.date.localeCompare(b.date));
      return {
        accountId: c.accountId,
        fund: nameOf(c),
        owner: ownerOf(c),
        asOf: c.asOf,
        staleDays: c.asOf && newest ? days(c.asOf, newest) : null,
        committed: c.committed,
        called: c.called,
        paid: c.paid,
        pending: c.pending,
        uncalled: c.undrawn,
        impliedUncalled,
        uncalledTies: c.undrawn != null && impliedUncalled != null
          ? Math.abs(c.undrawn - impliedUncalled) <= 1
          : null,
        calls,
        firstCall: calls[0]?.date ?? null,
        lastCall: calls[calls.length - 1]?.date ?? null,
      };
    })
    .sort((a, b) => (b.uncalled ?? b.impliedUncalled ?? 0) - (a.uncalled ?? a.impliedUncalled ?? 0));
}

export type CallTotals = {
  /** Called and unpaid, over the accounts whose statement prints the line. */
  dueNow: number | null;
  dueNowOf: number;
  /** Promised and not yet demanded, AS PRINTED. */
  uncalled: number | null;
  uncalledOf: number;
  /** Uncalled on rows whose statement does NOT print the line — derived, shown apart. */
  uncalledImplied: number | null;
  uncalledImpliedOf: number;
  called: number | null;
  calledOf: number;
  paid: number | null;
  paidOf: number;
  committed: number;
  /**
   * Committed OVER THE ROWS THAT PRINT A CALLED FIGURE — the only denominator
   * `called` may be subtracted from.
   *
   * The page's working line first read "committed ₹97.7 Cr less called ₹71.8 Cr
   * is ₹26 Cr" beside a printed uncalled total of ₹16 Cr, under the words "the
   * same figure the other way". Both numbers were right and the sentence was a
   * contradiction: `committed` spans 15 accounts and `called` spans 14, so the
   * subtraction carries the whole ₹10 Cr commitment of the one fund that prints
   * no called line. Over the matched 14 it is ₹87.73 Cr − ₹71.75 Cr = ₹15.98 Cr,
   * which reproduces the printed total to the rupee. A total must tie to its own
   * columns, and a difference must be struck over one set.
   */
  committedWhereCalled: number | null;
  count: number;
  callCount: number;
};

/**
 * Every total, each with the rows it covers — and the coverage is not decoration.
 *
 * `called` covers 14 of 15 accounts and `paid` covers 15, because Delphi's
 * statement prints a contribution column and no called line. So THESE TWO MUST
 * NEVER BE SUBTRACTED FROM EACH OTHER: ₹81.75 Cr paid less ₹71.75 Cr called
 * would read as ₹10 Cr overpaid when it is one fund appearing in one total and
 * not the other. `sumOrNull` skips the nulls and the counts say how many, which
 * is the standing rule for a figure that exists for some accounts and not all.
 */
export function callTotals(rows: SchemeCall[]): CallTotals {
  const of = (f: (r: SchemeCall) => number | null) => rows.filter((r) => f(r) != null).length;
  return {
    dueNow: sumOrNull(rows.map((r) => r.pending)),
    dueNowOf: of((r) => r.pending),
    uncalled: sumOrNull(rows.map((r) => r.uncalled)),
    uncalledOf: of((r) => r.uncalled),
    uncalledImplied: sumOrNull(rows.filter((r) => r.uncalled == null).map((r) => r.impliedUncalled)),
    uncalledImpliedOf: rows.filter((r) => r.uncalled == null && r.impliedUncalled != null).length,
    called: sumOrNull(rows.map((r) => r.called)),
    calledOf: of((r) => r.called),
    paid: sumOrNull(rows.map((r) => r.paid)),
    paidOf: of((r) => r.paid),
    committed: rows.reduce((t, r) => t + r.committed, 0),
    committedWhereCalled: sumOrNull(rows.map((r) => (r.called == null ? null : r.committed))),
    count: rows.length,
    callCount: rows.reduce((t, r) => t + r.calls.length, 0),
  };
}

/**
 * Every dated call across every scheme, newest first — the history half.
 *
 * Grouped by the reader into years on screen. A call is a fact about a date and
 * an amount, so nothing here is aggregated: a reader asking "when did this fund
 * last ask us for money" is asking about one row.
 */
export function callHistory(rows: SchemeCall[]): DatedCall[] {
  return rows
    .flatMap((r) => r.calls.map((k) => ({ ...k, accountId: r.accountId, fund: r.fund, owner: r.owner })))
    .sort((a, b) => b.date.localeCompare(a.date));
}
