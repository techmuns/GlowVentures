import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { BOOK_POLYCAB } from "@/data/glowData";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { IndexStrip } from "@/components/IndexStrip";
import { EmptyState } from "@/components/EmptyState";
import { MorningCIO } from "@/pages/MorningCIO";
import { Polycab } from "@/pages/Polycab";
import { PortfolioMonitor } from "@/pages/PortfolioMonitor";
import { PrivateMarket } from "@/pages/PrivateMarket";
import { FamilyEntities } from "@/pages/FamilyEntities";
import { SectorComposition } from "@/pages/SectorComposition";
import { CapitalGains } from "@/pages/CapitalGains";
import { Performance } from "@/pages/Performance";
import { ReturnAnalysis } from "@/pages/ReturnAnalysis";
import { DataRefresh } from "@/pages/DataRefresh";
import { UploadHistory } from "@/pages/UploadHistory";
import { DataAudit } from "@/pages/DataAudit";
import { LedgerInsights } from "@/pages/LedgerInsights";
import { StockInfo } from "@/pages/StockInfo";
import { MandateHoldings } from "@/pages/MandateHoldings";
import { HoldingsBehind } from "@/pages/HoldingsBehind";
import { CompareCompanies } from "@/pages/CompareCompanies";
import { ExposureIPS } from "@/pages/ExposureIPS";
import { usePortfolio } from "@/context/PortfolioContext";

// A page only renders when there is something real to render. An empty book
// reaches every analytics page as zeros, and a zero that came from "we have no
// statement" is indistinguishable on screen from a zero that was measured — so
// the empty book is stopped here instead.
function Gate({ children }: { children: React.ReactNode }) {
  const { portfolio, bookIsEmpty } = usePortfolio();
  if (!portfolio || bookIsEmpty) return <EmptyState />;
  return <>{children}</>;
}

function RootRedirect() {
  const { portfolio, bookIsEmpty } = usePortfolio();
  return <Navigate to={portfolio && !bookIsEmpty ? "/cio" : "/upload"} replace />;
}

/**
 * A RING-FENCED SECURITY HAS ITS OWN PAGE, AND `StockInfo` WOULD LIE ABOUT IT.
 *
 * `BOOK_POLYCAB` is deliberately outside `BOOK_POSITIONS`, so `StockInfo`'s
 * `rows` filter comes back EMPTY for it — and empty there does not render an
 * absence, it renders the FULLY-EXITED branch: "Position closed", "HOLDING
 * VALUE ₹0", "QUANTITY 0", "This name is fully exited — no current holding".
 * Every one of those is false about a holding of 1.39 Cr shares worth
 * ₹12,351 Cr, and the ₹0 is precisely the failure this book exists to prevent:
 * a measured zero standing where the truth is "counted on another page".
 *
 * That security's page IS `/polycab`, so the address redirects there rather
 * than 404ing — a link, a bookmark or a pasted URL is a promise the app made,
 * and this is the treatment `/news` and `/private` already get.
 *
 * IT IS A WRAPPER RATHER THAN A GUARD INSIDE `StockInfo` because React Router
 * REUSES that component when only the param changes. An early return there
 * would change the hook count between `/stock/abc` and `/stock/<fenced>` on the
 * same mounted instance, which React throws on. Swapping the CHILD is safe.
 *
 * Derived from the book, never from a typed-in key: remove the security from
 * `RINGFENCED_SECURITY_KEYS` in build-book.mjs and `BOOK_POLYCAB` empties, this
 * set empties with it, and the ordinary company page serves the route again.
 */
const RINGFENCED_KEYS = new Set(BOOK_POLYCAB.map((p) => p.securityKey));

function StockRoute() {
  const { securityKey = "" } = useParams();
  if (RINGFENCED_KEYS.has(securityKey)) return <Navigate to="/polycab" replace />;
  return <StockInfo />;
}

export default function App() {
  return (
    <div className="flex h-full bg-ink-950 text-slate-200 bg-grid">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* THE INDEX STRIP IS OUTSIDE `<main>`, DELIBERATELY. The family asked to
            see the four Nifty levels "at all times", so it is mounted here rather
            than on a page — and outside the main region because every
            page-CONTENT invariant in `check:pages` reads `<main>`, and a strip
            repeated on 40 routes would otherwise have to be excused from each of
            them one at a time. That is the same scoping the Polycab absence check
            needed for the same reason. */}
        <IndexStrip />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/upload" element={<DataRefresh />} />
            {/* The family's ring-fenced promoter stock, on its own page — kept OUT
                of every consolidated total and every other route (see
                RINGFENCED_SECURITY_KEYS in build-book.mjs). Reads BOOK_POLYCAB
                directly, never the portfolio context, so it cannot leak back in. */}
            <Route path="/polycab" element={<Gate><Polycab /></Gate>} />
            <Route path="/cio" element={<Gate><MorningCIO /></Gate>} />
            <Route path="/monitor" element={<Gate><PortfolioMonitor /></Gate>} />
            {/* THE PRIVATE BOOK THIS DROP ACTUALLY CARRIES — not the
                fund-of-funds tracker removed at Stage 10f. See the note on the
                redirects below, and the header of PrivateMarket.tsx. */}
            <Route path="/private-market" element={<Gate><PrivateMarket /></Gate>} />
            {/* Keyed by securityKey, not ISIN: several providers in this book print
                no ISIN at all, so a route keyed on one would have no address for
                most of the holdings. */}
            <Route path="/stock/:securityKey" element={<Gate><StockRoute /></Gate>} />
            {/* ONE DISCRETIONARY MANDATE AND EVERY SHARE INSIDE IT — the
                drill-down the family asked for three times. A stock held through
                a PMS is shown here, under the manager who chose it, which is
                what lets the holdings tables call the rest "Direct Equity"
                honestly. Keyed by accountId because a mandate IS an account: the
                same manager runs two of them for two family members, and each
                has its own strategy, its own as-of and its own statement total
                to tie to. */}
            <Route path="/mandate/:accountId" element={<Gate><MandateHoldings /></Gate>} />
            {/* WHAT IS BEHIND A FIGURE — the drill-down every total on Morning
                CIO now opens into: each allocation row, each KPI tile and each
                concentration figure. The SET lives in the address (`?of=`, plus
                `?key=` for one allocation row) rather than in component state,
                so a figure's drill-down can be linked, bookmarked and — the
                reason it matters here — WALKED BY `check:pages`, which is what
                lets an invariant assert that the drill-down's own total
                reconstructs the tile it opened from.

                One route rather than one per figure: a drill-down is not a new
                measurement, it is the same book over a different subset, and
                thirteen pages would be thirteen chances to disagree with the
                screen they were reached from. `src/lib/drilldown.ts` owns the
                subsets and is called by BOTH sides. */}
            <Route path="/holdings" element={<Gate><HoldingsBehind /></Gate>} />
            <Route path="/family" element={<Gate><FamilyEntities /></Gate>} />
            <Route path="/exposure" element={<Gate><ExposureIPS /></Gate>} />
            <Route path="/sectors" element={<Gate><SectorComposition /></Gate>} />
            <Route path="/compare" element={<Gate><CompareCompanies /></Gate>} />
            {/* WATCHLIST & TARGETS was REMOVED at the family's request — the tab,
                its nav entry and `src/pages/Watchlist.tsx` with it.

                NOTHING THE FAMILY TYPED WAS DELETED. `src/lib/watchlist.ts` is
                untouched, so every target price, fair value, entry/exit level,
                valuation method and target weight they entered is still stored
                and still read and written by `InvestmentTools` on a name's own
                company page — the same treatment `deals.ts` and `household.ts`
                got when their pages went in Stage 10f. Compare Companies still
                renders the target and the upside beside the price, which is why
                this forwards THERE rather than to the monitor: it is the
                surviving surface in the same nav group that carries these
                figures. It redirects rather than 404s because a bookmark is a
                promise the app made, and the removal is verified by asserting it
                happened — see `check-family-inputs.mjs`. */}
            <Route path="/watchlist" element={<Navigate to="/compare" replace />} />
            {/* KNOWLEDGE & MEMORY, MACRO RESEARCH and ECONOMY & MACRO were all
                REMOVED at the family's request — the three pages, their nav
                entries and every module left with no other caller.

                ALL THREE FORWARD TO THE DASHBOARD HOME, and that is a decision
                rather than a default. The pattern elsewhere in this file sends a
                removed address to the surviving surface nearest its purpose —
                /private to the private book, /watchlist to Compare Companies.
                Nothing that survives holds the family's own notes, and nothing
                that survives renders a commodity, index, currency or macro
                series. Pointing these at a page that merely looks adjacent would
                assert a continuity that does not exist, which is the stale
                routing Stage 9d removed the day the calendar was wired. They
                redirect rather than 404 because a bookmark is a promise the app
                made, and the removal is verified by asserting it happened — see
                `check-family-inputs.mjs`.

                WHAT DID NOT GO WITH THEM. `src/lib/series.ts` and
                `SeriesChart.tsx` stay: `ReturnsTable` draws a company's price
                history with both, and `CompareCompanies` and `navSeries.test.ts`
                read the same types. `public/series/` and `npm run harvest` stay
                too — the RBI and IEX series in that store are ACCUMULATING, built
                one observation per run because their sources publish only a
                current value, so stopping the harvest would not pause a series,
                it would end it with no way to backfill. */}
            <Route path="/knowledge" element={<Navigate to="/cio" replace />} />
            <Route path="/macro" element={<Navigate to="/cio" replace />} />
            <Route path="/economy" element={<Navigate to="/cio" replace />} />
            {/* THESIS & TRIGGERS and ALERTS were REMOVED at the family's request —
                both pages, both nav entries, and with them the whole MONITOR nav
                group, which held nothing else.

                BOTH FORWARD TO EXPOSURE & IPS, which is the surviving surface
                nearest their purpose rather than a neutral fallback. All three
                were the family-input layer: a thesis, an alert rule and an IPS
                target are things the family TYPES, not figures a statement
                reports. Exposure & IPS is the one that stays, it holds the IPS
                targets and the bucket mapping, and — the part that decides it —
                it carries the Export/Import that round-trips the WHOLE store in
                one file, theses and alert rules included. So it is now the only
                way to reach a stored thesis or alert rule, which makes it the
                honest destination for someone who bookmarked either page.

                NOTHING THE FAMILY TYPED WAS DELETED. `src/lib/familyInputs.ts`
                is untouched: every thesis, trigger, review date and alert rule
                they entered is still stored and still exports — the same
                treatment `deals.ts` and `household.ts` got at Stage 10f and
                `watchlist.ts` at Stage 10w. `alertEngine.ts` stays too, because
                Exposure & IPS reads `bucketActuals` and `bucketWeightPct` from
                it; only `evaluateAlerts` and `ALERT_KIND_LABEL`, which had no
                caller left, went with the page. */}
            <Route path="/thesis" element={<Navigate to="/exposure" replace />} />
            <Route path="/alerts" element={<Navigate to="/exposure" replace />} />
            <Route path="/capital-gains" element={<Gate><CapitalGains /></Gate>} />
            {/* THE FUND-OF-FUNDS PRIVATE MARKETS PAGE OF Stage 10f IS STILL
                GONE, and so are the Data Bank and the Family Dashboard. What
                stands at /private-market is a DIFFERENT page: the private book
                this drop actually carries — the AIF folios, the capital accounts
                behind them, and the folios whose fund publishes no valuation at
                all. None of that is the TVPI/DPI/startup tracker the family
                asked to remove, whose six source arrays are still empty and are
                named as absent on the new page rather than drawn.

                /private and the addresses that were TABS of the removed page
                forward THERE rather than to the monitor: leaving them pointed at
                a page with no private-market content while a live Private Market
                page exists one link away is a stale routing decision, the same
                one Stage 9d removed the day the calendar was wired.

                /data-bank and /household do NOT move — neither is about private
                markets. Every one of these redirects rather than 404s because
                links to them exist in this repo's docs and in whatever the
                family has bookmarked. */}
            <Route path="/look-through" element={<Navigate to="/private-market" replace />} />
            <Route path="/funds" element={<Navigate to="/private-market" replace />} />
            <Route path="/value-creation" element={<Navigate to="/private-market" replace />} />
            {/* Industry Research was removed at Stage 9c and forwarded to Macro
                Research, which has now gone the same way. Chained, a bookmark
                still LANDS on /cio — which is exactly why this is fixed in the
                route table rather than left to a check to catch: the suite reads
                where a redirect lands, and two hops land where one does. */}
            <Route path="/industry" element={<Navigate to="/cio" replace />} />
            <Route path="/private" element={<Navigate to="/private-market" replace />} />
            <Route path="/data-bank" element={<Navigate to="/monitor" replace />} />
            <Route path="/household" element={<Navigate to="/family" replace />} />
            <Route path="/performance" element={<Gate><Performance /></Gate>} />
            <Route path="/returns" element={<Gate><ReturnAnalysis /></Gate>} />
            <Route path="/ledger" element={<LedgerInsights />} />
            {/* News & Announcements was REMOVED at the family's request. Both
                paths redirect rather than 404, because a bookmark is a promise
                the app made and a removal is verified by asserting it happened —
                see `check-pages.mjs`. */}
            <Route path="/news" element={<Navigate to="/monitor" replace />} />
            <Route path="/recommendations" element={<Navigate to="/monitor" replace />} />
            <Route path="/audit" element={<DataAudit />} />
            <Route path="/history" element={<UploadHistory />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
