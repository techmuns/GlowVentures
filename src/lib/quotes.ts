// Live intraday quotes from the in-house muns batch API, via the /api/quotes
// server proxy (the token lives in the Cloudflare environment, never the browser).
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
};

export type QuoteFeed = {
  quotes: Record<string, Quote>;
  asOf: string;
  /** Symbols the upstream could not price at all — these stay on workbook marks. */
  missing: string[];
  fresh: number;
  stale: number;
};

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
export async function fetchQuotes(symbols: string[], opts?: { refresh?: boolean; probe?: boolean }): Promise<QuoteFeed | null> {
  if (!symbols.length) return null;
  try {
    const r = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbols, refresh: !!opts?.refresh, probe: !!opts?.probe }),
      cache: "no-store",
    });
    const d = await r.json().catch(() => null);

    // The proxy reports ok:false when it resolved nothing. Record why, and log
    // the full per-chunk diagnostics — a silent failure here is what made the
    // last outage take a debugging session to explain.
    if (!d || !d.ok) {
      lastFailure = {
        failureCode: d?.failureCode ?? (r.ok ? "BAD_RESPONSE" : `HTTP_${r.status}`),
        upstreamStatus: d?.upstreamStatus ?? null,
        detail: d?.errors?.[0]?.errorMessage ?? d?.errors?.[0]?.bodyPreview ?? null,
      };
      console.warn("[quotes] no live prices:", lastFailure, d ?? "(no body)");
      return null;
    }
    lastFailure = null;
    return {
      quotes: (d.quotes ?? {}) as Record<string, Quote>,
      asOf: typeof d.asOf === "string" ? d.asOf : new Date().toISOString(),
      missing: Array.isArray(d.missing) ? d.missing : [],
      fresh: Number(d.fresh) || 0,
      stale: Number(d.stale) || 0,
    };
  } catch (e) {
    lastFailure = { failureCode: "NETWORK", upstreamStatus: null, detail: e instanceof Error ? e.message : String(e) };
    console.warn("[quotes] request failed:", lastFailure);
    return null;
  }
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
function priceLooksLikeSameSecurity(live: number, mark: number | null): boolean {
  if (mark === null || !(mark > 0)) return true;      // no mark to compare against
  const r = live / mark;
  return r <= SANE_RATIO && r >= 1 / SANE_RATIO;
}

export function applyQuotes(positions: Position[], feed: QuoteFeed | null): Position[] {
  if (!feed) return positions.map((p) => ({ ...p, live: false }));
  return positions.map((p) => {
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
      returnPct: costNA || unrealizedPnL === null ? p.returnPct : (unrealizedPnL / (cost as number)) * 100,
      prevClose: q.prevClose,
      dayChange: dayChangePct == null ? null : marketValue - p.quantity * (q.prevClose as number),
      dayChangePct,
      low52: q.low52,
      high52: q.high52,
      quoteAgeS: q.ageS,
    };
  });
}
