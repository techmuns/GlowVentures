// EVERY FILE IN THE STATEMENT LIBRARY OPENS, AND SHOWS WHAT IT CARRIES.
//   npm run test:family
//
// *"we should be able to open and see contents of every file in the dashboard
// itself, irrespective of the type of file it is"* — the family, 21 Oct 2026.
// The preview opens each document's ORIGINAL FILE, published by
// `npm run build:statement-files` (run before this suite by `pretest:family`),
// and its TEXT AS READ, `pages.json` in the archive. Ways it could quietly fail
// the request:
//
//   • a document whose original was not published, or published as the wrong
//     file — the window would show nothing, or another statement;
//   • a document with no `pages.json`, or with no text and no stated reason —
//     the text view would open on nothing, which reads as an empty statement;
//   • a spreadsheet whose pages are not tab-separated cells — the grid would put
//     a whole row in column A;
//   • the number clean-up touching an account number — a 16-digit demat number
//     is a whole number, and rounding it would print an account that does not
//     exist.

import fs from "node:fs";
import path from "node:path";
import { buildLibrary, type ManifestEntry } from "@/lib/statementLibrary";
import {
  cellText, columnLetters, fileSize, hasText, isSheetFormat, mergeLayout, sheetRows, unreadReason,
  type PageText, type StatementFileIndex,
} from "@/lib/statementPreview";

const AUDIT = path.resolve(process.cwd(), "public/audit");
const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const docs = buildLibrary(manifest).folders.flatMap((f) => f.docs);

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

// ── 0. THE ORIGINAL OF EVERY DOCUMENT IS PUBLISHED ──────────────────────────
// Off the build step's own output, so a source the hosted build cannot find
// (a ZIP whose expansion drifted from the inventory's) fails here, not on screen.
{
  const OUT = path.resolve(process.cwd(), "public/statement-files");
  const indexFile = path.join(OUT, "index.json");
  ok("the published files' index exists", fs.existsSync(indexFile), "written by npm run build:statement-files");
  const index: StatementFileIndex = fs.existsSync(indexFile) ? readJson(indexFile) : { files: {}, missing: {} };
  const byKey = new Map(manifest.map((e) => [e.docKey, e]));
  const unpublished = docs.filter((d) => !index.files[d.fileKey]).map((d) => `${d.fileKey}${index.missing[d.fileKey] ? ` (${index.missing[d.fileKey]})` : ""}`);
  ok("every document's original file is published", unpublished.length === 0,
    unpublished.length ? unpublished.join("; ") : `${Object.keys(index.files).length} files`);

  // MAGIC BYTES, so a published name never fronts another kind of file — and
  // never the SPA's index.html, which the hosted fallback serves for any path.
  const MAGIC: Record<string, (b: Buffer) => boolean> = {
    PDF: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
    XLSX: (b) => b[0] === 0x50 && b[1] === 0x4b,
    // A binary workbook, or a broker's HTML table saved as .xls (LKP's export),
    // which Excel opens as a sheet — never a whole HTML document.
    XLS: (b) => b.readUInt32BE(0) === 0xd0cf11e0 || /^\s*<table[\s>]/i.test(b.subarray(0, 64).toString("utf8")),
    CSV: (b) => !/^\s*<(!doctype|html)/i.test(b.subarray(0, 64).toString("utf8")),
  };
  const wrongSize: string[] = [];
  const wrongName: string[] = [];
  const wrongKind: string[] = [];
  const notTheSource: string[] = [];
  const badPart: string[] = [];
  let compared = 0;
  for (const d of docs) {
    const f = index.files[d.fileKey];
    if (!f) continue;
    const file = path.join(OUT, f.file);
    if (!fs.existsSync(file) || fs.statSync(file).size !== f.bytes) { wrongSize.push(d.fileKey); continue; }
    if (f.file !== `${d.fileKey}.${d.format.toLowerCase()}`) wrongName.push(`${d.fileKey} → ${f.file}`);
    const bytes = fs.readFileSync(file);
    // The archive's own record says a failed document is not a readable file of
    // its kind (a mail server's removal notice saved under a statement's name).
    const kindOk = MAGIC[d.format]?.(bytes) ?? true;
    if (!kindOk && byKey.get(d.fileKey)?.status !== "failed") wrongKind.push(`${d.fileKey} (${d.format})`);
    if (f.encrypted && d.format !== "PDF") wrongKind.push(`${d.fileKey} marked password-protected but not a PDF`);
    // A file committed outside an archive is compared byte for byte with source/.
    const src = path.resolve(process.cwd(), byKey.get(d.fileKey)?.sourcePath ?? "");
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      compared++;
      if (!fs.readFileSync(src).equals(bytes)) notTheSource.push(d.fileKey);
    }
    if (f.part) {
      const pages: number[] = (readJson(path.join(AUDIT, d.fileKey, "pages.json")).pages ?? []).map((p: PageText) => p.page);
      if (f.part.from !== Math.min(...pages) || f.part.to !== Math.max(...pages)) badPart.push(d.fileKey);
    }
  }
  ok("each published file is the size the index states", wrongSize.length === 0, wrongSize.join(", "));
  ok("each is named <docKey>.<its format>", wrongName.length === 0, wrongName.join(", "));
  ok("each is the kind of file its format says", wrongKind.length === 0, wrongKind.join(", "));
  ok("a file in source/ is published byte for byte", compared > 0 && notTheSource.length === 0,
    notTheSource.length ? notTheSource.join(", ") : `${compared} compared`);
  ok("a bundled statement opens at its own pages", badPart.length === 0,
    badPart.length ? badPart.join(", ") : `${docs.filter((d) => index.files[d.fileKey]?.part).length} parts`);
}

// ── 1. EVERY DOCUMENT HAS SOMETHING TO SHOW ─────────────────────────────────
ok("the library has documents to open", docs.length > 100 && docs.length === manifest.length,
  `${docs.length} documents, ${manifest.length} in the manifest`);
const noPages: string[] = [];
const silent: string[] = [];
const unread: string[] = [];
const sheetsWithoutCells: string[] = [];
const badPageNumbers: string[] = [];
for (const d of docs) {
  const file = path.join(AUDIT, d.fileKey, "pages.json");
  if (!fs.existsSync(file)) { noPages.push(d.fileKey); continue; }
  const pages: PageText[] = readJson(file).pages ?? [];
  if (!pages.every((p) => Number.isInteger(p.page) && p.page >= 1 && typeof p.text === "string")) badPageNumbers.push(d.fileKey);
  if (!hasText(pages)) {
    const warnings = readJson(path.join(AUDIT, d.fileKey, "document.json")).warnings;
    if (unreadReason(warnings)) unread.push(d.fileKey); else silent.push(d.fileKey);
    continue;
  }
  if (isSheetFormat(d.format) && !pages.some((p) => sheetRows(p.text).cols > 1)) sheetsWithoutCells.push(d.fileKey);
}
ok("every document's contents are in the archive", noPages.length === 0, noPages.join(", "));
ok("every page is numbered from 1 and carries text", badPageNumbers.length === 0, badPageNumbers.join(", "));
ok("a document with no text says why, in its own record", silent.length === 0,
  silent.length ? silent.join(", ") : `${unread.length} unread, each with its reason`);
ok("an unread document is the exception, not the rule", unread.length <= 5, unread.join(", "));
ok("every spreadsheet lays out as cells across columns", sheetsWithoutCells.length === 0, sheetsWithoutCells.join(", "));
const formats = new Set(docs.map((d) => d.format));
ok("the archive's spreadsheets are recognised as sheets", ["XLS", "XLSX", "CSV"].filter((f) => formats.has(f)).every(isSheetFormat)
  && !isSheetFormat("PDF"), [...formats].join(", "));

// ── 2. A SHEET'S TEXT BACK INTO A GRID ──────────────────────────────────────
{
  const g = sheetRows("A\tB\t\t\n\nC\t\tD\t\n\t\t\n");
  ok("trailing pad cells and rows are dropped, an inner blank row kept",
    JSON.stringify(g.rows) === JSON.stringify([["A", "B"], [], ["C", "", "D"]]) && g.cols === 3, JSON.stringify(g));
  ok("a CRLF sheet splits like an LF one", sheetRows("x\ty\r\nz").rows.length === 2);
}

// ── 3. NUMBERS SHOWN AS THE PROVIDER WROTE THEM ─────────────────────────────
const shown = (s: string) => cellText(s).text;
ok("a double's binary noise is shown at its own precision", shown("12.085000000000001") === "12.085", shown("12.085000000000001"));
ok("a stored exponent is shown as a plain number", shown("3.2000000000000001E-2") === "0.032", shown("3.2000000000000001E-2"));
ok("the stored text stays on hover", cellText("12.085000000000001").full === "12.085000000000001");
ok("a 16-digit account number is never rounded", shown("1201090012539157") === "1201090012539157");
ok("a leading-zero account number keeps its zeros", shown("00841000060394") === "00841000060394");
ok("an ordinary decimal is untouched", shown("140.6864") === "140.6864");
ok("a grouped figure or a word is shown as written", shown("34,16,657.4167") === "34,16,657.4167" && shown("Total") === "Total");
ok("numbers align as numbers, words as words", cellText("1.5").numeric && !cellText("ISIN").numeric);

// ── 4. COLUMN LETTERS ───────────────────────────────────────────────────────
ok("columns are lettered as a spreadsheet letters them",
  [0, 25, 26, 51, 701, 702].map(columnLetters).join(",") === "A,Z,AA,AZ,ZZ,AAA",
  [0, 25, 26, 51, 701, 702].map(columnLetters).join(","));

// ── 5. MERGED CELLS AND FILE SIZES ──────────────────────────────────────────
{
  const { spans, covered } = mergeLayout([
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, // a title across three columns
    { s: { r: 2, c: 1 }, e: { r: 5, c: 1 } }, // a label down four rows
    { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } }, // below the rows drawn
  ], 4);
  ok("a merged block's top-left cell carries its spans", spans.get("0:0")?.colSpan === 3 && spans.get("0:0")?.rowSpan === 1);
  ok("the cells under a merged block are not drawn", covered.has("0:1") && covered.has("0:2") && !covered.has("0:0"));
  ok("a block running past the rows drawn is cut at the last one", spans.get("2:1")?.rowSpan === 2 && covered.has("3:1") && !covered.has("4:1"));
  ok("a block below the rows drawn is skipped", !spans.has("9:0") && !covered.has("9:1"));
}
ok("a size reads as a file manager shows it", [fileSize(512), fileSize(30_720), fileSize(1_540_000)].join(",") === "512 B,30 KB,1.5 MB",
  [fileSize(512), fileSize(30_720), fileSize(1_540_000)].join(","));

console.log(fails ? `\n${fails} failure(s)` : "\nall statement-preview checks pass");
process.exit(fails ? 1 : 0);
