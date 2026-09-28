// EVERY WAY THE FAMILY HOLDS ONE COMPANY, CHECKED AGAINST THE BOOK AND THE STORE.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "I write type a stock I want to know how much I'm holding directly and how
//    much I'm going holding through managers… why should it not show me as a
//    line item holding it through mutual fund here?"
//
// The company page's Position by account table now has a tab per route —
// Direct, PMS managers, Mutual funds — and the mutual-fund route is the one
// place on that page where a rupee does not trace to a statement. Four things
// can go wrong quietly and none of them shows on a rendered page:
//
//   • a DERIVED rupee leaking into the book's own (measured) figure;
//   • a fund line dropped or doubled, so the lines stop adding to the total the
//     Portfolio Monitor's stock axis prints for the same company;
//   • a statement row filed under no route, or under two;
//   • the average cost struck as cost ÷ ALL units, which is what put ₹438.34 on
//     ICICI Bank against a true ₹1,346.33 — the family's own screenshot.
//
// ── THE ANCHORS ARE THE TWO GENERATED ARTEFACTS ─────────────────────────────
//
// `glowData.ts` and the committed `public/lookthrough/` store, read the way the
// page reads them (`useStockExposure`'s three inputs, rebuilt here from the
// book). Every expectation is derived on this run or written as a relation that
// survives either moving; the fetch is served off disk, never stubbed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POLYCAB } from "@/data/glowData";
import { LIVE_PRICED } from "./liveBook";
import { accountIndex, engagementOf } from "@/lib/accounts";
import {
  currentHoldings, dedupedPositions, holdingRoute, isCompanyShare, isFundVehicle, sum,
} from "@/lib/analytics";
import { fifoTotals } from "@/lib/fifo";
import {
  fundLinesFor, heldRouteOf, heldThrough, measuredTotals, HELD_ROUTES,
} from "@/lib/heldThrough";
import { bookIsinBridge, familyValue, heldFundVehicles, loadStockExposure, type StockExposureState } from "@/lib/lookthrough";
import type { Position } from "@/lib/types";
import { lookthroughCompanies } from "@/lib/recordedHoldings";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null | undefined, b: number | null | undefined, tol = 0.01) =>
  a != null && b != null && Math.abs(a - b) <= tol;
const CR = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

// ── the store, served off disk — the same shim `stockExposure.test.ts` uses ──
const STORE = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../../public/lookthrough");
(globalThis as { fetch?: unknown }).fetch = async (u: unknown) => {
  const name = String(u).split("/").pop() ?? "";
  try {
    return { ok: true, json: async () => JSON.parse(readFileSync(path.join(STORE, name), "utf8")) };
  } catch {
    return { ok: false, json: async () => null };
  }
};
(import.meta as { env?: Record<string, string> }).env ??= { BASE_URL: "/" };

// ── the look-through's inputs, through the SAME helpers `useStockExposure` calls ──
// `heldFundVehicles` and `bookIsinBridge` are shared with the page precisely so
// a suite cannot exercise a join the screen does not make (see their own notes).
/**
 * THE BOOK THE COMPANY PAGE READS, ON A DAY THE QUOTE FEED ANSWERS. The page's
 * rows are `portfolio.positions` — the LIVE book — and since Stage 10cy the
 * family's own Motilal demat holdings differ between the two bases: their
 * statement's rate is the last depository movement, never a price, so the funds
 * are valued at AMFI's NAV and the shares only while a quote prices them. Read
 * off `BOOK_POSITIONS` this suite lost ICICI Bank's uncosted demat line — the
 * partly-costed case the average-cost fix exists for — and every company only
 * those funds hold. `LIVE_PRICED` is that book with a STUB feed pricing every
 * recorded share (`liveBook.ts`); no stubbed price is asserted on.
 */
const BOOK: Position[] = LIVE_PRICED;
const consolidated = dedupedPositions(BOOK);
const vehicles = heldFundVehicles(consolidated);
// …over the same companies the page joins to — the valued shares, then the
// ones a statement records and nothing values (`lookthroughCompanies`).
const companies = lookthroughCompanies(consolidated);
const isinToBookKey = bookIsinBridge(companies).index;
const bookCompanyKeys = new Set(companies.filter(isCompanyShare).map((p) => p.securityKey));
const fenced = {
  keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
  isins: new Set(BOOK_POLYCAB.map((p) => (p.isin ?? "").trim().toUpperCase()).filter(Boolean)),
};
const state: StockExposureState = await loadStockExposure(vehicles, isinToBookKey, fenced, bookCompanyKeys);
ok("the committed store answers", state.status === "ok", state.status);
if (state.status !== "ok") process.exit(1);
const ex = state;

// The page's own route function: the account's engagement, through the one
// place that turns it into words.
const accIdx = accountIndex(BOOK_ACCOUNTS);
const routeOf = (p: Position) => holdingRoute(engagementOf(accIdx, p) || null);
const rowsOf = (key: string) => BOOK.filter((p) => p.securityKey === key);

console.log("\n── the route words ──");
ok("own account → Direct", heldRouteOf("own") === "direct");
ok("a discretionary mandate → PMS managers", heldRouteOf("mandate") === "manager");
ok("an unstated route is its own section, never folded into Direct",
  heldRouteOf("unknown") === "other" && heldRouteOf("fund") === "other");
ok("the tabs are offered in the order the table reads",
  JSON.stringify(HELD_ROUTES) === JSON.stringify(["direct", "manager", "fund", "other"]));

// Every company share the book carries, as the page would open it.
const companyKeys = [...new Set(BOOK.filter(isCompanyShare).map((p) => p.securityKey))];
ok("there are companies to check", companyKeys.length > 100, `${companyKeys.length}`);

console.log("\n── the statement rows: every one filed under exactly one route ──");
let partitionFails: string[] = [];
let sectionFails: string[] = [];
for (const key of companyKeys) {
  const rows = rowsOf(key);
  const ht = heldThrough(key, rows, routeOf, BOOK, ex);
  const filed = [...ht.sections.direct.positions, ...ht.sections.manager.positions, ...ht.sections.other.positions];
  if (filed.length !== rows.length || new Set(filed).size !== rows.length || !rows.every((r) => filed.includes(r))) {
    partitionFails.push(key);
  }
  // Each section is deduped within itself; where no holding is reported twice
  // across two routes, the sections add to the measured total exactly.
  const secSum = sum(["direct", "manager", "other"].map((r) => ht.sections[r as "direct"].value ?? 0));
  const spans = rows.some((r) => r.dedupeGroup);
  if (spans ? secSum < ht.measured.mv - 0.01 : !near(secSum, ht.measured.mv)) sectionFails.push(key);
}
ok("every statement row is in exactly one route's section, on every company page",
  partitionFails.length === 0, partitionFails.slice(0, 5).join(", "));
ok("…and the route sections add to the page's measured total",
  sectionFails.length === 0, sectionFails.slice(0, 5).join(", "));
{
  // LOAD-BEARING: a book whose every company sat in one route would pass the
  // partition by construction. Measured, several are split across two.
  const multi = companyKeys.filter((key) => {
    const ht = heldThrough(key, rowsOf(key), routeOf, BOOK, ex);
    return ["direct", "manager", "other"].filter((r) => ht.sections[r as "direct"].lines > 0).length > 1;
  });
  ok("some companies are held both directly and through a manager — the partition is exercised",
    multi.length > 0, `${multi.length}: ${multi.slice(0, 4).join(", ")}`);
}

console.log("\n── the derived half never reaches the measured half ──");
{
  let leaks: string[] = [];
  for (const key of companyKeys) {
    const rows = rowsOf(key);
    const withFunds = heldThrough(key, rows, routeOf, BOOK, ex);
    const without = heldThrough(key, rows, routeOf, BOOK, { status: "loading" });
    const direct = sum(dedupedPositions(rows).map((p) => p.marketValue));
    if (!near(withFunds.measured.mv, without.measured.mv) || !near(withFunds.measured.mv, direct)) leaks.push(key);
  }
  ok("the measured figure is the book's own rows, whatever the look-through says",
    leaks.length === 0, leaks.slice(0, 5).join(", "));
}

console.log("\n── the fund lines add to the figure the Monitor prints ──");
{
  let tieFails: string[] = [];
  let lineFails: string[] = [];
  let withLines = 0;
  for (const [key, hit] of ex.byKey) {
    const fl = fundLinesFor(key, BOOK, ex);
    if (fl.status !== "ok") { tieFails.push(`${key}: ${fl.status}`); continue; }
    if (fl.lines.length) withLines++;
    // derived IS the store's own per-company total — the one the Monitor's stock
    // axis prints as "Via funds" — and the lines, as printed, add to it wherever
    // no fund holding is reported by two statements.
    if (!near(fl.derived, hit.total) || fl.printed < fl.derived - 0.01) tieFails.push(key);
    if (fl.funds !== hit.rows.length) tieFails.push(`${key}: funds ${fl.funds} vs ${hit.rows.length}`);
    for (const l of fl.lines) {
      if (!near(l.value, familyValue(l.fundValue, l.pctAum))) lineFails.push(`${key} ${l.key}`);
      if (l.vehicleClass === "AIF") lineFails.push(`${key} ${l.key}: an AIF line`);
      if (!l.classes.length || !l.classes.every((c) => ["Equity", "Debt", "Other"].includes(c))) {
        lineFails.push(`${key} ${l.key}: classes ${JSON.stringify(l.classes)}`);
      }
    }
  }
  ok("every company's derived total is the store's own, and its lines never add to less",
    tieFails.length === 0, tieFails.slice(0, 5).join(", "));
  ok("each line is its own account's holding × the fund's disclosed weight, and says what it holds",
    lineFails.length === 0, lineFails.slice(0, 5).join(", "));
  ok("the lines are exercised — many companies are held inside funds", withLines > 100, `${withLines}`);

  // …AND ON THIS BOOK NO MUTUAL FUND IS REPORTED TWICE, so printed IS derived.
  // Asserted rather than assumed: the day a dual-reported fund arrives, the page
  // prints its overlap note and this line says why the two stopped agreeing.
  const dualFunds = new Set(BOOK.filter((p) => isFundVehicle(p) && p.assetClass !== "AIF" && p.dedupeGroup)
    .map((p) => p.securityKey));
  let apart = 0;
  for (const key of ex.byKey.keys()) {
    const fl = fundLinesFor(key, BOOK, ex);
    if (fl.status === "ok" && !near(fl.printed, fl.derived, 1)) apart++;
  }
  ok(dualFunds.size === 0
    ? "no mutual fund is reported by two statements, so every company's lines add to its derived total"
    : "a dual-reported fund exists, and only its companies' lines exceed the derived total",
  dualFunds.size === 0 ? apart === 0 : apart > 0, `${apart} apart, ${dualFunds.size} dual-reported funds`);
}

console.log("\n── one line per account that holds the fund, and none for one that does not ──");
{
  const held = currentHoldings(BOOK);
  let fails2: string[] = [];
  for (const [key, hit] of ex.byKey) {
    const fl = fundLinesFor(key, BOOK, ex);
    if (fl.status !== "ok") continue;
    for (const r of hit.rows) {
      const want = new Set(held.filter((p) => p.securityKey === r.fundKey && p.marketValue > 0).map((p) => p.accountId));
      const got = new Set(fl.lines.filter((l) => l.fundKey === r.fundKey).map((l) => l.accountId));
      if (want.size !== got.size || [...want].some((a) => !got.has(a))) fails2.push(`${key} via ${r.fundKey}`);
    }
  }
  ok("the fund route lists exactly the family members holding each fund", fails2.length === 0, fails2.slice(0, 4).join(", "));
}

console.log("\n── the average cost is over the units that HAVE one ──");
{
  // The family's own screenshot: ICICI Bank read ₹438.34 — ₹94.2 L of cost on
  // the 7,000 shares two PMS statements report, divided by 21,500 shares of
  // which 14,500 sit in a demat that reports none. Found from the book, not
  // typed: every company whose cost covers some of its units and not all.
  let avgFails: string[] = [];
  const partial: string[] = [];
  for (const key of companyKeys) {
    const t = measuredTotals(rowsOf(key));
    if (t.cost === null) { if (t.avgCost !== null) avgFails.push(`${key}: an average cost with no cost`); continue; }
    if (!near(t.avgCost! * t.costedQty, t.cost, 1)) avgFails.push(`${key}: avg × costed units ≠ cost`);
    if (t.costedQty < t.qty - 1e-6) {
      partial.push(key);
      // The old arithmetic, which this must never equal on a partly costed holding.
      if (near(t.avgCost, t.cost / t.qty, 0.005)) avgFails.push(`${key}: struck over every unit`);
      if (t.covers && t.uncostedMV > t.mv * 0.005) avgFails.push(`${key}: claims to cover a set it does not`);
    }
  }
  ok("avg cost × the units that report a cost = the cost, on every company", avgFails.length === 0, avgFails.slice(0, 5).join(", "));
  // THE RETURN IS FIFO OVER THE COSTED ROWS — the figure the page's tiles print,
  // struck once in the model. Re-struck here through `fifoTotals` directly, over
  // the costed rows picked out by this suite rather than by the model.
  const retFails: string[] = [];
  for (const key of companyKeys) {
    const rows = dedupedPositions(rowsOf(key));
    const t = measuredTotals(rowsOf(key));
    const costed = rows.filter((p) => p.costBasis != null && !p.costUnavailable);
    const want = t.cost !== null && t.pnl !== null && t.cost > 0 ? fifoTotals(costed).returnPct : null;
    if (!(want === null ? t.costedReturn === null : near(t.costedReturn, want, 1e-9))) retFails.push(key);
  }
  ok("the return is FIFO over the rows that report a cost, on every company", retFails.length === 0, retFails.slice(0, 5).join(", "));
  ok("…and the partly-costed case exists, so the guard is load-bearing", partial.length > 0, partial.join(", "));
  const icici = partial.find((k) => rowsOf(k).some((p) => /icici bank/i.test(p.security)));
  if (icici) {
    const t = measuredTotals(rowsOf(icici));
    ok(`ICICI Bank: ₹${t.avgCost!.toFixed(2)} on ${t.costedQty} of ${t.qty} shares, not ₹${(t.cost! / t.qty).toFixed(2)}`,
      t.avgCost! > 3 * (t.cost! / t.qty) && !t.covers);
  }
}

console.log("\n── a company held ONLY inside funds ──");
{
  const bookKeys = new Set(BOOK.map((p) => p.securityKey));
  const onlyInFunds = [...ex.byKey.values()].filter((e) => !bookKeys.has(e.key) && e.total > 0)
    .sort((a, b) => b.total - a.total);
  ok("companies the family holds only through funds exist — the page this fixes is reachable",
    onlyInFunds.length > 100, `${onlyInFunds.length}`);
  const top = onlyInFunds[0];
  if (top) {
    const ht = heldThrough(top.key, [], routeOf, BOOK, ex);
    ok(`${top.name}: no statement row, so every measured section is empty`,
      ["direct", "manager", "other"].every((r) => ht.sections[r as "direct"].lines === 0 && ht.sections[r as "direct"].value === 0)
        && ht.measured.mv === 0 && ht.measured.cost === null && ht.measured.avgCost === null);
    ok(`…and the whole of it is the fund route, ${CR(top.total)}`,
      ht.fundLines.status === "ok" && ht.fundLines.lines.length > 0 && near(ht.total, top.total) && near(ht.derived, top.total));
  }
}

console.log("\n── the funds that disclose nothing are named, not dropped ──");
{
  const fl = fundLinesFor(companyKeys[0], BOOK, ex);
  const aifVehicles = vehicles.filter((v) => v.assetClass === "AIF");
  if (fl.status === "ok") {
    ok("every AIF the family holds is named as unreadable", fl.aif.length === aifVehicles.length,
      `${fl.aif.length} named, ${aifVehicles.length} held`);
    ok("…at the value the book carries for them", near(sum(fl.aif.map((s) => s.marketValue)), sum(aifVehicles.map((v) => v.marketValue)), 1));
    ok("read + AIF + unread = every fund holding considered",
      fl.covered + fl.aif.length + fl.unread.length === fl.considered,
      `${fl.covered} + ${fl.aif.length} + ${fl.unread.length} vs ${fl.considered}`);
  } else ok("the fund lines answer", false, fl.status);
}

console.log("\n── the states before the store answers ──");
for (const status of ["loading", "unreachable"] as const) {
  const ht = heldThrough(companyKeys[0], rowsOf(companyKeys[0]), routeOf, BOOK, { status });
  ok(`${status}: no derived figure and no total — never a zero standing for "none"`,
    ht.fundLines.status === status && ht.derived === null && ht.total === null && ht.sections.fund.value === null);
}

console.log("\n── the ring-fence holds on this page too ──");
{
  let leaks = 0;
  for (const key of fenced.keys) {
    const fl = fundLinesFor(key, BOOK, ex);
    if (fl.status === "ok" && fl.lines.length) leaks++;
  }
  for (const [, hit] of ex.byKey) if (fenced.keys.has(hit.key)) leaks++;
  ok("no fund line names the ring-fenced holding", leaks === 0 && fenced.keys.size > 0, `${fenced.keys.size} fenced keys`);
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nall held-through checks pass");
