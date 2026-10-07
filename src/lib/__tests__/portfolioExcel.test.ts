// THE EXCEL EXPORT, CHECKED AGAINST THE GENERATED BOOK AND THE SCREEN IT EXPORTS.
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
// ── THE SHEET IS THE SCREEN IT EXPORTS (B-08, A-03, MSX-9/10/17/18/19/22) ───
//
// The page hands the export `portfolio.positions` — the book with the published
// NAV overlaid (`applyFundNavs`) and every row, closed ones included. This suite
// builds the workbook from EXACTLY that input (the context's own pipeline, with
// no quote feed), and holds what it writes to expectations RE-EXPRESSED here
// from `glowData.ts` and `fundNavs.ts` — never by importing the helpers the
// export calls (`currentHoldings`, `measuredReturn`, `commonMark`,
// `costedFigures`), because a check that calls the helper it is checking agrees
// with it by construction:
//
//   • WHICH ROWS — the current holdings the tab draws, and its footer to the
//     rupee on the NAV basis the page exports; and, built on the statement
//     basis, `BOOK_SUMMARY.totalValue` less exactly what the floor drops — two
//     independent paths to one figure;
//   • WHICH RETURN — the tab's default measure, CAGR on a lot-dated holding a
//     year or older and HPR otherwise, and on a row that is whole accounts the
//     family's rule on their dated payments — XIRR re-solved here from the
//     record the tab's index holds — with the measure named on the row;
//   • WHICH PRICE — one mark or none on a row that clubs several lines, and
//     cost, average and gain over the costed lines alone;
//   • WHICH DATE — a line under the title naming the blend of statement dates
//     and NAVs, each row's own basis, and a reason for every blank figure;
//   • AND THE TAPE — the units as printed, a zero kept a zero, and an archive
//     that did not answer never exported as a sheet with no trades.
//
// The column ORDER is written out as a literal, because it is the thing being
// asserted. A test that read the order off the file it is checking could not
// fail — this repo's own recurring lesson.
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SUMMARY,
  BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_POSITION_TRANCHES, BOOK_CAPITAL_FROM_INCEPTION,
  BOOK_REVIEW_FLOWS,
} from "@/data/glowData";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";
import { buildPortfolioWorkbook } from "@/lib/exportPortfolioExcel";
import { applyFundNavs, depositoryFundHoldings, partialValuationNotes, unpricedStatementUnits, withPartialValuation } from "@/lib/fundNavs";
import { shareCandidates } from "@/lib/depositoryShares";
import { labelledAccounts, labelledPositions } from "@/lib/securityLabel";
import { buildDatedCapital } from "@/lib/datedCapital";
import { displaySecurity, DASH } from "@/lib/format";
import type { Position } from "@/lib/types";
import type { Txn, TxnData } from "@/lib/ledger";

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
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const rupees = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** A fixed clock: it dates a live quote and the file, and this suite has no live quote. */
const NOW = Date.parse("2026-09-23T06:00:00Z");

// ── THE PAGE'S OWN INPUT ────────────────────────────────────────────────────
// `PortfolioContext` names each holding once (`labelledPositions`) and each
// strategy (`labelledAccounts`), runs the quote layer — a no-op with no feed —
// adds the fund units only the LIVE book values at AMFI's NAV — the depository's
// own funds on the transaction-only demat (Stage 10ce cash, 10cy the rest) and
// the units a holding statement records and values nowhere (A-17, and the three
// Motilal demats since Stage 10cz, whose Rate is a last-movement price) — and
// overlays the published NAV. A listed share a statement records is a row only
// while a quote feed prices it, and this suite has none. That is what
// `handleExport` passes, so it is what the workbook is built from here.
const DEPO: Position[] = [...depositoryFundHoldings(), ...unpricedStatementUnits()];
/** The raw lines behind PAGE, index for index: the statement book, then the rows only the live book carries. */
const RAW: Position[] = [...BOOK_POSITIONS, ...DEPO];
const PAGE: Position[] = applyFundNavs([...labelledPositions(BOOK_POSITIONS), ...DEPO]);
const PAGE_ACCOUNTS = withPartialValuation(labelledAccounts(BOOK_ACCOUNTS),
  partialValuationNotes(DEPO, undefined, undefined, undefined, shareCandidates()));
if (PAGE.length !== RAW.length || PAGE.some((p, i) => p.securityKey !== RAW[i].securityKey || p.accountId !== RAW[i].accountId)) {
  throw new Error("the page's lines no longer line up with the book's, index for index");
}

// ── THE RULES, RE-EXPRESSED FROM THE BOOK ───────────────────────────────────
const ACC = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const isPms = (p: Position) => ACC.get(p.accountId)?.engagement === "PMS";
/** The NAV the page overlays: a usable published NAV times the units held. */
const NAV = new Map(BOOK_FUND_NAVS.filter((e) => e.usableForValue && e.nav > 0).map((e) => [e.securityKey, e]));
const navOf = (p: Position) => (!p.live && (p.quantity ?? 0) > 0 ? NAV.get(p.securityKey) ?? null : null);
const navMV = (p: Position) => { const e = navOf(p); return e ? p.quantity! * e.nav : p.marketValue; };
/**
 * AMFI's date for a line the page prices at a NAV: the overlay's, or — for a
 * depository's own closing units, which have no statement mark at all — the
 * NAV they were valued at when the page built them. Null for a statement mark.
 */
const navDateOf = (p: Position) => navOf(p)?.date ?? (p.depositoryUnits ? p.navDate ?? null : null);
/**
 * The date a line's value is struck: AMFI's date for a NAV, else the day its own
 * statement prices — `priceAsOf` where the statement names one apart from its
 * balances' date (VD-17: ICICI's NSDL statement of 31 Mar prices at 30 Mar).
 */
const valueDateOfLine = (p: Position) => navDateOf(p) ?? p.priceAsOf ?? ACC.get(p.accountId)?.asOf ?? null;
/** A fund vehicle the fund still prices while the family holds none of its units. */
const FUND = new Set(["AIF", "Mutual Fund", "ETF"]);
const redeemed = (p: Position) => FUND.has(p.assetClass) && p.quantity === 0 && p.currentPrice != null;
/** Each dedupeGroup counted once — its first member, in book order. */
const firstOfGroup = (ps: Position[]) => {
  const seen = new Set<string>();
  return ps.filter((p) => {
    if (!p.dedupeGroup) return true;
    if (seen.has(p.dedupeGroup)) return false;
    seen.add(p.dedupeGroup);
    return true;
  });
};
/** What the family holds: no closed position, and no security whose whole value is a speck under ₹1,000. */
function current(ps: Position[], mvOf: (p: Position) => number) {
  const byKey = new Map<string, number>();
  for (const p of firstOfGroup(ps)) byKey.set(p.securityKey, (byKey.get(p.securityKey) ?? 0) + mvOf(p));
  const speck = new Set([...byKey].filter(([, v]) => v !== 0 && Math.abs(v) < 1000).map(([k]) => k));
  return {
    held: ps.filter((p) => !redeemed(p) && !speck.has(p.securityKey)),
    closed: ps.filter(redeemed),
    specks: ps.filter((p) => !redeemed(p) && speck.has(p.securityKey)),
  };
}
const NAV_SET = current(RAW, navMV);
const STMT_SET = current(BOOK_POSITIONS, (p) => p.marketValue);
const costedLine = (p: Position) => !p.costUnavailable && typeof p.costBasis === "number" && Number.isFinite(p.costBasis);
/** FIFO's one return on one line: (unrealised + realised) ÷ (cost held + cost of units sold). */
const fifoOf = (p: Position, mv: number) => {
  const c = p.costBasis as number;
  const sold = typeof p.costOfUnitsSold === "number" ? p.costOfUnitsSold : 0;
  const real = typeof p.realizedPnL === "number" ? p.realizedPnL : 0;
  return ((mv - c + real) / (c + sold)) * 100;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/** FIFO over a row's lines, summed before it is divided: (unrealised + realised) ÷ (cost held + cost sold). */
const fifoRow = (ps: Position[]) => {
  let gain = 0, deployed = 0;
  for (const p of ps) {
    const c = p.costBasis as number;
    gain += p.marketValue - c + (typeof p.realizedPnL === "number" ? p.realizedPnL : 0);
    deployed += c + (typeof p.costOfUnitsSold === "number" ? p.costOfUnitsSold : 0);
  }
  return (gain / deployed) * 100;
};

// ── THE DATED CAPITAL THE TAB READS ─────────────────────────────────────────
// Built as `useDatedCapital` builds it — the family's dated payments and the
// funds' calls, on the statement book as the page names it — and asked, as the
// tab asks it, whether a row's lines are whole accounts. What the family's rule
// makes of the answer is re-expressed below and never read back through
// `measuredReturn`; the money-weighted rate is RE-SOLVED here from the record
// the index holds.
const INDEX = buildDatedCapital({
  moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS,
  accounts: labelledAccounts(BOOK_ACCOUNTS), positions: labelledPositions(BOOK_POSITIONS),
  tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
  reviewFlows: BOOK_REVIEW_FLOWS,
});
/** The current holdings as the page holds them — what "every holding of an account" is measured against. */
const UNIVERSE: Position[] = PAGE.filter((_, i) => NAV_SET.held.includes(RAW[i]));
/** The sheet's rows outside the mandates: each key's current non-PMS lines, one class and one engagement. */
const DIRECT_ROWS = (() => {
  const m = new Map<string, Position[]>();
  PAGE.forEach((p, i) => {
    if (!NAV_SET.held.includes(RAW[i]) || isPms(RAW[i])) return;
    (m.get(p.securityKey) ?? m.set(p.securityKey, []).get(p.securityKey)!).push(p);
  });
  for (const [k, ps] of m) {
    if (new Set(ps.map((p) => p.assetClass)).size !== 1 || new Set(ps.map((p) => ACC.get(p.accountId)?.engagement)).size !== 1) m.delete(k);
  }
  return m;
})();
const capitalOf = (key: string) => {
  const ps = DIRECT_ROWS.get(key);
  return ps ? INDEX.behind(firstOfGroup(ps), UNIVERSE) : null;
};
/**
 * WHICH DATED RECORD A LINE IS PART OF. An account's, for a statement account;
 * for a review holder bucket (Stage 10dh) the LINE's own — the bucket groups a
 * member's private investments as the review lists them, and each is a
 * separate investment with its own dated purchases. Re-expressed here from the
 * account registry's own flag, never read back through the index.
 */
const REVIEW_HOLDERS = new Set(BOOK_ACCOUNTS.filter((a) => a.reviewHolder).map((a) => a.accountId));
const recordKeysOf = (ps: readonly Position[]) =>
  [...new Set(ps.map((p) => (REVIEW_HOLDERS.has(p.accountId) ? `${p.accountId}|${p.securityKey}` : p.accountId)))].sort();
/**
 * THE POOLED RATE, SOLVED HERE: every record's dated flows, each closing on
 * its own value and date (a folio redeemed to nothing on its last flow), and
 * Σ amount ÷ (1 + r)^(days / 365) = 0 found by bisection — never `xirrPct`.
 */
function solveXirr(recordKeys: readonly string[]): number | null {
  const flows: { t: number; amount: number }[] = [];
  for (const a of recordKeys) {
    const g = INDEX.of(a);
    if (!g || !g.flows?.length || g.value == null) return null;
    for (const f of g.flows) flows.push({ t: Date.parse(f.date), amount: f.amount });
    const last = g.flows.map((f) => f.date).sort().at(-1)!;
    if (g.value > 0) flows.push({ t: Date.parse(g.value === 0 ? last : g.valueAsOf ?? last), amount: g.value });
  }
  const t0 = Math.min(...flows.map((f) => f.t));
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.t - t0) / (365 * 86_400_000)), 0);
  let lo = -0.9999, hi = 100;
  if (Math.sign(npv(lo)) === Math.sign(npv(hi))) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(npv(mid)) === Math.sign(npv(lo))) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

// ── THE SHEETS ──────────────────────────────────────────────────────────────
const TXNS: Txn[] = [
  { date: "2026-08-13", security: "Shoppers Stop Ltd", securityKey: "shoppers-stop", side: "Buy",
    qty: 3859.667, price: 421.5049, amount: 1629797.03, realized: null, account: "AJAY JAISINGHANI · V.E.C 128005",
    ownerId: "ajay" } as unknown as Txn,
  { date: "2026-08-10", security: "Aditya Birla Capital Ltd", securityKey: "aditya-birla-capital", side: "Sell",
    qty: 50369, price: 407.75, amount: 20537000, realized: 11600000, account: "AJAY T JAISINGHANI · Carnelian 3517383",
    ownerId: "ajay" } as unknown as Txn,
  // A sale that realised exactly nothing is a MEASURED zero — never a dash.
  { date: "2026-08-09", security: "Test Flat Sale Ltd", securityKey: "test-flat-sale", side: "Sell",
    qty: 10, price: 100, amount: 1000, realized: 0, account: "AJAY T JAISINGHANI · Carnelian 3517383",
    ownerId: "ajay" } as unknown as Txn,
  // …and a statement that prints a price of nil prints a figure: `|| DASH` sent
  // it to the same dash as a price nobody printed.
  { date: "2026-08-08", security: "Test Nil Price Credit Ltd", securityKey: "test-nil-price", side: "Buy",
    qty: 5, price: 0, amount: 0, realized: null, account: "AJAY T JAISINGHANI · Carnelian 3517383",
    ownerId: "ajay" } as unknown as Txn,
];

const wb = buildPortfolioWorkbook(PAGE, PAGE_ACCOUNTS, TXNS, NOW);
const holdings = wb.getWorksheet("Holdings")!;
const txnSheet = wb.getWorksheet("Transactions")!;

/** The header row, found by its first label — never assumed to sit on a fixed row. */
const headerRowOf = (ws: ExcelJS.Worksheet): number => {
  for (let r = 1; r <= 10; r++) {
    const v = String(ws.getRow(r).getCell(1).value ?? "");
    if (v === "Security" || v === "Date") return r;
  }
  throw new Error(`no header row on ${ws.name}`);
};
const headersOf = (ws: ExcelJS.Worksheet): string[] => {
  const row = ws.getRow(headerRowOf(ws));
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
  for (let r = headerRowOf(ws) + 1; r <= lastRow; r++) out.push(ws.getRow(r).getCell(at + 1).value);
  return out;
};
const footerRowOf = (ws: ExcelJS.Worksheet) => {
  for (let r = headerRowOf(ws) + 1; r <= ws.rowCount; r++) {
    if (String(ws.getRow(r).getCell(1).value ?? "").startsWith("Total ·")) return r;
  }
  throw new Error(`no Total row on ${ws.name}`);
};
/** The data rows as records keyed by header. */
const recordsOf = (ws: ExcelJS.Worksheet, lastRow: number) => {
  const hs = headersOf(ws);
  const out: Record<string, unknown>[] = [];
  for (let r = headerRowOf(ws) + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const rec: Record<string, unknown> = {};
    hs.forEach((h, i) => { rec[h] = row.getCell(i + 1).value; });
    out.push(rec);
  }
  return out;
};

const footerRow = footerRowOf(holdings);
const dataLast = footerRow - 1;
const nRows = dataLast - headerRowOf(holdings);
const footerAt = (ws: ExcelJS.Worksheet, fr: number, header: string) => {
  const at = headersOf(ws).indexOf(header);
  return ws.getRow(fr).getCell(at + 1).value;
};
const ROWS = recordsOf(holdings, dataLast);
/** The notes printed under the Holdings total, in order. */
const notesUnderTotal = [1, 2, 3].map((d) => String(holdings.getRow(footerRow + d).getCell(1).value ?? ""));

// ── 1. THE ORDER THE FAMILY ASKED FOR ───────────────────────────────────────
// "Reorder the columns so the money reads first and Sector / Entity close the
// table" — applied to the workbook as well as the tab. The Measure column rides
// beside the Return it names (the tab prints that tag inside the cell); YTD is
// gone because the tab's table has none (Stage 10af); Priced as of and Notes
// are the tab's hovers, which a workbook has no other way to carry.
eq("Holdings columns: money first, descriptors last", headersOf(holdings), [
  "Security", "Qty", "Avg Cost (₹)", "CMP (₹)", "Market Value (₹)",
  "Weight of book", "Unreal. P&L (₹)", "Return", "Measure",
  "Class", "Held via", "Mandate", "Asset Class (family)", "Basket (family)", "Sector", "Entities",
  "Priced as of", "Notes",
]);
eq("Transactions columns: Entity closes the figures, Notes the row", headersOf(txnSheet), [
  "Date", "Security", "Type", "Qty", "Price (₹)", "Amount (₹)", "Realized P&L (₹)", "Entity", "Notes",
]);

// ── 2. THE ROWS ARE THE ONES THE TAB DRAWS (B-08 / MSX-9) ───────────────────
{
  const want = firstOfGroup(NAV_SET.held).reduce((s, p) => s + navMV(p), 0);
  const got = Number(footerAt(holdings, footerRow, "Market Value (₹)"));
  ok("the footer's Market Value is the current holdings' value on the NAV basis the page exports, to the rupee",
     near(got, want, 0.005), `${got} vs ${want}`);
  // ...and it is NOT the figure a sheet listing the closed rows and the specks prints.
  const withAll = firstOfGroup(RAW).reduce((s, p) => s + navMV(p), 0);
  ok("...which is below the sum that lists the specks too (the few rupees under the ₹1,000 floor the tab leaves out)",
     withAll - got > 1 && near(withAll - got, firstOfGroup(NAV_SET.specks).reduce((s, p) => s + navMV(p), 0), 0.005),
     `${withAll} − ${got}`);
  eq("the footer counts the rows above it", String(holdings.getRow(footerRow).getCell(1).value), `Total · ${nRows} holdings`);
  // The tab opens on All Securities, where a fund is not a row; the sheet is the
  // Category view's set, and says so rather than letting a reader compare it
  // with the first view they see.
  ok("the subtitle names the Monitor view whose holdings the sheet is",
     /draws on its Category view, where every holding is a row/.test(String(holdings.getRow(2).getCell(1).value)));
  const mvCells = columnUnder(holdings, "Market Value (₹)", dataLast);
  ok("the Market Value column sums to its own footer",
     near(mvCells.reduce((s: number, v) => s + Number(v), 0), got, 0.5), `${mvCells.length} rows`);
  const wSum = columnUnder(holdings, "Weight of book", dataLast).reduce((s: number, v) => s + Number(v), 0);
  ok("the weights are shares of the current book and add to 100%", near(wSum, 100, 1e-6), String(wSum));
  ok("the footer's Unreal. P&L is a signed number under its own header",
     typeof footerAt(holdings, footerRow, "Unreal. P&L (₹)") === "number", String(footerAt(holdings, footerRow, "Unreal. P&L (₹)")));

  // NO ROW NAMES A HOLDING THE TAB DROPS. Matched on the name the sheet prints,
  // and only where no current holding shares that name.
  const currentNames = new Set(PAGE.filter((p) => NAV_SET.held.some((q) => q.securityKey === p.securityKey)).map((p) => displaySecurity(p.security)));
  const droppedNames = [...new Set(PAGE
    .filter((p) => NAV_SET.closed.some((q) => q.securityKey === p.securityKey) || NAV_SET.specks.some((q) => q.securityKey === p.securityKey))
    .map((p) => displaySecurity(p.security)))].filter((n) => !currentNames.has(n));
  const listed = droppedNames.filter((n) => ROWS.some((r) => r["Security"] === n));
  ok("no row lists a closed position or a sub-₹1,000 speck", droppedNames.length > 0 && listed.length === 0,
     listed.length ? listed.join(", ") : `${droppedNames.length} names checked`);

  // THE STATEMENT-BASIS CROSS-CHECK: `BOOK_SUMMARY.totalValue` comes from
  // build-book.mjs on a separate path from the export's row sum, so the two
  // agreeing is a real check — once the named term the floor drops is taken out.
  const stmt = buildPortfolioWorkbook(BOOK_POSITIONS, BOOK_ACCOUNTS, [], NOW).getWorksheet("Holdings")!;
  const sf = footerRowOf(stmt);
  const dropped = firstOfGroup([...STMT_SET.closed, ...STMT_SET.specks]).reduce((s, p) => s + p.marketValue, 0);
  ok("on the statement basis the footer is BOOK_SUMMARY.totalValue less exactly what the floor drops",
     near(Number(footerAt(stmt, sf, "Market Value (₹)")), BOOK_SUMMARY.totalValue - dropped, 0.005),
     `${footerAt(stmt, sf, "Market Value (₹)")} vs ${BOOK_SUMMARY.totalValue} − ${dropped}`);
}

// ── 3. WHAT IS NOT LISTED IS NAMED, WITH ITS OWN REASON (MSX-9 / MSX-18) ────
{
  const notListed = notesUnderTotal.find((n) => n.startsWith("Not listed")) ?? "";
  const closed = NAV_SET.closed;
  const specks = NAV_SET.specks;
  const speckValue = firstOfGroup(specks).reduce((s, p) => s + navMV(p), 0);
  // Each by name AND by whose statement it is: a current holding can carry the
  // same name (HDFC Liquid Fund · Direct is redeemed in one folio, held on a demat).
  const closedNames = [...new Set(PAGE.filter((p) => closed.includes(RAW[PAGE.indexOf(p)]))
    .map((p) => `${displaySecurity(p.security)} (${ACC.get(p.accountId)?.provider})`))];
  ok("the note names every closed position, by name, by whose statement it is, and by count",
     closed.length > 0 && notListed.includes(`${closed.length} closed position`) && closedNames.every((n) => notListed.includes(n)),
     `${closed.length} closed: ${closedNames.join(", ")}`);
  ok("...as a measured zero, never as a holding missing its cost",
     /measured zero rather than a missing cost/.test(notListed));
  ok("the note names the specks' count and their total to the paisa",
     specks.length > 0 && notListed.includes(`${specks.length} holding`) && notListed.includes(rupees(speckValue)),
     `${specks.length} specks, ₹${rupees(speckValue)}`);
  // MSX-18: the P&L note counted the redeemed rows among the ones that "have no
  // cost basis". The providers of the closed positions must not be named there
  // unless a CURRENT costless row is theirs.
  const pnlNote = notesUnderTotal[0];
  const provider = (p: Position) => ACC.get(p.accountId)?.provider ?? "";
  const costlessProviders = new Set(NAV_SET.held.filter((p) => !costedLine(p)).map(provider));
  const wrongly = [...new Set(closed.map(provider))].filter((pv) => !costlessProviders.has(pv) && pnlNote.includes(pv));
  ok("the P&L note does not call a closed position a holding without a cost", wrongly.length === 0, wrongly.join(", ") || "none named");
}

// ── 4. EVERY VALUE UNDER ITS OWN HEADER ─────────────────────────────────────
// The failure a header row alone cannot catch: the labels stay put and the
// VALUES move one column over.
const numericOrDash = (v: unknown) => typeof v === "number" || v === DASH;
for (const h of ["Qty", "Avg Cost (₹)", "CMP (₹)", "Market Value (₹)", "Weight of book", "Unreal. P&L (₹)", "Return"]) {
  const cells = columnUnder(holdings, h, dataLast);
  ok(`every cell under "${h}" is a figure or an em dash`, cells.length > 0 && cells.every(numericOrDash), `${cells.length} rows`);
}
for (const h of ["Security", "Measure", "Class", "Held via", "Mandate", "Asset Class (family)", "Basket (family)", "Sector", "Entities", "Priced as of", "Notes"]) {
  const cells = columnUnder(holdings, h, dataLast);
  ok(`every cell under "${h}" is a descriptor, never a figure`,
     cells.length > 0 && cells.every((v) => typeof v === "string" && v !== "" && !/^-?[\d.]+$/.test(v)),
     `${cells.length} rows`);
}
const dashRows = columnUnder(holdings, "Avg Cost (₹)", dataLast).filter((v) => v === DASH).length;
ok("cost-less rows carry an em dash rather than an empty cell", dashRows > 0, `${dashRows} rows`);

// ── 5. THE RETURN IS THE TAB'S DEFAULT MEASURE, AND SAYS WHICH (MSX-10) ─────
{
  // Every figure names its measure, and no dash claims one.
  const mismatch = ROWS.filter((r) => (typeof r["Return"] === "number")
    ? !(r["Measure"] === "HPR" || r["Measure"] === "CAGR" || r["Measure"] === "XIRR")
    : r["Measure"] !== DASH);
  ok("every Return carries its measure (HPR, CAGR or XIRR), and a blank one claims none", mismatch.length === 0,
     mismatch.slice(0, 3).map((r) => `${r["Security"]} ${r["Return"]} ${r["Measure"]}`).join("; ") || `${ROWS.length} rows`);

  // THE LOT-DATED HOLDINGS, where the default measure is not the plain return
  // on cost. Each is re-derived from its own line: FIFO on the NAV basis the
  // page shows, over the days from its oldest unit to ITS OWN valuation.
  //
  // One row per security OUTSIDE the mandates: a PMS line is its mandate's own
  // row, so a name the family bought itself that a manager also holds —
  // Crompton, at LKP and inside V.E.C 128005 — is still one direct row, dated
  // by its own lot register.
  const byKey = new Map<string, Position[]>();
  for (const p of NAV_SET.held) {
    if (isPms(p)) continue;
    (byKey.get(p.securityKey) ?? byKey.set(p.securityKey, []).get(p.securityKey)!).push(p);
  }
  let subjects = 0, annualised = 0;
  const wrong: string[] = [];
  for (const [key, ps] of byKey) {
    if (ps.length !== 1) continue;
    const p = ps[0];
    if (!p.heldSince || !costedLine(p) || !((p.costBasis as number) > 0)) continue;
    // A row that is whole accounts on a dated record takes the rule on its
    // payments instead, which 5b holds it to.
    if (capitalOf(key)?.dated) continue;
    const valuedAt = valueDateOfLine(p);
    if (!valuedAt) continue;
    const mv = navMV(p);
    const hpr = fifoOf(p, mv);
    const days = daysBetween(p.heldSince, valuedAt);
    const cagr = days >= 365 && 1 + hpr / 100 > 0;
    const want = cagr ? (Math.pow(1 + hpr / 100, 365 / days) - 1) * 100 : hpr;
    const name = displaySecurity(PAGE[RAW.indexOf(p)].security);
    const row = ROWS.filter((r) => r["Security"] === name && r["Mandate"] === DASH);
    subjects++;
    if (cagr) annualised++;
    if (row.length !== 1 || typeof row[0]["Return"] !== "number"
        || !near(row[0]["Return"] as number, want, 1e-9) || row[0]["Measure"] !== (cagr ? "CAGR" : "HPR")) {
      wrong.push(`${key}: want ${want.toFixed(4)} ${cagr ? "CAGR" : "HPR"} over ${days}d, got ${row.map((r) => `${r["Return"]} ${r["Measure"]}`).join(" / ") || "no row"}`);
    }
  }
  ok("every lot-dated holding shows the tab's default measure: CAGR from a year, HPR under it",
     subjects > 0 && wrong.length === 0, wrong.join("; ") || `${subjects} lot-dated rows`);
  // LOAD-BEARING: the book must carry a holding the rule annualises, or a sheet
  // printing the plain return on cost everywhere would pass the check above.
  ok("...and the book carries one the rule annualises, so the guard can fail", annualised > 0, `${annualised} annualised`);
  const sheetCagr = ROWS.filter((r) => r["Measure"] === "CAGR").length;
  eq("exactly those rows are annualised, and no other", sheetCagr, annualised);
  // THE WINDOW IS THE ROW'S OWN, never the book's newest date (2026-08-29): an
  // annualised row names both ends of it.
  const cagrRows = ROWS.filter((r) => r["Measure"] === "CAGR");
  ok("an annualised row states its window in Notes", cagrRows.length > 0
     && cagrRows.every((r) => /Annualised over the \d+ days from \d{4}-\d\d-\d\d, the oldest unit still held, to its valuation on \d{4}-\d\d-\d\d/.test(String(r["Notes"]))));
}

// ── 5b. A ROW THAT IS WHOLE ACCOUNTS TAKES THE RULE ON ITS PAYMENTS (MSX-10) ─
// The tab's default gives a row that IS one or more whole accounts with a dated
// record of the family's payments the family's rule on those payments: under a
// year the holding-period return, a year or more XIRR over several payments and
// CAGR on one. A fund folio funded on several dates prints its money-weighted
// rate on the tab; the sheet printing the return on cost there would be a second
// answer to one question, one click apart.
{
  const byName = new Map<string, string[]>();
  for (const [key, ps] of DIRECT_ROWS) for (const n of new Set(ps.map((p) => displaySecurity(p.security)))) {
    (byName.get(n) ?? byName.set(n, []).get(n)!).push(key);
  }
  let subjects = 0, xirrs = 0;
  const wrong: string[] = [];
  for (const [key, ps] of DIRECT_ROWS) {
    const cap = capitalOf(key);
    if (!cap || !cap.dated) continue;
    const names = [...new Set(ps.map((p) => displaySecurity(p.security)))];
    if (names.length !== 1 || byName.get(names[0])!.length !== 1) continue;
    const row = ROWS.filter((r) => r["Security"] === names[0] && r["Mandate"] === DASH);
    const set = firstOfGroup(ps);
    const hpr = fifoRow(set);
    const want = cap.days < 365 ? { tag: "HPR", pct: hpr as number | null, note: `The money has been in for ${cap.days} days` }
      : cap.flows > 1 ? { tag: "XIRR", pct: solveXirr(recordKeysOf(set)), note: `Money-weighted over ${cap.flows} dated payments` }
      : 1 + hpr / 100 > 0 ? { tag: "CAGR", pct: (Math.pow(1 + hpr / 100, 365 / cap.days) - 1) * 100, note: `One payment on ${cap.since}` }
      : { tag: "HPR", pct: hpr, note: "A total loss has no compound rate" };
    subjects++;
    if (want.tag === "XIRR") xirrs++;
    const got = row[0];
    const pctOk = want.pct === null ? got?.["Return"] === DASH : typeof got?.["Return"] === "number" && near(got["Return"] as number, want.pct, 1e-6);
    const tagOk = want.pct === null ? got?.["Measure"] === DASH : got?.["Measure"] === want.tag;
    if (row.length !== 1 || !pctOk || !tagOk || (want.pct !== null && !String(got["Notes"]).includes(want.note))) {
      wrong.push(`${key}: want ${want.pct?.toFixed(4)} ${want.tag} (${want.note}), got ${row.map((r) => `${r["Return"]} ${r["Measure"]}`).join(" / ") || "no row"}`);
    }
  }
  ok("every row that is whole accounts on a dated record takes the family's rule on its payments, the rate re-solved here",
     subjects > 0 && wrong.length === 0, wrong.join("; ") || `${subjects} rows, ${xirrs} XIRR`);
  // LOAD-BEARING: the book must carry a row the rule takes to XIRR, or a sheet
  // that never handed the capital to the measure would pass the check above.
  ok("...and the book carries one the rule takes to XIRR, so the guard can fail", xirrs > 0, `${xirrs} XIRR`);
  eq("exactly those rows are XIRR, and no other", ROWS.filter((r) => r["Measure"] === "XIRR").length, xirrs);

  // THE LEGEND COUNTS WHAT THE MEASURE COLUMN CARRIES.
  const legend = notesUnderTotal.find((n) => n.startsWith("Return is the Portfolio Monitor's default measure")) ?? "";
  const counted = (tag: string) => Number(legend.match(new RegExp(`${tag} \\((\\d+) rows?\\)`))?.[1] ?? 0);
  const inColumn = (tag: string) => ROWS.filter((r) => r["Measure"] === tag).length;
  eq("the legend's counts are the Measure column's", ["HPR", "CAGR", "XIRR"].map(counted), ["HPR", "CAGR", "XIRR"].map(inColumn));
}

// ── 6. ONE MARK OR NONE, AND COST OVER THE COSTED LINES (A-03) ──────────────
{
  // Subjects: a security held in two or more of the family's own accounts, of
  // one class and one engagement — one row by construction.
  const byKey = new Map<string, Position[]>();
  for (const p of PAGE) {
    if (!NAV_SET.held.includes(RAW[PAGE.indexOf(p)]) || isPms(p)) continue;
    (byKey.get(p.securityKey) ?? byKey.set(p.securityKey, []).get(p.securityKey)!).push(p);
  }
  // A name two keys share (a depository's clipped label and an AMC's full one
  // both read "Helios Flexi Cap Fund · Direct") is two rows; it is left out
  // rather than matched to the wrong one.
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
    const marks = [...new Set(ps.filter((p) => typeof p.currentPrice === "number").map((p) => (p.currentPrice as number).toFixed(2)))];
    const names = new Set(ps.map((p) => displaySecurity(p.security)));
    if (names.size !== 1 || keysOfName.get([...names][0])!.size !== 1) continue;
    const row = ROWS.filter((r) => r["Security"] === [...names][0] && r["Mandate"] === DASH);
    if (row.length !== 1) { bad.push(`${key}: ${row.length} rows`); continue; }
    if (marks.length > 1) {
      split++;
      const notes = String(row[0]["Notes"]);
      if (row[0]["CMP (₹)"] !== DASH || !marks.every((m) => notes.includes(rupees(Number(m))))) {
        bad.push(`${key}: CMP ${row[0]["CMP (₹)"]} over marks ${marks.join(" / ")}`);
      }
    } else if (marks.length === 1) {
      single++;
      if (typeof row[0]["CMP (₹)"] !== "number" || (row[0]["CMP (₹)"] as number).toFixed(2) !== marks[0]) {
        bad.push(`${key}: CMP ${row[0]["CMP (₹)"]} where every line is marked ${marks[0]}`);
      }
    }
  }
  // THE SPLIT HALF HAS NO SUBJECT ON THIS BOOK SINCE Stage 10cz — and why is
  // the finding. Every split this check used to find (DSP Gold at ₹151.10 and
  // ₹141.24, the two Helios demat rows) was a pair of Motilal "marks" that were
  // the prices of each line's LAST DEPOSITORY MOVEMENT, not marks at all; the
  // book carries those lines as quantities now, and what is left agrees. So the
  // real book is held to the agreeing half, and the split half to a constructed
  // pair below — never silently dropped, because a row printing one line's mark
  // over another line's units is the defect A-03 was.
  ok("a row whose lines agree on a mark prints it, and no real row prints a mark its lines disagree on",
     single > 0 && bad.length === 0, bad.join("; ") || `${split} split, ${single} agreeing`);
  {
    const direct2 = BOOK_ACCOUNTS.filter((a) => a.engagement === "Direct").slice(0, 2);
    const b = { securityKey: "test-split-mark", security: "Test Split Mark Ltd", assetClass: "Equity",
      sector: "Industrials", providerSector: null, isin: null, symbol: null, marketSide: "listed" } as unknown as Position;
    const two: Position[] = [
      { ...b, accountId: direct2[0].accountId, quantity: 100, costBasis: null, avgCost: null, currentPrice: 120,
        marketValue: 12000, unrealizedPnL: null, returnPct: null, realizedPnL: null } as unknown as Position,
      { ...b, accountId: direct2[1].accountId, quantity: 100, costBasis: null, avgCost: null, currentPrice: 130,
        marketValue: 13000, unrealizedPnL: null, returnPct: null, realizedPnL: null } as unknown as Position,
    ];
    const sw = buildPortfolioWorkbook(two, BOOK_ACCOUNTS, [], NOW).getWorksheet("Holdings")!;
    const recs = recordsOf(sw, footerRowOf(sw) - 1).filter((r) => r["Security"] === "Test Split Mark Ltd");
    const cmp = recs[0]?.["CMP (₹)"];
    const notes = String(recs[0]?.["Notes"] ?? "");
    ok("...and a row whose lines are marked at two prices prints no CMP and names both marks — on a constructed pair",
       direct2.length === 2 && recs.length === 1 && cmp === DASH && [120, 130].every((m) => notes.includes(rupees(m))),
       `${recs.length} row(s) · CMP ${String(cmp)} over marks 120 / 130 · notes: ${notes.slice(0, 120)}`);
  }

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
  const pw = buildPortfolioWorkbook(pair, BOOK_ACCOUNTS, [], NOW).getWorksheet("Holdings")!;
  const prow = recordsOf(pw, footerRowOf(pw) - 1);
  ok("a partly costed row's average cost and P&L are struck over the costed units alone",
     direct.length === 2 && prow.length === 1 && prow[0]["Avg Cost (₹)"] === 100 && prow[0]["Unreal. P&L (₹)"] === 2000
       && prow[0]["CMP (₹)"] === 120 && /struck over the costed units alone/.test(String(prow[0]["Notes"])),
     prow.map((r) => `${r["Avg Cost (₹)"]} / ${r["Unreal. P&L (₹)"]} / ${r["CMP (₹)"]}`).join("; "));
}

// ── 7. WHAT DATE, WHAT BASIS, AND WHY A CELL IS BLANK (MSX-17) ──────────────
{
  const asOfLine = String(holdings.getRow(headerRowOf(holdings) - 1).getCell(1).value ?? "");
  const lines = firstOfGroup(NAV_SET.held);
  // Each statement line's own value date — the day its statement PRICES (VD-17).
  // A line the family's consolidated review values is NOT a statement mark
  // (Stage 10dh): it is dated on its own clause, by the review's own date.
  const stmtDates = lines.filter((p) => !navDateOf(p) && !p.review).map((p) => valueDateOfLine(p) ?? "").filter(Boolean).sort();
  const reviewDates = lines.filter((p) => !navDateOf(p) && p.review).map((p) => valueDateOfLine(p) ?? "").filter(Boolean).sort();
  const navDates = [...new Set(lines.map((p) => navDateOf(p)).filter((d): d is string => !!d))].sort();
  ok("the line under the title dates the figures: the statement range, the NAV date, and no live quote",
     stmtDates.length > 0 && navDates.length > 0
       && asOfLine.includes(`${stmtDates[0]} → ${stmtDates[stmtDates.length - 1]}`)
       && navDates.every((d) => asOfLine.includes(d)) && /no row at a live quote/.test(asOfLine),
     asOfLine.slice(0, 160));
  ok("...and dates the review's private-market lines on a clause of their own, by the review's own dates",
     reviewDates.length > 0
       && new RegExp(`\\d+ rows? from the family's consolidated review \\(MOPWM\\)[^;]*dated ${reviewDates[0]} → ${reviewDates[reviewDates.length - 1]}`).test(asOfLine),
     `${reviewDates.length} review lines, ${reviewDates[0]} → ${reviewDates[reviewDates.length - 1]} · ${asOfLine.slice(0, 400)}`);
  const count = (re: RegExp) => Number(asOfLine.match(re)?.[1] ?? 0);
  const bases = count(/(\d+) rows? at statement marks/) + count(/(\d+) rows? at AMFI/)
    + count(/(\d+) rows? from the family's consolidated review/)
    + count(/(\d+) rows? at live quotes/) + count(/(\d+) rows? mixing/);
  eq("...and the rows it counts per basis are every row", bases, nRows);

  // EACH ROW'S OWN BASIS AND DATE, checked on the rows that carry one security.
  const priced = columnUnder(holdings, "Priced as of", dataLast).map(String);
  ok("every row says how and when it is priced",
     priced.every((v) => /^(Statement|AMFI NAV|Live quote|Review \(MOPWM\)) (\d{4}-\d\d-\d\d|undated)( \+ (Statement|AMFI NAV|Live quote|Review \(MOPWM\)) (\d{4}-\d\d-\d\d|undated))*$/.test(v)),
     priced.filter((v) => !/^(Statement|AMFI NAV|Live quote|Review \(MOPWM\)) /.test(v)).slice(0, 3).join("; "));
  const navKeys = new Set(lines.filter((p) => navDateOf(p)).map((p) => p.securityKey));
  eq("a row is on AMFI's NAV exactly where the page priced its scheme at one",
     priced.filter((v) => v.startsWith("AMFI NAV")).length, navKeys.size);
  const byName = new Map<string, Position[]>();
  for (const p of PAGE) if (NAV_SET.held.includes(RAW[PAGE.indexOf(p)])) {
    const n = displaySecurity(p.security);
    (byName.get(n) ?? byName.set(n, []).get(n)!).push(RAW[PAGE.indexOf(p)]);
  }
  let checked = 0;
  const offDate: string[] = [];
  for (const r of ROWS) {
    const ps = byName.get(String(r["Security"]));
    if (!ps || ps.length !== 1 || ROWS.filter((x) => x["Security"] === r["Security"]).length !== 1) continue;
    const p = ps[0];
    const want = `${navDateOf(p) ? "AMFI NAV" : p.review ? "Review (MOPWM)" : "Statement"} ${valueDateOfLine(p)}`;
    checked++;
    if (r["Priced as of"] !== want) offDate.push(`${r["Security"]}: ${r["Priced as of"]} vs ${want}`);
  }
  ok("...and names the date its own statement or NAV is struck on, never the book's newest",
     checked > 50 && offDate.length === 0, offDate.slice(0, 3).join("; ") || `${checked} rows`);

  // A BLANK FIGURE IS NEVER SILENT: its column is named in the row's Notes.
  const LABEL: Record<string, string> = { "Avg Cost (₹)": "Avg Cost", "CMP (₹)": "CMP", "Unreal. P&L (₹)": "Unreal. P&L", "Return": "Return" };
  const silent: string[] = [];
  for (const r of ROWS) for (const [h, label] of Object.entries(LABEL)) {
    if (r[h] === DASH && !String(r["Notes"]).includes(label)) silent.push(`${r["Security"]} · ${h}`);
  }
  ok("every blank figure names its column and its reason in Notes", silent.length === 0,
     silent.slice(0, 4).join("; ") || `${ROWS.length} rows`);
  // A DEPOSITORY'S OWN UNITS SAY WHAT THEY ARE, by the record they came from
  // (Stage 10cz): a transaction-only account's closing balance, a holding
  // statement's balance beside the price of its LAST MOVEMENT, or one printed
  // with no rate. Every kind says no statement priced them and that AMFI's NAV
  // values them — and ONLY the first may say the account sent no holding
  // statement: said of a Motilal holding statement it would be false, which is
  // what this row printed on every line of every kind before.
  const kindOf = (p: Position) => p.depositoryUnits?.kind ?? "closing-balance";
  const SAYS: Record<string, RegExp> = {
    "closing-balance": /a depository's own closing balance of \d{4}-\d\d-\d\d, on an account that sent a transaction statement and no holding statement/,
    "last-movement": /holding statement of \d{4}-\d\d-\d\d records beside the price of their last depository movement — .*a transaction price, not a valuation of the balance/,
    "no-rate": /holding statement of \d{4}-\d\d-\d\d records and prints no rate for/,
    "no-price": /holding statement of \d{4}-\d\d-\d\d records with no usable price/,
  };
  // A ROW IS FOUND BY ITS KEY, NEVER BY ITS NAME ALONE: two keys can share one
  // label — the depository's clipped `HELIOS FCF D-GROW` and the AMC folio's full
  // name read alike since Stage 10az — and only one of the two rows is a
  // depository's. The row's own Qty is what says which key it is.
  const depoKinds = new Map<string, Set<string>>();
  for (const p of DEPO) {
    if (!depoKinds.has(p.securityKey)) depoKinds.set(p.securityKey, new Set());
    depoKinds.get(p.securityKey)!.add(kindOf(p));
  }
  const nameOf = (p: Position) => displaySecurity(p.security);
  const depoNames = new Set(PAGE.filter((p) => depoKinds.has(p.securityKey)).map(nameOf));
  const qtyByKey = new Map<string, { name: string; qty: number }>();
  for (const p of PAGE) {
    const e = qtyByKey.get(p.securityKey) ?? { name: nameOf(p), qty: 0 };
    e.qty += p.quantity ?? 0;
    qtyByKey.set(p.securityKey, e);
  }
  const keyOfRow = (r: Record<string, unknown>): string | null => {
    const q = Number(r["Qty"]);
    const hit = [...qtyByKey].filter(([, e]) => e.name === String(r["Security"]) && Number.isFinite(q) && Math.abs(e.qty - q) < 0.01);
    return hit.length === 1 ? hit[0][0] : null;
  };
  const depoRows = ROWS.filter((r) => depoNames.has(String(r["Security"])));
  const unsaid = depoRows.filter((r) => {
    const notes = String(r["Notes"]);
    const key = keyOfRow(r);
    if (key === null) return true; // a row no key accounts for is itself the finding
    const kinds = depoKinds.get(key);
    if (!kinds) return /Qty — (these|some of these) units are /.test(notes); // not a depository row: must not say it is
    return !/Qty — (these|some of these) units are /.test(notes)
      || !/no statement priced them, and they are valued at AMFI's published NAV/.test(notes)
      || [...kinds].some((k) => !SAYS[k].test(notes))
      || (!kinds.has("closing-balance") && /transaction statement and no holding statement/.test(notes));
  });
  const kindsSeen = new Set(DEPO.map(kindOf));
  ok("a row carrying a depository's own units says which record they came from, and that no statement priced them",
     kindsSeen.has("closing-balance") && kindsSeen.has("last-movement")
       && depoRows.length > 0 && unsaid.length === 0,
     unsaid.map((r) => String(r["Security"])).join("; ")
       || `${depoRows.length} rows over ${DEPO.length} depository lines · kinds ${[...kindsSeen].sort().join(", ")}`);
  // A cost nobody reported names WHOSE statement it is, never one cause for all.
  const providers = [...new Set(BOOK_ACCOUNTS.map((a) => a.provider))];
  // HELD AT COST IS NOT "NO COST" (Stage 10dh): a row every line of which the
  // review holds at cost reports what was paid — it is a cost — and has no gain
  // because its value IS that cost. Which rows those are is read off the BOOK.
  const atCostName = (n: string) => { const ps = byName.get(n) ?? []; return ps.length > 0 && ps.every((p) => p.valuedAtCost === true); };
  const atCostRows = ROWS.filter((r) => atCostName(String(r["Security"])));
  const atCostWrong = atCostRows.filter((r) => {
    const n = String(r["Notes"]);
    return r["Unreal. P&L (₹)"] !== DASH || r["Return"] !== DASH || r["CMP (₹)"] !== DASH
      || !/consolidated review \(MOPWM\)/.test(n) || !/held at cost/.test(n)
      || /no statement behind this holding reports what it cost/.test(n);
  });
  ok("a row the review holds at cost says so — the review, at cost, no gain, no mark — and never that no cost is reported",
     atCostRows.length > 0 && atCostWrong.length === 0,
     atCostWrong.slice(0, 3).map((r) => `${r["Security"]}: ${String(r["Notes"]).slice(0, 140)}`).join("; ") || `${atCostRows.length} rows`);
  const costless = ROWS.filter((r) => r["Avg Cost (₹)"] === DASH && r["Unreal. P&L (₹)"] === DASH && !atCostName(String(r["Security"])));
  const unnamed = costless.filter((r) => !/reported by/.test(String(r["Notes"])) || !providers.some((pv) => String(r["Notes"]).includes(pv)));
  ok("a cost-less row names the statement it came from", costless.length > 0 && unnamed.length === 0,
     unnamed.slice(0, 3).map((r) => String(r["Security"])).join("; ") || `${costless.length} rows`);
}

// ── 8. THE TRANSACTIONS TAPE ─────────────────────────────────────────────────
{
  const lastTx = headerRowOf(txnSheet) + TXNS.length;
  eq("the tape's Entity column carries the account label", columnUnder(txnSheet, "Entity", lastTx), TXNS.map((t) => t.account));
  eq("...and Type carries the side, not the entity", columnUnder(txnSheet, "Type", lastTx), TXNS.map((t) => t.side));
  eq("...and Amount carries the amount", columnUnder(txnSheet, "Amount (₹)", lastTx), TXNS.map((t) => t.amount));
  // A buy realised nothing: an em dash, never a 0 — and a sale that realised
  // exactly nothing is a measured zero, never a dash.
  eq("a buy's realised is a dash, a flat sale's is a zero", columnUnder(txnSheet, "Realized P&L (₹)", lastTx), [DASH, TXNS[1].realized, 0, DASH]);
  eq("a price or amount printed as nil is a zero, never a dash",
     [columnUnder(txnSheet, "Price (₹)", lastTx)[3], columnUnder(txnSheet, "Amount (₹)", lastTx)[3]], [0, 0]);
  // MSX-22: the units as printed, not rounded in the cell.
  eq("the units are stored as printed, never rounded", columnUnder(txnSheet, "Qty", lastTx), TXNS.map((t) => t.qty));
  const fracCell = txnSheet.getRow(headerRowOf(txnSheet) + 1).getCell(headersOf(txnSheet).indexOf("Qty") + 1);
  ok("...and a fractional count is displayed with its decimals", /0\.0/.test(String(fracCell.numFmt)), String(fracCell.numFmt));
  // The Holdings sheet stores its unit counts as summed; a fund's fractional
  // units are displayed with their decimals too, never as a rounded count.
  const hq = headersOf(holdings).indexOf("Qty") + 1;
  const fracRows: number[] = [];
  for (let r = headerRowOf(holdings) + 1; r <= dataLast; r++) {
    const v = holdings.getRow(r).getCell(hq).value;
    if (typeof v === "number" && Math.abs(v - Math.round(v)) > 1e-6) fracRows.push(r);
  }
  ok("a fractional holding's units are displayed with their decimals",
     fracRows.length > 0 && fracRows.every((r) => /0\.0/.test(String(holdings.getRow(r).getCell(hq).numFmt))),
     `${fracRows.length} fractional rows`);
  ok("a blank realised says why", /Realized P&L — a purchase realises nothing/.test(String(columnUnder(txnSheet, "Notes", lastTx)[0])));

  // MSX-19: an archive that did not answer is never a sheet with no trades.
  const nul = buildPortfolioWorkbook(PAGE, PAGE_ACCOUNTS, null, NOW).getWorksheet("Transactions")!;
  const nh = headerRowOf(nul);
  const nulText = [1, 2, 3, nh + 1].map((r) => String(nul.getRow(r).getCell(1).value ?? "")).join(" | ");
  ok("an unreachable archive says so above the table and in it, and claims no tape",
     /did not answer/.test(String(nul.getRow(nh - 1).getCell(1).value)) && /did not answer/.test(String(nul.getRow(nh + 1).getCell(1).value))
       && /not a statement that there were none/.test(nulText) && !/full dated/.test(nulText) && nul.rowCount === nh + 1,
     nulText.slice(0, 200));
  const emp = buildPortfolioWorkbook(PAGE, PAGE_ACCOUNTS, [], NOW).getWorksheet("Transactions")!;
  ok("a bare empty tape says it was handed nothing, not that nothing traded",
     /No trades were handed to this export/.test(String(emp.getRow(headerRowOf(emp) + 1).getCell(1).value)));
}

// ── 9. …AND ON THE REAL TAPE, THROUGH THE REAL LOADER ───────────────────────
// The runtime ledger reads `public/audit/` in the browser; served off disk here
// (the ledgerJoins suite's arrangement) so the sheet is checked on every row the
// page would export, not on a fixture.
{
  const ROOT = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../..");
  const PUB = path.join(ROOT, "public");
  (globalThis as { fetch?: unknown }).fetch = async (u: unknown) => {
    const rel = String(u).replace(/^\/+/, "");
    try {
      const t = readFileSync(path.join(PUB, rel), "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(t) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  };
  (import.meta as { env?: Record<string, string> }).env ??= { BASE_URL: "/" };
  const L = await import("./archiveLedger");
  const data: TxnData | null = await L.loadTransactions();
  ok("the committed archive loads through the real loader", !!data && data.txns.length > 0, `${data?.txns.length ?? 0} rows`);
  if (data) {
    const ws = buildPortfolioWorkbook(PAGE, PAGE_ACCOUNTS, data, NOW).getWorksheet("Transactions")!;
    const h = headerRowOf(ws);
    const last = h + data.txns.length;
    const recs = recordsOf(ws, last);
    eq("every dated row is written, and nothing after them", [recs.length, ws.rowCount], [data.txns.length, last]);
    const qtyOff = data.txns.filter((t, i) => recs[i]["Qty"] !== t.qty);
    const frac = data.txns.filter((t) => !Number.isInteger(t.qty));
    ok("every Qty cell holds the units exactly as the statement printed them",
       frac.length > 0 && qtyOff.length === 0, qtyOff.slice(0, 3).map((t) => `${t.security} ${t.qty}`).join("; ") || `${frac.length} fractional counts kept`);
    const fig = (v: number | null, cell: unknown) => (v === null ? cell === DASH : cell === v);
    const figOff = data.txns.filter((t, i) => !fig(t.price, recs[i]["Price (₹)"]) || !fig(t.amount, recs[i]["Amount (₹)"]) || !fig(t.realized, recs[i]["Realized P&L (₹)"]));
    ok("price, amount and realised are the tape's own figures — a zero a zero, an absence a dash",
       figOff.length === 0, figOff.slice(0, 3).map((t) => t.security).join("; ") || `${data.txns.length} rows`);
    const whyOff = data.txns.filter((t, i) => t.realized === null
      && !(String(recs[i]["Notes"]).includes("Realized P&L —") && (!t.realizedNote || String(recs[i]["Notes"]).includes(t.realizedNote))));
    ok("every blank realised carries the ledger's own reason", whyOff.length === 0,
       whyOff.slice(0, 3).map((t) => t.security).join("; ") || `${data.txns.filter((t) => t.realized === null).length} blank`);
    const sub = String(ws.getRow(h - 2).getCell(1).value ?? "");
    ok("the subtitle names the window, which accounts issue a tape, and the allotments it leaves out",
       (!data.periodFrom || sub.includes(`${data.periodFrom} → ${data.periodTo}`))
         && sub.includes(`${data.accounts.length} account`) && sub.includes(`${data.accountsWithout.length} do`)
         && (data.ownAllotments.length === 0 || sub.includes(`${data.ownAllotments.length} row`))
         && !/full dated/.test(sub),
       sub.slice(0, 220));
  }
}

// ── 10. THE FAMILY'S TWO AXES TRAVEL WITH THE SHEET ─────────────────────────
// The tab can only be sectioned one way at a time; the workbook carries all
// three axes as columns so a reader can pivot on whichever they want. Both must
// carry the family's own vocabulary and NEVER a blank.
{
  const baskets = new Set(["Stable Growth", "Entrepreneurial Growth", "Thematic & Tactical", "Liquidity",
                           "Not classified in the family's review"]);
  const classes = new Set(["Equity", "Debt", "Alternate", "Cash", "Not classified in the family's review"]);
  const bCells = columnUnder(holdings, "Basket (family)", dataLast);
  const cCells = columnUnder(holdings, "Asset Class (family)", dataLast);
  ok("every Basket cell is one of the family's four, or the named remainder",
     bCells.length > 0 && bCells.every((v) => typeof v === "string" && baskets.has(v)), `${new Set(bCells.map(String)).size} distinct`);
  ok("every Asset Class cell is one of the family's four, or the named remainder",
     cCells.length > 0 && cCells.every((v) => typeof v === "string" && classes.has(v)), `${new Set(cCells.map(String)).size} distinct`);
  ok("the sheet distinguishes more than one basket", new Set(bCells.map(String)).size > 1);
  ok("...and more than one family asset class", new Set(cCells.map(String)).size > 1);
}

// ── 11. …AND THE PAGE HANDS THE SHEET THE LOADER'S WHOLE ANSWER (MSX-19) ────
// Sections 8 and 9 hold the builder to both cases, and neither can see what the
// page passes it. Handed `data?.txns ?? []`, the sheet loses the window and the
// accounts it states, and an archive that did not answer exports as "no trades
// were handed to this export" rather than as the failure it is. A source check,
// crude on purpose: the download is not on any screen a sweep can read.
{
  const ROOT = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../..");
  const page = readFileSync(path.join(ROOT, "src/pages/PortfolioMonitor.tsx"), "utf8");
  const call = /exportPortfolioExcel\(\s*positions\s*,\s*portfolio\.accounts\s*,\s*([^)]*)\)/.exec(page);
  // A member scope (Stage 10di) narrows the answer to the chosen members'
  // dealing — still the loader's whole answer for them, and still `data`
  // itself, null included, wherever the loader answered null.
  const arg = call?.[1].trim();
  const scopedIsData = /const scoped = data && [^;]*: data;/.test(page);
  ok("the Portfolio Monitor's Export hands the sheet the loader's whole answer, null included",
     !!call && (arg === "data" || (arg === "scoped" && scopedIsData)), call ? `${arg}${arg === "scoped" ? ` (null passes through: ${scopedIsData})` : ""}` : "no exportPortfolioExcel call found");
}

console.log(fails ? `\n${fails} failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
