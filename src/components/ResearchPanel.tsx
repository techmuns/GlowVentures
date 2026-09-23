import { useEffect, useState } from "react";
import { ExternalLink, FileText, AlertTriangle } from "lucide-react";
import { Card } from "@/components/Card";
import { Markdown } from "@/components/Markdown";
import { FinancialSummary } from "@/components/FinancialSummary";
import { CashFlowPanel } from "@/components/CashFlowPanel";
import { Pill } from "@/components/Pill";
import {
  fetchResearch, isResearchError, researchReason, researchIsOutage, stalenessNote,
  type Research, type ResearchKind,
} from "@/lib/research";
import { outageHeadline } from "@/lib/upstreamStatus";
import { RatioTable } from "@/components/RatioTable";
import { InsiderDeals } from "@/components/InsiderDeals";

// Research from the muns endpoints, shown as the upstream wrote it.
//
// Estimates come back as plain text and the financial tables as markdown scraped
// from screener.in. Both are rendered as-is rather than mined for figures — a
// number lifted out of prose has no source to trace back to, which is the one
// thing every other number on this dashboard can do. Read it, don't compute on it.

/**
 * ── ONE CARD, NOT THREE ─────────────────────────────────────────────────────
 *
 * *"remove what is not necessary and consolidate what can be consolidated so
 * it's one clean template for all."* The position page carried this panel, a
 * separate Ratio analysis card and a separate Insider & bulk deals card one
 * under another, each with its own header and its own loading state, on a page
 * a reader had to scroll through to reach any of them. They are three answers
 * to one question — what does the market say about this COMPANY — so they are
 * three sub-tabs of one card now, on the page's Research tab.
 *
 * `ratios` and `insider` are not research KINDS: each has its own endpoint and
 * its own reader (`RatioTable`, `InsiderDeals`), which keep their identity check
 * and their three distinct failure states unchanged. Only the frame moved, and
 * each is fetched when its sub-tab is opened rather than on every visit.
 */
type PanelTab = ResearchKind | "ratios" | "insider";
const isKind = (t: PanelTab): t is ResearchKind => t !== "ratios" && t !== "insider";

const TAB_LABEL: Record<PanelTab, string> = {
  financials: "Financials",
  // The cash flow statement and the earnings calendar, from a DIFFERENT upstream
  // to the Financials tab beside it — screener's document carries neither.
  statements: "Cash flow",
  // The seven-year ratio table, verified against this holding's own name before
  // a figure from it is shown — see `RatioTable`.
  ratios: "Ratios",
  estimates: "Street estimates",
  // The client spec's DOCUMENT REPOSITORY: annual reports, quarterly reports,
  // investor presentations, earnings-call transcripts and corporate
  // announcements, each with a source link. `documents` is the combined feed
  // across BSE / NSE / DRHP / screener.in; `concalls` is screener.in's transcript
  // list alone, kept because it is the one the upstream answers most reliably.
  documents: "Documents",
  concalls: "Concalls",
  // Dealing by the company's insiders, from the exchange feed — not this family's.
  insider: "Insider deals",
};
/** The order the sub-tabs are offered in: the statements, then the market's view. */
const TAB_ORDER: PanelTab[] = ["financials", "statements", "ratios", "estimates", "documents", "concalls", "insider"];

export function ResearchPanel({ ticker, name }: { ticker: string | null; name: string }) {
  const [tab, setTab] = useState<PanelTab>("financials");
  const [state, setState] = useState<Research | { failureCode: string; upstreamStatus: number | null; detail: string | null } | null | undefined>(undefined);
  /**
   * The screener document, held for the CASH FLOW tab's unit check.
   *
   * That tab reads a second upstream whose figures are rupees printed with a
   * dollar sign, and the reader establishes the real unit by reconciling two
   * lines against screener's statements for the same company. So the check
   * needs BOTH documents, and it is fetched here rather than inside the panel
   * so it survives a tab switch and hits the edge cache once.
   */
  const [screener, setScreener] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker || !isKind(tab)) return;
    let alive = true;
    setState(undefined);
    fetchResearch(tab, ticker).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [ticker, tab]);

  useEffect(() => {
    setScreener(null);
    if (!ticker || tab !== "statements") return;
    let alive = true;
    fetchResearch("financials", ticker).then((r) => {
      if (!alive) return;
      // A failure here is not an error to show: the panel renders "the unit
      // could not be established" from the absence itself, which is the more
      // useful sentence than a second error box about a document the reader
      // did not ask for.
      if (!isResearchError(r) && r.format === "markdown") setScreener(r.text);
    });
    return () => { alive = false; };
  }, [ticker, tab]);

  // No NSE symbol means no research to ask for — the same 21 unmapped securities
  // that can't be priced live. Say which one, rather than showing an empty panel.
  if (!ticker) {
    return (
      <Card className="mt-5" title="Company research">
        {/* ONE LINE, THE REST ITS HOVER (Stage 10cp). */}
        <p className="text-[12.5px] leading-relaxed text-slate-500"
          title={`${name} has no NSE symbol mapped, so its financials, ratios, estimates, filings and insider deals aren't available. The research endpoints are keyed by NSE ticker; this is the same set of holdings — ETFs, warrants and unlisted names — that stay on their workbook mark rather than a live price.`}>
          No NSE symbol mapped — no research to show
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-5" title="Company research"
      subtitle="Straight from the data service — read as written; nothing on this dashboard is calculated from it"
      right={<Pill tone="info">{ticker}</Pill>}>
      {/* KEYED `data-research-tab`, so a claim about which sub-tabs this card
          offers is struck on the control rather than on labels a redesign is
          free to reword — the rule every other tab strip in this app follows. */}
      <div role="tablist" aria-label="Which research to show" data-research-tabs
        className="mb-3 inline-flex w-fit flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
        {TAB_ORDER.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-research-tab={k} onClick={() => setTab(k)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${tab === k ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
            {TAB_LABEL[k]}
          </button>
        ))}
      </div>

      {tab === "ratios" && <RatioTable ticker={ticker} name={name} />}
      {tab === "insider" && <InsiderDeals ticker={ticker} name={name} />}

      {isKind(tab) && state === undefined && <div className="grid h-32 place-items-center text-sm text-slate-500">Loading {TAB_LABEL[tab].toLowerCase()}…</div>}

      {/* SERVED-STALE, SAID OUT LOUD. When the data service is down the edge
          serves its last good copy rather than an empty panel — a 10-year P&L
          does not move intraday, and a blank screen during an outage helps
          nobody. But a stale figure presented as current is exactly what this
          book forbids, so the age is rendered here, above the tables, not
          tucked into a tooltip. */}
      {isKind(tab) && state && !isResearchError(state) && stalenessNote(state) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{stalenessNote(state)}</span>
        </div>
      )}

      {/* AN OUTAGE IS NAMED AS ONE. This box printed "The data service returned
          an error (522)" — a status code shown to a family member, which says
          nothing about what is missing or whether it is their dashboard or the
          provider. The cause now picks the heading: the service being
          unreachable is a fact about the service, and only an empty 200 is a
          fact about the company. */}
      {isKind(tab) && state && isResearchError(state) && (
        <div className="rounded-lg border border-dashed border-ink-600 bg-ink-900/60 px-4 py-5">
          {researchIsOutage(state) && (
            <div className="mb-1.5 flex items-center justify-center gap-2 text-sm font-medium text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{outageHeadline}
            </div>
          )}
          <div className="mx-auto max-w-2xl text-center text-[12.5px] leading-relaxed text-slate-400">
            {researchReason(state, `the ${TAB_LABEL[tab].toLowerCase()} for ${ticker}`)}
          </div>
          <div className="mt-2 text-center text-[11px] text-slate-600">{state.failureCode}{state.upstreamStatus ? ` · upstream ${state.upstreamStatus}` : ""} · full detail in the browser console</div>
        </div>
      )}

      {isKind(tab) && state && !isResearchError(state) && state.format === "documents" && (
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
      {isKind(tab) && state && !isResearchError(state) && state.format === "markdown" && tab === "financials" && (
        <FinancialSummary markdown={state.text} ticker={ticker} />
      )}

      {/* The cash flow tab renders its own tables, so the raw markdown below is
          suppressed for it — the source document is a wall of ninety yfinance
          line items and printing it under the panel would bury the statement. */}
      {isKind(tab) && state && !isResearchError(state) && state.format === "markdown" && tab === "statements" && (
        <CashFlowPanel statementsMarkdown={state.text} screenerMarkdown={screener} ticker={ticker} />
      )}

      {isKind(tab) && state && !isResearchError(state) && state.format !== "documents" && tab !== "statements" && (
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
