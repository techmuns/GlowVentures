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
 * +₹92.9 L, and the tile printed ₹18.2 L. Nothing was mis-added; the SET the
 * arithmetic ran over was wrong.
 *
 * So the head totals are struck per `ownerId` — the canonical owner every
 * account in this book resolves to (`shared/owners.mjs`) — and the rates are
 * applied to each person's own figure. Within one person the accounts net
 * inside a head, and then the Act's own set-off runs: a SHORT-TERM loss is set
 * off against the same person's long-term gain (s.70(2)), and a long-term loss
 * never against a short-term gain (s.70(3)). That is statute, not a judgement:
 * leaving it out printed ₹33.1 L, where Ajay's own −₹70.9 L short-term loss
 * absorbs ₹70.9 L of his own +₹1.14 Cr long-term gain and the book's estimate is
 * ₹24.2 L. The audit (A-13) had put it at ≈ ₹24 L on exactly this rule.
 *
 * THE SET-OFF IS STRUCK ONLY WITHIN ONE FINANCIAL YEAR. A loss carries forward
 * and never back, so a person whose windows open before the year the newest
 * window closes in has a figure this file cannot split by year: no set-off is
 * struck for them, and `setOffWithheld` says so for the page to name. On this
 * book every window of Ajay's is inside FY 2026-27.
 *
 * What the page still does NOT do is apply the ₹1.25 L exemption, add surcharge
 * and cess, or tax a liquid fund's gain at the holder's slab rate (s.50AA) —
 * its footnote says so, and each of those turns on facts no statement here
 * carries (the year's other income, which lots are specified funds).
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
  /** The short-term loss set off against this person's long-term gain (s.70(2)); 0 where there is nothing to set off. */
  setOff: number;
  /** A short-term loss sits beside a long-term gain but the windows span financial years, so no set-off is struck. */
  setOffWithheld: boolean;
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

/**
 * The first day of the financial year (1 April – 31 March) the NEWEST window
 * closes in, as "YYYY-04-01"; "" when no window carries a close date. ONE
 * definition for the page's "reaches into an earlier year" note and the set-off
 * gate below, so the two cannot name different years.
 */
export function financialYearStart(rows: readonly EntityCG[]): string {
  const newestTo = rows.reduce((a, c) => (c.periodTo && c.periodTo > a ? c.periodTo : a), "");
  if (!newestTo) return "";
  const y = Number(newestTo.slice(0, 4));
  return `${Number(newestTo.slice(5, 7)) >= 4 ? y : y - 1}-04-01`;
}

/** Null when every input is null — a head no account reported is not a zero. */
const addNullable = (a: number | null, b: number | null) =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

export function estimateRealisedTax(rows: readonly EntityCG[]): RealisedTaxEstimate {
  const reported = rows.filter((c) => c.realisedST !== null || c.realisedLT !== null);
  const unattributed = reported.filter((c) => !c.ownerId);
  const fyStart = financialYearStart(reported);
  const byOwner = new Map<string, TaxpayerEstimate & { oneYear: boolean }>();
  for (const c of reported) {
    if (!c.ownerId) continue;
    const e = byOwner.get(c.ownerId)
      ?? { ownerId: c.ownerId, owner: ownerDisplayName(c.ownerId), accounts: [], st: null, lt: null,
        setOff: 0, setOffWithheld: false, tax: 0, oneYear: true };
    e.accounts.push(c.entity);
    e.st = addNullable(e.st, c.realisedST);
    e.lt = addNullable(e.lt, c.realisedLT);
    // A window with no opening date is not shown to sit inside the year.
    if (!fyStart || !c.periodFrom || c.periodFrom < fyStart) e.oneYear = false;
    byOwner.set(c.ownerId, e);
  }
  const byTaxpayer = [...byOwner.values()]
    .map(({ oneYear, ...e }) => {
      const pair = (e.st ?? 0) < 0 && (e.lt ?? 0) > 0;
      const setOff = pair && oneYear ? Math.min(-(e.st ?? 0), e.lt ?? 0) : 0;
      const st = e.st === null ? null : e.st + setOff;
      const lt = e.lt === null ? null : e.lt - setOff;
      return { ...e, accounts: [...e.accounts].sort(), setOff, setOffWithheld: pair && !oneYear, tax: taxOn(st, lt) };
    })
    .sort((a, b) => b.tax - a.tax || a.owner.localeCompare(b.owner));
  const attributed = reported.filter((c) => !!c.ownerId);
  const total = attributed.length ? byTaxpayer.reduce((s, e) => s + e.tax, 0) : null;
  let pooledST: number | null = null, pooledLT: number | null = null;
  for (const c of reported) { pooledST = addNullable(pooledST, c.realisedST); pooledLT = addNullable(pooledLT, c.realisedLT); }
  const pooled = reported.length ? taxOn(pooledST, pooledLT) : null;
  return { total, byTaxpayer, unattributed, pooled };
}
