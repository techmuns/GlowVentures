// THE STATEMENT LIBRARY TIES TO THE ARCHIVE MANIFEST, DOCUMENT FOR DOCUMENT.
//   npm run test:family
//
// The Statement Library page groups `public/audit/manifest.json` into one folder
// per provider and states, on each folder's face, the file types that provider
// sends. Two ways that grouping could quietly lie, and both would be invisible on
// a page of 39 folders:
//
//   • a document dropped or double-counted — the folder counts would still look
//     plausible, but the library would no longer be the archive;
//   • a folder's stated file types or formats not matching the documents under
//     it — the "what it holds" line the family asked for would describe a
//     different folder than the one it sits on.
//
// So this suite reconstructs the totals straight off the manifest and asserts the
// library reproduces them exactly, then checks the one map that is NOT derived —
// the report-type labels — maps a known slug and falls back for an unknown one.

import fs from "node:fs";
import path from "node:path";
import { buildLibrary, reportLabel, type ManifestEntry } from "@/lib/statementLibrary";

const manifest: ManifestEntry[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "public/audit/manifest.json"), "utf8"),
);

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const lib = buildLibrary(manifest);

// ── 1. THE GROUPING IS DOING WORK ───────────────────────────────────────────
// A library over an empty manifest, or one that collapsed every provider into
// one folder, would satisfy several checks below trivially. This book carries
// dozens of providers and hundreds of documents, so a degenerate result is a
// broken grouping, not a changed book.
ok("the manifest has documents to group", manifest.length > 100, `${manifest.length} documents`);
ok("they fall into many provider folders", lib.folders.length > 10, `${lib.folders.length} folders`);
ok("the library's document total is the manifest's", lib.totalDocs === manifest.length,
  `${lib.totalDocs} vs ${manifest.length}`);

// ── 2. EVERY DOCUMENT IS ACCOUNTED FOR EXACTLY ONCE ─────────────────────────
const fileKeysInFolders = lib.folders.flatMap((f) => f.docs.map((d) => d.fileKey));
const manifestKeys = manifest.map((e) => e.fileKey);
ok("the folders hold exactly as many documents as the manifest",
  fileKeysInFolders.length === manifestKeys.length, `${fileKeysInFolders.length} vs ${manifestKeys.length}`);
ok("no document is dropped and none is double-counted",
  new Set(fileKeysInFolders).size === new Set(manifestKeys).size
  && [...new Set(manifestKeys)].every((k) => fileKeysInFolders.includes(k)),
  `${new Set(fileKeysInFolders).size} distinct in folders, ${new Set(manifestKeys).size} in manifest`);
ok("each folder's docCount is the number of documents it holds",
  lib.folders.every((f) => f.docCount === f.docs.length));
ok("the folder document counts sum to the manifest total",
  lib.folders.reduce((n, f) => n + f.docCount, 0) === manifest.length);

// ── 3. A FOLDER'S STATED TYPES AND FORMATS ARE ITS OWN DOCUMENTS' ───────────
// The "what this folder holds" line the family asked for is the sum of the
// report types under it; if it drifts, the face describes a folder that isn't
// there. Struck against the documents, never typed.
for (const f of lib.folders) {
  const typeSum = f.reportTypes.reduce((n, t) => n + t.count, 0);
  ok(`[${f.provider}] its stated report types count every document it holds`,
    typeSum === f.docCount, `types sum ${typeSum} vs docCount ${f.docCount}`);
  const formatsOfDocs = [...new Set(f.docs.map((d) => d.format))].sort();
  ok(`[${f.provider}] its stated formats are exactly the ones its documents carry`,
    JSON.stringify(f.formats) === JSON.stringify(formatsOfDocs),
    `stated ${f.formats.join(",")} vs actual ${formatsOfDocs.join(",")}`);
  // Each report-type tally names a type that actually appears under the folder.
  ok(`[${f.provider}] every stated report type appears under the folder`,
    f.reportTypes.every((t) => f.docs.some((d) => d.reportType === t.type)));
}

// ── 4. ONE PROVIDER, DERIVED, CHECKED END TO END ────────────────────────────
// The largest provider by document count, chosen off the manifest so the next
// drop picks its own. Its folder must carry precisely that provider's documents.
const counts = new Map<string, number>();
for (const e of manifest) counts.set(e.provider || "(unidentified)", (counts.get(e.provider || "(unidentified)") ?? 0) + 1);
const [biggestProvider, biggestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
const biggestFolder = lib.folders.find((f) => f.provider === biggestProvider);
ok(`the largest provider (${biggestProvider}) has a folder`, !!biggestFolder);
ok(`...holding exactly its ${biggestCount} documents`, biggestFolder?.docCount === biggestCount,
  `${biggestFolder?.docCount} vs ${biggestCount}`);

// ── 5. DETERMINISTIC — THE SAME MANIFEST RENDERS THE SAME LIBRARY ───────────
const again = buildLibrary(manifest);
ok("folder order is stable across runs",
  JSON.stringify(lib.folders.map((f) => f.provider)) === JSON.stringify(again.folders.map((f) => f.provider)));
ok("document order within a folder is stable across runs",
  lib.folders.every((f, i) =>
    JSON.stringify(f.docs.map((d) => d.fileKey)) === JSON.stringify(again.folders[i].docs.map((d) => d.fileKey))));
// Placeholders (an unidentified provider, a "not a statement" source) sort after
// every real statement issuer, so the list reads as providers first.
const demotedFirst = lib.folders.findIndex((f) => f.provider.startsWith("(") || f.provider.toLowerCase().includes("not a statement"));
ok("bracketed / non-statement folders sort to the end",
  demotedFirst === -1 || lib.folders.slice(demotedFirst).every((f) => f.provider.startsWith("(") || f.provider.toLowerCase().includes("not a statement")));

// ── 6. THE ONE NON-DERIVED MAP — REPORT-TYPE LABELS ─────────────────────────
ok("a known report-type slug maps to human words", reportLabel("capital-gain") === "Capital gains",
  reportLabel("capital-gain"));
ok("an unknown slug is title-cased rather than dropped",
  reportLabel("some-new-report") === "Some New Report", reportLabel("some-new-report"));

console.log(fails ? `\n${fails} FAILED` : `\nall passed`);
process.exit(fails ? 1 : 0);
