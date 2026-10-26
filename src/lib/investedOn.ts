/**
 * ── WHEN A HOLDING'S OWN MONEY WENT IN (Stage 10fm) ────────────────────────
 *
 *   *"Investment dates are also missing in the dashboard in the portfolio
 *    holdings. So make sure that we are showing investment dates, like when was
 *    the holding purchased, and all the transaction dates as well."*
 *
 * The Holdings table's Invested on column dated 2 of 154 rows. It read three
 * sources and every statement-dated purchase outside them was invisible: the
 * dated trades behind every share in a PMS mandate, and the investment dates
 * the family's review prints for every private line (which Private Market
 * already showed, Stage 10ey). One derivation now, read by the Portfolio
 * Monitor's holdings and the mandate drill-down alike, so the two cannot date
 * one holding two ways.
 *
 * SIX SOURCES, ALL THE HOLDING'S OWN, strongest first:
 *
 *   • the fund's dated allotments against this very folio (`BOOK_POSITION_TRANCHES`);
 *   • a lot register's acquisition date (`Position.heldSince`);
 *   • the account's own dated trades, where they account for every unit held
 *     (`Position.tradeRecord.held`, matched first-in, first-out in build-book);
 *   • reconciled surviving purchase lots in supplementary records
 *     (`Position.recoveredCost.heldPurchases`, exact account, ISIN and units);
 *   • a drawdown fund's dated calls, where the account holds that fund alone
 *     and its paid-in covers every call (`callDatesByHolding`);
 *   • the family's review's "Date investment range" (`Position.investedDates`),
 *     a day or a month as the review prints it — never widened to a day.
 *
 * A ROW CARRIES A DATE ONLY WHERE EVERY LINE BEHIND IT HAS ONE: the earliest of
 * the dated lines would be a date about part of the money under a heading a
 * reader reads as all of it.
 *
 * A MANDATE IS AN ACCOUNT, and its own date is the family's: the inception date
 * its statement prints, and the dated contributions on its capital record where
 * that record starts there (`accountInvestedOn`). That date is never lent to
 * the shares inside it — those are the manager's purchases, dated by its trades.
 */
import { BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_HOLDING_TRADES, BOOK_HOLDING_LOTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES } from "@/data/glowData";
import { callDatesByHolding, trancheKey } from "./tranches";
import { fmtDate } from "./format";
import type { Account, HoldingTrade, Position } from "./types";
import { reviewField } from "./reviewColumns";
import savedActions from "../../public/data/corporate-actions.json";
import { symbolForKey } from "./quotes";
import { acquisitionIdentity } from "../../shared/fundUnitActions.mjs";

export type InvestedOnSource = "allotments" | "lots" | "trades" | "bonus-trades" | "recovered-lots" | "calls" | "review" | "account";

/**
 * The first and last date the money went in, and how many dated payments that
 * is — NULL where the source dates a span and not each payment (the review's
 * range, an account's inception date alone).
 */
export type InvestedOn = { first: string; last: string; payments: number | null; sources: InvestedOnSource[]; reviewSource?: string; adjustments?: string[] };

export type InvestmentDateScope = {
  positions?: readonly Position[]; accountId?: string; accountIds?: readonly string[]; isMandate?: boolean;
};

/** The same row scope supplies both the displayed date and its sort value. */
export function investmentDateOf(scope?: InvestmentDateScope): InvestedOn | null {
  if (scope?.isMandate) {
    return accountInvestedOn(scope.accountIds ?? (scope.accountId ? [scope.accountId] : []));
  }
  return investedOnOf(scope?.positions ?? []);
}

export function investmentDateMissingReason(scope?: InvestmentDateScope): string {
  if (scope?.isMandate) return "The statements do not establish an inception date for every account in this row.";
  const ps = scope?.positions ?? [];
  if (!ps.length) return "No purchase record dates this row. A derived exposure is not a purchase by the family.";
  const undated = ps.filter((p) => investedOnOf([p]) === null);
  const reasons = [...new Set(undated.map(lineUndatedReason).filter(Boolean))];
  return reasons.length ? reasons.join("; ")
    : "The available records do not establish a purchase date for every holding in this row.";
}

const CALL_DATES = callDatesByHolding(BOOK_COMMITMENTS, BOOK_POSITIONS);
const ACTIONS = new Map<string, typeof savedActions.rows>();
const ACTION_TICKERS = new Map<string, typeof savedActions.rows>();
for (const row of savedActions.rows) {
  if (row.isin) ACTIONS.set(row.isin, [...(ACTIONS.get(row.isin) ?? []), row]);
  if (row.ticker) ACTION_TICKERS.set(row.ticker, [...(ACTION_TICKERS.get(row.ticker) ?? []), row]);
}
type LineDates = { dates: string[]; source: InvestedOnSource; payments?: number; adjustments?: string[] };

/** No sales, every purchase before the bonus, and an exact independent closing-unit control. */
function bonusPurchaseDates(p: Position): LineDates | null {
  const r = p.tradeRecord;
  if (!r || r.sells || !Number.isFinite(p.quantity) || !(p.quantity! > 0)
    || r.from < savedActions.requestedFrom || r.to > savedActions.verifiedThrough) return null;
  const ts = holdingTradesOf(p).filter(t => t.date >= r.from && t.date <= r.to);
  if (!ts.length || ts.some(t => t.side !== "buy" || !Number.isFinite(t.quantity) || !(t.quantity! > 0))) return null;
  // Some PMS statements omit ISIN. Only the existing verified exchange-symbol
  // mapping may bridge that identity; ambiguous ticker/ISIN records refuse it.
  const records = p.isin ? ACTIONS.get(p.isin) ?? [] : ACTION_TICKERS.get(symbolForKey(p.securityKey) ?? "") ?? [];
  if (new Set(records.map(a => a.isin)).size !== 1) return null;
  const actions = records.filter(a => a.exDate >= r.from && a.exDate <= r.to && a.type !== "dividend");
  if (!actions.length || actions.some(a => a.type !== "bonus" || a.issue || !Number.isFinite(a.factor) || !(a.factor! > 1))) return null;
  const last = ts[ts.length - 1].date;
  if (actions.some(a => a.exDate <= last)) return null; // Same-day entitlement needs settlement evidence.
  const bought = ts.reduce((n,t) => n + t.quantity!,0);
  const factor = actions.reduce((n,a) => n * a.factor!,1);
  if (Math.abs(bought * factor - p.quantity!) > .0005) return null;
  return { dates: ts.map(t => t.date), source: "bonus-trades", payments: ts.length,
    adjustments: actions.map(a => `${a.exDate}: ${a.purpose}; ${a.source}; saved action ${a.id}`) };
}

/** One line's own dates, or null where nothing the book carries dates it. */
function lineDates(p: Position): LineDates | null {
  const own = BOOK_POSITION_TRANCHES[trancheKey(p.accountId, p.securityKey)];
  const ins = own?.moves.filter((m) => m.direction === "in").map((m) => m.date) ?? [];
  if (ins.length) return { dates: ins, source: "allotments" };
  if (p.heldSince) {
    const lots = BOOK_HOLDING_LOTS[trancheKey(p.accountId,p.securityKey)];
    if (lots?.length && p.quantity != null && lots.every(l=>l.quantity != null)
      && Math.abs(lots.reduce((n,l)=>n+l.quantity!,0)-p.quantity)<=.0005)
      return {dates:lots.map(l=>l.date),source:"lots"};
    return { dates: [p.heldSince], source: "lots" };
  }
  // The surviving buys' own dates are on BOOK_HOLDING_TRADES; the record keeps
  // their first, last and count, which is all a cell needs.
  const held = p.tradeRecord?.held;
  if (held) return { dates: [held.first, held.last], source: "trades" };
  const adjusted = bonusPurchaseDates(p);
  if (adjusted) return adjusted;
  const recovered = p.recoveredCost;
  const acquisition = acquisitionIdentity(p);
  // The recovery is specific to an account, ISIN, closing date and exact unit
  // balance. Never lend a source record's dates to another position or balance.
  if (recovered?.heldPurchases && recovered.accountId === acquisition.accountId && recovered.isin === acquisition.isin
    && acquisition.quantity != null && Math.abs(recovered.quantity - acquisition.quantity) <= .0005) {
    return { dates: [recovered.heldPurchases.first, recovered.heldPurchases.last], source: "recovered-lots" };
  }
  const called = CALL_DATES.get(trancheKey(p.accountId, p.securityKey));
  if (called?.length) return { dates: called, source: "calls" };
  if (p.investedDates) return { dates: [p.investedDates.from, p.investedDates.to], source: "review" };
  return null;
}

/** How many dated payments a line is — null where its source dates a span. */
function linePayments(p: Position, d: LineDates): number | null {
  if (d.source === "bonus-trades") return d.payments ?? null;
  if (d.source === "trades") return p.tradeRecord?.held?.lots ?? null;
  if (d.source === "recovered-lots") return p.recoveredCost?.heldPurchases?.lots ?? null;
  if (d.source === "review") return d.dates[0] === d.dates[1] && /^\d{4}-\d{2}-\d{2}$/.test(d.dates[0]) ? 1 : null;
  return d.dates.length;
}

/** WHEN THE ROW'S OWN MONEY WENT IN — over every line it sums, or null. */
export function investedOnOf(ps: readonly Position[]): InvestedOn | null {
  const dates: string[] = [];
  const sources = new Set<InvestedOnSource>();
  const adjustments = new Set<string>();
  let payments: number | null = 0;
  for (const p of ps) {
    const d = lineDates(p);
    // ONE UNDATED CONSTITUENT AND THE ROW HAS NO FIRST PAYMENT.
    if (!d) return reviewedInvestmentDates(ps);
    dates.push(...d.dates);
    sources.add(d.source);
    d.adjustments?.forEach(a => adjustments.add(a));
    const n = linePayments(p, d);
    payments = payments === null || n === null ? null : payments + n;
  }
  if (!dates.length) return null;
  dates.sort();
  return { first: dates[0], last: dates[dates.length - 1], payments, sources: [...sources], ...(adjustments.size ? {adjustments:[...adjustments]} : {}) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Product context is labelled separately from fully matched custody acquisition dates. */
function reviewedInvestmentDates(ps: readonly Position[]): InvestedOn | null {
  if (!ps.length || ps.some(p => ACCOUNTS.get(p.accountId)?.engagement === "PMS")) return null;
  if (ps.some(p => p.recoveredCost && (p.recoveredCost.accountId !== p.accountId
    || p.recoveredCost.isin !== p.isin || p.quantity == null
    || Math.abs(p.recoveredCost.quantity - p.quantity) > .0005))) return null;
  const field = reviewField({ positions: ps }, "investmentRange");
  return field.value != null && field.from && field.to
    ? { first: field.from, last: field.to, payments: null, sources: ["review"], reviewSource: field.source }
    : null;
}
/** A date as its source prints it: a day, or a month (`YYYY-MM`) never widened to a day. */
export const fmtInvestedDate = (d: string) =>
  /^\d{4}-\d{2}$/.test(d) ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
    // These are calendar dates, not instants. Parsing UTC midnight into the
    // viewer's timezone can turn a 3 August purchase into 2 August.
    : /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : fmtDate(d);

const SOURCE_WORDS: Record<InvestedOnSource, string> = {
  allotments: "the fund's own dated allotments",
  lots: "the lot register's acquisition dates",
  trades: "the account's own dated trades, every unit held matched to the buy that bought it, first-in, first-out",
  "bonus-trades": "the account's original purchases, carried through the saved noncash bonus into the exact current holding quantity",
  "recovered-lots": "the original purchase lots in the supplementary records, reconciled to this account, ISIN and every unit still held, first-in, first-out",
  calls: "the fund's dated capital calls",
  review: "the family's review's investment dates",
  account: "the inception date and capital record the statements print",
};

/** The cell's hover: what the dates are, and which document dates them. */
export function investedOnTitle(d: InvestedOn): string {
  if (d.reviewSource) return `Investment date/range recorded for the family product in the 30 June 2026 review, ${d.reviewSource}: ${fmtInvestedDate(d.first)}${d.last !== d.first ? ` to ${fmtInvestedDate(d.last)}` : ""}. This is the product's reviewed range; acquisition dates for every unit in the current custody balance are not reconciled.`;
  const src = d.sources.map((s) => SOURCE_WORDS[s]).join("; ");
  const when = d.first === d.last
    ? `${d.payments === 1 ? "One dated payment" : "Invested"}, ${fmtInvestedDate(d.first)}`
    : d.payments !== null
      ? `${d.payments} dated payments, ${fmtInvestedDate(d.first)} to ${fmtInvestedDate(d.last)}`
      : `First invested ${fmtInvestedDate(d.first)}, last ${fmtInvestedDate(d.last)}`;
  return `${when} — from ${src}.${d.adjustments?.length ? ` Unit reconciliation: ${d.adjustments.join('; ')}.` : ""}`;
}

/** Every dated buy and sell behind one line, oldest first (`BOOK_HOLDING_TRADES`). */
export function holdingTradesOf(p: Pick<Position, "accountId" | "securityKey">): readonly HoldingTrade[] {
  return BOOK_HOLDING_TRADES[trancheKey(p.accountId, p.securityKey)] ?? [];
}

const ACCOUNTS = new Map<string, Account>(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));

/**
 * WHY A LINE CARRIES NO PURCHASE DATE — the cause true of THAT line, from its
 * own record. Null where the line is dated, or where nothing more specific than
 * the caller's own sentence is known.
 */
export function lineUndatedReason(p: Position): string | null {
  if (investedOnOf([p])) return null;
  if (p.tradeRecord?.reason) return p.tradeRecord.reason;
  const trades = holdingTradesOf(p);
  const a = ACCOUNTS.get(p.accountId);
  if (trades.length && a?.asOf && trades.every((t) => t.date > a.asOf)) {
    return `its account's dated trades in this drop begin on ${fmtDate(trades[0].date)}, after this holding's own statement of ${fmtDate(a.asOf)}, so they cannot date the units that statement holds — each is listed under the holding`;
  }
  return null;
}

/**
 * WHEN THE FAMILY PUT MONEY INTO AN ACCOUNT — a mandate's own date.
 *
 * The inception date the account's statement prints is the first; where the
 * account's capital record starts on that very day, its dated contributions are
 * the payments and the last of them is the last. A record that starts later
 * dates its own window, not the account's money, so then the inception date
 * stands alone. An account no statement dates returns null, and so does a set
 * of accounts with one undated among them.
 */
export function accountInvestedOn(accountIds: readonly string[]): InvestedOn | null {
  const dates: string[] = [];
  let payments: number | null = 0;
  for (const id of accountIds) {
    const a = ACCOUNTS.get(id);
    const ins = BOOK_CAPITAL_MOVES.filter((m) => m.accountId === id && m.direction === "in").map((m) => m.date).sort();
    const first = a?.inceptionDate ?? null;
    if (!first) return null;
    if (ins.length && ins[0] === first) {
      dates.push(...ins);
      payments = payments === null ? null : payments + ins.length;
    } else {
      dates.push(first);
      payments = null;
    }
  }
  if (!dates.length) return null;
  dates.sort();
  return { first: dates[0], last: dates[dates.length - 1], payments, sources: ["account"] };
}
