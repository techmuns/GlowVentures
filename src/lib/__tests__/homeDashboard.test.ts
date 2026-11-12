import assert from 'node:assert/strict';
import { currentHomeValues, historicalHomeValues, homeAssets, homeHistoryDates, homeRecordedFlows, validHomeDate } from '../homeDashboard';
import type { NavUnit } from '../bookNav';
import type { Account, Position } from '../types';
const accounts = [{ accountId: 'a', engagement: 'Direct', provider: 'Provider', accountNo: '1' }] as Account[];
const positions = [{ accountId: 'a', securityKey: 'equity', security: 'Equity', assetClass: 'Equity', marketValue: 80 },
  { accountId: 'a', securityKey: 'cash', security: 'Cash', assetClass: 'Cash', marketValue: 20 }] as Position[];
const unit = { key: 'a', accountId: 'a', securityKey: null, marks: [{ date: '2026-03-31', value: 100, source: 'statement' },
  { date: '2026-06-30', value: 140, source: 'statement' }], flows: [{ date: '2026-05-01', amount: 10 }, { date: '2026-06-01', amount: -5 }],
  origin: null, originDated: false, atCost: false, recordTo: '2026-06-30', steps: [], bookValue: 140 } as NavUnit;
assert.equal(validHomeDate('2026-02-29'), false);
assert.equal(validHomeDate('2024-02-29'), true);
assert.equal(validHomeDate('2026-13-01'), false);
assert.equal(validHomeDate('2026-1-01'), false);
const current = homeAssets(currentHomeValues(positions, accounts));
assert.equal(current.total, 100);
assert.equal(current.assets.reduce((n, a) => n + a.weight!, 0), 100);
assert.equal(homeAssets([]).total, null, 'no records is absent, never zero');
assert.equal(historicalHomeValues([unit], positions, accounts, '2026-03-01').length, 0, 'never borrow future valuations');
const historical = historicalHomeValues([unit], positions, accounts, '2026-05-31');
assert.equal(historical[0].value, 110, 'latest earlier mark plus recorded capital');
assert.equal(historical[0].key, 'Mixed mandates', 'never split an account history using current weights');
assert.equal(historical[0].date, '2026-03-31');
assert.equal(historicalHomeValues([unit], positions, accounts, '2026-06-30')[0].value, 140, 'new statement replaces carried mark');
assert.equal(homeRecordedFlows([unit], positions, accounts, '2026-05-01', '2026-06-01')[0].value, 5, 'opening close excluded; payout is positive');
assert.equal(homeRecordedFlows([unit], positions, accounts, '2026-04-30', '2026-06-30')[0].value, -5);
assert.deepEqual(homeRecordedFlows([unit], positions, accounts, '2026-07-01', '2026-08-01'), [], 'absent movements stay absent');
assert.deepEqual(homeHistoryDates([unit], '2026-03-31', '2026-07-12'), ['2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-12']);
assert.deepEqual(homeHistoryDates([unit], '2024-02-12', '2024-03-12'), ['2024-02-12', '2024-02-29', '2024-03-12']);
const negative = homeAssets(currentHomeValues([...positions, { ...positions[1], securityKey: 'payable', marketValue: -50 }], accounts));
assert.equal(negative.total, 50);
assert.equal(negative.positiveAssets, 100);
assert.equal(negative.chartable, false);
console.log('Home dashboard: historical cutoffs, whole-account classification, dated flows, absence and month-end samples passed.');
const { homeVolatility } = await import('../homeDashboard');
const { readHomeLayout, moveHomeWidget, DEFAULT_HOME_LAYOUT } = await import('../homeWidgets');
assert.equal(readHomeLayout({}), null);
assert.deepEqual(readHomeLayout([{ id: 'allocation', size: 'full' }, { id: 'allocation', size: 'half' }, { id: 'untrusted', size: 'full' }]), [{ id: 'allocation', size: 'full' }]);
assert.equal(readHomeLayout([{ id: 'aum', size: 'invalid' }])?.[0].size, 'full');
assert.deepEqual(readHomeLayout([]), [], 'an intentionally empty Home remains empty');
const { migrateHomeLayout } = await import('../homeWidgets');
assert.deepEqual(migrateHomeLayout(DEFAULT_HOME_LAYOUT), DEFAULT_HOME_LAYOUT, 'full saved dashboards retain their choices');
const simplified = DEFAULT_HOME_LAYOUT.filter(w => !['netWorth', 'assetsTotal', 'liabilities'].includes(w.id));
const migrated = migrateHomeLayout(simplified)!;
assert.equal(migrated[0].size, 'wide', 'a simplified AUM/cash row rebalances once');
assert.deepEqual(migrated.slice(1), simplified.slice(1), 'other widget choices, order and sizes survive');
assert.equal(simplified[0].size, 'full', 'migration never mutates the saved input');
assert.deepEqual(migrateHomeLayout([]), [], 'a deliberately empty saved view stays empty');
assert.deepEqual(readHomeLayout([{ id: 'aum', size: 'full' }, { id: 'cash', size: 'quarter' }]), [{ id: 'aum', size: 'full' }, { id: 'cash', size: 'quarter' }], 'current-version size choices are never remigrated');
assert.deepEqual(migrateHomeLayout([{ id: 'cash', size: 'quarter' }, { id: 'aum', size: 'half' }]), [{ id: 'cash', size: 'quarter' }, { id: 'aum', size: 'half' }], 'custom order and dimensions stay intact');
const moved = moveHomeWidget(DEFAULT_HOME_LAYOUT, 'aum', 3);
assert.equal(moved[3].id, 'aum');
assert.equal(moved.length, DEFAULT_HOME_LAYOUT.length);
assert.equal(DEFAULT_HOME_LAYOUT[0].id, 'aum', 'reordering preserves the previous layout');
const dates = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
const constant = { t: dates, v: dates.map(() => 100) };
assert.equal(homeVolatility(constant, dates[0], dates.at(-1)!)?.pct, 0, 'a constant published series has a measured zero volatility');
assert.equal(homeVolatility({ t: dates.slice(0, 20), v: Array(20).fill(100) }, dates[0], dates[19]), null, 'twenty returns require twenty-one closes');
assert.equal(homeVolatility(constant, '2025-01-01', dates.at(-1)!), null, 'insufficient opening coverage is not ranked');
const sparse = { t: dates.map((d, i) => i > 10 ? `2026-02-${String(i).padStart(2, '0')}` : d), v: dates.map(() => 100) };
assert.equal(homeVolatility(sparse, dates[0], sparse.t.at(-1)!), null, 'a long gap is not a daily return');
console.log('Widget layout validation, order preservation, empty layouts and daily-volatility coverage passed.');

const { homeExportNumber } = await import('../homeDashboard');
assert.equal(homeExportNumber(null)['data-export-value'], undefined);
assert.equal(homeExportNumber(12345678.901)['data-export-value'], '12345678.901');
assert.equal(homeExportNumber(0)['data-export-type'], 'number');

// Cash drill-down reconciles to Home, including balances below the usual holdings floor.
const { resolveDrilldown, parseDrilldown, drilldownHref } = await import('../drilldown');
const cashPositions = [
  ...positions,
  { ...positions[1], securityKey: 'small', marketValue: 5, dedupeGroup: 'small-cash' },
  { ...positions[1], securityKey: 'small-copy', marketValue: 5, dedupeGroup: 'small-cash' },
  { ...positions[1], securityKey: 'overdraft', marketValue: -2 },
  { ...positions[1], securityKey: 'zero', marketValue: 0 },
];
const cashScope = parseDrilldown(new URLSearchParams(drilldownHref('home-cash').split('?')[1]))!;
const cashDetail = resolveDrilldown(cashScope, { portfolio: { positions: cashPositions, accounts } as import('../types').Portfolio, consolidated: cashPositions });
assert.equal(cashDetail.rows.length, 3);
assert.equal(cashDetail.rows.reduce((n, p) => n + p.marketValue, 0), 23);
assert.equal(cashDetail.rows.reduce((n, p) => n + p.marketValue, 0), homeAssets(currentHomeValues(cashPositions, accounts)).assets.find(a => a.key === 'Cash')?.value);
assert.equal(cashDetail.negligibleExcluded.count, 0, 'small cash balances remain in the figure');
assert.equal(cashDetail.crumb, 'Total cash');
console.log('Home cash link reconciles every non-zero balance, deduplicates holdings and includes overdrafts.');
