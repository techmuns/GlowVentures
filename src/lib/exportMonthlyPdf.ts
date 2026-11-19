// ── MONTH-ON-MONTH PERFORMANCE → PDF (client #408) ──────────────────────────
//
//   *"… if I want to show it to my principals."* — Yamini, 5 Nov 2026.
//
// The month-on-month table (which already exports to Excel) as a branded, vector
// PDF the family can send to the principals. It is a straight render of the rows
// the table shows — the figures are formatted by the caller (so the PDF carries
// exactly what is on screen, in the display currency) and a blank month stays a
// dash, never a zero. Fonts are the same NotoSans the other reports embed, so the
// rupee sign renders.
import { jsPDF } from "jspdf";

const W = 841.89, H = 595.28, M = 36, RIGHT = W - M, BOTTOM = H - 44;
const INK = "#183338", MUTED = "#63787a", RULE = "#d6dfde", TEAL = "#0b4f54";

let fonts: Promise<{ regular: string; bold: string }> | undefined;
async function loadFonts() {
  if (!fonts) fonts = (async () => {
    const get = async (name: string) => {
      const r = await fetch(`${import.meta.env.BASE_URL}report-assets/${name}`);
      if (!r.ok) throw new Error("Report fonts could not be loaded.");
      const bytes = new Uint8Array(await r.arrayBuffer());
      let value = "";
      for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(value);
    };
    const [regular, bold] = await Promise.all([get("NotoSans-Regular.ttf"), get("NotoSans-Bold.ttf")]);
    return { regular, bold };
  })().catch((e) => { fonts = undefined; throw e; });
  return fonts;
}

export type MonthlyPdfInput = {
  brand: { name: string; mark: string; provider: string };
  scope: string; currency: string; exportedOn: string;
  subtitle?: string;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  footer?: string[];
  note?: string;
};

export async function exportMonthlyPdf(data: MonthlyPdfInput): Promise<{ blob: Blob; filename: string; pages: number }> {
  const f = await loadFonts();
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS("NotoSans-Regular.ttf", f.regular); pdf.addFont("NotoSans-Regular.ttf", "Noto", "normal");
  pdf.addFileToVFS("NotoSans-Bold.ttf", f.bold); pdf.addFont("NotoSans-Bold.ttf", "Noto", "bold");
  pdf.setProperties({ title: `${data.brand.name} — Month-on-month performance`, author: data.brand.provider });

  const clean = (v: string) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/ /g, " ");
  const text = (v: string, x: number, y: number, size = 9, color = INK, bold = false, align: "left" | "right" = "left") => {
    pdf.setFont("Noto", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
    pdf.text(clean(v), x, y, { align });
  };
  const line = (x: number, y: number, x2: number, color = RULE) => { pdf.setDrawColor(color); pdf.setLineWidth(.5); pdf.line(x, y, x2, y); };

  const widths = (() => {
    // Column 1 (Month) is wider; the rest share the remainder evenly.
    const total = RIGHT - M, first = 120, rest = (total - first) / (data.columns.length - 1);
    return data.columns.map((_, i) => (i === 0 ? first : rest));
  })();
  const colX = (i: number) => M + widths.slice(0, i).reduce((a, b) => a + b, 0);

  const header = () => {
    pdf.setFillColor("#c3a962"); pdf.roundedRect(M, 24, 24, 24, 6, 6, "F");
    pdf.setFont("Noto", "bold"); pdf.setFontSize(15); pdf.setTextColor("#14272b");
    pdf.text(clean(data.brand.mark), M + 12, 41, { align: "center" });
    text(data.brand.name.toUpperCase(), M + 34, 34, 11, TEAL, true);
    text("FAMILY OFFICE", M + 34, 45, 6.5, MUTED);
    text(data.scope, RIGHT, 32, 8, MUTED, false, "right");
    text(`${data.currency} · Exported ${data.exportedOn}`, RIGHT, 44, 8, MUTED, false, "right");
    text("Month-on-month performance", M, 74, 16, TEAL);
    line(M, 84, RIGHT);
  };
  const headRow = (y: number) => {
    pdf.setFillColor("#edf2f1"); pdf.rect(M, y - 12, RIGHT - M, 20, "F");
    data.columns.forEach((c, i) => text(c.label.toUpperCase(), c.right ? colX(i) + widths[i] - 6 : colX(i) + 6, y, 7, MUTED, true, c.right ? "right" : "left"));
    return y + 20;
  };
  header();
  let y = headRow(104);
  const drawRow = (cells: string[], bold = false, alt = false) => {
    if (y + 18 > BOTTOM) { header(); y = headRow(104); }
    if (alt) { pdf.setFillColor("#f4f6f5"); pdf.rect(M, y - 11, RIGHT - M, 17, "F"); }
    data.columns.forEach((c, i) => {
      const raw = clean(cells[i] ?? "");
      const color = c.right && /^[+-]/.test(raw) ? (raw.startsWith("-") ? "#a74654" : TEAL) : INK;
      text(raw, c.right ? colX(i) + widths[i] - 6 : colX(i) + 6, y, 8, bold ? INK : color, bold, c.right ? "right" : "left");
    });
    line(M, y + 6, RIGHT, "#e4e9e8");
    y += 17;
  };
  data.rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));
  if (data.footer) { y += 2; drawRow(data.footer, true); }

  // Subtitle + coverage note under the table.
  pdf.setFont("Noto", "normal"); pdf.setFontSize(8); pdf.setTextColor(MUTED);
  const noteLines = pdf.splitTextToSize(clean(data.note ?? data.subtitle ?? ""), RIGHT - M);
  if (y + noteLines.length * 11 + 10 > BOTTOM) { header(); y = 104; }
  pdf.text(noteLines, M, y + 14, { lineHeightFactor: 1.5 });

  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i); line(M, H - 30, RIGHT);
    text(`CONFIDENTIAL · ${data.brand.name} · Prepared by ${data.brand.provider}`, M, H - 17, 6.5, MUTED);
    text(`${i} / ${pdf.getNumberOfPages()}`, RIGHT, H - 17, 7, MUTED, false, "right");
  }
  return { blob: pdf.output("blob"), filename: `${data.brand.name.replace(/\s+/g, "-")}-Month-on-month-${data.exportedOn}.pdf`, pages: pdf.getNumberOfPages() };
}
