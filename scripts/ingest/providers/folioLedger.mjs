import { makeHolding, makeCashFlow, makeTotals } from '../lib/document.mjs';
import { parseNum } from '../lib/parseNum.mjs';
import { toIso } from '../lib/classify.mjs';

export const PROVIDERS = ['Invesco Mutual Fund', 'Motilal Oswal Mutual Fund'];
const money = '[\\d,]+\\.\\d+';
const day = '\\d{2}/\\d{2}/\\d{4}';
const clean = s => s.replace(/<[^>]*>/g, '').trim();
const n = parseNum;

// The September delivery's folios print gross and net on separate lines.
// Walk every unit balance and verify the gross/charge/net and units × NAV
// witnesses before publishing their dated cash. Reinvestment is not cash out.
export function extract({ grid, meta }) {
  const lines = grid.pages.flatMap(p => p.text.split('\n').map(clean));
  const text = lines.join('\n'), warnings = [], flows = [], holdings = [];
  const invesco = meta.provider === PROVIDERS[0];
  const folio = /Folio\s*(?:No\.?\s*:?|:)\s*(\d+)/i.exec(text)?.[1] ?? null;
  const owner = invesco
    ? /Primary Unitholder Details Folio Information\s*\n(.+?)\s+Mode Of Holding/i.exec(text)?.[1]
    : /\bName\s*:\s*(.+?)\s+FOLIO\s*:/i.exec(text)?.[1];
  const period = /(?:Statement Period\s*:\s*|Statement of Account for Period\s*:\s*)(\S+)\s+to\s+(\S+)/i.exec(text);
  const periodFrom = toIso(period?.[1]), periodTo = toIso(period?.[2]);
  const asOf = periodTo;
  const groups = new Map(); let current = null;
  for (const line of lines) {
    const head = invesco
      ? /^(Invesco India .+?)\s*-\s*(IN[EF][A-Z0-9]{9})(?:\s+NAV as on\s+(\S+)\s*\(Rs\.\s*\)\s*([\d.]+))?/.exec(line)
      : /^Scheme\s+(.+?)-?\s*ISIN No\s*:\s*(IN[EF][A-Z0-9]{9})/.exec(line);
    if (head) {
      if (!groups.has(head[2])) groups.set(head[2], { name: head[1].trim(), isin: head[2], rows: [], nav: null, navDate: null });
      current = groups.get(head[2]);
      if (head[4]) { current.nav = n(head[4]); current.navDate = toIso(head[3]); }
    } else if (current) current.rows.push(line);
  }
  for (const g of groups.values()) {
    const moves = []; let balance = null, failed = false;
    const fail = detail => { failed = true; warnings.push({ code: 'unit-ledger-not-reconciled', detail: `${g.name}: ${detail}` }); };
    for (let i = 0; i < g.rows.length; i++) {
      const line = g.rows[i];
      const opening = new RegExp(`^(${day})\\s+Opening Balance\\s+(${money})$`).exec(line);
      if (opening) {
        if (balance !== null) { fail('repeated opening'); break; }
        balance = n(opening[2]);
        moves.push(makeCashFlow({ date: toIso(opening[1]), description: 'Opening units', security: g.name,
          isin: g.isin, kind: 'opening-units', units: balance, balance }));
        continue;
      }
      const subscription = new RegExp(`^(${day})(?:\\s+(${day}))?\\s+Net Lateral Shift In\\s+(${money})\\s+(${money})\\s+0\\s+(${money})\\s+(${money})\\s+(${money})$`).exec(line);
      const redemption = invesco
        ? new RegExp(`^(${day})\\s+(${day})\\s+Gross Redemption\\s+(${money})\\s+(${money})\\s+0\\s+(${money})\\s+(${money})\\s+(${money})$`).exec(line)
        : new RegExp(`^(${day})\\s+Redemption \\(Gross - .+?\\) \\( Transaction Date : (${day}) \\)\\s+(${money})\\s+(${money})\\s+(${money})\\s+(${money})$`).exec(line);
      if (!subscription && !redemption) {
        if (/^\d{2}\/\d{2}\/\d{4}.*(?:Purchase|Subscription|Switch|Gross Lateral|Gross Redemption|Redemption)/i.test(line)
          && !/Gross Lateral Shift In|Net Redemption/.test(line)) fail(`unread movement: ${line}`);
        continue;
      }
      const m = subscription ?? redemption, bought = !!subscription;
      const date = toIso(m[1]), gross = n(m[3]), nav = n(m[4]);
      const units = n(m[invesco ? 6 : 5]), printedBalance = n(m[invesco ? 7 : 6]);
      let cash = gross, charges = null;
      if (subscription) {
        const grossRow = new RegExp(`^${m[1]}\\s+${m[2] ?? m[1]}\\s+Gross Lateral Shift In\\s+(${money})$`).exec(g.rows[i - 2] ?? '');
        const stamp = new RegExp(`^${m[1]}\\s+Stamp Duty\\s+(${money})$`).exec(g.rows[i - 1] ?? '');
        if (!grossRow || !stamp || Math.abs(n(grossRow[1]) - n(stamp[1]) - gross) > .011) { fail(`${date}: gross, stamp and net do not tie`); break; }
        cash = n(grossRow[1]);
        charges = n(stamp[1]);
      } else if (invesco) {
        // A redemption's net row can continue on the next page. Match its
        // printed date and closing balance across the repeated heading/footer.
        const netPattern = new RegExp(`^${m[1]}\\s+Net Redemption\\s+(${money})\\s+(${money})$`);
        const netRows = g.rows.slice(i + 1).map(r => netPattern.exec(r)).filter(r => r && Math.abs(n(r[2]) - printedBalance) < .0005);
        const net = netRows.length === 1 ? netRows[0] : null;
        const stt = new RegExp(`^${m[1]}\\s+STT Paid on above.*?\\s+(${money})$`).exec(g.rows[i + 1] ?? '');
        if (!net || !stt || Math.abs(gross - n(stt[1]) - n(net[1])) > .011 || Math.abs(n(net[2]) - printedBalance) > .0005) { fail(`${date}: gross, STT and net do not tie`); break; }
        cash = n(net[1]);
        charges = n(stt[1]);
      } else {
        const printedGross = /Gross - `\s*([\d.]+)STT @ 0\.001% - `\s*([\d.]+)/.exec(line);
        if (!printedGross || Math.abs(n(printedGross[1]) - n(printedGross[2]) - gross) > .011) { fail(`${date}: gross, STT and net do not tie`); break; }
        charges = n(printedGross[2]);
      }
      // MO prints the redemption NET; its NAV reproduces the independently
      // printed GROSS. Invesco's unit row is already the gross/net witness.
      const unitValue = !invesco ? n(/Gross - `\s*([\d.]+)/.exec(line)?.[1]) : gross;
      if (Math.abs(units * nav - unitValue) > units * .00005 + nav * .0005 + .01) { fail(`${date}: units × NAV do not tie`); break; }
      if (balance === null) {
        if (!bought || Math.abs(units - printedBalance) > .0005) { fail('no nil opening or opening unit balance'); break; }
        balance = 0;
      }
      balance = Math.round((balance + (bought ? units : -units)) * 1000) / 1000;
      if (Math.abs(balance - printedBalance) > .0005) { fail(`${date}: running units do not tie`); break; }
      moves.push(makeCashFlow({ date, security: g.name, isin: g.isin, kind: bought ? 'contribution' : 'withdrawal',
        description: bought ? 'Lateral shift in' : 'Redemption (net paid)', amount: bought ? cash : -cash,
        netAmount: bought ? gross : -cash, expenses:charges, units: bought ? units : -units, balance,
        notes: `source transaction NAV ${nav}` }));
    }
    const explicit = invesco ? balance : n(/Balance Units:\s*([\d,.]+)/.exec(g.rows.join('\n'))?.[1]);
    if (explicit === null || balance === null || Math.abs(explicit - balance) > .0005) fail('closing units unavailable or do not tie');
    if (!failed) flows.push(...moves);
    // These new folios are redeemed to nil. A non-nil position must carry its
    // own printed closing NAV/date; never value it at an old transaction NAV.
    if (explicit === 0 || (explicit > 0 && g.nav !== null && g.navDate)) holdings.push(makeHolding({
      security: g.name, isin: g.isin, assetClass: 'Mutual Fund', quantity: explicit,
      marketPrice: g.nav, priceAsOn: g.navDate, marketValue: explicit === 0 ? 0 : explicit * g.nav,
      source: meta.docKey,
    }));
  }
  if (!folio || !owner || !periodTo || !holdings.length) warnings.push({ code: 'folio-fields-missing', detail: 'Account identity, period or valued/nil holdings could not be read' });
  return { provider: meta.provider, reportType: 'holdings', accountNo: folio, owner: owner?.trim() ?? null,
    asOf, periodFrom, periodTo, engagement: 'Direct', holdings, cashFlows: flows,
    totals: makeTotals({ totalMarketValue: holdings.length ? holdings.reduce((s,h) => s + (h.printed.marketValue ?? 0), 0) : null,
      positionCount: holdings.length, source: meta.docKey }),
    sections: { ledger: { name: 'Source unit and cash ledger', rows: [['date','scheme','kind','amount','units','balance'],
      ...flows.map(f => [f.date,f.security,f.kind,f.amount,f.units,f.balance])] } },
    warnings, status: !holdings.length ? 'failed' : warnings.length ? 'partial' : 'ok' };
}
