import { daysBetween, periodStart, type AccountWindow } from './periodReturns';

/** INR capital and valuations throughout; display FX never enters this engine.
 * End-of-day external flows: (closing value − net contribution) / opening value.
 * Link at EVERY flow date, with every constituent valued on that same date.
 * Initial funding establishes the starting capital; subsequent flows are EOD.
 * https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/
 */
export const TWR_COLUMNS = [
  { key: 'twrMtd', label: 'Adjusted TWR (Current Month, INR)', period: 'mtd' },
  { key: 'twrQtd', label: 'Adjusted TWR (Current Quarter, INR)', period: 'qtd' },
  { key: 'twrYtd', label: 'Adjusted TWR (YTD, INR)', period: 'ytd' },
  { key: 'twrSi', label: 'Annualised Adjusted TWR (Since Inception, INR)', period: 'inception' },
] as const;
export type TwrColumn = typeof TWR_COLUMNS[number]['key'];
export type TwrGap = { label: string; reason: string };
export type TwrRecord = { key: string; label: string; window: AccountWindow; assumed?: boolean; inceptionKnown?: boolean; closedOn?: string };
export type TwrStep = { from: string; to: string; opening: number; closing: number; netIn: number; growth: number };
export type TwrResult = { pct: number | null; periodPct: number | null; annual: boolean; from: string | null; to: string | null;
  assumed: boolean; records: number; gaps: TwrGap[]; steps: TwrStep[] };

export function twrPeriodStart(period: typeof TWR_COLUMNS[number]['period'], end: string): string | null {
  if (period === 'inception') return null;
  if (period !== 'qtd') return periodStart(period, end);
  const y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7));
  return new Date(Date.UTC(y, Math.floor((m - 1) / 3) * 3, 0)).toISOString().slice(0, 10);
}

export const missingTwr = (gaps: TwrGap[], records = 0, assumed = false): TwrResult => ({
  pct: null, periodPct: null, annual: false, from: null, to: null, assumed, records, gaps, steps: [],
});
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const validDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`))
  && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const weekendGap = (from: string, to: string) => {
  const n = daysBetween(from, to);
  if (n < 0 || n > 3) return false;
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).getUTCDay();
    if (d !== 0 && d !== 6) return false;
  }
  return true;
};

/** Strict full-row coverage. Sparse marks and unknown flows never become flat performance.
 * A no-flow interval needs just its two valuations; a flow needs a valuation
 * of the whole group on its date. Group rates are struck on summed values,
 * never on an average of constituent percentages or today's weights.
 */
export function adjustedTwr(records: readonly TwrRecord[], { start, end, annualise = false, debt = false, gaps = [] }: {
  start: string | null; end: string; annualise?: boolean; debt?: boolean; gaps?: TwrGap[];
}): TwrResult {
  const assumed = records.some(r => r.assumed);
  const fail = (reason: string, label = 'This row') => missingTwr([...gaps, { label, reason }], records.length, assumed);
  if (gaps.length) return missingTwr([...gaps], records.length, assumed);
  if (!records.length) return fail('No complete valuation and cash-flow record is available for this period.');
  if (new Set(records.map(r => r.key)).size !== records.length) return fail('The same investment record occurs twice.');
  if (!validDay(end) || (start && (!validDay(start) || start >= end))) return fail('Choose an ending date after the opening date.');
  for (const r of records) {
    if (start == null && !r.inceptionKnown) return fail('A complete record from the first investment is needed for since-inception TWR.', r.label);
    const w = r.window;
    if (!validDay(w.openDate) || !validDay(w.closeDate) || !(w.openDate < w.closeDate)
      || [w.openValue, w.closeValue, ...(w.marks ?? []).map(m => m.value)].some(v => !Number.isFinite(v) || v < 0)
      || (w.marks ?? []).some(m => !validDay(m.date) || m.date < w.openDate || m.date > w.closeDate)
      || w.flows.some(f => !validDay(f.date) || !Number.isFinite(f.amount) || f.date <= w.openDate || f.date > w.closeDate)) {
      return fail('The valuation or cash-flow record is invalid or contains flows outside its measured dates.', r.label);
    }
    if (Math.abs(sum(w.flows.filter(f => f.amount < 0).map(f => -f.amount)) - w.capitalIn) > .01
      || Math.abs(sum(w.flows.filter(f => f.amount > 0).map(f => f.amount)) - w.capitalOut) > .01) {
      return fail('The dated contributions and withdrawals do not reconcile to the record totals.', r.label);
    }
  }
  const from = start ?? records.map(r => r.window.openDate).sort()[0];
  if (!(from < end)) return fail('The record spans no investment period.');
  const maps = records.map(r => {
    const w = r.window, marks = new Map<string, number>();
    for (const m of [{ date: w.openDate, value: w.openValue }, ...(w.marks ?? []), { date: w.closeDate, value: w.closeValue }]) {
      if (marks.has(m.date) && Math.abs(marks.get(m.date)! - m.value) > .01) return null;
      marks.set(m.date, m.value);
    }
    // A weekend opening uses the last business close only when no money moved
    // in the intervening days. A missing weekday is not assumed unchanged.
    if (!marks.has(from) && w.openDate < from && weekendGap(w.openDate, from)
      && !w.flows.some(f => f.date <= from)) marks.set(from, w.openValue);
    return marks;
  });
  if (maps.some(m => m == null)) return fail('Two source valuations disagree on the same date.');
  const valueAt = (i: number, d: string): number | null => {
    const w = records[i].window, mark = maps[i]!.get(d);
    if (mark != null) return mark;
    if (records[i].closedOn && d >= records[i].closedOn!) return 0;
    if (w.openedInWindow && w.openValue === 0 && d < (w.flows.filter(f => f.amount < 0).map(f => f.date).sort()[0] ?? w.openDate)) return 0;
    return null;
  };
  const initial = records.map((_, i) => valueAt(i, from));
  if (initial.some(v => v == null)) return fail('An opening valuation for the whole row is missing. A later first value cannot stand in for a full period.');
  // End on the latest COMMON real valuation, at most a week before the asked-for
  // end. This handles unpublished latest closes without carrying stale NAVs.
  const candidates = [...new Set(maps.flatMap(m => [...m!.keys()]))].filter(d => d > from && d <= end && daysBetween(d, end) <= 7).sort().reverse();
  const to = candidates.find(d => records.every((_, i) => valueAt(i, d) != null));
  if (!to) return fail('A recent closing valuation on the same date is needed for every investment in this row.');
  // A known flow after the last valuation must not silently disappear.
  if (records.some(r => r.window.flows.some(f => f.date > to && f.date <= end))) return fail('Money moved after the last common valuation. A valuation after that flow is needed.');
  const flowDates = [...new Set(records.flatMap(r => r.window.flows.filter(f => f.date > from && f.date <= to && f.amount !== 0).map(f => f.date)))].sort();
  let opening = sum(initial as number[]), growth = 1, at = from, measuredFrom = from;
  const steps: TwrStep[] = [];
  for (const d of [...new Set([...flowDates, to])].sort()) {
    // Investor-view amounts are negative IN, positive OUT.
    const netIn = -sum(records.flatMap(r => r.window.flows.filter(f => f.date === d).map(f => f.amount)));
    const values = records.map((_, i) => valueAt(i, d));
    if (opening === 0 && steps.length === 0 && netIn > 0) {
      // First funding is starting capital. No return is assigned to the empty
      // period before it. A later valuation captures gains since that payment.
      measuredFrom = d;
      if (values.some(v => v == null)) { opening = netIn; at = d; continue; }
      const closing = sum(values as number[]), factor = closing / netIn;
      if (!Number.isFinite(factor) || factor < 0) return fail('The initial funding does not establish a valid investment value.');
      growth *= factor;
      steps.push({ from: d, to: d, opening: netIn, closing, netIn: 0, growth: factor });
      opening = closing; at = d; continue;
    }
    if (values.some(v => v == null)) {
      const i = values.findIndex(v => v == null);
      return fail(`A valuation on ${d}, when money moved, is needed. Sparse statement marks cannot establish this TWR.`, records[i].label);
    }
    const closing = sum(values as number[]);
    // Verified nil after a full exit is absence of invested capital, not a
    // fabricated flat mark. Preserve the earned return and stop its clock.
    if (opening === 0 && closing === 0 && netIn === 0) { at = d; continue; }
    if (!(opening > 0)) return fail('A return cannot be linked through a period with no positive invested capital.');
    const factor = (closing - netIn) / opening;
    if (!Number.isFinite(factor) || factor < 0) return fail(`The cash flow and valuation on ${d} imply an invalid investment value.`);
    growth *= factor;
    steps.push({ from: at, to: d, opening, closing, netIn, growth: factor });
    opening = closing; at = d;
  }
  const measuredTo = steps.at(-1)?.to ?? to;
  const days = daysBetween(measuredFrom, measuredTo);
  if (days <= 0 || !Number.isFinite(growth)) return fail('There is no completed investment period to measure.');
  const periodPct = (growth - 1) * 100;
  const annual = annualise && (days >= 365 || debt);
  const pct = annual ? (Math.pow(growth, 365 / days) - 1) * 100 : periodPct;
  if (!Number.isFinite(pct)) return fail('The linked growth does not yield a finite return.');
  return { pct, periodPct, annual, from: measuredFrom, to: measuredTo, records: records.length, assumed, gaps: [], steps };
}
