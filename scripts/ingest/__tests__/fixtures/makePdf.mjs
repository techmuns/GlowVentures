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
