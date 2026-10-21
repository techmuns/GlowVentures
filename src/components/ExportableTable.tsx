import { createContext, useId, useRef, useState, type ReactNode, type TableHTMLAttributes } from "react";
import { flushSync } from "react-dom";
import { FileSpreadsheet } from "lucide-react";
import { readTableExport } from "@/lib/tableExport";
import { prepareTableExport, setTableExporting } from "@/lib/tableExportSnapshot";

/** Include every row and available column in this table's export snapshot. */
export const TableExportAllRows = createContext(false);

export function ExportableTable({ children, exportName, ...props }: Omit<TableHTMLAttributes<HTMLTableElement>, "children"> & {
  children: ReactNode | ((allRows: boolean) => ReactNode);
  exportName?: string;
}) {
  const table = useRef<HTMLTableElement>(null);
  const busyRef = useRef(false);
  const [allRows, setAllRows] = useState(false);
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
      await prepareTableExport();
      if (!table.current) return;
      const element = table.current;
      const heading = element.closest("main")?.querySelector("h1")?.textContent ?? document.querySelector("h1")?.textContent ?? "Dashboard";
      const columns = Array.from(element.tHead?.rows[0]?.cells ?? []).slice(0, 3).map(cell => cell.textContent?.trim()).filter(Boolean).join(" · ");
      const title = exportName ?? `${heading} — ${columns || "Table"}`;
      const positions: [HTMLElement, number, number][] = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) positions.push([parent, parent.scrollTop, parent.scrollLeft]);
      let snapshot;
      try {
        flushSync(() => { setAllRows(true); setTableExporting(true); });
        if (!table.current) throw new Error("Table unavailable for export");
        snapshot = readTableExport(table.current, title);
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
  return <table {...props} ref={table} data-table-export>
    <caption className="p-2 text-left print:hidden" data-table-export-controls>
      <div className="sticky left-0 flex w-fit flex-wrap items-center gap-2">
        <button type="button" onClick={() => { void download(); }} disabled={busy}
          data-export-excel aria-describedby={error ? errorId : undefined}
          title="Export all rows regardless of filters and every column, including hidden columns and rows not yet loaded by scrolling"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-600/30 bg-emerald-500/5 px-2.5 py-1.5 text-xs font-medium text-emerald-600 ring-focus hover:bg-emerald-500/10 disabled:opacity-50">
          <FileSpreadsheet className="h-3.5 w-3.5" />{busy ? "Exporting…" : "Export Excel"}
        </button>
        {error && <span id={errorId} role="alert" className="text-xs text-loss">{error}</span>}
      </div>
    </caption>
    <TableExportAllRows.Provider value={allRows}>{typeof children === "function" ? children(allRows) : children}</TableExportAllRows.Provider>
  </table>;
}
