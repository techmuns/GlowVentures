/**
 * ── WHEN A LOT TURNS LONG-TERM, AND WHAT HOLDING IT THERE SAVES (Stage 10fx) ──
 *
 * One definition for the hold-to-LTCG planner on /capital-gains and the
 * holding-period card on the company page, because both answer the same
 * question about the same lots and two copies would be two chances to disagree.
 *
 * THE TERM IS A LOT'S, NEVER A POSITION'S. A capital asset is short-term when
 * held NOT MORE THAN twelve months (s.2(42A); twenty-four for an unlisted one),
 * and that is decided for each purchase separately. The planner used to work
 * per POSITION — "is this holding at a gain, and when does its FIRST short-term
 * lot cross?" — and on V.E.C 128004's register of 7 Oct 2026 that was wrong
 * three ways:
 *
 *   GREAVES COTTON  position +₹4,55,022 = a long-term lot (19 Sep 2025) at
 *                   −₹1,25,705 + a short-term lot (25 May 2026) at +₹5,80,727.
 *                   The page applied the rate difference to the NET, ₹34,127;
 *                   the short-term lot alone saves ₹43,555.
 *   SHOPPERS STOP   position −₹2,62,529, so it was dropped — while its two
 *   TEJAS NETWORKS  short-term lots (Jan and May 2026) are +₹1,64,389 and
 *                   +₹2,31,162, and Tejas's (Jan 2026) +₹4,15,117. The loss
 *                   sits on the long-term lot bought in 2025.
 *
 * So the tile read "₹34,127 · 1 still short-term" where four lots in three
 * names are short-term winners worth ≈ ₹1.04 L of rate difference. Here each
 * lot's gain is its own units at the statement's mark less its own cost.
 *
 * THE LONG-TERM DATE IS THE PURCHASE ANNIVERSARY PLUS ONE DAY, in calendar
 * months — not purchase + 365 days. A lot bought 19 Sep 2025 has been held
 * "not more than twelve months" through 19 Sep 2026 and is long-term from
 * 20 Sep 2026; `+ 365` said 19 Sep, one day early, and across a 29 February it
 * is two. A purchase on 29 Feb has its anniversary on 28 Feb of a common year
 * (the month's last day), so it turns long-term on 1 March.
 *
 * TODAY IS INDIA'S DATE. Every date here is an Indian statement's, and the
 * financial year is India's; `new Date().toISOString()` is the UTC date, a day
 * behind between 00:00 and 05:30 IST. India keeps no daylight saving, so the
 * offset is a constant.
 */
import { STCG_RATE, LTCG_RATE } from "./taxEstimate";
import { longTermFrom as longTermFromShared, longTermRuleOf, SPECIFIED_FUND_FROM, type LongTermRule } from "../../shared/holdingPeriod.mjs";

/*
 * THE RULE ITSELF IS SHARED (Stage 10fx): `shared/holdingPeriod.mjs` is the
 * one copy, read by `build-book` when it splits a register at its statement
 * date and here when the same lots are re-aged to today. This file adds only
 * what the browser needs around it — India's date, the join of a register's
 * lots to a position, and the planner.
 */
export { longTermRuleOf, SPECIFIED_FUND_FROM, type LongTermRule };

/** Listed equity shares and equity-oriented fund units: short-term up to 12 months (s.2(42A)). */
export const LISTED_LT_MONTHS = 12;
/** An unlisted share: short-term up to 24 months. */
export const UNLISTED_LT_MONTHS = 24;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Today's date in India (UTC+5:30, no daylight saving), as "YYYY-MM-DD". */
export function istToday(now: Date | number = Date.now()): string {
  const t = typeof now === "number" ? now : now.getTime();
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from one ISO date to another (negative when `to` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / DAY_MS);
}

/**
 * The FIRST day a lot bought on `purchase` is long-term — the shared rule's
 * anniversary + 1 day, calendar months clamped at month end — or null for a
 * date that does not parse (the shared rule assumes a valid ISO date).
 */
export function longTermFrom(purchase: string | null | undefined, months: number = LISTED_LT_MONTHS): string | null {
  const d = (purchase ?? "").slice(0, 10);
  return ISO.test(d) ? longTermFromShared(d, months) : null;
}

/** Whether a lot bought on `purchase` is long-term on `on` (both ISO dates). */
export function isLongTermOn(purchase: string, on: string, months: number = LISTED_LT_MONTHS): boolean {
  const from = longTermFrom(purchase, months);
  return from !== null && on.slice(0, 10) >= from;
}

/**
 * THE PERIOD IS THE HOLDING'S (the shared `longTermRuleOf`): 12 months for a
 * listed share or an equity fund's units, 24 for an unlisted share, and a debt
 * or liquid fund's units bought on or after 1 Apr 2023 never long-term
 * (s.50AA). A caller that passes no holding gets the listed-equity rule, which
 * is every lot register in this book (LKP's and V.E.C's are listed shares).
 */
type HoldingFacts = { assetClass?: string | null; marketSide?: string | null; isin?: string | null };
const ruleFor = (holding?: HoldingFacts): LongTermRule =>
  holding ? longTermRuleOf(holding) : { months: LISTED_LT_MONTHS, specifiedFund: false };
/** A lot's long-term date under a holding's rule; null where it never turns or the rule is unknown. */
function lotLongTermFrom(purchase: string, rule: LongTermRule): string | null {
  if (rule.months === null) return null;
  if (rule.specifiedFund && purchase >= SPECIFIED_FUND_FROM) return null;
  return longTermFrom(purchase, rule.months);
}

/**
 * One dated acquisition lot still held, as a broker's or manager's lot register
 * prints it — the shape `deriveStockLedger` publishes per security
 * (`StockLedger.openLots`), named by the account that issued it.
 */
export type OpenLot = {
  accountNo: string; provider: string;
  /** The register's own date — the day these lots are stated as held. */
  registerDate: string;
  purchaseDate: string; quantity: number; totalCost: number;
};

/**
 * THE LOTS BEHIND ONE POSITION, under `build-book`'s own gate: the register's
 * lots for this account and security must account for the units the position
 * holds EXACTLY, or there are none. A register that still carries units the
 * family sold (Pricol) or misses units it bought (Belrise) would age a holding
 * on lots that are not the holding's, so it is not used at all.
 */
export function lotsForPosition(
  p: { quantity: number | null; securityKey: string },
  account: { accountNo: string; provider: string } | undefined,
  lots: readonly OpenLot[] | null | undefined,
): OpenLot[] | null {
  if (!account || !lots || typeof p.quantity !== "number") return null;
  const own = lots.filter((l) => l.accountNo === account.accountNo && l.provider === account.provider);
  if (!own.length) return null;
  const qty = own.reduce((s, l) => s + l.quantity, 0);
  return Number.isFinite(qty) && Math.abs(qty - p.quantity) < 1e-6 ? own : null;
}

/**
 * Cost held short- and long-term ON `on`, re-aged from each lot's own purchase
 * date under the holding's own period; null where the shared rule cannot place
 * the holding (the book then carries no split for it either).
 */
export function termSplitOn(lots: readonly OpenLot[], on: string, holding?: HoldingFacts) {
  const rule = ruleFor(holding);
  if (rule.months === null) return null;
  let st = 0, lt = 0;
  let nextLT: string | null = null;
  for (const l of lots) {
    const from = lotLongTermFrom(l.purchaseDate, rule);
    if (from !== null && on.slice(0, 10) >= from) lt += l.totalCost;
    else {
      st += l.totalCost;
      if (from && (nextLT === null || from < nextLT)) nextLT = from;
    }
  }
  return { st, lt, nextLT };
}

/**
 * The rate a short-term listed-equity gain loses by being held past its mark:
 * 20% (s.111A) − 12.5% (s.112A). The planner applies it to the lot registers
 * this book carries, which are listed shares; another asset's rates differ.
 */
export const HOLD_RATE_DIFFERENCE = STCG_RATE - LTCG_RATE;

export type PlannerLot = {
  accountId: string; securityKey: string; security: string;
  /** The date the register and the mark are stated at — the position's own account date. */
  statementDate: string;
  purchaseDate: string; quantity: number; cost: number;
  /** This lot's own units at the statement's mark, less this lot's own cost. */
  gain: number;
  /** The first day it is long-term; `daysLeft` is counted to it from `today`. */
  ltDate: string; daysLeft: number;
  /** `gain × (STCG − LTCG)` — the rate difference, before the s.112A exemption. */
  saving: number;
};

/**
 * THE HOLD-TO-LTCG PLANNER, LOT BY LOT. Every position whose register lots
 * reconcile is walked lot by lot; a lot is a CANDIDATE where it is still
 * short-term today and its own gain at the statement's mark is positive, and
 * CROSSED where it was short-term at its statement's date, has since turned
 * long-term, and is at a gain — the saving the planner would have named and
 * which the calendar has now delivered. A position with one lot crossed and
 * another still short-term contributes to both, which is the point: a holding
 * is never "crossed" while it still holds a short-term lot.
 */
export function plannerLots(
  rows: readonly { position: { accountId: string; securityKey: string; security: string; currentPrice: number | null } & HoldingFacts;
    statementDate: string; lots: readonly OpenLot[] }[],
  today: string,
): { candidates: PlannerLot[]; crossed: PlannerLot[]; shortTermAtLoss: number } {
  const candidates: PlannerLot[] = [], crossed: PlannerLot[] = [];
  let shortTermAtLoss = 0;
  for (const { position: p, statementDate, lots } of rows) {
    if (typeof p.currentPrice !== "number" || !Number.isFinite(p.currentPrice)) continue;
    // The holding's own period; a specified fund's lot never crosses, so
    // holding it saves nothing and it is never a candidate.
    const rule = ruleFor("assetClass" in p || "isin" in p ? p : undefined);
    for (const l of lots) {
      const ltDate = lotLongTermFrom(l.purchaseDate, rule);
      if (!ltDate) continue;
      const gain = l.quantity * p.currentPrice - l.totalCost;
      const lot: PlannerLot = {
        accountId: p.accountId, securityKey: p.securityKey, security: p.security, statementDate,
        purchaseDate: l.purchaseDate, quantity: l.quantity, cost: l.totalCost, gain,
        ltDate, daysLeft: daysBetween(today, ltDate), saving: gain * HOLD_RATE_DIFFERENCE,
      };
      if (ltDate > today) {
        if (gain > 0) candidates.push(lot);
        else shortTermAtLoss++;
      } else if (ltDate > statementDate && gain > 0) crossed.push(lot);
    }
  }
  candidates.sort((a, b) => a.daysLeft - b.daysLeft || b.saving - a.saving);
  return { candidates, crossed, shortTermAtLoss };
}
