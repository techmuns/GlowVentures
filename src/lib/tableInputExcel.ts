import ExcelJS from "exceljs";
import { fitExcelWorksheet } from "./excelLayout";
import { validateInputChanges, type InputChange, type InputRecord } from "./tableInputs";

type Target = { sheet: string; cell: string; input: InputChange };
type ManifestCell = { address: string; value: string | number | boolean | null; input?: InputChange };
type Manifest = { version: 1; sheets: { name: string; rows: number; columns: number; merges: string[]; cells: ManifestCell[] }[] };
function plain(cell: ExcelJS.Cell): ManifestCell["value"] {
  const value = cell.value;
  if (value == null || value === "") return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if ("formula" in value || "sharedFormula" in value) throw new Error(`Formulas are not allowed in ${cell.address}. Enter numbers only.`);
  return cell.text;
}
export function addInputWorkbook(book: ExcelJS.Workbook, inputs: InputRecord[], targets: Target[]) {
  const groups = [
    { name: "Holding inputs", records: inputs.filter(r => r.kind === "holding") },
    { name: "Capital inputs", records: inputs.filter(r => r.kind === "capital" || r.kind === "private-capital") },
    { name: "Property inputs", records: inputs.filter(r => r.kind === "property") },
    { name: "Ownership inputs", records: inputs.filter(r => r.kind === "owner") },
    { name: "Call inputs", records: inputs.filter(r => r.kind === "call") },
  ];
  for (const group of groups) {
    if (!group.records.length) continue;
    const sheet = book.addWorksheet(group.name), fields = group.records[0].fields;
    sheet.addRow(["Investment", "Account", group.name === "Call inputs" ? "Due on" : "As of", ...fields.map(f => `${f.label}${f.unit ? ` (${f.unit === "area" ? "property's area unit" : f.unit})` : " (INR)"}`)]);
    for (const r of group.records) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(r.asOf) ? new Date(`${r.asOf}T00:00:00Z`) : r.asOf;
      const row = sheet.addRow([r.label, r.account, date, ...fields.map(f => r.values[f.key])]);
      if (date instanceof Date) row.getCell(3).numFmt = "dd-mmm-yyyy";
      fields.forEach((field, i) => {
        const cell = row.getCell(i + 4);
        cell.numFmt = field.unit === "%" ? "0.0%" : field.unit ? "#,##0.########" : '"₹"#,##0.00';
        targets.push({ sheet: sheet.name, cell: cell.address, input: { id: r.id, field: field.key, value: r.values[field.key], version: r.versions[field.key] ?? "", source: r.source } });
      });
    }
    sheet.getRow(1).eachCell(c => { c.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF26213E" } }; });
    sheet.autoFilter = `A1:${sheet.getRow(1).getCell(sheet.columnCount).address}`;
    fitExcelWorksheet(sheet, 1, 2, { maxWidths: { 1: 48, 2: 48 } });
  }
  const targetBy = new Map(targets.map(t => [`${t.sheet}:${t.cell}`, t.input]));
  const manifest: Manifest = { version: 1, sheets: [] };
  for (const sheet of book.worksheets.filter(s => s.name !== "About")) {
    const cells: ManifestCell[] = [];
    // Include blank editable cells. They must survive an Excel save as blanks,
    // not as zeros, and need a target even before a user fills them in.
    for (const target of targets.filter(t => t.sheet === sheet.name)) {
      const cell = sheet.getCell(target.cell), missing = target.input.value === null;
      cell.protection = { locked: false };
      cell.font = { ...cell.font, name: "Calibri", size: 11, color: { argb: "FF176B45" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: missing ? "FFFFE6A3" : "FFE8F4EC" } };
      cell.note = `Editable ${missing ? "— missing data. " : "— "}Enter ${inputs.find(r => r.id === target.input.id)?.fields.find(f => f.key === target.input.field)?.unit ?? "rupees (INR)"}. Keep the format. Clear an optional number to mark it unknown. User entries are saved separately from statements.${target.input.version ? ` User-entered on ${target.input.version.slice(0, 10)}.` : ""}`;
    }
    sheet.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const input = targetBy.get(`${sheet.name}:${cell.address}`), value = plain(cell);
      if (value !== null || input) cells.push({ address: cell.address, value, ...(input ? { input } : {}) });
    }));
    manifest.sheets.push({ name: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount, merges: [...(sheet.model.merges ?? [])].sort(), cells });
  }
  const metadata = book.addWorksheet("_Glow", { state: "veryHidden" });
  const text = JSON.stringify(manifest);
  for (let i = 0; i < text.length; i += 24000) metadata.addRow([text.slice(i, i + 24000)]);
  const about = book.getWorksheet("About")!;
  about.addRows([
    ["Edit and upload", "Keep the format; only fill in or correct numbers for the date shown. Yellow cells are missing data. Green cells can also be corrected. A holding kept at cost has no verified valuation; its valuation input is blank. Use the Holding inputs, Capital inputs, Property inputs, Ownership inputs or Call inputs sheets for other fields, then Upload Excel on any table. Call inputs update upcoming calls, separately from amounts already paid."],
    ["Calculated cells", "Totals, weights, returns, live prices and statement ledger records are read-only. Correct the investment inputs instead; the dashboard recalculates supported figures. Input sheets use rupees (INR), units and the source record's date. Property inputs are for the whole property."],
    ["Shared changes", "Changes are saved for everyone, separately from the original statements. A file with changed headings, added/deleted rows, formulas or stale edited inputs is refused. If the same number appears twice, change either copy; conflicting edits are refused."],
  ]);
  about.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; row.getCell(1).font = { bold: true }; });
  fitExcelWorksheet(about, 0);
}

export async function readInputWorkbook(bytes: ArrayBuffer, current: InputRecord[]): Promise<InputChange[]> {
  if (bytes.byteLength > 12_000_000) throw new Error("Use a dashboard Excel file smaller than 12 MB.");
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(bytes); } catch { throw new Error("This file could not be read. Upload the .xlsx file downloaded from this dashboard."); }
  const meta = book.getWorksheet("_Glow");
  if (!meta || meta.rowCount > 2000) throw new Error("This file cannot be synced. Download a fresh Excel file after saved numbers have loaded.");
  let manifest: Manifest;
  try { let text = ""; meta.eachRow(r => { text += r.getCell(1).text; }); manifest = JSON.parse(text); } catch { throw new Error("The file's format has changed. Download a fresh Excel file."); }
  if (!manifest! || manifest.version !== 1 || !Array.isArray(manifest.sheets) || manifest.sheets.length > 1000 || manifest.sheets.some(s => !s || typeof s.name !== "string"
    || !Number.isInteger(s.rows) || s.rows < 0 || s.rows > 1048576 || !Number.isInteger(s.columns) || s.columns < 1 || s.columns > 16384
    || !Array.isArray(s.merges) || !s.merges.every(m => typeof m === "string") || !Array.isArray(s.cells) || s.cells.length > 200000
    || s.cells.some(c => !c || typeof c.address !== "string" || (c.input && (typeof c.input.id !== "string" || typeof c.input.field !== "string" || typeof c.input.source !== "string" || typeof c.input.version !== "string"))))) throw new Error("The file's format has changed. Download a fresh Excel file.");
  if (book.worksheets.length !== manifest.sheets.length + 2) throw new Error("Keep the same worksheets. Download a fresh Excel file.");
  const changes = new Map<string, InputChange>();
  for (const expected of manifest.sheets) {
    const sheet = book.getWorksheet(expected.name);
    if (!sheet || sheet.rowCount !== expected.rows || sheet.columnCount !== expected.columns || JSON.stringify([...(sheet.model.merges ?? [])].sort()) !== JSON.stringify(expected.merges)) throw new Error(`Keep the rows and columns in ${expected.name} unchanged.`);
    const byAddress = new Map(expected.cells.map(c => [c.address, c]));
    sheet.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const value = plain(cell), previous = byAddress.get(cell.address);
      if (Object.is(value, previous?.value ?? null)) return;
      if (!previous?.input) throw new Error(`${sheet.name} ${cell.address} is calculated or identifies a row. Only change green or yellow number cells.`);
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Enter a number in ${sheet.name} ${cell.address}; do not add text or formulas.`);
      const change = { ...previous.input, value }, key = `${change.id}\n${change.field}`, existing = changes.get(key);
      if (existing && existing.value !== value) throw new Error("Two copies of the same number have different edits. Make them agree, or change just one copy.");
      changes.set(key, change);
    }));
  }
  const result = [...changes.values()];
  if (result.length) { const error = validateInputChanges(result, current); if (error) throw new Error(error); }
  return result;
}
