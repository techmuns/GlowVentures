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
 *    purchase, sale and receipt. A holding with later sales needs a newer
 *    balance first.
 *
 * Each closes on its statement's value and date — or, on a line the market
 * prices, on that price's own date, the units assumed still held (Stage 10jo).
 *
 * Anything short of that dates part of the money, and a rate over part of it
 * is the partial return this book refuses (Stage 10fc). A holding with no dated
 * record at all returns null: the caller keeps its own per-holding answer.
 */
import { BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_HOLDING_INCOME, BOOK_HOLDING_LOTS, BOOK_HOLDING_TRADES, BOOK_SHARE_MOVEMENTS } from "@/data/glowData";
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
      /**
       * SET WHERE THE MARKET PRICES THE LINE (Stage 10jo): `close` is its live
       * price or published NAV on that price's own date, and the units are the
       * statement's of `from`, assumed still held since.
       */
      market?: { from: string; kind: "quote" | "published-nav" };
    }
  | { dated: false; reason: string };

const keyOf = (p: Pick<Position, "accountId" | "securityKey">) => `${p.accountId}|${p.securityKey}`;

/** The recovered record that is exactly this line's — the gate `investedOn` dates it through. */
export function recordedHoldingOf(p: Position): RecoveredHoldingCost | null {
  const r = p.recoveredCost;
  if (!r?.cashRecord?.length || r.hprUnavailableReason || r.salesAfter || p.rolledForward) return null;
  const id = acquisitionIdentity(p);
  if (r.accountId !== id.accountId || r.isin !== id.isin || id.quantity == null || Math.abs(r.quantity - id.quantity) > .0005) return null;
  return r;
}
const recoveredRecordOf = (p: Position): RecoveredHoldingCost["cashRecord"] | null => recordedHoldingOf(p)?.cashRecord ?? null;

/**
 * EVERY LINE'S MONEY IS DATED BY ITS RECOVERED RECORD, BUT A LINE IS VALUED
 * ONLY AT A LIVE PRICE OR A PUBLISHED NAV (Stage 10jm). Since Stage 10jo such a
 * line closes on that price (`marketCloseOf`); this still names the rows whose
 * price carries no usable date, not a missing purchase date they do not lack.
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
 * ONE LINE'S DATED MONEY — or null where nothing dates every unit of it. `asOf`
 * is its account's statement date, where a lot-dated line closes. A STATEMENT
 * line closes on the statement's value and date; a line priced by the market
 * (a live quote or a published NAV) closes on that price's own date, its units
 * assumed still held since the statement (Stage 10jo) — and null where that
 * cannot stand, so the caller falls back to the statement's line.
 */
export function holdingFlowsOf(p: Position, asOf: string | null): HoldingFlows | null {
  const key = keyOf(p);
  const r = p.tradeRecord;
  /** The close: the statement's, or the market's where the line is priced by it. */
  const closeAt = (statementDate: string, lastRow: string) => {
    const m = marketCloseOf(p, statementDate, lastRow);
    if (m === null) return null;
    return {
      close: p.marketValue > 0 ? { date: m?.date ?? statementDate, value: p.marketValue } : null,
      ...(m ? { market: { from: statementDate, kind: m.kind } } : {}),
    };
  };
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
    const end = closeAt(r.to, flows.at(-1)!.date);
    if (!end) return null;
    return {
      dated: true, basis: "trades", flows, payments: trades.length,
      since: trades.find((t) => t.side === "buy")?.date ?? trades[0].date,
      ...end,
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
    const end = closeAt(asOf, flows.at(-1)!.date);
    if (!end) return null;
    return {
      dated: true, basis: "lots", flows, payments: lots.length, since: lots[0].date,
      ...end,
    };
  }
  const record = recoveredRecordOf(p);
  if (record && asOf) {
    const end = closeAt(asOf, record.at(-1)!.date);
    if (!end) return null;
    const trades = record.filter((x) => x.side !== "income");
    return {
      dated: true, basis: "recovered",
      flows: record.map((x) => ({ date: x.date, amount: x.side === "buy" ? -x.amount : x.amount })),
      payments: trades.length,
      since: trades.find((x) => x.side === "buy")?.date ?? trades[0].date,
      ...end,
    };
  }
  return null;
}

/**
 * ── A FULLY DATED HOLDING CLOSES ON ITS MARKET PRICE (Stage 10jo) ───────────
 *
 *   *"ok i agree to what you recomend"* — the family, 30 Oct 2026: XIRR ends on
 *   the latest market price for a listed share or fund whose every purchase and
 *   sale is dated, labelled as assumed — the price its HPR already reads.
 *
 * Undefined where the line is not priced by the market (it closes on its
 * statement). Otherwise the price's own date — never one before the units'
 * statement or the record's last row — with the units assumed still held since
 * the statement (the family's 22 Oct rule): null where the price carries no
 * date, or where a later purchase, sale, transfer or withdrawal of it is on
 * record, exactly as `assumedHolding` refuses.
 */
function marketCloseOf(p: Position, statementDate: string, lastRow: string): { date: string; kind: "quote" | "published-nav" } | null | undefined {
  const e = p.priceEvidence;
  if (p.live !== true && !e && !p.navPriced) return undefined;
  if (p.rolledForward) return null;
  const date = (e?.effectiveAt ?? (p.navPriced ? p.navDate : null) ?? e?.observedAt ?? null)?.slice(0, 10) ?? null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < statementDate || date < lastRow || !(p.marketValue > 0)) return null;
  if (movedAfter(p, statementDate, date)) return null;
  return { date, kind: e?.kind ?? (p.navPriced ? "published-nav" : "quote") };
}

const ENGAGEMENT = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.engagement]));
const MOVEMENTS_BY_ACCOUNT = new Map<string, (typeof BOOK_SHARE_MOVEMENTS)[string][]>();
for (const m of Object.values(BOOK_SHARE_MOVEMENTS)) (MOVEMENTS_BY_ACCOUNT.get(m.accountId) ?? MOVEMENTS_BY_ACCOUNT.set(m.accountId, []).get(m.accountId)!).push(m);
const CAPITAL_BY_ACCOUNT = new Map<string, (typeof BOOK_CAPITAL_MOVES)[number][]>();
for (const m of BOOK_CAPITAL_MOVES) (CAPITAL_BY_ACCOUNT.get(m.accountId) ?? CAPITAL_BY_ACCOUNT.set(m.accountId, []).get(m.accountId)!).push(m);

/** A later purchase, sale, transfer or withdrawal of the line on record — `assumedHolding`'s test. */
function movedAfter(p: Position, from: string, to: string): boolean {
  const after = (d: string | null | undefined) => !!d && d > from && d <= to;
  if ((p.realizedLotsAfter ?? 0) > 0) return true;
  if ((BOOK_HOLDING_TRADES[keyOf(p)] ?? []).some((t) => after(t.date))) return true;
  const same = (x: { securityKey?: string | null; isin?: string | null }) => x.securityKey === p.securityKey || (!!p.isin && x.isin === p.isin);
  if ((MOVEMENTS_BY_ACCOUNT.get(p.accountId) ?? []).some((m) => same(m) && after(m.periodTo)
    && (!!m.reason || !!m.unclassified || (m.unitsIn ?? 0) > 0 || (m.unitsOut ?? 0) > 0))) return true;
  return (CAPITAL_BY_ACCOUNT.get(p.accountId) ?? []).some((m) => after(m.date)
    && (m.securityKey === p.securityKey || (!m.securityKey && ENGAGEMENT.get(p.accountId) === "PMS" && m.direction === "out"))
    && !(m.securityKey === p.securityKey && !m.units && /dividend|income|interest/i.test(m.label)));
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
