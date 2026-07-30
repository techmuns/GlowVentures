import type { DisplayCurrency } from "./fx";

export const KEYS = { DISPLAY_CCY: "glow:displayCurrency" } as const;

export function readDisplayCurrency(): DisplayCurrency | null {
  try {
    const v = localStorage.getItem(KEYS.DISPLAY_CCY);
    return v === "INR" || v === "USD" ? v : null;
  } catch { return null; }
}

export function writeDisplayCurrency(c: DisplayCurrency): void {
  try { localStorage.setItem(KEYS.DISPLAY_CCY, c); } catch {}
}
