// Return endpoints are account valuations, independent of an older security-by-security appraisal.
// A newer endpoint is published only with an unbroken, reconciled capital record through that day.
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const date = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const round = (v) => Math.round(v * 100) / 100;
const nextDay = (v) => new Date(Date.parse(v) + 86400000).toISOString().slice(0, 10);
const closeDate = (d) => d.flows?.periodTo ?? d.periodTo ?? d.asOf;
const sum = (rows) => rows.reduce((n, r) => n + r.amount, 0);

/** A whole register, witnessed at every printed balance, including registers opening from nil. */
export function registerWindow(d) {
  const rows = (d.cashFlows ?? []).filter((r) => r.kind === 'capital-register');
  const opening = rows.find((r) => /^opening balance/i.test(r.description ?? '') && number(r.balance));
  const first = rows.find((r) => !/^opening balance/i.test(r.description ?? ''));
  if (!rows.length || !date(d.asOf) || (!opening && (!first || !number(first.amount)
    || !number(first.balance) || Math.abs(first.balance - first.amount) > 1))) return null;
  const start = opening?.date ?? first.date;
  if (!date(start) || start > d.asOf) return null;
  let balance = opening?.balance ?? 0, previous = start;
  const moves = [];
  for (const row of rows) {
    if (row === opening) continue;
    // Security transfers/class switches do not establish an external cash record.
    if (!date(row.date) || row.date < previous || row.date > d.asOf || !number(row.amount)
      || /security (?:in|out)|switch/i.test(`${row.description ?? ''} ${row.notes ?? ''}`)) return null;
    balance += row.amount;
    if (number(row.balance) && Math.abs(balance - row.balance) > 1) return null;
    previous = row.date;
    if (row.amount !== 0) moves.push({ date: row.date, amount: row.amount, description: row.description });
  }
  if (!number(rows.at(-1)?.balance) || Math.abs(balance - rows.at(-1).balance) > 1) return null;
  return { start, end: d.asOf, opening: opening?.balance ?? 0, closing: balance, moves, source: d.docKey, kind: 'capital' };
}

/** Bank balances include trades, income and expenses; only deposits/withdrawals are external capital. */
export function bankWindow(d) {
  const rows = (d.cashFlows ?? []).filter((r) => r.kind === 'bank-book');
  const first = rows[0];
  if (!first || !/^opening balance/i.test(first.description ?? '') || !number(first.balance)
    || !date(first.date) || !date(d.asOf) || first.date > d.asOf) return null;
  let balance = first.balance, previous = first.date;
  const moves = [], balanceMoves = [];
  for (const r of rows.slice(1)) {
    const posted = r.settlementDate ?? r.date;
    if (!date(r.date) || !date(posted) || posted < previous || posted > d.asOf || !number(r.balance)
      || !['buySellAmount', 'income', 'expenses', 'depositWithdrawal'].every((k) => number(r[k]))) return null;
    const movement = r.buySellAmount + r.income - r.expenses + r.depositWithdrawal;
    balance += movement;
    if (Math.abs(balance - r.balance) > 1) return null;
    previous = posted;
    if (movement) balanceMoves.push({ date: posted, amount: movement });
    if (r.depositWithdrawal) {
      if (r.date < first.date || r.date > d.asOf) return null;
      moves.push({ date: r.date, amount: r.depositWithdrawal, description: r.description });
    }
  }
  return { start: first.date, end: d.asOf, opening: first.balance, closing: balance,
    moves, balanceMoves, source: d.docKey, kind: 'bank' };
}

const buckets = (rows, start, end) => {
  const map = new Map();
  for (const r of rows.filter((r) => r.date >= start && r.date <= end)) {
    const key = `${r.date}:${r.amount < 0 ? 'out' : 'in'}`;
    map.set(key, (map.get(key) ?? 0) + r.amount);
  }
  return map;
};
const agree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && Math.abs(v - b.get(k)) <= 1);

/** Extend through contiguous/overlapping statements only when both balances and overlap agree. */
export function coveringRegister(registers, start, end) {
  const initial = registers.filter((r) => r.start <= start && r.end >= start)
    .sort((a, b) => Number(b.kind === 'capital') - Number(a.kind === 'capital')
      || b.end.localeCompare(a.end) || a.source.localeCompare(b.source));
  for (const seed of initial) {
    let held = { ...seed, moves: [...seed.moves], sources: [seed.source] };
    while (held.end < end) {
      const next = registers.filter((r) => r.end > held.end && r.start >= held.start && r.start <= nextDay(held.end))
        .sort((a, b) => b.end.localeCompare(a.end) || a.source.localeCompare(b.source))
        .find((r) => {
          const before = held.opening + sum((held.balanceMoves ?? held.moves).filter((m) => m.date < r.start));
          return held.kind === r.kind && Math.abs(before - r.opening) <= 1
            && agree(buckets(held.moves, r.start, held.end), buckets(r.moves, r.start, held.end))
            && agree(buckets(held.balanceMoves ?? held.moves, r.start, held.end), buckets(r.balanceMoves ?? r.moves, r.start, held.end));
        });
      if (!next) break;
      held = { ...held, end: next.end, closing: next.closing,
        moves: [...held.moves, ...next.moves.filter((m) => m.date > held.end)],
        ...(held.balanceMoves ? { balanceMoves: [...held.balanceMoves, ...next.balanceMoves.filter((m) => m.date > held.end)] } : {}),
        sources: [...held.sources, next.source] };
    }
    if (held.end >= end) return held;
  }
  return null;
}

const valuationTypes = new Set(['fact-sheet', 'performance-history', 'performance-summary', 'investor-report']);

export function buildAccountReturnRecords({ accounts, accountCashFlows, byAccount }) {
  const records = {};
  for (const account of accounts) {
    const docs = (byAccount.get(`${account.provider}::${account.accountNo}`) ?? [])
      .filter((d) => !d.excludedFromBook && d.status === 'ok');
    const summaries = docs.filter((d) => valuationTypes.has(d.reportType) && date(closeDate(d))
      && number(d.flows?.corpus) && d.flows.corpus >= 0)
      .sort((a, b) => closeDate(b).localeCompare(closeDate(a)) || a.docKey.localeCompare(b.docKey));
    // Preserve the existing price × quantity basis wherever a complete appraisal is available.
    // Historical appraisals remain candidates when newer holdings arrive without their capital record.
    const appraisals = docs.filter((d) => d.reportType === 'appraisal' && date(d.asOf)
      && d.holdings?.length && d.holdings.every((h) => number(h.marketValue)))
      .map((d) => ({ ...d, flows: { corpus: round(d.holdings.reduce((n, h) => n + h.marketValue, 0)), periodTo: d.asOf } }))
      .filter((d) => d.flows.corpus >= 0);
    const valuations = [...summaries, ...appraisals].sort((a, b) => closeDate(b).localeCompare(closeDate(a))
      || Number(b.reportType === 'appraisal') - Number(a.reportType === 'appraisal') || a.docKey.localeCompare(b.docKey));
    const newest = valuations[0];
    const original = accountCashFlows[account.accountId] ?? [];
    const openings = original.filter((f) => /^opening portfolio value/i.test(f.description ?? ''));
    if (!newest || !openings.length) continue;
    const coverage = { latestValuationDate: closeDate(newest), record: null, gap: null };
    records[account.accountId] = coverage;
    if (openings.length !== 1 || !date(openings[0].date) || !number(openings[0].amount) || openings[0].amount >= 0) {
      coverage.gap = 'Opening valuation and complete dated cash flows are missing';
      continue;
    }
    const opening = openings[0];
    const registers = docs.filter((d) => d.reportType === 'capital-register' || d.reportType === 'bank-book')
      .map((d) => d.reportType === 'bank-book' ? bankWindow(d) : registerWindow(d)).filter(Boolean);
    const reach = registers.map((r) => r.end).sort().at(-1);
    for (const closing of valuations) {
      const end = closeDate(closing);
      if (end <= opening.date) continue;
      const register = coveringRegister(registers, opening.date, end);
      if (!register) {
        if (closing === newest) coverage.gap = `Verified cash-flow coverage ${reach ? `ends ${reach}` : 'is unavailable'}; closing valuation is ${end}`;
        continue;
      }
      const witnesses = closing.reportType === 'appraisal' ? summaries.filter((d) => closeDate(d) === end) : [closing];
      // Net capital and the dated register must describe exactly the same window.
      // A row on the closing day may have posted after the valuation: it can be omitted only
      // when that exact omission reproduces the statement's independently printed capital.
      let moves = null;
      for (const witness of witnesses) {
        const f = witness.flows;
        const witnessed = number(f.netCapitalInOut) ? f.netCapitalInOut
          : number(f.contribution) && number(f.withdrawal) ? f.contribution - f.withdrawal : null;
        if (!date(f.periodFrom) || witnessed === null) continue;
        const inceptionBalance = f.periodFrom < register.start && register.kind === 'capital'
          && f.periodFrom === (witness.inceptionDate ?? account.inceptionDate);
        if (f.periodFrom < register.start && !inceptionBalance) continue;
        const net = (rows) => inceptionBalance ? register.opening + sum(rows)
          : sum(rows.filter((r) => r.date >= f.periodFrom));
        const through = register.moves.filter((r) => r.date <= end);
        if (Math.abs(net(through) - witnessed) <= 1) moves = through;
        else {
          const beforeClose = through.filter((r) => r.date < end);
          if (Math.abs(net(beforeClose) - witnessed) <= 1) moves = beforeClose;
        }
        if (moves) break;
      }
      if (!moves) {
        if (closing === newest) coverage.gap = 'Closing statement does not reconcile its capital against the dated record';
        continue;
      }
      // The overlap must reproduce the already accepted window. Replacing a register with one
      // missing an older movement must not silently rewrite a historical return.
      const known = original.filter((r) => !/^opening portfolio value/i.test(r.description ?? ''))
        .map((r) => ({ ...r, amount: -r.amount }));
      const overlapEnd = end < account.asOf ? end : account.asOf;
      if (!agree(buckets(known, opening.date, overlapEnd), buckets(moves, opening.date, overlapEnd))) {
        if (closing === newest) coverage.gap = 'New cash-flow record conflicts with the previously captured window';
        continue;
      }
      const flows = [opening, ...moves.filter((r) => r.date >= opening.date)
        .map((r) => ({ date: r.date, amount: round(-r.amount), description: r.description }))]
        .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
      coverage.record = { asOf: end, value: closing.flows.corpus, flows, source: closing.docKey,
        flowSources: register.sources, capitalRecordTo: end };
      break;
    }
    if (coverage.record?.asOf === coverage.latestValuationDate) coverage.gap = null;
  }
  return records;
}
