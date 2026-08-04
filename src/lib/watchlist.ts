// INVESTMENT TOOLS — the client spec's watchlist, target price, fair value,
// entry / exit price and price alerts.
//
// WHY THIS IS LOCAL AND NOT A FEED
// ────────────────────────────────
// Every other figure in this cockpit is READ from a statement or a market feed
// and traces back to one. These do not: a target price is a JUDGEMENT the family
// makes, and there is no upstream that could supply one. So this is the only
// store in the app that a user writes to, and it is kept apart from the book for
// exactly that reason — `glowData.ts` is generated from `source/` and must stay
// byte-identical to it, so a user's target price can never live there.
//
// THE ABSENCE RULE APPLIES HERE TOO, and it is easy to get wrong. A target price
// nobody has set is `null`, never 0. A zero target would render as a real number
// and make every holding look 100% overvalued — a fabricated figure produced by
// a default, which is precisely what this codebase forbids.
//
// Storage is `localStorage`, per browser. That is a real limitation and it is
// stated on screen rather than implied: these notes do not follow the reader to
// another device, and a shared family view would need a server-side store.
import { KEYS as BASE_KEYS } from "./storage";

const KEY = "glow:watchlist/v1";

/** What a reader can record against one security. Every field is optional. */
export type WatchEntry = {
  securityKey: string;
  /** On the watchlist even without a single price set — the flag is its own fact. */
  watching: boolean;
  /** INR, the book's base currency. Null means NOT SET — never zero. */
  targetPrice: number | null;
  fairValue: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  /** Alert when the live price crosses above / below these. Null = no alert. */
  alertAbove: number | null;
  alertBelow: number | null;
  /** Free text — why this is on the list. The spec's "Why do we own it?". */
  note: string;
  /** ISO timestamp of the last edit, so the page can say how stale a view is. */
  updatedAt: string;
};

export type Watchlist = Record<string, WatchEntry>;

export const EMPTY_ENTRY = (securityKey: string): WatchEntry => ({
  securityKey,
  watching: false,
  targetPrice: null,
  fairValue: null,
  entryPrice: null,
  exitPrice: null,
  alertAbove: null,
  alertBelow: null,
  note: "",
  updatedAt: "",
});

/** A stored number is only accepted if it is a finite POSITIVE price. */
const price = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

function coerce(raw: unknown, securityKey: string): WatchEntry {
  const o = (raw ?? {}) as Partial<WatchEntry>;
  return {
    securityKey,
    watching: !!o.watching,
    targetPrice: price(o.targetPrice),
    fairValue: price(o.fairValue),
    entryPrice: price(o.entryPrice),
    exitPrice: price(o.exitPrice),
    alertAbove: price(o.alertAbove),
    alertBelow: price(o.alertBelow),
    note: typeof o.note === "string" ? o.note.slice(0, 2000) : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export function readWatchlist(): Watchlist {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Watchlist = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = coerce(v, k);
    return out;
  } catch {
    // A corrupt store is an empty one, not a crash. The reader loses their notes,
    // which is bad — but a dashboard that will not load is worse, and the
    // alternative is guessing at half-parsed JSON.
    return {};
  }
}

export function writeWatchlist(w: Watchlist): void {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode, quota */ }
}

export function readEntry(securityKey: string): WatchEntry {
  return readWatchlist()[securityKey] ?? EMPTY_ENTRY(securityKey);
}

export function writeEntry(entry: WatchEntry): Watchlist {
  const w = readWatchlist();
  const next = { ...entry, updatedAt: new Date().toISOString() };
  // An entry with nothing in it is DELETED rather than stored empty, so the
  // watchlist page counts only rows a human actually put something in.
  const empty = !next.watching && !next.note.trim()
    && next.targetPrice === null && next.fairValue === null
    && next.entryPrice === null && next.exitPrice === null
    && next.alertAbove === null && next.alertBelow === null;
  if (empty) delete w[entry.securityKey];
  else w[entry.securityKey] = next;
  writeWatchlist(w);
  return w;
}

/** Anything a reader has recorded — watched, priced or annotated. */
export const trackedKeys = (w: Watchlist): string[] => Object.keys(w).sort();

export type AlertKind = "above" | "below" | "target" | "exit";
export type Alert = { securityKey: string; kind: AlertKind; threshold: number; price: number; overBy: number };

/**
 * Alerts that a CURRENT price has tripped.
 *
 * `price` must be a live or statement mark the caller vouches for; this returns
 * nothing at all when there is no price, rather than comparing a threshold
 * against zero and firing every alert at once.
 */
export function firedAlerts(entry: WatchEntry, price: number | null): Alert[] {
  if (price === null || !(price > 0)) return [];
  const out: Alert[] = [];
  const add = (kind: AlertKind, threshold: number | null, tripped: boolean) => {
    if (threshold === null || !tripped) return;
    out.push({ securityKey: entry.securityKey, kind, threshold, price, overBy: price - threshold });
  };
  add("above", entry.alertAbove, price >= entry.alertAbove!);
  add("below", entry.alertBelow, price <= entry.alertBelow!);
  add("target", entry.targetPrice, price >= entry.targetPrice!);
  add("exit", entry.exitPrice, price >= entry.exitPrice!);
  return out;
}

export const ALERT_WORDING: Record<AlertKind, string> = {
  above: "price is at or above the alert level",
  below: "price is at or below the alert level",
  target: "price has reached the target",
  exit: "price has reached the exit level",
};

/** Upside to a target, as a percentage. Null when either side is missing. */
export const upsidePct = (price: number | null, target: number | null): number | null =>
  price !== null && price > 0 && target !== null ? ((target - price) / price) * 100 : null;

export { BASE_KEYS };
