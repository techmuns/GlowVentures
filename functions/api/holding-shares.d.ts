// Types for the share-count store, so `holdingShares.test.ts` can import it.
//
// The functions in this folder are plain JS that Cloudflare runs directly. This
// one is imported BY A TEST, and without a declaration `tsc -b` fails the whole
// build on TS7016 (see `capital-calls.d.ts`), so the declaration lands in the
// same commit as the test.

/** The key–value calls the function makes on the shared store (`shared/dashboardStore.mjs`). */
export type KvLike = {
  list(opts: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  flush?(): Promise<void>;
};

export type HoldingSharesContext = {
  /** `GLOW_GITHUB_TOKEN` writes the repository's store; `DASHBOARD_STORE` is a store a test hands in. */
  env: { DASHBOARD_STORE?: KvLike; GLOW_GITHUB_TOKEN?: string } & Record<string, unknown>;
  request: Request;
};

export type StoredShares = {
  key: string;
  label: string;
  shares: number;
  source: string;
  updatedAt: string;
};

export function onRequest(context: HoldingSharesContext): Promise<Response>;
export function isShares(r: unknown): r is StoredShares;
export function validateShares(d: unknown, now?: Date): { rec: StoredShares; error?: undefined } | { error: string; rec?: undefined };
