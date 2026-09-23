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
  /**
   * The family's intended weight for this name, as a PERCENT of the book.
   *
   * ZERO IS A REAL INSTRUCTION HERE and null is not, which is the opposite of
   * every price field above. "Hold none of this" is a decision somebody made;
   * "nobody has set a target weight" is the absence of one. They must not
   * collapse, because the figure a reader acts on — pending to invest — is the
   * GAP, and a gap measured against a defaulted zero is an instruction to sell
   * the whole position that nobody gave.
   */
  targetWeightPct: number | null;
  /**
   * The period the fair value is struck for — "FY28E", "CY2027", "Mar-29".
   * The family's own label, stored verbatim. Empty means not recorded: a fair
   * value with no year attached is a number without a horizon, and guessing
   * the current year for it would date somebody else's estimate.
   */
  fairValueRefYear: string;
  /**
   * How the fair value was arrived at — DCF, EV/EBITDA, SOTP, NAV…
   *
   * Recorded per name by a human, never derived. A previous build filled this
   * column from `VAL_METHODS[i % 5]`, which assigned "DCF" to real companies by
   * ROW ORDER — sorting the table changed which company was valued by DCF.
   */
  valuationMethod: string;
  /** Free text — why this is on the list. The spec's "Why do we own it?". */
  note: string;
  /**
   * The holding's name as its page showed it when the entry was last saved.
   *
   * A FALLBACK, never the name of record: Morning CIO's All alerts table names
   * a row by the book's own label wherever the book still holds the name, and
   * reads this only for an alert on a holding since sold — so it says what the
   * alert is about rather than showing a slug. Saving a name alone does not keep
   * an entry alive; see the emptiness rule in `writeEntry`.
   */
  name: string;
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
  targetWeightPct: null,
  fairValueRefYear: "",
  valuationMethod: "",
  note: "",
  name: "",
  updatedAt: "",
});

/** A stored number is only accepted if it is a finite POSITIVE price. */
const price = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

/**
 * A target weight, in percent. **Zero is accepted** and negative is not.
 *
 * This is deliberately NOT `price()`. A 0% target means "hold none of this",
 * which is an instruction; rejecting it as `price()` does would silently turn a
 * decision into an absence and make the gap column go blank on the one name the
 * family had most definitely decided about.
 *
 * The upper bound is 100: a single name cannot be more than the whole book, and
 * a typed 1000 is a slipped decimal rather than a conviction.
 */
const weightPct = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;

/** A short free-text label from the family. Trimmed, bounded, never defaulted. */
const label = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

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
    targetWeightPct: weightPct(o.targetWeightPct),
    fairValueRefYear: label(o.fairValueRefYear, 16),
    valuationMethod: label(o.valuationMethod, 40),
    note: typeof o.note === "string" ? o.note.slice(0, 2000) : "",
    name: label(o.name, 160),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/**
 * Parse a typed target weight. Blank is NOT SET; `0` is zero.
 *
 * Exported because the editor and any importer must agree on what counts — two
 * parsers is how "0" ends up meaning two different things on two screens.
 */
export function parseWeightPct(s: string): number | null {
  const t = s.trim().replace(/%$/, "").trim();
  if (!t) return null;
  const n = Number(t.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Valuation methods offered as suggestions in the editor.
 *
 * A SUGGESTION LIST, NOT A CLOSED SET — the input stays free text so a family
 * that values something on replacement cost can say so. It exists only to keep
 * the same method spelled the same way across names, which is what makes the
 * column groupable.
 */
export const VALUATION_METHODS = [
  "DCF", "P/E", "EV/EBITDA", "P/B", "SOTP", "NAV", "Replacement cost",
  "Dividend discount", "Transaction comparable", "Manager mark",
];

/**
 * The whole store, parsed fresh from `localStorage`.
 *
 * Two surfaces read it now, through `watchlistSnapshot` below: the Investment
 * tools card on a company page, which writes it, and Morning CIO's All alerts
 * tab, which checks every level in it against the live price (Stage 10cl). Its
 * last caller outside this file had gone once — `CompareCompanies` — and the
 * store looked dead from the outside for a release; it is read on the page the
 * family opens every morning now.
 */
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

/**
 * ── ONE SNAPSHOT, AND EVERY SURFACE HEARS A SAVE ────────────────────────────
 *
 * The company page writes a level and Morning CIO's All alerts tab checks it,
 * and those are two components that must never show two versions of one
 * store. So both read ONE cached snapshot and subscribe to it
 * (`useSyncExternalStore` in `usePriceAlerts.ts`), a save replaces the snapshot
 * and tells every subscriber, and a save in ANOTHER browser tab arrives through
 * the `storage` event — so a level typed in one tab shows on the other tab's
 * All alerts table without a reload.
 *
 * THE SNAPSHOT IS REPLACED, NEVER MUTATED. `useSyncExternalStore` compares by
 * identity, so a store edited in place would read as unchanged and nothing
 * would re-render. And it holds the edit even where `localStorage` refused the
 * write (a private window, a full quota): the reader keeps what they typed for
 * the session rather than watching it vanish on the next render.
 */
let snapshot: Watchlist | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of [...listeners]) l(); };
const onStorage = (e: StorageEvent) => {
  if (e.key !== null && e.key !== KEY) return;
  snapshot = null;
  notify();
};

export function watchlistSnapshot(): Watchlist {
  if (snapshot === null) snapshot = readWatchlist();
  return snapshot;
}

export function subscribeWatchlist(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function writeWatchlist(w: Watchlist): void {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode, quota */ }
  snapshot = w;
  notify();
}

export function readEntry(securityKey: string): WatchEntry {
  return watchlistSnapshot()[securityKey] ?? EMPTY_ENTRY(securityKey);
}

export function writeEntry(entry: WatchEntry): Watchlist {
  // A COPY — the snapshot is shared and replaced, never edited in place.
  const w = { ...watchlistSnapshot() };
  const next = { ...entry, updatedAt: new Date().toISOString() };
  // An entry with nothing in it is DELETED rather than stored empty, so the
  // All alerts table counts only levels a human actually set. A saved NAME is
  // not "something in it": it is a label for the rest, and alone it would keep
  // an empty entry alive for ever.
  const empty = !next.watching && !next.note.trim()
    && next.targetPrice === null && next.fairValue === null
    && next.entryPrice === null && next.exitPrice === null
    && next.alertAbove === null && next.alertBelow === null
    // `=== null`, not falsy: a recorded 0% target weight is a decision and the
    // entry that carries it must survive. `!next.targetWeightPct` would delete it.
    && next.targetWeightPct === null
    && !next.fairValueRefYear && !next.valuationMethod;
  if (empty) delete w[entry.securityKey];
  else w[entry.securityKey] = next;
  writeWatchlist(w);
  return w;
}

/** Anything a reader has recorded — watched, priced or annotated. */
export const trackedKeys = (w: Watchlist): string[] => Object.keys(w).sort();

// ── THE ALERT CHECK MOVED TO `priceAlerts.ts` (Stage 10cl) ──────────────────
//
// `firedAlerts` and `ALERT_WORDING` lived here and are DELETED rather than left
// beside their replacement: the old check never fired the entry price, fired on
// a statement mark with no live quote behind it, and was called by one card on
// one page. Two definitions of "has this alert fired" would be two chances for
// the stock page and Morning CIO's All alerts tab to disagree about one alert.

/**
 * What is still to be put into a name to reach its target weight — the spec's
 * "pending to invest", and the only figure on that table anybody acts on.
 *
 * `target% x book total − what is held now`. Positive is still to buy, negative
 * is overweight and to trim.
 *
 * BOTH HALVES MUST EXIST OR THIS IS NULL. A gap computed against a target
 * nobody set is a fabricated instruction, and a gap computed against an empty
 * book is the whole target masquerading as a shortfall. The caller must also
 * say WHICH total it passed: measured against a filtered subset the same target
 * weight yields a different rupee figure, and the reader cannot see the
 * denominator from the cell.
 */
export function pendingToInvest(
  targetWeightPct: number | null,
  bookTotal: number,
  marketValue: number,
): number | null {
  if (targetWeightPct === null || !(bookTotal > 0)) return null;
  return (targetWeightPct / 100) * bookTotal - marketValue;
}

/** Upside to a target, as a percentage. Null when either side is missing. */
export const upsidePct = (price: number | null, target: number | null): number | null =>
  price !== null && price > 0 && target !== null ? ((target - price) / price) * 100 : null;

export { BASE_KEYS };
