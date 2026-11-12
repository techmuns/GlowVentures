// ── WHAT THE RETURN CARDS MAY START FROM, OFF THE ARCHIVE'S OWN STATEMENTS ──
//
// The three return cards (financial year, calendar year, available history)
// measure every investment from the first value on record in the period
// (the family, 4 Nov 2026; docs/RETURN-COVERAGE-REVIEW.md). The book keeps
// only each account's NEWEST snapshot, so three records the cards need would
// otherwise be lost with the older statements:
//
//   • earlierBalances — the units an older statement of the same account held
//     of a holding the book still carries (ICICI's 31 March balance of ESDS,
//     NSE or Yash). A balance, never a value: a statement priced when it was
//     run (`valueWhenRun`, Stage 10ku) gives its units and nothing else.
//   • statementUnitNavs — the NAV per unit a statement prints for fund units
//     that have no public price, linked to the book's own holding only where
//     the same owner's units tie to the unit (Sanshi's classes on Ajay's demat).
//   • unitWindows — an account whose verified return record is refused but
//     whose consecutive statements this year hold exactly the same units of
//     exactly the same holdings: no money came in or went out between them, so
//     the value moved by the market alone.
//
// Every row names the statement it came from. Nothing here enters a holding,
// a value or a total; the cards read it, labelled, to choose a start date.

const HOLDING_REPORTS = new Set(['holdings', 'appraisal', 'portfolio-snap']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ok = (d) => d && !d.excludedFromBook && d.status === 'ok' && HOLDING_REPORTS.has(d.reportType) && Array.isArray(d.holdings);
/** The earliest statement the cards can open on: before the calendar year opens. */
const SINCE = '2025-12-01';

/**
 * A REVIEWED LINK from a book holding to the ISIN its NAV is printed under on
 * another statement. Sanshi Fund's folio statements print no ISIN; Ajay's ICICI
 * NSDL demat prints both classes by ISIN, with exactly the units his two folios
 * hold (2,341,480.851 of A2, 1,761,264.629 of E). The tie is verified on every
 * build: a link whose units no longer tie throws rather than price a holding
 * off a different security.
 */
export const STATEMENT_NAV_LINKS = Object.freeze([
  { securityKey: 'sanshi-fund-i-open-ended-aif-cat-iii-class-a2', isin: 'INF1ISW22038' },
  { securityKey: 'sanshi-fund-i-open-ended-aif-cat-iii-class-e', isin: 'INF1ISW22079' },
]);

const sameUnits = (a, b) => {
  const units = (d) => new Map(d.holdings.filter((h) => isNum(h.quantity) && h.quantity > 0).map((h) => [h.securityKey, h.quantity]));
  const x = units(a), y = units(b);
  // A statement that rounds its units (Buoyant's appraisal prints one decimal)
  // still ties: the tolerance is the rounding, never a real subscription.
  return x.size > 0 && x.size === y.size && [...x].every(([k, q]) => y.has(k) && Math.abs(y.get(k) - q) <= Math.max(1e-3, 1e-7 * q));
};
const valued = (d) => d.holdings.length > 0 && d.holdings.every((h) => isNum(h.marketValue) && h.valueWhenRun == null);
const corpus = (d) => Math.round(d.holdings.reduce((s, h) => s + h.marketValue, 0) * 100) / 100;

export function periodEvidence({ byAccount, accounts, positions, accountReturnRecords, links = STATEMENT_NAV_LINKS }) {
  const accountOf = new Map(accounts.map((a) => [`${a.provider}::${a.accountNo}`, a]));
  const held = new Map();
  for (const p of positions) (held.get(p.accountId) ?? held.set(p.accountId, []).get(p.accountId)).push(p);

  const earlierBalances = [], unitWindows = {}, navRows = new Map();
  for (const [key, docs] of [...byAccount].sort(([x], [y]) => x.localeCompare(y))) {
    const a = accountOf.get(key);
    if (!a) continue;
    const statements = docs.filter((d) => ok(d) && d.asOf >= SINCE).sort((x, y) => x.asOf.localeCompare(y.asOf) || x.docKey.localeCompare(y.docKey));

    // Older balances of what the book still holds, joined by key, else by ISIN —
    // only where the account has no verified return record of its own, since a
    // verified account is measured whole and never holding by holding.
    const record = accountReturnRecords[a.accountId];
    for (const d of record?.record ? [] : statements.filter((d) => d.asOf < a.asOf)) {
      for (const h of d.holdings) {
        if (!isNum(h.quantity) || !(h.quantity > 0)) continue;
        const p = (held.get(a.accountId) ?? []).find((p) => p.securityKey === h.securityKey || (!!h.isin && h.isin === p.isin));
        if (!p) continue;
        earlierBalances.push({ accountId: a.accountId, securityKey: p.securityKey, isin: h.isin ?? null, asOf: d.asOf, quantity: h.quantity, docKey: d.docKey });
      }
    }

    // Printed NAVs for the linked ISINs, wherever a statement values them.
    for (const d of statements) for (const h of d.holdings) {
      const link = h.isin && links.find((l) => l.isin === h.isin);
      if (!link || !isNum(h.quantity) || !(h.quantity > 0) || !isNum(h.marketValue) || !(h.marketValue > 0) || h.valueWhenRun != null) continue;
      const date = h.priceAsOn ?? d.asOf, row = { date, nav: h.marketValue / h.quantity, quantity: h.quantity, docKey: d.docKey, accountId: a.accountId };
      (navRows.get(link.securityKey) ?? navRows.set(link.securityKey, []).get(link.securityKey)).push(row);
    }

    // Unchanged units across consecutive valued statements, ending on the newest.
    const publicOnly = (held.get(a.accountId) ?? []).length > 0 && (held.get(a.accountId) ?? []).every((p) => p.marketSide !== 'private');
    if (record && !record.record && !record.notApplicable && publicOnly) {
      const byDate = new Map();
      for (const d of statements.filter(valued)) {
        // On one date, the holdings report (exact units) before an appraisal.
        const prior = byDate.get(d.asOf), rank = (x) => (x.reportType === 'holdings' ? 1 : 0);
        if (!prior || rank(d) > rank(prior) || (rank(d) === rank(prior) && d.holdings.length > prior.holdings.length)) byDate.set(d.asOf, d);
      }
      const chain = [...byDate.values()].sort((x, y) => x.asOf.localeCompare(y.asOf));
      let i = chain.length - 1;
      while (i > 0 && sameUnits(chain[i - 1], chain[i])) i--;
      const run = chain.slice(i);
      if (run.length >= 2 && run.at(-1).asOf === a.asOf) {
        unitWindows[a.accountId] = { valuations: run.map((d) => ({ date: d.asOf, value: corpus(d), docKey: d.docKey })),
          evidence: `the same units of the same ${run[0].holdings.filter((h) => h.quantity > 0).length === 1 ? 'holding' : 'holdings'} on every statement from ${run[0].asOf} to ${run.at(-1).asOf}` };
      }
    }
  }

  const statementUnitNavs = {};
  for (const link of links) {
    const rows = (navRows.get(link.securityKey) ?? []).sort((x, y) => x.date.localeCompare(y.date) || x.docKey.localeCompare(y.docKey));
    if (!rows.length) continue;
    const tied = positions.some((p) => p.securityKey === link.securityKey && rows.some((r) => isNum(p.quantity) && Math.abs(p.quantity - r.quantity) <= 1e-3));
    if (!tied) throw new Error(`Statement NAV link is not verified: ${link.securityKey} / ${link.isin} — no book holding ties to the units it is printed on`);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    statementUnitNavs[link.securityKey] = { isin: link.isin, navs: [...byDate.values()].map(({ date, nav, docKey }) => ({ date, nav: Math.round(nav * 1e6) / 1e6, docKey })) };
  }
  earlierBalances.sort((x, y) => x.accountId.localeCompare(y.accountId) || x.securityKey.localeCompare(y.securityKey) || x.asOf.localeCompare(y.asOf) || x.docKey.localeCompare(y.docKey));
  return { earlierBalances, statementUnitNavs, unitWindows };
}
