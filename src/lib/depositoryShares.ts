// THE LISTED SHARES A DEPOSITORY REPORTS ON AN ACCOUNT THAT SENT NO HOLDING
// STATEMENT (Stage 10cx) — the share half of `depositoryFundHoldings`.
//
// Ajay's main Motilal Oswal demat sent a TRANSACTION statement and no holding
// statement, so the book carries no position for it. Its closing balances are
// on that statement all the same — IFB Industries 15,772, Onesource 43,000,
// Vedanta Aluminium Metal 2,81,000 and more — and the family asked for every
// figure their statements give them to be on the screen. A fund there is valued
// at AMFI's published NAV (`fundNavs.ts`); a listed share has no NAV, and its
// price is the market's, so it is valued at THE LIVE QUOTE and nothing else.
//
// ── ONLY WHILE THE QUOTE FEED PRICES IT ─────────────────────────────────────
//
// The statement prints no rate, and no other statement marks these units, so
// there is no statement price to fall back to. A share the feed did not price
// is NOT a row: `depositoryShareHoldings` drops it rather than carry a
// placeholder, and the account's note names it among the balances nothing
// values. So these rows are LIVE-only in the strictest sense — they never
// reach `statementPortfolio`, and never stand in the live book at a guessed
// price.
//
// ── WHICH SHARE THIS IS: THE ISIN, NEVER A NAME ─────────────────────────────
//
// The depository prints the ISIN. The NSE symbol comes from a book position of
// the same ISIN where one exists, else from Upstox's own instrument for that
// ISIN (`NSE_EQ|<ISIN>`, which the quote feed must echo back). The row takes
// the book's key for that symbol where exactly one book key carries it, so a
// company held here and in a mandate is one company on every screen.
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS } from "@/data/glowData";
import { applyQuotes, symbolFor, type QuoteFeed } from "./quotes";
import { securityLabel } from "./securityLabel";
import type { Account, Position, ShareMovement } from "./types";
import { UPSTOX_INSTRUMENTS } from "../../shared/upstoxInstruments.mjs";

/**
 * THE ONE SWITCH. `false` takes every quoted depository share out of every page
 * at once, and the account's note names them as not valued again.
 */
export const VALUE_DEPOSITORY_SHARE_UNITS = true;

/** ISIN → NSE symbol, off Upstox's own instrument keys. */
const SYMBOL_BY_ISIN: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [sym, v] of Object.entries(UPSTOX_INSTRUMENTS)) {
    const isin = v.key.split("|")[1]?.trim().toUpperCase();
    if (isin && v.key.startsWith("NSE_EQ|")) m.set(isin, sym);
  }
  return m;
})();

/**
 * The shares a transaction-only account closes above nil, as rows with NO
 * price yet. Five gates, the fund rows' own with the price question changed:
 *   1. the account sent a transaction statement and no holding statement, and
 *      carries no position of its own;
 *   2. the block walked to its printed closing, with shares left;
 *   3. an EQUITY ISIN (`INE…`) — a fund unit is the fund half's;
 *   4. an NSE symbol resolves for that ISIN, off a book position of the same
 *      ISIN or Upstox's own instrument — never off a name;
 *   5. no book position holds the same ISIN at the same units, which would be
 *      one holding reported twice.
 */
export function depositoryShareCandidates(
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
): Position[] {
  if (!VALUE_DEPOSITORY_SHARE_UNITS) return [];
  const txOnly = new Set(accounts.filter((a) => a.transactionsOnly === true).map((a) => a.accountId));
  const withPositions = new Set(positions.map((p) => p.accountId));
  const isinOf = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;
  const out: Position[] = [];
  for (const w of Object.values(movements)) {
    if (!txOnly.has(w.accountId) || withPositions.has(w.accountId)) continue;          // gate 1
    if (w.reason != null || !(typeof w.closing === "number" && w.closing > 0)) continue; // gate 2
    const isin = isinOf(w);
    if (!isin || !isin.startsWith("INE")) continue;                                    // gate 3
    const sameIsin = positions.filter((p) => isinOf(p) === isin);
    const symbol = sameIsin.map((p) => symbolFor(p)).find(Boolean) ?? SYMBOL_BY_ISIN.get(isin) ?? null;
    if (!symbol) continue;                                                             // gate 4
    const closing = w.closing;
    if (sameIsin.some((p) => Math.abs(p.quantity - closing) < 0.0005)) continue;       // gate 5
    // The book's key for this company: the one carrying this ISIN, else the one
    // carrying this symbol, and only where exactly one does.
    const keysBySymbol = [...new Set(positions.filter((p) => symbolFor(p) === symbol).map((p) => p.securityKey))];
    const book = sameIsin[0] ?? (keysBySymbol.length === 1 ? positions.find((p) => p.securityKey === keysBySymbol[0]) : undefined);
    const securityKey = book?.securityKey ?? w.securityKey;
    out.push({
      securityKey,
      security: securityLabel(securityKey, book?.security ?? w.security ?? securityKey),
      isin: w.isin,
      symbol,
      accountId: w.accountId,
      memberId: null,
      sector: book?.sector ?? "Unclassified",
      providerSector: null,
      assetClass: "Equity",
      marketSide: "listed",
      quantity: closing,
      // No price until the feed answers — and a row the feed does not price is
      // dropped by `depositoryShareHoldings`, never shown at this zero.
      marketValue: 0,
      // A depository holds shares and did not buy them: NO cost, never zero.
      costBasis: null,
      costUnavailable: true,
      unrealizedPnL: null,
      returnPct: null,
      avgCost: null,
      currentPrice: null,
      stCostBasis: null,
      ltCostBasis: null,
      daysToLT: null,
      heldSince: null,
      dividendReceived: null,
      accruedIncome: null,
      positionIrrPct: null,
      depositoryUnits: { asOf: w.periodTo ?? null, source: w.source ?? null },
    });
  }
  return out;
}

const CANDIDATES = depositoryShareCandidates();

/** The symbols the quote feed must be asked about for these shares. */
export const depositoryShareSymbols = (): string[] =>
  [...new Set(CANDIDATES.map((p) => p.symbol).filter((s): s is string => !!s))];

/**
 * The candidates the feed priced, at the live quote — and ONLY those. A share
 * the feed did not price is not a row at a guessed or zero price.
 */
export function depositoryShareHoldings(feed: QuoteFeed | null, candidates: readonly Position[] = CANDIDATES): Position[] {
  return applyQuotes([...candidates], feed).filter((p) => p.live === true && p.marketValue > 0);
}
