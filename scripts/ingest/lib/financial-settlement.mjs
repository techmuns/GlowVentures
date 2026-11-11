import { decimalMinor } from '../../../shared/financialArithmetic.mjs';
const at = (object, pointer) => {
  if (!pointer?.startsWith('/')) return undefined;
  for (const part of pointer.slice(1).split('/').map(x => x.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!object || typeof object !== 'object' || !Object.hasOwn(object, part)) return undefined;
    object = object[part];
  }
  return object;
};
/** Reconcile trade/income/capital settlement to an independently supplied bank
 * chain. Exact references plus exact minor amounts are required. A coincidentally
 * equal payment is never evidence of ownership or an internal transfer. */
export function reconcileSettlements(events, documents, accounts, mappings) {
  const checks = [], docs = new Map(documents.map(d => [d.docKey, d])), account = new Map(accounts.map(a => [a.accountId, a]));
  const consumed = new Set();
  for (const a of accounts) {
    const links = mappings.filter(m => m.accountId === a.accountId);
    if (!links.length) { checks.push({ kind: 'bank-trade-settlement', accountId: a.accountId, status: 'unavailable', reason: 'No verified settlement-bank mapping has been supplied.' }); continue; }
    for (const mapping of links) {
      const witness = docs.get(mapping.evidence?.document);
      if (!witness || at(witness, mapping.evidence?.pointer) == null || !mapping.bankProvider || !mapping.bankAccountNo) {
        checks.push({ kind: 'bank-trade-settlement', accountId: a.accountId, status: 'disputed', reason: 'The bank-account mapping has no inspectable source witness.' }); continue;
      }
      const bank = documents.filter(d => d.provider === mapping.bankProvider && String(d.accountNo) === String(mapping.bankAccountNo));
      if (!bank.length || bank.some(d => d.ownerId !== account.get(a.accountId)?.ownerId)) {
        checks.push({ kind: 'bank-trade-settlement', accountId: a.accountId, status: 'disputed', reason: 'The mapped bank account is absent or belongs to another recorded holder.' }); continue;
      }
      const groups = new Map();
      for (const event of events.filter(e => e.accountId === a.accountId && (!mapping.from || e.date >= mapping.from) && (!mapping.to || e.date <= mapping.to))) {
        if (event.status === 'supporting-evidence') continue;
        if (!event.reference || event.amountMinor == null || event.cashAmountMinor === null) { checks.push({ kind: 'bank-trade-settlement', eventId: event.id, accountId: a.accountId, status: 'unavailable', reason: 'The event has no verified settlement reference or amount.' }); continue; }
        const key = JSON.stringify([event.reference, event.settlementDate ?? event.date]);
        (groups.get(key) ?? groups.set(key, []).get(key)).push(event);
      }
      for (const group of groups.values()) {
        const first = group[0], date = first.settlementDate ?? first.date, amount = group.reduce((sum, e) => sum + BigInt(e.cashAmountMinor ?? e.amountMinor), 0n);
        const matches = bank.flatMap(d => (d.cashFlows ?? []).flatMap((row, i) => row.kind === 'bank-statement' && row.reference === first.reference && row.date === date
          ? [{ document: d.docKey, pointer: `/cashFlows/${i}`, row }] : []));
        const checked = matches.filter(m => (m.row.credit != null || m.row.debit != null)
          && decimalMinor(m.row.credit ?? 0) - decimalMinor(m.row.debit ?? 0) === amount);
        const chosen = checked.length === 1 ? checked[0] : null, key = chosen ? `${chosen.document}${chosen.pointer}` : null;
        const status = chosen && !consumed.has(key) ? 'reconciled' : matches.length ? 'disputed' : 'unavailable';
        if (status === 'reconciled') {
          consumed.add(key);
          for (const e of group) {
            e.settlementEvidence = { document: chosen.document, pointer: chosen.pointer };
            if (e.kind === 'capital') e.familyExternality = 'internal-verified-owned-bank-transfer';
          }
        }
        checks.push({ kind: 'bank-trade-settlement', accountId: a.accountId, eventIds: group.map(e => e.id), reference: first.reference,
          status, expectedMinor: String(amount), currency: 'INR', evidence: chosen ? { document: chosen.document, pointer: chosen.pointer } : null,
          reason: status === 'reconciled' ? null : matches.length ? 'The reference is ambiguous, already consumed or does not settle to the same amount.' : 'No bank row carries the exact reference and settlement date.' });
      }
    }
  }
  return checks;
}

/** Sum positions over evidenced ownership paths. Unknown fractions block an
 * allocated total; duplicate paths are added once per position with an explicit
 * bound of one whole. Reporting groups are traversed as groups, not legal owners. */
export function ownershipExposure(graph, metrics, root, on) {
  const outgoing = new Map(), issues = [], weights = new Map();
  for (const edge of graph.edges) if (['owns', 'reports-for', 'holds'].includes(edge.relationship)
    && (!edge.from || edge.from <= on) && (!edge.to || on < edge.to))
    (outgoing.get(edge.owner) ?? outgoing.set(edge.owner, []).get(edge.owner)).push(edge);
  const node = new Map(graph.nodes.map(n => [n.id, n]));
  const walk = (id, weight, path) => {
    if (path.has(id)) { issues.push({ code: 'OWNERSHIP_CYCLE', id }); return; }
    const n = node.get(id);
    if (!n) { issues.push({ code: 'MISSING_ENTITY', id }); return; }
    if (n.kind === 'position') { weights.set(id, (weights.get(id) ?? 0) + weight); return; }
    for (const edge of outgoing.get(id) ?? []) {
      if (edge.fraction == null) { issues.push({ code: 'UNKNOWN_OWNERSHIP_FRACTION', id: edge.id }); continue; }
      walk(edge.owned, weight * edge.fraction, new Set([...path, id]));
    }
  };
  walk(root, 1, new Set());
  const lines = [];
  for (const [id, fraction] of weights) {
    const metric = metrics.find(m => m.positionId === id && m.metric === 'marketValue');
    if (fraction > 1 + 1e-10) issues.push({ code: 'OWNERSHIP_EXCEEDS_WHOLE', id });
    lines.push({ positionId: id, fraction, value: metric?.value == null || fraction > 1 + 1e-10 ? null : metric.value * fraction,
      status: metric?.status ?? 'missing', effectiveDate: metric?.effectiveDate ?? null });
  }
  const complete = issues.length === 0 && lines.every(l => l.value != null && ['source-backed', 'entered'].includes(l.status));
  return { root, on, lines, complete, value: complete ? lines.reduce((sum, line) => sum + line.value, 0) : null, issues };
}
