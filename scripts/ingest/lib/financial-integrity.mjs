import ownershipRegistry from '../../../config/ownership-relationships.json' with { type: 'json' };
import settlementRegistry from '../../../config/settlement-accounts.json' with { type: 'json' };
import { reconcileSettlements, ownershipExposure } from './financial-settlement.mjs';
// One versioned financial contract for offline builds and request-time intake.
// Missing observations remain missing. A balanced settlement journal is not a
// claim that purchase lots, bank funding or beneficial ownership were supplied.
import { createHash } from 'node:crypto';
import seedRegistry from '../../../config/financial-identities.json' with { type: 'json' };
import { currentIsin } from '../../../shared/isinSuccessors.mjs';
import { securityKeyOf } from '../../../shared/securityKey.mjs';
import { decimalMinor, sumMoney, moneyEqual, roundMoney } from '../../../shared/financialArithmetic.mjs';
import { capitalIssues } from '../../../shared/capitalValidation.mjs';
import { CAPITAL_TERMS } from '../../../shared/capitalTerms.mjs';
import { reconciliationReview, RECONCILIATION_EXCEPTIONS, reviewDocumentRevision } from './reconciliation-policy.mjs';
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined && k !== 'integrity').map(k => [k, canonical(v[k])])) : v;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const positionKey = p => JSON.stringify([p.accountId, p.memberId ?? null, p.securityKey]);
const source = (p, field) => p.statementRecord ? { document: p.statementRecord.document, pointer: `${p.statementRecord.pointer}/${field}` }
  : p.reviewSource ? { kind: 'family-review', ...p.reviewSource, field } : { kind: 'canonical-record', field };
const sourceField = { marketValue: 'marketValue', costBasis: 'totalCost', quantity: 'quantity', currentPrice: 'marketPrice', avgCost: 'unitCost' };

export function financialRegistry(positions, previous = seedRegistry) {
  const entries = structuredClone(previous.instruments ?? []), byKey = new Map(), byIsin = new Map(), byId = new Map(), issues = [];
  const register = e => {
    if (!e.id || byId.has(e.id) && byId.get(e.id) !== e) issues.push({ code: 'DUPLICATE_INSTRUMENT_ID', id: e.id });
    else byId.set(e.id, e);
    for (const key of e.keys) { const k = securityKeyOf(key); if (byKey.has(k) && byKey.get(k).id !== e.id) issues.push({ code: 'IDENTITY_KEY_CONFLICT', key: k }); else byKey.set(k, e); }
    for (const raw of e.isins) { const isin = currentIsin(raw); if (byIsin.has(isin) && byIsin.get(isin).id !== e.id) issues.push({ code: 'IDENTITY_ISIN_CONFLICT', isin }); else byIsin.set(isin, e); }
  };
  for (const e of entries) register(e);
  for (const p of [...positions].sort((a, b) => a.securityKey.localeCompare(b.securityKey))) {
    const key = securityKeyOf(p.securityKey), isin = p.isin ? currentIsin(p.isin) : null;
    const named = byKey.get(key), identified = isin ? byIsin.get(isin) : null;
    if (named && identified && named.id !== identified.id) { issues.push({ code: 'IDENTITY_MERGE_NEEDS_REVIEW', key, isin }); continue; }
    if (named && isin && named.isins.length && !named.isins.map(currentIsin).includes(isin)) { issues.push({ code: 'SECURITY_IDENTIFIER_CONFLICT', key, isin }); continue; }
    const e = identified ?? named ?? { id: `instrument-${hash(['instrument', key]).slice(0, 24)}`, keys: [], isins: [] };
    if (!named && !identified) entries.push(e);
    if (!e.keys.includes(key)) e.keys.push(key);
    if (isin && !e.isins.includes(isin)) e.isins.push(isin);
    e.keys.sort(); e.isins.sort(); register(e);
  }
  return { registry: { schemaVersion: 1, instruments: entries.sort((a, b) => a.id.localeCompare(b.id)) }, byKey, issues };
}

/** Validate an effective-dated ownership graph before any path can be summed. */
export function validateOwnershipGraph(nodes, edges) {
  const ids = new Set(), issues = [];
  for (const n of nodes) { if (!n.id || ids.has(n.id)) issues.push({ code: 'DUPLICATE_ENTITY', id: n.id }); ids.add(n.id); }
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!edge.id || edgeIds.has(edge.id)) issues.push({ code: 'DUPLICATE_RELATIONSHIP', id: edge.id });
    edgeIds.add(edge.id);
  }
  const owns = edges.filter(e => e.relationship === 'owns');
  for (const e of owns) {
    if (!ids.has(e.owner) || !ids.has(e.owned)) issues.push({ code: 'DANGLING_OWNERSHIP', id: e.id });
    if ((e.from != null && !day(e.from)) || (e.to != null && !day(e.to)) || (e.from && e.to && e.from >= e.to)) issues.push({ code: 'INVALID_OWNERSHIP_WINDOW', id: e.id });
    if (e.fraction != null && (!finite(e.fraction) || e.fraction < 0 || e.fraction > 1)) issues.push({ code: 'INVALID_OWNERSHIP_FRACTION', id: e.id });
  }
  // Topology and fraction sums are checked on each interval: disjoint historical
  // owners must not be mistaken for simultaneous ownership or a cycle.
  const dates = [...new Set(['0000-00-00', ...owns.flatMap(e => [e.from, e.to]).filter(Boolean)])].sort();
  for (const on of dates) {
    const active = owns.filter(e => (!e.from || e.from <= on) && (!e.to || on < e.to)), next = new Map(), totals = new Map();
    for (const e of active) {
      (next.get(e.owner) ?? next.set(e.owner, []).get(e.owner)).push(e.owned);
      if (e.fraction != null) totals.set(e.owned, (totals.get(e.owned) ?? 0) + e.fraction);
    }
    for (const [owned, fraction] of totals) if (fraction > 1 + 1e-10) issues.push({ code: 'OWNERSHIP_EXCEEDS_WHOLE', owned, on });
    const seen = new Set(), visiting = new Set();
    const visit = id => { if (visiting.has(id)) return false; if (seen.has(id)) return true; visiting.add(id);
      for (const child of next.get(id) ?? []) if (!visit(child)) return false; visiting.delete(id); seen.add(id); return true; };
    if ([...ids].some(id => !visit(id))) issues.push({ code: 'OWNERSHIP_CYCLE', on });
  }
  return issues;
}

export function buildFinancialIntegrity(book, documents, { report = null, registry = seedRegistry, readerRevision = null, bookRevision = null, evaluationDate = new Date().toISOString().slice(0, 10), ownership = ownershipRegistry, settlementMappings = settlementRegistry.mappings } = {}) {
  const positions = book.BOOK_POSITIONS ?? [], accounts = book.BOOK_ACCOUNTS ?? [], accountById = new Map(accounts.map(a => [a.accountId, a]));
  const identities = financialRegistry(positions, registry), issues = [...identities.issues];
  if (!report) {
    const present = new Set(documents.map(d => d.docKey));
    report = {};
    for (const e of RECONCILIATION_EXCEPTIONS) if (Object.keys(e.documentRevisions ?? {}).every(key => present.has(key)))
      (report[e.section] ??= []).push(e.finding);
  }
  const reviews = reconciliationReview(report, { on: evaluationDate, documentRevisions: new Map(documents.map(d => [d.docKey, reviewDocumentRevision(d)])) });
  if (!day(evaluationDate)) issues.push({ code: 'INVALID_REVIEW_EVALUATION_DATE' });
  for (const review of reviews) if (review.status === 'needs-review') issues.push({ code: 'RECONCILIATION_REVIEW_REQUIRED', id: review.id, section: review.section });
  const nodes = [], edges = [], metrics = [], checks = [], events = [];
  const node = new Map(), addNode = n => { if (!node.has(n.id)) { node.set(n.id, n); nodes.push(n); } };
  for (const owner of book.BOOK_OWNERS ?? []) { const id = owner.ownerId ?? owner.id; if (id) addNode({ id: `owner:${id}`, kind: 'owner', label: owner.name ?? owner.displayName ?? id }); }
  for (const a of accounts) {
    const ownerId = `owner:${a.ownerId ?? 'unattributed'}`;
    addNode({ id: ownerId, kind: a.ownerId ? 'owner' : 'unattributed', label: a.owner, verification: a.ownerId ? 'canonical-holder' : 'unknown' });
    addNode({ id: `account:${a.accountId}`, kind: a.reviewHolder ? 'reporting-group' : 'account', label: a.accountNo, provider: a.provider, asOf: a.asOf, verifiedNil: book.BOOK_ACCOUNT_RETURN_RECORDS?.[a.accountId]?.record?.value === 0 });
    edges.push({ id: `holder:${a.accountId}`, owner: ownerId, owned: `account:${a.accountId}`, relationship: a.reviewHolder ? 'reports-for' : 'owns',
      fraction: 1, from: null, to: null, observedAsOf: a.asOf, basis: 'holder-of-record', evidence: { accountId: a.accountId } });
    if (a.demat?.printed) {
      const d = a.demat.printed, id = `custody:${d.depository}:${d.dpId}:${d.clientId}`;
      addNode({ id, kind: 'custody-account', label: d.participant, asOf: d.asOf });
      edges.push({ id: `custody:${a.accountId}`, owner: `account:${a.accountId}`, owned: id, relationship: 'custodied-at', evidence: { documents: d.documents } });
    }
  }
  const overrides = book.BOOK_OWNERSHIP_RELATIONSHIPS ?? [];
  edges.push(...(ownership.edges ?? []), ...overrides);
  const holdingIds = new Set();
  for (const p of positions) {
    for (const field of ['quantity', 'marketValue', 'costBasis']) if (p[field] != null && !finite(p[field])) issues.push({ code: 'INVALID_FINANCIAL_NUMBER', position: positionKey(p), field });
    const instrument = identities.byKey.get(securityKeyOf(p.securityKey)), a = accountById.get(p.accountId);
    if (!instrument || !a) { issues.push({ code: 'UNRESOLVED_POSITION_IDENTITY', position: positionKey(p) }); continue; }
    const id = `position-${hash([p.accountId, p.memberId ?? null, instrument.id]).slice(0, 24)}`;
    if (holdingIds.has(id)) issues.push({ code: 'DUPLICATE_ECONOMIC_POSITION', position: id });
    holdingIds.add(id);
    addNode({ id: instrument.id, kind: 'instrument', keys: instrument.keys, isins: instrument.isins, label: p.security, assetClass: p.assetClass,
      verification: instrument.isins.length ? 'identifier-witnessed' : 'canonical-name-record' });
    addNode({ id, kind: 'position', accountId: p.accountId, memberId: p.memberId ?? null, instrument: instrument.id, quantity: p.quantity == null ? null : String(p.quantity), asOf: a.asOf });
    edges.push({ id: `holds:${id}`, owner: `account:${p.accountId}`, owned: id, relationship: 'holds', fraction: 1, evidence: source(p, 'quantity') });
    edges.push({ id: `instrument:${id}`, owner: id, owned: instrument.id, relationship: 'position-in', evidence: source(p, 'securityKey') });
    const related = reviews.filter(r => r.finding.docKey === p.statementRecord?.document && (!r.finding.securityKey || r.finding.securityKey === p.securityKey)
      && (!r.review?.affectedSecurityKeys || r.review.affectedSecurityKeys.includes(p.securityKey)));
    const positionIndex = positions.indexOf(p);
    const selected = documents.find(d => d.docKey === p.statementRecord?.document)?.holdings?.[Number(p.statementRecord?.pointer?.split('/').at(-1))];
    const metric = (name, value, basis, formula, dependencies) => {
      const unit = name === 'quantity' ? 'units' : name === 'returnPct' ? 'percent' : ['currentPrice', 'avgCost'].includes(name) ? 'money-per-unit' : 'money';
      const disputed = related.filter(r => r.review?.disposition === 'withhold-affected-claim' || !r.review)
        .filter(r => { const affected = r.review?.affectedMetrics ?? [r.finding.field ?? 'marketValue']; return affected.includes(name) || dependencies.some(field => affected.includes(field)); });
      let status = value == null ? 'missing' : disputed.length ? 'disputed' : p.valuedAtCost && ['marketValue', 'unrealizedPnL'].includes(name) ? 'at-cost' : 'source-backed';
      const required = name === 'unrealizedPnL' ? [p.marketValue, p.costBasis] : [value];
      if (required.some(v => v == null)) status = 'missing';
      const effectiveDate = ['marketValue', 'currentPrice', 'unrealizedPnL', 'returnPct'].includes(name) ? p.priceAsOf ?? a.asOf : a.asOf;
      const item = { id: `${id}:${name}`, positionId: id, accountId: p.accountId, securityKey: p.securityKey, memberId: p.memberId ?? null,
        metric: name, value: status === 'missing' ? null : value, amountMinor: finite(value) && unit === 'money' ? String(decimalMinor(value)) : null,
        usableValue: status === 'source-backed' ? value : null, valueDecimal: finite(value) ? String(value) : null,
        unit, currency: ['money', 'money-per-unit'].includes(unit) ? 'INR' : null, scale: unit === 'money' ? 2 : null,
        currencyBasis: 'canonical INR adapter contract', basis, status, effectiveDate, quantityAsOf: a.asOf, receivedAt: null,
        formula, formulaVersion: 'financial-integrity-v1', inputs: dependencies,
        evidence: name === 'costBasis' && p.recoveredCost ? { kind: 'reconciled-acquisition-record', references: p.recoveredCost.evidence, accountId: p.accountId, isin: p.isin }
          : ['unrealizedPnL', 'returnPct', 'realizedPnL', 'costOfUnitsSold', 'dividendReceived'].includes(name) || name === 'avgCost' && p.avgCostDerived || selected && sourceField[name] && selected[sourceField[name]] !== value
            ? { kind: 'canonical-projection', canonicalPointer: `/BOOK_POSITIONS/${positionIndex}/${name}`, inputs: dependencies.map(field => `/BOOK_POSITIONS/${positionIndex}/${field}`),
              note: 'Derived or combined from the canonical records; this is not claimed as a directly printed holding field.' }
            : source(p, sourceField[name] ?? name),
        exceptions: disputed.map(r => r.id), asOf: book.BOOK_AS_OF, readerRevision, bookRevision };
      const ageDays = day(effectiveDate) ? Math.max(0, Math.floor((Date.parse(book.BOOK_AS_OF) - Date.parse(effectiveDate)) / 86400000)) : null;
      item.freshness = { evaluatedOn: book.BOOK_AS_OF, ageDays, basis: 'dated source observation; not a claim of a current market mark' };
      metrics.push(item); return item;
    };
    metric('quantity', p.quantity, 'statement-unit-balance', 'selected quantity', ['quantity']);
    metric('costBasis', p.costBasis, p.recoveredCost ? 'reconciled-acquisition-record' : 'statement-or-family-review', 'selected cost of units held', ['costBasis']);
    metric('marketValue', p.marketValue, p.valuedAtCost ? 'carrying-cost' : 'statement-valuation', p.valuedAtCost ? 'carrying acquisition cost; no independently measured valuation' : 'selected statement valuation; quantity × price where both are measured', ['quantity', 'currentPrice']);
    for (const name of ['currentPrice', 'avgCost', 'realizedPnL', 'costOfUnitsSold', 'dividendReceived', 'returnPct']) {
      const formula = name === 'returnPct' ? '(marketValue - costBasis + realizedPnL + dividendReceived) / (costBasis + costOfUnitsSold) * 100; subject to holding-return coverage gates'
        : name === 'avgCost' ? p.avgCostDerived ? 'costBasis / quantity' : 'selected printed unit cost' : name === 'currentPrice' ? 'selected statement price' : 'selected source record';
      metric(name, p[name] ?? null, name === 'returnPct' ? 'derived-holding-period-return' : 'statement-or-reconciled-record', formula, name === 'returnPct' ? ['marketValue', 'costBasis', 'realizedPnL', 'costOfUnitsSold', 'dividendReceived'] : [name]);
    }
    metric('unrealizedPnL', p.valuedAtCost || p.costBasis == null ? null : roundMoney(p.marketValue - p.costBasis), 'derived', 'marketValue - costBasis', ['marketValue', 'costBasis']);
    const key = `${p.accountId}|${p.securityKey}`, lots = book.BOOK_HOLDING_LOTS?.[key] ?? [];
    if (lots.length && p.quantity != null) {
      const units = lots.reduce((sum, lot) => sum + decimalMinor(lot.quantity, 9), 0n), expected = decimalMinor(p.quantity, 9);
      const delta = units - expected;
      checks.push({ kind: 'unit-lots', positionId: id, status: (delta < 0n ? -delta : delta) <= 500000n ? 'reconciled' : p.heldSince ? 'disputed' : 'unavailable', differenceUnits: String(delta), scale: 9,
        evidence: { canonicalPointer: `/BOOK_HOLDING_LOTS/${key}` } });
      if ((delta < 0n ? -delta : delta) <= 500000n && lots.every(l => finite(l.cost)) && p.costBasis != null) {
        const total = sumMoney(lots.map(l => l.cost));
        checks.push({ kind: 'cost-lots', positionId: id, status: moneyEqual(total, p.costBasis) ? 'reconciled' : 'disputed', amountMinor: String(decimalMinor(total)),
          holdingCostMinor: String(decimalMinor(p.costBasis)), currency: 'INR', evidence: { canonicalPointer: `/BOOK_HOLDING_LOTS/${key}` } });
      }
    } else checks.push({ kind: 'unit-lots', positionId: id, status: 'unavailable', reason: 'A complete opening/closing lot record is not supplied.' });
    if (p.tradeRecord) checks.push({ kind: 'unit-transactions', positionId: id, status: p.tradeRecord.unaccounted === 0 ? 'reconciled' : 'unavailable',
      from: p.tradeRecord.from, to: p.tradeRecord.to, unaccounted: p.tradeRecord.unaccounted, reason: p.tradeRecord.reason ?? null,
      evidence: { canonicalPointer: `/BOOK_HOLDING_TRADES/${key}` } });
  }
  const eventOccurrences = new Map();
  const event = (facts, pointer, cashAccount, contraAccount) => {
    const base = hash(facts), occurrence = eventOccurrences.get(base) ?? 0; eventOccurrences.set(base, occurrence + 1);
    const amount = facts.amount;
    const minor = finite(amount) ? decimalMinor(amount) : null;
    events.push({ id: `event-${hash([base, occurrence]).slice(0, 24)}`, ...facts, currency: 'INR', scale: 2,
      amountMinor: minor == null ? null : String(minor), cashAmountMinor: facts.cashAmount === null || minor == null ? null : String(minor), evidence: { canonicalPointer: pointer },
      status: !day(facts.date) || minor == null ? 'incomplete' : 'recorded',
      familyExternality: facts.kind === 'capital' ? 'unresolved-without-bank-link' : 'internal-investment-activity',
      postings: minor == null ? [] : [{ account: cashAccount, amountMinor: String(minor) }, { account: contraAccount, amountMinor: String(-minor) }],
      journalBasis: 'balanced settlement control; independent funding and acquisition-cost reconciliation is separate' });
  };
  for (const [key, trades] of Object.entries(book.BOOK_HOLDING_TRADES ?? {})) trades.forEach((t, i) => {
    const [accountId, securityKey] = key.split('|');
    event({ kind: 'trade', accountId, securityKey, date: t.date, reference: t.reference ?? null, settlementDate: t.settlementDate ?? null, side: t.side, quantity: t.quantity ?? null, amount: t.amount == null ? null : t.side === 'buy' ? -t.amount : t.amount },
      `/BOOK_HOLDING_TRADES/${key}/${i}`, `cash:${accountId}`, `trade-settlement:${accountId}:${securityKey}`);
  });
  for (const [key, income] of Object.entries(book.BOOK_HOLDING_INCOME ?? {})) income.forEach((t, i) => {
    const [accountId, securityKey] = key.split('|'); event({ kind: 'income', accountId, securityKey, date: t.date, reference: t.reference ?? null, settlementDate: t.settlementDate ?? null, amount: t.amount, cashAmount: null, cashBasis: 'gross-income; cash receipt and withholding require their own evidence' },
      `/BOOK_HOLDING_INCOME/${key}/${i}`, `income-receivable:${accountId}`, `investment-income:${accountId}`);
  });
  (book.BOOK_CAPITAL_MOVES ?? []).forEach((m, i) => event({ kind: 'capital', accountId: m.accountId, securityKey: m.securityKey ?? null, date: m.date,
    direction: m.direction, reference: m.reference ?? null, settlementDate: m.settlementDate ?? null, cashAmount: m.nonCash || /reinvest/i.test(m.label ?? '') ? null : undefined, amount: m.amount == null ? null : m.direction === 'in' ? m.amount : -m.amount }, `/BOOK_CAPITAL_MOVES/${i}`, `cash:${m.accountId}`, `funding-unmatched:${m.accountId}`));
  (book.BOOK_CORPORATE_ACTIONS ?? []).forEach((action, i) => events.push({ id: `notice-${hash(action).slice(0, 24)}`, kind: 'corporate-action-notice',
    accountId: action.accountId, securityKey: action.securityKey, date: action.exDate, action: action.kind, quantity: action.quantity,
    reportedAmount: action.amount, amountMinor: null, cashAmountMinor: null, postings: [], status: 'supporting-evidence',
    economicRole: 'notice; never posted again as a cash payment', evidence: { document: action.source, canonicalPointer: `/BOOK_CORPORATE_ACTIONS/${i}` } }));
  for (const [key, movement] of Object.entries(book.BOOK_SHARE_MOVEMENTS ?? {})) {
    const values = ['opening', 'unitsIn', 'unitsOut', 'corporateAction', 'closing'];
    if (values.every(field => finite(movement[field]))) {
      const delta = decimalMinor(movement.opening, 9) + decimalMinor(movement.unitsIn, 9) - decimalMinor(movement.unitsOut, 9)
        + decimalMinor(movement.corporateAction, 9) - decimalMinor(movement.closing, 9);
      checks.push({ kind: 'custody-unit-roll', accountId: movement.accountId, securityKey: movement.securityKey,
        status: movement.unclassified ? 'unavailable' : (delta < 0n ? -delta : delta) <= 500000n ? 'reconciled' : 'disputed',
        differenceUnits: String(delta), scale: 9, from: movement.periodFrom, to: movement.periodTo,
        evidence: { document: movement.source, canonicalPointer: `/BOOK_SHARE_MOVEMENTS/${key}` } });
    }
  }
  for (const document of documents) {
    const rows = (document.cashFlows ?? []).filter(c => c.kind === 'bank-statement');
    if (!rows.length) continue;
    let balance = finite(document.flows?.openingBalance) ? decimalMinor(document.flows.openingBalance) : null;
    let checked = 0, failed = 0;
    for (const row of rows) {
      const next = finite(row.balance) ? decimalMinor(row.balance) : null;
      if (balance != null && next != null && (finite(row.debit) || finite(row.credit))) {
        if (balance + decimalMinor(row.credit ?? 0) - decimalMinor(row.debit ?? 0) !== next) failed++;
        checked++;
      }
      balance = next;
    }
    checks.push({ kind: 'bank-cash-chain', document: document.docKey, status: failed ? 'disputed' : checked ? 'reconciled' : 'unavailable', checked, failed,
      openingKnown: finite(document.flows?.openingBalance), evidence: { document: document.docKey, pointer: '/cashFlows' } });
  }
  for (const c of book.BOOK_COMMITMENTS ?? []) {
    const violations = capitalIssues(c, CAPITAL_TERMS[c.accountId]);
    const missingFields = ['committed', 'called', 'paid', 'undrawn', 'pending'].filter(field => !finite(c[field]));
    if (violations.length) issues.push({ code: 'CAPITAL_DOES_NOT_RECONCILE', accountId: c.accountId, violations });
    checks.push({ kind: 'capital', accountId: c.accountId, status: violations.length ? 'disputed' : missingFields.length ? 'unavailable' : 'reconciled', issues: violations, missingFields,
      reason: !violations.length && missingFields.length ? 'The source does not supply every balance required to reconcile the capital identities.' : null,
      adjustment: CAPITAL_TERMS[c.accountId] ?? null });
  }
  checks.push(...reconcileSettlements(events, documents, accounts, settlementMappings));
  for (const entity of ownership.nodes ?? []) {
    if (node.has(entity.id)) issues.push({ code: 'DUPLICATE_ENTITY', id: entity.id });
    else addNode(entity);
  }
  issues.push(...validateOwnershipGraph(nodes, edges));
  for (const check of checks.filter(c => c.status === 'disputed')) {
    const affected = check.kind === 'cost-lots' ? ['costBasis', 'avgCost', 'unrealizedPnL', 'returnPct']
      : ['unit-lots', 'unit-transactions'].includes(check.kind) ? ['quantity', 'marketValue', 'avgCost', 'unrealizedPnL', 'returnPct'] : [];
    for (const metric of metrics) if (metric.positionId === check.positionId && affected.includes(metric.metric)) {
      metric.status = 'disputed'; metric.usableValue = null;
      (metric.controlFailures ??= []).push({ kind: check.kind, evidence: check.evidence });
    }
  }
  const marketMetrics = metrics.filter(m => m.metric === 'marketValue');
  const hasDispute = marketMetrics.some(m => m.status === 'disputed');
  const totalMeasured = finite(book.BOOK_SUMMARY?.totalValue) && (positions.some(p => finite(p.marketValue))
    || accounts.some(a => book.BOOK_ACCOUNT_RETURN_RECORDS?.[a.accountId]?.record?.value === 0));
  metrics.push({ id: 'portfolio:marketValue', metric: 'marketValue', scope: 'canonical reported book', positionId: null,
    value: totalMeasured ? book.BOOK_SUMMARY.totalValue : null, usableValue: !totalMeasured || hasDispute || positions.some(p => p.valuedAtCost) || book.BOOK_UNVALUED_HOLDINGS?.length ? null : book.BOOK_SUMMARY.totalValue,
    currency: 'INR', unit: 'money', scale: 2, status: !totalMeasured ? 'missing' : hasDispute ? 'disputed' : positions.some(p => p.valuedAtCost) ? 'mixed-basis' : book.BOOK_UNVALUED_HOLDINGS?.length ? 'partial' : 'source-backed',
    effectiveDate: book.BOOK_AS_OF, basis: 'source dates and carrying amounts retained per position',
    formula: 'canonical deduplicated reported values; retained unvalued custody rows are not added as zero or as extra investments',
    formulaVersion: 'financial-integrity-v1', readerRevision, bookRevision, inputs: marketMetrics.map(m => m.id) });
  const summary = {
    positions: positions.length, accounts: accounts.length, missingCost: positions.filter(p => p.costBasis == null).length,
    atCost: positions.filter(p => p.valuedAtCost).length, unvaluedRows: book.BOOK_UNVALUED_HOLDINGS?.length ?? 0,
    metricsByStatus: metrics.reduce((out, m) => ({ ...out, [m.status]: (out[m.status] ?? 0) + 1 }), {}),
    checksByStatus: checks.reduce((out, c) => ({ ...out, [c.status]: (out[c.status] ?? 0) + 1 }), {}),
    reviewedExceptions: reviews.length, unresolvedExceptions: reviews.filter(r => r.status !== 'documented-decision').length,
    accountReturnCoverage: Object.values(book.BOOK_ACCOUNT_RETURN_RECORDS ?? {}).filter(r => r.record).length,
  };
  return { schemaVersion: 1, formulaVersion: 'financial-integrity-v1', asOf: book.BOOK_AS_OF, readerRevision, bookRevision,
    registry: identities.registry, graph: { nodes, edges }, ownership: [...new Set(accounts.map(a => `owner:${a.ownerId ?? 'unattributed'}`))].map(id => ownershipExposure({ nodes, edges }, metrics, id, book.BOOK_AS_OF)), events, metrics, checks, reconciliationReviews: reviews, issues, summary };
}

export function positionIntegrity(integrity) {
  const result = new Map();
  for (const m of integrity.metrics) {
    if (!m.positionId) continue;
    const key = JSON.stringify([m.accountId, m.memberId ?? null, m.securityKey]);
    const record = result.get(key) ?? { positionId: m.positionId, quantityAsOf: m.quantityAsOf, formulaVersion: m.formulaVersion, metrics: {} };
    if (['quantity', 'costBasis', 'marketValue', 'unrealizedPnL'].includes(m.metric)) record.metrics[m.metric] = { status: m.status, basis: m.basis, effectiveDate: m.effectiveDate, exceptions: m.exceptions };
    result.set(key, record);
  }
  return result;
}
