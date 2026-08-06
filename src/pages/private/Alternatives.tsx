import { useMemo } from "react";
import { Layers, Wallet, TrendingUp, PhoneCall } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { StatTile } from "@/components/StatTile";
import { StockLink } from "@/components/StockLink";
import { AbsentCell, absentTile } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { isPrivateClass, sum, sumOrNull } from "@/lib/analytics";
import { accountIndex, providerOf } from "@/lib/accounts";
import { fmtPct, changeColor } from "@/lib/format";

// ALTERNATIVES / AIF — the private book this drop actually carries.
//
// The fund-of-funds model (privateValueModel → peFunds / startups / …) is empty
// here, because no statement reports a fund-of-funds structure with its own TVPI
// and DPI. What the family DOES hold in private markets is AIF *units*: five
// Category-III / drawdown AIF folios (Sanshi Fund-I classes, 360 ONE Special
// Opportunities, Transition Venture) that report a market value like any other
// holding. Those sit in `positions` with `assetClass: "AIF"` and are counted in
// `BOOK_SUMMARY.privateValue` (₹207.65 Cr, 62% of the book) — but the fund model
// never looked at them, so this page rendered an empty state over the family's
// largest private allocation.
//
// This segment reads those positions directly (isPrivateClass), consolidated by
// security so each fund/class is one row, and shows what the statements report:
// value, cost where given, gain, weight — plus the undrawn commitments the
// drawdown funds print. It asserts nothing the statements don't carry: where an
// AIF folio reports no cost, the gain and return are absent, not zero.

export function Alternatives() {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);

  const holdings = useMemo(() => {
    if (!portfolio) return [];
    const byKey = new Map<string, {
      key: string; name: string; sector: string; provider: string;
      holders: Set<string>; qty: number; cost: (number | null)[]; mv: number; pnl: (number | null)[];
    }>();
    for (const p of consolidated.filter(isPrivateClass)) {
      const e = byKey.get(p.securityKey) ?? {
        key: p.securityKey, name: p.security, sector: p.sector, provider: providerOf(accIdx, p),
        holders: new Set<string>(), qty: 0, cost: [], mv: 0, pnl: [],
      };
      e.qty += p.quantity;
      e.mv += p.marketValue;
      e.cost.push(p.costBasis);
      e.pnl.push(p.unrealizedPnL);
      e.holders.add(p.accountId);
      byKey.set(p.securityKey, e);
    }
    return [...byKey.values()]
      .map((e) => {
        const cost = sumOrNull(e.cost);
        const pnl = sumOrNull(e.pnl);
        return {
          ...e, cost, pnl,
          returnPct: cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
          holderCount: e.holders.size,
        };
      })
      .sort((a, b) => b.mv - a.mv);
  }, [portfolio, consolidated, accIdx]);

  // Undrawn commitments printed by the drawdown AIFs (Transition Venture).
  const commit = useMemo(() => {
    const cs = portfolio?.commitments ?? [];
    return {
      committed: sumOrNull(cs.map((c) => c.committed)),
      drawn: sumOrNull(cs.map((c) => c.drawn)),
      undrawn: sumOrNull(cs.map((c) => c.undrawn)),
      count: cs.length,
    };
  }, [portfolio]);

  if (!portfolio) return null;
  const money = (n: number | null, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const totalMV = sum(holdings.map((h) => h.mv));
  const totalCost = sumOrNull(holdings.map((h) => h.cost));
  const totalPnL = sumOrNull(holdings.map((h) => h.pnl));
  const totalRet = totalCost !== null && totalPnL !== null && totalCost > 0 ? (totalPnL / totalCost) * 100 : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="AIF / alternatives value" value={fmtFromBase(totalMV, { compact: true })}
          sub={`${holdings.length} folio${holdings.length === 1 ? "" : "s"} · marks as of ${portfolio.asOf}`} icon={<Layers className="h-4 w-4" />} />
        <StatTile label="Capital invested"
          {...(totalCost === null
            ? absentTile("no AIF folio in this book prints a cost basis")
            : { value: fmtFromBase(totalCost, { compact: true }), sub: "cost where reported" })}
          icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Embedded gain"
          {...(totalPnL === null
            ? absentTile("needs a cost basis, which these AIF folios do not report")
            : { value: <span className={changeColor(totalPnL)}>{fmtFromBase(totalPnL, { compact: true, sign: true })}</span>, sub: totalRet === null ? "on cost" : `${fmtPct(totalRet, { sign: true, decimals: 1 })} on cost` })}
          icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Undrawn commitment"
          {...(commit.undrawn === null || commit.count === 0
            ? absentTile("no drawdown fund with an undrawn commitment in scope")
            : { value: <span className="text-amber-400">{fmtFromBase(commit.undrawn, { compact: true })}</span>, sub: `across ${commit.count} capital account${commit.count === 1 ? "" : "s"}` })}
          icon={<PhoneCall className="h-4 w-4" />} />
      </div>

      <Card className="mt-5" title="AIF & alternative holdings"
        subtitle="Category-III and drawdown AIF folios, consolidated by fund — value from the statements, cost & gain where reported"
        right={<Pill tone="info">{holdings.length} folio{holdings.length === 1 ? "" : "s"}</Pill>} pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[13px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Fund / folio</th>
                <th className="label-xs px-3 py-2 text-left font-medium">Manager</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Invested</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Current value</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Gain</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Return</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {holdings.map((h) => (
                <tr key={h.key} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100">
                    <StockLink securityKey={h.key} name={h.name} />
                    {h.holderCount > 1 && <span className="ml-2 text-[10px] text-slate-500">{h.holderCount} holders</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-400">{h.provider}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">{h.cost === null ? <AbsentCell reason="this AIF folio reports no cost basis" /> : money(h.cost)}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-200">{money(h.mv)}</td>
                  <td className={`px-3 py-2.5 text-right mono ${h.pnl === null ? "text-slate-500" : changeColor(h.pnl)}`}>{h.pnl === null ? <AbsentCell reason="no cost basis, so gain is not measurable" /> : money(h.pnl, true)}</td>
                  <td className={`px-3 py-2.5 text-right mono ${h.returnPct === null ? "text-slate-500" : changeColor(h.returnPct)}`}>{h.returnPct === null ? <AbsentCell reason="no cost basis" /> : fmtPct(h.returnPct, { sign: true, decimals: 1 })}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">{totalMV > 0 ? `${((h.mv / totalMV) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-ink-600 font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-slate-200">Total</td>
                <td />
                <td className="px-3 py-2.5 text-right mono text-slate-300">{totalCost === null ? "—" : money(totalCost)}</td>
                <td className="px-3 py-2.5 text-right mono text-slate-100">{money(totalMV)}</td>
                <td className={`px-3 py-2.5 text-right mono ${totalPnL === null ? "text-slate-500" : changeColor(totalPnL)}`}>{totalPnL === null ? "—" : money(totalPnL, true)}</td>
                <td className={`px-3 py-2.5 text-right mono ${totalRet === null ? "text-slate-500" : changeColor(totalRet)}`}>{totalRet === null ? "—" : fmtPct(totalRet, { sign: true, decimals: 1 })}</td>
                <td className="px-3 py-2.5 text-right mono text-slate-300">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-dashed border-ink-700 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          These are AIF <span className="text-slate-400">units</span> as the folios report them — a Category-III AIF's own
          NAV, not a look-through into the underlying securities (no look-through statement is in the drop). Several folios
          value the units at a total market value and print no cost, so gain and return are absent for those rather than
          shown as zero.
          {commit.count > 0 && commit.undrawn !== null && (
            <> The drawdown funds also carry <span className="text-amber-400">{money(commit.undrawn)}</span> of undrawn commitment — capital the fund can still call.</>
          )}
        </p>
      </Card>
    </>
  );
}
