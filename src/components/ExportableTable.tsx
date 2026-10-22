import { createContext, useId, useRef, useState, type ReactNode, type TableHTMLAttributes } from "react";
import { createPortal, flushSync } from "react-dom";
import { FileSpreadsheet, Upload, Pencil } from "lucide-react";
import { TableEditing } from "./TableNumberInput";
import { TableInputDialog } from "./TableInputDialog";
import { refreshTableInputs, useTableInputs } from "@/lib/tableInputStore";
import type { InputChange } from "@/lib/tableInputs";
import { readTableExport } from "@/lib/tableExport";
import { prepareTableExport, setTableExporting, useTableExporting } from "@/lib/tableExportSnapshot";

/** Include every row and available column in this table's export snapshot. */
export const TableExportAllRows = createContext(false);

export function ExportableTable({ children, exportName, controlsHost, ...props }: Omit<TableHTMLAttributes<HTMLTableElement>, "children"> & {
  children: ReactNode | ((allRows: boolean) => ReactNode);
  exportName?: string;
  /**
   * A toolbar the table's card already draws, to hold the Export Excel control
   * instead of a caption row of its own above the header (Stage 10gy: *"there's
   * a lot of empty space in this area, realign export excel in above empty
   * space so that there is more space to see the below table"*). The control
   * names its table (`data-export-for` ↔ `data-table-export-id`), so a check
   * still finds each table's one control. Omit it for the caption row.
   */
  controlsHost?: HTMLElement | null;
}) {
  const exportId = useId();
  const inputState = useTableInputs();
  const inputStateRef = useRef(inputState);
  inputStateRef.current = inputState;
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<"inputs" | InputChange[] | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [dialogIds, setDialogIds] = useState<string[]>([]);
  const inputIds = () => Array.from(table.current?.querySelectorAll<HTMLElement>("[data-input-records]") ?? [])
    .flatMap(row => JSON.parse(row.dataset.inputRecords ?? "[]") as string[]);
  const table = useRef<HTMLTableElement>(null);
  const busyRef = useRef(false);
  const [allRows, setAllRows] = useState(false);
  // Keep ancestor rows mounted when an expanded/nested table is exported and
  // removing a filter moves its parent beyond the current scroll window.
  const snapshotRows = useTableExporting() || allRows;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const download = async () => {
    if (!table.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      // Load ExcelJS only on demand. Snapshot the full table synchronously and
      // restore its scroll window before the workbook's asynchronous encoding.
      const { downloadTableExcel } = await import("@/lib/exportTableExcel");
      if (inputStateRef.current.status === "ready") await refreshTableInputs();
      await prepareTableExport();
      if (!table.current) return;
      const element = table.current;
      const heading = element.closest("main")?.querySelector("h1")?.textContent ?? document.querySelector("h1")?.textContent ?? "Dashboard";
      const columns = Array.from(element.tHead?.rows[0]?.cells ?? []).slice(0, 3).map(cell => cell.textContent?.trim()).filter(Boolean).join(" · ");
      const title = exportName ?? `${heading} — ${columns || "Table"}`;
      const positions: [HTMLElement, number, number][] = [];
      for (const port of document.querySelectorAll<HTMLElement>("*")) {
        if (port.scrollTop || port.scrollLeft) positions.push([port, port.scrollTop, port.scrollLeft]);
      }
      for (let parent = element.parentElement; parent; parent = parent.parentElement) positions.push([parent, parent.scrollTop, parent.scrollLeft]);
      let snapshot;
      try {
        flushSync(() => { setAllRows(true); setTableExporting(true); });
        if (!table.current) throw new Error("Table unavailable for export");
        snapshot = readTableExport(table.current, title);
        const currentInputs = inputStateRef.current;
        if (currentInputs.loaded) {
          const ids = new Set(inputIds());
          // Analytical tables without a source row still offer the same book
          // input sheets, so every table has the same correction workflow.
          const related = currentInputs.catalog.filter(r => ids.has(r.id) || (!!r.parentId && ids.has(r.parentId))
            || (r.kind === "private-capital" && ids.has(r.id.replace(/^private-capital:/, "holding:"))));
          const calls = related.some(r => r.kind !== "property" && r.kind !== "owner") ? currentInputs.catalog.filter(r => r.kind === "call" && !ids.has(r.id)) : [];
          snapshot.inputs = related.length ? [...related, ...calls] : currentInputs.catalog;
        }
      } finally {
        flushSync(() => { setTableExporting(false); setAllRows(false); });
        positions.forEach(([parent, top, left]) => { parent.scrollTop = top; parent.scrollLeft = left; });
      }
      await downloadTableExcel(snapshot);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("sheet size limit") ? cause.message : "Excel download failed. Try Export Excel again.");
    } finally {
      busyRef.current = false; setBusy(false);
    }
  };
  const importFile = async (file?: File) => {
    if (!file || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setMessage("");
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 12_000_000) throw new Error("Upload the downloaded .xlsx file, under 12 MB.");
      const { readInputWorkbook } = await import("@/lib/tableInputExcel");
      const changes = await readInputWorkbook(await file.arrayBuffer(), inputStateRef.current.catalog);
      if (changes.length) setDialog(changes); else setMessage("No number changes found.");
    } catch (e) { setError((e as Error).message); }
    finally { busyRef.current = false; setBusy(false); if (upload.current) upload.current.value = ""; }
  };
  const controls = <>
    <button type="button" onClick={() => { void download(); }} disabled={busy || inputState.status === "loading"}
      data-export-excel data-export-for={exportId} aria-describedby={error ? errorId : undefined}
      title="Export all rows regardless of filters and every column, including hidden columns and rows not yet loaded by scrolling"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-600/30 bg-emerald-500/5 px-2.5 py-1.5 text-xs font-medium text-emerald-600 ring-focus hover:bg-emerald-500/10 disabled:opacity-50">
      <FileSpreadsheet className="h-3.5 w-3.5" />{busy ? "Please wait…" : "Export Excel"}
    </button>
    <button type="button" onClick={() => setEditing(value => !value)} disabled={busy || inputState.status !== "ready"} aria-pressed={editing}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-600 px-2.5 py-1.5 text-xs ring-focus disabled:opacity-50" data-edit-numbers>
      <Pencil className="h-3.5 w-3.5" />{editing ? "Done editing" : "Edit numbers"}
    </button>
    <button type="button" onClick={() => { setDialogIds(inputIds()); setDialog("inputs"); }} disabled={busy} className="rounded px-1 text-xs text-slate-400 ring-focus" data-all-inputs>All inputs</button>
    <button type="button" onClick={() => upload.current?.click()} disabled={busy || inputState.status !== "ready"}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-600 px-2.5 py-1.5 text-xs ring-focus disabled:opacity-50" data-upload-excel>
      <Upload className="h-3.5 w-3.5" />Upload Excel
    </button>
    <input ref={upload} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Upload corrected Excel" className="hidden" onChange={e => { void importFile(e.target.files?.[0]); }} />
    <span className="text-[10px] text-slate-500">Keep Excel format; change numbers only.</span>
    {editing && <span className="text-xs text-slate-500">Edit detail rows in INR. For other inputs, use All inputs. Totals update automatically.</span>}
    {inputState.status === "error" && <button type="button" onClick={() => { void refreshTableInputs(); }} className="rounded text-xs text-loss ring-focus" title={inputState.error}>Numbers unavailable · Retry</button>}
    {message && <span role="status" className="text-xs text-emerald-600">{message}</span>}
    {error && <span id={errorId} role="alert" className="text-xs text-loss">{error}</span>}
  </>;
  return <><table {...props} ref={table} data-table-export data-table-export-id={exportId} data-table-export-name={exportName}>
    {controlsHost === undefined ? <caption className="p-2 text-left print:hidden" data-table-export-controls>
      <div className="sticky left-0 flex w-fit max-w-[calc(100vw-5rem)] flex-wrap items-center gap-2">{controls}</div>
    </caption> : controlsHost && createPortal(<span className="inline-flex flex-wrap items-center gap-2 print:hidden" data-table-export-controls>{controls}</span>, controlsHost)}
    <TableEditing.Provider value={editing}><TableExportAllRows.Provider value={snapshotRows}>{typeof children === "function" ? children(snapshotRows) : children}</TableExportAllRows.Provider></TableEditing.Provider>
  </table>{dialog && <TableInputDialog close={() => setDialog(null)} recordIds={dialogIds} changes={Array.isArray(dialog) ? dialog : undefined} complete={() => setMessage("Excel changes saved and synced.")} />}</>;
}
