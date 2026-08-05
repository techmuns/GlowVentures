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
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout, passwordsFromEnv } from "./lib/layout.mjs";
import { classify } from "./lib/classify.mjs";
import { splitBundle, isKnownReportType } from "./lib/bundle.mjs";
import { readSpreadsheet } from "./lib/sheet.mjs";
import { makeDocument, makeDocKey, assertNormalized, deriveDocument, DOCUMENT_FIELDS } from "./lib/document.mjs";
import { resolveOwner } from "../../shared/owners.mjs";
import { securityKeyOf } from "../../shared/securityKey.mjs";
import * as pms from "./providers/pmsStatements.mjs";
import * as threeSixtyOne from "./providers/threeSixtyOne.mjs";
import * as sanshiFund from "./providers/sanshiFund.mjs";
import * as investorReport from "./providers/pmsInvestorReport.mjs";
import * as transitionVenture from "./providers/transitionVenture.mjs";
import * as lkp from "./providers/lkpSecurities.mjs";
import * as aifDistribution from "./providers/aifDistribution.mjs";
import * as mutualFundFolio from "./providers/mutualFundFolio.mjs";
import * as schemePortfolio from "./providers/schemePortfolio.mjs";
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
  // Each of these publishes ONE document containing everything, in a layout
  // that shares nothing with the others — an AIF account statement and a
  // drawdown capital account.
  [sanshiFund.PROVIDER, sanshiFund],
  [transitionVenture.PROVIDER, transitionVenture],
  // Four documents in three formats — two PDFs and two spreadsheets — for one
  // self-directed demat account. The only lot register in the drop.
  [lkp.PROVIDER, lkp],
  // 360 ONE's ALTERNATES arm — a different issuer from its wealth arm, and the
  // only source in this drop for AIF income split by tax head.
  [aifDistribution.PROVIDER, aifDistribution],
  // Read in full and kept OUT of the family book: the holder is a trust with
  // its own PAN. One entry in shared/owners.mjs would change that, and it is a
  // decision about the family rather than a parsing rule.
  ...["Aditya Birla Sun Life Mutual Fund", "Kotak Mahindra Mutual Fund",
    "Mirae Asset Mutual Fund", "HDFC Mutual Fund", mutualFundFolio.PROVIDER]
    .map((n) => [n, mutualFundFolio]),
  // A fund's own disclosure. Archived for look-through; contributes nothing,
  // because it reports no position of ours.
  [schemePortfolio.PROVIDER, schemePortfolio],
]);

/**
 * Readers chosen by REPORT TYPE rather than by house, and checked first.
 *
 * There is exactly one entry and it earns the mechanism: the PMS INVESTOR REPORT
 * is prescribed by SEBI, so SVAN's monthly and Green Lantern's quarterly are the
 * same document with different letterheads — same sections in the same order,
 * same seven-column holding report, same value bridge. Keying it on the manager
 * would mean two copies of one reader, and the second one (Green Lantern's,
 * fifteen pages of a ₹11.69 Cr account) would never have been written, because
 * the file was classified a contract note and reported as having no reader.
 */
const BY_REPORT_TYPE = {
  [investorReport.REPORT_TYPE]: investorReport,
};

/** Which reader produced a document, for a warning that has to be actionable. */
const extractorName = (m) => m?.PROVIDER ?? m?.REPORT_TYPE ?? "the extractor";

/**
 * Every file the pipeline can OPEN. PDFs, plus the spreadsheet formats the
 * readers in `providers/` handle.
 *
 * Anything else is walked too — see `walkAll` — because a file this stage cannot
 * read must still appear in the coverage report. Filtering it out before it is
 * counted is how four files sat in the drop unseen while the console reported
 * "105 PDFs" and nobody could tell the difference between "all of it" and "all
 * of what we recognised".
 */
const READABLE = /\.(pdf|xls|xlsx)$/i;
/** …and which of those go to the workbook reader rather than to pdfjs. */
const SPREADSHEET = /\.(xls|xlsx)$/i;

function walkAll(dir, hit, seen = new Set()) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      const real = fs.realpathSync(full);
      if (seen.has(real)) continue;
      seen.add(real);
      walkAll(full, hit, seen);
    } else if (e.isFile()) hit(full);
  }
}

function walk(dir, hit, seen = new Set()) {
  walkAll(dir, (f) => { if (READABLE.test(f)) hit(f); }, seen);
}

/** Reading-order text per page, for provenance. */
const pagesJson = (grid) => ({
  name: "pages",
  pages: grid.pages.map((p) => ({ page: p.page, text: p.text })),
});

/**
 * Split a bundle into its reports, or keep a single-report file whole.
 *
 * A part's `reportType` OVERRIDES what the classifier reads off the flat text,
 * because the classifier sees one blob of pages and the splitter saw which page
 * carried which title. Everything else — provider, account, owner, as-of — is
 * still read from that part's own pages, since every page of these statements
 * reprints the header.
 */
function extractDocuments(file, grid) {
  const parts = splitBundle(grid);
  if (!parts) return [{ doc: extractOne(file, grid), grid }];
  return parts.map((p) => ({
    doc: extractOne(file, p.grid, {
      reportType: isKnownReportType(p.reportType) ? p.reportType : null,
      fromPage: p.fromPage,
      toPage: p.toPage,
      ofPages: grid.numPages,
      partCount: parts.length,
    }),
    // The pages this document was read from — archived as its own provenance.
    grid: p.grid,
  }));
}

/**
 * A spreadsheet, read into the SAME page shape a PDF produces.
 *
 * `extractLayout` returns `{ pages: [{ page, text, rows, stitches }], numPages }`
 * and every classifier and reader downstream is written against it. A workbook
 * has no pages and no coordinates, but it does have sheets and rows — so each
 * sheet becomes one "page" whose `text` is its rows tab-joined, and the grid
 * rides along in `sheets` for a reader that wants the cells rather than the text.
 *
 * Without this, a `.xls` handed to pdfjs comes back "Invalid PDF structure" and
 * the file is reported as a corrupt PDF. It is not corrupt; it is a perfectly
 * good HTML table, and diagnosing it as the wrong thing is worse than not
 * reading it — somebody goes looking for a broken download that does not exist.
 */
function gridFromSpreadsheet(buf) {
  const wb = readSpreadsheet(buf);
  return {
    pages: wb.sheets.map((s, i) => ({
      page: i + 1,
      text: s.rows.map((r) => r.join("\t")).join("\n"),
      rows: [],
      stitches: [],
    })),
    sheets: wb.sheets,
    numPages: wb.sheets.length,
    format: wb.format,
    error: wb.sheets.length ? null : (wb.error ?? "the workbook contained no sheets"),
    pdfError: null,
    encrypted: false,
    usedPassword: null,
  };
}

/** Turn one already-laid-out PDF — or one report inside a bundle — into a document. */
function extractOne(file, grid, part = null) {
  const fileName = path.basename(file);

  // Classify from the flat reading-order text — enough for the header fields.
  const flat = grid.pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
  const classified = classify({ fileName, text: flat });
  const meta = part?.reportType
    ? { ...classified, reportType: part.reportType, sections: [part.reportType] }
    : classified;

  const owner = resolveOwner(meta.ownerName);   // no PAN yet — the extractor reads it
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
    // WHICH PAGES OF THE FILE THIS DOCUMENT IS. A reader checking a figure opens
    // the PDF at a page number, and for a bundle the document's own page 1 is
    // not the file's. Null for a file that is one report end to end.
    sourcePages: part ? { from: part.fromPage, to: part.toPage, of: part.ofPages } : null,
    stitches: grid.pages.flatMap((p) => p.stitches.map((s) => ({ ...s, page: p.page }))),
  };

  if (grid.error) {
    return makeDocument({ ...base, status: "failed", warnings: [{ code: "pdf-read-failed", detail: grid.error }] });
  }
  // Report THAT a document was encrypted and which supplied password opened it —
  // by position, never the secret. A reader checking this archive against the
  // PDFs needs to know which files they will be prompted for.
  const openedWarnings = grid.encrypted
    ? [{ code: "pdf-encrypted", detail: `opened with GLOW_PDF_PASSWORDS entry #${grid.usedPassword}` }]
    : [];
  // Where a document came out of a bundle, say so on the document itself. The
  // file name will name only one of the reports inside it, and a reader who
  // sees `…-capital-gain` sourced from a file called ContractNote needs to know
  // the split happened rather than suspect the archive.
  if (part) {
    openedWarnings.push({
      code: "from-bundle",
      detail: `pages ${part.fromPage}–${part.toPage} of ${part.ofPages} in ${path.basename(file)}, which carries ${part.partCount} reports`,
    });
  }
  // The reader is chosen by REPORT TYPE first, then by provider. The SEBI PMS
  // investor report is one prescribed layout that several managers issue, so it
  // has one reader; everything else is a house format and is keyed on the house.
  const extractor = BY_REPORT_TYPE[meta.reportType] ?? (meta.provider ? EXTRACTORS[meta.provider] : null);
  if (!extractor) {
    return makeDocument({
      ...base,
      status: "failed",
      // Reason first, provenance second: the report prints the FIRST warning as
      // the cause, and "opened with password #2" is not why a document failed.
      warnings: [{ code: "no-extractor", detail: `no extractor for provider ${JSON.stringify(meta.provider)} / reportType ${meta.reportType}` }, ...openedWarnings],
    });
  }

  let result;
  try {
    result = extractor.extract({ grid, meta: { ...meta, docKey, fileName } });
  } catch (e) {
    return makeDocument({ ...base, status: "failed", warnings: [{ code: "extractor-threw", detail: e?.message ?? String(e) }, ...openedWarnings] });
  }

  const warnings = [...(result.warnings ?? []), ...openedWarnings];

  // A FIELD THE READER PRODUCED AND THE CONTRACT DOES NOT CARRY IS LOST WITHOUT
  // ERRORING. That is not hypothetical: the Sanshi Fund PAN — the only evidence
  // that settles two owners this drop cannot otherwise resolve — and Transition
  // Venture's ₹1.5 Cr undrawn commitment were both read correctly on every run
  // and dropped by `makeDocument` on every run. Nothing failed and nothing said
  // so. Adding a field to a reader and forgetting it here now warns.
  const dropped = Object.keys(result).filter((k) => !DOCUMENT_FIELDS.includes(k));
  if (dropped.length) {
    warnings.push({
      code: "field-not-in-document-contract",
      detail: `${extractorName(extractor)} returned ${dropped.join(", ")}, which makeDocument does not carry — the value is discarded. Add it to lib/document.mjs.`,
    });
  }

  // Resolve the owner from the name the document ENDS UP with, not the one the
  // classifier guessed from flat text. The extractor reads the header off the
  // coordinate grid and often finds a name where the flat-text classifier found
  // none — resolving before the merge left those documents with a correct owner
  // and a null ownerId, which reads downstream as "unidentified person".
  const finalOwnerName = result.owner ?? meta.ownerName ?? null;
  // The PAN the extractor read off the page, where there is one. It outranks
  // every name rule: see resolveOwner.
  const finalOwner = resolveOwner(finalOwnerName, result.pan ?? null);
  if (!finalOwner.owner && (finalOwnerName || result.pan)) {
    warnings.push({
      code: "owner-unresolved",
      detail: result.pan
        ? `"${finalOwnerName ?? "(no name printed)"}" / PAN ${result.pan} matches no canonical owner — add the PAN to shared/owners.mjs, which is evidence rather than a spelling`
        : `"${finalOwnerName}" matches no canonical owner — add an alias in shared/owners.mjs`,
    });
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
  for (const k of ["holdings", "returns", "cashFlows", "transactions", "capitalGains", "income", "expenses"]) {
    doc[k] = (doc[k] ?? []).map(move);
  }
  doc.flows = move(doc.flows);
  doc.totals = move(doc.totals);
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
 * Fill a missing account number where the PROVIDER has exactly one account.
 *
 * The broker's Global Details ledger prints its own title, the exchange and
 * fifteen trades, and no client identifier anywhere — so it keys `…-unknown-…`
 * and files away from the three other documents for the same account.
 *
 * The join is not a guess about which account a document belongs to; it is the
 * observation that there is only ONE it could belong to. It applies only when
 * every other document for that provider in this drop resolves to a single
 * account number, and every backfilled document records `accountNoSource:
 * "sole-account"` and warns. A drop that later brings a second account for the
 * same provider stops satisfying the condition and the join stops happening,
 * which is the behaviour you want from a rule this permissive.
 */
function backfillSoleAccount(docs) {
  const byProvider = new Map();
  for (const d of docs) {
    if (!d.provider || !d.accountNo) continue;
    const set = byProvider.get(d.provider) ?? new Set();
    set.add(d.accountNo);
    byProvider.set(d.provider, set);
  }
  for (const d of docs) {
    if (d.accountNo || !d.provider) continue;
    const candidates = byProvider.get(d.provider);
    if (!candidates || candidates.size !== 1) continue;
    d.accountNo = [...candidates][0];
    d.accountNoSource = "sole-account";
    d.warnings.push({
      code: "account-no-from-sole-account",
      detail: `this report prints no client identifier; ${d.provider} has exactly one account in this drop (${d.accountNo}), so there is no other account it could belong to.`,
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
 * Give a CLIPPED security name the full one another document in this drop prints
 * for the same ISIN.
 *
 * The depository holding statement clips every name to its column width —
 * `BELRISE INDUSTRIE-EQ`, `CROMPTON GRE CONS-EQ`, `MRS. BECTORS-EQ2/-` — and
 * that is what the security key is derived from. So the one account in this book
 * whose statements DO print an ISIN was the one account whose holdings joined to
 * nothing: not to its own broker's P&L (`BELRISE INDUSTRIES LIMITED`), not to the
 * NSE symbol table, which `build-symbols` resolves by name for exactly the reason
 * that no other statement here carries an identifier.
 *
 * The ISIN is that identifier, it is unambiguous, and both documents print it.
 * So the fuller name replaces the clipped one, the ORIGINAL stays in
 * `printedSecurity`, and the document records `securityNameSource: "isin"`.
 *
 * Three constraints keep this from being a rename that hides a defect:
 *   • it joins on ISIN and nothing else — never on a name resembling a name;
 *   • it applies only where one ISIN maps to exactly ONE fuller name in the drop;
 *   • the replacement must CONTAIN the clipped stem, so `BELRISE INDUSTRIE` may
 *     become `BELRISE INDUSTRIES LIMITED` and can never become a different
 *     company that happens to share an ISIN typo.
 */
function backfillSecurityNames(docs) {
  const byIsin = new Map();
  const record = (r) => {
    if (!r?.isin || !r.security) return;
    const set = byIsin.get(r.isin) ?? new Set();
    set.add(r.security);
    byIsin.set(r.isin, set);
  };
  for (const d of docs) {
    for (const k of ["holdings", "capitalGains", "transactions", "income", "openLots"]) {
      for (const r of d[k] ?? []) record(r);
    }
  }

  /**
   * Is `short` the depository's abbreviation of `long`?
   *
   * The clip is per WORD, not a truncation of the whole string —
   * `CROMPTON GRE CONS` for `Crompton Greaves Consumer Elec`, `NIP ETNF1D` for
   * `Nippon India ETF Nifty 1D`. A plain `startsWith` on the joined letters
   * therefore fails on exactly the names that need this most.
   *
   * So every word of the short form must be a PREFIX of the word in the same
   * position of the long form, and the long form must say more (more words, or
   * more letters). Word-by-word from the first letter is what makes it safe: two
   * different companies sharing an ISIN typo cannot satisfy it, and neither can
   * a name that merely looks similar.
   */
  const words = (s) => String(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  function abbreviates(short, long) {
    const a = words(short);
    const b = words(long);
    if (!a.length || b.length < a.length) return false;
    if (a.every((w, i) => w === b[i]) && a.length === b.length) return false;   // identical, not fuller
    return a.every((w, i) => b[i].startsWith(w));
  }

  let renamed = 0;
  for (const d of docs) {
    for (const h of d.holdings ?? []) {
      if (!h.isin) continue;
      const fuller = [...(byIsin.get(h.isin) ?? [])].filter((n) => n !== h.security && abbreviates(h.security, n));
      if (fuller.length !== 1) continue;
      h.printedSecurity ??= h.security;
      h.security = fuller[0];
      h.securityKey = securityKeyOf(fuller[0]);
      renamed++;
      d.securityNameSource = "isin";
    }
    if (d.securityNameSource === "isin") {
      d.warnings.push({
        code: "security-name-from-isin",
        detail: "this report clips security names to the column width; the fuller name printed against the same ISIN elsewhere in this drop is used for the key, and what this document printed is kept in `printedSecurity`.",
      });
    }
  }
  return renamed;
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
    // Keyed by the DOCUMENT, not by the file: several documents can come out of
    // one bundle, and each must archive the pages it was actually read from.
    // Keying by path gave every part of a bundle the whole file's page text, so
    // the capital-gain document's provenance showed eight pages of a holding
    // report it had nothing to do with.
    const grid = grids.get(doc);
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

  // The SAME FILE, delivered twice. A drop assembled by hand routinely carries
  // `X (1).pdf` beside `X.pdf` — this one carries two VEC bank books and two
  // VEC capital registers that are byte-identical. Extracting both produces two
  // documents whose only difference is a `-2` on the docKey, and every cash flow
  // in them is then counted twice in the book. Identical bytes are ONE document:
  // the first path wins and the rest are recorded as copies of it, so the drop's
  // redundancy is visible in the report instead of silently doubling a total.
  const duplicateSources = [];
  const byHash = new Map();
  const unique = [];
  for (const f of files) {
    const h = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    const first = byHash.get(h);
    if (first) { duplicateSources.push({ path: rel(f), sameAs: rel(first), sha256: h }); continue; }
    byHash.set(h, f);
    unique.push(f);
  }
  if (duplicateSources.length) {
    console.log(`  ${duplicateSources.length} byte-identical duplicate file(s) in source/ — extracted once each.`);
    for (const d of duplicateSources) console.log(`     ${d.path}  ==  ${d.sameAs}`);
  }

  // Never committed — see passwordsFromEnv(). Six statements in this drop are
  // encrypted with an identifier that belongs to the family.
  const passwords = passwordsFromEnv();

  const docs = [];
  const grids = new Map();
  for (const file of unique) {
    process.stdout.write(`  reading ${rel(file)} … `);
    const bytes = fs.readFileSync(file);
    const grid = SPREADSHEET.test(file)
      ? gridFromSpreadsheet(bytes)
      : await extractLayout(new Uint8Array(bytes), { passwords });
    const produced = extractDocuments(file, grid);
    for (const { doc, grid: partGrid } of produced) {
      grids.set(doc, partGrid);
      docs.push(doc);
    }
    const summary = produced
      .map(({ doc: d }) => `${d.reportType}: ${d.status}${d.warnings.length ? ` (${d.warnings.length}w)` : ""}`)
      .join(", ");
    console.log(produced.length > 1 ? `${produced.length} reports — ${summary}` : summary);
  }

  backfillAccountNumbers(docs);
  backfillSoleAccount(docs);
  backfillOwners(docs);
  const renamed = backfillSecurityNames(docs);
  if (renamed) console.log(`  ${renamed} clipped security name(s) resolved to their fuller form via ISIN.`);
  ensureUniqueDocKeys(docs);
  // RECONCILE BEFORE WRITING. The duplicate check (c) does more than report — it
  // TAGS each matching row with its `dedupeGroup` and `alsoReportedUnder`, and
  // those tags are what stop a consolidated total counting the same position
  // twice. Writing the archive first froze the untagged rows to disk, so the tag
  // existed only in memory and the book never saw it. That was invisible while
  // no drop contained a duplicate; the moment one did — the 360 ONE AIF holding
  // reported identically under two family members — it was 1.46 Cr counted twice.
  const report = reconcile(docs, { pdfCount: unique.length, symbolMap: loadSymbolMap(), duplicateSources });
  const manifest = writeArchive(docs, grids);
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
