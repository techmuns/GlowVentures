import assert from "node:assert/strict";
import { cashInstruments, instrumentIndex, resolveInstrument, type Listing } from "../../../shared/upstoxInstrumentLookup.mjs";
import { UPSTOX_INSTRUMENTS, UPSTOX_ISIN_SYMBOLS } from "../../../shared/upstoxInstruments.mjs";
import { BOOK_POSITIONS } from "../../data/glowData";
import { applyQuotes, holdingQuoteSymbolFor, quoteSymbolFor, symbolFor, type QuoteFeed } from "../quotes";
import { applyFundNavs } from "../fundNavs";

const listing = (segment: string, isin: string, symbol: string, name = "Example Limited", series = "EQ"): Listing => ({
  segment, instrument_key: `${segment}|${isin}`, trading_symbol: symbol, name, instrument_type: series,
});
const isin = "INE00GK01023";
const bse = listing("BSE_EQ", isin, "YASHHV", "Yash Highvoltage Limited", "M");
const nse = listing("NSE_EQ", isin, "EXAMPLE");
assert.equal(resolveInstrument({ isin }, instrumentIndex([bse])).instrument?.instrument_key, bse.instrument_key);
assert.equal(resolveInstrument({ isin }, instrumentIndex([bse, nse])).instrument?.segment, "NSE_EQ");
assert.equal(cashInstruments([bse, listing("BSE_EQ", "INE000000001", "YASHHV", "Yash bond", "F")]).length, 1);
assert.ok(resolveInstrument({ symbol: "EXAMPLE", isin: "INE000000001" }, instrumentIndex([nse])).reason);
assert.ok(resolveInstrument({ key: "example" }, instrumentIndex([nse, listing("NSE_EQ", "INE000000001", "OTHER")])).reason);
assert.equal(resolveInstrument({ key: "example-near" }, instrumentIndex([nse])).instrument, undefined);
assert.equal(resolveInstrument({ key: "example" }, instrumentIndex([nse, listing("BSE_EQ", isin, "EXAMPLE", "Example Limited", "A")])).instrument?.segment, "NSE_EQ");

const yash = BOOK_POSITIONS.find((p) => p.securityKey === "yash-highvoltage")!;
assert.ok(yash);
assert.equal(symbolFor(yash), null); // Other vendors still need an NSE symbol.
assert.equal(quoteSymbolFor(yash), "BSE:YASHHV");
assert.equal(quoteSymbolFor({ securityKey: "hdfc-bank", isin: "INE040A01034" }), "HDFCBANK");
assert.equal(quoteSymbolFor({ securityKey: "gujarat-gas" }), "GUJENERGY");
assert.equal(quoteSymbolFor({ securityKey: "indian-railways-finance" }), "IRFC");
assert.equal(quoteSymbolFor({ securityKey: "affIe", isin: "INE00WC01027" }), "AFFLE");
assert.equal(quoteSymbolFor({ securityKey: "not-a-listed-company" }), null);
assert.equal(UPSTOX_ISIN_SYMBOLS["INE00GK01023"], "BSE:YASHHV");
assert.equal(UPSTOX_INSTRUMENTS["BSE:YASHHV"].tradingSymbol, "YASHHV");

const feed: QuoteFeed = { quotes: { "BSE:YASHHV": { price: 900, prevClose: 890, ageS: 0, source: "upstox",
  open: null, dayLow: null, dayHigh: null, low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null } },
  asOf: new Date().toISOString(), missing: [], pending: [], fresh: 1, stale: 0 };
const updated = applyQuotes([yash], feed)[0];
assert.equal(updated.currentPrice, 900);
assert.equal(updated.marketValue, yash.quantity! * 900);
assert.equal(updated.quantity, yash.quantity);
assert.equal(updated.costBasis, yash.costBasis);
assert.equal(updated.symbol, yash.symbol); // A BSE identifier must not enter NSE vendor calls.
const bond = { ...yash, assetClass: "Bond" as const, isin: "INE00GK07021", currentPrice: 100, marketValue: 1000 };
const unchangedBond = applyQuotes([bond], feed)[0];
assert.equal(unchangedBond.live, false);
assert.equal(unchangedBond.currentPrice, bond.currentPrice);
assert.equal(unchangedBond.marketValue, bond.marketValue);
assert.equal(holdingQuoteSymbolFor(bond), null);
const liquid = BOOK_POSITIONS.find((p) => p.assetClass === "Mutual Fund" && p.symbol === "LIQUIDBEES")!;
assert.ok(liquid, "the committed book includes a fund-classified listed ETF");
assert.equal(holdingQuoteSymbolFor(liquid), "LIQUIDBEES");
const liquidFeed: QuoteFeed = { ...feed, quotes: { LIQUIDBEES: { ...feed.quotes["BSE:YASHHV"], price: 1000 } } };
const liquidLive = applyQuotes([liquid], liquidFeed)[0];
assert.equal(liquidLive.live, true);
assert.equal(liquidLive.currentPrice, 1000);
assert.equal(applyFundNavs([liquidLive])[0].currentPrice, 1000, "intraday ETF quote wins over the NAV overlay");
assert.equal(holdingQuoteSymbolFor({ ...liquid, isin: null }), null, "fund pricing requires its exact listed-unit identity");
console.log("Company CMP: exact NSE/BSE identities, fund-only companies, conflicts and valuation overlay passed");
