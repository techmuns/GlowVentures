import { useMemo } from "react";
import { Crosshair, Gauge, Percent, Layers } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, consolidatedMarketValue, sumOrNull, currentHoldings, droppedHoldings, NEGLIGIBLE_VALUE_FLOOR, dedupedPositions } from "@/lib/analytics";
import { fmtPct, fmtDate } from "@/lib/format";
import { valuationBasis, navBasisLabel, navBasisTitle } from "@/lib/valuationBasis";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The XIRR table's columns, in the order its rows write their cells. */
const XIRR_COLS = ["account", "flows", "mv", "terminal", "return"] as const;
import { totalReturnFromXirr } from "@/lib/bucketXirr";
import { Auditable } from "@/components/Auditable";
import { BasisPill } from "@/components/BasisPill";
import { AbsentSection, AbsentCell, absentTile, DASH } from "@/components/Absent";
import { NavVsIndex } from "@/components/NavVsIndex";
import { fifoTotals } from "@/lib/fifo";
import { BOOK_ACCOUNT_RETURNS, BOOK_ACCOUNT_BRIDGES } from "@/data/glowData";
import type { AccountBridge, ReturnSeries } from "@/lib/types";
import { measuredAccountsReturn, accountHasOpeningValue } from "@/lib/returns";
import { BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_UNDATED_CAPITAL } from "@/data/glowData";
import { capitalMovesWithCalls } from "@/lib/tranches";

// NAV & Performance — built from what these statements actually carry.
//
// THE NAV TRAJECTORY IS BACK, AND THE PARAGRAPH THAT SAID IT COULD NOT BE HAD
// OUTLIVED ITS OWN PREMISE. It read: "this book's corpus carries exactly TWO
// dated portfolio values per account and two points are not a curve." True of
// the nine-account corpus it was written against; false from the first drop that
// REISSUED a statement. Thirteen accounts publish two or more dated valuations
// and the series spans 2026-05-31 → 2026-08-13. The chart here is the same
// `<NavVsIndex />` Morning CIO draws off the same generated series, so the two
// cannot state different things about what the book measured.
//
// What that paragraph was right about survives inside the chart rather than
// instead of it: a line drawn through a growing panel of accounts asserts a path
// nothing measured, which is why each of its links is struck over the accounts
// valued at both ends and why the raw NAV level only starts where the panel is
// complete. The three things this page already carried — each manager's own
// time-weighted returns, the value bridge, and a money-weighted return over the
// real dated flows — are unchanged.
//
// THREE PERIOD VOCABULARIES, KEPT APART. Goldstandard publishes MTD / QTD / YTD
// against N50TRI; Green Lantern and Carnelian publish trailing 1m / 3m / 1y
// against S&P BSE 500. A trailing one-month return and a month-to-date return
// are different measurements over different windows, so each account shows the
// columns its own manager publishes and a dash for the rest — never a trailing
// figure under a to-date heading.

/** The to-date and trailing columns, in the order a reader scans them. */
const PERIODS = [
  { key: "mtd" as const, label: "MTD", title: "Month to date" },
  { key: "qtd" as const, label: "QTD", title: "Quarter to date" },
  { key: "fytd" as const, label: "FYTD", title: "Indian FINANCIAL year to date — 1 April to the report date, not the calendar year" },
  { key: "m1" as const, label: "1m", title: "Trailing one month — NOT month-to-date" },
  { key: "m3" as const, label: "3m", title: "Trailing three months" },
  { key: "m6" as const, label: "6m", title: "Trailing six months" },
  { key: "y1" as const, label: "1y", title: "Trailing twelve months" },
  { key: "si" as const, label: "Since inception", title: "Since the account's own inception date" },
];

/**
 * The bridge rows, in the order the money moves — EVERY LINE A STATEMENT
 * PRINTS, each on its own row (A-12). "Fees & expenses" read the fees alone
 * and dropped the expenses (Carnelian's financial year ₹10.9 L against the
 * ₹13.57 L it prints; SVAN's ₹2,227 read as nothing), and there was no row for
 * accrued income at all — so no financial-year column added up to its own
 * closing value. An `optional` row is drawn only where one of an account's
 * columns prints a figure other than nil, because a row of dashes under every
 * account for a line one report prints says nothing to anyone else.
 */
const BRIDGE_ROWS = [
  { key: "opening" as const, label: "Opening value", tone: 0, words: "opening value", optional: false },
  { key: "contribution" as const, label: "Contributions", tone: 1, words: "contributions", optional: false },
  { key: "withdrawal" as const, label: "Withdrawals", tone: -1, words: "withdrawals", optional: false },
  { key: "netCapitalInOut" as const, label: "Net capital in / out", tone: 0, words: "net capital", optional: false },
  { key: "realized" as const, label: "Realised gain", tone: 0, words: "realised gain", optional: false },
  { key: "unrealized" as const, label: "Unrealised gain", tone: 0, words: "unrealised gain", optional: false },
  { key: "gainPriorToTakeover" as const, label: "Gain prior to takeover", tone: 0, words: "gain prior to takeover", optional: true },
  { key: "income" as const, label: "Income received", tone: 1, words: "income", optional: false },
  { key: "profit" as const, label: "Profit / loss", tone: 0, words: "profit / loss", optional: true },
  { key: "fees" as const, label: "Fees", tone: -1, words: "fees", optional: false },
  { key: "expenses" as const, label: "Expenses", tone: -1, words: "expenses", optional: true },
  { key: "otherExpenses" as const, label: "Other expenses", tone: -1, words: "other expenses", optional: true },
  { key: "accruedIncome" as const, label: "Accrued income", tone: 1, words: "accrued income", optional: true },
  { key: "changeInAccruals" as const, label: "Change in accruals", tone: 0, words: "change in accruals", optional: true },
  { key: "closing" as const, label: "Closing value", tone: 0, words: "closing value", optional: false },
];
/** A column's window, in words, from the book's own reading of its dates (XA-21). */
const BRIDGE_BASIS_LABEL: Record<AccountBridge["basis"], string> = {
  "since-inception": "Since inception",
  "financial-year-to-date": "FY to date",
  "window": "Window",
};
/** The report a bridge column came from, in words. */
const bridgeReportName = (t: string) => ({
  "fact-sheet": "fact sheet", "performance-history": "performance history",
  "performance-summary": "performance summary", "investor-report": "SEBI investor report",
} as Record<string, string>)[t] ?? "account statement";
/**
 * WHY A COLUMN IS WITHHELD. The book names the lines it could not make add up
 * (`withheldReason`); the gap itself is struck here, in the reader's display
 * currency, because a figure typed into the book's prose would not convert.
 */
const bridgeWithheldWhy = (b: AccountBridge, money: (n: number) => string): string =>
  (b.residual == null || b.linesTotal == null
    ? "Not drawn as a bridge. "
    : `Not drawn as a bridge: its lines add to ${money(b.linesTotal)} against a closing value of `
      + `${money(b.closing ?? 0)}, ${money(Math.abs(b.residual))} apart. `)
  + (b.withheldReason ?? "");
/** How many of the book's bridge columns add up, and of how many — counted, never typed. */
const bridgeTotalsOf = (accounts: readonly { accountId: string }[]) => {
  const cols = accounts.flatMap((a) => BOOK_ACCOUNT_BRIDGES[a.accountId] ?? []);
  return { all: cols.length, tied: cols.filter((b) => b.ties !== false).length };
};

/**
 * WHAT A "NO FLOWS" ROW MAY SAY. This page's rate is struck on a flow series
 * that starts from an opening portfolio value (a performance summary's), and
 * most accounts print none — but a dozen of them carry a dated CAPITAL RECORD
 * the Transactions card reads (a fund's own allotments, a mandate's register, a
 * drawdown fund's calls). "No dated capital movements in this account's
 * statements" was false of every one of those rows. The count is struck on the
 * one record that card reads, never on a second copy of it.
 */
const CAPITAL_RECORD_COUNT = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS)
  .reduce<Record<string, number>>((m, x) => { m[x.accountId] = (m[x.accountId] ?? 0) + 1; return m; }, {});
/**
 * CAPITAL NO DATED ROW CARRIES, NAMED BESIDE THE RATE IT IS MISSING FROM
 * (VD-25). An account's printed totals can move by money its dated record never
 * prints a day for — Carnelian 3517383 prints ₹30,690 of net capital out
 * between two of its marks and dates none of it. A money-weighted rate needs a
 * date for every rupee, and inventing one is the fabrication this book refuses,
 * so the amount is named, with the two marks it sits between, and never dated.
 */
const undatedFor = (accountId: string, from: string | null, to: string | null) =>
  BOOK_UNDATED_CAPITAL.filter((u) => u.accountId === accountId && u.undated !== 0
    && (!from || u.to > from) && (!to || u.from < to));

const undatedSentence = (us: readonly { from: string; to: string; undated: number; evidence: string[] }[],
  money: (n: number) => string, who?: string) => us.map((u) =>
  `${money(Math.abs(u.undated))} of ${who ? `${who}'s ` : ""}net capital ${u.undated < 0 ? "out" : "in"} between ${u.from} and ${u.to} `
  + `is printed in ${who ? "its" : "this account's"} ${u.evidence.map(bridgeReportName).join(", ")} and dated in none of them, `
  + "so it is in none of this rate's flows. No day is assumed for it.").join(" ");

const acctLabel = (a: { owner?: string | null; provider: string; accountNo: string }) =>
  `${a.owner ?? a.accountNo} · ${a.provider.split(" ")[0]} ${a.accountNo}`;

/** The report a return block came from, in words — a report TYPE is a filename token, not a label. */
const REPORT_LABEL: Record<string, string> = {
  "fact-sheet": "Fact sheet",
  "performance-history": "Performance history",
  "performance-benchmark": "Performance vs benchmark",
  "investor-report": "SEBI investor report",
  "performance-summary": "Performance summary",
  "appraisal": "Appraisal",
};
const reportLabel = (t: string) => REPORT_LABEL[t] ?? t;
/** The statement date is the `<asOf>` segment of `<provider>-<accountNo>-<asOf>-<reportType>`. */
const reportDate = (docKey: string): string | null => /-(\d{4}-\d{2}-\d{2})-[a-z-]+$/.exec(docKey)?.[1] ?? null;
/**
 * A PERIOD A REPORT DOES NOT PRINT, even where the book carries a figure in
 * its field. The performance-vs-benchmark report prints one row per MONTH of
 * the financial year and the cumulative year to date — nothing else — and its
 * reader writes the last month's row into both `mtd` and `qtd` (every such
 * block in this book carries the two equal, against fact sheets of the same
 * account and date whose quarter figure differs). A month's return under a
 * heading that says "quarter to date" is a figure the document never printed,
 * so the cell names that instead of showing it; the reader is the place to fix
 * it, and until it is, this is the one period refused.
 */
const UNPRINTED: Record<string, readonly string[]> = { "performance-benchmark": ["qtd"] };
const unprinted = (reportType: string, period: string) => (UNPRINTED[reportType] ?? []).includes(period);

export function Performance() {
  const { portfolio, statementPortfolio, consolidated, fmtFromBase } = usePortfolio();
  const xirrView = useTableView("performance-xirr", XIRR_COLS);

  const p = portfolio?.positions ?? [];
  // Concentration numerator counts each dedupeGroup once — over the raw set,
  // Transition Fund I and the 360 ONE AIF (each reported twice) entered at 2×
  // while the denominator (`listedMV`) already deduped, overstating the top-10.
  const consolidatedWeights = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of consolidated) m.set(x.securityKey, (m.get(x.securityKey) ?? 0) + x.marketValue);
    return [...m.values()].sort((a, b) => b - a);
  }, [consolidated]);
  if (!portfolio) return null;

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const accounts = portfolio.accounts;
  // Consolidated: counts each dedupeGroup once. `costed` is deduped too, or the
  // embedded return is computed over a cost and a P&L that include the same
  // holding twice — it read +17.64% against the CIO's +17.3% on the same book.
  // The per-account figures below filter by accountId and are unaffected.
  const listedMV = consolidatedMarketValue(p);
  /**
   * FIFO — the same aggregator AND THE SAME SET as Morning CIO's Consolidated
   * return, so the two pages cannot print two figures for one book: unrealised
   * on what is held plus realised on units already sold, over the capital that
   * bought them, with each whole mandate struck on its capital since inception.
   * Null, not 0, where no cost is reported.
   *
   * THE SET IS `currentHoldings`, AND THIS COMMENT CLAIMED IT BEFORE IT WAS
   * TRUE. It read "the same costed set as Morning CIO's" over `consolidated` —
   * which still carries the funds redeemed to nil — so 3P India Equity Fund 1,
   * redeemed on 31 July, put its ₹2.56 Cr realised gain and ₹28.50 Cr cost of
   * units sold into this tile and not into Morning CIO's: +16.24% here against
   * +16.68% there, for one book. Morning CIO's own predicate, over Morning
   * CIO's own set, with the same universe for "a mandate held whole".
   */
  const held = currentHoldings(consolidated);
  const costed = held.filter((x) => x.costBasis != null && !x.costUnavailable);
  const listedCost = sumOrNull(costed.map((x) => x.costBasis));
  const listedPnL = sumOrNull(costed.map((x) => x.unrealizedPnL));
  const bookFifo = fifoTotals(costed, { accounts, universe: held });
  const embeddedRet = listedCost !== null && listedPnL !== null && listedCost > 0 ? bookFifo.returnPct : null;

  // ── Money-weighted return, per account and consolidated ──
  //
  // From the book's own dated flows — the capital register (or the bank book
  // where a manager issues none) plus the window's opening portfolio value —
  // closed against that account's market value on its own report date. An
  // account whose flows carry no opening value cannot produce a return over the
  // window, and says which document it is missing rather than showing a zero.
  /**
   * ON THE STATEMENT, EACH ACCOUNT AT ITS OWN DATE (CK-A3, XP-15, XA-27).
   * `measuredAccountsReturn` is the one function Morning CIO's tile and every
   * Family & Entities member row strike this rate through, and this page kept
   * a copy of it that differed in the two places that decide the figure: it
   * closed each account on its LIVE value — AMFI's published NAV on every
   * scheme it prices, a quote on the deployment — dated to a statement weeks
   * older (Active Momentum's ₹22.3 Cr is its 22 Sep NAV value, beside a
   * terminal date of 6 Aug where its statement strikes ₹21.4 Cr), and it
   * carried its own copy of the opening-value test. The flows are complete
   * only to each statement's date, so each account closes on what its
   * statement values on that date, and the pooled window ends on the LATEST
   * of those dates — never on the book's newest date, which is no pooled
   * account's.
   */
  const statement = statementPortfolio ?? portfolio;
  const statementMvOf = (accountId: string) =>
    sum(statement.positions.filter((x) => x.accountId === accountId).map((x) => x.marketValue));
  // The statement registry's own account — on this basis an account the
  // statements do not value keeps the reason they give, and the live figure a
  // published NAV puts on part of it is no figure here.
  const statementAccount = new Map(statement.accounts.map((a) => [a.accountId, a]));
  const xirrByAccount = accounts.map((a) => {
    const flows = statement.accountCashFlows?.[a.accountId] ?? [];
    const mv = statementMvOf(a.accountId);
    const one = measuredAccountsReturn(statement, [a]);
    const part = one.parts.length > 0;
    const recorded = CAPITAL_RECORD_COUNT[a.accountId] ?? 0;
    return {
      account: a,
      unvalued: statementAccount.get(a.accountId)?.noPositionsReason ?? a.noPositionsReason ?? null,
      mv,
      flows: flows.length,
      pct: part ? one.annPct : null,
      toDate: part ? one.toDatePct : null,
      windowDays: part ? one.windowDays : null,
      undated: part ? undatedFor(a.accountId, one.windowStart, a.asOf) : [],
      reason: !flows.length
        ? recorded > 0
          ? `no opening-value flow series here · its ${recorded} dated capital movement${recorded === 1 ? " is" : "s are"} on the Transactions card`
          : "no dated capital movements in this account's statements"
        : !accountHasOpeningValue(statement, a.accountId) ? "no performance summary for the window, so no opening value to measure against"
        : !(mv > 0) ? "nothing is valued on this account's statement, so there is nothing to close its flows against"
        : one.annPct == null ? "its flows and its statement value do not solve for a single rate"
        : null,
      // The long form, on the reason's own hover: the visible line is capped
      // at one short line inside a table (Stage 10cp).
      reasonTitle: !flows.length && recorded > 0
        ? `This rate is struck on a flow series that starts from an opening portfolio value, which only a performance summary prints, and this account's statements print none. Its ${recorded} dated capital movement${recorded === 1 ? " is" : "s are"} on the Transactions card — the fund's own allotments, the mandate's register or a drawdown fund's dated calls.`
        : undefined,
    };
  });
  // THE CONSOLIDATED FIGURE COVERS ONLY THE ACCOUNTS THAT CAN BE MEASURED.
  //
  // Account 510854 publishes no FY performance summary, so its flows carry no
  // opening portfolio value. Pooling everything anyway put its ₹5.92 Cr of
  // market value into the terminal flow with no opening stake behind it — the
  // solver saw ₹5.92 Cr appear out of a handful of small movements and returned
  // 174.3% p.a. against 109.7% for the four accounts that CAN be measured. A
  // 64.6 pp overstatement, and precisely the failure §0 names: a missing value
  // blended in as zero.
  //
  // So the consolidated row is over the measurable accounts, its market value is
  // theirs alone, and the excluded account is named on screen — all of it
  // decided once, by `measuredAccountsReturn`, and each account closing on its
  // own report date (`pooledXirr`).
  const mw = measuredAccountsReturn(statement, accounts);
  const measuredIds = new Set(mw.parts.map((x) => x.accountId));
  const xirrRows = sortRows(xirrByAccount, xirrView.sort, {
    account: (x) => acctLabel(x.account),
    flows: (x) => x.flows,
    mv: (x) => (x.unvalued ? null : x.mv),
    terminal: (x) => x.account.asOf ?? null,
    return: (x) => x.toDate,
  });
  const measurable = xirrByAccount.filter((x) => measuredIds.has(x.account.accountId));
  // Every rupee a pooled account's printed totals carry and no dated row does —
  // named in the pooled figure's hover as it is on the account's own row.
  const consUndated = measurable.flatMap((x) => x.undated.map((u) => ({
    ...u, who: `${x.account.provider.split(" ")[0]} ${x.account.accountNo}` })));
  const unmeasurable = xirrByAccount.filter((x) => !measuredIds.has(x.account.accountId));
  const measuredFlows = mw.parts.flatMap((x) => x.flows);
  const measuredMV = mw.measuredMV;
  // The book the measured value is a share of, on the SAME basis — the
  // statement's own consolidated value, never a NAV-overlaid total.
  const statementBookMV = consolidatedMarketValue(statement.positions);
  const consolidatedXirr = mw.annPct;
  const xirrMissing = mw.excluded;
  /**
   * THE WINDOW THE LABEL NAMES MUST BE THE WINDOW THE RATE MEASURED — first
   * pooled flow to the LATEST close, and a RANGE of closes where the pool's
   * report dates differ, because each account closes on its own.
   */
  const windowStart = mw.windowStart;
  const firstClose = mw.firstClose ?? portfolio.asOf;
  const lastClose = mw.lastClose ?? portfolio.asOf;
  const closeRange = !mw.lastClose ? null
    : mw.firstClose === mw.lastClose ? `at ${mw.lastClose}` : `between ${mw.firstClose} and ${mw.lastClose}`;
  const daysTo = (d: string) => (windowStart ? Math.round((Date.parse(d) - Date.parse(windowStart)) / 864e5) : null);
  const windowNote = !windowStart
    ? "to date"
    : firstClose === lastClose
      ? `over ${windowStart} → ${lastClose} (${daysTo(lastClose)} days)`
      : `over ${windowStart} → ${firstClose}–${lastClose} (${daysTo(firstClose)}–${daysTo(lastClose)} days) — each account closes on its own report date`;
  /**
   * AN ANNUALISED RATE OVER LESS THAN A YEAR IS AN EXTRAPOLATION, AND SAYS SO
   * (Stage 10g(ii), XA-14) — beside the managers' OWN annualised
   * since-inception returns for the same accounts, which is what exposes a
   * +200% "p.a." for the projection it is. Read off the book, never typed.
   */
  const managersOwn = (ids: readonly string[]) => {
    const xs = ids.flatMap((id) => (BOOK_ACCOUNT_RETURNS[id] ?? []).flatMap((blk) => (blk.series as ReturnSeries[])
      .filter((x) => !x.isBenchmark && x.siAnnualised && typeof x.si === "number").map((x) => x.si as number)));
    return xs.length ? { lo: Math.min(...xs), hi: Math.max(...xs) } : null;
  };
  const annualisedNote = (pct: number | null, days: number | null, ids: readonly string[]) => {
    if (pct == null) return undefined;
    const rate = `${fmtPct(pct, { sign: true, decimals: 1 })} p.a.`;
    if (days != null && days >= 365) return `${rate}, annualised over ${days} days.`;
    const own = managersOwn(ids);
    return `${rate} only if ${days != null ? `this ${days}-day window` : "this window"} were compounded over a whole year — an extrapolation, not a rate earned`
      + (own ? `; the managers' own annualised since-inception returns for ${ids.length === 1 ? "this account" : "these accounts"} ${own.lo === own.hi ? `are ${fmtPct(own.lo, { decimals: 2 })}` : `run ${fmtPct(own.lo, { decimals: 2 })} to ${fmtPct(own.hi, { decimals: 2 })}`}` : "")
      + ".";
  };
  const bridgeTotals = bridgeTotalsOf(accounts);
  // The headline is the money-weighted return actually EARNED to date, not the
  // XIRR annualised — a sub-year window compounded onto a year reads as a yearly
  // rate nobody earned (XA-29: this book's pool annualises to ~89% p.a. over
  // about four months). De-annualised over the window the pool closes on; the
  // p.a. rate is kept in the hover, named an extrapolation beside the managers'
  // own since-inception rates. Matches the Morning CIO, so the two pages state
  // one number.
  const consWindowDays = daysTo(lastClose);
  const consolidatedTotalReturn = totalReturnFromXirr(consolidatedXirr, consWindowDays);

  /**
   * ── TIME-WEIGHTED RETURNS: EVERY REPORT THAT PUBLISHES ONE, EACH NAMED ────
   *
   * This took ONE block per account — the fact sheet, else the first — and
   * dashed every period that block lacked with "<provider> does not publish a
   * <period> figure". That was false wherever another report of the SAME date
   * prints it: Carnelian's financial year to date (+26.98%) is on its
   * performance-vs-benchmark report, V.E.C's and Buoyant's one-year figures and
   * Goldstandard's trailing months on their performance histories, and the 6m
   * column vanished entirely because no fact sheet prints one. So every block
   * the book carries is drawn, each under the report it came from, its own date
   * and its fee basis where the report states one — never merged into another
   * report's row, because two reports of one account are two documents and a
   * figure must stay beside the one that printed it. A dash names THAT report.
   */
  const twrr = accounts.map((a) => ({
    account: a,
    blocks: (BOOK_ACCOUNT_RETURNS[a.accountId] ?? []).map((b) => {
      const series = b.series as ReturnSeries[];
      return {
        block: b,
        date: reportDate(b.source),
        // The portfolio's own series first, then each benchmark it is set
        // against — the order the reader reads a pair in.
        rows: [...series.filter((x) => !x.isBenchmark), ...series.filter((x) => x.isBenchmark)],
      };
    }).filter((b) => b.rows.length > 0),
  }));
  // How many MANAGERS publish one — the consolidated row's reason names them,
  // and a count typed into prose went stale the day a fourth manager's
  // statements arrived.
  const twrrManagers = new Set(twrr.filter((t) => t.blocks.length).map((t) => t.account.provider)).size;
  // A column is worth a heading only if some report prints it.
  const livePeriods = PERIODS.filter((per) =>
    twrr.some((t) => t.blocks.some((b) => b.rows.some((x) => x[per.key] !== null && !unprinted(b.block.reportType, per.key)))));

  const top10Val = sum(consolidatedWeights.slice(0, 10));
  const top10 = listedMV > 0 ? (top10Val / listedMV) * 100 : 0;
  // ONE COUNT OF WHAT THE FAMILY HOLDS, and it is `currentHoldings`' — the
  // definition Morning CIO, the holdings drill-down and Data & Refresh all read.
  const heldSet = held;
  const heldCount = heldSet.length;
  const heldNames = new Set(heldSet.map((x) => x.securityKey)).size;
  const dropped = droppedHoldings(consolidated);
  const heldWhy = [
    `${p.length} statement rows in the book.`,
    p.length > consolidated.length ? `${p.length - consolidated.length} reported under two members and counted once.` : "",
    dropped.closed.length ? `${dropped.closed.length} redeemed to nil — the fund still publishes a NAV, the family no longer holds the units.` : "",
    dropped.negligible.length ? `${dropped.negligible.length} worth under ${fmtFromBase(NEGLIGIBLE_VALUE_FLOOR)}, dropped at the family's request.` : "",
    `The ${heldCount} left are the current holdings Morning CIO counts; the value above is struck over every consolidated row, which the dropped ones move by ${money(listedMV - sum(heldSet.map((x) => x.marketValue)))}.`,
  ].filter(Boolean).join(" ");
  const bridgeOf = (accountId: string): AccountBridge[] => BOOK_ACCOUNT_BRIDGES[accountId] ?? [];
  // The Current Value tile sums the consolidated book, AMFI's published NAV
  // included on every scheme it prices; the basis pill cannot say so, because
  // a NAV never sets the live flag. This pill does, beside it.
  const vb = valuationBasis(consolidated, portfolio.accounts,
    statementPortfolio ? dedupedPositions(statementPortfolio.positions) : undefined);

  return (
    <div>
      <PageHeader eyebrow="Analytics" title="NAV &amp; Performance"
        subtitle="Time-weighted returns as each manager publishes them, the value bridge from opening to closing, and a money-weighted return over the real dated flows."
        right={<div className="flex items-center gap-2">
          <BasisPill liveText="Live prices" hint="Current value of holdings and embedded return are rebuilt from live prices where a quote exists; the managers' returns and the bridge are as reported." />
          {vb.nav.rows > 0 && (
            <Pill tone="info">
              <span data-xa="nav-basis" data-nav-from={vb.nav.from ?? ""} data-nav-to={vb.nav.to ?? ""}
                data-nav-schemes={vb.nav.schemes} data-nav-rows={vb.nav.rows} data-nav-value={vb.nav.value}
                data-nav-printed={vb.nav.statementValue ?? ""} data-nav-marked={vb.nav.markedValue}
                data-units-value={vb.units.value} data-units-rows={vb.units.rows}
                data-units-from={vb.units.from ?? ""} data-units-to={vb.units.to ?? ""}
                title={navBasisTitle(vb, (n) => fmtFromBase(n, { compact: true }), fmtDate)}>
                {navBasisLabel(vb, fmtDate)}
              </span>
            </Pill>
          )}
          <Pill tone="info">{accounts.length} accounts</Pill>
        </div>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* THE CURRENT HOLDINGS, the set Morning CIO's Positions counts. This
            read "369 of 371 rows", a count of statement ROWS less the double
            report — which still carried the funds redeemed to nil and the
            holdings under the ₹1,000 floor that every allocation surface drops,
            so one book had three position counts on three pages. The rows it
            leaves out are named in the hover. */}
        <StatTile label="Current Value of Holdings"
          value={money(listedMV)}
          sub={<span data-xa="perf-positions" data-value={heldCount} data-names={heldNames}>
            {`${heldCount} holdings · ${heldNames} names across ${accounts.length} accounts`}</span>}
          title={heldWhy}
          icon={<Layers className="h-4 w-4" />} />

        <StatTile label="Return · FIFO"
          value={<Auditable formula={{
            title: "Return (FIFO)",
            excel: "= (Σ unrealised + Σ realised) ÷ Σ capital deployed × 100",
            plain: "Everything the book has produced — the unrealised gain on what is held and the realised gain on units already sold, matched first-in, first-out — over every rupee that bought a unit of it. A whole mandate is struck on its capital since inception.",
            worked: `= (${money(bookFifo.unrealised, true)} + ${money(bookFifo.realised, true)}) ÷ ${money(bookFifo.deployed)} × 100 = ${fmtPct(embeddedRet, { sign: true })}`,
          }}><span data-xa="perf-fifo" data-value={embeddedRet ?? ""}>{fmtPct(embeddedRet, { sign: true })}</span></Auditable>}
          sub={<>{money(bookFifo.unrealised, true)} unrealised + {money(bookFifo.realised, true)} realised</>} delta={embeddedRet} icon={<Gauge className="h-4 w-4" />} />

        {consolidatedXirr == null ? (
          <StatTile label="Money-weighted return (XIRR)"
            {...absentTile("no dated capital movements to measure against",
              "XIRR needs dated external flows. No statement in this book carries them.")}
            icon={<Percent className="h-4 w-4" />} />
        ) : (
          <StatTile label="Money-weighted return (to date)"
            value={<span className={(consolidatedTotalReturn ?? 0) >= 0 ? "text-gain" : "text-loss"}>{fmtPct(consolidatedTotalReturn, { sign: true, decimals: 1 })}</span>}
            // "NOT ANNUALISED" STAYS ON THE FACE — Stage 10g(ii)'s guard, which
            // the caller must state — and the window and coverage are the hover
            // (Stage 10cp), where `hint` now lands.
            sub={`to date · not annualised${consWindowDays ? ` · ${consWindowDays} days` : ""}`}
            hint={`${xirrMissing.length ? `Over ${measurable.length} of ${accounts.length} accounts` : "Over every account"}, ${windowNote}.`}
            // Each account at its OWN statement date and value (XP-15): the
            // close is a range where the pool's report dates differ, and never
            // the book's newest date, which is no pooled account's.
            title={`${xirrMissing.length
              ? `Over the ${measurable.length} of ${accounts.length} accounts whose statements carry an opening portfolio value, each closed against the value its own statement strikes on its own date — ${money(measuredMV)} in all, ${closeRange ?? "on no date"}. ${xirrMissing.length === 1 ? "Account" : "Accounts"} ${xirrMissing.join(", ")} ${xirrMissing.length === 1 ? "is" : "are"} excluded on both sides — counting ${xirrMissing.length === 1 ? "its value without its" : "their value without their"} opening stake would overstate this figure.`
              : `Over all ${measurable.length} accounts' dated flows, each closed against the value its own statement strikes on its own date — ${money(measuredMV)} in all, ${closeRange ?? "on no date"}.`} This is the money-weighted return actually earned over the window${consWindowDays ? ` (${consWindowDays} days)` : ""}, and it stays off a yearly scale on the tile: the annualised XIRR is ${annualisedNote(consolidatedXirr, consWindowDays, mw.parts.map((x) => x.accountId)) ?? "not struck."}`}
            icon={<Percent className="h-4 w-4" />} />
        )}

        <StatTile label="Top-10 concentration"
          value={<Auditable formula={{ title: "Top-10 concentration", excel: "= Top 10 holdings' value ÷ Total market value × 100", plain: "How much of the consolidated book sits in just its ten biggest holdings.", worked: `= ${money(top10Val)} ÷ ${money(listedMV)} × 100 = ${top10.toFixed(0)}%`,  }}>{`${top10.toFixed(0)}%`}</Auditable>}
          sub="of the current value of holdings in the 10 biggest holdings" icon={<Crosshair className="h-4 w-4" />} />
      </div>

      {/* ── NAV TRAJECTORY — AND THE ABSENCE THAT OUTLIVED ITS PREMISE ─────
          This card rendered an `AbsentSection` reading "No valuation series in
          this book · each account's statements carry exactly two dated portfolio
          values" for five deliveries after that stopped being true. Thirteen
          accounts publish two or more, and the series spans 74 days.

          It was the SIXTH absence in this book recorded against a premise nobody
          rechecked — after FRED, the RBI, the release calendar, the ISIN tier and
          3P's redemption on page 2 — and this file's own header still carried the
          same claim in prose. It is the same chart Morning CIO draws, from the
          same generated series, so the two cannot disagree about what the book
          measured. */}
      <div className="mt-5">
        <NavVsIndex />
      </div>

      {/* ── TWRR grid ── */}
      <Card className="mt-5" title="Time-weighted return"
        // A card's subtitle is its title's hover (Stage 10cp): XA-15's wording
        // — every report, under its own date — goes there, not under the title.
        subtitle="As each manager publishes it — every report that prints one is drawn, each under its own date, portfolio against that manager's own benchmark. Since inception is annualised only where the report says so (p.a.); otherwise it is the return over the whole period (abs)."
        right={<Pill tone="info">{twrr.filter((t) => t.blocks.length).length} of {accounts.length} accounts</Pill>}>
        <div className="overflow-x-auto">
          {/* Exempt, declared — the same class as `ReturnsTable`: the columns
              after Account and Series are the manager's own period sequence
              (1m → 3m → 6m → 1y → since inception), and a row is a portfolio
              paired with its own benchmark, so the pair must stay adjacent. */}
          <table className="w-full text-[12.5px]"
            data-table-static="the columns after the first are a period sequence the manager publishes in order — moving one would break the sequence a reader reads them as">
            <thead className="label-xs border-b border-ink-700">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Report</th>
                <th className="px-3 py-2 text-left">Series</th>
                {livePeriods.map((per) => (
                  <th key={per.key} className="px-3 py-2 text-right" title={per.title}>{per.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {twrr.flatMap((t) => {
                if (!t.blocks.length) {
                  return [(
                    <tr key={t.account.accountId} className="border-t border-ink-700/60">
                      <td className="px-3 py-2.5 font-medium text-slate-100">{acctLabel(t.account)}</td>
                      <td className="px-3 py-2.5 text-slate-500" colSpan={livePeriods.length + 2}>
                        {DASH} no time-weighted return series in this account's statements
                      </td>
                    </tr>
                  )];
                }
                return t.blocks.flatMap((b, bi) => b.rows.map((s, i) => (
                  <tr key={`${t.account.accountId}-${b.block.source}-${s.series}-${i}`}
                    className={i === 0 ? (bi === 0 ? "border-t border-ink-700/60" : "border-t border-dashed border-ink-700/60") : ""}>
                    <td className="px-3 py-2.5 font-medium text-slate-100">{bi === 0 && i === 0 ? acctLabel(t.account) : ""}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-slate-400">
                      {i === 0 && (
                        <span data-xa="twrr-block" data-account={t.account.accountId} data-report={b.block.reportType}
                          data-date={b.date ?? ""} data-series={b.rows.length}>
                          {reportLabel(b.block.reportType)}
                          {b.date ? <> · {fmtDate(b.date)}</> : null}
                          {s.feeBasis === "after" || s.feeBasis === "before" ? <> · {s.feeBasis} fees</> : null}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 ${s.isBenchmark ? "text-slate-400" : "text-slate-200"}`}>
                      {s.series}{s.isBenchmark ? " (benchmark)" : ""}
                    </td>
                    {livePeriods.map((per) => {
                      const v = s[per.key];
                      const shown = v !== null && !unprinted(b.block.reportType, per.key);
                      // SINCE INCEPTION SAYS WHICH RETURN IT IS. A report annualises
                      // only past a year, so the same column holds rates (p.a.) and
                      // holding-period returns (abs) — unmarked, a reader compares
                      // one account's 19.83% p.a. with another's 7.17% over 228 days.
                      const siTag = per.key === "si" && shown
                        ? (s.siAnnualised === true ? " p.a." : s.siAnnualised === false ? " abs" : "")
                        : "";
                      // The dash's reason names THE REPORT, never the manager:
                      // another report of the same account and date may print
                      // the figure this one does not, and it is drawn above.
                      const reason = shown ? "" : v !== null
                        ? `the ${reportLabel(b.block.reportType).toLowerCase()} prints one row per month and the year to date — it prints no quarter-to-date figure, and the month's return is not one`
                        : `the ${reportLabel(b.block.reportType).toLowerCase()}${b.date ? ` of ${fmtDate(b.date)}` : ""} prints no ${per.label} figure`;
                      return (
                        <td key={per.key} className="px-3 py-2.5 text-right mono"
                          data-xa="twrr-cell" data-account={t.account.accountId} data-report={b.block.reportType}
                          data-date={b.date ?? ""} data-series={s.series} data-period={per.key}
                          data-value={shown ? String(v) : ""} data-reason={reason}>
                          {!shown
                            ? <AbsentCell reason={reason} />
                            : <span className={(v as number) >= 0 ? "text-gain" : "text-loss"}>
                                {fmtPct(v, { sign: true, decimals: 2 })}{siTag && <span className="text-[10.5px] text-slate-500">{siTag}</span>}
                              </span>}
                        </td>
                      );
                    })}
                  </tr>
                )));
              })}
              <tr className="border-t-2 border-ink-600">
                <td className="px-3 py-2.5 font-semibold text-slate-200">Consolidated</td>
                <td className="px-3 py-2.5 text-slate-500" colSpan={livePeriods.length + 2}
                  title={`Time-weighted returns cannot be consolidated across these accounts: the ${twrrManagers} managers publish different periods, against different benchmarks, from different inception dates. The money-weighted return on this page is the consolidated figure this book does support.`}>
                  {DASH} not consolidated — the managers publish different periods and benchmarks
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Value bridge ── */}
      {/* A COLUMN IS DRAWN ONLY WHERE ITS PARTS MAKE ITS TOTAL (A-12). Nine
          since-inception columns printed an opening equal to their closing, the
          five Sanshi columns closed on their contributions, and no financial-year
          column added up — every figure real, and every column teaching a reader
          wrong arithmetic. The book ties each column on its own lines
          (`ties`, `withheldReason`); one that does not is WITHHELD: its heading
          says so and why, and none of its figures is drawn as a bridge. */}
      <Card className="mt-5" title="Value bridge"
        subtitle={`Opening value to closing value, per account — every line read from the statements. ${bridgeTotals.tied} of ${bridgeTotals.all} columns add up to their closing value within the statement's own rounding${bridgeTotals.all > bridgeTotals.tied ? `; the other ${bridgeTotals.all - bridgeTotals.tied} are withheld, and each heading says why` : ""}.`}
        right={bridgeTotals.all > 0 ? <Pill tone="info"><span data-bridge-totals data-tied={bridgeTotals.tied} data-all={bridgeTotals.all}>
          {bridgeTotals.tied} of {bridgeTotals.all} add up</span></Pill> : undefined}>
        <div className="space-y-6">
          {accounts.map((a) => {
            const bridges = bridgeOf(a.accountId);
            // A line one of this account's columns prints is a row; an optional
            // line none of them prints (or prints as nil) is not drawn at all.
            const rows = BRIDGE_ROWS.filter((row) => !row.optional
              || bridges.some((b) => { const v = b[row.key]; return typeof v === "number" && v !== 0; }));
            return (
              <div key={a.accountId}>
                <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-[12.5px] font-semibold text-slate-200">{acctLabel(a)}</span>
                  <span className="text-[10.5px] text-slate-500">inception {a.inceptionDate ?? DASH}</span>
                </div>
                {!bridges.length ? (
                  <p className="text-[11.5px] text-slate-500">{DASH} no flow block in this account's statements</p>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Exempt, declared: TRANSPOSED — its rows are the bridge's
                        fixed components and its columns are the statements that
                        publish them. */}
                    <table className="w-full text-[12.5px]" data-bridge-table={a.accountId}
                      data-table-static="transposed — the rows are a fixed component list rather than records, and the columns are the statements that publish them">
                      <thead className="label-xs border-b border-ink-700">
                        <tr>
                          <th className="px-3 py-1.5 text-left">Component</th>
                          {bridges.map((b) => {
                            const withheld = b.ties === false;
                            return (
                              <th key={b.source} className="px-3 py-1.5 text-right" data-bridge-col={b.source}
                                data-bridge-basis={b.basis} data-bridge-withheld={withheld ? "1" : "0"}
                                data-bridge-residual={b.residual ?? ""}>
                                {BRIDGE_BASIS_LABEL[b.basis] ?? b.basis}
                                <div className="font-normal normal-case tracking-normal text-slate-600">{b.periodFrom} → {b.periodTo}</div>
                                <div className="font-normal normal-case tracking-normal text-slate-600">{bridgeReportName(b.reportType)}</div>
                                {withheld && (
                                  <div className="cursor-help font-normal normal-case tracking-normal text-amber-400"
                                    data-bridge-withheld-note title={bridgeWithheldWhy(b, money)}>withheld · does not add up</div>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.key} className="border-t border-ink-700/60" data-bridge-row={row.key}>
                            <td className="px-3 py-1.5 text-slate-300">{row.label}</td>
                            {bridges.map((b) => {
                              const v = b[row.key];
                              const nilOpening = row.key === "opening" && b.openingNil === true;
                              return (
                                <td key={b.source} className="px-3 py-1.5 text-right mono" data-bridge-cell={row.key}
                                  data-bridge-of={b.source}
                                  data-v={b.ties === false ? "" : nilOpening ? 0 : typeof v === "number" ? v : ""}>
                                  {b.ties === false
                                    ? <AbsentCell reason={bridgeWithheldWhy(b, money)} />
                                    : nilOpening
                                    /* NIL BY DEFINITION, AND SAID IN THE CELL: nothing
                                       is held before inception, so the report prints
                                       no opening and the bridge adds from zero. A
                                       computed zero, never a printed one. */
                                    ? <span data-bridge-computed title="Since inception: nothing was held before the account's inception, so its opening value is a computed zero the report does not print.">
                                        {money(0)}<span className="block text-[10px] font-sans text-slate-500">nil · since inception</span>
                                      </span>
                                    : typeof v !== "number"
                                    ? <AbsentCell reason={(b.unread ?? []).includes(row.key)
                                        ? `no ${row.words} line is read from this ${bridgeReportName(b.reportType)}`
                                        : `the ${bridgeReportName(b.reportType)} prints no ${row.words} line`} />
                                    : <span className={row.tone === -1 ? "text-loss" : row.tone === 1 ? "text-gain" : "text-slate-200"}>
                                          {money(v)}
                                        </span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Money-weighted return, per account ── */}
      {/* "NOT ANNUALISED" IS THE GUARD, SO IT IS IN THE TITLE (Stage 10cp) —
          Stage 10g(ii): a sub-year window is never compounded onto a year, and
          the caller must say so on screen. The line under the title went with
          every other; how the rate is struck is the title's hover. */}
      <Card className="mt-5" title="Money-weighted return to date, per account · not annualised"
        subtitle="From each account's own dated capital movements, closed against the value its own statement strikes on its own date — the return earned to date, not annualised.">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="label-xs border-b border-ink-700">
              <Tr view={xirrView}>
                <SortHeader col="account" view={xirrView} align="left" pad="px-3 py-2">Account</SortHeader>
                <SortHeader col="flows" view={xirrView} pad="px-3 py-2">Dated flows</SortHeader>
                <SortHeader col="mv" view={xirrView} pad="px-3 py-2" title="The value each account's own statement strikes on its terminal date — what its flows close against, never a live or NAV-priced figure.">Market value</SortHeader>
                <SortHeader col="terminal" view={xirrView} pad="px-3 py-2">Terminal date</SortHeader>
                <SortHeader col="return" view={xirrView} pad="px-3 py-2" title="Money-weighted return earned to date — the annualised XIRR de-annualised to the account's window.">Return (to date)</SortHeader>
              </Tr>
            </thead>
            <tbody>
              {xirrRows.map((x) => (
                <Tr view={xirrView} key={x.account.accountId} className="border-t border-ink-700/60"
                  data-xirr-row={x.account.accountId} data-xirr-mv={x.unvalued ? "" : x.mv}
                  data-xirr-pct={x.pct ?? ""} data-xirr-todate={x.toDate ?? ""} data-xirr-days={x.windowDays ?? ""}>
                  <td className="px-3 py-2.5 font-medium text-slate-100">{acctLabel(x.account)}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">{x.flows}</td>
                  <td className="px-3 py-2.5 text-right mono text-slate-200">
                    {/* `₹0` on an account nobody valued is a claim, not a
                        measurement — see Account.noPositionsReason. ON THE
                        STATEMENT BASIS, and an account whose statements value
                        nothing keeps THEIR reason: the funds a published NAV,
                        and the shares a live quote, value on part of one are no
                        figure beside a statement's terminal date (XA-14). */}
                    {x.unvalued
                      ? <AbsentCell reason={x.unvalued} />
                      : money(x.mv)}
                  </td>
                  <td className="px-3 py-2.5 text-right mono text-slate-400">{x.account.asOf}</td>
                  <td className="px-3 py-2.5 text-right mono">
                    {x.pct == null
                      ? <span className="text-[11px] text-slate-500" title={x.reasonTitle}>{DASH} {x.reason}</span>
                      : <>
                          <span className={(x.toDate ?? 0) >= 0 ? "text-gain" : "text-loss"}
                            title={annualisedNote(x.pct, x.windowDays, [x.account.accountId])}>{fmtPct(x.toDate, { sign: true, decimals: 1 })}</span>
                          {/* NAMED, NEVER DATED (VD-25): capital the account's
                              printed totals carry and no dated row does. */}
                          {x.undated.length > 0 && (
                            <span className="block cursor-help text-[10px] font-sans text-amber-400"
                              data-xirr-undated={x.undated.reduce((t, u) => t + u.undated, 0)}
                              title={undatedSentence(x.undated, money)}>
                              {money(Math.abs(x.undated.reduce((t, u) => t + u.undated, 0)))} undated · not in these flows
                            </span>
                          )}
                        </>}
                  </td>
                </Tr>
              ))}
              <tr className="border-t-2 border-ink-600 font-semibold" data-xirr-consolidated
                data-mv={measuredMV} data-book={statementBookMV} data-first={mw.firstClose ?? ""} data-last={mw.lastClose ?? ""}
                data-pct={consolidatedXirr ?? ""} data-todate={consolidatedTotalReturn ?? ""} data-days={consWindowDays ?? ""}>
                <td className="px-3 py-2.5 text-slate-200">
                  Consolidated
                  {unmeasurable.length > 0 && (
                    <div className="text-[10.5px] font-normal text-slate-500">
                      {measurable.length} of {accounts.length} accounts · {money(measuredMV)} of the statements' {money(statementBookMV)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right mono text-slate-400">{measuredFlows.length}</td>
                <td className="px-3 py-2.5 text-right mono text-slate-200">{money(measuredMV)}</td>
                <td className="px-3 py-2.5 text-right mono text-slate-400"
                  title={mw.firstClose && mw.firstClose !== mw.lastClose ? "Each account closes on its own statement date." : undefined}>
                  {!mw.lastClose ? DASH : mw.firstClose === mw.lastClose ? mw.lastClose : `${mw.firstClose} → ${mw.lastClose}`}
                </td>
                <td className="px-3 py-2.5 text-right mono">
                  {consolidatedTotalReturn == null
                    ? <AbsentCell reason={!mw.parts.length
                        ? "no account's statements carry both dated flows and an opening portfolio value to measure against"
                        : "the pooled flows and their statement values do not solve for a single rate"} />
                    : <span className={consolidatedTotalReturn >= 0 ? "text-gain" : "text-loss"}
                        data-xirr-undated={consUndated.reduce((t, u) => t + u.undated, 0)}
                        title={[annualisedNote(consolidatedXirr, consWindowDays, mw.parts.map((x) => x.accountId)),
                          ...consUndated.map((u) => undatedSentence([u], money, u.who))].filter(Boolean).join(" ")}>
                        {fmtPct(consolidatedTotalReturn, { sign: true, decimals: 1 })}</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
