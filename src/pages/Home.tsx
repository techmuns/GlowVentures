import { Fragment, lazy, Suspense, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronRight, Globe2, Wallet } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import { PageHeader } from '@/components/PageHeader';
import { AbsentCell, AbsentSection } from '@/components/Absent';
import { valuationDates, valuationNote } from '@/components/BasisPill';
import { BOOK_NAV_UNITS } from '@/lib/bookNavBook';
import { HOME_CLASS_TILES, type HomeAxis, homeExportNumber, homeAssets, currentHomeValues, historicalHomeValues, homeHistoryDates, homeRecordedFlows, homeColor, homeClassLabel, validHomeDate } from '@/lib/homeDashboard';
import { useFamilyPlacements } from '@/lib/familyPlacements';
import { useReturnSelection } from '@/lib/useReturnSelection';
import { selectedSegmentReturns } from '@/lib/selectedSegmentReturns';
import { currentHoldings, dedupedPositions, allDebt } from '@/lib/analytics';
import { exitedRows, drilldownHref } from '@/lib/drilldown';
import { periodLine } from '@/lib/periodLine';
import { periodStart } from '@/lib/periodReturns';
import { BENCHMARKS, benchmarkIdentity, type BenchmarkKey } from '@/lib/benchmarks';
import { closeOnOrBefore, fetchPriceHistory, priceErrorReason, type PriceHistory } from '@/lib/prices';
import { chartTooltipStyle, chartTooltipItemStyle, chartTooltipLabelStyle } from '@/lib/chartTheme';
import { fmtDate, fmtPct } from '@/lib/format';
import { useHomeCardReturns } from '@/lib/useHomeCardReturns';
import { HomeWidgetActions, HomeWidgetBoard, useHomeWidgets } from '@/components/HomeWidgetBoard';
import { HomeViewBar } from '@/components/HomeViewBar';
import { useHomeViews } from '@/lib/homeViews';
import { HomeConcentration, HomeMovements, HomeMonthly, HomeVolatility, HomeSectors, HomeSectorBars, HomeGainsBreakdown, HomeEquityTwr, HomeUnavailable } from '@/components/HomeExtraWidgets';
import type { HomeWidgetId } from '@/lib/homeWidgets';
import { HomeReturnCoverage } from '@/components/HomeReturnCoverage';
import { Hint, Metric } from '@/components/HomeMetric';
import { ExportableTable } from '@/components/ExportableTable';
import './Home.css';

const PortfolioReportExport = lazy(() => import('./MorningCIO').then(m => ({ default: m.PortfolioReportExport })));

const NET_WORTH_GAP = 'A complete family balance sheet, including all assets and liabilities, is needed. Investment AUM excludes the ring-fenced Polycab holding and separately managed property records.';
const pct = (n: number | null | undefined) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const weightLabel = (n: number) => n > 0 && n < 0.1 ? '<0.1%' : `${n.toFixed(1)}%`;
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const nowInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function Panel({ title, label, right, children, className = '' }: { title: string; label?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`home-panel ${className}`}><div className="home-panel-heading"><div>{label && <span className="home-eyebrow">{label}</span>}<h2>{title}</h2></div>{right}</div>{children}</section>;
}

// Each rendered chart measures its own card, including the widget preview.
function ResponsiveHomeChart({ children }: { children: (narrow: boolean) => ReactElement }) {
  const [narrow, setNarrow] = useState(false);
  return <ResponsiveContainer width="100%" height="100%" onResize={width => setNarrow(width < 400)}>{children(narrow)}</ResponsiveContainer>;
}

export function Home() {
  const { portfolio, statementPortfolio, fmtFromBase, convertFromBase, scope, displayCurrency } = usePortfolio();
  const placements = useFamilyPlacements();
  const [params, setParams] = useSearchParams();
  const today = nowInIndia();
  const to = validHomeDate(params.get('homeTo')) && params.get('homeTo')! <= today ? params.get('homeTo')! : today;
  const fallbackFrom = periodStart('fytd', to)!;
  const from = validHomeDate(params.get('homeFrom')) && params.get('homeFrom')! < to ? params.get('homeFrom')! : fallbackFrom;
  const [draftFrom, setDraftFrom] = useState(from), [draftTo, setDraftTo] = useState(to), [dateError, setDateError] = useState('');
  useEffect(() => { setDraftFrom(from); setDraftTo(to); }, [from, to]);
  const views = useHomeViews();
  const widgetState = useHomeWidgets(views.active.layout, views.setActiveLayout);
  // Morning CIO's return cards, computed only while a return tile is on Home or in the library.
  const cards = useHomeCardReturns(widgetState.open || widgetState.layout.some(w => w.id === 'ytd' || w.id === 'inception' || w.id === 'gains'));
  const applyDates = (start: string, end: string) => {
    if (!validHomeDate(start) || !validHomeDate(end) || start >= end || end > today || start < '2000-01-01') { setDateError('Choose a start before the end, between 2000 and today.'); return; }
    const next = new URLSearchParams(params); next.set('homeFrom', start); next.set('homeTo', end); setParams(next, { replace: true }); setDateError('');
  };
  const units = useMemo(() => BOOK_NAV_UNITS.filter(u => !scope.accountIds || scope.accountIds.has(u.accountId)), [scope.accountIds]);
  const historical = to < today;
  const values = useMemo(() => !portfolio ? [] : historical
    ? historicalHomeValues(units, (statementPortfolio ?? portfolio).positions, portfolio.accounts, to)
    : currentHomeValues(portfolio.positions, portfolio.accounts), [portfolio, statementPortfolio, historical, units, to, placements]);
  const model = useMemo(() => homeAssets(values), [values]);
  // The same values, grouped by the family's baskets: the same total, a different split.
  const basketModel = useMemo(() => homeAssets(!portfolio ? [] : historical
    ? historicalHomeValues(units, (statementPortfolio ?? portfolio).positions, portfolio.accounts, to, 'basket')
    : currentHomeValues(portfolio.positions, portfolio.accounts, 'basket')), [portfolio, statementPortfolio, historical, units, to, placements]);
  const flows = useMemo(() => portfolio ? homeRecordedFlows(units, (statementPortfolio ?? portfolio).positions, portfolio.accounts, from, to) : [], [units, portfolio, statementPortfolio, from, to, placements]);
  const history = useMemo(() => {
    if (!portfolio) return [];
    return homeHistoryDates(units, from, to).map(date => {
      const snapshot = homeAssets(historicalHomeValues(units, (statementPortfolio ?? portfolio).positions, portfolio.accounts, date));
      return { date, ...Object.fromEntries(snapshot.assets.map(a => [a.key, a.value])), total: snapshot.total };
    });
  }, [units, portfolio, statementPortfolio, from, to, placements]);
  const historyKeys = useMemo(() => [...new Set(history.flatMap(row => Object.keys(row).filter(k => k !== 'date' && k !== 'total')))], [history]);
  const [sort, setSort] = useState<'value' | 'label'>('value'), [ascending, setAscending] = useState(false), [expanded, setExpanded] = useState<string[]>([]);
  const assets = useMemo(() => [...model.assets].sort((a, b) => (sort === 'value' ? a.value - b.value : a.label.localeCompare(b.label)) * (ascending ? 1 : -1)), [model.assets, sort, ascending]);
  const openableKeys = useMemo(() => new Set(currentHoldings(dedupedPositions(portfolio?.positions ?? [])).map(p => `${p.accountId}|${p.securityKey}`)), [portfolio]);
  if (!portfolio) return null;
  const money = (value: number | null | undefined) => value == null ? '—' : fmtFromBase(value, { compact: true });
  const moneyCell = (n: number | null) => homeExportNumber(n == null ? null : convertFromBase(n), displayCurrency === 'USD' ? '"$"#,##0.00' : '"₹"#,##0.00');
  const valuationHelp = valuationNote(valuationDates(portfolio), n => money(n));
  const knownNegative = values.filter(v => v.value < 0).reduce((s, row) => s - row.value, 0);
  const totalFlows = flows.length ? flows.reduce((s, f) => s + f.value, 0) : null;
  const sortBy = (key: 'value' | 'label') => { setSort(key); setAscending(sort === key ? !ascending : key === 'label'); };
  const setExpandedKey = (key: string) => setExpanded(expanded.includes(key) ? expanded.filter(k => k !== key) : [...expanded, key]);
  const liabilityGap = `The book does not carry a complete borrowing and liability register. Negative investment cash balances alone cannot establish total liabilities.${knownNegative > 0 ? ` The book carries ${money(knownNegative)} of negative balances.` : ''}`;
  // One tile per asset allocation row: the row's own figure, weight and holdings.
  const classTile = (t: typeof HOME_CLASS_TILES[number]) => {
    const row = historical ? null : model.assets.find(a => a.key === t.key) ?? null, noun = t.name.slice('Total '.length);
    const missing = historical ? `Historical account values do not split out all ${noun} ${t.key === 'Cash' ? 'balances' : 'holdings'}.`
      : t.key === 'Cash' ? 'No separately valued cash class is recorded in this selection.' : `No holdings in the family's ${homeClassLabel(t.key)} asset class are recorded in this selection.`;
    const hint = `${t.key === 'Debt' ? "The family's Debt asset class, shown as fixed income" : `The family's ${homeClassLabel(t.key)} asset class`}, at the latest available values: the same figure as its row in the asset allocation and the asset table.${t.key === 'Real Estate' ? ' Property records entered on the Real Estate page are kept outside Investment AUM and are not in this figure.' : ''}`;
    return <Metric label={t.name} hint={hint} attrs={{ 'data-home-class-total': t.key, 'data-value': row?.value ?? '' }}
      value={row == null ? <AbsentCell reason={missing} /> : money(row.value)}
      note={row?.weight != null ? `${weightLabel(row.weight)} of AUM` : undefined}
      link={row == null ? undefined : { to: t.key === 'Cash' ? drilldownHref('home-cash') : drilldownHref('home-class', t.key), label: 'View holdings', name: `View ${t.holdings.toLowerCase()}` }} />;
  };
  // Year to date and since inception: Morning CIO's own cards, measured to the latest statements.
  const returnTile = (id: 'ytd' | 'inception') => {
    const label = id === 'ytd' ? 'Year to date' : 'Since inception', r = cards ? (id === 'ytd' ? cards.ytd : cards.gain) : null;
    if (historical || !r) { const why = historical ? `Measured to the latest statements, not to ${fmtDate(to)}. Choose today as the end date to see it.` : 'Return records are still loading.';
      return <Metric label={label} hint={why} attrs={{ 'data-home-return-tile': id, 'data-value': '' }} value={<AbsentCell reason={why} />} />; }
    const value = r.total.returnPct, c = r.coverage, assumed = r.total.units.filter(u => u.assumption).length;
    const covered = `Covers ${c.measuredPublicHoldings + c.heldPublicHoldings + c.privateCoveredHoldings} of ${c.publicHoldings + c.privateHoldings} holdings${r.to ? `, to ${fmtDate(r.to)}` : ''}.${assumed ? ` ${assumed} use assumed continued ownership.` : ''}`;
    const hint = id === 'ytd'
      ? `This calendar year's return, the same figure as Morning CIO's YTD card. A holding with no value on 1 January is measured from its first dated value this year. Not annualised. ${covered}`
      : `Gain since investment over the capital deployed, the same figure as Morning CIO's consolidated return. Cumulative, not annualised. ${covered}`;
    return <Metric label={label} hint={hint} attrs={{ 'data-home-return-tile': id, 'data-value': value ?? '' }}
      value={value == null ? <AbsentCell reason="No dated return record covers this period yet." /> : <span className={value > 0 ? 'home-positive' : value < 0 ? 'home-negative' : undefined}>{fmtPct(value, { sign: true, decimals: 1 })}</span>}
      note={r.to ? `As of ${fmtDate(r.to)}` : undefined}
      link={{ to: `/cio?tab=returns&rp=${id}&rtype=${id === 'ytd' ? 'xirr' : 'absolute'}`, label: 'View returns' }} />;
  };
  const classTiles = Object.fromEntries(HOME_CLASS_TILES.map(t => [t.id, classTile(t)])) as Record<typeof HOME_CLASS_TILES[number]['id'], ReactNode>;
  const sourceNote = historical ? 'Latest recorded marks plus dated capital, through the selected end date. Accounts without an earlier mark are excluded. Historical account values stay mixed where no dated asset split exists.' : valuationHelp;
  const widgets: Record<HomeWidgetId, ReactNode> = {
    aum: (<section className="home-hero" data-home-aum={model.total ?? ''}>
      <div className="home-hero-main"><div className="home-hero-label"><span>{historical ? 'Recorded AUM' : 'Investment AUM'}</span><Hint text={sourceNote} /></div><div className="home-aum-value">{money(model.total)}</div><div className="home-hero-meta"><span className="home-status-dot" />{scope.label}{historical && <><span>·</span><span>As of {fmtDate(to)}</span></>}</div></div>
      <div className="home-hero-side"><span className="home-eyebrow">INVESTMENT BOOK</span><div><strong>{new Set(values.filter(v => v.value !== 0).map(v => v.accountId)).size}</strong> accounts <span className="home-hero-rule" /><strong>{historical ? values.filter(v => v.value !== 0).length : currentHoldings(dedupedPositions(portfolio.positions)).length}</strong> {historical ? 'valuation records' : 'holdings'}</div><Link to="/monitor">Explore portfolio <ArrowUpRight size={14} /></Link></div>
    </section>),
    netWorth: (<Metric label="Total net worth" hint={NET_WORTH_GAP} value={<AbsentCell reason={NET_WORTH_GAP} />} />),
    assetsTotal: (<Metric label="Total assets" value={money(model.positiveAssets)} hint="Positive valued investment positions in this book. This is not the family's complete household asset register." />),
    liabilities: (<Metric label="Total liabilities" hint={liabilityGap} value={<AbsentCell reason={liabilityGap} />} />),
    ...classTiles,
    ytd: returnTile('ytd'),
    inception: returnTile('inception'),
    performance: (<HomePerformance from={from} to={to} />),
    allocation: (<HomeAllocation model={model} money={money} displayCurrency={displayCurrency} canDrill={!historical} />),
    baskets: (<HomeAllocation model={basketModel} money={money} displayCurrency={displayCurrency} axis="basket" canDrill={!historical} />),
    geography: (<Panel title="Geographic exposure" label="INVESTMENT FOOTPRINT" className="home-geography-panel" right={<Hint text="The book contains India-focused accounts. A fund's registration, listing venue or currency does not establish where its underlying investments are located. Verified country allocations are not recorded." />}>
        <div className="home-geography" data-home-geography data-unclassified-value={model.total ?? ''}><div className="home-geography-heading"><span className="home-geography-icon"><Globe2 size={23} strokeWidth={1.25} /></span><div><strong>India-focused investment book</strong><span>Country split not recorded</span></div></div><div className="home-geography-coverage"><span>Not yet mapped</span><strong>{money(model.total)}</strong></div></div>
      </Panel>),
    history: (<Panel title="Allocation over time" label="HOW THE MIX EVOLVES" right={<Hint text="Monthly observations of the recorded NAV series. Marks are carried forward with dated capital; no prices are interpolated. Mixed mandates retain their whole-account value because today's weights cannot split historical NAV. Coverage grows as records arrive; level changes include capital and newly covered accounts, not just returns." />}>
      <div className="home-history-chart" data-home-history>{history.some(h => h.total != null) ? <ResponsiveHomeChart>{narrow => <AreaChart data={history} margin={{ top: 12, right: 8, bottom: 0, left: 8 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" /><XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={50} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 14 }} /><YAxis tickFormatter={n => money(n)} width={94} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 14 }} /><Tooltip labelFormatter={v => fmtDate(String(v))} formatter={(v: number, key: string) => [money(v), homeClassLabel(key)]} position={narrow ? { x: 0 } : undefined} wrapperStyle={{ maxWidth: '100%' }} contentStyle={{ ...chartTooltipStyle, fontSize: 14, whiteSpace: 'normal', overflowWrap: 'anywhere' }} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />{historyKeys.map(key => <Area key={key} dataKey={key} type="stepAfter" stackId="assets" stroke={homeColor(key)} strokeWidth={1.5} fill={homeColor(key)} fillOpacity={.2} isAnimationActive={false} connectNulls={false} />)}</AreaChart>}</ResponsiveHomeChart> : <AbsentSection what="No valuations in this period" needs="Dated valuation records on or before the selected end date are needed." />}</div>
      <div className="home-chart-legend">{historyKeys.map(key => <span key={key}><i className="home-swatch" style={{ background: homeColor(key) }} />{homeClassLabel(key)}</span>)}</div>
    </Panel>),
    flows: (<Panel title="Cash flows" label="CAPITAL IN MOTION" right={<span className="home-tag">{fmtDate(from)} – {fmtDate(to)}</span>}>
      <div className="home-flow-summary"><div><ArrowDownLeft size={17} /><span>Net cash flow</span><strong className={totalFlows != null && totalFlows < 0 ? 'home-negative' : ''}>{money(totalFlows)}</strong><Hint text="Positive: paid out to the family. Negative: invested. External investor flows recorded in the NAV ledger during the selected range. Internal mandate trades are excluded. This is the recorded subset; an absent flow history is not a measured zero. Projected cash flows require verified maturity and payment schedules." /></div></div>
      <div className="home-table-scroll"><ExportableTable exportName="Home — recorded cash flows" className="home-table"><thead><tr><th>Asset class</th><th>Net cash flow</th><th>1Y projected</th><th>2Y projected</th></tr></thead><tbody>{flows.map(f => <tr key={f.key}><td><span className="home-swatch" style={{ background: homeColor(f.key) }} />{homeClassLabel(f.key)}</td><td {...moneyCell(f.value)} className={f.value < 0 ? 'home-negative' : ''}>{money(f.value)}</td><td><AbsentCell reason="Verified maturity, recurring payment and principal repayment schedules are needed for a one-year forecast." /></td><td><AbsentCell reason="Verified maturity, recurring payment and principal repayment schedules are needed for a two-year forecast." /></td></tr>)}{!flows.length && <tr><td colSpan={4} className="home-empty">No cash flows in this period</td></tr>}</tbody>{flows.length > 0 && <tfoot><tr><td>Total</td><td {...moneyCell(totalFlows)}>{money(totalFlows)}</td><td><AbsentCell reason="Future payment schedules are not recorded." /></td><td><AbsentCell reason="Future payment schedules are not recorded." /></td></tr></tfoot>}</ExportableTable></div>
    </Panel>),
    assets: (<Panel title="Asset table" label="THE DETAILS" right={<span className="home-tag">{model.assets.length} classes</span>}>
      <div className="home-table-scroll"><ExportableTable exportName="Home — asset details" className="home-table" data-home-asset-table>{allRows => <><thead><tr><th aria-sort={sort === 'label' ? ascending ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => sortBy('label')}>Asset class <ChevronDown size={12} /></button></th><th aria-sort={sort === 'value' ? ascending ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => sortBy('value')}>Value ({displayCurrency}) <ChevronDown size={12} /></button></th><th>Weight</th><th>Composition</th></tr></thead><tbody>{assets.map(a => <Fragment key={a.key}><tr data-home-asset-row={a.key}><td><button type="button" className="home-expand" aria-expanded={expanded.includes(a.key)} onClick={() => setExpandedKey(a.key)}>{expanded.includes(a.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<i className="home-swatch" style={{ background: homeColor(a.key) }} />{a.label}</button></td><td {...moneyCell(a.value)}>{money(a.value)}</td><td {...homeExportNumber(a.weight == null ? null : a.weight / 100, '0.0%')}>{a.weight == null ? '—' : weightLabel(a.weight)}</td><td><div className="home-weight-bar"><span style={{ width: `${Math.max(0, Math.min(100, a.weight ?? 0))}%`, background: homeColor(a.key) }} /></div></td></tr>{(allRows || expanded.includes(a.key)) && [...a.rows].sort((x, y) => y.value - x.value).map((row, i) => <tr key={`${row.accountId}-${row.securityKey}-${i}`} className="home-detail-row"><td>{!historical && row.securityKey && openableKeys.has(`${row.accountId}|${row.securityKey}`) ? <Link to={`/stock/${encodeURIComponent(row.securityKey)}`}>{row.label} <ArrowUpRight size={11} /></Link> : row.label}<small>{portfolio.accounts.find(account => account.accountId === row.accountId)?.owner} · {row.date ? fmtDate(row.date) : 'Date unavailable'}</small></td><td {...moneyCell(row.value)}>{money(row.value)}</td><td colSpan={2} /></tr>)}</Fragment>)}</tbody><tfoot><tr><td>{historical ? 'Recorded total' : 'Total investment AUM'}</td><td {...moneyCell(model.total)}>{money(model.total)}</td><td>{model.total != null && model.total > 0 ? '100.0%' : '—'}</td><td /></tr></tfoot></>}</ExportableTable></div>
      {!historical && <Link className="home-footer-link" to={drilldownHref('book')}>View all holdings <ArrowUpRight size={13} /></Link>}
    </Panel>),
    currency: (<HomeUnavailable title="Currency exposure" category="UNDERLYING CURRENCIES" reason="Verified underlying currency exposures are not recorded. The base or display currency cannot be treated as investment exposure." />),
    concentration: (<HomeConcentration historical={historical} />),
    movements: (<HomeMovements from={from} to={to} />),
    monthly: (<HomeMonthly from={from} to={to} />),
    vintage: (<HomeUnavailable title="Performance by vintage" category="PRIVATE EQUITY" reason="Verified fund vintages and fund-level performance histories are not recorded. An account opening date does not establish a fund vintage." />),
    volatility: (<HomeVolatility from={from} to={to} />),
    sectors: (<HomeSectors historical={historical} />),
    sectorBars: (<HomeSectorBars historical={historical} />),
    gains: (<HomeGainsBreakdown ytd={cards?.ytd ?? null} historical={historical} />),
    equityTwr: (<HomeEquityTwr to={to} />),
  };
  return <div className="home-dashboard" data-home-overview data-home-total={model.total ?? ''}>
    <PageHeader title="Home" right={<div className="flex flex-wrap items-center gap-2"><Suspense fallback={null}><PortfolioReportExport /></Suspense><HomeWidgetActions state={widgetState} /></div>} />
    <HomeViewBar controller={views} />
    <div className="home-heading"><div><span className="home-eyebrow">YOUR WEALTH, AT A GLANCE</span><p className="home-intro">A clear view of the bigger picture.</p></div>
      <div className="home-date-toolbar"><div className="home-periods" role="group" aria-label="Home date presets">{(['mtd', 'ytd', 'fytd', 'y1'] as const).map((key, i) => <button type="button" key={key} aria-pressed={from === periodStart(key, to)} onClick={() => applyDates(periodStart(key, today)!, today)}>{['MTD', 'YTD', 'FYTD', '1Y'][i]}</button>)}</div>
        <form className="home-date-range" onSubmit={e => { e.preventDefault(); applyDates(draftFrom, draftTo); }}><CalendarDays size={14} aria-hidden /><label><span className="sr-only">Home start date</span><input type="date" min="2000-01-01" max={draftTo} value={draftFrom} onChange={e => setDraftFrom(e.target.value)} required /></label><span className="home-date-divider">—</span><label><span className="sr-only">Home end date</span><input type="date" min={draftFrom} max={today} value={draftTo} onChange={e => setDraftTo(e.target.value)} required /></label><button type="submit" aria-label="Apply Home dates" title="Apply dates"><Check size={15} /></button></form></div></div>
    {dateError && <p role="alert" className="home-date-error">{dateError}</p>}
    <HomeWidgetBoard state={widgetState} widgets={widgets} irrelevant={['netWorth', 'liabilities', 'geography', 'currency', 'vintage']} />
    <footer className="home-page-footer"><Wallet size={13} /><span>Investment book{historical ? ' · recorded history' : ' · latest available marks'} · {displayCurrency}</span><Hint text={sourceNote} /><Link to="/cio">Morning CIO <ArrowUpRight size={12} /></Link></footer>
  </div>;
}


// One donut for both of the family's own axes. Each keeps its own data handles, so a check summing
// the asset class rows never counts the basket rows as well.
const ALLOCATION_AXES = {
  assetClass: { title: 'Asset allocation', label: 'THE COMPOSITION', center: 'ALLOCATION', noun: 'asset classes', list: 'Asset class allocation', probe: 'allocation', row: 'data-home-class' },
  basket: { title: 'Basket allocation', label: 'BY BASKET', center: 'BASKETS', noun: 'baskets', list: 'Basket allocation', probe: 'basket', row: 'data-home-basket-row' },
} as const;
function HomeAllocation({ model, money, displayCurrency, axis = 'assetClass', canDrill = false }: { model: ReturnType<typeof homeAssets>; money: (value: number | null | undefined) => string; displayCurrency: string; axis?: HomeAxis; canDrill?: boolean }) {
  const navigate = useNavigate();
  const [active, setActive] = useState<string | null>(null);
  const selected = model.assets.find(a => a.key === active), copy = ALLOCATION_AXES[axis];
  // Click a row to open the holdings behind it — *"let it connect source, what is
  // source of equity"* (the family, 16 Nov). Only in the current view: a historical
  // mix collapses multi-class accounts to "Mixed mandates", which maps to no set.
  const hrefFor = (key: string): string | null =>
    !canDrill ? null : axis === 'basket' ? drilldownHref('basket', key) : key === 'Cash' ? drilldownHref('home-cash') : drilldownHref('home-class', key);
  return <Panel title={copy.title} label={copy.label} className="home-allocation-panel" right={<span className="home-tag">{displayCurrency}</span>}>
    <div className="home-allocation-layout"><div className="home-donut" {...{ [`data-home-${copy.probe}-chart`]: '' }}>{model.chartable ? <><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={model.assets} dataKey="value" nameKey="label" innerRadius="76%" outerRadius="94%" paddingAngle={2} stroke="none" isAnimationActive={false} onMouseEnter={(_, index) => setActive(model.assets[index]?.key ?? null)} onMouseLeave={() => setActive(null)}>{model.assets.map(a => <Cell key={a.key} fill={homeColor(a.key, axis)} fillOpacity={selected && a.key !== selected.key ? .3 : 1} />)}</Pie></PieChart></ResponsiveContainer><div className="home-donut-center" {...{ [`data-home-${copy.probe}-selection`]: selected?.key ?? '' }} aria-hidden="true"><span>{selected?.label ?? copy.center}</span><strong>{selected?.weight != null ? weightLabel(selected.weight) : model.assets.length}</strong><small>{selected ? money(selected.value) : copy.noun}</small></div></> : <AbsentSection what={`${copy.title} unavailable`} needs="Positive values and a non-negative breakdown are needed for a donut chart. Signed values remain in the asset table." />}</div>
    <ul className="home-allocation-legend" aria-label={copy.list} {...{ [`data-home-${copy.probe}`]: '' }}>{model.assets.map(a => <li key={a.key} {...{ [copy.row]: a.key }} data-value={a.value} data-weight={a.weight ?? ''}><button type="button" {...{ [`data-home-${copy.probe}-choice`]: a.key }} {...(hrefFor(a.key) ? { 'data-home-drill': '' } : {})} title={hrefFor(a.key) ? `View ${a.label} holdings` : undefined} aria-pressed={active === a.key} onMouseEnter={() => setActive(a.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(a.key)} onBlur={() => setActive(null)} onClick={() => { const href = hrefFor(a.key); if (href) navigate(href); else setActive(a.key); }}><span className="home-allocation-name"><i className="home-swatch" style={{ background: homeColor(a.key, axis) }} />{a.label}</span><small>{a.weight == null ? '—' : weightLabel(a.weight)}</small><strong>{money(a.value)}</strong></button></li>)}</ul></div>
  </Panel>;
}

function HomePerformance({ from, to }: { from: string; to: string }) {
  const { portfolio, statementPortfolio, fmtFromBase } = usePortfolio();
  const { selection, current, feed } = useReturnSelection({ period: 'custom', start: from, end: to, type: 'xirr' });
  const [params, setParams] = useSearchParams();
  const benchmark = BENCHMARKS.find(b => b.key === params.get('homeBenchmark')) ?? BENCHMARKS[0];
  const [load, setLoad] = useState<{ key: BenchmarkKey; history: PriceHistory | null; message: string }>({ key: benchmark.key, history: null, message: 'Loading benchmark…' });
  useEffect(() => { let alive = true; setLoad({ key: benchmark.key, history: null, message: 'Loading benchmark…' });
    void fetchPriceHistory(benchmark.symbol).then(result => { if (!alive) return; const identity = result.ok ? benchmarkIdentity(result, benchmark) : null;
      setLoad({ key: benchmark.key, history: result.ok && identity?.ok ? result : null, message: !result.ok ? priceErrorReason(result, true) : identity?.ok ? '' : 'The price service returned a different index. Comparison unavailable.' }); });
    return () => { alive = false; }; }, [benchmark]);
  const result = useMemo(() => {
    const statement = statementPortfolio ?? portfolio;
    if (!selection || !statement) return null;
    const recorded = dedupedPositions(statement.positions);
    return selectedSegmentReturns(current, exitedRows(recorded), statement.accounts, 'category', selection, () => null, currentHoldings(recorded));
  }, [selection, statementPortfolio, portfolio, current]);
  const chart = useMemo(() => {
    const windows = result?.total.units.flatMap(u => u.window ? [u.window] : []) ?? [];
    if (!windows.length) return { rows: [], book: null, benchmark: null };
    const debt = allDebt(result!.total.units.flatMap(u => u.positions));
    const history = load.key === benchmark.key ? load.history : null;
    const book = periodLine(windows, 'xirr', from, to, { debt });
    const index = history ? periodLine(windows, 'xirr', from, to, { debt, level: d => closeOnOrBefore(history, d)?.value ?? null }) : [];
    const byDate = new Map(index.map(p => [p.date, p.pct]));
    return { rows: book.map(p => ({ date: p.date, time: Date.parse(`${p.date}T00:00:00Z`), book: p.pct, benchmark: byDate.get(p.date) ?? null })), book: book.at(-1)?.pct ?? null, benchmark: index.at(-1)?.pct ?? null };
  }, [result, load, benchmark, from, to]);
  const missing = result?.total.missing.length ?? 0, held = result?.total.units.filter(u => u.held).length ?? 0, assumed = result?.total.units.filter(u => u.assumption).length ?? 0;
  const detail = [
    'The Morning CIO return engine, over the selected range. Each record starts from its first usable value in that range. The chart shows cumulative total return, not an annual rate. The benchmark invests the same dated money using the same method.',
    `${result?.total.units.length ?? 0} return records included; ${held} held at their last value; ${assumed} use assumed continued ownership; ${missing} records unavailable.`,
    `Included closing value: ${result?.total.units.length ? fmtFromBase(result.total.units.reduce((sum, u) => sum + u.close, 0)) : 'unavailable'}. Included gain: ${result?.total.gain == null ? 'unavailable' : fmtFromBase(result.total.gain)}.`,
    '\nIncluded records:',
    ...(result?.total.units.map(u => `${u.label} · ${u.from ?? 'Opening unavailable'} to ${u.to} · closing ${fmtFromBase(u.close)}${u.held ? ' · held at last value' : u.assumption ? ' · assumed continued ownership' : ''}`) ?? []),
    '\nUnavailable records:',
    ...(result?.total.missing.map(g => `${g.label}: ${g.reason}`) ?? []),
    ...(result?.total.units.filter(u => u.held).map(u => `${u.label}: held at ${u.held!.date}; ${u.held!.reason}`) ?? []),
  ].join('\n');
  const excess = chart.book != null && chart.benchmark != null ? chart.book - chart.benchmark : null;
  return <Panel title="Portfolio performance" label="GROWTH, IN PERSPECTIVE" right={<label className="home-benchmark-select"><span className="sr-only">Indian benchmark</span><select aria-label="Indian benchmark" value={benchmark.key} onChange={e => { const next = new URLSearchParams(params); next.set('homeBenchmark', e.target.value); setParams(next, { replace: true }); }}>{BENCHMARKS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}</select><ChevronDown size={13} /></label>}>
    <div className="home-performance-stats" data-home-performance><div><span><i className="home-swatch" style={{ background: '#378574' }} />Total return <HomeReturnCoverage text={detail} /></span><strong data-home-return={chart.book ?? ''}>{pct(chart.book)}</strong></div><div><span><i className="home-swatch" style={{ background: '#b29558' }} />{benchmark.label}<Hint text={benchmark.title} /></span><strong data-home-benchmark-return={chart.benchmark ?? ''}>{chart.benchmark == null ? <AbsentCell reason={load.message || 'The index has insufficient dated closes for the selected cash flows.'} /> : pct(chart.benchmark)}</strong></div><div className="home-excess"><span>Difference</span><strong className={excess != null && excess < 0 ? 'home-negative' : 'home-positive'}>{excess == null ? '—' : `${excess > 0 ? '+' : ''}${excess.toFixed(2)} pp`}</strong></div></div>
    <div className="home-performance-chart" data-home-performance-chart>{chart.rows.some(p => p.book != null) ? <ResponsiveHomeChart>{narrow => <LineChart data={chart.rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} /><XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} minTickGap={65} tickFormatter={n => dayLabel(new Date(n).toISOString().slice(0, 10))} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 14 }} /><YAxis tickFormatter={n => `${n}%`} tickLine={false} axisLine={false} width={60} tick={{ fill: 'var(--chart-axis)', fontSize: 14 }} /><ReferenceLine y={0} stroke="var(--chart-grid)" /><Tooltip labelFormatter={v => fmtDate(new Date(Number(v)).toISOString().slice(0, 10))} formatter={(v: number, key: string) => [pct(v), key === 'book' ? 'Portfolio' : benchmark.label]} position={narrow ? { x: 0 } : undefined} wrapperStyle={{ maxWidth: '100%' }} contentStyle={{ ...chartTooltipStyle, fontSize: 14, whiteSpace: 'normal', overflowWrap: 'anywhere' }} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} /><Line type="stepAfter" dataKey="book" stroke="#378574" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} /><Line type="stepAfter" dataKey="benchmark" stroke="#b29558" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} /></LineChart>}</ResponsiveHomeChart> : <AbsentSection what="No return history for this period" needs="Opening values, closing values and reconciled capital movements within this range are needed." />}</div>
    <div className="home-performance-foot"><span>{fmtDate(from)} – {fmtDate(to)} <HomeReturnCoverage text={detail} /></span>{feed.refreshing > 0 && <span>Updating…</span>}</div>
  </Panel>;
}
