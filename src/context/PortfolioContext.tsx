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
import { dedupedPositions, consolidatedMarketValue } from "@/lib/analytics";
import { SUPPORTED_DISPLAY_CURRENCIES, type DisplayCurrency, DEFAULT_INR_PER_USD, fetchInrPerUsd } from "@/lib/fx";
import { fetchQuotes, symbolsFor, applyQuotes, symbolFor, type QuoteFeed } from "@/lib/quotes";
import { fmtCurrency, displaySecurity } from "@/lib/format";
import { readDisplayCurrency, writeDisplayCurrency } from "@/lib/storage";
import {
  BOOK_SUMMARY, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_NAV_HISTORY, BOOK_CAPITAL_GAINS,
  BOOK_ACCOUNT_CASH_FLOWS, BOOK_ENTITY_CASH_FLOWS,
  BOOK_PE_FUNDS, BOOK_PREIPO_FUNDS, BOOK_UNLISTED_COMPANIES, BOOK_DEBT_FUNDS, BOOK_CLOSED_FUNDS, BOOK_STARTUPS,
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
    accounts: BOOK_ACCOUNTS,
    // Standardise the mixed-case provider spellings once, at the source, so every
    // page (tables, dropdowns, the news/announcement holding tags) shows them the
    // same way. The securityKey is derived upstream from the raw name, so tidying
    // the display string here cannot move a position between groups.
    positions: BOOK_POSITIONS.map((p) => ({ ...p, security: displaySecurity(p.security) })),
    navHistory: BOOK_NAV_HISTORY,
    capitalGains: BOOK_CAPITAL_GAINS,
    // Dated external capital movements per account — the money-weighted-return
    // input. Empty for an account whose statements carry none, which is a real
    // answer and renders as "—" rather than as a return of zero.
    accountCashFlows: BOOK_ACCOUNT_CASH_FLOWS,
    // Keyed by owner — what the per-entity XIRR reads.
    entityCashFlows: BOOK_ENTITY_CASH_FLOWS,
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
  fmtFromBase: (n: number, opts?: { compact?: boolean; sign?: boolean }) => string;
  clearPortfolio: () => void;
  inrPerUsd: number;      // live USD→INR rate (₹ per $1)
  fxAsOf: string | null;  // date of the live rate, if fetched
  // ── Live quotes ───────────────────────────────────────────────────────────
  quotesStatus: QuotesStatus;
  quotesAsOf: string | null;   // when the feed was pulled
  livePriced: number;          // holdings carrying a live price
  notLive: number;             // holdings still on their statement mark
  /**
   * Securities with NO NSE symbol at all — cash balances, receivables and the
   * liquid-fund sweep. These can never go live however well the feed is running,
   * and folding them into `notLive` would read as a feed problem forever.
   */
  unpriceable: number;
  refreshQuotes: () => void;
};

const PortfolioContext = createContext<Ctx | null>(null);

// How often to re-poll the quote feed while a tab is open. The server holds each
// symbol for 60s, so anything shorter just re-reads the edge cache.
const QUOTE_POLL_MS = 60_000;
// While symbols are still unpriced, poll harder — the upstream returns only part
// of the book per call, so the first minute is a fill-in phase.
const QUOTE_FILL_MS = 4_000;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  // The book as ingested. Live prices are layered on top in `portfolio` below,
  // so the statement figures stay available and unmutated underneath.
  const [basePortfolio, setPortfolio] = useState<Portfolio | null>(() => defaultPortfolio());
  const [displayCurrency, setCcy] = useState<DisplayCurrency>(() => readDisplayCurrency() ?? "INR");
  // Live daily USD→INR rate (₹ per $1), fetched once on load; falls back to a
  // static rate so conversions never block on the network.
  const [inrPerUsd, setInrPerUsd] = useState<number>(DEFAULT_INR_PER_USD);
  const [fxAsOf, setFxAsOf] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchInrPerUsd().then((r) => { if (alive && r) { setInrPerUsd(r.inrPerUsd); setFxAsOf(r.date); } });
    return () => { alive = false; };
  }, []);
  // ── Live intraday quotes ────────────────────────────────────────────────────
  // Fetched once on load and then on a timer, and merged into the book here so
  // every page that reads `portfolio.positions` gets live prices without knowing
  // the feed exists. A cold fetch takes ~25s upstream, so the page renders on the
  // statement marks first and the live prices swap in when they land — never a
  // blank screen waiting on the network.
  const [quotes, setQuotes] = useState<QuoteFeed | null>(null);
  const [quotesStatus, setQuotesStatus] = useState<QuotesStatus>("loading");
  const inFlight = useRef(false);

  // Merge each round into what we already have. The upstream only prices part of
  // the book per call, so a later round that returns fewer names must not wipe
  // out prices an earlier round already established.
  const mergeFeed = useCallback((feed: QuoteFeed) => {
    setQuotes((prev) => (prev ? { ...feed, quotes: { ...prev.quotes, ...feed.quotes } } : feed));
  }, []);

  const loadQuotes = useCallback(async (refresh = false) => {
    if (inFlight.current) return 0;
    const symbols = symbolsFor(BOOK_POSITIONS);
    if (!symbols.length) { setQuotesStatus("unavailable"); return 0; }
    inFlight.current = true;
    try {
      const feed = await fetchQuotes(symbols, { refresh });
      if (feed) { mergeFeed(feed); setQuotesStatus("live"); return feed.missing.length; }
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
      const missing = await loadQuotes(refresh);
      if (!alive) return;
      timer = window.setTimeout(() => tick(), missing > 0 ? QUOTE_FILL_MS : QUOTE_POLL_MS);
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
    if (!quotes) return basePortfolio;
    const positions = applyQuotes(basePortfolio.positions, quotes);
    // COUNT ONCE. A raw reduce over `positions` double-counts any holding
    // reported under two members — the 360 ONE AIF is ₹1.46 Cr of exactly that
    // — and the figure it produces disagreed with BOOK_SUMMARY.totalValue,
    // which the ingest already deduped. Two definitions of "consolidated NAV"
    // in one file, one of them wrong on live basis only.
    const listedValue = consolidatedMarketValue(positions);
    return { ...basePortfolio, positions, listedValue, totalValue: listedValue + basePortfolio.privateValue };
  }, [basePortfolio, quotes]);

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
    (n: number, opts?: { compact?: boolean; sign?: boolean }) => fmtCurrency(convertFromBase(n), displayCurrency, opts),
    [convertFromBase, displayCurrency],
  );
  // Reset to the ingested book (upload override lands in a later prompt).
  const clearPortfolio = useCallback(() => setPortfolio(defaultPortfolio()), []);
  const refreshQuotes = useCallback(() => { loadQuotes(true); }, [loadQuotes]);
  const value = useMemo<Ctx>(
    () => ({
      portfolio, consolidated, statementPortfolio: basePortfolio, basis,
      bookIsEmpty, displayCurrency, setDisplayCurrency, convertFromBase, fmtFromBase, clearPortfolio, inrPerUsd, fxAsOf,
      quotesStatus, quotesAsOf: quotes?.asOf ?? null, livePriced, notLive, unpriceable, refreshQuotes,
    }),
    [portfolio, consolidated, basePortfolio, basis, bookIsEmpty, displayCurrency, setDisplayCurrency, convertFromBase, fmtFromBase,
     clearPortfolio, inrPerUsd, fxAsOf, quotesStatus, quotes, livePriced, notLive, unpriceable, refreshQuotes],
  );
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
