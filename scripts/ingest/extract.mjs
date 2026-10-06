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
import { NON_STATEMENT_PROVIDERS, bankGuardCounts, classify } from "./lib/classify.mjs";
import { splitBundle, isKnownReportType } from "./lib/bundle.mjs";
import { readSpreadsheet, witnessCheck } from "./lib/sheet.mjs";
import { makeDocument, makeDocKey, assertNormalized, deriveDocument, DOCUMENT_FIELDS } from "./lib/document.mjs";
import { resolveOwner } from "../../shared/owners.mjs";
import { securityKeyOf, stripDepositoryTail } from "../../shared/securityKey.mjs";
import * as pms from "./providers/pmsStatements.mjs";
import * as threeSixtyOne from "./providers/threeSixtyOne.mjs";
import * as sanshiFund from "./providers/sanshiFund.mjs";
import * as investorReport from "./providers/pmsInvestorReport.mjs";
import * as transitionVenture from "./providers/transitionVenture.mjs";
import * as lkp from "./providers/lkpSecurities.mjs";
import * as motilalDemat from "./providers/motilalDemat.mjs";
import * as nsdlDemat from "./providers/nsdlDemat.mjs";
import * as hdfcNsdl from "./providers/hdfcNsdl.mjs";
import * as bankAdvice from "./providers/bankAdvice.mjs";
import * as bankStatement from "./providers/bankStatement.mjs";
import * as aifDistribution from "./providers/aifDistribution.mjs";
import * as altFunds from "./providers/altFundStatements.mjs";
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
  // The family's own CDSL demat accounts at Motilal Oswal — SEVEN of them across
  // twelve documents, and the only source in this drop for their direct equity,
  // their gold and silver ETFs and their arbitrage and hybrid funds. Keyed on
  // the Client ID the page prints: three of the twelve file names name the
  // wrong member.
  [motilalDemat.PROVIDER, motilalDemat],
  // ...and the family's NSDL account at ICICI Bank, which is a different
  // depository, a different layout and NO RATE COLUMN — quantity and value are
  // its primitives where the CDSL statement's are quantity and rate. It is the
  // only source anywhere in `source/` for their unlisted and pre-IPO holdings.
  [nsdlDemat.PROVIDER, nsdlDemat],
  // HDFC Bank's NSDL arm. Its two statements carry no text layer — their glyphs
  // are vector outlines — so their words are recovered by rendering the page
  // (lib/ocr.mjs) and the reader refuses to publish a row that does not
  // reproduce the statement's own printed Total Valuation.
  [hdfcNsdl.PROVIDER, hdfcNsdl],
  // Two ICICI payment receipts. Read in full and attributed to nothing —
  // a receipt names no holder, no security and no folio.
  [bankAdvice.PROVIDER, bankAdvice],
  // The family's own SAVINGS ACCOUNTS — three at HDFC Bank and two at ICICI
  // Bank. Read in full and kept OUT of every book total: a bank balance is cash
  // the family can spend, not a holding anybody manages, and whether it belongs
  // beside the portfolio is a decision about their affairs rather than a
  // parsing rule (see `excludedFromBook` in the reader, and §4c).
  //
  // Both names are here AND the report type below, for the same reason
  // `investorReport` is keyed on its type: one layout per bank, and a bank that
  // sends a statement this reader has never seen reaches it rather than reaching
  // the demat or trade reader, which would read its narrations as securities.
  ...bankStatement.PROVIDER.map((name) => [name, bankStatement]),
  // Four documents in three formats — two PDFs and two spreadsheets — for one
  // self-directed demat account. The only lot register in the drop.
  [lkp.PROVIDER, lkp],
  // 360 ONE's ALTERNATES arm — a different issuer from its wealth arm, and the
  // only source in this drop for AIF income split by tax head.
  [aifDistribution.PROVIDER, aifDistribution],
  // SEVEN single-scheme account statements, six from the August 2026 drop —
  // Buoyant, Helios, Motilal Oswal's Founders and Active Momentum funds, 3P and
  // India SME — and Sky Capital after it. One reader, seven declared layouts,
  // keyed on each FUND rather than the distributor whose stationery it arrives on.
  ...altFunds.PROVIDER.map((name) => [name, altFunds]),
  // ...and Buoyant back to the PMS reader for everything EXCEPT its own account
  // statement, which `BY_PROVIDER_REPORT_TYPE` sends to altFunds. Order matters:
  // `Object.fromEntries` keeps the last entry for a repeated key.
  [pms.PROVIDERS.buoyant.name, pms],
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
  // ...and a second that earns it the other way round: a personal BANK
  // STATEMENT is one document type across two banks, and the classifier's
  // backstop types a third bank's layout as one before any provider rule has
  // named the bank. Keyed on the type, such a document reaches this reader,
  // which refuses it and says which columns it could not find; keyed on the
  // provider it would reach no reader at all.
  [bankStatement.REPORT_TYPE]: bankStatement,
};

/**
 * ONE PROVIDER, TWO DOCUMENT FAMILIES — routed on the report type.
 *
 * Buoyant sends its own Category III ACCOUNT STATEMENT (a single-scheme AIF
 * statement, `reportType: "holdings"`) and ALSO issues from the shared PMS
 * reporting system (appraisal, fact sheet, capital register, transaction
 * statement, performance history) for the same two folios. `EXTRACTORS` is keyed
 * on the provider NAME alone, so one of the two families would always have gone
 * to the wrong reader and come back empty.
 *
 * The name stays single — splitting it would split account 103473 across two
 * providers and break every per-account figure — and the report type picks the
 * reader. Anything not named here falls through to `EXTRACTORS` as before.
 */
const BY_PROVIDER_REPORT_TYPE = {
  // `holdings` is what the classifier calls the account statement when it reads
  // its content; `unknown` is what it calls it when the PMS filename gate claims
  // the file first and no `GOLDSTANDARD_FILE_TYPES` pattern matches
  // `BUOYANT - AJAY.pdf`. Both are that one document family, and both go to the
  // reader written for it — otherwise the statement that carried this account
  // before the PMS set arrived stops being read at all.
  // `portfolio-snap` is the same account statement with a third page — the
  // classifier types it on its file name AND its page-3 headings — and the same
  // reader takes it, with that page's own checks (`buoyantSnapCheck`).
  "Buoyant Capital": { holdings: altFunds, unknown: altFunds, "portfolio-snap": altFunds },
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
const READABLE = /\.(pdf|xls|xlsx|csv)$/i;
/** …and which of those go to the workbook reader rather than to pdfjs. The
 *  format itself is sniffed from the bytes (`lib/sheet.mjs`), never the name. */
const SPREADSHEET = /\.(xls|xlsx|csv)$/i;

/**
 * A macOS RESOURCE FORK IS NOT A DOCUMENT, and it must not become one.
 *
 * Zipping on a Mac writes a `__MACOSX/` shadow tree of 212- and 477-byte
 * AppleDouble stubs, one per real file, each named `._<the real name>` and
 * carrying that name's extension. To `READABLE` they look like PDFs. Handed to
 * pdfjs they fail, and every one became a `failed` document with no provider, no
 * account and no owner — 25 of them from two V.E.C archives alone, which is 25
 * entries of pure noise in a provenance record whose entire job is to say what
 * was read and what was not.
 *
 * They were invisible for as long as `source/_extracted/` happened to be
 * expanded by a tool that dropped them; that directory is GITIGNORED and
 * derived, so which files exist under it depends on who unzipped and with what.
 * A pipeline whose output depends on that is not idempotent.
 *
 * Skipped by PATH, and the claim is checked independently: `scripts/source-coverage.mjs`
 * classes each of these `not-a-document` only after confirming it is under 4 KB
 * and carries no `%PDF` header. Neither test alone is enough — the path says what
 * macOS meant, the bytes say what is actually there.
 */
const RESOURCE_FORK = /(^|\/)__MACOSX(\/|$)|(^|\/)\._[^/]*$/;

function walkAll(dir, hit, seen = new Set()) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (RESOURCE_FORK.test(full)) continue;
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
/**
 * A SCAN IS NOT A DOCUMENT WITH NO READER, AND THE DIFFERENCE IS ACTIONABLE.
 *
 * `no-extractor` tells the next person to go and write a provider reader. For an
 * image-only PDF that is a wrong diagnosis and costs a day: there is no text to
 * write a reader against, no header to match, no coordinate to read a column at.
 * What it needs is OCR, or the issuer re-sending the statement as a text PDF —
 * and the second is nearly always the right ask, because a figure recovered by
 * OCR is a figure this book cannot trace to what the statement printed.
 *
 * The test is CATEGORICAL rather than a threshold on how much text is "enough":
 * a document with pages and not one text row anywhere has no text layer at all.
 * `source/august-2026-e/HOLDING STATEMENT AS ON 31 MARCH 2026.pdf` is four such
 * pages — Bharat Jaisinghani's NSDL statement at HDFC Bank, scanned to JPEG.
 */
/**
 * A DOCUMENT NOBODY ISSUED HAS NO READER *BY DECISION*, AND MUST NOT SAY
 * "no-extractor".
 *
 * `no-extractor` means "go and write a provider reader for this", and for the
 * family's consolidated review and their investment register that is a wrong
 * instruction: both are held out deliberately, because every figure in this book
 * traces to the statement of the institution that struck it and an aggregation
 * or a cash record carries somebody else's decisions about what to include.
 *
 * It is the same class of mistake `noTextLayer` exists to avoid one line up —
 * a confidently wrong diagnosis that sends the next person to do work that must
 * never be done. Both files are still recorded in the archive, with the reason,
 * so the provenance accounts for every file in `source/` either way.
 */
function heldOutByDecision(meta) {
  if (!NON_STATEMENT_PROVIDERS.has(meta?.provider)) return null;
  return {
    code: "held-out-by-decision",
    detail: `${meta.provider} — this file is READ PERFECTLY and is deliberately not a source. No institution `
      + "issued it, so folding it into the book would end the guarantee that every figure traces to the "
      + "statement of the institution that struck it. It is NOT a missing reader and must never be given one. "
      + "The consolidated review is used as an independent cross-check (`npm run reconcile:review`); the "
      + "investment register has its own generated page at `/register` and its own cross-check "
      + "(`npm run reconcile:register`), and reaches no portfolio total.",
  };
}

function noTextLayer(grid) {
  const pages = grid?.pages ?? [];
  /**
   * A WORKBOOK IS NOT A SCAN, and this check said it was.
   *
   * `gridFromSpreadsheet` gives every sheet `rows: []` by design — a workbook has
   * cells, not coordinates, and they ride along in `sheets` instead. So the first
   * draft of this test diagnosed the family's 25-tab consolidated review as
   * "25 pages of SCANNED IMAGE", which is a confidently wrong answer about a
   * document that is perfectly readable and held out BY DECISION. `sheets` is
   * what the grid itself uses to say which kind it is, and it is checked here for
   * the same reason `lib/sheet.mjs` sniffs the format from the bytes rather than
   * the extension.
   */
  if (grid?.sheets) return null;
  if (!pages.length || pages.some((p) => (p.rows ?? []).length)) return null;

  const pp = `${pages.length} page(s)`;
  const closing = "It needs the issuer to re-send the statement as a text PDF — an OCR'd figure cannot be "
    + "traced back to what the document printed, which is the guarantee every other figure here keeps.";

  /**
   * AND A DOCUMENT WITH NO TEXT IS NOT ALWAYS A SCAN.
   *
   * `grid.inkKind` is measured in `lib/layout.mjs` (see `classifyInk`) and only
   * for a document that yielded no text at all. Saying "SCANNED IMAGE" about
   * the two `august-2026-f` statements would be the same class of confidently
   * wrong answer this function's own comment above records about the review
   * workbook — they carry no raster image anywhere, just outlined glyphs — and
   * it sends the next person to ask HDFC for a re-scan of paper that does not
   * exist rather than for a re-export with fonts embedded.
   */
  if (grid?.inkKind?.kind === "vector") {
    return {
      code: "text-outlined-to-paths",
      detail: `the file is ${pp} whose TEXT HAS BEEN CONVERTED TO VECTOR OUTLINES: `
        + `${grid.inkKind.paths} drawn path(s), no raster image and not one text item. `
        + "This is NOT a scan and NOT a missing reader — there is no character anywhere in the file to read, "
        + "so no regex, no column geometry and no provider reader can recover a figure from it. Because the "
        + "glyphs are outlines rather than a photograph, the fix is a RE-EXPORT from the issuing system with "
        + "fonts embedded (their PDF export setting is what did this), not a re-scan. " + closing,
    };
  }
  return {
    code: "no-text-layer",
    detail: `the file is ${pp} of SCANNED IMAGE`
      + (grid?.inkKind?.images ? ` (${grid.inkKind.images} raster image(s))` : "")
      + " and carries no text layer, so no reader can "
      + "be written against it and nothing is extracted. This is not a missing reader: pdfjs returns zero text "
      + "items on every page. " + closing,
  };
}

  // The reader is chosen by REPORT TYPE first, then by provider. The SEBI PMS
  // investor report is one prescribed layout that several managers issue, so it
  // has one reader; everything else is a house format and is keyed on the house.
  const extractor = BY_REPORT_TYPE[meta.reportType]
    ?? BY_PROVIDER_REPORT_TYPE[meta.provider]?.[meta.reportType]
    ?? (meta.provider ? EXTRACTORS[meta.provider] : null);
  if (!extractor) {
    return makeDocument({
      ...base,
      status: "failed",
      // Reason first, provenance second: the report prints the FIRST warning as
      // the cause, and "opened with password #2" is not why a document failed.
      warnings: [noTextLayer(grid) ?? heldOutByDecision(meta) ?? { code: "no-extractor", detail: `no extractor for provider ${JSON.stringify(meta.provider)} / reportType ${meta.reportType}` }, ...openedWarnings],
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

  /**
   * A READER MUST NOT OVERWRITE PROVENANCE, AND THE MERGE BELOW LETS IT.
   *
   * `{ ...base, ...result }` is what gives a reader the last word on the fields
   * it read off the page — accountNo, owner, asOf — and that is the point of it.
   * But `base` also carries the fields only THIS function knows: which file the
   * document came out of, how many pages it has, which pages of a bundle. A
   * reader that returns a whole `makeDocument(...)` rather than the partial
   * every provider here returns spreads that object's own defaults over them,
   * and `sourcePath` comes back `undefined`.
   *
   * That is not hypothetical: `hdfcNsdl.mjs` did it, and the two documents it
   * produced went into the archive naming no file — right figures, no
   * provenance, and nothing failed. `npm run coverage:source` caught it, by
   * reporting both PDFs as UNREAD, which is a good deal later than here.
   *
   * So a reader that sets one of these to a FALSY value does not get to: the
   * base value is kept and the attempt is reported. It is not silently allowed,
   * because a provider that genuinely needs to move one of them has found a
   * design question rather than a field to assign.
   */
  const PROVENANCE = ["docKey", "sourcePath", "pages", "sourcePages", "stitches"];
  const clobbered = PROVENANCE.filter((k) => k in result && !result[k] && base[k]);
  for (const k of clobbered) delete result[k];
  if (clobbered.length) {
    warnings.push({
      code: "reader-cleared-provenance",
      detail: `${extractorName(extractor)} returned an empty ${clobbered.join(", ")} — kept the value extract.mjs derived. `
        + "A provider returns the fields it READ; docKey, sourcePath and the page span belong to the file, not the reader.",
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

  /**
   * What a name says about the COMPANY, with the depository's description of
   * its line removed.
   *
   * A CDSL transaction statement names a holding `INDIAN BANK - EQUITY SHARES`
   * or `AXIS BANK LIMITED # NEW EQUITY SHARES OF RS.2/- AFTER SUBDIVISION`: the
   * company, then the depository's own account of WHICH LINE in its books this
   * is. Word by word, `INDIAN BANK - EQ` is an abbreviation of the first — EQ is
   * a prefix of EQUITY — so `abbreviates` alone renamed the holding to it and
   * keyed it `indian-bank-equity-shares`, splitting Indian Bank from itself.
   * That rename appeared only once Stage 10ba's reader read every movement row;
   * a fuller name has to say more about the company, not more about the line.
   * So the comparison is ALSO made with that description and the furniture
   * `stripDepositoryTail` already removes taken off both sides, and a name that
   * is only fuller in its furniture is not fuller.
   */
  const DESCRIPTION_TAIL = /\s*(?:[#\-–—]\s*)?(?:NEW\s+)?EQUITY\s+SHARES?\b.*$/i;
  const companyPart = (s) => stripDepositoryTail(String(s).replace(DESCRIPTION_TAIL, ""));

  /**
   * ONE COMPANY SPELLED TWO WAYS IS STILL ONE CANDIDATE. Two fuller names
   * against one ISIN were skipped as ambiguous — and the September 2026 ASK
   * statements print Varun Beverages both as `VARUN BEVERAGES LTD` and as
   * `Varun Beverages Limited`, so LKP's clipped `VARUN BEVERAGE` stopped being
   * renamed and its key moved on a document already in the archive. Where every
   * candidate takes the SAME securityKey they name one company, and the choice
   * is only which spelling: a cased one beats an all-capitals one (the rule
   * `securityLabel` applies on screen), then the longest, then the first in
   * alphabetical order — so the pick never depends on which file was read
   * first. Candidates that key differently are different companies and stay
   * ambiguous: nothing is renamed.
   */
  function oneCompany(candidates) {
    if (candidates.length === 1) return candidates[0];
    if (!candidates.length) return null;
    const keys = new Set(candidates.map((c) => securityKeyOf(c)));
    if (keys.size !== 1) return null;
    const cased = (c) => (/[a-z]/.test(c) ? 1 : 0);
    return [...candidates].sort((a, b) => cased(b) - cased(a) || b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))[0];
  }

  let renamed = 0;
  for (const d of docs) {
    for (const h of d.holdings ?? []) {
      if (!h.isin) continue;
      const fuller = [...(byIsin.get(h.isin) ?? [])].filter((n) =>
        n !== h.security
        && abbreviates(h.security, n)
        && abbreviates(companyPart(h.security), companyPart(n)));
      const pick = oneCompany(fuller);
      if (!pick) continue;
      h.printedSecurity ??= h.security;
      h.security = pick;
      h.securityKey = securityKeyOf(pick);
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
/**
 * AN EXTRACTION THAT READS LESS THAN THE ARCHIVE ALREADY HOLDS IS A DATA LOSS,
 * AND IT MUST NOT WRITE.
 *
 * `writeArchive` replaces the archive wholesale. That is right when a run has
 * everything it needs, and catastrophic when it does not: EIGHT of the PDFs in
 * this corpus are encrypted, so a run without `GLOW_PDF_PASSWORDS` reads them as
 * failures and quietly deletes their extracted rows — the folios, the earnings,
 * the dated lots — from a committed archive. Nothing fails and nothing says so;
 * the next `build-book` simply produces a smaller book.
 *
 * That is not hypothetical. It happened during the session that added this
 * guard: a stray invocation with default paths removed 24 files from
 * `public/audit/` before anyone noticed, and only `git checkout` got them back.
 *
 * So the run compares what it READ against what the archive already has. Fewer
 * successfully-read documents is refused; the message names the likely cause
 * because it almost always is one. `GLOW_ALLOW_ARCHIVE_SHRINK=1` overrides it,
 * for the legitimate case of deliberately removing a delivery.
 */
function guardAgainstShrinkingTheArchive(docs) {
  if (process.env.GLOW_ALLOW_ARCHIVE_SHRINK === "1") return;
  let existing;
  try { existing = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, "manifest.json"), "utf8")); }
  catch { return; }                       // no archive yet — nothing to lose
  if (!Array.isArray(existing) || !existing.length) return;
  const readable = (d) => d.status === "ok" || d.status === "partial";
  const before = existing.filter(readable).length;
  const after = docs.filter(readable).length;
  if (after >= before) return;
  const encrypted = docs.filter((d) => (d.warnings ?? []).some((w) => /password|encrypt/i.test(w.code + " " + (w.detail ?? "")))).length;
  console.error("");
  console.error(`REFUSING TO WRITE: this run read ${after} document(s) against ${before} already in ${AUDIT_DIR}.`);
  console.error("Replacing the archive would DELETE the difference, and the extracted rows go with it.");
  if (encrypted) console.error(`  ${encrypted} document(s) reported a password problem — set GLOW_PDF_PASSWORDS and run again.`);
  else console.error("  The usual cause is a missing GLOW_PDF_PASSWORDS: eight PDFs here are encrypted.");
  console.error("  If the shrink is intended, re-run with GLOW_ALLOW_ARCHIVE_SHRINK=1.");
  process.exit(1);
}

/**
 * The archived record of an export read as a WITNESS of the PDF beside it: the
 * identity of the document it witnesses, its own rows as browsable sections,
 * and NO facts — every array empty — so nothing downstream can count a row of
 * it. `twinOf` names the document; the warnings say what was checked.
 */
function witnessDocument(file, grid, primary, pdfRel, pdfText) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const { checked, matched, unmatched } = witnessCheck(grid.sheets, pdfText);
  const warnings = [{
    code: "witness-of",
    detail: `this ${ext.toUpperCase()} is the export of ${pdfRel}, which is read as the document (${primary.docKey}); it adds no facts. `
      + `${matched} of the ${checked} significant figure(s) it carries are printed in that PDF.`,
  }];
  if (!checked) {
    warnings.push({ code: "witness-nothing-checked", detail: "the export carries no figure with a fractional part to check against the PDF, so it witnesses nothing" });
  } else if (unmatched.length) {
    warnings.push({
      code: "witness-mismatch",
      detail: `${unmatched.length} figure(s) in the export are not printed in ${pdfRel}: ${unmatched.slice(0, 12).join(", ")}${unmatched.length > 12 ? ", …" : ""}. `
        + "The PDF is the document; the two renderings disagree here and the export is not believed.",
    });
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sheet";
  const sections = {};
  for (const sh of grid.sheets ?? []) {
    let key = `sheet-${slug(sh.name)}`;
    for (let i = 2; sections[key]; i++) key = `sheet-${slug(sh.name)}-${i}`;
    sections[key] = { name: sh.name, rows: sh.rows };
  }
  const doc = makeDocument({
    docKey: `${primary.docKey}-${ext}`,
    provider: primary.provider,
    accountNo: primary.accountNo,
    owner: primary.owner,
    ownerId: primary.ownerId,
    familyGroup: primary.familyGroup,
    strategy: primary.strategy,
    asOf: primary.asOf,
    reportType: primary.reportType,
    engagement: primary.engagement,
    providerEngagement: primary.providerEngagement,
    sourcePath: rel(file),
    pages: grid.numPages,
    sourcePages: null,
    stitches: [],
    sections,
    warnings,
    status: checked && !unmatched.length ? "ok" : "partial",
  });
  doc.twinOf = primary.docKey;
  return doc;
}

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
      // A file printing the same text as this document's (read once), and the
      // document an export witnesses — provenance, never a second source.
      twinOf: doc.twinOf,
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

  /**
   * AN EXPORT BESIDE ITS PDF IS A WITNESS, NOT A SECOND DOCUMENT.
   *
   * A reporting system that writes `X.pdf` writes `X.xlsx` or `X.csv` beside it
   * — the same report, the same tables. Read as a document of its own the export
   * either fails on a layout its reader was never written for or, worse,
   * succeeds and puts every row in the book twice. So a spreadsheet with a PDF of
   * the same name in the same folder is held back from the readers and archived
   * after them as a WITNESS of that PDF's document: its rows kept for provenance,
   * no facts, and every significant figure it carries checked against the
   * figures the PDF prints (`witnessCheck`).
   */
  const stemOf = (f) => path.join(path.dirname(f), path.basename(f, path.extname(f))).toLowerCase();
  const pdfByStem = new Map();
  for (const f of files) if (/\.pdf$/i.test(f) && !pdfByStem.has(stemOf(f))) pdfByStem.set(stemOf(f), f);
  const witnesses = unique.filter((f) => SPREADSHEET.test(f) && pdfByStem.has(stemOf(f)));
  const toRead = unique.filter((f) => !witnesses.includes(f));

  /**
   * The text each PDF printed, kept for the witnesses below: a spreadsheet export
   * is checked against what its PDF PRINTED, not against what a reader made of it.
   *
   * Two files printing IDENTICAL text in different bytes (a statement saved under
   * two names — the ASK Absolute Return Fund folio arrives as "ATJ - …" and
   * "Aarti J - …", the first holder and the joint holder) are both read, and the
   * second is filed `-2` exactly as the four such pairs already in the archive
   * are. That costs nothing in the book: a snapshot is taken once per account and
   * date, and a dated row printed on two issues is counted once (`datedRowsAcross`).
   */
  const fileText = new Map();

  const docs = [];
  const grids = new Map();
  for (const file of toRead) {
    process.stdout.write(`  reading ${rel(file)} … `);
    const bytes = fs.readFileSync(file);
    const grid = SPREADSHEET.test(file)
      ? gridFromSpreadsheet(bytes)
      : await extractLayout(new Uint8Array(bytes), { passwords });
    const text = (grid.pages ?? []).map((p) => p.text ?? "").join("\n");
    fileText.set(file, text);
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

  // The witnesses, now that the documents they witness carry their final keys.
  const byteDup = new Map(duplicateSources.map((d) => [d.path, d.sameAs]));
  for (const file of witnesses) {
    process.stdout.write(`  reading ${rel(file)} … `);
    const grid = gridFromSpreadsheet(fs.readFileSync(file));
    let pdf = rel(pdfByStem.get(stemOf(file)));
    pdf = byteDup.get(pdf) ?? pdf;
    const primary = docs.find((d) => d.sourcePath === pdf && (d.status === "ok" || d.status === "partial"));
    if (grid.error || !primary) {
      // Nothing to witness: the export is read as a document of its own, and
      // says why — a witness of a PDF nobody could read checks nothing.
      const produced = extractDocuments(file, grid);
      for (const { doc, grid: partGrid } of produced) {
        if (!grid.error) {
          doc.warnings.push({
            code: "witness-sibling-unreadable",
            detail: `${pdf} sits beside this export and would be the document it witnesses, but that PDF produced no readable document; the export is read on its own instead`,
          });
        }
        grids.set(doc, partGrid);
        docs.push(doc);
      }
      console.log(`no readable sibling — read on its own: ${produced.map(({ doc: d }) => d.status).join(", ")}`);
      continue;
    }
    const doc = witnessDocument(file, grid, primary, pdf, fileText.get(path.join(ROOT, pdf)) ?? fileText.get(pdfByStem.get(stemOf(file))) ?? "");
    grids.set(doc, grid);
    docs.push(doc);
    console.log(`witness of ${primary.docKey}: ${doc.status}`);
  }
  ensureUniqueDocKeys(docs);
  // RECONCILE BEFORE WRITING. The duplicate check (c) does more than report — it
  // TAGS each matching row with its `dedupeGroup` and `alsoReportedUnder`, and
  // those tags are what stop a consolidated total counting the same position
  // twice. Writing the archive first froze the untagged rows to disk, so the tag
  // existed only in memory and the book never saw it. That was invisible while
  // no drop contained a duplicate; the moment one did — the 360 ONE AIF holding
  // reported identically under two family members — it was 1.46 Cr counted twice.
  const report = reconcile(docs, { pdfCount: unique.length, symbolMap: loadSymbolMap(), duplicateSources });
  guardAgainstShrinkingTheArchive(docs);
  const manifest = writeArchive(docs, grids);
  writeReports(report, DOCS_DIR);

  console.log("");
  if (!files.length) {
    console.log("No PDFs under source/ — wrote an empty archive and an empty report.");
    console.log("  Drop the statements into source/, run `npm run inventory`, then `npm run extract`.");
  } else {
    const by = (s) => docs.filter((d) => d.status === s).length;
    console.log(`Extracted ${docs.length} document(s): ${by("ok")} ok, ${by("partial")} partial, ${by("failed")} failed.`);
    // PRINTED EVEN AT ZERO, AND ZERO IS THE CORRECT ANSWER. `classify()`
    // resolves a savings statement before either PMS house matcher is reached,
    // so neither matcher's bank guard fires on the live path however many bank
    // statements a drop carries; a non-zero count means that order changed and
    // those guards are now the only thing between a narration naming a manager
    // and a misfile. A guard that only speaks when it fires is
    // indistinguishable, on a clean run, from one that was quietly deleted —
    // the rule `build-book`'s identity guards already follow.
    const guards = bankGuardCounts();
    console.log(
      `  bank-statement guards reached: match360One ${guards.match360One}, ` +
      `matchGoldstandard ${guards.matchGoldstandard} — 0 is correct; ` +
      `a savings statement is resolved before either matcher.`,
    );
    if (report.summary.totalMismatches) console.log(`  ${report.summary.totalMismatches} row-sum vs printed-total mismatch(es).`);
    if (report.summary.crossReportDeltas) console.log(`  ${report.summary.crossReportDeltas} cross-report delta(s).`);
    if (report.summary.suspectedDuplicates) console.log(`  ${report.summary.suspectedDuplicates} suspected duplicate holding(s) across owners — NOT deduped.`);
    if (report.summary.confirmedSeparateByFamily) console.log(`  ${report.summary.confirmedSeparateByFamily} matching holding(s) the family confirmed as separate investments — counted in full.`);
  }
  console.log(`  public/audit/manifest.json (${manifest.length} document(s))`);
  console.log("  docs/EXTRACTION-REPORT.md");
  console.log("  docs/extraction-report.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
