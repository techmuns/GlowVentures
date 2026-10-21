// THE STATEMENT DROP BOX — the read/write side of `/api/statement-uploads`.
//
// Each folder in the Statement Library has a drop box behind it. A file chosen
// there is uploaded to the site's own R2 store, under its provider, and held
// until the book is rebuilt from it.
//
// ── WHAT A STAGED FILE IS, AND WHAT IT IS NOT ──────────────────────────────
//
// Raw and unread. The book (`src/data/glowData.ts`) is assembled OFFLINE by the
// ingest pipeline under the standing rule that no figure is ever fabricated, so
// a browser upload cannot write it. A staged file feeds nothing on any page
// until a rebuild reads it (`pull-uploads` → inventory → extract → build-book).
// The drop box says this plainly; a staged file is never a holding.
//
// ── THE CAUSE PICKS THE SENTENCE ───────────────────────────────────────────
//
// The same four causes the capital-call store names — the store is not connected
// yet, the reader was signed out, no function is running (a local preview), or
// the store answered with an error — because they send a reader to four
// different places. Only `not-configured` shows the one-time set-up steps.
import { useCallback, useEffect, useRef, useState } from "react";

export type StatementUpload = {
  /** The R2 key — the file's address in the store, used to download or remove it. */
  key: string;
  provider: string;
  fileName: string;
  /** Bytes. */
  size: number;
  /** ISO timestamp the file was staged. */
  uploadedAt: string;
  contentType: string;
};

export type StoreCause = "not-configured" | "signed-out" | "no-function" | "no-answer" | "error";

export type UploadsState =
  | { status: "loading" }
  | { status: "ready"; uploads: StatementUpload[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const UPLOADS_ENDPOINT = "/api/statement-uploads";

const isUpload = (u: unknown): u is StatementUpload => {
  const x = u as StatementUpload;
  return !!x && typeof x.key === "string" && typeof x.provider === "string"
    && typeof x.fileName === "string" && typeof x.size === "number";
};

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to upload statements.",
  noFunction: "The statement store is not running here, so uploads cannot be shown or saved.",
  notConfigured: "Uploading is not switched on yet — the statement store has not been connected.",
  noAnswer: "The statement store did not answer. Nothing was lost; try again in a moment.",
} as const;

export const CAUSE_WORD: Record<StoreCause, string> = {
  "not-configured": "Not set up",
  "signed-out": "Signed out",
  "no-function": "Not available",
  "no-answer": "Not answering",
  error: "Not available",
};

/**
 * ── HOW TO SWITCH IT ON, ONCE ───────────────────────────────────────────────
 *
 * The store is one Cloudflare R2 bucket bound to the Pages project as
 * `STATEMENT_UPLOADS`. Nothing in this repository can create it — it lives in
 * the Cloudflare account — so the drop box names the steps rather than leaving
 * the next reader to find them in a code comment. Shown ONLY for
 * `not-configured`. R2 is used rather than KV because statements are files up to
 * tens of megabytes and a KV value caps at 25 MiB.
 */
export const SWITCH_ON_STEPS = [
  "In the Cloudflare dashboard, open R2 → Create bucket, and create a bucket (any name, e.g. glow-statement-uploads).",
  "Open Workers & Pages → this site's Pages project → Settings → Bindings → Add → R2 bucket. Variable name: STATEMENT_UPLOADS; bucket: the one just created. Add it for Production, and for Preview too if preview links are used.",
  "Redeploy the site (Deployments → latest deployment → Retry deployment). Once it is live, reload this page: the drop box turns on.",
] as const;

type ListReply = { ok: true; uploads: StatementUpload[] } | { ok: false; reason: string; cause: StoreCause };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readReply(r: Response): Promise<ListReply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    // The edge gate answers every unauthenticated request with its login page;
    // a local preview answers with the app's own shell. Both are HTML and only
    // one of them is the reader's to fix.
    return text.includes("/__auth/login")
      ? { ok: false, reason: REASONS.signedOut, cause: "signed-out" }
      : { ok: false, reason: REASONS.noFunction, cause: "no-function" };
  }
  let j: { ok?: boolean; uploads?: unknown; code?: string; message?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.uploads)) return { ok: true, uploads: j.uploads.filter(isUpload) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  return { ok: false, reason: j?.message || `The statement store answered HTTP ${r.status}.`, cause: "error" };
}

/** A byte count as a short human string — "2.4 MB", "812 KB". */
export function fmtSize(bytes: number): string {
  if (!(bytes > 0)) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** The staged files for one provider, newest first. */
export function uploadsOf(uploads: readonly StatementUpload[], provider: string): StatementUpload[] {
  return uploads.filter((u) => u.provider === provider);
}

export type UploadOutcome =
  | { ok: true; upload: StatementUpload }
  | { ok: false; reason: string; cause: StoreCause };

/**
 * The staged list, kept fresh. Read on arrival and whenever the window regains
 * focus (when somebody else's upload is most likely the thing being looked for);
 * an upload or a remove replaces it with the store's own answer, so the list
 * never shows a change the store refused.
 */
export function useStatementUploads() {
  const [state, setState] = useState<UploadsState>({ status: "loading" });
  const alive = useRef(true);

  const load = useCallback(async () => {
    let reply: ListReply;
    try {
      reply = await readReply(await fetch(UPLOADS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
    } catch {
      reply = { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    if (!alive.current) return;
    // A refresh that fails keeps what was already shown — only a FIRST load that
    // fails says the store is unavailable.
    setState((prev) => reply.ok ? { status: "ready", uploads: reply.uploads }
      : prev.status === "ready" ? prev : { status: "unavailable", reason: reply.reason, cause: reply.cause });
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { alive.current = false; window.removeEventListener("focus", onFocus); };
  }, [load]);

  const applyList = (reply: ListReply) => {
    if (reply.ok && alive.current) setState({ status: "ready", uploads: reply.uploads });
    return reply;
  };

  /** Upload one file under a provider. Returns the stored record, or the cause. */
  const upload = useCallback(async (provider: string, file: File): Promise<UploadOutcome> => {
    const form = new FormData();
    form.append("provider", provider);
    form.append("file", file);
    let r: Response;
    try {
      r = await fetch(UPLOADS_ENDPOINT, { method: "POST", credentials: "same-origin", body: form });
    } catch {
      return { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    const reply = await readReply(r);
    if (!reply.ok) return reply;
    applyList(reply);
    const stored = reply.uploads.find((u) => u.provider === provider && u.fileName === safeName(file.name))
      ?? reply.uploads[0];
    return { ok: true, upload: stored };
  }, []);

  /** Remove one staged file by its key. */
  const remove = useCallback(async (key: string): Promise<ListReply> => {
    let r: Response;
    try {
      r = await fetch(`${UPLOADS_ENDPOINT}?key=${encodeURIComponent(key)}`, { method: "DELETE", credentials: "same-origin" });
    } catch {
      return { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    return applyList(await readReply(r));
  }, []);

  return { state, upload, remove, reload: load };
}

/** Mirror of the server's filename sanitiser, for matching the stored record. */
function safeName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^A-Za-z0-9._ ()+-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 200) || "statement";
}
