// Minimal PDF reader — page count and a flat text dump, no dependency.
//
// SCOPE, and why it is this narrow: the text these statements yield is
// COLUMN-SCRAMBLED. A report engine emits each cell wherever it lands on the
// page, so values arrive out of document order and run together
// (`-33.7912,500 3,575,346 …`). Reading a holdings table out of this stream is
// not merely unreliable, it is wrong in ways that look plausible — a number
// lands under the wrong heading and nothing about the output says so.
//
// So this module is used for ONE thing: finding header FIELDS, where the label
// and its value survive scrambling because we match the label and take what
// follows it. Real table extraction has to be coordinate-based — per-span x/y
// positions, columns recovered from x-clustering — and belongs in the
// extraction pass, not here.
import { inflateSync } from "node:zlib";

/** Cap on extracted text. Header fields are near the front; the rest is table noise. */
const MAX_TEXT = 400_000;

/** Inflate every FlateDecode stream we can, plus keep the raw bytes for structure scans. */
function decodedStreams(buf) {
  const out = [];
  let total = 0;
  // Decode once: re-deriving this inside the loop re-materialises the whole file
  // per stream, which on a 10 MB statement is the difference between instant and
  // a minute.
  const latin = buf.toString("latin1");
  // `stream` ... `endstream`, with the object dictionary just before it.
  const re = /stream\r?\n?/g;
  let m;
  while ((m = re.exec(latin)) !== null) {
    if (total > MAX_TEXT * 4) break;
    const start = m.index + m[0].length;
    const endIdx = buf.indexOf("endstream", start, "latin1");
    if (endIdx < 0) continue;
    const dictStart = Math.max(0, m.index - 600);
    const dict = latin.slice(dictStart, m.index);
    const raw = buf.slice(start, endIdx);
    if (/\/FlateDecode/.test(dict)) {
      try {
        const inflated = inflateSync(raw);
        out.push(inflated);
        total += inflated.length;
      } catch {
        // Truncated or non-standard stream — skip it rather than abort the file.
      }
    } else if (/\/Contents|\/Type\s*\/ObjStm/.test(dict) || raw.length < 65536) {
      out.push(raw);
      total += raw.length;
    }
    // Resume PAST the whole `endstream` token. Landing on `endIdx` puts the
    // scanner inside the word "endstream", which re-matches its trailing
    // "stream" and makes the next real stream get swallowed as part of a bogus
    // region — the symptom is a document that yields only its first page.
    re.lastIndex = endIdx + "endstream".length;
  }
  return out;
}

/**
 * Number of pages. Counts `/Type /Page` objects (not `/Pages`) across the raw
 * file and every inflated stream, since a modern PDF keeps its page objects
 * inside compressed object streams where a raw scan finds nothing. Falls back to
 * the page-tree `/Count`. Returns null when neither is determinable — better an
 * explicit null in the inventory than a confident wrong number.
 */
export function pageCount(buf, streams) {
  const countPages = (s) => (s.match(/\/Type\s*\/Page(?![sA-Za-z])/g) || []).length;
  let n = countPages(buf.toString("latin1"));
  if (n === 0) {
    for (const s of streams) n += countPages(s.toString("latin1"));
  }
  if (n > 0) return n;
  // Fall back to the /Count on the page tree root.
  const counts = [];
  const scan = (text) => {
    const re = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g;
    let m;
    while ((m = re.exec(text)) !== null) counts.push(Number(m[1] ?? m[2]));
  };
  scan(buf.toString("latin1"));
  for (const s of streams) scan(s.toString("latin1"));
  return counts.length ? Math.max(...counts) : null;
}

function decodeLiteral(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[++i];
    if (n === undefined) break;
    if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "t") out += "\t";
    else if (n === "b" || n === "f") out += " ";
    else if (n >= "0" && n <= "7") {
      let oct = n;
      while (oct.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") oct += s[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += n;
  }
  return out;
}

function decodeHex(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const bytes = [];
  for (let i = 0; i + 1 < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  // UTF-16BE is common for text with a byte-order mark.
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  return String.fromCharCode(...bytes);
}

/**
 * Flat text of the document. Word order is NOT document order — see the header
 * note. Strings are joined with single spaces, and text-positioning operators
 * are treated as separators so adjacent cells don't fuse into one token.
 */
export function extractText(streams) {
  const parts = [];
  let total = 0;
  for (const s of streams) {
    if (total > MAX_TEXT) break;
    const text = s.toString("latin1");
    // Only look at things that plausibly are content streams.
    if (!/(Tj|TJ|Td|TD|Tm)\b/.test(text)) continue;
    const re = /\((?:[^()\\]|\\[\s\S])*\)|<[0-9a-fA-F\s]+>/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const tok = m[0];
      const val = tok[0] === "(" ? decodeLiteral(tok.slice(1, -1)) : decodeHex(tok.slice(1, -1));
      if (!val) continue;
      parts.push(val);
      total += val.length;
      if (total > MAX_TEXT) break;
    }
  }
  return parts
    .join(" ")
    // Drop control bytes, then collapse the whitespace the scrambling introduces.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read one PDF: { pages, text, error }. Never throws — a bad file is a row, not a crash. */
export function readPdf(buf) {
  try {
    if (buf.slice(0, 5).toString("latin1") !== "%PDF-") {
      return { pages: null, text: "", error: "not a PDF (missing %PDF- header)" };
    }
    const streams = decodedStreams(buf);
    return { pages: pageCount(buf, streams), text: extractText(streams), error: null };
  } catch (e) {
    return { pages: null, text: "", error: e.message };
  }
}
