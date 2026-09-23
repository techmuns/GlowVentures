// Types for shared/upstoxInstruments.mjs, which `npm run build-upstox-instruments`
// generates. A declaration so a test can import the committed map without
// `tsc -b` failing on TS7016.

export declare const UPSTOX_INSTRUMENTS: Readonly<Record<string, {
  key: string;
  tradingSymbol: string;
  series: string;
  joinedBy: "symbol" | "symbol+isin" | "isin";
}>>;

export declare const UPSTOX_INSTRUMENT_COVERAGE: Readonly<{ asked: number; mapped: number; unmapped: string[] }>;
