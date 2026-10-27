/** Intersect explicit comparison picks with the available choices, retaining order. */
export function validNavigationPicks(value: string[] | null, allowed: ReadonlySet<string>, limit: number): string[] | null {
  if (value === null) return null;
  const kept = [...new Set(value)].filter(key => allowed.has(key)).slice(0, limit);
  return kept.length === value.length && kept.every((key, i) => key === value[i]) ? value : kept;
}

/** Presentation snapshots belong to a browser history entry, never the book. */
export function validNavigationState<T extends string | Set<string>>(value: T, fallback: T, allowed?: ReadonlySet<string>): T {
  if (!allowed) return value;
  if (value instanceof Set) {
    const kept = [...value].filter(item => allowed.has(item));
    return kept.length === value.size ? value : new Set(kept) as T;
  }
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

export function createNavigationMemory(storage: () => Pick<Storage, 'getItem' | 'setItem'> | null, limit = 80) {
  const key = 'glow:navigation:v1';
  const entries = new Map<string, Map<string, unknown>>();
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage()?.getItem(key);
      const parsed: unknown = raw && raw.length < 1_000_000 ? JSON.parse(raw) : null;
      if (!Array.isArray(parsed)) return;
      for (const row of parsed.slice(-limit)) {
        if (!Array.isArray(row) || typeof row[0] !== 'string' || !Array.isArray(row[1])) continue;
        const slots = row[1].filter((s: unknown): s is [string, unknown] => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string');
        entries.set(row[0], new Map(slots));
      }
    } catch { /* A blocked or stale store must not prevent navigation. */ }
  };
  return {
    read<T>(entry: string, slot: string, parse: (raw: unknown) => T | null): T | null {
      load();
      return parse(entries.get(entry)?.get(slot));
    },
    write(entry: string, slot: string, value: unknown) {
      load();
      const slots = entries.get(entry) ?? new Map<string, unknown>();
      slots.set(slot, value);
      entries.delete(entry); entries.set(entry, slots);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
      try { storage()?.setItem(key, JSON.stringify([...entries].map(([id, values]) => [id, [...values]]))); }
      catch { /* Keep this tab's in-memory snapshot if storage is unavailable. */ }
    },
  };
}

export const navigationMemory = createNavigationMemory(() => {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
});

/** Full document navigations also need distinct keys; reload keeps the same one. */
export function initializeNavigationEntry() {
  try {
    if (!window.history.state?.key) window.history.replaceState({ ...window.history.state, key: crypto.randomUUID() }, '');
  } catch { /* Leave history handling to the router where the browser blocks it. */ }
}
