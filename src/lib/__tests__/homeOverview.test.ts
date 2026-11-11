import assert from 'node:assert/strict';
import { homeOverview } from '../homeOverview';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SUMMARY } from '../../data/glowData';
import { scopePortfolio } from '../memberScope';
import { UNCLASSIFIED } from '../familyTaxonomy';
import type { Account, Portfolio, Position } from '../types';

const account = { accountId: 'a', engagement: 'Direct' } as Account;
const holding = (o: Partial<Position> = {}) => ({ accountId: 'a', securityKey: 'sample', security: 'Sample', assetClass: 'Equity',
  quantity: 1, marketValue: 100, ...o }) as Position;
const duplicate = holding({ dedupeGroup: 'reported-twice' });
const result = homeOverview([duplicate, { ...duplicate, accountId: 'b' }, holding({ securityKey: 'cash', assetClass: 'Cash', marketValue: 50 }),
  holding({ securityKey: 'not-placed', assetClass: 'AIF', marketValue: 25 }), holding({ securityKey: 'nil', marketValue: 0 })], [account]);
assert.equal(result.total, 175, 'each duplicate group enters the AUM once');
assert.equal(result.allocation.reduce((sum, row) => sum + row.value, 0), result.total, 'every rupee is in an allocation');
assert.equal(result.allocation.find(row => row.key === 'Equity')?.value, 100);
assert.equal(result.allocation.find(row => row.key === 'Cash')?.value, 50);
assert.equal(result.allocation.find(row => row.key === UNCLASSIFIED)?.value, 25, 'unclassified holdings remain in AUM');
assert.ok(Math.abs(result.allocation.reduce((sum, row) => sum + (row.weight ?? 0), 0) - 100) < 1e-10);
assert.equal(result.chartable, true);
assert.equal(homeOverview([], []).chartable, false, 'an empty allocation is not a measured 0% chart');
const negative = homeOverview([holding(), holding({ securityKey: 'liability', assetClass: 'Cash', marketValue: -10 })], [account]);
assert.equal(negative.total, 90);
assert.equal(negative.chartable, false, 'negative classes are listed without a misleading positive pie slice');

const book = homeOverview(BOOK_POSITIONS, BOOK_ACCOUNTS);
assert.ok(Math.abs(book.total - BOOK_SUMMARY.totalValue) < 0.01, 'the real book ties to its canonical AUM');
const owner = BOOK_ACCOUNTS.find(a => a.ownerId && BOOK_POSITIONS.some(p => p.accountId === a.accountId && p.marketValue > 0))!.ownerId!;
const scoped = scopePortfolio({ accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, capitalGains: [], commitments: [] } as unknown as Portfolio, new Set([owner]));
const member = homeOverview(scoped.positions, scoped.accounts);
assert.ok(member.total > 0 && member.total < book.total, 'the selected member has their own AUM');
assert.ok(Math.abs(member.total - scoped.totalValue) < 0.01);
console.log('Home overview: canonical AUM, dedupe, full allocation, missing classification, negative values and member scope passed.');
