const number = n => typeof n === 'number' && Number.isFinite(n);
const dayBefore = date => new Date(Date.parse(date) - 86400000).toISOString().slice(0,10);
const r2 = n => Math.round(n * 100) / 100;
const date = d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && Number.isFinite(Date.parse(d))
  && new Date(d).toISOString().slice(0,10) === d;

export function unitClosingDate(doc) {
  if (doc.status === 'failed' || !doc.holdings?.length || doc.holdings.some(h => !number(h.marketValue) || h.marketValue < 0)) return null;
  if (doc.holdings.every(h => h.quantity === 0 && h.marketValue === 0)) return doc.periodTo ?? doc.asOf;
  const dates = new Set(doc.holdings.filter(h => h.quantity > 0).map(h => h.priceAsOn));
  const end = dates.size === 1 ? [...dates][0] : null;
  return date(end) ? end : null;
}

/** A complete unit ledger, including its nil origin or explicit opening units. */
export function unitLedgerReturnRecord(doc, start, historicalNavs = [], allowDormant = false) {
  if (!date(start) || doc.excludedFromBook || doc.status === 'failed'
    || !doc.holdings?.length || !doc.cashFlows?.length
    || doc.warnings?.some(w => /not-published|not-reconciled|unsupported-movement/.test(w.code))) return null;
  const bySecurity = new Map();
  for (const h of doc.holdings) {
    if (!h.securityKey || !number(h.quantity) || h.quantity < 0 || !number(h.marketValue) || h.marketValue < 0
      || bySecurity.has(h.securityKey)) return null;
    bySecurity.set(h.securityKey, { holding: h, rows: [] });
  }
  // A scheme that redeemed to nil still belongs in the walk: its proceeds are
  // cash out. Refuse a truncated ledger or an unrecognised cash movement.
  for (const row of doc.cashFlows) {
    // An IDCW reinvestment (`allotment`) moves units, never external cash; one
    // wholly withheld as TDS prints no amount and no units and moves nothing.
    const nilAllotment = row.kind === 'allotment' && row.units === null && row.amount === null;
    if (!['contribution', 'withdrawal', 'reclassification', 'opening-units', 'allotment'].includes(row.kind)
      || !date(row.date) || (!nilAllotment && (!number(row.units) || !number(row.balance)))
      || !bySecurity.has(row.securityKey)) return null;
    bySecurity.get(row.securityKey).rows.push(row);
  }
  const switches = new Map();
  for (const row of doc.cashFlows.filter(r => r.kind === 'reclassification')) {
    if (!number(row.amount)) return null;
    // The out-leg's settlementDate is the day its in-leg was credited.
    const day = row.amount < 0 ? (row.settlementDate ?? row.date) : row.date;
    const group = switches.get(day) ?? [];
    group.push(row); switches.set(day, group);
  }
  for (const rows of switches.values()) {
    if (!rows.some(r => r.amount < 0) || !rows.some(r => r.amount > 0)
      || Math.abs(rows.reduce((s,r) => s + r.amount,0)) > 1) return null;
  }
  let opening = 0;
  const openingSources = new Set([doc.docKey]);
  for (const { holding: h, rows } of bySecurity.values()) {
    if (!rows.length) return null;
    // Keep the printed sequence for multiple movements on the same date.
    rows.sort((a,b) => a.date.localeCompare(b.date));
    const first = rows[0];
    const explicit = first.kind === 'opening-units';
    if (explicit && (first.date >= start || !date(doc.periodFrom) || doc.periodFrom > start)) return null;
    if (!explicit && (!['contribution','reclassification'].includes(first.kind) || first.units <= 0 || Math.abs(first.units - first.balance) > .001)) return null;
    // A first visible purchase after the FY start does not establish that
    // there were no earlier investments and redemptions in that FY.
    if (!explicit && first.date >= start && !(date(doc.periodFrom) && doc.periodFrom <= start)
      && !/(^|\n)Ledger scope: since inception(\n|$)/.test(first.notes ?? '')) return null;
    let balance = explicit ? first.balance : 0, prior = balance;
    for (const row of rows) {
      if (row.kind === 'opening-units') {
        if (row !== first) return null;
        continue;
      }
      if (row.kind === 'allotment' && row.units === null && row.amount === null) continue;
      if (row.kind === 'allotment' && (!number(row.amount) || row.amount <= 0 || row.units <= 0)) return null;
      if (!number(row.amount) || (row.kind === 'contribution' && (row.amount <= 0 || row.units <= 0))
        || (row.kind === 'withdrawal' && (row.amount >= 0 || row.units >= 0))) return null;
      balance += row.units;
      if (balance < -.001 || Math.abs(balance - row.balance) > .001) return null;
      if (row.date < start) prior = row.balance;
    }
    if (Math.abs(balance - h.quantity) > .001) return null;
    if (prior === 0) continue; // witnessed nil at the start, including a new FY subscription
    const published = historicalNavs.filter(n => n.isin === h.isin && n.date === dayBefore(start) && number(n.nav) && n.nav > 0);
    const sourceNavs = rows.filter(r => r.date === dayBefore(start)).map(r => {
      const match = /post-tax allotment\/redemption NAV ([\d.]+)/.exec(r.notes ?? '');
      return match ? Number(match[1]) : null;
    }).filter(number);
    const marks = [...published.map(n => n.nav), ...sourceNavs];
    if (!marks.length || marks.some(n => n !== marks[0])) return null;
    opening += prior * marks[0];
    for (const n of published) openingSources.add(n.source);
  }
  const end = unitClosingDate(doc);
  if (!date(end) || end < start) return null;
  if (doc.periodTo && doc.periodTo < end) return null;
  if (doc.cashFlows.some(r => r.date > (doc.periodTo ?? doc.asOf))) return null;
  // The marked quantity must be the quantity held on the mark's own date.
  // A later unit movement cannot be closed at an older NAV.
  if (doc.cashFlows.some(r => r.date > end && r.units !== 0)) return null;
  const moves = doc.cashFlows.filter(r => ['contribution','withdrawal'].includes(r.kind) && r.date >= start && r.date <= end);
  if (moves.some(r => /lateral shift|switch/i.test(r.description ?? ''))) return null;
  if (!allowDormant && opening === 0 && !moves.some(r => r.kind === 'contribution')) return null; // dormant/nil throughout the FY has no return
  return { asOf: end, value: r2(doc.holdings.reduce((s,h) => s + h.marketValue,0)),
    flows: [{ date: start, amount: opening === 0 ? 0 : -r2(opening), description: opening === 0
      ? 'Opening portfolio value: nil, witnessed by complete unit ledger'
      : `Opening portfolio value: verified ${dayBefore(start)} NAV × opening units` },
    ...moves.map(r => ({ date: r.date, amount: r2(-r.amount), description: r.description }))],
    source: doc.docKey, flowSources: [doc.docKey], openingSources: [...openingSources],
    capitalRecordTo: end };
}
