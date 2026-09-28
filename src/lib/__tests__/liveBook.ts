// THE BOOK THE PAGES READ, FOR A SUITE THAT CHECKS WHAT A PAGE DRAWS.
//
// Not a suite: `test-family.mjs` runs `*.test.ts` files by name, and this one is
// imported by them.
//
// `BOOK_POSITIONS` is the STATEMENT basis. Since Stage 10cy it no longer holds
// the 43 rows the three Motilal Oswal holding statements printed: their `Rate`
// and `Value` columns are the holding's LAST DEPOSITORY MOVEMENT, a transaction
// price and that price times the movement's own units, never a valuation of the
// balance. So the statement basis carries those balances as quantities and no
// value (`BOOK_UNVALUED_HOLDINGS`), and the LIVE basis values them:
//
//   • a mutual fund or an eligible ETF at AMFI's published NAV
//     (`unpricedStatementUnits`), the depository's own funds on the
//     transaction-only demat likewise (`depositoryFundHoldings`);
//   • a listed share at the live quote, and ONLY while the feed prices it
//     (`depositoryShareHoldings`), which a suite has no feed for.
//
// A suite that checks a figure a PAGE renders must check it against this book,
// because that is the book the page reads (`PortfolioContext`), and a suite that
// checks the statement basis must keep reading `BOOK_POSITIONS`. The two are
// different claims, and each suite says which it makes.
//
// This is the no-quote run of `PortfolioContext`'s own composition, not a second
// definition of it: the same three sources, through the same `applyFundNavs`,
// with `applyQuotes(…, null)` left out because it changes nothing but `live`.
// The corporate-action layer is left out for the same reason: with no quote it
// projects no share and moves no figure.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS, BOOK_SUMMARY } from "@/data/glowData";
import type { Position } from "@/lib/types";
import type { QuoteFeed } from "@/lib/quotes";
import type { ActionFeed } from "@/lib/corporateActions";
import { applyFundNavs, depositoryFundHoldings, unpricedStatementUnits } from "@/lib/fundNavs";
import { depositoryShareHoldings, shareCandidates } from "@/lib/depositoryShares";
import { labelledPositions } from "@/lib/securityLabel";

/** The live book as a page reads it with no quote feed: every row, as the statements' figures and the published NAVs value it. */
export const LIVE_POSITIONS: Position[] = applyFundNavs([
  ...BOOK_POSITIONS, ...depositoryFundHoldings(), ...unpricedStatementUnits(),
]);

/** The same book, named as every page names it (one name per key — `securityLabel`). */
export const LIVE_LABELLED: Position[] = applyFundNavs([
  ...labelledPositions(BOOK_POSITIONS), ...depositoryFundHoldings(), ...unpricedStatementUnits(),
]);

/**
 * WHAT THE LIVE BOOK IS WORTH, REACHED ON A SECOND PATH.
 *
 * A suite that partitions the live book must reconstruct a total nobody on its
 * own path produced, or it compares a figure with a sum of itself. This starts
 * from `BOOK_SUMMARY.totalValue` — `build-book`'s own figure for the statement
 * basis, each `dedupeGroup` counted once — and adds exactly two named steps:
 *
 *   1. the published NAV's move on the statement's own rows, row by row, each
 *      duplicated holding once (a NAV moves a fund, and a fund reported twice
 *      is one fund);
 *   2. the rows only the live basis carries — the depository's funds on the
 *      transaction-only demat and the units a holding statement prices nowhere
 *      — at the NAV they are valued at.
 *
 * No dedupe is needed on step 2: no live-only row carries a `dedupeGroup`, and
 * `unpricedStatementUnits`' gate 7 refuses a balance an owner's other statement
 * already reports at the same units.
 */
export function liveBookTotal(): number {
  const overlaid = applyFundNavs([...BOOK_POSITIONS]);
  const seen = new Set<string>();
  let navMove = 0;
  BOOK_POSITIONS.forEach((p, i) => {
    if (p.dedupeGroup) { if (seen.has(p.dedupeGroup)) return; seen.add(p.dedupeGroup); }
    navMove += overlaid[i].marketValue - p.marketValue;
  });
  const liveOnly = applyFundNavs([...depositoryFundHoldings(), ...unpricedStatementUnits()]);
  return BOOK_SUMMARY.totalValue + navMove + liveOnly.reduce((a, p) => a + p.marketValue, 0);
}

/** The live-only rows alone: what the statement basis leaves out and the live basis values. */
export const LIVE_ONLY: Position[] = applyFundNavs([...depositoryFundHoldings(), ...unpricedStatementUnits()]);

// ── WITH A QUOTE FEED ────────────────────────────────────────────────────────
//
// A listed share a Motilal holding statement records is a row ONLY while the
// quote feed prices it (`depositoryShareHoldings`) — and a suite has no feed.
// Some claims are about exactly those rows: ICICI Bank clubbing the family's
// own uncosted demat shares with Goldstandard's costed mandate lines is the
// case the average-cost fix exists for, and it is on screen only when the feed
// answers. So a suite checking it builds the book the page builds on a day the
// feed prices everything, from a STUB feed — the treatment `check:pages`'
// `installLiveMocks` gives the live layer, and never a figure on any screen.

/** The committed corporate-action capture: the gate a share must pass to be a row. */
export const CAPTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "public", "data", "corporate-actions.json"), "utf8"),
) as ActionFeed & { verifiedThrough?: string };

/**
 * A STUB FEED PRICING EVERY SHARE CANDIDATE, dated inside the capture's own
 * coverage so the corporate-action gate lets each one through. Each is priced
 * at the rate of its own last depository movement where the statement printed
 * one (a price that share really traded at), else at ₹100. No suite asserts on
 * a stubbed price: what is checked is which lines exist and how they are struck.
 */
export function stubShareFeed(candidates: readonly Position[] = shareCandidates()): QuoteFeed {
  const quotes: QuoteFeed["quotes"] = {};
  for (const c of candidates) {
    if (!c.symbol || quotes[c.symbol]) continue;
    const du = c.depositoryUnits;
    const price = du && du.kind === "last-movement" && typeof du.lastMovementRate === "number" && du.lastMovementRate > 0
      ? du.lastMovementRate : 100;
    quotes[c.symbol] = { price, prevClose: price / 1.01, open: null, dayLow: null, dayHigh: null, low52: null,
      high52: null, marketCap: null, volume: null, yearChangePct: null, ageS: 0, source: "upstox" };
  }
  const day = CAPTURE.verifiedThrough ?? "2026-09-23";
  return { quotes, asOf: `${day}T10:00:00Z`, missing: [], pending: [], fresh: Object.keys(quotes).length, stale: 0 } as QuoteFeed;
}

/** The candidates the stub feed makes rows — the shares a priced day adds to the page. */
export const PRICED_SHARES: Position[] = depositoryShareHoldings(stubShareFeed(), CAPTURE);

/** The live book on a day the feed prices every recorded share (statement rows keep their own marks). */
export const LIVE_PRICED: Position[] = applyFundNavs([
  ...BOOK_POSITIONS, ...depositoryFundHoldings(), ...unpricedStatementUnits(), ...PRICED_SHARES,
]);
