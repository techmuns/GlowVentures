#!/usr/bin/env node
// BUILD src/data/privateProfiles.json — every strategy and description the
// family has supplied for a private investment, as read, with where each sits.
//   npm run build-profiles            (also run after `npm run build-book`)
//
// It walks `source/` — loose files and the files inside each zip, read in memory
// so the result does not depend on whether `npm run inventory` has expanded the
// zips — and keeps every table `scripts/lib/privateProfiles.mjs` recognises as a
// profile table by its HEADER. The file's name, folder and layout decide
// nothing. Which investment a record describes is decided at display time,
// against the book's own identities (`src/lib/investmentProfiles.ts`), so a
// record that matches nothing is still carried here and named on the page.
//
// Regenerates byte-identically; a file with no profile table is not listed.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { profilesOfFile, deliveryOf } from "./lib/privateProfiles.mjs";
import { listEntries, readEntry, isMacMetadata } from "./ingest/lib/unzip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = process.env.GLOW_SOURCE_DIR ?? path.join(ROOT, "source");
const OUT = process.env.GLOW_PROFILES_OUT ?? path.join(ROOT, "src", "data", "privateProfiles.json");
const READABLE = /\.(?:xlsx|xlsm|xls|csv|tsv|txt|json)$/i;
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const md5 = (b) => createHash("md5").update(b).digest("hex");

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const f = path.join(dir, name);
    // The expanded copies are derived; their zips are read directly below.
    if (name === "_extracted" || name === "__MACOSX" || name.startsWith("._")) continue;
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

const files = [];
const records = [];
const take = (bytes, file, delivery) => {
  const found = profilesOfFile(bytes, file);
  if (!found.length) return;
  files.push({ file, md5: md5(bytes), records: found.length });
  for (const r of found) records.push({ file, delivery, ...r });
};
for (const f of walk(SOURCE)) {
  const name = rel(f);
  if (READABLE.test(f)) { take(readFileSync(f), name, deliveryOf(name)); continue; }
  if (!/\.zip$/i.test(f)) continue;
  const buf = readFileSync(f);
  let entries = [];
  try { entries = listEntries(buf); } catch { continue; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isMacMetadata(e.name) || e.name.endsWith("/") || !READABLE.test(e.name)) continue;
    let bytes;
    try { bytes = readEntry(buf, e); } catch { continue; }
    take(bytes, `${name}!${e.name}`, deliveryOf(name));
  }
}

const data = { files, records };
writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
console.log(`${rel(OUT)}: ${records.length} profile record(s) from ${files.length} file(s).`);
for (const x of files) console.log(`  · ${x.file} — ${x.records}`);
