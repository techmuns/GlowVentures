// THE CUMULATIVE STOCK POSITION, CHECKED AGAINST THE BOOK AND THE STORE.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "In the security selected page we should only see the aggregate stock
//    position across the portfolio thru various channels — direct equity / AIFs
//    / PMS / ETFs. AIF itself shouldn't show up as a security. We need to
//    calculate cumulative stocks position held in the whole portfolio together."
//
// The stock axis adds a MEASURED figure to a DERIVED one, which is the single
// most dangerous arithmetic in this app: everywhere else a rupee on screen
// traces to a statement, and here half of one does not. Three things can go
// wrong quietly and none of them shows on a rendered page:
//
//   • a scheme double-counted, or one silently dropped, moving the derived half
//     while every caption still reads correctly;
//   • a company keyed two ways, so the family's own question — how much HDFC
//     Bank do I hold — gets two answers on one screen;
//   • the ring-fence not reaching the derived side, putting the promoter block
//     back on a page the family asked to be rid of it on.
//
// ── THE ANCHORS ARE TWO GENERATED ARTEFACTS, NOT TYPED-IN FIGURES ───────────
//
// `glowData.ts` comes from `source/` through `build-book`; `public/lookthrough/`
// comes from a READ-ONLY checkout of `techmuns/amfibeas` through
// `build-lookthrough`. They move on their own schedules. So every expectation
// here is either derived from BOTH on this run, or written as a RELATION that
// survives either moving. The one place a literal appears it is a COUNT that a
// `?? 0` would change without moving any total, which is exactly what a literal
// is for.
//
// ── IT EXERCISES THE REAL FUNCTION ──────────────────────────────────────────
//
// `loadStockExposure` fetches the store, so `fetch` is served from the committed
// files on disk rather than stubbed with invented ones. A hand-written fixture
// would prove only that two inventions agree with each other — the rule the
// cash-flow suite already follows for its two saved API responses.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS, BOOK_POLYCAB, BOOK_SUMMARY } from "@/data/glowData";
import { dedupedPositions, isCompanyShare, isFundVehicle, sum } from "@/lib/analytics";
import { loadStockExposure, type HeldFund, type StockExposureState } from "@/lib/lookthrough";
import { securityKeyOf } from "@/lib/securityKey";

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
/** To the rupee, the tolerance every reconciliation in this repo uses. */
const near = (name: string, got: number | null, want: number, tol = 0.01) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};
const CR = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

// ── the store, served off disk ───────────────────────────────────────────────
// `GLOW_FIXTURES` points at the suite's own fixture directory; the look-through
// store is a committed artefact two levels up from it.
const STORE = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../../public/lookthrough");
(globalThis as { fetch?: unknown }).fetch = async (u: unknown) => {
  const name = String(u).split("/").pop() ?? "";
  try {
    return { ok: true, json: async () => JSON.parse(readFileSync(path.join(STORE, name), "utf8")) };
  } catch {
    return { ok: false, json: async () => null };
  }
};
// `import.meta.env` is Vite's, and this runs in node.
(import.meta as { env?: Record<string, string> }).env ??= { BASE_URL: "/" };

const ded = dedupedPositions(BOOK_POSITIONS);
const stocks = ded.filter(isCompanyShare);
const vehicles = (() => {
  const m = new Map<string, HeldFund>();
  for (const p of ded) {
    if (!isFundVehicle(p)) continue;
    const e = m.get(p.securityKey)
      ?? { securityKey: p.securityKey, name: p.security, marketValue: 0, assetClass: p.assetClass };
    e.marketValue += p.marketValue;
    m.set(p.securityKey, e);
  }
  return [...m.values()];
})();
const isinToBookKey = new Map<string, string>();
for (const p of stocks) {
  const i = (p.isin ?? "").trim().toUpperCase();
  if (i && !isinToBookKey.has(i)) isinToBookKey.set(i, p.securityKey);
}
const ringFenced = {
  keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
  isins: new Set(BOOK_POLYCAB.map((p) => (p.isin ?? "").trim().toUpperCase()).filter(Boolean)),
};

const state: StockExposureState = await loadStockExposure(vehicles, isinToBookKey, ringFenced);
ok("the committed store answers", state.status === "ok", state.status);
if (state.status !== "ok") process.exit(1);
const ex = state;

console.log("\n── the partition: every rupee of the book in exactly one bucket ──");
const measured = sum(stocks.map((p) => p.marketValue));
const cash = sum(ded.filter((p) => p.assetClass === "Cash").map((p) => p.marketValue));
const buckets = measured + ex.total + ex.skippedValue + ex.nonEquityValue + cash;
/**
 * THE STRONGEST ASSERTION HERE. The stock axis draws a table covering less than
 * half the book, so a reader is owed a statement of where the rest is — and that
 * statement is only worth anything if the parts reconstruct the whole. Anchored
 * on `BOOK_SUMMARY.totalValue`, which `build-book.mjs` produces on a completely
 * separate path from `dedupedPositions`, so the two agreeing is a real
 * cross-check rather than a figure compared with its own copy.
 */
near("the five buckets rebuild the book's own NAV, to the rupee", buckets, BOOK_SUMMARY.totalValue, 1);
console.log(`     measured ${CR(measured)} + derived ${CR(ex.total)} + opaque ${CR(ex.skippedValue)}`
  + ` + non-equity ${CR(ex.nonEquityValue)} + cash ${CR(cash)} = ${CR(buckets)}`);
ok("...and the table covers less than the book, which is why the statement is owed",
  measured + ex.total < BOOK_SUMMARY.totalValue * 0.75,
  `${CR(measured + ex.total)} of ${CR(BOOK_SUMMARY.totalValue)}`);
ok("every bucket is non-negative — a partition, not a subtraction that overshot",
  [measured, ex.total, ex.skippedValue, ex.nonEquityValue, cash].every((v) => v >= 0));
eq("the vehicles split into covered and skipped with none lost",
  ex.covered + ex.skipped.length, vehicles.length);
near("...and their values do too", ex.disclosedValue + ex.skippedValue,
  sum(vehicles.map((v) => v.marketValue)), 1);

console.log("\n── the derived half is derived, and never a book figure ──");
const derivedSum = [...ex.byKey.values()].reduce((a, e) => a + e.total, 0);
near("the per-company totals add to the index's own total", derivedSum, ex.total, 1);
for (const e of ex.byKey.values()) {
  const rowSum = e.rows.reduce((a, r) => a + r.value, 0);
  if (Math.abs(rowSum - e.total) > 0.01) {
    ok(`a company's rows add to its total (${e.name})`, false);
    break;
  }
}
ok("every company's fund rows add to its own total", true);
ok("no derived value is non-finite — a `?? 0` here is the absent-vs-zero rule failing through a field",
  [...ex.byKey.values()].every((e) => Number.isFinite(e.total) && e.rows.every((r) => Number.isFinite(r.value))));
ok("no company is carried at an exposure of nothing", [...ex.byKey.values()].every((e) => e.total > 0),
  "a scheme the family holds at ₹0 gives ₹0 of everything in it, and that is not a holding");
ok("a fund contributes at most one line per company",
  [...ex.byKey.values()].every((e) => new Set(e.rows.map((r) => r.fundKey)).size === e.rows.length));
ok("every join is exact — ISIN or this book's own key, never a resemblance",
  [...ex.byKey.values()].every((e) => e.rows.every((r) => r.via === "isin" || r.via === "name")));

console.log("\n── the ring-fence reaches the derived side ──");
ok("this book has a ring-fenced holding to test against", BOOK_POLYCAB.length > 0);
const fencedKeys = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
const fencedNames = new Set(BOOK_POLYCAB.map((p) => securityKeyOf(p.security)));
ok("no fenced security reaches the index by key",
  ![...ex.byKey.keys()].some((k) => fencedKeys.has(k) || fencedNames.has(k)));
ok("...nor by the name an AMC files it under",
  ![...ex.byKey.values()].some((e) => /polycab/i.test(e.name)),
  "the fence is about a SECURITY wherever it is reported, including inside somebody else's portfolio");
/**
 * AND THE FENCE IS LOAD-BEARING RATHER THAN VACUOUS. Run WITHOUT it the same
 * store must put that company back — otherwise this suite would pass on a book
 * where no scheme discloses it and would go on passing after the guard was
 * deleted, which is `golden.mjs`'s rule about a test with no input.
 */
const unfenced = await loadStockExposure(vehicles, isinToBookKey);
ok("...and dropping the fence really would put it back",
  unfenced.status === "ok" && [...unfenced.byKey.values()].some((e) => /polycab/i.test(e.name)),
  "so the guard above is exercised, not merely present");

console.log("\n── one company, one row: the family's own question ──");
/**
 * "How much HDFC Bank do I hold in my 1,000 crores?" Two funds filing the same
 * company under `HDFC Bank Ltd.` and `HDFC Bank Limited`, one of them with an
 * ISIN and one without, must not answer that question twice. This is struck on
 * the WHOLE index rather than on one name: any two entries whose names normalise
 * the same are one company keyed two ways.
 */
const byNormalised = new Map<string, string[]>();
for (const e of ex.byKey.values()) {
  const k = securityKeyOf(e.name);
  (byNormalised.get(k) ?? byNormalised.set(k, []).get(k)!).push(e.key);
}
const doubled = [...byNormalised.entries()].filter(([, keys]) => keys.length > 1);
eq("no company stands in the index under two keys", doubled.length, 0);
const hdfc = [...ex.byKey.values()].filter((e) => /^hdfc bank/i.test(e.name));
ok("the family's own example resolves to a single entry", hdfc.length <= 1,
  hdfc.length === 1 ? `${hdfc[0].name} ${CR(hdfc[0].total)} across ${hdfc[0].rows.length} funds` : "not disclosed by any fund here");

console.log("\n── the ISIN tier is what bridges the depository to an AMC ──");
/**
 * A depository prints `SBI - EQ` and an AMC files `State Bank of India`; those
 * normalise apart and only the identifier joins them. If this ever reaches zero
 * the tier has stopped working and every such company has quietly split into a
 * measured row and a derived one.
 */
const bridged = [...ex.byKey.entries()].filter(([k, e]) =>
  isinToBookKey.has((e.isin ?? "").toUpperCase())
  && isinToBookKey.get((e.isin ?? "").toUpperCase()) === k
  && securityKeyOf(e.name) !== k);
ok("companies joined to a book row ONLY because of their ISIN", bridged.length > 0,
  `${bridged.length}, e.g. ${bridged.slice(0, 3).map(([k]) => k).join(", ")}`);

console.log("\n── what it cannot see is counted, not claimed ──");
const aif = ex.skipped.filter((s) => /^an AIF files/.test(s.reason));
ok("the AIF block is skipped with a reason about the INSTRUMENT", aif.length > 0,
  `${aif.length} folios, ${CR(sum(aif.map((s) => s.marketValue)))}`);
ok("...and that reason says no future statement fills it",
  aif.every((s) => /joins to a folio this family holds/.test(s.reason)));
ok("every skipped vehicle carries its own value, so a caller can state the size",
  ex.skipped.every((s) => Number.isFinite(s.marketValue)));
near("non-equity is exactly the disclosed value the equity rows do not account for",
  ex.nonEquityValue, ex.disclosedValue - ex.total, 0.01);

process.exit(fails ? 1 : 0);
