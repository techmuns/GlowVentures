// A DOCUMENTS-FOLDER LINK PER PRIVATE HOLDING (#420) — the read side of
// `/api/holding-links`.
//
//   *"Open OneDrive folder link per investment."*
//
// One external URL per private company — the cloud folder where the family
// keeps that holding's paperwork — saved once and seen by everyone. The same
// shared store and the same four causes as the capital calls
// (`enteredCalls.ts` — `StoreCause`, `CAUSE_WORD`, `SWITCH_ON_STEPS` are that
// file's, so these controls can never word one outage two ways).
//
// It is a POINTER, not an upload: the files the family uploads from Private
// Market live in the Portfolio Library (`holdingDocuments.ts`). This is the
// link to a folder that lives elsewhere, and nothing is ever derived from it.
import { useCallback, useEffect, useRef, useState } from "react";
import { REASONS as CALL_REASONS, type StoreCause } from "./enteredCalls";

export type HoldingLink = {
  /** The private company's own slug id (`privateRounds.ts`). */
  key: string;
  /** What to call the folder — a short label, or empty for the default. */
  label: string;
  /** The folder's http(s) web address. */
  url: string;
  note: string;
  updatedAt: string;
};

export type HoldingLinkDraft = { key: string; label: string; url: string; note: string };

export type HoldingLinksState =
  | { status: "loading" }
  | { status: "ready"; links: HoldingLink[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const LINKS_ENDPOINT = "/api/holding-links";

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to see and save documents-folder links.",
  noFunction: "The shared store is not running here, so documents-folder links cannot be shown or saved.",
  notConfigured: CALL_REASONS.notConfigured,
  noAnswer: "The shared store did not answer. Nothing was lost; try again in a moment.",
} as const;

/** Only an http(s) address is ever rendered as a link; anything else is dropped, as the server refuses it. */
export function isHttpUrl(s: unknown): s is string {
  if (typeof s !== "string" || !s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const isLink = (l: unknown): l is HoldingLink => {
  const x = l as HoldingLink;
  return !!x && typeof x.key === "string" && x.key.length > 0 && isHttpUrl(x.url)
    && typeof x.label === "string" && typeof x.note === "string";
};

type Reply = { ok: true; links: HoldingLink[] } | { ok: false; reason: string; cause: StoreCause };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readReply(r: Response): Promise<Reply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    return text.includes("/__auth/login")
      ? { ok: false, reason: REASONS.signedOut, cause: "signed-out" }
      : { ok: false, reason: REASONS.noFunction, cause: "no-function" };
  }
  let j: { ok?: boolean; links?: unknown; code?: string; message?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.links)) return { ok: true, links: j.links.filter(isLink) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  return { ok: false, reason: j?.message || `The shared store answered HTTP ${r.status}.`, cause: "error" };
}

/** The link saved for one holding, if any. */
export const linkFor = (links: readonly HoldingLink[], key: string): HoldingLink | null =>
  links.find((l) => l.key === key) ?? null;

/** A folder's address shortened for display — the host and nothing of the query. */
export function linkHost(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

async function send(body: unknown): Promise<Reply> {
  try {
    const r = await fetch(LINKS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    return await readReply(r);
  } catch {
    return { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
  }
}

/** The links, kept fresh — read on arrival and whenever the window regains focus. */
export function useHoldingLinks() {
  const [state, setState] = useState<HoldingLinksState>({ status: "loading" });
  const alive = useRef(true);
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);

  const load = useCallback(async () => {
    const started = revision.current;
    await writes.current;
    let reply: Reply;
    try {
      reply = await readReply(await fetch(LINKS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
    } catch {
      reply = { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    if (!alive.current || started !== revision.current) return;
    // A refresh that fails keeps what was already shown (`enteredCalls.ts`).
    setState((prev) => reply.ok ? { status: "ready", links: reply.links }
      : prev.status === "ready" ? prev : { status: "unavailable", reason: reply.reason, cause: reply.cause });
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { alive.current = false; window.removeEventListener("focus", onFocus); };
  }, [load]);

  const apply = (reply: Reply) => {
    if (reply.ok && alive.current) setState({ status: "ready", links: reply.links });
    return reply;
  };
  const mutate = useCallback((body: unknown) => {
    revision.current++;
    const result = writes.current.then(async () => apply(await send(body)));
    writes.current = result.then(() => {}, () => {});
    return result;
  }, []);
  const save = useCallback(async (link: HoldingLinkDraft) => mutate({ op: "save", link }), [mutate]);
  const remove = useCallback(async (key: string) => mutate({ op: "delete", key }), [mutate]);

  return { state, save, remove, reload: load };
}
