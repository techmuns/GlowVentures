import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight, Layers, ArrowLeftRight, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { fmtPct, changeColor, fmtNum, fmtDate } from "@/lib/format";
import { sum } from "@/lib/analytics";
import { accountIndex, ownerOf, type AccountIndex } from "@/lib/accounts";
import { loadTransactions, loadSales, type Txn } from "@/lib/ledger";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
import { ledgerHref, auditHref, LEDGER, pnlFormula, returnFormula, weightFormula } from "@/lib/auditFormulas";
import type { Position } from "@/lib/types";

type EntityPart = {
  entity: string; quantity: number; avgCost: number; currentPrice: number;
  costBasis: number; marketValue: number; unrealizedPnL: number; returnPct: number; costNA: boolean;
};
type Row = {
  key: string; security: string; securityKey: string; sector: string; assetClass: string;
  entities: string[]; parts: EntityPart[]; quantity: number; avgCost: number; currentPrice: number;
  costBasis: number; marketValue: number; unrealizedPnL: number; returnPct: number; weight: number;
  costNA: boolean;
  // Live-quote fields. `live: false` means CMP is still the workbook mark — the
  // row says so rather than letting a month-old price read as current.
  live: boolean; dayChange: number; dayChangePct: number | null;
};
type SortKey = "security" | "marketValue" | "returnPct" | "unrealizedPnL" | "weight" | "dayChange";

// Weight, P&L and return all move with the live price, so they no longer match
// any cell in the workbook — an audit link would point at a different number.
// Live cells therefore render plain, and only rows still on their workbook mark
// keep the trace. The inputs that don't move (quantity, cost) keep theirs either way.
const LIVE_CELL = "Recalculated from the live price. Quantity and cost come from the ledger; this figure is worked out from them, so it has no workbook cell to trace to.";

export function PortfolioMonitor() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [view, setView] = useState<"holdings" | "transactions">("holdings");
  const [consolidate, setConsolidate] = useState(true);
  // These three filters are global — they drive both the Holdings table and the
  // Transactions tape at once. `selected` is a set of security names (empty = all).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sector, setSector] = useState("All");
  const [entity, setEntity] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  // Realised P&L per security (by securityKey) from the dated ledger sales —
  // undefined = loading, null = unavailable.
  const [realized, setRealized] = useState<Map<string, number> | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadSales().then((s) => { if (alive) setRealized(s ? new Map(s.rows.map((r) => [r.securityKey, r.realized])) : null); });
    return () => { alive = false; };
  }, []);
  if (!portfolio) return null;
  const positions = portfolio.positions;
  // Owner comes from the account registry, never from the account string.
  const accIdx = useMemo(() => accountIndex(portfolio.accounts), [portfolio.accounts]);
  const owner = (p: Position) => ownerOf(accIdx, p);
  const sectors = useMemo(() => ["All", ...Array.from(new Set(positions.map((p) => p.sector))).sort()], [positions]);
  const entities = useMemo(() => ["All", ...Array.from(new Set(positions.map((p) => ownerOf(accIdx, p)))).sort()], [positions, accIdx]);
  // Company pick-list, biggest holding first (matches the table's default sort).
  const securityNames = useMemo(() => {
    const mv = new Map<string, number>();
    for (const p of positions) mv.set(p.security, (mv.get(p.security) ?? 0) + p.marketValue);
    return [...mv.keys()].sort((a, b) => (mv.get(b) ?? 0) - (mv.get(a) ?? 0));
  }, [positions]);
  // Lets the sector filter reach the Transactions tape, which carries no sector of its own.
  const sectorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions) m.set(p.securityKey, p.sector);
    return m;
  }, [positions]);
  const rows = useMemo(() => {
    let base = positions;
    if (entity !== "All") base = base.filter((p) => ownerOf(accIdx, p) === entity);
    if (sector !== "All") base = base.filter((p) => p.sector === sector);
    const totalMV = sum(base.map((p) => p.marketValue));
    let out: Row[];
    if (consolidate) {
      // Consolidated on securityKey: the same company held through two platforms
      // is one row, and ISIN could not do this grouping — most rows have none.
      const m = new Map<string, Position[]>();
      for (const p of base) (m.get(p.securityKey) ?? m.set(p.securityKey, []).get(p.securityKey)!).push(p);
      out = [...m.values()].map((ps) => {
        const mv = sum(ps.map((x) => x.marketValue));
        const cost = sum(ps.map((x) => x.costBasis));
        const qty = sum(ps.map((x) => x.quantity));
        const costNA = cost === 0 && mv > 0;
        const pnl = costNA ? 0 : mv - cost;
        return {
          key: ps[0].securityKey, security: ps[0].security, securityKey: ps[0].securityKey, sector: ps[0].sector, assetClass: ps[0].assetClass,
          entities: Array.from(new Set(ps.map((x) => ownerOf(accIdx, x)))), parts: entityParts(ps, accIdx), quantity: qty,
          avgCost: qty > 0 ? cost / qty : 0, currentPrice: ps[0].currentPrice,
          costBasis: cost, marketValue: mv, unrealizedPnL: pnl,
          returnPct: costNA ? 0 : cost > 0 ? (pnl / cost) * 100 : 0, weight: totalMV > 0 ? mv / totalMV : 0,
          costNA,
          // A security is live only if every lot of it is — they share one quote,
          // so in practice this is all-or-nothing.
          live: ps.every((x) => x.live),
          dayChange: sum(ps.map((x) => x.dayChange ?? 0)),
          dayChangePct: ps[0].dayChangePct ?? null,
        };
      });
    } else {
      out = base.map((p) => ({
        key: p.securityKey + "@" + p.accountId, security: p.security, securityKey: p.securityKey, sector: p.sector, assetClass: p.assetClass,
        entities: [ownerOf(accIdx, p)], parts: [], quantity: p.quantity, avgCost: p.avgCost, currentPrice: p.currentPrice,
        costBasis: p.costBasis, marketValue: p.marketValue, unrealizedPnL: p.unrealizedPnL,
        returnPct: p.returnPct, weight: totalMV > 0 ? p.marketValue / totalMV : 0,
        costNA: !!p.costUnavailable,
        live: !!p.live, dayChange: p.dayChange ?? 0, dayChangePct: p.dayChangePct ?? null,
      }));
    }
    if (selected.size > 0) out = out.filter((r) => selected.has(r.security));
    out.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return asc ? cmp : -cmp;
    });
    return out;
  }, [positions, accIdx, consolidate, selected, sector, entity, sortKey, asc]);
  const totMV = sum(rows.map((r) => r.marketValue));
  const totPnL = sum(rows.map((r) => r.unrealizedPnL));
  const totCost = sum(rows.map((r) => r.costBasis));
  // Day move across the live-priced rows only — a holding on a workbook mark has
  // no "today" to report, so folding it in at zero would understate the move.
  const feedLive = rows.some((r) => r.live);
  const liveRows = rows.filter((r) => r.live && r.dayChangePct != null);
  const totDay = sum(liveRows.map((r) => r.dayChange));
  const liveMV = sum(liveRows.map((r) => r.marketValue));
  const totDayPct = liveRows.length && liveMV - totDay !== 0 ? (totDay / (liveMV - totDay)) * 100 : null;
  const sortBtn = (k: SortKey) => () => { if (sortKey === k) setAsc(!asc); else { setSortKey(k); setAsc(false); } };
  const toggleRow = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const setMode = (next: boolean) => { setConsolidate(next); setExpanded(new Set()); };
  const money = (n: number, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  // Export the whole tab (all holdings + the full transaction tape, unfiltered) to a
  // styled workbook. exceljs is code-split so it only loads on demand.
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [{ exportPortfolioExcel }, data] = await Promise.all([
        import("@/lib/exportPortfolioExcel"),
        loadTransactions(),
      ]);
      await exportPortfolioExcel(positions, portfolio.accounts, data?.txns ?? []);
    } catch (e) {
      console.error("Excel export failed", e);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Daily" title="Portfolio Monitor"
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Quantity and cost come from the statements; value, weight and return are rebuilt from live prices where a quote exists." />
          {view === "holdings" && <Pill tone="info">{rows.length} rows</Pill>}
        </div>} />

      {/* Global filters — one selection drives both Holdings and Transactions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MultiSelectFilter options={securityNames} selected={selected} onChange={setSelected}
          allLabel="All companies" unit="companies" placeholder="Search companies…" className="w-72 max-w-full" />
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-focus">
          {sectors.map((s) => <option key={s} value={s}>{s === "All" ? "All sectors" : s}</option>)}
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-focus">
          {entities.map((s) => <option key={s} value={s}>{s === "All" ? "All entities" : s}</option>)}
        </select>
        <button onClick={handleExport} disabled={exporting}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-3 py-2 text-sm font-medium text-champagne-400 transition-colors hover:bg-champagne-500/20 disabled:opacity-60"
          title="Download the full Portfolio Monitor — holdings and the transaction tape — as a styled Excel workbook">
          <FileSpreadsheet className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
        </button>
      </div>

      {/* View toggle (+ Holdings' by-security / by-entity switch) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {(["holdings", "transactions"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setView(m)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === m ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              {m === "holdings" ? <Layers className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
              {m === "holdings" ? "Holdings" : "Transactions"}
            </button>
          ))}
        </div>
        {view === "holdings" && (
          <button onClick={() => setMode(!consolidate)}
            className={`ml-auto rounded-md border px-3 py-2 text-sm transition-colors ${consolidate ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800 text-slate-300 hover:bg-ink-700/60"}`}>
            {consolidate ? "By security" : "By entity"}
          </button>
        )}
      </div>

      {view === "holdings" ? (
        <Card pad={false} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-ink-800">
                <tr className="border-b border-ink-700">
                  <Th onClick={sortBtn("security")}>Security</Th>
                  <th className="label-xs px-2 py-2.5 text-left font-medium">Sector</th>
                  <th className="label-xs px-2 py-2.5 text-left font-medium">{consolidate ? "Entities" : "Entity"}</th>
                  <th className="label-xs px-2 py-2.5 text-right font-medium">Qty</th>
                  <th className="label-xs px-2 py-2.5 text-right font-medium whitespace-nowrap">Avg cost</th>
                  <th className="label-xs px-2 py-2.5 text-right font-medium">Invested</th>
                  <th className="label-xs px-2 py-2.5 text-right font-medium">CMP</th>
                  <Th right onClick={sortBtn("dayChange")}>Day</Th>
                  <Th right onClick={sortBtn("marketValue")}>Market value</Th>
                  <Th right onClick={sortBtn("weight")}>Weight</Th>
                  <Th right onClick={sortBtn("unrealizedPnL")}>Unreal. P&L</Th>
                  <th className="label-xs px-2 py-2.5 text-right font-medium whitespace-nowrap">Realised P&L</th>
                  <Th right onClick={sortBtn("returnPct")}>Return</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {rows.map((r) => {
                  const isOpen = expanded.has(r.key);
                  const multi = r.entities.length > 1;
                  return (
                    <Fragment key={r.key}>
                      <tr className="hover:bg-ink-700/40">
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-100"><StockLink securityKey={r.securityKey} name={r.security} /></span>
                            {r.costNA && <Pill tone="warn">cost n/a</Pill>}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-slate-400">{r.sector}</td>
                        <td className="px-2 py-2.5 text-slate-400">
                          {multi ? (
                            <button type="button" onClick={() => toggleRow(r.key)} aria-expanded={isOpen}
                              title={`Held by: ${r.entities.join(", ")}`}
                              className="pill cursor-pointer whitespace-nowrap transition-colors hover:border-champagne-500/40 hover:text-champagne-400 ring-focus">
                              <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              {r.entities.length}&nbsp;entities
                            </button>
                          ) : (
                            <span className="text-[12px]">{r.entities[0]}</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right mono text-slate-300 whitespace-nowrap"><Auditable to={ledgerHref(r.security)} title="Shares held — trace to the ledger">{fmtNum(r.quantity)}</Auditable></td>
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">{r.costNA ? "—" : <Auditable to={ledgerHref(r.security)} title="Average cost — trace to the ledger">{fmtFromBase(r.avgCost)}</Auditable>}</td>
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">{r.costNA ? "—" : <Auditable to={ledgerHref(r.security)} title="Invested (cost) — trace to the ledger">{fmtFromBase(r.costBasis, { compact: true })}</Auditable>}</td>
                        {/* A live price comes from the quote feed, not the workbook, so it
                            carries no audit link back to the ledger. Only a workbook mark
                            does — and it's flagged so it can't pass as current. */}
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">
                          {r.live
                            ? fmtFromBase(r.currentPrice)
                            : <><Auditable to={ledgerHref(r.security)} title="Market price — trace to the ledger">{fmtFromBase(r.currentPrice)}</Auditable>
                                <span className="ml-1 cursor-help text-[10px] text-amber-400/80"
                                  title={`No live price for this security — showing the mark from its statement as of ${portfolio.asOf}.`}>\u25e6</span></>}
                        </td>
                        <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${r.live && r.dayChangePct != null ? changeColor(r.dayChangePct) : "text-slate-600"}`}
                          title={r.live && r.dayChangePct != null ? `${fmtFromBase(r.dayChange, { compact: true, sign: true })} on the position since previous close` : undefined}>
                          {r.live && r.dayChangePct != null ? `${r.dayChangePct >= 0 ? "+" : ""}${r.dayChangePct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right mono text-slate-100 whitespace-nowrap">
                          {r.live ? fmtFromBase(r.marketValue, { compact: true })
                                  : <Auditable to={ledgerHref(r.security)} title="Market value — trace to the ledger">{fmtFromBase(r.marketValue, { compact: true })}</Auditable>}
                        </td>
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap" title={r.live ? LIVE_CELL : undefined}>
                          {r.live ? `${(r.weight * 100).toFixed(1)}%`
                                  : <Auditable formula={weightFormula(r.marketValue, totMV, r.weight * 100, money)}>{(r.weight * 100).toFixed(1)}%</Auditable>}
                        </td>
                        <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${r.costNA ? "text-slate-500" : changeColor(r.unrealizedPnL)}`} title={r.live && !r.costNA ? LIVE_CELL : undefined}>
                          {r.costNA ? "—"
                            : r.live ? fmtFromBase(r.unrealizedPnL, { compact: true, sign: true })
                            : <Auditable formula={pnlFormula(r.marketValue, r.costBasis, r.unrealizedPnL, money, ledgerHref(r.security))}>{fmtFromBase(r.unrealizedPnL, { compact: true, sign: true })}</Auditable>}
                        </td>
                        <td className="px-2 py-2.5 text-right mono whitespace-nowrap">{!consolidate ? <span className="text-slate-600">—</span> : realized === undefined ? <span className="text-slate-500">…</span> : realized === null ? <span className="text-slate-600">—</span> : (realized.get(r.securityKey) ?? 0) === 0 ? <span className="text-slate-600">—</span> : <span className={changeColor(realized.get(r.securityKey) ?? 0)}><Auditable to={ledgerHref(r.security)} title="Realised P&L — trace to the ledger">{fmtFromBase(realized.get(r.securityKey) ?? 0, { compact: true, sign: true })}</Auditable></span>}</td>
                        <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${r.costNA ? "text-slate-500" : changeColor(r.returnPct)}`} title={r.live && !r.costNA ? LIVE_CELL : undefined}>
                          {r.costNA ? "—"
                            : r.live ? fmtPct(r.returnPct, { sign: true })
                            : <Auditable formula={returnFormula(r.marketValue, r.costBasis, r.returnPct, money, ledgerHref(r.security))}>{fmtPct(r.returnPct, { sign: true })}</Auditable>}
                        </td>
                      </tr>
                      {multi && isOpen && (
                        <tr className="bg-ink-900/60">
                          <td colSpan={13} className="px-3 pb-3 pt-1">
                            <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
                              <table className="min-w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-ink-700/70">
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Owning entity</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Qty</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Avg cost</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Market value</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">% of holding</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Unreal. P&L</th>
                                    <th className="label-xs px-3 py-1.5 text-right font-medium">Return</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {r.parts.map((pt) => (
                                    <tr key={pt.entity}>
                                      <td className="px-3 py-1.5"><span className="text-slate-200">{pt.entity}</span></td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(pt.quantity)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{pt.costNA ? "—" : fmtFromBase(pt.avgCost)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-100">{fmtFromBase(pt.marketValue, { compact: true })}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400">{r.marketValue > 0 ? ((pt.marketValue / r.marketValue) * 100).toFixed(1) : "0.0"}%</td>
                                      <td className={`px-3 py-1.5 text-right mono ${pt.costNA ? "text-slate-500" : changeColor(pt.unrealizedPnL)}`}>{pt.costNA ? "—" : fmtFromBase(pt.unrealizedPnL, { compact: true, sign: true })}</td>
                                      <td className={`px-3 py-1.5 text-right mono ${pt.costNA ? "text-slate-500" : changeColor(pt.returnPct)}`}>{pt.costNA ? "—" : fmtPct(pt.returnPct, { sign: true })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={13} className="py-12 text-center text-sm text-slate-500">No positions match your filters.</td></tr>}
              </tbody>
              <tfoot className="sticky bottom-0 bg-ink-800">
                <tr className="border-t border-ink-700 font-semibold">
                  <td className="px-2 py-2.5 text-slate-200" colSpan={5}>Total · {rows.length} rows</td>
                  <td className="px-2 py-2.5 text-right mono text-slate-300 whitespace-nowrap"><Auditable formula={{ title: "Total invested (cost)", excel: "= Σ Cost of all holdings", plain: "What every listed holding cost, added together.", worked: `= ${money(totCost)} across ${rows.length} rows`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totCost, { compact: true })}</Auditable></td>
                  <td className="px-2 py-2.5"></td>
                  <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${totDayPct == null ? "text-slate-600" : changeColor(totDayPct)}`}
                    title={totDayPct == null ? undefined : `${money(totDay, true)} across the live-priced book since previous close`}>
                    {totDayPct == null ? "—" : `${totDayPct >= 0 ? "+" : ""}${totDayPct.toFixed(2)}%`}
                  </td>
                  <td className="px-2 py-2.5 text-right mono text-slate-100 whitespace-nowrap" title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtFromBase(totMV, { compact: true })
                              : <Auditable formula={{ title: "Total market value", excel: "= Σ Market value of all holdings", plain: "The market value of every listed holding, added together.", worked: `= ${money(totMV)} across ${rows.length} rows`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totMV, { compact: true })}</Auditable>}
                  </td>
                  <td className="px-2 py-2.5"></td>
                  <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtFromBase(totPnL, { compact: true, sign: true })
                              : <Auditable formula={{ title: "Total unrealised P&L", excel: "= Σ (Market value − Cost)", plain: "Every holding's on-paper gain or loss, added up.", worked: `= ${money(totPnL, true)}`, auditHref: auditHref(LEDGER) }}>{fmtFromBase(totPnL, { compact: true, sign: true })}</Auditable>}
                  </td>
                  <td className="px-2 py-2.5 text-right mono whitespace-nowrap">{consolidate && realized ? (() => { const tr = sum(rows.map((r) => realized.get(r.securityKey) ?? 0)); return <span className={changeColor(tr)}>{fmtFromBase(tr, { compact: true, sign: true })}</span>; })() : <span className="text-slate-600">—</span>}</td>
                  <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtPct(totCost > 0 ? (totPnL / totCost) * 100 : 0, { sign: true })
                              : <Auditable formula={{ title: "Total return", excel: "= Total P&L ÷ Total cost × 100", plain: "The whole listed book's gain or loss versus what it cost.", worked: `= ${money(totPnL)} ÷ ${money(totCost)} × 100 = ${fmtPct(totCost > 0 ? (totPnL / totCost) * 100 : 0, { sign: true })}` }}>{fmtPct(totCost > 0 ? (totPnL / totCost) * 100 : 0, { sign: true })}</Auditable>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : (
        <TransactionsView selected={selected} sector={sector} entity={entity} sectorByKey={sectorByKey} />
      )}
    </div>
  );
}

// Roll the constituent positions of one consolidated security up to one row per
// owning entity, so an expanded row shows exactly who holds it and how much.
function entityParts(ps: Position[], accIdx: AccountIndex): EntityPart[] {
  const m = new Map<string, { entity: string; quantity: number; costBasis: number; marketValue: number; currentPrice: number; costUnavailable: boolean }>();
  for (const x of ps) {
    const who = ownerOf(accIdx, x);
    const e = m.get(who) ?? { entity: who, quantity: 0, costBasis: 0, marketValue: 0, currentPrice: x.currentPrice, costUnavailable: false };
    e.quantity += x.quantity; e.costBasis += x.costBasis; e.marketValue += x.marketValue;
    if (x.costUnavailable) e.costUnavailable = true;
    m.set(who, e);
  }
  return [...m.values()].map((e) => {
    // Cost is "not meaningful" when the source flags it unavailable (even with a
    // placeholder cost) or when no cost basis is present — mirrors the By-entity view.
    const costNA = e.costUnavailable || (e.costBasis === 0 && e.marketValue > 0);
    const pnl = costNA ? 0 : e.marketValue - e.costBasis;
    return {
      entity: e.entity, quantity: e.quantity, currentPrice: e.currentPrice,
      avgCost: e.quantity > 0 ? e.costBasis / e.quantity : 0, costBasis: e.costBasis,
      marketValue: e.marketValue, unrealizedPnL: pnl,
      returnPct: costNA ? 0 : e.costBasis > 0 ? (pnl / e.costBasis) * 100 : 0, costNA,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
}

function Th({ children, right, onClick }: { children: React.ReactNode; right?: boolean; onClick?: () => void }) {
  return (
    <th className={`label-xs px-2 py-2.5 font-medium ${right ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-champagne-400 ${right ? "flex-row-reverse" : ""}`}>
        {children}<ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  );
}

// Indian fiscal year (Apr 1 – Mar 31) helpers for the transaction date presets.
function fyStartOf(iso: string): number {
  const d = new Date(iso);
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
const fyLabel = (y: number) => `FY${String(y).slice(2)}-${String(y + 1).slice(2)}`;
function quarterBounds(y: number, q: number): { from: string; to: string } {
  if (q === 1) return { from: `${y}-04-01`, to: `${y}-06-30` };
  if (q === 2) return { from: `${y}-07-01`, to: `${y}-09-30` };
  if (q === 3) return { from: `${y}-10-01`, to: `${y}-12-31` };
  return { from: `${y + 1}-01-01`, to: `${y + 1}-03-31` };
}

// The full dated buy/sell tape from the ledger (lazy-loaded when the Transactions
// toggle is first opened). Holdings elsewhere are the NET result of these trades.
// The company / sector / entity filters are global (owned by PortfolioMonitor); this
// view adds its own Buy/Sell side toggle and a date / quarter / fiscal-year range.
const TXN_CAP = 500; // rows rendered at once; filters narrow beyond this
function TransactionsView({ selected, sector, entity, sectorByKey }: {
  selected: Set<string>; sector: string; entity: string; sectorByKey: Map<string, string>;
}) {
  const { fmtFromBase } = usePortfolio();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [meta, setMeta] = useState({ buys: 0, sells: 0 });
  const [side, setSide] = useState<"all" | "Buy" | "Sell">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("all");

  useEffect(() => {
    let alive = true;
    loadTransactions().then((d) => {
      if (!alive) return;
      if (!d) { setStatus("error"); return; }
      setTxns(d.txns); setMeta({ buys: d.buys, sells: d.sells }); setStatus("ready");
    });
    return () => { alive = false; };
  }, []);

  // Fiscal years spanned by the tape, newest first — drives the quarter/FY presets.
  const fyYears = useMemo(() => {
    if (!txns || !txns.length) return [] as number[];
    let mn = Infinity, mx = -Infinity;
    for (const t of txns) { if (!t.date) continue; const y = fyStartOf(t.date); if (y < mn) mn = y; if (y > mx) mx = y; }
    if (!isFinite(mn)) return [];
    const out: number[] = [];
    for (let y = mx; y >= mn; y--) out.push(y);
    return out;
  }, [txns]);
  const applyPreset = (key: string) => {
    setPreset(key);
    if (key === "all") { setFrom(""); setTo(""); return; }
    const fy = key.match(/^fy:(\d+)$/);
    if (fy) { const y = +fy[1]; setFrom(`${y}-04-01`); setTo(`${y + 1}-03-31`); return; }
    const q = key.match(/^q:(\d+):(\d)$/);
    if (q) { const b = quarterBounds(+q[1], +q[2]); setFrom(b.from); setTo(b.to); }
  };
  const onDate = (which: "from" | "to", v: string) => {
    if (which === "from") setFrom(v); else setTo(v);
    setPreset("custom");
  };

  const filtered = useMemo(() => {
    if (!txns) return [];
    return txns.filter((t) =>
      (side === "all" || t.side === side) &&
      (entity === "All" || t.account === entity) &&
      (sector === "All" || sectorByKey.get(t.securityKey) === sector) &&
      (selected.size === 0 || selected.has(t.security)) &&
      (!from || t.date >= from) &&
      (!to || t.date <= to));
  }, [txns, side, entity, sector, sectorByKey, selected, from, to]);
  const shown = filtered.slice(0, TXN_CAP);

  if (status === "loading") return <Card className="flex min-h-0 flex-1 items-center justify-center"><span className="text-sm text-slate-500">Loading transactions…</span></Card>;
  if (status === "error") return <Card className="flex min-h-0 flex-1 items-center justify-center"><span className="text-sm text-slate-500">Couldn't load the transaction ledger. Reload and sign in again if this persists.</span></Card>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} max={to || undefined} onChange={(e) => onDate("from", e.target.value)} title="From date"
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-200 ring-focus" />
          <span className="text-slate-500">→</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => onDate("to", e.target.value)} title="To date"
            className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-slate-200 ring-focus" />
        </div>
        <select value={preset} onChange={(e) => applyPreset(e.target.value)} title="Jump to a quarter or fiscal year"
          className="rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-focus">
          <option value="all">All dates</option>
          <option value="custom" disabled>Custom range</option>
          {fyYears.map((y) => (
            <optgroup key={y} label={fyLabel(y)}>
              <option value={`fy:${y}`}>{fyLabel(y)} — full year</option>
              <option value={`q:${y}:1`}>Q1 {fyLabel(y)} · Apr–Jun</option>
              <option value={`q:${y}:2`}>Q2 {fyLabel(y)} · Jul–Sep</option>
              <option value={`q:${y}:3`}>Q3 {fyLabel(y)} · Oct–Dec</option>
              <option value={`q:${y}:4`}>Q4 {fyLabel(y)} · Jan–Mar</option>
            </optgroup>
          ))}
        </select>
        <div className="inline-flex rounded-md border border-ink-700 bg-ink-800 p-0.5 text-sm">
          {(["all", "Buy", "Sell"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setSide(v)}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${side === v ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {v === "all" ? "All" : v === "Buy" ? "Buys" : "Sells"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500">{filtered.filter((t) => t.side === "Buy").length.toLocaleString("en-IN")} buys · {filtered.filter((t) => t.side === "Sell").length.toLocaleString("en-IN")} sells</span>
      </div>
      <Card pad={false} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-ink-800">
              <tr className="border-b border-ink-700">
                <th className="label-xs px-3 py-2.5 text-left font-medium">Date</th>
                <th className="label-xs px-3 py-2.5 text-left font-medium">Security</th>
                <th className="label-xs px-3 py-2.5 text-left font-medium">Entity</th>
                <th className="label-xs px-3 py-2.5 text-left font-medium">Type</th>
                <th className="label-xs px-3 py-2.5 text-right font-medium">Qty</th>
                <th className="label-xs px-3 py-2.5 text-right font-medium">Price</th>
                <th className="label-xs px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="label-xs px-3 py-2.5 text-right font-medium">Realized P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {shown.map((t, i) => (
                <tr key={i} className="hover:bg-ink-700/40">
                  <td className="whitespace-nowrap px-3 py-2 mono text-slate-400">{fmtDate(t.date)}</td>
                  <td className="px-3 py-2 text-slate-100"><StockLink securityKey={t.securityKey} name={t.security} /></td>
                  <td className="px-3 py-2 text-slate-400">{t.account}</td>
                  <td className="px-3 py-2"><Pill tone={t.side === "Buy" ? "info" : "warn"}>{t.side}</Pill></td>
                  <td className="px-3 py-2 text-right mono text-slate-300"><Auditable to={ledgerHref(t.security)} title="Shares transacted — trace to the ledger">{fmtNum(Math.round(t.qty))}</Auditable></td>
                  <td className="px-3 py-2 text-right mono text-slate-400">{t.price ? <Auditable to={ledgerHref(t.security)} title="Trade price — trace to the ledger">{fmtFromBase(t.price)}</Auditable> : "—"}</td>
                  <td className="px-3 py-2 text-right mono text-slate-200">{t.amount ? <Auditable to={ledgerHref(t.security)} title="Trade value — trace to the ledger">{fmtFromBase(t.amount, { compact: true })}</Auditable> : "—"}</td>
                  <td className={`px-3 py-2 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`}>{t.realized == null ? "—" : <Auditable to={ledgerHref(t.security)} title="Realized profit on this sale — trace to the ledger">{fmtFromBase(t.realized, { compact: true, sign: true })}</Auditable>}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">No transactions match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
