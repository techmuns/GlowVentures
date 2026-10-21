import type ExcelJS from "exceljs";
import SSF from "ssf";

/** Measure what Excel displays, including expanded currency, percentages and dates. */
function displayedText(cell: ExcelJS.Cell): string {
  const value = cell.result ?? cell.value;
  if (typeof value === "number" || value instanceof Date) {
    try { return SSF.format(cell.numFmt || (value instanceof Date ? "dd-mmm-yyyy" : "General"), value); }
    catch { return cell.text; }
  }
  return cell.text;
}

// Excel widths use the default font's digit width. Leave room for wider glyphs,
// bold headers and larger fonts without depending on a browser/font installation.
function textWidth(text: string, cell: ExcelJS.Cell): number {
  let width = 0;
  for (const char of text) width += /\p{Mark}/u.test(char) ? 0
    : /[\u2E80-\u9FFF\uAC00-\uD7AF\uFF01-\uFF60]|\p{Extended_Pictographic}/u.test(char) ? 2
    : /[MW@%]/.test(char) ? 1.5 : 1;
  return width * (cell.font?.size ?? 11) / 11 * (cell.font?.bold ? 1.1 : 1);
}

function wrappedLines(text: string, capacity: number, cell: ExcelJS.Cell): number {
  return text.split(/\r?\n/).reduce((total, line) => {
    let lines = 1, used = 0;
    for (const word of line.split(/\s+/)) {
      const width = textWidth(word, cell), gap = used ? textWidth(" ", cell) : 0;
      if (used && used + gap + width > capacity) { lines++; used = 0; }
      else used += gap;
      if (width > capacity) {
        lines += Math.ceil(width / capacity) - 1;
        used = width % capacity || capacity;
      } else used += width;
    }
    return total + lines;
  }, 0);
}

/** Fit every populated row, then freeze the complete header band. */
export function fitExcelWorksheet(sheet: ExcelJS.Worksheet, headerRows: number, frozenColumns = 0) {
  const minWidth = 12, maxWidth = 100;
  const merged = new Map<string, { right: number; bottom: number }>();
  for (const range of sheet.model.merges) {
    const [start, end] = range.split(":"), last = sheet.getCell(end ?? start);
    merged.set(start, { right: Number(last.col), bottom: Number(last.row) });
  }
  const cells: { cell: ExcelJS.Cell; text: string; right: number; bottom: number }[] = [];
  const widths = Array<number>(sheet.columnCount).fill(minWidth);
  sheet.eachRow(row => row.eachCell(cell => {
    if (cell.isMerged && cell.master.address !== cell.address) return;
    const span = merged.get(cell.address) ?? { right: Number(cell.col), bottom: Number(cell.row) };
    const text = displayedText(cell);
    cells.push({ cell, text, ...span });
    if (span.right !== cell.col) return; // A merged title must not widen only column A.
    const padding = 3 + (sheet.autoFilter && cell.row === headerRows ? 2 : 0) + (cell.alignment?.indent ?? 0) * 3;
    const longest = Math.max(0, ...text.split(/\r?\n/).map(line => textWidth(line, cell)));
    widths[Number(cell.col) - 1] = Math.max(widths[Number(cell.col) - 1], Math.min(maxWidth, longest + padding));
  }));
  widths.forEach((width, i) => { sheet.getColumn(i + 1).width = Math.ceil(width * 100) / 100; });
  for (const { cell, text, right, bottom } of cells) {
    // Count the whole merged span once; slave cells repeat the master's value.
    const capacity = Math.max(1, widths.slice(Number(cell.col) - 1, right).reduce((a, b) => a + b, 0) - 3 - (cell.alignment?.indent ?? 0) * 3);
    cell.alignment = { ...cell.alignment, wrapText: true };
    const height = wrappedLines(text, capacity, cell) * (cell.font?.size ?? 11) * 1.4 + 6;
    let available = 0;
    for (let r = Number(cell.row); r <= bottom; r++) available += sheet.getRow(r).height ?? 24;
    const row = sheet.getRow(bottom);
    row.height = Math.min(409.5, Math.max(24, (row.height ?? 24) + Math.max(0, height - available)));
  }
  if (headerRows || frozenColumns) {
    const first = `${sheet.getColumn(frozenColumns + 1).letter}${headerRows + 1}`;
    sheet.views = [{ state: "frozen", ySplit: headerRows, xSplit: frozenColumns, topLeftCell: first, activeCell: first }];
  }
}
