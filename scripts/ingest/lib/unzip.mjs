// Minimal ZIP reader — enough to expand the statement archives, no dependency.
//
// Deliberately hand-rolled: the ingest runs against a family's financial records,
// and the fewer third-party packages that touch those bytes the better. ZIP's
// central directory is a stable, well-specified format; this reads it directly.
//
// Supports store (method 0) and deflate (method 8), which is everything the
// export tools in this pipeline emit, plus the ZIP64 end-of-central-directory
// record so a large archive doesn't silently read as empty.
import { inflateRawSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Locate the end-of-central-directory record, scanning back from the tail. */
function findEocd(buf) {
  const maxBack = Math.min(buf.length, 0xffff + 22);
  for (let i = buf.length - 22; i >= buf.length - maxBack; i--) {
    if (i >= 0 && buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readDirectoryLocation(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("not a ZIP archive (no end-of-central-directory record)");
  let entries = buf.readUInt16LE(eocd + 10);
  let dirOffset = buf.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields saturate and the real values live in a separate record.
  if (entries === 0xffff || dirOffset === 0xffffffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) !== SIG_EOCD64_LOCATOR) continue;
      const rec = Number(buf.readBigUInt64LE(i + 8));
      if (rec >= 0 && rec + 56 <= buf.length && buf.readUInt32LE(rec) === SIG_EOCD64) {
        entries = Number(buf.readBigUInt64LE(rec + 32));
        dirOffset = Number(buf.readBigUInt64LE(rec + 48));
      }
      break;
    }
  }
  return { entries, dirOffset };
}

/** Every file entry in the archive: { name, method, compressedSize, size, localOffset }. */
export function listEntries(buf) {
  const { entries, dirOffset } = readDirectoryLocation(buf);
  const out = [];
  let p = dirOffset;
  for (let i = 0; i < entries && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    out.push({ name, method, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Decompress one entry's bytes. */
export function readEntry(buf, entry) {
  const lo = entry.localOffset;
  if (buf.readUInt32LE(lo) !== SIG_LOCAL) throw new Error(`bad local header for ${entry.name}`);
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

/**
 * Reject path traversal ("../", absolute paths, drive letters) before writing.
 * An archive is untrusted input even when it came from a bank.
 */
function safeJoin(destDir, name) {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^[a-zA-Z]:/, "");
  const target = path.resolve(destDir, normalized);
  const root = path.resolve(destDir);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

/**
 * Expand `zipPath` into `destDir`. Returns { written, skipped, failed } where
 * `failed` carries per-entry reasons — a single unreadable entry must not lose
 * the rest of the archive.
 */
export function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);
  const result = { written: [], skipped: [], failed: [] };
  let entries;
  try {
    entries = listEntries(buf);
  } catch (e) {
    result.failed.push({ name: "(archive)", reason: e.message });
    return result;
  }
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;                       // directory marker
    if (/(^|\/)__MACOSX\/|(^|\/)\._/.test(entry.name)) {          // macOS resource forks
      result.skipped.push({ name: entry.name, reason: "macOS metadata" });
      continue;
    }
    const target = safeJoin(destDir, entry.name);
    if (!target) {
      result.failed.push({ name: entry.name, reason: "path escapes the destination directory" });
      continue;
    }
    try {
      const bytes = readEntry(buf, entry);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      result.written.push(target);
    } catch (e) {
      result.failed.push({ name: entry.name, reason: e.message });
    }
  }
  return result;
}
