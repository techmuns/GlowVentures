// Reviewed custody-to-folio continuity. Owner + ISIN alone is insufficient:
// Ajay also owns a separate, redeemed non-demat Motilal arbitrage folio.
// Bandhan's 26 October statement acknowledges rematerialisation on 7 October
// for these two schemes. Keep the account link explicit and verify its source
// on every book build; future statements of this same folio then take over.
export const CUSTODY_FOLIO_LINKS = Object.freeze([
  ...['INF194K01Y60', 'INF194K01V89'].map(isin => ({
    custodyAccountId: 'motilal-oswal-financial-services-demat-1201090012539150',
    fundAccountId: 'bandhan-mutual-fund-8652064', ownerId: 'ajay-jaisinghani', isin,
    document: 'bandhan-mutual-fund-8652064-2026-10-26-holdings', rematOn: '2026-10-07',
  })),
]);

export function verifyCustodyLinks(positions, accounts, documents, links = CUSTODY_FOLIO_LINKS) {
  const acc = new Map(accounts.map(a => [a.accountId, a]));
  const docs = new Map(documents.map(d => [d.docKey, d]));
  for (const link of links) {
    const newer = acc.get(link.fundAccountId), older = acc.get(link.custodyAccountId);
    if (!newer || !older) continue;
    const evidence = docs.get(link.document);
    const holdingIndex = evidence?.holdings?.findIndex(h => h.isin === link.isin && h.custodyRematOn === link.rematOn) ?? -1;
    if (older.ownerId !== link.ownerId || newer.ownerId !== link.ownerId
      || evidence?.ownerId !== link.ownerId || evidence.status !== 'ok' || holdingIndex < 0
      || !(link.rematOn <= evidence.asOf && evidence.asOf <= newer.asOf)) {
      throw new Error(`Custody continuity is not verified: ${link.custodyAccountId} / ${link.isin}`);
    }
    const selected = positions.filter(p => p.accountId === link.fundAccountId && p.isin === link.isin
      && Number.isFinite(p.quantity) && p.quantity >= 0 && p.statementRecord);
    if (selected.length !== 1) throw new Error(`Custody successor is missing or ambiguous: ${link.fundAccountId} / ${link.isin}`);
    selected[0].custodyPredecessors = [...new Set([...(selected[0].custodyPredecessors ?? []), link.custodyAccountId])];
    selected[0].custodyEvidence = { document: evidence.docKey, pointer: `/holdings/${holdingIndex}`, effectiveOn: link.rematOn };
  }
}

/** A verified successor, including a measured zero, replaces only an OLDER
 * balance of this exact owner/account/ISIN. Equal dates and ambiguity abstain. */
export function custodySuccessor(holding, accounts, positions) {
  const acc = new Map(accounts.map(a => [a.accountId, a]));
  const old = acc.get(holding.accountId), asOf = holding.asOf ?? holding.periodTo ?? old?.asOf;
  if (!old?.ownerId || !asOf || !holding.isin) return null;
  const matches = positions.filter(p => p.accountId !== holding.accountId && p.isin === holding.isin
    && p.custodyPredecessors?.includes(holding.accountId) && p.custodyEvidence && p.statementRecord
    && asOf < p.custodyEvidence.effectiveOn
    && Number.isFinite(p.quantity) && p.quantity >= 0
    && acc.get(p.accountId)?.ownerId === old.ownerId && acc.get(p.accountId)?.asOf > asOf);
  return matches.length === 1 ? matches[0] : null;
}
