import assert from "node:assert/strict";
import fs from "node:fs";
import { dailyMovers } from "../dailyMovers";
import { applyCorporateActionQuotes, positionActionKey, fetchCorporateActions } from "../corporateActions";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "../../data/glowData";
import { accountIndex, engagementOf } from "../accounts";
import { currentHoldings, holdingBucket, DIRECT_EQUITY_BUCKET } from "../analytics";
import { symbolFor, pendingAmong, type QuoteFeed } from "../quotes";
import { requestDeadline } from "../requestDeadline";
import type { ActionFeed } from "../../../shared/corporateActions.mjs";
import { mergeQuoteFeeds, retainQuotes, readCachedQuotes, writeCachedQuotes } from "../quoteCache";

const at = "2026-09-28T10:00:00Z", now = Date.parse(at);
const owners = accountIndex(BOOK_ACCOUNTS);
const scope = currentHoldings(BOOK_POSITIONS).filter((p) => holdingBucket(p, engagementOf(owners, p)) === DIRECT_EQUITY_BUCKET && symbolFor(p));
assert.ok(scope.length > 10);
const quotes: QuoteFeed = { asOf: at, missing: [], pending: [], fresh: scope.length, stale: 0,
  quotes: Object.fromEntries(scope.map((p) => [symbolFor(p)!, { price: (p.currentPrice || 100) * 1.1, prevClose: p.currentPrice || 100, tradedAt: at, ageS: 0,
    open: null, dayLow: null, dayHigh: null, low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null }])) };
const saved: ActionFeed = JSON.parse(fs.readFileSync("public/data/corporate-actions.json", "utf8"));
const stale = { ...saved, capturedAt: "2026-09-23T10:00:00Z", verifiedThrough: "2026-09-23" };
for (const evidence of [null, stale]) {
  const gated = applyCorporateActionQuotes(scope, BOOK_ACCOUNTS, quotes, evidence);
  assert.ok(gated.positions.every((p) => !p.live), "reproduces the total valuation gate that blanked the card");
  const result = dailyMovers(gated.positions, quotes, gated.returns, owners);
  assert.ok(result.rows.length > 10, "percent rankings survive missing/stale corporate-action evidence");
  assert.ok(result.rows.every((r) => Math.abs(r.dayChangePct - 10) < 1e-9 && r.dayChange === null));
}
const p = { ...scope[0], currentPrice: 100, live: true, dayChange: 1000, dayChangePct: 10, marketValue: 11000 };
const q: QuoteFeed = { ...quotes, quotes: { [symbolFor(p)!]: { ...quotes.quotes[symbolFor(p)!], price: 110, prevClose: 100 } } };
const second = { ...p, accountId: "second", live: false, dayChange: null };
const secondPlan = applyCorporateActionQuotes([second], BOOK_ACCOUNTS, q, null).returns;
const priced = dailyMovers([p, second], q, secondPlan, owners);
assert.equal(priced.rows.length, 1);
assert.equal(priced.rows[0].dayChange, null, "one unverified account cannot yield a partial security impact");
const plan = applyCorporateActionQuotes([p], BOOK_ACCOUNTS, q, null).returns.get(positionActionKey(p))!;
plan.lines.push({ action: { ...saved.rows[0], type: "split", exDate: "2026-09-28", factor: 2 }, status: "needs-review", quantity: null, amount: null, reason: null });
assert.equal(dailyMovers([p], q, new Map([[positionActionKey(p), plan]]), owners).rows.length, 0, "an ex-date split cannot print an unverified -50% price move");
const missingClose = structuredClone(q); missingClose.quotes[symbolFor(p)!].prevClose = null;
assert.equal(dailyMovers([p], missingClose, new Map(), owners).rows.length, 0);
assert.equal(dailyMovers([p], null, new Map(), owners).rows.length, 0);
assert.equal(dailyMovers([{ ...p, live: false }], q, new Map(), owners).rows.length, 0, "price-identity rejection cannot reappear as a percentage mover");
for (const evidence of [null, stale]) {
  const mismapped = { ...q, quotes: { [symbolFor(p)!]: { ...q.quotes[symbolFor(p)!], price: 1, prevClose: 0.9 } } };
  const withheld = applyCorporateActionQuotes([p], BOOK_ACCOUNTS, mismapped, evidence);
  assert.ok(withheld.returns.get(positionActionKey(p))?.liveWithheld, "quantity gate bypasses the normal price overlay");
  assert.equal(dailyMovers(withheld.positions, mismapped, withheld.returns, owners).rows.length, 0,
    "a wrong ticker must still fail the identity check during an event-feed outage");
}
const bad = structuredClone(q); bad.quotes[symbolFor(p)!].price = Infinity;
assert.equal(dailyMovers([p], bad, new Map(), owners).rows.length, 0);
const flat = structuredClone(q); flat.quotes[symbolFor(p)!].price = 100;
assert.equal(dailyMovers([p], flat, new Map(), owners).rows[0].dayChangePct, 0, "a real zero survives");

const initial = mergeQuoteFeeds(null, q, now);
const symbol = symbolFor(p)!;
const later = mergeQuoteFeeds(initial, { ...q, asOf: "2026-09-28T11:00:00Z", quotes: {}, missing: [symbol] }, now + 3600_000);
assert.equal(later.quotes[symbol].ageS, 3600);
assert.equal(later.quotes[symbol].observedAt, new Date(now).toISOString(), "partial refresh does not re-date an old quote");
assert.equal(later.missing.length, 0);
assert.equal(mergeQuoteFeeds(initial, missingClose, now).quotes[symbol].prevClose, 100, "an incomplete round does not destroy the last valid close");
assert.equal(retainQuotes(later, now + 86_400_000), null, "an open tab cannot retain yesterday's prices forever");
const nearMidnight = { ...q, asOf: "2026-09-28T18:29:00Z" };
assert.equal(retainQuotes(nearMidnight, Date.parse("2026-09-28T18:31:00Z")), null, "IST session rollover expires retained observations");
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) } });
const realNow = Date.now;
try {
  Date.now = () => now;
  writeCachedQuotes(initial);
  Date.now = () => now + 3600_000;
  assert.equal(readCachedQuotes()!.quotes[symbol].ageS, 3600);
  Date.now = () => now + 86_400_000;
  assert.equal(readCachedQuotes(), null);
  storage.set("glow.quotes.v1", "broken");
  assert.equal(readCachedQuotes(), null);
} finally { Date.now = realNow; }
console.log("PASS incident recovery, independent price rankings, partial accounts, ex-date/invalid/zero quotes, cache ageing and IST rollover");

const { fetchQuotes, lastQuoteFailure } = await import("../quotes");
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => Response.json({ ok: true, quotes: { [symbol]: { price: 0 } } });
  assert.equal(await fetchQuotes([symbol]), null);
  assert.equal(lastQuoteFailure()?.failureCode, "NO_VALID_QUOTES");
  globalThis.fetch = async (_input, options) => {
    assert.ok(options?.signal, "stalled requests have an abort deadline");
    return Response.json({ ok: true, quotes: { ...q.quotes, UNASKED: q.quotes[symbol] }, asOf: at });
  };
  const partial = await fetchQuotes([symbol, "ABSENT"]);
  assert.deepEqual(Object.keys(partial!.quotes), [symbol]);
  assert.deepEqual(partial!.missing, ["ABSENT"], "unmentioned symbols cannot keep the spinner waiting forever");
  globalThis.fetch = async () => Response.json({ ok: true, quotes: q.quotes }, { status: 503 });
  assert.equal(await fetchQuotes([symbol]), null, "HTTP failure cannot masquerade as a successful refresh");
} finally { globalThis.fetch = realFetch; }
console.log("PASS malformed/partial quote response validation and request deadline");

const other = { ...p, securityKey: 'observation-test', symbol: 'OBSERVATION' };
const mixed = { ...q, asOf: '2026-09-28T12:00:00Z', quotes: {
  [symbol]: { ...q.quotes[symbol], observedAt: '2026-09-28T09:00:00Z' },
  OBSERVATION: { ...q.quotes[symbol], observedAt: '2026-09-28T11:00:00Z' },
  OUTSIDE: { ...q.quotes[symbol], observedAt: '2026-09-28T12:00:00Z' },
} };
const observed = dailyMovers([p, other], mixed, new Map(), owners);
assert.equal(observed.observedFrom, '2026-09-28T09:00:00.000Z');
assert.equal(observed.observedTo, '2026-09-28T11:00:00.000Z', 'display actual in-scope observations, never a later refresh or out-of-scope quote');
console.log('PASS retained mover observation range');

const undated = { ...q, quotes: { [symbol]: { ...q.quotes[symbol], tradedAt: null } } };
assert.equal(dailyMovers([p], undated, new Map(), owners).rows.length, 1);
assert.equal(dailyMovers([p], undated, new Map(), owners).session, null, "a fetch date never becomes an exchange session");
const friday = { ...undated, quotes: { [symbol]: { ...q.quotes[symbol], tradedAt: '2026-09-25T10:00:00Z' } } };
assert.equal(dailyMovers([p], friday, new Map(), owners).session, '2026-09-25', "Monday observation can still be Friday's trading session");
const mixedSessions = { ...friday, quotes: { ...friday.quotes, OBSERVATION: undated.quotes[symbol] } };
assert.equal(dailyMovers([p, other], mixedSessions, new Map(), owners).session, null, "one undated quote prevents an aggregate session claim");
const future = { ...q, quotes: { [symbol]: { ...q.quotes[symbol], tradedAt: '2026-09-29T10:00:00Z' } } };
assert.equal(dailyMovers([p], future, new Map(), owners).rows.length, 0);
console.log('PASS known, missing, mixed and invalid exchange sessions');

const preOpen = mergeQuoteFeeds(null, friday, now);
const openingRound = { ...q, quotes: { OBSERVATION: q.quotes[symbol] }, pending: [symbol] };
const opening = mergeQuoteFeeds(preOpen, openingRound, now);
assert.ok(opening.quotes[symbol], 'last price can remain available elsewhere in the portfolio');
assert.deepEqual(pendingAmong(opening, [symbol, 'OBSERVATION']), [symbol], 'a previous-session price cannot complete the movers scope');
assert.deepEqual(pendingAmong(retainQuotes(opening, now), [symbol]), [symbol], 'cache retention must preserve the pending-session verdict');
const sameSession = mergeQuoteFeeds(initial, openingRound, now);
assert.deepEqual(pendingAmong(sameSession, [symbol, 'OBSERVATION']), [], 'a confirmed same-session snapshot can satisfy a deferral');
const unknownRound = { ...openingRound, quotes: { OBSERVATION: undated.quotes[symbol] } };
assert.deepEqual(pendingAmong(mergeQuoteFeeds(initial, unknownRound, now), [symbol]), [symbol], 'an unknown session cannot certify a retained quote');
console.log('PASS pending scope across pre-open/session transitions and cache retention');

const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;
const nativeAny = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
try {
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
  globalThis.fetch = async (_input, options) => {
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({ ok: true, quotes: q.quotes, asOf: at, feed: saved });
  };
  assert.ok(await fetchQuotes([symbol]), 'legacy browser must reach the quote service');
  assert.ok(await fetchCorporateActions([symbol], [], new AbortController().signal), 'legacy browser must reach the event service');
  const parent = new AbortController(), child = requestDeadline(1000, parent.signal);
  parent.abort();
  assert.equal(child.signal.aborted, true, 'parent cancellation is forwarded');
  child.dispose();
  const expired = requestDeadline(5);
  await new Promise<void>((resolve) => expired.signal.addEventListener('abort', () => resolve(), { once: true }));
  assert.equal(expired.signal.reason.name, 'TimeoutError', 'fallback deadlines still abort stalled work');
  expired.dispose();
  const disposed = requestDeadline(5);
  disposed.dispose();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(disposed.signal.aborted, false, 'completed requests release their deadline');
} finally {
  Object.defineProperty(AbortSignal, 'timeout', nativeTimeout);
  Object.defineProperty(AbortSignal, 'any', nativeAny);
  globalThis.fetch = realFetch;
}
console.log('PASS legacy-browser deadlines, parent cancellation and cleanup');
