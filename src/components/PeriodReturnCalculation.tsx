import type { ReactNode } from "react";
import { MoneyWeightedCalculation } from "@/components/ReturnCalculation";
import { fmtDate } from "@/lib/format";
import { FORMULAS, INCEPTION_FORMULAS, type Measured, type ReturnType } from "@/lib/periodReturns";

/** Reads intermediate values from the selected card's calculation; never solves a second return. */
export function PeriodReturnCalculation({ measured, type, inception, result, context, accounts, excluded, money, shortMoney, stepMoney }: {
  measured: Measured | null; type: ReturnType; inception: boolean; result: ReactNode; context: ReactNode;
  accounts: { label: string; from: string; to: string; openedInWindow?: boolean }[];
  excluded: { label: string; reason: string }[];
  money: (n: number | null | undefined) => string;
  shortMoney: (n: number | null | undefined) => string;
  stepMoney: (n: number | null | undefined) => string;
}) {
  const w = measured?.working;
  const available = !!(measured?.shown && measured.pct != null && w);
  const formula = measured?.formula ?? (inception ? INCEPTION_FORMULAS : FORMULAS)[type];
  const precisePct = measured?.pct?.toFixed(Math.abs(measured.pct) < 0.005 ? 8 : 4);
  const weightedIn = w?.weighted?.reduce((s, f) => s + Math.max(f.weighted, 0), 0) ?? 0;
  const weightedOut = w?.weighted?.reduce((s, f) => s - Math.min(f.weighted, 0), 0) ?? 0;
  const factor = w?.growthRatio ?? (1 + (w?.periodPct ?? 0) / 100);
  const yearlyFactor = w ? factor ** (365 / w.days) : 0;
  const more = <>
    <div className="rounded-lg bg-ink-900 p-3" data-returns-formula={type}>
      <p className="font-medium text-slate-100">Detailed formula</p>
      <p className="mt-1 break-words tabular">{formula}</p>
      {measured?.worked && <p className="mt-2" data-returns-worked>{measured.worked}</p>}
      {!available && <p className="mt-2">{measured?.reason ?? "Pick a window whose opening date is before its closing date."}</p>}
    </div>
    {w && <>
      <dl data-return-amounts className="grid grid-cols-2 gap-x-4 gap-y-2">
        {[["Opening value", w.opening], ["Money added", w.capitalIn], ["Money taken out", w.capitalOut],
          ["Closing value", w.closing], ["Gain / loss", w.gain], ...(w.base != null ? [["Money used to divide the gain", w.base]] : [])].map(([label, amount]) =>
          <div className="contents" key={label}><dt className="text-slate-400">{label}</dt><dd className="text-right tabular">{money(amount as number)}</dd></div>)}
      </dl>
      {type !== "xirr" && <div className="overflow-x-auto">
        <p className="font-medium text-slate-100">{w.weighted ? "How the money at work is calculated" : "Amounts and dates used"}</p>
        <p className="my-2 text-xs text-slate-400">{w.weighted
          ? `Each amount × days remaining ÷ ${w.days} days. Money invested adds to the total; withdrawals and closing values subtract. Each account closes on its own valuation date.`
          : "Minus means money invested, including opening values. Plus means money taken out or a closing value."}</p>
        <table className="w-full text-xs" data-return-inputs data-table-static="Terms in the selected calculation, in calculation order">
          <thead><tr className="text-slate-400"><th className="py-2 text-left font-medium">Date</th><th className="py-2 text-right font-medium">Amount</th>
            {w.weighted && <th className="py-2 pl-3 text-right font-medium">Days / {w.days} × amount</th>}</tr></thead>
          <tbody>{w.weighted ? w.weighted.map((f, i) => <tr key={i} className="border-t border-ink-700">
            <td className="py-1.5">{fmtDate(f.date)}</td><td className="py-1.5 text-right tabular">{money(f.amount)}</td>
            <td className="py-1.5 pl-3 text-right tabular">{f.days} / {w.days} × {money(f.amount)} = {money(f.weighted)}</td>
          </tr>) : w.flows.map((f, i) => <tr key={i} className="border-t border-ink-700">
            <td className="py-1.5">{fmtDate(f.date.toISOString().slice(0, 10))}</td><td className="py-1.5 text-right tabular">{f.amount > 0 ? "+" : ""}{money(f.amount)}</td>
          </tr>)}</tbody>
          {w.weighted && <tfoot><tr className="border-t border-ink-600"><th colSpan={2} className="py-2 text-left font-medium">Total money at work</th><td className="py-2 text-right tabular">{money(w.base)}</td></tr></tfoot>}
        </table>
      </div>}
      <p className="text-xs text-slate-400">Amounts are rounded for display. The return uses full precision.</p>
    </>}
    {!!accounts.length && <div data-return-included>
      <p className="font-medium text-slate-100">Accounts used</p>
      <ul className="mt-2 space-y-2 text-xs text-slate-400">{accounts.map((a, i) => <li key={i}><span className="text-slate-200">{a.label}</span><br />{fmtDate(a.from)} → {fmtDate(a.to)}</li>)}</ul>
      {w?.opening === 0 && !inception && accounts.every((a) => a.openedInWindow) && <p className="mt-2 text-xs text-slate-400">These accounts first invested inside the selected period, so their opening value is zero. This is not the whole portfolio’s opening value.</p>}
    </div>}
    {!!excluded.length && <div data-return-excluded>
      <p className="font-medium text-slate-100">{excluded.length} accounts excluded</p>
      <p className="mt-1 text-xs text-slate-400">Excluded accounts are not counted as zero returns. We need an opening valuation (or a complete record from the first investment), dated money in and out, and a later closing valuation to include an account.</p>
      <ul className="mt-3 space-y-3 text-xs">{excluded.map((a, i) => <li key={i}><span className="font-medium text-slate-200">{a.label}</span><p className="text-slate-400">{a.reason}</p></li>)}</ul>
    </div>}
  </>;

  return <>
    <div data-return-context className="space-y-1 text-xs text-slate-400">{context}</div>
    {type === "xirr" ? <MoneyWeightedCalculation flows={w?.flows ?? []} annualPct={w?.annualPct ?? null}
      days={w?.days ?? null} annualised={measured?.basis === "annual"} reason={available ? null : measured?.reason ?? "No return can be measured on this window"}
      coverage={null} result={result} money={money} shortMoney={shortMoney} more={more} /> : <>
      <ol data-return-steps className="list-decimal space-y-3 pl-5">
        {!available || !w ? <>
          <li>{measured?.reason ?? "Pick a window whose opening date is before its closing date."}</li>
          <li>{type === "cagr" && measured?.reason?.includes("at least 365 days")
            ? "A 1Y, 2Y, 3Y or longer custom period can show CAGR if enough valuation and cash-flow history is available."
            : "This return is unavailable for the selected dates. The missing records are listed under Show more."}</li>
        </> : <>
          <li>Gain / loss: <span className="block tabular">{stepMoney(w.closing)} − {stepMoney(w.opening)} − {stepMoney(w.capitalIn)} + {stepMoney(w.capitalOut)} = <strong>{stepMoney(w.gain)}</strong>.</span></li>
          {/* A dated window's Absolute return is Modified Dietz (Stage 10fx), so it
              carries the same day-weighted money at work as CAGR; only since
              investment is it the simple gain over what was paid in. */}
          <li>{type === "absolute" && !w.weighted ? <>Money invested: <span className="block tabular">{stepMoney(w.opening)} + {stepMoney(w.capitalIn)} = <strong>{stepMoney(w.base)}</strong>.</span></>
            : w.growthRatio != null ? <>Growth: <span className="block tabular">{stepMoney(w.closing)} ÷ {stepMoney(w.capitalIn)} = <strong>{factor.toFixed(8)}</strong>.</span></>
            : <>Count each amount only for the days held (Modified Dietz). Money at work: <span className="block tabular">{stepMoney(weightedIn)} − {stepMoney(weightedOut)} = <strong>{stepMoney(w.base)}</strong>.</span></>}</li>
          <li data-return-conversion>{type === "cagr" ? <>
            {w.growthRatio == null && <span className="block tabular">Period growth: 1 + {stepMoney(w.gain)} ÷ {stepMoney(w.base)} = {factor.toFixed(8)}.</span>}
            <span className="block tabular">Yearly growth: {factor.toFixed(8)}<sup>(365/{w.days})</sup> = {yearlyFactor.toFixed(8)}.</span>
            <span className="block tabular">({yearlyFactor.toFixed(8)} − 1) × 100 = {precisePct}% → <strong>{result}</strong> a year.</span>
          </> : <span className="block tabular">({stepMoney(w.gain)} ÷ {stepMoney(w.base)}) × 100 = {precisePct}% → <strong>{result}</strong>.</span>}</li>
        </>}
      </ol>
      {available && measured?.pct != null && Math.abs(measured.pct) < 0.005 && <p className="text-xs text-slate-400" data-return-rounding>This is a small {measured.pct < 0 ? "loss" : measured.pct > 0 ? "gain" : "change"}. {precisePct}% rounds to {result} at two decimal places.</p>}
      <details data-return-more><summary className="ring-focus cursor-pointer rounded text-slate-300">Show more</summary><div className="mt-4 space-y-4">{more}</div></details>
    </>}
  </>;
}
