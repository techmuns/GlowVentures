// Live intraday quotes via the /api/quotes server proxy — from Upstox where its
// token is set (one call prices the whole book), with the in-house muns batch
// API as the fallback. Both tokens live in the Cloudflare environment, never
// the browser; each quote says which feed priced it.
//
// The quote API works in NSE symbols. A position may already carry one (some
// statements print the ticker); otherwise `nseSymbols.json` bridges it.
//
// THE BRIDGE IS KEYED ON securityKey, NOT ISIN. That is not a preference — no
// provider in this book prints an ISIN in its holdings column, so an ISIN-keyed
// lookup resolves nothing for 143 of 143 positions and the entire live layer
// silently stays dark while looking wired up. `npm run build-symbols` resolves
// NAMES to symbols for exactly that reason and emits a securityKey-keyed map;
// this reads it on the same key. (This file previously exported
// `symbolForIsin(p.isin)` against that map — two identifier spaces, one
// dictionary, and no error anywhere to show for it.)
//
// A name the resolver could not place with certainty is simply absent from the
// map: the position keeps its statement mark and is flagged not-live, because a
// wrong symbol shows another company's price and says nothing about it.
import nseSymbols from "@/data/nseSymbols.json";
import type { Position } from "./types";
import { fifoReturnPct } from "../../shared/fifo.mjs";
import { requestDeadline } from "./requestDeadline";

const KEY_TO_SYMBOL = nseSymbols as Record<string, string>;

/** The NSE symbol for a securityKey, or null when the resolver left it out. */
export function symbolForKey(securityKey: string | undefined | null): string | null {
  return securityKey ? KEY_TO_SYMBOL[securityKey] ?? null : null;
}

/** The NSE symbol for a position: the one the statement printed, else the map. */
export function symbolFor(p: Pick<Position, "symbol" | "securityKey">): string | null {
  return p.symbol || symbolForKey(p.securityKey);
}

/** How much of a book the live layer can even ask about, before any fetch. */
export function symbolCoverage(positions: Position[]): { withSymbol: number; withoutSymbol: number; names: string[] } {
  const seen = new Map<string, boolean>();
  for (const p of positions) if (!seen.has(p.securityKey)) seen.set(p.securityKey, !!symbolFor(p));
  const names = positions
    .filter((p) => !symbolFor(p))
    .map((p) => p.security);
  return {
    withSymbol: [...seen.values()].filter(Boolean).length,
    withoutSymbol: [...seen.values()].filter((v) => !v).length,
    names: [...new Set(names)].sort(),
  };
}

export type Quote = {
  price: number;
  prevClose: number | null;
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  low52: number | null;
  high52: number | null;
  marketCap: number | null;
  volume: number | null;
  yearChangePct: number | null;
  /** Seconds since this quote was pulled from the upstream. 0 = just fetched. */
  ageS: number;
  /** Which feed priced it. Absent on a snapshot cached before the field existed. */
  source?: "upstox" | "muns";
  /** When the price last traded, where the feed says (Upstox does; muns does not). */
  tradedAt?: string | null;
  /** Original observation time, retained through partial refreshes. */
  observedAt?: string;
};

export type QuoteFeed = {
  quotes: Record<string, Quote>;
  asOf: string;
  /** Symbols the upstream ATTEMPTED and could not price — these stay on workbook marks. */
  missing: string[];
  /**
   * Symbols this round DEFERRED because of the per-request cap. An answer is
   * coming; `missing` says one never will. A caller that cannot tell the two
   * apart cannot know when a set is complete, and a ranked list struck over a
   * partial set is a wrong figure rather than a slow one.
   */
  pending: string[];
  fresh: number;
  stale: number;
};

/** The feeds that priced at least one quote in `feed`, in words, primary first. */
export function quoteFeedNames(feed: QuoteFeed | null): string[] {
  if (!feed) return [];
  const seen = new Set(Object.values(feed.quotes).map((q) => q.source));
  return [["upstox", "Upstox"], ["muns", "muns"]].filter(([k]) => seen.has(k as Quote["source"])).map(([, label]) => label);
}

/** Which of `symbols` this feed has not answered for yet. */
export function pendingAmong(feed: QuoteFeed | null, symbols: readonly string[]): string[] {
  if (!feed) return [...symbols];
  const p = new Set(feed.pending);
  // A symbol with no quote and no verdict is one this feed never mentioned —
  // treat it as pending, because the alternative is calling a set complete on a
  // response that said nothing about it.
  return symbols.filter((s) => p.has(s) || (!feed.quotes[s] && !feed.missing.includes(s)));
}

/** Why a fetch produced no prices, for the UI and for the console. */
export type QuoteFailure = {
  failureCode: string;
  upstreamStatus: number | null;
  detail: string | null;
};

let lastFailure: QuoteFailure | null = null;
export const lastQuoteFailure = () => lastFailure;

/** Distinct NSE symbols for a set of positions, in book order. */
export function symbolsFor(positions: Position[]): string[] {
  const out = new Set<string>();
  for (const p of positions) {
    const s = symbolFor(p);
    if (s) out.add(s);
  }
  return [...out];
}

/**
 * Fetch live quotes. Returns null on any failure — callers keep the workbook
 * marks, so a feed outage degrades to "as of the last upload" rather than a
 * broken page.
 */
export async function fetchQuotes(
  symbols: string[],
  opts?: { refresh?: boolean; probe?: boolean; priority?: readonly string[] },
): Promise<QuoteFeed | null> {
  if (!symbols.length) return null;
  const deadline = requestDeadline(45_000);
  try {
    const r = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbols,
        // Which symbols the first screen needs. It never widens the ask — the
        // server ignores anything not in `symbols` — it only decides the order,
        // so one visible card completes in a round instead of a book's worth.
        priority: opts?.priority ? [...opts.priority] : undefined,
        refresh: !!opts?.refresh,
        probe: !!opts?.probe,
      }),
      cache: "no-store",
      signal: deadline.signal,
    });
    const d = await r.json().catch(() => null);

    // The proxy reports ok:false when it resolved nothing. Record why, and log
    // the full per-chunk diagnostics — a silent failure here is what made the
    // last outage take a debugging session to explain.
    if (!r.ok || !d || !d.ok) {
      lastFailure = {
        failureCode: d?.failureCode ?? (r.ok ? "BAD_RESPONSE" : `HTTP_${r.status}`),
        upstreamStatus: d?.upstreamStatus ?? null,
        detail: d?.errors?.[0]?.errorMessage ?? d?.errors?.[0]?.bodyPreview ?? null,
      };
      console.warn("[quotes] no live prices:", lastFailure, d ?? "(no body)");
      return null;
    }
    const wanted = new Set(symbols);
    const quotes = Object.fromEntries(Object.entries(d.quotes || {}).filter(([symbol, value]) => {
      const q = value as Quote | null;
      return wanted.has(symbol) && q && Number.isFinite(q.price) && q.price > 0;
    })) as Record<string, Quote>;
    if (!Object.keys(quotes).length) {
      lastFailure = { failureCode: "NO_VALID_QUOTES", upstreamStatus: r.status, detail: "No usable prices returned" };
      return null;
    }
    const pending: string[] = Array.isArray(d.pending) ? d.pending.filter((s: string) => wanted.has(s) && !quotes[s]) : [];
    lastFailure = null;
    return {
      quotes,
      asOf: typeof d.asOf === "string" ? d.asOf : new Date().toISOString(),
      missing: symbols.filter((s) => !quotes[s] && !pending.includes(s)),
      pending,
      fresh: Number(d.fresh) || 0,
      stale: Number(d.stale) || 0,
    };
  } catch (e) {
    lastFailure = { failureCode: "NETWORK", upstreamStatus: null, detail: e instanceof Error ? e.message : String(e) };
    console.warn("[quotes] request failed:", lastFailure);
    return null;
  } finally { deadline.dispose(); }
}

/**
 * Overlay live prices onto the book.
 *
 * Only price-derived fields move: quantity and cost basis come from the client's
 * workbook and are never touched. A position with no live quote is returned
 * unchanged with `live: false`, so the UI can mark it rather than pass a stale
 * mark off as current.
 */
// A live price this far from the workbook mark is not a price move — it is a
// different company. Guessing NSE symbols for the unlisted-on-NSE holdings is
// how that happens: "CONCORD" quotes at ₹73 while Concord Control Systems is
// marked at ₹2,726. A 10× band lets through any realistic move (the whole book's
// median drift against its mark is ~6%, the largest ~53%) while catching a
// mis-mapped ticker, which then stays on the workbook mark rather than showing a
// confidently wrong number.
const SANE_RATIO = 10;
export function priceLooksLikeSameSecurity(live: number, mark: number | null): boolean {
  if (mark === null || !(mark > 0)) return true;      // no mark to compare against
  const r = live / mark;
  return r <= SANE_RATIO && r >= 1 / SANE_RATIO;
}

export function applyQuotes(positions: Position[], feed: QuoteFeed | null): Position[] {
  if (!feed) return positions.map((p) => ({ ...p, live: false }));
  return positions.map((p) => {
    // THE REVIEW'S LINES ARE NEVER PRICED HERE (Stage 10dh). The family's
    // consolidated review is the source for private-market holdings, and those
    // are unlisted shares, preference shares and fund units no exchange quotes;
    // a quote that happened to resolve would move a value the review struck. And
    // a line recorded with no unit count has no per-unit price to apply at all.
    if (p.review || p.quantity === null) return { ...p, live: false };
    const sym = symbolFor(p);
    const q = sym ? feed.quotes[sym] : undefined;
    if (!q || !(q.price > 0)) return { ...p, live: false };
    if (!priceLooksLikeSameSecurity(q.price, p.currentPrice)) {
      if (typeof console !== "undefined") {
        console.warn(`[quotes] ignoring ${sym} for ${p.security}: live ₹${q.price} vs mark ₹${p.currentPrice} — likely a different security`);
      }
      return { ...p, live: false };
    }

    const marketValue = p.quantity * q.price;
    // Some holdings reach us with no usable cost (the source flags them
    // `costUnavailable` and carries cost 0). `marketValue − 0` would book their
    // entire value as profit, so P&L and return stay "not meaningful" exactly as
    // the statement has them, and only the price and market value move.
    // `costBasis` is NULL where the statement reported none — a depository
    // holding statement prints a value and no cost. Null, not zero: `marketValue
    // − 0` would book the whole position as profit at an infinite return.
    const cost = p.costBasis;
    const costNA = !!p.costUnavailable || !(typeof cost === "number" && cost > 0);
    const unrealizedPnL = costNA ? p.unrealizedPnL : marketValue - (cost as number);
    const dayChangePct = q.prevClose && q.prevClose > 0 ? ((q.price - q.prevClose) / q.prevClose) * 100 : null;
    return {
      ...p,
      live: true,
      symbol: sym ?? undefined,
      currentPrice: q.price,
      marketValue,
      unrealizedPnL,
      // FIFO's one return: a live price moves the unrealised half and nothing
      // else, so the realised gain on units already sold stays in it (§6).
      returnPct: costNA || unrealizedPnL === null ? p.returnPct
        : fifoReturnPct(marketValue, cost as number, p.realizedPnL, p.costOfUnitsSold),
      prevClose: q.prevClose,
      dayChange: dayChangePct == null ? null : marketValue - p.quantity * (q.prevClose as number),
      dayChangePct,
      low52: q.low52,
      high52: q.high52,
      marketCap: q.marketCap,
      quoteAgeS: q.ageS,
    };
  });
}
