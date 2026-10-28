// LISTED DEMAT SHARES AT EACH DAY'S PUBLISHED CLOSE, IN THE BOOK LINE (Stage 10iz).
//   npm run test:family
//
// Struck on constructed books for each rule, then on the real book with a
// public-price fixture:
//
//   1. A demat the statement values keeps its other holdings at their statement
//      values and values its assumed shares at every close FROM the statement
//      date — that day at its own close, never at the statement's mark.
//   2. A gross dividend leaves the holding on its ex-date as money paid out, so
//      the line counts it once, as return.
//   3. A demat no statement values becomes its own investment and joins the
//      return on its statement date.
//   4. A later trade, a newer valuation of the account, or a missing price keeps
//      the holding off the published closes, with its reason; a price still
//      loading is counted as pending.
//   5. On the real book, the line's end level is the statement series' plus
//      exactly what the published closes add.
import assert from "node:assert/strict";
import { assumedBookNav, dematHoldings } from "../assumedBookNav";
import { bookNavSeries, type NavUnit } from "../bookNav";
import { navIndexSeries } from "../navSeries";
import type { AssumedReturnBook } from "../assumedHoldingReturns";
import type { Account, Position } from "../types";
import type { ActionFeed } from "../corporateActions";
import type { MarketHistory } from "../marketReturns";
import { WHOLE_BOOK_NAV, BOOK_NAV_UNITS } from "../bookNavBook";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { shareCandidates } from "../depositoryShares";
import { marketInstruments } from "../useMarketReturns";
import { assumedHoldingBook } from "../assumedHoldingBook";
import { CAPTURE } from "./liveBook";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a != null && Math.abs(a - b) <= eps;

// ── The constructed book ─────────────────────────────────────────────────────
const demat = { accountId: "d", owner: "Test owner", provider: "Test depository", accountNo: "1", asOf: "2026-03-31", engagement: "Direct" } as Account;
const bare = { accountId: "q", owner: "Second owner", provider: "Test depository", accountNo: "2", asOf: "2026-07-31", engagement: "Direct" } as Account;
const share = { accountId: "d", securityKey: "share", security: "Example share", symbol: "SHARE", isin: "INE000000001",
  assetClass: "Equity", marketSide: "listed", quantity: 10, marketValue: 5000, costBasis: null } as Position;
const kept = { ...share, securityKey: "kept", security: "Unlisted line", symbol: undefined, isin: "INE000000002", marketValue: 2000 } as Position;
const loose = { ...share, accountId: "q", securityKey: "loose", security: "Quantity-only share", symbol: "LOOSE", isin: "INE000000003", quantity: 4, marketValue: 0 } as Position;
const dates = ["2026-03-30", "2026-04-15", "2026-05-15", "2026-07-31", "2026-08-15", "2026-09-30"];
const history = (closes: number[]): MarketHistory => ({ ok: true, version: 2, symbol: "X.NS", isin: null, name: "X", source: "Public price fixture",
  basis: "adjusted-close", first: dates[0], last: dates.at(-1)!, t: dates, v: closes, c: closes, splits: [] });
const dividend = { id: "div", ticker: "SHARE", isin: share.isin!, company: "Example", type: "dividend", exDate: "2026-05-15", recordDate: null,
  purpose: "dividend", source: "fixture", sourceUrl: null, factor: null, cashPerShare: 5, issue: null };
const actions = { version: 1, capturedAt: "2026-10-01T00:00:00Z", requestedFrom: "2023-01-01", requestedTo: "2027-01-01",
  verifiedThrough: "2026-09-30", symbols: ["SHARE", "LOOSE"], isins: [], sourceUrl: "fixture", rows: [dividend] } as unknown as ActionFeed;
const book: AssumedReturnBook = {
  positions: [share, kept], unvalued: [{ accountId: "q", securityKey: "loose", isin: loose.isin, quantity: 4, asOf: "2026-07-31" } as never],
  trades: {}, moves: [], movements: {}, actions,
  instruments: new Map([["share", { key: "share", query: "symbol=SHARE" }], ["loose", { key: "loose", query: "symbol=LOOSE" }]]),
  histories: { share: history([300, 320, 330, 350, 360, 400]), loose: history([50, 52, 54, 55, 56, 60]) },
};
// The statement series' own unit for the demat: one mark, its statement's 7,000.
const unit: NavUnit = { key: "d", accountId: "d", securityKey: null, marks: [{ date: "2026-03-31", value: 7000, source: "book" }],
  flows: [], origin: null, originDated: false, atCost: false, recordTo: null, steps: [], bookValue: 7000 };
const other: NavUnit = { key: "fund", accountId: "fund", securityKey: null,
  marks: [{ date: "2026-03-31", value: 1000, source: "statement" }, { date: "2026-09-30", value: 1100, source: "statement" }],
  flows: [], origin: null, originDated: false, atCost: false, recordTo: "2026-09-30", steps: [], bookValue: 1100 };
const base = bookNavSeries([other, unit]);
const run = (b: AssumedReturnBook = book, units: NavUnit[] = [other, unit]) =>
  assumedBookNav({ units, series: base, accounts: [demat, bare], holdings: [share, kept, loose], book: b })!;

{
  const r = run();
  const d = r.series.coverage.units.find((u) => u.key === "d")!;
  ok("the demat's assumed share is valued at published closes, its other holding at its statement value",
    r.assumedCount === 2 && r.holdings.find((h) => h.securityKey === "kept")?.status === "statement");
  // 2,000 carried + 10 × 400 on 30 Sep.
  ok("…to its last close in the window", near(d.endValue, 2000 + 10 * 400), String(d.endValue));
  const pts = r.series.points;
  const at = (date: string) => pts.find((p) => p.date === date);
  // The statement day is 10 × 300 + 2,000 = 5,000 — never the statement's 7,000.
  ok("the statement day is valued at that day's close, not at the statement's mark",
    near(at("2026-03-31")?.panelValue ?? null, 1000 + 2000 + 10 * 300));
  const idx = navIndexSeries(pts);
  // Link by link, each over the investments in it at both ends: the demat is
  // 2,000 carried + 10 × the close, the fund 1,000 → 1,100 on 30 Sep, and the
  // quantity-only demat (4 × its close) joins on 31 Jul and counts from there.
  //   31 Mar → 15 Apr  6,000 → 6,200
  //   15 Apr → 15 May  6,200 → 6,300, with 50 of dividend paid out
  //   15 May → 31 Jul  6,300 → 6,500 (the joining demat in neither end)
  //   31 Jul → 15 Aug  6,720 → 6,824
  //   15 Aug → 30 Sep  6,824 → 7,340
  const want = 100 * (6200 / 6000) * ((6300 + 50) / 6200) * (6500 / 6300) * (6824 / 6720) * (7340 / 6824);
  ok("the chain counts the dividend once, as money paid out on its ex-date", near(idx.at(-1)!.index, want, 1e-9),
    `${idx.at(-1)!.index.toFixed(4)} vs ${want.toFixed(4)}`);
  ok("…and the dividend is a flow on its ex-date", r.series.points.some((p) => p.date === "2026-05-15" && near(p.flowIn ?? 0, -50)));
  const q = r.series.coverage.units.find((u) => u.key === "q");
  ok("a demat no statement values is its own investment, joining on its statement date",
    q?.returnFrom === "2026-07-31" && q.entry === "valuation" && near(q.endValue, 4 * 60));
  ok("no step of an assumed demat is left unproven", r.series.points.every((p) => !(p.unreportedFlowValue ?? 0)));
  ok("the owners are named", r.owners.join("|") === "Second owner|Test owner");
}
{
  const r = run({ ...book, trades: { "d|share": [{ date: "2026-06-01", side: "sell", quantity: 5, price: 1, amount: 5 } as never] } });
  ok("a later sale keeps the share at its statement value", r.holdings.find((h) => h.securityKey === "share")?.status === "statement"
    && /later purchase, sale/.test(r.holdings.find((h) => h.securityKey === "share")?.reason ?? ""));
}
{
  const newer: NavUnit = { ...unit, marks: [...unit.marks, { date: "2026-06-30", value: 7500, source: "statement" }] };
  const r = run(book, [other, newer]);
  ok("a newer valuation of the account wins over units carried from an older statement",
    r.holdings.find((h) => h.securityKey === "share")?.status === "statement");
}
{
  const r = run({ ...book, histories: { loose: book.histories.loose } });
  ok("a price still loading is pending, never valued", r.pending === 1 && r.holdings.find((h) => h.securityKey === "share")?.pending === true);
}
{
  const r = run({ ...book, histories: { ...book.histories, loose: { ok: false, reason: "404" } } });
  ok("a quantity-only share with no price is in neither line", r.holdings.find((h) => h.securityKey === "loose")?.status === "left-out"
    && !r.series.coverage.units.some((u) => u.key === "q"));
}

// ── The real book, on a public-price fixture ─────────────────────────────────
{
  const holdings = dematHoldings(BOOK_ACCOUNTS, BOOK_POSITIONS, shareCandidates());
  ok("the demats are the depository and broking accounts holding shares, never a fund folio",
    new Set(holdings.map((p) => p.accountId)).size >= 5 && holdings.every((p) => !/mutual-fund/.test(p.accountId)));
  const end = WHOLE_BOOK_NAV.coverage.to!;
  const t: string[] = []; for (let ms = Date.parse("2026-01-01"); ms <= Date.parse(end); ms += 864e5) t.push(new Date(ms).toISOString().slice(0, 10));
  const c = t.map((_, i) => 100 + i * 0.05);
  const instruments = marketInstruments(holdings);
  const histories = Object.fromEntries([...instruments.values()].map((i) => [i.key, { ok: true, version: 2, symbol: i.key, isin: null,
    name: i.key.startsWith("fund:") ? "Fixture - Growth" : i.key, source: "fixture", basis: i.key.startsWith("fund:") ? "nav" : "adjusted-close",
    first: t[0], last: t.at(-1)!, t, v: c, c, splits: [] } as MarketHistory]));
  // The fixture's prices have no splits; the capture is read through the end.
  const feed = { ...CAPTURE, verifiedThrough: end, requestedTo: "2027-12-31",
    rows: CAPTURE.rows.filter((r: { type: string }) => r.type !== "split" && r.type !== "bonus") } as ActionFeed;
  const r = assumedBookNav({ units: BOOK_NAV_UNITS, series: WHOLE_BOOK_NAV, accounts: BOOK_ACCOUNTS, holdings,
    book: assumedHoldingBook({ actions: feed, instruments, histories }) })!;
  ok("the real demats' shares are valued at published closes", r.assumedCount > 0 && r.pending === 0,
    `${r.assumedCount} holdings, ${(r.assumedValue / 1e7).toFixed(2)} Cr`);
  // THE TIE: per demat, its end level less the statement series' is the
  // published closes' value less the statement values they replace — plus any
  // dividend dated after its last close and on or before the end.
  const stmt = new Map(WHOLE_BOOK_NAV.coverage.units.map((u) => [u.key, u.endValue ?? 0]));
  const byAccount = new Map<string, number>();
  for (const h of r.holdings.filter((x) => x.status === "assumed")) {
    const own = BOOK_POSITIONS.find((p) => p.accountId === h.accountId && p.securityKey === h.securityKey)?.marketValue ?? 0;
    byAccount.set(h.accountId, (byAccount.get(h.accountId) ?? 0) + h.value - own);
  }
  const ties = [...byAccount].every(([id, delta]) => {
    const got = (r.series.coverage.units.find((u) => u.key === id)?.endValue ?? 0) - (stmt.get(id) ?? 0);
    return Math.abs(got - delta) <= 1;
  });
  ok("each demat's end value moves by exactly what its published closes add", ties);
  ok("…and the investments outside the demats are untouched", WHOLE_BOOK_NAV.coverage.units.every((u) =>
    byAccount.has(u.key) || Math.abs((r.series.coverage.units.find((x) => x.key === u.key)?.endValue ?? 0) - (u.endValue ?? 0)) <= 1e-6));
  ok("every holding not valued this way says why", r.holdings.every((h) => h.status === "assumed" ? h.reason === null : !!h.reason));
  ok("the start days still include the series' first", r.starts[0] === WHOLE_BOOK_NAV.coverage.from);
}

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall passing");
