import type { Portfolio } from "./types";
import { buildInputCatalog, applySavedInputs, positionInputId, privateCapitalId, capitalInputId, type SavedInput } from "./tableInputs";
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
    const p = { ...original, enteredNumbers: fields, enteredCapital: hasCap ? cap.values : undefined };
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
      p.rolledForward = undefined;
    }
    return p;
  });
  const commitments = book.commitments.map(c => {
    const r = by.get(capitalInputId(c.accountId));
    if (!r || !Object.keys(r.versions).length) return c;
    const next = { ...c };
    for (const key of Object.keys(r.versions)) Object.assign(next, { [key]: r.values[key] });
    return next;
  });
  const split = publicPrivateSplit(positions);
  return { ...book, positions, commitments, totalValue: split.listed + split.private + split.unplaced,
    listedValue: split.listed, privateValue: split.private, unplacedValue: split.unplaced };
}
