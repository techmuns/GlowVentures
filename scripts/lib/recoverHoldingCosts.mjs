// Cost recovery authorized 21 Oct 2026. The original holding remains the
// authority for quantity, valuation and date. Supplementary cash/unit rows can
// fill its cost only after an exact owner/ISIN/date/quantity reconciliation.
import fs from 'node:fs';
import path from 'node:path';
import { readSpreadsheet } from '../ingest/lib/sheet.mjs';
import { readTransactions, serialToIso, REVIEW_WORKBOOK, REVIEW_AS_OF } from './reviewPrivateRead.mjs';
import { fifoLedger, UNIT_TIE } from '../../shared/fifo.mjs';
import { ownerIdFor } from '../../shared/owners.mjs';

// Identity aliases, not cost overrides. No amount, quantity or purchase date is
// maintained here; those must be read from the workbooks on every build.
export const REVIEW_EQUITIES = Object.freeze({
  INE647U01026: 'Clean Max Enviro Energy Solutions Ltd', INE212S01015: 'Fractal Analytics Limited',
  INE12E301017: 'M/S Grand Continent Hotels', INE0LGX01024: 'Insolation Energy Ltd',
  INE00YJ01010: 'Jaro Education', INE1H7V01011: 'Parth Electrical & Engineering',
  INE0NAZ01010: 'Smart Works', INE00GK01023: 'Yash High Voltage Ltd.',
  INE559A01017: 'IFB Inds.', INE943D01017: 'MPS', INE589A01014: 'NLC INDIA',
  INE531F01023: 'Nuvama Wealth Management Ltd', INE1CDF01017: 'Vedanta Aluminium Metal Ltd',
  INE365Y01019: 'Bharat Parenterals Ltd', INE0MRE01011: 'Infinium Pharmachem Ltd.',
  INE918Z01012: 'Kaynes Technology India ltd', INE07K301024: 'Zaggle Prepaid Ocean Services Ltd.',
  INE800A01015: 'Birla Cable Ltd.', INE013P01021: 'Onesource Specialty Pharma', INE457L01029: 'PG Electro.',
});
const r2 = (v) => Math.round(v * 100) / 100;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const REGISTER = 'source/august-2026-f/NEW INVESTMENT SHEET.xlsx';

/** Replay already identified source rows; a shortfall never creates a free lot. */
export function replayReviewRows(rows, { isin, asOf, quantity }) {
  if (rows.some((r) => !r.date)) return { reason:'a source transaction has no acquisition/disposal date' };
  const selected = rows.filter((r) => r.date && r.date <= asOf)
    .sort((a,b) => a.date.localeCompare(b.date) || a.row - b.row);
  const events = [], notes = [];
  let balance = 0, income = 0, sawIncome = false;
  for (const r of selected) {
    if (r.txn === 'Closing') continue;
    if (r.txn === 'Div / Int') {
      if (!finite(r.value) || r.value < 0) return { reason: `income row ${r.row} has no valid receipt` };
      income += r.value; sawIncome = true; continue;
    }
    if (!finite(r.qty) || r.qty <= 0) return { reason: `row ${r.row} has no positive unit count` };
    if (r.txn === 'Bonus / Split') {
      if (!(balance > 0)) return { reason: `row ${r.row} adjusts units without recorded original lots` };
      if (r.value !== 0) {
        // The review repeats Grand Continent's preceding purchase amount on
        // its noncash split row. Require the duplicate and the Closing cost
        // control; never turn the copied amount into a second purchase.
        const prior = selected.filter((x) => x.row < r.row && x.txn === 'Purchase').at(-1);
        const paid = -selected.filter((x) => x.txn === 'Purchase').reduce((s,x) => s+x.value,0);
        const closing = rows.find((x) => x.txn === 'Closing');
        if (!prior || r.value !== prior.value || !closing || Math.abs(closing.value-paid) > .01)
          return { reason: `noncash adjustment row ${r.row} carries an unexplained amount` };
        notes.push(`row ${r.row}: duplicated purchase amount excluded from the noncash split; Closing independently equals purchase cost`);
      }
      events.push({ date:r.date, kind:'switch', from:isin, to:isin, units:balance, unitsIn:balance+r.qty });
      balance += r.qty; continue;
    }
    const buy = r.txn === 'Purchase', sell = r.txn === 'Sale';
    if ((!buy && !sell) || !finite(r.value) || (buy ? r.value >= 0 : r.value <= 0))
      return { reason: `row ${r.row}: unsupported transaction or inconsistent cash sign (${r.txn})` };
    if (finite(r.rate) && Math.abs(Math.abs(r.value)-r.qty*r.rate) > Math.max(1, r.qty*.000001))
      return { reason: `row ${r.row}: quantity × rate does not tie to amount` };
    events.push({date:r.date,kind:buy?'buy':'sell',cls:isin,units:r.qty,amount:Math.abs(r.value)});
    balance += buy ? r.qty : -r.qty;
  }
  if (!events.length) return { reason:'no purchase lots in the saved record' };
  const ledger = fifoLedger(events);
  if (ledger.shortfalls.length) return { reason:'sale consumes units not covered by recorded purchases' };
  if (Math.abs(ledger.unitsHeld-quantity) > UNIT_TIE)
    return { reason:`FIFO holds ${ledger.unitsHeld} units; custodian records ${quantity}` };
  const closing = rows.filter((r) => r.txn === 'Closing' && r.date && r.date <= asOf).at(-1);
  if (closing && Math.abs(closing.qty-ledger.unitsHeld)>UNIT_TIE)
    return { reason:`review closing ${closing.qty} disagrees with the FIFO unit balance` };
  return { costBasis:r2(ledger.costHeld), realizedPnL:r2(ledger.realisedGain), costOfUnitsSold:r2(ledger.costSold),
    dividendReceived:sawIncome?r2(income):null, rows:selected.map((r)=>r.row), notes };
}

function registerEma(root) {
  const wb=readSpreadsheet(fs.readFileSync(path.join(root,REGISTER)));
  const sheet=wb.sheets.find((s)=>s.name.trim()==='AJAY SIR - AARTI');
  const header=sheet.rows.findIndex((r)=>r.includes('INVESTMENT NAME'));
  const cols=sheet.rows[header];
  const at=(r,label)=>r[cols.indexOf(label)];
  const matches=sheet.rows.map((r,i)=>({r,row:i+1})).filter(({r})=>String(at(r,'INVESTMENT NAME')).trim()==='EMA PARTNERS INDIA PVT LTD');
  if(matches.length!==1) throw new Error('cost recovery: EMA register identity is ambiguous');
  const {r,row}=matches[0];
  const q=/^([\d,]+)\s+EQUITY SHARES\b/.exec(String(at(r,'VALUATION AT THE TIME OF INVESTMENT')).trim());
  const amount=Number(at(r,'INVESTMENT AMOUNT'));
  if(at(r,'INVESTMENT DONE UNDER')!=='AJAY'||!q||!(amount>0)) throw new Error('cost recovery: EMA register owner/quantity/amount missing');
  return {ownerId:'ajay-jaisinghani',isin:'INE0ZOL01023',quantity:Number(q[1].replaceAll(',','')),costBasis:amount,
    date:serialToIso(at(r,'INVESTMENT DATE')),evidence:{path:REGISTER,sheet:sheet.name,rows:[row]}};
}

export function recoverHoldingCosts({root,accounts,positions,unvalued,shareMovements,docs}) {
  const workbook=readSpreadsheet(fs.readFileSync(path.join(root,REVIEW_WORKBOOK)));
  const rows=readTransactions(workbook).rows;
  const ema=registerEma(root), accountById=new Map(accounts.map((a)=>[a.accountId,a]));
  const targets=new Map();
  const add=(p,asOf)=>{
    if(p.assetClass==='Equity'&&p.isin?.startsWith('INE')&&p.quantity>0&&asOf)
      targets.set(`${p.accountId}|${p.isin}`,{...p,asOf});
  };
  for(const p of positions) if(p.costBasis==null&&!p.review) add(p,accountById.get(p.accountId)?.asOf);
  for(const p of unvalued) add(p,p.asOf);
  for(const m of Object.values(shareMovements)) if(accountById.get(m.accountId)?.transactionsOnly && !m.reason)
    add({...m,assetClass:'Equity',quantity:m.closing},m.periodTo);
  const records=[],unresolved=[];
  for(const t of [...targets.values()].sort((a,b)=>`${a.accountId}|${a.isin}`.localeCompare(`${b.accountId}|${b.isin}`))) {
    const a=accountById.get(t.accountId);
    if(!a) continue;
    const name=REVIEW_EQUITIES[t.isin];
    const sourceRows=rows.filter((r)=>r.product===name&&ownerIdFor(r.investor)===a.ownerId);
    if(!name||!sourceRows.length) {
      if(t.isin===ema.isin&&a.ownerId===ema.ownerId&&t.asOf>=ema.date&&Math.abs(t.quantity-ema.quantity)<=UNIT_TIE) {
        records.push({accountId:t.accountId,isin:t.isin,quantity:t.quantity,asOf:t.asOf,costBasis:r2(ema.costBasis),
          realizedPnL:null,costOfUnitsSold:null,dividendReceived:null,evidence:[ema.evidence],
          notes:['Payment register matches owner and every unit; no complete separate sales/income record is claimed']});
      } else unresolved.push({...t,owner:a.owner,reason:'No quantity-matched owner-specific acquisition record in the saved workbooks'});
      continue;
    }
    const cutoff=t.asOf<REVIEW_AS_OF?t.asOf:REVIEW_AS_OF;
    // A same final quantity is insufficient if later buys and sells could
    // have replaced lots. Pledge/unpledge rows are explicitly balance-neutral.
    const later=docs.filter((d)=>d.provider===a.provider&&d.accountNo===a.accountNo)
      .flatMap((d)=>d.transactions??[]).filter((r)=>r.isin===t.isin&&r.date>cutoff&&r.date<=t.asOf&&r.side!=='encumbrance');
    if(later.length) {unresolved.push({...t,owner:a.owner,reason:`${later.length} later custodian movements need priced trade/transfer evidence after ${cutoff}`});continue;}
    const result=replayReviewRows(sourceRows,{isin:t.isin,asOf:cutoff,quantity:t.quantity});
    if(result.reason) {unresolved.push({...t,owner:a.owner,reason:result.reason});continue;}
    records.push({accountId:t.accountId,isin:t.isin,quantity:t.quantity,asOf:t.asOf,costBasis:result.costBasis,
      realizedPnL:result.realizedPnL,costOfUnitsSold:result.costOfUnitsSold,dividendReceived:result.dividendReceived,
      evidence:[{path:REVIEW_WORKBOOK,sheet:'Transactions since inception',rows:result.rows}],notes:result.notes});
  }
  return {records,unresolved};
}

export function recoveryReport({ records, unresolved }, accounts) {
  const accountById=new Map(accounts.map((a)=>[a.accountId,a]));
  const lines=['# Recovered purchase costs and remaining source gaps','',
    'Generated by `npm run build-book`. Recovery is limited to the recorded holding date and quantity; source rows never replace a valuation or advance a holding date.','',
    `**${records.length}** stock/account costs reconcile to exact recorded quantities. The full FIFO engine carries original costs through splits and matches every sale against the oldest remaining lots. Scheme-level mutual-fund lots remain separate from external account capital.`, '',
    '| Holder | Account | ISIN | Units | Cost held (INR) | Realised gain (INR) | Cost sold (INR) | Source |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |'];
  const fmt=(v)=>v==null?'—':v.toLocaleString('en-IN',{maximumFractionDigits:2});
  for(const r of records){const a=accountById.get(r.accountId);lines.push(`| ${a?.owner} | ${a?.accountNo} | ${r.isin} | ${r.quantity} | ${fmt(r.costBasis)} | ${fmt(r.realizedPnL)} | ${fmt(r.costOfUnitsSold)} | ${r.evidence.map((e)=>`${e.path}, ${e.sheet}, rows ${e.rows.join(', ')}`).join('; ')} |`);}
  lines.push('', '## Not recovered', '', '| Holder | Account | Security | ISIN | Recorded units | Required evidence |','| --- | --- | --- | --- | ---: | --- |');
  for(const r of unresolved){const a=accountById.get(r.accountId);lines.push(`| ${a?.owner} | ${a?.accountNo} | ${r.security} | ${r.isin} | ${r.quantity} | ${r.reason} |`);}
  lines.push('', '## Source qualifications', '',
    '- The March ICICI snapshot keeps its March quantity and mark. Yash has later June disposals whose cash signs conflict with their transaction type; newer broker holdings and sale confirmations are still required before rolling that snapshot forward.',
    '- Grand Continent’s split row repeats a purchase amount. It is excluded from cash only because its duplicate and the independent closing-at-cost control agree; the split carries the original lots and their cost.',
    '- The EMA payment register establishes the matched holding’s purchase cost. Separate realised gains and dividends remain unreported; they are not written as measured zero.',
    '- Existing statement costs take precedence; supplementary records never overwrite them.',
    '- Full HPR includes recorded realised gains and income. It does not claim income or transactions after the evidenced period.',
    '', 'Client request: [exact remaining records](client/PURCHASE-COST-RECORDS-NEEDED.md).','');
  return lines.join('\n');
}
