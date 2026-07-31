import { FileText, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";

// Data Bank — the document repository and founder meeting notes behind the
// private book. Kept as its own page rather than a Private Markets segment:
// once uploads, capital calls and AI summaries land it becomes a working area
// (things go in, not just out), which is a different job from reading a report.
//
// WHAT WAS HERE BEFORE, AND WHY IT IS GONE. This page shipped a hardcoded list
// of documents and founder meeting notes — named holdings, dated board updates,
// quoted revenue growth — behind a "scaffold" pill. A pill does not undo a
// fabrication: a reader scanning the page saw this family's document trail and
// this family's meetings, and none of it existed. An invented figure is bad; an
// invented minute of a meeting that never happened is worse.
//
// So the page now renders what is true: the repository is empty, because no
// private-market holding exists in the book and no document store is connected.
// The two cards stay, and both fill themselves the moment either arrives.

/** Later phases, stated as capability — not as content that already exists. */
const PLANNED = [
  "Document upload & storage — SHA / SSA / statements / cap tables",
  "Quarterly-statement upload → fund NAV & inflows",
  "Drawdown notices → projected cash flow",
  "AI summaries of ingested documents",
  "Founder meeting notes, tagged to value-creation buckets",
];

export function DataBank() {
  const { portfolio } = usePortfolio();

  // Driven by the book, not by a flag. A private holding in the statements gives
  // these cards something to hang documents from, and this page comes alive.
  const privateHoldings = portfolio
    ? portfolio.privateMarkets.peFunds.length + portfolio.privateMarkets.preIpoFunds.length
      + portfolio.privateMarkets.unlistedCompanies.length + portfolio.privateMarkets.debtFunds.length
      + portfolio.privateMarkets.closedFunds.length + portfolio.privateMarkets.startups.length
    : 0;
  const accounts = portfolio?.accounts.length ?? 0;
  const providers = new Set((portfolio?.accounts ?? []).map((a) => a.provider)).size;

  return (
    <div>
      <PageHeader eyebrow="Private Markets" title="Data Bank"
        subtitle="Document repository &amp; founder meeting notes, per holding"
        right={<Pill tone="info">{privateHoldings} private holding{privateHoldings === 1 ? "" : "s"}</Pill>} />

      <AbsentSection
        what="Nothing to file yet"
        needs={`The Data Bank holds the paperwork behind private-market holdings — shareholders' agreements,
          subscription agreements, cap tables, quarterly statements and meeting notes. This book's ${accounts}
          account${accounts === 1 ? "" : "s"} across ${providers} manager${providers === 1 ? "" : "s"} are
          discretionary PMS mandates in listed equity, so there are no private holdings to file against, and no
          document store is connected.`}>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
          The statements this book IS built from are all readable, per document, under{" "}
          <span className="font-medium text-slate-400">Setup → Data Audit</span>.
        </p>
      </AbsentSection>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <Card title="Document repository" subtitle="SHA / SSA / statements / cap tables, per holding"
          right={<FileText className="h-4 w-4 text-slate-500" />}>
          <p className="py-6 text-center text-[11.5px] leading-relaxed text-slate-500">
            No documents stored. Uploads activate with the document backend.
          </p>
        </Card>

        <Card title="Founder meeting notes" subtitle="Minutes of meeting, tagged to the value-creation buckets"
          right={<StickyNote className="h-4 w-4 text-slate-500" />}>
          <p className="py-6 text-center text-[11.5px] leading-relaxed text-slate-500">
            No notes recorded. Notes are written against a private holding, and this book has none.
          </p>
        </Card>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 p-4">
        <div className="text-[12.5px] font-semibold text-slate-400">◇ Planned — needs a backend with auth &amp; file storage</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {PLANNED.map((c) => (
            <span key={c} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-[11.5px] text-slate-400">◷ {c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
