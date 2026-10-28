// Client for `/api/prices` — one security's full daily close history plus the
// spec's returns table, computed at the edge from the same `computeReturns` the
// macro harvester uses.
//
// This supersedes `src/lib/history.ts` + `returnsTable.ts` for company pages.
// Those built a returns table from ten INDIVIDUAL lookups against the muns
// `market_data` endpoint, because that endpoint returns a four-row preview of a
// window rather than a series — which meant ten upstream calls per company and
// no chart at any price. One call now answers both.
import type { Point, HorizonKey } from "./series";
import { keep, readKept } from "./stockPageStore";

export type PriceHistory = {
  ok: true;
  source: string;
  symbol: string;
  currency: string | null;
  exchange: string | null;
  /**
   * WHAT THE UPSTREAM CALLED THE INSTRUMENT — the evidence the benchmark
   * identity check is struck on (`benchmarkIdentity` in `benchmarks.ts`).
   * Optional because a company page never reads it; a benchmark treats its
   * absence as UNVERIFIED rather than as a match.
   */
  name?: string | null;
  longName?: string | null;
  shortName?: string | null;
  first: string;
  last: string;
  count: number;
  last_value: number;
  returns: Partial<Record<HorizonKey, number | null>>;
  spans: Partial<Record<HorizonKey, [string, string]>>;
  high52: number | null;
  low52: number | null;
  /** Columnar — dates and closes as parallel arrays. */
  t: string[];
  v: number[];
  /** When the price service fetched this history from its upstream (epoch ms). */
  fetchedAt?: number;
};

export type PriceError = { ok: false; reason: string; symbol?: string };
export type PriceResult = PriceHistory | PriceError;

/**
 * ONE REQUEST PER SYMBOL PER PAGE LOAD, SHARED BY EVERY CARD THAT ASKS.
 *
 * The company page reads a symbol's history twice — the returns table, and the
 * trading-range card's 52-week range where the quote feed carried none (an
 * Upstox quote never does). Both get the same promise, so the two can never
 * show ranges from two different fetches. A FAILED answer is not kept, so the
 * next caller retries rather than inheriting an outage.
 */
const inflight = new Map<string, Promise<PriceResult>>();
/** Every history this page load has already received, for a card that opens after it arrived. */
const settled = new Map<string, PriceHistory>();

/**
 * THE STOCK PAGE KEEPS WHAT IT READ (Stage 10ik). With `keep`, a history the
 * price service fetched within `KEPT_FRESH_MS` — its own edge cache lifetime,
 * so never an older copy than the service itself would answer with — is drawn
 * from this browser (`stockPageStore.ts`) instead of the network, and a fresh
 * answer is kept for the next visit. Benchmarks do not ask for it: their
 * identity check is struck on every answer the upstream gives.
 */
export const KEPT_FRESH_MS = 6 * 3600_000;

export function fetchPriceHistory(symbol: string, opts: { keep?: boolean } = {}): Promise<PriceResult> {
  const hit = inflight.get(symbol);
  if (hit) return hit;
  const p = (opts.keep ? loadKeptOrLive(symbol) : loadPriceHistory(symbol)).then((r) => {
    if (!r.ok) inflight.delete(symbol);
    else settled.set(symbol, r);
    return r;
  });
  inflight.set(symbol, p);
  return p;
}

/** The history this page load already holds for `symbol`, so a card can draw it on its first paint. */
export const settledPriceHistory = (symbol: string): PriceHistory | undefined => settled.get(symbol);

async function loadKeptOrLive(symbol: string): Promise<PriceResult> {
  const keptKey = `price:${symbol}`;
  const kept = await readKept<PriceHistory>(keptKey);
  if (kept?.value.ok && Date.now() - kept.at < KEPT_FRESH_MS) return kept.value;
  const r = await loadPriceHistory(symbol);
  // Only an answer dated by the service is kept: without its fetch time a kept
  // copy's age could not be told, and an undated copy is never served as fresh.
  if (r.ok && typeof r.fetchedAt === "number") void keep(keptKey, r, r.fetchedAt);
  return r;
}

async function loadPriceHistory(symbol: string): Promise<PriceResult> {
  try {
    const r = await fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}`);
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, symbol };
    const d = await r.json();
    return d?.ok ? (d as PriceHistory) : { ok: false, reason: d?.reason ?? "error", symbol };
  } catch {
    return { ok: false, reason: "unreachable", symbol };
  }
}

/** Columnar payload → the `{t,v}` points the chart component takes. */
export function toPoints(h: PriceHistory): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < h.t.length; i++) out.push({ t: h.t[i], v: h.v[i] });
  return out;
}

/**
 * A plain-language reason for a history the feed could not supply.
 *
 * "No data" tells a reader nothing about whether to go and look for something,
 * which is the same rule `Absent.tsx` applies to every missing figure in the book.
 */
export function priceErrorReason(e: PriceError, hasSymbol: boolean): string {
  if (!hasSymbol) {
    return "This security has no NSE symbol resolved, so no price history can be fetched. Cash, the liquid-fund sweeps and the AIF units can never have one; a listed name without one is reported unresolved by `npm run build-symbols`.";
  }
  switch (e.reason) {
    case "unreachable":
      return "The price service did not respond. It runs as a server-side function on the deployed site, not in local preview.";
    case "timeout":
      return "The price service timed out upstream. Refresh to retry — nothing is cached from a failed call.";
    case "no settled closes":
      return "The feed returned no completed trading sessions for this symbol.";
    default:
      return `The price feed could not supply a history for this symbol (${e.reason}).`;
  }
}
