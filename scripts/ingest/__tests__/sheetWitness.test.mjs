// A SPREADSHEET EXPORT IS A WITNESS OF ITS PDF, NEVER A SECOND SOURCE.
//
// The September 2026 delivery brought eighteen exports, each sitting beside the
// PDF of the same report: ASK's `.xlsx` (ten) and Marathon's `.csv` (eight,
// inside the two holders' zips). `extract.mjs` reads the PDF as the document and
// archives the export with its rows and NO facts, `twinOf` naming the PDF, after
// checking that every significant figure the export carries is printed in that
// PDF (`witnessCheck` in lib/sheet.mjs). This suite holds four things to it:
//
//   1. the CSV reader — RFC 4180 and nothing cleverer, because Marathon's export
//      opens with an address that runs over four lines inside one quoted field;
//   2. the format sniffing that decides a file is comma-separated text at all,
//      and the reader for a GENUINE legacy BIFF `.xls` (the October 2026 bank
//      exports), which must read a stored amount and not its shortened display;
//   3. the witness check itself, on constructed figures, so each rule (what is
//      significant, the precisions it compares at, the one-unit tolerance) is
//      pinned rather than described;
//   4. the eighteen real exports: each re-read from its committed bytes
//      reproduces the archived sheet, each is witnessed whole by its own PDF and
//      NOT by the other account's PDF of the same report, each carries no facts,
//      and neither the book nor its report ever cites one.
//
// Nothing here prints a fixture's text — the exports carry holder names and
// addresses. A failure names the docKey (already a directory name in the
// archive) and the figure counts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as XLSX from "xlsx";
import { parseCsv, readCsv, sniffFormat, readSpreadsheet, readBiff, witnessCheck } from "../lib/sheet.mjs";
import { listEntries, readEntry, isMacMetadata } from "../lib/unzip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };

console.log("sheetWitness");

// ── 1. parseCsv ─────────────────────────────────────────────────────────────

ok("a plain table is rows of fields", same(parseCsv("a,b,c\n1,2,3\n"), [["a", "b", "c"], ["1", "2", "3"]]));
ok("a trailing line break is not an extra empty row", parseCsv("a,b\n1,2\n").length === 2);
ok("a last line with no line break is still a row", same(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]));
ok("CRLF and a lone CR both end a row", same(parseCsv("a,b\r\n1,2\r3,4"), [["a", "b"], ["1", "2"], ["3", "4"]]));
ok("an empty field between two commas is an empty string", same(parseCsv("a,,c"), [["a", "", "c"]]));
ok("a trailing comma is a trailing empty field", same(parseCsv("a,b,\n"), [["a", "b", ""]]));
ok("a blank line between rows is one empty row, not a dropped one", same(parseCsv("a\n\nb"), [["a"], [""], ["b"]]));
ok("empty text is no rows", same(parseCsv(""), []));
ok("a comma inside quotes is data", same(parseCsv('"x,y",z'), [["x,y", "z"]]));
ok("a line break inside quotes is data — the field runs over lines and the row count holds",
  same(parseCsv('"line 1\nline 2\r\nline 3",b\n1,2'), [["line 1\nline 2\r\nline 3", "b"], ["1", "2"]]));
ok("a doubled quote inside quotes is one quote", same(parseCsv('"say ""hi""",x'), [['say "hi"', "x"]]));
ok("a quote in the middle of a bare field is kept as a character", same(parseCsv('5" display,x'), [['5" display', "x"]]));
ok("text after a closing quote up to the comma is kept in the same field", same(parseCsv('"ab"cd,x'), [["abcd", "x"]]));
{
  const e = threw(() => parseCsv('a,b\n"open,x\n1,2'));
  ok("an unterminated quote is an error, never one cell holding the rest of the file", e != null);
  ok("…and the error names the line the quote opened on", /line 2\b/.test(String(e?.message)), String(e?.message));
}

// ── 2. readCsv, sniffFormat, readSpreadsheet ─────────────────────────────────

{
  // The mark has to go BEFORE parsing, not with the cell trim: JavaScript's `\s`
  // matches U+FEFF, so a bare first cell would come out clean either way. What
  // the trim cannot rescue is a QUOTED first field — with the mark in front of
  // it the opening quote is mid-field, kept as a character, and the comma inside
  // splits the field in two. Excel writes exactly that: a mark, then a quoted
  // header. (None of this delivery's exports carries a mark; the case is pinned
  // here because no real file would catch it.)
  const [s] = readCsv(Buffer.from('﻿"Name, Inc",b\n1,2\n', "utf8"));
  ok("readCsv strips the byte-order mark Excel writes, before a quoted first field is parsed",
    same(s.rows, [["Name, Inc", "b"], ["1", "2"]]), JSON.stringify(s.rows));
  ok("readCsv returns one sheet named csv", s.name === "csv");
  // …and on the Latin-1 path, where the same three bytes decode to "ï»¿" and no
  // test of the decoded text for U+FEFF can see them. One byte that is not UTF-8
  // (0xE9, Latin-1 "é") sends the file there.
  const latinWithMark = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('"Name, Inc",caf', "latin1"), Buffer.from([0xe9]), Buffer.from("\n1,2\n", "latin1"),
  ]);
  const [l] = readCsv(latinWithMark);
  ok("…and the mark is stripped on the Latin-1 path too, so the quoted field still opens at its quote",
    same(l.rows, [["Name, Inc", "café"], ["1", "2"]]), JSON.stringify(l.rows));
}
{
  const [s] = readCsv(Buffer.from('"Unit 4,\n  Tower B\n  Mumbai",x\n', "utf8"));
  ok("readCsv collapses the whitespace inside a multi-line field, as the xlsx reader does",
    same(s.rows, [["Unit 4, Tower B Mumbai", "x"]]), JSON.stringify(s.rows));
}
{
  const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x31, 0x0a]); // "café,1\n" in Latin-1
  const [s] = readCsv(latin1);
  ok("bytes that are not valid UTF-8 decode as Latin-1, never to a replacement character",
    s.rows[0][0] === "café" && !s.rows[0][0].includes("�"), JSON.stringify(s.rows));
  const [u] = readCsv(Buffer.from("café,1\n", "utf8"));
  ok("valid UTF-8 decodes as UTF-8", u.rows[0][0] === "café");
}
ok("comma-separated text sniffs as csv", sniffFormat(Buffer.from("Date,Amount\n01-04-2026,12.50\n")) === "csv");
ok("…with a byte-order mark in front of it", sniffFormat(Buffer.from("﻿Date,Amount\n", "utf8")) === "csv");
ok("…and with blank lines before its first row", sniffFormat(Buffer.from("\n\n  \nDate,Amount\n")) === "csv");
ok("a NUL byte is binary, never csv", sniffFormat(Buffer.from([0x61, 0x2c, 0x62, 0x00, 0x0a])) === "unknown");
ok("a %PDF header is a PDF, whatever commas follow", sniffFormat(Buffer.from("%PDF-1.7\n1,2,3\n")) === "unknown");
ok("text whose first line has no comma is a note, not a table", sniffFormat(Buffer.from("Statement of account\na,b\n")) === "unknown");
ok("an empty file is not csv", sniffFormat(Buffer.alloc(0)) === "unknown");
ok("a ZIP signature is an Office Open XML workbook", sniffFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])) === "xlsx");
ok("an OLE signature is a legacy BIFF workbook", sniffFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) === "biff");
ok("an HTML table named .xls is an html-table", sniffFormat(Buffer.from("<html><table><tr><td>1</td></tr></table>")) === "html-table");
{
  const r = readSpreadsheet(Buffer.from("a,b\n1,2\n"));
  ok("readSpreadsheet reads a csv as one sheet with no error", r.format === "csv" && r.error === null && r.sheets.length === 1);
  const bad = readSpreadsheet(Buffer.from('a,b\n"open,x\n'));
  ok("an unreadable csv keeps its SNIFFED format, an error naming the cause, and no sheets",
    bad.format === "csv" && /unterminated/.test(String(bad.error)) && bad.sheets.length === 0, JSON.stringify({ f: bad.format, e: bad.error }));
  const u8 = readSpreadsheet(new Uint8Array(Buffer.from("a,b\n1,2\n")));
  ok("a Uint8Array is read as the same bytes a Buffer is", u8.format === "csv" && u8.sheets.length === 1);
}

// ── 2b. A genuine legacy BIFF .xls ───────────────────────────────────────────
//
// The October 2026 delivery's bank exports are real BIFF8 workbooks. The one
// built here has the shapes that matter: two sheets, a blank row, a row of
// empty strings, a value standing alone at C9, a boolean, a whole count, and
// two amounts a bank prints to the paisa that the General display format
// shortens. No real export is used — they carry account numbers and names.
{
  const book = XLSX.utils.book_new();
  const first = XLSX.utils.aoa_to_sheet([
    ["Date", "Narration", "Withdrawal", "Deposit", "Balance"],
    ["01/04/26", "  OPENING   BALANCE  ", null, null, 219778.32],
    ["06/04/26", "RTGS CR SOME FUND", null, 208039138.56, 208258916.88],
    [],
    ["", "", "", "", ""],
    ["Debits", 3583688673.57, "Count", 243, true],
  ]);
  XLSX.utils.sheet_add_aoa(first, [["lone"]], { origin: "C9" });
  XLSX.utils.book_append_sheet(book, first, "Sheet 1");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["second", 1.5]]), "Second");
  const bytes = XLSX.write(book, { type: "buffer", bookType: "biff8" });

  ok("the workbook built here is an OLE compound file, as the banks' exports are",
    bytes.subarray(0, 4).toString("hex") === "d0cf11e0" && sniffFormat(bytes) === "biff");
  const r = readSpreadsheet(bytes);
  ok("a BIFF workbook is read, with no error, every sheet in its order",
    r.format === "biff" && r.error === null && same(r.sheets.map((s) => s.name), ["Sheet 1", "Second"]),
    JSON.stringify({ f: r.format, e: r.error, n: r.sheets.map((s) => s.name) }));
  const rows = r.sheets[0]?.rows ?? [];

  // THE TRAP, measured rather than described: SheetJS's displayed text for these
  // two cells drops the paise, so a reader that took it would publish a different
  // figure. The assertion that it does is what makes the next one load-bearing.
  const shown = XLSX.read(bytes, { type: "buffer" }).Sheets["Sheet 1"];
  ok("SheetJS's displayed text shortens a large amount (the reason readBiff reads the stored value)",
    shown.D3?.w !== "208039138.56" && shown.B6?.w !== "3583688673.57", `${shown.D3?.w} · ${shown.B6?.w}`);
  ok("an amount is its stored value to the paisa, never its shortened display",
    rows[2]?.[3] === "208039138.56" && rows[5]?.[1] === "3583688673.57", JSON.stringify([rows[2]?.[3], rows[5]?.[1]]));
  ok("a cell keeps its own column — a value at C9 is the third cell of the ninth row",
    rows.length === 9 && same(rows[8], ["", "", "lone"]), JSON.stringify(rows[8]));
  ok("rows with nothing in them are kept, empty, so the sheet keeps its real shape",
    same(rows[3], []) && same(rows[4], []) && same(rows[6], []) && same(rows[7], []));
  ok("cells to the right of the last value are not padded on",
    same(rows[1], ["01/04/26", "OPENING BALANCE", "", "", "219778.32"]), JSON.stringify(rows[1]));
  ok("text is whitespace-collapsed and trimmed, as every other format here is", rows[1]?.[1] === "OPENING BALANCE");
  ok("a whole count is its digits, and a boolean is 1 or 0", rows[5]?.[3] === "243" && rows[5]?.[4] === "1", JSON.stringify(rows[5]));
  ok("the second sheet is read too", same(r.sheets[1]?.rows, [["second", "1.5"]]));
  ok("readBiff and readSpreadsheet return the same grid", same(readBiff(bytes), r.sheets));

  // The witness check sees the stored figure. Shortened to "3583688674" it would
  // be a whole number, not significant, and silently left out of the check — so
  // a PDF printing different paise would pass. Read at its stored value it is
  // checked, and the difference is reported.
  const pdfRight = "Opening 2,19,778.32 credit 20,80,39,138.56 balance 20,82,58,916.88 debits 3,58,36,88,673.57 and 1.5";
  const w = witnessCheck(r.sheets, pdfRight);
  ok("a BIFF export is witnessed by text that prints its figures, Indian grouping and all",
    w.checked === 5 && w.matched === 5 && w.unmatched.length === 0, JSON.stringify(w));
  const pdfWrongPaise = pdfRight.replace("3,58,36,88,673.57", "3,58,36,88,673.75");
  const w2 = witnessCheck(r.sheets, pdfWrongPaise);
  ok("…and a PDF printing different paise on one amount leaves exactly that amount unmatched",
    w2.checked === 5 && same(w2.unmatched, ["3583688673.57"]), JSON.stringify(w2));

  // An OLE file that is not a readable workbook is an ERROR with the sniffed
  // format — never a throw out of readSpreadsheet, never an empty grid.
  const corrupt = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600, 0x41)]);
  const truncated = bytes.subarray(0, 700);
  // SheetJS's OLE writer is on its CommonJS export only.
  const { CFB } = createRequire(import.meta.url)("xlsx");
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "/WordDocument", Buffer.from("a document, not a workbook"));
  const notABook = CFB.write(cfb, { type: "buffer" });
  for (const [label, b] of [["a corrupt OLE header", corrupt], ["a truncated workbook", truncated], ["an OLE file holding no workbook stream", notABook]]) {
    let res, err = null;
    try { res = readSpreadsheet(b); } catch (e) { err = e; }
    ok(`${label} is reported as an error, not thrown`, err === null, String(err?.message));
    ok(`${label} keeps the sniffed format biff, an error saying so, and no sheets`,
      res?.format === "biff" && /BIFF workbook/.test(String(res?.error)) && res?.sheets.length === 0,
      JSON.stringify({ f: res?.format, e: res?.error, n: res?.sheets?.length }));
  }
}

// ── 3. witnessCheck on constructed figures ───────────────────────────────────

const sheet = (...rows) => [{ name: "t", rows }];
{
  const r = witnessCheck(sheet(["2026", "15", "1,000", "0.5", "-0.25", "12/08/2026", "ABC 12.5", "12.5.1"]), "");
  ok("whole numbers, magnitudes under one, dates and text are not significant", r.checked === 0, JSON.stringify(r));
}
{
  const r = witnessCheck(sheet(["1234.56"]), "Balance 1,234.56 carried");
  ok("a figure the PDF prints is found", r.checked === 1 && r.matched === 1 && r.unmatched.length === 0, JSON.stringify(r));
}
ok("Indian grouping in the PDF is the same figure", witnessCheck(sheet(["1234567.89"]), "12,34,567.89").matched === 1);
ok("an export to six decimals is found at the two the PDF prints",
  witnessCheck(sheet(["1234.567891"]), "1,234.57").matched === 1);
ok("…and at the four it prints", witnessCheck(sheet(["1234.567891"]), "1,234.5679").matched === 1);
ok("one unit in the last place at two decimals is the PDF's own rounding, and is found",
  witnessCheck(sheet(["1234.56"]), "1,234.57").matched === 1);
ok("two units in the last place is a different figure, and is not",
  witnessCheck(sheet(["1234.56"]), "1,234.58").matched === 0);
ok("there is no tolerance at one decimal",
  witnessCheck(sheet(["1234.5"]), "1,234.6").matched === 0 && witnessCheck(sheet(["1234.5"]), "1,234.50").matched === 1);
ok("a whole number in the PDF never witnesses a fractional figure", witnessCheck(sheet(["1234.56"]), "1234 and 1235").matched === 0);
ok("a sign is not a figure — a negative is found as its parenthesised print",
  witnessCheck(sheet(["-1234.56"]), "(1,234.56)").matched === 1);
ok("…and as its trailing-minus print", witnessCheck(sheet(["1234.56-"]), "1,234.56").matched === 1);
ok("a percentage cell is the figure without its sign", witnessCheck(sheet(["12.34%"]), "weight 12.34").matched === 1);
{
  const r = witnessCheck(sheet(["9876.54", "9876.54"], ["1234.56"]), "1,234.56");
  ok("a figure the PDF does not print is reported, once however often it repeats",
    r.checked === 3 && r.matched === 1 && same(r.unmatched, ["9876.54"]), JSON.stringify(r));
}

// ── 4. The eighteen exports of the September 2026 delivery ───────────────────

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const manifest = readJson(path.join(AUDIT, "manifest.json"));
const witnessEntries = manifest.filter((m) => m.twinOf);
ok("the archive carries the eighteen exports of the September 2026 delivery as witnesses",
  witnessEntries.length === 18, `${witnessEntries.length} found`);
ok("no two manifest entries share a docKey", new Set(manifest.map((m) => m.docKey)).size === manifest.length);

const stem = (p) => path.basename(String(p)).replace(/\.[^.]+$/, "");
const sheetsOf = (dir) => fs.readdirSync(dir).filter((f) => /^sheet-.*\.json$/.test(f)).sort().map((f) => readJson(path.join(dir, f)));
const pdfTextOf = (docKey) => readJson(path.join(AUDIT, docKey, "pages.json")).pages.map((p) => p.text ?? "").join("\n");
const IDENTITY = new Set(["docKey", "provider", "accountNo", "ownerSource", "accountNoSource", "clientCode", "owner", "ownerId",
  "familyGroup", "strategy", "engagement", "providerEngagement", "asOf", "reportType", "sourcePath", "pages", "status", "twinOf"]);

/**
 * The bytes the export was read from. ASK's `.xlsx` are committed under
 * source/september-2026/; Marathon's `.csv` are entries of the two holders'
 * committed zips, extracted to the gitignored source/_extracted/ — so they are
 * read straight out of the zip, and the suite runs where only the committed
 * tree exists (CI).
 */
function bytesOf(sourcePath) {
  if (!sourcePath.startsWith("source/_extracted/")) return fs.readFileSync(path.join(ROOT, sourcePath));
  const parts = sourcePath.replace(/^source\/_extracted\//, "").split("/");
  const zipPath = path.join(ROOT, "source", parts[0], `${parts[1]}.zip`);
  const entryName = parts.slice(2).join("/");
  const buf = fs.readFileSync(zipPath);
  const entry = listEntries(buf).find((e) => !isMacMetadata(e.name) && e.name === entryName);
  if (!entry) throw new Error(`no entry ${entryName} in ${path.relative(ROOT, zipPath)}`);
  return readEntry(buf, entry);
}

const checked = new Map(); // docKey -> { sheets, pdfText, result }
let figures = 0;
let multiLineFieldSeen = false;
for (const m of witnessEntries) {
  const dir = path.join(AUDIT, m.docKey);
  const doc = readJson(path.join(dir, "document.json"));
  const prim = readJson(path.join(AUDIT, doc.twinOf, "document.json"));
  const ext = path.extname(doc.sourcePath).slice(1).toLowerCase();
  const label = m.docKey;

  ok(`${label}: the manifest and the document name one PDF`, m.twinOf === doc.twinOf);
  ok(`${label}: its docKey is its PDF's, suffixed with its own format`, doc.docKey === `${prim.docKey}-${ext}`);
  ok(`${label}: it witnesses a PDF, and that PDF witnesses nothing`,
    /\.pdf$/i.test(prim.sourcePath) && !prim.twinOf && (prim.status === "ok" || prim.status === "partial"));
  ok(`${label}: the PDF is the one beside it — same stem`, stem(doc.sourcePath) === stem(prim.sourcePath));
  ok(`${label}: same account, report and date as its PDF`,
    doc.provider === prim.provider && doc.accountNo === prim.accountNo && doc.asOf === prim.asOf && doc.reportType === prim.reportType);

  // No facts: every collection empty and every fact field null. The warnings
  // are the only array allowed to carry anything.
  const facts = Object.entries(doc).filter(([k]) => !IDENTITY.has(k) && k !== "warnings");
  const carrying = facts.filter(([, v]) => Array.isArray(v) ? v.length > 0 : v != null).map(([k]) => k);
  ok(`${label}: carries no facts`, carrying.length === 0, `carries ${carrying.join(", ")}`);
  ok(`${label}: status ok and one warning, witness-of`,
    doc.status === "ok" && same((doc.warnings ?? []).map((w) => w.code), ["witness-of"]),
    `${doc.status} ${(doc.warnings ?? []).map((w) => w.code).join(",")}`);

  // Re-read from its committed bytes: the archived sheet is what the reader
  // makes of the file, and nothing else.
  const sheets = sheetsOf(dir);
  let wb;
  try { wb = readSpreadsheet(bytesOf(doc.sourcePath)); } catch (e) { wb = { sheets: [], format: "?", error: e.message }; }
  ok(`${label}: re-read from its committed bytes it is the format its name says`, wb.format === ext && !wb.error, `${wb.format} ${wb.error ?? ""}`);
  ok(`${label}: …and reproduces the archived sheet exactly`,
    same(wb.sheets.map((s) => ({ name: s.name, rows: s.rows })), sheets.map((s) => ({ name: s.name, rows: s.rows }))),
    `${wb.sheets.length} sheet(s) re-read against ${sheets.length} archived`);
  if (ext === "csv") {
    try {
      const raw = parseCsv(bytesOf(doc.sourcePath).toString("utf8").replace(/^﻿/, ""));
      if (raw.some((r) => r.some((c) => /[\r\n]/.test(c)))) multiLineFieldSeen = true;
    } catch { /* the reproduction check above already reports an unreadable file */ }
  }

  // The witness: every significant figure is printed in its own PDF, and the
  // counts the archive states are the counts this re-check reaches.
  const pdfText = pdfTextOf(doc.twinOf);
  const r = witnessCheck(sheets, pdfText);
  figures += r.checked;
  checked.set(m.docKey, { sheets, pdfText, result: r, prim });
  ok(`${label}: carries figures to check`, r.checked > 0);
  ok(`${label}: every one of them is printed in its PDF`, r.matched === r.checked && r.unmatched.length === 0,
    `${r.matched} of ${r.checked}; ${r.unmatched.length} unmatched`);
  const stated = /(\d+) of the (\d+) significant figure/.exec(doc.warnings?.[0]?.detail ?? "");
  ok(`${label}: the archive states the counts this re-check reaches`,
    stated && Number(stated[1]) === r.matched && Number(stated[2]) === r.checked,
    `archive says ${stated ? `${stated[1]} of ${stated[2]}` : "nothing"}; re-check ${r.matched} of ${r.checked}`);
}
ok("Marathon's real export exercises the multi-line quoted field the parser exists for", multiLineFieldSeen);
ok("the eighteen exports carry a few thousand figures between them, not a token handful", figures > 1000, `${figures} checked`);
console.log(`  ${figures} significant figures across ${checked.size} exports, every one printed in its own PDF`);

// THE CHECK DISCRIMINATES. The same report for the other account of the same
// manager prints the same headings in the same layout; if the check passed
// there too it would be checking the layout, not the figures.
{
  const pairs = [];
  for (const [k, v] of checked) {
    const other = [...checked].find(([k2, v2]) => k2 !== k && v2.prim.provider === v.prim.provider
      && v2.prim.reportType === v.prim.reportType && v2.prim.accountNo !== v.prim.accountNo);
    if (other) pairs.push([k, v, other[1]]);
  }
  ok("every export has the other account's PDF of the same report to be set against", pairs.length === checked.size, `${pairs.length} pairs`);
  for (const [k, v, o] of pairs) {
    const r = witnessCheck(v.sheets, o.pdfText);
    ok(`${k}: NOT witnessed by the other account's PDF of the same report`, r.unmatched.length > 0,
      `${r.matched} of ${r.checked} found there`);
  }
}
{
  const [k, v] = [...checked][0];
  const empty = witnessCheck(v.sheets, "");
  ok(`${k}: against no text at all nothing is found`, empty.matched === 0 && empty.unmatched.length > 0);

  // One figure the PDF does not print, among the real ones, is reported — alone.
  const FOREIGN = "123456789.98";
  let replaced = false;
  const mutated = v.sheets.map((s) => ({
    ...s,
    rows: s.rows.map((row) => row.map((c) => {
      if (replaced) return c;
      const t = String(c ?? "").trim();
      if (/^-?[\d,]*\d\.\d+$/.test(t) && Math.abs(Number(t.replace(/,/g, ""))) >= 1 && !Number.isInteger(Number(t.replace(/,/g, "")))) {
        replaced = true;
        return FOREIGN;
      }
      return c;
    })),
  }));
  const r = witnessCheck(mutated, v.pdfText);
  ok(`${k}: one figure the PDF does not print is reported, and only that one`,
    replaced && r.checked === v.result.checked && same(r.unmatched, [FOREIGN]) && r.matched === v.result.checked - 1,
    `${r.matched} of ${r.checked}; unmatched ${r.unmatched.length}`);
}

// ── 5. Never a second source ─────────────────────────────────────────────────

{
  const book = fs.readFileSync(path.join(ROOT, "src/data/glowData.ts"), "utf8");
  const report = fs.readFileSync(path.join(ROOT, "docs/BOOK-REPORT.md"), "utf8");
  const primaries = [...checked.values()].map((v) => v.prim.docKey);
  const cited = primaries.filter((k) => book.includes(k));
  ok("the book cites the PDFs these exports witness — so a docKey is something it can cite", cited.length > 0, `${cited.length} cited`);
  const citedWitness = [...checked.keys()].filter((k) => book.includes(k));
  ok("the book cites no export", citedWitness.length === 0, citedWitness.join(", "));
  const reported = [...checked.keys()].filter((k) => report.includes(k));
  ok("the book's report names no export as a document of its own", reported.length === 0,
    `${reported.length} named, e.g. ${reported[0] ?? ""}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
