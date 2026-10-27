/** PDF text coordinates, before viewport scaling. The selected document and
 * unique source page are established by provenance, never by this matcher. */
export type PdfSourceText = { str: string; transform: number[]; width: number; height: number };
export type PdfSourceMatch = { item: PdfSourceText; start: number; end: number };
export type PdfSourceTarget = { value: string; isin: string; field?: string | null; initialIsin?: string | null };

const numeric = (s: string) => s.replace(/,/g, '').replace(/^\+/, '').replace(/\.0*$/, '').replace(/(\.\d*?)0+$/, '$1');
const label = (item: PdfSourceText) => item.str.trim().replace(/\s+/g, ' ').toUpperCase();
const center = (item: PdfSourceText) => item.transform[4] + item.width / 2;
const sameRow = (a: PdfSourceText, b: PdfSourceText) => Math.abs(a.transform[5] - b.transform[5]) <= Math.max(2, Math.min(a.height, b.height) * 0.35);

/** Demat holdings repeat the same units in Free Balance and Total Holding.
 * Resolve only an explicitly labelled table column on the selected ISIN row;
 * equal amounts on different rows, or an unclear header, remain ambiguous. */
function totalHoldingMatch(items: readonly PdfSourceText[], candidates: readonly PdfSourceMatch[], isin: string): PdfSourceMatch | undefined {
  const row = candidates[0].item;
  const printedIsins = items.filter(i => label(i) === isin && sameRow(i, row));
  if (!candidates.every(c => sameRow(c.item, row)) || printedIsins.length !== 1) return undefined;
  // Use the nearest table header, so an earlier table cannot lend its column
  // labels to a later, differently arranged table on the same page.
  const isinHeading = items.filter(i => label(i) === 'ISIN' && i.transform[5] > row.transform[5]
    && Math.abs(center(printedIsins[0]) - center(i)) <= Math.max(printedIsins[0].width, i.width) / 2)
    .sort((a, b) => a.transform[5] - b.transform[5])[0];
  if (!isinHeading) return undefined;
  const headings = items.filter(i => sameRow(i, isinHeading) && /[A-Z]/.test(label(i)));
  const totals = headings.filter(i => /^TOTAL(?: HOLDINGS?)?$/.test(label(i)));
  if (headings.filter(i => label(i) === 'ISIN').length !== 1 || totals.length !== 1) return undefined;
  const total = totals[0];
  if (label(total) === 'TOTAL') {
    const holding = items.filter(i => /^HOLDINGS?$/.test(label(i))
      && total.transform[5] - i.transform[5] >= 0
      && total.transform[5] - i.transform[5] <= Math.max(total.height, i.height) * 2
      && Math.abs(center(i) - center(total)) <= Math.max(i.width, total.width) / 2);
    if (holding.length !== 1) return undefined;
  }
  const x = center(total);
  const left = Math.max(...headings.map(center).filter(c => c < x));
  const right = Math.min(...headings.map(center).filter(c => c > x));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  const matches = candidates.filter(candidate => {
    // Coordinates belong to the whole text item. A combined multi-cell run
    // cannot be assigned to one column by guessing proportional glyph widths.
    if (candidate.item.str.trim() !== candidate.item.str.slice(candidate.start, candidate.end)) return false;
    const cx = center(candidate.item);
    return cx > (left + x) / 2 && cx < (x + right) / 2;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Full precision and token boundaries matter: 123 is not 1234, and an equal
 * balance in another ISIN is not evidence for this holding. Duplicates require
 * an explicit Closing Balance row or Total Holding column for that field. */
export function pdfSourceMatch(items: readonly PdfSourceText[], target: PdfSourceTarget): PdfSourceMatch | undefined {
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(target.value) || !/^IN[A-Z0-9]{10}$/.test(target.isin)) return undefined;
  const candidates: PdfSourceMatch[] = [];
  let active = target.initialIsin ?? null;
  for (const item of items) {
    const tokens = /\bIN[A-Z0-9]{10}\b|[+-]?\d[\d,]*(?:\.\d+)?/g;
    for (const token of item.str.matchAll(tokens)) {
      if (token[0].startsWith('IN')) { active = token[0]; continue; }
      if (active === target.isin && numeric(token[0]) === numeric(target.value)) {
        candidates.push({ item, start: token.index!, end: token.index! + token[0].length });
      }
    }
  }
  if (target.field === 'closing') {
    const closing = candidates.filter(({ item }) => {
      const row = items.filter(other => Math.abs(other.transform[5] - item.transform[5]) <= Math.max(2, item.height * 0.35))
        .sort((a, b) => a.transform[4] - b.transform[4]).map(other => other.str).join(' ');
      return /closing\s+(?:unit\s+)?balance/i.test(row);
    });
    // A transaction's running balance is not silently substituted for a missing
    // printed closing row, even when it happens to have the same value.
    return closing.length === 1 ? closing[0] : undefined;
  }
  return candidates.length === 1 ? candidates[0]
    : target.field === 'quantity' && candidates.length > 1 ? totalHoldingMatch(items, candidates, target.isin) : undefined;
}

export function isinBeforePage(pages: readonly { page?: number; text: string }[], page: number): string | null {
  let active: string | null = null, previous = 0;
  for (const p of pages) {
    if (p.page === page) return p.page === previous + 1 ? active : null;
    if (!p.page || p.page !== previous + 1) active = null;
    previous = p.page ?? 0;
    for (const isin of p.text.matchAll(/\bIN[A-Z0-9]{10}\b/g)) active = isin[0];
  }
  return null;
}
