// AN ENTERED SHARE COUNT PER PRIVATE HOLDING (#434) — the read side of
// `/api/holding-shares`.
//
//   *"Enter private share counts from CAS / MGT-7, or by hand, where the
//    statement carries none."*
//
// A private holding's statement records what the family PAID, not how many
// shares it holds, so the stake cannot be struck (`stakeTrail`). This is the
// count the family reads off a depository CAS, an MGT-7 the company files, or an
// allotment letter and types in — one per company, saved for everyone, with the
// DOCUMENT it is from kept beside it. The same shared store and the same four
// causes as the capital calls (`enteredCalls.ts`).
//
// It is read only where the statement carries no count, and every figure it
// unlocks is labelled on the page as struck on an entered count, not a
// statement — never blended into the book.
import { useCallback, useEffect, useRef, useState } from "react";
import { REASONS as CALL_REASONS, type StoreCause } from "./enteredCalls";

export type HoldingShares = {
  /** The private company's own slug id (`privateRounds.ts`). */
  key: string;
  /** The company's name as the page printed it when saved — for a reader of the raw store. */
  label: string;
  /** The number of shares the family holds. */
  shares: number;
  /** Where the count is from — "CAS 31 Mar 2026", "MGT-7 FY24", "Allotment letter", "by hand". */
  source: string;
  updatedAt: string;
};

export type HoldingSharesDraft = { key: string; label: string; shares: number; source: string };

export type HoldingSharesState =
  | { status: "loading" }
  | { status: "ready"; records: HoldingShares[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const SHARES_ENDPOINT = "/api/holding-shares";

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to see and save share counts.",
  noFunction: "The shared store is not running here, so share counts cannot be shown or saved.",
  notConfigured: CALL_REASONS.notConfigured,
  noAnswer: "The shared store did not answer. Nothing was lost; try again in a moment.",
} as const;

const isRec = (r: unknown): r is HoldingShares => {
  const x = r as HoldingShares;
  return !!x && typeof x.key === "string" && x.key.length > 0
    && typeof x.shares === "number" && Number.isFinite(x.shares) && x.shares > 0
    && typeof x.source === "string" && x.source.length > 0
    && typeof x.label === "string";
};

type Reply = { ok: true; records: HoldingShares[] } | { ok: false; reason: string; cause: StoreCause };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readReply(r: Response): Promise<Reply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    return text.includes("/__auth/login")
      ? { ok: false, reason: REASONS.signedOut, cause: "signed-out" }
      : { ok: false, reason: REASONS.noFunction, cause: "no-function" };
  }
  let j: { ok?: boolean; shares?: unknown; code?: string; message?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.shares)) return { ok: true, records: j.shares.filter(isRec) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  return { ok: false, reason: j?.message || `The shared store answered HTTP ${r.status}.`, cause: "error" };
}

/**
 * A share count from what a person types: "1,20,000", "120000", "1.2 L",
 * "33 lakh", "1.2 Cr". Null for anything else — a count this cannot read is
 * refused rather than guessed, because a misread unit is a hundredfold error.
 */
export function parseShares(text: string): number | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/shares?\b/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
  const m = /^(\d+(?:\.\d+)?)\s*(cr|crs|crore|crores|l|lac|lacs|lakh|lakhs|k|thousand)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  const mult = unit.startsWith("cr") ? 1e7 : /^(l|lac|lakh)/.test(unit) ? 1e5 : unit ? 1e3 : 1;
  const v = Math.round(n * mult * 1e4) / 1e4;
  return Number.isFinite(v) && v > 0 && v <= 1e13 ? v : null;
}

/** A share count written back the way it reads, so an edit round-trips. */
export function sharesText(shares: number): string {
  return Number.isInteger(shares) ? shares.toLocaleString("en-IN") : String(shares);
}

/** The count saved for one holding, if any. */
export const sharesFor = (records: readonly HoldingShares[], key: string): HoldingShares | null =>
  records.find((r) => r.key === key) ?? null;

async function send(body: unknown): Promise<Reply> {
  try {
    const r = await fetch(SHARES_ENDPOINT, {
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

/** The counts, kept fresh — read on arrival and whenever the window regains focus. */
export function useHoldingShares() {
  const [state, setState] = useState<HoldingSharesState>({ status: "loading" });
  const alive = useRef(true);
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);

  const load = useCallback(async () => {
    const started = revision.current;
    await writes.current;
    let reply: Reply;
    try {
      reply = await readReply(await fetch(SHARES_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
    } catch {
      reply = { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    if (!alive.current || started !== revision.current) return;
    setState((prev) => reply.ok ? { status: "ready", records: reply.records }
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
    if (reply.ok && alive.current) setState({ status: "ready", records: reply.records });
    return reply;
  };
  const mutate = useCallback((body: unknown) => {
    revision.current++;
    const result = writes.current.then(async () => apply(await send(body)));
    writes.current = result.then(() => {}, () => {});
    return result;
  }, []);
  const save = useCallback(async (rec: HoldingSharesDraft) => mutate({ op: "save", rec }), [mutate]);
  const remove = useCallback(async (key: string) => mutate({ op: "delete", key }), [mutate]);

  return { state, save, remove, reload: load };
}
