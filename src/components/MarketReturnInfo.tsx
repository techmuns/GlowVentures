import { useId, useMemo, useState } from 'react';
import { ReturnCalculationInfo } from './ReturnCalculation';
import type { Account, Position } from '@/lib/types';
import { marketHoldingKey, type MarketGap, type MarketUnit } from '@/lib/marketReturns';
import { marketGapExplanation, marketHoldingContext } from '@/lib/marketReturnCoverage';
import { fmtDate } from '@/lib/format';
type Props = {
  label: string; value: string; units: readonly MarketUnit[]; gaps: readonly MarketGap[]; positions: readonly Position[]; accounts: readonly Account[];
  totalValue: number; from: string | null; to: string | null; requestedStart: string | null; requestedEnd: string | null;
  annual: boolean; pending: number; inception: boolean; money: (n: number) => string; onRetry?: () => void;
};
const percent = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export function MarketReturnInfo(props: Props) {
  return <ReturnCalculationInfo label={`${props.label} market return`} value={<>{props.value}{props.annual && props.value !== '—' && <span className="ml-2 text-sm font-normal">a year</span>}</>}
    intro="What this return includes" triggerLabel={`What is included in ${props.label.toLowerCase()} market return?`} wide>
    <MarketReturnDetails {...props} />
  </ReturnCalculationInfo>;
}
/** Mounted only while the dialog is open, so every new opening starts on Overview. */
function MarketReturnDetails({ units, gaps, positions, accounts, totalValue, from, to, requestedStart, requestedEnd, annual, pending, inception, money, onRetry }: Props) {
  const [tab, setTab] = useState('overview'), [includedSearch, setIncludedSearch] = useState(''), [missingSearch, setMissingSearch] = useState('');
  const id = useId();
  const accountMap = useMemo(() => new Map(accounts.map(a => [a.accountId, a])), [accounts]);
  const context = (p: Position) => marketHoldingContext(p, accountMap.get(p.accountId));
  const done = new Set([...units.map(u => marketHoldingKey(u.position)), ...gaps.map(g => marketHoldingKey(g.position))]);
  const waiting = positions.filter(p => !done.has(marketHoldingKey(p)));
  const missingCount = gaps.length + waiting.length;
  const covered = units.reduce((s, u) => s + u.position.marketValue, 0);
  const missingValue = [...gaps.map(g => g.position), ...waiting].reduce((s, p) => s + p.marketValue, 0);
  const matches = (p: Position, query: string) => {
    const c = context(p);
    return [p.security, p.isin, c.category, c.heldThrough, c.owner, c.provider, c.account].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  };
  const compare = (a: Position, b: Position) => {
    const x = context(a), y = context(b);
    return x.category.localeCompare(y.category) || x.heldThrough.localeCompare(y.heldThrough) || a.security.localeCompare(b.security) || x.owner.localeCompare(y.owner) || x.account.localeCompare(y.account);
  };
  const included = units.filter(u => matches(u.position, includedSearch)).sort((a,b) => compare(a.position,b.position));
  const missing = gaps.filter(g => matches(g.position, missingSearch)).sort((a,b) => compare(a.position,b.position));
  const loading = waiting.filter(p => matches(p, missingSearch)).sort(compare);
  const tabs = [{ key:'overview', label:'Return Overview' }, { key:'included', label:'All Securities Considered', count:units.length }, { key:'missing', label:'Missing Values', count:missingCount }];
  const identity = (p: Position) => {
    const c = context(p);
    return <>
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-slate-100">{p.security}</h3><span className="text-xs text-slate-400" data-market-category>{c.category}</span></div>
      <p className="mt-1 text-xs"><span className="text-slate-400">Held through: </span><strong className="font-medium" data-market-through>{c.heldThrough}</strong> · {c.instrument}</p>
      <p className="mt-1 text-xs text-slate-400" data-market-owner>{c.owner} · {c.provider} · Account {c.account}{c.statementDate && ` · Report ${fmtDate(c.statementDate)}`}</p>
      {p.isin && <p className="mt-1 text-xs text-slate-400">ISIN {p.isin}</p>}
    </>;
  };
  return <div className="whitespace-normal break-words text-left font-normal" data-market-working data-market-details
    data-market-included-count={units.length} data-market-missing-count={missingCount} data-market-holding-total={positions.length}>
    <div role="tablist" aria-label="Market return details" className="sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-lg border border-ink-700 bg-ink-800 p-1">
      {tabs.map((t,index) => <button key={t.key} type="button" role="tab" id={`${id}-tab-${t.key}`} aria-controls={`${id}-panel-${t.key}`} aria-selected={tab===t.key} tabIndex={tab===t.key?0:-1}
        data-market-tab={t.key} className={`ring-focus rounded-md px-2 py-2 text-xs font-semibold sm:text-sm ${tab===t.key?'bg-champagne-500 text-ink-950':'text-slate-400 hover:text-slate-100'}`}
        onClick={() => setTab(t.key)} onKeyDown={e => {
          const next = e.key==='Home'?0:e.key==='End'?tabs.length-1:e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:null;
          if(next==null)return; e.preventDefault(); setTab(tabs[next].key); e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
        }}>{t.label}{t.count!=null && <span className="mt-0.5 block tabular">{t.count}</span>}</button>)}
    </div>
    <section role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className="mt-4" data-market-panel={tab}>
      {tab==='overview' && <div className="space-y-3" data-market-overview>
        <p><strong>{units.length} of {positions.length} holdings</strong> are included. <strong>{missingCount}</strong> are left out{pending>0?`, including ${waiting.length} still loading`:''}.</p>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-ink-900 p-3">
          <div><dt className="text-xs text-slate-400">Value included</dt><dd className="font-semibold tabular">{money(covered)}</dd></div>
          <div><dt className="text-xs text-slate-400">Total current value</dt><dd className="font-semibold tabular">{money(totalValue)}</dd></div>
        </dl>
        {from && to && <p><strong>Price dates:</strong> {fmtDate(from)} → {fmtDate(to)} · {annual?'return per year':'return for this period'}.</p>}
        <p>Bigger holdings count more. We use their values today to set the weights. The included weights add to 100%; missing holdings are left out.</p>
        <p>This is how today’s holdings moved in the market. Your profit from actual buys and sales is shown under Recorded gain.</p>
        <p className="text-xs text-slate-400">Stock prices allow for dividends and share splits. Fund figures use the unit price (NAV). Income paid out or reinvested as extra units is excluded.</p>
        {inception && <p className="text-xs text-slate-400">“Since investment” uses the available price history here, rather than your purchase dates.</p>}
      </div>}
      {tab==='included' && <div>
        <p><strong>{units.length} holdings · {money(covered)}</strong> included. Each account holding has its own entry.</p>
        <label className="mt-3 block"><span className="sr-only">Search included holdings</span><input value={includedSearch} onChange={e=>setIncludedSearch(e.target.value)} placeholder="Search security, fund, owner or account" className="ring-focus w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm" /></label>
        {includedSearch && <p className="mt-2 text-xs text-slate-400">Showing {included.length} of {units.length} included holdings</p>}
        <ul className="mt-3 space-y-3">{included.map(u=><li key={marketHoldingKey(u.position)} className="rounded-lg border border-ink-700 p-3" data-market-source data-market-holding-key={marketHoldingKey(u.position)}>
          {identity(u.position)}
          <p className="mt-2 text-xs"><strong>{money(u.position.marketValue)}</strong> · {covered>0?(u.position.marketValue/covered*100).toFixed(2):'0'}% of included value · {percent(u.periodPct)} for the period</p>
          <p className="mt-1 text-xs text-slate-400">Price source: {u.history.source} · {u.history.symbol}</p>
        </li>)}</ul>
        {!included.length && <p className="mt-3">{includedSearch?'No included holdings match this search.':'No holdings are included yet. See Missing Values for the reason.'}</p>}
      </div>}
      {tab==='missing' && <div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p><strong>{missingCount} holdings · {money(missingValue)}</strong> left out{pending>0?` · ${waiting.length} still loading`:''}.</p>
          {onRetry && gaps.some(g=>g.code==='source') && <button type="button" className="btn-secondary text-xs" onClick={onRetry}>Retry missing histories</button>}</div>
        {(requestedStart || from) && (requestedEnd || to) && <p className="mt-1 text-xs text-slate-400">Dates requested: {fmtDate((requestedStart || from)!)} → {fmtDate((requestedEnd || to)!)}</p>}
        <label className="mt-3 block"><span className="sr-only">Search missing holdings</span><input value={missingSearch} onChange={e=>setMissingSearch(e.target.value)} placeholder="Search security, fund, owner or account" className="ring-focus w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm" /></label>
        {missingSearch && <p className="mt-2 text-xs text-slate-400">Showing {missing.length+loading.length} of {missingCount} left-out holdings</p>}
        <ul className="mt-3 space-y-3">{missing.map(g=>{ const explanation=marketGapExplanation(g,requestedStart,requestedEnd); return <li key={marketHoldingKey(g.position)} className="rounded-lg border border-ink-700 p-3" data-market-gap data-market-holding-key={marketHoldingKey(g.position)}>
          {identity(g.position)}<p className="mt-2 text-xs">Current value: <strong>{money(g.position.marketValue)}</strong></p>
          <p className="mt-2 text-sm" data-market-missing-data><strong>Missing: </strong>{explanation.missing}</p>
          <p className="mt-1 text-sm" data-market-needed><strong>Needed: </strong>{explanation.needed}</p>
        </li>})}{loading.map(p=><li key={marketHoldingKey(p)} className="rounded-lg border border-ink-700 p-3" data-market-gap="loading" data-market-holding-key={marketHoldingKey(p)}>
          {identity(p)}<p className="mt-2 text-sm"><strong>Still loading.</strong> Please wait for the price history. No new document is needed yet.</p>
        </li>)}</ul>
        {!missingCount && <p className="mt-3">Every holding in this view is included.</p>}
        {missingCount>0 && !missing.length && !loading.length && <p className="mt-3">No left-out holdings match this search.</p>}
      </div>}
    </section>
    {tabs.filter(t=>t.key!==tab).map(t=><section key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} hidden />)}
  </div>;
}
