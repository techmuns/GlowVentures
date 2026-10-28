import ExcelJS from "exceljs";
import { fitExcelWorksheet } from "./excelLayout";
import { addInputWorkbook } from "./tableInputExcel";
import { COMMITMENT_FIELDS, type CommitmentRow } from "./commitmentEntry";

/**
 * The commitments sheet: the folios' Committed and Still to call, and nothing
 * else to edit. It is the table inputs' own workbook (`addInputWorkbook`), so
 * Upload Excel on any table and the commitments dialog read it with the same
 * checks — a changed heading, row or stale number is refused, never guessed.
 */
export function createCommitmentWorkbook(rows: readonly CommitmentRow[]): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = "Glow Ventures";
  book.title = "Private Market — capital commitments";
  const keep = new Set<string>(COMMITMENT_FIELDS);
  const about = book.addWorksheet("About");
  about.addRows([
    ["Sheet", "Private Market — capital commitments"], ["Exported at", new Date().toISOString()],
    ["Fill in", "Committed and Still to call for each folio on the Capital inputs sheet, in rupees (INR). A fund held by several members has one row per member's folio. Leave a cell blank where the figure is not known."],
  ]);
  addInputWorkbook(book, rows.map((r) => ({ ...r.record, fields: r.record.fields.filter((f) => keep.has(f.key)) })), []);
  about.eachRow((row) => { row.alignment = { wrapText: true, vertical: "top" }; row.getCell(1).font = { bold: true }; });
  fitExcelWorksheet(about, 0);
  // Open on the sheet to fill in, not the notes.
  book.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: "visible" }];
  return book;
}

export async function downloadCommitmentWorkbook(rows: readonly CommitmentRow[]) {
  const bytes = await createCommitmentWorkbook(rows).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Glow_Private_Market_Commitments_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
