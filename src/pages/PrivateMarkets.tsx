import { useMemo } from "react";
import { LayoutGrid, TrendingUp, Rocket, Building2, Briefcase, Banknote, NotebookPen } from "lucide-react";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/Pill";
import { ViewToggle, useViewParam, type ViewDef } from "@/components/ViewToggle";
import { privateValueModel, type PrivateClassKey } from "@/lib/privateValue";
import { usePortfolio } from "@/context/PortfolioContext";
import { isPrivateClass } from "@/lib/analytics";
import { AbsentSection } from "@/components/Absent";
import { Overview } from "./private/Overview";
import { Startups } from "./private/Startups";
import { FundClass } from "./private/FundClass";
import { Alternatives } from "./private/Alternatives";
import { PrivateTrackerPreview } from "./private/PrivateTrackerPreview";
import { DealRegister } from "./private/DealRegister";
import { readFamilyInputs } from "@/lib/familyInputs";
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

type ViewKey = "overview" | PrivateClassKey | "register";

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
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const model = useMemo(() => (portfolio ? privateValueModel(portfolio) : null), [portfolio]);
  // The AIF units the book actually holds — private by asset class, but position-
  // shaped rather than fund-of-funds shaped, so the fund model above never sees
  // them. Surfaced as an Alternatives segment; see private/Alternatives.
  const altCount = useMemo(() => new Set(consolidated.filter(isPrivateClass).map((p) => p.securityKey)).size, [consolidated]);
  // Read once per mount — only decides whether the illustrative preview shows
  // beneath the register on an empty book, so it need not track edits live.
  const hasDeals = useMemo(() => readFamilyInputs().deals.length > 0, []);

  // Tabs are generated from the classification, so adding or emptying a segment
  // in the book changes the segment table and the tabs together.
  const views: readonly ViewDef<ViewKey>[] = useMemo(() => [
    { key: "overview" as const, label: "Overview", icon: LayoutGrid, title: "What the private book holds, and how each part has compounded" },
    ...(model?.classes ?? []).map((c) => ({
      key: c.key, label: c.label, icon: CLASS_ICONS[c.key],
      title: `${c.label} — ${c.count} ${c.key === "startups" ? "names" : c.key === "unlisted" ? "companies" : "funds"}`,
    })),
    // ALWAYS PRESENT, unlike every tab above it. The others are generated from
    // the book's classification and disappear when a segment empties; the deal
    // register is the family's own paperwork about companies no statement names,
    // so it exists whether or not the book carries a private holding.
    { key: "register" as const, label: "Deal register", icon: NotebookPen,
      title: "Direct private deals — commitments, drawdowns, cap table, rounds and documents, entered by the family" },
  ], [model]);

  const [view, setView] = useViewParam(views, VIEW_ALIASES);
  // Named from the registry, so the empty state describes THIS book rather than
  // asserting anything about it.
  const accountCount = portfolio?.accounts.length ?? 0;
  const providerCount = new Set((portfolio?.accounts ?? []).map((a) => a.provider)).size;
  if (!portfolio || !model) return null;

  const m = model;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const fundInstruments = m.classes.reduce((s, c) => s + c.count, 0);
  const instruments = fundInstruments + altCount;
  const segmentProps: SegmentProps = { portfolio, model: m, money };
  const activeClass = m.classes.find((c) => c.key === view);

  // Only when the book carries NEITHER a fund-of-funds instrument NOR an AIF/
  // alternatives position is there nothing to measure. An AIF holding is private
  // by asset class and belongs on this page — showing the "no private holdings"
  // empty state over ₹207.65 Cr of AIF is the exact bug this fixes.
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

        {/* The family's own deal register — real, whatever the book carries. */}
        <DealRegister />

        {/* Below it, the ILLUSTRATIVE preview of the FOOS private tracker, shown
            ONLY while the register is empty. Once the family has entered a deal
            the real table above answers the same question, and leaving a sample
            beneath it would put invented figures under a heading a reader has
            just learnt to trust. Sample data throughout — it touches the book
            nowhere (see Preview.tsx doctrine) and is unmistakably marked. */}
        {!hasDeals && <PrivateTrackerPreview />}
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
          their own segment instead. Overview also carries the Alternatives (AIF)
          segment, which is position-shaped rather than fund-shaped. */}
      <div>
        <ViewToggle views={views} active={view} onChange={setView} />
        {view === "overview" && <>
          {altCount > 0 && <Alternatives />}
          {fundInstruments > 0 && <div className={altCount > 0 ? "mt-5" : ""}><Overview {...segmentProps} /></div>}
        </>}
        {view === "startups" && <Startups {...segmentProps} />}
        {activeClass && activeClass.key !== "startups" && <FundClass cls={activeClass} money={money} />}
        {view === "register" && <DealRegister />}
      </div>
    </div>
  );
}
