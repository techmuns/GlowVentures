// THE FAMILY'S OWN DATED INVESTMENTS — one definition, read by both surfaces.
//
// *"VC… I invested additional 10 crores… previous amount… what was the return?
// Now this 10 crores… what it has done what's the overall portfolio return…"*
//
// Two questions about one holding: how has each separate investment done, and
// how have they done together. The second is the row the Portfolio Monitor
// already prints. This is the first — and the whole of what makes it a
// MEASUREMENT rather than an allocation is that the fund allots UNITS per
// contribution.
//
// ── WHY UNITS ARE THE WHOLE OF IT ───────────────────────────────────────────
//
// A tranche's value today is ITS OWN units at today's NAV. Split a position's
// value across its contributions by their SIZE instead and you have invented
// the answer to the question being asked: Ankita's Sanshi folio bought units at
// 100.00 in March and at 123.84 in October, so the March rupee is worth 24%
// more than the October one. A size-weighted split reports both at the same
// return — the average — which is precisely the figure the family is asking to
// see broken apart.
//
// So `BOOK_POSITION_TRANCHES` is gated in `build-book.mjs` on the allotted units
// accounting for EVERY unit held, and this module never sees a partial one. The
// two consequences are worth stating because they are what make the table
// checkable rather than merely plausible:
//
//   Σ tranche units    = the position's quantity      (the gate, by construction)
//   Σ tranche value    = the position's market value  (units × one NAV)
//   Σ tranche invested = the position's cost basis    (measured: to the paisa)
//
// The footer of this table therefore reconciles to the ROW IT EXPANDS FROM by
// construction rather than by a tolerance — the same standing the Portfolio
// Monitor's own per-category totals row has.
//
// ── THE RETURN GOES THROUGH THE SAME GUARD AS EVERY OTHER RETURN ────────────
//
// A tranche has something almost nothing else in this book has: a real purchase
// date. That makes it the one place a genuine CAGR is strikable per holding —
// and exactly the place where compounding a four-month window onto a year would
// be most tempting. It is not re-derived here: `holdingReturn` decides, so the
// guard that put +99.0% on the Morning CIO strip in Stage 10g(ii) lives in one
// place still, and `positionIrrPct` stays unread.
import type { CapitalMove, Commitment, Position, PositionTranches, ReviewFlow } from "./types";
import {
  holdingReturn, sumOrNull, RETURN_MEASURES, isValuedAtCost, commonValueDate, AT_COST_RETURN,
  type HoldingReturn, type ReturnMode, type ReturnMeasure, type MeasuredReturn,
} from "./analytics";
import { xirrPct } from "./bucketXirr";
import type { DatedFlow } from "./xirr";
import { sortRows, type TxnSort } from "./txnSort";
import { securityLabel } from "./securityLabel";
import { fifoReturnPct } from "../../shared/fifo.mjs";
import { splitFundClass } from "../../shared/securityKey.mjs";
import { fmtDate } from "./format";

export type TrancheRow = {
  move: CapitalMove;
  /** The date this money went in — a real purchase date, which is rare here. */
  date: string;
  /** What the statement called it: "Top Up", "Drawdown", "Initial Contribution". */
  label: string;
  /** Gross, as the statement prints it — what the family thinks of as "10 crores". */
  amount: number | null;
  /** What actually bought units, after the fund's own charges on that date. */
  invested: number;
  units: number;
  /**
   * DERIVED, and it reproduces the Allotment NAV the statement prints to four
   * decimals. Not read from the archive, because the extractor does not carry
   * that column — so this is the one figure on the row whose check lives in the
   * suite rather than in the data (`tranches.test.ts`).
   *
   * EXCEPT on a tranche carried through a fund's class switch, where it is per
   * unit of the class held TODAY — invested ÷ the carried units — because that
   * is the only basis on which the rows of one panel can be compared: every row
   * is valued at one class's NAV. The NAV it was BOUGHT at is `boughtNavOf`,
   * and that one is the printed figure (`carriedCost.test.ts`).
   */
  navAtEntry: number;
  /** These units at the position's own current mark. */
  value: number;
  /** Return on what this tranche actually invested. */
  returnPct: number;
  /** The date `value` is struck at — where this tranche's window ends. */
  valuedAt: string;
  /** Absolute or annualised, through the book's one guard. */
  ret: HoldingReturn;
};

export type TrancheTable = {
  rows: TrancheRow[];
  /** Summed from the ROWS, never computed beside them — see the note above. */
  units: number;
  invested: number;
  value: number;
  /** FIFO over every unit bought; null only where nothing was deployed. */
  returnPct: number | null;
  /** The position's own figures, so a caller can state the tie rather than assume it. */
  positionUnits: number;
  positionValue: number;
  positionCost: number | null;
};

/** The key `BOOK_POSITION_TRANCHES` is stored under. */
export const trancheKey = (accountId: string, securityKey: string) => `${accountId}|${securityKey}`;

/**
 * The per-contribution breakdown behind a ROW — which is one or more positions.
 *
 * ── IT TAKES THE ROW'S OWN POSITIONS, AND THAT IS NOT A CONVENIENCE ─────────
 *
 * The Portfolio Monitor's default view consolidates by security, and Sanshi
 * Class E is held by FOUR family members under one `securityKey`. So a
 * breakdown keyed on the security alone would union four folios' contributions
 * — right for that row, and wrong the moment a holding is reported twice:
 * Transition Venture Fund I sits under both family trusts as one `dedupeGroup`,
 * and the row counts it ONCE. Unioning by key would show 15,000 units against a
 * row printing 7,500, and its Invested would read double.
 *
 * Passing the positions the ROW WAS BUILT FROM — `dedupedPositions(ps)`, the
 * same set — makes that impossible by construction rather than by remembering.
 * §"consolidated counts once, per-account does not", arriving through a
 * drill-down.
 *
 * ── ALL OR NOTHING ──────────────────────────────────────────────────────────
 *
 * Every constituent must carry a breakdown or none is shown. A row whose
 * Invested spans four folios, broken down over the two that publish dated
 * contributions, is a table that ties to nothing: its footer would fall short of
 * the cell it expands from, and a reader would take the shortfall for a return.
 * That is the partial-coverage failure the ST/LT split already refuses.
 *
 * Returns null wherever that does not hold, which is the common case and not a
 * defect: 38 of 51 accounts publish no dated capital record at all. The caller
 * says so; it must not draw an empty table.
 */
export function trancheTable(
  positions: Position[],
  index: Record<string, PositionTranches>,
  mode: ReturnMode,
  /**
   * The date each position's value is struck at — `valueDateOf` with the
   * account's statement date — which is where every tranche's window ENDS.
   *
   * It was the book's newest date for every row, 29 Aug 2026 (two quantity-only
   * trust demats), so a Buoyant contribution held 364 days to its 31 Jul
   * valuation was annualised as though it had crossed a year, and Sanshi's
   * three annualised tranches read +39.50 / +38.34 / +44.11% where their own
   * windows give +45.61 / +45.66 / +51.72%.
   */
  valueDate: (p: Position) => string | null,
): TrancheTable | null {
  if (!positions.length) return null;

  const rows: TrancheRow[] = [];
  let positionUnits = 0, positionValue = 0;
  let positionCost: number | null = 0;
  // What the units already SOLD out of these positions realised, and what they
  // cost — FIFO's other half. The rows are the lots still held, so without this
  // the footer would be a return on the survivors, which is the defect the
  // whole book was moved to FIFO to end.
  let realised = 0, costSold = 0;
  for (const p of positions) {
    const tr = index[trancheKey(p.accountId, p.securityKey)];
    if (!tr || !tr.moves.length) return null;
    // A position marked at a total with no unit count cannot price a tranche —
    // there is no per-unit figure to multiply.
    const pq = p.quantity;
    if (pq === null || !(pq > 0)) return null;
    // A value with no date cannot close a window — refuse rather than guess one.
    const end = valueDate(p);
    if (!end) return null;
    const navNow = p.marketValue / pq;
    for (const m of tr.moves) {
      // Both are required for a tranche to be a measurement at all. A move with
      // units and no `invested` is a contribution whose gross the statement
      // never printed (see `capitalMovesFrom`); it is not valued at zero.
      if (m.units == null || m.invested == null || m.invested <= 0) return null;
      const value = m.units * navNow;
      const returnPct = ((value - m.invested) / m.invested) * 100;
      rows.push({
        move: m, date: m.date, label: m.label, amount: m.amount,
        invested: m.invested, units: m.units,
        // What BOUGHT the units over the units it bought. `invested` is every
        // rupee paid (VD-24) and the statement's own charges on that
        // contribution were not unit-buying money, so they come back out here —
        // a stamp duty does not move a unit price.
        navAtEntry: (m.invested - (m.charges ?? 0)) / m.units,
        value, returnPct, valuedAt: end,
        // This tranche's OWN contribution date, which is the whole reason a
        // tranche can annualise where the position around it cannot.
        ret: holdingReturn({ returnPct, heldSince: m.date, valuedAt: end }, mode, end),
      });
    }
    positionUnits += pq;
    positionValue += p.marketValue;
    realised += typeof p.realizedPnL === "number" && Number.isFinite(p.realizedPnL) ? p.realizedPnL : 0;
    costSold += typeof p.costOfUnitsSold === "number" && Number.isFinite(p.costOfUnitsSold) ? p.costOfUnitsSold : 0;
    positionCost = positionCost === null || p.costBasis === null ? null : positionCost + p.costBasis;
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

  const units = rows.reduce((a, r) => a + r.units, 0);
  const invested = rows.reduce((a, r) => a + r.invested, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  return {
    rows, units, invested, value,
    // The position's own FIFO return: every lot still held, plus what the lots
    // already sold realised, over every rupee that bought a unit.
    // Never `?? 0`: a return nobody could strike is not a flat one.
    returnPct: fifoReturnPct(value, invested, realised, costSold),
    positionUnits, positionValue, positionCost,
  };
}

// ── A COST CARRIED THROUGH A FUND'S CLASS SWITCH, AND WHAT TO SAY ABOUT IT ──
//
// *"The user does not believe this data."* Buoyant moved both family folios
// from Class A1 into Class A4 and booked each switch as a redemption and an
// allotment at the switch-day NAV, so its statements print a "cost" that
// restarts at that day's value — ₹72.5 Cr, against ₹70.9 Cr the family
// actually paid. `build-book` now carries what was PAID through the switch
// (`costBasisSource: "carried-through-switch"`) and keeps the statement's own
// figure beside it as `printedCostBasis`, a CHECK and never a source.
//
// A reader who knows the fund's statement will see two figures for one thing,
// so the page has to say which is which — and it must say it the same way on
// every surface, which is why the facts are gathered here once. Everything is
// READ off the book (the position's two figures, and each carried tranche's
// own `carriedFrom`), never re-derived: a second derivation of the carry is a
// second chance for the Portfolio Monitor and the company page to disagree.

/** One class switch the carried money went through. */
export type ClassSwitch = {
  /** The unit class the money was bought in — `A1`, or the full name where no class is printed. */
  fromClass: string;
  /** The class it is held in today. */
  toClass: string;
  /** The date the fund moved it. */
  on: string;
};

export type CarriedCost = {
  /** What the family paid, carried through the switch — the book's own cost. */
  paid: number;
  /** What the statements print instead: the cost restated at the switch-day NAV. */
  printed: number;
  /** Every switch behind the row, oldest first. */
  switches: ClassSwitch[];
};

const classOf = (security: string | null | undefined): string | null =>
  security ? (splitFundClass(security)?.cls ?? null) : null;

/**
 * The carried cost behind a ROW — one or more positions — or null where no
 * constituent's cost was carried.
 *
 * Summed over the constituents that REPORT a cost, on both sides, so `paid` is
 * exactly the row's own Invested figure and `printed` is what that same set
 * would read on the statements' basis. A constituent with no cost is in
 * neither: `sumOrNull`'s rule, and the only way the two stay comparable.
 */
export function carriedCostOf(ps: Position[], index: Record<string, PositionTranches>): CarriedCost | null {
  if (!ps.some((p) => p.costBasisSource === "carried-through-switch")) return null;
  let paid = 0, printed = 0;
  const seen = new Map<string, ClassSwitch>();
  for (const p of ps) {
    if (p.costBasis === null) continue;
    paid += p.costBasis;
    printed += p.printedCostBasis ?? p.costBasis;
    if (p.costBasisSource !== "carried-through-switch") continue;
    const toClass = classOf(p.security) ?? p.security;
    for (const m of index[trancheKey(p.accountId, p.securityKey)]?.moves ?? []) {
      if (!m.carriedFrom) continue;
      const fromClass = classOf(m.carriedFrom.security) ?? m.carriedFrom.security ?? "an earlier class";
      const k = `${fromClass}|${toClass}|${m.carriedFrom.switchedOn}`;
      if (!seen.has(k)) seen.set(k, { fromClass, toClass, on: m.carriedFrom.switchedOn });
    }
  }
  return {
    paid, printed,
    switches: [...seen.values()].sort((a, b) => a.on.localeCompare(b.on) || a.fromClass.localeCompare(b.fromClass)),
  };
}

/**
 * WHY THIS INVESTED FIGURE IS NOT THE ONE THE FUND'S STATEMENT PRINTS.
 *
 * The facts are `carriedCostOf`'s, read off the book; this only words them.
 * The gap is named by its SIGN, never assumed to be a gain: a switch made
 * after a fall restates the cost DOWNWARDS, and calling that "growth" would
 * be a sentence the arithmetic beside it contradicts.
 */
export function carriedCostNote(c: CarriedCost, money: (v: number) => string): string {
  const moves = new Map<string, string[]>();
  for (const x of c.switches) {
    const k = `Class ${x.fromClass} into ${x.toClass}`;
    (moves.get(k) ?? moves.set(k, []).get(k)!).push(fmtDate(x.on));
  }
  const how = [...moves].map(([k, ds]) => `${k} on ${ds.join(" and ")}`).join("; ");
  const gap = c.printed - c.paid;
  return `This is what was PAID IN. The fund moved this holding from ${how} and booked each move as a sale and a `
    + `fresh purchase at that day's NAV, so its statements print the cost as ${money(c.printed)}. `
    + `The ${money(Math.abs(gap))} between the two is the ${gap >= 0 ? "growth" : "fall in value"} the fund booked at the switch; `
    + `the switch itself moved no money in or out.`;
}

/**
 * A COST ON THE GROSS-PAID BASIS (VD-24): every rupee the family paid in, where
 * the fund's statement costs the units at what bought them — its contributions
 * LESS the stamp duty and charges it prints against them. `build-book` restates
 * it (`grossPaidCost`) only where the net and the charges add to the paid figure
 * to the paisa, and keeps the statement's net as `printedCostBasis`.
 *
 * Summed over the constituents that REPORT a cost, on both sides, exactly as
 * `carriedCostOf` is, so `paid` is the row's own Invested figure. Null where no
 * constituent's cost is on this basis.
 */
export type GrossPaidCost = {
  /** Every rupee paid in — the book's own cost. */
  paid: number;
  /** What the statements print instead: the net that bought units. */
  printed: number;
  /** The stamp duty and charges between the two. */
  charges: number;
};

export function grossPaidOf(ps: Position[]): GrossPaidCost | null {
  if (!ps.some((p) => p.costBasisSource === "gross-paid")) return null;
  let paid = 0, printed = 0;
  for (const p of ps) {
    if (p.costBasis === null) continue;
    paid += p.costBasis;
    printed += p.printedCostBasis ?? p.costBasis;
  }
  return { paid, printed, charges: paid - printed };
}

/**
 * WHY THIS INVESTED FIGURE IS A LITTLE ABOVE THE ONE THE STATEMENT PRINTS. The
 * charges are a few thousand rupees on crores, so a compact figure would print
 * both costs identically: `exact` prints the two that differ in full.
 */
export function grossPaidNote(g: GrossPaidCost, exact: (v: number) => string): string {
  return `This is every rupee PAID IN, stamp duty and charges included: ${exact(g.paid)}. `
    + `The fund's statements cost these units at ${exact(g.printed)} — what bought units after the `
    + `${exact(g.charges)} of stamp duty and charges they print against the same contributions. `
    + `The book counts what was paid, the basis Helios, Active Momentum, Founders and Delphi print.`;
}

/**
 * The per-unit price a CARRIED tranche was bought at, in the class it was
 * bought in — the Allotment NAV the statement prints. Null on a tranche that
 * was bought in the class it is held in, whose `navAtEntry` already is that.
 */
export const boughtNavOf = (t: TrancheRow): number | null =>
  t.move.carriedFrom && t.move.carriedFrom.units > 0 ? t.invested / t.move.carriedFrom.units : null;

// ── WHAT THE FAMILY DID, PER MANDATE AND PER FUND ───────────────────────────
//
// *"these are five six transactions I executed… how have I executed lumpsum or
// through a staggered investment… I want to see it like that."*
//
// One line per account, because an account IS the decision: the family chose a
// manager and funded them. Whether that funding was one payment or several is a
// COUNT of dated contributions rather than a pattern anybody has to detect —
// the same reasoning `txnRollup`'s `staggered` label rests on, and here it is
// simpler still: one contribution is a lumpsum, more than one is not.

export type CapitalGroup = {
  /**
   * WHAT THIS ROW IS, uniquely. The account id for every statement account; for
   * one of the review's holder buckets (`Account.reviewHolder`) the account and
   * the line, `<accountId>|<securityKey>`, because each line there is a
   * separate investment with its own dated purchases (Stage 10dh).
   */
  key: string;
  accountId: string;
  /**
   * The ONE holding this row is, where it is a line of a review holder bucket.
   * Null on every account-level row, including an account that holds one line.
   */
  securityKey: string | null;
  /** The mandate or fund as the app names it elsewhere. */
  label: string;
  provider: string;
  accountNo: string;
  owner: string;
  moves: CapitalMove[];
  /**
   * Where the dated purchases came from: the family's capital record, the
   * fund's own dated calls, or — for an account whose holdings the family's
   * consolidated review values (Stage 10dh) — the review's own Transactions
   * sheet, which dates every purchase, sale and income row behind its lines.
   */
  source: "record" | "calls" | "review";
  contributions: number;
  withdrawals: number;
  /** PURCHASE — money the family put in, gross, as each statement prints it. */
  paidIn: number;
  /** The DATED part of what came back: Σ of the redemption movements in view. */
  tookOut: number;
  /**
   * REDEMPTION — everything that came back to the family, dated or not. A fund
   * whose statement prints its payouts only as one total (Neo Infra's ₹49.5 L)
   * contributes that total here and no dated movement.
   *
   * NULL WHERE NOTHING SAYS, and that is not zero. Twelve drawdown funds print no
   * distribution line at all, and reading one as nil reports a fund that has
   * paid back nothing when its statement does not say — `capitalCalls.ts`'s
   * own rule, arriving through a column.
   */
  redemption: number | null;
  /** A payout the statement prints only as a total, with no date. Null where there is none. */
  undatedOut: number | null;
  /** What the family promised this fund, where it is a drawdown fund. Null otherwise. */
  committed: number | null;
  /** ...and how much of that promise is still to be called, as its statement prints it. */
  undrawn: number | null;
  /**
   * The dated span of EVERY movement in view, both directions — what the table
   * is ORDERED on ("recent first" means the latest movement of either kind).
   */
  first: string;
  last: string;
  /**
   * ...and the span of the PURCHASES in view alone, which is what "Purchased on"
   * states (MT-8). Taken over both directions it read "16 Jan 2025 → 25 Jun
   * 2026" on an account funded once, the second date a TDS-sized outflow, and
   * ran 3P's to the day of its redemption. Empty where no purchase is in view.
   */
  boughtFirst: string;
  boughtLast: string;
  /** More than one dated contribution. A fact about the count, not a judgement. */
  staggered: boolean;
  /**
   * What the account is worth today, from the book. NULL where the account holds
   * no position at all — an angel folio or a fund that publishes no NAV — which
   * is not the same as the MEASURED ₹0 of a fund redeemed to nil units.
   */
  value: number | null;
  /** The report date that value is struck at — the terminal date of the XIRR. */
  valueAsOf: string | null;
  /**
   * TRUE WHERE SOME OF THAT VALUE IS A COST, NOT A VALUATION — a line the
   * family's consolidated review holds at what was paid (`valuedAtCost`). The
   * value is real money and still shown; no gain or return is struck on it.
   */
  atCost: boolean;
  /**
   * ── APPRECIATION — value today plus what came back, less what went in ────
   *
   * THIS IS THE FIGURE THE OLD "NET INVESTED" GOT WRONG ONE STEP EARLIER.
   * Net invested was paid-in less taken-out, and what comes back out of a fund
   * is PRINCIPAL PLUS GAIN: 3P was bought for ₹28.5 Cr and redeemed for
   * ₹31.06 Cr, so "net invested" read −₹2.56 Cr — the appreciation, subtracted
   * from the principal, and every return struck on it wrong with it. A
   * redemption is never subtracted from a purchase here. The two sit in their
   * own columns and appreciation is struck from all three:
   *
   *     Purchase − Redemption + Appreciation = Value today      (by construction)
   *
   * Published only where every term is a measurement: the record reaches
   * inception, what came back is stated, the account is valued, and no filter
   * is narrowing the record to part of itself.
   */
  appreciation: number | null;
  /** The part of it that has turned into cash — or into the cost of what is held. */
  realised: number | null;
  /** The part still on paper: value today less what the units still held cost. */
  unrealised: number | null;
  /** Why appreciation is withheld. Null where it is published. */
  appreciationReason: string | null;
  /** Why realised is withheld, or — where it is a computed zero — why it is zero. */
  realisedNote: string | null;
  /** Why unrealised is withheld, or what it is struck against where it is shown. */
  unrealisedNote: string | null;
  /**
   * The dated flows a money-weighted return is solved over — purchases negative,
   * dated redemptions positive — or NULL where they are not all dated (an undated
   * payout) or not the whole record. The terminal value is added by the caller.
   */
  flows: { date: string; amount: number }[] | null;
  /** Why no return can be struck, in words. Null where one can. */
  incompleteReason: string | null;
  /** True where a side filter is narrowing this row's movements. */
  sideFiltered: boolean;
  /** True where a DATE filter is narrowing this row's movements. */
  windowed: boolean;
};

/**
 * WHICH MOVEMENTS ARE IN VIEW.
 *
 * *"When I'm clicking on buy filter it should show only the buy transactions.
 * When I'm clicking on sell filter it should show only the sell transaction.
 * But nothing on the page is changing when I'm clicking either of the
 * filters."* The control existed and its value was never passed to this view —
 * so it moved the counter beside it, which reads the manager's TAPE, while the
 * table under it did not move at all.
 *
 * A family movement has no buy and no sell. It has money in (a subscription)
 * and money out (a redemption), which is the same distinction under the words
 * the columns already use — so the CALLER supplies the vocabulary and this
 * takes the direction.
 */
export type CapitalSide = "all" | "in" | "out";

/**
 * DOES THE DATED RECORD REACH THE DATE THE VALUE IS STRUCK ON?
 *
 * The other end of the same question `contributionsAreComplete` asks about the
 * start. A return compares the capital with a value, and the value is struck on
 * the account's own statement date; a record that stops before that date has
 * not seen what moved in between, so a return on it divides a value by capital
 * drawn at a different moment. Green Lantern 510861 is the case: its dated
 * record is a quarterly investor report ending 30 June, and its holdings are
 * struck on 27 July — ₹6,350 of withdrawals in between are in no dated row.
 *
 * ONE DEFINITION, read by `capitalRollup` for every account whose purchases are
 * its own capital RECORD — the Transactions card, the mandate page and the
 * Portfolio Monitor's money-weighted rows (`datedCapital.ts`) all go through it,
 * so no two can disagree about which accounts' dated records are whole. A
 * drawdown fund's CALL list is not held to it: its calls and payouts are read
 * off the statement the value is struck on and reconciled against that
 * statement's own totals (`callsIfTheyTie`), so they reach its date by
 * construction. Null where the record reaches; otherwise the reason.
 */
export function recordShortfall(a: { asOf?: string | null; capitalRecordTo?: string | null } | undefined): string | null {
  if (!a?.asOf) return "the account carries no statement date for its value, so there is nothing for the record to reach";
  if (a.capitalRecordTo && a.capitalRecordTo >= a.asOf) return null;
  return `this dated record ends ${a.capitalRecordTo ?? "before the account's statement date"}, before the ${a.asOf} statement its value is struck on, so what moved in between is not in it — the return on the capital the manager's own statement prints is on the Holdings table`;
}

/**
 * ── DOES THE REVIEW'S DATED RECORD DESCRIBE THE MONEY IN ITS VALUE? ─────────
 *
 * For a line the family's consolidated review values (Stage 10dh) the dated
 * record is the review's own Transactions sheet, and the questions a capital
 * record is asked — does it reach inception, does it reach the value's date —
 * become three the review's own rows can answer:
 *
 *   • IS THERE A VALUE TO MEASURE AGAINST? A line held at cost has a value that
 *     IS its cost, so any gain struck on it is a zero nobody measured.
 *   • DO THE PURCHASES ADD UP TO THE COST? The review carries a line at what was
 *     paid less what a sale returned, so the dated purchases less the dated sale
 *     proceeds must reproduce that cost to the rupee — or the two sides of a
 *     return describe different money (a purchase missing from the sheet).
 *   • IS EVERY ROW ON OR BEFORE THE VALUE'S DATE? A row after it is money the
 *     value cannot hold.
 *
 * Null where a return can be struck; otherwise the reason, true of this line.
 */
function reviewShortfall(own: readonly Position[], all: readonly CapitalMove[], valueAsOf: string | null): string | null {
  const ins = all.filter((m) => m.direction === "in");
  if (!ins.length) return "the family's consolidated review prints no dated purchase for this line, so there is nothing to measure a return against";
  if (!own.length) return "the family's consolidated review dates purchases for this line but carries no holding of it in the book, so there is no value to measure them against";
  if (own.every(isValuedAtCost)) return AT_COST_RETURN;
  if (own.some(isValuedAtCost)) {
    return "part of this is held at cost: the family's consolidated review records what was paid for it and no valuation, so a return over the whole would blend a gain nobody measured";
  }
  if (!valueAsOf) {
    return "the holdings behind this row are valued on different dates, so there is no one date to close a return on";
  }
  const bought = ins.reduce((t, m) => t + (m.amount ?? 0), 0);
  const sold = all.filter((m) => m.direction === "out" && m.payoutKind === "capital").reduce((t, m) => t + (m.amount ?? 0), 0);
  const cost = own.reduce((t, p) => t + (p.costBasis ?? Number.NaN), 0);
  if (!Number.isFinite(cost) || Math.abs(bought - sold - cost) > 1) {
    return "the review's dated purchases less its sale proceeds do not add up to the cost it carries for this line, so a purchase may be missing from its dated rows — and a return would set one sum of money against the value of another";
  }
  const late = all.find((m) => m.date > valueAsOf);
  if (late) {
    return `the review dates a ${late.direction === "in" ? "purchase" : late.payoutKind === "capital" ? "sale" : "payment"} on ${late.date}, after the ${valueAsOf} value it carries for this line, so that value would not hold it`;
  }
  return null;
}

/**
 * IS THE CONTRIBUTION HISTORY THE WHOLE OF WHAT WAS PAID IN?
 *
 * A return needs the denominator to be complete, and "the statement listed some
 * contributions" does not establish that. Three things do, and each is evidence
 * the documents themselves carry rather than an assumption about them:
 *
 *   • every position in the account has a unit-tied breakdown — the allotted
 *     units account for every unit held, so nothing was bought by money this
 *     history does not contain; or
 *   • the account's own printed INCEPTION DATE is on or after the first
 *     contribution — the statement saying its record starts where the account
 *     does; or
 *   • the purchases are a drawdown fund's OWN dated calls and they reproduce the
 *     total its statement prints as called — `callsIfTheyTie` published no
 *     schedule that did not, so a call list IS the whole of what was drawn.
 *
 *   • the statement's own RUNNING UNIT BALANCE starts from zero on every class's
 *     first allotment (`BOOK_CAPITAL_FROM_INCEPTION`) — which is what lets 3P,
 *     redeemed in full and so with no unit-tied breakdown left to check, carry
 *     the return the family asked about.
 *
 * An account meeting none keeps its figures and loses its return, with the
 * reason on the cell.
 */
export function contributionsAreComplete(
  accountId: string,
  moves: CapitalMove[],
  positions: Position[],
  index: Record<string, PositionTranches>,
  inceptionDate: string | null | undefined,
  commitment?: Pick<Commitment, "called" | "paid" | "drawn"> | null,
  fromInception = false,
): string | null {
  const ins = moves.filter((m) => m.direction === "in");
  const firstIn = ins.map((m) => m.date).sort()[0];
  if (!firstIn) return "no dated contribution is reported for this account, so there is nothing to measure a return against";
  // The statement's own running unit balance starts from zero on every class's
  // first allotment — `BOOK_CAPITAL_FROM_INCEPTION`, measured in build-book.
  if (fromInception) return null;
  if (ins.length > 0 && ins.every((m) => m.fromCall)) {
    const printed = commitment?.called ?? commitment?.drawn ?? commitment?.paid ?? null;
    const sumCalls = ins.reduce((a, m) => a + (m.amount ?? 0), 0);
    if (printed != null && Math.abs(printed - sumCalls) < 1) return null;
    return "the fund's dated calls do not add up to the capital its statement says it has called, so the list of purchases may be partial";
  }
  const own = positions.filter((p) => p.accountId === accountId);
  if (own.length > 0 && own.every((p) => index[trancheKey(p.accountId, p.securityKey)])) return null;
  if (inceptionDate && inceptionDate >= firstIn) return null;
  return "the statements report these contributions but do not say the list reaches inception, so what was paid in "
    + "may be understated — and a return struck on a partial cost overstates itself by everything it missed";
}

/**
 * ── THE DRAWDOWN FUNDS' OWN DATED CALLS, AS PURCHASES ───────────────────────
 *
 *   *"we need to show committed amount and the purchase amount."*
 *
 * Eleven accounts publish a dated capital record (`BOOK_CAPITAL_MOVES`). Thirteen
 * more are drawdown funds whose statements print every call dated — Baring,
 * Carnelian Amritkaal, Delphi, both Founders folios, Neo Infra, India SME ×3, Sky
 * Capital ×4 — and that record reached no transaction table. A call the family
 * paid IS a purchase: it is the money that bought the fund's units, on its date.
 *
 * ONE RECORD PER ACCOUNT, NEVER BOTH. An account that already publishes a
 * capital record keeps it and its calls are NOT added — the two Transition
 * Venture trusts publish both, for the same ₹75 L each, and adding the call to
 * the record would double what they paid. The record wins because it carries
 * units and charges and the call list does not.
 *
 * Only a call schedule that reproduced its statement's own total was ever
 * published (`callsIfTheyTie`), so there is no partial list to be misled by.
 */
/**
 * THE DATES A DRAWDOWN FUND CALLED THE MONEY THAT BOUGHT ONE HOLDING — keyed on
 * the holding (`trancheKey`), for "Invested on".
 *
 * A drawdown fund's statement dates each call and never an allotment, so its
 * folio has no per-contribution breakdown (a call carries no unit count). Its
 * calls are still the dates this holding's money went in, but only where three
 * things hold, each read off the book:
 *
 *   • the account carries ONE line with money in it, and it is the fund's units
 *     (an AIF). Then the calls bought exactly that holding. An account's
 *     funding date standing in for a share a manager bought inside it is the
 *     case `investedOnOf` refuses, and this gate is what keeps it out;
 *   • the statement's own paid-in covers every call it lists, within a rupee,
 *     so no date here is a call the family has not paid yet;
 *   • nothing is printed as called and still unpaid (`pending`).
 *
 * The call list itself was published only where it reproduced the statement's
 * own called total (`callsIfTheyTie`), so a date here is never one of part of a
 * schedule.
 */
export function callDatesByHolding(
  commitments: readonly Commitment[],
  positions: readonly Position[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of commitments) {
    const calls = (c.calls ?? []).filter((x) => !!x.date && x.amount > 0);
    if (!calls.length) continue;
    const withMoney = positions.filter((p) => p.accountId === c.accountId
      && (p.marketValue !== 0 || (p.costBasis ?? 0) !== 0));
    if (withMoney.length !== 1 || withMoney[0].assetClass !== "AIF") continue;
    const called = calls.reduce((a, x) => a + x.amount, 0);
    if (c.paid == null || c.paid + 1 < called || (c.pending ?? 0) > 0) continue;
    out.set(trancheKey(c.accountId, withMoney[0].securityKey), calls.map((x) => x.date).sort());
  }
  return out;
}

export function capitalMovesWithCalls(
  moves: CapitalMove[],
  commitments: Commitment[],
  accounts: readonly { accountId: string; asOf?: string | null }[],
  /**
   * ── THE REVIEW'S DATED ROWS, IN PLACE OF THE STATEMENT'S (Stage 10dh) ─────
   *
   * At the family's instruction their consolidated review (MOPWM) is the
   * source for private-market holdings, and its Transactions sheet dates every
   * purchase, sale and income row behind each line (`BOOK_REVIEW_FLOWS`). An
   * account carrying any of them is dated by the review and by nothing else:
   * its statement record, calls and payouts describe the statement's holding,
   * which the review's line replaced in the book, and mixing the two would
   * value one document's money against the other's. `build-book` refuses a
   * book where such an account holds a statement line with money beside the
   * review's, so nothing the statement dated is left without a home.
   *
   * REQUIRED, not optional: a caller that forgot it would quietly date a
   * review-valued account by the statement it replaced.
   */
  reviewFlows: readonly ReviewFlow[],
): CapitalMove[] {
  const reviewed = new Set(reviewFlows.map((f) => f.accountId));
  const kept = moves.filter((m) => !reviewed.has(m.accountId));
  const recorded = new Set(kept.map((m) => m.accountId));
  const valuedAt = new Map(accounts.map((a) => [a.accountId, a.asOf ?? null]));
  const out = [...kept];
  for (const f of reviewFlows) {
    out.push({
      accountId: f.accountId, date: f.date,
      direction: f.kind === "purchase" ? "in" : "out",
      // The review's own word for the row, never ours.
      label: f.kind === "purchase" ? "Purchase" : f.kind === "sale" ? "Sale" : "Div / Int",
      amount: f.amount,
      // The review prints one figure for a purchase — what was paid — and no
      // charges, so what bought units is that figure.
      invested: f.kind === "purchase" ? f.amount : null,
      units: f.units == null ? null : f.kind === "purchase" ? f.units : f.kind === "sale" ? -f.units : null,
      security: f.security, securityKey: f.securityKey,
      fromReview: true,
      // A sale returns capital; Div / Int is gain paid out. Typed so the split
      // below can be struck on the review's own rows.
      ...(f.kind === "sale" ? { payoutKind: "capital" as const } : f.kind === "income" ? { payoutKind: "income" as const } : {}),
    });
  }
  for (const c of commitments) {
    if (reviewed.has(c.accountId)) continue;
    const hasRecord = recorded.has(c.accountId);
    for (const call of hasRecord ? [] : c.calls ?? []) {
      if (!call.date || !(call.amount > 0)) continue;
      out.push({
        accountId: c.accountId, date: call.date, direction: "in",
        label: call.label || "Capital call", amount: call.amount,
        // What bought units after the fund's charges is not printed per call,
        // and no unit count rides with a call either. Null, never the amount.
        invested: null, units: null, security: null, securityKey: null,
        fromCall: true,
      });
    }
    /**
     * ── AND THE FUND'S OWN DATED PAYOUTS, AS REDEMPTIONS (Stage 10cd) ──────
     *
     * Stage 10bw read every payout Neo Infra and Baring print — income,
     * principal and equalisation, each dated and each reconciled against the
     * statement's own totals — and nothing on this table used them: Neo Infra's
     * ₹49.5 L sat here as one UNDATED total, which refused its XIRR and its
     * split while the Private Market page one link away struck both.
     *
     * A payout dated ON OR BEFORE the fund's valuation is cash outside that
     * value and is a redemption on its date. One dated AFTER it is inside the
     * value and is not counted again — the rule `fundDatedRecords` applies,
     * so the two pages cannot disagree about which cash came back. A fund
     * whose valuation date is unknown gets none: without it there is no way to
     * say which side of the value a payout is on.
     *
     * GROSS IS THE AMOUNT: the funds value themselves pre-tax, and TDS is the
     * family's own tax withheld. Equalisation carries a sign — its column is
     * headed "(paid)/received" — so a negative one is money the family PAID
     * and is a purchase, never a negative redemption.
     */
    const asOf = valuedAt.get(c.accountId) ?? null;
    if (!asOf || c.payouts == null) continue;
    for (const r of c.payouts) {
      if (!r.date || r.date > asOf || !(Math.abs(r.gross) > 0)) continue;
      /**
       * ── A FUND WITH A CAPITAL RECORD OF ITS OWN KEEPS ITS PAYOUTS TOO ─────
       *
       * Since Stage 10ca Neo Infra's own unit record is a capital record here —
       * its six drawdowns and the ₹14.16 L capital redemption, which is what
       * FIFO needs to carry the cost of the units still held — so it stopped
       * being a call-derived row, and "one record per account" then dropped
       * every payout it had published: its income and equalisation reached no
       * column, its split was refused, and its XIRR fell out of step with the
       * Private Market page's. A unit record lists what bought and redeemed
       * UNITS and nothing else, so it cannot double a distribution. The one
       * payout it does carry is the principal: that is TYPED on the record's own
       * row (same date, same amount) rather than added a second time, and a
       * principal payout the record does not show is left to the record, which
       * is the authority on units.
       */
      if (hasRecord) {
        const dir = r.gross > 0 ? "out" : "in";
        const same = out.findIndex((m) => m.accountId === c.accountId && !m.fromCall && m.payoutKind == null
          && m.direction === dir && m.date === r.date && m.amount != null && Math.abs(m.amount - Math.abs(r.gross)) <= 1);
        if (same >= 0) { out[same] = { ...out[same], payoutKind: r.kind }; continue; }
        if (r.kind === "capital") continue;
      }
      out.push({
        accountId: c.accountId, date: r.date, direction: r.gross > 0 ? "out" : "in",
        label: r.label || (r.kind === "capital" ? "Principal returned" : r.kind === "income" ? "Income distributed" : "Equalisation"),
        amount: Math.abs(r.gross),
        invested: null, units: null, security: null, securityKey: null,
        // A payout beside a capital RECORD is not a call and is not marked as
        // one: `fromCall` is what says a row's purchases came from the fund's
        // call list, and a recorded account's purchases never do.
        ...(hasRecord ? {} : { fromCall: true as const }), payoutKind: r.kind,
      });
    }
  }
  return out;
}

/**
 * One row per account the family funded, newest activity first.
 *
 * Takes the account registry and positions rather than reading the book, so the
 * caller decides what set is in scope — the same seam every other helper here
 * uses. `commitments` supplies what was promised and what a drawdown fund paid
 * back; `windowed` says a date filter is narrowing the movements, which — like a
 * side filter — withholds every figure struck over the whole record.
 */
export function capitalRollup(
  moves: CapitalMove[],
  accounts: { accountId: string; provider: string; accountNo: string; strategy: string | null; owner: string; inceptionDate?: string | null; asOf?: string | null; capitalRecordTo?: string | null; engagement?: string; noPositionsReason?: string | null; reviewHolder?: boolean }[],
  positions: Position[],
  index: Record<string, PositionTranches>,
  side: CapitalSide = "all",
  sort: TxnSort = "recent",
  opts: { commitments?: Commitment[]; windowed?: boolean; fromInception?: readonly string[] } = {},
): CapitalGroup[] {
  /**
   * ONE ROW PER ACCOUNT — EXCEPT UNDER A REVIEW HOLDER BUCKET, WHERE IT IS ONE
   * ROW PER LINE. A holder bucket (`Account.reviewHolder`) is the family's
   * consolidated review's grouping of a member's private investments, not a
   * custodian account: Assetgro and Zepto under Ajay are two separate
   * investments bought on their own dates, and one return over both would be a
   * rate for a portfolio nobody holds as one (Stage 10dh).
   */
  const holder = new Set(accounts.filter((a) => a.reviewHolder).map((a) => a.accountId));
  const byGroup = new Map<string, { accountId: string; line: string | null; moves: CapitalMove[] }>();
  for (const m of moves) {
    const line = holder.has(m.accountId) && m.securityKey ? m.securityKey : null;
    const key = line ? `${m.accountId}|${line}` : m.accountId;
    if (!byGroup.has(key)) byGroup.set(key, { accountId: m.accountId, line, moves: [] });
    byGroup.get(key)!.moves.push(m);
  }
  const commitmentOf = new Map((opts.commitments ?? []).map((c) => [c.accountId, c]));
  const windowed = !!opts.windowed;
  const fromInception = new Set(opts.fromInception ?? []);
  const out: CapitalGroup[] = [];
  for (const [key, { accountId, line, moves: all }] of byGroup) {
    // WHAT THE FILTER NARROWS, AND WHAT IT MUST NOT. `ms` is the movements in
    // view — the rows listed, the amounts on each side, the payment count. The
    // account's WHOLE record still decides whether it can carry a return, so a
    // reader who narrows to redemptions does not thereby make an account's
    // contribution history look incomplete.
    const ms = side === "all" ? all : all.filter((m) => m.direction === side);
    const c = commitmentOf.get(accountId) ?? null;
    const source: CapitalGroup["source"] = all.length > 0 && all.every((m) => m.fromReview) ? "review"
      : all.length > 0 && all.every((m) => m.fromCall) ? "calls" : "record";
    // An undated payout rides only on a call-derived row: a capital RECORD lists
    // its redemptions dated, so its own out-movements are the whole of it.
    // A fund whose payouts are carried DATED (`Commitment.payouts`) has them as
    // redemption rows already — `capitalMovesWithCalls` — and only a fund with no
    // such record falls back to the one undated total its statement prints.
    const datedPayouts = source === "calls" && c?.payouts != null;
    const undatedOut = source === "calls" && !datedPayouts && c?.distributed != null && c.distributed > 0 ? c.distributed : null;
    const showsUndated = undatedOut != null && side !== "in";
    if (!ms.length && !showsUndated) continue;
    const a = accounts.find((x) => x.accountId === accountId);
    const ins = ms.filter((m) => m.direction === "in");
    const outs = ms.filter((m) => m.direction === "out");
    const paidIn = ins.reduce((s, m) => s + (m.amount ?? 0), 0);
    const tookOut = outs.reduce((s, m) => s + (m.amount ?? 0), 0);
    const sideFiltered = side !== "all";
    /**
     * WHAT CAME BACK, WHEN IT IS KNOWN. A capital record lists every
     * redemption, so its sum is a measurement — zero included. A call list
     * does not, so a drawdown fund's payouts are what its statement prints as
     * DISTRIBUTED, and null where it prints no such line.
     */
    const redemption: number | null = side === "in" ? null
      : source === "record" || source === "review" || datedPayouts ? tookOut
      : c?.distributed != null ? (c.distributed ?? 0) + tookOut
      : null;

    const own = positions.filter((p) => p.accountId === accountId && (line == null || p.securityKey === line));
    const value = own.length === 0 ? null : own.reduce((s, p) => s + p.marketValue, 0);
    /**
     * WHERE THE VALUE IS STRUCK. A statement account's own report date; a line
     * the review values, the date the review values IT on (`priceAsOf` — the
     * line's own closing on the Transactions sheet, or the review's date for a
     * line held at cost), which is often months before the bucket's 30 June.
     * Several lines valued on different dates have no one date to close on.
     */
    const valueAsOf = source === "review"
      ? commonValueDate(own.map((p) => p.priceAsOf ?? a?.asOf ?? null))
      : a?.asOf ?? null;
    /** Held = not a fund row redeemed to nil. A cash sleeve at zero units still counts. */
    const held = own.filter((p) => !(p.quantity === 0 && p.marketValue === 0));
    const costOfHeld = held.length === 0 ? 0
      : held.some((p) => p.costBasis == null) ? null
      : held.reduce((s, p) => s + (p.costBasis ?? 0), 0);

    const dates = ms.map((m) => m.date).sort();
    const boughtDates = ins.map((m) => m.date).sort();
    // BOTH ENDS: the record must reach back to inception AND forward to the date
    // the value beside it is struck on (`recordShortfall`) — the second asked of
    // a capital RECORD only, since a fund's call list is read off the very
    // statement its value comes from.
    // A line the review values answers to the review's own rows instead
    // (`reviewShortfall`): its record IS the review's, so it reaches inception
    // and the value's date when its purchases add up to the cost beside it.
    const incompleteReason = source === "review"
      ? reviewShortfall(own, all, valueAsOf)
      : contributionsAreComplete(accountId, all, positions, index, a?.inceptionDate, c, fromInception.has(accountId))
        ?? (source === "record" ? recordShortfall(a) : null);

    // ── APPRECIATION, AND WHY IT IS WITHHELD WHERE IT IS ─────────────────────
    const filtered = sideFiltered || windowed;
    const allIn = all.filter((m) => m.direction === "in");
    const P = allIn.reduce((s, m) => s + (m.amount ?? 0), 0);
    const R = source === "record" || source === "review" || datedPayouts
      ? all.filter((m) => m.direction === "out").reduce((s, m) => s + (m.amount ?? 0), 0)
      : c?.distributed != null ? c.distributed : null;
    const unknownAmount = allIn.some((m) => m.amount == null);
    let appreciationReason: string | null = null;
    if (sideFiltered) appreciationReason = "the movements are filtered to one side; appreciation is struck over the account's whole record of purchases and redemptions, so it is not published over part of it — clear the Buys/Sells filter";
    else if (windowed) appreciationReason = "the dates are filtered to part of this account's record; appreciation is struck over every purchase and redemption since inception, so it is not published over a window — clear the date filter";
    else if (incompleteReason) appreciationReason = incompleteReason;
    else if (unknownAmount) appreciationReason = "one purchase on this account's statement prints only a running balance, not the amount paid, so what went in is not fully stated";
    else if (value == null) appreciationReason = a?.noPositionsReason
      ? `this account is valued by no statement — ${a.noPositionsReason}`
      : "no statement values this account, so there is no value today to measure appreciation against";
    else if (R == null) appreciationReason = "the fund's statement prints no distribution line, so what has come back to the family is not stated — and appreciation needs it";
    const appreciation = appreciationReason ? null : value! + R! - P;

    /**
     * ── THE SPLIT, WHICH HAS FIVE HONEST CASES AND ONE REFUSAL ──────────────
     *
     *   • NOTHING CAME BACK — every rupee of appreciation is still on paper, so
     *     realised is a COMPUTED ZERO and says why. Unrealised is struck against
     *     what the family PAID, the fund's stamp duty included: that duty is
     *     part of what the units still held cost, and moving it into "realised"
     *     would show a loss on a fund nobody has sold.
     *   • NOTHING IS HELD — the account was redeemed in full, so every rupee of
     *     appreciation is realised and unrealised is the computed zero. (3P.)
     *   • A PMS MANDATE — money comes out as withdrawals and TDS transfers while
     *     the manager keeps buying and selling inside, and the manager's own
     *     statement carries the cost of everything held, cash included. So
     *     unrealised is value less that cost, exactly the Holdings page's
     *     unrealised P&L for the same account, and realised is the rest: gains
     *     booked on sales plus dividends and interest, less fees and charges.
     *   • A FUND THAT PAID SOMETHING BACK AND IS STILL HELD, WHOSE STATEMENT
     *     TYPES EACH PAYOUT — principal returned is capital, income and
     *     equalisation are gain paid out, so the split is the fund's own.
     *     (Neo Infra, Baring — since Stage 10bw read their dated payouts.)
     *   • …AND ONE WHOSE STATEMENT PRINTS ONLY A TOTAL — refused. Whether a
     *     payout returned capital or distributed gain is exactly the split. The
     *     total stands; its split is not published rather than guessed. (No
     *     fund in this book since Stage 10bw; the rule stands for the next one.)
     *
     * Where appreciation itself is withheld, unrealised on what is HELD can still
     * be struck against the statement's own cost — the same figure the Holdings
     * page prints — so a drawdown fund that prints no distribution line still
     * shows its mark. It says what it is struck against.
     */
    const outsAll = all.filter((m) => m.direction === "out");
    /** Every payout typed by the fund itself — the case the split can be struck on. */
    const typedPayouts = outsAll.length > 0 && outsAll.every((m) => m.payoutKind != null);
    let realised: number | null = null, unrealised: number | null = null;
    let realisedNote: string | null = null, unrealisedNote: string | null = null;
    const isPms = a?.engagement === "PMS";
    /**
     * A DISTRIBUTION THE FUND REINVESTED IS REALISED, THOUGH NO CASH MOVED.
     * Buoyant 103473's 1 Apr 2026 allotment is ₹10 Cr paid and ₹10,00,58,861.66
     * invested: the ₹58,861.66 is a gain the fund distributed and put straight
     * back into units (`Gain Distr.`), which its appraisal books as Income and
     * the Holdings page counts in cost. It is visible here as an allotment
     * worth MORE than was paid, and only that: a fund's charges make one worth
     * LESS (Sanshi's stamp duty), and those stay in what the units cost.
     * Filed under unrealised, the row read ₹58,861 above the Holdings page's
     * unrealised P&L for the same fund — two figures for one thing a click apart.
     */
    const reinvested = allIn.reduce((s, m) =>
      s + (m.amount != null && m.invested != null && m.invested > m.amount ? m.invested - m.amount : 0), 0);
    if (appreciation != null && source === "review") {
      /**
       * A LINE THE FAMILY'S REVIEW VALUES — split on the review's own rows. The
       * review sets a sale's proceeds against the line's cost (360 ONE: paid
       * ₹99,99,500.02, sold for ₹78,320, carried at ₹99,21,180.02), so what a
       * sale returned is capital coming back, not gain; its Div / Int rows are
       * gain paid out. Unrealised is then value less the cost it carries, and
       * the two add to appreciation by construction — `reviewShortfall` checked
       * the purchases less the sale proceeds ARE that cost.
       */
      const saleProceeds = outsAll.filter((m) => m.payoutKind === "capital").reduce((t, m) => t + (m.amount ?? 0), 0);
      realised = R! - saleProceeds;
      unrealised = appreciation - realised;
      if (R === 0) {
        realisedNote = "nothing has come back out of this line, so nothing is realised — a computed zero, not a missing figure";
        unrealisedNote = "value today less what was paid — the family's consolidated review's value against the cost it carries";
      } else {
        realisedNote = saleProceeds > 0
          ? "the interest and dividends the family's consolidated review records this line paid out — what a sale returned the review sets against the line's cost, so it is not in this figure"
          : "the interest and dividends the family's consolidated review records this line paid out";
        unrealisedNote = saleProceeds > 0
          ? "value today less the cost the review carries: what was paid, less what the sale returned"
          : "value today less what was paid — the family's consolidated review's value against the cost it carries";
      }
    } else if (appreciation != null) {
      if (R === 0 && reinvested > 0) {
        realised = reinvested;
        realisedNote = "a gain the fund distributed and reinvested in more units rather than paying out — realised by the fund, though no cash reached the family; nothing else has come back out of this account";
        unrealised = appreciation - reinvested;
        unrealisedNote = "value today less what the units held cost: the purchase amount plus the distribution reinvested in them — the Holdings page's unrealised P&L for this fund";
      } else if (R === 0) {
        realised = 0;
        realisedNote = "nothing has come back out of this account, so nothing is realised — a computed zero, not a missing figure";
        unrealised = appreciation;
        unrealisedNote = "value today less the whole purchase amount — every unit is still held, and the fund's stamp duty is part of what they cost";
      } else if (held.length === 0 && value === 0) {
        unrealised = 0;
        unrealisedNote = "nothing is held any more — the account was redeemed in full, so nothing is left on paper; a computed zero";
        realised = appreciation;
        realisedNote = "redemption less purchase — the account was redeemed in full, so all of its appreciation is realised";
      } else if (isPms && costOfHeld != null) {
        unrealised = value! - costOfHeld;
        unrealisedNote = "value today less the manager's own cost of everything the mandate holds, cash included — the same unrealised P&L the Holdings page shows for this mandate";
        realised = appreciation - unrealised;
        realisedNote = "booked inside the mandate: gains on the manager's sales plus dividends and interest, less fees and charges — appreciation less what is still on paper";
      } else if (typedPayouts) {
        /**
         * A FUND THAT PAID BACK AND IS STILL HELD — and whose statement TYPES
         * each payout. Principal returned is capital coming back, not gain;
         * income and equalisation are gain paid out. So realised is the
         * second, and unrealised is value less what the units still held
         * cost: the purchase less the principal returned. Neo Infra's units
         * say the same thing a second way — 5,00,000 called at ₹100 and
         * 4,85,837 held, so the ₹14.16 L principal redeemed 14,163 of them.
         */
        const principal = outsAll.filter((m) => m.payoutKind === "capital").reduce((t, m) => t + (m.amount ?? 0), 0);
        realised = R! - principal;
        unrealised = appreciation - realised;
        const statementCostIsWholeCall = costOfHeld != null && Math.abs(costOfHeld - P) <= 1;
        realisedNote = principal > 0
          ? "the income and equalisation this fund has paid out, as its own statement types each payout — the principal it returned is capital coming back, not gain, and is not in this figure"
          : "the income and equalisation this fund has paid out, as its own statement types each payout";
        unrealisedNote = principal > 0
          ? "value today less what the units still held cost: the purchase less the principal the fund has returned"
            + (statementCostIsWholeCall ? ". The Holdings page prints the statement's own cost, which is the whole amount called, so its unrealised P&L reads lower by that principal" : "")
          : "value today less the whole purchase amount — the fund has returned no principal, so every unit it called is still held; the Holdings page's unrealised P&L for this fund";
      } else {
        realisedNote = unrealisedNote = "this fund has paid money back while the family still holds its units, and its statement prints the payout as one total with the units still at their full cost — so how much of the payout returned capital and how much was gain is not stated. The total appreciation stands; its split is not published rather than guessed";
      }
    } else {
      realisedNote = appreciationReason;
      if (!filtered && value != null && costOfHeld != null && held.length > 0 && R == null) {
        unrealised = value - costOfHeld;
        unrealisedNote = "value today less the statement's own cost of the units held — the Holdings page's unrealised P&L. What has come back is not stated, so appreciation and its realised part are not";
      } else {
        unrealisedNote = appreciationReason;
      }
    }

    /**
     * THE FLOWS AN XIRR IS SOLVED OVER — every one dated, and the whole record,
     * or none at all. An undated payout cannot be placed in time, and a return
     * solved without it would be the fund's return as if it had paid nothing.
     */
    const flows = appreciation != null && undatedOut == null
      ? all.filter((m) => m.amount != null).map((m) => ({ date: m.date, amount: m.direction === "in" ? -(m.amount as number) : (m.amount as number) }))
      : null;

    out.push({
      key,
      accountId,
      securityKey: line,
      // A line is named as every other table names it; an account, as before.
      label: line ? securityLabel(line, own[0]?.security ?? all[0]?.security ?? line) : a?.strategy || a?.provider || accountId,
      provider: a?.provider ?? "",
      accountNo: a?.accountNo ?? "",
      owner: a?.owner ?? "",
      // THE EXPANSION FOLLOWS THE SAME ORDER AS THE ROWS ABOVE IT. It was
      // oldest-first unconditionally, so a card set to "recent first" opened
      // every row on its oldest payment — a list ordered one way containing
      // lists ordered the other, which is the ordering complaint one level
      // down. `date` is the only field a movement has, and `sortRows` reads it.
      //
      // AND EACH MOVEMENT NAMES ITS SECURITY THE WAY EVERY OTHER TABLE DOES. The
      // record carries the spelling its statement printed — Sanshi's reads
      // `(Open Ended AIF CAT-III)` — while the holdings table beside it was
      // printing the same class through the title-caser, so one fund had two
      // names on one page. A movement that names no security keeps its null:
      // a name the record did not print is not supplied for it.
      moves: sortRows(ms.map((m) => ({
        ...m,
        security: m.securityKey && m.security != null ? securityLabel(m.securityKey, m.security) : m.security,
      })), sort, (m) => m.amount ?? null),
      source,
      contributions: ins.length,
      withdrawals: outs.length,
      paidIn, tookOut, redemption, undatedOut: showsUndated ? undatedOut : null,
      committed: c?.committed ?? null,
      undrawn: c?.undrawn ?? null,
      first: dates[0] ?? "", last: dates[dates.length - 1] ?? "",
      boughtFirst: boughtDates[0] ?? "", boughtLast: boughtDates.at(-1) ?? "",
      staggered: ins.length > 1,
      value,
      valueAsOf,
      atCost: own.some(isValuedAtCost),
      appreciation, realised, unrealised,
      appreciationReason, realisedNote, unrealisedNote,
      flows,
      incompleteReason,
      sideFiltered,
      windowed,
    });
  }
  // ORDERED BY THE MODE THE READER CHOSE, and RECENT FIRST by default. This
  // sorted by `paidIn` unconditionally — *"something is October, something is
  // December, something is 2023. It's all very chaotic"* — which answers "what
  // is the biggest" over a table of dated movements. `size` is that ordering,
  // still here and no longer imposed. Sorted by accountId FIRST so the mode's
  // own comparator, which is stable, resolves every tie the same way on every
  // run rather than however the Map happened to be filled.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return sortRows(out, sort, (g) => g.paidIn);
}

// ── THE RETURN ON AN ACCOUNT'S OWN MONEY, ON THE MEASURE THE READER PICKED ──
//
//   *"the returns that we are showing in transactions are also wrong… make sure
//    that there are no calculation errors or logical errors in calculating
//    returns."*  …  *"Just like in the holdings page, we have return methodology
//    selector add the same to the transactions page as well."*
//
// The old return was gain ÷ NET INVESTED, and net invested subtracted the
// redemption — principal and appreciation together — from the purchases. So the
// denominator shrank by every rupee of gain that had come back, and the return
// grew with it: 3P's could not be struck at all (its "principal" was −₹2.56 Cr)
// and any account that had paid something back was overstated. Nothing here
// divides by a figure that has appreciation inside it.
//
//   HPR   appreciation ÷ purchase — what the family made on what they paid,
//         not annualised. The denominator is money that went IN and nothing else.
//   XIRR  solved over every dated purchase and redemption and the value today,
//         each at its own date — the rate the family asked for when they said
//         "XIRR will change depending on the investment amount and the time".
//         It is not published over a window under a year: that is a rate for a
//         year the money has not seen (the +99.0% this book once printed), so
//         the holding-period return stands there instead and is labelled HPR.
//   CAGR  one purchase, compounded over the years it has been held — refused
//         where the money went in over several dates, because a single-start
//         compound rate would treat all of it as invested on the first date.
//         That is what XIRR is for, and the refusal says so.
//   YTD   measurable only where the first purchase is inside the current year,
//         so there is no 1 January value to be missing.
//   CY    needs a valuation at both ends of a past year, which no statement here
//         is dated early enough to carry.
//   AUTO  the family's rule: under a year, HPR; a year or more, CAGR for a
//         single purchase and XIRR where there were several dated flows.

const YEAR = 365;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The first purchase to the date the value is struck — or to the last flow, for an account that holds nothing. */
function capitalWindow(g: CapitalGroup): { from: string; to: string; days: number } | null {
  const ins = g.moves.filter((m) => m.direction === "in").map((m) => m.date).sort();
  const from = ins[0];
  if (!from) return null;
  const lastFlow = (g.flows ?? []).map((f) => f.date).sort().at(-1) ?? g.last;
  const to = g.value === 0 ? lastFlow : (g.valueAsOf ?? lastFlow);
  if (!to) return null;
  return { from, to, days: dayDiff(from, to) };
}

/** The account's money-weighted rate, annual, or null where the flows do not yield one. */
export function capitalXirr(g: CapitalGroup): number | null {
  if (!g.flows || g.flows.length === 0 || g.value == null) return null;
  const w = capitalWindow(g);
  if (!w) return null;
  const flows: DatedFlow[] = g.flows.map((f) => ({ date: new Date(f.date), amount: f.amount }));
  if (g.value > 0) flows.push({ date: new Date(w.to), amount: g.value });
  return xirrPct(flows);
}

/** Whether more than one dated flow went in or came out — the case CAGR cannot describe. */
const multiFlow = (g: CapitalGroup) =>
  (g.flows ?? []).length > 1 || g.undatedOut != null;

export function capitalReturn(g: CapitalGroup, measure: ReturnMeasure): MeasuredReturn {
  const tagOf = (m: ReturnMeasure) => RETURN_MEASURES.find((x) => x.key === m)?.tag ?? "AUTO";
  const hpr = g.appreciation != null && g.paidIn > 0 ? (g.appreciation / g.paidIn) * 100 : null;
  const noReturn = g.appreciationReason
    ?? (g.paidIn > 0 ? "no return can be struck against this account's reported capital" : "nothing was purchased in view, so there is nothing to strike a return against");
  if (hpr == null) return { shown: false, tag: tagOf(measure), reason: noReturn };
  const w = capitalWindow(g);
  const hprNote = (why: string) => ({ shown: true as const, pct: hpr, tag: "HPR", note: why });

  if (measure === "absolute") {
    return { shown: true, pct: hpr, tag: "HPR",
      note: "Appreciation divided by the purchase amount — what was made on what was paid, not annualised." };
  }
  if (measure === "calendar") {
    return { shown: false, tag: "CY",
      reason: "a calendar-year return needs this account's value at the start and end of that year, and no statement here values it at a past year-end" };
  }
  if (measure === "ytd") {
    const yearStart = g.valueAsOf ? `${g.valueAsOf.slice(0, 4)}-01-01` : null;
    if (w && yearStart && w.from >= yearStart) {
      return { shown: true, pct: hpr, tag: "YTD",
        note: `First purchased ${w.from}, inside the current year, so its year-to-date return is its whole return since then.` };
    }
    return { shown: false, tag: "YTD",
      reason: "this account was funded before 1 January, and a year-to-date return needs its value on that date — no statement here is dated then" };
  }
  const sub = w != null && w.days < YEAR;
  const subNote = w ? `The money has been in for ${w.days} days — under a year — so this is the holding-period return, not an annual rate.` : "";
  if (measure === "cagr") {
    if (multiFlow(g)) {
      return { shown: false, tag: "CAGR",
        reason: "the money went in and came out over several dates, so a single-start compound rate would treat all of it as invested on the first date — the money-weighted rate for this account is XIRR" };
    }
    if (!w) return { shown: false, tag: "CAGR", reason: noReturn };
    if (sub) return hprNote(subNote);
    const growth = 1 + hpr / 100;
    if (growth <= 0) return { shown: false, tag: "CAGR", reason: "this account is worth nothing against what was paid, so it has no compound rate — only a total loss" };
    return { shown: true, pct: (Math.pow(growth, YEAR / w.days) - 1) * 100, tag: "CAGR",
      note: `One purchase, compounded over the ${w.days} days since ${w.from}.` };
  }
  const xirrOrWhy = (): MeasuredReturn => {
    if (g.undatedOut != null) {
      return { shown: false, tag: "XIRR",
        reason: "this fund prints its payouts as one undated total, so they cannot be placed in time — and a money-weighted rate solved without them would be the fund's return as if it had paid nothing back" };
    }
    if (sub) return hprNote(subNote);
    const x = capitalXirr(g);
    if (x == null) return { shown: false, tag: "XIRR", reason: "these dated flows do not yield a money-weighted rate" };
    return { shown: true, pct: x, tag: "XIRR",
      note: `Money-weighted over ${(g.flows ?? []).length} dated ${(g.flows ?? []).length === 1 ? "flow" : "flows"} and the value on ${w?.to}, across ${w?.days} days.` };
  };
  if (measure === "xirr") return xirrOrWhy();

  // ── auto: the methodology ─────────────────────────────────────────────────
  if (!w || sub) return hprNote(w ? subNote : "No purchase date to measure a year from, so this is the holding-period return.");
  if (multiFlow(g)) {
    const r = xirrOrWhy();
    return r.shown ? r : hprNote(`Several dated flows call for XIRR, and ${r.reason} — so this is the holding-period return.`);
  }
  const growth = 1 + hpr / 100;
  if (growth <= 0) return hprNote("A total loss has no compound rate, so this is the holding-period return.");
  return { shown: true, pct: (Math.pow(growth, YEAR / w.days) - 1) * 100, tag: "CAGR",
    note: `One purchase held ${w.days} days, so the return is annualised.` };
}

/**
 * ONE RETURN OVER SEVERAL ACCOUNTS' CAPITAL — the Transactions table's clubbed
 * row, where one fund or one strategy is held by several family members and
 * the family asked to see it as one line.
 *
 * Struck on the SUMS, never as an average of the members' percentages (which
 * would weight a ₹5 L folio like a ₹5 Cr one), and only where every member can
 * strike its own: a member whose appreciation is withheld leaves the pooled
 * figure with a part missing, so the whole is refused and says how many. The
 * money-weighted rate pools every member's dated flows, each member closing on
 * ITS OWN value date — the `pooledXirr` rule. Nothing under a year is
 * annualised (Stage 10g(ii)); a CAGR is refused wherever the money went in on
 * more than one date, exactly as it is for one account.
 */
export function clubCapitalReturn(caps: CapitalGroup[], measure: ReturnMeasure): MeasuredReturn {
  if (caps.length === 1) return capitalReturn(caps[0], measure);
  const tagOf = (m: ReturnMeasure) => RETURN_MEASURES.find((x) => x.key === m)?.tag ?? "AUTO";
  const withheld = caps.filter((g) => g.appreciation == null);
  if (withheld.length > 0) {
    const reasons = [...new Set(withheld.map((g) => g.appreciationReason).filter((x): x is string => !!x))];
    return { shown: false, tag: tagOf(measure),
      reason: reasons.length === 1 && withheld.length === caps.length
        ? reasons[0]
        : `${withheld.length} of the ${caps.length} accounts behind this line withhold their appreciation${reasons[0] ? ` (${reasons[0]})` : ""}, so a return over all of them would leave part of the money out` };
  }
  const paid = caps.reduce((a, g) => a + g.paidIn, 0);
  if (!(paid > 0)) return { shown: false, tag: tagOf(measure), reason: "nothing was purchased in view, so there is nothing to strike a return against" };
  const hpr = (caps.reduce((a, g) => a + (g.appreciation ?? 0), 0) / paid) * 100;
  const wins = caps.map(capitalWindow);
  const known = wins.filter((w): w is NonNullable<typeof w> => w != null);
  const from = known.map((w) => w.from).sort()[0] ?? null;
  const to = known.map((w) => w.to).sort().at(-1) ?? null;
  const days = from && to ? dayDiff(from, to) : null;
  const n = caps.length;
  const hprNote = (why: string) => ({ shown: true as const, pct: hpr, tag: "HPR", note: why });

  if (measure === "absolute") {
    return hprNote(`Appreciation across the ${n} accounts divided by what they paid in together — not annualised.`);
  }
  if (measure === "calendar") {
    return { shown: false, tag: "CY",
      reason: "a calendar-year return needs these accounts' value at the start and end of that year, and no statement here values them at a past year-end" };
  }
  if (measure === "ytd") {
    const inYear = caps.every((g, i) => {
      const w = wins[i];
      const yearStart = g.valueAsOf ? `${g.valueAsOf.slice(0, 4)}-01-01` : null;
      return w != null && yearStart != null && w.from >= yearStart;
    });
    if (inYear) return { shown: true, pct: hpr, tag: "YTD",
      note: `Every one of the ${n} accounts was first funded inside the current year, so their year-to-date return is their whole return since then.` };
    return { shown: false, tag: "YTD",
      reason: "at least one of these accounts was funded before 1 January, and a year-to-date return needs its value on that date — no statement here is dated then" };
  }
  const sub = days != null && days < YEAR;
  const subNote = days != null ? `The money has been in for ${days} days — under a year — so this is the holding-period return, not an annual rate.` : "";
  const flowDates = new Set(caps.flatMap((g) => (g.flows ?? []).map((f) => f.date)));
  const multi = flowDates.size > 1 || caps.some((g) => g.undatedOut != null);
  if (measure === "cagr") {
    if (multi) return { shown: false, tag: "CAGR",
      reason: "the money went in and came out over several dates across these accounts, so a single-start compound rate would treat all of it as invested on the first date — the money-weighted rate for this line is XIRR" };
    if (days == null) return { shown: false, tag: "CAGR", reason: "these accounts carry no purchase date to measure a year from" };
    if (sub) return hprNote(subNote);
    const growth = 1 + hpr / 100;
    if (growth <= 0) return { shown: false, tag: "CAGR", reason: "these accounts are worth nothing against what was paid, so they have no compound rate — only a total loss" };
    return { shown: true, pct: (Math.pow(growth, YEAR / days) - 1) * 100, tag: "CAGR",
      note: `One purchase date across the ${n} accounts, compounded over the ${days} days since ${from}.` };
  }
  const xirrOrWhy = (): MeasuredReturn => {
    if (caps.some((g) => g.undatedOut != null)) return { shown: false, tag: "XIRR",
      reason: "a fund behind this line prints its payouts as one undated total, so they cannot be placed in time — and a money-weighted rate solved without them would read as if it had paid nothing back" };
    if (caps.some((g) => !g.flows || g.flows.length === 0 || g.value == null)) return { shown: false, tag: "XIRR",
      reason: "an account behind this line has no dated flows or no value to close on, so the accounts cannot be pooled into one money-weighted rate" };
    if (sub) return hprNote(subNote);
    const flows: DatedFlow[] = [];
    for (let i = 0; i < caps.length; i++) {
      const g = caps[i], w = wins[i];
      for (const f of g.flows ?? []) flows.push({ date: new Date(f.date), amount: f.amount });
      if ((g.value ?? 0) > 0 && w) flows.push({ date: new Date(w.to), amount: g.value as number });
    }
    const x = xirrPct(flows);
    if (x == null) return { shown: false, tag: "XIRR", reason: "these dated flows do not yield a money-weighted rate" };
    return { shown: true, pct: x, tag: "XIRR",
      note: `Money-weighted over the ${n} accounts' ${flows.length} dated flows, each account closing on its own value date, from ${from} to ${to}.` };
  };
  if (measure === "xirr") return xirrOrWhy();

  // auto — the family's rule, over the pooled money
  if (days == null || sub) return hprNote(days != null ? subNote : "No purchase date to measure a year from, so this is the holding-period return.");
  if (multi) {
    const r = xirrOrWhy();
    return r.shown ? r : hprNote(`Several dated flows call for XIRR, and ${r.reason} — so this is the holding-period return.`);
  }
  const growth = 1 + hpr / 100;
  if (growth <= 0) return hprNote("A total loss has no compound rate, so this is the holding-period return.");
  return { shown: true, pct: (Math.pow(growth, YEAR / days) - 1) * 100, tag: "CAGR",
    note: `One purchase date across the ${n} accounts, held ${days} days, so the return is annualised.` };
}

/** How many rows a measure answers, for the column header — counted, never claimed. */
export function capitalReturnCoverage(groups: CapitalGroup[], measure: ReturnMeasure) {
  let shown = 0, absent = 0, annual = 0, hpr = 0;
  for (const g of groups) {
    const r = capitalReturn(g, measure);
    if (!r.shown) { absent++; continue; }
    shown++;
    if (r.tag === "HPR" || r.tag === "YTD") hpr++; else annual++;
  }
  return { total: groups.length, shown, absent, annual, hpr };
}

/** Column totals, summed FROM the rows so the footer cannot disagree with them. */
export function capitalTotals(groups: CapitalGroup[]) {
  return {
    /**
     * DISTINCT ACCOUNTS, NOT ROWS — and the two parted at Stage 10dh. The
     * footer prints "N of M accounts" beside its own row count, and a review
     * holder bucket draws one row per LINE, so `groups.length` is the ROW
     * count: on this book it would read 39 of 64 accounts where 38 publish a
     * dated record. `rows` is the row count and this is the accounts'.
     */
    accounts: new Set(groups.map((g) => g.accountId)).size,
    contributions: groups.reduce((a, g) => a + g.contributions, 0),
    withdrawals: groups.reduce((a, g) => a + g.withdrawals, 0),
    paidIn: groups.reduce((a, g) => a + g.paidIn, 0),
    tookOut: groups.reduce((a, g) => a + g.tookOut, 0),
    /**
     * EVERY FIGURE BELOW IS SUMMED OVER THE ROWS THAT CARRY ONE, and each
     * carries its count — §"never blend a missing value into a total as zero".
     * A redemption nobody stated is not a redemption of ₹0, and an appreciation
     * withheld is not one of ₹0.
     */
    redemption: sumOrNull(groups.map((g) => g.redemption)),
    redemptionOf: groups.filter((g) => g.redemption != null).length,
    committed: sumOrNull(groups.map((g) => g.committed)),
    committedOf: groups.filter((g) => g.committed != null).length,
    value: sumOrNull(groups.map((g) => g.value)),
    appreciation: sumOrNull(groups.map((g) => g.appreciation)),
    appreciationOf: groups.filter((g) => g.appreciation != null).length,
    realised: sumOrNull(groups.map((g) => g.realised)),
    realisedOf: groups.filter((g) => g.realised != null).length,
    unrealised: sumOrNull(groups.map((g) => g.unrealised)),
    unrealisedOf: groups.filter((g) => g.unrealised != null).length,
  };
}

/**
 * ── THE SECTIONS ARE `datedSectionRollup`'S NOW ─────────────────────────────
 *
 * `CapitalSectionRows` and `capitalSectionRollup` grouped these rows under the
 * headings the Holdings table draws, and were the capital table's half of that.
 * One table carries both dated records since Stage 10bm, so a section holds
 * rows of BOTH kinds and `datedSectionRollup` in `txnLedger.ts` groups them —
 * this pair had no caller left, which is the dead-code-that-looks-alive failure
 * this repo keeps naming.
 *
 * `capitalTotals` above did NOT go with it: `datedTotals` calls it for the
 * capital half of every section and of the footer, so there is still ONE
 * definition of what a set of capital rows adds to.
 */

/**
 * How many of a set's holdings carry a breakdown, for the caption under a
 * table that offers one on some rows and not others.
 *
 * A count, never a claim: "7 of 371" is a fact a reader can act on, where "some
 * holdings show their contribution history" tells them nothing about whether
 * the one they are looking at should.
 */
export function trancheCoverage(
  positions: Position[],
  index: Record<string, PositionTranches>,
) {
  let withBreakdown = 0, multi = 0;
  for (const p of positions) {
    const tr = index[trancheKey(p.accountId, p.securityKey)];
    if (!tr) continue;
    withBreakdown++;
    if (tr.moves.length > 1) multi++;
  }
  return { withBreakdown, multi, total: positions.length };
}
