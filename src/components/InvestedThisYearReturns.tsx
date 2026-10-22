import { useMemo, useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { currentHoldings } from '@/lib/analytics';
import { investedOnOf } from '@/lib/investedOn';
import { investedThisYear } from '@/lib/investedThisYear';
import { marketHoldingContext } from '@/lib/marketReturnCoverage';
import { BOOK_HOLDING_LOTS, BOOK_HOLDING_TRADES, BOOK_POSITION_TRANCHES } from '@/data/glowData';
import { fmtDate, changeColor } from '@/lib/format';
import type { ReturnType } from '@/lib/periodReturns';
import { ReturnCalculationInfo } from './ReturnCalculation';
import { ExportableTable } from './ExportableTable';

const sources = {lots:BOOK_HOLDING_LOTS,trades:BOOK_HOLDING_TRADES,tranches:BOOK_POSITION_TRANCHES,dates:(p:Parameters<typeof investedOnOf>[0][number])=>investedOnOf([p])};
const percent=(n:number|null)=>n==null?'Unavailable':`${n>=0?'+':''}${n.toFixed(2)}%`;
export default function InvestedThisYearReturns({start,end,type}:{start:string;end:string;type:ReturnType}) {
  const {consolidated,statementPortfolio,fmtFromBase}=usePortfolio();
  const [search,setSearch]=useState('');
  const positions=useMemo(()=>currentHoldings(consolidated),[consolidated]);
  const accounts=statementPortfolio?.accounts??[];
  const result=useMemo(()=>investedThisYear(positions,accounts,sources,start,end,type,Date.now()),[positions,accounts,start,end,type]);
  const registry=new Map(accounts.map(a=>[a.accountId,a]));
  const context=(p:typeof positions[number])=>marketHoldingContext(p,registry.get(p.accountId));
  const money=(n:number,sign=false)=>fmtFromBase(n,{compact:true,sign});
  const rows=result.included.filter(r=>[r.position.security,...Object.values(context(r.position))].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const identity=(p:typeof positions[number])=>{const c=context(p);return <><strong>{p.security}</strong><p className="mt-1 text-xs text-slate-400">{c.category} · {c.heldThrough}</p><p className="mt-1 text-xs text-slate-400">{c.owner} · {c.provider} · Account {c.account}</p></>;};
  const info=<ReturnCalculationInfo label="Invested this year" value={percent(result.pct)} triggerLabel="What is included in this year’s investments?" intro="Only purchases made this financial year" wide>
    <div className="space-y-3 whitespace-normal" data-year-coverage>
      <p><strong>{result.included.length} holdings</strong> have verified purchases from {fmtDate(start)} to {fmtDate(end)} that are still held.</p>
      <p><strong>{money(result.cost)}</strong> paid for these units; their latest value is <strong>{money(result.value)}</strong>. The difference is <strong>{money(result.gain,true)}</strong>.</p>
      <p>Each holding’s return starts on its own purchase dates. Bigger included holdings count more, using their latest values. The included weights add to 100%.</p>
      <p>Only this year’s units are counted when a holding also has older purchases. Sold units, dividends and other cash payouts are outside this figure. Each row shows its actual value date.</p>
      <p>{type==='xirr'?'XIRR is each holding’s yearly return using its dated purchases, then weighted by its included value. A short holding period can produce a large yearly figure.':type==='cagr'?'These purchases are less than a year old, so the return is shown for the holding period.':'Absolute return is the change from purchase cost to the latest value, weighted by each included holding’s value.'}</p>
      {result.included.some(r=>r.pct==null)&&<p>Some included holdings have a gain but cannot yet show this return type. Their values are left out of the return’s weights.</p>}
      <details><summary className="cursor-pointer font-semibold">Purchases considered ({result.included.length})</summary><ul className="mt-3 space-y-3">{result.included.map(r=><li key={`${r.position.accountId}|${r.position.securityKey}`} className="rounded border border-ink-700 p-3" data-year-considered>{identity(r.position)}<p className="mt-2 text-xs">Bought {fmtDate(r.first)}{r.last!==r.first&&` → ${fmtDate(r.last)}`} · Paid {money(r.cost)} · Value {money(r.value)} on {fmtDate(r.valuedOn)}</p><ul className="mt-1 text-xs text-slate-400">{r.lots.map((l,i)=><li key={i}>{fmtDate(l.date)} · {l.quantity??'All'} units · {money(l.cost)}</li>)}</ul>{r.returnMissing&&<p className="mt-2">{r.returnMissing}</p>}</li>)}</ul></details>
      <details><summary className="cursor-pointer font-semibold">Dates or values to check ({result.missing.length})</summary><ul className="mt-3 space-y-3">{result.missing.map(g=><li key={`${g.position.accountId}|${g.position.securityKey}`} className="rounded border border-ink-700 p-3" data-year-gap>{identity(g.position)}<p className="mt-2 text-sm">{g.reason}</p></li>)}</ul></details>
      <p className="text-xs text-slate-400">{result.older.length} holdings have no verified purchases still held from this year and are left out.</p>
    </div>
  </ReturnCalculationInfo>;
  return <div className="space-y-3" data-invested-year data-year-start={start} data-year-end={end} data-year-type={type} data-year-included={result.included.length} data-year-missing={result.missing.length} data-year-older={result.older.length} data-year-total={positions.length} data-year-return={result.pct??''} data-year-gain={result.gain}>
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Invested this year · {fmtDate(start)} → {fmtDate(end)}</h2>{info}</div>
      <p className="mt-1 text-xs text-slate-400">This financial year’s purchases still held. Returns start on each purchase date; older units are excluded.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div><p className="text-xs text-slate-400">Portfolio-weighted return{result.annual?' · yearly':''}</p><strong className={`text-xl tabular ${changeColor(result.pct)}`}>{percent(result.pct)}{result.annual?' p.a.':''}</strong>{result.annual&&<p className="mt-1 text-xs text-slate-400">{percent(result.periodPct)} over the holding periods</p>}</div>
        <div><p className="text-xs text-slate-400">Paid for included units</p><strong className="text-xl tabular">{money(result.cost)}</strong></div>
        <div><p className="text-xs text-slate-400">Latest value</p><strong className="text-xl tabular">{money(result.value)}</strong></div>
        <div><p className="text-xs text-slate-400">Gain / loss · still held</p><strong className={`text-xl tabular ${changeColor(result.gain)}`}>{money(result.gain,true)}</strong></div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{result.included.length} holdings included · {result.missing.length} need purchase details or values · {result.older.length} outside this year’s purchases. Open ⓘ for the names and missing details.</p>
    </div>
    <div className="card overflow-hidden p-4">
      <label className="block max-w-lg"><span className="sr-only">Search this year’s investments</span><input className="ring-focus w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm" placeholder="Search security, fund, owner or account" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="mt-3 overflow-x-auto"><ExportableTable className="min-w-full text-left text-xs" data-year-table><thead><tr className="border-b border-ink-700 text-slate-400">{['Investment / account','Bought this year','Paid','Latest value','Value date','Gain / loss','Return','Weight'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={`${r.position.accountId}|${r.position.securityKey}`} className="border-b border-ink-700/50" data-year-row data-year-key={`${r.position.accountId}|${r.position.securityKey}`} data-year-cost={r.cost} data-year-value={r.value} data-year-first={r.first} data-year-last={r.last} data-year-pct={r.pct??''}>
        <td className="min-w-[240px] p-2">{identity(r.position)}</td><td className="whitespace-nowrap p-2">{fmtDate(r.first)}{r.last!==r.first&&<><br/>→ {fmtDate(r.last)}</>}</td><td className="whitespace-nowrap p-2 tabular">{money(r.cost)}</td><td className="whitespace-nowrap p-2 tabular">{money(r.value)}</td><td className="whitespace-nowrap p-2">{fmtDate(r.valuedOn)}</td><td className={`whitespace-nowrap p-2 tabular ${changeColor(r.gain)}`}>{money(r.gain,true)}</td><td className={`whitespace-nowrap p-2 tabular ${changeColor(r.pct)}`} title={r.returnMissing??`${percent(r.periodPct)} over the holding period`}>{percent(r.pct)}{r.annual?' p.a.':''}</td><td className="p-2 tabular">{r.pct!=null&&result.weightValue>0?`${(r.value/result.weightValue*100).toFixed(2)}%`:'Excluded'}</td>
      </tr>)}</tbody></ExportableTable></div>
      {!rows.length&&<p className="mt-4 text-sm">{search?'No included investments match your search.':'No purchases can be verified for this year yet. Open the info button for the missing details.'}</p>}
    </div>
  </div>;
}
