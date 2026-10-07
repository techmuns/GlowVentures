// THE HDFC BANK NATIVE DEMAT EXPORT — `HDFC Bank Depository Holding Details`.
// Run: node scripts/ingest/__tests__/hdfcNative.test.mjs
//
// The October 2026 delivery carries Ajay's own HDFC Bank DP account 10295743
// as a REAL text PDF — not a scan and not outlined glyphs — in an export whose
// columns differ from the two trusts' statements: Account Type | ISIN |
// Company Name | Scrip Type | Balance | Rate (Rs.) | Value (Rs.) | Status.
// `hdfcNsdl.mjs` reads it on its own path (`readNative`).
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// The reader publishes a figure only where the statement's own arithmetic
// witnesses it, so most cases below BREAK one thing about the statement and
// assert the reader refuses the whole document and says which thing broke:
//
//   • the header is found by its words, or nothing is read;
//   • a figure belongs to the column whose right edge it shares, or nothing is
//     read;
//   • every row's balance × rate is its printed value, and the rows add to the
//     printed `Total Valuation` to the paisa;
//   • an ISIN printed anywhere the table does not reach is a refusal, never a
//     silently dropped holding.
//
// The fixture is a SYNTHETIC statement built from the real page's own item
// geometry (x, width, text — measured off the committed PDF), so the cases
// exercise the layout the reader will actually meet. The last section then
// reads the REAL committed PDF end to end and requires it to produce exactly
// what the fixture produces — which is what says the fixture is the statement
// and not an invention that happens to agree with the reader.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { extract, NATIVE_TITLE, PROVIDER } from "../providers/hdfcNsdl.mjs";
import { extractLayout } from "../lib/layout.mjs";
import { classify } from "../lib/classify.mjs";
import { deriveHolding } from "../lib/document.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REAL_FILE = "Demat Holding Query Stmt_5743_06-10-2026 11.31.PDF";
const REAL_PATH = path.join(ROOT, "source/october-2026", REAL_FILE);
/** The bytes the client sent, from the delivery's own ZIP. */
const REAL_SHA256 = "2bd1aec43c2ab00f08a67e68fcf251d5be158c2bb7ed5178d37e282146cdc918";
/**
 * THE DELIVERY IS NOT IN THE REPOSITORY, SO SECTION 6 IS SKIPPED RATHER THAN
 * FAILED — AND NEVER PASSED.
 *
 * `source/october-2026/` holds the family's own bank and demat statements, and
 * the family asked for it to stay out of the tree. So on this tree, and in CI,
 * there are no bytes to read. Three ways of handling that, and only one of them
 * is honest:
 *
 *   • read unconditionally — the suite dies on ENOENT, and a tree with nothing
 *     wrong with it reports a failing reader;
 *   • assert the file exists — the same failure wearing a check's name, so every
 *     run reports FAIL for a file nobody lost;
 *   • read where it is there and SKIP where it is not, saying so and saying what
 *     the skip costs. That is this.
 *
 * What it costs is stated rather than glossed: sections 1-5 run on the SYNTHETIC
 * fixture, so without section 6 nothing on this tree checks that the fixture is
 * the real statement rather than an invention the reader happens to agree with.
 * That claim was measured where the bytes were present, and the sha256 above is
 * what makes the measurement repeatable: wherever the file IS there, the
 * identity check is a HARD assertion, so the suite can never read a different
 * document and report the fixture verified against it.
 */
const REAL_BYTES = fs.existsSync(REAL_PATH) ? fs.readFileSync(REAL_PATH) : null;

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("hdfcNative");

// ── THE FIXTURE ─────────────────────────────────────────────────────────────
const it = (x, width, text) => ({ x, width, height: 7, text });
const row = (y, ...items) => ({ y, items: items.map((i) => ({ ...i, y })) });

/** The statement as the reader receives it from a native text layer. */
function statement() {
  const page0 = [
    row(546.8, it(36.6, 222.7, "HDFC Bank Depository Holding Details")),
    row(519.6, it(37.0, 176.2, "Holding Statement as on : 05/10/2026"), it(657.9, 117.5, "Business Date : 06/10/2026")),
    row(488.8, it(36.4, 78.9, "DP ID : IN300476"), it(163.2, 128.9, "DP Account No : 10295743")),
    row(459.4, it(36.4, 99.5, "AJAY T JAISINGHANI")),
    row(437.0, it(36.4, 40.0, "MUMBAI")),
    row(374.0,
      it(44.0, 63.9, "Account Type"), it(151.8, 19.4, "ISIN"), it(245.9, 72.2, "Company Name"),
      it(388.0, 47.8, "Scrip Type"), it(497.1, 36.1, "Balance"), it(562.4, 45.6, "Rate (Rs.)"),
      it(642.4, 50.0, "Value (Rs.)"), it(727.8, 28.3, "Status")),
    row(358.0, it(30.4, 53.5, "Free Balance"), it(125.5, 61.0, "INE501A01019"), it(201.6, 118.5, "DEEPAK FERTILISERS AND"),
      it(366.3, 13.0, "EQ"), it(488.1, 45.0, "10,930.000"), it(572.9, 35.0, "1,319.70"), it(634.9, 57.5, "14,424,321.00"),
      it(732.7, 18.5, "Free")),
    row(348.0, it(201.6, 153.0, "PETROCHEMICALS CORPORATION")),
    row(338.0, it(201.6, 17.0, "LTD")),
    row(323.9, it(125.5, 61.5, "INE473D01015"), it(201.6, 150.0, "KINGFA SCIENCE & TECHNOLOGY"), it(366.3, 13.0, "EQ"),
      it(493.2, 40.0, "1,808.000"), it(572.9, 35.0, "6,934.80"), it(634.9, 57.5, "12,538,118.40"), it(732.7, 18.5, "Free")),
    row(313.9, it(201.6, 68.0, "(INDIA) LIMITED")),
    row(300.0, it(125.5, 61.0, "INE993A01026"), it(201.6, 147.5, "MAN INDUSTRIES (INDIA) LIMITED"),
      it(366.3, 67.0, "EQ NEW.RS. 5/-"), it(483.2, 50.0, "480,000.000"), it(580.4, 27.5, "918.35"),
      it(629.8, 62.5, "440,808,000.00"), it(732.7, 18.5, "Free")),
    row(282.9, it(125.5, 63.5, "INE00VM01036"), it(201.6, 148.0, "MANORAMA INDUSTRIES LIMITED"),
      it(366.3, 78.5, "EQ NEW FV RS 2/-"), it(493.2, 40.0, "4,000.000"), it(572.9, 35.0, "1,982.60"),
      it(639.8, 52.5, "7,930,400.00"), it(732.7, 18.5, "Free")),
    row(265.9, it(125.5, 61.0, "INE110V01015"), it(201.6, 128.0, "STERLITE ELECTRIC LIMITED"), it(366.3, 13.0, "EQ"),
      it(493.2, 40.0, "1,140.000"), it(590.5, 17.5, "2.00"), it(657.3, 35.0, "2,280.00"), it(732.7, 18.5, "Free")),
    row(248.9, it(125.5, 62.5, "INE03QT01027"), it(201.6, 113.5, "STERLITE GRID 5 LIMITED"),
      it(366.3, 78.5, "EQ NEW FV RS 2/-"), it(493.2, 40.0, "1,140.000"), it(590.5, 17.5, "2.00"),
      it(657.3, 35.0, "2,280.00"), it(732.7, 18.5, "Free")),
    row(231.9, it(125.5, 61.5, "INE089C01029"), it(201.6, 155.0, "STERLITE TECHNOLOGIES LIMITED"),
      it(366.3, 86.9, "EQ NEW F.V. RS.2''/-"), it(493.2, 40.0, "1,850.000"), it(572.9, 35.0, "1,049.55"),
      it(639.8, 52.5, "1,941,667.50"), it(732.7, 18.5, "Free")),
    row(214.9, it(125.5, 63.0, "INE1VXE01018"), it(201.6, 109.0, "STL NETWORKS LIMITED"), it(366.3, 13.0, "EQ"),
      it(493.2, 40.0, "1,850.000"), it(585.4, 22.5, "47.12"), it(652.4, 40.0, "87,172.00"), it(732.7, 18.5, "Free")),
    row(197.9, it(125.5, 63.5, "INE1CDF01017"), it(201.6, 128.0, "VEDANTA ALUMINIUM METAL"), it(366.3, 13.0, "EQ"),
      it(483.2, 50.0, "177,000.000"), it(580.4, 27.5, "401.05"), it(634.9, 57.5, "70,985,850.00"), it(732.7, 18.5, "Free")),
    row(187.9, it(201.6, 35.5, "LIMITED")),
    row(173.9, it(125.5, 61.0, "INE205A01025"), it(201.6, 80.5, "VEDANTA LIMITED"), it(366.3, 71.4, "EQ NEW RS.1''''/-"),
      it(483.2, 50.0, "110,000.000"), it(580.4, 27.5, "263.85"), it(634.9, 57.5, "29,023,500.00"), it(732.7, 18.5, "Free")),
    row(153.3, it(32.2, 210.1, "Market Rate Date/Time : 06/10/2026 / 11:13:00"), it(492.1, 75.0, "Total Valuation :"),
      it(622.9, 69.5, "577,743,588.90")),
    row(126.9, it(36.4, 90.0, "Nomination Details")),
    row(107.6, it(36.4, 70.0, "Registered : Yes")),
    row(44.6, it(36.4, 55.0, "Page Number"), it(700.0, 20.0, "1 of 2")),
  ];
  // Page two reprints the title and the account and carries no table: a page
  // with no header must be skipped, and must contribute no ISIN.
  const page1 = [
    row(546.8, it(36.6, 222.7, "HDFC Bank Depository Holding Details")),
    row(519.6, it(37.0, 176.2, "Holding Statement as on : 05/10/2026"), it(657.9, 117.5, "Business Date : 06/10/2026")),
    row(488.8, it(36.4, 78.9, "DP ID : IN300476"), it(163.2, 128.9, "DP Account No : 10295743")),
    row(466.8, it(36.4, 95.0, "Authorised Signatory")),
    row(408.2, it(36.4, 85.0, "HDFC Bank Limited")),
    row(44.6, it(36.4, 55.0, "Page Number"), it(700.0, 20.0, "2 of 2")),
  ];
  return { pages: [{ rows: page0 }, { rows: page1 }] };
}

/** Cells are what the header regexes read; rebuilt from the items after any edit. */
function withCells(grid) {
  for (const p of grid.pages) for (const r of p.rows) r.cells = r.items.map((i) => ({ text: i.text }));
  return grid;
}
const run = (grid, meta = { docKey: "test-doc" }) => extract({ grid: withCells(grid), meta });

/** The row on page 0 holding an item with this exact text. */
function rowWith(grid, text) {
  for (const r of grid.pages[0].rows) if (r.items.some((i) => i.text === text)) return r;
  throw new Error(`fixture has no item "${text}"`);
}
const itemOf = (grid, text) => rowWith(grid, text).items.find((i) => i.text === text);
/** Insert a row on page 0 directly after the row carrying `afterText`. */
function insertAfter(grid, afterText, newRow) {
  const rows = grid.pages[0].rows;
  rows.splice(rows.indexOf(rowWith(grid, afterText)) + 1, 0, newRow);
}
const codes = (d) => (d.warnings ?? []).map((w) => w.code);
const warning = (d, code) => (d.warnings ?? []).find((w) => w.code === code) ?? null;
const holding = (d, isin) => (d.holdings ?? []).find((h) => h.isin === isin) ?? null;
const near = (a, b, tol = 0.005) => typeof a === "number" && Math.abs(a - b) <= tol;

// ── 1. THE STATEMENT READS, AND EVERY FIGURE IS THE ONE IT PRINTS ───────────
const base = run(statement());
ok("the native statement reads", base.status === "ok", `status ${base.status} · ${codes(base).join(", ")}`);
ok("its account is the one the page prints", base.accountNo === "10295743", `got ${base.accountNo}`);
ok("its holder is the one the page prints, verbatim", base.owner === "AJAY T JAISINGHANI", `got ${base.owner}`);
ok("its as-of is the balances' date, not the rates'", base.asOf === "2026-10-05", `got ${base.asOf}`);
ok("it is a direct depository account", base.engagement === "Direct");
ok("the engagement names the DP and the balance type",
  base.providerEngagement === "NSDL depository account at IN300476 — Free Balance", `got ${base.providerEngagement}`);
ok("all ten holdings are read, one per ISIN", base.holdings?.length === 10, `got ${base.holdings?.length}`);

const EXPECT = [
  ["INE501A01019", "DEEPAK FERTILISERS AND PETROCHEMICALS CORPORATION LTD", 10930, 1319.7, 14424321.0],
  ["INE473D01015", "KINGFA SCIENCE & TECHNOLOGY (INDIA) LIMITED", 1808, 6934.8, 12538118.4],
  ["INE993A01026", "MAN INDUSTRIES (INDIA) LIMITED", 480000, 918.35, 440808000.0],
  ["INE00VM01036", "MANORAMA INDUSTRIES LIMITED", 4000, 1982.6, 7930400.0],
  ["INE089C01029", "STERLITE TECHNOLOGIES LIMITED", 1850, 1049.55, 1941667.5],
  ["INE1VXE01018", "STL NETWORKS LIMITED", 1850, 47.12, 87172.0],
  ["INE1CDF01017", "VEDANTA ALUMINIUM METAL LIMITED", 177000, 401.05, 70985850.0],
  ["INE205A01025", "VEDANTA LIMITED", 110000, 263.85, 29023500.0],
];
for (const [isin, name, qty, rate, value] of EXPECT) {
  const h = holding(base, isin);
  ok(`${isin} is read`, !!h);
  if (!h) continue;
  // A WRAPPED NAME is one company: every continuation line joins the ISIN line
  // above it, and the depository's scrip-type furniture (`EQ NEW.RS. 5/-`,
  // `EQ NEW F.V. RS.2''/-`) is not part of the company's name.
  ok(`${isin} is named for its company`, h.security === name, `got ${JSON.stringify(h.security)}`);
  ok(`${isin} carries the printed balance`, h.quantity === qty, `got ${h.quantity}`);
  ok(`${isin} carries the printed rate as its price`, h.marketPrice === rate, `got ${h.marketPrice}`);
  // VALUE IS DERIVED; THE PRINTED VALUE IS THE CHECK (§4b). The reader emits
  // primitives only, and the pipeline derives (`deriveDocument` in extract.mjs),
  // so the value is struck here through the same `deriveHolding`.
  const v = deriveHolding(h);
  ok(`${isin}'s value is balance × rate`, near(v.marketValue, qty * rate), `got ${v.marketValue}`);
  ok(`${isin}'s value is computed, not copied`, v.marketValueFromPrinted === false, `got ${v.marketValueFromPrinted}`);
  ok(`${isin} keeps the printed value as its check`, h.printed?.marketValue === value, `got ${h.printed?.marketValue}`);
  ok(`${isin} is ordinary equity`, h.assetClass === "Equity", `got ${h.assetClass}`);
  ok(`${isin} is priced on the rate's own date`, h.priceAsOn === "2026-10-06", `got ${h.priceAsOn}`);
  ok(`${isin} names its document`, h.source === "test-doc", `got ${h.source}`);
}

// A RATE THAT IS EXACTLY A FACE VALUE IS NOT A MARK. Both Sterlite demerger
// lines are carried as quantities with no value — one because its scrip type
// DECLARES ₹2 face, the other because ₹2.00 is a whole-rupee denomination.
for (const [isin, tier] of [["INE03QT01027", "declared"], ["INE110V01015", "par"]]) {
  const h = holding(base, isin);
  ok(`${isin} is read`, !!h);
  if (!h) continue;
  ok(`${isin} carries its units`, h.quantity === 1140, `got ${h.quantity}`);
  ok(`${isin} carries no price`, h.marketPrice == null, `got ${h.marketPrice}`);
  // …and derivation must not adopt a printed figure either: a face-valued row
  // carries no printed value for `deriveHolding` to copy.
  ok(`${isin} carries no value`, deriveHolding(h).marketValue == null, `got ${deriveHolding(h).marketValue}`);
  ok(`${isin} carries no printed value to adopt`, h.printed?.marketValue == null, `got ${h.printed?.marketValue}`);
  ok(`${isin} records the face value it was printed at`, h.faceValue === 2, `got ${h.faceValue}`);
  const w = warning(base, `value-is-face-value-${tier}`);
  ok(`${isin} is named under value-is-face-value-${tier}`, !!w && w.detail.includes("STERLITE"), w?.detail ?? "no warning");
}

// THE TOTAL CARRIED IS THE PRICED ROWS'; the printed Total Valuation (which
// includes the two ₹2,280 face-valued lines) is the witness the reader checked.
ok("the totals are what is carried",
  near(base.totals?.totalMarketValue, 577739028.9, 0.001), `got ${base.totals?.totalMarketValue}`);
ok("the totals count every holding", base.totals?.positionCount === 10, `got ${base.totals?.positionCount}`);
ok("the totals name their document", base.totals?.source === "test-doc", `got ${base.totals?.source}`);

// THE RATES ARE STRUCK ON A DIFFERENT DAY FROM THE BALANCES, and the reader says so.
const dated = warning(base, "price-date-follows-holding-date");
ok("the rate date following the balance date is named",
  !!dated && dated.detail.includes("2026-10-05") && dated.detail.includes("2026-10-06") && dated.detail.includes("11:13"),
  dated?.detail ?? "no warning");
// …and a native page never claims it was recovered by rendering.
ok("a native page carries no rendering warning", !codes(base).includes("text-recovered-by-rendering"));
ok("a clean statement raises no refusal and no surprise",
  codes(base).every((c) => ["price-date-follows-holding-date", "value-is-face-value-declared", "value-is-face-value-par"].includes(c)),
  codes(base).join(", "));

// ── 2. THE PATH IS CHOSEN ON THE TITLE AND ON THE TEXT BEING NATIVE ─────────
{
  const g = statement();
  g.textSource = "ocr";
  const d = run(g);
  // The OCR path requires `Total Valuation (Rs.)`, which this export does not
  // print, so it refuses — and says the text was recovered by rendering, which
  // only the OCR path ever says.
  ok("a grid recovered by rendering is never read as the native export",
    d.status !== "ok" && (d.warnings ?? []).some((w) => /recovered by rendering/.test(w.detail)), codes(d).join(", "));
}
{
  const g = statement();
  for (const p of g.pages) for (const r of p.rows) for (const i of r.items) {
    if (i.text === "HDFC Bank Depository Holding Details") i.text = "HDFC Bank Holding Details";
  }
  const d = run(g);
  ok("without its title the native reader is not chosen",
    !codes(d).includes("price-date-follows-holding-date") && d.status !== "ok", `${d.status} · ${codes(d).join(", ")}`);
  ok("the title constant is what decides", !NATIVE_TITLE.test("HDFC Bank Holding Details") && NATIVE_TITLE.test("HDFC Bank Depository Holding Details"));
}

// ── 3. EVERY BROKEN THING REFUSES THE WHOLE DOCUMENT, BY NAME ───────────────
function refuses(label, mutate, code) {
  const g = statement();
  mutate(g);
  const d = run(g);
  ok(`${label} → refused`, d.status === "failed", `status ${d.status}`);
  ok(`${label} → names ${code}`, codes(d).includes(code), codes(d).join(", "));
  ok(`${label} → emits no holding`, (d.holdings ?? []).length === 0, `${d.holdings?.length} holdings`);
}

refuses("a header label that does not match", (g) => { itemOf(g, "Rate (Rs.)").text = "Price"; }, "header-not-matched");

refuses("a printed total one rupee away from the rows",
  (g) => { itemOf(g, "577,743,588.90").text = "577,743,589.90"; }, "rows-do-not-sum-to-printed-total");

refuses("no printed total at all",
  (g) => { const r = rowWith(g, "Total Valuation :"); r.items = r.items.filter((i) => i.text !== "577,743,588.90" && i.text !== "Total Valuation :"); },
  "no-printed-total");

// The row's own arithmetic is checked BEFORE the column sum, and the total is
// moved with the row here, so only the per-row check can catch it.
refuses("a row whose value is not balance × rate (the total moved with it)",
  (g) => { itemOf(g, "14,424,321.00").text = "14,424,421.00"; itemOf(g, "577,743,588.90").text = "577,743,688.90"; },
  "row-value-is-not-balance-times-rate");

refuses("a figure whose right edge sits under no heading",
  (g) => { itemOf(g, "6,934.80").x += 20; }, "figure-not-under-a-column");

refuses("a figure on a line carrying no ISIN",
  (g) => { rowWith(g, "PETROCHEMICALS CORPORATION").items.push(it(680.4, 12.0, "1.00")); }, "figure-without-isin");

refuses("two figures in one column on one line",
  (g) => { rowWith(g, "INE501A01019").items.push(it(680.4, 12.0, "1.00")); }, "two-figures-in-one-column");

refuses("a word inside the money columns",
  (g) => { rowWith(g, "PETROCHEMICALS CORPORATION").items.push(it(575.0, 30.0, "Pledged")); }, "text-in-a-figure-column");

refuses("a word between the header and the first ISIN",
  (g) => { insertAfter(g, "Status", row(366.0, it(201.6, 40.0, "NOTE"))); }, "text-before-first-holding");

refuses("an ISIN printed below the table's end",
  (g) => { rowWith(g, "Nomination Details").items.push(it(125.5, 61.0, "INE123A01012")); }, "isin-outside-the-table");

refuses("two ISINs on one line",
  (g) => { rowWith(g, "INE501A01019").items.push(it(160.0, 30.0, "INE999A01011")); },
  "two-isins-on-one-line");

refuses("a row missing its balance",
  (g) => { const r = rowWith(g, "INE473D01015"); r.items = r.items.filter((i) => i.text !== "1,808.000"); }, "row-incomplete");

refuses("one ISIN printed twice at two rates",
  (g) => {
    g.pages[0].rows.splice(g.pages[0].rows.indexOf(rowWith(g, "Market Rate Date/Time : 06/10/2026 / 11:13:00")), 0,
      row(160.0, it(125.5, 61.0, "INE993A01026"), it(201.6, 147.5, "MAN INDUSTRIES (INDIA) LIMITED"),
        it(366.3, 67.0, "EQ NEW.RS. 5/-"), it(493.2, 40.0, "1,000.000"), it(580.4, 27.5, "900.00"),
        it(639.8, 52.5, "900,000.00"), it(732.7, 18.5, "Free")));
    itemOf(g, "577,743,588.90").text = "578,643,588.90";
  },
  "one-isin-two-descriptions");

// ── 4. ONE SECURITY ON TWO BALANCE TYPES IS ONE HOLDING, AND SAYS SO ────────
{
  const g = statement();
  // Placed last, because a printed account type governs every row below it.
  g.pages[0].rows.splice(g.pages[0].rows.indexOf(rowWith(g, "Market Rate Date/Time : 06/10/2026 / 11:13:00")), 0,
    row(163.0, it(30.4, 70.0, "Lock-in Balance"), it(125.5, 61.0, "INE993A01026"), it(201.6, 147.5, "MAN INDUSTRIES (INDIA) LIMITED"),
      it(366.3, 67.0, "EQ NEW.RS. 5/-"), it(488.1, 45.0, "20,000.000"), it(580.4, 27.5, "918.35"),
      it(639.8, 52.5, "18,367,000.00"), it(722.0, 30.0, "Lock-in")));
  itemOf(g, "577,743,588.90").text = "596,110,588.90";
  const d = run(g);
  const man = holding(d, "INE993A01026");
  ok("two balance types still read", d.status === "ok", `${d.status} · ${codes(d).join(", ")}`);
  ok("…as ONE holding of the summed units", (d.holdings ?? []).filter((h) => h.isin === "INE993A01026").length === 1 && man?.quantity === 500000,
    `got ${man?.quantity}`);
  ok("…whose printed value is the two lines' sum", man?.printed?.marketValue === 459175000, `got ${man?.printed?.marketValue}`);
  ok("…and whose value is still units × rate", near(man && deriveHolding(man).marketValue, 500000 * 918.35),
    `got ${man && deriveHolding(man).marketValue}`);
  ok("the summing is named", !!warning(d, "balance-types-summed"), codes(d).join(", "));
  ok("a balance that is not free is named", (warning(d, "balance-not-free")?.detail ?? "").includes("Lock-in"),
    warning(d, "balance-not-free")?.detail ?? "no warning");
  ok("the engagement names both balance types", /Free Balance, Lock-in Balance/.test(d.providerEngagement ?? ""), d.providerEngagement);
}

// ── 5. NO PRICE DATE IS NAMED, NEVER BORROWED FROM THE BALANCE DATE ─────────
{
  const g = statement();
  itemOf(g, "Market Rate Date/Time : 06/10/2026 / 11:13:00").text = "Market Rate";
  const d = run(g);
  ok("a statement printing no rate date still reads", d.status === "ok", `${d.status} · ${codes(d).join(", ")}`);
  ok("…and says the rates carry no date", codes(d).includes("no-price-date"), codes(d).join(", "));
  ok("…and dates no holding by the balance date", (d.holdings ?? []).every((h) => h.priceAsOn == null),
    (d.holdings ?? []).map((h) => h.priceAsOn).join(","));
}

// ── 6. THE REAL STATEMENT, END TO END ───────────────────────────────────────
if (REAL_BYTES === null) {
  console.log("  (the statement's bytes are not in the committed tree, so the end-to-end");
  console.log("   section is not run · the fixture is checked against the reader above, and");
  console.log("   against the statement itself only where the delivery is present)");
} else {
  // THE BYTES ARE THE DOCUMENT. A suite that read whatever sits at that path
  // could verify the fixture against another statement and report it verified.
  ok("the committed statement is the file the client sent",
    crypto.createHash("sha256").update(REAL_BYTES).digest("hex") === REAL_SHA256);
  const layout = await extractLayout(new Uint8Array(REAL_BYTES));
  ok("it carries a native text layer", !layout.error && layout.textSource !== "ocr", layout.error ?? "");
  const text = layout.pages.map((p) => (p.rows ?? []).map((r) => r.cells.map((c) => c.text).join(" ")).join("\n")).join("\n");
  const c = classify({ fileName: REAL_FILE, text });
  ok("it is classified as this reader's provider", c.provider === PROVIDER, `got ${c.provider}`);
  ok("…under the DP account the page prints", c.accountNo === "10295743", `got ${c.accountNo}`);
  ok("…as a holdings statement", c.reportType === "holdings", `got ${c.reportType}`);
  ok("…dated by its balances", c.asOfDate === "2026-10-05", `got ${c.asOfDate}`);

  const real = extract({ grid: layout, meta: { docKey: "test-doc" } });
  ok("the real statement reads", real.status === "ok", `${real.status} · ${codes(real).join(", ")}`);
  // THE FIXTURE IS THE STATEMENT: what the reader returns for the real PDF is
  // exactly what it returns for the fixture built from its geometry.
  const strip = (d) => JSON.stringify({ holdings: d.holdings, totals: d.totals, owner: d.owner, asOf: d.asOf,
    accountNo: d.accountNo, providerEngagement: d.providerEngagement, codes: codes(d) });
  ok("the real statement reads exactly as the fixture does", strip(real) === strip(base));
  const printedSum = (real.holdings ?? []).reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0);
  ok("its carried rows add to the printed total less the two face-valued lines",
    near(printedSum, 577743588.9 - 2 * 2280, 0.001), `got ${printedSum}`);
}

// ── 7. THE NSE SYMBOL EVERY HOLDING MUST REACH THE LIVE LAYER BY ────────────
//
// This statement PRINTS a rate, so every holding on it carries a value on the
// statement basis the moment the delivery lands. What a symbol buys is the half
// a statement cannot: a live quote, the day's move, the price history and the
// returns table, the ratios and the filings. Every one of those endpoints is
// keyed on the NSE TRADING SYMBOL and takes neither an ISIN nor a name
// (`docs/SECURITY-IDENTIFIERS.md`), so "is this holding fully on the dashboard?"
// reduces to "did a symbol resolve?" — and this table is that question answered
// per holding.
//
// ── WHY A TABLE HERE AND NOT AN `OVERRIDES` ENTRY ───────────────────────────
//
// `build-nse-symbols.mjs` resolves ISIN → exact name → securityKey → override,
// and where both an identifier and a name answer it COMPARES them: a
// disagreement leaves the security unresolved rather than letting either side
// win silently. An `OVERRIDES` entry RETURNS BEFORE that comparison, which is
// why its own comment reserves it for "a name difference the automatic tiers
// cannot bridge" — a renamed listing, or a symbol that contracts the name.
//
// EVERY ROW OF THIS STATEMENT PRINTS ITS ISIN. So the ISIN tier answers for all
// eight listed holdings, and an override would trade the stronger check for the
// weaker one on a book where nothing needs it. The symbols below are therefore
// an EXPECTATION THE RESOLVER MUST MEET, never an input it reads: the resolver
// goes on resolving them from NSE's own master, and this table is what says it
// resolved each one to the company whose shares the family actually holds.
//
// `null` is NOT "we could not find it" — it is the company not being listed at
// all, which is a permanent absence rather than a missing identifier, and the
// identifiers report already words those two apart. Both are corroborated by
// the statement itself: see the face-value check below.
const SYMBOLS = [
  // Verified 2026-10-07 by searching each ISIN, never each name. The first two
  // are corroborated by an identifier already committed to this repository:
  // `shared/upstoxInstruments.mjs` carries VAML → `NSE_EQ|INE1CDF01017` and
  // VEDL → `NSE_EQ|INE205A01025`, the exact ISINs this statement prints.
  ["INE1CDF01017", "vedanta-aluminium-metal", "VAML"],
  ["INE205A01025", "vedanta", "VEDL"],
  ["INE501A01019", "deepak-fertilisers-and-petrochemicals", "DEEPAKFERT"],
  ["INE473D01015", "kingfa-science-and-technology-india", "KINGFA"],
  ["INE993A01026", "man-industries-india", "MANINDS"],
  ["INE00VM01036", "manorama-industries", "MANORAMA"],
  ["INE089C01029", "sterlite-technologies", "STLTECH"],
  // Demerged out of Sterlite Technologies and listed on both exchanges on
  // 31 Mar 2025; it trades as STLNETWORK and operates as Invenia.
  ["INE1VXE01018", "stl-networks", "STLNETWORK"],
  // UNLISTED, so no symbol can exist. Sterlite Electric (formerly Sterlite
  // Power Transmission) has filed a DRHP and has not listed; Sterlite Grid 5 is
  // the transmission platform SPTL's infrastructure business was transferred
  // into. Both trade only on the unlisted market.
  ["INE110V01015", "sterlite-electric", null],
  ["INE03QT01027", "sterlite-grid-5", null],
];

// THE TABLE COVERS THE STATEMENT, ONCE EACH. A holding this statement carries
// and this table does not is one nobody decided about — which is how a future
// delivery's new company goes quietly unpriced, the thing this section exists
// to stop.
{
  const read = (base.holdings ?? []).map((h) => h.isin).sort();
  const listed = SYMBOLS.map(([i]) => i).sort();
  ok("every holding the statement carries is in the symbol table, once each",
    read.length === listed.length && read.every((i, n) => i === listed[n]),
    `statement ${read.join(",")}\n       table     ${listed.join(",")}`);
}

// AND THE STATEMENT ITSELF SAYS WHICH TWO ARE UNLISTED. The reader refuses a
// rate that is exactly a face value, and the two holdings it refuses are the
// two NSE does not list — two independent documents agreeing, which is what
// earns `null` its place over "a symbol we failed to find".
for (const [isin, , symbol] of SYMBOLS) {
  const h = holding(base, isin);
  if (!h) continue;
  const priced = h.marketPrice != null;
  ok(`${isin} is priced by the statement if and only if NSE lists it`,
    priced === (symbol !== null),
    `rate ${h.marketPrice} · symbol ${symbol ?? "none"}`);
}

// WHERE THE RESOLVER HAS ALREADY ANSWERED, IT MUST HAVE ANSWERED THIS. Three of
// the eight are in the book from other accounts, so their symbols are checked
// against the generated map on every tree. The other five arrive with the
// delivery, so they are REPORTED rather than passed: a check with no subject
// must never read as one that held.
{
  const MAP = path.join(ROOT, "src/data/nseSymbols.json");
  const resolved = JSON.parse(fs.readFileSync(MAP, "utf8"));
  const { UPSTOX_INSTRUMENTS } = await import("../../../shared/upstoxInstruments.mjs");
  const awaiting = [];
  for (const [isin, key, symbol] of SYMBOLS) {
    if (symbol === null) {
      ok(`${key} is in neither symbol map, because it is not listed`,
        !(key in resolved) && !(symbol in UPSTOX_INSTRUMENTS));
      continue;
    }
    if (key in resolved) {
      ok(`${key} resolves to ${symbol}`, resolved[key] === symbol, `got ${resolved[key]}`);
    } else awaiting.push(`${key} → ${symbol}`);
    // UPSTOX MUST AGREE ON THE IDENTIFIER, NOT ON THE NAME. Its instrument key
    // IS the ISIN, so where it carries the symbol the two documents are
    // checked against each other rather than one being trusted.
    const inst = UPSTOX_INSTRUMENTS[symbol];
    if (inst) {
      ok(`${symbol} is Upstox's instrument for ${isin}`, inst.key === `NSE_EQ|${isin}`,
        `got ${inst.key}`);
    }
  }
  if (awaiting.length) {
    console.log(`  (${awaiting.length} symbol(s) are not in the generated map yet, because the`);
    console.log("   holdings reach the archive with the delivery and NSE's masters are not");
    console.log("   reachable from every environment · they are NOT counted as checked:");
    for (const a of awaiting) console.log(`     ${a}`);
    console.log("   `npm run build-symbols` resolves each by the ISIN this statement prints)");
  }
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
