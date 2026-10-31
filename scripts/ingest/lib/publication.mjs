// The publication boundary consumes normalized documents, never filenames or UI rows.
// A delivery can propose facts; only a complete, reconciled, identity-safe version
// may become a book. Historical exceptions do not authorize a new exception.
import { createHash } from 'node:crypto';
import { assertNormalized } from './document.mjs';
import { resolveOwner } from '../../../shared/owners.mjs';
import { readGaps } from './readStatus.mjs';
import { sourceFor } from '../precedence.mjs';
import { NON_STATEMENT_PROVIDERS } from './classify.mjs';

export const RECORD_SECTIONS = ['holdings', 'transactions', 'capitalGains', 'cashFlows', 'income', 'expenses', 'returns'];
export const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number in statement data');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stable(value)).digest('hex');
export const safeKey = key => typeof key === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(key) && !key.includes('..');
export const accountKey = d => stable([d.provider, String(d.accountNo ?? '')]);
export const holdingKey = p => stable([p.accountId, p.memberId ?? null, p.securityKey]);
export function documentRevision(d) { return digest(d); }
export function archiveRevision(docs, revisionOf = documentRevision) {
  return digest(docs.map(d => [d.docKey, revisionOf(d)]).sort((a, b) => a[0].localeCompare(b[0])));
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function walk(value, visit, pointer = '') {
  if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) walk(v, visit, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
  else visit(value, pointer);
}
const nonempty = v => v !== null && v !== undefined && v !== '';
const numericFields = new Set(['quantity', 'unitCost', 'totalCost', 'marketPrice', 'marketValue', 'amount', 'gross', 'net', 'price', 'units', 'accruedIncome', 'distributedIncome', 'realized', 'positionIrrPct', 'benchmarkIrrPct', 'purchaseAmount', 'saleAmount', 'shortTerm', 'longTerm']);
const identity = d => stable([d.provider, d.accountNo, d.reportType, d.asOf, d.periodFrom, d.periodTo]);
const content = d => {
  const copy = structuredClone(d);
  // A re-delivered identical statement is not a new economic event.
  delete copy.docKey; delete copy.sourcePath; delete copy.sections; delete copy.stitches;
  const replace = v => Array.isArray(v) ? v.map(replace) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !['source', 'dedupeGroup', 'alsoReportedUnder'].includes(k)).map(([k, x]) => [k, replace(x)])) : v;
  return digest(replace(copy));
};
/** Economic equality when a previously uploaded original later reaches main.
 * Physical page spans, read notes and attribution evidence may differ; no
 * financial row or populated financial field may disappear during migration. */
export function sameFinancialStatement(left, right) {
  const facts = doc => {
    const copy = { ...doc };
    for (const key of ['warnings', 'pages', 'sourcePages', 'ownerSource', 'accountNoSource']) delete copy[key];
    return content(copy);
  };
  return facts(left) === facts(right);
}

const carriesFacts = d => RECORD_SECTIONS.some(k => d[k]?.length) || d.flows || d.commitment;
const unsafeSource = p => typeof p !== 'string' || !p.startsWith('source/') || p.split('/').some(x => !x || x === '..' || x === '.') || /[\\\r\n\0]/.test(p);
/**
 * A STATEMENT THAT NEVER ARRIVED (Stage 10gk): a mail server's removal notice
 * where the attachment was (`attachment-removed`). Its record carries no facts
 * and says only that — it is listed as never arrived, not read and not failed —
 * so publishing it publishes nothing to check.
 */
export const neverArrived = d => d.status === 'failed' && !carriesFacts(d)
  && (d.warnings ?? []).some(w => w?.code === 'attachment-removed');
/**
 * A DOCUMENT HELD OUT BY DECISION (Stage 10hu): the consolidated review, the
 * family register, MOPWM's transaction report — `NON_STATEMENT_PROVIDERS`. It is
 * archived with its reason and no fact, no account and no owner, so publishing
 * it publishes nothing to check; `check:reads` accepts it on the same terms. A
 * document that carries anything else is still assessed as a statement.
 */
export const heldOutByDecision = d => d.status === 'failed' && !carriesFacts(d)
  && NON_STATEMENT_PROVIDERS.has(d.provider) && !d.accountNo && !d.ownerId
  && (d.warnings ?? []).length > 0 && d.warnings.every(w => w?.code === 'held-out-by-decision');

/** No fuzzy owner, account or security matching is allowed at this boundary. */
export function assessPublication({ baseline, documents, baselineReport = {}, report = {}, expected = {} }) {
  // Evaluation-scoped caches: documents may mutate during reconciliation, so
  // no revision is ever cached across candidates or in global state.
  const revisions = new WeakMap(), contents = new WeakMap();
  const revisionOf = d => { if (!revisions.has(d)) revisions.set(d, documentRevision(d)); return revisions.get(d); };
  const contentOf = d => { if (!contents.has(d)) contents.set(d, content(d)); return contents.get(d); };
  const issues = [], duplicates = [];
  const add = (code, d, reason, pointer = '') => issues.push({ code, document: d?.docKey ?? null, pointer, reason });
  const old = new Map(baseline.map(d => [d.docKey, d]));
  const byKey = new Map();
  for (const d of documents) {
    if (!safeKey(d.docKey)) { add('UNSAFE_DOCUMENT_KEY', d, 'Document keys must be safe archive identifiers.'); continue; }
    if (byKey.has(d.docKey)) add('DUPLICATE_KEY', d, 'Two documents have the same archive key.');
    byKey.set(d.docKey, d);
  }
  const changed = documents.filter(d => !old.has(d.docKey) || revisionOf(old.get(d.docKey)) !== revisionOf(d));
  const touched = new Set(changed.map(d => d.docKey));
  // A failed reading that published nothing may give way to another reading of
  // the SAME source file — a reader that now reads it (Stage 10gk). The
  // statement is not removed; only the reading that could not read it is.
  const sources = new Set(documents.map(d => d.sourcePath));
  for (const d of baseline) if (!byKey.has(d.docKey) && !(d.status === 'failed' && !carriesFacts(d) && sources.has(d.sourcePath))) {
    add('ARCHIVE_LOSS', d, 'A delivery cannot remove an earlier statement.');
  }

  const ownerByAccount = new Map(), isinByKey = new Map(), keyByIsin = new Map();
  const remember = (map, key, value) => { if (nonempty(value)) (map.get(key) ?? map.set(key, new Set()).get(key)).add(value); };
  for (const d of baseline) {
    remember(ownerByAccount, accountKey(d), d.ownerId);
    for (const section of RECORD_SECTIONS) for (const r of d[section] ?? []) {
      if (r.isin && r.securityKey) { remember(isinByKey, r.securityKey, r.isin); remember(keyByIsin, r.isin, r.securityKey); }
    }
  }
  const seenContent = new Map(baseline.map(d => [contentOf(d), d.docKey]));
  for (const d of changed) {
    try { assertNormalized(d); stable(d); } catch (error) { add('INVALID_DOCUMENT', d, error.message); continue; }
    if (unsafeSource(d.sourcePath)) add('UNSAFE_SOURCE_PATH', d, 'Statement evidence must refer to a source file inside the repository.');
    if (neverArrived(d) || heldOutByDecision(d)) continue;
    if (d.status !== 'ok' || readGaps(d).length) add('READ_GAP', d, 'The reader must account for the whole statement before publication.');
    if (d.reportType === 'unknown') add('UNKNOWN_FORMAT', d, 'No verified reader recognizes this statement format.');
    if (d.asOf && !validDate(d.asOf)) add('INVALID_DATE', d, 'Statement date is not an actual ISO calendar day.', '/asOf');
    if (expected.provider && d.provider !== expected.provider) add('FOLDER_MISMATCH', d, 'The statement issuer does not match the selected provider folder.');
    if (expected.ownerId && d.ownerId !== expected.ownerId) add('OWNER_MISMATCH', d, 'The statement holder does not match the supplied owner.');
    if (expected.accountNo && String(d.accountNo) !== String(expected.accountNo)) add('ACCOUNT_MISMATCH', d, 'The printed account does not match the supplied account.');
    const hasFacts = carriesFacts(d);
    if (!d.twinOf && !d.excludedFromBook && hasFacts) {
      if (!d.accountNo || !d.ownerId) add('MISSING_IDENTITY', d, 'Financial records require an identified account and canonical owner.');
      if (d.accountNoSource && d.accountNoSource !== 'printed') {
        const witnesses = documents.filter(x => x.provider === d.provider && x.clientCode && x.clientCode === d.clientCode && x.accountNoSource === 'printed');
        const accounts = new Set(witnesses.map(x => String(x.accountNo)));
        if (d.accountNoSource !== 'client-code' || accounts.size !== 1 || !accounts.has(String(d.accountNo))) add('UNVERIFIED_ACCOUNT', d, 'A missing account number needs a unique printed client-code/account witness; a sole-known-account assumption is insufficient for a new delivery.');
      }
      const resolved = resolveOwner(d.owner, d.pan ?? null).owner;
      if (!resolved || resolved.ownerId !== d.ownerId) add('UNVERIFIED_OWNER', d, 'The printed holder/PAN must resolve to the recorded canonical owner.');
      const owners = ownerByAccount.get(accountKey(d));
      if (owners?.size && (!owners.has(d.ownerId) || owners.size !== 1)) add('ACCOUNT_OWNER_CONFLICT', d, 'This provider/account is already assigned to another holder.');
      remember(ownerByAccount, accountKey(d), d.ownerId);
      if (d.holdings?.length && !sourceFor(d.provider, 'holdings')) add('NO_SOURCE_POLICY', d, 'This provider needs an explicit holdings precedence rule.');
      if (!d.asOf) add('MISSING_DATE', d, 'Financial records require a verified statement date.');
    }
    if (!hasFacts && !d.twinOf && !d.excludedFromBook && d.totals?.marketValue !== 0) add('EMPTY_EXTRACTION', d, 'No financial records or measured empty portfolio were read.');
    const other = seenContent.get(contentOf(d));
    if (other && other !== d.docKey) duplicates.push({ document: d.docKey, sameAs: other });
    else seenContent.set(contentOf(d), d.docKey);
    const sameIssue = baseline.find(x => x.docKey !== d.docKey && identity(x) === identity(d));
    if (sameIssue && contentOf(sameIssue) !== contentOf(d)) add('CONFLICTING_ISSUE', d, `A different statement already covers the same account, report and date (${sameIssue.docKey}). A correction requires review.`);
    const previous = baseline.filter(x => accountKey(x) === accountKey(d) && x.reportType === d.reportType && x.asOf && x.asOf <= d.asOf)
      .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    for (const section of RECORD_SECTIONS) {
      const rows = d[section] ?? [], seenRows = new Set();
      const priorRows = previous?.[section] ?? [];
      for (const field of ['date', 'purchaseDate', 'saleDate']) {
        if (priorRows.length && priorRows.every(r => nonempty(r[field])) && rows.some(r => !nonempty(r[field]))) add('DATE_COVERAGE_LOSS', d,
          `The new layout stopped supplying ${section}.${field}; undated rows cannot replace a verified dated record.`, `/${section}`);
      }
      for (const [i, r] of rows.entries()) {
        const ptr = `/${section}/${i}`;
        const referenced = typeof r.source === 'string' ? byKey.get(r.source) : null;
        if (referenced && accountKey(referenced) !== accountKey(d)) add('CROSS_ACCOUNT_SOURCE', d,
          'A financial row points to a different provider/account. It cannot supply this account’s figures or dates.', ptr);
        walk(r, (v, p) => {
          const field = p.split('/').at(-1);
          if (v != null && numericFields.has(field) && (typeof v !== 'number' || !Number.isFinite(v))) add('INVALID_NUMBER', d, 'A numeric field is not a finite number or null.', ptr + p);
          if (nonempty(v) && /^(date|purchaseDate|saleDate|settlementDate|priceAsOn)$/.test(field) && !validDate(v)) add('INVALID_DATE', d, 'A dated record contains an invalid or ambiguous date.', ptr + p);
        });
        if (r.isin && r.securityKey) {
          // A delivery may not ADD a pairing the verified book does not carry. One
          // it already carries — an AIF's units under the depository's name and
          // under the fund's own (`sanshi-trust-fd-i-cl-e-…` and
          // `sanshi-fund-i-class-e`) — is the reviewed state, and a row filed
          // under one of its keys is not a new split (Stage 10gk).
          const isins = isinByKey.get(r.securityKey), keys = keyByIsin.get(r.isin);
          if (isins?.size && !isins.has(r.isin)) add('SECURITY_CONFLICT', d, 'One security key carries conflicting ISINs.', ptr);
          if (keys?.size && !keys.has(r.securityKey)) add('SECURITY_SPLIT', d, 'One ISIN is being filed under different security keys.', ptr);
          remember(isinByKey, r.securityKey, r.isin); remember(keyByIsin, r.isin, r.securityKey);
        }
        if (section === 'holdings') {
          const key = stable([r.memberId, r.securityKey]);
          if (seenRows.has(key)) add('AMBIGUOUS_HOLDING', d, 'Multiple rows target the same member/security without a distinct lot identity.', ptr);
          seenRows.add(key);
          const prev = previous?.holdings?.find(h => (r.isin && h.isin ? h.isin === r.isin : h.securityKey === r.securityKey) && h.memberId === r.memberId);
          for (const field of ['quantity', 'totalCost', 'marketPrice', 'marketValue']) {
            if (prev?.[field] != null && r[field] == null) add('FIELD_COVERAGE_LOSS', d, `The new layout stopped supplying ${field}; retain the verified record pending review.`, `${ptr}/${field}`);
          }
        }
      }
    }
  }
  // Compare actual findings, not counts: a new error must not hide behind an old
  // error that disappeared. Include checks involving an unchanged sibling too.
  for (const name of ['rowSumChecks', 'derivedVsPrinted', 'datedTableChecks']) {
    const accepted = new Set((baselineReport[name] ?? []).filter(x => x.severity === 'material').map(stable));
    for (const finding of report[name] ?? []) if (finding.severity === 'material' && !accepted.has(stable(finding))) {
      add('RECONCILIATION_FAILED', { docKey: finding.docKey ?? finding.source ?? null }, `${name}: ${stable(finding)}`);
    }
  }
  for (const name of ['crossReportDeltas', 'duplicateHoldings', 'duplicateAifEarnings']) {
    const accepted = new Set((baselineReport[name] ?? []).map(stable));
    for (const finding of report[name] ?? []) if (!accepted.has(stable(finding))) add('CROSS_RECORD_CONFLICT', null, `${name}: ${stable(finding)}`);
  }
  if (duplicates.length && duplicates.length !== changed.length) add('MIXED_DUPLICATE_DELIVERY', null, 'Remove repeated documents and reprepare; a mixed delivery must not discard its new statements.');
  const decision = issues.length ? 'needs_review' : duplicates.length ? 'duplicate' : changed.length ? 'verified' : 'unchanged';
  return { schemaVersion: 1, decision, baselineRevision: archiveRevision(baseline, revisionOf), candidateRevision: archiveRevision(documents, revisionOf),
    changed: [...touched].sort(), duplicates, issues };
}

/** Content-addressed field evidence. Pointers refer to the immutable normalized
 * document, not a guessed PDF row. Page precision is explicitly declared. */
export function documentEvidence(doc, { readerRevision, sourceSha256 = null } = {}) {
  const revision = documentRevision(doc), fields = {};
  walk(doc, (value, pointer) => {
    const field = { value, kind: value == null ? 'missing' : 'normalized-record' };
    const m = /^\/holdings\/(\d+)\/(marketValue|gainLoss|pctGainLoss|pctAssets)$/.exec(pointer);
    if (m && value != null) {
      const h = doc.holdings[Number(m[1])], p = `/holdings/${m[1]}`;
      const formulas = {
        marketValue: h.marketValueFromPrinted ? ['printed.marketValue', [`${p}/printed/marketValue`]] : ['round(quantity * marketPrice, 2)', [`${p}/quantity`, `${p}/marketPrice`]],
        gainLoss: ['round(marketValue - totalCost, 2)', [`${p}/marketValue`, `${p}/totalCost`]],
        pctGainLoss: ['round(gainLoss / totalCost * 100, 2)', [`${p}/gainLoss`, `${p}/totalCost`]],
        pctAssets: ['round(marketValue / sum(holdings.marketValue) * 100, 2)', [`${p}/marketValue`, ...doc.holdings.map((_, i) => `/holdings/${i}/marketValue`)]],
      };
      field.kind = 'derived'; [field.formula, field.inputs] = formulas[m[2]];
    }
    fields[pointer] = field;
  });
  return { schemaVersion: 1, document: doc.docKey, revision, readerRevision: readerRevision ?? null, source: {
    path: doc.sourcePath, sha256: sourceSha256, pages: doc.sourcePages ?? null,
    precision: doc.sourcePages ? 'document-page-span' : 'document',
  }, fields };
}

/** Resolves source selection saved by the book builder; never searches by value. */
/** Index one immutable candidate once. Reconciliation must finish first. */
export function positionEvidenceReader(documents, accounts) {
  const documentsByKey = new Map(), accountsByKey = new Map(), revisions = new WeakMap(), relatedByHolding = new Map();
  const revisionOf = d => { if (!revisions.has(d)) revisions.set(d, documentRevision(d)); return revisions.get(d); };
  for (const account of accounts) if (!accountsByKey.has(account.accountId)) accountsByKey.set(account.accountId, account);
  for (const doc of documents) {
    if (!documentsByKey.has(doc.docKey)) documentsByKey.set(doc.docKey, doc);
    const account = accountKey(doc);
    for (const section of RECORD_SECTIONS) for (const [i, row] of (doc[section] ?? []).entries()) {
      if (typeof row.securityKey !== 'string') continue;
      const key = stable([account, row.securityKey, row.memberId ?? null]);
      if (!relatedByHolding.has(key)) relatedByHolding.set(key, []);
      relatedByHolding.get(key).push({ document: doc.docKey, revision: revisionOf(doc), pointer: `/${section}/${i}` });
    }
  }
  return position => positionEvidencePrepared(position, documentsByKey, accountsByKey, relatedByHolding, revisionOf);
}
export function positionEvidence(position, documents, accounts) {
  return positionEvidenceReader(documents, accounts)(position);
}
function positionEvidencePrepared(position, documentsByKey, accountsByKey, relatedByHolding, revisionOf) {
  const locator = position.statementRecord;
  if (!locator) return { identity: holdingKey(position), kind: position.review ? 'review' : 'unresolved',
    reason: position.review ? 'Family review: use its recorded workbook row and supplementary evidence.' : 'No selected statement record was retained by this book version.',
    review: position.reviewSource ?? null, supplementary: position.recoveredCost?.evidence ?? [] };
  const doc = documentsByKey.get(locator.document);
  const match = /^\/holdings\/(\d+)$/.exec(locator.pointer);
  const row = match && doc?.holdings?.[Number(match[1])];
  if (!row || row.securityKey !== position.securityKey || (row.memberId ?? null) !== (position.memberId ?? null)) throw new Error(`Wrong statement row for ${holdingKey(position)}`);
  const account = accountsByKey.get(position.accountId);
  if (!account || account.provider !== doc.provider || String(account.accountNo) !== String(doc.accountNo) || account.ownerId !== doc.ownerId) throw new Error(`Wrong statement account for ${holdingKey(position)}`);
  // A line the family advised is held at what was paid: the statement witnesses its units, not its value.
  const atAdvisedCost = position.costBasisSource === 'family-advice' && position.valuedAtCost === true;
  if (row.quantity !== position.quantity || (!atAdvisedCost && Math.abs(row.marketValue - position.marketValue) > 0.01)) throw new Error(`Statement value/quantity changed for ${holdingKey(position)}`);
  const ref = field => ({ document: doc.docKey, revision: revisionOf(doc), pointer: `${locator.pointer}/${field}` });
  const related = relatedByHolding.get(stable([accountKey(doc), position.securityKey, position.memberId ?? null])) ?? [];
  return { identity: holdingKey(position), kind: 'statement', record: { document: doc.docKey, revision: revisionOf(doc), pointer: locator.pointer },
    fields: {
      quantity: { inputs: [ref('quantity')] }, currentPrice: { inputs: [ref('marketPrice')] },
      marketValue: atAdvisedCost ? { inputs: [], method: 'family-advice' } : { inputs: [ref('marketValue')] },
      costBasis: { inputs: position.costBasisSource ? [] : [ref('totalCost')], method: position.costBasisSource ?? 'statement',
        statementComparison: ref('totalCost'), supportingRecords: related, supplementary: position.recoveredCost?.evidence ?? [] },
      unrealizedPnL: { formula: 'round(marketValue - costBasis, 2)', inputs: ['marketValue', 'costBasis'] },
      returnPct: { formula: '(unrealizedPnL + realizedPnL + dividendReceived) / (costBasis + costOfUnitsSold) * 100',
        inputs: ['unrealizedPnL', 'realizedPnL', 'dividendReceived', 'costBasis', 'costOfUnitsSold'] },
    }, supportingRecords: related };
}
