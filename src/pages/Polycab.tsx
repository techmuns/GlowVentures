import { Shield } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useViewParam } from "@/components/ViewToggle";
import { useTableView, sortRows } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { OutOfScope } from "@/components/MemberScopeSelect";
import { inScopeAccount } from "@/lib/memberScope";
import { fmtCurrency, fmtNum, fmtDate, fmtPct, displaySecurity, changeColor } from "@/lib/format";
import { sumOrNull } from "@/lib/analytics";
import { BOOK_POLYCAB, BOOK_ACCOUNTS } from "@/data/glowData";
import {
  usePolycabLive, markedValue, sourcesFor, statementDates, balanceReportedOn, daysBetween,
  paymentDateWhy, witnessCounts, holdingWhy, pledgeWhy, POLYCAB_SOURCES, type StatementBalance,
} from "@/lib/polycabLive";
import type { PolycabAction } from "@/data/polycabLive";

/**
 * THE RING-FENCED PROMOTER HOLDING, ON ITS OWN PAGE — AND NOW ONE TABLE.
 *
 * Polycab India is the family's promoter stock. The ICICI NSDL statement says the
 * account holds it, so it is ingested — refusing a measured holding for being
 * inconveniently large is the fabrication rule run backwards — but the family
 * asked for it OUT of every consolidated total, split, allocation, sector, entity
 * and holdings table, and shown here alone. `build-book.mjs` peels it into
 * `BOOK_POLYCAB` (see RINGFENCED_SECURITY_KEYS); this page is its only reader, and
 * it deliberately reads that export DIRECTLY rather than the portfolio context, so
 * nothing here can leak back into a portfolio figure.
 *
 * ── "TOO BUSY FOR NO REASON" ───────────────────────────────────────────────
 *
 *   *"Polycab could be just a simple table with all the columns and fields as
 *    required, and also match it with the exact UI upgrades that we're doing for
 *    master tables in the private market tab and the portfolio tab."*
 *
 * It was a hero with four pills and a second value block, five KPI tiles, and
 * four stacked cards — and it printed the same three figures (the value, the
 * share count and the mark) three times each. It is the Private Market's shape
 * now: the page header, then ONE card whose own header carries a toggle between
 * three tables, each sortable and draggable like every other table in the app.
 * Every figure a tile printed is a COLUMN of the holding table, on the row it
 * describes, so nothing was lost to the simplification — `check:pages` asserts
 * the re-homing as well as the removal, because a build that dropped the tiles
 * and the figures together would pass an absence check on its own.
 *
 * ── THE COMPANY IS NOT THE DEMAT, AND THE TOGGLE KEEPS THEM APART ──────────
 *
 * The holding table is what the family's own STATEMENT reports. The other two
 * are what POLYCAB THE COMPANY declared and what its promoter GROUP disclosed —
 * public, statutory, refreshed daily by `npm run build-polycab`. A promoter-group
 * encumbrance of 0% is a real measurement about the group; it is NOT a statement
 * that this demat's balance is unencumbered, and the two are one careless edit
 * apart. So the demat's own Pledged cell is an absence with that sentence as its
 * reason, the promoter table's pledge column says "group" under its heading in
 * words, and no figure from the company-level record ever fills a holding cell.
 *
 * ── WHAT THE STATEMENT DOES NOT CARRY STAYS ABSENT ─────────────────────────
 *
 * An NSDL `Statement of Holding` has five columns — ISIN, scrip name, account
 * description, balance, value. No rate column (so the mark is DERIVED, value ÷
 * units), no cost (a depository holds shares, it did not buy them), and no
 * pledge column — the account description is a BALANCE TYPE, which marks a
 * lock-in and which this book does not yet read. Each of those renders
 * `AbsentCell` with its reason; a ₹0 cost would report the whole value as
 * profit, and a nil pledge on a promoter block is the most consequential zero
 * available to invent.
 *
 * ── THE SECOND PROMOTER STATEMENT IS NOT MENTIONED HERE, BY REQUEST ────────
 *
 * Another member's promoter shares sit on an HDFC Bank NSDL statement that
 * arrived as a SCAN — four JPEG pages, no text layer — and is still unread in
 * `source/` (see `docs/EXTRACTION-REPORT.md`). The holding table is written over
 * the collection rather than as one hard-coded row, so that statement, re-sent
 * as a text PDF, is a second row with no code change — and the footer, which
 * only draws when there is more than one row to total, appears with it.
 */

/**
 * THE THREE TABLES, AND EACH CARRIES ITS OWN CARD TITLE AND SUBTITLE — the
 * Private Market's rule: one title over three different tables would be a
 * caption that does not describe the figures under it.
 */
const POLYCAB_VIEWS = [
  {
    key: "holding", label: "Holding",
    title: "The shares, per demat account, as the family's own statement reports them.",
    cardTitle: "Holding, per demat account",
    // NO SUBTITLE, AND THAT IS A DECISION: this card's old subtitle ("one row
    // per depository account…") was removed at the family's request, and what it
    // said is on the headings — "statement" under the mark and the value, the
    // price's basis under CMP.
    cardSub: "",
  },
  {
    key: "actions", label: "Corporate actions",
    title: "Every dividend, bonus and split Polycab has declared, from the exchange's own record.",
    cardTitle: "What Polycab has declared",
    // Only the COMPLETE wording is written here; the card reads `actionsSub`,
    // which falls back to the incomplete one when the last refresh could not
    // fetch the record whole. "Whole since listing" is a claim about a fetch.
    cardSub: "The exchange's own corporate-action record, whole since listing.",
  },
  {
    key: "promoter", label: "Promoter group",
    title: "The promoter GROUP's disclosed holding and pledge, quarter by quarter — not this demat.",
    cardTitle: "Promoter group — holding and pledge",
    cardSub: "What the promoter group discloses each quarter — not a statement about the family's own demat.",
  },
] as const;
type PolycabView = (typeof POLYCAB_VIEWS)[number]["key"];

/** Each table's columns, in the order its rows write their cells. */
const HOLDING_COLS = ["security", "holder", "account", "asOf", "shares", "mark", "value", "cost", "pledge", "price", "day", "marketValue"] as const;
const ACTION_COLS = ["exDate", "action", "perShare", "record", "paid", "entitlement"] as const;
const QUARTER_COLS = ["quarter", "holding", "pledge", "sources"] as const;

/** One cell's padding for every table on the page, headings included. */
const CELL = "px-2.5 py-2";
const HEAD = "px-2.5 py-2";

const COST_WHY = "a depository reports no acquisition cost — it holds the shares, it did not buy them, and a ₹0 cost would report the whole value as profit";
/**
 * WHAT THE STATEMENT DOES AND DOES NOT PRINT, SAID EXACTLY. This read "prints no
 * pledge, lock-in or freeze column", and the statement DOES print a balance type
 * on every row — its Account Description, which marks the pre-IPO lock-ins on
 * other holdings of the same statement. What it prints no column for is a
 * PLEDGE, and it names no pledgee. The description is measured by the reader and
 * discarded, so the page cannot quote it; whether one plain "Beneficiary" row is
 * evidence of an unencumbered balance is the family's question, not this page's.
 */
const PLEDGE_WHY = "the NSDL statement behind this holding prints no pledge column and names no pledgee — it prints a balance type for each row (its Account Description), which this book does not yet read — so this page makes no claim about a pledge on this account either way; the promoter group's pledge is a group figure, not a statement about this account";
/**
 * THE MARK'S DATE IS THE STATEMENT'S PRICING DATE, WHICH NEED NOT BE ITS BALANCE
 * DATE. This said the mark was "a statement figure as of the statement's date";
 * the ICICI statement reports its balance at 31 Mar 2026 and values it "Prices
 * as on 30-Mar-2026". The book carries that pricing date now (`priceAsOf`, off
 * the reader's own reading of the total row), so the hover names BOTH dates, each
 * in its own role. Where a statement prints no pricing date the row carries none,
 * and the hover falls back to saying only that the valuation is at the prices the
 * statement states — which is true whatever the gap, and asserts no date.
 */
const MARK_DERIVED = "The mark is the value the NSDL depository prints, divided by the units it prints — a depository statement carries no rate column.";
const MARK_NOT_LIVE = "and not a live price; the market price is its own column and is never substituted for this one.";
const MARK_UNDATED = "at the prices the statement itself states it is struck at — which need not be the balance date in the As-of column —";
/** "balance as of 31 Mar 2026, valued at the 30 Mar 2026 session's prices", or null where no pricing date was printed. */
function markWhen(balanceAsOf: string | null | undefined, priceAsOf: string | null | undefined): string | null {
  if (!priceAsOf) return null;
  return `balance as of ${balanceAsOf ? fmtDate(balanceAsOf) : "a date the statement does not state"}, valued at the ${fmtDate(priceAsOf)} session's prices`;
}

/**
 * A CORPORATE ACTION AS A ROW. Dividends carry a derived entitlement on this
 * block; a bonus, split or spin-off changes the share count and pays nothing, so
 * its row has no amount rather than a zero. One table rather than two, because
 * the reader's question — "what has the company done?" — is one question.
 */
type ActionRow = { action: PolycabAction; amount: number | null; balanceReportedOnExDate: boolean; cash: boolean };

/**
 * THE STATEMENT BALANCES BEHIND THE BLOCK — one per demat row, each with ITS
 * statement's own date. Built once, at module scope, off the two generated
 * exports, so the page never takes the first row's date as every row's: a
 * second promoter statement dated differently is a second balance with its own
 * date, and every figure struck across them says it blends them.
 */
const ACCOUNT_BY_ID = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const BALANCES: StatementBalance[] = BOOK_POLYCAB.map((p) => ({
  shares: typeof p.quantity === "number" ? p.quantity : null,
  asOf: ACCOUNT_BY_ID.get(p.accountId)?.asOf ?? null,
}));
const STATEMENT_DATES = statementDates(BALANCES);
/**
 * The column's own hover. One balance date and one pricing date across every
 * row are named outright; rows dated differently each carry their own pair in
 * the Mark cell's hover, and the heading says so rather than naming one of them.
 */
const MARK_WHENS = [...new Set(BOOK_POLYCAB.map((p) => markWhen(ACCOUNT_BY_ID.get(p.accountId)?.asOf, p.priceAsOf) ?? ""))];
const MARK_HOW = MARK_WHENS.length === 1 && MARK_WHENS[0]
  ? `${MARK_DERIVED} It is the statement's own valuation — ${MARK_WHENS[0]} — ${MARK_NOT_LIVE}`
  : MARK_WHENS.some(Boolean)
    ? `${MARK_DERIVED} It is the statement's own valuation, at the prices each statement states — each row's hover names its own balance date and pricing date, which need not be the same — ${MARK_NOT_LIVE}`
    : `${MARK_DERIVED} It is the statement's own valuation, ${MARK_UNDATED} ${MARK_NOT_LIVE}`;

export function Polycab() {
  const { fmtFromBase, convertFromBase, displayCurrency, scope } = usePortfolio();
  const [view, setView] = useViewParam(POLYCAB_VIEWS, {}, "view");
  const holdingView = useTableView("polycab-holding", HOLDING_COLS);
  const actionView = useTableView("polycab-dividends", ACTION_COLS);
  const quarterView = useTableView("polycab-quarters", QUARTER_COLS);
  const money = (n: number | null | undefined) => fmtFromBase(n, { compact: true });
  const price = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : null;

  const rows = BOOK_POLYCAB.map((p) => ({ p, a: ACCOUNT_BY_ID.get(p.accountId) }));

  /**
   * `sumOrNull`, NOT `sum(… ?? 0)`. The block is one row today, and the whole
   * reason these are sums is a row this book does not yet have — a value that
   * row's statement did not report must not blend in as zero and quietly shrink
   * the figures above it.
   */
  const mv = sumOrNull(BOOK_POLYCAB.map((p) => p.marketValue));
  const shares = sumOrNull(BOOK_POLYCAB.map((p) => p.quantity));
  /** The one statement date, where every row shares one — otherwise null, and the page names them all. */
  const oneDate = STATEMENT_DATES.length === 1 ? STATEMENT_DATES[0] : null;
  const datesText = STATEMENT_DATES.map((d) => fmtDate(d)).join(", ");

  /**
   * THE COMPANY-LEVEL RECORD, and the live price. `/api/polycab` may move the
   * PRICE and nothing else (§6): a quote is not evidence about a dividend, a
   * pledge or a share count.
   */
  const live = usePolycabLive(BALANCES);
  const quote = live.quote;

  /**
   * THE PRICE IS DATED, AND ITS BASIS IS STRUCK ON THAT DATE. It used to carry
   * no date anywhere on this view — beside an "As of 31 Mar 2026" column, which
   * is the only date a reader would then have — and "last close" / "live" were
   * asserted whatever time the price was fetched. `live.dating` says when the
   * figure on screen was fetched, in India time, and whether that was inside
   * trading hours; the note under the heading carries the date in words.
   */
  const dt = live.dating;
  const fetchedOn = dt.istDate ? fmtDate(dt.istDate) : null;
  const fetchedWhen = dt.istDate && dt.istTime ? `${dt.istTime} IST on ${fmtDate(dt.istDate)}` : null;
  const storedWhy = live.state.status === "stored" ? ` (${live.state.reason})` : "";
  const priceBasis =
    dt.basis === "live" ? "live · BSE"
    : dt.basis === "fetching" ? "fetching"
    : dt.basis === "close" ? `last close · fetched ${fetchedOn}`
    : dt.basis === "intraday" ? `intraday · fetched ${fetchedOn}`
    : "undated · BSE";
  const storedIs =
    dt.inSession === null ? "It records no fetch time, so the session it belongs to cannot be stated."
    : dt.inSession ? `It was fetched at ${fetchedWhen}, DURING trading hours, so it may be an intraday price rather than a settled close.`
    : `It was fetched at ${fetchedWhen}, outside trading hours, so it is the last session's close.`;
  const priceWhy =
    dt.basis === "live"
      ? `Last traded on BSE at ${fetchedWhen}, inside trading hours — polled every 60s through /api/polycab and checked against the ISIN this book carries. On an exchange holiday it would be the last session's close; this page does not know the holiday calendar.`
      : dt.basis === "fetching"
        ? `Asking the exchange for the current price. Meanwhile the figure shown is the stored one. ${storedIs}`
        : live.state.status === "live"
          ? `Fetched from BSE just now, at ${fetchedWhen} — outside trading hours, so this is the last session's close rather than a moving price. Polled every 60s through /api/polycab and checked against the ISIN this book carries.`
          : `The committed daily snapshot of BSE's last traded price${storedWhy}. ${storedIs} The exchange's quote prints no session date; the fetch time is what dates it.`;

  /** THE DAY MOVE IS DERIVED, AND IT IS THE MOVE OF THE PRICE'S SESSION — never "today" by default. */
  const dayWhy = `The price against the previous session's close — DERIVED as last traded less the previous close BSE publishes, rather than taken from the change BSE prints (the daily refresh compares the two and records any gap). It is the move of the session the CMP belongs to${fetchedOn ? ` (fetched ${fetchedOn})` : ""}, which need not be today.`;

  /**
   * THE BLOCK AT THE MARKET PRICE BLENDS TWO DATES, AND SAYS SO — the
   * statement's share count and the price's fetch date, both in words under the
   * heading. No document here reports the balance after the statement, so this
   * is the statement's shares at a later price, not a measured value.
   */
  const gapDays = oneDate && dt.istDate ? daysBetween(oneDate, dt.istDate) : null;
  const mvNote = oneDate ? `${fmtDate(oneDate)} shares × CMP` : "statement shares × CMP";
  const mvWhy = `The shares the statement${STATEMENT_DATES.length === 1 ? "" : "s"} report${STATEMENT_DATES.length === 1 ? "s" : ""} at ${datesText || "an unstated date"} times the price under CMP${fetchedOn ? `, fetched ${fetchedOn}` : ""} — two dates${gapDays !== null ? ` ${fmtNum(Math.abs(gapDays))} days apart` : ""}. No document here reports the balance after the statement, so this is the statement's share count at a later price, not a measured value. It is the only figure on this page a live price may move; the statement value beside it stays the book's.`;

  const holdingRows = sortRows(rows, holdingView.sort, {
    security: ({ p }) => displaySecurity(p.security),
    holder: ({ a }) => a?.owner ?? null,
    account: ({ a }) => (a ? `${a.provider} ${a.accountNo}` : null),
    asOf: ({ a }) => a?.asOf ?? null,
    shares: ({ p }) => (typeof p.quantity === "number" ? p.quantity : null),
    mark: ({ p }) => (typeof p.quantity === "number" && p.quantity > 0 ? p.marketValue / p.quantity : null),
    value: ({ p }) => p.marketValue,
    cost: ({ p }) => p.costBasis ?? null,
    pledge: () => null,
    price: () => quote?.ltp ?? null,
    day: () => quote?.changePct ?? null,
    marketValue: ({ p }) => markedValue(typeof p.quantity === "number" ? p.quantity : null, quote),
  });

  /**
   * EVERY CLASSIFIED ACTION, ONE TABLE. `live.entitlements` are the dividends
   * with their derived amount; `live.shareActions` the bonuses, splits and
   * spin-offs — measured nil on this scrip today, and a row the day one lands.
   * Actions the classifier could not place are never filed under a kind nothing
   * stated; they are counted under the table instead.
   */
  const actionRowsAll: ActionRow[] = [
    ...live.entitlements.map((e) => ({ action: e.action, amount: e.amount, balanceReportedOnExDate: e.balanceReportedOnExDate, cash: true })),
    ...live.shareActions.map((a) => ({
      action: a, amount: null, cash: false,
      balanceReportedOnExDate: balanceReportedOn(a.exDate, BALANCES),
    })),
  ];
  /** Every action the store carries, for the per-row payment-date reason. */
  const allActions = [...live.dividends, ...live.shareActions, ...live.unclassified];
  /** The name of the one source the group pledge comes from, read off the store. */
  const pledgeSrc = live.quarters.find((q) => q.pledgeSource)?.pledgeSource ?? null;
  const pledgeSourceName = pledgeSrc
    ? (POLYCAB_SOURCES.find((s) => s.name.toLowerCase() === pledgeSrc.toLowerCase())?.name ?? pledgeSrc)
    : "the pledge's source";
  const wc = witnessCounts(live.quarters);
  /** The promoter sources the builder says fed this table, named off the store — never typed. */
  const promoterSourceNames = sourcesFor("promoter").map((s) => s.name).join(" and ") || "the sources this page reads";
  /**
   * THE ACTION ROWS SORT ON THE FIGURE, NEVER ON WHAT IS DRAWN. `Action` orders
   * on the exchange's own purpose line rather than on the clipped label, and the
   * entitlement on the derived rupee amount rather than on its ` *` marker — a
   * column that sorted on its rendering would put "₹9.9 Cr *" beside "₹9.9 Cr"
   * and call them different. An absent value sorts last in both directions.
   */
  const actionRows = sortRows(actionRowsAll, actionView.sort, {
    exDate: (r) => r.action.exDate ?? null,
    action: (r) => r.action.purpose ?? null,
    perShare: (r) => r.action.amountPerShare,
    record: (r) => r.action.recordDate ?? r.action.bookClosureFrom ?? null,
    paid: (r) => r.action.paymentDate ?? null,
    entitlement: (r) => r.amount,
  });
  /**
   * The quarter sorts on the ISO date the disclosure is AS OF, never on its
   * label: `Mar 2026` and `Jun 2026` compare alphabetically in the wrong order,
   * and a promoter series read backwards is the one thing a reader acts on here.
   */
  const quarterRows = sortRows(live.quarters, quarterView.sort, {
    quarter: (q) => q.asOf ?? null,
    holding: (q) => q.holdingPct,
    pledge: (q) => q.pledgePct,
    sources: (q) => q.witnesses,
  });
  const latestAsOf = live.promoter?.asOf ?? null;

  if (!BOOK_POLYCAB.length) {
    return (
      <div>
        <PageHeader eyebrow="Daily" title="Polycab" />
        <AbsentSection
          what="No ring-fenced Polycab holding in this book"
          needs="The promoter stock is folded into the main book — remove or check RINGFENCED_SECURITY_KEYS in build-book.mjs. When it is ring-fenced, it is carried in BOOK_POLYCAB and shown here."
        />
      </div>
    );
  }

  /**
   * THE MEMBER SCOPE (Stage 10di). The block is one demat today, Ajay's. Every
   * figure on this page — the holding, the entitlement each dividend gives it —
   * is that block's, so a scope that leaves out a demat holding it does not get
   * a page about another member's shares: it says whose they are. A scope that
   * takes part of a block of several demats is not possible on this book, and
   * is treated the same way rather than splitting figures this page strikes
   * over the whole block.
   */
  const outside = BOOK_POLYCAB.filter((p) => !inScopeAccount(scope.accountIds, p.accountId));
  if (outside.length) {
    const owners = [...new Set(outside.map((p) => ACCOUNT_BY_ID.get(p.accountId)?.ownerId).filter((o): o is string => !!o))];
    return (
      <div>
        <PageHeader eyebrow="Daily" title="Polycab" />
        <Card>
          <OutOfScope what="The ring-fenced Polycab holding" ownerIds={owners} />
        </Card>
      </div>
    );
  }

  const active = POLYCAB_VIEWS.find((v) => v.key === view)!;

  /**
   * "WHOLE SINCE LISTING" IS A CLAIM ABOUT A FETCH, SO IT IS GATED ON ONE.
   * `actionsComplete` is set only on a refresh that reached the exchange and read
   * its whole record; a stored record kept through a failed fetch keeps its rows
   * and loses this flag. Printed unconditionally, the subtitle would call a
   * possibly-truncated list complete — the same claim the bonus/split nil below
   * the table already refuses to make without that flag.
   */
  const actionsSub = live.complete
    ? POLYCAB_VIEWS.find((v) => v.key === "actions")!.cardSub
    : "The exchange's own corporate-action record, as last stored — the latest refresh could not confirm it is whole.";
  const cardSub = active.key === "actions" ? actionsSub : active.cardSub;

  /**
   * THE SOURCES LINE, under the two company-level tables — the only data on this
   * site that is not the family's own paperwork, so a reader has to be able to
   * see which source carried it and when it was last refreshed. One line, where
   * it used to be a paragraph.
   *
   * AND IT CREDITS THE SOURCES OF THE TABLE ABOVE IT, NOT ALL THREE. It listed
   * BSE, Tickertape and Screener under both tables, so a corporate-action record
   * only BSE supplies was credited to two aggregators that carry nothing on it.
   * `sourcesFor` reads which view each source feeds off the store.
   */
  const sourcesLine = (forView: string) => (
    // `data-prose-ok`: PROVENANCE, NOT AN EXPLAINER (Stage 10cp) — the only
    // figures on this site that are not the family's own paperwork, so which
    // source carried them, when, and that they are in no total stay on screen.
    <p className="shrink-0 border-t border-ink-700/60 px-4 py-2 text-[11px] leading-relaxed text-slate-500" data-polycab-sources data-prose-ok="sources">
      Sources:{" "}
      {sourcesFor(forView).map((s, i) => (
        <span key={s.url}>
          {i > 0 ? ", " : ""}
          <a className="text-champagne-400 hover:underline" href={s.url} target="_blank" rel="noreferrer" title={s.carries}>{s.name}</a>
        </span>
      ))}
      . Refreshed daily and in no total anywhere in this book. Last refreshed {fmtDate(live.retrievedAt.slice(0, 10))}.
    </p>
  );

  return (
    <div className="flex h-full flex-col">
      {/* THE CRUMB, THE TITLE AND THE ONE FACT THAT FRAMES THE PAGE. A reader who
          lands here from the nav has to be able to tell why a ₹12,000 Cr figure
          is not in the book's headline two pages over — an unexplained figure of
          that size reads as a contradiction. It was one pill among four; it is
          the only one left, because the other three were figures that now have
          columns of their own. */}
      <PageHeader eyebrow="Daily" title="Polycab"
        beside={
          <Pill tone="core" icon={<Shield className="h-3 w-3" />}>
            <span title="Promoter stock, ring-fenced out of every consolidated total, allocation and holdings table — the family are Polycab's promoters and track this separately from the managed book.">
              Ring-fenced · excluded from portfolio totals
            </span>
          </Pill>
        } />

      {/* ── ONE CARD, THREE TABLES, AND THE TOGGLE IS IN ITS OWN HEADER ───────
          The Private Market's master-table shape: the control that switches the
          table sits in the card that draws it, and ONLY the active table is in
          the DOM — which is what makes the page short, and what `check:pages`
          counts. The card hugs its content and scrolls INSIDE itself on a short
          window, so the page never scrolls and the headings stay pinned. */}
      {/* THE SUBTITLE IS THE TITLE'S HOVER (Stage 10cp), and keeps its handle
          there: `data-polycab-card-sub` now carries the sentence in `title`, so
          the check that the record is called whole only where it was fetched
          whole reads it where it went. */}
      <Card pad={false} className="flex min-h-0 flex-col"
        title={cardSub
          ? <span data-polycab-card-sub title={cardSub}>{active.cardTitle}</span>
          : active.cardTitle}
        right={
          <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
            role="tablist" aria-label="Which Polycab table to show">
            {POLYCAB_VIEWS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
                data-polycab-view={v.key} title={v.title}
                onClick={() => setView(v.key as PolycabView)}
                className={["whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  view === v.key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
                {v.label}
              </button>
            ))}
          </div>
        }>

        {/* ── THE HOLDING — what the family's own statement reports ──────────
            Every figure the five tiles and the hero printed is a column here,
            on the row it describes: the shares, the statement's mark and value,
            the cost that is not reported, the pledge that is not reported, the
            market price with its day move, and the block at that price. */}
        {view === "holding" && (
          <div className="mt-3 min-h-0 flex-1 overflow-auto">
            <table className="min-w-full whitespace-nowrap text-[13px]" data-polycab-table="holding">
              <thead className="sticky top-0 z-10 bg-ink-800">
                <Tr view={holdingView} className="border-b border-ink-700">
                  <SortHeader col="security" view={holdingView} align="left" pad={HEAD}>Security</SortHeader>
                  <SortHeader col="holder" view={holdingView} align="left" pad={HEAD}>Holder</SortHeader>
                  <SortHeader col="account" view={holdingView} align="left" pad={HEAD}>Demat account</SortHeader>
                  <SortHeader col="asOf" view={holdingView} align="left" pad={HEAD}>As of</SortHeader>
                  <SortHeader col="shares" view={holdingView} pad={HEAD}>Shares</SortHeader>
                  {/* THE DERIVATION RIDES ON THE COLUMN IT DESCRIBES, in the note's
                      hover. It used to be the `STATEMENT · as of` pill's; the pill
                      is gone and the claim is not. "statement" is written UNDER the
                      two headings it qualifies, so the mark and the value can never
                      be read as the market's. */}
                  <SortHeader col="mark" view={holdingView} pad={HEAD} note="statement" noteTitle={MARK_HOW}>Mark</SortHeader>
                  <SortHeader col="value" view={holdingView} pad={HEAD} note="statement"
                    noteTitle="The statement's own value for these shares — the book's figure, and excluded from every portfolio total.">Value</SortHeader>
                  <SortHeader col="cost" view={holdingView} pad={HEAD}>Cost</SortHeader>
                  {/* THIS DEMAT'S pledge, named as such in words under the heading —
                      the promoter GROUP's is on its own table, and a reader must
                      never take the second for the first. */}
                  <SortHeader col="pledge" view={holdingView} pad={HEAD} note="this demat" noteTitle={PLEDGE_WHY}>Pledged</SortHeader>
                  {/* THE PRICE'S BASIS AND ITS DATE, VISIBLE UNDER THE HEADING.
                      Still fetching is not the same claim as the exchange
                      refusing, neither is a fact about the holding, and a price
                      fetched during trading hours is not "the last close". */}
                  <SortHeader col="price" view={holdingView} pad={HEAD} note={priceBasis} noteTitle={priceWhy}>CMP</SortHeader>
                  <SortHeader col="day" view={holdingView} pad={HEAD} title={dayWhy}>Day</SortHeader>
                  {/* §6: the only figure on this page the price feed may move —
                      and a blend of the statement's date and the price's, in
                      words under the heading. */}
                  <SortHeader col="marketValue" view={holdingView} pad={HEAD} note={mvNote} noteTitle={mvWhy}>Market value</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {holdingRows.map(({ p, a }) => {
                  const qty = typeof p.quantity === "number" ? p.quantity : null;
                  const rowMark = qty !== null && qty > 0 ? p.marketValue / qty : null;
                  const atMarket = markedValue(qty, quote);
                  /* THIS ROW'S TWO DATES, in the Mark cell's hover — its balance
                     date and the pricing date its own statement prints. */
                  const when = markWhen(a?.asOf, p.priceAsOf);
                  const markTitle = when
                    ? `${when[0].toUpperCase()}${when.slice(1)} — the statement's own value divided by its units, not a live price.`
                    : `The statement's own value divided by its units, ${MARK_UNDATED} not a live price.`;
                  return (
                    <Tr view={holdingView} key={`${p.securityKey}-${p.accountId}`} className="hover:bg-ink-700/40"
                      data-polycab-demat-row={p.accountId}>
                      {/* NOT a link to /stock/<key>: that route redirects a
                          ring-fenced security back to this page, so a link would
                          return the reader to where they already are. */}
                      <td className={CELL}>
                        <div className="font-medium text-slate-100">{displaySecurity(p.security)}</div>
                        {p.isin && <div className="mono text-[10.5px] text-slate-500">{p.isin}</div>}
                      </td>
                      <td className={`${CELL} text-slate-300`} data-cell="holder">
                        {a?.owner ?? <AbsentCell reason="the statement for this account names no holder the registry resolves" />}
                      </td>
                      {/* The depository's own wording — the DP ID and the account
                          type — rides in the hover VERBATIM (§5): re-deriving it
                          in the presentation layer is how a fact stops matching
                          the document it came from. */}
                      <td className={`${CELL} text-slate-400`} data-cell="account" title={a?.providerEngagement ?? undefined}>
                        {a ? <><div>{a.provider}</div><div className="mono text-[10.5px] text-slate-500">{a.accountNo}</div></>
                          : <AbsentCell reason="this row's account is not in the registry" />}
                      </td>
                      <td className={`${CELL} text-slate-400`} data-cell="asOf">
                        {a?.asOf ? fmtDate(a.asOf) : <AbsentCell reason="this account states no report date" />}
                      </td>
                      <td className={`${CELL} text-right mono text-slate-200`} data-cell="shares">
                        {qty === null ? <AbsentCell reason="no statement here reports a share count for this row" /> : fmtNum(qty)}
                      </td>
                      <td className={`${CELL} text-right mono text-slate-400`} data-cell="mark" title={markTitle}>
                        {price(rowMark) ?? <AbsentCell reason="this row reports no quantity, so a per-share mark cannot be derived from its value" />}
                      </td>
                      <td className={`${CELL} text-right mono text-slate-100`} data-cell="value">{money(p.marketValue)}</td>
                      <td className={`${CELL} text-right mono text-slate-300`} data-cell="cost">
                        {typeof p.costBasis === "number" ? money(p.costBasis) : <AbsentCell reason={COST_WHY} />}
                      </td>
                      <td className={`${CELL} text-right mono`} data-cell="pledge"><AbsentCell reason={PLEDGE_WHY} /></td>
                      <td className={`${CELL} text-right mono text-slate-200`} data-cell="price">
                        {price(quote?.ltp) ?? <AbsentCell reason="the exchange published no price for this scrip on the last refresh" />}
                      </td>
                      <td className={`${CELL} text-right mono ${changeColor(quote?.changePct)}`}>
                        {typeof quote?.changePct === "number"
                          ? fmtPct(quote.changePct, { sign: true })
                          : <AbsentCell reason="the exchange published no previous close, so there is no day move to measure — a flat 0.00% would read as a measured one" />}
                      </td>
                      <td className={`${CELL} text-right mono text-slate-200`}>
                        {atMarket === null ? <AbsentCell reason="needs both a share count and a market price" /> : money(atMarket)}
                      </td>
                    </Tr>
                  );
                })}
              </tbody>
              {/* A TOTAL OF ONE ROW IS THE ROW AGAIN, so the footer draws only
                  when there is something to add up — the day a second promoter
                  statement lands, it appears with it. AND IT SAYS WHICH DATES IT
                  ADDS: two demats' statements are rarely struck on one day, and
                  a total across them with no as-of of its own would blend them
                  silently. */}
              {rows.length > 1 && (
                <tfoot className="sticky bottom-0 bg-ink-800" data-polycab-holding-foot>
                  <TrFoot view={holdingView} className="border-t-2 border-ink-600 px-3 py-2 text-left font-semibold text-slate-200"
                    label={<>Total · {rows.length} demats</>}
                    cells={{
                      asOf: (
                        <td key="asOf" data-cell="asOf" className="border-t-2 border-ink-600 px-3 py-2 text-left text-slate-400"
                          title={STATEMENT_DATES.length > 1 ? `These demats' statements are dated ${datesText}; every total in this row adds balances reported on different days.` : undefined}>
                          {oneDate ? fmtDate(oneDate)
                            : STATEMENT_DATES.length > 1 ? `${fmtNum(STATEMENT_DATES.length)} dates — blended`
                            : <AbsentCell reason="no statement here states a report date" />}
                        </td>
                      ),
                      shares: <td key="shares" className="border-t-2 border-ink-600 px-3 py-2 text-right mono font-semibold text-slate-200">{shares === null ? <AbsentCell reason="no row reports a share count" /> : fmtNum(shares)}</td>,
                      value: <td key="value" className="border-t-2 border-ink-600 px-3 py-2 text-right mono font-semibold text-slate-100">{money(mv)}</td>,
                      marketValue: <td key="marketValue" className="border-t-2 border-ink-600 px-3 py-2 text-right mono font-semibold text-slate-200">{money(markedValue(shares, quote))}</td>,
                    }} />
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── WHAT THE COMPANY DECLARED — every action, with the entitlement ─── */}
        {view === "actions" && (
          <>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="min-w-full whitespace-nowrap text-[13px]" data-polycab-table="actions" data-polycab-dividends>
                <thead className="sticky top-0 z-10 bg-ink-800">
                  <Tr view={actionView} className="border-b border-ink-700">
                    <SortHeader col="exDate" view={actionView} align="left" pad={HEAD}>Ex-date</SortHeader>
                    <SortHeader col="action" view={actionView} align="left" pad={HEAD}>Action</SortHeader>
                    <SortHeader col="perShare" view={actionView} pad={HEAD}>Per share</SortHeader>
                    <SortHeader col="record" view={actionView} align="left" pad={HEAD}
                      title="The record date where the exchange publishes one, and otherwise the book-closure window it published instead.">Record / book closure</SortHeader>
                    <SortHeader col="paid" view={actionView} align="left" pad={HEAD}>Paid</SortHeader>
                    <SortHeader col="entitlement" view={actionView} pad={HEAD}
                      title="This holding's share count times the declared amount per share. DERIVED — the statement reports a balance on one date and this book cannot say what was held on an ex-date either side of it, so this is an entitlement rather than income and is in no total on this page. A * marks every ex-date on which no statement in this book reports the balance — before the statement as much as after it.">
                      On this block · derived
                    </SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {actionRows.map((r, i) => {
                    const a = r.action;
                    const closure = a.bookClosureFrom
                      ? `${fmtDate(a.bookClosureFrom)}${a.bookClosureTo ? ` → ${fmtDate(a.bookClosureTo)}` : ""}`
                      : null;
                    return (
                      <Tr view={actionView} key={`${a.exDate}-${a.kind}-${i}`} className="hover:bg-ink-700/40"
                        data-ex-date={a.exDate ?? ""}
                        {...(r.cash ? { "data-polycab-dividend-row": "" } : { "data-polycab-share-row": a.kind })}>
                        <td className={`${CELL} text-slate-300`}>
                          {a.exDate ? fmtDate(a.exDate) : <AbsentCell reason="the exchange records no ex-date for this action" />}
                        </td>
                        <td className={`${CELL} text-slate-200`}>
                          {r.cash
                            ? <span title={a.purpose}>{a.purpose.replace(/\s*-\s*Rs\.?\s*-?\s*[\d.,]+\s*$/i, "")}</span>
                            : <span className="capitalize" title={a.purpose}>{a.kind}</span>}
                        </td>
                        <td className={`${CELL} text-right mono text-slate-200`}>
                          {r.cash
                            ? (a.amountPerShare === null
                              ? <AbsentCell reason="the exchange's purpose line states no amount per share for this action" />
                              : price(a.amountPerShare))
                            : (a.ratio ?? <AbsentCell reason="the exchange's purpose line states no ratio" />)}
                        </td>
                        <td className={`${CELL} text-slate-400`}>
                          {a.recordDate ? fmtDate(a.recordDate)
                            : closure ? <span title="book closure — the exchange published this window instead of a record date">{closure}</span>
                            : <AbsentCell reason="the exchange publishes neither a record date nor a book-closure window for this action" />}
                        </td>
                        {/* THE DASH SAYS WHY ON THIS ROW. One reason for every dash
                            was false of the rows the payment record did cover. */}
                        <td className={`${CELL} text-slate-400`} data-cell="paid">
                          {a.paymentDate ? fmtDate(a.paymentDate)
                            : !r.cash ? <AbsentCell reason="a bonus, split or spin-off pays no cash, so it has no payment date" />
                            : <AbsentCell reason={paymentDateWhy(a, allActions)} />}
                        </td>
                        {/* THE ENTITLEMENT, AND THE ASSUMPTION IT RESTS ON, ON THE
                            CELL. A snapshot is not a history: the share count is
                            what one statement reported on one date, so every
                            ex-date that statement is not dated on is marked —
                            before it as much as after it — rather than quietly
                            multiplied. */}
                        <td className={`${CELL} text-right mono text-slate-300`} data-cell="entitlement"
                          data-reported={r.cash && r.amount !== null ? String(r.balanceReportedOnExDate) : undefined}>
                          {!r.cash
                            ? <AbsentCell reason="a bonus, split or spin-off changes the share count and pays no cash" />
                            : r.amount === null
                              ? <AbsentCell reason="an entitlement needs both a declared amount per share and a share count" />
                              : (() => {
                                const gap = oneDate && a.exDate ? daysBetween(oneDate, a.exDate) : null;
                                const side = gap === null ? `on a day the statement${STATEMENT_DATES.length === 1 ? " is" : "s are"} not dated`
                                  : `${fmtNum(Math.abs(gap))} day${Math.abs(gap) === 1 ? "" : "s"} ${gap < 0 ? "before" : "after"} the statement date`;
                                const basis = `${shares === null ? "the reported share count" : `${fmtNum(shares)} shares`} × ${price(a.amountPerShare)} per share`;
                                const never = "Derived, and never a figure for cash received — what actually arrived, and what TDS came off it, is a bank record no exchange can answer.";
                                return (
                                  <span
                                    className={r.balanceReportedOnExDate ? "" : "text-slate-500"}
                                    title={
                                      r.balanceReportedOnExDate
                                        ? `${basis}, on the balance the statement reports on the ex-date itself (${datesText}). ${never}`
                                        : `This ex-date falls ${side} (${datesText || "unknown"}). A statement of holding is a snapshot, so the balance held on the ex-date is NOT reported by any document in this book: ${basis} applies the declared amount to the share count that statement reports, and nothing here says those shares were held on the ex-date. ${never}`
                                    }
                                  >
                                    {money(r.amount)}{r.balanceReportedOnExDate ? "" : " *"}
                                  </span>
                                );
                              })()}
                        </td>
                      </Tr>
                    );
                  })}
                  {actionRows.length === 0 && (
                    <tr>
                      <td colSpan={ACTION_COLS.length} className={`${CELL} text-[12px] text-slate-500`}>
                        <AbsentCell reason="the exchange's corporate-action record could not be read on the last refresh, so no declared action is listed" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* BONUS, SPLIT AND SPIN-OFF — A MEASURED NIL, WHICH IS NOT AN
                ABSENCE. Gated on `actionsComplete`, which the builder sets only
                on a run that reached the exchange: a truncated fetch and a
                company that never declared one produce the identical empty
                list, and only the fetch knows which. */}
            <p className="shrink-0 border-t border-ink-700/60 px-4 py-2 text-[12px] text-slate-400" data-polycab-share-actions>
              {live.shareActions.length > 0
                ? <span title="A bonus, split or spin-off changes the share count and pays no cash.">{fmtNum(live.shareActions.length)} share-count action{live.shareActions.length === 1 ? "" : "s"} above</span>
                : live.measuredNil
                  ? <span className="font-medium text-slate-300"
                      title={`The exchange's record runs from listing and all ${fmtNum(live.dividends.length)} of its actions are dividends.`}>
                      No bonus, split or spin-off has ever been declared on this scrip</span>
                  : <AbsentCell reason="the exchange's corporate-action record could not be fetched whole on the last refresh, so no bonus or split can be reported either way — a truncated record and a company that declared none look identical" />}
              {live.unclassified.length > 0 && (
                <> {fmtNum(live.unclassified.length)} further action(s) the classifier did not place are listed in <span className="mono">docs/POLYCAB-LIVE.md</span> rather than filed under a kind nothing stated.</>
              )}
            </p>
            {sourcesLine("actions")}
          </>
        )}

        {/* ── THE PROMOTER GROUP, AS IT DISCLOSES ITSELF ──────────────────────
            The newest quarter is the first row; its two cells carry the handles
            the tiles used to. "group" is written UNDER both headings, because
            this table is the one place on the page a reader could take a group
            figure for a statement about the family's own demat. */}
        {view === "promoter" && (
          <>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="min-w-full whitespace-nowrap text-[13px]" data-polycab-table="promoter" data-polycab-quarters>
                <thead className="sticky top-0 z-10 bg-ink-800">
                  <Tr view={quarterView} className="border-b border-ink-700">
                    <SortHeader col="quarter" view={quarterView} align="left" pad={HEAD}>Quarter</SortHeader>
                    {/* EACH PERCENTAGE SAYS WHAT IT IS A PERCENTAGE OF, under its
                        heading — the holding of all Polycab's shares, the pledge
                        of the group's own holding — and the holding's caption
                        COUNTS its witnesses rather than claiming two for every
                        quarter, which it did over six carried by one. */}
                    <SortHeader col="holding" view={quarterView} pad={HEAD} note="promoter group · % of all shares"
                      noteTitle={`The promoter group's holding, as a share of all of Polycab's shares, from ${promoterSourceNames}. Where both carry a quarter they must agree within 0.05pp or neither figure is published — ${fmtNum(wc.both)} of these ${fmtNum(wc.total)} quarters are carried by both — and a quarter only one source carries (${fmtNum(wc.one)} here) is published unchecked against a second. The Sources column counts, per quarter, how many carried it.`}>Promoter holding</SortHeader>
                    <SortHeader col="pledge" view={quarterView} pad={HEAD} note="group, not this demat · % of group holding"
                      noteTitle={`${pledgeSourceName}'s “Promoter Holding Pledged” — the pledged part of the promoter GROUP's own holding, from one source, which says so. The NSDL statement behind the family's own holding prints no pledge column, so this is not a statement about that account.`}>Pledged</SortHeader>
                    <SortHeader col="sources" view={quarterView} pad={HEAD}
                      title="How many independent sources carried the holding for this quarter.">Sources</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {quarterRows.map((q) => {
                    const latest = q.asOf === latestAsOf;
                    return (
                      <Tr view={quarterView} key={q.asOf} className="hover:bg-ink-700/40" data-polycab-quarter-row={q.asOf}>
                        <td className={`${CELL} text-slate-300`}>{q.quarter ?? fmtDate(q.asOf)}</td>
                        <td className={`${CELL} text-right mono text-slate-200`} data-cell="holding" {...(latest ? { "data-polycab-holding": "" } : {})}>
                          {q.holdingPct === null
                            ? <AbsentCell reason={holdingWhy(q)} />
                            : fmtPct(q.holdingPct)}
                        </td>
                        <td className={`${CELL} text-right mono text-slate-200`} data-cell="pledge" {...(latest ? { "data-polycab-pledge": "" } : {})}>
                          {q.pledgePct === null
                            ? <AbsentCell reason={pledgeWhy(q, live.quarters, pledgeSourceName)} />
                            : fmtPct(q.pledgePct)}
                        </td>
                        <td className={`${CELL} text-right mono text-slate-500`} data-cell="sources">{q.witnesses}</td>
                      </Tr>
                    );
                  })}
                  {quarterRows.length === 0 && (
                    <tr>
                      <td colSpan={QUARTER_COLS.length} className={CELL}>
                        <AbsentCell reason="no promoter disclosure could be read on the last refresh, and none is stored" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {sourcesLine("promoter")}
          </>
        )}
      </Card>
    </div>
  );
}
