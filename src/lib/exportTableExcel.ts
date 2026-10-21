import ExcelJS from "exceljs";
import { excelCellValue, type TableExport } from "./tableExport";

export function createTableWorkbook(snapshot: TableExport): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = "Glow Ventures";
  book.title = snapshot.title;
  const sheet = book.addWorksheet("Table");
  const occupied = new Set<string>();
  let columns = 1;
  snapshot.rows.forEach((row, r) => {
    let c = 1;
    row.cells.forEach(source => {
      while (occupied.has(`${r + 1}:${c}`)) c++;
      const width = source.colSpan ?? 1, height = source.rowSpan ?? 1;
      if (r + height > 1048576 || c + width - 1 > 16384) throw new Error("This table exceeds Excel's sheet size limit. Narrow the filters and try again.");
      const cell = sheet.getCell(r + 1, c);
      const { value, format } = excelCellValue(source);
      // A string beginning with =, +, - or @ is still a literal, never a formula.
      cell.value = source.hyperlink && typeof value === "string" ? { text: value, hyperlink: source.hyperlink } : value;
      if (format) cell.numFmt = format;
      cell.font = { name: "Calibri", size: 11, bold: row.kind !== "body", color: { argb: row.kind === "header" ? "FFFFFFFF" : "FF202438" } };
      cell.alignment = { vertical: "top", wrapText: true, horizontal: typeof value === "number" ? "right" : "left" };
      if (row.kind !== "body" || r % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.kind === "header" ? "FF26213E" : row.kind === "footer" ? "FFF1E5C3" : "FFF8F7F3" } };
      const note = [source.note, typeof value === "number" && source.value === undefined ? `Displayed: ${source.text}` : null].filter(Boolean).join("\n\n");
      if (note) cell.note = note;
      if (width > 1 || height > 1) {
        sheet.mergeCells(r + 1, c, r + height, c + width - 1);
        for (let rr = r + 1; rr < r + 1 + height; rr++) for (let cc = c; cc < c + width; cc++) occupied.add(`${rr}:${cc}`);
      }
      const column = sheet.getColumn(c);
      column.width = Math.max(column.width ?? 12, Math.min(55, Math.max(...source.text.split("\n").map(line => line.length)) / width + 3));
      columns = Math.max(columns, c + width - 1);
      c += width;
    });
    sheet.getRow(r + 1).height = Math.min(150, Math.max(24, ...row.cells.map(cell => 15 * cell.text.split("\n").reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 45)), 0) + 6)));
  });
  const headers = snapshot.rows.findIndex(row => row.kind !== "header");
  const headerCount = headers < 0 ? snapshot.rows.length : headers;
  sheet.views = [{ state: "frozen", ySplit: headerCount, xSplit: columns > 1 ? 1 : 0 }];
  if (headerCount === 1 && snapshot.rows[0].cells.every(cell => (cell.colSpan ?? 1) === 1 && (cell.rowSpan ?? 1) === 1)) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, snapshot.rows.findIndex(row => row.kind === "footer") < 0 ? snapshot.rows.length : snapshot.rows.findIndex(row => row.kind === "footer")), column: columns } };
  }
  const about = book.addWorksheet("About");
  about.columns = [{ width: 22 }, { width: 105 }];
  about.addRows([
    ["Table", snapshot.title], ["Dashboard", snapshot.url], ["Exported at", new Date().toISOString()],
    ["View", "All matching rows, including rows not yet loaded by scrolling, and every available column, including columns hidden in Edit Columns. Active filters, sort and column arrangement apply."],
    ["Numbers", "Source values are used where available; other numbers follow the displayed precision. Abbreviated amounts are expanded to currency units. A dash stays a dash; it does not become zero."],
    ["Editable text", "Strategy and Description include saved text. Unsaved drafts are not included."],
  ]);
  about.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; row.height = 42; row.getCell(1).font = { bold: true }; });
  return book;
}

export async function downloadTableExcel(snapshot: TableExport) {
  const bytes = await createTableWorkbook(snapshot).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Glow_${snapshot.title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 100)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
