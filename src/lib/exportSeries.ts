// Excel export for the series store — the spec's "export data tables, charts,
// comparison tables into Excel".
//
// Two kinds of sheet: one RETURNS sheet carrying the table exactly as rendered,
// and one sheet per series carrying the observations the chart was drawn from.
// The point of exporting the raw observations alongside the summary is that a
// reader can rebuild every figure in the returns sheet from them — the same
// "trace it to the source" contract the portfolio export already honours.
//
// Every sheet states its provenance: the source name, the upstream symbol, the
// unit, and the retrieval time. An exported figure that has lost its unit is a
// figure nobody can check.
import ExcelJS from "exceljs";
import { HORIZON_COLS, fmtReturn, type Point, type SeriesEntry } from "./series";

const C = {
  ink: "FF151233",
  inkHead: "FF1F1B45",
  champagneText: "FFD9C48F",
  muted: "FF9A96B0",
  border: "FF2B2668",
};

const headerRow = (ws: ExcelJS.Worksheet, labels: string[], rowIdx: number) => {
  const row = ws.getRow(rowIdx);
  labels.forEach((l, i) => {
    const cell = row.getCell(i + 1);
    cell.value = l;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: C.champagneText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.inkHead } };
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right" };
    cell.border = { bottom: { style: "thin", color: { argb: C.border } } };
  });
  row.height = 18;
};

function titleBlock(ws: ExcelJS.Worksheet, span: number, title: string, subtitle: string) {
  const last = String.fromCharCode(64 + Math.max(span, 1));
  ws.mergeCells(`A1:${last}1`);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { name: "Calibri", size: 14, bold: true, color: { argb: C.champagneText } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ink } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(`A2:${last}2`);
  const s = ws.getCell("A2");
  s.value = subtitle;
  s.font = { name: "Calibri", size: 9, italic: true, color: { argb: C.muted } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 16;
}

/** Sheet names are capped at 31 chars by the format and must be unique. */
const safeName = (s: string, used: Set<string>) => {
  let base = s.replace(/[\\/*?:[\]]/g, "-").slice(0, 28);
  let name = base, n = 2;
  while (used.has(name)) name = `${base.slice(0, 26)}~${n++}`;
  used.add(name);
  return name;
};

export async function exportSeriesExcel(
  entries: SeriesEntry[],
  pointsById: Record<string, Point[]>,
  opts: { fileLabel: string; generatedAt: string },
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Glow Ventures Family Office";
  wb.created = new Date();

  // ── Returns sheet ─────────────────────────────────────────────────────────
  const cols = ["Series", "Group", "Unit", "As of", "Last", ...HORIZON_COLS.map((h) => h.label), "52W High", "52W Low", "Source", "Symbol"];
  const rs = wb.addWorksheet("Returns");
  titleBlock(rs, cols.length, "Glow Ventures — Macro returns table",
    `Harvested ${opts.generatedAt}. 3Y/5Y/10Y/Max are CAGR. A blank cell is a horizon the series does not reach back to — not a zero.`);
  headerRow(rs, cols, 4);
  entries.forEach((e, i) => {
    const row = rs.getRow(5 + i);
    const vals: (string | number | null)[] = [
      e.label, e.group, e.unit, e.last, e.last_value,
      ...HORIZON_COLS.map((h) => {
        const v = e.returns[h.key];
        return typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(4)) : null;
      }),
      e.high52, e.low52, e.source.name, e.source.symbol,
    ];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = { horizontal: ci === 0 || ci === 1 || ci === 2 || ci >= vals.length - 2 ? "left" : "right" };
      if (ci >= 5 && ci < 5 + HORIZON_COLS.length && typeof v === "number") {
        // Yield series are absolute percentage-point changes, price series are
        // percentage returns. Formatting them identically would misread one.
        cell.numFmt = e.kind === "yield" ? '+0.00"pp";-0.00"pp"' : '+0.0"%";-0.0"%"';
      }
    });
  });
  cols.forEach((c, i) => { rs.getColumn(i + 1).width = i === 0 ? 26 : Math.max(9, c.length + 2); });
  rs.views = [{ state: "frozen", ySplit: 4, xSplit: 1 }];

  // ── One sheet of observations per series ──────────────────────────────────
  const used = new Set<string>(["Returns"]);
  for (const e of entries) {
    const pts = pointsById[e.id];
    if (!pts?.length) continue;
    const ws = wb.addWorksheet(safeName(e.label, used));
    titleBlock(ws, 2, e.label,
      `${e.unit} · ${e.source.name} (${e.source.symbol}) · ${pts.length.toLocaleString()} observations ${pts[0].t} → ${pts[pts.length - 1].t} · retrieved ${e.retrievedAt}`);
    headerRow(ws, ["Date", `Value (${e.unit})`], 4);
    pts.forEach((p, i) => {
      const row = ws.getRow(5 + i);
      row.getCell(1).value = p.t;
      row.getCell(2).value = p.v;
      row.getCell(1).font = { name: "Calibri", size: 10 };
      row.getCell(2).font = { name: "Calibri", size: 10 };
      row.getCell(2).alignment = { horizontal: "right" };
    });
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 18;
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glow_${opts.fileLabel}_${opts.generatedAt.slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
