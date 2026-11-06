/**
 * ── THE ADVISER REPORT'S LATER SHARE TRADES, ON THE LIVE BASIS (Stage 10iw) ──
 *
 * MOPWM's transaction report of 23 Oct 2026 carries each owner's NSE/BSE trades
 * past the 31 Jul Motilal demat statements. `BOOK_SHARE_ROLLS` is what the build
 * could tie; this suite checks what the live layer does with it: a balance sold
 * to nil is no candidate, a share bought since is a candidate at the roll's
 * units and the report's cost, the statement basis keeps its snapshot, and the
 * account notes say which is which.
 */
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS, BOOK_SHARE_ROLLS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { depositoryShareHoldings, shareCandidates, withShareRolls } from "../depositoryShares";
import { depositoryBalancesOf, describeDepositoryUnits, partialValuationNotes, soldSinceStatement } from "../fundNavs";
import type { QuoteFeed } from "../quotes";
import type { ActionFeed } from "../corporateActions";
import type { Position, ShareRoll } from "../types";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};
const AJAY = "motilal-oswal-financial-services-demat-1201090012539150";
const ANKITA = "motilal-oswal-financial-services-demat-1201090012838316";
const roll = (account: string, isin: string) => BOOK_SHARE_ROLLS.find((r) => r.accountId === account && r.isin === isin);
const cand = (account: string, isin: string) => shareCandidates().find((p) => p.accountId === account && p.isin === isin);

console.log("──── Adviser report share rolls");
ok("the book carries rolls, so the claims below have a subject", BOOK_SHARE_ROLLS.length > 0,
  BOOK_SHARE_ROLLS.map((r) => `${r.security} ${r.statementQuantity}→${r.quantity}`).join("; "));
ok("every roll is a Motilal demat equity ISIN — or a fund the family confirmed sold, to nil — dated after its statement",
  BOOK_SHARE_ROLLS.every((r) => (r.isin.startsWith("INE") || (r.report.sheet === "Mutual Funds" && r.quantity === 0)) && r.through > r.asOf && r.trades > 0
    && BOOK_ACCOUNTS.find((a) => a.accountId === r.accountId)?.provider === "Motilal Oswal Financial Services (demat)"));
ok("every roll starts from a balance the statement records, or from none",
  BOOK_SHARE_ROLLS.every((r) => r.statementQuantity === 0
    || BOOK_UNVALUED_HOLDINGS.some((u) => u.accountId === r.accountId && u.isin === r.isin && u.quantity === r.statementQuantity)
    || Object.values(BOOK_SHARE_MOVEMENTS).some((w) => w.accountId === r.accountId && w.isin === r.isin && w.closing === r.statementQuantity)));
// Stage 10ma: the one fund the family confirmed sold. Every other fund row,
// the 1 Oct "redemptions" among them, still waits for the family.
ok("no fund row moves a quantity but the sales the family confirmed — DSP Silver and Gold ETF on Ankita's demat, to nil",
  JSON.stringify(BOOK_SHARE_ROLLS.filter((r) => r.isin.startsWith("INF")).map((r) => [r.accountId, r.isin, r.statementQuantity, r.quantity, r.through]))
    === JSON.stringify([[ANKITA, "INF740KA1RE3", 123000, 0, "2026-10-13"], [ANKITA, "INF740KA1SW3", 205000, 0, "2026-09-23"]]));
const gold = roll(ANKITA, "INF740KA1SW3");
ok("...and DSP Gold ETF (Stage 10mb): 20,50,000 units after the split, redeemed whole on 23 Sep for ₹2,99,99,805.02",
  gold?.costBasis === 0 && gold.costOfUnitsSold === 30193698.9 && gold.realizedPnL === -193893.88);
const silver = roll(ANKITA, "INF740KA1RE3");
ok("...carried through DSP's 28 Aug 1:10 split and redeemed whole: 12,30,000 units for ₹2,56,48,310.01",
  JSON.stringify(silver?.shareEvents) === JSON.stringify([{ type: "split", exDate: "2026-08-28", factor: 10 }])
    && silver?.costBasis === 0 && silver.costOfUnitsSold === 32203865.44 && silver.realizedPnL === 23093912.99, "₹2,96,49,468.42 + ₹2,56,48,310.01 of proceeds less ₹3,22,03,865.44 of cost");
ok("...is found by account, ISIN and the statement's units", !!soldSinceStatement(ANKITA, { isin: "INF740KA1RE3", quantity: 123000 }));

// ── sold to nil ───────────────────────────────────────────────────────────────
for (const [account, isin, name, units] of [
  [ANKITA, "INE238A01034", "Axis Bank", 7300], [ANKITA, "INE090A01021", "ICICI Bank", 14500], [ANKITA, "INE062A01020", "SBI", 27750],
  [AJAY, "INE559A01017", "IFB Industries", 15772], [AJAY, "INE589A01014", "NLC India", 32000],
] as const) {
  const r = roll(account, isin);
  ok(`${name}: ${units} on 31 Jul, sold to nil on the report's exchange trades`, r?.statementQuantity === units && r?.quantity === 0 && r.costBasis === 0);
  ok(`${name}: not a live candidate, so never valued`, !cand(account, isin));
}
ok("the statement basis keeps Ankita's 31 Jul units", BOOK_UNVALUED_HOLDINGS.some((u) => u.accountId === ANKITA && u.isin === "INE238A01034" && u.quantity === 7300));

// ── bought since ──────────────────────────────────────────────────────────────
const bought: [string, number, number][] = [["INE001B01026", 67500, 29581583], ["INE011K01018", 24250, 49656216], ["INE358U01012", 27500, 29990246]];
for (const [isin, units, cost] of bought) {
  const p = cand(AJAY, isin);
  ok(`${isin}: a candidate on Ajay's demat at the report's ${units} units and cost`,
    !!p && p.quantity === 0 && p.rolledForward?.quantity === units && p.rolledForward.costBasis === cost
      && p.rolledForward.source === "adviser-report" && p.depositoryUnits?.kind === "adviser-trades" && p.costUnavailable === false && !!p.symbol,
    p ? `${p.symbol} ${p.rolledForward?.quantity}` : "missing");
}
const taalRoll = roll(AJAY, "INE524T01029");
ok("TAAL: 4,000 bought in September, carried through the report's own 22 Sep 5-for-1 SPLIT block to 20,000 (Stage 10kk)",
  taalRoll?.quantity === 20000 && taalRoll.costBasis === 18009805 && taalRoll.trades === 4
    && JSON.stringify(taalRoll.shareEvents) === JSON.stringify([{ type: "split", exDate: "2026-09-22", factor: 5 }]));

// ── priced at the roll ────────────────────────────────────────────────────────
const krbl = cand(AJAY, "INE001B01026")!;
const feed: QuoteFeed = { asOf: "2026-10-27T08:00:00Z", missing: [], pending: [], fresh: 1, stale: 0,
  quotes: { [krbl.symbol!]: { price: 440, prevClose: 436, ageS: 0, source: "upstox", tradedAt: "2026-10-27T07:59:00Z", open: null,
    dayLow: null, dayHigh: null, low52: null, high52: null, marketCap: null, volume: null, yearChangePct: null } } };
const actions: ActionFeed = { version: 1, capturedAt: feed.asOf, requestedFrom: "2020-01-01", requestedTo: "2026-10-27",
  verifiedThrough: "2026-10-27", symbols: [krbl.symbol!], isins: [krbl.isin!], sourceUrl: "test", rows: [] };
const live = depositoryShareHoldings(feed, actions, [krbl])[0];
ok("a fixture quote values KRBL at the rolled 67,500 units, with the report's cost beneath it",
  !!live?.live && live.quantity === 67500 && live.marketValue === 67500 * 440 && live.costBasis === 29581583
    && live.unrealizedPnL === 67500 * 440 - 29581583, live ? `${live.quantity} × ${live.currentPrice}` : "no row");
ok("...and strikes no period return: the units had no mark on the statement's date", live?.realizedLotsAfter === 0);

// ── a split the roll already carries (Stage 10kk) ─────────────────────────────
const taal = cand(AJAY, "INE524T01029")!;
ok("TAAL is a candidate on Ajay's demat with an NSE symbol and the split on its roll",
  !!taal?.symbol && taal.rolledForward?.quantity === 20000 && taal.rolledForward.shareEvents?.[0]?.factor === 5, taal?.symbol ?? "missing");
const taalSplit: ActionFeed["rows"][number] = { id: "INE524T01029|EQ|2026-09-22|split", ticker: taal.symbol!, isin: "INE524T01029", company: "TAAL Tech Limited",
  type: "split", exDate: "2026-09-22", recordDate: "2026-09-22", purpose: "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share",
  source: "NSE", sourceUrl: "test", factor: 5, cashPerShare: null, issue: null };
const taalFeed: QuoteFeed = { ...feed, quotes: { [taal.symbol!]: { ...feed.quotes[krbl.symbol!], price: 900, prevClose: 890 } } };
const taalActions = (rows: ActionFeed["rows"]): ActionFeed => ({ ...actions, symbols: [taal.symbol!], isins: [taal.isin!], rows });
const taalLive = depositoryShareHoldings(taalFeed, taalActions([taalSplit]), [taal])[0];
ok("a capture listing the same split prices TAAL at the roll's 20,000 units — the split is not applied twice",
  !!taalLive?.live && taalLive.quantity === 20000 && taalLive.marketValue === 20000 * 900 && taalLive.costBasis === 18009805,
  taalLive ? `${taalLive.quantity} × ${taalLive.currentPrice}` : "no row");
const unwitnessed = { ...taal, rolledForward: { ...taal.rolledForward!, shareEvents: undefined } };
ok("the same split on a roll that does not carry it withholds the price", depositoryShareHoldings(taalFeed, taalActions([taalSplit]), [unwitnessed]).length === 0);
ok("a capture whose split ratio differs from the report's withholds the price",
  depositoryShareHoldings(taalFeed, taalActions([{ ...taalSplit, factor: 2 }]), [taal]).length === 0);

// ── the gates on constructed rolls ───────────────────────────────────────────
const base = shareCandidates().filter((p) => p.accountId === AJAY && !p.rolledForward);
const fake = (over: Partial<ShareRoll>): ShareRoll => ({ accountId: AJAY, isin: "INE001B01026", security: "KRBL Ltd", statementQuantity: 0,
  asOf: "2026-07-31", through: "2026-08-28", quantity: 100, costBasis: 1000, realizedPnL: 0, costOfUnitsSold: 0, trades: 1,
  report: { path: "test", asOf: "2026-10-23", sheet: "Direct Equity", rows: [1] }, ...over });
ok("a bought roll with no NSE identity is no candidate",
  !withShareRolls(base, [fake({ isin: "INE999Z99999", security: "Nobody Ltd" })]).some((p) => p.isin === "INE999Z99999"));
ok("a roll of units the statement does not record is not attached to a different balance",
  withShareRolls(base, [fake({ isin: base[0]?.isin ?? "", statementQuantity: (base[0]?.quantity ?? 0) + 1 })]).every((p) => !p.rolledForward));
ok("a bought roll another statement of the same owner already holds at the same units is not counted twice",
  !withShareRolls(base, [fake({ quantity: 1 })], BOOK_ACCOUNTS,
    [...BOOK_POSITIONS, { ...BOOK_POSITIONS[0], accountId: "icici-bank-nsdl-demat-49794950", isin: "INE001B01026", quantity: 1 } as Position])
    .some((p) => p.isin === "INE001B01026"));

// ── what the pages say ────────────────────────────────────────────────────────
ok("a sold balance is classified as sold, never as held and not valued",
  depositoryBalancesOf(AJAY, []).filter((b) => b.soldSince).map((b) => b.window.isin).sort().join() === "INE559A01017,INE589A01014");
ok("a statement line the report sold is found by account, ISIN and units only",
  !!soldSinceStatement(ANKITA, { isin: "INE238A01034", quantity: 7300 }) && !soldSinceStatement(ANKITA, { isin: "INE238A01034", quantity: 7299 })
    && !soldSinceStatement(AJAY, { isin: "INE238A01034", quantity: 7300 }));
const notes = partialValuationNotes([{ ...live, depositoryUnits: krbl.depositoryUnits }], BOOK_SHARE_MOVEMENTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, shareCandidates());
const ajayNote = notes.get(AJAY) ?? "";
ok("Ajay's note names the bought share's units as the report's, and the two sold balances as not held",
  /1 listed share is valued at the units the later exchange trades on MOPWM's transaction report of 2026-10-23 carry it to/.test(ajayNote)
    && /2 balances on that statement were sold to nil after it/.test(ajayNote), ajayNote.slice(0, 400));
ok("the units sentence says the shares were bought after the statement",
  /bought after it on 2 exchange trades to 2026-08-28 that MOPWM's transaction report of 2026-10-23 records/.test(describeDepositoryUnits(krbl.depositoryUnits!)));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All share-roll checks passed.");
