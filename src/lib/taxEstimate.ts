/**
 * ── THE TAX ON REALISED GAINS, STRUCK PER TAXPAYER ──────────────────────────
 *
 * Capital Gains' "Est. tax on realised" tile used to read
 *
 *   max(0, Σ ST over every account) × 20% + max(0, Σ LT over every account) × 12.5%
 *
 * — one sum over SEVEN accounts held by THREE people. Tax is assessed per
 * person, so that pooled one member's short-term loss against the other
 * members' short-term gains: Ajay's −₹70.9 L wiped out Ankita's and Bharat's
 * +₹92.9 L, and the tile printed ₹18.2 L where the page's own stated rules give
 * ₹33.1 L. Nothing was mis-added; the SET the arithmetic ran over was wrong, and
 * the footnote saying losses are "not netted across heads" read as though
 * nothing was netted at all.
 *
 * So the head totals are struck per `ownerId` — the canonical owner every
 * account in this book resolves to (`shared/owners.mjs`) — and the rates are
 * applied to each person's own figure. Within one person the accounts DO net
 * inside a head, which is what the Act does too (s.70(1)/(2): a loss sets off
 * against a gain under the same head); what the page still does NOT do is set a
 * short-term loss off against a long-term gain, apply the ₹1.25 L exemption, or
 * add surcharge and cess — its footnote says so, and each of those is a
 * question for the family's tax adviser rather than a default this file picks.
 *
 * A REPORTED ROW WITH NO CANONICAL OWNER CANNOT BE TAXED PER PERSON. It is
 * returned in `unattributed` and left out of the total rather than pooled into
 * somebody's figure; the page names it. On this book there are none.
 */
import type { EntityCG } from "./types";
import { ownerDisplayName } from "./owners";

/** Illustrative Indian equity rates: STCG u/s 111A = 20%; LTCG u/s 112A = 12.5%. */
export const STCG_RATE = 0.2;
export const LTCG_RATE = 0.125;

export type TaxpayerEstimate = {
  ownerId: string;
  owner: string;
  /** The accounts whose capital gain statements this person's figure sums. */
  accounts: string[];
  /** Net realised under each head, over this person's own accounts. Null where no account reported the head. */
  st: number | null;
  lt: number | null;
  tax: number;
};

export type RealisedTaxEstimate = {
  /** Σ over taxpayers. Null when no account reports a realised figure at all. */
  total: number | null;
  byTaxpayer: TaxpayerEstimate[];
  /** Reported rows with no canonical owner — not taxable per person, named instead. */
  unattributed: EntityCG[];
  /**
   * What the tile used to print: the heads pooled across every taxpayer first.
   * Kept so the page can say how far the two differ and the suite can hold the
   * difference to the book — never displayed as the estimate.
   */
  pooled: number | null;
};

const taxOn = (st: number | null, lt: number | null) =>
  Math.max(0, st ?? 0) * STCG_RATE + Math.max(0, lt ?? 0) * LTCG_RATE;

/** Null when every input is null — a head no account reported is not a zero. */
const addNullable = (a: number | null, b: number | null) =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

export function estimateRealisedTax(rows: readonly EntityCG[]): RealisedTaxEstimate {
  const reported = rows.filter((c) => c.realisedST !== null || c.realisedLT !== null);
  const unattributed = reported.filter((c) => !c.ownerId);
  const byOwner = new Map<string, TaxpayerEstimate>();
  for (const c of reported) {
    if (!c.ownerId) continue;
    const e = byOwner.get(c.ownerId)
      ?? { ownerId: c.ownerId, owner: ownerDisplayName(c.ownerId), accounts: [], st: null, lt: null, tax: 0 };
    e.accounts.push(c.entity);
    e.st = addNullable(e.st, c.realisedST);
    e.lt = addNullable(e.lt, c.realisedLT);
    byOwner.set(c.ownerId, e);
  }
  const byTaxpayer = [...byOwner.values()]
    .map((e) => ({ ...e, accounts: [...e.accounts].sort(), tax: taxOn(e.st, e.lt) }))
    .sort((a, b) => b.tax - a.tax || a.owner.localeCompare(b.owner));
  const attributed = reported.filter((c) => !!c.ownerId);
  const total = attributed.length ? byTaxpayer.reduce((s, e) => s + e.tax, 0) : null;
  let pooledST: number | null = null, pooledLT: number | null = null;
  for (const c of reported) { pooledST = addNullable(pooledST, c.realisedST); pooledLT = addNullable(pooledLT, c.realisedLT); }
  const pooled = reported.length ? taxOn(pooledST, pooledLT) : null;
  return { total, byTaxpayer, unattributed, pooled };
}
