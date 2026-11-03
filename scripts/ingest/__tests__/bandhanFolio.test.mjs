import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extract } from '../providers/bandhanFolio.mjs';
import { classify } from '../lib/classify.mjs';
import { custodySuccessor, verifyCustodyLinks } from '../../../shared/custodySuccessors.mjs';
import { securityKeyOf } from '../../../shared/securityKey.mjs';
import { keepsHolding } from '../lib/carryIdentity.mjs';

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
assert.equal(securityKeyOf('Bandhan Large & Mid Cap Fund-Direct Plan-Growth'),securityKeyOf('BNDH L&MCF DP GR'));
assert.equal(securityKeyOf('BANDHAN AMC LTD#BANDHAN MF-BANDHAN LARGE AND MID CAP FUND-DIRECT PL-GROWTH'),securityKeyOf('BNDH L&MCF DP GR'));
const beforeAlias={securityKey:'bandhan-amc-ltd-bandhan-mf-bandhan-large-and-mid-cap-fund-direct-pl-growth',isin:'INF194K01V89',quantity:2639320.472,marketValue:407339525.05};
const afterAlias={...beforeAlias,securityKey:'bndh-l-and-mcf-dp-gr'};
assert.equal(keepsHolding(beforeAlias,afterAlias),true);
for(const change of [{isin:'INF194K01Y60'},{isin:null},{quantity:1},{marketValue:1},{securityKey:'unreviewed-name'}]) {
  assert.equal(keepsHolding(beforeAlias,{...afterAlias,...change}),false);
}
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

// The 3 Nov uploads: ledgers carried over a page break, a ledger with no
// opening line, and a 2017 regular-plan folio redeemed to nil (no summary).
const archived = docKey => JSON.parse(fs.readFileSync(new URL(`../../../public/audit/${docKey}/pages.json`, import.meta.url))).pages;
const readDoc = (docKey, pages = archived(docKey)) => extract({ grid: { pages }, meta: { docKey } });
const october14 = readDoc('bandhan-mutual-fund-8652064-2026-10-14-holdings');
assert.equal(october14.status, 'ok', JSON.stringify(october14.warnings));
assert.equal(october14.holdings.length, 4);
assert.equal(october14.totals.totalMarketValue, 431304376.61);
assert.equal(october14.cashFlows.filter(f => f.kind === 'contribution' && f.isin === 'INF194K01V89').length, 12);
assert.equal(october14.cashFlows.filter(f => f.kind === 'reclassification' && f.isin === 'INF194K01Y60').length, 8);
// Without the reprinted heading recognised, a carried ledger has no closing.
const unjoined = readDoc('bandhan-mutual-fund-8652064-2026-10-14-holdings',
  archived('bandhan-mutual-fund-8652064-2026-10-14-holdings').map(p => ({ ...p, text: p.text.replaceAll('in INR in INR in INR Units Units', 'in INR') })));
assert.equal(unjoined.status, 'partial');
const ankita = readDoc('bandhan-mutual-fund-8691267-2026-09-30-holdings');
assert.equal(ankita.status, 'ok', JSON.stringify(ankita.warnings));
assert.deepEqual(ankita.holdings.map(h => [h.isin, h.quantity]), [['INF194K01V89', 24406.691], ['INF194K01I60', 0]]);
assert.equal(ankita.cashFlows.find(f => f.kind === 'opening-units' && f.isin === 'INF194K01I60').units, 0);
assert.equal(ankita.cashFlows.filter(f => f.kind === 'withdrawal').length, 3);
// A first row that does not create the balance is no evidence of a nil opening.
const notNil = readDoc('bandhan-mutual-fund-8691267-2026-09-30-holdings',
  archived('bandhan-mutual-fund-8691267-2026-09-30-holdings').map(p => ({ ...p, text: p.text.replace('7,029.319 7,029.319', '7,029.319 7,030.319') })));
assert.equal(notNil.status, 'partial');
const elssText = archived('unknown-1802619-2026-09-30-unknown');
assert.equal(classify({ fileName: 'statement.pdf', text: elssText.map(p => p.text).join('\n') }).provider, 'Bandhan Mutual Fund');
const elss = readDoc('bandhan-mutual-fund-1802619-2026-09-30-holdings', elssText);
assert.equal(elss.status, 'ok', JSON.stringify(elss.warnings));
assert.equal(elss.totals.totalMarketValue, 0);
assert.deepEqual(elss.holdings.map(h => [h.isin, h.quantity, h.printed.marketValue]), [['INF194K01292', 0, 0]]);
assert.deepEqual(elss.cashFlows.filter(f => f.kind === 'contribution').map(f => [f.date, f.amount, f.expenses]),
  [['2017-01-24', 100000, 100], ['2018-03-23', 105000, 100], ['2019-03-28', 105000, 100]]);
assert.equal(elss.cashFlows.find(f => f.kind === 'withdrawal').expenses, 6.15);
// A nil folio's zero total is only the ledgers' own: a unit left over breaks it.
const leftover = readDoc('bandhan-mutual-fund-1802619-2026-09-30-holdings', elssText.map(p => ({ ...p, text: p.text.replace('Current Unit Balance : 0.000', 'Current Unit Balance : 1.000') })));
assert.equal(leftover.status, 'partial');

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
