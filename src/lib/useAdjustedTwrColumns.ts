import { useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { isDebtHolding } from './analytics';
import { periodSelection, statementReturnInputs } from './availableCardReturns';
import { assumedHoldingBook } from './assumedHoldingBook';
import { selectedSegmentReturns, type SelectedLine } from './selectedSegmentReturns';
import { mergeTwrRows } from './twrRows';
import type { SegmentAxis } from './segmentReturns';
import type { Position } from './types';
import { useMarketHistories } from './useMarketReturns';
import { acquiredAfterTwr, exitedTwrUnit, fullyExitedTwr } from './exitedTwr';
import { adjustedTwr, missingTwr, TWR_COLUMNS, twrPeriodStart, type TwrColumn, type TwrResult } from './adjustedTwr';

type Model = ReturnType<typeof selectedSegmentReturns>;
export type TwrValues = Record<TwrColumn, TwrResult>;
function indexRows(model: Model | null) {
  const rows = new Map<string, SelectedLine>();
  const visit = (r: SelectedLine, key: string) => {
    rows.set(key, r);
    for (const c of r.children) visit(c, `${key}::${c.key}`);
  };
  if (model) { visit(model.total, 'total'); for (const r of model.rows) visit(r, r.key); }
  return rows;
}

/** Four independent calendar/inception columns, on the same rows and source
 * selection as attribution. The main period and return-type pickers do not
 * change these fixed horizons. Only the selected ending date is shared.
 */
export function useAdjustedTwrColumns({ model, current, exited, calculationCurrent, axis, end }: {
  model: Model | null; current: readonly Position[]; exited: readonly Position[]; calculationCurrent: readonly Position[];
  axis: SegmentAxis; end: string | null;
}) {
  const { statementPortfolio: statement, corporateActions } = usePortfolio();
  const sold = useMemo(() => exited.filter(fullyExitedTwr), [exited]);
  const universe = useMemo(() => {
    const held = new Set(current.map(p => `${p.accountId}|${p.securityKey}`));
    return [...current, ...sold.filter(p => !held.has(`${p.accountId}|${p.securityKey}`))];
  }, [current, sold]);
  // Sold holdings need their histories too; the shared loader deduplicates
  // these with the active-holdings feed used by the rest of the page.
  const history = useMarketHistories(universe);
  const inputs = useMemo(() => statement ? statementReturnInputs(statement) : [], [statement]);
  const assumptions = useMemo(() => assumedHoldingBook({ actions: corporateActions, instruments: history.instruments, histories: history.histories }),
    [corporateActions, history.instruments, history.histories]);
  const scope = useMemo(() => {
    const key = (p: Position) => `${p.accountId}|${p.securityKey}`;
    const accounts = new Map(statement?.accounts.map(a => [a.accountId, a]));
    const outside = new Set(universe.filter(p => end && acquiredAfterTwr(p, accounts.get(p.accountId), end)).map(key));
    const applicable = universe.filter(p => !outside.has(key(p)));
    const futureAccounts = new Set(universe.filter(p => outside.has(key(p)) && !applicable.some(q => q.accountId === p.accountId)).map(p => p.accountId));
    return { applicable, active: current.filter(p => !outside.has(key(p))), sold: sold.filter(p => !outside.has(key(p))), outside, futureAccounts };
  }, [statement, universe, current, sold, end]);
  const sources = useMemo(() => TWR_COLUMNS.map(col => {
    if (!statement || !end || axis === 'sector') return { model: null, rows: new Map<string, SelectedLine>() };
    const start = twrPeriodStart(col.period, end);
    const { applicable, active, outside, futureAccounts } = scope;
    const selection = periodSelection({ inputs, current: applicable, accounts: statement.accounts, end, assumptions, open: start });
    selection.excluded = selection.excluded.filter(g => g.securityKey ? !outside.has(`${g.accountId}|${g.securityKey}`) : !futureAccounts.has(g.accountId));
    const measured = new Set(selection.windows.map(w => w.accountId));
    const held = new Set(current.map(p => `${p.accountId}|${p.securityKey}`));
    const eligible: Position[] = [];
    for (const p of scope.sold) {
      if (held.has(`${p.accountId}|${p.securityKey}`)) continue;
      const found = exitedTwrUnit(p, statement.accounts.find(a => a.accountId === p.accountId), start, end, assumptions);
      if ('outside' in found) continue;
      eligible.push(p);
      if (measured.has(p.accountId)) continue; // already inside its whole account's valuation
      if ('unit' in found) selection.assumedUnits = [...(selection.assumedUnits ?? []), found.unit];
      else if ('reason' in found) selection.excluded.push({ accountId: p.accountId, securityKey: p.securityKey, label: p.security, reason: found.reason, plainReason: true });
    }
    const result = selectedSegmentReturns([...active, ...eligible], [], statement.accounts, axis, selection, () => null, calculationCurrent);
    return { model: result, rows: indexRows(result) };
  }), [statement, end, axis, inputs, current, scope, calculationCurrent, assumptions]);
  const displayed = useMemo(() => {
    if (!model) return null;
    return { ...model, rows: mergeTwrRows(model.rows, sources.map(source => source.model?.rows ?? [])) };
  }, [model, sources]);
  const currentRows = useMemo(() => new Map([...indexRows(displayed)].map(([key, row]) => [row, key])), [displayed]);
  const calculate = useMemo(() => {
    const cache = new Map<string, TwrValues>();
    const inputOf = new Map(inputs.map(i => [i.accountId, i]));
    return (key: string): TwrValues => {
      const kept = cache.get(key); if (kept) return kept;
      const result = Object.fromEntries(TWR_COLUMNS.map((col, i) => {
        const row = sources[i].rows.get(key);
        if (!row || !end) return [col.key, missingTwr([{ label: 'This row', reason: 'No complete record is available for this row and period.' }])];
        const gaps = row.missing.map(g => ({ label: g.label, reason: g.reason }));
        for (const u of row.units) {
          if (u.held) gaps.push({ label: u.label, reason: `Held at its last value: a verified valuation record is needed for TWR. ${u.held.reason}` });
          else if (!u.window) gaps.push({ label: u.label, reason: 'A dated valuation series and complete cash-flow record are needed for TWR.' });
          else if (u.key === u.accountId && inputOf.get(u.accountId)?.flows.some(f => f.date > u.window!.closeDate && f.date <= end)) {
            gaps.push({ label: u.label, reason: 'The capital record dates money after the last valuation. A later valuation is needed.' });
          }
        }
        const records = row.units.filter(u => !u.held && u.window).map(u => ({
          key: u.key, label: u.label, window: u.window!, assumed: !!u.assumption, closedOn: u.closedOn,
          // A first available statement is not inception. Whole accounts need
          // an unbounded capital record and an actual nil opening; individual
          // holdings need the reconciled purchase ledger's nil opening.
          inceptionKnown: u.window!.openValue === 0 && u.window!.openedInWindow
            && (u.key === u.accountId ? inputOf.get(u.accountId)?.knownFrom === null : u.basis === 'broker-trades'),
        }));
        const investedPositions = row.units.flatMap(u => u.positions);
        return [col.key, adjustedTwr(records, { start: twrPeriodStart(col.period, end), end, annualise: col.period === 'inception',
          debt: investedPositions.length > 0 && investedPositions.every(isDebtHolding), gaps })];
      })) as TwrValues;
      cache.set(key, result); return result;
    };
  }, [sources, inputs, end]);
  return { model: displayed, of: (row: SelectedLine) => calculate(currentRows.get(row) ?? '__missing'),
    retry: Object.values(history.histories).some(h => h && !h.ok) ? history.retry : undefined,
    pending: [...history.instruments.values()].filter(i => !history.histories[i.key]).length };
}
