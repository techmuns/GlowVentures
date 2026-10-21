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
//                      round, so this is a genuine multi-flow XIRR — closed on
//                      the fair value's OWN valuation date, never today.
//
//   • Funds          — a fund is rated only on its OWN dated calls and dated
//                      distributions, closed on its own valuation date. Stage
//                      10fx retired the old basis — every rupee drawn put on
//                      the first-investment date and value + distributions on
//                      `new Date()` — which is a rate for flows nobody made: a
//                      call drawn in year three earned nothing in years one and
//                      two, and "today" is not the date anything was valued.
//                      A fund that does not carry those dates is not rated.
//                      (Latent: this book's `privateMarkets` is empty.)
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
 * Accounts with no flows are skipped by the CALLER, not silently here — see
 * `/performance`, which names each excluded account. This function will not
 * invent a stake it was not given.
 *
 * A REDEEMED PART STAYS (Stage 10fx). A part whose terminal value is a measured
 * ₹0 — a folio redeemed to nil — kept its calls and paybacks out of the pool
 * along with the zero, so a fund that returned its money vanished from the rate
 * that should carry its realised gain or loss. It now contributes its flows and
 * no terminal flow, as `measuredAccountsReturn` treats a sourced closing zero.
 * Only a NEGATIVE or non-finite terminal value — which no statement prints — is
 * left out.
 */
export function pooledXirr(
  parts: { flows: DatedFlow[]; terminalValue: number; asOf: Date }[],
): number | null {
  const usable = parts.filter((p) => p.flows.length && Number.isFinite(p.terminalValue) && p.terminalValue >= 0);
  if (!usable.length) return null;
  const all: DatedFlow[] = [];
  for (const p of usable) {
    all.push(...p.flows);
    if (p.terminalValue > 0) all.push({ date: p.asOf, amount: p.terminalValue });
  }
  return xirrPct(all);
}

/**
 * A fund's own dated record, where the source carries one. `FundInvestment`
 * itself carries only a first-investment date and totals, so a fund rated
 * here must supply these alongside — and none in this book does yet.
 */
export type DatedFundInvestment = FundInvestment & {
  /** Each call the family paid, dated — Σ must reproduce `drawn` within ₹1. */
  calls?: readonly { date: string; amount: number }[] | null;
  /** Each distribution, dated — Σ must reproduce `distributed` within ₹1. */
  distributions?: readonly { date: string; amount: number }[] | null;
  /** The date `currentValue` is struck on. */
  valueAsOf?: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const tiesTo = (rows: readonly { date: string; amount: number }[], total: number) =>
  rows.every((r) => ISO_DAY.test(r.date) && Number.isFinite(r.amount))
  && Math.abs(rows.reduce((s, r) => s + r.amount, 0) - total) <= 1;

/**
 * Pooled XIRR across funds, each on its OWN dated calls and distributions and
 * closed on its own valuation date (`pooledXirr`) — never on today. A fund
 * whose calls or distributions are not dated, do not reproduce its printed
 * totals, or whose value carries no date is not rated (`dated` counts the
 * rated ones). `_asOf` is kept for callers and no longer read: "today" is not
 * the date anything here was valued (Stage 10fx).
 */
export function fundXirr(funds: DatedFundInvestment[], _asOf?: Date): XirrResult {
  if (!funds.length) return NONE;
  const parts: { flows: DatedFlow[]; terminalValue: number; asOf: Date }[] = [];
  for (const f of funds) {
    if (!(f.drawn > 0) || !f.calls?.length || !f.valueAsOf || !ISO_DAY.test(f.valueAsOf)) continue;
    const dists = f.distributions ?? (f.distributed === 0 ? [] : null);
    if (!dists || !tiesTo(f.calls, f.drawn) || !tiesTo(dists, f.distributed)) continue;
    if (!Number.isFinite(f.currentValue) || f.currentValue < 0) continue;
    parts.push({
      flows: [
        ...f.calls.map((c) => ({ date: new Date(c.date), amount: -c.amount })),
        ...dists.map((d) => ({ date: new Date(d.date), amount: d.amount })),
      ],
      terminalValue: f.currentValue,
      asOf: new Date(f.valueAsOf),
    });
  }
  return { pct: parts.length ? pooledXirr(parts) : null, dated: parts.length, total: funds.length };
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
  /** The date the fair values are struck on. Without it the schedule is not rated. */
  valueAsOf?: string | null;
};

/** A startup line with the date its fair value is struck on, where the source carries one. */
export type DatedStartupInvestment = StartupInvestment & { valueAsOf?: string | null };

/**
 * Pooled XIRR across the startup book, closed on the fair value's OWN date.
 *
 * With a schedule (from the workbook's follow-on columns) this is a true
 * multi-flow XIRR. Without one it falls back to one dated cheque per company.
 * Either way the terminal is the fair value on the date it was struck —
 * `schedule.valueAsOf`, or every line's own `valueAsOf` where they agree —
 * and never `new Date()` (Stage 10fx): a fair value from the last workbook is
 * not today's, and closing it today credits the months since with standing
 * still. With no valuation date the book is not rated. `_asOf` is kept for
 * callers and no longer read. (Latent: this book carries no startups.)
 */
export function startupXirr(startups: DatedStartupInvestment[], _asOf?: Date, schedule?: StartupSchedule | null): XirrResult {
  if (!startups.length) return NONE;
  const fairValue = startups.reduce((s, x) => s + x.fairValue, 0);
  const lineDates = new Set(startups.map((s) => s.valueAsOf ?? null));
  const linesDate = lineDates.size === 1 ? [...lineDates][0] : null;
  if (schedule && schedule.outflows.length) {
    const at = schedule.valueAsOf ?? linesDate;
    if (!at || !ISO_DAY.test(at)) return { pct: null, dated: 0, total: startups.length };
    return {
      pct: xirrWithTerminal(schedule.outflows, fairValue, new Date(at)),
      dated: schedule.companies,
      total: startups.length,
    };
  }
  if (!linesDate || !ISO_DAY.test(linesDate)) return { pct: null, dated: 0, total: startups.length };
  const flows: DatedFlow[] = [];
  let dated = 0;
  for (const s of startups) {
    if (!s.investDate || !(s.invested > 0)) continue;
    dated++;
    flows.push({ date: new Date(s.investDate), amount: -s.invested });
  }
  return { pct: dated ? xirrWithTerminal(flows, fairValue, new Date(linesDate)) : null, dated, total: startups.length };
}
