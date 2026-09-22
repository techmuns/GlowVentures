import { useMemo } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { fmtPct, changeColor } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import {
  parseFinancials, tableNamed, rowAny, seriesOf, cagrPct, growthPct,
  type FinancialDoc, type FinancialRow, type FinancialTable,
} from "@/lib/financialTables";

// GROWTH AND CAGR, COMPUTED FROM THE TABLES THE DATA SERVICE ALREADY SENDS.
//
// The spec asks for "P&L history for last 10 yrs", "CAGR analysis" and revenue
// / EPS growth. All three were marked as sitting "in the prose block": the
// financials response was rendered verbatim and nothing computed against it.
//
// It is not prose. Five of its sections are markdown tables labelled on both
// axes, and `src/lib/financialTables.ts` reads them by header text — the same
// rule the statement readers follow. This panel is what that buys.
//
// ── WHY THE LINE ITEMS ARE LOOKED UP BY A LIST OF NAMES ─────────────────────
//
// A lender's P&L and a manufacturer's are different documents. ABCAPITAL prints
// Revenue / Interest / Financing Profit; a manufacturer prints Sales /
// Operating Profit / OPM %. There is no house schema here that both are mapped
// onto, because inventing one is how "EBITDA" ends up on a company that never
// reported it. Each metric names the labels it will accept, IN ORDER, and a
// company reporting none of them renders absent with its own name in the
// reason — never the nearest-looking row.
//
// ── AND WHY EVERY CAGR CAN BE NULL ──────────────────────────────────────────
//
// `cagrPct` refuses a rate where the arithmetic would lie: one data point, a
// span under a year, or a start at or below zero. That last is not theoretical
// on this book — a company that swung from a loss to a profit has no compound
// rate, and the formula returns a confident number for it.

/** What to try, in order, for each headline metric. Source labels, not ours. */
const METRICS: { key: string; label: string; labels: string[]; unit: "money" | "ratio" }[] = [
  { key: "revenue", label: "Revenue", labels: ["Sales", "Revenue"], unit: "money" },
  { key: "profit", label: "Net profit", labels: ["Net Profit"], unit: "money" },
  { key: "eps", label: "EPS", labels: ["EPS in Rs"], unit: "ratio" },
  { key: "opprofit", label: "Operating profit", labels: ["Operating Profit", "Financing Profit"], unit: "money" },
];

type Computed = {
  label: string;
  row: FinancialRow | null;
  /** Latest full period value. */
  latest: number | null;
  latestLabel: string | null;
  /** Year-on-year against the period before it. */
  yoy: number | null;
  /** Compound annual growth over the whole reported span, and over 5 years. */
  cagrAll: number | null;
  cagrAllYears: number | null;
  cagr5: number | null;
  unit: "money" | "ratio";
};

function compute(pl: FinancialTable | null, m: (typeof METRICS)[number]): Computed {
  const row = rowAny(pl, m.labels);
  const series = pl ? seriesOf(row, pl.periods) : [];
  const last = series[series.length - 1] ?? null;
  const prev = series[series.length - 2] ?? null;
  // A five-year window means the point five YEARS back, not five entries back —
  // a missing year in the middle would otherwise silently shorten it.
  const five = last ? series.find((p) => p.period.year !== null && last.period.year !== null
    && p.period.year >= last.period.year - 5) ?? null : null;
  return {
    label: m.label,
    row,
    latest: last?.value ?? null,
    latestLabel: last?.period.label ?? null,
    yoy: prev && last ? growthPct(prev.value, last.value) : null,
    cagrAll: cagrPct(series),
    cagrAllYears: series.length >= 2 && series[0].period.year !== null && last?.period.year != null
      ? last.period.year - series[0].period.year : null,
    cagr5: five && last && five !== last ? cagrPct([five, last]) : null,
    unit: m.unit,
  };
}

/** The columns, in the order this table's rows write their cells. */
const FIN_SUMMARY_COLS = ["metric", "latest", "yoy", "cagr5", "cagrAll"] as const;

export function FinancialSummary({ markdown, ticker }: { markdown: string; ticker: string }) {
  const view = useTableView("financial-summary", FIN_SUMMARY_COLS);
  const doc: FinancialDoc = useMemo(() => parseFinancials(markdown), [markdown]);
  const pl = useMemo(() => tableNamed(doc, "Profit & Loss"), [doc]);
  const rows = useMemo(() => METRICS.map((m) => compute(pl, m)), [pl]);

  if (!pl) {
    return (
      <Card className="mt-5" title="Growth & CAGR" subtitle={`Computed from the reported P&L for ${ticker}`}>
        <AbsentSection
          what="No Profit & Loss table came back for this company"
          needs="These figures are computed from the reported annual P&L. The financials response carried no such
            section — the tables below are whatever it did return, rendered as the source wrote them." />
      </Card>
    );
  }

  const shown = sortRows(rows.filter((r) => r.row), view.sort, {
    metric: (r) => r.label,
    latest: (r) => r.latest,
    yoy: (r) => r.yoy,
    cagr5: (r) => r.cagr5,
    cagrAll: (r) => r.cagrAll,
  });
  const missing = rows.filter((r) => !r.row);
  const money = (v: number | null, unit: Computed["unit"]) =>
    v === null ? null : unit === "ratio" ? v.toFixed(2) : v.toLocaleString("en-IN");

  return (
    <Card className="mt-5"
      title="Growth &amp; CAGR"
      subtitle={<>Computed from the reported annual P&amp;L — {pl.periods.filter((p) => !p.ttm).length} year-ends, {pl.periods[0]?.label} to {pl.periods.filter((p) => !p.ttm).slice(-1)[0]?.label}</>}
      right={<Pill tone="info">derived</Pill>}
      pad={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full whitespace-nowrap text-[12.5px]">
          <thead className="border-b border-ink-700">
            <Tr view={view}>
              <SortHeader col="metric" view={view} align="left" pad="px-4 py-2">Metric</SortHeader>
              <SortHeader col="latest" view={view} pad="px-3 py-2">Latest</SortHeader>
              <SortHeader col="yoy" view={view} pad="px-3 py-2">YoY</SortHeader>
              <SortHeader col="cagr5" view={view} pad="px-3 py-2">5-yr CAGR</SortHeader>
              <SortHeader col="cagrAll" view={view} pad="px-4 py-2">Full-span CAGR</SortHeader>
            </Tr>
          </thead>
          <tbody className="divide-y divide-ink-700/60">
            {shown.map((r) => (
              <Tr view={view} key={r.label} className="hover:bg-ink-700/30">
                {/* The source's own label is shown only when it DIFFERS from
                    ours — "Operating profit / Financing Profit" tells a reader
                    this is a lender's P&L and is worth the space, while
                    "Revenue / Revenue +" is the same word twice. */}
                <td className="px-4 py-2.5 text-slate-200">
                  {r.label}
                  {r.row!.label.replace(/\s*[+-]\s*$/, "").toLowerCase() !== r.label.toLowerCase() && (
                    <span className="ml-1.5 text-[10.5px] text-slate-500" title="the line item as the source printed it">
                      {r.row!.label}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right mono text-slate-200">
                  {r.latest === null
                    ? <AbsentCell reason="the latest period reports no value for this line" />
                    : <span title={r.latestLabel ?? undefined}>{money(r.latest, r.unit)}</span>}
                </td>
                <td className={`px-3 py-2.5 text-right mono ${r.yoy === null ? "" : changeColor(r.yoy)}`}>
                  {r.yoy === null
                    ? <AbsentCell reason="needs two consecutive periods with a positive base" />
                    : fmtPct(r.yoy, { sign: true, decimals: 1 })}
                </td>
                <td className={`px-3 py-2.5 text-right mono ${r.cagr5 === null ? "" : changeColor(r.cagr5)}`}>
                  {r.cagr5 === null
                    ? <AbsentCell reason="the reported history does not reach back five years, or the earlier value is not positive" />
                    : fmtPct(r.cagr5, { sign: true, decimals: 1 })}
                </td>
                <td className={`px-4 py-2.5 text-right mono ${r.cagrAll === null ? "" : changeColor(r.cagrAll)}`}>
                  {r.cagrAll === null
                    ? <AbsentCell reason="a compound rate needs a positive starting value — a swing from a loss has none" />
                    : <span title={r.cagrAllYears ? `over ${r.cagrAllYears} years` : undefined}>
                        {fmtPct(r.cagrAll, { sign: true, decimals: 1 })}
                      </span>}
                </td>
              </Tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-slate-500">
                None of the headline lines is reported under a name this reads.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        Read from the reported table by ROW LABEL, never by position, and the label the source actually printed is shown
        beside each metric so the figure traces back.
        {missing.length > 0 && <> <span className="text-slate-400">{missing.map((m) => m.label).join(", ")}</span>{" "}
          {missing.length === 1 ? "is" : "are"} absent because this company reports no line under{" "}
          {missing.length === 1 ? "that name" : "those names"} — a lender's P&amp;L and a manufacturer's are different
          documents, and mapping one onto the other would invent a line it never published.</>}
        {" "}A CAGR is left absent rather than computed where the span is under a year or the starting value is not
        positive: a company that swung from a loss to a profit has no compound rate, and the formula returns a
        confident number for it.
      </p>
    </Card>
  );
}
