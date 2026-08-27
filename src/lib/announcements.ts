// Client helper for the corporate-announcements feed. Resolves each holding to its
// NSE trading symbol — the ticker the statement printed, else its securityKey
// through src/data/nseSymbols.json — then fans out across ALL of them (chunked,
// see feedFetch) to the server-side proxy at /api/announcements.
//
// Only company shares reach this feed at all — whoever chose them. A fund unit
// (AIF folio, mutual-fund scheme, ETF) and an unlisted holding have no exchange
// filings of their own and are simply absent, not shown as having none. A share
// a discretionary manager picked files with the exchange exactly like one the
// family bought in its own demat, so both are here.
import type { Portfolio } from "./types";
import { symbolFor } from "./quotes";
import { fetchFeedChunked } from "./feedFetch";
import { isCompanyShare } from "./analytics";

export type Announcement = {
  title: string;
  desc: string;
  date: string;
  attachment: string;
  source: string;
  symbol: string;
  holding: string;
  key: string;
};

export type AnnouncementsResponse = {
  ok: boolean;
  reason?: "not_configured" | "auth" | "error" | "method" | "upstream_error";
  status?: number;
  generatedAt?: string;
  windowDays?: number;
  count?: number;
  items?: Announcement[];
  symbolsSearched?: number;
};

export type AnnHolding = { symbol: string; name: string; key: string; weight: number };

// Listed holdings that have a resolvable NSE symbol, largest first. `n` limits
// the list; omit it to return EVERY holding that maps to a symbol.
export function topHoldingsForAnnouncements(portfolio: Portfolio, n?: number): AnnHolding[] {
  const map = new Map<string, { name: string; key: string; symbol: string | null; mv: number }>();
  let total = 0;
  for (const p of portfolio.positions) {
    // Exchange announcements are a COMPANY's own filings, so this list narrows on
    // `isCompanyShare` — the class axis, and deliberately NOT the narrower
    // `Direct Equity` bucket the holdings tables group on. A company files with
    // the exchange whether the family or its manager bought the shares; dropping
    // the mandate-held names here would hide the filings of most of the
    // companies this book actually owns.
    //
    // The symbol filter below already dropped the fund units in practice (no NSE
    // listing resolves for one), but it dropped them AFTER they had been counted
    // into `total`, which weighed every real company against a denominator
    // including the AIF folios and fund schemes it was never selected from.
    if (!isCompanyShare(p)) continue;
    total += p.marketValue;
    const e = map.get(p.securityKey)
      ?? { name: p.security, key: p.securityKey, symbol: symbolFor(p), mv: 0 };
    // A statement that prints the ticker wins over one that doesn't; the first
    // row for a name may be the one lacking it.
    if (!e.symbol) e.symbol = symbolFor(p);
    e.mv += p.marketValue;
    map.set(p.securityKey, e);
  }
  const withSym = [...map.values()]
    .sort((a, b) => b.mv - a.mv)
    .filter((h): h is typeof h & { symbol: string } => !!h.symbol);
  const chosen = n == null ? withSym : withSym.slice(0, n);
  return chosen.map((h) => ({ symbol: h.symbol, name: h.name, key: h.key, weight: total > 0 ? h.mv / total : 0 }));
}

const _cache = new Map<string, Promise<AnnouncementsResponse>>();

export function getHoldingsAnnouncements(holdings: AnnHolding[], force = false): Promise<AnnouncementsResponse> {
  const key = holdings.map((h) => h.symbol).join("|");
  if (!force && _cache.has(key)) return _cache.get(key)!;
  const promise = fetchFeedChunked<Announcement>("/api/announcements", holdings, force, {
    itemsField: "items",
    dedupeKey: (a) => a.attachment || `${a.symbol}|${a.title}|${a.date}`,
    sortDesc: (a) => a.date || "",
    displayCap: 150,
  }).then((r): AnnouncementsResponse => {
    if (!r.ok && _cache.get(key) === promise) _cache.delete(key);
    return r.ok
      ? { ok: true, generatedAt: r.generatedAt, count: r.count, items: r.items, symbolsSearched: r.searched, windowDays: 180 }
      : { ok: false, reason: r.reason, status: r.status };
  });
  _cache.set(key, promise);
  return promise;
}
