#!/usr/bin/env node
// End-to-end tests for the extraction machinery.
//
// SCOPE, stated honestly. These drive the pipeline with statements generated
// HERE, laid out to the documented structure of the two providers. They prove
// the machinery works — geometry, header matching, normalisation, precedence
// wiring, and every reconciliation check. They do NOT prove the column aliases
// match the real reports; only the golden test against the real PDFs can do
// that, and it reports BLOCKED until those are present.
//
// The reconciliation cases below need no PDF at all: they are pure functions
// over normalized documents, so they are verified exactly, not approximately.
//
// Run: node scripts/ingest/__tests__/pipeline.test.mjs
import { extractLayout } from "../lib/layout.mjs";
import { extract as extractGoldstandard, PROVIDER as GS } from "../providers/goldstandard.mjs";
import { makeDocument, makeHolding, makeTotals, assertNormalized } from "../lib/document.mjs";
import { reconcile } from "../reconcile.mjs";
import { makeGridPdf } from "./fixtures/makePdf.mjs";

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof want === "number"
    ? typeof got === "number" && Math.abs(got - want) <= tol
    : Object.is(got, want);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (label, cond, detail = "") => { if (cond) pass++; else { fail++; console.log(`  FAIL ${label} ${detail}`); } };

console.log("pipeline");

// ── 1. A GoldStandard-shaped appraisal, laid out as a real one ──────────────
// Landscape, nine columns, spaced so the header labels do not collide — as a
// real report must be, or a human could not read it either. The header WRAPS
// onto two lines ("Market"/"Price"), which these reports commonly do and which
// the table reader has to cope with.
const COL = { sec: 30, qty: 250, unit: 320, cost: 400, price: 500, mv: 570, gl: 660, pgl: 730, pa: 780 };
const row = (y, cells) => Object.entries(cells).map(([k, v]) => [COL[k], y, v]);

const appraisalSpans = [
  [30, 560, "GOLDSTANDARD WEALTH PRIVATE LIMITED"],
  [30, 548, "Account : 100023  Ajay Thakurdas Jaisinghani"],
  [30, 536, "Aristos Equity Portfolio"],
  [30, 524, "Report Date : 10/07/2026"],
  // Header line 1
  ...row(496, { sec: "Security", qty: "Quantity", unit: "Unit", cost: "Total", price: "Market", mv: "Market", gl: "Gain/", pgl: "%", pa: "%" }),
  // Header line 2 — the wrap
  ...row(486, { qty: "", unit: "Cost", cost: "Cost", price: "Price", mv: "Value", gl: "Loss", pgl: "G/L", pa: "Assets" }),
  ...row(466, { sec: "Blue Jet Healthcare Ltd.", qty: "15,000", unit: "422.73", cost: "6,340,947.49", price: "574.50", mv: "8,617,500.00", gl: "2,276,553", pgl: "35.90", pa: "4.75" }),
  ...row(451, { sec: "Sundaram Finance Ltd.", qty: "1,200", unit: "4,100.00", cost: "4,920,000.00", price: "4,905.10", mv: "5,886,120.00", gl: "966,120", pgl: "19.64", pa: "3.24" }),
  ...row(436, { sec: "Sonata Software Ltd.", qty: "9,500", unit: "380.00", cost: "3,610,000.00", price: "362.15", mv: "3,440,425.00", gl: "-169,575", pgl: "-4.70", pa: "1.90" }),
  ...row(421, { sec: "Cash & Equivalents", qty: "-", unit: "-", cost: "3,482,781.83", price: "-", mv: "3,482,781.83", gl: "-", pgl: "-", pa: "1.92" }),
  [30, 396, "Equity"], [570, 396, "17,944,045.00"],
  [30, 384, "Cash"], [570, 384, "3,482,781.83"],
  [30, 372, "Total"], [570, 372, "21,426,826.83"],
];

const { pages, error } = await extractLayout(makeGridPdf(appraisalSpans, { mediaBox: [0, 0, 842, 595] }));
ok("appraisal parsed", !error, error ?? "");

const meta = {
  docKey: "goldstandard-100023-2026-07-10-appraisal",
  provider: GS, accountNo: "100023", reportType: "appraisal",
  strategy: "Aristos Equity Portfolio", asOfDate: "2026-07-10",
};
const result = extractGoldstandard({ grid: { pages }, meta });

ok("holdings extracted", result.holdings.length >= 3, `got ${result.holdings.length}`);
const blueJet = result.holdings.find((h) => /blue jet/i.test(h.security));
ok("Blue Jet row located", !!blueJet);
if (blueJet) {
  eq("Blue Jet quantity",    blueJet.quantity, 15000);
  eq("Blue Jet unit cost",   blueJet.unitCost, 422.73);
  eq("Blue Jet total cost",  blueJet.totalCost, 6340947.49);
  eq("Blue Jet price",       blueJet.marketPrice, 574.50);
  eq("Blue Jet market value", blueJet.marketValue, 8617500.00);
  eq("Blue Jet gain/loss",   blueJet.gainLoss, 2276553);
  eq("Blue Jet % G/L",       blueJet.pctGainLoss, 35.90);
  eq("Blue Jet % assets",    blueJet.pctAssets, 4.75);
  eq("Blue Jet securityKey", blueJet.securityKey, "blue-jet-healthcare");
  // PMS is an engagement, not an asset class — the holding is listed equity.
  eq("Blue Jet asset class", blueJet.assetClass, "Equity");
}
// A negative G/L must survive as negative.
const sonata = result.holdings.find((h) => /sonata/i.test(h.security));
eq("Sonata negative G/L", sonata?.gainLoss ?? null, -169575);
// The cash line is Cash, and its unreported cells are null — NOT zero.
const cash = result.holdings.find((h) => h.assetClass === "Cash");
ok("cash line classified", !!cash);
// Asserted with an identity check, not `?? fallback` — `null ?? x` is x, which
// would make this pass for the wrong reason and hide a 0-coercion regression.
ok("cash quantity is null, not 0", cash !== undefined && cash.quantity === null,
   `got ${JSON.stringify(cash?.quantity)}`);
ok("cash unit cost is null, not 0", cash !== undefined && cash.unitCost === null,
   `got ${JSON.stringify(cash?.unitCost)}`);
eq("cash market value", cash?.marketValue ?? null, 3482781.83);
// Engagement is PMS; asset classes never are.
eq("engagement", result.engagement, "PMS");

// ── 2. Reconciliation: row sums vs printed totals ───────────────────────────
// The printed equity total here (17,944,045) does NOT equal the sum of the three
// equity rows (17,944,045.00) — it does. So we also build a deliberately
// inconsistent document to prove a mismatch is DETECTED, not smoothed.
const mkDoc = (over) => assertNormalized(makeDocument({
  docKey: over.docKey, provider: GS, accountNo: "100023", asOf: "2026-07-10",
  owner: "Ajay Thakurdas Jaisinghani", ownerId: "ajay-jaisinghani",
  sourcePath: "source/x.pdf", status: "ok", reportType: over.reportType,
  holdings: over.holdings ?? [], totals: over.totals ?? null,
}));

const consistent = mkDoc({
  docKey: "d-consistent", reportType: "appraisal",
  holdings: [
    makeHolding({ security: "A Ltd", assetClass: "Equity", marketValue: 100, totalCost: 90, gainLoss: 10 }),
    makeHolding({ security: "B Ltd", assetClass: "Equity", marketValue: 200, totalCost: 180, gainLoss: 20 }),
  ],
  totals: makeTotals({ equityMarketValue: 300, equityCost: 270, gainLoss: 30 }),
});
let r = reconcile([consistent]);
eq("consistent doc: no mismatch", r.summary.totalMismatches, 0);
ok("checks did run", r.summary.rowSumChecks >= 3, `ran ${r.summary.rowSumChecks}`);

const inconsistent = mkDoc({
  docKey: "d-inconsistent", reportType: "appraisal",
  holdings: [
    makeHolding({ security: "A Ltd", assetClass: "Equity", marketValue: 100, totalCost: 90 }),
    makeHolding({ security: "B Ltd", assetClass: "Equity", marketValue: 200, totalCost: 180 }),
  ],
  // Printed total disagrees with the rows by 5 — exactly the real GoldStandard
  // situation where two reports print the same equity total over different rows.
  totals: makeTotals({ equityMarketValue: 305, equityCost: 270 }),
});
r = reconcile([inconsistent]);
eq("inconsistent doc: mismatch detected", r.summary.totalMismatches, 1);
const mm = r.rowSumChecks.find((c) => !c.matches);
eq("mismatch delta reported", mm?.delta ?? null, -5);
eq("mismatch keeps row sum", mm?.rowSum ?? null, 300);
eq("mismatch keeps printed total", mm?.printedTotal ?? null, 305);

// ── 3. Reconciliation: cross-report deltas ─────────────────────────────────
// Same account, same date, two reports, different total G/L — the real
// Appraisal 5,957,554 vs CurrentPortfolio 6,744,704 case.
const appraisalDoc = mkDoc({
  docKey: "d-appraisal", reportType: "appraisal",
  totals: makeTotals({ gainLoss: 5957554, pctGainLoss: 3.47 }),
});
const currentDoc = mkDoc({
  docKey: "d-current", reportType: "holdings",
  totals: makeTotals({ gainLoss: 6744704, pctGainLoss: 3.93 }),
});
r = reconcile([appraisalDoc, currentDoc]);
const gl = r.crossReportDeltas.find((d) => d.field === "totals.gainLoss");
ok("cross-report G/L delta reported", !!gl);
eq("cross-report delta value", gl?.delta ?? null, -787150);
ok("both sides kept", gl && gl.a.value === 5957554 && gl.b.value === 6744704,
   JSON.stringify(gl));
ok("precedence named, not applied", gl?.authoritative === "appraisal", String(gl?.authoritative));

// ── 4. Reconciliation: duplicate holdings across owners ────────────────────
// The 360 ONE Special Opportunities Fund case: byte-identical figures under two
// different family members. Must be FLAGGED and must NOT be deduped.
const sharedHolding = () => makeHolding({
  security: "360 ONE Special Opportunities Fund - Series 8 - Class A3",
  assetClass: "AIF", quantity: 990429.684, totalCost: 9866647.00, marketValue: 14580412.51,
});
const ajayDoc = assertNormalized(makeDocument({
  docKey: "d-ajay", provider: "360 ONE Private Wealth", accountNo: "37702", asOf: "2026-06-30",
  owner: "Mr. AJAY T JAISINGHANI", ownerId: "ajay-jaisinghani", sourcePath: "a.pdf",
  status: "ok", reportType: "holdings", holdings: [sharedHolding()],
}));
const bharatDoc = assertNormalized(makeDocument({
  docKey: "d-bharat", provider: "360 ONE Private Wealth", accountNo: "60117", asOf: "2026-06-30",
  owner: "Bharat Jaisinghani", ownerId: "bharat-jaisinghani", sourcePath: "b.pdf",
  status: "ok", reportType: "holdings", holdings: [sharedHolding()],
}));
r = reconcile([ajayDoc, bharatDoc]);
eq("duplicate across owners flagged", r.summary.suspectedDuplicates, 1);
const dup = r.duplicateHoldings[0];
eq("duplicate names both owners", dup?.owners.length ?? 0, 2);
eq("double-count risk stated", dup?.doubleCountRisk ?? null, 14580412.51);
ok("not deduped", /NOT deduped/.test(dup?.resolution ?? ""), dup?.resolution);
// The same holding twice for the SAME owner is a cross-report matter, not a duplicate.
r = reconcile([ajayDoc, { ...ajayDoc, docKey: "d-ajay-2", reportType: "appraisal" }]);
eq("same owner is not a cross-owner duplicate", r.summary.suspectedDuplicates, 0);

// ── 5. Unresolved owners are reported, never invented ──────────────────────
const strangerDoc = assertNormalized(makeDocument({
  docKey: "d-stranger", provider: GS, accountNo: "999", asOf: "2026-07-10",
  owner: "Someone Not In The Registry", ownerId: null, sourcePath: "c.pdf",
  status: "ok", reportType: "appraisal", holdings: [],
}));
r = reconcile([strangerDoc]);
eq("unmatched owner reported", r.unresolved.ownerNamesUnmatched.length, 1);
eq("unmatched owner name kept", r.unresolved.ownerNamesUnmatched[0].name, "Someone Not In The Registry");

// ── 6. Securities with no NSE symbol are listed (equity only) ──────────────
r = reconcile([mkDoc({
  docKey: "d-syms", reportType: "appraisal",
  holdings: [
    makeHolding({ security: "Blue Jet Healthcare Ltd.", assetClass: "Equity" }),
    makeHolding({ security: "Some AIF Fund", assetClass: "AIF" }),   // no ticker expected
    makeHolding({ security: "Cash & Equivalents", assetClass: "Cash" }),
  ],
})], { symbolMap: {} });
eq("only listed equity counted as unresolved", r.unresolved.securitiesWithoutSymbol.length, 1);
eq("the equity name is the one listed", r.unresolved.securitiesWithoutSymbol[0].securityKey, "blue-jet-healthcare");

// ── 7. The document contract is enforced ───────────────────────────────────
let threw = false;
try {
  assertNormalized(makeDocument({
    docKey: "bad", provider: GS, sourcePath: "x", status: "ok",
    holdings: [{ security: "X", securityKey: "x", assetClass: "PMS", quantity: null, totalCost: null, marketValue: null, gainLoss: null }],
  }));
} catch { threw = true; }
ok("PMS rejected as an asset class", threw);

threw = false;
try {
  assertNormalized(makeDocument({ docKey: "bad2", provider: GS, sourcePath: "x", status: "ok", engagement: "Custody", holdings: [] }));
} catch { threw = true; }
ok("unknown engagement rejected", threw);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
