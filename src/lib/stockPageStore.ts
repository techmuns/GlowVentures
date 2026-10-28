/**
 * ── A COMPANY'S PRICE HISTORY AND RESEARCH, KEPT IN THIS BROWSER (Stage 10ik) ─
 *
 * *"When i dig deep in a stock view make these load much faster price return
 * and research taking too much time right now"* — the family, 28 Oct 2026.
 *
 * The stock page's Price & returns and Research tabs each waited on a network
 * answer every time the page was opened, even for a company read an hour ago.
 * Each answer that arrives is kept here (IndexedDB, this browser only) with the
 * time the SERVICE fetched it from its upstream, so a later visit draws it at
 * once — for as long as the service's own edge cache would still hand back the
 * same copy, and no longer (`prices.ts`, `research.ts` decide that window).
 *
 * Only public market data and the data service's own documents are stored: a
 * symbol, its dated closes and the research text. No holding, account or amount
 * is written. A failed answer is never kept. Storage can be unavailable (private
 * window, blocked site data); every call then quietly does nothing and the tab
 * fetches as before. A read never holds the page up for more than `READ_WAIT_MS`.
 */

const DB = "glow-stock-page", STORE = "answers", VERSION = 1;
/** A read that has not answered by now is treated as nothing kept. */
const READ_WAIT_MS = 400;
/** Rows older than this are deleted — past every window a caller reads them for. */
const PRUNE_AFTER_MS = 2 * 86400_000;

type Row = { key: string; at: number; value: unknown };
export type Kept<T> = { value: T; at: number };

let opening: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
        }
      };
      req.onsuccess = () => { prune(req.result); resolve(req.result); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opening;
}

/** Once per page load: drop what no caller will read again, so the store cannot grow forever. */
function prune(db: IDBDatabase) {
  try {
    const range = IDBKeyRange.upperBound(Date.now() - PRUNE_AFTER_MS);
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).index("at").openCursor(range);
    req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue(); } };
  } catch { /* nothing to prune, or storage blocked */ }
}

const settleIn = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** The kept answer under `key` and when its service fetched it, or null. */
export async function readKept<T>(key: string): Promise<Kept<T> | null> {
  const db = await Promise.race([open(), settleIn(READ_WAIT_MS, null)]);
  if (!db) return null;
  const read = new Promise<Kept<T> | null>((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as Row | undefined;
        resolve(row && typeof row.at === "number" && row.value != null ? { value: row.value as T, at: row.at } : null);
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return Promise.race([read, settleIn(READ_WAIT_MS, null)]);
}

/** Keep one successful answer. Fire and forget; a failed write only means the next visit fetches it again. */
export async function keep(key: string, value: unknown, at: number): Promise<void> {
  if (!Number.isFinite(at)) return;
  const db = await open();
  if (!db) return;
  try {
    const row: Row = { key, at, value };
    db.transaction(STORE, "readwrite").objectStore(STORE).put(row);
  } catch { /* storage full or blocked: nothing to do */ }
}
