import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { BOOK_POLYCAB } from "@/data/glowData";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
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
import { CompareCompanies } from "@/pages/CompareCompanies";
import { Watchlist } from "@/pages/Watchlist";
// FOOS-spec preview pages — each implements a spec layer whose live data source
// does not exist yet, rendered as a clearly-marked illustrative placeholder.
import { Knowledge } from "@/pages/Knowledge";
import { MacroResearch } from "@/pages/MacroResearch";
import { Economy } from "@/pages/Economy";
import { ExposureIPS } from "@/pages/ExposureIPS";
import { ThesisMonitor } from "@/pages/ThesisMonitor";
import { Alerts } from "@/pages/Alerts";
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
    <div className="flex h-screen bg-ink-950 text-slate-200 bg-grid">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
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
            <Route path="/family" element={<Gate><FamilyEntities /></Gate>} />
            <Route path="/exposure" element={<Gate><ExposureIPS /></Gate>} />
            <Route path="/sectors" element={<Gate><SectorComposition /></Gate>} />
            <Route path="/compare" element={<Gate><CompareCompanies /></Gate>} />
            <Route path="/watchlist" element={<Gate><Watchlist /></Gate>} />
            {/* Preview pages — pure illustrative layouts with no book dependency,
                so they render even before statements are ingested. */}
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/macro" element={<MacroResearch />} />
            <Route path="/economy" element={<Economy />} />
            <Route path="/thesis" element={<Gate><ThesisMonitor /></Gate>} />
            <Route path="/alerts" element={<Gate><Alerts /></Gate>} />
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
            <Route path="/industry" element={<Navigate to="/macro" replace />} />
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
