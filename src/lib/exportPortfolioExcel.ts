// Styled Excel export for the whole Portfolio Monitor tab (Holdings + the full
// transaction tape), carrying the dashboard's champagne-on-ink design language
// into the workbook. Values are in INR (the model's base currency) so a saved
// file never drifts with the FX rate.
import ExcelJS from "exceljs";
import type { Account, Position } from "./types";
import type { Txn } from "./ledger";
import { displaySecurity, fmtCr, DASH } from "./format";
import { accountIndex, ownerOf, engagementOf } from "./accounts";
import {
  sumOrNull, dedupedPositions, consolidatedMarketValue,
  holdingBucket, bucketLabel, holdingRoute, ROUTE_LABEL,
} from "./analytics";

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
  security: string; bucket: string; heldVia: string; sector: string; entities: string;
  qty: number; avgCost: number | null; cmp: number | null; marketValue: number;
  weight: number | null; pnl: number | null; returnPct: number | null;
};

/**
 * Consolidate positions into the rows the Holdings sheet exports — the full book,
 * independent of any on-screen filter, so the export is always complete.
 *
 * ONE ROW PER SECURITY **PER BUCKET**, because the tab this file is named after
 * is now sectioned by bucket (`holdingBucket`), and a workbook that flattens the
 * sections back out is no longer the tab it claims to be. Grouping on
 * securityKey alone also forces a single Class cell onto a name held two ways,
 * and there is no honest value to put in it: in this book `Cash` spans the
 * mandate sleeves (₹11.58 Cr, which belong to their manager's row) and the two
 * unmanaged cash rows, and one liquid ETF's securityKey arrives classed `ETF` on
 * one statement and `Mutual Fund` on another. Splitting keeps every cell a fact
 * about the rows under it; the grand total is unmoved either way.
 */
function consolidate(positions: Position[], accounts: Account[]): HoldingRow[] {
  const idx = accountIndex(accounts);
  // CONSOLIDATED export: each dedupeGroup counts once, so the grand total is the
  // book's true NAV and the dually-reported holdings appear at their real value
  // rather than 2×. Summing the raw set exported ₹3.17 Cr more than the book.
  const totalMV = consolidatedMarketValue(positions);
  const bySecurity = new Map<string, Position[]>();
  for (const p of positions) {
    const arr = bySecurity.get(p.securityKey);
    if (arr) arr.push(p); else bySecurity.set(p.securityKey, [p]);
  }
  const rows: HoldingRow[] = [];
  for (const raw of bySecurity.values()) {
    // Dedupe across the WHOLE security first and split afterwards, never the
    // other way round: a group collapsed inside each bucket separately would
    // survive once per bucket and be counted twice.
    const kept = new Set(dedupedPositions(raw));
    const groups = new Map<string, { kept: Position[]; raw: Position[] }>();
    for (const p of raw) {
      // Engagement comes from the ACCOUNT, never the position: how a holding is
      // run is a fact about the account holding it.
      const b = holdingBucket(p, engagementOf(idx, p));
      const g = groups.get(b) ?? { kept: [], raw: [] };
      g.raw.push(p);
      if (kept.has(p)) g.kept.push(p);
      groups.set(b, g);
    }
    for (const [bucket, g] of groups) {
      // Every row of this bucket was collapsed into an identical row counted in
      // another one, so it contributes nothing and must not be exported as a
      // zero-valued line. No dedupeGroup in this book spans two buckets; this is
      // written because the first one that did would otherwise be silent.
      if (!g.kept.length) continue;
      const ps = g.kept;
      const mv = ps.reduce((s, x) => s + x.marketValue, 0);
      // `sumOrNull`, not a plain sum: a position whose statement reported no cost
      // must not contribute a zero here. It would drag the group's average cost
      // down and export a return nobody measured.
      const cost = sumOrNull(ps.map((x) => x.costBasis));
      const qty = ps.reduce((s, x) => s + x.quantity, 0);
      const costNA = cost === null || (cost === 0 && mv > 0);
      rows.push({
        security: ps[0].security, bucket, sector: ps[0].sector,
        // Both of these are PER-ACCOUNT facts and read the RAW rows, not the
        // deduped ones: an owner whose statement was collapsed still reported
        // the holding, and so did the account that states the route.
        heldVia: [...new Set(g.raw.map((x) => ROUTE_LABEL[holdingRoute(engagementOf(idx, x))]))].join(", "),
        entities: [...new Set(g.raw.map((x) => ownerOf(idx, x)))].join(", "),
        // `cmp` is the per-unit mark and is genuinely absent for a holding whose
        // provider prints none (360 ONE marks its AIF at a Net Asset Value with no
        // NAV per unit). Exported as null so the sheet renders an empty cell, not
        // a zero price that would read as a measurement.
        qty, avgCost: !costNA && qty > 0 ? (cost as number) / qty : null, cmp: ps[0].currentPrice ?? null,
        marketValue: mv, weight: totalMV > 0 ? (mv / totalMV) * 100 : null,
        // NULL, NEVER 0. The cell already rendered an em dash; the zero survived
        // in the model and was summed into the Total row below.
        pnl: costNA ? null : mv - (cost as number),
        returnPct: costNA || (cost as number) <= 0 ? null : ((mv - (cost as number)) / (cost as number)) * 100,
      });
    }
  }
  // Sectioned like the tab: buckets in descending order of what they hold, names
  // in descending order within each. The order is DERIVED from the rows rather
  // than typed out, so it cannot drift away from the figures it is ordering.
  const bucketMV = new Map<string, number>();
  for (const r of rows) bucketMV.set(r.bucket, (bucketMV.get(r.bucket) ?? 0) + r.marketValue);
  return rows.sort((a, b) =>
    a.bucket === b.bucket
      ? b.marketValue - a.marketValue
      : (bucketMV.get(b.bucket) ?? 0) - (bucketMV.get(a.bucket) ?? 0) || a.bucket.localeCompare(b.bucket));
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
    // The two columns the regrouped tab turns on: WHICH SECTION this row sits in,
    // and WHO CHOSE IT. Without them the workbook flattens the tab's sections
    // back into one undifferentiated list.
    { header: "Class", width: 18 },
    { header: "Held via", width: 20 },
    { header: "Sector", width: 20 },
    { header: "Entities", width: 24 },
    { header: "Qty", width: 14, numFmt: QTY, align: "right" },
    { header: "Avg Cost (₹)", width: 13, numFmt: PRICE, align: "right" },
    { header: "CMP (₹)", width: 12, numFmt: PRICE, align: "right" },
    { header: "Market Value (₹)", width: 18, numFmt: MONEY, align: "right" },
    // Named on the header rather than left to be assumed: the denominator is the
    // WHOLE consolidated book — every class, listed and private — not the class
    // section the row sits in.
    { header: "Weight of book", width: 14, numFmt: '0.0"%"', align: "right" },
    { header: "Unreal. P&L (₹)", width: 18, numFmt: MONEY_SIGNED, align: "right", signed: true },
    { header: "Return", width: 11, numFmt: PCT, align: "right", signed: true },
  ];
  const asOf = new Date().toISOString().slice(0, 10);
  titleBlock(ws, cols.length,
    `Holdings · one row per security per class, in the Portfolio Monitor's own sections · `
    + `each dedupeGroup counted once · values in INR · exported ${asOf}`);
  headerRow(ws, cols, 3);

  const rows = consolidate(positions, accounts);
  let r = 4;
  for (const h of rows) {
    const zebra = (r % 2) === 0;
    const row = ws.getRow(r);
    styleDataCell(row.getCell(1), cols[0], displaySecurity(h.security), zebra);
    styleDataCell(row.getCell(2), cols[1], bucketLabel(h.bucket), zebra);
    styleDataCell(row.getCell(3), cols[2], h.heldVia, zebra);
    styleDataCell(row.getCell(4), cols[3], h.sector, zebra);
    styleDataCell(row.getCell(5), cols[4], h.entities, zebra);
    styleDataCell(row.getCell(6), cols[5], h.qty, zebra);
    styleDataCell(row.getCell(7), cols[6], h.avgCost ?? DASH, zebra);
    styleDataCell(row.getCell(8), cols[7], h.cmp, zebra);
    styleDataCell(row.getCell(9), cols[8], h.marketValue, zebra);
    styleDataCell(row.getCell(10), cols[9], h.weight ?? DASH, zebra);
    styleDataCell(row.getCell(11), cols[10], h.pnl ?? DASH, zebra, h.pnl ?? undefined);
    styleDataCell(row.getCell(12), cols[11], h.returnPct ?? DASH, zebra, h.returnPct ?? undefined);
    r++;
  }
  // Totals. Market value covers every row; unrealised P&L cannot, and says so.
  const totMV = rows.reduce((s, h) => s + h.marketValue, 0);
  // `sumOrNull`, not a plain sum over a column that carried a 0 for every
  // cost-less row. The cell already rendered an em dash while the zero went
  // silently into this total, dragging it towards a figure nobody measured. As
  // this drop stands that is 54 of 217 rows and ₹12,517.19 Cr of market value —
  // most of it the promoter stock a depository reports with no cost at all. They
  // are skipped and COUNTED, in the note printed under the total.
  const priced = rows.filter((h) => h.pnl !== null);
  const totPnL = sumOrNull(rows.map((h) => h.pnl));
  const unpricedRows = rows.length - priced.length;
  const unpricedMV = rows.reduce((s, h) => s + (h.pnl === null ? h.marketValue : 0), 0);
  const tr = ws.getRow(r);
  const set = (col: number, val: unknown, fmt?: string, signed?: number) => {
    const cell = tr.getCell(col);
    cell.value = val as any;
    if (fmt) cell.numFmt = fmt;
    const color = typeof signed === "number" ? (signed > 0 ? C.gain : signed < 0 ? C.loss : C.text) : C.text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: col >= 6 ? "right" : "left" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalFill } };
    cell.border = { top: { style: "thin", color: { argb: C.champagne } } };
  };
  set(1, `Total · ${rows.length} holdings`);
  for (let c = 2; c <= cols.length; c++) set(c, "");
  set(9, totMV, MONEY);
  set(11, totPnL ?? DASH, totPnL === null ? undefined : MONEY_SIGNED, totPnL ?? undefined);
  tr.height = 18;

  // WHAT THE TOTAL COVERS, printed under it rather than left to be discovered by
  // adding the column up. A P&L total struck over two thirds of the rows reads
  // exactly like one struck over all of them.
  r++;
  ws.mergeCells(r, 1, r, cols.length);
  const note = ws.getRow(r).getCell(1);
  note.value = unpricedRows === 0
    ? `Unrealised P&L covers all ${rows.length} rows. Market value covers all ${rows.length}.`
    : `Unrealised P&L covers ${priced.length} of ${rows.length} rows. The other ${unpricedRows}`
      + ` (${fmtCr(unpricedMV, 2)} of market value) report no cost basis on their statement — a depository`
      + ` holds shares, it did not buy them — and are left out of this total rather than counted as zero.`
      + ` Market value covers all ${rows.length}.`;
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: C.muted } };
  note.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: false };
  ws.getRow(r).height = 16;
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
