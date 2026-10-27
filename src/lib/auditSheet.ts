export type AuditCell = string | number | null;
export type AuditSheet = { name: string; rows: AuditCell[][] };

/** The archive stores workbook grids and PDF page text in different formats. */
export function decodeAuditSheet(value: unknown): AuditSheet {
  if (!value || typeof value !== "object" || !("name" in value) || typeof value.name !== "string") {
    throw new Error("Invalid archive sheet");
  }
  if ("rows" in value && Array.isArray(value.rows)) {
    const rows = value.rows.map((row): AuditCell[] => {
      if (!Array.isArray(row)) throw new Error("Invalid archive row");
      return row.map((cell): AuditCell => {
        if (cell === null || typeof cell === "string" || (typeof cell === "number" && Number.isFinite(cell))) return cell;
        // Excel boolean cells were already displayed and exported as text.
        if (typeof cell === "boolean") return String(cell);
        throw new Error("Invalid archive cell");
      });
    });
    return { name: value.name, rows };
  }
  if ("pages" in value && Array.isArray(value.pages)) {
    const rows = value.pages.map((page): AuditCell[] => {
      if (!page || typeof page !== "object" || !Number.isSafeInteger(page.page) || page.page < 1 || typeof page.text !== "string") {
        throw new Error("Invalid archive page");
      }
      return [page.page, page.text];
    });
    return { name: value.name, rows: [["Page", "Text"], ...rows] };
  }
  throw new Error("Invalid archive sheet contents");
}
