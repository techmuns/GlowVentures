import { useState, type ReactNode } from "react";

export function useTablePagination(total: number, resetKey: string, pageSize = 50) {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const [size, setSize] = useState<number | "all">(pageSize);
  if (state.key !== resetKey) setState({ key: resetKey, page: 0 });
  const limit = size === "all" ? Math.max(1, total) : size;
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = state.key === resetKey ? Math.min(state.page, pages - 1) : 0;
  const start = page * limit;
  const move = (next: number) => setState({ key: resetKey, page: next });
  return { total, pageSize, size, setSize, limit, pages, page, start, move };
}

export function TablePageControls({ pagination: p, columns }: { pagination: ReturnType<typeof useTablePagination>; columns: number }) {
  const { total, pageSize, size, setSize, limit, pages, page, start, move } = p;
  return total > pageSize ? <tr data-table-pagination><td colSpan={columns} className="border-t border-ink-700 px-4 py-3">
      <nav aria-label="Table pages" className="sticky left-4 flex w-fit max-w-full flex-wrap items-center gap-6 text-xs text-slate-400">
        <span>{start + 1}–{Math.min(start + limit, total)} of {total.toLocaleString("en-IN")}</span>
        <span className="flex items-center gap-3">
          <select aria-label="Rows per page" value={size} onChange={(e) => { setSize(e.target.value === "all" ? "all" : Number(e.target.value)); move(0); }} className="rounded border border-ink-700 bg-ink-900 px-2 py-1.5">
            <option value={50}>50 rows</option><option value={100}>100 rows</option><option value="all">All rows</option>
          </select>
          <button type="button" aria-label="Previous table page" disabled={page === 0} onClick={() => move(page - 1)} className="rounded border border-ink-700 px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" aria-label="Next table page" disabled={page === pages - 1} onClick={() => move(page + 1)} className="rounded border border-ink-700 px-3 py-1.5 disabled:opacity-40">Next</button>
        </span>
      </nav>
    </td></tr> : null;
}

/** Totals and sorting belong to the full collection; only visible rows mount. */
export function PagedTableBody<T>({ rows, children, columns, resetKey, pageSize = 50, className, body = true }: {
  rows: readonly T[]; children: (row: T, index: number) => ReactNode;
  columns: number; resetKey: string; pageSize?: number; className?: string; body?: boolean;
}) {
  const pagination = useTablePagination(rows.length, resetKey, pageSize);
  const { start, limit } = pagination;
  const content = <>
    {rows.slice(start, start + limit).map((row, i) => children(row, start + i))}
    <TablePageControls pagination={pagination} columns={columns} />
  </>;
  return body ? <tbody className={className} data-paged-rows={rows.length}>{content}</tbody> : content;
}
