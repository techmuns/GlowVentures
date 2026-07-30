// Historical index / stock closes, via the /api/history server proxy.
//
// The upstream only reliably answers "what did this close at on date D" (see the
// long note in functions/api/history.js), so this asks for specific dates rather
// than a series. That suits the book: NAV is captured at financial year-ends, so
// a benchmark at those same dates is a like-for-like comparison rather than a
// prettier chart drawn from data we don't have.

/** Nifty 50 and Sensex only resolve when the ticker is passed through unmodified. */
export const NIFTY = { ticker: "^NSEI", country: "USA", label: "Nifty 50" };
export const SENSEX = { ticker: "^BSESN", country: "USA", label: "Sensex" };

export type Close = { date: string; close: number };
export type CloseSet = {
  /** Keyed by the date asked for; `date` inside is the trading day actually used. */
  closes: Record<string, Close>;
  ticker: string;
  unresolved: string[];
};

export async function fetchCloses(
  dates: string[],
  index: { ticker: string; country: string } = NIFTY,
): Promise<CloseSet | null> {
  if (!dates.length) return null;
  try {
    const r = await fetch("/api/history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: index.ticker, country: index.country, dates }),
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) {
      console.warn("[history] no closes:", d?.failureCode ?? `HTTP_${r.status}`, d ?? "(no body)");
      return null;
    }
    return {
      closes: (d.closes ?? {}) as Record<string, Close>,
      ticker: String(d.ticker ?? index.ticker),
      unresolved: Array.isArray(d.unresolved) ? d.unresolved : [],
    };
  } catch (e) {
    console.warn("[history] request failed:", e);
    return null;
  }
}
