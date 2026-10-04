// BUOYANT'S PORTFOLIO SNAP REPORT — the reader, and the checks that license it.
// Run: node scripts/ingest/__tests__/buoyantSnap.test.mjs
//
// The September 2026 delivery carries one snap per folio, dated 31 Aug 2026.
// Page 1 is the account statement's own Account Summary and dated record; page
// 3 restates page 1 in whole rupees — Current Investments per class, an
// Investment Summary since inception — and adds two tables archived AS
// PRINTED: this account's TWRR and the FUND's top holdings. The book takes the
// snap's units and NAV for both folios (precedence: the newer of the appraisal
// and the snap), so a snap read wrong moves ₹78.6 Cr of the book.
//
// The reader publishes the document as ok ONLY where page 3 restates page 1.
// Every mutation below is the committed snap's own text, rebuilt exactly as
// `extract()` joins it, with ONE figure or ONE line changed, and each must
// fail with the message that names that figure. A suite that only asserted the
// real snaps read cleanly would prove the patterns match; breaking them one
// figure at a time is what proves each check can fail.
//
// The snaps print holder names, PANs, an address, a bank account and a mobile
// number. Nothing here prints the text: a failure line carries figures and
// docKeys only, and `safe()` masks anything shaped like a PAN, an email or a
// long number in case a reader's own message ever quotes one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buoyantSnapParse, buoyantSnapFails, buoyantSnapHoldingsFails, extract,
} from "../providers/altFundStatements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
let pass = 0, fail = 0;
const safe = (s) => String(s)
  .replace(/[A-Z]{5}[0-9]{4}[A-Z]/g, "<PAN>")
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<EMAIL>")
  .replace(/\d{10,}/g, "<NUMBER>");
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${safe(detail)}` : ""}`); }
};
console.log("buoyantSnap");

const pagesOf = (docKey) => (JSON.parse(fs.readFileSync(path.join(AUDIT, docKey, "pages.json"), "utf8")).pages ?? [])
  .map((p) => ({ text: p.text ?? "" }));
/** The text the reader parses, joined and collapsed exactly as `extract()` does. */
const textOf = (docKey) => pagesOf(docKey).map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
const docOf = (docKey) => JSON.parse(fs.readFileSync(path.join(AUDIT, docKey, "document.json"), "utf8"));
const sectionOf = (docKey, name) => {
  const f = path.join(AUDIT, docKey, `${name}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
};

/** ONE edit, at an anchor that occurs exactly `times` times — never a guess about which. */
const mutate = (text, from, to, times = 1) => {
  const n = text.split(from).length - 1;
  if (n !== times) throw new Error(`the fixture carries ${n} occurrence(s) of an anchor this case expects ${times} of: ${safe(from.slice(0, 60))}`);
  return text.split(from).join(to);
};
/** The snap as the extractor reads it — the classifier's report type, never invented here. */
// A reader that THROWS on a statement it should refuse is itself a defect, so a
// throw is caught and becomes a failed assertion rather than ending the suite —
// the message is the error's own, never the statement's text.
const read = (text) => {
  try { return extract({ grid: { pages: [{ text }] }, meta: { reportType: "portfolio-snap" } }); }
  catch (e) { return { thrown: String(e?.message ?? e), warnings: [], sections: {} }; }
};
const codesOf = (ex) => (ex?.warnings ?? []).map((w) => w.code);
const SNAP_PREFIX = "the Portfolio Snap Report's pages do not restate each other: ";
const UNREAD_PREFIX = "a table page 3 prints is not archived, because it did not read whole: ";
/** The individual failures a warning names, after its fixed prefix. */
const namedIn = (ex, code, prefix) => {
  const w = (ex?.warnings ?? []).find((x) => x.code === code);
  return w && w.detail.startsWith(prefix) ? w.detail.slice(prefix.length).split("; ") : [];
};
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
const PAGE3_SECTIONS = ["current-investments", "fund-holdings", "investment-summary", "performance-twrr"];

const K_ANKITA = "buoyant-capital-103472-2026-08-31-portfolio-snap";
const K_AJAY = "buoyant-capital-103473-2026-08-31-portfolio-snap";
const A4 = "buoyant-opportunities-strategy-category-iii-class-a4";

// What each snap PRINTS, written out here by hand from the PDF rather than read
// back through the reader — so a reader that misread a figure cannot agree with
// itself. Figures only; no holder detail.
const PRINTED = {
  [K_ANKITA]: {
    accountNo: "103472",
    page1: { units: 1918953.2003, cost: 249410446.32, nav: 147.3008, value: 282663341.57, abs: 13.33, ann: 11.09 },
    a4: { cost: 249410446, value: 282663342 },
    summary: { capitalInvested: 248500000, incomeDistributed: 0, withdrawal: 0, profitLoss: 34163342, currentValue: 282663342 },
    twrr: { m1: 2.09, m3: 5.87, y1: 12.02, since: 10.65 },
  },
  [K_AJAY]: {
    accountNo: "103473",
    page1: { units: 3416657.4167, cost: 475353990.9, nav: 147.3008, value: 503276370.81, abs: 5.87, ann: 25.73 },
    a4: { cost: 475353991, value: 503276371 },
    summary: { capitalInvested: 460000000, incomeDistributed: 58862, withdrawal: -58862, profitLoss: 43276371, currentValue: 503276371 },
    twrr: { m1: 2.09, m3: 5.87, y1: 11.56, since: 10.28 },
  },
};

// The book's own figures, read off the GENERATED file as text. The snaps are
// the newest statement of Buoyant's units and NAV, so the book's two positions
// must be theirs — and the book's cost, carried through the A1 → A4 switch from
// the dated record (Stage 10bv), must be what page 3's Investment Summary says
// was put in: two independent paths to one figure.
const glow = fs.readFileSync(path.join(ROOT, "src", "data", "glowData.ts"), "utf8");
const exportBlock = (name) => {
  const at = glow.indexOf(`export const ${name}`);
  if (at < 0) return "";
  const next = glow.indexOf("\nexport const ", at + 1);
  return glow.slice(at, next < 0 ? undefined : next);
};
// Each object is split off at its opening brace, which takes the newline before
// its first key with it — so that newline is put back, or the first key of
// every object (`securityKey`, `accountId`) can never match `field`.
const objectsOf = (name) => exportBlock(name).split(/\n  \{\n/).slice(1).map((o) => "\n" + o);
const field = (obj, key) => {
  const m = new RegExp(`\\n\\s*"${key}": ([^,\\n]+),?\\n`).exec(obj ?? "");
  if (!m) return undefined;
  return m[1] === "null" ? null : m[1].startsWith("\"") ? JSON.parse(m[1]) : Number(m[1]);
};
const bookPosition = (accountId) => objectsOf("BOOK_POSITIONS")
  .find((o) => field(o, "accountId") === accountId && field(o, "securityKey") === A4);
const bookAccount = (accountId) => objectsOf("BOOK_ACCOUNTS").find((o) => field(o, "accountId") === accountId);

// ── 1. Both snaps, as committed ─────────────────────────────────────────────
const parsed = {};
for (const K of [K_ANKITA, K_AJAY]) {
  const P = PRINTED[K];
  const tag = P.accountNo;
  const text = textOf(K);
  const doc = docOf(K);
  const ex = read(text);
  const p = buoyantSnapParse(text);
  parsed[K] = p;

  ok(`${tag}: the document is ok, with no warning at all`,
    ex?.status === "ok" && codesOf(ex).length === 0, JSON.stringify([ex?.status, codesOf(ex)]));
  ok(`${tag}: …as the archive records it`,
    doc.status === "ok" && (doc.warnings ?? []).length === 0 && doc.reportType === "portfolio-snap");
  ok(`${tag}: it is read as the snap it is, for the account and the date it prints`,
    ex?.reportType === "portfolio-snap" && ex?.accountNo === P.accountNo && ex?.asOf === "2026-08-31",
    JSON.stringify([ex?.reportType, ex?.accountNo, ex?.asOf]));

  const h = ex?.holdings?.[0];
  ok(`${tag}: one holding — page 1's Class A4 units at its NAV, as primitives`,
    ex?.holdings?.length === 1 && h.securityKey === A4 && h.quantity === P.page1.units
      && h.marketPrice === P.page1.nav && h.totalCost === P.page1.cost && h.priceAsOn === "2026-08-31",
    JSON.stringify(h && [h.securityKey, h.quantity, h.marketPrice, h.totalCost, h.priceAsOn]));
  ok(`${tag}: …with the printed value as a check, never the value itself`,
    h?.marketValue === null && h?.printed?.marketValue === P.page1.value
      && h?.absoluteYieldPct === P.page1.abs && h?.annualizedYieldPct === P.page1.ann,
    JSON.stringify(h && [h.marketValue, h.printed?.marketValue, h.absoluteYieldPct, h.annualizedYieldPct]));
  ok(`${tag}: the archive holds exactly the holding the reader writes now`,
    (doc.holdings ?? []).length === 1 && ["securityKey", "quantity", "marketPrice", "totalCost", "priceAsOn"]
      .every((k) => doc.holdings[0][k] === h?.[k]) && doc.holdings[0].printed?.marketValue === P.page1.value);
  ok(`${tag}: …and the archive derives the value from units × NAV, to the paisa`,
    Math.abs(doc.holdings[0].marketValue - P.page1.value) < 0.005, String(doc.holdings[0].marketValue));
  ok(`${tag}: …and exactly the dated record`,
    (ex?.cashFlows ?? []).length === 7 && JSON.stringify(ex.cashFlows) === JSON.stringify(doc.cashFlows ?? null));

  // The dated record is page 1's, read by `buoyantFlows` (Stage 10bv): five
  // Cash Deposits, each a contribution, and the A1 → A4 switch as two legs.
  const flows = ex?.cashFlows ?? [];
  const legs = flows.filter((c) => c.kind === "reclassification");
  ok(`${tag}: five Cash Deposits are contributions and the class switch is two reclassification legs`,
    flows.filter((c) => c.kind === "contribution").length === 5 && legs.length === 2
      && legs.some((c) => c.units < 0 && c.balance === 0) && legs.some((c) => c.units > 0),
    JSON.stringify(flows.map((c) => [c.date, c.kind, c.units])));
  const lastA4 = flows.filter((c) => c.securityKey === A4).at(-1);
  ok(`${tag}: the record's units run to page 1's balance`,
    lastA4?.balance === P.page1.units, String(lastA4?.balance));

  for (const name of [...PAGE3_SECTIONS, "transactions"]) {
    ok(`${tag}: the ${name} table is archived exactly as the reader writes it`,
      JSON.stringify(ex?.sections?.[name] ?? null) === JSON.stringify(sectionOf(K, name)));
  }
  ok(`${tag}: no section beyond those five`,
    sameSet(Object.keys(ex?.sections ?? {}), [...PAGE3_SECTIONS, "transactions"]),
    JSON.stringify(Object.keys(ex?.sections ?? {})));

  // Page 3, read directly.
  ok(`${tag}: page 1 and page 3 name the same account, and the same date`,
    p.account1 === P.accountNo && p.account3 === P.accountNo && p.asOf1 === "2026-08-31" && p.asOf3 === "2026-08-31",
    JSON.stringify([p.account1, p.account3, p.asOf1, p.asOf3]));
  ok(`${tag}: the scheme is Category III, open ended, incepted 1 Jun 2024`,
    p.classification === "Category III, Open Ended" && p.inception === "01/06/2024" && p.summary.since === "01/06/2024",
    JSON.stringify([p.classification, p.inception, p.summary.since]));
  ok(`${tag}: page 1's row is its Total row, and its units × NAV is its value to the paisa`,
    p.row && p.total1 && p.row.units === p.total1.units && p.row.cost === p.total1.cost && p.row.value === p.total1.value
      && Math.round(P.page1.units * P.page1.nav * 100) / 100 === P.page1.value);
  ok(`${tag}: Current Investments prints the switched-out Class A1 at a measured 0 / 0`,
    p.classes.length === 2 && p.classes.some((c) => c.cls === "A1" && c.cost === 0 && c.value === 0),
    JSON.stringify(p.classes));
  ok(`${tag}: …and Class A4 at page 1's cost and value, rounded to the rupee`,
    p.classes.some((c) => c.cls === "A4" && c.cost === P.a4.cost && c.value === P.a4.value)
      && P.a4.cost === Math.round(P.page1.cost) && P.a4.value === Math.round(P.page1.value));
  ok(`${tag}: …and its Total is its rows`,
    p.ciTotal?.cost === P.a4.cost && p.ciTotal?.value === P.a4.value);
  const s = p.summary;
  ok(`${tag}: the Investment Summary reads as the five printed figures`,
    Object.entries(P.summary).every(([k, v]) => s[k] === v) && s.currentValueDate === "31/08/2026",
    JSON.stringify(s));
  ok(`${tag}: …which add up: invested + income + withdrawal + profit is the current value`,
    s.capitalInvested + s.incomeDistributed + s.withdrawal + s.profitLoss === s.currentValue);
  ok(`${tag}: …and the current value is page 1's, rounded to the rupee`,
    s.currentValue === Math.round(P.page1.value));
  ok(`${tag}: the TWRR is this account's four printed figures, since 1 Jun 2024`,
    p.twrr && Object.entries(P.twrr).every(([k, v]) => p.twrr[k] === v) && p.twrr.sinceFrom === "01/06/24",
    JSON.stringify(p.twrr));
  ok(`${tag}: the fund's top holdings run 1 to 41 and add to 100 within the printed precision`,
    p.fundHoldings.length === 41 && p.fundHoldings.every((x, i) => x.sr === i + 1) && p.fundHoldingsTotal
      && Math.abs(p.fundHoldings.reduce((a, x) => a + x.pct, 0) - 100) <= 41 * 0.005,
    String(p.fundHoldings.length));
  ok(`${tag}: …so page 3 restates page 1, and every table reads whole`,
    buoyantSnapFails(p, "A4").length === 0 && buoyantSnapHoldingsFails(p).length === 0);

  // The book.
  const pos = bookPosition(`buoyant-capital-${P.accountNo}`);
  ok(`${tag}: the book's position is the snap's units, NAV and value, on its date`,
    pos && field(pos, "quantity") === P.page1.units && field(pos, "currentPrice") === P.page1.nav
      && field(pos, "marketValue") === P.page1.value && field(pos, "priceAsOf") === "2026-08-31",
    JSON.stringify(pos && ["quantity", "currentPrice", "marketValue", "priceAsOf"].map((k) => field(pos, k))));
  ok(`${tag}: …and keeps page 1's restated cost as the statement's own figure`,
    pos && field(pos, "printedCostBasis") === P.page1.cost && field(pos, "costBasisSource") === "carried-through-switch");
  // Page 3 counts the reinvested distribution as income and pays it straight
  // back as a withdrawal; the book counts it in what the units cost (Stage
  // 10bv). So the book's carried cost is invested + income, to the rupee.
  ok(`${tag}: the book's carried cost is what page 3 says was put in — invested plus income reinvested, to the rupee`,
    pos && Math.abs(field(pos, "costBasis") - (P.summary.capitalInvested + P.summary.incomeDistributed)) <= 0.5,
    JSON.stringify(pos && [field(pos, "costBasis"), P.summary.capitalInvested + P.summary.incomeDistributed]));
  const acc = bookAccount(`buoyant-capital-${P.accountNo}`);
  ok(`${tag}: the account is marked at the snap's date, and its capital record reaches it`,
    acc && field(acc, "asOf") === "2026-08-31" && field(acc, "capitalRecordTo") === "2026-08-31",
    JSON.stringify(acc && [field(acc, "asOf"), field(acc, "capitalRecordTo")]));
}

// ── 2. The two snaps, against each other ────────────────────────────────────
// The fund's top holdings are the SCHEME's: both snaps print them line for
// line. The TWRR is the ACCOUNT's: the two folios sat in different unit classes
// until Ajay's switched in June 2026, so they agree on one and three months and
// differ on a year and since inception — a scheme has one return, an account
// has its own.
{
  const a = parsed[K_ANKITA], b = parsed[K_AJAY];
  ok("both snaps print the fund's holdings line for line — the scheme's, not an account's",
    a.fundHoldings.length === 41 && JSON.stringify(a.fundHoldings) === JSON.stringify(b.fundHoldings));
  ok("the TWRR is each account's: the same over one and three months …",
    a.twrr.m1 === b.twrr.m1 && a.twrr.m3 === b.twrr.m3);
  ok("…and different over a year and since inception",
    a.twrr.y1 !== b.twrr.y1 && a.twrr.since !== b.twrr.since);
  // The two pages are laid out two ways: the holdings heading ends the
  // "Investment Summary (INR)" line on one and stands alone on the other. Both
  // must find all 41 — the reader anchors the heading on the LINE'S END.
  const headingLine = (K) => textOf(K).split("\n").find((l) => /Current\s+Holdings\s*$/.test(l)) ?? "";
  ok("the holdings heading is laid out two ways, and both are read",
    /^Current\s+Holdings\s*$/.test(headingLine(K_AJAY).trim()) && !/^Current/.test(headingLine(K_ANKITA).trim())
      && a.fundHoldings.length === b.fundHoldings.length);
}

// ── 3. Page 3 does not restate page 1 — each check, one figure at a time ────
// On Ankita's snap. Every case expects EXACTLY the failures it names: a check
// that fired for the wrong reason, or a second check that fired with it, is as
// much a finding as one that did not fire at all.
{
  const T = textOf(K_ANKITA);
  const P = PRINTED[K_ANKITA];
  const ROW = "147.3008 28,26,63,341.57 13.33";
  const TOTAL1 = "Total 19,18,953.2003 24,94,10,446.32 28,26,63,341.57";
  const CI_A4 = "BUOYANT OPPORTUNITIES 249,410,446 282,663,342";
  const CI_TOTAL = "Total 249,410,446 282,663,342";
  const PL = "Profit / Loss 34,163,342";
  const CV = "Current Value(31/08/2026) 282,663,342";

  /** Expect the snap to be published as a warning naming exactly `want`, every page-3 table withheld. */
  const refuses = (label, text, want) => {
    const ex = read(text);
    const named = namedIn(ex, "snap-does-not-tie", SNAP_PREFIX);
    ok(`snap: ${label}`, sameSet(named, want), JSON.stringify(named));
    ok(`snap: ${label} — …the document is not ok, and no page-3 table is archived`,
      ex?.status !== "ok" && codesOf(ex).includes("snap-does-not-tie")
        && !PAGE3_SECTIONS.some((n) => n in (ex?.sections ?? {})),
      JSON.stringify([ex?.status, codesOf(ex), Object.keys(ex?.sections ?? {})]));
    // The holding is page 1's, and page 1 is the account statement itself:
    // a page 3 that does not restate it flags the document, never rewrites it.
    ok(`snap: ${label} — …and page 1's holding still stands, as its own primitives`,
      ex?.holdings?.length === 1 && ex.holdings[0].quantity === P.page1.units && ex.holdings[0].marketPrice === P.page1.nav);
  };

  refuses("page 1's value a paisa off its units × NAV fails, and so does its Total row",
    mutate(T, ROW, "147.3008 28,26,63,341.58 13.33"),
    ["page 1: 1918953.2003 unit(s) × NAV 147.3008 is 282663341.57, not the printed 282663341.58",
      "page 1's Total row is not its one Account Summary row"]);
  // A page that does not restate page 1 withholds EVERY page-3 table, and the
  // first warning says why. A second warning blaming the holdings' own
  // arithmetic would name the wrong cause for a table already withheld.
  {
    const rowOnly = read(mutate(T, ROW, "147.3008 28,26,63,341.58 13.33"));
    const both = read(mutate(mutate(T, ROW, "147.3008 28,26,63,341.58 13.33"), "Total 100%\n", ""));
    ok("snap: a snap that does not tie names that and only that — not the tables it withheld for it",
      !both.thrown && codesOf(rowOnly).includes("snap-does-not-tie")
        && !codesOf(both).includes("snap-section-not-read") && sameSet(codesOf(both), codesOf(rowOnly)),
      JSON.stringify([both.thrown ?? null, codesOf(rowOnly), codesOf(both)]));
  }
  refuses("page 1 with no Total row fails",
    mutate(T, TOTAL1 + "\n", ""),
    ["page 1 prints no Total row"]);
  refuses("page 1's Total row that is not its row fails, and page 3's Total no longer rounds it",
    mutate(T, TOTAL1, "Total 19,18,953.2003 24,94,10,446.32 28,26,63,342.57"),
    ["page 1's Total row is not its one Account Summary row",
      "page 3's Current Investments Total is not page 1's Total rounded"]);
  refuses("a Class A4 value a rupee off page 1's fails, and so does page 3's own Total",
    mutate(T, CI_A4, "BUOYANT OPPORTUNITIES 249,410,446 282,663,343"),
    ["page 3 Class A4: 249410446 / 282663343 is not page 1's 249410446 / 282663342 rounded",
      "page 3's Current Investments Total is not its rows"]);
  refuses("a class page 1 does not hold must print 0 / 0",
    mutate(T, "BUOYANT OPPORTUNITIES 0 0", "BUOYANT OPPORTUNITIES 0 5"),
    ["page 3 Class A1: 0 / 5 is not page 1's 0 / 0 rounded",
      "page 3's Current Investments Total is not its rows"]);
  refuses("a Current Investments row whose class is not printed fails",
    mutate(T, "CATEGORY III -\nCLASS A1\n", "CATEGORY III -\n"),
    ["a Current Investments row names no class"]);
  refuses("page 3 that does not list the class page 1 holds fails",
    mutate(T, "CLASS A4\nTotal 249,410,446", "CLASS A5\nTotal 249,410,446"),
    ["page 3 Class A5: 249410446 / 282663342 is not page 1's 0 / 0 rounded",
      "page 3 lists no Class A4, the class page 1 holds"]);
  refuses("Current Investments with no Total row fails",
    mutate(T, CI_TOTAL + "\n", ""),
    ["page 3's Current Investments prints no Total row"]);
  refuses("a Current Investments Total that is not its rows fails both ways",
    mutate(T, CI_TOTAL, "Total 249,410,447 282,663,342"),
    ["page 3's Current Investments Total is not its rows",
      "page 3's Current Investments Total is not page 1's Total rounded"]);
  refuses("an Investment Summary that does not add up fails, naming its five figures",
    mutate(T, PL, "Profit / Loss 34,163,343"),
    ["page 3's Investment Summary does not add up: 248500000 + 0 + 0 + 34163343 is not 282663342"]);
  refuses("an Investment Summary with a figure that does not read fails",
    mutate(T, "Income Distributed 0 2 AXIS", "Income Distributed - 2 AXIS"),
    ["page 3's Investment Summary did not read as five figures"]);
  refuses("a current value that adds up but is not page 1's fails",
    mutate(mutate(T, PL, "Profit / Loss 34,163,343"), CV, "Current Value(31/08/2026) 282,663,343"),
    ["page 3's Current Value 282663343 is not page 1's 282663341.57 rounded"]);
  refuses("a current value dated another day fails",
    mutate(T, "Current Value(31/08/2026)", "Current Value(31/07/2026)"),
    ["page 3's Current Value is dated 31/07/2026, not the statement's 2026-08-31"]);
  refuses("page 3 naming another account fails",
    mutate(T, "Account: 103472 -", "Account: 103473 -"),
    ["page 3 does not name the account page 1 names"]);

  // A withdrawal is read with its sign: Ajay's snap prints the reinvested
  // distribution as income and a NEGATIVE withdrawal. Read unsigned, the
  // summary stops adding up — which is what proves the minus is read.
  {
    const ex = read(mutate(textOf(K_AJAY), "Withdrawal -58,862", "Withdrawal 58,862"));
    ok("snap: a withdrawal read without its minus no longer adds up",
      sameSet(namedIn(ex, "snap-does-not-tie", SNAP_PREFIX),
        ["page 3's Investment Summary does not add up: 460000000 + 58862 + 58862 + 43276371 is not 503276371"]),
      JSON.stringify(namedIn(ex, "snap-does-not-tie", SNAP_PREFIX)));
  }

  // Page 1's row in another column order is not read at all: the layout says
  // its summary row did not match, no holding is published, and the snap check
  // never runs over a page it did not read.
  {
    const bad = mutate(T, "OPPORTUNITIES 31/08/2026 19,18,953.2003", "OPPORTUNITIES 31-08-2026 19,18,953.2003");
    const ex = read(bad);
    ok("snap: page 1's row out of its declared order publishes no holding and says why",
      ex?.holdings?.length === 0 && codesOf(ex).includes("summary-row-not-matched")
        && !codesOf(ex).includes("snap-does-not-tie") && ex?.status !== "ok",
      JSON.stringify([ex?.holdings?.length, codesOf(ex), ex?.status]));
    ok("snap: …and the check itself says page 1 prints no row it can read",
      sameSet(buoyantSnapFails(buoyantSnapParse(bad), "A4"),
        ["page 1 prints no Account Summary row in the declared column order"]));
  }
}

// ── 4. Page 3 restates page 1, but a table it archives does not read whole ──
// The fund's holdings and the TWRR are archived as printed and become no fact
// of the book. One that does not read whole is withheld — and the warning says
// which, because a section that silently stops appearing is indistinguishable
// from a snap that never printed one. Everything else is still archived.
{
  const T = textOf(K_ANKITA);
  const withheld = (label, text, missing, want) => {
    const ex = read(text);
    const named = namedIn(ex, "snap-section-not-read", UNREAD_PREFIX);
    ok(`unread: ${label}`, sameSet(named, want), JSON.stringify(named));
    ok(`unread: ${label} — …the snap still ties, so only that table is withheld`,
      !codesOf(ex).includes("snap-does-not-tie") && ex?.status !== "ok"
        && !(missing in (ex?.sections ?? {}))
        && PAGE3_SECTIONS.filter((n) => n !== missing).every((n) => n in (ex?.sections ?? {})),
      JSON.stringify([codesOf(ex), ex?.status, Object.keys(ex?.sections ?? {})]));
  };
  withheld("holdings whose serial numbers skip are not archived",
    mutate(T, "9 ETERNAL LTD 3.02%", "19 ETERNAL LTD 3.02%"), "fund-holdings",
    ["the fund holdings' serial numbers do not run 1 to 41"]);
  withheld("holdings that add to more than 100 beyond the printed precision are not archived",
    mutate(T, "41 Others 7.13%", "41 Others 7.53%"), "fund-holdings",
    // The printed weights add to 100.01 (each is rounded to 2 decimals), so 0.40
    // more is struck on THEIR sum — derived here, never typed.
    [`the fund holdings add to ${Math.round((buoyantSnapParse(T).fundHoldings.reduce((a, x) => a + x.pct, 0) + 0.40) * 100) / 100}%, not 100%`]);
  withheld("holdings with no Total 100% row are not archived",
    mutate(T, "Total 100%\n", ""), "fund-holdings",
    ["the fund holdings print no Total 100% row"]);
  withheld("a TWRR row that does not read as four percentages is not archived",
    mutate(T, "Portfolio 2.09% 5.87% 12.02% 10.65%", "Portfolio 2.09% 5.87% 12.02%"), "performance-twrr",
    ["the Performance (TWRR) row did not read as four percentages"]);
  // Within the precision the weights are printed to, a misprint cannot be told
  // from rounding: 0.10 over 41 rows is inside 41 × 0.005, and still archived.
  {
    const ex = read(mutate(T, "41 Others 7.13%", "41 Others 7.23%"));
    ok("unread: holdings within the printed precision of 100 are archived, with no warning",
      ex?.status === "ok" && codesOf(ex).length === 0 && "fund-holdings" in (ex?.sections ?? {}),
      JSON.stringify([ex?.status, codesOf(ex)]));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
