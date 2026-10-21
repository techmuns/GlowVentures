export const SUPPORTED_DISPLAY_CURRENCIES = ["INR", "USD"] as const;
export type DisplayCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

// Fallback INR-per-USD if the live feed is unavailable, so the dashboard always
// renders. The live daily rate comes from /api/fx: the ECB reference rate via
// Frankfurter, or open.er-api.com when Frankfurter does not answer.
//
// WHICH OF THE TWO ANSWERED IS NOT KNOWN HERE, SO NO SOURCE IS NAMED ON SCREEN
// (MNT-21). The function's `source` field reads "ECB / Frankfurter" whichever
// upstream answered, so this reader deliberately does not pass it through: the
// chip says "reference rate" and its date, which is true of both. When the
// function reports the upstream that actually answered, it can be named.
export const DEFAULT_INR_PER_USD = 83.5;

// Fetch today's USD→INR reference rate from the server proxy. Returns null on any
// failure so callers can fall back to DEFAULT_INR_PER_USD.
export async function fetchInrPerUsd(): Promise<{ inrPerUsd: number; date: string | null } | null> {
  try {
    const r = await fetch("/api/fx", { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    if (d && d.ok && Number.isFinite(d.inrPerUsd) && d.inrPerUsd > 0) {
      return { inrPerUsd: d.inrPerUsd, date: typeof d.date === "string" ? d.date : null };
    }
    return null;
  } catch {
    return null;
  }
}
