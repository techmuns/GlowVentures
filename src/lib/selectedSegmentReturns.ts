/** The Returns toolbar's measured subset, grouped without inventing a holding split. */
import type { Account, Position } from './types';
import { accountIndex } from './accounts';
import { fifoTotals } from './fifo';
import { measureInception, measureWindow, type AccountWindow, type InceptionRow, type Measured, type ReturnType } from './periodReturns';
import { segmentOf, type SegmentAxis, type SectorLookup } from './segmentReturns';

export type ReturnGap = { accountId: string; label: string; owner?: string; reason: string; value?: number; securityKey?: string };
export type ReturnUnit = { key: string; accountId: string; label: string; positions: readonly Position[];
  gain: number; invested: number; close: number; from: string | null; to: string;
  gainParts?: { unrealised: number | null; realised: number | null; income: number | null };
  window?: AccountWindow; inception?: InceptionRow };
export type SelectedLine = { key: string; label: string; positions: readonly Position[]; value: number;
  units: ReturnUnit[]; missing: ReturnGap[]; measured: Measured | null; gain: number | null;
  invested: number | null; returnPct: number | null;
  /** The return over the measured period itself, not annualised — beside a yearly XIRR or CAGR. */
  periodPct: number | null; contribution: number | null; children: SelectedLine[] };
export type ReturnSelection = { inception: boolean; type: ReturnType; start: string | null; end: string | null;
  windows: AccountWindow[]; inceptionRows: InceptionRow[]; excluded: ReturnGap[]; outside?: ReturnGap[];
  /** State XIRR over the period rather than per year — the headline cards' reading (Stage 10gu). */
  periodXirr?: boolean };
export const UNSPLIT_RETURNS = '__account_returns';

const carries = (p: Position) => p.marketValue !== 0 || (p.costBasis ?? 0) !== 0
  || (p.costOfUnitsSold ?? 0) !== 0 || (p.realizedPnL ?? 0) !== 0 || (p.dividendReceived ?? 0) !== 0;
const holdingKey = (p: Position) => `${p.accountId}|${p.securityKey}`;
const sourceLabel = (a: Account | undefined) => a ? `${a.owner} · ${a.provider} · account ${a.accountNo}` : 'Statement source unavailable';

/** Missing fields stay separate from the measured subset; they never poison its sum. */
export function sinceInvestmentUnits(current: readonly Position[], exited: readonly Position[], accounts: Account[]) {
  const idx = accountIndex(accounts), units: ReturnUnit[] = [], missing: ReturnGap[] = [];
  const all = [...current, ...exited];
  for (const accountId of new Set(all.map(p => p.accountId))) {
    const a = idx.get(accountId), held = current.filter(p => p.accountId === accountId), left = exited.filter(p => p.accountId === accountId);
    // Capital is the whole mandate's verified since-investment basis, including exits.
    if (a?.engagement === 'PMS' && a.capital && a.capital.contributed > 0) {
      const f = fifoTotals(held, { accounts, universe: current, exited: left });
      if (f.gain != null && f.deployed != null) {
        units.push({ key: accountId, accountId, label: sourceLabel(a), positions: [...held, ...left],
          gain: f.gain, invested: f.deployed, gainParts: { unrealised: f.unrealised, realised: f.realised, income: f.income },
          close: (held.length ? held : left).reduce((s, p) => s + p.marketValue, 0), from: null, to: a.asOf });
        continue;
      }
    }
    for (const p of [...held, ...left]) {
      const reason = p.valuedAtCost ? 'Only the purchase cost is recorded. A later market value is needed to work out the gain.'
        : p.costUnavailable || p.costBasis == null ? 'The purchase cost is missing or has not been verified. A purchase record or broker cost report is needed.'
        : p.hprUnavailableReason ? `The purchase or sale record is incomplete. ${p.hprUnavailableReason}` : null;
      if (reason) { missing.push({ accountId, label: `${p.security} · ${sourceLabel(a)}`, reason, securityKey: p.securityKey, value: p.marketValue }); continue; }
      const f = fifoTotals(held.includes(p) ? [p] : [], { exited: held.includes(p) ? [] : [p] });
      if (f.gain == null || f.deployed == null) continue; // An empty, never-invested line has nothing to measure.
      units.push({ key: holdingKey(p), accountId, label: `${p.security} · ${sourceLabel(a)}`, positions: [p],
        gain: f.gain, invested: f.deployed, gainParts: { unrealised: f.unrealised, realised: f.realised, income: f.income }, close: held.includes(p) ? p.marketValue : 0,
        from: p.heldSince ?? null, to: a?.asOf ?? '' });
    }
  }
  return { units, missing };
}

export function selectedSegmentReturns(current: readonly Position[], exited: readonly Position[], accounts: Account[],
  axis: SegmentAxis, selection: ReturnSelection, sectorOf: SectorLookup = () => null, calculationCurrent: readonly Position[] = current) {
  const idx = accountIndex(accounts), seg = segmentOf(axis, idx, sectorOf);
  const absoluteInception = selection.inception && selection.type === 'absolute';
  let units: ReturnUnit[], missing: ReturnGap[];
  if (absoluteInception) {
    ({ units, missing } = sinceInvestmentUnits(calculationCurrent, exited, accounts));
    const recorded = new Set(calculationCurrent.map(holdingKey));
    for (const p of current.filter(p => !recorded.has(holdingKey(p)))) missing.push({ accountId: p.accountId,
      securityKey: p.securityKey, label: `${p.security} · ${sourceLabel(idx.get(p.accountId))}`, value: p.marketValue,
      reason: p.costBasis == null || p.costUnavailable ? 'The purchase cost is missing or has not been verified. A purchase record or broker cost report is needed.'
        : p.hprUnavailableReason ?? 'A live price is available, but a verified purchase-cost and statement valuation record is needed to calculate this holding’s gain.' });
  }
  else {
    missing = [...selection.excluded];
    units = selection.inception ? selection.inceptionRows.map(r => {
      // Review holder rows are independently dated investments, not whole accounts.
      const a = accounts.find(a => r.accountId === a.accountId || r.accountId.startsWith(`${a.accountId}|`));
      const ps = [...current, ...exited].filter(p => p.accountId === a?.accountId && (r.accountId === a?.accountId || holdingKey(p) === r.accountId));
      return { key: r.accountId, accountId: a?.accountId ?? r.accountId, label: `${r.owner} · ${r.label}`, positions: ps,
        gain: r.value + r.takenOut - r.paidIn, invested: r.paidIn, close: r.value, from: r.first, to: r.valueAsOf, inception: r };
    }) : selection.windows.map(r => ({ key: r.accountId, accountId: r.accountId, label: `${r.owner} · ${r.label}`,
      positions: [...current, ...exited].filter(p => p.accountId === r.accountId), gain: r.gain,
      invested: r.openValue + r.capitalIn, close: r.closeValue, from: r.openDate, to: r.closeDate, window: r }));
  }
  // The display book can also contain live-only custody lines, absent from
  // the statement return book. Every uncovered displayed holding needs an
  // explanation, including accounts called "outside" by that statement book.
  const covered = new Set(units.flatMap(u => u.positions.map(holdingKey)));
  for (const p of current) {
    if (covered.has(holdingKey(p)) || missing.some(g => g.accountId === p.accountId && (!g.securityKey || g.securityKey === p.securityKey))) continue;
    const outside = selection.outside?.find(g => g.accountId === p.accountId);
    const nil = outside && /nil throughout|held nothing|no invested capital|balance is nil/i.test(outside.reason);
    missing.push({ accountId: p.accountId, securityKey: p.securityKey, label: `${p.security} · ${sourceLabel(idx.get(p.accountId))}`, value: p.marketValue,
      reason: outside && nil ? outside.reason : `No verified opening value and complete dated capital record for these dates.${outside ? ` ${outside.reason}` : ''}` });
  }
  const measure = (us: ReturnUnit[]): Measured | null => {
    if (!us.length) return null;
    if (absoluteInception) {
      const gain = us.reduce((s, u) => s + u.gain, 0), base = us.reduce((s, u) => s + u.invested, 0);
      return { shown: base > 0, pct: base > 0 ? gain / base * 100 : undefined, basis: 'cumulative',
        formula: 'Gain divided by the purchase cost of units held and sold, or money paid into a whole managed account.',
        reason: base > 0 ? undefined : 'There is no positive purchase cost to divide the gain by.' };
    }
    const opts = { periodXirr: selection.periodXirr };
    return selection.inception ? measureInception(us.map(u => u.inception!), selection.type, String, opts)
      : measureWindow(us.map(u => u.window!), selection.type, String, opts);
  };
  const totalMeasured = measure(units);
  const denominator = selection.type !== 'absolute' ? null : absoluteInception
    ? units.reduce((s, u) => s + u.invested, 0) : totalMeasured?.working?.base ?? null;
  const line = (key: string, label: string, ps: readonly Position[], us: ReturnUnit[], gaps: ReturnGap[]): SelectedLine => {
    const measured = measure(us), gain = us.length ? us.reduce((s, u) => s + u.gain, 0) : null;
    return { key, label, positions: ps, value: ps.reduce((s, p) => s + p.marketValue, 0), units: us, missing: gaps, measured, gain,
      invested: us.length ? us.reduce((s, u) => s + u.invested, 0) : null,
      returnPct: measured?.shown && measured.pct != null && Number.isFinite(measured.pct) ? measured.pct : null,
      periodPct: !measured?.shown ? null : measured.basis !== 'annual' ? measured.pct ?? null
        : measured.working?.periodPct ?? (measured.working?.growthRatio != null ? (measured.working.growthRatio - 1) * 100 : null),
      contribution: gain != null && denominator != null && denominator > 0 ? gain / denominator * 100 : null, children: [] };
  };
  const groups = new Map<string, Position[]>();
  for (const p of current) { const k = seg.key(p); groups.set(k, [...(groups.get(k) ?? []), p]); }
  const allocated = new Map<string, ReturnUnit[]>(), unsplit: ReturnUnit[] = [];
  for (const u of units) {
    const ps = u.positions.filter(carries), keys = new Set((ps.length ? ps : u.positions).map(seg.key));
    // A closed managed account's cash residue does not identify the stocks
    // that earned its gain. Only category/side can keep that mandate whole.
    const closedMandate = u.key === u.accountId && idx.get(u.accountId)?.engagement === 'PMS'
      && !current.some(p => p.accountId === u.accountId);
    if (keys.size !== 1 || (closedMandate && axis !== 'category' && axis !== 'side')) { unsplit.push(u); continue; }
    const key = [...keys][0];
    if (!groups.has(key)) groups.set(key, []); // A fully exited segment still earned its gain.
    allocated.set(key, [...(allocated.get(key) ?? []), u]);
  }
  const rows = [...groups].map(([key, ps]) => {
    const us = allocated.get(key) ?? [];
    const accountIds = new Set(ps.map(p => p.accountId));
    const gaps = missing.filter(g => accountIds.has(g.accountId) && (!g.securityKey || ps.some(p => p.securityKey === g.securityKey && p.accountId === g.accountId)));
    for (const u of unsplit.filter(u => accountIds.has(u.accountId))) gaps.push({ accountId: u.accountId, label: u.label,
      reason: 'This statement gives a return for the whole account. It does not give separate opening values and money movements for these holdings. Its gain is included in “Account returns without a holding split”.' });
    const r = line(key, seg.label(key, ps[0] ?? us[0]?.positions[0]), ps, us, gaps);
    // One account per child keeps the source of each calculated return visible.
    for (const id of new Set([...ps.map(p => p.accountId), ...us.map(u => u.accountId)])) {
      r.children.push(line(id, sourceLabel(idx.get(id)), ps.filter(p => p.accountId === id), us.filter(u => u.accountId === id), gaps.filter(g => g.accountId === id)));
    }
    return r;
  });
  if (unsplit.length) {
    const r = line(UNSPLIT_RETURNS, 'Account returns without a holding split', [], unsplit, []);
    r.children = unsplit.map(u => line(u.key, u.label, [], [u], []));
    rows.push(r);
  }
  rows.sort((a, b) => a.key === UNSPLIT_RETURNS ? 1 : b.key === UNSPLIT_RETURNS ? -1 : (b.gain ?? -Infinity) - (a.gain ?? -Infinity) || b.value - a.value);
  const total = line('total', 'Total · available data', current, units, missing);
  return { rows, total, coveredHoldings: current.filter(p => covered.has(holdingKey(p))).length,
    coveredValue: current.filter(p => covered.has(holdingKey(p))).reduce((s, p) => s + p.marketValue, 0),
    closingValue: units.reduce((s, u) => s + u.close, 0), accounts: new Set(units.map(u => u.accountId)).size, denominator };
}

/** Source-specific, plain wording for the table's missing-record cards. */
export function returnGapText(reason: string, start: string | null): string {
  if (/at least 365 days/i.test(reason)) return 'CAGR needs at least one year of history. Choose a longer period, or select Absolute return or XIRR.';
  if (/several dated purchases/i.test(reason)) return 'There were several purchases on different dates. Select XIRR to include them.';
  if (/different money.weighted rates/i.test(reason)) return 'These records give more than one possible XIRR. Select Absolute return instead.';
  if (/do not yield a money.weighted rate/i.test(reason)) return 'These amounts and dates do not give a valid XIRR. Check the payment dates, amounts and closing value.';
  if (/spans no days|at work for no days/i.test(reason)) return 'There is no time between the starting and closing values. Choose a longer period.';
  if (/no positive purchase cost|nothing was paid in|money at work.*not positive/i.test(reason)) return 'There is no positive invested amount to calculate a return. Check the purchase costs and payments.';
  if (/return for the whole account/i.test(reason)) return 'Only the whole account’s return is available. We need separate values and dated payments for each holding.';
  if (/sale proceeds|sale amounts?.*unverified|unverified.*sale/i.test(reason))
    return 'The sale amount is missing or unverified. We need a sale statement showing what was sold and the amount received.';
  if (/purchase or sale/i.test(reason)) return 'Purchase or sale details are incomplete. We need the amounts paid and received.';
  if (/live price.*purchase.cost.*statement valuation/i.test(reason))
    return 'The purchase cost and statement value need checking. We need a purchase record and a recent valuation statement.';
  if (/Only the purchase|held at.*cost/i.test(reason)) return 'We only have the purchase cost. We need a later value to calculate the gain.';
  if (/purchase cost/i.test(reason)) return 'The purchase cost is missing or unverified. We need a purchase statement showing the amount paid.';
  if (/purchase date.*(?:missing|unavailable|unverified)|(?:missing|unavailable|unverified).*purchase date/i.test(reason)) return 'The purchase date is missing or unverified. We need a purchase statement showing the date.';
  if (/nil throughout|held nothing|no invested capital|balance is nil/i.test(reason)) return 'This account had no money invested during the selected dates. Its current holdings are outside this period.';
  if (/review values.*one date/i.test(reason)) return 'We need the value at the start and end of this period, plus dated money added and taken out.';
  if (/no statement values it on or before|record opens on|days earlier|no.*opening|opening value|opening valuation/i.test(reason))
    return `We need a statement showing what this was worth at the start${start ? ` (${start})` : ''}, plus dated money added and taken out.`;
  if (/no statement values it after|before any statement values it after|no statement.*values|no valuation/i.test(reason))
    return `We need a later statement showing what this investment is worth.`;
  if (/capital|dated|flow|purchase|payment|units|reconcil/i.test(reason))
    return 'Payment details are incomplete. We need all money added and taken out, with dates, matching the statement value.';
  return reason;
}
