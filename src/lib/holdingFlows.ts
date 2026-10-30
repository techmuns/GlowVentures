/**
 * ── A HOLDING'S OWN DATED MONEY (Stage 10fw) ────────────────────────────────
 *
 *   *"We need to also make sure that we are accounting for all the dates to
 *    calculate the returns everywhere on the dashboard, so that the returns
 *    are logically correct."*
 *
 * A holding's annual rate was struck one of two ways, and both ignored dates
 * the book carries. Where a lot register dated it, CAGR compounded its whole
 * return from the OLDEST lot — so Crompton Greaves, bought for ₹9.88 L in March
 * 2025 and ₹5.59 L in November, was annualised as if all ₹15.47 L went in in
 * March, and its rate came out understated. Where its account's trades dated
 * every unit (Stage 10fm), nothing used them: XIRR was refused for every
 * holding, "the statements cover the current period only".
 *
 * So the money each holding's dates account for is read here, once, for every
 * surface: each buy as money in on its day, each sale and each dividend as
 * money out on its day, and the statement's value on the statement's date. That
 * is what `datedCapital.behind` pools for a row that is holdings rather than
 * whole accounts, and what the family's rule then reads exactly as it reads an
 * account's: under a year the holding-period return, one payment compounded,
 * several solved as XIRR.
 *
 * ── ONLY WHERE THE DATES ACCOUNT FOR EVERY RUPEE ────────────────────────────
 *
 *  - TRADES: the account's dated trades account for every unit held
 *    (`tradeRecord.unaccounted === 0`, Stage 10fm), every one of them prints a
 *    settled amount, and every dividend of the holding is dated.
 *  - LOTS: a lot register accounts for every unit held (`heldSince`'s gate),
 *    and no unit of the holding was sold — the register dates only what is still
 *    held, so money that came back would be missing from the rate.
 *  - RECOVERED (Stage 10jf): a supplementary record that reconciles to this
 *    account, ISIN and every unit held (`Position.recoveredCost`) dates each
 *    purchase, sale and receipt. Only on a line its statement values: a value
 *    only a live quote gives would close the record on a date no statement
 *    reached, and a holding with later sales needs a newer balance first.
 *
 * Anything short of that dates part of the money, and a rate over part of it
 * is the partial return this book refuses (Stage 10fc). A holding with no dated
 * record at all returns null: the caller keeps its own per-holding answer.
 */
import { BOOK_HOLDING_INCOME, BOOK_HOLDING_LOTS, BOOK_HOLDING_TRADES } from "@/data/glowData";
import { acquisitionIdentity } from "../../shared/fundUnitActions.mjs";
import type { Position, RecoveredHoldingCost } from "./types";

export type HoldingFlowBasis = "trades" | "lots" | "recovered";

export type HoldingFlows =
  | {
      dated: true;
      basis: HoldingFlowBasis;
      /** Money in negative, money out positive, oldest first — the terminal value is `close`. */
      flows: { date: string; amount: number }[];
      /** How many purchases and sales — the payments the family's rule counts. Dividends are not one. */
      payments: number;
      /** The first purchase. */
      since: string;
      /** The statement's value on the statement's date; null where the holding is sold out. */
      close: { date: string; value: number } | null;
    }
  | { dated: false; reason: string };

const keyOf = (p: Pick<Position, "accountId" | "securityKey">) => `${p.accountId}|${p.securityKey}`;

/** The recovered record that is exactly this line's — the gate `investedOn` dates it through. */
function recoveredRecordOf(p: Position): RecoveredHoldingCost["cashRecord"] | null {
  const r = p.recoveredCost;
  if (!r?.cashRecord?.length || r.hprUnavailableReason || r.salesAfter || p.rolledForward) return null;
  const id = acquisitionIdentity(p);
  if (r.accountId !== id.accountId || r.isin !== id.isin || id.quantity == null || Math.abs(r.quantity - id.quantity) > .0005) return null;
  return r.cashRecord;
}

/**
 * EVERY LINE'S MONEY IS DATED BY ITS RECOVERED RECORD, BUT A LINE IS VALUED
 * ONLY AT A LIVE PRICE OR A PUBLISHED NAV (Stage 10ji) — the rows `holdingFlowsOf`
 * leaves undated because no statement values them. Their blank rate names that,
 * not a missing purchase date they do not lack.
 */
const RECORDED = new WeakMap<Position, boolean>();
const recorded = (p: Position) => {
  let r = RECORDED.get(p);
  if (r === undefined) { r = !!recoveredRecordOf(p); RECORDED.set(p, r); }
  return r;
};
export const datedButUnvalued = (ps: readonly Position[]): boolean =>
  ps.length > 0 && ps.some((p) => !!p.live || !!p.priceEvidence) && ps.every(recorded);

/** The holding's dividends inside a window — or the first one no statement dates. */
function incomeIn(key: string, from: string, to: string): { rows: { date: string; amount: number }[]; undated: boolean } {
  const all = BOOK_HOLDING_INCOME[key] ?? [];
  if (all.some((x) => !x.date)) return { rows: [], undated: true };
  return { rows: all.filter((x) => x.date! >= from && x.date! <= to).map((x) => ({ date: x.date!, amount: x.amount })), undated: false };
}

/**
 * ONE STATEMENT LINE'S DATED MONEY — or null where nothing dates every unit of
 * it. `p` is the STATEMENT line (its value is the statement's), and `asOf` its
 * account's statement date, where a lot-dated line closes.
 */
export function holdingFlowsOf(p: Position, asOf: string | null): HoldingFlows | null {
  const key = keyOf(p);
  const r = p.tradeRecord;
  if (r && r.unaccounted === 0) {
    const trades = (BOOK_HOLDING_TRADES[key] ?? []).filter((t) => t.date >= r.from && t.date <= r.to);
    if (!trades.length) return null;
    const unpriced = trades.find((t) => t.amount === null);
    if (unpriced) {
      return { dated: false, reason: `its ${unpriced.side === "buy" ? "purchase" : "sale"} on ${unpriced.date} prints no settled amount, so the money its dated trades moved is not all known` };
    }
    const inc = incomeIn(key, r.from, r.to);
    if (inc.undated) return { dated: false, reason: "a dividend it was paid carries no date on its statement, so its money cannot all be placed on the day it moved" };
    const flows = [
      ...trades.map((t) => ({ date: t.date, amount: t.side === "buy" ? -(t.amount as number) : (t.amount as number) })),
      ...inc.rows,
    ].sort((a, b) => a.date.localeCompare(b.date));
    return {
      dated: true, basis: "trades", flows, payments: trades.length,
      since: trades.find((t) => t.side === "buy")?.date ?? trades[0].date,
      close: p.marketValue > 0 ? { date: r.to, value: p.marketValue } : null,
    };
  }
  const lots = BOOK_HOLDING_LOTS[key];
  if (p.heldSince && lots?.length && asOf) {
    if ((p.costOfUnitsSold ?? 0) > 0) {
      return { dated: false, reason: "units of it were sold, and its lot register dates only the units still held, so the money that came back is not on it" };
    }
    const inc = incomeIn(key, lots[0].date, asOf);
    if (inc.undated) return { dated: false, reason: "a dividend it was paid carries no date on its statement, so its money cannot all be placed on the day it moved" };
    const flows = [...lots.map((l) => ({ date: l.date, amount: -l.cost })), ...inc.rows].sort((a, b) => a.date.localeCompare(b.date));
    return {
      dated: true, basis: "lots", flows, payments: lots.length, since: lots[0].date,
      close: p.marketValue > 0 ? { date: asOf, value: p.marketValue } : null,
    };
  }
  const record = recoveredRecordOf(p);
  if (record && asOf && !p.live && !p.priceEvidence) {
    const trades = record.filter((x) => x.side !== "income");
    return {
      dated: true, basis: "recovered",
      flows: record.map((x) => ({ date: x.date, amount: x.side === "buy" ? -x.amount : x.amount })),
      payments: trades.length,
      since: trades.find((x) => x.side === "buy")?.date ?? trades[0].date,
      close: p.marketValue > 0 ? { date: asOf, value: p.marketValue } : null,
    };
  }
  return null;
}

/**
 * ── WHEN THE CURRENT HOLDING BEGAN, WHERE ITS TRADES PROVE IT (Stage 10fw) ──
 *
 * A year-to-date return on a holding needs its value on 1 January — unless it
 * held nothing that day, when its whole return since it was opened IS its year
 * to date. Only a dated record from a nil opening can show that: `nilSince` is
 * the day from which the holding is on record as holding nothing, `openedOn`
 * the buy that began the units it holds now. A row of several lines is nil from
 * the LATEST of their nil days to the EARLIEST of their openings — the span in
 * which every one of them held nothing. Null where any line's trades do not
 * account for every unit it holds.
 */
export type HoldingPeriod = { nilSince: string; openedOn: string };

/** A recovered record runs from a nil balance, so no date opens its nil span. */
const NIL_BEFORE_THE_RECORD = "0001-01-01";

export function holdingPeriodOf(ps: readonly Position[]): HoldingPeriod | null {
  let nilSince: string | null = null, openedOn: string | null = null;
  for (const p of ps) {
    const r = p.tradeRecord;
    // A recovered replay left no shortfall and closes on exactly the units held,
    // so the holding is on record as holding nothing before its first row.
    const held = !r && recoveredRecordOf(p) ? p.recoveredCost!.heldPurchases : null;
    if (held) {
      if (nilSince === null) nilSince = NIL_BEFORE_THE_RECORD;
      if (openedOn === null || held.first < openedOn) openedOn = held.first;
      continue;
    }
    if (!r || r.unaccounted !== 0 || !(p.quantity && p.quantity > 0)) return null;
    let qty = 0, nil = r.from, opened: string | null = null;
    for (const t of (BOOK_HOLDING_TRADES[keyOf(p)] ?? []).filter((x) => x.date >= r.from && x.date <= r.to)) {
      if (t.quantity === null) return null;
      if (t.side === "buy") {
        if (qty <= 1e-6) opened = t.date;
        qty += t.quantity;
      } else {
        qty -= t.quantity;
        if (qty <= 1e-6) { qty = 0; nil = t.date; opened = null; }
      }
    }
    if (!opened) return null;
    if (nilSince === null || nil > nilSince) nilSince = nil;
    if (openedOn === null || opened < openedOn) openedOn = opened;
  }
  return nilSince && openedOn ? { nilSince, openedOn } : null;
}
