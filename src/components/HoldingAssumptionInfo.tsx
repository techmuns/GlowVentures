import { ReturnCalculationInfo } from './ReturnCalculation';
import { holdingAssumptionText } from '@/lib/assumedHoldingReturns';
import type { ReturnUnit } from '@/lib/selectedSegmentReturns';
import { fmtDate } from '@/lib/format';

/** A short, clickable explanation wherever a carried holding fills a number. */
export function HoldingAssumptionInfo({ units }: { units: readonly ReturnUnit[] }) {
  const assumed = units.filter(u => u.assumption);
  if (!assumed.length) return null;
  const owners = [...new Set(assumed.map(u => u.assumption!.owner))];
  return <span className="inline-flex items-center gap-1 text-[10px] font-normal text-slate-400" data-export-ignore data-holding-assumption data-assumed-count={assumed.length}>
    assumed
    <ReturnCalculationInfo label="Assumed holding" value={`${assumed.length} ${assumed.length === 1 ? 'holding' : 'holdings'}`}
      intro="Why this number is filled" triggerLabel="Why is this holding assumed?">
      <p data-assumption-explanation>{holdingAssumptionText(owners.length === 1 ? owners[0] : 'each owner')}</p>
      <details className="mt-3" data-navigation-details="holdingassumptioninfo-1"><summary className="cursor-pointer">Shares and dates</summary>
        <ul className="mt-2 space-y-2 text-xs">{assumed.map(u => <li key={u.key}>{u.label}<br />
          {u.assumption!.quantity.toLocaleString('en-IN')} recorded on {fmtDate(u.assumption!.statementDate)} · prices {fmtDate(u.from!)} → {fmtDate(u.to)} · {u.assumption!.source}</li>)}</ul>
      </details>
    </ReturnCalculationInfo>
  </span>;
}
