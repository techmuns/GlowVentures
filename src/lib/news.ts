// Client helper for the holdings-news feed. Derives the holdings to search, then
// fans out across ALL of them (chunked, see feedFetch) to the server-side proxy at
// /api/news (a Cloudflare Pages Function that holds MUNS_TOKEN and talks to the muns
// news API). The token never reaches the browser — this only ever sees the merged,
// de-duplicated feed.
import type { Portfolio } from "./types";
import { fetchFeedChunked } from "./feedFetch";

export type NewsArticle = {
  title: string;
  url: string;
  description: string;
  source: string;
  age: string;
  publishedAt: string;
  holding: string;
  key: string;
};

export type NewsResponse = {
  ok: boolean;
  reason?: "not_configured" | "auth" | "error" | "method" | "upstream_error";
  status?: number;
  generatedAt?: string;
  count?: number;
  articles?: NewsArticle[];
  holdingsSearched?: number;
};

export type NewsHolding = { name: string; key: string; weight: number };

// The largest single-name listed exposures, largest first. Consolidated on
// securityKey — the same name held through two platforms is one company to
// search, and ISIN can't do this grouping because most of the book has none.
// `n` limits the list (e.g. for the notifications-bell preview); omit it to
// return EVERY holding.
export function topHoldingsForNews(portfolio: Portfolio, n?: number): NewsHolding[] {
  const map = new Map<string, { name: string; key: string; mv: number }>();
  let total = 0;
  for (const p of portfolio.positions) {
    total += p.marketValue;
    const e = map.get(p.securityKey) ?? { name: p.security, key: p.securityKey, mv: 0 };
    e.mv += p.marketValue;
    map.set(p.securityKey, e);
  }
  const sorted = [...map.values()].sort((a, b) => b.mv - a.mv);
  const chosen = n == null ? sorted : sorted.slice(0, n);
  return chosen.map((h) => ({ name: h.name, key: h.key, weight: total > 0 ? h.mv / total : 0 }));
}

// Shared per-holdings-set cache so the News page and the bell reuse one fetch
// (further deduped by the edge cache). Keyed by the holdings set, so the page's
// full list and the bell's preview subset cache independently.
const _cache = new Map<string, Promise<NewsResponse>>();

export function getHoldingsNews(holdings: NewsHolding[], force = false): Promise<NewsResponse> {
  const key = holdings.map((h) => h.key).join("|");
  if (!force && _cache.has(key)) return _cache.get(key)!;
  const promise = fetchFeedChunked<NewsArticle>("/api/news", holdings, force, {
    itemsField: "articles",
    dedupeKey: (a) => a.url,
    sortDesc: (a) => a.publishedAt || "",
    displayCap: 150,
  }).then((r): NewsResponse => {
    if (!r.ok && _cache.get(key) === promise) _cache.delete(key);
    return r.ok
      ? { ok: true, generatedAt: r.generatedAt, count: r.count, articles: r.items, holdingsSearched: r.searched }
      : { ok: false, reason: r.reason, status: r.status };
  });
  _cache.set(key, promise);
  return promise;
}
