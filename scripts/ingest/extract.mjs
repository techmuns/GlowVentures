#!/usr/bin/env node
// Extraction pass — statements in source/ become a checkable audit archive.
//
//   npm run extract
//
// Pipeline: for every PDF under source/ (loose or already expanded by
// `npm run inventory`), read it with the COORDINATE-aware layout engine, hand
// the grid to the provider extractor, validate the result against the
// normalized-document contract, and write it to public/audit/ keyed by DOCUMENT
// so every figure traces to one statement. Then reconcile.
//
// Two rules this obeys without exception:
//   • Raw PDFs stay in source/ and are NEVER copied under public/. Only the
//     extracted, reviewable tables ship, and those sit behind the edge gate.
//   • Nothing is invented. A number that could not be read is null, a document
//     that could not be parsed is recorded as failed with its reason, and both
//     end up in docs/EXTRACTION-REPORT.md rather than being smoothed away.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout } from "./lib/layout.mjs";
import { classify } from "./lib/classify.mjs";
import { makeDocument, makeDocKey, assertNormalized, deriveDocument } from "./lib/document.mjs";
import { resolveOwner } from "../../shared/owners.mjs";
import * as pms from "./providers/pmsStatements.mjs";
import * as threeSixtyOne from "./providers/threeSixtyOne.mjs";
import { reconcile, writeReports } from "./reconcile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Overridable so a test run can point at a scratch drop without touching the
// real source/ or overwriting the committed archive.
const SOURCE_DIR = process.env.GLOW_SOURCE_DIR ?? path.join(ROOT, "source");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
const DOCS_DIR = process.env.GLOW_DOCS_DIR ?? path.join(ROOT, "docs");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/** ISIN -> NSE symbol, for the unresolved-securities check. Empty until built. */
function loadSymbolMap() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nseSymbols.json"), "utf8")); }
  catch { return {}; }
}

/**
 * provider name -> extractor module.
 *
 * The three PMS managers share ONE reporting system, so they share one
 * extractor rather than having three near-copies drift apart. 360 ONE keeps its
 * own because its bundle is a genuinely different document.
 */
const EXTRACTORS = Object.fromEntries([
  ...Object.values(pms.PROVIDERS).map((p) => [p.name, pms]),
  [threeSixtyOne.PROVIDER, threeSixtyOne],
]);

function walk(dir, hit, seen = new Set()) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      const real = fs.realpathSync(full);
      if (seen.has(real)) continue;
      seen.add(real);
      walk(full, hit, seen);
    } else if (e.isFile() && /\.pdf$/i.test(full)) hit(full);
  }
}

/** Reading-order text per page, for provenance. */
const pagesJson = (grid) => ({
  name: "pages",
  pages: grid.pages.map((p) => ({ page: p.page, text: p.text })),
});

/** Turn one already-laid-out PDF into a normalized document. */
function extractOne(file, grid) {
  const fileName = path.basename(file);

  // Classify from the flat reading-order text — enough for the header fields.
  const flat = grid.pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
  const meta = classify({ fileName, text: flat });

  const owner = resolveOwner(meta.ownerName);
  const docKey = makeDocKey({
    provider: meta.provider,
    accountNo: meta.accountNo,
    asOf: meta.asOfDate,
    reportType: meta.reportType,
  });

  const base = {
    docKey,
    provider: meta.provider ?? "(unidentified)",
    accountNo: meta.accountNo,
    owner: meta.ownerName,
    ownerId: owner.owner?.ownerId ?? null,
    familyGroup: meta.familyGroup ?? null,
    strategy: meta.strategy ?? null,
    asOf: meta.asOfDate,
    reportType: meta.reportType,
    sourcePath: rel(file),
    pages: grid.numPages,
    stitches: grid.pages.flatMap((p) => p.stitches.map((s) => ({ ...s, page: p.page }))),
  };

  if (grid.error) {
    return makeDocument({ ...base, status: "failed", warnings: [{ code: "pdf-read-failed", detail: grid.error }] });
  }
  const extractor = meta.provider ? EXTRACTORS[meta.provider] : null;
  if (!extractor) {
    return makeDocument({
      ...base,
      status: "failed",
      warnings: [{ code: "no-extractor", detail: `no extractor for provider ${JSON.stringify(meta.provider)} / reportType ${meta.reportType}` }],
    });
  }

  let result;
  try {
    result = extractor.extract({ grid, meta: { ...meta, docKey, fileName } });
  } catch (e) {
    return makeDocument({ ...base, status: "failed", warnings: [{ code: "extractor-threw", detail: e?.message ?? String(e) }] });
  }

  const warnings = [...(result.warnings ?? [])];

  // Resolve the owner from the name the document ENDS UP with, not the one the
  // classifier guessed from flat text. The extractor reads the header off the
  // coordinate grid and often finds a name where the flat-text classifier found
  // none — resolving before the merge left those documents with a correct owner
  // and a null ownerId, which reads downstream as "unidentified person".
  const finalOwnerName = result.owner ?? meta.ownerName ?? null;
  const finalOwner = resolveOwner(finalOwnerName);
  if (!finalOwner.owner && finalOwnerName) {
    warnings.push({ code: "owner-unresolved", detail: `"${finalOwnerName}" matches no canonical owner — add an alias in shared/owners.mjs` });
  }
  // Derive every derivable field from the primitives BEFORE the document is
  // validated or written. Nothing downstream ever sees an un-derived holding.
  const doc = deriveDocument(makeDocument({
    ...base, ...result, warnings,
    owner: finalOwnerName,
    ownerId: finalOwner.owner?.ownerId ?? null,
  }));
  // The PRINTED account number is the record, and the extractor reads it off the
  // page while the classifier only had the file name to go on. They disagree
  // here: `G100023_100023_PortFolioFactSheet.pdf` prints `Account: 100022`, and
  // keying that document under 100023 files Ankita's fact sheet with Ajay's
  // statements.
  return assertNormalized(rekey(doc));
}

/**
 * Re-key a document after its identity changed, carrying every back-reference
 * with it. `source` on each holding, each return series and the flows block is
 * the docKey — leaving those pointing at the old key would break provenance in
 * exactly the places the audit archive exists to preserve it.
 */
function rekey(doc) {
  const docKey = makeDocKey({
    provider: doc.provider, accountNo: doc.accountNo, asOf: doc.asOf, reportType: doc.reportType,
  });
  if (docKey === doc.docKey) return doc;
  const old = doc.docKey;
  const move = (o) => (o && o.source === old ? { ...o, source: docKey } : o);
  doc.docKey = docKey;
  doc.holdings = doc.holdings.map(move);
  doc.returns = doc.returns.map(move);
  doc.flows = move(doc.flows);
  doc.totals = move(doc.totals);
  doc.cashFlows = doc.cashFlows.map(move);
  return doc;
}

/**
 * Fill a missing account number from the client code, using this drop's OWN
 * statements as the mapping.
 *
 * Green Lantern and Carnelian print two identifiers for the same account: the
 * account number (`Account : 510861`) and a client code (`AJAY T JAISINGHANI -
 * GLC0780`). Several of their reports carry only the code, which leaves those
 * documents keyed `…-unknown-…` and scattered away from the account they belong
 * to.
 *
 * The mapping is not invented — it is read off statements in this same drop
 * that print BOTH, and only ever applied when the code maps to exactly one
 * account. An ambiguous code is left alone and reported. Every backfilled
 * document carries `accountNoSource: "client-code"` and a warning, so no reader
 * mistakes it for a number the statement printed.
 */
function backfillAccountNumbers(docs) {
  const byCode = new Map();
  for (const d of docs) {
    if (!d.clientCode || !d.accountNo) continue;
    const set = byCode.get(d.clientCode) ?? new Set();
    set.add(d.accountNo);
    byCode.set(d.clientCode, set);
  }
  for (const d of docs) {
    if (d.accountNo || !d.clientCode) continue;
    const candidates = byCode.get(d.clientCode);
    if (!candidates || candidates.size !== 1) continue;
    d.accountNo = [...candidates][0];
    d.accountNoSource = "client-code";
    d.warnings.push({
      code: "account-no-from-client-code",
      detail: `this report prints client code ${d.clientCode} but no account number; matched to ${d.accountNo} via other statements in this drop that print both`,
    });
    rekey(d);
  }
  return docs;
}

/**
 * Fill a missing owner from another statement for the SAME provider and account.
 *
 * Some reports don't print the client's name anywhere this engine can read it
 * safely — GoldStandard's CURRENT PORTFOLIO puts it on the same line as the
 * table's own column headings, where a rule loose enough to reach it also reaches
 * a security name. The account number on the other hand is unambiguous, and
 * other statements for that account name the owner outright.
 *
 * So the name is joined on `provider + accountNo`, only when every statement for
 * that account agrees on one owner, and it is recorded as derived. It is NOT a
 * guess about who owns the account — it is the same account's own paperwork.
 */
function backfillOwners(docs) {
  const byAccount = new Map();
  for (const d of docs) {
    if (!d.accountNo || !d.ownerId) continue;
    const k = `${d.provider}\u0000${d.accountNo}`;
    const set = byAccount.get(k) ?? new Map();
    set.set(d.ownerId, d.owner);
    byAccount.set(k, set);
  }
  for (const d of docs) {
    if (d.ownerId || !d.accountNo) continue;
    const candidates = byAccount.get(`${d.provider}\u0000${d.accountNo}`);
    if (!candidates || candidates.size !== 1) continue;
    const [[ownerId, owner]] = [...candidates];
    d.ownerId = ownerId;
    d.owner = owner;
    d.ownerSource = "same-account";
    d.warnings.push({
      code: "owner-from-account-number",
      detail: `this report does not print the client name where it can be read; taken from other statements for ${d.provider} account ${d.accountNo}, which all name ${owner}`,
    });
  }
  return docs;
}

/**
 * No two documents may share a docKey — the archive is a directory per key, so a
 * collision silently overwrites one statement with another.
 *
 * Rather than let that happen quietly, the second and later documents get a
 * suffix and a warning naming what they collided with. A collision is a signal
 * that the identity fields did not distinguish two real statements, and it needs
 * to be visible in the report, not resolved by whoever wrote to disk last.
 */
function ensureUniqueDocKeys(docs) {
  const seen = new Map();
  for (const d of docs) {
    const first = seen.get(d.docKey);
    if (!first) { seen.set(d.docKey, d); continue; }
    const base = d.docKey;
    let n = 2;
    while (seen.has(`${base}-${n}`)) n++;
    d.warnings.push({
      code: "duplicate-doc-key",
      detail: `${base} was already claimed by ${first.sourcePath}; filed as ${base}-${n}. The identity fields (provider, account, as-of, report type) do not distinguish these two statements.`,
    });
    d.docKey = `${base}-${n}`;
    seen.set(d.docKey, d);
  }
  return docs;
}

/** public/audit/<docKey>/<section>.json + pages.json, and the manifest. */
function writeArchive(docs, grids) {
  fs.rmSync(AUDIT_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUDIT_DIR, { recursive: true });

  // The manifest is an ARRAY of document entries. It carries the document
  // identity fields AND the fields the Data Audit browser reads (`fileKey`,
  // `sheets[]`), so the page works against a document-keyed archive with only a
  // cosmetic change — one archive, two readers, no duplication.
  const manifest = [];
  for (const doc of docs) {
    const dir = path.join(AUDIT_DIR, doc.docKey);
    fs.mkdirSync(dir, { recursive: true });
    const sheets = [];
    for (const [name, sheet] of Object.entries(doc.sections ?? {})) {
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(sheet, null, 1) + "\n");
      sheets.push({
        key: name,
        name: sheet.name ?? name,
        rows: sheet.rows?.length ?? 0,
        cols: sheet.rows?.reduce((m, r) => Math.max(m, r.length), 0) ?? 0,
      });
    }
    const grid = grids.get(doc.sourcePath);
    if (grid) {
      const pj = pagesJson(grid);
      fs.writeFileSync(path.join(dir, "pages.json"), JSON.stringify(pj, null, 1) + "\n");
      // Exposed as a sheet too, so raw per-page text is browsable for provenance.
      sheets.push({ key: "pages", name: "Raw page text", rows: pj.pages.length, cols: 2 });
    }
    // The normalized facts, so the book builder never re-parses a PDF.
    fs.writeFileSync(path.join(dir, "document.json"), JSON.stringify({ ...doc, sections: undefined }, null, 1) + "\n");

    manifest.push({
      // ── document identity (this pipeline) ──
      docKey: doc.docKey,
      provider: doc.provider,
      accountNo: doc.accountNo,
      owner: doc.owner,
      ownerId: doc.ownerId,
      familyGroup: doc.familyGroup,
      strategy: doc.strategy,
      asOf: doc.asOf,
      reportType: doc.reportType,
      sourcePath: doc.sourcePath,
      pages: doc.pages,
      sections: sheets.map((s) => s.key),
      status: doc.status,
      warnings: doc.warnings.length,
      // ── fields the Data Audit browser reads ──
      fileKey: doc.docKey,
      label: [doc.provider, doc.accountNo, doc.reportType].filter(Boolean).join(" · "),
      fy: doc.asOf ?? "",
      source: doc.sourcePath,
      sheets,
    });
  }
  fs.writeFileSync(path.join(AUDIT_DIR, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  return manifest;
}

async function main() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const files = [];
  walk(SOURCE_DIR, (f) => files.push(f));
  files.sort((a, b) => rel(a).localeCompare(rel(b)));

  const docs = [];
  const grids = new Map();
  for (const file of files) {
    process.stdout.write(`  reading ${rel(file)} … `);
    const grid = await extractLayout(new Uint8Array(fs.readFileSync(file)));
    grids.set(rel(file), grid);
    const doc = extractOne(file, grid);
    docs.push(doc);
    console.log(`${doc.status}${doc.warnings.length ? ` (${doc.warnings.length} warning${doc.warnings.length === 1 ? "" : "s"})` : ""}`);
  }

  backfillAccountNumbers(docs);
  backfillOwners(docs);
  ensureUniqueDocKeys(docs);
  const manifest = writeArchive(docs, grids);
  const report = reconcile(docs, { pdfCount: files.length, symbolMap: loadSymbolMap() });
  writeReports(report, DOCS_DIR);

  console.log("");
  if (!files.length) {
    console.log("No PDFs under source/ — wrote an empty archive and an empty report.");
    console.log("  Drop the statements into source/, run `npm run inventory`, then `npm run extract`.");
  } else {
    const by = (s) => docs.filter((d) => d.status === s).length;
    console.log(`Extracted ${docs.length} document(s): ${by("ok")} ok, ${by("partial")} partial, ${by("failed")} failed.`);
    if (report.summary.totalMismatches) console.log(`  ${report.summary.totalMismatches} row-sum vs printed-total mismatch(es).`);
    if (report.summary.crossReportDeltas) console.log(`  ${report.summary.crossReportDeltas} cross-report delta(s).`);
    if (report.summary.suspectedDuplicates) console.log(`  ${report.summary.suspectedDuplicates} suspected duplicate holding(s) across owners — NOT deduped.`);
  }
  console.log(`  public/audit/manifest.json (${manifest.length} document(s))`);
  console.log("  docs/EXTRACTION-REPORT.md");
  console.log("  docs/extraction-report.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
