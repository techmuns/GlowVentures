import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { staleAccounts, stalenessNote } from "@/lib/accounts";

/**
 * States what a page's figures are actually based on.
 *
 * Two things make a single "as of <date>" wrong here, and this names both rather
 * than picking one:
 *
 *   • Live prices move anything price-derived, but not cost basis, realised
 *     gains or the private book.
 *   • Accounts are dated individually. Statements arrive per account, per
 *     platform, on their own schedule, so a consolidated total is a blend of
 *     report dates. `portfolio.asOf` is only the newest of them — the accounts
 *     behind it get their own pill instead of being averaged into silence.
 */
export function BasisPill({ liveText, hint }: { liveText: string; hint?: string }) {
  const { portfolio, quotesStatus, quotesAsOf, livePriced, notLive } = usePortfolio();
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

  if (quotesStatus !== "live") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Pill tone="info">
          <span title={quotesStatus === "loading" ? "Fetching live prices…" : "Live prices unavailable — every figure is on its statement mark."}>
            as of {portfolio.asOf || "—"}
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
        <span title={[
          hint,
          `${livePriced} securities priced live${clock ? ` at ${clock}` : ""}.`,
          notLive ? `${notLive} carry no live quote and stay on their statement mark.` : null,
          staleNote,
        ].filter(Boolean).join(" ")}>
          {liveText}
        </span>
      </Pill>
      {stalePill}
    </span>
  );
}
