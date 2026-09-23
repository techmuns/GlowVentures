// Types for the capital-call store, so `enteredCalls.test.ts` can import it.
//
// The functions in this folder are plain JS that Cloudflare runs directly.
// This one is imported BY A TEST, and without a declaration `tsc -b` fails the
// whole build on TS7016 — which `test:family` would not catch, because it
// bundles with esbuild and does not typecheck. That has broken this build twice
// (see `indices.d.ts`), so the declaration lands in the same commit as the test.

/** The slice of Cloudflare's KV binding this function uses. */
export type KvLike = {
  list(opts: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
};

export type CapitalCallsContext = {
  /** `GLOW_STORE` is the KV namespace binding; absent until it is connected. */
  env: { GLOW_STORE?: KvLike } & Record<string, unknown>;
  request: Request;
};

export type StoredCall = {
  id: string;
  fund: string;
  fundName: string;
  date: string;
  amount: number;
  note: string;
  updatedAt: string;
};

export function onRequest(context: CapitalCallsContext): Promise<Response>;
export function isIsoDate(s: unknown): boolean;
export function isCall(c: unknown): c is StoredCall;
export function validateDraft(d: unknown, now?: Date): { call: StoredCall; error?: undefined } | { error: string; call?: undefined };
