#!/usr/bin/env node
// Runs the family-input arithmetic tests.  npm run test:family
//
// The ingest suites are plain .mjs and run directly. These assertions are about
// `src/lib/*.ts` — the deal register's derivations, the household balance
// sheet's totals and the plan columns' gap — so they are bundled through
// esbuild (already a dependency, via vite) and executed. No test framework is
// added for this: the suite is a list of equalities and a non-zero exit.
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// INSIDE node_modules, not in the system temp dir. `--packages=external` leaves
// real dependencies as bare imports, and Node resolves those by walking UP from
// the bundle — so a bundle in /tmp cannot find `exceljs`, while one here reaches
// the repo's own node_modules one level up. (It stays out of the working tree
// either way: node_modules is ignored.)
const DIR = fs.mkdtempSync(path.join(ROOT, "node_modules", ".glow-test-"));

const SUITES = [
  ["navigation snapshots", "src/lib/__tests__/navigationMemory.test.ts"],
  ["archive sheet decoding", "src/lib/__tests__/auditSheet.test.ts"],
  ["ETF unit continuity", "src/lib/__tests__/fundUnitActions.test.ts"],
  ["statement source tracing", "src/lib/__tests__/sourceTrace.test.ts"],
  ["PDF source highlights", "src/lib/__tests__/pdfSourceHighlight.test.ts"],
  ["assumed holding returns", "src/lib/__tests__/assumedHoldingReturns.test.ts"],
  ["invested this year", "src/lib/__tests__/investedThisYear.test.ts"],
  ["market return coverage labels", "src/lib/__tests__/marketReturnCoverage.test.ts"],
  ["historical market returns", "src/lib/__tests__/marketReturns.test.ts"],
  ["capital bridge", "src/lib/__tests__/capitalBridge.test.ts"],
  ["historical market feed", "src/lib/__tests__/marketHistoryFunction.test.ts"],
  ["custody audit source rows", "src/lib/__tests__/custodyAudit.test.ts"],
  ["available headline returns", "src/lib/__tests__/availableCardReturns.test.ts"],
  ["published data lineage", "src/lib/__tests__/publicationViews.test.ts"],
  ["selected attribution periods and coverage", "src/lib/__tests__/selectedSegmentReturns.test.ts"],
  ["sector return coverage identities", "src/lib/__tests__/sectorReturnCoverage.test.ts"],
  ["one sector rollup for both panels", "src/lib/__tests__/sectorRollup.test.ts"],
  ["chunk recovery", "src/lib/__tests__/chunkRecovery.test.ts"],
  ["recovered purchase costs", "src/lib/__tests__/recoveredCosts.test.ts"],
  ["latest verified account returns", "src/lib/__tests__/latestAccountReturns.test.ts"],
  ["consolidated sheet", "src/lib/__tests__/consolidatedSheet.test.ts"],
  ["research background cache", "src/lib/__tests__/researchCache.test.ts"],
  ["stock tabs load ahead", "src/lib/__tests__/stockTabsAhead.test.ts"],
  ["prepared ledger views", "src/lib/__tests__/readModels.test.ts"],
  ["server stock exposure", "src/lib/__tests__/stockExposureFunction.test.ts"],
  ["daily equity movers resilience", "src/lib/__tests__/dailyMovers.test.ts"],
  ["investor period returns", "src/lib/__tests__/investorSummary.test.ts"],
  ["return calculation working", "src/lib/__tests__/xirrWorking.test.ts"],
  ["selected return working", "src/lib/__tests__/periodReturnWorking.test.ts"],
  ["corporate actions & dividends", "src/lib/__tests__/corporateActions.test.ts"],
  ["corporate-action feed", "src/lib/__tests__/corporateActionsFunction.test.ts"],
  ["corporate-action live gate", "src/lib/__tests__/liveWithheld.test.ts"],
  ["stock realised tile", "src/lib/__tests__/stockRealised.test.ts"],
  ["statement notes on a mark", "src/lib/__tests__/statementNotes.test.ts"],
  ["scheme returns", "src/lib/__tests__/schemeReturns.test.ts"],
  ["holding value date", "src/lib/__tests__/valuedAt.test.ts"],
  ["scheme match words", "src/lib/__tests__/schemeMatch.test.ts"],
  ["mandate cost vs capital", "src/lib/__tests__/mandateCapital.test.ts"],
  ["family arithmetic", "src/lib/__tests__/familyMath.test.ts"],
  ["financial tables", "src/lib/__tests__/financialTables.test.ts"],
  ["cash flow & calendar", "src/lib/__tests__/yfinStatements.test.ts"],
  ["ratio table", "src/lib/__tests__/ratioTable.test.ts"],
  ["account XIRR", "src/lib/__tests__/accountXirr.test.ts"],
  ["private market", "src/lib/__tests__/privateMarket.test.ts"],
  ["private market table", "src/lib/__tests__/privateBook.test.ts"],
  ["investment profiles", "src/lib/__tests__/investmentProfiles.test.ts"],
  ["entered strategy and description", "src/lib/__tests__/enteredProfiles.test.ts"],
  ["dashboard store in GitHub", "src/lib/__tests__/dashboardStore.test.ts"],
  ["review as private-market source", "src/lib/__tests__/reviewBook.test.ts"],
  ["review optional columns", "src/lib/__tests__/reviewColumns.test.ts"],
  ["separate investments", "src/lib/__tests__/separateInvestments.test.ts"],
  ["keep unvalued", "src/lib/__tests__/keptUnvalued.test.ts"],
  ["capital calls", "src/lib/__tests__/capitalCalls.test.ts"],
  ["capital-call store", "src/lib/__tests__/enteredCalls.test.ts"],
  ["tile-layout store", "src/lib/__tests__/tileSets.test.ts"],
  ["table arrangement & return pick", "src/lib/__tests__/tableView.test.ts"],
  ["transaction rollup", "src/lib/__tests__/txnRollup.test.ts"],
  ["dated record merge", "src/lib/__tests__/txnLedger.test.ts"],
  ["transaction sections", "src/lib/__tests__/txnAxis.test.ts"],
  ["chat context", "src/lib/__tests__/chatContext.test.ts"],
  ["chat function", "src/lib/__tests__/chatFunction.test.ts"],
  ["indices function", "src/lib/__tests__/indicesFunction.test.ts"],
  ["quotes function", "src/lib/__tests__/quotesFunction.test.ts"],
  ["Upstox quotes", "src/lib/__tests__/upstoxQuotes.test.ts"],
  ["company CMP coverage", "src/lib/__tests__/companyQuotes.test.ts"],
  ["portfolio excel", "src/lib/__tests__/portfolioExcel.test.ts"],
  ["holding return", "src/lib/__tests__/holdingReturn.test.ts"],
  ["dated NAV series", "src/lib/__tests__/navSeries.test.ts"],
  ["NAV card lines and accounts", "src/lib/__tests__/navCard.test.ts"],
  ["NAV benchmarks", "src/lib/__tests__/benchmarks.test.ts"],
  ["family taxonomy", "src/lib/__tests__/familyTaxonomy.test.ts"],
  ["capital tranches", "src/lib/__tests__/tranches.test.ts"],
  ["capital record", "src/lib/__tests__/capitalRecord.test.ts"],
  ["dated capital", "src/lib/__tests__/datedCapital.test.ts"],
  ["dated capital record (archive)", "src/lib/__tests__/capitalRecordArchive.test.ts"],
  ["unvalued holdings", "src/lib/__tests__/unvaluedHoldings.test.ts"],
  ["realised lots", "src/lib/__tests__/realisedLots.test.ts"],
  ["nav capital proof", "src/lib/__tests__/navProof.test.ts"],
  ["carried cost", "src/lib/__tests__/carriedCost.test.ts"],
  ["gross paid", "src/lib/__tests__/grossPaid.test.ts"],
  ["value bridge", "src/lib/__tests__/valueBridge.test.ts"],
  ["clubbed figures", "src/lib/__tests__/clubbedFigures.test.ts"],
  ["ledger joins", "src/lib/__tests__/ledgerJoins.test.ts"],
  ["FIFO returns", "src/lib/__tests__/fifo.test.ts"],
  ["stock exposure", "src/lib/__tests__/stockExposure.test.ts"],
  ["held through", "src/lib/__tests__/heldThrough.test.ts"],
  ["security names", "src/lib/__tests__/securityNames.test.ts"],
  ["screener sectors", "src/lib/__tests__/screenerSectors.test.ts"],
  ["index sectors", "src/lib/__tests__/indexSectors.test.ts"],
  ["monitor sectors", "src/lib/__tests__/monitorSectors.test.ts"],
  ["fund NAVs", "src/lib/__tests__/fundNavs.test.ts"],
  ["unpriced statement units", "src/lib/__tests__/unpricedUnits.test.ts"],
  ["return attribution", "src/lib/__tests__/attribution.test.ts"],
  ["segment return attribution", "src/lib/__tests__/segmentReturns.test.ts"],
  ["negligible floor", "src/lib/__tests__/negligibleFloor.test.ts"],
  ["scheme labels & transaction order", "src/lib/__tests__/schemeLabel.test.ts"],
  ["daily NAV movers", "src/lib/__tests__/navMovers.test.ts"],
  ["AIF category", "src/lib/__tests__/aifCategory.test.ts"],
  ["market side", "src/lib/__tests__/marketSide.test.ts"],
  ["fund returns", "src/lib/__tests__/fundReturns.test.ts"],
  ["search index", "src/lib/__tests__/searchIndex.test.ts"],
  ["share movements", "src/lib/__tests__/shareMovements.test.ts"],
  ["review gaps", "src/lib/__tests__/reviewGaps.test.ts"],
  ["Polycab live record", "src/lib/__tests__/polycabLive.test.ts"],
  ["Polycab function", "src/lib/__tests__/polycabFunction.test.ts"],
  ["extras & admin figures", "src/lib/__tests__/extrasFigures.test.ts"],
  ["price alerts", "src/lib/__tests__/priceAlerts.test.ts"],
  ["price levels sent to Glow Central Research", "src/lib/__tests__/researchLevels.test.ts"],
  ["movers inside the AIFs and PMS mandates", "src/lib/__tests__/insideMovers.test.ts"],
  ["member scope", "src/lib/__tests__/memberScope.test.ts"],
  ["statement library", "src/lib/__tests__/statementLibrary.test.ts"],
  ["statement uploads", "src/lib/__tests__/statementUploads.test.ts"],
  ["statement preview", "src/lib/__tests__/statementPreview.test.ts"],
  ["display FX rate", "src/lib/__tests__/fx.test.ts"],
  ["day move", "src/lib/__tests__/dayMove.test.ts"],
  ["concentration by investment", "src/lib/__tests__/concentration.test.ts"],
  ["lot terms and the hold-to-LTCG planner", "src/lib/__tests__/ltDate.test.ts"],
  ["invested on", "src/lib/__tests__/investedOn.test.ts"],
  ["Monitor holding columns on the attribution", "src/lib/__tests__/lineHoldingFigures.test.ts"],
  ["holding flows", "src/lib/__tests__/holdingFlows.test.ts"],
  ["whole-book NAV series", "src/lib/__tests__/bookNav.test.ts"],
];

let failed = 0;
// `ONLY=<name>,<name>` runs a subset, matched on the suite's name — for
// re-running one suite while fixing it. The default is every suite.
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
SUITES.push(["table Excel exports", "src/lib/__tests__/tableExcel.test.ts"]);
SUITES.push(["table number corrections and Excel uploads", "src/lib/__tests__/tableInputs.test.ts"]);
SUITES.push(["private market capital cells", "src/lib/__tests__/capitalEntry.test.ts"]);
SUITES.push(["under a year absolute", "src/lib/__tests__/underAYear.test.ts"]);
for (const [name, rel] of SUITES) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const out = path.join(DIR, path.basename(rel).replace(/\.ts$/, ".mjs"));
  const build = spawnSync(
    path.join(ROOT, "node_modules/.bin/esbuild"),
    [path.join(ROOT, rel), "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`,
     // The financial-table suite reads its fixture off disk at run time, so the
     // bundle must not try to inline `node:fs` and friends.
     "--packages=external",
     // Source links preload this browser-only chunk on pointer/focus intent.
     // Keep it lazy in Node too: its Vite worker URL cannot be imported by Node.
     `--external:${path.join(ROOT, "src/components/PdfPreview")}`,
     `--alias:@=${path.join(ROOT, "src")}`, "--log-level=error"],
    { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] },
  );
  if (build.status !== 0) { console.error(`${name}: bundling failed`); failed++; continue; }
  console.log(`\n──── ${name}`);
  // The bundle runs from a temp dir, so a suite cannot find its fixtures from
  // `import.meta.url` — that resolves next to the BUNDLE, not the source. The
  // repo path is passed in instead.
  const run = spawnSync(process.execPath, [out], {
    stdio: "inherit",
    env: { ...process.env, GLOW_FIXTURES: path.join(ROOT, "src/lib/__tests__/fixtures") },
  });
  if (run.status !== 0) failed++;
}

fs.rmSync(DIR, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
