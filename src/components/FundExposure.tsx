/**
 * ── "AND ANOTHER Y CRORES THROUGH THESE FIVE FUNDS" ─────────────────────────
 *
 *   "If today I want to know that my public market portfolio is a thousand
 *    crores, how much HDFC Bank do I hold in my 1,000 crores? … Then I drill
 *    down, then you tell me direct you hold X Cr through direct equity, and then
 *    you hold another Y crores through these five funds."
 *
 * The first half of that sentence is the book's own: a direct holding and a PMS
 * mandate both REPORT THE SHARE, so the Portfolio Monitor's security axis clubs
 * them and the venue table above this says which account each came from.
 *
 * This is the second half, and it is a DIFFERENT KIND OF FIGURE. Nobody reported
 * that this family holds HDFC Bank inside a mutual fund; the AMC disclosed what
 * the FUND holds, and the family's share of it is derived from the units they
 * own. So it renders apart from the book's figures, states that it is derived,
 * names the disclosure's own date, and is never added to anything.
 *
 * FOUR ABSENCES ARE NAMED RATHER THAN LEFT TO BE INFERRED, because on this card
 * a silent zero would read as "you hold none of it through funds":
 *   • still loading is said, never rendered as none;
 *   • a store that did not answer is a fact about the FETCH and is worded as one;
 *   • the funds this store cannot speak for are counted and listed;
 *   • AIF folios and ETFs publish nothing this book can join at all, so the
 *     coverage line says which vehicles the figure can and cannot see.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadFundExposure, type FundExposureState, type HeldFund } from "@/lib/lookthrough";
import { stockHref } from "@/lib/auditFormulas";
import { fmtPct } from "@/lib/format";
import { AbsentCell } from "@/components/Absent";

export function FundExposure({ target, funds, money, aifCount, aifValue }: {
  target: { securityKey: string; isin?: string | null };
  funds: HeldFund[];
  money: (n: number) => string;
  /** AIF folios the family holds — no look-through exists for any of them. */
  aifCount: number;
  aifValue: number;
}) {
  const [state, setState] = useState<FundExposureState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadFundExposure(target, funds).then((s) => { if (live) setState(s); });
    return () => { live = false; };
    // The target's identity and the funds' values are what the answer depends on.
  }, [target.securityKey, target.isin, funds]);

  if (state.status === "loading") {
    return <p className="mt-2 text-[11px] text-slate-500" data-fund-exposure="loading">
      Checking which of your funds disclose this name…
    </p>;
  }
  if (state.status === "unreachable") {
    return <p className="mt-2 text-[11px] text-amber-400/80" data-fund-exposure="unreachable">
      The fund look-through store did not answer, so it is not known whether your funds hold this name.
      That is a fact about the fetch, not about the holding.
    </p>;
  }

  const { rows, total, covered, considered, skipped } = state;
  return (
    <div className="mt-2.5 rounded-lg border border-dashed border-ink-600/70 px-3 py-2" data-fund-exposure={rows.length ? "ok" : "none"}>
      <p className="text-[11px] leading-relaxed text-slate-400">
        <span className="font-medium text-slate-300">Also held inside your funds</span>
        {rows.length > 0
          ? <> — a further <span className="font-medium text-slate-200" data-fund-exposure-total>{money(total)}</span> of this
              name sits inside {rows.length} of the {covered} fund{covered === 1 ? "" : "s"} this store can read.</>
          : <> — none of the {covered} fund{covered === 1 ? "" : "s"} this store can read discloses this name.</>}
        {" "}
        <span className="text-slate-500">
          DERIVED, not a position: the AMC disclosed what the FUND holds and this is your units&rsquo; share of it.
          It is <span className="font-medium text-slate-400">not in the figures above and not in the book&rsquo;s total</span> —
          the fund&rsquo;s own value already stands for it, and counting both would count the same money twice.
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
        {skipped.length > 0 && <> {skipped.length} could not be read: {skipped.map((s) => s.fundName).join(", ")}.</>}
        {aifCount > 0 && <> Your {aifCount} AIF folio{aifCount === 1 ? "" : "s"} ({money(aifValue)}) publish no portfolio
          disclosure this book can join, so nothing held inside them is visible here at all.</>}
      </p>
    </div>
  );
}
