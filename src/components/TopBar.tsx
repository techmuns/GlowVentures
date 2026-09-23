import { Sun, Moon, RefreshCw, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio, SUPPORTED_DISPLAY_CURRENCIES, type DisplayCurrency } from "@/context/PortfolioContext";
import { lastQuoteFailure } from "@/lib/quotes";
import { outageShort } from "@/lib/upstreamStatus";
import { MunsChat } from "@/components/MunsChat";
import { SmartSearch } from "@/components/SmartSearch";

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
function QuoteStatus() {
  const { portfolio, quotesStatus, quotesAsOf, livePriced, notLive, quoteFeeds } = usePortfolio();
  if (!portfolio) {
    return <><span className="inline-block h-2 w-2 rounded-full bg-slate-600" /><span className="text-slate-400">Awaiting data</span></>;
  }
  if (quotesStatus === "loading") {
    return <>
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
      <span className="text-slate-400">Fetching prices…</span>
    </>;
  }
  if (quotesStatus === "unavailable") {
    // Name the reason rather than just saying it's off — "Live · 149 not live"
    // with no explanation is what made the last feed outage hard to diagnose.
    const f = lastQuoteFailure();
    const why = f
      ? `${outageShort(f)} Every holding is showing its statement mark, and nothing has been substituted for a live price. (${f.failureCode}${f.upstreamStatus != null ? ` · upstream ${f.upstreamStatus}` : ""}${f.detail ? ` · ${f.detail}` : ""}; full diagnostics in the console.)`
      : "The live price feed is unavailable — every holding is showing its statement mark.";
    return <>
      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
      <span className="text-slate-400" title={why}>
        Marks as of {portfolio.asOf}
        {f && <span className="ml-1 text-amber-500/80">· feed down</span>}
      </span>
    </>;
  }
  const at = quotesAsOf ? new Date(quotesAsOf) : null;
  const clock = at ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  // The count of unpriced holdings stays in the tooltip, not the header. Those
  // rows are already marked individually in the table, where the reader can see
  // which ones they are — a bare number up here just raised questions.
  return <>
    <span className="inline-block h-2 w-2 rounded-full bg-gain shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
    <span className="text-slate-400"
      title={`${livePriced} holdings priced live${quoteFeeds.length ? ` via ${quoteFeeds.join(" and ")}` : ""}${notLive ? ` · ${notLive} on workbook marks — ETFs, warrants and securities the price feed does not carry` : ""}`}>
      Live{clock ? ` ${clock}` : ""}
    </span>
  </>;
}

export function TopBar() {
  const { portfolio, fmtFromBase, clearPortfolio, refreshQuotes, quotesStatus } = usePortfolio();
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
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-ink-700 bg-ink-900/85 px-6 backdrop-blur">
      {/* THE SEARCH BOX WAS A CONTROL THAT SEARCHED NOTHING — an `<input>` with
          no value, no onChange and no handler, sitting in the most prominent
          slot on the app. The Muns chat takes its place: same slot, and it does
          something. Nothing was lost, which is why this is a replacement rather
          than a removal to be asserted. */}
      {/* THE SEARCH, AND MUNS BESIDE IT. The slot is a real search now — over
          every holding, fund, mandate, member, account, page and tab — and a
          question typed into it goes to Muns from the list's own last row. */}
      <div className="flex min-w-0 max-w-3xl flex-1 items-center gap-2">
        <SmartSearch />
        <MunsChat />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 text-xs md:flex"><QuoteStatus /></div>
        <CurrencySwitch />
        {portfolio && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-slate-200"
            title="Current Value of Holdings">
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
