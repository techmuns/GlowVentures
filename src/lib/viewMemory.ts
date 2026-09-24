// ── ONE BROWSER MEMORY FOR HOW A READER ARRANGED A SCREEN ──────────────────
//
// *"when i am drag and drop rearranging the coloumns then the system needs to
//  remeber the exact position and save it even when i am changing the tab i will
//  not keep doing the same configuration again"*
//
// A column order, a sort, which returns a table shows: each is a preference
// about a screen, like the nav's width, so it lives in `localStorage` and never
// reaches `glowData.ts`. What this module adds is that every screen reads it the
// SAME way:
//
//   - READ BEFORE THE FIRST PAINT. A table that reads its order in an effect
//     paints the declared order first and then jumps to the saved one — which
//     reads as the dashboard forgetting, on every page load.
//   - ONE COPY PER KEY. Two tables on one key (a panel drawn under each open
//     row, a tab that remounts) read one value, and a change in one is seen by
//     the others at once rather than on their next mount.
//   - AND ANOTHER BROWSER TAB'S CHANGE ARRIVES, through the `storage` event.
//
// Every read and write is wrapped: the accessor throws in a private window, and
// a blocked store must leave the screen on its defaults rather than blank. A
// write that cannot be stored is still kept for this page load.
import { useCallback, useSyncExternalStore } from "react";

type Parse<T> = (raw: unknown) => T | null;

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
let watching = false;

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

function readRaw(key: string): unknown {
  try {
    const s = storage()?.getItem(key);
    return s ? JSON.parse(s) as unknown : null;
  } catch {
    return null;   // private mode, or a value this build cannot parse
  }
}

/**
 * The value saved under `key`, parsed once and then held — so two reads of an
 * unchanged key return the SAME object, which `useSyncExternalStore` requires.
 * `null` where nothing (usable) is saved.
 */
export function readMemory<T>(key: string, parse: Parse<T>): T | null {
  if (!cache.has(key)) cache.set(key, parse(readRaw(key)));
  return cache.get(key) as T | null;
}

/** Save `value` under `key` and tell every screen reading it. */
export function writeMemory<T>(key: string, value: T): void {
  cache.set(key, value);
  try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* private mode: kept for this page load */ }
  listeners.get(key)?.forEach((l) => l());
}

/** Drop what is held for `key`, so the next read goes back to storage. */
function forget(key: string) {
  cache.delete(key);
  listeners.get(key)?.forEach((l) => l());
}

function watchOtherTabs() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("storage", (e) => {
    // `key === null` is a whole-store clear.
    const keys = e.key == null ? [...new Set([...cache.keys(), ...listeners.keys()])] : [e.key];
    for (const k of keys) if (cache.has(k) || listeners.has(k)) forget(k);
  });
}

export function subscribeMemory(key: string, listener: () => void): () => void {
  watchOtherTabs();
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}

/** A saved preference, read before the first paint and kept in step everywhere. */
export function useMemory<T>(key: string, parse: Parse<T>): T | null {
  const subscribe = useCallback((l: () => void) => subscribeMemory(key, l), [key]);
  const get = () => readMemory(key, parse);
  return useSyncExternalStore(subscribe, get, get);
}

/** For the suites: forget everything held, as a fresh page load would. */
export function resetMemoryForTests() {
  cache.clear();
}
