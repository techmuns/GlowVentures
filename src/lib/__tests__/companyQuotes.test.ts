import assert from "node:assert/strict";
import { cashInstruments, instrumentIndex, resolveInstrument, type Listing } from "../../../shared/upstoxInstrumentLookup.mjs";
import { UPSTOX_INSTRUMENTS, UPSTOX_ISIN_SYMBOLS } from "../../../shared/upstoxInstruments.mjs";
import { BOOK_POSITIONS } from "../../data/glowData";
import { applyQuotes, holdingQuoteSymbolFor, listingIsinFor, moveSymbolFor, quoteSymbolFor, symbolFor, type QuoteFeed } from "../quotes";
import { UPSTOX_SECURITY_SYMBOLS } from "../../../shared/upstoxInstruments.mjs";
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

// Stage 10hb: NSE is a review line the family placed on the listed side, and
// its own ISIN is a BSE listing — priced off that, never off its name.
const nseLines = BOOK_POSITIONS.filter((p) => p.securityKey === "national-stock-exchange-of-india");
assert.ok(nseLines.length === 2 && nseLines.every((p) => p.review && p.marketSide === "listed" && p.isin === "INE721I01024"));
assert.equal(UPSTOX_ISIN_SYMBOLS["INE721I01024"], "BSE:NSE");
assert.equal(UPSTOX_INSTRUMENTS["BSE:NSE"].key, "BSE_EQ|INE721I01024");
assert.equal(UPSTOX_INSTRUMENTS["BSE:NSE"].tradingSymbol, "NSE");
assert.equal(moveSymbolFor(nseLines[0]), "BSE:NSE");
assert.equal(moveSymbolFor(yash), "BSE:YASHHV", "a BSE-only listing's move is read under its exchange-qualified key");
assert.equal(moveSymbolFor({ securityKey: "hdfc-bank", symbol: "HDFCBANK", isin: "INE040A01034" }), "HDFCBANK", "an NSE symbol is read as before");
const nseFeed: QuoteFeed = { ...feed, quotes: { "BSE:NSE": { ...feed.quotes["BSE:YASHHV"], price: 2000, prevClose: 1980 } } };
const nseLive = applyQuotes(nseLines, nseFeed);
assert.ok(nseLive.every((p) => p.live && p.currentPrice === 2000), "the listed review line takes its BSE quote");
assert.equal(nseLive[0].marketValue, nseLines[0].quantity! * 2000);
assert.equal(nseLive[0].symbol, null, "the BSE key never enters NSE vendor calls");
const privateLine = BOOK_POSITIONS.find((p) => p.review && p.marketSide === "private" && typeof p.quantity === "number")!;
assert.ok(privateLine, "the book carries a private review line with units");
assert.equal(applyQuotes([{ ...privateLine, isin: "INE721I01024" }], nseFeed)[0].live, false,
  "a private review line is never priced, even when its ISIN resolves");
// Stage 10he: a face-value split retires an ISIN. Shankara Buildpro's SVAN
// statements (30 Sep) print INE24OJ01011; after the 8 Oct split only
// INE24OJ01029 is listed, and the held name still reaches BUILDPRO.
const buildpro = BOOK_POSITIONS.filter((p) => p.securityKey === "shankara-buildpro");
assert.ok(buildpro.length > 0 && buildpro.every((p) => p.isin === "INE24OJ01011" && p.symbol === "BUILDPRO"));
assert.equal(UPSTOX_INSTRUMENTS.BUILDPRO.key, "NSE_EQ|INE24OJ01029");
assert.ok(UPSTOX_INSTRUMENTS.BUILDPRO.joinedBy.endsWith("+successor"));
assert.equal(UPSTOX_ISIN_SYMBOLS["INE24OJ01011"], undefined, "the retired ISIN is not a listed ISIN");
assert.ok(buildpro.every((p) => quoteSymbolFor(p) === "BUILDPRO"), "the held name still reaches its quote");
assert.equal(UPSTOX_INSTRUMENTS.JSWDULUX.key, "NSE_EQ|INE133A01029");
assert.equal(UPSTOX_SECURITY_SYMBOLS["jsw-dulux"], "JSWDULUX", "the fund-disclosed company keeps its quote");
// …and a statement that prints neither ISIN nor NSE symbol reaches its BSE SME
// listing through a cited alias, and is identified by that listing's ISIN.
const poojaa = BOOK_POSITIONS.filter((p) => p.securityKey === "poojaa-precision-engineering");
assert.ok(poojaa.length > 0 && poojaa.every((p) => !p.isin && !symbolFor(p)));
assert.ok(poojaa.every((p) => quoteSymbolFor(p) === "BSE:PPEL" && moveSymbolFor(p) === "BSE:PPEL"));
assert.equal(UPSTOX_INSTRUMENTS["BSE:PPEL"].key, "BSE_EQ|INE288301026");
assert.ok(poojaa.every((p) => listingIsinFor(p) === "INE288301026"));
assert.equal(listingIsinFor(yash), "INE00GK01023", "a statement's own ISIN always wins");
assert.equal(listingIsinFor({ securityKey: "not-a-listed-company" }), null);
console.log("Company CMP: exact NSE/BSE identities, fund-only companies, conflicts and valuation overlay passed");
