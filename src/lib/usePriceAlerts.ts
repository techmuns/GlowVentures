/**
 * ── THE ALERT HOOKS — ONE READING OF THE STORE AND THE FEED, FOR TWO PAGES ──
 *
 * `priceAlerts.ts` is pure and decides everything; this file only assembles its
 * three inputs from React state — the saved levels, the live-overlaid book and
 * what the quote feed has done so far — the way `useStockExposure` assembles
 * `loadStockExposure`'s. Two components read alerts (the company page's alert
 * card and Morning CIO's All alerts tab, plus that tab's count badge), and each
 * assembling its own inputs would be three chances to disagree about whether
 * one alert has fired.
 */
import { useMemo, useSyncExternalStore } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { symbolFor } from "@/lib/quotes";
import { subscribeWatchlist, watchlistSnapshot, type Watchlist } from "@/lib/watchlist";
import { alertCounts, alertRows, priceNowFor, type AlertCounts, type AlertRow, type FeedState, type PriceNow } from "@/lib/priceAlerts";
import type { Position } from "@/lib/types";

/** The saved levels, re-rendering on every save — in this tab or another. */
export function useWatchlist(): Watchlist {
  return useSyncExternalStore(subscribeWatchlist, watchlistSnapshot, watchlistSnapshot);
}

function useFeedState(): FeedState {
  const { quotesStatus, pendingFor } = usePortfolio();
  return useMemo(() => ({ status: quotesStatus, pending: pendingFor, symbolOf: symbolFor }), [quotesStatus, pendingFor]);
}

/**
 * Every alert the reader has set, checked against the price now, in the order a
 * reader wants them — plus the counts the tab badge and the card's header print.
 */
export function usePriceAlerts(): { rows: AlertRow[]; counts: AlertCounts } {
  const { portfolio } = usePortfolio();
  const watchlist = useWatchlist();
  const feed = useFeedState();
  return useMemo(() => {
    const byKey = new Map<string, Position[]>();
    for (const p of portfolio?.positions ?? []) {
      const list = byKey.get(p.securityKey);
      if (list) list.push(p); else byKey.set(p.securityKey, [p]);
    }
    const rows = alertRows(watchlist, (k) => byKey.get(k) ?? [], feed);
    return { rows, counts: alertCounts(rows) };
  }, [portfolio, watchlist, feed]);
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
