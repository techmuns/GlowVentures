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
