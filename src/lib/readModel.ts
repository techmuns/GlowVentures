import manifest from "../data/readModels.json";
import { requestDeadline } from "./requestDeadline";

// Content-addressed URLs keep an open tab on its own deployment's book. Failed
// reads are evicted so another visit can recover; concurrent cards share a read.
const reads = new Map<string, Promise<unknown | null>>();
export const readModelBase = `${import.meta.env?.BASE_URL ?? "/"}views/${manifest.revision}`;
export function readModel<T>(path: string): Promise<T | null> {
  let pending = reads.get(path);
  if (!pending) {
    pending = (async () => {
      const deadline = requestDeadline(15_000);
      try {
        const response = await fetch(`${readModelBase}/${path}`, { signal: deadline.signal });
        if (!response.ok) return null;
        return await response.json();
      } catch { return null; }
      finally { deadline.dispose(); }
    })().then((value) => { if (value === null) reads.delete(path); return value; });
    reads.set(path, pending);
  }
  return pending as Promise<T | null>;
}
