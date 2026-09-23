// THE FAMILY'S OWN UPCOMING CAPITAL CALLS — the read side of `/api/capital-calls`.
//
// *"it simply needs to be a editable coloumn in this table itself which people
//  can add and edit capital call and save and it stays same for all."*
//
// ── WHAT THESE ARE, AND WHAT THEY ARE NOT ──────────────────────────────────
//
// A capital call the family has been TOLD is coming — a drawdown notice, an
// email from the manager — entered on the Private Market fund table and saved
// for everyone who opens the dashboard. No statement in this book prints one:
// not one of the archive's documents publishes a forward drawdown schedule,
// which is exactly why the page's old 1/3/6-month windows could only ever read
// "nothing scheduled".
//
// So they are the family's figures and never the funds'. Nothing here reaches
// `glowData.ts`, and no entered amount is ever added into Called, Paid in or
// Still to call — those are what the statements print, and a total mixing the
// two would be a figure no document stands behind.
//
// ── THE CAUSE PICKS THE SENTENCE ───────────────────────────────────────────
//
// Four different things stop the column filling, and they send a reader to
// four different places — `upstreamStatus.ts`'s rule, arriving through a
// store rather than a feed:
//
//   · the store is not connected yet (503 NOT_CONFIGURED) — somebody with the
//     Cloudflare account has one binding to add;
//   · the reader has been signed out (the edge gate answers the login page);
//   · no server function is running at all (a local preview serves the app's
//     own page for every path);
//   · the store answered with an error, which carries its own sentence.
//
// None of them is ever rendered as an empty column, which would read as "no
// calls are coming" — the one thing a reader could act on wrongly. Each cell
// names its cause in a word (`CAUSE_WORD`) and opens the editor on a click,
// where the whole reason is — and, for a store nobody has connected, the steps
// that connect it (`SWITCH_ON_STEPS`).
import { useCallback, useEffect, useRef, useState } from "react";

export type EnteredCall = {
  id: string;
  /** The fund row's `securityKey`. */
  fund: string;
  /** The fund's name as the table printed it when the call was saved — for a reader of the raw store. */
  fundName: string;
  /** YYYY-MM-DD — when the call is due. */
  date: string;
  /** Rupees. The base currency, whatever the reader's display currency is. */
  amount: number;
  note: string;
  updatedAt: string;
};

export type CallDraft = {
  id?: string;
  fund: string;
  fundName: string;
  date: string;
  amount: number;
  note: string;
};

/**
 * WHICH of the causes stopped the column filling. The reason is the sentence a
 * reader is shown; the cause is what picks the WORD on every cell and whether
 * the editor shows the one-time set-up steps — which belong only to a store
 * nobody has connected, never to a reader who was merely signed out.
 */
export type StoreCause = "not-configured" | "signed-out" | "no-function" | "no-answer" | "error";

export type EnteredCallsState =
  | { status: "loading" }
  | { status: "ready"; calls: EnteredCall[] }
  | { status: "unavailable"; reason: string; cause: StoreCause };

export const CALLS_ENDPOINT = "/api/capital-calls";

const isCall = (c: unknown): c is EnteredCall => {
  const x = c as EnteredCall;
  return !!x && typeof x.id === "string" && typeof x.fund === "string" && typeof x.date === "string"
    && typeof x.amount === "number" && Number.isFinite(x.amount) && x.amount > 0;
};

export const REASONS = {
  signedOut: "You have been signed out. Sign in again to see and save capital calls.",
  noFunction: "The shared capital-call store is not running here, so calls cannot be shown or saved.",
  notConfigured: "Saving is not switched on yet — the site's shared store has not been connected.",
  noAnswer: "The shared capital-call store did not answer. Nothing was lost; try again in a moment.",
} as const;

/**
 * ── THE WORD ON EVERY CELL ──────────────────────────────────────────────────
 *
 * *"We need to keep the ability for the customer to add a date in this Capital
 *  Call column, which is empty right now."* The column was not empty — every
 * cell was an em dash with its reason in a hover — and that is the finding: a
 * column of dashes reads as "nothing entered", which is the one misreading this
 * store was built to prevent. So each cell names its cause in a word a reader
 * can see, and is the button that opens the editor where the whole reason is.
 * Title case here; the column header prints it in lower case.
 */
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
 * The store is one Cloudflare KV namespace bound to the Pages project as
 * `GLOW_STORE`. Nothing in this repository can create it — it lives in the
 * Cloudflare account — so the editor names the steps rather than leaving the
 * next reader to find them in a code comment. Shown ONLY for `not-configured`.
 * Menu names as Cloudflare's own documentation gives them (checked 2026-09-23).
 */
export const SWITCH_ON_STEPS = [
  "In the Cloudflare dashboard, open Storage & databases → Workers KV → Create instance, and create a namespace (any name, e.g. glow-store).",
  "Open Workers & Pages → this site's Pages project → Settings → Bindings → Add → KV namespace. Variable name: GLOW_STORE; KV namespace: the one just created. Add it for Production, and for Preview too if preview links are used.",
  "Redeploy the site (Deployments → latest deployment → Retry deployment). Once it is live, reload this page: every cell turns into an Add button.",
] as const;

type Reply = { ok: true; calls: EnteredCall[] } | { ok: false; reason: string; cause: StoreCause };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readReply(r: Response): Promise<Reply> {
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
  let j: { ok?: boolean; calls?: unknown; code?: string; message?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.calls)) return { ok: true, calls: j.calls.filter(isCall) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: REASONS.notConfigured, cause: "not-configured" };
  return { ok: false, reason: j?.message || `The shared capital-call store answered HTTP ${r.status}.`, cause: "error" };
}

/**
 * Rupees from what a person types: "2 Cr", "2.5 crore", "50 L", "50 lakh",
 * "5 K", "₹2,50,00,000", "25000000". Null for anything else — a figure this
 * cannot read is refused rather than guessed at, because a misread unit is a
 * hundredfold error that looks like an ordinary amount.
 */
export function parseRupees(text: string): number | null {
  const t = String(text ?? "").trim().toLowerCase()
    .replace(/₹|\brs\.?|\binr\b/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
  const m = /^(\d+(?:\.\d+)?)\s*(cr|crs|crore|crores|l|lac|lacs|lakh|lakhs|k|thousand)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  const mult = unit.startsWith("cr") ? 1e7 : /^(l|lac|lakh)/.test(unit) ? 1e5 : unit ? 1e3 : 1;
  const v = Math.round(n * mult * 100) / 100;
  return Number.isFinite(v) && v > 0 && v <= 1e12 ? v : null;
}

/** A fund's calls, oldest first. */
export function callsOf(calls: readonly EnteredCall[], fund: string): EnteredCall[] {
  return calls.filter((c) => c.fund === fund).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/**
 * WHICH CALL A CELL SHOWS: the soonest one still to come, or — where every
 * call entered is already past — the latest, marked past. Showing nothing for
 * a fund whose only call is last week's would read as "never entered", and a
 * reader who just saved one would think the save had failed.
 */
export function headlineCall(calls: readonly EnteredCall[], fund: string, today: string):
  { call: EnteredCall; past: boolean; more: number } | null {
  const mine = callsOf(calls, fund);
  if (!mine.length) return null;
  const next = mine.find((c) => c.date >= today);
  const call = next ?? mine[mine.length - 1];
  return { call, past: !next, more: mine.length - 1 };
}

/** Today in the reader's own calendar, as the store's dates are written. */
export function todayIso(d = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function send(body: unknown): Promise<Reply> {
  try {
    const r = await fetch(CALLS_ENDPOINT, {
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

/**
 * The list, kept fresh. It is read on arrival and again whenever the window
 * regains focus — which is when somebody else's save is most likely to be the
 * thing the reader is looking for — and a save or a delete replaces it with the
 * store's own answer, so the column never shows a change the store refused.
 */
export function useEnteredCalls() {
  const [state, setState] = useState<EnteredCallsState>({ status: "loading" });
  const alive = useRef(true);

  const load = useCallback(async () => {
    let reply: Reply;
    try {
      reply = await readReply(await fetch(CALLS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
    } catch {
      reply = { ok: false, reason: REASONS.noAnswer, cause: "no-answer" };
    }
    if (!alive.current) return;
    // A REFRESH THAT FAILS KEEPS WHAT WAS ALREADY SHOWN. Swapping a list that
    // loaded a minute ago for a failure sentence, because a background re-read
    // on focus hit a blip, would empty the column under a reader who changed
    // nothing — only a FIRST load that fails says the store is unavailable.
    setState((prev) => reply.ok ? { status: "ready", calls: reply.calls }
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
    if (reply.ok && alive.current) setState({ status: "ready", calls: reply.calls });
    return reply;
  };

  const save = useCallback(async (call: CallDraft) => apply(await send({ op: "save", call })), []);
  const remove = useCallback(async (id: string) => apply(await send({ op: "delete", id })), []);

  return { state, save, remove, reload: load };
}
