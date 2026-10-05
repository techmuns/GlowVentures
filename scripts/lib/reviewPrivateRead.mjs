// What the family's consolidated review (MOPWM, as on 30 June 2026) prints about
// PRIVATE MARKETS — read whole, every row with the Excel row it came from.
//
// The family's instruction of 5 Oct 2026 is to SHOW this on the dashboard. The
// review is still not a source for the BOOK (CLAUDE.md, "the consolidated review
// workbook is not a source — by decision"): nothing read here reaches
// glowData.ts, NAV or any statement total. It is shown beside them, as the
// review's own figures, at the review's own basis — private investments AT COST.
//
// Columns are found by HEADER TEXT, never by position (lib/table.mjs's rule): the
// review's tabs put the product in column 1 on some and column 2 on others.
import { readFileSync } from "node:fs";
import { readSpreadsheet } from "../ingest/lib/sheet.mjs";

export const REVIEW_WORKBOOK =
  "source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx";
export const REVIEW_AS_OF = "2026-06-30";

const CRORE = 1e7;
/** Crores as the review prints them → rupees, to the paisa. "" and "x" are null. */
export function croreToRupees(cell) {
  const v = num(cell);
  return v === null ? null : Math.round(v * CRORE * 100) / 100;
}
export function num(cell) {
  if (cell === undefined || cell === null) return null;
  const s = String(cell).trim();
  if (s === "" || /^(x|#n\/a|-)$/i.test(s)) return null;
  const v = Number(s.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}
const EPOCH = Date.UTC(1899, 11, 30);
/** An Excel serial date → ISO. Only a plausible date (1990–2030) is a date. */
export function serialToIso(cell) {
  const v = num(cell);
  if (v === null || !Number.isInteger(v) || v < 32874 || v > 47848) return null;
  return new Date(EPOCH + v * 864e5).toISOString().slice(0, 10);
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, march: 3 };
function monthOf(tok) {
  const m = /^([a-z]+)[\s'-]*(\d{2,4})$/i.exec(tok.trim());
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${y}-${String(mo).padStart(2, "0")}`;
}
/**
 * The review's "Date Investment Range" cell, read for what it is: a serial (one
 * day), a month range ("Jan 22 - May 23"), one month ("Feb-25"), or nothing
 * ("x", "#N/A", ""). A serial outside 1990–2030 is a SUM someone typed into a
 * date column (the totals carry 921871, 132206, 173635) — kept as printed.
 */
export function readDates(cell) {
  const text = cell === undefined || cell === null ? "" : String(cell).trim();
  if (text === "" || /^(x|#n\/a)$/i.test(text)) return { text, from: null, to: null, precision: null };
  if (/^\d+$/.test(text)) {
    const iso = serialToIso(text);
    return iso ? { text, from: iso, to: iso, precision: "day" } : { text, from: null, to: null, precision: "not-a-date" };
  }
  const parts = text.split(/\s*-\s*(?=[a-z])/i);
  const a = monthOf(parts[0]), b = monthOf(parts[parts.length - 1]);
  if (a && b) return { text, from: a, to: b, precision: "month" };
  return { text, from: null, to: null, precision: "unread" };
}

function sheet(wb, name) {
  const s = wb.sheets.find((x) => x.name.trim() === name);
  if (!s) throw new Error(`review: no "${name}" tab`);
  return s;
}
const norm = (c) => String(c ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
/** The header row carrying every label, and each label's column — by text. */
function header(s, want, optional = []) {
  const need = Object.keys(want).filter((k) => !optional.includes(k));
  for (let i = 0; i < Math.min(s.rows.length, 30); i++) {
    const r = s.rows[i] ?? [];
    const cols = {};
    for (const [k, re] of Object.entries(want)) {
      const j = r.findIndex((c) => re.test(norm(c)));
      if (j >= 0) cols[k] = j;
    }
    if (need.every((k) => k in cols)) return { row: i, cols };
  }
  throw new Error(`review "${s.name.trim()}": header not found (${Object.keys(want).join(", ")})`);
}
const at = (r, j) => (j === undefined ? "" : String(r?.[j] ?? "").trim());
const excelRow = (i) => i + 1;

const PI_COLS = { product: /^product$/, dates: /date investment range|investment date range/, cost: /^investment at cost$/, value: /^market value$/, alloc: /^allocation %$/, remark: /^remarks$/ };

/** Private Investments / Pre IPO / Excl Pre IPO: a head row, lines, a total. */
function readAtCostTab(wb, name) {
  const s = sheet(wb, name);
  const h = header(s, PI_COLS);
  const out = { tab: name, head: null, lines: [], total: null, after: [], header: excelRow(h.row) };
  for (let i = h.row + 1; i < s.rows.length; i++) {
    const r = s.rows[i] ?? [];
    const product = at(r, h.cols.product);
    const rec = {
      row: excelRow(i), product, dates: readDates(at(r, h.cols.dates)),
      cost: croreToRupees(at(r, h.cols.cost)), value: croreToRupees(at(r, h.cols.value)),
      alloc: num(at(r, h.cols.alloc)), remark: at(r, h.cols.remark) || null,
    };
    if (!product) {
      if (rec.cost !== null || rec.value !== null || r.some((c) => String(c ?? "").trim() !== "")) out.after.push({ row: rec.row, cells: r.map((c) => String(c ?? "").trim()) });
      continue;
    }
    if (/^private equity$/i.test(product)) { out.head = rec; continue; }
    if (/^total$/i.test(product)) { out.total = rec; continue; }
    if (out.total) { out.after.push({ row: rec.row, cells: r.map((c) => String(c ?? "").trim()) }); continue; }
    out.lines.push(rec);
  }
  return out;
}

const PERF_COLS = { product: /^product$/, dates: /investment date range/, cost: /^investment at cost( in crores)?$/, value: /^market value( in crores)?$/, income: /^dividend interest$/, benchmark: /^benchmark$/, alloc: /^allocation %$/, schemeAbs: /^scheme absolute %$/, indexAbs: /^index absolute %$/, schemeXirr: /^scheme xirr %$/, indexXirr: /^index xirr %$/ };
function perfRec(r, h, i) {
  const c = h.cols;
  return {
    row: excelRow(i), basket: at(r, 0) || null, product: at(r, c.product), dates: readDates(at(r, c.dates)),
    cost: croreToRupees(at(r, c.cost)), value: croreToRupees(at(r, c.value)), income: croreToRupees(at(r, c.income)),
    benchmark: at(r, c.benchmark) || null, alloc: num(at(r, c.alloc)),
    schemeAbs: num(at(r, c.schemeAbs)), indexAbs: num(at(r, c.indexAbs)),
    schemeXirr: num(at(r, c.schemeXirr)), indexXirr: num(at(r, c.indexXirr)),
    // the cells as printed, so "0" and "" stay told apart
    printed: { schemeAbs: at(r, c.schemeAbs), schemeXirr: at(r, c.schemeXirr), cost: at(r, c.cost) },
  };
}
/** A block on a performance tab: its head row by name, then lines to the next blank or head. */
function readBlock(wb, name, headName, extraCols = {}) {
  const s = sheet(wb, name);
  const h = header(s, { ...PERF_COLS, ...extraCols }, ["income"]);
  const start = s.rows.findIndex((r, i) => i > h.row && at(r, h.cols.product).toLowerCase() === headName.toLowerCase());
  if (start < 0) throw new Error(`review "${name}": no "${headName}" block`);
  const head = perfRec(s.rows[start], h, start);
  // A block's lines are the rows until they add to the head's own cost AND value,
  // to the rupee — the head is the witness, and a block that never ties is refused
  // rather than read short (or run on into the next category's rows).
  const lines = [];
  let cost = 0, value = 0;
  const tied = () => Math.abs(cost - (head.cost ?? 0)) <= 1 && Math.abs(value - (head.value ?? 0)) <= 1;
  for (let i = start + 1; i < s.rows.length && !(lines.length && tied()); i++) {
    const r = s.rows[i] ?? [];
    if (!at(r, h.cols.product)) continue;
    const rec = perfRec(r, h, i);
    for (const [k, j] of Object.entries(extraCols)) rec[k] = at(r, h.cols[k]) || null;
    lines.push(rec);
    cost += rec.cost ?? 0;
    value += rec.value ?? 0;
  }
  if (!tied()) throw new Error(`review "${name}": the "${headName}" lines do not add to their head (cost ${cost} vs ${head.cost}, value ${value} vs ${head.value})`);
  return { tab: name, head, lines, header: excelRow(h.row) };
}

/** The notes a tab prints below its table ("*Note: …", "4.Zepto at 7BN …"). */
function notes(wb, name, re) {
  const s = sheet(wb, name);
  return s.rows.flatMap((r, i) => {
    const cells = (r ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
    return cells.length === 1 && cells[0].length > 20 && re.test(cells[0]) ? [{ row: excelRow(i), text: cells[0] }] : [];
  });
}

/** Investorwise Summary: one figure per member for each private-market line. */
function readMembers(wb) {
  const s = sheet(wb, "Investorwise Summary");
  const hi = s.rows.findIndex((r) => norm(r?.[1]) === "category");
  if (hi < 0) throw new Error("review: Investorwise Summary header not found");
  const hr = s.rows[hi];
  const members = [];
  hr.forEach((c, j) => { const t = String(c ?? "").trim(); if (j > 1 && t && !/allocation/i.test(t)) members.push({ name: t, col: j }); });
  const line = (label) => {
    const i = s.rows.findIndex((r, k) => k > hi && norm(r?.[1]) === norm(label));
    if (i < 0) throw new Error(`review: Investorwise Summary has no "${label}" row`);
    return { row: excelRow(i), label: at(s.rows[i], 1), byMember: Object.fromEntries(members.map((m) => [m.name, croreToRupees(at(s.rows[i], m.col))])) };
  };
  const basis = s.rows.slice(0, hi).flat().map((c) => String(c ?? "").trim()).find((c) => /at cost/i.test(c)) ?? null;
  return { tab: "Investorwise Summary", header: excelRow(hi), basis, members: members.map((m) => m.name), unlisted: line("Direct Equity - Unlisted"), peFunds: line("PE Funds"), peAtCost: line("Private Equity ( at Cost )"), total: line("Total") };
}

/** Transactions since inception: the dated rows behind the private-market lines. */
function readTransactions(wb, keep) {
  const s = sheet(wb, "Transactions since inception");
  const h = header(s, { investor: /^investor$/, advisor: /^advisor$/, assetClass: /^asset class$/, category: /^category$/, product: /^product$/, txn: /^transaction$/, date: /^date$/, qty: /^quantity$/, rate: /^rate$/, value: /^value$/ });
  const c = h.cols;
  const rows = [];
  for (let i = h.row + 1; i < s.rows.length; i++) {
    const r = s.rows[i] ?? [];
    const rec = { row: excelRow(i), investor: at(r, c.investor), advisor: at(r, c.advisor), assetClass: at(r, c.assetClass), category: at(r, c.category), product: at(r, c.product), txn: at(r, c.txn), date: serialToIso(at(r, c.date)), qty: num(at(r, c.qty)), rate: num(at(r, c.rate)), value: num(at(r, c.value)) };
    if (keep(rec)) rows.push(rec);
  }
  return { tab: "Transactions since inception", header: excelRow(h.row), rows };
}

const PRIVATE_TSI = (r) => r.category === "PE Funds" || r.category === "Direct Equity - Unlisted" || (r.category === "PP Structures" && /k m global/i.test(r.product));

/** The Equity tab's own lines for named products (the now-listed private lines). */
function readEquityLines(wb, names) {
  const s = sheet(wb, "Equity");
  const h = header(s, { ...PERF_COLS, qty: /^quantity$/ }, ["income"]);
  return names.map((name) => {
    const i = s.rows.findIndex((r) => at(r, h.cols.product) === name);
    if (i < 0) throw new Error(`review Equity tab: no "${name}" line`);
    return { ...perfRec(s.rows[i], h, i), qty: num(at(s.rows[i], h.cols.qty)) };
  });
}

export function readReviewPrivate(wb, { listedNames = [] } = {}) {
  const debtCols = { qty: /^quantity$/ };
  const debt = (() => {
    const s = sheet(wb, "Debt");
    const h = header(s, { ...PERF_COLS, ...debtCols }, ["income"]);
    const i = s.rows.findIndex((r) => /k m global/i.test(at(r, h.cols.product)));
    if (i < 0) throw new Error("review: Debt tab carries no K M Global line");
    return { tab: "Debt", header: excelRow(h.row), lines: [perfRec(s.rows[i], h, i)] };
  })();
  return {
    workbook: REVIEW_WORKBOOK,
    asOf: REVIEW_AS_OF,
    privateInvestments: readAtCostTab(wb, "Private Investments"),
    preIpo: readAtCostTab(wb, "Pre IPO"),
    exclPreIpo: readAtCostTab(wb, "Private Equity Excl Pre IPO"),
    peFunds: { ...readBlock(wb, "Alternate", "PE Funds"), notes: notes(wb, "Alternate", /valuation|shown at cost|face value/i) },
    unlisted: { ...readBlock(wb, "Equity", "Direct Equity - Unlisted", { advisor: /^advisor$/, investor: /^investor$/, qty: /^quantity$/ }), notes: notes(wb, "Equity", /zepto|national stock exchange|unlisted/i) },
    credit: debt,
    members: readMembers(wb),
    listedOnEquityTab: readEquityLines(wb, listedNames),
    transactions: readTransactions(wb, PRIVATE_TSI),
  };
}

export function loadReviewPrivate(root = ".", opts) {
  return readReviewPrivate(readSpreadsheet(readFileSync(`${root}/${REVIEW_WORKBOOK}`)), opts);
}
