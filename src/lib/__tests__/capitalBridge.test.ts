import assert from 'node:assert/strict';
import { capitalBridge, type BridgeBook } from '../capitalBridge';
import { selectedSegmentReturns, type ReturnUnit } from '../selectedSegmentReturns';
import { accountInputs, periodStart, windowReturns, type AccountWindow } from '../periodReturns';
import { currentHoldings, dedupedPositions } from '../analytics';
import { exitedRows } from '../drilldown';
import { nothingToMeasure } from '../returns';
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_ACCOUNT_RETURN_RECORDS, BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNT_CASH_FLOWS, BOOK_NAV_COVERAGE,
  BOOK_UNDATED_CAPITAL, BOOK_CAPITAL_FROM_INCEPTION, BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES, BOOK_HOLDING_INCOME,
} from '../../data/glowData';
import type { Account, AccountBridge, CapitalMove, Portfolio, Position } from '../types';

const near = (a: number | null | undefined, b: number, tol = 1e-6) => assert.ok(a != null && Math.abs(a - b) < tol, `${a} != ${b}`);
const acct = (id: string, engagement: string) => ({ accountId: id, accountNo: id, provider: 'P', owner: 'O', engagement, asOf: '2026-09-30' } as Account);
const pos = (o: Partial<Position>) => ({ accountId: 'fund', securityKey: 's', security: 'S', assetClass: 'Mutual Fund', marketValue: 0, costBasis: 0, ...o } as Position);
const win = (o: Partial<AccountWindow>): AccountWindow => ({ accountId: 'x', label: 'X', owner: 'O', openDate: '2026-03-31', openValue: 100, openedInWindow: false,
  closeDate: '2026-09-30', closeValue: 120, flows: [], capitalIn: 0, capitalOut: 0, gain: 20, ...o });
const unit = (w: AccountWindow): ReturnUnit => ({ key: w.accountId, accountId: w.accountId, label: w.label, positions: [], gain: w.gain,
  invested: w.openValue + w.capitalIn, close: w.closeValue, from: w.openDate, to: w.closeDate, window: w });
const move = (o: Partial<CapitalMove>) => ({ accountId: 'fund', date: '2026-06-01', direction: 'in', label: 'Purchase', amount: 10, invested: 10, units: 1, security: 'S', securityKey: 's', ...o } as CapitalMove);
const bridgeRow = (o: Partial<AccountBridge>) => ({ reportType: 'performance-summary', source: 'doc', periodFrom: '2026-04-01', periodTo: '2026-09-30',
  basis: 'financial-year-to-date', opening: 100, contribution: null, withdrawal: null, netCapitalInOut: 0, realized: 5, unrealized: 16, income: 1,
  fees: 1.5, expenses: 0.5, closing: 120, profit: null, ties: true, ...o } as AccountBridge);
const book = (o: Partial<BridgeBook>): BridgeBook => ({ accounts: [], positions: [], bridges: {}, moves: [], income: {}, ...o });

// A statement's own P&L over exactly these dates splits the gain, and the parts make it.
{
  const w = win({ accountId: 'pms', label: 'PMS' });
  const b = capitalBridge([unit(w)], book({ accounts: [acct('pms', 'PMS')], bridges: { pms: [bridgeRow({})] } }))!;
  assert.equal(b.mode, 'window'); near(b.opening + b.added - b.takenOut + b.gain, b.closing);
  near(b.realised, 5); near(b.unrealised, 16); near(b.income, 1); near(b.charges, 2); near(b.unsplit, 0);
  assert.equal(b.rows[0].split!.source, 'statement');
  // ...but not a statement over other dates: the account is named, and its whole gain is "not split".
  const other = capitalBridge([unit(w)], book({ accounts: [acct('pms', 'PMS')], bridges: { pms: [bridgeRow({ periodTo: '2026-08-10' })] } }))!;
  assert.equal(other.realised, null); near(other.unsplit, 20); assert.equal(other.unsplitCount, 1);
  assert.match(other.rows[0].unsplitReason!, /2026-04-01 → 2026-08-10/);
  // ...nor one whose lines do not make this gain.
  const off = capitalBridge([unit(w)], book({ accounts: [acct('pms', 'PMS')], bridges: { pms: [bridgeRow({ unrealized: 26 })] } }))!;
  assert.equal(off.splitCount, 0);
  // Income accrued and not yet received sits outside a record that closes without it.
  const accrued = capitalBridge([unit(w)], book({ accounts: [acct('pms', 'PMS')], bridges: { pms: [bridgeRow({ accruedIncome: 3 })] } }))!;
  near(accrued.income, 1); near(accrued.realised! + accrued.unrealised! + accrued.income! - accrued.charges!, 20);
}

// A fund folio: no redemption in the period realises nothing; a scheme redeemed only inside it realises its FIFO gain.
{
  const w = win({ accountId: 'fund', label: 'Fund', closeValue: 0, capitalOut: 125, gain: 25, flows: [{ date: '2026-07-31', amount: 125 }] });
  const positions = [pos({ securityKey: 'a', realizedPnL: 24, costOfUnitsSold: 101 }), pos({ securityKey: 'old', realizedPnL: 7 })];
  const moves = [move({ securityKey: 'a', date: '2025-01-01' }), move({ securityKey: 'a', date: '2026-07-31', direction: 'out', label: 'Redemption' }),
    move({ securityKey: 'old', date: '2025-06-01', direction: 'out', label: 'Redemption' })];
  const b = capitalBridge([unit(w)], book({ accounts: [acct('fund', 'Direct')], positions, moves, income: { 'fund|a': [{ date: '2026-05-02', amount: 2 }, { date: '2025-05-02', amount: 9 }] } }))!;
  const s = b.rows[0].split!;
  // A fund's costs are inside its NAV: no separate charge, never a ₹0 beside the others.
  assert.equal(s.source, 'fund-record'); near(s.realised, 24); near(s.income, 2); near(s.unrealised, -1); assert.equal(s.charges, null);
  // A switch inside the period, a redemption also made before it, or an undated dividend leaves it unsplit.
  for (const extra of [{ moves: [...moves, move({ securityKey: 'a', date: '2026-06-01', label: 'Switch-In' })] },
    { moves: [...moves, move({ securityKey: 'a', date: '2025-03-01', direction: 'out', label: 'Redemption' })] },
    { moves, income: { 'fund|a': [{ date: null, amount: 1 }] } }]) {
    const x = capitalBridge([unit(w)], book({ accounts: [acct('fund', 'Direct')], positions, ...extra }))!;
    assert.equal(x.splitCount, 0); assert.ok(x.rows[0].unsplitReason);
  }
  // No redemption at all: the gain is the change in value of units held.
  const held = win({ accountId: 'fund', label: 'Fund' });
  const h = capitalBridge([unit(held)], book({ accounts: [acct('fund', 'Direct')], positions, moves: moves.slice(0, 1) }))!;
  near(h.realised, 0); near(h.unrealised, 20);
  // A PMS is never split from a fund record: its sales are inside the account, not in its flows.
  assert.equal(capitalBridge([unit(held)], book({ accounts: [acct('fund', 'PMS')], positions, moves: moves.slice(0, 1) }))!.splitCount, 0);
}

// Since investment on cost, the FIFO parts and the money that came back tie to the value.
{
  const u: ReturnUnit = { key: 'k', accountId: 'a', label: 'A', positions: [], gain: 30, invested: 150, close: 120, from: null, to: '2026-09-30',
    gainParts: { unrealised: 20, realised: 10, income: null } };
  const b = capitalBridge([u], book({}))!;
  assert.equal(b.mode, 'cost'); near(b.takenOut, 60); near(b.opening + b.added - b.takenOut + b.gain, b.closing);
  near(b.realised, 10); near(b.unrealised, 20); near(b.income, 0); assert.equal(b.charges, null); assert.equal(b.heldCost, null);
}

// The actual book: FYTD's bridge is the attribution total's own gain, and every part adds to it.
{
  const statement = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, accountReturnRecords: BOOK_ACCOUNT_RETURN_RECORDS, privateMarkets: {} } as unknown as Portfolio;
  const inputs = accountInputs({ accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, returnRecords: BOOK_ACCOUNT_RETURN_RECORDS, navHistory: BOOK_ACCOUNT_NAV_HISTORY,
    cashFlows: BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: BOOK_NAV_COVERAGE.covered, undated: BOOK_UNDATED_CAPITAL, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    labelOf: (a) => a.provider }).map((i) => ({ ...i, outside: nothingToMeasure(statement, BOOK_ACCOUNTS.find((a) => a.accountId === i.accountId)!) }));
  const recorded = dedupedPositions(BOOK_POSITIONS), current = currentHoldings(recorded), exited = exitedRows(recorded);
  const real: BridgeBook = { accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, bridges: BOOK_ACCOUNT_BRIDGES, moves: BOOK_CAPITAL_MOVES, income: BOOK_HOLDING_INCOME };
  const end = '2026-10-22';
  for (const [inception, type] of [[false, 'xirr'], [true, 'absolute'], [true, 'xirr']] as const) {
    const start = inception ? null : periodStart('fytd', end)!, w = inception ? null : windowReturns(inputs, start!, end);
    const a = selectedSegmentReturns(current, exited, BOOK_ACCOUNTS, 'category', { inception, type, start, end, windows: w?.included ?? [],
      inceptionRows: [], excluded: w?.excluded ?? [], outside: w?.outside }, () => null, current);
    const b = capitalBridge(a.total.units, real);
    if (!a.total.units.length) { assert.equal(b, null); continue; }
    near(b!.gain, a.total.gain!, 1e-3);
    near(b!.opening + b!.added - b!.takenOut + b!.gain, b!.closing, 1e-3);
    near((b!.realised ?? 0) + (b!.unrealised ?? 0) + (b!.income ?? 0) - (b!.charges ?? 0) + b!.unsplit, b!.gain, 1e-3);
    for (const r of b!.rows) assert.ok(r.split || r.unsplitReason, `${r.label} is split or names why not`);
    if (!inception) {
      assert.ok(b!.splitCount >= 10, `FYTD splits most accounts from their own records (${b!.splitCount})`);
      const carnelian = b!.rows.find((r) => r.accountId === 'carnelian-asset-management-and-advisors-pvt-ltd-3517383')!;
      assert.equal(carnelian.split?.source, 'statement'); near(carnelian.split!.realised, -1763423.42, 0.01);
      const threeP = b!.rows.find((r) => r.accountId === '3p-investment-managers-3000048')!;
      assert.equal(threeP.split?.source, 'fund-record'); near(threeP.split!.realised, 25582835.17, 0.01);
    }
  }
}
console.log('Capital bridge: statement and fund-record splits, ties to the total, the not-split remainder named, and the actual FYTD book passed.');
