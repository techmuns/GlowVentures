import { fifoReturnPct } from './fifo.mjs';
/** One exact identity/unit gate for valuation overlays and raw custody audit rows. */
export function recoveredCostFor(position, records) {
  return records.find((r)=>r.accountId===position.accountId&&r.isin===position.isin
    &&typeof position.quantity==='number'&&Math.abs(r.quantity-position.quantity)<=.0005
    &&Number.isFinite(r.costBasis)&&r.costBasis>0&&r.quantity>0);
}
export function applyRecoveredCost(position, records) {
  if(position.costBasis!=null) return position;
  const r=recoveredCostFor(position, records);
  if(!r) return position;
  const valued=position.marketValue>0;
  const realizedPnL=position.realizedPnL??r.realizedPnL;
  const costOfUnitsSold=position.costOfUnitsSold??r.costOfUnitsSold;
  const dividendReceived=position.dividendReceived??r.dividendReceived;
  return {...position,costBasis:r.costBasis,avgCost:r.costBasis/r.quantity,avgCostDerived:true,costUnavailable:false,
    costBasisSource:'supplementary-record',recoveredCost:r,
    realizedPnL,costOfUnitsSold,dividendReceived,
    ...(r.hprUnavailableReason?{hprUnavailableReason:r.hprUnavailableReason}:{}),
    ...(r.salesAfter ? {realizedLotsAfter:Math.max(position.realizedLotsAfter??0,r.salesAfter)} : {}),
    unrealizedPnL:valued?position.marketValue-r.costBasis:null,
    returnPct:valued&&!r.hprUnavailableReason?fifoReturnPct(position.marketValue,r.costBasis,realizedPnL,costOfUnitsSold,dividendReceived):null};
}
