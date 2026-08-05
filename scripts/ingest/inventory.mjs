#!/usr/bin/env node
// Statement inventory — the first pass of the ingest pipeline.
//
//   npm run inventory
//
// Expands every ZIP under source/, walks every PDF (loose or extracted), and
// records what each one appears to be: provider, owner, account, as-of date and
// report type. Writes docs/ingest-inventory.json (machine) and
// docs/INGEST-INVENTORY.md (human), grouped provider → account → as-of → report
// type.
//
// WHY THE GROUPING IS THE POINT. One account at one date routinely produces
// SEVERAL reports that overlap and sometimes disagree — a current portfolio, an
// appraisal, a fact sheet and a performance summary can all describe the same
// holdings on the same day and not reconcile. Grouping to that granularity puts
// those side by side, so which file is authoritative is a decision someone makes
// deliberately rather than an accident of which one got parsed first.
//
// This pass does NOT read holdings tables. See scripts/ingest/lib/pdf.mjs: the
// extracted text is column-scrambled, so table parsing here would produce
// confident, wrong numbers. Header fields only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractZip } from "./lib/unzip.mjs";
import { readPdf } from "./lib/pdf.mjs";
import { extractLayout, passwordsFromEnv } from "./lib/layout.mjs";
import { classify, REPORT_TYPES } from "./lib/classify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_DIR = path.join(ROOT, "source");
const EXTRACT_DIR = path.join(SOURCE_DIR, "_extracted");
const DOCS_DIR = path.join(ROOT, "docs");
const JSON_OUT = path.join(DOCS_DIR, "ingest-inventory.json");
const MD_OUT = path.join(DOCS_DIR, "INGEST-INVENTORY.md");

const UNKNOWN = "(unidentified)";
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir, hit, seen = new Set()) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;                    // don't follow links out of source/
    if (e.isDirectory()) {
      const real = fs.realpathSync(full);
      if (seen.has(real)) continue;
      seen.add(real);
      walk(full, hit, seen);
    } else if (e.isFile()) {
      hit(full);
    }
  }
}

const humanSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// ── 1. Expand archives ───────────────────────────────────────────────────────
// Nested ZIPs are expanded too: statement bundles are routinely a ZIP of ZIPs,
// one per account or per month. Bounded so a self-referential archive can't loop
// forever.
const MAX_ZIP_DEPTH = 6;

function expandArchives() {
  const report = { archives: [], failures: [] };
  const done = new Set();

  for (let depth = 0; depth < MAX_ZIP_DEPTH; depth++) {
    const zips = [];
    walk(SOURCE_DIR, (f) => { if (/\.zip$/i.test(f) && !done.has(f)) zips.push(f); });
    if (!zips.length) break;

    for (const zip of zips) {
      done.add(zip);
      // Extract to source/_extracted/<zipname>/, keeping nested archives under
      // their own parent so two same-named ZIPs can't overwrite each other.
      const inExtracted = zip.startsWith(EXTRACT_DIR + path.sep);
      const base = path.basename(zip, path.extname(zip));
      const dest = inExtracted
        ? path.join(path.dirname(zip), base)
        : path.join(EXTRACT_DIR, base);
      try {
        fs.mkdirSync(dest, { recursive: true });
        const r = extractZip(zip, dest);
        report.archives.push({
          archive: rel(zip), extractedTo: rel(dest),
          files: r.written.length, skipped: r.skipped.length, failed: r.failed.length,
        });
        for (const f of r.failed) report.failures.push({ archive: rel(zip), entry: f.name, reason: f.reason });
      } catch (e) {
        report.failures.push({ archive: rel(zip), entry: "(archive)", reason: e.message });
      }
    }
  }
  return report;
}

// ── 2. Inspect every file ────────────────────────────────────────────────────
//
// EVERY file, not every PDF. The drop is not all PDFs — it carries a manager's
// portfolio disclosure as .xlsx and a broker's P&L and transaction tape as .xls
// — and this pass used to filter `.pdf` before it counted anything. The console
// then said "Inventoried 105 PDF(s)", which was true and told nobody that four
// files had not been looked at. A file the pipeline cannot read must still be
// SEEN, or "the drop is fully ingested" is a claim about the files we happened
// to recognise.
const READABLE_EXT = /\.pdf$/i;

/** What a non-PDF file is, for the row that reports it. */
function describeOther(file) {
  const ext = (path.extname(file) || "").toLowerCase();
  switch (ext) {
    case ".xlsx": return { kind: "spreadsheet (Office Open XML)", reason: "no spreadsheet reader — see docs/EXTRACTION-REPORT.md" };
    case ".xls":  return { kind: "spreadsheet (legacy .xls, often HTML-table)", reason: "no spreadsheet reader — see docs/EXTRACTION-REPORT.md" };
    case ".csv":  return { kind: "delimited text", reason: "no CSV reader" };
    case ".docx": return { kind: "Word document", reason: "no Word reader" };
    case ".zip":  return { kind: "archive", reason: "expanded above; its contents are inventoried individually" };
    default:      return { kind: ext ? `${ext.slice(1)} file` : "file with no extension", reason: "unrecognised file type" };
  }
}

async function inspectPdfs() {
  const pdfs = [];
  walk(SOURCE_DIR, (f) => { if (READABLE_EXT.test(f)) pdfs.push(f); });
  pdfs.sort((a, b) => rel(a).localeCompare(rel(b)));

  const passwords = passwordsFromEnv();
  const out = [];
  for (const full of pdfs) {
    const stat = fs.statSync(full);
    const fileName = path.basename(full);
    let pages = null, text = "", error = null, encrypted = false;
    try {
      ({ pages, text, encrypted, error } = readPdf(fs.readFileSync(full)));
    } catch (e) {
      error = e.message;
    }
    // An encrypted file yields nothing to the flat reader, and a classifier fed
    // nothing files it under "(unidentified)" with the same confidence as a file
    // that genuinely says nothing. Route it through pdfjs, which can decrypt, so
    // the row states either what the document is or that no password opened it.
    if (encrypted) {
      const grid = await extractLayout(new Uint8Array(fs.readFileSync(full)), { passwords });
      if (!grid.error) {
        pages = grid.numPages;
        text = grid.pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
        error = null;
      } else {
        error = passwords.length
          ? "encrypted — no supplied password opened it"
          : "encrypted — set GLOW_PDF_PASSWORDS to read it";
      }
    }
    const guess = classify({ fileName, text });
    out.push({
      path: rel(full),
      fileName,
      bytes: stat.size,
      size: humanSize(stat.size),
      pages,
      fromArchive: full.startsWith(EXTRACT_DIR + path.sep),
      encrypted,
      readError: error,
      ...guess,
    });
  }
  return out;
}

/**
 * Every file in the drop that is NOT a PDF and not a ZIP we expanded.
 *
 * These get a row of their own so the inventory's totals cover the whole folder.
 * They carry `readError` so they land in the "could not classify" section rather
 * than in a provider group — the point is that they are visible and named, not
 * that they are pretended to be understood.
 */
function inspectOthers() {
  const others = [];
  walk(SOURCE_DIR, (f) => {
    if (READABLE_EXT.test(f)) return;
    if (/\.zip$/i.test(f)) return;                       // expanded in step 1
    if (path.basename(f).toLowerCase() === "readme.md") return;
    others.push(f);
  });
  others.sort((a, b) => rel(a).localeCompare(rel(b)));
  return others.map((full) => {
    const stat = fs.statSync(full);
    const { kind, reason } = describeOther(full);
    return {
      path: rel(full),
      fileName: path.basename(full),
      bytes: stat.size,
      size: humanSize(stat.size),
      pages: null,
      fromArchive: full.startsWith(EXTRACT_DIR + path.sep),
      encrypted: false,
      isPdf: false,
      fileKind: kind,
      readError: reason,
      provider: null, ownerName: null, accountNo: null, asOfDate: null,
      reportType: "unknown", sections: [], familyGroup: null, strategy: null,
      confidence: "low", matchedBy: "not a PDF",
    };
  });
}

// ── 3. Group provider → account → as-of → reportType ─────────────────────────
function group(files) {
  const tree = {};
  for (const f of files) {
    const provider = f.provider || UNKNOWN;
    // Prefer the account number; fall back to the owner so files that named a
    // person but not an account still land under something meaningful.
    const account = f.accountNo || (f.ownerName ? `${f.ownerName} (no account no.)` : UNKNOWN);
    const asOf = f.asOfDate || UNKNOWN;
    const type = f.reportType || "unknown";

    const p = (tree[provider] ??= { accounts: {}, fileCount: 0 });
    const a = (p.accounts[account] ??= { owner: f.ownerName || null, strategy: f.strategy || null, asOfDates: {}, fileCount: 0 });
    if (!a.owner && f.ownerName) a.owner = f.ownerName;
    if (!a.strategy && f.strategy) a.strategy = f.strategy;
    const d = (a.asOfDates[asOf] ??= { reportTypes: {}, fileCount: 0 });
    const t = (d.reportTypes[type] ??= []);
    t.push({ path: f.path, pages: f.pages, size: f.size, confidence: f.confidence, sections: f.sections });
    p.fileCount++; a.fileCount++; d.fileCount++;
  }
  return tree;
}

/**
 * Files the inventory will not vouch for: nothing matched, or too little of the
 * row was established to file it confidently. Kept in their own section so a
 * gap is visible instead of being absorbed into an "(unidentified)" bucket that
 * reads like a real group.
 */
const isUnclassified = (f) =>
  !!f.readError || f.confidence === "low" || (!f.provider && f.reportType === "unknown");

/**
 * Overlaps worth a human's attention: one account, one date, more than one
 * report. These are where two files can disagree about the same holdings.
 */
function overlaps(tree) {
  const out = [];
  for (const [provider, p] of Object.entries(tree)) {
    for (const [account, a] of Object.entries(p.accounts)) {
      for (const [asOf, d] of Object.entries(a.asOfDates)) {
        const types = Object.keys(d.reportTypes);
        if (d.fileCount > 1) {
          out.push({
            provider, account, asOf, fileCount: d.fileCount, reportTypes: types,
            duplicateTypes: types.filter((t) => d.reportTypes[t].length > 1),
          });
        }
      }
    }
  }
  return out.sort((x, y) => y.fileCount - x.fileCount);
}

// ── 4. Render the human report ───────────────────────────────────────────────
const esc = (s) => String(s ?? "—").replace(/\|/g, "\\|");

function renderMarkdown({ generatedAt, files, nonPdfFiles, tree, archives, unclassified, overlapping }) {
  const L = [];
  L.push("# Ingest inventory");
  L.push("");
  L.push("What is sitting in `source/`, as the classifier reads it. Generated by `npm run inventory` —");
  L.push("**do not edit by hand**; re-run the script instead.");
  L.push("");
  L.push(`_Generated ${generatedAt}._`);
  L.push("");

  if (!files.length) {
    L.push("## Nothing to inventory yet");
    L.push("");
    L.push("No PDFs found under `source/`. Drop the statement ZIPs and PDFs there and re-run");
    L.push("`npm run inventory`. This is the expected state before the first data drop, not an error.");
    L.push("");
    return L.join("\n");
  }

  const classified = files.filter((f) => !isUnclassified(f));
  const dated = files.filter((f) => f.asOfDate).map((f) => f.asOfDate).sort();

  L.push("## Summary");
  L.push("");
  L.push("| | |");
  L.push("| --- | --- |");
  L.push(`| Files found | ${files.length} |`);
  L.push(`| — of which PDFs | ${files.length - (nonPdfFiles?.length ?? 0)} |`);
  L.push(`| — of which this pipeline cannot open | ${nonPdfFiles?.length ?? 0} |`);
  L.push(`| Classified | ${classified.length} |`);
  L.push(`| Could not classify | ${unclassified.length} |`);
  L.push(`| From archives | ${files.filter((f) => f.fromArchive).length} |`);
  L.push(`| Providers identified | ${Object.keys(tree).filter((k) => k !== UNKNOWN).length} |`);
  L.push(`| Total pages | ${files.reduce((s, f) => s + (f.pages ?? 0), 0)} |`);
  L.push(`| As-of range | ${dated.length ? `${dated[0]} → ${dated[dated.length - 1]}` : "—"} |`);
  L.push(`| Archives expanded | ${archives.length} |`);
  L.push("");

  if (overlapping.length) {
    L.push("## Overlapping reports — same account, same date");
    L.push("");
    L.push("More than one report describes this account on this date. They can disagree; pick the");
    L.push("authoritative one deliberately before extracting figures from any of them.");
    L.push("");
    L.push("| Provider | Account | As of | Files | Report types |");
    L.push("| --- | --- | --- | ---: | --- |");
    for (const o of overlapping) {
      // Bold a type that appears more than once for the same account and date —
      // two files claiming to be the same report is the sharpest disagreement risk.
      const types = o.reportTypes.map((t) => (o.duplicateTypes.includes(t) ? `**${t}**` : t)).join(", ");
      L.push(`| ${esc(o.provider)} | ${esc(o.account)} | ${esc(o.asOf)} | ${o.fileCount} | ${types} |`);
    }
    L.push("");
  }

  L.push("## By provider → account → as-of date → report type");
  L.push("");
  for (const [provider, p] of Object.entries(tree).sort((a, b) => b[1].fileCount - a[1].fileCount)) {
    L.push(`### ${provider}`);
    L.push("");
    L.push(`${p.fileCount} file${p.fileCount === 1 ? "" : "s"} across ${Object.keys(p.accounts).length} account(s).`);
    L.push("");
    for (const [account, a] of Object.entries(p.accounts).sort((x, y) => y[1].fileCount - x[1].fileCount)) {
      const bits = [`**Account ${account}**`];
      if (a.owner) bits.push(`owner: ${a.owner}`);
      if (a.strategy) bits.push(`strategy: ${a.strategy}`);
      L.push(`#### ${bits.join(" · ")}`);
      L.push("");
      L.push("| As of | Report type | Pages | Size | Confidence | File |");
      L.push("| --- | --- | ---: | ---: | --- | --- |");
      const dates = Object.entries(a.asOfDates).sort((x, y) => String(y[0]).localeCompare(String(x[0])));
      for (const [asOf, d] of dates) {
        for (const type of REPORT_TYPES) {
          for (const f of d.reportTypes[type] ?? []) {
            const sections = f.sections && f.sections.length > 1 ? ` <br/>_sections: ${f.sections.join(", ")}_` : "";
            L.push(`| ${esc(asOf)} | ${esc(type)}${sections} | ${f.pages ?? "—"} | ${f.size} | ${f.confidence} | \`${esc(f.path)}\` |`);
          }
        }
        // Any type not in the canonical list (shouldn't happen, but never drop a row).
        for (const [type, rows] of Object.entries(d.reportTypes)) {
          if (REPORT_TYPES.includes(type)) continue;
          for (const f of rows) L.push(`| ${esc(asOf)} | ${esc(type)} | ${f.pages ?? "—"} | ${f.size} | ${f.confidence} | \`${esc(f.path)}\` |`);
        }
      }
      L.push("");
    }
  }

  if (nonPdfFiles && nonPdfFiles.length) {
    L.push(`## Files this pipeline cannot open (${nonPdfFiles.length})`);
    L.push("");
    L.push("Listed so the drop's coverage is countable. These are NOT \"could not classify\" —");
    L.push("that section is for files we opened and could not place. These were never opened,");
    L.push("which is a different fact and a different fix.");
    L.push("");
    L.push("| File | Type | Size | Why |");
    L.push("| --- | --- | ---: | --- |");
    for (const f of nonPdfFiles) {
      L.push(`| \`${esc(f.path)}\` | ${esc(f.fileKind)} | ${f.size} | ${esc(f.readError)} |`);
    }
    L.push("");
  }

  L.push("## Could not classify");
  L.push("");
  if (!unclassified.length) {
    L.push("None — every PDF was placed with at least medium confidence.");
    L.push("");
  } else {
    L.push("These need a human read, or a new signature in `scripts/ingest/lib/classify.mjs`.");
    L.push("Nothing below has been filed under a guess.");
    L.push("");
    L.push("| File | Pages | Size | Provider? | Account? | As of? | Type? | Why |");
    L.push("| --- | ---: | ---: | --- | --- | --- | --- | --- |");
    for (const f of unclassified) {
      const why = f.readError ? `read error: ${f.readError}`
        : f.matchedBy === "nothing matched" ? "no provider or report-type signature matched"
        : `only partial fields (${f.confidence} confidence)`;
      L.push(`| \`${esc(f.path)}\` | ${f.pages ?? "—"} | ${f.size} | ${esc(f.provider)} | ${esc(f.accountNo)} | ${esc(f.asOfDate)} | ${esc(f.reportType)} | ${esc(why)} |`);
    }
    L.push("");
  }

  if (archives.length) {
    L.push("## Archives expanded");
    L.push("");
    L.push("| Archive | Extracted to | Files | Skipped | Failed |");
    L.push("| --- | --- | ---: | ---: | ---: |");
    for (const a of archives) {
      L.push(`| \`${esc(a.archive)}\` | \`${esc(a.extractedTo)}\` | ${a.files} | ${a.skipped} | ${a.failed} |`);
    }
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("Every field above is a **best-effort guess** from the filename and the PDF's text layer.");
  L.push("The text layer of these statements is column-scrambled, so this pass reads header fields");
  L.push("only and never a holdings table. No figure in the cockpit comes from this file.");
  L.push("");
  return L.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const archiveReport = expandArchives();
  const pdfFiles = await inspectPdfs();
  const otherFiles = inspectOthers();
  const files = [...pdfFiles, ...otherFiles];
  const tree = group(files.filter((f) => !isUnclassified(f)));
  const unclassified = files.filter(isUnclassified);
  const overlapping = overlaps(tree);
  const generatedAt = new Date().toISOString();

  const json = {
    generatedAt,
    sourceDir: rel(SOURCE_DIR),
    counts: {
      // `files` is EVERY file in the drop; `pdfs` is the subset this pipeline can
      // open. Reporting only the second is what hid four files.
      files: files.length,
      pdfs: pdfFiles.length,
      nonPdf: otherFiles.length,
      classified: files.length - unclassified.length,
      unclassified: unclassified.length,
      encrypted: files.filter((f) => f.encrypted).length,
      fromArchives: files.filter((f) => f.fromArchive).length,
      archivesExpanded: archiveReport.archives.length,
      pages: files.reduce((s, f) => s + (f.pages ?? 0), 0),
    },
    reportTypes: REPORT_TYPES,
    archives: archiveReport.archives,
    archiveFailures: archiveReport.failures,
    files,
    nonPdfFiles: otherFiles,
    groups: tree,
    overlaps: overlapping,
    unclassified,
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(json, null, 2) + "\n");
  fs.writeFileSync(MD_OUT, renderMarkdown({ generatedAt, files, nonPdfFiles: otherFiles, tree, archives: archiveReport.archives, unclassified, overlapping }));

  if (!files.length) {
    console.log("No PDFs found under source/ — wrote an empty inventory.");
    console.log("  Drop the statement ZIPs and PDFs into source/ and re-run `npm run inventory`.");
  } else {
    console.log(`Inventoried ${files.length} file(s) from ${archiveReport.archives.length} archive(s): ${pdfFiles.length} PDF(s), ${otherFiles.length} non-PDF.`);
    if (otherFiles.length) {
      console.log(`  ${otherFiles.length} file(s) this pipeline cannot open — listed so the drop's coverage is countable:`);
      for (const o of otherFiles) console.log(`     ${o.path}  (${o.fileKind})`);
    }
    console.log(`  classified: ${files.length - unclassified.length}   could not classify: ${unclassified.length}`);
    if (overlapping.length) console.log(`  ${overlapping.length} account/date group(s) carry more than one report — see the report.`);
    if (archiveReport.failures.length) console.log(`  ${archiveReport.failures.length} archive entr(ies) failed to extract — listed in the JSON.`);
  }
  console.log(`  ${rel(JSON_OUT)}`);
  console.log(`  ${rel(MD_OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
