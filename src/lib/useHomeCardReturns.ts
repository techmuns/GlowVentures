import { useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import type { Position } from './types';
import { currentHoldings } from './analytics';
import { useMarketHistories } from './useMarketReturns';
import { assumedHoldingBook } from './assumedHoldingBook';
import { availableCardReturns, statementReturnInputs } from './availableCardReturns';

const NONE: Position[] = [];

/**
 * Morning CIO's return cards, for Home's Year to date and Since inception tiles:
 * the same function on the same inputs (statement book, consolidated holdings,
 * dated return records, assumed-ownership book), so the two pages never disagree.
 * Nothing is computed or fetched until a tile needs it.
 */
export function useHomeCardReturns(enabled: boolean) {
  const { portfolio, statementPortfolio, consolidated, corporateActions } = usePortfolio();
  const today = useMemo(() => new Date(), []);
  const holdings = useMemo(() => enabled ? currentHoldings(consolidated) : NONE, [enabled, consolidated]);
  const feed = useMarketHistories(holdings);
  const assumptions = useMemo(() => assumedHoldingBook({ actions: corporateActions, instruments: feed.instruments, histories: feed.histories }),
    [corporateActions, feed.instruments, feed.histories]);
  return useMemo(() => {
    const statement = statementPortfolio ?? portfolio;
    if (!enabled || !statement) return null;
    return availableCardReturns(statement, consolidated, statementReturnInputs(statement), today, assumptions);
  }, [enabled, statementPortfolio, portfolio, consolidated, today, assumptions]);
}
