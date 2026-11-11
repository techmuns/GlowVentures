import { createHash } from 'node:crypto';
import registry from '../../../config/reconciliation-exceptions.json' with { type: 'json' };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])])) : value;
export const findingId = (section, finding) => createHash('sha256').update(JSON.stringify(canonical([section, finding]))).digest('hex');
export function reviewDocumentRevision(document) {
  const scoped = { ...document, warnings: (document.warnings ?? []).map(w => w?.code === 'pdf-encrypted' ? { code: w.code } : w) };
  return createHash('sha256').update(JSON.stringify(canonical(scoped))).digest('hex');
}
export const RECONCILIATION_EXCEPTIONS = registry.entries;
export function reconciliationFindings(report) {
  return ['rowSumChecks', 'derivedVsPrinted', 'datedTableChecks', 'crossReportDeltas', 'duplicateHoldings', 'duplicateAifEarnings']
    .flatMap(section => (report[section] ?? []).filter(f => ['rowSumChecks', 'derivedVsPrinted', 'datedTableChecks'].includes(section)
      ? f.severity === 'material' : f.severity !== 'rounding').map(finding => ({ id: findingId(section, finding), section, finding })));
}
export function reviewedFinding(section, finding, { exceptions = RECONCILIATION_EXCEPTIONS, on = new Date().toISOString().slice(0, 10), documentRevisions } = {}) {
  const id = findingId(section, finding), record = exceptions.find(e => e.id === id);
  if (!record || !['unresolved', 'documented-decision', 'explained'].includes(record.status) || !['withhold-affected-claim', 'derive-from-canonical-inputs', 'use-printed-settlement', 'retain-authoritative-source', 'confirmed-separate-investments'].includes(record.disposition) || !record.reason || !record.owner || !record.reviewedOn || !record.reviewBy || !record.disposition
    || !Array.isArray(record.affectedMetrics) || !record.affectedMetrics.length) return null;
  if ([record.reviewedOn, record.reviewBy].some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) return null;
  if (record.section != null && record.section !== section) return null;
  if (documentRevisions && (!record.documentRevisions || !Object.keys(record.documentRevisions).length || Object.entries(record.documentRevisions).some(([key, revision]) => documentRevisions.get(key) !== revision))) return null;
  if (record.reviewedOn > on || record.reviewBy < on || findingId(section, record.finding) !== id) return null;
  return record;
}
export function reconciliationReview(report, options = {}) {
  return reconciliationFindings(report).map(item => {
    const review = reviewedFinding(item.section, item.finding, options);
    return { ...item, status: review ? review.status : 'needs-review', review: review ?? null };
  });
}
