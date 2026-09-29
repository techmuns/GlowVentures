#!/usr/bin/env node
/**
 * REPLAY THE DUPLICATE POLICY OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:dedupe` · `npm run replay:dedupe -- --check`
 *
 * ── WHAT IT LANDS ───────────────────────────────────────────────────────────
 *
 *   "both are separate investments" — the family, 28 Sep 2026.
 *
 * Check (c) in `ingest/reconcile.mjs` finds holdings whose figures coincide on
 * two accounts' statements and `applyDedupePolicy` tags them with a shared
 * `dedupeGroup`, which every consolidated figure then counts once. The family
 * has answered for the two pairs this book tagged — 360 ONE Special
 * Opportunities Series 8 under both CRNs, Transition Venture Fund I under both
 * trusts — and the answer is `SEPARATE_INVESTMENTS` in
 * `shared/separateInvestments.mjs`. This lands it: the rows lose their tags,
 * and every figure counts both.
 *
 * ── WHY A REPLAY AND NOT `npm run extract` ──────────────────────────────────
 *
 * Extraction needs `GLOW_PDF_PASSWORDS` for eight encrypted statements, and
 * `guardAgainstShrinkingTheArchive` correctly refuses a run that read fewer
 * documents than are on disk. The tags are DERIVED from figures this archive
 * already carries, by the same two functions `reconcile()` calls, so running
 * them here is a faithful partial replay rather than a repair: the next full
 * extraction runs the same functions on the same figures and writes the same
 * bytes. `rekey:archive`, `build-lookthrough --reindex`, `replay:calls`,
 * `replay:movements`, `replay:owners` and `replay:flows` are the precedents,
 * and this follows their three rules.
 *
 *   1. IT ONLY EVER TOUCHES `dedupeGroup` AND `alsoReportedUnder` on a
 *      holding. Every other byte of every document is written back unchanged —
 *      asserted, not assumed.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. A holding's tags on disk must be
 *      ones the policy itself writes: its group's tag (no answer covers the
 *      group — a document this has not run against), or no tag on EVERY member
 *      of the group (an answer covers it, now or before). Anything else means
 *      the archive was tagged by something other than this policy, nothing is
 *      written, and the run exits non-zero. The untagged-whole-group state is
 *      what lets an answer be WITHDRAWN: delete an entry from
 *      `SEPARATE_INVESTMENTS`, run this, and the pair's tags come back.
 *   3. `--check` WRITES NOTHING and is the control run. Against an archive
 *      already carrying the answers it must be a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEPARATE_INVESTMENTS } from "../shared/separateInvestments.mjs";
import { planDedupeReplay, serialise } from "./lib/dedupeReplay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const files = [];
for (const entry of manifest) {
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, "utf8");
  files.push({ file, raw, doc: JSON.parse(raw) });
}

// A document read and written back with no change must come out byte-identical,
// or rule 1 cannot be asserted at all.
const unfaithful = files.filter((f) => serialise(f.doc) !== f.raw);
if (unfaithful.length) {
  console.error(`REFUSED: ${unfaithful.length} document(s) do not round-trip byte-identically — `
    + `${unfaithful.slice(0, 3).map((f) => path.relative(ROOT, f.file)).join(", ")}. `
    + "This script cannot promise it touched only the tags.");
  process.exit(1);
}

// The gate and the plan are `scripts/lib/dedupeReplay.mjs`'s, so the suite that
// exercises them exercises this run.
const plan = planDedupeReplay(files.map((f) => f.doc), SEPARATE_INVESTMENTS);
for (const r of plan.refusals) console.error(`REFUSED ${r}`);
if (plan.refusals.length) {
  console.error(`${plan.refusals.length} refusal(s) — nothing written.`);
  process.exit(1);
}
for (const u of plan.updates) {
  console.log(`${CHECK ? "would update" : "updated"} ${u.docKey.padEnd(58)} ${u.securityKey}: `
    + `${u.from ?? "(none)"} → ${u.to ?? "(none)"}`);
}
if (!CHECK) for (const w of plan.writes) fs.writeFileSync(files[w.index].file, w.text);
console.log(`${files.length} document(s) checked · ${plan.writes.length} ${CHECK ? "would change" : "changed"} · `
  + `${SEPARATE_INVESTMENTS.length} family decision(s) applied.`);
if (CHECK && plan.writes.length) process.exitCode = 1;
