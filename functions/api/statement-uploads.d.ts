// Types for the statement-upload store, so `statementUploads.test.ts` can import
// it. The functions here are plain JS Cloudflare runs directly; this declaration
// exists because a test imports the module and `tsc -b` would otherwise fail the
// whole build on TS7016 (see `indices.d.ts` / `capital-calls.d.ts`).

/** The slice of Cloudflare's R2 binding this function uses. */
export type R2Like = {
  list(opts: { prefix: string; cursor?: string; include?: string[] }): Promise<{
    objects: {
      key: string;
      size?: number;
      uploaded?: string | number | Date;
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string };
    }[];
    truncated: boolean;
    cursor?: string;
  }>;
  get(key: string): Promise<{
    body: ReadableStream | null;
    customMetadata?: Record<string, string>;
    httpMetadata?: { contentType?: string };
  } | null>;
  put(key: string, value: ArrayBuffer | ReadableStream, opts?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type StatementUploadsContext = {
  /** `STATEMENT_UPLOADS` is the R2 bucket binding; absent until it is connected. */
  env: { STATEMENT_UPLOADS?: R2Like } & Record<string, unknown>;
  request: Request;
};

export type UploadRecord = {
  provider: string;
  fileName: string;
  uploadedAt: string;
  contentType: string;
};

export function onRequest(context: StatementUploadsContext): Promise<Response>;
export function extOf(name: unknown): string;
export function slugProvider(name: unknown): string;
export function safeFileName(name: unknown): string;
export function isStagedKey(key: unknown): boolean;
export function validateUpload(
  draft: { provider?: unknown; fileName?: unknown; size?: unknown },
  now?: Date,
  rand?: () => string,
): { key: string; record: UploadRecord; error?: undefined } | { error: string; key?: undefined; record?: undefined };
