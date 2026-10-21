/**
 * The whole-book NAV series over THIS book (`bookNav.ts`, Stage 10gd), struck
 * once: every input is committed data, and the statement book is the basis.
 * `PortfolioContext` hands its points to every page as `navHistory`, so the NAV
 * card and the drawdown read one series.
 */
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_REVIEW_FLOWS,
  BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION, BOOK_ACCOUNT_NAV_HISTORY,
  BOOK_ACCOUNT_RETURN_RECORDS, BOOK_NAV_COVERAGE,
} from "@/data/glowData";
import { navUnits, bookNavSeries, type NavUnit, type BookNavSeries } from "./bookNav";

export const BOOK_NAV_UNITS: NavUnit[] = navUnits({
  accounts: BOOK_ACCOUNTS,
  positions: BOOK_POSITIONS,
  moves: BOOK_CAPITAL_MOVES,
  commitments: BOOK_COMMITMENTS,
  reviewFlows: BOOK_REVIEW_FLOWS,
  tranches: BOOK_POSITION_TRANCHES,
  fromInception: BOOK_CAPITAL_FROM_INCEPTION,
  accountNav: BOOK_ACCOUNT_NAV_HISTORY,
  returnRecords: BOOK_ACCOUNT_RETURN_RECORDS,
  coverage: BOOK_NAV_COVERAGE,
});

export const WHOLE_BOOK_NAV: BookNavSeries = bookNavSeries(BOOK_NAV_UNITS);
