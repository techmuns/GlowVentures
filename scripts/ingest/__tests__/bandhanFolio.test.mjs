import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extract } from '../providers/bandhanFolio.mjs';
import { classify } from '../lib/classify.mjs';
import { custodySuccessor, verifyCustodyLinks } from '../../../shared/custodySuccessors.mjs';

const directory = new URL('../../../public/audit/bandhan-mutual-fund-8652064-2026-10-26-holdings/', import.meta.url);
const grid = JSON.parse(fs.readFileSync(new URL('pages.json', directory)));
const read = pages => extract({ grid: { pages }, meta: { docKey: 'bandhan-mutual-fund-8652064-2026-10-26-holdings' } });
const parsed = read(grid.pages);
assert.equal(parsed.status, 'ok', JSON.stringify(parsed.warnings));
assert.equal(parsed.owner, 'Ajay Jaisinghani');
assert.equal(parsed.accountNo, '8652064');
assert.equal(parsed.asOf, '2026-10-26');
assert.equal(parsed.holdings.length, 4);
const arbitrage = parsed.holdings.find(h => h.isin === 'INF194K01Y60');
assert.equal(arbitrage.quantity, 202573.963);
assert.equal(arbitrage.totalCost, 7574153.25); // summary's remaining cost, not cumulative purchases less redemption proceeds
assert.equal(arbitrage.priceAsOn, '2026-10-23');
assert.equal(arbitrage.custodyRematOn, '2026-10-07');
assert.ok(Math.abs(arbitrage.printed.marketValue - 7724469.33) < .01);
assert.equal(parsed.cashFlows.filter(f => f.kind === 'reclassification' && f.isin === arbitrage.isin).length, 5);
assert.equal(parsed.cashFlows.filter(f => f.kind === 'contribution').length, 2);
assert.equal(parsed.holdings.filter(h => h.quantity === 0).length, 2);
assert.equal(parsed.sections.holdings.rows.length, 5);
assert.equal(parsed.sections.holdings.rows.find(r => r[1] === arbitrage.isin)[6], 7724469.33);
assert.equal(classify({ fileName: 'statement.pdf', text: grid.pages.map(p => p.text).join('\n') }).asOfDate, '2026-10-26');
for (const [before, after] of [
  ['202,573.963', '202,574.963'], // a movement or closing loses a unit
  ['(664,271.746)', '(664,270.746)'],
  ['Switch Out - To Bandhan Large', 'Unknown Sale - To Bandhan Large'],
  ['(250.09)', '(1250.09)'],
  ['415,063,994.38', '415,063,995.38'],
]) {
  const broken = read(grid.pages.map(p => ({ ...p, text: p.text.replaceAll(before, after) })));
  assert.equal(broken.status, 'partial', before);
  assert.equal(broken.cashFlows.length, 0, before);
}

// A fixture isolates the boundary: same owner/ISIN is NOT continuity evidence.
const accounts = [
  { accountId: 'custody', ownerId: 'owner', asOf: '2026-07-31' },
  { accountId: 'folio', ownerId: 'owner', asOf: '2026-10-26' },
];
const old = { accountId: 'custody', isin: 'INF194K01Y60', periodTo: '2026-07-31' };
const position = { accountId: 'folio', isin: old.isin, quantity: 200, statementRecord: { document: 'new', pointer: '/holdings/0' } };
assert.equal(custodySuccessor(old, accounts, [position]), null);
const link = { custodyAccountId: 'custody', fundAccountId: 'folio', ownerId: 'owner', isin: old.isin, document: 'proof', rematOn: '2026-10-07' };
const proof = { docKey: 'proof', ownerId: 'owner', status: 'ok', asOf: '2026-10-26', holdings: [{ isin: old.isin, custodyRematOn: link.rematOn }] };
verifyCustodyLinks([position], accounts, [proof], [link]);
assert.equal(custodySuccessor(old, accounts, [position]), position);
assert.equal(custodySuccessor(old, accounts, [{ ...position, quantity: 0 }])?.quantity, 0);
for (const altered of [
  { ...position, isin: 'INF194K01V89' }, // another scheme/plan
  { ...position, accountId: 'unlinked-folio' },
  { ...position, quantity: null },
  { ...position, custodyEvidence: undefined },
]) assert.equal(custodySuccessor(old, accounts, [altered]), null);
assert.equal(custodySuccessor({ ...old, periodTo: '2026-10-26' }, accounts, [position]), null);
assert.equal(custodySuccessor({ ...old, periodTo: '2026-10-27' }, accounts, [position]), null);
assert.equal(custodySuccessor({ ...old, periodTo: '2026-10-08' }, accounts, [position]), null); // a later custody purchase is separate
assert.equal(custodySuccessor(old, accounts.map(a => a.accountId === 'folio' ? { ...a, ownerId: 'trust' } : a), [position]), null);
assert.equal(custodySuccessor(old, accounts, [position, { ...position }]), null);
assert.throws(() => verifyCustodyLinks([position], accounts, [{ ...proof, holdings: [] }], [link]), /not verified/);
assert.throws(() => verifyCustodyLinks([position], accounts, [{ ...proof, status: 'partial' }], [link]), /not verified/);
console.log('Bandhan ingestion and custody succession checks passed');
