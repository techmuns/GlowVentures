import ExcelJS from "exceljs";
import { excelCellValue, type TableExport } from "./tableExport";
import { fitExcelWorksheet } from "./excelLayout";
import { addInputWorkbook } from "./tableInputExcel";
import type { InputChange } from "./tableInputs";

export function createTableWorkbook(snapshot: TableExport): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = "Glow Ventures";
  book.title = snapshot.title;
  const targets: { sheet: string; cell: string; input: InputChange }[] = [];
  const notes: { sheet: string; cell: string; text: string }[] = [];
  const draw = (snapshot: TableExport, name: string) => {
  const sheet = book.addWorksheet(name);
  const occupied = new Set<string>();
  let columns = 1;
  snapshot.rows.forEach((row, r) => {
    let c = 1;
    row.cells.forEach(source => {
      while (occupied.has(`${r + 1}:${c}`)) c++;
      const width = source.colSpan ?? 1, height = source.rowSpan ?? 1;
      if (r + height > 1048576 || c + width - 1 > 16384) throw new Error("This table exceeds Excel's sheet size limit.");
      const cell = sheet.getCell(r + 1, c);
      const { value, format } = excelCellValue(source);
      // A string beginning with =, +, - or @ is still a literal, never a formula.
      cell.value = source.hyperlink && typeof value === "string" ? { text: value, hyperlink: source.hyperlink } : value;
      if (format) cell.numFmt = format;
      if (source.input) targets.push({ sheet: sheet.name, cell: cell.address, input: source.input });
      cell.font = { name: "Calibri", size: 11, bold: row.kind !== "body" || row.section, color: { argb: row.kind === "header" ? "FFFFFFFF" : "FF202438" } };
      cell.alignment = { vertical: "top", wrapText: true, horizontal: typeof value === "number" ? "right" : "left", ...(source.depth ? { indent: source.depth } : {}) };
      const fill = row.kind === "header" ? "FF26213E" : row.kind === "footer" || row.section ? "FFF1E5C3"
        : (row.depth ?? 0) >= 3 ? "FFD0DEF0" : row.depth === 2 ? "FFDBE8FA" : row.depth === 1 ? (r % 2 ? "FFE5EEFB" : "FFEDF4FF") : r % 2 === 0 ? "FFF8F7F3" : null;
      if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      const note = [source.note, typeof value === "number" && source.value === undefined ? `Displayed: ${source.text}` : null].filter(Boolean).join("\n\n");
      if (note) notes.push({ sheet: sheet.name, cell: cell.address, text: note });
      if (width > 1 || height > 1) {
        sheet.mergeCells(r + 1, c, r + height, c + width - 1);
        for (let rr = r + 1; rr < r + 1 + height; rr++) for (let cc = c; cc < c + width; cc++) occupied.add(`${rr}:${cc}`);
      }
      columns = Math.max(columns, c + width - 1);
      c += width;
    });
  });
  const headers = snapshot.rows.findIndex(row => row.kind !== "header");
  const headerCount = headers < 0 ? snapshot.rows.length : headers;
  if (headerCount === 1 && snapshot.rows[0].cells.every(cell => (cell.colSpan ?? 1) === 1 && (cell.rowSpan ?? 1) === 1)) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, snapshot.rows.findIndex(row => row.kind === "footer") < 0 ? snapshot.rows.length : snapshot.rows.findIndex(row => row.kind === "footer")), column: columns } };
  }
  fitExcelWorksheet(sheet, headerCount, columns > 1 ? 1 : 0);
  };
  draw(snapshot, "Table");
  let detail = 0;
  const detailNames: [string, string][] = [];
  const referenceSheets = new Set<string>();
  const drawChildren = (table: TableExport, parentSheet: string) => { for (const nested of table.nested ?? []) {
    const label = (nested.context ?? "").replace(/[\\/*?:\[\]']/g, " ").replace(/\s+/g, " ").trim();
    const name = `Detail ${++detail}${label ? ` ${label}` : ""}`.slice(0, 31);
    draw(nested, name); detailNames.push([name, nested.title]);
    if (nested.parentRow != null && nested.parentRow >= 0) {
      const cell = book.getWorksheet(parentSheet)!.getCell(nested.parentRow + 1, 1);
      cell.value = `${cell.text}${cell.text ? "\n" : ""}See ${name}`;
      cell.alignment = { ...cell.alignment, wrapText: true };
      referenceSheets.add(parentSheet);
    }
    drawChildren(nested, name);
  } };
  drawChildren(snapshot, "Table");
  for (const name of referenceSheets) {
    const sheet = book.getWorksheet(name)!, view = sheet.views[0];
    fitExcelWorksheet(sheet, view?.state === "frozen" ? view.ySplit ?? 0 : 0, view?.state === "frozen" ? view.xSplit ?? 0 : 0);
  }
  // Excel stores each cell comment as a separate VML shape. A fully expanded
  // book can otherwise inflate hundreds of MB before compression, making an
  // ordinary download impractical to open/upload. Keep every explanation, but
  // group repeated text and cell references in a plain worksheet for large tables.
  const groupedNotes = notes.length > 1000;
  if (groupedNotes) {
    const sheet = book.addWorksheet("Cell notes");
    sheet.addRow(["Worksheet", "Cells", "Explanation"]);
    const groups = new Map<string, Map<string, string[]>>();
    for (const note of notes) {
      if (!groups.has(note.sheet)) groups.set(note.sheet, new Map());
      const texts = groups.get(note.sheet)!;
      if (!texts.has(note.text)) texts.set(note.text, []);
      texts.get(note.text)!.push(note.cell);
    }
    for (const [name, texts] of groups) for (const [text, cells] of texts)
      for (let i = 0; i < cells.length; i += 50) sheet.addRow([name, cells.slice(i, i + 50).join(", "), text]);
    sheet.autoFilter = `A1:C${sheet.rowCount}`;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF26213E" } };
    });
    sheet.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
    fitExcelWorksheet(sheet, 1, 0, { maxWidths: { 1: 32, 2: 60, 3: 100 } });
  } else for (const note of notes) book.getWorksheet(note.sheet)!.getCell(note.cell).note = note.text;
  const about = book.addWorksheet("About");
  about.addRows([
    ["Table", snapshot.title], ["Dashboard", snapshot.url], ["Exported at", new Date().toISOString()],
    ["View", "All rows regardless of search, member and table filters, including rows not yet loaded by scrolling, and every available column, including columns hidden in Edit Columns. Expanded detail is included; nested tables have their own Detail sheets. The selected table, sort and column arrangement are retained. Display filters do not limit this export."],
    ["Numbers", "Source values are used where available; other numbers follow the displayed precision. Abbreviated amounts are expanded to currency units. A dash stays a dash; it does not become zero."],
    ["Editable text", "Strategy and Description include saved text. Unsaved drafts are not included."],
  ]);
  about.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; row.getCell(1).font = { bold: true }; });
  fitExcelWorksheet(about, 0);
  if (snapshot.inputs) addInputWorkbook(book, snapshot.inputs, targets);
  else about.addRow(["Upload Excel", snapshot.viewOnly ? "This download is read-only. Numbers are edited on Portfolio Monitor, Private Market and Real Estate."
    : "This download is read-only. Re-export after saved numbers have loaded to edit and sync numbers."]);
  if (groupedNotes) about.addRow(["Cell explanations", "For this expanded export, explanations are grouped in Cell notes by worksheet and cell address. Editable input cells keep their own notes."]);
  about.addRows(detailNames);
  about.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; row.getCell(1).font = { bold: true }; });
  fitExcelWorksheet(about, 0);
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
