// XIRR per asset class, for the Morning CIO's allocation table.
//
// XIRR is the one return figure that puts a listed book and a ten-year fund on
// one scale: it solves for the annual rate that makes every dated cash flow
// balance against today's value, so it knows *when* the capital went in.
// Return-on-cost and MOIC can't do that. Every figure here comes out of the same
// solver in ./xirr.ts — the identical calculation Excel's XIRR() performs.
//
// What differs between buckets is not the maths but how well the source dates
// the money, so each bucket reports its own basis:
//
//   • Listed equity  — every buy and sell carries its own date in the ledger, so
//                      this is a full XIRR closed against today's LIVE price.
//
//   • Startups       — the workbook dates the first cheque AND each follow-on
//                      round, so this is a genuine multi-flow XIRR. Where a row's
//                      dated cheques don't add up to its stated total investment,
//                      the shortfall is placed at the first-investment date —
//                      the earliest it could have gone in, which lowers the
//                      resulting rate rather than flattering it.
//
//   • Funds          — the workbook dates the first investment but not the
//                      drawdowns or the distributions. Each fund therefore
//                      contributes two dated flows: capital called at first
//                      investment, and (distributions + NAV) today. That is a
//                      valid XIRR of those flows and a CONSERVATIVE one, since
//                      cash that actually came back earlier is credited late.
//                      Funds with no date are left out rather than guessed at.
import { xirr, type DatedFlow } from "./xirr";
import type { FundInvestment, StartupInvestment } from "./types";

export type XirrResult = {
  /** Annualised money-weighted return, in percent. Null when the flows can't yield one. */
  pct: number | null;
  /** Holdings that carried a usable date, out of how many the bucket holds. */
  dated: number;
  total: number;
};

const NONE: XirrResult = { pct: null, dated: 0, total: 0 };

/**
 * Convert an ANNUALISED money-weighted rate into the TOTAL return earned over
 * its window — the money-weighted answer to "how much has this made to date",
 * not "at what yearly pace".
 *
 * XIRR annualises, so a strong quarter compounds to a yearly rate well over
 * 100% — which reads as a return the book has sustained for a year when the
 * flows only span a quarter. Raising (1 + r) to the fraction of a year the
 * window actually covers gives the cumulative return instead:
 *   (1 + r)^(days / 365) − 1.
 *
 * Null in → null out. A non-positive window returns the rate unchanged (there is
 * no window to de-annualise over).
 */
export function totalReturnFromXirr(annualPct: number | null, windowDays: number | null): number | null {
  if (annualPct == null) return null;
  if (windowDays == null || windowDays <= 0) return annualPct;
  return ((1 + annualPct / 100) ** (windowDays / 365) - 1) * 100;
}

/**
 * A RATE IS ONLY ANNUALISED OVER A WINDOW AT LEAST A YEAR LONG.
 *
 * ── THE FAILURE THIS EXISTS TO STOP ─────────────────────────────────────────
 *
 * The Morning CIO showed **+99.0% XIRR**. Nothing was miscalculated: ₹78.8 Cr
 * of opening value and contributions became ₹99.4 Cr over the 132 days from
 * 1 April to 11 August — +28.3% money-weighted — and compounding 0.36 of a year
 * onto a full one gives +99.0%. Every step is right and the answer is still
 * indefensible, because the book has not run for a year and 99% is a
 * projection of four strong months, not a measurement.
 *
 * THE SOURCES SETTLE IT. These same managers publish their own ANNUALISED
 * since-inception returns for these very accounts: Carnelian 19.83%, Green
 * Lantern 11.45% and 10.6%, Molecule 7.31%. A 99% annual rate for the book
 * they run contradicts every one of them. An annualised figure is a claim
 * about a year, and a 132-day window cannot support one.
 *
 * ── WHY A RULE AND NOT A CAPTION ────────────────────────────────────────────
 *
 * This repo already knew this: `totalReturnFromXirr` above was written for it,
 * and CLAUDE.md records that "an unlabelled +141% reads as a sustained yearly
 * return". The figure came back anyway, the moment a tile asked for "XIRR" —
 * because the knowledge lived in prose and in one page's local choice rather
 * than in a function every caller must go through. So the threshold is here,
 * once, and the return type makes the caller state which figure it has.
 *
 * A year from now this needs no revisiting: once the flows span 365 days the
 * same call starts returning a genuine annual rate, with `annualised: true`.
 */
export const MIN_ANNUALISE_DAYS = 365;

export type MoneyWeighted = {
  /** The figure to PUT ON SCREEN, in percent. Null when there is no rate. */
  pct: number | null;
  /** True only when `pct` is a real annual rate — i.e. the window reached a year. */
  annualised: boolean;
  /** Days the flows actually span. Null when it could not be determined. */
  windowDays: number | null;
  /**
   * The annualised rate REGARDLESS of window, for a popover that labels it an
   * extrapolation. Never render this as a headline on a short window — that is
   * the whole point of the type.
   */
  annualPct: number | null;
};

export function moneyWeightedReturn(annualPct: number | null, windowDays: number | null): MoneyWeighted {
  if (annualPct == null) return { pct: null, annualised: false, windowDays, annualPct: null };
  // No measurable window means there is nothing to de-annualise against; the
  // solver's own output is all there is, and it is annual by construction.
  if (windowDays == null || windowDays <= 0) {
    return { pct: annualPct, annualised: true, windowDays: null, annualPct };
  }
  if (windowDays >= MIN_ANNUALISE_DAYS) {
    return { pct: annualPct, annualised: true, windowDays, annualPct };
  }
  return {
    pct: totalReturnFromXirr(annualPct, windowDays),
    annualised: false,
    windowDays,
    annualPct,
  };
}

export function xirrPct(flows: DatedFlow[]): number | null {
  const r = xirr(flows);
  return r == null ? null : r * 100;
}

/** XIRR over dated flows plus a terminal market value at `asOf`. */
export function xirrWithTerminal(flows: DatedFlow[], terminalValue: number, asOf: Date): number | null {
  if (!flows.length || !(terminalValue > 0)) return null;
  return xirrPct([...flows, { date: asOf, amount: terminalValue }]);
}

/**
 * A pooled money-weighted return where each account CLOSES ON ITS OWN AS-OF.
 *
 * `xirrWithTerminal` takes one terminal date, which is right for one account and
 * wrong for a pool of them. This book's statements do not share a report date —
 * Green Lantern values at 25 June, the others at 10 July — so closing everything
 * on the newest date credits Green Lantern's ₹11.69 Cr with fifteen days of
 * standing still. Over a quarter's window that is not a rounding difference: it
 * drags the annualised pool rate down by several points against the same
 * accounts measured individually, and neither figure is wrong on its own terms,
 * which is exactly why two pages showed two numbers for one book.
 *
 * Each account therefore contributes ONE terminal inflow dated at the moment its
 * value was actually measured, and the solver sees the whole set at once. That is
 * what a money-weighted return means: every cash flow at the date it happened.
 *
 * Accounts with no flows or no positive terminal value are skipped by the CALLER,
 * not silently here — see `/performance`, which names each excluded account. This
 * function will not invent a stake it was not given.
 */
export function pooledXirr(
  parts: { flows: DatedFlow[]; terminalValue: number; asOf: Date }[],
): number | null {
  const usable = parts.filter((p) => p.flows.length && p.terminalValue > 0);
  if (!usable.length) return null;
  const all: DatedFlow[] = [];
  for (const p of usable) {
    all.push(...p.flows);
    all.push({ date: p.asOf, amount: p.terminalValue });
  }
  return xirrPct(all);
}

/** Pooled XIRR across fund commitments: capital called at first investment → value today. */
export function fundXirr(funds: FundInvestment[], asOf: Date): XirrResult {
  if (!funds.length) return NONE;
  const flows: DatedFlow[] = [];
  let dated = 0;
  for (const f of funds) {
    if (!f.firstInvest || !(f.drawn > 0)) continue;
    dated++;
    flows.push({ date: new Date(f.firstInvest), amount: -f.drawn });
    flows.push({ date: asOf, amount: f.distributed + f.currentValue });
  }
  return { pct: dated ? xirrPct(flows) : null, dated, total: funds.length };
}

/**
 * Dated outflow schedule for the startup book, parsed from the private workbook.
 * Amounts are INR, like everything else in the model — the sheet states crore and
 * the loader normalises.
 */
export type StartupSchedule = {
  outflows: DatedFlow[];   // every dated cheque, negative
  companies: number;       // companies contributing flows
  followOns: number;       // follow-on cheques carrying their own date
  undatedCapital: number;  // INR the sheet records without a date, placed at first investment
};

/**
 * Pooled XIRR across the startup book.
 *
 * With a schedule (from the workbook's follow-on columns) this is a true
 * multi-flow XIRR. Without one — the audit sheet isn't reachable — it falls back
 * to one dated cheque per company, which is the same calculation over coarser
 * dates rather than a different one.
 */
export function startupXirr(startups: StartupInvestment[], asOf: Date, schedule?: StartupSchedule | null): XirrResult {
  if (!startups.length) return NONE;
  const fairValue = startups.reduce((s, x) => s + x.fairValue, 0);
  if (schedule && schedule.outflows.length) {
    return {
      pct: xirrWithTerminal(schedule.outflows, fairValue, asOf),
      dated: schedule.companies,
      total: startups.length,
    };
  }
  const flows: DatedFlow[] = [];
  let dated = 0;
  for (const s of startups) {
    if (!s.investDate || !(s.invested > 0)) continue;
    dated++;
    flows.push({ date: new Date(s.investDate), amount: -s.invested });
  }
  return { pct: dated ? xirrWithTerminal(flows, fairValue, asOf) : null, dated, total: startups.length };
}
