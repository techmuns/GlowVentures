export const HOME_WIDGETS = [
  { id: 'aum', name: 'Investment AUM', category: 'Overview', description: 'The value of the selected investment book, with account and holding counts.', kind: 'number', size: 'full' },
  { id: 'netWorth', name: 'Total Net Worth', category: 'Overview', description: 'Total family assets less all liabilities, when a complete balance sheet is available.', kind: 'number', size: 'quarter' },
  { id: 'assetsTotal', name: 'Total Assets', category: 'Overview', description: 'Positive valued investment assets in the selected book.', kind: 'number', size: 'quarter' },
  { id: 'liabilities', name: 'Total Liabilities', category: 'Overview', description: 'The firm’s consolidated borrowing and liability position.', kind: 'number', size: 'quarter' },
  { id: 'cash', name: 'Total Cash', category: 'Overview', description: 'Separately valued cash in the investment book.', kind: 'number', size: 'quarter' },
  { id: 'performance', name: 'Portfolio Performance', category: 'Performance', description: 'Cumulative portfolio return against a selectable Indian benchmark, on the same dated capital.', kind: 'line', size: 'full' },
  { id: 'allocation', name: 'Asset Class Breakdown', category: 'Allocation', description: 'A donut chart showing the portfolio’s asset allocation, values and weights.', kind: 'donut', size: 'half' },
  { id: 'geography', name: 'Geographic Exposure', category: 'Allocation', description: 'Country and regional investment exposure, where verified allocations are recorded.', kind: 'donut', size: 'half' },
  { id: 'currency', name: 'Currency Exposure', category: 'Allocation', description: 'Underlying investment currency exposure. Display currency alone does not establish exposure.', kind: 'donut', size: 'half' },
  { id: 'history', name: 'Asset Class Progression Over Time', category: 'Allocation', description: 'The evolution of recorded investment values and allocation through the selected period.', kind: 'area', size: 'full' },
  { id: 'flows', name: 'Net & Projected Cash Flows', category: 'Cash flows', description: 'Recorded external cash movements by asset class, with one- and two-year projections when schedules exist.', kind: 'table', size: 'full' },
  { id: 'assets', name: 'Asset Table', category: 'Overview', description: 'Sortable asset values and weights, expandable into their underlying records.', kind: 'table', size: 'full' },
  { id: 'concentration', name: 'Issuer Concentration', category: 'Risk', description: 'The largest named issuer and fund exposures, joining share classes and duplicate identities.', kind: 'table', size: 'half' },
  { id: 'movements', name: 'Large Performance Movements', category: 'Performance', description: 'Measured holding returns beyond +10% or −10% over the selected period.', kind: 'table', size: 'half' },
  { id: 'monthly', name: 'Month by Month Discrete Performance', category: 'Performance', description: 'Separate monthly portfolio returns over the selected range, using available dated records.', kind: 'table', size: 'full' },
  { id: 'vintage', name: 'Performance by Vintage', category: 'Performance', description: 'Private-equity fund performance grouped by a verified fund vintage and fund-level IRR.', kind: 'bars', size: 'half' },
  { id: 'volatility', name: 'Top Securities by Volatility', category: 'Risk', description: 'The ten most volatile public investments, ranked by daily return volatility in the selected period.', kind: 'bars', size: 'half' },
  { id: 'sectors', name: 'Stock Sector Breakdown', category: 'Allocation', description: 'Your recorded company-share holdings grouped by their verified sectors.', kind: 'donut', size: 'half' },
] as const;
export type HomeWidgetId = typeof HOME_WIDGETS[number]['id'];
export type HomeWidgetSize = 'quarter' | 'half' | 'full';
export type HomeWidgetEntry = { id: HomeWidgetId; size: HomeWidgetSize };
export const DEFAULT_HOME_LAYOUT: HomeWidgetEntry[] = HOME_WIDGETS.filter(w => !['currency', 'concentration', 'movements', 'monthly', 'vintage', 'volatility', 'sectors'].includes(w.id)).map(w => ({ id: w.id, size: w.size }));
export const HOME_LAYOUT_KEY = 'glow:home:widgets:v1';
export function readHomeLayout(raw: unknown): HomeWidgetEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  return raw.flatMap(row => {
    if (!row || !HOME_WIDGETS.some(w => w.id === row.id) || seen.has(row.id)) return [];
    seen.add(row.id);
    return [{ id: row.id as HomeWidgetId, size: ['quarter', 'half', 'full'].includes(row.size) ? row.size as HomeWidgetSize : HOME_WIDGETS.find(w => w.id === row.id)!.size }];
  });
}
export function moveHomeWidget(layout: HomeWidgetEntry[], id: HomeWidgetId, target: number): HomeWidgetEntry[] {
  const index = layout.findIndex(w => w.id === id);
  if (index < 0 || target < 0 || target >= layout.length || target === index) return layout;
  const next = [...layout], [entry] = next.splice(index, 1); next.splice(target, 0, entry); return next;
}
