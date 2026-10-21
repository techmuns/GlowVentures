// THE STRATEGY AND DESCRIPTION THE FAMILY TYPES ON THE TABLE — the read side of
// `/api/investment-profiles`.
//
// *"give the option to edit and write information in the strategy and
//  description cells just like the capital call cells."*
//
// The same shared store and the same four causes as the capital calls
// (`enteredCalls.ts` — `StoreCause`, `CAUSE_WORD`, `SWITCH_ON_STEPS` are that
// file's, so the two columns can never word one outage two ways).
//
// ── WHICH TEXT A CELL SHOWS ────────────────────────────────────────────────
//
// What the family typed on the dashboard is the newest record of all, so it
// is shown over a supplied file's text for the same investment; removing it
// shows the file's again. Either way the hover says which it is.
import { useCallback, useEffect, useRef, useState } from "react";
import { REASONS as CALL_REASONS, type StoreCause } from "./enteredCalls";
import { PROFILE_FIELDS, type InvestmentProfile, type ProfileFieldId } from "./investmentProfiles";

export type EnteredProfile = {
  /** The investment's key — `callKeyOf(fundKey, securityKey)`, the capital calls' own. */
  fund: string;
  field: ProfileFieldId;
  fundName: string;
  text: string;
  updatedAt: string;
};

export type EnteredProfilesState =
  | { status: "loading" }
  | { status: "ready"; profiles: EnteredProfile[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const PROFILES_ENDPOINT = "/api/investment-profiles";

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to see and save strategies and descriptions.",
  noFunction: "The shared store is not running here, so typed strategies and descriptions cannot be shown or saved.",
  notConfigured: CALL_REASONS.notConfigured,
  noAnswer: "The shared store did not answer. Nothing was lost; try again in a moment.",
} as const;

const isProfile = (p: unknown): p is EnteredProfile => {
  const x = p as EnteredProfile;
  return !!x && typeof x.fund === "string" && (PROFILE_FIELDS as readonly string[]).includes(x.field)
    && typeof x.text === "string" && x.text.length > 0;
};

type Reply = { ok: true; profiles: EnteredProfile[] } | { ok: false; reason: string; cause: StoreCause };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readReply(r: Response): Promise<Reply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    return text.includes("/__auth/login")
      ? { ok: false, reason: REASONS.signedOut, cause: "signed-out" }
      : { ok: false, reason: REASONS.noFunction, cause: "no-function" };
  }
  let j: { ok?: boolean; profiles?: unknown; code?: string; message?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.profiles)) return { ok: true, profiles: j.profiles.filter(isProfile) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  return { ok: false, reason: j?.message || `The shared store answered HTTP ${r.status}.`, cause: "error" };
}

const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10)
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * ONE INVESTMENT'S CELLS WITH WHAT THE FAMILY TYPED LAID OVER THE FILE'S.
 * `keys` are the investment's store keys — one for a fund or a folio line,
 * several for a legal-name or brand row, whose text is then shown only where
 * every one of them carries the same.
 */
export function withEntered(base: InvestmentProfile, entered: readonly EnteredProfile[], key: string): InvestmentProfile {
  const out = { ...base };
  for (const field of PROFILE_FIELDS) {
    const e = entered.find((p) => p.fund === key && p.field === field);
    if (e) out[field] = { value: e.text, source: `typed on the dashboard${e.updatedAt ? ` · ${dateOf(e.updatedAt)}` : ""}`, matchedOn: "entered", reason: null };
  }
  return out;
}

/** The entered record for a key and field, if any. */
export const enteredOf = (entered: readonly EnteredProfile[], key: string, field: ProfileFieldId) =>
  entered.find((p) => p.fund === key && p.field === field) ?? null;

async function send(body: unknown): Promise<Reply> {
  try {
    const r = await fetch(PROFILES_ENDPOINT, {
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

/** The entered texts, kept fresh — read on arrival and whenever the window regains focus. */
export function useEnteredProfiles() {
  const [state, setState] = useState<EnteredProfilesState>({ status: "loading" });
  const alive = useRef(true);

  const load = useCallback(async () => {
    let reply: Reply;
    try {
      reply = await readReply(await fetch(PROFILES_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
    } catch {
      reply = { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    if (!alive.current) return;
    // A refresh that fails keeps what was already shown (`enteredCalls.ts`).
    setState((prev) => reply.ok ? { status: "ready", profiles: reply.profiles }
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
    if (reply.ok && alive.current) setState({ status: "ready", profiles: reply.profiles });
    return reply;
  };
  const save = useCallback(async (funds: readonly string[], field: ProfileFieldId, fundName: string, text: string) =>
    apply(await send({ op: "save", funds, field, fundName, text })), []);
  const remove = useCallback(async (funds: readonly string[], field: ProfileFieldId) =>
    apply(await send({ op: "delete", funds, field })), []);

  return { state, save, remove, reload: load };
}
