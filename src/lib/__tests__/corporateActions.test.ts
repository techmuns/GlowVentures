import assert from "node:assert/strict";
import fs from "node:fs";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "../../data/glowData";
import { applyCorporateActionQuotes, projectActions, positionActionKey, marketDay } from "../corporateActions";
import { parseAction, normalizeActionFeed, validActionFeed, type ActionFeed } from "../../../shared/corporateActions.mjs";
import type { Position, Account } from "../types";
import type { QuoteFeed } from "../quotes";

const p: Position = { ...BOOK_POSITIONS.find((p) => p.assetClass === "Equity")!, accountId: "test", securityKey: "test",
  security: "Test equity", symbol: "TEST", isin: null, quantity: 100, avgCost: 10, currentPrice: 10,
  costBasis: 1000, marketValue: 1000, unrealizedPnL: 0, realizedPnL: 0, costOfUnitsSold: 0, realizedLotsAfter: 0,
  returnPct: 0, dividendReceived: 23 };
const accounts: Account[] = [{ ...BOOK_ACCOUNTS[0], accountId: "test", asOf: "2026-08-31" }];
const raw = (type: string, date: string, purpose: string, fields = {}) => ({
  id: `${type}:${date}`, ticker: "TEST", company: "Test equity", actionType: type, exDate: date,
  purpose, source: "NSE", sources: ["NSE"], isin: null, sourceUrl: "https://www.nseindia.com/test", ...fields,
});
const split = raw("split", "2026-09-02", "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 5/- Per Share");
const bonus = raw("bonus", "2026-09-04", "Bonus 1:1");
const dividend = raw("dividend", "2026-09-05", "Dividend - Rs 1 Per Share");
function feed(rows: unknown[]): ActionFeed {
  return normalizeActionFeed({ version: 1, capturedAt: "2026-09-23T10:00:00Z", requestedFrom: "2023-09-24", requestedTo: "2027-09-23",
    rowCount: rows.length, rows, sources: { nse: { capturedAt: "2026-09-23T10:00:00Z" }, screener: { capturedAt: "2026-09-23T09:00:00Z" } } }, ["TEST"]);
}
function quotes(price = 2.5, tradedAt = "2026-09-23T09:00:00Z"): QuoteFeed {
  return { asOf: "2026-09-23T10:00:00Z", missing: [], pending: [], fresh: 1, stale: 0, quotes: { TEST: {
    price, tradedAt, prevClose: price, open: price, dayLow: price, dayHigh: price, low52: null, high52: null,
    marketCap: null, volume: 1, yearChangePct: null, ageS: 0, source: "upstox",
  } } };
}
const f = feed([split, bonus, dividend]);
assert.ok(validActionFeed(f));
assert.equal(marketDay("2026-09-22T20:00:00Z"), "2026-09-23");
assert.equal(parseAction(split).factor, 2);
assert.equal(parseAction(bonus).factor, 2);
assert.equal(parseAction(dividend).cashPerShare, 1);
assert.equal(parseAction(raw("bonus", "2026-09-04", "Scheme Of Arrangement - Bonus Ncrps 46:1")).factor, null);
assert.equal(parseAction(raw("dividend", "2026-09-04", "Dividend · Final · 250.00%", { source: "Screener", sources: ["Screener"], screener: { companyKey: "TEST" } })).cashPerShare, null);
assert.equal(parseAction(raw("dividend", "2026-09-04", "Dividend - Rs 10 Per Share and Special Dividend Rs 2 Per Share")).cashPerShare, null);
assert.equal(parseAction(raw("bonus", "2026-09-04", "Bonus 1:1", { screener: { ratio: "2:1" } })).factor, null);
assert.equal(parseAction(raw("split", "2026-09-04", "Face Value Split - From Rs 10 To Rs 5", { screener: { oldFaceValue: "10", newFaceValue: "1" } })).factor, null);
assert.equal(parseAction(raw("dividend", "2026-09-04", "Dividend - Rs 1 Per Share", { exDate: "2026-02-30" })).cashPerShare, null);
assert.equal(parseAction(raw("dividend", "2026-09-04", "Dividend - Rs 1 Per Share", { sourceUrl: "javascript:alert(1)" })).sourceUrl, null);

const before = JSON.stringify(p);
const first = applyCorporateActionQuotes([p], accounts, quotes(), f);
const result = first.returns.get(positionActionKey(p))!;
assert.equal(first.positions[0].quantity, 400, "split and bonus compound once in order");
assert.equal(first.positions[0].avgCost, 2.5);
assert.equal(first.positions[0].costBasis, 1000, "corporate actions do not create cost or cash");
assert.equal(first.positions[0].marketValue, 1000, "split/bonus are value-neutral");
assert.equal(first.positions[0].returnPct, 0, "the share ratio is not profit");
assert.equal(result.dividendEntitlement, 400, "dividend uses shares on its ex-date after earlier actions");
assert.equal(result.totalReturnPct, 39.99999999999999);
assert.equal(first.positions[0].dividendReceived, 23, "entitlement does not overwrite recorded income");
assert.equal(JSON.stringify(p), before, "statement object remains byte-for-byte unchanged");
assert.deepEqual(applyCorporateActionQuotes([p], accounts, quotes(), f), first, "repeated refresh does not reapply actions");

const alreadyAdjusted = { ...p, quantity: 400, avgCost: 2.5, currentPrice: 2.5 };
const after = applyCorporateActionQuotes([alreadyAdjusted], [{ ...accounts[0], asOf: "2026-09-04" }], quotes(), f);
assert.equal(after.positions[0].quantity, 400, "actions at or before the statement are not replayed");
assert.equal(after.returns.get(positionActionKey(p))!.dividendEntitlement, 400);
const future = projectActions(p, "2026-08-31", "2026-09-01", f);
assert.equal(future.factor, 1);
assert.equal(future.dividendEntitlement, 0);
assert.ok(future.lines.every((l) => l.status === "upcoming"));
const earlyDividend = feed([raw("dividend", "2026-09-01", "Dividend - Rs 1 Per Share"), split]);
assert.equal(projectActions(p, "2026-08-31", "2026-09-23", earlyDividend).dividendEntitlement, 100, "later splits must not multiply earlier cash");

const unavailable = applyCorporateActionQuotes([p], accounts, quotes(), null);
assert.equal(unavailable.positions[0].live, false);
assert.equal(unavailable.positions[0].quantity, 100);
assert.equal(unavailable.returns.get(positionActionKey(p))!.totalReturnPct, null);
const noQuote = applyCorporateActionQuotes([p], accounts, null, f);
assert.equal(noQuote.positions[0].quantity, 100);
assert.equal(noQuote.positions[0].currentPrice, 10, "never leave adjusted units paired with pre-action price");
assert.equal(noQuote.returns.get(positionActionKey(p))!.totalReturnPct, null);
assert.equal(projectActions(p, "2020-08-31", "2026-09-23", f).dividendEntitlement, null, "missing historical coverage is not zero income");
assert.equal(projectActions(p, "2026-08-31", "2026-09-23", { ...f, verifiedThrough: "2026-09-22" }).dividendEntitlement, null, "stale source coverage cannot certify current return");
assert.equal(applyCorporateActionQuotes([p], accounts, quotes(), { ...f, verifiedThrough: "2026-09-22" }).positions[0].live, false, "stale coverage cannot miss a split while marking old units at new prices");
assert.equal(applyCorporateActionQuotes([{ ...p, realizedLotsAfter: 1 }], accounts, quotes(), f).positions[0].live, false, "a recorded later sale invalidates the unchanged-holdings assumption");
const undatedQuote = quotes(5); delete undatedQuote.quotes.TEST.tradedAt; undatedQuote.asOf = "2026-09-02T03:00:00Z";
assert.equal(applyCorporateActionQuotes([p], accounts, undatedQuote, f).positions[0].live, false, "an ex-date pre-open quote is not post-split evidence");
const exDay = applyCorporateActionQuotes([p], accounts, quotes(5, "2026-09-02T09:00:00Z"), f);
assert.equal(exDay.positions[0].quantity, 200);
assert.equal(exDay.positions[0].dayChangePct, null, "unknown previous-close basis cannot create false day move");

const conflicting = feed([split, { ...split, id: "duplicate", purpose: "Face Value Split - From Rs 10 To Rs 1" }]);
assert.equal(applyCorporateActionQuotes([p], accounts, quotes(), conflicting).positions[0].live, false, "ambiguous same-date split blocks marking");
const mismatch = feed([{ ...split, isin: "INE123456789" }]);
assert.equal(applyCorporateActionQuotes([{ ...p, isin: "INE987654321" }], accounts, quotes(), mismatch).positions[0].live, false);
const fraction = feed([raw("bonus", "2026-09-04", "Bonus 1:3")]);
assert.ok(projectActions(p, "2026-08-31", "2026-09-23", fraction).quantityIssues.length, "fractional entitlements require actual credit details");
const sameDay = feed([split, raw("dividend", "2026-09-02", "Dividend - Rs 1 Per Share")]);
assert.equal(projectActions(p, "2026-08-31", "2026-09-23", sameDay).dividendEntitlement, null);
const demerger = feed([raw("demerger", "2026-09-10", "Scheme Of Arrangement")]);
assert.equal(applyCorporateActionQuotes([p], accounts, quotes(), demerger).positions[0].live, false);
const duplicateDividend = feed([dividend, { ...dividend, id: "cash-duplicate" }]);
assert.equal(projectActions(p, "2026-08-31", "2026-09-23", duplicateDividend).dividendEntitlement, null, "ambiguous income is not silently doubled");
const sameId = feed([dividend, dividend]);
assert.equal(sameId.rows.length, 1, "identical source IDs collapse");
const renamed = normalizeActionFeed({ version: 1, capturedAt: f.capturedAt, requestedFrom: f.requestedFrom, requestedTo: f.requestedTo,
  rowCount: 1, rows: [{ ...dividend, ticker: "OLDNAME", isin: "INE123456789" }], sources: {} }, ["NEWNAME"], ["INE123456789"]);
assert.equal(renamed.rows.length, 1, "ISIN preserves events through symbol renames");

// Real retained capture: the collision is not a synthetic test-company name.
const saved = JSON.parse(fs.readFileSync("public/data/corporate-actions.json", "utf8"));
assert.ok(validActionFeed(saved));
const collision = saved.rows.find((r) => r.ticker === "RECLTD" && /Recode/i.test(r.company));
assert.ok(collision?.issue && collision.cashPerShare === null, "Recode cannot credit REC shareholders");
assert.ok(saved.rows.some((r) => r.type === "split" && r.factor !== null), "real split terms parse");
assert.ok(saved.rows.some((r) => r.type === "bonus" && r.factor !== null), "real bonus terms parse");
assert.ok(saved.rows.some((r) => r.type === "dividend" && r.cashPerShare !== null), "real rupee dividends parse");
const funds = BOOK_POSITIONS.filter((p) => p.assetClass !== "Equity");
assert.deepEqual(applyCorporateActionQuotes(funds, BOOK_ACCOUNTS, null, saved).positions, funds.map((p) => ({ ...p, live: false })), "fund NAVs and distributions are not equity corporate actions");
console.log("PASS corporate-action identity, split/bonus invariance, dividend timing, coverage, replay and source-fixture checks");
