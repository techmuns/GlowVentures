// Client for the free macro-economic feed (/api/economy → World Bank, India).
// Annual, often lagged — the page labels each figure with its year and calls it
// "latest annual", never real-time. A code the feed has no data for stays preview.

export type EconIndicator = { value: number; year: string; prev: number | null; prevYear: string | null };
export type EconFeed = { ok: boolean; reason?: string; source?: string; indicators: Record<string, EconIndicator> };

export async function fetchEconomy(): Promise<EconFeed> {
  try {
    const r = await fetch("/api/economy");
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, indicators: {} };
    const d = await r.json();
    return d && d.ok
      ? { ok: true, source: d.source, indicators: d.indicators ?? {} }
      : { ok: false, reason: d && d.reason ? d.reason : "error", indicators: {} };
  } catch {
    return { ok: false, reason: "unreachable", indicators: {} };
  }
}

/** A World Bank rate/percent value, to one decimal with a sign for the change. */
export function fmtEcon(v: number): string {
  return `${v.toFixed(1)}%`;
}
export function econChange(ind: EconIndicator): string | null {
  if (ind.prev == null) return null;
  const d = ind.value - ind.prev;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`;
}
