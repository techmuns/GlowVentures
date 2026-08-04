import { useMemo, useState } from "react";
import { Star, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { StockLink } from "@/components/StockLink";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum } from "@/lib/analytics";
import { fmtPct, fmtDate, changeColor } from "@/lib/format";
import { readWatchlist, firedAlerts, upsidePct, ALERT_WORDING, type WatchEntry } from "@/lib/watchlist";
import type { Position } from "@/lib/types";

// THE WATCHLIST — every name the family has recorded a view on.
//
// Two facts sit side by side here and must not be confused. The PRICE and the
// POSITION are measured: they come from the book and the quote feed and trace to
// a statement. The TARGET, the FAIR VALUE and the LEVELS are judgements someone
// typed. The table keeps them in separate column groups and the caption says so.
//
// A name can be on this list without being held — that is the point of a
// watchlist — and one that is held shows its position beside the view. Neither
// is inferred from the other.
//
// Everything here lives in this browser's localStorage. That is a real limit and
// it is stated on the page rather than left for someone to discover when they
// open the cockpit on a different machine.

type Row = {
  entry: WatchEntry;
  security: string;
  positions: Position[];
  price: number | null;
  priceIsLive: boolean;
};

export function Watchlist() {
  const { portfolio, fmtFromBase } = usePortfolio();
  // Read once per mount. The store only changes from the company page, and a
  // live subscription would be machinery for an event that cannot happen while
  // this page is open.
  const [watchlist] = useState(() => readWatchlist());

  const rows = useMemo<Row[]>(() => {
    if (!portfolio) return [];
    const byKey = new Map<string, Position[]>();
    for (const p of portfolio.positions) {
      const a = byKey.get(p.securityKey);
      if (a) a.push(p); else byKey.set(p.securityKey, [p]);
    }
    return Object.values(watchlist)
      .map((entry) => {
        const positions = byKey.get(entry.securityKey) ?? [];
        return {
          entry,
          // A watched name the book does not hold has no printed security name,
          // so the key is shown as-is rather than prettified into something no
          // statement says.
          security: positions[0]?.security ?? entry.securityKey,
          positions,
          price: positions[0]?.currentPrice ?? null,
          priceIsLive: positions.length > 0 && positions.every((p) => p.live),
        };
      })
      .sort((a, b) => sum(b.positions.map((p) => p.marketValue)) - sum(a.positions.map((p) => p.marketValue))
        || a.security.localeCompare(b.security));
  }, [portfolio, watchlist]);

  const alerts = useMemo(
    () => rows.flatMap((r) => firedAlerts(r.entry, r.price).map((a) => ({ ...a, security: r.security, priceIsLive: r.priceIsLive }))),
    [rows],
  );

  if (!portfolio) return null;
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  return (
    <div>
      <PageHeader
        eyebrow="RESEARCH"
        title="Watchlist & targets"
        subtitle={<>Names we are following and the view we hold on each. Prices are measured; targets, fair values and levels are ours.</>}
        right={<BasisPill liveText="Prices move with the feed; the targets beside them do not." />}
      />

      {alerts.length > 0 && (
        <Card className="mb-5" title={`${alerts.length} alert${alerts.length === 1 ? "" : "s"} tripped`}>
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={`${a.securityKey}-${a.kind}-${i}`} className="flex items-start gap-2 text-[12.5px] text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong className="text-slate-200">{a.security}</strong> — {ALERT_WORDING[a.kind]}:{" "}
                  {fmtFromBase(a.threshold)} set, {fmtFromBase(a.price)} now
                  {a.priceIsLive ? "" : " on the statement mark, not a live price"}.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 && (
        <Card>
          <AbsentSection
            what="Nothing on the watchlist yet"
            needs="Open any holding and use Investment tools to add it, or to record a target price, fair value, entry and exit levels and why we own it. Nothing here is seeded — an empty list means nobody has recorded a view, not that a view was lost."
          >
            <Star className="mt-1 h-4 w-4 text-slate-600" />
          </AbsentSection>
        </Card>
      )}

      {rows.length > 0 && (
        <Card
          title="Recorded views"
          subtitle="Measured figures on the left of the divider, our own view on the right."
          right={<Pill>{rows.length} name{rows.length === 1 ? "" : "s"}</Pill>}
          pad={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-ink-700/70">
                  <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Held</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Price</th>
                  <th className="label-xs border-r border-ink-700/70 px-4 py-2 text-right font-medium">Value</th>
                  <th className="label-xs px-4 py-2 text-right font-medium" title="Our own view — not a market figure">Target</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Upside</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Fair value</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Entry</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Exit</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {rows.map((r) => {
                  const up = upsidePct(r.price, r.entry.targetPrice);
                  const mv = sum(r.positions.map((p) => p.marketValue));
                  return (
                    <tr key={r.entry.securityKey} className="align-top">
                      <td className="px-4 py-2.5">
                        <StockLink securityKey={r.entry.securityKey} name={r.security} className="text-slate-100" />
                        {r.entry.watching && <Star className="ml-1.5 inline h-3 w-3 fill-current text-champagne-400" />}
                        {r.entry.note && (
                          <div className="mt-0.5 max-w-md text-[11px] leading-snug text-slate-500">{r.entry.note}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">
                        {r.positions.length === 0
                          ? <AbsentCell reason="not held — on the list, but no statement in this book carries it" />
                          : r.positions.length}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-300">
                        {r.price === null ? <AbsentCell reason="no per-unit price for this security" /> : fmtFromBase(r.price)}
                      </td>
                      <td className="border-r border-ink-700/70 px-4 py-2.5 text-right mono text-slate-300">
                        {r.positions.length === 0 ? <AbsentCell reason="not held" /> : money(mv)}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-200">
                        {r.entry.targetPrice === null ? <AbsentCell reason="no target set" /> : fmtFromBase(r.entry.targetPrice)}
                      </td>
                      <td className={`px-4 py-2.5 text-right mono ${up === null ? "" : changeColor(up)}`}>
                        {up === null ? <AbsentCell reason="needs both a target and a price" /> : fmtPct(up, { sign: true, decimals: 1 })}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">
                        {r.entry.fairValue === null ? <AbsentCell reason="no fair value set" /> : fmtFromBase(r.entry.fairValue)}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">
                        {r.entry.entryPrice === null ? <AbsentCell reason="no entry level set" /> : fmtFromBase(r.entry.entryPrice)}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">
                        {r.entry.exitPrice === null ? <AbsentCell reason="no exit level set" /> : fmtFromBase(r.entry.exitPrice)}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-500">
                        {r.entry.updatedAt ? fmtDate(r.entry.updatedAt.slice(0, 10)) : <AbsentCell reason="never edited" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-700/70 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            <strong className="text-slate-400">Stored in this browser only.</strong>{" "}
            Targets and notes do not follow you to another device and are not visible to
            anyone else in the family. A shared view needs a server-side store, which this
            cockpit does not have — the book itself is generated from <code>source/</code> and
            must stay byte-identical to it, so a judgement can never be written into it.
          </p>
        </Card>
      )}
    </div>
  );
}
