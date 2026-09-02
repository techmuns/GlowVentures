// Client for `/api/indices` — the live level and the day's move for the four
// Indian equity indices the family asked to see at all times.
//
// THIS IS NOT THE HARVEST STORE, AND THE DIFFERENCE IS THE POINT. `public/series/`
// carries `nifty-50` and `sensex` as settled DAILY CLOSES, harvested nightly —
// which answers "what has the Nifty done over ten years" and cannot answer
// "where is it now". Two of these four indices are not in that store at all. So
// the strip proxies, and the NAV chart, which needs a history, reads
// `/api/prices` for the same reason a company page does.
//
// EVERY FIELD IS OPTIONAL-BY-DESIGN. An index the upstream priced but whose
// previous settled close it could not supply has a LEVEL and no MOVE, and the
// strip prints the level and dashes the change rather than withholding both or
// substituting a zero — a 0.00% day on an index is a real measurement and must
// never stand in for an absent one.

/** The identity of one index, as the Function resolved it. */
export type IndexQuote = {
  id: string;
  label: string;
  symbol: string;
  ok: boolean;
  reason: string | null;
  /** What the upstream called the instrument — the identity check's evidence. */
  name?: string | null;
  reportedName?: string | null;
  currency?: string | null;
  exchange?: string | null;
  level: number | null;
  prevClose: number | null;
  prevCloseDate: string | null;
  change: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  high52: number | null;
  low52: number | null;
  asOf: string | null;
};

export type IndexFeed = {
  ok: boolean;
  source: string;
  fetchedAt: string;
  resolved: number;
  requested: number;
  indices: IndexQuote[];
};

/**
 * The Nifty 500's Yahoo symbol, exported so the NAV chart and the strip cannot
 * disagree about which index "Nifty 500" means. `^CRSLDX` was VERIFIED against
 * the upstream's own `longName` on 2026-09-02 — `^CNX500` is delisted and
 * `NIFTY_MIDCAP_150.NS` and `NIFTY_SMLCAP_250.NS` are different instruments
 * that answer 200 with plausible rupee figures. See `functions/api/indices.js`.
 */
export const NIFTY_500_SYMBOL = "^CRSLDX";
export const NIFTY_500_LABEL = "Nifty 500";

/** The four the family named, in the order they named them. */
export const STRIP_INDEX_IDS = ["nifty-50", "nifty-500", "nifty-midcap-150", "nifty-smallcap-250"] as const;

export async function fetchIndices(opts?: { refresh?: boolean }): Promise<IndexFeed | null> {
  try {
    const r = await fetch(`/api/indices${opts?.refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !Array.isArray(d.indices)) return null;
    return d as IndexFeed;
  } catch {
    return null;
  }
}

/**
 * Why one index carries no level, in words a reader can act on.
 *
 * `identity_mismatch` is the one worth spelling out: it does NOT mean the market
 * is shut or the feed is down, it means the symbol answered with a DIFFERENT
 * instrument, and the fix is a symbol change rather than a retry.
 */
export function indexReason(q: IndexQuote): string {
  switch (q.reason) {
    case "identity_mismatch":
      return `The price service answered for ${q.reportedName ? `"${q.reportedName}"` : "an unnamed instrument"} rather than ${q.label}, so no level is shown. A symbol that answers with a different index would print a plausible number for the wrong market.`;
    case "timeout":
      return "The index feed timed out upstream. Nothing is cached from a failed call — refresh to retry.";
    case "unreachable":
      return "The index feed did not respond. It runs as a server-side function on the deployed site, not in local preview.";
    case "no level":
      return "The feed returned this index with no current level.";
    default:
      return `The index feed could not supply a level for ${q.label}${q.reason ? ` (${q.reason})` : ""}.`;
  }
}
