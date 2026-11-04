import type { Portfolio, Position } from './types';
import { currentHoldings, dedupedPositions, mandateLabel } from './analytics';
import { exitedRows } from './drilldown';
import { nothingToMeasure } from './returns';
import { accountInputs, periodStart, windowReturns, type AccountInput, type AccountWindow } from './periodReturns';
import { selectedSegmentReturns, type ReturnGap, type ReturnSelection } from './selectedSegmentReturns';
import { assumedHoldingReturns, type AssumedReturnBook } from './assumedHoldingReturns';
import { ytdBook, ytdSelection } from './ytdAvailable';
import { heldAtLastValue } from './periodRules';
import {
  BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNT_CASH_FLOWS, BOOK_NAV_COVERAGE,
  BOOK_UNDATED_CAPITAL, BOOK_CAPITAL_FROM_INCEPTION, BOOK_UNIT_WINDOWS,
} from '@/data/glowData';
import type { UnitWindow } from './types';

/** Shared selected records, including the same fallback gates as attribution. */
export function statementReturnInputs(statement: Portfolio, unitWindows: Readonly<Record<string, UnitWindow>> = BOOK_UNIT_WINDOWS): AccountInput[] {
  return accountInputs({ accounts: statement.accounts, positions: statement.positions,
    returnRecords: statement.accountReturnRecords, navHistory: BOOK_ACCOUNT_NAV_HISTORY,
    cashFlows: BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: BOOK_NAV_COVERAGE.covered,
    undated: BOOK_UNDATED_CAPITAL, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    labelOf: a => mandateLabel(a) || a.provider,
  }).map(i => ({ ...i, outside: nothingToMeasure(statement, statement.accounts.find(a => a.accountId === i.accountId)!) }))
    .map(i => {
      /**
       * NO MONEY MOVED BETWEEN THESE STATEMENTS (Stage 10kz). An account whose
       * verified record is refused, but whose consecutive statements hold
       * exactly the same units (`BOOK_UNIT_WINDOWS`), is measured from the
       * first of them: its value moved by the market alone, with no dated flow.
       */
      const w = unitWindows[i.accountId];
      if (!w || !i.flowsUnknown || i.outside) return i;
      const dates = w.valuations.map(v => v.date);
      return { ...i, valuations: w.valuations.map(({ date, value }) => ({ date, value })), flows: [], undated: [],
        knownFrom: dates[0], knownTo: dates.at(-1)!, flowsUnknown: null, unitWindow: w.evidence };
    });
}

/** The available subset, plus explicit user-authorised holding assumptions where supplied. */
export function availableCardReturns(statement: Portfolio, display: readonly Position[], inputs: AccountInput[], today: Date, assumptions?: AssumedReturnBook) {
  const current = currentHoldings(display), recorded = dedupedPositions(statement.positions);
  const calculationCurrent = currentHoldings(recorded), exited = exitedRows(recorded);
  const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const accountOf = new Map(statement.accounts.map(a => [a.accountId, a]));
  const isPublic = (p: Position) => p.marketSide !== 'private';
  const make = (selection: ReturnSelection, availableHistory = false, holdLast = false) => {
    // A selection that brings its own holding records (YTD's) keeps them.
    if (!selection.inception && assumptions && !selection.assumedUnits) {
      const extra = assumedHoldingReturns(current, statement.accounts, availableHistory ? null : selection.start, end, assumptions);
      selection = { ...selection, assumedUnits: extra.units, assumptionGaps: extra.gaps };
    }
    /**
     * HELD AT ITS LAST VALUE (the family, 4 Nov 2026). A public holding no
     * record measures this period is carried flat from its latest valuation to
     * the end: in the base at 0%, and named. One still waiting on its price
     * history is not held — it is loading, and says so.
     */
    if (holdLast && !selection.inception) {
      const whole = new Set(selection.windows.map(w => w.accountId));
      const measured = new Set((selection.assumedUnits ?? []).flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
      const pending = new Set((selection.assumptionGaps ?? []).filter(g => /still loading/i.test(g.reason)).map(g => `${g.accountId}|${g.securityKey}`));
      const held = current.filter(p => isPublic(p) && !whole.has(p.accountId) && !measured.has(`${p.accountId}|${p.securityKey}`) && !pending.has(`${p.accountId}|${p.securityKey}`))
        .flatMap(p => { const a = accountOf.get(p.accountId); const g = selection.assumptionGaps?.find(x => x.accountId === p.accountId && x.securityKey === p.securityKey)
          ?? selection.excluded.find(x => x.accountId === p.accountId);
          const u = a ? heldAtLastValue(p, a, selection.start, end, g?.reason ?? 'No second value on record this period.') : null; return u ? [u] : []; });
      const heldKeys = new Set(held.map(u => u.key));
      selection = { ...selection, assumedUnits: [...(selection.assumedUnits ?? []), ...held],
        assumptionGaps: (selection.assumptionGaps ?? []).filter(g => !heldKeys.has(`${g.accountId}|${g.securityKey}`)) };
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
    // Where each part of the money starts, by the value it closes at. Money
    // first put in during the period (it opens at nil) covers the whole of it;
    // the period is full only where every part does.
    const opens = new Map<string, { close: number; opened: boolean }>();
    for (const u of result.total.units) {
      const opened = !!u.window?.openedInWindow && u.window.openValue === 0, key = opened ? 'opened' : u.from;
      if (!key) continue;
      const s = opens.get(key) ?? { close: 0, opened };
      s.close += u.close; opens.set(key, s);
    }
    const starts = [...opens].map(([key, s]) => ({ date: s.opened ? null : key, close: s.close }))
      .sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''));
    const fullPeriod = !!selection.start && starts.length > 0 && starts.every(s => s.date == null || s.date <= selection.start!);
    /**
     * COVERAGE BY VALUE, OF THE PUBLIC INVESTMENTS (the family, 4 Nov 2026):
     * a holding count read as broken. Private investments are their own line;
     * what is held at its last value is said apart from what is measured, so
     * the caption never widens the figure it describes.
     */
    const coveredKeys = new Set(result.total.units.flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
    const heldKeys = new Set(result.total.units.filter(u => u.held).flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
    const publicRows = current.filter(isPublic), valueOf = (ps: Position[]) => ps.reduce((t, p) => t + p.marketValue, 0);
    const coverage = { publicValue: valueOf(publicRows),
      measuredValue: valueOf(publicRows.filter(p => coveredKeys.has(`${p.accountId}|${p.securityKey}`) && !heldKeys.has(`${p.accountId}|${p.securityKey}`))),
      heldValue: valueOf(publicRows.filter(p => heldKeys.has(`${p.accountId}|${p.securityKey}`))),
      heldUnits: result.total.units.filter(u => u.held),
      privateValue: valueOf(current.filter(p => !isPublic(p))) };
    return { ...result, selection, coveredAccounts, totalAccounts, totalHoldings: current.length,
      from: dates[0] ?? null, to: closes.at(-1) ?? null, notes, starts, fullPeriod, coverage };
  };
  const gain = make({ inception: true, type: 'absolute', start: null, end: null, windows: [], inceptionRows: [], excluded: [] });
  /**
   * THE THREE RETURN CARDS, ONE RULE (Stage 10kz; the family, 4 Nov 2026): each
   * account and holding from its first value on record in the period — the
   * Monitor's own `ytdBook` with the period's open — and every public holding
   * no record measures held at its last value. Financial year from 31 March,
   * calendar year from 31 December, available history from each first record.
   */
  const period = (open: string | null | undefined) => {
    const book = ytdBook({ inputs, held: current, accounts: statement.accounts, end, assumptions: assumptions ?? null, money: String, open });
    const picked = ytdSelection(book, inputs, current);
    const first = [...picked.windows.map(w => w.openDate), ...(picked.assumedUnits ?? []).flatMap(u => u.from ? [u.from] : [])].sort()[0] ?? null;
    return make({ inception: false, type: 'xirr', start: book.yearOpen ?? first, end, inceptionRows: [], ...picked }, false, true);
  };
  const fytd = period(periodStart('fytd', end)!);
  const ytd = period(undefined);
  // XIRR from a year; under a year the absolute return, never a rate per year (Stage 10hk).
  const history = period(null);
  return { gain, history, fytd, ytd };
}

export type AvailableCardReturn = ReturnType<typeof availableCardReturns>['gain'];
