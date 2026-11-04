/**
 * ── THE RETURN CARDS' EXTRA STARTS (Stage 10la) ────────────────────────────
 *
 *   *"approve"* — the family, 4 Nov 2026, on the three return cards measured
 *   from the first value on record (docs/RETURN-COVERAGE-REVIEW.md).
 *
 * `ytdBook` measures each account from its first verified value and each
 * holding from a purchase record or its statement balance. These are the
 * further first values the archive does carry, each with its own evidence,
 * tried before the engine's default and only where that evidence holds:
 *
 *   • a fund's units at a NAV PRINTED on a later statement (`statementNavWindow`):
 *     Sanshi's classes on Ajay's ICICI demat, linked by units that tie;
 *   • a balance on an OLDER statement plus the broker's dated trades since, which
 *     must reconcile to the units held now (`tradedWindow`): Yash, Federal Bank;
 *   • an OLDER statement's balance of the same units with no trade since, opened
 *     on its own close, or its first exchange close if it listed later
 *     (`earlierBalanceOptions`): ESDS, Sotefin, NSE.
 *
 * And, for whatever public holding none of them measures, its LAST VALUE held
 * flat to the period's end (`heldAtLastValue`) — a 0% that is named.
 *
 * Every window is labelled with the assumption it rests on, as `assumedHolding`'s are.
 */
import type { Account, EarlierBalance, HoldingTrade, Position, StatementUnitNavs } from './types';
import type { AccountWindow, Flow } from './periodReturns';
import type { ReturnUnit } from './selectedSegmentReturns';
import { publishedClose, type AssumeOptions, type AssumedReturnBook } from './assumedHoldingReturns';
import { marketHoldingKey } from './marketReturns';
import { projectActions } from './corporateActions';
import { BOOK_EARLIER_BALANCES, BOOK_STATEMENT_UNIT_NAVS } from '@/data/glowData';

export type PeriodFound = { window: AccountWindow; owner?: string; unit: ReturnUnit } | { reason: string; pending?: boolean };
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const tie = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-3, 1e-7 * Math.abs(a));
const labelOf = (p: Position, a: Account) => `${p.security} · ${a.owner} · ${a.provider} · account ${a.accountNo}`;
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

function unitOf(p: Position, a: Account, w: Omit<AccountWindow, 'accountId' | 'owner' | 'label' | 'capitalIn' | 'capitalOut' | 'gain'>,
  basis: ReturnUnit['basis'], source: string, statementDate: string, quantity: number): PeriodFound {
  const capitalIn = sum(w.flows.filter((f) => f.amount < 0).map((f) => -f.amount));
  const capitalOut = sum(w.flows.filter((f) => f.amount > 0).map((f) => f.amount));
  const gain = w.closeValue - w.openValue - capitalIn + capitalOut;
  if (![w.openValue, w.closeValue, gain].every(Number.isFinite)) return { reason: 'The quantity and prices could not be matched.' };
  const key = marketHoldingKey(p), label = labelOf(p, a);
  const window: AccountWindow = { ...w, accountId: key, owner: a.owner, label, capitalIn, capitalOut, gain };
  const income = w.flows.filter((f) => f.amount > 0 && !/^Sale/.test(f.description ?? ''));
  return { window, owner: a.owner, unit: { key, accountId: p.accountId, label, positions: [p], gain, invested: w.openValue + capitalIn,
    close: w.closeValue, from: w.openDate, to: w.closeDate, window, basis,
    assumption: { owner: a.owner, statementDate, quantity, source, opening: w.openValue, closing: w.closeValue,
      income: sum(income.map((f) => f.amount)), incomeDates: income.map((f) => ({ date: f.date, amount: f.amount })) } } };
}

/** The holding's older balances, oldest first: the same account, the same holding. */
export const earlierBalancesOf = (p: Position, all: readonly EarlierBalance[] = BOOK_EARLIER_BALANCES) =>
  all.filter((x) => x.accountId === p.accountId && x.securityKey === p.securityKey).sort((x, y) => x.asOf.localeCompare(y.asOf));

/**
 * AN OLDER STATEMENT'S BALANCE OF THE SAME UNITS, with nothing since that moved
 * them: the earliest dated count `assumedHolding` may carry from. `fromListing`
 * lets a holding that listed after that date open on its first exchange close.
 */
export function earlierBalanceOptions(p: Position, b: AssumedReturnBook, all?: readonly EarlierBalance[]): AssumeOptions {
  const trades = b.trades[marketHoldingKey(p)] ?? [];
  const same = earlierBalancesOf(p, all).filter((x) => positive(p.quantity) && tie(x.quantity, p.quantity!) && !trades.some((t) => t.date > x.asOf));
  return { ...(same[0] ? { anchor: { quantity: same[0].quantity, date: same[0].asOf } } : {}), fromListing: true };
}

/**
 * A FUND'S UNITS AT A NAV ANOTHER STATEMENT PRINTS. The holding's own statement
 * values it on its date; a later statement (`BOOK_STATEMENT_UNIT_NAVS`, linked
 * by units that tie) prints a NAV per unit; the units are assumed still held in
 * between. Only for fund units with no published price.
 */
export function statementNavWindow(p: Position, a: Account, open: string | null, end: string,
  navs: Readonly<Record<string, StatementUnitNavs>> = BOOK_STATEMENT_UNIT_NAVS): PeriodFound | null {
  const link = navs[p.securityKey];
  if (!link || !positive(p.quantity) || !positive(p.marketValue)) return null;
  const from = a.asOf;
  if (open && from < open) return null;
  const later = link.navs.filter((n) => n.date > from && n.date <= end).at(-1);
  if (!later) return { reason: `No statement after ${from} prints this fund's NAV.` };
  return unitOf(p, a, { openDate: from, openValue: p.marketValue, openedInWindow: false, closeDate: later.date,
    closeValue: p.quantity! * later.nav, flows: [] }, 'statement-nav', `NAV printed on ${later.docKey}`, from, p.quantity!);
}

/**
 * AN OLDER BALANCE AND THE BROKER'S DATED TRADES SINCE. The trades must take
 * the older balance exactly to the units held now; then the period opens on
 * the units held at its start at that day's close, each trade is money in or
 * out on its date at its own amount, and from the statement on the units are
 * carried at published closes. A split in the span, a trade without an amount,
 * or a dividend the action feed cannot vouch for leaves it to the engine.
 */
export function tradedWindow(p: Position, a: Account, open: string | null, end: string, b: AssumedReturnBook, all?: readonly EarlierBalance[]): PeriodFound | null {
  const trades: readonly HoldingTrade[] = b.trades[marketHoldingKey(p)] ?? [];
  if (!trades.length || !positive(p.quantity)) return null;
  const base = earlierBalancesOf(p, all)[0];
  const since = (base ? trades.filter((t) => t.date > base.asOf) : trades).slice().sort((x, y) => x.date.localeCompare(y.date));
  if (!since.length || since.some((t) => !positive(t.quantity) || !(positive(t.amount) || (positive(t.price) && positive(t.quantity))))) return null;
  const startUnits = base?.quantity ?? 0;
  const net = since.reduce((u, t) => u + (t.side === 'buy' ? 1 : -1) * t.quantity!, startUnits);
  if (!tie(net, p.quantity!)) return null;
  const instrument = b.instruments.get(p.securityKey), h = instrument && b.histories[instrument.key];
  if (!h) return instrument ? { reason: 'Prices are still loading. No new statement is needed yet.', pending: true } : null;
  if (!h.ok || h.splits?.some((s) => s.date > (base?.asOf ?? since[0].date) && s.date <= end)) return null;
  const origin = base?.asOf ?? since[0].date;
  const start = open && open > origin ? open : origin;
  const unitsAt = (d: string) => since.filter((t) => t.date <= d).reduce((u, t) => u + (t.side === 'buy' ? 1 : -1) * t.quantity!, startUnits);
  const u0 = unitsAt(start);
  const opening = u0 > 0 ? publishedClose(h, start) : { date: start, value: 0 };
  const closing = publishedClose(h, end);
  if (!opening || !closing) return null;
  const amount = (t: HoldingTrade) => t.amount ?? t.price! * t.quantity!;
  const flows: Flow[] = since.filter((t) => t.date > start).map((t) => ({ date: t.date, amount: t.side === 'buy' ? -amount(t) : amount(t),
    description: t.side === 'buy' ? 'Purchase on the broker record' : 'Sale on the broker record' }));
  // THE DIVIDENDS: each span of unchanged units asks the action feed.
  const cuts = [start, ...new Set(since.filter((t) => t.date > start).map((t) => t.date)), closing.date].sort();
  for (let i = 0; i + 1 < cuts.length; i++) {
    const units = unitsAt(cuts[i]);
    if (!(units > 0) || cuts[i + 1] <= cuts[i]) continue;
    const plan = projectActions({ ...p, quantity: units }, cuts[i], cuts[i + 1], b.actions);
    if (plan.quantityIssues.length || plan.incomeIssues.length || plan.lines.some((l) => l.status === 'adjusted' || l.status === 'needs-review')) return null;
    for (const l of plan.lines) if (l.status === 'declared' && l.amount != null && l.action.exDate && l.action.exDate > cuts[i] && l.action.exDate <= cuts[i + 1])
      flows.push({ date: l.action.exDate, amount: l.amount, description: 'Gross dividend entitlement' });
  }
  flows.sort((x, y) => x.date.localeCompare(y.date));
  return unitOf(p, a, { openDate: opening.date, openValue: u0 * opening.value, openedInWindow: u0 === 0, closeDate: closing.date,
    closeValue: p.quantity! * closing.value, flows }, 'broker-trades', h.source, a.asOf, p.quantity!);
}

/**
 * HELD AT ITS LAST VALUE (the family, 4 Nov 2026): a public holding no record
 * measures this period is carried flat from its latest valuation to the end —
 * a 0% that adds its money to the base and is named, so the caption can say
 * how much of the coverage is measured and how much is held.
 */
export function heldAtLastValue(p: Position, a: Account, open: string | null, end: string, reason: string): ReturnUnit | null {
  if (!positive(p.marketValue) || p.marketSide === 'private') return null;
  const valuedOn = p.navDate ?? a.asOf;
  const from = open && valuedOn < open ? open : valuedOn;
  if (!(from < end)) return null;
  const key = marketHoldingKey(p), label = labelOf(p, a);
  const window: AccountWindow = { accountId: key, owner: a.owner, label, openDate: from, openValue: p.marketValue, openedInWindow: false,
    closeDate: end, closeValue: p.marketValue, flows: [], capitalIn: 0, capitalOut: 0, gain: 0 };
  return { key, accountId: p.accountId, label, positions: [p], gain: 0, invested: p.marketValue, close: p.marketValue, from, to: end, window,
    held: { date: valuedOn, reason } };
}
