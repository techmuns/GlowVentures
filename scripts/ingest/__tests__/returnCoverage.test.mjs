import assert from 'node:assert/strict';
import { unitLedgerReturnRecord } from '../../lib/unitLedgerReturns.mjs';
import { classify } from '../lib/classify.mjs';
import { pmsSiblingProvider } from '../lib/pmsSiblingProvider.mjs';
import { extract } from '../providers/folioLedger.mjs';
import { deriveDocument } from '../lib/document.mjs';
import { extract as readMutualFolio } from '../providers/mutualFundFolio.mjs';

const row = (date, units, balance, amount, kind='contribution') => ({ date, units, balance, amount, kind, securityKey:'scheme', description:kind });
const holding = { securityKey:'scheme', isin:'INFTEST00001', quantity:100, marketValue:1200, priceAsOn:'2026-09-30' };
const source = { docKey:'folio', status:'ok', asOf:'2026-10-05', periodFrom:'2025-01-01', periodTo:'2026-10-05',
  holdings:[holding], cashFlows:[row('2025-01-01',100,100,1000)] };
const navs = [{ isin:holding.isin, date:'2026-03-31', nav:11, source:'published-nav' }];
let result = unitLedgerReturnRecord(source,'2026-04-01',navs);
assert.equal(result.asOf,'2026-09-30','close on the actual NAV date, not statement print date');
assert.equal(result.flows[0].amount,-1100);
assert.equal(result.flows.length,1,'capital before the FY is inside the opening');
assert.deepEqual(result.openingSources,['folio','published-nav']);
assert.equal(unitLedgerReturnRecord(source,'2026-04-01',[]),null,'missing historical NAV refuses opening');
assert.equal(unitLedgerReturnRecord(source,'2026-04-01',[{...navs[0],isin:'another-scheme'}]),null,'no name/ISIN guess');
assert.equal(unitLedgerReturnRecord({...source,cashFlows:[row('2025-01-01',100,110,1000)]},'2026-04-01',navs),null,'first allotment must witness nil');
assert.equal(unitLedgerReturnRecord({...source,cashFlows:[...source.cashFlows,row('2026-05-01',10,100,100)]},'2026-04-01',navs),null,'missing/offsetting movements fail every running balance');
assert.equal(unitLedgerReturnRecord({...source,warnings:[{code:'unsupported-movement'}]},'2026-04-01',navs),null);
const redeemed = {...source,holdings:[{...holding,quantity:0,marketValue:0}],
  cashFlows:[...source.cashFlows,row('2026-09-23',-100,0,-1199,'withdrawal')]};
result = unitLedgerReturnRecord(redeemed,'2026-04-01',navs);
assert.equal(result.value,0,'sourced nil is legitimate');
assert.equal(result.flows.at(-1).amount,1199,'net redemption survives the closing zero');
const newFolio = {...source,cashFlows:[row('2026-08-01',100,100,1000)]};
result = unitLedgerReturnRecord(newFolio,'2026-04-01',[]);
assert.equal(result.flows[0].amount,0,'complete first allotment proves no opening capital');
assert.equal(result.flows[1].amount,-1000);
assert.equal(unitLedgerReturnRecord({...newFolio,periodFrom:'2026-07-01'},'2026-04-01',[]),null,'a later statement can omit earlier FY investments and redemptions');
assert.equal(unitLedgerReturnRecord({...newFolio,periodFrom:null},'2026-04-01',[]),null,'unknown ledger coverage cannot establish a nil FY opening');
assert(unitLedgerReturnRecord({...newFolio,periodFrom:null,cashFlows:[{...newFolio.cashFlows[0],notes:'Ledger scope: since inception'}]},'2026-04-01',[]),'an explicitly since-inception ledger proves the nil origin');
assert.equal(unitLedgerReturnRecord({...source,holdings:[{...holding,priceAsOn:'2026-04-30'}],cashFlows:[...source.cashFlows,row('2026-06-01',10,110,100)]},'2026-04-01',navs),null,'later units cannot be valued at an older mark');

const switched = {...redeemed,holdings:[{...holding,quantity:0,marketValue:0},{...holding,securityKey:'second',quantity:0,marketValue:0}],cashFlows:[
  ...source.cashFlows,row('2026-03-31',-100,0,-1100,'reclassification'),
  {...row('2026-03-31',100,100,1100,'reclassification'),securityKey:'second',notes:'post-tax allotment/redemption NAV 11'},
  {...row('2026-09-23',-100,0,-1200,'withdrawal'),securityKey:'second'},
]};
result = unitLedgerReturnRecord(switched,'2026-04-01',[]);
assert.equal(result.flows.length,2,'class switch is not external cash');
assert.equal(result.flows[0].amount,-1100,'own 31 March NAV establishes opening');
const unpaired=structuredClone(switched);unpaired.cashFlows[2].amount=1200;
assert.equal(unitLedgerReturnRecord(unpaired,'2026-04-01',[]),null,'both class-switch legs must agree');

assert.equal(classify({fileName:'G3517383_40212_BankBook.pdf',text:'CARNELIAN BESPOKE PORTFOLIO Account : 3517383 Ajay T Jaisinghani BANK BOOK From 01/04/2026 to 07/10/2026'}).provider,'Carnelian Asset Management and Advisors Pvt Ltd');
assert.equal(classify({fileName:'Z1281_8710090_BankBook178CT.pdf',text:'SVAN INVESTMENT MANAGERS LLP BANK BOOK Account : 8710090 Bharat Jaisinghani From 01/04/2026 to 30/09/2026'}).provider,'SVAN Investment Managers LLP');
assert.equal(classify({fileName:'demat.pdf',text:'CDSL AND NSDL : IN-DP-1 Statement of holdings Scheme Motilal Oswal Arbitrage Fund - Direct Plan Growth- ISIN No : INF247L01ED1'}).provider,'Motilal Oswal Financial Services (demat)','a held fund cannot replace the depository issuer');
assert.equal(classify({fileName:'register.xlsx',text:'ORG. SHARE CERTIFICATE STATUS Invesco India Arbitrage Fund invescomutualfund.com'}).provider,'Family investment register (not a statement)');
const friendly={sourcePath:'source/drop/issuer/CURRENT PORTFOLIO.pdf'};
const witness={status:'ok',provider:'Goldstandard Wealth Private Limited',accountNo:'100023',ownerId:'ajay',sourcePath:'source/drop/issuer/G100023_Performance.pdf'};
const text='CURRENT PORTFOLIO\nAccount : 100023 Ajay Thakurdas Jaisinghani\nHDFC Asset Management Co. Ltd';
// Obtain the registry's actual canonical ID rather than assuming a spelling.
import {resolveOwner}from'../../../shared/owners.mjs';
witness.ownerId=resolveOwner('Ajay Thakurdas Jaisinghani').owner.ownerId;
assert.equal(pmsSiblingProvider(friendly,text,[friendly,witness]),witness.provider);
assert.equal(pmsSiblingProvider(friendly,text,[{...witness,sourcePath:'source/other/G.pdf'}]),null,'different deliveries cannot supply a provider guess');
assert.equal(pmsSiblingProvider(friendly,text,[{...witness,ownerId:'other'}]),null,'same number with a different holder refuses attribution');

const native=`Account Statement for Folio No. 12345678
Statement Period : 24-Jul-2006 to 30-Sep-2026
Primary Unitholder Details Folio Information
ASHA TESTHOLDER Mode Of Holding : SINGLE
Invesco India Test Fund - INF205K01122 NAV as on 30/09/2026(Rs. )12.0000
04/11/2025 04/11/2025 Gross Lateral Shift In 1,000.05
04/11/2025 Stamp Duty 0.05
04/11/2025 Net Lateral Shift In 1,000.00 10.0000 0 10.000000 100.000 100.000
23/09/2026 23/09/2026 Gross Redemption 1,100.00 11.0000 0 11.000000 100.000 0.000
23/09/2026 STT Paid on above (@0.001%) 0.01
Page 2 of 3
Invesco India Test Fund - INF205K01122 NAV as on 30/09/2026(Rs. )12.0000
23/09/2026 Net Redemption 1,099.99 0.000
`;
const read = text => extract({grid:{pages:[{text}]},meta:{docKey:'native',provider:'Invesco Mutual Fund'}});
const parsed=deriveDocument(read(native));
assert.equal(parsed.status,'ok');assert.equal(parsed.cashFlows.length,2);
assert.equal(parsed.cashFlows[1].amount,-1099.99,'net after STT, even across a page break');
assert.equal(parsed.holdings[0].marketValue,0);
assert.equal(read(native.replace('STT Paid on above (@0.001%) 0.01','STT Paid on above (@0.001%) 0.03')).cashFlows.length,0);
assert.equal(read(native.replace('100.000 0.000','100.000 1.000')).cashFlows.length,0);
const hdfc=`HDFC Mutual Fund
Account Statement (From 01-JAN-2020 To 30-SEP-2026)
Folio No. : 12345678 / 36 Statement Date : 01-Oct-2026
Asha Testholder
Mode of Holding : Single
Tax Status : Individual
8604 / HDFC Sample Fund - Direct Plan - Growth Option - INF179KB1HT1
Opening Balance as on 01/01/2020 0.000
01/01/2020 Purchase 10.0000 100.00 10.0000 10.000 10.000
Available Units to Redeem : 10.000
Market Value of Balance Units at NAV of 12.0000 on 30/09/2026 (INR) : 120.00 Total Units Under Lien : 0.000
`;
const readH = text => deriveDocument(readMutualFolio({grid:{pages:[{text}]},meta:{docKey:'hdfc',provider:'HDFC Mutual Fund'}}));
assert.equal(readH(hdfc).holdings[0].quantity,10,'available units with explicit nil lien establish current units, never opening zero');
assert.equal(readH(hdfc).holdings[0].marketValue,120);
assert.equal(readH(hdfc).cashFlows[0].kind,'opening-units','unchanged units over a complete FY ledger support an opening');
assert.equal(readH(hdfc.replace('Under Lien : 0.000','Under Lien : 2.000')).holdings[0].quantity,null,'available units exclude a lien and cannot value the whole holding');
assert.equal(readH(hdfc.replace('Under Lien : 0.000','Under Lien : 2.000')).holdings[0].marketValue,120,'keep the independently printed value when units cannot be established');
assert.equal(readH(hdfc.replace('Available Units','01/08/2026 Purchase 10.0000 100.00 10.0000 10.000 20.000\nAvailable Units')).cashFlows?.length??0,0,'any FY financial movement refuses the static-unit shortcut');
console.log('PASS recovered return coverage: unit history, genuine nil, dated NAV, cash charges, switch reconciliation and issuer attribution');
