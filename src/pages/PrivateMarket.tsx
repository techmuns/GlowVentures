import { useMemo, useState } from "react";
import { Handshake, Landmark, Wallet, TrendingUp, Fuel, Coins, Banknote, HelpCircle, CalendarClock, Layers, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { SelectableTiles, type TileMetric } from "@/components/SelectableTiles";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { useViewParam } from "@/components/ViewToggle";
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

/**
 * WHICH FOUR TILES THE STRIP OPENS ON, and where a reader's own choice is kept.
 *
 * The default is the row that was already first on this page, which is the
 * smallest surprise available: what the top of the page always showed stays
 * where it was and the other twelve metrics are one dropdown away. Versioned,
 * so a set saved against an older catalogue can be retired by bumping it
 * rather than by rendering ids this build does not have.
 */
const PM_TILES_KEY = "glow:pmTiles:v1";

/** The funds table's columns, in the order its rows write their cells. */
const FUND_COLS = ["fund", "reportedBy", "folios", "units", "invested", "value", "return", "weight", "asOf"] as const;
const FOLIO_COLS = ["fund", "owner", "account", "units", "invested", "value", "asOf"] as const;
const OWNER_COLS = ["owner", "rows", "invested", "value"] as const;
const SCHEME_COLS = ["fund", "owner", "committed", "called", "paid", "uncalled", "calls", "asOf", "check"] as const;
const CALL_COLS = ["date", "fund", "owner", "label", "amount"] as const;
const UNVALUED_COLS = ["account", "owner", "invested", "uncalled", "value", "why"] as const;
const PM_DEFAULT_TILES = ["value", "cost", "pnl", "uncalled"] as const;

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

/**
 * THE THREE VIEWS OF THE PRIVATE BOOK, and each carries its OWN card title and
 * subtitle rather than sharing one.
 *
 * They are the same holdings on two different BASES — `funds` counts each
 * `dedupeGroup` once, `folios` and `owners` print every statement as issued —
 * so a single caption over all three would describe two of them wrongly. That
 * is the failure this page has already paid for once, and the ₹3.17 Cr between
 * the two bases is exactly what it would hide.
 */
const HOLDING_VIEWS = [
  {
    key: "funds", label: "By fund",
    title: "One row per fund, each holding counted once however many members report it.",
    cardTitle: "Funds this family holds",
    cardSub: "One row per fund, each holding counted once however many family members' statements report it. Marks are each fund's own, on its own date.",
  },
  {
    key: "folios", label: "By folio",
    title: "Every private row exactly as its own statement prints it — two holdings appear twice.",
    cardTitle: "Folio by folio, as each statement prints it",
    cardSub: "Every private row exactly as its own statement reports it. Two holdings are reported under two members each; both rows are here, and the consolidated total above counts each once.",
  },
  {
    key: "owners", label: "By owner",
    title: "Each member's own statements, so these add to the printed total and not the consolidated one.",
    cardTitle: "By owner, as each member's own statements print it",
    cardSub: "Each member's private folios summed on their own statements. A per-owner figure does not dedupe, so these add to the printed total rather than to the consolidated one above.",
  },
] as const;

export function PrivateMarket() {
  const { statementPortfolio: portfolio, fmtFromBase } = usePortfolio();
  const [q, setQ] = useState("");
  /**
   * WHICH GROUPING THE ONE HOLDINGS CARD DRAWS. In the URL like every other
   * view in this app, so a basis is a link a reader can send and the sweep can
   * hold each of the three to the light rather than guessing at a click.
   * `useViewParam` keeps the default param-free, so `/private-market` and
   * `/private-market?view=funds` do not become two addresses for one screen.
   */
  const [view, setView] = useViewParam(HOLDING_VIEWS, {}, "view");

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

  /**
   * ── THIS TABLE'S OWN ARRANGEMENT ──────────────────────────────────────────
   *
   * The ids are the order the row's `<td>`s are written in below, and `<Tr>`
   * permutes them to whatever the reader has dragged — so the cell JSX never
   * moves and, with nothing dragged, the rendered markup is what it always was.
   *
   * WEIGHT SORTS ON THE VALUE IT IS A SHARE OF, deliberately: every row's
   * weight is `mv ÷ the private book`, so the two orderings are identical and
   * re-deriving the percentage per row to sort by it would be a second
   * expression of one figure.
   */
  const fundView = useTableView("pm-funds", FUND_COLS);
  const folioView = useTableView("pm-folios", FOLIO_COLS);
  const ownerView = useTableView("pm-owners", OWNER_COLS);
  const schemeView = useTableView("pm-schemes", SCHEME_COLS);
  const historyView = useTableView("pm-call-history", CALL_COLS);
  const unvaluedView = useTableView("pm-unvalued", UNVALUED_COLS);
  const folioRowsShown = sortRows(m.folios, folioView.sort, {
    fund: (f) => f.position.security,
    owner: (f) => f.owner,
    account: (f) => `${f.provider} ${f.accountNo}`,
    units: (f) => f.position.quantity,
    invested: (f) => f.position.costBasis,
    value: (f) => f.position.marketValue,
    asOf: (f) => f.asOf ?? null,
  });
  const ownerRowsShown = sortRows(m.owners, ownerView.sort, {
    owner: (o) => o.owner,
    rows: (o) => o.rows,
    invested: (o) => o.cost,
    value: (o) => o.mv,
  });
  const schemeRowsShown = sortRows(m.schemes, schemeView.sort, {
    fund: (r) => r.fund,
    owner: (r) => r.owner ?? null,
    committed: (r) => r.committed,
    called: (r) => r.called,
    paid: (r) => r.paid,
    uncalled: (r) => r.uncalled,
    calls: (r) => r.calls.length,
    asOf: (r) => r.asOf ?? null,
    // The check is a three-valued verdict rather than a figure; its heading
    // moves like any other and refuses the click (`sortable={false}`).
    check: () => null,
  });
  const historyShown = sortRows(m.history, historyView.sort, {
    date: (c) => c.date,
    fund: (c) => c.fund,
    owner: (c) => c.owner ?? null,
    label: (c) => c.label ?? null,
    amount: (c) => c.amount,
  });
  const unvaluedShown = sortRows(m.unvalued, unvaluedView.sort, {
    account: (u) => `${u.account.provider} ${u.account.accountNo}`,
    owner: (u) => u.account.owner,
    invested: (u) => u.drawn,
    uncalled: (u) => u.undrawn ?? null,
    // Nothing values these, so the column is an absence on every row.
    value: () => null,
    why: () => null,
  });
  const fundsShown = sortRows(
    m.funds.filter((f) => !q.trim() || f.security.toLowerCase().includes(q.trim().toLowerCase())),
    fundView.sort,
    {
      fund: (f) => f.security,
      reportedBy: (f) => f.providers.join(", "),
      folios: (f) => f.folios,
      units: (f) => f.units,
      invested: (f) => f.cost,
      value: (f) => f.mv,
      return: (f) => f.returnPct,
      weight: (f) => f.mv,
      asOf: (f) => f.asOf[f.asOf.length - 1] ?? null,
    },
  );
  /**
   * ── THE METRIC CATALOGUE ────────────────────────────────────────────────────
   *
   * Every figure this page can measure, as data rather than as markup, so the
   * picker's option list and the tiles are ONE declaration: a second list of
   * labels beside the tiles would be a second chance for a dropdown to offer a
   * metric the strip cannot draw.
   *
   * Each entry's `value`, `sub` and `hint` are the ones the fixed tiles carried,
   * moved verbatim — the coverage lines, the four "must not be subtracted"
   * warnings and the two absences with their own reasons. Nothing here is
   * derived that was not derived before.
   */
  const tileMetrics: TileMetric[] = [
    {
      id: "value", label: "Private market value", icon: <Handshake className="h-4 w-4" />,
      value: <Auditable formula={weightFormula(m.privMV, m.bookMV, m.bookMV > 0 ? (m.privMV / m.bookMV) * 100 : null, money, "the consolidated book")}>{money(m.privMV)}</Auditable>,
      sub: `${m.bookMV > 0 ? fmtPct((m.privMV / m.bookMV) * 100, { decimals: 2 }) : DASH} of the ${money(m.bookMV)} book · across ${m.scope.accounts.length} accounts · each holding counted once`,
    },
    {
      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,
      value: money(m.privCost),
      sub: `cost in · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one`,
    },
    {
      id: "pnl", label: "Unrealised P&L", icon: <TrendingUp className="h-4 w-4" />,
      value: <span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>,
      sub: m.privCost != null && m.privCost > 0
        ? `on the ${money(m.privCost)} these statements report as cost, covering ${money(m.costedMV)} of the ${money(m.privMV)} above`
        : "no statement here reports a cost to measure a gain against",
    },
    /*
        *"How are you calculating this uncalled capital of 16 crores? …
         Something seems amiss here. According to me, the number is not 16
         crores."* — the client, on this tile, a round after it first grew a
        definition.

        THE ARITHMETIC WAS RIGHT AND THE TILE WAS STILL WRONG, and both halves
        of that are worth stating because only the second is fixable:

          · the ₹15.98 Cr ties. Summed as printed over the 13 accounts that
            print an uncalled line it is ₹15,97,50,000, and committed less
            CALLED over all 15 comes to the same figure to the rupee. Two
            paths, one answer, and the per-scheme table below shows every row.
          · IT IS A FLOOR AND THE TILE NEVER SAID SO. It covers the capital
            accounts this book HAS A STATEMENT FOR, and those are a minority of
            the family's private accounts. A fund whose capital account nobody
            sent contributes nothing to this figure and can still call money
            tomorrow, so a reader who knows about such a commitment is right
            that the number is too small — and the tile gave them no way to see
            that.

        So the tile states the coverage as its own sub-line rather than burying
        it, and the card below names which accounts are outside it.
    */
    {
      id: "uncalled", label: "Still to call (uncalled capital)", icon: <Fuel className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.ct.undrawn)}</span>,
      sub: `across ${m.ct.count} of this page's ${m.scope.accounts.length} private accounts · the rest send no capital account, so this is a floor`,
      hint: "Money promised to these funds that they have not yet asked for. A bill that can arrive any day — not an asset, and in no total on this page.",
    },
    /* ── COMMITTED vs CALLED vs INVESTED — three figures, not two ────────────
        *"Capital committed, or is it capital invested? What is capital
         committed versus invested? … Because committed can be one thing. I
         would commit 10 crores, but I may have only invested so far 5 crores,
         and 5 crores is remaining to be drawn."*

        The client is describing the model exactly, and the page was printing
        two of its three figures under one word. `Drawn` was whichever of
        CALLED and PAID each fund's own layout happened to match — the same
        field meaning two things across fifteen rows. They are separate now,
        each read off the line its own statement labels, and each tile says
        which of the four quantities it is in the client's own words. */
    {
      id: "committed", label: "Committed", icon: <Landmark className="h-4 w-4" />,
      value: money(m.ct.committed), sub: `${m.ct.committedOf} of ${m.ct.count} capital accounts`,
      hint: "The full amount signed for, whether or not the fund has asked for it yet. Not money spent, and in no market value on this page.",
    },
    {
      id: "called", label: "Called by the funds", icon: <Banknote className="h-4 w-4" />,
      value: m.cc.called == null ? DASH : money(m.cc.called),
      sub: `${m.cc.calledOf} of ${m.cc.count} capital accounts print a called line`,
      hint: "What the funds have demanded so far. It covers a different set of accounts from Invested, so the two must never be subtracted.",
    },
    {
      id: "paid", label: "Invested (paid in)", icon: <Wallet className="h-4 w-4" />,
      value: m.cc.paid == null ? DASH : money(m.cc.paid),
      sub: `${m.cc.paidOf} of ${m.cc.count} capital accounts · cash that has actually left the family's bank`,
      hint: "Cash that has actually left the family’s bank. Not the same set as Capital invested above, which is the cost of every private holding.",
    },
    {
      id: "due", label: "Due now (called, unpaid)", icon: <CalendarClock className="h-4 w-4" />,
      value: m.cc.dueNow == null ? DASH : <span className={m.cc.dueNow > 0 ? "text-amber-400" : undefined}>{money(m.cc.dueNow)}</span>,
      sub: m.cc.dueNowOf === 0
        ? "no statement here prints a called-but-unpaid line"
        : `${m.cc.dueNowOf} of ${m.cc.count} accounts print this line · a measured figure, not an assumption`,
      hint: "Called by the fund and not yet paid — the one figure here that is genuinely owed rather than merely possible.",
    },
    /* THE FIGURE THIS PAGE EXISTS FOR. Real money, paid, and in NO total above
        it: adding drawn capital to a market value reports what was paid as
        what the stake is worth.

        THE LABEL WAS THE CLIENT'S THIRD QUESTION — *"Drawn against no
        valuation means?"* — and it was jargon twice over: "drawn" is the
        fund's word for having taken the money, and "against no valuation" is a
        property of the STATEMENT rather than of the money. */
    {
      id: "unvalued", label: "Paid in, but never valued", icon: <HelpCircle className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.unvaluedDrawn)}</span>,
      sub: `${m.unvaluedNoNav.length} funds that publish no NAV at all · not in the private market value above`,
      hint: "Cash paid into funds that have never published a valuation. Real money, and in no total on this page.",
    },
    /* *"what is distributions?"* — same treatment, and the label carries the
        client's own word beside the plain one rather than only the plain one:
        the sub-line under this tile has always said "distribution figure", so a
        reader who asks what a distribution is was reading a word the tile used
        and never defined. */
    {
      id: "distributed", label: "Distributions (cash returned)", icon: <Coins className="h-4 w-4" />,
      value: money(m.ct.distributed),
      sub: `${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`,
      hint: "Cash these funds have already paid back. Not part of the value above, and it does not reduce what a fund can still call.",
    },
    /* ── THE TWO THAT ARE ABSENT BY MEASUREMENT ──────────────────────────────
        They are OFFERED like every other metric, because the family asked for
        every metric they might want to see and the answer to both is a fact
        about this corpus rather than a gap in the picker. A catalogue that
        silently omitted them would take with it the two things a reader of a
        private book most needs told. */
    {
      id: "realised", label: "Realised gain", icon: <Coins className="h-4 w-4" />,
      ...absentTile(
        "no capital gain statement covers any private account in this drop",
        "Every AIF-engagement account carries that absence verbatim in the book's capital-gain record. Their redemptions are real; what they realised was never reported to this book, so it is absent rather than nil."),
    },
    /* ITS REASON WAS HALF FALSE THE MOMENT THE CALLS WERE READ, and this repo
        has recorded that failure — an absence standing on a premise nobody
        rechecked — often enough to catch it in its own change. It read "none
        publishes its calls as dated data", which was true when written and is
        now false of every one of these fifteen accounts. What is still missing
        is the OTHER half, and only that half: a distribution figure on 12 of
        the 15. */
    {
      id: "multiple", label: "Net multiple (TVPI / DPI)", icon: <Handshake className="h-4 w-4" />,
      ...absentTile(
        `only ${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure`,
        `A multiple divides what has come back plus what is still inside by what went in. The last of those three is now measurable per folio — ${m.cc.callCount} dated calls, each reconciled against its own statement — and the first is not: ${m.ct.count - m.ct.distributedOf} of these ${m.ct.count} accounts print no distribution line at all. Reading those as nil would report a fund that has returned nothing when its statement simply does not say, and a DPI built on that understates every folio it touches.`),
    },
    /* ── AND THE FIGURES THE REMOVED SUBTITLE USED TO CARRY ──────────────────
        *"Give option for every single metric the user might want to see."* The
        subtitle counted this page's funds, accounts and owners and went at the
        family's request because the tables state two of the three; as OPTIONAL
        tiles they cost nothing and a reader who wants the count can have it
        back. Each is a count of a set this page already draws, so none is a new
        measurement. */
    {
      id: "funds", label: "Funds held", icon: <Handshake className="h-4 w-4" />,
      value: fmtNum(m.funds.length),
      sub: `distinct funds · each counted once however many members hold it`,
    },
    {
      id: "folios", label: "Folio rows", icon: <Layers className="h-4 w-4" />,
      value: fmtNum(m.folios.length),
      sub: `one per statement line · ${m.folios.length - m.funds.length} more than the fund count above`,
      hint: "Every statement as printed. Two holdings here are reported under two members each, which is why this is the larger number.",
    },
    {
      id: "owners", label: "Owners", icon: <Users className="h-4 w-4" />,
      value: fmtNum(m.owners.length),
      sub: "family members and trusts holding something private",
    },
    {
      id: "accounts", label: "Capital accounts", icon: <Landmark className="h-4 w-4" />,
      value: fmtNum(m.ct.count),
      sub: `of this page's ${m.scope.accounts.length} private accounts send one`,
      hint: "A capital account is the statement that prints a commitment and what has been called against it. The rest report a holding and no commitment.",
    },
    {
      id: "calls", label: "Dated capital calls", icon: <CalendarClock className="h-4 w-4" />,
      value: fmtNum(m.cc.callCount),
      sub: `across ${m.ct.count} capital accounts · every one reconciled against its own statement's printed total`,
      hint: "Each call the funds have made, with its own date. A statement whose rows did not reproduce its own printed total publishes none of them here.",
    },
    /* THE RAW TOTAL, OFFERED WITH ITS OWN DOUBLE COUNT NAMED. The folio view's
        footer already prints it, and a reader who wants it on the strip is
        entitled to it — but a private total that is ₹3.17 Cr above the
        consolidated one must never appear without saying why, which is the
        whole reason this is a tile with a sub-line rather than a second
        unlabelled figure. */
    {
      id: "raw", label: "Private value, as printed", icon: <Layers className="h-4 w-4" />,
      value: money(m.rawMV),
      sub: `every statement as printed · ${money(m.scope.doubleCounted)} of it is two holdings reported under two members each`,
      hint: "Not the consolidated figure. Use it to tie this page to the statements one by one; the Private market value tile counts each holding once.",
    },
  ];

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

      {/* ── FOUR SLOTS, AND THE READER PICKS WHAT IS IN THEM ─────────────────
          *"There are 9 KPI tiles on the private market page, make it 4 and give
           the user a dropdown list to select what they want to see in each of
           those 4 KPI tiles. Give option for every single metric the user might
           want to see … Also add a small + button on the last 4th KPI tile so
           the user can also increase the no. of KPI tile."*

          EVERY METRIC THIS PAGE CAN MEASURE IS IN THE CATALOGUE, and none of
          them is new: each is the tile that stood here before, moved verbatim
          with its own value, coverage line and definition, plus the counts the
          removed subtitle used to carry (funds, folios, owners, capital
          accounts, dated calls) and the RAW private total the folio view's own
          footer prints. Nothing is computed for the picker — a metric that
          needed arithmetic nobody had asked for would be a figure invented to
          fill a dropdown.

          THE DEFAULT FOUR ARE THE ROW THAT WAS ALREADY FIRST, which is the
          smallest surprise available: a reader who opens this page after the
          change sees what the top of it always showed, and the eight tiles that
          were below are one dropdown away rather than gone. `check:pages`
          asserts that default, because a default is the one change that moves
          silently — the page renders perfectly on any set.

          AND THE TWO ABSENT TILES ARE IN IT TOO, with their reasons intact. A
          catalogue that offered only the metrics this book can measure would
          quietly drop the two facts a reader most needs — that no capital gain
          statement covers a private account, and that a TVPI cannot be struck
          while 12 of 15 accounts print no distribution line — and the family
          asked for every metric they might want to see, which includes the ones
          whose answer is an em dash and a reason. */}
      <SelectableTiles storageKey={PM_TILES_KEY} defaults={PM_DEFAULT_TILES} metrics={tileMetrics} />

      {/* ── THE PRIVATE BOOK — ONE CARD, THREE VIEWS, ONE TOGGLE ─────────────
          *"in the private markets Page there are three separate sectioned
           tables, making the pages very lengthy. Add a toggle button in the
           first table itself to switch the table view between the three rather
           than scrolling every time."*

          The three were a FUND table, a FOLIO table and a per-OWNER rollup
          stacked one under the other, and they are THREE RENDERINGS OF ONE SET
          — the same private holdings, grouped three ways. So this is a view
          switch in the sense the Portfolio Monitor's `?group=` axis already is,
          and deliberately NOT the shape of `DailyMovers`' toggle, which keeps
          two whole cards apart because it switches between two different
          MEASUREMENTS taken on different days.

          ── WHAT MUST NOT BE FLATTENED IS THE BASIS ──────────────────────────

          This is the one screen where the whole of this book's double count
          lives, and the three views are NOT on one basis:

            By fund    CONSOLIDATED — each `dedupeGroup` counted ONCE.
            By folio   RAW — every statement exactly as printed, so the two
                       holdings reported under two members each appear twice.
            By owner   RAW — a per-owner figure counts each member's own
                       statement, for the same reason.

          The first adds to the consolidated total and the other two to the
          printed one, and the difference is this book's ₹3.17 Cr of double
          count. Each view therefore keeps its OWN title, its own subtitle and
          its own footnote naming the basis it is on: one title over all three
          would be the caption-does-not-describe-its-figure failure this page
          has already paid for once. Collapsing them into one table with a
          grouping key would be worse — it would make putting all three on one
          basis a one-line edit, and either direction of that is wrong.

          `check:pages` walks all three addresses and asserts both ends: PM-1 on
          the folio view (printed less consolidated IS the named double count)
          and PM-6 on the owner view (the subtotals add to the printed total and
          not to the consolidated one). A build that deduped everything passes
          one and fails the other.
      */}
      <Card className="mt-5" pad={false}
        title={HOLDING_VIEWS.find((v) => v.key === view)!.cardTitle}
        subtitle={HOLDING_VIEWS.find((v) => v.key === view)!.cardSub}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* THE TOGGLE RENDERS IN EVERY VIEW, never only in the default: a
                control that disappears once a reader has used it strands them
                on the branch they switched to. `data-pm-view` + `role="tab"` +
                `aria-selected` is the contract the sweep reads — every one of
                these labels also appears in this page's own prose, so only the
                control itself can answer whether the toggle is there. */}
            <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
              role="tablist" aria-label="How to group the private book">
              {HOLDING_VIEWS.map((v) => (
                <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
                  data-pm-view={v.key} title={v.title}
                  onClick={() => setView(v.key)}
                  className={["whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                    view === v.key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
                  {v.label}
                </button>
              ))}
            </div>
            {/* The search filters FUNDS, so it is offered on the view whose rows
                it narrows and nowhere else — a box that filters nothing is the
                control-that-looks-alive failure this repo keeps naming. */}
            {view === "funds"
              ? <SearchInput value={q} onChange={setQ} placeholder="Search funds…" className="w-56"
                  suggestions={m.funds.map((f) => f.security)} />
              : view === "folios"
                ? <Pill tone="info">{m.folios.length} rows</Pill>
                : <Pill tone="info">{m.owners.length} owners</Pill>}
          </div>
        }>

        {/* ── BY FUND — CONSOLIDATED, each holding counted once ── */}
        {view === "funds" && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-pm-table="funds">
                <thead className="border-b border-ink-700">
                  <Tr view={fundView}>
                    <SortHeader col="fund" view={fundView} align="left">Fund</SortHeader>
                    <SortHeader col="reportedBy" view={fundView} align="left"
                      title="Who REPORTS the holding to this book — a depository or a wealth platform, which is not necessarily the fund's manager. No statement here states a manager for every fund, so none is asserted.">Reported by</SortHeader>
                    <SortHeader col="folios" view={fundView}>Folios</SortHeader>
                    <SortHeader col="units" view={fundView}>Units</SortHeader>
                    <SortHeader col="invested" view={fundView}>Invested</SortHeader>
                    <SortHeader col="value" view={fundView}>Value</SortHeader>
                    <SortHeader col="return" view={fundView}>Return</SortHeader>
                    <SortHeader col="weight" view={fundView}>Weight</SortHeader>
                    <SortHeader col="asOf" view={fundView} align="left">As of</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {fundsShown.map((f) => (
                    /* The fund's own key, so a claim about WHICH funds this table
                       draws is struck on structure rather than on a rendered name. */
                    <Tr view={fundView} key={f.securityKey} data-pm-fund={f.securityKey} className="hover:bg-ink-700/40">
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
                    </Tr>
                  ))}
                </tbody>
                <tfoot>
                  <TrFoot view={fundView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                    label={<>Total · {m.funds.length} funds</>}
                    cells={{
                      invested: <td key="invested" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300">{money(m.privCost)}</td>,
                      value: <td key="value" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(m.privMV)}</td>,
                      return: <td key="return" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold">
                        {m.privCost != null && m.privCost > 0 && m.privPnL != null
                          ? <span className={changeColor((m.privPnL / m.privCost) * 100)}>{fmtPct((m.privPnL / m.privCost) * 100, { sign: true, decimals: 1 })}</span>
                          : <AbsentCell reason="no cost is reported across this book's private holdings" />}
                      </td>,
                      weight: <td key="weight" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300">100%</td>,
                      asOf: <td key="asOf" className="border-t-2 border-ink-600 px-4 py-2.5" />,
                    }} />
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
          </>
        )}

        {/* ── BY FOLIO — RAW, every statement exactly as printed ── */}
        {view === "folios" && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-pm-table="folios">
                <thead className="border-b border-ink-700">
                  <Tr view={folioView}>
                    <SortHeader col="fund" view={folioView} align="left">Fund</SortHeader>
                    <SortHeader col="owner" view={folioView} align="left">Owner</SortHeader>
                    <SortHeader col="account" view={folioView} align="left">Account</SortHeader>
                    <SortHeader col="units" view={folioView}>Units</SortHeader>
                    <SortHeader col="invested" view={folioView}>Invested</SortHeader>
                    <SortHeader col="value" view={folioView}>Value</SortHeader>
                    <SortHeader col="asOf" view={folioView} align="left">As of</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {folioRowsShown.map((f, i) => (
                    <Tr view={folioView} key={`${f.accountId}-${f.position.securityKey}-${i}`} className="hover:bg-ink-700/40">
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
                    </Tr>
                  ))}
                </tbody>
                <tfoot>
                  <TrFoot view={folioView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                    label={<>Total · {m.folios.length} rows</>}
                    cells={{
                      value: <td key="value" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(m.rawMV)} as printed</td>,
                      asOf: <td key="asOf" className="border-t-2 border-ink-600 px-4 py-2.5" />,
                    }} />
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
          </>
        )}

        {/* ── BY OWNER — RAW, each member's own statements ──────────────────
            It was a small unlabelled block bolted under the folio table; as a
            view of its own it gets the header row the other two have, because
            a column of figures a reader cannot name is not a table. */}
        {view === "owners" && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-pm-table="owners">
                <thead className="border-b border-ink-700">
                  <Tr view={ownerView}>
                    <SortHeader col="owner" view={ownerView} align="left">Owner</SortHeader>
                    <SortHeader col="rows" view={ownerView}>Rows</SortHeader>
                    <SortHeader col="invested" view={ownerView}>Invested</SortHeader>
                    <SortHeader col="value" view={ownerView}>Value</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {ownerRowsShown.map((o) => (
                    <Tr view={ownerView} key={o.owner} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 text-slate-100">{o.owner}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{o.rows} {o.rows === 1 ? "row" : "rows"}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">
                        {o.cost == null
                          ? <AbsentCell reason="no statement in this member's private folios reports a cost" />
                          : money(o.cost)}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-200">{money(o.mv)}</td>
                    </Tr>
                  ))}
                </tbody>
                <tfoot>
                  <TrFoot view={ownerView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                    label={<>Total · {m.owners.length} owners</>}
                    cells={{
                      value: <td key="value" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(m.rawMV)} as printed</td>,
                    }} />
                </tfoot>
              </table>
            </div>
            <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
              A per-owner figure counts each member's own statement, so these add to {money(m.rawMV)} and not to the
              consolidated {money(m.privMV)}.
            </p>
          </>
        )}
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
                  <Tr view={schemeView}>
                    <SortHeader col="fund" view={schemeView} align="left">Fund</SortHeader>
                    <SortHeader col="owner" view={schemeView} align="left">Owner</SortHeader>
                    <SortHeader col="committed" view={schemeView}
                      title="What the family promised this fund in total.">Committed</SortHeader>
                    <SortHeader col="called" view={schemeView}
                      title="What the fund has demanded so far, off the line its own statement labels.">Called</SortHeader>
                    <SortHeader col="paid" view={schemeView}
                      title="What the family has actually paid in — capital invested.">Invested</SortHeader>
                    <SortHeader col="uncalled" view={schemeView}
                      title="Uncalled capital, exactly as the fund prints it — never worked out as committed − called.">Still to call</SortHeader>
                    <SortHeader col="calls" view={schemeView}
                      title="Dated calls this fund has made, each reconciled against the total its own statement prints.">Calls</SortHeader>
                    <SortHeader col="asOf" view={schemeView} align="left">As of</SortHeader>
                    <SortHeader col="check" view={schemeView} align="left" sortable={false}
                      title="Does the fund's printed uncalled figure equal its own committed − called? This is the working behind the total.">Check</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {m.schemes.map((r) => {
                    const valued = m.owned.has(r.accountId);
                    return (
                      <Tr view={schemeView} key={r.accountId} className="hover:bg-ink-700/40" data-scheme={r.accountId}>
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
                      </Tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <TrFoot view={schemeView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                    cells={{
                      committed: <td key="committed" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(m.cc.committed)}</td>,
                      called: (
                        <td key="called" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">
                          {m.cc.called == null ? DASH : money(m.cc.called)}
                          <span className="text-[10.5px] font-normal text-slate-500"> · {m.cc.calledOf} of {m.cc.count}</span>
                        </td>
                      ),
                      paid: (
                        <td key="paid" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">
                          {m.cc.paid == null ? DASH : money(m.cc.paid)}
                          <span className="text-[10.5px] font-normal text-slate-500"> · {m.cc.paidOf} of {m.cc.count}</span>
                        </td>
                      ),
                      uncalled: (
                        <td key="uncalled" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-amber-400">
                          {money(m.cc.uncalled)}
                          <span className="text-[10.5px] font-normal text-slate-500"> · {m.cc.uncalledOf} of {m.cc.count}</span>
                        </td>
                      ),
                      calls: <td key="calls" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-300">{m.cc.callCount}</td>,
                      asOf: <td key="asOf" className="border-t-2 border-ink-600 px-4 py-2.5" />,
                      check: <td key="check" className="border-t-2 border-ink-600 px-4 py-2.5" />,
                    }}
                    label={<>Total · {m.cc.count} accounts</>} />
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
                <Tr view={historyView}>
                  <SortHeader col="date" view={historyView} align="left">Date</SortHeader>
                  <SortHeader col="fund" view={historyView} align="left">Fund</SortHeader>
                  <SortHeader col="owner" view={historyView} align="left">Owner</SortHeader>
                  <SortHeader col="label" view={historyView} align="left">The fund&rsquo;s own wording</SortHeader>
                  <SortHeader col="amount" view={historyView}>Amount</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {historyShown.map((c, i) => (
                  <Tr view={historyView} key={`${c.accountId}-${c.date}-${i}`} className="hover:bg-ink-700/40" data-call-row={c.date}>
                    <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-2 text-slate-200">{c.fund}</td>
                    <td className="px-4 py-2 text-slate-400">{c.owner ?? DASH}</td>
                    <td className="px-4 py-2 text-slate-500">{c.label ?? DASH}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{money(c.amount)}</td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <TrFoot view={historyView} className="border-t-2 border-ink-600 px-4 py-2.5 font-semibold text-slate-200"
                  label={<>Total · {m.history.length} calls</>}
                  cells={{
                    amount: <td key="amount" className="border-t-2 border-ink-600 px-4 py-2.5 text-right mono font-semibold text-slate-100">{money(sum(m.history.map((c) => c.amount)))}</td>,
                  }} />
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
                  <Tr view={unvaluedView}>
                    <SortHeader col="account" view={unvaluedView} align="left">Account</SortHeader>
                    <SortHeader col="owner" view={unvaluedView} align="left">Owner</SortHeader>
                    <SortHeader col="invested" view={unvaluedView}
                      title="What the family has actually paid into this folio — capital invested, the same quantity the Invested tile above counts.">Invested</SortHeader>
                    <SortHeader col="uncalled" view={unvaluedView}>Still to call</SortHeader>
                    <SortHeader col="value" view={unvaluedView}>Value</SortHeader>
                    <SortHeader col="why" view={unvaluedView} align="left" sortable={false}>Why</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {unvaluedShown.map((u) => (
                    <Tr view={unvaluedView} key={u.account.accountId} className="hover:bg-ink-700/40">
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
                    </Tr>
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
    </div>
  );
}
