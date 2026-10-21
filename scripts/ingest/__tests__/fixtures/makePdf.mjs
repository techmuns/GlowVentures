// Builds a minimal, valid PDF with text painted at EXACT coordinates.
//
// The layout tests need input whose geometry is known independently of any real
// statement — otherwise a passing test only proves the extractor agrees with
// itself. Content streams are Flate-compressed, matching how the real reports
// are produced, so the decode path is exercised too.
import { deflateSync } from "node:zlib";

/**
 * @param {Array<[number, number, string]>} spans  [x, y, text] in PDF user space
 *        (origin bottom-left), painted in the order given.
 * @param {{fontSize?: number}} [opts]
 * @returns {Uint8Array}
 */
export function makeGridPdf(spans, opts = {}) {
  return makeMultiPagePdf([spans], opts);
}

/** Same, for several pages. */
export function makeMultiPagePdf(pages, opts = {}) {
  const fontSize = opts.fontSize ?? 9;
  const box = opts.mediaBox ?? [0, 0, 612, 792];
  const objs = new Map();
  const kids = [];
  let next = 3;
  const pageObjs = [];
  for (let i = 0; i < pages.length; i++) {
    const pid = next++, cid = next++;
    pageObjs.push([pid, cid]);
    kids.push(`${pid} 0 R`);
  }
  const fontId = next;

  objs.set(1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"));
  objs.set(2, Buffer.from(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`));

  pages.forEach((spans, i) => {
    const [pid, cid] = pageObjs[i];
    objs.set(pid, Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [${box.join(" ")}] /Contents ${cid} 0 R ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`));
    const ops = [`BT /F1 ${fontSize} Tf`];
    for (const [x, y, text] of spans) {
      const esc = String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      ops.push(`1 0 0 1 ${x} ${y} Tm (${esc}) Tj`);
    }
    ops.push("ET");
    const body = deflateSync(Buffer.from(ops.join("\n"), "latin1"));
    objs.set(cid, Buffer.concat([
      Buffer.from(`<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`),
      body,
      Buffer.from("\nendstream"),
    ]));
  });
  objs.set(fontId, Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));

  const chunks = [Buffer.from("%PDF-1.4\n")];
  let len = chunks[0].length;
  const offsets = new Map();
  for (const num of [...objs.keys()].sort((a, b) => a - b)) {
    offsets.set(num, len);
    const piece = Buffer.concat([Buffer.from(`${num} 0 obj\n`), objs.get(num), Buffer.from("\nendobj\n")]);
    chunks.push(piece);
    len += piece.length;
  }
  const xrefAt = len;
  const max = Math.max(...objs.keys()) + 1;
  let xref = `xref\n0 ${max}\n0000000000 65535 f \n`;
  for (let n = 1; n < max; n++) xref += `${String(offsets.get(n) ?? 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${max} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * A page carrying INK BUT NO TEXT — the two ways that happens in this corpus.
 *
 * `classifyInk` in lib/layout.mjs tells them apart so `noTextLayer` can give the
 * right diagnosis, and the difference is only visible on the operator list: a
 * raw byte search for /Font or /DCTDecode finds neither in a PDF 1.7 file that
 * puts them inside compressed object streams.
 *
 * @param {"vector"|"raster"} kind
 *   "vector" — filled bezier paths, which is what a glyph converted to outlines
 *              looks like (source/august-2026-f/'s two HDFC NSDL statements);
 *   "raster" — an inline image, which is what a scan looks like
 *              (source/august-2026-e/HOLDING STATEMENT AS ON 31 MARCH 2026.pdf).
 */
export function makeInkPdf(kind) {
  const ops = kind === "raster"
    // 2x2 8-bit greyscale inline image, scaled over the page.
    ? "q 200 0 0 200 60 500 cm BI /W 2 /H 2 /CS /G /BPC 8 ID \x00\xff\xff\x00 EI Q"
    // One filled curve plus one filled triangle: no text operator anywhere.
    : [
        "q 0 0 0 rg",
        "100 700 m 120 740 160 740 180 700 c 180 690 100 690 100 700 c h f",
        "300 700 m 340 740 l 380 700 l h f",
        "Q",
      ].join("\n");
  const body = deflateSync(Buffer.from(ops, "latin1"));
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>",
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")];
  let len = chunks[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    const b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`);
    offsets.push(len); chunks.push(b); len += b.length;
  });
  const stream = Buffer.concat([
    Buffer.from(`4 0 obj\n<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`),
    body,
    Buffer.from("\nendstream\nendobj\n"),
  ]);
  offsets.push(len); chunks.push(stream); len += stream.length;
  const xref = [`xref\n0 5\n0000000000 65535 f \n`,
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(chunks));
}
