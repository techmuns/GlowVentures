import { Fragment, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import {
  bySector, sum, consolidatedMarketValue, isCompanyShare, excludedClasses, assetClassLabel, currentHoldings,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE, MANDATE_BUCKET, DIRECT_EQUITY_BUCKET,
} from "@/lib/analytics";
import { accountIndex, ownerOf, engagementOf } from "@/lib/accounts";
import { useStockExposure } from "@/lib/useStockExposure";
import { companyExposure, type CompanyExposure } from "@/lib/lookthrough";
import { UNCLASSIFIED } from "@/lib/sectors";
import { ViewToggle, useViewParam, type ViewDef } from "@/components/ViewToggle";
import { fmtPct, fmtCurrency, changeColor } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The sector table's columns, in the order its rows write their cells. */
const SECTOR_COLS = ["sector", "value", "weight", "count", "return", "top"] as const;
/** ...and the two breakouts a sector row opens into. */
const SECTOR_COMPANY_COLS = ["company", "measured", "derived", "total", "share"] as const;
const SECTOR_HOLDING_COLS = ["security", "entity", "heldVia", "value", "share", "return"] as const;
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, CHART_COLORS } from "@/lib/chartTheme";
import { BasisPill } from "@/components/BasisPill";
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
 * like a correctly-sectored one on an allocation chart. So a statement that
 * printed no sector leaves the holding here, named, instead of guessed into a
 * slice.
 *
 * IT TAKES THE VIEW, because the two have different numbers of places to look.
 * Direct Equity has ONE source — the family's own statement. Consolidated has a
 * second, the industry an AMC filed against the same ISIN, so "the document
 * does not report it" would be true of one document and silent about the other.
 * A reason that names the wrong cause sends the next reader to the wrong
 * source, which is this book's rule for a failure message arriving at an
 * absence.
 */
const unclassifiedWhy = (consolidatedView: boolean) =>
  "Left unclassified rather than assigned a sector we would have to guess. These are shares in companies, so the sector "
  + (consolidatedView
    ? "exists — neither the family's own statement nor any fund disclosure that names this company printed one."
    : "exists; the statement simply does not report it. A depository prints an ISIN, a quantity and a rate and no industry at all.");

/**
 * ── TWO SETS, AND THE READER PICKS ─────────────────────────────────────────
 *
 *   "add a toggle switch for direct equity and consolidated. in direct equity
 *    we will show only the sector composition of direct equity holdings, and in
 *    consolidated sector composition we will show sector composition based on
 *    the aggregate securities weightage as per the data from the security filter
 *    in the holdings in portfolio monitor."
 *
 * Neither is the set this page used to show. It was COMPANY SHARES — every share
 * in a company the statements report, mandate-chosen and self-bought alike — and
 * the two asked for sit either side of it: Direct Equity drops the mandate half,
 * Consolidated adds the shares the family's funds disclose on top of both.
 *
 * CONSOLIDATED IS THE DEFAULT, and that is a decision rather than an ordering.
 * It is the widest of the three and the one that answers "what is this family
 * exposed to"; opening on Direct Equity would take the mandate half — most of
 * the measured shares on this page — off the first paint, which is exactly what
 * this page's own header note warns against. `useViewParam` makes the first view
 * param-free, so Consolidated is `/sectors` and Direct Equity is a shareable
 * link like every other view in this app.
 */
type SectorView = "consolidated" | "direct";
const SECTOR_VIEWS: readonly ViewDef<SectorView>[] = [
  { key: "consolidated", label: "Consolidated" },
  { key: "direct", label: "Direct Equity" },
];

export function SectorComposition() {
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sectorView = useTableView("sectors", SECTOR_COLS);
  const companyView = useTableView("sector-companies", SECTOR_COMPANY_COLS);
  const holdingView = useTableView("sector-holdings", SECTOR_HOLDING_COLS);
  // The spec's "compare multiple sectors on a single screen". Empty until the
  // reader picks; there is no default selection to argue about.
  const [compare, setCompare] = useState<string[]>([]);
  if (!portfolio) return null;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * EVERY FIGURE ON THIS PAGE IS BOOK-WIDE, SO IT READS THE DEDUPED SET.
   *
   * This ran `bySector` over `portfolio.positions`, which carries BOTH rows of a
   * holding reported under two members, while its own printed total came from
   * `consolidatedMarketValue`, which counts each group once. The two sides were
   * on different measurements: the sectors summed to ₹338.61 Cr beside a total
   * of ₹335.43 Cr, Unclassified read ₹239.14 Cr against a true ₹235.97 Cr, and
   * the weights added to 100.95%.
   *
   * Two groups are duplicated in this drop, not one — 360 ONE Special
   * Opportunities Series 8 under both CRNs (₹1.46 Cr) and Transition Venture
   * Fund I under both family trusts (₹1.71 Cr) — so the over-count is ₹3.17 Cr.
   * The drill-down rows come from the same set, or a sector's holdings would not
   * add up to the sector.
   *
   * Per-ACCOUNT and per-OWNER views do the opposite and show both rows as
   * printed; that is Family & Entities, and it is right there for the same
   * reason it is wrong here.
   */
  /**
   * THIS PAGE IS COMPANY SHARES — `isCompanyShare`, AND DELIBERATELY NOT
   * `isDirectEquity`.
   *
   * A GICS sector is a property of a COMPANY. A fund — an AIF folio, a mutual
   * fund scheme, an ETF, a liquid sweep — is a wrapper holding many companies,
   * and no statement in this drop prints a sector for one; every one of them
   * lands in "Unclassified". The page first excluded only the PRIVATE classes,
   * which fixed the worst of it and left the rest: Unclassified still read
   * **49.0%, ₹88.6 Cr, top holding "Helios Flexi Cap Fund"** — a mutual fund
   * standing at the head of a sector table, in the largest slice of the chart,
   * describing nothing. So the denominator is `assetClass === "Equity"`.
   *
   * THE HOLDINGS TABLES HAVE SINCE SPLIT THAT SET IN TWO and this one must not
   * follow them. On Portfolio Monitor and Morning CIO a share a discretionary
   * manager chose now sits inside its mandate (`MANDATE_BUCKET`) and "Direct
   * Equity" means what the words say — shares the family bought itself. That is
   * the right answer to "who decided this?", which is the holdings-table
   * question. It is the wrong answer to "what is this family exposed to?":
   * narrowing HERE to own-held shares would take ₹127 Cr of real sector
   * exposure off the page and leave the table to depository rows that mostly
   * print no sector at all. A mandate reports every share underneath it, so a
   * manager's book is analysable by sector exactly like a self-bought one — a
   * look-through into a mandate is a GAIN for exposure analysis, not something
   * to undo.
   *
   * Both are therefore in, the split is RENDERED rather than merely computed
   * (see `mandateMV` / `ownMV` below and the card that prints them), and the
   * caption says which word means which set so a reader who has just met
   * "Direct Equity" on the holdings table cannot read this table as that set.
   *
   * Everything that is not a share in a company is NAMED below with its value,
   * per class, rather than folded in as a false sector: a fund's look-through
   * would need each scheme's own portfolio disclosure, which this book has for
   * exactly one scheme and does not join to the folios the family holds.
   *
   * The residual Unclassified is now real — company shares whose own statement
   * printed no sector, listed in `docs/BOOK-REPORT.md` — and it is stated below
   * as such rather than being the place funds went to hide.
   */
  const accIdx = accountIndex(portfolio.accounts);
  // `isCompanyShare` and `excludedClasses` live in `analytics.ts` — the one
  // place the company-vs-fund axis is decided, so this page, Exposure & IPS,
  // Return Analysis and the stock page narrow on the same rule rather than on
  // four local re-derivations of it.
  /**
   * CURRENT HOLDINGS FIRST, AND THE ₹1,000 FLOOR IS WHY THIS LINE CHANGED.
   *
   * It read `consolidated.filter(isCompanyShare)` — and was RIGHT for as long as
   * the only thing `currentHoldings` removed was a redeemed fund, because a
   * redeemed holding is a fund vehicle and `isCompanyShare` had already excluded
   * every one of them. The floor drops two EQUITY rows (EFPL's preference line
   * at ₹60 and Everest Fleet at ₹580), so the two filters stopped being
   * equivalent and this page's measured half stopped agreeing with the Portfolio
   * Monitor's security axis — which is a claim `check:pages` makes across the
   * two pages, and which is what caught it.
   *
   * The DERIVED half was already filtered, through `useStockExposure`. Half a
   * page on one set and half on another is the disagreement `companyExposure`
   * exists to prevent, arriving through the one caller that narrowed by hand.
   */
  const heldConsolidated = currentHoldings(consolidated);
  const p = heldConsolidated.filter(isCompanyShare);
  /** Every company share the statements report — the MEASURED half of both views. */
  const measuredMV = consolidatedMarketValue(p);
  /**
   * WHO CHOSE THESE SHARES — split out, and RENDERED.
   *
   * "Company shares" is an asset-class statement; "Direct Equity" is a claim
   * about WHO DECIDED, and on the holdings tables it is now the narrower set.
   * Most of this table is a discretionary manager's book, so the split is on
   * screen with its figures rather than living in a caption's adjective.
   *
   * A helper that returns the right number into no caller looks exactly like a
   * working feature — these two were computed and only ever appeared inside one
   * sentence at the foot of the page.
   *
   * The route comes from the ACCOUNT (`engagementOf`), never from the position:
   * how a holding is run is a fact about the account that holds it.
   */
  const routeOf = (x: (typeof p)[number]) => holdingRoute(engagementOf(accIdx, x) || null);
  const mandateRows = p.filter((x) => routeOf(x) === "mandate");
  const ownRows = p.filter((x) => routeOf(x) === "own");
  // Shares in an account whose engagement is neither — `unknown` is never
  // defaulted, so this is empty in this drop and must still be named the day a
  // statement arrives that does not say how its account is run.
  const otherRows = p.filter((x) => routeOf(x) !== "mandate" && routeOf(x) !== "own");
  const mandateMV = sum(mandateRows.map((x) => x.marketValue));
  const ownMV = sum(ownRows.map((x) => x.marketValue));
  const otherMV = sum(otherRows.map((x) => x.marketValue));
  const mandateAccounts = new Set(mandateRows.map((x) => x.accountId)).size;
  const ownAccounts = new Set(ownRows.map((x) => x.accountId)).size;
  /* `shareOfTable` IS GONE, and it is not an oversight. It printed a subset's
     share of this table, which fitted the cards it was written for: they split
     the ONE set the page drew. The cards here describe the active view and what
     sits OUTSIDE it — "Left out by this view" is not in the table at all, and
     "Bought by the family" is the whole of it on Direct Equity — so the only
     honest percentages it could produce were 100% and a share of a denominator
     the reader cannot see. A helper with no caller is the failure this file
     keeps naming, so it went with them rather than being kept for a future one.

     `privateMV` and the standalone `unclassified` binding went the same way:
     their only readers were the footer paragraphs below. */
  // Every class this page does NOT cover, largest first, so the fund card can
  // name them FROM THE BOOK rather than from a hardcoded list — which is also
  // what makes the reconstruction (covered + excluded = NAV) a real check
  // rather than a comparison of a caption with itself.
  // ON THE SAME SET AS THE COVERED HALF. The reconstruction under the table is
  // "company shares + the classes this view leaves out = the book", and a
  // partition whose two sides are drawn from different sets is not a partition.
  const excluded = excludedClasses(heldConsolidated, isCompanyShare);
  const excludedMV = sum(excluded.map((c) => c.mv));
  /**
   * ── THE CONSOLIDATED SET: one entry per COMPANY, both halves kept apart ────
   *
   * `companyExposure` is the one definition — the same one the Portfolio
   * Monitor's stock axis is built on — so a company cannot be sized here and
   * sized differently there, and cannot land in two sectors. The exposure index
   * is loaded through `useStockExposure`, the same hook and therefore the same
   * ring-fence and the same ISIN bridge.
   *
   * FETCHED ONLY WHEN THIS VIEW IS ON. Direct Equity never asks what a fund
   * holds, so it must not pay for 21 files.
   */
  const [view, setView] = useViewParam<SectorView>(SECTOR_VIEWS);
  const consolidatedView = view === "consolidated";
  /**
   * LOADED ON BOTH VIEWS, and Direct Equity needs it for a reason that is a
   * finding rather than a convenience.
   *
   * NOT ONE of the 37 company shares the family bought in its own demat or
   * broking account carries a sector: a depository statement prints an ISIN, a
   * quantity and a rate, and no industry at all. Read off the book alone this
   * view is a single grey wedge — 100% Unclassified — which is true and answers
   * nothing.
   *
   * What CAN place them is an identifier. Fourteen of those ISINs are named in a
   * monthly portfolio disclosure filed by a fund this same family holds, and
   * that filing prints the company's industry. `companyExposure` joins on the
   * ISIN — exactly, never on a name — and resolves the label through the one
   * committed map. Measured on this book: 14 of 37 placed, ₹44.0 Cr of ₹94.9 Cr,
   * and ZERO where two filings disagree.
   *
   * IT ONLY EVER FILLS AN EMPTY SECTOR and can never contradict the book: a
   * position whose own statement printed one keeps it (see `companyExposure`).
   * So this page places names the rest of the app leaves unplaced rather than
   * placing them differently, and it says so below, with the count. The durable
   * fix is a backfill in the ingest, which is noted in CLAUDE.md — a
   * presentation layer that repaired identity would hide the gap, but this
   * repairs no identity and invents no label.
   */
  const exposure = useStockExposure(consolidated, true);
  const entries = useMemo(() => {
    if (consolidatedView) return companyExposure(p, exposure);
    // Own-account holdings only: `companyExposure` unions in every company the
    // funds disclose, and a company the family owns only inside a fund is not a
    // Direct Equity holding by any reading of the words.
    return companyExposure(ownRows, exposure).filter((e) => e.positions.length > 0);
  }, [consolidatedView, p, ownRows, exposure]);
  /** What a row is worth in the active view — total exposure, or the measured half alone. */
  const valueOf = (e: CompanyExposure) => (consolidatedView ? e.total : e.measured);
  /**
   * ── ONE SLICE SHAPE, SO EVERY SURFACE BELOW READS ONE THING ───────────────
   *
   * Direct Equity rolls up POSITIONS and keeps `bySector`, which carries cost,
   * P&L and return through `sumOrNull`.
   *
   * Consolidated rolls up COMPANIES, and its cost, P&L and return are NULL by
   * construction rather than by absence in the data. Its value column is the
   * measured half plus a derived one, and no statement reports a cost for a
   * share the family owns inside somebody else's portfolio — so a return struck
   * here would divide a part-measured gain by a cost covering a fraction of its
   * own numerator. That is "a total must tie to its own columns", one column
   * wider, and the page prints an em dash with that reason instead.
   */
  const sectors = useMemo(() => {
    const m = new Map<string, { mv: number; count: number }>();
    for (const e of entries) {
      const k = e.sector || UNCLASSIFIED;
      const c = m.get(k) ?? { mv: 0, count: 0 };
      c.mv += valueOf(e); c.count += 1;
      m.set(k, c);
    }
    const tot = [...m.values()].reduce((a, v) => a + v.mv, 0);
    return [...m.entries()]
      .map(([key, v]) => ({
        key, mv: v.mv, count: v.count,
        weight: tot > 0 ? v.mv / tot : 0,
        cost: null as number | null, pnl: null as number | null,
        returnPct: null as number | null, withoutCost: v.count,
      }))
      .sort((a, b) => b.mv - a.mv);
  }, [consolidatedView, entries]);
  /**
   * THE ACTIVE VIEW'S OWN TOTAL, SUMMED FROM THE VERY SLICES ON SCREEN — never
   * computed on a second path. A donut whose hole prints a figure its own wedges
   * do not add to is the "a total must tie to its own columns" failure with a
   * chart around it, and it cannot happen if there is only one sum.
   */
  const totalMV = sectors.reduce((a, sc) => a + sc.mv, 0);
  /**
   * THE DERIVED HALF, SUMMED FROM THE SAME ENTRIES THE SECTORS ARE BUILT FROM —
   * not from `exposure.total`, which is the store's own figure over every
   * disclosed company. The two agree today and are not the same measurement:
   * the store's runs before the fence and before this page narrows to company
   * shares, so a page that printed it would be reconciling against a number its
   * own wedges do not contain.
   */
  const derivedMV = entries.reduce((a, e) => a + e.derived, 0);
  /**
   * WHERE EACH COMPANY'S SECTOR CAME FROM — counted, and printed, because the
   * two are different kinds of evidence. `book` is the family's own statement,
   * resolved by `build-book`. `disclosure` is the industry a fund's own SEBI
   * filing printed against that ISIN, which is how a depository row gets placed
   * at all. Neither is guessed, and a company placed by neither says so.
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
    /*
     * AND THE RESIDUAL CARRIES ITS VALUE, NOT ONLY ITS COUNT. "57 unplaced" and
     * "₹15.4 Cr unplaced" are the same fact told very differently, and the
     * second is the one a reader can weigh — 81.6% of it here is ONE company
     * NSE does not list, which a count of 57 hides completely.
     */
    const unplacedMV = unplaced.reduce((a, e) => a + e.total, 0);
    return { book, disc, vendor, unplaced, unplacedMV };
  }, [entries]);
  // Every figure on this page is rebuilt from position market values, so once the
  // quote feed is up they all track live prices — and none of them matches a cell
  // in the source extract any more. Live figures render plain; only a book still on its
  // workbook marks keeps the audit trail back to the ledger.
  const feedLive = p.some((x) => x.live);
  const chartData = sectors.map((s) => ({ name: s.key, value: convertFromBase(s.mv) }));
  const axisFmt = (v: number) => fmtCurrency(v, displayCurrency, { compact: true });
  // Holdings in each sector (newest-value first) — the rows revealed when a sector is expanded.
  /**
   * WHAT A SECTOR OPENS INTO, and the two views open into different things
   * because they are rollups of different units.
   *
   * Direct Equity expands to the POSITIONS behind the sector — one row per
   * statement line, with the entity that holds it, exactly as this page always
   * did. Consolidated expands to the COMPANIES, because that is what its rows
   * are: a company only a fund holds has no position to list, and listing the
   * measured half alone under a total that includes the derived one would be a
   * drill-down that does not add up to the row it opened from.
   */
  const companiesBySector = useMemo(() => {
    const m: Record<string, CompanyExposure[]> = {};
    for (const s of sectors) m[s.key] = entries.filter((e) => (e.sector || UNCLASSIFIED) === s.key);
    return m;
  }, [entries, sectors]);
  /**
   * GROUPED ON THE ENTRY'S SECTOR, NEVER ON THE POSITION'S OWN.
   *
   * They differ for the 14 own-account holdings whose sector came from a fund's
   * filing rather than from their own statement. Filtering positions on
   * `x.sector` would put those rows in the Unclassified fold while their value
   * counted in Financials — a drill-down that does not add up to the row it
   * opened from, which is the one thing a drill-down must always do.
   */
  const holdingsBySector = useMemo(() => {
    const m: Record<string, typeof p> = {};
    if (consolidatedView) return m;
    for (const s of sectors) {
      m[s.key] = (companiesBySector[s.key] ?? [])
        .flatMap((e) => e.positions)
        .sort((a, b) => b.marketValue - a.marketValue);
    }
    return m;
  }, [consolidatedView, companiesBySector, sectors]);
  /**
   * WHICH SECTORS CARRY A LIVE PRICE — read off the ACTIVE view's own positions,
   * so a sector that is live in one view is not claimed live in the other.
   *
   * On Consolidated it is never set. That view's value is part derived from a
   * monthly disclosure, and "recalculated from live prices" would be a claim
   * about a figure the feed has not touched — so the cells keep their formula
   * popovers and the header pill states the basis for the page as a whole.
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
   * THE TABLE'S OWN ORDER. `sectors` keeps the chart's ordering — the donut and
   * the legend read it, and the swatch colour is keyed on a sector's place in
   * it — so the table sorts a copy and never that array.
   */
  const sectorRows = sortRows(sectors, sectorView.sort, {
    sector: (x) => x.key,
    value: (x) => x.mv,
    // Weight is this sector's value over the page's, so it orders as Value does.
    weight: (x) => x.mv,
    count: (x) => x.count,
    return: (x) => (consolidatedView ? null : x.returnPct),
    top: (x) => topHolding[x.key] ?? null,
  });
  const toggleCompare = (key: string) =>
    setCompare((prev) => (prev.includes(key)
      ? prev.filter((k) => k !== key)
      : prev.length >= 4 ? [...prev.slice(1), key] : [...prev, key]));
  const comparedSectors = compare
    .map((k) => sectors.find((s2) => s2.key === k))
    .filter((s2): s2 is NonNullable<typeof s2> => !!s2);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  return (
    <div>
      <PageHeader eyebrow="Allocation" title="Sector Composition"
        subtitle={consolidatedView
          ? "Every company this family is exposed to — the shares their statements report, plus their share of what their funds disclose holding"
          : "Shares bought in the family's own demat and broking accounts only — nothing a discretionary manager chose, and no fund"}
        right={<div className="flex items-center gap-2">
          <BasisPill liveText={feedLive ? "Live prices" : "Workbook marks"}
            hint={consolidatedView
              ? "Two halves, kept apart until the last moment. The MEASURED half is every company share the statements report, mandate-chosen and self-bought alike. The DERIVED half is the family's units' share of what each fund disclosed holding — the AMC's own monthly filing, not a document about this family — and it is no part of the book's NAV, because the fund's own value already stands for it there. Sectors come from one committed map: the book's own where it has one, and the industry label the AMC filed otherwise."
              : "A GICS sector is a property of a company, and no statement here prints one for a fund. This view narrows to shares the family bought itself — the set the holdings tables call Direct Equity. Values, weights and returns are rebuilt from live prices; cost basis comes from the statements."} />
          <Pill tone="info">{sectors.length} sectors</Pill>
        </div>} />
      <ViewToggle views={SECTOR_VIEWS} active={view} onChange={setView} />
      <Card className="mt-1">
        <div className="flex flex-col items-center gap-6 md:flex-row md:gap-8">
          {/* Donut on the left, sector total in the hole */}
          <div className="relative shrink-0" style={{ width: 230, height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={66} outerRadius={98} stroke="none"
                  className="cursor-pointer" onClick={(d: any) => { const nm = d?.name ?? d?.payload?.name; if (nm) toggle(nm); }}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle}
                  formatter={(v: number) => axisFmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="label-xs !tracking-normal">{consolidatedView ? "Total exposure" : "Direct Equity"}</div>
              <div className="mono text-base font-semibold text-slate-100">{fmtFromBase(totalMV, { compact: true })}</div>
              {/* THE HOLE IS A LABEL AND A FIGURE, AND THAT IS ALL IT FITS.
                  It carried the count and the sector provenance as two more
                  stacked lines, at 10.5px, inside a 112px circle — so both ran
                  under the ring and over the wedges, which is what the family
                  reported. They are not dropped: a figure a reader acts on does
                  not go away to fix a layout, it moves somewhere with room. Both
                  are on one legible line under the chart. */}
              <div className="mt-0.5 text-[11px] text-slate-500"
                data-donut-count={consolidatedView ? entries.length : ownRows.length}
                data-donut-basis="each counted once"
                title="Each counted once — a company two of the family's statements both report is one row here, never two.">
                {consolidatedView ? entries.length : ownRows.length} {consolidatedView ? "companies" : "holdings"}
              </div>
            </div>
          </div>
          {/* Legend on the right — colour, sector, weight, value */}
          <ul className="grid w-full flex-1 grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
            {sectors.map((s, i) => (
              <li key={s.key} onClick={() => toggle(s.key)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-ink-700/40">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="flex-1 truncate text-[13px] text-slate-200"
                  title={s.key === UNCLASSIFIED ? unclassifiedWhy(consolidatedView) : s.key}>{s.key}</span>
                <span className="mono text-[13px] font-semibold text-slate-100">{(s.weight * 100).toFixed(1)}%</span>
                <span className="mono w-20 text-right text-[11px] text-slate-400">{fmtFromBase(s.mv, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* ── WHERE EVERY SECTOR ON THIS PAGE CAME FROM ─────────────────────
            Three tiers, and a reader cannot infer any of them from the chart.
            The vendor tier is the whole reason a depository holding can be
            placed at all — a demat statement prints an ISIN, a quantity and a
            rate and no industry — so this is where it says so, in the family's
            own words: looked up on screener.in.

            IT NAMES WHAT IS STILL UNPLACED, with the count and the reason. A
            residual a reader cannot see is a residual they assume is zero. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-700/70 pt-3 text-xs text-slate-400"
          data-sector-source
          data-from-book={sectorFrom.book}
          data-from-disclosure={sectorFrom.disc}
          data-from-vendor={sectorFrom.vendor}
          data-unplaced={sectorFrom.unplaced.length}
          data-unplaced-mv={Math.round(sectorFrom.unplacedMV)}>
          <span className="text-slate-500">Sector source</span>
          <span><span className="mono text-slate-200">{sectorFrom.book}</span> from their statements</span>
          {sectorFrom.disc > 0 && <span><span className="mono text-slate-200">{sectorFrom.disc}</span> from a fund&rsquo;s filing</span>}
          {sectorFrom.vendor > 0 && (
            <span><span className="mono text-slate-200">{sectorFrom.vendor}</span> from screener.in</span>
          )}
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

        {/* ── WHAT THIS VIEW IS MADE OF, per view, with its figures ────────
            Both views are a NARROWING or a WIDENING of the company shares the
            statements report, and a reader has to be able to see which and by
            how much. Consolidated splits measured from derived — the one
            distinction that decides whether a figure traces to a document.
            Direct Equity names what the narrowing left out, because a table
            headed with a family's own money reads as all of it otherwise. */}
        <div className="mt-5 grid gap-4 border-t border-ink-700/70 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {consolidatedView ? (
            <>
              <div>
                <div className="label-xs">Reported by their statements</div>
                <div className="mono text-sm font-semibold text-slate-100">{fmtFromBase(measuredMV, { compact: true })}</div>
                <div className="mt-1 text-xs leading-snug text-slate-400">
                  {p.length} holdings · {fmtFromBase(mandateMV, { compact: true })} manager-chosen,
                  {" "}{fmtFromBase(ownMV, { compact: true })} the family&rsquo;s own
                </div>
              </div>
              <div>
                <div className="label-xs">Derived from what their funds disclose</div>
                <div className="mono text-sm font-semibold text-champagne-400/90">
                  {exposure.status === "ok"
                    ? fmtFromBase(derivedMV, { compact: true })
                    : <span className="text-slate-500">{exposure.status === "loading" ? "loading…" : "—"}</span>}
                </div>
                <div className="mt-1 text-xs leading-snug text-slate-400">
                  {exposure.status === "loading" ? <>Still reading the funds&rsquo; disclosures.</>
                  : exposure.status === "unreachable" ? <span className="text-amber-400/80">The look-through store did
                    not answer — a fact about the fetch, not the book.</span>
                  /* "DERIVED, not a position" and "no part of the book's NAV" are
                     the fence, in words rather than a tooltip. Shortened around,
                     never dropped. */
                  : <>DERIVED, not a position — their units&rsquo; share of what {exposure.covered} of
                    {" "}{exposure.considered} funds disclose.
                    <span className="text-slate-300"> No part of the book&rsquo;s NAV.</span></>}
                </div>
              </div>
              <div>
                <div className="label-xs">Not on this page</div>
                <div className="mono text-sm font-semibold text-slate-100">
                  {exposure.status === "ok"
                    ? fmtFromBase(portfolio.totalValue - measuredMV - derivedMV, { compact: true })
                    : <span className="text-slate-500">—</span>}
                </div>
                <div className="mt-1 text-xs leading-snug text-slate-400">
                  {exposure.status === "ok"
                    ? <>The rest of the {fmtFromBase(portfolio.totalValue, { compact: true })} book — undisclosed
                      vehicles, non-equity and cash. No sector applies. These three figures cover every rupee.</>
                    : <>Measurable once the funds&rsquo; disclosures answer.</>}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="label-xs">Bought by the family</div>
                <div className="mono text-sm font-semibold text-slate-100">
                  {ownRows.length > 0
                    ? fmtFromBase(ownMV, { compact: true })
                    : <AbsentCell reason="No company share on this page was bought in the family's own demat or broking account. Such accounts may still be in the book — this view counts only their company shares, not the fund or ETF units one may hold." />}
                </div>
                <div className="mt-1 text-xs leading-snug text-slate-400">
                  {ownRows.length > 0
                    ? <>{ownRows.length} holdings across {ownAccounts} of their own
                      {" "}{ownAccounts === 1 ? "account" : "accounts"} · the holdings tables call this
                      {" "}&ldquo;{DIRECT_EQUITY_BUCKET}&rdquo;</>
                    : <>No own-account company share in this book.</>}
                </div>
              </div>
              <div>
                <div className="label-xs">Left out by this view</div>
                <div className="mono text-sm font-semibold text-slate-100">{fmtFromBase(mandateMV + otherMV, { compact: true })}</div>
                <div className="mt-1 text-xs leading-snug text-slate-400">
                  {mandateRows.length} shares a manager chose across {mandateAccounts}
                  {" "}{mandateAccounts === 1 ? "mandate" : "mandates"}
                  {otherRows.length > 0 && <>, {otherRows.length} with no stated route</>} ·
                  {" "}real exposure, shown in <span className="text-slate-300">Consolidated</span>
                </div>
              </div>
              <div>
                <div className="label-xs">Not a company share</div>
                <div className="mono text-sm font-semibold text-slate-100">{fmtFromBase(excludedMV, { compact: true })}</div>
                {/* EACH CLASS WITH ITS OWN VALUE, not just the names. The
                    removed footer carried the per-class figures and this card
                    had only the list — and the total alone cannot tell a reader
                    whether the excluded money is one big wrapper or a dozen
                    small ones, which is the thing they would act on. It is also
                    what lets `check:pages` strike the reconstruction on a
                    labelled figure rather than on a sentence. */}
                <div className="mt-1 text-xs leading-snug text-slate-400">
                  excluded rather than folded in —{" "}
                  {excluded.length === 0 ? "none" : excluded.map((c, i) => (
                    <Fragment key={c.key}>
                      {i > 0 && (i === excluded.length - 1 ? " and " : ", ")}
                      <span className="text-slate-400">{assetClassLabel(c.key)}</span> {fmtFromBase(c.mv, { compact: true })}
                    </Fragment>
                  ))}
                  {" "}· a fund holds many companies, so none has a sector of its own
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
      {/* ── Compare sectors ────────────────────────────────────────────────
          The spec asks to compare "multiple sectors" on a single screen. Every
          figure here is one the book already carries; nothing is derived that
          the sector rollup does not already compute.

          COST, P&L AND RETURN CAN BE ABSENT and are shown as such. `bySector`
          sums them with `sumOrNull`, so a sector whose holdings report no cost
          has a null cost rather than a zero — and `withoutCost` names how many
          positions were skipped when only some reported one. Rendering either
          as 0 would report the whole market value as profit. */}
      <Card className="mt-5" title="Compare sectors"
        subtitle={compare.length
          ? `${compare.length} of 4 selected — click a chip to add or remove`
          : "Pick up to four sectors to put side by side"}
        right={compare.length > 0
          ? <button onClick={() => setCompare([])}
              className="rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200">Clear</button>
          : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {sectors.map((sc) => {
            const on = compare.includes(sc.key);
            return (
              <button key={sc.key} onClick={() => toggleCompare(sc.key)}
                className={`rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ${on
                  ? "border-champagne-500/50 bg-champagne-500/15 text-champagne-300"
                  : "border-ink-600/70 bg-ink-800/40 text-slate-400 hover:border-ink-500 hover:text-slate-200"}`}>
                {sc.key} <span className="text-slate-500">{(sc.weight * 100).toFixed(1)}%</span>
              </button>
            );
          })}
        </div>

        {comparedSectors.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            {/* Exempt, declared: this table is TRANSPOSED. Its rows are a
                fixed list of metrics rather than records, so there is nothing
                to sort, and its columns are the sectors a reader picked — which
                the picker above already orders. */}
            <table className="min-w-full whitespace-nowrap text-[12.5px]"
              data-table-static="transposed — its rows are a fixed metric list rather than records, and its columns are the sectors the picker above selected">
              <thead>
                <tr className="border-b border-ink-700">
                  <th className="label-xs px-3 py-2 text-left font-medium">Metric</th>
                  {comparedSectors.map((sc) => (
                    <th key={sc.key} className="label-xs px-3 py-2 text-right font-medium text-slate-300">{sc.key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                <tr>
                  <td className="px-3 py-2 text-slate-400">Market value</td>
                  {comparedSectors.map((sc) => <td key={sc.key} className="px-3 py-2 text-right mono">{money(sc.mv)}</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Weight of company shares</td>
                  {comparedSectors.map((sc) => <td key={sc.key} className="px-3 py-2 text-right mono">{(sc.weight * 100).toFixed(1)}%</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Cost basis</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className="px-3 py-2 text-right mono">
                      {sc.cost == null
                        ? <AbsentCell reason="No holding in this sector reports a cost — a depository statement carries a value and no basis" />
                        : money(sc.cost)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Unrealised P&amp;L</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className={`px-3 py-2 text-right mono ${sc.pnl == null ? "" : changeColor(sc.pnl)}`}>
                      {sc.pnl == null
                        ? <AbsentCell reason="Needs a cost basis, which no holding in this sector reports" />
                        : money(sc.pnl, true)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Return on cost</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className={`px-3 py-2 text-right mono ${sc.returnPct == null ? "" : changeColor(sc.returnPct)}`}>
                      {sc.returnPct == null
                        ? <AbsentCell reason="Needs a cost basis" />
                        : fmtPct(sc.returnPct, { sign: true })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Holdings</td>
                  {comparedSectors.map((sc) => <td key={sc.key} className="px-3 py-2 text-right mono">{sc.count}</td>)}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Of which report no cost</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className="px-3 py-2 text-right mono text-slate-400">
                      {sc.withoutCost === 0 ? "none" : `${sc.withoutCost} of ${sc.count}`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Largest holding</td>
                  {comparedSectors.map((sc) => (
                    <td key={sc.key} className="px-3 py-2 text-right text-slate-300">{topHolding[sc.key]}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Weights are of {consolidatedView
                ? <><span className="text-slate-400">this view&rsquo;s own total exposure</span> — the company shares
                  the statements report plus the family&rsquo;s share of what their funds disclose</>
                : <><span className="text-slate-400">the family&rsquo;s own-account company shares</span> — the set the
                  holdings tables call &ldquo;{DIRECT_EQUITY_BUCKET}&rdquo;</>}, which is the same denominator the rest of
              this view uses, so the column sums to 100 across all sectors. A fund wrapper is never a slice: it holds many
              companies and has no sector of its own.
              {consolidatedView
                ? <> Cost, P&amp;L and return are <span className="text-slate-400">—</span> throughout this view: its value
                  column includes a DERIVED half, and no statement reports a cost for a share the family owns inside
                  somebody else&rsquo;s portfolio. A return struck here would divide a part-measured gain by a cost
                  covering a fraction of its own numerator. Switch to Direct Equity for figures that are measured
                  end to end.</>
                : <> A sector whose holdings report no cost shows <span className="text-slate-400">—</span> for cost,
                  P&amp;L and return rather than a zero, which would report its whole market value as profit; where only
                  some holdings lack a cost the row above names how many.</>}
            </p>
          </div>
        )}
      </Card>

      <Card className="mt-5" title="Sector breakdown"
        subtitle={consolidatedView
          ? "Click a sector to expand the companies in it — what the statements report and what the funds disclose, side by side"
          : "Click a sector to expand its holdings"} pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700">
                <Tr view={sectorView}>
                  <SortHeader col="sector" view={sectorView} align="left">Sector</SortHeader>
                  <SortHeader col="value" view={sectorView}>Value</SortHeader>
                  <SortHeader col="weight" view={sectorView}>Weight</SortHeader>
                  <SortHeader col="count" view={sectorView}>{consolidatedView ? "Companies" : "Positions"}</SortHeader>
                  <SortHeader col="return" view={sectorView}>Return</SortHeader>
                  <SortHeader col="top" view={sectorView} align="left">Top holding</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {sectorRows.map((s) => {
                  /* THE SWATCH COLOUR FOLLOWS THE SECTOR, NOT THE ROW POSITION.
                     `CHART_COLORS[i % n]` keyed on the rendered index would
                     repaint every swatch the moment a reader sorted the table,
                     and the donut beside it would stop matching — which is this
                     file's own index-cycled-attribution failure arriving
                     through a sort. The index is the sector's place in the
                     chart's own order. */
                  const i = sectors.indexOf(s);
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
                      <Tr view={sectorView} className="cursor-pointer hover:bg-ink-700/40" onClick={() => toggle(s.key)} aria-expanded={isOpen}>
                        <td className="px-4 py-2.5">
                          {/* An absence names its cause where the absence is —
                              `Absent.tsx`'s rule, applied to a sector nobody
                              reported rather than to a missing figure.

                              THE `title` GOES ON THE EXISTING SPAN, never on a
                              new one wrapping the name: this is a FLEX container,
                              so an added child becomes a flex ITEM and
                              `innerText` breaks the line at it — the trap Stage
                              10ah records for the "N entities" pill, which would
                              silently reshape every row-based check on this
                              page. */}
                          <span className="flex items-center gap-2 font-medium text-slate-100"
                            title={s.key === UNCLASSIFIED ? unclassifiedWhy(consolidatedView) : undefined}>
                            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            {s.key}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-200 whitespace-nowrap" title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                          {liveBySector[s.key] ? fmtFromBase(s.mv, { compact: true })
                            : <Auditable formula={{ title: "Sector value", excel: "= Σ market value of the sector's holdings", plain: consolidatedView ? "Every company in this sector, added up — what the statements report plus the family's share of what their funds disclose." : "Every holding in this sector, added up.", worked: `= ${money(s.mv)} across ${s.count} ${consolidatedView ? "companies" : "holdings"}`,  }}>{fmtFromBase(s.mv, { compact: true })}</Auditable>}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400" title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                          {liveBySector[s.key] ? `${(s.weight * 100).toFixed(1)}%`
                            : <Auditable formula={weightFormula(s.mv, totalMV, s.weight * 100, money,
                                /* The denominator is THIS page's set, not the book: company shares only,
                                   each dedupeGroup counted once. `weightFormula` used to assert "the whole
                                   listed book" for every caller, which is neither what this divides by nor
                                   what the ₹13,061.63 Cr header chip says — and this popover is the one a
                                   reader opens precisely to check the arithmetic. */
                                "the company shares on this page")}>{`${(s.weight * 100).toFixed(1)}%`}</Auditable>}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400">{s.count}</td>
                        {/* A RETURN IS REFUSED WHERE ITS OWN VALUE COLUMN INCLUDES A
                            DERIVED HALF. On Consolidated the value is part measured and
                            part the family's share of a fund's disclosure, and no
                            statement reports a cost for the second — so a percentage
                            here would divide a part-measured gain by a cost covering a
                            fraction of its own numerator. Absent WITH ITS REASON, never
                            a plausible number, and never a bare dash. */}
                        <td className={`px-4 py-2.5 text-right mono ${consolidatedView ? "" : changeColor(s.returnPct)}`} title={liveBySector[s.key] ? LIVE_CELL : undefined}>
                          {consolidatedView
                            ? <AbsentCell reason="This view's value is the shares the statements report plus a DERIVED share of what the funds disclose, and no document reports a cost for the second. A return struck over it would divide a part-measured gain by a cost covering part of its own numerator. Direct Equity is measured end to end and carries one." />
                            : liveBySector[s.key] ? fmtPct(s.returnPct, { sign: true })
                            : <Auditable formula={{ title: "Sector return", excel: "= Σ P&L ÷ Σ Cost × 100", plain: "The value-weighted average return of every holding in this sector — combined gain or loss against combined cost.", worked: `= ${money(s.pnl)} ÷ ${money(s.cost)} × 100 = ${fmtPct(s.returnPct, { sign: true })}`,  }}>{fmtPct(s.returnPct, { sign: true })}</Auditable>}
                        </td>
                        <td className="px-4 py-2.5 text-left text-[12px] text-slate-400"><span className="block max-w-[170px] truncate" title={topHolding[s.key]}>{topHolding[s.key]}</span></td>
                      </Tr>
                      {isOpen && (
                        <tr className="bg-ink-900/50">
                          <td colSpan={6} className="px-4 pb-3 pt-1">
                            <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
                              <div className="max-h-[320px] overflow-auto">
                                {consolidatedView ? (
                                  /* ── ONE ROW PER COMPANY, BOTH HALVES APART ──────────
                                     The sector's rows ARE companies on this view, so the
                                     drill-down lists them and shows what each is made of.
                                     A company only a fund discloses has no position, no
                                     quantity and no cost, and every measured cell on such
                                     a row is ABSENT WITH ITS REASON rather than ₹0. */
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
                                      {/* WHICH SIDE OF THE HOLDINGS-TABLE SPLIT THIS ROW IS ON.
                                          Every row is own-account in this view by construction,
                                          and the column stays: a reader switching from the
                                          Consolidated view needs to see that, per row, rather
                                          than take a caption's word for it. */}
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
                                        <td className={`px-3 py-1.5 text-right mono ${h.costUnavailable ? "text-slate-500" : changeColor(h.returnPct)}`} title={h.live && !h.costUnavailable ? LIVE_CELL : undefined}>
                                          {h.costUnavailable ? "—"
                                            : h.live ? fmtPct(h.returnPct, { sign: true })
                                            : <Auditable formula={returnFormula(h.marketValue, h.costBasis, h.returnPct, money)}>{fmtPct(h.returnPct, { sign: true })}</Auditable>}
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
      {/*
        THE FOOTER PARAGRAPH IS REMOVED — one per view — at the family's
        request, and the audit that preceded it is what makes the removal a
        relocation rather than a loss. Every claim it carried, and where it is
        now:

          · "company shares only" / "total       the view toggle, the donut's
            exposure per company"                own label and the subtitle
          · the total                            the donut hole
          · the count, "each counted once"       MOVED — the donut hole, under
                                                 the total it describes, with
                                                 the view's own noun
          · measured vs DERIVED, and that the    ALREADY on this page, as the
            derived half is no part of NAV       two partition cards above, in
                                                 those words
          · what the narrowing leaves out,       ALREADY the third card, with
            with its value and its counts        more detail than the sentence
          · the excluded classes and why a       ALREADY the fund card, which
            wrapper has no sector                names each class
          · the two-tier sector provenance,      MOVED — the donut hole, as two
            book vs a fund's own filing          counted figures
          · why Unclassified is unclassified     MOVED — onto the Unclassified
                                                 row and legend entry, as a
                                                 hover, which is where an
                                                 absence's reason belongs, and
                                                 worded per view because the
                                                 two have different numbers of
                                                 sources to have looked in

        A hover is weaker than a caption, and that is stated rather than
        glossed. The figures a reader ACTS on — what this view covers, what it
        leaves out, and how much of it is derived rather than reported — are all
        RENDERED; a hover carries only the explanation behind them.
      */}
    </div>
  );
}
