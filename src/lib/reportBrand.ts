import type { jsPDF } from "jspdf";
import type ExcelJS from "exceljs";

export const GLOW_MARK = "/brand/glow-ventures-mark.png";
export const GLOW_WORDMARK = "/brand/glow-ventures-wordmark.png";
export const REPORT_BRAND = { name: "Glow Ventures", provider: "Munshot AI" } as const;

const aspect = 1280 / 181;
let wordmark: Promise<string> | undefined;

export function loadReportWordmark(): Promise<string> {
  wordmark ??= fetch(GLOW_WORDMARK).then(async response => {
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png") {
      throw new Error("The Glow Ventures logo could not be loaded. Please try again.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return "data:image/png;base64," + btoa(binary);
  }).catch(error => {
    wordmark = undefined;
    throw error;
  });
  return wordmark;
}

export function drawReportWordmark(pdf: jsPDF, image: string, x: number, y: number, width = 156) {
  pdf.addImage(image, "PNG", x, y, width, width / aspect, "glow-ventures-wordmark", "FAST");
}

/** Use the existing title row so sheet references, table headers and filters stay in place. */
export async function brandWorkbookTitles(book: ExcelJS.Workbook, sheets = book.worksheets) {
  const image = book.addImage({ base64: await loadReportWordmark(), extension: "png" });
  for (const sheet of sheets) {
    const title = sheet.getCell("A1");
    sheet.getRow(1).height = Math.max(sheet.getRow(1).height || 0, 44);
    title.alignment = { ...title.alignment, vertical: "bottom" };
    sheet.addImage(image, {
      tl: { col: 0.02, row: 0.06 }, ext: { width: 148, height: 148 / aspect }, editAs: "oneCell",
    });
  }
}
