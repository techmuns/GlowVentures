/**
 * ── THE PUBLISHED NAV: WHAT IT MAY MOVE, AND WHAT IT MUST NOT ──────────────
 *
 * Anchored on the two GENERATED artefacts — `glowData.ts` and `fundNavs.ts` —
 * rather than on a fixture, so every expectation is derived on the run and a
 * hand-written pair cannot prove only that two inventions agree.
 *
 * The load-bearing ones are the REFUSALS. An overlay that priced everything,
 * or one that quietly moved a cost, renders a page full of plausible figures
 * and no structural check can see it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  applyFundNavs, fundNavFor, FUND_NAV_COUNT,
  depositoryCashHoldings, depositoryFundHoldings, depositoryBalancesOf, partialValuationNotes,
  VALUE_DEPOSITORY_CASH_UNITS, VALUE_DEPOSITORY_FUND_UNITS, isArbitrageFund,
} from "../fundNavs";
import {
  depositoryShareCandidates, depositoryShareHoldings, unpricedStatementShareCandidates, shareCandidates,
  VALUE_DEPOSITORY_SHARE_UNITS,
} from "../depositoryShares";
import { describeDepositoryUnits, depositoryUnitsGist } from "../fundNavs";
import { BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import type { QuoteFeed } from "../quotes";
import type { ActionFeed } from "../corporateActions";
import { validActionFeed } from "../../../shared/corporateActions.mjs";
import { isCashEquivalent } from "../analytics";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SHARE_MOVEMENTS, BOOK_CAPITAL_MOVES } from "@/data/glowData";
import NSE_SYMBOLS from "@/data/nseSymbols.json";
import { UPSTOX_INSTRUMENTS } from "../../../shared/upstoxInstruments.mjs";
import type { Position } from "../types";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};

console.log("──── Fund NAVs");

// ── the join ────────────────────────────────────────────────────────────────
console.log("── every scheme is reached by an identifier, never by a name ──");
ok("the store is not empty — a suite that passes over no input claims nothing",
  BOOK_FUND_NAVS.length > 0, `${BOOK_FUND_NAVS.length} scheme(s), ${FUND_NAV_COUNT} usable`);
ok("every entry carries the ISIN it was joined on",
  BOOK_FUND_NAVS.every((e) => /^IN[EF][0-9A-Z]{9}$/.test(e.isin)));
ok("...and says which tier supplied it",
  BOOK_FUND_NAVS.every((e) => e.isinFrom === "statement" || e.isinFrom === "look-through"));
ok("both tiers are actually in use, so neither is dead",
  BOOK_FUND_NAVS.some((e) => e.isinFrom === "statement") && BOOK_FUND_NAVS.some((e) => e.isinFrom === "look-through"));
ok("every NAV is a positive finite number with its own publication date",
  BOOK_FUND_NAVS.every((e) => Number.isFinite(e.nav) && e.nav > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));

// A REFUSAL MUST NAME ITS CAUSE — the rule `Absent.tsx` enforces on screen,
// applied to the data that decides whether a figure appears at all.
console.log("── a refused scheme carries its NAV and its reason ──");
ok("every scheme refused for value names why",
  BOOK_FUND_NAVS.filter((e) => !e.usableForValue).every((e) => !!e.notUsableReason && e.notUsableReason.length > 20));
ok("...and every usable one carries no reason, so the field cannot drift into prose",
  BOOK_FUND_NAVS.filter((e) => e.usableForValue).every((e) => e.notUsableReason === null));

// ── the basis gate, which is what stops a ten-fold error ────────────────────
console.log("── the units and the NAV are on one basis, or the NAV does not value ──");
const marksOf = (key: string) => BOOK_POSITIONS
  .filter((p) => p.securityKey === key && typeof p.currentPrice === "number")
  .map((p) => p.currentPrice as number);
ok("every scheme cleared for value is within a factor of two of the book's own mark",
  BOOK_FUND_NAVS.filter((e) => e.usableForValue).every((e) => {
    const m = marksOf(e.securityKey);
    return m.length === 0 || m.some((x) => e.nav / x >= 0.5 && e.nav / x <= 2);
  }));
/**
 * LOAD-BEARING, AND STATED AS AN INEQUALITY. On this book DSP Gold is marked
 * ₹151.10 against a NAV of ₹14.7633 — a share-count break. The gate is only
 * worth having if applying it would actually change an answer, so the suite
 * asserts a holding EXISTS that the naive `quantity × NAV` would misprice by
 * more than a factor of two, whether or not the join currently reaches it.
 */
const wouldBreak = BOOK_POSITIONS.filter((p) => {
  const e = fundNavFor(p);
  if (!e || !(p.currentPrice as number) || !(p.quantity > 0)) return false;
  const r = e.nav / (p.currentPrice as number);
  return r < 0.5 || r > 2;
});
if (wouldBreak.length === 0) {
  /**
   * NOT EXERCISED ON THIS BOOK, AND SAID OUT LOUD RATHER THAN PASSED OVER
   * NOTHING. `[].every(...)` is true, so the obvious assertion here would
   * report a working gate on a run where the gate never ran — `golden.mjs`'s
   * rule, arriving through an empty set.
   *
   * Both share-count breaks in this book are the DSP metal ETFs, and AMFI does
   * not list the ISINs their statements carry, so the join never reaches them
   * and the band has no subject. The gate stays because the next drop could
   * bring one that resolves; what cannot be claimed is that this run proved it.
   */
  console.log("NOT CHECKED  the basis gate refuses a share-count break — no scheme in this book both RESOLVES and sits outside the band (the two that break it, the DSP metal ETFs, are not in AMFI's file at all)");
} else {
  ok("no holding the overlay accepts would be mispriced by a factor of two",
    wouldBreak.every((p) => !fundNavFor(p)?.usableForValue),
    `${wouldBreak.length} holding(s) sit outside the band`);
}

// ── the overlay itself ──────────────────────────────────────────────────────
console.log("── the overlay moves the price and the value, and nothing else ──");
const before = BOOK_POSITIONS as Position[];
const after = applyFundNavs(before);
ok("it returns one row per row, in order", after.length === before.length
  && after.every((p, i) => p.securityKey === before[i].securityKey));

const moved = after.filter((p, i) => p.marketValue !== before[i].marketValue);
ok("it moved at least one holding — an overlay that priced nothing is not wired",
  moved.length > 0, `${moved.length} row(s) repriced`);

/**
 * §6, ASSERTED FIELD BY FIELD. This is the whole guarantee: a published price
 * is evidence about what a unit is worth and about nothing else. A future edit
 * that let it touch a cost or a realised figure would render perfectly.
 */
const FROZEN = ["quantity", "costBasis", "realizedPnL", "dividendReceived", "accruedIncome",
  "stCostBasis", "ltCostBasis", "heldSince", "investedOn", "accountId", "securityKey",
  "assetClass", "sector", "isin", "dayChange", "dayChangePct", "prevClose", "live"] as const;
ok("quantity, cost, realised, dividends, dated fields and the INTRADAY fields are untouched",
  after.every((p, i) => FROZEN.every((f) =>
    JSON.stringify((p as Record<string, unknown>)[f]) === JSON.stringify((before[i] as Record<string, unknown>)[f]))));

ok("a repriced row's value is exactly its own units times the published NAV",
  moved.every((p) => {
    const e = fundNavFor(p);
    return !!e && Math.abs(p.marketValue - p.quantity * e.nav) < 0.000001;
  }));
ok("...and its price IS that NAV, never a value divided back out",
  moved.every((p) => p.currentPrice === fundNavFor(p)?.nav));
ok("every repriced row is marked as NAV-priced and carries the publication date",
  moved.every((p) => p.navPriced === true && /^\d{4}-\d{2}-\d{2}$/.test(p.navDate ?? "")));
ok("...and NONE of them is marked live — a NAV is not an intraday quote",
  moved.every((p) => !p.live));

// A LIVE QUOTE WINS. One scheme in this book resolves an NSE symbol, and an
// intraday price is fresher than a NAV published for the previous business day.
const asLive = before.map((p) => (fundNavFor(p)?.usableForValue ? { ...p, live: true } : p));
ok("a holding the quote feed already priced is left alone",
  applyFundNavs(asLive).every((p, i) => p.marketValue === asLive[i].marketValue));

// A HOLDING WITH NO UNITS IS NOT PRICED INTO EXISTENCE. `quantity × NAV` on a
// closed position is a measured zero either way, and overlaying it would mark a
// row the family no longer holds as though it had been revalued.
ok("a holding with no units is never repriced",
  after.every((p, i) => (before[i].quantity > 0) || p.marketValue === before[i].marketValue));

/**
 * ── A LAST DEPOSITORY MOVEMENT'S PRICE IS NEVER A MARK IN THE BOOK (Stage 10cz)
 *
 * This block used to assert that one holding's printed rate was NOT its value
 * over quantity — ICICI NFT NT 50 DP G, 60.4 against an implied 60.4167 — as
 * the proof that the ingest READS a rate rather than deriving it. Both halves
 * of that turned out to be something else. The implied figure was a rounding
 * artefact of a DERIVED value (₹2.90 on 0.048 units), and the rate was the
 * price of the depository movement that took the rest of the holding OUT: the
 * three Motilal Oswal holding statements print, beside a balance, the rate and
 * value of the holding's last movement, never a valuation of the balance.
 *
 * Those rows left `BOOK_POSITIONS` for `BOOK_UNVALUED_HOLDINGS`, as quantities
 * carrying the movement's price as `lastMovementRate`. So the claim here is the
 * one that change makes, struck from both ends: the book carries such lines,
 * and none of them is also a position valued at anything.
 */
console.log("── a depository's last-movement price is never a book mark ──");
const lastMoved = BOOK_UNVALUED_HOLDINGS.filter((u) => typeof u.lastMovementRate === "number" && u.lastMovementRate > 0);
ok("the Motilal holding statements' last-movement prices are in the book, as quantities, so the claim below has a subject",
  lastMoved.length > 0, `${lastMoved.length} line(s)`);
const markedAtMovement = BOOK_POSITIONS.filter((p) =>
  lastMoved.some((u) => u.accountId === p.accountId && u.securityKey === p.securityKey));
ok("no book position stands where its statement printed only a last movement's price",
  markedAtMovement.length === 0, markedAtMovement.map((p) => `${p.accountId} ${p.securityKey}`).join("; "));
ok("...and the ICICI index fund this block was once anchored on is one of them — a delivery out, 0.048 units left",
  lastMoved.some((u) => u.security === "ICICI NFT NT 50 DP G" && Math.abs((u.quantity ?? NaN) - 0.048) < 1e-9 && u.lastMovementRate === 60.4));

// ── the depository's cash, valued where no statement marks it ──────────────
/**
 * *"Arbitrage funds or holdings into that cash as well, because arbitrage funds
 * are nothing but basically cash."* The three this family holds are on ONE
 * account — Ajay's main demat, which sent a TRANSACTION statement and no holding
 * statement — so they are a depository's closing balances and no position at
 * all. `depositoryCashHoldings` values those balances at AMFI's published NAV on
 * the LIVE basis, and every claim below is struck against the generated book and
 * the committed store rather than against the function's own output.
 */
console.log("── a depository's cash-equivalent units, valued at the published NAV ──");
const DEP = depositoryCashHoldings();
const txOnly = new Set(BOOK_ACCOUNTS.filter((a) => a.transactionsOnly === true).map((a) => a.accountId));
const crs = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
ok("the switch is on, so the rows below are what the live book adds",
  VALUE_DEPOSITORY_CASH_UNITS === true);
ok("the book names which accounts sent a transaction statement and no holding statement",
  txOnly.size > 0, [...txOnly].join(", "));
ok("the depository contributes rows at all, so every claim below has a subject",
  DEP.length > 0, `${DEP.length} row(s), ${crs(DEP.reduce((a, p) => a + p.marketValue, 0))}`);
ok("...and they include the arbitrage funds the family asked about",
  DEP.some((p) => isArbitrageFund(p)), DEP.filter((p) => isArbitrageFund(p)).map((p) => p.securityKey).join("; "));
ok("every row sits on such an account and nowhere else",
  DEP.every((p) => txOnly.has(p.accountId)));
ok("...and no account that carries a book position gains one — its own holding statement already speaks",
  DEP.every((p) => !BOOK_POSITIONS.some((b) => b.accountId === p.accountId)));
ok("every row is a cash equivalent: the switch values the family's cash and nothing else",
  DEP.every((p) => isCashEquivalent(p)));

/** THE UNITS ARE THE DEPOSITORY'S, THE PRICE IS AMFI'S, AND NOTHING ELSE IS. */
const navByIsin = new Map(BOOK_FUND_NAVS.map((e) => [e.isin, e]));
const blocks = Object.values(BOOK_SHARE_MOVEMENTS);
const offUnits = DEP.filter((p) => {
  const w = blocks.filter((b) => b.accountId === p.accountId && b.isin === p.isin);
  return w.length !== 1 || w[0].reason !== null || w[0].closing !== p.quantity;
});
ok("every row's units are the depository's own closing balance, from a block that reconciled",
  offUnits.length === 0, offUnits.map((p) => p.securityKey).join("; "));
const offValue = DEP.filter((p) => {
  const e = p.isin ? navByIsin.get(p.isin) : undefined;
  return !e || !e.usableForValue || p.currentPrice !== e.nav || p.marketValue !== p.quantity * e.nav
    || p.navDate !== e.date;
});
ok("...and its value is exactly those units × the NAV AMFI published, dated as AMFI dated it",
  offValue.length === 0, offValue.map((p) => p.securityKey).join("; "));
ok("no row carries a cost — a depository holds units and did not buy them, and a ₹0 cost would book the lot as profit",
  DEP.every((p) => p.costBasis === null && p.unrealizedPnL === null && p.returnPct === null && p.costUnavailable === true));
ok("every row says where it came from: the depository's window and the NAV's own date",
  DEP.every((p) => p.navPriced === true && !!p.navDate && !!p.depositoryUnits?.asOf && !!p.depositoryUnits?.source));
const doubled = DEP.filter((p) => BOOK_POSITIONS.some((b) =>
  b.isin && p.isin && b.isin.toUpperCase() === p.isin.toUpperCase() && Math.abs(b.quantity - p.quantity) < 0.0005));
ok("no row repeats a book position — same ISIN and the same units would be one holding counted twice",
  doubled.length === 0, doubled.map((p) => p.securityKey).join("; "));
ok("the generated book carries no position on a transaction-only account — none of this is in `glowData.ts`",
  BOOK_POSITIONS.every((b) => !txOnly.has(b.accountId)));

/**
 * EACH GATE IS LOAD-BEARING, SHOWN ON CONSTRUCTED INPUTS, because on this book
 * a working gate and a deleted one can draw the same rows.
 */
console.log("── each gate refuses on its own ──");
ok("an account the book does not mark transaction-only yields nothing",
  depositoryCashHoldings(BOOK_ACCOUNTS.map((a) => ({ ...a, transactionsOnly: false }))).length === 0);
const firstAcct = DEP[0]?.accountId ?? "";
ok("...nor does one that also carries a position of its own",
  depositoryCashHoldings(BOOK_ACCOUNTS, [...BOOK_POSITIONS, { ...BOOK_POSITIONS[0], accountId: firstAcct }])
    .every((p) => p.accountId !== firstAcct));
const unreconciled = Object.fromEntries(Object.entries(BOOK_SHARE_MOVEMENTS)
  .map(([k, w]) => [k, { ...w, reason: "the rows did not walk to the printed closing balance" }]));
ok("a block whose rows did not walk to their printed closing yields nothing",
  depositoryCashHoldings(BOOK_ACCOUNTS, BOOK_POSITIONS, unreconciled).length === 0);
/**
 * AND THE CASH GATE BITES ON THE BOOK ITSELF. The same demat holds mutual funds
 * AMFI prices that are NOT cash — a large & mid cap fund, an equity savings fund
 * — and the family asked for arbitrage to be counted as cash, not for this
 * account to be valued. Those balances must stay out.
 */
// Keyed as the book keys the ISIN where the book carries it — the depository's
// own spelling of HDFC Liquid is not the key the live book values it under.
const bookKeyByIsin = new Map<string, string>();
for (const b of BOOK_POSITIONS) {
  const k = b.isin?.trim().toUpperCase();
  if (k && !bookKeyByIsin.has(k)) bookKeyByIsin.set(k, b.securityKey);
}
const keyOf = (w: { isin: string | null; securityKey: string }) =>
  bookKeyByIsin.get(w.isin?.trim().toUpperCase() ?? "") ?? w.securityKey;
const nonCash = blocks.filter((w) => txOnly.has(w.accountId) && w.reason === null && (w.closing ?? 0) > 0
  && w.isin && navByIsin.get(w.isin)?.usableForValue && !isCashEquivalent({ securityKey: keyOf(w) }));
ok("the same account holds priced funds that are not cash, so the cash gate has something to refuse",
  nonCash.length > 0, `${nonCash.length} balance(s), ${crs(nonCash.reduce((a, w) => a + (w.closing ?? 0) * (navByIsin.get(w.isin ?? "")?.nav ?? 0), 0))} at AMFI's NAV`);
ok("...and the CASH rows value none of them — the cash gate still refuses what is not cash",
  nonCash.every((w) => !DEP.some((p) => p.isin === w.isin)));

/**
 * ── …AND THE OTHER FUNDS ON THAT STATEMENT ARE VALUED TOO (Stage 10cy) ─────
 *
 * *"We need to make sure that we are not missing out on any data that the
 * statement has already given us."* The same demat's closing balances carry
 * five more mutual funds AMFI prices — Bandhan Large & Mid Cap, ICICI India
 * Opportunities, ICICI Equity Savings, Kotak Multicap, Kotak Large & Midcap —
 * and they are valued now, under a switch of their own, on the same five gates
 * with only the cash question changed. An ETF from a depository is still NOT
 * valued: its units and its NAV can be on different bases (DSP Gold's ten-fold
 * break), and a depository balance carries no mark to test the basis against.
 */
console.log("── the depository's other funds, valued at the published NAV (Stage 10cy) ──");
const FUNDS = depositoryFundHoldings();
const isEtfIsin = (isin: string | null | undefined) => /\bETFs?\b/i.test(navByIsin.get(isin ?? "")?.category ?? "");
ok("the fund switch is on, so the non-cash rows below are what the live book adds",
  VALUE_DEPOSITORY_FUND_UNITS === true);
ok("the cash rows are exactly the fund rows that are cash equivalents — one builder, two views",
  DEP.length === FUNDS.filter((p) => isCashEquivalent(p)).length
  && DEP.every((p) => FUNDS.some((f) => f.isin === p.isin && f.accountId === p.accountId)));
const nonCashFunds = nonCash.filter((w) => !isEtfIsin(w.isin));
ok("every non-cash fund the cash gate refused is valued here, at AMFI's NAV",
  nonCashFunds.length > 0 && nonCashFunds.every((w) => FUNDS.some((p) => p.isin === w.isin && p.accountId === w.accountId)),
  `${nonCashFunds.length} fund(s), ${crs(FUNDS.filter((p) => !isCashEquivalent(p)).reduce((a, p) => a + p.marketValue, 0))}`);
ok("...and no ETF a depository reports is valued unless it is cash — its units may not be on its NAV's basis",
  FUNDS.every((p) => isCashEquivalent(p) || !isEtfIsin(p.isin)));
const offUnitsF = FUNDS.filter((p) => {
  const w = blocks.filter((b) => b.accountId === p.accountId && b.isin === p.isin);
  return w.length !== 1 || w[0].reason !== null || w[0].closing !== p.quantity;
});
ok("every fund row's units are the depository's own reconciled closing balance",
  offUnitsF.length === 0, offUnitsF.map((p) => p.securityKey).join("; "));
const offValueF = FUNDS.filter((p) => {
  const e = p.isin ? navByIsin.get(p.isin) : undefined;
  return !e || !e.usableForValue || p.currentPrice !== e.nav || p.marketValue !== p.quantity * e.nav || p.navDate !== e.date;
});
ok("...its value exactly those units × AMFI's NAV, dated as AMFI dated it",
  offValueF.length === 0, offValueF.map((p) => p.securityKey).join("; "));
ok("...with no cost, and saying where it came from",
  FUNDS.every((p) => p.costBasis === null && p.unrealizedPnL === null && p.costUnavailable === true
    && p.navPriced === true && !!p.depositoryUnits?.asOf && !!p.depositoryUnits?.source));
const doubledF = FUNDS.filter((p) => BOOK_POSITIONS.some((b) =>
  b.isin && p.isin && b.isin.toUpperCase() === p.isin.toUpperCase() && Math.abs(b.quantity - p.quantity) < 0.0005));
ok("...and none repeats a book position of the same ISIN and units",
  doubledF.length === 0, doubledF.map((p) => p.securityKey).join("; "));

/**
 * ── THE DEPOSITORY'S COPY OF AN AIF THE FUND ITSELF REPORTS ─────────────────
 *
 * The same demat carries 4,85,837.2 units of Neo Infra, and those units are no
 * new holding: Neo Infra's own statement reports them, on Ajay's own folio.
 * Its record of units bought and redeemed adds to exactly the depository's
 * closing balance — derived here from `BOOK_CAPITAL_MOVES`, the fund's dated
 * record, never from the classifier. Counted as "not valued" it would tell a
 * reader a holding the table already carries is missing.
 */
console.log("── a depository's copy of units a fund's own statement reports ──");
const ownerOfAcct = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.ownerId ?? a.owner]));
const recordedUnits = new Map<string, number | null>();
for (const m of BOOK_CAPITAL_MOVES) {
  if (!m.securityKey) continue;
  const k = `${m.accountId}|${m.securityKey}`;
  const prev = recordedUnits.has(k) ? recordedUnits.get(k)! : 0;
  recordedUnits.set(k, prev === null || typeof m.units !== "number" ? null : prev + m.units);
}
const tie = (a: number | null | undefined, b: number) => typeof a === "number" && Math.abs(a - b) < 0.0005;
/** Balances on `id` that another account's own statement already reports. */
const reportedElsewhere = (id: string, valuedIsins: Set<string>) => blocks.filter((w) =>
  w.accountId === id && (w.closing ?? 0) > 0 && !valuedIsins.has((w.isin ?? "").toUpperCase())
  && BOOK_POSITIONS.some((b) => b.accountId !== id && (
    (!!w.isin && b.isin?.toUpperCase() === w.isin.toUpperCase() && tie(b.quantity, w.closing as number))
    || (b.assetClass === "AIF" && ownerOfAcct.get(b.accountId) === ownerOfAcct.get(id)
      && tie(recordedUnits.get(`${b.accountId}|${b.securityKey}`), w.closing as number)))));
const depAccount = FUNDS[0]?.accountId ?? "";
const fundIsins = new Set(FUNDS.filter((p) => p.accountId === depAccount).map((p) => (p.isin ?? "").toUpperCase()));
const elsewhere = reportedElsewhere(depAccount, fundIsins);
ok("the account holds at least one such balance, so the rule below has a subject",
  elsewhere.length > 0, elsewhere.map((w) => `${w.securityKey} ${w.closing}`).join("; "));
const cls = depositoryBalancesOf(depAccount, FUNDS.filter((p) => p.accountId === depAccount));
ok("...and the classifier files every one as reported elsewhere, never as not valued",
  elsewhere.every((w) => cls.some((b) => b.window.isin === w.isin && !!b.reportedBy && !b.valued)));

/** THE ACCOUNT STOPS SAYING IT VALUES NOTHING, AND NAMES WHAT IT DOES NOT. */
const notes = partialValuationNotes(FUNDS);
const held = (id: string) => blocks.filter((w) => w.accountId === id && (w.closing ?? 0) > 0).length;
ok("every account a row came from carries a partial-valuation sentence",
  [...new Set(FUNDS.map((p) => p.accountId))].every((id) => (notes.get(id) ?? "").length > 40));
ok("...naming how many of its holdings are NOT valued, so a partial figure cannot read as the whole account",
  [...notes.entries()].every(([id, n]) => {
    const valuedHere = FUNDS.filter((p) => p.accountId === id);
    const away = reportedElsewhere(id, new Set(valuedHere.map((p) => (p.isin ?? "").toUpperCase()))).length;
    const rest = held(id) - valuedHere.length - away;
    return (rest === 0 ? !/other holding/.test(n) : n.includes(`${rest} other holding`))
      && (away === 0 ? !/more balance/.test(n) : n.includes(`${away} more balance`));
  }), [...notes.values()].join(" | ").slice(0, 400));
ok("...and names how many of its funds are the family's cash",
  [...notes.entries()].every(([id, n]) => {
    const f = FUNDS.filter((p) => p.accountId === id);
    const c = f.filter((p) => isCashEquivalent(p)).length;
    return c === 0 || c === f.length ? true : n.includes(`${c} of them liquid and arbitrage funds`);
  }));

/**
 * ── A LISTED SHARE THE DEPOSITORY REPORTS: THE LIVE QUOTE, OR NOT A ROW ─────
 *
 * The same statement closes above nil on listed shares — IFB Industries,
 * Onesource, Vedanta Aluminium Metal and more. A share has no NAV, and the
 * statement prints no rate, so its only price is the market's: it is valued at
 * the LIVE QUOTE, and where the feed did not price it, it is NOT a row. These
 * are struck on constructed feeds, because the live feed is not in this suite.
 */
console.log("── a depository's listed shares: the live quote, or no row (Stage 10cy) ──");
const CAND = depositoryShareCandidates();
ok("the share switch is on", VALUE_DEPOSITORY_SHARE_UNITS === true);
ok("the same statement carries listed shares a quote could price, so the claims below have a subject",
  CAND.length > 0, CAND.map((p) => `${p.symbol} ${p.quantity}`).join("; "));
ok("every candidate is an equity ISIN on a transaction-only account, at the depository's own reconciled closing",
  CAND.every((p) => txOnly.has(p.accountId) && /^INE/i.test(p.isin ?? "")
    && blocks.some((w) => w.accountId === p.accountId && w.isin === p.isin && w.reason === null && w.closing === p.quantity)));
const symbolOfKey = NSE_SYMBOLS as Record<string, string>;
const upstox = UPSTOX_INSTRUMENTS as Record<string, { key: string }>;
const unIdentified = CAND.filter((p) =>
  !BOOK_POSITIONS.some((b) => b.isin?.toUpperCase() === p.isin?.toUpperCase() && (b.symbol ?? symbolOfKey[b.securityKey]) === p.symbol)
  && upstox[p.symbol ?? ""]?.key !== `NSE_EQ|${(p.isin ?? "").toUpperCase()}`);
ok("every candidate's NSE symbol is reached by its ISIN — a book holding of that ISIN, or Upstox's own instrument for it — never by a name",
  unIdentified.length === 0, unIdentified.map((p) => `${p.symbol} ${p.isin}`).join("; "));
const noSymbol = blocks.filter((w) => txOnly.has(w.accountId) && w.reason === null && (w.closing ?? 0) > 0
  && /^INE/i.test(w.isin ?? "") && !CAND.some((p) => p.isin === w.isin)
  && !BOOK_POSITIONS.some((b) => b.isin?.toUpperCase() === w.isin?.toUpperCase() && Math.abs(b.quantity - (w.closing as number)) < 0.0005));
ok("an equity balance no identifier resolves to a symbol is no candidate — nothing could price it, and it stays named as not valued",
  noSymbol.every((w) => !upstox[Object.keys(upstox).find((k) => upstox[k].key === `NSE_EQ|${(w.isin ?? "").toUpperCase()}`) ?? ""]),
  noSymbol.map((w) => w.securityKey).join("; "));
ok("no candidate carries a price or a cost before a feed answers",
  CAND.every((p) => p.currentPrice === null && p.costBasis === null && p.costUnavailable === true && !p.navPriced));
/**
 * THE COMMITTED CAPTURE IS THE CORPORATE-ACTION EVIDENCE these rows are gated
 * on, exactly as the page first paints from it (`savedCorporateActions`). A
 * share is a row only once a capture has answered AND no split, bonus or other
 * share event since the balance was counted is unaccounted for.
 */
const CAPTURE_RAW: unknown = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "corporate-actions.json"), "utf8"));
ok("the committed corporate-action capture is on disk and well formed", validActionFeed(CAPTURE_RAW));
const CAPTURE = CAPTURE_RAW as ActionFeed;
ok("with no feed, no share is a row — never at a zero or a guessed price",
  depositoryShareHoldings(null, CAPTURE).length === 0);
const one = CAND[0];
const feedOf = (sym: string, price: number): QuoteFeed => ({
  quotes: { [sym]: { price, prevClose: price / 1.01, open: null, dayLow: null, dayHigh: null, low52: null, high52: null,
    marketCap: null, volume: null, yearChangePct: null, ageS: 0, source: "upstox" } },
  asOf: "2026-09-25T10:00:00Z", missing: [], pending: [], fresh: 1, stale: 0,
});
ok("a feed that prices a share makes no row while no corporate-action capture has answered — a split since the balance was counted could not be ruled out",
  !!one?.symbol && depositoryShareHoldings(feedOf(one.symbol, 250), null).length === 0);
const priced = one?.symbol ? depositoryShareHoldings(feedOf(one.symbol, 250), CAPTURE) : [];
ok("a feed that prices one share makes exactly that share a row",
  priced.length === 1 && priced[0].isin === one?.isin, priced.map((p) => p.symbol).join("; "));
ok("...at its closing units × the quote, live, with no cost and no NAV",
  priced.length === 1 && priced[0].marketValue === (one?.quantity ?? 0) * 250 && priced[0].live === true
    && priced[0].costBasis === null && priced[0].unrealizedPnL === null && !priced[0].navPriced);
/**
 * THE GATE ITSELF, on constructed captures: a split between the balance's date
 * and the quote's is projected (twice the units, at the quote), and an event
 * whose effect on the units the capture cannot state leaves the share no row —
 * never a pre-split count at a post-split price.
 */
const oneDate = BOOK_ACCOUNTS.find((a) => a.accountId === one?.accountId)?.asOf ?? "";
const withAction = (type: string, factor: number | null): ActionFeed => ({
  ...CAPTURE,
  rows: [...CAPTURE.rows, {
    id: `test:${one?.symbol}|${type}`, ticker: one?.symbol ?? "", isin: one?.isin ?? null, company: one?.security ?? "",
    type, exDate: "2026-08-20", recordDate: null, purpose: `constructed ${type}`, source: "test", sourceUrl: null,
    factor, cashPerShare: null, issue: null,
  }],
});
const tradedFeed = (sym: string, price: number): QuoteFeed => {
  const f = feedOf(sym, price);
  return { ...f, quotes: { [sym]: { ...f.quotes[sym], tradedAt: "2026-09-25T09:30:00Z" } } };
};
ok("the constructed events fall between the balance's date and the quote's, so they are the gate's to decide",
  !!oneDate && oneDate < "2026-08-20" && "2026-08-20" < "2026-09-25", oneDate);
const split = one?.symbol ? depositoryShareHoldings(tradedFeed(one.symbol, 125), withAction("split", 2)) : [];
ok("a 1:2 split since the statement is projected: twice the units at the quote, never the old count at the new price",
  split.length === 1 && split[0].quantity === (one?.quantity ?? 0) * 2 && split[0].marketValue === (one?.quantity ?? 0) * 2 * 125,
  split.map((p) => `${p.quantity} × ${p.currentPrice} = ${p.marketValue}`).join("; "));
const rights = one?.symbol ? depositoryShareHoldings(tradedFeed(one.symbol, 250), withAction("rights", null)) : [];
ok("an event the capture cannot state the units of — a rights issue — leaves the share no row",
  rights.length === 0, rights.map((p) => p.symbol).join("; "));
ok("...and every candidate passes the committed capture on a quote two days after it, so the gate is not what leaves this book's shares unvalued",
  (() => {
    const quotes: QuoteFeed["quotes"] = {};
    for (const p of shareCandidates()) if (p.symbol) quotes[p.symbol] = { ...feedOf(p.symbol, 100).quotes[p.symbol], tradedAt: "2026-09-25T09:30:00Z" };
    const all: QuoteFeed = { ...feedOf("X", 1), quotes };
    return depositoryShareHoldings(all, CAPTURE).length === shareCandidates().filter((p) => !!p.symbol).length;
  })());
const notesShare = partialValuationNotes([...FUNDS, ...priced]);
const withShare = notesShare.get(one?.accountId ?? "") ?? "";
ok("the account's note names the share and that it is valued only while the quote feed prices it",
  /1 listed share is valued at the same closing units × the live quote, and only while the quote feed prices it/.test(withShare), withShare.slice(0, 200));
ok("...and counts one fewer holding as not valued",
  (() => {
    const m = (t: string) => Number(/(\d+) other holding/.exec(t)?.[1] ?? 0);
    return m(notes.get(one?.accountId ?? "") ?? "") - m(withShare) === 1;
  })());

/**
 * ── …AND THE LISTED SHARES A HOLDING STATEMENT PRINTS NO USABLE PRICE FOR ───
 *
 * Two accounts DID send a holding statement and still put no price on a listed
 * share: Ankita's Motilal demat prints Clean Max at a rate of 0.000, and Ajay's
 * ICICI NSDL statement records ESDS Software at the Re 1 face value it was
 * allotted at. Both are NSE listings by their own ISIN, so the one price either
 * can have is the market's — the live quote, and no row where the feed did not
 * price it. The review is the witness that Clean Max is two holdings and not one
 * counted twice: it carries 1,89,934 across ICICI Bank and MOPWM, which is the
 * 94,967 on Ajay's ICICI row plus the 94,967 on Ankita's Motilal one.
 *
 * AND THE FAMILY HAVE DECIDED ANKITA'S STAYS UNVALUED (28 Sep 2026, Stage 10cx's
 * FQ-3, `shared/keptUnvalued.mjs`): her statement holds every one of those shares
 * in its lock-in + freeze balance and prints no rate, and *"keep them unvalued for
 * now"* is their answer. So it passes the first five gates and gate 6 stops it —
 * and that is asserted on the row moved to an account the decision does not name,
 * which the first five gates let through, so the sixth is what refuses the real one.
 */
console.log("── a holding statement's listed shares with no usable price (Stage 10cy) ──");
const NP = unpricedStatementShareCandidates();
const npOf = (isin: string) => NP.find((p) => p.isin?.toUpperCase() === isin);
const cleanMax = npOf("INE647U01026");
const esds = npOf("INE0DRI01029");
ok("Clean Max on Ankita's Motilal demat is NOT a candidate — the family decided on 28 Sep 2026 to keep it unvalued",
  !cleanMax, cleanMax ? `${cleanMax.accountId} ${cleanMax.quantity} ${cleanMax.symbol}` : "");
ok("ESDS on Ajay's ICICI NSDL account is a candidate at its 330,898 shares, named without the depository's furniture",
  !!esds && esds.accountId === "icici-bank-nsdl-demat-49794950" && esds.quantity === 330898 && esds.symbol === "ESDS"
    && esds.security === "ESDS Software Solution Limited",
  esds ? `${esds.accountId} ${esds.quantity} ${esds.symbol} "${esds.security}"` : "missing");
// WHAT THE STATEMENT PRINTED BESIDE IT decides the kind: no rate (or face
// value) is `no-price`, and the price of the holding's last depository movement
// (the Motilal statements, Stage 10cz) is `last-movement` — a price the
// statement DID print, of a movement rather than of the balance.
const unvaluedLineOf = (p: Position) => BOOK_UNVALUED_HOLDINGS.find((u) => u.accountId === p.accountId
  && u.isin?.toUpperCase() === p.isin?.toUpperCase() && u.quantity === p.quantity && u.assetClass === "Equity");
ok("every such candidate is an equity ISIN a holding statement records with no usable price, and says which in its kind",
  NP.length > 0 && NP.every((p) => {
    const u = unvaluedLineOf(p);
    if (!u || txOnly.has(p.accountId)) return false;
    const moved = typeof u.lastMovementRate === "number" && u.lastMovementRate > 0;
    return moved
      ? p.depositoryUnits?.kind === "last-movement" && p.depositoryUnits.lastMovementRate === u.lastMovementRate
        && (p.depositoryUnits.lastMovementDate ?? null) === (u.lastMovementDate ?? null)
      : p.depositoryUnits?.kind === "no-price";
  }),
  NP.map((p) => `${p.symbol} ${p.depositoryUnits?.kind} ${p.accountId}`).join("; "));
ok("...and the last-movement kind is in use, so the three Motilal statements' shares reach this layer at all",
  NP.some((p) => p.depositoryUnits?.kind === "last-movement"));
ok("...and the movement's price is never the price a candidate carries",
  NP.every((p) => p.currentPrice === null && p.marketValue === 0));
ok("...and none carries a price, a cost or a NAV before a feed answers",
  NP.every((p) => p.currentPrice === null && p.costBasis === null && p.costUnavailable === true && !p.navPriced && p.marketValue === 0));
ok("the page's list of what is not valued reads both routes' candidates",
  shareCandidates().length === CAND.length + NP.length);
// Gate 4, on a constructed case: the same units of the same ISIN under the SAME
// owner in another account is one holding moved, not a second one.
const ajayMain = "motilal-oswal-financial-services-demat-1201090012539150";
const cmRow = BOOK_UNVALUED_HOLDINGS.find((u) => u.isin?.toUpperCase() === "INE647U01026");
const movedSameOwner = cmRow ? unpricedStatementShareCandidates([{ ...cmRow, accountId: ajayMain, ownerId: "ajay-jaisinghani" }]) : [];
ok("the same units under the SAME owner in another account are refused — one holding, not two",
  !!cmRow && movedSameOwner.length === 0, movedSameOwner.map((p) => p.accountId).join("; "));
// Gate 6 is what refuses the real row: the same row on an account of a
// DIFFERENT owner that no decision names passes every other gate, at 94,967
// shares, under the book's own key and the listing's symbol.
const aartiDemat = "motilal-oswal-financial-services-demat-1201090012838335";
const cmElsewhere = cmRow ? unpricedStatementShareCandidates([{ ...cmRow, accountId: aartiDemat, ownerId: "aarti-jaisinghani" }]) : [];
ok("the same row on another owner's account, which no decision names, IS a candidate — so gates 1–5 let it through",
  cmElsewhere.length === 1 && cmElsewhere[0].quantity === 94967 && cmElsewhere[0].symbol === "CLEANMAX"
    && cmElsewhere[0].securityKey === "clean-max-enviro-energy-solutions",
  cmElsewhere.map((p) => `${p.accountId} ${p.quantity} ${p.symbol} ${p.securityKey}`).join("; ") || "none");
const realRow = cmRow ? unpricedStatementShareCandidates([cmRow]) : [];
ok("...and the real row, on Ankita's account, is refused by the family's decision (gate 6)",
  !!cmRow && cmRow.accountId === "motilal-oswal-financial-services-demat-1201090012838316" && realRow.length === 0,
  realRow.map((p) => p.accountId).join("; "));
const npFeed = (sym: string, price: number): QuoteFeed => ({
  quotes: { [sym]: { price, prevClose: price / 1.01, open: null, dayLow: null, dayHigh: null, low52: null, high52: null,
    marketCap: null, volume: null, yearChangePct: null, ageS: 0, source: "upstox" } },
  asOf: "2026-09-25T10:00:00Z", missing: [], pending: [], fresh: 1, stale: 0,
});
const esdsPriced = depositoryShareHoldings(npFeed("ESDS", 400), CAPTURE);
ok("a feed pricing ESDS makes it a row at its statement's units × the quote, live, with no cost",
  esdsPriced.length === 1 && esdsPriced[0].isin === "INE0DRI01029" && esdsPriced[0].marketValue === 330898 * 400
    && esdsPriced[0].live === true && esdsPriced[0].costBasis === null,
  esdsPriced.map((p) => `${p.symbol} ${p.marketValue}`).join("; "));
ok("...and the account-level note for a transaction-only account is never written for it",
  !partialValuationNotes(esdsPriced).has("icici-bank-nsdl-demat-49794950"));
const esdsWords = esds ? describeDepositoryUnits(esds.depositoryUnits!) : "";
ok("its hover says the statement recorded it with no usable price, and never that no holding statement was sent",
  /holding statement of 2026-03-31 records with no usable price/.test(esdsWords) && !/no holding statement/.test(esdsWords), esdsWords);
const gist = depositoryUnitsGist([...(esdsPriced as Position[]), ...FUNDS]);
ok("a list mixing a closing balance and a no-price share names both sources",
  /closing balance/.test(gist) && /no usable price/.test(gist) && /^either /.test(gist), gist);

/**
 * ── THE UNIT-BASIS WITNESS, FROM THE FAMILY'S OWN DOCUMENT ──────────────────
 *
 * The builder's basis gate compares a published NAV against a STATEMENT MARK and
 * refuses a scheme more than a factor of two away — which is what caught DSP
 * Gold's ten-fold share-count break. A depository balance has no mark, so that
 * gate cannot run on these rows, and the one thing that could make them wrong by
 * ten times goes unchecked by it.
 *
 * So a document nobody in this join controls is asked instead. The family's
 * consolidated review records its own purchase of Motilal Oswal Arbitrage — a
 * unit count and the NAV paid — and the depository credits EXACTLY that many
 * units to this account on the settlement date. One purchase, two independent
 * documents, three decimals. The NAV the review paid is then held to the same
 * factor-of-two band against the NAV AMFI publishes today: the units the
 * depository counts are the units AMFI prices.
 */
console.log("── the depository's units and AMFI's NAV are one unit ──");
const REVIEW = path.join(process.cwd(), "source", "august-2026-d",
  "Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
if (!existsSync(REVIEW)) {
  ok("the family's consolidated review is on disk to witness the unit basis", false, REVIEW);
} else {
  const wb = XLSX.readFile(REVIEW);
  const sheet = wb.SheetNames.find((n) => /transactions since inception/i.test(n));
  const rows = sheet
    ? (XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" }) as unknown[][])
    : [];
  const excelDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  type Buy = { product: string; date: string; units: number; nav: number };
  const buys: Buy[] = rows
    .filter((r) => r.some((c) => /^purchase$/i.test(String(c).trim())))
    .map((r) => {
      const i = r.findIndex((c) => /^purchase$/i.test(String(c).trim()));
      return { product: String(r[i - 1] ?? ""), date: excelDate(Number(r[i + 1])), units: Number(r[i + 2]), nav: Number(r[i + 3]) };
    })
    .filter((b) => Number.isFinite(b.units) && b.units > 0 && Number.isFinite(b.nav) && b.nav > 0);
  // The depository's own dated credits for every row valued here, read from the
  // archive document the balance came from — never from the review.
  type Credit = { isin: string; date: string; quantity: number };
  const credits: Credit[] = [];
  for (const src of new Set(DEP.map((p) => p.depositoryUnits?.source).filter(Boolean) as string[])) {
    const f = path.join(process.cwd(), "public", "audit", src, "document.json");
    if (!existsSync(f)) continue;
    const doc = JSON.parse(readFileSync(f, "utf8")) as { transactions?: { isin?: string | null; date?: string; quantity?: number | null }[] };
    for (const t of doc.transactions ?? []) {
      if (t.isin && t.date && typeof t.quantity === "number" && t.quantity > 0) credits.push({ isin: t.isin, date: t.date, quantity: t.quantity });
    }
  }
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const witnessed = DEP.filter((p) => isArbitrageFund(p)).flatMap((p) => {
    const nav = navByIsin.get(p.isin ?? "")?.nav ?? 0;
    return buys
      .filter((b) => credits.some((c) => c.isin === p.isin && Math.abs(c.quantity - b.units) < 0.0005 && days(c.date, b.date) <= 5))
      .map((b) => ({ key: p.securityKey, b, nav }));
  });
  ok("the review records a purchase the depository credits unit for unit",
    witnessed.length > 0,
    witnessed.map((w) => `${w.b.product}: ${w.b.units} units on ${w.b.date} at ₹${w.b.nav}`).join("; ") || `${buys.length} purchases read, none matched`);
  ok("...at a NAV on the same scale AMFI publishes today — the builder's own factor-of-two band",
    witnessed.length > 0 && witnessed.every((w) => w.nav / w.b.nav >= 0.5 && w.nav / w.b.nav <= 2),
    witnessed.map((w) => `paid ₹${w.b.nav}, published ₹${w.nav}`).join("; "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All fund-NAV checks passed.");
