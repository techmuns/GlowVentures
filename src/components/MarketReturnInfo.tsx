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
  return <ReturnCalculationInfo label={`${label} market return`} value={value} intro="How the historical market return is calculated" triggerLabel={`What is included in ${label.toLowerCase()} market return?`}>
    <div className="space-y-3" data-market-working>
      <p>Historical stock prices and fund NAVs are available for <strong>{units.length} holdings</strong>, worth <strong>{money(covered)}</strong> out of {money(totalValue)} in current holdings.</p>
      {pending > 0 && <p>{pending} histories are still loading. This figure will update as they arrive.</p>}
      {from && to && <p>Actual price dates: {fmtDate(from)} → {fmtDate(to)} · {annual ? 'per year' : 'not annualised'}.</p>}
      <p>Each holding’s price return is weighted by its current value. A holding worth ten times as much has ten times the influence. Weights add to 100% of the holdings included here; missing histories are left out, not treated as zero.</p>
      <p>This shows how your current investments performed in the market. It does not assume you owned them throughout the period and does not reconstruct your buys or sales. The recorded return and gain use your investment records and are shown separately.</p>
      <p>Stock returns use dividend and split-adjusted prices. Fund returns use published NAVs; cash distributions from payout plans are not added.</p>
      {inception && <p>Purchase dates are not available for every holding. This market figure uses their common available price history, rather than claiming a return since you bought them.</p>}
      <details><summary className="cursor-pointer">View holdings, weights and sources</summary>
        <ul className="mt-3 space-y-3">{units.map(u => <li key={`${u.position.accountId}|${u.position.securityKey}`} data-market-source>
          <strong>{u.position.security}</strong><p className="text-xs text-slate-400">{owner(u.position)}</p>
          <p>{covered > 0 ? (u.position.marketValue / covered * 100).toFixed(2) : '0'}% weight · {u.periodPct.toFixed(2)}% period return · {u.history.source} · {u.history.symbol}</p>
        </li>)}</ul>
      </details>
      <details><summary className="cursor-pointer">Which histories are missing?</summary><ul className="mt-3 space-y-3">{gaps.map(g => <li key={`${g.position.accountId}|${g.position.securityKey}`} data-market-gap><strong>{g.position.security}</strong><p className="text-xs">{owner(g.position)} · {g.reason}</p></li>)}</ul>{!gaps.length && !pending && <p>All available histories for this row are included.</p>}</details>
    </div>
  </ReturnCalculationInfo>;
}
