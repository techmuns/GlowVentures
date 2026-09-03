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
// The three PMS managers share one reporting system and one extractor; the
// fixture below is laid out to the Goldstandard/Aristos appraisal shape.
import { extract as extractPms, PROVIDERS as PMS } from "../providers/pmsStatements.mjs";
const GS = PMS.goldstandard.name;
import {
  makeDocument, makeHolding, makeTotals, assertNormalized, deriveDocument, deriveHolding,
  makeMember, normalizeEngagement, dominantEngagement,
} from "../lib/document.mjs";
import { reconcile, consolidatedValue } from "../reconcile.mjs";
import { makeGridPdf } from "./fixtures/makePdf.mjs";
import { classify, NON_STATEMENT_PROVIDERS } from "../lib/classify.mjs";

let pass = 0, fail = 0;
const eq = (label, got, want, tol = 0.011) => {
  const ok = typeof want === "number"
    ? typeof got === "number" && Math.abs(got - want) <= tol
    : Object.is(got, want);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (label, cond, detail = "") => { if (cond) pass++; else { fail++; console.log(`  FAIL ${label} ${detail}`); } };

console.log("pipeline");

// ── 1. A Goldstandard-shaped appraisal, laid out as a real one ──────────────
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
const raw = extractPms({ grid: { pages }, meta });
// Derivation is what fills marketValue/gainLoss/%; the extractor only ingests
// primitives, so nothing computed exists until deriveDocument has run.
const result = deriveDocument({ ...raw, holdings: raw.holdings, totals: raw.totals });

ok("holdings extracted", result.holdings.length >= 3, `got ${result.holdings.length}`);
const blueJet = result.holdings.find((h) => /blue jet/i.test(h.security));
ok("Blue Jet row located", !!blueJet);
if (blueJet) {
  eq("Blue Jet quantity",    blueJet.quantity, 15000);
  eq("Blue Jet unit cost",   blueJet.unitCost, 422.73);
  eq("Blue Jet total cost",  blueJet.totalCost, 6340947.49);
  eq("Blue Jet price",       blueJet.marketPrice, 574.50);
  // DERIVED, not ingested: 574.50 x 15,000 = 8,617,500 exactly.
  eq("Blue Jet market value derived", blueJet.marketValue, 8617500.00);
  eq("Blue Jet gain/loss derived",    blueJet.gainLoss, 2276552.51);   // 8,617,500 - 6,340,947.49
  eq("Blue Jet % G/L derived",        blueJet.pctGainLoss, 35.90);
  // The printed figures are kept as a CHECK, never as the source.
  eq("Blue Jet printed MV kept",      blueJet.printed.marketValue, 8617500.00);
  eq("Blue Jet printed G/L kept",     blueJet.printed.gainLoss, 2276553);
  ok("market value was computed, not copied", blueJet.marketValueFromPrinted === false);
  eq("Blue Jet securityKey", blueJet.securityKey, "blue-jet-healthcare");
  // PMS is an engagement, not an asset class — the holding is listed equity.
  eq("Blue Jet asset class", blueJet.assetClass, "Equity");
}
// A negative G/L must survive as negative, derived from price x qty - cost.
const sonata = result.holdings.find((h) => /sonata/i.test(h.security));
eq("Sonata negative G/L derived", sonata?.gainLoss ?? null, -169575);   // 3,440,425 - 3,610,000
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

// ── 1b. Derivation rules ───────────────────────────────────────────────────
// %Assets denominator is the TOTAL portfolio value INCLUDING cash, so equity and
// cash weights sum to exactly 100.
{
  const total = 181533676.83;
  const eq1 = deriveHolding(makeHolding({ security: "E", assetClass: "Equity", marketValue: 178050895 }), total);
  const cash1 = deriveHolding(makeHolding({ security: "Cash", assetClass: "Cash", marketValue: 3482781.83 }), total);
  eq("equity weight on total-incl-cash", eq1.pctAssets, 98.08, 0.005);
  eq("cash weight on total-incl-cash", cash1.pctAssets, 1.92, 0.005);
  eq("weights sum to 100", Math.round((eq1.pctAssets + cash1.pctAssets) * 100) / 100, 100);
}
// A printed %Assets that disagrees with the statement's own MV is REPORTED, and
// the derived value is what the book uses. Real case: Sundaram Finance prints
// 4.29% against an MV that works out to 4.26%.
{
  const h = deriveHolding(makeHolding({
    security: "Sundaram Finance Ltd.", assetClass: "Equity",
    marketPrice: 1, quantity: 7740510, pctAssets: 4.29,
  }), 181533676.83);
  eq("derived %assets from own MV", h.pctAssets, 4.26, 0.005);
  eq("printed %assets preserved", h.printed.pctAssets, 4.29);
}
// Where no price is reported, the printed value is adopted — and flagged.
{
  const h = deriveHolding(makeHolding({
    security: "AIF Units", assetClass: "AIF", marketValue: 14580412.51, totalCost: 9866647,
  }));
  eq("value-only holding adopts printed MV", h.marketValue, 14580412.51);
  ok("adoption is flagged", h.marketValueFromPrinted === true);
  eq("gain still derived", h.gainLoss, 4713765.51);
}
// Missing inputs never become zero.
{
  const h = deriveHolding(makeHolding({ security: "No Cost", assetClass: "Equity", marketPrice: 10, quantity: 5 }));
  eq("MV derived", h.marketValue, 50);
  ok("no cost -> no gain, not a 50 profit", h.gainLoss === null);
  ok("no cost -> no % gain", h.pctGainLoss === null);
}

// ── 1c. Engagement is derived, never defaulted ─────────────────────────────
eq("Executionary normalises", normalizeEngagement("Executionary"), "Execution");
eq("Distribution normalises", normalizeEngagement("- Distribution "), "Distribution");
eq("unrecognised stays unknown", normalizeEngagement("Bespoke Mandate"), "unknown");
eq("blank stays unknown", normalizeEngagement(""), "unknown");
eq("no members -> unknown, NOT Advisory", dominantEngagement([]), "unknown");
{
  // CRN37702: Distribution holds the value, Executionary carries only actions.
  const members = [
    makeMember({ memberId: "CRN37702LE53856", engagement: "Distribution", providerEngagement: "Distribution" }),
    makeMember({ memberId: "CRN37702E29000", engagement: "Execution", providerEngagement: "Executionary" }),
  ];
  const holdings = [
    deriveHolding(makeHolding({ security: "X", memberId: "CRN37702LE53856", marketValue: 14408473.91 })),
  ];
  eq("dominant engagement follows the value", dominantEngagement(members, holdings), "Distribution");
}

// ── 2. Reconciliation: row sums vs printed totals ───────────────────────────
// The printed equity total here (17,944,045) does NOT equal the sum of the three
// equity rows (17,944,045.00) — it does. So we also build a deliberately
// inconsistent document to prove a mismatch is DETECTED, not smoothed.
// Documents go through derivation, exactly as the extract pass does — the
// computed fields do not exist until then.
const mkDoc = (over) => assertNormalized(deriveDocument(makeDocument({
  docKey: over.docKey, provider: GS, accountNo: "100023", asOf: "2026-07-10",
  owner: "Ajay Thakurdas Jaisinghani", ownerId: "ajay-jaisinghani",
  sourcePath: "source/x.pdf", status: "ok", reportType: over.reportType,
  holdings: over.holdings ?? [], totals: over.totals ?? null,
})));

const consistent = mkDoc({
  docKey: "d-consistent", reportType: "appraisal",
  holdings: [
    makeHolding({ security: "A Ltd", assetClass: "Equity", marketPrice: 10, quantity: 10, totalCost: 90 }),
    makeHolding({ security: "B Ltd", assetClass: "Equity", marketPrice: 20, quantity: 10, totalCost: 180 }),
  ],
  totals: makeTotals({ equityMarketValue: 300, equityCost: 270, gainLoss: 30 }),
});
let r = reconcile([consistent]);
eq("consistent doc: no mismatch", r.summary.totalMismatches, 0);
ok("checks did run", r.summary.rowSumChecks >= 3, `ran ${r.summary.rowSumChecks}`);

const inconsistent = mkDoc({
  docKey: "d-inconsistent", reportType: "appraisal",
  holdings: [
    makeHolding({ security: "A Ltd", assetClass: "Equity", marketPrice: 10, quantity: 10, totalCost: 90 }),
    makeHolding({ security: "B Ltd", assetClass: "Equity", marketPrice: 20, quantity: 10, totalCost: 180 }),
  ],
  // Printed total disagrees with the derived rows by 5 — exactly the real
  // Goldstandard situation where a report's own total does not equal its rows.
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

// ── 3b. Derived-vs-printed deltas are reported ─────────────────────────────
{
  // The real Goldstandard case: Sundaram Finance is printed at 4.29% of assets
  // while its own market value works out to 4.26%, because the statement's
  // percentage is on an income-inclusive basis its MV column excludes.
  //
  // The %assets denominator is the sum of the DERIVED market values, so the doc
  // needs the rest of the book in it — hence the second holding, which stands
  // for the other 31 positions and the cash. mkDoc runs deriveDocument, exactly
  // as extract does.
  const doc = mkDoc({
    docKey: "d-derived", reportType: "appraisal",
    holdings: [
      makeHolding({
        security: "Sundaram Finance Ltd.", assetClass: "Equity",
        marketPrice: 1, quantity: 7740510, pctAssets: 4.29,
      }),
      makeHolding({
        security: "Rest of book", assetClass: "Equity",
        marketPrice: 1, quantity: 173793166.83,
      }),
    ],
    totals: makeTotals({ totalMarketValue: 181533676.83 }),
  });
  const rep = reconcile([doc]);
  eq("derived-vs-printed delta reported", rep.summary.derivedVsPrintedDeltas, 1);
  const d = rep.derivedVsPrinted[0];
  eq("delta field", d.field, "pctAssets");
  eq("delta keeps derived", d.derived, 4.26);
  eq("delta keeps printed", d.printed, 4.29);
}

// ── 4. Reconciliation: duplicate holdings across owners ────────────────────
// The 360 ONE Special Opportunities Fund case: byte-identical figures under two
// different family members. Must be FLAGGED and must NOT be deduped.
const sharedHolding = () => deriveHolding(makeHolding({
  security: "360 ONE Special Opportunities Fund - Series 8 - Class A3",
  assetClass: "AIF", quantity: 990429.684, totalCost: 9866647.00, marketValue: 14580412.51,
}));
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
ok("neither row suppressed", /NOT deduped/.test(dup?.resolution ?? ""), dup?.resolution);
// Policy: carry both, count once.
ok("a dedupeGroup id was assigned", !!dup?.dedupeGroup, String(dup?.dedupeGroup));
{
  const rep = reconcile([ajayDoc, bharatDoc]);
  const ajayRow = ajayDoc.holdings[0], bharatRow = bharatDoc.holdings[0];
  ok("both rows tagged with the SAME group", !!ajayRow.dedupeGroup && ajayRow.dedupeGroup === bharatRow.dedupeGroup);
  eq("ajay row knows bharat also reports it", ajayRow.alsoReportedUnder[0], "bharat-jaisinghani");
  eq("bharat row knows ajay also reports it", bharatRow.alsoReportedUnder[0], "ajay-jaisinghani");
  // Each owner's own view is untouched; only the consolidated figure collapses.
  eq("naive sum double-counts", rep.consolidated.naive, 29160825.02);
  eq("consolidated counts it ONCE", rep.consolidated.deduped, 14580412.51);
  eq("difference is stated", rep.consolidated.doubleCounted, 14580412.51);
}
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



// ── A DOCUMENT NOBODY ISSUED MUST REACH NO READER ──────────────────────────────
//
// Two files in `source/` are the family's or their adviser's own records rather
// than statements: the 25-tab consolidated review and, since august-2026-f, the
// investment register. Both NAME EVERY MANAGER IN THE BOOK, so every rule that
// matches on an issuer's name claims them.
//
// The register is the dangerous one and is the reason these assertions exist.
// Measured before the guard in `matchGoldstandard`, it classified as
// provider "Green Lantern Capital LLP", strategy "Aristos Equity Portfolio",
// owner "COMMUNITY PRIVATE LIMITED BHARAT", accountNo "EDUGORILLA" and
// reportType "capital-call" — all five scraped off PORTFOLIO COMPANY names in
// its cells. Green Lantern has a reader and `capital-call` is a live report
// type, so it would have been HANDED TO ONE, unlike the review workbook which
// escaped only because the fund readers happened to refuse its summary row.
{
  // The distinguishing header of each, and enough manager names to trip every
  // issuer rule — which is exactly what the real files contain.
  const managers = "GREEN LANTERN CAPITAL LLP CARNELIAN ASSET MANAGEMENT Aristos Equity Portfolio "
    + "V.E.C ASSAGO MOLECULE VENTURES Buoyant Opportunities Strategy GOLDSTANDARD WEALTH";
  const cases = [
    ["family investment register", "NEW INVESTMENT SHEET.xlsx",
      `SR. NO. INVESTMENT NAME INVESTMENT DONE UNDER INVESTMENT AMOUNT ORG. SHARE CERTIFICATE STATUS\n`
      + `${managers}\nCAPITAL COMMITMENT OF 15000000 DRAWDOWN NOTICE\nAccount : GoldStandard Bharat`],
    ["consolidated family review", "Final Consolidated Review.xlsx",
      `Absolute Gain / (Loss) Including Redeemed Funds\n${managers}`],
  ];
  for (const [label, file, text] of cases) {
    const c = classify({ fileName: file, text });
    ok(`${label}: provider is a non-statement label`, NON_STATEMENT_PROVIDERS.has(c.provider), `got ${c.provider}`);
    // reportType is what chooses a reader, so this is the assertion that matters.
    eq(`${label}: carries no report type`, c.reportType, "unknown");
    eq(`${label}: carries no sections`, c.sections.length, 0);
    // A non-statement is about no single account and no single holder.
    eq(`${label}: carries no account number`, c.accountNo, null);
    eq(`${label}: carries no owner`, c.ownerName, null);
    eq(`${label}: carries no as-of`, c.asOfDate, null);
  }

  // The guard must be NARROW: an ordinary Goldstandard appraisal, which also
  // names Aristos, must still be claimed by its own house rule.
  const real = classify({
    fileName: "G100023_100023_PortFolioAppraisal.pdf",
    text: "GOLDSTANDARD WEALTH PRIVATE LIMITED Aristos Equity Portfolio Account : 100023  Ajay Jaisinghani",
  });
  eq("a real Goldstandard appraisal still resolves", real.provider, "Goldstandard Wealth Private Limited");
  ok("a real Goldstandard appraisal is not a non-statement",
    !NON_STATEMENT_PROVIDERS.has(real.provider), `got ${real.provider}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
