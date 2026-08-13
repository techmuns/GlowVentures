import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";
import { MorningCIO } from "@/pages/MorningCIO";
import { PortfolioMonitor } from "@/pages/PortfolioMonitor";
import { FamilyEntities } from "@/pages/FamilyEntities";
import { SectorComposition } from "@/pages/SectorComposition";
import { CapitalGains } from "@/pages/CapitalGains";
import { Performance } from "@/pages/Performance";
import { ReturnAnalysis } from "@/pages/ReturnAnalysis";
import { News } from "@/pages/News";
import { DataRefresh } from "@/pages/DataRefresh";
import { UploadHistory } from "@/pages/UploadHistory";
import { DataAudit } from "@/pages/DataAudit";
import { LedgerInsights } from "@/pages/LedgerInsights";
import { StockInfo } from "@/pages/StockInfo";
import { CompareCompanies } from "@/pages/CompareCompanies";
import { Watchlist } from "@/pages/Watchlist";
// FOOS-spec preview pages — each implements a spec layer whose live data source
// does not exist yet, rendered as a clearly-marked illustrative placeholder.
import { Knowledge } from "@/pages/Knowledge";
import { MacroResearch } from "@/pages/MacroResearch";
import { Economy } from "@/pages/Economy";
import { IndustryResearch } from "@/pages/IndustryResearch";
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
            <Route path="/cio" element={<Gate><MorningCIO /></Gate>} />
            <Route path="/monitor" element={<Gate><PortfolioMonitor /></Gate>} />
            {/* Keyed by securityKey, not ISIN: several providers in this book print
                no ISIN at all, so a route keyed on one would have no address for
                most of the holdings. */}
            <Route path="/stock/:securityKey" element={<Gate><StockInfo /></Gate>} />
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
            <Route path="/industry" element={<IndustryResearch />} />
            <Route path="/thesis" element={<Gate><ThesisMonitor /></Gate>} />
            <Route path="/alerts" element={<Gate><Alerts /></Gate>} />
            <Route path="/capital-gains" element={<Gate><CapitalGains /></Gate>} />
            {/* PRIVATE MARKETS, DATA BANK AND THE FAMILY DASHBOARD ARE REMOVED,
                at the family's request — this book holds no private-market deals
                to track, and every AIF folio the drop does carry is already in
                Portfolio Monitor's own AIF section, folio for folio, with the
                same invested, current value and gain. Their old addresses (and
                the two that Private Markets had already absorbed) redirect
                rather than 404, because links to them exist in this repo's own
                docs and in whatever the family has bookmarked. */}
            <Route path="/look-through" element={<Navigate to="/monitor" replace />} />
            <Route path="/funds" element={<Navigate to="/monitor" replace />} />
            <Route path="/value-creation" element={<Navigate to="/monitor" replace />} />
            <Route path="/private" element={<Navigate to="/monitor" replace />} />
            <Route path="/data-bank" element={<Navigate to="/monitor" replace />} />
            <Route path="/household" element={<Navigate to="/family" replace />} />
            <Route path="/performance" element={<Gate><Performance /></Gate>} />
            <Route path="/returns" element={<Gate><ReturnAnalysis /></Gate>} />
            <Route path="/ledger" element={<LedgerInsights />} />
            <Route path="/news" element={<Gate><News /></Gate>} />
            <Route path="/recommendations" element={<Navigate to="/news" replace />} />
            <Route path="/audit" element={<DataAudit />} />
            <Route path="/history" element={<UploadHistory />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
