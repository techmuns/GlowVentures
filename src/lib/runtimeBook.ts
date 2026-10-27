import baseline from '../data/readModels.json';
import { CANONICAL_BOOK_KEYS } from '../../shared/canonicalBookKeys.mjs';

type Snapshot = { schemaVersion: 1; revision: string; readerRevision: string;
  book: Record<string, unknown>; stockKeys: string[]; emptyLedger: typeof baseline.emptyLedger };
let selected: Snapshot | null = null;
export let selectedReadModels = baseline;
export let bootstrapWarning = false;
export let publicationDiscoveryPath = `${import.meta.env.BASE_URL}publication.json`;
export const hasRuntimeBook = () => selected !== null;
export function runtimeBookValue<T>(key: string, fallback: T): T {
  return selected ? selected.book[key] as T : fallback;
}
export function statementAsset(path: string): string {
  return selected ? `${import.meta.env.BASE_URL}api/statement-data/${selected.revision}/${path}` : `${import.meta.env.BASE_URL}${path}`;
}
export function statementPreviewAsset(file: string): string {
  return selected ? statementAsset(`statement-previews/${encodeURIComponent(file)}`)
    : `${import.meta.env.BASE_URL}api/statement-previews/${encodeURIComponent(file)}`;
}
export function validRuntimeSnapshot(value: unknown): value is Snapshot {
  const s = value as Snapshot;
  return !!s && s.schemaVersion === 1 && /^[a-f0-9]{20}$/.test(s.revision)
    && s.readerRevision === baseline.readerRevision && !!s.book && typeof s.book === 'object'
    && Object.keys(s.book).sort().join() === [...CANONICAL_BOOK_KEYS].sort().join()
    && Array.isArray(s.stockKeys) && s.stockKeys.every(k => typeof k === 'string' && /^[a-z0-9-]+$/.test(k))
    && !!s.emptyLedger && Array.isArray(s.emptyLedger.txns);
}
export async function bootstrapRuntimeBook(): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/statement-data`, {
      cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 204 || !response.headers.get('Content-Type')?.includes('application/json')) return;
    if (!response.ok) throw Error('Latest statements are unavailable');
    const snapshot: unknown = await response.json();
    if (!validRuntimeSnapshot(snapshot)) throw Error('Incompatible or incomplete statement version');
    selected = snapshot;
    selectedReadModels = { ...baseline, revision: snapshot.revision, stockKeys: snapshot.stockKeys, emptyLedger: snapshot.emptyLedger };
    publicationDiscoveryPath = `${import.meta.env.BASE_URL}api/statement-data?status=1`;
  } catch { bootstrapWarning = true; }
}
