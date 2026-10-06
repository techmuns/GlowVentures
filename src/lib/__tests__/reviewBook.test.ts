// THE MOPWM REVIEW IN THE BOOK, CHECKED AGAINST THE WORKBOOK ITSELF (Stage 10dh).
//   npm run test:family
//
// At the family's instruction the consolidated review (MOPWM, 30 June 2026) is
// the SOURCE for private-market holdings: every private-market line it carries
// is an ordinary position in `BOOK_POSITIONS`, tagged `review` with the workbook
// cell it came from (`reviewSource`), so Morning CIO, the Portfolio Monitor,
// Private Market and every total read it like any other row. The failures worth
// catching here are the ones that render perfectly:
//
//   • a review line LEFT OUT — "make sure nothing is missed" — which still adds
//     up to itself on every page;
//   • a line counted TWICE, once from the review and once from a statement of
//     the same holding, which inflates every total by a figure that looks real;
//   • a figure read off the wrong row or the wrong column, which reads exactly
//     like the right one;
//   • a gain or a return struck on a line the review holds at cost.
//
// Every expectation is read off the workbook with SheetJS on the run, cell by
// cell — never through `scripts/lib/reviewBook.mjs` or
// `scripts/lib/reviewPrivateRead.mjs`, the code under test, which would agree
// with themselves by construction. `shared/reviewHolders.mjs` is read for ONE
// thing, the family's decision of which Private Investments lines a statement
// carries instead, and each of those patterns is held to the workbook here.
import path from "node:path";
import XLSX from "xlsx";
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_REVIEW_FLOWS, BOOK_REVIEW_SUPERSEDED,
  BOOK_REVIEW_WRITTEN_OFF, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS,
} from "@/data/glowData";
import type { Position } from "@/lib/types";
import { PRIVATE_INVESTMENT_ELSEWHERE } from "../../../shared/reviewHolders.mjs";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const CRORE = 1e7;
const WORKBOOK = "source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx";
const WB = XLSX.readFile(path.join(process.cwd(), WORKBOOK));

type Tab = "Private Investments" | "Alternate" | "Equity" | "Debt";
type Block = "Private Investments" | "PE Funds" | "Direct Equity - Unlisted" | "Debt";

const sheet = (name: string): XLSX.WorkSheet => {
  // The review's own sheet names carry stray spaces ("Private Investments ").
  const real = WB.SheetNames.find((n) => n.trim() === name.trim());
  const ws = real ? WB.Sheets[real] : undefined;
  if (!ws) throw new Error(`the review has no sheet "${name}"`);
  return ws;
};
/** One cell by its ABSOLUTE address (1-based row, 0-based column) — never a
 *  `sheet_to_json` index, which shifts when a sheet's range starts past column A. */
const cell = (tab: string, row: number, col: number): unknown =>
  sheet(tab)[XLSX.utils.encode_cell({ r: row - 1, c: col })]?.v ?? null;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lastRow = (tab: string) => XLSX.utils.decode_range(sheet(tab)["!ref"] as string).e.r + 1;
/** The column whose header CELL matches, on the tab's own header row — never a position. */
const headerCol = (tab: string, row: number, re: RegExp, optional = false): number => {
  for (let c = 0; c < 40; c++) if (re.test(text(cell(tab, row, c)))) return c;
  if (optional) return -1;
  throw new Error(`${tab}: no header matching ${re} on row ${row}`);
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number | null | undefined, b: number, tol: number) => a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** An Excel serial day, as a calendar date — the 1900 system, read by hand. */
const serialToIso = (serial: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);
const isoToText = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MON[Number(m) - 1]} ${y}`;
};

type Line = {
  tab: Tab; block: Block; row: number; product: string;
  cost: number | null; value: number | null; quantity: number | null;
  remark: string; date: unknown;
};
const keyOf = (tab: string, row: number) => `${tab}#${row}`;

// ── Read the four blocks ──────────────────────────────────────────────────────
// Private Investments: every line between its head ("Private Equity") and its
// own Total row. The three others: the lines after the head, accumulated until
// they reproduce the head's own cost AND value — the head is the block's total,
// so a block that never closes on it is a block this read got wrong.
const PI: Tab = "Private Investments";
const piCols = {
  product: headerCol(PI, 2, /^product$/i),
  date: headerCol(PI, 2, /date/i),
  cost: headerCol(PI, 2, /^investment at cost/i),
  value: headerCol(PI, 2, /^market value/i),
  remark: headerCol(PI, 2, /^remarks?$/i),
};
let piHead = -1, piTotal = -1;
for (let r = 3; r <= lastRow(PI); r++) {
  const p = text(cell(PI, r, piCols.product));
  if (piHead < 0 && p === "Private Equity") piHead = r;
  else if (piHead > 0 && p === "Total") { piTotal = r; break; }
}
if (piHead < 0 || piTotal < 0) throw new Error("the Private Investments tab has no Private Equity head or no Total row");
const piLines: Line[] = [];
for (let r = piHead + 1; r < piTotal; r++) {
  const product = text(cell(PI, r, piCols.product));
  if (!product) continue;
  piLines.push({
    tab: PI, block: "Private Investments", row: r, product,
    cost: num(cell(PI, r, piCols.cost)), value: num(cell(PI, r, piCols.value)), quantity: null,
    remark: text(cell(PI, r, piCols.remark)), date: cell(PI, r, piCols.date),
  });
}

const readBlock = (tab: Tab, head: string, block: Block): { lines: Line[]; closed: boolean } => {
  const cols = {
    product: headerCol(tab, 2, /^product$/i),
    cost: headerCol(tab, 2, /^investment at cost/i),
    value: headerCol(tab, 2, /^market value/i),
    quantity: headerCol(tab, 2, /^quantity$/i, true),
  };
  let headRow = -1;
  for (let r = 3; r <= lastRow(tab); r++) if (text(cell(tab, r, cols.product)) === head) { headRow = r; break; }
  if (headRow < 0) throw new Error(`${tab}: no "${head}" head`);
  const headCost = num(cell(tab, headRow, cols.cost)) ?? 0;
  const headValue = num(cell(tab, headRow, cols.value)) ?? 0;
  const lines: Line[] = [];
  let cost = 0, value = 0;
  for (let r = headRow + 1; r <= lastRow(tab); r++) {
    const product = text(cell(tab, r, cols.product));
    if (!product) continue;
    const c = num(cell(tab, r, cols.cost)), v = num(cell(tab, r, cols.value));
    lines.push({
      tab, block, row: r, product, cost: c, value: v,
      quantity: cols.quantity >= 0 ? num(cell(tab, r, cols.quantity)) : null,
      remark: "", date: null,
    });
    cost += c ?? 0; value += v ?? 0;
    // To the rupee, in crores.
    if (Math.abs(cost - headCost) * CRORE <= 1 && Math.abs(value - headValue) * CRORE <= 1) return { lines, closed: true };
  }
  return { lines, closed: false };
};
const pe = readBlock("Alternate", "PE Funds", "PE Funds");
const unlisted = readBlock("Equity", "Direct Equity - Unlisted", "Direct Equity - Unlisted");
const debt = readBlock("Debt", "PP Structures", "Debt");
const LINES: Line[] = [...piLines, ...pe.lines, ...unlisted.lines, ...debt.lines];
const LINE_BY_KEY = new Map(LINES.map((l) => [keyOf(l.tab, l.row), l]));

console.log("\n1. The workbook's private-market lines, read by header, closing on their own totals");
ok("the Private Investments tab lists 87 lines between its head and its Total", piLines.length === 87, `${piLines.length}`);
ok("every Private Investments line prints a cost and a value (a written-off line prints 0, never a blank)",
  piLines.every((l) => l.cost != null && l.value != null),
  piLines.filter((l) => l.cost == null || l.value == null).map((l) => `row ${l.row}`).join(", "));
ok("PE Funds closes on its own head figures", pe.closed && pe.lines.length === 6, `${pe.lines.length} lines, closed ${pe.closed}`);
ok("Direct Equity - Unlisted closes on its own head figures", unlisted.closed && unlisted.lines.length === 2, `${unlisted.lines.length} lines, closed ${unlisted.closed}`);
ok("PP Structures (the Debt tab's private credit) closes on its own head figures", debt.closed && debt.lines.length === 1, `${debt.lines.length} lines, closed ${debt.closed}`);
ok("96 private-market lines in all", LINES.length === 96, `${LINES.length}`);

// ── 2. Every line once ────────────────────────────────────────────────────────
console.log("\n2. Every private-market line has exactly one disposition: carried, written off, or carried by a statement");
const REVIEW: Position[] = BOOK_POSITIONS.filter((p) => p.review === true);
const rowsByLine = new Map<string, Position[]>();
const strays: string[] = [];
for (const p of REVIEW) {
  const src = p.reviewSource;
  if (!src) { strays.push(`${p.accountId}|${p.securityKey} (no reviewSource)`); continue; }
  const line = LINE_BY_KEY.get(keyOf(src.sheet, src.row));
  if (!line || line.block !== src.block) { strays.push(`${p.accountId}|${p.securityKey} → ${src.sheet} row ${src.row} (${src.block})`); continue; }
  const k = keyOf(src.sheet, src.row);
  rowsByLine.set(k, [...(rowsByLine.get(k) ?? []), p]);
}
ok("every review row names a line of its own block", strays.length === 0, strays.join("; "));
ok("no position that is not a review row carries a reviewSource",
  BOOK_POSITIONS.every((p) => p.review === true || p.reviewSource == null));

const writtenOffRows = new Set(piLines.filter((l) => /written\s*off/i.test(l.remark)).map((l) => l.row));
const bookWrittenOff = new Set(BOOK_REVIEW_WRITTEN_OFF.map((w) => w.reviewRow));
ok("the book's written-off list is exactly the lines the review marks Written Off",
  writtenOffRows.size === 22 && writtenOffRows.size === bookWrittenOff.size && [...writtenOffRows].every((r) => bookWrittenOff.has(r)),
  `review ${writtenOffRows.size}, book ${bookWrittenOff.size}`);
ok("each written-off entry names the review's own line",
  BOOK_REVIEW_WRITTEN_OFF.every((w) => {
    const line = piLines.find((l) => l.row === w.reviewRow);
    return !!line && norm(line.product).startsWith(norm(w.security)) && norm(w.security).length > 0;
  }));
ok("a written-off line prints no cost and no value — it is listed, never a figure",
  piLines.filter((l) => writtenOffRows.has(l.row)).every((l) => l.cost === 0 && l.value === 0));

const elsewhere = new Map<number, Line>();
const elseBad: string[] = [];
for (const e of PRIVATE_INVESTMENT_ELSEWHERE) {
  const hits = piLines.filter((l) => e.line.test(l.product));
  if (hits.length !== 1) elseBad.push(`${e.line} matches ${hits.length}`);
  else elsewhere.set(hits[0].row, hits[0]);
}
ok("each line the family's decision leaves to a statement matches exactly one Private Investments line",
  elseBad.length === 0 && elsewhere.size === 6, elseBad.join("; ") || `${elsewhere.size}`);

const carried = new Set(rowsByLine.keys());
const dispositions = LINES.map((l) => {
  const k = keyOf(l.tab, l.row);
  const d = [
    carried.has(k) ? "carried" : null,
    l.tab === PI && writtenOffRows.has(l.row) ? "written off" : null,
    l.tab === PI && elsewhere.has(l.row) ? "elsewhere" : null,
  ].filter(Boolean);
  return { l, d };
});
const none = dispositions.filter((x) => x.d.length === 0);
const twice = dispositions.filter((x) => x.d.length > 1);
ok("no line is left out", none.length === 0, none.map((x) => `${x.l.tab} row ${x.l.row} ${x.l.product}`).join("; "));
ok("no line has two dispositions", twice.length === 0, twice.map((x) => `${x.l.tab} row ${x.l.row}: ${x.d.join("+")}`).join("; "));
ok("68 lines are carried: 59 Private Investments, 6 PE funds, 2 unlisted shares and the credit line",
  carried.size === 68
  && piLines.filter((l) => carried.has(keyOf(PI, l.row))).length === 59
  && pe.lines.every((l) => carried.has(keyOf(l.tab, l.row)))
  && unlisted.lines.every((l) => carried.has(keyOf(l.tab, l.row)))
  && debt.lines.every((l) => carried.has(keyOf(l.tab, l.row))),
  `${carried.size}`);
ok("no review row sits on a written-off line or on one a statement carries",
  REVIEW.every((p) => !(p.reviewSource!.sheet === PI && (writtenOffRows.has(p.reviewSource!.row) || elsewhere.has(p.reviewSource!.row)))));

// ── 3. Each carried line's figures are the review's own ───────────────────────
console.log("\n3. Each carried line's value, cost and units are the review's own figures");
const sum = (ps: Position[], f: (p: Position) => number | null) => ps.reduce((s, p) => s + (f(p) ?? 0), 0);
/** What the review's dated rows say was PAID into a product — the cost of a line whose cost cell prints 0. */
const TSI = "Transactions since inception";
const tsiCols = { investor: 1, category: 4, product: 5, transaction: 6, date: 7, quantity: 8, rate: 9, value: 10 } as const;
// The header row is read, not assumed: every column above is checked by its own label.
const tsiHeader = (c: number) => text(cell(TSI, 4, c));
ok("the Transactions tab's columns are where this suite reads them",
  /investor/i.test(tsiHeader(tsiCols.investor)) && /categor/i.test(tsiHeader(tsiCols.category))
  && /product/i.test(tsiHeader(tsiCols.product)) && /transaction/i.test(tsiHeader(tsiCols.transaction))
  && /date/i.test(tsiHeader(tsiCols.date)) && /quantity/i.test(tsiHeader(tsiCols.quantity))
  && /rate/i.test(tsiHeader(tsiCols.rate)) && /value/i.test(tsiHeader(tsiCols.value)),
  [1, 4, 5, 6, 7, 8, 9, 10].map(tsiHeader).join(" | "));
type TsiRow = { row: number; investor: string; category: string; product: string; transaction: string; date: unknown; quantity: number | null; rate: number | null; value: number | null };
const TSI_ROWS: TsiRow[] = [];
for (let r = 5; r <= lastRow(TSI); r++) {
  const product = text(cell(TSI, r, tsiCols.product));
  if (!product) continue;
  TSI_ROWS.push({
    row: r, investor: text(cell(TSI, r, tsiCols.investor)), category: text(cell(TSI, r, tsiCols.category)), product,
    transaction: text(cell(TSI, r, tsiCols.transaction)), date: cell(TSI, r, tsiCols.date),
    quantity: num(cell(TSI, r, tsiCols.quantity)), rate: num(cell(TSI, r, tsiCols.rate)), value: num(cell(TSI, r, tsiCols.value)),
  });
}
const paidInto = (product: string) => -TSI_ROWS.filter((t) => t.product === product && /^purchase$/i.test(t.transaction)).reduce((s, t) => s + (t.value ?? 0), 0);

const valueBad: string[] = [], costBad: string[] = [], qtyBad: string[] = [];
for (const l of LINES) {
  const rows = rowsByLine.get(keyOf(l.tab, l.row));
  if (!rows) continue;
  const mv = sum(rows, (p) => p.marketValue);
  if (!near(mv, (l.value ?? 0) * CRORE, 1)) valueBad.push(`${l.product}: book ${mv.toFixed(2)} vs review ${((l.value ?? 0) * CRORE).toFixed(2)}`);
  const reviewCost = (l.cost ?? 0) * CRORE;
  const expectCost = reviewCost > 1 ? reviewCost : paidInto(l.product);
  const cost = sum(rows, (p) => p.costBasis);
  if (!(expectCost > 0) || !near(cost, expectCost, 1)) costBad.push(`${l.product}: book ${cost.toFixed(2)} vs ${expectCost.toFixed(2)}${reviewCost > 1 ? "" : " (paid, from its dated rows)"}`);
  if (l.quantity != null) {
    const q = sum(rows, (p) => p.quantity);
    if (Math.abs(q - l.quantity) > 1e-6) qtyBad.push(`${l.product}: book ${q} vs review ${l.quantity}`);
  }
}
ok("each carried line's value is the review's Market Value, to the rupee", valueBad.length === 0, valueBad.join("; "));
ok("each carried line's cost is the review's Investment at Cost — or, where that cell prints 0, what its dated rows paid in",
  costBad.length === 0, costBad.join("; "));
ok("where the review prints units, the line's rows hold exactly those units", qtyBad.length === 0, qtyBad.join("; "));
ok("…and that check had units to compare (the National Stock Exchange and Zepto lines print them)",
  LINES.filter((l) => l.quantity != null && rowsByLine.has(keyOf(l.tab, l.row))).length >= 2);

const atCostLines = new Set([
  ...piLines.filter((l) => carried.has(keyOf(PI, l.row))).map((l) => keyOf(PI, l.row)),
  ...pe.lines.filter((l) => /^sky capital titan rising funds 1$/i.test(l.product) || /^assetgro fintech/i.test(l.product)).map((l) => keyOf(l.tab, l.row)),
]);
ok("the review holds at cost exactly the 59 private investments, the Sky Capital fund and Assetgro",
  atCostLines.size === 61, `${atCostLines.size}`);
const atCostBad: string[] = [];
for (const p of REVIEW) {
  const k = keyOf(p.reviewSource!.sheet, p.reviewSource!.row);
  const atCost = atCostLines.has(k);
  if (atCost !== (p.valuedAtCost === true)) atCostBad.push(`${p.accountId}|${p.securityKey}: valuedAtCost ${p.valuedAtCost} but the line is ${atCost ? "" : "not "}at cost`);
  else if (atCost && !(near(p.marketValue, p.costBasis ?? NaN, 0.005) && p.unrealizedPnL == null && p.returnPct == null && p.currentPrice == null))
    atCostBad.push(`${p.accountId}|${p.securityKey}: held at cost but value ${p.marketValue} vs cost ${p.costBasis}, P&L ${p.unrealizedPnL}, return ${p.returnPct}, price ${p.currentPrice}`);
}
ok("a line held at cost is worth its cost and carries no gain, no return and no price — never a computed 0", atCostBad.length === 0, atCostBad.join("; "));

// ── 4. The Private Investments tab adds to its own Total ──────────────────────
console.log("\n4. The 87 Private Investments lines add to the tab's own Total, ₹136.16 Cr");
const piTotalCost = num(cell(PI, piTotal, piCols.cost)) ?? NaN;
const piSum = piLines.reduce((s, l) => s + (l.cost ?? 0), 0);
ok("the 87 lines' cost adds to the Total row's, to the rupee", Math.abs(piSum - piTotalCost) * CRORE <= 1,
  `${(piSum * CRORE).toFixed(2)} vs ${(piTotalCost * CRORE).toFixed(2)}`);
ok("the Total is ₹136.16 Cr", piTotalCost.toFixed(2) === "136.16", piTotalCost.toFixed(6));
const bookPiCost = sum(REVIEW.filter((p) => p.reviewSource!.block === "Private Investments"), (p) => p.costBasis);
const elsewhereCost = [...elsewhere.values()].reduce((s, l) => s + (l.cost ?? 0), 0) * CRORE;
ok("the book's Private Investments rows plus the lines a statement carries reproduce that Total",
  near(bookPiCost + elsewhereCost, piTotalCost * CRORE, 2),
  `${(bookPiCost + elsewhereCost).toFixed(2)} vs ${(piTotalCost * CRORE).toFixed(2)}`);

// ── 5. A valued line's gain is struck on its own two figures ──────────────────
console.log("\n5. A valued row's gain and return are its own value against its own cost");
const valued = REVIEW.filter((p) => p.valuedAtCost !== true);
const gainBad = valued.filter((p) => {
  if (p.costBasis == null || !(p.costBasis > 0)) return true;
  return !near(p.unrealizedPnL, r2(p.marketValue - p.costBasis), 0.011)
    || !near(p.returnPct, r2(((p.marketValue - p.costBasis) / p.costBasis) * 100), 0.011);
});
ok("every valued review row's P&L is value − cost and its return is that over cost", gainBad.length === 0,
  gainBad.map((p) => `${p.accountId}|${p.securityKey}`).join("; "));
ok("…and there were valued rows to check (the PE funds, the unlisted shares and the credit line)", valued.length >= 10, `${valued.length}`);

// ── 6. Nothing counted twice ──────────────────────────────────────────────────
console.log("\n6. Nothing is counted twice — a statement row the review stands for leaves the book");
const pairKey = (a: string, s: string) => `${a}|${s}`;
const reviewPairs = REVIEW.map((p) => pairKey(p.accountId, p.securityKey));
ok("no two review rows share an account and a security", new Set(reviewPairs).size === reviewPairs.length);
const reviewKeys = new Set(REVIEW.map((p) => p.securityKey));
const clash = BOOK_POSITIONS.filter((p) => p.review !== true && reviewKeys.has(p.securityKey));
ok("no statement position carries a security a review row carries", clash.length === 0,
  clash.map((p) => pairKey(p.accountId, p.securityKey)).join("; "));
const unvaluedClash = BOOK_UNVALUED_HOLDINGS.filter((u) => reviewKeys.has(u.securityKey));
ok("no quantity-only statement line carries a security a review row carries", unvaluedClash.length === 0,
  unvaluedClash.map((u) => pairKey(u.accountId, u.securityKey)).join("; "));

const supBad: string[] = [];
for (const s of BOOK_REVIEW_SUPERSEDED) {
  const k = pairKey(s.accountId, s.securityKey);
  if (s.kind === "position" && BOOK_POSITIONS.some((p) => p.review !== true && pairKey(p.accountId, p.securityKey) === k)) supBad.push(`${k}: still a position`);
  if (s.kind === "unvalued" && BOOK_UNVALUED_HOLDINGS.some((u) => pairKey(u.accountId, u.securityKey) === k)) supBad.push(`${k}: still a quantity-only line`);
  if (s.kind === "window" && Object.prototype.hasOwnProperty.call(BOOK_SHARE_MOVEMENTS, k)) supBad.push(`${k}: still a depository window`);
}
ok("every statement row the review stands for has left the book", supBad.length === 0, supBad.join("; "));

const ownerOf = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.ownerId]));
const supLineBad: string[] = [];
for (const s of BOOK_REVIEW_SUPERSEDED) {
  const want = norm(s.reviewLine);
  const exact = LINES.filter((l) => norm(l.product) === want);
  const hits = exact.length ? exact : LINES.filter((l) => norm(l.product).startsWith(want));
  if (hits.length !== 1) { supLineBad.push(`${s.reviewLine}: names ${hits.length} lines`); continue; }
  const line = hits[0];
  if (line.tab === PI && writtenOffRows.has(line.row)) continue; // written off: no row to own
  const rows = rowsByLine.get(keyOf(line.tab, line.row)) ?? [];
  if (!rows.length) { supLineBad.push(`${s.reviewLine}: its line is not carried`); continue; }
  const owner = ownerOf.get(s.accountId);
  if (!rows.some((p) => ownerOf.get(p.accountId) === owner)) supLineBad.push(`${s.reviewLine}: no row of ${owner}'s on its line`);
}
ok("each superseded statement row names one review line, carried for the same member (or written off)",
  supLineBad.length === 0, supLineBad.join("; "));
ok("…and that list is not empty (the book does supersede statement rows)", BOOK_REVIEW_SUPERSEDED.length > 0);

// ── 7. Each member's figures are the review's own summary ─────────────────────
console.log("\n7. Each member's review rows reproduce the review's Investorwise Summary");
const IW = "Investorwise Summary";
const MEMBER: Record<string, string> = {
  "Ajay Jaisinghani": "ajay-jaisinghani",
  "Aarti Ajay Jaisinghani": "aarti-jaisinghani",
  "Bharat Jaisinghani": "bharat-jaisinghani",
  "Ankita Jaisinghani": "ankita-jaisinghani",
  "Hope India Trust": "hope-india-trust",
  "Bharat Jaisinghani Family Trust": "bharat-jaisinghani-family-trust",
  "Bharat Jaisinghani Family Trust II": "bharat-jaisinghani-family-trust-2",
  "Bharat Jaisinghani Family Trust III": "bharat-jaisinghani-family-trust-3",
};
const memberCols: { col: number; ownerId: string }[] = [];
for (let c = 1; c < 30; c++) {
  const h = text(cell(IW, 3, c));
  if (h && !/allocation/i.test(h) && !/^category$/i.test(h) && MEMBER[h]) memberCols.push({ col: c, ownerId: MEMBER[h] });
}
ok("the summary's eight members are all read", memberCols.length === 8, `${memberCols.length}`);
const iwRow = (label: string) => {
  for (let r = 4; r <= lastRow(IW); r++) if (text(cell(IW, r, 1)) === label) return r;
  throw new Error(`${IW}: no "${label}" row`);
};
const ownerOfRow = (p: Position) => ownerOf.get(p.accountId) ?? "";
const byOwner = (ps: Position[], f: (p: Position) => number | null) => {
  const m = new Map<string, number>();
  for (const p of ps) m.set(ownerOfRow(p), (m.get(ownerOfRow(p)) ?? 0) + (f(p) ?? 0));
  return m;
};
for (const [label, block] of [["PE Funds", "PE Funds"], ["Direct Equity - Unlisted", "Direct Equity - Unlisted"], ["PP Structures", "Debt"]] as const) {
  const r = iwRow(label);
  const book = byOwner(REVIEW.filter((p) => p.reviewSource!.block === block), (p) => p.marketValue);
  const bad = memberCols.filter(({ col, ownerId }) => !near(book.get(ownerId) ?? 0, (num(cell(IW, r, col)) ?? 0) * CRORE, 1))
    .map(({ col, ownerId }) => `${ownerId}: book ${(book.get(ownerId) ?? 0).toFixed(2)} vs review ${((num(cell(IW, r, col)) ?? 0) * CRORE).toFixed(2)}`);
  ok(`"${label}": each member's rows are worth what the summary says, to the rupee`, bad.length === 0, bad.join("; "));
}
{
  const r = iwRow("Private Equity ( at Cost )");
  const book = byOwner(REVIEW.filter((p) => p.reviewSource!.block === "Private Investments"), (p) => p.costBasis);
  const gaps = memberCols.map(({ col, ownerId }) => ({ ownerId, gap: (num(cell(IW, r, col)) ?? 0) * CRORE - (book.get(ownerId) ?? 0) }));
  ok("no member's Private Investments rows exceed what the summary gives that member",
    gaps.every((g) => g.gap >= -2), gaps.filter((g) => g.gap < -2).map((g) => `${g.ownerId} ${g.gap.toFixed(2)}`).join("; "));
  const unattributed = sum(REVIEW.filter((p) => ownerOfRow(p) === "not-attributed"), (p) => p.costBasis);
  const gapSum = gaps.reduce((s, g) => s + g.gap, 0);
  ok("what the summary gives members beyond their rows is exactly the unattributed lines plus the lines a statement carries",
    near(gapSum, unattributed + elsewhereCost, 2),
    `gaps ${gapSum.toFixed(2)} vs unattributed ${unattributed.toFixed(2)} + elsewhere ${elsewhereCost.toFixed(2)}`);
  ok("…and some lines genuinely are unattributed (the review names no holder for them)", unattributed > 0);
}
ok("Aarti, Hope India Trust and the unnumbered trust hold no review row (the summary gives them none)",
  REVIEW.every((p) => !["aarti-jaisinghani", "hope-india-trust", "bharat-jaisinghani-family-trust"].includes(ownerOfRow(p))));

// ── 8. Dates are dates ────────────────────────────────────────────────────────
console.log("\n8. A date the review stores as an Excel serial reaches the book as a date");
const serialDated = BOOK_REVIEW_WRITTEN_OFF.filter((w) => num(piLines.find((l) => l.row === w.reviewRow)?.date) != null);
ok("no written-off line's date is a raw five-digit serial", BOOK_REVIEW_WRITTEN_OFF.every((w) => !/^\d{5}$/.test(w.dates ?? "")));
ok("each written-off line dated by a serial reads as that day",
  serialDated.every((w) => w.dates === isoToText(serialToIso(num(piLines.find((l) => l.row === w.reviewRow)!.date)!))),
  serialDated.filter((w) => w.dates !== isoToText(serialToIso(num(piLines.find((l) => l.row === w.reviewRow)!.date)!))).map((w) => `row ${w.reviewRow} "${w.dates}"`).join("; "));
ok("…and some written-off lines are serial-dated, so that check had a subject", serialDated.length > 0, `${serialDated.length}`);

// ── 9. The review's dated rows, behind each valued line ───────────────────────
console.log("\n9. The dated rows behind each review line are the Transactions tab's own, once each");
const KIND: Record<string, "purchase" | "sale" | "income"> = { purchase: "purchase", sale: "sale" };
const kindOf = (t: string) => KIND[t.toLowerCase()] ?? (/^div/i.test(t) ? "income" : null);
const rowFor = new Map(REVIEW.map((p) => [pairKey(p.accountId, p.securityKey), p]));
const flowBad: string[] = [];
const flowRows = new Set<number>();
for (const f of BOOK_REVIEW_FLOWS) {
  const t = TSI_ROWS.find((x) => x.row === f.reviewRow);
  const p = rowFor.get(pairKey(f.accountId, f.securityKey));
  if (!t) { flowBad.push(`row ${f.reviewRow}: not a Transactions row`); continue; }
  if (!p) { flowBad.push(`row ${f.reviewRow}: ${f.accountId}|${f.securityKey} is no review row`); continue; }
  if (flowRows.has(f.reviewRow)) flowBad.push(`row ${f.reviewRow}: carried twice`);
  flowRows.add(f.reviewRow);
  const line = LINE_BY_KEY.get(keyOf(p.reviewSource!.sheet, p.reviewSource!.row))!;
  if (t.product !== line.product) flowBad.push(`row ${f.reviewRow}: product "${t.product}" vs the line's "${line.product}"`);
  if (MEMBER[t.investor] !== ownerOf.get(f.accountId)) flowBad.push(`row ${f.reviewRow}: investor ${t.investor} vs ${ownerOf.get(f.accountId)}`);
  if (!near(f.amount, Math.abs(t.value ?? NaN), 0.01)) flowBad.push(`row ${f.reviewRow}: amount ${f.amount} vs ${t.value}`);
  if (num(t.date) == null || f.date !== serialToIso(num(t.date)!)) flowBad.push(`row ${f.reviewRow}: date ${f.date} vs ${String(t.date)}`);
  if (kindOf(t.transaction) !== f.kind) flowBad.push(`row ${f.reviewRow}: kind ${f.kind} vs "${t.transaction}"`);
  // A purchase the review prints no units or rate for (India SME's later
  // drawdowns print only the amount) carries none — never a 0, and never a
  // figure the row does not print. Where the row prints them, they are its own.
  const unitsOk = t.quantity == null ? f.units === null : near(f.units, Math.round(t.quantity * 1000) / 1000, 0.0005);
  const rateOk = t.rate == null ? f.rate === null : near(f.rate, t.rate, 1e-6);
  if (f.kind === "income" ? f.units !== null || f.rate !== null : !unitsOk || !rateOk)
    flowBad.push(`row ${f.reviewRow}: units ${f.units} / rate ${f.rate} vs ${t.quantity} / ${t.rate}`);
}
ok("every dated row in the book is the Transactions tab's row it names, for the right member, amount, date and kind",
  flowBad.length === 0, flowBad.slice(0, 8).join("; "));
const carriedProducts = new Set(LINES.filter((l) => l.tab !== PI && rowsByLine.has(keyOf(l.tab, l.row))).map((l) => l.product));
const wanted = TSI_ROWS.filter((t) => carriedProducts.has(t.product) && !/^closing/i.test(t.transaction));
const missing = wanted.filter((t) => !flowRows.has(t.row));
ok("every purchase, sale and payout the review dates for a carried fund, share or credit line is in the book, once",
  missing.length === 0 && wanted.length === flowRows.size,
  `${wanted.length} in the review, ${flowRows.size} in the book; missing ${missing.map((t) => t.row).join(",")}`);
ok("…and the review dates such rows (65 of them)", wanted.length === 65, `${wanted.length}`);

// ── 10. Who each row belongs to ───────────────────────────────────────────────
console.log("\n10. Each review row sits under a real account, and the review's own holder accounts say what they are");
const ACCOUNT_IDS = new Set(BOOK_ACCOUNTS.map((a) => a.accountId));
ok("every review row is a private-market holding whose cost is the review's",
  REVIEW.every((p) => p.marketSide === "private" && p.costBasisSource === "review" && ACCOUNT_IDS.has(p.accountId)));
const holders = BOOK_ACCOUNTS.filter((a) => a.reviewHolder === true);
ok("every review-holder account is named review-… and says it is the consolidated review",
  holders.length > 0 && holders.every((a) => a.accountId.startsWith("review-") && a.provider === "Consolidated review (MOPWM)"),
  holders.map((a) => `${a.accountId}: ${a.provider}`).join("; "));
ok("no statement account is named like a review-holder account",
  BOOK_ACCOUNTS.every((a) => a.reviewHolder === true || !a.accountId.startsWith("review-")));
ok("the lines the review names no holder for sit under one account that says so",
  BOOK_ACCOUNTS.some((a) => a.accountId === "review-not-attributed" && a.ownerId === "not-attributed"));
ok("Neo Infra Income Opportunities stays on its own statement",
  BOOK_POSITIONS.some((p) => /neo-infra/.test(p.securityKey)) && BOOK_POSITIONS.filter((p) => /neo-infra/.test(p.securityKey)).every((p) => p.review !== true));

// ── 11. Names kept off every page ─────────────────────────────────────────────
console.log("\n11. A name this dashboard keeps off every page does not arrive through the review");
const blob = JSON.stringify([REVIEW, BOOK_REVIEW_WRITTEN_OFF, BOOK_REVIEW_SUPERSEDED, BOOK_REVIEW_FLOWS]);
ok("no review row, written-off line, superseded row or dated row names Polycab or the register's sentinel", !/polycab|avendus/i.test(blob));

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall review-in-the-book checks passed");
