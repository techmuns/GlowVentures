// WHAT `partial` MEANS — a read gap, never a fact about the statement.
// Run: node scripts/ingest/__tests__/readStatus.test.mjs
//
// The Statement Library showed every 360 ONE holding statement as "Partial".
// Each was read line for line; each carried a warning that 360 ONE printed "No
// data available to generate Transaction Statement Report", and every reader
// ends `warnings.length ? "partial" : "ok"`. `lib/readStatus.mjs` splits the
// warnings into statement NOTES and read GAPS and promotes a document whose
// every warning is a note. This suite pins the rule, and then holds the
// committed archive to it — so a document cannot go back to "Partial" for a
// reason that is only something the statement says about itself.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { settleStatus, readGaps, isStatementNote, STATEMENT_NOTES } from "../lib/readStatus.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("readStatus");

const doc = (status, codes, extra = {}) => ({
  docKey: "test", status, warnings: codes.map((code) => ({ code, detail: "" })), ...extra,
});

// ── the rule ──────────────────────────────────────────────────────────────────
ok("a statement's own reported-empty sections do not make the reading partial",
  settleStatus(doc("partial", ["section-reported-empty", "section-reported-empty"])).status === "ok");
ok("a published-no-NAV basis is a note, not a gap",
  settleStatus(doc("partial", ["statement-basis", "no-valuation-published"])).status === "ok");
ok("one read gap among notes keeps the document partial",
  settleStatus(doc("partial", ["section-reported-empty", "columns-not-matched"])).status === "partial");
ok("an unparseable cell is a gap",
  settleStatus(doc("partial", ["unparseable-cell"])).status === "partial");
ok("a code nobody has argued into the note list is a gap, never a default note",
  settleStatus(doc("partial", ["some-new-warning"])).status === "partial");
ok("a partial with NO warning is left alone — several readers use that to mean the page fell short",
  settleStatus(doc("partial", [])).status === "partial");
ok("failed is never promoted, whatever it carries",
  settleStatus(doc("failed", ["pdf-encrypted"])).status === "failed");
ok("ok is never demoted, whatever it carries",
  settleStatus(doc("ok", ["columns-not-matched"])).status === "ok");

// `owner-unresolved` is written before the backfills: once a sibling settles the
// holder it is the record of how, and only an owner still unknown is a gap.
ok("owner-unresolved on a document whose owner a sibling settled is a note",
  isStatementNote({ code: "owner-unresolved" }, { ownerId: "bharat-jaisinghani" }));
ok("owner-unresolved on a document with no owner is a gap",
  !isStatementNote({ code: "owner-unresolved" }, { ownerId: null }));
ok("readGaps names exactly the gaps",
  JSON.stringify(readGaps(doc("partial", ["from-bundle", "holdings-not-read", "pdf-encrypted"])).map((w) => w.code))
    === JSON.stringify(["holdings-not-read"]));

// The read gaps the pipeline actually raises must never be notes — a typo in the
// note list must not quietly wave one through.
for (const gap of ["columns-not-matched", "unparseable-cell", "holdings-not-read", "holder-not-read", "folio-not-read",
  "no-reader-for-report-type", "no-extractor", "pdf-read-failed", "no-text-layer", "field-not-in-document-contract",
  "profit-and-loss-line-missing", "equity-subtotal-not-found", "witness-mismatch", "extractor-threw"]) {
  ok(`${gap} is a read gap`, !STATEMENT_NOTES.has(gap));
}

// ── the committed archive ─────────────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AUDIT = path.join(ROOT, "public", "audit");
let manifest = [];
try { manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8")); } catch { /* no archive */ }
ok("the archive is present to check", manifest.length > 0, AUDIT);

const notesOnly = [];
for (const e of manifest) {
  if (e.status !== "partial") continue;
  const d = JSON.parse(fs.readFileSync(path.join(AUDIT, e.docKey, "document.json"), "utf8"));
  if ((d.warnings ?? []).length && !readGaps(d).length) notesOnly.push(e.docKey);
}
ok("no archived document is partial for a reason that is only a statement note", notesOnly.length === 0,
  notesOnly.slice(0, 8).join(", "));

const threeSixty = manifest.filter((e) => e.provider === "360 ONE Private Wealth");
ok("every 360 ONE holding statement reads as read", threeSixty.length > 0 && threeSixty.every((e) => e.status === "ok"),
  threeSixty.map((e) => `${e.docKey}:${e.status}`).join(", "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
