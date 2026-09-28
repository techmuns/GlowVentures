#!/usr/bin/env node
/**
 * REGENERATE THE EXTRACTION REPORT FROM THE COMMITTED ARCHIVE.
 *
 * `npm run report:extraction` · `npm run report:extraction -- --check`
 *
 * `docs/EXTRACTION-REPORT.md` and `docs/extraction-report.json` are written by
 * `npm run extract`, which reconciles the documents it has just read. Every
 * faithful partial replay since — `rekey:archive`, `replay:owners`, the 3P
 * flows, `replay:demat-holdings` — changed documents in `public/audit/` and
 * left the report describing the documents as they were BEFORE the replay,
 * because a full re-extraction needs `GLOW_PDF_PASSWORDS` and so could not be
 * the way to refresh it. A report that no longer describes the archive beside
 * it is the "figure copied into prose does not regenerate" failure, one
 * document over.
 *
 * This runs the SAME `reconcile()` over the SAME documents, read from disk
 * instead of from the PDFs, and writes the report through the same
 * `writeReports`. Two inputs a full run measures and the archive does not carry
 * are taken from the committed report itself: how many PDFs `source/` held and
 * which were byte-identical duplicates. Neither changes when a replay does.
 *
 * It writes NOTHING to `public/audit/` — `reconcile()` tags duplicate holdings
 * in memory, and those tags are the extractor's to write, not this script's.
 *
 * IDEMPOTENT: the committed `generatedAt` is kept when nothing else in the
 * report moved, so a second run is a no-op and `--check` exits 0. A report that
 * did move is stamped with the time it was regenerated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const DOCS = process.env.GLOW_DOCS_DIR ?? path.join(ROOT, "docs");
const CHECK = process.argv.includes("--check");

const { reconcile, writeReports } = await import(path.join(ROOT, "scripts/ingest/reconcile.mjs"));

const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const docs = manifest.map((e) => JSON.parse(fs.readFileSync(path.join(AUDIT, e.docKey, "document.json"), "utf8")));
const committedPath = path.join(DOCS, "extraction-report.json");
const committed = JSON.parse(fs.readFileSync(committedPath, "utf8"));
let symbolMap = {};
try { symbolMap = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nseSymbols.json"), "utf8")); } catch { /* same fallback as extract.mjs */ }

const report = reconcile(docs, {
  pdfCount: committed.coverage?.pdfsFound ?? docs.length,
  symbolMap,
  duplicateSources: committed.coverage?.duplicateSources ?? [],
});

const body = (r) => JSON.stringify({ ...r, generatedAt: null });
const moved = body(report) !== body(committed);
report.generatedAt = moved ? new Date().toISOString() : committed.generatedAt;

const s = report.summary ?? {};
console.log(`${docs.length} archived document(s) reconciled — ${JSON.stringify(s)}`);
if (!moved) {
  console.log("the committed report already describes this archive — nothing to write");
  process.exit(0);
}
if (CHECK) {
  console.log("the committed report does NOT describe this archive — `npm run report:extraction` rewrites it");
  process.exit(2);
}
writeReports(report, DOCS);
console.log(`wrote ${path.relative(ROOT, path.join(DOCS, "EXTRACTION-REPORT.md"))} and ${path.relative(ROOT, committedPath)}`);
