#!/usr/bin/env node
/**
 * REPLAY THE DATED-TABLE READERS OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:flows` · `npm run replay:flows -- --check`
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A REPAIR LAYER ───────────────────────
 *
 * A fund statement's own dated tables — the deposits a family made, the
 * allotments they bought, a switch between classes — are read by a layout's
 * `flowsFrom` in `providers/altFundStatements.mjs`. Landing a new one would
 * normally mean `npm run extract`, which needs `GLOW_PDF_PASSWORDS` for eight
 * encrypted statements and `pdftoppm`/`tesseract` for two outlined-text ones,
 * and which `guardAgainstShrinkingTheArchive` correctly refuses without them.
 *
 * It does not have to be. The text these readers parse is `public/audit/<doc>/
 * pages.json`, committed, and this script hands it to the reader's OWN
 * `extract()` exactly as `extract.mjs` does — the same function on the same
 * text writes the same bytes on the next full run. `rekey:archive`,
 * `build-lookthrough --reindex`, `replay:calls`, `replay:movements` and
 * `replay:owners` are the precedents; this is the sixth, on their three rules:
 *
 *   1. IT ONLY EVER TOUCHES `cashFlows`, plus the warning a dated reader emits
 *      when it refuses its own table. Every figure already in the document is
 *      written back byte-identically.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The reader's HOLDINGS must reproduce
 *      the ones on disk, row for row — if they do not, this is not the text the
 *      extractor read, nothing is written and the run exits non-zero. And a
 *      document that ALREADY carries a dated table (3P, since Stage 10am) must
 *      get exactly that table back: the replay's own control.
 *   3. `--check` WRITES NOTHING and is the control run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

// ROUTED AS EXTRACTION ROUTES, from the one definition of it. Selecting on
// whether the alt-fund reader recognises a document's TEXT runs it over every
// Buoyant document, because every Buoyant page names the strategy — and all but
// the account statement go to the PMS reader.
const { readerFor, altFunds: alt } = await import(path.join(ROOT, "scripts/ingest/extract.mjs"));

/** The warnings a dated reader emits when it withholds its own table. */
const DATED_CODES = new Set(["dated-table-does-not-tie", "transaction-type-not-declared"]);
const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function pagesOf(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")).pages ?? null;
}

/** The fields of a holding the READER sets — what the gate compares. */
const readerHolding = (h) => ({ securityKey: h.securityKey, quantity: h.quantity, totalCost: h.totalCost, marketPrice: h.marketPrice });

let checked = 0, changed = 0, refused = 0, controls = 0;
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
for (const entry of manifest) {
  const file = path.join(AUDIT, entry.docKey, "document.json");
  if (!fs.existsSync(file)) continue;
  const pages = pagesOf(entry.docKey);
  if (!pages) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (readerFor({ provider: doc.provider, reportType: doc.reportType }) !== alt) continue;
  const text = pages.map((p) => p.text ?? "").join("\n").replace(/[ \t]+/g, " ");
  if (!alt.layoutFor(text)?.flowsFrom) continue;

  const out = alt.extract({ grid: { pages } });
  if (!out) continue;
  checked += 1;

  // RULE 2 — the gate. The reader must see what the extractor saw.
  const mine = (out.holdings ?? []).map(readerHolding);
  const disk = (doc.holdings ?? []).map(readerHolding);
  if (!eq(mine, disk)) {
    console.error(`REFUSED ${entry.docKey}: the reader's holdings ${JSON.stringify(mine)} are not the ${JSON.stringify(disk)} on disk`);
    refused += 1;
    continue;
  }
  const flows = out.cashFlows ?? [];
  if ((doc.cashFlows ?? []).length && !eq(flows, doc.cashFlows)) {
    console.error(`REFUSED ${entry.docKey}: this document already carries a dated table and the replay does not reproduce it`);
    refused += 1;
    continue;
  }
  if ((doc.cashFlows ?? []).length) controls += 1;

  // RULE 1 — only the dated table, and the reader's own refusal if it made one.
  const warnings = [...(doc.warnings ?? [])];
  for (const w of out.warnings ?? []) {
    if (DATED_CODES.has(w.code) && !warnings.some((x) => x.code === w.code && x.detail === w.detail)) warnings.push(w);
  }
  if (eq(flows, doc.cashFlows) && eq(warnings, doc.warnings)) continue;
  changed += 1;
  const cap = flows.filter((c) => c.kind === "contribution").reduce((t, c) => t + (c.amount ?? 0), 0);
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(52)} ${flows.length} dated row(s) · contributions ${cap}`);
  if (!CHECK) {
    fs.writeFileSync(file, JSON.stringify({ ...doc, cashFlows: flows, warnings }, null, 1) + "\n");
  }
}

console.log(`\n${checked} document(s) with a dated reader replayed · ${controls} reproduced an existing table exactly · `
  + `${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
