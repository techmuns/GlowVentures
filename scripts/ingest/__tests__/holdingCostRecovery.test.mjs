import assert from 'node:assert/strict';
import { replayReviewRows, replayReviewFundGroups } from '../../lib/recoverHoldingCosts.mjs';
import { applyRecoveredCost } from '../../../shared/recoveredCosts.mjs';
const row=(row,txn,date,qty,value,rate=null)=>({row,txn,date,qty,value,rate});
const rows=[row(1,'Purchase','2020-01-01',10,-100),row(2,'Purchase','2021-01-01',10,-300),row(3,'Bonus / Split','2022-01-01',20,0),row(4,'Sale','2023-01-01',25,500)];
const args={isin:'INE647U01026',asOf:'2024-01-01',quantity:15};
const r=replayReviewRows(rows,args);
assert.equal(r.costBasis,225);assert.equal(r.costOfUnitsSold,175);assert.equal(r.realizedPnL,325);
assert.ok(replayReviewRows(rows,{...args,quantity:16}).reason);
assert.ok(replayReviewRows([...rows,row(5,'Sale','2023-01-02',20,100)],args).reason);
assert.ok(replayReviewRows(rows.map(r=>r.row===4?{...r,value:-500}:r),args).reason);
assert.ok(replayReviewRows(rows.map(r=>r.row===3?{...r,value:50}:r),args).reason);
assert.ok(replayReviewRows(rows.map(r=>r.row===1?{...r,date:null}:r),args).reason);
assert.equal(replayReviewRows(rows,{...args,asOf:'2021-12-31',quantity:20}).costBasis,400);
const p={accountId:'a',isin:args.isin,quantity:15,marketValue:600,costBasis:null};
const rec={...r,accountId:'a',isin:args.isin,quantity:15,asOf:args.asOf};
assert.equal(applyRecoveredCost(p,[rec]).returnPct,175);
assert.deepEqual(applyRecoveredCost({...p,accountId:'b'},[rec]),applyRecoveredCost({...p,accountId:'b'},[]));
assert.equal(applyRecoveredCost(p,[{...rec,quantity:14}]),p);
assert.equal(applyRecoveredCost(p,[{...rec,costBasis:NaN}]),p);
assert.equal(applyRecoveredCost({...p,costBasis:1},[rec]).costBasis,1);
assert.equal(applyRecoveredCost({...p,dividendReceived:10},[rec]).dividendReceived,10);
assert.equal(applyRecoveredCost(p,[{...rec,salesAfter:3}]).realizedLotsAfter,3);
console.log('holdingCostRecovery: FIFO, splits, date cutoffs, missing history and exact identity gates passed');

// Same owner and scheme, distinct folios: select the unique closing balance.
const twoFolios=[row(1,'Purchase','2020-01-01',10,-100),row(2,'Closing','2024-01-01',10,100),
  row(3,'Purchase','2021-01-01',20,-600),row(4,'Closing','2024-01-01',20,600)];
assert.equal(replayReviewFundGroups(twoFolios,{...args,quantity:20}).costBasis,600);
assert.ok(replayReviewFundGroups(twoFolios,{...args,quantity:30}).reason);
assert.ok(replayReviewFundGroups([...twoFolios,row(5,'Purchase','2022-01-01',20,-800),row(6,'Closing','2024-01-01',20,800)],{...args,quantity:20}).reason);
// Unverified sale proceeds do not erase original lot cost, nor become zero gain.
const disputed=[row(1,'Purchase','2020-01-01',10,-100),row(2,'Purchase','2021-01-01',10,-300),
  row(3,'Sale','2023-01-01',15,-500),row(4,'Closing','2024-01-01',5,150)];
const partial=replayReviewFundGroups(disputed,{...args,quantity:5});
assert.equal(partial.costBasis,150);assert.equal(partial.costOfUnitsSold,250);
assert.equal(partial.realizedPnL,null);assert.ok(partial.hprUnavailableReason);
const applied=applyRecoveredCost({...p,quantity:5},[{...rec,...partial,quantity:5}]);
assert.equal(applied.avgCost,30);assert.equal(applied.unrealizedPnL,450);
assert.equal(applied.returnPct,null);assert.equal(applied.realizedPnL,null);
assert.ok(applied.hprUnavailableReason);
// A 0.066-unit discrepancy is not a rounding licence.
assert.ok(replayReviewFundGroups(twoFolios,{...args,quantity:20.066}).reason);
