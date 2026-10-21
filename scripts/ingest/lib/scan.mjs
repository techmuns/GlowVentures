// A SCANNED STATEMENT, READ — and every figure on it checked by the page itself.
//
//   *"check and fix why these two files are unreadable … make sure no file in
//    future is left unread and no data in any file should be dropped,
//    everything should be read and wired into the dashboard correctly."*
//    — the family, 21 Oct 2026.
//
// Until now this book refused OCR on a photograph outright (`lib/ocr.mjs` reads
// OUTLINED text only), and Bharat Jaisinghani's HDFC NSDL statement — four
// photographed pages carrying 38 holdings, his 51,08,911 Polycab shares among
// them — sat in `acceptedUnread.mjs` as a file no reader could read. The family
// has now decided scans are read. The rule that made the refusal right still
// stands, and it is what this module is built around:
//
//   A FIGURE RECOVERED FROM A PHOTOGRAPH IS ONLY PUBLISHED WHERE THE PAGE ITSELF
//   CAN CHECK IT.
//
// A scan's information is lossy — sensor noise, skew, JPEG ringing — so OCR can
// misread a digit, and a wrong digit looks exactly like a right one. So the
// reader built on this module (`providers/nsdlScan.mjs`) publishes a row only
// when TWO INDEPENDENT PRINTINGS of it agree — NSDL's Statement of Holdings
// prints every quantity twice, `51,08,911` under Quantity and `5,108,911` under
// Total Balance, in different digit groupings — and its ISIN passes its own
// check digit. A document with any row the page cannot check is refused whole.
//
// ── HOW A PAGE IS READ ──────────────────────────────────────────────────────
//
//   1. Each page's raster is decoded by pdfjs (any image codec it supports —
//      JPEG, JPEG 2000, JBIG2, CCITT, Flate), so no image library is needed.
//   2. It is DESKEWED (the angle that maximises the row-projection energy of the
//      ink's top edges, measured inside the sheet so a scanner's shadow along
//      the paper's edge cannot win) and ENLARGED 2× — OCR reads 300-dpi text
//      with a small x-height far better at twice the size.
//   3. The whole page is OCR'd once (tesseract.js — the Tesseract engine
//      compiled to WebAssembly, so it runs the same on a laptop, CI and the
//      statement intake with nothing installed), giving every word and its box.
//   4. A reader then asks for specific cells again: a raw crop, and a CLEANED
//      one — Otsu ink, table rules and dotted guides removed, each line of
//      digit-height ink isolated and enlarged — read with a whitelist. Lone
//      small figures ("5", "27") inside a ruled box are what whole-page OCR
//      drops; isolated, they read.
//
// `GLOW_OCR=off` (CI) never runs this: a scan the archive has read is carried
// forward from it, exactly as a sealed statement is without its password.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageToGrid } from "./layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** The language data tesseract.js fetches once and keeps (git-ignored). */
const CACHE = path.join(ROOT, ".cache", "tesseract");
/** Enlargement before OCR. */
export const SCAN_SCALE = 2;
/** The engine, named on every document read through it. */
export const SCAN_ENGINE = "tesseract.js 5.1.1 (Tesseract LSTM, eng)";

let tesseract = null;
async function loadTesseract() {
  tesseract ??= await import("tesseract.js");
  return tesseract;
}

/** True where this run can read a scan at all. */
export async function scanOcrAvailable() {
  try { await loadTesseract(); return true; } catch { return false; }
}

// ── pixels ──────────────────────────────────────────────────────────────────

/** A decoded pdfjs image as 8-bit grey. */
function toGray(img) {
  const { width: w, height: h, data, kind } = img;
  const g = new Uint8Array(w * h);
  if (kind === 1) {
    // 1 bit per pixel, rows padded to a byte; a set bit is white.
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      g[y * w + x] = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
    }
  } else {
    const step = kind === 3 ? 4 : 3;
    for (let i = 0, j = 0; i < w * h; i++, j += step) g[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
  }
  return { w, h, g };
}

/** The skew, in degrees, from the top edges of ink inside the sheet. */
export function skewAngle({ w, h, g }) {
  const f = 4, sw = Math.floor(w / f), sh = Math.floor(h / f), pts = [];
  for (let y = Math.floor(sh * 0.08) + 1; y < sh * 0.92; y++) {
    for (let x = Math.floor(sw * 0.1); x < sw * 0.9; x++) {
      const v = g[(y * f) * w + x * f], up = g[((y - 1) * f) * w + x * f];
      if (v < 128 && up >= 160) pts.push(x, y);
    }
  }
  let best = 0, bestE = -1;
  const off = Math.floor(sh / 2);
  for (let k = -60; k <= 60; k++) {
    const a = k * 0.05, t = Math.tan((a * Math.PI) / 180), hist = new Float64Array(sh * 2 + 10);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = Math.round(pts[i + 1] - pts[i] * t) + off;
      if (yy >= 0 && yy < hist.length) hist[yy]++;
    }
    let e = 0;
    for (const v of hist) e += v * v;
    if (e > bestE) { bestE = e; best = a; }
  }
  return best;
}

/** Rotate by `deg` about the centre and enlarge by `s`, bilinear. */
function rotateScale({ w, h, g }, deg, s) {
  const W = Math.round(w * s), H = Math.round(h * s), out = new Uint8Array(W * H).fill(255);
  const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), cx = w / 2, cy = h / 2;
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const x0 = X / s - cx, y0 = Y / s - cy;
      const x = x0 * c - y0 * sn + cx, y = x0 * sn + y0 * c + cy;
      const xi = Math.floor(x), yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= w - 1 || yi >= h - 1) continue;
      const fx = x - xi, fy = y - yi, i = yi * w + xi;
      out[Y * W + X] = (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
    }
  }
  return { w: W, h: H, g: out };
}

const pgm = ({ w, h, g }) => Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), Buffer.from(g.buffer, g.byteOffset, g.length)]);

/**
 * One region of a page, CLEANED: Otsu ink, table rules (long straight runs) and
 * dotted guides (a column or row of specks spanning the region) removed, then
 * each line of digit-height ink cut out on its own, padded and enlarged — the
 * images whole-page OCR could not read a lone small figure from.
 */
function cleanBands(page, rect, lineHeight, up = 2) {
  const l = Math.max(0, Math.round(rect.left)), t = Math.max(0, Math.round(rect.top));
  const r = Math.min(page.w, Math.round(rect.right)), b = Math.min(page.h, Math.round(rect.bottom));
  const cw = r - l, ch = b - t;
  if (cw < 10 || ch < 10) return [];
  const px = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) px.set(page.g.subarray((t + y) * page.w + l, (t + y) * page.w + r), y * cw);
  const hist = new Array(256).fill(0);
  for (const v of px) hist[v]++;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let wB = 0, sB = 0, best = 0, thr = 128;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = px.length - wB;
    if (!wF) break;
    sB += v * hist[v];
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best) { best = between; thr = v; }
  }
  const ink = new Uint8Array(cw * ch);
  for (let i = 0; i < px.length; i++) ink[i] = px[i] <= thr ? 1 : 0;
  // Rules: a long straight run of ink. Text never is.
  for (let y = 0; y < ch; y++) {
    let run = 0;
    for (let x = 0; x <= cw; x++) {
      if (x < cw && ink[y * cw + x]) run++;
      else { if (run > cw * 0.35) for (let k = x - run; k < x; k++) ink[y * cw + k] = 0; run = 0; }
    }
  }
  for (let x = 0; x < cw; x++) {
    let run = 0;
    for (let y = 0; y <= ch; y++) {
      if (y < ch && ink[y * cw + x]) run++;
      else { if (run > ch * 0.6) for (let k = y - run; k < y; k++) ink[k * cw + x] = 0; run = 0; }
    }
  }
  // Dotted guides: a line of SPECKS across the whole region — many short runs,
  // none of them a stroke. A digit's stem crossing the guide is one long run,
  // so that column is left alone and the digit with it; its specks fall to the
  // size filter below.
  const dotted = (get, len) => {
    let runs = 0, longest = 0, run = 0, first = -1, last = -1;
    for (let i = 0; i <= len; i++) {
      if (i < len && get(i)) { run++; if (first < 0) first = i; last = i; }
      else if (run) { runs++; longest = Math.max(longest, run); run = 0; }
    }
    return runs >= 5 && longest < lineHeight * 0.3 && last - first >= len * 0.85;
  };
  for (let x = 0; x < cw; x++) if (dotted((y) => ink[y * cw + x], ch)) for (let y = 0; y < ch; y++) ink[y * cw + x] = 0;
  for (let y = 0; y < ch; y++) if (dotted((x) => ink[y * cw + x], cw)) for (let x = 0; x < cw; x++) ink[y * cw + x] = 0;
  // Components: a character is a blob of text height; what is left of a guide is specks.
  const lab = new Int32Array(cw * ch), comps = [];
  for (let s0 = 0; s0 < ink.length; s0++) {
    if (!ink[s0] || lab[s0]) continue;
    const id = comps.length + 1, st = [s0];
    lab[s0] = id;
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0, n = 0;
    while (st.length) {
      const k = st.pop(), x = k % cw, y = (k - x) / cw;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x + 1 < cw && ink[k + 1] && !lab[k + 1]) { lab[k + 1] = id; st.push(k + 1); }
      if (x > 0 && ink[k - 1] && !lab[k - 1]) { lab[k - 1] = id; st.push(k - 1); }
      if (y + 1 < ch && ink[k + cw] && !lab[k + cw]) { lab[k + cw] = id; st.push(k + cw); }
      if (y > 0 && ink[k - cw] && !lab[k - cw]) { lab[k - cw] = id; st.push(k - cw); }
    }
    comps.push({ id, x0, y0, x1, y1, n });
  }
  const LH = lineHeight;
  const chars = comps.filter((c) => c.y1 - c.y0 >= LH * 0.5 && c.y1 - c.y0 <= LH * 1.6 && c.x1 - c.x0 <= LH * 1.4)
    .sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const bands = [];
  for (const c of chars) {
    const cy = (c.y0 + c.y1) / 2, last = bands.at(-1);
    if (last && Math.abs(cy - last.cy) < LH * 0.6) last.cs.push(c);
    else bands.push({ cy, cs: [c] });
  }
  const images = [];
  for (const band of bands) {
    const bx0 = Math.min(...band.cs.map((c) => c.x0)), bx1 = Math.max(...band.cs.map((c) => c.x1));
    const by0 = Math.min(...band.cs.map((c) => c.y0)), by1 = Math.max(...band.cs.map((c) => c.y1));
    // Everything inside the band stays — commas and decimal points are small.
    const keep = new Set(comps.filter((c) => c.y0 >= by0 - LH * 0.3 && c.y1 <= by1 + LH * 0.5
      && c.x0 >= bx0 - LH * 0.6 && c.x1 <= bx1 + LH * 0.6 && c.n >= 6).map((c) => c.id));
    const L = Math.max(0, Math.floor(bx0 - LH)), T = Math.max(0, Math.floor(by0 - LH * 0.5));
    const R = Math.min(cw, Math.ceil(bx1 + LH)), B = Math.min(ch, Math.ceil(by1 + LH * 0.6));
    const pad = 20, OW = (R - L + 2 * pad) * up, OH = (B - T + 2 * pad) * up, out = new Uint8Array(OW * OH).fill(255);
    for (let y = T; y < B; y++) {
      for (let x = L; x < R; x++) {
        if (!keep.has(lab[y * cw + x])) continue;
        for (let dy = 0; dy < up; dy++) for (let dx = 0; dx < up; dx++) out[((y - T + pad) * up + dy) * OW + (x - L + pad) * up + dx] = 0;
      }
    }
    images.push(pgm({ w: OW, h: OH, g: out }));
  }
  return images;
}

// ── the document ────────────────────────────────────────────────────────────

/** Each page's largest raster, decoded to grey. */
async function pageRasters(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const IMAGE = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintJpegXObject, pdfjs.OPS.paintImageXObjectRepeat].filter((x) => x !== undefined));
  const out = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      let best = null;
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (!IMAGE.has(ops.fnArray[i])) continue;
        const name = ops.argsArray[i][0];
        const store = String(name).startsWith("g_") ? page.commonObjs : page.objs;
        const img = await new Promise((resolve) => store.get(name, resolve));
        if (img?.data && (!best || img.width * img.height > best.width * best.height)) best = img;
      }
      out.push({ number: n, widthPt: view.width, heightPt: view.height, gray: best ? toGray(best) : null });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
}

/**
 * Tesseract's TSV, as words in the enlarged page's pixels. Its columns are fixed
 * — level, page, block, paragraph, line, word, left, top, width, height,
 * confidence, text — and tesseract.js prints no header row; one is honoured if
 * present.
 */
function wordsFromTsv(tsv) {
  const lines = String(tsv ?? "").split("\n");
  const head = (lines[0] ?? "").split("\t");
  const named = head[0] === "level";
  const at = (k, fixed) => (named ? head.indexOf(k) : fixed);
  const [iL, iT, iW, iH, iC, iX] = [["left", 6], ["top", 7], ["width", 8], ["height", 9], ["conf", 10], ["text", 11]].map(([k, i]) => at(k, i));
  const out = [];
  for (const raw of named ? lines.slice(1) : lines) {
    const c = raw.split("\t");
    const text = (c[iX] ?? "").trim();
    if (!text || !(Number(c[iC]) >= 0)) continue;
    out.push({ x: Number(c[iL]), y: Number(c[iT]), w: Number(c[iW]), h: Number(c[iH]), conf: Number(c[iC]), text });
  }
  return out;
}

/**
 * Open a scanned PDF for reading. Every page is decoded, deskewed, enlarged and
 * OCR'd once; the returned session answers a reader's requests for single cells
 * until it is closed.
 *
 * @returns {Promise<{ pages: Array, readCell: Function, readCellClean: Function, grids: Function,
 *                     meanConfidence: number|null, close: Function }>}
 */
export async function openScan(bytes) {
  const { createWorker } = await loadTesseract();
  const rasters = await pageRasters(bytes);
  if (!rasters.length || rasters.some((r) => !r.gray)) throw new Error("a page of this scan carries no image pdfjs can decode");
  const worker = await createWorker("eng", 1, { cachePath: CACHE, logger: () => {}, errorHandler: () => {} });
  const base = { preserve_interword_spaces: "1" };
  const set = (p) => worker.setParameters({ ...base, ...p });
  try {
    const pages = [];
    let confSum = 0, confN = 0;
    for (const r of rasters) {
      const skew = skewAngle(r.gray);
      const img = rotateScale(r.gray, skew, SCAN_SCALE);
      const bytesPgm = pgm(img);
      await set({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
      const { data } = await worker.recognize(bytesPgm, {}, { tsv: true, text: false });
      const words = wordsFromTsv(data.tsv);
      for (const w of words) { confSum += w.conf; confN++; }
      pages.push({ number: r.number, widthPt: r.widthPt, heightPt: r.heightPt, skew, w: img.w, h: img.h, g: img.g, pgm: bytesPgm, words });
    }
    const lines = (text) => String(text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    return {
      pages,
      meanConfidence: confN ? confSum / confN : null,
      /** A raw crop of one page, read in each of `psms`; every non-empty line. */
      async readCell(page, rect, { whitelist = "", psms = ["7", "6"] } = {}) {
        const left = Math.max(0, Math.round(rect.left)), top = Math.max(0, Math.round(rect.top));
        const width = Math.min(page.w, Math.round(rect.right)) - left, height = Math.min(page.h, Math.round(rect.bottom)) - top;
        if (width < 12 || height < 12) return [];
        const out = [];
        for (const psm of psms) {
          await set({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
          const { data } = await worker.recognize(page.pgm, { rectangle: { left, top, width, height } });
          out.push(...lines(data.text));
        }
        return out;
      },
      /** The same region cleaned and cut into lines of characters (`cleanBands`). */
      async readCellClean(page, rect, lineHeight, { whitelist = "", psms = ["7", "8", "6"] } = {}) {
        const out = [];
        for (const band of cleanBands(page, rect, lineHeight)) {
          for (const psm of psms) {
            await set({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
            const { data } = await worker.recognize(band);
            out.push(...lines(data.text));
          }
        }
        return out;
      },
      /**
       * The pages as layout grids — the same shape a text-layer page produces —
       * in the order `order` gives (a page's printed number), for the
       * classifier, the archive's page text and any reader that reads text.
       */
      grids(order = pages.map((p) => p.number)) {
        return order.map((n, i) => {
          const p = pages.find((x) => x.number === n);
          const ptPerPx = p.widthPt / p.w;
          const items = p.words.map((wd) => ({
            x: wd.x * ptPerPx, y: (p.h - (wd.y + wd.h)) * ptPerPx, width: wd.w * ptPerPx, height: wd.h * ptPerPx, text: wd.text,
          }));
          return pageToGrid(i + 1, { width: p.widthPt, height: p.heightPt, rotation: 0 }, items);
        });
      },
      async close() { await worker.terminate(); },
    };
  } catch (e) {
    await worker.terminate();
    throw e;
  }
}

/**
 * A quantity as printed, and what OCR may have made of it. `7.250` is 7.25 if
 * the point is a decimal, and 7,250 if a comma lost its tail — both are kept,
 * and the other printed cell decides.
 */
export function quantityReadings(s) {
  const t = String(s ?? "").replace(/\s+/g, "").replace(/[^\d,.]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!/^\d[\d,.]*$/.test(t)) return [];
  const out = new Set();
  if (/^\d[\d,]*(\.\d+)?$/.test(t)) out.add(Number(t.replace(/,/g, "")));
  // Only a lone `d.ddd` is ambiguous; `9,90,429.684` has its commas and its point is a point.
  if (/^\d{1,3}\.\d{3}$/.test(t)) out.add(Number(t.replace(".", "")));
  return [...out].filter((v) => Number.isFinite(v) && v > 0);
}
