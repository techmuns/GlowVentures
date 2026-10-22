/**
 * ── A STATEMENT'S CONTENTS, OPENED FROM THE STATEMENT LIBRARY ─────────────────
 *
 * *"we should be able to open and see contents of every file in the dashboard
 * itself, irrespective of the type of file it is"* — the family, 21 Oct 2026.
 *
 * TWO VIEWS OF ONE FILE. The ORIGINAL FILE, as the provider sent it, is
 * published by `scripts/build-statement-files.mjs` to
 * `public/statement-files/<docKey>.<ext>` behind the edge password gate (*"publish
 * the original statement files … so the preview can show the real PDF and
 * spreadsheet layout"* — the family, 22 Oct 2026); `index.json` there lists what
 * this build carries. The TEXT AS READ is `public/audit/<docKey>/pages.json`:
 * the text the ingest pipeline read out of the file, one entry per PDF page or
 * per spreadsheet sheet — the record every figure on this site was built from.
 *
 * A spreadsheet's sheet arrives in pages.json as tab-separated rows (the reader
 * writes a cell per tab, a row per line), so it is laid back out as a grid; a
 * PDF page is shown as the text it carries. A document whose file carried no
 * text has none to show, and its own archive record says why — the preview
 * shows that reason, never an empty page.
 */

/** One published original file, as `public/statement-files/index.json` lists it. */
export interface PublishedFile {
  /** The published file name — `<docKey>.<ext>`. */
  file: string;
  bytes: number;
  /** A PDF that opens only with its password; the browser's viewer asks for it. */
  encrypted: boolean;
  /** One statement cut from a bundled PDF: the pages of the file it occupies. */
  part: { from: number; to: number } | null;
}

/** `public/statement-files/index.json` — what this build published, and why not the rest. */
export interface StatementFileIndex {
  files: Record<string, PublishedFile>;
  missing: Record<string, string>;
}

/** A file's size the way a file manager shows it. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One cell of a grid, as shown: its text, the stored value on hover, its alignment. */
export interface GridCell {
  text: string;
  full: string;
  numeric: boolean;
}

/** A merged block of cells, top-left to bottom-right inclusive, 0-based. */
export interface GridMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/**
 * Where each merged block starts and which cells it covers — the top-left cell
 * takes the spans, every other cell under it is not drawn. A block running past
 * the last row drawn is cut at that row, so a paged sheet never spans into rows
 * that are not on screen.
 */
export function mergeLayout(merges: readonly GridMerge[], rowsDrawn: number) {
  const spans = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();
  for (const m of merges) {
    if (m.s.r >= rowsDrawn) continue;
    const lastRow = Math.min(m.e.r, rowsDrawn - 1);
    const rowSpan = lastRow - m.s.r + 1;
    const colSpan = m.e.c - m.s.c + 1;
    if (rowSpan === 1 && colSpan === 1) continue;
    spans.set(`${m.s.r}:${m.s.c}`, { rowSpan, colSpan });
    for (let r = m.s.r; r <= lastRow; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r}:${c}`);
    }
  }
  return { spans, covered };
}

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
