/** The key–value calls the Pages Functions make on the dashboard's shared store. */
export type DashboardStore = {
  list(opts: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  /** Commit the request's changes together. An in-memory test store may omit it. */
  flush?(): Promise<void>;
};

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export declare const STORE_DEFAULTS: Readonly<{ repo: string; branch: string; path: string }>;
export declare function toBase64(text: string): string;
export declare function fromBase64(b64: string): string;
export declare function serialize(records: Record<string, { value: string; metadata: unknown }>): string;
export declare class StoreError extends Error {
  status: number;
  constructor(message: string, status: number);
}
export declare function storeFor(env: Record<string, unknown> | undefined, fetchImpl?: Fetch): DashboardStore | null;
export declare function githubStore(
  opts: { token: string; repo: string; branch: string; path: string },
  fetchImpl?: Fetch,
): DashboardStore & { flush(): Promise<void> };
