import { FileText, StickyNote, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BUCKET_META, type BucketKey } from "@/lib/privateValue";

// Data Bank — the document repository and founder meeting notes behind the
// private book. Kept as its own page rather than a Private Markets segment:
// once uploads, capital calls and AI summaries land it becomes a working area
// (things go in, not just out), which is a different job from reading a report.
//
// Storage, uploads and AI summaries need the backend; the rows below are an
// illustrative scaffold that conveys the layout only.

const DOCS = [
  { holding: "InCred Capital", file: "SHA_2024.pdf", kind: "Shareholders' Agreement", added: "Mar 2024", ai: true },
  { holding: "Pilgrim", file: "SSA_final.pdf", kind: "Share Subscription", added: "Jan 2025", ai: true },
  { holding: "NSE", file: "Q1FY27_statement.pdf", kind: "Quarterly statement", added: "Jul 2026", ai: true },
  { holding: "Quorum", file: "term_sheet.pdf", kind: "Term sheet", added: "Aug 2024", ai: false },
  { holding: "Vahdam", file: "cap_table.xlsx", kind: "Cap table", added: "Feb 2025", ai: false },
];

const NOTES: { title: string; meta: string; body: string; tags: BucketKey[] }[] = [
  { title: "Pilgrim · Founder sync", meta: "12 Jun 2026 · with A. Sharma", body: "Q1 revenue +40% QoQ; D2C SKUs expanding into new categories. Series C term sheet expected Q3 at a step-up mark. Burn tracking to plan.", tags: ["value-driver", "on-track"] },
  { title: "InCred Capital · Board update", meta: "3 May 2026 · quarterly board", body: "NBFC AUM compounding; IPO-readiness work underway. Secondary interest at the current mark noted for a possible partial exit.", tags: ["value-driver"] },
];

function StatusTag({ bucket }: { bucket: BucketKey }) {
  return <Pill tone={BUCKET_META[bucket].tone}>{BUCKET_META[bucket].label}</Pill>;
}

export function DataBank() {
  return (
    <div>
      <PageHeader eyebrow="Private Markets" title="Data Bank"
        subtitle="Document repository &amp; founder meeting notes, per holding"
        right={<Pill tone="warn">scaffold</Pill>} />

      <div className="mb-5 flex items-start gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-400">
        <span className="mt-px">◐</span>
        <span>Scaffold layout — document storage, uploads &amp; AI summaries activate when the backend lands. The rows below are illustrative placeholders.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Card title="Document repository" subtitle="SHA / SSA / statements / cap tables, per holding"
          right={<FileText className="h-4 w-4 text-slate-500" />}>
          <ul>
            {DOCS.map((d) => (
              <li key={d.file} className="flex items-center justify-between gap-3 border-t border-ink-700/60 py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-slate-200">{d.holding} — {d.file}</div>
                  <div className="text-[10.5px] text-slate-500">{d.kind} · added {d.added}</div>
                </div>
                {d.ai
                  ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold text-accent-400"><Sparkles className="h-3 w-3" /> AI summary</span>
                  : <span className="shrink-0 rounded-md bg-ink-700/60 px-2 py-0.5 text-[10px] font-semibold text-slate-500">pending</span>}
              </li>
            ))}
          </ul>
          <div title="Available when the data-bank backend lands" className="mt-3 cursor-not-allowed rounded-lg border border-dashed border-ink-600 py-2.5 text-center text-[11.5px] text-slate-500">
            ＋ Upload document — SHA / SSA / statement / cap table
          </div>
        </Card>

        <Card title="Founder meeting notes" subtitle="Minutes of meeting, tagged to the value-creation buckets"
          right={<StickyNote className="h-4 w-4 text-slate-500" />}>
          <div className="flex flex-col gap-2.5">
            {NOTES.map((n) => (
              <div key={n.title} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
                <div className="text-[12.5px] font-semibold text-slate-100">{n.title}</div>
                <div className="text-[10.5px] text-slate-500">{n.meta}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">{n.body}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {n.tags.map((t) => <StatusTag key={t} bucket={t} />)}
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold text-accent-400"><Sparkles className="h-3 w-3" /> AI summary</span>
                </div>
              </div>
            ))}
          </div>
          <div title="Available when the data-bank backend lands" className="mt-3 cursor-not-allowed rounded-lg border border-dashed border-ink-600 py-2.5 text-center text-[11.5px] text-slate-500">
            ＋ New note — minutes of meeting
          </div>
        </Card>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 p-4">
        <div className="text-[12.5px] font-semibold text-slate-400">◇ Activates with the data-bank backend — later phases</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {[
            "Inline edit — new investments, markups & fields",
            "Quarterly-statement upload → auto fund NAV & inflows",
            "Drawdown-notice emails + projected cashflow",
            "AI summaries — SHA / SSA / MoM / statements",
            "VC & startup industry RSS feed",
          ].map((c) => (
            <span key={c} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-[11.5px] text-slate-400">◷ {c}</span>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
          Value-creation analytics &amp; the startup classification ship now on data we already hold, over on <span className="font-medium text-slate-400">Private Markets → Value Creation</span>. The Data Bank's storage, document uploads, inline editing, AI summaries and drawdown emails need a backend with auth &amp; file storage — wired in the data-infrastructure track.
        </p>
      </div>
    </div>
  );
}
