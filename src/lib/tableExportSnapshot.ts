import { useEffect, useRef, useSyncExternalStore } from "react";

// A synchronous, read-only render of the current table's complete data. Never
// write filters/preferences or wait for network work while this is enabled.
let exporting = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const isTableExporting = () => exporting;
export function setTableExporting(value: boolean) {
  exporting = value;
  listeners.forEach(listener => listener());
}
export function useTableExporting() {
  return useSyncExternalStore(subscribe, isTableExporting, () => false);
}

/** Bypass a display filter for the snapshot without changing its stored value. */
export function useTableExportFilter<T>(value: T, unfiltered: T): T {
  return useTableExporting() ? unfiltered : value;
}

/** Export may widen data, but must not remount the table or discard its state. */
export function useTableExportIdentity<T>(value: T): T {
  const display = useRef(value);
  if (!useTableExporting()) display.current = value;
  return display.current;
}

const preparations = new Set<() => Promise<unknown>>();
/** Resolve scope-dependent read models before the synchronous snapshot. */
export function usePrepareTableExport(prepare: () => Promise<unknown>) {
  const current = useRef(prepare);
  current.current = prepare;
  useEffect(() => {
    const run = () => current.current();
    preparations.add(run);
    return () => { preparations.delete(run); };
  }, []);
}
export async function prepareTableExport() {
  await Promise.all([...preparations].map(prepare => prepare()));
}
