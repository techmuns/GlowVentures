import { fifoReturnPct } from './fifo.mjs';
/** Exact identity and unit gate also protects quote-only depository rows. */
export function applyRecoveredCost(position, records) {
  if(position.costBasis!=null) return position;
  const r=records.find((r)=>r.accountId===position.accountId&&r.isin===position.isin
    &&typeof position.quantity==='number'&&Math.abs(r.quantity-position.quantity)<=.0005
    &&Number.isFinite(r.costBasis)&&r.costBasis>0&&r.quantity>0);
  if(!r) return position;
  const valued=position.marketValue>0;
  return {...position,costBasis:r.costBasis,avgCost:r.costBasis/r.quantity,costUnavailable:false,
    costBasisSource:'supplementary-record',recoveredCost:r,
    realizedPnL:r.realizedPnL,costOfUnitsSold:r.costOfUnitsSold,dividendReceived:r.dividendReceived,
    unrealizedPnL:valued?position.marketValue-r.costBasis:null,
    returnPct:valued?fifoReturnPct(position.marketValue,r.costBasis,r.realizedPnL,r.costOfUnitsSold,r.dividendReceived):null};
}
