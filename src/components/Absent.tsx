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
