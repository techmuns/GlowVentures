import { useEffect, useState } from "react";
import { ExternalLink, FileText, AlertTriangle } from "lucide-react";
import { Card } from "@/components/Card";
import { Markdown } from "@/components/Markdown";
import { FinancialSummary } from "@/components/FinancialSummary";
import { Pill } from "@/components/Pill";
import {
  fetchResearch, isResearchError, researchReason, stalenessNote,
  type Research, type ResearchKind,
} from "@/lib/research";

// Research from the muns endpoints, shown as the upstream wrote it.
//
// Estimates come back as plain text and the financial tables as markdown scraped
// from screener.in. Both are rendered as-is rather than mined for figures — a
// number lifted out of prose has no source to trace back to, which is the one
// thing every other number on this dashboard can do. Read it, don't compute on it.

const TAB_LABEL: Record<ResearchKind, string> = {
  financials: "Financials",
  estimates: "Street estimates",
  // The client spec's DOCUMENT REPOSITORY: annual reports, quarterly reports,
  // investor presentations, earnings-call transcripts and corporate
  // announcements, each with a source link. `documents` is the combined feed
  // across BSE / NSE / DRHP / screener.in; `concalls` is screener.in's transcript
  // list alone, kept because it is the one the upstream answers most reliably.
  documents: "Documents",
  concalls: "Concalls",
};

export function ResearchPanel({ ticker, name }: { ticker: string | null; name: string }) {
  const [tab, setTab] = useState<ResearchKind>("financials");
  const [state, setState] = useState<Research | { failureCode: string; upstreamStatus: number | null; detail: string | null } | null | undefined>(undefined);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setState(undefined);
    fetchResearch(tab, ticker).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [ticker, tab]);

  // No NSE symbol means no research to ask for — the same 21 unmapped securities
  // that can't be priced live. Say which one, rather than showing an empty panel.
  if (!ticker) {
    return (
      <Card className="mt-5" title="Research" subtitle={`${name} has no NSE symbol mapped, so estimates, financials and concalls aren't available for it.`}>
        <p className="text-[12.5px] leading-relaxed text-slate-500">
          The research endpoints are keyed by NSE ticker. This is the same set of holdings — ETFs, warrants and unlisted names — that stay on their workbook mark rather than a live price.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-5" title="Research"
      subtitle="Straight from the data service — read as written; nothing on this dashboard is calculated from it"
      right={<Pill tone="info">{ticker}</Pill>}>
      <div className="mb-3 inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
        {(Object.keys(TAB_LABEL) as ResearchKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
            {TAB_LABEL[k]}
          </button>
        ))}
      </div>

      {state === undefined && <div className="grid h-32 place-items-center text-sm text-slate-500">Loading {TAB_LABEL[tab].toLowerCase()}…</div>}

      {/* SERVED-STALE, SAID OUT LOUD. When the data service is down the edge
          serves its last good copy rather than an empty panel — a 10-year P&L
          does not move intraday, and a blank screen during an outage helps
          nobody. But a stale figure presented as current is exactly what this
          book forbids, so the age is rendered here, above the tables, not
          tucked into a tooltip. */}
      {state && !isResearchError(state) && stalenessNote(state) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{stalenessNote(state)}</span>
        </div>
      )}

      {state && isResearchError(state) && (
        <div className="rounded-lg border border-dashed border-ink-600 bg-ink-900/60 px-4 py-5 text-center">
          <div className="text-sm text-slate-400">{researchReason(state)}</div>
          <div className="mt-1.5 text-[11px] text-slate-600">{state.failureCode}{state.upstreamStatus ? ` · upstream ${state.upstreamStatus}` : ""} · full detail in the browser console</div>
        </div>
      )}

      {state && !isResearchError(state) && state.format === "documents" && (
        state.documents.length ? (
          <ul className="divide-y divide-ink-700/60">
            {state.documents.map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 py-2 text-sm text-slate-200 transition-colors hover:text-champagne-400">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  {d.date && <span className="mono shrink-0 text-[11px] text-slate-500">{d.date}</span>}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-ink-600 bg-ink-900/60 px-4 py-5">
            <div className="text-center text-sm text-slate-400">No documents came back for {ticker}.</div>
            {/* A 200 with nothing in it is more likely a shape we don't recognise
                than a company with no concalls, so the payload is shown rather
                than swallowed. */}
            {state.raw && <pre className="mt-3 max-h-40 overflow-auto rounded border border-ink-700 bg-ink-900 p-2.5 text-[11px] text-slate-500">{state.raw}</pre>}
          </div>
        )
      )}

      {/* DERIVED FIRST, THEN THE SOURCE AS WRITTEN. The growth table is computed
          from the P&L below it, so the reader sees the figure and then the
          document it came out of — which is what makes it checkable. Only the
          financials document carries those tables; estimates are genuinely
          prose and get no summary. */}
      {state && !isResearchError(state) && state.format === "markdown" && tab === "financials" && (
        <FinancialSummary markdown={state.text} ticker={ticker} />
      )}

      {state && !isResearchError(state) && state.format !== "documents" && (
        <div className="max-h-[560px] overflow-auto pr-1">
          {/* Estimates arrive as a pandas pipe-table rather than prose, so both
              formats go through the same renderer; only the financials need
              re-ordering into reading order. */}
          <Markdown text={state.text} ordered={state.format === "markdown"} />
        </div>
      )}
    </Card>
  );
}
