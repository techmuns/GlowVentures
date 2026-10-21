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
  const key = holdings.map((h) => h.symbol).join("|");
  if (!force && _cache.has(key)) return _cache.get(key)!;
  const promise = fetchFeedChunked<InsiderTrade>("/api/insider", holdings, force, {
    itemsField: "items",
    dedupeKey: (t) => `${t.company}|${t.insider}|${t.transaction}|${t.shares}|${t.broadcastDate}`,
    sortDesc: (t) => t.broadcastDate || t.toDate || "",
    displayCap: 150,
  }).then((r): InsiderResponse => {
    if (!r.ok && _cache.get(key) === promise) _cache.delete(key);
    return r.ok
      ? { ok: true, generatedAt: r.generatedAt, count: r.count, items: r.items, symbolsSearched: r.searched }
      : { ok: false, reason: r.reason, status: r.status };
  });
  _cache.set(key, promise);
  return promise;
}
