import assert from 'node:assert/strict';
import { investmentYearStart, investedThisYear, purchaseLots, type PurchaseSources } from '../investedThisYear';
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_HOLDING_LOTS, BOOK_HOLDING_TRADES, BOOK_POSITION_TRANCHES } from '@/data/glowData';
import { currentHoldings, dedupedPositions } from '../analytics';
import { investedOnOf } from '../investedOn';
import type { Account, Position } from '../types';

const p=(patch:Partial<Position>={}):Position=>({...BOOK_POSITIONS[0],accountId:'account',securityKey:'stock',security:'Example Stock',assetClass:'Equity',quantity:10,costBasis:1000,marketValue:1500,
  costUnavailable:false,valuedAtCost:false,live:false,navPriced:false,heldSince:null,tradeRecord:undefined,recoveredCost:undefined,priceAsOf:null,...patch});
const accounts=[{...BOOK_ACCOUNTS[0],accountId:'account',asOf:'2026-10-21'}] as Account[];
const sources=(lots:PurchaseSources['lots']={}):PurchaseSources=>({lots,trades:{},tranches:{},dates:()=>null});
const key='account|stock';
assert.equal(investmentYearStart('2026-10-22'),'2026-04-01');
assert.equal(investmentYearStart('2026-02-22'),'2025-04-01');
assert.equal(investmentYearStart('2026-04-01'),'2026-04-01');
const s=sources({[key]:[{date:'2025-05-01',quantity:6,cost:600},{date:'2026-04-01',quantity:4,cost:400}]});
const selected=investedThisYear([p()],accounts,s,'2026-04-01','2026-10-22','absolute');
assert.equal(selected.included.length,1);
assert.equal(selected.cost,400);assert.equal(selected.value,600);assert.equal(selected.gain,200);assert.equal(selected.pct,50,'only this year’s four units earn the return');
assert.equal(selected.included[0].first,'2026-04-01','the first day of the year is included');
const older=investedThisYear([p()],accounts,s,'2026-05-01','2026-10-22','absolute');assert.equal(older.older.length,1);
assert.equal(purchaseLots(p({quantity:11}),s),null,'a mismatched unit balance cannot lend dates');
assert.equal(purchaseLots(p({costBasis:1500}),s),null,'a mismatched cost cannot lend dates');
const review={...sources(),dates:()=>({first:'2026-05',last:'2026-05',payments:null,sources:['review'] as const})};
assert.equal(purchaseLots(p(),review as unknown as PurchaseSources),null,'a product review date is not a dated custody purchase');
const tape=sources();tape.trades={[key]:[{date:'2026-04-02',side:'buy',quantity:10,amount:1000,price:100},{date:'2026-05-01',side:'buy',quantity:10,amount:2000,price:200},{date:'2026-06-01',side:'sell',quantity:10,amount:3000,price:300}]};
const traded=p({costBasis:2000,tradeRecord:{from:'2026-04-01',to:'2026-10-21',buys:2,sells:1,unaccounted:0,held:{first:'2026-05-01',last:'2026-05-01',lots:1},reason:null}});
assert.deepEqual(purchaseLots(traded,tape),[{date:'2026-05-01',quantity:10,cost:2000}],'sales consume older buys; sold units do not remain in the cohort');
assert.equal(purchaseLots({...traded,tradeRecord:{...traded.tradeRecord!,unaccounted:3,held:null}},tape),null,'a tape with unknown opening units is refused');
assert.equal(purchaseLots({...traded,costBasis:1998},tape)?.[0].cost,2000,'settled purchase cash retains charges rather than being forced to remaining book cost');
const fund=sources();fund.tranches={[key]:{accountId:'account',securityKey:'stock',units:10,basis:'fifo',moves:[
  {accountId:'account',date:'2025-10-01',direction:'in',label:'Remaining purchase',amount:600,invested:600,units:6,security:'Example Fund',securityKey:'stock'},
  {accountId:'account',date:'2026-05-01',direction:'in',label:'Remaining purchase',amount:400,invested:400,units:4,security:'Example Fund',securityKey:'stock'}]}};
assert.equal(investedThisYear([p({assetClass:'Mutual Fund'})],accounts,fund,'2026-04-01','2026-10-22','absolute').cost,400,'fund allotments split old and new units under the same gate');
const futureValue=investedThisYear([p({priceAsOf:'2026-03-31'})],accounts,s,'2026-04-01','2026-10-22','absolute');assert.equal(futureValue.missing.length,1,'a valuation before purchase cannot measure its return');
const b=p({securityKey:'other',marketValue:500,costBasis:1000});
const weightedSources=sources({[key]:[{date:'2026-04-02',quantity:10,cost:1000}],'account|other':[{date:'2026-04-02',quantity:10,cost:1000}]});
const weighted=investedThisYear([p(),b],accounts,weightedSources,'2026-04-01','2026-10-22','absolute');
assert.equal(weighted.pct,25,'1500/2000 × +50% + 500/2000 × −50% = +25%, using portfolio values');
// Stage 10hk: every purchase this year is under a year old, so XIRR shows the
// purchase-to-value return, never a rate per year; debt alone is annualised.
const annual=investedThisYear([p()],accounts,weightedSources,'2026-04-01','2026-10-22','xirr');assert.equal(annual.pct,50);assert.equal(annual.annual,false,'under a year XIRR retains the period figure');
const debtYear=investedThisYear([p({assetClass:'Bond'})],accounts,weightedSources,'2026-04-01','2026-10-22','xirr');assert.ok(debtYear.pct!>50 && debtYear.annual,'debt is annualised under a year');
const cagr=investedThisYear([p()],accounts,weightedSources,'2026-04-01','2026-10-22','cagr');assert.equal(cagr.pct,50);assert.equal(cagr.annual,false,'under a year CAGR retains the period figure');
const realSources={lots:BOOK_HOLDING_LOTS,trades:BOOK_HOLDING_TRADES,tranches:BOOK_POSITION_TRANCHES,dates:(p:Position)=>investedOnOf([p])};
const held=currentHoldings(dedupedPositions(BOOK_POSITIONS));
const real=investedThisYear(held,BOOK_ACCOUNTS,realSources,'2026-04-01','2026-10-22','absolute');
assert.ok(real.included.length>10);assert.ok(real.included.every(r=>r.lots.every(l=>l.date>='2026-04-01'&&l.date<='2026-10-22')));
assert.equal(real.included.length+real.missing.length+real.older.length,held.length);
assert.equal(new Set([...real.included.map(r=>r.position),...real.missing.map(r=>r.position),...real.older].map(p=>`${p.accountId}|${p.securityKey}`)).size,held.length);
console.log('Invested this year: fiscal boundaries, mixed-age units, FIFO sales, cost/unit reconciliation, source/date gaps and portfolio weights passed.',{included:real.included.length,missing:real.missing.length,older:real.older.length,cost:real.cost,value:real.value,pct:real.pct});
