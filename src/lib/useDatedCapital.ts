/**
 * The dated-capital index (`datedCapital.ts`), built once per book and read by
 * every surface that can put a money-weighted return on a row that IS an
 * account — the Portfolio Monitor's rows and the lines they open into, and the
 * company page's per-account rows.
 *
 * ONE HOOK, so two pages cannot build it over different books. The rates are
 * struck on the STATEMENT book, exactly as the Transactions card strikes the
 * same accounts; `universe` is what "every holding of an account" is measured
 * against, which is the LIVE book's current holdings — the positions those
 * pages draw their rows from.
 */
import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION, BOOK_REVIEW_FLOWS } from "@/data/glowData";
import { buildDatedCapital, type DatedCapital } from "./datedCapital";
import { currentHoldings } from "./analytics";
import type { Position } from "./types";

export function useDatedCapital(): { dated: DatedCapital | null; universe: Position[] } {
  const { portfolio, statementPortfolio } = usePortfolio();
  const dated = useMemo(() => statementPortfolio ? buildDatedCapital({
    moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS,
    accounts: statementPortfolio.accounts, positions: statementPortfolio.positions,
    tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    reviewFlows: BOOK_REVIEW_FLOWS,
  }) : null, [statementPortfolio]);
  const universe = useMemo(() => currentHoldings(portfolio?.positions ?? []), [portfolio?.positions]);
  return { dated, universe };
}
