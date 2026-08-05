import { Rocket, Banknote, Coins, TrendingUp, Layers, PiggyBank } from "lucide-react";
import { StatTile } from "@/components/StatTile";
import {
  PreviewBanner, PreviewCard, PreviewNum, PreviewPill, PreviewChart, previewTile,
} from "@/components/Preview";

// PrivateTrackerPreview — the FOOS private-investment tracker, shown as an
// ILLUSTRATIVE layout below the honest "no private holdings" empty state on
// PrivateMarkets.
//
// Per Preview.tsx doctrine this component NEVER touches the book: it renders
// sample constants only, so it takes no props and reads nothing from
// usePortfolio(). Every figure is routed through PreviewNum / previewTile /
// PreviewPill and sits inside a preview-marked surface, so a reader can never
// mistake it for a measurement. Once a reader for the Sanshi Fund / Transition
// Venture / 360 ONE distribution capital-account statements exists, this whole
// block is replaced by the model-driven tabs above.

// The columns the client's spec asks a private tracker to carry. Kept as a
// flat sample so the table below reads as one row per company, mirroring how
// Overview lists its holdings.
type TrackerRow = {
  company: string; committed: string; committedOn: string; invested: string; investedOn: string;
  pending: string; docs: number; valuation: string; stake: string; capTable: string;
  subsequent: "Yes" | "No"; stakeValue: string; stakePct: string; financials: string;
  mis: string; misOn: string;
};

const ROWS: TrackerRow[] = [
  {
    company: "Helios Robotics Pvt Ltd", committed: "₹12.0 Cr", committedOn: "12 Apr 2024",
    invested: "₹9.0 Cr", investedOn: "20 Apr 2024", pending: "₹3.0 Cr", docs: 6,
    valuation: "₹180 Cr", stake: "5.4%", capTable: "Series B", subsequent: "Yes",
    stakeValue: "₹14.2 Cr", stakePct: "4.7%", financials: "FY25 audited", mis: "3 files", misOn: "30 Jun 2026",
  },
  {
    company: "Aster Bio Sciences LLP", committed: "₹8.0 Cr", committedOn: "03 Sep 2023",
    invested: "₹8.0 Cr", investedOn: "03 Sep 2023", pending: "₹0.4 Cr", docs: 4,
    valuation: "₹96 Cr", stake: "8.3%", capTable: "Series A", subsequent: "No",
    stakeValue: "₹9.6 Cr", stakePct: "8.3%", financials: "FY25 provisional", mis: "2 files", misOn: "31 May 2026",
  },
  {
    company: "Meridian Payments Inc", committed: "₹15.0 Cr", committedOn: "18 Jan 2025",
    invested: "₹6.0 Cr", investedOn: "25 Jan 2025", pending: "₹9.0 Cr", docs: 9,
    valuation: "₹420 Cr", stake: "3.1%", capTable: "Series C", subsequent: "Yes",
    stakeValue: "₹18.6 Cr", stakePct: "2.6%", financials: "H1 FY26 mgmt", mis: "5 files", misOn: "15 Jul 2026",
  },
  {
    company: "Kaveri AgriTech Pvt Ltd", committed: "₹5.0 Cr", committedOn: "27 Nov 2024",
    invested: "₹2.5 Cr", investedOn: "05 Dec 2024", pending: "₹2.5 Cr", docs: 3,
    valuation: "₹40 Cr", stake: "7.2%", capTable: "Seed", subsequent: "No",
    stakeValue: "₹2.9 Cr", stakePct: "7.2%", financials: "FY25 provisional", mis: "1 file", misOn: "12 Jun 2026",
  },
];

// The drill-downs the spec attaches to individual cells. Named here as preview
// affordances so the client sees WHICH clicks open WHAT, without wiring a store.
const DRILLDOWNS: { cell: string; gesture: string; opens: string }[] = [
  { cell: "Amount invested", gesture: "click", opens: "investment by tranches & dates" },
  { cell: "Documents", gesture: "double-click", opens: "list of saved attachments" },
  { cell: "Subsequent rounds (Yes)", gesture: "click", opens: "per-round valuation, investors, amount invested, cap table & primary / secondary dates" },
  { cell: "Financials", gesture: "click", opens: "quarterly & annual financials plus operating KPIs" },
  { cell: "MIS", gesture: "click", opens: "saved MIS attachments" },
];

// Every table header the tracker carries, in spec order.
const COLS = [
  "Company", "Committed", "Committed on", "Invested", "Invested on", "Pending to invest",
  "Docs", "Valuation (last round)", "Stake (FD %)", "Cap table @ entry", "Subsequent rounds",
  "Stake value (post raise)", "Stake % (post raise)", "Financials", "MIS latest", "MIS received",
] as const;

export function PrivateTrackerPreview() {
  return (
    <div className="mt-8">
      <PreviewBanner
        source="a reader for the Sanshi Fund / Transition Venture / 360 ONE distribution capital-account statements"
        layer="Private markets tracker"
      >
        This is how the private-investment tracker will read once those statements are ingested — the empty state
        above stays honest until then, and none of the figures below are the family's.
      </PreviewBanner>

      {/* Lifecycle strip — mirrors Overview's committed → called → distributed →
          NAV vocabulary, every value a non-zero sample. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Committed capital" icon={<PiggyBank className="h-4 w-4" />} {...previewTile("₹40.0 Cr", "across 4 vehicles")} />
        <StatTile label="Called / drawn" icon={<Banknote className="h-4 w-4" />} {...previewTile("₹25.5 Cr", "63.8% of commitment")} />
        <StatTile label="Distributed" icon={<Coins className="h-4 w-4" />} {...previewTile("₹6.4 Cr", "DPI 0.25×")} />
        <StatTile label="Net asset value" icon={<Layers className="h-4 w-4" />} {...previewTile("₹45.3 Cr", "TVPI 2.03×")} />
        <StatTile label="Net IRR" icon={<TrendingUp className="h-4 w-4" />} {...previewTile("23.4%", "since inception, p.a.")} />
        <StatTile label="Dry powder" icon={<Rocket className="h-4 w-4" />} {...previewTile("₹14.5 Cr", "committed, not yet called")} />
      </div>

      {/* Segment split — echoes Overview's "Private book by segment" table with
          preview primitives instead of model rows. */}
      <PreviewCard className="mt-5" title="Private book by segment"
        subtitle="How a mixed private book would split once PE / VC / pre-IPO / unlisted / debt statements are read">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="label-xs py-2 pr-3 text-left font-medium">Segment</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Committed</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Called</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Distributed</th>
                <th className="label-xs px-3 py-2 text-right font-medium">NAV</th>
                <th className="label-xs py-2 pl-3 text-right font-medium">Net ×</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {[
                { seg: "Private equity", tag: "PE", committed: "₹15.0 Cr", called: "₹11.0 Cr", dist: "₹4.1 Cr", nav: "₹18.2 Cr", mult: "2.03×" },
                { seg: "Venture capital", tag: "VC", committed: "₹13.0 Cr", called: "₹9.0 Cr", dist: "₹1.2 Cr", nav: "₹16.8 Cr", mult: "2.00×" },
                { seg: "Pre-IPO", tag: "Pre-IPO", committed: "₹7.0 Cr", called: "₹3.5 Cr", dist: "₹0.6 Cr", nav: "₹6.4 Cr", mult: "2.00×" },
                { seg: "Unlisted equity", tag: "Unlisted", committed: "₹3.0 Cr", called: "₹1.5 Cr", dist: "₹0.3 Cr", nav: "₹2.9 Cr", mult: "2.13×" },
                { seg: "Private debt", tag: "Debt", committed: "₹2.0 Cr", called: "₹0.5 Cr", dist: "₹0.2 Cr", nav: "₹1.0 Cr", mult: "2.40×" },
              ].map((r) => (
                <tr key={r.seg} className="hover:bg-ink-700/30">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2 text-[12.5px] font-medium text-slate-300">
                      <PreviewPill>{r.tag}</PreviewPill>
                      <span className="truncate">{r.seg}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.committed}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.called}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.dist}</PreviewNum></td>
                  <td className="px-3 py-2.5 text-right"><PreviewNum>{r.nav}</PreviewNum></td>
                  <td className="py-2.5 pl-3 text-right"><PreviewNum>{r.mult}</PreviewNum></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PreviewCard>

      {/* NAV / J-curve illustration — a shape cue, no real series. */}
      <PreviewCard className="mt-5" title="NAV build & J-curve"
        subtitle="Committed capital drawn down, marked up, then returning cash as vehicles mature">
        <PreviewChart kind="area" height={200} />
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Illustrative only. A real J-curve needs a dated valuation series per vehicle — a capital-account statement
          issued monthly or quarterly, which no source in this drop yet supplies.
        </p>
      </PreviewCard>

      {/* THE tracker table — the full spec column set. Very wide, so it scrolls
          inside its own container; the page body never scrolls sideways. */}
      <PreviewCard className="mt-5" title="Private-investment tracker"
        subtitle="One row per company, carrying the full commitment-to-MIS lifecycle the spec asks for">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                {COLS.map((c, i) => (
                  <th key={c} className={`label-xs whitespace-nowrap py-2 font-medium ${i === 0 ? "pr-3 text-left" : "px-3 text-right"}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {ROWS.map((r) => (
                <tr key={r.company} className="hover:bg-ink-700/30">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-[12.5px] font-medium text-slate-300">{r.company}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.committed}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.committedOn}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right" title="Click → investment by tranches & dates"><PreviewNum>{r.invested}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.investedOn}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.pending}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right" title="Double-click → saved attachments"><PreviewPill>{r.docs} docs</PreviewPill></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.valuation}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.stake}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewPill>{r.capTable}</PreviewPill></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {r.subsequent === "Yes"
                      ? <span title="Click → per-round valuation, investors, cap table & dates"><PreviewPill>Yes</PreviewPill></span>
                      : <PreviewPill>No</PreviewPill>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.stakeValue}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.stakePct}</PreviewNum></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right" title="Click → quarterly & annual financials + operating KPIs"><PreviewPill>{r.financials}</PreviewPill></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right" title="Click → saved MIS attachments"><PreviewPill>{r.mis}</PreviewPill></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><PreviewNum>{r.misOn}</PreviewNum></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The spec's drill-downs, named as affordances rather than wired. */}
        <div className="mt-4 border-t border-dashed border-ink-700 pt-3">
          <div className="label-xs">Cell drill-downs (spec)</div>
          <ul className="mt-2 grid gap-1.5 text-[11.5px] leading-relaxed text-slate-500 sm:grid-cols-2">
            {DRILLDOWNS.map((d) => (
              <li key={d.cell} className="flex items-start gap-2">
                <PreviewPill>{d.gesture}</PreviewPill>
                <span><span className="font-medium text-slate-400">{d.cell}</span> → {d.opens}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Each drill-down opens a saved detail view — tranche schedules, attachment lists, per-round cap tables,
            financial statements and MIS files. These need a document store the family supplies; until then the
            gestures above are illustrative.
          </p>
        </div>
      </PreviewCard>
    </div>
  );
}
