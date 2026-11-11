import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { AbsentCell, AbsentSection, DASH } from '@/components/Absent';
import { dateSpan, valuationDates, valuationNote } from '@/components/BasisPill';
import { homeOverview } from '@/lib/homeOverview';
import { useFamilyPlacements } from '@/lib/familyPlacements';
import { drilldownHref } from '@/lib/drilldown';
import { chartTooltipStyle, chartTooltipItemStyle, chartTooltipLabelStyle } from '@/lib/chartTheme';
import { fmtNum } from '@/lib/format';

const COLORS: Record<string, string> = {
  Equity: '#55a58c', Debt: '#d28a3d', Alternate: '#855ce5',
  'Real Estate': '#5279e8', Cash: '#547c4b',
};
const colorOf = (key: string) => COLORS[key] ?? '#a4a2b4';

export function Home() {
  const navigate = useNavigate();
  const { portfolio, fmtFromBase, scope, displayCurrency } = usePortfolio();
  const placements = useFamilyPlacements();
  const model = useMemo(() => portfolio ? homeOverview(portfolio.positions, portfolio.accounts) : null, [portfolio, placements]);
  const dates = useMemo(() => portfolio ? valuationDates(portfolio) : null, [portfolio]);
  if (!portfolio || !model || !dates) return null;
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const span = dateSpan([...new Set([...dates.statement, ...dates.nav].map(d => d.date))].sort());
  const basis = `${dates.live.count ? 'Live quotes' : 'Valuations'}${span ? `${dates.live.count ? ' + marks' : ''} · ${span}` : ''}`;
  const valuationHelp = valuationNote(dates, money);
  return <div data-home-overview data-home-total={model.total}>
    <PageHeader title="Home" right={<span className="text-xs text-slate-400">{scope.label}</span>} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:grid-rows-[auto_1fr]" data-home-grid>
      <Card title="Asset Class" subtitle="Current value, grouped by the family's asset classes, as on Morning CIO. Each holding reported twice is counted once."
        className="min-w-0 lg:row-span-2">
        <div className="relative h-[340px] min-w-0" data-home-allocation-chart>
          {model.chartable ? <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie data={model.allocation} dataKey="value" nameKey="label" cx="50%" cy="50%"
                  innerRadius="62%" outerRadius="88%" paddingAngle={1.5} stroke="var(--chart-tooltip-bg)" strokeWidth={3} isAnimationActive={false}
                  onClick={(_, index) => { const row = model.allocation[index]; if (row.canOpen) navigate(drilldownHref('family-class', row.key)); }}>
                  {model.allocation.map(row => <Cell key={row.key} fill={colorOf(row.key)} style={{ cursor: row.canOpen ? 'pointer' : 'default' }} />)}
                </Pie>
                <Tooltip formatter={(value: number, label: string) => [money(value), label]}
                  contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden>
              <span className="text-3xl font-semibold tabular text-slate-100">{model.allocation.length}</span>
              <span className="mt-1 text-xs text-slate-400">Asset classes</span>
            </div>
          </> : <AbsentSection what="Asset mix unavailable" needs={model.total <= 0 ? 'A positive portfolio value is needed to draw allocation weights.' : 'A negative asset-class value cannot be represented by a donut chart. The amounts are listed below.'} />}
        </div>
        <ul className="mt-2 space-y-1" aria-label="Asset class allocation" data-home-allocation>
          {model.allocation.map(row => {
            const classes = "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]";
            const content = <>
              <span className="row-span-2 h-2.5 w-2.5 rounded-full sm:row-span-1" style={{ backgroundColor: colorOf(row.key) }} />
              <span className="min-w-0 break-words text-slate-300">{row.label}</span>
              <span className="col-start-2 row-start-2 min-w-0 break-words tabular text-slate-100 sm:col-start-3 sm:row-start-1 sm:text-right">{money(row.value)}</span>
              <span className="col-start-3 row-span-2 row-start-1 text-right tabular text-slate-400 sm:col-start-4 sm:row-span-1">{row.weight == null ? DASH : row.weight > 0 && row.weight < 0.1 ? '<0.1%' : `${row.weight.toFixed(1)}%`}</span>
            </>;
            return <li key={row.key} data-home-class={row.key} data-value={row.value} data-weight={row.weight ?? ''} data-can-open={row.canOpen}>
              {row.canOpen ? <Link to={drilldownHref('family-class', row.key)} className={`${classes} hover:bg-ink-700/40`} title={`Open the holdings in ${row.label}`}>{content}</Link>
                : <div className={classes} title="No current holdings to open. Recorded residual balances remain included in AUM.">{content}</div>}
            </li>;
          })}
        </ul>
      </Card>

      <Card title="AUM" subtitle={valuationHelp} className="min-w-0" right={<span className="label-xs">{displayCurrency}</span>}>
        <Link to={drilldownHref('book')} className="group flex min-w-0 items-start gap-3" title="Open all holdings included in AUM" data-home-aum-link>
          <span className="min-w-0 break-words font-display text-3xl font-semibold tracking-tight text-slate-100 xl:text-4xl tabular" data-home-aum={model.total}>
            <span className="sm:hidden" title={fmtFromBase(model.total)}>{money(model.total)}</span>
            <span className="hidden sm:inline">{fmtFromBase(model.total)}</span>
          </span>
          <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
        </Link>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400" data-home-coverage>
          <span>{fmtNum(model.holdings)} holdings</span><span>{fmtNum(model.accounts)} accounts</span>
        </div>
        <div className="mt-3 text-xs text-slate-500" title={valuationHelp} data-home-valuation-basis>{basis}</div>
      </Card>

      <Card title="Geography" subtitle="Verified country or regional allocations are not present in the investment records. A listing venue, currency or fund name does not establish geographic investment exposure."
        className="min-w-0" right={<Globe2 className="h-4 w-4 text-slate-500" aria-hidden />}>
        <div className="flex min-h-[220px] flex-col justify-center gap-5" data-home-geography data-unclassified-value={model.total}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-slate-300">Unclassified</span>
            <span className="tabular text-slate-100">{money(model.total)}</span>
          </div>
          <div className="h-8 overflow-hidden rounded-md bg-ink-800" role="img" aria-label={`${money(model.total)} has no verified geographic classification`}>
            <div className="h-full w-full rounded-md" style={{ backgroundColor: '#855ce5' }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Country breakdown</span>
            <AbsentCell reason="The investment records do not carry verified country or regional allocations." />
          </div>
        </div>
      </Card>
    </div>
  </div>;
}
