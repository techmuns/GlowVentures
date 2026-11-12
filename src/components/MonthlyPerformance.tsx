// ── MONTH-ON-MONTH PERFORMANCE, FOR THE PRINCIPALS (task 408) ────────────────
//
//   *"what's been my performance month on month? From the beginning of the year
//    to this month … if I want to show it to my principals."* — Yamini, 5 Nov 2026.
//
// One row per calendar month, from the book's own series start to its latest
// dated month. Every figure is struck by the SAME engine the Returns tab uses
// for a single period (`returnSelectionFor` → `selectedSegmentReturns` →
// `capitalBridge`), so a month here and the same window picked on the Returns
// tab cannot disagree:
//
//   · Opening / Money in / Money out / Gain / Closing — the capital bridge over
//     the accounts the month measures (start + money in − money out + gain = end).
//   · Return — that month's money-weighted return (Modified Dietz), the Returns
//     tab's own figure for the window.
//   · Cumulative — the measured monthly returns linked geometrically (GIPS links
//     sub-period Modified Dietz returns to make the period return).
//   · Nifty 500 — the index's move over the same month, on the same price feed
//     the NAV card draws; a month the feed does not cover reads "—", never 0%.
//
// WHOLE BOOK ONLY, like the NAV series and the drawdown: a per-member month-on-
// month needs a dated series per member the book does not carry, so a selected
// member sees "whole family only" rather than a figure over part of the book.
//
// A month no record measures reads "—" with its reason — never a zero.
import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card } from "@/components/Card";
import { ExportableTable } from "@/components/ExportableTable";
import { AbsentCell, AbsentSection, DASH } from "@/components/Absent";
import { fmtPct, fmtDate, changeColor } from "@/lib/format";
import { currentHoldings, dedupedPositions } from "@/lib/analytics";
import { returnSelectionFor } from "@/lib/useReturnSelection";
import { selectedSegmentReturns } from "@/lib/selectedSegmentReturns";
import { exitedRows } from "@/lib/drilldown";
import { useMarketHistories } from "@/lib/useMarketReturns";
import { assumedHoldingBook } from "@/lib/assumedHoldingBook";
import { capitalBridge } from "@/lib/capitalBridge";
import { useBenchmarkLevels } from "@/components/HoldingBenchmark";
import { wholeFamilyOnly } from "@/lib/memberScope";
import {
  BOOK_ACCOUNT_BRIDGES, BOOK_CAPITAL_MOVES, BOOK_HOLDING_INCOME, BOOK_CAPITAL_GAINS,
} from "@/data/glowData";

type MonthRow = {
  month: string; from: string; to: string;
  opening: number | null; moneyIn: number | null; moneyOut: number | null;
  gain: number | null; closing: number | null;
  ret: number | null; cumulative: number | null;
  bench: number | null; benchCumulative: number | null;
  covered: number; reason: string | null;
};

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const lastDayOf = (c: Date) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

export function MonthlyPerformance() {
  const { portfolio, statementPortfolio, consolidated, corporateActions, fmtFromBase, scope } = usePortfolio();
  const current = useMemo(() => currentHoldings(consolidated), [consolidated]);
  const feed = useMarketHistories(current);
  const assumptions = useMemo(
    () => assumedHoldingBook({ actions: corporateActions, instruments: feed.instruments, histories: feed.histories }),
    [corporateActions, feed.instruments, feed.histories],
  );
  const benchLevels = useBenchmarkLevels(["nifty-500"]);

  const rows = useMemo<MonthRow[]>(() => {
    const statement = statementPortfolio ?? portfolio;
    if (!statement || scope.selected) return [];
    const hist = portfolio?.navHistory ?? [];
    if (hist.length < 2) return [];
    const firstDate = hist[0].date, lastDate = hist[hist.length - 1].date;
    const recorded = dedupedPositions(statement.positions);
    const holdingsNow = currentHoldings(recorded);
    const exited = exitedRows(recorded);
    const bridgeBook = {
      accounts: statement.accounts, positions: statement.positions,
      bridges: BOOK_ACCOUNT_BRIDGES, moves: BOOK_CAPITAL_MOVES, income: BOOK_HOLDING_INCOME, capitalGains: BOOK_CAPITAL_GAINS,
    };
    const lv = benchLevels("nifty-500");
    const niftyLevel = "level" in lv ? lv.level : null;

    const out: MonthRow[] = [];
    let cumStart: string | null = null;
    const start = new Date(`${firstDate.slice(0, 7)}-01T00:00:00Z`);
    const endMonth = new Date(`${lastDate.slice(0, 7)}-01T00:00:00Z`);
    for (let c = start; c <= endMonth; c = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1))) {
      const month = c.toISOString().slice(0, 7);
      const a = `${month}-01`;
      const monthEnd = lastDayOf(c);
      const b = monthEnd < lastDate ? monthEnd : lastDate;
      const selection = a < b ? returnSelectionFor({ period: "custom", start: a, end: b, type: "xirr", statement, current, assumptions }) : null;
      const pool = selection ? selectedSegmentReturns(current, exited, statement.accounts, "category", selection, () => null, holdingsNow) : null;
      const total = pool?.total ?? null;
      const bridge = total && total.units.length ? capitalBridge(total.units, bridgeBook) : null;
      const ret = total?.periodPct ?? null;

      // Cumulative runs from the book's FIRST MEASURED month to this month's end
      // — the available-history money-weighted return, the Returns tab's own
      // figure — NOT a compounding of the monthly cohorts (which can differ month
      // to month, as HomeMonthly warns) and never a cumulative beside a month that
      // measures nothing, which would read as a return next to "no dates".
      if (ret != null && cumStart == null) cumStart = a;
      const cSel = cumStart && cumStart <= b ? returnSelectionFor({ period: "custom", start: cumStart, end: b, type: "xirr", statement, current, assumptions }) : null;
      const cPool = cSel ? selectedSegmentReturns(current, exited, statement.accounts, "category", cSel, () => null, holdingsNow) : null;
      const cumulative = cPool?.total.periodPct ?? null;

      let bench: number | null = null, benchCumulative: number | null = null;
      if (niftyLevel) {
        const l0 = niftyLevel(a), l1 = niftyLevel(b);
        if (l0 != null && l1 != null && l0 > 0) bench = (l1 / l0 - 1) * 100;
        const cl0 = cumStart ? niftyLevel(cumStart) : null, cl1 = niftyLevel(b);
        if (cl0 != null && cl1 != null && cl0 > 0) benchCumulative = (cl1 / cl0 - 1) * 100;
      }

      out.push({
        month, from: a, to: b,
        opening: bridge?.opening ?? null, moneyIn: bridge?.added ?? null, moneyOut: bridge?.takenOut ?? null,
        gain: bridge?.gain ?? null, closing: bridge?.closing ?? null,
        ret, cumulative, bench, benchCumulative,
        covered: bridge?.rows.length ?? 0,
        reason: ret != null ? null : pool ? "no money-weighted return is measurable for this month" : "no dated record covers this month",
      });
    }
    return out;
  }, [portfolio, statementPortfolio, scope.selected, current, assumptions, benchLevels]);

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const measured = rows.filter((r) => r.ret != null);
  const accounts = (statementPortfolio ?? portfolio)?.accounts.length ?? 0;
  const maxCovered = rows.reduce((m, r) => Math.max(m, r.covered), 0);

  if (scope.selected) {
    return (
      <Card className="mt-5" title="Month-on-month performance"
        subtitle="Each month's opening value, money in and out, gain, money-weighted return and the Nifty 500 over the same month.">
        <div data-month-scope-absent>
          <AbsentSection what={`Whole family only · not shown for ${scope.label}`}
            needs={wholeFamilyOnly("The dated NAV series a month-on-month table is struck on", scope.label)} />
        </div>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card className="mt-5" title="Month-on-month performance" subtitle="Each month's opening value, money in and out, gain and money-weighted return.">
        <AbsentSection what="No dated monthly series in this book"
          needs="A month-on-month table needs the book's value at two or more dates. No account here publishes a dated series yet." />
      </Card>
    );
  }

  return (
    <Card className="mt-5" title="Month-on-month performance"
      subtitle={`Each month from ${fmtDate(rows[0].from)} to ${fmtDate(rows[rows.length - 1].to)}: its opening value, money in and out, gain, money-weighted return (Modified Dietz) and the Nifty 500 over the same month. Cumulative is the money-weighted return from the book's first measured month to that month — the available-history figure the Returns tab shows. Each month covers the accounts the book can value for it, so an opening value can step up as more accounts report; coverage reaches ${maxCovered} of ${accounts} accounts. Export to Excel from the table menu.`}>
      <div className="overflow-x-auto" data-navigation-scroll="monthly-performance" data-month-table>
        <ExportableTable exportName="Month-on-month performance" className="w-full text-[12.5px]" data-table-static="one row per calendar month in order; the columns are a bridge read left to right — opening, money in and out, gain, closing, the month's return, the cumulative and the Nifty 500">
          <thead className="label-xs border-b border-ink-700">
            <tr>
              <th className="px-2 py-2 text-left">Month</th>
              <th className="px-2 py-2 text-right">Opening</th>
              <th className="px-2 py-2 text-right">Money in</th>
              <th className="px-2 py-2 text-right">Money out</th>
              <th className="px-2 py-2 text-right">Gain</th>
              <th className="px-2 py-2 text-right">Closing</th>
              <th className="px-2 py-2 text-right">Return</th>
              <th className="px-2 py-2 text-right">Cumulative</th>
              <th className="px-2 py-2 text-right">Nifty 500</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-ink-700/60" data-month-row data-month={r.month}
                data-ret={r.ret ?? ""} data-cumulative={r.cumulative ?? ""} data-gain={r.gain ?? ""} data-bench={r.bench ?? ""}>
                <td className="px-2 py-2 text-slate-200">{monthLabel(r.month)}</td>
                <td className="px-2 py-2 text-right mono text-slate-300">{r.opening == null ? <AbsentCell reason={r.reason ?? undefined} /> : money(r.opening)}</td>
                <td className="px-2 py-2 text-right mono text-slate-300">{r.moneyIn == null ? DASH : money(r.moneyIn)}</td>
                <td className="px-2 py-2 text-right mono text-slate-300">{r.moneyOut == null ? DASH : money(r.moneyOut)}</td>
                <td className={`px-2 py-2 text-right mono ${r.gain == null ? "" : changeColor(r.gain)}`}>{r.gain == null ? <AbsentCell reason={r.reason ?? undefined} /> : money(r.gain, true)}</td>
                <td className="px-2 py-2 text-right mono text-slate-300">{r.closing == null ? DASH : money(r.closing)}</td>
                <td className="px-2 py-2 text-right mono">{r.ret == null ? <AbsentCell reason={r.reason ?? undefined} /> : <span className={changeColor(r.ret)}>{fmtPct(r.ret, { sign: true, decimals: 2 })}</span>}</td>
                <td className="px-2 py-2 text-right mono">{r.cumulative == null ? <AbsentCell reason="this month is before the book's first measured value, so there is no cumulative to show" /> : <span className={changeColor(r.cumulative)}>{fmtPct(r.cumulative, { sign: true, decimals: 2 })}</span>}</td>
                <td className="px-2 py-2 text-right mono">{r.bench == null ? <AbsentCell reason="the Nifty 500 close for this month has not been fetched" /> : <span className={changeColor(r.bench)}>{fmtPct(r.bench, { sign: true, decimals: 2 })}</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-ink-600 font-semibold">
            <tr data-month-foot>
              <td className="px-2 py-2 text-slate-200">Cumulative · {measured.length} month{measured.length === 1 ? "" : "s"}</td>
              <td className="px-2 py-2 text-right mono text-slate-400" colSpan={5}>{measured.length ? `${fmtDate(measured[0].from)} → ${fmtDate(measured[measured.length - 1].to)}` : ""}</td>
              <td className="px-2 py-2 text-right mono" />
              <td className="px-2 py-2 text-right mono">{measured.length && measured[measured.length - 1].cumulative != null ? <span className={changeColor(measured[measured.length - 1].cumulative!)}>{fmtPct(measured[measured.length - 1].cumulative!, { sign: true, decimals: 2 })}</span> : DASH}</td>
              <td className="px-2 py-2 text-right mono">{measured.length && measured[measured.length - 1].benchCumulative != null ? <span className={changeColor(measured[measured.length - 1].benchCumulative!)}>{fmtPct(measured[measured.length - 1].benchCumulative!, { sign: true, decimals: 2 })}</span> : DASH}</td>
            </tr>
          </tfoot>
        </ExportableTable>
      </div>
    </Card>
  );
}

export default MonthlyPerformance;
