// Coordinate-aware table extraction.
//
// WHY THIS EXISTS. The hand-rolled reader in ./pdf.mjs can recover a document's
// words but not their positions, and without positions these tables cannot be
// read: the report engines emit cells in paint order, not reading order, so a
// flat text dump interleaves columns (`-33.7912,500 3,575,346 ...`) and splits
// figures mid-number across spans and lines (`2,037,517.` then `00`). Any
// line-based regex over that produces numbers that are wrong and look right.
//
// So the table path goes through pdfjs-dist's `getTextContent()`, which returns
// a transform matrix per text item. x is transform[4], y is transform[5] (PDF
// user space: origin bottom-left, so y DESCENDS down the page). From those we
// rebuild the grid geometrically:
//
//   1. cluster items into ROWS by y, with a tolerance that absorbs sub-pixel
//      drift and superscripts without swallowing the next line;
//   2. infer COLUMN boundaries once across the whole region — never per row,
//      because a right-aligned money column's left edge moves with the width of
//      each value and per-row inference would invent a new column per row;
//   3. stitch figures split across spans and across lines, but only where the
//      join yields ONE well-formed number.
//
// Everything it could not do confidently is recorded rather than smoothed over:
// see `stitches` and `warnings` on the returned page.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseNumInfo } from "./parseNum.mjs";

/** pdfjs is loaded lazily so importing this module stays cheap for callers that only need types. */
let _pdfjs = null;
async function pdfjs() {
  if (!_pdfjs) _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return _pdfjs;
}

/**
 * Where pdfjs looks for metrics for the 14 standard PDF fonts, when a document
 * uses Helvetica/Times without embedding it. Widths are what column inference
 * measures, so these matter — but pdfjs-dist v6 ships Foxit `.pfb` files while
 * pdfjs requests `.ttf`, so the lookup misses and pdfjs falls back to its
 * built-in metrics. Those are correct for the standard 14 (verified in
 * __tests__/layout.test.mjs, whose fixtures use non-embedded Helvetica), so the
 * path is still supplied for installs that do carry the files, and `verbosity`
 * below silences the per-file miss.
 */
function standardFontDataUrl() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return pathToFileURL(path.resolve(here, "../../../node_modules/pdfjs-dist/standard_fonts/")).href + "/";
}

export const DEFAULTS = {
  /** Extra y-slack beyond the adaptive tolerance, in points. */
  rowTolerance: null,        // null = derive from item heights
  /** Minimum blank horizontal run that separates two columns, in points. */
  minColumnGap: 6,
  /** A row whose y-gap to the previous row is below this FRACTION of the median
   *  gap is treated as a wrapped continuation, not a new record. */
  continuationRatio: 0.6,
  /** Bucket size for the horizontal occupancy histogram, in points. */
  bucket: 1,
};

// ── 1. Items ─────────────────────────────────────────────────────────────────

/** Raw positioned text items for one page, whitespace-only spans dropped. */
function itemsFrom(textContent) {
  const out = [];
  for (const it of textContent.items) {
    if (typeof it.str !== "string") continue;
    const text = it.str.replace(/\s+/g, " ").trim();
    if (!text) continue;                       // pdfjs emits synthetic spacer spans
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const height = Math.abs(Number(it.height)) || Math.abs(t[3]) || 9;
    const width = Math.abs(Number(it.width)) || text.length * height * 0.5;
    out.push({ x: t[4], y: t[5], width, height, text });
  }
  return out;
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── 2. Rows ──────────────────────────────────────────────────────────────────

/**
 * Group items into visual rows by y.
 *
 * The tolerance is derived from the text height rather than fixed: a superscript
 * or a smaller unit label sits a few points off its baseline and belongs to the
 * same row, while the next line is a full line-height away. The row's
 * representative y is the y carrying the most TEXT, so a lone superscript
 * cannot drag a row's position.
 */
export function clusterRows(items, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!items.length) return [];
  const tol = o.rowTolerance ?? Math.max(1.5, median(items.map((i) => i.height)) * 0.5);

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let cur = null;
  for (const it of sorted) {
    if (cur && Math.abs(it.y - cur.anchor) <= tol) {
      cur.items.push(it);
      // Re-anchor on the item carrying the most text, so the baseline wins.
      if (it.text.length > cur.anchorWeight) { cur.anchor = it.y; cur.anchorWeight = it.text.length; }
    } else {
      cur = { anchor: it.y, anchorWeight: it.text.length, items: [it] };
      rows.push(cur);
    }
  }
  return rows.map((r) => ({
    y: r.anchor,
    items: r.items.sort((a, b) => a.x - b.x),
  }));
}

// ── 3. Columns ───────────────────────────────────────────────────────────────

/**
 * Infer column spans from a horizontal occupancy histogram over ALL rows.
 *
 * Every item paints the span [x, x+width]. Columns are the occupied runs;
 * separators are blank runs at least `minColumnGap` wide. Doing this globally is
 * the whole point — a right-aligned money column has a ragged left edge, so its
 * identity comes from the blank corridor beside it, which only exists when you
 * look at every row at once.
 */
export function inferColumns(rows, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const items = rows.flatMap((r) => r.items);
  if (!items.length) return [];

  const minX = Math.min(...items.map((i) => i.x));
  const maxX = Math.max(...items.map((i) => i.x + i.width));
  const n = Math.max(1, Math.ceil((maxX - minX) / o.bucket) + 1);
  const occ = new Uint32Array(n);
  for (const it of items) {
    const a = Math.max(0, Math.floor((it.x - minX) / o.bucket));
    const b = Math.min(n - 1, Math.ceil((it.x + it.width - minX) / o.bucket));
    for (let k = a; k <= b; k++) occ[k]++;
  }

  const spans = [];
  let start = null, gap = 0;
  for (let k = 0; k < n; k++) {
    if (occ[k] > 0) {
      if (start == null) start = k;
      gap = 0;
    } else if (start != null) {
      gap++;
      if (gap * o.bucket >= o.minColumnGap) {
        spans.push([minX + start * o.bucket, minX + (k - gap + 1) * o.bucket]);
        start = null; gap = 0;
      }
    }
  }
  if (start != null) spans.push([minX + start * o.bucket, maxX]);

  const columns = spans.map(([x0, x1], i) => ({ index: i, x0, x1, center: (x0 + x1) / 2 }));
  // Right edges first (money columns), then left edges (text columns) over
  // whatever is still merged. Both are alignment evidence the blank-corridor
  // pass cannot see.
  return splitByAlignedEdges(splitByAlignedEdges(columns, rows, o, "right"), rows, o, "left");
}

/**
 * Split a column that blank corridors could not separate, using ALIGNED EDGES.
 *
 * A column's alignment edge is a far stronger signal than the gap beside it,
 * because the gap can vanish entirely while the alignment never moves:
 *
 *   • RIGHT edges — money columns are right-aligned, so every value in a column
 *     ends on the same x to a fraction of a point. Green Lantern's widest gain
 *     figure runs to 485.0 while the percentage beside it starts at 488, and one
 *     long row closes that 3pt corridor completely, merging "Gain / Loss" and
 *     "% G/L" into a single cell.
 *   • LEFT edges — text columns are left-aligned and behave the same way in
 *     mirror. On the fact sheet a long security name ("Tenneco Clean Air India
 *     Ltd.") reaches the x where the Sector column starts, closing that corridor
 *     and merging the two.
 *
 * Lowering the gap threshold far enough to catch either would start splitting
 * columns internally. Instead: within each inferred column, cluster the item
 * edges on the given side; if two or more well-separated edges each account for
 * a substantial share of the rows, the column is really several columns and is
 * split between them.
 *
 * A column aligned on the OTHER side is ragged on this one and forms no such
 * cluster, so it is left alone — which is why the share threshold and the
 * minimum separation both matter, and why running both passes is safe.
 */
/**
 * How strongly is this column aligned on `side`? The share of its items sitting
 * on the single most popular edge there, 0..1.
 *
 * Used to tell which side carries the alignment: a right-aligned money column
 * scores near 1 on the right and low on the left, and cutting it along the left
 * would slice through the figures.
 */
function edgeDominance(rows, col, side, tol = 1.5) {
  const edges = [];
  for (const r of rows) {
    for (const it of r.items) {
      const mid = it.x + it.width / 2;
      if (mid >= col.x0 && mid <= col.x1) edges.push(side === "right" ? it.x + it.width : it.x);
    }
  }
  if (edges.length < 4) return 0;
  edges.sort((a, b) => a - b);
  let best = 0, run = 0, anchor = -Infinity;
  for (const e of edges) {
    if (e - anchor <= tol) run++;
    else { run = 1; anchor = e; }
    if (run > best) best = run;
  }
  return best / edges.length;
}

function splitByAlignedEdges(columns, rows, o, side) {
  const EDGE_TOL = 1.5;        // points; edges of one column agree this closely
  const MIN_SEPARATION = 8;    // points; closer than this is one column, not two
  const MIN_SHARE = 0.25;      // a real column holds a value on at least this share of rows

  const out = [];
  for (const col of columns) {
    const edges = [];
    for (const r of rows) {
      for (const it of r.items) {
        const mid = it.x + it.width / 2;
        if (mid >= col.x0 && mid <= col.x1) edges.push(side === "right" ? it.x + it.width : it.x);
      }
    }
    if (edges.length < 4) { out.push(col); continue; }

    // Never cut a column along the side it is NOT aligned to.
    //
    // A right-aligned money column has ragged left edges — but not RANDOM ones:
    // values with the same digit count share a width and so share a left edge,
    // and two such groups can each clear the share threshold and fake a column
    // boundary through the middle of the figures. So compare the two sides and
    // decline when the OTHER one carries the stronger alignment; a genuinely
    // merged pair of columns scores about half on each side and still splits.
    if (edgeDominance(rows, col, side === "right" ? "left" : "right") > edgeDominance(rows, col, side)) {
      out.push(col);
      continue;
    }

    edges.sort((a, b) => a - b);
    const clusters = [];
    for (const e of edges) {
      const last = clusters[clusters.length - 1];
      if (last && e - last.edge <= EDGE_TOL) { last.count++; last.edge = e; }
      else clusters.push({ edge: e, count: 1 });
    }
    const strong = clusters.filter((c) => c.count >= Math.max(3, edges.length * MIN_SHARE));
    // Keep only clusters far enough apart to be distinct columns.
    const kept = strong.filter((c, i) => i === 0 || c.edge - strong[i - 1].edge >= MIN_SEPARATION);
    if (kept.length < 2) { out.push(col); continue; }

    let x0 = col.x0;
    kept.forEach((c, i) => {
      if (i === kept.length - 1) { out.push({ x0, x1: col.x1 }); return; }
      // A right-aligned column ends at its edge, so the boundary goes midway to
      // the next one. A left-aligned column STARTS at its edge, so the boundary
      // goes immediately before the next column's start — putting it midway
      // would cut the tail off every name that runs long, which is the very case
      // this pass exists to handle.
      const x1 = side === "right" ? (c.edge + kept[i + 1].edge) / 2 : kept[i + 1].edge - 1;
      out.push({ x0, x1 });
      x0 = x1;
    });
  }
  return out.map((c, i) => ({ index: i, x0: c.x0, x1: c.x1, center: (c.x0 + c.x1) / 2 }));
}

/** Column whose span best overlaps an item; falls back to nearest centre. */
function columnFor(columns, it) {
  let best = -1, bestOverlap = 0;
  const a = it.x, b = it.x + it.width;
  for (const c of columns) {
    const ov = Math.min(b, c.x1) - Math.max(a, c.x0);
    if (ov > bestOverlap) { bestOverlap = ov; best = c.index; }
  }
  if (best >= 0) return best;
  let nearest = 0, dist = Infinity;
  const mid = (a + b) / 2;
  for (const c of columns) {
    const d = Math.abs(c.center - mid);
    if (d < dist) { dist = d; nearest = c.index; }
  }
  return nearest;
}

// ── 4. Cells and stitching ───────────────────────────────────────────────────

/** Only these characters may appear in a cell we are willing to de-space. */
const NUMERIC_CHARS = /^[\d.,()%+\-\s]+$/;

/**
 * Join a cell's fragments.
 *
 * A figure broken mid-number arrives as `3,440, 425.00` — sometimes as two text
 * items, and sometimes as ONE item that pdfjs already merged with a space, so
 * this decides from the assembled text rather than from how many pieces it came
 * in as.
 *
 * Three guards keep it from fusing two genuinely separate values:
 *   • the spaced form must not already be a valid number;
 *   • the cell must contain nothing but digits and numeric punctuation, so a
 *     name is never de-spaced;
 *   • the de-spaced form must parse as ONE well-formed number, which the
 *     grouping validator in parseNum enforces — that is what rejects
 *     `-33.79 12,500` (→ `-33.7912,500`, a comma after the decimal point).
 *
 * Note the residual risk this cannot cover: if column inference wrongly put two
 * columns in one cell AND their values happen to concatenate into valid
 * grouping, the join would be wrong. Every stitch is therefore recorded on the
 * page and surfaced in the extraction report rather than applied silently.
 */
function joinCell(parts) {
  const spaced = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!spaced.includes(" ")) return { text: spaced, stitched: false };
  if (parseNumInfo(spaced).status === "ok") return { text: spaced, stitched: false };
  if (!NUMERIC_CHARS.test(spaced)) return { text: spaced, stitched: false };
  const tight = spaced.replace(/\s+/g, "");
  if (parseNumInfo(tight).status === "ok") return { text: tight, stitched: true };
  return { text: spaced, stitched: false };
}

function buildCells(row, columns) {
  const byCol = new Map();
  for (const it of row.items) {
    const ci = columnFor(columns, it);
    const bucket = byCol.get(ci) ?? [];
    bucket.push(it);
    byCol.set(ci, bucket);
  }
  const cells = [];
  const stitches = [];
  for (const [ci, its] of [...byCol.entries()].sort((a, b) => a[0] - b[0])) {
    its.sort((a, b) => a.x - b.x);
    const { text, stitched } = joinCell(its.map((i) => i.text));
    if (stitched) stitches.push({ kind: "same-line", column: ci, y: row.y, parts: its.map((i) => i.text), joined: text });
    cells.push({ x: its[0].x, column: ci, text });
  }
  return { cells, stitches };
}

/**
 * Merge wrapped continuation lines into the row above.
 *
 * A figure can break across LINES — `14,580,412.` on one and `51` on the next.
 * A continuation is identified geometrically: it sits much closer to the row
 * above than a normal line gap and carries only a fragment or two. The merge is
 * then applied only where the join produces one well-formed number, so a genuine
 * short row (a total line, a single-column note) is left alone.
 */
function mergeContinuations(rows, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (rows.length < 2) return { rows, stitches: [] };
  const gaps = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i - 1].y - rows[i].y);
  const normal = median(gaps.filter((g) => g > 0));
  if (!(normal > 0)) return { rows, stitches: [] };

  const out = [];
  const stitches = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    const gap = prev ? prev.y - row.y : Infinity;
    const isFragment =
      prev &&
      gap > 0 && gap < normal * o.continuationRatio &&
      row.cells.length <= 2 &&
      row.cells.length < prev.cells.length &&
      row.cells.every((c) => /^[\d.,%()-]+$/.test(c.text));
    if (!isFragment) { out.push(row); continue; }

    let mergedAny = false;
    for (const frag of row.cells) {
      const target = prev.cells.find((c) => c.column === frag.column);
      if (!target) continue;
      const joined = (target.text + frag.text).replace(/\s+/g, "");
      if (parseNumInfo(joined).status !== "ok") continue;
      stitches.push({ kind: "cross-line", column: frag.column, y: prev.y, parts: [target.text, frag.text], joined });
      target.text = joined;
      mergedAny = true;
    }
    // A fragment row nothing could absorb stays a row of its own rather than
    // being dropped — losing a line silently is how a total goes missing.
    if (!mergedAny) out.push(row);
  }
  return { rows: out, stitches };
}

// ── 5. Public API ────────────────────────────────────────────────────────────

/**
 * Extract one page as a geometric grid.
 * @returns {{ page:number, width:number, height:number,
 *             columns:Array<{index:number,x0:number,x1:number}>,
 *             rows:Array<{y:number, cells:Array<{x:number,column:number,text:string}>}>,
 *             stitches:Array<object>, text:string }}
 */
export function pageToGrid(pageNumber, viewport, items, opts = {}) {
  const rawRows = clusterRows(items, opts);
  // Page-wide columns: right for scanning labels and headings, WRONG for
  // reading a table — see `regrid`.
  const columns = inferColumns(rawRows, opts);
  const withCells = [];
  const allStitches = [];
  for (const r of rawRows) {
    const { cells, stitches } = buildCells(r, columns);
    allStitches.push(...stitches);
    // `items` are retained so a table region can be re-gridded against its own
    // column geometry once its extent is known.
    withCells.push({ y: r.y, items: r.items, cells });
  }
  const merged = mergeContinuations(withCells, opts);
  allStitches.push(...merged.stitches);
  return {
    page: pageNumber,
    width: viewport?.width ?? 0,
    height: viewport?.height ?? 0,
    columns,
    rows: merged.rows,
    stitches: allStitches,
    // Reading-order text, for provenance (public/audit/<docKey>/pages.json).
    text: merged.rows.map((r) => r.cells.map((c) => c.text).join("  ")).join("\n"),
  };
}

/**
 * Re-infer columns over ONE TABLE REGION and rebuild its cells.
 *
 * This is the difference between reading a table and mangling it. Column
 * boundaries come from blank vertical corridors, and a page title or an address
 * block spans the full width — "GOLDSTANDARD WEALTH PRIVATE LIMITED" painted
 * across the top of the page bridges the corridor between the security column
 * and the quantity column, and every row then reads as one merged cell. Columns
 * must therefore be inferred from the header row and the body rows ONLY, which
 * is what this does once the caller has located the table's extent.
 *
 * @param {Array<{y:number, items:Array}>} rowSlice  header row first, then body
 * @returns {{ columns:Array, rows:Array<{y:number, items:Array, cells:Array}>, stitches:Array }}
 */
export function regrid(rowSlice, opts = {}) {
  if (!rowSlice.length) return { columns: [], rows: [], stitches: [] };
  // Columns may be measured from a SUBSET of the slice — see `measureFrom`. The
  // header is the usual thing to exclude: report engines merge adjacent header
  // labels into one text span ("Market Value Gain / Loss (+/-)"), and that span
  // bridges the blank corridor between two data columns and collapses them.
  // The body rows carry the true geometry.
  const columns = inferColumns(opts.measureFrom ?? rowSlice, opts);
  const stitches = [];
  const rebuilt = rowSlice.map((r) => {
    const { cells, stitches: s } = buildCells(r, columns);
    stitches.push(...s);
    return { y: r.y, items: r.items, cells };
  });
  const merged = mergeContinuations(rebuilt, opts);
  return { columns, rows: merged.rows, stitches: [...stitches, ...merged.stitches] };
}

/**
 * Read a whole PDF into per-page grids.
 * @param {Uint8Array|Buffer} bytes
 * @returns {Promise<{ pages: Array<object>, numPages: number, error: string|null }>}
 */
export async function extractLayout(bytes, opts = {}) {
  const { getDocument } = await pdfjs();
  const pages = [];
  let doc = null;
  try {
    doc = await getDocument({
      data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      disableFontFace: true,
      useSystemFonts: false,
      standardFontDataUrl: standardFontDataUrl(),
      // Errors only. A missing standard-font file is reported per document and
      // would otherwise drown the run; real read failures still surface through
      // the catch below and land in the extraction report's coverage section.
      verbosity: 0,
      // These statements are text-layer PDFs; nothing here needs to render.
      isEvalSupported: false,
    }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      pages.push(pageToGrid(p, viewport, itemsFrom(tc), opts));
      page.cleanup();
    }
    return { pages, numPages: doc.numPages, error: null };
  } catch (e) {
    return { pages, numPages: pages.length, error: e?.message ?? String(e) };
  } finally {
    try { await doc?.destroy(); } catch { /* already gone */ }
  }
}

/** Cells of a row as plain strings, column-ordered. */
export const rowText = (row) => row.cells.map((c) => c.text);

/** First row whose joined text matches — for locating a table's header. */
export function findRow(pageGrid, re, from = 0) {
  for (let i = from; i < pageGrid.rows.length; i++) {
    if (re.test(rowText(pageGrid.rows[i]).join(" "))) return i;
  }
  return -1;
}
