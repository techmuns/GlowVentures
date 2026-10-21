/**
 * ── A STATEMENT'S CONTENTS, OPENED FROM THE STATEMENT LIBRARY ─────────────────
 *
 * *"we should be able to open and see contents of every file in the dashboard
 * itself, irrespective of the type of file it is"* — the family, 21 Oct 2026.
 *
 * The preview reads `public/audit/<docKey>/pages.json`: the text the ingest
 * pipeline read out of the file, one entry per PDF page or per spreadsheet
 * sheet, which the site already serves behind its edge password gate. It is the
 * record every figure on this site was built from, so what a reader sees in the
 * preview is exactly what the book was read from — and no file is published
 * that the archive does not already carry.
 *
 * A spreadsheet's sheet arrives as tab-separated rows (the reader writes a cell
 * per tab, a row per line), so it is laid back out as a grid; a PDF page is
 * shown as the text it carries. A document whose file carried no text (a scan,
 * a mail server's removal notice) has none to show, and its own archive record
 * says why — the preview shows that reason, never an empty page.
 */

/** One entry of `pages.json`: a PDF page, or a spreadsheet's sheet. */
export interface PageText {
  page: number;
  text: string;
}

/** Formats whose `pages.json` entries are sheets of tab-separated cells. */
const SHEET_FORMATS = new Set(["XLSX", "XLSM", "XLS", "CSV", "TSV", "ODS"]);

/** Is this source format a spreadsheet — shown as a grid rather than as page text? */
export const isSheetFormat = (format: string): boolean => SHEET_FORMATS.has(format.toUpperCase());

/** The pages that carry any text — an all-blank file has nothing to preview. */
export const hasText = (pages: readonly PageText[]): boolean => pages.some((p) => p.text.trim() !== "");

/**
 * One sheet's tab-separated text laid out as rows of cells. Trailing empty cells
 * and trailing empty rows are the reader's padding, not content, so they are
 * dropped; an empty row INSIDE the sheet is kept, as the provider laid it out.
 */
export function sheetRows(text: string): { rows: string[][]; cols: number } {
  const rows = text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    const cells = line.split("\t");
    while (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
    return cells;
  });
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return { rows, cols: rows.reduce((n, r) => Math.max(n, r.length), 0) };
}

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A cell as a reader sees it. A workbook stores a double, and the reader writes
 * it at full binary precision — `12.085000000000001`, `3.2000000000000001E-2` —
 * which is the same number as `12.085` and `0.032` and no part of what the
 * provider typed. Such a value is shown at 15 significant digits (the precision
 * a double carries) with the stored text on hover; every other cell is shown as
 * written. A whole number is never touched: a 16-digit run is a demat or bank
 * account number, and rounding it would print an account that does not exist.
 */
export function cellText(raw: string): { text: string; full: string; numeric: boolean } {
  const s = raw.trim();
  if (!NUMERIC.test(s)) return { text: raw, full: raw, numeric: false };
  const exponent = /[eE]/.test(s);
  const digits = s.replace(/^[+-]?0*\.?0*/, "").replace(/[eE].*$/, "").replace(/\./, "").length;
  const noisy = exponent || (s.includes(".") && digits > 15);
  return { text: noisy ? String(Number(Number(s).toPrecision(15))) : s, full: s, numeric: true };
}

/** A spreadsheet column's letters — 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Why a document has no text to show, in its own archive record's words. */
export function unreadReason(warnings: readonly { code?: string; detail?: string }[] | undefined): string | null {
  const said = (warnings ?? []).map((w) => (w.detail ?? "").trim()).filter(Boolean);
  return said.length ? said.join(" ") : null;
}
