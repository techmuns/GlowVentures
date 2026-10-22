// Types for shared/upstoxInstruments.mjs, which `npm run build-upstox-instruments`
// generates. A declaration so a test can import the committed map without
// `tsc -b` failing on TS7016.

export declare const UPSTOX_INSTRUMENTS: Readonly<Record<string, {
  key: string;
  tradingSymbol: string;
  series: string;
  /** How the listing was matched; `+successor` where a split retired the statement's ISIN (Stage 10he). */
  joinedBy: `${"symbol" | "symbol+isin" | "isin" | "name"}${"" | "+successor"}`;
}>>;

export declare const UPSTOX_SECURITY_SYMBOLS: Readonly<Record<string, string>>;
export declare const UPSTOX_ISIN_SYMBOLS: Readonly<Record<string, string>>;

export declare const UPSTOX_INSTRUMENT_COVERAGE: Readonly<{ asked: number; mapped: number; unmapped: string[] }>;
