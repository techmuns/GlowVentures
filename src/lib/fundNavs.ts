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
import type { Position } from "./types";
import { fifoReturnPct } from "../../shared/fifo.mjs";

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
      // FIFO's one return: a live price moves the unrealised half and nothing
      // else, so the realised gain on units already sold stays in it (§6).
      returnPct: costNA || unrealizedPnL === null ? p.returnPct
        : fifoReturnPct(marketValue, cost as number, p.realizedPnL, p.costOfUnitsSold),
      navPriced: true,
      navDate: e.date,
      // INTRADAY FIELDS UNTOUCHED — see the header. A NAV is not a day move.
    };
  });
}
