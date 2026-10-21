import { Fragment, useMemo } from 'react';
import { AvailableReturnCoverage } from '@/components/AvailableReturnCoverage';
import { Card } from '@/components/Card';
import { ExportableTable } from '@/components/ExportableTable';
import { AbsentCell } from '@/components/Absent';
import { ReturnCalculationInfo } from '@/components/ReturnCalculation';
import { SortHeader, Tr, TrFoot } from '@/components/SortHeader';
import { TREE_ROW, TREE_CELL, TreeNameCell, rowToggle, useExpanded, ExpandAllButton } from '@/components/TreeTable';
import { useViewParam } from '@/components/ViewToggle';
import { useTableView, sortRows } from '@/lib/tableView';
import { usePortfolio } from '@/context/PortfolioContext';
import { changeColor, fmtDate } from '@/lib/format';
import { currentHoldings, dedupedPositions, isCompanyShare } from '@/lib/analytics';
import { companySectorIndex } from '@/lib/lookthrough';
import { useStockExposure } from '@/lib/useStockExposure';
import { SEGMENT_VIEWS } from '@/lib/segmentReturns';
import { exitedRows } from '@/lib/drilldown';
import { PERIODS, RETURN_TYPES, type PeriodKey } from '@/lib/periodReturns';
import { selectedSegmentReturns, returnGapText, UNSPLIT_RETURNS, type ReturnSelection, type SelectedLine } from '@/lib/selectedSegmentReturns';

const COLS = ['seg', 'holdings', 'value', 'weight', 'deployed', 'gain', 'ret', 'contrib'] as const;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const HEAD: Record<string, string> = { category: 'Category', assetClass: 'Asset class', basket: 'Basket', sector: 'Sector / class', side: 'Side', security: 'Security' };

export default function SegmentReturns({ selection, period }: { selection: ReturnSelection; period: PeriodKey }) {
  const { statementPortfolio, consolidated, fmtFromBase } = usePortfolio();
  const [axis, setAxis] = useViewParam(SEGMENT_VIEWS, {}, 'seg');
  const view = useTableView('cio-attribution', COLS), exp = useExpanded();
  const money = (n: number, sign = false) => fmtFromBase(n, { compact: true, sign });
  // Dated returns close at statement values. Today's quote must never be backdated.
  const positions = consolidated;
  const statementPositions = useMemo(() => dedupedPositions(statementPortfolio?.positions ?? []), [statementPortfolio]);
  const calculationCurrent = useMemo(() => currentHoldings(statementPositions), [statementPositions]);
  const exposure = useStockExposure(positions, axis === 'sector');
  const sectors = useMemo(() => axis === 'sector' ? companySectorIndex(positions.filter(isCompanyShare), exposure) : null, [positions, exposure, axis]);
  const current = useMemo(() => currentHoldings(positions), [positions]);
  const exited = useMemo(() => exitedRows(statementPositions), [statementPositions]);
  const a = useMemo(() => statementPortfolio ? selectedSegmentReturns(current, exited, statementPortfolio.accounts, axis, selection,
    k => sectors?.get(k)?.sector || null, calculationCurrent) : null, [current, exited, statementPortfolio, axis, selection, sectors, calculationCurrent]);
  if (!a) return null;
  const type = RETURN_TYPES.find(t => t.key === selection.type)!;
  const periodLabel = PERIODS.find(p => p.key === period)!.label;
  const dates = selection.inception ? 'since investment' : selection.start && selection.end ? `${fmtDate(selection.start)} → ${fmtDate(selection.end)}` : 'choose valid dates';
  const reason = (l: SelectedLine) => l.measured?.reason ?? (l.missing.length ? returnGapText(l.missing[0].reason, selection.start)
    : 'No complete value and money record is available for these dates.');
  const rows = sortRows(a.rows, view.sort, { seg: r => r.label, holdings: r => r.positions.length, value: r => r.value,
    weight: r => r.value, deployed: r => r.invested, gain: r => r.gain, ret: r => r.returnPct, contrib: r => r.contribution });
  const openable = a.rows.filter(r => r.children.length > 0);
  const allOpen = openable.length > 0 && openable.every(r => exp.isOpen(r.key));
  const totalCaption = `${a.coveredHoldings} of ${current.length} holdings · ${money(a.coveredValue)} covered`;

  const info = (l: SelectedLine, field: 'gain' | 'return') => {
    const total = l.key === 'total';
    const value = field === 'gain' ? l.gain == null ? '—' : money(l.gain, true) : l.returnPct == null ? '—' : pct(l.returnPct);
    return <ReturnCalculationInfo label={`${total ? 'Total' : l.label} ${field}`} value={value}
      intro="What this figure covers" triggerLabel={`What is included in ${total ? 'total' : l.label} ${field}?`}>
      <AvailableReturnCoverage line={l} selection={selection} accounts={statementPortfolio?.accounts ?? []} money={money} field={field} />
    </ReturnCalculationInfo>;
  };
  const contributionReason = selection.type !== 'absolute' ? 'XIRR and CAGR are calculated separately for each row. Adding these percentages would give a misleading total.' : reason(a.total);
  const cells = (l: SelectedLine, kind: 'parent' | 'child') => {
    const pad = TREE_CELL[kind];
    return [
      <td key="holdings" className={`${pad} text-right mono text-slate-400`}>{l.positions.length || (l.units.length ? '—' : 0)}</td>,
      <td key="value" className={`${pad} text-right mono text-slate-100`}>{l.key === UNSPLIT_RETURNS || (!l.positions.length && l.units.length) ? <AbsentCell reason="This row has no separate current holding value. Its recorded gain is included in the total." /> : money(l.value)}</td>,
      <td key="weight" className={`${pad} text-right mono text-slate-400`}>{a.total.value > 0 && l.positions.length ? `${(l.value / a.total.value * 100).toFixed(1)}%` : <AbsentCell reason="No separate holding value on this row" />}</td>,
      <td key="deployed" className={`${pad} text-right mono text-slate-300`}>{l.invested != null ? money(l.invested) : <AbsentCell reason={reason(l)} />}</td>,
      <td key="gain" data-seg-cell="gain" className={`${pad} text-right mono ${changeColor(l.gain)}`}><span className="inline-flex items-center justify-end gap-1">
        {l.gain != null ? money(l.gain, true) : <AbsentCell reason={reason(l)} />}{info(l, 'gain')}</span></td>,
      <td key="ret" data-seg-cell="ret" className={`${pad} text-right mono ${changeColor(l.returnPct)}`}><span className="inline-flex items-center justify-end gap-1">
        {l.returnPct != null ? pct(l.returnPct) : <AbsentCell reason={reason(l)} />}{info(l, 'return')}</span></td>,
      <td key="contrib" className={`${pad} text-right mono ${changeColor(l.contribution)}`}>{l.contribution != null ? `${l.contribution >= 0 ? '+' : ''}${l.contribution.toFixed(2)} pp` : <AbsentCell reason={contributionReason} />}</td>,
    ];
  };
  const totalCells = cells(a.total, 'parent');
  const btn = (on: boolean) => `rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${on ? 'bg-champagne-500 text-ink-950' : 'text-slate-400 hover:bg-ink-700/60 hover:text-slate-200'}`;
  return <div className="shrink-0" data-segment-returns data-returns-attribution data-seg-axis={axis} data-seg-period={period} data-seg-type={selection.type}
    data-seg-start={selection.start ?? ''} data-seg-end={selection.end ?? ''} data-seg-covered={a.coveredHoldings}
    data-seg-total-gain={a.total.gain ?? ''} data-seg-total-deployed={a.denominator ?? a.total.invested ?? ''}
    data-seg-total-value={a.total.value} data-seg-total-ret={a.total.returnPct ?? ''}
    data-status={axis === 'sector' && exposure.status === 'loading' ? 'loading' : 'ready'}>
    <Card pad={false} title={<>Return attribution · <span className="font-normal text-slate-400" data-seg-basis>{periodLabel} · {type.label} · {dates}</span></>}
      subtitle="Gain and return cover the available records only. Open the info button for the amount covered and the missing records. Value now is the full holding value, including available live prices; return calculations use dated statement values."
      right={<div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
        <div role="tablist" aria-label="Attribute the return by" className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5">
          {SEGMENT_VIEWS.map(v => <button key={v.key} type="button" role="tab" aria-selected={axis === v.key} title={v.title} data-seg-axis-option={v.key} onClick={() => setAxis(v.key)} className={btn(axis === v.key)}>{v.label}</button>)}
        </div>
        {openable.length > 0 && <ExpandAllButton allOpen={allOpen} onClick={() => exp.setMany(openable.map(r => r.key), !allOpen)} />}
      </div>}>
      <div className="overflow-x-auto"><ExportableTable className="min-w-full whitespace-nowrap text-[12.5px]" data-seg-table>
        <thead className="border-b border-ink-700 bg-ink-800"><Tr view={view}>
          <SortHeader col="seg" view={view} align="left" pad="px-4 py-2">{HEAD[axis]}</SortHeader>
          <SortHeader col="holdings" view={view} pad="px-4 py-2">Holdings</SortHeader>
          <SortHeader col="value" view={view} pad="px-4 py-2" title="Full holding value, including available live prices. The return calculation's own dated values are in its info card.">Value now</SortHeader>
          <SortHeader col="weight" view={view} pad="px-4 py-2">Weight</SortHeader>
          <SortHeader col="deployed" view={view} pad="px-4 py-2" title={selection.inception ? 'Purchase cost or money paid in, for the measured portion only' : 'Opening value plus money added during the selected period, for the measured portion only'}>{selection.inception ? 'Invested' : 'Opening + added'}</SortHeader>
          <SortHeader col="gain" view={view} pad="px-4 py-2">Gain</SortHeader>
          <SortHeader col="ret" view={view} pad="px-4 py-2">Return · {type.label}</SortHeader>
          <SortHeader col="contrib" view={view} pad="px-4 py-2" title="For Absolute return only: row gain divided by the total's shared money base, so these contributions add to the total return.">Contribution</SortHeader>
        </Tr></thead>
        <tbody className="divide-y divide-ink-700/60">{rows.map(r => <Fragment key={r.key}>
          <Tr view={view} className={r.children.length ? TREE_ROW.parent : ''} {...(r.children.length ? rowToggle(() => exp.toggle(r.key)) : {})}
            data-seg-row={r.key} data-seg-value={r.value} data-seg-gain={r.gain ?? ''} data-seg-contrib={r.contribution ?? ''} data-seg-open={exp.isOpen(r.key) ? '1' : '0'}>
            <TreeNameCell depth={0} title={r.label} open={r.children.length ? exp.isOpen(r.key) : undefined} onToggle={r.children.length ? () => exp.toggle(r.key) : undefined} toggleData={{ 'data-seg-toggle': r.key }} />
            {cells(r, 'parent')}
          </Tr>
          {exp.isOpen(r.key) && r.children.map((c, i) => <Tr key={c.key} view={view} className={TREE_ROW.child} data-seg-child={r.key}>
            <TreeNameCell depth={1} title={c.label} last={i === r.children.length - 1} />{cells(c, 'child')}
          </Tr>)}
        </Fragment>)}</tbody>
        <tfoot className="border-t-2 border-ink-600"><TrFoot view={view} className={`${TREE_ROW.total} px-4 py-2.5 font-semibold`} data-seg-total
          label={<span className="text-slate-100">Total · available data<span data-attribution-total-coverage className="mt-1 block text-[11px] font-normal text-slate-400">{totalCaption}</span></span>}
          cells={Object.fromEntries(COLS.slice(1).map((key, i) => [key, totalCells[i]]))} />
        </tfoot>
      </ExportableTable></div>
    </Card>
  </div>;
}
