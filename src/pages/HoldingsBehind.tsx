import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/Card";
import { SearchInput } from "@/components/SearchInput";
import { AbsentSection, AbsentCell, AbsentFromBook, DASH } from "@/components/Absent";
import { PageNav } from "@/components/PageNav";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows, type TableView } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, sumOrNull, holdingBucket, NEGLIGIBLE_VALUE_FLOOR, bucketLabel, holdingRoute, isMandateHeld, mandateLabelWithOwner, dedupedPositions, isValuedAtCost, AT_COST_BUCKET, ROUTE_LABEL, ROUTE_NOTE } from "@/lib/analytics";
import {
  aifSectionOf, aifCategoryOf, aifCategoryWhy, isAifHolding, aifSectionOrd,
  unvaluedAifFolios, AIF_UNSTATED_SECTION, PRIVATE_EQUITY_SECTION,
} from "@/lib/aifCategory";
import { accountIndex, engagementOf, ownerOf, providerOf } from "@/lib/accounts";
import { parseDrilldown, resolveDrilldown, drilldownHref, coveredReturn, bookReturnOnCost, costedSetLabel, type Drilldown, type DrilldownId } from "@/lib/drilldown";
import { fifoBasisNote, fifoTotals, investedBasisNote, investedWithCapital, type FifoOptions, type FifoTotals } from "@/lib/fifo";
import { costedFigures, costCoverNote, VACUOUS_COST_REASON } from "@/lib/clubbedFigures";
import { stockHref } from "@/lib/auditFormulas";
import { depositoryUnitsGist } from "@/lib/fundNavs";
import { fmtNum, fmtPct, fmtDate, changeColor } from "@/lib/format";
import type { Position } from "@/lib/types";

/**
 * ── THE HOLDINGS BEHIND A FIGURE ────────────────────────────────────────────
 *
 * *"Every row of the allocation table on Morning CIO must open the holdings
 * behind it — AIF, PMS mandates, Mutual Fund, Direct Equity and ETF alike. The
 * KPI tiles and the Concentration figures are the same fix."*
 *
 * Morning CIO is a screen of totals and, until this page, only two of the sets
 * behind them had an address: a mandate and a family entity. Everything else
 * was a number a reader could see and not open — ₹352.35 Cr of AIF across 19
 * holdings in 17 accounts, 60 positions the Capital invested tile leaves out,
 * 128 names two members both hold. Each of those is a real question with a real
 * answer sitting in the book.
 *
 * ONE PAGE RATHER THAN THIRTEEN, because a drill-down is not a new measurement.
 * Every figure on that screen is `Σ f(x)` over a subset of the same book, so
 * what differs between them is the SUBSET and the words for it — and both live
 * in `src/lib/drilldown.ts`, which Morning CIO also calls to build the link. A
 * page per figure would be thirteen chances for a drill-down to disagree with
 * the tile it opened from, which is this repo's most expensive recurring bug.
 *
 * THREE RULES THIS PAGE HOLDS ITSELF TO, each of them one the site has been
 * fixed for before and every one of them reachable through this new route:
 *
 *   1. A RETURN IS STRUCK ONLY WHERE THE COST SIDE COVERS THE SET. Morning
 *      CIO's allocation row refuses a return for Direct Equity because 28 of its
 *      37 holdings report no cost; if this page printed one anyway, the family
 *      would open the row that says "—" and land on a page asserting a
 *      percentage. Same 0.5% coverage test, same refusal, same reason on screen.
 *   2. THE BASIS IS STATED, because it is not the same for every scope. Twelve
 *      of these sets are CONSOLIDATED — each holding two statements report
 *      counted once — and the money-weighted coverage is PER-ACCOUNT and must
 *      not dedupe, or the total would fall below the coverage its own tile
 *      prints. The pill says which, and `Drilldown.deduped` decides it.
 *   3. WHAT THE FIGURE DOES NOT COVER IS NAMED, not dropped. Capital invested
 *      skips the holdings reporting no cost; they are carried here as a second
 *      table rather than left off the page that exists to explain the first.
 */

/**
 * ── ONE ROW PER THING YOU WOULD CLICK INTO ──────────────────────────────────
 *
 * *"When I click on AIF or any Mutual Fund line item, it should simply show
 * what all AIFs/PMS/Mutual Funds I'm holding, invested amount in them and so
 * on… No need for statement/security toggle button, I do not understand the
 * purpose of it."*
 *
 * Both halves of that are the same fix. The page used to open on one row per
 * STATEMENT LINE — so the AIF drill-down listed Sanshi Fund-I Class E four
 * times, once per family member, and answering "which funds do we hold" meant
 * the reader grouping 19 rows into 14 by eye. The toggle was the escape hatch
 * for that, and a MODE a reader has to understand before the table means
 * anything is a defect in the table, not a feature.
 *
 * So there is no mode. A row is the unit a reader would open:
 *
 *   • a MANDATE, where the set holds the whole of one — its own page lists every
 *     share the manager picked, which is the look-through that exists;
 *   • otherwise the SECURITY — one fund, one scheme, one company, however many
 *     statements report it.
 *
 * A MANDATE IS ONE ROW ONLY WHERE THIS SET HOLDS ALL OF IT, and that condition
 * is the whole reason this is safe to do everywhere rather than on the PMS
 * bucket alone. A bucket drill-down carries every row of the mandates in it, so
 * the row ties to the manager's own statement. A FILTERED set — the winners, the
 * holdings reporting no cost — carries some of a mandate's rows, and a row
 * labelled with the manager's name over a subset of what they hold is the
 * "caption asserts what a named counterparty reports" failure this repo has
 * already paid for once. Those group by security instead, and the mandate stays
 * reachable from each row's own Held-in cell.
 *
 * Measured on this book: AIF 19 statement rows → 14 funds, Mutual Fund 24 → 20
 * schemes, PMS mandates 281 → 10 mandates, Direct Equity 37 → 37 companies, the
 * whole book 369 → 84. The winners set produces no mandate row at all, which is
 * the condition above doing its job.
 */
type Group = {
  key: string;
  kind: "mandate" | "security";
  /** What the row is called, and where clicking it goes. */
  label: string;
  href: string;
  /** The second line: whose money, or how many statements carry this name. */
  rows: Position[];
  mv: number;
  cost: number | null;
  /**
   * WHAT THE INVESTED CELL PRINTS. The cost of the rows held, except that a
   * WHOLE mandate enters at the capital paid into it — what its FIFO return is
   * divided by, which is the figure Morning CIO's allocation row this page
   * opens from prints too (`investedWithCapital`). `capital` carries the two
   * bases for the cell's hover; null on a row with no whole mandate in it.
   */
  invested: number | null;
  capital: FifoTotals | null;
  pnl: number | null;
  /** How many of `rows` report no cost — a return is refused where any do. */
  withoutCost: number;
  /** Market value of the rows a cost DOES cover, so a ratio divides one set. */
  costedMV: number;
};

function groupRows(
  rows: Position[],
  accIdx: ReturnType<typeof accountIndex>,
  /** Every row the BOOK holds, for the whole-mandate test. */
  allRows: Position[],
  /** The same FIFO options the page's returns use, so a mandate's Invested and its Return share one basis. */
  fifoOpts: FifoOptions,
): Group[] {
  // WHICH MANDATES THIS SET HOLDS ENTIRELY — counted against the book, never
  // against the set, or every set would trivially "hold all" of what it has.
  const sizeInBook = new Map<string, number>();
  for (const p of allRows) {
    if (!isMandateHeld(engagementOf(accIdx, p))) continue;
    sizeInBook.set(p.accountId, (sizeInBook.get(p.accountId) ?? 0) + 1);
  }
  const here = new Map<string, number>();
  for (const p of rows) {
    if (!isMandateHeld(engagementOf(accIdx, p))) continue;
    here.set(p.accountId, (here.get(p.accountId) ?? 0) + 1);
  }
  const whole = new Set([...here].filter(([id, n]) => n === sizeInBook.get(id)).map(([id]) => id));

  const by = new Map<string, Position[]>();
  for (const r of rows) {
    const asMandate = isMandateHeld(engagementOf(accIdx, r)) && whole.has(r.accountId);
    const k = asMandate ? `M:${r.accountId}` : `S:${r.securityKey}`;
    const a = by.get(k) ?? [];
    a.push(r);
    by.set(k, a);
  }
  return [...by.entries()]
    .map(([key, group]) => {
      const kind = key.startsWith("M:") ? "mandate" as const : "security" as const;
      const acc = accIdx.get(group[0].accountId);
      return {
        key,
        kind,
        label: kind === "mandate"
          ? mandateLabelWithOwner(acc, ownerOf(accIdx, group[0]))
          : group[0].security,
        href: kind === "mandate"
          ? `/mandate/${encodeURIComponent(group[0].accountId)}`
          : stockHref(group[0].securityKey),
        rows: group,
        mv: sum(group.map((x) => x.marketValue)),
        // Cost and its gain over ONE set, and none over nothing (A-02, A-14) —
        // `costedFigures`, the helper every clubbed row on every page uses.
        cost: costedFigures(group).cost,
        ...(() => {
          const cost = costedFigures(group).cost;
          if (kind !== "mandate") return { invested: cost, capital: null };
          const f = fifoTotals(group, fifoOpts);
          return f.wholeMandates.length
            ? { invested: investedWithCapital(cost, f), capital: f }
            : { invested: cost, capital: null };
        })(),
        pnl: costedFigures(group).unrealised,
        withoutCost: group.filter((x) => x.costBasis == null).length,
        costedMV: sum(group.filter((x) => x.costBasis != null).map((x) => x.marketValue)),
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

/**
 * The holdings table's columns, in the order its rows write their cells.
 *
 * `costShare` — EACH ROW'S SHARE OF THE CAPITAL INVESTED — beside `weight`, its
 * share of the value. *"add new columns and data regarding the invested capital
 * that we were showing as a separate page."* Capital invested was its own page
 * until it was folded into Current Value of Holdings, and the two shares side by
 * side are the one comparison that page could not show: where the money went in
 * against where it sits now. Struck over the rows that report a cost, so it adds
 * to 100% of the invested figure and never to a share of a cost nobody reported.
 */
const HB_COLS = ["unit", "heldIn", "invested", "value", "weight", "costShare", "pnl", "return"] as const;

export function HoldingsBehind() {
  const { portfolio, consolidated, statementPortfolio, fmtFromBase } = usePortfolio();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  /** Which grouped rows are expanded to their statement lines. */
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // A HOOK, so it sits above this page's early returns.
  const view = useTableView("holdings-behind", HB_COLS);

  const scope = useMemo(() => parseDrilldown(params), [params]);
  /* CURRENT HOLDINGS ONLY, AND THE FILTER IS INSIDE `resolveDrilldown` — see the
     note there. It was written at THIS boundary first, which narrows the same
     two sets and is one edit rather than nine; the reason it moved is that a
     filter here leaves `closedExcluded` at zero, so the table's subtitle would
     say nothing had been left out while five rows were missing. A page that
     drops rows silently is the defect the count exists to close. */
  const resolved = useMemo<Drilldown | null>(
    // `statement` IS THE BOOK THE MONEY-WEIGHTED RATE IS STRUCK ON (B-06): the
    // measured scope keys its accounts on it, exactly as the tile does.
    () => (portfolio && scope ? resolveDrilldown(scope, { portfolio, consolidated, statement: statementPortfolio }) : null),
    [portfolio, consolidated, statementPortfolio, scope],
  );

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const full = (n: number | null | undefined) => fmtFromBase(n, { compact: false });

  if (!portfolio) return null;

  // ── The address does not name a set this page knows ────────────────────────
  //
  // A typed or stale address gets the reason and the list, never a silent
  // fallback to "everything": a page that answers a question it was not asked,
  // with a figure that looks like the one the reader clicked, is worse than one
  // that says it did not understand.
  if (!scope || !resolved) {
    return (
      <div>
        <PageNav className="mb-2" trail={[{ label: "Morning CIO", to: "/cio" }, { label: "Nothing named to open" }]} />
        <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-slate-100">Nothing named to open</h1>
        <Card>
          <AbsentSection
            what="This address does not name a set of holdings"
            needs="Every drill-down here opens from a figure on Morning CIO, and the address carries which figure. Reaching this page directly means the address was typed or bookmarked from a build that named its sets differently. The sets this book can show are listed below." />
          <ul className="mt-4 grid gap-1.5 text-[12.5px] sm:grid-cols-2">
            {/* ONE ENTRY PER FIGURE, and the halves of a figure are facets of
                its entry rather than entries of their own — the listed and
                private halves, and the holdings reporting no cost, used to be
                listed here as separate sets. Listing them again would be the
                same "which of these two answers my question" the tiles have
                just been rid of. */}
            {([
              ["book", "", "", "Every holding in the book, and what went into it"],
              ["book", "", "listed", "…the listed half"],
              ["book", "", "private", "…the private half"],
              ["book", "", "costed", "…the holdings that report a cost"],
              ["book", "", "no-cost", "…and the ones that report none"],
              ["measured", "", "", "What the money-weighted return covers"],
              ["top-names", "", "", "The largest names"],
              ["cross-held", "", "", "Names two entities both hold"],
              ["winners", "", "", "Holdings showing a gain"],
              ["losers", "", "", "Holdings showing a loss"],
            ] as [DrilldownId, string, string, string][]).map(([id, key, facet, label]) => (
              <li key={`${id}-${facet}`}>
                <Link to={drilldownHref(id, key || undefined, facet || undefined)} className="text-champagne-400 hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  const d = resolved;
  const accIdx = accountIndex(portfolio.accounts);
  const rows = d.rows;
  /**
   * THE HEADING AND THE LEAD FOLLOW THE ACTIVE FACET.
   *
   * "Every holding in the book" over the 19 private rows is a caption that
   * WIDENS its figure — the same failure the Capital invested tile cost this
   * repo once, arriving through a toggle. So a facet other than the first adds
   * its label to the heading and replaces the lead with its own note, and every
   * sentence on screen stays true of the rows underneath it. The first facet is
   * the scope's own set, so it keeps the scope's wording unchanged.
   */
  const activeIdx = Math.max(0, d.facets.findIndex((f) => f.key === d.activeFacet));
  const activeFacet = d.facets[activeIdx] ?? null;
  const narrowed = d.facets.length > 1 && activeIdx > 0 && !!activeFacet;
  const heading = narrowed ? `${d.title} · ${activeFacet!.label}` : d.title;

  // ── The figures this page has to reconstruct ───────────────────────────────
  const mv = sum(rows.map((r) => r.marketValue));
  // THE SET'S COST AND GAIN, ON ONE SET — and none over nothing (A-14). The
  // Cash drill-down's only costed lines are two nil sleeves, and a sum over
  // them printed Invested ₹0 beside ₹14.2 Cr no statement costs.
  const setCost = costedFigures(rows);
  const cost = setCost.cost;
  const pnl = setCost.unrealised;
  const noCost = rows.filter((r) => r.costBasis == null);
  const costedMV = sum(rows.filter((r) => r.costBasis != null).map((r) => r.marketValue));
  const withoutCostMV = sum(noCost.map((r) => r.marketValue));
  /**
   * FIFO, AGAINST THE BOOK THE SET WAS DRAWN FROM — what "every holding of a
   * mandate" is measured against, so a bucket holding whole mandates strikes
   * them on their capital exactly as Morning CIO's allocation row does.
   */
  const fifoOpts = { accounts: accIdx, universe: d.deduped ? consolidated : portfolio.positions };
  const ret = coveredReturn(rows, fifoOpts);
  /**
   * THE SET'S INVESTED, ON THE FOOTER'S BASIS AND MORNING CIO'S: the cost of
   * what is held, except that a whole mandate enters at the capital paid into
   * it (`investedWithCapital`). The headline, the Share of invested column and
   * the tile this page opens from all divide by this one figure, so none of
   * them can be struck on the cost of shares while another is on capital.
   */
  const invested = investedWithCapital(cost, ret.fifo);
  const names = new Set(rows.map((r) => r.securityKey));
  const accounts = new Set(rows.map((r) => r.accountId));
  /**
   * THE ACCOUNTS THE RATE IS ACTUALLY STRUCK ON, for the derivation card below.
   *
   * Read off the COVERED facet rather than the active one: the derivation
   * describes how the rate is computed, and that is the same arithmetic over the
   * same accounts whichever half of the toggle the reader is looking at. Taken
   * from `rows` it would read "the 29 accounts" on the Not-covered facet, about a
   * rate none of them is in. Derived, never typed.
   */
  const coveredAccounts = new Set(
    (d.facets.find((f) => f.key === "covered")?.rows ?? rows).map((r) => r.accountId),
  ).size;
  const owners = new Set(rows.map((r) => ownerOf(accIdx, r)));
  /**
   * THE HOLDINGS NO STATEMENT MARKS — a depository's own closing units on an
   * account that sent a transaction statement and no holding statement, or
   * units a holding statement records and prints no rate for (A-17), valued
   * only at AMFI's published NAV. Which of the two is `depositoryUnitsGist`'s
   * to say, because only one of them is an account with no holding statement. They are not in the statement-basis figure
   * the headline's hover states, and a reader holding the PDF has to be told
   * why the two differ by more than price drift. The sentence is written once
   * and read by both the hover and the short line under the headline.
   */
  const depositoryRows = rows.filter((r) => r.depositoryUnits);
  // A FUND is valued at AMFI's published NAV and a listed SHARE at the live
  // quote (Stage 10cy) — two sources, and each is named for the rows it prices.
  const depositoryFunds = depositoryRows.filter((r) => r.navPriced);
  const depositoryShares = depositoryRows.filter((r) => !r.navPriced);
  const depositoryHow = [
    depositoryFunds.length > 0
      ? `${depositoryShares.length > 0 ? `${fmtNum(depositoryFunds.length)} ` : ""}at AMFI's published NAV (${full(sum(depositoryFunds.map((r) => r.marketValue)))})` : null,
    depositoryShares.length > 0
      ? `${depositoryFunds.length > 0 ? `${fmtNum(depositoryShares.length)} ` : ""}at the live quote, only while the quote feed prices ${depositoryShares.length === 1 ? "it" : "them"} (${full(sum(depositoryShares.map((r) => r.marketValue)))})` : null,
  ].filter(Boolean).join(" and ");
  const depositoryNote = depositoryRows.length === 0 ? null
    : `${depositoryRows.length === 1 ? "One holding here carries" : `${depositoryRows.length} holdings here carry`} no statement mark at all — ${depositoryRows.length === 1 ? "it is" : "they are"} ${depositoryUnitsGist(depositoryRows)}, valued only ${depositoryHow} — so ${depositoryRows.length === 1 ? "it is" : "they are"} not in that figure.`;
  // THE BUCKET CHIP EARNS ITS PLACE ONLY WHERE THE SET SPANS MORE THAN ONE.
  // On a bucket drill-down every row would carry the same chip — a repetition of
  // the heading above them, pushing the name out of its column for no
  // information. Derived from the rows rather than keyed on the scope id.
  const showBucket = new Set(rows.map((r) => holdingBucket(r, engagementOf(accIdx, r)))).size > 1;
  /**
   * THE BOOK IS ONE FIGURE: the current value of holdings the top bar and the
   * Morning CIO tile print (B-01 — CK-B2, DSM-B7, VD-12). The per-account
   * scope used to divide by the per-statement sum instead and print THAT as
   * "the book" — ₹3.17 Cr larger, because two holdings are reported under two
   * accounts each — so one page named a book no other surface shows.
   *
   * A share above 100% was the reason for that choice, and it is answered on
   * the numerator rather than by moving the denominator: a per-statement set
   * is counted ONCE for its share (`dedupedPositions`), so a holding two
   * statements both report is one holding of the one book. The headline above
   * stays each statement as printed, and the line under it says so.
   */
  const bookMV = portfolio.totalValue;
  const setOnceMV = d.deduped ? mv : sum(dedupedPositions([...rows]).map((r) => r.marketValue));
  const shareOfBook = bookMV > 0 ? (setOnceMV / bookMV) * 100 : null;
  /**
   * WHAT PRICES MOVED THIS SET OFF ITS STATEMENT MARKS (DSM-C1). The headline's
   * hover used to call every difference "a live quote", and with no quote feed
   * running the gap was AMFI's published NAV on the fund holdings — a
   * different source, struck once a day after the close. Counted by source so
   * the sentence names the one that moved it.
   */
  const navPricedRows = rows.filter((r) => r.navPriced && !r.depositoryUnits).length;
  const quotedRows = rows.filter((r) => r.live).length;
  const priceSources = [
    navPricedRows ? `AMFI's published NAV on ${fmtNum(navPricedRows)} fund holding${navPricedRows === 1 ? "" : "s"}` : "",
    quotedRows ? `a live quote on ${fmtNum(quotedRows)}` : "",
  ].filter(Boolean).join(" and ");
  /**
   * ACCRUED INCOME, WHICH NO VALUE ON THIS SITE INCLUDES (DL-14). Morning
   * CIO's Accrued income tile opens this page, and the page carried no accrued
   * figure at all. Summed over this set's own rows the way the tile sums the
   * book's — `sumOrNull`, so a set where no statement reports any says nothing
   * rather than "₹0 accrued".
   */
  const accruedRows = rows.filter((r) => typeof r.accruedIncome === "number" && r.accruedIncome !== 0);
  const accrued = accruedRows.length ? sumOrNull(rows.map((r) => r.accruedIncome)) : null;
  /**
   * THE WHOLE-BOOK RETURN ON COST, ON THE BOOK'S OWN PAGE (B-07). The
   * Consolidated return tile and the allocation table's Total row open this
   * scope, and both print one figure over one set — the holdings that report a
   * cost — named on its face. `bookReturnOnCost` is the same call they make,
   * over the same current holdings, so the page cannot print another.
   */
  // Only on the two facets that ARE that set or contain it whole — on the
  // listed or private half a whole-book figure beside the half's own gain
  // would put one set's return in another's sentence.
  const bookAll = d.id === "book" && (d.activeFacet === "all" || d.activeFacet === "costed")
    ? (d.facets.find((f) => f.key === "all")?.rows ?? rows) : null;
  const bookReturn = bookAll ? bookReturnOnCost(bookAll, fifoOpts) : null;
  const bookReturnLabel = bookReturn ? costedSetLabel(bookReturn.set, (n) => money(n)) : "";
  /** The money-weighted rate the tile prints, where this is the page it opens (B-06). */
  const mw = d.moneyWeighted ?? null;
  const weight = (v: number) => (mv > 0 ? `${((v / mv) * 100).toFixed(1)}%` : null);
  /** A row's share of the capital invested in this set — its Invested over the set's. */
  const costShare = (c: number | null) => (c != null && invested != null && invested > 0 ? `${((c / invested) * 100).toFixed(1)}%` : null);

  const term = q.trim().toLowerCase();
  const match = (r: Position) =>
    r.security.toLowerCase().includes(term) || (r.isin ?? "").toLowerCase().includes(term);
  const shown = term ? rows.filter(match) : rows;
  const hidden = rows.length - shown.length;
  /**
   * THE WHOLE-MANDATE TEST IS STRUCK AGAINST THE BOOK, NOT AGAINST `shown`.
   *
   * `shown` is what survived the reader's filter, and a mandate is never whole
   * once a filter has been typed — so grouping against it would silently drop
   * the mandate rows the moment somebody searched. The set the page is FOR is
   * `rows`; the filter narrows what is drawn, not what a row means.
   */
  const groups = sortRows(
    groupRows(shown, accIdx, d.deduped ? consolidated : portfolio.positions, fifoOpts),
    view.sort,
    {
      unit: (g) => g.label,
      heldIn: (g) => [...new Set(g.rows.map((x) => ownerOf(accIdx, x)))].join(", "),
      invested: (g) => g.invested,
      value: (g) => g.mv,
      // Weight is this row's value over the set's, so it orders as Value does.
      weight: (g) => g.mv,
      // …and the invested share is its cost over the set's, so it orders as Invested does.
      costShare: (g) => g.invested,
      pnl: (g) => g.pnl,
      return: (g) => coveredReturn(g.rows, fifoOpts).pct,
    },
  );
  /**
   * ── THE AIF DRILL-DOWN IS CLUBBED BY SEBI CATEGORY ─────────────────────────
   *
   * *"when you're drilling down in the AIF … make it cat one, cat two, cat
   * three … club कर दो कि these are cat two AIFs, these are cat three AIFs,
   * this is cat one AIF"* — and *"create another private equity fund line
   * item"*.
   *
   * `aifCategory.ts` decides the section and carries the whole argument: it is
   * READ from the two fields the statements print and never inferred, the two
   * must agree where both speak, a phrase naming two categories resolves to
   * neither, and Private Equity takes precedence over the category so the
   * sections partition.
   *
   * IT APPLIES ONLY WHERE EVERY ROW IS AN AIF HOLDING. A drill-down that mixes
   * an AIF with a mutual fund — the whole book, the winners, the costless
   * positions — would draw a "Category not stated" heading over an ETF, which
   * is a category claim about an instrument that has none. Gated on the SET
   * rather than on the scope id, so it follows the rows rather than the address.
   */
  const aifSectioned = groups.length > 0 && groups.every((g) => g.rows.every((r) => isAifHolding(accIdx, r)));
  const sections = useMemo(() => {
    if (!aifSectioned) return null;
    const by = new Map<string, Group[]>();
    for (const g of groups) {
      // A GROUP IS FILED BY ITS OWN ROWS, and a group whose rows disagree is
      // not filed at all. Every group here is one fund across its folios, so
      // they agree by construction on this book — but a fund reported under two
      // categories by two custodians must not be silently filed under whichever
      // sorted first, which is the same rule the category read itself follows.
      const keys = [...new Set(g.rows.map((r) => aifSectionOf(accIdx, r)))];
      const k = keys.length === 1 ? keys[0] : AIF_UNSTATED_SECTION;
      const a = by.get(k) ?? []; a.push(g); by.set(k, a);
    }
    return [...by.entries()]
      .map(([key, gs]) => ({ key, groups: gs, mv: sum(gs.map((g) => g.mv)), n: gs.length }))
      .sort((a, b) => aifSectionOrd(a.key) - aifSectionOrd(b.key));
  }, [aifSectioned, groups, accIdx]);

  /**
   * ONE ORDERED LIST, so the table body is a single `map` whether it is
   * sectioned or not. Building it here rather than nesting two loops in the JSX
   * keeps the group row identical in both cases — a second copy of it is a
   * second chance for the sectioned table to render a cell the flat one does
   * not, and this table has eight of them.
   */
  const items: ({ kind: "head"; key: string; mv: number; n: number } | { kind: "row"; group: Group })[] =
    sections
      ? sections.flatMap((sec) => [
          { kind: "head" as const, key: sec.key, mv: sec.mv, n: sec.n },
          ...sec.groups.map((g) => ({ kind: "row" as const, group: g })),
        ])
      : groups.map((g) => ({ kind: "row" as const, group: g }));

  /**
   * THE FOLIOS THAT PUBLISH NO NAV, NAMED RATHER THAN SILENTLY ABSENT.
   *
   * Every Category I AIF this family owns is an angel fund that values nothing,
   * so a holdings table can never draw one — and a drill-down clubbed by
   * category that simply has no Category I heading tells a reader they hold
   * none. Measured here: four Sky Capital folios with ₹4.73 Cr drawn.
   */
  const unvalued = useMemo(() => {
    if (!aifSectioned || !portfolio) return [];
    const withPositions = new Set(portfolio.positions.map((p) => p.accountId));
    const drawn = new Map<string, number | null>(
      (portfolio.commitments ?? []).map((c) => [c.accountId, c.drawn]),
    );
    return unvaluedAifFolios(portfolio.accounts, withPositions, drawn);
  }, [aifSectioned, portfolio]);
  /**
   * WHAT THE COLLAPSED SUMMARY STATES: the sections the folios sit in, in the
   * page's own reading order, and what they have drawn between them. The total
   * is `sumOrNull`'s — a folio whose statement prints no drawn figure is
   * skipped rather than blended in as zero, and a set where none prints one has
   * no total at all.
   */
  const unvaluedBySection = useMemo(() => {
    const by = new Map<string, number>();
    for (const f of unvalued) by.set(f.section, (by.get(f.section) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => aifSectionOrd(a[0]) - aifSectionOrd(b[0]));
  }, [unvalued]);
  const unvaluedDrawn = useMemo(() => sumOrNull(unvalued.map((f) => f.drawn)), [unvalued]);

  /**
   * …AND THE AIF LINES THE REVIEW HOLDS AT COST, WHICH THIS ROW NO LONGER
   * CARRIES.
   *
   * Since Stage 10dh a line the family's own consolidated review records at
   * cost is its own allocation bucket, so eight of this book's AIF funds —
   * Sky Capital's angel fund among them — are drawn on that row and not here.
   * EVERY CATEGORY I AIF THIS FAMILY OWNS IS THAT ANGEL FUND, so without this
   * the table is clubbed by category and simply silent about one: a reader is
   * told they hold no Category I, which is false and is the one way the move
   * could mislead. Named with its category, its cost and where it IS shown —
   * the treatment Stage 10bp gave the funds that left Private Market.
   *
   * One entry per FUND, which is the unit a row of this table is, with its cost
   * summed over the folios that hold it.
   */
  const atCost = useMemo(() => {
    if (!aifSectioned || !portfolio) return [];
    const by = new Map<string, { key: string; section: string; security: string; cost: number; lines: number }>();
    for (const p of portfolio.positions) {
      if (!isAifHolding(accIdx, p) || !isValuedAtCost(p)) continue;
      const section = aifSectionOf(accIdx, p);
      const id = `${section}|${p.securityKey}`;
      const e = by.get(id) ?? { key: p.securityKey, section, security: p.security, cost: 0, lines: 0 };
      e.cost += p.marketValue; e.lines += 1; by.set(id, e);
    }
    return [...by.values()].sort((a, b) => aifSectionOrd(a.section) - aifSectionOrd(b.section) || b.cost - a.cost);
  }, [aifSectioned, portfolio, accIdx]);
  /** The same reading order the sections are in, so the summary states the categories. */
  const atCostBySection = useMemo(() => {
    const by = new Map<string, number>();
    for (const f of atCost) by.set(f.section, (by.get(f.section) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => aifSectionOrd(a[0]) - aifSectionOrd(b[0]));
  }, [atCost]);

  /** What one row of this table IS, so the header and the footer can say it. */
  const anyMandate = groups.some((g) => g.kind === "mandate");
  const allMandate = groups.length > 0 && groups.every((g) => g.kind === "mandate");
  const unitWord = allMandate ? "mandate" : anyMandate ? "row" : "name";
  const unitHeading = allMandate ? "Mandate" : anyMandate ? "Security / mandate" : "Security";

  /**
   * ── THE CRUMB, AND WHY A FACET EARNS A SEGMENT OF ITS OWN ─────────────────
   *
   * *"The first line should rather label the page/KPI tile that we have
   * opened."* `d.crumb` is that tile. A FACET is a sub-selection of it, and a
   * reader who clicked "Listed" on the Concentration card opened the listed
   * half rather than the whole book — so where a facet other than the headline
   * one is active it takes the last segment and the figure keeps the one
   * before it. Struck against `facets[0]`, which IS the headline set by
   * construction, rather than against a named key: a scope that gains a facet
   * gets this for free and one that renames its halves cannot go stale.
   */
  const facet = d.facets.length > 1 && d.activeFacet !== d.facets[0]?.key
    ? d.facets.find((f) => f.key === d.activeFacet)
    : null;
  const crumbTrail = [
    { label: "Morning CIO", to: "/cio" },
    facet ? { label: d.crumb, to: drilldownHref(d.id, d.key || undefined) } : { label: d.crumb },
    ...(facet ? [{ label: facet.label }] : []),
  ];


  return (
    <div>
      {/* THE CRUMB NAMES THE FIGURE, AND THE THREE BUTTONS REPLACE A ONE-WAY
          LINK. "Back to Morning CIO" was a hardcoded parent, so a reader who
          reached this page from the allocation table's own row link was
          offered a step they may not have taken; the browser's history knows
          where they came from and these buttons walk it. Morning CIO still
          shows — as the crumb's parent, which is where this page SITS. */}
      <PageNav className="mb-2" trail={crumbTrail} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">{heading}</h1>
          {/* NO LEAD PARAGRAPH. *"Remove all the highlighted text and the
              sections from the dashboard UI."* What it said — which set this is
              and on what basis — is the HEADING plus the figure beside it.

              IT USED TO SAY "the four tiles below, whose own captions carry the
              counts, the coverage and the reason a refused figure is refused",
              and the family have since asked for those tiles too. The counts and
              the basis are on the headline now and the coverage is on the footer
              cell it is about; the sentence is corrected here rather than left
              pointing at four cards that are gone, which is how a comment comes
              to describe a surface the next session then goes looking for.
              `Drilldown.lead` went with the paragraph rather than being left as
              a field nothing renders. */}
          {/* ── THE SETS THIS FIGURE IS MADE OF ─────────────────────────────
              *"just give the toggle option inside the Consolidated NAV link
              page"* — and the same for every other tile. Each of these was its
              own address, reached from a SECOND link inside a tile whose
              headline already linked elsewhere; a reader had to know which of
              two links answered their question and then had no way back to the
              other half of the same figure.

              THE TOGGLE IS A LINK, NOT A BUTTON. The facet is in the URL, so a
              reader can bookmark the half they care about and the browser's
              back button walks the halves — which is what the separate pages
              were good at and the one thing a piece of local state would lose.
              It also keeps the old `?of=listed` addresses meaningful. */}
          {d.facets.length > 1 && (
            <div className="mt-3 inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
              role="group" aria-label="Which set to show" data-testid="drilldown-facets">
              {d.facets.map((f, i) => {
                const active = f.key === d.activeFacet;
                /* A DIVIDER WHERE THE QUESTION CHANGES. The Current Value of
                   Holdings page splits its rows two ways — by side of the book,
                   and by whether a statement reports a cost — and each group
                   partitions the page on its own while the two together do not.
                   A reader adding the chips' counts across the divider would be
                   adding two partitions of one set. */
                const newGroup = i > 0 && !!f.group && f.group !== d.facets[i - 1].group;
                return (
                  <Fragment key={f.key}>
                    {newGroup && <span aria-hidden className="mx-1 h-4 w-px self-center bg-ink-600" data-facet-divider />}
                    <Link to={drilldownHref(d.id, d.key || undefined, f.key)}
                      aria-current={active ? "true" : undefined}
                      title={f.note || undefined}
                      data-facet-group={f.group ?? ""}
                      className={["rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                        active ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
                      {f.label}
                      <span className="ml-1.5 tabular opacity-70">{fmtNum(f.rows.length)}</span>
                    </Link>
                  </Fragment>
                );
              })}
            </div>
          )}
          {/* THE ACTIVE SET'S NOTE IS NOW ONLY ON THE CHIP THAT SELECTS IT.
              It was a paragraph under the toggle and the family asked for it to
              go; the reason a set exists — why a depository reports no cost, why
              an account cannot carry a rate — is still the `title` on each chip
              above, which is where a reader hovering that half looks for it.
              `Facet.note` therefore stays a field with a live caller. */}
          {/* ── NO PILL ROW ──────────────────────────────────────────────
              It carried three things and the family asked for all of them:

              · `behind <figure>` — which Morning CIO tiles this set stands
                behind. The crumb still reads "Morning CIO › What is behind the
                figure", every tile's own hover says what it opens, and the
                heading names the set. `Drilldown.backs` went with the pill.
              · `consolidated · each holding once` / `as printed · per account`
                — the DEDUPE BASIS, which is load-bearing and is NOT dropped:
                the holdings table's own subtitle below states it in the same
                two branches, and `check:pages` reads it there now.
              · the `<BasisPill>` — removed here for the same reason it was
                removed from Morning CIO's header, in the same request. See the
                note on that header for what §6 says and what it costs. */}
        </div>

        {/* ── THE HEADLINE, AND THE TWO FACTS THE TILES USED TO CARRY ──────
            *"remove the top 4 KPI tiles from the UI."* The four figures they
            printed — value, invested, unrealised P&L and return on cost — are
            every one of them a column of the table below, under its own
            heading, totalled in its own footer. A total belongs UNDER THE COLUMN
            IT TOTALS, which is what this repo settled when the allocation footer
            carried a money-weighted figure in a column of returns on cost, so
            the footer is the stronger surface and the tiles were the second one.

            TWO OF THE CAPTIONS WERE THE LAST STATEMENT OF A FACT ANYWHERE and
            neither is in the footer, so both are here rather than gone:

              · THE COUNTS. `358 holdings · 202 names · 32 accounts` is what the
                Morning CIO tile's own Positions and Distinct names reproduce,
                and the footer counts GROUPED rows (a name held in four folios is
                one) so it cannot state them.
              · THE DEDUPE BASIS, which decides whether a holding two members
                both carry is counted once or twice. It was a pill, then this
                page's table subtitle, and the family have now asked for that
                subtitle; it is four words here, at the same weight the pill had.

            The cost COVERAGE, the closed rows and the negligible floor moved to
            the footer cells' own hovers — weaker than a caption, said plainly
            rather than glossed, and the treatment the Portfolio Monitor already
            gives the same three facts at the family's own instruction. */}
        <div className="text-right">
          {/* THE TWO SENTENCES THAT SAT UNDER THE TABLE AND UNDER THE PAGE ARE THIS
              FIGURE'S HOVER. *"no one is reading these kind of … notes that you
              have put in across tables."* The counts they restated are the line
              beneath it; what they added — the figure to the rupee, how many
              entities, that the statements are drawn on their own dates, and the
              same holdings on statement marks alone — is one hover away on the
              figure it is about. Weaker than a caption, and recorded as such. */}
          <div className="font-display text-2xl font-bold tabular text-slate-100"
               data-hb-total={mv}
               title={`${full(mv)} across ${fmtNum(rows.length)} ${rows.length === 1 ? "holding" : "holdings"} and ${fmtNum(names.size)} ${names.size === 1 ? "name" : "names"}, held by ${fmtNum(owners.size)} ${owners.size === 1 ? "entity" : "entities"} in ${fmtNum(accounts.size)} ${accounts.size === 1 ? "account" : "accounts"}. Statements in this set are drawn on their own dates, so this total is a blend rather than one report date; Portfolio Monitor carries every account in full.${statementPortfolio && !d.absent ? ` On statement marks alone these holdings are worth ${full(statementValue(statementPortfolio.positions, rows))}${priceSources ? `; the difference is ${priceSources}` : ""}. A price may move a market value, a day change and a return on cost, and never a quantity, a cost basis, a realised gain or a dated cash flow.${depositoryNote ? ` ${depositoryNote}` : ""}` : ""}`}>{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500" data-hb-share={shareOfBook ?? ""} data-hb-book={bookMV}
               title={d.deduped
                 ? `Over the ${full(bookMV)} current value of holdings — the figure the top bar and Morning CIO's tile print.`
                 : `The figure above is each statement's row as printed, which is how this set is struck. Its share counts a holding two statements both report once (${full(setOnceMV)}), over the ${full(bookMV)} current value of holdings — the figure the top bar and Morning CIO's tile print.`}>
            {shareOfBook == null
              ? "no book value to measure a share against"
              : <>{shareOfBook.toFixed(1)}% of the {money(bookMV)} book</>}
          </div>
          {/* ACCRUED INCOME IS IN NO VALUE ON THIS SITE (DL-14): named beside the
              figure it is not in, because the Accrued income tile opens here. */}
          {!d.absent && accrued != null && (
            <div className="mt-0.5 text-[10.5px] text-slate-500" data-hb-accrued={accrued} data-hb-accrued-count={accruedRows.length}
                 title={`Dividends and interest declared on ${fmtNum(accruedRows.length)} holding${accruedRows.length === 1 ? "" : "s"} here and not yet received. The managers' printed totals fold it into market value on some rows and not others, so the book carries it as its own field and every market value on this site excludes it.`}>
              + {money(accrued)} accrued income, not in this figure
            </div>
          )}
          {/* THE RATE THE READER CLICKED, ON THE PAGE IT OPENS (B-06 — CK-B3,
              DSM-B2). The table below prints a FIFO return on cost; this is the
              money-weighted rate over the dated flows of the accounts it covers,
              from the one `bookMoneyWeighted` the tile reads. Two measures of two
              things, so each says which it is. */}
          {!d.absent && mw && d.activeFacet !== "not-covered" && (
            <div className="mt-1 text-[12.5px] text-slate-300" data-hb-mwr={mw.result.pct ?? ""}
                 data-hb-mwr-days={mw.result.windowDays ?? ""} data-hb-mwr-to={mw.lastClose ?? ""}
                 data-hb-mwr-accounts={mw.accountIds.length}
                 title={`Money-weighted: every dated contribution and withdrawal of the ${fmtNum(mw.accountIds.length)} account${mw.accountIds.length === 1 ? "" : "s"} whose statements carry an opening portfolio value, each closed at the value its own statement prints on its own date${mw.lastClose ? ` (the latest ${fmtDate(mw.lastClose)})` : ""}. ${mw.result.annualised ? "The window is at least a year, so this is the annual rate." : `The window is ${fmtNum(mw.result.windowDays ?? 0)} days and the rate is NOT annualised — compounding it onto a year would be a projection.`} The table's Return column is a different measure: FIFO on cost, cumulative since each purchase. They are not expected to agree.`}>
              Money-weighted{" "}
              {mw.result.pct == null
                ? <AbsentCell reason={mw.accountIds.length === 0
                    ? "No account in this set carries an opening portfolio value, so there are no dated flows to strike a money-weighted rate on."
                    : "The dated flows of these accounts do not solve to a single rate, so none is shown."} />
                : <span className={`mono font-semibold ${changeColor(mw.result.pct)}`}>{fmtPct(mw.result.pct, { sign: true, decimals: 1 })}</span>}
              <span className="text-slate-500">
                {" "}· {mw.result.annualised ? "annual rate" : `${fmtNum(mw.result.windowDays ?? 0)} days${mw.lastClose ? ` to ${fmtDate(mw.lastClose)}` : ""} · not annualised`}
              </span>
            </div>
          )}
          {!d.absent && (
            <div className="mt-1 text-[10.5px] text-slate-500"
                 data-hb-holdings={rows.length} data-hb-names={names.size}
                 data-hb-accounts={accounts.size} data-hb-deduped={d.deduped ? "1" : "0"}>
              {fmtNum(rows.length)} {rows.length === 1 ? "holding" : "holdings"} · {fmtNum(names.size)}{" "}
              {names.size === 1 ? "name" : "names"} · {fmtNum(accounts.size)}{" "}
              {accounts.size === 1 ? "account" : "accounts"} ·{" "}
              {d.deduped ? "each holding counted once" : "each statement's row as printed"}
            </div>
          )}
          {/* A ROW NO STATEMENT MARKS IS NOT IN THE STATEMENT FIGURE, and a reader
              holding the PDF has to be told why the two differ by more than price
              drift. One short line naming how many, the sentence in its hover —
              beside the headline whose hover carries the statement figure. */}
          {!d.absent && depositoryRows.length > 0 && (
            <div className="mt-0.5 text-[10.5px] text-amber-400/80" data-hb-depository={depositoryRows.length}
                 title={depositoryNote ?? undefined}>
              {[
                depositoryFunds.length > 0 ? `${depositoryFunds.length === 1 ? "1 holding" : `${fmtNum(depositoryFunds.length)} holdings`} at AMFI’s NAV` : null,
                depositoryShares.length > 0 ? `${depositoryShares.length === 1 ? "1 share" : `${fmtNum(depositoryShares.length)} shares`} at the live quote` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          )}
          {/* ── AND THE CAPITAL INVESTED IN IT, BESIDE WHAT IT IS WORTH ────────
              *"inside that page … add the columns and data regarding the invested
              capital that we were showing as a separate page … a consolidated
              view."* Capital invested was its own page; it is this line and the
              Share of invested column now, on every set this page opens.

              THE RETURN IS PRINTED ONLY WHERE THE COST COVERS THE SET — the same
              `coveredReturn` test the footer and Morning CIO's allocation row
              run, so a row that reads "—" there never opens onto a percentage
              here. The gain is struck over the holdings that report a cost and
              says how many those are, because Invested covers a narrower set
              than the value above it and a reader subtracting the two would
              otherwise land on a figure neither describes. */}
          {!d.absent && (
            <div className="mt-1.5 text-[12.5px] text-slate-300" data-hb-invested={invested ?? ""}
                 data-hb-invested-of={rows.length - noCost.length}>
              {invested == null ? (
                <span title={setCost.vacuous ? `In this set, ${VACUOUS_COST_REASON}.` : "No statement in this set reports a cost basis, so there is no capital invested to show — absent, not zero."}>
                  Invested <span className="text-slate-500">{DASH}</span>
                </span>
              ) : (
                <>
                  <span title={investedBasisNote(ret.fifo, (n) => money(n)) || undefined}>
                    Invested <span className="mono font-semibold text-slate-100">{money(invested)}</span>
                  </span>
                  {/* THE GAIN IS FIFO'S, the figure the return beside it divides:
                      unrealised on what is held plus what was realised on units
                      sold. The unrealised half alone is the footer's own column. */}
                  {ret.fifo.gain != null && (
                    <span title={fifoBasisNote(bookReturn?.pct != null ? bookReturn.fifo : ret.fifo, (n) => money(n)) || undefined}> · gain <span className={`mono ${changeColor(bookReturn?.pct != null ? bookReturn.fifo.gain : ret.fifo.gain)}`}>{money(bookReturn?.pct != null ? bookReturn.fifo.gain : ret.fifo.gain, true)}</span>
                      {(bookReturn?.pct ?? ret.pct) != null && (
                        <span className={`mono ${changeColor(bookReturn?.pct ?? ret.pct)}`} data-hb-return={bookReturn?.pct ?? ret.pct ?? ""}>
                          {" "}({fmtPct(bookReturn?.pct ?? ret.pct, { sign: true, decimals: 1 })})
                        </span>
                      )}
                    </span>
                  )}
                  {/* THE WHOLE-BOOK RETURN NAMES ITS SET ON ITS FACE (B-07), in the
                      words the Consolidated return tile and the allocation Total
                      row print beside the same figure. */}
                  {bookReturn?.pct != null ? (
                    <span className="text-slate-500" data-costed-label
                      title={`The whole-book return on cost is struck over the holdings whose statement reports a cost; the ${money(bookReturn.set.bookValue - bookReturn.set.costedValue)} that reports none is in the value and in no capital figure. A depository reports what is held, never what it was bought for.`}>
                      {" "}{bookReturnLabel}
                    </span>
                  ) : noCost.length > 0 && (
                    <span className="text-slate-500"
                      title={`${fmtNum(noCost.length)} holding${noCost.length === 1 ? "" : "s"} worth ${money(withoutCostMV)} report no cost: they are in the value above and in no capital figure. A depository reports what is held, never what it was bought for.`}>
                      {" "}· {fmtNum(rows.length - noCost.length)} of {fmtNum(rows.length)} report a cost
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {d.absent ? (
        <Card><AbsentSection what={d.absent.what} needs={d.absent.needs} /></Card>
      ) : (
        <>
          {/* ── NO KPI TILES ─────────────────────────────────────────────
              *"remove the top 4 KPI tiles from the UI."* Market value,
              Invested, Unrealised P&L and Return on cost were four figures
              above a table whose footer already totals all four, each under the
              heading of the column it totals. See the headline block above for
              what the four CAPTIONS carried and where each fact went; nothing
              they said is dropped, and the two that had no second surface are
              on the headline rather than in a hover. */}

          {/* ── THE ARITHMETIC, WHERE THE READER LANDED ────────────────────
              *"even the calculation that we're showing that appears when click
              the underlined no. we can show that inside the clickable KPI
              pages."* It was a popover on the tile, opened by a dashed
              underline under the figure — a second affordance on a card whose
              whole surface is already the click target, and a box that had to be
              dismissed before the reader could do anything else.

              IT IS STRUCK ON THE ROWS BELOW IT, not on the whole scope: the
              worked line comes from `d.rows`, which is the ACTIVE facet, so a
              reader who has toggled to the private half sees that half's own
              arithmetic rather than the book's under a heading reading
              "Private". That is also why it sits here — the figures it explains
              are directly above it and the rows it is summed over directly
              below, which a floating popover could never be. */}
          {/* ── NO "HOW THIS FIGURE IS WORKED OUT" CARD ──────────────────
              Stage 10y moved the KPI tiles' formula popovers here, and Stage
              10ac moved the allocation table's; the family have now asked for
              the card itself. `drilldownFormula` had exactly one caller and is
              DELETED rather than left exported — a builder nothing calls is the
              failure this repo keeps naming.

              TWO OF ITS LINES WERE THE LAST STATEMENT OF A FACT ANYWHERE, and
              both were re-homed before the card went, to the hover of the very
              tile that opens this page:

              · the accrued income the NAV excludes (₹47.1 L over 125 holdings),
                which is exactly the amount by which a manager's printed total
                runs above ours;
              · the XIRR's window and its refusal to annualise it, which is
                Stage 10g(ii)'s guard — this figure once read +99.0% with
                nothing miscalculated.

              Everything else the card said is on this page's own four tiles:
              the total, the counts, the cost coverage, and the reason a refused
              return is refused. */}
          {/* ── NO "N ACCOUNTS OUTSIDE THIS FIGURE" CARD ──────────────────────
              A block listing forty-four raw account numbers, at the family's
              request. What it existed to prevent — a reader taking a partial
              figure for a whole-book one — is still prevented, and better: the
              facet toggle at the top of this page carries "Not covered" with its
              own row count, so the holdings outside the rate are one click away
              as HOLDINGS rather than as a wall of digits. The coverage is also
              on the tile that opens this page and on `/performance`, which names
              each account with the document it is missing. */}


          {/* ── NO SUBTITLE PARAGRAPH ────────────────────────────────────
              *"remove the highlighted text."* It carried four claims and every
              one was checked before it went:

                · WEIGHT IS WITHIN THIS SET — the footer's Weight cell prints
                  100% and names this set's own total as the denominator in its
                  hover, which is the column that claim is about.
                · THE DEDUPE BASIS — load-bearing, and NOT dropped: it is four
                  words under the headline figure above, where the counts it
                  governs are.
                · THE CLOSED POSITIONS and THE NEGLIGIBLE FLOOR — counts of rows
                  the table does NOT draw, so they are on the footer's own
                  row-count cell, beside the "N filtered out" it already
                  carries. That is the treatment the Portfolio Monitor gives the
                  identical two facts, at the family's own instruction.

              A hover is weaker than a caption and that is said rather than
              glossed. What it buys is the screen the family asked for.

              ── AND THE FILTER BOX IS WIDER, AND CANNOT BE SQUEEZED ──────────
              *"fix the search bar at the top of the table, it is very small."*
              `w-56` was a width on a flex ITEM with nothing stopping it
              shrinking, and the subtitle beside it was a paragraph — so the box
              collapsed to about a third of its stated width and clipped its own
              placeholder to "Filter b". Removing the paragraph alone would have
              hidden that rather than fixed it: a long enough title would bring
              it straight back. `shrink-0` is the fix and the extra width is the
              request. */}
          <Card className="mt-5" pad={false}
            title="The holdings behind it"
            right={<SearchInput value={q} onChange={setQ} placeholder="Filter by name or ISIN…" className="w-72 shrink-0"
              suggestions={[...new Set(rows.map((r) => r.security))].sort()} />}>
            {shown.length === 0 ? (
              <div className="px-5 pb-5 pt-4">
                <AbsentSection what="Nothing matches that filter"
                  needs={`The set holds ${fmtNum(rows.length)} holdings; none of their names or ISINs contains "${q.trim()}". Clear the filter to see them all.`} />
                {/* …unless the book knows WHY that name is nowhere: a review line no
                    statement reports is absent on purpose, and saying so is the
                    difference between a gap and an apparent defect. */}
                <AbsentFromBook query={q} className="mx-auto mt-3 max-w-2xl" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full whitespace-nowrap text-sm">
                  <thead className="border-b border-ink-700">
                    <Tr view={view}>
                      <SortHeader col="unit" view={view} align="left">{unitHeading}</SortHeader>
                      <SortHeader col="heldIn" view={view} align="left">Held in</SortHeader>
                      <SortHeader col="invested" view={view}>Invested</SortHeader>
                      <SortHeader col="value" view={view}>Value</SortHeader>
                      <SortHeader col="weight" view={view}>Weight</SortHeader>
                      <SortHeader col="costShare" view={view}
                        title="This row's share of the capital invested in the set — its Invested over the set's: the capital paid in for a whole PMS mandate, the cost of what is held for anything else. Beside Weight, its share of today's value.">
                        Share of invested
                      </SortHeader>
                      <SortHeader col="pnl" view={view}>Unreal. P&amp;L</SortHeader>
                      <SortHeader col="return" view={view}>Return</SortHeader>
                    </Tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/60">
                    {items.map((item) => {
                      /* SECTION HEADINGS are rows of the SAME table rather than
                         separate tables, so the columns stay aligned and the
                         footer below still totals every row above it. */
                      if (item.kind === "head") return (
                        /* A SECTION HEADING IS A SUBTOTAL ROW, so it follows the
                           reader's column order through `TrFoot` — the same
                           mechanism the footer uses, and for the same reason: its
                           label spans the leading columns that carry no figure,
                           and that span is a function of the order rather than a
                           literal. With nothing dragged it is `colSpan={3}`,
                           which is what it always was. */
                        <TrFoot key={`sec:${item.key}`} view={view}
                          data-aif-section={item.key} data-aif-section-mv={item.mv}
                          data-aif-section-funds={item.n}
                          className="bg-ink-800/50 px-4 py-1.5"
                          label={
                            <>
                              <span className="label-xs text-slate-300">{item.key}</span>
                              <span className="ml-2 text-[11px] normal-case text-slate-500">
                                {item.n} {item.n === 1 ? "fund" : "funds"}
                                {item.key === PRIVATE_EQUITY_SECTION && " \u00b7 the fund\u2019s own paperwork calls it private equity or venture capital"}
                                {item.key === AIF_UNSTATED_SECTION && " \u00b7 no statement prints a SEBI category"}
                              </span>
                            </>
                          }
                          cells={{
                            value: <td key="value" className="bg-ink-800/50 px-4 py-1.5 text-right mono text-[12px] text-slate-300">{money(item.mv)}</td>,
                            weight: <td key="weight" className="bg-ink-800/50 px-4 py-1.5 text-right mono text-[12px] text-slate-400">{weight(item.mv) ?? DASH}</td>,
                            pnl: <td key="pnl" className="bg-ink-800/50 px-4 py-1.5" />,
                            return: <td key="return" className="bg-ink-800/50 px-4 py-1.5" />,
                          }} />
                      );
                      const g = item.group;
                      const r = coveredReturn(g.rows, fifoOpts);
                      const w = weight(g.mv);
                      const entities = [...new Set(g.rows.map((x) => ownerOf(accIdx, x)))];
                      const accounts = [...new Set(g.rows.map((x) => x.accountId))];
                      const expandable = g.rows.length > 1;
                      const isOpen = open.has(g.key);
                      return (
                        <Fragment key={g.key}>
                          {/* THE ROW'S OWN SECURITY KEY, so a claim about WHICH
                              holdings this page draws is struck on structure and
                              not on a rendered name. `g.key` carries an `S:`/`M:`
                              prefix saying how the row was grouped rather than
                              what it is, which is why this is the security's. */}
                          <Tr view={view} className="hover:bg-ink-700/40" data-hb-key={g.rows[0].securityKey}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {/* THE ROW OPENS THE THING IT NAMES. A mandate
                                    goes to its own page, which lists every share
                                    the manager picked — the look-through the
                                    family is asking for, and the one this book
                                    actually carries. A fund or a scheme goes to
                                    its holding page, which states plainly that
                                    the companies inside it are the manager's and
                                    are not reported here. */}
                                <Link to={g.href} className="font-medium text-slate-100 hover:text-champagne-400">
                                  {g.label}
                                </Link>
                                {expandable && (
                                  <button type="button"
                                    onClick={() => setOpen((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                                      return next;
                                    })}
                                    aria-expanded={isOpen}
                                    title={`${isOpen ? "Hide" : "Show"} the ${g.rows.length} statement lines this row is summed from`}
                                    className="rounded p-0.5 text-slate-500 transition-colors hover:bg-ink-700 hover:text-slate-200">
                                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                {showBucket && (
                                  <span className="text-[10.5px] text-slate-500"> · {bucketLabel(holdingBucket(g.rows[0], engagementOf(accIdx, g.rows[0])))}</span>
                                )}
                                {/* THE ROW STILL NAMES ITS SEBI CATEGORY even
                                    when it sits under Private Equity, which is
                                    the whole reason those two can be separate
                                    sections without misleading anybody: a PE
                                    fund IS a Category I or II AIF, and a reader
                                    adding up the category sections has to be
                                    able to see where it went. Where no category
                                    is stated the chip says so and its hover
                                    names the specific reason — a statement that
                                    prints two categories and one that prints
                                    none send a reader to different documents. */}
                                {aifSectioned && (() => {
                                  const read = aifCategoryOf(accIdx, g.rows[0]);
                                  // A CATEGORY THE FAMILY DECLARED SAYS SO. It
                                  // files the fund exactly as firmly as a printed
                                  // one, and a section heading looks equally
                                  // authoritative either way — so the difference
                                  // is on the row, in words, not in a colour.
                                  return read.category
                                    ? <span className="text-[10.5px] text-slate-500" data-aif-row-cat={read.category}
                                        data-aif-row-cat-source={read.source ?? undefined}
                                        title={read.source === "family"
                                          ? "No statement for this fund prints a SEBI category. The family declared it " + read.category + ", and this book files it there on their word."
                                          : undefined}>
                                        {" "}· {read.category}{read.source === "family" ? " · declared by the family" : ""}
                                      </span>
                                    : <span className="text-[10.5px] text-slate-500" data-aif-row-cat="" title={aifCategoryWhy(read)}> · category not stated</span>;
                                })()}
                                {/*
                                  NO `redeemed` PILL HERE ANY MORE.

                                  It existed because this page listed the set
                                  BEHIND a figure and Positions counted the closed
                                  rows, so a ₹0 row had to say its zero was a
                                  MEASUREMENT rather than a feed nobody wired. The
                                  family have since asked for these pages to list
                                  current holdings only, so `resolveDrilldown`
                                  filters `isRedeemedToNil` out at the source and
                                  this branch could never fire again — a condition
                                  that is always false, wearing a confident
                                  explanation, is the dead-code-that-looks-alive
                                  failure this repo keeps naming.

                                  The fact it carried is not lost: the table's own
                                  subtitle counts what was left out, and the
                                  Portfolio Monitor still lists the closed rows in
                                  full with the money that came back, in the
                                  Transactions card's Capital in and out table.
                                */}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-[12px] text-slate-400">
                              {g.kind === "mandate" ? (
                                <span title={ROUTE_NOTE.mandate}>{providerOf(accIdx, g.rows[0])} · {ROUTE_LABEL.mandate}</span>
                              ) : accounts.length === 1 ? (
                                <>
                                  {/* A NAME HELD IN ONE MANDATE STILL REACHES IT.
                                      In a filtered set a mandate is not a row of
                                      its own, so this cell is the only way in. */}
                                  {isMandateHeld(engagementOf(accIdx, g.rows[0]))
                                    ? <Link to={`/mandate/${encodeURIComponent(g.rows[0].accountId)}`} className="text-champagne-400 hover:underline">
                                        {mandateLabelWithOwner(accIdx.get(g.rows[0].accountId), "")}
                                      </Link>
                                    : providerOf(accIdx, g.rows[0])}
                                  <span className="ml-1.5 text-[10.5px] text-slate-600"> · {ownerOf(accIdx, g.rows[0])}</span>
                                </>
                              ) : (
                                <span title={g.rows.map((x) => `${providerOf(accIdx, x)} ${accIdx.get(x.accountId)?.accountNo ?? ""} · ${ownerOf(accIdx, x)}`).join("\n")}>
                                  {accounts.length} accounts · {entities.length} {entities.length === 1 ? "entity" : "entities"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right mono text-slate-400">
                              {g.cost == null
                                ? <AbsentCell reason={g.kind === "mandate"
                                    ? `No row on the ${providerOf(accIdx, g.rows[0])} statement for this mandate reports a cost.`
                                    : accounts.length === 1
                                      ? `No cost on the ${providerOf(accIdx, g.rows[0])} statement for this holding — a depository reports what is held, never what it was paid for. Absent, not zero.`
                                      : `None of the ${accounts.length} statements carrying this name reports a cost for it — a depository reports what is held, never what it was paid for. Absent, not zero.`} />
                                : g.capital
                                  ? <span title={investedBasisNote(g.capital, (n) => money(n))} data-invested-capital={g.invested ?? undefined}
                                      data-invested-cost-held={g.cost}>{money(g.invested)}</span>
                                  : g.withoutCost > 0
                                  ? <span title={costCoverNote(costedFigures(g.rows), (n) => money(n), fmtNum)}>{money(g.cost)}</span>
                                  : money(g.cost)}
                            </td>
                            <td className="px-4 py-2.5 text-right mono text-slate-200">{money(g.mv)}</td>
                            <td className="px-4 py-2.5 text-right mono text-slate-400">
                              {w ?? <AbsentCell reason="This set is worth nothing, so a share of it cannot be struck — a 0.0% here would read as a measured weight." />}
                            </td>
                            <td className="px-4 py-2.5 text-right mono text-slate-400" data-hb-cost-share>
                              {costShare(g.invested) ?? <AbsentCell reason={g.invested == null
                                ? "No statement reports what this holding cost, so it has no share of the capital invested — absent, not zero."
                                : "No holding in this set reports a cost, so there is no invested total to take a share of."} />}
                            </td>
                            <td className={`px-4 py-2.5 text-right mono ${g.pnl == null ? "" : changeColor(g.pnl)}`}>
                              {g.pnl == null ? <AbsentCell reason="Needs a cost these statements do not report." />
                                : g.capital ? <span title={capitalGapNote([g.capital], money)} data-hb-pnl-on-held>{money(g.pnl, true)}</span>
                                : g.withoutCost > 0 ? <span title={costCoverNote(costedFigures(g.rows), (n) => money(n), fmtNum)}>{money(g.pnl, true)}</span>
                                : money(g.pnl, true)}
                            </td>
                            <td className={`px-4 py-2.5 text-right mono ${r.pct == null ? "" : changeColor(r.pct)}`}>
                              {r.pct == null
                                ? <AbsentCell reason={g.cost == null
                                    ? "No statement here reports a cost, so there is no return to strike."
                                    : `A cost is reported on ${g.rows.length - g.withoutCost} of the ${g.rows.length} statements behind this row, so Invested and Value describe different sets and a percentage across them would divide one by the other.`} />
                                : fmtPct(r.pct, { sign: true, decimals: 1 })}
                            </td>
                          </Tr>
                          {/* THE STATEMENT LINES, WHERE A READER ASKS FOR THEM.
                              The Positions count on Morning CIO counts these, and
                              this is where they live now that the page has no
                              global mode — per row, opened on demand, rather than
                              a switch that reshapes the whole table. */}
                          {isOpen && g.rows.map((x) => (
                            <Tr view={view} key={`${g.key}-${x.accountId}-${x.assetClass}`} className="bg-ink-900/40 text-[12px]">
                              <td className="py-1.5 pl-10 pr-4 text-slate-400">
                                {g.kind === "mandate"
                                  ? <Link to={stockHref(x.securityKey)} className="hover:text-champagne-400">{x.security}</Link>
                                  : <span className="text-slate-500">as {accIdx.get(x.accountId)?.provider ?? "this platform"} reports it</span>}
                              </td>
                              <td className="px-4 py-1.5 text-slate-400">
                                {providerOf(accIdx, x)} {accIdx.get(x.accountId)?.accountNo ?? ""}
                                <span className="ml-1.5 text-slate-600"> · {ownerOf(accIdx, x)}</span>
                              </td>
                              <td className="px-4 py-1.5 text-right mono text-slate-500">
                                {x.costBasis == null
                                  ? <AbsentCell reason={`No cost on the ${providerOf(accIdx, x)} statement for this holding.`} />
                                  : money(x.costBasis)}
                              </td>
                              <td className="px-4 py-1.5 text-right mono text-slate-400"
                                title={x.quantity === null ? "the family's consolidated review records no unit count for this line" : `${fmtNum(x.quantity, x.quantity % 1 === 0 ? 0 : 3)} units on this statement`}>{money(x.marketValue)}</td>
                              {/* THIS LINE'S WEIGHT, under the Weight heading. The
                                  cell printed the line's QUANTITY here — a unit
                                  count under a column of percentages, which is the
                                  caption-does-not-describe-its-figure failure one
                                  row down. The quantity is the Value cell's hover. */}
                              <td className="px-4 py-1.5 text-right mono text-slate-500">
                                {weight(x.marketValue) ?? <AbsentCell reason="This set is worth nothing, so a share of it cannot be struck — a 0.0% here would read as a measured weight." />}
                              </td>
                              <td className="px-4 py-1.5 text-right mono text-slate-500">
                                {g.capital
                                  ? <AbsentCell reason="This mandate enters Invested at the capital paid into it, and a mandate's capital is not divided among its shares — so a single share has no part of it to show." />
                                  : costShare(x.costBasis) ?? <AbsentCell reason="No cost on this statement line, so it has no share of the capital invested." />}
                              </td>
                              <td className={`px-4 py-1.5 text-right mono ${x.unrealizedPnL == null ? "" : changeColor(x.unrealizedPnL)}`}>
                                {x.unrealizedPnL == null ? <AbsentCell reason="Needs a cost this statement does not report." /> : money(x.unrealizedPnL, true)}
                              </td>
                              <td className={`px-4 py-1.5 text-right mono ${x.returnPct == null ? "" : changeColor(x.returnPct)}`}>
                                {x.returnPct == null ? <AbsentCell reason="Needs a cost this statement does not report." /> : fmtPct(x.returnPct, { sign: true, decimals: 1 })}
                              </td>
                            </Tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  {/* THE THREE FACTS THE REMOVED CAPTIONS CARRIED, each handed
                      to the cell it is about. `holdings` and `noCost` are the
                      SET's, not the grouped rows' — the coverage is a fact about
                      statements and a row can club four of them. */}
                  <Foot view={view} label={`${fmtNum(groups.length)} ${groups.length === 1 ? unitWord : unitWord + "s"}`}
                    hidden={hidden} money={money}
                    mv={sum(groups.map((g) => g.mv))}
                    cost={setCost.vacuous ? null : sumOrNull(groups.map((g) => g.invested))}
                    vacuous={setCost.vacuous}
                    capitalNote={(() => {
                      const f = groups.filter((g) => g.capital).map((g) => g.capital!);
                      if (!f.length) return "";
                      const paid = sum(f.map((x) => x.wholeContributed)), held = sum(f.map((x) => x.wholeCostHeld));
                      return `${f.length} whole mandate${f.length === 1 ? " enters" : "s enter"} at the capital paid in, ${money(paid)} — what ${f.length === 1 ? "its" : "their"} return is divided by — where the cost of the shares ${f.length === 1 ? "it holds" : "they hold"} now is ${money(held)}; this total is the sum of the Invested cells above it`;
                    })()}
                    capitalGap={capitalGapNote(groups.filter((g) => g.capital).map((g) => g.capital!), money)}
                    pnl={setCost.vacuous ? null : sumOrNull(groups.map((g) => g.pnl))}
                    withoutCostMV={sum(groups.map((g) => g.mv - g.costedMV))}
                    ret={coveredReturn(groups.flatMap((g) => g.rows), fifoOpts)}
                    // THE COUNTS OF THE ROWS THIS FOOTER TOTALS (DSM-C8). They were
                    // the whole set's while the value beside them was the filtered
                    // rows', so under a search the coverage sentence mixed two sets.
                    holdings={shown.length} noCost={shown.filter((r) => r.costBasis == null).length}
                    setMV={mv} setInvested={invested}
                    // THE WHOLE-BOOK RETURN, NAMED (B-07) — only where this footer
                    // totals the whole of that set: under a search it totals the
                    // rows that matched, and its return is theirs.
                    bookReturn={hidden === 0 && bookReturn?.pct != null ? { pct: bookReturn.pct, label: bookReturnLabel, fifo: bookReturn.fifo } : null}
                    closedExcluded={d.closedExcluded} negligible={d.negligibleExcluded} />
                </table>
              </div>
            )}
            {/* ── THE FOLIOS THAT VALUE NOTHING, NAMED UNDER THE TABLE ──────
                Every Category I AIF this family owns is an angel fund that
                publishes no NAV, so a holdings table can never draw one. A
                drill-down clubbed by category that simply has no Category I
                heading tells a reader they hold none, which is false — so the
                folios are listed with the capital they have DRAWN, and the note
                says plainly that drawn capital is what was paid rather than
                what the stake is worth and is in no total on this page. */}
            {/*
              ── A DROPDOWN, AT THE FAMILY'S REQUEST, AND THE SUMMARY STILL SAYS
              WHAT IS INSIDE IT ──────────────────────────────────────────────

                *"the 'Held, and valued by no statement' section needs to be
                 hidden as a drop down list."*

              Collapsed by default, so the table is what the page is. What it
              must not become is a fold a reader has no reason to open: the
              summary line carries the COUNT, the categories and the drawn total
              — the Category I folios above all, because this is the only place
              on the page a Category I AIF appears — and the list is one click
              away. A `<details>` rather than state, so it needs no handler and
              every row stays in the DOM for the structural checks. The
              paragraph that stood inside it is the summary's hover — the
              family asked for the notes around the tables to go.
            */}
            {unvalued.length > 0 && (
              <details className="group border-t border-ink-700/60 px-5 pt-4" data-testid="aif-unvalued">
                <summary className="cursor-pointer list-none text-[11.5px] text-slate-400 [&::-webkit-details-marker]:hidden"
                  title={`${fmtNum(unvalued.length)} AIF ${unvalued.length === 1 ? "folio reports" : "folios report"} units and the capital drawn against a commitment and no NAV anywhere, so no position stands for ${unvalued.length === 1 ? "it" : "them"} in the table above and ${unvalued.length === 1 ? "its" : "their"} money is in none of its totals. Drawn capital is what was paid, never what the stake is worth.`}>
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
                    <span className="label-xs text-slate-300">Held, and valued by no statement</span>
                  </span>
                  <span className="ml-2" data-aif-unvalued-summary>
                    {fmtNum(unvalued.length)} AIF {unvalued.length === 1 ? "folio" : "folios"} with no NAV
                    {" · "}{unvaluedBySection.map(([k, n]) => `${k} ×${n}`).join(", ")}
                    {unvaluedDrawn != null && <> · <span className="mono">{money(unvaluedDrawn)}</span> drawn, in no total</>}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1">
                  {unvalued.map((f) => (
                    <li key={f.accountId} className="text-[11.5px] text-slate-400" data-aif-unvalued={f.section}
                        /* THE FUND'S OWN REASON, which `build-book` wrote from the
                           statement. It was on the record and rendered nowhere in
                           the first draft — the field carrying the right answer
                           into no caller, which is this repo's most-repeated
                           defect and which this change committed three times. */
                        title={f.reason ?? undefined}>
                      <span className="text-slate-300">{f.section}</span> · {f.provider} {f.accountNo} · {f.owner} ·{" "}
                      {f.drawn == null
                        ? <span title="No statement for this folio prints the capital called to date.">drawn {DASH}</span>
                        : <span className="mono">{money(f.drawn)} drawn</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* ── …AND THE AIF LINES THE REVIEW HOLDS AT COST ───────────────

              The same shape as the fold above, and a DIFFERENT fact: those
              folios publish no NAV at all, these are valued — at what the
              family paid — on the row this bucket's at-cost sibling opens. Two
              folds rather than one, because a reader who opens either must not
              be told the other's reason. Closed, and the summary carries the
              counts, the categories and the cost, so the Category I claim is on
              the page without opening anything.
            */}
            {atCost.length > 0 && (
              <details className="group border-t border-ink-700/60 px-5 pt-4" data-testid="aif-at-cost">
                <summary className="cursor-pointer list-none text-[11.5px] text-slate-400 [&::-webkit-details-marker]:hidden"
                  title={`${fmtNum(atCost.length)} AIF ${atCost.length === 1 ? "fund is" : "funds are"} recorded by the family's own consolidated review at what was paid for ${atCost.length === 1 ? "it" : "them"} and at no valuation, so ${atCost.length === 1 ? "it is" : "they are"} drawn on the ${bucketLabel(AT_COST_BUCKET)} row rather than here and ${atCost.length === 1 ? "its" : "their"} cost is in none of this table's totals. Every Category I AIF this family owns is among them.`}>
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
                    <span className="label-xs text-slate-300">Held at cost, on another row</span>
                  </span>
                  {/* THE SAME SHAPE AS THE FOLD ABOVE, AND FOR ITS REASON: a count,
                      the categories and the money, in as few lower-case words as
                      will carry them. Past 60 characters a block of ten or more
                      such words reads as a sentence and is a note about the page
                      rather than a figure on it (Stage 10cp), and the first
                      draft of this line carried twelve. What it says at length
                      is the summary's own hover. */}
                  <span className="ml-2" data-aif-at-cost-summary>
                    {fmtNum(atCost.length)} AIF {atCost.length === 1 ? "fund" : "funds"} at cost
                    {" · "}{atCostBySection.map(([k, n]) => `${k} ×${n}`).join(", ")}
                    {" · "}<span className="mono">{money(sum(atCost.map((f) => f.cost)))}</span> in no total
                  </span>
                </summary>
                <ul className="mt-2 space-y-1">
                  {atCost.map((f) => (
                    <li key={`${f.section}|${f.key}`} className="text-[11.5px] text-slate-400" data-aif-at-cost={f.section}>
                      <span className="text-slate-300">{f.section}</span> · {f.security} ·{" "}
                      <span className="mono">{money(f.cost)}</span> at cost
                      {f.lines > 1 && <> · {fmtNum(f.lines)} lines</>}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[11.5px]">
                  <Link to={drilldownHref("bucket", AT_COST_BUCKET)} className="text-champagne-400 hover:underline"
                    data-aif-at-cost-href>{bucketLabel(AT_COST_BUCKET)} →</Link>
                </div>
              </details>
            )}
          </Card>

          {/* ── HOW THIS FIGURE IS WORKED OUT ────────────────────────────────
              *"in money weighted return drill down page add a small
              derivation/formula section that tells how it is being calculated.
              It should be explain in short and direct language and clear legible
              font size."*

              SCOPED TO THIS ONE FIGURE. Every other set on this page is a sum
              over the rows below it and needs no derivation; a money-weighted
              rate is the one figure here a reader cannot get to by adding a
              column up. Set at `text-sm` rather than the 11–12px this page uses
              for captions, because legibility was half the request.

              ── AND IT SITS BELOW THE TABLE ──────────────────────────────────
              *"show the table first and the formula section below it."* It
              opened above the rows, which put a derivation between the reader
              and the holdings they clicked in to see. The table is what this
              page is; the derivation explains the figure in the header, so it
              reads as a footnote to the page rather than as a preamble to it,
              and the rows start one card higher. Nothing about what it says
              changed — the claim is about ORDER, so it is asserted on the two
              cards’ own geometry rather than on any word either of them prints.

              EVERY CLAIM IS THE ARITHMETIC `pooledXirr` ACTUALLY RUNS — the
              per-account terminal date, the sub-year refusal (Stage 10g(ii)'s
              guard, which this figure once broke by reading +99.0%), and trades
              not being flows. The account count is DERIVED from the rows, never
              typed. */}
          {d.id === "measured" && (
            <Card className="mt-5" title="How this is worked out">
              {/* A HANDLE, so the ORDER claim above is struck on the two cards’
                  own geometry. The table is found by its footer, which is
                  structural at that end too — matching either card by its title
                  would make a layout claim depend on prose a redesign is free to
                  reword, which is the failure this sweep keeps finding. */}
              <div data-hb-derivation className="space-y-3 text-sm leading-relaxed text-slate-300">
                {/* SHORT AND DIRECT, AS IT WAS ASKED FOR — and now one line
                    each (Stage 10cp). The family asked for this section by
                    name, so it stays; what went is the sentences, which are
                    each line's hover. Every rule is still on the face. */}
                <p data-hb-derivation-lead
                  title={`Every dated capital movement in or out of the ${fmtNum(coveredAccounts)} account${coveredAccounts === 1 ? "" : "s"} whose statements publish an opening portfolio value, with that opening value as the first flow and each account's own closing market value as the last. The rate is the one that makes them balance.`}>
                  The rate that balances the dated flows of{" "}
                  <span className="text-slate-100">{fmtNum(coveredAccounts)}</span>{" "}
                  account{coveredAccounts === 1 ? "" : "s"}
                </p>
                <p className="mono rounded-md border border-ink-700 px-3 py-2 text-[13px] text-slate-200">
                  find r where &nbsp;Σ&nbsp; flow ÷ (1 + r)<sup>days ÷ 365</sup> &nbsp;=&nbsp; 0
                </p>
                <ul className="space-y-1.5 pl-4">
                  <li className="list-disc"
                    title="Not one shared date — closing them all on the newest would credit the earlier ones with standing still.">
                    Each account closes on <span className="text-slate-100">its own report date</span>
                  </li>
                  <li className="list-disc"
                    title="Over a window shorter than a year this is the return earned over that window, never compounded up to a yearly rate.">
                    Under a year: the return over that window, <span className="text-slate-100">not annualised</span>
                  </li>
                  <li className="list-disc"
                    title="A buy or a sell moves cash inside the account, and its proceeds are already in the closing value. Only money the family put in or took out counts.">
                    A buy or a sell is <span className="text-slate-100">not a flow</span>
                  </li>
                </ul>
              </div>
            </Card>
          )}

          {/* THE COMPANION TABLE IS GONE — its rows are a FACET now.
              It rendered the second set as a whole extra table below the first,
              which meant two tables of the same shape on one page and a reader
              scrolling past a hundred rows to reach the set they came for. The
              toggle above shows one set at a time, with the same rows, the same
              totals and an address of its own. */}
        </>
      )}

      {/* The statement-basis total is in the headline figure's hover —
          `statementPortfolio` is the book the live feed never touches, and a
          reader holding the PDF needs it to reconcile the two. So is the
          sentence naming the holdings no statement marks, whose short form is
          the line under the headline. */}
    </div>
  );
}

/**
 * The same holdings valued on the book the feed never touches.
 *
 * Matched on (account, security), which is the identity a position has — not on
 * `securityKey` alone, which would sum every account's row for a name the scope
 * only carries once.
 */
/**
 * WHY A CAPITAL-BASIS ROW'S INVESTED + UNREALISED DOES NOT COME TO ITS VALUE
 * (DL-12). A whole PMS mandate enters Invested at the capital paid into it —
 * what its FIFO return divides by — while Unrealised stays on the cost of the
 * shares it holds now, because that is what "unrealised" means. The two
 * differ by what the mandate has realised on shares already sold, less what
 * was taken out of it: `paid − held = withdrawn − realised`. Stated with the
 * figures, on the cell a reader adds up, because the table has no Realised
 * column to make the sum close.
 */
function capitalGapNote(
  caps: readonly Pick<FifoTotals, "wholeContributed" | "wholeCostHeld" | "wholeWithdrawn">[],
  money: (n: number | null | undefined, sign?: boolean) => string,
): string {
  if (!caps.length) return "";
  const paid = sum(caps.map((c) => c.wholeContributed));
  const held = sum(caps.map((c) => c.wholeCostHeld));
  const withdrawn = sum(caps.map((c) => c.wholeWithdrawn));
  const realised = withdrawn - paid + held;
  const n = caps.length;
  return `Unrealised is struck on the cost of the shares ${n === 1 ? "this mandate holds" : `the ${n} whole mandates hold`} now (${money(held)}); `
    + `Invested is the capital paid in (${money(paid)}), which is what the return divides by. `
    + `So Invested + Unrealised − Value = ${money(paid - held, true)}: what was taken out (${money(withdrawn)}) less what was `
    + `realised inside the mandate — gains booked on shares already sold and income collected, less fees (${money(realised, true)}) — which the Return column counts and neither Invested nor Unrealised does.`;
}

function statementValue(statement: Position[], rows: Position[]): number {
  const want = new Set(rows.map((r) => `${r.accountId}\u0000${r.securityKey}`));
  return sum(statement.filter((p) => want.has(`${p.accountId}\u0000${p.securityKey}`)).map((p) => p.marketValue));
}

/** The mandates a set contains, largest first — plain arithmetic, no hook. */
function mandatesIn(rows: Position[], accIdx: ReturnType<typeof accountIndex>) {
  const by = new Map<string, { accountId: string; label: string; mv: number; count: number }>();
  for (const r of rows) {
    if (!isMandateHeld(engagementOf(accIdx, r))) continue;
    const acc = accIdx.get(r.accountId);
    const cur = by.get(r.accountId) ?? {
      accountId: r.accountId,
      // THE OWNER IS PART OF THE NAME. Four of this book's ten mandates share a
      // strategy name with another one, because the same strategy is run for two
      // family members — listed on strategy alone that is four pairs of rows a
      // reader cannot tell apart.
      label: mandateLabelWithOwner(acc, ownerOf(accIdx, r)),
      mv: 0, count: 0,
    };
    cur.mv += r.marketValue;
    cur.count += 1;
    by.set(r.accountId, cur);
  }
  return [...by.values()].sort((a, b) => b.mv - a.mv);
}

/**
 * A FOOTER THAT TIES TO THE ROWS ABOVE IT, and refuses a return the columns do
 * not support — the rule the allocation footer on Morning CIO was fixed for.
 *
 * It is summed FROM the rows rather than computed beside them: a footer derived
 * independently of its own table is the tautology this repo found on the Private
 * Market page, where the rows carried a double count the footer correctly did
 * not and no check could see it.
 */
function Foot({ view, label, hidden, mv, cost, vacuous, capitalNote, capitalGap, pnl, withoutCostMV, money, holdings, noCost, setMV, setInvested, bookReturn, closedExcluded, negligible, ret }: {
  /** THE LABEL'S SPAN IS A FUNCTION OF THE ORDER, not the literal `cols={2}`
      this took: with a column dragged, a fixed span would put every total one
      cell out and a reader would find the value under the weight's heading. */
  view: TableView; label: string; hidden: number;
  mv: number; cost: number | null; pnl: number | null; withoutCostMV: number;
  /** The set's only costed lines are nil balances beside uncosted value (A-14). */
  vacuous: boolean;
  /** Where whole mandates entered Invested at their capital paid in, what that means; empty otherwise. */
  capitalNote: string;
  /** ...and why Invested + Unrealised does not come to Value on those rows (DL-12); empty otherwise. */
  capitalGap: string;
  /** The WHOLE set's value and invested — the denominators every row's Weight and Share of invested use. */
  setMV: number; setInvested: number | null;
  /** The whole-book return on cost with its set's words, where this footer totals that set (B-07). */
  bookReturn: { pct: number; label: string; fifo: FifoTotals } | null;
  money: (n: number | null | undefined, sign?: boolean) => string;
  /** The SET's own counts, for the coverage the Invested tile used to state. */
  holdings: number; noCost: number;
  /** ...and the rows this table does not draw at all. */
  closedExcluded: number; negligible: { count: number; value: number };
  /** The footer's return, FIFO over the rows it totals — struck by the caller. */
  ret: ReturnType<typeof coveredReturn>;
}) {
  const r = ret;
  /**
   * WHAT THE COST SIDE COVERS, WORDED ONCE AND USED BY BOTH CELLS THAT NEED IT.
   *
   * It was the Invested tile's caption, and it is the reason the Return cell
   * beside it refuses a figure — so a second wording is a second chance for the
   * two to describe different sets, which is the failure `costCoversSet` was
   * extracted for one screen over.
   */
  const coverage = noCost > 0
    // "SHOWN" UNDER A SEARCH (DSM-C8): the counts are the matched rows', so
    // "in this set" would name the whole set over a fraction of it.
    ? `${fmtNum(holdings - noCost)} of the ${fmtNum(holdings)} holdings ${hidden > 0 ? "shown" : "in this set"} report a cost and ${fmtNum(noCost)} report none, ${money(withoutCostMV)} of the value.`
    : "";
  /**
   * ...AND WHAT THE TABLE LEAVES OUT, on the cell that counts what it drew.
   *
   * A closed row is a measured ₹0 and moves no total, so its COUNT is the whole
   * story; the negligible floor moved this page's own total, so that one carries
   * its value too. Both are the Portfolio Monitor's own treatment of the same
   * two facts, arriving on the page that opens from the tile.
   */
  const leftOut = [
    hidden > 0 ? `${fmtNum(hidden)} more match no filter and are not counted here.` : "",
    closedExcluded > 0
      ? `${fmtNum(closedExcluded)} closed position${closedExcluded === 1 ? " is" : "s are"} not listed: the fund still publishes a NAV, the family no longer holds ${closedExcluded === 1 ? "it" : "them"}, and ${closedExcluded === 1 ? "it carries" : "they carry"} no value and no cost here.`
      : "",
    negligible.count > 0
      ? `${fmtNum(negligible.count)} holding${negligible.count === 1 ? "" : "s"} worth under ${money(NEGLIGIBLE_VALUE_FLOOR)} ${negligible.count === 1 ? "is" : "are"} dropped automatically, ${money(negligible.value)} in total — at the family's instruction, and not because anything is missing.`
      : "",
  ].filter(Boolean).join(" ");
  return (
    <tfoot data-hb-foot={mv}>
      <TrFoot view={view} className="border-t-2 border-ink-600 px-4 py-2.5 text-left font-semibold text-slate-200"
        label={
          <span title={leftOut || undefined} data-hb-foot-rows
            // WHAT THIS SET LEFT OUT, as handles beside the hover that says it —
            // counted over this set, never the book's (XP-13).
            data-hb-closed={closedExcluded} data-hb-negligible={negligible.count} data-hb-negligible-value={negligible.value}>
            Total · {label}
            {hidden > 0 && <span className="ml-2 text-[11px] font-normal text-slate-500">{hidden} filtered out and not counted here</span>}
          </span>
        }
        cells={{
        invested: <td key="invested" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300" data-hb-foot-cost
            title={cost == null
              ? vacuous
                ? `In this set, ${VACUOUS_COST_REASON}.`
                : "No statement in this set reports a cost — absent, not zero. A depository reports what is held, never what it was paid for, and a ₹0 here would report the whole market value as profit."
              : [capitalNote, capitalGap, coverage || (hidden > 0 ? "Every holding shown reports a cost." : "Every holding in this set reports a cost.")].filter(Boolean).join(" · ")}
            data-invested-capital={capitalNote ? cost ?? undefined : undefined}>
          {cost == null ? DASH : money(cost)}
        </td>,
        value: <td key="value" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100" data-hb-foot-mv>{money(mv)}</td>,
        weight: <td key="weight" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300" data-hb-foot-weight
            title={hidden > 0
              ? `These rows' share of the set — ${money(mv)} of its ${money(setMV)}. Each row's Weight is struck over the whole set, and ${fmtNum(hidden)} more match no filter, so the column adds to this rather than to 100%.`
              : `Weight is a share of this set, not of the book — ${money(mv)} is the denominator, so the column adds to 100%.`}>
          {/* UNDER A SEARCH THE ROWS' WEIGHTS ARE STILL SHARES OF THE WHOLE SET,
              so the footer is their sum rather than a 100% they do not add to
              (DSM-C8). */}
          {setMV > 0 ? (hidden > 0 ? `${((mv / setMV) * 100).toFixed(1)}%` : "100%")
            : <AbsentCell reason="This set is worth nothing, so a share of it cannot be struck — a 0.0% here would read as a measured weight." />}
        </td>,
        costShare: <td key="costShare" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300" data-hb-foot-cost-share
            title={cost == null
              ? "No statement in this set reports a cost, so there is no invested total to share out — absent, not zero."
              : hidden > 0 && setInvested != null
                ? `These rows' share of the ${money(setInvested)} invested in the set — ${money(cost)} of it. Each row's share is struck over the whole set, and ${fmtNum(hidden)} more match no filter. ${coverage}`.trim()
                : `Share of the ${money(cost)} invested — each row's Invested over the set's, the capital paid in for a whole PMS mandate and the cost of what is held for anything else, so the column adds to 100%. ${coverage}`.trim()}>
          {cost == null || cost <= 0
            ? <AbsentCell reason="No statement in this set reports a cost, so there is no invested total to share out — absent, not zero." />
            : hidden > 0 && setInvested != null && setInvested > 0 ? `${((cost / setInvested) * 100).toFixed(1)}%` : "100%"}
        </td>,
        pnl: <td key="pnl" className={`border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold ${pnl == null ? "text-slate-400" : changeColor(pnl)}`} data-hb-foot-pnl
            title={pnl == null
              ? vacuous ? `An unrealised gain needs a cost, and in this set, ${VACUOUS_COST_REASON}.` : "Needs a cost these statements do not report — absent, not zero."
              : [coverage ? `On the cost of what is held, over the ${fmtNum(holdings - noCost)} holdings reporting a cost. ${coverage}` : "On the cost of what is held.", capitalGap].filter(Boolean).join(" ")}>
          {pnl == null ? DASH : money(pnl, true)}
        </td>,
        return: (() => {
          /* THE WHOLE BOOK'S FOOTER PRINTS THE WHOLE-BOOK RETURN, NAMED (B-07):
             struck over the holdings that report a cost, as the Consolidated
             return tile and the allocation Total row print it, with the same
             words under it. Any other set keeps the coverage test — a refused
             figure stays refused one click deeper. */
          const pct = r.pct ?? bookReturn?.pct ?? null;
          const f = r.pct != null ? r.fifo : bookReturn?.fifo ?? r.fifo;
          return (
            <td key="return" className={`border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold ${pct == null ? "text-slate-500" : changeColor(pct)}`} data-hb-foot-return
              title={pct == null
                ? cost == null
                  ? "No statement in this set reports a cost, so there is nothing to strike a return against."
                  : `Invested covers fewer holdings than Value does here, so a percentage across the two columns would divide one set of holdings by another. ${coverage}`
                : `Total to date · cumulative, not annualised. ${fifoBasisNote(f, (n) => money(n))}. ${r.pct == null && bookReturn ? `Struck over the holdings that report a cost — ${bookReturn.label} — as the whole-book return is everywhere it is printed; Invested and Value above it do not cover one set, so Value ÷ Invested is not this figure.` : coverage || (hidden > 0 ? "Every holding shown reports a cost." : "Every holding in this set reports a cost.")}`}>
              {pct == null
                ? <AbsentCell reason={cost == null
                    ? "No statement in this set reports a cost, so there is nothing to strike a return against."
                    : `Invested covers fewer holdings than Value does here, so a percentage across the two columns would divide one set of holdings by another. ${coverage}`} />
                : fmtPct(pct, { sign: true, decimals: 1 })}
              {pct != null && r.pct == null && bookReturn && (
                <span data-costed-label className="mt-0.5 block max-w-[13rem] whitespace-normal text-right text-[10.5px] font-normal leading-snug text-slate-500">
                  {bookReturn.label}
                </span>
              )}
            </td>
          );
        })(),
        }} />
    </tfoot>
  );
}

