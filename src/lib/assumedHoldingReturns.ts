/** User-authorised carry-forward: recorded units, public prices, explicit ownership assumption. */
import type { Account, CapitalMove, HoldingTrade, Position, ShareMovement, UnvaluedStatementHolding } from './types';
import type { MarketHistory, MarketInstrument, MarketResult } from './marketReturns';
import type { ReturnGap, ReturnUnit } from './selectedSegmentReturns';
import { marketHoldingKey } from './marketReturns';
import { projectActions, type ActionFeed } from './corporateActions';

export type HoldingAssumption = { owner: string; statementDate: string; quantity: number; source: string;
  opening: number; closing: number; income: number; incomeDates: { date: string; amount: number }[] };
export const holdingAssumptionText = (owner?: string) => `No sale appears in the records we have. We assume ${owner || 'the owner'} still holds these shares.`;
export type AssumedReturnBook = {
  positions: readonly Position[]; unvalued: readonly UnvaluedStatementHolding[];
  trades: Readonly<Record<string, readonly HoldingTrade[]>>; moves: readonly CapitalMove[];
  movements: Readonly<Record<string, ShareMovement>>; actions: ActionFeed | null;
  instruments: ReadonlyMap<string, MarketInstrument>; histories: Readonly<Record<string, MarketResult | undefined>>;
};
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const time = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** The split-adjusted close on or before `date`, no more than a week before it — never a later price. */
export function publishedClose(h: MarketHistory, date: string) {
  for (let i = h.t.length - 1; i >= 0; i--) if (h.t[i] <= date && positive(h.c?.[i])) {
    return time(date) - time(h.t[i]) <= 7 * 864e5 ? { date: h.t[i], value: h.c![i]! } : null;
  }
  return null;
}

/** A source balance must exist by the opening. Absence of a sale is never evidence of earlier ownership. */
export function holdingAssumptionAnchor(p: Position, a: Account, b: AssumedReturnBook) {
  const k = marketHoldingKey(p);
  const original = b.positions.find(x => marketHoldingKey(x) === k);
  const unvalued = b.unvalued.find(x => x.accountId === p.accountId && (x.securityKey === p.securityKey || (!!p.isin && x.isin === p.isin)));
  const movement = Object.values(b.movements).find(x => x.accountId === p.accountId && (x.securityKey === p.securityKey || (!!p.isin && x.isin === p.isin)) && !x.reason && positive(x.closing));
  const source = positive(original?.quantity) ? { quantity: original.quantity, date: a.asOf }
    : positive(unvalued?.quantity) ? { quantity: unvalued.quantity, date: unvalued.asOf }
    : movement ? { quantity: movement.closing, date: movement.periodTo } : null;
  const quantity = source?.quantity, date = source?.date;
  if (!positive(quantity) || !date || !Number.isFinite(time(date))) return null;
  return { quantity, date, position: original ?? p };
}

/** One eligible holding carried forward: its units on the history's split basis, both closes, and its gross dividends. */
export type AssumedHolding = {
  anchor: { quantity: number; date: string; position: Position };
  /** Units on the price history's split basis — `quantity × c[i]` is the holding's value on `t[i]`. */
  quantity: number;
  history: MarketHistory;
  opening: { date: string; value: number };
  closing: { date: string; value: number };
  incomeDates: { date: string; amount: number }[];
};
export type AssumedHoldingGap = { reason: string; detail?: string; pending?: boolean };

/**
 * THE ONE RULE FOR ONE HOLDING (Stage 10iz): every surface that carries a
 * recorded balance forward at published prices — the Returns tab's period
 * returns and the NAV card's book line — asks this, so a holding is assumed
 * held, refused or still loading for the same reason on both.
 */
export function assumedHolding(p: Position, a: Account | undefined, start: string | null, end: string, b: AssumedReturnBook): AssumedHolding | { gap: AssumedHoldingGap } {
  const gap = (reason: string, detail?: string, pending = false) => ({ gap: { reason, detail, pending } });
  if (!a) return gap('The holding’s owner and account must be identified.');
  const k = marketHoldingKey(p);
  const instrument = b.instruments.get(p.securityKey);
  if (p.marketSide === 'private' || p.valuedAtCost || p.assetClass === 'AIF') {
    return gap('A dated valuation from the company or fund is needed. Assuming it is still held cannot supply its value.');
  }
  if (!instrument || p.assetClass === 'Cash') {
    return gap('A published market price or fund NAV is needed. Assuming it is still held cannot supply a missing valuation.');
  }
  const anchor = holdingAssumptionAnchor(p, a, b);
  if (!anchor) return gap('A dated statement showing the number of shares or units is needed.');
  const requestedStart = start ?? anchor.date;
  if (requestedStart < anchor.date) return gap(`The share count used is dated ${anchor.date}. A confirmed count on or before ${requestedStart} is needed.`);
  if (!(time(end) > time(requestedStart))) return gap('Choose an end date after the recorded share balance.');
  const after = (d: string) => d > anchor.date && d <= end;
  const trades = b.trades[k] ?? [];
  const moved = Object.values(b.movements).find(m => m.accountId === p.accountId && (m.securityKey === p.securityKey || (!!p.isin && m.isin === p.isin))
    && m.periodTo && after(m.periodTo) && (m.reason || m.unclassified || (m.unitsIn ?? 0) > 0 || (m.unitsOut ?? 0) > 0));
  const capital = b.moves.find(m => m.accountId === p.accountId && after(m.date)
    && (m.securityKey === p.securityKey || (!m.securityKey && a.engagement === 'PMS' && m.direction === 'out'))
    && !(m.securityKey === p.securityKey && !m.units && /dividend|income|interest/i.test(m.label)));
  const trade = trades.find(t => after(t.date));
  if (trade || moved || capital || (anchor.position.realizedLotsAfter ?? 0) > 0) {
    return gap('A later purchase, sale, withdrawal or transfer is recorded. We need a matching share balance before assuming the quantity stayed the same.');
  }
  const h = b.histories[instrument.key];
  if (!h) return gap('Prices are still loading. No new statement is needed yet.', undefined, true);
  if (!h.ok) return gap('Historical prices could not load. Retry the price history; no new statement is needed yet.', h.reason);
  const opening = publishedClose(h, requestedStart), closing = publishedClose(h, end);
  if (!opening || !closing || closing.date <= opening.date) {
    return gap(`A published closing price is needed near ${requestedStart} and ${end}. Available history: ${h.first} → ${h.last}.`);
  }
  let quantity = anchor.quantity;
  const incomeDates: { date: string; amount: number }[] = [];
  if (h.basis === 'nav') {
    // “Growth Opportunities Fund — IDCW” is a dividend option, despite its
    // strategy name. Require the option suffix, and reject payout wording.
    const growth = /\b(?:growth|accumulation)(?:\s+option)?\s*$/i.test(h.name)
      && !/\b(?:idcw|reinvestment|payout)\b/i.test(h.name);
    if (!growth) return gap('This fund may pay distributions. Its dated payouts are needed as well as NAVs.');
  } else {
    // Close is already split-adjusted to the history's last day. Put source units on
    // that SAME basis, then use public gross entitlements without dividend reinvestment.
    // A split effective today can already restate yesterday's Yahoo close
    // while today's market is still open. Match that basis too, without using
    // today's unfinished price or claiming any later dividend entitlement.
    const basisThrough = [h.last, ...(h.splits ?? []).map(s => s.date)].sort().at(-1)!;
    const projected = projectActions({ ...anchor.position, quantity }, anchor.date, basisThrough, b.actions);
    const incomePlan = basisThrough === closing.date ? projected : projectActions({ ...anchor.position, quantity }, anchor.date, closing.date, b.actions);
    if (projected.quantityIssues.length || incomePlan.incomeIssues.length || incomePlan.quantityIssues.length) {
      return gap('Share splits and dividends still need checking for these dates.', [...new Set([...projected.quantityIssues, ...incomePlan.quantityIssues, ...incomePlan.incomeIssues])].join('; '));
    }
    const shareEvents = projected.lines.filter(l => l.status === 'adjusted');
    const priceEvents = h.splits?.filter(s => s.date > anchor.date && s.date <= basisThrough);
    if (!priceEvents || shareEvents.length !== priceEvents.length || shareEvents.some(l => !priceEvents.some(s => s.date === l.action.exDate && Math.abs(s.factor - (l.action.factor ?? 0)) < 1e-6))) {
      return gap('The price history and share-split records do not match. A checked price and share balance are needed.');
    }
    quantity = projected.adjustedQuantity;
    for (const line of incomePlan.lines) if (line.status === 'declared' && line.amount != null && line.action.exDate
      && line.action.exDate > opening.date && line.action.exDate <= closing.date) incomeDates.push({ date: line.action.exDate, amount: line.amount });
  }
  return { anchor, quantity, history: h, opening, closing, incomeDates };
}

/** Fill only eligible holdings. A statement return takes precedence at the caller. */
export function assumedHoldingReturns(positions: readonly Position[], accounts: readonly Account[], start: string | null, end: string, b: AssumedReturnBook) {
  const units: ReturnUnit[] = [], gaps: ReturnGap[] = []; let pending = 0;
  const accountMap = new Map(accounts.map(a => [a.accountId, a]));
  for (const p of positions) {
    const a = accountMap.get(p.accountId), k = marketHoldingKey(p);
    const label = `${p.security} · ${a?.owner ?? 'Owner unavailable'} · ${a?.provider ?? 'Provider unavailable'} · account ${a?.accountNo ?? 'unknown'}`;
    const r = assumedHolding(p, a, start, end, b);
    if ('gap' in r) {
      if (r.gap.pending) pending++;
      gaps.push({ accountId: p.accountId, securityKey: p.securityKey, label, reason: r.gap.reason, detail: r.gap.detail, plainReason: true, value: p.marketValue });
      continue;
    }
    const { quantity, opening, closing, incomeDates, history: h, anchor } = r;
    const openValue = quantity * opening.value, closeValue = quantity * closing.value;
    const income = incomeDates.reduce((s, x) => s + x.amount, 0), gain = closeValue - openValue + income;
    if (![openValue, closeValue, income, gain].every(Number.isFinite)) {
      gaps.push({ accountId: p.accountId, securityKey: p.securityKey, label, reason: 'The quantity and prices could not be matched.', plainReason: true, value: p.marketValue });
      continue;
    }
    units.push({ key: k, accountId: p.accountId, label, positions: [p], gain, invested: openValue, close: closeValue,
      from: opening.date, to: closing.date,
      assumption: { owner: a!.owner, statementDate: anchor.date, quantity: anchor.quantity, source: h.source,
        opening: openValue, closing: closeValue, income, incomeDates },
      window: { accountId: k, owner: a!.owner, label, openDate: opening.date, closeDate: closing.date,
        openValue, closeValue, openedInWindow: false, flows: incomeDates.map(x => ({ date: x.date, amount: x.amount, description: 'Gross dividend entitlement; holding assumed unchanged' })),
        capitalIn: 0, capitalOut: income, gain } });
  }
  return { units, gaps, pending };
}
