import { Link } from "react-router-dom";
import { FileStack, Inbox } from "lucide-react";

/**
 * Shown wherever a page would otherwise render an empty book as a wall of
 * zeros. The distinction matters: "₹0" is a measurement, "no statements yet" is
 * the absence of one, and only the second is true here.
 */
export function EmptyState() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-champagne-500/30 bg-champagne-500/10 text-champagne-400">
          <Inbox className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-100">No statements ingested yet</h2>
        <p className="mt-2 text-sm text-slate-400">
          Drop the wealth-platform PDFs and ZIPs into <span className="mono text-slate-300">source/</span> and run
          the ingest. Until then this book is empty — the cockpit shows nothing rather than showing zeros as
          if they had been measured.
        </p>
        <Link to="/upload" className="btn-primary mt-5"><FileStack className="h-4 w-4" /> Ingest status</Link>
      </div>
    </div>
  );
}
