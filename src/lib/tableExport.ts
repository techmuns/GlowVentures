/** A table snapshot, independent of React, scrolling and workbook generation. */
import type { InputChange, InputRecord } from "./tableInputs";
export type TableExportCell = {
  text: string;
  value?: string | number;
  format?: string;
  numeric?: boolean;
  colSpan?: number;
  rowSpan?: number;
  note?: string;
  hyperlink?: string;
  input?: InputChange;
};
export type TableExportRow = { cells: TableExportCell[]; kind: "header" | "body" | "footer" };
export type TableExport = { title: string; url: string; rows: TableExportRow[]; inputs?: InputRecord[]; nested?: TableExport[]; context?: string; parentRow?: number };

/** Only whole numeric cells qualify. Dates, identifiers and mixed captions stay text. */
export function excelCellValue(cell: TableExportCell): { value: string | number; format?: string } {
  if (cell.value !== undefined) return { value: cell.value, format: cell.format };
  if (!cell.numeric) return { value: cell.text };
  const text = cell.text.trim().replace(/−/g, "-");
  const match = /^(\()?([+-])?\s*(₹|US\$|\$|€|£)?\s*([\d,]+(?:\.\d+)?)\s*(Cr|L|K|M|B|%)?(\))?$/i.exec(text);
  if (!match || Boolean(match[1]) !== Boolean(match[6])) return { value: cell.text };
  if (!match[3] && !match[5] && (/^0\d/.test(match[4]) || match[4].replace(/\D/g, "").length > 15)) return { value: cell.text };
  const value = Number(match[4].replace(/,/g, ""));
  if (!Number.isFinite(value)) return { value: cell.text };
  const unit = match[5]?.toLowerCase();
  const scale = ({ cr: 1e7, l: 1e5, k: 1e3, m: 1e6, b: 1e9, "%": .01 } as Record<string, number>)[unit ?? ""] ?? 1;
  const decimals = match[4].split(".")[1]?.length ?? 0;
  const precision = decimals ? "." + "0".repeat(decimals) : "";
  const currency = match[3];
  return {
    value: Number(`${value}e${Math.log10(scale)}`) * (match[1] || match[2] === "-" ? -1 : 1),
    format: unit === "%" ? `0${precision}%` : `${currency ? `"${currency}"` : ""}#,##0${precision}`,
  };
}

const SKIP = "svg, table, [data-export-ignore], [data-table-export-controls], [data-col-grip], [role=tooltip], [hidden], .sr-only";
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement) || node.matches(SKIP)) return "";
  if (node.hasAttribute("data-export-value")) return node.getAttribute("data-export-value") ?? "";
  if (node instanceof HTMLInputElement) return node.type === "checkbox" ? (node.checked ? "Yes" : "No") : node.value;
  if (node instanceof HTMLTextAreaElement) return node.value;
  if (node instanceof HTMLSelectElement) return node.selectedOptions[0]?.text ?? "";
  if (node.tagName === "BR") return "\n";
  const gap = node.classList.contains("flex-col") ? "\n" : node.classList.contains("flex") || node.classList.contains("inline-flex") ? " " : "";
  const text = Array.from(node.childNodes, textOf).filter(Boolean).join(gap);
  return /^(DIV|P|LI|FORM)$/.test(node.tagName) || node.classList.contains("block") ? `\n${text}\n` : text;
}

/** Read only this table's rows; a nested drilldown has its own export control. */
export function readTableExport(table: HTMLTableElement, title: string): TableExport {
  const header = Array.from(table.tHead?.rows ?? []).find(row => row.hasAttribute("data-export-total-columns"));
  const visibleColumns = Number(header?.dataset.exportVisibleColumns);
  const totalColumns = Number(header?.dataset.exportTotalColumns);
  const rows = Array.from(table.rows).filter(row => row.closest("table") === table && !row.matches("[data-table-scroll-end], [data-export-ignore]"));
  return { title, url: window.location.href, rows: rows.map(row => ({
    kind: row.parentElement?.tagName === "THEAD" ? "header" : row.parentElement?.tagName === "TFOOT" ? "footer" : "body",
    cells: Array.from(row.cells).map(cell => {
      const source = cell.hasAttribute("data-export-value") ? cell : Array.from(cell.querySelectorAll<HTMLElement>("[data-export-value]")).find(element => element.closest("table") === table);
      const raw = source?.getAttribute("data-export-value");
      const value = raw != null ? source?.getAttribute("data-export-type") === "number" && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw : undefined;
      const text = textOf(cell).replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      const link = Array.from(cell.querySelectorAll<HTMLAnchorElement>("a[href]")).find(element => element.closest("table") === table);
      return { text, value, format: source?.getAttribute("data-export-format") ?? undefined,
        numeric: row.parentElement?.tagName !== "THEAD" && (cell.classList.contains("mono") || cell.classList.contains("text-right")),
        colSpan: row.cells.length === 1 && cell.colSpan === visibleColumns ? totalColumns : cell.colSpan,
        rowSpan: cell.rowSpan, note: cell.title || undefined,
        hyperlink: link && /^https?:$/.test(link.protocol) ? link.href : undefined,
        input: cell.dataset.inputExport ? JSON.parse(cell.dataset.inputExport) as InputChange : undefined };
    }),
  })), nested: Array.from(table.querySelectorAll<HTMLTableElement>("table[data-table-export]")).filter(child => child.parentElement?.closest("table") === table)
    .map((child, i) => {
      const panel = child.parentElement?.closest("tr");
      const parent = panel?.previousElementSibling as HTMLTableRowElement | null;
      const label = child.dataset.tableExportName || (parent?.cells?.[0] ? textOf(parent.cells[0]).split("\n").map(s => s.trim()).find(Boolean) : "");
      const context = label?.slice(0, 120) || `Detail ${i + 1}`;
      return { ...readTableExport(child, `${title} — ${context}`), context, parentRow: panel ? rows.indexOf(panel) : undefined };
    }) };
}
