/**
 * THE HOOKS AND THE ONE COMPONENT OVER `researchSync.ts` (Stage 10cp): one
 * derivation of what this browser sends, read by the sender and by every card
 * that says where a level went, so the two cannot disagree.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { UPSTOX_INSTRUMENTS } from "../../shared/upstoxInstruments.mjs";
import { usePortfolio } from "@/context/PortfolioContext";
import { symbolFor, symbolForKey } from "@/lib/quotes";
import { useWatchlist } from "@/lib/usePriceAlerts";
import type { Position } from "@/lib/types";
import {
  fingerprint, researchLevelsFrom, statusFor, syncSummary, type Derived, type SyncStatus, type SyncSummary,
} from "@/lib/researchLevels";
import {
  researchBusy, researchSnapshot, subscribeResearch, syncResearchLevels, type ResearchState,
} from "@/lib/researchSync";

/** The listed instrument's ISIN for an NSE symbol — the one the receiving side asks Upstox about. */
const instrumentIsin = (ticker: string): string | null => {
  const key = UPSTOX_INSTRUMENTS[ticker]?.key;
  return key?.startsWith("NSE_EQ|") ? key.slice("NSE_EQ|".length) : null;
};

/** What this browser sends, from the saved levels and the book — one derivation for every caller. */
export function useResearchDerived(): Derived {
  const { portfolio } = usePortfolio();
  const watchlist = useWatchlist();
  return useMemo(() => {
    const byKey = new Map<string, Position[]>();
    for (const p of portfolio?.positions ?? []) {
      const list = byKey.get(p.securityKey);
      if (list) list.push(p); else byKey.set(p.securityKey, [p]);
    }
    return researchLevelsFrom(watchlist, {
      rowsFor: (k) => byKey.get(k) ?? [],
      symbolOf: (k, rows) => rows.map(symbolFor).find((s): s is string => !!s) ?? symbolForKey(k),
      instrumentIsin,
    });
  }, [portfolio, watchlist]);
}

export function useResearchState(): ResearchState & { busy: boolean } {
  const s = useSyncExternalStore(subscribeResearch, researchSnapshot, researchSnapshot);
  const b = useSyncExternalStore(subscribeResearch, researchBusy, researchBusy);
  return useMemo(() => ({ ...s, busy: b }), [s, b]);
}

/** One saved entry's standing with Glow Central Research. */
export function useResearchStatus(securityKey: string): SyncStatus {
  const d = useResearchDerived();
  const s = useResearchState();
  return useMemo(() => statusFor(securityKey, d, s, s.attempt), [securityKey, d, s]);
}

/** Every saved entry's standing, counted. */
export function useResearchSummary(): SyncSummary {
  const d = useResearchDerived();
  const s = useResearchState();
  return useMemo(() => syncSummary(d, s, s.attempt), [d, s]);
}

/**
 * MOUNTED ONCE, IN THE APP SHELL. Sends after every change (a short pause lets
 * a burst of edits go as one request), on every page load, when the browser
 * comes back online, and when a failed send's wait is over.
 *
 * Keyed on what would be SENT — the tickers, ISINs and levels — never on the
 * book object, which changes with every quote poll and would otherwise make
 * every poll look like a new level, and never on when an entry was saved,
 * which a note alone moves and which changes nothing that is sent.
 */
export function ResearchLevelSync(): null {
  const { portfolio } = usePortfolio();
  const derived = useResearchDerived();
  const state = useResearchState();
  const latest = useRef(derived.send);
  latest.current = derived.send;
  const sendKey = useMemo(
    () => derived.send.map(fingerprint).join("|"),
    [derived.send],
  );
  const ready = !!portfolio;

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => void syncResearchLevels(latest.current), 700);
    return () => window.clearTimeout(t);
  }, [sendKey, ready]);

  const retryAt = state.attempt && !state.attempt.ok ? state.attempt.retryAt : null;
  useEffect(() => {
    if (!ready || !retryAt) return;
    const ms = Math.max(1_000, Date.parse(retryAt) - Date.now());
    const t = window.setTimeout(() => void syncResearchLevels(latest.current), ms);
    return () => window.clearTimeout(t);
  }, [retryAt, ready]);

  useEffect(() => {
    if (!ready) return;
    const again = () => {
      const a = researchSnapshot().attempt;
      if (a && !a.ok) void syncResearchLevels(latest.current);
    };
    const onVisible = () => { if (document.visibilityState === "visible") again(); };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  return null;
}
