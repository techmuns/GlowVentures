import { useEffect, useMemo, useState } from "react";
import { POLYCAB_LIVE, type PolycabAction, type PolycabQuarter, type PolycabQuote } from "@/data/polycabLive";

/**
 * THE LIVE COMPANY-LEVEL RECORD BEHIND THE RING-FENCED HOLDING.
 *
 * Two layers, and the split is the whole design:
 *
 *   STORED   `src/data/polycabLive.ts`, committed every morning by
 *            `.github/workflows/polycab.yml`. The corporate-action record, the
 *            promoter holding and pledge, and the last settled close. It renders
 *            with NO NETWORK, which is what keeps this page free of blank tiles
 *            in a preview, in the headless sweep, and on a morning an upstream
 *            is down.
 *   LIVE     `/api/polycab`, polled while the page is open, for the price during
 *            a session. The stored close is a fact about the last settled day.
 *
 * `IndexStrip` already draws exactly this distinction and this follows it,
 * including the part that is easy to get wrong: **the live layer may move the
 * PRICE and nothing else.** A quote is not evidence about a dividend, a pledge
 * or a share count, so the live response is allowed to replace `quote` and is
 * never allowed to touch anything else (§6).
 *
 * ── AND THE COMPANY IS NOT THE DEMAT ───────────────────────────────────────
 *
 * Everything in this module is about POLYCAB THE COMPANY: what it declared, what
 * its promoter group disclosed. None of it is a statement about what the
 * family's own ICICI NSDL demat reports, which carries a balance and a value and
 * no encumbrance column at all. A promoter-GROUP pledge of 0% is a real
 * measurement about the group this holding belongs to and is NOT a statement
 * that this demat's balance is unencumbered — so the page renders the two in
 * separate cards and this module never returns a figure that could fill the
 * statement card's dashes.
 */

export type LiveState =
  | { status: "loading" }
  | { status: "live"; quote: PolycabQuote; retrievedAt: string }
  | { status: "stored"; reason: string };

/**
 * THREE STATES, NEVER TWO.
 *
 * A panel still fetching must not say the exchange did not answer, and a feed
 * that failed must not read as a fact about the holding — the defect this repo
 * already paid for on Today's movers and on the company page's ratio table,
 * where a still-loading panel asserted the security publishes no ratios. So
 * `loading` is distinct from `stored`, and `stored` carries the CAUSE.
 *
 * `stored` is not an error state. The committed close is a real, dated figure;
 * falling back to it is the page working as designed, and the reason string says
 * whether that is because the market is shut, the endpoint is absent (a local
 * `vite preview` runs no Function) or the exchange refused.
 */
export function usePolycabQuote(pollMs = 60000): LiveState {
  const [state, setState] = useState<LiveState>({ status: "loading" });
  const isin = POLYCAB_LIVE.bookIsin;

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/polycab?isin=${encodeURIComponent(isin)}`, { headers: { accept: "application/json" } });
        if (!live) return;
        if (!r.ok) { setState({ status: "stored", reason: `the exchange proxy answered HTTP ${r.status}` }); return; }
        const d = await r.json();
        if (!live) return;
        if (d?.ok && d.quote && typeof d.quote.ltp === "number") {
          setState({ status: "live", quote: d.quote as PolycabQuote, retrievedAt: String(d.retrievedAt ?? "") });
        } else {
          // The endpoint's own code, passed through rather than paraphrased:
          // IDENTITY_MISMATCH and UPSTREAM_ERROR send a reader to completely
          // different places, which is `upstreamStatus.ts`'s rule.
          setState({ status: "stored", reason: String(d?.detail || d?.reason || "the exchange returned no price") });
        }
      } catch (e) {
        if (live) setState({ status: "stored", reason: `the exchange could not be reached — ${String((e as Error)?.message ?? e)}` });
      }
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => { live = false; clearInterval(id); };
  }, [isin, pollMs]);

  return state;
}

/** The quote actually on screen, and whether it is the live one or the stored one. */
export function effectiveQuote(state: LiveState): { quote: PolycabQuote | null; live: boolean } {
  if (state.status === "live") return { quote: state.quote, live: true };
  return { quote: POLYCAB_LIVE.quote, live: false };
}

/** Cash actions, newest first. */
export function dividendActions(): PolycabAction[] {
  return (POLYCAB_LIVE.corporateActions ?? []).filter((a) => a.kind === "dividend");
}

/**
 * EVERYTHING THAT CHANGES A SHARE COUNT rather than paying cash.
 *
 * The negation is NOT used here, deliberately, and that is the opposite of the
 * choice the statement card makes one component over. There, an event whose kind
 * the report did not name must still be shown, so the filter is "not cash". Here
 * the kinds come from a CLASSIFIER over the exchange's own purpose string, and
 * `other` means precisely "this classifier did not recognise it" — folding those
 * into the bonus/split table would assert a share-count change that nothing
 * stated. They are counted and named instead, by `unclassifiedActions`.
 */
export function shareCountActions(): PolycabAction[] {
  return (POLYCAB_LIVE.corporateActions ?? []).filter((a) => a.kind === "bonus" || a.kind === "split" || a.kind === "spinoff");
}

/** Actions the classifier could not place — counted, never hidden, never guessed. */
export function unclassifiedActions(): PolycabAction[] {
  return (POLYCAB_LIVE.corporateActions ?? []).filter((a) => a.kind === "other" || a.kind === "rights");
}

/**
 * IS "NO BONUS OR SPLIT HAS EVER BEEN DECLARED" A MEASUREMENT?
 *
 * Only where THIS store's record was fetched whole. A truncated response and a
 * company that genuinely never declared one produce the identical empty list, so
 * the claim rests on `actionsComplete` — which the builder sets only on a run
 * that reached the exchange, and never on a stored record kept through a failed
 * fetch. Without it the page says the record could not be refreshed, which is a
 * different sentence entirely.
 */
export function shareActionsMeasuredNil(): boolean {
  return POLYCAB_LIVE.actionsComplete === true && shareCountActions().length === 0;
}

/** The newest quarter carrying a promoter figure. */
export function latestPromoter(): PolycabQuarter | null {
  const qs = POLYCAB_LIVE.promoterQuarters ?? [];
  return qs.find((q) => q.holdingPct !== null || q.pledgePct !== null) ?? null;
}

export interface Entitlement {
  action: PolycabAction;
  /** Per-share × the share count the statement reports. DERIVED, never received. */
  amount: number | null;
  /** Did the statement's own date fall on or after the ex-date? */
  exDateWithinStatement: boolean;
}

/**
 * WHAT THIS HOLDING WOULD HAVE BEEN ENTITLED TO — DERIVED, AND NEVER "RECEIVED".
 *
 * The exchange states a dividend PER SHARE. The rupee figure for this holding is
 * that times a share count, and the share count comes from ONE statement dated
 * at one moment. A snapshot is not a history: this book can say what was held on
 * the statement's own date and cannot say what was held on an ex-date three
 * months either side of it.
 *
 * So every row carries `exDateWithinStatement`, and the page renders the amount
 * as an ENTITLEMENT with the assumption stated rather than as income. It is
 * never summed into `dividendReceived`, never added to any book total, and never
 * called "received" — because whether the money arrived, and what TDS came off
 * it, is a bank and statement fact that no exchange record can answer.
 *
 * This is the same standing the fund look-through has: a derived figure rendered
 * beside measured ones, marked as derived in words rather than in a tooltip, and
 * in no total on the page.
 */
export function entitlements(shares: number | null, statementAsOf: string | null): Entitlement[] {
  return dividendActions().map((action) => ({
    action,
    amount: shares !== null && action.amountPerShare !== null ? shares * action.amountPerShare : null,
    exDateWithinStatement:
      !!statementAsOf && !!action.exDate && action.exDate <= statementAsOf,
  }));
}

/** The live (or last settled) value of the block, at the mark actually on screen. */
export function markedValue(shares: number | null, quote: PolycabQuote | null): number | null {
  return shares !== null && quote && typeof quote.ltp === "number" ? shares * quote.ltp : null;
}

/** How stale is the committed store, in whole days? Null where it cannot be told. */
export function storeAgeDays(now = Date.now()): number | null {
  const t = Date.parse(POLYCAB_LIVE.retrievedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

export const POLYCAB_SOURCES = POLYCAB_LIVE.sources;

/** Memoised view of everything the page needs, so the arithmetic runs once. */
export function usePolycabLive(shares: number | null, statementAsOf: string | null) {
  const state = usePolycabQuote();
  const { quote, live } = effectiveQuote(state);
  return useMemo(
    () => ({
      state, quote, live,
      dividends: dividendActions(),
      shareActions: shareCountActions(),
      unclassified: unclassifiedActions(),
      measuredNil: shareActionsMeasuredNil(),
      promoter: latestPromoter(),
      quarters: POLYCAB_LIVE.promoterQuarters ?? [],
      entitlements: entitlements(shares, statementAsOf),
      markedValue: markedValue(shares, quote),
      retrievedAt: POLYCAB_LIVE.retrievedAt,
      agreement: POLYCAB_LIVE.promoterAgreement,
      identity: POLYCAB_LIVE.identity,
    }),
    [state, quote, live, shares, statementAsOf],
  );
}
