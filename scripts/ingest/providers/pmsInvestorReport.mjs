// The SEBI-mandated PMS INVESTOR REPORT — one prescribed layout, several houses.
//
// A different document from the house statement sets in `pmsStatements.mjs`.
// Those managers publish a dozen separate reports through one vendor's engine;
// this is ONE statement carrying everything, in the shape the regulator lays
// down:
//
//   Account overview + Portfolio Allocation (Shares / Mutual Funds / Cash)
//   Portfolio Summary — the value bridge, opening to closing
//   Transaction Details (i)  Capital Contribution, SINCE INCEPTION, dated
//   Transaction Details (ii) Investments DURING THE PERIOD, dated
//   Holding Report — quantity, average cost, market rate, total cost, value
//   Performance — TWRR over 1Y/3Y/5Y/10Y/since, and XIRR
//
// TWO ISSUERS IN THIS DROP, AND FINDING THE SECOND IS WHY THIS FILE IS KEYED ON
// THE REPORT TYPE RATHER THAN THE MANAGER. SVAN issues it monthly. Green Lantern
// issues it quarterly, as pages 1–8 of a fifteen-page bundle whose file name says
// ContractNote — which is how ₹11.69 Cr of holdings, the account's own value
// bridge and its entire capital-contribution history sat in `source/` reported as
// "no reader" while this reader was already written and calibrated.
//
// WHY THE HOLDING REPORT IS THE SOURCE AND THE ALLOCATION TABLE IS THE CHECK.
// The allocation table prints Shares / Mutual Funds / Cash as three lines; the
// holding report prints every position and its own subtotals. Both are on the
// same basis and they agree, so the detailed table supplies the primitives and
// the allocation table cross-checks the sum. Taking the summary instead would
// give a correct total and no holdings at all.
//
// TWO PERIODS ON ONE PAGE, AND THEY ARE NOT THE SAME WINDOW.
// "Capital Contribution (from inception till end of reporting period)" runs from
// account opening; "Investments (during the reporting period)" runs one period.
// Both are carried with their own window — comparing a since-inception
// contribution against a one-period trade total is the mistake `periodFrom` /
// `periodTo` exist to prevent.
//
// THE RETURNS ARE TWRR AND ARE LABELLED AS SUCH. Three series — the client's
// portfolio, the aggregate investment approach, and the benchmark — over
// 1Y / 3Y / 5Y / 10Y / since inception, plus a separate XIRR block. They are
// different measurements of different things and are kept apart: the approach's
// return is not this client's, and the report says so itself.
import { parseNum } from "../lib/parseNum.mjs";
import {
  makeHolding, makeTotals, makeFlows, makeReturnSeries, makeTransaction, makeCashFlow,
} from "../lib/document.mjs";
import { toIso, trimPersonName } from "../lib/classify.mjs";

/** This reader is dispatched on the REPORT TYPE, not the provider. */
export const REPORT_TYPE = "investor-report";

/**
 * The issuer, read off the letterhead.
 *
 * Every house that publishes this report already exists in this repo's provider
 * vocabulary, and the name must match the one the rest of the pipeline uses
 * CHARACTER FOR CHARACTER — precedence blocks, the account registry and the
 * reconciler's cross-report join all key on it. A near-miss spelling resolves to
 * no precedence at all, which is exactly how "GoldStandard" once disabled a
 * whole precedence table without erroring.
 */
const ISSUERS = [
  [/SVAN\s+INVESTMENT\s+MANAGERS/i, "SVAN Investment Managers LLP"],
  [/GREEN\s+LANTERN\s+CAPITAL/i, "Green Lantern Capital LLP"],
  [/GOLDSTANDARD\s+WEALTH/i, "Goldstandard Wealth Private Limited"],
  [/CARNELIAN\s+ASSET\s+MANAGEMENT/i, "Carnelian Asset Management and Advisors Pvt Ltd"],
  [/V\.?\s*E\.?\s*C\s+ASSAGO/i, "V.E.C Assago Capital Management LLP"],
  [/MOLECULE\s+VENTURES/i, "Molecule Ventures LLP"],
];

const warn = (warnings, code, detail) => warnings.push({ code, detail });
const num = (s) => parseNum(s);

/** `Account : 8710067 AJAY T JAISINGHANI - SVC067` */
const ACCOUNT = /Account\s*:?\s*(\d{4,})\s+([A-Z][A-Za-z .']+?)\s*-\s*([A-Z]{2,6}\d{2,})/;

/** `From 01/06/2026 To 30/06/2026` */
const PERIOD = /From\s+(\d{2}\/\d{2}\/\d{4})\s+To\s+(\d{2}\/\d{2}\/\d{4})/;

/**
 * One holding line of the Holding Report:
 *   `Arvind Fashions Ltd 9,360.00 455.72 470.95 4,265,533.95 4,408,092.00 2.76`
 *
 * Six figures, in that order, after a name. Anchored on the six-figure tail so a
 * section heading ("Shares", "Cash / Bank") and the subtotal lines — which carry
 * only two or three figures — cannot match.
 */
const HOLDING_ROW = new RegExp(
  String.raw`([A-Za-z][A-Za-z0-9 .,&'’\-()/]*?)\s+` +   // 1 security
  String.raw`([\d,]+\.\d{2,})\s+` +                     // 2 quantity
  String.raw`([\d,]+\.\d{2,})\s+` +                     // 3 average cost
  String.raw`([\d,]+\.\d{2,})\s+` +                     // 4 market rate
  String.raw`([\d,]+\.\d{2,})\s+` +                     // 5 total cost
  String.raw`([\d,]+\.\d{2,})\s+` +                     // 6 market value
  String.raw`([\d,]+\.\d{1,2})(?=\s|$)`,                // 7 % to portfolio
  "g",
);

/**
 * One trade of the Investments table:
 *   `GLAND PHARMA LIMITED 09/06/2026 Buy 1,300.00 2,289.94 2,293.61 2,981,690.92`
 *
 * `Net Rate` is the gross rate PLUS every charge the contract note carries — the
 * report says so in its own footnote. So net value = net rate × quantity, and
 * brokerage is the difference between the two rates; neither is re-derived here.
 */
const TRADE_ROW = new RegExp(
  String.raw`([A-Za-z][A-Za-z0-9 .,&'’\-()/]*?)\s+` +   // 1 security
  String.raw`(\d{2}\/\d{2}\/\d{4})\s+` +                // 2 date
  String.raw`(Buy|Sell)\s+` +                           // 3 side
  String.raw`([\d,]+\.\d{2})\s+` +                      // 4 quantity
  String.raw`([\d,]+\.\d{2})\s+` +                      // 5 gross rate
  String.raw`([\d,]+\.\d{2})\s+` +                      // 6 net rate
  String.raw`([\d,]+\.\d{2})(?=\s|$)`,                  // 7 net value
  "g",
);

/** `03/09/2024 50,000,000.00 0.00` — dated capital inflow / outflow. */
const CAPITAL_ROW = /(\d{2}\/\d{2}\/\d{4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?=\s|$)/g;

/** A labelled figure from the Portfolio Summary: `1. Capital Inflow 0.00`. */
function labelled(text, label) {
  const m = new RegExp(String.raw`(?:\d{1,2}\.\s*)?` + label + String.raw`\s+\(?(-?[\d,]+\.?\d*)\)?`, "i").exec(text);
  return m ? num(m[1]) : null;
}

/**
 * A row of period returns: `Returns of Client Portfolio 3.68 4.42`.
 *
 * EVERY VALUE MUST CARRY A DECIMAL POINT. SVAN prints returns to two places
 * without exception, and the benchmark's label has the index's NAME wrapped
 * around its figures:
 *
 *   Benchmark Performance(S&P BSE 500 Total Return -1.96 -1.31 Index)
 *
 * A pattern that accepts bare integers reads the 500 out of "BSE 500" and
 * reports the benchmark's one-year return as +500%. Requiring the decimal point
 * excludes the name and keeps the two real figures.
 */
const RETURN_VALUE = /-?\d+\.\d+/g;

function returnRow(text, label) {
  const line = new RegExp(label + String.raw`[^\n]*`, "i").exec(text);
  if (!line) return [];
  return (line[0].match(RETURN_VALUE) ?? []).map((v) => num(v)).filter((v) => v !== null).slice(0, 5);
}

export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const flat = pages.map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");

  // ── identity ──────────────────────────────────────────────────────────────
  // The issuer comes off the letterhead. `meta.provider` is the classifier's
  // reading of the same text and is used only as the fallback, so a house this
  // list does not name is reported rather than silently attributed.
  const issuer = ISSUERS.find(([re]) => re.test(flat))?.[1] ?? meta.provider ?? null;
  if (!issuer) warn(warnings, "issuer-not-read", "no known PMS letterhead on a PMS INVESTOR REPORT");

  const acct = ACCOUNT.exec(flat);
  const accountNo = acct ? acct[1] : null;
  const owner = acct ? trimPersonName(acct[2]) : null;
  const clientCode = acct ? acct[3] : null;
  const pan = (/\bPAN\s+([A-Z]{5}\d{4}[A-Z])\b/.exec(flat) || [])[1] || null;
  const period = PERIOD.exec(flat);
  const periodFrom = period ? toIso(period[1]) : null;
  const periodTo = period ? toIso(period[2]) : null;
  // The report's own "as of": the Holding Report's date, which is the period end.
  const asOf = toIso((/Holding Report as of\s+(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1]) ?? periodTo;
  const strategy = (/Investment approach for the account\s+(.+?)(?=\s+Benchmark|\n)/i.exec(flat) || [])[1]?.trim() ?? null;
  const benchmark = (/Benchmark for the investment approach\s+(.+?)(?=\s+Amount managed|\n)/i.exec(flat) || [])[1]?.trim() ?? null;
  const inceptionDate = toIso((/Account Activation date\s+(\d{2}\/\d{2}\/\d{4})/i.exec(flat) || [])[1]);
  const providerEngagement = (/Type of Portfolio Management Service\s+([A-Za-z\- ]+?)(?=\s+Investment approach|\n)/i.exec(flat) || [])[1]?.trim() ?? null;

  if (!accountNo) warn(warnings, "account-not-read", "no `Account : <no> <name> - <code>` header matched");
  if (!pan) warn(warnings, "pan-not-read", "no PAN on the account overview — identity cannot be joined on PAN");

  // ── holdings ──────────────────────────────────────────────────────────────
  // The Holding Report is split into `Shares`, `Mutual Funds` and `Cash / Bank`;
  // the section a row belongs to is whichever heading was seen most recently,
  // which is how the cash line gets its asset class without matching on its NAME.
  const holdings = [];
  let section = null;
  for (const line of flat.split("\n")) {
    const t = line.trim();
    if (/^Shares\b/i.test(t)) section = "Equity";
    else if (/^Mutual\s+Funds?\b/i.test(t)) section = "Mutual Fund";
    else if (/^Cash\s*\/\s*Bank\b/i.test(t)) section = "Cash";
    HOLDING_ROW.lastIndex = 0;
    for (const m of t.matchAll(HOLDING_ROW)) {
      const [, nameRaw, qty, avgCost, rate, totalCost, marketValue, pct] = m;
      const name = nameRaw.replace(/^(?:Shares|Mutual\s+Funds?|Cash\s*\/\s*Bank)\s+/i, "").trim();
      // ONLY "Total" is skipped. "Cash" is a REAL HOLDING here — SVAN prints it
      // as `Cash 7,922,325.19 1.00 0.00 7,922,325.19 7,922,325.19 4.95`, a line
      // with a quantity and a value like any other. Skipping it by name dropped
      // ₹79 L from Ajay's account and ₹41 L from Bharat's, and the holdings then
      // summed to the equity subtotal instead of the portfolio total. A section
      // HEADING cannot reach here anyway: this pattern needs six figures and a
      // heading has none.
      if (!name || /^total$/i.test(name)) continue;
      const isCash = section === "Cash" || /^cash\b/i.test(name);
      const quantity = num(qty);
      const marketRate = num(rate);
      const printedValue = num(marketValue);

      /**
       * CASH HAS NO PRICE, AND THE STATEMENT PRINTS 0.00 IN THE PRICE COLUMN.
       *
       * `Cash 7,922,325.19 1.00 0.00 7,922,325.19 7,922,325.19` — quantity is
       * the rupee amount, Market Rate is 0.00. Taken as a price, value = rate x
       * quantity = ZERO, and ₹79 L vanishes from a holdings sum that then
       * disagrees with the report's own total by exactly the cash balance.
       *
       * A zero in a price column for an instrument that has no price is not a
       * measurement, so the price is left ABSENT and `deriveHolding` adopts the
       * printed value and flags it `marketValueFromPrinted` — the same path the
       * 360 ONE AIF units take, for the same reason.
       */
      const priceIsMeaningful = !isCash && marketRate !== null && marketRate !== 0;

      /**
       * THE MARKET VALUE COLUMN IS INCOME-INCLUSIVE ON ROWS CARRYING ACCRUALS.
       *
       * Four rows on Ajay's June report print more than rate x quantity:
       * GHCL by ₹12.00 a share, GHCL Textiles by ₹0.60, Shankara Buildpro by
       * ₹5.00, Vaibhav Global by ₹1.50 — declared dividends, accrued and not yet
       * received. The residual is carried as `accruedIncome`, which is what the
       * PMS appraisals already do, so market value stays price x quantity on one
       * consistent basis across the whole book.
       *
       * This is NOT inferred from the amounts looking like dividends. The report
       * states the accrual balance itself: page 2 prints `Change in accruals`,
       * and on both accounts the prior month's residual plus that change equals
       * this month's residual to the paisa — 9,860.00 + 107,170.00 = 117,030.00
       * on 8710067, and 6,400.00 + 69,920.50 = 76,320.50 on 8710090. The
       * following month then prints the same figure again as `Dividend Income`,
       * received. `accrualCheck` below carries the statement's own figure so the
       * reconciler can hold the derivation to it.
       */
      const derivedValue = priceIsMeaningful && quantity !== null
        ? Math.round(marketRate * quantity * 100) / 100
        : null;
      const residual = derivedValue !== null && printedValue !== null
        ? Math.round((printedValue - derivedValue) * 100) / 100
        : null;

      /**
       * A RESIDUAL SMALLER THAN THE PRICE'S OWN ROUNDING IS NOT INCOME.
       *
       * Green Lantern's liquid-fund sweep is 1.98 units at a printed 3,121.44,
       * which derives 6,180.45 against a printed 6,180.46. One paisa, and it is
       * the rate's last digit, not a declared dividend. Booking it as accrued
       * income would put a fabricated ₹0.01 of receivable in the book and — worse
       * — hand the reconciler a "cause" for a delta that has a different cause.
       *
       * The floor is half the rate's last printed digit times the quantity, taken
       * from how the rate was actually printed on this row rather than assumed.
       */
      const rateDecimals = (rate.split(".")[1] ?? "").length;
      const roundingFloor = quantity !== null ? 0.5 * 10 ** -rateDecimals * Math.abs(quantity) : 0;
      const accrued = residual !== null && residual > roundingFloor
        ? Math.round(residual * 100) / 100
        : null;

      holdings.push(makeHolding({
        security: name,
        assetClass: isCash ? "Cash" : section === "Mutual Fund" ? "Mutual Fund" : "Equity",
        quantity,
        unitCost: num(avgCost),
        totalCost: num(totalCost),
        marketPrice: priceIsMeaningful ? marketRate : null,
        // A NEGATIVE residual would mean the printed value is BELOW price x
        // quantity, which no accrual can cause; that is a disagreement and is
        // left for the reconciler to report as one rather than booked as income.
        accruedIncome: accrued,
        // Printed cross-checks; deriveHolding recomputes value from rate x qty.
        marketValue: printedValue,
        pctAssets: num(pct),
        source,
      }));
    }
  }
  if (!holdings.length) warn(warnings, "holdings-not-read", "no row matched the Holding Report's seven-column shape");

  // ── the allocation table, as the CHECK on the holdings sum ────────────────
  //
  // `Shares 98,943,579.34 112,998,541.36 96.65%` — one line per security type,
  // read by NAME so a report carrying only two of the three types still lands
  // each figure in the right field.
  const allocLine = (label) => {
    const m = new RegExp(label + String.raw`\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d.]+)%`, "i").exec(flat);
    return m ? { cost: num(m[1]), value: num(m[2]), pct: num(m[3]) } : null;
  };
  const allocShares = allocLine("Shares");
  const allocFunds = allocLine(String.raw`Mutual\s+Funds?`);
  const allocCash = allocLine(String.raw`Cash\s*\/\s*Bank`);
  const allocTotal = allocLine("Total");

  /**
   * NON-CASH market value is shares PLUS mutual funds, because that is the set
   * the reconciler's "equity market value" check sums. Green Lantern's sweep
   * into Axis Liquid Fund is 0.01% of the account and putting the Shares
   * subtotal alone in this field would report a ₹6,180 break on every run —
   * a mismatch manufactured by comparing two different collections.
   */
  const nonCashValue = allocShares || allocFunds
    ? Math.round(((allocShares?.value ?? 0) + (allocFunds?.value ?? 0)) * 100) / 100
    : null;

  /**
   * A SECTION THAT PRINTS ITS SUBTOTAL AND NOT ITS ROWS.
   *
   * Green Lantern's quarterly report does exactly this for Shares: page 7 shows
   * the `Shares` heading, then straight to `98,943,579.34 112,998,541.36 96.65`
   * with not one security between them. The per-security detail is in that
   * manager's portfolio appraisal, which precedence already names authoritative.
   *
   * Two rows DO print here (the liquid-fund sweep and cash), so nothing warns on
   * its own and the document would report 2 holdings worth ₹39 L for an account
   * holding ₹11.69 Cr. Naming the gap is the whole job: the count of rows read
   * is compared against the section subtotals the report itself prints, and any
   * section that carried a value but no rows is recorded.
   */
  const readValue = (cls) => holdings
    .filter((h) => (cls === "Cash" ? h.assetClass === "Cash" : h.assetClass === cls))
    .reduce((t, h) => t + (h.printed?.marketValue ?? 0), 0);
  const sectionsWithoutRows = [];
  for (const [label, alloc, cls] of [
    ["Shares", allocShares, "Equity"],
    ["Mutual Funds", allocFunds, "Mutual Fund"],
    ["Cash / Bank", allocCash, "Cash"],
  ]) {
    if (alloc?.value && !readValue(cls)) sectionsWithoutRows.push({ section: label, printedValue: alloc.value });
  }
  for (const s of sectionsWithoutRows) {
    warn(warnings, "section-rows-not-printed",
      `the ${s.section} section prints its subtotal (${s.printedValue.toLocaleString("en-IN")}) and no per-security rows; those holdings are not in this document and must come from another report for this account`);
  }

  const totals = makeTotals({
    totalMarketValue: allocTotal?.value ?? null,
    totalCost: allocTotal?.cost ?? null,
    equityMarketValue: nonCashValue,
    equityCost: allocShares || allocFunds
      ? Math.round(((allocShares?.cost ?? 0) + (allocFunds?.cost ?? 0)) * 100) / 100
      : null,
    cashValue: allocCash?.value ?? null,
    positionCount: holdings.length,
    source,
  });

  // ── the value bridge ──────────────────────────────────────────────────────
  const flows = makeFlows({
    openingCorpus: labelled(flat, "Portfolio Value at the beginning"),
    corpus: labelled(flat, "Portfolio Value at the end"),
    contribution: labelled(flat, "Capital Inflow"),
    withdrawal: labelled(flat, "Capital Outflow"),
    income: labelled(flat, "Dividend Income"),
    realized: labelled(flat, "Realized Gain\\s*\\/?\\s*Loss"),
    unrealized: labelled(flat, "Unrealized Gain\\s*\\/?\\s*Loss"),
    fees: labelled(flat, "Management Fee"),
    expenses: labelled(flat, "Expenses at actual"),
    periodFrom, periodTo,
    source,
  });

  // ── returns: three series, never folded together ──────────────────────────
  // SVAN prints 1Y / 3Y / 5Y / 10Y / Since Inception. This book's accounts are
  // young, so only the first columns carry figures — the rest are blank and stay
  // null rather than becoming zero.
  const series = [];
  const push = (name, values, isBenchmark) => {
    if (!values.length) return;
    const [y1, y3, y5, y10, si] = values;
    series.push(makeReturnSeries({
      series: name, isBenchmark,
      y1: y1 ?? null, y3: y3 ?? null, y5: y5 ?? null, y10: y10 ?? null, si: si ?? null,
      basis: "TWRR",
      source,
    }));
  };
  push("Client portfolio", returnRow(flat, "Returns of Client Portfolio"), false);
  push("Investment approach", returnRow(flat, "Aggregate Returns of Investment Approach"), false);
  push(benchmark || "Benchmark", returnRow(flat, "Benchmark Performance"), true);
  const clientXirr = labelled(flat, "XIRR of the client portfolio");

  // ── dated rows ────────────────────────────────────────────────────────────
  const transactions = [];
  for (const m of flat.matchAll(TRADE_ROW)) {
    const [, name, dateRaw, side, qty, grossRate, netRate, netValue] = m;
    // FIELD NAMES ARE THE CONTRACT'S, not this report's. `unitPrice` is the
    // gross rate; `settlementAmount` is the printed net value, kept as the
    // check the reconciler runs against.
    //
    // SVAN's own footnote: "Net Rate includes brokerage, stamp duty, tax and any
    // charge customarily included in the contract note of broker, STT etc." So
    // the per-unit charge is (net rate − gross rate) — a RATE, exactly as the
    // other PMS transaction statements print brokerage. Recorded as a rate;
    // reading the difference as an amount would understate every trade by its
    // own charges times its own quantity.
    const gross = num(grossRate);
    const net = num(netRate);
    transactions.push(makeTransaction({
      date: toIso(dateRaw),
      security: name.trim(),
      side: side === "Buy" ? "buy" : "sell",
      quantity: num(qty),
      unitPrice: gross,
      // Rounded to the precision the rates are printed at plus two, so binary
      // floating point does not turn a 3.67 charge into 3.6700000000000728.
      brokerageRate: gross !== null && net !== null ? Math.round(Math.abs(net - gross) * 1e4) / 1e4 : null,
      settlementAmount: num(netValue),
      /**
       * BOTH RATES ARE PRINTED TO TWO DECIMALS AND THE VALUE IS NOT STRUCK ON
       * THEM. Gland Pharma: 1,300 x 2,293.61 = 2,981,693 against a printed
       * 2,981,690.92 — the manager settled on an unrounded net rate of
       * 2,293.6084 and printed it rounded.
       *
       * So a settlement derived from the printed rates can only agree to within
       * half a paisa per unit, and the reconciler is told the precision rather
       * than given a wider blanket tolerance: the house transaction statements
       * print four decimals and still tie to the rupee, and a tolerance loose
       * enough for this report would stop catching a real break on those.
       */
      ratePrecision: 2,
      assetClass: "Equity",
      source,
    }));
  }

  // Capital contributions run SINCE INCEPTION, not over the reporting month.
  const capital = [];
  const capSection = /\(i\)\s*Capital Contribution[\s\S]*?(?=\(ii\)|$)/i.exec(flat);
  if (capSection) {
    for (const m of capSection[0].matchAll(CAPITAL_ROW)) {
      const [, dateRaw, inflow, outflow] = m;
      const inAmt = num(inflow) ?? 0;
      const outAmt = num(outflow) ?? 0;
      if (!inAmt && !outAmt) continue;
      capital.push(makeCashFlow({
        date: toIso(dateRaw),
        description: inAmt ? "Capital inflow" : "Capital outflow",
        kind: inAmt ? "contribution" : "withdrawal",
        // Signed as the family experiences it: money in is positive, money out
        // negative. The statement prints both as unsigned columns.
        amount: inAmt ? inAmt : -outAmt,
        source,
      }));
    }
  }
  if (!capital.length) warn(warnings, "capital-contributions-not-read", "no dated row matched under `(i) Capital Contribution`");

  const sheetRows = (name, header, rows) => ({ name, rows: [header, ...rows] });

  /**
   * THE ACCRUAL BALANCE, AS THE REPORT'S OWN CHECK ON THE ACCRUED INCOME THIS
   * READER DERIVED.
   *
   * The Portfolio Summary prints `Change in accruals` — the MOVEMENT over the
   * period, not the balance. The balance is what the holding rows carry as the
   * excess of printed market value over rate x quantity, and the two tie: the
   * previous statement's balance plus this statement's change equals this
   * statement's balance, on every account and every month in this drop. Carried
   * so the reconciler can check it across statements rather than this reader
   * asserting it.
   */
  const accrualBalance = Math.round(
    holdings.reduce((t, h) => t + (h.accruedIncome ?? 0), 0) * 100,
  ) / 100;

  return {
    provider: issuer,
    accountNo,
    clientCode,
    owner,
    pan,
    asOf,
    periodFrom, periodTo,
    inceptionDate,
    strategy,
    engagement: "PMS",
    providerEngagement,
    holdings,
    totals,
    flows,
    returns: series,
    clientXirrPct: clientXirr,
    transactions,
    // Capital movements are the XIRR input; they are cash flows, not trades.
    cashFlows: capital,
    accrual: { balance: accrualBalance, change: labelled(flat, "Change in accruals") },
    /** Sections whose subtotal printed with no rows beneath it — see above. */
    sectionsWithoutRows,
    sections: {
      holdings: sheetRows("holdings",
        ["security", "assetClass", "quantity", "avgCost", "marketRate", "totalCost", "marketValue", "accruedIncome", "pctPortfolio"],
        holdings.map((h) => [h.security, h.assetClass, h.quantity, h.unitCost, h.marketPrice, h.totalCost, h.printed.marketValue, h.accruedIncome ?? "", h.printed.pctAssets])),
      transactions: sheetRows("transactions",
        ["date", "security", "side", "quantity", "grossRate", "netRate", "netValue"],
        transactions.map((t) => [t.date, t.security, t.side, t.quantity, t.unitPrice, t.brokerageRate ?? "", t.printed.settlementAmount])),
      capital: sheetRows("capital",
        ["date", "kind", "amount"],
        capital.map((c) => [c.date, c.kind, c.amount])),
      allocation: sheetRows("allocation",
        ["type", "purchaseValue", "marketValue", "pctAUM"],
        [["Shares", allocShares?.cost ?? "", allocShares?.value ?? "", allocShares?.pct ?? ""],
          ["Mutual Funds", allocFunds?.cost ?? "", allocFunds?.value ?? "", allocFunds?.pct ?? ""],
          ["Cash / Bank", allocCash?.cost ?? "", allocCash?.value ?? "", allocCash?.pct ?? ""],
          ["Total", allocTotal?.cost ?? "", allocTotal?.value ?? "", allocTotal?.pct ?? ""]]),
    },
    warnings,
    status: !holdings.length ? "failed" : warnings.length ? "partial" : "ok",
  };
}
