/**
 * ── PRICE ALERTS: WHICH PRICE, AND WHETHER IT HAS FIRED ────────────────────
 *
 * `priceAlerts.ts` is the one place the stock page's alert boxes and Morning
 * CIO's All alerts table learn whether an alert has fired, so every state it
 * can report is exercised here without a browser — and the two defects it was
 * written to fix are asserted as defects, so the old behaviour fails by name:
 *
 *   - the BUY level never fired (`firedAlerts` left `entryPrice` out);
 *   - an alert fired on a STATEMENT MARK with no live price behind it.
 *
 * Half of it is anchored on the GENERATED book rather than on fixtures — a real
 * listed share, a real fund priced by its published NAV, a real AIF — so a drop
 * that changes what those holdings are changes what this suite expects of them.
 */
import { BOOK_POSITIONS } from "@/data/glowData";
import { applyFundNavs } from "../fundNavs";
import { symbolFor } from "../quotes";
import {
  ALERT_DEFS, ALERT_DEF, alertCounts, alertRows, checkLevel, compareAlertRows, distanceOf, parseLevel, priceNowFor,
  type AlertRow, type FeedState,
} from "../priceAlerts";
import {
  EMPTY_ENTRY, readEntry, subscribeWatchlist, watchlistSnapshot, writeEntry, type WatchEntry, type Watchlist,
} from "../watchlist";
import type { Position } from "../types";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};
const near = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps;

console.log("──── Price alerts");

// ── the five kinds ──────────────────────────────────────────────────────────
console.log("── the five kinds are the five price levels the store already holds ──");
const LEVEL_FIELDS = ["entryPrice", "exitPrice", "alertBelow", "targetPrice", "alertAbove"];
ok("five kinds, one field each, no field used twice",
  ALERT_DEFS.length === 5 && new Set(ALERT_DEFS.map((d) => d.field)).size === 5);
ok("...and they are exactly the store's five price levels — nothing new stored, nothing left out",
  [...ALERT_DEFS.map((d) => d.field)].sort().join() === [...LEVEL_FIELDS].sort().join()
    && LEVEL_FIELDS.every((f) => f in EMPTY_ENTRY("x")));
ok("fair value is NOT an alert — it is a valuation, and it never fires",
  !ALERT_DEFS.some((d) => (d.field as string) === "fairValue"));
ok("Buy at and Stop loss fire on the way DOWN; Sell at, Target and Alert above on the way UP",
  ALERT_DEF.entry.dir === "down" && ALERT_DEF.below.dir === "down"
    && ALERT_DEF.exit.dir === "up" && ALERT_DEF.target.dir === "up" && ALERT_DEF.above.dir === "up");
ok("the buy level is a kind at all — the old check left it out, so it could never fire",
  ALERT_DEF.entry.field === "entryPrice" && ALERT_DEF.entry.label === "Buy at");

// ── which price ─────────────────────────────────────────────────────────────
console.log("── which price an alert is checked against ──");
const base: Position = BOOK_POSITIONS[0];
const row = (over: Partial<Position>): Position => ({ ...base, securityKey: "t", security: "T", symbol: undefined, live: false, navPriced: false, navDate: undefined, ...over });
const feed = (status: FeedState["status"], pending: string[] = [], sym: string | null = "TEST"): FeedState => ({
  status, pending: (s) => s.filter((x) => pending.includes(x)), symbolOf: () => sym,
});

const liveRow = row({ live: true, currentPrice: 110 });
ok("a live quote is the price", (() => { const n = priceNowFor([liveRow], feed("live")); return n.state === "live" && n.price === 110; })());
ok("...and outranks a published NAV on another row of the same holding",
  priceNowFor([row({ navPriced: true, navDate: "2026-09-22", currentPrice: 99 }), liveRow], feed("live")).state === "live");
const navNow = priceNowFor([row({ navPriced: true, navDate: "2026-09-22", currentPrice: 14.5 })], feed("live", [], null));
ok("a fund's published NAV is its price, dated — a fund has no intraday price",
  navNow.state === "nav" && navNow.price === 14.5 && navNow.asOf === "2026-09-22");
ok("a holding the book does not carry has no price, and says why",
  (() => { const n = priceNowFor([], feed("live")); return n.state === "none" && /not held/.test(n.reason); })());
ok("while the feed is still loading, a quotable holding is CHECKING — never 'no price'",
  priceNowFor([row({ currentPrice: 100 })], feed("loading")).state === "checking");
ok("...and still checking while the feed has yet to answer for this symbol",
  priceNowFor([row({ currentPrice: 100 })], feed("live", ["TEST"])).state === "checking");
ok("a feed that answered without this symbol leaves it with no price, and a reason",
  (() => { const n = priceNowFor([row({ currentPrice: 100 })], feed("live")); return n.state === "none" && /no usable live quote/.test(n.reason); })());
ok("a feed that is down says the prices are not reaching the dashboard",
  (() => { const n = priceNowFor([row({ currentPrice: 100 })], feed("unavailable")); return n.state === "none" && /not reaching/.test(n.reason); })());
ok("an AIF says it has no live price at all — not 'wait for the feed'",
  (() => { const n = priceNowFor([row({ assetClass: "AIF", currentPrice: 100 })], feed("live", [], null)); return n.state === "none" && /AIF/.test(n.reason); })());
ok("a 'live' row with no usable price is not a price",
  priceNowFor([row({ live: true, currentPrice: null as unknown as number })], feed("live")).state !== "live");

// ── the stale-mark defect ───────────────────────────────────────────────────
console.log("── a statement mark is never checked ──");
{
  // The statement says 100; the Stop loss is 120. Read against the mark, this
  // "fires" — the old card did exactly that, with "(on the statement mark)"
  // in a parenthesis. With no live price and no NAV it must not.
  const stale = [row({ currentPrice: 100, live: false })];
  for (const status of ["live", "unavailable"] as const) {
    const n = priceNowFor(stale, feed(status));
    const c = checkLevel("down", 120, n);
    ok(`a statement mark past the level does not fire (feed ${status})`, c.status === "unchecked", c.status);
  }
  ok("...and does not read as 'watching' either — a check never made is not a check that held",
    checkLevel("up", 50, priceNowFor(stale, feed("unavailable"))).status === "unchecked");
}

// ── one level against one price ─────────────────────────────────────────────
console.log("── one level against one price ──");
const P = (price: number) => ({ state: "live" as const, price });
ok("down: at the level is REACHED — the level is inclusive", checkLevel("down", 100, P(100)).status === "reached");
ok("down: below the level is reached, and says how far past",
  (() => { const c = checkLevel("down", 100, P(90)); return c.status === "reached" && near(c.pastPct, 10); })());
ok("down: above the level is watching, and says how far it must still FALL, as a % of the price now",
  (() => { const c = checkLevel("down", 90, P(100)); return c.status === "watching" && near(c.toGoPct, 10) && c.pastPct === null; })());
ok("up: at the level is reached", checkLevel("up", 100, P(100)).status === "reached");
ok("up: below the level is watching, and says how far it must still RISE",
  (() => { const c = checkLevel("up", 125, P(100)); return c.status === "watching" && near(c.toGoPct, 25); })());
ok("up: above the level is reached, past by a % of the level",
  (() => { const c = checkLevel("up", 100, P(110)); return c.status === "reached" && near(c.pastPct, 10); })());
ok("no price yet is 'checking', with no distance", (() => { const c = checkLevel("up", 100, { state: "checking" }); return c.status === "checking" && c.toGoPct === null && c.pastPct === null; })());

// ── the rows ────────────────────────────────────────────────────────────────
console.log("── the table's rows ──");
const entry = (key: string, levels: Partial<WatchEntry>): WatchEntry => ({ ...EMPTY_ENTRY(key), updatedAt: "2026-09-23T10:00:00.000Z", ...levels });
const W: Watchlist = {
  a: entry("a", { entryPrice: 120, exitPrice: 200 }),     // price 100: buy REACHED 16.7% past · sell watching 100%
  b: entry("b", { alertBelow: 90, targetPrice: 101 }),    // price 100: stop watching 10% · target watching 1%
  c: entry("c", { exitPrice: 95 }),                       // price 100: sell reached 5.3% past
  d: entry("d", { targetPrice: 10, name: "Sold Co" }),    // not in the book → no price
  e: entry("e", { note: "only a note" }),                 // no levels → no rows
};
const positions: Record<string, Position[]> = {
  a: [row({ securityKey: "a", security: "Alpha Ltd", live: true, currentPrice: 100 })],
  b: [row({ securityKey: "b", security: "Beta Ltd", live: true, currentPrice: 100 })],
  c: [row({ securityKey: "c", security: "Gamma Ltd", live: true, currentPrice: 100 })],
};
const rows = alertRows(W, (k) => positions[k] ?? [], feed("live"));
ok("one row per level set — a holding with two alerts is two rows, one with none is none",
  rows.length === 6 && !rows.some((r) => r.securityKey === "e"), rows.map((r) => r.id).join(", "));
ok("the BUY level fires — the defect this module exists to fix",
  rows.find((r) => r.id === "a:entry")?.status === "reached");
ok("what has fired comes first, the furthest past its level at the top",
  rows[0].id === "a:entry" && rows[1].id === "c:exit", rows.slice(0, 2).map((r) => r.id).join(", "));
ok("then what is watched, closest to firing first",
  rows.slice(2, 5).map((r) => r.id).join() === "b:target,b:below,a:exit", rows.slice(2, 5).map((r) => r.id).join());
ok("and what cannot be checked comes last", rows[5].id === "d:target" && rows[5].status === "unchecked");
ok("a row is named by the BOOK's label where the book holds the name", rows.find((r) => r.id === "a:entry")?.name === "Alpha Ltd");
ok("...and by the name saved with the alert where it no longer does", rows.find((r) => r.id === "d:target")?.name === "Sold Co");
ok("...and by a readable key where neither exists",
  alertRows({ "some-old-name": entry("some-old-name", { exitPrice: 5 }) }, () => [], feed("live"))[0].name === "Some Old Name");
const counts = alertCounts(rows);
ok("the counts partition the rows", counts.total === 6 && counts.reached === 2 && counts.watching === 3
  && counts.unchecked === 1 && counts.checking === 0 && counts.reached + counts.watching + counts.checking + counts.unchecked === counts.total);
ok("a non-positive level is not an alert", alertRows({ z: entry("z", { exitPrice: 0 as unknown as number }) }, () => positions.a, feed("live")).length === 0);
ok("the order is a comparator the table can hand back to, and it is stable on ties",
  [...rows].reverse().sort(compareAlertRows).map((r) => r.id).join() === rows.map((r) => r.id).join());
{
  const reached = rows.find((r) => r.status === "reached") as AlertRow;
  const watching = rows.find((r) => r.status === "watching") as AlertRow;
  ok("the distance column sorts fired alerts first (negative), then the closest (positive), and a row with no price last (null)",
    (distanceOf(reached) ?? 0) < 0 && (distanceOf(watching) ?? 0) > 0 && distanceOf(rows[5]) === null);
}
ok("while the feed is loading every quotable row is CHECKING — nothing fires on the first paint",
  alertRows(W, (k) => (positions[k] ?? []).map((p) => ({ ...p, live: false })), feed("loading")).every((r) => r.status !== "reached"));

// ── typed input ─────────────────────────────────────────────────────────────
console.log("── what a reader types ──");
const pv = (s: string) => { const r = parseLevel(s); return r.ok ? r.value : "refused"; };
ok("blank clears the level", pv("  ") === null);
ok("Indian grouping, the rupee sign and spaces are read", pv("1,250") === 1250 && pv("₹ 1,25,000.50") === 125000.5);
ok("text is REFUSED, not read as blank — the old parser silently erased the level", pv("abc") === "refused");
ok("zero and negatives are refused — a price level of ₹0 is not a level", pv("0") === "refused" && pv("-5") === "refused");

// ── the store: one snapshot, and every surface hears a save ─────────────────
console.log("── the store ──");
{
  let heard = 0;
  const off = subscribeWatchlist(() => { heard += 1; });
  // No `localStorage` in this runtime, which is a private window's case exactly:
  // the write is refused and the edit must still hold for the session.
  writeEntry({ ...readEntry("store-test"), exitPrice: 321, name: "Store Test" });
  ok("a save is heard by every subscriber", heard === 1);
  ok("...and holds even where localStorage refused it", readEntry("store-test").exitPrice === 321);
  const snap = watchlistSnapshot();
  writeEntry({ ...readEntry("store-test"), alertBelow: 100 });
  ok("the snapshot is REPLACED on a save, never edited in place — identity is how React sees a change",
    watchlistSnapshot() !== snap && snap["store-test"].alertBelow === null);
  writeEntry({ ...readEntry("store-test"), exitPrice: null, alertBelow: null });
  ok("a NAME alone does not keep an entry alive — clearing the last level deletes it",
    !("store-test" in watchlistSnapshot()));
  off();
  writeEntry({ ...readEntry("store-test-2"), exitPrice: 1 });
  ok("an unsubscribed listener hears nothing", heard === 3);
}

// ── anchored on the generated book ──────────────────────────────────────────
console.log("── on the real book ──");
{
  const book = applyFundNavs(BOOK_POSITIONS);
  const byKey = new Map<string, Position[]>();
  for (const p of book) byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);
  const realFeed = (status: FeedState["status"]): FeedState => ({ status, pending: () => [], symbolOf: symbolFor });

  // EVERY FUND THE PUBLISHED NAV PRICES IS CHECKABLE WITH NO FEED AT ALL — the
  // load-bearing half of "funds are checked against their NAV": it is committed
  // data, so a fund's alert works on the first paint and through a feed outage.
  const navKeys = [...byKey.entries()].filter(([, ps]) => ps.some((p) => p.navPriced)).map(([k]) => k);
  const navStates = navKeys.map((k) => priceNowFor(byKey.get(k) ?? [], realFeed("unavailable")));
  ok("the book has funds priced by a published NAV — a suite over none would prove nothing", navKeys.length > 0, `${navKeys.length} holdings`);
  ok("...and every one of them is checkable with the quote feed DOWN", navStates.every((n) => n.state === "nav"),
    navStates.filter((n) => n.state !== "nav").length + " not");

  const eq = book.find((p) => p.assetClass === "Equity" && symbolFor(p) && (p.currentPrice ?? 0) > 0);
  ok("a quotable share is CHECKING before the feed answers, never judged on its statement mark",
    !!eq && priceNowFor(byKey.get(eq.securityKey) ?? [], realFeed("loading")).state === "checking", eq?.securityKey ?? "none");
  ok("...and has no price, with the feed's reason, when the feed is down",
    !!eq && priceNowFor(byKey.get(eq.securityKey) ?? [], realFeed("unavailable")).state === "none");

  const aif = book.find((p) => p.assetClass === "AIF" && !symbolFor(p) && !p.navPriced);
  ok("an AIF in the book is never checkable, whatever the feed does",
    !!aif && (["loading", "live", "unavailable"] as const).every((s) => priceNowFor(byKey.get(aif.securityKey) ?? [], realFeed(s)).state === "none"),
    aif?.securityKey ?? "none");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All price-alert checks passed.");
