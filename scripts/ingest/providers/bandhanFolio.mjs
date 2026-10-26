import { makeHolding, makeCashFlow, makeTotals } from '../lib/document.mjs';
import { parseNum } from '../lib/parseNum.mjs';
import { toIso } from '../lib/classify.mjs';

export const PROVIDER = 'Bandhan Mutual Fund';
const number = String.raw`\(?[\d,]+\.\d+\)?`;
const row = new RegExp(String.raw`^(\d{2}/\d{2}/\d{4})\s*(.*?)\s*(${number})\s+(${number})\s+(${number})\s+(${number})\s+(${number})$`);
const roundUnits = n => Math.round(n * 1000) / 1000;

// The account summary supplies the cost of units STILL held. The separate
// "Cost of Redemption and Switch Out" is not a remaining-cost calculation.
// Read every scheme ledger, including nil schemes absent from that summary.
export function extract({ grid, meta }) {
  const lines = grid.pages.flatMap(p => p.text.split('\n').map(l => l.trim()).filter(Boolean));
  const text = lines.join('\n');
  const warnings = [], holdings = [], flows = [], blocks = [];
  const fail = detail => warnings.push({ code: 'bandhan-ledger-not-reconciled', detail });
  const folio = /Folio Number\s*:\s*(\d+)/i.exec(text)?.[1] ?? null;
  const owner = /First Holder Second Holder Third Holder Guardian\n([^\n]+)/.exec(text)?.[1] ?? null;
  const period = /From\s+(\d{2}-[A-Z]{3}-\d{4})\s+To\s+(\d{2}-[A-Z]{3}-\d{4})/i.exec(text);
  const periodFrom = toIso(period?.[1]), periodTo = toIso(period?.[2]);
  let block = null;
  for (const line of lines) {
    const head = /^(Bandhan .+?)\s+SCHEME CODE\s*:\s*([A-Z0-9]+)/i.exec(line);
    if (head) {
      block = { name: head[1].replace(/\s*\(\s*Formerly Known.*$/i, '').trim(), lines: [] };
      blocks.push(block);
    } else if (block) block.lines.push(line);
  }
  const summaryEnd = lines.findIndex(l => /SCHEME CODE\s*:/.test(l));
  const summary = lines.slice(0, summaryEnd).join('\n');
  for (const b of blocks) {
    const content = b.lines.join('\n');
    const id = /ISIN NO\s*:\s*(IN[EF][A-Z0-9]{9})\s+NAV as on\s+(\S+)\s*:\s*([\d,.]+)/i.exec(content);
    const close = /Current Unit Balance\s*:\s*([\d,.]+)\s+Market Value as on\s+(\S+)\s*:\s*([\d,.]+)\s+Available Units for Redemption\s*:\s*([\d,.]+)/i.exec(content);
    const opening = /Opening Balance as on\s+(\S+)\s+([\d,.]+)/i.exec(content);
    if (!id || !close || !opening) { fail(`${b.name}: missing identity, opening or closing`); continue; }
    const isin = id[1], nav = parseNum(id[3]), quantity = parseNum(close[1]), value = parseNum(close[3]);
    const navDate = toIso(id[2]);
    const startErrors = warnings.length;
    if (!navDate || navDate !== toIso(close[2]) || navDate > periodTo || quantity !== parseNum(close[4])
      || Math.abs(quantity * nav - value) > .011) fail(`${b.name}: closing units, NAV, date and value disagree`);
    let balance = parseNum(opening[2]);
    const moves = [makeCashFlow({ date: toIso(opening[1]), description: 'Opening units', security: b.name,
      isin, kind: 'opening-units', units: balance, balance })];
    let remat = null;
    for (let i = 0; i < b.lines.length; i++) {
      const line = b.lines[i];
      if (!/^\d{2}\/\d{2}\/\d{4}\b/.test(line)) continue;
      const m = row.exec(line);
      if (!m) {
        const note = `${line} ${b.lines[i + 1] ?? ''}`;
        if (/\*\*\*Demat To Remat -Accept\*\*\*/i.test(note)) { remat = toIso(line.slice(0, 10)); continue; }
        if (/\*\*\*Address Updated/.test(note)) continue;
        fail(`${b.name}: unread dated movement`); continue;
      }
      const type = (m[2] || b.lines[i + 1] || '').trim();
      const date = toIso(m[1]);
      const kind = /^Switch (?:In|Out)\b/i.test(type) ? 'reclassification'
        : /^Net Purchase\b/i.test(type) ? 'contribution' : /^Redemption\b/i.test(type) ? 'withdrawal' : null;
      const price = parseNum(m[5]), amount = parseNum(m[4]), units = parseNum(m[6]), after = parseNum(m[7]);
      if (!kind || !date || date < toIso(opening[1]) || date > periodTo || units === 0
        || ((/Switch Out|Redemption/i.test(type)) !== (units < 0))
        || Math.sign(amount) !== Math.sign(units) || price !== parseNum(m[3])) {
        fail(`${b.name}: unrecognised movement or inconsistent signs`); continue;
      }
      const following = b.lines.slice(i + 1, i + 4).join(' ');
      const stamp = /Gross Amount:\s*Rs\.([\d,.]+)\/-; Stamp Duty charges Levied\s+([\d,.]+)/i.exec(following);
      const stt = /\*\*\* STT Paid \*\*\*\s+\(([\d,.]+)\)/i.exec(following);
      const charges = units > 0 ? (stamp ? parseNum(stamp[2]) : null) : (stt ? parseNum(stt[1]) : null);
      const cash = units > 0 && stamp ? parseNum(stamp[1]) : amount;
      const unitMoney = units < 0 ? Math.abs(amount) + (charges ?? 0) : amount;
      const tolerance = Math.abs(units) * .5 * 10 ** -(m[5].split('.')[1]?.length ?? 0) + price * .0005 + .011;
      if ((units > 0 && (!stamp || Math.abs(cash - charges - amount) > .011))
        || (/less STT/i.test(type) && !stt)
        || Math.abs(Math.abs(units) * price - unitMoney) > tolerance
        || Math.abs(roundUnits(balance + units) - after) > .0005) {
        fail(`${b.name}: movement amount, charges or running units disagree`); continue;
      }
      balance = after;
      moves.push(makeCashFlow({ date, description: type, security: b.name, isin, kind,
        amount: cash, netAmount: amount, expenses: charges, units, balance, notes: `source transaction NAV ${price}` }));
    }
    if (Math.abs(balance - quantity) > .0005) fail(`${b.name}: ledger does not reach closing units`);
    if (warnings.length !== startErrors) continue;
    const costs = [...summary.matchAll(/(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/g)]
      .filter(m => toIso(m[1]) === navDate && parseNum(m[2]) === nav && parseNum(m[3]) === quantity && Math.abs(parseNum(m[5]) - value) < .011);
    holdings.push(makeHolding({ security: b.name, isin, assetClass: 'Mutual Fund', quantity,
      marketPrice: nav, priceAsOn: navDate, marketValue: value,
      totalCost: quantity === 0 ? 0 : costs.length === 1 ? parseNum(costs[0][4]) : null,
      ...(remat ? { custodyRematOn: remat } : {}), source: meta.docKey }));
    flows.push(...moves);
  }
  // A switch remains inside this folio. Match only a unique opposite leg,
  // using its printed net proceeds / gross subscription and scheme name.
  for (const out of flows.filter(f => f.kind === 'reclassification' && f.units < 0)) {
    const into = flows.filter(f => f.kind === 'reclassification' && f.units > 0
      && f.date >= out.date && (Date.parse(f.date) - Date.parse(out.date)) / 86400000 <= 7
      && Math.abs(f.amount + out.amount) < .011);
    if (into.length === 1) out.settlementDate = into[0].date;
  }
  const total = /Total\s*:\s*([\d,.]+)\s+([\d,.]+)/.exec(summary);
  if (!folio || !owner || !periodTo || holdings.length !== blocks.length || !total
    || Math.abs(holdings.reduce((s, h) => s + h.printed.marketValue, 0) - parseNum(total?.[2])) > .011) fail('Account identity, coverage or printed total does not reconcile');
  return { provider: PROVIDER, reportType: 'holdings', accountNo: folio, owner, asOf: periodTo, periodFrom, periodTo,
    engagement: 'Direct', providerEngagement: 'Mutual fund folio — Resident Individual',
    holdings, cashFlows: warnings.length ? [] : flows,
    totals: makeTotals({ totalMarketValue: total ? parseNum(total[2]) : null, positionCount: holdings.length, source: meta.docKey }),
    sections: { holdings: { name: 'Current scheme balances', rows: [['Scheme','ISIN','NAV date','Units','NAV','Cost held','Market value','Demat to remat accepted'],
      ...holdings.map(h => [h.security,h.isin,h.priceAsOn,h.quantity,h.marketPrice,h.totalCost,h.printed.marketValue,h.custodyRematOn ?? null])] },
      ledger: { name: 'Source unit and cash ledger', rows: [['date','scheme','kind','amount','units','balance'],
      ...flows.map(f => [f.date, f.security, f.kind, f.amount, f.units, f.balance])] } },
    warnings, status: warnings.length ? 'partial' : 'ok' };
}
