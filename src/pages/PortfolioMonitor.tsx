import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight, Layers, ArrowLeftRight, FileSpreadsheet, Presentation } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { fmtPct, changeColor, fmtNum, fmtDate } from "@/lib/format";
import { sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, assetClassLabel, holdingRoute, ROUTE_LABEL } from "@/lib/analytics";
import { accountIndex, ownerOf, type AccountIndex, engagementOf } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { loadTransactions, loadSales, type Txn } from "@/lib/ledger";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
import { ledgerHref, auditHref, LEDGER, pnlFormula, returnFormula, weightFormula } from "@/lib/auditFormulas";
import type { Position } from "@/lib/types";
import { AbsentCell, AbsentSection, DASH } from "@/components/Absent";

type EntityPart = {
  // Per-unit figures are nullable for the same reason they are on Position:
  // 360 ONE marks its AIF at a total value and prints no NAV per unit.
  entity: string; quantity: number; avgCost: number | null; currentPrice: number | null;
  costBasis: number | null; marketValue: number; unrealizedPnL: number | null; returnPct: number | null; costNA: boolean;
  /** How the entity came to hold it — a manager's mandate, or its own account. */
  routes: string[];
};
type Row = {
  key: string; security: string; securityKey: string; sector: string; assetClass: string;
  // avgCost / currentPrice are PER-UNIT and nullable — 360 ONE prints neither
  // for its AIF holding. See the note on Position in src/lib/types.ts.
  entities: string[]; parts: EntityPart[]; quantity: number; avgCost: number | null; currentPrice: number | null;
  // Cost and the two figures derived from it are NULLABLE for the same reason
  // the per-unit ones are: a depository holding statement reports a value and no
  // cost. `costNA` stays the flag the cells switch on; the values themselves are
  // null rather than 0 so nothing downstream can sum them into a total.
  costBasis: number | null; marketValue: number; unrealizedPnL: number | null; returnPct: number | null; weight: number;
  costNA: boolean;
  // Live-quote fields. `live: false` means CMP is still the workbook mark — the
  // row says so rather than letting a month-old price read as current.
  live: boolean; dayChange: number; dayChangePct: number | null;
  /**
   * Set only in the BY-ENTITY view, where both members' rows of a dually
   * reported holding are shown as printed. Undefined in the by-security view,
   * whose rows are already consolidated. The class-section subtotal reads it so
   * the sections sum to the footer in both views — see `classGroups`.
   */
  dedupeGroup?: string;
};
type SortKey = "security" | "marketValue" | "returnPct" | "unrealizedPnL" | "weight" | "dayChange";

// Weight, P&L and return all move with the live price, so they no longer match
// any cell in the workbook — an audit link would point at a different number.
// Live cells therefore render plain, and only rows still on their workbook mark
// keep the trace. The inputs that don't move (quantity, cost) keep theirs either way.
const LIVE_CELL = "Recalculated from the live price. Quantity and cost come from the ledger; this figure is worked out from them, so it has no workbook cell to trace to.";

export function PortfolioMonitor() {
  const { portfolio, consolidated, basis, displayCurrency, fmtFromBase } = usePortfolio();
  const [view, setView] = useState<"holdings" | "transactions">("holdings");
  const [consolidate, setConsolidate] = useState(true);
  // These three filters are global — they drive both the Holdings table and the
  // Transactions tape at once. `selected` is a set of security names (empty = all).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sector, setSector] = useState("All");
  const [entity, setEntity] = useState("All");
  // Asset-class filter — Equity / AIF / Mutual Fund / Cash were shown in one flat
  // list, so a ₹176 Cr AIF folio sat between two equity lines as if it were the
  // same kind of thing. This filters to one class; the holdings table also
  // sections by class with a subtotal when all are shown.
  const [assetClass, setAssetClass] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  // Realised P&L per security (by securityKey) from the archive's sales —
  // undefined = loading, null = the archive didn't respond. A VALUE of null in
  // the map is a third thing again: the name was sold, but no capital gain
  // statement covers that account, so what it realised was never reported.
  const [realized, setRealized] = useState<Map<string, number | null> | null | undefined>(undefined);
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
  // Asset classes present, in a fixed reading order (listed → alternatives → cash).
  const CLASS_ORDER = ["Equity", "ETF", "Mutual Fund", "AIF", "Bond", "Structured Product", "Unlisted", "Cash"];
  const classOrd = (c: string) => { const i = CLASS_ORDER.indexOf(c); return i < 0 ? CLASS_ORDER.length : i; };
  const assetClasses = useMemo(() => ["All", ...Array.from(new Set(positions.map((p) => p.assetClass))).sort((a, b) => classOrd(a) - classOrd(b))], [positions]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const { rows, totMV, totCost, totPnL, rawMV, costedMV, costedCount, heldCount } = useMemo(() => {
    let base = positions;
    if (entity !== "All") base = base.filter((p) => ownerOf(accIdx, p) === entity);
    if (sector !== "All") base = base.filter((p) => p.sector === sector);
    if (assetClass !== "All") base = base.filter((p) => p.assetClass === assetClass);
    // Weight denominator — consolidated, so the column sums to 100 rather than
    // to 101.4 when a holding is reported under two members.
    const totalMV = consolidatedMarketValue(base);
    let out: Row[];
    if (consolidate) {
      // Consolidated on securityKey: the same company held through two platforms
      // is one row, and ISIN could not do this grouping — most rows have none.
      const m = new Map<string, Position[]>();
      for (const p of base) (m.get(p.securityKey) ?? m.set(p.securityKey, []).get(p.securityKey)!).push(p);
      out = [...m.values()].map((ps) => {
        // COUNT EACH dedupeGroup ONCE. This is the CONSOLIDATED (by-security)
        // view, so a holding reported under two members — 360 ONE Special Opp
        // (both CRNs) and Transition Fund I (both trusts) share one securityKey —
        // must contribute its value once. Summing the raw lots showed those two
        // rows at 2× and pushed the footer to ₹338.6 Cr against a ₹335.43 Cr NAV.
        // `dedupedPositions` collapses only same-dedupeGroup rows; a name held by
        // several DIFFERENT accounts still sums all of them.
        const dps = dedupedPositions(ps);
        const mv = sum(dps.map((x) => x.marketValue));
        // `sumOrNull`: a lot with no reported cost contributes nothing rather
        // than a zero that would understate the consolidated basis.
        const cost = sumOrNull(dps.map((x) => x.costBasis));
        const qty = sum(dps.map((x) => x.quantity));
        const costNA = cost === null || (cost === 0 && mv > 0);
        const pnl = costNA ? null : mv - (cost as number);
        return {
          key: ps[0].securityKey, security: ps[0].security, securityKey: ps[0].securityKey, sector: ps[0].sector, assetClass: ps[0].assetClass,
          entities: Array.from(new Set(ps.map((x) => ownerOf(accIdx, x)))), parts: entityParts(dps, accIdx), quantity: qty,
          avgCost: !costNA && qty > 0 ? (cost as number) / qty : null, currentPrice: ps[0].currentPrice,
          costBasis: cost, marketValue: mv, unrealizedPnL: pnl,
          returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null,
          weight: totalMV > 0 ? mv / totalMV : 0,
          costNA,
          // A security is live only if every lot of it is — they share one quote,
          // so in practice this is all-or-nothing.
          live: dps.every((x) => x.live),
          dayChange: sum(dps.map((x) => x.dayChange ?? 0)),
          dayChangePct: ps[0].dayChangePct ?? null,
        };
      });
    } else {
      out = base.map((p) => ({
        key: p.securityKey + "@" + p.accountId, security: p.security, securityKey: p.securityKey, sector: p.sector, assetClass: p.assetClass,
        entities: [ownerOf(accIdx, p)], parts: [], quantity: p.quantity, avgCost: p.avgCost, currentPrice: p.currentPrice,
        costBasis: p.costBasis, marketValue: p.marketValue, unrealizedPnL: p.unrealizedPnL,
        returnPct: p.returnPct, weight: totalMV > 0 ? p.marketValue / totalMV : 0,
        costNA: !!p.costUnavailable || p.costBasis === null,
        live: !!p.live, dayChange: p.dayChange ?? 0, dayChangePct: p.dayChangePct ?? null,
        dedupeGroup: p.dedupeGroup,
      }));
    }
    if (selected.size > 0) out = out.filter((r) => selected.has(r.security));
    out.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return asc ? cmp : -cmp;
    });
    // Footer totals are CONSOLIDATED in every view (each dedupeGroup once), so the
    // family total is the true ₹335.43 Cr NAV regardless of grouping. `rawMV` is
    // the sum of displayed rows — equal to the total in the by-security view, and
    // ₹3.17 Cr higher in the by-entity view where both members' rows are shown as
    // printed; the caption names that gap rather than letting the footer assert it.
    const db = dedupedPositions(base);
    /**
     * HOW MUCH OF THE MARKET VALUE COLUMN THE COST COLUMN ACTUALLY COVERS.
     *
     * `sumOrNull` skips a position whose statement carries no cost rather than
     * entering it as zero, which is right — but it means Invested and Unrealised
     * P&L are struck over a SMALLER SET than Market value, and the footer prints
     * all three side by side. A reader adds ₹471.9 Cr and +₹74.1 Cr, gets
     * ₹546 Cr against a printed ₹13,063.2 Cr, and has found a contradiction.
     *
     * There is none: the two are on their own consistent basis (invested + P&L
     * IS the market value of the positions that report a cost, to the rupee).
     * What was missing is any statement that they cover a different set. These
     * three are what the caption needs to say so.
     */
    const costed = db.filter((x) => x.costBasis != null);
    return {
      rows: out, totMV: totalMV,
      totCost: sumOrNull(db.map((x) => x.costBasis)),
      totPnL: sumOrNull(db.map((x) => x.unrealizedPnL)),
      rawMV: sum(out.map((r) => r.marketValue)),
      costedMV: sum(costed.map((x) => x.marketValue)),
      costedCount: costed.length,
      heldCount: db.length,
    };
  }, [positions, accIdx, consolidate, selected, sector, entity, assetClass, sortKey, asc]);
  // Rows grouped by asset class, so Equity / AIF / Mutual Fund / Cash read as the
  // distinct things they are rather than as one mixed ledger. Sectioning only
  // when more than one class is on screen.
  const classGroups = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) (g.get(r.assetClass) ?? g.set(r.assetClass, []).get(r.assetClass)!).push(r);
    return [...g.entries()]
      .map(([cls, rs]) => {
        /**
         * THE SECTION SUBTOTAL IS ON THE FOOTER'S BASIS — each `dedupeGroup`
         * once — because a reader who adds the four section headings and lands
         * somewhere other than the footer has found a contradiction, and this
         * book's own rule says no caption rescues one.
         *
         * It bites on the AIF section and only there. Both of this book's
         * duplicates are AIF holdings reported under two members — 360 ONE
         * Special Opportunities under CRN37702 and CRN60117, Transition Venture
         * Fund I under both Bharat trusts — so in the BY-ENTITY view, which
         * shows every statement's row as printed, the AIF heading summed
         * ₹3.17 Cr the footer beneath it (correctly) does not.
         *
         * Both rows still SHOW: `dedupedPositions`' policy is carry both, count
         * once. What is collapsed is named in the heading, so the difference
         * between the rows on screen and the subtotal above them is stated
         * rather than left for the reader to discover by adding them up.
         */
        const seen = new Set<string>();
        let subtotal = 0;
        let collapsed = 0;
        for (const r of rs) {
          if (r.dedupeGroup) {
            if (seen.has(r.dedupeGroup)) { collapsed += r.marketValue; continue; }
            seen.add(r.dedupeGroup);
          }
          subtotal += r.marketValue;
        }
        return { cls, rows: rs, subtotal, collapsed };
      })
      .sort((a, b) => classOrd(a.cls) - classOrd(b.cls));
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const showClassSections = assetClass === "All" && classGroups.length > 1;
  // NULL when the visible rows carry no cost between them — the total-return
  // cell then renders `—` instead of a 0.00% nobody measured.
  const totalRet = totCost !== null && totPnL !== null && totCost > 0 ? (totPnL / totCost) * 100 : null;
  // In the by-entity view the displayed rows include both members' copies of a
  // dually-reported holding; name the gap so the footer (consolidated) reads true.
  const dupGap = !consolidate && rawMV - totMV > 1 ? rawMV - totMV : 0;
  // The market value the Invested and Unrealised P&L columns do NOT stand behind.
  // Rendered whenever it is worth more than a rupee, because the size of it is
  // the whole point: 61 of 370 positions here, and 96% of the book's value.
  const uncostedMV = totMV - costedMV > 1 ? totMV - costedMV : 0;
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
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  // Export the whole tab (all holdings + the full transaction tape, unfiltered) to a
  // styled workbook. exceljs is code-split so it only loads on demand.
  // The review deck. `pptxgenjs` is code-split the same way exceljs is, so a
  // megabyte of deck writer never reaches the main bundle.
  //
  // It is handed the DEDUPED set and the current basis, and it prints the basis
  // on every slide: a deck built on live prices and one built on statement
  // marks are different documents, and the reader has to be able to tell them
  // apart weeks later with only the file in front of them.
  const handleDeck = async () => {
    if (deckBusy) return;
    setDeckBusy(true);
    try {
      const { exportReviewDeck } = await import("@/lib/exportDeck");
      await exportReviewDeck({
        portfolio, consolidated, basis,
        fmt: (inr: number) => fmtFromBase(inr, { compact: false }),
        currency: displayCurrency,
      });
    } catch (e) {
      console.error("Deck export failed", e);
    } finally {
      setDeckBusy(false);
    }
  };

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
        <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className="rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-focus">
          {assetClasses.map((s) => <option key={s} value={s}>{s === "All" ? "All categories" : assetClassLabel(s)}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-3 py-2 text-sm font-medium text-champagne-400 transition-colors hover:bg-champagne-500/20 disabled:opacity-60"
            title="Download the full Portfolio Monitor — holdings and the transaction tape — as a styled Excel workbook">
            <FileSpreadsheet className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button onClick={handleDeck} disabled={deckBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-ink-500 disabled:opacity-60"
            title="Download a PowerPoint review deck. Every slide carries the basis and the as-of date, because a slide travels without its deck.">
            <Presentation className="h-4 w-4" /> {deckBusy ? "Building…" : "Review deck"}
          </button>
        </div>
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
                {classGroups.map((grp) => (
                  <Fragment key={grp.cls}>
                    {showClassSections && (
                      <tr className="bg-ink-900/50">
                        <td colSpan={13} className="px-2 py-1.5">
                          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-champagne-500">
                            {assetClassLabel(grp.cls)}
                            <span className="font-normal normal-case tracking-normal text-slate-500">· {grp.rows.length} {grp.rows.length === 1 ? "holding" : "holdings"} · {fmtFromBase(grp.subtotal, { compact: true })}</span>
                            {grp.collapsed > 0 && (
                              <span className="font-normal normal-case tracking-normal text-slate-500"
                                title="The same holding is reported on two members' statements. Both rows are shown as printed; the subtotal counts it once, exactly as the footer does.">
                                · {fmtFromBase(grp.collapsed, { compact: true })} reported twice, counted once
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                    {grp.rows.map((r) => {
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
                        {/* A FUND HAS NO SECTOR, AND "Unclassified" IS THE WRONG
                            WAY TO SAY SO. It reads as a sector the pipeline
                            failed to map — the same cell a direct equity gets
                            when its statement printed none — when the truth is
                            that the property does not apply: an AIF folio or a
                            mutual-fund scheme is a wrapper over many sectors. */}
                        <td className="px-2 py-2.5 text-slate-400">
                          {isFundVehicle(r)
                            ? <AbsentCell reason="a fund holds many sectors and its statement prints none; the look-through would need the scheme's own portfolio disclosure, which this book does not carry for this folio" />
                            : r.sector}
                        </td>
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
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">{r.costNA ? "—" : r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : <Auditable to={ledgerHref(r.security)} title="Average cost — trace to the ledger">{fmtFromBase(r.avgCost)}</Auditable>}</td>
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">{r.costNA ? "—" : <Auditable to={ledgerHref(r.security)} title="Invested (cost) — trace to the ledger">{fmtFromBase(r.costBasis, { compact: true })}</Auditable>}</td>
                        {/* A live price comes from the quote feed, not the workbook, so it
                            carries no audit link back to the ledger. Only a workbook mark
                            does — and it's flagged so it can't pass as current. */}
                        <td className="px-2 py-2.5 text-right mono text-slate-400 whitespace-nowrap">
                          {r.currentPrice === null
                            ? <AbsentCell reason="marked at a total value, not a per-unit price" />
                            : r.live
                            ? fmtFromBase(r.currentPrice)
                            : <><Auditable to={ledgerHref(r.security)} title="Market price — trace to the ledger">{fmtFromBase(r.currentPrice)}</Auditable>
                                <span className="ml-1 cursor-help text-[10px] text-amber-400/80"
                                  title={`No live price for this security — showing the mark from its statement as of ${portfolio.asOf}.`}>◦</span></>}
                        </td>
                        <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${r.live && r.dayChangePct != null ? changeColor(r.dayChangePct) : "text-slate-600"}`}
                          title={r.live && r.dayChangePct != null ? `${fmtFromBase(r.dayChange, { compact: true, sign: true })} on the position since previous close` : undefined}>
                          {r.live && r.dayChangePct != null
                            ? `${r.dayChangePct >= 0 ? "+" : ""}${r.dayChangePct.toFixed(2)}%`
                            : <AbsentCell reason={r.currentPrice === null
                                ? "this holding is marked at a total value, not a per-unit price, so it has no day move"
                                : "no live quote for this security, so there is no previous close to move from"} />}
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
                        {/* Three distinct states, never collapsed into one dash
                            without a reason: not looked up (per-entity view),
                            archive unreachable, name never sold, name sold but
                            no capital gain statement covers that account. */}
                        <td className="px-2 py-2.5 text-right mono whitespace-nowrap">{
                          !consolidate ? <AbsentCell reason="realised gain is a per-security figure; switch to the consolidated view to see it" />
                          : realized === undefined ? <span className="text-slate-500">…</span>
                          : realized === null ? <AbsentCell reason="the audit archive didn't respond" />
                          : !realized.has(r.securityKey) ? <AbsentCell reason="no sale of this name on the transaction statements" />
                          : realized.get(r.securityKey) == null ? <AbsentCell reason="sold, but no capital gain statement covers that account" />
                          : <span className={changeColor(realized.get(r.securityKey)!)}><Auditable to={ledgerHref(r.security)} title="Realised P&L — trace to the ledger">{fmtFromBase(realized.get(r.securityKey)!, { compact: true, sign: true })}</Auditable></span>
                        }</td>
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
                                    <th className="label-xs px-3 py-1.5 text-left font-medium">Held via</th>
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
                                      <td className="px-3 py-1.5 text-slate-400">{pt.routes.join(" + ")}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-300">{fmtNum(pt.quantity)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">{pt.costNA ? "—" : pt.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : fmtFromBase(pt.avgCost)}</td>
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
                  </Fragment>
                ))}
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
                  {/* sumOrNull, not sum: a name with no realised figure must not
                      be added in as zero — that turns "never reported" into a
                      measurement and drags the total towards it. */}
                  <td className="px-2 py-2.5 text-right mono whitespace-nowrap">{consolidate && realized ? (() => { const tr = sumOrNull(rows.map((r) => realized.get(r.securityKey) ?? null)); return tr === null ? <AbsentCell reason="no capital gain statement covers any of these names" /> : <span className={changeColor(tr)}>{fmtFromBase(tr, { compact: true, sign: true })}</span>; })() : <AbsentCell reason="realised gain is shown in the consolidated view" />}</td>
                  <td className={`px-2 py-2.5 text-right mono whitespace-nowrap ${changeColor(totPnL)}`} title={feedLive ? LIVE_CELL : undefined}>
                    {feedLive ? fmtPct(totalRet, { sign: true })
                              : <Auditable formula={{ title: "Total return", excel: "= Total P&L ÷ Total cost × 100", plain: "The whole listed book's gain or loss versus what it cost.", worked: `= ${money(totPnL)} ÷ ${money(totCost)} × 100 = ${fmtPct(totalRet, { sign: true })}` }}>{fmtPct(totalRet, { sign: true })}</Auditable>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {uncostedMV > 0 && (
            <p className="border-t border-dashed border-ink-700 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">Invested and Unrealised P&amp;L do not add up to Market value,
              and are not meant to.</span> They are struck over the {costedCount} of {heldCount} positions whose statement
              reports a cost — {money(costedMV)} of the {money(totMV)} in the Market value column, and
              {" "}{money(totCost)} and {money(totPnL, true)} make {money(costedMV)} across exactly those.
              {/* "and … make" rather than "+ … =": `money(…, true)` already carries the
                  sign, so a literal plus printed "₹471.9 Cr + +₹72.5 Cr", and dropping
                  the sign instead would render a LOSS as though it were added. */}
              The other {heldCount - costedCount} position{heldCount - costedCount === 1 ? "" : "s"},
              worth {money(uncostedMV)}, are held through depository accounts: a depository records what is
              held and never what was paid for it. Their cost is absent rather than zero — entered as zero it
              would report the whole of that {money(uncostedMV)} as profit.
            </p>
          )}
          {dupGap > 0 && (
            <p className="border-t border-dashed border-ink-700 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
              The rows above show each member's statement as printed. Two holdings are reported under two members,
              so the visible rows sum to {money(rawMV)} while the family total counts each once at {money(totMV)}
              (a {money(dupGap)} overlap). Switch to <span className="font-medium text-slate-400">By security</span> to
              see them consolidated.
            </p>
          )}
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
  const m = new Map<string, { entity: string; quantity: number; costs: (number | null)[]; costBasis: number | null; marketValue: number; currentPrice: number | null; costUnavailable: boolean; routes: Set<string> }>();
  for (const x of ps) {
    const who = ownerOf(accIdx, x);
    const e = m.get(who) ?? { entity: who, quantity: 0, costs: [], costBasis: null, marketValue: 0, currentPrice: x.currentPrice, costUnavailable: false, routes: new Set<string>() };
    e.routes.add(ROUTE_LABEL[holdingRoute(engagementOf(accIdx, x) || null)]);
    e.quantity += x.quantity;
    // Collected and summed with sumOrNull below, not accumulated with `+=`: a
    // null cost added to a running total silently becomes NaN, and NaN formats
    // as "—" for the wrong reason on every entity that holds the name.
    e.costs.push(x.costBasis);
    e.marketValue += x.marketValue;
    if (x.costUnavailable || x.costBasis === null) e.costUnavailable = true;
    m.set(who, e);
  }
  for (const e of m.values()) e.costBasis = sumOrNull(e.costs);
  return [...m.values()].map((e) => {
    // Cost is "not meaningful" when the source flags it unavailable (even with a
    // placeholder cost) or when no cost basis is present — mirrors the By-entity view.
    const cost = e.costBasis;
    const costNA = e.costUnavailable || cost === null || (cost === 0 && e.marketValue > 0);
    const pnl = costNA ? null : e.marketValue - (cost as number);
    return {
      entity: e.entity, routes: [...e.routes], quantity: e.quantity, currentPrice: e.currentPrice,
      avgCost: !costNA && e.quantity > 0 ? (cost as number) / e.quantity : null, costBasis: cost,
      marketValue: e.marketValue, unrealizedPnL: pnl,
      returnPct: !costNA && pnl !== null && (cost as number) > 0 ? (pnl / (cost as number)) * 100 : null, costNA,
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
      // Matched on the CANONICAL owner, not on the account label: the label
      // prints the owner's name as that statement spelled it ("Ajay Thakurdas
      // Jaisinghani"), and the filter offers the canonical one ("Ajay
      // Jaisinghani"). Comparing the two strings never matches, which would
      // empty the tape the moment anyone filtered by entity.
      (entity === "All" || ownerDisplayName(t.ownerId) === entity) &&
      (sector === "All" || sectorByKey.get(t.securityKey) === sector) &&
      (selected.size === 0 || selected.has(t.security)) &&
      (!from || t.date >= from) &&
      (!to || t.date <= to));
  }, [txns, side, entity, sector, sectorByKey, selected, from, to]);
  const shown = filtered.slice(0, TXN_CAP);

  if (status === "loading") return <Card className="flex min-h-0 flex-1 items-center justify-center"><span className="text-sm text-slate-500">Loading transactions…</span></Card>;
  if (status === "error") {
    return (
      <Card className="flex min-h-0 flex-1 items-center justify-center">
        <AbsentSection what="The audit archive didn't respond"
          needs="This tape reads the extracted transaction statements from /audit. That request didn't come back — refresh to retry. The archive is served alongside the app, so this is the archive being unreachable rather than your session being stale." />
      </Card>
    );
  }
  if (!txns?.length) {
    return (
      <Card className="flex min-h-0 flex-1 items-center justify-center">
        <AbsentSection what="No dated transactions in this book"
          needs="Transactions come from each manager's transaction statement. No account in this drop issued one, so there is no tape to show — which is not the same as a period with no trading." />
      </Card>
    );
  }

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
                  <td className="px-3 py-2 text-right mono text-slate-400">{t.price ? <Auditable to={ledgerHref(t.security)} title="Trade price — trace to the ledger">{fmtFromBase(t.price)}</Auditable> : <AbsentCell reason="this trade row reports no unit price on its statement" />}</td>
                  <td className="px-3 py-2 text-right mono text-slate-200">{t.amount ? <Auditable to={ledgerHref(t.security)} title="Trade value — trace to the ledger">{fmtFromBase(t.amount, { compact: true })}</Auditable> : <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" />}</td>
                  <td className={`px-3 py-2 text-right mono ${t.realized == null ? "text-slate-600" : changeColor(t.realized)}`}>{t.realized == null ? <AbsentCell reason={t.realizedNote ?? "no capital gain statement covers this account, so what this sale realised was never reported"} /> : <Auditable to={ledgerHref(t.security)} title="Realized profit on this sale — trace to the ledger">{fmtFromBase(t.realized, { compact: true, sign: true })}</Auditable>}</td>
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
