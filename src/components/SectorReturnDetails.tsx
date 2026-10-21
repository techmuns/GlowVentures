import { ReturnCalculationInfo } from "./ReturnCalculation";
import { AbsentCell } from "./Absent";
import { hasSectorReturnCost, sectorReturnHolding } from "@/lib/sectorReturnCoverage";
import { fifoTotals } from "@/lib/fifo";
import { fmtDate, fmtPct } from "@/lib/format";
import type { AccountIndex } from "@/lib/accounts";
import type { Position } from "@/lib/types";

export function SectorReturnDetails({ sector, positions, accounts, returnPct, reason, fundValue, live, money }: {
  sector: string; positions: Position[]; accounts: AccountIndex;
  returnPct: number | null; reason: string | null; fundValue: number; live?: boolean;
  money: (n: number | null | undefined) => string;
}) {
  const included = positions.filter(hasSectorReturnCost);
  const excluded = positions.filter(p => !hasSectorReturnCost(p)).map(p => sectorReturnHolding(p, accounts));
  const otherGaps = included.filter(p => p.hprUnavailableReason || p.valuedAtCost).map(p => sectorReturnHolding(p, accounts));
  const fifo = fifoTotals(included);
  const result = returnPct === null ? <AbsentCell reason={reason ?? "A return is not available yet"} /> : fmtPct(returnPct, { sign: true });
  const plural = (n: number) => n === 1 ? "holding" : "holdings";
  const identity = (h: ReturnType<typeof sectorReturnHolding>) => <>
    <p className="font-semibold text-slate-100">{h.position.security}</p>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-slate-400">Owner</dt><dd>{h.owner}</dd>
      <dt className="text-slate-400">Statement</dt><dd>{h.provider}{h.statementDate ? ` · ${fmtDate(h.statementDate)}` : " · date not recorded"}</dd>
      <dt className="text-slate-400">Account</dt><dd className="break-all">{h.accountNo}</dd>
    </dl>
  </>;

  return <ReturnCalculationInfo label={`${sector} return`} value={result}
    intro="What is included and what is missing"
    triggerLabel={`See ${sector} return and missing holding details`}
    trigger={<><span data-return-figure={returnPct === null ? undefined : ""}>{result}</span>
      {included.length < positions.length && <span className="ml-1 text-[10.5px] text-slate-500" data-return-coverage>{included.length} of {positions.length}</span>}</>}>
    <div data-sector-return-details data-sector={sector}>
      <p className="font-medium text-slate-100" data-sector-return-summary>
        {positions.length === 0 ? "This sector is held only through funds."
          : returnPct !== null
            ? `This return uses ${included.length} of ${positions.length} ${plural(positions.length)}.`
            : `Purchase cost is available for ${included.length} of ${positions.length} ${plural(positions.length)}.`}
      </p>
      <p className="mt-1 text-slate-400">{excluded.length
        ? `${excluded.length} ${plural(excluded.length)} ${excluded.length === 1 ? "is" : "are"} left out because ${excluded.length === 1 ? "its" : "their"} purchase cost is missing or unverified.`
        : positions.length ? "No holdings are left out for missing purchase cost." : "There are no stock holdings in your accounts in this sector."}</p>
      <p className="mt-2 text-xs text-slate-400">One stock held in two accounts counts as two holdings.</p>
    </div>

    {excluded.length > 0 && <section aria-label="Holdings left out" data-sector-return-excluded>
      <h3 className="font-semibold text-slate-100">What is missing</h3>
      <ul className="mt-2 space-y-3">{excluded.map((h, i) => <li key={`${h.position.accountId}:${h.position.securityKey}:${i}`}
        data-missing-holding data-account={h.position.accountId} data-security={h.position.securityKey}
        className="rounded-lg border border-ink-600 bg-ink-900 p-3">
        {identity(h)}
        <p className="mt-3 font-medium text-amber-400">{h.missing}</p>
        <p className="mt-1 text-xs text-slate-300">Needed: a purchase record or broker cost report showing what was paid for this holding in this account.</p>
      </li>)}</ul>
    </section>}

    {returnPct === null && <section className="rounded-lg border border-ink-600 p-3" data-sector-return-unavailable>
      <h3 className="font-semibold text-slate-100">Why there is no return yet</h3>
      {otherGaps.length ? <ul className="mt-2 space-y-3">{otherGaps.map((h, i) => <li key={i}>
        {identity(h)}<p className="mt-2">{h.position.hprUnavailableReason || "There is a purchase cost, but no separate valuation to measure a gain or loss."}</p>
      </li>)}</ul> : <p className="mt-1">{positions.length === 0
        ? "Shares held inside funds have no separate purchase-cost record in this view."
        : included.length === 0 ? "We need the purchase costs listed above to work out a gain or loss."
          : "The recorded purchase amounts do not provide enough information to calculate a return."}</p>}
    </section>}

    {fundValue >= 1 && <section className="rounded-lg bg-ink-900 p-3" data-sector-return-funds>
      <h3 className="font-medium text-slate-100">Also held through funds: {money(fundValue)}</h3>
      <p className="mt-1 text-xs text-slate-400">This is your share of stocks inside funds. The fund disclosures used here do not say what each stock cost, so this part is excluded from the stock return. It is separate from the {positions.length} account {plural(positions.length)} above.</p>
    </section>}

    <details data-sector-return-more>
      <summary className="ring-focus cursor-pointer rounded text-slate-300">How the return is calculated</summary>
      <div className="mt-3 space-y-3 text-xs text-slate-400">
        <p>We add the gain or loss on shares still held, recorded gains or losses on shares sold, and recorded dividends. We divide this by what was paid for the shares still held and those already sold. Sales use the oldest purchases first (FIFO).</p>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Recorded gain / loss, including dividends</dt><dd className="text-right tabular">{money(fifo.gain)}</dd>
          <dt>Money invested</dt><dd className="text-right tabular">{money(fifo.deployed)}</dd>
        </dl>
        {returnPct !== null && <p data-sector-return-formula>({money(fifo.gain)} ÷ {money(fifo.deployed)}) × 100 = {result}</p>}
        <p>{live ? "Current values use live prices; purchase costs come from the records." : "Current values and purchase costs come from the recorded statements."} This is a total return, not a yearly rate. Only recorded sales and dividends are included.</p>
        {included.length > 0 && <details>
          <summary className="ring-focus cursor-pointer rounded text-slate-300">View the {included.length} included {plural(included.length)}</summary>
          <ul className="mt-2 space-y-3" data-sector-return-included>{included.map((p, i) => <li key={i} className="rounded border border-ink-600 p-3">{identity(sectorReturnHolding(p, accounts))}</li>)}</ul>
        </details>}
      </div>
    </details>
  </ReturnCalculationInfo>;
}
