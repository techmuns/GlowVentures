import { Fragment, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Check, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import {
  sum, sumOrNull, consolidatedMarketValue, isCompanyShare, excludedClasses, assetClassLabel, currentHoldings,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE, DIRECT_EQUITY_BUCKET, costCoversSet,
} from "@/lib/analytics";
import { accountIndex, ownerOf, engagementOf } from "@/lib/accounts";
import { useStockExposure } from "@/lib/useStockExposure";
import { fifoTotals } from "@/lib/fifo";
import { companyExposure, type CompanyExposure } from "@/lib/lookthrough";
import { UNCLASSIFIED } from "@/lib/sectors";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { fmtPct, fmtCurrency, changeColor } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import type { Position } from "@/lib/types";

/** The sector table's columns, in the order its rows write their cells. */
const SECTOR_COLS = ["sector", "value", "weight", "count", "return", "top"] as const;
/** ...and the two breakouts a sector row opens into. */
const SECTOR_COMPANY_COLS = ["company", "measured", "derived", "total", "share"] as const;
const SECTOR_HOLDING_COLS = ["security", "entity", "heldVia", "value", "share", "return"] as const;
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { Auditable } from "@/components/Auditable";
import { returnFormula, weightFormula } from "@/lib/auditFormulas";
import { AbsentCell } from "@/components/Absent";

const LIVE_CELL = "Recalculated from live prices. Cost basis comes from the ledger; this figure is worked out from it, so it has no workbook cell to trace to.";

/**
 * WHY A COMPANY SHARE CAN HAVE NO SECTOR — the reason that used to live in this
 * page's footer paragraph, now on the row it is about.
 *
 * It is a real absence rather than a bucket: `shared/sectors.mjs` maps each
 * provider's own label to GICS and infers nothing, because the platforms
 * disagree on nearly every name and a wrongly-sectored holding looks exactly
 * like a correctly-sectored one on an allocation chart.
 *
 * IT TAKES THE VIEW, because the two sets have different numbers of places to
 * look. Direct Equity has ONE source — the family's own statement. Consolidated
 * has a second, the industry an AMC filed against the same ISIN, so "the
 * document does not report it" would be true of one document and silent about
 * the other.
 */
const unclassifiedWhy = (consolidatedView: boolean) =>
  "Left unclassified rather than assigned a sector we would have to guess. These are shares in companies, so the sector "
  + (consolidatedView
    ? "exists — neither the family's own statement nor any fund disclosure that names this company printed one."
    : "exists; the statement simply does not report it. A depository prints an ISIN, a quantity and a rate and no industry at all.");

/** Why Consolidated strikes no return: its value is part measured, part derived. */
const CONSOLIDATED_RETURN_WHY = "This view's value is the shares the statements report plus a DERIVED share of what the funds disclose, and no document reports a cost for the second. A return struck over it would divide a part-measured gain by a cost covering part of its own numerator. Direct Equity is measured end to end and carries one where its holdings report a cost.";

/**
 * ── THREE TABS, AND THE THIRD IS NOT A THIRD SET ─────────────────────────────
 *
 *   *"In this sector composition tab this compare sectors needs to be a subtab
 *    next to direct equity, you have made the pages too busy and why not give
 *    this whole table of Sector breakdown next to this pie chart table by
 *    splitting the page into two parts right and left."*
 *
 * Consolidated and Direct Equity are two SETS (see below); Compare is a way of
 * READING both. It puts up to four sectors side by side on each set at once —
 * a sector's total exposure beside what the family bought of it themselves —
 * which is why it is a tab of its own rather than a card under whichever set is
 * active: the old card compared on the active set only, and on Consolidated its
 * cost, P&L and return rows could only ever print a dash.
 *
 * CONSOLIDATED IS THE DEFAULT, and that is a decision rather than an ordering.
 * It is the widest set and the one that answers "what is this family exposed
 * to"; opening on Direct Equity would take the mandate half — most of the
 * measured shares on this page — off the first paint. `useViewParam` keeps the
 * first view param-free, so Consolidated is `/sectors` and the other two are
 * shareable links like every other view in this app.
 *
 * THE TOGGLE RIDES BESIDE THE TITLE, the Portfolio Monitor's placement: it says
 * what the reader is looking at, and a row of its own was a row of page the
 * family asked to have back. What the old subtitle said about each set is each
 * tab's own hover now.
 */
type SectorView = "consolidated" | "direct" | "compare";
const SECTOR_VIEWS: readonly ViewDef<SectorView>[] = [
  { key: "consolidated", label: "Consolidated",
    title: "Every company this family is exposed to — the shares their statements report, plus their share of what their funds disclose holding." },
  { key: "direct", label: "Direct Equity",
    title: "Shares bought in the family's own demat and broking accounts only — nothing a discretionary manager chose, and no fund." },
  { key: "compare", label: "Compare sectors",
    title: "Up to four sectors side by side, on both sets at once: the family's total exposure and what they bought themselves." },
];

/** How many sectors the Compare tab puts side by side. */
const MAX_COMPARE = 4;

/**
 * ONE SECTOR, ON ONE SET. `measured`/`derived` split the value on Consolidated;
 * `cost`/`pnl`/`returnPct` exist only on Direct Equity, and only where the
 * holdings' own statements report a cost — see `rollSectors`.
 */
type SectorRow = {
  key: string; mv: number; count: number; weight: number;
  measured: number; derived: number;
  cost: number | null; pnl: number | null; returnPct: number | null;
  /**
   * FIFO's other half: what the units already sold realised, and the capital
   * behind the return (cost held + cost of units sold). Null on Consolidated.
   */
  realised: number | null; deployed: number | null;
  /** Holdings behind the sector that report a cost, and how many there are. */
  costed: number; holdings: number;
  /**
   * The part of the sector's value whose holdings report NO cost — what
   * `costCoversSet` weighs. Null on Consolidated, where no cost is struck at all
   * and a zero here would read as "fully costed".
   */
  uncostedMV: number | null;
  /** Why no return is struck, where none is — never a bare dash. */
  returnWhy: string | null;
  /** The largest company (Consolidated) or holding (Direct Equity). */
  top: string | null;
};

/**
 * ── ONE ROLLUP, TWO SETS ─────────────────────────────────────────────────────
 *
 * Consolidated rolls up COMPANIES, and its cost, P&L and return are NULL by
 * construction rather than by absence in the data: its value column is the
 * measured half plus a derived one, and no statement reports a cost for a share
 * the family owns inside somebody else's portfolio.
 *
 * Direct Equity rolls up the SAME kind of entry over the family's own shares,
 * and there a cost IS a measurement — for the holdings whose statement prints
 * one. A return is struck only where those holdings account for essentially the
 * whole sector (`costCoversSet`, the one definition Morning CIO and the
 * Portfolio Monitor already share), because a return over the costed few
 * printed beside the value of all of them describes neither. This page used to
 * print `fmtPct(null)` there — a bare dash inside a formula popover whose
 * worked line read "— ÷ — × 100" — which is the absent-without-a-reason failure
 * `Absent.tsx` exists to prevent.
 */
function rollSectors(entries: CompanyExposure[], valueOf: (e: CompanyExposure) => number, withCost: boolean): SectorRow[] {
  const m = new Map<string, { entries: CompanyExposure[]; mv: number }>();
  for (const e of entries) {
    const k = e.sector || UNCLASSIFIED;
    const c = m.get(k) ?? { entries: [], mv: 0 };
    c.entries.push(e); c.mv += valueOf(e);
    m.set(k, c);
  }
  const tot = [...m.values()].reduce((a, v) => a + v.mv, 0);
  return [...m.entries()]
    .map(([key, v]): SectorRow => {
      const positions = v.entries.flatMap((e) => e.positions);
      const measured = v.entries.reduce((a, e) => a + (e.positions.length ? e.measured : 0), 0);
      const derived = v.entries.reduce((a, e) => a + e.derived, 0);
      const byValue = [...v.entries].sort((a, b) => valueOf(b) - valueOf(a));
      if (!withCost) {
        return {
          key, mv: v.mv, count: v.entries.length, weight: tot > 0 ? v.mv / tot : 0,
          measured, derived, cost: null, pnl: null, returnPct: null, realised: null, deployed: null,
          costed: 0, holdings: positions.length, uncostedMV: null, returnWhy: CONSOLIDATED_RETURN_WHY,
          top: byValue[0]?.name ?? null,
        };
      }
      const costedRows = positions.filter((x) => typeof x.costBasis === "number" && !x.costUnavailable);
      const cost = sumOrNull(costedRows.map((x) => x.costBasis));
      const pnl = sumOrNull(costedRows.map((x) => x.unrealizedPnL));
      const uncostedMV = sum(positions.filter((x) => !costedRows.includes(x)).map((x) => x.marketValue));
      const covered = costCoversSet(v.mv, uncostedMV);
      // FIFO: the unrealised gain on what is held AND the realised gain on units
      // already sold, over every rupee that bought a unit — never the survivors
      // alone. `fifoTotals` is the one place a set becomes a return.
      const fifo = fifoTotals(positions);
      const returnPct = covered && fifo.returnPct !== null ? fifo.returnPct : null;
      const topHolding = [...positions].sort((a, b) => b.marketValue - a.marketValue)[0]?.security ?? null;
      return {
        key, mv: v.mv, count: positions.length, weight: tot > 0 ? v.mv / tot : 0,
        measured, derived, cost, pnl, returnPct, realised: fifo.realised, deployed: fifo.deployed,
        costed: costedRows.length, holdings: positions.length, uncostedMV,
        returnWhy: returnPct !== null ? null
          : costedRows.length === 0
            ? "No holding in this sector reports a cost — a depository statement carries a value and no basis, so there is nothing to strike a return against."
            : `A cost is reported for ${costedRows.length} of the ${positions.length} holdings in this sector, and a return over those few printed beside the value of all of them would describe neither.`,
        top: topHolding,
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

export function SectorComposition() {
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sectorView = useTableView("sectors", SECTOR_COLS);
  const companyView = useTableView("sector-companies", SECTOR_COMPANY_COLS);
  const holdingView = useTableView("sector-holdings", SECTOR_HOLDING_COLS);
  /**
   * THE SECTORS BEING COMPARED. `null` until the reader picks, which reads as
   * "the four largest" — a default of the largest by value is an ORDERING, not
   * a judgement, and a Compare tab that opened on an empty table would spend
   * its whole right half asking to be filled.
   */
  const [picked, setPicked] = useState<string[] | null>(null);
  if (!portfolio) return null;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * EVERY FIGURE ON THIS PAGE IS BOOK-WIDE, SO IT READS THE DEDUPED SET — two
   * groups are duplicated in this drop (360 ONE Special Opportunities under both
   * CRNs, Transition Venture Fund I under both trusts), and a raw sum over-counts
   * the sectors by ₹3.17 Cr against a total that counts each once. Per-account
   * and per-owner views do the opposite, and that is Family & Entities.
   *
   * THIS PAGE IS COMPANY SHARES — `isCompanyShare`, deliberately not
   * `isDirectEquity`. A GICS sector is a property of a COMPANY; a fund is a
   * wrapper holding many, and a mutual fund once stood at the head of this
   * table in the largest slice of the chart describing nothing. Everything that
   * is not a share in a company is NAMED on the Direct Equity tab with its
   * value, per class, rather than folded in as a false sector.
   *
   * CURRENT HOLDINGS FIRST: the ₹1,000 floor drops two EQUITY rows, so a hand
   * `consolidated.filter(isCompanyShare)` stopped agreeing with the Portfolio
   * Monitor's security axis — which `check:pages` asserts across the two pages.
   */
  const accIdx = accountIndex(portfolio.accounts);
  const heldConsolidated = currentHoldings(consolidated);
  const p = heldConsolidated.filter(isCompanyShare);
  /** Every company share the statements report — the MEASURED half of both sets. */
  const measuredMV = consolidatedMarketValue(p);
  /**
   * WHO CHOSE THESE SHARES — split out and RENDERED. "Company shares" is an
   * asset-class statement; "Direct Equity" is a claim about WHO DECIDED, and on
   * the holdings tables it is the narrower set. The route comes from the
   * ACCOUNT (`engagementOf`), never from the position.
   */
  const routeOf = (x: Position) => holdingRoute(engagementOf(accIdx, x) || null);
  const mandateRows = p.filter((x) => routeOf(x) === "mandate");
  const ownRows = p.filter((x) => routeOf(x) === "own");
  // `unknown` is never defaulted, so this is empty in this drop and must still
  // be named the day a statement arrives that does not say how its account is run.
  const otherRows = p.filter((x) => routeOf(x) !== "mandate" && routeOf(x) !== "own");
  const mandateMV = sum(mandateRows.map((x) => x.marketValue));
  const ownMV = sum(ownRows.map((x) => x.marketValue));
  const otherMV = sum(otherRows.map((x) => x.marketValue));
  const mandateAccounts = new Set(mandateRows.map((x) => x.accountId)).size;
  const ownAccounts = new Set(ownRows.map((x) => x.accountId)).size;
  // Every class this page does NOT cover, largest first, from the book — ON THE
  // SAME SET as the covered half, because "company shares + the classes left
  // out = the book" is only a partition if both sides are drawn from one set.
  const excluded = excludedClasses(heldConsolidated, isCompanyShare);
  const excludedMV = sum(excluded.map((c) => c.mv));

  const [view, setView] = useViewParam<SectorView>(SECTOR_VIEWS);
  /** The donut, the source line and the sector table read Consolidated on the Compare tab too. */
  const consolidatedView = view !== "direct";
  /**
   * LOADED ON EVERY TAB, and Direct Equity needs it for a reason that is a
   * finding rather than a convenience: NOT ONE of the family's own-account
   * company shares carries a sector of its own — a depository prints an ISIN, a
   * quantity and a rate and no industry — so read off the book alone that set is
   * a single grey wedge. `companyExposure` places them through a fund's own SEBI
   * filing joined on the ISIN, and screener.in joined on the NSE symbol, and a
   * lower tier ONLY EVER FILLS AN EMPTY SECTOR.
   */
  const exposure = useStockExposure(consolidated, true);
  /**
   * BOTH SETS, EVERY RENDER. The Compare tab puts a sector's consolidated
   * exposure beside its Direct Equity figures, so neither can be computed only
   * while its own tab is open. `companyExposure` is the one definition — the
   * same one the Portfolio Monitor's stock axis is built on — so a company
   * cannot be sized here and sized differently there.
   */
  const consEntries = useMemo(() => companyExposure(p, exposure), [p, exposure]);
  // Own-account holdings only: a company the family owns only inside a fund is
  // not a Direct Equity holding by any reading of the words.
  const directEntries = useMemo(
    () => companyExposure(ownRows, exposure).filter((e) => e.positions.length > 0),
    [ownRows, exposure]);
  const consSectors = useMemo(() => rollSectors(consEntries, (e) => e.total, false), [consEntries]);
  const directSectors = useMemo(() => rollSectors(directEntries, (e) => e.measured, true), [directEntries]);

  const entries = consolidatedView ? consEntries : directEntries;
  /** What a row is worth in the active set — total exposure, or the measured half alone. */
  const valueOf = (e: CompanyExposure) => (consolidatedView ? e.total : e.measured);
  const sectors = consolidatedView ? consSectors : directSectors;
  /**
   * THE ACTIVE SET'S OWN TOTAL, SUMMED FROM THE VERY SLICES ON SCREEN — never
   * computed on a second path. A donut whose hole prints a figure its own wedges
   * do not add to is "a total must tie to its own columns" with a chart around it.
   */
  const totalMV = sectors.reduce((a, sc) => a + sc.mv, 0);
  /**
   * THE DERIVED HALF, SUMMED FROM THE SAME ENTRIES THE SECTORS ARE BUILT FROM —
   * not from `exposure.total`, the store's own figure over every disclosed
   * company, which runs before the fence and before this page narrows to
   * company shares.
   */
  const derivedMV = consEntries.reduce((a, e) => a + e.derived, 0);
  /**
   * WHERE EACH COMPANY'S SECTOR CAME FROM — counted and printed, because the
   * tiers are different kinds of evidence and a reader cannot infer any of them
   * from the chart. A company placed by none says so, AT ITS VALUE: "57
   * unplaced" and "₹15.4 Cr unplaced" are the same fact told very differently.
   */
  const sectorFrom = useMemo(() => {
    let book = 0, disc = 0, vendor = 0;
    const unplaced: CompanyExposure[] = [];
    for (const e of entries) {
      if (e.sectorFrom === "book") book += 1;
      else if (e.sectorFrom === "disclosure") disc += 1;
      else if (e.sectorFrom === "vendor") vendor += 1;
      else unplaced.push(e);
    }
    const unplacedMV = unplaced.reduce((a, e) => a + e.total, 0);
    return { book, disc, vendor, unplaced, unplacedMV };
  }, [entries]);
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  /**
   * WHAT A SECTOR OPENS INTO. Direct Equity expands to the POSITIONS behind it,
   * with the entity that holds each; Consolidated to the COMPANIES, because a
   * company only a fund holds has no position to list.
   */
  const companiesBySector = useMemo(() => {
    const m: Record<string, CompanyExposure[]> = {};
    for (const s of sectors) m[s.key] = entries.filter((e) => (e.sector || UNCLASSIFIED) === s.key);
    return m;
  }, [entries, sectors]);
  /**
   * GROUPED ON THE ENTRY'S SECTOR, NEVER ON THE POSITION'S OWN. They differ for
   * the own-account holdings whose sector came from a fund's filing, and
   * filtering positions on `x.sector` would put those rows in the Unclassified
   * fold while their value counted in Financials — a drill-down that does not
   * add up to the row it opened from.
   */
  const holdingsBySector = useMemo(() => {
    const m: Record<string, Position[]> = {};
    if (consolidatedView) return m;
    for (const s of sectors) {
      m[s.key] = (companiesBySector[s.key] ?? [])
        .flatMap((e) => e.positions)
        .sort((a, b) => b.marketValue - a.marketValue);
    }
    return m;
  }, [consolidatedView, companiesBySector, sectors]);
  /**
   * WHICH SECTORS CARRY A LIVE PRICE — read off the active set's own positions.
   * Never on Consolidated: that value is part derived from a monthly disclosure,
   * and "recalculated from live prices" would be a claim about a figure the feed
   * has not touched.
   */
  const liveBySector = useMemo(() => {
    const m: Record<string, boolean> = {};
    if (consolidatedView) return m;
    for (const [key, rows] of Object.entries(holdingsBySector)) m[key] = rows.some((x) => x.live);
    return m;
  }, [consolidatedView, holdingsBySector]);
  const topHolding = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sectors) {
      m[s.key] = consolidatedView
        ? companiesBySector[s.key]?.[0]?.name ?? "—"
        : holdingsBySector[s.key]?.[0]?.security ?? "—";
    }
    return m;
  }, [consolidatedView, sectors, holdingsBySector, companiesBySector]);

  /**
   * THE TABLE'S OWN ORDER. `sectors` keeps the chart's ordering — the donut reads
   * it, and the swatch colour is keyed on a sector's place in it — so the table
   * sorts a copy and never that array.
   */
  const sectorRows = sortRows(sectors, sectorView.sort, {
    sector: (x) => x.key,
    value: (x) => x.mv,
    // Weight is this sector's value over the page's, so it orders as Value does.
    weight: (x) => x.mv,
    count: (x) => x.count,
    return: (x) => x.returnPct,
    top: (x) => topHolding[x.key] ?? null,
  });

  /**
   * THE COLOUR FOLLOWS THE SECTOR, NOT THE ROW. `CHART_COLORS[i % n]` keyed on a
   * rendered index would repaint every swatch the moment a reader sorted the
   * table, and the donut beside it would stop matching. The index is the
   * sector's place in the CONSOLIDATED order, on every tab, so one sector is one
   * colour whichever set or comparison it appears in.
   */
  const colorOf = (key: string) => {
    const i = consSectors.findIndex((s) => s.key === key);
    const j = i >= 0 ? i : consSectors.length + directSectors.findIndex((s) => s.key === key);
    return CHART_COLORS[Math.max(j, 0) % CHART_COLORS.length];
  };
  const chartData = sectors.map((s) => ({ name: s.key, value: convertFromBase(s.mv) }));

  // ── The comparison: the four largest real sectors until the reader picks. ──
  const defaultPick = consSectors.filter((s) => s.key !== UNCLASSIFIED).slice(0, MAX_COMPARE).map((s) => s.key);
  const compare = (picked ?? defaultPick).filter((k) => consSectors.some((s) => s.key === k) || directSectors.some((s) => s.key === k));
  const togglePick = (key: string) => setPicked((prev) => {
    const cur = prev ?? defaultPick;
    return cur.includes(key)
      ? cur.filter((k) => k !== key)
      : cur.length >= MAX_COMPARE ? [...cur.slice(1), key] : [...cur, key];
  });
  const consByKey = new Map(consSectors.map((s) => [s.key, s]));
  const directByKey = new Map(directSectors.map((s) => [s.key, s]));

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  /**
   * THE DONUT — shared by all three tabs. On Compare its wedges are the picker:
   * a click adds or removes a sector, and the ones not picked are dimmed.
   */
  const donut = (
    <div className="relative mx-auto shrink-0" style={{ width: 236, height: 236 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={108} stroke="none"
            className="cursor-pointer"
            onClick={(d: any) => { const nm = d?.name ?? d?.payload?.name; if (!nm) return; if (view === "compare") togglePick(nm); else toggle(nm); }}>
            {chartData.map((c) => (
              <Cell key={c.name} fill={colorOf(c.name)}
                fillOpacity={view === "compare" && !compare.includes(c.name) ? 0.22 : 1} />
            ))}
          </Pie>
          <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
            formatter={(v: number) => axisFmt(v)} />
        </PieChart>
      </ResponsiveContainer>
      {/* THE HOLE IS A LABEL, A FIGURE AND A COUNT, and nothing else fits. The
          count is an ATTRIBUTE as well as text, with the basis it asserts in the
          hover beside it — the hole's wording is the first thing a layout fix
          changes and the last thing a structural claim should depend on. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="label-xs !tracking-normal">{consolidatedView ? "Total exposure" : "Direct Equity"}</div>
        <div className="mono text-base font-semibold text-slate-100">{fmtFromBase(totalMV, { compact: true })}</div>
        <div className="mt-0.5 text-[11px] text-slate-500"
          data-donut-count={consolidatedView ? entries.length : ownRows.length}
          data-donut-basis="each counted once"
          title="Each counted once — a company two of the family's statements both report is one row here, never two.">
          {consolidatedView ? entries.length : ownRows.length} {consolidatedView ? "companies" : "holdings"}
        </div>
      </div>
    </div>
  );

  /**
   * ── WHERE EVERY SECTOR ON THIS PAGE CAME FROM ──────────────────────────────
   * Three tiers, and a reader cannot infer any of them from the chart. It names
   * what is still unplaced, with the count and the value — a residual a reader
   * cannot see is a residual they assume is zero.
   */
  const sourceLine = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-700/70 pt-3 text-[11.5px] text-slate-400"
      data-sector-source
      data-from-book={sectorFrom.book}
      data-from-disclosure={sectorFrom.disc}
      data-from-vendor={sectorFrom.vendor}
      data-unplaced={sectorFrom.unplaced.length}
      data-unplaced-mv={Math.round(sectorFrom.unplacedMV)}>
      <span className="text-slate-500">Sector source</span>
      <span><span className="mono text-slate-200">{sectorFrom.book}</span> from their statements</span>
      {sectorFrom.disc > 0 && <span><span className="mono text-slate-200">{sectorFrom.disc}</span> from a fund&rsquo;s filing</span>}
      {sectorFrom.vendor > 0 && <span><span className="mono text-slate-200">{sectorFrom.vendor}</span> from screener.in</span>}
      {sectorFrom.unplaced.length > 0 && (
        <span className="text-slate-500"
          title={`No NSE symbol resolves for these, so nothing keys the lookup — ${
            sectorFrom.unplaced.length} companies: ${
            sectorFrom.unplaced.map((e) => e.name).join(", ")}`}>
          <span className="mono">{sectorFrom.unplaced.length}</span> unplaced ·{" "}
          <span className="mono">{fmtFromBase(sectorFrom.unplacedMV, { compact: true })}</span>
        </span>
      )}
    </div>
  );

  /**
   * ── WHAT THE ACTIVE SET IS MADE OF — three figures, stacked ────────────────
   * Each is a label, a figure and one line, and together they account for every
   * rupee: Consolidated splits measured from DERIVED (the one distinction that
   * decides whether a figure traces to a document), Direct Equity names what the
   * narrowing left out at its value. They were three cards across the full page
   * width; stacked in the left column beside the table they cost no height.
   */
  const partition = consolidatedView ? (
    <>
      <Figure label="Reported by their statements" value={fmtFromBase(measuredMV, { compact: true })}>
        {p.length} holdings · {fmtFromBase(mandateMV, { compact: true })} manager-chosen,
        {" "}{fmtFromBase(ownMV, { compact: true })} the family&rsquo;s own
      </Figure>
      <Figure label="Derived from what their funds disclose" tone="text-champagne-400/90"
        value={exposure.status === "ok"
          ? fmtFromBase(derivedMV, { compact: true })
          : <span className="text-slate-500">{exposure.status === "loading" ? "loading…" : "—"}</span>}>
        {exposure.status === "loading" ? <>Still reading the funds&rsquo; disclosures.</>
          : exposure.status === "unreachable" ? <span className="text-amber-400/80">The look-through store did not answer
            — a fact about the fetch, not the book.</span>
          /* "DERIVED, not a position" and "no part of the book's NAV" are the
             fence, in words rather than a tooltip — and they are ALL the line
             says now (Stage 10cp); how it is derived is its hover. */
          : <span title={`Their units' share of what ${exposure.covered} of ${exposure.considered} funds disclose.`}>
              DERIVED, not a position · <span className="text-slate-300">no part of the book&rsquo;s NAV</span>
            </span>}
      </Figure>
      <Figure label="Not on this page"
        value={exposure.status === "ok"
          ? fmtFromBase(portfolio.totalValue - measuredMV - derivedMV, { compact: true })
          : <span className="text-slate-500">—</span>}>
        {exposure.status === "ok"
          ? <span title={`The rest of the ${fmtFromBase(portfolio.totalValue, { compact: true })} book. No sector applies to it. These three figures cover every rupee.`}>
              Undisclosed vehicles, non-equity and cash
            </span>
          : <>Measurable once the funds&rsquo; disclosures answer.</>}
      </Figure>
    </>
  ) : (
    <>
      <Figure label="Bought by the family"
        value={ownRows.length > 0
          ? fmtFromBase(ownMV, { compact: true })
          : <AbsentCell reason="No company share on this page was bought in the family's own demat or broking account. Such accounts may still be in the book — this view counts only their company shares, not the fund or ETF units one may hold." />}>
        {/* THE COUNT ON ITS FACE; WHAT THE HOLDINGS TABLES CALL IT IS ITS
            HOVER (Stage 10cp). */}
        {ownRows.length > 0
          ? <span title={`The holdings tables call this “${DIRECT_EQUITY_BUCKET}”.`}>
              {ownRows.length} holdings across {ownAccounts} of their own {ownAccounts === 1 ? "account" : "accounts"}</span>
          : <>No own-account company share in this book.</>}
      </Figure>
      <Figure label="Left out by this view" value={fmtFromBase(mandateMV + otherMV, { compact: true })}>
        <span title="Real exposure — the manager chose these shares, and they are counted in the Consolidated view.">
          {mandateRows.length} shares a manager chose across {mandateAccounts} {mandateAccounts === 1 ? "mandate" : "mandates"}
          {otherRows.length > 0 && <>, {otherRows.length} with no stated route</>} · shown in{" "}
          <span className="text-slate-300">Consolidated</span></span>
      </Figure>
      {/* EACH CLASS WITH ITS OWN VALUE, on ONE line — the total alone cannot
          tell a reader whether the excluded money is one wrapper or a dozen, and
          `check:pages` strikes the reconstruction on these labelled figures. */}
      {/* THE CLASSES ON ITS FACE, WHY THEY ARE LEFT OUT IN ITS HOVER (Stage
          10cp) — the line read "excluded rather than folded in — … · a fund
          holds many companies, so none has a sector of its own". */}
      <Figure label="Not a company share" value={fmtFromBase(excludedMV, { compact: true })}>
        <span data-sector-excluded
          title="Excluded rather than folded in — a fund holds many companies, so none has a sector of its own.">
          {excluded.length === 0 ? "none" : excluded.map((c, i) => (
            <Fragment key={c.key}>
              {i > 0 && (i === excluded.length - 1 ? " and " : ", ")}
              <span className="text-slate-400">{assetClassLabel(c.key)}</span> {fmtFromBase(c.mv, { compact: true })}
            </Fragment>
          ))}
        </span>
      </Figure>
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Allocation" title="Sector Composition"
        beside={
          <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5"
            role="tablist" aria-label="Which set of sectors to show" data-sector-views>
            {SECTOR_VIEWS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={view === v.key} title={v.title}
                data-sector-view={v.key} onClick={() => setView(v.key)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${view === v.key
                  ? "bg-champagne-500 text-ink-950 shadow-glow"
                  : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                {v.label}
              </button>
            ))}
          </div>
        }
        /* ── NO PILLS ON THIS HEADER ────────────────────────────────────────
           *"remove the highlighted texts from the dashboard UI"* — pointed at
           the basis pill, its "N accounts behind" companion and the "N sectors"
           count. Audited before they went:

             · "N sectors" — every sector is a row of the table beside the
               chart, and the donut draws one wedge per sector;
             · the basis pill's hover — the MEASURED / DERIVED split is on the
               table's own column notes and the partition figures, and the
               Direct Equity narrowing is that tab's own hover;
             · the LIVE label and the as-of skew — NO SECOND HOME ON THIS PAGE.
               It is the fourth page to lose its <BasisPill> at the family's
               request (after Morning CIO, /holdings and Private Market), and
               CLAUDE.md §6 records it as a narrowing rather than glossing it.
               What did NOT move is the source: this page reads the same
               context it always has. */
        />

      {/* ── TWO HALVES: THE CHART AND ITS FIGURES LEFT, THE TABLE RIGHT ────────
          *"why not give this whole table of Sector breakdown next to this pie
           chart table by splitting the page into two parts right and left, you
           are unnecessarily taking a lot of realestate."*

          The legend that sat beside the donut is GONE, and nothing is lost with
          it: every row of it — swatch, sector, weight, value — is a row of the
          table beside the chart, which also sorts, expands and says where each
          figure came from. Two lists of the same twelve sectors on one screen
          was the real estate.

          Each half scrolls INSIDE itself on a short window, so the page does not
          scroll and the table's headings stay pinned — the Portfolio Monitor's
          shape. Below `lg` the two stack and the page scrolls, which is right on
          a phone. */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,5fr)] lg:grid-rows-[minmax(0,1fr)]"
        data-sector-layout={view}>
        {/* LEFT — the donut and what it is made of. On Compare it is the picker. */}
        <Card className="flex min-h-0 flex-col lg:max-h-full lg:self-start" pad={false}>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4" data-sector-left>
            {donut}
            {view === "compare" ? (
              <div className="mt-4" data-sector-picker>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="label-xs">Pick up to {MAX_COMPARE} sectors</div>
                  {compare.length > 0 && (
                    <button type="button" onClick={() => setPicked([])}
                      className="rounded-md border border-ink-700 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200">Clear</button>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-1">
                  {consSectors.map((s) => {
                    const on = compare.includes(s.key);
                    return (
                      <li key={s.key}>
                        <button type="button" onClick={() => togglePick(s.key)} aria-pressed={on} data-sector-pick={s.key}
                          title={s.key === UNCLASSIFIED ? unclassifiedWhy(true) : undefined}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] transition-colors ${on
                            ? "bg-champagne-500/15 text-slate-100"
                            : "text-slate-400 hover:bg-ink-700/40 hover:text-slate-200"}`}>
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(s.key), opacity: on ? 1 : 0.35 }} />
                          <span className="flex-1 truncate">{s.key}</span>
                          <span className="mono text-[11.5px] text-slate-500">{(s.weight * 100).toFixed(1)}%</span>
                          <Check className={`h-3.5 w-3.5 shrink-0 ${on ? "text-champagne-400" : "text-transparent"}`} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="mt-4" data-sector-partition>{partition}</div>
            )}
          </div>
          <div className="shrink-0 px-5 pb-4 pt-1">{sourceLine}</div>
        </Card>

        {/* RIGHT — the sector table, or the comparison. */}
        {view === "compare" ? (
          <Card className="flex min-h-0 flex-col lg:max-h-full lg:self-start" pad={false}
            title={<span data-card-title-hint title="Each set's figures side by side.">Compare sectors
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-500" data-compare-picked>{compare.length} of {MAX_COMPARE} picked</span></span>}>
            <div className="mt-3 min-h-0 flex-1 overflow-auto px-2 pb-3">
              {compare.length === 0 ? (
                <p className="px-3 py-10 text-center text-[12.5px] text-slate-500">
                  Pick a sector on the left — or click its wedge — to put it here.
                </p>
              ) : (
                /* Exempt, declared: this table is TRANSPOSED. Its rows are a fixed
                   list of metrics rather than records, so there is nothing to
                   sort, and its columns are the sectors the picker selected. */
                <table className="min-w-full text-[12.5px]" data-sector-compare
                  data-table-static="transposed — its rows are a fixed metric list rather than records, and its columns are the sectors the picker selected">
                  <thead>
                    <tr className="border-b border-ink-700">
                      <th className="label-xs w-44 px-3 py-2 text-left align-bottom font-medium">Metric</th>
                      {compare.map((k) => (
                        <th key={k} className="px-3 py-2 text-right align-bottom text-[11.5px] font-semibold leading-tight text-slate-200" data-compare-col={k}>
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: colorOf(k) }} />{k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/50">
                    <CompareGroup span={compare.length + 1}>Consolidated — total exposure</CompareGroup>
                    <CompareRow label="Total exposure" keys={compare} render={(k) => {
                      const s = consByKey.get(k);
                      return s ? money(s.mv) : <AbsentCell reason="no company this family is exposed to sits in this sector" />;
                    }} />
                    <CompareRow label="Weight of total exposure" keys={compare} render={(k) => {
                      const s = consByKey.get(k);
                      return s ? `${(s.weight * 100).toFixed(1)}%` : <AbsentCell reason="no exposure in this sector" />;
                    }} />
                    <CompareRow label="Reported by their statements" keys={compare} render={(k) => {
                      const s = consByKey.get(k);
                      if (!s) return <AbsentCell reason="no exposure in this sector" />;
                      /* A COMPUTED ZERO, AND ITS REASON IS IN THE CELL. A sector the
                         family reaches only through funds has nothing a statement
                         reports — a measured ₹0, not an absence — and a bare ₹0
                         beside a derived figure would read as a gap. */
                      return s.measured > 0 ? money(s.measured)
                        : <span>{money(0)} <span className="text-[10.5px] text-slate-500">only via funds</span></span>;
                    }} />
                    <CompareRow label="Via funds · derived" keys={compare} tone="text-champagne-400/90" render={(k) => {
                      const s = consByKey.get(k);
                      if (!s) return <AbsentCell reason="no exposure in this sector" />;
                      if (exposure.status !== "ok") return <AbsentCell reason="the funds' disclosures have not answered, so the derived half cannot be struck" />;
                      return s.derived > 0 ? money(s.derived)
                        : <AbsentCell reason="no fund this store can read discloses a company in this sector at a value" />;
                    }} />
                    <CompareRow label="Companies" keys={compare} render={(k) => consByKey.get(k)?.count ?? <AbsentCell reason="no exposure in this sector" />} />
                    <CompareRow label="Largest company" keys={compare} plain render={(k) => consByKey.get(k)?.top ?? <AbsentCell reason="no exposure in this sector" />} />

                    <CompareGroup span={compare.length + 1}>Direct Equity — the family&rsquo;s own shares</CompareGroup>
                    <CompareRow label="Value" keys={compare} render={(k) => {
                      const s = directByKey.get(k);
                      return s ? money(s.mv) : <AbsentCell reason="the family bought no share in this sector themselves — every holding in it is manager-chosen or held inside a fund" />;
                    }} />
                    <CompareRow label="Weight of Direct Equity" keys={compare} render={(k) => {
                      const s = directByKey.get(k);
                      return s ? `${(s.weight * 100).toFixed(1)}%` : <AbsentCell reason="no own-account holding in this sector" />;
                    }} />
                    <CompareRow label="Holdings" keys={compare} render={(k) => directByKey.get(k)?.holdings ?? <AbsentCell reason="no own-account holding in this sector" />} />
                    {/* THE COST NAMES ITS OWN COVERAGE, IN THE CELL. Where only some
                        holdings report one, the figure is theirs alone — printed bare
                        beside a value of all of them it would read as the sector's. */}
                    <CompareRow label="Cost reported" keys={compare} render={(k) => {
                      const s = directByKey.get(k);
                      if (!s) return <AbsentCell reason="no own-account holding in this sector" />;
                      return s.cost === null
                        ? <AbsentCell reason="No holding in this sector reports a cost — a depository statement carries a value and no basis" />
                        : <span title={`${s.costed} of the ${s.holdings} holdings in this sector report a cost; the figure is theirs alone`}>
                            {money(s.cost)}{s.costed < s.holdings && <span className="ml-1 text-[10.5px] text-slate-500">{s.costed} of {s.holdings}</span>}
                          </span>;
                    }} />
                    <CompareRow label="Return on cost" keys={compare} render={(k) => {
                      const s = directByKey.get(k);
                      if (!s) return <AbsentCell reason="no own-account holding in this sector" />;
                      return s.returnPct === null
                        ? <AbsentCell reason={s.returnWhy ?? "no return can be struck"} />
                        : <span className={changeColor(s.returnPct)}>{fmtPct(s.returnPct, { sign: true })}</span>;
                    }} />
                    <CompareRow label="Largest holding" keys={compare} plain render={(k) => directByKey.get(k)?.top ?? <AbsentCell reason="no own-account holding in this sector" />} />
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        ) : (
          <Card className="flex min-h-0 flex-col lg:max-h-full lg:self-start" pad={false}
            title={<span data-card-title-hint title={consolidatedView
              ? "Click a sector for the companies in it — what the statements report and what the funds disclose."
              : "Click a sector for its holdings."}>Sector breakdown</span>}>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-[13px]" data-sector-table>
                <thead className="sticky top-0 z-10 bg-ink-800">
                  <Tr view={sectorView} className="border-b border-ink-700">
                    <SortHeader col="sector" view={sectorView} align="left" pad="px-3 py-2">Sector</SortHeader>
                    <SortHeader col="value" view={sectorView} pad="px-3 py-2">Value</SortHeader>
                    <SortHeader col="weight" view={sectorView} pad="px-3 py-2">Weight</SortHeader>
                    <SortHeader col="count" view={sectorView} pad="px-3 py-2">{consolidatedView ? "Companies" : "Positions"}</SortHeader>
                    <SortHeader col="return" view={sectorView} pad="px-3 py-2">Return</SortHeader>
                    <SortHeader col="top" view={sectorView} align="left" pad="px-3 py-2">Top holding</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {sectorRows.map((s) => {
                    const isOpen = expanded.has(s.key);
                    const rows = sortRows(holdingsBySector[s.key] ?? [], holdingView.sort, {
                      security: (h) => h.security,
                      entity: (h) => ownerOf(accIdx, h),
                      heldVia: (h) => ROUTE_LABEL[routeOf(h)],
                      value: (h) => h.marketValue,
                      // A share of the sector's own value, so it orders as Value does.
                      share: (h) => h.marketValue,
                      return: (h) => (h.costUnavailable ? null : h.returnPct),
                    });
                    const companies = sortRows(companiesBySector[s.key] ?? [], companyView.sort, {
                      company: (e) => e.name,
                      measured: (e) => (e.positions.length ? e.measured : null),
                      derived: (e) => (e.derived > 0 ? e.derived : null),
                      total: (e) => e.total,
                      share: (e) => e.total,
                    });
                    return (
                      <Fragment key={s.key}>
                        <Tr view={sectorView} className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(s.key)} aria-expanded={isOpen}
                          data-sector-row={s.key}>
                          <td className="px-3 py-2">
                            {/* THE `title` GOES ON THE EXISTING SPAN, never on a new one
                                wrapping the name: this is a FLEX container, so an added
                                child becomes a flex ITEM and `innerText` breaks the line
                                at it — which would silently reshape every row-based
                                check on this page. */}
                            <span className="flex items-center gap-2 whitespace-nowrap font-medium text-slate-100"
                              title={s.key === UNCLASSIFIED ? unclassifiedWhy(consolidatedView) : undefined}>
                              <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(s.key) }} />
                              {s.key}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right mono text-slate-200 whitespace-nowrap" title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                            {liveBySector[s.key] ? fmtFromBase(s.mv, { compact: true })
                              : <Auditable formula={{ title: "Sector value", excel: "= Σ market value of the sector's holdings", plain: consolidatedView ? "Every company in this sector, added up — what the statements report plus the family's share of what their funds disclose." : "Every holding in this sector, added up.", worked: `= ${money(s.mv)} across ${s.count} ${consolidatedView ? "companies" : "holdings"}` }}>{fmtFromBase(s.mv, { compact: true })}</Auditable>}
                          </td>
                          <td className="px-3 py-2 text-right mono text-slate-400" title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                            {liveBySector[s.key] ? `${(s.weight * 100).toFixed(1)}%`
                              : <Auditable formula={weightFormula(s.mv, totalMV, s.weight * 100, money,
                                  /* The denominator is THIS page's set, not the book. */
                                  "the company shares on this page")}>{`${(s.weight * 100).toFixed(1)}%`}</Auditable>}
                          </td>
                          <td className="px-3 py-2 text-right mono text-slate-400" data-cell="count">{s.count}</td>
                          {/* A RETURN ONLY WHERE ITS OWN COLUMNS CAN CARRY ONE. Refused
                              throughout Consolidated (its value is part derived), and on
                              Direct Equity wherever the holdings that report a cost do not
                              account for the whole sector — each refusal with its reason. */}
                          <td className={`px-3 py-2 text-right mono ${changeColor(s.returnPct)}`} title={liveBySector[s.key] && s.returnPct !== null ? LIVE_CELL : undefined}
                            data-cell="return"
                            /* THE COVERAGE A RETURN IS GATED ON, carried on the cell
                               it gates, so `check:pages` can hold a printed return
                               to `costCoversSet` without re-implementing the three
                               sector tiers to learn which holdings a sector holds.
                               Direct Equity only: Consolidated strikes no cost. */
                            {...(consolidatedView ? {} : {
                              "data-costed": s.costed, "data-holdings": s.holdings,
                              "data-uncosted-mv": Math.round(s.uncostedMV ?? 0), "data-mv": Math.round(s.mv),
                            })}>
                            {s.returnPct === null
                              ? <AbsentCell reason={s.returnWhy ?? CONSOLIDATED_RETURN_WHY} />
                              : liveBySector[s.key] ? fmtPct(s.returnPct, { sign: true })
                              : <Auditable formula={{ title: "Sector return (FIFO)", excel: "= (Σ unrealised + Σ realised) ÷ Σ (cost held + cost of units sold) × 100", plain: "Every holding in this sector reports a cost. This is everything they have produced — the unrealised gain on what is held and the realised gain on units already sold, matched first-in, first-out — over every rupee that bought a unit of them.", worked: `= (${money(s.pnl)} + ${money(s.realised ?? 0)}) ÷ ${money(s.deployed)} × 100 = ${fmtPct(s.returnPct, { sign: true })}` }}>{fmtPct(s.returnPct, { sign: true })}</Auditable>}
                          </td>
                          <td className="px-3 py-2 text-left text-[12px] text-slate-400"><span className="block max-w-[170px] truncate" title={topHolding[s.key]}>{topHolding[s.key]}</span></td>
                        </Tr>
                        {isOpen && (
                          <tr className="bg-ink-900/50">
                            <td colSpan={SECTOR_COLS.length} className="px-3 pb-3 pt-1">
                              <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
                                <div className="max-h-[320px] overflow-auto">
                                  {consolidatedView ? (
                                    /* ONE ROW PER COMPANY, BOTH HALVES APART. A company only a
                                       fund discloses has no position, no quantity and no cost,
                                       and every measured cell on such a row is ABSENT WITH ITS
                                       REASON rather than ₹0. */
                                    <table className="min-w-full text-[12px]" data-sector-companies>
                                      <thead className="sticky top-0 bg-ink-800">
                                        <Tr view={companyView} className="border-b border-ink-700/70">
                                          <SortHeader col="company" view={companyView} align="left" pad="px-3 py-1.5">Company</SortHeader>
                                          <SortHeader col="measured" view={companyView} pad="px-3 py-1.5">Direct + PMS</SortHeader>
                                          <SortHeader col="derived" view={companyView} pad="px-3 py-1.5"
                                            title="DERIVED, not a position: the AMC disclosed what the fund holds and this is the family's units' share of it. It is no part of the book's NAV — the fund's own value already stands for it there.">Via funds · derived</SortHeader>
                                          <SortHeader col="total" view={companyView} pad="px-3 py-1.5">Total exposure</SortHeader>
                                          <SortHeader col="share" view={companyView} pad="px-3 py-1.5">% of sector</SortHeader>
                                        </Tr>
                                      </thead>
                                      <tbody className="divide-y divide-ink-700/50">
                                        {companies.map((e) => (
                                          <Tr view={companyView} key={e.key} className="hover:bg-ink-700/30" data-sector-company={e.key}>
                                            <td className="px-3 py-1.5 text-slate-200">
                                              {e.positions.length > 0
                                                ? <StockLink securityKey={e.key} name={e.name} />
                                                : <span title="The family holds this company only inside a fund, so the book carries no position for it and it has no page of its own.">{e.name}</span>}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono text-slate-100">
                                              {e.positions.length > 0
                                                ? fmtFromBase(e.measured, { compact: true })
                                                : <AbsentCell reason="No statement in this book reports this company as a holding — the family owns it only through a fund, and what a fund holds is disclosed by the AMC rather than reported about this family." />}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono text-champagne-400/90">
                                              {e.derived > 0
                                                ? fmtFromBase(e.derived, { compact: true })
                                                : <AbsentCell reason="No fund this store can read discloses this company at a value; the AIF folios disclose nothing at all." />}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono font-medium text-slate-100">{fmtFromBase(e.total, { compact: true })}</td>
                                            <td className="px-3 py-1.5 text-right mono text-slate-400">
                                              {s.mv > 0 ? ((e.total / s.mv) * 100).toFixed(1) : "0.0"}%
                                            </td>
                                          </Tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <table className="min-w-full text-[12px]">
                                      <thead className="sticky top-0 bg-ink-800">
                                        <Tr view={holdingView} className="border-b border-ink-700/70">
                                          <SortHeader col="security" view={holdingView} align="left" pad="px-3 py-1.5">Security</SortHeader>
                                          <SortHeader col="entity" view={holdingView} align="left" pad="px-3 py-1.5">Entity</SortHeader>
                                          {/* Every row is own-account in this view by construction,
                                              and the column stays: a reader switching from
                                              Consolidated needs to see that per row rather than
                                              take a caption's word for it. */}
                                          <SortHeader col="heldVia" view={holdingView} align="left" pad="px-3 py-1.5">Held via</SortHeader>
                                          <SortHeader col="value" view={holdingView} pad="px-3 py-1.5">Market value</SortHeader>
                                          <SortHeader col="share" view={holdingView} pad="px-3 py-1.5">% of sector</SortHeader>
                                          <SortHeader col="return" view={holdingView} pad="px-3 py-1.5">Return</SortHeader>
                                        </Tr>
                                      </thead>
                                      <tbody className="divide-y divide-ink-700/50">
                                        {rows.map((h) => (
                                          <Tr view={holdingView} key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/30">
                                            <td className="px-3 py-1.5 text-slate-200"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                                            <td className="px-3 py-1.5 text-slate-400">{ownerOf(accIdx, h)}</td>
                                            <td className="px-3 py-1.5 text-[11.5px] text-slate-500" title={ROUTE_NOTE[routeOf(h)]}>{ROUTE_LABEL[routeOf(h)]}</td>
                                            <td className="px-3 py-1.5 text-right mono text-slate-100" title={h.live ? LIVE_CELL : undefined}>
                                              {fmtFromBase(h.marketValue, { compact: true })}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono text-slate-400" title={h.live ? LIVE_CELL : undefined}>
                                              {h.live ? `${s.mv > 0 ? ((h.marketValue / s.mv) * 100).toFixed(1) : "0.0"}%`
                                                : <Auditable formula={{ title: "% of sector", excel: "= Market value ÷ Sector value × 100", plain: "How big this holding is as a share of its sector.", worked: `= ${money(h.marketValue)} ÷ ${money(s.mv)} × 100 = ${(s.mv > 0 ? (h.marketValue / s.mv) * 100 : 0).toFixed(1)}%` }}>{s.mv > 0 ? ((h.marketValue / s.mv) * 100).toFixed(1) : "0.0"}%</Auditable>}
                                            </td>
                                            <td className={`px-3 py-1.5 text-right mono ${h.costUnavailable || h.costBasis == null ? "text-slate-500" : changeColor(h.returnPct)}`} title={h.live && !h.costUnavailable ? LIVE_CELL : undefined}>
                                              {h.costUnavailable || h.costBasis == null
                                                ? <AbsentCell reason="this holding's statement reports no cost — a depository holds the shares, it did not buy them" />
                                                : h.live ? fmtPct(h.returnPct, { sign: true })
                                                : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money, { realised: h.realizedPnL, costSold: h.costOfUnitsSold })}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}
                                            </td>
                                          </Tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/** One labelled figure in the left column — a label, a figure and one line saying what it covers. */
function Figure({ label, value, children, tone = "text-slate-100" }: {
  label: string; value: React.ReactNode; children: React.ReactNode; tone?: string;
}) {
  return (
    <div className="border-t border-ink-700/60 py-2.5 first:border-t-0 first:pt-0">
      <div className="label-xs">{label}</div>
      <div className={`mono text-[15px] font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{children}</div>
    </div>
  );
}

/** A group heading inside the transposed comparison — which SET the rows below are on. */
function CompareGroup({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr className="bg-ink-900/40" data-compare-group>
      <td colSpan={span} className="label-xs px-3 pb-1 pt-2.5 text-champagne-400/80">{children}</td>
    </tr>
  );
}

/** One metric across the picked sectors. `plain` for a name rather than a figure. */
function CompareRow({ label, keys, render, tone = "text-slate-200", plain = false }: {
  label: string; keys: string[]; render: (key: string) => React.ReactNode; tone?: string; plain?: boolean;
}) {
  return (
    <tr data-compare-row={label}>
      <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{label}</td>
      {keys.map((k) => (
        <td key={k} className={`whitespace-nowrap px-3 py-1.5 text-right ${plain ? "text-[12px] text-slate-300" : `mono ${tone}`}`}>
          {plain ? <span className="inline-block max-w-[130px] truncate align-bottom">{render(k)}</span> : render(k)}
        </td>
      ))}
    </tr>
  );
}
