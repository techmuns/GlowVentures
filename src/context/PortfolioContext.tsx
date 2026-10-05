// Portfolio state hub. Loads the ingested book as the default portfolio so the
// dashboard is live on open. Display-currency toggle converts all aggregates
// from the INR base at the display layer.
//
// Until the ingest pipeline has run, `src/data/glowData.ts` is an empty
// placeholder. That case is detected here (`bookIsEmpty`) and surfaced as an
// empty state by <Gate> in App.tsx — a book of zeros must never render as if the
// family's holdings had been measured at zero.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio, Position } from "@/lib/types";
import { dedupedPositions, publicPrivateSplit, holdingBucket, DIRECT_EQUITY_BUCKET } from "@/lib/analytics";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { SUPPORTED_DISPLAY_CURRENCIES, type DisplayCurrency, DEFAULT_INR_PER_USD, fetchInrPerUsd } from "@/lib/fx";
import { fetchQuotes, symbolsFor, applyQuotes, symbolFor, pendingAmong, quoteFeedNames, type QuoteFeed } from "@/lib/quotes";
import { applyFundNavs, depositoryFundHoldings, partialValuationNotes, unpricedStatementUnits, withPartialValuation } from "@/lib/fundNavs";
import { depositoryShareHoldings, depositoryShareIsins, depositoryShareSymbols, shareCandidates } from "@/lib/depositoryShares";
import { applyCorporateActionQuotes, fetchCorporateActions, liveWithheldReason, savedCorporateActions, type ActionFeed, type ActionReturn } from "@/lib/corporateActions";
import { readCachedQuotes, writeCachedQuotes, mergeQuoteFeeds, retainQuotes } from "@/lib/quoteCache";
import { fmtCurrency } from "@/lib/format";
import { labelledAccounts, labelledPositions } from "@/lib/securityLabel";
import { readDisplayCurrency, writeDisplayCurrency } from "@/lib/storage";
import {
  BOOK_SUMMARY, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_NAV_HISTORY, BOOK_CAPITAL_GAINS,
  BOOK_ACCOUNT_CASH_FLOWS, BOOK_ENTITY_CASH_FLOWS,
  BOOK_PE_FUNDS, BOOK_PREIPO_FUNDS, BOOK_UNLISTED_COMPANIES, BOOK_DEBT_FUNDS, BOOK_CLOSED_FUNDS, BOOK_STARTUPS,
  BOOK_COMMITMENTS, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS,
} from "@/data/glowData";

/**
 * THE FUNDS THAT NO HOLDING STATEMENT REPORTS — computed once, because every
 * input is committed data. See `depositoryFundHoldings`: the mutual funds on an
 * account that sent only a transaction statement, valued at the depository's
 * closing units × AMFI's published NAV — its liquid and arbitrage funds, the
 * family's cash (Stage 10ce), and its other schemes (Stage 10cy). LIVE
 * portfolio only. The same statement's listed SHARES are valued at the live
 * quote inside the memo below, because they exist only while the feed prices
 * them (`depositoryShares.ts`).
 */
const DEPOSITORY_FUNDS = depositoryFundHoldings();
/**
 * UNITS A HOLDING STATEMENT RECORDS AND PRICES NOWHERE — valued at AMFI's
 * published NAV on the LIVE basis only, exactly like the depository's cash.
 * The figure audit's A-17 found the first of them (ABSL Balanced Advantage on
 * two Motilal demats); Stage 10cz found that EVERY fund on the three Motilal
 * holding statements is one, because the `Rs RATE` and `Rs VALUE` those
 * statements print are the holding's LAST DEPOSITORY MOVEMENT — a transaction
 * price and that price times the movement's own units — never a valuation of
 * the balance (`unpricedStatementUnits` has the gates).
 *
 * They ARE fed to `partialValuationNotes` now: an account whose holding
 * statement values none of its holdings is partly valued the moment this
 * layer values some of them, and the note says which, and why the rest are
 * not. That function words a holding-statement account apart from a
 * transaction-only one, so "this account sent no holding statement" is never
 * said of an account that sent one.
 */
const UNPRICED_UNITS = unpricedStatementUnits();

/** Every row this layer adds on top of the statements, for the requests below. */
const LIVE_ONLY_FUNDS = [...DEPOSITORY_FUNDS, ...UNPRICED_UNITS];

// Re-export so components can keep importing these from the context module.
export { SUPPORTED_DISPLAY_CURRENCIES } from "@/lib/fx";
export type { DisplayCurrency } from "@/lib/fx";

function defaultPortfolio(): Portfolio {
  return {
    fileName: "Wealth-platform statements",
    uploadedAt: new Date(0).toISOString(),
    baseCurrency: "INR",
    asOf: BOOK_SUMMARY.asOf,
    totalValue: BOOK_SUMMARY.totalValue,
    listedValue: BOOK_SUMMARY.listedValue,
    privateValue: BOOK_SUMMARY.privateValue,
    unplacedValue: BOOK_SUMMARY.unplacedValue,
    // A MANDATE'S NAME IS ITS STRATEGY, and four statements print theirs in
    // capitals — `CARNELIAN BESPOKE PORTFOLIO`, `GROWTH`, `SVAN INVESTMENT
    // MANAGERS LLP - VELOCITY`, `GREEN LANTERN CAPITAL LLP - GLC GROWTH FUND` —
    // so every mandate row, drill-down title and capital line shouted them. Cased
    // HERE, once, through the same rules as a security's name, because the
    // registry is read on a dozen pages and a per-page fix is a dozen chances to
    // miss one. The registry in `glowData.ts` keeps what the statement printed.
    accounts: labelledAccounts(BOOK_ACCOUNTS),
    // Standardise the mixed-case provider spellings once, at the source, so every
    // page (tables, dropdowns, the news/announcement holding tags) shows them the
    // same way. The securityKey is derived upstream from the raw name, so tidying
    // the display string here cannot move a position between groups.
    //
    // `holdingLabel` is `displaySecurity` plus ONE more step, and only for a
    // holding whose key resolved a mutual-fund scheme: the depository's clipped
    // name becomes the AMC's published one and the plan phrase becomes a single
    // word. It is reached from `src/data/schemeNames.json`, which was joined to
    // this book BY ISIN — see `src/lib/schemeLabel.ts`. Nothing downstream may
    // re-derive a key from this string, and nothing does.
    //
    // `securityLabel` (through `labelledPositions`) is that plus ONE NAME PER KEY: a security two statements
    // spell differently (`ICICI Bank Ltd.` / `ICICI BANK-EQ`) takes one of the
    // spellings they printed, so it is one option in a pick-list and one name
    // in every table — see `src/lib/securityLabel.ts` for the rule.
    positions: labelledPositions(BOOK_POSITIONS),
    navHistory: BOOK_NAV_HISTORY,
    capitalGains: BOOK_CAPITAL_GAINS,
    // Dated external capital movements per account — the money-weighted-return
    // input. Empty for an account whose statements carry none, which is a real
    // answer and renders as "—" rather than as a return of zero.
    accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS,
    // Keyed by owner — what the per-entity XIRR reads.
    entityCashFlows: BOOK_ENTITY_CASH_FLOWS,
    // Undrawn capital the family owes a fund on demand. NOT a holding — the
    // fund's value is already a position — and not part of `privateMarkets`,
    // which describes investments made.
    commitments: BOOK_COMMITMENTS,
    privateMarkets: {
      peFunds: BOOK_PE_FUNDS, preIpoFunds: BOOK_PREIPO_FUNDS, unlistedCompanies: BOOK_UNLISTED_COMPANIES,
      debtFunds: BOOK_DEBT_FUNDS, closedFunds: BOOK_CLOSED_FUNDS, startups: BOOK_STARTUPS,
    },
  };
}

/**
 * True when the book carries nothing to show. Checked across every collection,
 * not just positions: a book with no listed holdings but a live private ledger
 * is a real book and must render.
 */
export function isEmptyBook(p: Portfolio | null): boolean {
  if (!p) return true;
  const pm = p.privateMarkets;
  return (
    p.positions.length === 0 &&
    p.navHistory.length === 0 &&
    p.capitalGains.length === 0 &&
    pm.peFunds.length === 0 && pm.preIpoFunds.length === 0 && pm.unlistedCompanies.length === 0 &&
    pm.debtFunds.length === 0 && pm.closedFunds.length === 0 && pm.startups.length === 0
  );
}

export type QuotesStatus = "loading" | "live" | "unavailable";

/**
 * Which measurement a figure is on.
 *
 * STATEMENT — as the managers printed it. Ties to the archive to the rupee, and
 * carries the accounts' individual report dates, so a consolidated total on this
 * basis is a BLEND of dates and must say so.
 *
 * LIVE — the same holdings marked to market now. The date skew disappears
 * because every price is from the same moment, but the figure no longer matches
 * any statement, so it can never be the basis for a page that must reconcile.
 */
export type Basis = "STATEMENT" | "LIVE";

type Ctx = {
  /** The book with live prices overlaid where a quote exists. */
  portfolio: Portfolio | null;
  /**
   * `portfolio.positions` with each `dedupeGroup` counted ONCE.
   *
   * Use this for any figure that spans more than one owner — a consolidated NAV,
   * an allocation chart, a concentration measure, a weight denominator. Use
   * `portfolio.positions` for anything scoped to ONE account or ONE owner, where
   * both rows must show exactly as their statements print them.
   *
   * Empty when there is no book.
   */
  consolidated: Position[];
  /**
   * The book EXACTLY as extracted, never touched by the quote feed.
   *
   * Capital Gains, Data Audit, Ledger Insights and every reconciliation view
   * read this. They have to tie to a printed statement, and a page whose totals
   * drift with the market cannot do that — the reader would open the PDF and
   * find a different number, with nothing on screen to explain why.
   */
  statementPortfolio: Portfolio | null;
  /** Which basis `portfolio` is currently on. */
  basis: Basis;
  /** No statements ingested yet — pages show an empty state rather than zeros. */
  bookIsEmpty: boolean;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  convertFromBase: (n: number) => number;
  /** Money in the display currency, or `—` when the book carries no figure. */
  fmtFromBase: (n: number | null | undefined, opts?: { compact?: boolean; sign?: boolean }) => string;
  clearPortfolio: () => void;
  inrPerUsd: number;      // USD→INR rate (₹ per $1) — see fxIsLive
  fxAsOf: string | null;  // date of the live rate, if the feed supplied one
  /**
   * Whether `inrPerUsd` came from the feed or from the static fallback.
   *
   * EVERY USD FIGURE IN THE COCKPIT IS THIS ONE NUMBER'S DIVISOR, so a stale one
   * is not a cosmetic problem — it is wrong by its own drift, everywhere at
   * once, and it looks exactly like a live rate. The chip rendered `$1 = ₹83.50`
   * identically either way, with "fallback rate" only in a `title` tooltip: gone
   * on touch, gone in a screenshot, gone for anyone not hovering.
   *
   * This is the same distinction the quote feed already makes visible — a price
   * the feed could not supply keeps its statement mark and is FLAGGED, rather
   * than passing a month-old mark off as current. The rate deserves no less.
   *
   * Inferred from `fxAsOf` before, which is a different fact: a feed that
   * answers without a date is live and undated, not a fallback.
   */
  fxIsLive: boolean;
  // ── Live quotes ───────────────────────────────────────────────────────────
  quotesStatus: QuotesStatus;
  quoteFeed: QuoteFeed | null;
  quotesAsOf: string | null;   // when the feed was pulled
  livePriced: number;          // holdings carrying a live price
  /**
   * Holdings with an NSE symbol and no quote in this round — still on their
   * statement mark. NOT the ones the corporate-action check held back: those
   * DID get a quote, and are counted in `liveWithheld` (DL-9).
   */
  notLive: number;
  /**
   * Holdings whose live quote ARRIVED and was held back by the corporate-action
   * check, because pairing it with the statement's share count could be wrong —
   * sales recorded after the statement, an event the capture cannot allocate, or
   * the evidence still loading. Each holding's own page names the reason
   * (`liveWithheldReason`). Folded into `notLive` they read as a feed that did
   * not answer, which sends a reader to wait for a feed that already did.
   */
  liveWithheld: number;
  /** The feeds pricing what is on screen — "Upstox", "muns" — primary first. */
  quoteFeeds: string[];
  /**
   * Securities with NO NSE symbol at all — cash balances, receivables and the
   * liquid-fund sweep. These can never go live however well the feed is running,
   * and folding them into `notLive` would read as a feed problem forever.
   */
  unpriceable: number;
  /**
   * Symbols the feed has DEFERRED and not yet answered for — an answer is
   * coming. Distinct from a symbol the upstream cannot price, which never gets
   * one and is counted in `notLive`.
   *
   * A card whose figures are a RANKING reads this for its own symbols and holds
   * until none of them is in it: a top-gainers list struck over part of a scope
   * can promote a name that is not the top and omit the one that is, which is a
   * wrong figure rather than a slow screen.
   */
  quotesPending: ReadonlySet<string>;
  /** Which of these symbols the feed has still to answer for. */
  pendingFor: (symbols: readonly string[]) => string[];
  refreshQuotes: () => void;
  corporateActions: ActionFeed | null;
  corporateActionsStatus: "loading" | "current" | "saved" | "unavailable";
  corporateActionReturns: Map<string, ActionReturn>;
};

const PortfolioContext = createContext<Ctx | null>(null);

// How often to re-poll the quote feed while a tab is open. The server holds each
// symbol for 60s, so anything shorter just re-reads the edge cache.
const QUOTE_POLL_MS = 60_000;
// While symbols are still unpriced, poll harder — the upstream returns only part
// of the book per call, so the first minute is a fill-in phase.
const QUOTE_FILL_MS = 4_000;

// ── WHICH SYMBOLS THE FIRST SCREEN NEEDS, DERIVED AND NEVER TYPED ────────────
//
// The endpoint prices a bounded slice per request (64 here) and this book has
// 161 symbols, so a cold open fills over three rounds. In BOOK ORDER the 33
// direct-equity names sat at positions 20 to 108, 30 of them beyond the first
// request — so Today's movers, which covers exactly that set, could not be
// complete until the third round. That is what "shows incomplete data and then
// starts showing all the portfolio movers" is.
//
// Naming them as `priority` fetches them first, so the card's whole scope lands
// in ONE round and the other 128 fill in behind it. It changes what is asked for
// FIRST, never what is asked for: the server ignores a priority symbol that is
// not in the ask, and every symbol is still fetched.
//
// Derived from the book through the same `holdingBucket` the card groups on, so
// a drop that moves a holding between buckets moves this with it. A typed list
// would go stale silently and the card would be back to three rounds.
const PRIORITY_SYMBOLS = (() => {
  const accIdx = accountIndex(BOOK_ACCOUNTS);
  const out = new Set<string>();
  for (const p of BOOK_POSITIONS) {
    if (holdingBucket(p, engagementOf(accIdx, p)) !== DIRECT_EQUITY_BUCKET) continue;
    const sym = symbolFor(p);
    if (sym) out.add(sym);
  }
  // The listed shares a depository reports — on a transaction-only demat
  // (Stage 10cy), and on the three Motilal holding statements that price none
  // of them (Stage 10cz) — are the family's own Direct Equity too, so they land
  // in the same round.
  for (const sym of depositoryShareSymbols()) out.add(sym);
  return [...out];
})();

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  // The book as ingested. Live prices are layered on top in `portfolio` below,
  // so the statement figures stay available and unmutated underneath.
  const [basePortfolio, setPortfolio] = useState<Portfolio | null>(() => defaultPortfolio());
  const [corporateActions, setCorporateActions] = useState<ActionFeed | null>(null);
  const [corporateActionsStatus, setCorporateActionsStatus] = useState<Ctx["corporateActionsStatus"]>("loading");
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    let held: ActionFeed | null = null;
    const accept = (next: ActionFeed) => {
      if (controller.signal.aborted || held && Date.parse(next.capturedAt) < Date.parse(held.capturedAt)) return;
      held = next;
      setCorporateActions(next);
    };
    const tick = async () => {
      if (document.hidden) { timer = window.setTimeout(tick, 30_000); return; }
      // THE CAPTURE IS FILTERED TO WHAT IS ASKED FOR, so the shares this layer
      // adds must be asked for too — a share outside the capture's coverage
      // cannot pass the corporate-action gate, and would never be a row.
      const latest = await fetchCorporateActions(
        [...symbolsFor(BOOK_POSITIONS), ...depositoryShareSymbols()],
        [...BOOK_POSITIONS.flatMap((p) => p.isin ? [p.isin] : []), ...depositoryShareIsins()],
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (latest) accept(latest.feed);
      else if (!held) {
        const saved = await savedCorporateActions(controller.signal);
        if (controller.signal.aborted) return;
        if (saved) accept(saved);
      }
      setCorporateActionsStatus(latest && !latest.retained ? "current" : held ? "saved" : "unavailable");
      timer = window.setTimeout(tick, latest?.refreshing ? 2_000 : latest && !latest.retained ? 15 * 60_000 : 30_000);
    };
    // Development/fixtures have no Pages asset binding. Production obtains the
    // filtered saved capture from the server, without a second full-feed download.
    if (import.meta.env.DEV) savedCorporateActions(controller.signal).then((saved) => {
      if (controller.signal.aborted) return;
      if (saved) { accept(saved); setCorporateActionsStatus((s) => s === "current" ? s : "saved"); }
    });
    void tick();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  const [displayCurrency, setCcy] = useState<DisplayCurrency>(() => readDisplayCurrency() ?? "INR");
  // Live daily USD→INR rate (₹ per $1), fetched once on load; falls back to a
  // static rate so conversions never block on the network.
  const [inrPerUsd, setInrPerUsd] = useState<number>(DEFAULT_INR_PER_USD);
  const [fxAsOf, setFxAsOf] = useState<string | null>(null);
  const [fxIsLive, setFxIsLive] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchInrPerUsd().then((r) => {
      if (!alive || !r) return;
      setInrPerUsd(r.inrPerUsd);
      setFxAsOf(r.date);
      setFxIsLive(true);
    });
    return () => { alive = false; };
  }, []);
  // ── Live intraday quotes ────────────────────────────────────────────────────
  // Fetched once on load and then on a timer, and merged into the book here so
  // every page that reads `portfolio.positions` gets live prices without knowing
  // the feed exists. A cold fetch takes ~25s upstream, so the page renders on the
  // statement marks first and the live prices swap in when they land — never a
  // blank screen waiting on the network.
  /**
   * THE APP OPENS ON THE LAST SNAPSHOT, NOT ON NOTHING.
   *
   * The upstream prices only part of the book per call, so a cold open took
   * several rounds to fill in — and Today's movers, having no priced row yet,
   * rendered "No holding in this book carries a day change right now". That is
   * a claim about the BOOK made while the feed was still in flight.
   *
   * `readCachedQuotes` returns the previous snapshot with every quote's `ageS`
   * RE-DERIVED, and null for anything older than the session — a day change is
   * struck against the previous close, so serving yesterday's snapshot would
   * print yesterday's move under a heading reading "Today". A cold open on a
   * new session therefore still starts empty, and the cards say they are
   * loading rather than asserting an absence.
   *
   * `quotesStatus` stays "loading" until a live round lands, whatever the cache
   * held: the figures on screen are real and dated, and the top bar is telling
   * the truth when it says prices are still being fetched.
   */
  const [quotes, setQuotes] = useState<QuoteFeed | null>(readCachedQuotes);
  const [quotesStatus, setQuotesStatus] = useState<QuotesStatus>("loading");
  const inFlight = useRef(false);

  // Merge each round into what we already have. The upstream only prices part of
  // the book per call, so a later round that returns fewer names must not wipe
  // out prices an earlier round already established.
  const mergeFeed = useCallback((feed: QuoteFeed) => {
    setQuotes((prev) => {
      const next = mergeQuoteFeeds(prev, feed);
      // Kept for the next open. Written from the MERGED feed rather than the
      // round, so a snapshot holds the whole book rather than whichever slice
      // the last call happened to price.
      writeCachedQuotes(next);
      return next;
    });
  }, []);

  const loadQuotes = useCallback(async (refresh = false) => {
    if (inFlight.current) return 0;
    // The live-only funds are asked for too: a liquid ETF among them prices
    // intraday the way its siblings on the statements do.
    const symbols = [...new Set([...symbolsFor(BOOK_POSITIONS), ...symbolsFor(LIVE_ONLY_FUNDS), ...depositoryShareSymbols()])];
    if (!symbols.length) { setQuotesStatus("unavailable"); return 0; }
    inFlight.current = true;
    // Keep the last failure visible until a successful response replaces it.
    // A slow retry must not make cached prices appear healthy again.
    setQuotesStatus((previous) => previous === "unavailable" ? previous : "loading");
    try {
      const feed = await fetchQuotes(symbols, { refresh, priority: PRIORITY_SYMBOLS });
      // THE FILL POLL RUNS ON `pending`, NEVER ON `missing`. A deferred symbol
      // is answered in seconds; one the upstream cannot price never is, so
      // polling on it held this book at a four-second cadence for the life of
      // the tab while nothing could change.
      if (feed && retainQuotes(feed)) { mergeFeed(feed); setQuotesStatus("live"); return feed.pending.length; }
      setQuotes((previous) => retainQuotes(previous));
      setQuotesStatus("unavailable");
      return -1;
    } finally {
      inFlight.current = false;
    }
  }, [mergeFeed]);

  useEffect(() => {
    let alive = true;
    let timer: number;
    // Poll fast while the book is still filling in, then settle to the intraday
    // cadence. A round only prices part of the book, so at the steady interval
    // alone full coverage would take minutes; this gets there in seconds and
    // each request is cheap (4 subrequests, mostly served from the edge cache).
    const tick = async (refresh = false) => {
      if (document.hidden) { timer = window.setTimeout(() => tick(), QUOTE_POLL_MS); return; }
      const pending = await loadQuotes(refresh);
      if (!alive) return;
      timer = window.setTimeout(() => tick(), pending < 0 ? 15_000 : pending > 0 ? QUOTE_FILL_MS : QUOTE_POLL_MS);
    };
    tick();
    const onFocus = () => loadQuotes();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [loadQuotes]);

  // Merge quotes into the book.
  //
  // BASIS DISCIPLINE. Only PRICE-DERIVED fields move — market value, day change,
  // unrealised P&L and the return on cost. Quantity, cost basis, realised gains,
  // dividends, fees and every dated cash flow come from the statements and are
  // never changed by a price. The independent corporate-action layer can adjust
  // projected share quantity/average cost from an explicit post-statement ratio;
  // total cost and the statement book remain untouched. Entitlements stay outside NAV.
  // `basePortfolio` is kept intact alongside and handed out as
  // `statementPortfolio`, so a page that must reconcile has the printed figures
  // available rather than having to un-mix them.
  const corporateActionLayer = useMemo(() => applyCorporateActionQuotes(
    basePortfolio?.positions ?? [], basePortfolio?.accounts ?? [], quotes, corporateActions,
  ), [basePortfolio, quotes, corporateActions]);
  const portfolio = useMemo<Portfolio | null>(() => {
    if (!basePortfolio) return null;
    /**
     * THE PUBLISHED NAV IS APPLIED WHETHER OR NOT THE QUOTE FEED ANSWERED.
     *
     * It is a COMMITTED figure, not a fetch — `src/data/fundNavs.ts`, refreshed
     * daily by its own workflow — so it is available on the first paint, with
     * no token and no network. Returning `basePortfolio` early when the quote
     * feed is null would have left every fund at its statement mark on exactly
     * the runs where nothing else could price it either, which is the case the
     * family reported.
     */
    // `applyQuotes` with a null feed marks every row not-live and changes
    // nothing else, so ONE path serves both cases and the no-feed run is no
    // longer an early return that skipped the NAVs.
    /**
     * AND THE DEPOSITORY'S BALANCES JOIN HERE, NEVER IN `basePortfolio`.
     *
     * Those rows have no statement mark at all — a fund's value IS the published
     * NAV, and a listed share's IS the live quote (Stage 10cy) — so they belong
     * to the live book alone, and `statementPortfolio` stays exactly what the
     * PDFs print. The funds go through the same two overlays as every other row,
     * so a liquid ETF the quote feed prices intraday is priced here the way its
     * siblings on the other demats are; a share is a row ONLY where the feed
     * priced it, and otherwise the account's note names it as not valued.
     */
    // The statement's own rows come through the corporate-action layer, which
    // prices them; the depository's fund rows are funds, which that layer would
    // only price the same way, so they take the quote overlay directly. The
    // SHARES go through that layer too (`depositoryShareHoldings`): a balance
    // counted on 31 July and a quote from today are two dates, and a split or
    // bonus between them must be projected, or the share is not a row.
    const depositoryShares = depositoryShareHoldings(quotes, corporateActions, undefined, basePortfolio.accounts);
    const positions = applyFundNavs([...corporateActionLayer.positions,
      ...applyQuotes([...LIVE_ONLY_FUNDS], quotes), ...depositoryShares]);
    /**
     * AN ACCOUNT SOME OF WHOSE HOLDINGS ARE NOW VALUED NO LONGER "VALUES NOTHING".
     * Its generated `noPositionsReason` is true of the statement basis and false
     * of this one, so the live copy carries `partialValuation` instead — what is
     * valued, from what, and how many holdings on the same statement are not.
     */
    // `partialValuationNotes` decides WHICH accounts are partly valued: a
    // transaction-only account whose closing balances are valued here, and a
    // holding-statement account that values none of its own holdings (the three
    // Motilal demats, Stage 10cz) once this layer values some. An account whose
    // statement values holdings of its own — Clean Max's, ESDS's — is not
    // "partly valued" by a row or two added beside them. It is handed the
    // share candidates too, so a share the feed has not priced YET is told
    // apart from a holding nothing here can price.
    const accounts = withPartialValuation(basePortfolio.accounts,
      partialValuationNotes([...LIVE_ONLY_FUNDS, ...depositoryShares],
        BOOK_SHARE_MOVEMENTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, shareCandidates()));
    // COUNT ONCE, AND SPLIT BY CLASS — the two ways this NAV has been wrong.
    //
    // `publicPrivateSplit` dedupes first (each dedupeGroup once — the 360 ONE AIF
    // is ₹1.46 Cr reported under two members), then splits on `marketSide`
    // exactly as `BOOK_SUMMARY` does. That matters on LIVE basis: an earlier fix
    // set `listedValue = consolidatedMarketValue(positions)` — the WHOLE deduped
    // book, AIF units included — and then added `privateValue` on top, counting
    // the ₹207.65 Cr AIF book twice and inflating live NAV to ~₹544 Cr against a
    // real ₹335 Cr. Live prices move only listed marks; a fund unit has no live
    // quote and its share stays at its statement value, which is why re-splitting
    // the live-overlaid positions leaves the other two sides unchanged.
    //
    // ALL THREE SIDES ARE SUMMED AND THE TOTAL IS THEIR SUM. `unplaced` is the
    // ₹16.69 Cr no statement places on either side (see `publicPrivateSplit`);
    // reconstructing the total from `listed + private` alone would silently drop
    // it from live NAV while the statement basis kept it.
    const { listed: listedValue, private: privateValue, unplaced: unplacedValue } =
      publicPrivateSplit(positions);
    return {
      ...basePortfolio, positions, accounts, listedValue, privateValue, unplacedValue,
      totalValue: listedValue + privateValue + unplacedValue,
    };
  }, [basePortfolio, corporateActionLayer, quotes, corporateActions]);

  const consolidated = useMemo(
    () => dedupedPositions(portfolio?.positions ?? []),
    [portfolio],
  );

  const bookIsEmpty = useMemo(() => isEmptyBook(portfolio), [portfolio]);

  // Counted by security, not by position row: the same holding is often held by
  // several accounts, and "53 not live" against a 149-row table reads as wrong.
  //
  // `unpriceable` is split out because it is a different fact. A security with
  // no NSE symbol — cash, a receivable, the liquid-fund sweep — is not waiting
  // on the feed; it has nothing to quote. Counting it as "not live" would report
  // a permanent feed shortfall that no token or network would ever close.
  //
  // `liveWithheld` is split out for the same reason, from the other side: a
  // security whose quote ARRIVED and was held back by the corporate-action check
  // is not waiting on the feed either — it is waiting on a share count (DL-9).
  // Counted where a quote was held back on at least one of its lines and none
  // of them went live, so the three counts partition the not-live securities.
  const { livePriced, notLive, liveWithheld, unpriceable } = useMemo(() => {
    const bySecurity = new Map<string, { live: boolean; hasSymbol: boolean; withheld: boolean }>();
    for (const p of portfolio?.positions ?? []) {
      const e = bySecurity.get(p.securityKey) ?? { live: false, hasSymbol: false, withheld: false };
      e.live = e.live || !!p.live;
      e.hasSymbol = e.hasSymbol || !!symbolFor(p);
      e.withheld = e.withheld || !!liveWithheldReason(p, corporateActionLayer.returns);
      bySecurity.set(p.securityKey, e);
    }
    const all = [...bySecurity.values()];
    return {
      livePriced: all.filter((e) => e.live).length,
      notLive: all.filter((e) => !e.live && e.hasSymbol && !e.withheld).length,
      liveWithheld: all.filter((e) => !e.live && e.hasSymbol && e.withheld).length,
      unpriceable: all.filter((e) => !e.hasSymbol).length,
    };
  }, [portfolio, corporateActionLayer]);

  // The basis the merged book is actually on. LIVE the moment any position
  // carries a live price — from then on the consolidated total no longer equals
  // any statement, and every page showing one has to say so.
  const basis: Basis = livePriced > 0 ? "LIVE" : "STATEMENT";

  const setDisplayCurrency = useCallback((c: DisplayCurrency) => { setCcy(c); writeDisplayCurrency(c); }, []);
  const convertFromBase = useCallback((n: number) => (displayCurrency === "USD" ? n / inrPerUsd : n), [displayCurrency, inrPerUsd]);
  const fmtFromBase = useCallback(
    (n: number | null | undefined, opts?: { compact?: boolean; sign?: boolean }) =>
      (typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency, opts) : "—"),
    [convertFromBase, displayCurrency],
  );
  // Reset to the ingested book (upload override lands in a later prompt).
  const clearPortfolio = useCallback(() => setPortfolio(defaultPortfolio()), []);
  const refreshQuotes = useCallback(() => { loadQuotes(true); }, [loadQuotes]);
  // What the feed has still to answer for. A symbol with no quote and no verdict
  // counts as pending too — the alternative is calling a set complete on a
  // response that never mentioned it.
  const quotesPending = useMemo(() => new Set(quotes?.pending ?? []), [quotes]);
  const pendingFor = useCallback((symbols: readonly string[]) => pendingAmong(quotes, symbols), [quotes]);
  const quoteFeeds = useMemo(() => quoteFeedNames(quotes), [quotes]);
  const value = useMemo<Ctx>(
    () => ({
      portfolio, consolidated, statementPortfolio: basePortfolio, basis,
      bookIsEmpty, displayCurrency, setDisplayCurrency, convertFromBase, fmtFromBase, clearPortfolio, inrPerUsd, fxAsOf, fxIsLive,
      quotesStatus, quoteFeed: quotes, quotesAsOf: quotes?.asOf ?? null, livePriced, notLive, liveWithheld, quoteFeeds, unpriceable, quotesPending, pendingFor, refreshQuotes,
      corporateActions, corporateActionsStatus, corporateActionReturns: corporateActionLayer.returns,
    }),
    [portfolio, consolidated, basePortfolio, basis, bookIsEmpty, displayCurrency, setDisplayCurrency, convertFromBase, fmtFromBase,
     clearPortfolio, inrPerUsd, fxAsOf, fxIsLive, quotesStatus, quotes, livePriced, notLive, liveWithheld, quoteFeeds, unpriceable, quotesPending, pendingFor, refreshQuotes,
     corporateActions, corporateActionsStatus, corporateActionLayer],
  );
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
