import { useState } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { SortHeader } from "@/components/SortHeader";
import { changeColor, fmtDate } from "@/lib/format";
import { useSort } from "@/lib/useSort";
import { Auditable } from "@/components/Auditable";
import { netReturnFormula, privateHref } from "@/lib/auditFormulas";
import { BUCKET_META, BUCKET_ORDER, multipleTone, type BucketKey } from "@/lib/privateValue";
import type { SegmentProps } from "./segment";

function StatusTag({ bucket }: { bucket: BucketKey }) {
  return <Pill tone={BUCKET_META[bucket].tone}>{BUCKET_META[bucket].label}</Pill>;
}

// Startups — every name in the direct book with what it cost, what it's marked
// at and what that's created.
//
// This was two tabs. "Startups" and "Value Creation" listed the same 53 names
// with the same invested / fair value / ownership / MOIC — one table carried the
// first-invest date, the other the value created and bucket. They're one table
// now, carrying all of it. The book-level totals live in the strip above, so the
// tab is the table and nothing else.
export function Startups({ model: m, money }: SegmentProps) {
  const [query, setQuery] = useState("");
  const [bucketFilter, setBucketFilter] = useState<BucketKey | "all">("all");

  const filtered = m.startups.filter(
    (s) => (bucketFilter === "all" || s.bucket === bucketFilter) && s.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const { sorted, sort, toggle } = useSort(filtered, {
    name: (s) => s.name.toLowerCase(),
    first: (s) => s.investDate,
    invested: (s) => s.invested,
    fair: (s) => s.fairValue,
    own: (s) => s.ownershipPct,
    moic: (s) => s.moicEff,
    value: (s) => s.markup,
  }, { col: "value", dir: "desc" });

  return (
    <>
      <Card title="Direct startups"
        subtitle="Every name with what it cost, what it's marked at and what that's created · sort any column, filter by bucket or name"
        right={<SearchInput value={query} onChange={setQuery} placeholder="Filter startups…" className="w-52" suggestions={m.startups.map((s) => s.name)} />}>
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setBucketFilter("all")}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${bucketFilter === "all" ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-600 text-slate-400 hover:bg-ink-700/40"}`}>
            All {m.startups.length}
          </button>
          {BUCKET_ORDER.map((k) => {
            const b = m.buckets.find((x) => x.key === k)!;
            const active = bucketFilter === k;
            return (
              <button key={k} onClick={() => setBucketFilter(active ? "all" : k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? "text-slate-100" : "border-ink-600 text-slate-400 hover:bg-ink-700/40"}`}
                style={active ? { borderColor: `${BUCKET_META[k].color}66`, background: `${BUCKET_META[k].color}1a` } : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: BUCKET_META[k].color }} />
                {BUCKET_META[k].label} {b.count}
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                <SortHeader label="Startup" col="name" sort={sort} onSort={toggle} align="left" pad="px-2.5 py-2" />
                <SortHeader label="First invest" col="first" sort={sort} onSort={toggle} pad="px-2.5 py-2" />
                <SortHeader label="Invested" col="invested" sort={sort} onSort={toggle} pad="px-2.5 py-2" />
                <SortHeader label="Current value" col="fair" sort={sort} onSort={toggle} pad="px-2.5 py-2" />
                <SortHeader label="Own %" col="own" sort={sort} onSort={toggle} pad="px-2.5 py-2" />
                <SortHeader label="Total return ×" col="moic" sort={sort} onSort={toggle} pad="px-2.5 py-2" title="Everything ₹1 invested has produced. The startup book distributes no cash, so the mark is the whole return and this is simply MOIC." />
                <SortHeader label="Value created" col="value" sort={sort} onSort={toggle} pad="px-2.5 py-2" title="Current value less what was invested — the unrealised markup." />
                <th className="label-xs px-2.5 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sorted.map((s) => (
                <tr key={s.name} className="hover:bg-ink-700/40">
                  <td className="px-2.5 py-2.5 font-medium text-slate-100">{s.name}</td>
                  <td className="px-2.5 py-2.5 text-right text-[12px] text-slate-500">{s.investDate ? fmtDate(s.investDate) : "—"}</td>
                  <td className="px-2.5 py-2.5 text-right mono text-slate-400">
                    <Auditable to={privateHref("startup", s.name)} title="Invested — trace to the private-markets workbook">{money(s.invested)}</Auditable>
                  </td>
                  <td className="px-2.5 py-2.5 text-right mono text-slate-200">
                    <Auditable to={privateHref("startup", s.name)} title="Current value — trace to the private-markets workbook">{money(s.fairValue)}</Auditable>
                  </td>
                  <td className="px-2.5 py-2.5 text-right mono text-slate-400">
                    {s.ownershipPct ? <Auditable to={privateHref("startup", s.name)} title="Ownership — trace to the private-markets workbook">{`${s.ownershipPct.toFixed(2)}%`}</Auditable> : "—"}
                  </td>
                  <td className={`px-2.5 py-2.5 text-right mono ${multipleTone(s.moicEff)}`}>
                    <Auditable formula={netReturnFormula(s.name, {
                      invested: s.invested, current: s.fairValue, distributed: 0, multiple: s.moicEff,
                    }, money, privateHref("startup", s.name))}>{`${s.moicEff.toFixed(2)}×`}</Auditable>
                  </td>
                  <td className={`px-2.5 py-2.5 text-right mono font-semibold ${changeColor(s.markup)}`}>
                    <Auditable formula={{
                      title: "Value created", excel: "= Current value − Invested",
                      plain: "Unrealised markup on this name — the mark over what was put in.",
                      worked: `= ${money(s.fairValue)} − ${money(s.invested)} = ${money(s.markup, true)}`,
                      auditHref: privateHref("startup", s.name),
                    }}>{money(s.markup, true)}</Auditable>
                  </td>
                  <td className="px-2.5 py-2.5 text-right"><StatusTag bucket={s.bucket} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No startups match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* The classification card that used to define these was cut as a second
            telling of the table's own Status column — but the filter chips and
            that column still speak in bucket names, so the thresholds stay. */}
        <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
          Status is derived from each startup's current mark — <span className="font-medium text-slate-400">Value Driver</span> ≥ 2.0×, <span className="font-medium text-slate-400">On Track</span> 1.05–2.0×, <span className="font-medium text-slate-400">At Cost</span> ≈ 1.0×, <span className="font-medium text-slate-400">Watch</span> &lt; 0.95×. A starting heuristic, analyst-editable once the data-bank backend lands.
        </p>
      </Card>
    </>
  );
}
