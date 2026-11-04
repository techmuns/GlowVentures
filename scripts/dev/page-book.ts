/**
 * THE PAGE'S OWN ROWS ON A CHECK RUN (Stage 10la), for the checks that re-derive
 * Morning CIO's return cards: the statement book through the same overlays
 * `PortfolioContext` applies with no quote feed (the corporate-action layer, the
 * depository's funds and shares, the published NAVs), and the assumption book
 * the page holds when every price history fails, as it does where `/api` is refused.
 *
 * Bundled by the checks with esbuild; it imports the helpers under test, so a
 * check built on it strikes the page against the same rows, never a second set.
 */
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from '../../src/data/glowData';
import { currentHoldings, dedupedPositions } from '../../src/lib/analytics';
import { applyFundNavs, depositoryFundHoldings, unpricedStatementUnits } from '../../src/lib/fundNavs';
import { applyCorporateActionQuotes } from '../../src/lib/corporateActions';
import type { ActionFeed } from '../../shared/corporateActions.mjs';
import { depositoryShareHoldings } from '../../src/lib/depositoryShares';
import { applyQuotes } from '../../src/lib/quotes';
import { marketInstruments } from '../../src/lib/useMarketReturns';
import { assumedHoldingBook } from '../../src/lib/assumedHoldingBook';
import type { Position } from '../../src/lib/types';

/** `consolidated` with no quote feed: what the page's cards and tables are struck over. */
export function pageConsolidated(actions: ActionFeed | null): Position[] {
  const layer = applyCorporateActionQuotes(BOOK_POSITIONS as Position[], BOOK_ACCOUNTS, null, actions);
  return dedupedPositions(applyFundNavs([...layer.positions, ...applyQuotes([...depositoryFundHoldings(), ...unpricedStatementUnits()], null),
    ...depositoryShareHoldings(null, actions, undefined, BOOK_ACCOUNTS)]));
}

/** The assumption book with every price history refused, as the page holds it where `/api` does not answer. */
export function failedHistoryBook(consolidated: readonly Position[], actions: ActionFeed | null) {
  const instruments = marketInstruments(currentHoldings(consolidated));
  const histories = Object.fromEntries([...instruments.values()].map((i) => [i.key, { ok: false as const, reason: 'The history service could not be reached. Retry to load it again.' }]));
  return assumedHoldingBook({ actions, instruments, histories });
}
