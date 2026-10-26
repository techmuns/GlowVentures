import { useCallback, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { navigationMemory } from './navigationMemory';

type ViewState = string | Set<string>;

/** Restore an entry before painting; a fresh query entry inherits the current view. */
export function useNavigationState<T extends ViewState>(name: string, initial: T | (() => T), allowed?: readonly string[]): [T, Dispatch<SetStateAction<T>>] {
  const location = useLocation(), action = useNavigationType();
  const entry = location.key, slot = `${location.pathname}:${name}`;
  const [fallback] = useState(initial);
  const read = () => navigationMemory.read(entry, slot, raw => {
    if (fallback instanceof Set) return Array.isArray(raw) && raw.every(s => typeof s === 'string') ? new Set(raw) as T : null;
    return typeof raw === 'string' && (!allowed || allowed.includes(raw)) ? raw as T : null;
  });
  let [state, setState] = useState(() => ({ entry, value: read() ?? fallback }));
  if (state.entry !== entry) {
    const reset = typeof initial === 'function' ? initial() : initial;
    state = { entry, value: read() ?? (action === 'POP' ? reset : state.value) };
    setState(state);
  }
  const value = state.value;
  useLayoutEffect(() => {
    navigationMemory.write(entry, slot, value instanceof Set ? [...value] : value);
  }, [entry, slot, value]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    setState(current => ({ ...current, value: typeof next === 'function' ? next(current.value) : next }));
  }, []);
  return [value, setValue];
}
