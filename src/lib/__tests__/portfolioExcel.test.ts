// THE EXCEL EXPORT'S COLUMN LAYOUT, CHECKED AGAINST THE GENERATED BOOK.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `exportPortfolioExcel.ts` had NO coverage of any kind, and it is the one
// artefact in this app whose defects are invisible on screen: a workbook whose
// columns have silently swapped opens perfectly, prints its header row exactly
// as before, and puts a sector where a reader's own SUM() formula expects a
// market value. Nothing in `npm run build`, `check:pages` or `check:family`
// looks inside the file — it is a download.
//
// Every cell used to be written as `row.getCell(9), cols[8]`: an index paired
// by hand with the spec that formats it, thirteen times over. Reordering the
// sheet to match the tab is precisely the edit that breaks that pairing, so the
// reorder and this suite landed together. `writeRow` now takes a record keyed
// by the same strings as `cols`, which is the ingest's own rule (`lib/table.mjs`
// — match on the HEADER, never on the column index) applied to the writing side.
//
// ── THE ANCHOR IS A GENERATED FIGURE ────────────────────────────────────────
//
// The strongest assertion here is that the footer's Market Value cell — LOCATED
// BY ITS HEADER, never by a literal column number — equals
// `BOOK_SUMMARY.totalValue` to the rupee. That field is produced by
// `build-book.mjs` from `source/` on a completely separate path from
// `consolidate()`, so the two agreeing is a real cross-check rather than a
// figure compared with its own copy, and it cannot go stale: when the next drop
// moves the book, both sides move together and this still passes.
//
// The column ORDER is written out as a literal, because it is the thing being
// asserted. A test that read the order off the file it is checking could not
// fail — this repo's own recurring lesson, and the reason `check:pages` strikes
// its invariants on rendered figures rather than on a caption's prose.
import ExcelJS from "exceljs";
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY } from "@/data/glowData";
import { buildPortfolioWorkbook } from "@/lib/exportPortfolioExcel";
import { DASH, displaySecurity } from "@/lib/format";
import type { Position } from "@/lib/types";
import type { Txn } from "@/lib/ledger";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

// A small, real-shaped tape. The transactions sheet takes what it is given and
// writes it, so the book's own tape (which lives in `public/audit/`, fetched at
// runtime) is not needed to check the LAYOUT.
const TXNS: Txn[] = [
  { date: "2026-08-13", security: "Shoppers Stop Ltd", securityKey: "shoppers-stop", side: "Buy",
    qty: 3860, price: 421.5, amount: 1627000, realized: null, account: "AJAY JAISINGHANI · V.E.C 128005",
    ownerId: "ajay" } as unknown as Txn,
  { date: "2026-08-10", security: "Aditya Birla Capital Ltd", securityKey: "aditya-birla-capital", side: "Sell",
    qty: 50369, price: 407.75, amount: 20537000, realized: 11600000, account: "AJAY T JAISINGHANI · Carnelian 3517383",
    ownerId: "ajay" } as unknown as Txn,
];

const wb = buildPortfolioWorkbook(BOOK_POSITIONS, BOOK_ACCOUNTS, TXNS);
const holdings = wb.getWorksheet("Holdings")!;
const txnSheet = wb.getWorksheet("Transactions")!;

/** The header row is row 3 on both sheets (rows 1–2 are the title block). */
const headersOf = (ws: ExcelJS.Worksheet): string[] => {
  const row = ws.getRow(3);
  const out: string[] = [];
  for (let c = 1; c <= row.cellCount; c++) {
    const v = row.getCell(c).value;
    if (v == null || v === "") break;
    out.push(String(v));
  }
  return out;
};
/** Every value in the column carrying this header — data rows only, footer excluded. */
const columnUnder = (ws: ExcelJS.Worksheet, header: string, lastRow: number): unknown[] => {
  const at = headersOf(ws).indexOf(header);
  if (at < 0) throw new Error(`no column headed "${header}"`);
  const out: unknown[] = [];
  for (let r = 4; r <= lastRow; r++) out.push(ws.getRow(r).getCell(at + 1).value);
  return out;
};

// ── 1. THE ORDER THE FAMILY ASKED FOR ───────────────────────────────────────
// "Reorder the columns so the money reads first and Sector / Entity close the
// table" — applied to the workbook as well as the tab. The three columns the
// screen does not carry (Class, Held via, Mandate) are descriptors too and
// close the sheet with them.
eq("Holdings columns: money first, descriptors last", headersOf(holdings), [
  "Security", "Qty", "Avg Cost (₹)", "CMP (₹)", "Market Value (₹)",
  "Weight of book", "Unreal. P&L (₹)", "Return", "YTD",
  "Class", "Held via", "Mandate", "Asset Class (family)", "Basket (family)", "Sector", "Entities",
]);
eq("Transactions columns: Entity closes the row", headersOf(txnSheet), [
  "Date", "Security", "Type", "Qty", "Price (₹)", "Amount (₹)", "Realized P&L (₹)", "Entity",
]);

// ── 2. THE FOOTER, LOCATED BY HEADER ────────────────────────────────────────
// `set(10, …)` and `set(12, …)` were literal column numbers and are `colAt`
// lookups now. If the footer's totals had stayed on the old indices they would
// land under Weight of book and Class — both of which this catches, because a
// header lookup is how the cell is found.
const footerRow = (() => {
  for (let r = 4; r <= holdings.rowCount; r++) {
    if (String(holdings.getRow(r).getCell(1).value ?? "").startsWith("Total ·")) return r;
  }
  throw new Error("no Total row on the Holdings sheet");
})();
const dataLast = footerRow - 1;
const nRows = dataLast - 3;
const footerAt = (header: string) => {
  const at = headersOf(holdings).indexOf(header);
  return holdings.getRow(footerRow).getCell(at + 1).value;
};

eq("the footer counts the rows above it", String(holdings.getRow(footerRow).getCell(1).value),
   `Total · ${nRows} holdings`);
// THE CROSS-CHECK: two independent paths to one figure. `BOOK_SUMMARY.totalValue`
// comes from build-book.mjs; this cell comes from `consolidate()` summing rows.
ok("the footer's Market Value ties to BOOK_SUMMARY.totalValue to the rupee",
   Math.abs(Number(footerAt("Market Value (₹)")) - BOOK_SUMMARY.totalValue) < 0.005,
   `${footerAt("Market Value (₹)")} vs ${BOOK_SUMMARY.totalValue}`);
// ...and the column adds to its own footer, so a market value written into the
// wrong column breaks the sum rather than passing silently.
const mvCells = columnUnder(holdings, "Market Value (₹)", dataLast);
ok("the Market Value column sums to its own footer",
   Math.abs(mvCells.reduce((s: number, v) => s + Number(v), 0) - Number(footerAt("Market Value (₹)"))) < 0.5,
   `${mvCells.length} rows`);
ok("the footer's Unreal. P&L is a signed number under its own header",
   typeof footerAt("Unreal. P&L (₹)") === "number",
   String(footerAt("Unreal. P&L (₹)")));

// ── 3. EVERY VALUE UNDER ITS OWN HEADER ─────────────────────────────────────
// The failure a header row alone cannot catch: the labels stay put and the
// VALUES move one column over. Struck per column on what that column can
// legitimately contain — a money column is a number or an em dash, a descriptor
// column is a non-numeric string and never either.
const numericOrDash = (v: unknown) => typeof v === "number" || v === DASH;
for (const h of ["Qty", "Avg Cost (₹)", "CMP (₹)", "Market Value (₹)", "Weight of book", "Unreal. P&L (₹)", "Return", "YTD"]) {
  const cells = columnUnder(holdings, h, dataLast);
  ok(`every cell under "${h}" is a figure or an em dash`,
     cells.length > 0 && cells.every(numericOrDash),
     `${cells.length} rows`);
}
for (const h of ["Security", "Class", "Held via", "Mandate", "Asset Class (family)", "Basket (family)", "Sector", "Entities"]) {
  const cells = columnUnder(holdings, h, dataLast);
  ok(`every cell under "${h}" is a descriptor, never a figure`,
     cells.length > 0 && cells.every((v) => typeof v === "string" && !/^-?[\d.]+$/.test(v)),
     `${cells.length} rows`);
}

// A row that reports no cost renders an em dash in all four cost-bearing
// columns — never a blank, which is the third state a reader's own formula
// treats as zero. This book has 60 such positions, so the case is real here.
const dashRows = columnUnder(holdings, "Avg Cost (₹)", dataLast).filter((v) => v === DASH).length;
ok("cost-less rows carry an em dash rather than an empty cell", dashRows > 0, `${dashRows} rows`);
ok("no cell under Avg Cost is null or blank",
   columnUnder(holdings, "Avg Cost (₹)", dataLast).every((v) => v != null && v !== ""));


// ── 3b. ONE MARK OR NONE, AND COST OVER THE COSTED LINES (A-03) ─────────────
// A row that clubs several statement lines prints a per-unit mark only where
// every line carries the SAME mark, and its average cost and P&L over the lines
// that report a cost. Re-expressed from the book, never by calling the helpers
// (`commonMark`, `costedFigures`) the export uses: a check that calls the helper
// it checks agrees with it by construction.
{
  const ACC = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
  const hs = headersOf(holdings);
  const ROWS: Record<string, unknown>[] = [];
  for (let r = 4; r <= dataLast; r++) {
    const row = holdings.getRow(r);
    const rec: Record<string, unknown> = {};
    hs.forEach((h, i) => { rec[h] = row.getCell(i + 1).value; });
    ROWS.push(rec);
  }
  const firstOfGroup = (ps: Position[]) => {
    const seen = new Set<string>();
    return ps.filter((p) => !p.dedupeGroup || (!seen.has(p.dedupeGroup) && (seen.add(p.dedupeGroup), true)));
  };
  // Subjects: a security held in two or more of the family's own accounts, of
  // one class and one engagement — one row by construction — whose name no
  // other security shares.
  const byKey = new Map<string, Position[]>();
  for (const p of BOOK_POSITIONS) {
    if (ACC.get(p.accountId)?.engagement === "PMS") continue;
    (byKey.get(p.securityKey) ?? byKey.set(p.securityKey, []).get(p.securityKey)!).push(p);
  }
  const keysOfName = new Map<string, Set<string>>();
  for (const [key, ps] of byKey) for (const p of ps) {
    const n = displaySecurity(p.security);
    (keysOfName.get(n) ?? keysOfName.set(n, new Set()).get(n)!).add(key);
  }
  let split = 0, single = 0;
  const bad: string[] = [];
  for (const [key, ps0] of byKey) {
    const ps = firstOfGroup(ps0);
    if (ps.length < 2) continue;
    if (new Set(ps.map((p) => p.assetClass)).size !== 1 || new Set(ps.map((p) => ACC.get(p.accountId)?.engagement)).size !== 1) continue;
    const names = new Set(ps.map((p) => displaySecurity(p.security)));
    if (names.size !== 1 || keysOfName.get([...names][0])!.size !== 1) continue;
    const marks = [...new Set(ps.filter((p) => typeof p.currentPrice === "number").map((p) => (p.currentPrice as number).toFixed(2)))];
    const row = ROWS.filter((r) => r["Security"] === [...names][0] && r["Mandate"] === DASH);
    if (row.length !== 1) { bad.push(`${key}: ${row.length} rows`); continue; }
    if (marks.length > 1) {
      split++;
      if (row[0]["CMP (₹)"] !== DASH) bad.push(`${key}: CMP ${row[0]["CMP (₹)"]} over marks ${marks.join(" / ")}`);
    } else if (marks.length === 1) {
      single++;
      if (typeof row[0]["CMP (₹)"] !== "number" || (row[0]["CMP (₹)"] as number).toFixed(2) !== marks[0]) {
        bad.push(`${key}: CMP ${row[0]["CMP (₹)"]} where every line is marked ${marks[0]}`);
      }
    }
  }
  ok("a row whose lines disagree on a mark prints no CMP; one whose lines agree prints it",
     split > 0 && bad.length === 0, bad.join("; ") || `${split} split, ${single} agreeing`);

  // COST OVER THE COSTED LINES, on a constructed pair — this book's partly
  // costed holdings all sit across a mandate and a demat, which the sheet
  // splits into rows of their own, so the case can only be exercised here.
  const direct = BOOK_ACCOUNTS.filter((a) => a.engagement === "Direct").slice(0, 2);
  const base = { securityKey: "test-partly-costed", security: "Test Partly Costed Ltd", assetClass: "Equity",
    sector: "Industrials", providerSector: null, isin: null, symbol: null, marketSide: "listed" } as unknown as Position;
  const pair: Position[] = [
    { ...base, accountId: direct[0].accountId, quantity: 100, costBasis: 10000, avgCost: 100, currentPrice: 120,
      marketValue: 12000, unrealizedPnL: 2000, returnPct: 20, realizedPnL: null } as unknown as Position,
    { ...base, accountId: direct[1].accountId, quantity: 300, costBasis: null, avgCost: null, currentPrice: 120,
      marketValue: 36000, unrealizedPnL: null, returnPct: null, realizedPnL: null } as unknown as Position,
  ];
  const pw = buildPortfolioWorkbook(pair, BOOK_ACCOUNTS, []).getWorksheet("Holdings")!;
  const ph = headersOf(pw);
  const at = (h: string) => pw.getRow(4).getCell(ph.indexOf(h) + 1).value;
  ok("a partly costed row's average cost and P&L are struck over the costed units alone",
     direct.length === 2 && String(pw.getRow(5).getCell(1).value).startsWith("Total ·")
       && at("Avg Cost (₹)") === 100 && at("Unreal. P&L (₹)") === 2000 && at("CMP (₹)") === 120,
     `${at("Avg Cost (₹)")} / ${at("Unreal. P&L (₹)")} / ${at("CMP (₹)")}`);
}

// ── 4. THE TRANSACTIONS TAPE, SAME TEST ─────────────────────────────────────
eq("the tape's Entity column carries the account label",
   columnUnder(txnSheet, "Entity", 3 + TXNS.length),
   TXNS.map((t) => t.account));
eq("...and Type carries the side, not the entity",
   columnUnder(txnSheet, "Type", 3 + TXNS.length),
   TXNS.map((t) => t.side));
eq("...and Amount carries the amount",
   columnUnder(txnSheet, "Amount (₹)", 3 + TXNS.length),
   TXNS.map((t) => t.amount));
// The sell realised a gain and the buy realised nothing: an em dash, never a 0,
// which would report a buy as having broken even.
eq("a trade with no realised figure is an em dash, not a zero",
   columnUnder(txnSheet, "Realized P&L (₹)", 3 + TXNS.length),
   [DASH, TXNS[1].realized]);


// ── 5. THE FAMILY'S TWO AXES TRAVEL WITH THE SHEET ──────────────────────────
// The tab can only be sectioned one way at a time; the workbook carries all
// three axes as columns so a reader can pivot on whichever they want. Both must
// carry the family's own vocabulary and NEVER a blank — an empty cell in a
// column of classifications reads as an oversight, and a pivot silently drops it.
{
  const baskets = new Set(["Stable Growth", "Entrepreneurial Growth", "Thematic & Tactical", "Liquidity",
                           "Not classified in the family's review"]);
  const classes = new Set(["Equity", "Debt", "Alternate", "Cash", "Not classified in the family's review"]);
  const bCells = columnUnder(holdings, "Basket (family)", dataLast);
  const cCells = columnUnder(holdings, "Asset Class (family)", dataLast);
  ok("every Basket cell is one of the family's four, or the named remainder",
     bCells.length > 0 && bCells.every((v) => typeof v === "string" && baskets.has(v)),
     `${new Set(bCells.map(String)).size} distinct`);
  ok("every Asset Class cell is one of the family's four, or the named remainder",
     cCells.length > 0 && cCells.every((v) => typeof v === "string" && classes.has(v)),
     `${new Set(cCells.map(String)).size} distinct`);
  // ...and the sheet actually USES more than one, so a column stuck on a single
  // constant — the way a defaulted field looks — cannot pass.
  ok("the sheet distinguishes more than one basket", new Set(bCells.map(String)).size > 1);
  ok("...and more than one family asset class", new Set(cCells.map(String)).size > 1);
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
