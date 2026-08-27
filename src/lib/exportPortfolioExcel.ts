// Styled Excel export for the whole Portfolio Monitor tab (Holdings + the full
// transaction tape), carrying the dashboard's champagne-on-ink design language
// into the workbook. Values are in INR (the model's base currency) so a saved
// file never drifts with the FX rate.
import ExcelJS from "exceljs";
import type { Account, Position } from "./types";
import type { Txn } from "./ledger";
import { displaySecurity, fmtCr, DASH } from "./format";
import { accountIndex, accountOf, ownerOf, providerOf, engagementOf } from "./accounts";
import {
  sumOrNull, dedupedPositions, consolidatedMarketValue,
  holdingBucket, bucketLabel, holdingRoute, ROUTE_LABEL,
  isMandateHeld, mandateLabelWithOwner, MANDATE_BUCKET,
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
  /** The mandate this row sits in, or null for a row no manager runs. */
  mandate: string | null;
  /** The issuers whose statements carry this row — named when it reports no cost. */
  sources: string;
  /**
   * True when NO cost was reported for this row at all, as against a cost that
   * summed to zero beside a positive market value. Both are left out of the P&L
   * total — a zero cost books the whole holding as profit — and they are
   * different findings, so the note under the total counts them apart.
   */
  costNone: boolean;
  qty: number; avgCost: number | null; cmp: number | null; marketValue: number;
  weight: number | null; pnl: number | null; returnPct: number | null;
};

/**
 * Consolidate positions into the rows the Holdings sheet exports — the full book,
 * independent of any on-screen filter, so the export is always complete.
 *
 * ONE ROW PER SECURITY **PER BUCKET**, because the tab this file is named after
 * is sectioned by bucket (`holdingBucket`), and a workbook that flattens the
 * sections back out is no longer the tab it claims to be. Grouping on
 * securityKey alone also forces a single Class cell onto a name held two ways,
 * and there is no honest value to put in it: a `Cash` securityKey spans the
 * mandate sleeves (which belong to their manager) and the unmanaged cash rows,
 * and one liquid ETF's securityKey arrives classed `ETF` on one statement and
 * `Mutual Fund` on another. Splitting keeps every cell a fact about the rows
 * under it; the grand total is unmoved either way.
 *
 * AND ONE ROW PER **MANDATE** INSIDE THE PMS BUCKET, which is the half a flat
 * sheet was missing. The tab rolls a mandate's shares into one expandable row
 * that drills into `/mandate/<accountId>`; a workbook has no expansion, so the
 * mandate has to travel on the row itself. Merged on securityKey alone, a PMS
 * row routinely spans two or more mandates — these managers hold the same names
 * for several members — so the Mandate cell would have had to list
 * them all and the sheet still could not answer WHICH mandate holds a given
 * company, the question the regroup was built for. Split, every cell is one
 * fact and each mandate's rows sum to the mandate row on the tab.
 */
function consolidate(positions: Position[], accounts: Account[]): HoldingRow[] {
  const idx = accountIndex(accounts);
  // CONSOLIDATED export: each dedupeGroup counts once, so the grand total is the
  // book's true NAV and a holding reported on two members' statements appears at
  // its real value rather than 2×. A raw sum exported more than the book holds.
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
    const groups = new Map<string, { bucket: string; mandate: string | null; kept: Position[]; raw: Position[] }>();
    for (const p of raw) {
      // Engagement comes from the ACCOUNT, never the position: how a holding is
      // run is a fact about the account holding it.
      const eng = engagementOf(idx, p);
      const bucket = holdingBucket(p, eng);
      // A mandate-held row is grouped per MANDATE ACCOUNT as well as per bucket,
      // so its Mandate cell names one mandate rather than every manager that
      // happens to hold the name. The key is the accountId and never the label:
      // one strategy run for two members prints the same name on both.
      const mandate = isMandateHeld(eng) ? mandateLabelWithOwner(accountOf(idx, p), ownerOf(idx, p)) : null;
      const k = isMandateHeld(eng) ? MANDATE_BUCKET + "\u0000" + p.accountId : bucket;
      const g = groups.get(k) ?? { bucket, mandate, kept: [], raw: [] };
      g.raw.push(p);
      if (kept.has(p)) g.kept.push(p);
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      // Every row of this group was collapsed into an identical row counted in
      // another one, so it contributes nothing and must not be exported as a
      // zero-valued line. No dedupeGroup in this book spans two buckets; this is
      // written because the first one that did would otherwise be silent.
      if (!g.kept.length) continue;
      const bucket = g.bucket;
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
        mandate: g.mandate,
        // WHOSE STATEMENT THIS ROW CAME FROM, read off the registry. The note
        // under the Total names these for the rows that report no cost, so a
        // reader chasing a missing cost basis is sent to the right document
        // instead of to one cause asserted over all of them.
        sources: [...new Set(ps.map((x) => providerOf(idx, x)))].sort().join(" + "),
        costNone: cost === null,
        // `cmp` is the per-unit mark and is genuinely absent for a holding whose
        // provider prints none (360 ONE marks its AIF at a Net Asset Value with no
        // NAV per unit). Kept null here and rendered as an em dash by the caller,
        // never as a zero price that would read as a measurement.
        qty, avgCost: !costNA && qty > 0 ? (cost as number) / qty : null, cmp: ps[0].currentPrice ?? null,
        marketValue: mv, weight: totalMV > 0 ? (mv / totalMV) * 100 : null,
        // NULL, NEVER 0. The cell already rendered an em dash; the zero survived
        // in the model and was summed into the Total row below.
        pnl: costNA ? null : mv - (cost as number),
        returnPct: costNA || (cost as number) <= 0 ? null : ((mv - (cost as number)) / (cost as number)) * 100,
      });
    }
  }
  /**
   * READING ORDER, DERIVED FROM THE FIGURES: classes largest first, mandates
   * largest first inside the PMS class, names largest first inside each. Every
   * key is computed from the rows themselves, so the order cannot drift away
   * from the values it is ordering.
   *
   * It is deliberately NOT a copy of the tab's fixed section order. That list
   * lives in the page component and re-typing it here would give this book two
   * orders to disagree in — the subtitle says what this sheet does instead of
   * claiming to reproduce the tab's sections.
   */
  const bucketMV = new Map<string, number>();
  const mandateMV = new Map<string, number>();
  for (const r of rows) {
    bucketMV.set(r.bucket, (bucketMV.get(r.bucket) ?? 0) + r.marketValue);
    if (r.mandate) mandateMV.set(r.mandate, (mandateMV.get(r.mandate) ?? 0) + r.marketValue);
  }
  return rows.sort((a, b) => {
    if (a.bucket !== b.bucket) {
      return (bucketMV.get(b.bucket) ?? 0) - (bucketMV.get(a.bucket) ?? 0) || a.bucket.localeCompare(b.bucket);
    }
    if (a.mandate !== b.mandate) {
      return (mandateMV.get(b.mandate ?? "") ?? 0) - (mandateMV.get(a.mandate ?? "") ?? 0)
        || (a.mandate ?? "").localeCompare(b.mandate ?? "");
    }
    return b.marketValue - a.marketValue;
  });
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
    // The three columns the regrouped tab turns on: WHICH SECTION this row sits
    // in, WHO CHOSE IT, and — where a manager did — WHICH MANDATE. Without them
    // the workbook flattens the tab's sections back into one undifferentiated
    // list, and cannot answer which mandate holds a given company.
    { header: "Class", width: 18 },
    { header: "Held via", width: 20 },
    { header: "Mandate", width: 34 },
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
  // WHAT THIS SHEET DOES, not what another screen does. It used to claim the
  // rows were laid out "in the Portfolio Monitor's own sections", which a reader
  // can check and find false: the tab orders its sections by reading order and
  // rolls each mandate into ONE expandable row, while this sheet orders classes
  // by value and prints every constituent. The Class, Held via and Mandate
  // columns carry the tab's grouping; the subtitle no longer claims its layout.
  titleBlock(ws, cols.length,
    `Holdings · one row per security per class, and per mandate inside PMS mandates · `
    + `classes largest first · each dedupeGroup counted once · values in INR · exported ${asOf}`);
  headerRow(ws, cols, 3);

  const rows = consolidate(positions, accounts);
  let r = 4;
  for (const h of rows) {
    const zebra = (r % 2) === 0;
    const row = ws.getRow(r);
    styleDataCell(row.getCell(1), cols[0], displaySecurity(h.security), zebra);
    styleDataCell(row.getCell(2), cols[1], bucketLabel(h.bucket), zebra);
    styleDataCell(row.getCell(3), cols[2], h.heldVia, zebra);
    // DASH, like every other absent cell on the row: a row no manager runs has
    // no mandate, and a blank is a third state a reader cannot interpret.
    styleDataCell(row.getCell(4), cols[3], h.mandate ?? DASH, zebra);
    styleDataCell(row.getCell(5), cols[4], h.sector, zebra);
    styleDataCell(row.getCell(6), cols[5], h.entities, zebra);
    styleDataCell(row.getCell(7), cols[6], h.qty, zebra);
    styleDataCell(row.getCell(8), cols[7], h.avgCost ?? DASH, zebra);
    // `?? DASH` like the four money cells beside it. Written as null it rendered
    // an EMPTY cell — a third state next to their em dashes, and the one a
    // reader's own formula silently treats as zero.
    styleDataCell(row.getCell(9), cols[8], h.cmp ?? DASH, zebra);
    styleDataCell(row.getCell(10), cols[9], h.marketValue, zebra);
    styleDataCell(row.getCell(11), cols[10], h.weight ?? DASH, zebra);
    styleDataCell(row.getCell(12), cols[11], h.pnl ?? DASH, zebra, h.pnl ?? undefined);
    styleDataCell(row.getCell(13), cols[12], h.returnPct ?? DASH, zebra, h.returnPct ?? undefined);
    r++;
  }
  // Totals. Market value covers every row; unrealised P&L cannot, and says so.
  const totMV = rows.reduce((s, h) => s + h.marketValue, 0);
  // `sumOrNull`, not a plain sum over a column that carried a 0 for every
  // cost-less row. The cell already rendered an em dash while the zero went
  // silently into this total, dragging it towards a figure nobody measured. How
  // many rows that is, and what they are worth, is COUNTED into the note printed
  // under the total rather than stated here — a figure typed into a comment does
  // not regenerate with the book.
  const priced = rows.filter((h) => h.pnl !== null);
  const totPnL = sumOrNull(rows.map((h) => h.pnl));
  const unpricedRows = rows.length - priced.length;
  const unpricedMV = rows.reduce((s, h) => s + (h.pnl === null ? h.marketValue : 0), 0);
  /**
   * WHERE THE COST-LESS ROWS COME FROM, derived per row from the account behind
   * it. The note used to assert ONE cause for all of them — "a depository holds
   * shares, it did not buy them" — which is true of the demat rows and false of
   * the rest: a fund's own account statement and an AMC folio statement carry
   * rows here too, and a reader chasing one of those for a depository statement
   * is looking for a document that was never the source. Naming the issuers is a
   * measured fact about every row the sentence covers.
   */
  const bySource = new Map<string, number>();
  for (const h of rows) if (h.pnl === null) bySource.set(h.sources, (bySource.get(h.sources) ?? 0) + 1);
  // A cost of zero beside a positive market value is skipped for a different
  // reason than a cost nobody reported, so it is counted apart and the clause
  // naming it writes itself on the drop where one lands.
  const zeroCostRows = rows.filter((h) => h.pnl === null && !h.costNone).length;
  const sourceList = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${name} ${n} row${n === 1 ? "" : "s"}`)
    .join(", ");
  const tr = ws.getRow(r);
  const set = (col: number, val: unknown, fmt?: string, signed?: number) => {
    const cell = tr.getCell(col);
    cell.value = val as any;
    if (fmt) cell.numFmt = fmt;
    const color = typeof signed === "number" ? (signed > 0 ? C.gain : signed < 0 ? C.loss : C.text) : C.text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: col >= 7 ? "right" : "left" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalFill } };
    cell.border = { top: { style: "thin", color: { argb: C.champagne } } };
  };
  set(1, `Total · ${rows.length} holdings`);
  for (let c = 2; c <= cols.length; c++) set(c, "");
  set(10, totMV, MONEY);
  set(12, totPnL ?? DASH, totPnL === null ? undefined : MONEY_SIGNED, totPnL ?? undefined);
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
      + ` (${fmtCr(unpricedMV, 2)} of market value) have no cost basis this total can stand on, so they are`
      + ` left out of it rather than counted as zero`
      + (zeroCostRows > 0
        ? ` — ${zeroCostRows} of them report a cost of zero against a positive market value, which would book`
          + ` the whole holding as profit`
        : ``)
      + `. Whose statements they are: ${sourceList}. Market value covers all ${rows.length}.`;
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: C.muted } };
  // WRAPPED, AND THE ROW MADE TALL ENOUGH TO SHOW IT. A merged cell CLIPS rather
  // than overflowing, so at `wrapText: false` and a fixed 16pt this sentence —
  // the one thing standing between a P&L struck over part of the book and one
  // that reads as struck over all of it — was invisible in the file the moment
  // it outgrew the merged span by a character. Excel does not auto-fit a merged
  // row, so the height is computed: the span's own width in column units is the
  // characters that fit on a line (conservative at Calibri 9 against the
  // Calibri 11 those units are measured in).
  note.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
  const perLine = cols.reduce((w, c) => w + c.width, 0);
  ws.getRow(r).height = 14 * Math.max(1, Math.ceil(String(note.value).length / perLine)) + 4;
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
