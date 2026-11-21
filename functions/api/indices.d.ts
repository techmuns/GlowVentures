// Types for the indices Pages Function, so `indicesFunction.test.ts` can import
// it. Same reason `chat.d.ts` exists: the functions in this folder are plain JS
// that Cloudflare runs directly, and without a declaration `tsc -b` fails the
// whole build on TS7016 — which `test:family` would not catch, because it
// bundles with esbuild and does not typecheck.
export type IndicesContext = {
  request: Request;
  /** Present on the Pages runtime; this function uses only `waitUntil`. */
  waitUntil?: (p: Promise<unknown>) => void;
};

export function onRequest(context: IndicesContext): Promise<Response>;

/** One index the feed reads: its key (a `BenchmarkKey`), symbol and accepted names. */
export type IndexSpec = { id: string; label: string; symbol: string; expect: string[] };

// `declare`, not a bare `const`: Cloudflare's Functions bundler (esbuild) reads this
// file too, and refuses a `const` with no initialiser (the 16 Nov preview failure).
/** Every index the feed reads — held to `BENCHMARKS` by `indicesFunction.test.ts`. */
export declare const INDICES: IndexSpec[];
