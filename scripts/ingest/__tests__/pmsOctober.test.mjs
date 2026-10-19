// The October 2026 delivery's read gaps on the shared PMS reporting system:
// three report types that had no reader (PERFORMANCE BY SECURITY SINCE
// INCEPTION, TRIAL BALANCE, OPEN LOTS), an appraisal with no Equity section and
// a `(Cost)` sub-label, a print date in the appraisal's footer, and four columns
// that were printed but read as unmatched.
// Run: node scripts/ingest/__tests__/pmsOctober.test.mjs
//
// Statements are built HERE, figures right-aligned to their own labels as the
// real ones print them (every width MEASURED off the fixture's own font, never
// assumed), so each expectation is the fixture's own arithmetic. Then one
// figure is broken at a time: a check is only proved by the case it refuses.
// Last, the real PDFs are read where they are on disk (`source/_extracted/` is
// not committed); a run without them says so rather than passing silently.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout } from "../lib/layout.mjs";
import { extract as extractPms } from "../providers/pmsStatements.mjs";
import { classify, REPORT_TYPES } from "../lib/classify.mjs";
import { PRECEDENCE } from "../precedence.mjs";
import { securityKeyOf } from "../../../shared/securityKey.mjs";
import { makeMultiPagePdf } from "./fixtures/makePdf.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
let pass = 0, fail = 0;
const notChecked = [];
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("pmsOctober");

const LANDSCAPE = { mediaBox: [0, 0, 842, 595], fontSize: 6.5 };
const PORTRAIT = { mediaBox: [0, 0, 595, 842], fontSize: 7 };

/** Every string's rendered width in the fixture font, measured by the layout engine itself. */
async function measure(strings, opts) {
  const uniq = [...new Set(strings)];
  const widths = new Map();
  for (let i = 0; i < uniq.length; i += 40) {
    const chunk = uniq.slice(i, i + 40);
    const { pages, error } = await extractLayout(makeMultiPagePdf([chunk.map((s, k) => [20, opts.mediaBox[3] - 20 - k * 13, s])], opts));
    if (error) throw new Error(error);
    for (const r of pages[0].rows) for (const it of r.items ?? []) widths.set(it.text, it.width);
  }
  return widths;
}
/**
 * Lay out a page from `[x, y, text]` spans and `[{ right }, y, text]` spans —
 * the second right-aligned to `right`, which is how these statements print
 * every figure (and most labels) against its column's right edge.
 */
async function build(pages, opts) {
  const all = pages.flat().map((s) => s[2]);
  const w = await measure(all, opts);
  const placed = pages.map((spans) => spans.map(([x, y, t]) => [typeof x === "object" ? Math.round((x.right - w.get(t)) * 100) / 100 : x, y, t]));
  const { pages: laid, error } = await extractLayout(makeMultiPagePdf(placed, opts));
  if (error) throw new Error(error);
  return laid;
}
const R = (right) => ({ right });
const read = (pages, meta) => extractPms({ grid: { pages }, meta: { fileName: "x.pdf", ...meta } });
const codes = (d) => (d.warnings ?? []).map((w) => w.code);

const CARNELIAN = { provider: "Carnelian Asset Management and Advisors Pvt Ltd", accountNo: "3517383" };
const VEC = { provider: "V.E.C Assago Capital Management LLP", accountNo: "128004" };

// ── 0. THE CLASSIFIER AND THE PRECEDENCE TABLE ──────────────────────────────
{
  const cases = [
    ["G3517383_40212_ReportPerformancebySecurityInception6077OT.pdf",
      "PERFORMANCE BY SECURITY SINCE INCEPTION Account : 3517383 AJAY T JAISINGHANI - CBP0142 CARNELIAN BESPOKE PORTFOLIO As of 07/10/2026",
      "performance-by-security"],
    ["G3517383_40212_ReportTrialBalance1733OT.pdf",
      "CARNELIAN ASSET MANAGEMENT AND ADVISORS PVT LTD TRIAL BALANCE From 01/04/2026 To 07/10/2026 Account : 3517383 AJAY T JAISINGHANI - CBP0142",
      "trial-balance"],
    ["G128004_145038_OpenLots_India471OT (1).pdf",
      "V.E.C ASSAGO CAPITAL MANAGEMENT LLP OPEN LOTS By Asset Class 07/10/2026 Account : 128004 ANKITA BHARAT JAISINGHANI - VECBES0003",
      "open-lots"],
  ];
  for (const [fileName, text, want] of cases) {
    const c = classify({ fileName, text });
    ok(`classify: ${fileName} is ${want}`, c.reportType === want, `got ${c.reportType}`);
    ok(`classify: ${want} is a report type the pipeline knows`, REPORT_TYPES.includes(want));
  }
  // A report type with no precedence rule supplies NOTHING to the book — which
  // is the whole design of these three. Named anywhere, it would compete with
  // the appraisal, the P&L account or the bank book.
  const named = [];
  for (const [provider, rules] of Object.entries(PRECEDENCE)) {
    for (const [fact, rule] of Object.entries(rules)) {
      const types = rule.reportTypes ?? [rule.reportType];
      for (const t of types) if (["performance-by-security", "trial-balance", "open-lots"].includes(t)) named.push(`${provider}.${fact} → ${t}`);
    }
  }
  ok("precedence: none of the three new report types is named for any fact of any provider", !named.length, named.join("; "));
}

// ── 1. PERFORMANCE BY SECURITY SINCE INCEPTION ──────────────────────────────
// Two printed lines per record, each column carrying two labels. The figures
// tie: qty × unit price = value, qty × unit cost = cost, value − cost = gain,
// and every subtotal is the sum of its rows. Realised gain and income received
// are DELIBERATELY not sums of the rows — a security sold out before the as-of
// prints no row but its gain is in the subtotal, exactly as on the real report.
const PBS = { qty: 250, mv: 320, pct: 365, cost: 432, unrl: 500, rlzd: 566, accr: 636, absIrr: 686, irr: 736, date: 803 };
const pbsHead = (y = 503) => [
  [35, 560, "PERFORMANCE BY SECURITY SINCE INCEPTION"],
  [35, 545, "Account : 3517383 AJAY T JAISINGHANI - CBP0142"],
  [35, 530, "CARNELIAN BESPOKE PORTFOLIO"],
  [35, 515, "As of 07/10/2026"],
  [36, y, "Security Name"], [R(PBS.qty), y, "Qty"], [R(PBS.mv), y, "Market Value"], [R(PBS.pct), y, "%Assets"],
  [R(PBS.cost), y, "Total Cost"], [R(PBS.unrl), y, "Unrealised Gain"], [R(PBS.rlzd), y, "Realized Gain"],
  [R(PBS.accr), y, "Accrued Income"], [R(PBS.absIrr), y, "Abs IRR%"], [R(PBS.irr), y, "IRR%"], [R(PBS.date), y, "Price as on"],
  [R(PBS.mv), y - 12, "Unit Price"], [R(PBS.cost), y - 12, "Unit Cost"], [R(PBS.unrl), y - 12, "% Gain/Loss"],
  [R(PBS.rlzd), y - 12, "Prior/Transfer Gain"], [R(PBS.accr), y - 12, "Income Received"], [R(PBS.absIrr), y - 12, "Abs BM IRR"],
  [R(PBS.irr), y - 12, "BM IRR%"], [R(PBS.date), y - 12, "Bench mark"],
];
/** One two-line record: line 1 at y, line 2 at y − 10. */
const pbsRecord = (y, r) => [
  ...(r.name ? [[r.total ? 140 : 36, y, r.name]] : []),
  ...(r.qty ? [[R(PBS.qty), y, r.qty]] : []),
  [R(PBS.mv), y, r.mv], [R(PBS.pct), y, r.pct], [R(PBS.cost), y, r.cost], [R(PBS.unrl), y, r.unrl], [R(PBS.rlzd), y, r.rlzd],
  [R(PBS.accr), y, "0"], [R(PBS.absIrr), y, r.irr ?? "1.00 %"], [R(PBS.irr), y, r.irr ?? "1.00 %"],
  ...(r.date ? [[R(PBS.date), y, r.date]] : []),
  ...(r.wrap ? [[36, y - 10, r.wrap]] : []),
  ...(r.price ? [[R(PBS.mv), y - 10, r.price]] : []), ...(r.uc ? [[R(PBS.cost), y - 10, r.uc]] : []),
  ...(r.gl ? [[R(PBS.unrl), y - 10, r.gl]] : []),
  [R(PBS.rlzd), y - 10, "0"], [R(PBS.accr), y - 10, r.income ?? "0"], [R(PBS.absIrr), y - 10, "1.00 %"], [R(PBS.irr), y - 10, "1.00 %"],
];
const pbsPages = (f = {}) => [
  [
    ...pbsHead(),
    [36, 470, "Equity"], [36, 458, "Shares"],
    ...pbsRecord(444, { name: "Alpha Industries Ltd", qty: "1,000", mv: f.alphaMv ?? "150,000", pct: "75.00 %", cost: "100,000", unrl: "50,000", rlzd: "2,000",
      date: "06/10/2026", price: "150.00", uc: "100.00", gl: "50.00 %", income: "1,200" }),
    ...pbsRecord(420, { name: "Beta Insurance Company", wrap: "Limited", qty: "500", mv: "40,000", pct: "20.00 %", cost: "45,000", unrl: "-5,000", rlzd: "0",
      date: "06/10/2026", price: "80.00", uc: "90.00", gl: "-11.11 %" }),
    ...pbsRecord(396, { name: "Total : Shares", total: true, mv: "190,000", pct: "95.00 %", cost: "145,000", unrl: "45,000", rlzd: "-3,000", income: "5,000" }),
    ...pbsRecord(372, { name: "Total : Equity", total: true, mv: "190,000", pct: "95.00 %", cost: "145,000", unrl: "45,000", rlzd: "-3,000", income: "5,000" }),
    [36, 348, "Cash and Equivalent"], [36, 336, "Cash / Bank"],
    ...pbsRecord(322, { name: "Cash", qty: "10,000.000", mv: "10,000", pct: "5.00 %", cost: "10,000", unrl: "0", rlzd: "0", date: "-", price: "1.00", uc: "1.00", gl: "0.00 %" }),
    ...pbsRecord(298, { name: "Total : Cash / Bank", total: true, mv: "10,000", pct: "5.00 %", cost: "10,000", unrl: "0", rlzd: "0" }),
    [785, 40, "Page 1"],
  ],
  [
    // Page 2 prints ONLY totals — the case a body-measured grid misplaces.
    ...pbsHead(),
    ...pbsRecord(470, { name: "Total : Cash and Equivalent", total: true, mv: "10,000", pct: "5.00 %", cost: "10,000", unrl: "0", rlzd: "12" }),
    ...pbsRecord(446, { name: "Total", total: true, mv: "200,000", pct: "100.00 %", cost: "155,000", unrl: "45,000", rlzd: "-2,988", income: "5,000" }),
    [36, 420, "Market Value is inclusive of accrued interest / dividend shown under the Accrued Income column."],
    [785, 40, "Page 2"],
  ],
];
{
  const d = read(await build(pbsPages(), LANDSCAPE), { ...CARNELIAN, docKey: "t-pbs", reportType: "performance-by-security" });
  const sheet = d.sections?.performanceBySecurity?.rows ?? [];
  const head = sheet[0] ?? [];
  const row = (label) => sheet.find((r) => r[1] === label);
  const col = (r, f) => r?.[head.indexOf(f)];
  ok("perf-by-security: read whole, with no warning", d.status === "ok" && codes(d).length === 0, `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("perf-by-security: it supplies NOTHING to the book — no holding, total, return, flow or lot",
    !d.holdings.length && !d.totals && !d.returns.length && !d.flows && !(d.openLots ?? []).length,
    JSON.stringify({ h: d.holdings.length, t: d.totals, r: d.returns.length, f: d.flows }));
  ok("perf-by-security: every record, the totals-only page's included (3 holdings + 5 totals)", sheet.length === 1 + 8, `got ${sheet.length - 1}`);
  ok("perf-by-security: a second-line figure is read under its second label (Alpha's unit price, unit cost, income)",
    col(row("Alpha Industries Ltd"), "unitPrice") === "150.00" && col(row("Alpha Industries Ltd"), "unitCost") === "100.00"
      && col(row("Alpha Industries Ltd"), "incomeReceived") === "1,200",
    JSON.stringify(row("Alpha Industries Ltd")));
  ok("perf-by-security: a name wrapped onto the second line is one name", !!row("Beta Insurance Company Limited"), sheet.map((r) => r[1]).join(" | "));
  ok("perf-by-security: the records keep their sections", col(row("Alpha Industries Ltd"), "section") === "Equity / Shares"
    && col(row("Cash"), "section") === "Cash and Equivalent / Cash / Bank", `${col(row("Alpha Industries Ltd"), "section")} / ${col(row("Cash"), "section")}`);
  ok("perf-by-security: the footnote after the grand total is not a record or a heading", !sheet.some((r) => /inclusive/i.test(r.join(" "))));
  const c = d.checks ?? {};
  ok("perf-by-security: its identities are checked and every one holds", c.passed?.length >= 10 && !c.failed?.length, JSON.stringify(c));
  ok("perf-by-security: the subtotals are checked on the totals-only page too",
    (c.passed ?? []).some((p) => /^Total: market value = its 3 holding/.test(p)), (c.passed ?? []).join(" | "));
  ok("perf-by-security: realised gain and income are named as not tied to the rows, with the reason",
    (c.notApplicable ?? []).some((n) => /sold out/.test(n)), JSON.stringify(c.notApplicable));

  // Break ONE figure: Alpha's value no longer equals qty × price nor its subtotal.
  const b = read(await build(pbsPages({ alphaMv: "151,000" }), LANDSCAPE), { ...CARNELIAN, docKey: "t-pbs-b", reportType: "performance-by-security" });
  ok("perf-by-security: a value that does not tie is named, and the document is partial",
    b.status === "partial" && codes(b).includes("performance-by-security-does-not-tie")
      && (b.checks?.failed ?? []).some((f) => /Alpha Industries Ltd/.test(f)) && (b.checks?.failed ?? []).some((f) => /Total : Shares: market value/.test(f)),
    JSON.stringify(b.checks?.failed));
}

// ── 2. TRIAL BALANCE ────────────────────────────────────────────────────────
// Three column groups, each split Debit / Credit by a second header line. The
// ledger balances; each account's opening + movement = closing; page 2 is the
// memorandum unrealised block with its own Total and a Net Total.
const TB = { od: 259, oc: 319, pd: 379, pc: 439, cd: 499, cc: 558 };
const tbHead = () => [
  [256, 790, "TRIAL BALANCE"], [243, 775, "From 01/04/2026 To 07/10/2026"],
  [202, 760, "Account : 3517383"], [273, 760, "AJAY T JAISINGHANI - CBP0142"],
  [90, 742, "Account"], [251, 742, "Opening Balance"], [351, 742, "Transaction During Period"], [493, 742, "Closing Balance"],
  [R(TB.od), 728, "Debit"], [R(TB.oc), 728, "Credit"], [R(TB.pd), 728, "Debit"], [R(TB.pc), 728, "Credit"], [R(TB.cd), 728, "Debit"], [R(TB.cc), 728, "Credit"],
];
const tbLine = (y, x, label, six) => [[x, y, label], ...Object.values(TB).map((r, i) => [R(r), y, six[i]])];
const tbPages = (f = {}) => [
  [
    ...tbHead(),
    [36, 710, "Assets"], [42, 698, "Current Assets"],
    ...tbLine(686, 48, "Bank balance", ["1,000.00", "0.00", "500.00", "0.00", "1,500.00", "0.00"]),
    [42, 674, "Investment"],
    ...tbLine(662, 48, "Shares-Listed", ["10,000.00", "0.00", "0.00", "2,000.00", f.sharesClose ?? "8,000.00", "0.00"]),
    [36, 650, "Expense"],
    ...tbLine(638, 48, "Management Fees", ["300.00", "0.00", "200.00", "0.00", "500.00", "0.00"]),
    [36, 626, "Income"], [42, 614, "Dividend"],
    ...tbLine(602, 48, "Dividend-Shares Listed", ["0.00", "300.00", "0.00", "100.00", "0.00", "400.00"]),
    [42, 590, "Gain/Loss"],
    ...tbLine(578, 48, "Shares-Listed", ["0.00", "0.00", "1,400.00", "0.00", "1,400.00", "0.00"]),
    [36, 566, "Liabilities"], [42, 554, "Capital"],
    ...tbLine(542, 48, "Corpus", ["0.00", "11,000.00", "0.00", "0.00", "0.00", "11,000.00"]),
    ...tbLine(526, 183, "Total", ["11,300.00", "11,300.00", "2,100.00", "2,100.00", "11,400.00", "11,400.00"]),
    [R(556), 71, "1"],
  ],
  [
    ...tbHead(),
    [42, 710, "Unrealized Gain\\Loss"],
    ...tbLine(698, 48, "Shares-Listed", ["500.00", "0.00", "0.00", "1,500.00", "0.00", "1,000.00"]),
    ...tbLine(682, 183, "Total", ["500.00", "0.00", "0.00", "1,500.00", "0.00", "1,000.00"]),
    [170, 666, "Net Total"], [R(TB.od), 666, "500.00"], [R(TB.pc), 666, "1,500.00"], [R(TB.cc), 666, "1,000.00"],
    [R(556), 71, "1"],
  ],
];
{
  const d = read(await build(tbPages(), PORTRAIT), { ...CARNELIAN, docKey: "t-tb", reportType: "trial-balance" });
  const rows = d.sections?.trialBalance?.rows ?? [];
  ok("trial balance: read whole, with no warning", d.status === "ok" && codes(d).length === 0, `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("trial balance: it supplies NOTHING to the book — no flow, no cash flow, no holding",
    !d.flows && !d.cashFlows.length && !d.holdings.length && !d.expenses.length);
  ok("trial balance: every ledger line, both pages (6 accounts + 1, two Totals, one Net Total)", rows.length === 1 + 10, `got ${rows.length - 1}`);
  ok("trial balance: the window is the report's own", d.periodFrom === "2026-04-01" && d.periodTo === "2026-10-07" && d.asOf === "2026-10-07",
    `${d.periodFrom}..${d.periodTo} / ${d.asOf}`);
  const shares = rows.find((r) => r[2] === "Shares-Listed" && r[1] === "Assets / Investment");
  ok("trial balance: a figure lands under its own Debit/Credit label (Shares-Listed: credit in the period, debit at the close)",
    shares?.[6] === "2,000.00" && shares?.[7] === "8,000.00", JSON.stringify(shares));
  ok("trial balance: headings nest by their indent", rows.some((r) => r[1] === "Income / Gain/Loss" && r[2] === "Shares-Listed"),
    rows.map((r) => r[1]).join(" | "));
  ok("trial balance: the page number is not a ledger line", !rows.some((r) => r[2] === "" || r[2] === "1"));
  const c = d.checks ?? {};
  ok("trial balance: every identity holds — rows, both Totals, the Net Total and the ledger's balance",
    c.passed?.length === 5 && !c.failed?.length, JSON.stringify(c));
  const b = read(await build(tbPages({ sharesClose: "8,100.00" }), PORTRAIT), { ...CARNELIAN, docKey: "t-tb-b", reportType: "trial-balance" });
  ok("trial balance: one account that does not roll forward is named, with the Total it breaks",
    b.status === "partial" && codes(b).includes("trial-balance-does-not-tie")
      && (b.checks?.failed ?? []).some((f) => /Shares-Listed/.test(f)) && (b.checks?.failed ?? []).some((f) => /Total on page 1/.test(f)),
    JSON.stringify(b.checks?.failed));
}

// ── 3. OPEN LOTS ────────────────────────────────────────────────────────────
// The lot register: dated purchase lots of the holdings still held. The report
// prints its date in the title block with no "As of"; the holder and client
// code wrap under `Account`; the security column has no header; page 2 carries
// only the totals.
const OL = { date: 369, qty: 438, uc: 489, tc: 549, price: 599, mv: 659, unrl: 719, days: 760 };
const olHead = () => [
  [332, 520, "V.E.C ASSAGO CAPITAL MANAGEMENT LLP"],
  [408, 470, "OPEN LOTS"], [412, 461, "By Asset Class"], [418, 450, "07/10/2026"],
  [317, 438, "Account : 128004"], [384, 438, "TEST HOLDER - VECBES0003"],
  [317, 426, "V.E.C ASSAGO Small and Mid-Cap Growth Bespoke Discretionary PMS"],
  [50, 410, "Equity"],
  [183, 399, "Account"], [R(371), 399, "Buy Date"], [R(OL.qty), 399, "Quantity"], [R(OL.uc), 399, "Unit Cost"],
  [R(OL.tc), 399, "Total Cost"], [R(OL.price), 399, "Price"], [R(OL.mv), 399, "Market Value"], [R(OL.unrl), 399, "Unrealized"],
  [R(OL.days), 399, "No.of Days"], [R(OL.unrl), 389, "Gain/Loss"], [R(OL.days), 389, "Held"],
];
const olLot = (y, l) => [
  [50, y, l.name], [183, y, "TEST HOLDER -"], [R(OL.date), y, l.date], [R(OL.qty), y, l.qty], [R(OL.uc), y, l.uc], [R(OL.tc), y, l.tc],
  [R(OL.price), y, l.price], [R(OL.mv), y, l.mv], [R(OL.unrl), y, l.unrl], [R(OL.days), y, l.days],
  [183, y - 9, "VECBES0003"],
];
const olTotal = (y, label, f) => [...(label ? [[311, y, label]] : []), [R(OL.qty), y, "3,500.000"], [R(OL.tc), y, f.tc ?? "2,60,000.00"],
  [R(OL.mv), y, "3,05,000.00"], [R(OL.unrl), y, "45,000.00"]];
const olFooter = (n) => [[50, 60, "08/10/2026"], [781, 60, String(n)], [50, 48, "Note :"], [93, 48, "PIS = Portfolio Investment Scheme For NRI"]];
const olPages = (f = {}) => [
  [
    ...olHead(),
    [50, 372, "Equity-Listed"],
    ...olLot(360, { name: "Alpha Industries Ltd", date: "05/08/2025", qty: "1,000.000", uc: "100.0000", tc: "1,00,000.00", price: "150.0000", mv: "1,50,000.00", unrl: "50,000.00", days: f.days ?? "428" }),
    ...olLot(340, { name: "Alpha Industries Ltd", date: "25/05/2026", qty: "500.000", uc: "120.0000", tc: "60,000.00", price: "150.0000", mv: "75,000.00", unrl: "15,000.00", days: "135" }),
    ...olLot(320, { name: "Beta Ltd", date: "31/07/2025", qty: "2,000.000", uc: "50.0000", tc: "1,00,000.00", price: "40.0000", mv: "80,000.00", unrl: "-20,000.00", days: "433" }),
    ...olTotal(300, "Equity-Listed Total", f),
    ...olFooter(1),
  ],
  [
    ...olHead(),
    ...olTotal(372, "Equity Total", f), ...olTotal(360, "Detailed Total", f), ...olTotal(348, null, f),
    ...olFooter(2),
  ],
];
{
  const d = read(await build(olPages(), LANDSCAPE), { ...VEC, docKey: "t-ol", reportType: "open-lots" });
  const lots = d.openLots ?? [];
  ok("open lots: read whole, with no warning", d.status === "ok" && codes(d).length === 0, `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("open lots: the as-of is the title block's date (no \"As of\" is printed), never the footer's print date",
    d.asOf === "2026-10-07", `got ${d.asOf}`);
  ok("open lots: every lot is emitted as the lot register (3)", lots.length === 3, `got ${lots.length}`);
  ok("open lots: …and NEVER as a holding, a total or a flow", !d.holdings.length && !d.totals && !d.flows && !d.transactions.length);
  const [a1, a2, b1] = lots;
  ok("open lots: a lot is its security, purchase date, quantity, unit cost and total cost",
    a1?.security === "Alpha Industries Ltd" && a1?.securityKey === securityKeyOf("Alpha Industries Ltd") && a1?.purchaseDate === "2025-08-05"
      && a1?.quantity === 1000 && a1?.unitCost === 100 && a1?.totalCost === 100000,
    JSON.stringify(a1));
  ok("open lots: two lots of one security stay two lots", a2?.securityKey === a1?.securityKey && a2?.purchaseDate === "2026-05-25" && a2?.quantity === 500,
    JSON.stringify(a2));
  ok("open lots: the lot carries no valuation — price, value and gain are the appraisal's", !("marketValue" in (b1 ?? {})) && !("price" in (b1 ?? {})),
    JSON.stringify(b1));
  const sheet = d.sections?.openLots?.rows ?? [];
  ok("open lots: the holder's name and client code, wrapped, are one account", sheet.slice(1, 4).every((r) => r[3] === "TEST HOLDER - VECBES0003"),
    JSON.stringify(sheet.slice(1, 4).map((r) => r[3])));
  ok("open lots: the section runs on over the page break and the footer date is no section",
    sheet.slice(1, 4).every((r) => r[1] === "Equity-Listed" && r[0] === "Equity"), JSON.stringify(sheet.slice(1, 4).map((r) => r.slice(0, 2))));
  ok("open lots: the totals-only page is read under its labels — four totals, each = its lots",
    (d.checks?.passed ?? []).filter((p) => /Total|unlabelled/.test(p)).length === 4 && !(d.checks?.failed ?? []).length,
    JSON.stringify(d.checks));
  const b = read(await build(olPages({ days: "427" }), LANDSCAPE), { ...VEC, docKey: "t-ol-b", reportType: "open-lots" });
  ok("open lots: a holding period that does not count from the as-of is named",
    b.status === "partial" && codes(b).includes("open-lots-do-not-tie") && (b.checks?.failed ?? []).some((f) => /days held/.test(f)),
    JSON.stringify(b.checks?.failed));
  const t = read(await build(olPages({ tc: "2,61,000.00" }), LANDSCAPE), { ...VEC, docKey: "t-ol-t", reportType: "open-lots" });
  ok("open lots: a total that is not the sum of its lots is named",
    (t.checks?.failed ?? []).some((f) => /Equity-Listed Total/.test(f)) && (t.checks?.failed ?? []).some((f) => /Detailed Total/.test(f)),
    JSON.stringify(t.checks?.failed));
}

// ── 4. THE APPRAISAL: NO EQUITY SECTION, A `(Cost)` SUB-LABEL, A PRINT DATE ──
// Buoyant's appraisal holds a Category III fund under `Alternative Assets` and
// cash, and no equity; its `% Assets` column is labelled `(Cost)` beneath.
// SVAN's prints the run date at the foot of the page under `% Assets`.
const AP = { qty: 214, uc: 262, cost: 320, price: 370, mv: 428, gl: 484, pgl: 519, pa: 554 };
const apHead = [
  [35, 812, "Portfolio Appraisal"], [35, 796, "Account : 103472 ANKITA JAISINGHANI - BOUYA387"],
  [35, 783, "Buoyant Opportunities Strategy - Investor"], [35, 770, "As of 31/07/2026"], [272, 751, "By Asset Class"],
  [35, 721, "Security"], [R(AP.qty), 721, "Quantity"], [R(AP.uc), 721, "Unit Cost"], [R(AP.cost), 721, "Cost"], [R(AP.price), 721, "Price"],
  [R(AP.mv), 721, "Market Value"], [R(AP.gl), 721, "Gain / Loss (+/-)"], [R(AP.pgl), 721, "% G/L"], [R(AP.pa), 721, "% Assets"],
  [R(AP.mv), 707, "Accrued Income"], [R(AP.pa), 707, "(Cost)"],
];
const apRow = (y, name, v) => [...(name ? [[35, y, name]] : []), ...Object.entries(v).map(([k, s]) => [R(AP[k]), y, s])];
const apPage = (firstSection) => [
  ...apHead,
  [35, 688, "Cash and Equivalent"],
  ...apRow(675, "Cash", { qty: "0", uc: "1.00", cost: "0.00", price: "1.00", mv: "0.00", gl: "0", pgl: "0.00%", pa: "0.00%" }),
  ...apRow(661, null, { cost: "0.00", mv: "0.00", gl: "0", pgl: "0.00%", pa: "0.00%" }),
  [35, 639, firstSection],
  ...apRow(626, "TEST OPPORTUNITIES FUND - CLASS A4", { qty: "1,000.000", uc: "100.00", cost: "1,00,000.00", price: "110.0000", mv: "1,10,000.00", gl: "10,000", pgl: "10.00%", pa: "100.00%" }),
  ...(firstSection === "Alternative Assets" ? apRow(605, null, { cost: "1,00,000.00", mv: "1,10,000.00", gl: "10,000", pgl: "10.00%", pa: "100.00%" }) : []),
  ...apRow(585, null, { cost: "1,00,000.00", mv: "1,10,000.00", gl: "10,000", pgl: "10.00%", pa: "100.00%" }),
  [R(555), 54, "07/10/2026"],
];
{
  const d = read(await build([apPage("Alternative Assets")], PORTRAIT), { provider: "Buoyant Capital", accountNo: "103472", docKey: "t-ap", reportType: "appraisal" });
  ok("appraisal: no Equity section, so no missing equity subtotal; `(Cost)` and the footer date are not figures — no warning at all",
    d.status === "ok" && codes(d).length === 0, `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("appraisal: the fund is read as an AIF holding beside the cash line", d.holdings.length === 2
    && d.holdings.some((h) => h.assetClass === "AIF" && h.quantity === 1000) && d.holdings.some((h) => h.assetClass === "Cash"),
    JSON.stringify(d.holdings.map((h) => [h.security, h.assetClass, h.quantity])));
  ok("appraisal: the equity figures stay null — the statement prints none", d.totals?.equityMarketValue === null && d.totals?.totalMarketValue === 110000,
    JSON.stringify(d.totals));
  // Control: an appraisal that DOES head an Equity section and prints no
  // subtotal under it is still reported.
  const equityFirst = [
    ...apHead,
    [35, 688, "Equity"],
    ...apRow(675, "TEST INDUSTRIES LTD", { qty: "1,000", uc: "100.00", cost: "1,00,000.00", price: "110.00", mv: "1,10,000.00", gl: "10,000", pgl: "10.00%", pa: "100.00%" }),
    [35, 653, "Cash and Equivalent"],
    ...apRow(640, "Cash", { qty: "0", uc: "1.00", cost: "0.00", price: "1.00", mv: "0.00", gl: "0", pgl: "0.00%", pa: "0.00%" }),
    ...apRow(626, null, { cost: "0.00", mv: "0.00", gl: "0", pgl: "0.00%", pa: "0.00%" }),
    ...apRow(605, null, { cost: "1,00,000.00", mv: "1,10,000.00", gl: "10,000", pgl: "10.00%", pa: "100.00%" }),
  ];
  const e = read(await build([equityFirst], PORTRAIT), { provider: "Buoyant Capital", accountNo: "103472", docKey: "t-ap-e", reportType: "appraisal" });
  ok("appraisal: an Equity section with no subtotal is still reported", codes(e).includes("equity-subtotal-not-found"), JSON.stringify(e.warnings));
}

// ── 5. THE REAL STATEMENTS, WHERE THEY ARE ON DISK ──────────────────────────
// `source/_extracted/` is expanded locally and not committed. Each check below
// reads one real PDF through the reader; a run without it says what it did not
// check rather than passing on its behalf.
async function realDoc(rel, reportType, meta) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { notChecked.push(rel); return null; }
  const { pages, error } = await extractLayout(new Uint8Array(fs.readFileSync(p)), { passwords: [] });
  if (error) { notChecked.push(`${rel} (${error})`); return null; }
  return read(pages, { ...meta, fileName: path.basename(p), docKey: `real-${reportType}`, reportType });
}
const SVAN = { provider: "SVAN Investment Managers LLP" };
{
  const d = await realDoc("source/_extracted/october-2026-c/CARNELIAN - AJAY/G3517383_40212_ProfitLossAccount1213OT.pdf", "profit-and-loss", CARNELIAN);
  if (d) {
    const f = d.flows ?? {};
    ok("real Carnelian P&L: published — its INCOME block prints no Other Income line and still closes",
      !codes(d).includes("profit-and-loss-line-missing") && !codes(d).includes("profit-and-loss-does-not-tie") && f.income === 1781297.6
        && f.realized === -1763423.42 && f.fees === 1678079.5 && Math.abs(f.corpus - 385169845.54) < 0.005,
      JSON.stringify({ w: codes(d), f }));
    ok("real Carnelian P&L: its capital lines are balances (reserves begin at −80,46,939.72), not the window's flows",
      f.contribution === null && f.withdrawal === null && codes(d).includes("profit-and-loss-capital-is-a-balance"), JSON.stringify(f));
  }
  const pbs = await realDoc("source/_extracted/october-2026-c/CARNELIAN - AJAY/G3517383_40212_ReportPerformancebySecurityInception6077OT.pdf", "performance-by-security", CARNELIAN);
  if (pbs) ok("real Carnelian performance by security: 13 holdings + 5 totals, every identity holds",
    pbs.status === "ok" && pbs.sections.performanceBySecurity.rows.length === 19 && !pbs.checks.failed.length, JSON.stringify(pbs.checks?.failed ?? pbs.warnings));
  const tb = await realDoc("source/_extracted/october-2026-c/CARNELIAN - AJAY/G3517383_40212_ReportTrialBalance1733OT.pdf", "trial-balance", CARNELIAN);
  if (tb) ok("real Carnelian trial balance: 18 accounts, balanced, every identity holds",
    tb.status === "ok" && tb.checks.passed.length === 5 && !tb.checks.failed.length, JSON.stringify(tb.checks));
  const ol = await realDoc("source/_extracted/october-2026-c/VEC - ANKITA/G128004_145038_OpenLots_India471OT (1).pdf", "open-lots", VEC);
  if (ol) ok("real V.E.C 128004 open lots: 26 lots across 14 securities, as of 07/10/2026, every identity holds",
    ol.status === "ok" && ol.openLots.length === 26 && new Set(ol.openLots.map((l) => l.securityKey)).size === 14 && ol.asOf === "2026-10-07"
      && !ol.checks.failed.length, JSON.stringify({ n: ol.openLots.length, asOf: ol.asOf, failed: ol.checks.failed }));
  // …and the lots reconcile, security by security, to the APPRAISAL of the same
  // date — the gate build-book applies before it will split anything by them.
  const apKey = path.join(ROOT, "public/audit/v-e-c-assago-capital-management-llp-128004-2026-10-07-appraisal/document.json");
  if (ol && fs.existsSync(apKey)) {
    const ap = JSON.parse(fs.readFileSync(apKey, "utf8"));
    const held = ap.holdings.filter((h) => h.assetClass !== "Cash");
    const sum = (k, f) => ol.openLots.filter((l) => l.securityKey === k).reduce((s, l) => s + l[f], 0);
    const off = held.filter((h) => Math.abs(sum(h.securityKey, "quantity") - h.quantity) > 1e-6 || Math.abs(sum(h.securityKey, "totalCost") - h.totalCost) > 1);
    ok("real V.E.C 128004 open lots: quantity and cost reconcile to the 07/10/2026 appraisal on every holding (a CHECK, never a source)",
      held.length === 14 && !off.length, off.map((h) => h.securityKey).join(", "));
  }
  for (const acct of ["8710067", "8710090"]) {
    const dir = acct === "8710067" ? "Svan _ Ajay" : "Svan - Bharat";
    const ap = await realDoc(`source/_extracted/october-2026-c/${dir}/Z1281_${acct}_PortfolioAppraisal675CT${acct === "8710067" ? " (1)" : ""}.pdf`, "appraisal", SVAN);
    if (ap) ok(`real SVAN ${acct} appraisal: the footer's print date is not an unparseable % Assets`, !codes(ap).includes("unparseable-cell"), JSON.stringify(ap.warnings));
    const cg = await realDoc(`source/_extracted/october-2026-c/${dir}/Z1282_${acct}_CapitalGain90CT.pdf`, "capital-gain", SVAN);
    if (cg) ok(`real SVAN ${acct} capital gain: Effective Gain-LT is read (24 listed lots) and equals the printed LT`,
      !codes(cg).includes("columns-not-matched") && cg.capitalGains.filter((l) => l.effectiveLongTerm !== null).length === 24
        && cg.capitalGains.every((l) => l.effectiveLongTerm === null || l.effectiveLongTerm === l.longTerm), JSON.stringify(cg.warnings));
    const ex = await realDoc(`source/_extracted/october-2026-c/${dir}/Z1282_${acct}_Expensestmt546CT.pdf`, "expense-statement", SVAN);
    if (ex) ok(`real SVAN ${acct} expenses: Tran Ref. is printed over an empty column, so it is not reported missing`,
      !codes(ex).includes("columns-not-matched") && ex.expenses.length > 0, JSON.stringify(ex.warnings));
  }
  const cg = await realDoc("source/_extracted/october-2026-c/CARNELIAN - AJAY/G3517383_40212_CapitalGain90OT.pdf", "capital-gain", CARNELIAN);
  if (cg) ok("real Carnelian capital gain: Effective Gain-LT is read on all 28 listed lots",
    !codes(cg).includes("columns-not-matched") && cg.capitalGains.filter((l) => l.effectiveLongTerm !== null).length === 28, JSON.stringify(cg.warnings));
  const BUOY = { provider: "Buoyant Capital", accountNo: "103473" };
  const reg = await realDoc("source/_extracted/august-2026-d/MOTILAL REPORTS/Buoyant/I83_103473_CapitalRegister1173CT.pdf", "capital-register", BUOY);
  if (reg) {
    const sw = reg.cashFlows.filter((c) => /^security (in|out)$/i.test(c.description));
    ok("real Buoyant 103473 capital register: Desc/Notes is read under its label, wrapped note joined, settlement date freed",
      !codes(reg).includes("columns-not-matched") && sw.length === 2
        && sw[0].notes === "BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A4 - 1619755.801214"
        && sw[1].notes === "BUOYANT OPPORTUNITIES STRATEGY - CATEGORY III - CLASS A1 - 1489474.00322"
        && sw.every((c) => c.settlementDate === "2026-06-01"), JSON.stringify(sw.map((c) => [c.notes, c.settlementDate])));
  }
  const tape = await realDoc("source/_extracted/august-2026-d/MOTILAL REPORTS/Buoyant/I83_103473_TransactionStatement_India94CT.pdf", "transaction-statement", BUOY);
  if (tape) ok("real Buoyant 103473 transactions: Exchg is printed over an empty column — read as blank, not reported missing",
    !codes(tape).includes("columns-not-matched") && tape.transactions.every((t) => t.exchange === null) && tape.transactions.length === 2,
    JSON.stringify(tape.warnings));
  const div = await realDoc("source/_extracted/VEC - AJAY JAISINGHANI/VECBES0004_145052_DividendStatement_India177OT (1).pdf", "dividend-statement",
    { provider: "V.E.C Assago Capital Management LLP", accountNo: "128005" });
  if (div) ok("real V.E.C 128005 dividend: the TDS Amount column is read (0.00 printed)",
    !codes(div).includes("columns-not-matched") && div.income.length === 1 && div.income[0].tds === 0, JSON.stringify([div.warnings, div.income]));
  for (const acct of ["103472", "103473"]) {
    const ap = await realDoc(`source/_extracted/august-2026-d/MOTILAL REPORTS/Buoyant/I83_${acct}_PortfolioAppraisal675CT${acct === "103473" ? " (1)" : ""}.pdf`, "appraisal", { provider: "Buoyant Capital", accountNo: acct });
    if (ap) ok(`real Buoyant ${acct} appraisal: read with no warning — no Equity section, \`(Cost)\` is a label`, ap.status === "ok" && !codes(ap).length,
      JSON.stringify(ap.warnings));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (notChecked.length) {
  console.log(`  NOT CHECKED — ${notChecked.length} real statement(s) not on disk:`);
  for (const n of notChecked) console.log(`    ${n}`);
}
process.exit(fail ? 1 : 0);
