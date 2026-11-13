// THE PRIVATE-MARKET WATCHLIST — the read side of `/api/private-watchlist`.
//
// *"Is there a tab for watch list over here? … Can you add it? … Manually
//  [added companies]."* — Pratik, 22 Oct 2026 (client #310).
//
// Companies and funds the family is WATCHING, not holding — added by hand, with
// a name, kind (company/fund), legal entity, sector, notes and who added it.
// Saved for everyone, in the dashboard's shared store (`shared/dashboardStore.mjs`),
// so a company added on one laptop is on every screen that opens the site.
//
// It is the family's own judgement, kept deliberately apart from the book:
// nothing here reaches `glowData.ts` or any holding total. The four store
// causes, their words and the one-time set-up steps are the capital calls'
// (`enteredCalls.ts`), so a watchlist outage and a capital-call outage can never
// be worded two different ways.
import { useCallback, useEffect, useRef, useState } from "react";
import { CAUSE_WORD, REASONS as CALL_REASONS, SWITCH_ON_STEPS, type StoreCause } from "./enteredCalls";

export { CAUSE_WORD, SWITCH_ON_STEPS, type StoreCause };

export type WatchKind = "company" | "fund";

export type WatchItem = {
  id: string;
  /** The company or fund name. */
  name: string;
  kind: WatchKind;
  /** The brand or legal entity, where known. */
  legalEntity: string;
  sector: string;
  notes: string;
  /** Who added it — free text, since the dashboard has one shared sign-in, not per-person accounts. */
  addedBy: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
};

export type WatchDraft = {
  id?: string;
  name: string;
  kind: WatchKind;
  legalEntity: string;
  sector: string;
  notes: string;
  addedBy: string;
};

export type WatchlistState =
  | { status: "loading" }
  | { status: "ready"; items: WatchItem[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const WATCHLIST_ENDPOINT = "/api/private-watchlist";

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to see and save the watchlist.",
  noFunction: "The shared watchlist store is not running here, so the watchlist cannot be shown or saved.",
  notConfigured: CALL_REASONS.notConfigured,
  noAnswer: "The shared watchlist store did not answer. Nothing was lost; try again in a moment.",
} as const;

const isItem = (c: unknown): c is WatchItem => {
  const x = c as WatchItem;
  return !!x && typeof x.id === "string" && typeof x.name === "string" && x.name.length > 0
    && (x.kind === "company" || x.kind === "fund")
    && typeof x.legalEntity === "string" && typeof x.sector === "string"
    && typeof x.notes === "string" && typeof x.addedBy === "string" && typeof x.updatedAt === "string";
};

type Reply = { ok: true; items: WatchItem[] } | { ok: false; reason: string; cause: StoreCause };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readReply(r: Response): Promise<Reply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    // The edge gate answers an unauthenticated request with its login page; a
    // local preview answers with the app's own shell. Both are HTML and only
    // one of them is the reader's to fix.
    return text.includes("/__auth/login")
      ? { ok: false, reason: REASONS.signedOut, cause: "signed-out" }
      : { ok: false, reason: REASONS.noFunction, cause: "no-function" };
  }
  let j: { ok?: boolean; items?: unknown; code?: string; message?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.items)) return { ok: true, items: j.items.filter(isItem) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  return { ok: false, reason: j?.message || `The shared watchlist store answered HTTP ${r.status}.`, cause: "error" };
}

async function send(body: unknown): Promise<Reply> {
  try {
    const r = await fetch(WATCHLIST_ENDPOINT, {
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

/** A readable "added 3 Nov 2026" from an ISO timestamp. */
export function addedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10)
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The watchlist, kept fresh. It is read on arrival and again whenever the
 * window regains focus — when somebody else's save is most likely the thing the
 * reader came back for — and a save or a delete replaces it with the store's
 * own answer, so the list never shows a change the store refused. A refresh
 * that fails keeps what was already shown; only a FIRST load that fails says
 * the store is unavailable.
 */
export function usePrivateWatchlist() {
  const [state, setState] = useState<WatchlistState>({ status: "loading" });
  const alive = useRef(true);
  const writes = useRef(Promise.resolve());

  const load = useCallback(async () => {
    await writes.current;
    let reply: Reply;
    try {
      reply = await readReply(await fetch(WATCHLIST_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
    } catch {
      reply = { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    if (!alive.current) return;
    setState((prev) => reply.ok ? { status: "ready", items: reply.items }
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
    if (reply.ok && alive.current) setState({ status: "ready", items: reply.items });
    return reply;
  };
  // Serialize writes so a later response cannot hide an earlier successful edit.
  const mutate = useCallback((body: unknown) => {
    const result = writes.current.then(async () => apply(await send(body)));
    writes.current = result.then(() => {}, () => {});
    return result;
  }, []);

  const save = useCallback(async (item: WatchDraft) => mutate({ op: "save", item }), [mutate]);
  const remove = useCallback(async (id: string) => mutate({ op: "delete", id }), [mutate]);

  return { state, save, remove, reload: load };
}
