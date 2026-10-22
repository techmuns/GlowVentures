import { Fragment, useMemo } from 'react';
import { useMarketHistories } from '@/lib/useMarketReturns';
import { marketReturns, marketReturnSummary, marketHoldingKey } from '@/lib/marketReturns';
import { MarketReturnInfo } from './MarketReturnInfo';
import { HoldingAssumptionInfo } from './HoldingAssumptionInfo';
import { assumedHoldingReturns } from '@/lib/assumedHoldingReturns';
import { assumedHoldingBook } from '@/lib/assumedHoldingBook';
import { CapitalBridge } from './CapitalBridge';
import { capitalBridge } from '@/lib/capitalBridge';
import { BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES, BOOK_HOLDING_INCOME } from '@/data/glowData';
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
import { currentHoldings, dedupedPositions } from '@/lib/analytics';
import { useStockExposure } from '@/lib/useStockExposure';
import { SEGMENT_VIEWS } from '@/lib/segmentReturns';
import SectorAttribution from '@/components/SectorAttribution';
import { exitedRows } from '@/lib/drilldown';
import { PERIODS, RETURN_TYPES, type PeriodKey } from '@/lib/periodReturns';
import { selectedSegmentReturns, returnGapText, UNSPLIT_RETURNS, type ReturnSelection, type SelectedLine } from '@/lib/selectedSegmentReturns';

const COLS = ['seg', 'holdings', 'value', 'weight', 'deployed', 'gain', 'market', 'ret', 'contrib', 'basis'] as const;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const HEAD: Record<string, string> = { category: 'Category', assetClass: 'Asset class', basket: 'Basket', sector: 'Sector / class', side: 'Side', security: 'Security' };

export default function SegmentReturns({ selection: recordedSelection, period }: { selection: ReturnSelection; period: PeriodKey }) {
  const { statementPortfolio, consolidated, fmtFromBase, corporateActions } = usePortfolio();
  const [axis, setAxis] = useViewParam(SEGMENT_VIEWS, {}, 'seg');
  const view = useTableView('cio-attribution', COLS), exp = useExpanded();
  const money = (n: number, sign = false) => fmtFromBase(n, { compact: true, sign });
  // Statement returns keep their dates; labelled assumptions use historical
  // closing prices. Today's intraday quote is never backdated.
  const positions = consolidated;
  const statementPositions = useMemo(() => dedupedPositions(statementPortfolio?.positions ?? []), [statementPortfolio]);
  const calculationCurrent = useMemo(() => currentHoldings(statementPositions), [statementPositions]);
  const exposure = useStockExposure(positions, axis === 'sector');
  const current = useMemo(() => currentHoldings(positions), [positions]);
  const exited = useMemo(() => exitedRows(statementPositions), [statementPositions]);
  const marketFeed = useMarketHistories(current);
  const selection = useMemo(() => {
    if (!statementPortfolio || recordedSelection.inception || !recordedSelection.start || !recordedSelection.end) return recordedSelection;
    const extra = assumedHoldingReturns(current, statementPortfolio.accounts, recordedSelection.start, recordedSelection.end,
      assumedHoldingBook({ actions: corporateActions, instruments: marketFeed.instruments, histories: marketFeed.histories }));
    return { ...recordedSelection, assumedUnits: extra.units, assumptionGaps: extra.gaps };
  }, [recordedSelection, current, statementPortfolio, corporateActions, marketFeed.instruments, marketFeed.histories]);
  // The Sector axis is Sector Composition's own sectors (`SectorAttribution`, Stage 10gs), never this grouping.
  const sectorAxis = axis === 'sector';
  const a = useMemo(() => statementPortfolio && !sectorAxis ? selectedSegmentReturns(current, exited, statementPortfolio.accounts, axis, selection,
    () => null, calculationCurrent) : null, [current, exited, statementPortfolio, axis, selection, calculationCurrent, sectorAxis]);
  // The capital bridge is the selected period's total on every axis (Stage 10gu): the table's own total
  // units, or on the Sector view — which draws no dated total of its own — the same pool grouped by category.
  const pool = useMemo(() => a ?? (statementPortfolio ? selectedSegmentReturns(current, exited, statementPortfolio.accounts, 'category', selection,
    () => null, calculationCurrent) : null), [a, current, exited, statementPortfolio, selection, calculationCurrent]);
  const bridge = useMemo(() => pool && statementPortfolio ? capitalBridge(pool.total.units, { accounts: statementPortfolio.accounts,
    positions: statementPortfolio.positions, bridges: BOOK_ACCOUNT_BRIDGES, moves: BOOK_CAPITAL_MOVES, income: BOOK_HOLDING_INCOME }) : null,
  [pool, statementPortfolio]);
  const market = useMemo(() => marketReturns(current, marketFeed.instruments, marketFeed.histories, selection.start,
    selection.end ?? new Date().toISOString().slice(0, 10), selection.type, selection.inception), [current, marketFeed.instruments, marketFeed.histories, selection]);
  const marketOf = (ps: readonly typeof current[number][]) => {
    const keys = new Set(ps.map(marketHoldingKey));
    const units = market.units.filter(u => keys.has(marketHoldingKey(u.position)));
    const gaps = market.gaps.filter(g => keys.has(marketHoldingKey(g.position)));
    const summary = marketReturnSummary(units, selection.type, market.from, market.to);
    const pending = ps.filter(p => { const i = marketFeed.instruments.get(p.securityKey); return p.marketValue > 0 && i && !marketFeed.histories[i.key]; }).length;
    return { ...summary, units, gaps, pending };
  };
  const marketInfo = (label: string, ps: readonly typeof current[number][]) => {
    const m = marketOf(ps);
    return <MarketReturnInfo label={label} value={m.pct == null ? '—' : pct(m.pct)} units={m.units} gaps={m.gaps} positions={ps} accounts={statementPortfolio?.accounts ?? []}
      totalValue={ps.reduce((s, p) => s + p.marketValue, 0)} from={m.from} to={m.to} annual={m.annual} pending={m.pending} requestedStart={selection.start} requestedEnd={selection.end} onRetry={marketFeed.retry} inception={selection.inception} money={money} />;
  };
  const type = RETURN_TYPES.find(t => t.key === selection.type)!;
  const periodLabel = PERIODS.find(p => p.key === period)!.label;
  const dates = selection.inception ? 'since investment' : selection.start && selection.end ? `${fmtDate(selection.start)} → ${fmtDate(selection.end)}` : 'choose valid dates';
  const btn = (on: boolean) => `rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${on ? 'bg-champagne-500 text-ink-950' : 'text-slate-400 hover:bg-ink-700/60 hover:text-slate-200'}`;
  const axisTabs = <div role="tablist" aria-label="Attribute the return by" className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5">
    {SEGMENT_VIEWS.map(v => <button key={v.key} type="button" role="tab" aria-selected={axis === v.key} title={v.title} data-seg-axis-option={v.key} onClick={() => setAxis(v.key)} className={btn(axis === v.key)}>{v.label}</button>)}
  </div>;
  const title = <>Return attribution · <span className="font-normal text-slate-400" data-seg-basis>{periodLabel} · {type.label} · {dates}</span></>;
  const marketCard = <div className="card mb-2 flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-market-summary data-market-total={market.pct ?? ''}
    data-market-period={market.periodPct ?? ''} data-market-covered={market.count} data-market-pending={market.pending} data-market-refreshing={marketFeed.refreshing}>
    <div><p className="text-[11px] text-slate-400">Portfolio-weighted market return · current holdings</p>
      <div className="mt-1 flex items-center gap-2"><strong className={`text-xl tabular ${changeColor(market.pct)}`}>{market.pct == null ? market.pending ? 'Loading historical prices…' : 'History unavailable' : `${pct(market.pct)}${market.annual ? ' p.a.' : ''}`}</strong>{marketInfo('Total', current)}
        {market.annual && market.periodPct != null && <span className="text-xs text-slate-400" title="The same price return over the period itself, not stated per year">· <span className={`tabular ${changeColor(market.periodPct)}`}>{pct(market.periodPct)}</span> over the period</span>}</div>
      <p className="mt-1 text-xs text-slate-400">{market.count} of {current.length} holdings · {money(market.value)} covered{market.pending > 0 && ` · ${market.pending} loading`}{market.pending === 0 && marketFeed.refreshing > 0 && ' · updating'}{market.from && market.to && ` · ${fmtDate(market.from)} → ${fmtDate(market.to)}`}</p>
    </div><button type="button" className="btn-secondary text-xs" onClick={marketFeed.retry} data-market-retry>Retry missing histories</button>
  </div>;
  const bridgeCard = pool && <CapitalBridge bridge={bridge} total={pool.total} typeLabel={type.label} caption={`${periodLabel} · ${dates}`} money={money} />;
  if (sectorAxis && statementPortfolio) return <div className="shrink-0" data-segment-returns data-returns-attribution data-seg-axis={axis} data-seg-period={period} data-seg-type={selection.type}
    data-seg-start={selection.start ?? ''} data-seg-end={selection.end ?? ''} data-status={exposure.status === 'loading' ? 'loading' : 'ready'}>
    {bridgeCard}
    {marketCard}
    <Card pad={false} title={title}
      subtitle="Sectors as Sector Composition draws them. Market return follows the selected dates; gain, return on cost and contribution are since investment, over the holdings that report a purchase cost."
      right={<div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">{axisTabs}</div>}>
      <SectorAttribution consolidated={positions} exposure={exposure} marketOf={marketOf} marketInfo={marketInfo} />
    </Card>
  </div>;
  if (!a) return null;
  const reason = (l: SelectedLine) => l.measured?.reason ?? (l.missing.length ? l.missing[0].plainReason ? l.missing[0].reason : returnGapText(l.missing[0].reason, selection.start)
    : 'No complete value and money record is available for these dates.');
  const rows = sortRows(a.rows, view.sort, { seg: r => r.label, holdings: r => r.positions.length, value: r => r.value,
    weight: r => r.value, deployed: r => r.invested, gain: r => r.gain, market: r => marketOf(r.positions).pct, ret: r => r.returnPct, contrib: r => r.contribution,
    basis: r => r.units.some(u => u.assumption) ? 'Assumed held' : 'Statement records' });
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
    const pad = TREE_CELL[kind], m = marketOf(l.positions);
    return [
      <td key="holdings" className={`${pad} text-right mono text-slate-400`}>{l.positions.length || (l.units.length ? '—' : 0)}</td>,
      <td key="value" className={`${pad} text-right mono text-slate-100`}>{l.key === UNSPLIT_RETURNS || (!l.positions.length && l.units.length) ? <AbsentCell reason="This row has no separate current holding value. Its recorded gain is included in the total." /> : money(l.value)}</td>,
      <td key="weight" className={`${pad} text-right mono text-slate-400`}>{a.total.value > 0 && l.positions.length ? `${(l.value / a.total.value * 100).toFixed(1)}%` : <AbsentCell reason="No separate holding value on this row" />}</td>,
      <td key="deployed" className={`${pad} text-right mono text-slate-300`}>{l.invested != null ? money(l.invested) : <AbsentCell reason={reason(l)} />}</td>,
      <td key="gain" data-seg-cell="gain" className={`${pad} text-right mono ${changeColor(l.gain)}`}><span className="inline-flex items-center justify-end gap-1">
        {l.gain != null ? money(l.gain, true) : <AbsentCell reason={reason(l)} />}<HoldingAssumptionInfo units={l.units} />{info(l, 'gain')}</span></td>,
      <td key="market" data-seg-cell="market" data-market-return={m.pct ?? ''} className={`${pad} text-right mono ${changeColor(m.pct)}`}><span className="inline-flex items-center justify-end gap-1">
        {m.pct != null ? <>{pct(m.pct)}{m.annual && <span className="text-[10px]">p.a.</span>}</> : m.pending ? <span className="text-slate-400">Loading…</span> : <AbsentCell reason={m.gaps[0]?.reason ?? 'This row has no separately priced current holdings.'} />}
        {l.positions.length > 0 && marketInfo(l.key === 'total' ? 'Total' : l.label, l.positions)}</span></td>,
      <td key="ret" data-seg-cell="ret" className={`${pad} text-right mono ${changeColor(l.returnPct)}`}><span className="inline-flex items-center justify-end gap-1"
        title={l.measured?.basis === 'annual' && l.periodPct != null ? `${pct(l.periodPct)} over the period itself, not stated per year` : undefined}>
        {l.returnPct != null ? <>{pct(l.returnPct)}{l.measured?.basis === 'annual' && <span className="text-[10px]">p.a.</span>}</> : <AbsentCell reason={reason(l)} />}<HoldingAssumptionInfo units={l.units} />{info(l, 'return')}</span></td>,
      <td key="contrib" className={`${pad} text-right mono ${changeColor(l.contribution)}`}>{l.contribution != null ? `${l.contribution >= 0 ? '+' : ''}${l.contribution.toFixed(2)} pp` : <AbsentCell reason={contributionReason} />}</td>,
      <td key="basis" className={`${pad} text-right text-[11px] text-slate-400`}>{l.units.some(u => u.assumption)
        ? l.units.every(u => u.assumption) ? 'Assumed held' : 'Statements + assumed held' : l.units.length ? 'Statement records' : 'Missing records'}</td>,
    ];
  };
  const totalCells = cells(a.total, 'parent');
  return <div className="shrink-0" data-segment-returns data-returns-attribution data-seg-axis={axis} data-seg-period={period} data-seg-type={selection.type}
    data-seg-start={selection.start ?? ''} data-seg-end={selection.end ?? ''} data-seg-covered={a.coveredHoldings}
    data-seg-total-gain={a.total.gain ?? ''} data-seg-total-deployed={a.denominator ?? a.total.invested ?? ''}
    data-seg-total-value={a.total.value} data-seg-total-ret={a.total.returnPct ?? ''} data-seg-total-period-ret={a.total.periodPct ?? ''}
    data-seg-assumed={a.total.units.filter(u => u.assumption).length} data-status="ready">
    {bridgeCard}
    {marketCard}
    <Card pad={false} title={title}
      subtitle="Gain and return use available statements plus labelled holding assumptions. Open the info button for shares, dates and missing records. Market return uses current portfolio weights."
      right={<div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
        {axisTabs}
        {openable.length > 0 && <ExpandAllButton allOpen={allOpen} onClick={() => exp.setMany(openable.map(r => r.key), !allOpen)} />}
      </div>}>
      <div className="overflow-x-auto"><ExportableTable className="min-w-full whitespace-nowrap text-[12.5px]" data-seg-table>
        <thead className="border-b border-ink-700 bg-ink-800"><Tr view={view}>
          <SortHeader col="seg" view={view} align="left" pad="px-4 py-2">{HEAD[axis]}</SortHeader>
          <SortHeader col="holdings" view={view} pad="px-4 py-2">Holdings</SortHeader>
          <SortHeader col="value" view={view} pad="px-4 py-2" title="Full holding value, including available live prices. The return calculation's own dated values are in its info card.">Value now</SortHeader>
          <SortHeader col="weight" view={view} pad="px-4 py-2">Current weight</SortHeader>
          <SortHeader col="deployed" view={view} pad="px-4 py-2" title={selection.inception ? 'Purchase cost or money paid in, for the measured portion only' : 'Opening value plus money added during the selected period, for the measured portion only'}>{selection.inception ? 'Invested' : 'Opening + added'}</SortHeader>
          <SortHeader col="gain" view={view} pad="px-4 py-2">Gain / loss</SortHeader>
          <SortHeader col="market" view={view} pad="px-4 py-2" title="Historical price/NAV performance weighted by current holding values. The info button lists dates, weights, sources and exclusions.">Market return</SortHeader>
          <SortHeader col="ret" view={view} pad="px-4 py-2">Return · {type.label}</SortHeader>
          <SortHeader col="contrib" view={view} pad="px-4 py-2" title="For Absolute return only: row gain divided by the total's shared money base, so these contributions add to the total return.">Contribution</SortHeader>
          <SortHeader col="basis" view={view} pad="px-4 py-2" title="Assumed held means no later sale or transfer appears in the records we have. This basis is also included in Excel exports.">Holding basis</SortHeader>
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
