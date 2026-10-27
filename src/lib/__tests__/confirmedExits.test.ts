// THE FAMILY'S CONFIRMED EXITS (Stage 10ib): HDFC Bank, ICICI Bank and Axis Bank
// are out of their direct equity on every basis. The family confirmed it on
// 27 Oct 2026; Ankita's Motilal Oswal demat statement of 31 Jul still printed
// her ICICI and Axis shares, and MOPWM's transaction report sells both in full
// on 23 Sep. ICICI Bank inside the Aristos PMS mandate is the manager's, and its
// 6 Oct statement still holds it.
import assert from "node:assert/strict";
import { BOOK_ACCOUNTS, BOOK_CONFIRMED_EXITS, BOOK_POSITIONS, BOOK_RECOVERED_COSTS, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS } from "../../data/glowData";
import { CONFIRMED_EXITS } from "../../../shared/confirmedExits.mjs";
import { shareCandidates, depositoryShareHoldings } from "../depositoryShares";
import { recordedLines } from "../recordedHoldings";
import { holdingBucket, DIRECT_EQUITY_BUCKET, MANDATE_BUCKET } from "../analytics";
import type { QuoteFeed } from "../quotes";
import type { ActionFeed } from "../corporateActions";

const BANKS = { INE040A01034: "HDFC Bank", INE090A01021: "ICICI Bank", INE238A01034: "Axis Bank" } as const;
const isBank = (x: { isin?: string | null }) => (x.isin ?? "").toUpperCase() in BANKS;
const account = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const ANKITA_DEMAT = "motilal-oswal-financial-services-demat-1201090012838316";

// ── the two lines retired, each with its evidence ───────────────────────────
assert.deepEqual(BOOK_CONFIRMED_EXITS.map((x) => [x.isin, x.quantity, x.asOf, x.exitedOn, x.sale.rows, x.sale.units]), [
  ["INE238A01034", 7300, "2026-07-31", "2026-09-23", [1127], 7300],
  ["INE090A01021", 14500, "2026-07-31", "2026-09-23", [1221], 14500],
], "Axis Bank and ICICI Bank, sold in full on the exchange on 23 Sep 2026");
for (const x of BOOK_CONFIRMED_EXITS) {
  assert.equal(x.accountId, ANKITA_DEMAT);
  assert.equal(x.ownerId, "ankita-jaisinghani");
  assert.match(x.statementRecord!.document, /^motilal-oswal-financial-services-demat-1201090012838316-2026-07-31-holdings$/);
  assert.equal(x.sale.reportAsOf, "2026-10-23");
  assert.equal(x.confirmed, "2026-10-27");
  assert.ok(!("price" in x.sale) && !("amount" in x.sale), "no sale price or proceeds is taken from the adviser's report");
}
assert.equal(BOOK_CONFIRMED_EXITS.length, CONFIRMED_EXITS.length, "every entry of the family's table reaches its line");

// ── no direct holding of any of the three, on any basis ─────────────────────
assert.equal(BOOK_UNVALUED_HOLDINGS.filter(isBank).length, 0, "no statement line of the three is carried as held");
assert.equal(shareCandidates().filter(isBank).length, 0, "the live layer has none of the three to value");
assert.equal(recordedLines().filter(isBank).length, 0, "no stock page names a recorded holding of the three");
assert.equal(BOOK_RECOVERED_COSTS.filter((r) => r.accountId === ANKITA_DEMAT && isBank(r)).length, 0);
const direct = BOOK_POSITIONS.filter((p) => isBank(p) && holdingBucket(p, account.get(p.accountId)?.engagement) === DIRECT_EQUITY_BUCKET);
assert.deepEqual(direct, [], "no Direct Equity position of HDFC Bank, ICICI Bank or Axis Bank");

// A feed that prices all three by symbol still adds no row: there is no line left.
const now = "2026-10-27T06:00:00Z";
const quote = { price: 1000, prevClose: 990, ageS: 0, source: "upstox", open: null, dayLow: null, dayHigh: null,
  low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null } as const;
const feed: QuoteFeed = { asOf: now, missing: [], pending: [], fresh: 3, stale: 0,
  quotes: { HDFCBANK: { ...quote }, ICICIBANK: { ...quote }, AXISBANK: { ...quote } } };
const actions: ActionFeed = { version: 1, capturedAt: now, requestedFrom: "2020-01-01", requestedTo: "2026-10-27",
  verifiedThrough: "2026-10-27", symbols: ["HDFCBANK", "ICICIBANK", "AXISBANK"], isins: Object.keys(BANKS), sourceUrl: "test", rows: [] };
assert.equal(depositoryShareHoldings(feed, actions).filter(isBank).length, 0);

// HDFC Bank needed no entry: the custodian's own 31 Jul window closes at nil.
const hdfc = Object.values(BOOK_SHARE_MOVEMENTS).filter((w) => w.accountId === ANKITA_DEMAT && w.isin === "INE040A01034");
assert.deepEqual(hdfc.map((w) => [w.opening, w.unitsIn, w.unitsOut, w.closing]), [[0, 18750, 18750, 0]]);
// The two retired lines' windows stay what the depository printed on 31 Jul.
for (const isin of ["INE090A01021", "INE238A01034"])
  assert.ok(Object.values(BOOK_SHARE_MOVEMENTS).some((w) => w.accountId === ANKITA_DEMAT && w.isin === isin && (w.closing ?? 0) > 0));

// ── the PMS mandate's ICICI Bank is the manager's, and stays ────────────────
const pms = BOOK_POSITIONS.filter((p) => p.isin === "INE090A01021");
assert.deepEqual(pms.map((p) => [p.accountId, p.quantity]).sort(), [
  ["goldstandard-wealth-private-limited-100022", 2000], ["goldstandard-wealth-private-limited-100023", 5000],
]);
for (const p of pms) assert.equal(holdingBucket(p, account.get(p.accountId)?.engagement), MANDATE_BUCKET);

console.log("Confirmed exits: Axis Bank and ICICI Bank retired on their witnessed sales; no direct HDFC, ICICI or Axis holding on any basis; the PMS mandate's ICICI kept");
