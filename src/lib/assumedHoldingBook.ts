import { BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, BOOK_HOLDING_TRADES, BOOK_CAPITAL_MOVES, BOOK_SHARE_MOVEMENTS } from '@/data/glowData';
import type { AssumedReturnBook } from './assumedHoldingReturns';

/** Read-only source evidence. Calculated assumptions never enter the statement book. */
export const assumedHoldingBook = (feed: Pick<AssumedReturnBook, 'actions' | 'instruments' | 'histories'>): AssumedReturnBook => ({
  positions: BOOK_POSITIONS, unvalued: BOOK_UNVALUED_HOLDINGS, trades: BOOK_HOLDING_TRADES,
  moves: BOOK_CAPITAL_MOVES, movements: BOOK_SHARE_MOVEMENTS, ...feed,
});
