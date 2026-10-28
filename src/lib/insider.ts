// Client helper for the insider-trades feed. Reuses the NSE-symbol resolution
// from ./announcements (topHoldingsForAnnouncements), then calls the server-side
// proxy at /api/insider (a Cloudflare Pages Function holding MUNS_TOKEN).
import type { AnnHolding } from "./announcements";
import { fetchFeedChunked } from "./feedFetch";

export type InsiderTrade = {
  company: string;
  insider: string;
  category: string;
  securityType: string;
  transaction: string;      // Acquisition | Disposal | Pledge | Revoke
  shares: number;
  tradePct: string;
  value: number;            // ₹, may be 0 for non-market transactions
  postShares: number;
  postPct: string;
  mode: string;             // Market Sale, Gift, ESOP, …
  fromDate: string;
  toDate: string;
  broadcastDate: string;
  source: string;
  holding: string;
  key: string;
  symbol: string;
};

export type InsiderResponse = {
  ok: boolean;
  reason?: "not_configured" | "auth" | "error" | "method" | "upstream_error";
  status?: number;
  generatedAt?: string;
  count?: number;
  items?: InsiderTrade[];
  symbolsSearched?: number;
  symbolsWithData?: number;
};

const _cache = new Map<string, Promise<InsiderResponse>>();

export function getHoldingsInsider(holdings: AnnHolding[], force = false): Promise<InsiderResponse> {
  // KEYED BY THE UTC DAY, as `/api/insider` keys its own cache, so a dashboard
  // left open into a new day asks again rather than reusing yesterday's
  // disclosures — the stock page's research card asks ahead since Stage 10im.
  const day = new Date().toISOString().slice(0, 10);
  for (const k of _cache.keys()) if (!k.startsWith(`${day}|`)) _cache.delete(k);
  const key = `${day}|${holdings.map((h) => h.symbol).join("|")}`;
  if (!force && _cache.has(key)) return _cache.get(key)!;
  const promise = fetchFeedChunked<InsiderTrade>("/api/insider", holdings, force, {
    itemsField: "items",
    dedupeKey: (t) => `${t.company}|${t.insider}|${t.transaction}|${t.shares}|${t.broadcastDate}`,
    sortDesc: (t) => t.broadcastDate || t.toDate || "",
    // The table appends batches as it scrolls; retain every disclosed feed row.
    displayCap: Infinity,
  }).then((r): InsiderResponse => {
    if (!r.ok && _cache.get(key) === promise) _cache.delete(key);
    return r.ok
      ? { ok: true, generatedAt: r.generatedAt, count: r.count, items: r.items, symbolsSearched: r.searched }
      : { ok: false, reason: r.reason, status: r.status };
  });
  _cache.set(key, promise);
  return promise;
}
