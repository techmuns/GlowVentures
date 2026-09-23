// The absence of a measurement, rendered as such.
//
// THE RULE THIS EXISTS TO ENFORCE. A measured zero and an absent measurement
// must never look the same on screen. `₹0` says the family holds nothing;
// "no statement carries this" says nobody looked. They are different facts and
// a reader cannot tell them apart from a zero.
//
// So anything whose underlying collection is EMPTY renders through here: an em
// dash and one line saying what is missing and what would supply it. Never 0,
// never 0.00%, never an empty chart frame with axes drawn around nothing.
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { REVIEW_AS_OF, reviewGapsFor } from "@/lib/reviewGaps";

/** The em dash every absent figure uses. Imported, never typed inline. */
export const DASH = "—";

/**
 * An absent figure, for a <StatTile value>. The reason belongs in the tile's
 * `sub` or `hint` so the dash is never bare — see AbsentTile below, which pairs
 * them for you.
 */
export function AbsentValue() {
  return <span className="text-slate-500">{DASH}</span>;
}

/**
 * The props a StatTile needs to show an absent figure honestly: the dash as the
 * value, the reason underneath.
 *
 * Usage keeps the call site short and makes the omission obvious in review:
 *   <StatTile label="NAV growth" {...absentTile("needs two valuation dates")} />
 */
export function absentTile(reason: string, hint?: string) {
  return { value: <AbsentValue />, sub: <span className="text-slate-500">{reason}</span>, hint };
}

/**
 * An empty section, where a chart or table would be.
 *
 * `what` names the thing that is missing; `needs` names the document or field
 * that would fill it. Both are required — "no data" on its own tells a reader
 * nothing about whether to go and find something.
 */
export function AbsentSection({ what, needs, children }: {
  what: string;
  needs: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600/70 px-6 py-10 text-center">
      <Info className="h-5 w-5 text-slate-600" />
      <div className="text-sm font-medium text-slate-300">{what}</div>
      <p className="max-w-xl text-xs leading-relaxed text-slate-500">{needs}</p>
      {children}
    </div>
  );
}

/**
 * Inline, for a table cell whose value this row does not have while other rows
 * do — "no capital gain statement issued" against one account while the other
 * three show figures. Averaging a missing value in as zero is the failure this
 * prevents.
 */
export function AbsentCell({ reason }: { reason?: string }) {
  return (
    <span className="text-slate-500" title={reason}>
      {DASH}
    </span>
  );
}

/**
 * A NAME THE FAMILY HOLDS THAT NO STATEMENT REPORTS — the whole-holding form of
 * everything above.
 *
 * An empty search result is an absent measurement exactly as a dashed cell is,
 * and it has the same obligation: say what is missing and what would supply it.
 * Without this the Portfolio Monitor answered a search for BSE with "No
 * holdings match “BSE”." — indistinguishable, to the reader, from the dashboard
 * having lost a ₹15 Cr position it never had.
 *
 * NO FIGURE IS SHOWN AND NONE IS AVAILABLE TO SHOW. The review is not a source,
 * so `ReviewGap` carries no value and no quantity at all (§"the consolidated
 * review workbook is not a source — by decision"). What renders is the name the
 * review prints, where it says the holding sits, and the document that would
 * let this book carry it properly.
 *
 * Renders nothing when the search names no such line, so an ordinary typo still
 * gets the caller's own plain empty state rather than a paragraph about the
 * review.
 */
export function AbsentFromBook({ query, className = "" }: { query: string; className?: string }) {
  const gaps = reviewGapsFor(query);
  if (!gaps.length) return null;
  return (
    <div data-absent-from-book className={`rounded-md border border-dashed border-ink-600/70 bg-ink-800/40 px-3 py-2.5 text-left ${className}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-champagne-400">
        <Info className="h-3.5 w-3.5" aria-hidden />
        {/* THE PROVENANCE LEADS, rather than sitting three lines below. "Held"
            on its own asserts more than the evidence does: what is known is
            that the family's own review names it and no statement reports it,
            and both halves belong in the first line a reader reads. */}
        on the consolidated review · no statement reports it
      </div>
      <ul className="space-y-2">
        {gaps.map((g) => (
          <li key={g.name} data-review-gap={g.name} className="text-xs leading-snug text-slate-300">
            <span className="font-semibold text-slate-100">{g.name}</span>
            {g.custodian && <span className="text-slate-400"> · {g.custodian}</span>}
            {/* The report renders these as table cells, where a lower-case
                opener is right; here each is a sentence of its own. */}
            <div className="text-slate-400">{g.why.charAt(0).toUpperCase() + g.why.slice(1)}.</div>
            <div className="text-slate-400">
              <span className="text-slate-500">What would close it: </span>{g.ask}.
            </div>
          </li>
        ))}
      </ul>
      {/* The provenance and the fence, in one line: this comes from the family's
          own review, it is dated, and no figure of its own is on this screen. */}
      <div className="mt-2 border-t border-ink-700/70 pt-1.5 text-[11px] leading-snug text-slate-500">
        From the family’s consolidated review as at {REVIEW_AS_OF}, which is a cross-check and not a
        source — so this book publishes no value or quantity for it until a statement arrives.
      </div>
    </div>
  );
}
