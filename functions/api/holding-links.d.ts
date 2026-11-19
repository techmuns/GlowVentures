// Types for the documents-folder-link store, so `holdingLinks.test.ts` can import it.
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

export type HoldingLinksContext = {
  /** `GLOW_GITHUB_TOKEN` writes the repository's store; `DASHBOARD_STORE` is a store a test hands in. */
  env: { DASHBOARD_STORE?: KvLike; GLOW_GITHUB_TOKEN?: string } & Record<string, unknown>;
  request: Request;
};

export type StoredLink = {
  key: string;
  label: string;
  url: string;
  note: string;
  updatedAt: string;
};

export function onRequest(context: HoldingLinksContext): Promise<Response>;
export function cleanUrl(s: unknown): string | null;
export function isLink(l: unknown): l is StoredLink;
export function validateLink(d: unknown, now?: Date): { link: StoredLink; error?: undefined } | { error: string; link?: undefined };
