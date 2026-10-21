// EVERY FILE IN THE STATEMENT LIBRARY OPENS, AND SHOWS WHAT IT CARRIES.
//   npm run test:family
//
// *"we should be able to open and see contents of every file in the dashboard
// itself, irrespective of the type of file it is"* — the family, 21 Oct 2026.
// The preview reads each document's `pages.json` out of the archive. Three ways
// it could quietly fail the request:
//
//   • a document with no `pages.json`, or with no text and no stated reason —
//     the window would open on nothing, which reads as an empty statement;
//   • a spreadsheet whose pages are not tab-separated cells — the grid would put
//     a whole row in column A;
//   • the number clean-up touching an account number — a 16-digit demat number
//     is a whole number, and rounding it would print an account that does not
//     exist.

import fs from "node:fs";
import path from "node:path";
import { buildLibrary, type ManifestEntry } from "@/lib/statementLibrary";
import { cellText, columnLetters, hasText, isSheetFormat, sheetRows, unreadReason, type PageText } from "@/lib/statementPreview";

const AUDIT = path.resolve(process.cwd(), "public/audit");
const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const docs = buildLibrary(manifest).folders.flatMap((f) => f.docs);

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

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

console.log(fails ? `\n${fails} failure(s)` : "\nall statement-preview checks pass");
process.exit(fails ? 1 : 0);
