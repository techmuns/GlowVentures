import { useCallback, useLayoutEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { isTableExporting } from './tableExportSnapshot';
import { navigationMemory, validNavigationState } from './navigationMemory';

type ViewState = string | Set<string>;
export type NavigationCodec<T> = { read: (raw: unknown) => T | null; write: (value: T) => unknown };
export const booleanNavigation: NavigationCodec<boolean> = { read: raw => typeof raw === 'boolean' ? raw : null, write: value => value };
export const numberNavigation: NavigationCodec<number> = { read: raw => typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null, write: value => value };
export const nullableStringNavigation: NavigationCodec<string | null> = { read: raw => typeof raw === 'string' ? raw : null, write: value => value };
export const nullableStringsNavigation: NavigationCodec<string[] | null> = { read: raw => Array.isArray(raw) && raw.every(s => typeof s === 'string') ? raw : null, write: value => value };

/** Typed presentation values only: fetched records, drafts and credentials stay outside history. */
export function useNavigationValue<T>(name: string, initial: T | (() => T), codec: NavigationCodec<T>): [T, Dispatch<SetStateAction<T>>, boolean] {
  const location = useLocation(), action = useNavigationType();
  const entry = location.key, slot = `${location.pathname}:${name}`;
  const reset = () => typeof initial === 'function' ? (initial as () => T)() : initial;
  const read = () => navigationMemory.read(entry, slot, codec.read);
  const [stored, setState] = useState(() => { const saved = read(); return { entry, slot, value: saved ?? reset(), restored: saved !== null }; });
  let state = stored;
  if (state.entry !== entry || state.slot !== slot) {
    const saved = read();
    state = { entry, slot, value: saved ?? (action === 'POP' || state.slot !== slot ? reset() : state.value), restored: saved !== null };
    setState(state);
  }
  const value = state.value;
  useLayoutEffect(() => { if (!isTableExporting()) navigationMemory.write(entry, slot, codec.write(value)); }, [entry, slot, value, codec]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    setState(current => ({ ...current, value: typeof next === 'function' ? (next as (previous: T) => T)(current.value) : next }));
  }, []);
  return [value, setValue, state.restored];
}

/** Restore an entry before painting; a fresh query entry inherits the current view. */
export function useNavigationState<T extends ViewState>(name: string, initial: T | (() => T), allowed?: readonly string[]): [T, Dispatch<SetStateAction<T>>] {
  const [fallback] = useState(initial);
  const codec = useMemo<NavigationCodec<T>>(() => ({
    read: raw => fallback instanceof Set
      ? Array.isArray(raw) && raw.every(s => typeof s === 'string') ? new Set(raw) as T : null
      : typeof raw === 'string' ? raw as T : null,
    write: value => value instanceof Set ? [...value] : value,
  }), [fallback]);
  const [stored, setValue] = useNavigationValue(name, initial, codec);
  const options = useMemo(() => allowed ? new Set(allowed) : undefined, [allowed]);
  const value = validNavigationState(stored, typeof initial === 'function' ? initial() : initial, options);
  if (value !== stored) setValue(value);
  return [value, setValue];
}
