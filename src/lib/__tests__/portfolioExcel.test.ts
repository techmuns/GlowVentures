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
import {
  BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY,
  BOOK_CAPITAL_MOVES, BOOK_ACCOUNT_BRIDGES, BOOK_COMMITMENTS, BOOK_POSITION_TRANCHES,
} from "@/data/glowData";
import { buildPortfolioWorkbook } from "@/lib/exportPortfolioExcel";
import { buildCapitalModel } from "@/lib/capital";
import { currentHoldings } from "@/lib/analytics";
import { DASH } from "@/lib/format";
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

// THE SAME MODEL THE CONTEXT BUILDS — on the current holdings, which is the
// universe the Monitor draws from and hands to the export.
const capital = buildCapitalModel({
  accounts: BOOK_ACCOUNTS, capitalMoves: BOOK_CAPITAL_MOVES, bridges: BOOK_ACCOUNT_BRIDGES,
  commitments: BOOK_COMMITMENTS, tranches: BOOK_POSITION_TRANCHES,
  positions: currentHoldings(BOOK_POSITIONS),
});
const wb = buildPortfolioWorkbook(BOOK_POSITIONS, BOOK_ACCOUNTS, TXNS, capital);
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
  "Security", "Qty", "Avg Cost (₹)", "Invested (₹)", "CMP (₹)", "Market Value (₹)",
  "Weight of book", "P&L (₹)", "Return", "XIRR", "YTD",
  "Return basis", "Class", "Held via", "Mandate", "Asset Class (family)", "Basket (family)", "Sector", "Entities",
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
ok("the footer's P&L is a signed number under its own header",
   typeof footerAt("P&L (₹)") === "number",
   String(footerAt("P&L (₹)")));

// ── 3. EVERY VALUE UNDER ITS OWN HEADER ─────────────────────────────────────
// The failure a header row alone cannot catch: the labels stay put and the
// VALUES move one column over. Struck per column on what that column can
// legitimately contain — a money column is a number or an em dash, a descriptor
// column is a non-numeric string and never either.
const numericOrDash = (v: unknown) => typeof v === "number" || v === DASH;
for (const h of ["Qty", "Avg Cost (₹)", "Invested (₹)", "CMP (₹)", "Market Value (₹)", "Weight of book", "P&L (₹)", "Return", "XIRR", "YTD"]) {
  const cells = columnUnder(holdings, h, dataLast);
  ok(`every cell under "${h}" is a figure or an em dash`,
     cells.length > 0 && cells.every(numericOrDash),
     `${cells.length} rows`);
}
for (const h of ["Security", "Return basis", "Class", "Held via", "Mandate", "Asset Class (family)", "Basket (family)", "Sector", "Entities"]) {
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

// ── 6. THE RETURN IS STRUCK ON THE CAPITAL PUT IN, WHERE A ROW IS AN INVESTMENT ─
// *"According to the client the return on this AIF is a lot higher than what we
// are showing"* — the sheet printed every return on the cost of the units held,
// which a class switch, a manager's trading or a fund's payout resets. A row that
// carries a WHOLE investment (a fund folio) now reads its P&L and Return off the
// capital the family put in; a holding inside an account keeps its cost.
{
  const col = (h: string) => columnUnder(holdings, h, dataLast);
  const [sec, qty, avg, inv, mv, pnl, ret, xirr, basis, mandate] =
    ["Security", "Qty", "Avg Cost (₹)", "Invested (₹)", "Market Value (₹)", "P&L (₹)", "Return", "XIRR",
     "Return basis", "Mandate"].map(col);
  const rows = sec.map((_, i) => ({
    sec: String(sec[i]), qty: qty[i], avg: avg[i], inv: inv[i], mv: Number(mv[i]), pnl: pnl[i], ret: ret[i],
    xirr: xirr[i], basis: String(basis[i]), mandate: mandate[i],
  }));
  const num = (v: unknown): v is number => typeof v === "number";
  const onCap = rows.filter((r) => r.basis.startsWith("Capital put in"));

  // THE P&L TIES TO ITS OWN ROW. Market value less Invested, on every row that
  // carries both — a figure struck on one basis and printed beside another is
  // the contradiction a reader finds by subtracting two cells.
  const tie = rows.filter((r) => num(r.inv) && num(r.pnl));
  ok("on every row, P&L = Market Value − Invested",
     tie.length > 0 && tie.every((r) => Math.abs((r.pnl as number) - (r.mv - (r.inv as number))) < 0.5),
     `${tie.length} rows`);
  ok("...and Return = P&L ÷ Invested wherever a return is printed",
     rows.filter((r) => num(r.ret)).every((r) => Math.abs((r.ret as number) - ((r.pnl as number) / (r.inv as number)) * 100) < 1e-6));

  // THE FOOTER IS SUMMED FROM THE ROWS, so it ties to its columns by construction.
  const sumOf = (xs: unknown[]) => xs.filter(num).reduce((t, v) => t + v, 0);
  ok("the footer's Invested is the column's own sum",
     Math.abs(Number(footerAt("Invested (₹)")) - sumOf(inv)) < 0.5, `${footerAt("Invested (₹)")}`);
  ok("the footer's P&L is the column's own sum",
     Math.abs(Number(footerAt("P&L (₹)")) - sumOf(pnl)) < 0.5, `${footerAt("P&L (₹)")}`);

  // A HOLDING INSIDE A MANDATE HAS NO CAPITAL OF ITS OWN. The sheet lists a
  // mandate's shares one per row, so none of them carries the mandate whole.
  const inMandate = rows.filter((r) => r.mandate !== DASH);
  ok("every row inside a mandate stays on the cost of its units",
     inMandate.length > 0 && inMandate.every((r) => !r.basis.startsWith("Capital put in")),
     `${inMandate.length} rows`);

  // THE CAPITAL IS THE MODEL'S, NOT A SECOND DERIVATION. The Buoyant row is the
  // one the client pointed at: both folios are on it, each whole, so its Invested
  // must be the two accounts' published capital — read off the model by account,
  // a path that never touches the sheet's grouping.
  const buoyant = onCap.find((r) => /BUOYANT/i.test(r.sec));
  const buoyAccounts = BOOK_ACCOUNTS.filter((a) => /buoyant/i.test(a.accountId))
    .map((a) => capital.of(a.accountId)).filter((c) => c !== null);
  const buoyCapital = buoyAccounts.reduce((t, c) => t + c!.net, 0);
  ok("the Buoyant row is measured on the capital the family put in",
     !!buoyant && num(buoyant.inv) && buoyAccounts.length === 2 && Math.abs((buoyant.inv as number) - buoyCapital) < 0.5,
     buoyant ? `${buoyant.inv} vs ${buoyCapital} over ${buoyAccounts.length} accounts` : "no Buoyant row on capital");
  ok("...and names its basis as dated payments", !!buoyant && /dated payments/.test(buoyant.basis),
     buoyant?.basis ?? "");
  ok("...and carries a money-weighted rate, because its payments are dated and span a year",
     !!buoyant && num(buoyant.xirr), String(buoyant?.xirr));

  // LOAD-BEARING: the capital basis must MOVE a figure, or a sheet still on cost
  // would pass every check above. Somewhere the capital put in and the cost of
  // the units held part company by more than a lakh — a class switch does that.
  const moved = onCap.filter((r) => num(r.avg) && num(r.qty) && num(r.inv)
    && Math.abs((r.avg as number) * (r.qty as number) - (r.inv as number)) > 1e5);
  ok("at least one row's capital differs from the cost of its units",
     moved.length > 0, moved.map((r) => r.sec.slice(0, 30)).join("; "));

  // AN XIRR ONLY WHERE EVERY RUPEE IS A DATED PAYMENT — never on a holding. Two
  // sources date the money: an account's dated record, and a drawdown fund's
  // capital account read on its dated calls and payouts. Struck on EVERY source
  // the basis names, so a row mixing a dated source with an undated one — or
  // with the cost of units — cannot pass on the word "dated" alone.
  const DATED = new Set(["dated payments", "fund's dated calls and payouts"]);
  const allDated = (basis: string) => {
    const m = /^Capital put in \(([^)]*)\)$/.exec(basis);
    return !!m && m[1].split(" + ").every((x) => DATED.has(x));
  };
  const withXirr = rows.filter((r) => num(r.xirr));
  ok("an XIRR is printed only on a row measured on dated payments",
     withXirr.length > 0 && withXirr.every((r) => allDated(r.basis)),
     withXirr.filter((r) => !allDated(r.basis)).map((r) => `${r.sec.slice(0, 30)}: ${r.basis}`).join("; "));

  // THE NOTE UNDER THE TOTAL SAYS WHICH ROWS ARE ON WHICH BASIS, AND WHY THE
  // SHEET'S TOTAL DIFFERS FROM THE TAB'S.
  const note = String(holdings.getRow(footerRow + 1).getCell(1).value ?? "");
  ok("the note counts the rows measured on capital",
     note.includes(`${onCap.length} row${onCap.length === 1 ? "" : "s"} — each a whole investment`), note.slice(0, 120));
  ok("...and says why the total differs from the tab's", /differs from the tab's by construction/.test(note));
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
