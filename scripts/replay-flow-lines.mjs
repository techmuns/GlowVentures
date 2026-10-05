#!/usr/bin/env node
/**
 * REPLAY THE TWO WHOLE-LIFE READERS OVER THE COMMITTED ARCHIVE, AND LAND THE
 * PRINTED LINES BEHIND THEIR FLOWS.
 *
 * `npm run replay:flow-lines` · `npm run replay:flow-lines -- --check`
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * ASK's PROFIT AND LOSS ACCOUNT and Marathon's DETAILS OF INCOME AND EXPENSES
 * print more lines than `makeFlows` has fields. The readers added dividend to
 * interest, custodian fees to STT and short- to long-term gains, and kept only
 * the sums — so the dashboard could not show the lines the family's statements
 * print (Stage 10df). The readers now carry each printed line beside its flow
 * (`flows.lines`), and this replay lands them without `npm run extract`, which
 * needs `GLOW_PDF_PASSWORDS` for eight other statements and is correctly
 * refused without them by `guardAgainstShrinkingTheArchive`.
 *
 * The eighth faithful partial replay, after `rekey:archive`,
 * `build-lookthrough --reindex`, `replay:calls`, `replay:movements`,
 * `replay:owners`, `replay:flows` and `replay:demat-holdings`. Like the last
 * one it reads the PDF rather than `pages.json`, because both readers take a
 * figure from the item it was printed as and `pages.json` keeps only the text.
 * None of the four statements is encrypted.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 *
 *   1. IT WRITES `flows.lines` AND NOTHING ELSE — except the three bridge
 *      lines both readers now state their report does not print (accrued
 *      income, change in accruals, gain prior to takeover), which it may take
 *      from ABSENT to NULL and never to a figure. Every other flow field, the
 *      holdings, the warnings and the section sheet must come back exactly as
 *      the archive holds them, or the document is refused — a replay that
 *      moved a figure would be a re-extraction nobody asked for.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The PDF's page text must be the
 *      committed `pages.json`, and the replayed sheet the committed section
 *      file, so the lines come from the document the archive recorded.
 *   3. `--check` WRITES NOTHING and is the control run: against an unchanged
 *      reader it must be a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const { extractLayout, passwordsFromEnv } = await import(path.join(ROOT, "scripts/ingest/lib/layout.mjs"));
const { splitBundle } = await import(path.join(ROOT, "scripts/ingest/lib/bundle.mjs"));
const pms = await import(path.join(ROOT, "scripts/ingest/providers/pmsStatements.mjs"));

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const without = (o, ...keys) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k)));
/** The bridge lines a reader may now state as NOT PRINTED: absent → null only. */
const NOT_PRINTED = ["accruedIncome", "changeInAccruals", "gainPriorToTakeover"];

/** The report types whose reader prints its lines, and the sheet each writes. */
const SHEET = { "income-expense": "incomeExpense", "profit-and-loss": "profitAndLoss" };

const manifestPath = path.join(AUDIT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const passwords = passwordsFromEnv();

let checked = 0, changed = 0, refused = 0, lines = 0;
const refuse = (docKey, why) => { console.error(`REFUSED ${docKey}: ${why}`); refused += 1; };

for (const entry of manifest) {
  // A spreadsheet export is a WITNESS of the PDF beside it (Stage 10da), never
  // a document of its own, and its flows are not what the book reads.
  if (!SHEET[entry.reportType] || entry.twinOf) continue;
  const dir = path.join(AUDIT, entry.docKey);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, "document.json"), "utf8"));
  const pdf = path.join(ROOT, doc.sourcePath ?? "");
  checked += 1;
  if (!doc.sourcePath || !fs.existsSync(pdf)) {
    refuse(entry.docKey, `${doc.sourcePath} is not on disk — run \`npm run inventory\`, which expands source/'s ZIPs into source/_extracted/`);
    continue;
  }

  const grid = await extractLayout(new Uint8Array(fs.readFileSync(pdf)), { passwords });
  if (grid.error) { refuse(entry.docKey, `the PDF did not open: ${grid.error}`); continue; }
  if (splitBundle(grid)) { refuse(entry.docKey, "the file reads as a bundle of several reports, which the archive did not record"); continue; }

  // RULE 2 — the same document the archive recorded.
  const pagesFile = path.join(dir, "pages.json");
  const recorded = fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, "utf8")).pages ?? [] : null;
  const fresh = grid.pages.map((p) => ({ page: p.page, text: p.text }));
  if (!recorded || !eq(fresh, recorded)) {
    refuse(entry.docKey, "the PDF's page text is not the committed pages.json — this is not the document the archive recorded");
    continue;
  }

  const result = pms.extract({
    grid,
    meta: { docKey: doc.docKey, fileName: path.basename(pdf), reportType: doc.reportType, provider: doc.provider, accountNo: doc.accountNo },
  });
  if (!result?.flows) { refuse(entry.docKey, "the reader no longer reads this document's flows"); continue; }

  // RULE 1 — everything but the lines comes back as the archive holds it.
  if (!eq(without(result.flows, "lines", ...NOT_PRINTED), without(doc.flows, "lines", ...NOT_PRINTED))) {
    refuse(entry.docKey, "the replayed flows differ from the archive's on a field other than the printed lines");
    continue;
  }
  // …and a not-printed line goes from absent to null, or stays what it was.
  const notPrinted = {};
  let notPrintedBad = null;
  for (const k of NOT_PRINTED) {
    if (!(k in result.flows)) { if (k in (doc.flows ?? {})) notPrintedBad = `the reader no longer states ${k}`; continue; }
    if (result.flows[k] !== null) { notPrintedBad = `the reader now reads a figure for ${k}, which this replay may not write`; continue; }
    if (k in (doc.flows ?? {}) && doc.flows[k] !== null) { notPrintedBad = `the archive carries a figure for ${k} the reader now calls not printed`; continue; }
    notPrinted[k] = null;
  }
  if (notPrintedBad) { refuse(entry.docKey, notPrintedBad); continue; }
  if (!eq((result.warnings ?? []).map((w) => w.code), (doc.warnings ?? []).map((w) => w.code))) {
    refuse(entry.docKey, "the reader's warnings differ from the archive's");
    continue;
  }
  // The archive's holdings went through `deriveHolding`, which the reader's
  // raw output has not, so they are compared on what the statement PRINTS.
  const holdingKeys = (hs) => (hs ?? []).map((h) => [h.security, h.assetClass, h.quantity, h.unitCost, h.totalCost, h.printed?.marketValue ?? null]);
  if (!eq(holdingKeys(result.holdings), holdingKeys(doc.holdings))) {
    refuse(entry.docKey, "the replayed holdings differ from the archive's");
    continue;
  }
  const sheetName = SHEET[entry.reportType];
  const sheetFile = path.join(dir, `${sheetName}.json`);
  const sheetOnDisk = fs.existsSync(sheetFile) ? JSON.parse(fs.readFileSync(sheetFile, "utf8")) : null;
  if (!sheetOnDisk || !eq(result.sections?.[sheetName], sheetOnDisk)) {
    refuse(entry.docKey, `the replayed ${sheetName} sheet is not the committed ${sheetName}.json`);
    continue;
  }
  const printed = result.flows.lines;
  if (!Array.isArray(printed) || !printed.length) {
    // A reader that prints no lines has nothing to land — which is what makes
    // this a no-op against the reader as it stood before Stage 10df. Dropping
    // lines the archive already carries is the one thing it must not do.
    if (doc.flows?.lines) refuse(entry.docKey, "the reader no longer prints the lines the archive carries");
    continue;
  }

  // Each flow the lines feed must be exactly its lines added up — the lines are
  // the statement's own figures, and a flow that is not their sum would mean a
  // line was dropped or read into the wrong flow.
  const sums = {};
  for (const l of printed) sums[l.flow] = (sums[l.flow] ?? 0) + (l.value ?? 0);
  const off = Object.entries(sums).filter(([flow, v]) => !(Math.abs(v - (doc.flows?.[flow] ?? NaN)) < 0.005));
  if (off.length) {
    refuse(entry.docKey, `the printed lines do not add to their flows — ${off.map(([f, v]) => `${f} ${v.toFixed(2)} against ${doc.flows?.[f]}`).join("; ")}`);
    continue;
  }
  lines += printed.length;

  // RULE 1 has shown every other field equal, key order included, so the
  // reader's own flows ARE the archive's plus the lines and the not-printed
  // nulls — in the order a full extraction would write them.
  const next = { ...doc, flows: result.flows };
  if (!eq(without(next.flows, "lines", ...NOT_PRINTED), without(doc.flows, "lines", ...NOT_PRINTED))
    || !eq(Object.fromEntries(NOT_PRINTED.filter((k) => k in next.flows).map((k) => [k, next.flows[k]])), { ...Object.fromEntries(NOT_PRINTED.filter((k) => k in (doc.flows ?? {})).map((k) => [k, doc.flows[k]])), ...notPrinted })) {
    refuse(entry.docKey, "the flows to be written are not the archive's plus the lines");
    continue;
  }
  if (eq(next, doc)) continue;
  changed += 1;
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(72)} ${printed.length} printed line(s)`);
  if (!CHECK) fs.writeFileSync(path.join(dir, "document.json"), JSON.stringify(next, null, 1) + "\n");
}

console.log(`\n${checked} whole-life statement(s) replayed · ${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused · ${lines} printed line(s) carried`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
