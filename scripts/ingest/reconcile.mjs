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

function rowSumChecks(doc) {
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

  const check = (label, sum, printed, tolerance = MONEY_TOLERANCE, incomeInclusive = false) => {
    if (!sum || !isNum(printed)) return;
    const delta = round2(sum.value - printed);
    const explainedByIncome = incomeInclusive && accrued > 0 && Math.abs(delta + accrued) <= 1;
    out.push({
      docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo,
      asOf: doc.asOf, reportType: doc.reportType,
      check: label,
      rowSum: sum.value, printedTotal: printed, delta,
      rowsSummed: sum.rows, rowsMissingField: sum.missing,
      matches: Math.abs(delta) <= tolerance,
      severity: Math.abs(delta) <= tolerance ? "ok"
        : explainedByIncome ? "explained"
        : Math.abs(delta) <= 1 ? "rounding" : "material",
      cause: explainedByIncome
        ? `printed total is income-inclusive; the market-value column is not. Delta equals the accrued income on this account (${accrued.toLocaleString("en-IN")}).`
        : null,
      accruedIncome: accrued || null,
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
 * Compare every DERIVED figure against the one the statement printed.
 *
 * This is where a report's own internal inconsistency becomes visible instead of
 * being silently imported — the Appraisal's %Assets is computed on an
 * income-inclusive basis its market-value column excludes, so its printed
 * percentage and its own MV disagree by a few basis points on every row. The
 * derived value is what the book uses; the printed one is evidence, and the
 * delta is reported rather than resolved.
 */
function derivedVsPrinted(doc) {
  const out = [];
  for (const h of doc.holdings) {
    for (const field of DERIVED_FIELDS) {
      const derived = h[field];
      const printed = h.printed?.[field];
      if (!isNum(derived) || !isNum(printed)) continue;
      const delta = round2(derived - printed);
      if (delta === 0) continue;
      const basis = field === "pctAssets" && explainedByIncomeBasis(h, doc.totals?.totalMarketValue);
      out.push({
        docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo,
        asOf: doc.asOf, reportType: doc.reportType,
        security: h.security, securityKey: h.securityKey,
        field, derived, printed, delta,
        severity: basis ? "explained" : classifyDelta(field, delta),
        cause: basis
          ? "printed %Assets is (market value + accrued income) / (total incl. income); the derived figure is on the ex-income basis of the market-value column. Reproduced exactly."
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
 * PENDING CONFIRMATION FROM 360 ONE. This is reversible policy, not a fact, and
 * it lives here alone so it can be changed in one place.
 *
 * The 360 ONE Special Opportunities Fund Series 8 Class A3 appears with
 * byte-identical figures under CRN37702 and CRN60117. Rather than suppress
 * either — which would either lose a real holding or invent one — matching rows
 * are given a shared `dedupeGroup` id and each is told which other owners report
 * it. Consequences, applied consistently everywhere downstream:
 *
 *   • Each owner's ACCOUNT view shows their statement exactly as printed.
 *   • CONSOLIDATED family totals count each dedupeGroup ONCE.
 *   • `alsoReportedUnder` lets the UI show a pill on the affected rows.
 *
 * @param docs mutated in place: matching holdings gain dedupeGroup + alsoReportedUnder.
 */
function applyDedupePolicy(docs, groups) {
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

function duplicateHoldings(docs) {
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
  for (const [, entries] of byFigures) {
    if (entries.length < 2) continue;
    const owners = new Set(entries.map((e) => e.doc.ownerId ?? e.doc.owner ?? "(unknown)"));
    // Two reports of the SAME account and date are check (b) — one document per
    // account/date pair is what makes this a double-report rather than the same
    // statement seen twice.
    const accountDates = new Set(entries.map((e) => `${e.doc.accountNo}@${e.doc.asOf}`));
    if (accountDates.size < 2) continue;
    const first = entries[0].h;
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
  return out.sort((a, b) => (b.doubleCountRisk ?? 0) - (a.doubleCountRisk ?? 0));
}

// ── d) + e) Coverage and unresolved ──────────────────────────────────────────

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
  const add = (doc, check, key, derived, printed, tolerance = MONEY_TOLERANCE) => {
    if (!isNum(derived) || !isNum(printed)) return;
    const delta = round2(derived - printed);
    out.push({
      docKey: doc.docKey, provider: doc.provider, accountNo: doc.accountNo,
      asOf: doc.asOf, reportType: doc.reportType,
      check, row: key, derived, printed, delta,
      matches: Math.abs(delta) <= tolerance,
      severity: Math.abs(delta) <= tolerance ? "ok" : classifyDelta("amount", delta),
    });
  };

  for (const doc of docs) {
    for (const t of doc.transactions ?? []) {
      add(doc, "transaction settlement", `${t.date} ${t.side} ${t.security}`, t.net, t.printed?.settlementAmount);
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
  const rowSums = docs.flatMap(rowSumChecks);
  const derived = docs.flatMap(derivedVsPrinted);
  const deltas = crossReportDeltas(docs);
  const duplicates = duplicateHoldings(docs);
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
      datedRounding: dated.filter((d) => d.severity === "rounding").length,
      crossReportDeltas: deltas.length,
      suspectedDuplicates: duplicates.length,
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
  L.push("owners so the UI can flag it. This is reversible policy, not a fact, and is **pending");
  L.push("confirmation from the provider** — it lives in one function in `reconcile.mjs`.");
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
