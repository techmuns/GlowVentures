import { useMemo } from "react";
import { LayoutGrid, TrendingUp, Rocket, Building2, Briefcase, Banknote } from "lucide-react";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { ViewToggle, useViewParam, type ViewDef } from "@/components/ViewToggle";
import { privateValueModel, type PrivateClassKey } from "@/lib/privateValue";
import { usePortfolio } from "@/context/PortfolioContext";
import { AbsentSection } from "@/components/Absent";
import { Overview } from "./private/Overview";
import { Startups } from "./private/Startups";
import { FundClass } from "./private/FundClass";
import type { SegmentProps } from "./private/segment";

// Private Markets — one page, one tab per segment.
//
// Previously three separate pages (Private Market Analytics, Fund & Scheme
// Analytics, Value Creation) that answered the same question from different
// angles and, because each derived its own totals, disagreed on the answer.
//
// The tabs after Overview mirror the book's classification exactly: same
// segments, same order, same colours, all read from privateClasses(). Every
// holding sits on exactly one tab — no fund or company is listed twice.
//
// The active view lives in `?view=` — see components/ViewToggle.

type ViewKey = "overview" | PrivateClassKey;

const CLASS_ICONS: Record<PrivateClassKey, ComponentType<{ className?: string }>> = {
  startups: Rocket,
  unlisted: Building2,
  pe: Briefcase,
  "pre-ipo": TrendingUp,
  debt: Banknote,
};

// Retired tab keys → where they land now, so old bookmarks keep working.
// "funds" was one tab holding all four pooled classes; "value-creation" listed
// the same 53 startups the Startups tab already had.
const VIEW_ALIASES: Partial<Record<string, ViewKey>> = {
  funds: "pe",
  "value-creation": "startups",
};

export function PrivateMarkets() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const model = useMemo(() => (portfolio ? privateValueModel(portfolio) : null), [portfolio]);

  // Tabs are generated from the classification, so adding or emptying a segment
  // in the book changes the segment table and the tabs together.
  const views: readonly ViewDef<ViewKey>[] = useMemo(() => [
    { key: "overview" as const, label: "Overview", icon: LayoutGrid, title: "What the private book holds, and how each part has compounded" },
    ...(model?.classes ?? []).map((c) => ({
      key: c.key, label: c.label, icon: CLASS_ICONS[c.key],
      title: `${c.label} — ${c.count} ${c.key === "startups" ? "names" : c.key === "unlisted" ? "companies" : "funds"}`,
    })),
  ], [model]);

  const [view, setView] = useViewParam(views, VIEW_ALIASES);
  // Named from the registry, so the empty state describes THIS book rather than
  // asserting anything about it.
  const accountCount = portfolio?.accounts.length ?? 0;
  const providerCount = new Set((portfolio?.accounts ?? []).map((a) => a.provider)).size;
  if (!portfolio || !model) return null;

  const m = model;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const instruments = m.classes.reduce((s, c) => s + c.count, 0);
  const segmentProps: SegmentProps = { portfolio, model: m, money };
  const activeClass = m.classes.find((c) => c.key === view);

  // THE SEGMENT IS EMPTY, so nothing here is measured — and a strip of ₹0 tiles
  // says the opposite: that the family put in nothing and got nothing back. It
  // is driven by the model, not hardcoded: ingest a private-markets statement
  // and privateValueModel yields classes, the tabs appear and the page comes
  // alive with no change here.
  if (!instruments) {
    return (
      <div>
        <PageHeader eyebrow="Private Markets" title="Private Markets"
          right={<Pill tone="info">no private holdings in this book</Pill>} />
        <AbsentSection
          what="No private-market holdings in this book"
          needs={`The ${accountCount} account${accountCount === 1 ? "" : "s"} ingested so far are discretionary PMS mandates
            across ${providerCount} manager${providerCount === 1 ? "" : "s"}, holding listed Indian equity and cash. No PE or
            VC fund, pre-IPO vehicle, unlisted company or direct startup appears in any statement — so there is
            nothing to value, and every figure this page would show is absent rather than zero.`}>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
            This page and its tabs are driven by the book's own classification. Ingest a statement carrying a
            private holding and the segments, tiles and tables here populate themselves.
          </p>
        </AbsentSection>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Private Markets" title="Private Markets"
        right={<Pill tone="info">{instruments} instruments · marks as of {portfolio.asOf}</Pill>} />

      {/* The book-level figures used to sit in a six-tile strip repeated above
          every tab. They now live in the Overview segment table, where each one
          is next to the rows it sums — and the other tabs carry the totals for
          their own segment instead. */}
      <div>
        <ViewToggle views={views} active={view} onChange={setView} />
        {view === "overview" && <Overview {...segmentProps} />}
        {view === "startups" && <Startups {...segmentProps} />}
        {activeClass && activeClass.key !== "startups" && <FundClass cls={activeClass} money={money} />}
      </div>
    </div>
  );
}
