import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { collectFinancialAudit } from '../lib/financial-integrity.mjs';
import { readGaps, settleStatus } from '../lib/readStatus.mjs';
import { digest } from '../lib/publication.mjs';

const position = { accountId: 'fixture', securityKey: 'preserved-fund', security: 'Preserved fund', quantity: 10, costBasis: 100, marketValue: 120, currentPrice: 12, unrealizedPnL: 20, returnPct: 20 };
const book = () => ({ BOOK_AS_OF: '2026-11-01', BOOK_POSITIONS: [{ ...position }], BOOK_ACCOUNTS: [{ accountId: 'fixture', accountNo: 'F', ownerId: 'holder', owner: 'Holder', asOf: '2026-11-01' }],
  BOOK_SUMMARY: { totalValue: 120 }, BOOK_COMMITMENTS: [], BOOK_HOLDING_TRADES: {}, BOOK_HOLDING_INCOME: {}, BOOK_CAPITAL_MOVES: [] });

test('capital audit findings cannot change the established book or become publication blockers', () => {
  const input = book(); input.BOOK_COMMITMENTS = [{ accountId: 'fixture', committed: 100, called: 50, paid: 70, undrawn: 50, pending: 0 }];
  const original = structuredClone(input);
  const report = collectFinancialAudit(input, [], { registry: { instruments: [] } });
  assert.equal(report.mode, 'advisory'); assert.deepEqual(report.blockingIssues, []);
  assert.equal(report.auditStatus, 'attention');
  assert.ok(report.issues.some(i => i.code === 'CAPITAL_DOES_NOT_RECONCILE'));
  assert.deepEqual(input, original, 'all source amounts and coverage remain intact');
});

test('an expired review is audit information and does not discard established values', () => {
  const entries = JSON.parse(fs.readFileSync(new URL('../../../config/reconciliation-exceptions.json', import.meta.url))).entries;
  const key = entries.find(e => e.section === 'rowSumChecks').finding.docKey;
  const document = JSON.parse(fs.readFileSync(new URL(`../../../public/audit/${key}/document.json`, import.meta.url)));
  const input = book(), before = digest(input);
  const report = collectFinancialAudit(input, [document], { evaluationDate: '2099-01-01', registry: { instruments: [] } });
  assert.ok(report.issues.some(i => i.code === 'RECONCILIATION_REVIEW_REQUIRED'));
  assert.deepEqual(report.blockingIssues, []);
  assert.equal(digest(input), before);
  assert.equal(input.BOOK_POSITIONS[0].marketValue, 120);
});

test('an optional audit failure is isolated from the established financial book', () => {
  const input = book(), before = structuredClone(input);
  const report = collectFinancialAudit(input, [], { registry: { instruments: [{ id: 'broken-audit-configuration' }] } });
  assert.equal(report.auditStatus, 'unavailable'); assert.deepEqual(report.blockingIssues, []);
  assert.equal(report.issues[0].code, 'AUDIT_UNAVAILABLE');
  assert.equal(report.summary.unresolvedExceptions, null, 'an unavailable audit must not claim there are zero discrepancies');
  assert.deepEqual(input, before);
  const malformedExtension = collectFinancialAudit(input, [], { registry: { instruments: [{ id: 'prior-identity', keys: ['preserved-fund'], isins: [], unsupportedExtension: () => {} }] } });
  assert.equal(malformedExtension.auditStatus, 'unavailable');
  assert.equal(malformedExtension.registry.instruments[0].id, 'prior-identity', 'known identity continuity is retained when optional metadata cannot be cloned');
});

test('a new units audit note cannot demote a fully read statement', () => {
  const document = { status: 'ok', warnings: [{ code: 'financial-units-audit', detail: 'Review the declared scale against the established adapter.' }] };
  assert.deepEqual(readGaps(document), []); assert.equal(settleStatus(document).status, 'ok');
  const report = collectFinancialAudit(book(), [{ ...document, docKey: 'units-note' }], { registry: { instruments: [] } });
  assert.ok(report.issues.some(i => i.code === 'FINANCIAL_UNITS_REVIEW'));
  assert.deepEqual(report.blockingIssues, []);
});

test('unverified ownership enrichments stay advisory and never mutate portfolio totals', () => {
  const input = book(), before = structuredClone(input);
  const report = collectFinancialAudit(input, [], { registry: { instruments: [] }, ownership: { nodes: [{ id: 'entity' }, { id: 'entity' }], edges: [] } });
  assert.ok(report.issues.some(i => i.code === 'DUPLICATE_ENTITY'));
  assert.deepEqual(report.blockingIssues, []);
  assert.deepEqual(input, before);
});

test('an independent arithmetic check cannot replace a curated displayed result', () => {
  const input = book(); input.BOOK_POSITIONS[0].unrealizedPnL = 18;
  const report = collectFinancialAudit(input, [], { registry: { instruments: [] } });
  assert.equal(report.metrics.find(m => m.metric === 'unrealizedPnL').value, 18);
  const check = report.checks.find(c => c.kind === 'unrealized-arithmetic');
  assert.equal(check.status, 'disputed'); assert.equal(check.expectedMinor, '2000');
  assert.equal(input.BOOK_POSITIONS[0].unrealizedPnL, 18);
});

test('review expiry retains an established source-scoped decision without claiming a new review', async () => {
  const { reconciliationReview, findingId, reviewDocumentRevision } = await import('../lib/reconciliation-policy.mjs');
  const document = { docKey: 'decision-source', holdings: [{ marketValue: 120 }], warnings: [] };
  const finding = { docKey: document.docKey, severity: 'material', delta: 1 };
  const review = { id: findingId('rowSumChecks', finding), section: 'rowSumChecks', finding, status: 'explained',
    disposition: 'derive-from-canonical-inputs', affectedMetrics: ['marketValue'], owner: 'Existing reviewer', reason: 'Previously established source treatment',
    reviewedOn: '2026-01-01', reviewBy: '2026-02-01', documentRevisions: { [document.docKey]: reviewDocumentRevision(document) } };
  const options = { exceptions: [review], on: '2026-03-01', documentRevisions: new Map([[document.docKey, reviewDocumentRevision(document)]]) };
  const expired = reconciliationReview({ rowSumChecks: [finding] }, options)[0];
  assert.equal(expired.status, 'needs-review'); assert.equal(expired.review, null);
  assert.equal(expired.establishedDecision.disposition, 'derive-from-canonical-inputs');
  const changed = { ...document, holdings: [{ marketValue: 130 }] };
  const changedReview = reconciliationReview({ rowSumChecks: [finding] }, { ...options, documentRevisions: new Map([[document.docKey, reviewDocumentRevision(changed)]]) })[0];
  assert.equal(changedReview.establishedDecision, undefined, 'a previous decision cannot silently attach to changed source facts');
});
