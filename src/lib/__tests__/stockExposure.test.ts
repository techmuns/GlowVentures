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
import { BOOK_POLYCAB } from "@/data/glowData";
import { LIVE_POSITIONS, liveBookTotal } from "./liveBook";
import { NEGLIGIBLE_VALUE_FLOOR, dedupedPositions, droppedHoldings, isCompanyShare, isFundVehicle, sum } from "@/lib/analytics";
import { isArbitrageFund } from "@/lib/fundNavs";
import { bookIsinBridge, heldFundVehicles, issuerKeyOf, issuerNameOf, issuerOf, loadStockExposure, type StockExposureState } from "@/lib/lookthrough";
import { securityKeyOf } from "@/lib/securityKey";
import { securityLabel } from "@/lib/securityLabel";
import { lookthroughCompanies } from "@/lib/recordedHoldings";
import { UPSTOX_INSTRUMENTS } from "../../../shared/upstoxInstruments.mjs";
import NSE_SYMBOLS from "@/data/nseSymbols.json";

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

/**
 * THE BOOK THE PAGE READS. `useStockExposure` is handed the LIVE consolidated
 * set (`PortfolioContext`), and since Stage 10cy that differs from the statement
 * basis by more than a published NAV: the three Motilal Oswal holding
 * statements' funds are valued there at AMFI's NAV and nowhere on the statement
 * basis, because the rate those statements print is the last depository
 * movement, never a price. Read off `BOOK_POSITIONS` this suite lost the funds
 * that hold LIC Housing's twelve NCDs and the Government of India's paper — the
 * very look-through it exists to check — while the page still drew them.
 */
const ded = dedupedPositions(LIVE_POSITIONS);
/** The live book's own NAV, reached on a second path (see `liveBookTotal`). */
const BOOK_NAV = liveBookTotal();
const stocks = ded.filter(isCompanyShare);
/**
 * THE SAME FUNDS THE PAGE LOADS — `heldFundVehicles`, shared with
 * `useStockExposure` for the reason `bookIsinBridge` is below. This used to be
 * every fund vehicle in the deduped book, redeemed ones included, and that is a
 * different JOIN rather than a larger set of the same one: a redeemed fund's
 * filing is still read when the issuer prefixes are decided, and HDFC Small Cap
 * — redeemed to nil — files City Union's share. So here City Union's
 * certificates of deposit joined the book's company by that share's ISIN, while
 * the page, which loads today's funds only, needed the issuer seed. The bug pass
 * switched the seed off and the page failed while this suite passed.
 */
const vehicles = heldFundVehicles(ded);
/**
 * THE SAME INDEX THE PAGE BUILDS — `bookIsinBridge` is shared with
 * `useStockExposure` precisely so this suite cannot exercise a join the screen
 * does not make. It used to build its own out of the statements' ISINs alone,
 * which is how the listing tier's absence went unnoticed: every company held
 * only through a mandate joined to nothing, and this suite agreed.
 */
/**
 * …OVER THE SAME COMPANIES — the book's valued shares, then the ones a
 * statement records and nothing values, under the key the live layer files them
 * by (`lookthroughCompanies`, Stage 10cy). Built off `stocks` alone, a fund's
 * Kaynes line landed on the filing's spelling here while the page — on a day no
 * quote had made Ankita's demat line a row — needed the recorded line to put it
 * on the family's own Kaynes.
 */
const companies = lookthroughCompanies(ded);
const bridge = bookIsinBridge(companies);
const isinToBookKey = bridge.index;
const bookCompanyKeys = new Set(companies.map((p) => p.securityKey));
const ringFenced = {
  keys: new Set(BOOK_POLYCAB.map((p) => p.securityKey)),
  isins: new Set(BOOK_POLYCAB.map((p) => (p.isin ?? "").trim().toUpperCase()).filter(Boolean)),
};

const state: StockExposureState = await loadStockExposure(vehicles, isinToBookKey, ringFenced, bookCompanyKeys);
ok("the committed store answers", state.status === "ok", state.status);
if (state.status !== "ok") process.exit(1);
const ex = state;

console.log("\n── the partition: every rupee of the book in exactly one bucket ──");
const measured = sum(stocks.map((p) => p.marketValue));
// The book's cash rows AND the arbitrage funds the family counts as cash — the
// page's own `stockCoverage.cash`. They are not looked through (`heldFundVehicles`
// skips them), so on the live book, which carries the depository's arbitrage
// funds, a cash term of `Cash` rows alone leaves them in no bucket.
const cash = sum(ded.filter((p) => p.assetClass === "Cash" || isArbitrageFund(p)).map((p) => p.marketValue));
/**
 * THE ₹1,000 FLOOR, AS A TERM OF ITS OWN. The funds are today's holdings
 * (`heldFundVehicles`), so the fund rows `currentHoldings` leaves out are in no
 * bucket above: the redeemed ones at a measured ₹0, and the specks under the
 * floor. Stated rather than absorbed into the tolerance — the treatment
 * `negligibleFloor.test.ts` gives the same rows — and bounded below, so a floor
 * that grew into a policy on real money fails instead of reconciling.
 */
const floorOut = droppedHoldings(ded.filter(isFundVehicle));
const floored = sum([...floorOut.closed, ...floorOut.negligible].map((p) => p.marketValue));
const buckets = measured + ex.total + ex.skippedValue + ex.unaccountedValue + ex.fencedValue + cash + floored;
/**
 * THE STRONGEST ASSERTION HERE. The stock axis draws a table covering less than
 * half the book, so a reader is owed a statement of where the rest is — and that
 * statement is only worth anything if the parts reconstruct the whole. Anchored
 * on `liveBookTotal()` — `build-book.mjs`'s own `BOOK_SUMMARY.totalValue` plus
 * two named steps, the NAV's move and the live-only rows — which is a completely
 * separate path from `dedupedPositions`, so the two agreeing is a real
 * cross-check rather than a figure compared with its own copy.
 */
near("the five buckets rebuild the live book's own NAV, to the rupee", buckets, BOOK_NAV, 1);
console.log(`     measured ${CR(measured)} + derived ${CR(ex.total)} + opaque ${CR(ex.skippedValue)}`
  + ` + unaccounted ${CR(ex.unaccountedValue)} + fenced ₹${ex.fencedValue.toFixed(2)} + cash ${CR(cash)} + under the floor ₹${floored.toFixed(2)} = ${CR(buckets)}`);
ok("...where the floor's term is specks and redeemed nils, never money",
  floorOut.closed.every((p) => p.marketValue === 0)
    && floored < NEGLIGIBLE_VALUE_FLOOR * new Set(floorOut.negligible.map((p) => p.securityKey)).size,
  `₹${floored.toFixed(2)} across ${floorOut.negligible.length} speck row(s) and ${floorOut.closed.length} redeemed`);
ok("...and the table covers less than the book, which is why the statement is owed",
  measured + ex.total < BOOK_NAV * 0.75,
  `${CR(measured + ex.total)} of ${CR(BOOK_NAV)}`);
ok("every bucket is non-negative — a partition, not a subtraction that overshot",
  [measured, ex.total, ex.skippedValue, ex.unaccountedValue, ex.fencedValue, cash].every((v) => v >= 0));
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
ok("a fund contributes at most one ROW per issuer",
  [...ex.byKey.values()].every((e) => new Set(e.rows.map((r) => r.fundKey)).size === e.rows.length));
ok("every join is exact — ISIN or this book's own key, never a resemblance",
  [...ex.byKey.values()].every((e) => e.rows.every((r) => r.via === "isin" || r.via === "name")));

/**
 * ── EVERY INSTRUMENT OF AN ISSUER ADDS, AND THE ROW IS THEIR SUM ────────────
 *
 *   "the Look-through must cover bonds, NCDs and every instrument, not just
 *    stocks… there is a LIC housing NCD in the market."
 *
 * The store used to carry each AMC's equity section alone, where ONE line per
 * fund per company was right: the only repeat was a second share class. On the
 * whole filing it is the difference between an answer and a wrong one — HDFC
 * Balanced Advantage files TWELVE separate LIC Housing NCDs, and keeping the
 * first reports a twelfth of the exposure. Every assertion here is a RELATION
 * so none goes stale when either generated artefact moves.
 */
console.log("\n── every instrument, not just stocks ──");
const rowsAll = [...ex.byKey.values()].flatMap((e) => e.rows);
ok("a row's value is the sum of its own instruments",
  rowsAll.every((r) => Math.abs(r.value - r.instruments.reduce((a, i) => a + i.value, 0)) <= 0.01));
ok("...and its weight is the sum of their weights",
  rowsAll.every((r) => Math.abs(r.pctAum - r.instruments.reduce((a, i) => a + i.pctAum, 0)) <= 1e-6));
ok("no instrument is counted twice inside one fund row — the same ISIN filed twice is one holding",
  rowsAll.every((r) => {
    const seen = r.instruments.map((i) => i.isin).filter(Boolean);
    return new Set(seen).size === seen.length;
  }));
const multi = rowsAll.filter((r) => r.instruments.length > 1);
ok("the store really carries an issuer a fund holds through several instruments", multi.length > 0,
  `${multi.length} fund rows, the largest ${Math.max(...multi.map((r) => r.instruments.length))} instruments`);
/**
 * AND THE OLD RULE IS SHOWN TO HAVE BEEN WRONG, not merely replaced. Keeping one
 * line per fund would report the largest such row at a fraction of its value —
 * asserted as an inequality so it cannot pass on a drop where they happen to be
 * close, which is `accountXirr.test.ts`'s own load-bearing gate one page over.
 */
const worst = multi.sort((a, b) => b.instruments.length - a.instruments.length)[0];
ok("...and keeping only its first line would materially understate it",
  !!worst && worst.instruments[0].value < worst.value * 0.5,
  worst ? `${CR(worst.instruments[0].value)} of ${CR(worst.value)} across ${worst.instruments.length} instruments` : "");
/**
 * AN ISSUER IS ONE ROW HOWEVER MANY WAYS ITS PAPER IS NAMED. An Indian ISIN
 * carries its issuer in characters 1-7 whatever the next two say, so this is
 * the property the issuer tier exists to give: no two keys in the index may
 * share an issuer prefix. Measured on this store the NAME tier reaches the same
 * answer for most of them — which is exactly why the guard has to be asserted
 * rather than assumed, since a clean run and a deleted guard look identical.
 */
const issuers = new Map<string, Set<string>>();
for (const e of ex.byKey.values()) {
  for (const r of e.rows) {
    for (const i of r.instruments) {
      if (!i.isin) continue;
      const pre = i.isin.slice(0, 7).toUpperCase();
      (issuers.get(pre) ?? issuers.set(pre, new Set()).get(pre)!).add(e.key);
    }
  }
}
const splitIssuers = [...issuers.entries()].filter(([, v]) => v.size > 1);
ok("no issuer stands in the index under two keys", splitIssuers.length === 0,
  splitIssuers.length ? splitIssuers.slice(0, 3).map(([p, v]) => `${p}: ${[...v].join(" | ")}`).join("; ")
    : `${issuers.size} issuer prefixes, each one row`);
/**
 * AND THE CLASS TRAVELS WITH THE ROW. A company reached only through its bonds
 * must not be filed as equity: the news the family described moves a share price
 * and a credit spread by different amounts, and a reader who cannot see which
 * they hold cannot act. Absent where no filing declared one, never defaulted.
 */
const debtOnly = [...ex.byKey.values()].filter((e) => e.classes.length > 0 && !e.classes.includes("Equity"));
ok("this store reaches issuers through debt alone, and they say so", debtOnly.length > 0,
  `${debtOnly.length} issuers, e.g. ${debtOnly.slice(0, 3).map((e) => e.name).join(", ")}`);
ok("...and every class on a company came off a filing, never a default",
  [...ex.byKey.values()].every((e) => e.classes.every((c) =>
    e.rows.some((r) => r.instruments.some((i) => i.assetClass === c)))));

console.log("\n── the book's own SHARE names its issuer, whatever paper a fund filed ──");
/**
 * A CD IS EXPOSURE TO THE BANK THAT ISSUED IT. The funds file City Union Bank's,
 * Indian Bank's and Karur Vysya Bank's certificates of deposit and not their
 * shares, while the family's demat carries each bank's SHARE by ISIN — and the
 * index keyed the paper on its own name, so ₹52 L of those banks sat under
 * Unclassified as three rows of their own beside the same banks in Financials.
 *
 * RE-EXPRESSED, NOT IMPORTED: the issuer is characters 1–7 of an ISIN and the
 * security type is characters 8–9, `01` an equity share. Every disclosed
 * instrument of an issuer whose share the book carries by an equity-series ISIN
 * must sit on that share's key — and the rule must actually DO something here,
 * or a clean run and a deleted rule would read the same.
 */
const bookEquityIssuer = new Map<string, Set<string>>();
for (const [i, k] of isinToBookKey) {
  if (!/^IN[EF][A-Z0-9]{4}01/.test(i)) continue;
  const pre = i.slice(0, 7);
  (bookEquityIssuer.get(pre) ?? bookEquityIssuer.set(pre, new Set()).get(pre)!).add(k);
}
const strays: string[] = [];
// Per issuer: what the funds filed of it, and whether ANY filing is an ISIN the
// book itself carries. Where none is, only the book's own share can join the
// paper to the company — the case this rule exists for.
const filedOf = new Map<string, { onKey: Set<string>; value: number; bookIsinFiled: boolean }>();
for (const e of ex.byKey.values()) {
  for (const r of e.rows) for (const i of r.instruments) {
    if (!i.isin) continue;
    const I = i.isin.toUpperCase();
    const pre = I.slice(0, 7);
    const want = bookEquityIssuer.get(pre);
    if (!want || want.size !== 1) continue;
    const k = [...want][0];
    if (e.key !== k) strays.push(`${i.name} (${I}) on ${e.key}, not ${k}`);
    const f = filedOf.get(pre) ?? { onKey: new Set<string>(), value: 0, bookIsinFiled: false };
    f.onKey.add(e.key); f.value += i.value; f.bookIsinFiled ||= isinToBookKey.has(I);
    filedOf.set(pre, f);
  }
}
ok("every filed instrument of an issuer whose share the book carries lands on that share's row",
  strays.length === 0, strays.length ? strays.slice(0, 3).join("; ") : `${bookEquityIssuer.size} book equity issuers`);
const onlyThroughBook = [...filedOf.entries()].filter(([, f]) => !f.bookIsinFiled);
ok("...and the rule does work on this store: paper of an issuer no fund files the book's ISIN of joins through the book's share",
  onlyThroughBook.length > 0 && onlyThroughBook.every(([pre, f]) => f.onKey.size === 1 && f.onKey.has([...bookEquityIssuer.get(pre)!][0])),
  `${onlyThroughBook.length} issuers, ${CR(sum(onlyThroughBook.map(([, f]) => f.value)))}: ${onlyThroughBook.map(([pre]) => [...bookEquityIssuer.get(pre)!][0]).join(", ")}`);
/**
 * BOTH HALVES OF THE RULE, ON REAL FILINGS. No fund here files paper of an
 * issuer the book holds only as a warrant or a preference line, so the refusal
 * cannot be seen on the committed book alone. It is exercised by lending the
 * book one synthetic ISIN at a time for an issuer the funds DO file in several
 * instruments — LIC Housing, a share and its NCDs — and nothing else changes:
 *
 *   • an EQUITY-series ISIN of that issuer must pull every filed instrument onto
 *     the synthetic key — the issuer rule;
 *   • a WARRANT-series one (type 13) must pull none — a warrant is not the
 *     equity, the join this repo refuses by name (Borosil's warrants and share).
 */
const lic = [...ex.byKey.values()].find((e) => e.rows.some((r) => r.instruments.some((i) => (i.isin ?? "").toUpperCase().startsWith("INE115A"))));
if (!lic) ok("the store files LIC Housing, which the synthetic cases lend an ISIN to", false);
else {
  const lend = async (isin: string, key: string) => {
    const m = new Map(isinToBookKey); m.set(isin, key);
    const s = await loadStockExposure(vehicles, m, ringFenced);
    return s.status === "ok" ? s : null;
  };
  const asShare = await lend("INE115A01999", "synthetic-lic-share");
  const asWarrant = await lend("INE115A13999", "synthetic-lic-warrant");
  const licPaper = (s: StockExposureState | null, key: string) => s && s.status === "ok"
    ? [...s.byKey.values()].filter((e) => e.rows.some((r) => r.instruments.some((i) => (i.isin ?? "").toUpperCase().startsWith("INE115A"))))
      .map((e) => e.key).filter((k, i, a) => a.indexOf(k) === i).join(",") === key
    : false;
  ok("a book SHARE of an issuer takes every instrument of it the funds filed", licPaper(asShare, "synthetic-lic-share"));
  ok("...and a book WARRANT of it takes none of them",
    !!asWarrant && ![...asWarrant.byKey.keys()].includes("synthetic-lic-warrant")
      && licPaper(asWarrant, lic.key));
}

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
const unfenced = await loadStockExposure(vehicles, isinToBookKey, undefined, bookCompanyKeys);
ok("...and dropping the fence really would put it back",
  unfenced.status === "ok" && [...unfenced.byKey.values()].some((e) => /polycab/i.test(e.name)),
  "so the guard above is exercised, not merely present");

console.log("\n── the fenced line is a term of its own, never 'unaccounted' (PC-11) ──");
/**
 * A FUND THE FAMILY HOLDS DISCLOSES THE RING-FENCED COMPANY, and the fence keeps
 * that line out of every row — correctly. It is still a LINE of the filing, so
 * it is not part of what "no line accounts for" means (a scheme's own cash, a
 * metal ETF's metal, rounding), which is where it used to sit. Re-derived here
 * off the committed store and `BOOK_POLYCAB`, on the loader's own rules — a
 * positive weight, the same ISIN once per fund — and never read back off the
 * loader.
 */
const storeIndex = JSON.parse(readFileSync(path.join(STORE, "index.json"), "utf8")) as {
  schemes?: Record<string, { schemecode: string }>;
};
let fencedWant = 0, fencedLines = 0;
for (const v of vehicles) {
  const m = storeIndex.schemes?.[v.securityKey];
  if (!m) continue;
  let pf: { holdings?: { isin?: string | null; name: string; pctAum: number }[] } | null = null;
  try { pf = JSON.parse(readFileSync(path.join(STORE, `${m.schemecode}.json`), "utf8")); } catch { pf = null; }
  const seen = new Set<string>();
  for (const h of pf?.holdings ?? []) {
    if (!(h.pctAum > 0)) continue;
    const isin = (h.isin ?? "").trim().toUpperCase() || null;
    const key = securityKeyOf(h.name);
    if (!(isin && ringFenced.isins.has(isin)) && !ringFenced.keys.has(key)) continue;
    const on = isin ?? `name:${key}`;
    const value = (v.marketValue * h.pctAum) / 100;
    if (!(value > 0) || seen.has(on)) continue;
    seen.add(on); fencedWant += value; fencedLines += 1;
  }
}
ok("this book's funds disclose the ring-fenced company, so the term has a subject",
  fencedLines > 0 && fencedWant > 0, `${fencedLines} line(s), ₹${fencedWant.toFixed(2)}`);
near("the fenced line is counted as its own term, to the rupee", ex.fencedValue, fencedWant, 1);
ok("...and it is in exactly one bucket: taken out of the partition, the partition breaks",
  Math.abs(buckets - ex.fencedValue - BOOK_NAV) > 1,
  "so the term is load-bearing rather than a zero added for show");
ok("...and no row of the index carries it",
  ![...ex.byKey.values()].some((e) => e.rows.some((r) => r.instruments.some((i) => ringFenced.isins.has((i.isin ?? "").trim().toUpperCase())))));

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

console.log("\n── the listing supplies the ISIN a mandate's statement does not print ──");
/**
 * A PMS statement prints no ISIN, so a company held only through a mandate —
 * Jammu & Kashmir Bank, LIC, Great Eastern Shipping — joined to no fund's line
 * and stood twice. The listing's ISIN is read off the two committed maps the
 * quote feed already prices by. Re-derived here from those maps directly, not
 * from `bookIsinBridge`'s own output, so the two can disagree.
 */
const SYM = NSE_SYMBOLS as Record<string, string>;
let listed = 0;
const listingWrong: string[] = [];
for (const k of bookCompanyKeys) {
  const inst = SYM[k] ? UPSTOX_INSTRUMENTS[SYM[k]] : undefined;
  if (!inst || !inst.key.startsWith("NSE_EQ|")) continue;
  const isin = inst.key.slice(7).toUpperCase();
  const owner = isinToBookKey.get(isin);
  if (owner === k) listed++;
  else listingWrong.push(`${k} → ${isin} is ${owner ?? "unmapped"}`);
}
ok("every book company whose symbol has a listing is reachable by that listing's ISIN",
  listingWrong.length === 0, listingWrong.length ? listingWrong.slice(0, 3).join("; ") : `${listed} companies`);
ok("...the listing ISIN is where most of them come from — no statement printed it",
  bridge.fromListing > 0, `${bridge.fromListing} from the listing, ${isinToBookKey.size - bridge.fromListing} from the statements`);
eq("...and no listing ISIN was refused for belonging to another book key", bridge.refused, []);

console.log("\n── one company, one row, however its paper is named ──");
/**
 * THE FAMILY'S OWN COMPLAINT, struck on the whole index: no row a fund reaches
 * may stand apart from a company the BOOK holds when either identifier or name
 * says they are one. Two witnesses, neither implying the other: the issuer
 * prefix of an ISIN the book carries, and the issuer NAME the filings give.
 */
const bookPrefixes = new Map<string, Set<string>>();
for (const [isin, k] of isinToBookKey) {
  if (!isin.startsWith("INE")) continue;
  (bookPrefixes.get(issuerOf(isin)) ?? bookPrefixes.set(issuerOf(isin), new Set()).get(issuerOf(isin))!).add(k);
}
const apart: string[] = [];
for (const e of ex.byKey.values()) {
  if (bookCompanyKeys.has(e.key)) continue;
  const byName = issuerKeyOf(e.name);
  if (bookCompanyKeys.has(byName)) apart.push(`${e.name} [${e.key}] is named as book ${byName}`);
  for (const r of e.rows) for (const i of r.instruments) {
    const owners = i.isin ? bookPrefixes.get(issuerOf(i.isin)) : undefined;
    if (owners?.size === 1) apart.push(`${i.name} [${e.key}] is issued by book ${[...owners][0]}`);
  }
}
ok("no fund row stands apart from a company the book holds", apart.length === 0,
  apart.length ? apart.slice(0, 3).join("; ") : `${[...ex.byKey.keys()].filter((k) => bookCompanyKeys.has(k)).length} book companies carry a fund row`);
/**
 * An issuer the family reaches ONLY through its debt, and holds as a share.
 * Karur Vysya's certificates of deposit are `INE036D16…` and the book's share
 * `INE036D01028`; no fund here files the share, so those CDs were a row of their
 * own under a maturity date.
 *
 * THIS IS NOT THE ISSUER SEED'S TEST, and it cannot be. Karur Vysya and Punjab
 * National Bank are reached by the seed AND by their NAME, now that
 * `issuerNameOf` takes the maturity off and `KEY_ALIASES` gives the book the
 * full name's key — so with the seed switched off this stays green on them.
 * The one issuer on this book only the seed can reach is City Union: held under
 * the depository's clipped `CITY UNION -EQ RE1/`, its CDs filed as `City Union
 * Bank Ltd.`. Switched off, that is caught by the check above — its CDs are
 * issued by a book company and stand apart from it — and, independently of this
 * store, by the constructed case in `securityNames.test.ts`, section 5.
 */
const debtOnlyBook = [...ex.byKey.values()].filter((e) => bookCompanyKeys.has(e.key)
  && e.rows.every((r) => r.instruments.every((i) => !!i.isin && !isinToBookKey.has(i.isin))));
ok("the book's own issuer carries a company whose funds hold only its paper", debtOnlyBook.length > 0,
  debtOnlyBook.slice(0, 3).map((e) => `${e.key} (${e.classes.join("/")})`).join(", "));
/**
 * A ROW IS NAMED BY ITS ISSUER, NEVER BY ONE OF ITS INSTRUMENTS. A coupon, a
 * bracketed maturity, a `MAT` code or a filer's footnote mark on a row's name
 * is the instrument talking — and it is what made one company two options.
 */
const instrumenty = [...ex.byKey.values()].filter((e) =>
  /\d%|\(\d{1,2}\/\d{1,2}\/\d{2,4}\)|\bMAT\s*\d{6}|[*#^$@~]\s*$/i.test(e.name));
ok("no row is named by an instrument", instrumenty.length === 0,
  instrumenty.length ? instrumenty.slice(0, 3).map((e) => e.name).join("; ") : `${ex.byKey.size} rows`);
/**
 * AND EVERY ROW'S NAME IS WRITTEN AS A NAME. 142 of the store's lines are
 * printed entirely in capitals and a handful carry a filer's lowercase slip
 * (`Himachal pradesh`, `SBI funds Management ltd.`); none may reach a row. A
 * brand that opens small and capitalises inside its first word (`eClerx`) is
 * the one exception, and it is the filer's spelling rather than a slip.
 */
const allNames = [...ex.byKey.values()].map((e) => e.name)
  .concat(rowsAll.flatMap((r) => r.instruments.map((i) => i.name)));
// SHOUTING IS TWO WORDS OR MORE IN CAPITALS. A single word in capitals is an
// acronym BY CONSTRUCTION — `displaySecurity` title-cases any capitalised word
// it does not list as one — and `NABARD` is what that institution is called.
const shouting = (n: string) => !/[a-z]/.test(n) && (n.match(/\b[A-Z]{2,}\b/g)?.length ?? 0) >= 2;
const shoutedNames = allNames.filter(shouting);
ok("no row or instrument name is printed all in capitals", shoutedNames.length === 0, shoutedNames.slice(0, 3).join("; "));
const smallNames = allNames.filter((n) => /^[a-z]/.test(n) && !/^[a-z]+[A-Z]/.test(n));
ok("...none opens in lower case", smallNames.length === 0, smallNames.slice(0, 3).join("; "));
const LOWER_OK = new Set(["of", "and", "the", "or", "for", "in", "on", "at", "to", "by", "with", "under"]);
const slips = allNames.filter((n) => n.split(/\s+/).slice(1).some((t) => /^[a-z]+[.,)]*$/.test(t) && !LOWER_OK.has(t.replace(/[^a-z]/g, ""))));
ok("...and none carries a word the filer forgot to capitalise", slips.length === 0, slips.slice(0, 3).join("; "));
ok("...while the instruments under a row keep what names them",
  rowsAll.some((r) => r.instruments.some((i) => /\d%|\d{1,2}\/\d{1,2}\/\d{2,4}|\bMat\b/i.test(i.name))),
  "a coupon and a maturity ARE the instrument's name");
ok("...and no instrument carries a footnote mark whose legend this store does not hold",
  rowsAll.every((r) => r.instruments.every((i) => !/[*#^$@~]\s*$/.test(i.name))));
/**
 * GOVERNMENT PAPER IS ONE ISSUER. 177 lines and not one ISIN, so nothing but
 * the name can group them — `GOI`, `Government of India` and every treasury
 * bill are the Government of India by definition, and the row says so in the
 * words another filing printed.
 */
const goi = ex.byKey.get("government-of-india");
ok("the Government of India is one row", !!goi,
  goi ? `${goi.rows.length} funds, ${goi.rows.reduce((a, r) => a + r.instruments.length, 0)} instruments` : "missing");
ok("...named as its filings name it", goi?.name === "Government of India", goi?.name ?? "");
const strayGov = [...ex.byKey.values()].filter((e) => e.key !== "government-of-india"
  && e.rows.some((r) => r.instruments.some((i) => /\b(?:GOI|T-?\s?BILLS?|TBILLS?|TREASURY\s+BILLS?)\b|^Government of India\b/i.test(i.name))));
ok("...and no GOI line or treasury bill stands anywhere else", strayGov.length === 0,
  strayGov.map((e) => e.key).join(", "));
ok("`Government Securities` stays its own row — it does not say which government",
  !goi?.rows.some((r) => r.instruments.some((i) => /^Government Securities$/i.test(i.name))));
/**
 * A COMPANY WITH TWO ISSUER CODES IS JOINED ONLY WHERE THE FILINGS NAME IT ONE.
 * Every key spanning more than one prefix must be one the filings' own issuer
 * names state — `Aditya Birla Capital` for Aditya Birla Finance's legacy NCDs.
 */
const multiPrefix = [...ex.byKey.values()].filter((e) =>
  new Set(e.rows.flatMap((r) => r.instruments.filter((i) => i.isin).map((i) => issuerOf(i.isin!)))).size > 1);
const unsupported = multiPrefix.filter((e) => !e.rows.every((r) => r.instruments.every((i) =>
  (i.isin && isinToBookKey.get(i.isin) === e.key) || issuerKeyOf(i.name) === e.key
  || (i.isin && bookPrefixes.get(issuerOf(i.isin))?.has(e.key)))));
ok("every key spanning two issuer codes is one company by its filings' own names",
  unsupported.length === 0,
  `${multiPrefix.map((e) => e.key).join(", ")}${unsupported.length ? ` — unsupported: ${unsupported.map((e) => e.key).join(", ")}` : ""}`);
/**
 * AND THE LISTING TIER IS DOING WORK. Built from the statements' ISINs alone,
 * the same store must split at least one company the book holds into a book row
 * and a fund row — or this section passes on a book with nothing to bridge.
 */
const statementOnly = new Map<string, string>();
// Every ISIN a STATEMENT printed — valued rows and recorded lines alike — so
// the only tier missing is the listing's.
for (const p of companies) { const i = (p.isin ?? "").trim().toUpperCase(); if (i && !statementOnly.has(i)) statementOnly.set(i, p.securityKey); }
const bare = await loadStockExposure(vehicles, statementOnly, ringFenced, bookCompanyKeys);
const lostWithout = bare.status === "ok"
  ? [...ex.byKey.keys()].filter((k) => bookCompanyKeys.has(k) && !bare.byKey.has(k)) : [];
ok("...without the listing's ISIN, companies the book holds lose their fund rows", lostWithout.length > 0,
  `${lostWithout.length}, e.g. ${lostWithout.slice(0, 4).join(", ")}`);
/**
 * THE NAME A READER SEES FOR A BOOK COMPANY IS THE BOOK'S. `securityLabel` is
 * what every page renders; the index's own name for that key is a fund's.
 */
ok("a company held in the book carries one label on every surface",
  [...bookCompanyKeys].every((k) => securityLabel(k, "x") === securityLabel(k, "y")));
console.log(`     row names are issuer names: e.g. ${[...ex.byKey.values()].slice(0, 3).map((e) => issuerNameOf(e.name)).join("; ")}`);

console.log("\n── what it cannot see is counted, not claimed ──");
const aif = ex.skipped.filter((s) => /^an AIF files/.test(s.reason));
ok("the AIF block is skipped with a reason about the INSTRUMENT", aif.length > 0,
  `${aif.length} folios, ${CR(sum(aif.map((s) => s.marketValue)))}`);
ok("...and that reason says no future statement fills it",
  aif.every((s) => /joins to a folio this family holds/.test(s.reason)));
ok("every skipped vehicle carries its own value, so a caller can state the size",
  ex.skipped.every((s) => Number.isFinite(s.marketValue)));
// WAS "non-equity", AND THE STORE OUTGREW THE NAME. It reads each AMC's whole
// monthly filing now — shares, bonds, NCDs and commercial paper — so a scheme's
// debt sleeve is INSIDE the derived total and this remainder is what no line in
// the filing accounted for: its cash, a metal ETF's metal, a line carrying
// neither an ISIN nor a usable name, and the disclosure's own rounding.
near("what no disclosed line accounted for is exactly the disclosed value the rows do not reach",
  ex.unaccountedValue, ex.disclosedValue - ex.total - ex.fencedValue, 0.01);

process.exit(fails ? 1 : 0);
