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
 * IT IS A TAX FOR ONE FINANCIAL YEAR, AND ONLY THAT YEAR'S SALES ARE IN IT.
 * Tax is assessed per year (1 April to 31 March), on the gains of the sales
 * made in it — and a capital gain statement's window is the manager's choice.
 * ASK's and Marathon's run from inception (2019 and 2024), so struck on the
 * window the tile taxed seven years of booked gains as this year's: ₹2.00 Cr,
 * where not one of those four accounts' 2,389 lots was sold on or after
 * 1 April 2026. Every lot carries its sale date, so `build-book` splits each
 * account's realised by the year its lots were sold in (`realisedByYear`), and
 * the estimate takes the year the newest window closes in. What the statements
 * report from earlier years is `earlierYears`, named and taxed nowhere here.
 *
 * THE SET-OFF IS STRUCK ONLY WITHIN THAT YEAR. A loss carries forward and never
 * back. A row split by sale date is one year's figure by construction; a row
 * whose lots carry no split (a constructed one, or a statement printing no sale
 * dates) falls back to its window, and a person with such a window opening
 * before the year gets no set-off, which `setOffWithheld` says for the page.
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
   * What the tile used to print: the heads pooled across every taxpayer first —
   * over the same year's figures, so the two differ only in the pooling.
   * Kept so the page can say how far the two differ and the suite can hold the
   * difference to the book — never displayed as the estimate.
   */
  pooled: number | null;
  /** The financial year the estimate is for, as its 1 April ("YYYY-04-01"); "" when no window closes. */
  year: string;
  /**
   * Gains the statements report from sales in an EARLIER financial year — a
   * past year's return, in no part of this estimate. One entry per account.
   * (A lot is sold no later than its statement's close, and the year is the one
   * the newest close falls in, so every other year is an earlier one.)
   */
  earlierYears: { entity: string; ownerId: string | null; st: number; lt: number; lots: number; years: string[] }[];
  /** Lots with no sale date: placed in no year, so in no part of this estimate. One entry per account. */
  undated: { entity: string; ownerId: string | null; st: number; lt: number; lots: number }[];
};

/**
 * One account's heads FOR THE YEAR. A row split by sale date gives the year's
 * own sum — a head the statement reports is a measured figure for the year too,
 * so an account that sold nothing in it contributes a real ₹0 — unless its
 * window closes before the year opens, when it says nothing about the year at
 * all. A row with no split gives its window, as before.
 */
function yearHeadsOf(c: EntityCG, year: string): { st: number | null; lt: number | null; split: boolean } {
  const split = c.realisedByYear;
  if (!split || !year) return { st: c.realisedST, lt: c.realisedLT, split: false };
  if (c.periodTo && c.periodTo < year) return { st: null, lt: null, split: true };
  const inYear = split.filter((e) => e.fy === year);
  return {
    st: c.realisedST === null ? null : inYear.reduce((s, e) => s + e.st, 0),
    lt: c.realisedLT === null ? null : inYear.reduce((s, e) => s + e.lt, 0),
    split: true,
  };
}

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
  const earlierYears: RealisedTaxEstimate["earlierYears"] = [];
  const undated: RealisedTaxEstimate["undated"] = [];
  const heads = new Map<EntityCG, { st: number | null; lt: number | null }>();
  for (const c of reported) {
    const h = yearHeadsOf(c, fyStart);
    heads.set(c, h);
    if (h.split) {
      const other = (c.realisedByYear ?? []).filter((e) => e.fy !== null && (e.fy !== fyStart || h.st === null && h.lt === null));
      const none = (c.realisedByYear ?? []).filter((e) => e.fy === null);
      const sumOf = (es: typeof other) => ({
        st: es.reduce((s, e) => s + e.st, 0), lt: es.reduce((s, e) => s + e.lt, 0), lots: es.reduce((n, e) => n + e.lots, 0),
      });
      if (other.length) earlierYears.push({ entity: c.entity, ownerId: c.ownerId ?? null, ...sumOf(other), years: other.map((e) => e.fy as string) });
      if (none.length) undated.push({ entity: c.entity, ownerId: c.ownerId ?? null, ...sumOf(none) });
    }
    if (!c.ownerId) continue;
    const e = byOwner.get(c.ownerId)
      ?? { ownerId: c.ownerId, owner: ownerDisplayName(c.ownerId), accounts: [], st: null, lt: null,
        setOff: 0, setOffWithheld: false, tax: 0, oneYear: true };
    e.accounts.push(c.entity);
    e.st = addNullable(e.st, h.st);
    e.lt = addNullable(e.lt, h.lt);
    // A figure split by sale date is the year's by construction; an unsplit
    // window with no opening date is not shown to sit inside the year.
    if (!h.split && (!fyStart || !c.periodFrom || c.periodFrom < fyStart)) e.oneYear = false;
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
  for (const c of reported) {
    const h = heads.get(c)!;
    pooledST = addNullable(pooledST, h.st); pooledLT = addNullable(pooledLT, h.lt);
  }
  const pooled = reported.length ? taxOn(pooledST, pooledLT) : null;
  return { total, byTaxpayer, unattributed, pooled, year: fyStart, earlierYears, undated };
}
