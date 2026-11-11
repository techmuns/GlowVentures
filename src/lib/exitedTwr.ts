import { recordedHoldingOf } from './holdingFlows';
import { marketHoldingKey } from './marketReturns';
import { publishedClose, type AssumedReturnBook } from './assumedHoldingReturns';
import { projectActions } from './corporateActions';
import type { Account, Position } from './types';
import type { ReturnUnit } from './selectedSegmentReturns';

export type ExitedTwrFound = { outside: true } | { reason: string } | { unit: ReturnUnit };
/** Recover the performance of a fully sold holding, rather than silently lose
 * its realised return when the period selection iterates today's holdings.
 * A reconciled sale proves nil after its final exit; that needs no price.
 */
export function exitedTwrUnit(p: Position, a: Account | undefined, start: string | null, end: string, b: AssumedReturnBook): ExitedTwrFound {
  const gap = (reason: string) => ({ reason });
  if (!a) return gap('The account for this exited investment must be identified.');
  const r = recordedHoldingOf(p);
  if (!r?.unitRecord?.length || !r.cashRecord?.length) {
    if (start && a.asOf <= start) return { outside: true }; // already nil at the period's start
    return gap('Dated purchases, sale proceeds and unit balances are needed for this exited investment.');
  }
  const units = [...r.unitRecord].sort((x, y) => x.date.localeCompare(y.date));
  const cash = [...r.cashRecord].sort((x, y) => x.date.localeCompare(y.date));
  if (units.some(x => !Number.isFinite(x.units) || x.units < 0) || cash.some(x => !Number.isFinite(x.amount) || x.amount < 0)
    || units.at(-1)!.units !== 0 || r.quantity !== 0) return gap('The sale record does not reconcile to a fully exited holding.');
  const first = [...units.map(x => x.date), ...cash.map(x => x.date)].sort()[0];
  const from = start ?? new Date(Date.parse(`${first}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const unitsOn = (d: string) => units.filter(x => x.date <= d).at(-1)?.units ?? 0;
  const inPeriod = cash.filter(x => x.date > from && x.date <= end);
  if (!(from < end) || (unitsOn(from) === 0 && !inPeriod.length)) return { outside: true };
  const instrument = b.instruments.get(p.securityKey), h = instrument && b.histories[instrument.key];
  if (!instrument) return gap('A verified public price or fund NAV history is needed for this exited investment.');
  if (!h) return gap('Prices for this exited investment are still loading.');
  if (!h.ok) return gap(`Historical prices for this exited investment could not load. ${h.reason}`);
  // Recovered ledger units and adjusted prices must be on the same basis.
  // Refuse uncertain split conversions, including splits after the sale.
  if (h.splits?.some(s => s.date > from)) return gap('A reconciled split-adjusted ownership history is needed for this exited investment.');
  const opening = unitsOn(from) > 0 ? publishedClose(h, from) : { date: from, value: 0 };
  if (!opening) return gap('The opening price of this exited investment is missing.');
  const lastHeld = units.reduce((last, row, i) => row.units > 0 ? i : last, -1);
  if (lastHeld < 0) return gap('An invested unit balance before the full exit is needed.');
  const closedOn = units[lastHeld + 1]?.date;
  if (!closedOn) return gap('The final exit is not dated by the unit ledger.');
  const close = unitsOn(end) === 0 ? { date: end, value: 0 } : publishedClose(h, end);
  if (!close) return gap('The closing price of this exited investment is missing.');
  const closing = unitsOn(close.date) * close.value;
  const flows = inPeriod.map(x => ({ date: x.date, amount: x.side === 'buy' ? -x.amount : x.amount,
    description: x.side === 'buy' ? 'Purchase on the record' : x.side === 'sell' ? 'Sale on the record' : 'Income on the record' }));
  let assumed = false;
  if (h.basis !== 'nav' && !cash.some(x => x.side === 'income')) {
    const through = end < r.asOf ? end : r.asOf;
    const cuts = [...new Set([from, ...inPeriod.map(x => x.date), through])].filter(d => d >= from && d <= through).sort();
    for (let i = 0; i + 1 < cuts.length; i++) {
      const quantity = unitsOn(cuts[i]); if (!(quantity > 0)) continue;
      const plan = projectActions({ ...p, quantity }, cuts[i], cuts[i + 1], b.actions);
      if (plan.quantityIssues.length || plan.incomeIssues.length || plan.lines.some(l => l.status === 'adjusted' || l.status === 'needs-review')) {
        return gap('The dividend and corporate-action record for this exited investment is incomplete.');
      }
      for (const l of plan.lines) if (l.status === 'declared' && l.amount != null && l.action.exDate && l.action.exDate > cuts[i] && l.action.exDate <= cuts[i + 1]) {
        flows.push({ date: l.action.exDate, amount: l.amount, description: 'Gross dividend entitlement' }); assumed = true;
      }
    }
  }
  const marks = h.t.flatMap((date, i) => {
    const qty = unitsOn(date), price = h.c?.[i];
    return date > opening.date && date < close.date && (qty === 0 || (typeof price === 'number' && price > 0))
      ? [{ date, value: qty === 0 ? 0 : qty * price! }] : [];
  });
  // A fully paid sale is a real nil valuation even if the security later stops trading.
  if (closedOn > opening.date && closedOn < close.date && !marks.some(m => m.date === closedOn)) marks.push({ date: closedOn, value: 0 });
  marks.sort((x, y) => x.date.localeCompare(y.date)); flows.sort((x, y) => x.date.localeCompare(y.date));
  const openValue = unitsOn(opening.date) * opening.value;
  const capitalIn = flows.filter(f => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const capitalOut = flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const gain = closing - openValue - capitalIn + capitalOut;
  const label = `${p.security} · ${a.owner} · ${a.provider} · account ${a.accountNo}`;
  const unit: ReturnUnit = { key: marketHoldingKey(p), accountId: p.accountId, label, positions: [p], gain, invested: openValue + capitalIn,
    close: closing, from: opening.date, to: close.date, closedOn, basis: 'broker-trades',
    window: { accountId: marketHoldingKey(p), owner: a.owner, label, openDate: opening.date, openValue,
      closeDate: close.date, closeValue: closing, openedInWindow: unitsOn(from) === 0, marks, flows, capitalIn, capitalOut, gain } };
  if (assumed) unit.assumption = { owner: a.owner, statementDate: r.asOf, quantity: 0, source: h.source, opening: openValue, closing,
    income: flows.filter(f => /entitlement/.test(f.description)).reduce((s, f) => s + f.amount, 0), incomeDates: flows.filter(f => /entitlement/.test(f.description)).map(f => ({ date: f.date, amount: f.amount })) };
  return { unit };
}
