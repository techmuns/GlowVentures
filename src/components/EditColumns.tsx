import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Columns3, Search, X } from "lucide-react";
import type { TableView } from "@/lib/tableView";

export type ColumnLabel = { label: string; detail?: string };
const words = (id: string) => id.replace(/^ret:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_:-]/g, " ");

export function EditColumns({ view, labels = {} }: { view: TableView; labels?: Readonly<Record<string, ColumnLabel>> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = button.current?.getBoundingClientRect();
      if (!box) return;
      const height = Math.min(440, window.innerHeight - 24);
      setPosition({ left: Math.max(12, Math.min(box.right - 320, window.innerWidth - 332)),
        top: Math.max(12, box.bottom + height > window.innerHeight - 12 ? box.top - height - 6 : box.bottom + 6) });
    };
    place();
    search.current?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const allLabels = { ...viewLabels.get(view.storageKey), ...labels };
  const items = view.availableOrder.filter((id) => `${allLabels[id]?.label ?? words(id)} ${allLabels[id]?.detail ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button ref={button} type="button" data-edit-columns={view.storageKey} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setQuery(""); setOpen((value) => !value); }}
      className="ring-focus inline-flex items-center gap-1.5 rounded border border-ink-600 bg-ink-900/40 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-champagne-400/50 hover:text-champagne-400">
      <Columns3 className="h-3.5 w-3.5" />Edit Columns
    </button>
    {open && createPortal(<div ref={panel} role="dialog" aria-label="Edit Columns" data-column-editor={view.storageKey}
      style={{ position: "fixed", ...position, width: "min(320px, calc(100vw - 24px))", maxHeight: "min(440px, calc(100vh - 24px))", zIndex: 10000 }}
      className="flex flex-col overflow-hidden rounded-lg border border-ink-600 bg-ink-800 text-slate-200 shadow-xl">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2.5">
        <span className="text-sm font-semibold">Edit Columns</span>
        <button type="button" aria-label="Close Edit Columns" onClick={() => { setOpen(false); button.current?.focus(); }} className="ring-focus rounded p-1"><X className="h-4 w-4" /></button>
      </div>
      <div className="relative m-3 mb-1">
        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
        <input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find a column" placeholder="Find a column…"
          className="ring-focus w-full rounded border border-ink-600 bg-ink-900 py-1.5 pl-7 pr-2 text-xs" />
      </div>
      <div className="overflow-y-auto p-2">
        {items.map((id) => <label key={id} className="flex cursor-pointer items-start gap-2.5 rounded px-2 py-2 hover:bg-ink-700/50">
          <input type="checkbox" data-column-checkbox={id} checked={!view.hidden.includes(id)} disabled={id === view.fixed}
            onChange={(event) => view.setVisible(id, event.target.checked)} className="mt-0.5 accent-[#b69b58]" />
          <span className="text-xs"><span>{allLabels[id]?.label ?? words(id)}</span>
            {id === view.fixed && <span className="ml-2 text-slate-500">Always shown</span>}
            {allLabels[id]?.detail && <span className="mt-0.5 block text-[10px] text-slate-500">{allLabels[id].detail}</span>}
          </span>
        </label>)}
        {!items.length && <p className="px-2 py-3 text-xs text-slate-500">No matching columns</p>}
      </div>
      <div className="flex items-center justify-between border-t border-ink-700 px-3 py-2 text-xs">
        <span className="text-slate-500">{view.order.length} of {view.columns.length} shown</span>
        <button type="button" onClick={view.reset} className="ring-focus rounded px-2 py-1 text-champagne-400">Reset columns</button>
      </div>
    </div>, document.body)}
  </>;
}

const viewLabels = new Map<string, Record<string, ColumnLabel>>();
export function rememberColumnLabels(key: string, labels: Record<string, ColumnLabel>) {
  viewLabels.set(key, { ...viewLabels.get(key), ...labels });
}

/** Keep the same small control beside every configurable table, outside its horizontal scroller. */
export function AutoEditColumns({ view, row, labels }: { view: TableView; row: React.RefObject<HTMLTableRowElement>; labels: Record<string, ColumnLabel> }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    rememberColumnLabels(view.storageKey, labels);
    const table = row.current?.closest("table");
    if (!table) return;
    table.setAttribute("data-table-view", view.storageKey);
    if (view.manualEditor) return;
    const parent = table.parentElement;
    if (!parent) return;
    const scrolling = /auto|scroll/.test(getComputedStyle(parent).overflowX);
    const anchor = scrolling ? parent : table;
    const node = document.createElement("div");
    node.className = "flex justify-end px-3 py-2";
    node.setAttribute("data-column-toolbar", view.storageKey);
    anchor.parentElement?.insertBefore(node, anchor);
    setHost(node);
    return () => { node.remove(); };
  }, [view.storageKey, view.manualEditor]);
  // Headers can change with a tab, while the stored labels must keep names for returning columns.
  useLayoutEffect(() => { rememberColumnLabels(view.storageKey, labels); });
  return host ? createPortal(<EditColumns view={view} labels={labels} />, host) : null;
}

export function columnText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(columnText).join("");
  if (node && typeof node === "object" && "props" in node) return columnText((node.props as { children?: ReactNode }).children);
  return "";
}
