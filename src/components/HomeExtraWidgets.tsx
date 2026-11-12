import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Globe2, Info } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import { ExportableTable } from '@/components/ExportableTable';
import { AbsentSection } from '@/components/Absent';
import { concentrationNames } from '@/lib/concentration';
import { currentHoldings, dedupedPositions } from '@/lib/analytics';
import { useReturnSelection, returnSelectionFor } from '@/lib/useReturnSelection';
import { selectedSegmentReturns } from '@/lib/selectedSegmentReturns';
import { exitedRows } from '@/lib/drilldown';
import { useMarketHistories } from '@/lib/useMarketReturns';
import { assumedHoldingBook } from '@/lib/assumedHoldingBook';
import { useStockExposure } from '@/lib/useStockExposure';
import { sectorSets, rollSectors } from '@/lib/sectorRollup';
import { accountIndex } from '@/lib/accounts';
import { CHART_COLORS, chartTooltipStyle } from '@/lib/chartTheme';
import { homeExportNumber, homeVolatility } from '@/lib/homeDashboard';
import { fmtDate } from '@/lib/format';

const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
function ExtraPanel({ title, label, hint, children }: { title: string; label: string; hint?: string; children: ReactNode }) {
  return <section className="home-panel"><div className="home-panel-heading"><div><span className="home-eyebrow">{label}</span><h2>{title}</h2></div>{hint && <span className="home-hint" tabIndex={0} title={hint} aria-label={hint}><Info size={13} /></span>}</div>{children}</section>;
}
export function HomeUnavailable({ title, category, reason }: { title: string; category: string; reason: string }) {
  return <ExtraPanel title={title} label={category}><div className="home-unavailable-widget" tabIndex={0} title="Not relevant for firm"><Globe2 size={36} strokeWidth={.8} /><span>—</span><small className="sr-only">{reason}</small><span className="home-relevance-tooltip">Not relevant for firm</span></div></ExtraPanel>;
}
export function HomeConcentration({ historical }: { historical: boolean }) {
  const { consolidated, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const rows = useMemo(() => concentrationNames(currentHoldings(consolidated)), [consolidated]);
  const total = consolidated.reduce((s, p) => s + p.marketValue, 0);
  return <ExtraPanel title="Issuer concentration" label="WHERE EXPOSURE SITS" hint="Named holdings and funds, joining shared ISINs and fund unit classes. This is investment concentration, without look-through into the issuers held inside funds. Values use the selected end date; a whole-account historical NAV cannot establish an issuer split.">
    {historical ? <AbsentSection what="Issuer history unavailable" needs="Dated issuer-level holdings are needed to split historical whole-account values." /> : <div className="home-table-scroll home-widget-table-limit"><ExportableTable className="home-table"><thead><tr><th>Issuer / fund</th><th>Value</th><th>Weight</th></tr></thead><tbody>{rows.slice(0, 10).map(row => <tr key={row.key}><td><Link to={row.clubbedFund ? `/fund/${encodeURIComponent(row.clubbedFund)}` : `/stock/${encodeURIComponent(row.leadKey)}`}>{row.label} <ArrowUpRight size={10} /></Link></td><td {...homeExportNumber(convertFromBase(row.value), displayCurrency === 'USD' ? '"$"#,##0.00' : '"₹"#,##0.00')}>{fmtFromBase(row.value, { compact: true })}</td><td {...homeExportNumber(total > 0 ? row.value / total : null, '0.0%')}>{total > 0 ? `${(row.value / total * 100).toFixed(1)}%` : '—'}</td></tr>)}</tbody></ExportableTable></div>}
  </ExtraPanel>;
}
export function HomeMovements({ from, to }: { from: string; to: string }) {
  const { portfolio, statementPortfolio } = usePortfolio();
  const { selection, current } = useReturnSelection({ period: 'custom', start: from, end: to, type: 'xirr' });
  const result = useMemo(() => {
    const statement = statementPortfolio ?? portfolio;
    return statement && selection ? selectedSegmentReturns(current, exitedRows(dedupedPositions(statement.positions)), statement.accounts, 'security', selection, () => null, currentHoldings(dedupedPositions(statement.positions))) : null;
  }, [portfolio, statementPortfolio, selection, current]);
  const measured = result?.rows.filter(row => row.periodPct != null) ?? [];
  const rows = measured.filter(row => Math.abs(row.periodPct!) > 10).sort((a, b) => Math.abs(b.periodPct!) - Math.abs(a.periodPct!));
  return <ExtraPanel title="Large performance movements" label="BEYOND ±10%" hint="Cumulative holding returns in the selected range, using the same available-record and assumed-ownership rules as Morning CIO. Whole-account returns without a security split are excluded. A fund's own return includes its realised results and income when recorded.">
    <div className="home-table-scroll home-widget-table-limit"><ExportableTable className="home-table"><thead><tr><th>Investment</th><th>Period return</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.label}</td><td {...homeExportNumber(row.periodPct == null ? null : row.periodPct / 100, '0.00%')} className={row.periodPct! < 0 ? 'home-negative' : 'home-positive'}>{pct(row.periodPct)}</td></tr>)}{!rows.length && <tr><td colSpan={2} className="home-empty">{measured.length ? 'No measured holding return beyond ±10%' : 'No holding-level return history for this period'}</td></tr>}</tbody></ExportableTable></div><div className="home-performance-foot"><span>{measured.length} available investment returns</span><span>{fmtDate(from)} – {fmtDate(to)}</span></div>
  </ExtraPanel>;
}
export function HomeMonthly({ from, to }: { from: string; to: string }) {
  const { portfolio, statementPortfolio, consolidated, corporateActions } = usePortfolio();
  const current = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const feed = useMarketHistories(current);
  const assumptions = useMemo(() => assumedHoldingBook({ actions: corporateActions, instruments: feed.instruments, histories: feed.histories }), [corporateActions, feed.instruments, feed.histories]);
  const months = useMemo(() => {
    const end = new Date(`${to}T00:00:00Z`), start = new Date(`${from}T00:00:00Z`);
    const earliest = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    if (cursor < earliest) cursor = earliest;
    const rows: { from: string; to: string; month: string }[] = [];
    for (; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
      const open = new Date(cursor.getTime() - 86400000).toISOString().slice(0, 10);
      const close = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      const a = open > from ? open : from, b = close < to ? close : to;
      if (a < b) rows.push({ from: a, to: b, month: cursor.toISOString().slice(0, 7) });
    }
    return rows;
  }, [from, to]);
  const results = useMemo(() => {
    const statement = statementPortfolio ?? portfolio;
    if (!statement) return [];
    const recorded = dedupedPositions(statement.positions);
    return months.map(month => {
      const selection = returnSelectionFor({ period: 'custom', start: month.from, end: month.to, type: 'xirr', statement, current, assumptions });
      const result = selection ? selectedSegmentReturns(current, exitedRows(recorded), statement.accounts, 'category', selection, () => null, currentHoldings(recorded)).total : null;
      const partial = result?.units.some(u => !u.held && u.from && u.from > month.from && !u.window?.openedInWindow);
      return { ...month, pct: result?.periodPct ?? null, records: result?.units.length ?? 0, held: result?.units.filter(u => u.held).length ?? 0, partial };
    });
  }, [months, current, portfolio, statementPortfolio, assumptions]);
  return <ExtraPanel title="Month by month performance" label="DISCRETE RETURNS" hint="At most the latest 12 months inside the selected range. Each row independently measures that month's available records; monthly cohorts can differ and must not be compounded into a whole-book annual return. Partial history and carried values are labelled.">
    <div className="home-table-scroll"><ExportableTable className="home-table"><thead><tr><th>Month</th><th>Return</th><th>Records</th><th>Basis</th></tr></thead><tbody>{results.map(row => <tr key={row.month}><td>{new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td><td {...homeExportNumber(row.pct == null ? null : row.pct / 100, '0.00%')} className={row.pct != null && row.pct < 0 ? 'home-negative' : 'home-positive'} title={row.pct == null ? 'No usable dated return record in this month.' : `${fmtDate(row.from)} – ${fmtDate(row.to)}`}>{pct(row.pct)}</td><td {...homeExportNumber(row.records, '0')}>{row.records}</td><td>{row.partial ? 'Partial history' : 'Available data'}{row.held ? ' · carried values' : ''}</td></tr>)}</tbody></ExportableTable></div>
  </ExtraPanel>;
}
export function HomeVolatility({ from, to }: { from: string; to: string }) {
  const { consolidated } = usePortfolio();
  const current = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const feed = useMarketHistories(current);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return current.flatMap(p => {
      const instrument = feed.instruments.get(p.securityKey), h = instrument && feed.histories[instrument.key];
      if (!instrument || seen.has(instrument.key) || !h?.ok) return [];
      seen.add(instrument.key);
      const result = homeVolatility(h, from, to);
      return result ? [{ key: p.securityKey, label: p.security, ...result }] : [];
    }).sort((a, b) => b.pct - a.pct).slice(0, 10);
  }, [current, feed.instruments, feed.histories, from, to]);
  return <ExtraPanel title="Top securities by volatility" label="DAILY PRICE VARIATION" hint="Sample standard deviation of published daily percentage returns, not annualised. At least 20 returns and history near both selected boundaries are required. Long gaps are refused. Published total-return-adjusted closes or fund NAVs are used; missing histories are excluded, never treated as zero volatility.">
    <div className="home-table-scroll home-widget-table-limit"><ExportableTable className="home-table"><thead><tr><th>Investment</th><th>Daily volatility</th><th>Observations</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td><Link to={`/stock/${encodeURIComponent(row.key)}`}>{row.label}</Link></td><td {...homeExportNumber(row.pct / 100, '0.00%')}>{row.pct.toFixed(2)}%</td><td {...homeExportNumber(row.observations, '0')} title={`${fmtDate(row.from)} – ${fmtDate(row.to)}`}>{row.observations}</td></tr>)}{!rows.length && <tr><td colSpan={3} className="home-empty">At least 20 daily returns are needed</td></tr>}</tbody></ExportableTable></div>
  </ExtraPanel>;
}
export function HomeSectors({ historical }: { historical: boolean }) {
  const { consolidated, portfolio, fmtFromBase } = usePortfolio();
  const exposure = useStockExposure(consolidated, !historical);
  const rows = useMemo(() => {
    if (!portfolio || historical) return [];
    const sets = sectorSets(consolidated, accountIndex(portfolio.accounts), exposure);
    return rollSectors(sets.consEntries.filter(e => e.positions.length), e => e.measured, true);
  }, [consolidated, portfolio, exposure, historical]);
  return <ExtraPanel title="Stock sector breakdown" label="COMPANY-SHARE EXPOSURE" hint="Recorded company shares across own and PMS accounts, using the same verified sector classification as Sector Composition. Fund look-through, debt, cash and non-equity securities are excluded. Weights are within this company-share sleeve.">
    {historical ? <AbsentSection what="Sector history unavailable" needs="Dated security-level holdings and sector classifications are required to split historical account NAV." /> : rows.length ? <><div className="home-sector-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="mv" nameKey="key" innerRadius="65%" outerRadius="90%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>{rows.map((row, i) => <Cell key={row.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => fmtFromBase(v, { compact: true })} wrapperStyle={{ maxWidth: '100%' }} contentStyle={{ ...chartTooltipStyle, fontSize: 14, whiteSpace: 'normal', overflowWrap: 'anywhere' }} /></PieChart></ResponsiveContainer></div><ul className="home-sector-legend">{rows.map((row, i) => <li key={row.key}><i className="home-swatch" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /><span>{row.key}</span><strong>{(row.weight * 100).toFixed(1)}%</strong></li>)}</ul></> : <AbsentSection what="No company-share sector data" needs="Valued company shares and verified sector classifications are required." />}
  </ExtraPanel>;
}
