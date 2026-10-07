export type Listing = { segment: string; instrument_type: string; instrument_key: string; trading_symbol: string; name: string };
export type InstrumentIndex = { byIsin: Map<string, Listing[]>; bySymbol: Map<string, Listing[]>; byName: Map<string, Listing[]> };
export declare function cashInstruments(list: Listing[]): Listing[];
export declare function quoteSymbol(listing: Listing): string;
export declare function instrumentIndex(list: Listing[]): InstrumentIndex;
export declare function resolveInstrument(identity: { symbol?: string | null; isin?: string | null; key?: string }, index: InstrumentIndex):
  { instrument: Listing; joinedBy: "symbol" | "symbol+isin" | "isin" | "name"; reason?: never } | { reason: string; instrument?: never };
