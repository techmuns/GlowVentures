import { ReturnCalculationInfo } from './ReturnCalculation';
import type { Account, Position } from '@/lib/types';
import type { MarketGap, MarketUnit } from '@/lib/marketReturns';
import { fmtDate } from '@/lib/format';
export function MarketReturnInfo({ label, value, units, gaps, accounts, totalValue, from, to, annual, pending, inception, money }: {
  label: string; value: string; units: readonly MarketUnit[]; gaps: readonly MarketGap[]; accounts: readonly Account[];
  totalValue: number; from: string | null; to: string | null; annual: boolean; pending: number; inception: boolean; money: (n: number) => string;
}) {
  const covered = units.reduce((s, u) => s + u.position.marketValue, 0);
  const owner = (p: Position) => { const a = accounts.find(a => a.accountId === p.accountId); return a ? `${a.owner} · ${a.provider} · account ${a.accountNo}` : p.accountId; };
  return <ReturnCalculationInfo label={`${label} market return`} value={value} intro="About this market return" triggerLabel={`What is included in ${label.toLowerCase()} market return?`}>
    <div className="space-y-4 whitespace-normal text-left font-normal" data-market-working>
      <p>{units.length ? <>Based on <strong>{units.length} holdings</strong>, worth <strong>{money(covered)}</strong> out of {money(totalValue)}.</>
        : pending ? 'Price history is still loading.' : 'We can’t calculate this market return yet.'}</p>
      {pending > 0 && units.length > 0 && <p>{pending} price histories are still loading.</p>}
      {gaps.length > 0 && <section data-market-missing>
        <h3 className="font-semibold text-slate-100">What is missing?</h3>
        <ul className="mt-3 space-y-3">{gaps.map(g => <li key={`${g.position.accountId}|${g.position.securityKey}`} data-market-gap className="rounded-lg bg-ink-900 p-3">
          <p className="font-semibold text-slate-100">{g.position.security}</p>
          <p className="mt-1" data-market-gap-reason>{g.reason}</p>
          <p className="mt-1" data-market-gap-needed><strong>What’s needed:</strong> {g.needed}</p>
          <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Account and source details</summary>
            <p className="mt-1">{owner(g.position)}</p>{g.detail && <p className="mt-1">{g.detail}</p>}
          </details>
        </li>)}</ul>
      </section>}
      {!gaps.length && !pending && <p>{units.length ? 'Price history is available for all holdings in this row.' : 'This row has no holdings with a value to measure.'}</p>}
      <details data-market-method><summary className="cursor-pointer">How it’s calculated</summary><div className="mt-3 space-y-3">
        {from && to && <p>Price dates: {fmtDate(from)} → {fmtDate(to)} · {annual ? 'per year' : 'total for this period'}.</p>}
        <p>Each holding’s return is weighted by its current value. Larger holdings count more. Missing prices are left out.</p>
        <p>This measures changes in market prices. It does not use your purchase dates or amounts paid. Those are used in Recorded return.</p>
        <p>Stock prices include dividends and share splits. Fund prices use published NAVs (the price per fund unit); separate payouts are excluded.</p>
        {inception && <p>This uses the shared available price history. It may start after you bought the investment.</p>}
      </div></details>
      {units.length > 0 && <details><summary className="cursor-pointer">View holdings, weights and sources</summary>
        <ul className="mt-3 space-y-3">{units.map(u => <li key={`${u.position.accountId}|${u.position.securityKey}`} data-market-source>
          <strong>{u.position.security}</strong><p className="text-xs text-slate-400">{owner(u.position)}</p>
          <p>{covered > 0 ? (u.position.marketValue / covered * 100).toFixed(2) : '0'}% weight · {u.periodPct.toFixed(2)}% period return · {u.history.source} · {u.history.symbol}</p>
        </li>)}</ul>
      </details>}
    </div>
  </ReturnCalculationInfo>;
}
