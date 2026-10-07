import { Sun, Moon, RefreshCw, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio, SUPPORTED_DISPLAY_CURRENCIES, type DisplayCurrency } from "@/context/PortfolioContext";
import { lastQuoteFailure } from "@/lib/quotes";
import { outageShort } from "@/lib/upstreamStatus";
import { SmartSearch } from "@/components/SmartSearch";
import { MemberScopeSelect } from "@/components/MemberScopeSelect";
import { valuationDates, dateSpan, valuationNote as blendNote, type ValuationDates } from "@/components/BasisPill";

const THEME_KEY = "glow:theme";

function readInitialTheme(): boolean {
  try { return localStorage.getItem(THEME_KEY) === "dark"; } catch { return false; }
}

function CurrencySwitch() {
  const { displayCurrency, setDisplayCurrency, inrPerUsd, fxAsOf, fxIsLive } = usePortfolio();
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5" role="group" aria-label="Display currency">
        {SUPPORTED_DISPLAY_CURRENCIES.map((c: DisplayCurrency) => {
          const active = displayCurrency === c;
          return (
            <button key={c} onClick={() => setDisplayCurrency(c)} aria-pressed={active}
              className={["rounded px-2 py-0.5 text-[11px] font-medium tabular transition-colors active:scale-[0.97]",
                active ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {c}
            </button>
          );
        })}
      </div>
      {/* THE RATE SAYS WHETHER IT IS ONE. Every USD figure in the cockpit is this
          number's divisor, so a stale fallback is wrong everywhere at once — and
          it rendered identically to a live rate, with "fallback rate" only in a
          tooltip that a touch device, a screenshot and a non-hovering reader all
          miss. The quote feed already flags a price it could not refresh; the
          rate gets the same treatment, in the chip rather than behind it. */}
      {displayCurrency === "USD" && (
        <span
          className={["hidden items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] tabular sm:inline-flex",
            fxIsLive ? "text-slate-400" : "border border-amber-500/40 bg-amber-500/10 text-amber-400"].join(" ")}
          title={fxIsLive
            ? `USD → INR reference rate${fxAsOf ? ` · as of ${fxAsOf}` : ""}`
            : "The FX feed did not respond. Every USD figure on screen is converted at a STATIC fallback rate, not today's — switch to INR for figures that tie to the statements."}>
          $1 = ₹{inrPerUsd.toFixed(2)}
          {!fxIsLive && <span className="font-semibold uppercase tracking-wide">· fallback</span>}
        </span>
      )}
    </div>
  );
}

// Live-quote state, stated honestly. The dot used to be hard-coded green whenever
// a book was loaded, which would now claim "Live" even with the feed down.
/**
 * ── THE DATE BESIDE THE BOOK IS THE SPAN ITS MARKS WERE STRUCK ON ────────────
 *
 * This read "Marks as of {portfolio.asOf}" — the NEWEST account date in the
 * book, 2026-08-29 on this drop, which is the date of two custody accounts that
 * carry no valued position. Not one rupee of the current value was marked on it
 * (MNT-7 · CK-C1). The figure beside it BLENDS statement marks struck from
 * 31 Mar to 13 Aug with AMFI's published NAV on the mutual funds, so the top bar
 * now prints the span and the NAV date, and the hover says how much of the value
 * sits on each — `valuationDates`, the one split every surface can read.
 *
 * AND "EVERY HOLDING IS SHOWING ITS STATEMENT MARK" WAS FALSE (MNT-8): the NAV
 * overlay runs whether or not the quote feed answers.
 */
function markLine(vd: ValuationDates): string {
  const st = vd.statement.map((x) => x.date);
  const nav = vd.nav.map((x) => x.date);
  return [st.length ? `Marks ${dateSpan(st)}` : null, nav.length ? `NAV ${dateSpan(nav)}` : null]
    .filter(Boolean).join(" · ");
}


function QuoteStatus() {
  const { portfolio, quotesStatus, quotesAsOf, livePriced, notLive, liveWithheld, unpriceable, quoteFeeds, fmtFromBase } = usePortfolio();
  if (!portfolio) {
    return <><span className="inline-block h-2 w-2 rounded-full bg-slate-600" /><span className="text-slate-400">Awaiting data</span></>;
  }
  if (quotesStatus === "loading") {
    return <>
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
      <span className="text-slate-400">Fetching prices…</span>
    </>;
  }
  const vd = valuationDates(portfolio);
  const money = (n: number) => fmtFromBase(n, { compact: true });
  const at = quotesAsOf ? new Date(quotesAsOf) : null;
  const clock = at ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  if (quotesStatus === "unavailable") {
    // Name the reason rather than just saying it's off — "Live · 149 not live"
    // with no explanation is what made the last feed outage hard to diagnose.
    const f = lastQuoteFailure();
    /**
     * A FAILED ROUND OVER A CACHED SNAPSHOT IS NOT "NOTHING SUBSTITUTED" (MNT-18).
     * The app opens on the session's last snapshot (`quoteCache.ts`) and a failed
     * fetch keeps it applied — so `livePriced` can be above zero while the status
     * is unavailable. Saying every holding is on its statement mark would then be
     * false about exactly the prices on screen; this names the snapshot's time.
     */
    const cached = livePriced > 0;
    const state = cached
      ? `The live feed did not answer this round. ${livePriced} securit${livePriced === 1 ? "y carries" : "ies carry"} the last prices it returned${clock ? ` at ${clock}` : ""}, cached this session; nothing else carries a live price.`
      : "The live feed did not answer, so no holding carries a live price.";
    const why = [
      f ? `${outageShort(f)}` : null,
      state,
      blendNote(vd, money),
      f ? `(${f.failureCode}${f.upstreamStatus != null ? ` · upstream ${f.upstreamStatus}` : ""}${f.detail ? ` · ${f.detail}` : ""}; full diagnostics in the console.)` : null,
    ].filter(Boolean).join(" ");
    return <>
      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
      <span className="text-slate-400" title={why} data-testid="topbar-marks">
        {cached ? `Cached ${clock ?? "prices"}` : markLine(vd) || "No valued holding"}
        {f && <span className="ml-1 text-amber-500/80">· feed down</span>}
      </span>
    </>;
  }
  /**
   * WHAT THE PILL COUNTS, IN THE UNIT IT COUNTS (MNT-9). These are SECURITIES,
   * not holdings; the ones on statement marks are statement marks, not
   * "workbook marks"; and the securities no NSE symbol resolves — which no feed
   * will ever price — were never mentioned, so a best-case "every symbol priced"
   * read as the whole book being live. The value split says how much is.
   *
   * AND THE TWO KINDS OF NOT-LIVE ARE NAMED APART (DL-9). A security with no
   * quote in this round and one whose quote the corporate-action check held
   * back are both on their statement mark, for different reasons.
   */
  return <>
    <span className="inline-block h-2 w-2 rounded-full bg-gain shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
    <span className="text-slate-400" data-testid="topbar-live" data-quote-coverage
      title={[
        `${livePriced} securit${livePriced === 1 ? "y" : "ies"} priced live${quoteFeeds.length ? ` via ${quoteFeeds.join(" and ")}` : ""}.`,
        notLive ? `${notLive} ha${notLive === 1 ? "s" : "ve"} an NSE symbol and no quote this round, so ${notLive === 1 ? "it stays" : "they stay"} on ${notLive === 1 ? "its" : "their"} statement mark.` : null,
        liveWithheld ? `${liveWithheld} had a quote the corporate-action check held back, because the statement's share count may not match it, so ${liveWithheld === 1 ? "it stays" : "they stay"} on ${liveWithheld === 1 ? "its" : "their"} statement mark.` : null,
        unpriceable ? `${unpriceable} resolve${unpriceable === 1 ? "s" : ""} no NSE symbol and can never be priced live — ${unpriceable === 1 ? "it stays" : "they stay"} on ${unpriceable === 1 ? "its" : "their"} statement mark, or AMFI's published NAV for a mutual fund.` : null,
        blendNote(vd, money),
      ].filter(Boolean).join(" ")}>
      Live{clock ? ` ${clock}` : ""}
    </span>
  </>;
}

export function TopBar() {
  const { portfolio, fmtFromBase, clearPortfolio, refreshQuotes, quotesStatus, scope } = usePortfolio();
  const [isDark, setIsDark] = useState<boolean>(readInitialTheme);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) html.classList.add("dark"); else html.classList.remove("dark");
    try { localStorage.setItem(THEME_KEY, isDark ? "dark" : "light"); } catch {}
  }, [isDark]);

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    clearPortfolio();  // reload the ingested book from source
    refreshQuotes();   // and force a fresh pull past the 60s server cache
    window.setTimeout(() => setRefreshing(false), 700);
  };

  return (
    // `z-40`, NOT `z-10`. `backdrop-blur` makes this header a stacking context,
    // so the search list's own `z-50` counts only INSIDE it — and the page's KPI
    // tiles lift their label and figure to `z-10` later in the document, which
    // at an equal z-index paints over the whole header, list and all. Measured
    // on Morning CIO: "Current value of holdings" and its figure drew through
    // every search list. `<main>` scrolls in its own box below this, so nothing
    // else ever overlaps the header.
    <header className="app-topbar sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-ink-700 bg-ink-900/85 px-6 backdrop-blur">
      {/* THE SEARCH BOX WAS A CONTROL THAT SEARCHED NOTHING — an `<input>` with
          no value, no onChange and no handler, sitting in the most prominent
          slot on the app. The Muns chat takes its place: same slot, and it does
          something. Nothing was lost, which is why this is a replacement rather
          than a removal to be asserted. */}
      {/* THE SEARCH, AND NOTHING BESIDE IT. The slot is a real search — over
          every holding, fund, mandate, member, account, page and tab.

          THE "ASK MUNS" BUTTON THAT STOOD BESIDE IT IS GONE, at the family's
          request (Stage 10bz): *"Remove Ask muns from here, dont want this
          right now."* So is the search list's own Ask Muns row, which offered
          the same chat on every query. "Right now" is why the chat is PAUSED
          rather than deleted: `MunsChat` is kept whole, with its reasons for
          every choice, and comes back by rendering `<MunsChat />` beside
          `<SmartSearch />` here. `check:pages`' `chat` route asserts the
          button stays gone until then. */}
      {/* WHOSE BOOK, FIRST (Stage 10di): the whole family by default, or the
          members and trusts picked — every page below follows it except
          Family & Entities, which always shows everyone. */}
      <MemberScopeSelect />
      <div className="flex min-w-0 max-w-3xl flex-1 items-center gap-2">
        <SmartSearch />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 text-xs lg:flex"><QuoteStatus /></div>
        <CurrencySwitch />
        {/* A scope with no holding draws no total: ₹0 would read as a measured
            nothing, and the page below already says why it is empty. */}
        {portfolio && (!scope.owners || portfolio.positions.length > 0) && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-slate-200"
            title={scope.selected ? `Current Value of Holdings · ${scope.label}` : "Current Value of Holdings"} data-topbar-total>
            <TrendingUp className="h-3.5 w-3.5 text-champagne-400" /> {fmtFromBase(portfolio.totalValue, { compact: true })}
          </span>
        )}
        <div className="flex items-center gap-2 border-l border-ink-700 pl-3">
          <button onClick={refresh} disabled={refreshing} className="btn-ghost h-9 px-2.5" title="Reload data">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setIsDark((v) => !v)} className="btn-ghost h-9 px-2.5" title="Toggle theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
