import { useMemo } from "react";
import { CalendarClock, ShieldCheck, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { parseFinancials } from "@/lib/financialTables";
import {
  parseStatements, statementNamed, scaledRowAny, checkUnits, earningsCalendar,
  isUpcoming, CASH_FLOW_LINES,
} from "@/lib/yfinStatements";

// THE CASH FLOW STATEMENT AND THE EARNINGS CALENDAR.
//
// Both are spec items that had no source until `/financials/<T>.NS` was probed:
// the screener document behind the Financials tab carries neither, and the
// calendar in particular is the exact figure that was DELETED from this page as
// a fabrication ("Next earnings 24 Oct 2026"). It is a measurement now.
//
// ── WHY THE UNIT CHECK IS ON SCREEN AND NOT IN A COMMENT ────────────────────
//
// This source prints rupees with a dollar sign, on every numeric cell including
// share counts. `src/lib/yfinStatements.ts` establishes the real unit by
// reconciling two figures against the screener statements for the same company,
// and NOTHING MONETARY RENDERS UNTIL THAT PASSES — an unmeasurable check is
// treated exactly like a failed one, because a check that did not run is not a
// check that passed.
//
// The comparison is printed rather than summarised into a badge. A reader who
// is told "units verified" has learnt nothing they can act on; a reader who is
// shown "EPS 14.41 here against 14.75 there" can see what was verified and go
// and disagree with it.

/** The check's reason reads mid-sentence in one place and sentence-initial in another. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Sig-fig-aware money: this source rounds to three, so it is never printed wider. */
function useMoney() {
  const { fmtFromBase } = usePortfolio();
  return (v: number | null) => (v === null ? null : fmtFromBase(v, { compact: true, sign: true }));
}

export function CashFlowPanel({
  statementsMarkdown, screenerMarkdown, ticker,
}: { statementsMarkdown: string; screenerMarkdown: string | null; ticker: string }) {
  const st = useMemo(() => parseStatements(statementsMarkdown), [statementsMarkdown]);
  const screener = useMemo(() => (screenerMarkdown ? parseFinancials(screenerMarkdown) : null), [screenerMarkdown]);
  const units = useMemo(() => checkUnits(st, screener), [st, screener]);
  const cf = useMemo(() => statementNamed(st, "Cash Flow Statement"), [st]);
  const cal = useMemo(() => earningsCalendar(st), [st]);
  const money = useMoney();

  // The "No data available" stub is what a ticker with no coverage returns, and
  // it is a different fact from a request that failed.
  if (st.empty || (!cf && !st.calendar.length)) {
    return (
      <AbsentSection
        what={`The statements service reports no data for ${ticker}`}
        needs="It answered, and every section came back empty. This happens for a listing it does not cover —
          it is not an outage, and re-loading will not change it." />
    );
  }

  const rows = cf
    ? CASH_FLOW_LINES.map((m) => ({ ...m, row: scaledRowAny(cf, m.labels) })).filter((m) => m.row)
    : [];
  const confirmed = units.verdict === "confirmed";

  return (
    <div className="mt-5 space-y-5">
      {/* ── THE UNIT CHECK, ABOVE THE FIGURES IT GOVERNS ───────────────────── */}
      <div className={`rounded-lg border px-3.5 py-3 text-[12px] leading-relaxed ${
        confirmed ? "border-emerald-500/35 bg-emerald-500/[0.07] text-emerald-200"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
        <div className="flex items-start gap-2">
          {confirmed ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                     : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium">
              {confirmed ? "Figures are in rupees — checked, not assumed." : "The unit of these figures is not established."}
            </div>
            <p className="mt-1 text-[11.5px] opacity-90">
              This source prints every number with a dollar sign, including share counts, so the symbol says nothing
              about the currency. {sentence(units.reason)}.
            </p>
            {units.checks.some((c) => c.ratio !== null) && (
              <ul className="mt-2 space-y-0.5 text-[11px] opacity-90">
                {units.checks.filter((c) => c.ratio !== null).map((c) => (
                  <li key={c.what} className="mono">
                    {c.agrees ? "✓" : "✗"} {c.what} {c.year}: {c.ours?.toLocaleString("en-IN")} here vs{" "}
                    {c.theirs?.toLocaleString("en-IN")} on screener
                    {c.expectedRatio === 1e7 ? " (crore)" : ""} — establishes the {c.establishes}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── CASH FLOW ──────────────────────────────────────────────────────── */}
      {!cf ? (
        <AbsentSection
          what="This response carries no cash flow statement"
          needs="The other sections came back, so the company is covered — this particular statement is not in the response." />
      ) : !confirmed ? (
        <AbsentSection
          what="The cash flow statement is withheld until its unit is established"
          needs={`${sentence(units.reason)}. The figures are in the response and are not shown, because a cash flow
            statement rendered in the wrong currency is worse than none: every line on it would be wrong by
            roughly a factor of ninety, and each would look like an ordinary number.`} />
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[13px] font-medium text-slate-200">Cash flow statement</h4>
            <Pill tone="info">{rows.length} of {CASH_FLOW_LINES.length} lines reported</Pill>
          </div>
          <div className="overflow-x-auto">
            {/* Exempt, declared — see `ReturnsTable`: the columns are the
                  statement's own periods and the rows its own lines. */}
              <table className="min-w-full whitespace-nowrap text-[12.5px]"
                data-table-static="the columns are the periods of an upstream financial document and the rows are its own line items, in its own order — sorting the rows would scramble a statement and moving a period would break its chronology">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-3 py-2 text-left font-medium">Line</th>
                  {cf.periods.map((p) => (
                    <th key={p.label} className="label-xs px-3 py-2 text-right font-medium">
                      {p.year ?? p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {rows.map((m) => (
                  <tr key={m.label} className="hover:bg-ink-700/30">
                    <td className="px-3 py-2.5 text-slate-200">
                      {m.label}
                      <span className="ml-1.5 text-[10.5px] text-slate-500" title={m.hint ?? "the line item as the source labels it"}>
                        {m.row!.label}
                      </span>
                    </td>
                    {cf.periods.map((p, i) => {
                      const c = m.row!.cells[i];
                      return (
                        <td key={p.label} className="px-3 py-2.5 text-right mono text-slate-200">
                          {c?.value === null || c?.value === undefined
                            // The oldest column is N/A on almost every line of a
                            // five-column cash flow that reports four years.
                            ? <AbsentCell reason="this period is not reported on this line" />
                            : <span title={`the source printed ${c.raw}`}>{money(c.value)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
            Rounded to three significant figures BY THE SOURCE — the cell tooltip shows exactly what it printed.
            Nothing is derived from these: a margin or a growth rate computed on three-figure inputs would come out
            looking as precise as the arithmetic rather than as precise as the data.
          </p>
        </div>
      )}

      {/* ── THE CALENDAR — dates need no unit, so they survive a failed check ─ */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
          <h4 className="text-[13px] font-medium text-slate-200">Calendar</h4>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <DateTile label="Earnings date" iso={cal.earningsDate}
            absent="this response carries no earnings date for the company" />
          <DateTile label="Ex-dividend date" iso={cal.exDividendDate}
            absent="this response carries no ex-dividend date for the company" />
        </div>
        {confirmed && (cal.epsAverage !== null || cal.revenueAverage !== null) && (
          <div className="mt-2.5 rounded-lg border border-ink-700 bg-ink-900/50 px-3.5 py-3 text-[12px]">
            <div className="label-xs mb-1.5">Street estimate for the next reported period</div>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Estimate label="EPS" low={cal.epsLow} avg={cal.epsAverage} high={cal.epsHigh} fmt={(v) => v.toFixed(2)} />
              <Estimate label="Revenue" low={cal.revenueLow} avg={cal.revenueAverage} high={cal.revenueHigh}
                fmt={(v) => money(v) ?? ""} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              An estimate is a forecast, not a measurement — it is what analysts expect, and it is shown here because
              the calendar it sits beside is the only place on this dashboard that looks forward.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A calendar date, labelled by whether it has already happened.
 *
 * The response carries a PAST ex-dividend date as readily as a future earnings
 * date, and "next" over a date three months gone is a wrong figure, not a stale
 * one. So the tile states which it is rather than assuming.
 */
function DateTile({ label, iso, absent }: { label: string; iso: string | null; absent: string }) {
  const upcoming = isUpcoming(iso);
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/50 px-3.5 py-3">
      <div className="label-xs">{label}</div>
      {iso === null ? (
        <div className="mt-1"><AbsentCell reason={absent} /></div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="mono text-[15px] text-slate-100">{iso}</span>
          <span className={`text-[11px] ${upcoming ? "text-emerald-400" : "text-slate-500"}`}>
            {upcoming ? "upcoming" : "already passed"}
          </span>
        </div>
      )}
    </div>
  );
}

function Estimate({ label, low, avg, high, fmt }: {
  label: string; low: number | null; avg: number | null; high: number | null; fmt: (v: number) => string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      {avg === null
        ? <AbsentCell reason={`no ${label.toLowerCase()} estimate in this response`} />
        : (
          <span className="mono text-slate-200">
            {fmt(avg)}
            {low !== null && high !== null && low !== high && (
              <span className="ml-1.5 text-[11px] text-slate-500">({fmt(low)} – {fmt(high)})</span>
            )}
          </span>
        )}
    </div>
  );
}
