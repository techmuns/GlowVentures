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
import type { CapitalMove, Position, PositionTranches } from "./types";
import { holdingReturn, type HoldingReturn, type ReturnMode } from "./analytics";
import { sortRows, type TxnSort } from "./txnSort";
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
  /** Absolute or annualised, through the book's one guard. */
  ret: HoldingReturn;
};

export type TrancheTable = {
  rows: TrancheRow[];
  /** Summed from the ROWS, never computed beside them — see the note above. */
  units: number;
  invested: number;
  value: number;
  returnPct: number;
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
  asOf: string,
): TrancheTable | null {
  if (!positions.length) return null;

  const rows: TrancheRow[] = [];
  let positionUnits = 0, positionValue = 0;
  let positionCost: number | null = 0;
  for (const p of positions) {
    const tr = index[trancheKey(p.accountId, p.securityKey)];
    if (!tr || !tr.moves.length) return null;
    // A position marked at a total with no unit count cannot price a tranche —
    // there is no per-unit figure to multiply.
    if (!(p.quantity > 0)) return null;
    const navNow = p.marketValue / p.quantity;
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
        navAtEntry: m.invested / m.units,
        value, returnPct,
        // This tranche's OWN contribution date, which is the whole reason a
        // tranche can annualise where the position around it cannot.
        ret: holdingReturn({ returnPct, heldSince: m.date }, mode, asOf),
      });
    }
    positionUnits += p.quantity;
    positionValue += p.marketValue;
    positionCost = positionCost === null || p.costBasis === null ? null : positionCost + p.costBasis;
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

  const units = rows.reduce((a, r) => a + r.units, 0);
  const invested = rows.reduce((a, r) => a + r.invested, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  return {
    rows, units, invested, value,
    returnPct: invested > 0 ? ((value - invested) / invested) * 100 : 0,
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
  accountId: string;
  /** The mandate or fund as the app names it elsewhere. */
  label: string;
  provider: string;
  accountNo: string;
  owner: string;
  moves: CapitalMove[];
  contributions: number;
  withdrawals: number;
  paidIn: number;
  tookOut: number;
  /**
   * Paid in less taken out — the family's own money at work, as reported.
   *
   * NULL UNDER A SIDE FILTER, and that is the whole of why this is nullable.
   * `paidIn` and `tookOut` narrow to the movements in view; the net does not
   * exist over one side of a two-sided record. Publishing `paidIn - 0` under a
   * Paid-in filter would print a net that ties to its own columns and describes
   * an account that also took money out.
   */
  net: number | null;
  first: string;
  last: string;
  /** More than one dated contribution. A fact about the count, not a judgement. */
  staggered: boolean;
  /** What the account is worth today, from the book. */
  value: number;
  /**
   * Gain and return against `net` — published ONLY where the contribution
   * history provably reaches inception, because a return against a PARTIAL
   * record of what was paid in overstates itself by everything it missed.
   */
  gain: number | null;
  returnPct: number | null;
  /** Why the return is withheld, when it is. Null when it is published. */
  incompleteReason: string | null;
  /** True where a side filter is narrowing this row's movements. */
  sideFiltered: boolean;
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
 * ONE DEFINITION, read by the Transactions card's rows and by the capital model
 * (`src/lib/capital.ts`), so the two cannot disagree about which accounts'
 * dated records are whole. Null where the record reaches; otherwise the reason.
 */
export function recordShortfall(a: { asOf?: string | null; capitalRecordTo?: string | null } | undefined): string | null {
  if (!a?.asOf) return "the account carries no statement date for its value, so there is nothing for the record to reach";
  if (a.capitalRecordTo && a.capitalRecordTo >= a.asOf) return null;
  return `this dated record ends ${a.capitalRecordTo ?? "before the account's statement date"}, before the ${a.asOf} statement its value is struck on, so what moved in between is not in it — the return on the capital the manager's own statement prints is on the Holdings table`;
}

/**
 * IS THE CONTRIBUTION HISTORY THE WHOLE OF WHAT WAS PAID IN?
 *
 * A return needs the denominator to be complete, and "the statement listed some
 * contributions" does not establish that. Two things do, and both are evidence
 * the documents themselves carry rather than an assumption about them:
 *
 *   • every position in the account has a unit-tied breakdown — the allotted
 *     units account for every unit held, so nothing was bought by money this
 *     history does not contain; or
 *   • the account's own printed INCEPTION DATE is on or after the first
 *     contribution — the statement saying its record starts where the account
 *     does.
 *
 * Measured on this book, all ten funded accounts qualify under one or the other
 * (seven by units, three by inception, exactly). An account meeting neither
 * keeps its figures and loses its return, with the reason on the cell.
 */
export function contributionsAreComplete(
  accountId: string,
  moves: CapitalMove[],
  positions: Position[],
  index: Record<string, PositionTranches>,
  inceptionDate: string | null | undefined,
): string | null {
  const firstIn = moves.filter((m) => m.direction === "in").map((m) => m.date).sort()[0];
  if (!firstIn) return "no dated contribution is reported for this account, so there is nothing to measure a return against";
  const own = positions.filter((p) => p.accountId === accountId);
  if (own.length > 0 && own.every((p) => index[trancheKey(p.accountId, p.securityKey)])) return null;
  if (inceptionDate && inceptionDate >= firstIn) return null;
  return "the statements report these contributions but do not say the list reaches inception, so what was paid in "
    + "may be understated — and a return struck on a partial cost overstates itself by everything it missed";
}

/**
 * One row per account the family funded, newest activity first.
 *
 * Takes the account registry and positions rather than reading the book, so the
 * caller decides what set is in scope — the same seam every other helper here
 * uses.
 */
export function capitalRollup(
  moves: CapitalMove[],
  accounts: { accountId: string; provider: string; accountNo: string; strategy: string | null; owner: string; inceptionDate?: string | null; asOf?: string | null; capitalRecordTo?: string | null }[],
  positions: Position[],
  index: Record<string, PositionTranches>,
  side: CapitalSide = "all",
  sort: TxnSort = "recent",
): CapitalGroup[] {
  const byAcct = new Map<string, CapitalMove[]>();
  for (const m of moves) {
    if (!byAcct.has(m.accountId)) byAcct.set(m.accountId, []);
    byAcct.get(m.accountId)!.push(m);
  }
  const out: CapitalGroup[] = [];
  for (const [accountId, all] of byAcct) {
    // WHAT THE FILTER NARROWS, AND WHAT IT MUST NOT. `ms` is the movements in
    // view — the rows listed, the amounts on each side, the payment count. The
    // account's WHOLE record still decides whether it can carry a return, so a
    // reader who narrows to redemptions does not thereby make an account's
    // contribution history look incomplete.
    const ms = side === "all" ? all : all.filter((m) => m.direction === side);
    if (!ms.length) continue;
    const a = accounts.find((x) => x.accountId === accountId);
    const ins = ms.filter((m) => m.direction === "in");
    const outs = ms.filter((m) => m.direction === "out");
    const paidIn = ins.reduce((s, m) => s + (m.amount ?? 0), 0);
    const tookOut = outs.reduce((s, m) => s + (m.amount ?? 0), 0);
    const sideFiltered = side !== "all";
    // A NET OVER ONE SIDE IS NOT A NET. It would tie to the two columns beside
    // it and describe an account that also moved money the other way, which is
    // the plausible wrong figure this book exists to refuse — so under a filter
    // it, the gain and the return all render absent with the reason.
    const net = sideFiltered ? null : paidIn - tookOut;
    const value = positions.filter((p) => p.accountId === accountId).reduce((s, p) => s + p.marketValue, 0);
    const dates = ms.map((m) => m.date).sort();
    // BOTH ENDS: the record must reach back to inception AND forward to the date
    // the value beside it is struck on (`recordShortfall`).
    const incompleteReason = contributionsAreComplete(accountId, all, positions, index, a?.inceptionDate)
      ?? recordShortfall(a);
    const measurable = !sideFiltered && net !== null && net > 0 && !incompleteReason;
    out.push({
      accountId,
      label: a?.strategy || a?.provider || accountId,
      provider: a?.provider ?? "",
      accountNo: a?.accountNo ?? "",
      owner: a?.owner ?? "",
      // THE EXPANSION FOLLOWS THE SAME ORDER AS THE ROWS ABOVE IT. It was
      // oldest-first unconditionally, so a card set to "recent first" opened
      // every row on its oldest payment — a list ordered one way containing
      // lists ordered the other, which is the ordering complaint one level
      // down. `date` is the only field a movement has, and `sortRows` reads it.
      moves: sortRows(ms.map((m) => ({ ...m })), sort, (m) => m.amount ?? null),
      contributions: ins.length,
      withdrawals: outs.length,
      paidIn, tookOut, net,
      first: dates[0], last: dates[dates.length - 1],
      staggered: ins.length > 1,
      value,
      gain: measurable ? value - net! : null,
      returnPct: measurable ? ((value - net!) / net!) * 100 : null,
      incompleteReason,
      sideFiltered,
    });
  }
  // ORDERED BY THE MODE THE READER CHOSE, and RECENT FIRST by default. This
  // sorted by `paidIn` unconditionally — *"something is October, something is
  // December, something is 2023. It's all very chaotic"* — which answers "what
  // is the biggest" over a table of dated movements. `size` is that ordering,
  // still here and no longer imposed. The accountId is the tie-break at every
  // mode, so the order is stable rather than whatever the Map happened to hold.
  // Sorted by accountId FIRST so the mode's own comparator, which is stable,
  // resolves every tie the same way on every run rather than however the Map
  // happened to be filled.
  out.sort((a, b) => a.accountId.localeCompare(b.accountId));
  return sortRows(out, sort, (g) => g.paidIn);
}

/** Column totals, summed FROM the rows so the footer cannot disagree with them. */
export function capitalTotals(groups: CapitalGroup[]) {
  return {
    accounts: groups.length,
    contributions: groups.reduce((a, g) => a + g.contributions, 0),
    withdrawals: groups.reduce((a, g) => a + g.withdrawals, 0),
    paidIn: groups.reduce((a, g) => a + g.paidIn, 0),
    tookOut: groups.reduce((a, g) => a + g.tookOut, 0),
    // A COLUMN OF DASHES HAS NO TOTAL. Under a side filter every row's net is
    // absent, and summing them as zero would print a ₹0 net under a table that
    // is refusing to state one — §"never blend a missing value into a total as
    // zero", arriving through a footer.
    net: groups.some((g) => g.net === null) ? null : groups.reduce((a, g) => a + (g.net ?? 0), 0),
    value: groups.reduce((a, g) => a + g.value, 0),
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
