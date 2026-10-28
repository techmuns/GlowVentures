import type { BookFolio } from "./privateBook";
import { capitalInputId, privateCapitalId } from "./tableInputs";

/**
 * ── A FOLIO'S CAPITAL, TYPED IN ITS OWN CELLS ─────────────────────────────
 *
 *   *"make the other relevant cells still to call, called, paid in, etc
 *    individual cells editable just like the description and strategy cells.
 *    In the same format"* — the family, 28 Oct 2026 (Stage 10ir).
 *
 * Committed, Called, Paid in and Still to call edit on a row that is ONE
 * folio: a folio line, or a fund row with a single folio. A row over several
 * folios is their sum, and typing a fund-wide figure there would have to be
 * split across members nobody gave the split for — so it stays calculated.
 */
export const CAPITAL_CELL_FIELDS: Readonly<Record<string, string>> = { committed: "committed", called: "called", paid: "paid", uncalled: "undrawn" };

/**
 * The capital input record a folio's cells edit — the same one `<Tr>` tags the
 * cell with for Edit numbers and Excel (SortHeader.tsx): the holding's own
 * `private-capital` record, else its account's capital-account record. Null for
 * an income-only view, which carries no capital of its own.
 */
export function capitalRecordId(f: BookFolio, has: (id: string) => boolean): string | null {
  if (f.viewOf) return null;
  if (f.position) {
    const own = privateCapitalId(f.position);
    if (has(own)) return own;
  }
  const id = capitalInputId(f.capital?.accountId ?? f.accountId);
  return has(id) ? id : null;
}

const UNIT: Record<string, number> = { cr: 1e7, crore: 1e7, crores: 1e7, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5 };
/**
 * A typed amount in rupees: `12,50,000`, `₹2.5 Cr` or `40 lakh`. Blank is
 * null (not known); anything else that is not an amount is NaN, never a guess.
 */
export function parseRupees(text: string): number | null {
  const t = text.trim().replace(/^₹\s*/, "").replace(/,/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?|\.\d+)\s*([a-z]+)?$/i.exec(t);
  if (!m) return NaN;
  const scale = m[2] ? UNIT[m[2].toLowerCase()] : 1;
  return scale ? Math.round(Number(m[1]) * scale * 100) / 100 : NaN;
}
export const rupeeText = (n: number | null) => (n == null ? "" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
