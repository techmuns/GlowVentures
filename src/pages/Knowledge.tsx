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

// THE TAGGING MODEL, NOT SAMPLE NOTES.
//
// This was five sample rows in the shape of real minutes: a dated note, a named
// manager and a decision status. Three of the five named Aristos, Carnelian and
// V.E.C Assago — managers who run this family's money — and one recorded that
// the family "exited on governance concerns after promoter pledge rose" on
// 03 Apr 2026, a meeting that never happened about a concern nobody raised.
//
// A minute is a record of what someone said. Inventing one and dating it is not
// a placeholder in the sense the rest of this file uses the word; it is a
// fabricated document, and it names a real counterparty. So the table shows the
// spec's tagging DIMENSIONS and the vocabulary each would take, which is what a
// reader actually needs to see to judge whether the model fits how the family
// works — and it attributes nothing to anyone.
const TAG_MODEL: { dimension: string; values: string[]; why: string }[] = [
  { dimension: "Source", values: ["Manager meeting", "IC discussion", "Fund pitch", "Conference", "Book", "Podcast"], why: "where the note came from, so a view can be filtered to primary sources" },
  { dimension: "Manager", values: ["the manager the note concerns"], why: "resolved against the account registry, so a note joins to the mandate it is about" },
  { dimension: "Asset class", values: ["Equity", "AIF", "Bond", "Unlisted", "Cash"], why: "the same vocabulary the book uses, so notes and holdings filter alike" },
  { dimension: "Geography", values: ["India", "Global"], why: "the spec's geography split for the IPS gap" },
  { dimension: "Theme", values: ["the family's own theme labels"], why: "free tags, because a theme list is a house view and not ours to seed" },
  { dimension: "Risk", values: ["Low", "Moderate", "High"], why: "the note-taker's own read, recorded rather than derived" },
  { dimension: "Decision status", values: ["Research", "Watchlist", "Approved", "Invested", "Exited"], why: "the pipeline a note moves along, so an IC can see what is outstanding" },
];

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

        {/* The tagging model. Not sample minutes — see the note on TAG_MODEL. */}
        <Card className="lg:col-span-2 preview-hatch" title="The tagging model"
          subtitle="What every note would carry, and why each dimension is there"
          right={<PreviewBadge label="Not wired" />} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[12.5px]">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Dimension</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Vocabulary</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Why it is there</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {TAG_MODEL.map((d) => (
                  <tr key={d.dimension}>
                    <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-200">{d.dimension}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {d.values.map((v) => <PreviewPill key={v}>{v}</PreviewPill>)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 max-w-md whitespace-normal leading-snug text-slate-500">{d.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            <Tag className="mr-1 inline h-3 w-3" />
            Decision status flows <span className="text-slate-400">Watchlist → Research → Approved → Invested → Exited</span>.
            <span className="text-slate-400"> No note has been recorded</span> — this table is the model a note store would
            use, not a sample of the family's minutes. Wiring it up needs a private note store the family owns.
          </p>
        </Card>
      </div>
    </div>
  );
}
