/**
 * ── THE CAPITAL BRIDGE OF THE RETURNS TAB (Stage 10gu) ──────────────────────
 *
 * *"we need to also show exactly what is the attribution of the capital in the
 * return — what was the original invested amount, what was the portfolio value
 * at the beginning of the period … at the end of the period, what was the
 * additional capital brought in, what was realized, what was unrealized"* —
 * the family, 22 Oct 2026.
 *
 * PURE, and struck over the SAME units as the attribution table's total
 * (`selectedSegmentReturns(...).total.units`), so its gain is that row's gain
 * to the rupee: start + added − taken out + gain = end, account by account.
 *
 * THE GAIN IS SPLIT ONLY WHERE A RECORD SPLITS IT, never apportioned:
 *
 *   • `statement` — the account's own profit and loss bridge over exactly these
 *     dates (`BOOK_ACCOUNT_BRIDGES`: a performance summary, investor report…)
 *     whose printed lines add to this gain within ₹1. Realised, unrealised,
 *     income and charges are the statement's figures.
 *   • `fund-record` — a mutual-fund or AIF folio whose dated unit record shows
 *     every redemption: a scheme with no redemption in the period realised
 *     nothing in it; a scheme redeemed only inside it realised its FIFO gain
 *     (`Position.realizedPnL`); dividends are the dated income the book holds.
 *     The rest of the gain is the change in value of units still held. Any
 *     switch inside the period, an undated income row, or a redemption the
 *     record cannot attribute leaves the account unsplit.
 *   • `purchase-cost` — since investment on purchase cost, the FIFO parts
 *     `sinceInvestmentUnits` already carries.
 *
 * Every other account's gain is "not split", with the account named and why —
 * never zero, never guessed.
 */
import type { Account, AccountBridge, CapitalMove, Position } from './types';
import type { ReturnUnit } from './selectedSegmentReturns';
import { currentHoldings } from './analytics';
import { fifoTotals } from './fifo';

export type BridgeSplitSource = 'statement' | 'fund-record' | 'purchase-cost' | 'assumed-holding';
/**
 * `charges` is null where the record prints none separately — a fund's costs
 * are inside its NAV, a purchase cost's inside the prices paid — so they are
 * already in the unrealised or realised figure, never a ₹0 beside them.
 */
export type BridgeSplit = { realised: number; unrealised: number; income: number; charges: number | null; source: BridgeSplitSource; note: string };
export type BridgeAccount = {
  key: string; accountId: string; label: string; from: string | null; to: string;
  opening: number; added: number; takenOut: number; gain: number; closing: number;
  split: BridgeSplit | null; unsplitReason: string | null;
};
export type BridgeMode = 'window' | 'inception' | 'cost';
export type CapitalBridge = {
  mode: BridgeMode; from: string | null; to: string | null; rows: BridgeAccount[];
  opening: number; added: number; takenOut: number; gain: number; closing: number;
  /** Σ over the accounts whose gain is split; null where no account's is (charges: no account's record prints them separately). */
  realised: number | null; unrealised: number | null; income: number | null; charges: number | null;
  /** The gain of the accounts no record splits — named in `rows`. */
  unsplit: number; splitCount: number; unsplitCount: number;
  /** Purchase cost of what these accounts hold now (whole mandates at capital paid in), and the holdings that carry none. */
  heldCost: { invested: number | null; uncosted: number; uncostedValue: number } | null;
};
export type BridgeBook = {
  accounts: readonly Account[];
  /** Every statement row, exits included. */
  positions: readonly Position[];
  bridges: Readonly<Record<string, readonly AccountBridge[]>>;
  moves: readonly CapitalMove[];
  income: Readonly<Record<string, readonly { date: string | null; amount: number }[]>>;
};

const DAY = 86_400_000;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const FUND_CLASSES = new Set(['Mutual Fund', 'AIF']);
const SWITCH = /switch|shift|transfer/i;
const INCOME = /dividend|idcw|income|distribution|interest/i;

/** The statement's own split over exactly these dates, where its lines make this gain. */
function statementSplit(b: BridgeBook, accountId: string, from: string | null, to: string, gain: number): BridgeSplit | null {
  for (const x of b.bridges[accountId] ?? []) {
    if (x.ties === false || x.linesOnly || x.periodTo !== to) continue;
    if (from ? x.periodFrom !== nextDay(from) : x.basis !== 'since-inception') continue;
    if (x.realized == null || x.unrealized == null || (x.profit != null && x.profit !== 0)) continue;
    const realised = num(x.realized) + num(x.gainPriorToTakeover);
    const charges = num(x.fees) + num(x.expenses) + num(x.otherExpenses);
    // A return record closes on the value WITHOUT income accrued and not yet
    // received (Goldstandard, Assago) where the statement's closing carries it.
    const income = [num(x.income) + num(x.accruedIncome) + num(x.changeInAccruals), num(x.income) + num(x.changeInAccruals)]
      .find((i) => Math.abs(realised + num(x.unrealized) + i - charges - gain) <= 1);
    if (income == null) continue;
    const name = { 'performance-summary': 'performance summary', 'investor-report': 'investor report', 'profit-and-loss': 'profit and loss account',
      'income-expense': 'income and expense statement', 'fact-sheet': 'fact sheet', 'performance-history': 'performance history' }[x.reportType] ?? 'statement';
    // Within ₹1 of the statement's own rounding, the unrealised line takes the paise so the parts make the gain exactly.
    const printed = [x.fees, x.expenses, x.otherExpenses].some((v) => v != null);
    return { realised, income, charges: printed ? charges : null, unrealised: gain - realised - income + charges, source: 'statement',
      note: `The ${name}'s own profit and loss for ${x.periodFrom} → ${x.periodTo}` };
  }
  return null;
}

/** A fund folio's split from its own dated unit record, or why there is none. */
function fundSplit(b: BridgeBook, accountId: string, from: string | null, to: string, gain: number): BridgeSplit | string {
  const a = b.accounts.find((x) => x.accountId === accountId);
  const rows = b.positions.filter((p) => p.accountId === accountId);
  if (!a || a.engagement === 'PMS' || !rows.length || !rows.every((p) => FUND_CLASSES.has(p.assetClass))) {
    const spans = [...new Set((b.bridges[accountId] ?? []).filter((x) => x.ties !== false && x.realized != null && x.unrealized != null)
      .map((x) => `${x.periodFrom} → ${x.periodTo}`))];
    return spans.length ? `its statements split the gain into realised and unrealised only for ${spans.join('; ')}, not for these dates`
      : 'its statements do not separate realised and unrealised gain';
  }
  const moves = b.moves.filter((m) => m.accountId === accountId);
  if (!moves.some((m) => m.securityKey)) return 'its fund record does not name the scheme behind each movement';
  const inside = (d: string) => (!from || d > from) && d <= to;
  const during = moves.filter((m) => inside(m.date));
  if (during.some((m) => SWITCH.test(m.label))) return 'units were switched between its schemes in this period, which its record does not price as a sale';
  const outs = during.filter((m) => m.direction === 'out');
  if (outs.some((m) => !m.securityKey)) return 'a redemption in this period does not name its scheme';
  if (outs.some((m) => INCOME.test(m.label))) return 'a payout in this period is income its record does not separate from redemptions';
  let realised = 0;
  for (const key of new Set(outs.map((m) => m.securityKey!))) {
    const all = moves.filter((m) => m.securityKey === key && (m.direction === 'out' || SWITCH.test(m.label)));
    const sold = rows.filter((p) => p.securityKey === key);
    if (all.some((m) => !inside(m.date))) return 'a scheme redeemed in this period was also redeemed outside it, so its FIFO gain covers more than this period';
    if (!sold.length || sold.some((p) => p.realizedPnL == null)) return 'a redemption in this period has no FIFO gain on its record';
    realised += sold.reduce((s, p) => s + num(p.realizedPnL), 0);
  }
  let income = 0;
  for (const p of rows) {
    for (const r of b.income[`${accountId}|${p.securityKey}`] ?? []) {
      if (!r.date) return 'a dividend on its record carries no date';
      if (inside(r.date)) income += r.amount;
    }
  }
  return { realised, income, charges: null, unrealised: gain - realised - income, source: 'fund-record',
    note: outs.length ? `Redemptions in this period are matched first-in, first-out on the fund's own unit record; the rest is the change in value of units still held`
      : 'No units were redeemed in this period, so nothing was realised; the gain is the change in value of units still held' };
}

/** Each unit's step: start, money in and out, gain, end — and its split, where a record carries one. */
function stepOf(u: ReturnUnit, b: BridgeBook): BridgeAccount {
  const base = { key: u.key, accountId: u.accountId, label: u.label, gain: u.gain, closing: u.close };
  if (u.gainParts) {
    const { unrealised, realised, income } = u.gainParts;
    const parts = num(unrealised) + num(realised) + num(income);
    const split: BridgeSplit | null = Math.abs(parts - u.gain) <= 1 ? { realised: num(realised), income: num(income), charges: null,
      unrealised: u.gain - num(realised) - num(income), source: 'purchase-cost',
      note: 'Purchase cost matched first-in, first-out: units sold give the realised gain, units held the unrealised' } : null;
    // Since investment on cost, what came back (sales, income, withdrawals) is what the cost and gain do not leave in the value.
    return { ...base, from: u.from, to: u.to, opening: 0, added: u.invested, takenOut: u.invested + u.gain - u.close,
      split, unsplitReason: split ? null : 'its realised, unrealised and income records do not add to its gain' };
  }
  if (u.window) {
    const w = u.window;
    if (u.assumption) return { ...base, from: w.openDate, to: w.closeDate, opening: w.openValue, added: 0, takenOut: w.capitalOut,
      split: { realised: 0, unrealised: w.closeValue - w.openValue, income: u.assumption.income, charges: null, source: 'assumed-holding',
        note: 'Assumed unchanged holding: published prices and gross dividend entitlements; no sale or withdrawal is claimed.' }, unsplitReason: null };
    const own = u.key === u.accountId;
    const fromStatement = own ? statementSplit(b, u.accountId, w.openDate, w.closeDate, w.gain) : null;
    const fund = fromStatement ?? (own ? fundSplit(b, u.accountId, w.openDate, w.closeDate, w.gain) : 'its return covers part of an account');
    const split = typeof fund === 'string' ? null : fund;
    return { ...base, from: w.openDate, to: w.closeDate, opening: w.openValue, added: w.capitalIn, takenOut: w.capitalOut,
      split, unsplitReason: typeof fund === 'string' ? fund : null };
  }
  const r = u.inception!;
  const own = u.key === u.accountId;
  const fromStatement = own ? statementSplit(b, u.accountId, null, r.valueAsOf, u.gain) : null;
  const fund = fromStatement ?? (own ? fundSplit(b, u.accountId, null, r.valueAsOf, u.gain) : 'its return covers one investment of a review, which records no realised gain');
  const split = typeof fund === 'string' ? null : fund;
  return { ...base, from: r.first, to: r.valueAsOf, opening: 0, added: r.paidIn, takenOut: r.takenOut,
    split, unsplitReason: typeof fund === 'string' ? fund : null };
}

export function capitalBridge(units: readonly ReturnUnit[], book: BridgeBook): CapitalBridge | null {
  if (!units.length) return null;
  const mode: BridgeMode = units.some((u) => u.gainParts) ? 'cost' : units.some((u) => u.window) ? 'window' : 'inception';
  const rows = units.map((u) => stepOf(u, book));
  const sum = (f: (r: BridgeAccount) => number) => rows.reduce((s, r) => s + f(r), 0);
  const split = rows.filter((r) => r.split);
  const part = (k: 'realised' | 'unrealised' | 'income') => split.length ? split.reduce((s, r) => s + r.split![k], 0) : null;
  const charged = split.filter((r) => r.split!.charges != null);
  const froms = rows.flatMap((r) => (r.from ? [r.from] : [])).sort();
  let heldCost: CapitalBridge['heldCost'] = null;
  if (mode !== 'cost') {
    const ids = new Set(rows.map((r) => r.accountId));
    const held = currentHoldings(book.positions.filter((p) => ids.has(p.accountId)) as Position[]);
    const f = fifoTotals(held, { accounts: [...book.accounts], universe: book.positions });
    heldCost = { invested: f.invested, uncosted: f.uncosted, uncostedValue: f.uncostedValue };
  }
  return {
    mode, from: froms[0] ?? null, to: rows.map((r) => r.to).filter(Boolean).sort().at(-1) ?? null, rows,
    opening: sum((r) => r.opening), added: sum((r) => r.added), takenOut: sum((r) => r.takenOut),
    gain: sum((r) => r.gain), closing: sum((r) => r.closing),
    realised: part('realised'), unrealised: part('unrealised'), income: part('income'),
    charges: charged.length ? charged.reduce((s, r) => s + r.split!.charges!, 0) : null,
    unsplit: rows.filter((r) => !r.split).reduce((s, r) => s + r.gain, 0),
    splitCount: split.length, unsplitCount: rows.length - split.length, heldCost,
  };
}
