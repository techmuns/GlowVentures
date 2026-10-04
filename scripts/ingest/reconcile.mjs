// Reconciliation — the part that decides whether the extraction can be trusted.
//
// Extraction that "ran" is worthless. What matters is whether the figures tie
// out, and where they don't, that the disagreement is stated rather than
// averaged away. Nothing here resolves a conflict: it reports both sides and
// leaves the choice to precedence.mjs (a committed decision) or to a human.
//
// Five checks:
//   a) row-sum vs printed total, per table
//   b) cross-report deltas — same account, same as-of, field by field
//   c) duplicate holdings appearing under different owners
//   d) coverage — found / parsed / partial / failed, with reasons
//   e) unresolved — securities with no symbol, owners with no canonical match,
//      report types left unread
import fs from "node:fs";
import path from "node:path";
import { PRECEDENCE, PROVIDERS_WITH_PRECEDENCE } from "./precedence.mjs";
import { OWNERS } from "../../shared/owners.mjs";
import { SEPARATE_INVESTMENTS, separateInvestmentFor, separateIncomeFor } from "../../shared/separateInvestments.mjs";

// The family's answers are the pipeline's own input, so they are re-exported
// where the policy they answer lives.
export { SEPARATE_INVESTMENTS };

/** Money is compared to the paisa; a smaller gap is float noise, not a break. */
const MONEY_TOLERANCE = 0.01;
/** Percentages are printed to 2dp. */
const PCT_TOLERANCE = 0.005;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const round2 = (n) => Math.round(n * 100) / 100;

// ── a) Row sums vs printed totals ────────────────────────────────────────────

/**
 * Sum a holdings field, skipping nulls.
 * Returns null when NO row reported the field — summing nothing to 0 and then
 * comparing that against a printed total would manufacture a mismatch.
 */
function sumField(holdings, field) {
  let total = 0, seen = 0, missing = 0;
  for (const h of holdings) {
    if (isNum(h[field])) { total += h[field]; seen++; } else missing++;
  }
  return seen ? { value: round2(total), rows: seen, missing } : null;
}

const isCash = (h) => h.assetClass === "Cash";

/**
 * OUTSTANDING dividend per security for one account, from its OWN statement.
 *
 * A fourth basis, and the one CURRENT PORTFOLIO runs on. `deriveHolding`
 * computes market value as price x quantity; this report's Market Value column
 * folds in the dividend that has gone EX but has not yet been RECEIVED. On
 * Molecule's 31 July statement that is three rows — Indian Metals 11,250,
 * Kirloskar 8,901, Sasken 1,300 — and the account's printed total sits exactly
 * 21,451 above the sum of the derived rows, which is the figure its own
 * DIVIDEND SUMMARY prints as "Outstanding Dividend".
 *
 * It is NOT the Income column. That column carries the year to date (Indian
 * Metals 48,750 against 11,250 outstanding), which is why `explainedByAccrual`
 * — the same shape, reading `accruedIncome` — explains the one row where the
 * two happen to coincide and leaves the rest material.
 *
 * Read from the SAME account's dividend statement, matched on provider, account
 * and as-of, and only from a report the pipeline actually split out. The
 * outstanding figure is `receivable - received` per row: a dividend already
 * paid is in the bank, not in the mark.
 */
function outstandingBySecurity(doc, docs) {
  const m = new Map();
  for (const d of docs) {
    if (d.reportType !== "dividend-statement") continue;
    if (d.provider !== doc.provider || d.accountNo !== doc.accountNo || d.asOf !== doc.asOf) continue;
    for (const e of d.income ?? []) {
      if (!e.securityKey) continue;
      const out = (isNum(e.receivable) ? e.receivable : 0) - (isNum(e.received) ? e.received : 0);
      if (out === 0) continue;
      m.set(e.securityKey, round2((m.get(e.securityKey) ?? 0) + out));
    }
  }
  return m;
}

/**
 * The precision of `price x quantity` when the price is printed to two places.
 *
 * Kirloskar's 2,967 shares at a printed 475.65 derive 1,411,253.55 against a
 * printed 1,420,155 less 8,901 outstanding = 1,411,254 — a 0.45 residual that
 * is the price's own last digit, not a second basis. Bounding by the share
 * count rather than by a flat rupee keeps that honest: it is the statement's
 * printing precision, reproduced, not a tolerance widened until it fits.
 */
const pricePrecision = (h) => Math.max(MONEY_TOLERANCE, Math.abs(isNum(h.quantity) ? h.quantity : 0) * 0.005);


function rowSumChecks(doc, docs = []) {
  const out = [];
  if (!doc.totals || !doc.holdings.length) return out;
  const equity = doc.holdings.filter((h) => !isCash(h));
  const all = doc.holdings;

  /**
   * These statements print their market-value TOTALS on an income-inclusive
   * basis while the market-value COLUMN excludes accrued income. So the sum of
   * the rows falls short of the printed total by exactly the accrued income —
   * verified on every account here (Goldstandard 100023: Rs 379,600 to the
   * rupee). That is a basis difference, not an extraction error, and naming it
   * is more useful than flagging six identical unexplained mismatches.
   */
  const accrued = round2(all.reduce((t, h) => t + (isNum(h.accruedIncome) ? h.accruedIncome : 0), 0));
  /**
   * ...and CURRENT PORTFOLIO runs on a DIFFERENT one: the outstanding dividend,
   * not the Income column. See `outstandingBySecurity`. Scoped to that report
   * type because that is where the behaviour was measured; the appraisal's own
   * market value is price x quantity exactly and must keep failing loudly if it
   * ever stops being.
   */
  const outstanding = doc.reportType === "holdings"
    ? round2([...outstandingBySecurity(doc, docs).values()].reduce((t, v) => t + v, 0))
    : 0;

  /**
   * A SECTION THE REPORT SUBTOTALLED WITHOUT PRINTING ITS ROWS.
   *
   * Green Lantern's quarterly investor report prints `Shares 98,943,579.34
   * 112,998,541.36 96.65` and not one of the securities behind it — the detail
   * is in that manager's portfolio appraisal, which precedence already names
   * authoritative. The row sum here is therefore SHORT BY A KNOWN AMOUNT that
   * the document itself declares, and reporting it as an unexplained break would
   * put a ₹11.3 Cr material delta in the report for a document that is behaving
   * exactly as printed.
   *
   * The shortfall is checked against the declared subtotals rather than waved
   * through: it is explained only when the two agree to the rupee.
   */
  const missingSections = doc.sectionsWithoutRows ?? [];
  const missingValue = round2(missingSections.reduce((t, s) => t + (isNum(s.printedValue) ? s.printedValue : 0), 0));
  const missingNames = missingSections.map((s) => s.section).join(", ");

  const check = (label, sum, printed, tolerance = MONEY_TOLERANCE, incomeInclusive = false) => {
    if (!sum || !isNum(printed)) return;
    const delta = round2(sum.value - printed);
    const explainedByIncome = incomeInclusive && accrued > 0 && Math.abs(delta + accrued) <= 1;
    const explainedByMissing = missingValue > 0 && Math.abs(delta + missingValue) <= 1;
    const explainedByOutstanding = outstanding > 0 && Math.abs(delta + outstanding) <= 1;
    out.push({
      docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo,
      asOf: doc.asOf, reportType: doc.reportType,
      check: label,
      rowSum: sum.value, printedTotal: printed, delta,
      rowsSummed: sum.rows, rowsMissingField: sum.missing,
      matches: Math.abs(delta) <= tolerance,
      severity: Math.abs(delta) <= tolerance ? "ok"
        : explainedByIncome || explainedByMissing || explainedByOutstanding ? "explained"
        : Math.abs(delta) <= 1 ? "rounding" : "material",
      cause: explainedByIncome
        ? `printed total is income-inclusive; the market-value column is not. Delta equals the accrued income on this account (${accrued.toLocaleString("en-IN")}).`
        : explainedByOutstanding
        ? `printed market value folds in the dividend gone ex but not yet received; the derived column is price x quantity. Delta equals the outstanding dividend on this account's own dividend statement (${outstanding.toLocaleString("en-IN")}).`
        : explainedByMissing
          ? `this report subtotals ${missingNames} without printing the per-security rows. Delta equals the declared subtotal (${missingValue.toLocaleString("en-IN")}); those holdings come from another report for this account.`
          : null,
      accruedIncome: accrued || null,
      outstandingDividend: outstanding || null,
    });
  };

  check("equity market value", sumField(equity, "marketValue"), doc.totals.equityMarketValue, MONEY_TOLERANCE, true);
  check("equity cost", sumField(equity, "totalCost"), doc.totals.equityCost);
  check("total market value (incl. cash)", sumField(all, "marketValue"), doc.totals.totalMarketValue, MONEY_TOLERANCE, true);
  check("total cost (incl. cash)", sumField(all, "totalCost"), doc.totals.totalCost);
  check("total gain/loss", sumField(equity, "gainLoss"), doc.totals.gainLoss);
  // %Assets is derived against the total INCLUDING cash, so it can only reach
  // 100 when the cash rows are counted too. Summing the equity rows alone would
  // always fall short by the cash weight and report a mismatch that isn't one.
  const pct = sumField(all, "pctAssets");
  if (pct) {
    const delta = round2(pct.value - 100);
    out.push({
      docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo, asOf: doc.asOf,
      reportType: doc.reportType, check: "% of assets sums to 100",
      rowSum: pct.value, printedTotal: 100, delta,
      rowsSummed: pct.rows, rowsMissingField: pct.missing,
      matches: Math.abs(delta) <= 0.01,
      // %Assets is derived against the sum of the derived market values, so the
      // weights sum to 100 by construction — the only slack is each row being
      // carried to 2dp, up to N/200 across N rows. Anything beyond that is a
      // real discrepancy, not rounding.
      severity: Math.abs(delta) <= Math.max(0.01, pct.rows / 200) ? "rounding" : "material",
      cause: null,
      accruedIncome: null,
    });
  }
  return out;
}

// ── a2) Derived vs printed ───────────────────────────────────────────────────

/** Fields the pipeline derives, paired with what the statement printed. */
const DERIVED_FIELDS = ["marketValue", "gainLoss", "pctGainLoss", "pctAssets"];

/**
 * A delta this small is the statement rounding its own display, not a
 * disagreement about the figure: these reports print gain to the rupee and
 * percentages to 2dp. Rs 1 on a money field, 0.005 on a percent.
 */
const ROUNDING_MONEY = 1;
const ROUNDING_PCT = 0.005;

const isPctField = (f) => f.startsWith("pct");

/**
 * Rounding, or a real disagreement?
 *
 * Rounding deltas are reported in AGGREGATE and do not block — there are
 * hundreds of them and each is the display convention, not an error. Material
 * deltas are reported per row and block the golden test, because a figure that
 * differs by more than the printing precision means the statement and the
 * arithmetic genuinely disagree.
 */
function classifyDelta(field, delta) {
  const limit = isPctField(field) ? ROUNDING_PCT : ROUNDING_MONEY;
  return Math.abs(delta) <= limit ? "rounding" : "material";
}

/**
 * Does this row's printed %Assets follow the statement's own income-inclusive
 * basis, exactly?
 *
 * Every one of these reports computes %Assets as
 *
 *     (row market value + row accrued income) / (portfolio total incl. income)
 *
 * while its market-value COLUMN excludes accrued income. That is why the printed
 * percentage and the printed market value disagree on rows carrying income —
 * Sundaram Finance prints 4.29% against an MV that works out to 4.26%.
 *
 * Reproducing the formula turns a whole class of deltas from "unexplained" into
 * a named basis difference. It is an EXACT check to the printed 2dp, not a
 * tolerance: it holds on 143 of 143 rows across all five appraisals in this
 * drop, and a row where it fails stays material and gets reported.
 */
function explainedByIncomeBasis(h, printedTotal) {
  if (!isNum(h.marketValue) || !isNum(printedTotal) || !printedTotal) return false;
  const alt = round2(((h.marketValue + (isNum(h.accruedIncome) ? h.accruedIncome : 0)) / printedTotal) * 100);
  return Math.abs(alt - h.printed.pctAssets) <= ROUNDING_PCT;
}

/**
 * Does this row's printed MARKET VALUE fold in the accrued income the reader
 * separated out — exactly?
 *
 * The same basis difference as above, one column to the left. The SEBI investor
 * report's Market Value column is income-inclusive on rows carrying an accrual:
 * SVAN prints GHCL at 2,729,426.75 against 6,085 shares at 436.55, which is
 * 2,656,406.75 plus ₹12.00 a share of declared dividend.
 *
 * Checked by ADDING BACK the figure the reader booked and requiring the printed
 * value to the paisa. A row where that fails stays material — it means the
 * residual came from something other than the accrual, and a tolerance would
 * have hidden it.
 */
function explainedByAccrual(h) {
  if (!isNum(h.marketValue) || !isNum(h.accruedIncome) || !isNum(h.printed?.marketValue)) return false;
  return Math.abs(round2(h.marketValue + h.accruedIncome) - h.printed.marketValue) <= MONEY_TOLERANCE;
}

/**
 * Does this row's printed MARKET VALUE fold in its OUTSTANDING dividend?
 *
 * The CURRENT PORTFOLIO basis. Same shape as `explainedByAccrual` and a
 * different figure: the accrual column is year-to-date, this is only what has
 * gone ex and not been received. Bounded by the printed price's own precision
 * (see `pricePrecision`) rather than a flat rupee, because the derived side is
 * quantity x a two-decimal price.
 */
function explainedByOutstandingDividend(h, outstanding) {
  if (!outstanding || !isNum(h.marketValue) || !isNum(h.printed?.marketValue)) return false;
  return Math.abs(round2(h.marketValue + outstanding) - h.printed.marketValue) <= pricePrecision(h);
}

/**
 * Does this row's printed %Assets equal its own printed value over its own
 * printed total?
 *
 * When it does, the whole delta is our derived basis (price x quantity, over a
 * derived denominator) meeting the statement's (printed over printed) — nothing
 * else. Checked for EXACT equality at the two places the statement prints, so a
 * row whose percentage does not follow its own arithmetic stays material.
 */
function explainedByPrintedBasis(h, printedTotal) {
  if (!isNum(printedTotal) || printedTotal === 0) return false;
  if (!isNum(h.printed?.marketValue) || !isNum(h.printed?.pctAssets)) return false;
  return round2((h.printed.marketValue / printedTotal) * 100) === round2(h.printed.pctAssets);
}

/**
 * Does this row's printed %AUM follow the statement's OWN declared denominator?
 *
 * A third basis, and the SEBI investor report declares it out loud. SVAN's
 * 31 July 2026 report prints a summary block whose total reads
 *
 *     Shares  144,891,378.61   155,651,492.21   105.37%
 *     Cash    9,110,226.43       9,110,226.43     6.17%
 *     Total   154,001,605.04   164,761,718.64   111.54%
 *
 * — its own percentages sum to 111.54% of the market value printed beside
 * them. The column is "Assets Under Management (%)", and AUM here is a
 * SMALLER number than the portfolio's market value: 164,761,718.64 / 1.1154 =
 * 147,715,365. The percentage is not market value over portfolio total at all,
 * and reading it as one made every row on that report look wrong by about 11%
 * — 46 material deltas from a document that is internally consistent on its
 * own terms.
 *
 * TWO SOURCE PROPERTIES COMBINE HERE, which is why the naive check missed it:
 *
 *   1. the denominator is AUM, which the total row states;
 *   2. on 11 of 46 rows the statement's own MARKET VALUE does not equal its own
 *      quantity x price — Ceat prints 1,590 at 3,429.90 and a value of
 *      5,509,191.00, which is 3,465.53 a share.
 *
 * So the printed percentage is reproduced from the printed MARKET VALUE, not
 * from the derived one. On all 46 rows it lands within the printed 2dp. The
 * book keeps the derived figure — price x quantity, per the primitives rule —
 * and this names why the statement's own column differs.
 *
 * The AUM is taken from the document's own total row. If that block is absent
 * the check does not run and the delta stays material: an AUM inferred by
 * fitting it to the rows it is meant to explain would explain anything.
 */
function explainedByAumBasis(h, doc) {
  const printedPct = h.printed?.pctAssets;
  const printedMv = h.printed?.marketValue;
  const aum = doc.totals?.declaredAum;
  if (!isNum(printedPct) || !isNum(printedMv) || !isNum(aum) || !aum) return false;
  return Math.abs(round2((printedMv / aum) * 100) - printedPct) <= ROUNDING_PCT;
}

/**
 * Compare every DERIVED figure against the one the statement printed.
 *
 * This is where a report's own internal inconsistency becomes visible instead of
 * being silently imported — the Appraisal's %Assets is computed on an
 * income-inclusive basis its market-value column excludes, so its printed
 * percentage and its own MV disagree by a few basis points on every row. The
 * derived value is what the book uses; the printed one is evidence, and the
 * delta is reported rather than resolved.
 */
function derivedVsPrinted(doc, docs = []) {
  const out = [];
  // Empty for every report type but CURRENT PORTFOLIO — see `outstandingBySecurity`.
  const outstanding = doc.reportType === "holdings" ? outstandingBySecurity(doc, docs) : new Map();
  for (const h of doc.holdings) {
    for (const field of DERIVED_FIELDS) {
      const derived = h[field];
      const printed = h.printed?.[field];
      if (!isNum(derived) || !isNum(printed)) continue;
      const delta = round2(derived - printed);
      if (delta === 0) continue;
      const pctBasis = field === "pctAssets" && explainedByIncomeBasis(h, doc.totals?.totalMarketValue);
      const aumBasis = field === "pctAssets" && !pctBasis && explainedByAumBasis(h, doc);
      const mvBasis = field === "marketValue" && explainedByAccrual(h);
      // The CURRENT PORTFOLIO pair, both reproduced per row rather than
      // tolerated: the market value folds in this row's OUTSTANDING dividend,
      // and the percentage is the statement's own printed value over its own
      // printed total. `pctPrinted` is checked for EXACT equality at the two
      // places the statement prints, so it fires only where that arithmetic is
      // internally consistent — never as a catch-all.
      const divBasis = field === "marketValue" && !mvBasis
        && explainedByOutstandingDividend(h, outstanding.get(h.securityKey) ?? 0);
      const pctPrinted = field === "pctAssets" && !pctBasis && !aumBasis && outstanding.size > 0
        && explainedByPrintedBasis(h, doc.totals?.totalMarketValue);
      /*
       * THERE USED TO BE A SEVENTH CAUSE HERE, `depositoryValueColumn`, and it
       * is gone because its premise was wrong rather than because it stopped
       * firing. It marked every Motilal Oswal depository row `explained` on the
       * grounds that the document's own arithmetic was broken — a value column
       * tying to its grand total while disagreeing with quantity x rate on a
       * third of its rows. The document was right and the reading was not: the
       * rate is the price of the holding's LAST MOVEMENT and the value is that
       * price times the movement's own quantity (see `motilalDemat.mjs`), so
       * that reader no longer derives a market value from either and there is
       * nothing left to compare. A cause that explains a delta by calling the
       * source broken is worth a second look every time it is reached for.
       */
      out.push({
        docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo,
        asOf: doc.asOf, reportType: doc.reportType,
        security: h.security, securityKey: h.securityKey,
        field, derived, printed, delta,
        severity: pctBasis || aumBasis || mvBasis || divBasis || pctPrinted
          ? "explained" : classifyDelta(field, delta),
        cause: pctBasis
          ? "printed %Assets is (market value + accrued income) / (total incl. income); the derived figure is on the ex-income basis of the market-value column. Reproduced exactly."
          : aumBasis
            ? "printed % is of ASSETS UNDER MANAGEMENT, which this report's own total row states is 111.54% of the market value printed beside it; and its printed market value does not equal its own quantity x price on every row. Reproduced from the printed value over the declared AUM."
          : mvBasis
            ? "printed market value folds in the accrued income this row carries; the derived figure is price x quantity. Adding the accrual back reproduces the printed figure to the paisa."
          : divBasis
            ? "printed market value folds in this row's OUTSTANDING dividend — gone ex, not yet received — which its own dividend statement prints. Adding it back reproduces the printed figure to within the printed price's own last digit."
          : pctPrinted
            ? "printed %Assets is this row's own printed market value over the printed total, both on the outstanding-dividend basis; the derived figure is price x quantity over the derived total. Reproduced exactly at the two places the statement prints."
            : null,
        // A value copied from the statement cannot disagree with itself; if this
        // is ever true alongside a delta, the copy path is broken.
        fromPrinted: !!h.marketValueFromPrinted,
      });
    }
  }
  return out;
}

// ── b) Cross-report deltas ───────────────────────────────────────────────────

const TOTALS_FIELDS = [
  "equityMarketValue", "cashValue", "totalMarketValue", "equityCost", "totalCost", "gainLoss", "pctGainLoss",
];
const FLOWS_FIELDS = [
  "contribution", "withdrawal", "netCapitalInOut", "realized", "unrealized",
  "income", "expenses", "fees", "profit", "corpus",
];

const accountKey = (d) => `${d.provider}\u0000${d.accountNo ?? "?"}\u0000${d.asOf ?? "?"}`;

function crossReportDeltas(docs) {
  const groups = new Map();
  for (const d of docs) {
    if (d.status === "failed") continue;
    const k = accountKey(d);
    (groups.get(k) ?? groups.set(k, []).get(k)).push(d);
  }

  const out = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const sample = group[0];

    const compare = (block, fields, tolerance) => {
      for (const field of fields) {
        const seen = group
          .map((d) => ({
            reportType: d.reportType, docKey: d.docKey, value: d[block]?.[field],
            // Two flow blocks over different windows measure different things.
            window: `${d[block]?.periodFrom ?? "?"}..${d[block]?.periodTo ?? "?"}`,
          }))
          .filter((x) => isNum(x.value));
        if (seen.length < 2) continue;
        for (let i = 0; i < seen.length; i++) {
          for (let j = i + 1; j < seen.length; j++) {
            // Only like windows are comparable. The performance summary runs the
            // financial year to date while the performance history and fact sheet
            // run since inception, so both print a "Realized Gain" and both are
            // right — 415,051.23 and 882,423.12. Reporting that as a disagreement
            // is noise, and noise is where a real disagreement goes to hide.
            if (seen[i].window !== seen[j].window) continue;
            const delta = round2(seen[i].value - seen[j].value);
            const tol = field.startsWith("pct") ? PCT_TOLERANCE : tolerance;
            if (Math.abs(delta) <= tol) continue;
            out.push({
              provider: sample.provider, accountNo: sample.accountNo, asOf: sample.asOf,
              field: `${block}.${field}`,
              a: { reportType: seen[i].reportType, docKey: seen[i].docKey, value: seen[i].value },
              b: { reportType: seen[j].reportType, docKey: seen[j].docKey, value: seen[j].value },
              delta,
              window: seen[i].window === "?..?" ? null : seen[i].window,
              // Same split as everywhere else: the fact sheet prints its
              // portfolio value to the rupee while the performance history keeps
              // the paise, and Rs 0.17 is that rounding, not a disagreement.
              severity: classifyDelta(field, delta),
              // Which side precedence says to use — stated, not applied here.
              authoritative: authoritativeFor(sample.provider, block, field),
            });
          }
        }
      }
    };
    compare("totals", TOTALS_FIELDS, MONEY_TOLERANCE);
    compare("flows", FLOWS_FIELDS, MONEY_TOLERANCE);

    // Per-holding: same security, same account+date, different report.
    const byKey = new Map();
    for (const d of group) {
      for (const h of d.holdings) {
        const k = h.securityKey;
        (byKey.get(k) ?? byKey.set(k, []).get(k)).push({ reportType: d.reportType, docKey: d.docKey, h });
      }
    }
    for (const [securityKey, entries] of byKey) {
      if (entries.length < 2) continue;
      for (const field of ["quantity", "totalCost", "marketPrice", "marketValue", "gainLoss"]) {
        const seen = entries.filter((e) => isNum(e.h[field]));
        for (let i = 0; i < seen.length; i++) {
          for (let j = i + 1; j < seen.length; j++) {
            const delta = round2(seen[i].h[field] - seen[j].h[field]);
            if (Math.abs(delta) <= MONEY_TOLERANCE) continue;
            out.push({
              provider: sample.provider, accountNo: sample.accountNo, asOf: sample.asOf,
              securityKey, security: seen[i].h.security,
              field: `holding.${field}`,
              a: { reportType: seen[i].reportType, docKey: seen[i].docKey, value: seen[i].h[field] },
              b: { reportType: seen[j].reportType, docKey: seen[j].docKey, value: seen[j].h[field] },
              delta,
              authoritative: authoritativeFor(sample.provider, "holding", field),
            });
          }
        }
      }
    }
  }
  return out;
}

/** What the committed precedence table says should win, as a label. */
function authoritativeFor(provider, block, field) {
  const table = PRECEDENCE[provider];
  if (!table) return null;
  const factName = block === "holding"
    ? { quantity: "quantity", totalCost: "totalCost", marketPrice: "marketPrice", marketValue: "marketValue", gainLoss: "gainLoss" }[field]
    : { equityMarketValue: "marketValue", totalMarketValue: "accountTotals", equityCost: "totalCost", totalCost: "totalCost", gainLoss: "gainLoss" }[field] ?? field;
  const rule = table[factName];
  if (!rule) return null;
  return (rule.reportTypes ?? [rule.reportType]).join(" / ");
}

// ── c) Duplicate holdings across owners ──────────────────────────────────────

/**
 * The same position reported twice.
 *
 * Keyed PURELY on identical primitives — security, quantity, unit cost and
 * market value, matched exactly. Byte-identical figures are a double-report
 * whoever they are filed under, and any differing primitive means two genuine
 * holdings. Keying on the owner as well (the earlier rule) missed the case
 * where one person's two accounts both carry the position, and needed a second
 * policy to cover it; this needs none.
 */
/**
 * DUPLICATE POLICY — carry both, count once.
 *
 * Reversible policy, not a fact, and it lives here alone so it can be changed
 * in one place. The two pairs it was written for are separate investments, on
 * the family's word (`SEPARATE_INVESTMENTS` in shared/separateInvestments.mjs),
 * so on this corpus it groups nothing. It stays for the next pair a drop
 * brings, which would be pending the family's answer exactly as these were.
 *
 * Where two accounts' statements carry byte-identical figures, rather than
 * suppress either — which would either lose a real holding or invent one —
 * matching rows are given a shared `dedupeGroup` id and each is told which
 * other owners report it. Consequences, applied consistently everywhere
 * downstream:
 *
 *   • Each owner's ACCOUNT view shows their statement exactly as printed.
 *   • CONSOLIDATED family totals count each dedupeGroup ONCE.
 *   • `alsoReportedUnder` lets the UI show a pill on the affected rows.
 *
 * @param docs mutated in place: matching holdings gain dedupeGroup + alsoReportedUnder.
 */
export function applyDedupePolicy(docs, groups) {
  for (const g of groups) {
    for (const occ of g.occurrences) {
      const doc = docs.find((d) => d.docKey === occ.docKey);
      const h = doc?.holdings.find((x) => x.securityKey === g.securityKey);
      if (!h) continue;
      h.dedupeGroup = g.dedupeGroup;
      h.alsoReportedUnder = g.owners.filter((o) => o !== (doc.ownerId ?? doc.owner));
    }
  }
}

/**
 * Consolidated market value with each dedupeGroup counted once.
 *
 * Returned alongside the naive sum so the report states both and the difference
 * is never invisible.
 */
export function consolidatedValue(docs) {
  let naive = 0;
  const seenGroups = new Set();
  let deduped = 0;
  for (const doc of docs) {
    if (doc.status === "failed") continue;
    for (const h of doc.holdings) {
      const mv = isNum(h.marketValue) ? h.marketValue : 0;
      naive += mv;
      if (h.dedupeGroup) {
        if (seenGroups.has(h.dedupeGroup)) continue;
        seenGroups.add(h.dedupeGroup);
      }
      deduped += mv;
    }
  }
  return { naive: round2(naive), deduped: round2(deduped), doubleCounted: round2(naive - deduped) };
}

/** Why a pair the family has answered for is not a dedupe group — its resolution line in the report. */
const CONFIRMED_SEPARATE = (d) => `NOT a dedupe group. The family confirmed on ${d.confirmed} that these are `
  + "separate investments, one per account, so each is counted in full in every figure. The figures coincide "
  + "because the holders bought the same thing on the same terms (SEPARATE_INVESTMENTS in shared/separateInvestments.mjs).";

/**
 * @param opts.decisions the family's answers to apply — `SEPARATE_INVESTMENTS`
 *   unless a caller asks for another set. `npm run replay:dedupe` passes `[]`
 *   to reproduce what the archive carried before an answer, which is its gate.
 */
export function duplicateHoldings(docs, { decisions = SEPARATE_INVESTMENTS } = {}) {
  const byFigures = new Map();
  for (const doc of docs) {
    if (doc.status === "failed") continue;
    for (const h of doc.holdings) {
      if (isCash(h)) continue;
      // A row with no figures at all cannot be judged identical to anything —
      // the fact sheet contributes security + sector and nothing else, and every
      // one of its rows would otherwise "match" every other fact sheet's.
      if (!isNum(h.quantity) && !isNum(h.marketValue) && !isNum(h.unitCost)) continue;
      // Identity is the security plus the figures that would have to coincide
      // by chance for this to be innocent.
      const k = [h.securityKey, h.quantity ?? "-", h.unitCost ?? "-", h.marketValue ?? "-"].join("|");
      (byFigures.get(k) ?? byFigures.set(k, []).get(k)).push({ doc, h });
    }
  }

  const out = [];
  const quantityOnly = [];
  const confirmedSeparate = [];
  for (const [, entries] of byFigures) {
    if (entries.length < 2) continue;
    const owners = new Set(entries.map((e) => e.doc.ownerId ?? e.doc.owner ?? "(unknown)"));
    /**
     * THIS SECTION IS "ACROSS OWNERS", SO THE GUARD IS DISTINCT ACCOUNTS.
     *
     * It keyed on `account@asOf`, which lets ONE folio's own monthly statements
     * satisfy it: Sky Capital reissues an unchanged statement every month, so
     * Bharat's Hudle position appeared four times at identical figures under
     * four different dates and was reported as a suspected duplicate against
     * itself. The same false positive was already firing on the HDFC folio's two
     * issues. A restatement of one account is the supersede rule's business, not
     * this check's; what this check exists to catch is one position reported
     * under two ACCOUNTS.
     */
    const accounts = new Set(entries.map((e) => e.doc.accountNo));
    if (accounts.size < 2) continue;
    const first = entries[0].h;

    /**
     * ONE FIGURE IS NOT "THE FIGURES THAT WOULD HAVE TO COINCIDE BY CHANCE".
     *
     * The key above is security + quantity + unit cost + market value, and the
     * comment on it is the rule: a group is suspicious because several
     * independent numbers agree. Where only ONE of the three is reported at all,
     * the whole match rests on it — and this book already contains the reason
     * that is not enough, in its own words: *"India SME's three folios print
     * coincidentally equal units"*. Two holders subscribing the same round
     * number of units to the same fund is an ORDINARY event; two rows agreeing
     * on quantity AND cost AND market value to the paisa is not.
     *
     * Measured on this corpus, the quantity-only tier was producing THREE false
     * duplicates, and each is refuted by a document already in hand:
     *
     *   • Sky Capital Oncare Class A3, 7,500 units under SKY023 and SKY024 —
     *     the fund's own statements print ₹75 L DRAWN AGAINST EACH, ₹1.50 Cr of
     *     real money, one folio per trust;
     *   • India SME Fund II Class A2, 27,000 units under three folios — named
     *     in CLAUDE.md as a coincidence and flagged as a duplicate anyway;
     *   • Swapeco Solutions, 347 preference shares under HDFC NSDL 67786547 and
     *     67786137 — the family's own register records ₹1,35,00,875 under EACH
     *     trust, separately.
     *
     * None collapses anything TODAY, because a quantity-only row is a row no
     * statement values and `dedupedPositions` drops it from no total. That is
     * exactly when this is cheapest to fix: the day any of those funds publishes
     * a NAV, `dedupedPositions` would have halved a real holding silently, on a
     * page computing correctly. So a one-figure match is REPORTED and never
     * grouped — narrowing detection, and naming what it left out, rather than
     * dropping it.
     */
    const coinciding = [isNum(first.quantity), isNum(first.unitCost), isNum(first.marketValue)].filter(Boolean).length;
    if (coinciding < 2) {
      quantityOnly.push({
        security: first.security,
        securityKey: first.securityKey,
        quantity: first.quantity,
        owners: [...owners],
        accounts: [...accounts],
        occurrences: entries.map((e) => ({
          docKey: e.doc.docKey, owner: e.doc.owner, ownerId: e.doc.ownerId,
          accountNo: e.doc.accountNo, asOf: e.doc.asOf, reportType: e.doc.reportType,
        })),
        resolution: "NOT a dedupe group. The only figure these rows share is the quantity, and no statement "
          + "here values them, so there is nothing to double-count and nothing to collapse. Treat as two real "
          + "holdings unless a statement says otherwise — a shared unit count alone is not evidence of one.",
      });
      continue;
    }

    /**
     * THE FAMILY HAS ALREADY ANSWERED FOR THESE ACCOUNTS. Detected exactly as
     * before — the coincidence is a fact about the statements, and the report
     * still names it — but filed as separate investments and never grouped, so
     * no row is tagged and every figure counts both.
     */
    const decided = separateInvestmentFor(first.securityKey, entries.map((e) => ({ provider: e.doc.provider, accountNo: e.doc.accountNo })), decisions);
    if (decided) {
      confirmedSeparate.push({
        security: first.security,
        securityKey: first.securityKey,
        quantity: first.quantity,
        totalCost: first.totalCost,
        marketValue: first.marketValue,
        owners: [...owners],
        confirmed: decided.confirmed,
        occurrences: entries.map((e) => ({
          docKey: e.doc.docKey, owner: e.doc.owner, ownerId: e.doc.ownerId,
          accountNo: e.doc.accountNo, asOf: e.doc.asOf, reportType: e.doc.reportType,
        })),
        resolution: CONFIRMED_SEPARATE(decided),
      });
      continue;
    }

    out.push({
      dedupeGroup: `dg-${first.securityKey}-${entries.length}`,
      security: first.security,
      securityKey: first.securityKey,
      quantity: first.quantity,
      totalCost: first.totalCost,
      marketValue: first.marketValue,
      owners: [...owners],
      occurrences: entries.map((e) => ({
        docKey: e.doc.docKey, owner: e.doc.owner, ownerId: e.doc.ownerId,
        accountNo: e.doc.accountNo, asOf: e.doc.asOf, reportType: e.doc.reportType,
      })),
      doubleCountRisk: isNum(first.marketValue) ? round2(first.marketValue) : null,
      resolution: "NOT deduped — both are reported. Decide which statement owns this position.",
    });
  }
  out.sort((a, b) => (b.doubleCountRisk ?? 0) - (a.doubleCountRisk ?? 0));
  quantityOnly.sort((a, b) => String(a.security).localeCompare(String(b.security)));
  confirmedSeparate.sort((a, b) => String(a.security).localeCompare(String(b.security))
    || String(a.occurrences[0]?.asOf ?? "").localeCompare(String(b.occurrences[0]?.asOf ?? "")));
  return { groups: out, quantityOnly, confirmedSeparate };
}

// ── d) + e) Coverage and unresolved ──────────────────────────────────────────

/**
 * The SAME AIF income reported under two folios — check (c), one column over.
 *
 * `duplicateHoldings` keys on holdings, and an income-only folio has none, so a
 * duplicate here was invisible to it. Bharat's folio 1000633 and Ajay's 1000632
 * are the case: byte-identical income heads, the same 9,90,429.684 Class A3
 * units and the same 7,38,106 of income, which is the same shape as 360 ONE
 * Special Opportunities Series 8 appearing under both CRNs on the WEALTH side.
 *
 * Nothing sums `aifEarnings` into a book-wide figure today, so no figure on
 * screen is wrong — which is exactly when a duplicate is cheapest to record and
 * exactly how `dedupedPositions` came to sit correct and uncalled for a drop and
 * a half. Reported, never netted: which folio owns the income is a question
 * about the family's affairs, and the same "carry both, count once" policy this
 * file already applies to holdings is the one a future consumer must follow.
 */
/**
 * @param opts.decisions the family's answers, as for `duplicateHoldings` — the
 *   income side of a pair they named is two incomes, not one reported twice.
 */
export function duplicateAifEarnings(docs, { decisions = SEPARATE_INVESTMENTS } = {}) {
  const byFigures = new Map();
  for (const doc of docs) {
    if (doc.status === "failed" || !doc.aifEarnings) continue;
    const e = doc.aifEarnings;
    if (!isNum(e.totalIncome) && !isNum(e.units)) continue;
    const k = [e.class ?? "-", e.units ?? "-", e.totalIncome ?? "-", e.netIncome ?? "-", e.tds ?? "-"].join("|");
    (byFigures.get(k) ?? byFigures.set(k, []).get(k)).push(doc);
  }
  const out = [];
  for (const [, entries] of byFigures) {
    if (entries.length < 2) continue;
    // Two reports of one folio are check (b); this is about DIFFERENT folios.
    if (new Set(entries.map((d) => d.accountNo)).size < 2) continue;
    const first = entries[0].aifEarnings;
    // The family's answer covers the income side too: two separate holdings earn
    // two incomes, so a pair it names is counted in full, not once.
    const decided = separateIncomeFor(entries.map((d) => ({ provider: d.provider, accountNo: d.accountNo })), decisions);
    out.push({
      units: first.units, unitClass: first.class,
      totalIncome: first.totalIncome, netIncome: first.netIncome, tds: first.tds,
      owners: [...new Set(entries.map((d) => d.ownerId ?? d.owner ?? "(unknown)"))],
      occurrences: entries.map((d) => ({
        docKey: d.docKey, owner: d.owner, accountNo: d.accountNo, asOf: d.asOf, reportType: d.reportType,
      })),
      confirmedSeparate: decided ? decided.confirmed : null,
      doubleCountRisk: decided ? null : isNum(first.totalIncome) ? round2(first.totalIncome) : null,
      resolution: decided
        ? `Two incomes, one per folio: the family confirmed on ${decided.confirmed} that the holdings behind them are separate investments. Any consumer of \`aifEarnings\` counts both.`
        : "NOT netted — both are reported. Any consumer of `aifEarnings` must count this group once.",
    });
  }
  return out.sort((a, b) => (b.doubleCountRisk ?? 0) - (a.doubleCountRisk ?? 0));
}

function coverage(docs, pdfCount, duplicateSources = []) {
  const byStatus = { ok: [], partial: [], failed: [] };
  for (const d of docs) byStatus[d.status].push(d);
  const byProvider = {};
  for (const d of docs) {
    const p = (byProvider[d.provider] ??= {});
    const r = (p[d.reportType] ??= { ok: 0, partial: 0, failed: 0 });
    r[d.status]++;
  }
  return {
    pdfsFound: pdfCount,
    // Files skipped because an identical copy was already extracted. Reported
    // rather than silently absorbed: a reader counting PDFs in source/ must be
    // able to see why the archive holds fewer documents than the folder holds
    // files.
    duplicateSources,
    parsed: byStatus.ok.length,
    partial: byStatus.partial.length,
    failed: byStatus.failed.length,
    byProvider,
    failures: byStatus.failed.map((d) => ({
      docKey: d.docKey, sourcePath: d.sourcePath, provider: d.provider, reportType: d.reportType,
      reasons: d.warnings.map((w) => `${w.code}: ${w.detail}`),
    })),
    partials: byStatus.partial.map((d) => ({
      docKey: d.docKey, sourcePath: d.sourcePath,
      reasons: d.warnings.map((w) => `${w.code}: ${w.detail}`),
    })),
  };
}

// ── a3) The dated statements, checked against their own printed figures ──────

/**
 * Every dated table joins the same discipline as the holdings tables: what the
 * pipeline DERIVES is compared against what the statement PRINTED, per row, and
 * each delta is classified rather than tolerated.
 *
 * Three checks, one per statement that prints something derivable:
 *
 *   • TRANSACTIONS — derived net settlement (gross ± charges) against the
 *     printed Settlement Amount. This is what caught brokerage being a per-unit
 *     RATE rather than an amount: read as an amount every one of the 256 trades
 *     was short by roughly its own brokerage, and the check said so per row.
 *   • BANK BOOK — the running balance the statement prints after each row
 *     against the balance implied by the previous row plus this row's flows.
 *   • CAPITAL GAINS — the per-lot ST + LT against the account's realised gain
 *     as the performance appraisal states it, over the same window.
 */
function datedTableChecks(docs) {
  const out = [];
  /**
   * `explained` carries an optional { limit, cause }: a delta the STATEMENT'S OWN
   * printing precision accounts for, reproduced rather than tolerated. A cause
   * without a limit that covers the delta leaves it material, so a real break
   * cannot hide behind an explanation that does not reach it.
   */
  const add = (doc, check, key, derived, printed, tolerance = MONEY_TOLERANCE, explained = null) => {
    if (!isNum(derived) || !isNum(printed)) return;
    const delta = round2(derived - printed);
    const ok = Math.abs(delta) <= tolerance;
    const byPrecision = !ok && explained && Math.abs(delta) <= explained.limit;
    out.push({
      docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo,
      asOf: doc.asOf, reportType: doc.reportType,
      check, row: key, derived, printed, delta,
      matches: ok,
      severity: ok ? "ok" : byPrecision ? "explained" : classifyDelta("amount", delta),
      cause: byPrecision ? explained.cause : null,
    });
  };

  for (const doc of docs) {
    for (const t of doc.transactions ?? []) {
      /**
       * WHERE THE SETTLEMENT IS STRUCK ON A RATE THE REPORT ROUNDS BEFORE
       * PRINTING IT, this check can only be as exact as that rounding allows.
       *
       * The SEBI investor report prints both trade rates to two decimals and
       * settles on the unrounded one: Gland Pharma's 1,300 shares at a printed
       * 2,293.61 derive 2,981,693 against a printed 2,981,690.92. Half a paisa
       * per unit is ₹6.50 on that trade, and the ₹2.08 gap sits inside it.
       *
       * The allowance is computed from the precision the READER recorded, not
       * applied as a blanket widening: the house transaction statements print
       * four decimals, carry no `ratePrecision`, and stay held to the rupee —
       * which is what caught brokerage being a per-unit rate on all 256 of them.
       */
      const q = isNum(t.quantity) ? Math.abs(t.quantity) : 0;
      const allowance = isNum(t.ratePrecision) && q
        ? round2(0.5 * 10 ** -t.ratePrecision * q)
        : 0;
      add(doc, "transaction settlement", `${t.date} ${t.side} ${t.security}`,
        t.net, t.printed?.settlementAmount, MONEY_TOLERANCE, allowance
          ? {
            limit: allowance,
            cause: `settlement is struck on an unrounded rate; the report prints its rates to ${t.ratePrecision}dp, so a derived settlement can only agree to ±${allowance.toLocaleString("en-IN")} on ${q.toLocaleString("en-IN")} units`,
          }
          : null);
    }

    // The bank book's own running balance is the check on its own flows.
    let prev = null;
    for (const c of doc.cashFlows ?? []) {
      if (c.kind !== "bank-book") continue;
      const moves = [c.buySellAmount, c.income, c.expenses, c.depositWithdrawal];
      if (prev !== null && moves.some(isNum)) {
        // The Buy/Sell and Dep/With columns are SIGNED — a buy prints
        // −2,898,379.09 — so they are added as printed. Expenses print positive
        // and reduce the balance. Assuming a sign the statement already carries
        // moved every trade row by twice its own value.
        const step = (isNum(c.buySellAmount) ? c.buySellAmount : 0)
          + (isNum(c.income) ? c.income : 0)
          + (isNum(c.depositWithdrawal) ? c.depositWithdrawal : 0)
          - (isNum(c.expenses) ? c.expenses : 0);
        add(doc, "bank book running balance", `${c.date} ${c.description}`, round2(prev + step), c.balance);
      }
      if (isNum(c.balance)) prev = c.balance;
    }
  }

  // Realised gain: the lots against the account's own statement of it. Same
  // account, and only where the windows agree — a since-inception realised gain
  // and a financial-year one are different measurements, as calibration found.
  const lotsByAccount = new Map();
  for (const doc of docs) {
    if (!doc.capitalGains?.length || !doc.accountNo) continue;
    const k = `${doc.provider}\u0000${doc.accountNo}\u0000${doc.periodFrom}..${doc.periodTo}`;
    const e = lotsByAccount.get(k) ?? { doc, st: 0, lt: 0 };
    for (const g of doc.capitalGains) {
      e.st += isNum(g.shortTerm) ? g.shortTerm : 0;
      e.lt += isNum(g.longTerm) ? g.longTerm : 0;
    }
    lotsByAccount.set(k, e);
  }
  for (const [k, e] of lotsByAccount) {
    const [provider, accountNo, window] = k.split("\u0000");
    const stated = docs.find((d) => d.provider === provider && d.accountNo === accountNo
      && isNum(d.flows?.realized) && `${d.flows.periodFrom}..${d.flows.periodTo}` === window);
    if (!stated) continue;
    add(e.doc, "realised gain: lots vs statement", `${accountNo} ${window}`,
      round2(e.st + e.lt), stated.flows.realized);
  }
  return out;
}

function unresolved(docs, symbolMap) {
  const securities = new Map();
  const owners = new Map();
  const reportTypes = new Map();

  for (const d of docs) {
    if (d.owner && !d.ownerId) {
      const e = owners.get(d.owner) ?? { name: d.owner, docs: [] };
      e.docs.push(d.docKey);
      owners.set(d.owner, e);
    }
    // Two ways a report type goes unread, and both belong here. `no-extractor`
    // means no provider module claimed the document at all; `no-reader-for-
    // report-type` means the provider is known but this particular report has no
    // reader yet and was left unread rather than half-read. Listing only the
    // first made a drop with two dozen deliberately-unread statements look as
    // though everything had a reader.
    const unread = d.warnings.find((w) => w.code === "no-extractor" || w.code === "no-reader-for-report-type");
    if (d.status === "failed" && unread) {
      const k = `${d.provider} / ${d.reportType}`;
      const e = reportTypes.get(k) ?? { provider: d.provider, reportType: d.reportType, reason: unread.code, docs: [] };
      e.docs.push(d.docKey);
      reportTypes.set(k, e);
    }
    for (const h of d.holdings) {
      if (isCash(h)) continue;
      // Listed equity is the only thing an NSE symbol could exist for; fund
      // units having none is expected, not a gap.
      if (h.assetClass && h.assetClass !== "Equity") continue;
      // The symbol map is keyed on securityKey, not ISIN: not one statement in
      // this book prints an ISIN. See scripts/build-nse-symbols.mjs.
      if (h.symbol || symbolMap[h.securityKey] || (h.isin && symbolMap[h.isin])) continue;
      const e = securities.get(h.securityKey) ?? { security: h.security, securityKey: h.securityKey, docs: new Set() };
      e.docs.add(d.docKey);
      securities.set(h.securityKey, e);
    }
  }
  return {
    securitiesWithoutSymbol: [...securities.values()].map((e) => ({ ...e, docs: [...e.docs] })),
    ownerNamesUnmatched: [...owners.values()],
    reportTypesWithoutExtractor: [...reportTypes.values()],
    knownOwners: OWNERS.map((o) => ({ ownerId: o.ownerId, displayName: o.displayName })),
    providersWithPrecedence: PROVIDERS_WITH_PRECEDENCE,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function reconcile(docs, opts = {}) {
  const symbolMap = opts.symbolMap ?? {};
  const rowSums = docs.flatMap((d) => rowSumChecks(d, docs));
  const derived = docs.flatMap((d) => derivedVsPrinted(d, docs));
  const deltas = crossReportDeltas(docs);
  const { groups: duplicates, quantityOnly: quantityOnlyMatches, confirmedSeparate } = duplicateHoldings(docs);
  const duplicateEarnings = duplicateAifEarnings(docs);
  // Tag the matching rows before any consolidated figure is computed.
  applyDedupePolicy(docs, duplicates);
  const consolidated = consolidatedValue(docs);
  const dated = datedTableChecks(docs);
  const cov = coverage(docs, opts.pdfCount ?? docs.length, opts.duplicateSources ?? []);
  const unres = unresolved(docs, symbolMap);
  const stitches = docs.flatMap((d) => (d.stitches ?? []).map((s) => ({ docKey: d.docKey, ...s })));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      documents: docs.length,
      parsed: cov.parsed, partial: cov.partial, failed: cov.failed,
      rowSumChecks: rowSums.length,
      totalMismatches: rowSums.filter((r) => !r.matches).length,
      totalsMaterial: rowSums.filter((r) => r.severity === "material").length,
      totalsExplained: rowSums.filter((r) => r.severity === "explained").length,
      totalsRounding: rowSums.filter((r) => r.severity === "rounding").length,
      derivedVsPrintedDeltas: derived.length,
      derivedMaterial: derived.filter((d) => d.severity === "material").length,
      derivedExplained: derived.filter((d) => d.severity === "explained").length,
      derivedRounding: derived.filter((d) => d.severity === "rounding").length,
      datedChecks: dated.length,
      datedMaterial: dated.filter((d) => d.severity === "material").length,
      datedExplained: dated.filter((d) => d.severity === "explained").length,
      datedRounding: dated.filter((d) => d.severity === "rounding").length,
      crossReportDeltas: deltas.length,
      suspectedDuplicates: duplicates.length,
      quantityOnlyMatches: quantityOnlyMatches.length,
      confirmedSeparateByFamily: confirmedSeparate.length,
      suspectedDuplicateEarnings: duplicateEarnings.length,
      securitiesWithoutSymbol: unres.securitiesWithoutSymbol.length,
      ownerNamesUnmatched: unres.ownerNamesUnmatched.length,
      stitchesApplied: stitches.length,
    },
    coverage: cov,
    consolidated,
    rowSumChecks: rowSums,
    derivedVsPrinted: derived,
    datedTableChecks: dated,
    crossReportDeltas: deltas,
    duplicateHoldings: duplicates,
    quantityOnlyMatches,
    confirmedSeparate,
    duplicateAifEarnings: duplicateEarnings,
    unresolved: unres,
    stitches,
  };
}

const fmt = (n) => (isNum(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—");
const esc = (s) => String(s ?? "—").replace(/\|/g, "\\|");

export function renderMarkdown(r) {
  const L = [];
  L.push("# Extraction report");
  L.push("");
  L.push("Whether the extracted figures tie out. Generated by `npm run extract` — **do not edit by hand**.");
  L.push("");
  L.push(`_Generated ${r.generatedAt}._`);
  L.push("");

  if (!r.summary.documents) {
    L.push("## Nothing extracted yet");
    L.push("");
    L.push("No PDFs were found under `source/`. Drop the statements there, run `npm run inventory`,");
    L.push("then `npm run extract`. This is the expected state before the first data drop, not a failure.");
    L.push("");
    L.push("The extraction engine, the precedence table and the reconciliation checks below are in place");
    L.push("and will run against the statements as soon as they land.");
    L.push("");
    return L.join("\n");
  }

  L.push("## Summary");
  L.push("");
  L.push("| | |");
  L.push("| --- | ---: |");
  L.push(`| Documents | ${r.summary.documents} |`);
  L.push(`| Fully parsed | ${r.summary.parsed} |`);
  L.push(`| Partial | ${r.summary.partial} |`);
  L.push(`| Failed | ${r.summary.failed} |`);
  L.push(`| Row-sum checks run | ${r.summary.rowSumChecks} |`);
  L.push(`| **Row-sum vs printed-total mismatches** | **${r.summary.totalMismatches}** |`);
  L.push(`| **Derived vs printed deltas** | **${r.summary.derivedVsPrintedDeltas}** |`);
  L.push(`| **Cross-report deltas** | **${r.summary.crossReportDeltas}** |`);
  L.push(`| **Suspected duplicate holdings** | **${r.summary.suspectedDuplicates}** |`);
  L.push(`| Matching holdings confirmed separate by the family | ${r.summary.confirmedSeparateByFamily ?? 0} |`);
  L.push(`| Securities with no NSE symbol | ${r.summary.securitiesWithoutSymbol} |`);
  L.push(`| Owner names unmatched | ${r.summary.ownerNamesUnmatched} |`);
  L.push(`| Split numbers stitched | ${r.summary.stitchesApplied} |`);
  L.push("");

  // ── a ──
  L.push("## a) Row sums vs printed totals");
  L.push("");
  L.push("Does each table's own total equal the sum of its own rows? Where it does not, BOTH figures are");
  L.push("shown with the delta. Neither is preferred here — see `scripts/ingest/precedence.mjs`.");
  L.push("");
  L.push("`rounding` is within the printing precision. `explained` is reproduced exactly from a known");
  L.push("basis difference, with the cause named below the table. **`material` is neither, and blocks");
  L.push("the golden test.**");
  L.push("");
  if (!r.rowSumChecks.length) {
    L.push("_No table carried both rows and a printed total._");
  } else {
    L.push(`Of ${r.rowSumChecks.length} checks: ${r.summary.totalsExplained} explained, `
      + `${r.summary.totalsRounding} rounding, **${r.summary.totalsMaterial} material**.`);
    L.push("");
    L.push("| Document | Check | Row sum | Printed | Delta | Rows | Severity |");
    L.push("| --- | --- | ---: | ---: | ---: | ---: | :--- |");
    for (const c of r.rowSumChecks) {
      const sev = c.matches ? "ties out"
        : c.severity === "material" ? "**MATERIAL**"
        : c.severity ?? "—";
      L.push(`| \`${esc(c.docKey)}\` | ${esc(c.check)} | ${fmt(c.rowSum)} | ${fmt(c.printedTotal)} | ${fmt(c.delta)} | ${c.rowsSummed}${c.rowsMissingField ? ` (+${c.rowsMissingField} blank)` : ""} | ${sev} |`);
    }
    const causes = [...new Set(r.rowSumChecks.map((c) => c.cause).filter(Boolean))];
    if (causes.length) {
      L.push("");
      L.push("Causes named:");
      for (const c of causes) L.push(`- ${esc(c)}`);
    }
  }
  L.push("");

  // ── consolidated ──
  if (r.consolidated) {
    L.push("## Consolidated position");
    L.push("");
    L.push("Each `dedupeGroup` is counted ONCE. The naive sum is shown beside it so the");
    L.push("difference is never invisible — see section (c).");
    L.push("");
    L.push("| | |");
    L.push("| --- | ---: |");
    L.push(`| Sum of every reported holding | ${fmt(r.consolidated.naive)} |`);
    L.push(`| **Consolidated (duplicates counted once)** | **${fmt(r.consolidated.deduped)}** |`);
    L.push(`| Removed as double-counted | ${fmt(r.consolidated.doubleCounted)} |`);
    L.push("");
  }

  // ── a2 ──
  L.push("## a2) Derived vs printed");
  L.push("");
  L.push("Every derivable figure is COMPUTED from the statement's primitives (market value =");
  L.push("price x quantity, gain = value - cost, weights against total portfolio value) and then");
  L.push("compared against what the statement printed. The derived value is what the book uses;");
  L.push("the printed one is evidence. A delta here is the report disagreeing with itself.");
  L.push("");
  if (!r.derivedVsPrinted?.length) {
    L.push("_Every derived figure matched the printed one._");
  } else {
    L.push(`Of ${r.derivedVsPrinted.length} deltas: ${r.summary.derivedExplained} explained, `
      + `${r.summary.derivedRounding} rounding, **${r.summary.derivedMaterial} material**.`);
    L.push("");
    const causes = [...new Set(r.derivedVsPrinted.map((d) => d.cause).filter(Boolean))];
    if (causes.length) {
      L.push("Causes named:");
      for (const c of causes) L.push(`- ${esc(c)}`);
      L.push("");
    }
    // Rounding deltas are reported IN AGGREGATE — there are hundreds and each is
    // the statement's display convention, not a disagreement. Explained and
    // material ones are listed per row.
    const listed = r.derivedVsPrinted.filter((d) => d.severity !== "rounding");
    if (!listed.length) {
      L.push("_Every delta is rounding; nothing to list per row._");
    } else {
      L.push("| Document | Security | Field | Derived | Printed | Delta | Severity |");
      L.push("| --- | --- | --- | ---: | ---: | ---: | :--- |");
      for (const d of listed) {
        const sev = d.severity === "material" ? "**MATERIAL**" : d.severity;
        L.push(`| \`${esc(d.docKey)}\` | ${esc(d.security)} | ${esc(d.field)} | ${fmt(d.derived)} | ${fmt(d.printed)} | ${fmt(d.delta)} | ${sev} |`);
      }
    }
  }
  L.push("");

  // ── a3 ──
  L.push("## a3) Dated statements vs their own printed figures");
  L.push("");
  L.push("Every dated table joins the same check as the holdings tables: what the pipeline derives");
  L.push("against what the statement printed, per row.");
  L.push("");
  if (!r.datedTableChecks?.length) {
    L.push("_No dated table carried a derivable figure alongside a printed one._");
  } else {
    const byCheck = new Map();
    for (const d of r.datedTableChecks) {
      const e = byCheck.get(d.check) ?? { n: 0, ok: 0, rounding: 0, material: 0 };
      e.n++; e[d.severity] = (e[d.severity] ?? 0) + 1;
      byCheck.set(d.check, e);
    }
    L.push("| Check | Rows | Ties out | Rounding | Material |");
    L.push("| --- | ---: | ---: | ---: | ---: |");
    for (const [check, e] of byCheck) {
      L.push(`| ${esc(check)} | ${e.n} | ${e.ok ?? 0} | ${e.rounding ?? 0} | ${e.material ? `**${e.material}**` : 0} |`);
    }
    const bad = r.datedTableChecks.filter((d) => d.severity === "material");
    if (bad.length) {
      L.push("");
      L.push("| Document | Check | Row | Derived | Printed | Delta |");
      L.push("| --- | --- | --- | ---: | ---: | ---: |");
      for (const d of bad.slice(0, 60)) {
        L.push(`| \`${esc(d.docKey)}\` | ${esc(d.check)} | ${esc(d.row)} | ${fmt(d.derived)} | ${fmt(d.printed)} | ${fmt(d.delta)} |`);
      }
      if (bad.length > 60) L.push("");
      if (bad.length > 60) L.push(`_${bad.length - 60} further material row(s) in \`docs/extraction-report.json\`._`);
    }
  }
  L.push("");

  // ── b ──
  L.push("## b) Cross-report deltas");
  L.push("");
  L.push("Same account, same as-of date, different report — field by field.");
  L.push("");
  if (!r.crossReportDeltas.length) {
    L.push("_No two reports covered the same account and date, or none disagreed._");
  } else {
    L.push("| Account | As of | Field | Security | A | B | Delta | Precedence says |");
    L.push("| --- | --- | --- | --- | ---: | ---: | ---: | --- |");
    for (const d of r.crossReportDeltas) {
      const a = `${d.a.reportType}: ${fmt(d.a.value)}`;
      const b = `${d.b.reportType}: ${fmt(d.b.value)}`;
      L.push(`| ${esc(d.accountNo)} | ${esc(d.asOf)} | ${esc(d.field)} | ${esc(d.security ?? "—")} | ${a} | ${b} | ${fmt(d.delta)} | ${esc(d.authoritative)} |`);
    }
  }
  L.push("");

  // ── c ──
  L.push("## c) Suspected duplicate holdings across owners");
  L.push("");
  L.push("Identical security, units and cost appearing under DIFFERENT owners.");
  L.push("");
  L.push("**Policy — carry both, count once.** Neither row is suppressed: each owner's account view");
  L.push("shows their statement exactly as printed, matching rows share a `dedupeGroup`, and");
  L.push("consolidated family totals count each group ONCE. `alsoReportedUnder` names the other");
  L.push("owners so the UI can flag it. This is reversible policy, not a fact, and is **pending the");
  L.push("family's answer** for each group below — it lives in one function in `reconcile.mjs`, and");
  L.push("the family's answers are `SEPARATE_INVESTMENTS` in `shared/separateInvestments.mjs`.");
  L.push("");
  if (!r.duplicateHoldings.length) {
    L.push("_None detected._");
  } else {
    for (const d of r.duplicateHoldings) {
      L.push(`### ${esc(d.security)}`);
      L.push("");
      L.push(`Units ${fmt(d.quantity)} · cost ${fmt(d.totalCost)} · market value ${fmt(d.marketValue)}`);
      L.push("");
      L.push(`**Counted once in consolidated totals; ${fmt(d.doubleCountRisk)} excluded from the naive sum.**`);
      L.push("");
      L.push(`dedupeGroup \`${esc(d.dedupeGroup)}\``);
      L.push("");
      L.push("| Owner | Account | As of | Report | Document |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const o of d.occurrences) {
        L.push(`| ${esc(o.owner)} | ${esc(o.accountNo)} | ${esc(o.asOf)} | ${esc(o.reportType)} | \`${esc(o.docKey)}\` |`);
      }
      L.push("");
    }
  }

  L.push("### Confirmed separate by the family — counted in full");
  L.push("");
  L.push("The figures coincide and the family has said these are separate investments, one per");
  L.push("account. Detected here because the coincidence is a fact about the statements; never grouped,");
  L.push("so every figure counts each account's holding.");
  L.push("");
  if (!(r.confirmedSeparate ?? []).length) {
    L.push("_None._");
  } else {
    for (const d of r.confirmedSeparate) {
      L.push(`**${esc(d.security)} · ${fmt(d.quantity)} units · ${d.occurrences.length} accounts · confirmed ${esc(d.confirmed)}**`);
      L.push("");
      L.push(esc(d.resolution));
      L.push("");
      L.push("| Owner | Account | As of | Report | Document |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const o of d.occurrences) {
        L.push(`| ${esc(o.owner)} | ${esc(o.accountNo)} | ${esc(o.asOf)} | ${esc(o.reportType)} | \`${esc(o.docKey)}\` |`);
      }
      L.push("");
    }
  }
  L.push("");

  L.push("### Matched on QUANTITY ALONE — reported, and NOT deduped");
  L.push("");
  L.push("Rows on different accounts that share a security and a unit count, and share no other");
  L.push("figure — because no statement here values them. **One figure coinciding is not evidence");
  L.push("of one holding**: two holders subscribing the same round number of units to the same fund");
  L.push("is an ordinary event, and this book's own note already says India SME's three folios");
  L.push("print coincidentally equal units. So these are carried as SEPARATE holdings and named");
  L.push("here, rather than sharing a `dedupeGroup` that would halve a real position the day one of");
  L.push("these funds publishes a NAV.");
  L.push("");
  if (!(r.quantityOnlyMatches ?? []).length) {
    L.push("_None detected._");
  } else {
    for (const d of r.quantityOnlyMatches) {
      L.push(`**${esc(d.security)} · ${fmt(d.quantity)} units · ${d.accounts.length} accounts**`);
      L.push("");
      L.push(esc(d.resolution));
      L.push("");
      L.push("| Owner | Account | As of | Report | Document |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const o of d.occurrences) {
        L.push(`| ${esc(o.owner)} | ${esc(o.accountNo)} | ${esc(o.asOf)} | ${esc(o.reportType)} | \`${esc(o.docKey)}\` |`);
      }
      L.push("");
    }
  }
  L.push("");

  L.push("### AIF income reported under two folios");
  L.push("");
  L.push("Identical income heads, units and totals on DIFFERENT folios. An income-only folio");
  L.push("carries no holdings, so the check above cannot see it.");
  L.push("");
  if (!(r.duplicateAifEarnings ?? []).length) {
    L.push("_None detected._");
  } else {
    for (const d of r.duplicateAifEarnings) {
      L.push(`**Class ${esc(d.unitClass)} · ${fmt(d.units)} units · income ${fmt(d.totalIncome)} · net ${fmt(d.netIncome)}**`);
      L.push("");
      L.push(d.confirmedSeparate
        ? esc(d.resolution)
        : `Nothing aggregates \`aifEarnings\` today, so no figure on screen is affected. ${fmt(d.doubleCountRisk)} is what a naive sum across these folios would invent.`);
      L.push("");
      L.push("| Owner | Folio | As of | Report | Document |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const o of d.occurrences) {
        L.push(`| ${esc(o.owner)} | ${esc(o.accountNo)} | ${esc(o.asOf)} | ${esc(o.reportType)} | \`${esc(o.docKey)}\` |`);
      }
      L.push("");
    }
  }

  // ── d ──
  L.push("## d) Coverage");
  L.push("");
  L.push(`PDFs found ${r.coverage.pdfsFound} · fully parsed ${r.coverage.parsed} · partial ${r.coverage.partial} · failed ${r.coverage.failed}`);
  L.push("");
  if (r.coverage.duplicateSources?.length) {
    L.push(`### Byte-identical duplicates in the drop (${r.coverage.duplicateSources.length}) — extracted once`);
    L.push("");
    for (const d of r.coverage.duplicateSources) {
      L.push(`- \`${esc(d.path)}\` is the same file as \`${esc(d.sameAs)}\``);
    }
    L.push("");
  }
  const providers = Object.entries(r.coverage.byProvider);
  if (providers.length) {
    L.push("| Provider | Report type | OK | Partial | Failed |");
    L.push("| --- | --- | ---: | ---: | ---: |");
    for (const [provider, types] of providers) {
      for (const [rt, c] of Object.entries(types)) {
        L.push(`| ${esc(provider)} | ${esc(rt)} | ${c.ok} | ${c.partial} | ${c.failed} |`);
      }
    }
    L.push("");
  }
  if (r.coverage.failed) {
    L.push("### Failed");
    L.push("");
    for (const f of r.coverage.failures) {
      L.push(`- \`${esc(f.sourcePath)}\` — ${f.reasons.join("; ") || "no reason recorded"}`);
    }
    L.push("");
  }
  if (r.coverage.partial) {
    L.push("### Partial");
    L.push("");
    for (const p of r.coverage.partials) {
      L.push(`- \`${esc(p.sourcePath)}\` — ${p.reasons.slice(0, 6).join("; ")}${p.reasons.length > 6 ? ` … (+${p.reasons.length - 6} more)` : ""}`);
    }
    L.push("");
  }

  // ── e ──
  L.push("## e) Unresolved");
  L.push("");
  const u = r.unresolved;
  L.push("### Security names with no NSE symbol");
  L.push("");
  if (!u.securitiesWithoutSymbol.length) L.push("_None._");
  else {
    L.push("Listed equity only — fund units are expected to have no ticker.");
    L.push("");
    for (const s of u.securitiesWithoutSymbol) L.push(`- ${esc(s.security)} (\`${esc(s.securityKey)}\`)`);
  }
  L.push("");
  L.push("### Owner names matching no canonical owner");
  L.push("");
  if (!u.ownerNamesUnmatched.length) L.push("_None — every account resolved._");
  else {
    L.push("Add an alias in `shared/owners.mjs`. Left unresolved, each of these becomes a separate");
    L.push("person and splits the family book.");
    L.push("");
    for (const o of u.ownerNamesUnmatched) L.push(`- **${esc(o.name)}** — in ${o.docs.map((d) => `\`${d}\``).join(", ")}`);
  }
  L.push("");
  L.push("### Report types left unread");
  L.push("");
  if (!u.reportTypesWithoutExtractor.length) L.push("_None — every report type has a reader._");
  else {
    L.push("Declared, not half-read: `no-extractor` means no provider module claimed the document;");
    L.push("`no-reader-for-report-type` means the provider is known but this report has no reader yet.");
    L.push("");
    for (const t of u.reportTypesWithoutExtractor) {
      L.push(`- ${esc(t.provider)} / **${esc(t.reportType)}** — ${t.docs.length} document(s), \`${esc(t.reason)}\``);
    }
  }
  L.push("");

  L.push("---");
  L.push("");
  L.push("No figure in this report is computed from anything but the statements themselves. A cell the");
  L.push("parser could not read confidently is null, not zero, and appears above as a gap rather than a");
  L.push("number.");
  L.push("");
  return L.join("\n");
}

export function writeReports(report, docsDir) {
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "extraction-report.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(docsDir, "EXTRACTION-REPORT.md"), renderMarkdown(report));
}
