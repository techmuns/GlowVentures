import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { DatedFlow } from "@/lib/xirr";
import { xirrWorking } from "@/lib/xirrWorking";

/** The result is the tile's own rendered value, never a second calculation. */
export function ReturnCalculationInfo({ label, value, children }: {
  label: string; value: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const modal = dialog.current!;
    const overflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = overflow;
      button.current?.focus();
    };
  }, [open]);

  return <>
    <button ref={button} type="button" aria-label={`How is ${label.toLowerCase()} calculated?`}
      aria-haspopup="dialog" aria-expanded={open} data-return-info
      title="How is this return calculated?" onClick={() => setOpen(true)}
      className="pointer-events-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 ring-focus hover:bg-ink-700 hover:text-slate-100">
      <Info className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && createPortal(<dialog ref={dialog} aria-labelledby={titleId} data-return-calculation
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const stops = [...event.currentTarget.querySelectorAll<HTMLElement>("button, summary, a[href], input, select, textarea, [tabindex]")]
          .filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && el.getClientRects().length > 0);
        const first = stops[0], last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
      }}
      className="return-calculation fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-ink-600 bg-ink-800 p-0 text-slate-200 shadow-card">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">How this return is calculated</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-100">{label}</h2>
          </div>
          <button type="button" autoFocus aria-label="Close return calculation" onClick={() => setOpen(false)}
            className="ring-focus rounded p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div data-return-result className="mt-4 text-3xl font-bold tabular text-slate-100">{value}</div>
        <div className="mt-4 space-y-4 text-sm leading-relaxed">{children}</div>
      </div>
    </dialog>, document.body)}
  </>;
}

export function CapitalReturnCalculation({ gain, capital, result, money, shortMoney, coverage }: {
  gain: number | null; capital: number | null; result: ReactNode;
  money: (n: number | null | undefined) => string;
  shortMoney: (n: number | null | undefined) => string; coverage: ReactNode;
}) {
  return <>
    <ol data-return-steps className="list-decimal space-y-3 pl-5">
      <li>Money invested: <strong className="tabular">{shortMoney(capital)}</strong>.</li>
      <li>Recorded gain / loss: <strong className="tabular">{shortMoney(gain)}</strong>.</li>
      <li>{gain != null && capital != null && capital > 0
        ? <>Divide the gain by the money invested to get <strong>{result}</strong>.</>
        : <>We need a recorded gain and money invested before we can show a return.</>}</li>
    </ol>
    <details data-return-more>
      <summary className="ring-focus cursor-pointer rounded text-slate-300">Show more</summary>
      <div className="mt-4 space-y-4">
    <p>We add the recorded gain on investments still held to the recorded gain on investments already sold. Then we divide by the money invested.</p>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <dt className="text-slate-400">Recorded gain / loss</dt><dd className="text-right tabular">{money(gain)}</dd>
      <dt className="text-slate-400">Money invested</dt><dd className="text-right tabular">{money(capital)}</dd>
    </dl>
    <div className="rounded-lg bg-ink-900 p-3" data-return-formula>
      <p className="font-medium text-slate-100">Return = (gain ÷ money invested) × 100</p>
      {gain != null && capital != null && capital > 0
        ? <p className="mt-2 break-words tabular">({money(gain)} ÷ {money(capital)}) × 100 = {result}</p>
        : <p className="mt-2">The recorded gain and a positive invested amount are needed before we can show a percentage.</p>}
    </div>
    <p>Sales use the oldest purchases first (FIFO). For a whole PMS account, gain = value + money withdrawn − money paid in.</p>
    <p className="text-slate-400">{coverage} This is the total return to date, not a yearly rate. Separate dividends and fund distributions are excluded, except within a whole PMS account.</p>
      </div>
    </details>
  </>;
}

export function MoneyWeightedCalculation({ flows, annualPct, days, annualised, reason, coverage, money, shortMoney, result, more }: {
  flows: readonly DatedFlow[]; annualPct: number | null; days: number | null; annualised: boolean;
  reason?: string | null; coverage: ReactNode; result: ReactNode;
  money: (n: number | null | undefined) => string;
  shortMoney: (n: number | null | undefined) => string;
  more?: ReactNode;
}) {
  const dated = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const paid = -flows.reduce((n, f) => n + Math.min(f.amount, 0), 0);
  const returned = flows.reduce((n, f) => n + Math.max(f.amount, 0), 0);
  const working = xirrWorking(flows, annualPct, days, annualised);
  const unavailable = reason ?? (working ? null : "The recorded amounts or dates do not support this calculation");
  return <>
    <ol data-return-steps className="list-decimal space-y-3 pl-5">
      {unavailable || !working ? <>
        <li>{unavailable}.</li>
        <li>No return can be calculated from these records yet.</li>
      </> : <>
        <li>Gain: <strong className="tabular">{shortMoney(returned)} − {shortMoney(paid)} = {shortMoney(working.gain)}</strong>.</li>
        <li>Try a yearly rate until dated money in and back match. At <strong>{fmtNum(annualPct!, 6)}%</strong>, both equal <strong>{shortMoney(working.paidAtStart)}</strong> on {fmtDate(working.start)}.</li>
        <li data-return-conversion>
          <span className="block tabular">Yearly growth: 1 + {fmtNum(annualPct!, 6)} ÷ 100 = {working.yearFactor.toFixed(6)}.</span>
          {!annualised && <span className="mt-1 block tabular">{fmtNum(days!)}-day growth: {working.yearFactor.toFixed(6)}<sup>({days}/365)</sup> = {working.growthFactor.toFixed(6)}.</span>}
          <span className="mt-1 block tabular">({working.growthFactor.toFixed(6)} − 1) × 100 = {fmtPct(working.pct, { decimals: 4 })} → <strong>{result}</strong>{annualised ? " per year" : ""}.</span>
        </li>
      </>}
    </ol>
    <details data-return-more>
      <summary className="ring-focus cursor-pointer rounded text-slate-300">Show more</summary>
      <div className="mt-4 space-y-4">
    {working && !unavailable && <>
      <p>The matching yearly rate is the calculation's intermediate step. {annualised ? "The card shows that yearly rate." : `The card converts it to the ${days} days measured.`} It is found by trying rates until money paid in and money returned have the same value on the first date.</p>
      <dl data-return-date-balance className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt>Money in, valued on {fmtDate(working.start)}</dt><dd className="text-right tabular">{money(working.paidAtStart)}</dd>
        <dt>Money back, valued on {fmtDate(working.start)}</dt><dd className="text-right tabular">{money(working.returnedAtStart)}</dd>
      </dl>
    </>}
    <p>We use how much money went in and came out, the closing investment values, and the date of each amount. Money invested for longer has more effect on the return.</p>
    <p className="text-slate-400">{coverage}</p>
    {reason ? <p className="rounded-lg bg-ink-900 p-3">{reason}. This return needs opening values, dated money movements and closing values, with at least a year of history for a yearly rate.</p> : <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-slate-400">Opening values + money put in</dt><dd className="text-right tabular">{money(paid)}</dd>
        <dt className="text-slate-400">Money taken out + closing values</dt><dd className="text-right tabular">{money(returned)}</dd>
        <dt className="text-slate-400">Period</dt><dd className="text-right">{dated.length ? `${fmtDate(dated[0].date.toISOString().slice(0, 10))} to ${fmtDate(dated[dated.length - 1].date.toISOString().slice(0, 10))}` : "Dates unavailable"}</dd>
        <dt className="text-slate-400">Time covered</dt><dd className="text-right">{days == null ? "Dates unavailable" : `${fmtNum(days)} days`}</dd>
      </dl>
    </>}
      <div className="rounded-lg bg-ink-900 p-3" data-return-formula>
        <p className="font-medium text-slate-100">Yearly rate = XIRR(amounts, dates)</p>
        <p className="mt-1 text-slate-400">XIRR finds the yearly growth rate that makes the dated money going in and coming back balance.</p>
        {annualised ? !reason && <p className="mt-2">Yearly return = {result}</p> : <>
          <p className="mt-3 font-medium text-slate-100">Return = ((1 + yearly rate ÷ 100) ^ (days ÷ 365) − 1) × 100</p>
          <p className="mt-1 text-slate-400">We convert the yearly rate to the period measured. The ^ sign means “raised to the power of”.</p>
          {!reason && annualPct != null && days != null && <p className="mt-2 break-words tabular">((1 + {fmtNum(annualPct, 6)} ÷ 100) ^ ({days} ÷ 365) − 1) × 100 = {result}</p>}
        </>}
      </div>
      {!reason && <div>
        <p className="font-medium text-slate-100">Amounts and dates used</p>
        <p className="my-2 text-xs text-slate-400">Minus means money invested, including opening values. Plus means money taken out or a closing value. Amounts are rounded for display; the calculation uses full precision.</p>
        <table className="w-full text-xs">
          <thead><tr className="text-slate-400"><th className="py-2 text-left font-medium">Date</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>{dated.map((f, i) => <tr key={i} className="border-t border-ink-700"><td className="py-1.5">{fmtDate(f.date.toISOString().slice(0, 10))}</td><td className="py-1.5 text-right tabular">{f.amount > 0 ? "+" : ""}{money(f.amount)}</td></tr>)}</tbody>
        </table>
      </div>}
      {more}
      </div>
    </details>
  </>;
}
