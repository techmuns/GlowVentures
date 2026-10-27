// Types for shared/statementInbox.mjs — the dashboard's statement inbox on the
// repository's `statement-inbox` branch. Plain JS so the Pages Function, the
// intake run (Node) and the browser's tests share one implementation.

export type InboxStatus = "queued" | "processing" | "landed" | "duplicate" | "held";
export type InboxHold = "needs-reader" | "needs-password" | "unreadable" | "not-a-statement" | "check-failed" | "intake-error";

export type InboxFile = {
  /** The path as uploaded — a folder upload keeps its folders — cleaned. */
  name: string;
  size: number;
  /** The git blob holding the bytes on the inbox branch. */
  blob: string;
  status: InboxStatus;
  /** A rapid claim is never also consumed by the legacy scheduled intake. */
  processor?: 'rapid' | 'github' | null;
  hold: InboxHold | null;
  /** Held: why. Duplicate: the statement already in `source/` it matches. */
  reason: string | null;
  /** Landed: where it sits in `source/` on main. */
  landedAs: string[] | null;
  /** Landed: the Statement Library folders its documents are filed under. */
  providers: string[] | null;
  /** Landed: the archive documents it was read into. */
  docKeys: string[] | null;
  /** Landed: the commit on main that carries it. */
  commit: string | null;
  /** Backend publication state; the existing status/reason UI remains usable. */
  pullRequest?: string | null;
  branch?: string | null;
  ciDispatched?: boolean | null;
  publicationDetail?: string | null;
  baseCommit?: string | null;
  archiveRevision?: string | null;
  documentVersions?: { document: string; revision: string }[] | null;
  /** Files inside a ZIP a mail server removed (their notices landed as never arrived). */
  neverArrived?: string[] | null;
  /** The intake run that last touched it. */
  run: string | null;
  updatedAt: string;
};

export type InboxBatch = { id: string; uploadedAt: string; files: InboxFile[] };
export type InboxLog = { version: 1; batches: InboxBatch[] };
export type InboxUpdate = { batch: string; name: string } & Partial<Omit<InboxFile, "name">>;

export declare const INBOX_DEFAULTS: Readonly<{ repo: string; branch: string; log: string; files: string; event: string }>;
export declare const STATEMENT_EXT: readonly string[];
export declare const MAX_FILE_BYTES: number;
export declare const MAX_BATCH_FILES: number;
export declare const MAX_SETTLED_BATCHES: number;
export declare const STATUSES: readonly InboxStatus[];
export declare const HOLDS: readonly InboxHold[];

export declare function extOf(name: unknown): string;
export declare function isJunkPath(p: unknown): boolean;
export declare function cleanUploadPath(raw: unknown): string | null;
export declare function checkUpload(draft: { name?: unknown; size?: unknown }): { name: string; error?: undefined } | { error: string; name?: undefined };
export declare function newBatchId(now?: Date, rand?: () => string): string;
export declare function isBatchId(s: unknown): boolean;
export declare function isBlobSha(s: unknown): boolean;
export declare function inboxPath(batch: string, name: string, files?: string): string;
export declare function emptyLog(): InboxLog;
export declare function parseLog(text: string): InboxLog;
export declare function serializeLog(log: InboxLog): string;
export declare function withBatch(log: InboxLog, batch: InboxBatch): InboxLog;
export declare function makeBatch(id: string, files: { name: string; size: number; blob: string }[], now?: Date): InboxBatch;
export declare function uniqueNames<T extends { name: string }>(files: T[]): T[];
export declare function queuedFiles(log: InboxLog): { batch: string; file: InboxFile }[];
export declare function waitingStatementFiles(log: InboxLog): { batch: string; file: InboxFile }[];
export declare function applyUpdates(log: InboxLog, updates: InboxUpdate[], now?: Date): InboxLog;
export declare function requeue(log: InboxLog, batchId: string, now?: Date): { log: InboxLog; count: number };
export declare function withoutFile(log: InboxLog, batchId: string, name: string):
  { log: InboxLog; removed: InboxFile; error?: undefined } | { error: string; log?: undefined; removed?: undefined };

export declare class InboxError extends Error {
  status: number;
  constructor(message: string, status: number);
}
export declare class InboxRefusal extends Error {}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type GitHubInbox = {
  read(): Promise<{ head: string | null; tree: string | null; log: InboxLog }>;
  putBlob(bytes: ArrayBuffer | Uint8Array): Promise<string>;
  commit(opts: {
    message: string;
    mutate: (log: InboxLog) => InboxLog;
    add?: { path: string; sha: string }[];
    remove?: string[];
  }): Promise<{ log: InboxLog; commit: string }>;
  dispatch(payload?: Record<string, unknown>): Promise<boolean>;
};

export declare function inboxFor(env: Record<string, unknown> | undefined, fetchImpl?: Fetch): GitHubInbox | null;
export declare function githubInbox(opts: { token: string; repo: string; branch: string }, fetchImpl?: Fetch): GitHubInbox;
