// ── THE RETURNS TAB'S BENCHMARK RETURN CELL (Stage 10mr) ─────────────────────
//
// The index the row's own dated money would have earned (`lineBenchmark.ts`),
// on the Return column's measure: the index's short name, its figure, and an
// info card naming every index used, on how much money, why, and what is left out.
import { AbsentCell } from "@/components/Absent";
import { ReturnCalculationInfo } from "@/components/ReturnCalculation";
import { BENCH_SHORT } from "@/lib/holdingBenchmark";
import type { LineBenchmark } from "@/lib/lineBenchmark";
import type { ReturnType } from "@/lib/periodReturns";
import { changeColor, fmtDate } from "@/lib/format";

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const PRICE_BASIS = "Price indices: dividends are not in them.";
export const BENCH_HOW = "Every rupee behind the row's return — its opening value and each dated payment in or out — goes into that holding's own index on the day it moved and closes on the same date; the Return column's measure is then struck over it.";

export function LineBenchmarkCell({ label, b, pad, requested, money }: {
  label: string; b: LineBenchmark; pad: string; requested: ReturnType; money: (n: number) => string;
}) {
  const blend = b.uses.length > 1;
  const short = !b.uses.length ? null : blend ? "Blend" : BENCH_SHORT[b.uses[0].bench.key];
  const partial = b.pct != null && b.left.length > 0;
  const abs = b.shownAs === "absolute" && requested !== "absolute";
  const gap = b.pct != null && b.book != null ? b.book - b.pct : null;
  const title = b.pct == null ? b.reason ?? undefined
    : [blend ? `A blend of ${b.uses.map((u) => u.bench.name).join(", ")}, each on its own holdings' money.` : `${b.uses[0].bench.name}. ${b.uses[0].why ?? "Each holding's own reason is on its own row."}`,
      gap != null ? `This row ${gap >= 0 ? "is ahead of" : "trails"} it by ${Math.abs(gap).toFixed(2)} percentage points${partial ? " on the same holdings" : ""}.` : null,
      partial ? `Left out: ${b.left.length} holding${b.left.length === 1 ? "" : "s"} with no index or no dated money (${money(b.left.reduce((s, l) => s + l.invested, 0))}).` : null,
    ].filter(Boolean).join(" ");
  return <td data-seg-cell="bench" data-bench-currency="INR" data-bench-return={b.pct ?? ""} data-bench-book={b.book ?? ""} data-bench-keys={b.uses.map((u) => u.bench.key).join(" ")}
    data-bench-covered={b.coveredInvested} data-bench-total={b.totalInvested} data-bench-left={b.left.length} data-bench-pending={b.pending ? "" : undefined}
    data-bench-shown-as={b.shownAs ?? undefined} data-bench-from={b.from ?? undefined} data-bench-to={b.to ?? undefined} className={`${pad} text-right mono ${changeColor(b.pct)}`}>
    <span className="inline-flex items-center justify-end gap-1" title={title}>
      {short && <span className="text-[10px] font-normal text-slate-500" data-bench-label>{short}</span>}
      {b.pct != null ? <>{abs && <span className="ret-tag">ABS</span>}{pct(b.pct)}{b.annual && <span className="text-[10px]">p.a.</span>}
        {partial && <span className="text-[10px] text-amber-400/80">◦</span>}</>
        : b.pending ? <span className="text-slate-400">Loading…</span>
        : <AbsentCell reason={b.reason ?? undefined} label={b.left.length > 0 && b.left.every((l) => l.noIndex) ? "No index" : undefined} />}
      {(b.uses.length > 0 || b.left.length > 0) && <ReturnCalculationInfo label={`${label} benchmark return`} value={b.pct == null ? "—" : pct(b.pct)}
        intro="Which index, on which money" triggerLabel={`Which benchmark is ${label} compared with?`}>
        <div className="space-y-3 text-[12px] leading-relaxed text-slate-300" data-bench-details>
          <p>The comparison uses INR cash flows. Changing the display currency does not change this return percentage.</p>
          <p>{BENCH_HOW} {PRICE_BASIS}</p>
          {b.uses.length > 0 && <ul className="space-y-1.5" data-bench-uses>{b.uses.map((u) => <li key={u.bench.key} data-bench-use={u.bench.key}>
            <span className="font-medium text-slate-100">{u.bench.name}</span> · {money(u.invested)} over {u.units} record{u.units === 1 ? "" : "s"}
            <span className="block text-[11px] text-slate-400">{u.why ?? "Each holding's own reason is on its own row."}</span></li>)}</ul>}
          {b.pct != null && b.from && b.to && <p data-bench-dates>The index is bought from {fmtDate(b.from)} and each record closes on its own last value date, the latest {fmtDate(b.to)}.</p>}
          {b.pct != null && b.book != null && <p data-bench-compare>Over the same {money(b.coveredInvested)}: this row {pct(b.book)}, the index {pct(b.pct)}{gap != null && <> — <span className={changeColor(gap)}>{gap >= 0 ? "+" : ""}{gap.toFixed(2)} pp</span></>}.</p>}
          {b.left.length > 0 && <div data-bench-left-list><p className="font-medium text-slate-100">Left out of both sides ({money(b.left.reduce((s, l) => s + l.invested, 0))} of {money(b.totalInvested)})</p>
            <ul className="mt-1 space-y-1 text-[11px] text-slate-400">{b.left.map((l, i) => <li key={i}>{l.label} · {money(l.invested)} — {l.why}</li>)}</ul></div>}
        </div>
      </ReturnCalculationInfo>}
    </span>
  </td>;
}
