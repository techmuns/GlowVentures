import { useEffect, useMemo, useState } from 'react';
import { fundNavFor } from './fundNavs';
import { holdingQuoteSymbolFor } from './quotes';
import type { Position } from './types';
import type { MarketInstrument, MarketResult } from './marketReturns';
const inflight = new Map<string, Promise<MarketResult>>();
function load(instrument: MarketInstrument): Promise<MarketResult> {
  const hit = inflight.get(instrument.key); if (hit) return hit;
  const request = fetch(`/api/market-history?${instrument.query}`).then(async r => r.ok ? await r.json() as MarketResult : { ok: false as const, reason: `The history service returned HTTP ${r.status}.` })
    .catch(() => ({ ok: false as const, reason: 'The history service could not be reached. Retry to load it again.' }))
    .then(r => { if (!r.ok) inflight.delete(instrument.key); return r; });
  inflight.set(instrument.key, request); return request;
}
export function useMarketHistories(positions: readonly Position[]) {
  const instruments = useMemo(() => {
    const map = new Map<string, MarketInstrument>();
    for (const p of positions) {
      const fund = fundNavFor(p), quoteSymbol = holdingQuoteSymbolFor(p);
      const symbol = quoteSymbol?.startsWith('BSE:') ? `${quoteSymbol.slice(4)}.BO` : quoteSymbol;
      if (fund) map.set(p.securityKey, { key: `fund:${fund.schemecode}:${fund.isin}`, query: new URLSearchParams({ fund: fund.schemecode, isin: fund.isin }).toString() });
      else if (symbol && p.marketSide !== 'private' && !p.valuedAtCost) map.set(p.securityKey, { key: `stock:${symbol}`, query: new URLSearchParams({ symbol }).toString() });
    }
    return map;
  }, [positions]);
  const key = [...new Set([...instruments.values()].map(i => i.key))].sort().join('|');
  const [histories, setHistories] = useState<Record<string, MarketResult | undefined>>({}), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, cursor = 0;
    const queue = [...new Map([...instruments.values()].map(i => [i.key, i])).values()];
    async function worker() {
      while (active && cursor < queue.length) {
        const instrument = queue[cursor++];
        const result = await load(instrument);
        if (active) setHistories(h => ({ ...h, [instrument.key]: result }));
      }
    }
    void Promise.allSettled(Array.from({ length: Math.min(4, queue.length) }, worker));
    return () => { active = false; };
    // Public identities are stable when only quotes, weights or the selected period change.
  }, [key, attempt]);
  return { instruments, histories, retry: () => setAttempt(a => a + 1) };
}
