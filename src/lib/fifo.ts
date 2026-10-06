/**
 * ── FIFO, AGGREGATED — THE ONE PLACE A SET OF HOLDINGS BECOMES A RETURN ──────
 *
 * *"Everything in the returns part and all the calculations on the dashboard
 * need to be accounted for using the methodology of FIFO … make sure that this
 * is implemented every single place on the dashboard wherever we are showing
 * returns."*
 *
 * Every holding in the book carries its FIFO figures (`build-book`, through
 * `shared/fifo.mjs`): the cost of the units still held, the realised gain on the
 * units already sold and what those sold units cost. This file turns ANY set of
 * them — one row, one category, one mandate, one owner, the whole book — into
 * one return, so no screen divides its own way.
 *
 *   return = (unrealised + realised) ÷ capital deployed
 *
 * where, per holding, capital deployed is the cost of the units held plus the
 * cost of the units sold. It is the same formula `fifoReturnPct` strikes per
 * holding, summed before it is divided — never an average of the holdings'
 * percentages, which would weight a ₹50,000 position like a ₹50 Cr one.
 *
 * ── WHAT WAS WRONG, WHICH IS WHAT THIS REPLACES ─────────────────────────────
 *
 * Every aggregate on this dashboard was `Σ unrealised ÷ Σ cost of what is still
 * held`. That leaves out the gain on every unit already sold — so a mandate that
 * sells its winners reads as if it had never made them. V.E.C 128004 read 8.42%
 * on its surviving shares; the fund's own since-inception record (₹1.05 Cr
 * realised, ₹50.5 L unrealised, ₹3.8 L income, ₹9.0 L fees on ₹5 Cr paid in)
 * says 30.10%.
 *
 * ── A WHOLE MANDATE IS STRUCK ON ITS CAPITAL ─────────────────────────────────
 *
 * A PMS mandate's positions carry the realised gain their capital gain
 * statement's WINDOW reports, and nothing it sold before that window. Where a
 * set contains EVERY holding of a mandate, the mandate needs no matching at all:
 * the family paid capital in and the account is worth what its holdings are
 * worth, so everything it has earned is
 *
 *   value + withdrawn − contributed          over     contributed
 *
 * which is FIFO's own total — however units are matched, cost held plus cost
 * sold is what was put in. The unrealised half is still the holdings' own
 * (value − cost held); the rest is REALISED, which here includes the income the
 * manager collected less the fees it charged, because that is what the capital
 * shows and there is no statement that separates them per share.
 *
 * A set holding only PART of a mandate (a sector, a filter, one share) is struck
 * holding by holding: a mandate's capital cannot be divided among its shares.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 *
 * A holding with no cost contributes no return and is COUNTED (`uncostedValue`),
 * never blended in at a cost of zero; the caller refuses the figure where that
 * uncosted part is material (`costCoversSet`). A holding with no realised record
 * contributes a realised of nothing measured, and is counted too.
 */
import type { Account, Position } from "./types";
import { costCoversSet, currentHoldings } from "./analytics";
import { fifoReturnPct } from "../../shared/fifo.mjs";

export { fifoReturnPct };

export type FifoTotals = {
  /** Σ market value over the set. */
  marketValue: number;
  /** Σ cost of the units still held, over the holdings that report one. */
  costHeld: number | null;
  /** Σ (value − cost held), over the same holdings. */
  unrealised: number | null;
  /**
   * Everything already booked: the FIFO realised gain on units sold, and for a
   * whole mandate everything its capital shows beyond the unrealised half.
   * NULL where no holding in the set has a realised record at all.
   */
  realised: number | null;
  /** The capital behind the return — cost held + cost sold, or a mandate's capital paid in. */
  deployed: number | null;
  /**
   * WHAT AN "INVESTED" COLUMN PRINTS FOR THIS SET: the cost of the units still
   * held, except that a WHOLE mandate enters at the capital the family paid
   * into it (`capital.contributed`). NULL where nothing in the set is costed.
   *
   * *"Invested shows what FIFO divides by: ₹121.7 Cr paid into the PMS
   * mandates, with ₹124.6 Cr (cost of shares held) in the hover."* A whole
   * mandate's return is struck on its capital; printed beside the cost of its
   * surviving shares it divides one figure by another a reader cannot see. It
   * is NOT `deployed`: a holding struck holding by holding stays at the cost of
   * what is held, because Invested and Unrealised must still add to its value.
   */
  invested: number | null;
  /** The whole mandates' own cost held, paid in and withdrawn — for the hover that names both bases. */
  wholeCostHeld: number;
  wholeContributed: number;
  wholeWithdrawn: number;
  /** unrealised + realised. */
  gain: number | null;
  /** gain ÷ deployed, in percent — NULL where cost does not cover the set. */
  returnPct: number | null;
  /** Market value of the holdings that report no cost, and how many. */
  uncostedValue: number;
  uncosted: number;
  /**
   * HELD AT COST (Stage 10dh): the review lines whose value IS what was paid.
   * Their cost is in `invested` — it is capital the family put in — and their
   * value in `marketValue`; they are in no gain and no capital deployed, so a
   * return over them is never a 0% blended in. Counted against coverage, like
   * a holding with no cost: a set mostly at cost refuses its return.
   */
  atCostValue: number;
  atCost: number;
  /** Holdings with no realised record, and how many carry one. */
  realisedCovered: number;
  holdings: number;
  /** The mandates struck whole on their capital, by accountId. */
  wholeMandates: string[];
};

type AccountIndex = Map<string, Account> | Record<string, Account> | Account[];

const accountOf = (idx: AccountIndex | undefined, id: string): Account | undefined => {
  if (!idx) return undefined;
  if (idx instanceof Map) return idx.get(id);
  if (Array.isArray(idx)) return idx.find((a) => a.accountId === id);
  return idx[id];
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const costed = (p: Position) => !p.costUnavailable && isNum(p.costBasis);
/** A review line held at cost: a cost, and no valuation to strike a gain on (Stage 10dh). */
const atCostLine = (p: Position) => p.valuedAtCost === true && costed(p);

export type FifoOptions = {
  /** The accounts, for a mandate's capital. Without them nothing is struck whole. */
  accounts?: AccountIndex;
  /**
   * Every holding of the book the set was drawn from — what "every holding of a
   * mandate" is measured against. Without it nothing is struck whole.
   */
  universe?: readonly Position[];
};

/**
 * The FIFO totals of a set of holdings. The set is taken as given — a caller
 * that wants each duplicated holding counted once passes the deduped set.
 */
export function fifoTotals(set: readonly Position[], opts: FifoOptions = {}): FifoTotals {
  const { accounts, universe } = opts;

  // WHICH MANDATES ARE WHOLE IN THIS SET. Compared on the (account, security)
  // pairs the universe holds, so a filter that drops one share of a mandate
  // drops the mandate back to holding-by-holding.
  const whole = new Set<string>();
  if (accounts && universe) {
    // Measured against what the family CURRENTLY holds: a closed position or a
    // sub-₹1,000 speck is on no holdings table, so its absence from a set must
    // not stop the rest of the mandate counting as whole.
    const held = currentHoldings(universe as Position[]);
    const inSet = new Map<string, Set<string>>();
    for (const p of set) {
      if (!inSet.has(p.accountId)) inSet.set(p.accountId, new Set());
      inSet.get(p.accountId)!.add(p.securityKey);
    }
    for (const [acct, keys] of inSet) {
      const a = accountOf(accounts, acct);
      const cap = a?.capital;
      if (a?.engagement !== "PMS" || !cap || !(cap.contributed > 0)) continue;
      const all = held.filter((p) => p.accountId === acct);
      if (all.length) {
        if (all.every((p) => keys.has(p.securityKey))) whole.add(acct);
        continue;
      }
      /**
       * A MANDATE THAT HOLDS NOTHING TODAY IS STILL A MANDATE (Stage 10df).
       * ASK closed both of its accounts and left a bank balance of ₹0.34 and
       * ₹0.01, which the ₹1,000 floor keeps off every holdings table — so the
       * test above found nothing held and the account was never whole. Its own
       * page then struck the return on the 34 paise, 0.00% on ₹0 deployed,
       * while its capital record says ₹8.5 Cr went in and ₹15.12 Cr came back:
       * +77.90%, the figure the Transactions card already prints.
       *
       * Whole here only where the set IS the account — every row of it, and no
       * row of any other account. A closed mandate's capital is the answer to
       * "what did this account earn"; it is not the answer for a set that only
       * shares a security with it, such as one cash line held in two accounts.
       */
      const raw = (universe as Position[]).filter((p) => p.accountId === acct);
      if (raw.length && set.every((p) => p.accountId === acct) && raw.every((p) => keys.has(p.securityKey))) {
        whole.add(acct);
      }
    }
  }

  let marketValue = 0, uncostedValue = 0, uncosted = 0, realisedCovered = 0, atCostValue = 0, atCost = 0;
  let costHeld: number | null = null, unrealised: number | null = null;
  let realised: number | null = null, deployed: number | null = null, invested: number | null = null;
  let wholeCostHeld = 0, wholeContributed = 0, wholeWithdrawn = 0;
  const add = (a: number | null, b: number) => (a ?? 0) + b;

  const mandateMV = new Map<string, number>();
  const mandateCost = new Map<string, number>();
  for (const p of set) {
    marketValue += p.marketValue;
    /**
     * A LINE HELD AT COST IS CAPITAL IN AND NOTHING ELSE. Its cost is what the
     * family paid, so it is in `invested`; its value is that same cost, so a
     * gain struck on it would be a 0% nobody measured. It enters neither the
     * gain nor the capital deployed, and is counted against coverage below.
     * No review line sits in a PMS mandate, so this never meets a whole one.
     */
    if (atCostLine(p) && !whole.has(p.accountId)) {
      atCostValue += p.marketValue; atCost += 1;
      invested = add(invested, p.costBasis as number);
      continue;
    }
    if (whole.has(p.accountId)) {
      mandateMV.set(p.accountId, (mandateMV.get(p.accountId) ?? 0) + p.marketValue);
      if (costed(p)) {
        mandateCost.set(p.accountId, (mandateCost.get(p.accountId) ?? 0) + (p.costBasis as number));
        costHeld = add(costHeld, p.costBasis as number);
        unrealised = add(unrealised, p.marketValue - (p.costBasis as number));
      } else { uncostedValue += p.marketValue; uncosted += 1; }
      realisedCovered += 1;
      continue;
    }
    if (!costed(p)) { uncostedValue += p.marketValue; uncosted += 1; continue; }
    const c = p.costBasis as number;
    costHeld = add(costHeld, c);
    invested = add(invested, c);
    unrealised = add(unrealised, p.marketValue - c);
    const sold = isNum(p.costOfUnitsSold) ? p.costOfUnitsSold : 0;
    deployed = add(deployed, c + sold);
    if (isNum(p.realizedPnL)) { realised = add(realised, p.realizedPnL); realisedCovered += 1; }
  }
  for (const acct of whole) {
    const cap = accountOf(accounts!, acct)!.capital!;
    const mv = mandateMV.get(acct) ?? 0;
    const gain = mv + cap.withdrawn - cap.contributed;
    const unr = mv - (mandateCost.get(acct) ?? 0);
    realised = add(realised, gain - unr);
    deployed = add(deployed, cap.contributed);
    invested = add(invested, cap.contributed);
    wholeCostHeld += mandateCost.get(acct) ?? 0;
    wholeContributed += cap.contributed;
    wholeWithdrawn += cap.withdrawn;
  }

  const gain = unrealised === null && realised === null ? null : (unrealised ?? 0) + (realised ?? 0);
  const covers = costCoversSet(marketValue, uncostedValue + atCostValue) || (marketValue === 0 && isNum(deployed) && deployed > 0);
  const returnPct = covers && gain !== null && isNum(deployed) && deployed > 0 ? (gain / deployed) * 100 : null;
  return {
    marketValue, costHeld, unrealised, realised, deployed, invested, gain, returnPct,
    wholeCostHeld, wholeContributed, wholeWithdrawn,
    uncostedValue, uncosted, atCostValue, atCost, realisedCovered, holdings: set.length, wholeMandates: [...whole].sort(),
  };
}

/**
 * The words for a FIFO total's arithmetic, for a cell's hover: what was added,
 * over what. A reader dividing Unrealised by Invested gets a different number,
 * and this is where they learn why.
 */
export function fifoBasisNote(t: FifoTotals, money: (n: number) => string): string {
  if (t.returnPct === null || t.gain === null || t.deployed === null) return "";
  const n = t.wholeMandates.length;
  /**
   * A SET THAT IS WHOLE MANDATES AND NOTHING ELSE IS A RETURN ON CAPITAL, NOT
   * LOT FIFO (DL-7) — and it said lot FIFO. Carnelian's 19.91% is (value +
   * withdrawn − paid in) ÷ paid in: the capital bridge, which carries income and
   * fees, because a mandate's lots are not all on record. The old last clause,
   * "capital deployed is the cost of the units still held plus the cost of the
   * units already sold", was false of every such set. It is named for what it
   * is here, and the lot clause is kept only for the holdings it describes.
   */
  if (n > 0 && Math.abs(t.deployed - t.wholeContributed) <= 1) {
    return `Return on capital, not lot FIFO: (value ${money(t.marketValue - t.atCostValue)} + withdrawn ${money(t.wholeWithdrawn)} − paid in ${money(t.wholeContributed)}) ÷ paid in ${money(t.wholeContributed)}`
      + ` · ${n === 1 ? "a whole mandate is" : `${n} whole mandates are`} struck on the capital since inception, so the gain carries every sale the manager made and the income less fees; its lots are not all on record`
      + (t.atCost > 0 ? ` · ${atCostNote(t, money)}` : "");
  }
  const parts = [`FIFO: (unrealised ${money(t.unrealised ?? 0)} + realised ${money(t.realised ?? 0)}) ÷ capital deployed ${money(t.deployed)}`];
  if (n) {
    parts.push(`${n === 1 ? "1 whole mandate enters" : `${n} whole mandates enter`} on ${n === 1 ? "its" : "their"} capital since inception — value plus withdrawals less what was paid in — so ${n === 1 ? "its" : "their"} realised includes every sale since inception and the income less fees, and ${n === 1 ? "its" : "their"} capital deployed is the capital paid in`);
  }
  parts.push(n
    ? "for every other holding, capital deployed is the cost of the units still held plus the cost of the units already sold"
    : "capital deployed is the cost of the units still held plus the cost of the units already sold");
  if (t.atCost > 0) parts.push(atCostNote(t, money));
  return parts.join(" · ");
}

/**
 * The words for the lines a FIFO total leaves out because they are HELD AT
 * COST (Stage 10dh): what they are worth, and why no gain is struck on them.
 * Empty where the set holds none.
 */
export function atCostNote(t: Pick<FifoTotals, "atCost" | "atCostValue">, money: (n: number) => string): string {
  if (!(t.atCost > 0)) return "";
  return `${t.atCost === 1 ? "1 private investment" : `${t.atCost} private investments`} held at cost (${money(t.atCostValue)}) ${t.atCost === 1 ? "is" : "are"} in Invested and in the value, and in no gain: the family's consolidated review records what was paid and no valuation`;
}

/**
 * ── THE WINDOW A HOLDING'S REALISED FIGURE COVERS (DL-10) ────────────────────
 *
 * A holding's realised gain is what its account's CAPITAL GAIN STATEMENT
 * reports, and that statement covers a window — most from 1 Apr 2026, Molecule's
 * June alone — or, for a fund folio, what the fund's own dated unit record
 * shows since the first allotment. The hover read "matched first-in, first-out
 * by the statement that sold them" and named no window, so a ₹0 there read as
 * "never sold a unit" where it means "sold none inside the window". The words
 * say which record, and over what dates.
 */
export function realisedWindowNote(
  /** The capital gain statement window of each account behind the figure. */
  windows: readonly { from: string | null; to: string | null }[],
  /** How many accounts' realised comes from a fund's own dated unit record instead. */
  fromRecord: number,
  fmtDate: (d: string) => string,
): string {
  const span = (w: { from: string | null; to: string | null }) =>
    w.from && w.to ? `${fmtDate(w.from)} – ${fmtDate(w.to)}` : w.to ? `to ${fmtDate(w.to)}` : "an undated window";
  const by = new Map<string, number>();
  for (const w of windows) by.set(span(w), (by.get(span(w)) ?? 0) + 1);
  const parts: string[] = [];
  if (by.size === 1) {
    parts.push(`over the window of ${windows.length === 1 ? "this account's" : "these accounts'"} capital gain statement, ${[...by.keys()][0]}; a sale before it is on no statement in this book and is not in this figure`);
  } else if (by.size > 1) {
    parts.push(`over each account's capital gain statement window — ${[...by].map(([k, c]) => `${k} (${c} ${c === 1 ? "account" : "accounts"})`).join("; ")} — and a sale before its window is not in this figure`);
  }
  if (fromRecord > 0) {
    parts.push(`${fromRecord === 1 ? "one fund folio's" : `${fromRecord} fund folios'`} from the fund's own dated unit record, every allotment and redemption since the first`);
  }
  return `Realised on units already sold, matched first-in, first-out, ${parts.join("; and ") || "by the record that sold them"}.`;
}

/**
 * A cost-held total — `sumOrNull` over `costBasis` — with each WHOLE mandate in
 * the set swapped for its capital paid in: the figure an Invested column prints
 * for a set that may mix whole mandates with everything else. A caller that
 * already summed the cost its own way keeps its own null semantics this way,
 * rather than trading them for `invested`'s.
 */
export const investedWithCapital = (cost: number | null, f: FifoTotals): number | null =>
  cost === null ? null : cost - f.wholeCostHeld + f.wholeContributed;

/**
 * The words for an Invested cell whose set holds a whole mandate: which figure
 * is printed, and the other basis beside it. Empty where the set holds none —
 * there the printed figure IS the cost of what is held, and needs no note.
 */
export function investedBasisNote(t: FifoTotals, money: (n: number) => string): string {
  if (!t.wholeMandates.length) return "";
  const n = t.wholeMandates.length;
  const parts = [
    `${n === 1 ? "This mandate enters" : `${n} whole mandates enter`} at the capital paid in, ${money(t.wholeContributed)} — what its return is divided by`,
    `the cost of the shares ${n === 1 ? "it holds" : "they hold"} now is ${money(t.wholeCostHeld)}, and Unrealised P&L is struck on that`,
  ];
  if (t.wholeWithdrawn > 0) parts.push(`${money(t.wholeWithdrawn)} has been withdrawn since inception, so Invested + Unrealised + Realised comes to the value plus that`);
  return parts.join(" · ");
}

/**
 * ── WHAT A REALISED TOTAL COUNTS, AND WHAT IT LEAVES OUT (MH-05, DL-5, DL-10) ─
 *
 * The Monitor's Realised footer and Capital Gains print different figures for
 * one book, and both are right on their own terms: the capital gain
 * statements' own total is the TAX figure — every lot sold inside each
 * statement's window, companies since sold out included — while this table is
 * FIFO over what the family holds now. A whole mandate carries everything it
 * has booked since it opened (its value plus withdrawals, less the capital paid
 * in and the unrealised gain on what it holds): every sale since inception, and
 * its income less its fees. A holding carries what its own record reports on
 * units sold — a capital gain statement's lots over THAT statement's window, or
 * a fund's dated unit record since its first allotment.
 *
 * Neither the cell nor its hover named the basis, so a reader comparing the two
 * pages found a contradiction and no way to resolve it. This is the one place
 * the words are chosen: a SHORT line for the face of the cell, and the whole
 * basis — what it covers, the statements' own figure beside it, and what it
 * leaves out — for its hover. The facts are the caller's, measured on the book.
 */
export type RealisedBasisFacts = {
  /** The capital gain statements' own total and window, over the accounts in view that issue one. */
  statements: { total: number; accounts: number; from: string | null; to: string | null } | null;
  /** Holdings no longer held (redeemed in full) whose own record carries a realised gain. */
  closed: { names: string[]; realised: number };
  /** Holdings under the ₹1,000 floor, which no row lists, whose own record carries a realised gain. */
  floor: { holdings: number; realised: number };
  /** Sales dated after a holding's own statement: the units are still in that statement's holding. */
  after: { sales: number; holdings: number };
  /** The table's rows are companies (the security axis): a company sold out entirely is no row at all. */
  companiesOnly: boolean;
  /** Holdings outside the whole mandates that carry a realised record of their own. */
  recorded: number;
};

export function realisedBasisNote(
  t: FifoTotals, f: RealisedBasisFacts, money: (n: number) => string, date: (iso: string) => string,
): { face: string; note: string } {
  const n = t.wholeMandates.length;
  const others = f.recorded > 0;
  // THE FACE: which of the book's realised figures this is, in a few words —
  // what it counts, and that what the family has sold out of is not in it.
  const face = f.companiesOnly ? "names still held · statement windows"
    : n ? `incl. ${n} mandate${n === 1 ? "" : "s"} since inception · excl. names exited outside ${n === 1 ? "it" : "them"}`
    : "each record's own window · excl. names exited";
  const win = f.statements && f.statements.from && f.statements.to
    ? `${date(f.statements.from)} to ${date(f.statements.to)}` : null;
  const parts: string[] = [];
  if (n) {
    parts.push(`${n === 1 ? "One PMS mandate is" : `${n} PMS mandates are`} whole in this table, so ${n === 1 ? "it carries" : "each carries"} everything it has booked since it opened: its value plus withdrawals, less the capital paid in and less the unrealised gain on what it holds now — every sale its manager made since inception, and its income less its fees`);
  }
  if (others) {
    parts.push(`${n ? "Every other holding" : "Each holding"} carries what its own record reports on units already sold, matched first-in, first-out: a capital gain statement's lots over that statement's own window${win ? ` (the statements here run ${win}, each over its own)` : ""}, or a fund's dated unit record since its first allotment — a sale before a statement's window is not in it`);
  }
  if (f.statements) {
    parts.push(`The capital gain statements themselves report ${money(f.statements.total)} across ${f.statements.accounts} account${f.statements.accounts === 1 ? "" : "s"}${win ? ` for ${win}` : ""}: the tax figure Capital Gains and the Ledger print, which counts every lot in those windows, companies since sold out included${n ? ", and none of a mandate's income or fees" : ""}`);
  }
  const out: string[] = [];
  out.push(f.companiesOnly ? "a company sold out entirely, which is no row here"
    : n ? "a company sold out entirely outside those mandates, which is no row here"
    : "a holding sold out entirely, which is no row here");
  if (f.closed.names.length) out.push(`${f.closed.names.join(", ")} — redeemed in full, so no row here (${money(f.closed.realised)} realised, on its own page and in Transactions)`);
  if (f.floor.holdings > 0) out.push(`${f.floor.holdings} holding${f.floor.holdings === 1 ? "" : "s"} under the ₹1,000 floor, which no row lists (${money(f.floor.realised)} realised)`);
  if (f.after.sales > 0) out.push(`${f.after.sales} sale${f.after.sales === 1 ? "" : "s"} of ${f.after.holdings} holding${f.after.holdings === 1 ? "" : "s"} dated after that holding's own statement — the units are still in the statement's holding at its mark, so the gain is on the capital gain statement and not added here`);
  if (out.length) parts.push(`Not in this total: ${out.join("; ")}`);
  return { face, note: `${parts.join(". ")}.` };
}

/** Why a holding's realised cell is empty, in the book's own terms. */
export function realisedReason(p: Pick<Position, "realizedPnL" | "realizedLotsAfter">): string {
  if (p.realizedLotsAfter) {
    return `${p.realizedLotsAfter} sale(s) of this holding came after its statement's date, so those units are still in it at that statement's mark — the gain is on the capital gain statement and is not added here`;
  }
  return "no capital gain statement or dated unit record covers this account, so what its sales realised is not reported";
}

/** Convenience for one holding: its own FIFO return, recomputed from its fields. */
export const positionFifoReturn = (p: Position): number | null =>
  costed(p) && !atCostLine(p) ? fifoReturnPct(p.marketValue, p.costBasis, p.realizedPnL, p.costOfUnitsSold) : null;
