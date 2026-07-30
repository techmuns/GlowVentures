import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { Auditable } from "@/components/Auditable";
import { auditHref, netReturnFormula, privateHref } from "@/lib/auditFormulas";
import { useSort } from "@/lib/useSort";
import { SortHeader } from "@/components/SortHeader";
import { multipleTone, netMultiple } from "@/lib/privateValue";
import type { SegmentProps } from "./segment";

const PRINCIPAL = "#c3a962", GAIN = "#10b981", LOSS = "#ef4444";

// Overview — what the private book is made of, how each part has compounded,
// and the names that carry it.
//
// The bars and the page's tabs are rendered from the one classification in
// lib/privateValue, so they always show the same segments, in the same order,
// in the same colours. A composition pie sat beside these bars until it was
// cut as a second drawing of the same split — its one unique reading, each
// segment's share of the book, now rides on the bar rows.
export function Overview({ model: m, money }: SegmentProps) {
  const { fmtFromBase } = usePortfolio();

  const compTotal = m.classes.reduce((s, c) => s + c.current, 0) || 1;
  const maxTotal = Math.max(...m.classes.map((c) => c.totalValue), 1);
  const instruments = m.classes.reduce((s, c) => s + c.count, 0);

  // Segment-level totals, so the table foots to its own rows. The two
  // fully-exited funds belong to no segment and are excluded here — their cash
  // is in the lifecycle figures in the strip below, and in the card at the foot.
  const segDistributed = m.classes.reduce((s, c) => s + c.distributed, 0);
  const segTotalValue = m.classes.reduce((s, c) => s + c.totalValue, 0);
  const segTotalGain = segTotalValue - m.invested;
  const segNet = m.invested > 0 ? segTotalValue / m.invested : 0;
  const gainPct = m.invested > 0 ? (segTotalGain / m.invested) * 100 : 0;

  // Every holding, tagged with the one class it belongs to. Startups distribute
  // no cash, so their net return is their mark.
  const positions = [
    ...m.classes.flatMap((c) => c.funds.map((f) => ({
      name: f.name, kind: c.label, invested: f.drawn, current: f.currentValue,
      distributed: f.distributed, href: privateHref(f.sheet, f.name),
    }))),
    ...m.startups.map((s) => ({
      name: s.name, kind: "Startups", invested: s.invested, current: s.fairValue,
      distributed: 0, href: privateHref("startup", s.name),
    })),
  ].map((p) => ({ ...p, net: netMultiple(p.invested, p.current, p.distributed) }));

  const { sorted, sort, toggle } = useSort(positions, {
    name: (p) => p.name.toLowerCase(),
    kind: (p) => p.kind,
    invested: (p) => p.invested,
    current: (p) => p.current,
    net: (p) => p.net,
  }, { col: "current", dir: "desc" });

  const closedDist = m.closed.reduce((s, f) => s + f.distributed, 0);

  return (
    <>
      <Card title="Private book by segment"
        subtitle="Principal put in, cash already back, and what each segment has made in total"
        right={<Pill tone="info">{m.classes.length} segments · {instruments} holdings</Pill>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="label-xs py-2 pr-3 text-left font-medium">Segment</th>
                {/* Deliberately narrow: the bar is a shape cue, the numbers are the answer. */}
                <th className="label-xs w-40 py-2 text-left font-medium">Invested → total value</th>
                <th className="label-xs px-3 py-2 text-right font-medium" style={{ color: PRINCIPAL }}>Principal</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Cash returned</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Current value</th>
                <th className="label-xs px-3 py-2 text-right font-medium text-gain">Total gain</th>
                <th className="label-xs px-3 py-2 text-right font-medium">Share</th>
                <th className="label-xs py-2 pl-3 text-right font-medium">Total return ×</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {m.classes.map((c) => {
                // The bar draws principal → total value (mark + cash returned),
                // so a segment in repayment reads as the gain it is.
                const basePct = (Math.min(c.invested, c.totalValue) / maxTotal) * 100;
                const upPct = c.totalGain > 0 ? (c.totalGain / maxTotal) * 100 : 0;
                const dnPct = c.totalGain < 0 ? (c.totalValue / maxTotal) * 100 : 0;
                const href = auditHref({ file: "private", sheet: c.sheet });
                return (
                  <tr key={c.key} className="hover:bg-ink-700/30">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2 text-[12.5px] font-medium text-slate-200">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                        <span className="truncate">{c.short}</span>
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex h-4 w-40 overflow-hidden rounded bg-ink-800/60">
                        {c.totalGain >= 0 ? (<>
                          <div style={{ width: `${basePct}%`, background: PRINCIPAL }} />
                          <div style={{ width: `${upPct}%`, background: GAIN }} />
                        </>) : (
                          <div style={{ width: `${dnPct}%`, background: `${LOSS}99` }} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-400">
                      <Auditable to={href} title="Principal — capital actually invested, traced to the private-markets workbook">{money(c.invested)}</Auditable>
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-slate-400">
                      <Auditable to={href} title="Cash returned — trace to the private-markets workbook">{c.distributed > 0 ? money(c.distributed) : "—"}</Auditable>
                    </td>
                    <td className="px-3 py-2.5 text-right mono font-semibold text-slate-100">
                      <Auditable to={href} title="Current value — trace to the private-markets workbook">{money(c.current)}</Auditable>
                    </td>
                    <td className={`px-3 py-2.5 text-right mono ${c.totalGain >= 0 ? "text-gain" : "text-loss"}`}>
                      <Auditable formula={{
                        title: "Total gain", excel: "= (Current value + Cash returned) − Principal",
                        plain: "Everything the capital has made — the mark on what's still held plus the cash already paid back, over what went in.",
                        worked: `= (${money(c.current)} + ${money(c.distributed)}) − ${money(c.invested)} = ${money(c.totalGain, true)}`,
                        auditHref: href,
                      }}>{money(c.totalGain, true)}</Auditable>
                    </td>
                    {/* Share is of current value — what the book holds today — so it
                        stays on marks even though the columns beside it don't. */}
                    <td className="px-3 py-2.5 text-right mono text-slate-500">{((c.current / compTotal) * 100).toFixed(0)}%</td>
                    <td className={`py-2.5 pl-3 text-right mono ${multipleTone(c.netMultiple)}`}>
                      <Auditable formula={netReturnFormula(c.label, { ...c, multiple: c.netMultiple }, money, href)}>
                        {`${c.netMultiple.toFixed(2)}×`}
                      </Auditable>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-600">
                <td className="py-2.5 pr-3 text-[12.5px] font-semibold text-slate-100">Whole book</td>
                <td />
                <td className="px-3 py-2.5 text-right mono font-semibold text-slate-200">
                  <Auditable to={auditHref({ file: "private" })} title="Capital invested — trace to the private-markets workbook">{money(m.invested)}</Auditable>
                </td>
                <td className="px-3 py-2.5 text-right mono font-semibold text-slate-300">
                  <Auditable to={auditHref({ file: "private" })} title="Cash returned — trace to the private-markets workbook">{money(segDistributed)}</Auditable>
                </td>
                <td className="px-3 py-2.5 text-right mono text-[15px] font-semibold text-slate-100">
                  <Auditable to={auditHref({ file: "private" })} title="Current value — trace to the private-markets workbook">{money(m.current)}</Auditable>
                </td>
                <td className={`px-3 py-2.5 text-right mono font-semibold ${segTotalGain >= 0 ? "text-gain" : "text-loss"}`}>
                  <Auditable formula={{
                    title: "Value created", excel: "= (Current value + Cash returned) − Capital invested",
                    plain: "Everything the private book has made on capital still deployed — marks plus cash already paid back. Fully-exited funds sit outside all three, so this foots to the segment rows above.",
                    worked: `= (${money(m.current)} + ${money(segDistributed)}) − ${money(m.invested)} = ${money(segTotalGain, true)}`,
                    auditHref: auditHref({ file: "private" }),
                  }}>{money(segTotalGain, true)}</Auditable>
                  <span className="ml-1.5 text-[11px] font-normal">{gainPct >= 0 ? "▲" : "▼"} {Math.abs(gainPct).toFixed(1)}%</span>
                </td>
                <td className="px-3 py-2.5 text-right mono text-slate-500">100%</td>
                <td className={`py-2.5 pl-3 text-right mono font-semibold ${multipleTone(segNet)}`}>
                  <Auditable formula={{
                    title: "Blended total return ×", excel: "= (Current value + Cash returned) ÷ Capital invested",
                    plain: "What every ₹1 of capital still deployed has produced. Fully-exited funds sit outside both sides of the ratio — the lifecycle TVPI below folds them back in.",
                    worked: `= (${money(m.current)} + ${money(segDistributed)}) ÷ ${money(m.invested)} = ${segNet.toFixed(2)}×`,
                    auditHref: auditHref({ file: "private" }),
                  }}>{`${segNet.toFixed(2)}×`}</Auditable>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* The three lifecycle figures. The columns above cover capital still
            deployed; these fold in the two fully-exited funds, which belong to no
            segment, plus the commitments not yet called. */}
        <div className="mt-4 grid gap-4 border-t border-ink-700 pt-3.5 sm:grid-cols-3">
          <div>
            <div className="label-xs">Cash returned</div>
            <div className="mt-1 mono text-[15px] font-semibold text-slate-100">
              <Auditable to={auditHref({ file: "private" })} title="Distributions — trace to the private-markets workbook">{money(m.distributed)}</Auditable>
              <span className="ml-2 text-[11px] font-normal text-slate-400">
                <Auditable formula={{
                  title: "Cash back × (DPI)", excel: "= Cash returned ÷ Total capital drawn",
                  plain: "Cash actually paid back per ₹1 drawn. Counts distributions from funds that have since fully exited.",
                  worked: `= ${money(m.distributed)} ÷ ${money(m.totalDrawn)} = ${m.dpi.toFixed(2)}×`,
                  auditHref: auditHref({ file: "private" }),
                }}>{`DPI ${m.dpi.toFixed(2)}×`}</Auditable>
              </span>
            </div>
            <div className="text-[11px] text-slate-500">all cash paid back — incl. fully-exited funds</div>
          </div>
          <div>
            <div className="label-xs">Dry powder</div>
            <div className="mt-1 mono text-[15px] font-semibold text-amber-400">{money(m.dryPowder)}</div>
            <div className="text-[11px] text-slate-500">committed but not yet called</div>
          </div>
          <div>
            <div className="label-xs">Incl. fully-exited funds</div>
            <div className="mt-1 mono text-[15px] font-semibold text-slate-100">
              <Auditable formula={{
                title: "TVPI — lifecycle view", excel: "= (Current value + Cash returned) ÷ Total capital drawn",
                plain: "Total worth per ₹1 ever drawn — current marks plus all cash returned, including funds that have since fully exited.",
                worked: `= (${money(m.current)} + ${money(m.distributed)}) ÷ ${money(m.totalDrawn)} = ${m.tvpi.toFixed(2)}×`,
                auditHref: auditHref({ file: "private" }),
              }}>{`${m.tvpi.toFixed(2)}×`}</Auditable>
            </div>
            <div className="text-[11px] text-slate-500">lifecycle TVPI · adds the {m.closed.length} exited funds to both sides</div>
          </div>
        </div>

        <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-400">Principal</span> is capital actually invested; <span className="font-medium text-slate-400">Total gain</span> is everything it has produced since — the mark on what's still held plus the cash already paid back — so Principal + Total gain = Cash returned + Current value. <span className="font-medium text-slate-400">Total return ×</span> is that same reckoning per ₹1 in: TVPI where a segment has distributed cash, MOIC where none has. Counting marks alone would understate anything that returns capital as it succeeds — a debt fund in repayment marks <em>down</em> as it pays you back. The bar draws principal → total value, gold and green, scaled to the largest segment. Each segment has its own tab; every holding belongs to exactly one.
        </p>
      </Card>

      <Card className="mt-5" title="Largest private positions"
        subtitle="Every holding across all segments, by current value" pad={false}>
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
              <tr>
                <SortHeader label="Name" col="name" align="left" sort={sort} onSort={toggle} />
                <SortHeader label="Segment" col="kind" align="left" sort={sort} onSort={toggle} />
                <SortHeader label="Invested" col="invested" sort={sort} onSort={toggle} title="Capital actually deployed so far" />
                <SortHeader label="Current value" col="current" sort={sort} onSort={toggle} />
                <SortHeader label="Total return ×" col="net" sort={sort} onSort={toggle} title="Everything ₹1 invested has produced — current value plus cash already returned (TVPI; MOIC where nothing has been paid back yet)." />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {sorted.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100">{p.name}</td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">{p.kind}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    <Auditable to={p.href} title="Invested — trace to the private-markets workbook">
                      {fmtFromBase(p.invested, { compact: true })}
                    </Auditable>
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">
                    <Auditable to={p.href} title="Current value — trace to the private-markets workbook">
                      {fmtFromBase(p.current, { compact: true })}
                    </Auditable>
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${multipleTone(p.net)}`}>
                    {p.net != null ? (
                      <Auditable formula={netReturnFormula(p.name, { ...p, multiple: p.net }, money, p.href)}>
                        {`${p.net.toFixed(2)}×`}
                      </Auditable>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Fully-exited funds have no residual mark, so they belong to no segment
          and appear on no tab — but their cash is inside the Cash returned tile
          above. Listed here so that figure can be traced to the last rupee. */}
      {m.closed.length > 0 && (
        <Card className="mt-5" title="Fully exited" subtitle="Closed funds — no residual value, cash already returned in full"
          right={<Pill tone="default">{m.closed.length} funds · {money(closedDist)} returned</Pill>}>
          <ul className="text-sm">
            {m.closed.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 border-t border-ink-700/60 py-2 first:border-t-0">
                <span className="text-slate-200">{f.name}</span>
                <span className="mono text-[12px] text-slate-400">
                  <Auditable to={privateHref(f.sheet, f.name)} title="Invested — trace to the private-markets workbook">{money(f.drawn)}</Auditable> invested
                  {" · "}
                  <Auditable to={privateHref(f.sheet, f.name)} title="Cash returned — trace to the private-markets workbook">{money(f.distributed)}</Auditable> returned
                  {f.drawn > 0 && <span className={`ml-2 font-semibold ${f.distributed >= f.drawn ? "text-gain" : "text-loss"}`}>{(f.distributed / f.drawn).toFixed(2)}×</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-dashed border-ink-700 pt-2.5 text-[11px] leading-relaxed text-slate-500">
            Excluded from the segments above and from <span className="font-medium text-slate-400">Capital invested</span> / <span className="font-medium text-slate-400">Current value</span> — there is nothing left to mark. Their cash <em>is</em> counted in <span className="font-medium text-slate-400">Cash returned</span> and in DPI / TVPI, which are lifecycle figures.
          </p>
        </Card>
      )}
    </>
  );
}
