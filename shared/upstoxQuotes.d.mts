// Types for shared/upstoxQuotes.mjs — the ONE reading of Upstox's full market
// quote, imported by `functions/api/quotes.js` and by its tests. Without a
// declaration `tsc -b` fails the whole build on TS7016, which `test:family`
// would not catch, because it bundles with esbuild and does not typecheck.

export declare const UPSTOX_QUOTES_URL: string;
export declare const UPSTOX_BATCH: number;
export declare const UPSTOX_TOKEN_VARS: readonly string[];

/** The configured token and the variable NAME it came from, or null. */
export declare function upstoxToken(env: Record<string, string | undefined> | null | undefined): { name: string; token: string } | null;

export type UpstoxInstrument = { key: string; tradingSymbol: string; series: string; joinedBy: string };
export declare function instrumentFor(symbol: string): UpstoxInstrument | null;

export type UpstoxQuote = {
  price: number;
  prevClose: number | null;
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  low52: null;
  high52: null;
  marketCap: null;
  volume: number | null;
  yearChangePct: null;
  tradedAt: string | null;
  source: "upstox";
};

export declare function shapeUpstoxRow(row: unknown): UpstoxQuote | null;

export type UpstoxCall = {
  batch: number;
  requested: number;
  status: number | null;
  durationMs: number;
  rows: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export declare function fetchUpstoxQuotes(
  symbols: readonly string[],
  token: string,
  opts?: { fetcher?: typeof fetch; timeoutMs?: number },
): Promise<{
  quotes: Record<string, UpstoxQuote>;
  unmapped: string[];
  refused: Array<{ symbol: string; reason: string }>;
  notReturned: string[];
  calls: UpstoxCall[];
}>;
