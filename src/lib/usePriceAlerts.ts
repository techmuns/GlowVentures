/**
 * ── THE ALERT HOOKS — ONE READING OF THE STORE AND THE FEED ─────────────────
 *
 * `priceAlerts.ts` is pure and decides everything; this file only assembles its
 * inputs from React state — the saved levels, the live-overlaid book and what
 * the quote feed has done so far — the way `useStockExposure` assembles
 * `loadStockExposure`'s. The company page's alert card reads them. Morning
 * CIO's All alerts tab and its badge read them too until Stage 10mk removed it.
 */
import { useMemo, useSyncExternalStore } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { symbolFor } from "@/lib/quotes";
import { subscribeWatchlist, watchlistSnapshot, type Watchlist } from "@/lib/watchlist";
import { priceNowFor, type FeedState, type PriceNow } from "@/lib/priceAlerts";

/** The saved levels, re-rendering on every save — in this tab or another. */
export function useWatchlist(): Watchlist {
  return useSyncExternalStore(subscribeWatchlist, watchlistSnapshot, watchlistSnapshot);
}

function useFeedState(): FeedState {
  const { quotesStatus, pendingFor } = usePortfolio();
  return useMemo(() => ({ status: quotesStatus, pending: pendingFor, symbolOf: symbolFor }), [quotesStatus, pendingFor]);
}

/** The price one holding's alerts are checked against, or why there is none. */
export function usePriceNow(securityKey: string): PriceNow {
  const { portfolio } = usePortfolio();
  const feed = useFeedState();
  return useMemo(
    () => priceNowFor((portfolio?.positions ?? []).filter((p) => p.securityKey === securityKey), feed),
    [portfolio, securityKey, feed],
  );
}
