// THE PORTFOLIO MONITOR'S SECTOR COLUMN, AND THE PREMISE IT LOADS THE FILINGS ON.
//   npm run test:family
//
// ── WHY THIS EXISTS (MH-07, B-04, MSX-6) ────────────────────────────────────
//
// The Monitor's Sector column and its `?sector=` filter read `Position.sector`,
// which is the family's own STATEMENT alone — and a depository statement prints
// an ISIN, a quantity and a rate and no industry at all. So every share the
// family bought in its own demat read "Unclassified" there, while Sector
// Composition and Family & Entities placed nearly all of them through the one
// shared three-tier classification (`companySectorIndex`: the statement, then a
// fund's SEBI filing joined on the ISIN, then screener.in joined on the NSE
// symbol). The Monitor reads that index now.
//
// ── THE PREMISE THE PAGE STANDS ON ──────────────────────────────────────────
//
// The Monitor loaded the fund filings on the Security axis only, which cost
// nothing on the other three ONLY IF the filings placed no held company the
// statement and screener.in did not already place. The November 2026 delivery
// (Stage 10kn) brought one: a fund files Sterlite Technologies under Information
// Technology where screener.in says Communication Services. So the Monitor loads
// the filings on every axis, and this suite now holds the rule that makes that
// safe: wherever the filings move a held company's sector, it is the FILING tier
// outranking screener.in — never a statement overruled.
//
// ── IT EXERCISES THE REAL FUNCTIONS ─────────────────────────────────────────
//
// `loadStockExposure` is fed the committed `public/lookthrough/` files off disk,
// through the same `heldFundVehicles` and `bookIsinBridge` the page's hook uses,
// so the suite cannot exercise a join the screen does not make. And tiers 1 and
// 3 are RE-EXPRESSED here from the book and the two committed maps, never read
// back out of the index, so a change to the index's order of precedence fails
// by name rather than agreeing with itself.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS, BOOK_POLYCAB } from "@/data/glowData";
import { currentHoldings, dedupedPositions, isCompanyShare } from "@/lib/analytics";
import { bookIsinBridge, companySectorIndex, heldFundVehicles, loadStockExposure, type StockExposureState } from "@/lib/lookthrough";
import { UNCLASSIFIED } from "@/lib/sectors";
import { lookthroughCompanies } from "@/lib/recordedHoldings";
import NSE_SYMBOLS from "@/data/nseSymbols.json";
import SCREENER from "@/data/screenerSectors.json";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── the store, served off disk (the same arrangement `stockExposure.test.ts` uses) ──
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

const ded = dedupedPositions(BOOK_POSITIONS);
const stocks = ded.filter(isCompanyShare);
/** The company shares the Monitor draws a row for: what the family holds TODAY. */
const held = [...new Set(dedupedPositions(currentHoldings(BOOK_POSITIONS)).filter(isCompanyShare).map((p) => p.securityKey))];
const ringFenced = {
  keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
  isins: new Set(BOOK_POLYCAB.map((p) => (p.isin ?? "").trim().toUpperCase()).filter(Boolean)),
};
// The companies the page's look-through joins to (`lookthroughCompanies`).
const companies = lookthroughCompanies(ded);
const state: StockExposureState = await loadStockExposure(
  heldFundVehicles(ded), bookIsinBridge(companies).index, ringFenced, new Set(companies.map((p) => p.securityKey)));
ok("the committed look-through store answers", state.status === "ok", state.status);
if (state.status !== "ok") process.exit(1);

const withFilings = companySectorIndex(stocks, state);
const withoutFilings = companySectorIndex(stocks, { status: "loading" });
const sectorOf = (m: ReturnType<typeof companySectorIndex>, k: string) => m.get(k)?.sector || UNCLASSIFIED;

console.log("\n── where the filings move a held company's sector, the filing tier is why ──");
const differ = held.filter((k) => sectorOf(withFilings, k) !== sectorOf(withoutFilings, k));
const bookSectored = (k: string) => stocks.some((p) => p.securityKey === k && !!p.sector && p.sector !== UNCLASSIFIED);
ok("every held company the filings move is placed BY the filing, over no statement's sector",
  differ.every((k) => withFilings.get(k)?.from === "disclosure" && !bookSectored(k)),
  differ.map((k) => `${k}: ${sectorOf(withoutFilings, k)} → ${sectorOf(withFilings, k)} (${withFilings.get(k)?.from})`).join("; ") || "none");
ok("…and the November 2026 case is one of them: Sterlite Technologies, which is why the Monitor loads the filings on every axis",
  differ.includes("sterlite-technologies"), differ.join(", "));
/**
 * LOAD-BEARING: the filings DO place companies — just none this book holds that
 * the other tiers miss. A store that answered with nothing would satisfy the
 * premise above by placing nothing at all.
 */
const placedByFilings = [...withFilings.values()].filter((x) => x.from === "disclosure").length;
ok("the filings place companies of their own (so the premise is a measurement, not an empty store)", placedByFilings > 0, `${placedByFilings}`);

console.log("\n── tiers 1 and 3, re-expressed from the book and the two committed maps ──");
const SYM = NSE_SYMBOLS as Record<string, string>;
const VENDOR = SCREENER as Record<string, { gics?: string | null }>;
const expected = (k: string): string => {
  const rows = stocks.filter((p) => p.securityKey === k);
  const book = rows.find((p) => !!p.sector && p.sector !== UNCLASSIFIED);
  if (book) return book.sector;
  const symbol = rows.find((p) => !!p.symbol)?.symbol ?? SYM[k] ?? null;
  const g = symbol ? VENDOR[symbol]?.gics : null;
  return g && g !== UNCLASSIFIED ? g : UNCLASSIFIED;
};
const mismatch = held.filter((k) => expected(k) !== sectorOf(withoutFilings, k));
ok("every held company's sector is its statement's, else screener.in's, else Unclassified", mismatch.length === 0,
  mismatch.slice(0, 6).map((k) => `${k}: index ${sectorOf(withoutFilings, k)} vs ${expected(k)}`).join("; "));
/**
 * AND THE COLUMN'S WHOLE REASON FOR CHANGING: the index places company shares
 * the statements alone leave unplaced. Asserted as an INEQUALITY, so a build that
 * wired the column back to `Position.sector` fails here as surely as on the page.
 */
const bookPlaced = held.filter((k) => stocks.some((p) => p.securityKey === k && !!p.sector && p.sector !== UNCLASSIFIED)).length;
const indexPlaced = held.filter((k) => sectorOf(withoutFilings, k) !== UNCLASSIFIED).length;
ok("the shared index places more held companies than the statements do", indexPlaced > bookPlaced,
  `${indexPlaced} placed against ${bookPlaced} by the statements alone, of ${held.length}`);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nall passed");
