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
import { sum, sumOrNull, holdingBucket, NEGLIGIBLE_VALUE_FLOOR, bucketLabel, holdingRoute, isMandateHeld, mandateLabelWithOwner, ROUTE_LABEL, ROUTE_NOTE } from "@/lib/analytics";
import {
  aifSectionOf, aifCategoryOf, aifCategoryWhy, isAifHolding, aifSectionOrd,
  unvaluedAifFolios, AIF_UNSTATED_SECTION, PRIVATE_EQUITY_SECTION,
} from "@/lib/aifCategory";
import { accountIndex, engagementOf, ownerOf, providerOf } from "@/lib/accounts";
import { parseDrilldown, resolveDrilldown, drilldownHref, coveredReturn, type Drilldown, type DrilldownId } from "@/lib/drilldown";
import { fifoBasisNote, fifoTotals, investedBasisNote, investedWithCapital, type FifoOptions, type FifoTotals } from "@/lib/fifo";
import { stockHref } from "@/lib/auditFormulas";
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
        cost: sumOrNull(group.map((x) => x.costBasis)),
        ...(() => {
          const cost = sumOrNull(group.map((x) => x.costBasis));
          if (kind !== "mandate") return { invested: cost, capital: null };
          const f = fifoTotals(group, fifoOpts);
          return f.wholeMandates.length
            ? { invested: investedWithCapital(cost, f), capital: f }
            : { invested: cost, capital: null };
        })(),
        pnl: sumOrNull(group.map((x) => x.unrealizedPnL)),
        withoutCost: group.filter((x) => x.costBasis == null).length,
        costedMV: sum(group.filter((x) => x.costBasis != null).map((x) => x.marketValue)),
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

/** The holdings table's columns, in the order its rows write their cells. */
const HB_COLS = ["unit", "heldIn", "invested", "value", "weight", "pnl", "return"] as const;

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
    () => (portfolio && scope ? resolveDrilldown(scope, { portfolio, consolidated }) : null),
    [portfolio, consolidated, scope],
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
              ["book", "", "", "Every holding in the book"],
              ["book", "", "listed", "…the listed half"],
              ["book", "", "private", "…the private half"],
              ["invested", "", "", "Capital invested — the holdings that report a cost"],
              ["invested", "", "no-cost", "…and the ones that report none"],
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
  const cost = sumOrNull(rows.map((r) => r.costBasis));
  const pnl = sumOrNull(rows.map((r) => r.unrealizedPnL));
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
  // THE BUCKET CHIP EARNS ITS PLACE ONLY WHERE THE SET SPANS MORE THAN ONE.
  // On a bucket drill-down every row would carry the same chip — a repetition of
  // the heading above them, pushing the name out of its column for no
  // information. Derived from the rows rather than keyed on the scope id.
  const showBucket = new Set(rows.map((r) => holdingBucket(r, engagementOf(accIdx, r)))).size > 1;
  /**
   * THE WHOLE BOOK, ON THIS PAGE'S OWN BASIS — the denominator for Share of
   * book, and never `portfolio.totalValue` on a per-account scope. Closing a set
   * of as-printed rows against a consolidated NAV would divide one basis by
   * another and put a share above 100% the first time a duplicate lands inside
   * the scope.
   */
  const bookMV = d.deduped
    ? sum(consolidated.map((x) => x.marketValue))
    : sum(portfolio.positions.map((x) => x.marketValue));
  const shareOfBook = bookMV > 0 ? (mv / bookMV) * 100 : null;
  const weight = (v: number) => (mv > 0 ? `${((v / mv) * 100).toFixed(1)}%` : null);

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
              {d.facets.map((f) => {
                const active = f.key === d.activeFacet;
                return (
                  <Link key={f.key} to={drilldownHref(d.id, d.key || undefined, f.key)}
                    aria-current={active ? "true" : undefined}
                    title={f.note || undefined}
                    className={["rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      active ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
                    {f.label}
                    <span className="ml-1.5 tabular opacity-70">{fmtNum(f.rows.length)}</span>
                  </Link>
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
          <div className="font-display text-2xl font-bold tabular text-slate-100"
               data-hb-total={mv}>{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {shareOfBook == null
              ? "no book value to measure a share against"
              : <>{shareOfBook.toFixed(1)}% of the {money(bookMV)} book</>}
          </div>
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
                                  return read.category
                                    ? <span className="text-[10.5px] text-slate-500" data-aif-row-cat={read.category}> · {read.category}</span>
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
                                  : money(g.cost)}
                            </td>
                            <td className="px-4 py-2.5 text-right mono text-slate-200">{money(g.mv)}</td>
                            <td className="px-4 py-2.5 text-right mono text-slate-400">
                              {w ?? <AbsentCell reason="This set is worth nothing, so a share of it cannot be struck — a 0.0% here would read as a measured weight." />}
                            </td>
                            <td className={`px-4 py-2.5 text-right mono ${g.pnl == null ? "" : changeColor(g.pnl)}`}>
                              {g.pnl == null ? <AbsentCell reason="Needs a cost these statements do not report." /> : money(g.pnl, true)}
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
                              <td className="px-4 py-1.5 text-right mono text-slate-400">{money(x.marketValue)}</td>
                              <td className="px-4 py-1.5 text-right mono text-slate-600">{fmtNum(x.quantity, x.quantity % 1 === 0 ? 0 : 3)}</td>
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
                    cost={sumOrNull(groups.map((g) => g.invested))}
                    capitalNote={(() => {
                      const f = groups.filter((g) => g.capital).map((g) => g.capital!);
                      if (!f.length) return "";
                      const paid = sum(f.map((x) => x.wholeContributed)), held = sum(f.map((x) => x.wholeCostHeld));
                      return `${f.length} whole mandate${f.length === 1 ? " enters" : "s enter"} at the capital paid in, ${money(paid)} — what ${f.length === 1 ? "its" : "their"} return is divided by — where the cost of the shares ${f.length === 1 ? "it holds" : "they hold"} now is ${money(held)}; this total is the sum of the Invested cells above it`;
                    })()}
                    pnl={sumOrNull(groups.map((g) => g.pnl))}
                    withoutCostMV={sum(groups.map((g) => g.mv - g.costedMV))}
                    ret={coveredReturn(groups.flatMap((g) => g.rows), fifoOpts)}
                    holdings={rows.length} noCost={noCost.length}
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
            {unvalued.length > 0 && (
              <div className="border-t border-ink-700/60 px-5 pt-4" data-testid="aif-unvalued">
                <div className="label-xs text-slate-300">Held, and valued by no statement</div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">
                  {fmtNum(unvalued.length)} AIF {unvalued.length === 1 ? "folio" : "folios"} report units and the capital drawn
                  against a commitment and no NAV anywhere, so no position stands for them in the table above and their money is
                  in none of its totals. Drawn capital is what was <em>paid</em>, never what the stake is worth.
                </p>
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
              </div>
            )}
            <p className="px-5 pb-5 pt-3 text-[11.5px] leading-relaxed text-slate-500">
              {full(mv)} across {fmtNum(rows.length)} {rows.length === 1 ? "holding" : "holdings"} and {fmtNum(names.size)}{" "}
              {names.size === 1 ? "name" : "names"}, held by {fmtNum(owners.size)} {owners.size === 1 ? "entity" : "entities"} in{" "}
              {fmtNum(accounts.size)} {accounts.size === 1 ? "account" : "accounts"}. Statements in this set are drawn on their own
              dates, so this total is a blend rather than one report date — {" "}
              <Link to="/monitor" className="text-champagne-400 hover:underline">Portfolio Monitor</Link> carries every account in full.
            </p>
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
                <p>
                  Every dated capital movement in or out of the{" "}
                  <span className="text-slate-100">{fmtNum(coveredAccounts)}</span>{" "}
                  account{coveredAccounts === 1 ? "" : "s"} whose statements publish an opening
                  portfolio value, with that opening value as the first flow and each
                  account&rsquo;s own closing market value as the last. The rate is the one that
                  makes them balance.
                </p>
                <p className="mono rounded-md border border-ink-700 px-3 py-2 text-[13px] text-slate-200">
                  find r where &nbsp;Σ&nbsp; flow ÷ (1 + r)<sup>days ÷ 365</sup> &nbsp;=&nbsp; 0
                </p>
                <ul className="space-y-1.5 pl-4">
                  <li className="list-disc">
                    Each account closes on <span className="text-slate-100">its own report date</span>,
                    not one shared date — closing them all on the newest would credit the
                    earlier ones with standing still.
                  </li>
                  <li className="list-disc">
                    Over a window shorter than a year this is the return{" "}
                    <span className="text-slate-100">earned over that window</span>, never
                    compounded up to a yearly rate.
                  </li>
                  <li className="list-disc">
                    A buy or a sell is <span className="text-slate-100">not a flow</span>: it moves
                    cash inside the account, and its proceeds are already in the closing value.
                    Only money the family put in or took out counts.
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

      {/* The statement-basis total, stated once. `statementPortfolio` is the book
          the live feed never touches; on LIVE basis the figures above have moved
          and this has not, which is the difference a reader holding the PDF
          needs in order to reconcile the two. */}
      {statementPortfolio && !d.absent && (
        <p className="mt-4 text-[11.5px] leading-relaxed text-slate-500">
          On statement marks alone — before any live quote — these holdings are worth{" "}
          <span className="mono text-slate-400">{full(statementValue(statementPortfolio.positions, rows))}</span>.
          Live prices may move a market value, a day change and a return on cost, and never a quantity, a cost basis, a
          realised gain or a dated cash flow.
        </p>
      )}
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
function Foot({ view, label, hidden, mv, cost, capitalNote, pnl, withoutCostMV, money, holdings, noCost, closedExcluded, negligible, ret }: {
  /** THE LABEL'S SPAN IS A FUNCTION OF THE ORDER, not the literal `cols={2}`
      this took: with a column dragged, a fixed span would put every total one
      cell out and a reader would find the value under the weight's heading. */
  view: TableView; label: string; hidden: number;
  mv: number; cost: number | null; pnl: number | null; withoutCostMV: number;
  /** Where whole mandates entered Invested at their capital paid in, what that means; empty otherwise. */
  capitalNote: string;
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
    ? `${fmtNum(holdings - noCost)} of the ${fmtNum(holdings)} holdings in this set report a cost and ${fmtNum(noCost)} report none, ${money(withoutCostMV)} of the value.`
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
          <span title={leftOut || undefined} data-hb-foot-rows>
            Total · {label}
            {hidden > 0 && <span className="ml-2 text-[11px] font-normal text-slate-500">{hidden} filtered out and not counted here</span>}
          </span>
        }
        cells={{
        invested: <td key="invested" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300" data-hb-foot-cost
            title={cost == null
              ? "No statement in this set reports a cost — absent, not zero. A depository reports what is held, never what it was paid for, and a ₹0 here would report the whole market value as profit."
              : [capitalNote, coverage || "Every holding in this set reports a cost."].filter(Boolean).join(" · ")}
            data-invested-capital={capitalNote ? cost ?? undefined : undefined}>
          {cost == null ? DASH : money(cost)}
        </td>,
        value: <td key="value" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100" data-hb-foot-mv>{money(mv)}</td>,
        weight: <td key="weight" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300" data-hb-foot-weight
            title={`Weight is a share of this set, not of the book — ${money(mv)} is the denominator, so the column adds to 100%.`}>
          {mv > 0 ? "100%" : DASH}
        </td>,
        pnl: <td key="pnl" className={`border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold ${pnl == null ? "text-slate-400" : changeColor(pnl)}`} data-hb-foot-pnl
            title={pnl == null
              ? "Needs a cost these statements do not report — absent, not zero."
              : coverage ? `On the ${fmtNum(holdings - noCost)} holdings reporting a cost. ${coverage}` : "On cost."}>
          {pnl == null ? DASH : money(pnl, true)}
        </td>,
        return: <td key="return" className={`border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold ${r.pct == null ? "text-slate-500" : changeColor(r.pct)}`} data-hb-foot-return
            title={r.pct == null
              ? cost == null
                ? "No statement in this set reports a cost, so there is nothing to strike a return against."
                : `Invested covers fewer holdings than Value does here, so a percentage across the two columns would divide one set of holdings by another. ${coverage}`
              : `Total to date · cumulative, not annualised. ${fifoBasisNote(r.fifo, (n) => money(n))}. ${coverage || "Every holding in this set reports a cost."}`}>
          {r.pct == null ? DASH : fmtPct(r.pct, { sign: true, decimals: 1 })}
        </td>,
        }} />
    </tfoot>
  );
}

