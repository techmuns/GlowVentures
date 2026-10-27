/**
 * ── PORTFOLIO MONITOR'S HOLDING COLUMNS, ON ANY SET OF HOLDINGS ─────────────
 *
 *   *"add invested on date column in this returns section in the morning CIO
 *    page, and also add average cost and all of those columns as well … all
 *    the important columns that the client might want to see in the portfolio
 *    monitor, they should be able to select and see them in the morning CIO
 *    returns page as well."*
 *
 * A line of Morning CIO's attribution is a set of current holdings: a
 * category, a security clubbed across accounts, or one account's part of
 * either. These are the Monitor's own figures over that set, struck with the
 * Monitor's own helpers, so the two screens cannot state one holding two ways:
 *
 *   • PER UNIT — Qty, Avg cost, CMP — only where the set is ONE security.
 *     Units of different securities do not add, and a blend of their prices is
 *     a price no statement printed. Within one security the Monitor's rules
 *     hold: a count over every line or none (`totalQuantity`), cost struck over
 *     the units it covers (`costedFigures`), one mark or none (`commonMark`).
 *   • MONEY — the purchase cost of what is held, unrealised and realised P&L —
 *     struck holding by holding, so the rows add to the total on every axis. A
 *     whole mandate's capital, fees and income stay where they are measured:
 *     the attribution's own Gain / loss. A holding whose sale record is
 *     unverified is left out of the realised sum and named, never allowed to
 *     void every other holding's.
 *   • THE DAY'S MOVE over the set's live holdings, held to one session
 *     (`dayMoveOf`, `daySessionGate`).
 *   • INVESTED ON — `investedOnOf`, a date only where every holding is dated;
 *     a set that is whole PMS accounts is dated by the accounts
 *     (`accountInvestedOn`), never by the manager's purchases inside them.
 *   • SECTOR and WHO HOLDS IT, named where there is one, counted where several.
 */
import type { Position } from "./types";
import { totalQuantity } from "./analytics";
import { costedFigures, commonMark, markKey, splitMarkReason, VACUOUS_COST_REASON, type CostedFigures } from "./clubbedFigures";
import { fifoTotals } from "./fifo";
import { dayMoveOf, dayMoveLeftNote, type DayMove } from "./quotes";
import { accountInvestedOn, investedOnOf, investmentDateMissingReason, type InvestedOn } from "./investedOn";

export type LineHoldingFigures = {
  securities: number;
  quantity: number | null;
  avgCost: number | null;
  price: number | null;
  /** Why each per-unit figure is absent; null where it is shown. */
  quantityReason: string | null;
  avgCostReason: string | null;
  priceReason: string | null;
  cost: CostedFigures;
  /** Null where nothing in the set reports a cost, or it is `vacuous`. */
  costReason: string | null;
  unrealised: number | null;
  /**
   * Σ each holding's own FIFO realised gain, over the holdings that report one.
   * `fifoTotals` over the whole set voids it where ONE holding's sale record is
   * unverified; summed holding by holding, that holding is left out and named.
   */
  realised: number | null;
  realisedReason: string | null;
  /** Holdings whose sale records are unverified, left out of `realised`. */
  realisedUnverified: string[];
  day: DayMove;
  dayReason: string | null;
  investedOn: InvestedOn | null;
  investedOnReason: string;
  sectors: string[];
  owners: string[];
};

export type LineHoldingOptions = {
  /** The set is these whole accounts — a mandate dated by its own money, not its manager's purchases. */
  wholeAccounts?: readonly string[] | null;
  /** The table's one trading session (`daySessionGate`). */
  inSession?: (p: Position) => boolean;
  sectorOf?: (p: Position) => string | null | undefined;
  ownerOf?: (p: Position) => string;
};

const EMPTY_REASON = "This line is a return the statements give for a whole account, with no holdings of its own on it.";

function undatedReason(ps: readonly Position[]): string {
  const undated = ps.filter((p) => !investedOnOf([p])).length;
  // A holding dated only by the review's range for its own product is dated
  // alone; the ranges of different products are never joined into one.
  return undated
    ? `${undated} of ${ps.length} holdings here carry no purchase date on record, and a row is dated only where every holding is. Choose All Securities to see each holding's date.`
    : "Some holdings here are dated only by the review's range for their own product, and ranges of different products are not joined. Choose All Securities to see each holding's date.";
}

export function lineHoldingFigures(ps: readonly Position[], opts: LineHoldingOptions = {}): LineHoldingFigures {
  const keys = new Set(ps.map((p) => p.securityKey));
  const one = keys.size === 1;
  const cost = costedFigures(ps);
  // As the Monitor: a cost of ₹0 against value held is no cost reported.
  const costNA = cost.cost === null || (cost.cost === 0 && cost.value > 0);
  const mark = commonMark(ps, markKey);
  const perUnit = !ps.length ? EMPTY_REASON : one ? null
    : `${keys.size} different securities. Their units do not add up, and no single price or average cost covers them; choose All Securities to see each one.`;
  const quantity = perUnit ? null : totalQuantity(ps);
  const avgCost = perUnit || costNA ? null : cost.avgCost;
  const day = dayMoveOf(ps, opts.inSession);
  const whole = opts.wholeAccounts?.length ? opts.wholeAccounts : null;
  const investedOn = whole ? accountInvestedOn(whole) : investedOnOf(ps);
  const sold = ps.map((p) => ({ p, realised: fifoTotals([p]).realised }));
  const booked = sold.filter((x) => x.realised !== null);
  const unverified = sold.filter((x) => x.realised === null && x.p.hprUnavailableReason).map((x) => x.p);
  return {
    securities: keys.size,
    quantity,
    avgCost,
    price: perUnit ? null : mark.price,
    quantityReason: perUnit ?? (quantity === null ? "A statement line here records no unit count, so the units held cannot be totalled." : null),
    avgCostReason: perUnit ?? (avgCost !== null ? null
      : costNA ? (cost.vacuous ? VACUOUS_COST_REASON : "No statement reports what these units cost.")
      : "A costed line records no unit count, so no cost per unit can be struck."),
    priceReason: perUnit ?? (mark.price !== null ? null : mark.marks.length > 1 ? splitMarkReason(mark.marks)
      : "No statement prints a per-unit price for this holding; it is valued as a total."),
    cost,
    costReason: !ps.length ? EMPTY_REASON : costNA ? (cost.vacuous ? VACUOUS_COST_REASON : "No statement reports what these holdings cost.") : null,
    unrealised: costNA ? null : cost.unrealised,
    realised: booked.length ? booked.reduce((s, x) => s + (x.realised as number), 0) : null,
    realisedReason: booked.length ? null : !ps.length ? EMPTY_REASON
      : unverified.length ? `The sale record is unverified: ${[...new Set(unverified.map((p) => p.hprUnavailableReason))].join("; ")}`
      : "No statement here reports a realised gain on units sold.",
    realisedUnverified: [...new Set(unverified.map((p) => p.security))].sort(),
    day,
    dayReason: !ps.length ? EMPTY_REASON : day.pct !== null ? null
      : day.liveMV > 0 ? `No measurable move today.${dayMoveLeftNote(day.left)}`
      : "No holding here has a live quote; a statement mark does not move during the day.",
    investedOn,
    investedOnReason: investedOn ? ""
      : whole ? "The statements do not establish an inception date for every account in this row."
      : !ps.length ? EMPTY_REASON : one ? investmentDateMissingReason({ positions: ps })
      // Several securities: the count, not every holding's own cause — those are on its own line.
      : undatedReason(ps),
    sectors: [...new Set(ps.map((p) => opts.sectorOf?.(p) ?? p.sector).filter((s): s is string => !!s))].sort(),
    owners: opts.ownerOf ? [...new Set(ps.map(opts.ownerOf))].sort() : [],
  };
}
