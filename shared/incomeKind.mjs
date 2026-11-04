// WHICH INCOME EVENTS ARE CASH — one rule for the book and the ledger.
//
// *"if now tomorrow interest payments come in how will you show"* — the family,
// 4 Nov 2026. The readers print an income event's KIND as the statement names
// it, and two places decided from that word whether money was paid:
// `build-book.mjs` (`dividend` or `distribution` is the holding's income) and
// `ledgerModel.ts`'s `deriveIncome` (only `dividend` was cash). Neither named
// interest, so the first statement to print an interest credit would have been
// filed as a non-cash corporate action: blank on the Transactions sheet, and in
// no holding's income or return. One list, read by both, so the two cannot
// disagree about the same row.
//
// CASH: a dividend, an IDCW (the mutual-fund name for one), interest, a bond's
// coupon, or a fund's distribution — money the holding paid without a unit
// being sold. NON-CASH: a bonus, a split, a spin-off or demerger, rights, a
// merger or consolidation — the entitlement is the substance and no money
// moved, and it wins: "bonus in lieu of dividend" is a bonus. A kind on neither
// list is not cash, and is named where it lands.

const CASH = /\b(?:dividends?|idcw|interest|coupon|distributions?)\b/i;
const NON_CASH = /\b(?:bonus|split|spin[ -]?off|demerger|rights|merger|consolidation)\b/i;

/** Did this income event pay money? Read off the kind the statement prints. */
export function isCashIncomeKind(kind) {
  return typeof kind === "string" && CASH.test(kind) && !NON_CASH.test(kind);
}
