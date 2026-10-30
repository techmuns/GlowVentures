import type { Position } from './types';
import { REVIEW_COLUMN_DATA } from '../data/reviewColumns';
import { acquisitionIdentity, fundUnitBasis } from '../../shared/fundUnitActions.mjs';

export type SourceMetric = 'statement' | 'quantity' | 'marketValue' | 'currentPrice' | 'costBasis' | 'avgCost' | 'unrealizedPnL';
export type TracePosition = Pick<Position, 'accountId' | 'securityKey' | 'security' | 'isin' | 'statementRecord'>
  & Partial<Pick<Position, 'quantity' | 'marketValue' | 'currentPrice' | 'costBasis' | 'avgCost' | 'unrealizedPnL'
    | 'depositoryUnits' | 'enteredNumbers' | 'rolledForward' | 'recoveredCost' | 'costBasisSource' | 'priceEvidence' | 'live' | 'navPriced' | 'navDate' | 'symbol' | 'reviewSource' | 'reviewNote' | 'fundUnitAdjustment'
    | 'valuedAtCost'>> & { assetClass?: Position['assetClass'] | null };
export type SourceEvidence = {
  document?: string; path?: string; sheet?: string; rows?: number[]; pointer?: string; field?: string; isin?: string | null; securityKey: string;
  accountId: string; label: string; value?: number | null; note?: string;
  /** A family-review record in plain words (Stage 10jn); `note` keeps the full detail. */
  review?: ReviewFacts;
};

/**
 * ── A REVIEW RECORD IN PLAIN WORDS (Stage 10jn) ─────────────────────────────
 *
 *   *"When i click on it to understand it is so complex can you please make it
 *    simplest to read layman language"* — the family, 30 Oct 2026.
 *
 * The review note is an audit sentence — its row, its tab, how the book
 * matched it. The popup leads with the facts a reader asks for instead: what it
 * was worth and when, what was paid, how many shares, and the one or two
 * things that change how to read it. The full note stays under "Full detail".
 * Read off the holding and off the note `reviewBook.mjs` writes, never guessed.
 */
export type ReviewFacts = {
  /** The review's own value (null where it records only what was paid). */
  value: number | null;
  cost: number | null;
  units: number | null;
  unitWord: 'shares' | 'units';
  asOf: string | null;
  atCost: boolean;
  /** One cost for several holders, shared out by shares. */
  splitByShares: boolean;
  /** One member's part of a line several members share. */
  shared: boolean;
  /** No document names who holds it. */
  noHolder: boolean;
  /** Listed since the review: the live view prices it at today's quote. */
  listed: boolean;
  /** A newer statement prints a different figure. */
  differs: boolean;
};
const rupees = (s: string) => Number(s.replace(/,/g, ''));
export function reviewFacts(p: TracePosition): ReviewFacts {
  const note = p.reviewNote ?? '';
  const valued = /^Valued at ₹([\d,]+(?:\.\d+)?)/.exec(note);
  const closing = /its closing of (\d{1,2} \w{3} \d{4})/.exec(note)?.[1] ?? /\(MOPWM, ([^)]+)\)/.exec(note)?.[1] ?? null;
  const atCost = !!p.valuedAtCost || /^Held at cost/.test(note);
  return {
    value: atCost || !valued ? null : rupees(valued[1]),
    cost: typeof p.costBasis === 'number' ? p.costBasis : null,
    units: typeof p.quantity === 'number' && p.quantity > 0 ? p.quantity : null,
    unitWord: p.assetClass === 'Equity' || p.assetClass === 'Unlisted' ? 'shares' : 'units',
    asOf: closing,
    atCost,
    splitByShares: /split by shares/i.test(note),
    shared: /of the line\./.test(note),
    noHolder: /names (?:no|its) holder|Not attributed to a member/i.test(note),
    listed: /Now a listed company/.test(note),
    differs: /A statement says otherwise/.test(note),
  };
}
export type SourceTrace = { metric: SourceMetric; title: string; derived: boolean; sources: SourceEvidence[]; notes: string[]; missing: number };
const LABELS: Record<SourceMetric, string> = {
  statement: 'Supporting statement', quantity: 'Quantity held', marketValue: 'Market value', currentPrice: 'Price / NAV',
  costBasis: 'Cost of units held', avgCost: 'Average cost', unrealizedPnL: 'Unrealised gain / loss',
};
const FIELDS: Partial<Record<SourceMetric, string>> = { quantity: 'quantity', marketValue: 'marketValue', currentPrice: 'marketPrice', costBasis: 'totalCost' };
export const metricForColumn = (column: string): SourceMetric | undefined => ({
  managedBy: 'statement', provider: 'statement', account: 'statement', accountNo: 'statement', entity: 'statement',
  qty: 'quantity', quantity: 'quantity', units: 'quantity', mv: 'marketValue', current: 'marketValue', value: 'marketValue', marketValue: 'marketValue',
  cmp: 'currentPrice', avgCost: 'avgCost', cost: 'costBasis', invested: 'costBasis', pnl: 'unrealizedPnL',
} as Record<string, SourceMetric>)[column];

/** Link by the selected document/record, never by an equal amount or a name. */
export function statementSourceHref(source: SourceEvidence): string | null {
  if (!source.document && !source.path) return null;
  if (source.document && !/^[a-z0-9][a-z0-9-]*$/.test(source.document)) return null;
  const params = new URLSearchParams(source.document ? { file: source.document } : { path: source.path! });
  if (source.sheet) params.set('sheet', source.sheet);
  if (source.rows?.length) params.set('rows', source.rows.join(','));
  if (source.pointer) params.set('record', source.pointer);
  if (source.field) params.set('field', source.field);
  if (source.isin) params.set('isin', source.isin);
  params.set('security', source.securityKey);
  if (typeof source.value === 'number') params.set('sourceValue', String(source.value));
  return `/statements?${params}`;
}

export function holdingSourceTrace(positions: readonly TracePosition[], metric: SourceMetric): SourceTrace {
  const sources: SourceEvidence[] = [], notes = new Set<string>();
  let missing = 0, derived = ['avgCost', 'unrealizedPnL'].includes(metric) || positions.length > 1;
  for (const p of positions) {
    const original = acquisitionIdentity(p);
    const base = { accountId: p.accountId, securityKey: p.securityKey, isin: original.isin };
    const record = p.statementRecord;
    const closing = !record ? p.depositoryUnits?.source : undefined;
    const value = metric === 'statement' ? null : p[metric];
    if (metric !== 'statement' && value == null) continue;
    const field = FIELDS[metric];
    if (record || closing) sources.push({ ...base, document: record?.document ?? closing!,
      pointer: record?.pointer ?? '/transactions', field: closing ? 'closing' : field,
      value: ['quantity', 'statement'].includes(metric) && !p.enteredNumbers?.includes('quantity') && !p.rolledForward ? original.quantity : undefined, label: p.security,
      note: closing ? 'Quantity is the closing balance in this account’s transaction statement, rather than the size of a single movement.' : undefined });
    else if (p.reviewSource) {
      sources.push({ ...base, path: REVIEW_COLUMN_DATA.workbook,
        sheet: p.reviewSource.sheet, rows: [p.reviewSource.row], label: p.security,
        note: p.reviewNote ?? 'The family review workbook supplies this record.',
        ...(p.reviewNote ? { review: reviewFacts(p) } : {}) });
      if (p.reviewNote && metric !== 'statement') derived = true;
    }
    else missing++;
    if (p.enteredNumbers?.some(f => f === metric || metric === 'statement' || ['avgCost', 'unrealizedPnL'].includes(metric))) {
      derived = true;
      notes.add('This includes a saved family correction, which the original statement does not show.');
    }
    if (p.rolledForward && p.quantity === p.rolledForward.quantity && ['quantity', 'marketValue', 'statement'].includes(metric)) {
      derived = true;
      notes.add('The number of units includes trades made after the statement date.');
    }
    if (p.recoveredCost && ['costBasis', 'avgCost', 'unrealizedPnL'].includes(metric)) {
      derived = true;
      notes.add('The statement does not show the cost, so it comes from the family\'s purchase records, listed below.');
      for (const e of p.recoveredCost.evidence) sources.push({ ...base, path: e.path, sheet: e.sheet, rows: e.rows, label: e.path,
        note: `${e.sheet} · rows ${e.rows.join(', ')}` });
    }
    if (p.fundUnitAdjustment && ['quantity', 'marketValue', 'avgCost', 'unrealizedPnL'].includes(metric)) {
      const a = p.fundUnitAdjustment;
      const basis = fundUnitBasis(a.isin, a.asOf, a.through);
      derived = true;
      notes.add(`The statement records ${a.quantity} units under ${a.isin}. Documented exchange conversions multiply those units by ${a.factor}, giving ${p.quantity} units under ${p.isin}; total acquisition cost is unchanged.`);
      for (const url of new Set(basis.actions.flatMap(action => action.sources)))
        sources.push({ ...base, label: 'Exchange unit-conversion notice', note: url });
    }
    if (p.costBasisSource && ['costBasis', 'avgCost', 'unrealizedPnL'].includes(metric)) {
      derived = true;
      notes.add(`Where the cost comes from: ${p.costBasisSource.replace(/-/g, ' ')}.`);
    }
    if (['marketValue', 'currentPrice', 'unrealizedPnL'].includes(metric) && (p.priceEvidence || p.live || p.navPriced)) {
      derived = true;
      const e = p.priceEvidence;
      sources.push({ ...base, label: e?.source ?? (p.navPriced ? 'AMFI' : 'Quote feed'),
        value: e?.value ?? p.currentPrice,
        note: `${e?.kind === 'published-nav' || p.navPriced ? "The fund's published price (NAV)" : 'The latest market price'}${(e?.effectiveAt ?? p.navDate) ? ` on ${e?.effectiveAt ?? p.navDate}` : ''}, not the statement's price. Code: ${e?.instrument ?? p.isin ?? p.symbol ?? p.securityKey}.` });
    }
  }
  if (metric === 'avgCost') notes.add('Average cost = total cost ÷ the number of units it covers.');
  if (metric === 'unrealizedPnL') notes.add('Gain / loss on paper = today\'s value − what was paid, only for holdings where what was paid is known.');
  if (metric === 'marketValue' && derived) notes.add('Market value = units × price. A line priced from the market feed uses the published price.');
  if (positions.length > 1 && metric !== 'statement') notes.add('This adds up the records listed below. No single statement shows this total.');
  if (missing) notes.add(`${missing} of the records behind this ${missing === 1 ? 'has' : 'have'} no statement to link to.`);
  // An account label can open one common PDF directly, without arbitrarily
  // selecting its first holding. Numeric figures retain every exact record.
  if (metric === 'statement' && sources.length > 1) {
    const byFile = new Map<string, SourceEvidence[]>();
    for (const s of sources) { const key = JSON.stringify([s.document, s.path, s.sheet, s.accountId]); byFile.set(key, [...(byFile.get(key) ?? []), s]); }
    sources.splice(0, sources.length, ...[...byFile.values()].map(group => group.length === 1 ? group[0]
      : { ...group[0], pointer: undefined, field: undefined, value: undefined }));
    if (sources.length === 1 && !missing && !notes.size) derived = false;
  }
  const unique = new Map(sources.map(s => [JSON.stringify(s), s]));
  return { metric, title: LABELS[metric], derived, sources: [...unique.values()], notes: [...notes], missing };
}

/** Strict JSON-pointer lookup; a broken/stale pointer never selects a nearby row. */
export function sourceRecordAt(document: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return undefined;
  let value: unknown = document;
  for (const part of pointer.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (!value || typeof value !== 'object' || ['__proto__', 'constructor', 'prototype'].includes(part)
      || !Object.prototype.hasOwnProperty.call(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** Page matching happens only WITHIN the already selected source document.
 * Require both identity and the exact figure, and abstain on ambiguity. */
export function sourcePage(pages: readonly { page?: number; text: string }[], isin: string | null, value: string | null): number | undefined {
  if (!isin || !value || !Number.isFinite(Number(value)) || Number(value) < 0) return undefined;
  const number = Number(value);
  const digits = String(number).replace(/[^0-9.]/g, '');
  const figure = new RegExp(`(^|[^0-9.])${digits.replace('.', '\\.')}${digits.includes('.') ? '0*' : '(?:\\.0+)?'}([^0-9.]|$)`);
  const matches = new Set<number>();
  let active: string | null = null, previous = 0;
  for (const page of pages) {
    if (!page.page || page.page !== previous + 1) active = null;
    previous = page.page ?? 0;
    const identifiers = [...page.text.matchAll(/\bIN[A-Z0-9]{10}\b/g)];
    let start = 0;
    for (const id of identifiers) {
      if (active === isin && figure.test(page.text.slice(start, id.index).replace(/,/g, '')) && page.page) matches.add(page.page);
      active = id[0]; start = id.index! + id[0].length;
    }
    if (active === isin && figure.test(page.text.slice(start).replace(/,/g, '')) && page.page) matches.add(page.page);
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}
