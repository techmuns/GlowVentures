import { useEffect, useMemo, useState } from "react";
import { POLYCAB_LIVE, type PolycabAction, type PolycabLive, type PolycabQuarter, type PolycabQuote } from "@/data/polycabLive";
import { sumOrNull } from "@/lib/analytics";
import { sessionPhase } from "../../shared/polycabSources.mjs";

export { sessionPhase };

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

/**
 * WHICH SESSION THE PRICE ON SCREEN BELONGS TO, AND HOW THE PAGE MAY DESCRIBE IT.
 *
 * The exchange's header quote carries NO session date, so the price was shown
 * beside a statement dated 31 Mar 2026 with no date of its own, and labelled
 * "the last settled close" / "live" without anything checking either word. Both
 * are claims about a TIME, so both are now struck on one:
 *
 *   live       the endpoint answered AND its answer was fetched inside trading
 *              hours. Outside them it is the last session's close, fetched
 *              just now — never "live", which a weekend reader would take for
 *              a price that is moving.
 *   close      the stored price, fetched outside trading hours.
 *   intraday   the stored price, fetched DURING trading hours — possibly an
 *              intraday figure, never called a settled close.
 *   undated    the store records no fetch time, so nothing dates the price and
 *              the page says so rather than inheriting another figure's date.
 *   fetching   the live answer is still on its way; the dating is the stored
 *              price's, because that is the figure on screen meanwhile.
 *
 * Exchange holidays are not known (see `sessionPhase`), so a holiday fetch
 * inside trading hours is described as possibly intraday — the weaker claim.
 */
export type QuoteBasis = "live" | "close" | "intraday" | "undated" | "fetching";
export interface QuoteDating {
  basis: QuoteBasis;
  /** When the price on screen was fetched, ISO — null where nothing records it. */
  fetchedAt: string | null;
  /** That moment in India time, `YYYY-MM-DD` / `HH:MM`. */
  istDate: string | null;
  istTime: string | null;
  /** Whether that moment fell inside trading hours. Null where undated. */
  inSession: boolean | null;
}
export function quoteDating(state: LiveState, stored: Pick<PolycabLive, "quote"> = POLYCAB_LIVE): QuoteDating {
  const at = (iso: string | null | undefined) => {
    const ph = sessionPhase(iso);
    return ph
      ? { fetchedAt: String(iso), istDate: ph.istDate, istTime: ph.istTime, inSession: ph.inSession }
      : { fetchedAt: null, istDate: null, istTime: null, inSession: null };
  };
  if (state.status === "live") {
    const d = at(state.retrievedAt);
    return { ...d, basis: d.inSession === null ? "undated" : d.inSession ? "live" : "close" };
  }
  const d = at(stored.quote?.fetchedAt ?? null);
  if (state.status === "loading") return { ...d, basis: "fetching" };
  return { ...d, basis: d.inSession === null ? "undated" : d.inSession ? "intraday" : "close" };
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

/**
 * ONE STATEMENT'S BALANCE: the shares it reports and the date it reports them
 * at. The holding table is written over a COLLECTION of these, so a second
 * promoter statement — dated differently — is a second balance, never folded
 * into the first one's date.
 */
export interface StatementBalance { shares: number | null; asOf: string | null }

/** The share count behind every figure struck on the block: `sumOrNull`, never `?? 0`. */
export function blockShares(balances: readonly StatementBalance[]): number | null {
  return sumOrNull(balances.map((b) => b.shares));
}

/** The distinct statement dates the block's share count is taken from, oldest first. */
export function statementDates(balances: readonly StatementBalance[]): string[] {
  return [...new Set(balances.map((b) => b.asOf).filter((d): d is string => !!d))].sort();
}

/**
 * DOES A STATEMENT IN THIS BOOK REPORT THE BALANCE HELD ON THIS DATE?
 *
 * A statement of holding is a SNAPSHOT: it reports the balance on its own date
 * and says nothing about any other day, before it or after it. So the answer is
 * yes only where EVERY balance behind the figure is dated on exactly that day —
 * one demat reported on the date and another not is a figure half-measured.
 */
export function balanceReportedOn(date: string | null, balances: readonly StatementBalance[]): boolean {
  return !!date && balances.length > 0 && balances.every((b) => b.asOf === date);
}

export interface Entitlement {
  action: PolycabAction;
  /** Per-share × the share count the statements report. DERIVED, never received. */
  amount: number | null;
  /**
   * Does a statement report the balance held ON the ex-date? True only where
   * every statement behind the share count is dated on the ex-date — which, on
   * a book holding one snapshot, is almost never.
   */
  balanceReportedOnExDate: boolean;
  /** The statement dates the share count was taken from. */
  statementDates: string[];
}

/**
 * WHAT THIS HOLDING WOULD HAVE BEEN ENTITLED TO — DERIVED, AND NEVER "RECEIVED".
 *
 * The exchange states a dividend PER SHARE. The rupee figure for this holding is
 * that times a share count, and the share count comes from a statement dated at
 * one moment. A snapshot is not a history: this book can say what was held on
 * the statement's own date and cannot say what was held on an ex-date either
 * side of it.
 *
 * THE FLAG IS TWO-SIDED, AND IT WAS NOT. It used to be `exDate <= statementAsOf`
 * — so seven ex-dates from 2019 to 2025 rendered as if the 31 Mar 2026 statement
 * vouched for the balance on each, and only the one ex-date AFTER it was marked.
 * The statement reports nothing about 2019 exactly as it reports nothing about
 * June 2026; the store's own promoter series fell 1.96pp and 1.49pp right after
 * two of those ex-dates, which is precisely where the balance is uncertain. Now
 * an ex-date is unmarked only where a statement is dated ON it.
 *
 * The amount is rendered as an ENTITLEMENT with the assumption stated rather
 * than as income. It is never summed into `dividendReceived`, never added to any
 * book total, and never called "received" — because whether the money arrived,
 * and what TDS came off it, is a bank and statement fact that no exchange record
 * can answer.
 *
 * This is the same standing the fund look-through has: a derived figure rendered
 * beside measured ones, marked as derived in words rather than in a tooltip, and
 * in no total on the page.
 */
export function entitlements(balances: readonly StatementBalance[]): Entitlement[] {
  const shares = blockShares(balances);
  const dates = statementDates(balances);
  return dividendActions().map((action) => ({
    action,
    amount: shares !== null && action.amountPerShare !== null ? shares * action.amountPerShare : null,
    balanceReportedOnExDate: balanceReportedOn(action.exDate, balances),
    statementDates: dates,
  }));
}

/** The live (or last settled) value of the block, at the mark actually on screen. */
export function markedValue(shares: number | null, quote: PolycabQuote | null): number | null {
  return shares !== null && quote && typeof quote.ltp === "number" ? shares * quote.ltp : null;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); positive when `to` is later. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

/**
 * WHY A DIVIDEND'S PAYMENT DATE IS A DASH — ON THIS ROW, NOT FOR THE TABLE.
 *
 * The payment date comes from the exchange's SHORT recent-actions record,
 * joined on the ex-date. It used to carry one reason for every dash — "covers
 * only its most recent actions" — which was true of the three oldest rows and
 * FALSE of 9 Jul 2024, whose neighbours on both sides (2023, 2025) carry a date:
 * that record did cover it and printed no date against its ex-date. So the
 * reason is struck against the rows that DID get a date: a dashed row older than
 * all of them is outside what the record reaches; one inside the span is a row
 * the record covered without a date for this ex-date.
 */
export function paymentDateWhy(action: PolycabAction, all: readonly PolycabAction[]): string {
  const dated = all.filter((a) => a.paymentDate && a.exDate).map((a) => a.exDate as string).sort();
  if (!dated.length) return "the exchange's payment-date record carried no date for any action on the last refresh";
  if (action.exDate && action.exDate < dated[0]) {
    return "the exchange's payment-date record reaches back only to its most recent actions, and this one is older than any it dates";
  }
  return "the exchange's payment-date record covers this period but printed no payment date against this ex-date";
}

/**
 * THE HOLDING COLUMN'S CAPTION, COUNTED RATHER THAN CLAIMED. It read "carried
 * by two independent sources" over twelve quarters of which six were carried
 * by one. The counts come off the store's own `witnesses`.
 */
export function witnessCounts(quarters: readonly PolycabQuarter[]): { total: number; both: number; one: number } {
  return {
    total: quarters.length,
    both: quarters.filter((q) => q.witnesses >= 2).length,
    one: quarters.filter((q) => q.witnesses === 1).length,
  };
}

/**
 * WHY A QUARTER'S PROMOTER HOLDING IS A DASH. A refusal and a quarter no source
 * carried are both a null, and they send a reader to different places: the
 * first to two sources that disagree, the second to a disclosure nobody read.
 */
export function holdingWhy(q: PolycabQuarter): string {
  if (q.holdingRefused === true) return "the two sources disagreed on this quarter by more than 0.05pp, so neither figure is published";
  if (q.holdingRefused === false) return "no source this page reads carried a promoter-holding figure for this quarter";
  return "no promoter-holding figure is published for this quarter — either no source carried one or the two disagreed, and this stored record does not say which";
}

/** How stale is the committed store, in whole days? Null where it cannot be told. */
export function storeAgeDays(now = Date.now()): number | null {
  const t = Date.parse(POLYCAB_LIVE.retrievedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

export const POLYCAB_SOURCES = POLYCAB_LIVE.sources;

/**
 * Memoised view of everything the page needs, so the arithmetic runs once. It
 * takes every statement BALANCE rather than one share count and one date: the
 * first row's date standing for all of them is how a second demat, reported on
 * another day, would have been blended in silently.
 */
export function usePolycabLive(balances: readonly StatementBalance[]) {
  const state = usePolycabQuote();
  const { quote, live } = effectiveQuote(state);
  const shares = blockShares(balances);
  return useMemo(
    () => ({
      state, quote, live,
      dating: quoteDating(state),
      dividends: dividendActions(),
      shareActions: shareCountActions(),
      unclassified: unclassifiedActions(),
      measuredNil: shareActionsMeasuredNil(),
      /**
       * WAS THE EXCHANGE'S RECORD FETCHED WHOLE ON THE LAST REFRESH? The one
       * fact behind every "whole since listing" on the page — the card's own
       * subtitle as well as the bonus/split nil — so both read it from here
       * rather than one of them asserting it unconditionally.
       */
      complete: POLYCAB_LIVE.actionsComplete === true,
      promoter: latestPromoter(),
      quarters: POLYCAB_LIVE.promoterQuarters ?? [],
      entitlements: entitlements(balances),
      markedValue: markedValue(shares, quote),
      retrievedAt: POLYCAB_LIVE.retrievedAt,
      agreement: POLYCAB_LIVE.promoterAgreement,
      identity: POLYCAB_LIVE.identity,
    }),
    [state, quote, live, shares, balances],
  );
}
