// EVERY FILE IN `source/`, AND WHAT BECAME OF IT.
//
// The extraction report answers "did the documents we read tie out?". This
// answers the question before it: "is there a file in `source/` whose data never
// reached anything?" — which is not the same question, and until this existed
// nobody could answer it without reading a directory listing by hand.
//
// It accounts for EVERY leaf file, and a file is only ever in one class:
//
//   read                  — one or more documents in `public/audit/`
//   read-via-duplicate    — byte-identical to a file that was read; the pipeline
//                           reads each md5 once, so its data IS in the archive
//   held-out-by-decision  — read perfectly and deliberately not a source (the
//                           consolidated review, the family's investment register)
//   not-a-document        — a macOS `__MACOSX/._*` resource fork: a 212- or
//                           477-byte AppleDouble stub with no `%PDF` header,
//                           created by zipping on a Mac. There is nothing in it.
//                           Counted from each ZIP's own directory, never from
//                           what happens to be on disk — see below
//   excluded-by-policy    — the drop's own password notes. They carry PANs and a
//                           SEBI registration number, so they are read at runtime
//                           from `GLOW_PDF_PASSWORDS` and never committed
//   unread                — anything else. This list must be empty, and the run
//                           exits non-zero if it is not
//
// Run: node scripts/source-coverage.mjs   ->   docs/SOURCE-COVERAGE.md
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEntries, readEntry, isMacMetadata } from "./ingest/lib/unzip.mjs";

// Run against the committed tree by default, from wherever it is invoked; the
// three GLOW_* variables `extract.mjs` honours point it at a scratch run
// instead, so a new delivery can be accounted for without touching docs/.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const SOURCE_DIR = process.env.GLOW_SOURCE_DIR ?? "source";
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? "public/audit";
const DOCS_DIR = process.env.GLOW_DOCS_DIR ?? "docs";
const OUT = path.join(DOCS_DIR, "SOURCE-COVERAGE.md");

const manifest = JSON.parse(readFileSync(path.join(AUDIT_DIR, "manifest.json"), "utf8"));
const bySource = new Map();
for (const d of manifest) {
  const k = (d.sourcePath ?? "").replace(/^\.\//, "");
  if (!k) continue;
  if (!bySource.has(k)) bySource.set(k, []);
  bySource.get(k).push(d);
}

const files = execSync(`find ${JSON.stringify(SOURCE_DIR)} -type f ! -name '*.zip' ! -name 'README.md' | sort`, { encoding: "utf8", maxBuffer: 1e8 })
  .trim().split("\n").filter(Boolean)
  // The path the manifest records: relative to the repository root.
  .map((f) => path.relative(ROOT, path.resolve(f)).split(path.sep).join("/"));

/**
 * THE RESOURCE FORKS ARE COUNTED FROM EACH ZIP'S OWN DIRECTORY, NOT FROM DISK.
 *
 * `source/_extracted/` is derived and gitignored, and the pipeline's own
 * unzipper (`lib/unzip.mjs`) SKIPS macOS metadata. So which forks exist on disk
 * depends on who expanded the tree: the same `source/` read 58 "not a document"
 * where another unzipper had written them and 0 where the pipeline had — a
 * generated document whose counts depend on who unzipped is not idempotent.
 *
 * Every entry the unzipper skips is listed here at the path an unzipper would
 * have written it to — the destination `inventory.mjs` gives each archive — and
 * checked by its own bytes, exactly as a fork on disk is. One already on disk is
 * read as it is. An entry the unzipper skips whose bytes are NOT a fork is not
 * waved through: it falls to `unread`, because the pipeline never read it.
 */
const EXTRACT_DIR = path.join(SOURCE_DIR, "_extracted");
const forkBytes = new Map();                     // repo-relative path -> Buffer | null
const onDisk = new Set(files);
const zips = execSync(`find ${JSON.stringify(SOURCE_DIR)} -type f -iname '*.zip' | sort`, { encoding: "utf8", maxBuffer: 1e8 })
  .trim().split("\n").filter(Boolean);
for (const z of zips) {
  const inExtracted = path.resolve(z).startsWith(path.resolve(EXTRACT_DIR) + path.sep);
  const base = path.basename(z, path.extname(z));
  const dest = inExtracted
    ? path.join(path.dirname(z), base)
    : path.join(EXTRACT_DIR, path.relative(SOURCE_DIR, path.dirname(z)), base);
  let buf, entries;
  try { buf = readFileSync(z); entries = listEntries(buf); } catch { continue; }
  for (const e of entries) {
    if (e.name.endsWith("/") || !isMacMetadata(e.name)) continue;
    const abs = path.resolve(dest, e.name.replace(/\\/g, "/").replace(/^\/+/, ""));
    if (!abs.startsWith(path.resolve(dest) + path.sep)) continue;   // escapes its destination
    const p = path.relative(ROOT, abs).split(path.sep).join("/");
    if (onDisk.has(p) || forkBytes.has(p)) continue;
    let bytes = null;
    try { bytes = readEntry(buf, e); } catch { /* an unreadable entry is judged on null below */ }
    forkBytes.set(p, bytes);
  }
}
files.push(...forkBytes.keys());

/**
 * A FILE CAN BE READ WITHOUT HAVING A DOCUMENT OF ITS OWN, one more way: a
 * spreadsheet export beside its PDF is archived as a WITNESS of the PDF's
 * document (`twinOf`) — its rows kept, no facts. It is read; it is not a second
 * source. (Two files printing the same text are each read and archived: the
 * second is filed under a `-2` docKey, exactly like the pairs before it.)
 */

/**
 * A ZIP DOES NOT SAY WHICH ENCODING ITS FILENAMES ARE IN, so two unzippers
 * legitimately disagree about one byte and produce two names for one file.
 * `MOTILAL REPORTS.zip` carries `Delphi Emerging Equity Fund –_…` with an EN
 * DASH; decoded as CP437 that is `ΓÇô`, and a path comparison then reports a
 * document the archive plainly contains as unread.
 *
 * So the index is keyed BOTH ways: on the exact path, and on the path with every
 * non-ASCII character removed. The second is a fact about two spellings of one
 * name, not a guess about which file is meant — it is only consulted when the
 * exact path misses, and an ambiguous fold (two different files collapsing to
 * one ASCII key) is dropped rather than matched.
 */
const asciiKey = (p) => p.replace(/[^\x20-\x7E]/g, "");
const byAscii = new Map();
for (const k of bySource.keys()) {
  const a = asciiKey(k);
  byAscii.set(a, byAscii.has(a) ? null : k);   // null marks an ambiguous fold
}

const bytesOf = (f) => (forkBytes.has(f) ? (forkBytes.get(f) ?? Buffer.alloc(0)) : readFileSync(f));
const md5 = (f) => createHash("md5").update(bytesOf(f)).digest("hex");

/**
 * A `__MACOSX/._x` file is not a document, and this is checked rather than
 * assumed: every one is a couple of hundred bytes and none carries a `%PDF`
 * header, whatever its extension says.
 */
function isResourceFork(f) {
  if (!isMacMetadata(f)) return false;
  try {
    if (!forkBytes.has(f) && statSync(f).size > 4096) return false;
    const bytes = bytesOf(f);
    if (forkBytes.has(f) && (!forkBytes.get(f) || bytes.length > 4096)) return false;
    return !bytes.subarray(0, 4).equals(Buffer.from("%PDF"));
  } catch { return false; }
}

const isPasswordNote = (f) => /password\.docx$/i.test(f);

// md5 -> files, so a file with no entry of its own can be shown to be a twin.
const byHash = new Map();
for (const f of files) {
  if (isResourceFork(f)) continue;
  let h; try { h = md5(f); } catch { continue; }
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(f);
}

const CLASSES = ["read", "read-via-duplicate", "read-as-witness", "held-out-by-decision", "not-a-document", "excluded-by-policy", "unread"];
const rows = [];
for (const f of files) {
  let docs = bySource.get(f) ?? [];
  if (!docs.length) {
    const alt = byAscii.get(asciiKey(f));
    if (alt) docs = bySource.get(alt) ?? [];
  }
  if (docs.length) {
    const heldOut = docs.every((d) => (d.status === "failed")
      && /Family investment register|Consolidated family review/.test(d.provider ?? ""));
    const witness = docs.every((d) => d.twinOf);
    rows.push({ f, cls: heldOut ? "held-out-by-decision" : witness ? "read-as-witness" : "read", docs,
      note: witness ? `witness of ${docs.map((d) => d.twinOf).join(", ")}` : docs.map((d) => d.docKey).join(", ") });
    continue;
  }
  if (isResourceFork(f)) { rows.push({ f, cls: "not-a-document", docs: [], note: "macOS AppleDouble resource fork" }); continue; }
  if (isPasswordNote(f)) { rows.push({ f, cls: "excluded-by-policy", docs: [], note: "the drop's own password note — read from GLOW_PDF_PASSWORDS at runtime, never committed" }); continue; }
  const twin = (byHash.get(md5(f)) ?? []).find((g) => g !== f && (bySource.get(g) ?? []).length);
  if (twin) { rows.push({ f, cls: "read-via-duplicate", docs: [], note: `byte-identical to ${twin}` }); continue; }
  rows.push({ f, cls: "unread", docs: [], note: "NO archive entry, no twin, and not excluded by any rule" });
}

const count = (c) => rows.filter((r) => r.cls === c).length;
const unread = rows.filter((r) => r.cls === "unread");

const L = [];
const say = (s = "") => L.push(s);
say("# Every file in `source/`, and what became of it");
say();
say("Generated by `node scripts/source-coverage.mjs` — **do not edit by hand**.");
say();
say("`docs/EXTRACTION-REPORT.md` answers *did the documents we read tie out?*. This answers the");
say("question before it: **is there a file whose data never reached anything?** Every leaf file is");
say("in exactly one class below, and the `unread` list must be empty — this script exits non-zero");
say("if it is not, so a delivery that lands a file nobody reads cannot pass silently.");
say();
say("| Outcome | Files | What it means |");
say("| --- | ---: | --- |");
say(`| Read | ${count("read")} | one or more documents in \`public/audit/\` |`);
say(`| Read via a byte-identical twin | ${count("read-via-duplicate")} | the pipeline reads each md5 once; the data IS in the archive |`);
if (count("read-as-witness")) say(`| Read as a witness | ${count("read-as-witness")} | a spreadsheet export of the PDF beside it — rows archived, figures checked, no facts |`);
say(`| Held out by decision | ${count("held-out-by-decision")} | read perfectly and deliberately not a source |`);
say(`| Not a document | ${count("not-a-document")} | macOS \`__MACOSX/._*\` resource forks — checked, not assumed |`);
say(`| Excluded by policy | ${count("excluded-by-policy")} | the drop's own password notes |`);
say(`| **Unread** | **${unread.length}** | **must be zero** |`);
say(`| **Total leaf files** | **${rows.length}** | |`);
say();
say(`Those files produce **${manifest.length} documents** in the archive.`);
say();

if (unread.length) {
  say("## ⚠ UNREAD FILES");
  say();
  for (const r of unread) say(`- \`${r.f}\``);
  say();
}

say("## Held out by decision");
say();
say("Read perfectly, and deliberately not a source. No institution issued either, so folding them");
say("in would end the guarantee that every figure traces to the statement of the institution that");
say("struck it. Both are recorded in the archive with that reason — they are NOT missing readers.");
say();
say("| File | Where its data goes instead |");
say("| --- | --- |");
for (const r of rows.filter((x) => x.cls === "held-out-by-decision")) {
  const where = /INVESTMENT SHEET/i.test(r.f)
    ? "`npm run reconcile:register` — an independent cross-check of the generated book"
    : "`npm run reconcile:review` — an independent cross-check of the generated book";
  say(`| \`${r.f}\` | ${where} |`);
}
say();

say("## Excluded by policy");
say();
say("| File | Why |");
say("| --- | --- |");
for (const r of rows.filter((x) => x.cls === "excluded-by-policy")) say(`| \`${r.f}\` | ${r.note} |`);
say();

say("## Read via a byte-identical twin");
say();
say("A monthly drop reissues the same filenames, and a ZIP sometimes carries the same document");
say("twice. `extract.mjs` reads each md5 once, so these carry no data the archive lacks.");
say();
say("| File | Identical to |");
say("| --- | --- |");
for (const r of rows.filter((x) => x.cls === "read-via-duplicate")) {
  say(`| \`${r.f.replace(/^source\//, "")}\` | \`${r.note.replace("byte-identical to source/", "")}\` |`);
}
say();

if (count("read-as-witness")) {
  say("## Read as a witness of its PDF");
  say();
  say("A spreadsheet export written beside a PDF of the same name. The PDF is the document; the");
  say("export is archived with its rows, carries no facts, and every significant figure in it is");
  say("checked against the figures the PDF prints (see each document's `witness-of` warning).");
  say();
  say("| File | Witness of |");
  say("| --- | --- |");
  for (const r of rows.filter((x) => x.cls === "read-as-witness")) {
    say(`| \`${r.f.replace(/^source\//, "")}\` | ${r.docs.map((d) => `\`${d.twinOf}\` (${d.status})`).join(", ")} |`);
  }
  say();
}

say("## Not a document");
say();
say(`${count("not-a-document")} files under \`__MACOSX/\`, created by zipping on a Mac. Each is a 212- or`);
say("477-byte AppleDouble stub and **none carries a `%PDF` header** — verified per file rather than");
say("assumed from the path. There is nothing in them to read. They are counted from each ZIP's own");
say("directory, at the path an unzipper would write them to: the pipeline's own unzipper skips them,");
say("so whether they exist under `source/_extracted/` depends on who expanded it, and this count must not.");
say();

writeFileSync(OUT, L.join("\n") + "\n");
console.log(OUT);
console.log(`  ${rows.length} leaf files -> ${manifest.length} documents`);
for (const c of CLASSES) if (count(c)) console.log(`  ${c.padEnd(22)} ${count(c)}`);
if (unread.length) {
  console.error(`\n  ${unread.length} FILE(S) UNREAD:`);
  for (const r of unread) console.error("   ", r.f);
  process.exit(1);
}
