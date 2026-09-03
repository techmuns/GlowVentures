// OCR AS A TEXT-LAYER FALLBACK — for OUTLINED text only, and never for a photograph.
//
// ── WHY THIS IS ALLOWED HERE WHEN OCR IS REFUSED EVERYWHERE ELSE ────────────
//
// This book refuses OCR on a SCAN, and that refusal stands: Bharat's HDFC NSDL
// statement in `august-2026-e/` is four DCTDecode JPEGs — a photograph of paper.
// Its information is genuinely lossy (sensor noise, skew, JPEG ringing), so a
// figure recovered from it cannot be traced to what the document printed, and a
// wrong digit in a market value is indistinguishable from a right one.
//
// `august-2026-f/`'s two statements are a DIFFERENT ARTEFACT and the difference
// is not cosmetic. They contain no raster image at all: every glyph is stored as
// its exact BEZIER OUTLINE (see `classifyInk`). Rendering those outlines is not
// photographing anything — it is evaluating the shapes the file itself carries,
// at whatever resolution we choose. At 600 dpi the result is a clean synthetic
// bitmap of mathematically exact curves: no noise, no skew, no compression.
//
// So the transcription is faithful in a way a scan's cannot be. That is the
// premise, and because a premise is not a proof, IT IS NOT TRUSTED ON ITS OWN:
//
//   • only a document whose ink is `vector` reaches this path — a `raster` page
//     still reports `no-text-layer` and is still refused;
//   • every reader built on it MUST tie its rows to a figure the document itself
//     prints (see `hdfcNsdl.mjs`, which reproduces the printed Total Valuation to
//     the paisa and refuses the document otherwise). A number that cannot be
//     checked against the page's own arithmetic is not published;
//   • the provenance records `textSource: "ocr"` so no figure derived this way is
//     ever mistaken for a native read.
//
// ── SYSTEM DEPENDENCIES, AND DEGRADING WITHOUT THEM ─────────────────────────
//
// Needs `pdftoppm` (poppler-utils) and `tesseract`. Neither is an npm package and
// neither is present in CI — which costs nothing, because CI never re-extracts:
// it reads the committed archive and only checks that the book regenerates from
// it. Where they are absent this module reports so and the caller falls back to
// the `text-outlined-to-paths` diagnosis, which is exactly the state before OCR
// existed. It never guesses and never half-reads.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Render DPI. High enough that outlined glyphs rasterise without ambiguity. */
const DPI = 600;

/** True when both binaries are on PATH. */
export function ocrAvailable() {
  for (const bin of ["pdftoppm", "tesseract"]) {
    try { execFileSync("which", [bin], { stdio: "ignore" }); }
    catch { return false; }
  }
  return true;
}

/**
 * Tesseract's TSV, turned into the SAME item shape `itemsFrom` produces from
 * pdfjs — `{ x, y, width, height, text }` in PDF points.
 *
 * That equivalence is the whole design: the coordinate-aware machinery in
 * `layout.mjs` (row clustering, column inference from occupancy, the alignment
 * refinement, the number stitcher) then works on an OCR'd page exactly as it does
 * on a native one, and a reader written against one works against the other. No
 * separate "OCR table parser" exists to drift from the real one.
 *
 * TWO COORDINATE FACTS, and getting either wrong transposes the table:
 *   • tesseract measures in PIXELS from the TOP-left, y increasing DOWNWARD;
 *   • the layout engine expects PDF user space — points, origin bottom-left,
 *     y increasing UPWARD.
 * So y is flipped against the page height and both axes are divided by dpi/72.
 */
function itemsFromTsv(tsv, pageHeightPx, scale) {
  const lines = tsv.split("\n");
  const head = (lines[0] ?? "").split("\t");
  const col = (n) => head.indexOf(n);
  const iL = col("left"), iT = col("top"), iW = col("width"), iH = col("height");
  const iC = col("conf"), iX = col("text");
  if ([iL, iT, iW, iH, iC, iX].some((i) => i < 0)) return [];
  const out = [];
  for (const raw of lines.slice(1)) {
    const c = raw.split("\t");
    if (c.length <= iX) continue;
    const text = (c[iX] ?? "").trim();
    if (!text) continue;
    // A negative confidence is tesseract's marker for a non-word row (page,
    // block, paragraph and line records share the file with the words).
    const conf = Number(c[iC]);
    if (!Number.isFinite(conf) || conf < 0) continue;
    const left = Number(c[iL]), top = Number(c[iT]);
    const w = Number(c[iW]), h = Number(c[iH]);
    if (![left, top, w, h].every(Number.isFinite)) continue;
    out.push({
      x: left / scale,
      // Bottom edge of the word box, flipped into PDF space.
      y: (pageHeightPx - (top + h)) / scale,
      width: w / scale,
      height: h / scale,
      text,
      conf,
    });
  }
  return out;
}

/**
 * Render every page and OCR it.
 *
 * @returns {{ pages: Array<{number:number, widthPt:number, heightPt:number, items:Array}>,
 *             error: string|null, meanConfidence: number|null }}
 */
export function ocrDocument(bytes, opts = {}) {
  if (!ocrAvailable()) {
    return { pages: [], error: "pdftoppm and tesseract are required to read an outlined-text PDF and are not installed", meanConfidence: null };
  }
  const dpi = opts.dpi ?? DPI;
  const scale = dpi / 72;
  const dir = mkdtempSync(path.join(tmpdir(), "glow-ocr-"));
  try {
    const pdf = path.join(dir, "in.pdf");
    writeFileSync(pdf, bytes);
    // Greyscale: these are black text on white, and colour buys nothing but bytes.
    execFileSync("pdftoppm", ["-r", String(dpi), "-gray", "-png", pdf, path.join(dir, "p")], { stdio: "ignore" });
    const pngs = readdirSync(dir).filter((f) => f.startsWith("p") && f.endsWith(".png")).sort();
    const pages = [];
    let confSum = 0, confN = 0;
    for (let i = 0; i < pngs.length; i++) {
      const img = path.join(dir, pngs[i]);
      // `--psm 6` — a uniform block of text. These are single-table statements;
      // the default page-segmentation mode splits the table into columns and
      // emits them out of reading order, which the geometry then has to undo.
      const tsv = execFileSync("tesseract", [img, "stdout", "-l", "eng", "--psm", "6", "tsv"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
      const { width, height } = pngSize(readFileSync(img));
      const items = itemsFromTsv(tsv, height, scale);
      for (const it of items) { confSum += it.conf; confN++; }
      pages.push({ number: i + 1, widthPt: width / scale, heightPt: height / scale, items });
    }
    return { pages, error: null, meanConfidence: confN ? confSum / confN : null };
  } catch (e) {
    return { pages: [], error: e?.message ?? String(e), meanConfidence: null };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** PNG dimensions straight out of the IHDR chunk — no image library needed. */
function pngSize(buf) {
  // 8-byte signature, then a 4-byte length, "IHDR", width, height.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
