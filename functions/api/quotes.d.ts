// Types for the quotes Pages Function, so `quotesFunction.test.ts` can import
// it. Same reason `chat.d.ts` and `indices.d.ts` exist: the functions in this
// folder are plain JS that Cloudflare runs directly, and without a declaration
// `tsc -b` fails the whole build on TS7016 — which `test:family` would not
// catch, because it bundles with esbuild and does not typecheck.
export type QuotesContext = {
  request: Request;
  /**
   * The variables this function reads: `UPSTOX_ACCESS_TOKEN` (or `UPSTOX_TOKEN`)
   * for the primary feed, and `MUNS_TOKEN` for the fallback.
   */
  env?: Record<string, string | undefined>;
};

export function onRequest(context: QuotesContext): Promise<Response>;
