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
  // Exit 2 = BLOCKED: the real statements are not present. Reported, not failed.
  { name: "golden",   file: "golden.mjs",        required: false },
];

let failed = 0, blocked = 0;
const lines = [];

for (const s of SUITES) {
  const r = spawnSync(process.execPath, [path.join(HERE, s.file)], { encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const tail = out.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
  if (r.status === 0) {
    lines.push(`  PASS     ${s.name.padEnd(9)} ${tail.trim()}`);
  } else if (r.status === 2 && !s.required) {
    blocked++;
    lines.push(`  BLOCKED  ${s.name.padEnd(9)} no source statements to verify against`);
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
  console.log(`  All machinery suites passed. ${blocked} suite(s) BLOCKED — the golden figures cannot be`);
  console.log("  verified until the statement PDFs are in source/ and `npm run extract` has run.");
  console.log("  This is not a pass for extraction accuracy, and is not counted as one.");
}
process.exit(0);
