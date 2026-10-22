import assert from 'node:assert/strict';
import { assumedHoldingReturns, holdingAssumptionText, type AssumedReturnBook } from '../assumedHoldingReturns';
import { selectedSegmentReturns, type ReturnSelection } from '../selectedSegmentReturns';
import { capitalBridge } from '../capitalBridge';
import { availableCardReturns } from '../availableCardReturns';
import type { Account, Portfolio, Position } from '../types';
import type { ActionFeed } from '../corporateActions';
import type { MarketHistory } from '../marketReturns';

const near = (a: number | null | undefined, b: number, why = '') => assert.ok(a != null && Math.abs(a - b) < 1e-7, `${a} != ${b} ${why}`);
const account = { accountId: 'a', owner: 'Test owner', provider: 'Test custodian', accountNo: '1', asOf: '2026-03-31', engagement: 'Direct' } as Account;
const position = { accountId: 'a', securityKey: 'example', security: 'Example holding', symbol: 'EXAMPLE', isin: 'INE000000001',
  assetClass: 'Equity', marketSide: 'listed', quantity: 10, marketValue: 4000, costBasis: null } as Position;
const actions: ActionFeed = { version: 1, capturedAt: '2026-10-22T00:00:00Z', requestedFrom: '2023-01-01', requestedTo: '2027-01-01', verifiedThrough: '2026-10-21', symbols: ['EXAMPLE'], isins: [], sourceUrl: 'fixture', rows: [] };
const h: MarketHistory = { ok: true, version: 2, symbol: 'EXAMPLE.NS', isin: null, name: 'Example', source: 'Public price fixture', basis: 'adjusted-close',
  first: '2026-03-31', last: '2026-10-21', t: ['2026-03-31','2026-09-01','2026-10-21'], v: [80,90,100], c: [100,200,240], splits: [] };
const b: AssumedReturnBook = { positions: [position], unvalued: [], trades: {}, movements: {}, moves: [], actions,
  instruments: new Map([['example',{key:'example',query:'symbol=EXAMPLE'}]]), histories: {example:h} };
const run = (book = b, from: string | null = '2026-09-01') => assumedHoldingReturns([position],[account],from,'2026-10-22',book);
const r = run(); assert.equal(r.units.length,1);
near(r.units[0].invested,2000); near(r.units[0].close,2400); near(r.units[0].gain,400);
assert.equal(r.units[0].to,'2026-10-21','never advance a settled price to today');
assert.match(holdingAssumptionText(account.owner),/No sale appears in the records we have.*Test owner still holds/);
near(run(b,null).units[0].invested,1000,'available history starts at the confirmed balance');
assert.match(run(b,'2026-03-01').gaps[0].reason,/confirmed count on or before/);
assert.match(run({...b,histories:{}}).gaps[0].reason,/still loading/);
assert.match(run({...b,histories:{example:{...h,c:undefined}}}).gaps[0].reason,/published closing price/);
assert.match(run({...b,actions:null}).gaps[0].reason,/need checking/);
assert.match(run({...b,trades:{'a|example':[{date:'2026-08-01',side:'sell',quantity:2,price:1,amount:2}]}}).gaps[0].reason,/later purchase, sale or transfer/);
assert.equal(run({...b,trades:{'a|example':[{date:'2026-01-01',side:'sell',quantity:2,price:1,amount:2}]}}).units.length,1,'a sale already inside the source balance does not invalidate it');
assert.match(run({...b,moves:[{accountId:'a',securityKey:'example',date:'2026-09-10',direction:'out',label:'Transfer',amount:null,invested:null,units:-2,security:null}]}).gaps[0].reason,/transfer/);
const otherOwner = {...position,accountId:'other'};
assert.equal(assumedHoldingReturns([otherOwner],[{...account,accountId:'other'}],'2026-09-01','2026-10-22',{...b,positions:[otherOwner],trades:{'a|example':[{date:'2026-09-10',side:'sell',quantity:10,price:1,amount:10}]}}).units.length,1,'another owner’s sale cannot cancel these shares');
// A 2-for-1 split changes the units, not the wealth. Dividend amounts stay cash,
// and cannot be counted again via dividend-adjusted close / reinvestment.
const split = {id:'s',ticker:'EXAMPLE',isin:position.isin!,company:'Example',type:'split',exDate:'2026-09-15',recordDate:null,purpose:'split',source:'fixture',sourceUrl:null,factor:2,cashPerShare:null,issue:null};
const dividend = {...split,id:'d',type:'dividend',exDate:'2026-10-01',factor:null,cashPerShare:3};
const splitBook = {...b,actions:{...actions,rows:[split,dividend]},histories:{example:{...h,c:[50,100,120],splits:[{date:'2026-09-15',factor:2}]}}};
const s = run(splitBook).units[0]; near(s.invested,2000); near(s.close,2400); near(s.gain,460); near(s.window?.capitalOut,60);
assert.match(run({...splitBook,histories:{example:{...h,c:[50,100,120],splits:[]}}}).gaps[0].reason,/do not match/);
const todaySplit={...split,id:'today',exDate:'2026-10-22'};
const morning=run({...splitBook,actions:{...actions,rows:[split,dividend,todaySplit]},histories:{example:{...h,c:[25,50,60],splits:[{date:'2026-09-15',factor:2},{date:'2026-10-22',factor:2}]}}}).units[0];
near(morning.invested,2000);near(morning.close,2400);near(morning.gain,460,'today’s split can already restate a settled previous close');
const selection: ReturnSelection = {inception:false,type:'absolute',start:'2026-09-01',end:'2026-10-22',windows:[],inceptionRows:[],excluded:[{accountId:'a',label:'Account gap',reason:'No opening value'}],assumedUnits:[s]};
const selected = selectedSegmentReturns([position],[],[account],'security',selection);
near(selected.total.gain,460); near(selected.total.returnPct,460/(2000-60*20/50)*100); assert.equal(selected.total.missing.length,0);
const bridge = capitalBridge(selected.total.units,{accounts:[account],positions:[position],bridges:{},moves:[],income:{}})!;
near(bridge.opening+bridge.added-bridge.takenOut+bridge.gain,bridge.closing); near(bridge.unrealised,400); near(bridge.income,60); near(bridge.realised,0);
assert.equal(bridge.rows[0].split?.source,'assumed-holding');
const verified = {...s.window!,accountId:'a',gain:9,openValue:2000,closeValue:2009,capitalOut:0,flows:[]};
near(selectedSegmentReturns([position],[],[account],'security',{...selection,windows:[verified]}).total.gain,9,'a verified account return wins; never double count');
const privateP = {...position,securityKey:'private',assetClass:'Unlisted',marketSide:'private'} as Position;
const partial = selectedSegmentReturns([position,privateP],[],[account],'security',{...selection,assumptionGaps:[{accountId:'a',securityKey:'private',label:'Private',reason:'A published market price is needed.'}]});
assert.equal(partial.total.missing.length,1); assert.equal(partial.total.missing[0].securityKey,'private');
assert.match(partial.total.missing[0].reason,/published/);
const noCost = selectedSegmentReturns([position],[],[account],'security',{...selection,inception:true});
assert.equal(noCost.total.gain,null,'a holding assumption never invents the original purchase cost');
const cards = availableCardReturns({accounts:[account],positions:[position],privateMarkets:{}} as Portfolio,[position],[],new Date(2026,9,22),splitBook);
near(cards.fytd.total.gain,1460); assert.equal(cards.fytd.total.units[0].assumption?.owner,'Test owner');
assert.equal(cards.gain.total.gain,null);
const fund = {...position,assetClass:'Mutual Fund',security:'Example Growth',symbol:undefined} as Position;
const fundBook = {...b,positions:[fund],actions:null,histories:{example:{...h,basis:'nav' as const,name:'Example Direct Growth',isin:fund.isin!}}};
assert.equal(assumedHoldingReturns([fund],[account],'2026-09-01','2026-10-22',fundBook).units.length,1,'growth NAVs do not depend on equity events');
assert.match(assumedHoldingReturns([fund],[account],'2026-09-01','2026-10-22',{...fundBook,histories:{example:{...h,basis:'nav',name:'Example IDCW'}}}).gaps[0].reason,/dated payouts/);
const latePrice = {...h,last:'2026-10-01',t:['2026-03-31','2026-09-01','2026-10-01'],c:[100,200,210]};
assert.equal(run({...b,histories:{example:latePrice}}).units.length,0,'an old price cannot pretend to close October 22');
assert.equal(run({...b,positions:[{...position,quantity:null}]}).units.length,0,'a live display quantity cannot invent a missing source count');
console.log('Assumed holdings: quantity, prices, dates, owners, sales/transfers, splits, cash dividends, pooling, bridge and headline parity passed.');
