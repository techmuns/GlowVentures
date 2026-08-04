#!/usr/bin/env node
// GOLDEN FILE TEST — figures taken from the real statements.
//
// This is the acceptance spec for the extraction engine. Every number below was
// read off a real report by a human; if the extractor cannot reproduce them, the
// extractor is wrong and the book built on it would be wrong too.
//
// Four outcomes, and the differences between them all matter:
//
//   PASS         every expected figure was reproduced.
//   FAIL         a document was found but a figure came out wrong or missing.
//                The extractor needs fixing. Exit code 1.
//   BLOCKED      the source statements are not present, so nothing could be
//                checked. Exit code 2 — NOT a pass. A test that silently
//                "passes" because it had nothing to test is worse than no test:
//                it reports confidence that was never earned.
//   NOT CHECKED  the statement is here but this engine has no reader for that
//                report type, so the figure was never read. Marked `pending`
//                with the reason, counted apart from both passes and failures,
//                and printed at the end so it stays a visible to-do.
//
// FAIL outranks BLOCKED: a wrong figure is a defect whatever else is missing.
//
// Run: node scripts/ingest/__tests__/golden.mjs   (or `npm run test:ingest`)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");

// ── The expected figures ─────────────────────────────────────────────────────

// A figure the engine cannot check yet, and why. Listed, never silently dropped:
// an expectation that quietly disappears is indistinguishable from one that
// passed. These are counted separately and reported at the end.
const pending = (reason) => ({ pending: reason });

const CURRENT_PORTFOLIO_TOTALS_NOT_READ =
  "CURRENT PORTFOLIO's own TOTALS are deliberately not read. Precedence names the " +
  "appraisal authoritative for every figure it duplicates, and its total G/L is on " +
  "a different basis (accrued income added on every row). Only the two fields it " +
  "alone carries — per-position accrued income and IRR% — are taken from it.";

const GOLDEN = [
  {
    label: "Goldstandard · account 100023 · Aristos Equity Portfolio · as of 2026-07-10",
    match: { provider: /goldstandard/i, accountNo: "100023" },
    asOf: "2026-07-10",
    owner: { printed: "Ajay Thakurdas Jaisinghani", ownerId: "ajay-jaisinghani" },
    inceptionDate: "2025-12-26",
    strategy: "Aristos Equity Portfolio",
    engagement: "PMS",

    // Totals — from PortfolioAppraisal (the precedence-authoritative source).
    totals: {
      reportType: "appraisal",
      equityMarketValue: 178050895,
      cashValue: 3482781.83,
      totalMarketValue: 181533676.83,
      equityCost: 171713740.60,
      totalCost: 175196522.44,
      gainLoss: 5957554,
      pctGainLoss: 3.47,
    },
    positionCounts: { equity: 31, cash: 1 },

    // The SAME account and date, a different report, a different total G/L.
    alternateTotals: [
      {
        reportType: "holdings",
        gainLoss: pending(CURRENT_PORTFOLIO_TOTALS_NOT_READ),
        pctGainLoss: pending(CURRENT_PORTFOLIO_TOTALS_NOT_READ),
        note: "CurrentPortfolio prints 6,744,704 / 3.93% — it folds accrued income into G/L on every row.",
      },
    ],

    // ── The dated statements ────────────────────────────────────────────────
    // Read for the first time this pass. Each carries its own window, and the
    // windows differ: the transaction statement and the bank book run the
    // financial year to date, the fact sheet runs since inception.
    dated: {
      transactions: {
        count: 20,
        window: ["2026-04-01", "2026-07-10"],
        // Derived to the paisa and reconciled against the printed settlement.
        // Brokerage is a per-UNIT RATE on these statements (0.135 against a
        // 14,790-share sale at 135.00), which is what makes 1,992,656.66 come
        // out exactly rather than 1,996,650 short of it.
        rows: [
          { date: "2026-04-09", side: "buy", security: /indian energy exchange/i,
            quantity: 22476, unitPrice: 128.8256, brokerageRate: 0.1288, stt: 2895.50,
            gross: 2895484.19, brokerage: 2894.91, net: 2901274.60,
            printedSettlement: 2901274.59 },
          { date: "2026-05-06", side: "sell", security: /jammu.*kashmir bank/i,
            quantity: 14790, unitPrice: 135.00, gross: 1996650, charges: 3993.34, net: 1992656.66,
            printedSettlement: 1992656.66 },
        ],
      },
      // The bank book's closing balance is the appraisal's cash line, to the paisa.
      bankBook: { rows: 60, closingBalance: 3482781.83 },
      expenses: { rows: 26, total: 464234.86 },
      dividends: {
        rows: 17,
        first: { security: /can fin homes/i, exDate: "2026-07-03", quantity: 7000, ratePerUnit: 8, netAmount: 56000 },
      },
      // Per-position accrued income and IRR%, the two fields CURRENT PORTFOLIO
      // alone carries.
      currentPortfolio: [
        { security: /sundaram finance/i, accruedIncome: 40200, positionIrrPct: 11.87 },
      ],
    },

    // Two DIFFERENT flow blocks, on two different windows. The fact sheet's
    // Portfolio Summary runs since inception (26/12/2025); the performance
    // summary runs the financial year to date (01/04/2026 to 10/07/2026). Both
    // are real and neither is a restatement of the other.
    flowBlocks: [
      { reportType: "fact-sheet", contribution: 175000000, withdrawal: 41000, profit: 6574677, corpus: 181533677 },
      {
        reportType: "performance-summary",
        netCapitalInOut: -22975, realized: 415051.23, unrealized: 25401289.68,
        income: 234150, fees: 404305.18, expenses: 59929.70,
        // The CLOSING value. This report prints "Market Value as of" twice —
        // 155,590,795.80 opening on 01/04/2026 and this one closing on
        // 10/07/2026 — and corpus is the close, which is what ties to the
        // appraisal's total and to the fact sheet's Portfolio Value.
        corpus: 181533676.83,
      },
    ],

    // "YTD" on the statement is the INDIAN FY to date — the performance summary
    // covering 01/04/2026 to 10/07/2026 prints the same 16.69% — so it is stored
    // as fytd. SI is NOT annualised: inception 26/12/2025 is ~6.5 months before
    // the report, and the provider annualises only past a year.
    returns: [
      { reportType: "fact-sheet", series: /^portfolio$/i, mtd: 2.35, qtd: 2.35, fytd: 16.69, si: 3.76, siAnnualised: false },
      { reportType: "fact-sheet", series: /n50 ?tri|nifty ?50/i, mtd: 0.46, qtd: 0.46, fytd: 7.89, si: -7.73 },
    ],

    holdings: [
      {
        reportType: "appraisal",
        security: /blue jet healthcare/i,
        quantity: 15000, unitCost: 422.73, marketPrice: 574.50,
        totalCost: 6340947.49,
        // DERIVED to the paise: 574.50 x 15,000 and the gain from it. The
        // statement prints the gain rounded to the rupee (2,276,553) and %Assets
        // on its income-inclusive basis (4.75); both are asserted separately
        // under `printed` so the two bases stay visible rather than averaged.
        marketValue: 8617500.00,
        gainLoss: 2276552.51,
        pctGainLoss: 35.90,
        pctAssets: 4.76,
        printed: { gainLoss: 2276553, pctAssets: 4.75 },
      },
      { reportType: "fact-sheet", security: /blue jet healthcare/i, providerSector: "Pharmaceuticals" },
      {
        reportType: "holdings",
        security: /sundaram finance/i,
        accruedIncome: 40200,
        positionIrrPct: 11.87,
      },
    ],
  },
  {
    label: "Goldstandard · account 100022 · Aristos Equity Portfolio · as of 2026-07-10",
    match: { provider: /goldstandard/i, accountNo: "100022" },
    asOf: "2026-07-10",
    owner: { printed: "Ankita Bharat Jaisinghani", ownerId: "ankita-jaisinghani" },
    strategy: "Aristos Equity Portfolio",
    engagement: "PMS",
    totals: {
      reportType: "appraisal",
      equityMarketValue: 76811725.50,
      cashValue: 883627.86,
      totalMarketValue: 77695353.36,
      totalCost: 75107865.67,
      gainLoss: 2430288,
    },
    positionCounts: { equity: 31, cash: 1 },
    flowBlocks: [
      { reportType: "fact-sheet", contribution: 75000000, withdrawal: 16894, profit: 2712247, corpus: 77695353 },
    ],
    returns: [
      { reportType: "fact-sheet", series: /^portfolio$/i, mtd: 2.30, qtd: 2.30, fytd: 16.58, si: 3.62 },
      { reportType: "fact-sheet", series: /n50 ?tri|nifty ?50/i, mtd: 0.46, qtd: 0.46, fytd: 7.89, si: -7.73 },
    ],
  },
  {
    label: "Green Lantern · account 510861 · GLC Growth Fund · as of 2026-06-25",
    match: { provider: /green lantern/i, accountNo: "510861" },
    asOf: "2026-06-25",
    owner: { printed: "AJAY T JAISINGHANI", ownerId: "ajay-jaisinghani" },
    engagement: "PMS",
    totals: {
      reportType: "appraisal",
      equityMarketValue: 113482401.26,
      totalMarketValue: 117052230.76,
      gainLoss: 14066326,
    },
    // 32 equity lines plus a Cash section of two — the cash block is on PAGE 2,
    // which is why this case exists: a one-page read loses 3% of the account.
    positionCounts: { equity: 32, cash: 2 },
    dated: {
      // Realised gains as the MANAGER split them short/long term — a tax
      // determination, taken from the statement rather than re-derived here.
      capitalGains: { lots: 28, window: ["2026-04-01", "2026-06-25"], shortTerm: 444305.47, longTerm: -683674.72 },
    },
  },
  {
    label: "Carnelian · account 3517383 · Carnelian Bespoke Portfolio · as of 2026-07-10",
    match: { provider: /carnelian/i, accountNo: "3517383" },
    asOf: "2026-07-10",
    owner: { printed: "AJAY T JAISINGHANI", ownerId: "ajay-jaisinghani" },
    engagement: "PMS",
    totals: {
      reportType: "appraisal",
      equityMarketValue: 370665543.31,
      totalMarketValue: 400475677.94,
      gainLoss: 97292915,
    },
    positionCounts: { equity: 9, cash: 2 },
  },
  {
    label: "360 ONE · Bharat Jaisinghani CRN60117 · as on 2026-06-30",
    match: { provider: /360 ?one/i, accountNo: "60117" },
    asOf: "2026-06-30",
    owner: { printed: "Bharat Jaisinghani", ownerId: "bharat-jaisinghani" },
    // p2 "SUMMARY BY ENGAGEMENT MODELS". Never Advisory-by-default.
    engagement: "Distribution",
    members: ["CRN60117LE53288", "CRN60117LE51867"],
    holdings: [
      {
        reportType: "holdings",
        security: /special opportunities fund.*series 8.*class a3/i,
        quantity: 990429.684,
        totalCost: 9866647.00,
        marketValue: 14580412.51,
        unrealized: 4713765.51,
        pctGainLoss: 47.77,
        // CORRECTED once the statements arrived. This case was BLOCKED — written
        // from the report's documented structure while no 360 ONE PDF was in the
        // drop — and it put 20,37,517 under `realized`. The statement prints that
        // figure in its own column headed "Gain/Loss : Distributed Income *";
        // the column headed "Realized *" prints 0.00, because no units have been
        // redeemed. Both are now checked, on the report's own arithmetic:
        //   unrealized + distributed income + realized = Gain/Loss Total
        //   4,713,765.51 + 2,037,517.00 + 0.00 = 6,751,282.51
        distributedIncome: 2037517.00,
        realized: 0,
        positionIrrPct: 10.86,
        benchmarkIrrPct: 11.93,
        priceAsOn: "2026-06-30",
        derived: { totalGain: 6751282.51 },
      },
    ],
  },
  {
    label: "360 ONE · Ajay T Jaisinghani CRN37702 · as on 2026-05-31",
    match: { provider: /360 ?one/i, accountNo: "37702" },
    asOf: "2026-05-31",
    owner: { printed: "Mr. AJAY T JAISINGHANI", ownerId: "ajay-jaisinghani" },
    engagement: "Distribution",
    members: ["CRN37702LE53856", "CRN37702E29000"],
    holdings: [
      {
        reportType: "holdings",
        security: /special opportunities fund.*series 8.*class a3/i,
        marketValue: 14408473.91,
        unrealized: 4541826.91,
        pctGainLoss: 46.03,
        positionIrrPct: 10.79,
        benchmarkIrrPct: 11.79,
      },
    ],
    corporateActions: { count: 6, date: "2026-05-18", netAmount: 853660 },
  },
];

// ── Harness ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const failures = [];
const blocked = [];        // whole cases with no source document in this drop
const unchecked = [];      // single figures the engine cannot read yet
const MONEY_TOL = 0.011, PCT_TOL = 0.005;

const isPending = (w) => w !== null && typeof w === "object" && typeof w.pending === "string";

function check(label, got, want, tol = MONEY_TOL) {
  // A pending expectation is neither passed nor failed — it is reported as
  // unchecked, with the reason it could not be checked. Counting it either way
  // would be a lie: as a pass it claims confidence nobody earned, as a failure
  // it says the extractor got a number wrong when it never read one.
  if (isPending(want)) { unchecked.push({ label, reason: want.pending }); return false; }
  const ok = typeof want === "number"
    ? typeof got === "number" && Math.abs(got - want) <= tol
    : Object.is(got, want);
  if (ok) { pass++; return true; }
  fail++;
  failures.push({ label, got, want });
  return false;
}

/** The manifest is an array of document entries; null when absent or unreadable. */
function loadManifest() {
  const p = path.join(AUDIT_DIR, "manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(m) ? m : null;
  } catch { return null; }
}

const loadDoc = (docKey) => {
  const p = path.join(AUDIT_DIR, docKey, "document.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
};

/** Documents for one account+date, keyed by reportType. */
function docsFor(manifest, spec) {
  const hits = manifest.filter((d) =>
    spec.match.provider.test(String(d.provider ?? "")) &&
    String(d.accountNo ?? "").includes(spec.match.accountNo) &&
    (!spec.asOf || d.asOf === spec.asOf));
  const byType = new Map();
  for (const h of hits) {
    const doc = loadDoc(h.docKey);
    if (doc) byType.set(h.reportType, doc);
  }
  return byType;
}

function runCase(manifest, spec) {
  console.log(`\n  ${spec.label}`);
  const byType = docsFor(manifest, spec);
  if (!byType.size) {
    // BLOCKED, not FAILED. No statement for this account is in the drop, so
    // nothing about it was tested — the extractor has not been shown to be wrong.
    // Reported loudly and counted apart, never quietly deleted from the spec.
    console.log("    BLOCKED — no statement for this account/date is present in source/");
    blocked.push(spec.label);
    return;
  }

  const pick = (rt) => byType.get(rt) ?? null;
  const any = [...byType.values()][0];

  // Owner must resolve to ONE canonical person across every spelling.
  check(`${spec.label} · ownerId`, any.ownerId, spec.owner.ownerId);
  if (spec.strategy) check(`${spec.label} · strategy`, any.strategy, spec.strategy);
  if (spec.engagement) check(`${spec.label} · engagement`, any.engagement, spec.engagement);
  for (const memberId of spec.members ?? []) {
    const found = (any.members ?? []).some((m) => m.memberId === memberId);
    check(`${spec.label} · member ${memberId} present`, found, true);
  }

  if (spec.inceptionDate) {
    const withInception = [...byType.values()].find((d) => d.inceptionDate);
    check(`${spec.label} · inceptionDate`, withInception?.inceptionDate ?? null, spec.inceptionDate);
  }

  if (spec.totals) {
    const d = pick(spec.totals.reportType);
    for (const [field, want] of Object.entries(spec.totals)) {
      if (field === "reportType") continue;
      check(`${spec.label} · totals.${field}`, d?.totals?.[field] ?? null, want, field.startsWith("pct") ? PCT_TOL : MONEY_TOL);
    }
  }

  if (spec.positionCounts) {
    const d = pick(spec.totals?.reportType ?? "appraisal");
    const hs = d?.holdings ?? [];
    check(`${spec.label} · equity position count`, hs.filter((h) => h.assetClass !== "Cash").length, spec.positionCounts.equity);
    check(`${spec.label} · cash line count`, hs.filter((h) => h.assetClass === "Cash").length, spec.positionCounts.cash);
  }

  for (const alt of spec.alternateTotals ?? []) {
    const d = pick(alt.reportType);
    for (const [field, want] of Object.entries(alt)) {
      if (field === "reportType" || field === "note") continue;
      check(`${spec.label} · ${alt.reportType}.totals.${field}`, d?.totals?.[field] ?? null, want, field.startsWith("pct") ? PCT_TOL : MONEY_TOL);
    }
  }

  for (const block of spec.flowBlocks ?? []) {
    const d = pick(block.reportType);
    for (const [field, want] of Object.entries(block)) {
      if (field === "reportType" || field === "note") continue;
      check(`${spec.label} · ${block.reportType}.flows.${field}`, d?.flows?.[field] ?? null, want);
    }
  }

  for (const want of spec.returns ?? []) {
    const d = pick(want.reportType);
    const series = (d?.returns ?? []).find((s) => want.series.test(s.series));
    if (!series) {
      fail++;
      failures.push({ label: `${spec.label} · return series ${want.series}`, got: "not found", want: "present" });
      continue;
    }
    for (const k of ["mtd", "qtd", "fytd", "si"]) {
      if (want[k] === undefined) continue;
      check(`${spec.label} · ${want.series} ${k.toUpperCase()}`, series[k], want[k], PCT_TOL);
    }
    if (want.siAnnualised !== undefined) {
      check(`${spec.label} · ${want.series} SI annualised?`, series.siAnnualised, want.siAnnualised);
    }
  }

  for (const want of spec.holdings ?? []) {
    const d = pick(want.reportType);
    const h = (d?.holdings ?? []).find((x) => want.security.test(String(x.security ?? "")));
    if (!h) {
      // Every field expected of a document that produced no holdings is
      // unchecked for the same reason; say so once, with that reason, rather
      // than failing on a report the engine openly declines to read.
      const reasons = Object.values(want).filter(isPending).map((v) => v.pending);
      if (reasons.length) unchecked.push({ label: `${spec.label} · ${want.reportType} holdings`, reason: reasons[0] });
      else {
        fail++;
        failures.push({ label: `${spec.label} · holding ${want.security} in ${want.reportType}`, got: "not found", want: "present" });
      }
      continue;
    }
    for (const [field, wantVal] of Object.entries(want)) {
      if (["reportType", "security", "derived", "printed"].includes(field)) continue;
      // Derivable fields are checked against the DERIVED value — that is what the
      // book uses, to the paise.
      check(`${spec.label} · ${h.security} .${field}`, h[field] ?? null, wantVal, field.startsWith("pct") ? PCT_TOL : MONEY_TOL);
    }
    // …and the statement's own PRINTED figure is asserted separately, so the two
    // bases stay visible. Blue Jet's gain is 2,276,552.51 derived and 2,276,553
    // printed; %Assets is 4.76 derived and 4.75 printed. Asserting one against
    // the other would force a tolerance wide enough to hide a real error.
    for (const [field, wantVal] of Object.entries(want.printed ?? {})) {
      check(`${spec.label} · ${h.security} printed.${field}`, h.printed?.[field] ?? null, wantVal,
        field.startsWith("pct") ? PCT_TOL : MONEY_TOL);
    }
    if (want.derived?.totalGain !== undefined) {
      // The statement's own identity, all three components: 360 ONE splits
      // Gain/Loss into Unrealized, Distributed Income and Realized, and prints
      // their sum as Total. Adding only two of the three passed while
      // Distributed Income was being read into the wrong field.
      const got = (h.unrealized ?? 0) + (h.distributedIncome ?? 0) + (h.realized ?? 0);
      check(`${spec.label} · ${h.security} unrealized+distributed+realized = total gain`, got, want.derived.totalGain);
    }
  }

  // ── The dated statements ──────────────────────────────────────────────────
  const D = spec.dated;
  if (D) {
    const tx = pick("transaction-statement");
    if (D.transactions) {
      check(`${spec.label} · transaction count`, tx?.transactions?.length ?? null, D.transactions.count);
      if (D.transactions.window) {
        check(`${spec.label} · transaction window from`, tx?.periodFrom ?? null, D.transactions.window[0]);
        check(`${spec.label} · transaction window to`, tx?.periodTo ?? null, D.transactions.window[1]);
      }
      for (const want of D.transactions.rows ?? []) {
        const t = (tx?.transactions ?? []).find((x) => x.date === want.date && x.side === want.side
          && want.security.test(String(x.security ?? "")));
        if (!t) {
          fail++;
          failures.push({ label: `${spec.label} · trade ${want.date} ${want.side} ${want.security}`, got: "not found", want: "present" });
          continue;
        }
        for (const [k, v] of Object.entries(want)) {
          if (["date", "side", "security", "printedSettlement"].includes(k)) continue;
          check(`${spec.label} · ${t.security} ${want.date} .${k}`, t[k] ?? null, v);
        }
        if (want.printedSettlement !== undefined) {
          check(`${spec.label} · ${t.security} ${want.date} printed settlement`,
            t.printed?.settlementAmount ?? null, want.printedSettlement);
        }
      }
    }
    if (D.capitalGains) {
      const cg = pick("capital-gain");
      const lots = cg?.capitalGains ?? [];
      check(`${spec.label} · capital-gain lots`, lots.length, D.capitalGains.lots);
      if (D.capitalGains.window) {
        check(`${spec.label} · capital-gain window from`, cg?.periodFrom ?? null, D.capitalGains.window[0]);
        check(`${spec.label} · capital-gain window to`, cg?.periodTo ?? null, D.capitalGains.window[1]);
      }
      const sum = (f) => (lots.length ? Math.round(lots.reduce((a, b) => a + (b[f] ?? 0), 0) * 100) / 100 : null);
      check(`${spec.label} · realised short term`, sum("shortTerm"), D.capitalGains.shortTerm);
      check(`${spec.label} · realised long term`, sum("longTerm"), D.capitalGains.longTerm);
    }
    if (D.bankBook) {
      const bb = pick("bank-book");
      const rows = bb?.cashFlows ?? [];
      check(`${spec.label} · bank-book rows`, rows.length, D.bankBook.rows);
      check(`${spec.label} · bank-book closing balance`, rows.at(-1)?.balance ?? null, D.bankBook.closingBalance);
    }
    if (D.expenses) {
      const ex = pick("expense-statement");
      const rows = ex?.expenses ?? [];
      check(`${spec.label} · expense rows`, rows.length, D.expenses.rows);
      check(`${spec.label} · expense total`, rows.length ? Math.round(rows.reduce((a, b) => a + (b.amount ?? 0), 0) * 100) / 100 : null, D.expenses.total);
    }
    if (D.dividends) {
      const dv = pick("dividend-statement");
      const rows = dv?.income ?? [];
      check(`${spec.label} · dividend rows`, rows.length, D.dividends.rows);
      if (D.dividends.first) {
        const w = D.dividends.first;
        const d = rows.find((x) => w.security.test(String(x.security ?? "")) && x.exDate === w.exDate);
        if (!d) {
          fail++;
          failures.push({ label: `${spec.label} · dividend ${w.security}`, got: "not found", want: "present" });
        } else {
          for (const [k, v] of Object.entries(w)) {
            if (["security", "exDate"].includes(k)) continue;
            check(`${spec.label} · dividend ${d.security} .${k}`, d[k] ?? null, v);
          }
        }
      }
    }
    for (const want of D.currentPortfolio ?? []) {
      const cp = pick("holdings");
      const h = (cp?.holdings ?? []).find((x) => want.security.test(String(x.security ?? "")));
      if (!h) {
        fail++;
        failures.push({ label: `${spec.label} · CURRENT PORTFOLIO ${want.security}`, got: "not found", want: "present" });
        continue;
      }
      for (const [k, v] of Object.entries(want)) {
        if (k === "security") continue;
        check(`${spec.label} · ${h.security} .${k}`, h[k] ?? null, v, k.endsWith("Pct") ? PCT_TOL : MONEY_TOL);
      }
    }
  }

  if (spec.corporateActions) {
    const d = [...byType.values()].find((x) => (x.cashFlows ?? []).some((c) => c.kind === "corporate-action"));
    const rows = (d?.cashFlows ?? []).filter((c) => c.kind === "corporate-action" && c.date === spec.corporateActions.date);
    check(`${spec.label} · corporate-action row count`, rows.length, spec.corporateActions.count);
    const net = rows.reduce((s, c) => s + (c.amount ?? 0), 0);
    check(`${spec.label} · corporate-action net`, Math.round(net * 100) / 100, spec.corporateActions.netAmount, 0.51);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("golden — extraction acceptance spec");

const manifest = loadManifest();
const noArchive = !manifest;
const emptyArchive = manifest && manifest.length === 0;

if (noArchive || emptyArchive) {
  const expected = GOLDEN.length;
  console.log("");
  console.log("  BLOCKED — nothing to check.");
  console.log(noArchive
    ? "  public/audit/manifest.json does not exist. Run `npm run extract` first."
    : "  The audit archive is empty: no statements have been extracted.");
  console.log("");
  console.log(`  This test encodes ${expected} account(s) of real figures and cannot verify any of them`);
  console.log("  until the statement PDFs are present under source/. It is reporting BLOCKED rather");
  console.log("  than passing, because a test that passes with no input proves nothing.");
  console.log("");
  console.log("  Expected, once the statements land:");
  for (const g of GOLDEN) console.log(`    - ${g.label}`);
  console.log("");
  process.exit(2);
}

for (const spec of GOLDEN) runCase(manifest, spec);

console.log("");
if (failures.length) {
  console.log("  Figures that did not reproduce:");
  for (const f of failures) {
    console.log(`    ${f.label}`);
    console.log(`      got ${JSON.stringify(f.got)}   want ${JSON.stringify(f.want)}`);
  }
  console.log("");
}
if (unchecked.length) {
  const byReason = new Map();
  for (const u of unchecked) byReason.set(u.reason, [...(byReason.get(u.reason) ?? []), u.label]);
  console.log("  NOT CHECKED — the engine cannot read these yet:");
  for (const [reason, labels] of byReason) {
    console.log(`    ${reason}`);
    for (const l of labels) console.log(`      · ${l}`);
  }
  console.log("");
}
if (blocked.length) {
  console.log("  BLOCKED — no statement in source/ for these accounts, so nothing was checked:");
  for (const b of blocked) console.log(`    · ${b}`);
  console.log("");
}
console.log(`  ${pass} passed, ${fail} failed, ${unchecked.length} not checked, ${blocked.length} case(s) blocked`);

// FAIL beats BLOCKED: a wrong figure is a defect whatever else is missing.
if (fail) process.exit(1);
if (blocked.length) {
  console.log("");
  console.log("  Exit 2 (BLOCKED): every figure that COULD be checked reproduced, but the");
  console.log("  accounts above have no statement in this drop. That is not a pass.");
  process.exit(2);
}
process.exit(0);
