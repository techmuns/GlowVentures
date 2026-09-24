/**
 * WHY A LIVE PRICE IS HELD BACK — the corporate-action gate's own words, read
 * through ONE helper (`liveWithheldReason`), and the cause each refusal names.
 *
 * DL-9: the gate withholds a quote that ARRIVED (a buyback, sales recorded after
 * the statement, a capture further behind the quote's day than a share event's
 * lead, the evidence still loading), and every page said "the price feed
 * returned no quote".
 * DL-15: a security with no NSE symbol can never be priced live, and the
 * corporate-actions table said it was "withheld pending share reconciliation".
 *
 * Each expectation below is a fact about the INPUT — a quote present or absent,
 * a sale after the statement, a buyback — never read back out of the module.
 */
import assert from "node:assert/strict";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "../../data/glowData";
import { applyCorporateActionQuotes, liveWithheldReason, positionActionKey, SHARE_EVENT_LEAD_DAYS } from "../corporateActions";
import { normalizeActionFeed, type ActionFeed } from "../../../shared/corporateActions.mjs";
import type { Account, Position } from "../types";
import { symbolFor, type QuoteFeed } from "../quotes";

let passed = 0;
const ok = (label: string, fn: () => void) => { fn(); passed++; console.log(`  ok   ${label}`); };

const base: Position = {
  ...BOOK_POSITIONS.find((x) => x.assetClass === "Equity")!,
  accountId: "gate", securityKey: "gate", security: "Gate test equity", symbol: "GATE", isin: null,
  quantity: 100, avgCost: 10, currentPrice: 10, costBasis: 1000, marketValue: 1000, unrealizedPnL: 0,
  realizedPnL: 0, costOfUnitsSold: 0, realizedLotsAfter: 0, returnPct: 0, dividendReceived: null,
};
const accounts: Account[] = [{ ...BOOK_ACCOUNTS[0], accountId: "gate", asOf: "2026-08-31" }];
const raw = (type: string, date: string, purpose: string) => ({
  id: `${type}:${date}`, ticker: "GATE", company: "Gate test equity", actionType: type, exDate: date,
  purpose, source: "NSE", sources: ["NSE"], isin: null, sourceUrl: "https://www.nseindia.com/test",
});
// A capture must carry at least one row to be valid, so every feed here carries
// one for ANOTHER ticker — filtered out by the symbol selection — and a "clean"
// feed is a real capture that says nothing about this security.
const elsewhere = { ...raw("dividend", "2026-09-01", "Dividend"), id: "dividend:elsewhere", ticker: "ELSEWHERE", company: "Another company" };
const feed = (rows: unknown[]): ActionFeed => {
  const all = [...rows, elsewhere];
  return normalizeActionFeed({
    version: 1, capturedAt: "2026-09-23T10:00:00Z", requestedFrom: "2023-09-24", requestedTo: "2027-09-23",
    rowCount: all.length, rows: all,
    sources: { nse: { capturedAt: "2026-09-23T10:00:00Z" }, screener: { capturedAt: "2026-09-23T09:00:00Z" } },
  }, ["GATE"]);
};
const quotes = (symbol = "GATE", tradedAt = "2026-09-23T09:00:00Z"): QuoteFeed => ({
  asOf: "2026-09-23T10:00:00Z", missing: [], pending: [], fresh: 1, stale: 0, quotes: { [symbol]: {
    price: 11, tradedAt, prevClose: 10.5, open: 10.5, dayLow: 10.5, dayHigh: 11, low52: null, high52: null,
    marketCap: null, volume: 1, yearChangePct: null, ageS: 0, source: "upstox",
  } },
});
const run = (p: Position, q: QuoteFeed | null, f: ActionFeed | null) => {
  const out = applyCorporateActionQuotes([p], accounts, q, f);
  return { priced: out.positions[0], plan: out.returns.get(positionActionKey(p)), returns: out.returns };
};
const clean = feed([]);

ok("a quote that arrives and nothing blocks goes live, and nothing is withheld", () => {
  const { priced, returns } = run(base, quotes(), clean);
  assert.equal(priced.live, true);
  assert.equal(liveWithheldReason(base, returns), null);
});

ok("sales recorded after the statement: the quote ARRIVED and is held back, in the gate's words", () => {
  const p = { ...base, realizedLotsAfter: 2 };
  const { priced, returns } = run(p, quotes(), clean);
  assert.equal(priced.live, false, "the statement mark stays");
  const why = liveWithheldReason(p, returns);
  assert.ok(why && /Sales are recorded after this statement/.test(why), String(why));
});

ok("a buyback after the statement holds the quote back, and the reason is the gate's own open question", () => {
  const f = feed([raw("buyback", "2026-09-04", "Buyback")]);
  const { priced, returns, plan } = run(base, quotes(), f);
  assert.equal(priced.live, false);
  const why = liveWithheldReason(base, returns) ?? "";
  // A buyback changes the share count by an amount the feed cannot allocate to
  // this holding, so the gate asks for reconciliation or a newer statement…
  assert.ok(/reconciliation|newer holding statement/.test(why), why);
  // …and the helper says exactly what the gate says, not a paraphrase of it.
  assert.equal(why, [...new Set(plan!.quantityIssues)].join(". "));
});

// The capture below is verified through 23 Sep (its sources' own dates). A
// share event is announced well ahead of its ex-date, so a capture a few days
// behind the quote cannot hide one (`SHARE_EVENT_LEAD_DAYS`): the price goes
// live and only the DIVIDEND side waits. Further behind than that, the price
// itself is held back — and the helper must follow the gate both ways.
const quoteDay = (days: number) =>
  new Date(Date.parse("2026-09-23T05:00:00Z") + days * 86_400_000).toISOString();

ok("a quote dated FURTHER beyond the event capture than a share event's lead is held back — the capture does not reach its day", () => {
  const { priced, returns } = run(base, quotes("GATE", quoteDay(SHARE_EVENT_LEAD_DAYS + 2)), clean);
  assert.equal(priced.live, false);
  assert.ok(/does not cover the valuation date/.test(liveWithheldReason(base, returns) ?? ""));
});

ok("a quote ONE day beyond the capture goes live, nothing is withheld, and the gap is named on the dividend side only", () => {
  const { priced, returns, plan } = run(base, quotes("GATE", quoteDay(1)), clean);
  assert.equal(priced.live, true, "a short lag cannot hide a split or bonus");
  assert.equal(liveWithheldReason(base, returns), null, "…so no reason for withholding is claimed");
  assert.ok(plan!.incomeIssues.some((x) => /does not cover the valuation date/.test(x)), plan!.incomeIssues.join(" | "));
  assert.ok(!plan!.quantityIssues.some((x) => /does not cover the valuation date/.test(x)), plan!.quantityIssues.join(" | "));
});

ok("before the corporate-action evidence loads, a quote that arrived is held back and says so", () => {
  const { priced, returns } = run(base, quotes(), null);
  assert.equal(priced.live, false);
  assert.ok(/Waiting for corporate-action evidence/.test(liveWithheldReason(base, returns) ?? ""));
});

ok("NO QUOTE ARRIVED: the helper claims nothing, even where the gate has open questions", () => {
  const p = { ...base, realizedLotsAfter: 2 };
  const { returns, plan } = run(p, quotes("OTHER"), clean);
  assert.ok(plan && plan.quantityIssues.length > 0, "the gate still has its open question");
  assert.equal(liveWithheldReason(p, returns), null, "…but no quote was held back, so none is claimed");
  assert.ok(plan!.incomeIssues.some((x) => /No live quote arrived/.test(x)), plan!.incomeIssues.join(" | "));
  assert.ok(!plan!.incomeIssues.some((x) => /pending share reconciliation/.test(x)));
});

ok("NO NSE SYMBOL: the reason is that it can never be priced live — never 'pending share reconciliation'", () => {
  const p = { ...base, symbol: null, securityKey: "gate-no-symbol-anywhere", isin: null };
  const { plan, returns } = run(p, quotes(), clean);
  assert.equal(liveWithheldReason(p, returns), null);
  assert.ok(plan!.incomeIssues.some((x) => /No NSE symbol resolves/.test(x)), plan!.incomeIssues.join(" | "));
  assert.ok(!plan!.incomeIssues.some((x) => /pending share reconciliation/.test(x)), plan!.incomeIssues.join(" | "));
});

ok("a fund is never gated, so nothing is ever withheld for one", () => {
  const p = { ...base, assetClass: "Mutual Fund" as const };
  const { returns } = run(p, quotes(), null);
  assert.equal(liveWithheldReason(p, returns), null);
});

ok("THE BOOK: every LKP holding sold after its statement is withheld from a quote that arrives, by that reason", () => {
  const after = BOOK_POSITIONS.filter((x) => x.assetClass === "Equity" && (x.realizedLotsAfter ?? 0) > 0);
  assert.ok(after.length > 0, "the book carries holdings sold after their statement");
  const q: QuoteFeed = { asOf: "2026-09-23T10:00:00Z", missing: [], pending: [], fresh: after.length, stale: 0, quotes: {} };
  for (const x of after) {
    const s = symbolFor(x);
    if (!s) continue;
    q.quotes[s] = { ...quotes().quotes.GATE, price: (x.currentPrice ?? 1) * 1.1 };
  }
  const out = applyCorporateActionQuotes(after, BOOK_ACCOUNTS as Account[], q, clean);
  const quoted = after.filter((x) => symbolFor(x));
  assert.ok(quoted.length > 0, "at least one of them resolves a symbol");
  for (const x of quoted) {
    assert.ok(/Sales are recorded after this statement/.test(liveWithheldReason(x, out.returns) ?? ""), x.securityKey);
  }
});

console.log(`\nlive price gate: ${passed} passed, 0 failed`);
