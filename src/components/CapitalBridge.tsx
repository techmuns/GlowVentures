/**
 * ── WHERE THE PERIOD'S RETURN CAME FROM (Stage 10gu) ────────────────────────
 *
 * One card above the attribution table: the value the measured accounts
 * started at, the money added and taken out, the gain, and the value they
 * ended at — each a figure off `capitalBridge`, which is struck over the
 * table's own total, so the two can never disagree. The gain is then shown in
 * its parts (realised, unrealised, income, fees and charges), and the gain of
 * any account no record splits is one named "Not split" part, never spread
 * across the others. Every explanation is a hover or the info card.
 */
import { AbsentCell } from '@/components/Absent';
import { ExportableTable } from '@/components/ExportableTable';
import { ReturnCalculationInfo } from '@/components/ReturnCalculation';
import { HoldingAssumptionInfo } from './HoldingAssumptionInfo';
import { changeColor, fmtDate } from '@/lib/format';
import type { BridgeAccount, CapitalBridge as Bridge } from '@/lib/capitalBridge';
import type { SelectedLine } from '@/lib/selectedSegmentReturns';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const SOURCE_WORDS = { statement: "Statement's own profit and loss", 'fund-record': "Fund's dated unit record", 'purchase-cost': 'Purchase cost, first-in first-out', 'assumed-holding': 'Assumed still held' } as const;
/** Where a record prints no separate charges, they are already inside another part. */
const INSIDE = { statement: 'The statement prints no separate charges', 'fund-record': "A fund's costs are inside its NAV, so they are already in the unrealised change",
  'purchase-cost': 'Costs are inside the purchase prices and sale proceeds, so they are already in the realised and unrealised gain',
  'assumed-holding': 'Trading charges are unknown. Fund charges are inside NAV; dividend figures are gross entitlements, not confirmed receipts.' } as const;

export function CapitalBridge({ bridge: b, total, typeLabel, caption, money }: {
  bridge: Bridge | null; total: SelectedLine; typeLabel: string; caption: string;
  money: (n: number, sign?: boolean) => string;
}) {
  if (!b) return <div className="card min-w-0 p-5" data-capital-bridge data-bridge-mode="">
    <div className="text-sm font-semibold text-slate-100">Investment performance</div>
    <div className="mt-1 text-[13px]"><AbsentCell reason={total.missing.length ? 'No account has a verified opening value and dated money record for these dates; the info button on the Total row lists what each one needs.' : 'No account holds anything to measure over these dates.'} /></div>
  </div>;
  const dated = (d: string | null) => (d ? fmtDate(d) : '—');
  const assumed = total.units.some(u => u.assumption);
  const accountCount = new Set(total.units.map(u => u.accountId)).size;
  const steps: { key: string; label: string; value: number; sign?: boolean; sub: string; title: string }[] = b.mode === 'window' ? [
    { key: 'opening', label: 'Opening value', value: b.opening, sub: dated(b.from), title: "Statement values, plus published prices for labelled assumed holdings, on their measured starting dates" },
    // A computed zero says why on its face: the dated record shows no movement.
    { key: 'added', label: '+ Money added', value: b.added, sub: b.added === 0 ? 'none in this period' : 'new capital', title: 'Money put into these accounts during the period, on its dates' },
    { key: 'taken', label: assumed ? '− Payouts / taken out' : '− Money taken out', value: b.takenOut, sub: assumed ? 'includes dividend entitlements' : b.takenOut === 0 ? 'none in this period' : 'withdrawals', title: 'Recorded withdrawals and payouts, plus gross dividend entitlements on labelled assumed holdings' },
    { key: 'gain', label: '+ Gain this period', value: b.gain, sign: true, sub: 'see the gain breakdown', title: 'Value at end − value at start − money added + money taken out' },
    { key: 'closing', label: 'Closing value', value: b.closing, sub: dated(b.to), title: "Statement values, plus published prices for labelled assumed holdings, on their measured closing dates" },
  ] : b.mode === 'inception' ? [
    { key: 'added', label: 'Money paid in', value: b.added, sub: `since ${dated(b.from)}`, title: 'Every dated purchase or contribution since the first investment' },
    { key: 'taken', label: '− Money taken out', value: b.takenOut, sub: 'redemptions and payouts', title: 'Every dated redemption, withdrawal and payout since the first investment' },
    { key: 'gain', label: '+ Gain', value: b.gain, sign: true, sub: 'see the split below', title: 'Value now + money taken out − money paid in' },
    { key: 'closing', label: '= Value now', value: b.closing, sub: dated(b.to), title: "Each account's latest verified statement value" },
  ] : [
    { key: 'added', label: 'Invested', value: b.added, sub: 'purchase cost', title: 'Purchase cost of units held and units already sold; a whole PMS mandate enters at the capital paid in' },
    { key: 'taken', label: '− Received back', value: b.takenOut, sub: 'sales, income, withdrawals', title: 'What came back out of these investments: sale proceeds, income and withdrawals — invested + gain − value now' },
    { key: 'gain', label: '+ Gain', value: b.gain, sign: true, sub: 'see the split below', title: 'Realised + unrealised + income, on purchase cost' },
    { key: 'closing', label: '= Value now', value: b.closing, sub: 'statement values', title: "Each holding's value on its own latest statement" },
  ];
  const named = (rows: BridgeAccount[]) => rows.map((r) => r.label).join('; ');
  const noSplit = 'No statement or fund record splits the gain of these accounts over these dates';
  const noCharges = b.splitCount ? 'No record here prints charges separately: fund costs are inside the NAV, and purchase-cost records carry them in the prices paid and received' : noSplit;
  const parts: { key: string; label: string; value: number | null; title: string }[] = [
    { key: 'realised', label: 'Realised', value: b.realised, title: 'Gain booked on units sold, against their purchase cost (first-in, first-out)' },
    { key: 'unrealised', label: 'Unrealised', value: b.unrealised, title: 'Change in the paper gain on what is still held' },
    { key: 'income', label: 'Income', value: b.income, title: 'Dividends, interest and distributions received' },
    { key: 'charges', label: '− Fees & charges', value: b.charges == null ? null : -b.charges, title: 'Management fees, expenses and other charges the statements print separately. A fund folio’s costs are inside its NAV, so they are in its unrealised change.' },
  ];
  const ret = total.returnPct, period = total.periodPct;
  const annual = total.measured?.basis === 'annual';
  return <div className="card min-w-0 p-5" data-capital-bridge data-bridge-mode={b.mode} data-bridge-opening={b.opening} data-bridge-added={b.added}
    data-bridge-taken={b.takenOut} data-bridge-gain={b.gain} data-bridge-closing={b.closing} data-bridge-realised={b.realised ?? ''}
    data-bridge-unrealised={b.unrealised ?? ''} data-bridge-income={b.income ?? ''} data-bridge-charges={b.charges ?? ''} data-bridge-unsplit={b.unsplit}
    data-bridge-accounts={b.rows.length} data-bridge-split-accounts={b.splitCount}>
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-slate-100">Investment performance</h3>
      <BridgeInfo b={b} money={money} />
    </div>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400" title={caption} data-bridge-caption>
      {accountCount} {accountCount === 1 ? 'account' : 'accounts'} covered <HoldingAssumptionInfo units={total.units} />
    </div>
    <div className="my-5" data-bridge-return={ret ?? ''} data-bridge-period-return={period ?? ''}>
      <p className="text-xs text-slate-400" data-bridge-return-label>{typeLabel}{ret != null && (annual ? ' · annualised' : ' · period')}</p>
      <div className="mt-1" aria-live="polite">{ret != null ? <strong className={`text-3xl font-semibold tabular ${changeColor(ret)}`}>{pct(ret)}{annual && <span className="ml-1 text-xs font-normal text-slate-400">p.a.</span>}</strong> : <AbsentCell reason={total.measured?.reason ?? 'not measured on these dates'} />}</div>
    </div>
    <dl data-bridge-steps>{steps.map((s) => <div key={s.key}
      className={`flex items-baseline justify-between gap-4 py-2.5 text-[13px] ${s.key === 'closing' ? 'font-semibold text-slate-100' : 'border-b border-ink-700'}`}
      data-bridge-step={s.key} title={`${s.title} · ${s.sub}`}>
      <dt className={s.key === 'closing' ? '' : 'text-slate-400'}>{s.label}</dt>
      <dd className={`shrink-0 tabular ${s.sign ? changeColor(s.value) : 'text-slate-100'}`}>{money(s.value)}</dd>
    </div>)}</dl>
    <details className="mt-3" data-bridge-split data-navigation-details="capitalbridge-1">
      <summary className="ring-focus w-fit cursor-pointer rounded text-xs text-slate-300">Gain breakdown</summary>
      <dl className="mt-2 divide-y divide-ink-700 text-xs">
        {parts.map((p) => <div key={p.key} className="flex justify-between gap-4 py-2" data-bridge-part={p.key} title={p.title}>
          <dt className="text-slate-400">{p.label}</dt><dd className="shrink-0 tabular">{p.value != null ? <span className={changeColor(p.value)}>{money(p.value, true)}</span> : <AbsentCell reason={p.key === 'charges' ? noCharges : noSplit} />}</dd>
        </div>)}
        {b.unsplitCount > 0 && <div className="flex justify-between gap-4 py-2" data-bridge-part="unsplit"
          title={`Gain of ${b.unsplitCount} accounts whose records do not split it: ${named(b.rows.filter((r) => !r.split))}`}>
          <dt className="text-slate-400">Not split · {b.unsplitCount} {b.unsplitCount === 1 ? 'account' : 'accounts'}</dt><dd className={`shrink-0 tabular ${changeColor(b.unsplit)}`}>{money(b.unsplit, true)}</dd>
        </div>}
      </dl>
    </details>
    <p className="mt-4 border-t border-ink-700 pt-3 text-xs text-slate-400">Valuations: {b.from && `${dated(b.from)} → `}{dated(b.to)}</p>
    <details className="mt-2" data-bridge-accounts-table data-navigation-details="capitalbridge-2">
      <summary className="ring-focus w-fit cursor-pointer rounded text-[12px] text-slate-300">By account</summary>
      <div className="mt-2 overflow-x-auto" data-navigation-scroll="capitalbridge-1">
        <ExportableTable className="min-w-full whitespace-nowrap text-[12px]" exportName="capital-bridge"
          data-table-static="A bridge reads left to right: start, money in and out, the gain's parts, end">
          <thead className="border-b border-ink-700 bg-ink-800"><tr className="text-slate-400">
            {['Account', b.mode === 'window' ? 'Start' : null, b.mode === 'cost' ? 'Invested' : 'Added', b.mode === 'cost' ? 'Received back' : 'Taken out',
              'Realised', 'Unrealised', 'Income', 'Fees & charges', 'Gain', 'End', 'Split from'].filter(Boolean).map((h, i) =>
              <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr></thead>
          <tbody>{b.rows.map((r) => <tr key={r.key} data-bridge-row={r.accountId}>
            <td className="px-3 py-1.5 text-left text-slate-100">{r.label}<span className="block text-[11px] text-slate-500">{r.from ? `${fmtDate(r.from)} → ` : ''}{r.to ? fmtDate(r.to) : ''}</span></td>
            {b.mode === 'window' && <td className="px-3 py-1.5 text-right mono">{money(r.opening)}</td>}
            <td className="px-3 py-1.5 text-right mono">{money(r.added)}</td>
            <td className="px-3 py-1.5 text-right mono">{money(r.takenOut)}</td>
            {(['realised', 'unrealised', 'income'] as const).map((k) => <td key={k} className={`px-3 py-1.5 text-right mono ${changeColor(r.split?.[k] ?? null)}`}>
              {r.split ? money(r.split[k], true) : <AbsentCell reason={r.unsplitReason ?? noSplit} />}</td>)}
            <td className="px-3 py-1.5 text-right mono">{r.split?.charges != null ? money(-r.split.charges, true)
              : <AbsentCell reason={r.split ? INSIDE[r.split.source] : r.unsplitReason ?? noSplit} />}</td>
            <td className={`px-3 py-1.5 text-right mono ${changeColor(r.gain)}`}>{money(r.gain, true)}</td>
            <td className="px-3 py-1.5 text-right mono text-slate-100">{money(r.closing)}</td>
            <td className="px-3 py-1.5 text-right text-slate-400" title={r.split?.note ?? r.unsplitReason ?? ''}>{r.split ? SOURCE_WORDS[r.split.source] : 'Not split'}</td>
          </tr>)}</tbody>
          <tfoot className="border-t-2 border-ink-600"><tr className="font-semibold" data-bridge-total>
            <td className="px-3 py-2 text-left text-slate-100">Total</td>
            {b.mode === 'window' && <td className="px-3 py-2 text-right mono">{money(b.opening)}</td>}
            <td className="px-3 py-2 text-right mono">{money(b.added)}</td>
            <td className="px-3 py-2 text-right mono">{money(b.takenOut)}</td>
            {([b.realised, b.unrealised, b.income] as const).map((v, i) => <td key={i} className={`px-3 py-2 text-right mono ${changeColor(v)}`}>{v != null ? money(v, true) : <AbsentCell reason={noSplit} />}</td>)}
            <td className="px-3 py-2 text-right mono">{b.charges != null ? money(-b.charges, true) : <AbsentCell reason={noCharges} />}</td>
            <td className={`px-3 py-2 text-right mono ${changeColor(b.gain)}`}>{money(b.gain, true)}</td>
            <td className="px-3 py-2 text-right mono text-slate-100">{money(b.closing)}</td>
            <td className="px-3 py-2 text-right font-normal text-slate-400">{b.splitCount} of {b.rows.length} split</td>
          </tr></tfoot>
        </ExportableTable>
      </div>
    </details>
  </div>;
}

function BridgeInfo({ b, money }: { b: Bridge; money: (n: number, sign?: boolean) => string }) {
  const by = (source: string) => b.rows.filter((r) => r.split?.source === source);
  const unsplit = b.rows.filter((r) => !r.split);
  return <ReturnCalculationInfo label="Capital bridge" value={money(b.gain, true)} intro="How the capital bridge is built"
    triggerLabel="What is included in the capital bridge?">
    <div className="space-y-3" data-bridge-working>
      <p>{b.mode === 'window' ? 'Value at start + money added − money taken out + gain = value at end, for each account and in total.'
        : b.mode === 'inception' ? 'Money paid in − money taken out + gain = value now, for each account and in total.'
        : 'Invested − received back + gain = value now. Invested is the purchase cost of units held and sold; received back is what the cost and gain do not leave in the value — sale proceeds, income and withdrawals.'}</p>
      <p>It covers the same {b.rows.length} {b.rows.length === 1 ? 'account' : 'accounts'} as the table's total, so its gain is the total's recorded gain. Holdings with no usable record for these dates are listed in the Total row's info card.</p>
      <p>The gain is split only where a record splits it. Nothing is apportioned: an account whose records do not split its gain over these dates is shown whole, as Not split.</p>
      {(['statement', 'fund-record', 'purchase-cost'] as const).map((s) => by(s).length > 0 && <div key={s}>
        <p className="font-semibold text-slate-100">{SOURCE_WORDS[s]} · {by(s).length} {s === 'purchase-cost' ? (by(s).length === 1 ? 'holding or mandate' : 'holdings and mandates') : by(s).length === 1 ? 'account' : 'accounts'}</p>
        {s !== 'purchase-cost' ? <ul className="mt-1 space-y-1 text-xs">{by(s).map((r) => <li key={r.key}><strong>{r.label}</strong> · {r.split!.note}</li>)}</ul>
          : <p className="mt-1 text-xs">{by(s)[0].split!.note}.</p>}
      </div>)}
      {unsplit.length > 0 && <div data-bridge-unsplit-list>
        <p className="font-semibold text-slate-100">Not split · {money(b.unsplit, true)}</p>
        <ul className="mt-1 space-y-1 text-xs">{unsplit.map((r) => <li key={r.key}><strong>{r.label}</strong> · gain {money(r.gain, true)} · {r.unsplitReason}</li>)}</ul>
      </div>}
    </div>
  </ReturnCalculationInfo>;
}
