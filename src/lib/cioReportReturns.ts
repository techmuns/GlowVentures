import type { Portfolio, Position } from './types';
import type { AssumedReturnBook } from './assumedHoldingReturns';
import type { ReportPeriod } from './cioReportPeriod';
import { periodSelection, statementReturnInputs } from './availableCardReturns';
import { currentHoldings, dedupedPositions } from './analytics';
import { exitedRows } from './drilldown';
import { selectedSegmentReturns } from './selectedSegmentReturns';
import { reportToday } from './cioReportPeriod';

/** Reuse the Returns tab's dated-money calculation, bounded by the selected report end. */
export function cioReportReturns({ statement, current, period, assumptions, today = reportToday() }: {
  statement: Portfolio; current: readonly Position[]; period: ReportPeriod; assumptions: AssumedReturnBook | null; today?: string;
}) {
  const historical = period.to < today;
  const source = dedupedPositions(statement.positions);
  const held = historical ? currentHoldings(source) : current;
  const selection = periodSelection({ inputs: statementReturnInputs(statement), current: held,
    accounts: statement.accounts, end: period.to, assumptions, open: period.opening });
  // A historical report must never use a later value, later money movement or today's held-flat mark.
  const safeWindow = (w: typeof selection.windows[number]) => w.openDate <= period.to && w.closeDate <= period.to
    && w.flows.every(f => f.date <= period.to);
  selection.windows = selection.windows.filter(safeWindow);
  selection.assumedUnits = selection.assumedUnits?.filter(u => u.to <= period.to && (!u.from || u.from <= period.to)
    && (!u.window || safeWindow(u.window)) && (!historical || !u.held));
  const result = selectedSegmentReturns(held, exitedRows(source), statement.accounts, 'category', selection, () => null, currentHoldings(source));
  const measured = result.total.units.filter(u => !u.held);
  const starts = measured.flatMap(u => u.from ? [u.from] : []).sort();
  const ends = measured.map(u => u.to).sort();
  return { ...result, selection, from: starts[0] ?? null, to: ends.at(-1) ?? null,
    totalHoldings: held.length, coveredValue: historical ? result.closingValue : result.coveredValue,
    historical, records: result.total.units.length };
}
