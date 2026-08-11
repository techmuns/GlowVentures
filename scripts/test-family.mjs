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
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(ROOT, "src/lib/__tests__/familyMath.test.ts");
const OUT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "glow-test-")), "familyMath.mjs");

const build = spawnSync(
  path.join(ROOT, "node_modules/.bin/esbuild"),
  [ENTRY, "--bundle", "--platform=node", "--format=esm", `--outfile=${OUT}`,
   `--alias:@=${path.join(ROOT, "src")}`, "--log-level=error"],
  { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] },
);
if (build.status !== 0) {
  console.error("family tests: bundling failed");
  process.exit(1);
}

const run = spawnSync(process.execPath, [OUT], { stdio: "inherit" });
fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
process.exit(run.status ?? 1);
