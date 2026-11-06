import {  } from "@/lib/useNavigationState";
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMarketHistories } from '@/lib/useMarketReturns';
import { marketHoldingKey } from '@/lib/marketReturns';
import { selectionMarket, selectionMarketOf } from '@/lib/selectionMarket';
import { MarketReturnInfo } from './MarketReturnInfo';
import { HoldingAssumptionInfo } from './HoldingAssumptionInfo';
import { CapitalBridge } from './CapitalBridge';
import { capitalBridge } from '@/lib/capitalBridge';
import { BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES, BOOK_HOLDING_INCOME } from '@/data/glowData';
import { AvailableReturnCoverage } from '@/components/AvailableReturnCoverage';
import { Card } from '@/components/Card';
import { ExportableTable } from '@/components/ExportableTable';
import { EditColumns } from '@/components/EditColumns';
import { AbsentCell } from '@/components/Absent';
import { ReturnCalculationInfo } from '@/components/ReturnCalculation';
import { SortHeader, Tr, TrFoot } from '@/components/SortHeader';
import { TREE_ROW, TREE_CELL, TreeNameCell, rowToggle, useExpanded, ExpandAllButton } from '@/components/TreeTable';
import { useViewParam } from '@/components/ViewToggle';
import { useTableView, sortRows } from '@/lib/tableView';
import { usePortfolio } from '@/context/PortfolioContext';
import { changeColor, fmtDate, fmtNum } from '@/lib/format';
import { currentHoldings, dedupedPositions, isCompanyShare } from '@/lib/analytics';
import { useStockExposure } from '@/lib/useStockExposure';
import { SEGMENT_VIEWS } from '@/lib/segmentReturns';
import SectorAttribution from '@/components/SectorAttribution';
import { exitedRows } from '@/lib/drilldown';
import { PERIODS, RETURN_TYPES, type PeriodKey, type ReturnType } from '@/lib/periodReturns';
import { selectedSegmentReturns, returnGapText, UNSPLIT_RETURNS, type ReturnSelection, type SelectedLine } from '@/lib/selectedSegmentReturns';
import { lineHoldingFigures, type LineHoldingFigures } from '@/lib/lineHoldingFigures';
import { daySessionGate } from '@/lib/dailyMovers';
import { dayMoveLeftNote } from '@/lib/quotes';
import { costCoverNote } from '@/lib/clubbedFigures';
import { companySectorIndex } from '@/lib/lookthrough';
import { UNCLASSIFIED as UNCLASSIFIED_SECTOR } from '@/lib/sectors';
import { accountIndex, ownerOf } from '@/lib/accounts';
import { REVIEW_NOTE, reviewColumn, reviewColumnIds, withReviewAccessors, type ReviewScope } from '@/lib/reviewColumns';
import { InvestedOnCell } from '@/components/InvestedOnCell';
import { ReviewColumnCell } from '@/components/ReviewColumnCell';
import type { Position } from '@/lib/types';

/**
 * PORTFOLIO MONITOR'S HOLDING COLUMNS, HERE TOO (Stage 10hz): Avg cost and
 * Invested on are drawn; Qty, CMP, Day, purchase cost, the two P&Ls, Sector,
 * Entities and the June review's fields are ticked on in Edit Columns. The
 * review's date range is not its own column: Invested on already falls back to it.
 */
const REVIEW_COLS = reviewColumnIds('holding').filter(id => id !== 'review:investmentRange');
const REVIEW_SET = new Set(REVIEW_COLS);
const COLS = ['seg', 'holdings', 'qty', 'avgCost', 'cmp', 'day', 'value', 'weight', 'deployed', 'investedOn', 'cost', 'gain', 'pnl', 'realised',
  'market', 'ret', 'contrib', 'basis', 'sector', 'entity', ...REVIEW_COLS];
const OPTIONAL = ['qty', 'cmp', 'day', 'cost', 'pnl', 'realised', 'sector', 'entity', ...REVIEW_COLS];
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const HEAD: Record<string, string> = { category: 'Category', assetClass: 'Asset class', basket: 'Basket', sector: 'Sector / class', side: 'Side', security: 'Security' };

export default function SegmentReturns({ selection: recordedSelection, period, onReturnTypeResolved }: {
  selection: ReturnSelection; period: PeriodKey; onReturnTypeResolved?: (requested: ReturnType, displayed: ReturnType) => void;
}) {
  const { statementPortfolio, consolidated, fmtFromBase, corporateActions, quoteFeed, scope: memberScope } = usePortfolio();
  const [axis, setAxis] = useViewParam(SEGMENT_VIEWS, {}, 'seg');
  // Export Excel and Edit Columns sit in the card header beside the axis tabs,
  // not in two rows of their own above the table (Stage 10gy).
  const view = useTableView('cio-attribution', COLS, { manualEditor: true, optional: OPTIONAL }), exp = useExpanded("segment-returns");
  const [tools, setTools] = useState<HTMLSpanElement | null>(null);
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
  // THE TAB'S ONE SELECTION (Stage 10lg, `useReturnSelection`): every period the
  // cards' rule, built once in PortfolioReturns and read here as given.
  const selection = recordedSelection;
  // The Sector axis is Sector Composition's own sectors (`SectorAttribution`, Stage 10gs), never this grouping.
  const sectorAxis = axis === 'sector';
  const a = useMemo(() => statementPortfolio && !sectorAxis ? selectedSegmentReturns(current, exited, statementPortfolio.accounts, axis, selection,
    () => null, calculationCurrent) : null, [current, exited, statementPortfolio, axis, selection, calculationCurrent, sectorAxis]);
  // The capital bridge is the selected period's total on every axis (Stage 10gu): the table's own total
  // units, or on the Sector view — which draws no dated total of its own — the same pool grouped by category.
  const pool = useMemo(() => a ?? (statementPortfolio ? selectedSegmentReturns(current, exited, statementPortfolio.accounts, 'category', selection,
    () => null, calculationCurrent) : null), [a, current, exited, statementPortfolio, selection, calculationCurrent]);
  // Resolve the picker's label without replacing the requested calculation:
  // a mixed total may be absolute while its debt-only rows remain annualised.
  const shownAs = pool?.total.measured?.shownAs;
  useEffect(() => {
    onReturnTypeResolved?.(recordedSelection.type, shownAs ?? recordedSelection.type);
  }, [shownAs, recordedSelection.type, onReturnTypeResolved]);
  const bridge = useMemo(() => pool && statementPortfolio ? capitalBridge(pool.total.units, { accounts: statementPortfolio.accounts,
    positions: statementPortfolio.positions, bridges: BOOK_ACCOUNT_BRIDGES, moves: BOOK_CAPITAL_MOVES, income: BOOK_HOLDING_INCOME }) : null,
  [pool, statementPortfolio]);
  // MARKET PERFORMANCE OVER EVERY HOLDING (Stage 10lg): each holding's own return over the
  // period from the same selection, weighted by today's value (`selectionMarket`).
  const market = useMemo(() => selectionMarket(current, pool?.total.units ?? [], pool?.total.missing ?? [], selection.start, selection.end,
    { inception: selection.inception }), [current, pool, selection.start, selection.end, selection.inception]);
  // A line that is whole PMS accounts is dated, and joined to the review, as
  // the accounts — the Monitor's mandate rows — never by the manager's own
  // purchases inside them. On All Securities a line is a security.
  const idx = useMemo(() => accountIndex(statementPortfolio?.accounts ?? []), [statementPortfolio]);
  const heldPerAccount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of current) m.set(p.accountId, (m.get(p.accountId) ?? 0) + 1);
    return m;
  }, [current]);
  const wholeAccountsOf = useMemo(() => (l: SelectedLine): string[] | null => {
    if (!l.positions.length) return l.units.length && l.units.every(u => u.key === u.accountId) ? [...new Set(l.units.map(u => u.accountId))] : null;
    if (axis === 'security') return null;
    const ids = [...new Set(l.positions.map(p => p.accountId))];
    return ids.every(id => idx.get(id)?.engagement === 'PMS' && l.positions.filter(p => p.accountId === id).length === heldPerAccount.get(id)) ? ids : null;
  }, [axis, idx, heldPerAccount]);
  // The Monitor's sector for a company share (statement → fund filing → screener.in); anything else as its statement prints it.
  const companySectors = useMemo(() => companySectorIndex(positions.filter(isCompanyShare), exposure), [positions, exposure]);
  const inSession = useMemo(() => daySessionGate(quoteFeed, current), [quoteFeed, current]);
  const figures = useMemo(() => {
    const m = new Map<SelectedLine, LineHoldingFigures>();
    if (!a) return m;
    const sectorOf = (p: Position) => isCompanyShare(p) ? companySectors.get(p.securityKey)?.sector || UNCLASSIFIED_SECTOR : p.sector;
    const add = (l: SelectedLine) => m.set(l, lineHoldingFigures(l.positions, { wholeAccounts: wholeAccountsOf(l), inSession, sectorOf, ownerOf: p => ownerOf(idx, p) }));
    for (const r of a.rows) { add(r); for (const c of r.children) { add(c); c.children.forEach(add); } }
    add(a.total);
    return m;
  }, [a, companySectors, inSession, idx, wholeAccountsOf]);
  // Since investment covers every holding; a period, the public ones — private investments are reported apart, as on the cards.
  const marketBase = useMemo(() => current.filter(p => p.marketValue > 0 && (selection.inception || p.marketSide !== 'private')), [current, selection.inception]);
  const marketPrivate = selection.inception ? 0 : current.filter(p => p.marketValue > 0 && p.marketSide === 'private').length;
  const marketOf = (ps: readonly typeof current[number][]) => {
    const m = selectionMarketOf(market, ps);
    const pending = ps.filter(p => { const i = marketFeed.instruments.get(p.securityKey); return p.marketValue > 0 && i && !marketFeed.histories[i.key]; }).length;
    return { ...m, pending };
  };
  const marketInfo = (label: string, all: readonly typeof current[number][]) => {
    // A period reports private investments apart (Stage 10lh): its details list the public holdings,
    // as the face's denominator does, and name the rest. A row of private holdings alone still lists them.
    // A holding with no positive value today carries no weight, and is not counted on the face either.
    const apartOn = !selection.inception && !all.every(p => p.marketSide === 'private');
    const apart = apartOn ? all.filter(p => p.marketSide === 'private' && p.marketValue > 0) : [];
    const weighted = all.filter(p => p.marketValue > 0 && !(apartOn && p.marketSide === 'private'));
    const ps = weighted.length ? weighted : all;
    const m = marketOf(ps);
    return <MarketReturnInfo label={label} value={m.pct == null ? '—' : pct(m.pct)} units={m.units} gaps={m.gaps} positions={ps} accounts={statementPortfolio?.accounts ?? []}
      totalValue={ps.reduce((s, p) => s + p.marketValue, 0)} from={m.from} to={m.to} annual={m.annual} pending={m.pending} requestedStart={selection.start} requestedEnd={selection.end} onRetry={marketFeed.retry} inception={selection.inception} money={money}
      privateApart={apart.length ? { count: apart.length, value: apart.reduce((s, p) => s + p.marketValue, 0) } : undefined} />;
  };
  const type = RETURN_TYPES.find(t => t.key === selection.type)!;
  const periodLabel = PERIODS.find(p => p.key === period)!.label;
  const dates = selection.inception ? 'since investment' : selection.start && selection.end ? `${fmtDate(selection.start)} → ${fmtDate(selection.end)}` : 'choose valid dates';
  const btn = (on: boolean) => `rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${on ? 'bg-champagne-500 text-ink-950' : 'text-slate-400 hover:bg-ink-700/60 hover:text-slate-200'}`;
  const axisTabs = <div role="tablist" aria-label="Attribute the return by" className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5">
    {SEGMENT_VIEWS.map(v => <button key={v.key} type="button" role="tab" aria-selected={axis === v.key} title={v.title} data-seg-axis-option={v.key} onClick={() => setAxis(v.key)} className={btn(axis === v.key)}>{v.label}</button>)}
  </div>;
  const title = <>Return attribution · <span className="font-normal text-slate-400" data-seg-basis>{periodLabel} · {type.label} · {dates}</span></>;
  // NO MARKET PERFORMANCE CARD (Stage 10lz): its figure, coverage, details and retry were the
  // Total row's own Market return cell, set beside Investment performance as a rival headline.
  // The panel carries the total's handles; the Total row draws it.
  const marketData = { 'data-market-total': market.pct ?? '', 'data-market-period': market.periodPct ?? '', 'data-market-covered': market.count,
    'data-market-pending': market.pending, 'data-market-from': market.from ?? '', 'data-market-to': market.to ?? '', 'data-market-refreshing': marketFeed.refreshing,
    'data-market-denominator': marketBase.length, 'data-market-private': marketPrivate };
  const bridgeCard = pool && <CapitalBridge bridge={bridge} total={pool.total}
    typeLabel={pool.total.measured?.shownAs === 'absolute' && selection.type !== 'absolute' ? RETURN_TYPES.find(t => t.key === 'absolute')!.label : type.label}
    caption={`${periodLabel} · ${dates}`} money={money} />;
  const summaryCards = <div className="mb-3" data-return-summary-cards>{bridgeCard}</div>;
  if (sectorAxis && statementPortfolio) return <div className="shrink-0" data-segment-returns data-returns-attribution data-seg-axis={axis} data-seg-period={period} data-seg-type={selection.type}
    data-seg-start={selection.start ?? ''} data-seg-end={selection.end ?? ''} data-status={exposure.status === 'loading' ? 'loading' : 'ready'} {...marketData}>
    {summaryCards}
    <Card pad={false} title={title}
      subtitle="Sectors as Sector Composition draws them. Market return follows the selected dates; gain, return on cost and contribution are since investment, over the holdings that report a purchase cost."
      right={<div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">{axisTabs}</div>}>
      <SectorAttribution consolidated={positions} exposure={exposure} marketOf={marketOf} marketInfo={marketInfo} />
    </Card>
  </div>;
  if (!a) return null;
  const reason = (l: SelectedLine) => !l.measured?.reason && l.missing[0]?.plainReason ? l.missing[0].reason
    : returnGapText(l.measured?.reason ?? l.missing[0]?.reason ?? 'We need values and dated payments for these dates.', selection.start);
  const fig = (l: SelectedLine) => figures.get(l) ?? lineHoldingFigures(l.positions, { wholeAccounts: wholeAccountsOf(l), inSession, ownerOf: p => ownerOf(idx, p) });
  const reviewScopeOf = (l: SelectedLine): ReviewScope => {
    const whole = wholeAccountsOf(l);
    return whole && whole.every(id => idx.get(id)?.engagement === 'PMS') ? { accountIds: whole, isMandate: true } : { positions: l.positions };
  };
  const named = (xs: string[], noun: string) => xs.length === 1 ? xs[0] : xs.length ? `${xs.length} ${noun}` : null;
  const accessors = withReviewAccessors<SelectedLine>({ seg: r => r.label, holdings: r => r.positions.length, value: r => r.value,
    weight: r => r.value, deployed: r => r.invested, gain: r => r.gain, market: r => marketOf(r.positions).pct, ret: r => r.returnPct, contrib: r => r.contribution,
    basis: r => r.units.some(u => u.assumption) ? 'Assumed held' : 'Statement records',
    qty: r => fig(r).quantity, avgCost: r => fig(r).avgCost, cmp: r => fig(r).price, day: r => fig(r).day.pct,
    investedOn: r => fig(r).investedOn?.first, cost: r => fig(r).costReason ? null : fig(r).cost.cost,
    pnl: r => fig(r).unrealised, realised: r => fig(r).realised,
    sector: r => named(fig(r).sectors, 'sectors'), entity: r => named(fig(r).owners, 'entities') }, reviewScopeOf, memberScope.owners !== null);
  const rows = sortRows(a.rows, view.sort, accessors);
  // An account under a segment opens into its holdings (Stage 10ik); its key names its parent too.
  const childKey = (r: SelectedLine, c: SelectedLine) => `${r.key}::${c.key}`;
  const openable = [...a.rows.filter(r => r.children.length > 0).map(r => r.key),
    ...a.rows.flatMap(r => r.children.filter(c => c.children.length > 0).map(c => childKey(r, c)))];
  const allOpen = openable.length > 0 && openable.every(k => exp.isOpen(k));
  const totalCaption = `${a.coveredHoldings} of ${current.length} holdings · ${money(a.coveredValue)} covered`;

  const info = (l: SelectedLine, field: 'gain' | 'return') => {
    const total = l.key === 'total';
    const value = field === 'gain' ? l.gain == null ? '—' : money(l.gain, true) : l.returnPct == null ? '—' : pct(l.returnPct);
    return <ReturnCalculationInfo label={`${total ? 'Total' : l.label} ${field}`} value={value}
      intro="What this figure covers" triggerLabel={`What is included in ${total ? 'total' : l.label} ${field}?`}>
      <AvailableReturnCoverage line={l} selection={selection} accounts={statementPortfolio?.accounts ?? []} money={money} field={field} />
    </ReturnCalculationInfo>;
  };
  const contributionReason = a.denominator == null && selection.type !== 'absolute' ? 'XIRR and CAGR are calculated separately for each row. Adding these percentages would give a misleading total.' : reason(a.total);
  // UNDER A YEAR AN XIRR OR CAGR IS SHOWN AS THE ABSOLUTE RETURN (Stage 10hk), and the cell says so.
  const shownAbsolute = (l: SelectedLine) => selection.type !== 'absolute' && l.measured?.shownAs === 'absolute';
  const typeHead = a.total.measured?.shownAs === 'absolute' && selection.type !== 'absolute' ? `${type.label} · absolute under a year` : type.label;
  // The Monitor's holding columns (`lineHoldingFigures`). Per-unit figures need
  // one security; the money is since purchase, never the selected period's.
  const holdingCells = (l: SelectedLine, pad: string) => {
    const f = fig(l), cover = costCoverNote(f.cost, n => money(n), n => fmtNum(n)), partial = !f.cost.complete && !f.costReason;
    const price = l.positions.every(p => p.live) ? 'Live exchange price' : 'Statement mark — no live quote for every line';
    const text = (key: string, xs: string[], noun: string, why: string) => <td key={key} data-seg-cell={key} className={`${pad} text-left text-[11px] text-slate-400`}>
      {xs.length === 1 ? xs[0] : xs.length ? <span title={xs.join(', ')}>{xs.length} {noun}</span> : <AbsentCell reason={l.positions.length ? why : f.costReason ?? why} />}</td>;
    return {
      qty: <td key="qty" data-seg-cell="qty" className={`${pad} text-right mono text-slate-300`}>{f.quantity != null ? fmtNum(f.quantity) : <AbsentCell reason={f.quantityReason!} />}</td>,
      avgCost: <td key="avgCost" data-seg-cell="avgCost" data-avg-cost={f.avgCost ?? ''} className={`${pad} text-right mono text-slate-300`}>
        {f.avgCost != null ? <span title={cover || undefined}>{fmtFromBase(f.avgCost)}{partial && <span className="ml-1 text-[10px] text-amber-400/80">◦</span>}</span> : <AbsentCell reason={f.avgCostReason!} />}</td>,
      cmp: <td key="cmp" data-seg-cell="cmp" className={`${pad} text-right mono text-slate-400`}>{f.price != null ? <span title={price}>{fmtFromBase(f.price)}</span> : <AbsentCell reason={f.priceReason!} />}</td>,
      day: <td key="day" data-seg-cell="day" className={`${pad} text-right mono ${changeColor(f.day.pct)}`}>
        {f.day.pct != null ? <span title={dayMoveLeftNote(f.day.left).trim() || undefined}>{pct(f.day.pct)}</span> : <AbsentCell reason={f.dayReason!} />}</td>,
      investedOn: <td key="investedOn" data-seg-cell="investedOn" data-invested-first={f.investedOn?.first ?? ''} className={`${pad} text-left mono text-xs text-slate-400`}>
        <InvestedOnCell d={f.investedOn} why={f.investedOnReason} /></td>,
      cost: <td key="cost" data-seg-cell="cost" data-cost={f.costReason ? '' : f.cost.cost ?? ''} className={`${pad} text-right mono text-slate-300`}>
        {!f.costReason && f.cost.cost != null ? <span title={cover || undefined}>{money(f.cost.cost)}{partial && <span className="ml-1 text-[10px] text-amber-400/80">◦</span>}</span> : <AbsentCell reason={f.costReason ?? 'No statement reports what these holdings cost.'} />}</td>,
      pnl: <td key="pnl" data-seg-cell="pnl" data-pnl={f.unrealised ?? ''} className={`${pad} text-right mono ${changeColor(f.unrealised)}`}>
        {f.unrealised != null ? <span title={cover || undefined}>{money(f.unrealised, true)}</span>
          : <AbsentCell reason={f.costReason ?? 'Every costed holding here is held at cost: the review records what was paid and no valuation, so there is no gain to strike.'} />}</td>,
      realised: <td key="realised" data-seg-cell="realised" data-realised={f.realised ?? ''} className={`${pad} text-right mono ${changeColor(f.realised)}`}>
        {f.realised != null ? <span title={f.realisedUnverified.length ? `Left out, their sale records unverified: ${f.realisedUnverified.join(', ')}.` : undefined}>{money(f.realised, true)}</span>
          : <AbsentCell reason={f.realisedReason!} />}</td>,
      sector: text('sector', f.sectors, 'sectors', 'No statement places these holdings in a sector.'),
      entity: text('entity', f.owners, 'entities', 'No account here names who holds it.'),
    };
  };
  const cells = (l: SelectedLine, kind: 'parent' | 'child') => {
    const pad = TREE_CELL[kind], m = marketOf(l.positions), h = holdingCells(l, pad), scope = reviewScopeOf(l);
    return [
      <td key="holdings" className={`${pad} text-right mono text-slate-400`}>{l.positions.length || (l.units.length ? '—' : 0)}</td>,
      h.qty, h.avgCost, h.cmp, h.day,
      <td key="value" className={`${pad} text-right mono text-slate-100`}>{l.key === UNSPLIT_RETURNS || (!l.positions.length && l.units.length) ? <AbsentCell reason="This row has no separate current holding value. Its recorded gain is included in the total." /> : money(l.value)}</td>,
      <td key="weight" className={`${pad} text-right mono text-slate-400`}>{a.total.value > 0 && l.positions.length ? `${(l.value / a.total.value * 100).toFixed(1)}%` : <AbsentCell reason="No separate holding value on this row" />}</td>,
      <td key="deployed" className={`${pad} text-right mono text-slate-300`}>{l.invested != null ? money(l.invested) : <AbsentCell reason={reason(l)} />}</td>,
      h.investedOn, h.cost,
      <td key="gain" data-seg-cell="gain" className={`${pad} text-right mono ${changeColor(l.gain)}`}><span className="inline-flex items-center justify-end gap-1">
        {l.gain != null ? money(l.gain, true) : <AbsentCell reason={reason(l)} />}<HoldingAssumptionInfo units={l.units} />{info(l, 'gain')}</span></td>,
      h.pnl, h.realised,
      <td key="market" data-seg-cell="market" data-market-return={m.pct ?? ''} className={`${pad} text-right mono ${changeColor(m.pct)}`}><span className="inline-flex items-center justify-end gap-1">
        {m.pct != null ? <>{pct(m.pct)}{m.annual && <span className="text-[10px]">p.a.</span>}</> : m.pending ? <span className="text-slate-400">Loading…</span> : <AbsentCell reason={m.gaps[0]?.reason ?? 'This row has no separately priced current holdings.'} />}
        {l.positions.length > 0 && marketInfo(l.key === 'total' ? 'Total' : l.label, l.positions)}</span></td>,
      <td key="ret" data-seg-cell="ret" data-seg-shown-as={l.measured?.shown ? (l.measured.shownAs ?? selection.type) : undefined} className={`${pad} text-right mono ${changeColor(l.returnPct)}`}><span className="inline-flex items-center justify-end gap-1"
        title={shownAbsolute(l) ? `Held under a year, so this is the absolute return, not ${type.label}: a return under a year is never annualised.`
          : l.measured?.basis === 'annual' && l.periodPct != null ? `${pct(l.periodPct)} over the period itself, not stated per year` : undefined}>
        {l.returnPct != null ? <>{shownAbsolute(l) && <span className="ret-tag">ABS</span>}{pct(l.returnPct)}{l.measured?.basis === 'annual' && <span className="text-[10px]">p.a.</span>}</> : <AbsentCell reason={reason(l)} />}<HoldingAssumptionInfo units={l.units} />{info(l, 'return')}</span></td>,
      <td key="contrib" className={`${pad} text-right mono ${changeColor(l.contribution)}`}>{l.contribution != null ? `${l.contribution >= 0 ? '+' : ''}${l.contribution.toFixed(2)} pp` : <AbsentCell reason={contributionReason} />}</td>,
      <td key="basis" className={`${pad} text-right text-[11px] text-slate-400`}>{l.units.some(u => u.assumption)
        ? l.units.every(u => u.assumption) ? 'Assumed held' : 'Statements + assumed held' : l.units.length ? 'Statement records' : 'Missing records'}</td>,
      h.sector, h.entity,
      ...REVIEW_COLS.map(id => <ReviewColumnCell key={id} id={id} scope={scope} />),
    ];
  };
  const totalCells = cells(a.total, 'parent');
  // The review's fields are each product's own; the book's total has none.
  const totalByCol = Object.fromEntries(COLS.slice(1).map((key, i) => [key, totalCells[i]]).filter(([key]) => !REVIEW_SET.has(key as string)));
  return <div className="shrink-0" data-segment-returns data-returns-attribution data-seg-axis={axis} data-seg-period={period} data-seg-type={selection.type}
    data-seg-start={selection.start ?? ''} data-seg-end={selection.end ?? ''} data-seg-covered={a.coveredHoldings}
    data-seg-total-gain={a.total.gain ?? ''} data-seg-total-deployed={a.denominator ?? a.total.invested ?? ''}
    data-seg-total-value={a.total.value} data-seg-total-ret={a.total.returnPct ?? ''} data-seg-total-period-ret={a.total.periodPct ?? ''}
    data-seg-assumed={a.total.units.filter(u => u.assumption).length} data-status="ready" {...marketData}>
    {summaryCards}
    <Card pad={false} title={title}
      subtitle="Gain and return use available statements plus labelled holding assumptions. Open the info button for shares, dates and missing records. Market return uses current portfolio weights."
      right={<div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
        {axisTabs}
        {openable.length > 0 && <ExpandAllButton allOpen={allOpen} onClick={() => exp.setMany(openable, !allOpen)} />}
        <EditColumns view={view} />
        <span ref={setTools} className="inline-flex" data-table-tools />
      </div>}>
      <div className="overflow-x-auto" data-navigation-scroll="segmentreturns-1"><ExportableTable className="min-w-full whitespace-nowrap text-[12.5px]" data-seg-table controlsHost={tools}>
        <thead className="border-b border-ink-700 bg-ink-800"><Tr view={view}>
          <SortHeader col="seg" view={view} align="left" pad="px-4 py-2">{HEAD[axis]}</SortHeader>
          <SortHeader col="holdings" view={view} pad="px-4 py-2">Holdings</SortHeader>
          <SortHeader col="qty" view={view} pad="px-4 py-2" title="Units held, where the row is one security — as Portfolio Monitor shows them.">Qty</SortHeader>
          <SortHeader col="avgCost" view={view} pad="px-4 py-2" title="Purchase cost per unit held, where the row is one security, over the units whose statement reports a cost — as Portfolio Monitor shows it.">Avg cost</SortHeader>
          <SortHeader col="cmp" view={view} pad="px-4 py-2" title="Price per unit now: the live quote where there is one, else the statement's mark. One security only.">CMP</SortHeader>
          <SortHeader col="day" view={view} pad="px-4 py-2" title="Today's move over the row's live holdings, on one trading session.">Day</SortHeader>
          <SortHeader col="value" view={view} pad="px-4 py-2" title="Full holding value, including available live prices. The return calculation's own dated values are in its info card.">Value now</SortHeader>
          <SortHeader col="weight" view={view} pad="px-4 py-2">Current weight</SortHeader>
          <SortHeader col="deployed" view={view} pad="px-4 py-2" title={selection.inception ? 'Purchase cost or money paid in, for the measured portion only' : 'Opening value plus money added during the selected period, for the measured portion only'}>{selection.inception ? 'Invested' : 'Opening + added'}</SortHeader>
          <SortHeader col="investedOn" view={view} align="left" pad="px-4 py-2" title="When this row's money was invested, from its own purchase records: allotments, lots, dated trades or capital calls; a whole PMS account by its own inception and contributions. A date is shown only when every holding in the row is dated. A range labelled review is the product's range in the June review.">Invested on</SortHeader>
          <SortHeader col="cost" view={view} pad="px-4 py-2" title="What the units still held cost, from the statements that report a cost — Portfolio Monitor's Invested. Since purchase, not the selected period.">Purchase cost</SortHeader>
          <SortHeader col="gain" view={view} pad="px-4 py-2">Gain / loss</SortHeader>
          <SortHeader col="pnl" view={view} pad="px-4 py-2" title="Value now less purchase cost, over the holdings that report a cost. Since purchase, not the selected period.">Unreal. P&amp;L</SortHeader>
          <SortHeader col="realised" view={view} pad="px-4 py-2" title="Booked on units already sold, first-in first-out, holding by holding from the statements' own records. Since purchase, not the selected period.">Realised P&amp;L</SortHeader>
          <SortHeader col="market" view={view} pad="px-4 py-2" title="How the holdings held today moved over the period — each one's price, NAV or statement value, weighted by what it is worth today. Not the return on the money invested (that is the Return column). The info button lists dates, weights, sources and exclusions.">Market return</SortHeader>
          <SortHeader col="ret" view={view} pad="px-4 py-2">Return · {typeHead}</SortHeader>
          <SortHeader col="contrib" view={view} pad="px-4 py-2" title="For Absolute return only: row gain divided by the total's shared money base, so these contributions add to the total return.">Contribution</SortHeader>
          <SortHeader col="basis" view={view} pad="px-4 py-2" title="Assumed held means no later sale or transfer appears in the records we have. This basis is also included in Excel exports.">Holding basis</SortHeader>
          <SortHeader col="sector" view={view} align="left" pad="px-4 py-2">Sector</SortHeader>
          <SortHeader col="entity" view={view} align="left" pad="px-4 py-2">Entities</SortHeader>
          {REVIEW_COLS.map(id => { const c = reviewColumn(id)!;
            return <SortHeader key={id} col={id} view={view} align={c.format === 'text' ? 'left' : 'right'} pad="px-4 py-2" note="30 Jun 2026 review" title={REVIEW_NOTE}>{c.label}</SortHeader>; })}
        </Tr></thead>
        <tbody className="divide-y divide-ink-700/60">{rows.map(r => <Fragment key={r.key}>
          <Tr view={view} className={r.children.length ? TREE_ROW.parent : ''} {...(r.children.length ? rowToggle(() => exp.toggle(r.key)) : {})}
            data-seg-row={r.key} data-seg-value={r.value} data-seg-gain={r.gain ?? ''} data-seg-contrib={r.contribution ?? ''} data-seg-open={exp.isOpen(r.key) ? '1' : '0'} data-seg-securities={fig(r).securities}>
            <TreeNameCell depth={0} title={r.label} open={r.children.length ? exp.isOpen(r.key) : undefined} onToggle={r.children.length ? () => exp.toggle(r.key) : undefined} toggleData={{ 'data-seg-toggle': r.key }} />
            {cells(r, 'parent')}
          </Tr>
          {exp.isOpen(r.key) && sortRows(r.children, view.sort, accessors).map((c, i, cs) => { const k = childKey(r, c), open = c.children.length > 0 && exp.isOpen(k);
            return <Fragment key={c.key}>
              <Tr view={view} className={TREE_ROW.child} data-seg-child={r.key} data-seg-child-key={c.key} data-seg-open={open ? '1' : '0'}
                data-seg-value={c.value} data-seg-gain={c.gain ?? ''} data-seg-whole={c.units.some(u => u.key === u.accountId) ? '1' : '0'}
                {...(c.children.length ? rowToggle(() => exp.toggle(k)) : {})}>
                <TreeNameCell depth={1} title={c.label} last={i === cs.length - 1} open={c.children.length ? open : undefined}
                  onToggle={c.children.length ? () => exp.toggle(k) : undefined} toggleData={{ 'data-seg-child-toggle': k }} />{cells(c, 'child')}
              </Tr>
              {open && sortRows(c.children, view.sort, accessors).map((h, j, hs) => <Tr key={h.key} view={view} className={TREE_ROW.child}
                data-seg-holding={h.key} data-seg-holding-of={k} data-seg-value={h.value} data-seg-gain={h.gain ?? ''}>
                <TreeNameCell depth={2} title={h.label} last={j === hs.length - 1} ancestorLast={i === cs.length - 1} />{cells(h, 'child')}
              </Tr>)}
            </Fragment>; })}
        </Fragment>)}</tbody>
        <tfoot className="border-t-2 border-ink-600"><TrFoot view={view} className={`${TREE_ROW.total} px-4 py-2.5 font-semibold`} data-seg-total
          label={<span className="text-slate-100">Total · available data<span data-attribution-total-coverage className="mt-1 block text-[11px] font-normal text-slate-400">{totalCaption}</span></span>}
          cells={totalByCol} />
        </tfoot>
      </ExportableTable></div>
    </Card>
  </div>;
}
