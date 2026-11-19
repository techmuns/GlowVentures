// ── PRIVATE MARKET REPORT → EXCEL (client #418) ─────────────────────────────
//
// *"… PDF, Excel, management-ready."* — Gaurav, 5 Nov 2026.
//
// The same `PrivateReportSnapshot` the PDF draws, written as a workbook so the
// family can sort, filter and pivot it: an Overview sheet (the capital &
// multiples summary) and an Investments sheet (one row per investment). Every
// money cell is a REAL NUMBER in the display currency — never a formatted
// string — so Excel can sum and sort it. A figure the records do not carry is
// left blank (never a zero), exactly as on the page and in the PDF.
import { fmtDate } from "./format";
import type { PrivateReportSnapshot } from "./privateReport";

/** A money cell: the converted number, or null (blank) where the record has none. */
const num = (s: PrivateReportSnapshot, n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? null : s.convert(n);

export async function exportPrivateReportExcel(s: PrivateReportSnapshot) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  book.creator = s.brand.provider;
  book.title = `${s.brand.name} — Private Market Review — ${s.date}`;

  const MONEY = '#,##0;[Red]-#,##0', MULT = '0.00"x"', PCT = '+0.00"%";[Red]-0.00"%"';
  const ink = "FF183338", teal = "FF0B4F54", head = "FFEDF2F1", band = "FFF4F6F5";
  const headFont = { name: "Calibri", size: 11, bold: true, color: { argb: "FF49606A" } } as const;
  const bodyFont = { name: "Calibri", size: 11, color: { argb: ink } } as const;

  // ── Overview sheet: brand block + Capital & Multiples ──────────────────────
  const ov = book.addWorksheet("Overview", { views: [{ showGridLines: false }] });
  ov.columns = [{ width: 42 }, { width: 22 }];
  const title = ov.getCell("A1");
  title.value = `${s.brand.name} — Private Market Review`;
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: teal } };
  ov.mergeCells("A1:B1");
  const sub = ov.getCell("A2");
  sub.value = `${s.scope} · ${s.period.label} · to ${fmtDate(s.date)} · ${s.currency} · prepared by ${s.brand.provider} · exported ${fmtDate(s.exportedOn)}`;
  sub.font = { name: "Calibri", size: 10, color: { argb: "FF63787A" } };
  ov.mergeCells("A2:B2");

  ov.getCell("A4").value = "Measure"; ov.getCell("B4").value = s.currency;
  ["A4", "B4"].forEach((a) => { const c = ov.getCell(a); c.font = headFont; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: head } }; });
  const t = s.totals;
  const metrics: [string, number | null, string][] = [
    ["Current value", num(s, t.value), MONEY],
    ["Recorded invested cost", num(s, t.invested), MONEY],
    ["Unrealised gain / loss (valued holdings)", num(s, t.unrealised), MONEY],
    ["Committed", num(s, t.committed), MONEY],
    ["Capital called", num(s, t.called), MONEY],
    ["Undrawn capital", num(s, t.undrawn), MONEY],
    ["Capital paid in", num(s, t.paidIn), MONEY],
    ["Distributions received", num(s, t.distributed), MONEY],
    ["TVPI (value + distributions / paid in)", t.tvpi ?? null, MULT],
    ["DPI (distributions / paid in)", t.dpi ?? null, MULT],
    ["RVPI (value / paid in)", t.rvpi ?? null, MULT],
  ];
  metrics.forEach(([label, value, fmt], i) => {
    const r = 5 + i;
    const a = ov.getCell(r, 1), b = ov.getCell(r, 2);
    a.value = label; a.font = bodyFont;
    if (value != null) { b.value = value; b.numFmt = fmt; }
    b.font = bodyFont; b.alignment = { horizontal: "right" };
    if (i % 2 === 1) [a, b].forEach((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: band } }));
  });
  const noteRow = 5 + metrics.length + 1;
  const note = ov.getCell(noteRow, 1);
  note.value = `Invested cost and unrealised gain cover the ${s.investedOf} of ${s.count} investments that report a cost. Multiples pool the ${s.multiplesOf} whose capital paid in is on record. Valuation dates: ${s.valuedSpan || "not available"}. Blank cells mean the records do not carry the figure — never zero.`;
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF63787A" } };
  note.alignment = { wrapText: true, vertical: "top" };
  ov.mergeCells(noteRow, 1, noteRow, 2);
  ov.getRow(noteRow).height = 48;

  // ── Investments sheet: one row per investment, real numbers ────────────────
  const inv = book.addWorksheet("Investments", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  const cols: { header: string; width: number; key: string }[] = [
    { header: "Investment", width: 42, key: "name" },
    { header: `Invested (${s.currency})`, width: 16, key: "invested" },
    { header: `Value (${s.currency})`, width: 16, key: "value" },
    { header: `Unrealised (${s.currency})`, width: 16, key: "unrealised" },
    { header: `Paid in (${s.currency})`, width: 16, key: "paidIn" },
    { header: `Distributed (${s.currency})`, width: 16, key: "distributed" },
    { header: "TVPI", width: 10, key: "tvpi" },
    { header: "IRR", width: 12, key: "irr" },
    { header: "Valued", width: 14, key: "valued" },
    { header: "At cost", width: 9, key: "atCost" },
  ];
  inv.columns = cols.map((c) => ({ width: c.width }));
  const headRow = inv.getRow(1);
  cols.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.header; cell.font = headFont;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: head } };
    cell.alignment = { horizontal: i === 0 || c.key === "valued" || c.key === "atCost" ? "left" : "right" };
  });
  s.rows.forEach((r, i) => {
    const row = inv.getRow(i + 2);
    const set = (col: number, value: string | number | null, fmt?: string, align: "left" | "right" = "right") => {
      const cell = row.getCell(col);
      if (value != null && value !== "") { cell.value = value; if (fmt) cell.numFmt = fmt; }
      cell.font = bodyFont; cell.alignment = { horizontal: align };
    };
    set(1, r.name, undefined, "left");
    set(2, num(s, r.invested), MONEY);
    set(3, num(s, r.value), MONEY);
    set(4, num(s, r.unrealised), MONEY);
    set(5, num(s, r.paidIn), MONEY);
    set(6, num(s, r.distributed), MONEY);
    set(7, r.tvpi ?? null, MULT);
    set(8, r.irrPct ?? null, PCT);
    if (r.irrPct != null && r.irrAnnualised) row.getCell(8).note = "Annualised (p.a.) — held a year or more";
    set(9, r.valuedAt ? fmtDate(r.valuedAt) : null, undefined, "left");
    set(10, r.atCost ? "Yes" : null, undefined, "left");
    if (i % 2 === 1) for (let c = 1; c <= cols.length; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: band } };
  });
  inv.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  const blob = new Blob([await book.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { blob, filename: `${s.brand.name.replace(/\s+/g, "-")}-Private-Market-${s.period.from ?? "available-history"}-to-${s.date}.xlsx` };
}
