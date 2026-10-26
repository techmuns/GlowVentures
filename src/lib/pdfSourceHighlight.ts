/** PDF text coordinates, before viewport scaling. The selected document and
 * unique source page are established by provenance, never by this matcher. */
export type PdfSourceText = { str: string; transform: number[]; width: number; height: number };
export type PdfSourceMatch = { item: PdfSourceText; start: number; end: number };
export type PdfSourceTarget = { value: string; isin: string; field?: string | null; initialIsin?: string | null };

const numeric = (s: string) => s.replace(/,/g, '').replace(/^\+/, '').replace(/\.0*$/, '').replace(/(\.\d*?)0+$/, '$1');

/** Full precision and token boundaries matter: 123 is not 1234, and an equal
 * balance in another ISIN is not evidence for this holding. Duplicates abstain,
 * except when the explicit Closing Balance row uniquely identifies the field. */
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
  return candidates.length === 1 ? candidates[0] : undefined;
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
