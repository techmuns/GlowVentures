import ExcelJS from "exceljs";
import type { ConsolidatedBook, ConsolidatedLink } from "./consolidatedSheet";

export function consolidatedExcelTarget(book: ConsolidatedBook, link: ConsolidatedLink): string | null {
  if (!link.sheet) return null;
  const tab = book.tabs.find(t => t.name === link.sheet);
  if (!tab) return null;
  const match = link.find || link.where ? tab.rows.findIndex(r => (!link.find || r.values.some(v => String(v ?? "") === link.find))
    && Object.entries(link.where ?? {}).every(([key, v]) => r.values[tab.columns.findIndex(c => c.key === key)] === v)) : -1;
  if ((link.find || link.where) && match < 0 && link.row == null) return null;
  const row = link.row ?? (match >= 0 ? match + 6 : 5);
  return `#'${tab.name.replace(/'/g, "''")}'!A${row}`;
}

// Export the exact prepared projection the customer is reading. It is a dated
// snapshot; new statement wiring updates the next dashboard build and export.
export function createConsolidatedWorkbook(book: ConsolidatedBook, dashboardUrl: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Ventures";
  workbook.subject = "Consolidated statement data";
  for (const tab of book.tabs) {
    const sheet = workbook.addWorksheet(tab.name, { properties: { tabColor: { argb: tab.name === "Start Here" ? "FF17304C" : "FFC3A44D" } } });
    const width = Math.max(2, tab.columns.length);
    sheet.mergeCells(1, 1, 1, width);
    sheet.getCell(1, 1).value = `${tab.name} — ${book.client}`;
    sheet.getCell(1, 1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17304C" } };
    sheet.getRow(1).height = 30;
    sheet.mergeCells(2, 1, 2, width);
    sheet.getCell(2, 1).value = `Statement / review snapshot. Newest book date: ${book.asOf}. Individual account dates may be earlier.`;
    sheet.mergeCells(3, 1, 3, width);
    sheet.getCell(3, 1).value = tab.note;
    sheet.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
    sheet.getRow(3).height = 45;
    sheet.getCell(4, 1).value = { text: "Start Here", hyperlink: "#'Start Here'!A1" };
    sheet.getCell(4, 2).value = { text: "Dashboard sources", hyperlink: new URL("/audit?sources=1", dashboardUrl).href };
    sheet.getRow(4).font = { color: { argb: "FF175C99" }, underline: true };
    for (let c = 0; c < tab.columns.length; c++) {
      const column = tab.columns[c];
      sheet.getColumn(c + 1).width = Math.min(65, Math.max(column.width, 15));
      const cell = sheet.getCell(5, c + 1);
      cell.value = column.label;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17304C" } };
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { wrapText: true, vertical: "middle" };
    }
    sheet.getRow(5).height = 44;
    tab.rows.forEach((row, r) => {
      const excelRow = sheet.getRow(r + 6);
      row.values.forEach((value, c) => {
        const cell = excelRow.getCell(c + 1), column = tab.columns[c];
        cell.value = value;
        if (value != null && /[dmy]/i.test(column.format) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) cell.value = new Date(`${value}T00:00:00Z`);
        if (column.format) cell.numFmt = column.format;
        const link = row.links?.[column.key];
        if (link && value != null) {
          const target = link.file !== undefined
            ? new URL(`/audit?${link.file ? `file=${encodeURIComponent(link.file)}` : "sources=1"}`, dashboardUrl).href
            : consolidatedExcelTarget(book, link);
          if (target) { cell.value = { text: String(value), hyperlink: target }; cell.font = { name: "Calibri", size: 10, color: { argb: "FF175C99" }, underline: true }; }
        }
        cell.alignment = { vertical: "top", wrapText: typeof value === "string", horizontal: typeof value === "number" ? "right" : "left" };
        if (!cell.font) cell.font = { name: "Calibri", size: 10 };
        if (row.kind) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.kind === "group" ? "FFF3E7C5" : "FFE5EDF4" } };
          cell.font = { ...cell.font, bold: true };
        } else if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF9F5" } };
      });
      excelRow.height = row.values.some(v => typeof v === "string" && v.length > 100) ? 56 : 30;
    });
    sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
    if (tab.rows.length) sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: tab.rows.length + 5, column: tab.columns.length } };
  }
  return workbook;
}

export async function downloadConsolidatedExcel(book: ConsolidatedBook, dashboardUrl: string) {
  const bytes = await createConsolidatedWorkbook(book, dashboardUrl).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `Glow_Ventures_Consolidated_${book.asOf}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
