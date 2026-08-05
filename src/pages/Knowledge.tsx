import { useState } from "react";
import {
  BookOpen, Search, Sparkles, Users, Tag, MessageSquare, Building2, Newspaper, Mic, GraduationCap,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { PreviewBanner, PreviewBadge, PreviewNum, PreviewPill, previewTile } from "@/components/Preview";

// LAYER 1 — KNOWLEDGE & MEMORY (FOOS spec).
//
// The spec's "most important layer": every manager meeting, fund pitch, IC
// discussion, conference note, book and podcast captured, tagged and queryable in
// natural language. None of it exists yet — there is no note store, no tagging
// model and no AI index — so this whole page is a PREVIEW of the eventual layout.

// The twelve source types the spec lists, with the icon we would file each under.
const SOURCES: { label: string; icon: typeof BookOpen; sample: number }[] = [
  { label: "Manager meetings", icon: Users, sample: 84 },
  { label: "Fund pitches", icon: Building2, sample: 37 },
  { label: "Product presentations", icon: BookOpen, sample: 29 },
  { label: "Investment committee", icon: MessageSquare, sample: 52 },
  { label: "External interactions", icon: Users, sample: 41 },
  { label: "Tax discussions", icon: MessageSquare, sample: 18 },
  { label: "Deal discussions", icon: Building2, sample: 23 },
  { label: "Macro calls", icon: Newspaper, sample: 44 },
  { label: "Conference notes", icon: Mic, sample: 31 },
  { label: "Books", icon: GraduationCap, sample: 26 },
  { label: "Podcasts", icon: Mic, sample: 39 },
  { label: "Research reports", icon: Newspaper, sample: 112 },
];

// The three example queries the spec gives verbatim, each with the kind of
// aggregated answer the engine would return.
const EXAMPLE_QUERIES: { q: string; a: string }[] = [
  {
    q: "Show me every discussion we've had on small-cap valuations since 2024",
    a: "Consolidated notes from 11 manager meetings, 4 IC discussions and 6 research reports — with the chronology and each manager's stance.",
  },
  {
    q: "What have our managers said about manufacturing since 2023?",
    a: "Aggregated manager views with a chronology, grouped by manager and theme, most recent first.",
  },
  {
    q: "Which direct investments have highest exposure to the AI theme?",
    a: "Direct-investment mapping ranked by tagged AI exposure, linked back to the source note for each.",
  },
];

// Sample tagged notes — the spec's tagging model: Asset Class, Geography, Theme,
// Source, Manager, Risk, Decision status.
const NOTES: {
  note: string; date: string; source: string; manager: string; theme: string;
  assetClass: string; geography: string; risk: string; status: string;
}[] = [
  { note: "SMID valuations stretched; rotating to quality compounders", date: "12 Jun 2026", source: "Manager meeting", manager: "Aristos", theme: "SMID", assetClass: "Equity", geography: "India", risk: "Moderate", status: "Invested" },
  { note: "Manufacturing capex cycle broadening beyond autos", date: "28 May 2026", source: "IC discussion", manager: "GLC", theme: "Manufacturing", assetClass: "Equity", geography: "India", risk: "Moderate", status: "Approved" },
  { note: "Private credit yields attractive vs listed debt", date: "09 May 2026", source: "Fund pitch", manager: "Carnelian", theme: "Credit", assetClass: "AIF", geography: "India", risk: "High", status: "Watchlist" },
  { note: "AI infra a multi-year theme; prefer picks-and-shovels", date: "21 Apr 2026", source: "Conference", manager: "V.E.C Assago", theme: "AI", assetClass: "Equity", geography: "Global", risk: "High", status: "Research" },
  { note: "Exited on governance concerns after promoter pledge rose", date: "03 Apr 2026", source: "Manager meeting", manager: "Aristos", theme: "Financials", assetClass: "Equity", geography: "India", risk: "High", status: "Exited" },
];

const STATUS_TONE: Record<string, string> = {
  Invested: "text-gain",
  Approved: "text-champagne-400",
  Watchlist: "text-amber-400",
  Research: "text-slate-400",
  Exited: "text-loss",
};

export function Knowledge() {
  const [query, setQuery] = useState("");
  return (
    <div>
      <PageHeader
        eyebrow="Knowledge & Memory · Layer 1"
        title="Knowledge & Memory"
        subtitle="Every manager meeting, fund pitch, IC discussion, conference note, book and podcast — captured, tagged, and queryable in natural language."
        right={<PreviewBadge />}
      />

      <PreviewBanner source="a notes store, a tagging model and an AI index" layer="FOOS Layer 1">
        The muns catalogue's document search covers muns' own corpus, not the family's private notes — so capture,
        tagging and natural-language recall need a dedicated store that this drop does not include.
      </PreviewBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Notes captured" {...previewTile("636", "across all sources")} icon={<BookOpen className="h-4 w-4" />} />
        <StatTile label="Sources tracked" {...previewTile("12", "meeting types & media")} icon={<Newspaper className="h-4 w-4" />} />
        <StatTile label="Managers followed" {...previewTile("9", "with tagged views")} icon={<Users className="h-4 w-4" />} />
        <StatTile label="Open questions" {...previewTile("14", "flagged for review")} icon={<MessageSquare className="h-4 w-4" />} />
      </div>

      {/* AI query engine */}
      <Card
        className="mt-5 preview-hatch"
        title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-champagne-400" /> AI query engine</span>}
        subtitle="Ask in plain language across every captured note. Results aggregate the underlying sources with a chronology and a link back to each."
        right={<PreviewBadge />}
      >
        <div className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. What did our managers say about manufacturing since 2023?"
            className="w-full bg-transparent text-[13px] text-slate-300 placeholder:text-slate-600 focus:outline-none"
          />
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">Preview</span>
        </div>
        <div className="mt-4 space-y-3">
          {EXAMPLE_QUERIES.map((ex) => (
            <div key={ex.q} className="rounded-lg border border-ink-700 bg-ink-800/60 p-3">
              <div className="flex items-start gap-2 text-[13px] text-slate-200">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-champagne-400" />
                <span className="font-medium">{ex.q}</span>
              </div>
              <div className="mt-1.5 flex items-start gap-2 pl-6 text-[12px] text-slate-500">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span title="Placeholder — not live data">{ex.a}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* Sources captured */}
        <Card className="lg:col-span-1 preview-hatch" title="Sources captured" subtitle="Everything gets captured — the spec's rule" right={<PreviewBadge />}>
          <ul className="space-y-1.5">
            {SOURCES.map((s) => (
              <li key={s.label} className="flex items-center justify-between rounded-md px-1.5 py-1 text-[12.5px]">
                <span className="flex items-center gap-2 text-slate-300"><s.icon className="h-3.5 w-3.5 text-slate-500" />{s.label}</span>
                <PreviewNum>{s.sample}</PreviewNum>
              </li>
            ))}
          </ul>
        </Card>

        {/* Tagged notes */}
        <Card className="lg:col-span-2 preview-hatch" title="Tagged notes" subtitle="Every note carries Asset Class · Geography · Theme · Source · Manager · Risk · Decision status" right={<PreviewBadge />} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12.5px]">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Note</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Theme</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Manager</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Source</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Risk</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {NOTES.map((n) => (
                  <tr key={n.note}>
                    <td className="px-4 py-2.5">
                      <div className="max-w-xs text-slate-300">{n.note}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <PreviewPill>{n.assetClass}</PreviewPill>
                        <PreviewPill>{n.geography}</PreviewPill>
                        <span className="text-[10px] text-slate-600">{n.date}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><PreviewPill>{n.theme}</PreviewPill></td>
                    <td className="px-4 py-2.5 text-slate-400">{n.manager}</td>
                    <td className="px-4 py-2.5 text-slate-400">{n.source}</td>
                    <td className="px-4 py-2.5 text-slate-400">{n.risk}</td>
                    <td className={`px-4 py-2.5 font-medium ${STATUS_TONE[n.status] ?? "text-slate-400"}`} title="Placeholder — not live data">{n.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            <Tag className="mr-1 inline h-3 w-3" />
            Decision status flows <span className="text-slate-400">Watchlist → Research → Approved → Invested → Exited</span>. The tag
            vocabulary and the AI index are illustrative here — wiring them up needs a private note store the family owns.
          </p>
        </Card>
      </div>
    </div>
  );
}
