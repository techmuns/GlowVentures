/**
 * ── PUBLIC PRICE HISTORIES, KEPT IN THIS BROWSER (Stage 10gu) ───────────────
 *
 * *"it is taking a lot of time to read all the files again and again and show
 * the return. It should automatically already be reading and storing cached
 * returns"* — the family, 22 Oct 2026.
 *
 * The Returns tab's market return needs one public price or NAV history per
 * listed holding — about 350 of them — and every visit fetched all of them
 * again. Each history that arrives is kept here (IndexedDB, this browser only),
 * so a later visit draws the figure at once from what was kept and refreshes
 * only histories older than `FRESH_MS` in the background.
 *
 * Only public market data is stored: the instrument key, the listing's own
 * name, source and dated closes. No holding, account or amount is written.
 * A failed fetch is never kept, so it is retried on the next visit. Storage can
 * be unavailable (private window, blocked site data); every call then quietly
 * does nothing and the tab fetches as before.
 */
import type { MarketHistory } from './marketReturns';

const DB = 'glow-market-history', STORE = 'histories', VERSION = 1;
/** Six hours, the history service's own cache lifetime. */
export const FRESH_MS = 6 * 3600 * 1000;

export type StoredHistory = { result: MarketHistory; fetchedAt: number };
/** The stored row: dates joined into one string and closes as a typed array clone and read far faster than arrays of strings. */
type Row = { key: string; fetchedAt: number; meta: Omit<MarketHistory, 't' | 'v'>; t: string; v: Float64Array };

let opening: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opening;
}

const decode = (row: Row): StoredHistory | null => {
  const t = row.t ? row.t.split(',') : [];
  if (!t.length || t.length !== row.v.length) return null;
  return { fetchedAt: row.fetchedAt, result: { ...row.meta, t, v: Array.from(row.v) } };
};

/** Every history this browser kept, by instrument key. Empty where storage is unavailable. */
export async function readStoredHistories(): Promise<Map<string, StoredHistory>> {
  const out = new Map<string, StoredHistory>();
  const db = await open();
  if (!db) return out;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => {
        for (const row of req.result as Row[]) {
          try { const h = decode(row); if (h?.result.ok) out.set(row.key, h); } catch { /* a malformed row is refetched */ }
        }
        resolve(out);
      };
      req.onerror = () => resolve(out);
    } catch { resolve(out); }
  });
}

/** Keep one successful history. Fire and forget; a failed write only means the next visit fetches it again. */
export async function storeHistory(key: string, history: MarketHistory, fetchedAt: number): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const { t, v, ...meta } = history;
    const row: Row = { key, fetchedAt, meta, t: t.join(','), v: Float64Array.from(v) };
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(row);
  } catch { /* storage full or blocked: nothing to do */ }
}
