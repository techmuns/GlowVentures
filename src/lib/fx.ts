export const SUPPORTED_DISPLAY_CURRENCIES = ["INR", "USD"] as const;
export type DisplayCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

// Fallback INR-per-USD if the live feed is unavailable, so the dashboard always
// renders. The live daily rate comes from /api/fx (ECB reference rate).
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
