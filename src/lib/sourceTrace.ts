import type { Position } from './types';
import { REVIEW_COLUMN_DATA } from '../data/reviewColumns';

export type SourceMetric = 'statement' | 'quantity' | 'marketValue' | 'currentPrice' | 'costBasis' | 'avgCost' | 'unrealizedPnL';
export type TracePosition = Pick<Position, 'accountId' | 'securityKey' | 'security' | 'isin' | 'statementRecord'>
  & Partial<Pick<Position, 'quantity' | 'marketValue' | 'currentPrice' | 'costBasis' | 'avgCost' | 'unrealizedPnL'
    | 'depositoryUnits' | 'enteredNumbers' | 'rolledForward' | 'recoveredCost' | 'costBasisSource' | 'priceEvidence' | 'live' | 'navPriced' | 'navDate' | 'symbol' | 'reviewSource'>>;
export type SourceEvidence = {
  document?: string; path?: string; sheet?: string; rows?: number[]; pointer?: string; field?: string; isin?: string | null; securityKey: string;
  accountId: string; label: string; value?: number | null; note?: string;
};
export type SourceTrace = { metric: SourceMetric; title: string; derived: boolean; sources: SourceEvidence[]; notes: string[]; missing: number };
const LABELS: Record<SourceMetric, string> = {
  statement: 'Supporting statement', quantity: 'Quantity held', marketValue: 'Market value', currentPrice: 'Price / NAV',
  costBasis: 'Cost of units held', avgCost: 'Average cost', unrealizedPnL: 'Unrealised gain / loss',
};
const FIELDS: Partial<Record<SourceMetric, string>> = { quantity: 'quantity', marketValue: 'marketValue', currentPrice: 'marketPrice', costBasis: 'totalCost' };
export const metricForColumn = (column: string): SourceMetric | undefined => ({
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
    const base = { accountId: p.accountId, securityKey: p.securityKey, isin: p.isin };
    const record = p.statementRecord;
    const closing = !record ? p.depositoryUnits?.source : undefined;
    const value = metric === 'statement' ? null : p[metric];
    if (metric !== 'statement' && value == null) continue;
    const field = FIELDS[metric];
    if (record || closing) sources.push({ ...base, document: record?.document ?? closing!,
      pointer: record?.pointer ?? '/transactions', field: closing ? 'closing' : field,
      value: ['quantity', 'statement'].includes(metric) && !p.enteredNumbers?.includes('quantity') && !p.rolledForward ? p.quantity : undefined, label: p.security,
      note: closing ? 'Quantity is the closing balance in this account’s transaction statement, rather than the size of a single movement.' : undefined });
    else if (p.reviewSource) sources.push({ ...base, path: REVIEW_COLUMN_DATA.workbook,
      sheet: p.reviewSource.sheet, rows: [p.reviewSource.row], label: p.security,
      note: 'The family review workbook supplies this record.' });
    else missing++;
    if (p.enteredNumbers?.some(f => f === metric || metric === 'statement' || ['avgCost', 'unrealizedPnL'].includes(metric))) {
      derived = true;
      notes.add('This includes a saved family correction. The linked statement is the original record; the saved correction is not printed in its PDF.');
    }
    if (p.rolledForward && p.quantity === p.rolledForward.quantity && ['quantity', 'marketValue', 'statement'].includes(metric)) {
      derived = true;
      notes.add('Units were rolled forward using later recorded trades. The original holding snapshot is one input, rather than the final unit balance.');
    }
    if (p.recoveredCost && ['costBasis', 'avgCost', 'unrealizedPnL'].includes(metric)) {
      derived = true;
      notes.add('Cost was recovered from reconciled purchase records. Its supporting workbook rows are listed below.');
      for (const e of p.recoveredCost.evidence) sources.push({ ...base, path: e.path, sheet: e.sheet, rows: e.rows, label: e.path,
        note: `${e.sheet} · rows ${e.rows.join(', ')}` });
    }
    if (p.costBasisSource && ['costBasis', 'avgCost', 'unrealizedPnL'].includes(metric)) {
      derived = true;
      notes.add(`Cost basis: ${p.costBasisSource.replace(/-/g, ' ')}. The holding statement alone may not print this final cost.`);
    }
    if (['marketValue', 'currentPrice', 'unrealizedPnL'].includes(metric) && (p.priceEvidence || p.live || p.navPriced)) {
      derived = true;
      const e = p.priceEvidence;
      sources.push({ ...base, label: e?.source ?? (p.navPriced ? 'AMFI' : 'Quote feed'),
        value: e?.value ?? p.currentPrice,
        note: `${e?.kind === 'published-nav' || p.navPriced ? 'Published NAV' : 'Market quote'} · ${e?.instrument ?? p.isin ?? p.symbol ?? p.securityKey} · ${e?.effectiveAt ?? p.navDate ?? 'observation date not supplied'}. This price comes from the feed, rather than the holding statement.` });
    }
  }
  if (metric === 'avgCost') notes.add('Average cost = cost of the units covered ÷ those units. Different unit classes are not added as one unit.');
  if (metric === 'unrealizedPnL') notes.add('Unrealised gain / loss = market value − cost, over the holdings with a measured cost.');
  if (metric === 'marketValue' && derived) notes.add('Market value uses the selected holding records and their own prices; a feed-priced line is units × the published price.');
  if (positions.length > 1 && metric !== 'statement') notes.add('This figure combines multiple holding records. Each contributing record is listed; no single PDF states the combined figure.');
  if (missing) notes.add(`${missing} contributing record${missing === 1 ? ' has' : 's have'} no direct statement pointer. No PDF link has been guessed for ${missing === 1 ? 'it' : 'them'}.`);
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
