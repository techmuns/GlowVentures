import { securityKeyOf } from "./securityKey.mjs";

const SERIES = {
  NSE_EQ: new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ", "RR", "IV", "IT", "E1"]),
  BSE_EQ: new Set(["A", "B", "X", "XT", "T", "TS", "Z", "ZP", "M", "MT", "MS", "P", "E", "R", "IF", "W"]),
};

/** Equity/unit instruments only: bonds can share a company's trading symbol. */
export function cashInstruments(list) {
  return [...new Map(list.filter((i) => SERIES[i.segment]?.has(i.instrument_type)
    && /^(NSE|BSE)_EQ\|IN[A-Z0-9]{10}$/.test(i.instrument_key || "")
    && i.trading_symbol).map((i) => [i.instrument_key, i])).values()];
}

/** NSE first; a BSE quote keeps its exchange in the feed key. */
export function quoteSymbol(i) {
  return i.segment === "NSE_EQ" ? i.trading_symbol : `BSE:${i.trading_symbol}`;
}

export function instrumentIndex(list) {
  const byIsin = new Map(), bySymbol = new Map(), byName = new Map();
  for (const i of cashInstruments(list)) {
    for (const [map, key] of [[byIsin, i.instrument_key.split("|")[1]],
      [bySymbol, quoteSymbol(i)], [byName, securityKeyOf(i.name)]]) {
      if (key) map.set(key, [...(map.get(key) ?? []), i]);
    }
  }
  return { byIsin, bySymbol, byName };
}

/** Exact identifiers or exact normalized names; conflicting identities are refused. */
export function resolveInstrument({ symbol, isin, key }, index) {
  const exact = symbol ? index.bySymbol.get(symbol) ?? [] : [];
  if (exact.length > 1) return { reason: `ambiguous symbol ${symbol}` };
  if (exact.length === 1 && isin && exact[0].instrument_key.split("|")[1] !== isin) {
    return { reason: `${symbol} disagrees with the statement ISIN ${isin}` };
  }
  const candidates = isin ? index.byIsin.get(isin) ?? []
    : exact.length ? exact : index.byName.get(key) ?? [];
  if (!candidates.length) return { reason: isin ? `no listed share/unit carries ${isin}` : "no exact listing identity" };
  if (new Set(candidates.map((i) => i.instrument_key.split("|")[1])).size !== 1) {
    return { reason: "ambiguous listing identity" };
  }
  const sameSecurity = index.byIsin.get(candidates[0].instrument_key.split("|")[1]) ?? candidates;
  const preferred = sameSecurity.filter((i) => i.segment === "NSE_EQ");
  const chosen = preferred.length ? preferred : sameSecurity;
  if (chosen.length !== 1) return { reason: "ambiguous exchange instrument" };
  return { instrument: chosen[0], joinedBy: isin ? exact.length ? "symbol+isin" : "isin" : exact.length ? "symbol" : "name" };
}
