import { AbsentCell } from "@/components/Absent";
import { fmtInvestedDate, investedOnTitle, investmentDateOf, investmentDateMissingReason, type InvestedOn, type InvestmentDateScope } from "@/lib/investedOn";

export function InvestmentDateCell({ scope, date }: { scope?: InvestmentDateScope; date?: InvestedOn | null }) {
  const d = date === undefined ? investmentDateOf(scope) : date;
  return <td data-col-cell="investedOn" data-invested-first={d?.first ?? ""} data-invested-last={d?.last ?? ""}
    className="px-3 py-2 text-left mono whitespace-nowrap text-xs text-slate-400">
    <InvestedOnCell d={d} why={d ? "" : investmentDateMissingReason(scope)} />
  </td>;
}

/**
 * AN INVESTED-ON DATE, AS EVERY HOLDINGS TABLE PRINTS IT (Stage 10fm) — the
 * first date, and then either how many more dated payments follow it or, where
 * the source dates a span and not each payment (the review's range, an
 * account's inception alone), the last. A month the source prints as a month
 * stays one. Absent, with the caller's reason, where nothing dates it.
 */
export function InvestedOnCell({ d, why, more = "" }: { d: InvestedOn | null; why: string; more?: string }) {
  if (d === null) return <AbsentCell reason={why} />;
  return (
    <span title={`${investedOnTitle(d)}${more}`} data-invested-sources={d.sources.join(" ")}>
      {fmtInvestedDate(d.first)}
      {d.payments !== null && d.payments > 1
        ? <span className="ml-1 text-[10px] text-slate-500">+{d.payments - 1}</span>
        : d.payments === null && d.last !== d.first
          ? <span className="ml-1 text-[10px] text-slate-500">→ {fmtInvestedDate(d.last)}</span>
          : null}
      {d.reviewSource && <span className="ml-1 text-[10px] text-slate-500">review</span>}
    </span>
  );
}
