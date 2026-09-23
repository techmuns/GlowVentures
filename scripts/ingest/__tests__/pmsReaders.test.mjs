// The PMS reporting system's readers — the transaction statement's columns, and
// the value bridge's flow lines on the performance summary, the performance
// appraisal, the SEBI PMS investor report and Sanshi's account statement.
// Run: node scripts/ingest/__tests__/pmsReaders.test.mjs
//
// Statements are built HERE with known coordinates, so every expectation is the
// fixture's own geometry — which figure was painted under which label — and
// never the reader's opinion of itself. Then the COMMITTED archive is held to
// the same rules, because a synthetic statement proves the reader and only the
// archive proves what the book was actually given.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout } from "../lib/layout.mjs";
import { parseNumInfo } from "../lib/parseNum.mjs";
import { extract as extractPms } from "../providers/pmsStatements.mjs";
import { extract as extractInvestorReport } from "../providers/pmsInvestorReport.mjs";
import { extract as extractSanshi } from "../providers/sanshiFund.mjs";
import { makeGridPdf } from "./fixtures/makePdf.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("pmsReaders");

const read = async (spans, meta) => {
  const { pages, error } = await extractLayout(makeGridPdf(spans, { mediaBox: [0, 0, 842, 595], fontSize: 6.5 }));
  if (error) throw new Error(error);
  return extractPms({ grid: { pages }, meta: { docKey: meta.docKey, fileName: meta.fileName, provider: meta.provider, reportType: meta.reportType, accountNo: meta.accountNo } });
};

// ── 1. THE BLANK EXCHANGE COLUMN (A-05) ─────────────────────────────────────
// Buoyant's transaction statement records the family's own subscriptions into
// its Category III fund. The Exchg column is blank on every row, so the body
// measures no column under that label. The label must bind to NOTHING — not to
// its nearest neighbour, which is the quantity figures. The geometry below is
// the real statement's, measured off `I83_103473_TransactionStatement_India94CT`:
// `Exchg` at x=503 over nothing, `Quantity` at 569 over figures at 551–596.
const X = { desc: 36, tran: 155, settle: 200, sec: 241, exchg: 503, qty: 555, price: 618, brkg: 683, stt: 728, amount: 757 };
const header = [
  [X.desc, 497, "Transaction Description"], [X.tran, 497, "Tran Date"], [X.settle, 497, "Settlement"],
  [X.sec, 497, "Security"], [X.exchg, 497, "Exchg"], [569, 497, "Quantity"], [617, 497, "Unit Price"],
  [X.brkg, 497, "Brkg."], [X.stt, 497, "STT"], [745, 497, "Settlement Amount"],
  [210, 488, "Date"],
];
const trade = (y, t) => [
  [X.desc, y, t.desc], [X.tran - 9, y, t.date], [X.settle - 4, y, t.date], [X.sec, y, t.sec],
  ...(t.exchg ? [[X.exchg + 2, y, t.exchg]] : []),
  [X.qty, y, t.qty], [X.price, y, t.price], [X.brkg + 2, y, t.brkg ?? "0.00"], [X.stt, y, t.stt ?? "0.00"], [X.amount, y, t.amount],
];
const top = [
  [35, 560, "Transaction Statement"],
  [35, 545, "Account : 103473 AJAY THAKURDAS JAISINGHANI - BOUYA388"],
  [35, 515, "From 01/04/2026 to 31/07/2026"],
];
const BUOYANT = { docKey: "t-buoyant", fileName: "I83_103473_TransactionStatement.pdf", provider: "Buoyant Capital", reportType: "transaction-statement", accountNo: "103473" };
const allotments = [
  [X.desc, 452, "Mutual Funds - AIF Category III"],
  ...trade(437, { desc: "Buy", date: "01/04/2026", sec: "BUOYANT OPPORTUNITIES STRATEGY - CLASS A1", qty: "7,17,459.678", price: "139.4627", amount: "10,00,58,861.66" }),
  ...trade(424, { desc: "Buy", date: "01/06/2026", sec: "BUOYANT OPPORTUNITIES STRATEGY - CLASS A4", qty: "17,96,901.615", price: "139.1284", amount: "25,00,00,000.00" }),
];
{
  const doc = await read([...top, ...header, [X.desc, 468, "Current Period Transactions"], ...allotments], BUOYANT);
  const t = doc.transactions ?? [];
  ok("Buoyant: both subscriptions are read", t.length === 2, `got ${t.length}`);
  const [a1, a4] = t;
  ok("Buoyant A1: the UNITS are the quantity, not the NAV", a1?.quantity === 717459.678, `got ${a1?.quantity}`);
  ok("Buoyant A1: the NAV is the unit price", a1?.unitPrice === 139.4627, `got ${a1?.unitPrice}`);
  ok("Buoyant A4: 17,96,901.615 units at 139.1284", a4?.quantity === 1796901.615 && a4?.unitPrice === 139.1284,
    `got ${a4?.quantity} @ ${a4?.unitPrice}`);
  ok("Buoyant: the blank Exchange column binds to nothing — no exchange carries a figure",
    t.every((x) => x.exchange === null), JSON.stringify(t.map((x) => x.exchange)));
  ok("Buoyant: the unmatched column is named, and it is the exchange",
    (doc.warnings ?? []).some((w) => w.code === "columns-not-matched" && /exchange/.test(w.detail) && !/quantity|unitPrice/.test(w.detail)),
    JSON.stringify(doc.warnings));
  ok("Buoyant: the section names the class — a fund's own units are an AIF", t.every((x) => x.assetClass === "AIF"),
    JSON.stringify(t.map((x) => x.assetClass)));
  ok("Buoyant: an allotment carries the NAV's printed precision, read off the cell (4dp)",
    t.every((x) => x.ratePrecision === 4), JSON.stringify(t.map((x) => x.ratePrecision)));
  // …and the precision covers what units x printed NAV cannot reproduce: half a
  // unit of the NAV's last printed decimal, times the units.
  ok("Buoyant: units x NAV reproduces the cash paid within the printed precision",
    t.every((x) => Math.abs(x.quantity * x.unitPrice - x.printed.settlementAmount) <= 0.5 * 1e-4 * x.quantity + 0.005),
    JSON.stringify(t.map((x) => x.quantity * x.unitPrice - x.printed.settlementAmount)));
}

// ── 1b. …AND AN EXCHANGE COLUMN WITH FIGURES STILL BINDS ────────────────────
// The fix must not be "never read the exchange": where the column carries a
// value it is measured under its own label, and a house trade settles on its
// printed rate, so it carries no precision allowance.
{
  const spans = [
    ...top.map(([x, y, s]) => [x, y, s.replace("103473 AJAY THAKURDAS JAISINGHANI - BOUYA388", "3517383 AJAY T JAISINGHANI - CBP0142")]), ...header,
    [X.desc, 452, "Shares - Listed"],
    ...trade(437, { desc: "Buy", date: "02/04/2026", sec: "BIOCON LTD.", exchg: "NSE", qty: "22,476", price: "128.8256", brkg: "0.1288", stt: "2,895.00", amount: "29,01,274.59" }),
    ...trade(424, { desc: "Sell", date: "03/04/2026", sec: "SYNGENE INTERNATIONAL LTD.", exchg: "BSE", qty: "1,500", price: "640.1000", brkg: "0.6400", stt: "960.00", amount: "9,58,229.00" }),
  ];
  const doc = await read(spans, { docKey: "t-carnelian", fileName: "CBP0142_40212_TransactionStatement.pdf", provider: "Carnelian Asset Management and Advisors Pvt Ltd", reportType: "transaction-statement", accountNo: "3517383" });
  const t = doc.transactions ?? [];
  ok("house trades: both read", t.length === 2, `got ${t.length}`);
  ok("house trades: the exchange column binds where it carries a value", t[0]?.exchange === "NSE" && t[1]?.exchange === "BSE",
    JSON.stringify(t.map((x) => x.exchange)));
  ok("house trades: quantity and price stay in their own columns", t[0]?.quantity === 22476 && t[0]?.unitPrice === 128.8256,
    `got ${t[0]?.quantity} @ ${t[0]?.unitPrice}`);
  ok("house trades: listed shares are Equity and settle on the printed rate (no precision allowance)",
    t.every((x) => x.assetClass === "Equity" && x.ratePrecision === null), JSON.stringify(t.map((x) => [x.assetClass, x.ratePrecision])));
  ok("house trades: no column went unmatched", !(doc.warnings ?? []).some((w) => w.code === "columns-not-matched"),
    JSON.stringify(doc.warnings));
}

// ── 1c. "UNIT PRICE" IS NOT A QUANTITY LABEL ────────────────────────────────
// A statement whose count column carries no label this reader knows leaves
// `quantity` with one claim only — the `units?` alias matching the first word of
// "Unit Price", over the PRICE figures. Taking it publishes a NAV as a unit
// count, which is the A-05 misread arriving by another route. Refused, the
// count goes unmatched, `require` drops the table, and nothing is published.
{
  const spans = [
    ...top, [X.desc, 497, "Transaction Description"], [X.tran, 497, "Tran Date"], [X.settle, 497, "Settlement"],
    [X.sec, 497, "Security"], [569, 497, "Allotted"], [617, 497, "Unit Price"],
    [X.brkg, 497, "Brkg."], [X.stt, 497, "STT"], [745, 497, "Settlement Amount"], [210, 488, "Date"],
    ...allotments,
  ];
  const doc = await read(spans, { ...BUOYANT, docKey: "t-nolabel" });
  const t = doc.transactions ?? [];
  ok("no quantity label: a NAV is never published as the unit count",
    t.every((x) => x.quantity !== 139.4627 && x.quantity !== 139.1284),
    JSON.stringify(t.map((x) => [x.quantity, x.unitPrice])));
  ok("no quantity label: …and no row is published with its count missing either", t.length === 0,
    `got ${t.length} row(s): ${JSON.stringify(t.map((x) => [x.quantity, x.unitPrice]))}`);
}

// ── 1d. THE COMMITTED ARCHIVE, HELD TO THE SAME RULE ─────────────────────────
// An exchange is a venue. A transaction row whose `exchange` parses as a number
// is a row whose figures landed one column left, and every later figure on it
// is wrong by the same shift. And a trade whose price and units are both
// printed must reproduce its own settlement: a NAV read as a count misses it by
// a factor of the units squared.
{
  const man = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
  let rows = 0, priced = 0;
  const shifted = [], wide = [];
  for (const e of man) {
    const p = path.join(AUDIT, e.docKey, "document.json");
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const t of d.transactions ?? []) {
      rows++;
      if (t.exchange != null && parseNumInfo(String(t.exchange)).status === "ok") shifted.push(`${e.docKey} ${t.date} ${t.exchange}`);
      const s = t.printed?.settlementAmount;
      if (typeof t.quantity === "number" && typeof t.unitPrice === "number" && typeof s === "number" && s) {
        priced++;
        if (Math.abs(t.quantity * t.unitPrice) / Math.abs(s) > 2 || Math.abs(t.quantity * t.unitPrice) / Math.abs(s) < 0.5) {
          wide.push(`${e.docKey} ${t.date} ${t.quantity} @ ${t.unitPrice} vs ${s}`);
        }
      }
    }
  }
  ok("archive: there are transaction rows to check", rows > 100, `got ${rows}`);
  ok("archive: no transaction row carries a number in its exchange column", shifted.length === 0, shifted.slice(0, 5).join("; "));
  ok("archive: there are priced rows to check", priced > 100, `got ${priced}`);
  ok("archive: every priced row's units x price is within a factor of two of its own settlement",
    wide.length === 0, wide.slice(0, 5).join("; "));
  // The Buoyant tape by name: its two allotments are the ones this was found on.
  const buoyant = path.join(AUDIT, "buoyant-capital-103473-2026-07-31-transaction-statement", "document.json");
  if (fs.existsSync(buoyant)) {
    const t = JSON.parse(fs.readFileSync(buoyant, "utf8")).transactions ?? [];
    ok("archive: Buoyant 103473's tape carries both allotments as units at a NAV",
      t.length === 2 && t.every((x) => x.quantity > 100000 && x.unitPrice > 100 && x.unitPrice < 200 && x.assetClass === "AIF"),
      JSON.stringify(t.map((x) => [x.quantity, x.unitPrice, x.assetClass])));
  } else ok("archive: Buoyant 103473's transaction statement is in the archive", false, buoyant);
}

// ── 2. THE VALUE BRIDGE'S OWN LINES (A-12) ──────────────────────────────────
// Every bridge below is struck from the statement's OWN printed lines, and it
// must reach the statement's own printed closing value. That is the licence for
// every line the reader keeps: drop one — the accrual, the change in accruals,
// the other expenses — or copy the closing into the opening, and it misses.
const n = (v) => (typeof v === "number" ? v : 0);
const bridgePms = (f) => n(f.openingCorpus) + n(f.netCapitalInOut) + n(f.realized) + n(f.unrealized)
  + n(f.gainPriorToTakeover) + n(f.income) - n(f.fees) - n(f.expenses) + n(f.accruedIncome);
const bridgeInvestor = (f) => n(f.openingCorpus) + n(f.contribution) - n(f.withdrawal) + n(f.income)
  + n(f.changeInAccruals) - n(f.fees) - n(f.expenses) - n(f.otherExpenses) + n(f.realized) + n(f.unrealized);
const ties = (parts, close) => typeof close === "number" && Math.abs(parts - close) <= 0.05;
const CARNELIAN = { provider: "Carnelian Asset Management and Advisors Pvt Ltd", accountNo: "3517383" };
const lines = (rows, x = 300) => rows.flatMap(([label, value], i) => [[40, 470 - i * 14, label], [x, 470 - i * 14, value]]);
const letterhead = [
  [40, 560, "CARNELIAN ASSET MANAGEMENT AND ADVISORS PVT LTD"],
  [40, 530, "Account : 3517383 AJAY T JAISINGHANI - CBP0142"],
  [40, 516, "CARNELIAN BESPOKE PORTFOLIO"],
];

// 2a. The performance SUMMARY prints both endpoints: the first is the opening.
{
  const doc = await read([
    ...letterhead, [40, 545, "PORTFOLIO PERFORMANCE SUMMARY"], [40, 500, "From 01/04/2026 To 10/08/2026"],
    ...lines([
      ["Market Value as of 01/04/2026", "312,627,059.69"], ["Capital In(+)/Out(-)", "-140,472.00"],
      ["Realized Gain", "-5,332,313.97"], ["Unrealized Gain", "88,135,851.44"], ["Gain Prior to Take-over", "0.00"],
      ["Income", "1,404,720.00"], ["Fees", "1,093,771.47"], ["Expenses", "263,456.83"],
      ["Accrued Income", "62,750.00"], ["Market Value as of 10/08/2026", "395,400,366.85"],
    ]),
  ], { ...CARNELIAN, docKey: "t-perf-summary", fileName: "CBP0142_PortfolioPerfSummary.pdf", reportType: "performance-summary" });
  const f = doc.flows ?? {};
  ok("summary: the opening is the FIRST of the two printed values", f.openingCorpus === 312627059.69, `got ${f.openingCorpus}`);
  ok("summary: the closing is the last", f.corpus === 395400366.85, `got ${f.corpus}`);
  ok("summary: Accrued Income is read", f.accruedIncome === 62750, `got ${f.accruedIncome}`);
  ok("summary: Gain Prior to Take-over is read, and its printed 0.00 stays a measured zero", f.gainPriorToTakeover === 0, `got ${f.gainPriorToTakeover}`);
  ok("summary: its own lines reach its own closing", ties(bridgePms(f), f.corpus), `parts ${bridgePms(f)} vs ${f.corpus}`);
}

// 2b. The performance APPRAISAL runs since inception and prints ONE value. The
// opening is not printed, so it is null — never the closing copied back, which
// made the bridge sum to twice the account.
{
  const doc = await read([
    ...letterhead, [40, 545, "PERFORMANCE APPRAISAL"], [40, 500, "As Of 10/08/2026"],
    ...lines([
      ["Portfolio Inception Date", "06/01/2025"], ["Net Capital In (+) / Out (-)", "329,646,665.00"],
      ["Realized Gain", "-6,983,811.82"], ["Unrealized Gain", "79,022,713.85"], ["Gain Prior to Take-over", "0.00"],
      ["Income Received", "3,533,336.10"], ["Fees and Expenses", "9,881,286.28"],
      ["Accrued Income", "62,750.00"], ["Portfolio Value On 10/08/2026", "395,400,366.85"],
    ]),
  ], { ...CARNELIAN, docKey: "t-perf-appraisal", fileName: "CBP0142_PerformanceAppraisal.pdf", reportType: "performance-history" });
  const f = doc.flows ?? {};
  ok("appraisal: one printed value is the CLOSING", f.corpus === 395400366.85, `got ${f.corpus}`);
  ok("appraisal: …and the opening is null, not the closing copied back", f.openingCorpus === null, `got ${f.openingCorpus}`);
  ok("appraisal: Accrued Income is read", f.accruedIncome === 62750, `got ${f.accruedIncome}`);
  ok("appraisal: its own lines reach its own closing from nil", ties(bridgePms(f), f.corpus), `parts ${bridgePms(f)} vs ${f.corpus}`);
}

// 2c. The SEBI PMS investor report and Sanshi's account statement are read from
// TEXT, so the real statements' own committed text is replayed through the real
// readers. The expected figures are read off that text here, independently.
const pagesOf = (docKey) => {
  const p = path.join(AUDIT, docKey, "pages.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")).pages.map((x) => ({ page: x.page, text: x.text })) : null;
};
const printed = (text, re) => {
  const m = re.exec(text.replace(/[ \t]+/g, " "));
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
};
const INVESTOR = [
  "svan-investment-managers-llp-8710067-2026-07-31-investor-report",
  "green-lantern-capital-llp-510861-2026-06-30-investor-report",
];
for (const docKey of INVESTOR) {
  const pages = pagesOf(docKey);
  if (!pages) { ok(`${docKey}: its committed text is in the archive`, false); continue; }
  const text = pages.map((p) => p.text).join("\n");
  const f = extractInvestorReport({ grid: { pages }, meta: { docKey } }).flows ?? {};
  ok(`${docKey}: "Change in accruals" is read as printed`,
    f.changeInAccruals === printed(text, /Change in accruals\s+(-?[\d,]+\.\d+)/i), `got ${f.changeInAccruals}`);
  ok(`${docKey}: "Other expenses" is read as printed`,
    f.otherExpenses === printed(text, /\d+\.\s*Other expenses\s+(-?[\d,]+\.\d+)/i), `got ${f.otherExpenses}`);
  ok(`${docKey}: its own lines reach its own closing`, ties(bridgeInvestor(f), f.corpus), `parts ${bridgeInvestor(f)} vs ${f.corpus}`);
}
{
  const docKey = "sanshi-fund-9039671821-2026-06-30-unknown";
  const pages = pagesOf(docKey);
  if (!pages) ok(`${docKey}: its committed text is in the archive`, false);
  else {
    const d = extractSanshi({ grid: { pages }, meta: { docKey } });
    const f = d.flows ?? {};
    ok("Sanshi: the window closes at the fund's own printed valuation", f.corpus === d.holdings?.[0]?.printed?.marketValue && f.corpus === d.totals?.totalMarketValue,
      `corpus ${f.corpus} vs valuation ${d.holdings?.[0]?.printed?.marketValue}`);
    ok("Sanshi: …which is not the money paid in", f.corpus !== f.contribution, `corpus ${f.corpus} contribution ${f.contribution}`);
  }
}

// 2d. THE COMMITTED ARCHIVE, HELD TO THE SAME RULE. Every performance summary,
// performance appraisal and investor report ties from its own lines; every
// since-inception appraisal carries no opening; every Sanshi folio closes at its
// valuation. The counts are the archive's own, and there must be some.
{
  const man = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
  let struck = 0, appraisals = 0, sanshi = 0;
  const gaps = [], copied = [], atCost = [];
  for (const e of man) {
    const p = path.join(AUDIT, e.docKey, "document.json");
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    const f = d.flows;
    if (!f) continue;
    if (/^performance-(summary|history)$/.test(d.reportType) || d.reportType === "investor-report") {
      struck++;
      const parts = d.reportType === "investor-report" ? bridgeInvestor(f) : bridgePms(f);
      if (!ties(parts, f.corpus)) gaps.push(`${e.docKey} parts ${Math.round(parts * 100) / 100} vs ${f.corpus}`);
    }
    if (d.reportType === "performance-history") {
      appraisals++;
      if (f.openingCorpus !== null) copied.push(`${e.docKey} opening ${f.openingCorpus} closing ${f.corpus}`);
    }
    if (d.provider === "Sanshi Fund") {
      sanshi++;
      if (f.corpus !== d.holdings?.[0]?.printed?.marketValue) atCost.push(`${e.docKey} closes at ${f.corpus}, valued at ${d.holdings?.[0]?.printed?.marketValue}`);
    }
  }
  ok("archive: there are value bridges to strike", struck > 20, `got ${struck}`);
  ok("archive: every performance summary, appraisal and investor report ties from its own printed lines",
    gaps.length === 0, `${gaps.length} of ${struck}: ${gaps.slice(0, 4).join("; ")}`);
  ok("archive: there are since-inception appraisals to check", appraisals > 5, `got ${appraisals}`);
  ok("archive: no since-inception appraisal carries an opening (it prints only its closing)",
    copied.length === 0, `${copied.length} of ${appraisals}: ${copied.slice(0, 3).join("; ")}`);
  ok("archive: there are Sanshi folios to check", sanshi > 0, `got ${sanshi}`);
  ok("archive: every Sanshi folio's window closes at its printed valuation", atCost.length === 0, atCost.slice(0, 3).join("; "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
