// Per-entity money-weighted returns for the Family & Entities breakdown.
// These need dated inputs the base position model doesn't carry, so each
// function returns null (rendered as "—") until the upload supplies them:
//   • XIRR  — needs each account's dated flows AND an opening portfolio value.
//   • YTD   — needs entityNavHistory (a per-entity opening NAV for the FY).
import type { Portfolio, Position } from "./types";
import { xirr } from "./xirr";
import { pooledXirr, totalReturnFromXirr } from "./bucketXirr";
import { fyStartYear } from "./analytics";
import { ownerDisplayName } from "./owners";

/** An account carries an opening portfolio value only if a flow says so. */
const accountHasOpening = (portfolio: Portfolio, accountId: string): boolean =>
  (portfolio.accountCashFlows?.[accountId] ?? [])
    .some((f) => /^opening portfolio value/i.test(f.description ?? ""));

/** Display name an account resolves to, matching `ownerOf` / `byEntity`. */
const accountOwnerName = (a: { ownerId?: string | null; owner?: string | null }): string =>
  a.ownerId ? ownerDisplayName(a.ownerId) : (a.owner || "Unattributed");

export type OwnerReturn = {
  /** Annualised money-weighted return (%), over MEASURABLE accounts only. Null when none qualify. */
  annPct: number | null;
  /** The above de-annualised to the window the flows span (%). */
  toDatePct: number | null;
  /** Terminal market value of the accounts that could be measured. */
  measuredMV: number;
  /** The owner's whole market value (for naming coverage). */
  totalMV: number;
  /** Account numbers excluded for want of an opening portfolio value. */
  excluded: string[];
  /** How many accounts contributed to the measured figure. */
  covered: number;
  /** Days the measured window spans. */
  windowDays: number | null;
};

/**
 * MONEY-WEIGHTED RETURN FOR ONE OWNER — measurable accounts only.
 *
 * This is the fix for the failure CLAUDE.md §9 documents and `/performance` and
 * Morning CIO already guard against. An owner's opening portfolio values cover
 * only the accounts that publish a performance summary, so closing the owner's
 * WHOLE market value against those partial openings folds every uncovered
 * account's value into the terminal inflow with no opening stake behind it — for
 * Ajay that closed ~₹62.86 Cr of openings against his full ₹155.45 Cr and
 * returned ~+2,600% p.a.; for Ankita worse. The old per-entity helper did exactly
 * that (it appended the entity's whole `currentMV` to partial flows).
 *
 * Here each qualifying account contributes ONE part — its own dated flows and its
 * own terminal market value at its OWN as-of — and `pooledXirr` solves the set at
 * once. Accounts with no opening value are EXCLUDED and named, never blended in.
 * Returns a zero-coverage result (annPct null → renders "—") rather than
 * inventing a stake it was not given.
 */
export function ownerMeasuredReturn(portfolio: Portfolio, positions: Position[], owner: string): OwnerReturn {
  const parts: { flows: { date: Date; amount: number }[]; terminalValue: number; asOf: Date }[] = [];
  const excluded: string[] = [];
  let measuredMV = 0, totalMV = 0;
  let earliest: number | null = null, latest: number | null = null;

  for (const a of portfolio.accounts) {
    if (accountOwnerName(a) !== owner) continue;
    const accMv = positions.filter((x) => x.accountId === a.accountId).reduce((s, x) => s + x.marketValue, 0);
    totalMV += accMv;
    if (accMv <= 0) continue;                                   // nothing to close against
    const flows = (portfolio.accountCashFlows?.[a.accountId] ?? []).map((f) => ({ date: new Date(f.date), amount: f.amount }));
    if (!accountHasOpening(portfolio, a.accountId) || !flows.length) { excluded.push(a.accountNo); continue; }
    const asOf = new Date(a.asOf);
    parts.push({ flows, terminalValue: accMv, asOf });
    measuredMV += accMv;
    for (const f of flows) { const t = f.date.getTime(); if (earliest == null || t < earliest) earliest = t; }
    const at = asOf.getTime(); if (latest == null || at > latest) latest = at;
  }

  const annPct = parts.length ? pooledXirr(parts) : null;
  const windowDays = earliest != null && latest != null ? Math.round((latest - earliest) / 864e5) : null;
  const toDatePct = totalReturnFromXirr(annPct, windowDays);
  return { annPct, toDatePct, measuredMV, totalMV, excluded, covered: parts.length, windowDays };
}

// Financial-year-to-date return (1 Apr → as-of) for one owning entity, using the
// Simple Dietz method so mid-year contributions don't distort the figure.
// Returns a non-annualized percentage for the period, or null when the entity
// carries no opening NAV for the financial year (this book carries none, so it
// renders "—" — never a fabricated figure against a partial opening).
export function entityYtdPct(portfolio: Portfolio, owner: string, currentMV: number): number | null {
  const nav = portfolio.entityNavHistory?.[owner];
  if (!nav || nav.length === 0 || currentMV <= 0) return null;
  const asOf = new Date(portfolio.asOf);
  const fyStart = new Date(fyStartYear(asOf), 3, 1); // 1 April of the current FY
  const opening = [...nav]
    .filter((n) => new Date(n.date) <= fyStart)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  if (!opening || opening.nav <= 0) return null;
  // Net capital contributed during the FY-to-date window (amount < 0 = capital in).
  const contrib = (portfolio.entityCashFlows?.[owner] ?? [])
    .filter((f) => { const d = new Date(f.date); return d > fyStart && d <= asOf; })
    .reduce((s, f) => s + (-f.amount), 0);
  const gain = currentMV - opening.nav - contrib;
  const base = opening.nav + contrib / 2;
  return base > 0 ? (gain / base) * 100 : null;
}
