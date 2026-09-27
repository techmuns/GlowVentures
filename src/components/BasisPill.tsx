import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { staleAccounts, stalenessNote } from "@/lib/accounts";

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
    unpriceable ? `${unpriceable} have no listing at all (cash and the liquid-fund sweep) and never will` : null,
  ].filter(Boolean).join(" · ");

  if (statement || basis === "STATEMENT") {
    const why = statement
      ? "This page reads the statement figures always. Its totals must tie to the source documents, so the live price feed is deliberately not applied here."
      : quotesStatus === "loading"
        ? "Fetching live prices — every figure is on its statement mark until they land."
        : "Live prices unavailable, so every figure is on its statement mark. Nothing here is stale by accident; it is the printed book.";
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
