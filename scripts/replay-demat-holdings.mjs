#!/usr/bin/env node
/**
 * REPLAY THE MOTILAL OSWAL HOLDINGS READER OVER THE COMMITTED ARCHIVE.
 *
 * `npm run replay:demat-holdings` · `npm run replay:demat-holdings -- --check`
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The seventh faithful partial replay, after `rekey:archive`,
 * `build-lookthrough --reindex`, `replay:calls`, `replay:movements`,
 * `replay:owners` and `replay:flows`, and it lands the correction to what the
 * CDSL holding statement's `Rs RATE` and `Rs VALUE` columns ARE (Stage 10cz):
 * the price of each holding's LAST DEPOSITORY MOVEMENT and that price times
 * the movement's own quantity, not a 31 July valuation. `npm run extract`
 * needs `GLOW_PDF_PASSWORDS` for eight encrypted statements and
 * `guardAgainstShrinkingTheArchive` correctly refuses a run without them, so
 * the reader change would otherwise be unlandable on most machines.
 *
 * ── AND WHY IT READS THE PDF, WHERE THE OTHERS READ `pages.json` ────────────
 *
 * The holdings reader takes each column from the band its header word occupies
 * — `row.items`, every figure with the x it was printed at — because the
 * table's wrap lines defeat a positional read. `pages.json` keeps the text and
 * not the coordinates, so nothing but the PDF can say which band a figure sat
 * in. These six statements are not encrypted, so re-reading them needs no
 * password; they live in `source/_extracted/`, which `npm run inventory`
 * expands from `source/august-2026-d/MOTILAL REPORTS.zip`.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 *
 *   1. IT TOUCHES ONLY WHAT THE READER CHANGE MOVES. Per holding: the market
 *      price, the printed value, the two last-movement fields and what
 *      `deriveHolding` computes from them. Per document: the totals, the
 *      derived portfolio total and the reader's own warnings — and the
 *      manifest's warning count, which counts them. Every other field —
 *      identity, the ISIN-backfilled name, a dedupe tag — is written back as
 *      it was on disk.
 *   2. ITS GATE IS STRUCK ON THE ARCHIVE. The PDF's page text must be the
 *      committed `pages.json` exactly, and the replayed rows must be the rows
 *      on disk — same order, ISIN, name as printed, quantity, class and face
 *      value. If either fails, this is not the document the archive recorded
 *      and nothing is written for it.
 *   3. `--check` WRITES NOTHING and is the control run: against an unchanged
 *      reader it must be a no-op, and it was — run with the reader as it stood
 *      before this change, it reproduced all six documents byte for byte.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public/audit");
const CHECK = process.argv.includes("--check");

const { extractLayout, passwordsFromEnv } = await import(path.join(ROOT, "scripts/ingest/lib/layout.mjs"));
const { splitBundle } = await import(path.join(ROOT, "scripts/ingest/lib/bundle.mjs"));
const { deriveDocument, DOCUMENT_FIELDS } = await import(path.join(ROOT, "scripts/ingest/lib/document.mjs"));
const demat = await import(path.join(ROOT, "scripts/ingest/providers/motilalDemat.mjs"));

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The holding fields the reader change moves — nothing else is written. */
const MOVED = new Set([
  "marketPrice", "lastMovementRate", "lastMovementValue", "printed",
  "marketValue", "marketValueFromPrinted", "gainLoss", "pctGainLoss", "pctAssets", "unrealized",
]);
/**
 * The warnings this reader and extract.mjs's contract check write on a
 * holdings document — and so the only ones this replay may replace. A
 * committed warning outside this list was written by some other stage, and
 * a replay that cannot say whose it is refuses rather than drops it.
 */
const READER_CODES = new Set([
  "client-id-not-read", "owner-unresolved", "pan-contradicts-name",
  // The client-ID join's two (Stage 10db).
  "owner-from-register", "beneficial-owner-refused",
  "account-holds-nothing", "no-holding-rows",
  "value-column-does-not-reproduce-total", "rate-is-last-movement-price",
  "aif-units-carry-face-value-not-nav", "no-rate-published",
  // The previous reader's, which this replay exists to retire.
  "printed-value-not-quantity-times-rate",
  "field-not-in-document-contract",
]);

/** Rebuild one holding in the new field order, moving only what `MOVED` names. */
function transplant(fresh, was) {
  const next = {};
  for (const k of Object.keys(fresh)) next[k] = MOVED.has(k) || !(k in was) ? fresh[k] : was[k];
  for (const k of Object.keys(was)) if (!(k in next)) next[k] = was[k];
  return next;
}

const manifestPath = path.join(AUDIT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const passwords = passwordsFromEnv();

let checked = 0, changed = 0, refused = 0, valued = 0, lastMoved = 0;
const refuse = (docKey, why) => { console.error(`REFUSED ${docKey}: ${why}`); refused += 1; };

for (const entry of manifest) {
  if (entry.provider !== demat.PROVIDER || entry.reportType !== "holdings") continue;
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

  // RULE 2, first half — the same document the archive recorded.
  const pagesFile = path.join(dir, "pages.json");
  const recorded = fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, "utf8")).pages ?? [] : null;
  const fresh = grid.pages.map((p) => ({ page: p.page, text: p.text }));
  if (!recorded || !eq(fresh, recorded)) {
    refuse(entry.docKey, "the PDF's page text is not the committed pages.json — this is not the document the archive recorded");
    continue;
  }

  const result = demat.extract({ grid, meta: { docKey: doc.docKey, fileName: path.basename(pdf) } });
  if (!result || result.reportType !== "holdings") { refuse(entry.docKey, "the reader no longer recognises this document"); continue; }
  for (const k of ["accountNo", "asOf", "excludedFromBook"]) {
    if (!eq(result[k], doc[k])) { refuse(entry.docKey, `the reader reads ${k} as ${JSON.stringify(result[k])} where the archive holds ${JSON.stringify(doc[k])}`); }
  }
  if (refused && !["accountNo", "asOf", "excludedFromBook"].every((k) => eq(result[k], doc[k]))) continue;

  // extract.mjs's own contract check, reproduced so a field the reader returns
  // and makeDocument does not carry is reported exactly as a full run would.
  const warnings = [...(result.warnings ?? [])];
  const dropped = Object.keys(result).filter((k) => !DOCUMENT_FIELDS.includes(k));
  if (dropped.length) {
    warnings.push({
      code: "field-not-in-document-contract",
      detail: `${demat.PROVIDER} returned ${dropped.join(", ")}, which makeDocument does not carry — the value is discarded. Add it to lib/document.mjs.`,
    });
  }
  const foreign = (doc.warnings ?? []).filter((w) => !READER_CODES.has(w.code));
  if (foreign.length) {
    refuse(entry.docKey, `it carries warning(s) no reader wrote — ${foreign.map((w) => w.code).join(", ")} — and this replay will not drop what it cannot attribute`);
    continue;
  }

  const derived = deriveDocument({ ...doc, holdings: result.holdings, transactions: [] });
  const was = doc.holdings ?? [];
  const now = derived.holdings;

  // RULE 2, second half — the same rows, in the same order.
  const rowsMatch = now.length === was.length && now.every((h, i) => {
    const w = was[i];
    return eq(h.isin, w.isin) && eq(h.security, w.printedSecurity ?? w.security) && eq(h.quantity, w.quantity)
      && eq(h.assetClass, w.assetClass) && eq(h.faceValue, w.faceValue)
      && ["gainLoss", "pctGainLoss", "pctAssets", "unrealized"].every((k) => eq(h.printed?.[k], w.printed?.[k]));
  });
  if (!rowsMatch) { refuse(entry.docKey, `the replayed rows do not reproduce the ${was.length} already on disk`); continue; }
  const totalsMatch = Object.keys(result.totals ?? {}).every((k) => k === "totalMarketValue" || eq(result.totals[k], doc.totals?.[k]));
  if (!totalsMatch) { refuse(entry.docKey, "the replayed totals differ from the archive's on a field other than the market value"); continue; }

  const next = {
    ...doc,
    warnings,
    holdings: now.map((h, i) => transplant(h, was[i])),
    totals: result.totals,
    derivedPortfolioTotal: derived.derivedPortfolioTotal,
  };
  valued += next.holdings.filter((h) => h.marketValue != null).length;
  lastMoved += next.holdings.filter((h) => h.lastMovementRate != null).length;
  if (eq(next, doc)) continue;

  changed += 1;
  const before = was.filter((h) => h.marketValue != null).length;
  console.log(`${CHECK ? "would update" : "updated"} ${entry.docKey.padEnd(78)} valued rows ${String(before).padStart(2)} → ${next.holdings.filter((h) => h.marketValue != null).length}`);
  if (!CHECK) {
    fs.writeFileSync(path.join(dir, "document.json"), JSON.stringify(next, null, 1) + "\n");
    entry.warnings = next.warnings.length;
    entry.status = next.status;
  }
}

if (!CHECK && changed) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");

console.log(`\n${checked} Motilal Oswal holding statement(s) replayed · ${changed} ${CHECK ? "would change" : "changed"} · ${refused} refused`);
console.log(`${valued} row(s) carry a market value from the statement · ${lastMoved} carry the price of their last movement instead`);
if (refused) process.exit(1);
if (CHECK && changed) process.exit(2);
