import type { Portfolio, Position } from './types';
import { currentHoldings, dedupedPositions, mandateLabel } from './analytics';
import { exitedRows } from './drilldown';
import { nothingToMeasure } from './returns';
import { accountInputs, periodStart, windowReturns, type AccountInput, type AccountWindow } from './periodReturns';
import { selectedSegmentReturns, type ReturnGap, type ReturnSelection } from './selectedSegmentReturns';
import { assumedHoldingReturns, type AssumedReturnBook } from './assumedHoldingReturns';
import {
  BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNT_CASH_FLOWS, BOOK_NAV_COVERAGE,
  BOOK_UNDATED_CAPITAL, BOOK_CAPITAL_FROM_INCEPTION,
} from '@/data/glowData';

/** Shared selected records, including the same fallback gates as attribution. */
export function statementReturnInputs(statement: Portfolio): AccountInput[] {
  return accountInputs({ accounts: statement.accounts, positions: statement.positions,
    returnRecords: statement.accountReturnRecords, navHistory: BOOK_ACCOUNT_NAV_HISTORY,
    cashFlows: BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: BOOK_NAV_COVERAGE.covered,
    undated: BOOK_UNDATED_CAPITAL, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    labelOf: a => mandateLabel(a) || a.provider,
  }).map(i => ({ ...i, outside: nothingToMeasure(statement, statement.accounts.find(a => a.accountId === i.accountId)!) }));
}

/** The available subset, plus explicit user-authorised holding assumptions where supplied. */
export function availableCardReturns(statement: Portfolio, display: readonly Position[], inputs: AccountInput[], today: Date, assumptions?: AssumedReturnBook) {
  const current = currentHoldings(display), recorded = dedupedPositions(statement.positions);
  const calculationCurrent = currentHoldings(recorded), exited = exitedRows(recorded);
  const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const make = (selection: ReturnSelection, availableHistory = false) => {
    if (!selection.inception && assumptions) {
      const extra = assumedHoldingReturns(current, statement.accounts, availableHistory ? null : selection.start, end, assumptions);
      selection = { ...selection, assumedUnits: extra.units, assumptionGaps: extra.gaps };
    }
    const result = selectedSegmentReturns(current, exited, statement.accounts, 'category', selection, () => null, calculationCurrent);
    const coveredAccounts = new Set(result.total.units.map(u => u.accountId)).size;
    const totalAccounts = new Set([...result.total.units, ...result.total.missing].map(u => u.accountId)).size;
    const dates = result.total.units.flatMap(u => u.from ? [u.from] : []).sort();
    const closes = result.total.units.map(u => u.to).filter(Boolean).sort();
    const included = new Set(result.total.units.map(u => u.accountId));
    const notes = statement.accounts.flatMap(a => {
      const c = statement.accountReturnRecords?.[a.accountId];
      return !selection.inception && included.has(a.accountId) && c?.record && c.gap ? [{ label: `${a.owner} · ${a.provider} · account ${a.accountNo}`,
        reason: `${c.latestValuationDate ?? a.asOf}: ${c.gap}` }] : [];
    });
    return { ...result, selection, coveredAccounts, totalAccounts, totalHoldings: current.length,
      from: dates[0] ?? null, to: closes.at(-1) ?? null, notes };
  };
  const gain = make({ inception: true, type: 'absolute', start: null, end: null, windows: [], inceptionRows: [], excluded: [] });
  const period = (key: 'fytd' | 'ytd') => {
    const start = periodStart(key, end)!;
    const w = windowReturns(inputs, start, end);
    return make({ inception: false, type: 'xirr', periodXirr: true, start, end, windows: w.included, inceptionRows: [], excluded: w.excluded, outside: w.outside });
  };
  // Latest usable history may begin on different dates for different accounts.
  // Measure each from its own verified opening, then pool only those windows.
  const windows: AccountWindow[] = [], excluded: ReturnGap[] = [], outside: ReturnGap[] = [];
  for (const input of inputs) {
    const first = [...input.valuations.map(v => v.date), ...input.flows.filter(f => f.amount < 0).map(f => f.date)].sort()[0];
    const beforeFirst = first ? new Date(Date.parse(first) - 864e5).toISOString().slice(0, 10) : end;
    const start = input.knownFrom ?? beforeFirst;
    const w = windowReturns([input], start, end);
    windows.push(...w.included); excluded.push(...w.excluded); outside.push(...w.outside);
  }
  const start = windows.map(w => w.openDate).sort()[0] ?? null;
  // The headline cards read XIRR over the period, not per year (Stage 10gu).
  const history = make({ inception: false, type: 'xirr', periodXirr: true, start, end, windows, inceptionRows: [], excluded, outside }, true);
  return { gain, history, fytd: period('fytd'), ytd: period('ytd') };
}

export type AvailableCardReturn = ReturnType<typeof availableCardReturns>['gain'];
