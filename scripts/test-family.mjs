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
  ["family arithmetic", "src/lib/__tests__/familyMath.test.ts"],
  ["financial tables", "src/lib/__tests__/financialTables.test.ts"],
  ["cash flow & calendar", "src/lib/__tests__/yfinStatements.test.ts"],
  ["ratio table", "src/lib/__tests__/ratioTable.test.ts"],
  ["account XIRR", "src/lib/__tests__/accountXirr.test.ts"],
  ["private market", "src/lib/__tests__/privateMarket.test.ts"],
  ["transaction rollup", "src/lib/__tests__/txnRollup.test.ts"],
  ["chat context", "src/lib/__tests__/chatContext.test.ts"],
  ["chat function", "src/lib/__tests__/chatFunction.test.ts"],
  ["indices function", "src/lib/__tests__/indicesFunction.test.ts"],
  ["quotes function", "src/lib/__tests__/quotesFunction.test.ts"],
  ["portfolio excel", "src/lib/__tests__/portfolioExcel.test.ts"],
  ["holding return", "src/lib/__tests__/holdingReturn.test.ts"],
  ["dated NAV series", "src/lib/__tests__/navSeries.test.ts"],
  ["family taxonomy", "src/lib/__tests__/familyTaxonomy.test.ts"],
  ["capital tranches", "src/lib/__tests__/tranches.test.ts"],
  ["stock exposure", "src/lib/__tests__/stockExposure.test.ts"],
  ["screener sectors", "src/lib/__tests__/screenerSectors.test.ts"],
  ["return attribution", "src/lib/__tests__/attribution.test.ts"],
  ["negligible floor", "src/lib/__tests__/negligibleFloor.test.ts"],
  ["scheme labels & transaction order", "src/lib/__tests__/schemeLabel.test.ts"],
  ["daily NAV movers", "src/lib/__tests__/navMovers.test.ts"],
  ["AIF category", "src/lib/__tests__/aifCategory.test.ts"],
];

let failed = 0;
for (const [name, rel] of SUITES) {
  const out = path.join(DIR, path.basename(rel).replace(/\.ts$/, ".mjs"));
  const build = spawnSync(
    path.join(ROOT, "node_modules/.bin/esbuild"),
    [path.join(ROOT, rel), "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`,
     // The financial-table suite reads its fixture off disk at run time, so the
     // bundle must not try to inline `node:fs` and friends.
     "--packages=external",
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
