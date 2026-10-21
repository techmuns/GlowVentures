import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { excelCellValue, type TableExport } from "../tableExport";
import { createTableWorkbook } from "../exportTableExcel";
import { createConsolidatedWorkbook } from "../exportConsolidatedExcel";

const numeric = (text: string) => excelCellValue({ text, numeric: true });
assert.equal(numeric("₹1.01 Cr").value, 10100000);
assert.equal(numeric("−₹4.73 L").value, -473000);
assert.equal(numeric("(₹4.73 L)").value, -473000);
assert.equal(numeric("+23.15%").value, .2315);
assert.equal(numeric("₹0").value, 0);
assert.equal(numeric("—").value, "—");
assert.equal(numeric("15 of 634").value, "15 of 634");
assert.equal(numeric("2026-10-21").value, "2026-10-21");
assert.equal(numeric("001234").value, "001234");
assert.equal(numeric("12345678901234567").value, "12345678901234567");
assert.equal(excelCellValue({ text: "001234" }).value, "001234");

const snapshot: TableExport = { title: "Private Market — By brand", url: "https://example.test/private-market?view=brands", rows: [
  { kind: "header", cells: ["Brand", "Strategy", "Description", "Value", "HPR"].map(text => ({ text })) },
  ...Array.from({ length: 175 }, (_, i) => ({ kind: "body" as const, cells: [
    { text: `Investment ${i}`, hyperlink: `https://example.test/holding/${i}` },
    { text: "=1+1" }, { text: "Saved description\nSecond line" },
    { text: "₹1.01 Cr", numeric: true }, { text: "23.15%", numeric: true, note: "Measured to the statement date" },
  ] })),
  { kind: "footer", cells: [{ text: "Total", colSpan: 3 }, { text: "₹1.01 Cr", value: 10123456.789, format: '"₹"#,##0.00' }, { text: "—" }] },
] };
const book = createTableWorkbook(snapshot);
const reopened = new ExcelJS.Workbook();
await reopened.xlsx.load(await book.xlsx.writeBuffer());
const sheet = reopened.getWorksheet("Table")!;
assert.equal(sheet.rowCount, 177, "all rows survive workbook serialization, not just the first scroll batch");
assert.equal(sheet.getCell("A176").text, "Investment 174");
assert.equal(sheet.getCell("B2").value, "=1+1", "entered text cannot become an Excel formula");
assert.equal(sheet.getCell("B2").formula, undefined);
assert.equal(sheet.getCell("C2").value, "Saved description\nSecond line");
assert.equal(sheet.getCell("D2").value, 10100000);
assert.equal(sheet.getCell("E2").value, .2315);
assert.equal(sheet.getCell("E2").numFmt, "0.00%");
assert.equal(sheet.getCell("D177").value, 10123456.789, "explicit source precision wins over a rounded display");
assert.equal(sheet.getCell("E177").value, "—");
assert.equal(sheet.getCell("A177").master.address, sheet.getCell("C177").master.address);
assert.equal(sheet.getCell("A2").hyperlink, "https://example.test/holding/0");
assert.ok(sheet.views[0].state === "frozen");
assert.equal(sheet.views[0].ySplit, 1);
assert.equal(sheet.views[0].topLeftCell, "B2");
assert.ok(sheet.getColumn(4).width! >= "₹10,123,456.79".length + 2, "width includes the expanded, formatted source value");
assert.ok(sheet.getRow(2).height! >= 36, "explicit newlines have room for both lines");
assert.ok(reopened.getWorksheet("About")!.getCell("B2").text.includes("view=brands"));
assert.match(reopened.getWorksheet("About")!.getCell("B4").text, /All rows regardless of search, member and table filters/);

const multi = createTableWorkbook({ title: "Multi-row header", url: snapshot.url, rows: [
  { kind: "header", cells: [{ text: "Name", rowSpan: 2 }, { text: "Capital", colSpan: 2 }] },
  { kind: "header", cells: [{ text: "Paid in" }, { text: "Value" }] },
  { kind: "body", cells: [{ text: "Fund" }, { text: "0", numeric: true }, { text: "—" }] },
] }).getWorksheet("Table")!;
assert.equal(multi.getCell("A2").master.address, "A1");
assert.equal(multi.getCell("B2").value, "Paid in");
assert.equal(multi.getCell("C2").value, "Value");
assert.equal(multi.getCell("B3").value, 0);
assert.ok(multi.views[0].state === "frozen");
assert.equal(multi.views[0].ySplit, 2, "the complete multi-row header is frozen");
assert.equal(multi.views[0].topLeftCell, "B3");

const longName = "Export layout fixture with a deliberately long security name beyond the former fixed width";
const longDescription = "Long saved description with details that must remain readable. ".repeat(24);
const fitted = createTableWorkbook({ title: "Readability fixture", url: snapshot.url, rows: [
  { kind: "header", cells: ["Name", "Description", "Value"].map(text => ({ text })) },
  { kind: "body", cells: [{ text: "Short" }, { text: "Short" }, { text: "0", numeric: true }] },
  { kind: "body", cells: [{ text: longName }, { text: longDescription }, { text: "₹999.99 Cr", value: -123456789012345.67, format: '"₹"#,##0.00;[Red]("₹"#,##0.00)' }] },
] });
const fittedReloaded = new ExcelJS.Workbook();
await fittedReloaded.xlsx.load(await fitted.xlsx.writeBuffer());
const fittedSheet = fittedReloaded.getWorksheet("Table")!;
assert.ok(fittedSheet.getColumn(1).width! >= longName.length + 2, "width scans the last row as well as the header and first row");
assert.ok(fittedSheet.getColumn(3).width! >= "(₹123,456,789,012,345.67)".length + 2, "grouping, decimals, currency and negative parentheses fit");
assert.ok(fittedSheet.getRow(3).height! > 150, "long text grows beyond the previous clipped 150pt row");
assert.equal(fittedSheet.getCell("B3").alignment.wrapText, true);
assert.equal(fittedSheet.getCell("B3").text, longDescription);
assert.equal(fittedSheet.getCell("C3").value, -123456789012345.67, "layout does not change numeric precision");

const consolidated = createConsolidatedWorkbook({ client: "Layout fixture", asOf: "2026-10-21", totalValue: 0, documents: 0, tabs: [{
  name: "Start Here", note: longDescription,
  columns: [{ key: "name", label: "Name", format: "", width: 15 }, { key: "date", label: "Date", format: "dd-mmm-yyyy", width: 10 }, { key: "description", label: "Description", format: "", width: 20 }],
  rows: [{ values: [longName, "2026-10-21", longDescription] }],
}] }, snapshot.url);
const consolidatedReloaded = new ExcelJS.Workbook();
await consolidatedReloaded.xlsx.load(await consolidated.xlsx.writeBuffer());
const consolidatedSheet = consolidatedReloaded.getWorksheet("Start Here")!;
assert.ok(consolidatedSheet.views[0].state === "frozen");
assert.equal(consolidatedSheet.views[0].ySplit, 5);
assert.equal(consolidatedSheet.views[0].topLeftCell, "B6");
assert.ok(consolidatedSheet.getColumn(1).width! > 65, "consolidated widths grow beyond the former fixed cap for long values");
assert.ok(consolidatedSheet.getColumn(2).width! >= "21-Oct-2026".length + 2);
assert.ok(consolidatedSheet.getRow(6).height! > 150);
assert.ok(consolidatedSheet.getCell("B6").value instanceof Date);

// New tables cannot silently omit the standard export control.
for (const directory of ["src/pages", "src/components"]) for (const file of fs.readdirSync(directory).filter(name => name.endsWith(".tsx"))) {
  if (file === "ExportableTable.tsx") continue;
  assert.ok(!/<table\b/.test(fs.readFileSync(path.join(directory, file), "utf8")), `${file} must use ExportableTable`);
}
console.log("PASS: Excel numeric values, source precision, missing values, literal text, links, merged headings, 175 rows and export coverage");
