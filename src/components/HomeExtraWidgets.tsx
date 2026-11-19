import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import { ExportableTable } from '@/components/ExportableTable';
import { AbsentCell, AbsentSection } from '@/components/Absent';
import { concentrationNames } from '@/lib/concentration';
import { currentHoldings, dedupedPositions, marketSides } from '@/lib/analytics';
import { useReturnSelection, returnSelectionFor } from '@/lib/useReturnSelection';
import { selectedSegmentReturns, UNSPLIT_RETURNS } from '@/lib/selectedSegmentReturns';
import { exitedRows } from '@/lib/drilldown';
import { useMarketHistories } from '@/lib/useMarketReturns';
import { assumedHoldingBook } from '@/lib/assumedHoldingBook';
import { useStockExposure } from '@/lib/useStockExposure';
import { sectorSets, rollSectors } from '@/lib/sectorRollup';
import { accountIndex } from '@/lib/accounts';
import { CHART_COLORS, chartTooltipStyle } from '@/lib/chartTheme';
import { homeExportNumber, homeVolatility } from '@/lib/homeDashboard';
import { fmtDate } from '@/lib/format';
import { Hint, Metric } from '@/components/HomeMetric';
import { fmtPct } from '@/lib/format';
import { useAdjustedTwrColumns } from '@/lib/useAdjustedTwrColumns';
import type { AvailableCardReturn } from '@/lib/availableCardReturns';

const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
function ExtraPanel({ title, label, hint, right, children }: { title: string; label: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return <section className="home-panel"><div className="home-panel-heading"><div><span className="home-eyebrow">{label}</span><h2>{title}</h2></div>{(right || hint) && <div className="home-panel-tools">{right}{hint && <Hint text={hint} />}</div>}</div>{children}</section>;
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
    <div className="home-table-scroll home-widget-table-limit"><ExportableTable className="home-table"><thead><tr><th>Investment</th><th>Period return</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.label}</td><td {...homeExportNumber(row.periodPct == null ? null : row.periodPct / 100, '0.00%')} className={row.periodPct! < 0 ? 'home-negative' : 'home-positive'}>{pct(row.periodPct)}</td></tr>)}{!rows.length && <tr><td colSpan={2} className="home-empty">{measured.length ? 'No measured holding return beyond ±10%' : 'No holding-level return history for this period'}</td></tr>}</tbody></ExportableTable></div><div className="home-performance-foot"><span>{fmtDate(from)} – {fmtDate(to)}</span></div>
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
  return <ExtraPanel title="Month by month performance" label="DISCRETE RETURNS" hint="At most the latest 12 months inside the selected range. Each row independently measures that month's available records; monthly cohorts can differ and must not be compounded into a whole-book annual return. Hover a return for its dates and coverage.">
    <div className="home-table-scroll"><ExportableTable className="home-table"><thead><tr><th>Month</th><th>Return</th></tr></thead><tbody>{results.map(row => <tr key={row.month}><td>{new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td><td {...homeExportNumber(row.pct == null ? null : row.pct / 100, '0.00%')} className={row.pct != null && row.pct < 0 ? 'home-negative' : 'home-positive'} title={row.pct == null ? 'No usable dated return record in this month.' : [`${fmtDate(row.from)} – ${fmtDate(row.to)}`, `${row.records} ${row.records === 1 ? 'record' : 'records'}`, row.partial ? 'partial history' : '', row.held ? 'carried values' : ''].filter(Boolean).join(' · ')}>{pct(row.pct)}</td></tr>)}</tbody></ExportableTable></div>
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
/** Company shares by verified sector: Sector Composition's own rows, for the donut and the bar chart. */
function useSectorRows(historical: boolean) {
  const { consolidated, portfolio } = usePortfolio();
  const exposure = useStockExposure(consolidated, !historical);
  return useMemo(() => {
    if (!portfolio || historical) return [];
    const sets = sectorSets(consolidated, accountIndex(portfolio.accounts), exposure);
    return rollSectors(sets.consEntries.filter(e => e.positions.length), e => e.measured, true);
  }, [consolidated, portfolio, exposure, historical]);
}
const SECTOR_HINT = 'Recorded company shares across own and PMS accounts, using the same verified sector classification as Sector Composition. Fund look-through, debt, cash and non-equity securities are excluded. Weights are within this company-share sleeve.';
export function HomeSectors({ historical }: { historical: boolean }) {
  const { fmtFromBase } = usePortfolio();
  const rows = useSectorRows(historical);
  return <ExtraPanel title="Stock sector breakdown" label="COMPANY-SHARE EXPOSURE" hint={SECTOR_HINT}>
    {historical ? <AbsentSection what="Sector history unavailable" needs="Dated security-level holdings and sector classifications are required to split historical account NAV." /> : rows.length ? <><div className="home-sector-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="mv" nameKey="key" innerRadius="65%" outerRadius="90%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>{rows.map((row, i) => <Cell key={row.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => fmtFromBase(v, { compact: true })} wrapperStyle={{ maxWidth: '100%' }} contentStyle={{ ...chartTooltipStyle, fontSize: 14, whiteSpace: 'normal', overflowWrap: 'anywhere' }} /></PieChart></ResponsiveContainer></div><ul className="home-sector-legend">{rows.map((row, i) => <li key={row.key}><i className="home-swatch" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /><span>{row.key}</span><strong>{(row.weight * 100).toFixed(1)}%</strong></li>)}</ul></> : <AbsentSection what="No company-share sector data" needs="Valued company shares and verified sector classifications are required." />}
  </ExtraPanel>;
}

const shortLabel = (s: string) => s.length > 16 ? `${s.slice(0, 15)}…` : s;
/** The sector rows as columns, largest first; a long list scrolls inside its own card. */
export function HomeSectorBars({ historical }: { historical: boolean }) {
  const { fmtFromBase, displayCurrency } = usePortfolio();
  const rows = useSectorRows(historical);
  const data = useMemo(() => [...rows].sort((a, b) => b.mv - a.mv), [rows]);
  return <ExtraPanel title="Value by sector" label="COMPANY SHARES" hint={SECTOR_HINT} right={<span className="home-tag">{displayCurrency}</span>}>
    {historical ? <AbsentSection what="Sector history unavailable" needs="Dated security-level holdings and sector classifications are required to split historical account NAV." />
      : data.length ? <div className="home-sector-bars" data-home-sector-bars><div style={{ minWidth: Math.max(480, data.length * 46), height: '100%' }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
        <XAxis dataKey="key" interval={0} angle={-40} textAnchor="end" height={92} tickFormatter={shortLabel} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} />
        <YAxis tickFormatter={n => fmtFromBase(n, { compact: true })} width={84} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} />
        <Tooltip cursor={{ fill: 'var(--home-tint)' }} formatter={(v: number, _k, item) => [`${fmtFromBase(v, { compact: true })} · ${((item?.payload?.weight ?? 0) * 100).toFixed(1)}%`, 'Value']} wrapperStyle={{ maxWidth: '100%' }} contentStyle={{ ...chartTooltipStyle, fontSize: 14, whiteSpace: 'normal' }} />
        <Bar dataKey="mv" radius={[4, 4, 0, 0]} isAnimationActive={false}>{data.map((row, i) => <Cell key={row.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
      </BarChart></ResponsiveContainer></div></div>
      : <AbsentSection what="No company-share sector data" needs="Valued company shares and verified sector classifications are required." />}
  </ExtraPanel>;
}

/**
 * THIS CALENDAR YEAR'S GAIN, BROKEN DOWN: the records behind the Year to date
 * tile (Morning CIO's YTD card), grouped by member — each account's owner — or by
 * the family's asset class. Grouping never re-measures, so the bars add up to the
 * card's gain; a whole-account return spanning classes keeps a row of its own.
 */
export function HomeGainsBreakdown({ ytd, historical }: { ytd: AvailableCardReturn | null; historical: boolean }) {
  const { portfolio, statementPortfolio, consolidated, fmtFromBase } = usePortfolio();
  const [by, setBy] = useState<'member' | 'assetClass'>('member');
  const rows = useMemo(() => {
    const statement = statementPortfolio ?? portfolio;
    if (!ytd || !statement) return [];
    if (by === 'member') {
      const owner = new Map(statement.accounts.map(a => [a.accountId, a.owner || 'Not attributed to a member']));
      const sums = new Map<string, number>();
      for (const u of ytd.total.units) { const k = owner.get(u.accountId) ?? 'Not attributed to a member'; sums.set(k, (sums.get(k) ?? 0) + u.gain); }
      return [...sums].map(([key, gain]) => ({ key, label: key, gain }));
    }
    const recorded = dedupedPositions(statement.positions);
    const split = selectedSegmentReturns(currentHoldings(consolidated), exitedRows(recorded), statement.accounts, 'assetClass', ytd.selection, () => null, currentHoldings(recorded));
    return split.rows.flatMap(r => r.gain == null ? [] : [{ key: r.key, label: r.key === UNSPLIT_RETURNS ? 'Not split by class' : r.label, gain: r.gain }]);
  }, [ytd, by, statementPortfolio, portfolio, consolidated]);
  const sorted = [...rows].filter(r => Math.abs(r.gain) >= 0.5).sort((a, b) => b.gain - a.gain);
  const total = ytd?.total.gain ?? null;
  const lo = Math.min(0, ...sorted.map(r => r.gain)), hi = Math.max(0, ...sorted.map(r => r.gain)), span = hi - lo || 1, zero = -lo / span * 100;
  const c = ytd?.coverage;
  const hint = `This calendar year's gain: the same records as the Year to date tile and Morning CIO's YTD card, grouped by ${by === 'member' ? "each account's owner" : "the family's asset class; an account return whose holdings span classes keeps its own row"}. Grouping never re-measures, so the bars add up to the total.${c ? ` Covers ${c.measuredPublicHoldings + c.heldPublicHoldings + c.privateCoveredHoldings} of ${c.publicHoldings + c.privateHoldings} holdings${ytd?.to ? `, to ${fmtDate(ytd.to)}` : ''}.` : ''}`;
  const toggle = <div className="home-periods home-gains-toggle" role="group" aria-label="Group gains by">{(['member', 'assetClass'] as const).map(k => <button type="button" key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{k === 'member' ? 'Members' : 'Asset classes'}</button>)}</div>;
  return <ExtraPanel title="Gains breakdown · YTD" label="THIS CALENDAR YEAR" hint={hint} right={toggle}>
    {historical ? <AbsentSection what="Measured to the latest statements" needs="Choose today as the end date to see this year's gain." />
      : total == null || !sorted.length ? <AbsentSection what="No gain on record this year" needs="Dated valuations and capital movements this calendar year are needed." />
      : <div data-home-gains data-home-gains-total={total}><div className="home-gains-total"><span>Total gain</span><strong className={total < 0 ? 'home-negative' : 'home-positive'}>{fmtFromBase(total, { compact: true, sign: true })}</strong>{ytd?.total.returnPct != null && <small>{fmtPct(ytd.total.returnPct, { sign: true, decimals: 1 })}</small>}</div>
        <ul className="home-gain-bars">{sorted.map(r => <li key={r.key} data-home-gain-row={r.key} data-value={r.gain}><span className="home-gain-label" title={r.label}>{r.label}</span>
          <span className="home-gain-track" style={{ ['--zero' as string]: `${zero}%` }}><i className={r.gain < 0 ? 'home-gain-neg' : 'home-gain-pos'} style={{ left: `${r.gain < 0 ? zero - -r.gain / span * 100 : zero}%`, width: `${Math.abs(r.gain) / span * 100}%` }} /></span>
          <strong className={r.gain < 0 ? 'home-negative' : undefined}>{fmtFromBase(r.gain, { compact: true, sign: true })}</strong></li>)}</ul></div>}
  </ExtraPanel>;
}

/**
 * EQUITY TWR: the Returns table's Adjusted TWR (YTD, INR) on its Equity row, by
 * asset class — `useAdjustedTwrColumns` on the same inputs, ending on Home's end date.
 */
export function HomeEquityTwr({ to }: { to: string }) {
  const { statementPortfolio, consolidated } = usePortfolio();
  const current = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const recorded = useMemo(() => dedupedPositions(statementPortfolio?.positions ?? []), [statementPortfolio]);
  const exited = useMemo(() => exitedRows(recorded), [recorded]);
  const calculationCurrent = useMemo(() => currentHoldings(recorded), [recorded]);
  // Rows only: the TWR columns measure their own fixed horizons from these keys.
  const rowsOnly = useMemo(() => statementPortfolio ? selectedSegmentReturns(current, exited, statementPortfolio.accounts, 'assetClass',
    { inception: false, type: 'xirr', start: null, end: to, windows: [], inceptionRows: [], excluded: [] }, () => null, calculationCurrent) : null,
  [statementPortfolio, current, exited, calculationCurrent, to]);
  const { model, of, pending } = useAdjustedTwrColumns({ model: rowsOnly, current, exited, calculationCurrent, axis: 'assetClass', end: to });
  const row = model?.rows.find(r => r.key === 'Equity');
  const twr = row ? of(row).twrYtd : null;
  const gaps = twr?.gaps ?? [];
  const absentWhy = pending ? 'Price histories are still loading.' : twr?.gaps[0]?.reason ?? 'No dated equity valuations this calendar year.';
  const hint = twr?.pct == null ? absentWhy : twr ? [`Time-weighted return of the family's Equity asset class this calendar year, in INR, linked across every valuation and money movement: the same figure as the Equity row's Adjusted TWR (YTD, INR) in Morning CIO's Returns table by asset class. Not annualised.`,
    `${twr.records} records${twr.from && twr.to ? `, ${fmtDate(twr.from)} to ${fmtDate(twr.to)}` : ''}.${twr.assumed ? ' Includes assumed continued ownership.' : ''}`,
    gaps.length ? `Not included (${gaps.length}):\n${gaps.slice(0, 12).map(g => `${g.label}: ${g.reason}`).join('\n')}${gaps.length > 12 ? `\n…and ${gaps.length - 12} more` : ''}` : ''].filter(Boolean).join('\n\n') : undefined;
  return <Metric label="Equity TWR" hint={hint} attrs={{ 'data-home-equity-twr': twr?.pct ?? '' }}
    value={twr?.pct == null ? <AbsentCell reason={absentWhy} /> : <span className={twr.pct > 0 ? 'home-positive' : twr.pct < 0 ? 'home-negative' : undefined}>{fmtPct(twr.pct, { sign: true, decimals: 1 })}</span>}
    note={twr?.to ? `YTD · to ${fmtDate(twr.to)}` : 'YTD'}
    link={{ to: '/cio?tab=returns&rp=ytd&rtype=xirr&seg=assetClass', label: 'View returns' }} />;
}

/** One holding-level return record set for the selected range, by security. */
function useSecurityReturns(from: string, to: string) {
  const { portfolio, statementPortfolio } = usePortfolio();
  const { selection, current } = useReturnSelection({ period: 'custom', start: from, end: to, type: 'xirr' });
  return useMemo(() => {
    const statement = statementPortfolio ?? portfolio;
    if (!statement || !selection) return null;
    const recorded = dedupedPositions(statement.positions);
    return selectedSegmentReturns(current, exitedRows(recorded), statement.accounts, 'security', selection, () => null, currentHoldings(recorded));
  }, [portfolio, statementPortfolio, selection, current]);
}

/**
 * WHAT DROVE THE RETURN: each holding's rupee gain over the selected range, the
 * biggest five gainers and biggest five detractors. A gain adds up to the book's
 * total gain (the same records as Morning CIO), so this is CONTRIBUTION — not an
 * isolated return — and the Return column is the holding's own period return beside it.
 */
export function HomeContributors({ from, to }: { from: string; to: string }) {
  const { convertFromBase, fmtFromBase, displayCurrency } = usePortfolio();
  const result = useSecurityReturns(from, to);
  const measured = (result?.rows ?? []).filter(r => r.key !== UNSPLIT_RETURNS && r.gain != null && Math.abs(r.gain) >= 0.5);
  const byGain = [...measured].sort((a, b) => b.gain! - a.gain!);
  const rows = [...byGain.filter(r => r.gain! > 0).slice(0, 5), ...byGain.filter(r => r.gain! < 0).slice(-5).reverse()];
  const moneyCell = (n: number) => homeExportNumber(convertFromBase(n), displayCurrency === 'USD' ? '"$"#,##0.00' : '"₹"#,##0.00');
  return <ExtraPanel title="Top contributors & detractors" label="WHAT DROVE THE RETURN" hint="Each holding's rupee gain over the selected range — unrealised and realised results and recorded income over the capital it held — using the same available-record and assumed-ownership rules as Morning CIO. The five largest gainers and five largest detractors; a gain adds up to the book's total gain, so this is contribution, not an isolated return. Whole-account returns without a security split are excluded.">
    <div className="home-table-scroll home-widget-table-limit"><ExportableTable className="home-table"><thead><tr><th>Investment</th><th>Contribution</th><th>Return</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.key} data-home-contributor={r.key} data-value={r.gain!}><td>{r.label}</td><td {...moneyCell(r.gain!)} className={r.gain! < 0 ? 'home-negative' : 'home-positive'}>{fmtFromBase(r.gain!, { compact: true, sign: true })}</td><td {...homeExportNumber(r.periodPct == null ? null : r.periodPct / 100, '0.00%')} className={r.periodPct != null && r.periodPct < 0 ? 'home-negative' : undefined}>{pct(r.periodPct)}</td></tr>)}
      {!rows.length && <tr><td colSpan={3} className="home-empty">No measured holding gain in this period</td></tr>}
    </tbody></ExportableTable></div><div className="home-performance-foot"><span>{fmtDate(from)} – {fmtDate(to)}</span></div>
  </ExtraPanel>;
}

/** THE BREADTH OF THE PERIOD: how many holdings rose, how many fell, and the extremes. */
export function HomeWinners({ from, to }: { from: string; to: string }) {
  const result = useSecurityReturns(from, to);
  const measured = (result?.rows ?? []).filter(r => r.key !== UNSPLIT_RETURNS && r.periodPct != null);
  const up = measured.filter(r => r.periodPct! > 0), down = measured.filter(r => r.periodPct! < 0), flat = measured.filter(r => r.periodPct! === 0);
  const best = up.reduce<(typeof up)[number] | null>((a, b) => (!a || b.periodPct! > a.periodPct! ? b : a), null);
  const worst = down.reduce<(typeof down)[number] | null>((a, b) => (!a || b.periodPct! < a.periodPct! ? b : a), null);
  const sorted = measured.map(r => r.periodPct!).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const rows = measured.length ? [
    { k: 'up', label: 'Holdings up', value: String(up.length), cls: 'home-positive' },
    { k: 'down', label: 'Holdings down', value: String(down.length), cls: 'home-negative' },
    ...(flat.length ? [{ k: 'flat', label: 'Holdings unchanged', value: String(flat.length), cls: '' }] : []),
    { k: 'best', label: 'Best performer', value: best ? `${best.label} · ${pct(best.periodPct)}` : '—', cls: 'home-positive' },
    { k: 'worst', label: 'Worst performer', value: worst ? `${worst.label} · ${pct(worst.periodPct)}` : '—', cls: 'home-negative' },
    { k: 'median', label: 'Median return', value: median == null ? '—' : pct(median), cls: '' },
  ] : [];
  return <ExtraPanel title="Winners & losers" label="THE BREADTH OF THE PERIOD" hint="Every holding with a measured return in the selected range, counted by direction — the same available-record rules as Morning CIO. This is breadth, not size: a holding counts once however large, and the count is not weighted by value. Whole-account returns without a security split are excluded.">
    {!measured.length ? <AbsentSection what="No holding-level return history" needs="Opening and closing values and reconciled capital movements within this range are needed." />
    : <div className="home-table-scroll"><ExportableTable exportName="Home — winners & losers" className="home-table" data-home-winners data-home-up={up.length} data-home-down={down.length}><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>{rows.map(r => <tr key={r.k}><td>{r.label}</td><td className={r.cls}>{r.value}</td></tr>)}</tbody></ExportableTable></div>}
    <div className="home-performance-foot"><span>{fmtDate(from)} – {fmtDate(to)}</span></div>
  </ExtraPanel>;
}

/** A horizontal value-bar list, largest first, each with its share and an optional note. */
function BarList({ rows, money, total, probe, share = 'of the book' }: { rows: { key: string; label: string; value: number; color: string; why?: string }[]; money: (n: number) => string; total: number; probe: string; share?: string }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return <ul className="home-barlist" {...{ [`data-home-${probe}`]: '' }}>{rows.map(r => <li key={r.key} {...{ [`data-home-${probe}-row`]: r.key }} data-value={r.value}>
    <div className="home-barlist-head"><span><i className="home-swatch" style={{ background: r.color }} />{r.label}{r.why && <Hint text={r.why} />}</span><strong>{money(r.value)}</strong></div>
    <div className="home-barlist-track"><i style={{ width: `${r.value / max * 100}%`, background: r.color }} /></div>
    <small>{total > 0 ? `${(r.value / total * 100).toFixed(1)}% ${share}` : '—'}</small>
  </li>)}</ul>;
}

const SIDE_COLOR: Record<string, string> = { listed: '#378574', private: '#b29558', unplaced: '#8a8f9c' };
/** WHERE THE CAPITAL IS: the book split by listed markets against private capital. */
export function HomePublicPrivate({ historical }: { historical: boolean }) {
  const { portfolio, statementPortfolio, fmtFromBase, displayCurrency } = usePortfolio();
  const rows = useMemo(() => (historical || !portfolio) ? [] : marketSides((statementPortfolio ?? portfolio).positions), [portfolio, statementPortfolio, historical]);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return <ExtraPanel title="Public vs private markets" label="WHERE THE CAPITAL IS" right={<span className="home-tag">{displayCurrency}</span>} hint="The book's market investments split by where the money is invested — listed markets against private capital — placed as everywhere else in the dashboard from the SEBI category each statement prints, not by what kind of vehicle holds it. A Category III AIF is listed exposure; a private-equity or venture fund is private. The share is of these two sides together; cash, debt and real estate are not a listed-or-private question and sit outside the split. Latest available marks; a side with nothing in it is left out.">
    {historical ? <AbsentSection what="Historical split unavailable" needs="Dated security-level holdings are needed to split a historical whole-account value by market side." />
      : rows.length ? <BarList probe="side" share="of market investments" total={total} money={n => fmtFromBase(n, { compact: true })} rows={rows.map(r => ({ key: r.key, label: r.label, value: r.value, color: SIDE_COLOR[r.key] ?? '#8a8f9c', why: r.why }))} />
      : <AbsentSection what="No placed holdings" needs="Valued holdings with a recorded market side are required." />}
  </ExtraPanel>;
}

/** WHO RUNS THE MONEY: the investment book grouped by the platform or manager it is held with. */
export function HomeByManager({ historical }: { historical: boolean }) {
  const { portfolio, consolidated, fmtFromBase, displayCurrency } = usePortfolio();
  const rows = useMemo(() => {
    if (historical || !portfolio) return [];
    const providerOf = new Map(portfolio.accounts.map(a => [a.accountId, a.provider]));
    const sums = new Map<string, number>();
    for (const p of consolidated) { if (p.marketValue <= 0) continue; const prov = providerOf.get(p.accountId) ?? 'Unrecorded custodian'; sums.set(prov, (sums.get(prov) ?? 0) + p.marketValue); }
    return [...sums].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  }, [portfolio, consolidated, historical]);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const TOP = 8, rest = rows.slice(TOP), restSum = rest.reduce((s, r) => s + r.value, 0);
  const display = [...rows.slice(0, TOP).map(r => ({ key: r.key, label: r.key, value: r.value })), ...(restSum > 0 ? [{ key: '__rest', label: `${rest.length} more ${rest.length === 1 ? 'manager' : 'managers'}`, value: restSum }] : [])];
  return <ExtraPanel title="Value by manager" label="WHO RUNS THE MONEY" right={<span className="home-tag">{displayCurrency}</span>} hint="The investment book grouped by the platform or manager each account is held with — the custodian, PMS or AIF manager on the statement, never the owner. Latest available marks. A holding reported on two members' statements of the same mandate is counted once; the largest eight are shown and the rest pooled.">
    {historical ? <AbsentSection what="Historical split unavailable" needs="Dated account values are needed to split a historical book by manager." />
      : display.length ? <BarList probe="manager" total={total} money={n => fmtFromBase(n, { compact: true })} rows={display.map((r, i) => ({ key: r.key, label: r.label, value: r.value, color: r.key === '__rest' ? '#8a8f9c' : CHART_COLORS[i % CHART_COLORS.length] }))} />
      : <AbsentSection what="No valued holdings" needs="Valued holdings with a recorded provider are required." />}
  </ExtraPanel>;
}
