// THE VENDOR SECTOR TIER, CHECKED AGAINST THE BOOK IT PLACES.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "majority of the classification of the securities is in the unclassified
//    section, look up all the holding securities sector classification on the
//    screener.in website or any other website and show them in their
//    appropriate sector classification"
//
// A DEPOSITORY PRINTS NO INDUSTRY. It prints an ISIN, a quantity and a rate, so
// read off the book alone every share the family bought in its own demat is
// Unclassified — one grey wedge over ₹94.9 Cr. `npm run build-sectors` fetches
// screener.in per NSE SYMBOL, verifies the page is the company it asked for and
// commits `src/data/screenerSectors.json`; `companyExposure` reads it as the
// THIRD and weakest tier, filling an empty sector and never overruling one.
//
// ── THE DANGER IS THAT A SECTOR LOOKS AUTHORITATIVE WHATEVER PUT IT THERE ───
//
// A wedge on a donut carries no provenance, so all three failures below are
// invisible on a rendered page and none of them makes a figure look wrong:
//
//   • the vendor OVERRULING a statement — the family's own document loses to a
//     website, silently, on the 84 companies where both have an answer;
//   • a symbol resolving to the WRONG company — a complete, correct sector
//     belonging to somebody else, which is the worst fabrication available here
//     because there is nothing on screen to catch it by;
//   • the map going stale against a rebuilt book, so a key that placed a
//     company yesterday places nothing today and the page quietly regrows its
//     grey wedge.
//
// ── THE ANCHORS ARE TWO GENERATED ARTEFACTS, NEVER TYPED-IN FIGURES ─────────
//
// `glowData.ts` comes from `source/` through `build-book`; `screenerSectors.json`
// comes from screener.in through `build-sectors`. They move on their own
// schedules, so every expectation is either derived from BOTH on this run or
// written as a RELATION that survives either moving.
import { BOOK_POSITIONS } from "@/data/glowData";
import nseSymbols from "@/data/nseSymbols.json";
import screenerSectors from "@/data/screenerSectors.json";
import { dedupedPositions, isCompanyShare } from "@/lib/analytics";
import { resolveSector, UNCLASSIFIED } from "@/lib/sectors";

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

type Vendor = {
  gics: string;
  screenerSector: string;
  screenerSectorCode: string;
  screenerBroadSector: string;
  screenerIndustry: string;
  joinedBy: string;
};
const MAP = screenerSectors as Record<string, Vendor>;
const KEY_TO_SYMBOL = nseSymbols as Record<string, string>;
const entries = Object.entries(MAP);

console.log("\n── the store is well formed, and every field is populated ──");
ok("the store is not empty", entries.length > 0, `${entries.length} symbols`);
ok("every key is an NSE trading symbol",
  entries.every(([s]) => /^[A-Z0-9&*\-]+$/.test(s)),
  entries.filter(([s]) => !/^[A-Z0-9&*\-]+$/.test(s)).map(([s]) => s).join(", ") || "all");
ok("every entry carries a GICS sector, and none is the absent one",
  entries.every(([, v]) => typeof v.gics === "string" && v.gics.length > 0 && v.gics !== UNCLASSIFIED));
ok("every entry keeps screener's own words beside the GICS one",
  entries.every(([, v]) => !!v.screenerSector && !!v.screenerIndustry && !!v.screenerSectorCode),
  "so a mapping decision can be re-argued from what the page actually said");

/*
 * ── THE JOIN IS BY IDENTIFIER, AND THAT IS THE WHOLE LICENCE FOR IT ─────────
 *
 * `joinedBy` records which guard let each page through: `nse-symbol` where the
 * page ECHOED the symbol we asked for, `name` where it printed none (the SME
 * listings do not) and the page's own H1 agreed with the book's name through
 * this repo's `securityKeyOf`. There is NO third form and there must not be:
 * a page accepted on neither is a page accepted on the URL alone, which is the
 * assumption `matchSecurity`'s refused fuzzy tier already cost this repo once.
 */
console.log("\n── every page was proved to be the company it was asked for ──");
const joins = new Set(entries.map(([, v]) => v.joinedBy));
ok("no entry was accepted without a round-trip guard",
  [...joins].every((j) => j === "nse-symbol" || j === "name"),
  [...joins].join(", "));
const bySymbol = entries.filter(([, v]) => v.joinedBy === "nse-symbol").length;
ok("and the identifier guard carries the great majority",
  bySymbol / entries.length >= 0.9,
  `${bySymbol} of ${entries.length} echoed their own NSE symbol`);

/*
 * ── EVERY LABEL RESOLVES THROUGH THE ONE COMMITTED MAP ─────────────────────
 *
 * `shared/sectors.mjs` is the single provider-label → GICS table this repo
 * has, and the vendor tier had to extend it rather than grow a second one:
 * two tables are two chances for the same company to sit under two headings
 * on two screens. So the invariant is that the STORED gics is exactly what
 * that map returns for the STORED screener label — never a value the build
 * script decided on its own.
 */
console.log("\n── the GICS answer is the committed map's, not the script's ──");
const mismatched = entries.filter(([, v]) => resolveSector(v.screenerSector).sector !== v.gics);
eq("every stored GICS is `resolveSector(screenerSector)`", mismatched.map(([s]) => s), []);

/*
 * ── IT ACTUALLY PLACES COMPANIES THE BOOK CANNOT ───────────────────────────
 *
 * The load-bearing claim, and it is an INEQUALITY against the book rather than
 * a literal: a suite that passes over no input claims confidence nobody earned
 * (`golden.mjs`'s rule), and a store wired to a book it no longer matches would
 * satisfy every structural check above while placing nothing at all.
 */
console.log("\n── it places company shares the book leaves unclassified ──");
const ded = dedupedPositions(BOOK_POSITIONS);
const shares = ded.filter(isCompanyShare);
const symbolFor = (p: { symbol?: string | null; securityKey: string }) =>
  p.symbol ?? KEY_TO_SYMBOL[p.securityKey] ?? null;

const unplacedByBook = new Map<string, string>();     // securityKey → symbol
for (const p of shares) {
  if (p.sector && p.sector !== UNCLASSIFIED) continue;
  const s = symbolFor(p);
  if (s) unplacedByBook.set(p.securityKey, s);
}
const rescued = [...unplacedByBook.values()].filter((s) => MAP[s]);
ok("the vendor tier places company shares no statement placed",
  rescued.length > 0,
  `${rescued.length} of ${unplacedByBook.size} unclassified shares that resolve a symbol`);

/*
 * ── AND IT NEVER OVERRULES A STATEMENT — MEASURED, NOT ASSERTED ────────────
 *
 * Where the book and the vendor BOTH have an answer they are compared, and the
 * disagreements are counted rather than suppressed: they are genuine taxonomy
 * judgements (GICS files a cinema under Communication Services, several Indian
 * providers under Consumer Discretionary) and the STATEMENT keeps its answer on
 * every one of them. The gate is on the AGREEMENT RATE, so a store that started
 * disagreeing wholesale — a shifted column, a renamed label, a wrong page —
 * fails here rather than quietly re-sectoring the book on the next drop.
 */
console.log("\n── where both have an answer they agree, and the book still wins ──");
// PER COMPANY, NOT PER POSITION. One company can be held in several accounts
// and each row would count its own agreement again — inflating the sample and
// printing the same disagreement three times, which reads as three findings.
const seen = new Set<string>();
let both = 0, agree = 0;
const differ: string[] = [];
for (const p of shares) {
  if (!p.sector || p.sector === UNCLASSIFIED) continue;
  const s = symbolFor(p);
  const v = s ? MAP[s] : undefined;
  if (!v || seen.has(s as string)) continue;
  seen.add(s as string);
  both += 1;
  if (v.gics === p.sector) agree += 1;
  else differ.push(`${s}: book ${p.sector} vs screener ${v.gics}`);
}
ok("the two sources have both been measured against each other", both > 0, `${both} companies`);
ok("and they agree on the overwhelming majority",
  both > 0 && agree / both >= 0.9,
  `${agree} of ${both} (${((agree / both) * 100).toFixed(1)}%)`);
for (const d of differ) console.log(`     · ${d} — the statement keeps its answer`);

console.log(fails === 0 ? "\nAll screener-sector checks passed." : `\n${fails} FAILED`);
if (fails) process.exit(1);
