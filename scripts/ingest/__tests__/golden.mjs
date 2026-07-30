#!/usr/bin/env node
// GOLDEN FILE TEST — figures taken from the real statements.
//
// This is the acceptance spec for the extraction engine. Every number below was
// read off a real report by a human; if the extractor cannot reproduce them, the
// extractor is wrong and the book built on it would be wrong too.
//
// Three outcomes, and the difference between them matters:
//
//   PASS     every expected figure was reproduced.
//   FAIL     a document was found but a figure came out wrong or missing.
//            The extractor needs fixing. Exit code 1.
//   BLOCKED  the source statements are not present, so nothing could be
//            checked. Exit code 2 — NOT a pass. A test that silently "passes"
//            because it had nothing to test is worse than no test: it reports
//            confidence that was never earned.
//
// Run: node scripts/ingest/__tests__/golden.mjs   (or `npm run test:ingest`)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");

// ── The expected figures ─────────────────────────────────────────────────────

const GOLDEN = [
  {
    label: "GoldStandard · account 100023 · Aristos Equity Portfolio · as of 2026-07-10",
    match: { provider: /goldstandard/i, accountNo: "100023" },
    asOf: "2026-07-10",
    owner: { printed: "Ajay Thakurdas Jaisinghani", ownerId: "ajay-jaisinghani" },
    inceptionDate: "2025-12-26",
    strategy: "Aristos Equity Portfolio",

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
    // Both must be extracted; the delta is the reconciler's to report.
    alternateTotals: [
      { reportType: "holdings", gainLoss: 6744704, pctGainLoss: 3.93, note: "CurrentPortfolio folds accrued income into G/L" },
    ],

    flows: { reportType: "performance-summary", contribution: 175000000, withdrawal: 41000, profit: 6574677 },

    returns: [
      { reportType: "fact-sheet", series: /portfolio/i, mtd: 2.35, qtd: 2.35, ytd: 16.69, si: 3.76 },
      { reportType: "fact-sheet", series: /n50 ?tri|nifty ?50/i, mtd: 0.46, qtd: 0.46, ytd: 7.89, si: -7.73 },
    ],

    holdings: [
      {
        reportType: "appraisal",
        security: /blue jet healthcare/i,
        quantity: 15000, unitCost: 422.73, marketPrice: 574.50,
        totalCost: 6340947.49, marketValue: 8617500.00,
        gainLoss: 2276553, pctGainLoss: 35.90, pctAssets: 4.75,
      },
      { reportType: "fact-sheet", security: /blue jet healthcare/i, providerSector: "Pharmaceuticals" },
      { reportType: "holdings", security: /sundaram finance/i, accruedIncome: 40200, positionIrrPct: 11.87 },
    ],
  },
  {
    label: "360 ONE · Bharat Jaisinghani CRN60117 · as on 2026-06-30",
    match: { provider: /360 ?one/i, accountNo: "60117" },
    asOf: "2026-06-30",
    owner: { printed: "Bharat Jaisinghani", ownerId: "bharat-jaisinghani" },
    holdings: [
      {
        reportType: "holdings",
        security: /special opportunities fund.*series 8.*class a3/i,
        quantity: 990429.684,
        totalCost: 9866647.00,
        marketValue: 14580412.51,
        unrealized: 4713765.51,
        pctGainLoss: 47.77,
        realized: 2037517.00,
        positionIrrPct: 10.86,
        benchmarkIrrPct: 11.93,
        priceAsOn: "2026-06-30",
        // total gain 6,751,282.51 = unrealized + realized; checked below.
        derived: { totalGain: 6751282.51 },
      },
    ],
  },
  {
    label: "360 ONE · Ajay T Jaisinghani CRN37702 · as on 2026-05-31",
    match: { provider: /360 ?one/i, accountNo: "37702" },
    asOf: "2026-05-31",
    owner: { printed: "Mr. AJAY T JAISINGHANI", ownerId: "ajay-jaisinghani" },
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
const MONEY_TOL = 0.011, PCT_TOL = 0.005;

function check(label, got, want, tol = MONEY_TOL) {
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
    console.log("    NO DOCUMENT FOUND for this account/date");
    fail++;
    failures.push({ label: `${spec.label} — document present`, got: "none", want: "at least one" });
    return;
  }

  const pick = (rt) => byType.get(rt) ?? null;
  const any = [...byType.values()][0];

  // Owner must resolve to ONE canonical person across every spelling.
  check(`${spec.label} · ownerId`, any.ownerId, spec.owner.ownerId);
  if (spec.strategy) check(`${spec.label} · strategy`, any.strategy, spec.strategy);

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

  if (spec.flows) {
    const d = pick(spec.flows.reportType);
    for (const [field, want] of Object.entries(spec.flows)) {
      if (field === "reportType") continue;
      check(`${spec.label} · flows.${field}`, d?.flows?.[field] ?? null, want);
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
    for (const k of ["mtd", "qtd", "ytd", "si"]) {
      if (want[k] === undefined) continue;
      check(`${spec.label} · ${want.series} ${k.toUpperCase()}`, series[k], want[k], PCT_TOL);
    }
  }

  for (const want of spec.holdings ?? []) {
    const d = pick(want.reportType);
    const h = (d?.holdings ?? []).find((x) => want.security.test(String(x.security ?? "")));
    if (!h) {
      fail++;
      failures.push({ label: `${spec.label} · holding ${want.security} in ${want.reportType}`, got: "not found", want: "present" });
      continue;
    }
    for (const [field, wantVal] of Object.entries(want)) {
      if (["reportType", "security", "derived"].includes(field)) continue;
      check(`${spec.label} · ${h.security} .${field}`, h[field] ?? null, wantVal, field.startsWith("pct") ? PCT_TOL : MONEY_TOL);
    }
    if (want.derived?.totalGain !== undefined) {
      const got = (h.unrealized ?? 0) + (h.realized ?? 0);
      check(`${spec.label} · ${h.security} unrealized+realized = total gain`, got, want.derived.totalGain);
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
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
