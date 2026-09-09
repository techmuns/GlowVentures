import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronDown, ChevronRight, Layers, Wallet, Coins, TrendingUp } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { SearchInput } from "@/components/SearchInput";
import { AbsentSection, AbsentValue, AbsentCell, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, sumOrNull, holdingBucket, bucketLabel, holdingRoute, isMandateHeld, mandateLabelWithOwner, ROUTE_LABEL, ROUTE_NOTE } from "@/lib/analytics";
import { accountIndex, engagementOf, ownerOf, providerOf } from "@/lib/accounts";
import { parseDrilldown, resolveDrilldown, drilldownHref, coveredReturn, type Drilldown, type DrilldownId } from "@/lib/drilldown";
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
        pnl: sumOrNull(group.map((x) => x.unrealizedPnL)),
        withoutCost: group.filter((x) => x.costBasis == null).length,
        costedMV: sum(group.filter((x) => x.costBasis != null).map((x) => x.marketValue)),
      };
    })
    .sort((a, b) => b.mv - a.mv);
}

export function HoldingsBehind() {
  const { portfolio, consolidated, statementPortfolio, fmtFromBase } = usePortfolio();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  /** Which grouped rows are expanded to their statement lines. */
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const scope = useMemo(() => parseDrilldown(params), [params]);
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
        <Crumb />
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-100">Nothing named to open</h1>
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
  const ret = coveredReturn(mv, cost, pnl, withoutCostMV);
  const names = new Set(rows.map((r) => r.securityKey));
  const accounts = new Set(rows.map((r) => r.accountId));
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
  const groups = groupRows(shown, accIdx, d.deduped ? consolidated : portfolio.positions);
  /** What one row of this table IS, so the header and the footer can say it. */
  const anyMandate = groups.some((g) => g.kind === "mandate");
  const allMandate = groups.length > 0 && groups.every((g) => g.kind === "mandate");
  const unitWord = allMandate ? "mandate" : anyMandate ? "row" : "name";
  const unitHeading = allMandate ? "Mandate" : anyMandate ? "Security / mandate" : "Security";


  return (
    <div>
      <Crumb />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/cio" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Morning CIO
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{heading}</h1>
          {/* NO LEAD PARAGRAPH. *"Remove all the highlighted text and the
              sections from the dashboard UI."* What it said — which set this is
              and on what basis — is the HEADING plus the four tiles below, whose
              own captions carry the counts (`369 holdings · 213 names · 34
              accounts`), the coverage (`60 of 369 report none`) and the reason a
              refused figure is refused. `Drilldown.lead` went with it rather
              than being left as a field nothing renders. */}
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

        <div className="text-right">
          <div className="mono text-2xl font-semibold text-slate-100">{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {shareOfBook == null
              ? "no book value to measure a share against"
              : <>{shareOfBook.toFixed(1)}% of the {money(bookMV)} book</>}
          </div>
        </div>
      </div>

      {d.absent ? (
        <Card><AbsentSection what={d.absent.what} needs={d.absent.needs} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Market value" value={money(mv)}
              sub={`${fmtNum(rows.length)} ${rows.length === 1 ? "holding" : "holdings"} · ${fmtNum(names.size)} ${names.size === 1 ? "name" : "names"} · ${fmtNum(accounts.size)} ${accounts.size === 1 ? "account" : "accounts"}`}
              icon={<Wallet className="h-4 w-4" />} />
            <Kpi label="Invested"
              value={cost === null ? <AbsentValue /> : money(cost)}
              sub={cost === null
                ? <span className="text-slate-500">no statement here reports a cost — absent, not zero</span>
                : noCost.length
                  ? <span className="text-slate-500">cost in · {noCost.length} of {rows.length} report none, {money(withoutCostMV)} of the value</span>
                  : "cost in · every holding here reports one"}
              icon={<Coins className="h-4 w-4" />} />
            <Kpi label="Unrealised P&amp;L"
              value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{money(pnl, true)}</span>}
              sub={pnl === null
                ? <span className="text-slate-500">needs a cost these statements do not print</span>
                : noCost.length
                  ? <span className="text-slate-500">on the {rows.length - noCost.length} holdings reporting a cost</span>
                  : "on cost"}
              icon={<TrendingUp className="h-4 w-4" />} />
            {/* THE RETURN REFUSES ITSELF ON EXACTLY THE SETS MORNING CIO DOES.
                Direct Equity, Mutual Fund and ETF each report a cost on a
                minority of their holdings, so their allocation row prints an em
                dash — and a drill-down opening from that dash and printing a
                percentage would be the two screens contradicting each other on
                the reader's own click. */}
            <Kpi label="Return on cost"
              value={ret.pct == null ? <AbsentValue /> : <span className={changeColor(ret.pct)}>{fmtPct(ret.pct, { sign: true, decimals: 1 })}</span>}
              sub={ret.pct != null
                ? "total to date · cumulative, not annualised"
                : <span className="text-slate-500">
                    {cost === null
                      ? "no cost is reported here, so there is nothing to strike a return against"
                      : withoutCostMV > 0
                        ? <>Invested covers {rows.length - noCost.length} of {rows.length} holdings here and Value covers all of them — the {money(withoutCostMV)} that reports no cost stands in one column and not the other, so a percentage across the two would divide one set of holdings by another</>
                        : cost <= 0
                          ? <>the statements report a cost of {money(cost)} here — a measured figure, not a missing one</>
                          : "no unrealised gain is reported against the cost here"}
                  </span>}
              icon={<Layers className="h-4 w-4" />} />
          </div>

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
          {d.excludedAccounts.length > 0 && (
            <Card className="mt-5" title={`${d.excludedAccounts.length} accounts outside this figure`}
              subtitle="Named rather than dropped. A figure that exists for some accounts is shown for those and the rest are said out loud — a reader who cannot see which accounts are missing reads the figure as covering the book.">
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                {d.excludedAccounts.join(", ")}
              </p>
            </Card>
          )}

          <Card className="mt-5" pad={false}
            title="The holdings behind it"
            subtitle={`Weight is within this set, not within the book — ${money(mv)} is the denominator. Every figure is as the statements report it, ${d.deduped ? "with each holding two members both carry counted once" : "each statement's row as printed"}.`}
            right={<SearchInput value={q} onChange={setQ} placeholder="Filter by name or ISIN…" className="w-56"
              suggestions={[...new Set(rows.map((r) => r.security))].sort()} />}>
            {shown.length === 0 ? (
              <div className="px-5 pb-5 pt-4">
                <AbsentSection what="Nothing matches that filter"
                  needs={`The set holds ${fmtNum(rows.length)} holdings; none of their names or ISINs contains "${q.trim()}". Clear the filter to see them all.`} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full whitespace-nowrap text-sm">
                  <thead className="border-b border-ink-700">
                    <tr>
                      <th className="label-xs px-4 py-2 text-left font-medium">{unitHeading}</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Held in</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&amp;L</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/60">
                    {groups.map((g) => {
                      const r = coveredReturn(g.mv, g.cost, g.pnl, g.mv - g.costedMV);
                      const w = weight(g.mv);
                      const entities = [...new Set(g.rows.map((x) => ownerOf(accIdx, x)))];
                      const accounts = [...new Set(g.rows.map((x) => x.accountId))];
                      const expandable = g.rows.length > 1;
                      const isOpen = open.has(g.key);
                      return (
                        <Fragment key={g.key}>
                          <tr className="hover:bg-ink-700/40">
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
                          </tr>
                          {/* THE STATEMENT LINES, WHERE A READER ASKS FOR THEM.
                              The Positions count on Morning CIO counts these, and
                              this is where they live now that the page has no
                              global mode — per row, opened on demand, rather than
                              a switch that reshapes the whole table. */}
                          {isOpen && g.rows.map((x) => (
                            <tr key={`${g.key}-${x.accountId}-${x.assetClass}`} className="bg-ink-900/40 text-[12px]">
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
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <Foot cols={2} label={`${fmtNum(groups.length)} ${groups.length === 1 ? unitWord : unitWord + "s"}`}
                    hidden={hidden} money={money}
                    mv={sum(groups.map((g) => g.mv))}
                    cost={sumOrNull(groups.map((g) => g.cost))}
                    pnl={sumOrNull(groups.map((g) => g.pnl))}
                    withoutCostMV={sum(groups.map((g) => g.mv - g.costedMV))} />
                </table>
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
function Foot({ cols, label, hidden, mv, cost, pnl, withoutCostMV, money }: {
  cols: number; label: string; hidden: number;
  mv: number; cost: number | null; pnl: number | null; withoutCostMV: number;
  money: (n: number | null | undefined, sign?: boolean) => string;
}) {
  const r = coveredReturn(mv, cost, pnl, withoutCostMV);
  return (
    <tfoot>
      <tr className="border-t-2 border-ink-600 font-semibold">
        <td className="px-4 py-2.5 text-left text-slate-200" colSpan={cols}>
          Total · {label}
          {hidden > 0 && <span className="ml-2 text-[11px] font-normal text-slate-500">{hidden} filtered out and not counted here</span>}
        </td>
        <td className="px-4 py-2.5 text-right mono text-slate-300">{cost == null ? DASH : money(cost)}</td>
        <td className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>
        <td className="px-4 py-2.5 text-right mono text-slate-300">{mv > 0 ? "100%" : DASH}</td>
        <td className={`px-4 py-2.5 text-right mono ${pnl == null ? "text-slate-400" : changeColor(pnl)}`}>{pnl == null ? DASH : money(pnl, true)}</td>
        <td className={`px-4 py-2.5 text-right mono ${r.pct == null ? "text-slate-500" : changeColor(r.pct)}`}>
          {r.pct == null
            ? <span title={cost == null
                ? "No statement in this set reports a cost, so there is no return to strike."
                : "Invested covers fewer holdings than Value does here, so a percentage across the two columns would divide one set of holdings by another. The coverage is stated on the Invested tile above."}>{DASH}</span>
            : fmtPct(r.pct, { sign: true, decimals: 1 })}
        </td>
      </tr>
    </tfoot>
  );
}

function Crumb() {
  return (
    <div className="mb-2 text-[12px] text-slate-500">
      <Link to="/cio" className="text-champagne-400 hover:underline">Morning CIO</Link>
      <span className="mx-1.5">›</span>What is behind the figure
    </div>
  );
}
