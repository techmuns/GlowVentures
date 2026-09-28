import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { staleAccounts, stalenessNote } from "@/lib/accounts";
import { dedupedPositions } from "@/lib/analytics";
import type { Portfolio } from "@/lib/types";

/**
 * ── WHEN EVERY RUPEE OF THE CURRENT VALUE WAS STRUCK ───────────────────────
 *
 * `portfolio.asOf` is the NEWEST account date in the book, and on this drop that
 * is 2026-08-29 — the date of two custody accounts that carry no valued position
 * at all. Printed as "Marks as of 2026-08-29" beside a ₹713 Cr figure it dated
 * the whole book to a day on which not one rupee of it was marked (C-01): the
 * values are statement marks struck 31 Mar → 13 Aug, plus AMFI's published NAV
 * on the mutual funds, plus any live quote. CLAUDE.md §3: *"Don't present the
 * blend as one clean date."*
 *
 * So this splits the CONSOLIDATED current value (each `dedupeGroup` once, the
 * set `portfolio.totalValue` is summed over) by the basis each holding is on
 * and the date that basis carries:
 *
 *   · live      — a quote the feed returned this session;
 *   · nav       — AMFI's published NAV, on its own publication date;
 *   · statement — the mark the holding's own statement printed, on that
 *                 account's report date.
 *
 * A holding with a nil value dates nothing and is skipped — a zero is measured,
 * but a date beside it would claim a mark that values nothing. The three parts
 * add to the total by construction, because every non-zero row lands in exactly
 * one of them.
 */
export type ValuationDates = {
  /** Statement marks, oldest date first, with the value struck on each. */
  statement: { date: string; value: number; count: number }[];
  /** AMFI's published NAVs, by publication date. */
  nav: { date: string; value: number; count: number }[];
  /** Holdings carrying a live quote this session. */
  live: { value: number; count: number };
};

export function valuationDates(portfolio: Pick<Portfolio, "positions" | "accounts">): ValuationDates {
  const asOf = new Map(portfolio.accounts.map((a) => [a.accountId, a.asOf]));
  const st = new Map<string, { value: number; count: number }>();
  const nv = new Map<string, { value: number; count: number }>();
  const live = { value: 0, count: 0 };
  const add = (m: Map<string, { value: number; count: number }>, d: string, v: number) => {
    const e = m.get(d) ?? { value: 0, count: 0 };
    e.value += v; e.count += 1; m.set(d, e);
  };
  for (const p of dedupedPositions(portfolio.positions)) {
    if (!(Math.abs(p.marketValue) > 0)) continue;
    if (p.live) { live.value += p.marketValue; live.count += 1; continue; }
    if (p.navPriced && p.navDate) { add(nv, p.navDate, p.marketValue); continue; }
    const d = asOf.get(p.accountId);
    if (d) add(st, d, p.marketValue);
  }
  const sorted = (m: Map<string, { value: number; count: number }>) =>
    [...m.entries()].map(([date, e]) => ({ date, ...e })).sort((a, b) => a.date.localeCompare(b.date));
  return { statement: sorted(st), nav: sorted(nv), live };
}

/**
 * WHAT THE CURRENT VALUE IS STRUCK ON, IN WORDS — the statement marks' span,
 * AMFI's NAV date and any live quotes, each with its value. One sentence for
 * the top bar's hover and Morning CIO's value tile (MNT-7 · CK-C1), so the two
 * cannot date one figure two ways.
 */
export function valuationNote(vd: ValuationDates, money: (n: number) => string): string {
  const stV = vd.statement.reduce((a, x) => a + x.value, 0);
  const navV = vd.nav.reduce((a, x) => a + x.value, 0);
  const navN = vd.nav.reduce((a, x) => a + x.count, 0);
  const parts = [
    vd.statement.length
      ? `${money(stV)} is on statement marks struck on ${vd.statement.length} date${vd.statement.length === 1 ? "" : "s"}, ${vd.statement[0].date}${vd.statement.length > 1 ? ` to ${vd.statement[vd.statement.length - 1].date}` : ""} — each account's own report date`
      : null,
    navN ? `${money(navV)} on AMFI's published NAV of ${vd.nav.map((x) => x.date).join(", ")} (${navN} fund holding${navN === 1 ? "" : "s"})` : null,
    vd.live.count ? `${money(vd.live.value)} on live quotes (${vd.live.count} holding${vd.live.count === 1 ? "" : "s"})` : null,
  ].filter(Boolean);
  return parts.length ? `The current value is not one date: ${parts.join("; ")}.` : "";
}

/** `31 Mar` — or `31 Mar 2025` where the span crosses a year. UTC, so no zone moves a date. */
function shortDay(iso: string, withYear: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** The span a set of dates covers, compactly: `31 Mar–13 Aug`, or one date. */
export function dateSpan(dates: readonly string[]): string {
  if (!dates.length) return "";
  const first = dates[0], last = dates[dates.length - 1];
  const withYear = first.slice(0, 4) !== last.slice(0, 4);
  return first === last ? shortDay(first, withYear) : `${shortDay(first, withYear)}–${shortDay(last, withYear)}`;
}

/**
 * States what a page's figures are actually based on.
 *
 * THREE THINGS MAKE A BARE "as of <date>" WRONG HERE, and this names all three
 * rather than picking one:
 *
 *   • WHICH BASIS. STATEMENT is as the managers printed it and ties to the
 *     archive to the rupee. LIVE is the same holdings marked to market now, and
 *     matches no statement. A reader who cannot tell which one they are looking
 *     at cannot check anything, so the pill leads with it.
 *   • WHAT THE LIVE LAYER TOUCHED. Prices move market value, day change and
 *     unrealised P&L. Cost basis, realised gains, dividends and cash flows come
 *     from the statements on either basis, because no price is evidence about
 *     them.
 *   • WHEN EACH ACCOUNT WAS DATED. Statements arrive per account, per platform,
 *     on their own schedule, so a STATEMENT-basis total is a BLEND of report
 *     dates — Green Lantern closes 2026-06-25, the others 2026-07-10.
 *     `portfolio.asOf` is only the newest of them. On LIVE basis that skew is
 *     gone for prices (every quote is from the same moment) but survives in
 *     every field the feed does not touch, so the pill keeps showing it.
 *
 * `statement` forces the STATEMENT label on a page that must reconcile
 * (Capital Gains, Data Audit, Ledger Insights), whatever the feed is doing.
 */
export function BasisPill({ liveText, hint, statement = false }: {
  liveText: string;
  hint?: string;
  /** This page always reads statement figures — never label it LIVE. */
  statement?: boolean;
}) {
  const { portfolio, basis, quotesStatus, quotesAsOf, livePriced, notLive, liveWithheld, unpriceable } = usePortfolio();
  if (!portfolio) return null;

  const stale = staleAccounts(portfolio);
  const staleNote = stalenessNote(portfolio);
  const stalePill = stale.length ? (
    <Pill tone="warn">
      <span title={staleNote ?? undefined}>
        {stale.length} account{stale.length === 1 ? "" : "s"} behind
      </span>
    </Pill>
  ) : null;

  // Securities that will never quote — cash, receivables, the liquid-fund sweep.
  // Said separately from `notLive`, which is a feed gap that can close.
  //
  // AND A QUOTE THE CORPORATE-ACTION CHECK HELD BACK IS NEITHER (DL-9). It
  // arrived; pairing it with the statement's share count could be wrong, so the
  // holding keeps its mark. Counted among "no quote in this round" it told a
  // reader to wait for a feed that had already answered.
  const coverage = [
    livePriced ? `${livePriced} securities priced live` : null,
    notLive ? `${notLive} have a symbol but no quote in this round — still on their statement mark` : null,
    liveWithheld ? `${liveWithheld} had a live quote that the corporate-action check held back, because the statement's share count may not match it — still on their statement mark; each holding's page gives the reason` : null,
    // WHAT THEY ARE IS NOT GUESSED (MNT-9): "cash and the liquid-fund sweep" was
    // a guess about a set that is mostly fund units and unlisted shares. The
    // fact is the one the count is struck on — no NSE trading symbol resolves.
    unpriceable ? `${unpriceable} resolve no NSE trading symbol, so no quote can ever price them` : null,
  ].filter(Boolean).join(" · ");

  if (statement || basis === "STATEMENT") {
    /**
     * "EVERY FIGURE IS ON ITS STATEMENT MARK" WAS FALSE WHILE IT WAS PRINTED.
     * `applyFundNavs` runs whether or not the quote feed answers, so the
     * mutual funds AMFI publishes a NAV for are on that NAV on this basis —
     * a published price, not a mark any statement printed (MNT-8). The
     * sentence names them, with the NAV's own date, rather than claiming the
     * printed book.
     */
    const vd = valuationDates(portfolio);
    const navCount = vd.nav.reduce((a, x) => a + x.count, 0);
    const navNote = navCount
      ? ` except ${navCount} fund holding${navCount === 1 ? "" : "s"} on AMFI's published NAV of ${vd.nav.map((x) => x.date).join(", ")} — a published price, not a statement mark`
      : "";
    const why = statement
      ? "This page reads the statement figures always. Its totals must tie to the source documents, so the live price feed is deliberately not applied here."
      : quotesStatus === "loading"
        ? `Fetching live prices — until they land no figure carries a live price: holdings are on their statement marks${navNote}.`
        : `Live prices unavailable, so no figure carries a live price: holdings are on their statement marks${navNote}. Nothing has been substituted for a live price.`;
    return (
      <span className="inline-flex items-center gap-1.5">
        <Pill tone="info">
          <span data-basis-pill="statement" title={[why, coverage || null, staleNote].filter(Boolean).join(" ")}>
            STATEMENT · as of {portfolio.asOf || "—"}
          </span>
        </Pill>
        {stalePill}
      </span>
    );
  }

  const clock = quotesAsOf ? new Date(quotesAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pill tone="info">
        <span data-basis-pill="live" title={[
          hint,
          "LIVE basis: market value, day change and unrealised P&L are marked to market now. Cost basis, realised gains, dividends and cash flows stay exactly as the statements report them.",
          clock ? `Quotes pulled at ${clock}.` : null,
          coverage || null,
          staleNote,
        ].filter(Boolean).join(" ")}>
          LIVE · {liveText}
        </span>
      </Pill>
      {stalePill}
    </span>
  );
}
