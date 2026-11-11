import { ReturnCalculationInfo } from './ReturnCalculation';
import { changeColor, fmtDate, fmtNum } from '@/lib/format';
import { TWR_COLUMNS, type TwrColumn, type TwrResult } from '@/lib/adjustedTwr';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const inr = (n: number) => `₹${fmtNum(n, 2)}`;
export function AdjustedTwrCell({ column, result: r, pad, label }: { column: TwrColumn; result: TwrResult; pad: string; label: string }) {
  const def = TWR_COLUMNS.find(c => c.key === column)!;
  const value = r.pct == null ? '—' : pct(r.pct);
  const periodOnly = def.period === 'inception' && r.pct != null && !r.annual;
  return <td className={`${pad} text-right mono ${changeColor(r.pct)}`} data-seg-cell={column} data-twr-currency="INR"
    data-twr-pct={r.pct ?? ''} data-twr-from={r.from ?? ''} data-twr-to={r.to ?? ''} data-twr-annual={r.annual ? 'true' : 'false'}
    data-export-value={r.pct == null ? '—' : r.pct / 100} data-export-type={r.pct == null ? undefined : 'number'}
    data-export-format={r.pct == null ? undefined : '0.00%'}>
    <span className="inline-flex items-center justify-end gap-1">
      {periodOnly && <span className="ret-tag" title="Under a year: period TWR, without annualising. Debt alone may be annualised under a year.">ABS</span>}
      {value}{r.annual && <span className="text-[10px]">p.a.</span>}
      {r.assumed && r.pct != null && <span className="text-[10px] text-slate-500">assumed</span>}
      <ReturnCalculationInfo label={`${label} · ${def.label}`} value={value} intro="Time-weighted performance" wide
        triggerLabel={`How is ${label}'s ${def.label} calculated?`}>{() => <div className="space-y-3 text-[12px] leading-relaxed" data-twr-details>
          <p>Calculated from INR valuations and INR cash flows. The display currency does not change these return percentages.</p>
          {r.pct != null && r.from && r.to && <p>{fmtDate(r.from)} → {fmtDate(r.to)} · {r.records} investment record{r.records === 1 ? '' : 's'} · {r.annual ? 'annualised' : 'period return'}.</p>}
          {periodOnly && <p>The measured history is under a year, so this is the period TWR without annualising.</p>}
          {r.assumed && <p>Some holdings use published prices with the recorded units assumed unchanged. Dividend entitlements are gross; actual receipt and unknown trading charges are not verified.</p>}
          <p>Each contribution or withdrawal is removed from investment performance before the intervals are compounded. Subsequent cash flows are treated at the end of their day. Initial funding establishes the starting capital. A grouped row uses the combined INR values at each step.</p>
          {r.gaps.length > 0 && <div data-twr-gaps><p className="font-semibold">Records needed</p><ul className="mt-1 space-y-2">{r.gaps.map((g, i) => <li key={i}><span className="font-medium">{g.label}</span> · {g.reason}</li>)}</ul></div>}
          {r.steps.length > 0 && <details data-twr-working><summary className="cursor-pointer">Calculation steps in INR</summary>
            <p className="mt-2">Interval growth = (closing value − net money added) ÷ opening value. TWR = (product of interval growth − 1) × 100. Annualised TWR = (product of interval growth ^ (365 ÷ days) − 1) × 100.</p>
            <div className="mt-2 overflow-x-auto"><table className="min-w-full text-right text-[11px]"><thead><tr>{['From', 'To', 'Opening', 'Net added', 'Closing', 'Return'].map(h => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
              <tbody>{r.steps.map((s, i) => <tr key={i}><td className="px-2 py-1">{fmtDate(s.from)}</td><td className="px-2 py-1">{fmtDate(s.to)}</td>
                <td className="px-2 py-1">{inr(s.opening)}</td><td className="px-2 py-1">{inr(s.netIn)}</td><td className="px-2 py-1">{inr(s.closing)}</td><td className="px-2 py-1">{pct((s.growth - 1) * 100)}</td></tr>)}</tbody></table></div>
          </details>}
        </div>}</ReturnCalculationInfo>
    </span>
  </td>;
}
