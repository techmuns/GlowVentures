/**
 * ── THE RETURNS TAB'S ONE SELECTION (Stage 10lg) ────────────────────────────
 *
 *   *"Can you please sync all … FYTD +13.02%, Market performance +29.09%, YTD
 *    different, 1 Y different and so on, now as per our work it should all
 *    follow the logics and be complete for all holdings"* — the family, 5 Nov
 *    2026, on the Returns tab under the return cards.
 *
 * Every period the tab offers reads the cards' rule (`periodSelection`, Stage
 * 10la): each account and holding from its first value on record in the period,
 * every public holding no record measures held at its last value, every part
 * carried to the end. The period's open is its own — FYTD 31 Mar, YTD 31 Dec,
 * MTD, 1Y, 2Y, 3Y and a custom date alike. Since investment is the Gain / Loss
 * card's selection for the absolute return (purchase cost, else first value,
 * else held at value) and the available-history card's for XIRR. The attribution
 * table, the capital bridge, Market performance and the Benchmarks subtab all
 * strike this one selection, so no two figures for one period disagree.
 */
import { useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { currentHoldings, dedupedPositions } from './analytics';
import { exitedRows } from './drilldown';
import { useMarketHistories } from './useMarketReturns';
import { assumedHoldingBook } from './assumedHoldingBook';
import { periodSelection, sinceInvestmentSelection, statementReturnInputs } from './availableCardReturns';
import { selectedSegmentReturns, type ReturnSelection } from './selectedSegmentReturns';
import type { AssumedReturnBook } from './assumedHoldingReturns';
import type { PeriodKey, ReturnType } from './periodReturns';
import type { Portfolio, Position } from './types';

export function returnSelectionFor({ period, start, end, type, statement, current, assumptions }: {
  period: PeriodKey; start: string | null; end: string | null; type: ReturnType;
  statement: Portfolio; current: readonly Position[]; assumptions: AssumedReturnBook | null;
}): ReturnSelection | null {
  if (!end) return null;
  const inputs = statementReturnInputs(statement);
  if (period === 'inception') {
    const history = periodSelection({ inputs, current, accounts: statement.accounts, end, assumptions, open: null });
    if (type !== 'absolute') return { ...history, type };
    const recorded = dedupedPositions(statement.positions), calculation = currentHoldings(recorded), exited = exitedRows(recorded);
    const pool = (s: ReturnSelection) => selectedSegmentReturns(current, exited, statement.accounts, 'category', s, () => null, calculation).total;
    const base = pool({ inception: true, type: 'absolute', start: null, end: null, windows: [], inceptionRows: [], excluded: [] });
    return sinceInvestmentSelection({ current, accounts: statement.accounts, end, base, history: pool(history).units }).selection;
  }
  if (!start || !(start < end)) return null;
  return { ...periodSelection({ inputs, current, accounts: statement.accounts, end, assumptions, open: start }), type, start, end };
}

/** The selection for the period picked, on the page's own rows, histories and action records. */
export function useReturnSelection({ period, start, end, type }: { period: PeriodKey; start: string | null; end: string | null; type: ReturnType }) {
  const { statementPortfolio, consolidated, corporateActions } = usePortfolio();
  const current = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const feed = useMarketHistories(current);
  const assumptions = useMemo(() => assumedHoldingBook({ actions: corporateActions, instruments: feed.instruments, histories: feed.histories }),
    [corporateActions, feed.instruments, feed.histories]);
  const selection = useMemo(() => statementPortfolio && period !== 'invested-year'
    ? returnSelectionFor({ period, start, end, type, statement: statementPortfolio, current, assumptions }) : null,
  [period, start, end, type, statementPortfolio, current, assumptions]);
  return { selection, current, feed };
}
