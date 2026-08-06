// Client for the free macro feed (/api/macro → Yahoo Finance). Maps the FOOS
// spec's friendly series names to Yahoo symbols and fetches the returns table the
// Function computes. Series with no reliable free symbol carry `yahoo: null` and
// stay illustrative on the page; the feed being unreachable does the same.

export type MacroReturns = {
  d1: number | null; w1: number | null; m1: number | null; qtd: number | null;
  ytd: number | null; y1: number | null; y3: number | null; y5: number | null;
  y10: number | null; max: number | null;
};
export type MacroSeries = {
  symbol: string; last: number; asOf: string; currency: string | null;
  high52: number | null; low52: number | null; returns: MacroReturns;
};
export type MacroFeed = { ok: boolean; reason?: string; source?: string; series: Record<string, MacroSeries> };

// The columns the SeriesTable renders, mapped to the returns keys.
export const MACRO_COLS: { key: keyof MacroReturns; label: string }[] = [
  { key: "d1", label: "1D" }, { key: "w1", label: "1W" }, { key: "m1", label: "1M" },
  { key: "qtd", label: "QTD" }, { key: "ytd", label: "YTD" }, { key: "y1", label: "1Y" },
  { key: "y3", label: "3Y" }, { key: "y5", label: "5Y" }, { key: "y10", label: "10Y" }, { key: "max", label: "Max" },
];

export async function fetchMacro(symbols: string[]): Promise<MacroFeed> {
  const list = [...new Set(symbols.filter(Boolean))];
  if (!list.length) return { ok: false, series: {} };
  try {
    const r = await fetch(`/api/macro?symbols=${encodeURIComponent(list.join(","))}`);
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, series: {} };
    const d = await r.json();
    return d && d.ok
      ? { ok: true, source: d.source, series: d.series ?? {} }
      : { ok: false, reason: d && d.reason ? d.reason : "error", series: {} };
  } catch {
    return { ok: false, reason: "unreachable", series: {} };
  }
}

// Format a live level in its own currency. Commodities & most indices are USD,
// Nifty/Sensex INR, FX pairs a plain ratio.
export function fmtLevel(n: number, currency: string | null): string {
  const sym = currency === "USD" ? "$" : currency === "INR" ? "₹" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const decimals = Math.abs(n) < 10 ? (Math.abs(n) < 2 ? 4 : 2) : n >= 1000 ? 0 : 2;
  return `${sym}${n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals >= 2 && Math.abs(n) < 10 ? decimals : 0 })}`;
}
