import assert from 'node:assert/strict';
import { lineHoldingFigures } from '../lineHoldingFigures';
import { accountInvestedOn, investedOnOf } from '../investedOn';
import { currentHoldings, dedupedPositions } from '../analytics';
import { accountIndex } from '../accounts';
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from '../../data/glowData';
import type { Position } from '../types';

const near = (a: number | null | undefined, b: number, tol = 1e-6) => assert.ok(a != null && Math.abs(a - b) < tol, `${a} != ${b}`);
const pos = (o: Partial<Position> = {}) => ({ accountId: 'a', securityKey: 'one', security: 'One', assetClass: 'Equity',
  quantity: 10, marketValue: 150, currentPrice: 15, costBasis: 100, ...o } as Position);

// One security across two accounts: units add, cost per unit is struck over the costed units, one mark.
const one = lineHoldingFigures([pos(), pos({ accountId: 'b', quantity: 30, marketValue: 450, costBasis: 360 })]);
assert.equal(one.securities, 1);
assert.equal(one.quantity, 40);
near(one.avgCost, 460 / 40);
assert.equal(one.price, 15);
near(one.cost.cost, 460); near(one.unrealised, 600 - 460);
assert.equal(one.quantityReason, null); assert.equal(one.avgCostReason, null);

// Two marks: no one price, named.
const split = lineHoldingFigures([pos(), pos({ accountId: 'b', currentPrice: 14 })]);
assert.equal(split.price, null); assert.match(split.priceReason!, /do not agree on a mark/);

// A line with no cost: the cost per unit is absent, never struck over the costed part's units alone.
const uncosted = lineHoldingFigures([pos(), pos({ accountId: 'b', costBasis: null, quantity: 30, marketValue: 450 })]);
near(uncosted.avgCost, 10); near(uncosted.cost.cost, 100); assert.equal(uncosted.cost.complete, false);

// Several securities: no unit count, cost per unit or price; money still adds.
const many = lineHoldingFigures([pos(), pos({ securityKey: 'two', security: 'Two', costBasis: 200, marketValue: 180 })]);
assert.equal(many.quantity, null); assert.equal(many.avgCost, null); assert.equal(many.price, null);
assert.match(many.avgCostReason!, /2 different securities/);
near(many.cost.cost, 300); near(many.unrealised, 30);

// Nothing reports a cost: absent, not ₹0.
const nil = lineHoldingFigures([pos({ costBasis: null })]);
assert.equal(nil.cost.cost, null); assert.ok(nil.costReason); assert.equal(nil.unrealised, null); assert.equal(nil.avgCost, null);

// The day's move: only live lines on the table's session.
const day = lineHoldingFigures([pos({ live: true, dayChange: 10, marketValue: 110 }), pos({ accountId: 'b', live: true, dayChange: 50, marketValue: 150 })],
  { inSession: p => p.accountId === 'a' });
near(day.day.pct, 10 / 100 * 100); assert.equal(day.day.left.length, 1);
const still = lineHoldingFigures([pos()]);
assert.equal(still.day.pct, null); assert.match(still.dayReason!, /no live quote|No holding here has a live quote/i);

// One unverified sale record is left out and named; it does not void the rest.
const sales = lineHoldingFigures([pos({ realizedPnL: 40 }), pos({ securityKey: 'two', security: 'Two', realizedPnL: 7, hprUnavailableReason: 'sale proceeds unverified' })]);
near(sales.realised, 40); assert.deepEqual(sales.realisedUnverified, ['Two']);
const unsold = lineHoldingFigures([pos({ securityKey: 'two', security: 'Two', realizedPnL: 7, hprUnavailableReason: 'sale proceeds unverified' })]);
assert.equal(unsold.realised, null); assert.match(unsold.realisedReason!, /sale proceeds unverified/);

// A line with no holdings of its own (an account's return without a holding split).
const empty = lineHoldingFigures([]);
assert.equal(empty.quantity, null); assert.equal(empty.realised, null); assert.ok(empty.costReason); assert.ok(empty.investedOnReason);

// THE BOOK: every money column adds to its total over any partition, and Invested on is the Monitor's.
const idx = accountIndex(BOOK_ACCOUNTS);
const current = currentHoldings(dedupedPositions(BOOK_POSITIONS));
const total = lineHoldingFigures(current);
for (const by of [(p: Position) => p.securityKey, (p: Position) => p.accountId, (p: Position) => p.assetClass]) {
  const groups = new Map<string, Position[]>();
  for (const p of current) groups.set(by(p), [...(groups.get(by(p)) ?? []), p]);
  const parts = [...groups.values()].map(ps => lineHoldingFigures(ps));
  const add = (k: (f: typeof total) => number | null) => parts.reduce((s, f) => s + (k(f) ?? 0), 0);
  near(add(f => f.cost.cost), total.cost.cost ?? 0, 0.5);
  near(add(f => f.unrealised), total.unrealised ?? 0, 0.5);
  near(add(f => f.realised), total.realised ?? 0, 0.5);
}
const dated = [...new Set(current.map(p => p.securityKey))].map(k => current.filter(p => p.securityKey === k)).filter(ps => investedOnOf(ps));
assert.ok(dated.length > 20, `${dated.length} dated securities`);
for (const ps of dated) assert.deepEqual(lineHoldingFigures(ps).investedOn, investedOnOf(ps));
// A whole PMS account is dated by its own money, never by the manager's purchases.
const pms = BOOK_ACCOUNTS.filter(a => a.engagement === 'PMS' && accountInvestedOn([a.accountId]) && current.some(p => p.accountId === a.accountId));
assert.ok(pms.length > 0);
for (const a of pms) {
  const f = lineHoldingFigures(current.filter(p => p.accountId === a.accountId), { wholeAccounts: [a.accountId] });
  assert.deepEqual(f.investedOn, accountInvestedOn([a.accountId]));
}
// A per-unit figure is never shown for a set of several securities.
const owners = lineHoldingFigures(current, { ownerOf: p => idx.get(p.accountId)?.owner ?? '' });
assert.equal(owners.avgCost, null); assert.ok(owners.owners.length > 3);
console.log(`line holding figures: ${dated.length} dated securities, ${pms.length} mandates dated by their accounts`);
