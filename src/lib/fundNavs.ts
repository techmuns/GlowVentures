/**
 * ── THE PUBLISHED NAV, APPLIED TO A HOLDING ────────────────────────────────
 *
 * *"Live values of any investment, we should show it on all the relevant
 * places automatically on the dashboard."*
 *
 * `applyQuotes` prices a holding the quote feed can reach. It reaches none of
 * this book's funds, because every live endpoint is keyed on an NSE trading
 * symbol and a scheme resolves none — so a fund's value sat at its last
 * statement mark however old that was. This is the same overlay for the same
 * purpose over a different source: AMFI's own daily NAV, fetched and committed
 * by `npm run build-fund-navs` and joined to the book on the ISIN.
 *
 * IT IS APPLIED AT ONE SEAM, `PortfolioContext`, which is what makes it reach
 * every page at once rather than needing a per-page edit. Every surface that
 * reads `portfolio` gets the current value; `statementPortfolio` is untouched,
 * so Capital Gains, Data Audit and Ledger Insights still tie to the PDFs.
 *
 * ── THE BASIS RULE IS `applyQuotes`'s, VERBATIM ────────────────────────────
 *
 * Only PRICE-DERIVED fields move — market value, unrealised P&L and the return
 * on cost. Quantity, cost basis, realised gains, dividends, fees and every
 * dated cash flow come from the statements and are never touched, because no
 * published price is evidence about any of them (§6).
 *
 * ── AND `live` STAYS FALSE, WHICH IS THE ONE THING NOT COPIED ──────────────
 *
 * A quote is intraday; a NAV is struck once, after the close, and this book
 * already records at length why the two must never be added (Stage 10aw: the
 * card that shows them keeps them behind a toggle and states on its face that
 * they are never summed). `live` is what gates Today's movers and what draws
 * the intraday day-change column, so setting it would fold a NAV dated
 * yesterday into a card headed "today".
 *
 * So a NAV-priced holding carries `navPriced` and its own `navDate` instead,
 * and the INTRADAY fields are left exactly as they were — null. Its day change
 * belongs on the published-NAV card, which computes it from its own store.
 *
 * ── A REFUSED SCHEME KEEPS ITS STATEMENT MARK ──────────────────────────────
 *
 * `usableForValue` is false where the book's units and the AMC's NAV unit are
 * not the same unit — a share-count break, which on this book would report
 * ₹16.9 Cr of gold as ₹1.76 Cr. Those holdings are not overlaid at all and
 * keep the mark their statement struck; the builder names each one and the
 * reason. The NAV itself is still available for display, which is what the
 * family asked to see.
 */
import { BOOK_FUND_NAVS, FUND_NAV_AS_OF, type FundNav } from "@/data/fundNavs";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS } from "@/data/glowData";
import { isCashEquivalent } from "./analytics";
import { composeSchemeLabel, holdingLabel, schemeNameFor } from "./schemeLabel";
import type { Account, Position, ShareMovement } from "./types";

export { FUND_NAV_AS_OF };
export type { FundNav };

/** securityKey → the published record, whether or not it may value a holding. */
const BY_KEY = new Map<string, FundNav>(BOOK_FUND_NAVS.map((e) => [e.securityKey, e]));

/** What AMFI published for this holding, if anything — including a refused one. */
export function fundNavFor(p: Pick<Position, "securityKey">): FundNav | null {
  return BY_KEY.get(p.securityKey) ?? null;
}

/** Every scheme this book can price, for a coverage line that counts rather than claims. */
export const FUND_NAV_COUNT = BOOK_FUND_NAVS.filter((e) => e.usableForValue).length;

/**
 * Overlay the published NAV onto the holdings it may value.
 *
 * A HOLDING THE QUOTE FEED ALREADY PRICED IS LEFT ALONE. One scheme in this
 * book resolves an NSE symbol (the liquid ETF), and an intraday quote is
 * fresher than a NAV published for the previous business day. The two sets are
 * otherwise disjoint by construction.
 */
export function applyFundNavs(positions: Position[]): Position[] {
  return positions.map((p) => {
    if (p.live) return p;                       // an intraday quote wins
    const e = BY_KEY.get(p.securityKey);
    if (!e || !e.usableForValue) return p;      // no NAV, or not on this book's basis
    if (!(e.nav > 0) || !(p.quantity > 0)) return p;

    const marketValue = p.quantity * e.nav;
    // `costBasis` is NULL where the statement reported none — a depository
    // prints a value and no cost. Null, not zero: `marketValue − 0` would book
    // the whole position as profit at an infinite return. Identical to the
    // quote overlay's rule, because it is the same rule.
    const cost = p.costBasis;
    const costNA = !!p.costUnavailable || !(typeof cost === "number" && cost > 0);
    const unrealizedPnL = costNA ? p.unrealizedPnL : marketValue - (cost as number);
    return {
      ...p,
      currentPrice: e.nav,
      marketValue,
      unrealizedPnL,
      returnPct: costNA || unrealizedPnL === null ? p.returnPct : (unrealizedPnL / (cost as number)) * 100,
      navPriced: true,
      navDate: e.date,
      // INTRADAY FIELDS UNTOUCHED — see the header. A NAV is not a day move.
    };
  });
}

/** ISIN → the published record. Several book keys can share one ISIN (Helios is
 * carried under two); they share one NAV, and a usable entry is preferred. */
const BY_ISIN = (() => {
  const m = new Map<string, FundNav>();
  for (const e of BOOK_FUND_NAVS) {
    const k = e.isin.trim().toUpperCase();
    const cur = m.get(k);
    if (!cur || (!cur.usableForValue && e.usableForValue)) m.set(k, e);
  }
  return m;
})();

/**
 * IS THIS AN ARBITRAGE FUND — by AMFI's own SEBI category against the ISIN,
 * never by the name. Used where arbitrage has to be told apart from the rest of
 * the cash: an arbitrage fund's disclosed long equity is HEDGED by short
 * futures, so looking through it would print stock exposure the family does
 * not carry, where a liquid fund's paper is real, unhedged credit exposure.
 */
export function isArbitrageFund(p: Pick<Position, "securityKey"> & { isin?: string | null }): boolean {
  const e = BY_KEY.get(p.securityKey) ?? (p.isin ? BY_ISIN.get(p.isin.trim().toUpperCase()) : undefined);
  return e?.sebiCategory === "Arbitrage Fund";
}

/**
 * ── THE ONE SWITCH ──────────────────────────────────────────────────────────
 *
 * Whether the dashboard values a depository's own closing units for the
 * family's cash-equivalent funds (below). It adds real holdings to the live
 * book — about ₹64 Cr on this drop — so it is one constant, and `false` takes
 * every one of them out of every page at once.
 */
export const VALUE_DEPOSITORY_CASH_UNITS = true;

/** `Direct Plan` → `Direct`; an option is named only where it is not Growth. */
function labelFromAmfi(e: FundNav): string {
  const name = e.scheme.replace(/[\s-]+$/, "").trim();
  const plan = /direct/i.test(e.plan) ? "Direct" : /regular/i.test(e.plan) ? "Regular" : null;
  const option = !e.option || /growth|cumulative/i.test(e.option) ? null : e.option.trim();
  return composeSchemeLabel({
    name, plan, option, amc: null, isin: e.isin, schemecode: e.schemecode,
    amfiName: e.scheme, printed: null, joinedBy: "isin",
  });
}

/**
 * ── THE FAMILY'S CASH THAT NO HOLDING STATEMENT REPORTS ────────────────────
 *
 *   "Whenever, wherever we have cash as a line item, we need to show arbitrage
 *    funds inside it."
 *
 * Every arbitrage fund this family holds is on ONE account — Ajay's main demat
 * 1201090012539150 — and that account sent a TRANSACTION statement and no
 * holding statement. So the book carries its closing balances as dated units
 * (`BOOK_SHARE_MOVEMENTS`) and not one position, and the funds the family asked
 * to see inside Cash were on no page at all. Classifying them as Cash, alone,
 * would have moved nothing a reader could see.
 *
 * WHAT MAKES THIS A VALUATION RATHER THAN A GUESS is that both halves are
 * primitives from the institution that owns them:
 *
 *   UNITS  the depository's own closing balance — and the book publishes a
 *          block only where its dated rows walk from the printed opening balance
 *          to the printed closing one (`reason` null), so a misread row cannot
 *          reach here.
 *   PRICE  AMFI's published NAV for the same ISIN, the price source every fund
 *          on this dashboard is already valued at (§6 — it may set a market
 *          value and nothing else).
 *
 * And the two are on one basis. The share-count break the NAV builder guards
 * against is an ETF's; an open-ended mutual fund's units do not split, and
 * `build-fund-navs` refuses a depository-only ETF with no mark. Where the family's
 * own review saw the same holding it agrees: its transaction rows record the
 * 16,308,407.445 Motilal Oswal Arbitrage units the depository credited on 21 May
 * 2026, priced at a NAV of 11.0367 — AMFI's 22 Sep NAV of 11.2834 is that fund
 * four months on.
 *
 * FIVE GATES, each a reason a balance must NOT become a holding:
 *
 *   1. the account is `transactionsOnly` — it sent no holding statement. An
 *      account that did has had every depository row it does not carry dropped
 *      ON PURPOSE (a fund reporting its own units, a row with no mark), and
 *      valuing those would reverse a decision the book made and recorded;
 *   2. the block reconciled, and something is left at the close;
 *   3. AMFI publishes a NAV for the ISIN that may value a holding;
 *   4. the family's cash rule admits it (`isCashEquivalent`) — this is the
 *      family's CASH, and only their cash, because that is what they asked to
 *      see. The account's other funds and shares are not valued here;
 *   5. no position the book carries holds the SAME units of the same ISIN,
 *      which is `dropDepositoryDuplicates`' own test: an exact unit match is
 *      one holding reported twice, never two holdings.
 *
 * A SCHEME THE BOOK ALREADY CARRIES KEEPS ITS KEY, so a liquid fund held on
 * three demats is one row, not two spellings; otherwise the depository's own
 * key stands. The label is AMFI's published name for the ISIN.
 *
 * LIVE ONLY. These have no statement mark at all, so they are never in
 * `statementPortfolio` — a page that ties to the PDFs does not see them, and a
 * page that shows one names where its units came from.
 */
export function depositoryCashHoldings(
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
): Position[] {
  if (!VALUE_DEPOSITORY_CASH_UNITS) return [];
  const txOnly = new Set(accounts.filter((a) => a.transactionsOnly === true).map((a) => a.accountId));
  const withPositions = new Set(positions.map((p) => p.accountId));
  const bookByIsin = new Map<string, Position>();
  for (const p of positions) {
    const k = p.isin?.trim().toUpperCase();
    if (k && !bookByIsin.has(k)) bookByIsin.set(k, p);
  }
  const out: Position[] = [];
  for (const w of Object.values(movements)) {
    if (!txOnly.has(w.accountId) || withPositions.has(w.accountId)) continue;         // gate 1
    if (w.reason != null || !(typeof w.closing === "number" && w.closing > 0)) continue; // gate 2
    const isin = w.isin?.trim().toUpperCase();
    if (!isin) continue;
    const nav = BY_ISIN.get(isin);
    if (!nav || !nav.usableForValue || !(nav.nav > 0)) continue;                      // gate 3
    const book = bookByIsin.get(isin);
    const securityKey = book?.securityKey ?? w.securityKey;
    if (!isCashEquivalent({ securityKey })) continue;                                 // gate 4
    const closing = w.closing;
    if (positions.some((p) => p.isin?.trim().toUpperCase() === isin
      && Math.abs(p.quantity - closing) < 0.0005)) continue;                         // gate 5
    const printed = book?.security ?? w.security ?? securityKey;
    out.push({
      securityKey,
      security: book || schemeNameFor(securityKey) ? holdingLabel(securityKey, printed) : labelFromAmfi(nav),
      isin: w.isin,
      symbol: book?.symbol ?? null,
      accountId: w.accountId,
      memberId: null,
      sector: book?.sector ?? "Unclassified",
      providerSector: null,
      // What the instrument IS: an ETF where AMFI files it as one, otherwise
      // the class the book already records for this ISIN, otherwise a mutual
      // fund. AMFI decides the ETF question because the book does not answer it
      // once — Liquid BeES is `ETF` on three demat statements and `Mutual Fund`
      // on the broker's, and this row sits in a demat.
      assetClass: /\bETFs?\b/i.test(nav.category ?? "") ? "ETF" : (book?.assetClass ?? "Mutual Fund"),
      marketSide: "listed",
      quantity: closing,
      marketValue: closing * nav.nav,
      // A depository holds units and did not buy them: NO cost, never zero.
      costBasis: null,
      costUnavailable: true,
      unrealizedPnL: null,
      returnPct: null,
      avgCost: null,
      currentPrice: nav.nav,
      stCostBasis: null,
      ltCostBasis: null,
      daysToLT: null,
      heldSince: null,
      dividendReceived: null,
      accruedIncome: null,
      positionIrrPct: null,
      navPriced: true,
      navDate: nav.date,
      depositoryUnits: { asOf: w.periodTo ?? null, source: w.source ?? null },
    });
  }
  return out.sort((a, b) => b.marketValue - a.marketValue);
}

/**
 * THE SENTENCE AN ACCOUNT CARRIES ONCE SOME OF ITS HOLDINGS ARE VALUED THIS WAY.
 *
 * `noPositionsReason` says "nothing here can be valued", which stops being true
 * on the live basis the moment one of these rows exists — and a figure for SOME
 * of an account's holdings must name the rest. So the live copy of the account
 * carries this instead: what is valued, from what, and how many holdings on the
 * same statement are not.
 */
export function partialValuationNotes(
  valued: readonly Position[],
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
): Map<string, string> {
  const by = new Map<string, Position[]>();
  for (const p of valued) {
    const list = by.get(p.accountId) ?? [];
    list.push(p);
    by.set(p.accountId, list);
  }
  const notes = new Map<string, string>();
  for (const [accountId, rows] of by) {
    const held = Object.values(movements).filter((w) => w.accountId === accountId
      && typeof w.closing === "number" && w.closing > 0).length;
    const rest = Math.max(0, held - rows.length);
    const asOf = rows.map((r) => r.depositoryUnits?.asOf).filter(Boolean).sort().pop() ?? "its statement date";
    const navDate = rows.map((r) => r.navDate).filter(Boolean).sort().pop() ?? "its publication date";
    notes.set(accountId,
      `this account sent a transaction statement and no holding statement. Its ${rows.length} cash-equivalent fund${rows.length === 1 ? "" : "s"} — the liquid and arbitrage funds the family counts as cash — ${rows.length === 1 ? "is" : "are"} valued at the depository's own closing units (${asOf}) × AMFI's published NAV (${navDate}); ${rest === 0 ? "nothing else on that statement is held" : `its other ${rest} holding${rest === 1 ? "" : "s"} on that statement carr${rest === 1 ? "ies" : "y"} no rate and ${rest === 1 ? "is" : "are"} not valued on this account`}. What would value all of it is the account's own holding statement from its custodian`);
  }
  return notes;
}
