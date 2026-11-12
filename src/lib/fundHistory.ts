/**
 * ── A PRIVATE FUND'S LIFE AS A TIME SERIES (client #414 / #415) ──────────────
 *
 * The Private Market page shows each fund's standing figures. The family asked to
 * see the JOURNEY: when each drawdown was called, when each distribution came
 * back, how the fund's value and money-weighted return moved over time, and the
 * return over a window they choose.
 *
 * Every figure here is read from dated records the book already carries — the
 * fund's own capital calls and distribution letters, and its statement
 * valuations (`FundDated`, built by `fundDatedRecords`). NOTHING is fabricated:
 *
 *  - The capital-flow timeline is the fund's real dated calls and distributions.
 *  - The VALUE/NAV trajectory is whatever dated valuations are on record. Today
 *    a private fund files ONE dated valuation, so the trajectory is a single
 *    point and the page renders the rest as an honest absence ("awaiting the
 *    fund's quarterly NAV statements") — it fills on its own the moment a second
 *    dated valuation lands, with no code change.
 *  - A money-weighted return over a CHOSEN window is computed only where the
 *    flows AND a valuation at each end of the window are on record. A window that
 *    starts after money was already in, or ends on a date the fund was never
 *    valued, needs an opening/closing NAV the book does not have — so it returns
 *    `{ ok: false, reason }` and the page shows `—` with that reason, never a
 *    guess. Since a fund has one valuation today, only the full inception→latest
 *    window computes; any narrower window is honestly absent until NAVs arrive.
 *
 * Pure and dependency-light so `scripts/check-pages.mjs` and a unit test can hold
 * it to these rules off the book itself.
 */
import type { FundDated, FundFlow } from "./fundReturns";
import { xirr, type DatedFlow } from "./xirr";
import { moneyWeightedReturn } from "./bucketXirr";
import { daysBetween } from "./analytics";

const iso = (d: string) => new Date(`${d}T00:00:00Z`);

/** One dated capital event: money IN (a call) or money OUT (a distribution). */
export type FlowEvent = {
  date: string;
  direction: "in" | "out";
  /** The fund's own word for it — "call", or a payout's "income" | "capital" | "equalisation". */
  kind: FundFlow["kind"];
  /** Positive rupees; `direction` carries the sign. */
  amount: number;
  label: string | null;
  accountId: string;
  /** A payout dated AFTER the fund's valuation — already inside that value, flagged so it is not double-counted. */
  afterValuation: boolean;
  /** Running totals AFTER this event, so a reader can follow paid-in and distributed down the column. */
  paidIn: number;
  distributed: number;
};

/**
 * Every dated capital event for a fund, OLDEST FIRST, with running paid-in and
 * distributed. Calls before distributions on a shared date, so the running
 * totals read in the order the money actually moved.
 */
export function fundFlowTimeline(fd: FundDated | null | undefined): FlowEvent[] {
  if (!fd) return [];
  const base = [
    ...fd.calls.map((f) => mk(f, "in", false)),
    ...fd.paidBack.map((f) => mk(f, "out", false)),
    ...fd.afterValuation.map((f) => mk(f, "out", true)),
  ].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1);
  let paidIn = 0, distributed = 0;
  return base.map((e) => {
    if (e.direction === "in") paidIn += e.amount; else distributed += e.amount;
    return { ...e, paidIn, distributed };
  });
}
const mk = (f: FundFlow, direction: "in" | "out", afterValuation: boolean) =>
  ({ date: f.date, direction, kind: f.kind, amount: f.amount, label: f.label, accountId: f.accountId, afterValuation });

/** One dated valuation of the fund: value, and the cost it was measured against. */
export type Valuation = { date: string; value: number; cost: number | null };

/**
 * The fund's dated valuations, oldest first, each folio's value summed by date.
 * Today this is ONE entry per fund; when the family supply periodic (quarterly)
 * NAV statements it becomes the series the trajectory draws.
 */
export function fundValuations(fd: FundDated | null | undefined): Valuation[] {
  if (!fd) return [];
  const byDate = new Map<string, { value: number; costs: (number | null)[] }>();
  for (const p of fd.parts) {
    const cur = byDate.get(p.valuedAt) ?? { value: 0, costs: [] };
    cur.value += p.value;
    cur.costs.push(p.cost);
    byDate.set(p.valuedAt, cur);
  }
  return [...byDate.entries()]
    .map(([date, { value, costs }]) => ({ date, value, cost: costs.some((c) => c == null) ? null : costs.reduce<number>((a, c) => a + (c ?? 0), 0) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The valuation recorded on exactly `d`, or null. */
function valueOn(vals: Valuation[], d: string): number | null {
  const hit = vals.find((v) => v.date === d);
  return hit ? hit.value : null;
}

export type PeriodIrr =
  | { ok: true; pct: number; annualised: boolean; windowDays: number; from: string; to: string }
  | { ok: false; reason: string };

/**
 * The money-weighted return over the window [from, to].
 *
 * Calls are money in (negative), distributions are money out (positive), and
 * each end of the window needs the fund's VALUE on that date:
 *  - the closing value at `to` (the terminal inflow), and
 *  - the opening value at `from` — but only if money was already in before `from`
 *    (an empty start needs no opening value).
 * Where a required valuation is not on record the window cannot be measured, and
 * the reason names the exact date and what is missing.
 */
export function periodFundXirr(fd: FundDated | null | undefined, fromISO: string, toISO: string): PeriodIrr {
  if (!fd) return { ok: false, reason: "no dated record for this fund" };
  if (!(fromISO < toISO)) return { ok: false, reason: "the start date must be before the end date" };
  const vals = fundValuations(fd);
  const flows = [...fd.calls, ...fd.paidBack, ...fd.afterValuation];

  const closing = valueOn(vals, toISO);
  if (closing == null) {
    return { ok: false, reason: vals.length
      ? `a money-weighted return needs the fund's value on ${toISO}; its only dated valuation${vals.length > 1 ? "s are" : " is"} ${vals.map((v) => v.date).join(", ")}`
      : "a money-weighted return needs the fund's value on the end date, and none is on record" };
  }

  // Money already in before the window needs an opening value at `from`; with no
  // prior flows the window opens empty and its own first flow (which may fall
  // exactly on `from`) is counted, so the inception call is never dropped.
  const priorIn = flows.filter((f) => f.date < fromISO);
  let opening = 0;
  if (priorIn.length) {
    const v = valueOn(vals, fromISO);
    if (v == null) return { ok: false, reason: `a money-weighted return over this window needs the fund's value on its start date ${fromISO}, and no valuation is on record there` };
    opening = v;
  }
  const inWindow = (f: FundFlow) => (priorIn.length ? f.date > fromISO : f.date >= fromISO) && f.date <= toISO;

  const within: DatedFlow[] = [
    ...fd.calls.filter(inWindow).map((f) => ({ date: iso(f.date), amount: -f.amount })),
    ...[...fd.paidBack, ...fd.afterValuation].filter(inWindow).map((f) => ({ date: iso(f.date), amount: f.amount })),
  ];
  const solved: DatedFlow[] = [
    ...(opening > 0 ? [{ date: iso(fromISO), amount: -opening }] : []),
    ...within,
    { date: iso(toISO), amount: closing },
  ];
  const rate = xirr(solved);
  if (rate == null) return { ok: false, reason: "the dated flows in this window do not resolve to a single money-weighted rate" };
  const windowDays = daysBetween(fromISO, toISO);
  const mw = moneyWeightedReturn(rate * 100, windowDays);
  if (mw.pct == null) return { ok: false, reason: "the window is too short to state a return" };
  return { ok: true, pct: mw.pct, annualised: mw.annualised, windowDays, from: fromISO, to: toISO };
}

/** The whole inception→latest window a fund can offer today: earliest dated event → latest valuation. */
export function fullWindow(fd: FundDated | null | undefined): { from: string; to: string } | null {
  if (!fd) return null;
  const vals = fundValuations(fd);
  const to = vals.length ? vals[vals.length - 1].date : fd.valuedAt;
  const dates = [...fd.calls, ...fd.paidBack, ...fd.afterValuation].map((f) => f.date);
  const from = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : fd.firstCall;
  return from && to ? { from, to } : null;
}

export type FundHistoryModel = {
  securityKey: string;
  timeline: FlowEvent[];
  valuations: Valuation[];
  /** True once there are at least two dated valuations — i.e. a trajectory can be drawn. */
  hasTrajectory: boolean;
  paidIn: number;
  distributed: number;
  latestValue: number | null;
  latestValuedAt: string | null;
  /**
   * Whether the fund's distributions are on record at all (`FundDated.payouts`
   * is not "unknown"). A measured nil — the fund has paid nothing back and its
   * papers say so — is a real ₹0; "unknown" means no payout record, and then the
   * distributed total and any multiple that divides by it are absent, not zero.
   */
  distributionsKnown: boolean;
  /** DPI, RVPI and TVPI (ILPA) where paid-in is positive and the inputs are known, else null. */
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  /** The default (full) window and its money-weighted return, the real inception→latest figure. */
  fullWindow: { from: string; to: string } | null;
  /** Why no dated valuation trajectory yet, in words for the absent-state's hover. */
  trajectoryNeeds: string;
};

export function fundHistoryModel(fd: FundDated | null | undefined, securityKey: string): FundHistoryModel {
  const timeline = fundFlowTimeline(fd);
  const valuations = fundValuations(fd);
  const paidIn = timeline.length ? timeline[timeline.length - 1].paidIn : 0;
  const distributed = timeline.length ? timeline[timeline.length - 1].distributed : 0;
  const latest = valuations.length ? valuations[valuations.length - 1] : null;
  const latestValue = latest ? latest.value : null;
  // "unknown" payouts means no distribution record: the distributed total and
  // DPI (which divides by it) are then absent, never a fabricated zero.
  const distributionsKnown = fd ? fd.payouts !== "unknown" : false;
  const dpi = paidIn > 0 && distributionsKnown ? distributed / paidIn : null;
  const rvpi = paidIn > 0 && latestValue != null ? latestValue / paidIn : null;
  const tvpi = dpi != null && rvpi != null ? dpi + rvpi : null;
  const trajectoryNeeds = latest
    ? `the fund's periodic NAV statements — only one dated valuation (${latest.date}) is on record, so its value and return over time cannot yet be plotted`
    : "the fund's dated NAV statements — none is on record yet, so its value and return over time cannot be plotted";
  return {
    securityKey,
    timeline,
    valuations,
    hasTrajectory: valuations.length >= 2,
    paidIn,
    distributed,
    latestValue,
    latestValuedAt: latest ? latest.date : null,
    distributionsKnown,
    dpi, rvpi, tvpi,
    fullWindow: fullWindow(fd),
    trajectoryNeeds,
  };
}
