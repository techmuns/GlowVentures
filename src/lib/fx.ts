export const SUPPORTED_DISPLAY_CURRENCIES = ["INR", "USD"] as const;
export type DisplayCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

// The live daily rate comes from /api/fx: the ECB reference rate via
// Frankfurter, or open.er-api.com when Frankfurter does not answer.
//
// WHICH OF THE TWO ANSWERED IS NOT KNOWN HERE, SO NO SOURCE IS NAMED ON SCREEN
// (MNT-21). The function's `source` field reads "ECB / Frankfurter" whichever
// upstream answered, so this reader deliberately does not pass it through: the
// chip says "reference rate" and its date, which is true of both. When the
// function reports the upstream that actually answered, it can be named.
//
// ── THERE IS NO FALLBACK RATE ANY MORE (Stage 10fz) ─────────────────────────
//
// This file carried `DEFAULT_INR_PER_USD = 83.5`, and when /api/fx did not
// answer every USD figure in the cockpit was divided by it — a rate nobody
// published on any date, wrong by its own drift everywhere at once, flagged
// only by an amber chip. That is a fabricated figure with a badge on it, which
// the standing rule does not allow however clearly it is badged.
//
// So a USD figure is struck on a rate that was actually published, or not at
// all: the rate the feed returned on this load; failing that, the LAST rate
// this browser fetched, with the date it was published and the moment it was
// fetched, said on the chip; failing both, the cockpit renders in INR and the
// currency control says why (`effectiveCurrency`).

/** A published USD→INR reference rate, and when this browser fetched it. */
export type FxRate = { inrPerUsd: number; date: string | null; fetchedAt: string };

/**
 * Where the rate in use came from.
 *   · `live` — /api/fx answered on this load.
 *   · `saved` — it did not (or has not yet); the last rate this browser
 *     fetched is in use, with its own date.
 *   · `pending` — no rate has been fetched on this load and none is saved.
 *   · `unavailable` — the feed did not answer and no earlier rate is saved.
 */
export type FxState =
  | { status: "live"; rate: FxRate }
  | { status: "saved"; rate: FxRate; feed: "pending" | "failed" }
  | { status: "pending" }
  | { status: "unavailable" };

const FX_CACHE_KEY = "glow:fx:last";
type KV = Pick<Storage, "getItem" | "setItem">;
const defaultStore = (): KV | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

const validRate = (v: unknown): v is FxRate => {
  const r = v as FxRate | null;
  return !!r && typeof r === "object" && typeof r.inrPerUsd === "number" && Number.isFinite(r.inrPerUsd) && r.inrPerUsd > 0
    && (r.date === null || typeof r.date === "string") && typeof r.fetchedAt === "string";
};

/** The last rate this browser fetched, or null — never a default. */
export function readSavedRate(store: KV | null = defaultStore()): FxRate | null {
  try {
    const raw = store?.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return validRate(v) ? v : null;
  } catch { return null; }
}

/** Remembers a rate the feed returned, so a later load the feed misses can say which rate it is on. */
export function saveRate(rate: FxRate, store: KV | null = defaultStore()): void {
  try { store?.setItem(FX_CACHE_KEY, JSON.stringify(rate)); } catch { /* storage blocked: nothing saved */ }
}

/**
 * The state from the feed's answer and the saved rate: the feed's, else the
 * saved one, else none. `live === undefined` means the fetch has not settled.
 */
export function resolveFx(live: FxRate | null | undefined, saved: FxRate | null): FxState {
  if (live) return { status: "live", rate: live };
  if (saved) return { status: "saved", rate: saved, feed: live === undefined ? "pending" : "failed" };
  return live === undefined ? { status: "pending" } : { status: "unavailable" };
}

/** The rate a conversion may use — null when no published rate is in hand. */
export const rateOf = (s: FxState): number | null => ("rate" in s ? s.rate.inrPerUsd : null);

/**
 * THE CURRENCY THE COCKPIT ACTUALLY RENDERS IN. USD only with a published
 * rate in hand; otherwise INR, whatever was asked for, because a USD figure
 * struck on no rate would have to be struck on a made-up one.
 */
export function effectiveCurrency(requested: DisplayCurrency, s: FxState): DisplayCurrency {
  return requested === "USD" && rateOf(s) === null ? "INR" : requested;
}

// Fetch today's USD→INR reference rate from the server proxy. Returns null on
// any failure; the caller then uses the SAVED rate, never a default.
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
