#!/usr/bin/env node
// Set (or rotate) the dashboard password.
//
//   npm run set-password -- "the new password"
//
// Computes the salted SHA-256 hash and rewrites PASSWORD_HASH in
// functions/_middleware.js. The plaintext password is never written anywhere.
// After running, commit & push — Cloudflare Pages redeploys and the new
// password goes live (all existing sessions are invalidated).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Must match PEPPER in functions/_middleware.js.
const PEPPER = "glow-ventures-family-office::pw::v1";

const pw = process.argv.slice(2).join(" ");
if (!pw.trim()) {
  console.error('Usage: npm run set-password -- "<new password>"');
  process.exit(1);
}
if (pw.length < 8) {
  console.error("Refusing to set a password shorter than 8 characters. Choose a stronger one.");
  process.exit(1);
}

const hash = createHash("sha256").update(`${PEPPER}\n${pw}`, "utf8").digest("hex");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "functions", "_middleware.js");

const src = readFileSync(file, "utf8");
const re = /const PASSWORD_HASH = "[^"]*";/;
if (!re.test(src)) {
  console.error(`Could not find the PASSWORD_HASH line in ${file}.`);
  process.exit(1);
}
writeFileSync(file, src.replace(re, `const PASSWORD_HASH = "${hash}";`));

console.log("✓ Dashboard password updated in functions/_middleware.js");
console.log("  Next: commit & push to deploy.  (hash: " + hash.slice(0, 12) + "…)");
