// Styled Excel export for the whole Portfolio Monitor tab (Holdings + the full
// transaction tape), carrying the dashboard's champagne-on-ink design language
// into the workbook. Values are in INR (the model's base currency) so a saved
// file never drifts with the FX rate.
import ExcelJS from "exceljs";
import type { Account, Position } from "./types";
import type { Txn } from "./ledger";
import { displaySecurity } from "./format";
import { accountIndex, ownerOf } from "./accounts";

// Brand palette (ARGB — leading FF = opaque).
const C = {
  ink: "FF151233",
  inkHead: "FF1F1B45",
  champagne: "FFD9C48F",
  champagneText: "FFECDCAE",
  text: "FF1A1830",
  muted: "FF6B6880",
  gain: "FF059669",
  loss: "FFDC2626",
  border: "FFE4DDCD",
  zebra: "FFFAF8F1",
  totalFill: "FFF4F2EC",
};

type HoldingRow = {
  security: string; sector: string; entities: string; qty: number;
  avgCost: number; cmp: number; marketValue: number; weight: number;
  pnl: number; returnPct: number; costNA: boolean;
};

// Consolidate positions by security (matches the default Holdings view) — the full
// book, independent of any on-screen filter, so the export is always complete.
// Grouped on securityKey, so names arriving without an ISIN consolidate too.
function consolidate(positions: Position[], accounts: Account[]): HoldingRow[] {
  const idx = accountIndex(accounts);
  const totalMV = positions.reduce((s, p) => s + p.marketValue, 0);
  const m = new Map<string, Position[]>();
  for (const p of positions) {
    const arr = m.get(p.securityKey);
    if (arr) arr.push(p); else m.set(p.securityKey, [p]);
  }
  const rows = [...m.values()].map((ps): HoldingRow => {
    const mv = ps.reduce((s, x) => s + x.marketValue, 0);
    const cost = ps.reduce((s, x) => s + x.costBasis, 0);
    const qty = ps.reduce((s, x) => s + x.quantity, 0);
    const costNA = cost === 0 && mv > 0;
    const pnl = costNA ? 0 : mv - cost;
    return {
      security: ps[0].security, sector: ps[0].sector,
      entities: [...new Set(ps.map((x) => ownerOf(idx, x)))].join(", "),
      qty, avgCost: qty > 0 ? cost / qty : 0, cmp: ps[0].currentPrice,
      marketValue: mv, weight: totalMV > 0 ? (mv / totalMV) * 100 : 0,
      pnl, returnPct: costNA ? 0 : cost > 0 ? (pnl / cost) * 100 : 0, costNA,
    };
  });
  return rows.sort((a, b) => b.marketValue - a.marketValue);
}

type ColSpec = { header: string; width: number; numFmt?: string; align?: "left" | "right" | "center"; signed?: boolean };

function titleBlock(ws: ExcelJS.Worksheet, span: number, subtitle: string) {
  const last = String.fromCharCode(64 + span); // A..
  ws.mergeCells(`A1:${last}1`);
  const t = ws.getCell("A1");
  t.value = "Glow Ventures Family Office \u2014 Portfolio Monitor";
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

function headerRow(ws: ExcelJS.Worksheet, cols: ColSpec[], rowIdx: number) {
  const row = ws.getRow(rowIdx);
  cols.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.champagneText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.inkHead } };
    cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: C.champagne } } };
  });
  row.height = 20;
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
}

function styleDataCell(cell: ExcelJS.Cell, c: ColSpec, value: unknown, zebra: boolean, signedVal?: number) {
  cell.value = value as any;
  if (c.numFmt) cell.numFmt = c.numFmt;
  const color = c.signed && typeof signedVal === "number"
    ? (signedVal > 0 ? C.gain : signedVal < 0 ? C.loss : C.text)
    : C.text;
  cell.font = { name: "Calibri", size: 10, color: { argb: color } };
  cell.alignment = { vertical: "middle", horizontal: c.align ?? "left" };
  if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
}

const MONEY = '#,##0;[Red]-#,##0';
const MONEY_SIGNED = '+#,##0;-#,##0;0';
const PRICE = "#,##0.00";
const PCT = '+0.0"%";-0.0"%";0.0"%"';
const QTY = "#,##0";

function buildHoldings(wb: ExcelJS.Workbook, positions: Position[], accounts: Account[]) {
  const ws = wb.addWorksheet("Holdings", { views: [{ state: "frozen", ySplit: 3 }] });
  const cols: ColSpec[] = [
    { header: "Security", width: 34 },
    { header: "Sector", width: 20 },
    { header: "Entities", width: 24 },
    { header: "Qty", width: 14, numFmt: QTY, align: "right" },
    { header: "Avg Cost (₹)", width: 13, numFmt: PRICE, align: "right" },
    { header: "CMP (₹)", width: 12, numFmt: PRICE, align: "right" },
    { header: "Market Value (₹)", width: 18, numFmt: MONEY, align: "right" },
    { header: "Weight", width: 10, numFmt: '0.0"%"', align: "right" },
    { header: "Unreal. P&L (₹)", width: 18, numFmt: MONEY_SIGNED, align: "right", signed: true },
    { header: "Return", width: 11, numFmt: PCT, align: "right", signed: true },
  ];
  const asOf = new Date().toISOString().slice(0, 10);
  titleBlock(ws, cols.length, `Holdings · consolidated by security · values in INR · exported ${asOf}`);
  headerRow(ws, cols, 3);

  const rows = consolidate(positions, accounts);
  let r = 4;
  for (const h of rows) {
    const zebra = (r % 2) === 0;
    const row = ws.getRow(r);
    styleDataCell(row.getCell(1), cols[0], displaySecurity(h.security), zebra);
    styleDataCell(row.getCell(2), cols[1], h.sector, zebra);
    styleDataCell(row.getCell(3), cols[2], h.entities, zebra);
    styleDataCell(row.getCell(4), cols[3], h.qty, zebra);
    styleDataCell(row.getCell(5), cols[4], h.costNA ? "—" : h.avgCost, zebra);
    styleDataCell(row.getCell(6), cols[5], h.cmp, zebra);
    styleDataCell(row.getCell(7), cols[6], h.marketValue, zebra);
    styleDataCell(row.getCell(8), cols[7], h.weight, zebra);
    styleDataCell(row.getCell(9), cols[8], h.costNA ? "—" : h.pnl, zebra, h.pnl);
    styleDataCell(row.getCell(10), cols[9], h.costNA ? "—" : h.returnPct, zebra, h.returnPct);
    r++;
  }
  // Totals
  const totMV = rows.reduce((s, h) => s + h.marketValue, 0);
  const totPnL = rows.reduce((s, h) => s + h.pnl, 0);
  const tr = ws.getRow(r);
  const set = (col: number, val: unknown, fmt?: string, signed?: number) => {
    const cell = tr.getCell(col);
    cell.value = val as any;
    if (fmt) cell.numFmt = fmt;
    const color = typeof signed === "number" ? (signed > 0 ? C.gain : signed < 0 ? C.loss : C.text) : C.text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: col >= 4 ? "right" : "left" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalFill } };
    cell.border = { top: { style: "thin", color: { argb: C.champagne } } };
  };
  set(1, `Total · ${rows.length} holdings`);
  for (let c = 2; c <= cols.length; c++) set(c, "");
  set(7, totMV, MONEY);
  set(9, totPnL, MONEY_SIGNED, totPnL);
  tr.height = 18;
}

function buildTransactions(wb: ExcelJS.Workbook, txns: Txn[]) {
  const ws = wb.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 3 }] });
  const cols: ColSpec[] = [
    { header: "Date", width: 12, align: "left" },
    { header: "Security", width: 34 },
    { header: "Entity", width: 24 },
    { header: "Type", width: 8, align: "center" },
    { header: "Qty", width: 14, numFmt: QTY, align: "right" },
    { header: "Price (₹)", width: 12, numFmt: PRICE, align: "right" },
    { header: "Amount (₹)", width: 18, numFmt: MONEY, align: "right" },
    { header: "Realized P&L (₹)", width: 18, numFmt: MONEY_SIGNED, align: "right", signed: true },
  ];
  const asOf = new Date().toISOString().slice(0, 10);
  titleBlock(ws, cols.length, `Transactions · full dated buy/sell tape · values in INR · exported ${asOf}`);
  headerRow(ws, cols, 3);

  let r = 4;
  for (const t of txns) {
    const zebra = (r % 2) === 0;
    const row = ws.getRow(r);
    styleDataCell(row.getCell(1), cols[0], t.date, zebra);
    styleDataCell(row.getCell(2), cols[1], displaySecurity(t.security), zebra);
    styleDataCell(row.getCell(3), cols[2], t.account, zebra);
    styleDataCell(row.getCell(4), cols[3], t.side, zebra);
    styleDataCell(row.getCell(5), cols[4], Math.round(t.qty), zebra);
    styleDataCell(row.getCell(6), cols[5], t.price || "—", zebra);
    styleDataCell(row.getCell(7), cols[6], t.amount || "—", zebra);
    styleDataCell(row.getCell(8), cols[7], t.realized == null ? "—" : t.realized, zebra, t.realized ?? undefined);
    r++;
  }
}

// Build the styled workbook and trigger a browser download.
export async function exportPortfolioExcel(positions: Position[], accounts: Account[], txns: Txn[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Glow Ventures Family Office";
  wb.created = new Date();
  buildHoldings(wb, positions, accounts);
  buildTransactions(wb, txns);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glow-portfolio-monitor-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
