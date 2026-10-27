// THE STATEMENT UPLOAD — the browser side of `/api/statement-uploads`.
//
// One upload control on the Statement Library takes files or whole folders.
// Each statement is saved to the GitHub repository's `statement-inbox` branch,
// the upload is filed there as one batch, and the intake run reads it into the
// book and files it under its provider (`shared/statementInbox.mjs` has the
// whole path). This module picks the files, sends them, and follows each
// file's status in the inbox log until it is in its folder.
//
// ── WHAT AN UPLOADED FILE IS, AND WHAT IT IS NOT ───────────────────────────
//
// Until the intake run has read it in full it is raw and feeds nothing: the
// book is built offline under the rule that no figure is ever fabricated. A
// file the run cannot read is HELD with the reason, never shown as a holding.
//
// ── THE CAUSE PICKS THE SENTENCE ───────────────────────────────────────────
//
// The same causes the dashboard store names — no token yet, signed out, no
// function running (a local preview), no answer, an error — because they send a
// reader to different places. Only `not-configured` shows the set-up steps.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ManifestEntry } from "./statementLibrary";
import {
  checkUpload, isJunkPath, MAX_BATCH_FILES,
  type InboxBatch, type InboxFile,
} from "../../shared/statementInbox.mjs";

export type { InboxBatch, InboxFile };

export type StoreCause = "not-configured" | "signed-out" | "no-function" | "no-answer" | "error";

export type InboxState =
  | { status: "loading" }
  | { status: "ready"; batches: InboxBatch[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const UPLOADS_ENDPOINT = "/api/statement-uploads";

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to upload statements.",
  noFunction: "The upload service is not running here, so statements cannot be uploaded from this copy of the site.",
  notConfigured: "Statement uploads are unavailable. Please try again later.",
  noAnswer: "The upload service did not answer. Nothing was lost; try again in a moment.",
} as const;

export const CAUSE_WORD: Record<StoreCause, string> = {
  "not-configured": "Not set up",
  "signed-out": "Signed out",
  "no-function": "Not available",
  "no-answer": "Not answering",
  error: "Not available",
};

type Failure = { ok: false; reason: string; cause: StoreCause };
type Answer = { ok: true; body: Record<string, unknown> } | Failure;

/** Read one answer from the service, naming the actual cause of any failure. */
export async function readAnswer(r: Response): Promise<Answer> {
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
  let j: Record<string, unknown> | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true) return { ok: true, body: j };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  if (j?.code === "STORE_ERROR") return { ok: false, reason: "The upload could not complete. Please try again.", cause: "error" };
  return { ok: false, reason: typeof j?.message === "string" && j.message ? j.message : `The upload service answered HTTP ${r.status}.`, cause: "error" };
}

const isBatch = (b: unknown): b is InboxBatch => {
  const x = b as InboxBatch;
  return !!x && typeof x.id === "string" && Array.isArray(x.files)
    && x.files.every((f) => !!f && typeof f.name === "string" && typeof f.status === "string");
};
const batchesOf = (body: Record<string, unknown>): InboxBatch[] =>
  Array.isArray(body.batches) ? body.batches.filter(isBatch) : [];

async function send(init: RequestInit = {}): Promise<Answer> {
  try {
    return await readAnswer(await fetch(UPLOADS_ENDPOINT, { credentials: "same-origin", cache: "no-store", ...init }));
  } catch {
    return { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
  }
}
const postJson = (body: unknown) => send({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// ── PICKING FILES: a file chooser, a folder chooser, or a drop ──────────────

/** One file and the path it was picked under — a folder upload keeps its folders. */
export type PickedFile = { file: File; path: string };

/** From an `<input type="file">` — with `webkitdirectory`, each file names its folder. */
export function fromInput(list: FileList | readonly File[]): PickedFile[] {
  return [...list].map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));
}

/**
 * Everything dropped — files and the whole of every folder, however deep. The
 * entries are taken synchronously, inside the drop event, which is the only
 * moment a browser hands them over.
 */
export async function fromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = [...(dt.items ?? [])]
    .filter((it) => it.kind === "file")
    .map((it) => (typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  // A browser with no entry API hands over the top-level files only.
  if (!entries.length) return fromInput(dt.files);
  const out: PickedFile[] = [];
  const visit = async (e: FileSystemEntry, depth: number): Promise<void> => {
    if (e.isFile) {
      const file = await new Promise<File>((ok, err) => (e as FileSystemFileEntry).file(ok, err)).catch(() => null);
      if (file) out.push({ file, path: e.fullPath.replace(/^\/+/, "") || file.name });
    } else if (e.isDirectory && depth < 12) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      // `readEntries` answers in pages; an empty page means the folder is done.
      for (;;) {
        const page = await new Promise<FileSystemEntry[]>((ok, err) => reader.readEntries(ok, err)).catch(() => [] as FileSystemEntry[]);
        if (!page.length) break;
        for (const child of page) await visit(child, depth + 1);
      }
    }
  };
  for (const e of entries) await visit(e, 0);
  return out;
}

export type UploadPlan = {
  accepted: { file: File; name: string }[];
  /** Files that will not be sent, each with the reason. */
  skipped: { path: string; why: string }[];
  /** System files a folder sweeps up (`.DS_Store`, `Thumbs.db`) — counted, not listed. */
  ignored: number;
};

/** Which picked files are statements to send, and why each of the rest is not. */
export function planUpload(picked: readonly PickedFile[]): UploadPlan {
  const plan: UploadPlan = { accepted: [], skipped: [], ignored: 0 };
  for (const { file, path } of picked) {
    if (isJunkPath(path)) { plan.ignored++; continue; }
    const v = checkUpload({ name: path, size: file.size });
    if (v.name === undefined) { plan.skipped.push({ path, why: v.error }); continue; }
    if (plan.accepted.length >= MAX_BATCH_FILES) {
      plan.skipped.push({ path, why: `One upload takes at most ${MAX_BATCH_FILES} files; upload the rest separately.` });
      continue;
    }
    plan.accepted.push({ file, name: v.name });
  }
  return plan;
}

// ── WHAT A FILE'S STATUS MEANS ON THE PAGE ──────────────────────────────────

export type FileView = {
  key: "queued" | "reading" | "publishing" | "in-library" | "duplicate" | "held";
  label: string;
  tone: "info" | "gain" | "default" | "warn" | "loss";
  /** The hover: what the status means for this file. */
  title: string;
};

const HOLD_LABEL: Record<string, string> = {
  "needs-reader": "Unsupported format",
  "needs-password": "Needs password",
  unreadable: "Unreadable",
  "not-a-statement": "Not a statement",
  "check-failed": "Needs attention",
  "intake-error": "Try again",
};
const HOLD_REASON: Record<string, string> = {
  "needs-reader": "Try a PDF or Excel statement exported by your provider.",
  "needs-password": "Upload an unlocked copy of this statement.",
  unreadable: "We could not read this file. Try a fresh download.",
  "not-a-statement": "Upload the original statement downloaded from your provider.",
  "check-failed": "This statement needs a data check before it can be added. Your existing data is unchanged.",
  "intake-error": "Analysis could not finish. Try again.",
};

/** An exact receipt/source-path match, never a guessed filename or holder. */
export function uploadDocumentKeys(f: InboxFile, manifest: readonly Pick<ManifestEntry, "docKey" | "sourcePath">[]): string[] {
  if (f.docKeys?.length) return f.docKeys;
  const prefix = "Already in the library — byte-identical to ";
  if (f.status !== "duplicate" || !f.reason?.startsWith(prefix)) return [];
  const source = f.reason.slice(prefix.length).replace(/\.$/, "");
  return manifest.filter(d => d.sourcePath === source).map(d => d.docKey);
}

/**
 * One file's status as the page shows it. A landed file is `in-library` only
 * once the site serving this page has its documents — until the redeploy from
 * the landing commit is live, it is `publishing`.
 */
export function fileView(f: InboxFile, served: ReadonlySet<string>): FileView {
  switch (f.status) {
    case "queued":
      return { key: "queued", label: "Preparing analysis", tone: "info", title: "Statement uploaded to your family office dashboard. Analysis will start automatically." };
    case "processing":
      return { key: "reading", label: "Analysing", tone: "info", title: "Statement uploaded to your family office dashboard — being analysed now." };
    case "landed": {
      const keys = f.docKeys ?? [];
      const live = keys.length > 0 && keys.every((k) => served.has(k));
      return live
        ? { key: "in-library", label: "Ready", tone: "gain", title: "Statement analysed and added to your family office dashboard." }
        : { key: "publishing", label: "Updating dashboard", tone: "info", title: "Analysis complete. Your statement will appear here automatically when the update is ready." };
    }
    case "duplicate":
      return { key: "duplicate", label: "Already in library", tone: "gain", title: "This statement is already in your library. No duplicate was added." };
    default:
      return { key: "held", label: HOLD_LABEL[f.hold ?? ""] ?? "Needs attention", tone: f.hold === "needs-password" ? "warn" : "loss", title: HOLD_REASON[f.hold ?? ""] ?? "We could not finish analysing this statement. Please try again." };
  }
}

/** True while anything is still moving — the page keeps polling until it is not. */
export const inFlight = (batches: readonly InboxBatch[]) =>
  batches.some((b) => b.files.some((f) => f.status === "queued" || f.status === "processing"));

export type UploadOutcome =
  | { ok: true; saved: number; failed: { name: string; why: string }[]; started: boolean }
  | Failure;

const POLL_MS = 15_000;
const SEND_AT_ONCE = 3;
export type SendingStatement = { id: string; name: string; provider?: string; uploadedAt: string };
const LOCATION_KEY = "glow.statement-upload-folders";
const savedLocations = (): Record<string, string> => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(LOCATION_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string")) : {};
  } catch { return {}; }
};

/**
 * The inbox, kept fresh: read on arrival, on focus, and every few seconds while
 * a file is still queued or being read. Every change replaces it with the
 * service's own answer, so the page never shows a change GitHub refused.
 */
export function useStatementInbox() {
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [sending, setSending] = useState<SendingStatement[]>([]);
  // Presentation context only: analysis still decides the actual issuer.
  const [locations, setLocations] = useState(savedLocations);
  const alive = useRef(true);
  const requestVersion = useRef(0);

  const accept = useCallback((a: Answer) => {
    if (a.ok) {
      requestVersion.current++;
      if (alive.current) setState({ status: "ready", batches: batchesOf(a.body) });
    }
    return a;
  }, []);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    const a = await send();
    if (!alive.current || version !== requestVersion.current) return;
    // A refresh that fails keeps what was already shown — only a FIRST load
    // that fails says the service is unavailable.
    setState((prev) => a.ok ? { status: "ready", batches: batchesOf(a.body) }
      : prev.status === "ready" ? prev : { status: "unavailable", reason: a.reason, cause: a.cause });
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { alive.current = false; window.removeEventListener("focus", onFocus); };
  }, [load]);

  const moving = state.status === "ready" && inFlight(state.batches);
  useEffect(() => {
    if (!moving) return;
    const t = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [moving, load]);

  /**
   * Send every accepted file, then file them as one batch. `progress(done, of)`
   * ticks as each file is stored. A file GitHub refuses is reported by name and
   * the rest are still filed.
   */
  const upload = useCallback(async (files: UploadPlan["accepted"], progress?: (done: number, of: number) => void, provider?: string): Promise<UploadOutcome> => {
    const ticket = crypto.randomUUID();
    const temporary = files.map((f, i) => ({ id: `${ticket}/${i}`, name: f.name, provider, uploadedAt: new Date().toISOString() }));
    setSending(previous => [...temporary, ...previous]);
    try {
      const staged: { name: string; size: number; blob: string }[] = [];
      const failed: { name: string; why: string }[] = [];
      let done = 0;
      // Not configured / signed out / no service: every file would fail the same way.
      const halt: { on: Failure | null } = { on: null };
      const queue = [...files];
      const worker = async () => {
        for (let next = queue.shift(); next && !halt.on; next = queue.shift()) {
          const form = new FormData();
          form.append("name", next.name);
          form.append("file", next.file, next.file.name);
          const a = await send({ method: "POST", body: form });
          if (a.ok) {
            const s = a.body.staged as { name?: string; size?: number; blob?: string } | undefined;
            if (s?.blob && s.name) staged.push({ name: s.name, size: s.size ?? next.file.size, blob: s.blob });
            else failed.push({ name: next.name, why: "The service stored nothing for it." });
          } else if (a.cause === "error") {
            failed.push({ name: next.name, why: a.reason });
          } else {
            halt.on = a;
          }
          progress?.(++done, files.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(SEND_AT_ONCE, files.length) }, worker));
      if (halt.on) return halt.on;
      if (!staged.length) return { ok: true, saved: 0, failed, started: false };
      // Files sent at once arrive in any order; the batch keeps the order they were picked in.
      const order = new Map(files.map((f, i) => [f.name, i]));
      staged.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
      const c = accept(await postJson({ op: "commit", files: staged }));
      if (!c.ok) return c;
      const batch = isBatch(c.body.batch) ? c.body.batch : batchesOf(c.body).find(b => b.files.some(f => staged.some(s => s.blob === f.blob && s.name === f.name)));
      if (batch && provider && alive.current) setLocations(previous => {
        const next = { ...previous, [batch.id]: provider };
        try { sessionStorage.setItem(LOCATION_KEY, JSON.stringify(next)); } catch { /* Private browsing can refuse storage. */ }
        return next;
      });
      return { ok: true, saved: staged.length, failed, started: c.body.started === true };
    } finally {
      if (alive.current) setSending(previous => previous.filter(f => !f.id.startsWith(ticket + "/")));
    }
  }, [accept]);

  /** Put a batch's held files back in the queue. */
  const retry = useCallback(async (batch: string) => accept(await postJson({ op: "retry", batch })), [accept]);

  /** Take one queued or held file out of the inbox. */
  const remove = useCallback(async (batch: string, name: string) => accept(await postJson({ op: "remove", batch, name })), [accept]);

  return { state, sending, locations, upload, retry, remove, reload: load };
}
