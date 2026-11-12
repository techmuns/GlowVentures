import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildFinancialIntegrity, financialRegistry, validateOwnershipGraph } from '../lib/financial-integrity.mjs';
import { ownershipExposure, reconcileSettlements } from '../lib/financial-settlement.mjs';
import { financialUnitIssue } from '../lib/financial-units.mjs';
import { weightedCapital, reconciledWeightedCapital } from '../../../shared/flowTiming.mjs';
const position = { accountId: 'account-a', securityKey: 'integrity-fixture-fund', security: 'Integrity fixture fund', isin: 'INF000000001', quantity: 10, marketValue: 120, costBasis: 100, currentPrice: 12, unrealizedPnL: 20, returnPct: 20 };
const account = { accountId: 'account-a', accountNo: 'A', ownerId: 'owner-a', owner: 'Fixture owner', asOf: '2026-11-01' };
const book = (ps = [position]) => ({ BOOK_AS_OF: '2026-11-01', BOOK_POSITIONS: ps, BOOK_ACCOUNTS: [account], BOOK_OWNERS: [], BOOK_COMMITMENTS: [], BOOK_HOLDING_TRADES: {}, BOOK_HOLDING_INCOME: {}, BOOK_CAPITAL_MOVES: [] });
test('unit checks identify foreign currency and scale declarations without rechecking an explicit normalized adapter', () => {
  assert.equal(financialUnitIssue({}, 'A US company holds the shares'), null);
  assert.ok(financialUnitIssue({}, 'All amounts in USD'));
  for (const currency of ['SGD', 'AED', 'JPY', 'CAD', 'AUD']) {
    assert.ok(financialUnitIssue({}, `All amounts in ${currency}`));
    assert.ok(financialUnitIssue({}, `Currency: ${currency}`));
  }
  assert.equal(financialUnitIssue({}, 'All amounts in INR'), null);
  assert.equal(financialUnitIssue({}, 'Currency: INR'), null);
  for (const declaration of ['Figures in crore', 'Amounts are expressed in INR lakhs', 'Values are in Rs. lakhs', 'All figures in ₹ crores', 'INR in millions', 'Amount (Rs. in Lakhs)', 'Currency: INR lakhs', '₹ crores', 'Figures (in crores)', 'All amounts (Rs. in lakh)']) assert.ok(financialUnitIssue({}, declaration), declaration);
  assert.equal(financialUnitIssue({}, 'The company raised 100 crore.\nAmounts in INR'), null);
  assert.ok(financialUnitIssue({ currency: 'USD' }));
  assert.ok(financialUnitIssue({ financialUnits: { canonicalMultiplier: 100000 } }));
  assert.equal(financialUnitIssue({ financialUnits: { canonicalCurrency: 'INR', canonicalMultiplier: 1 } }), null);
  assert.equal(financialUnitIssue({ financialUnits: { sourceCurrency: 'USD', canonicalCurrency: 'INR', canonicalMultiplier: 1 } }, 'Amounts in USD'), null, 'an established normalization adapter is not downgraded by the source header');
});
test('ownership identities survive renaming and refuse a contradictory identifier', () => {
  const a = financialRegistry([position], { instruments: [] });
  const b = financialRegistry([{ ...position, securityKey: 'renamed-fixture-fund' }], a.registry);
  assert.equal(a.byKey.get(position.securityKey).id, b.byKey.get('renamed-fixture-fund').id);
  assert.equal(financialRegistry([{ ...position, isin: 'INF000000002' }], a.registry).issues[0].code, 'SECURITY_IDENTIFIER_CONFLICT');
});
test('a complete book version carries source dates, units, exact cash and missing facts', () => {
  const b = book([{ ...position, costBasis: null }]);
  b.BOOK_HOLDING_TRADES = { 'account-a|integrity-fixture-fund': [{ date: '2026-01-01', side: 'buy', amount: 100, quantity: 10 }] };
  const f = buildFinancialIntegrity(b, [], { registry: { instruments: [] } });
  assert.equal(f.metrics.find(m => m.metric === 'costBasis').value, null);
  assert.equal(f.metrics.find(m => m.metric === 'unrealizedPnL').value, position.unrealizedPnL, 'an audit preserves the established result even when its cost witness is absent');
  assert.equal(f.metrics.find(m => m.metric === 'quantity').currency, null);
  assert.equal(f.events[0].postings.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n), 0n);
  assert.equal(f.events[0].amountMinor, '-10000');
  assert.equal(f.checks.find(c => c.kind === 'bank-trade-settlement').status, 'unavailable');
});
test('capital audit reports contradictory and partial balances without manufacturing missing facts', () => {
  const b = book(); b.BOOK_COMMITMENTS = [{ accountId: account.accountId, committed: 100, called: 10, paid: 5000 }];
  assert.ok(buildFinancialIntegrity(b, []).issues.some(i => i.code === 'CAPITAL_DOES_NOT_RECONCILE'));
  b.BOOK_COMMITMENTS = [{ accountId: account.accountId, committed: 100, called: null, paid: 50 }];
  const partial = buildFinancialIntegrity(b, []);
  assert.deepEqual(partial.issues, []);
  assert.equal(partial.checks.find(c => c.kind === 'capital').status, 'unavailable');
  b.BOOK_COMMITMENTS = [{ accountId: account.accountId, committed: 100, called: 50, paid: 40, undrawn: 50, pending: 10 }];
  assert.equal(buildFinancialIntegrity(b, []).checks.find(c => c.kind === 'capital').status, 'reconciled');
});
test('review expiry is recorded using the publication day as advisory information', () => {
  const entries = JSON.parse(readFileSync(new URL('../../../config/reconciliation-exceptions.json', import.meta.url))).entries;
  const key = entries.find(e => e.section === 'rowSumChecks').finding.docKey;
  const document = JSON.parse(readFileSync(new URL(`../../../public/audit/${key}/document.json`, import.meta.url)));
  const valid = buildFinancialIntegrity(book([]), [document], { evaluationDate: '2026-11-11' });
  assert.ok(valid.reconciliationReviews.length > 0); assert.deepEqual(valid.issues, []);
  const expired = buildFinancialIntegrity(book([]), [document], { evaluationDate: '2026-12-12' });
  assert.ok(expired.issues.some(i => i.code === 'RECONCILIATION_REVIEW_REQUIRED'));
  assert.ok(expired.reconciliationReviews.every(r => r.status === 'needs-review'));
  const changed = structuredClone(document); changed.holdings[0].quantity += 1;
  assert.ok(buildFinancialIntegrity(book([]), [changed], { evaluationDate: '2026-11-11' }).issues.some(i => i.code === 'RECONCILIATION_REVIEW_REQUIRED'), 'altered source evidence cannot silently erase its review requirement');
});
test('ownership paths multiply fractions and reject cycles or overlapping ownership above 100%', () => {
  const nodes = [{ id: 'root', kind: 'owner' }, { id: 'trust', kind: 'owner' }, { id: 'position', kind: 'position' }];
  const edges = [{ id: 'a', owner: 'root', owned: 'trust', relationship: 'owns', fraction: .5 }, { id: 'b', owner: 'trust', owned: 'position', relationship: 'owns', fraction: .4 }];
  assert.deepEqual(validateOwnershipGraph(nodes, edges), []);
  assert.equal(ownershipExposure({ nodes, edges }, [{ positionId: 'position', metric: 'marketValue', value: 100, status: 'source-backed' }], 'root', '2026-11-01').value, 20);
  assert.ok(validateOwnershipGraph(nodes, [...edges, { id: 'c', owner: 'trust', owned: 'root', relationship: 'owns', fraction: 1 }]).some(i => i.code === 'OWNERSHIP_CYCLE'));
  assert.ok(validateOwnershipGraph(nodes, [...edges, { id: 'd', owner: 'root', owned: 'position', relationship: 'owns', fraction: .8 }]).some(i => i.code === 'OWNERSHIP_EXCEEDS_WHOLE'));
  const historical = [{ ...edges[0], from: '2025-01-01', to: '2026-01-01', fraction: 1 }, { ...edges[0], id: 'later', from: '2026-01-01', fraction: 1 }];
  assert.deepEqual(validateOwnershipGraph(nodes, historical), []);
});
test('bank settlement requires exact unique references, ownership and paise, not coincidentally equal cash', () => {
  const events = [{ id: 'e', kind: 'trade', accountId: account.accountId, date: '2026-11-01', reference: 'SETTLEMENT-1', amountMinor: '-10000' }];
  const bank = { docKey: 'bank', provider: 'Fixture bank', accountNo: 'B', ownerId: account.ownerId, cashFlows: [{ kind: 'bank-statement', date: '2026-11-01', reference: 'SETTLEMENT-1', debit: 100, credit: null }] };
  const mappings = [{ accountId: account.accountId, bankProvider: bank.provider, bankAccountNo: bank.accountNo, evidence: { document: bank.docKey, pointer: '/accountNo' } }];
  assert.equal(reconcileSettlements(events, [bank], [account], mappings)[0].status, 'reconciled');
  assert.equal(reconcileSettlements(events, [{ ...bank, cashFlows: [{ ...bank.cashFlows[0], reference: 'OTHER' }] }], [account], mappings)[0].status, 'unavailable');
  assert.equal(reconcileSettlements(events, [{ ...bank, cashFlows: [{ ...bank.cashFlows[0], debit: 100.01 }] }], [account], mappings)[0].status, 'disputed');
  assert.equal(reconcileSettlements(events, [{ ...bank, ownerId: 'another' }], [account], mappings)[0].status, 'disputed');
});
test('day weights use actual dates, signed withdrawals, valid calendar days and end-of-day convention', () => {
  assert.equal(weightedCapital([{ date: '2026-01-11', amount: 300 }], '2026-01-01', '2026-01-31'), 200);
  assert.equal(weightedCapital([{ date: '2026-01-31', amount: 300 }], '2026-01-01', '2026-01-31'), 0);
  assert.equal(weightedCapital([{ date: '2026-01-11', amount: -300 }], '2026-01-01', '2026-01-31'), -200);
  assert.equal(weightedCapital([{ date: '2026-02-31', amount: 300 }], '2026-02-01', '2026-03-01'), null);
  assert.equal(reconciledWeightedCapital([{ date: '2026-01-11', amount: 300 }], '2026-01-01', '2026-01-31', 0), null, 'unchanged units cannot put unmatched cash only in the denominator');
  assert.equal(reconciledWeightedCapital([{ date: '2026-01-11', amount: 300 }], '2026-01-01', '2026-01-31', 300), 200);
  assert.equal(reconciledWeightedCapital([], '2026-01-01', '2026-01-31', 0), 0);
});

test('financial report API selects one immutable version and fails closed on unavailable or HTML assets', async () => {
  const { onRequestGet } = await import('../../../functions/api/financial-integrity.js');
  const request = part => new Request(`https://fixture.example/api/financial-integrity?part=${part}`);
  assert.equal((await onRequestGet({ request: request('unknown'), env: {} })).status, 400);
  assert.equal((await onRequestGet({ request: request('metrics'), env: {} })).status, 503);
  const paths = [];
  const env = { ASSETS: { fetch: async url => { paths.push(url.pathname); return url.pathname === '/publication.json'
    ? Response.json({ revision: 'a'.repeat(20) }) : Response.json([{ metric: 'value', value: 123 }]); } } };
  const response = await onRequestGet({ request: request('metrics'), env });
  assert.equal(response.status, 200);
  assert.deepEqual(paths, ['/publication.json', `/views/${'a'.repeat(20)}/financial/metrics.json`]);
  assert.deepEqual(await response.json(), [{ metric: 'value', value: 123 }]);
  const html = { ASSETS: { fetch: async url => url.pathname === '/publication.json' ? Response.json({ revision: 'a'.repeat(20) }) : new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) } };
  assert.equal((await onRequestGet({ request: request('metrics'), env: html })).status, 503);
});

test('an empty ownership projection is unknown unless an actual nil was measured', () => {
  const graph = { nodes: [{ id: 'owner', kind: 'owner' }, { id: 'account', kind: 'account' }], edges: [{ id: 'a', owner: 'owner', owned: 'account', relationship: 'owns', fraction: 1 }] };
  assert.equal(ownershipExposure(graph, [], 'owner', '2026-11-01').value, null);
  graph.nodes[1].verifiedNil = true;
  assert.equal(ownershipExposure(graph, [], 'owner', '2026-11-01').value, 0);
});
test('an empty aggregate cannot turn a missing portfolio into a verified zero', () => {
  const b = { ...book([]), BOOK_SUMMARY: { totalValue: 0 } };
  const metric = buildFinancialIntegrity(b, []).metrics.find(m => m.id === 'portfolio:marketValue');
  assert.equal(metric.status, 'missing'); assert.equal(metric.value, null); assert.equal(metric.usableValue, null);
  b.BOOK_ACCOUNT_RETURN_RECORDS = { [account.accountId]: { record: { value: 0 } } };
  const nil = buildFinancialIntegrity(b, []).metrics.find(m => m.id === 'portfolio:marketValue');
  assert.equal(nil.status, 'source-backed'); assert.equal(nil.usableValue, 0);
});

test('a source review is unaffected by password-list order, but financial changes invalidate it', async () => {
  const { reviewDocumentRevision } = await import('../lib/reconciliation-policy.mjs');
  const a = { docKey: 'source', holdings: [{ quantity: 10 }], warnings: [{ code: 'pdf-encrypted', index: 1 }] };
  assert.equal(reviewDocumentRevision(a), reviewDocumentRevision({ ...a, warnings: [{ code: 'pdf-encrypted', index: 5 }] }));
  assert.notEqual(reviewDocumentRevision(a), reviewDocumentRevision({ ...a, holdings: [{ quantity: 11 }] }));
});

test('duplicate persistent identities and relationship IDs cannot silently merge ownership', () => {
  const f = financialRegistry([], { instruments: [{ id: 'same', keys: ['a'], isins: [] }, { id: 'same', keys: ['b'], isins: [] }] });
  assert.ok(f.issues.some(i => i.code === 'DUPLICATE_INSTRUMENT_ID'));
  assert.ok(validateOwnershipGraph([{ id: 'a' }, { id: 'b' }], [{ id: 'same', relationship: 'owns', owner: 'a', owned: 'b', fraction: .5 }, { id: 'same', relationship: 'owns', owner: 'a', owned: 'b', fraction: .5 }]).some(i => i.code === 'DUPLICATE_RELATIONSHIP'));
  const duplicate = buildFinancialIntegrity(book(), [], { ownership: { nodes: [{ id: 'legal-owner', kind: 'owner' }, { id: 'legal-owner', kind: 'trust' }], edges: [] } });
  assert.ok(duplicate.issues.some(i => i.code === 'DUPLICATE_ENTITY' && i.id === 'legal-owner'));
  const shadowed = buildFinancialIntegrity(book(), [], { ownership: { nodes: [{ id: 'account:account-a', kind: 'trust' }], edges: [] } });
  assert.ok(shadowed.issues.some(i => i.code === 'DUPLICATE_ENTITY'));
});
