import assert from "node:assert/strict";
import { depositoryFundHoldings, unpricedStatementUnits, applyFundNavs } from "../fundNavs";
import { fifoTotals, positionFifoReturn, realisedReason } from "../fifo";
import { bucketBy, isCostedForFifo, measuredReturn, holdingReturn } from "../analytics";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_RECOVERED_COSTS } from "../../data/glowData";
import { shareCandidates, depositoryShareHoldings } from "../depositoryShares";
import { quoteSymbolFor, type QuoteFeed } from "../quotes";
import type { ActionFeed } from "../corporateActions";
import { fifoReturnPct } from "../../../shared/fifo.mjs";
import { investedOnOf } from "../investedOn";
import { investedSpanOf } from "../privateBook";

const near = (got: number | null | undefined, want: number) =>
  assert.ok(typeof got === "number" && Math.abs(got - want) < .02, `${got} != ${want}`);
assert.equal(BOOK_RECOVERED_COSTS.length, 45, "only exact owner/ISIN/quantity matches are recoverable");
// Bharat's scanned HDFC Bank NSDL statement (Stage 10gk) prints the 1,01,111
// Smartworks shares his saved purchase record bought — an exact match, and the
// only one the scan adds. The row stays quantity-only: a cost values nothing.
const bharat = BOOK_RECOVERED_COSTS.filter(r => r.accountId === "hdfc-bank-nsdl-demat-22025655");
assert.deepEqual(bharat.map(r => [r.isin, r.quantity, r.costBasis]), [["INE0NAZ01010", 101111, 45499950]]);
const icici = BOOK_POSITIONS.filter(p => p.accountId === "icici-bank-nsdl-demat-49794950");
const recovered = icici.filter(p => p.recoveredCost);
assert.equal(recovered.length, 9);
const expected: Record<string, [number, number]> = {
  INE647U01026: [94967, 93857991], INE212S01015: [180185, 176878881],
  INE12E301017: [262125, 16277250], INE0LGX01024: [212000, 69684400],
  INE00YJ01010: [116979, 75000350], INE1H7V01011: [59000, 10030000],
  INE0NAZ01010: [187778, 84500100], INE00GK01023: [138462, 10000120],
  INE0ZOL01023: [44643, 4642872],
};
for (const p of recovered) {
  const [units, cost] = expected[p.isin!];
  assert.equal(p.quantity, units); near(p.costBasis, cost); near(p.avgCost, cost / units);
  assert.equal(p.currentPrice, null, "the depository's value does not establish a per-share market quote");
  assert.ok(p.marketValue > 0);
  assert.equal(p.costBasisSource, "supplementary-record");
  assert.ok(p.recoveredCost!.evidence.every(e => e.rows.length > 0 && e.sheet && e.path.startsWith("source/")));
  near(p.returnPct, fifoReturnPct(p.marketValue, cost, p.realizedPnL, p.costOfUnitsSold, p.dividendReceived)!);
}
assert.equal(BOOK_ACCOUNTS.find(a => a.accountId === recovered[0].accountId)!.asOf, "2026-03-31");
const ema = recovered.find(p => p.isin === "INE0ZOL01023")!;
assert.equal(ema.realizedPnL, null, "a payment register does not establish realised income");
assert.equal(ema.dividendReceived, null);
const yash = recovered.find(p => p.isin === "INE00GK01023")!;
assert.equal(yash.quantity, 138462, "unverified June disposals never advance the March snapshot");
assert.equal(yash.realizedLotsAfter, 3, "known later disposals block live pricing of the old units");

const candidates = shareCandidates();
// Twelve: Bharat's Smartworks shares on his HDFC Bank NSDL statement (Stage 10gk) are the twelfth.
assert.equal(candidates.filter(p => p.recoveredCost).length, 12);
assert.ok(candidates.some(p => p.accountId === "hdfc-bank-nsdl-demat-22025655" && p.isin === "INE0NAZ01010" && p.recoveredCost));
const infinium = candidates.find(p => p.isin === "INE0MRE01011")!;
assert.equal(infinium.quantity, 8000); near(infinium.costBasis, 2646660);
near(infinium.realizedPnL, -88917.69); near(infinium.costOfUnitsSold, 330630);
for (const isin of ["INE918Z01012", "INE0LGX01024", "INE531F01023", "INE1CDF01017"]) {
  const p = candidates.find(p => p.isin === isin)!;
  assert.ok(p, `unresolved ${isin} stays recorded`);
  assert.equal(p.costBasis, null, "later receipts or different quantities need original lots");
}
// Prove the recovered lots reach the live table, survive pricing and still
// include realised FIFO gain. This feed is a test fixture, not a market quote.
const symbol = quoteSymbolFor(infinium)!;
const feed: QuoteFeed = { asOf: "2026-10-21T08:00:00Z", missing: [], pending: [], fresh: 1, stale: 0,
  quotes: { [symbol]: { price: 400, prevClose: 390, ageS: 0, source: "upstox", open: null,
    dayLow: null, dayHigh: null, low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null } } };
const actions: ActionFeed = { version: 1, capturedAt: feed.asOf, requestedFrom: "2020-01-01",
  requestedTo: "2026-10-21", verifiedThrough: "2026-10-21", symbols: [symbol], isins: [infinium.isin!], sourceUrl: "test", rows: [] };
const live = depositoryShareHoldings(feed, actions, [infinium])[0];
assert.ok(live?.live); assert.equal(live.quantity, 8000); near(live.avgCost, 2646660 / 8000);
near(live.returnPct, ((3200000 - 2646660 - 88917.69) / 2977290) * 100);

const fund = (account: string, key: string) => BOOK_POSITIONS.find(p => p.accountId.endsWith(account) && p.securityKey.includes(key))!;
near(fund("15644806", "balanced").costBasis, 25000000);
near(fund("16002141", "balanced").costBasis, 15000000);
near(fund("7125255", "large").costBasis, 3360937);
const overnight = fund("15725046", "overnight");
near(overnight.costBasis, 139163.47); near(overnight.realizedPnL, 1411596.13);
near(overnight.costOfUnitsSold, 28588403.87);
near(overnight.returnPct, fifoReturnPct(overnight.marketValue, overnight.costBasis, overnight.realizedPnL,
  overnight.costOfUnitsSold, overnight.dividendReceived)!);
assert.ok(overnight.returnPct! > 5 && overnight.returnPct! < 6,
  "HPR includes the redeemed lots and original cost carried through the fund switches");
for (const p of BOOK_POSITIONS.filter(p => p.costBasis != null && p.quantity! > 0 && !p.valuedAtCost))
  assert.ok(p.avgCost != null, `${p.security} has a derivable per-unit cost`);
console.log("Recovered costs: exact quantities, March cutoff, FIFO sales, live overlay, four folios and honest unresolved balances passed");

// The live-only fund layers need the same lot recovery as the baked holdings.
const funds=[...depositoryFundHoldings(),...unpricedStatementUnits()];
assert.equal(funds.filter(p=>p.recoveredCost).length,21);
const fp=(account:string,isin:string)=>funds.find(p=>p.accountId.endsWith(account)&&p.isin===isin)!;
for (const [account, first, last, lots] of [['12539150','2025-03-06','2026-03-23',4],['12838316','2025-11-06','2025-11-06',1],['12838320','2025-07-11','2025-07-11',1]] as const) {
  const p = fp(account,'INF109KC1RH9');
  assert.deepEqual(p.recoveredCost?.heldPurchases,{first,last,lots},`${account}: its own source lots date the held balance`);
  assert.equal(investedOnOf([p])?.first,first);
  assert.equal(investedOnOf([p])?.last,last);
  assert.equal(investedOnOf([p])?.payments,lots);
  assert.deepEqual(investedSpanOf(p,null),{from:first,to:last,source:'holding-record'},'the private-market date cell shares the reconciled source');
  assert.equal(investedOnOf([{...p,quantity:p.quantity!+1}]),null,'a different unit balance cannot borrow recovered dates');
  assert.equal(investedOnOf([{...p,accountId:'different-account'}]),null,'another account cannot borrow recovered dates');
  assert.equal(investedOnOf([{...p,isin:'different-isin'}]),null,'another scheme cannot borrow recovered dates');
}
near(fp('12838316','INF0R8701046').costBasis,72403187.18);
const largeMid=fp('12539150','INF174K01LF9');
assert.equal(largeMid.quantity,34045.997);near(largeMid.costBasis,12499374.97);
assert.notEqual(largeMid.quantity,27900.484,'the separate AMC folio must not be pooled into demat lots');
const liquid=fp('32387399','INF109K01Q49');
near(liquid.costBasis,18215301.46);near(liquid.costOfUnitsSold,11783198.53);near(liquid.realizedPnL,128261.98);
near(liquid.returnPct,fifoReturnPct(liquid.marketValue,liquid.costBasis,liquid.realizedPnL,liquid.costOfUnitsSold,liquid.dividendReceived)!);
const savings=fp('12539150','INF109KA11J9');
near(savings.costBasis,9320249.865*24.98);
assert.equal(savings.realizedPnL,null);assert.equal(savings.returnPct,null);assert.ok(savings.hprUnavailableReason);
assert.equal(positionFifoReturn(savings),null);
for(const set of [[savings],[liquid,savings]]) {
  const total=fifoTotals(set);assert.equal(total.returnPct,null);assert.equal(total.gain,null);assert.equal(total.realised,null);
  assert.ok(total.costHeld!>0);assert.notEqual(total.unrealised,null);
  assert.equal(bucketBy(set,()=>"all")[0].returnPct,null);
}
assert.equal(applyFundNavs([savings])[0].returnPct,null,'a fresh NAV cannot invent missing sale proceeds');
assert.equal(fp('12539150','INF247L01ED1').costBasis,null,'0.066 units still need a reconciliation');
assert.equal(fp('12838316','INF179K01830').costBasis,null,'a different folio balance cannot supply cost');

// Costs can be known while a holding's current unit/price basis is unverified.
const silver=BOOK_RECOVERED_COSTS.find(r=>r.accountId.endsWith('12838316')&&r.isin==='INF740KA1RE3')!;
near(silver.costBasis,17222067.17);near(silver.realizedPnL,14667670.15);near(silver.costOfUnitsSold,14981798.27);
assert.equal(silver.quantity,123000);
assert.ok(!funds.some(p=>p.accountId===silver.accountId&&p.isin===silver.isin),'recovering cost must not bypass the valuation/unit-basis gate');

const aggregateInputs=[liquid,savings].filter(isCostedForFifo);
assert.equal(aggregateInputs.length,2,'unknown proceeds must not remove a costed holding from the FIFO pool');
const pooled=fifoTotals(aggregateInputs);assert.equal(pooled.returnPct,null);
assert.equal(realisedReason(savings),savings.hprUnavailableReason);
const absent=measuredReturn({...savings,heldSince:null},'absolute','2026-10-21');
assert.ok(!absent.shown && absent.reason===savings.hprUnavailableReason);
const grouped=measuredReturn({returnPct:null,heldSince:null,assetClass:'Mutual Fund',fifo:pooled},'absolute','2026-10-21');
assert.ok(!grouped.shown && grouped.reason===savings.hprUnavailableReason);
assert.deepEqual(holdingReturn({...savings,heldSince:null},'absolute','2026-10-21'),{kind:'absent',reason:savings.hprUnavailableReason});
