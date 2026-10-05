#!/usr/bin/env node
// Test runner for the ingest pipeline.  npm run test:ingest
//
// Distinguishes three outcomes, because the golden test has three. A suite that
// could not run for want of input is NOT a pass, and is not reported as one —
// but it also must not block the machinery tests, which verify everything that
// does not depend on the real statements.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  { name: "parseNum", file: "parseNum.test.mjs", required: true },
  { name: "layout",   file: "layout.test.mjs",   required: true },
  { name: "pipeline", file: "pipeline.test.mjs", required: true },
  { name: "altFund",  file: "altFund.test.mjs",  required: true },
  { name: "buoyant",  file: "buoyantFlows.test.mjs", required: true },
  { name: "classSwitch", file: "classSwitch.test.mjs", required: true },
  { name: "capitalCalls", file: "capitalCalls.test.mjs", required: true },
  { name: "payouts", file: "payouts.test.mjs", required: true },
  { name: "hdfcOwner", file: "hdfcNsdlOwner.test.mjs", required: true },
  { name: "motilalOwner", file: "motilalOwner.test.mjs", required: true },
  { name: "nsdlPriceDate", file: "nsdlPriceDate.test.mjs", required: true },
  { name: "neoFlows", file: "neoFlows.test.mjs", required: true },
  { name: "mfPurchase", file: "mfPurchase.test.mjs", required: true },
  { name: "pmsReaders", file: "pmsReaders.test.mjs", required: true },
  { name: "categoryWords", file: "categoryWords.test.mjs", required: true },
  { name: "separate", file: "separateInvestments.test.mjs", required: true },
  { name: "profitLoss", file: "profitLoss.test.mjs", required: true },
  { name: "askArf", file: "askArf.test.mjs", required: true },
  { name: "buoyantSnap", file: "buoyantSnap.test.mjs", required: true },
  { name: "sheetWitness", file: "sheetWitness.test.mjs", required: true },
  { name: "septemberAudit", file: "septemberAudit.test.mjs", required: true },
  // Exit 2 = BLOCKED: the real statements are not present. Reported, not failed.
  { name: "golden",   file: "golden.mjs",        required: false },
];

let failed = 0, blocked = 0;
const lines = [];
const blockedDetail = [];

for (const s of SUITES) {
  const r = spawnSync(process.execPath, [path.join(HERE, s.file)], { encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  // The count line ("79 passed, 0 failed, …"), not just the last line printed —
  // BLOCKED runs go on to explain themselves after it.
  const counts = out.split("\n").reverse().find((l) => /\d+ passed/.test(l))?.trim() ?? "";
  const tail = out.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
  if (r.status === 0) {
    lines.push(`  PASS     ${s.name.padEnd(9)} ${counts || tail.trim()}`);
  } else if (r.status === 2 && !s.required) {
    blocked++;
    lines.push(`  BLOCKED  ${s.name.padEnd(9)} ${counts}`);
    // Carry the suite's own explanation up: which cases were blocked, and what
    // was left unchecked. "no source statements" is not true when most of them
    // are present and 79 figures verified.
    const from = out.split("\n").findIndex((l) => /^ {2}(NOT CHECKED|BLOCKED — no statement in source)/.test(l));
    if (from >= 0) blockedDetail.push(...out.split("\n").slice(from).filter((l) => l.trim()));
  } else {
    failed++;
    lines.push(`  FAIL     ${s.name.padEnd(9)} ${tail.trim()}`);
    lines.push(out.split("\n").filter((l) => /FAIL|got .*want/.test(l)).slice(0, 12).map((l) => `           ${l.trim()}`).join("\n"));
  }
}

console.log("ingest test suites\n");
console.log(lines.filter(Boolean).join("\n"));
console.log("");
if (failed) {
  console.log(`  ${failed} suite(s) FAILED.`);
  process.exit(1);
}
if (blocked) {
  console.log(`  All machinery suites passed, and every golden figure that could be checked`);
  console.log(`  reproduced. ${blocked} suite(s) BLOCKED — some expected accounts have no statement`);
  console.log("  in source/. That is not a pass for those accounts and is not counted as one.");
  if (blockedDetail.length) {
    console.log("");
    for (const l of blockedDetail) console.log(l);
  }
}
process.exit(0);
