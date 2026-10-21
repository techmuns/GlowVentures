import { Fragment, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Check, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import {
  sum, sumOrNull, consolidatedMarketValue, isCompanyShare, excludedClasses, assetClassLabel, currentHoldings,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE, DIRECT_EQUITY_BUCKET,
  holdingBucket, bucketLabel, MANDATE_BUCKET, droppedHoldings, isFundVehicle, CASH_EQUIVALENT_KEYS,
} from "@/lib/analytics";
import { accountIndex, ownerOf, engagementOf } from "@/lib/accounts";
import { useStockExposure } from "@/lib/useStockExposure";
import { fifoTotals } from "@/lib/fifo";
import { companyExposure, companySymbol, type CompanyExposure } from "@/lib/lookthrough";
import { isArbitrageFund } from "@/lib/fundNavs";
import { UNCLASSIFIED, GICS_SECTORS } from "@/lib/sectors";
import { useViewParam, type ViewDef } from "@/components/ViewToggle";
import { fmtPct, fmtCurrency, changeColor, fmtDate } from "@/lib/format";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { heldRouteOf, measuredSplit, HELD_ROUTE_NOTE, type MeasuredSplit } from "@/lib/heldThrough";
import { useTableView, sortRows } from "@/lib/tableView";
import { withReviewAccessors } from "@/lib/reviewColumns";
import { BENCHMARKS, type BenchmarkKey } from "@/lib/benchmarks";
import { indexSectors, indexSectorFrom, type IndexSectorRow } from "@/lib/indexSectors";
import type { Position } from "@/lib/types";

/** The sector table's columns, in the order its rows write their cells. */
const SECTOR_COLS = ["sector", "value", "weight", "count", "return", "top"] as const;
/**
 * ...and with an index set beside it (Stage 10fe): the index's own weight in
 * each sector, and the family's difference from it in points, right after the
 * family's weight so the three read together.
 */
const SECTOR_COLS_VS = ["sector", "value", "weight", "index", "active", "count", "return", "top"] as const;
/**
 * ...and the two breakouts a sector row opens into. An issuer row carries its
 * measured half split by who chose the shares — the family's own account, a
 * PMS manager — beside the derived fund half, so the three never read as one.
 */
const SECTOR_COMPANY_COLS = ["company", "direct", "pms", "derived", "total", "share"] as const;
const SECTOR_COMPANY_COLS_OTHER = ["company", "direct", "pms", "other", "derived", "total", "share"] as const;
const SECTOR_HOLDING_COLS = ["security", "entity", "heldVia", "value", "share", "return"] as const;
/** Why an issuer's route cell is empty when a statement does report it — through the other route. */
const ROUTE_ABSENT: Record<"direct" | "manager" | "other", string> = {
  direct: "No own demat or broking statement reports this issuer — the statements that do are the other accounts on this row.",
  manager: "No PMS mandate's statement reports this issuer — the statements that do are the other accounts on this row.",
  other: "Every statement reporting this issuer is the family's own account or a PMS mandate.",
};
/** ...and the sector's footer, where no issuer in it takes the route. */
const ROUTE_ABSENT_SECTOR: Record<"direct" | "manager" | "other", string> = {
  direct: "no own demat or broking statement reports any issuer in this sector",
  manager: "no PMS mandate's statement reports any issuer in this sector",
  other: "no issuer in this sector is reported by an account other than the family's own or a PMS mandate",
};
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { Auditable } from "@/components/Auditable";
import { returnFormula, weightFormula } from "@/lib/auditFormulas";
import { AbsentCell, AbsentSection } from "@/components/Absent";

/** The NAV chart's series colours, so the book and the index are the same two colours on both tabs. */
const BOOK_COLOR = "var(--chart-book, #d9c48f)";
const INDEX_COLOR = "var(--chart-index, #6366f1)";

/**
 * WHERE A LIVE FIGURE'S COST COMES FROM (FS-24). It read "Cost basis comes from
 * the ledger … it has no workbook cell to trace to" — the words of a
 * workbook-sourced cockpit. This book is read from statements.
 */
const LIVE_CELL = "Recalculated from live prices. The cost basis is the statements'; this figure is worked out from a live quote, so no statement prints it.";

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
const unclassifiedWhy = (consolidatedView: boolean, mix?: IssuerMix) => {
  if (!consolidatedView) {
    return "Left unclassified rather than assigned a sector we would have to guess. These are shares in companies, so the sector "
      + "exists; the statement simply does not report it. A depository prints an ISIN, a quantity and a rate and no industry at all.";
  }
  const base = "Left unclassified rather than assigned a sector we would have to guess: neither the family's own statement nor any "
    + "fund disclosure that names these issuers printed one, and screener.in placed none of them.";
  if (!mix) return base;
  const n = mix.shares + mix.debtOnly + mix.other;
  const parts = [
    mix.debtOnly > 0 && `${mix.debtOnly} ${mix.debtOnly === 1 ? "is" : "are"} reached only through debt paper — ${DEBT_PAPER} — `
      + "where a fund's filing prints a credit rating in place of an industry",
    mix.shares > 0 && `${mix.shares} ${mix.shares === 1 ? "is a share" : "are shares"}, whose sector exists and no source here reports`,
    mix.other > 0 && `${mix.other} ${mix.other === 1 ? "is a line" : "are lines"} a fund's filing classes as neither equity nor debt`,
  ].filter(Boolean);
  return parts.length ? `${base} Of these ${n}, ${parts.join("; ")}.` : base;
};

/**
 * ── WHAT A CONSOLIDATED ROW IS HELD AS (FS-13) ──────────────────────────────
 *
 * Since Stage 10as a Consolidated row is an ISSUER, reached through a share, a
 * bond, a CD or a bill alike — so "companies" is true of some rows and false of
 * the rest (the Government of India's T-bills are a row), and "these are shares
 * in companies, so the sector exists" was false of every row reached only
 * through debt paper, where a fund's filing prints a credit RATING in the
 * column a share's industry sits in. Counted off each row's own classes — the
 * statement reports a share; a filing says what each line it discloses is —
 * never inferred from a name.
 */
type IssuerMix = { shares: number; debtOnly: number; other: number };
function issuerMix(list: readonly CompanyExposure[]): IssuerMix {
  const mix: IssuerMix = { shares: 0, debtOnly: 0, other: 0 };
  for (const e of list) {
    if (e.classes.includes("Equity")) mix.shares += 1;
    else if (e.classes.includes("Debt")) mix.debtOnly += 1;
    else mix.other += 1;
  }
  return mix;
}
const DEBT_PAPER = "bonds, CDs, commercial paper, bills";

/** Why Consolidated strikes no return: its value is part measured, part derived. */

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
    title: "Every issuer this family is exposed to — the shares their statements report, plus their share of every instrument their funds disclose: shares, bonds, CDs, commercial paper and bills." },
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
   * behind the return (cost held + cost of units sold), over the costed holdings.
   */
  realised: number | null; deployed: number | null;
  /**
   * …and the two other terms of the same FIFO gain, as `fifoTotals` struck
   * them: the unrealised gain (value − cost held, over the costed holdings)
   * and the dividends they paid (Stage 10fb). The popover's worked line adds
   * exactly these, so it reproduces the return beside it (Stage 10fx).
   */
  unrealised: number | null; income: number | null;
  /** Holdings behind the sector that report a cost, and how many there are. */
  costed: number; holdings: number;
  /**
   * The part of the sector's MEASURED value whose holdings report NO cost. On
   * Consolidated the derived fund half carries no cost either and is
   * `mv − costedMV − uncostedMV`; the return's hover names both.
   */
  uncostedMV: number;
  /** The value of the holdings that report a cost — the set the return covers. */
  costedMV: number;
  /** Why no return is struck, where none is — never a bare dash. */
  returnWhy: string | null;
  /** The largest company (Consolidated) or holding (Direct Equity). */
  top: string | null;
  /**
   * …and its key, and whether the family holds it ONLY inside a fund (FS-14).
   * Ranked on total exposure, the largest issuer in a sector can be one no
   * statement reports — the book's own Materials, Communication Services and
   * Real Estate rows are each headed by one — and a column called "Top
   * holding" over it asserted a position the fence says it is not.
   */
  topKey: string | null;
  topDerivedOnly: boolean;
};

/**
 * ── ONE ROLLUP, TWO SETS ─────────────────────────────────────────────────────
 *
 * Consolidated rolls up COMPANIES (the measured half plus a derived one);
 * Direct Equity rolls up the family's own shares. On both, the return is FIFO
 * over the holdings whose statement reports a cost, and the cell names that set
 * ("N of M") — Stage 10dt. The derived fund half and a depository's costless
 * rows carry no cost, so they are named in the hover and never blended in.
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
      /*
       * THE RETURN IS FIFO OVER THE HOLDINGS THAT REPORT A COST, ON BOTH VIEWS,
       * AND IT SAYS WHICH. Every cell of this column used to be a dash: on
       * Consolidated because its value is part derived, and on Direct Equity
       * wherever the costed holdings did not cover the whole sector — which on
       * this book is every sector but one. A column of dashes answers nothing
       * about how a sector has done. The figure is now struck over the costed
       * holdings alone (`fifoTotals` over exactly those rows, so it covers them
       * fully), the B-07 rule the whole-book return on cost already follows:
       * the cell names its set ("N of M"), and its hover names the value it
       * covers and what the rest is — holdings no statement prices at cost,
       * and on Consolidated the derived fund half, which carries no cost at all.
       * A dash remains only where NO holding in the sector reports a cost.
       */
      const costedRows = positions.filter((x) => typeof x.costBasis === "number" && !x.costUnavailable);
      const cost = sumOrNull(costedRows.map((x) => x.costBasis));
      const pnl = sumOrNull(costedRows.map((x) => x.unrealizedPnL));
      const costedMV = sum(costedRows.map((x) => x.marketValue));
      const uncostedMV = sum(positions.filter((x) => !costedRows.includes(x)).map((x) => x.marketValue));
      // FIFO: the unrealised gain on what is held AND the realised gain on units
      // already sold, over every rupee that bought a unit — never the survivors
      // alone. `fifoTotals` is the one place a set becomes a return.
      const fifo = fifoTotals(costedRows);
      const returnPct = costedRows.length > 0 && fifo.returnPct !== null ? fifo.returnPct : null;
      const topPos = [...positions].sort((a, b) => b.marketValue - a.marketValue)[0] ?? null;
      const returnWhy = returnPct !== null ? null
        : positions.length === 0
          ? "The family reaches this sector only through their funds, and a fund's disclosure carries no cost — there is nothing to strike a return against."
          : costedRows.length === 0
            ? "No holding in this sector reports a cost — a depository statement carries a value and no basis, so there is nothing to strike a return against."
            : "The holdings that report a cost carry no capital deployed to strike a return against.";
      return {
        key, mv: v.mv, count: withCost ? positions.length : v.entries.length, weight: tot > 0 ? v.mv / tot : 0,
        measured, derived, cost, pnl, returnPct, realised: fifo.realised, deployed: fifo.deployed,
        unrealised: fifo.unrealised, income: fifo.income,
        costed: costedRows.length, holdings: positions.length, uncostedMV, costedMV,
        returnWhy,
        top: withCost ? topPos?.security ?? null : byValue[0]?.name ?? null,
        topKey: withCost ? topPos?.securityKey ?? null : byValue[0]?.key ?? null,
        topDerivedOnly: !withCost && !!byValue[0] && byValue[0].positions.length === 0,
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

/** Which holdings a sector's return covers, in words — the cell's hover. */
function returnCoverage(s: SectorRow, consolidated: boolean, fmt: (v: number) => string): string {
  const derived = Math.max(0, s.mv - s.costedMV - s.uncostedMV);
  const parts = [`FIFO over the ${s.costed} of ${s.holdings} holding${s.holdings === 1 ? "" : "s"} that report a cost — ${fmt(s.costedMV)} of the sector's ${fmt(s.mv)}`];
  if (s.uncostedMV >= 1) parts.push(`${fmt(s.uncostedMV)} is held where the statement reports no cost (a depository)`);
  if (consolidated && derived >= 1) parts.push(`${fmt(derived)} is the family's derived share inside their funds, which carries no cost`);
  return parts.join("; ");
}

/**
 * ── THE SAME PAGE, EMBEDDED AS A MORNING CIO PANEL ───────────────────────────
 *
 *   *"next to daily movers add a new tab sector composition … in the tab give
 *    option to select either consolidated view or direct equity. Do not add the
 *    compare sectors tab."*
 *
 * The Morning CIO "Sector Composition" panel is THIS component, not a second
 * copy of it — the donut, the figures, the source line and the sector table are
 * one implementation, so the tab and `/sectors` can never disagree about what a
 * sector is worth. Two things differ, and both are props rather than forks:
 *
 *   · `embedded` drops the PageHeader (the panel already sits under Morning
 *     CIO's own headline and KPI strip) and renders the view toggle inline, at
 *     the top of the panel, which is where the family asked for it.
 *   · `views` is `EMBED_SECTOR_VIEWS` there — Consolidated and Direct Equity
 *     only. Compare sectors is a reading of BOTH sets side by side and the
 *     family explicitly asked for it to stay off the tab; with it out of the
 *     list `useViewParam` falls an old `?view=compare` link back to
 *     Consolidated rather than to a tab that is not offered.
 *
 * MEMBER SCOPE NEEDS NO WIRING. Every figure is read from `consolidated` /
 * `portfolio`, which `PortfolioContext` has already scoped to the members the
 * TopBar selector holds (`?members=`). So selecting one family member, or
 * several, narrows this panel exactly as it narrows the standalone page — the
 * whole of what the family asked for, for free.
 */
const EMBED_SECTOR_VIEWS = SECTOR_VIEWS.filter((v) => v.key !== "compare");

/**
 * ── VERSUS AN INDEX (Stage 10fe) ─────────────────────────────────────────────
 *
 *   *"they should be able to compare the allocation of their own portfolio …
 *    just how there is an option to compare nav of the portfolio with the
 *    indexes performance. They should be able to select the index."*
 *
 * THE NAV CHART'S INDICES, BY THE NAV CHART'S KEYS (`BENCHMARKS`), so an index
 * is one thing on both tabs. Their sector weights are the publisher's own
 * factsheet, placed in GICS sectors by the map the book's own sectors go
 * through — `indexSectors.ts` says how, and why the two BSE indices are offered
 * and absent.
 *
 * ORTHOGONAL TO THE SET. Consolidated or Direct Equity is WHAT of the family's
 * is weighed; the index is what it is weighed against. So it is a second
 * control rather than a third tab, and works on either set.
 *
 * "OFF" FIRST, AND PARAM-FREE (`?vs=`), so `/sectors` and the Morning CIO tab
 * open on the family's allocation alone as they always have — and every check
 * written against that table still reads the columns it was written against.
 */
type IndexPick = "off" | BenchmarkKey;
const INDEX_PICKS: readonly ViewDef<IndexPick>[] = [
  { key: "off", label: "Off", title: "The family's sector allocation on its own." },
  ...BENCHMARKS.map((b): ViewDef<IndexPick> => {
    const ix = indexSectors(b.key);
    return {
      key: b.key, label: b.label,
      title: ix.ok
        ? `${b.name} — its sector weights as ${ix.publisher}'s factsheet of ${fmtDate(ix.asOf)} prints them, set beside the family's.`
        : `${b.name} — ${ix.reason}`,
    };
  }),
];

/** A difference in weight, in percentage points — never a percent of a percent. */
const fmtPts = (d: number) => {
  const r = Math.round(d * 1000) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)} pp`;
};

/**
 * A sector the INDEX holds and the active set does not: a COMPUTED zero on the
 * family's side, drawn as a row so the index column adds to the whole index and
 * the largest underweight of all — a sector with nothing in it — is not missing.
 */
function emptySector(key: string): SectorRow {
  return {
    key, mv: 0, count: 0, weight: 0, measured: 0, derived: 0,
    cost: null, pnl: null, returnPct: null, realised: null, deployed: null, unrealised: null, income: null,
    costed: 0, holdings: 0, uncostedMV: 0, costedMV: 0,
    returnWhy: "The family holds nothing this view places in this sector, so there is no return to strike.",
    top: null, topKey: null, topDerivedOnly: false,
  };
}

export function SectorComposition({ embedded = false }: { embedded?: boolean } = {}) {
  const views = embedded ? EMBED_SECTOR_VIEWS : SECTOR_VIEWS;
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency, scope: memberScope } = usePortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [vsKey, setVs] = useViewParam<IndexPick>(INDEX_PICKS, {}, "vs");
  /** The index picked, read — or why it has no weights. `null` while the control is Off. */
  const vsIndex = vsKey === "off" ? null : indexSectors(vsKey);
  const sectorView = useTableView("sectors", vsIndex?.ok ? SECTOR_COLS_VS : SECTOR_COLS, { reviewKind: "sector" });
  /**
   * AN "OTHER ACCOUNTS" COLUMN ONLY WHERE THE BOOK HAS ONE. A company share in
   * an account that is neither the family's own nor a PMS mandate is named in
   * its own column rather than folded into Direct — and none is in this drop,
   * so a column of dashes is not drawn for it.
   */
  const otherRouteHeld = useMemo(() => {
    if (!portfolio) return false;
    const idx = accountIndex(portfolio.accounts);
    return currentHoldings(consolidated)
      .some((x) => isCompanyShare(x) && heldRouteOf(holdingRoute(engagementOf(idx, x) || null)) === "other");
  }, [portfolio, consolidated]);
  const companyView = useTableView("sector-companies", otherRouteHeld ? SECTOR_COMPANY_COLS_OTHER : SECTOR_COMPANY_COLS);
  const holdingView = useTableView("sector-holdings", SECTOR_HOLDING_COLS, { reviewKind: "holding" });
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
  /** One issuer's measured half by route — the Direct / PMS cells of the drill-down. */
  const splitOf = (e: CompanyExposure): MeasuredSplit => measuredSplit(e.positions, routeOf);
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
  /**
   * ── …NAMED ON THE HOLDINGS TABLES' OWN AXIS (FS-7) ──
   *
   * `excludedClasses` names what a holding IS; the Portfolio Monitor and
   * Morning CIO section by `holdingBucket`, which counts a mandate's cash sleeve
   * inside the mandate. `readerClassOf` already files a liquid or arbitrage fund
   * under Cash on both, so the one label left carrying two values was Cash: this
   * card read "Cash ₹89.6 Cr" beside a Monitor whose CASH section reads ₹78 Cr,
   * the other ₹11.6 Cr being the mandates' own cash, counted in PMS mandates
   * (measured on the live book, which values the depository's cash-equivalent
   * units at AMFI's NAV).
   *
   * So the card lists the sections the holdings tables draw and names the sleeve
   * by where it is counted — every label here carries the value that label has
   * on the Monitor. Still ONE set with the covered half, so the partition holds.
   */
  const bucketOfRow = (x: Position) => holdingBucket(x, engagementOf(accIdx, x) || null);
  const nonShares = heldConsolidated.filter((x) => !isCompanyShare(x));
  const excluded = (() => {
    const m = new Map<string, { mv: number; count: number }>();
    for (const x of nonShares) {
      const k = bucketOfRow(x);
      if (k === MANDATE_BUCKET) continue;   // the sleeve, named by where it is counted
      const e = m.get(k) ?? { mv: 0, count: 0 };
      e.mv += x.marketValue; e.count += 1;
      m.set(k, e);
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.mv - a.mv);
  })();
  const sleeveRows = nonShares.filter((x) => bucketOfRow(x) === MANDATE_BUCKET);
  const sleeveMV = sum(sleeveRows.map((x) => x.marketValue));
  const sleeveClasses = excludedClasses(sleeveRows, () => false);
  const sleeveWhat = sleeveClasses.length === 1
    ? assetClassLabel(sleeveClasses[0].key).toLowerCase()
    : sleeveClasses.map((c) => assetClassLabel(c.key)).join(" and ");
  const excludedMV = sum(excluded.map((c) => c.mv)) + sleeveMV;

  /**
   * WHY THE CARD'S CONTENTS HAVE NO SECTOR, SAID OF WHAT IT CARRIES (FS-24). It
   * read "a fund holds many companies, so none has a sector of its own" over a
   * list whose largest part is Cash — the liquid and arbitrage funds the family
   * counts as cash, their cash lines and the mandates' own cash — none of which
   * is a fund holding companies. Each clause is stated only where the card
   * carries what it is about.
   */
  const excludedWhy = (() => {
    const FUND_SECTIONS = new Set(["AIF", "Mutual Fund", "ETF"]);
    const fund = excluded.some((c) => FUND_SECTIONS.has(c.key));
    const cash = excluded.some((c) => c.key === "Cash") || sleeveRows.length > 0;
    const other = excluded.some((c) => c.key !== "Cash" && !FUND_SECTIONS.has(c.key));
    const clauses = [
      fund && "a fund's units are a share of a portfolio rather than of one company",
      cash && "what the family counts as cash is money",
      other && "the rest is neither a share in a company nor a fund",
    ].filter(Boolean) as string[];
    if (!clauses.length) return "Nothing is left out: every holding here is a share in a company.";
    const said = clauses.length === 1 ? clauses[0]
      : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
    return `Excluded rather than folded in — ${said}, so none has a sector of its own.`;
  })();

  const [view, setView] = useViewParam<SectorView>(views);
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
    // ON THE VIEW'S OWN BASIS: Direct Equity values a row at what the family's
    // own statements report, so its unplaced figure must not carry the derived
    // rupees their funds add to the same company on the Consolidated view.
    const unplacedMV = unplaced.reduce((a, e) => a + (consolidatedView ? e.total : e.measured), 0);
    return { book, disc, vendor, unplaced, unplacedMV };
  }, [entries, consolidatedView]);
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

  /**
   * ── THE ACTIVE SET AGAINST THE INDEX (Stage 10fe) ──────────────────────────
   *
   * Never on Compare, which reads both sets at once and has no single weight to
   * set an index against. The family's weight is the SAME figure as the Weight
   * column — this set's own total, Unclassified included — so a row never shows
   * one sector at two weights; what that leaves unplaced is named on the
   * Unclassified row, which takes no difference (a gap in classification is not
   * a position against the index).
   */
  const vs = view !== "compare" && vsIndex?.ok ? vsIndex : null;
  const idxBy = new Map<string, IndexSectorRow>((vs?.rows ?? []).map((r) => [r.sector, r]));
  /** Every sector the index holds and this set does not, as a computed-zero row. */
  const indexOnly = vs ? vs.rows.filter((r) => !sectors.some((s) => s.key === r.sector)).map((r) => emptySector(r.sector)) : [];
  const tableSectors = [...sectors, ...indexOnly];
  /** The index's weight in a sector: its factsheet's, or a computed zero where it lists none. */
  const indexWeightOf = (key: string) => idxBy.get(key)?.weight ?? 0;
  /**
   * ── WHAT IS WEIGHED AGAINST AN EQUITY INDEX, AND OVER WHAT (Stage 10fx) ───
   *
   * TWO DEFECTS, ONE PLACE. The family's weight was its share of the WHOLE
   * set, Unclassified included, while the index's sectors sum to 100% — so the
   * classified sectors summed to 100% − U and every active weight was biased
   * by −U: Direct Equity carries ₹106.25 Cr with 11.8% unplaced (Yash
   * Highvoltage ₹12.54 Cr alone), and Financials' 39.2% against Nifty 50's
   * 37.45% read +1.8 pp where, over the classified shares, it is 44.4% and
   * +7.0 pp. And on Consolidated the set is every issuer reached through
   * anything — the liquid funds' paper, the balanced-advantage debt sleeves,
   * bank CDs filed under the bank's own equity key — none of which an equity
   * index holds.
   *
   * So while an index is picked, the family's side is its EQUITY SLEEVE —
   * the shares its statements report plus the equity lines of its funds
   * (`CompanyExposure.derivedEquity`: no debt paper, no cash-equivalent
   * scheme, no balanced-advantage equity disclosed gross of its hedges) — and
   * every classified sector's Weight and Over / under is struck over the
   * CLASSIFIED sleeve. Unclassified stays a named residual, its share of the
   * whole sleeve, with no active weight. Off, the Weight column is what it
   * always was.
   */
  const sleeveOf = (e: CompanyExposure) => (consolidatedView ? e.measured + e.derivedEquity : e.measured);
  const sleeveBySector = new Map<string, number>();
  for (const e of entries) {
    const k = e.sector || UNCLASSIFIED;
    sleeveBySector.set(k, (sleeveBySector.get(k) ?? 0) + sleeveOf(e));
  }
  const sleeveTotal = [...sleeveBySector.values()].reduce((a, v) => a + v, 0);
  const sleeveUnplaced = sleeveBySector.get(UNCLASSIFIED) ?? 0;
  const sleeveClassified = sleeveTotal - sleeveUnplaced;
  /** What the comparison leaves out of the family's side, by why (Consolidated only). */
  const sleeveLeftOut = consolidatedView
    ? { debtAndCash: entries.reduce((a, e) => a + Math.max(0, e.derived - e.derivedEquity - e.derivedGross), 0),
        gross: entries.reduce((a, e) => a + e.derivedGross, 0) }
    : { debtAndCash: 0, gross: 0 };
  /** A sector's sleeve and the denominator it is weighed over — the classified sleeve, or for the residual the whole. */
  const vsSleeveOf = (s: SectorRow) => sleeveBySector.get(s.key) ?? 0;
  const vsBaseOf = (s: SectorRow) => (s.key === UNCLASSIFIED ? sleeveTotal : sleeveClassified);
  /** THE WEIGHT A ROW PRINTS — the comparison's while an index is picked, the set's own otherwise. */
  const rowWeight = (s: SectorRow) => {
    if (!vs) return s.weight;
    const base = vsBaseOf(s);
    return base > 0 ? vsSleeveOf(s) / base : 0;
  };
  /** The family's difference from the index, in points — none for the unplaced. */
  const activeOf = (s: SectorRow) => (s.key === UNCLASSIFIED ? null : rowWeight(s) - indexWeightOf(s.key));
  /** What the comparison's family side is, and what it leaves out — the Weight header's hover while an index is picked. */
  const vsBasisNote = vs ? [
    `Weighed against ${vs.bench.name}: the family's equity ${consolidatedView ? "— the shares their statements report plus the equity lines their funds disclose —" : "shares"}, each classified sector over the classified ${money(sleeveClassified)}`,
    sleeveUnplaced > 0 ? `${money(sleeveUnplaced)} no source placed in a sector is the Unclassified residual, its share of the whole ${money(sleeveTotal)}, with no over / under` : "",
    sleeveLeftOut.debtAndCash >= 1 ? `left out: ${money(sleeveLeftOut.debtAndCash)} the funds disclose as debt paper (bonds, CDs, commercial paper, bills) or hold in cash-equivalent schemes — no part of an equity index` : "",
    sleeveLeftOut.gross >= 1 ? `and ${money(sleeveLeftOut.gross)} of equity in balanced-advantage and equity-savings funds, which their filings disclose gross of the derivative hedges they run, so the net equity is not known` : "",
  ].filter(Boolean).join(" · ") : "";
  const vsSetName = consolidatedView ? "total exposure" : "Direct Equity";

  /**
   * THE TABLE'S OWN ORDER. `sectors` keeps the chart's ordering — the donut reads
   * it, and the swatch colour is keyed on a sector's place in it — so the table
   * sorts a copy and never that array.
   */
  const sectorRows = sortRows(tableSectors, sectorView.sort, withReviewAccessors<typeof sectors[number]>({
    sector: (x) => x.key,
    value: (x) => x.mv,
    // Weight is this sector's value over the page's, so it orders as Value does.
    weight: (x) => (vs ? rowWeight(x) : x.mv),
    index: (x) => (vs ? indexWeightOf(x.key) : null),
    active: (x) => (vs ? activeOf(x) : null),
    count: (x) => x.count,
    return: (x) => x.returnPct,
    top: (x) => x.top,
  }, (s) => ({ sector: s.key }), memberScope.owners !== null));

  /**
   * THE COLOUR FOLLOWS THE SECTOR, NOT THE ROW. `CHART_COLORS[i % n]` keyed on a
   * rendered index would repaint every swatch the moment a reader sorted the
   * table, and the donut beside it would stop matching. The index is the
   * sector's place in the CONSOLIDATED order, on every tab, so one sector is one
   * colour whichever set or comparison it appears in.
   */
  const colorOf = (key: string) => {
    const i = consSectors.findIndex((s) => s.key === key);
    const d = directSectors.findIndex((s) => s.key === key);
    // A sector only an index holds follows both lists, in GICS order, so it
    // never borrows the colour of the last sector the family does hold.
    const j = i >= 0 ? i : d >= 0 ? consSectors.length + d
      : consSectors.length + directSectors.length + Math.max(GICS_SECTORS.indexOf(key), 0);
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

  /** What the Consolidated rows are held as, and the Unclassified ones (FS-13). */
  const consMix = issuerMix(consEntries);
  const unclassMix = issuerMix(consEntries.filter((e) => (e.sector || UNCLASSIFIED) === UNCLASSIFIED));
  /** The own-account holdings are statement lines: how many companies they are. */
  const ownCompanies = new Set(ownRows.map((x) => x.securityKey)).size;
  const donutWhy = consolidatedView
    ? `Each counted once — an issuer two of the family's statements both report, or several of their funds disclose, is one row here, never two: ${
      consMix.shares} reached through shares, the family's own or a fund's; ${
      consMix.debtOnly} only through the debt paper a fund discloses — ${DEBT_PAPER}${
      consMix.other > 0 ? `; ${consMix.other} only through lines a fund's filing classes as neither equity nor debt` : ""}.`
    /* FS-21: this view counts HOLDINGS, so the hover says what a holding is. A
       company held in two of the family's own accounts is two lines here. */
    : `Each counted once — a holding two of the family's statements both report is one row here, never two. A company held in two of their own accounts is two holdings: ${
      ownCompanies} ${ownCompanies === 1 ? "company" : "companies"} across these ${ownRows.length}.`;

  /**
   * WHY EACH UNPLACED ROW IS UNPLACED, by the cause that is true of it (FS-13).
   * "No NSE symbol resolves" is the cause for a share; for an issuer reached
   * only through debt paper the cause is that a filing prints a credit rating
   * where an industry would be, and a T-bill is not a company missing a symbol.
   */
  const unplacedMix = issuerMix(sectorFrom.unplaced);
  const unplacedShares = sectorFrom.unplaced.filter((e) => e.classes.includes("Equity"));
  const sharesNoSymbol = unplacedShares.filter((e) => !companySymbol(e)).length;
  const sharesNoVendorSector = unplacedShares.length - sharesNoSymbol;
  const unplacedCauses = [
    unplacedMix.debtOnly > 0 && `${unplacedMix.debtOnly} reached only through debt paper — ${DEBT_PAPER} — whose filings print a credit rating where an industry would be`,
    sharesNoSymbol > 0 && `${sharesNoSymbol} ${sharesNoSymbol === 1 ? "share" : "shares"} for which no NSE symbol resolves, so nothing keys the screener.in lookup`,
    sharesNoVendorSector > 0 && `${sharesNoVendorSector} ${sharesNoVendorSector === 1 ? "share" : "shares"} whose NSE symbol the committed screener.in lookup gives no sector for`,
    unplacedMix.other > 0 && `${unplacedMix.other} ${unplacedMix.other === 1 ? "line" : "lines"} a fund's filing classes as neither equity nor debt`,
  ].filter(Boolean);

  /**
   * ── WHAT THE DERIVED HALF IS MADE OF, AND ITS TWO DATES (FS-13, FS-15) ─────
   *
   * Every instrument a fund discloses, so it is shares AND debt paper — and the
   * look-through of the liquid funds the holdings tables count as cash is in it.
   * Two dates meet in every derived rupee: the fund's value (AMFI's NAV where
   * one is published, the statement's mark otherwise) times what the fund held
   * at its own portfolio disclosure, which is a month or two older. Neither was
   * on the page; the figure sat under nothing that said when it is from.
   */
  const derivedParts = (() => {
    let shares = 0, debt = 0, other = 0, inCashFunds = 0;
    const byDate = new Map<string, number>();
    const funds = new Set<string>();
    if (exposure.status === "ok") {
      for (const x of exposure.byKey.values()) {
        for (const r of x.rows) {
          funds.add(r.fundKey);
          byDate.set(r.holdingsAsOf ?? "", (byDate.get(r.holdingsAsOf ?? "") ?? 0) + r.value);
          if (CASH_EQUIVALENT_KEYS[r.fundKey]) inCashFunds += r.value;
          for (const i of r.instruments) {
            if (i.assetClass === "Equity") shares += i.value;
            else if (i.assetClass === "Debt") debt += i.value;
            else other += i.value;
          }
        }
      }
    }
    const asOfOf = new Map(portfolio.accounts.map((a) => [a.accountId, a.asOf]));
    const marks = new Map<string, { nav: boolean; value: number }>();
    for (const x of heldConsolidated) {
      if (!funds.has(x.securityKey)) continue;
      const nav = !!(x.navPriced && x.navDate);
      const d = nav ? x.navDate! : asOfOf.get(x.accountId) ?? "";
      const k = `${nav ? "nav" : "stmt"}:${d}`;
      const e = marks.get(k) ?? { nav, value: 0 };
      e.value += x.marketValue;
      marks.set(k, e);
    }
    const dated = (iso: string) => (iso ? fmtDate(iso) : "an undated disclosure");
    const valuedAt = [...marks.entries()].sort((a, b) => b[1].value - a[1].value)
      .map(([k, e]) => `${e.nav ? "AMFI's NAV of" : "its statement's mark of"} ${dated(k.slice(k.indexOf(":") + 1))}${marks.size > 1 ? ` (${money(e.value)})` : ""}`);
    const heldAt = [...byDate.entries()].sort((a, b) => b[1] - a[1])
      .map(([d, v]) => `${dated(d)} (${money(v)})`);
    const join = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);
    return { shares, debt, other, inCashFunds, byDate, valuedAt: join(valuedAt), heldAt: join(heldAt) };
  })();
  const derivedWhy = exposure.status === "ok"
    ? `DERIVED: their units' share of every instrument ${exposure.covered} of ${exposure.considered} funds disclose — ${
      money(derivedParts.shares)} in shares, ${money(derivedParts.debt)} in ${DEBT_PAPER}${
      derivedParts.other > 0 ? `, ${money(derivedParts.other)} in lines their filings class as neither` : ""}${
      derivedParts.inCashFunds > 0 ? `; ${money(derivedParts.inCashFunds)} of it is inside the liquid funds the holdings tables count as cash` : ""
      }. Two dates meet in it: each fund at ${derivedParts.valuedAt}, times what it held at its own portfolio disclosure — ${derivedParts.heldAt}.`
    : undefined;

  /**
   * ── WHAT "NOT ON THIS PAGE" IS, ITEMISED (FS-13) ───────────────────────────
   *
   * It read "undisclosed vehicles, non-equity and cash" while ₹15 Cr of debt and
   * ₹14 Cr of liquid-fund paper sat in the derived half ON the page. So the
   * hover names what the residual really is, each part summed from the book or
   * the store, and anything none of them names is stated rather than absorbed.
   *
   * ONE PART IS COUNTED AND NEVER NAMED (PC-11): a fund the family holds also
   * discloses the ring-fenced holding, and that line sat inside "no line in
   * their filings accounts for" as though it were a scheme's cash. It is a
   * line, so it is a part of its own; the fence is why it carries no name.
   */
  const restParts = (() => {
    const notOnPage = portfolio.totalValue - measuredMV - derivedMV;
    if (exposure.status !== "ok") return null;
    const aif = exposure.skipped.filter((sk) => /^an AIF files/.test(sk.reason));
    const unresolved = exposure.skipped.length - aif.length;
    const arb = sum(heldConsolidated.filter((x) => isArbitrageFund(x)).map((x) => x.marketValue));
    const cash = sum(heldConsolidated.filter((x) => x.assetClass === "Cash").map((x) => x.marketValue));
    const otherRows = heldConsolidated.filter((x) => !isCompanyShare(x) && !isFundVehicle(x) && x.assetClass !== "Cash");
    const other = sum(otherRows.map((x) => x.marketValue));
    const floor = sum(droppedHoldings(consolidated).negligible.map((x) => x.marketValue));
    const named = exposure.skippedValue + exposure.unaccountedValue + exposure.fencedValue + arb + cash + other + floor;
    const unnamed = notOnPage - named;
    const parts = [
      exposure.skippedValue > 0 && `${money(exposure.skippedValue)} in funds whose portfolio this book cannot read — ${
        aif.length} AIF ${aif.length === 1 ? "holding, which files" : "holdings, which file"} none${
        unresolved > 0 ? `, and ${unresolved} ${unresolved === 1 ? "scheme" : "schemes"} the store does not resolve` : ""}`,
      exposure.unaccountedValue > 0 && `${money(exposure.unaccountedValue)} of the disclosed funds that no line in their filings accounts for — a scheme's own cash, a gold or silver ETF's metal, rounding`,
      // PC-11: the ring-fenced holding a fund also discloses — a line of its
      // filing, so its own part, and never named.
      exposure.fencedValue > 0 && `${money(exposure.fencedValue)} a fund discloses of the one holding the family keep out of every portfolio total`,
      arb > 0 && `${money(arb)} in the arbitrage funds the family counts as cash, which are not looked through`,
      cash > 0 && `${money(cash)} of the book's own cash`,
      // Stage 10dh: these are the review's unlisted stakes and private credit.
      // "Neither a share nor a fund" was true of a set the book carried none
      // of, and false of an unlisted company's shares, so the part says what
      // is true of every row in it: this page does not sort it by sector.
      other > 0 && `${money(other)} of ${[...new Set(otherRows.map((x) => assetClassLabel(x.assetClass)))].join(" and ")} holdings, which this page does not sort by sector`,
      floor > 0 && `${money(floor)} in holdings under the ₹1,000 floor, which no table draws`,
      Math.abs(unnamed) >= 1 && `and ${money(unnamed)} that none of these names`,
    ].filter(Boolean) as string[];
    return { notOnPage, parts, aif: aif.length, arb, cash, floor, unnamed };
  })();

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
          {...(consolidatedView ? {
            "data-donut-shares": consMix.shares, "data-donut-debt": consMix.debtOnly, "data-donut-other": consMix.other,
          } : { "data-donut-companies": ownCompanies })}
          title={donutWhy}>
          {consolidatedView ? entries.length : ownRows.length} {consolidatedView ? "issuers" : "holdings"}
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
          data-unplaced-debt={unplacedMix.debtOnly}
          data-unplaced-nosymbol={sharesNoSymbol}
          title={`${sectorFrom.unplaced.length} ${consolidatedView ? "issuers" : "companies"} placed by none of the three sources — ${
            unplacedCauses.join("; ")}: ${sectorFrom.unplaced.map((e) => e.name).join(", ")}`}>
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
          : <span title={derivedWhy} data-sector-derived>
              DERIVED, not a position · <span className="text-slate-300">no part of the book&rsquo;s NAV</span>
            </span>}
      </Figure>
      <Figure label="Not on this page"
        value={exposure.status === "ok"
          ? fmtFromBase(portfolio.totalValue - measuredMV - derivedMV, { compact: true })
          : <span className="text-slate-500">—</span>}>
        {exposure.status === "ok"
          ? <span data-sector-rest
              title={`The rest of the ${fmtFromBase(portfolio.totalValue, { compact: true })} book, and no sector applies to it: ${
                (restParts?.parts ?? []).join("; ")}. These three figures cover every rupee.`}>
              AIFs, cash and what no filing names
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
          title={excludedWhy}>
          {excluded.length === 0 && sleeveRows.length === 0 ? "none" : excluded.map((c, i) => (
            <Fragment key={c.key}>
              {i > 0 && (i === excluded.length - 1 && sleeveRows.length === 0 ? " and " : ", ")}
              <span className="text-slate-400">{bucketLabel(c.key)}</span> {fmtFromBase(c.mv, { compact: true })}
            </Fragment>
          ))}
          {sleeveRows.length > 0 && <>{excluded.length > 0 && " and "}{fmtFromBase(sleeveMV, { compact: true })} of {sleeveWhat} inside
            the <span className="text-slate-400">{MANDATE_BUCKET}</span></>}
        </span>
      </Figure>
    </>
  );

  /**
   * ── THE LEFT HALF AGAINST AN INDEX: TWO BARS A SECTOR (Stage 10fe) ─────────
   *
   * In the donut's place while an index is picked. A donut beside a second
   * donut asks the reader to compare angles across two circles; two bars on one
   * scale, the family's over the index's, put every sector's difference on one
   * line. The colours are the NAV chart's — the book's gold, the index's indigo
   * — so "which bar is the index" is the answer it already has there. Sectors in
   * the table's order, the unplaced last: it is not a sector either side holds.
   */
  const vsRows = vs ? [...tableSectors].sort((a, b) =>
    (a.key === UNCLASSIFIED ? 1 : 0) - (b.key === UNCLASSIFIED ? 1 : 0)
    || rowWeight(b) - rowWeight(a) || indexWeightOf(b.key) - indexWeightOf(a.key)) : [];
  const vsMax = Math.max(0.0001, ...vsRows.map((s) => Math.max(rowWeight(s), indexWeightOf(s.key))));
  const pct1 = (w: number) => `${(w * 100).toFixed(1)}%`;
  const vsChart = vs && (
    <div data-sector-vs data-vs-index={vs.bench.key} data-vs-asof={vs.asOf}>
      <div className="flex items-center justify-between gap-2">
        <span className="label-xs">Weight by sector</span>
        <span className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: BOOK_COLOR }} />
            {consolidatedView ? "Family" : "Direct Equity"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: INDEX_COLOR }} />
            {vs.bench.label}</span>
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500" data-vs-source
        title={`${vs.publisher}'s factsheet for ${vs.bench.name}${vs.methodology ? ` (${vs.methodology.toLowerCase()} weighted)` : ""}: ${vs.url}`}>
        {vs.bench.name} · factsheet of {fmtDate(vs.asOf)}{vs.constituents ? ` · ${vs.constituents} stocks` : ""}
      </div>
      <div className="mt-3 space-y-2.5">
        {vsRows.map((s) => {
          const iw = indexWeightOf(s.key);
          const bw = rowWeight(s);
          return (
            <div key={s.key} data-vs-row={s.key} data-vs-book={bw} data-vs-weight={iw}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-200">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorOf(s.key) }} />
                  <span className="truncate">{s.key}</span>
                </span>
                <span className="mono shrink-0 text-[11px]"
                  title={s.key === UNCLASSIFIED ? "The family's equity no source placed in a sector, as a share of the whole of it — a residual outside the comparison — against what of the index its map places in none."
                    : `${pct1(bw)} of the family's classified equity against ${pct1(iw)} of ${vs.bench.name}: ${fmtPts(bw - iw)}`}>
                  <span style={{ color: BOOK_COLOR }}>{pct1(bw)}</span>
                  <span className="text-slate-500"> · </span>
                  <span style={{ color: INDEX_COLOR }}>{pct1(iw)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-900/40">
                <div className="h-full rounded-full" style={{ width: `${(bw / vsMax) * 100}%`, background: BOOK_COLOR }} />
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-900/40">
                <div className="h-full rounded-full" style={{ width: `${(iw / vsMax) * 100}%`, background: INDEX_COLOR }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /**
   * THE INDEX CONTROL — the NAV chart's pills, in the same order. An index whose
   * publisher prints no readable sector weights is offered all the same, muted,
   * and says why on its hover and in the panel when picked: absent, never
   * quietly dropped from the list.
   */
  const indexPicker = view === "compare" ? null : (
    <div className="flex flex-wrap items-center gap-2" data-sector-vs-picker>
      <span className="label-xs">Vs index</span>
      <div role="tablist" aria-label="Index to set the sector allocation against"
        className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
        {INDEX_PICKS.map((p) => {
          const absent = p.key !== "off" && !indexSectors(p.key).ok;
          return (
            <button key={p.key} type="button" role="tab" aria-selected={vsKey === p.key} title={p.title}
              data-sector-vs-pick={p.key} {...(absent ? { "data-vs-absent": "true" } : {})} onClick={() => setVs(p.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${vsKey === p.key
                ? "bg-champagne-500 text-ink-950"
                : absent ? "text-slate-500 hover:bg-ink-700/60" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  /**
   * THE SET TOGGLE, SHARED BY BOTH HOSTS. On `/sectors` it rides beside the
   * page title (the Portfolio Monitor's placement); embedded in Morning CIO it
   * sits inline at the top of the panel. `views.map`, not `SECTOR_VIEWS.map`,
   * so the embedded panel offers Consolidated and Direct Equity alone.
   */
  const viewToggle = (
    <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5"
      role="tablist" aria-label="Which set of sectors to show" data-sector-views>
      {views.map((v) => (
        <button key={v.key} type="button" role="tab" aria-selected={view === v.key} title={v.title}
          data-sector-view={v.key} onClick={() => setView(v.key)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${view === v.key
            ? "bg-champagne-500 text-ink-950 shadow-glow"
            : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {embedded ? (
        /* Embedded in Morning CIO: no PageHeader — the panel already sits under
           that page's own headline, crumb and KPI strip — just the set toggle,
           inline at the top of the panel where the family asked for it. */
        <div className="mb-3 flex flex-wrap items-center gap-2" data-cio-sector-head>
          {viewToggle}
          <div className="ml-auto">{indexPicker}</div>
        </div>
      ) : (
      <PageHeader eyebrow="Allocation" title="Sector Composition"
        beside={viewToggle}
        right={indexPicker ?? undefined}
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
      )}

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
            {/* AN INDEX PICKED: its bars in the donut's place — or, for an index
                whose publisher prints no readable weights, that absence. */}
            {vsChart
              || (view !== "compare" && vsIndex && !vsIndex.ok
                ? <AbsentSection what={`No sector weights for ${vsIndex.bench.name}`} needs={vsIndex.reason} />
                : donut)}
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
                          title={s.key === UNCLASSIFIED ? unclassifiedWhy(true, unclassMix) : undefined}
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
                      return s ? money(s.mv) : <AbsentCell reason="no issuer this family is exposed to sits in this sector" />;
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
                    <CompareRow label="Issuers" keys={compare} render={(k) => consByKey.get(k)?.count ?? <AbsentCell reason="no exposure in this sector" />} />
                    <CompareRow label="Largest exposure" keys={compare} plain render={(k) => {
                      const s = consByKey.get(k);
                      if (!s?.top) return <AbsentCell reason="no exposure in this sector" />;
                      /* FS-14: an issuer the family holds only inside a fund says so. */
                      return s.topDerivedOnly
                        ? <span title={`${s.top} — held only inside the family's funds: the largest exposure in this sector, and no position of theirs.`}>
                            {s.top} <span className="text-[10.5px] text-champagne-400/90">derived</span></span>
                        : s.top;
                    }} />

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
                        : <span className={changeColor(s.returnPct)} title={returnCoverage(s, false, (v) => fmtFromBase(v, { compact: true }))}>{fmtPct(s.returnPct, { sign: true })}{s.costed < s.holdings && <span className="ml-1 text-[10.5px] text-slate-500">{s.costed} of {s.holdings}</span>}</span>;
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
              ? "Click a sector for the issuers in it — what the statements report and what the funds disclose."
              : "Click a sector for its holdings."}>Sector breakdown{vs ? ` vs ${vs.bench.label}` : ""}</span>}>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-[13px]" data-sector-table>
                <thead className="sticky top-0 z-10 bg-ink-800">
                  <Tr view={sectorView} className="border-b border-ink-700">
                    <SortHeader col="sector" view={sectorView} align="left" pad="px-3 py-2">Sector</SortHeader>
                    <SortHeader col="value" view={sectorView} pad="px-3 py-2">Value</SortHeader>
                    <SortHeader col="weight" view={sectorView} pad="px-3 py-2" title={vs ? vsBasisNote : undefined}>Weight</SortHeader>
                    {vs && <SortHeader col="index" view={sectorView} pad="px-3 py-2"
                      title={`${vs.bench.name}'s weight in each sector, from ${vs.publisher}'s factsheet of ${fmtDate(vs.asOf)} — its own sectors placed in GICS sectors by the map the family's holdings go through.`}>
                      {vs.bench.label}</SortHeader>}
                    {vs && <SortHeader col="active" view={sectorView} pad="px-3 py-2"
                      title={`The family's weight minus ${vs.bench.name}'s, in percentage points: positive where their ${vsSetName} holds more of a sector than the index does. ${vsBasisNote}.`}>
                      Over / under</SortHeader>}
                    <SortHeader col="count" view={sectorView} pad="px-3 py-2">{consolidatedView ? "Issuers" : "Positions"}</SortHeader>
                    <SortHeader col="return" view={sectorView} pad="px-3 py-2">Return</SortHeader>
                    <SortHeader col="top" view={sectorView} align="left" pad="px-3 py-2"
                      title={consolidatedView
                        ? "The largest issuer in the sector by total exposure, reported plus derived. One the family holds only inside a fund is marked derived: an exposure, not a position."
                        : "The largest own-account holding in the sector."}>
                      {consolidatedView ? "Largest exposure" : "Largest holding"}</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {sectorRows.map((s) => {
                    const isOpen = expanded.has(s.key);
                    const rows = sortRows(holdingsBySector[s.key] ?? [], holdingView.sort, withReviewAccessors<Position>({
                      security: (h) => h.security,
                      entity: (h) => ownerOf(accIdx, h),
                      heldVia: (h) => ROUTE_LABEL[routeOf(h)],
                      value: (h) => h.marketValue,
                      // A share of the sector's own value, so it orders as Value does.
                      share: (h) => h.marketValue,
                      return: (h) => (h.costUnavailable ? null : h.returnPct),
                    }, (h) => ({ positions: [h] }), memberScope.owners !== null));
                    const companies = sortRows(companiesBySector[s.key] ?? [], companyView.sort, {
                      company: (e) => e.name,
                      direct: (e) => splitOf(e).direct,
                      pms: (e) => splitOf(e).manager,
                      other: (e) => splitOf(e).other,
                      derived: (e) => (e.derived > 0 ? e.derived : null),
                      total: (e) => e.total,
                      share: (e) => e.total,
                    });
                    /* A sector only the index holds has nothing to open into. */
                    const indexOnlyRow = s.count === 0;
                    const ir = idxBy.get(s.key);
                    const active = vs ? activeOf(s) : null;
                    const w = rowWeight(s);
                    return (
                      <Fragment key={s.key}>
                        <Tr view={sectorView} reviewScope={{ sector: s.key }} className={indexOnlyRow ? "" : "cursor-pointer hover:bg-ink-700/40"}
                          onClick={indexOnlyRow ? undefined : () => toggle(s.key)} aria-expanded={indexOnlyRow ? undefined : isOpen}
                          data-sector-row={s.key} {...(indexOnlyRow ? { "data-sector-index-only": "" } : {})}>
                          <td className="px-3 py-2">
                            {/* THE `title` GOES ON THE EXISTING SPAN, never on a new one
                                wrapping the name: this is a FLEX container, so an added
                                child becomes a flex ITEM and `innerText` breaks the line
                                at it — which would silently reshape every row-based
                                check on this page. */}
                            <span className="flex items-center gap-2 whitespace-nowrap font-medium text-slate-100"
                              title={s.key === UNCLASSIFIED ? unclassifiedWhy(consolidatedView, consolidatedView ? unclassMix : undefined) : undefined}>
                              <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${indexOnlyRow ? "text-transparent" : "text-slate-500"} ${isOpen ? "rotate-90" : ""}`} />
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(s.key) }} />
                              {s.key}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right mono text-slate-200 whitespace-nowrap" title={liveBySector[s.key] ? LIVE_CELL : undefined}
                            data-cell="value">
                            {/* A COMPUTED ZERO, WITH ITS REASON ON ITS FACE: the index holds
                                this sector and nothing of the family's is placed in it. */}
                            {indexOnlyRow
                              ? <span title={`Nothing in the family's ${vsSetName} is placed in this sector; ${vs?.bench.name ?? "the index"} holds it.`}>
                                  {money(0)} <span className="text-[10.5px] text-slate-500">none held</span></span>
                              : liveBySector[s.key] ? fmtFromBase(s.mv, { compact: true })
                              : <Auditable formula={{ title: "Sector value", excel: "= Σ market value of the sector's holdings", plain: consolidatedView ? "Every issuer in this sector, added up — what the statements report plus the family's share of every instrument their funds disclose." : "Every holding in this sector, added up.", worked: `= ${money(s.mv)} across ${s.count} ${consolidatedView ? "issuers" : "holdings"}` }}>{fmtFromBase(s.mv, { compact: true })}</Auditable>}
                          </td>
                          <td className="px-3 py-2 text-right mono text-slate-400" title={liveBySector[s.key] ? LIVE_CELL : undefined}
                            data-cell="weight" data-weight={w}>
                            {indexOnlyRow || liveBySector[s.key] ? `${(w * 100).toFixed(1)}%`
                              : vs
                                /* AGAINST AN INDEX: the sector's equity sleeve over the classified sleeve —
                                   or, for the residual, over the whole of it (Stage 10fx). */
                                ? <Auditable formula={weightFormula(vsSleeveOf(s), vsBaseOf(s), w * 100, money,
                                    s.key === UNCLASSIFIED
                                      ? `the family's whole equity ${consolidatedView ? "sleeve — their shares plus their funds' equity lines" : "shares"}: this is the residual no source placed in a sector, outside the comparison`
                                      : `the family's classified equity ${consolidatedView ? "sleeve — their shares plus their funds' equity lines, no debt paper, no cash-equivalent scheme, no balanced-advantage equity disclosed gross of its hedges" : "shares"} — the set an index's 100% is weighed against`)}>{`${(w * 100).toFixed(1)}%`}</Auditable>
                              : <Auditable formula={weightFormula(s.mv, totalMV, s.weight * 100, money,
                                  /* The denominator is THIS page's set, not the book. */
                                  consolidatedView
                                    ? "the issuers on this page — the shares the statements report plus the derived share of every instrument the funds disclose"
                                    : "the family's own company shares on this page")}>{`${(s.weight * 100).toFixed(1)}%`}</Auditable>}
                          </td>
                          {/* THE INDEX'S WEIGHT, AND WHAT OF ITS FACTSHEET MAKES IT UP. A
                              sector its table does not list is a computed nil — the
                              table is the whole index — and says so. */}
                          {vs && (
                            <td className="px-3 py-2 text-right mono text-slate-400" data-cell="index" data-index-weight={ir?.weight ?? 0}
                              title={ir
                                ? `${vs.bench.name}, ${fmtDate(vs.asOf)}: ${indexSectorFrom(ir)}${s.key === UNCLASSIFIED ? " — sectors the map places in no single GICS sector" : ""}`
                                : s.key === UNCLASSIFIED
                                  ? `Every sector ${vs.bench.name}'s factsheet prints is placed in a GICS sector, so none of the index is unplaced.`
                                  : `${vs.bench.name}'s factsheet lists nothing placed in this sector, and its table is the whole index.`}>
                              {((ir?.weight ?? 0) * 100).toFixed(1)}%
                            </td>
                          )}
                          {vs && (
                            <td className="px-3 py-2 text-right mono whitespace-nowrap text-slate-200" data-cell="active" data-active={active ?? ""}>
                              {active === null
                                ? <AbsentCell reason="Not a sector: what no source placed for the family. A difference from the index here would be a gap in classification, not a position." />
                                : <span title={`${(w * 100).toFixed(1)}% of the family's classified equity against ${(indexWeightOf(s.key) * 100).toFixed(1)}% of ${vs.bench.name}`}>{fmtPts(active)}</span>}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right mono text-slate-400" data-cell="count">{s.count}</td>
                          {/* FIFO OVER THE COSTED HOLDINGS, NAMING ITS SET (Stage 10dt). A
                              dash only where no holding in the sector reports a cost. */}
                          <td className={`px-3 py-2 text-right mono whitespace-nowrap ${changeColor(s.returnPct)}`} title={s.returnPct === null ? undefined : `${returnCoverage(s, consolidatedView, (v) => fmtFromBase(v, { compact: true }))}${liveBySector[s.key] ? ` · ${LIVE_CELL}` : ""}`}
                            data-cell="return"
                            /* THE SET A RETURN IS STRUCK OVER, carried on the cell, so
                               `check:pages` can hold the figure to its coverage. */
                            data-costed={s.costed} data-holdings={s.holdings}
                            data-costed-mv={Math.round(s.costedMV)} data-uncosted-mv={Math.round(s.uncostedMV)} data-mv={Math.round(s.mv)}>
                            {s.returnPct === null
                              ? <AbsentCell reason={s.returnWhy ?? "no return can be struck"} />
                              : <>
                                  <span data-return-figure>{liveBySector[s.key] ? fmtPct(s.returnPct, { sign: true })
                                    : <Auditable formula={{ title: "Sector return (FIFO)", excel: "= (Σ unrealised + Σ realised + Σ dividends) ÷ Σ (cost held + cost of units sold) × 100, over the holdings that report a cost", plain: `${returnCoverage(s, consolidatedView, (v) => fmtFromBase(v, { compact: true }))}. The unrealised gain on what is held, the realised gain on units already sold, matched first-in, first-out, and the dividends the holdings paid, over every rupee that bought a unit of them.`, worked: `= (${money(s.unrealised ?? 0)} + ${money(s.realised ?? 0)} + ${money(s.income ?? 0)}) ÷ ${money(s.deployed)} × 100 = ${fmtPct(s.returnPct, { sign: true })}` }}>{fmtPct(s.returnPct, { sign: true })}</Auditable>}</span>
                                  {s.costed < s.holdings && <span className="ml-1 text-[10.5px] text-slate-500" data-return-coverage>{s.costed} of {s.holdings}</span>}
                                </>}
                          </td>
                          <td className="px-3 py-2 text-left text-[12px] text-slate-400" data-cell="top"
                            data-top-key={s.topKey ?? ""} data-top-derived={s.topDerivedOnly ? "true" : "false"}>
                            {s.top === null ? <AbsentCell reason="no issuer in this sector" /> : <>
                              <span className={`inline-block ${s.topDerivedOnly ? "max-w-[130px]" : "max-w-[170px]"} truncate align-bottom`}
                                title={s.topDerivedOnly
                                  ? `${s.top} — the family holds it only inside their funds, so it is the largest exposure here and no position of theirs: no statement reports it.`
                                  : s.top}>{s.top}</span>
                              {s.topDerivedOnly && <>{" "}<span className="text-[10.5px] text-champagne-400/90" data-top-derived-mark>derived</span></>}
                            </>}
                          </td>
                        </Tr>
                        {isOpen && (
                          <tr className="bg-ink-900/50">
                            <td colSpan={sectorView.order.length} className="px-3 pb-3 pt-1">
                              <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
                                <div className="max-h-[320px] overflow-auto">
                                  {consolidatedView ? (
                                    /* ONE ROW PER COMPANY, EVERY ROUTE APART. Direct and PMS are
                                       what the statements report, split by who chose the shares;
                                       Via funds is DERIVED from the funds' filings. A route that
                                       holds none of a company is ABSENT WITH ITS REASON rather
                                       than ₹0, and the sector's own split is the footer. */
                                    (() => {
                                      const splits = new Map(companies.map((e) => [e.key, splitOf(e)]));
                                      const routeCell = (e: CompanyExposure, k: keyof MeasuredSplit) => {
                                        const v = splits.get(e.key)![k];
                                        if (v !== null) return fmtFromBase(v, { compact: true });
                                        return <AbsentCell reason={e.positions.length === 0
                                          ? "No statement in this book reports this issuer as a holding — the family owns it only through a fund, and what a fund holds is disclosed by the AMC rather than reported about this family."
                                          : ROUTE_ABSENT[k]} />;
                                      };
                                      const footSum = (k: keyof MeasuredSplit) => sumOrNull(companies.map((e) => splits.get(e.key)![k]));
                                      const foot = { direct: footSum("direct"), manager: footSum("manager"), other: footSum("other") };
                                      const footDerived = sum(companies.map((e) => e.derived));
                                      const footTotal = sum(companies.map((e) => e.total));
                                      const footCls = "border-t border-ink-700 bg-ink-900/40 px-3 py-1.5 text-right mono whitespace-nowrap";
                                      const footRoute = (k: keyof MeasuredSplit, col: string) => (
                                        <td key={col} className={`${footCls} text-slate-100`} data-sector-foot={col}>
                                          {foot[k] === null ? <AbsentCell reason={ROUTE_ABSENT_SECTOR[k]} /> : fmtFromBase(foot[k], { compact: true })}
                                        </td>
                                      );
                                      return (
                                    <table className="min-w-full text-[12px]" data-sector-companies>
                                      <thead className="sticky top-0 bg-ink-800">
                                        <Tr view={companyView} className="border-b border-ink-700/70">
                                          <SortHeader col="company" view={companyView} align="left" pad="px-3 py-1.5">Issuer</SortHeader>
                                          <SortHeader col="direct" view={companyView} pad="px-3 py-1.5" title={HELD_ROUTE_NOTE.direct}>Direct</SortHeader>
                                          <SortHeader col="pms" view={companyView} pad="px-3 py-1.5" title={HELD_ROUTE_NOTE.manager}>PMS</SortHeader>
                                          {otherRouteHeld && <SortHeader col="other" view={companyView} pad="px-3 py-1.5" title={HELD_ROUTE_NOTE.other}>Other accounts</SortHeader>}
                                          <SortHeader col="derived" view={companyView} pad="px-3 py-1.5"
                                            title="DERIVED, not a position: the AMC disclosed what the fund holds and this is the family's units' share of it. It is no part of the book's NAV — the fund's own value already stands for it there.">Via funds · derived</SortHeader>
                                          <SortHeader col="total" view={companyView} pad="px-3 py-1.5">Total exposure</SortHeader>
                                          <SortHeader col="share" view={companyView} pad="px-3 py-1.5">% of sector</SortHeader>
                                        </Tr>
                                      </thead>
                                      <tbody className="divide-y divide-ink-700/50">
                                        {companies.map((e) => {
                                          const sp = splits.get(e.key)!;
                                          return (
                                          <Tr view={companyView} key={e.key} className="hover:bg-ink-700/30" data-sector-company={e.key}
                                            data-split-direct={sp.direct ?? ""} data-split-pms={sp.manager ?? ""} data-split-other={sp.other ?? ""}
                                            data-split-derived={e.derived} data-split-total={e.total}>
                                            <td className="px-3 py-1.5 text-slate-200">
                                              {e.positions.length > 0
                                                ? <StockLink securityKey={e.key} name={e.name} />
                                                : <span title={`The family holds this issuer only inside a fund${e.classes.includes("Equity") ? "" : ", through its debt paper rather than a share"}, so the book carries no position for it and it has no page of its own.`}>{e.name}</span>}
                                            </td>
                                            <td className="px-3 py-1.5 text-right mono text-slate-100">{routeCell(e, "direct")}</td>
                                            <td className="px-3 py-1.5 text-right mono text-slate-100">{routeCell(e, "manager")}</td>
                                            {otherRouteHeld && <td className="px-3 py-1.5 text-right mono text-slate-100">{routeCell(e, "other")}</td>}
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
                                          );
                                        })}
                                      </tbody>
                                      {/* THE SECTOR'S OWN SPLIT — each column summed from the rows
                                          above it, so the footer ties to its columns and Total is
                                          Direct + PMS + Via funds on the face of the table. */}
                                      <tfoot className="sticky bottom-0">
                                        <TrFoot view={companyView} className="border-t border-ink-700 bg-ink-900/40 px-3 py-1.5 text-left text-slate-400" data-sector-companies-foot
                                          label={<span className="label-xs">Sector · {companies.length} issuers</span>}
                                          cells={{
                                            direct: footRoute("direct", "direct"),
                                            pms: footRoute("manager", "pms"),
                                            ...(otherRouteHeld ? { other: footRoute("other", "other") } : {}),
                                            derived: <td key="derived" className={`${footCls} text-champagne-400/90`} data-sector-foot="derived">
                                              {footDerived > 0 ? fmtFromBase(footDerived, { compact: true })
                                                : <AbsentCell reason="no fund this store can read discloses any issuer in this sector at a value" />}
                                            </td>,
                                            total: <td key="total" className={`${footCls} font-medium text-slate-100`} data-sector-foot="total">{fmtFromBase(footTotal, { compact: true })}</td>,
                                            share: <td key="share" className={`${footCls} text-slate-400`} data-sector-foot="share">{s.mv > 0 ? ((footTotal / s.mv) * 100).toFixed(1) : "0.0"}%</td>,
                                          }} />
                                      </tfoot>
                                    </table>
                                      );
                                    })()
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
                                          <Tr view={holdingView} reviewScope={{ positions: [h] }} key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/30">
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
                                                : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money, { realised: h.realizedPnL, costSold: h.costOfUnitsSold, income: h.dividendReceived })}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}
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
