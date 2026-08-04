import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { fmtPct, changeColor, fmtDate } from "@/lib/format";
import { fetchReturnsTable, type ReturnsTable as Table } from "@/lib/returnsTable";

// The client spec's RETURNS TABLE for one security.
//
// Each row is an independent measurement: a close the feed resolved, the price
// today, and the return between them. A horizon the feed cannot answer shows a
// dash and says why — it never falls back to a nearer date, which would label a
// nine-month return as a one-year one.
//
// The spec also asks for an interactive price chart over adjustable periods. It
// is not here and the card says so rather than drawing one: the muns
// `market_data` endpoint returns a four-row PREVIEW of any window, never the
// series, so there is no path to plot. A line drawn through the ten closes below
// would look like a price history and be nothing of the sort.

export function ReturnsTable({ ticker, price, priceIsLive, asOf }: {
  /** NSE symbol. Null when the security has none — the card says so. */
  ticker: string | null;
  /** The price returns are measured TO. */
  price: number | null;
  /** True when `price` came from the live feed rather than a statement mark. */
  priceIsLive: boolean;
  /** The book's as-of date, used when the price is a statement mark. */
  asOf: string;
}) {
  const [table, setTable] = useState<Table | null | undefined>(undefined);

  useEffect(() => {
    if (!ticker || price === null || !(price > 0)) { setTable(null); return; }
    let alive = true;
    setTable(undefined);
    // Measured to TODAY on a live price and to the book's as-of date on a
    // statement mark. Closing a return against today using a month-old mark
    // would report the market's move over a window the price never covered.
    const to = priceIsLive ? new Date() : new Date(asOf + "T00:00:00Z");
    fetchReturnsTable(ticker, price, to).then((r) => { if (alive) setTable(r); });
    return () => { alive = false; };
  }, [ticker, price, priceIsLive, asOf]);

  const basis = priceIsLive ? "the live price" : `the statement mark of ${fmtDate(asOf)}`;

  if (!ticker) {
    return (
      <Card className="mt-5" title="Returns">
        <AbsentSection
          what="No NSE symbol is mapped to this security"
          needs="Returns are measured against exchange closes, so a security with no listing — cash, a receivable, a fund unit — has none to measure against. See docs/BOOK-REPORT.md for the securities in that position."
        />
      </Card>
    );
  }
  if (price === null || !(price > 0)) {
    return (
      <Card className="mt-5" title="Returns">
        <AbsentSection
          what="No price to measure returns to"
          needs="This holding is marked at a total value with no per-unit price — 360 ONE reports its AIF that way. A return needs a price on both ends."
        />
      </Card>
    );
  }

  return (
    <Card
      className="mt-5"
      title="Returns"
      subtitle={<>Measured to {basis}. Each row is one close the feed resolved — nothing between them is drawn or assumed.</>}
      right={<Pill>{ticker}</Pill>}
      pad={false}
    >
      {table === undefined && (
        <div className="px-5 py-8 text-center text-xs text-slate-500">Resolving closes…</div>
      )}
      {table === null && (
        <div className="px-5 py-6">
          <AbsentSection
            what="The price-history service didn't answer"
            needs="Returns come from the muns market_data endpoint. When it is unreachable this card stays empty rather than showing a return computed from a price we don't have."
          />
        </div>
      )}
      {table && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-ink-700/70">
                  <th className="label-xs px-4 py-2 text-left font-medium">Period</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">From close</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">On</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {table.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-2 font-medium text-slate-200">{r.label}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">
                      {r.from ? r.from.close.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : <AbsentCell reason={r.reason ?? undefined} />}
                    </td>
                    <td className="px-4 py-2 text-[12px] text-slate-500">
                      {r.from ? fmtDate(r.from.date) : <AbsentCell reason={r.reason ?? undefined} />}
                    </td>
                    <td className={`px-4 py-2 text-right mono ${r.pct === null ? "" : changeColor(r.pct)}`}>
                      {r.pct === null ? <AbsentCell reason={r.reason ?? undefined} /> : fmtPct(r.pct, { sign: true, decimals: 2 })}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">
                      {r.pct === null ? "—"
                        : r.annualised ? `annualised over ${r.elapsedYears!.toFixed(1)} years`
                        : r.elapsedYears !== null && r.elapsedYears < 1 && r.key !== "QTD" && r.key !== "YTD" && ["3Y", "5Y", "10Y", "MAX"].includes(r.key)
                          ? `total — only ${(r.elapsedYears * 12).toFixed(0)} months of history`
                          : "total"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            <strong className="text-slate-400">No price chart.</strong>{" "}
            The spec asks for interactive charts over adjustable periods. The market-data
            endpoint this cockpit has returns a four-row preview of any window — a header,
            the first two rows and the last two — and never the series itself, so there is
            nothing to plot. The table above is what that preview can answer honestly: one
            close per period. A chart needs a full-series endpoint.
            {table.unresolved.length > 0 && (
              <> {table.unresolved.length} period{table.unresolved.length === 1 ? "" : "s"} could
              not be resolved and {table.unresolved.length === 1 ? "is" : "are"} shown as absent
              rather than filled from a nearer date.</>
            )}
          </p>
        </>
      )}
    </Card>
  );
}
