import { useNavigationValue, type NavigationCodec } from "@/lib/useNavigationState";
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { readNavigationWindow, type NavigationWindow } from "@/lib/navigationMemory";
import { TableExportAllRows } from "./ExportableTable";
import { isTableExporting, useTableExportIdentity } from "@/lib/tableExportSnapshot";

const windowCodec: NavigationCodec<NavigationWindow> = { read: readNavigationWindow, write: value => value };

/** Sorting, totals and exports use the full collection; scrolling only appends rows. */
export function useInfiniteTable(navigationKey: string, total: number, resetKey: string, batchSize = 50) {
  // The window is presentation state as well: restore enough rows before scroll.
  const displayKey = useTableExportIdentity(resetKey);
  // One bounded slot per table and entry; changing a filter replaces its window.
  const [state, setState] = useNavigationValue(`table-window:${navigationKey}`, () => ({ key: displayKey, limit: batchSize }), windowCodec);
  if (state.key !== displayKey) setState({ key: displayKey, limit: batchSize });
  const limit = state.key === displayKey ? state.limit : batchSize;
  const shown = Math.min(total, Math.max(batchSize, limit));
  const loadMore = useCallback(() => {
    setState(current => current.key === displayKey
      ? { ...current, limit: Math.min(total, Math.max(batchSize, current.limit) + batchSize) } : current);
  }, [setState, total, batchSize, displayKey]);
  return { total, shown, hasMore: shown < total, loadMore, resetKey };
}

/** A full-width row is visible at any horizontal position in a wide table. */
export function InfiniteTableEnd({ scroll, columns }: { scroll: ReturnType<typeof useInfiniteTable>; columns: number }) {
  const allRows = useContext(TableExportAllRows);
  const end = useRef<HTMLTableRowElement>(null);
  const previousKey = useRef(scroll.resetKey);
  const { total, shown, hasMore, loadMore, resetKey } = scroll;

  useLayoutEffect(() => {
    if (isTableExporting()) return;
    if (previousKey.current === resetKey) return;
    previousKey.current = resetKey;
    // Reset only this table's vertical scroll, keeping its horizontal position.
    for (let parent = end.current?.parentElement; parent; parent = parent.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
        parent.scrollTop = 0;
        break;
      }
    }
  }, [resetKey]);

  useEffect(() => {
    const target = end.current;
    if (allRows || !hasMore || !target || typeof IntersectionObserver === "undefined") return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (active && entries.some(entry => entry.isIntersecting)) {
        active = false;
        observer.disconnect();
        loadMore();
      }
    }, { rootMargin: "0px 0px 200px 0px" });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); };
  }, [allRows, hasMore, shown, loadMore, resetKey]);

  if (allRows) return null;
  return <tr ref={end} data-table-scroll-end data-loaded-rows={shown} data-total-rows={total}>
    <td colSpan={columns} className="border-t border-ink-700 px-4 py-2 text-xs text-slate-500">
      <div className="sticky left-4 flex w-fit items-center gap-3">
        <span role="status" aria-live="polite">{shown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} rows</span>
        {hasMore && <button type="button" onClick={loadMore} className="rounded text-champagne-400 ring-focus hover:underline" aria-label="Load more table rows">Load more</button>}
      </div>
    </td>
  </tr>;
}

export function InfiniteTableBody<T>({ navigationKey, rows, children, columns, resetKey, batchSize = 50, className, empty }: {
  navigationKey: string; rows: readonly T[]; children: (row: T, index: number) => ReactNode;
  columns: number; resetKey: string; batchSize?: number; className?: string; empty?: ReactNode;
}) {
  const allRows = useContext(TableExportAllRows);
  const scroll = useInfiniteTable(navigationKey, rows.length, resetKey, batchSize);
  return <tbody className={className} data-infinite-rows={rows.length}>
    {rows.length ? rows.slice(0, allRows ? rows.length : scroll.shown).map(children) : empty}
    <InfiniteTableEnd scroll={scroll} columns={columns} />
  </tbody>;
}
