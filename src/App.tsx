import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";
import { MorningCIO } from "@/pages/MorningCIO";
import { PortfolioMonitor } from "@/pages/PortfolioMonitor";
import { FamilyEntities } from "@/pages/FamilyEntities";
import { SectorComposition } from "@/pages/SectorComposition";
import { CapitalGains } from "@/pages/CapitalGains";
import { PrivateMarkets } from "@/pages/PrivateMarkets";
import { DataBank } from "@/pages/DataBank";
import { Performance } from "@/pages/Performance";
import { ReturnAnalysis } from "@/pages/ReturnAnalysis";
import { News } from "@/pages/News";
import { DataRefresh } from "@/pages/DataRefresh";
import { UploadHistory } from "@/pages/UploadHistory";
import { DataAudit } from "@/pages/DataAudit";
import { LedgerInsights } from "@/pages/LedgerInsights";
import { StockInfo } from "@/pages/StockInfo";
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
            <Route path="/sectors" element={<Gate><SectorComposition /></Gate>} />
            <Route path="/capital-gains" element={<Gate><CapitalGains /></Gate>} />
            <Route path="/private" element={<Gate><PrivateMarkets /></Gate>} />
            <Route path="/data-bank" element={<Gate><DataBank /></Gate>} />
            {/* Private Markets absorbed these two pages — keep old links working. */}
            <Route path="/look-through" element={<Navigate to="/monitor" replace />} />
            <Route path="/funds" element={<Navigate to="/private?view=pe" replace />} />
            <Route path="/value-creation" element={<Navigate to="/private?view=startups" replace />} />
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
