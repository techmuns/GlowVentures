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

export type PriceHistory = {
  ok: true;
  source: string;
  symbol: string;
  currency: string | null;
  exchange: string | null;
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
};

export type PriceError = { ok: false; reason: string; symbol?: string };
export type PriceResult = PriceHistory | PriceError;

export async function fetchPriceHistory(symbol: string): Promise<PriceResult> {
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
