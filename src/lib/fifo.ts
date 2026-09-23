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
      if (all.length && all.every((p) => keys.has(p.securityKey))) whole.add(acct);
    }
  }

  let marketValue = 0, uncostedValue = 0, uncosted = 0, realisedCovered = 0;
  let costHeld: number | null = null, unrealised: number | null = null;
  let realised: number | null = null, deployed: number | null = null, invested: number | null = null;
  let wholeCostHeld = 0, wholeContributed = 0, wholeWithdrawn = 0;
  const add = (a: number | null, b: number) => (a ?? 0) + b;

  const mandateMV = new Map<string, number>();
  const mandateCost = new Map<string, number>();
  for (const p of set) {
    marketValue += p.marketValue;
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
  const covers = costCoversSet(marketValue, uncostedValue) || (marketValue === 0 && isNum(deployed) && deployed > 0);
  const returnPct = covers && gain !== null && isNum(deployed) && deployed > 0 ? (gain / deployed) * 100 : null;
  return {
    marketValue, costHeld, unrealised, realised, deployed, invested, gain, returnPct,
    wholeCostHeld, wholeContributed, wholeWithdrawn,
    uncostedValue, uncosted, realisedCovered, holdings: set.length, wholeMandates: [...whole].sort(),
  };
}

/**
 * The words for a FIFO total's arithmetic, for a cell's hover: what was added,
 * over what. A reader dividing Unrealised by Invested gets a different number,
 * and this is where they learn why.
 */
export function fifoBasisNote(t: FifoTotals, money: (n: number) => string): string {
  if (t.returnPct === null || t.gain === null || t.deployed === null) return "";
  const parts = [`FIFO: (unrealised ${money(t.unrealised ?? 0)} + realised ${money(t.realised ?? 0)}) ÷ capital deployed ${money(t.deployed)}`];
  if (t.wholeMandates.length) {
    parts.push(`${t.wholeMandates.length} whole mandate(s) are struck on their capital since inception — value plus withdrawals less what was paid in — so their realised includes every sale since inception and the income less fees`);
  }
  parts.push("capital deployed is the cost of the units still held plus the cost of the units already sold");
  return parts.join(" · ");
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

/** Why a holding's realised cell is empty, in the book's own terms. */
export function realisedReason(p: Pick<Position, "realizedPnL" | "realizedLotsAfter">): string {
  if (p.realizedLotsAfter) {
    return `${p.realizedLotsAfter} sale(s) of this holding came after its statement's date, so those units are still in it at that statement's mark — the gain is on the capital gain statement and is not added here`;
  }
  return "no capital gain statement or dated unit record covers this account, so what its sales realised is not reported";
}

/** Convenience for one holding: its own FIFO return, recomputed from its fields. */
export const positionFifoReturn = (p: Position): number | null =>
  costed(p) ? fifoReturnPct(p.marketValue, p.costBasis, p.realizedPnL, p.costOfUnitsSold) : null;
