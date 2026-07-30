import { useState } from "react";
import { Layers, Coins, Fuel, Gem } from "lucide-react";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SearchInput } from "@/components/SearchInput";
import { SortHeader } from "@/components/SortHeader";
import { usePortfolio } from "@/context/PortfolioContext";
import { Auditable } from "@/components/Auditable";
import { auditHref, netReturnFormula, privateHref } from "@/lib/auditFormulas";
import { useSort } from "@/lib/useSort";
import { fmtDate } from "@/lib/format";
import { multipleTone, netMultiple, type PrivateClass, type TaggedFund } from "@/lib/privateValue";

// One class of pooled holding — Unlisted Companies, PE / VC, Pre-IPO or Debt.
// Each holding appears on exactly one of these tabs; nothing is listed twice.
//
// This replaces a "Funds & Commitments" tab that showed all four classes mixed
// together, and showed the pooled funds twice over: once in a capital-call table
// and again in a performance table. Here the two are one table — the pledged and
// still-to-invest columns simply appear when the class has undrawn commitments,
// and are dropped when it doesn't (unlisted companies and debt are bought
// outright, so all 15 unlisted holdings have committed == drawn).

// Net total return per ₹1 invested — the mark plus cash already returned, so a
// fund that repays capital as it succeeds isn't read as a loss. TVPI where cash
// has come back, MOIC where none has; see lib/privateValue.
const netOf = (f: TaggedFund) => netMultiple(f.drawn, f.currentValue, f.distributed);
const NET_TITLE = "Everything ₹1 invested has produced — current value plus cash already returned (TVPI; MOIC where nothing has been paid back yet).";

export function FundClass({ cls, money }: { cls: PrivateClass; money: (n: number, sign?: boolean) => string }) {
  const { fmtFromBase } = usePortfolio();
  const [query, setQuery] = useState("");

  // Only pooled funds that still have capital to call get the commitment columns.
  const hasCommitments = cls.unfunded > 0;
  const dpi = cls.invested > 0 ? cls.distributed / cls.invested : 0;

  const q = query.trim().toLowerCase();
  const filtered = q ? cls.funds.filter((f) => f.name.toLowerCase().includes(q)) : cls.funds;
  const { sorted, sort, toggle } = useSort(filtered, {
    name: (f) => f.name.toLowerCase(),
    first: (f) => f.firstInvest,
    pledged: (f) => f.committed,
    invested: (f) => f.drawn,
    still: (f) => Math.max(0, f.committed - f.drawn),
    cashret: (f) => f.distributed,
    current: (f) => f.currentValue,
    cashback: (f) => f.dpi,
    worth: (f) => netOf(f),
  }, { col: "current", dir: "desc" });

  const noun = cls.key === "unlisted" ? "companies" : "funds";

  return (
    <>
      <div className={`grid gap-4 sm:grid-cols-2 ${hasCommitments ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <StatTile label="Current value"
          value={<Auditable to={auditHref({ file: "private", sheet: cls.sheet })} title="Current value — trace to the private-markets workbook">{money(cls.current)}</Auditable>}
          sub={`${cls.count} ${noun}`} icon={<Gem className="h-4 w-4" />} />
        <StatTile label="Total return ×"
          value={<span className={multipleTone(cls.netMultiple)}><Auditable formula={netReturnFormula(cls.label, { ...cls, multiple: cls.netMultiple }, money, auditHref({ file: "private", sheet: cls.sheet }))}>
            {`${cls.netMultiple.toFixed(2)}×`}
          </Auditable></span>}
          sub={<>on <Auditable to={auditHref({ file: "private", sheet: cls.sheet })} title="Invested — trace to the private-markets workbook">{money(cls.invested)}</Auditable> invested{cls.distributed > 0 && <> · {cls.multiple.toFixed(2)}× on marks alone</>}</>}
          icon={<Layers className="h-4 w-4" />} />
        <StatTile label="Cash returned"
          value={<Auditable to={auditHref({ file: "private", sheet: cls.sheet })} title="Cash returned — trace to the private-markets workbook">{money(cls.distributed)}</Auditable>}
          sub={<Auditable formula={{
            title: "Cash back × (DPI)", excel: "= Cash returned ÷ Invested",
            plain: "Cash actually paid back per ₹1 invested in this class (DPI).",
            worked: `= ${money(cls.distributed)} ÷ ${money(cls.invested)} = ${dpi.toFixed(2)}×`,
            auditHref: auditHref({ file: "private", sheet: cls.sheet }),
          }}>{`DPI ${dpi.toFixed(2)}×`}</Auditable>}
          icon={<Coins className="h-4 w-4" />} />
        {hasCommitments && (
          <StatTile label="Still to invest" value={<span className="text-amber-400">{money(cls.unfunded)}</span>}
            sub="committed but not yet called" icon={<Fuel className="h-4 w-4" />} />
        )}
      </div>

      <Card className="mt-5" title={cls.label}
        subtitle={hasCommitments
          ? "What you pledged, what's actually been called, and what it's worth now"
          : "What went in, what's come back, and what it's worth now"}
        pad={false}
        right={cls.funds.length > 8
          ? <SearchInput value={query} onChange={setQuery} placeholder={`Filter ${noun}…`} className="w-52" suggestions={cls.funds.map((f) => f.name)} />
          : undefined}>
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
              <tr>
                <SortHeader label="Name" col="name" align="left" sort={sort} onSort={toggle} />
                <SortHeader label="First invest" col="first" sort={sort} onSort={toggle} />
                {hasCommitments && <SortHeader label="Pledged" col="pledged" sort={sort} onSort={toggle} title="What you committed to invest" />}
                <SortHeader label="Invested" col="invested" sort={sort} onSort={toggle} title="Capital actually called from you so far ('drawn')" />
                {hasCommitments && <SortHeader label="Still to invest" col="still" sort={sort} onSort={toggle} title="Committed but not yet called ('dry powder')" />}
                <SortHeader label="Cash returned" col="cashret" sort={sort} onSort={toggle} title="Cash paid back to you so far ('distributions')" />
                <SortHeader label="Current value" col="current" sort={sort} onSort={toggle} />
                <SortHeader label="Cash back ×" col="cashback" sort={sort} onSort={toggle} title="Cash actually returned per ₹1 invested (DPI)." />
                <SortHeader label="Total return ×" col="worth" sort={sort} onSort={toggle} title={NET_TITLE} />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {sorted.map((f, i) => {
                const href = privateHref(f.sheet, f.name);
                const unfunded = Math.max(0, f.committed - f.drawn);
                const net = netOf(f);
                return (
                  <tr key={`${f.name}-${i}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 text-slate-100">{f.name}</td>
                    <td className="px-4 py-2.5 text-right text-[12px] text-slate-500">{f.firstInvest ? fmtDate(f.firstInvest) : "—"}</td>
                    {hasCommitments && (
                      <td className="px-4 py-2.5 text-right mono text-slate-300">
                        <Auditable to={href} title="Pledged — trace to the private-markets workbook">{fmtFromBase(f.committed, { compact: true })}</Auditable>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      <Auditable to={href} title="Invested — trace to the private-markets workbook">{fmtFromBase(f.drawn, { compact: true })}</Auditable>
                    </td>
                    {hasCommitments && (
                      <td className={`px-4 py-2.5 text-right mono ${unfunded > 0 ? "text-amber-400" : "text-slate-500"}`}>
                        <Auditable to={href} title="Still to invest — trace to the private-markets workbook">{fmtFromBase(unfunded, { compact: true })}</Auditable>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      <Auditable to={href} title="Cash returned — trace to the private-markets workbook">{fmtFromBase(f.distributed, { compact: true })}</Auditable>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">
                      <Auditable to={href} title="Current value — trace to the private-markets workbook">{fmtFromBase(f.currentValue, { compact: true })}</Auditable>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {f.dpi != null ? (
                        <Auditable formula={{
                          title: "Cash back × (DPI)", excel: "= Cash returned ÷ Invested",
                          plain: "Cash actually returned per ₹1 invested (DPI).",
                          worked: `= ${money(f.distributed)} ÷ ${money(f.drawn)} = ${f.dpi.toFixed(2)}×`,
                          auditHref: href,
                        }}>{`${f.dpi.toFixed(2)}×`}</Auditable>
                      ) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right mono ${multipleTone(net)}`}>
                      {net != null ? (
                        <Auditable formula={netReturnFormula(f.name, {
                          invested: f.drawn, current: f.currentValue, distributed: f.distributed, multiple: net,
                        }, money, href)}>{`${net.toFixed(2)}×`}</Auditable>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">No {noun} match “{query}”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
