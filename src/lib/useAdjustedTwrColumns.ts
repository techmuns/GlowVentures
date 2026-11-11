import { useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { allDebt } from './analytics';
import { periodSelection, statementReturnInputs } from './availableCardReturns';
import { assumedHoldingBook } from './assumedHoldingBook';
import { selectedSegmentReturns, type SelectedLine } from './selectedSegmentReturns';
import type { SegmentAxis } from './segmentReturns';
import type { Position } from './types';
import type { useMarketHistories } from './useMarketReturns';
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
export function useAdjustedTwrColumns({ model, current, exited, calculationCurrent, axis, end, feed }: {
  model: Model | null; current: readonly Position[]; exited: readonly Position[]; calculationCurrent: readonly Position[];
  axis: SegmentAxis; end: string | null; feed: ReturnType<typeof useMarketHistories>;
}) {
  const { statementPortfolio: statement, corporateActions } = usePortfolio();
  const inputs = useMemo(() => statement ? statementReturnInputs(statement) : [], [statement]);
  const assumptions = useMemo(() => assumedHoldingBook({ actions: corporateActions, instruments: feed.instruments, histories: feed.histories }),
    [corporateActions, feed.instruments, feed.histories]);
  const sources = useMemo(() => TWR_COLUMNS.map(col => {
    if (!statement || !end || axis === 'sector') return new Map<string, SelectedLine>();
    const selection = periodSelection({ inputs, current, accounts: statement.accounts, end, assumptions, open: twrPeriodStart(col.period, end) });
    return indexRows(selectedSegmentReturns(current, exited, statement.accounts, axis, selection, () => null, calculationCurrent));
  }), [statement, end, axis, inputs, current, exited, calculationCurrent, assumptions]);
  const currentRows = useMemo(() => new Map([...indexRows(model)].map(([key, row]) => [row, key])), [model]);
  const calculate = useMemo(() => {
    const cache = new Map<string, TwrValues>();
    const inputOf = new Map(inputs.map(i => [i.accountId, i]));
    return (key: string): TwrValues => {
      const kept = cache.get(key); if (kept) return kept;
      const result = Object.fromEntries(TWR_COLUMNS.map((col, i) => {
        const row = sources[i].get(key);
        if (!row || !end) return [col.key, missingTwr([{ label: 'This row', reason: 'No complete record is available for this row and period.' }])];
        const gaps = row.missing.map(g => ({ label: g.label, reason: g.reason }));
        for (const u of row.units) {
          if (u.held) gaps.push({ label: u.label, reason: 'Held at its last value: a second verified valuation is needed for TWR.' });
          else if (!u.window) gaps.push({ label: u.label, reason: 'A dated valuation series and complete cash-flow record are needed for TWR.' });
          else if (u.key === u.accountId && inputOf.get(u.accountId)?.flows.some(f => f.date > u.window!.closeDate && f.date <= end)) {
            gaps.push({ label: u.label, reason: 'The capital record dates money after the last valuation. A later valuation is needed.' });
          }
        }
        const records = row.units.filter(u => !u.held && u.window).map(u => ({
          key: u.key, label: u.label, window: u.window!, assumed: !!u.assumption,
          // A first available statement is not inception. Whole accounts need
          // an unbounded capital record and an actual nil opening; individual
          // holdings need the reconciled purchase ledger's nil opening.
          inceptionKnown: u.window!.openValue === 0 && u.window!.openedInWindow
            && (u.key === u.accountId ? inputOf.get(u.accountId)?.knownFrom === null : u.basis === 'broker-trades'),
        }));
        return [col.key, adjustedTwr(records, { start: twrPeriodStart(col.period, end), end, annualise: col.period === 'inception',
          debt: allDebt(row.units.flatMap(u => u.positions)), gaps })];
      })) as TwrValues;
      cache.set(key, result); return result;
    };
  }, [sources, inputs, end]);
  return (row: SelectedLine) => calculate(currentRows.get(row) ?? '__missing');
}
