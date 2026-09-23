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
import { dedupedPositions, publicPrivateSplit, holdingBucket, DIRECT_EQUITY_BUCKET, currentHoldings } from "@/lib/analytics";
import { buildCapitalModel, type CapitalModel } from "@/lib/capital";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { SUPPORTED_DISPLAY_CURRENCIES, type DisplayCurrency, DEFAULT_INR_PER_USD, fetchInrPerUsd } from "@/lib/fx";
import { fetchQuotes, symbolsFor, applyQuotes, symbolFor, pendingAmong, quoteFeedNames, type QuoteFeed } from "@/lib/quotes";
import { applyFundNavs } from "@/lib/fundNavs";
import { readCachedQuotes, writeCachedQuotes } from "@/lib/quoteCache";
import { fmtCurrency } from "@/lib/format";
import { holdingLabel } from "@/lib/schemeLabel";
import { readDisplayCurrency, writeDisplayCurrency } from "@/lib/storage";
import {
  BOOK_SUMMARY, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_NAV_HISTORY, BOOK_CAPITAL_GAINS,
  BOOK_ACCOUNT_CASH_FLOWS, BOOK_ENTITY_CASH_FLOWS,
  BOOK_PE_FUNDS, BOOK_PREIPO_FUNDS, BOOK_UNLISTED_COMPANIES, BOOK_DEBT_FUNDS, BOOK_CLOSED_FUNDS, BOOK_STARTUPS,
  BOOK_COMMITMENTS, BOOK_CAPITAL_MOVES, BOOK_ACCOUNT_BRIDGES, BOOK_POSITION_TRANCHES,
} from "@/data/glowData";

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
    accounts: BOOK_ACCOUNTS,
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
    positions: BOOK_POSITIONS.map((p) => ({ ...p, security: holdingLabel(p.securityKey, p.security) })),
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
  /**
   * THE CAPITAL BEHIND EACH INVESTMENT — what the family put into every account
   * whose statements publish it, and what any set of positions has returned on
   * it. Built once, on the book as it is shown (`portfolio`, current holdings),
   * so every surface that prints an Invested figure or a return beside a whole
   * account reads ONE answer. See `src/lib/capital.ts` for the rule and why the
   * cost of the units held is the wrong basis for an investment's return.
   */
  capital: CapitalModel;
  /**
   * The same model on `statementPortfolio` — for a page that must tie to the
   * PDF, where a value that drifted with the market would give a return no
   * statement supports. Capital itself never moves with a price (§6); only the
   * value it is compared with does.
   */
  statementCapital: CapitalModel;
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
  quotesAsOf: string | null;   // when the feed was pulled
  livePriced: number;          // holdings carrying a live price
  notLive: number;             // holdings still on their statement mark
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
  return [...out];
})();

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  // The book as ingested. Live prices are layered on top in `portfolio` below,
  // so the statement figures stay available and unmutated underneath.
  const [basePortfolio, setPortfolio] = useState<Portfolio | null>(() => defaultPortfolio());
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
      const next = prev ? { ...feed, quotes: { ...prev.quotes, ...feed.quotes } } : feed;
      // Kept for the next open. Written from the MERGED feed rather than the
      // round, so a snapshot holds the whole book rather than whichever slice
      // the last call happened to price.
      writeCachedQuotes(next);
      return next;
    });
  }, []);

  const loadQuotes = useCallback(async (refresh = false) => {
    if (inFlight.current) return 0;
    const symbols = symbolsFor(BOOK_POSITIONS);
    if (!symbols.length) { setQuotesStatus("unavailable"); return 0; }
    inFlight.current = true;
    try {
      const feed = await fetchQuotes(symbols, { refresh, priority: PRIORITY_SYMBOLS });
      // THE FILL POLL RUNS ON `pending`, NEVER ON `missing`. A deferred symbol
      // is answered in seconds; one the upstream cannot price never is, so
      // polling on it held this book at a four-second cadence for the life of
      // the tab while nothing could change.
      if (feed) { mergeFeed(feed); setQuotesStatus("live"); return feed.pending.length; }
      setQuotesStatus((s) => (s === "live" ? "live" : "unavailable"));
      return 0;
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
      const pending = await loadQuotes(refresh);
      if (!alive) return;
      timer = window.setTimeout(() => tick(), pending > 0 ? QUOTE_FILL_MS : QUOTE_POLL_MS);
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
  // never touched here, because no live price is evidence about any of them.
  // `basePortfolio` is kept intact alongside and handed out as
  // `statementPortfolio`, so a page that must reconcile has the printed figures
  // available rather than having to un-mix them.
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
    const positions = applyFundNavs(applyQuotes(basePortfolio.positions, quotes));
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
      ...basePortfolio, positions, listedValue, privateValue, unplacedValue,
      totalValue: listedValue + privateValue + unplacedValue,
    };
  }, [basePortfolio, quotes]);

  const consolidated = useMemo(
    () => dedupedPositions(portfolio?.positions ?? []),
    [portfolio],
  );

  const bookIsEmpty = useMemo(() => isEmptyBook(portfolio), [portfolio]);

  // THE UNIVERSE IS WHAT THE SURFACES DRAW FROM. The whole-account rule compares
  // a set's value against the account's own value over this universe, so it has
  // to be the CURRENT HOLDINGS every table filters its rows from — a set that
  // dropped a ₹54 speck could otherwise never carry a whole account.
  const capital = useMemo(() => buildCapitalModel({
    accounts: BOOK_ACCOUNTS, capitalMoves: BOOK_CAPITAL_MOVES, bridges: BOOK_ACCOUNT_BRIDGES,
    commitments: BOOK_COMMITMENTS, tranches: BOOK_POSITION_TRANCHES,
    positions: currentHoldings(portfolio?.positions ?? []),
  }), [portfolio]);
  const statementCapital = useMemo(() => buildCapitalModel({
    accounts: BOOK_ACCOUNTS, capitalMoves: BOOK_CAPITAL_MOVES, bridges: BOOK_ACCOUNT_BRIDGES,
    commitments: BOOK_COMMITMENTS, tranches: BOOK_POSITION_TRANCHES,
    positions: currentHoldings(basePortfolio?.positions ?? []),
  }), [basePortfolio]);

  // Counted by security, not by position row: the same holding is often held by
  // several accounts, and "53 not live" against a 149-row table reads as wrong.
  //
  // `unpriceable` is split out because it is a different fact. A security with
  // no NSE symbol — cash, a receivable, the liquid-fund sweep — is not waiting
  // on the feed; it has nothing to quote. Counting it as "not live" would report
  // a permanent feed shortfall that no token or network would ever close.
  const { livePriced, notLive, unpriceable } = useMemo(() => {
    const bySecurity = new Map<string, { live: boolean; hasSymbol: boolean }>();
    for (const p of portfolio?.positions ?? []) {
      const e = bySecurity.get(p.securityKey) ?? { live: false, hasSymbol: false };
      e.live = e.live || !!p.live;
      e.hasSymbol = e.hasSymbol || !!symbolFor(p);
      bySecurity.set(p.securityKey, e);
    }
    const all = [...bySecurity.values()];
    return {
      livePriced: all.filter((e) => e.live).length,
      notLive: all.filter((e) => !e.live && e.hasSymbol).length,
      unpriceable: all.filter((e) => !e.hasSymbol).length,
    };
  }, [portfolio]);

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
      portfolio, consolidated, statementPortfolio: basePortfolio, capital, statementCapital, basis,
      bookIsEmpty, displayCurrency, setDisplayCurrency, convertFromBase, fmtFromBase, clearPortfolio, inrPerUsd, fxAsOf, fxIsLive,
      quotesStatus, quotesAsOf: quotes?.asOf ?? null, livePriced, notLive, quoteFeeds, unpriceable, quotesPending, pendingFor, refreshQuotes,
    }),
    [portfolio, consolidated, basePortfolio, capital, statementCapital, basis, bookIsEmpty, displayCurrency, setDisplayCurrency, convertFromBase, fmtFromBase,
     clearPortfolio, inrPerUsd, fxAsOf, fxIsLive, quotesStatus, quotes, livePriced, notLive, quoteFeeds, unpriceable, quotesPending, pendingFor, refreshQuotes],
  );
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
