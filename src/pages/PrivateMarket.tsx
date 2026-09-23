import { Fragment, useMemo, useState } from "react";
import { Handshake, Landmark, Wallet, TrendingUp, Fuel, Coins, Banknote, HelpCircle, CalendarClock, Layers, Users, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { SelectableTiles, type TileMetric } from "@/components/SelectableTiles";
import { CallCell, CallEditor } from "@/components/EnteredCalls";
import { SortHeader, SortableTable, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { useViewParam } from "@/components/ViewToggle";
import { StockLink } from "@/components/StockLink";
import { Auditable } from "@/components/Auditable";
import { AbsentCell, AbsentSection, AbsentValue, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { sum, sumOrNull, consolidatedMarketValue, currentHoldings } from "@/lib/analytics";
import {
  privateScope, fundRollup, folioRows, ownerRollup, commitmentTotals, unvaluedAccounts, unvaluedDrawn,
  pageScopeNote,
} from "@/lib/privateMarket";
import { schemeCalls, callTotals, callHistory } from "@/lib/capitalCalls";
import { describeCapital } from "@/lib/capital";
import { useEnteredCalls, headlineCall, todayIso } from "@/lib/enteredCalls";
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

/**
 * The funds table's columns, in the order its rows write their cells.
 *
 * `call` IS THE FAMILY'S OWN COLUMN — the capital calls they have been told are
 * coming, entered here and saved for everyone. Last, because it is the one
 * column a reader writes to rather than reads, and a stored arrangement that
 * predates it gets it appended rather than losing it (`useTableView`).
 */
const FUND_COLS = ["fund", "reportedBy", "folios", "units", "invested", "value", "return", "weight", "asOf", "call"] as const;
/* The folios BEHIND a fund row. No `fund` column: every line in the panel is
   the fund the row names, so a column repeating it is chrome. */
const FOLIO_COLS = ["owner", "account", "units", "invested", "value", "asOf"] as const;
const OWNER_COLS = ["owner", "rows", "invested", "value"] as const;
const SCHEME_COLS = ["fund", "owner", "committed", "called", "paid", "uncalled", "calls", "asOf", "check"] as const;
const CALL_COLS = ["date", "fund", "owner", "label", "amount"] as const;
const UNVALUED_COLS = ["account", "owner", "invested", "uncalled", "value", "why"] as const;
const PM_DEFAULT_TILES = ["value", "cost", "pnl", "uncalled"] as const;

/**
 * THE CAPITAL-CALL COLUMN'S OWN HOVER, and the one place the reason it exists
 * is stated: no fund publishes a forward schedule, so the calls a fund has
 * announced — in a notice, an email, a phone call — are typed in here. It is
 * also where the one rule a reader of this column must not get wrong lives:
 * these are the family's figures, never added into a statement total.
 */
const CALL_COLUMN_TITLE = "Upcoming capital calls, entered by the family and saved for everyone who opens this dashboard. "
  + "No fund in this book publishes a forward drawdown schedule, so a call a fund has announced is entered here. "
  + "An entered call is never added into Called, Paid in or Still to call — those are what the funds' own statements print.";

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
// What it carries instead is what the statements report: the private funds, the
// capital accounts behind them, the ₹18.23 Cr of capital the family has PAID
// into funds that publish no valuation at all, and the AIF income split by tax
// head. The Monitor's AIF section shows the folios that have a mark; nothing
// anywhere else in this app shows the money that has none.
//
// ── THE AXIS IS THE HOLDING'S OWN MARKET SIDE ───────────────────────────────
//
// `isPrivateClass` — which is `marketSide === "private"`, read from the SEBI
// category the statements print — and never `Account.engagement`. See the note
// at the top of `src/lib/privateMarket.ts`: on this book keying on engagement
// would drop three real private holdings and pull in two cash sleeves.
//
// ── AND THE CATEGORY III FOLIOS ARE NOT ON IT ───────────────────────────────
//
//   "Sanshi, Buoyant and Carnelian. These are not private market investments."
//
// They were, because the axis was the asset class and every AIF was private.
// A Category III AIF is a fund trading LISTED securities, so it is listed
// exposure held through a fund — which is what the family's own consolidated
// review calls all three, independently: `Equity`. They are on the listed side
// now, still AIFs, still in the Monitor's AIF section, and NAMED on this page
// in "Funds this page does not carry" so nobody has to discover their absence.
//
// ── THE CAPITAL-ACCOUNTS CARDS ARE DELIBERATELY NOT SCOPED THIS WAY ─────────
//
// They read `portfolio.commitments` whole. A drawdown structure — you commit,
// the fund calls — is a fact about how an account FUNDS ITSELF, not about where
// it invests, and one Category III fund here (Carnelian Bharat Amritkaal) has a
// real capital account with ₹15 Cr called against it. Scoping those cards to
// the private side would drop a capital account that exists, which is the
// opposite of what this page is for. The cards say what they cover.
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
 * THE TWO VIEWS OF THE PRIVATE BOOK, and each carries its OWN card title and
 * subtitle rather than sharing one.
 *
 * ── "BY FOLIO" WAS A THIRD, AND IT IS A ROW EXPANSION NOW ──────────────────
 *
 *   *"why are there two different toggle switch for fund and folio… keep
 *    default view as fund only, and make the row clickable so that it would
 *    reveal a drop down list of folios. And remove folio as the toggle button."*
 *
 * They were right that the pair was redundant AS A TOGGLE: a folio is not
 * another way of slicing the private book, it is what a fund row is MADE OF.
 * Every folio belongs to exactly one fund, so the two tables were a whole list
 * and the same list re-sorted — where By owner really is a different grouping.
 * So the folios sit under the fund they belong to and a reader reaches them
 * where they were looking, rather than by leaving the table and coming back.
 *
 * ── WHAT MUST NOT BE FLATTENED IS STILL THE BASIS ──────────────────────────
 *
 * This is the one screen where the whole of this book's double count lives, and
 * the expansion changes nothing about it:
 *
 *   By fund   CONSOLIDATED — each `dedupeGroup` counted ONCE.
 *   …expanded RAW — every statement exactly as printed, so the two holdings
 *             reported under two members each list both lines, and the panel
 *             NAMES the overlap in rupees on exactly the rows that carry one.
 *   By owner  RAW — a per-owner figure counts each member's own statement.
 *
 * PM-1 MOVED WITH THE TABLE IT READS, to the expansion, and it is a BETTER home
 * than the view it came from: the consolidated figure, the statements behind it
 * and the gap between them are now one click apart instead of one tab apart. A
 * check that stops running because its table moved behind a control is a check
 * that silently stopped, which this file has recorded four times.
 */
const HOLDING_VIEWS = [
  {
    key: "funds", label: "By fund",
    title: "One row per fund, each holding counted once however many members report it. Open a row for the folios behind it.",
    cardTitle: "Funds this family holds",
    cardSub: "One row per fund, each holding counted once however many family members' statements report it. Open a row for the folios behind it. Marks are each fund's own, on its own date.",
  },
  {
    key: "owners", label: "By owner",
    title: "Each member's own statements, so these add to the printed total and not the consolidated one.",
    cardTitle: "By owner, as each member's own statements print it",
    cardSub: "Each member's private folios summed on their own statements. A per-owner figure does not dedupe, so these add to the printed total rather than to the consolidated one above.",
  },
] as const;

export function PrivateMarket() {
  const { statementPortfolio: portfolio, fmtFromBase, statementCapital } = usePortfolio();
  const [q, setQ] = useState("");
  /**
   * WHICH FUND ROWS ARE OPEN. Component state rather than the URL: it is a
   * reader's place in a table, not a view of the book, and every figure a panel
   * draws is already addressable — the fund's own `/stock/<securityKey>` page.
   * The sweep reaches it with a click, the way it reaches the Monitor's own
   * contribution and venue panels.
   */
  const [openFolios, setOpenFolios] = useState<Set<string>>(() => new Set());
  const toggleFolios = (key: string) => setOpenFolios((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  /**
   * WHICH GROUPING THE ONE HOLDINGS CARD DRAWS. In the URL like every other
   * view in this app, so a basis is a link a reader can send and the sweep can
   * hold each of the two to the light rather than guessing at a click.
   * `useViewParam` keeps the default param-free, so `/private-market` and
   * `/private-market?view=funds` do not become two addresses for one screen.
   */
  const [view, setView] = useViewParam(HOLDING_VIEWS, {}, "view");
  /**
   * THE CALLS THE FAMILY HAS ENTERED, and which fund's editor is open. Called
   * up here with the page's other hooks, before any early return — a hook
   * below one runs on some renders and not others.
   */
  const entered = useEnteredCalls();
  const [openCall, setOpenCall] = useState<string | null>(null);
  const today = todayIso();

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

    // ON THE STATEMENT BASIS, like everything on this page — `statementCapital`
    // is the capital model over the book the live feed never touches.
    const funds = fundRollup(scope.dedupedRows, accIdx, scope.rows, statementCapital);
    const folios = folioRows(scope.rows, accIdx, statementCapital);
    /**
     * THE FOLIOS BEHIND EACH FUND, keyed on the row's own `securityKey`.
     *
     * ONE definition, read both by the row that offers the expansion and by the
     * panel that draws it — so the count on the chevron and the lines under it
     * cannot describe different sets, which is what a second grouping here would
     * eventually let them do.
     *
     * Struck over `folioRows(scope.rows)`, the RAW set: this panel is "every
     * statement as printed", which is the whole reason it can differ from the
     * row above it.
     */
    const foliosOf = new Map<string, typeof folios>();
    for (const f of folios) {
      const g = foliosOf.get(f.position.securityKey) ?? [];
      g.push(f);
      foliosOf.set(f.position.securityKey, g);
    }
    const owners = ownerRollup(scope.rows, accIdx, statementCapital);
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
      accIdx, scope, funds, folios, foliosOf, owners, ct, unvalued, commitments,
      schemes, cc, history,
      privMV, privCost, privPnL, costedMV, costedCount: costedRows.length, bookMV, rawMV,
      unvaluedDrawn: unvaluedDrawn(unvalued),
      unvaluedNoNav: unvalued.filter((u) => u.kind === "no-nav"),
      dates,
      /**
       * WHAT THIS PAGE DOES NOT CARRY, on the SIDE axis rather than the class
       * one. Grouped by `assetClass` this read "Not on this page: AIF ₹314 Cr"
       * over a page whose every row is an AIF — a contradiction a reader finds
       * in one glance, because the class is no longer what decides.
       */
      scopeNote: pageScopeNote(currentHoldings(portfolio.positions)),
      /**
       * CAPITAL ACCOUNTS OUTSIDE THE PRIVATE SCOPE — measured, never assumed.
       * A drawdown structure is how an account funds itself and not where it
       * invests, so these cards cover every capital account the statements
       * publish while the tables above cover the private side. The two sets
       * overlap and neither contains the other; this is the size of the gap.
       */
      capOutside: commitments.filter(
        (c) => c.accountId && !scope.accounts.some((a) => a.accountId === c.accountId),
      ).length,
      owned: new Set(portfolio.positions.map((p) => p.accountId)),
    };
  }, [portfolio, statementCapital]);

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
  const ownerView = useTableView("pm-owners", OWNER_COLS);
  const schemeView = useTableView("pm-schemes", SCHEME_COLS);
  const historyView = useTableView("pm-call-history", CALL_COLS);
  const unvaluedView = useTableView("pm-unvalued", UNVALUED_COLS);
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
      // The date of the call the cell shows. A fund with none sorts last in
      // both directions, like every absent value in this app.
      call: (f) => (entered.state.status === "ready" ? headlineCall(entered.state.calls, f.securityKey, today)?.call.date ?? null : null),
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
   * ── A TILE IS A LABEL, A FIGURE AND ONE SHORT LINE ─────────────────────────
   *
   *   *"these are action cards. They need to have the major figure and a very
   *    short description, not such long lines. No one will read this on the
   *    dashboard; it needs to be absolutely simple and clear so people can
   *    understand. It should be concise and crisp."*
   *
   * Each tile carried a coverage line and a two-sentence definition, and the
   * labels were long enough to be cut off ("PRIVATE MARKET VAL…", "STILL TO
   * CALL (UNCALLED CAPIT…"). So every label is now short enough to fit, every
   * `sub` is ONE line of a few words saying what the figure IS, and the
   * coverage counts and the working that were paragraphs are `detail` — the
   * tile's own hover. Nothing was deleted to get there: every count and every
   * warning that stood on a tile is in its `detail`, word for word where the
   * sweep reads it, and the working behind the capital-account figures is also
   * printed in full under the scheme table, beside the rows it sums.
   *
   * THE ONE THING A SHORT LINE MUST STILL DO is say what the figure is, so a
   * reader who never hovers is not left guessing: "Promised, not yet called",
   * "Cash sent to funds", "Cash paid back so far". An absent tile's line is its
   * REASON, in a few words, because an em dash must always name its cause.
   *
   * WHAT A HOVER COSTS, stated rather than glossed: it is not read by someone
   * scanning. The two claims on this strip that a reader could be misled by
   * without it — that uncalled capital is a liability in no total, and that
   * Called and Paid in must not be subtracted — are ALSO printed under the
   * scheme table, which is where a reader doing that arithmetic already is.
   */
  const retPct = m.privCost != null && m.privCost > 0 && m.privPnL != null ? (m.privPnL / m.privCost) * 100 : null;
  /**
   * THE FUNDS STRUCK ON THE CAPITAL PUT IN, counted so the two tiles below say
   * which basis their figure is on. A fund whose rows carry whole accounts with
   * published capital reads its Invested off that capital — the money the family
   * put in — and every other fund off the cost its statement reports.
   */
  const capFunds = m.funds.filter((f) => f.capital).length;
  const basisSentence = capFunds === 0
    ? "The cost these statements report"
    : `On ${capFunds} of ${m.funds.length} fund${m.funds.length === 1 ? "" : "s"}, the capital the family put in, as its own statements publish it; on the rest, the cost these statements report`;
  const share = (a: number, b: number, decimals: number) => (b > 0 ? fmtPct((a / b) * 100, { decimals }) : DASH);
  const absentLine = (why: string) => <span className="text-slate-500">{why}</span>;
  const tileMetrics: TileMetric[] = [
    {
      id: "value", label: "Market value", icon: <Handshake className="h-4 w-4" />,
      value: money(m.privMV),
      sub: `${share(m.privMV, m.bookMV, 1)} of the ${money(m.bookMV)} book`,
      detail: `${money(m.privMV)} ÷ ${money(m.bookMV)} = ${share(m.privMV, m.bookMV, 2)} of the consolidated book. `
        + `Across this page's ${m.scope.accounts.length} private accounts · each holding counted once.`,
    },
    {
      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,
      value: money(m.privCost),
      sub: capFunds ? "What was put into these holdings" : "Cost of these holdings",
      detail: `${basisSentence} · ${m.costedCount} of ${m.scope.dedupedRows.length} folio rows report one.`,
    },
    {
      // "P&L", NOT "UNREALISED P&L": on a fund struck on its capital the gain is
      // value less the money put in, which carries whatever the fund has paid
      // back or a switch has realised — see `src/lib/capital.ts`.
      id: "pnl", label: "P&L", icon: <TrendingUp className="h-4 w-4" />,
      value: <span className={changeColor(m.privPnL)}>{money(m.privPnL, true)}</span>,
      sub: retPct == null ? absentLine("No cost to measure against") : `${fmtPct(retPct, { sign: true, decimals: 1 })} on what was invested`,
      detail: m.privCost != null && m.privCost > 0
        ? `On the ${money(m.privCost)} invested — ${basisSentence.charAt(0).toLowerCase() + basisSentence.slice(1)} — covering ${money(m.costedMV)} of the ${money(m.privMV)} market value.`
        : "No statement here reports a cost to measure a gain against.",
    },
    /* *"How are you calculating this uncalled capital of 16 crores? …
        Something seems amiss here."* — the arithmetic ties two ways (see the
        working line under the scheme table) and the figure is a FLOOR: it
        covers only the capital accounts this book has a statement for. Both
        halves ride in the hover now, and the floor is also stated under the
        scheme table, which is where a reader checking the figure already is. */
    {
      id: "uncalled", label: "Still to call", icon: <Fuel className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.ct.undrawn)}</span>,
      sub: "Promised, not yet called",
      /**
       * TWO COUNTS FROM TWO SETS, AND THE WORDING MUST NOT MAKE ONE A FRACTION
       * OF THE OTHER: three of the capital accounts belong to funds this page
       * does not carry, so "15 of this page's 18" would be a fraction that does
       * not exist. Stage 10bp's fix, kept verbatim in the hover.
       */
      detail: "Money promised to these funds that they have not yet asked for — a bill that can arrive any day, "
        + "not an asset, and in no total on this page. "
        + `Across ${m.ct.count} capital accounts`
        + (m.capOutside > 0 ? `, ${m.capOutside} of them in funds this page does not carry` : "")
        + ". A fund whose capital account nobody sent contributes nothing, so this is a floor.",
    },
    /* ── COMMITTED vs CALLED vs PAID IN — three figures, not two ─────────────
        *"Capital committed, or is it capital invested? … I would commit 10
         crores, but I may have only invested so far 5 crores."* Each is read
        off the line its own statement labels, and each short line says which
        of the three it is in the client's own words. */
    {
      id: "committed", label: "Committed", icon: <Landmark className="h-4 w-4" />,
      value: money(m.ct.committed),
      sub: "Total promised to funds",
      detail: `${m.ct.committedOf} of ${m.ct.count} capital accounts. The full amount signed for, whether or not the fund has asked for it yet — not money spent, and in no market value on this page.`,
    },
    {
      id: "called", label: "Called", icon: <Banknote className="h-4 w-4" />,
      value: m.cc.called == null ? <AbsentValue /> : money(m.cc.called),
      sub: m.cc.called == null ? absentLine("No statement prints it") : "Asked for so far",
      detail: `${m.cc.calledOf} of ${m.cc.count} capital accounts print a called line. It covers a different set of accounts from Paid in, so the two must never be subtracted.`,
    },
    {
      id: "paid", label: "Paid in", icon: <Wallet className="h-4 w-4" />,
      value: m.cc.paid == null ? <AbsentValue /> : money(m.cc.paid),
      sub: m.cc.paid == null ? absentLine("No statement prints it") : "Cash sent to funds",
      detail: `${m.cc.paidOf} of ${m.cc.count} capital accounts · cash that has actually left the family's bank. Not the same set as Capital invested, which is what is invested in the holdings in the table below.`,
    },
    {
      id: "due", label: "Due now", icon: <CalendarClock className="h-4 w-4" />,
      value: m.cc.dueNow == null ? <AbsentValue /> : <span className={m.cc.dueNow > 0 ? "text-amber-400" : undefined}>{money(m.cc.dueNow)}</span>,
      sub: m.cc.dueNowOf === 0 ? absentLine("No statement prints it") : "Called, not yet paid",
      detail: m.cc.dueNowOf === 0
        ? "No statement here prints a called-but-unpaid line."
        : `${m.cc.dueNowOf} of ${m.cc.count} accounts print this line · a measured figure, not an assumption. The rest are skipped, never counted as nil.`,
    },
    /* Real money, paid, and in NO total on this page: adding drawn capital to
        a market value reports what was paid as what the stake is worth. */
    {
      id: "unvalued", label: "Never valued", icon: <HelpCircle className="h-4 w-4" />,
      value: <span className="text-amber-400">{money(m.unvaluedDrawn)}</span>,
      sub: "Paid into funds with no NAV",
      detail: `${m.unvaluedNoNav.length} funds that publish no NAV at all. Real money, not in Market value, and in no total on this page.`,
    },
    /* *"what is distributions?"* — the label is the client's own word and the
        short line under it is the answer. */
    {
      id: "distributed", label: "Distributions", icon: <Coins className="h-4 w-4" />,
      value: money(m.ct.distributed),
      sub: "Cash paid back so far",
      detail: `${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure. Not part of the value above, and it does not reduce what a fund can still call.`,
    },
    /* ── THE TWO THAT ARE ABSENT BY MEASUREMENT ──────────────────────────────
        Offered like every other metric: the answer to both is a fact about this
        corpus rather than a gap in the picker. The short line is the REASON,
        and the full reason and what would fill it is the hover. */
    {
      id: "realised", label: "Realised gain", icon: <Coins className="h-4 w-4" />,
      value: <AbsentValue />,
      sub: absentLine("No statement reports it"),
      detail: "No capital gain statement covers any private account in this drop. Every AIF-engagement account carries that absence verbatim in the book's capital-gain record. Their redemptions are real; what they realised was never reported to this book, so it is absent rather than nil.",
    },
    {
      id: "multiple", label: "TVPI / DPI", icon: <Handshake className="h-4 w-4" />,
      value: <AbsentValue />,
      sub: absentLine("Too few distribution figures"),
      detail: `Only ${m.ct.distributedOf} of ${m.ct.count} capital accounts publish a distribution figure. A multiple divides what has come back plus what is still inside by what went in; ${m.ct.count - m.ct.distributedOf} of these ${m.ct.count} accounts print no distribution line at all, and reading those as nil would report a fund that has returned nothing when its statement simply does not say.`,
    },
    /* Counts of sets this page already draws, so none is a new measurement. */
    {
      id: "funds", label: "Funds", icon: <Handshake className="h-4 w-4" />,
      value: fmtNum(m.funds.length),
      sub: "Distinct funds held",
      detail: "Each fund counted once however many members hold it.",
    },
    {
      id: "folios", label: "Folios", icon: <Layers className="h-4 w-4" />,
      value: fmtNum(m.folios.length),
      sub: "Statement lines",
      detail: `One per statement line — ${m.folios.length - m.funds.length} more than the fund count, because a fund held in several folios is one fund row.`,
    },
    {
      id: "owners", label: "Owners", icon: <Users className="h-4 w-4" />,
      value: fmtNum(m.owners.length),
      sub: "Members and trusts",
      detail: "Family members and trusts holding something private.",
    },
    {
      id: "accounts", label: "Capital accounts", icon: <Landmark className="h-4 w-4" />,
      value: fmtNum(m.ct.count),
      sub: "Drawdown statements",
      /**
       * THE SAME CROSSED FRACTION THE UNCALLED TILE WAS FIXED FOR: three of
       * these capital accounts belong to funds this page does not carry, so the
       * two counts PARTITION the tile's own figure — the only form in which both
       * can be printed together.
       */
      detail: `${m.ct.count - m.capOutside} of this page's ${m.scope.accounts.length} private accounts send one`
        + (m.capOutside > 0 ? ` · ${m.capOutside} more come from funds this page does not carry` : "")
        + ". A capital account is the statement that prints a commitment and what has been called against it.",
    },
    {
      id: "calls", label: "Capital calls", icon: <CalendarClock className="h-4 w-4" />,
      value: fmtNum(m.cc.callCount),
      sub: "Dated calls so far",
      detail: `Across ${m.ct.count} capital accounts, every one reconciled against its own statement's printed total.`,
    },
    /* THE RAW TOTAL, and it never appears without its own double count named. */
    {
      id: "raw", label: "Value as printed", icon: <Layers className="h-4 w-4" />,
      value: money(m.rawMV),
      sub: `Includes ${money(m.scope.doubleCounted)} double count`,
      detail: `Every statement as printed. ${money(m.scope.doubleCounted)} of it is two holdings reported under two members each; Market value counts each once.`,
    },
  ];

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

      {/* ── THE PRIVATE BOOK — ONE CARD, TWO VIEWS, AND THE THIRD IS A ROW ───
          *"in the private markets Page there are three separate sectioned
           tables, making the pages very lengthy. Add a toggle button in the
           first table itself to switch the table view between the three rather
           than scrolling every time."* and, a round later, *"why are there two
           different toggle switch for fund and folio… keep default view as fund
           only, and make the row clickable so that it would reveal a drop down
           list of folios. And remove folio as the toggle button."*

          The three were a FUND table, a FOLIO table and a per-OWNER rollup
          stacked one under the other. The first round made them one card with a
          toggle; the second took the folio half OFF the toggle, and the family
          were right about why — a folio is not another way of slicing the
          private book, it is what a fund row is MADE OF. Every folio belongs to
          exactly one fund, so those two were a whole list and the same list
          re-sorted, where By owner really is a different grouping.

          ── WHAT MUST NOT BE FLATTENED IS THE BASIS, AND NOTHING ABOUT IT MOVED

          This is the one screen where the whole of this book's double count
          lives:

            By fund    CONSOLIDATED — each `dedupeGroup` counted ONCE.
            …expanded  RAW — every statement exactly as printed, so the two
                       holdings reported under two members each list both lines,
                       and the panel NAMES the overlap in rupees on exactly the
                       rows that carry one.
            By owner   RAW — a per-owner figure counts each member's own
                       statement, for the same reason.

          The first adds to the consolidated total and the other two to the
          printed one, and the difference is this book's ₹3.17 Cr of double
          count. Each view keeps its OWN title, its own subtitle and its own
          footnote naming the basis it is on: one title over both would be the
          caption-does-not-describe-its-figure failure this page has already paid
          for once. Collapsing them into one table with a grouping key would be
          worse — it would make putting them on one basis a one-line edit, and
          either direction of that is wrong.

          `check:pages` asserts both ends: PM-1 on the EXPANSION (the lines add
          to more than the row, by the overlap the panel names) and PM-6 on the
          owner view (the subtotals add to the printed total and not to the
          consolidated one). A build that deduped everything passes one and
          fails the other.
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
                    {/* THE COLUMN THAT REPLACED THE CAPITAL-CALL TIMELINE. Its
                        hover is where the reason it exists now lives — no fund
                        publishes a forward schedule — and while the store cannot
                        be read the header says so once, rather than every row
                        repeating it. */}
                    <SortHeader col="call" view={fundView} align="left"
                      title={CALL_COLUMN_TITLE}
                      note={entered.state.status === "unavailable" ? "not available" : undefined}
                      noteTitle={entered.state.status === "unavailable" ? entered.state.reason : undefined}>Capital call</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {fundsShown.map((f) => {
                    const behind = m.foliosOf.get(f.securityKey) ?? [];
                    const printed = sum(behind.map((x) => x.position.marketValue));
                    /* THE OVERLAP, IN RUPEES, ON THE ROW THAT CARRIES ONE. The
                       lines add to MORE than the row above them wherever two
                       members' statements report one holding — ₹3.17 Cr across
                       two funds on this book — and a reader who adds the panel
                       and gets a third answer has found a contradiction no
                       caption rescues. Struck as printed − consolidated, and
                       guarded above a rupee so float noise is never a claim. */
                    const gap = printed - f.mv;
                    const isOpen = openFolios.has(f.securityKey);
                    return (
                    <Fragment key={f.securityKey}>
                    {/* The fund's own key, so a claim about WHICH funds this table
                        draws is struck on structure rather than on a rendered name. */}
                    {/* THE PRINTED FOLIO COUNT, ON THE ROW. `data-pm-folio-rows`
                        on the chevron below is `behind.length` — the same
                        expression the panel maps — so it agrees with the panel
                        BY CONSTRUCTION and says nothing about the Folios CELL.
                        Reintroducing the deduped count is what found that: the
                        cell went back to reading 1 over a panel of 2 and the
                        sweep stayed green, because nothing read the cell. This
                        is what the column prints, and it is reconciled against
                        the book AND against the panel it opens. */}
                    <Tr view={fundView} data-pm-fund={f.securityKey} data-pm-folios={f.folios} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 font-medium text-slate-100">
                        {/* THE ROW OPENS INTO ITS FOLIOS — the family's own ask.
                            EVERY fund row offers it, including the nine held in
                            one folio: the panel carries the OWNER and the account
                            number, which this row does not, so it opens onto
                            something a reader could not otherwise see. The
                            chevron carries the count and the overlap so the walk
                            can pick the row with most to lose rather than the
                            first one it finds. */}
                        <button type="button" onClick={() => toggleFolios(f.securityKey)} aria-expanded={isOpen}
                          data-pm-folio-toggle={f.securityKey}
                          data-pm-folio-rows={behind.length}
                          data-pm-folio-gap={Math.round(Math.max(gap, 0))}
                          title={`${behind.length} ${behind.length === 1 ? "folio reports" : "folios report"} this fund — open for the owner, the account and each statement's own figures.`}
                          className="mr-1.5 inline-flex align-middle text-slate-500 transition-colors hover:text-champagne-400 ring-focus">
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </button>
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
                      <td className="px-4 py-2 whitespace-nowrap" data-pm-call-cell={f.securityKey}>
                        <CallCell fund={f.securityKey} fundName={f.security} state={entered.state} today={today}
                          open={openCall === f.securityKey} money={money}
                          onToggle={() => setOpenCall((cur) => (cur === f.securityKey ? null : f.securityKey))} />
                      </td>
                    </Tr>
                    {/* ── THE FOLIOS BEHIND THE ROW, EXACTLY AS PRINTED ──────
                        RAW, never deduped: each line is one statement, which is
                        the whole reason the panel can add to more than the row
                        it opened from. `SortableTable` is the seam for a table
                        drawn inside a row — `useTableView` is a hook and cannot
                        be called where this JSX sits. */}
                    {isOpen && (
                      <tr className="bg-ink-900/60" data-pm-folio-panel={f.securityKey}>
                        <td colSpan={fundView.order.length} className="px-3 pb-3 pt-1">
                          <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                            {behind.length === 1
                              ? <>The one folio that reports this fund, exactly as its statement prints it.</>
                              : <>The {behind.length} folios that report this fund, each exactly as its own statement prints it.</>}
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-800">
                            <SortableTable className="min-w-full text-[12px]" storageKey="pm-folios" columns={FOLIO_COLS}>
                              {(fv) => (<>
                                <thead>
                                  <Tr view={fv} className="border-b border-ink-700/70">
                                    <SortHeader col="owner" view={fv} align="left" pad="px-3 py-1.5">Owner</SortHeader>
                                    <SortHeader col="account" view={fv} align="left" pad="px-3 py-1.5">Account</SortHeader>
                                    <SortHeader col="units" view={fv} pad="px-3 py-1.5">Units</SortHeader>
                                    <SortHeader col="invested" view={fv} pad="px-3 py-1.5">Invested</SortHeader>
                                    <SortHeader col="value" view={fv} pad="px-3 py-1.5">Value</SortHeader>
                                    <SortHeader col="asOf" view={fv} align="left" pad="px-3 py-1.5">As of</SortHeader>
                                  </Tr>
                                </thead>
                                <tbody className="divide-y divide-ink-700/50">
                                  {sortRows(behind, fv.sort, {
                                    owner: (x) => x.owner,
                                    account: (x) => `${x.provider} ${x.accountNo}`,
                                    units: (x) => x.position.quantity,
                                    invested: (x) => x.invested,
                                    value: (x) => x.position.marketValue,
                                    asOf: (x) => x.asOf ?? null,
                                  }).map((x, i) => (
                                    <Tr view={fv} key={`${x.accountId}-${i}`} data-pm-folio-row={f.securityKey} className="hover:bg-ink-700/30">
                                      <td className="px-3 py-1.5 text-slate-200">
                                        {x.owner}
                                        {/* THE PILL MOVED WITH THE ROW IT IS ABOUT. It named
                                            the other member on the Fund cell, which in a
                                            panel of one fund is the OWNER cell's business. */}
                                        {x.alsoCount > 1 && (
                                          <span className="ml-2 align-middle">
                                            <Pill tone="warn">also reported under {x.alsoReportedUnder.map(ownerDisplayName).join(", ") || "another account"}</Pill>
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{x.provider} {x.accountNo}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400">{fmtNum(x.position.quantity, 3)}</td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-400"
                                        data-pm-folio-basis={x.capital ? "capital" : "cost"}
                                        title={x.capital ? describeCapital(x.capital, (n) => money(n), x.position.costBasis) : undefined}>
                                        {x.invested == null
                                          ? <AbsentCell reason="this statement reports a value and no cost" />
                                          : money(x.invested)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right mono text-slate-200">{money(x.position.marketValue)}</td>
                                      <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">
                                        {x.asOf ? fmtDate(x.asOf) : <AbsentCell reason="this account states no report date" />}
                                      </td>
                                    </Tr>
                                  ))}
                                </tbody>
                              </>)}
                            </SortableTable>
                          </div>
                          {/* PM-1, ON THE ROW THAT CARRIES IT. The lines add to more
                              than the row above wherever one holding is reported
                              twice, and this is the only place on the page that
                              difference is now visible. Rendered ONLY where the two
                              really differ — on every other fund it would describe a
                              gap that row does not have. */}
                          {gap > 1 && (
                            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-400/80" data-pm-folio-gap-note={f.securityKey}>
                              These lines add to {money(printed)} because this holding is reported under {behind.length} accounts;
                              the row above counts it once at {money(f.mv)} (a {money(gap)} overlap). Both statements are shown
                              because both were issued, and the two marks need not be identical — each member&rsquo;s fund reports
                              on its own date.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                    {/* ── THE CAPITAL-CALL EDITOR, UNDER ITS FUND ────────────── */}
                    {openCall === f.securityKey && (
                      <tr className="bg-ink-900/60" data-pm-call-editor={f.securityKey}>
                        <td colSpan={fundView.order.length} className="px-3 pb-3 pt-1">
                          <CallEditor fund={f.securityKey} fundName={f.security} state={entered.state} money={money}
                            onSave={entered.save} onDelete={entered.remove} onClose={() => setOpenCall(null)} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
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
                The return is struck on the {money(m.privCost)} invested, covering {money(m.costedMV)}
                {" "}of the {money(m.privMV)} above. The other {m.scope.dedupedRows.length - m.costedCount} folio
                {m.scope.dedupedRows.length - m.costedCount === 1 ? " row reports" : " rows report"} a value and no cost.
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
                      <td className="px-4 py-2.5 text-right mono text-slate-400"
                        title={o.capital ? describeCapital(o.capital, (n) => money(n)) : undefined}>
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
        {/* ── WHICH SIDE OF THE BOOK THIS PAGE IS — ON EVERY VIEW ──────────
            One line per side the book has, so the figures rebuild the
            consolidated total: a reader who knows they hold Sanshi can see from
            it that the listed side is where the rest of their funds are. The card
            that named those funds one by one is gone at the family's request —
            see the note where it stood.

            AND IT SITS OUTSIDE THE THREE VIEWS. It is a claim about the PAGE,
            not about one of its tables, and drawn inside the `funds` branch it
            was absent the moment a reader switched to `folios` or `owners` —
            which is the state `check:pages` walks and the defect it caught. */}
        {m.scopeNote.sides.length > 1 && (
          <p className="border-t border-dashed border-ink-700 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
            This page is the private side of the book:{" "}
            {m.scopeNote.sides.map((x) => `${x.label} ${money(x.value)}`).join(" · ")}
            {" "}· Total {money(m.scopeNote.bookMV)}.
          </p>
        )}
      </Card>

      {/* ── TWO CARDS THAT STOOD HERE ARE GONE, AT THE FAMILY'S REQUEST ─────────
          *"Remove this, please. This is not relevant. These kind of placeholders
           are not relevant."* and, on the next one, *"remove this, it simply
           needs to be a editable coloumn in this table itself … We are trying to
           see all views on master table itself instead of having such clutter."*

          ── "FUNDS THIS PAGE DOES NOT CARRY" ────────────────────────────────
          It named the Category III funds and the three no statement places, with
          their value and where they are shown. Nothing it said was a figure only
          it carried: the SIDES of the book are the line under the table above,
          the Category III funds are in the Portfolio Monitor's AIF section and
          under their own Category III heading in the AIF drill-down Morning CIO
          opens, and the unplaced ones are that drill-down's "Not placed" facet.
          What went is a card about funds that are not on this page.

          ── THE CAPITAL-CALL TIMELINE ───────────────────────────────────────
          Five boxes, three of them permanently empty: no fund in this archive
          publishes a forward drawdown schedule, so "next 1 / 3 / 6 months" could
          only ever read "nothing scheduled". Its two real figures survive where
          the family reads them — due now is a tile a reader can pick, and the
          undated ₹ still to call is the default tile and the scheme table's own
          footer. What replaces the empty windows is the thing that could fill
          them: the family's own upcoming calls, entered in the fund table's
          Capital call column and saved for everyone. */}


      {/* ── Card C2 — scheme by scheme, with the uncalled figure's own working ─
          *"so labels are there, but they just need more granularity and
           timeline and dates and also the schemes."* — the four columns a
          reader has to be able to add up themselves, plus the CHECK column that
          answers "how are you calculating this": committed − called against the
          uncalled figure the fund itself prints. */}
      <Card className="mt-5" pad={false} title="Scheme by scheme: committed, called, invested and still to call"
        subtitle="EVERY fund in this book that calls capital against a commitment, whether it invests in listed markets or in private capital — a drawdown structure is how an account funds itself, not where it invests, so these cards are not scoped to the private side above. Each figure is read off the line that fund's statement labels, and the check column sets the printed uncalled figure against committed − called."
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
              {m.cc.count - m.capOutside} of this page&rsquo;s {m.scope.accounts.length} private accounts send a
              capital-account statement; the other {m.scope.accounts.length - (m.cc.count - m.capOutside)} report a holding,
              an income split or nothing at all, and a commitment behind one of those is invisible here.
              {m.capOutside > 0 && (
                <> The table above also carries {m.capOutside} capital account{m.capOutside === 1 ? "" : "s"} from
                funds this page does not carry, which is why its row count is higher than that first figure.</>
              )} The family&rsquo;s own investment register names further
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
