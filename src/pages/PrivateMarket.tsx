import { useMemo, useState } from "react";
import { Handshake, Landmark, Wallet, TrendingUp, Fuel, Coins, Banknote, HelpCircle, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { StockLink } from "@/components/StockLink";
import { Auditable } from "@/components/Auditable";
import { AbsentCell, AbsentSection, absentTile, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { sum, sumOrNull, consolidatedMarketValue, currentHoldings, excludedClasses, isPrivateClass, assetClassLabel } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals, unvaluedAccounts, unvaluedDrawn,
} from "@/lib/privateMarket";
import { schemeCalls, callTotals, callHistory, callWindows } from "@/lib/capitalCalls";
import { weightFormula } from "@/lib/auditFormulas";
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
// contract — so it reads `statementPortfolio`, and that has NOT changed.
//
// What HAS changed is that it no longer says so: the `<BasisPill statement>` was
// removed at the family's request (see the note above the header below). The
// pill was the LABEL; `statementPortfolio` is the guarantee, and swapping the
// source while keeping the label was always the trap — the label would be a
// claim the page does not honour. Removing the label leaves the claim true and
// unstated, which is weaker and is recorded rather than glossed. What makes it
// cost almost nothing HERE is measurable: no AIF unit resolves an NSE symbol, so
// no quote would ever touch these rows even on the live portfolio, and
// `check:pages` asserts that premise instead of trusting it.

export function PrivateMarket() {
  const { statementPortfolio: portfolio, fmtFromBase } = usePortfolio();
  const [q, setQ] = useState("");

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });

  const m = useMemo(() => {
    if (!portfolio) return null;
    const accIdx = accountIndex(portfolio.accounts);
    /**
     * CURRENT HOLDINGS, LIKE EVERY OTHER ALLOCATION SURFACE — and deliberately
     * NOT for `unvaluedAccounts` two lines down.
     *
     * *"if anything has been redeemed or sold completely then remove it from
     *  these pages since they are supposed to be the current holdings
     *  allocation only."* Card A is one row per fund, and 3P's three unit
     *  classes stood in it at ₹0 apiece — a fund that has already paid the
     *  family out, taking three of its fourteen rows.
     *
     * `unvaluedAccounts` asks a DIFFERENT question — does this account report
     * any holding at all — and narrowing it would fold 3P's account into the
     * list of funds that publish no NAV, which is the opposite of true: it
     * publishes one and redeemed against it. A confidently wrong reason sends
     * the next reader to ask a fund manager for a NAV no fund owes, which this
     * book has already recorded once. So it keeps the whole set.
     */
    const scope = privateScope(currentHoldings(portfolio.positions), portfolio.accounts);
    const commitments = portfolio.commitments ?? [];

    const funds = fundRollup(scope.dedupedRows, accIdx);
    const folios = folioRows(scope.rows, accIdx);
    const owners = ownerRollup(scope.rows, accIdx);
    const ct = commitmentTotals(commitments);
    /**
     * THE CAPITAL-CALL VIEW OF THE SAME REGISTER, per scheme.
     *
     * `commitmentTotals` answers "what does the register add to"; this answers
     * "what has each fund demanded, when, and what can it still ask for" — the
     * question the family actually put. Both read the ONE `portfolio.commitments`
     * array, so the tiles and the timeline cannot describe different registers.
     */
    const schemes = schemeCalls(
      commitments,
      (c) => c.name,
      (c) => (c.ownerId ? ownerDisplayName(c.ownerId) : null),
    );
    const cc = callTotals(schemes);
    const history = callHistory(schemes);
    /**
     * The windows run from the NEWEST capital-account date rather than from
     * `new Date()`, because that is the date the uncalled balances are struck
     * at. A window measured from today over balances measured in July would
     * claim a currency the figures do not have — the same reason `pooledXirr`
     * closes each account on its own as-of.
     */
    const asOfCalls = schemes.map((r) => r.asOf).filter(Boolean).sort().pop() ?? null;
    const windows = asOfCalls ? callWindows(schemes, asOfCalls) : [];
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
      schemes, cc, history, windows, asOfCalls,
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
      {/*
        NO SUBTITLE AND NO PILL ROW, at the family's request — and the audit that
        preceded the removal is the whole of why it was safe.

        The subtitle said what the page is (its title does) and counted its
        funds, accounts and owners. TWO OF THE THREE were already stated by the
        tables: the fund table's footer reads `Total · N funds`, and the By-owner
        rollup ENUMERATES the owners, which is stronger than counting them. The
        ACCOUNTS count was nowhere else, so it moved onto the Private market
        value tile — a fact about that figure's breadth belongs on the figure.

        THE PILLS WERE `<BasisPill statement>` AND A COUNT, AND LOSING THE FIRST
        COSTS LESS HERE THAN ANYWHERE ELSE IN THE APP — measured, not assumed:

          · the LABEL. `statementPortfolio` is still the source and that is what
            the guarantee actually rests on (§6's correctness half). What the
            label added was the reader being TOLD. On this page no row could
            drift even if it read the live portfolio: not one private holding
            resolves an NSE symbol, so no quote would ever touch these rows.
            `check:pages` asserts that premise rather than trusting it, so a
            drop that brings a quotable private holding fires rather than
            silently making this paragraph false.
          · the DATE. `<BasisPill>` dates a consolidated figure `portfolio.asOf`
            — the newest report date in the whole book, two weeks ahead of every
            mark on this page. The derived spread below ("Marks span … → …")
            was always the truer statement, and it stays. Losing the pill's date
            is a gain here, which is the same argument `Polycab.tsx` makes at
            length for never having used the component at all.
          · `N accounts behind` is about the BOOK's accounts, not this page's.

        Capital Gains, Data Audit and Ledger Insights keep theirs, and
        `check:pages` still asserts one of them: a build that deleted the
        component everywhere would satisfy this removal and silently take the
        guarantee with it.
      */}
      <PageHeader eyebrow="Daily" title="Private Market" />

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
          sub={`${m.bookMV > 0 ? fmtPct((m.privMV / m.bookMV) * 100, { decimals: 2 }) : DASH} of the ${money(m.bookMV)} book · across ${m.scope.accounts.length} accounts · each holding counted once`} />

        <StatTile label="Capital invested" icon={<Wallet className="h-4 w-4" />}
          value={money(m.privCost)}
          sub={`cost in · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one`} />

        <StatTile label="Unrealised P&L" icon={<TrendingUp className="h-4 w-4" />}
          value={<span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>}
          sub={m.privCost != null && m.privCost > 0
            ? `on the ${money(m.privCost)} these statements report as cost, covering ${money(m.costedMV)} of the ${money(m.privMV)} above`
            : "no statement here reports a cost to measure a gain against"} />

        {/*
            *"How are you calculating this uncalled capital of 16 crores? …
             Something seems amiss here. According to me, the number is not 16
             crores."* — the client, on this tile, a round after it first grew a
            definition.

            THE ARITHMETIC WAS RIGHT AND THE TILE WAS STILL WRONG, and both
            halves of that are worth stating because only the second is fixable:

              · the ₹15.98 Cr ties. Summed as printed over the 13 accounts that
                print an uncalled line it is ₹15,97,50,000, and committed less
                CALLED over all 15 comes to the same figure to the rupee. Two
                paths, one answer, and the per-scheme table below shows every
                row of it.
              · IT IS A FLOOR AND THE TILE NEVER SAID SO. It covers the capital
                accounts this book HAS A STATEMENT FOR, and those are a minority
                of the family's private accounts. A fund whose capital account
                nobody sent contributes nothing to this figure and can still
                call money tomorrow, so a reader who knows about such a
                commitment is right that the number is too small — and the tile
                gave them no way to see that.

            So the tile states the coverage as its own sub-line rather than
            burying it, and the card below names which accounts are outside it.
        */}
        <StatTile label="Still to call (uncalled capital)" icon={<Fuel className="h-4 w-4" />}
          value={<span className="text-amber-400">{money(m.ct.undrawn)}</span>}
          sub={`across ${m.ct.count} of this page's ${m.scope.accounts.length} private accounts · the rest send no capital account, so this is a floor`}
          hint="Money promised to these funds that they have not yet asked for. A bill that can arrive any day — not an asset, and in no total on this page." />
      </div>

      {/* ── COMMITTED vs CALLED vs INVESTED — three figures, not two ──────────
          *"Capital committed, or is it capital invested? What is capital
           committed versus invested? … Because committed can be one thing. I
           would commit 10 crores, but I may have only invested so far 5 crores,
           and 5 crores is remaining to be drawn."*

          The client is describing the model exactly, and the page was printing
          two of its three figures under one word. `Drawn` was whichever of
          CALLED and PAID each fund's own layout happened to match — the same
          field meaning two things across fifteen rows. They are separate now,
          each read off the line its own statement labels, and each tile says
          which of the four quantities it is in the client's own words. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Committed" icon={<Landmark className="h-4 w-4" />}
          value={money(m.ct.committed)} sub={`${m.ct.committedOf} of ${m.ct.count} capital accounts`}
          hint="The full amount signed for, whether or not the fund has asked for it yet. Not money spent, and in no market value on this page." />

        <StatTile label="Called by the funds" icon={<Banknote className="h-4 w-4" />}
          value={m.cc.called == null ? DASH : money(m.cc.called)}
          sub={`${m.cc.calledOf} of ${m.cc.count} capital accounts print a called line`}
          hint="What the funds have demanded so far. It covers a different set of accounts from Invested, so the two must never be subtracted." />

        <StatTile label="Invested (paid in)" icon={<Wallet className="h-4 w-4" />}
          value={m.cc.paid == null ? DASH : money(m.cc.paid)}
          sub={`${m.cc.paidOf} of ${m.cc.count} capital accounts · cash that has actually left the family's bank`}
          hint="Cash that has actually left the family’s bank. Not the same set as Capital invested above, which is the cost of every private holding." />

        <StatTile label="Due now (called, unpaid)" icon={<CalendarClock className="h-4 w-4" />}
          value={m.cc.dueNow == null ? DASH : <span className={m.cc.dueNow > 0 ? "text-amber-400" : undefined}>{money(m.cc.dueNow)}</span>}
          sub={m.cc.dueNowOf === 0
            ? "no statement here prints a called-but-unpaid line"
            : `${m.cc.dueNowOf} of ${m.cc.count} accounts print this line · a measured figure, not an assumption`}
          hint="Called by the fund and not yet paid — the one figure here that is genuinely owed rather than merely possible." />
      </div>

      {/* ── What the money is, once it is in ── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* THE FIGURE THIS PAGE EXISTS FOR. Real money, paid, and in NO total
            above it: adding drawn capital to a market value reports what was
            paid as what the stake is worth.

            THE LABEL WAS THE CLIENT'S THIRD QUESTION — *"Drawn against no
            valuation means?"* — and it was jargon twice over: "drawn" is the
            fund's word for having taken the money, and "against no valuation"
            is a property of the STATEMENT rather than of the money. It says
            what it is now, and the definition is on the tile rather than in a
            hover, like the three above it. */}
        <StatTile label="Paid in, but never valued" icon={<HelpCircle className="h-4 w-4" />}
          value={<span className="text-amber-400">{money(m.unvaluedDrawn)}</span>}
          sub={`${m.unvaluedNoNav.length} funds that publish no NAV at all · not in the private market value above`}
          hint="Cash paid into funds that have never published a valuation. Real money, and in no total on this page." />

        {/* *"what is distributions?"* — same treatment, and the label carries the
            client's own word beside the plain one rather than only the plain one:
            the sub-line under this tile has always said "distribution figure",
            so a reader who asks what a distribution is was reading a word the
            tile used and never defined. */}
        <StatTile label="Distributions (cash returned)" icon={<Coins className="h-4 w-4" />}
          value={money(m.ct.distributed)}
          sub={`${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`}
          hint="Cash these funds have already paid back. Not part of the value above, and it does not reduce what a fund can still call." />
      </div>

      {/* Two tiles that would be natural here and are absent by measurement. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatTile label="Realised gain" icon={<Coins className="h-4 w-4" />}
          {...absentTile(
            "no capital gain statement covers any private account in this drop",
            "Every AIF-engagement account carries that absence verbatim in the book's capital-gain record. Their redemptions are real; what they realised was never reported to this book, so it is absent rather than nil.")} />
        {/* ITS REASON WAS HALF FALSE THE MOMENT THE CALLS WERE READ, and this
            file has recorded that failure — an absence standing on a premise
            nobody rechecked — often enough to catch it in its own change. It
            read "none publishes its calls as dated data", which was true when
            written and is now false of every one of these fifteen accounts.
            What is still missing is the OTHER half, and only that half: a
            distribution figure on 12 of the 15. So the reason names the real
            gap and counts it, rather than claiming a shortfall this book just
            closed. */}
        <StatTile label="Net multiple (TVPI / DPI)" icon={<Handshake className="h-4 w-4" />}
          {...absentTile(
            `only ${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`,
            `A multiple divides what has come back plus what is still inside by what went in. The last of those three is now measurable per folio — ${m.cc.callCount} dated calls, each reconciled against its own statement — and the first is not: ${m.ct.count - m.ct.distributedOf} of these ${m.ct.count} accounts print no distribution line at all. Reading those as nil would report a fund that has returned nothing when its statement simply does not say, and a DPI built on that understates every folio it touches.`)} />
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
                /* The fund's own key, so a claim about WHICH funds this table
                   draws is struck on structure rather than on a rendered name. */
                <tr key={f.securityKey} data-pm-fund={f.securityKey} className="hover:bg-ink-700/40">
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
                    {f.provider} {f.accountNo}
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

      {/* ── Card C — THE CAPITAL-CALL TIMELINE ────────────────────────────────
          *"Where is it pending? … what is the timeline? When is the commitment
           expected? Or is there something which is due in the next one month,
           three months, six months?"*

          THE HONEST ANSWER IS ASYMMETRIC, and the card is built to say so
          rather than to look complete. Measured across all 265 documents in
          this archive: NOT ONE publishes a forward drawdown schedule — no
          commitment-period end date, no call notice dated ahead of its own
          statement, no expected-drawdown table. A drawdown fund calls when it
          finds something to buy, and none of these has said when that will be.

          So the three windows are drawn and are EMPTY, with the document that
          would fill them named. The tempting substitute is to project the next
          call from the observed cadence, and that is a forecast: rendered
          beside fifteen measured figures it reads as the sixteenth. What fills
          the card instead is what the statements do carry — what is called and
          unpaid TODAY, what is promised and unscheduled, and 52 dated calls
          showing exactly when each fund has asked before. */}
      <Card className="mt-5" title="Capital-call timeline"
        subtitle={m.asOfCalls
          ? `Windows run from ${fmtDate(m.asOfCalls)}, the newest capital-account date here — the date these balances are struck at, not today.`
          : "No capital account here states a date, so no window can be anchored."}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* DUE NOW is a MEASUREMENT and the windows are not. They sit in one
              row because a reader is comparing them, and the first is styled as
              a figure while the rest state their own absence. */}
          <div className="rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2.5" data-call-bucket="due-now">
            <div className="label-xs">Due now</div>
            <div className="mt-1 text-lg mono text-slate-100">
              {m.cc.dueNow == null ? DASH : money(m.cc.dueNow)}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {m.cc.dueNowOf === 0
                ? "No statement here prints a called-but-unpaid line, so nothing can be said to be outstanding."
                : `Called and not yet paid, on the ${m.cc.dueNowOf} of ${m.cc.count} accounts whose statement prints the line. A measured figure — the rest are skipped, never counted as nil.`}
            </p>
          </div>
          {m.windows.map((w) => (
            <div key={w.key} className="rounded-lg border border-dashed border-ink-600/70 px-3 py-2.5" data-call-bucket={w.key}>
              <div className="label-xs">{w.label}</div>
              <div className="mt-1 text-lg mono text-slate-400">
                {w.scheduled.length === 0
                  ? <AbsentCell reason="no fund in this book publishes a forward drawdown schedule, so nothing can be placed in this window. A drawdown notice or a commitment-period schedule from the fund is what would fill it." />
                  : money(sum(w.scheduled.map((c) => c.amount)))}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {w.scheduled.length === 0
                  ? "Nothing scheduled — see below."
                  : `${w.scheduled.length} call${w.scheduled.length === 1 ? "" : "s"} the funds have dated into this window.`}
              </p>
            </div>
          ))}
          {/* THE BUCKET THAT ACTUALLY HOLDS THE MONEY, and it holds it because
              no window can claim it. Drawn as a real figure rather than a
              dashed frame: it is measured, it is simply not dated. */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5" data-call-bucket="unscheduled">
            <div className="label-xs text-amber-300/80">Promised, no date</div>
            <div className="mt-1 text-lg mono text-amber-400">{money(m.ct.undrawn)}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Uncalled capital these funds can ask for on any day, across {m.ct.undrawnOf} of {m.ct.count} accounts.
              It is not in the windows because no fund has scheduled it, not because it is far off.
            </p>
          </div>
        </div>
        <p className="mt-3 border-t border-dashed border-ink-700 pt-3 text-[11.5px] leading-relaxed text-slate-500">
          <span className="text-slate-300">No fund in this book publishes a forward drawdown schedule.</span>{" "}
          Checked across every document in the archive: none prints a commitment-period end date, a call notice
          dated ahead of its own statement, or an expected-drawdown table. What would fill these windows is a
          <span className="text-slate-400"> drawdown notice</span> or a
          <span className="text-slate-400"> commitment-period schedule</span> from each fund — one document per
          drawdown folio. Until one arrives the whole {money(m.ct.undrawn)} is callable at any time, which is
          why it is shown as one undated figure rather than spread across months nobody has committed to.
          {m.cc.staleUncalled != null && m.cc.staleUncalled > 0 && (
            <> And <span className="text-amber-400">{money(m.cc.staleUncalled)}</span> of it is measured on a
              statement older than the newest here ({m.cc.staleRows.map((r) => `${r.fund} · ${fmtDate(r.asOf!)}`).join(", ")}),
              so a call made since would not show.</>
          )}
        </p>
      </Card>

      {/* ── Card C2 — scheme by scheme, with the uncalled figure's own working ─
          *"so labels are there, but they just need more granularity and
           timeline and dates and also the schemes."* — the four columns a
          reader has to be able to add up themselves, plus the CHECK column that
          answers "how are you calculating this": committed − called against the
          uncalled figure the fund itself prints. */}
      <Card className="mt-5" pad={false} title="Scheme by scheme: committed, called, invested and still to call"
        subtitle="Every drawdown fund's own capital account. Each figure is read off the line that fund's statement labels, and the check column sets the printed uncalled figure against committed − called."
        right={<Pill tone="info">{m.cc.count} capital accounts</Pill>}>
        {m.commitments.length === 0 ? (
          <div className="p-5">
            <AbsentSection what="No capital account in this book"
              needs="Commitments, calls and uncalled capital come from a drawdown fund's own capital-account statement. No statement in this drop reports one." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Fund</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Owner</th>
                    <th className="label-xs px-4 py-2 text-right font-medium"
                      title="What the family promised this fund in total.">Committed</th>
                    <th className="label-xs px-4 py-2 text-right font-medium"
                      title="What the fund has demanded so far, off the line its own statement labels.">Called</th>
                    <th className="label-xs px-4 py-2 text-right font-medium"
                      title="What the family has actually paid in — capital invested.">Invested</th>
                    <th className="label-xs px-4 py-2 text-right font-medium"
                      title="Uncalled capital, exactly as the fund prints it — never worked out as committed − called.">Still to call</th>
                    <th className="label-xs px-4 py-2 text-right font-medium"
                      title="Dated calls this fund has made, each reconciled against the total its own statement prints.">Calls</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">As of</th>
                    <th className="label-xs px-4 py-2 text-left font-medium"
                      title="Does the fund's printed uncalled figure equal its own committed − called? This is the working behind the total.">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {m.schemes.map((r) => {
                    const valued = m.owned.has(r.accountId);
                    return (
                      <tr key={r.accountId} className="hover:bg-ink-700/40" data-scheme={r.accountId}>
                        <td className="px-4 py-2.5 text-slate-100">
                          {r.fund}
                          {/* The separator is a real character, not a margin: the
                              margin is invisible to `innerText`, so the name and
                              the chip read as one word to any reader — or check —
                              that takes the page's text rather than its pixels. */}
                          {!valued && <span className="text-[10.5px] text-amber-400"> · no valuation published</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{r.owner ?? DASH}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-300">{money(r.committed)}</td>
                        <td className="px-4 py-2.5 text-right mono text-slate-300">
                          {r.called == null
                            ? <AbsentCell reason="this statement prints a contribution column and no called line, so what the fund has demanded is not stated. Reading the contribution as the call would assert the two are equal, which is exactly what this column exists to separate." />
                            : money(r.called)}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-300">
                          {r.paid == null
                            ? <AbsentCell reason="this statement reports no contribution figure" />
                            : money(r.paid)}
                        </td>
                        <td className="px-4 py-2.5 text-right mono">
                          {r.uncalled == null
                            ? <AbsentCell reason={r.impliedUncalled == null
                              ? "this statement prints no uncalled line. A zero here would assert the fund has nothing left to call."
                              : `this statement prints no uncalled line. Its own committed − called comes to ${fmtNum(r.impliedUncalled, 0)}, shown here as arithmetic rather than as the fund's figure.`} />
                            : r.uncalled === 0
                              ? <span className="text-slate-400" title="fully called — the statement prints nil uncalled">{money(0)}</span>
                              : <span className="text-amber-400">{money(r.uncalled)}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400" data-calls={r.calls.length}>
                          {r.calls.length === 0
                            ? <AbsentCell reason="this statement prints no dated drawdown table, or the rows it prints did not reconcile against its own printed total" />
                            : <span title={r.calls.map((k) => `${k.date} · ${k.label ?? "call"}`).join("\n")}>
                              {r.calls.length}
                              {r.firstCall && <span className="text-[10.5px] text-slate-500"> · {fmtDate(r.firstCall)} → {fmtDate(r.lastCall!)}</span>}
                            </span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                          {r.asOf ? fmtDate(r.asOf) : <AbsentCell reason="this statement states no date" />}
                          {(r.staleDays ?? 0) > 31 && (
                            <span className="text-[10.5px] text-amber-400"> · {r.staleDays}d behind</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {/* THREE-VALUED, never `!ties`: null means the statement
                              prints one figure fewer, not that it disagrees. */}
                          {r.uncalledTies === true ? <Pill>ties</Pill>
                            : r.uncalledTies === false ? <Pill tone="warn">the statement disagrees with itself</Pill>
                              : <AbsentCell reason="committed − called = uncalled cannot be struck here: this statement prints one of the three figures short" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 font-semibold">
                    <td className="px-4 py-2.5 text-slate-200" colSpan={2}>Total · {m.cc.count} accounts</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">{money(m.cc.committed)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">
                      {m.cc.called == null ? DASH : money(m.cc.called)}
                      <span className="text-[10.5px] font-normal text-slate-500"> · {m.cc.calledOf} of {m.cc.count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">
                      {m.cc.paid == null ? DASH : money(m.cc.paid)}
                      <span className="text-[10.5px] font-normal text-slate-500"> · {m.cc.paidOf} of {m.cc.count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-amber-400">
                      {money(m.cc.uncalled)}
                      <span className="text-[10.5px] font-normal text-slate-500"> · {m.cc.uncalledOf} of {m.cc.count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{m.cc.callCount}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            {/*
              THE WORKING, IN ONE LINE — this is the client's own question
              answered arithmetically rather than in prose, and the two paths
              are shown SEPARATELY because they cover different sets.
            */}
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
              <span className="text-slate-300">Still to call is summed exactly as each fund prints it</span> — {money(m.cc.uncalled)} over
              the {m.cc.uncalledOf} accounts that print the line — and never derived from committed − called, because a fund
              that prints no uncalled figure has not said it has nothing left to call.
              {m.cc.called != null && m.cc.committedWhereCalled != null && (
                <> <span className="text-slate-300">The same figure the other way:</span> committed {money(m.cc.committedWhereCalled)} less
                  called {money(m.cc.called)} is {money(m.cc.committedWhereCalled - m.cc.called)}.
                  {" "}Both sides of that subtraction are struck over the SAME {m.cc.calledOf} accounts — the committed
                  figure here is not the {money(m.cc.committed)} in the footer, which spans all {m.cc.count}: taking
                  {" "}{m.cc.count - m.cc.calledOf} account{m.cc.count - m.cc.calledOf === 1 ? "'s" : "s'"} commitment
                  from a called total that does not include {m.cc.count - m.cc.calledOf === 1 ? "it" : "them"} would
                  overstate what is left by that whole commitment.</>
              )}
              {" "}<span className="text-slate-300">Called and Invested cover different sets and must not be subtracted from each other:</span> the
              {" "}{m.cc.count - m.cc.calledOf} account{m.cc.count - m.cc.calledOf === 1 ? "" : "s"} missing from the first
              {m.cc.count - m.cc.calledOf === 1 ? " is" : " are"} present in the second, so the gap between the two footers is
              a coverage difference and not money paid twice.
            </p>
            {/* WHAT THIS TABLE CANNOT SEE — the answer to "the number is not 16
                crores". A capital account nobody sent contributes nothing here
                and can still call money tomorrow. */}
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
              <span className="text-slate-300">This is every capital account in the book and not every commitment the family has.</span>{" "}
              {m.cc.count} of this page&rsquo;s {m.scope.accounts.length} private accounts send a capital-account statement; the
              other {m.scope.accounts.length - m.cc.count} report a holding, an income split or nothing at all, and a commitment
              behind one of those is invisible here. The family&rsquo;s own investment register names further
              funds with no statement in this book at all — see Register. So {money(m.cc.uncalled)} is the floor
              of what can still be called, never the ceiling, and a closing statement from each of those funds is
              what would settle it.
            </p>
          </>
        )}
      </Card>

      {/* ── Card C3 — every dated call, newest first ───────────────────────────
          The "timeline and dates" half, and the only forward-looking evidence
          this corpus honestly supports: a reader who can see that a fund has
          called four times in eighteen months knows more about what is coming
          than any projection this book could print as a figure. */}
      {m.history.length > 0 && (
        <Card className="mt-5" pad={false} title="Every capital call these funds have made"
          subtitle="Each dated row as its own statement prints it, newest first. A fund's schedule is not published anywhere in this book; this is what it has actually done."
          right={<Pill tone="info">{m.history.length} calls</Pill>}>
          <div className="max-h-[26rem] overflow-y-auto overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-ink-700 bg-ink-800">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Date</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Fund</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Owner</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">The fund&rsquo;s own wording</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {m.history.map((c, i) => (
                  <tr key={`${c.accountId}-${c.date}-${i}`} className="hover:bg-ink-700/40" data-call-row={c.date}>
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-2 text-slate-200">{c.fund}</td>
                    <td className="px-4 py-2 text-slate-400">{c.owner ?? DASH}</td>
                    <td className="px-4 py-2 text-slate-500">{c.label ?? DASH}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{money(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-600 font-semibold">
                  <td className="px-4 py-2.5 text-slate-200" colSpan={4}>Total · {m.history.length} calls</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-100">{money(sum(m.history.map((c) => c.amount)))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            Every fund&rsquo;s rows were checked against the total its own statement prints for them before any of
            them reached this table — a schedule one call short understates what the family has paid and looks
            exactly like a complete one, so a set that did not reconcile is absent rather than partial.
          </p>
        </Card>
      )}

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
                    <th className="label-xs px-4 py-2 text-right font-medium"
                      title="What the family has actually paid into this folio — capital invested, the same quantity the Invested tile above counts.">Invested</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Still to call</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Value</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {m.unvalued.map((u) => (
                    <tr key={u.account.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 text-slate-100">
                        {u.account.provider} {u.account.accountNo}
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
            /* THE CAPITAL-CALL TIMELINE ENTRY IS GONE — its premise expired.
               It read "others print their drawdowns as page text their reader
               does not yet emit … the fix belongs in the ingest, not here",
               which was true and is now done: the readers emit them, 52 dated
               calls are in the book, and the timeline is three cards up. What
               replaces it is the narrower absence that remains — a FORWARD
               schedule, which no fund publishes at all. */
            ["No forward drawdown schedule from any fund",
              "Checked across every document in this archive: none prints a commitment-period end date, a call notice dated ahead of its own statement, or an expected-drawdown table. The dated calls above are what each fund HAS done; when the next one comes is a fact no statement here carries, and projecting it from the cadence would be a forecast printed beside measurements."],
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
