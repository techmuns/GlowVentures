// Types for the chat Pages Function, so `chatFunction.test.ts` can import it.
//
// The functions in this folder are plain JS — Cloudflare runs them directly and
// nothing else in the app imports them, so none of the others needs one of
// these. This one is imported BY A TEST, and without a declaration `tsc -b`
// fails the whole build on TS7016. Kept beside the function rather than as a
// cast at the call site, because the shape below IS the function's contract
// with the Pages runtime and is worth stating once.
export type ChatContext = {
  /** Cloudflare environment bindings — `MUNS_TOKEN`, `MUNS_USER_INDEX`, … */
  env: Record<string, string | undefined>;
  request: Request;
};

export function onRequest(context: ChatContext): Promise<Response>;
