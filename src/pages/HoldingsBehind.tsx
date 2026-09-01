import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, Layers, Wallet, Coins, TrendingUp } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { BasisPill } from "@/components/BasisPill";
import { SearchInput } from "@/components/SearchInput";
import { ViewToggle, useViewParam } from "@/components/ViewToggle";
import { AbsentSection, AbsentValue, AbsentCell, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, sumOrNull, holdingBucket, bucketLabel, holdingRoute, isMandateHeld, mandateLabelWithOwner, ROUTE_LABEL, ROUTE_NOTE } from "@/lib/analytics";
import { accountIndex, engagementOf, ownerOf, providerOf } from "@/lib/accounts";
import { parseDrilldown, resolveDrilldown, drilldownHref, type Drilldown, type DrilldownId } from "@/lib/drilldown";
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

const VIEWS = [
  { key: "row" as const, label: "By statement row", title: "One row per holding as its statement reports it — the unit the Positions count counts." },
  { key: "security" as const, label: "By security", title: "One row per distinct name, with every account holding it — the unit the Distinct names count counts." },
];
type ViewKey = (typeof VIEWS)[number]["key"];

/** One name, and every account whose statement carries it. */
type NameRow = {
  securityKey: string;
  security: string;
  rows: Position[];
  mv: number;
  cost: number | null;
  pnl: number | null;
  /** How many of `rows` report no cost — the return is refused where any do. */
  withoutCost: number;
  /** Market value of the rows a cost DOES cover, so a ratio divides one set. */
  costedMV: number;
};

function groupByName(rows: Position[]): NameRow[] {
  const by = new Map<string, Position[]>();
  for (const r of rows) {
    const a = by.get(r.securityKey) ?? [];
    a.push(r);
    by.set(r.securityKey, a);
  }
  return [...by.entries()]
    .map(([securityKey, group]) => ({
      securityKey,
      security: group[0].security,
      rows: group,
      mv: sum(group.map((x) => x.marketValue)),
      cost: sumOrNull(group.map((x) => x.costBasis)),
      pnl: sumOrNull(group.map((x) => x.unrealizedPnL)),
      withoutCost: group.filter((x) => x.costBasis == null).length,
      costedMV: sum(group.filter((x) => x.costBasis != null).map((x) => x.marketValue)),
    }))
    .sort((a, b) => b.mv - a.mv);
}

/**
 * A RETURN, OR THE REASON THERE ISN'T ONE — the allocation table's own test.
 *
 * `sumOrNull` skips a holding whose statement reports no cost, so an Invested
 * column can cover a narrower set of holdings than the Current column beside
 * it. Dividing one by the other then produces a percentage about neither: on
 * Direct Equity that read −18.9% over ₹1.22 Cr invested against ₹94.9 Cr
 * current. The figure is struck only where the costed holdings account for
 * essentially the whole set, to the same 0.5% Morning CIO's footer uses.
 */
function coveredReturn(mv: number, cost: number | null, pnl: number | null, withoutCostMV: number) {
  const covers = mv > 0 && withoutCostMV <= mv * 0.005;
  return {
    covers,
    pct: covers && cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
  };
}

export function HoldingsBehind() {
  const { portfolio, consolidated, statementPortfolio, fmtFromBase } = usePortfolio();
  const [params] = useSearchParams();
  const [view, setView] = useViewParam<ViewKey>(VIEWS);
  const [q, setQ] = useState("");

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
            {([
              ["book", "", "Every holding in the book"],
              ["invested", "", "Holdings that report a cost"],
              ["no-cost", "", "Holdings that report none"],
              ["listed", "", "The listed half"],
              ["private", "", "The private half"],
              ["top-names", "", "The largest names"],
              ["cross-held", "", "Names two entities both hold"],
              ["winners", "", "Holdings showing a gain"],
              ["losers", "", "Holdings showing a loss"],
              ["measured", "", "What the money-weighted return covers"],
            ] as [DrilldownId, string, string][]).map(([id, key, label]) => (
              <li key={id}>
                <Link to={drilldownHref(id, key || undefined)} className="text-champagne-400 hover:underline">{label}</Link>
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

  // ── The figures this page has to reconstruct ───────────────────────────────
  const mv = sum(rows.map((r) => r.marketValue));
  const cost = sumOrNull(rows.map((r) => r.costBasis));
  const pnl = sumOrNull(rows.map((r) => r.unrealizedPnL));
  const noCost = rows.filter((r) => r.costBasis == null);
  const costedMV = sum(rows.filter((r) => r.costBasis != null).map((r) => r.marketValue));
  const withoutCostMV = sum(noCost.map((r) => r.marketValue));
  const ret = coveredReturn(mv, cost, pnl, withoutCostMV);
  const names = new Set(rows.map((r) => r.securityKey));
  // THE BUCKET CHIP EARNS ITS PLACE ONLY WHERE THE SET SPANS MORE THAN ONE.
  // On a bucket drill-down every row would carry the same chip — 281 repetitions
  // of the heading above them, pushing the security name out of its column for
  // no information. Derived from the rows rather than keyed on the scope id, so
  // a future scope that happens to hold one class gets the same treatment
  // without anyone remembering to add it to a list.
  const showBucket = new Set(rows.map((r) => holdingBucket(r, engagementOf(accIdx, r)))).size > 1;
  const accounts = new Set(rows.map((r) => r.accountId));
  const owners = new Set(rows.map((r) => ownerOf(accIdx, r)));
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

  /**
   * THE MANDATES INSIDE THIS SET, where there are any.
   *
   * The PMS mandates row is 281 holdings across ten accounts, and listing 281
   * shares under one heading is exactly the flattening the family reported: the
   * unit they think in is the MANDATE. So a set containing mandate-held rows
   * gets a mandate summary above the table, each linking to the drill-down that
   * already exists for it — this page is a way INTO `/mandate/:accountId`, not a
   * replacement for it.
   */
  const mandates = mandatesIn(rows, accIdx);

  const term = q.trim().toLowerCase();
  const match = (r: Position) =>
    r.security.toLowerCase().includes(term) || (r.isin ?? "").toLowerCase().includes(term);
  const shown = term ? rows.filter(match) : rows;
  const hidden = rows.length - shown.length;
  const byRow = [...shown].sort((a, b) => b.marketValue - a.marketValue);
  const byName = groupByName(shown);

  const weight = (v: number) => (mv > 0 ? `${((v / mv) * 100).toFixed(1)}%` : null);

  return (
    <div>
      <Crumb />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/cio" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Morning CIO
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{d.title}</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-400">{d.lead}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* WHAT THIS SET STANDS BEHIND, on the page rather than left to be
                inferred from the heading. A reader arrives here from one figure
                and needs to know the page is that figure's own arithmetic. */}
            <Pill tone="core">
              <span title="This page lists exactly the holdings that figure is summed over — the same set, resolved by the same function that built the link.">
                behind {d.backs.join(" · ")}
              </span>
            </Pill>
            <Pill>
              <span title={d.deduped
                ? "Each holding that two family members' statements both report is counted ONCE, which is the basis every consolidated figure on Morning CIO uses."
                : "Every statement's row stands as printed. This is a PER-ACCOUNT figure, and collapsing a holding two accounts both report would take it off whichever account lost the collapse and put this total below the coverage the tile states."}>
                {d.deduped ? "consolidated · each holding once" : "as printed · per account"}
              </span>
            </Pill>
            <BasisPill liveText={`marked now · statements to ${fmtDate(portfolio.asOf)}`} />
          </div>
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

          {mandates.length > 0 && (
            <Card className="mt-5" title={`${mandates.length === 1 ? "The mandate" : `The ${mandates.length} mandates`} inside this set`}
              subtitle="A share a discretionary manager chose belongs inside that manager's mandate, which has a drill-down of its own — every constituent, the cash sleeve, and the total its statement prints. These rows are also listed individually in the table below.">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {mandates.map((m) => (
                  <li key={m.accountId} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <Link to={`/mandate/${encodeURIComponent(m.accountId)}`} className="min-w-0 truncate text-champagne-400 hover:underline">
                      {m.label}
                    </Link>
                    <span className="mono shrink-0 text-slate-400">{money(m.mv)}<span className="text-slate-600"> · {m.count}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
            <div className="px-5 pt-4">
              <ViewToggle views={VIEWS} active={view} onChange={setView} />
            </div>
            {shown.length === 0 ? (
              <div className="px-5 pb-5">
                <AbsentSection what="Nothing matches that filter"
                  needs={`The set holds ${fmtNum(rows.length)} holdings; none of their names or ISINs contains "${q.trim()}". Clear the filter to see them all.`} />
              </div>
            ) : view === "row" ? (
              <div className="overflow-x-auto">
                <table className="min-w-full whitespace-nowrap text-sm">
                  <thead className="border-b border-ink-700">
                    <tr>
                      <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Held via</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Qty</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&amp;L</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/60">
                    {byRow.map((r) => {
                      const acc = accIdx.get(r.accountId);
                      const route = holdingRoute(engagementOf(accIdx, r));
                      const w = weight(r.marketValue);
                      return (
                        <tr key={`${r.accountId}-${r.securityKey}-${r.assetClass}`} className="hover:bg-ink-700/40">
                          <td className="px-4 py-2.5">
                            <Link to={stockHref(r.securityKey)} className="font-medium text-slate-100 hover:text-champagne-400">{r.security}</Link>
                            {showBucket && <span className="ml-2 text-[10.5px] text-slate-500"> · {bucketLabel(holdingBucket(r, engagementOf(accIdx, r)))}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-slate-400">
                            {/* A MANDATE-HELD ROW LINKS TO ITS MANDATE. That is
                                the drill-down the family asked for three times,
                                and reaching it from here is the whole point of
                                this page being a way in rather than a copy. */}
                            {isMandateHeld(engagementOf(accIdx, r)) ? (
                              <Link to={`/mandate/${encodeURIComponent(r.accountId)}`} className="text-champagne-400 hover:underline">
                                {mandateLabelWithOwner(acc, "")}
                              </Link>
                            ) : (
                              <span title={ROUTE_NOTE[route]}>{providerOf(accIdx, r)}</span>
                            )}
                            <span className="ml-1.5 text-[10.5px] text-slate-600" title={ROUTE_NOTE[route]}> · {ROUTE_LABEL[route]}</span>
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-slate-400">{ownerOf(accIdx, r)}</td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400">{fmtNum(r.quantity, r.quantity % 1 === 0 ? 0 : 3)}</td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400">
                            {r.costBasis == null
                              ? <AbsentCell reason={`No cost on the ${providerOf(accIdx, r)} statement for this holding — a depository reports what is held, never what it was paid for. Absent, not zero.`} />
                              : money(r.costBasis)}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400">
                            {w ?? <AbsentCell reason="This set is worth nothing, so a share of it cannot be struck — a 0.0% here would read as a measured weight." />}
                          </td>
                          <td className={`px-4 py-2.5 text-right mono ${r.unrealizedPnL == null ? "" : changeColor(r.unrealizedPnL)}`}>
                            {r.unrealizedPnL == null
                              ? <AbsentCell reason="Needs a cost this statement does not report." />
                              : money(r.unrealizedPnL, true)}
                          </td>
                          <td className={`px-4 py-2.5 text-right mono ${r.returnPct == null ? "" : changeColor(r.returnPct)}`}>
                            {r.returnPct == null
                              ? <AbsentCell reason="Needs a cost this statement does not report." />
                              : fmtPct(r.returnPct, { sign: true, decimals: 1 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <Foot cols={4} label={`${fmtNum(byRow.length)} ${byRow.length === 1 ? "holding" : "holdings"}`}
                    hidden={hidden} money={money}
                    mv={sum(byRow.map((r) => r.marketValue))}
                    cost={sumOrNull(byRow.map((r) => r.costBasis))}
                    pnl={sumOrNull(byRow.map((r) => r.unrealizedPnL))}
                    withoutCostMV={sum(byRow.filter((r) => r.costBasis == null).map((r) => r.marketValue))} />
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full whitespace-nowrap text-sm">
                  <thead className="border-b border-ink-700">
                    <tr>
                      <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Held in</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&amp;L</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/60">
                    {byName.map((n) => {
                      const r = coveredReturn(n.mv, n.cost, n.pnl, n.mv - n.costedMV);
                      const w = weight(n.mv);
                      const entities = [...new Set(n.rows.map((x) => ownerOf(accIdx, x)))];
                      return (
                        <tr key={n.securityKey} className="hover:bg-ink-700/40">
                          <td className="px-4 py-2.5">
                            <Link to={stockHref(n.securityKey)} className="font-medium text-slate-100 hover:text-champagne-400">{n.security}</Link>
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-slate-400">
                            {n.rows.length === 1
                              ? providerOf(accIdx, n.rows[0])
                              : <span title={n.rows.map((x) => `${providerOf(accIdx, x)} ${accIdx.get(x.accountId)?.accountNo ?? ""} · ${ownerOf(accIdx, x)}`).join("\n")}>
                                  {n.rows.length} accounts · {entities.length} {entities.length === 1 ? "entity" : "entities"}
                                </span>}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400">
                            {n.cost == null
                              ? <AbsentCell reason="No statement carrying this name reports a cost for it." />
                              : money(n.cost)}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-slate-200">{money(n.mv)}</td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400">
                            {w ?? <AbsentCell reason="This set is worth nothing, so a share of it cannot be struck." />}
                          </td>
                          <td className={`px-4 py-2.5 text-right mono ${n.pnl == null ? "" : changeColor(n.pnl)}`}>
                            {n.pnl == null ? <AbsentCell reason="Needs a cost these statements do not report." /> : money(n.pnl, true)}
                          </td>
                          <td className={`px-4 py-2.5 text-right mono ${r.pct == null ? "" : changeColor(r.pct)}`}>
                            {r.pct == null
                              ? <AbsentCell reason={n.cost == null
                                  ? "No statement carrying this name reports a cost, so there is no return to strike."
                                  : `A cost is reported on ${n.rows.length - n.withoutCost} of the ${n.rows.length} statements carrying this name, so Invested and Value describe different sets and a percentage across them would divide one by the other.`} />
                              : fmtPct(r.pct, { sign: true, decimals: 1 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <Foot cols={2} label={`${fmtNum(byName.length)} ${byName.length === 1 ? "name" : "names"}`}
                    hidden={hidden} money={money}
                    mv={sum(byName.map((n) => n.mv))}
                    cost={sumOrNull(byName.map((n) => n.cost))}
                    pnl={sumOrNull(byName.map((n) => n.pnl))}
                    withoutCostMV={sum(byName.map((n) => n.mv - n.costedMV))} />
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

          {d.companion && d.companion.rows.length > 0 && (
            <Card className="mt-5" pad={false} title={d.companion.title} subtitle={d.companion.note}>
              <div className="overflow-x-auto">
                <table className="min-w-full whitespace-nowrap text-sm">
                  <thead className="border-b border-ink-700">
                    <tr>
                      <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Held via</th>
                      <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                      <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/60">
                    {[...d.companion.rows].sort((a, b) => b.marketValue - a.marketValue).map((r) => (
                      <tr key={`c-${r.accountId}-${r.securityKey}-${r.assetClass}`} className="hover:bg-ink-700/40">
                        <td className="px-4 py-2.5">
                          <Link to={stockHref(r.securityKey)} className="font-medium text-slate-100 hover:text-champagne-400">{r.security}</Link>
                          <span className="ml-2 text-[10.5px] text-slate-500"> · {bucketLabel(holdingBucket(r, engagementOf(accIdx, r)))}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-slate-400">{providerOf(accIdx, r)}</td>
                        <td className="px-4 py-2.5 text-[12px] text-slate-400">{ownerOf(accIdx, r)}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink-600 font-semibold">
                      <td className="px-4 py-2.5 text-slate-200" colSpan={3}>
                        {fmtNum(d.companion.rows.length)} {d.companion.rows.length === 1 ? "holding" : "holdings"}, in neither figure above
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-100">{money(sum(d.companion.rows.map((r) => r.marketValue)))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
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
  const want = new Set(rows.map((r) => `${r.accountId} ${r.securityKey}`));
  return sum(statement.filter((p) => want.has(`${p.accountId} ${p.securityKey}`)).map((p) => p.marketValue));
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
