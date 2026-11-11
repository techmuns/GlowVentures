import type { Portfolio } from "./types";
import { buildInputCatalog, applySavedInputs, positionInputId, privateCapitalId, capitalInputId, type SavedInput } from "./tableInputs";
import { capitalIssues } from "../../shared/capitalValidation.mjs";
import { publicPrivateSplit } from "./analytics";
import { fifoReturnPct } from "../../shared/fifo.mjs";

/** Rebuild the working book from immutable source data on every save/restore.
 * Never write corrections into glowData, source statements or dated flows. */
export function applyTableInputs(book: Portfolio | null, saved: readonly SavedInput[]): Portfolio | null {
  if (!book || !saved.length) return book;
  const catalog = applySavedInputs(buildInputCatalog(book.positions, book.commitments, book.accounts), saved);
  const by = new Map(catalog.map(r => [r.id, r]));
  const positions = book.positions.map(original => {
    const input = by.get(positionInputId(original)), cap = by.get(privateCapitalId(original));
    const fields = Object.keys(input?.versions ?? {});
    const hasCap = cap && Object.keys(cap.versions).length > 0 && Object.values(cap.values).some(value => value !== null);
    if (!fields.length && !hasCap) return original;
    // A retained old correction is rechecked against today's complete source
    // record, not trusted because it once passed the cell-range validator.
    if (hasCap && capitalIssues(cap.values, cap.capitalTerms).length) return original;
    const p = { ...original, enteredNumbers: fields, enteredCapital: hasCap ? cap.values : undefined };
    if (fields.some(field => field !== 'marketValue')) p.returnInputsUnavailableReason = 'A saved correction changes units, cost or income, but the dated transaction record has not been corrected to reconcile with it.';
    for (const field of fields) Object.assign(p, { [field]: input!.values[field] });
    // A newly supplied valuation supersedes the old "held at cost" treatment.
    // A cost-only correction keeps that treatment and carries its value with it.
    if (fields.includes("marketValue")) p.valuedAtCost = false;
    else if (p.valuedAtCost && fields.includes("costBasis") && p.costBasis != null) p.marketValue = p.costBasis;
    if (fields.includes("costBasis") && p.costBasis != null) p.costUnavailable = undefined;
    if (fields.length) {
      p.avgCost = p.costBasis != null && p.quantity != null && p.quantity > 0 ? p.costBasis / p.quantity : null;
      p.currentPrice = !p.valuedAtCost && p.quantity != null && p.quantity > 0 ? p.marketValue / p.quantity : null;
      p.unrealizedPnL = p.valuedAtCost || p.costBasis == null ? null : p.marketValue - p.costBasis;
      p.returnPct = p.hprUnavailableReason || p.valuedAtCost || p.costBasis == null ? null : fifoReturnPct(p.marketValue, p.costBasis, p.realizedPnL, p.costOfUnitsSold, p.dividendReceived);
      p.live = false; p.priceEvidence = undefined; p.dayChange = null; p.dayChangePct = null;
      // A rolled statement snapshot cannot replace a deliberate correction.
      if (fields.some(field => field !== "dividendReceived")) p.rolledForward = undefined;
    }
    if (p.integrity && fields.length) {
      p.integrity = { ...p.integrity, metrics: { ...p.integrity.metrics } };
      for (const field of fields) {
        const previous = p.integrity.metrics[field];
        if (previous) p.integrity.metrics[field] = { ...previous, status: input!.values[field] == null ? 'missing' : 'entered', basis: 'family-correction', exceptions: [] };
      }
      if (fields.includes('costBasis') && original.valuedAtCost && !fields.includes('marketValue') && p.costBasis != null) {
        const previous = p.integrity.metrics.marketValue;
        if (previous) p.integrity.metrics.marketValue = { ...previous, status: 'at-cost', basis: 'carrying-cost-from-family-correction', exceptions: [] };
      }
      if (fields.some(field => field === 'marketValue' || field === 'costBasis')) {
        const previous = p.integrity.metrics.unrealizedPnL;
        const disputed = ['marketValue', 'costBasis'].flatMap(field => p.integrity!.metrics[field]?.status === 'disputed' ? [p.integrity!.metrics[field]] : []);
        if (previous) p.integrity.metrics.unrealizedPnL = { ...previous, status: p.unrealizedPnL == null ? 'missing' : disputed.length ? 'disputed' : 'entered',
          basis: 'derived-from-family-correction', exceptions: disputed.flatMap(m => m.exceptions) };
      }
    }
    return p;
  });
  const commitments = book.commitments.map(c => {
    const r = by.get(capitalInputId(c.accountId));
    if (!r || !Object.keys(r.versions).length || capitalIssues(r.values, r.capitalTerms).length) return c;
    const next = { ...c };
    for (const key of Object.keys(r.versions)) Object.assign(next, { [key]: r.values[key] });
    return next;
  });
  const split = publicPrivateSplit(positions);
  return { ...book, positions, commitments, totalValue: split.listed + split.private + split.unplaced,
    listedValue: split.listed, privateValue: split.private, unplacedValue: split.unplaced };
}
