import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { fundNavFor } from './fundNavs';
import { holdingQuoteSymbolFor } from './quotes';
import { FRESH_MS, readStoredHistories, storeHistory } from './marketHistoryStore';
import type { Position } from './types';
import type { MarketInstrument, MarketResult } from './marketReturns';

/**
 * ── ONE SHARED LOADER FOR PUBLIC HISTORIES (Stage 10gu) ──────────────────────
 *
 * Every reader (the Returns tab, and Morning CIO warming it while the reader is
 * on another tab) shares this page's one record of histories, one queue and
 * one copy kept in the browser (`marketHistoryStore`). A history kept from an
 * earlier visit is drawn at once and, once older than `FRESH_MS`, refetched in
 * the background; only a holding with nothing kept is "loading". Readers are
 * told of arrivals in batches, so 350 arrivals redraw the tab a few times, not
 * 350 times.
 */
type Entry = { result: MarketResult; fetchedAt: number };
const memory = new Map<string, Entry>();
const inflight = new Set<string>();
const queue: MarketInstrument[] = [];
const CONCURRENCY = 8;
let running = 0, version = 0, flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let hydrated: Promise<void> | null = null;

function notify() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; version++; for (const l of listeners) l(); }, 120);
}
/** What this browser kept from earlier visits, read once per page load. */
function hydrate(): Promise<void> {
  // Storage that never answers must not hold the tab on "loading".
  const none = new Promise<Awaited<ReturnType<typeof readStoredHistories>>>((resolve) => setTimeout(() => resolve(new Map()), 3000));
  hydrated ??= Promise.race([readStoredHistories(), none]).then((kept) => {
    let added = false;
    for (const [key, h] of kept) if (!memory.has(key)) { memory.set(key, h); added = true; }
    if (added) notify();
  }).catch(() => {});
  return hydrated;
}
const fresh = (e: Entry | undefined) => !!e && e.result.ok && e.result.version === 2 && Date.now() - e.fetchedAt < FRESH_MS;

async function fetchHistory(instrument: MarketInstrument): Promise<MarketResult> {
  try {
    const r = await fetch(`/api/market-history?${instrument.query}`);
    if (!r.ok) return { ok: false, reason: `The history service returned HTTP ${r.status}.` };
    return await r.json() as MarketResult;
  } catch {
    return { ok: false, reason: 'The history service could not be reached. Retry to load it again.' };
  }
}
function pump() {
  while (running < CONCURRENCY && queue.length) {
    const instrument = queue.shift()!;
    running++;
    void fetchHistory(instrument).then((result) => {
      const kept = memory.get(instrument.key);
      // A failed refresh never replaces a history already kept.
      if (result.ok || !kept?.result.ok) memory.set(instrument.key, { result, fetchedAt: Date.now() });
      if (result.ok) void storeHistory(instrument.key, result, Date.now());
      inflight.delete(instrument.key); running--; notify(); pump();
    });
  }
}
/** Queue every instrument with no current history; `retryFailed` also retries those that failed. */
async function ensure(instruments: Iterable<MarketInstrument>, retryFailed = false) {
  const wanted = [...new Map([...instruments].map((i) => [i.key, i])).values()];
  await hydrate();
  for (const i of wanted) {
    const e = memory.get(i.key);
    if (inflight.has(i.key) || fresh(e) || (e && !e.result.ok && !retryFailed)) continue;
    inflight.add(i.key); queue.push(i);
  }
  pump();
}

/** The public identity each holding's history is fetched by, where it has one. */
export function marketInstruments(positions: readonly Position[]): Map<string, MarketInstrument> {
  const map = new Map<string, MarketInstrument>();
  for (const p of positions) {
    const fund = fundNavFor(p), quoteSymbol = holdingQuoteSymbolFor(p);
    const symbol = quoteSymbol?.startsWith('BSE:') ? `${quoteSymbol.slice(4)}.BO` : quoteSymbol;
    if (fund) map.set(p.securityKey, { key: `fund:${fund.schemecode}:${fund.isin}`, query: new URLSearchParams({ fund: fund.schemecode, isin: fund.isin }).toString() });
    else if (symbol && p.marketSide !== 'private' && !p.valuedAtCost) map.set(p.securityKey, { key: `stock:${symbol}`, query: new URLSearchParams({ symbol }).toString() });
  }
  return map;
}

/** Start loading (or refreshing) these holdings' histories without drawing anything. */
export function warmMarketHistories(positions: readonly Position[]) {
  void ensure(marketInstruments(positions).values());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;

export function useMarketHistories(positions: readonly Position[]) {
  const instruments = useMemo(() => marketInstruments(positions), [positions]);
  const key = [...new Set([...instruments.values()].map(i => i.key))].sort().join('|');
  const seen = useSyncExternalStore(subscribe, getVersion, getVersion);
  // Public identities are stable when only quotes, weights or the selected period change.
  useEffect(() => { void ensure(instruments.values()); }, [key]);
  const histories = useMemo(() => {
    const out: Record<string, MarketResult | undefined> = {};
    for (const i of instruments.values()) { const e = memory.get(i.key); if (e) out[i.key] = e.result; }
    return out;
  }, [instruments, seen]);
  // Kept histories being brought up to date in the background, already drawn meanwhile.
  const refreshing = [...instruments.values()].filter(i => inflight.has(i.key) && memory.get(i.key)?.result.ok).length;
  return { instruments, histories, refreshing, retry: () => { void ensure(instruments.values(), true); } };
}
