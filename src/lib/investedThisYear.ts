import type { Account, HoldingTrade, Position, PositionTranches } from './types';
import type { InvestedOn } from './investedOn';
import { daysBetween, type ReturnType } from './periodReturns';
import { valueDateOf, isDebtHolding, mayAnnualise } from './analytics';
import { xirr } from './xirr';

export type PurchaseLot = { date: string; quantity: number | null; cost: number };
export type PurchaseSources = {
  lots: Readonly<Record<string, readonly PurchaseLot[]>>;
  tranches: Readonly<Record<string, PositionTranches>>;
  trades: Readonly<Record<string, readonly HoldingTrade[]>>;
  dates: (p: Position) => InvestedOn | null;
};
export type YearInvestment = { position: Position; lots: PurchaseLot[]; cost: number; value: number; gain: number;
  first: string; last: string; valuedOn: string; periodPct: number; pct: number | null; annual: boolean; returnMissing: string | null };
export type YearGap = { position: Position; reason: string;
  /** What is missing: the purchases themselves, or a value after verified purchases (Stage 10lh). */
  need?: 'purchases' | 'value' };
const keyOf = (p: Position) => `${p.accountId}|${p.securityKey}`;
const dated = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
const sum = <T,>(xs: readonly T[], f: (x: T) => number) => xs.reduce((n,x) => n+f(x),0);

export function investmentYearStart(end: string, calendar = false) {
  const year = Number(end.slice(0,4)) - (!calendar && Number(end.slice(5,7)) < 4 ? 1 : 0);
  return `${year}-${calendar ? '01-01' : '04-01'}`;
}

/** Reconstruct surviving buys only after the builder has verified the complete unit tape. */
function tradeLots(p: Position, sources: PurchaseSources): PurchaseLot[] | null {
  if (!p.tradeRecord?.held || p.tradeRecord.unaccounted !== 0) return null;
  const trades = (sources.trades[keyOf(p)] ?? []).filter(t => t.date >= p.tradeRecord!.from && t.date <= p.tradeRecord!.to)
    .map((t,i) => ({...t,i})).sort((a,b) => a.date.localeCompare(b.date) || (a.side===b.side ? a.i-b.i : a.side==='buy'?-1:1));
  const lots: PurchaseLot[] = [];
  for (const t of trades) {
    if (!dated(t.date) || !(t.quantity! > 0)) return null;
    if (t.side === 'buy') {
      const cost = t.amount ?? (t.price != null ? t.price*t.quantity! : null);
      if (!(cost! > 0)) return null;
      lots.push({date:t.date,quantity:t.quantity,cost:cost!});
    } else {
      let left = t.quantity!;
      while (left > .000001 && lots.length) {
        const lot = lots[0], take = Math.min(left,lot.quantity!);
        lot.cost *= (lot.quantity!-take)/lot.quantity!;
        lot.quantity! -= take; left -= take;
        if (lot.quantity! < .000001) lots.shift();
      }
      if (left > .000001) return null;
    }
  }
  return lots.length ? lots : null;
}

/** No account funding date or product-review range is lent to an underlying security. */
export function purchaseLots(p: Position, sources: PurchaseSources): PurchaseLot[] | null {
  const key = keyOf(p), tranches = sources.tranches[key];
  let costFromTape=false;
  let lots: PurchaseLot[] | null = sources.lots[key]?.map(l=>({...l})) ?? null;
  if (!lots?.length && tranches && (tranches.basis==='fifo' || tranches.moves.every(m=>m.direction==='in'))) {
    lots = tranches.moves.filter(m=>m.direction==='in').map(m=>({date:m.date,quantity:m.units,cost:m.invested ?? m.amount ?? NaN}));
  }
  if (!lots?.length) {lots = tradeLots(p,sources);costFromTape=!!lots?.length;}
  if (!lots?.length) {
    const d = sources.dates(p);
    if (!d || d.reviewSource || d.sources.includes('review') || d.first!==d.last || !dated(d.first) || p.costUnavailable || !(p.costBasis! > 0)) return null;
    lots = [{date:d.first,quantity:p.quantity,cost:p.costBasis!}];
  }
  if (lots.some(l=>!dated(l.date) || !Number.isFinite(l.cost) || !(l.cost>0))) return null;
  // A dated lot list must account for the holding's entire cost and every unit.
  // The trade's settled amount is the amount paid, including charges. A
  // statement's remaining book cost may exclude those charges. The verified
  // unit tape licenses its own purchase cash; never scale it to the book cost.
  if (!costFromTape && (p.costUnavailable || p.costBasis == null || Math.abs(sum(lots,l=>l.cost)-p.costBasis)>Math.max(1,lots.length*.01))) return null;
  if (lots.length>1 && (!(p.quantity!>0) || lots.some(l=>!(l.quantity!>0)) || Math.abs(sum(lots,l=>l.quantity!)-p.quantity!)>.005)) return null;
  if (lots.length===1 && lots[0].quantity!=null && p.quantity!=null && Math.abs(lots[0].quantity-p.quantity)>.005) return null;
  return lots.sort((a,b)=>a.date.localeCompare(b.date));
}

/** Current units bought this year. Older units, exited units and unknown dates never enter the figure. */
export function investedThisYear(positions: readonly Position[], accounts: readonly Account[], sources: PurchaseSources,
  start: string, end: string, type: ReturnType, now = Date.parse(`${end}T12:00:00Z`)) {
  const included: YearInvestment[] = [], missing: YearGap[] = [], older: Position[] = [];
  const registry = new Map(accounts.map(a=>[a.accountId,a]));
  for (const p of positions) {
    const dates = sources.dates(p);
    if (dates && !dates.reviewSource && !dates.sources.includes('review') && dates.last < start) { older.push(p); continue; }
    const lots = purchaseLots(p,sources);
    if (!lots) { missing.push({position:p,need:'purchases',reason:dates?.first && dates.first<start && dates.last>=start
      ? 'We need the purchase dates, units and costs for each batch, to separate this year’s units from older units.'
      : 'We need purchase dates, units and costs that match this holding. An account opening date or review date is not enough.'}); continue; }
    const selected = lots.filter(l=>l.date>=start && l.date<=end);
    if (!selected.length) { older.push(p); continue; }
    const valuedOn = valueDateOf(p,registry.get(p.accountId)?.asOf ?? '',now);
    if (!valuedOn || valuedOn>end || selected.some(l=>l.date>valuedOn) || p.valuedAtCost || !(p.marketValue>=0) || !Number.isFinite(p.marketValue)) {
      missing.push({position:p,need:'value',reason:'We need a dated market value after these purchases. Purchase cost alone does not show a return.'}); continue;
    }
    const fraction = selected.length===lots.length ? 1 : sum(selected,l=>l.quantity!)/p.quantity!;
    const value=p.marketValue*fraction, cost=sum(selected,l=>l.cost), gain=value-cost, periodPct=gain/cost*100;
    const first=selected[0].date, last=selected.at(-1)!.date, days=daysBetween(first,valuedOn);
    let pct: number|null=periodPct, annual=false, returnMissing: string|null=null;
    // Under a year — every purchase this year is — the purchase-to-value
    // return stands for XIRR and CAGR alike; only debt is annualised (Stage 10hk).
    const annualisable = mayAnnualise(days,isDebtHolding(p));
    if (type==='xirr' && annualisable) {
      const result = xirr([...selected.map(l=>({date:new Date(`${l.date}T00:00:00Z`),amount:-l.cost})),{date:new Date(`${valuedOn}T00:00:00Z`),amount:value}]);
      pct=days>0 && result!=null && Number.isFinite(result) ? result*100 : null; annual=pct!=null;
      if (pct==null) returnMissing='A yearly return needs a value on a later day than the purchase.';
    } else if (type==='cagr' && annualisable && days>0) {
      if (new Set(selected.map(l=>l.date)).size===1 && value>0) {pct=(Math.pow(value/cost,365/days)-1)*100;annual=true;}
      else {pct=null;returnMissing='CAGR needs one purchase date. Choose Absolute return or XIRR for several purchases.';}
    }
    included.push({position:p,lots:selected,cost,value,gain,first,last,valuedOn,periodPct,pct,annual,returnMissing});
  }
  const measured=included.filter(r=>r.pct!=null && r.value>0), weightValue=sum(measured,r=>r.value);
  return {included,missing,older,cost:sum(included,r=>r.cost),value:sum(included,r=>r.value),gain:sum(included,r=>r.gain),
    pct:weightValue>0?sum(measured,r=>r.value*r.pct!)/weightValue:null,
    periodPct:weightValue>0?sum(measured,r=>r.value*r.periodPct)/weightValue:null,
    weightValue,annual:measured.length>0 && measured.every(r=>r.annual)};
}

/**
 * ── EVERY HOLDING PLACED (Stage 10lg; held to its evidence, Stage 10lh) ─────
 *
 * *"invested this year fix all"* — the family, 5 Nov 2026. A holding without
 * dated purchase lots this year was "needs purchase details". The financial
 * year's own selection (`useReturnSelection`, the cards' rule) places it:
 *
 * - HELD BEFORE THE YEAR: an older statement shows the same units on or before
 *   31 March with no trade since (`heldBeforeYear`), or its record opens on a
 *   value on or before 31 March and no money was added to it this year;
 * - FIRST VALUED THIS YEAR: its record opens after 31 March. Its first value
 *   and the money added since stand as what was paid, so its row is purchase
 *   to value like every other row (value − paid = gain), named so;
 * - TO CHECK: a record held before the year that money was also added to, or
 *   one money was taken out of, cannot tell this year's units from older or
 *   sold ones without purchase records; and a holding whose purchases are
 *   verified but whose value is missing keeps that reason.
 */
export type FirstValueUnit = { positions: readonly Position[]; from: string | null; to: string | null; invested: number; close: number;
  gain: number; held?: { date: string }; ownPct: number | null;
  /** The record's own window, where it has one: its opening value and the money it moved. */
  openValue?: number; capitalIn?: number; capitalOut?: number; flows?: readonly { date: string; amount: number }[] };

/** The same units on an older statement on or before `open`, with no trade since. */
export function heldBeforeYear(p: Position, open: string, balances: readonly { accountId: string; securityKey: string; asOf: string; quantity: number }[],
  trades: Readonly<Record<string, readonly { date: string }[]>>) {
  const q = p.quantity, since = trades[keyOf(p)] ?? [];
  return typeof q === 'number' && q > 0 && balances.some((b) => b.accountId === p.accountId && b.securityKey === p.securityKey && b.asOf <= open
    && Math.abs(b.quantity - q) <= Math.max(1e-3, 1e-7 * Math.abs(q)) && !since.some((t) => t.date > b.asOf));
}

export function placeEveryHolding<R extends globalThis.ReturnType<typeof investedThisYear>>(result: R, units: readonly FirstValueUnit[], fyOpen: string,
  heldBefore: (p: Position) => boolean, { type, valuedOn }: { type: ReturnType; valuedOn: (p: Position) => string | null }) {
  const unitOf = new Map<string, FirstValueUnit>();
  for (const u of units) for (const p of u.positions) unitOf.set(keyOf(p), u);
  const firstValued: (YearInvestment & { fromFirstValue: true })[] = [], missing: YearGap[] = [], older = [...result.older];
  for (const g of result.missing) {
    const p = g.position, u = unitOf.get(keyOf(p));
    // Only a holding missing its purchases is placed; a missing value keeps its reason.
    if (g.need !== 'purchases' || p.valuedAtCost) { missing.push(g); continue; }
    if (heldBefore(p)) { older.push(p); continue; }
    const firstOn = u ? (u.held ? u.held.date : u.from) : null;
    if (!u || !firstOn) { missing.push(g); continue; }
    if (firstOn <= fyOpen) {
      if ((u.capitalIn ?? 0) > 0) missing.push({ position: p, need: 'purchases', reason: 'Held before this year, with money added this year too. We need the purchase dates, units and costs to separate this year’s units from older units.' });
      else older.push(p);
      continue;
    }
    if ((u.capitalOut ?? 0) > 0) {
      missing.push({ position: p, need: 'purchases', reason: 'First valued this year, with money taken out since. We need the purchase dates, units and costs to separate the units still held from those sold.' });
      continue;
    }
    // A whole account's money is shared by its holdings in proportion to their value today.
    const total = sum(u.positions.filter((x) => x.marketValue > 0), (x) => x.marketValue);
    const share = total > 0 && p.marketValue > 0 ? p.marketValue / total : 0;
    const cost = u.invested * share, value = p.marketValue, gain = value - cost;
    if (!(cost > 0)) { missing.push(g); continue; }
    const on = valuedOn(p) ?? u.to ?? firstOn, days = daysBetween(firstOn, on), periodPct = gain / cost * 100;
    const inflows = (u.flows ?? []).filter((f) => f.amount < 0 && f.date > firstOn);
    let pct: number | null = periodPct, annual = false, returnMissing: string | null = null;
    // Under a year the purchase-to-value return stands; only debt is annualised (Stage 10hk).
    if (type !== 'absolute' && mayAnnualise(days, isDebtHolding(p)) && days > 0) {
      if (type === 'xirr') {
        const opening = u.openValue != null ? u.openValue * share : cost - sum(inflows, (f) => -f.amount * share);
        const r = xirr([{ date: new Date(`${firstOn}T00:00:00Z`), amount: -opening },
          ...inflows.map((f) => ({ date: new Date(`${f.date}T00:00:00Z`), amount: f.amount * share })),
          { date: new Date(`${on}T00:00:00Z`), amount: value }]);
        pct = r != null && Number.isFinite(r) ? r * 100 : null; annual = pct != null;
        if (pct == null) returnMissing = 'A yearly return needs a value on a later day than the first value.';
      } else if (!inflows.length && value > 0) { pct = (Math.pow(value / cost, 365 / days) - 1) * 100; annual = true; }
      else { pct = null; returnMissing = 'CAGR needs one dated amount. Choose Absolute return or XIRR where money was added later.'; }
    }
    firstValued.push({ position: p, lots: [], cost, value, gain, first: firstOn, last: firstOn, valuedOn: on,
      periodPct, pct, annual, returnMissing, fromFirstValue: true });
  }
  const included = [...result.included, ...firstValued];
  const measured = included.filter((r) => r.pct != null && r.value > 0), weightValue = sum(measured, (r) => r.value);
  return { ...result, included, missing, older, firstValued,
    cost: sum(included, (r) => r.cost), value: sum(included, (r) => r.value), gain: sum(included, (r) => r.gain),
    pct: weightValue > 0 ? sum(measured, (r) => r.value * r.pct!) / weightValue : null,
    periodPct: weightValue > 0 ? sum(measured, (r) => r.value * r.periodPct) / weightValue : null,
    weightValue, annual: measured.length > 0 && measured.every((r) => r.annual) };
}
