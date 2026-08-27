import { useMemo, useState } from "react";
import { Handshake, Landmark, Wallet, TrendingUp, Fuel, Coins, Banknote, HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { BasisPill } from "@/components/BasisPill";
import { SearchInput } from "@/components/SearchInput";
import { StockLink } from "@/components/StockLink";
import { Auditable } from "@/components/Auditable";
import { AbsentCell, AbsentSection, absentTile, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { sum, sumOrNull, consolidatedMarketValue, excludedClasses, isPrivateClass, assetClassLabel } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals, unvaluedAccounts, unvaluedDrawn,
} from "@/lib/privateMarket";
import { auditHref, weightFormula } from "@/lib/auditFormulas";
import { fmtPct, fmtNum, fmtDate, changeColor } from "@/lib/format";

// PRIVATE MARKET — the private book this drop actually carries.
//
// ── WHAT THIS PAGE IS, AND WHAT IT IS NOT ───────────────────────────────────
//
// It is NOT the fund-of-funds tracker removed at Stage 10f. That page read
// `portfolio.privateMarkets` — six arrays which are all EMPTY in this book — so
// it drew "₹0 invested → ₹0 today" tiles and a deployment bar showing 100%
// undrawn against nothing committed, every one of which reads as a measurement
// when the truth is there was nothing to measure. Nothing here touches those
// arrays or `src/lib/privateValue.ts`; their absence is NAMED, in the last card.
//
// What it carries instead is what the statements report: 14 funds across 29
// accounts, the 15 capital accounts behind them, the ₹18.23 Cr of capital the
// family has PAID into funds that publish no valuation at all, and the AIF income
// split by tax head. The Monitor's AIF section shows the folios that have a mark;
// nothing anywhere else in this app shows the money that has none.
//
// ── THE AXIS IS THE ASSET CLASS ─────────────────────────────────────────────
//
// `isPrivateClass`, never `Account.engagement`. See the note at the top of
// `src/lib/privateMarket.ts`: on this book keying on engagement would drop three
// real private holdings and pull in two cash sleeves.
//
// ── AND THE WHOLE OF THIS BOOK'S DOUBLE COUNT IS PRIVATE ────────────────────
//
// Both duplicated holdings — 360 ONE Special Opportunities under two CRNs, and
// Transition Venture Fund I under both family trusts — are on this page. So the
// consolidated-counts-once / per-account-does-not rule is not a background
// concern here, it is the page's central arithmetic, and getting it backwards is
// guaranteed to be wrong in one direction or the other. Every figure below
// declares which basis it is on, and `privateMarket.test.ts` asserts both.
//
// STATEMENT BASIS THROUGHOUT. A reader checks this page by opening a fund's own
// capital account, which is the Capital Gains / Data Audit / Ledger Insights
// contract — so it reads `statementPortfolio` and passes `<BasisPill statement>`.
// Passing the pill without switching the source is the trap: the label would be
// a claim the page does not honour. (No AIF unit resolves an NSE symbol, so no
// quote would ever touch these rows anyway — but the source is what makes the
// label true, not the coincidence.)

export function PrivateMarket() {
  const { statementPortfolio: portfolio, fmtFromBase } = usePortfolio();
  const [q, setQ] = useState("");

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  const m = useMemo(() => {
    if (!portfolio) return null;
    const accIdx = accountIndex(portfolio.accounts);
    const scope = privateScope(portfolio.positions, portfolio.accounts);
    const commitments = portfolio.commitments ?? [];

    const funds = fundRollup(scope.dedupedRows, accIdx);
    const folios = folioRows(scope.rows, accIdx);
    const owners = ownerRollup(scope.rows, accIdx);
    const ct = commitmentTotals(commitments);
    const unvalued = unvaluedAccounts(portfolio.accounts, portfolio.positions, commitments);

    // CONSOLIDATED — each dedupeGroup once. The book-wide figures.
    //
    // THEY ARE SUMMED FROM `funds`, THE ROWS THE TABLE ACTUALLY DRAWS, and not
    // independently from `scope.dedupedRows`. Struck independently they can
    // disagree with the rows above them, and that is not hypothetical: building
    // the table from the raw set left every row carrying the ₹3.17 Cr double
    // count while the footer went on printing the deduped total, and no check
    // could see it because each figure was correct on its own terms. A total
    // must tie to its own columns — so here it is derived FROM them, and the
    // only way for the two to disagree is for the arithmetic itself to be wrong.
    const privMV = sum(funds.map((f) => f.mv));
    const privCost = sumOrNull(funds.map((f) => f.cost));
    const privPnL = sumOrNull(funds.map((f) => f.pnl));
    const costedRows = scope.dedupedRows.filter((p) => p.costBasis != null);
    const costedMV = sum(funds.map((f) => f.costedMV));
    const bookMV = consolidatedMarketValue(portfolio.positions);
    // RAW — every statement as printed. Never the same number, by design.
    const rawMV = sum(scope.rows.map((p) => p.marketValue));

    // The as-of spread is derived from the accounts IN SCOPE. `portfolio.asOf` is
    // the book's newest date and NO private holding here is marked at it, so
    // printing it over these rows would date them two weeks forward.
    const dates = [...new Set(scope.accounts.map((a) => a.asOf).filter(Boolean))].sort();

    return {
      accIdx, scope, funds, folios, owners, ct, unvalued, commitments,
      privMV, privCost, privPnL, costedMV, costedCount: costedRows.length, bookMV, rawMV,
      unvaluedDrawn: unvaluedDrawn(unvalued),
      unvaluedNoNav: unvalued.filter((u) => u.kind === "no-nav"),
      dates,
      excluded: excludedClasses(scope.dedupedRows.length ? portfolio.positions.filter(() => true) : [], isPrivateClass),
      owned: new Set(portfolio.positions.map((p) => p.accountId)),
    };
  }, [portfolio]);

  if (!portfolio || !m) return null;

  // Nothing private at all — one absent state, no tiles and no empty frames.
  if (!m.scope.rows.length && !m.unvalued.length && !m.commitments.length) {
    return (
      <div>
        <PageHeader eyebrow="Daily" title="Private Market" />
        <AbsentSection
          what="This book reports no private-market holding"
          needs="Every position in it is listed equity, a mutual fund, an ETF or cash. A private holding would arrive as an AIF, Unlisted or Structured Product row from a fund's own statement, or as a capital account from a drawdown fund." />
      </div>
    );
  }

  const fundsShown = m.funds.filter((f) => !q.trim() || f.security.toLowerCase().includes(q.trim().toLowerCase()));
  const excludedRest = excludedClasses(
    // The remainder is named against the same deduped set the private total is
    // struck on, so the two reconstruct the consolidated NAV exactly.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (portfolio.positions), isPrivateClass,
  );

  return (
    <div>
      <PageHeader eyebrow="Daily" title="Private Market"
        subtitle={`Every private-market holding the statements in this drop report — ${m.funds.length} funds across ${m.scope.accounts.length} accounts and ${m.owners.length} owners — the capital committed to them, and the folios whose fund publishes no valuation at all.`}
        right={<div className="flex flex-wrap items-center gap-2">
          <BasisPill statement liveText="Statement marks"
            hint="Every mark here is the fund's own, from its capital account or unit statement. No quote feed prices an AIF unit, so nothing on this page moves with the market." />
          <Pill tone="info">{m.funds.length} funds · {m.scope.accounts.length} accounts</Pill>
        </div>} />

      {/* THE DATE SPREAD, DERIVED — never `portfolio.asOf`, which is newer than
          every mark on this page. */}
      {m.dates.length > 0 && (
        <p className="mb-4 text-[11.5px] text-slate-500">
          Marks span <span className="text-slate-300">{fmtDate(m.dates[0])}</span>
          {m.dates.length > 1 && <> → <span className="text-slate-300">{fmtDate(m.dates[m.dates.length - 1])}</span></>}
          . Each fund is valued on its own statement's date, shown on every row below.
        </p>
      )}

      {/* ── The valued private book ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Private market value" icon={<Handshake className="h-4 w-4" />}
          value={<Auditable formula={weightFormula(m.privMV, m.bookMV, m.bookMV > 0 ? (m.privMV / m.bookMV) * 100 : null, money, "the consolidated book")}>{money(m.privMV)}</Auditable>}
          sub={`${m.bookMV > 0 ? fmtPct((m.privMV / m.bookMV) * 100, { decimals: 2 }) : DASH} of the ${money(m.bookMV)} book · each holding counted once`} />

        <StatTile label="Capital invested" icon={<Wallet className="h-4 w-4" />}
          value={money(m.privCost)}
          sub={`cost in · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one`} />

        <StatTile label="Unrealised P&L" icon={<TrendingUp className="h-4 w-4" />}
          value={<span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>}
          sub={m.privCost != null && m.privCost > 0
            ? `on the ${money(m.privCost)} these statements report as cost, covering ${money(m.costedMV)} of the ${money(m.privMV)} above`
            : "no statement here reports a cost to measure a gain against"} />

        <StatTile label="Still to call (dry powder)" icon={<Fuel className="h-4 w-4" />}
          value={<span className="text-amber-400">{money(m.ct.undrawn)}</span>}
          sub={`${m.ct.undrawnOf} of ${m.ct.count} capital accounts print an undrawn figure`}
          hint="Summed exactly as each statement prints it, never derived from committed − drawn. Two folios print a commitment and a drawdown and no undrawn figure at all; a zero there would assert the fund has nothing left to call, so they are skipped and this covers 13 of 15." />
      </div>

      {/* ── The capital account, and the gap ── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Committed" icon={<Landmark className="h-4 w-4" />}
          value={money(m.ct.committed)} sub={`${m.ct.committedOf} of ${m.ct.count} capital accounts`} />

        <StatTile label="Drawn" icon={<Banknote className="h-4 w-4" />}
          value={money(m.ct.drawn)} sub={`${m.ct.drawnOf} of ${m.ct.count} · paid, and not the same thing as what it is worth`} />

        {/* THE FIGURE THIS PAGE EXISTS FOR. Real money, paid, and in NO total
            above it: adding drawn capital to a market value reports what was
            paid as what the stake is worth. */}
        <StatTile label="Drawn against no valuation" icon={<HelpCircle className="h-4 w-4" />}
          value={<span className="text-amber-400">{money(m.unvaluedDrawn)}</span>}
          sub={`${m.unvaluedNoNav.length} accounts whose fund publishes no NAV · not in the private market value above`}
          hint="These funds report units and the capital drawn against a commitment, and no valuation anywhere. The contributions are what was paid rather than what the stake is worth, so they are stated on their own and never added to a market value." />

        <StatTile label="Cash returned" icon={<Coins className="h-4 w-4" />}
          value={money(m.ct.distributed)}
          sub={`${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`} />
      </div>

      {/* Two tiles that would be natural here and are absent by measurement. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatTile label="Realised gain" icon={<Coins className="h-4 w-4" />}
          {...absentTile(
            "no capital gain statement covers any private account in this drop",
            "Every AIF-engagement account carries that absence verbatim in the book's capital-gain record. Their redemptions are real; what they realised was never reported to this book, so it is absent rather than nil.")} />
        <StatTile label="Net multiple (TVPI / DPI)" icon={<Handshake className="h-4 w-4" />}
          {...absentTile(
            "no fund here reports one, and this book cannot derive it",
            "A TVPI needs distributions and dated capital calls per folio. Three of the fifteen capital accounts publish a distribution figure and none publishes its calls as dated data, so a multiple struck here would be built on figures that do not exist.")} />
      </div>

      {/* ── Card A — one row per FUND, consolidated ── */}
      <Card className="mt-5" pad={false} title="Funds this family holds"
        subtitle="One row per fund, each holding counted once however many family members' statements report it. Marks are each fund's own, on its own date."
        right={<SearchInput value={q} onChange={setQ} placeholder="Search funds…" className="w-56"
          suggestions={m.funds.map((f) => f.security)} />}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Fund</th>
                <th className="label-xs px-4 py-2 text-left font-medium"
                  title="Who REPORTS the holding to this book — a depository or a wealth platform, which is not necessarily the fund's manager. No statement here states a manager for every fund, so none is asserted.">Reported by</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Folios</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Units</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                <th className="label-xs px-4 py-2 text-left font-medium">As of</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {fundsShown.map((f) => (
                <tr key={f.securityKey} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 font-medium text-slate-100">
                    <StockLink securityKey={f.securityKey} name={f.security} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{f.providers.join(", ")}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{f.folios}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{fmtNum(f.units, 3)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    {f.cost == null
                      ? <AbsentCell reason="this statement reports a value and no cost — a depository holds the units, it did not buy them, and a zero cost would report the whole value as profit" />
                      : money(f.cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(f.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono">
                    {f.returnPct == null
                      ? <AbsentCell reason={f.cost == null
                        ? "no cost is reported for this fund, so there is no capital to strike a return against"
                        : "the cost reported here covers only part of this row's value, and a percentage across the two would divide one set of holdings by another"} />
                      : <span className={changeColor(f.returnPct)}>{fmtPct(f.returnPct, { sign: true, decimals: 1 })}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    <Auditable formula={weightFormula(f.mv, m.privMV, m.privMV > 0 ? (f.mv / m.privMV) * 100 : null, money, "the private book")}>
                      {m.privMV > 0 ? `${((f.mv / m.privMV) * 100).toFixed(1)}%` : DASH}
                    </Auditable>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {f.asOf.length === 0 ? <AbsentCell reason="this holding's account states no report date" />
                      : f.asOf.length === 1 ? fmtDate(f.asOf[0])
                      : `${fmtDate(f.asOf[0])} → ${fmtDate(f.asOf[f.asOf.length - 1])}`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-600 font-semibold">
                <td className="px-4 py-2.5 text-slate-200" colSpan={4}>Total · {m.funds.length} funds</td>
                <td className="px-4 py-2.5 text-right mono text-slate-300">{money(m.privCost)}</td>
                <td className="px-4 py-2.5 text-right mono text-slate-100">{money(m.privMV)}</td>
                <td className="px-4 py-2.5 text-right mono">
                  {m.privCost != null && m.privCost > 0 && m.privPnL != null
                    ? <span className={changeColor((m.privPnL / m.privCost) * 100)}>{fmtPct((m.privPnL / m.privCost) * 100, { sign: true, decimals: 1 })}</span>
                    : <AbsentCell reason="no cost is reported across this book's private holdings" />}
                </td>
                <td className="px-4 py-2.5 text-right mono text-slate-300">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {/* The footer's return covers a narrower set than its own Value column,
            so the row says which — the rule the Morning CIO footer was fixed for. */}
        {m.costedCount < m.scope.dedupedRows.length && (
          <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            The return is struck on the {money(m.privCost)} of cost these statements report, covering {money(m.costedMV)}
            {" "}of the {money(m.privMV)} above. The other {m.scope.dedupedRows.length - m.costedCount} folio
            {m.scope.dedupedRows.length - m.costedCount === 1 ? " row reports" : " rows report"} a value and no cost.
          </p>
        )}
        {excludedRest.length > 0 && (
          <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            Not on this page: {excludedRest.map((c) => `${assetClassLabel(c.key)} ${money(c.mv)} (${c.count})`).join(" · ")}.
          </p>
        )}
      </Card>

      {/* ── Card B — folio by folio, PER-ACCOUNT, not deduped ── */}
      <Card className="mt-5" pad={false} title="Folio by folio, as each statement prints it"
        subtitle="Every private row exactly as its own statement reports it. Two holdings are reported under two members each; both rows are here, and the consolidated total above counts each once."
        right={<Pill tone="info">{m.folios.length} rows</Pill>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Fund</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Owner</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Account</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Units</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                <th className="label-xs px-4 py-2 text-left font-medium">As of</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {m.folios.map((f, i) => (
                <tr key={`${f.accountId}-${f.position.securityKey}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 text-slate-100">
                    <StockLink securityKey={f.position.securityKey} name={f.position.security} />
                    {f.alsoCount > 1 && (
                      <span className="ml-2 align-middle">
                        <Pill tone="warn">also reported under {f.alsoReportedUnder.map(ownerDisplayName).join(", ") || "another account"}</Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{f.owner}</td>
                  <td className="px-4 py-2.5 text-slate-400">
                    <Auditable to={auditHref({ find: f.accountNo })} title={`${f.provider} ${f.accountNo} — find this account's statements`}>
                      {f.provider} {f.accountNo}
                    </Auditable>
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{fmtNum(f.position.quantity, 3)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    {f.position.costBasis == null
                      ? <AbsentCell reason="this statement reports a value and no cost" />
                      : money(f.position.costBasis)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(f.position.marketValue)}</td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {f.asOf ? fmtDate(f.asOf) : <AbsentCell reason="this account states no report date" />}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-600 font-semibold">
                <td className="px-4 py-2.5 text-slate-200" colSpan={5}>Total · {m.folios.length} rows</td>
                <td className="px-4 py-2.5 text-right mono text-slate-100">{money(m.rawMV)} as printed</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {/* The rows on screen add to MORE than the consolidated figure, by
            design. Said here rather than left for a reader to find by adding. */}
        {m.scope.doubleCounted > 0 && (
          <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            <span className="text-slate-300">{money(m.scope.doubleCounted)} of the {money(m.rawMV)} above is two holdings reported under two members each.</span>{" "}
            The consolidated {money(m.privMV)} counts each once. Both statements are shown because both were issued, and
            the two marks are not identical — each member's fund reports on its own date.
          </p>
        )}
        {/* Per-owner, RAW — these add to the printed total, not the consolidated one. */}
        <div className="border-t border-ink-700/60 px-4 py-3">
          <div className="label-xs mb-2">By owner · each member's own statements</div>
          <table className="min-w-full text-[12.5px]">
            <tbody className="divide-y divide-ink-700/60">
              {m.owners.map((o) => (
                <tr key={o.owner}>
                  <td className="py-1.5 pr-4 text-slate-300">{o.owner}</td>
                  <td className="py-1.5 pr-4 text-right mono text-slate-500">{o.rows} {o.rows === 1 ? "row" : "rows"}</td>
                  <td className="py-1.5 pr-4 text-right mono text-slate-400">{o.cost == null ? DASH : money(o.cost)}</td>
                  <td className="py-1.5 text-right mono text-slate-200">{money(o.mv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            A per-owner figure counts each member's own statement, so these add to {money(m.rawMV)} and not to the
            consolidated {money(m.privMV)}.
          </p>
        </div>
      </Card>

      {/* ── Card C — the capital accounts ── */}
      <Card className="mt-5" pad={false} title="Capital accounts: committed, drawn and still to call"
        subtitle="What the family has signed up for with each drawdown fund, what the fund has actually called, and what it can still call. Every figure as the statement prints it."
        right={<Pill tone="info">{m.ct.count} capital accounts</Pill>}>
        {m.commitments.length === 0 ? (
          <div className="p-5">
            <AbsentSection what="No capital account in this book"
              needs="Commitments, calls and undrawn capital come from a drawdown fund's own capital-account statement. No statement in this drop reports one." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Fund</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Owner</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Committed</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Drawn</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Still to call</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Cash returned</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">As of</th>
                    <th className="label-xs px-4 py-2 text-left font-medium"
                      title="Whether the fund's own three figures agree: committed − drawn = undrawn, to the rupee.">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {[...m.commitments].sort((a, b) => b.committed - a.committed).map((c) => {
                    const valued = m.owned.has(c.accountId);
                    return (
                      <tr key={c.accountId} className="hover:bg-ink-700/40">
                        <td className="px-4 py-2.5 text-slate-100">
                          {c.name}
                          {/* The separator is a real character, not a margin: the
                              margin is invisible to `innerText`, so the name and
                              the chip read as one word to any reader — or check —
                              that takes the page's text rather than its pixels. */}
                          {!valued && <span className="text-[10.5px] text-amber-400"> · no valuation published</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{ownerDisplayName(c.ownerId)}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-300">{money(c.committed)}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-300">
                          {c.drawn == null ? <AbsentCell reason="this statement reports no drawdown figure" /> : money(c.drawn)}
                        </td>
                        <td className="px-4 py-2.5 text-right mono">
                          {c.undrawn == null
                            ? <AbsentCell reason="this statement prints a commitment and a drawdown and no undrawn figure. A zero here would assert the fund has nothing left to call." />
                            : c.undrawn === 0
                              ? <span className="text-slate-400" title="fully called — the statement prints nil uncalled">{money(0)}</span>
                              : <span className="text-amber-400">{money(c.undrawn)}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400">
                          {c.distributed == null
                            ? <AbsentCell reason="this statement reports no distribution" />
                            : money(c.distributed)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                          {c.asOf ? fmtDate(c.asOf) : <AbsentCell reason="this statement states no date" />}
                        </td>
                        <td className="px-4 py-2.5">
                          {/* THREE-VALUED, never `!c.arithmeticHolds`: null means the
                              statement prints one figure fewer, not that it disagrees. */}
                          {c.arithmeticHolds === true ? <Pill>ties</Pill>
                            : c.arithmeticHolds === false ? <Pill tone="warn">the statement disagrees with itself</Pill>
                              : <AbsentCell reason="committed − drawn = undrawn cannot be struck here: the statement prints no undrawn figure" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 font-semibold">
                    <td className="px-4 py-2.5 text-slate-200" colSpan={2}>Total</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">{money(m.ct.committed)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">{money(m.ct.drawn)}</td>
                    <td className="px-4 py-2.5 text-right mono text-amber-400">
                      Still to call {money(m.ct.undrawn)} ({m.ct.undrawnOf} of {m.ct.count})
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{money(m.ct.distributed)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
              Undrawn is summed exactly as each statement prints it and never derived from committed − drawn, so a fund
              that publishes no undrawn figure is skipped rather than counted as having nothing left to call.
            </p>
          </>
        )}
      </Card>

      {/* ── Card D — the accounts nothing values ── */}
      <Card className="mt-5" pad={false} title="Private accounts whose fund publishes no valuation"
        subtitle="Capital the family has paid that appears on no holdings table in this app, because the fund states no NAV to mark it at."
        right={<Pill tone="warn">{m.unvalued.length} accounts</Pill>}>
        {m.unvalued.length === 0 ? (
          <div className="p-5">
            <AbsentSection what="Every private account in this book is valued"
              needs="Nothing to report here: each private folio's fund publishes a valuation." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Account</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Owner</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Drawn</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Still to call</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {m.unvalued.map((u) => (
                    <tr key={u.account.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 text-slate-100">
                        <Auditable to={auditHref({ find: u.account.accountNo })} title={`${u.account.provider} ${u.account.accountNo} — find this account's statements`}>
                          {u.account.provider} {u.account.accountNo}
                        </Auditable>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{u.account.owner}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-300">
                        {u.drawn == null
                          ? <AbsentCell reason="this folio has no capital-account statement in this drop" />
                          : money(u.drawn)}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">
                        {u.undrawn == null ? <AbsentCell reason="no capital-account statement, so no undrawn figure" />
                          : u.undrawn === 0 ? <span title="fully called — the statement prints nil uncalled">{money(0)}</span>
                            : money(u.undrawn)}
                      </td>
                      {/* NEVER ₹0 HERE. A fund that states no NAV has not measured
                          nothing — it has published nothing to measure. */}
                      <td className="px-4 py-2.5 text-right mono">
                        <AbsentCell reason={u.reason ?? "no statement for this account carries a valuation"} />
                      </td>
                      <td className="px-4 py-2.5 max-w-md text-[11.5px] leading-relaxed text-slate-500">
                        {u.kind === "no-nav" ? "the fund publishes no NAV — its statement carries units and the capital drawn against a commitment, and no valuation"
                          : u.kind === "income-only" ? "income-only folio — its documents report earnings and distributions, and no valuation. The units themselves are marked under this family's wealth-platform account and counted there"
                            : u.kind === "redeemed" ? "redeemed to nil — every holding on its statement has been paid back, which is a measurement and not a gap"
                              : (u.reason ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
              <span className="text-slate-300">{money(m.unvaluedDrawn)} of drawn capital across {m.unvaluedNoNav.length} of these accounts is real, paid, and in no total on this page.</span>{" "}
              Nothing values it: the contributions are what was paid rather than what the stake is worth. It is not inside
              the {money(m.privMV)} above and must not be added to it.
            </p>
          </>
        )}
      </Card>

      {/* ── Card E — what this book does not carry ── */}
      <Card className="mt-5" title="What this book does not carry, and what would fill it"
        subtitle="Named rather than drawn as empty frames or rows of zeros — an empty bucket and a bucket worth nothing are different facts.">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["No private-equity, pre-IPO, unlisted-company or debt-fund structure",
              "No statement in this drop reports a fund-of-funds structure with its own TVPI and DPI. The AIF holdings above are ordinary positions and the undrawn capital is in the register."],
            ["No startup or direct-company register",
              "A pre-money valuation, a fully-diluted stake and a round history are a shareholders' agreement and a cap table. No statement issuer holds them and no reader can extract them."],
            ["No look-through into what a fund holds",
              "This needs each scheme's own portfolio disclosure joined to the folio the family holds. The drop carries one such disclosure and it joins to no folio here, so a fund's value stays whole inside its own row rather than being spread across sectors it was never reported against."],
            ["No valuation history for any private holding",
              "Two dated portfolio values per account is not a series. A monthly or quarterly valuation statement per folio is what a trajectory needs."],
            ["No realised gain on any private account",
              "Every AIF-engagement account states that no capital gain statement was issued for it in this drop. Their redemptions are real; what they realised was never reported."],
            ["No capital-call timeline",
              "Some funds' capital registers carry dated rows and others print their drawdowns as page text their reader does not yet emit. Drawing a timeline over the funds that have one and silently omitting the rest would be a chart whose coverage a reader cannot see; the fix belongs in the ingest, not here."],
            ["No sector for a fund",
              "A GICS sector is a property of a company; a fund is a wrapper holding many, and no statement here prints a sector for a folio. These holdings are correctly excluded from Sector Composition and the market-cap bands."],
            ["No money-weighted return on the private book",
              "An XIRR needs dated flows and an opening portfolio value per account. No private account in this book publishes both, so none is struck — a rate closed against a stake nobody stated would overstate rather than approximate."],
          ].map(([what, needs]) => (
            <div key={what} className="rounded-lg border border-dashed border-ink-600/70 px-3 py-2.5">
              <div className="text-[12px] font-medium text-slate-300">{DASH} {what}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{needs}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
