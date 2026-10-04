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
import { BOOK_ACCOUNTS, BOOK_CAPITAL_MOVES, BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { isCashEquivalent } from "./analytics";
import { composeSchemeLabel, holdingLabel, schemeNameFor } from "./schemeLabel";
import { securityLabel } from "./securityLabel";
import { symbolForKey } from "./quotes";
import type { Account, CapitalMove, Position, ShareMovement, UnvaluedStatementHolding } from "./types";
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
 * ── THE TWO SWITCHES ────────────────────────────────────────────────────────
 *
 * Whether the dashboard values a depository's own closing units (below): the
 * family's cash-equivalent funds (about ₹64 Cr on this drop), and every other
 * mutual-fund scheme on the same statement (about ₹85 Cr — Stage 10cy). Each
 * adds real holdings to the live book, so each is one constant, and `false`
 * takes its rows out of every page at once.
 */
export const VALUE_DEPOSITORY_CASH_UNITS = true;
export const VALUE_DEPOSITORY_FUND_UNITS = true;

/** AMFI files the scheme as an ETF — whose units can split, so a count and a NAV may not share a basis. */
const isEtfNav = (e: FundNav): boolean => /\bETFs?\b/i.test(e.category ?? "");

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
 *   4. it is a mutual-fund scheme and not an ETF — the family's cash (liquid
 *      and arbitrage funds, `isCashEquivalent`) under the first switch, every
 *      other scheme under the second. A share has no NAV (gate 3) and an ETF's
 *      units can split, so neither is valued here. Stage 10ce took only the
 *      cash; Stage 10cy took the rest, because the family asked for the data
 *      their statements carry to be on the screen;
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
export function depositoryFundHoldings(
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
): Position[] {
  if (!VALUE_DEPOSITORY_CASH_UNITS && !VALUE_DEPOSITORY_FUND_UNITS) return [];
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
    const admitted = isCashEquivalent({ securityKey })
      ? VALUE_DEPOSITORY_CASH_UNITS
      : VALUE_DEPOSITORY_FUND_UNITS && !isEtfNav(nav);
    if (!admitted) continue;                                                          // gate 4
    const closing = w.closing;
    if (positions.some((p) => p.isin?.trim().toUpperCase() === isin
      && Math.abs(p.quantity - closing) < 0.0005)) continue;                         // gate 5
    const printed = book?.security ?? w.security ?? securityKey;
    out.push({
      securityKey,
      // The book's ONE name for the key (#76's rule, `securityLabel`) where the
      // book carries it, so a liquid fund held on three demats and valued here
      // on a fourth is one option in a pick-list, not two spellings.
      security: book || schemeNameFor(securityKey) ? securityLabel(securityKey, printed) : labelFromAmfi(nav),
      isin: w.isin,
      // A liquid ETF the quote feed prices intraday keeps its symbol even where
      // no book position of it is left to lend one (Stage 10cz moved the Motilal
      // demats' Liquid BeES out of the positions).
      symbol: book?.symbol ?? symbolForKey(securityKey),
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
 * THE CASH HALF OF `depositoryFundHoldings` — the liquid and arbitrage funds the
 * family counts as cash. One function filtered, never a second walk, so the two
 * cannot disagree about which balance is which.
 */
export function depositoryCashHoldings(
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
): Position[] {
  return depositoryFundHoldings(accounts, positions, movements).filter((p) => isCashEquivalent(p));
}

/**
 * ── UNITS A HOLDING STATEMENT RECORDS AND VALUES NOWHERE (A-17, Stage 10cz)
 *
 * The Motilal Oswal CDSL holding statements print every holding's units, and
 * against most of them a `Rs RATE` and a `Rs VALUE` — which are the price of
 * the holding's LAST DEPOSITORY MOVEMENT and that price times the movement's own
 * quantity, never a valuation of the balance (Stage 10cz; the reader reads them
 * as `lastMovementRate`). So since that correction every fund those statements
 * carry is a quantity in the book (`BOOK_UNVALUED_HOLDINGS`) and no statement
 * values it: Ankita's Bandhan, Helios, ICICI and WhiteOak units, Bharat's and
 * Aarti's ABSL, HDFC and Kotak units, the Liquid BeES on all three. Before A-17
 * found them, ABSL Balanced Advantage on two of those demats was on no screen at
 * all for the same reason: a unit count with no price beside it.
 *
 * So the LIVE book values those units at AMFI's published NAV — the treatment
 * `depositoryFundHoldings` gives a depository's closing units — and only where
 * a WITNESS proves the units are on the NAV's basis. A unit count and a price
 * can be on different bases: the DSP Gold ETF's statement units are ten times
 * the ones its NAV prices. SEVEN GATES, each a reason a recorded balance must
 * NOT become a holding:
 *
 *   1. the row names an ISIN and units, and is a MUTUAL FUND or an ETF — an
 *      AIF's unit has no NAV AMFI publishes, and a share has no NAV at all;
 *   2. no fund's own statement reports the same units (`sameUnitsReportedBy`),
 *      which would count one holding twice;
 *   3. AMFI publishes a NAV for the ISIN that the builder cleared for value;
 *   4. THE WITNESS, strongest first:
 *        - the row's OWN last-movement rate — the price, per unit, at which
 *          these very units last moved through the depository. A mutual fund's
 *          units are bought and redeemed at its NAV, so that rate IS a NAV of
 *          the scheme on the movement's date, struck on the units the statement
 *          counts;
 *        - where the statement prints no rate against the row (ABSL Balanced
 *          Advantage on Ankita's and Aarti's statements), a per-unit price for
 *          the same ISIN on ANOTHER account at the SAME depository whose
 *          statement is dated the SAME day — a position's mark, or another row's
 *          last-movement rate. The depository prints units on one basis across
 *          the accounts it keeps.
 *      An ETF takes its OWN rate or nothing: its units split (DSP Gold's ten to
 *      one), and a witness from another row says nothing about when this row's
 *      units last moved;
 *   5. that price and the published NAV are on one basis — within a factor of
 *      two, the builder's own gate. A price ten times the NAV is a share-count
 *      break, never a price move;
 *   6. the row's own account carries no position of that ISIN already;
 *   7. no account of the SAME OWNER carries the same ISIN at the same units — one
 *      holding caught on two statements reads exactly like that.
 *
 * THE RATE IS A WITNESS AND NOTHING MORE. It is never the price the holding is
 * valued at — that is AMFI's NAV — and it is carried on the row
 * (`depositoryUnits.lastMovementRate`) only so a page can say what it is.
 *
 * NO COST, NEVER ZERO: a depository holds the units and did not buy them.
 * LIVE ONLY: no statement values these units, so `statementPortfolio` — what a
 * page that ties to the PDFs reads — never sees them, and a page that shows one
 * names its units, its witness and its NAV through `describeDepositoryUnits`.
 *
 * THE KEY IS THE BOOK'S OWN FOR THE LINE (`securityKey` on the row), so the
 * same scheme on three demats is one key, and a scheme the book also carries
 * under a fund's own statement keeps the two keys the book has for it — merging
 * them here would give a reader one tidy row and leave the reconciler none the
 * wiser (the eight ISINs `docs/BOOK-REPORT.md` names).
 *
 * ONE SWITCH. `false` takes every row out of every page at once.
 */
export const VALUE_UNPRICED_STATEMENT_UNITS = true;

/** The factor a statement price and a published NAV may differ by and still be one basis. */
const BASIS_FACTOR = 2;

export function unpricedStatementUnits(
  unvalued: readonly UnvaluedStatementHolding[] = BOOK_UNVALUED_HOLDINGS,
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  positions: readonly Position[] = BOOK_POSITIONS,
): Position[] {
  if (!VALUE_UNPRICED_STATEMENT_UNITS) return [];
  const acc = new Map(accounts.map((a) => [a.accountId, a]));
  const ownerOf = (id: string) => acc.get(id)?.ownerId ?? acc.get(id)?.owner ?? null;
  const isinOf = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;
  const rateOf = (x: { lastMovementRate?: number | null }) =>
    typeof x.lastMovementRate === "number" && x.lastMovementRate > 0 ? x.lastMovementRate : null;
  const out: Position[] = [];
  for (const u of unvalued) {
    const isin = isinOf(u);
    const qty = u.quantity;
    const etf = u.assetClass === "ETF";
    if (!isin || !(typeof qty === "number" && qty > 0)
      || (u.assetClass !== "Mutual Fund" && !etf)) continue;                                      // gate 1
    if (u.sameUnitsReportedBy) continue;                                                         // gate 2
    const nav = BY_ISIN.get(isin);
    if (!nav || !nav.usableForValue || !(nav.nav > 0)) continue;                                 // gate 3
    const own = acc.get(u.accountId);
    if (!own || !u.asOf) continue;
    // Gate 4 — the witness. The row's own rate first; another row's only for a
    // mutual fund, and only on the same depository's statement of the same day.
    const ownRate = rateOf(u);
    let witnessPrice = ownRate;
    let witnessAccountId: string | null = null;
    if (witnessPrice === null && !etf) {
      const sameDay = (id: string) => {
        const a = acc.get(id);
        return !!a && a.provider === own.provider && a.asOf === u.asOf;
      };
      const pos = positions.find((p) => isinOf(p) === isin && p.accountId !== u.accountId && sameDay(p.accountId)
        && typeof p.currentPrice === "number" && p.currentPrice > 0);
      const row = pos ? undefined : unvalued.find((r) => r !== u && isinOf(r) === isin
        && r.accountId !== u.accountId && sameDay(r.accountId) && rateOf(r) !== null);
      witnessPrice = pos ? (pos.currentPrice as number) : row ? rateOf(row) : null;
      witnessAccountId = pos?.accountId ?? row?.accountId ?? null;
    }
    if (witnessPrice === null) continue;                                                         // gate 4
    const ratio = nav.nav / witnessPrice;
    if (!(ratio > 1 / BASIS_FACTOR && ratio < BASIS_FACTOR)) continue;                           // gate 5
    if (positions.some((p) => p.accountId === u.accountId && isinOf(p) === isin)) continue;      // gate 6
    const owner = ownerOf(u.accountId);
    if (positions.some((p) => isinOf(p) === isin && Math.abs(p.quantity - qty) < 0.0005
      && ownerOf(p.accountId) === owner)) continue;                                               // gate 7
    const book = positions.find((p) => p.securityKey === u.securityKey);
    out.push({
      securityKey: u.securityKey,
      // The book's ONE name for the key (#76's rule, `securityLabel`), which
      // reads the book's quantity rows as well as its positions.
      security: securityLabel(u.securityKey, u.security),
      isin: u.isin,
      // A liquid ETF the quote feed prices intraday is priced that way here too,
      // as its siblings on the other demats are; a scheme resolves no symbol.
      symbol: book?.symbol ?? symbolForKey(u.securityKey),
      accountId: u.accountId,
      memberId: null,
      sector: book?.sector ?? "Unclassified",
      providerSector: null,
      assetClass: etf ? "ETF" : "Mutual Fund",
      marketSide: "listed",
      quantity: qty,
      marketValue: qty * nav.nav,
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
      depositoryUnits: ownRate !== null
        ? {
          asOf: u.asOf, source: null, kind: "last-movement",
          lastMovementRate: ownRate, lastMovementDate: u.lastMovementDate ?? null, lastMovementSide: u.lastMovementSide ?? null,
        }
        : { asOf: u.asOf, source: null, kind: "no-rate", witnessAccountId },
    });
  }
  return out.sort((a, b) => b.marketValue - a.marketValue);
}

/**
 * WHY NO STATEMENT PRICES THIS POSITION'S UNITS — the one place the sentence
 * is chosen, for both kinds (see `Position.depositoryUnits`). A page that
 * hard-codes "an account that sent no holding statement" is false about a
 * `no-rate` row, whose account did send one.
 *
 * A NOUN PHRASE, so every caller writes "they are …" or "no statement prices
 * these units: …" around it the same way. The closing-balance wording keeps
 * "a depository's own closing balance of <date>", which is the phrase the
 * Monitor's line check reads a depository line by.
 */
export function describeDepositoryUnits(
  d: NonNullable<Position["depositoryUnits"]>,
  accounts: readonly Account[] | ReadonlyMap<string, Account> = BOOK_ACCOUNTS,
): string {
  if (d.kind === "last-movement") {
    // The statement's own printed figure, quoted the way the book's own reasons
    // quote it (`BOOK_UNVALUED_HOLDINGS`), so the two can be read side by side.
    const rate = typeof d.lastMovementRate === "number" ? `${printedRupees(d.lastMovementRate)} a unit` : "a price per unit";
    const when = d.lastMovementDate
      ? `, on a ${d.lastMovementSide ?? "movement"} of ${d.lastMovementDate}`
      : ", older than the account's transaction statement";
    return `holdings the depository's holding statement of ${d.asOf ?? "its date"} records beside the price of their last depository movement — ${rate}${when} — a transaction price, not a valuation of the balance`;
  }
  if (d.kind === "no-price") {
    return `shares the depository's holding statement of ${d.asOf ?? "its date"} records with no usable price — no rate, or only the face value they were allotted at`;
  }
  if (d.kind === "no-rate") {
    const id = d.witnessAccountId;
    const w = !id ? undefined
      : "get" in accounts ? accounts.get(id) : accounts.find((a) => a.accountId === id);
    const witness = w ? `${w.owner}'s ${w.provider} ${w.accountNo}` : "another account at the same depository";
    return `units the depository's holding statement of ${d.asOf ?? "its date"} records and prints no rate for — ${witness} statement of the same day prints a per-unit price for the same scheme, which puts them on the published NAV's basis`;
  }
  return `a depository's own closing balance of ${d.asOf ?? "its statement date"}, on an account that sent a transaction statement and no holding statement`;
}

/** A statement's own printed rupee figure, as `build-book`'s reasons print one (`₹1,368.25`). */
function printedRupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
}

/**
 * THE SAME FACT FOR A SET OF ROWS, as a noun phrase — for a caption that speaks
 * of several depository rows at once (a drill-down's headline, a table's tip).
 * It names each KIND that is present and nothing else, because the two are
 * different reasons and only one of them says the account sent no holding
 * statement.
 */
export function depositoryUnitsGist(rows: readonly Pick<Position, "depositoryUnits">[]): string {
  const kinds = new Set(rows.flatMap((r) => r.depositoryUnits ? [r.depositoryUnits.kind ?? "closing-balance"] : []));
  const phrase = {
    "closing-balance": "a depository's own closing balance, on an account that sent a transaction statement and no holding statement",
    "last-movement": "holdings a depository's holding statement records beside the price of their last depository movement — a transaction price, not a valuation",
    "no-rate": "units a depository's holding statement records and prints no rate for",
    "no-price": "shares a depository's holding statement records with no usable price",
  } as const;
  const present = (["closing-balance", "last-movement", "no-rate", "no-price"] as const).filter((k) => kinds.has(k)).map((k) => phrase[k]);
  if (present.length <= 1) return present[0] ?? phrase["closing-balance"];
  return `either ${present.slice(0, -1).join(", ")}, or ${present[present.length - 1]}`;
}

/**
 * WHAT A TRANSACTION-ONLY ACCOUNT'S STATEMENT RECORDS, BALANCE BY BALANCE.
 *
 * Every holding the depository closes above nil, sorted into exactly one of
 * three: VALUED by a live row (a fund at AMFI's NAV, or a listed share at the
 * live quote), REPORTED ELSEWHERE (the depository's copy of units a fund's own
 * statement reports), or NOT VALUED. One definition, read by the account's note
 * below and by the page that lists the balances nothing values (Family &
 * Entities), so the two cannot count them differently.
 *
 * "REPORTED ELSEWHERE" NEEDS A UNIT WITNESS, NEVER A NAME. Either another
 * account carries the same ISIN at the same units, or the same owner's AIF
 * position's own dated unit record — every allotment and redemption its fund
 * printed — sums to the depository's balance to the third decimal. The second
 * is Neo Infra: its statement prints 4,85,837 whole units and no ISIN, and its
 * dated record (five calls less one 14,162.8-unit redemption) is the
 * depository's 4,85,837.200 exactly. Listed as not valued, the page would say
 * the family holds units nothing values while the table above values them.
 */
export type DepositoryBalance = {
  window: ShareMovement;
  /** The live row that values this balance, where one does. */
  valued: Position | null;
  /** The book position that already reports these very units, where one does. */
  reportedBy: Position | null;
};

export function depositoryBalancesOf(
  accountId: string,
  valued: readonly Position[],
  positions: readonly Position[] = BOOK_POSITIONS,
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
  accounts: readonly Account[] = BOOK_ACCOUNTS,
  moves: readonly CapitalMove[] = BOOK_CAPITAL_MOVES,
): DepositoryBalance[] {
  const isin = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;
  const tie = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  const ownerOf = new Map(accounts.map((a) => [a.accountId, a.ownerId ?? a.owner]));
  const owner = ownerOf.get(accountId);
  // The units each (account, security) holds by its own dated record. Only a
  // record whose every row names its units counts — a sum over a gap is not one.
  const recorded = new Map<string, number | null>();
  for (const m of moves) {
    if (!m.securityKey) continue;
    const k = `${m.accountId}\u0000${m.securityKey}`;
    const prev = recorded.has(k) ? recorded.get(k)! : 0;
    recorded.set(k, prev === null || typeof m.units !== "number" ? null : prev + m.units);
  }
  return Object.values(movements)
    .filter((w) => w.accountId === accountId && typeof w.closing === "number" && w.closing > 0)
    .map((w) => {
      const i = isin(w);
      const closing = w.closing as number;
      const v = valued.find((p) => p.accountId === accountId && !!i && isin(p) === i) ?? null;
      const rep = v ? null : positions.find((p) => p.accountId !== accountId && (
        (!!i && isin(p) === i && tie(p.quantity, closing))
        || (p.assetClass === "AIF" && !!owner && ownerOf.get(p.accountId) === owner
          && tie(recorded.get(`${p.accountId}\u0000${p.securityKey}`) ?? NaN, closing)))) ?? null;
      return { window: w, valued: v, reportedBy: rep };
    })
    .sort((a, b) => Number(!!b.valued) - Number(!!a.valued) || Number(!!a.reportedBy) - Number(!!b.reportedBy)
      || (a.window.security ?? a.window.securityKey).localeCompare(b.window.security ?? b.window.securityKey));
}

/**
 * THE SENTENCE AN ACCOUNT CARRIES ONCE SOME OF ITS HOLDINGS ARE VALUED THIS WAY.
 *
 * `noPositionsReason` says "nothing here can be valued", which stops being true
 * on the live basis the moment one of these rows exists — and a figure for SOME
 * of an account's holdings must name the rest. So the live copy of the account
 * carries this instead: what is valued, from what, and how many holdings on the
 * same statement are not.
 *
 * It names each KIND that is valued, because they come from different prices: a
 * fund at the NAV AMFI published after a close, a listed share at the live quote
 * — which exists only while the feed prices it, so the sentence says so.
 *
 * TWO KINDS OF ACCOUNT, AND TWO SENTENCES, because "this account sent no holding
 * statement" is true of one and false of the other:
 *   - a TRANSACTION-ONLY account (the closing-balance rows): what it holds is
 *     the depository's closing balances, sorted by `depositoryBalancesOf`;
 *   - an account whose HOLDING statement values none of what it records (the
 *     three Motilal Oswal demats since Stage 10cz, whose statements print only
 *     the price of each holding's last depository movement): what it holds is
 *     the statement's own lines (`BOOK_UNVALUED_HOLDINGS`). An account the
 *     statement basis DOES value (ICICI's NSDL demat, with ESDS beside it) has
 *     no reason to replace and gets no note — its unvalued lines are listed
 *     line by line where a page lists them.
 */
export function partialValuationNotes(
  valued: readonly Position[],
  movements: Readonly<Record<string, ShareMovement>> = BOOK_SHARE_MOVEMENTS,
  positions: readonly Position[] = BOOK_POSITIONS,
  unvalued: readonly UnvaluedStatementHolding[] = BOOK_UNVALUED_HOLDINGS,
  /** Listed shares the live quote WOULD value (priced or not), so one the feed has not priced is named as that rather than as unpriceable. */
  quotable: readonly Pick<Position, "accountId" | "isin" | "securityKey">[] = [],
): Map<string, string> {
  const byTape = new Map<string, Position[]>();
  const byStatement = new Map<string, Position[]>();
  const statementValued = new Set(positions.map((p) => p.accountId));
  for (const p of valued) {
    const kind = p.depositoryUnits?.kind ?? "closing-balance";
    // Every sentence in the first branch is about an account that sent a
    // transaction statement and NO holding statement; a row of another kind is
    // not that account, and the note would say something false about it.
    const into = kind === "closing-balance" ? byTape
      // …and the second is about an account whose holding statement values
      // NONE of what it records. One the statement basis values keeps its own
      // registry entry: nothing there says "values nothing".
      : statementValued.has(p.accountId) ? null : byStatement;
    if (!into) continue;
    const list = into.get(p.accountId) ?? [];
    list.push(p);
    into.set(p.accountId, list);
  }
  const notes = new Map<string, string>();
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const fundClause = (funds: readonly Position[], units: string, asOf: string) => {
    const cash = funds.filter((r) => isCashEquivalent(r));
    const navDate = funds.map((r) => r.navDate).filter(Boolean).sort().pop() ?? "its publication date";
    return `its ${n(funds.length, "fund")}${cash.length ? ` (${cash.length === funds.length ? (cash.length === 1 ? "a liquid or arbitrage fund" : "all liquid and arbitrage funds") : `${cash.length} of them liquid and arbitrage funds`} the family counts as cash)` : ""} ${funds.length === 1 ? "is" : "are"} valued at ${units} (${asOf}) × AMFI's published NAV (${navDate})`;
  };
  for (const [accountId, rows] of byTape) {
    const balances = depositoryBalancesOf(accountId, rows, positions, movements);
    const funds = rows.filter((r) => r.navPriced);
    const shares = rows.filter((r) => !r.navPriced);
    const notValued = balances.filter((b) => !b.valued && !b.reportedBy).length;
    const elsewhere = balances.filter((b) => b.reportedBy).length;
    const asOf = rows.map((r) => r.depositoryUnits?.asOf).filter(Boolean).sort().pop() ?? "its statement date";
    const parts: string[] = [];
    if (funds.length) parts.push(fundClause(funds, "the depository's own closing units", asOf));
    if (shares.length) parts.push(`its ${n(shares.length, "listed share")} ${shares.length === 1 ? "is" : "are"} valued at the same closing units × the live quote, and only while the quote feed prices ${shares.length === 1 ? "it" : "them"}`);
    const rest: string[] = [];
    if (notValued) rest.push(`${n(notValued, "other holding")} on that statement ${notValued === 1 ? "has" : "have"} no price this book can use and ${notValued === 1 ? "is" : "are"} not valued`);
    if (elsewhere) rest.push(`${n(elsewhere, "more balance")} ${elsewhere === 1 ? "is" : "are"} the depository's copy of units a fund's own statement reports, valued there`);
    notes.set(accountId,
      `this account sent a transaction statement and no holding statement. ${cap(parts.join("; "))}${rest.length ? `; ${rest.join("; ")}` : "; nothing else on that statement is held"}. What would value all of it is the account's own holding statement from its custodian`);
  }
  const isin = (x: { isin?: string | null }) => x.isin?.trim().toUpperCase() || null;
  for (const [accountId, rows] of byStatement) {
    const lines = unvalued.filter((u) => u.accountId === accountId);
    // A statement line is VALUED where a live row of this account carries its
    // ISIN, or its key where it prints none.
    const valuedLine = (u: UnvaluedStatementHolding) => rows.some((r) =>
      (isin(u) ? isin(r) === isin(u) : r.securityKey === u.securityKey));
    const elsewhere = lines.filter((u) => u.sameUnitsReportedBy && !valuedLine(u)).length;
    const open = lines.filter((u) => !u.sameUnitsReportedBy && !valuedLine(u));
    const waiting = open.filter((u) => quotable.some((q) => q.accountId === accountId
      && (isin(u) ? isin(q) === isin(u) : q.securityKey === u.securityKey))).length;
    const notValued = open.length - waiting;
    const funds = rows.filter((r) => r.navPriced);
    const shares = rows.filter((r) => !r.navPriced);
    const asOf = rows.map((r) => r.depositoryUnits?.asOf).filter(Boolean).sort().pop() ?? "its statement date";
    const moved = lines.filter((u) => typeof u.lastMovementRate === "number" && u.lastMovementRate > 0).length;
    const parts: string[] = [];
    if (funds.length) parts.push(fundClause(funds, "the statement's own units", asOf));
    if (shares.length) parts.push(`its ${n(shares.length, "listed share")} ${shares.length === 1 ? "is" : "are"} valued at the statement's units × the live quote, and only while the quote feed prices ${shares.length === 1 ? "it" : "them"}`);
    const rest: string[] = [];
    if (waiting) rest.push(`${n(waiting, "more listed share")} ${waiting === 1 ? "is" : "are"} valued the same way once the quote feed prices ${waiting === 1 ? "it" : "them"}, and ${waiting === 1 ? "is" : "are"} not valued until then`);
    if (notValued) rest.push(`${n(notValued, "other holding")} on that statement ${notValued === 1 ? "has" : "have"} no price this book can use and ${notValued === 1 ? "is" : "are"} not valued`);
    if (elsewhere) rest.push(`${n(elsewhere, "more holding")} ${elsewhere === 1 ? "is" : "are"} the depository's copy of units a fund's own statement reports, valued there`);
    notes.set(accountId,
      `this account's holding statement of ${asOf} records ${n(lines.length, "holding")} as quantities and values none of them${moved ? ` — beside ${moved === lines.length ? "each" : `${moved} of them`} it prints only the price of the holding's last depository movement, a transaction price` : ""}. ${cap(parts.join("; "))}${rest.length ? `; ${rest.join("; ")}` : "; nothing else on that statement is held"}. What would value all of it on that date is a statement that marks the balance, such as CDSL's monthly Consolidated Account Statement`);
  }
  return notes;
}

/**
 * THE LIVE COPY OF THE ACCOUNT REGISTRY — one definition, read by
 * `PortfolioContext` and by any suite that builds what a page is handed. An
 * account some of whose holdings are valued here no longer "values nothing":
 * its generated `noPositionsReason` is true of the statement basis and false of
 * this one, so it carries `partialValuation` instead. Every other account is
 * returned as it is.
 */
export function withPartialValuation<A extends { accountId: string }>(
  accounts: readonly A[],
  notes: ReadonlyMap<string, string>,
): A[] {
  return accounts.map((a) => {
    const note = notes.get(a.accountId);
    return note ? { ...a, noPositionsReason: null, partialValuation: note } : a;
  });
}
