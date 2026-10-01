// Spreadsheet reader — the two formats this drop actually carries.
//
// WHY THIS EXISTS. The pipeline filtered `.pdf` before it counted anything, so
// four files sat in `source/` completely unseen: a manager's monthly portfolio
// disclosure as `.xlsx`, and a broker's annual P&L and transaction tape as
// `.xls`. Between them they carry per-lot BUY DATES — which docs/BOOK-REPORT.md
// was simultaneously claiming no statement in the drop provides.
//
// TWO FORMATS, AND THE SECOND IS A LIE
//
//   .xlsx  Office Open XML. A ZIP of XML: sharedStrings.xml holds the text,
//          sheetN.xml holds cells addressed A1-style with a `t` attribute saying
//          whether the value is an index into that string table or a literal.
//
//   .xls   NOT a legacy BIFF workbook. LKP's reporting engine writes an HTML
//          `<table>` and names it `.xls` because Excel opens it. Reading the
//          extension and reaching for a BIFF parser finds a file that starts
//          `<table border="1"` and fails with a message about the OLE header
//          that tells you nothing. So the format is decided by SNIFFING THE
//          BYTES, never by the extension.
//
//   .csv   Plain comma-separated text, which the September 2026 delivery brought
//          beside every Marathon PDF. RFC 4180: a field may be "quoted", a
//          quote inside it is doubled, and a quoted field may run over SEVERAL
//          LINES — Marathon's own office address does, in the header of three of
//          its four files, so a line-by-line split would shear every row below
//          it. Recognised by its BYTES like the other two: text with no NUL in
//          it whose first line carries a comma, after the ZIP, OLE and HTML
//          signatures have all been ruled out.
//
// Everything returns the same shape — a grid of trimmed strings — so a provider
// reads a sheet the way it reads a PDF page: by locating a header row and
// matching column labels, never by column index.
import { inflateRawSync } from "node:zlib";
import { listEntries, readEntry } from "./unzip.mjs";
import { parseNum } from "./parseNum.mjs";

/** One sheet: a name and a rectangular grid of strings. */
export const makeSheet = (name, rows) => ({ name, rows });

const HTML_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#160": " ",
};

function unescapeHtml(s) {
  return String(s ?? "")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
      if (HTML_ENTITIES[e]) return HTML_ENTITIES[e];
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return m;
    });
}

const clean = (s) => unescapeHtml(String(s ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * What kind of file this actually is, from its first bytes.
 *
 * `PK\x03\x04` is a ZIP, so an Office Open XML workbook. `\xD0\xCF\x11\xE0` is
 * an OLE compound file, so a genuine legacy BIFF `.xls` — which this module does
 * NOT read, and says so rather than returning an empty grid that reads as "the
 * file had nothing in it".
 */
export function sniffFormat(buf) {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "xlsx";
  if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "biff";
  const head = buf.slice(0, 2048).toString("latin1").toLowerCase();
  if (/<table|<html|<tr[\s>]|<!doctype html/.test(head)) return "html-table";
  if (looksLikeCsv(buf)) return "csv";
  return "unknown";
}

// ── Comma-separated text ─────────────────────────────────────────────────────

/** A UTF-8 byte-order mark, which Excel writes in front of a CSV it saves. */
const BOM = "\uFEFF";

/**
 * Is this comma-separated TEXT? Decided on the bytes, and only once every
 * binary signature above has said no.
 *
 * Three tests, each ruling out something that can carry a comma: a NUL byte
 * means binary (a PDF stream, an image); a `%PDF` header means a PDF whatever its
 * name says; and the first non-blank line must itself carry a comma, because a
 * text file with no delimiter on its first line is a note, not a table. A file
 * that fails is reported "unrecognised" — never parsed as a one-column grid,
 * which would read as "the export had one column in it".
 */
function looksLikeCsv(buf) {
  const head = buf.subarray(0, 4096);
  if (!head.length || head.includes(0)) return false;
  const text = head.toString("latin1").replace(/^\xEF\xBB\xBF/, "");
  if (text.startsWith("%PDF")) return false;
  const first = text.split(/\r\n|\r|\n/).find((l) => l.trim());
  return Boolean(first && first.includes(","));
}

/**
 * The text of a CSV: UTF-8 where it is valid UTF-8, Latin-1 where it is not.
 *
 * A byte that is not valid UTF-8 would otherwise decode to U+FFFD and a name
 * would arrive with a replacement character in it — a wrong name that looks
 * like a rendering glitch. Latin-1 maps every byte to a character, so nothing
 * is lost; it is only the fallback, because the drop's own exports are UTF-8.
 */
function csvText(buf) {
  let s;
  try { s = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { s = buf.toString("latin1"); }
  return s.startsWith(BOM) ? s.slice(1) : s;
}

/**
 * RFC 4180, and nothing cleverer.
 *
 * A field is either bare or "quoted"; inside quotes a doubled quote is one
 * quote and a comma or a line break is DATA. That last clause is the reason this
 * is a parser rather than `split(",")`: Marathon's export opens with its office
 * address as one quoted field running over four lines, and a line-based split
 * turns that into four short rows that push every real row's columns out of
 * register.
 *
 * Two leniencies, both about where a quote may sit, and neither able to move a
 * value between columns: a quote in the MIDDLE of a bare field is kept as a
 * character (`5" display`), and anything after a closing quote up to the next
 * comma is kept too. An UNTERMINATED quote is an error rather than a grid —
 * everything after it would otherwise land in one cell, which is the kind of
 * silent misreading this module exists to refuse.
 *
 * @returns {string[][]} the rows, each a list of raw (untrimmed) fields
 */
export function parseCsv(text) {
  const s = String(text ?? "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;        // inside a quoted field
  let opened = -1;           // where the open quote was, for the error message
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") { quoted = true; opened = i; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
      continue;
    }
    field += ch;
  }
  if (quoted) {
    const line = s.slice(0, opened).split(/\r\n|\r|\n/).length;
    throw new Error(`unterminated quoted field opened on line ${line} — the rest of the file would land in one cell`);
  }
  // A last line with no line break after it is still a row; a trailing line
  // break is not an extra empty one.
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * A CSV as ONE sheet, cells trimmed and whitespace-collapsed exactly as the
 * xlsx reader leaves them — so the address that ran over four lines reads as one
 * line of text, and a reader written against one format reads the other.
 */
export function readCsv(buf) {
  const rows = parseCsv(csvText(buf)).map((r) => r.map((c) => String(c).replace(/\s+/g, " ").trim()));
  return [makeSheet("csv", rows)];
}

// ── HTML tables written as .xls ──────────────────────────────────────────────

/**
 * Every `<table>` in the document, as its own sheet.
 *
 * `colspan` is honoured by emitting the cell once and padding the rest, so a
 * header spanning three columns does not shift every value on the row left by
 * two — which is exactly the kind of silent column shift that puts a sale price
 * in the quantity column.
 */
export function readHtmlTables(text) {
  const sheets = [];
  const tables = [...text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
  tables.forEach((t, i) => {
    const rows = [];
    for (const rowMatch of t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
        const attrs = cellMatch[2] || "";
        const span = Math.max(1, Number((/colspan\s*=\s*"?(\d+)"?/i.exec(attrs) || [])[1] || 1));
        cells.push(clean(cellMatch[3]));
        for (let k = 1; k < span; k++) cells.push("");
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) sheets.push(makeSheet(`table${i + 1}`, rows));
  });
  return sheets;
}

// ── Office Open XML ──────────────────────────────────────────────────────────

/** `BC12` → column index 54 (0-based). */
function colIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref);
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sharedStrings(xml) {
  if (!xml) return [];
  // A shared string is one <si> which may hold SEVERAL <t> runs (rich text). The
  // runs are concatenated: taking only the first truncates "Crompton Greaves
  // Consumer Electricals Limited" to whatever the first formatting run held.
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeHtml(t[1])).join("").replace(/\s+/g, " ").trim(),
  );
}

export function readXlsx(buf) {
  const entries = listEntries(buf);
  const byName = new Map(entries.map((e) => [e.name.replace(/^\/+/, ""), e]));
  const read = (name) => {
    const e = byName.get(name);
    if (!e) return null;
    try { return readEntry(buf, e).toString("utf8"); } catch { return null; }
  };

  const strings = sharedStrings(read("xl/sharedStrings.xml"));
  const workbook = read("xl/workbook.xml") ?? "";
  const names = [...workbook.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => unescapeHtml(m[1]));

  const sheetFiles = [...byName.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]));

  const sheets = [];
  sheetFiles.forEach((file, idx) => {
    const xml = read(file);
    if (!xml) return;
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      // BOTH cell forms, and the self-closing one FIRST.
      //
      // An empty cell is written `<c r="A4" s="1"/>`. A pattern that only knows
      // the paired form treats that opening tag as A4's and then captures the
      // NEXT cell's <v> as its content — so A4 takes B4's value and every column
      // on the row shifts one left. In this workbook that put the shared-string
      // INDEX where the instrument name belongs and slid the ISIN into the
      // quantity column. Nothing errored; the grid just came out wrong.
      for (const c of rowMatch[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? "";
        const ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1] || "";
        const type = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || "n";
        const at = ref ? colIndex(ref) : cells.length;
        let value = "";
        if (type === "s") {
          const i = Number((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1]);
          value = Number.isInteger(i) ? (strings[i] ?? "") : "";
        } else if (type === "inlineStr" || type === "str") {
          value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeHtml(t[1])).join("")
            || unescapeHtml((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1] ?? "");
        } else {
          value = unescapeHtml((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1] ?? "");
        }
        // Cells are ADDRESSED, not sequential: a row that skips B and C emits
        // A then D. Padding by the reference keeps every value under its own
        // header instead of sliding two columns left.
        while (cells.length < at) cells.push("");
        cells[at] = String(value).replace(/\s+/g, " ").trim();
      }
      // `<row r="7">` after `<row r="4">` means rows 5 and 6 are empty; they are
      // emitted so a caller counting rows sees the sheet's real shape.
      const rowNum = Number((/r="(\d+)"/.exec(rowMatch[0]) || [])[1] || rows.length + 1);
      while (rows.length < rowNum - 1) rows.push([]);
      rows[rowNum - 1] = cells;
    }
    sheets.push(makeSheet(names[idx] ?? `sheet${idx + 1}`, rows.map((r) => r ?? [])));
  });
  return sheets;
}

/**
 * Read any spreadsheet this drop carries.
 *
 * Mirrors `extractLayout`'s contract: never throws, and an unreadable file comes
 * back with `error` set rather than an empty grid. An empty grid and a file we
 * could not open look identical to a caller, and only one of them is a gap
 * somebody can close.
 *
 * @returns {{ sheets: Array<{name:string, rows:string[][]}>, format: string, error: string|null }}
 */
export function readSpreadsheet(input) {
  // `sniffFormat` and the HTML path both call Buffer methods (`toString` with an
  // encoding), which a Uint8Array does not have — it stringifies to a
  // comma-joined list of byte VALUES and every content test then fails. Callers
  // hand this whatever `fs.readFileSync` or a caller's own copy gave them, so the
  // normalisation happens once, here, rather than at each call site.
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength ?? input.length);
  let format = "unknown";
  try {
    format = sniffFormat(buf);
    if (format === "xlsx") return { sheets: readXlsx(buf), format, error: null };
    if (format === "html-table") return { sheets: readHtmlTables(buf.toString("utf8")), format, error: null };
    if (format === "csv") return { sheets: readCsv(buf), format, error: null };
    if (format === "biff") {
      return {
        sheets: [], format,
        error: "legacy BIFF .xls (OLE compound file) — this pipeline reads Office Open XML and HTML-table .xls only",
      };
    }
    return { sheets: [], format, error: "unrecognised spreadsheet format" };
  } catch (e) {
    // The SNIFFED format, not "unknown". A reader that says it could not tell
    // what the file was, when it knew perfectly well and failed while parsing
    // it, sends whoever debugs this to the wrong place — which is the same
    // failure as a wrong diagnosis on screen.
    return { sheets: [], format, error: e?.message ?? String(e) };
  }
}

// ── Reading a sheet the way a provider reads a PDF page ──────────────────────

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/**
 * Find the header row and map each requested field to a COLUMN INDEX by
 * matching its label — never by position.
 *
 * Same discipline as lib/table.mjs: a layout change surfaces as "column not
 * matched" rather than as figures read from the wrong column.
 *
 * @param {string[][]} rows
 * @param {Record<string, RegExp[]>} aliases
 * @returns {{ headerRow:number, columns:Record<string,number>, missing:string[] }|null}
 */
export function findHeader(rows, aliases, { minFields = 3, from = 0, require: required = [] } = {}) {
  const fields = Object.keys(aliases);
  for (let i = from; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const columns = {};
    cells.forEach((cell, c) => {
      const t = norm(cell);
      if (!t) return;
      for (const f of fields) {
        if (f in columns) continue;
        if (aliases[f].some((re) => re.test(t))) { columns[f] = c; break; }
      }
    });
    // `require` names the columns a reader CANNOT WORK WITHOUT, as opposed to
    // the ones it would like. A header that satisfies `minFields` while missing
    // one of these matches, and every row then reads from column `undefined` —
    // which yields no rows and a document reported as "failed" with a warning
    // that names the wrong problem. Refusing the header instead sends the reader
    // on to the next candidate row and, if there is none, says which column was
    // missing.
    const ok = Object.keys(columns).length >= minFields && required.every((f) => f in columns);
    if (ok) return { headerRow: i, columns, missing: fields.filter((f) => !(f in columns)) };
  }
  return null;
}

/** Rows below the header, as `{ field: cellText }`. Blank rows are skipped. */
export function readRows(rows, header, { stopRe = null, requireField = null } = {}) {
  const out = [];
  for (let i = header.headerRow + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (!cells.some((c) => c)) continue;
    const joined = cells.join(" ");
    if (stopRe && stopRe.test(joined)) break;
    const fields = {};
    for (const [f, c] of Object.entries(header.columns)) fields[f] = cells[c] ?? "";
    if (requireField && !String(fields[requireField] ?? "").trim()) continue;
    out.push({ row: i, fields, cells });
  }
  return out;
}

/** A sheet as an audit sheet — the same shape the PDF path writes. */
export const toAuditSheet = (name, rows) => ({ name, rows: rows.map((r) => r ?? []) });

/**
 * IS THE EXPORT THE SAME DOCUMENT AS ITS PDF? A WITNESS, NEVER A SECOND SOURCE.
 *
 * A manager's reporting system writes the same report twice — a PDF and a
 * spreadsheet export of the same tables (`askimpms_…_BankBook178CT.pdf` and
 * `.xlsx`; Marathon's `.pdf` and `.csv`). The PDF is the document this pipeline
 * reads; read as a second source the export would put every row in the book
 * twice. What it IS good for is a check: every significant figure it carries
 * should be a figure the PDF prints. This returns how many were checked, how
 * many were found, and the ones that were not — a figure the export carries and
 * the PDF does not print is a disagreement between two renderings of one
 * statement, and it is named rather than absorbed.
 *
 * A figure is SIGNIFICANT when it is a number of magnitude ≥ 1 with a fractional
 * part: whole numbers (dates, counts, serials, years) coincide by chance. It is
 * FOUND when the PDF prints a number that agrees with it at the export's own
 * precision — the two print a figure to different decimals (the export to six,
 * the page to two or four), so the comparison is made at every precision from
 * the export's down to two places, and within one unit in the last place there,
 * which is the PDF's own rounding of the same figure and nothing looser.
 * Calibrated on the September 2026 delivery: every figure of all eighteen
 * exports is found.
 */
export function witnessCheck(sheets, pdfText) {
  const NUM = /^\(?[-+]?[\d,]*\d(?:\.\d+)?\)?-?$/;
  const decs = (t) => (String(t).match(/\.(\d+)/)?.[1] ?? "").length;
  const idx = new Map();
  for (const m of String(pdfText ?? "").matchAll(/\(?-?\d[\d,]*(?:\.\d+)?\)?-?/g)) {
    const v = parseNum(m[0]);
    if (v == null || !Number.isFinite(v)) continue;
    const d = decs(m[0]);
    for (let e = 0; e <= Math.min(d, 6); e++) {
      if (!idx.has(e)) idx.set(e, new Set());
      idx.get(e).add(Math.round(Math.abs(v) * 10 ** e));
    }
  }
  const found = (x, dx) => {
    for (let e = Math.min(dx, 6); e >= Math.min(dx, 2); e--) {
      const set = idx.get(e);
      if (!set) continue;
      const k = Math.round(Math.abs(x) * 10 ** e);
      if (set.has(k) || (e >= 2 && (set.has(k - 1) || set.has(k + 1)))) return true;
    }
    return false;
  };
  let checked = 0, matched = 0;
  const unmatched = [];
  for (const s of sheets ?? []) {
    for (const row of s.rows ?? []) {
      for (const cell of row) {
        const t = String(cell ?? "").trim().replace(/%$/, "");
        if (!NUM.test(t)) continue;
        const v = parseNum(t);
        if (v == null || !Number.isFinite(v) || Math.abs(v) < 1 || Number.isInteger(v)) continue;
        checked++;
        if (found(v, decs(t))) matched++;
        else if (!unmatched.includes(t)) unmatched.push(t);
      }
    }
  }
  return { checked, matched, unmatched };
}
