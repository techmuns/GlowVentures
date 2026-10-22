// THE ORIGINAL STATEMENT FILES, PUBLISHED FOR THE STATEMENT LIBRARY'S PREVIEW.
//
//   npm run build:statement-files      (runs before `build`, `dev` and `test:family`)
//
// *"publish the original statement files to the hosted site behind the password
// gate so the preview can show the real PDF and spreadsheet layout"* — the
// family, 22 Oct 2026. The archive under public/audit/ carries what the pipeline
// READ out of each statement; the file itself stays in source/, which no build
// served. This copies the file behind every manifest entry to
// public/statement-files/<docKey>.<ext> and writes index.json, the one list the
// page reads to know which files this build carries — Pages' SPA fallback
// answers a missing path with index.html and a 200, so a status code cannot.
// Like every path on the site, the folder is served only behind the edge
// password gate (functions/_middleware.js). It is gitignored: source/ is the
// committed copy.
//
// NOT `public/statements/`: `/statements` is the Statement Library's own route,
// and a directory of that name would sit on the path the SPA fallback serves.
//
// THE ZIPS ARE EXPANDED HERE WHEN THEY ARE NOT ON DISK. `source/_extracted/` is
// gitignored (`npm run inventory` writes it), so the hosted build sees only the
// committed archives. They are expanded into a temporary directory by the
// inventory's own rule — `extractZip`, a top-level ZIP to `<its path under
// source/>/<its name>`, a nested one beside itself — so a manifest path resolves
// to the same bytes whichever machine builds.
//
// A FILE THAT CANNOT BE FOUND IS NAMED, NOT GUESSED: index.json's `missing`
// carries the reason and the page shows it in place of the file. The build does
// not fail on one, because a statement whose original is absent still has its
// read text in the archive, and a deploy held back on a preview would hold back
// every figure on the site; `test:family` fails on it instead.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { extractZip } from "./ingest/lib/unzip.mjs";
import { passwordsFromEnv } from "./ingest/lib/layout.mjs";
import { previewKey, unlockPdf } from "./lib/statementPreviewPdf.mjs";
import { describePreview, previewKeyBytes, sealPreview } from "../shared/statementPreviewCrypto.mjs";
import { restoreStatementPasswords } from "./lib/statementPasswords.mjs";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "source");
const EXTRACT_DIR = path.join(SOURCE_DIR, "_extracted");
const OUT = path.join(ROOT, "public", "statement-files");
// Persist encrypted derivatives with the repository, never plaintext PDFs.
// A build without the intake's secret still opens every previously unlocked file.
// Names bind each preview to the SHA-256 of the exact original, never a filename.
const PREVIEWS = path.join(ROOT, "public", "statement-previews");
await restoreStatementPasswords();
const passwords = passwordsFromEnv();
const dashboardPassword = process.env.GLOW_DASHBOARD_PASSWORD;
const dashboardHash = /const PASSWORD_HASH = "([a-f0-9]{64})"/.exec(fs.readFileSync(path.join(ROOT, 'functions/_middleware.js'), 'utf8'))?.[1];
let encryptionKey;
const INDEX = "index.json";
// The inventory's own bound on ZIPs inside ZIPs (scripts/ingest/inventory.mjs).
const MAX_ZIP_DEPTH = 6;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/audit/manifest.json"), "utf8"));

function walk(dir, hit, skip = null) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink() || full === skip) continue;
    if (e.isDirectory()) walk(full, hit, skip);
    else if (e.isFile()) hit(full);
  }
}

/** Expand every committed archive into a temporary mirror of source/_extracted. */
function expandArchives() {
  const mirror = fs.mkdtempSync(path.join(os.tmpdir(), "glow-statement-files-"));
  const done = new Set();
  for (let depth = 0; depth < MAX_ZIP_DEPTH; depth++) {
    const zips = [];
    walk(SOURCE_DIR, (f) => { if (/\.zip$/i.test(f) && !done.has(f)) zips.push(f); }, EXTRACT_DIR);
    walk(mirror, (f) => { if (/\.zip$/i.test(f) && !done.has(f)) zips.push(f); });
    if (!zips.length) break;
    for (const zip of zips) {
      done.add(zip);
      const base = path.basename(zip, path.extname(zip));
      const dest = zip.startsWith(mirror + path.sep)
        ? path.join(path.dirname(zip), base)
        : path.join(mirror, path.relative(SOURCE_DIR, path.dirname(zip)), base);
      fs.mkdirSync(dest, { recursive: true });
      extractZip(zip, dest);
    }
  }
  return mirror;
}

let mirror = null;
function locate(sourcePath) {
  const parts = sourcePath.split("/");
  const direct = path.join(ROOT, ...parts);
  if (fs.existsSync(direct)) return direct;
  if (parts[0] !== "source" || parts[1] !== "_extracted") return null;
  mirror ??= expandArchives();
  const expanded = path.join(mirror, ...parts.slice(2));
  return fs.existsSync(expanded) ? expanded : null;
}

/** The file's own extension, lower-cased — the published name keeps it so the
 *  server sends the right content type. */
const extOf = (p) => {
  const base = p.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

// A PDF that opens only with its password: the page says so beside the file
// rather than leaving the viewer's prompt to explain itself. An /Encrypt
// dictionary alone does not make one — a statement encrypted with an empty user
// password (permissions only, as ICICI's payment advices are) opens freely — so
// each encrypted file is opened here without a password, by the same pdfjs the
// ingest reads with, and only a refusal for want of one counts.
const hasEncryptDictionary = (buf) => /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(buf.toString("latin1"));
let pdfjs = null;
async function needsPassword(buf) {
  if (!hasEncryptDictionary(buf)) return false;
  pdfjs ??= await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 });
  try {
    await task.promise;
    return false;
  } catch (e) {
    if (e?.name === "PasswordException") return true;
    throw new Error(`could not open an encrypted PDF to test for a password: ${e?.message ?? e}`);
  } finally {
    await task.destroy();
  }
}

async function unlockedPreview(bytes) {
  const file = previewKey(bytes);
  const target = path.join(PREVIEWS, file.replace(/\.pdf$/, '.bin'));
  let sealed;
  if (fs.existsSync(target)) sealed = fs.readFileSync(target);
  if (!sealed || describePreview(sealed).dashboardHash !== dashboardHash) {
    if (!dashboardPassword) {
      if (sealed) throw new Error('Dashboard password changed: regenerate encrypted statement previews before deploying');
      return undefined;
    }
    const suppliedHash = createHash('sha256').update(`glow-ventures-family-office::pw::v1\n${dashboardPassword}`).digest('hex');
    if (suppliedHash !== dashboardHash) throw new Error('Preview encryption needs the current dashboard password');
    const preview = await unlockPdf(bytes, passwords);
    if (!preview) return undefined;
    // Fail closed: never publish a derivative that still requires a password.
    if (await needsPassword(preview)) throw new Error("Statement preview is still password-protected");
    encryptionKey ??= await previewKeyBytes(dashboardPassword);
    sealed = await sealPreview(preview, encryptionKey, file.slice(0, -4), dashboardHash);
    fs.mkdirSync(PREVIEWS, { recursive: true });
    fs.writeFileSync(target, sealed);
  }
  const metadata = describePreview(sealed);
  if (metadata.dashboardHash !== dashboardHash) {
    throw new Error("Dashboard password changed: regenerate encrypted statement previews before deploying");
  }
  return { file, bytes: metadata.bytes };
}

// Several statements can be cut from one bundled PDF (`lib/bundle.mjs`); each
// part's pages.json keeps the page numbers it had in the file, so the preview
// opens that file at the part's own first page.
const shared = new Map();
for (const e of manifest) shared.set(e.sourcePath, (shared.get(e.sourcePath) ?? 0) + 1);
function partOf(e) {
  if ((shared.get(e.sourcePath) ?? 0) < 2) return null;
  try {
    const pages = JSON.parse(fs.readFileSync(path.join(ROOT, "public/audit", e.docKey, "pages.json"), "utf8")).pages ?? [];
    const nums = pages.map((p) => p.page).filter((n) => Number.isInteger(n));
    return nums.length ? { from: Math.min(...nums), to: Math.max(...nums) } : null;
  } catch { return null; }
}

fs.mkdirSync(OUT, { recursive: true });
const files = {};
const missing = {};
const written = new Set([INDEX]);
let changed = 0;
for (const e of manifest) {
  if (!/^[a-z0-9-]+$/.test(e.docKey)) throw new Error(`Invalid docKey: ${e.docKey}`);
  const found = locate(e.sourcePath);
  if (!found) {
    missing[e.docKey] = `${e.sourcePath} is not in this build's source tree`;
    continue;
  }
  const ext = extOf(e.sourcePath);
  const bytes = fs.readFileSync(found);
  const name = ext ? `${e.docKey}.${ext}` : e.docKey;
  const target = path.join(OUT, name);
  let same = false;
  try { same = fs.statSync(target).size === bytes.length && fs.readFileSync(target).equals(bytes); } catch { /* not there yet */ }
  if (!same) { fs.writeFileSync(target, bytes); changed++; }
  written.add(name);
  const encrypted = ext === "pdf" && await needsPassword(bytes);
  files[e.docKey] = {
    file: name,
    bytes: bytes.length,
    encrypted,
    ...(encrypted ? { preview: await unlockedPreview(bytes) } : {}),
    part: partOf(e),
  };
}

// A file left from an older manifest is not a statement this book carries.
let removed = 0;
for (const f of fs.readdirSync(OUT)) {
  if (!written.has(f)) { fs.rmSync(path.join(OUT, f), { force: true }); removed++; }
}
fs.writeFileSync(path.join(OUT, INDEX), JSON.stringify({ files, missing }) + "\n");
if (mirror) fs.rmSync(mirror, { recursive: true, force: true });

const gaps = Object.keys(missing);
console.log(`Published ${Object.keys(files).length} of ${manifest.length} statement files to public/statement-files/ (${changed} written, ${removed} removed${mirror ? ", archives expanded from source/" : ""})`);
for (const k of gaps) console.warn(`  not published: ${k} — ${missing[k]}`);
