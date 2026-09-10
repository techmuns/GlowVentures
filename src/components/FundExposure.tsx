/**
 * ── "AND ANOTHER Y CRORES THROUGH THESE FIVE FUNDS" ─────────────────────────
 *
 *   "If today I want to know that my public market portfolio is a thousand
 *    crores, how much HDFC Bank do I hold in my 1,000 crores? … Then I drill
 *    down, then you tell me direct you hold X Cr through direct equity, and then
 *    you hold another Y crores through these five funds."
 *
 * The first half of that sentence is the book's own: a direct holding and a PMS
 * mandate both REPORT THE SHARE, so the Portfolio Monitor's stock axis clubs
 * them and the venue table above this says which account each came from.
 *
 * This is the second half, and it is a DIFFERENT KIND OF FIGURE. Nobody reported
 * that this family holds HDFC Bank inside a mutual fund; the AMC disclosed what
 * the FUND holds, and the family's share of it is derived from the units they
 * own. So it renders apart from the book's own figures, states that it is
 * derived, names the disclosure's own date, and is never added to a book total.
 *
 * IT IS HANDED THE PAGE'S OWN INDEX RATHER THAN FETCHING ITS OWN. The row above
 * prints this company's derived total in its `Via funds` cell, and this card
 * itemises the same figure fund by fund. Two loads would be two chances for the
 * cell and the card to state different numbers about one company — the failure
 * `drilldown.ts` exists to stop for the book's own figures, arriving through a
 * derived one. `loadStockExposure` is the single join and both read its result.
 *
 * THREE ABSENCES ARE NAMED RATHER THAN LEFT TO BE INFERRED, because on this card
 * a silent zero would read as "you hold none of it through funds":
 *   • a store that did not answer is a fact about the FETCH and is worded as one;
 *   • the vehicles this store cannot speak for are counted, listed and valued;
 *   • an AIF publishes nothing this book can join AT ALL, and that is a fact
 *     about the instrument rather than a gap in the store, so it is worded as
 *     one — see `skipReason` in `lookthrough.ts`.
 *
 * AND WHILE IT IS LOADING IT RENDERS NOTHING AT ALL, at the family's request —
 * *"remove the highlighted texts from the dashboard UI completely."* That is a
 * removal of a SENTENCE and not of the state: the load-bearing half was never
 * the words, it was that a card still fetching must NOT print "none of the N
 * funds discloses this name", which is a claim about the holding made before
 * anything has been read. Rendering nothing asserts nothing, so the guard is
 * intact and the reader sees the card appear rather than a line telling them to
 * wait for it. The lists are memoised, so the gap is one fetch on first use.
 * `check:pages` asserts the words are gone AND that the none-branch is still
 * unreachable from `loading` — a version that fell through to it would satisfy
 * the first and be exactly the defect.
 */
import { Link } from "react-router-dom";
import type { StockExposureState } from "@/lib/lookthrough";
import { stockHref } from "@/lib/auditFormulas";
import { fmtPct } from "@/lib/format";
import { AbsentCell } from "@/components/Absent";

export function FundExposure({ exposure, securityKey, money }: {
  /** The page's own index — never re-fetched here. */
  exposure: StockExposureState;
  securityKey: string;
  money: (n: number) => string;
}) {
  // NOTHING, NEVER THE NONE-BRANCH. See the note above: the words went at the
  // family's request; falling through to the card below would print a claim
  // about the holding before a single disclosure had been read.
  if (exposure.status === "loading") return null;
  if (exposure.status === "unreachable") {
    return <p className="mt-2 text-[11px] text-amber-400/80" data-fund-exposure="unreachable">
      The fund look-through store did not answer, so it is not known whether your funds hold this name.
      That is a fact about the fetch, not about the holding.
    </p>;
  }

  const { covered, considered, skipped } = exposure;
  const hit = exposure.byKey.get(securityKey);
  const rows = hit?.rows ?? [];
  const total = hit?.total ?? 0;
  // AN AIF IS A DIFFERENT ABSENCE FROM AN UNREADABLE SCHEME, so it is counted
  // apart: no drop of the current statements can ever fill the first.
  const aif = skipped.filter((s) => /^an AIF files/.test(s.reason));
  const other = skipped.filter((s) => !/^an AIF files/.test(s.reason));
  const aifValue = aif.reduce((a, s) => a + s.marketValue, 0);

  return (
    <div className="mt-2.5 rounded-lg border border-dashed border-ink-600/70 px-3 py-2" data-fund-exposure={rows.length ? "ok" : "none"}>
      <p className="text-[11px] leading-relaxed text-slate-400">
        <span className="font-medium text-slate-300">Held inside your funds</span>
        {rows.length > 0
          ? <> — <span className="font-medium text-slate-200" data-fund-exposure-total>{money(total)}</span> of this
              name sits inside {rows.length} of the {covered} fund{covered === 1 ? "" : "s"} this store can read.</>
          : <> — none of the {covered} fund{covered === 1 ? "" : "s"} this store can read discloses this name.</>}
        {" "}
        <span className="text-slate-500">
          DERIVED, not a position: the AMC disclosed what the FUND holds and this is your units&rsquo; share of it.
          It is <span className="font-medium text-slate-400">no part of the book&rsquo;s own NAV</span> —
          the fund&rsquo;s own value already stands for it there, and counting both would count the same money twice.
        </span>
      </p>
      {rows.length > 0 && (
        <div className="mt-1.5 overflow-x-auto rounded border border-ink-700 bg-ink-800">
          <table className="min-w-full text-[12px]">
            <thead>
              <tr className="border-b border-ink-700/70">
                <th className="label-xs px-3 py-1.5 text-left font-medium">Through this fund</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">You hold of the fund</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">Fund&rsquo;s weight in it</th>
                <th className="label-xs px-3 py-1.5 text-right font-medium">Your derived share</th>
                <th className="label-xs px-3 py-1.5 text-left font-medium">Disclosed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/50">
              {rows.map((r) => (
                <tr key={r.fundKey} data-fund-exposure-row={r.via}>
                  <td className="px-3 py-1.5 text-slate-200">
                    <Link to={stockHref(r.fundKey)}
                      className="underline decoration-dotted decoration-slate-500/40 underline-offset-[3px] transition-colors hover:text-champagne-400 hover:decoration-champagne-500">
                      {r.fundName}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right mono text-slate-300 whitespace-nowrap">{money(r.holdingValue)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-400">{fmtPct(r.pctAum)}</td>
                  <td className="px-3 py-1.5 text-right mono text-slate-100 whitespace-nowrap">{money(r.value)}</td>
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                    {r.holdingsAsOf ?? <AbsentCell reason="this scheme's disclosure carries no as-of date" />}
                    {r.sourceKind === "amc" ? " · the AMC's own filing" : r.sourceKind ? " · via an aggregator" : ""}
                    {r.via === "name" ? " · matched on name" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* WHAT THIS FIGURE CANNOT SEE, counted rather than claimed. */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        Read across {covered} of your {considered} fund holdings, EQUITY ONLY — a scheme&rsquo;s debt and cash sleeves
        are outside this store.
        {other.length > 0 && <> {other.length} could not be read: {other.map((s) => s.fundName).join(", ")}.</>}
        {aif.length > 0 && <> Your {aif.length} AIF folio{aif.length === 1 ? "" : "s"} ({money(aifValue)}) file no
          portfolio disclosure this book can join, so nothing held inside them is visible here at all.</>}
      </p>
    </div>
  );
}
