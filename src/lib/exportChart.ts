// Export a rendered chart as a PNG — the spec's "export charts".
//
// The Excel exporter already carries the data tables and the comparison tables,
// and the print stylesheet carries charts inside a PDF of the whole page. What
// was missing is the chart on its own, as a file you can drop into a deck or an
// email.
//
// A CHART THAT LEAVES THIS APP LOSES EVERYTHING AROUND IT. On screen a chart
// sits under a title, beside a basis pill, above a provenance line. As a bare
// PNG it is a shape with some numbers, and the reader has no way to know what
// it measures, in what unit, from when, or whether it is on live prices or
// statement marks. So this does not export the plot alone: it draws a CAPTION
// BAND with the title, the unit, the source and the as-of into the image
// itself. The same reasoning as the review deck's per-slide footer — an
// artefact that travels must carry its own context.
//
// NO DEPENDENCY. Recharts renders SVG; the browser can rasterise SVG through a
// canvas. The one real difficulty is that the chart is styled with CSS custom
// properties (`var(--chart-grid)`) and a serialized SVG has no stylesheet, so
// every colour would resolve to black. Computed styles are therefore copied
// onto the clone before serialising.

/** Properties that decide how the plot LOOKS. Copied from computed style. */
const COPIED = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity",
  "opacity", "font-family", "font-size", "font-weight", "text-anchor", "color",
];

/**
 * Copy resolved styles from the live tree onto the clone.
 *
 * Walked in parallel rather than by selector: the two trees are structurally
 * identical because one is a clone of the other, and matching by index is exact
 * where a selector would be ambiguous across repeated `<path>` elements.
 */
function inlineStyles(source: Element, clone: Element) {
  const cs = getComputedStyle(source);
  let css = "";
  for (const prop of COPIED) {
    const v = cs.getPropertyValue(prop);
    if (v && v !== "none" && v !== "normal") css += `${prop}:${v};`;
  }
  if (css) clone.setAttribute("style", css);
  const sk = source.children;
  const ck = clone.children;
  for (let i = 0; i < sk.length && i < ck.length; i++) inlineStyles(sk[i], ck[i]);
}

export type ChartExportMeta = {
  /** What the chart is of. */
  title: string;
  /** Unit, source, symbol — whatever makes the numbers checkable. */
  subtitle?: string;
  /** Basis and as-of. Rendered smaller, at the bottom. */
  footer?: string;
};

/**
 * Rasterise the first `<svg>` inside `container` and download it as a PNG.
 *
 * Returns false when there is no chart to export, so a caller can say so rather
 * than silently doing nothing.
 */
export async function exportChartPng(
  container: HTMLElement | null,
  meta: ChartExportMeta,
  fileName?: string,
): Promise<boolean> {
  const svg = container?.querySelector("svg");
  if (!svg) return false;

  const rect = svg.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.max(200, Math.round(rect.height));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  // The page's own ground, so an exported chart matches what the reader saw.
  // Read from the body rather than assumed: this app has a light and a dark
  // theme and the axis labels are legible on one of them only.
  const pageBg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const pageFg = getComputedStyle(document.body).color || "#111111";

  const PAD = 20;
  const HEAD = meta.subtitle ? 54 : 36;
  const FOOT = meta.footer ? 30 : 0;
  const SCALE = 2;                                   // legible when embedded

  const canvas = document.createElement("canvas");
  canvas.width = (w + PAD * 2) * SCALE;
  canvas.height = (h + HEAD + FOOT + PAD * 2) * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = pageBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = pageFg;
  ctx.font = "600 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.fillText(meta.title, PAD, PAD + 15);
  if (meta.subtitle) {
    ctx.fillStyle = "rgba(128,124,153,0.95)";
    ctx.font = "400 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
    ctx.fillText(meta.subtitle, PAD, PAD + 34);
  }

  const svgText = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  const img = new Image();
  const drawn = await new Promise<boolean>((resolve) => {
    img.onload = () => { ctx.drawImage(img, PAD, PAD + HEAD, w, h); resolve(true); };
    img.onerror = () => resolve(false);
    img.src = url;
  });
  if (!drawn) return false;

  if (meta.footer) {
    ctx.fillStyle = "rgba(128,124,153,0.95)";
    ctx.font = "400 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
    ctx.fillText(meta.footer, PAD, PAD + HEAD + h + 18);
  }

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return false;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName ?? `${meta.title.replace(/[^\w.-]+/g, "_")}.png`;
  a.click();
  URL.revokeObjectURL(href);
  return true;
}

/**
 * Download rows as CSV — the spec's "export data tables / comparison tables"
 * in the format that opens anywhere, alongside the styled Excel workbook.
 *
 * AN ABSENT VALUE STAYS EMPTY. `null` and `undefined` write as an empty field,
 * never as 0 — a spreadsheet will happily average a column of zeros that were
 * never measured.
 */
export function exportCsv(fileName: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  // The BOM keeps Excel from mangling the rupee sign and the em dash.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(href);
}
