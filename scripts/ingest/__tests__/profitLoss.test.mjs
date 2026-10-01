// The readers the `september-2026` delivery needed for two CLOSED mandates — ASK's
// PROFIT AND LOSS ACCOUNT and Marathon's DETAILS OF INCOME AND EXPENSES — and the
// rules around them: the fact sheet that prints a nil corpus and no holdings
// table, the tape rows that are not trades, the reconciler's whole-life window,
// and the precedence blocks that name which document supplies what.
// Run: node scripts/ingest/__tests__/profitLoss.test.mjs
//
// Every statement is built HERE with known coordinates and figures that tie, so
// each expectation is the fixture's own arithmetic, never the reader's opinion
// of itself. Then ONE figure is broken at a time: a gate is only proved by the
// case it refuses, and a reader that published a whole-life account it could
// not close is the one figure on the page nobody can check without the PDF.
import { extractLayout } from "../lib/layout.mjs";
import { extract as extractPms } from "../providers/pmsStatements.mjs";
import { makeDocument, makeFlows, makeCapitalGain } from "../lib/document.mjs";
import { reconcile } from "../reconcile.mjs";
import { sourceFor, PRECEDENCE } from "../precedence.mjs";
import { makeGridPdf, makeMultiPagePdf } from "./fixtures/makePdf.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("profitLoss");

const layout = async (pdf) => {
  const { pages, error } = await extractLayout(pdf);
  if (error) throw new Error(error);
  return pages;
};
const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 0.005;

// ── 1. ASK's PROFIT AND LOSS ACCOUNT ────────────────────────────────────────
// Two pages: the P&L since 1 April 2019, and the balance sheet at the as-of.
// The labels are the real statement's, spelled as it spells them — the reserves
// line split over two spans, a subtotal printed with no label, the unrealised
// block's stray unlabelled figure. The figures are the fixture's own, chosen so
// every identity the reader checks holds exactly.
const ASK = { provider: "ASK Investment Managers Limited", reportType: "profit-and-loss", accountNo: "9990001", fileName: "askimpms_9990001_ProfitLossAccount.pdf" };
const FIG = /^-?[\d,]+\.\d\d$/;
/** One printed line: a label at x=40, a second label span at 220, its figure at 420. */
const lines = (rows, y0 = 505) => rows.flatMap((r, i) => {
  const y = y0 - i * 14;
  if (typeof r === "string") return [[40, y, r]];
  const [label, ...rest] = r;
  return [...(label ? [[40, y, label]] : []), ...rest.map((s) => [FIG.test(s) ? 420 : 220, y, s])];
});
const head = (title, period) => [
  [40, 570, "SYNTHETIC INVESTMENT MANAGERS LIMITED"],
  [40, 556, title],
  [40, 542, period],
  [40, 528, "Account : 9990001 0099999 - Test Holder"],
];
const PL = {
  dividend: "1,000.00", otherIncome: "10.00", realized: "5,000.00", incomeTotal: "6,010.00",
  custodian: "100.00", management: "500.00", stt: "50.00", otherExpenses: "10.00", expensesTotal: "660.00",
  surplus: "5,350.00",
  unrealizedEnd: "0.00", unrealizedBeginning: "0.00", unrealizedNet: "0.00",
  contribution: "100,000.00", withdrawals: "105,349.66",
  reservesBeginning: "0.00", reservesPeriod: "5,350.00", reservesEnding: "5,350.00",
  payable: "0.00", feesPayable: "0.00", clSubtotal: "0.00", liabilitiesTotal: "0.34",
  investments: "0.00", bank: "0.34", prepaid: "-0.00", receivable: "0.00", caSubtotal: "0.34", assetsTotal: "0.34",
};
const plPages = (f = PL, { extraIncome = [], drop = [] } = {}) => {
  const keep = (k, row) => (drop.includes(k) ? [] : [row]);
  const page1 = [
    ...head("PROFIT AND LOSS ACCOUNT", "From 01/04/2019 To 08/09/2026"),
    ...lines([
      "INCOME",
      ...keep("dividend", ["Dividend", f.dividend]), ...keep("otherIncome", ["Other Income", f.otherIncome]),
      ...keep("realized", ["Realized Gain/Loss", f.realized]), ...extraIncome, ["TOTAL", f.incomeTotal],
      "EXPENSES",
      ...keep("custodian", ["Custodian Fees", f.custodian]), ...keep("management", ["Management Fees", f.management]),
      ...keep("stt", ["Securities Transaction Tax (STT)", f.stt]), ...keep("otherExpenses", ["Other Expenses", f.otherExpenses]),
      ["TOTAL", f.expensesTotal],
      ["SURPLUS FOR THE PERIOD", f.surplus],
      "UNREALIZED GAIN/LOSS IN THE VALUE OF INVESTMENTS",
      ["At the end of the period", f.unrealizedEnd], ["At the beginning of the period", f.unrealizedBeginning],
      ["Net Unrealized Gain / Loss during the period", f.unrealizedNet], [null, "0.00"],
      "For Synthetic Investment Managers Limited",
    ]),
  ];
  const page2 = [
    ...head("BALANCE SHEET", "As of 08/09/2026"),
    ...lines([
      "LIABILITIES",
      ["Capital Contribution", f.contribution], ["Less : Withdrawals", f.withdrawals],
      ["Add : Reserves and Surplus", "- Beginning", f.reservesBeginning], [null, "- For the period", f.reservesPeriod], [null, "- Ending", f.reservesEnding],
      "Current liabilities and provisions",
      ["Payable against Purchases", f.payable], ["Management Fees - billed / payable", f.feesPayable], [null, f.clSubtotal],
      ["TOTAL", f.liabilitiesTotal],
      "ASSETS",
      ["Investments - At Cost", f.investments],
      "Current assets",
      ["Balance with Banks", f.bank], ["Pre-paid Taxes/Expenses", f.prepaid], ["Receivable against Sale", f.receivable], [null, f.caSubtotal],
      ["TOTAL", f.assetsTotal],
    ]),
  ];
  return [page1, page2];
};
const readPl = async (f = PL, opts = {}, docKey = "t-pl") => {
  const pages = await layout(makeMultiPagePdf(plPages(f, opts), { mediaBox: [0, 0, 595, 842], fontSize: 7 }));
  return extractPms({ grid: { pages }, meta: { ...ASK, docKey } });
};
const codes = (d) => (d.warnings ?? []).map((w) => w.code);
const detailOf = (d, code) => (d.warnings ?? []).filter((w) => w.code === code).map((w) => w.detail).join(" | ");

// 1a. It ties, so it reads.
{
  const d = await readPl();
  const f = d.flows ?? {};
  ok("P&L: an account whose every identity holds is read, with no warning", d.status === "ok" && codes(d).length === 0,
    `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("P&L: the window is the account's own — from 1 April 2019 to the balance sheet's date",
    f.periodFrom === "2019-04-01" && f.periodTo === "2026-09-08" && d.asOf === "2026-09-08",
    `${f.periodFrom}..${f.periodTo} as of ${d.asOf}`);
  ok("P&L: the identity is the statement's — account 9990001, its second number the client code",
    d.accountNo === "9990001" && d.clientCode === "0099999" && d.owner === "Test Holder",
    `${d.accountNo} / ${d.clientCode} / ${d.owner}`);
  ok("P&L: Capital Contribution and Withdrawals are the capital lines", f.contribution === 100000 && f.withdrawal === 105349.66,
    `${f.contribution} / ${f.withdrawal}`);
  ok("P&L: realised is the Realized Gain/Loss line", f.realized === 5000, `got ${f.realized}`);
  ok("P&L: income is dividend + other income", near(f.income, 1010), `got ${f.income}`);
  ok("P&L: fees are the management fees; expenses custodian + STT; other expenses their own line",
    f.fees === 500 && near(f.expenses, 150) && f.otherExpenses === 10, `${f.fees} / ${f.expenses} / ${f.otherExpenses}`);
  ok("P&L: the closing value is the balance sheet's assets less what it owes, plus the unrealised gain",
    near(f.corpus, 0.34), `got ${f.corpus}`);
  // The whole-life bridge, struck on the flows alone: nothing opens the
  // window, so contribution − withdrawal + every gain and charge is the close.
  const bridge = f.contribution - f.withdrawal + f.income + f.realized + f.unrealized - f.fees - f.expenses - f.otherExpenses;
  ok("P&L: its own flows close the account — contribution − withdrawal + gains − charges = the closing value",
    near(bridge, f.corpus), `bridge ${bridge} vs corpus ${f.corpus}`);
  const h = d.holdings ?? [];
  ok("P&L: the one holding is the bank balance, as the balance sheet names it",
    h.length === 1 && h[0].security === "Balance with Banks" && h[0].assetClass === "Cash" && h[0].quantity === 0.34,
    JSON.stringify(h.map((x) => [x.security, x.assetClass, x.quantity])));
  ok("P&L: …keyed on that name, never on `cash` — a closed mandate's speck must not join the book's cash sleeves",
    h[0]?.securityKey === "balance-with-banks", `got ${h[0]?.securityKey}`);
  ok("P&L: its value is its amount", h[0]?.printed?.marketValue === 0.34 && h[0]?.unitCost === 1 && h[0]?.marketPrice === 1,
    JSON.stringify(h[0]?.printed));
  ok("P&L: the account is kept on the audit sheet, line by line", Array.isArray(d.sections?.profitAndLoss?.rows)
    && d.sections.profitAndLoss.rows.length > 25, `got ${d.sections?.profitAndLoss?.rows?.length}`);
}

// 1b. EVERY IDENTITY IS LOAD-BEARING. One figure moved by a rupee — far outside
// the half-paisa-per-figure the statement prints to — and nothing is published,
// with the identity that broke named. A gate that let any of these through
// would publish a whole-life figure its own statement contradicts.
const BREAKS = [
  ["otherIncome", "11.00", "income lines = income TOTAL"],
  ["custodian", "101.00", "expense lines = expenses TOTAL"],
  ["surplus", "5,351.00", "income TOTAL − expenses TOTAL = SURPLUS FOR THE PERIOD"],
  ["unrealizedBeginning", "1.00", "unrealised: end − beginning = net"],
  ["reservesEnding", "5,351.00", "reserves: beginning + for the period = ending"],
  ["reservesPeriod", "5,351.00", "reserves for the period = SURPLUS FOR THE PERIOD"],
  ["payable", "1.00", "current liabilities = their subtotal"],
  ["withdrawals", "105,350.66", "contribution − withdrawals + reserves + current liabilities = liabilities TOTAL"],
  ["bank", "1.34", "current assets = their subtotal"],
  ["investments", "1.00", "investments + current assets = assets TOTAL"],
  ["liabilitiesTotal", "1.34", "liabilities TOTAL = assets TOTAL"],
];
for (const [field, value, identity] of BREAKS) {
  const d = await readPl({ ...PL, [field]: value }, {}, `t-pl-${field}`);
  ok(`P&L broken at ${field}: nothing is published — no flows, no holding`,
    d.flows === null && (d.holdings ?? []).length === 0 && d.status === "failed",
    `status ${d.status} flows ${JSON.stringify(d.flows)} holdings ${d.holdings?.length}`);
  ok(`P&L broken at ${field}: the refusal names "${identity}"`,
    codes(d).includes("profit-and-loss-does-not-tie") && detailOf(d, "profit-and-loss-does-not-tie").includes(identity),
    JSON.stringify(d.warnings));
}

// 1c. …AND THE GATE IS THE STATEMENT'S PRECISION, NOT TIGHTER. A figure printed
// to the paisa can sum a paisa off its total: the real statement does exactly
// this (Ajay's expense lines add to 8,387,957.88 under a printed TOTAL of
// 8,387,957.89). Half a paisa per figure the identity touches admits it; a gate
// fitted tighter would refuse a statement that is right.
{
  const d = await readPl({ ...PL, expensesTotal: "660.01" }, {}, "t-pl-paisa");
  ok("P&L: a paisa of rounding on a total printed to the paisa is not a refusal", d.status === "ok" && d.flows !== null,
    `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("P&L: …and the flows are struck on the LINES, not the rounded total", near(d.flows?.expenses, 150) && d.flows?.fees === 500,
    `expenses ${d.flows?.expenses} fees ${d.flows?.fees}`);
}

// 1d. A line this reader cannot account for is a refusal, not a skip — and so
// is a line printed twice. Either would leave the totals tying while a figure
// the reader does not understand sat inside them.
{
  const d = await readPl({ ...PL, incomeTotal: "6,110.00", surplus: "5,450.00", reservesPeriod: "5,450.00", reservesEnding: "5,450.00", withdrawals: "105,449.66" },
    { extraIncome: [["Interest on Deposits", "100.00"]] }, "t-pl-unknown");
  ok("P&L: an income line the reader does not know publishes nothing", d.flows === null && d.status === "failed", `status ${d.status}`);
  ok("P&L: …and the refusal names the line and where it sat",
    codes(d).includes("profit-and-loss-line-not-recognised") && /Interest on Deposits.*income/.test(detailOf(d, "profit-and-loss-line-not-recognised")),
    JSON.stringify(d.warnings));
}
{
  const d = await readPl({ ...PL, incomeTotal: "7,010.00", surplus: "6,350.00", reservesPeriod: "6,350.00", reservesEnding: "6,350.00", withdrawals: "106,349.66" },
    { extraIncome: [["Dividend", "1,000.00"]] }, "t-pl-twice");
  ok("P&L: a line printed twice publishes nothing, and says so",
    d.flows === null && /"Dividend" printed twice/.test(detailOf(d, "profit-and-loss-line-not-recognised")), JSON.stringify(d.warnings));
}

// 1e. A line missing is a refusal that names it — an account that cannot be
// closed is not published with the missing line read as nil.
{
  const d = await readPl(PL, { drop: ["otherExpenses"] }, "t-pl-missing");
  ok("P&L: a required line missing publishes nothing", d.flows === null && d.status === "failed", `status ${d.status}`);
  ok("P&L: …and the refusal names the missing line, never reading it as nil",
    codes(d).includes("profit-and-loss-line-missing") && /otherExpenses/.test(detailOf(d, "profit-and-loss-line-missing")),
    JSON.stringify(d.warnings));
}

// 1f. A BALANCE SHEET THAT IS NOT ONLY CASH: the flows stand, no holding is read.
// ₹100 of investments at cost, the contribution ₹100 higher, every identity
// still holding. The balance sheet states no holding line by line, so a holding
// read off it would be a security nobody named.
{
  const d = await readPl({ ...PL, investments: "100.00", assetsTotal: "100.34", liabilitiesTotal: "100.34", contribution: "100,100.00" }, {}, "t-pl-invested");
  ok("P&L not only cash: the flows stand", d.flows?.contribution === 100100 && near(d.flows?.corpus, 100.34),
    JSON.stringify(d.flows));
  ok("P&L not only cash: …and no holding is read off a balance sheet that names none", (d.holdings ?? []).length === 0,
    JSON.stringify(d.holdings));
  ok("P&L not only cash: …which is said, and the document is partial rather than ok",
    codes(d).includes("profit-and-loss-not-only-cash") && d.status === "partial", `status ${d.status} ${JSON.stringify(codes(d))}`);
}

// ── 2. MARATHON's DETAILS OF INCOME AND EXPENSES ────────────────────────────
// One row, for this account, dated the window's end. It states no capital and
// no closing value, so the flows carry neither: a nil there would be a claim
// the document never makes.
const MARATHON = { provider: "Marathon Trends Advisory Pvt Ltd", reportType: "income-expense", accountNo: "9990002", fileName: "x.pdf" };
const IE_X = [30, 90, 175, 240, 305, 370, 425, 480, 560, 640, 720];
const IE_HEAD = ["Client Code", "Client Name", "Date Until", "ST Gain/Loss", "LT Gain/Loss", "Dividend", "Interest", "Management Fees", "Custodian Fees", "Other Expenses", "STT"];
const ieRow = (y, cells) => cells.map((c, i) => [IE_X[i], y, c]);
const IE_TOP = [
  [30, 560, "SYNTHETIC TRENDS ADVISORY PVT LTD"],
  [30, 545, "DETAILS OF INCOME AND EXPENSES"],
  [30, 530, "From 01/04/2018 To 09/09/2026"],
  [30, 515, "Account : 9990002 Test Holder - 02TH20"],
];
const IE_GOOD = ["9990002", "Test Holder -", "09/09/2026", "-1,000.50", "200.00", "3,000.25", "10.00", "500.00", "20.00", "5.00", "75.00"];
const readIe = async (rows, docKey) => {
  const pages = await layout(makeGridPdf([...IE_TOP, ...ieRow(490, IE_HEAD), ...rows.flatMap((r, i) => ieRow(475 - i * 15, r))],
    { mediaBox: [0, 0, 842, 595], fontSize: 6.5 }));
  return extractPms({ grid: { pages }, meta: { ...MARATHON, docKey } });
};
{
  const d = await readIe([IE_GOOD], "t-ie");
  const f = d.flows ?? {};
  ok("income-expense: the one row is read, with no warning", d.status === "ok" && codes(d).length === 0, `status ${d.status} ${JSON.stringify(d.warnings)}`);
  ok("income-expense: realised is short-term + long-term", near(f.realized, -800.5), `got ${f.realized}`);
  ok("income-expense: income is dividend + interest", near(f.income, 3010.25), `got ${f.income}`);
  ok("income-expense: fees are the management fees; expenses custodian + STT; other expenses their own column",
    f.fees === 500 && near(f.expenses, 95) && f.otherExpenses === 5, `${f.fees} / ${f.expenses} / ${f.otherExpenses}`);
  ok("income-expense: it states no capital and no closing value, so neither is a nil",
    f.contribution === null && f.withdrawal === null && f.corpus === null && f.openingCorpus === null, JSON.stringify(f));
  ok("income-expense: the window is the statement's own", f.periodFrom === "2018-04-01" && f.periodTo === "2026-09-09",
    `${f.periodFrom}..${f.periodTo}`);
}
const IE_REFUSALS = [
  ["two data rows", [IE_GOOD, IE_GOOD], /2 data row\(s\) under the headings, not one/],
  ["a row for another client", [["9990003", ...IE_GOOD.slice(1)]], /another client code/],
  ["a row dated before the window's end", [[...IE_GOOD.slice(0, 2), "08/09/2026", ...IE_GOOD.slice(3)]], /dated 2026-09-08, not the window's end 2026-09-09/],
  ["a figure that is not a figure", [[...IE_GOOD.slice(0, 5), "n/a", ...IE_GOOD.slice(6)]], /dividend did not read as a figure/],
];
for (const [name, rows, re] of IE_REFUSALS) {
  const d = await readIe(rows, `t-ie-${name.replace(/\W+/g, "-")}`);
  ok(`income-expense, ${name}: nothing is read`, d.flows === null && d.status === "failed", `status ${d.status} ${JSON.stringify(d.flows)}`);
  ok(`income-expense, ${name}: the refusal says why`, re.test(detailOf(d, "income-expense-row-not-read")), JSON.stringify(d.warnings));
}

// ── 3. A FACT SHEET WHOSE PORTFOLIO VALUE IS NIL PRINTS NO HOLDINGS TABLE ───
// "No sector table" there is the statement being right — a closed mandate has
// nothing to list — and a warning would send the next reader looking for a
// table that was never printed. Anywhere else the warning stands.
for (const [value, expectWarning] of [["0.00", false], ["5,000.00", true]]) {
  const pages = await layout(makeGridPdf([
    [40, 560, "SYNTHETIC INVESTMENT MANAGERS LIMITED"], [40, 545, "PORTFOLIO FACT SHEET"], [40, 530, "As of 08/09/2026"],
    [40, 515, "Account: 9990001 - 0099999 - Test Holder"], [40, 490, "Portfolio Summary"],
    [40, 476, "Contribution"], [200, 476, "100,000"], [40, 462, "Withdrawal"], [200, 462, "105,350"],
    [40, 448, "Profit/Loss"], [200, 448, "5,350"], [40, 434, "Portfolio Value"], [200, 434, value],
  ], { mediaBox: [0, 0, 842, 595], fontSize: 6.5 }));
  const d = extractPms({ grid: { pages }, meta: { ...ASK, reportType: "fact-sheet", docKey: `t-fs-${value}` } });
  ok(`fact sheet, portfolio value ${value}: the corpus is read`, d.flows?.corpus === Number(value.replace(/,/g, "")), JSON.stringify(d.flows));
  ok(expectWarning
    ? "fact sheet with a value and no sector table: the missing table is still reported"
    : "fact sheet with a NIL value: no warning about a sector table a closed mandate never prints",
  codes(d).includes("sector-table-not-found") === expectWarning, JSON.stringify(codes(d)));
}

// ── 4. ROWS ON THE TAPE THAT ARE NOT TRADES, AND THE BUYBACK THAT IS ONE ────
// A TDS transfer moves cash between the account's own ledgers; a `Security out`
// moves units with no consideration. Neither is a trade, and each kind is named
// ONCE with its count rather than row by row. A buyback is a SALE to the
// company — tested before "buy", or it reads as a purchase.
{
  const X = { desc: 36, tran: 155, settle: 200, sec: 241, exchg: 503, qty: 555, price: 618, brkg: 683, stt: 728, amount: 757 };
  const header = [
    [X.desc, 497, "Transaction Description"], [X.tran, 497, "Tran Date"], [X.settle, 497, "Settlement"],
    [X.sec, 497, "Security"], [X.exchg, 497, "Exchg"], [569, 497, "Quantity"], [617, 497, "Unit Price"],
    [X.brkg, 497, "Brkg."], [X.stt, 497, "STT"], [745, 497, "Settlement Amount"], [210, 488, "Date"],
  ];
  const row = (y, t) => [
    [X.desc, y, t.desc], [X.tran - 9, y, t.date], [X.settle - 4, y, t.date], [X.sec, y, t.sec],
    ...(t.exchg ? [[X.exchg + 2, y, t.exchg]] : []),
    [X.qty, y, t.qty], [X.price, y, t.price], [X.brkg + 2, y, t.brkg ?? "0.00"], [X.stt, y, t.stt ?? "0.00"], [X.amount, y, t.amount],
  ];
  const TDS = { sec: "Tax Deducted at Source", price: "1.0000" };
  const pages = await layout(makeGridPdf([
    [35, 560, "Transaction Statement"], [35, 545, "Account : 9990001 0099999 - Test Holder"], [35, 515, "From 01/04/2019 to 08/09/2026"],
    ...header, [X.desc, 468, "Shares - Listed"],
    ...row(452, { desc: "Buy", date: "02/04/2021", sec: "TATA CONSULTANCY SERVICES LTD.", exchg: "NSE", qty: "100", price: "3,100.0000", brkg: "1.5500", stt: "310.00", amount: "3,10,465.00" }),
    ...row(439, { desc: "Buy Back", date: "30/03/2022", sec: "TATA CONSULTANCY SERVICES LTD.", exchg: "BSE", qty: "35", price: "4,500.0000", brkg: "0.0000", amount: "1,57,500.00" }),
    ...row(426, { desc: "Trf to TDS A/c", date: "15/06/2022", ...TDS, qty: "1,234.00", amount: "1,234.00" }),
    ...row(413, { desc: "TDS Trf to Capital A/c", date: "16/06/2022", ...TDS, qty: "1,234.00", amount: "1,234.00" }),
    ...row(400, { desc: "Trf to TDS A/c", date: "20/07/2022", ...TDS, qty: "500.00", amount: "500.00" }),
    ...row(387, { desc: "Security out", date: "06/01/2025", sec: "ITC LTD.", qty: "100", price: "0.0000", amount: "0.00" }),
  ], { mediaBox: [0, 0, 842, 595], fontSize: 6.5 }));
  const d = extractPms({ grid: { pages }, meta: { ...ASK, reportType: "transaction-statement", docKey: "t-tape" } });
  const t = d.transactions ?? [];
  ok("tape: only the two trades are emitted — no TDS transfer and no unit movement", t.length === 2,
    JSON.stringify(t.map((x) => [x.date, x.side, x.security])));
  ok("tape: a buyback is a SALE, and keeps the statement's own word",
    t[1]?.side === "sell" && t[1]?.description === "Buy Back" && t[1]?.quantity === 35, JSON.stringify(t[1]));
  ok("tape: an ordinary buy stays a buy, with no description", t[0]?.side === "buy" && t[0]?.description === null, JSON.stringify(t[0]));
  ok("tape: the TDS transfers are named ONCE, with their count and their own wording",
    codes(d).filter((c) => c === "tds-transfers-are-not-trades").length === 1
      && /^3 TDS transfer row\(s\) \(2 × "Trf to TDS A\/c", 1 × "TDS Trf to Capital A\/c"\)/.test(detailOf(d, "tds-transfers-are-not-trades")),
    detailOf(d, "tds-transfers-are-not-trades"));
  ok("tape: the unit movement is named once, with its count",
    /^1 unit movement row\(s\) \(1 × "Security out"\)/.test(detailOf(d, "unit-movements-are-not-trades")),
    detailOf(d, "unit-movements-are-not-trades"));
  ok("tape: none of them is reported as a row whose side is unknown", !codes(d).includes("transaction-side-unknown"),
    JSON.stringify(codes(d)));
}

// ── 5. THE RECONCILER: TWO WHOLE-LIFE WINDOWS ARE ONE WINDOW ────────────────
// ASK's P&L runs from 1 April 2019 and its capital gain statement from the
// mandate's own inception: different strings, one measurement, because nothing
// was realised before the account existed. A financial-year figure is still a
// different measurement and is still never compared.
{
  const base = { provider: "ASK Investment Managers Limited", accountNo: "9990001", sourcePath: "x.pdf", status: "ok" };
  const lots = (from, docKey) => makeDocument({
    ...base, docKey, reportType: "capital-gain", asOf: "2026-09-08", periodFrom: from, periodTo: "2026-09-08",
    capitalGains: [
      makeCapitalGain({ security: "A LTD.", shortTerm: 100, longTerm: null }),
      makeCapitalGain({ security: "B LTD.", shortTerm: null, longTerm: 200.25 }),
    ],
  });
  const statement = (from, realized, docKey) => makeDocument({
    ...base, docKey, reportType: "profit-and-loss", asOf: "2026-09-08", periodFrom: from, periodTo: "2026-09-08",
    flows: makeFlows({ realized, periodFrom: from, periodTo: "2026-09-08", source: docKey }),
  });
  const factSheet = makeDocument({ ...base, docKey: "t-fs", reportType: "fact-sheet", asOf: "2026-09-08", inceptionDate: "2019-07-26" });
  const checks = (docs) => reconcile(docs).datedTableChecks.filter((c) => c.check === "realised gain: lots vs statement");

  const whole = checks([lots("2019-07-26", "t-cg"), statement("2019-04-01", 300.25, "t-pl"), factSheet]);
  ok("reconcile: lots since inception are held to a P&L that opens before it", whole.length === 1, JSON.stringify(whole));
  ok("reconcile: …and they agree, under a key that says both windows",
    whole[0]?.severity === "ok" && /whole life; statement 2019-04-01\.\.2026-09-08/.test(whole[0]?.row ?? ""), JSON.stringify(whole[0]));

  const wrong = checks([lots("2019-07-26", "t-cg"), statement("2019-04-01", 310.25, "t-pl"), factSheet]);
  ok("reconcile: a whole-life statement the lots do not reach is a material delta, not a skip",
    wrong.length === 1 && wrong[0].severity === "material" && wrong[0].delta === -10, JSON.stringify(wrong));

  const fy = checks([lots("2019-07-26", "t-cg"), statement("2026-04-01", 300.25, "t-pl"), factSheet]);
  ok("reconcile: a financial-year statement is never compared with lots since inception", fy.length === 0, JSON.stringify(fy));

  const noInception = checks([lots("2019-07-26", "t-cg"), statement("2019-04-01", 300.25, "t-pl")]);
  ok("reconcile: with no inception printed anywhere, two different windows stay different", noInception.length === 0,
    JSON.stringify(noInception));

  const same = checks([lots("2019-07-26", "t-cg"), statement("2019-07-26", 300.25, "t-pl"), factSheet]);
  ok("reconcile: identical windows are matched as they always were, with no whole-life note",
    same.length === 1 && same[0].row === "9990001 2019-07-26..2026-09-08", JSON.stringify(same));
}

// ── 6. PRECEDENCE: WHICH DOCUMENT SUPPLIES WHAT ─────────────────────────────
// A provider the pipeline can read but precedence does not name contributes
// nothing, silently — eight accounts once sat at ₹0 that way. So each block is
// asserted, and so is what is deliberately NOT named.
{
  const askHoldings = sourceFor("ASK Investment Managers Limited", "holdings");
  ok("precedence: ASK's holdings are its P&L balance sheet", JSON.stringify(askHoldings?.reportTypes) === '["profit-and-loss"]',
    JSON.stringify(askHoldings));
  ok("precedence: ASK's bank book is its cash flows", sourceFor("ASK Investment Managers Limited", "cashFlows")?.reportTypes?.[0] === "bank-book");
  ok("precedence: ASK's realised gain is the P&L's", sourceFor("ASK Investment Managers Limited", "realized")?.reportTypes?.[0] === "profit-and-loss");
  ok("precedence: Marathon names NO holdings source — its value is absent with a reason, never read off a tape",
    sourceFor("Marathon Trends Advisory Pvt Ltd", "holdings") === null, JSON.stringify(sourceFor("Marathon Trends Advisory Pvt Ltd", "holdings")));
  ok("precedence: Marathon's realised gain and income are the income-and-expense statement's",
    sourceFor("Marathon Trends Advisory Pvt Ltd", "realized")?.reportTypes?.[0] === "income-expense"
      && sourceFor("Marathon Trends Advisory Pvt Ltd", "income")?.reportTypes?.[0] === "income-expense");
  ok("precedence: the ASK Absolute Return Fund — a different issuer — has a block of its own",
    !!PRECEDENCE["ASK Absolute Return Fund"] && sourceFor("ASK Absolute Return Fund", "holdings") !== null);
  const buoyant = sourceFor("Buoyant Capital", "holdings");
  ok("precedence: Buoyant's holdings are the NEWER of its appraisal and its portfolio snap",
    buoyant?.newestWins === true && JSON.stringify(buoyant?.reportTypes) === '["appraisal","portfolio-snap"]', JSON.stringify(buoyant));
  const newest = Object.keys(PRECEDENCE).flatMap((p) => Object.keys(PRECEDENCE[p]).filter((f) => sourceFor(p, f)?.newestWins).map((f) => `${p}/${f}`));
  ok("precedence: newestWins is set on Buoyant's holdings and nowhere else", JSON.stringify(newest) === '["Buoyant Capital/holdings"]',
    JSON.stringify(newest));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
