// THE LISTED SHARES A DEPOSITORY REPORTS ON AN ACCOUNT THAT SENT NO HOLDING
// STATEMENT (Stage 10cy) — the share half of `depositoryFundHoldings`.
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
// ── AND ONLY WHERE NO SPLIT OR BONUS SINCE THE STATEMENT IS UNACCOUNTED FOR ─
//
// A balance counted on 31 July and a price quoted in September are two dates,
// and a split or bonus between them makes the pair a wrong figure — a
// pre-split count at a post-split price. The statement's own positions have
// always gone through the corporate-action gate for exactly that
// (`applyCorporateActionQuotes`), and so do these rows now: a share the capture
// shows a split or bonus for is valued on the projected units where the chain
// is clean, and is NOT a row where it is not. Before Stage 10cz the
// transaction-only account's shares took the quote directly — a gap the three
// Motilal holding statements' shares would have widened once they joined this
// path.
//
// ── WHICH SHARE THIS IS: THE ISIN, NEVER A NAME ─────────────────────────────
//
// The depository prints the ISIN. The NSE symbol comes from a book position of
// the same ISIN where one exists, else from Upstox's own instrument for that
// ISIN (`NSE_EQ|<ISIN>`, which the quote feed must echo back). The row takes
// the book's key for that symbol where exactly one book key carries it, so a
// company held here and in a mandate is one company on every screen.
//
// ── AND THE SHARES A HOLDING STATEMENT RECORDS WITH NO USABLE PRICE ─────────
//
// The same question arrives from a second direction. Two holding statements
// record a LISTED share and print no price this book may use: Ankita's Motilal
// Oswal demat prints Clean Max Enviro Energy at a rate of 0.000, and Ajay's
// ICICI NSDL statement records ESDS Software Solution at the face value it was
// allotted at, which is not a mark (§"the value column is a mark on 14 rows and
// par on 24"). Each carries a quantity and no value, and each is now an NSE
// listing by its own ISIN — so the live quote values it on the same terms as
// the shares above: only while the feed prices it, never at a guessed price,
// and never in `statementPortfolio`. Its `depositoryUnits.kind` is `no-price`,
// because its account DID send a holding statement and the sentence a page
// shows must say so.
//
// EXCEPT WHERE THE FAMILY HAVE DECIDED OTHERWISE. Ankita's 94,967 Clean Max
// shares sit in her statement's lock-in + freeze balance, and on 28 Sep 2026
// the family answered *"keep them unvalued for now"* (Stage 10cx,
// `shared/keptUnvalued.mjs`). The book's reason for that row names the
// decision, and this layer reads the SAME table, so no quote values the row
// either — a price from any source, not only the ICICI statement's mark the
// question was asked about. ESDS, which no decision names, is still valued.
// REVERSED 14 Oct 2026 (Stage 10dz, "include this in the dashboard data as
// well"): the table is empty, so Ankita's Clean Max is valued again. Gate 6
// stays for the next decision.
//
// ── AND EVERY SHARE THE THREE MOTILAL HOLDING STATEMENTS RECORD (Stage 10cz) ─
//
// Those statements print a `Rs RATE` and a `Rs VALUE` beside most holdings, and
// both are the holding's LAST DEPOSITORY MOVEMENT — its price and that price
// times the movement's own quantity — never a valuation of the balance. So the
// book carries every one of those shares as a quantity (`BOOK_UNVALUED_HOLDINGS`,
// with the movement's price as `lastMovementRate`), and they come here on the
// same terms as the no-price shares above: the live quote, only while the feed
// prices it. Their kind is `last-movement`, because the statement DID print a
// price against them and a page must say what that price was rather than that
// there was none. The movement's price is never the price a row is valued at.
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS, BOOK_SHARE_ROLLS, BOOK_UNVALUED_HOLDINGS, BOOK_RECOVERED_COSTS } from "@/data/glowData";
import { applyRecoveredCost } from "../../shared/recoveredCosts.mjs";
import { symbolFor, symbolForKey, type QuoteFeed } from "./quotes";
import { applyCorporateActionQuotes, type ActionFeed } from "./corporateActions";
import { securityLabel } from "./securityLabel";
import { securityKeyOf } from "./securityKey";
import { displayDepositoryName } from "./format";
import type { Account, Position, ShareMovement, ShareRoll, UnvaluedStatementHolding } from "./types";
import { UPSTOX_INSTRUMENTS } from "../../shared/upstoxInstruments.mjs";
import { keptUnvaluedFor } from "../../shared/keptUnvalued.mjs";

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

const isinOf = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;

/**
 * THE NSE SYMBOL FOR AN ISIN, BY IDENTIFIER AND NEVER BY NAME. Three tiers, and
 * where two answer they must agree — a disagreement yields NO symbol, the rule
 * `build-symbols` applies to its own ISIN tier:
 *   1. a book position carrying the same ISIN (the symbol the quote feed
 *      already prices that company by);
 *   2. the committed bridge for the record's own key (`nseSymbols.json`, which
 *      `build-symbols` resolves ISIN-first against NSE's own masters);
 *   3. Upstox's own instrument for the ISIN (`NSE_EQ|<ISIN>`).
 * Measured on this book, no candidate has two tiers that disagree.
 */
function symbolByIdentifier(isin: string, securityKey: string, positions: readonly Position[]): string | null {
  const answers = new Set<string>();
  const fromBook = positions.filter((p) => isinOf(p) === isin).map((p) => symbolFor(p)).find(Boolean);
  if (fromBook) answers.add(fromBook);
  const fromKey = symbolForKey(securityKey);
  if (fromKey) answers.add(fromKey);
  const fromUpstox = SYMBOL_BY_ISIN.get(isin);
  if (fromUpstox) answers.add(fromUpstox);
  return answers.size === 1 ? [...answers][0] : null;
}

/** The book's key for a company: the one carrying this ISIN, else the one carrying this symbol, and only where exactly one does. */
function bookRowFor(isin: string, symbol: string, positions: readonly Position[]): Position | undefined {
  const sameIsin = positions.find((p) => isinOf(p) === isin);
  if (sameIsin) return sameIsin;
  const keysBySymbol = [...new Set(positions.filter((p) => symbolFor(p) === symbol).map((p) => p.securityKey))];
  return keysBySymbol.length === 1 ? positions.find((p) => p.securityKey === keysBySymbol[0]) : undefined;
}

/**
 * THE BOOK'S KEY FOR A SHARE A RECORDED LINE NAMES: by its ISIN first, else by
 * the NSE symbol its ISIN resolves where exactly one book key carries it. The
 * same `bookRowFor` the live candidates file a priced line under, so a line
 * shown as "recorded, not valued" and the same line once the feed prices it
 * stand under one company. Null where the book holds no such company.
 */
export function bookKeyForShare(
  isin: string,
  securityKey: string,
  positions: readonly Position[] = BOOK_POSITIONS,
): string | null {
  const sameIsin = positions.find((p) => isinOf(p) === isin);
  if (sameIsin) return sameIsin.securityKey;
  const symbol = symbolByIdentifier(isin, securityKey, positions);
  return symbol ? bookRowFor(isin, symbol, positions)?.securityKey ?? null : null;
}

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
  const out: Position[] = [];
  for (const w of Object.values(movements)) {
    if (!txOnly.has(w.accountId) || withPositions.has(w.accountId)) continue;          // gate 1
    if (w.reason != null || !(typeof w.closing === "number" && w.closing > 0)) continue; // gate 2
    const isin = isinOf(w);
    if (!isin || !isin.startsWith("INE")) continue;                                    // gate 3
    const symbol = symbolByIdentifier(isin, w.securityKey, positions);
    if (!symbol) continue;                                                             // gate 4
    const closing = w.closing;
    // A line with no unit count (the review's, Stage 10dh) cannot be the same units.
    if (positions.some((p) => isinOf(p) === isin && p.quantity !== null && Math.abs(p.quantity - closing) < 0.0005)) continue; // gate 5
    const book = bookRowFor(isin, symbol, positions);
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

/**
 * The listed shares a HOLDING statement records with no usable price — no rate,
 * only the face value they were allotted at, or only the price of the holding's
 * last depository movement (the Motilal Oswal statements, Stage 10cz) — as rows
 * with NO price yet. Six gates:
 *   1. an EQUITY line of `BOOK_UNVALUED_HOLDINGS` with an `INE…` ISIN and
 *      units — the statement's own record that the account holds it;
 *   2. not the depository's copy of units another statement reports
 *      (`sameUnitsReportedBy`);
 *   3. its own account carries no position of that ISIN already;
 *   4. no account of the SAME OWNER carries the same ISIN at the same units —
 *      one holding caught on two statements mid-transfer reads exactly like
 *      that, and must not be counted twice;
 *   5. an NSE symbol resolves for the ISIN, by identifier (`symbolByIdentifier`).
 *   6. the family have not decided to keep it unvalued (`shared/keptUnvalued.mjs`,
 *      read on the row's own account and ISIN, the key `build-book` reads it on).
 *
 * CLEAN MAX IS THE CASE GATE 4 WAS WRITTEN AROUND. Ajay's ICICI NSDL statement
 * carries 94,967 shares of it and Ankita's Motilal Oswal statement another
 * 94,967, at a rate of 0.000. Same ISIN and same count, so it had to be settled
 * whether these are one holding or two — and the family's own review carries
 * 1,89,934 across "ICICI Bank / MOPWM", exactly twice 94,967. Two owners, two
 * statements, two holdings; a transfer between two accounts of ONE owner would
 * be refused. Gate 4 lets Ankita's through, and gate 6 then stops it: the family
 * decided on 28 Sep 2026 to keep those shares unvalued — reversed on 14 Oct
 * 2026 (Stage 10dz), so on this book gate 6 refuses nothing and Ankita's row is
 * a candidate.
 */
export function unpricedStatementShareCandidates(
  unvalued: readonly UnvaluedStatementHolding[] = BOOK_UNVALUED_HOLDINGS,
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
): Position[] {
  if (!VALUE_DEPOSITORY_SHARE_UNITS) return [];
  const ownerOf = new Map(accounts.map((a) => [a.accountId, a.ownerId ?? a.owner]));
  const accountById = new Map(accounts.map((a) => [a.accountId, a]));
  const out: Position[] = [];
  for (const u of unvalued) {
    const isin = isinOf(u);
    const qty = u.quantity;
    if (u.assetClass !== "Equity" || !isin || !isin.startsWith("INE")
      || !(typeof qty === "number" && qty > 0)) continue;                                   // gate 1
    if (u.sameUnitsReportedBy) continue;                                                     // gate 2
    if (positions.some((p) => p.accountId === u.accountId && isinOf(p) === isin)) continue;  // gate 3
    const owner = ownerOf.get(u.accountId) ?? u.ownerId;
    if (positions.some((p) => isinOf(p) === isin && p.quantity !== null && Math.abs(p.quantity - qty) < 0.0005
      && (ownerOf.get(p.accountId) ?? null) === owner)) continue;                            // gate 4
    const symbol = symbolByIdentifier(isin, u.securityKey, positions);
    if (!symbol) continue;                                                                   // gate 5
    const acc = accountById.get(u.accountId);
    if (acc && keptUnvaluedFor({ provider: acc.provider, accountNo: acc.accountNo, isin })) continue;  // gate 6
    const book = bookRowFor(isin, symbol, positions);
    const securityKey = book?.securityKey ?? u.securityKey;
    out.push({
      securityKey,
      // The book's own name for the company where it holds it; otherwise the
      // statement's, with the depository's `- EQ NEW FV …` furniture off.
      security: securityLabel(securityKey, book?.security ?? displayDepositoryName(u.security)),
      statementRecord: u.statementRecord,
      isin: u.isin,
      symbol,
      accountId: u.accountId,
      memberId: null,
      sector: book?.sector ?? "Unclassified",
      providerSector: null,
      assetClass: "Equity",
      marketSide: "listed",
      quantity: qty,
      marketValue: 0,
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
      // WHAT THE STATEMENT PRINTED BESIDE IT, said exactly. A last-movement
      // price is a price the statement DID print — of a movement, not of the
      // balance — and a page must say so rather than that it printed none.
      depositoryUnits: typeof u.lastMovementRate === "number" && u.lastMovementRate > 0
        ? {
          asOf: u.asOf, source: u.statementRecord?.document ?? null, kind: "last-movement",
          lastMovementRate: u.lastMovementRate, lastMovementDate: u.lastMovementDate ?? null,
          lastMovementSide: u.lastMovementSide ?? null,
        }
        : { asOf: u.asOf, source: u.statementRecord?.document ?? null, kind: "no-price" },
    });
  }
  return out;
}

/**
 * THE TWO ROUTES AS ONE LIST, EACH HOLDING ONCE. Each route refuses a share the
 * BOOK already carries at the same units under the same owner; neither could
 * see the other. A holding caught mid-transfer between two accounts of one
 * owner — a closing balance on the transaction-only demat, and the same units
 * recorded on a holding statement — would be two candidates and, once priced,
 * the same shares counted twice. The first is kept. Measured on this book it
 * drops nothing, which is exactly when a double count is invisible.
 */
export function combinedShareCandidates(
  lists: readonly (readonly Position[])[],
  accounts: readonly Account[] = BOOK_ACCOUNTS,
): Position[] {
  const ownerOf = new Map(accounts.map((a) => [a.accountId, a.ownerId ?? a.owner]));
  const kept: Position[] = [];
  for (const p of lists.flat()) {
    const owner = ownerOf.get(p.accountId) ?? null;
    const isin = isinOf(p);
    if (kept.some((k) => isinOf(k) === isin && k.quantity !== null && p.quantity !== null
      && Math.abs(k.quantity - p.quantity) < 0.0005
      && (ownerOf.get(k.accountId) ?? null) === owner)) continue;
    kept.push(p);
  }
  return kept;
}

/**
 * …CARRIED PAST THE STATEMENT ON THE ADVISER'S RECORD OF EXCHANGE TRADES
 * (Stage 10iw). *"Apply share trades only"* — the family, 28 Oct 2026, of
 * MOPWM's transaction report of 23 Oct. `BOOK_SHARE_ROLLS` holds each Motilal
 * demat share balance the report's NSE/BSE trades carry, only where its own
 * record replays to the statement's units on the statement's date. A candidate
 * of those units takes the roll as `rolledForward`, which the corporate-action
 * gate marks at the rolled units (`rolledPosition`); one the report sold to
 * nil is not held, so it is no candidate at all. A share the statement does
 * not record and the report shows bought after it is a candidate of its own
 * (`adviser-trades`), on gates 3–5 of the depository route: an equity ISIN,
 * an NSE symbol by identifier, and no other statement of the same owner
 * holding the same units. Live basis only; the statement basis keeps the
 * snapshot.
 */
export function withShareRolls(
  candidates: readonly Position[],
  rolls: readonly ShareRoll[] = BOOK_SHARE_ROLLS,
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
): Position[] {
  const ownerOf = new Map(accounts.map((a) => [a.accountId, a.ownerId ?? a.owner]));
  const tie = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  const rolled = (p: Position, r: ShareRoll): Position => ({
    ...p,
    ...(r.quantity > 0 ? { costUnavailable: false } : {}),
    rolledForward: { through: r.through, quantity: r.quantity, costBasis: r.costBasis, realizedPnL: r.realizedPnL,
      costOfUnitsSold: r.costOfUnitsSold, trades: r.trades, source: "adviser-report" },
    depositoryUnits: { ...(p.depositoryUnits ?? { asOf: r.asOf, source: null }),
      rolled: { statementQuantity: r.statementQuantity, through: r.through, trades: r.trades, reportAsOf: r.report.asOf } },
  });
  const used = new Set<ShareRoll>();
  const out: Position[] = [];
  for (const p of candidates) {
    const r = rolls.find((x) => x.accountId === p.accountId && x.isin.toUpperCase() === isinOf(p)
      && typeof p.quantity === "number" && tie(x.statementQuantity, p.quantity));
    if (!r) { out.push(p); continue; }
    used.add(r);
    if (r.quantity > 0) out.push(rolled(p, r));
  }
  for (const r of rolls) {
    if (used.has(r) || r.statementQuantity !== 0 || !(r.quantity > 0)) continue;
    const isin = r.isin.toUpperCase();
    if (!isin.startsWith("INE")) continue;                                              // gate 3
    const key = securityKeyOf(r.security);
    const symbol = symbolByIdentifier(isin, key, positions);
    if (!symbol) continue;                                                              // gate 4
    const owner = ownerOf.get(r.accountId);
    if (positions.some((p) => isinOf(p) === isin && p.quantity !== null && tie(p.quantity, r.quantity)
      && (ownerOf.get(p.accountId) ?? null) === owner)) continue;                       // gate 5
    const book = bookRowFor(isin, symbol, positions);
    const securityKey = book?.securityKey ?? key;
    out.push(rolled({
      securityKey,
      security: securityLabel(securityKey, book?.security ?? r.security),
      isin: r.isin,
      symbol,
      accountId: r.accountId,
      memberId: null,
      sector: book?.sector ?? "Unclassified",
      providerSector: null,
      assetClass: "Equity",
      marketSide: "listed",
      // The statement holds none: the units are the roll's, and the row is
      // priced only once the feed answers (`depositoryShareHoldings`).
      quantity: 0,
      marketValue: 0,
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
      depositoryUnits: { asOf: r.asOf, source: r.report.path, kind: "adviser-trades" },
    }, r));
  }
  return out;
}

const CANDIDATES = withShareRolls(combinedShareCandidates([depositoryShareCandidates(), unpricedStatementShareCandidates()])
  .map((p) => applyRecoveredCost(p, BOOK_RECOVERED_COSTS)));

/** Every share either route could value, priced or not — for a page naming what is not valued. */
export const shareCandidates = (): readonly Position[] => CANDIDATES;

/** The symbols the quote feed must be asked about for these shares. */
export const depositoryShareSymbols = (): string[] =>
  [...new Set(CANDIDATES.map((p) => p.symbol).filter((s): s is string => !!s))];

/**
 * The ISINs the corporate-action capture must be asked about for these shares —
 * the capture is filtered to what is asked for, and a share outside it cannot
 * pass the gate (`Security outside the saved feed's coverage`).
 */
export const depositoryShareIsins = (): string[] =>
  [...new Set(CANDIDATES.map((p) => isinOf(p)).filter((s): s is string => !!s))];

/**
 * The candidates the feed priced, at the live quote — and ONLY those. A share
 * the feed did not price is not a row at a guessed or zero price.
 *
 * THROUGH THE CORPORATE-ACTION GATE, like every statement share: a split or
 * bonus since the balance was counted is projected where its chain is clean,
 * and where it is not — or where no capture has answered yet — the share is
 * not a row. The gate's per-holding RETURNS are not kept: a period return is
 * struck against the statement's own valuation of the holding, and no
 * statement values these.
 */
export function depositoryShareHoldings(
  feed: QuoteFeed | null,
  actions: ActionFeed | null,
  candidates: readonly Position[] = CANDIDATES,
  accounts: readonly Account[] = BOOK_ACCOUNTS,
): Position[] {
  return applyCorporateActionQuotes([...candidates], [...accounts], feed, actions).positions
    .filter((p) => p.live === true && p.marketValue > 0);
}
