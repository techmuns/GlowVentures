/**
 * ── SENDING THE FAMILY'S LEVELS TO GLOW CENTRAL RESEARCH ─────────────────────
 *
 * `researchLevels.ts` decides WHAT to send and what an answer means; this file
 * sends it, remembers what arrived, and tells every card. Stage 10cn.
 *
 * AUTOMATIC, WHEREVER THE LEVEL WAS TYPED. `ResearchLevelSync`
 * (`useResearchSync.ts`) is mounted once in the app shell, so a level saved on
 * any page is sent within a second, a page load sends whatever did not arrive
 * last time, and a failed send is tried again on its own — on a timer chosen by
 * what went wrong, and the moment the browser comes back online. The family
 * never has to press anything.
 *
 * ONE SENDER ACROSS TABS. Two open tabs would otherwise both send the same
 * seed, the second would come back "already heard of", and that tab would
 * wrongly report another device's levels. The Web Locks API serialises the
 * sends, and each one re-reads what the last one recorded before deciding.
 *
 * WHAT ARRIVED IS KEPT BESIDE THE STORE (`glow:research-levels/v1`), never in
 * it: the levels are the family's, the acknowledgement is a fact about another
 * app, and mixing them would let a failed send look like a changed level.
 *
 * A FAILURE SAYS WHICH FAILURE. A refused address, an offline browser, a
 * receiving side not switched on yet and a receiving side that is down send a
 * reader to four different places, so each is worded apart. A refused address
 * carries no CORS header — the browser shows it as a bare network error — so an
 * opaque failure is followed by one plain GET, which that list answers to every
 * origin, to tell "refused" from "unreachable".
 *
 * NO REACT HERE, so the suite drives a real send against a stubbed network; the
 * hooks and the component that call it are in `useResearchSync.ts`.
 */
import {
  EMPTY_SENT, RESEARCH_LEVELS_URL, applyOutcomes, batchesOf, intentsFor, pruneSent, retryDelayMs, withSeeds,
  type Attempt, type FailCode, type HeldCompany, type Intent, type Outcome, type ResearchLevel, type SentState,
} from "./researchLevels";

const STATE_KEY = "glow:research-levels/v1";
const LOCK = "glow-research-levels";

export type ResearchState = SentState & {
  /** The last attempt, whatever its outcome — what a card says when a level has not arrived. */
  attempt: Attempt | null;
  /** Consecutive failures, which set how long the next wait is. */
  failures: number;
};

const EMPTY_STATE: ResearchState = { ...EMPTY_SENT, attempt: null, failures: 0 };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Parse what was stored, dropping anything malformed rather than trusting it. */
function coerce(raw: unknown): ResearchState {
  if (!isRecord(raw)) return EMPTY_STATE;
  const strings = (v: unknown) =>
    Object.fromEntries(Object.entries(isRecord(v) ? v : {}).filter(([, x]) => typeof x === "string")) as Record<string, string>;
  const marks = <W extends string>(v: unknown, whys: readonly W[]) =>
    Object.fromEntries(Object.entries(isRecord(v) ? v : {}).filter(([, x]) =>
      isRecord(x) && typeof x.fp === "string" && whys.includes(x.why as W))) as Record<string, { fp: string; why: W }>;
  const a = raw.attempt;
  const attempt: Attempt | null = isRecord(a) && typeof a.at === "string" && typeof a.ok === "boolean"
    ? { at: a.at, ok: a.ok, code: typeof a.code === "string" ? a.code as FailCode : null,
        retryAt: typeof a.retryAt === "string" ? a.retryAt : null }
    : null;
  return {
    since: typeof raw.since === "string" ? raw.since : null,
    seeds: strings(raw.seeds),
    acked: strings(raw.acked),
    declined: marks(raw.declined, ["elsewhere", "removed"] as const),
    refused: marks(raw.refused, ["full"] as const),
    attempt,
    failures: typeof raw.failures === "number" && Number.isFinite(raw.failures) ? raw.failures : 0,
  };
}

function readState(): ResearchState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? coerce(JSON.parse(raw)) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

// ── ONE SNAPSHOT, and every card hears a change — in this tab or another. ────
let snapshot: ResearchState | null = null;
let busy = false;
const listeners = new Set<() => void>();
const notify = () => { for (const l of [...listeners]) l(); };
const onStorage = (e: StorageEvent) => {
  if (e.key !== null && e.key !== STATE_KEY) return;
  snapshot = null;
  notify();
};

export function researchSnapshot(): ResearchState {
  if (snapshot === null) snapshot = readState();
  return snapshot;
}

export function subscribeResearch(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function writeState(s: ResearchState): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* private mode, quota — kept for the session */ }
  snapshot = s;
  notify();
}

/** Is a send in flight in THIS tab — what lets a card say "sending" rather than "waiting". */
export const researchBusy = () => busy;

const timeout = (ms: number): AbortSignal | undefined => {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
};

type Posted = { ok: true; outcomes: Outcome[]; companies: HeldCompany[] } | { ok: false; code: FailCode };

/** An opaque failure, told apart by one open GET. */
async function diagnose(): Promise<FailCode> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  try {
    const r = await fetch(RESEARCH_LEVELS_URL, { mode: "cors", credentials: "omit", cache: "no-store", signal: timeout(10_000) });
    if (r.status === 404) return "not-ready";
    // The list answered this address, so what refused the write was the address itself.
    return r.ok ? "not-allowed" : "unreachable";
  } catch {
    return "unreachable";
  }
}

async function post(batch: readonly Intent[]): Promise<Posted> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, code: "offline" };
  let res: Response;
  try {
    res = await fetch(RESEARCH_LEVELS_URL, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intents: batch }),
      signal: timeout(15_000),
    });
  } catch {
    return { ok: false, code: await diagnose() };
  }
  // The route not existing yet is the receiving side not deployed — not an outage.
  if (res.status === 404) return { ok: false, code: "not-ready" };
  if (res.status === 403) return { ok: false, code: "not-allowed" };
  if (res.status === 429) return { ok: false, code: "rate-limited" };
  if (res.status === 400 || res.status === 413 || res.status === 415) return { ok: false, code: "invalid" };
  if (!res.ok) return { ok: false, code: "error" };
  let body: unknown;
  try { body = await res.json(); } catch { return { ok: false, code: "error" }; }
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.outcomes)) return { ok: false, code: "error" };
  return {
    ok: true,
    outcomes: body.outcomes.filter((o): o is Outcome => isRecord(o) && typeof o.ticker === "string" && typeof o.outcome === "string"),
    companies: Array.isArray(body.companies)
      ? body.companies.filter((c): c is HeldCompany => isRecord(c) && typeof c.ticker === "string" && isRecord(c.levels))
      : [],
  };
}

/**
 * ONE SEND: everything that has not arrived, in the receiving side's batch
 * size, stopping at the first failure so a retry resumes where it stopped.
 * Nothing to send is itself a success — a failure left over from a level since
 * removed must not go on showing.
 */
async function sendOnce(want: readonly ResearchLevel[], now: () => Date): Promise<void> {
  let s = readState();
  s = { ...s, ...pruneSent(s, want) };
  s = { ...s, ...withSeeds(s, want, now().toISOString()) };
  const intents = intentsFor(want, s);
  const done = (): ResearchState => ({ ...s, attempt: { at: now().toISOString(), ok: true, code: null, retryAt: null }, failures: 0 });
  if (!intents.length) {
    writeState(s.attempt?.ok === false || !s.attempt ? done() : s);
    return;
  }
  for (const batch of batchesOf(intents)) {
    const r = await post(batch);
    if (!r.ok) {
      const failures = s.failures + 1;
      const wait = retryDelayMs(r.code, failures);
      writeState({
        ...s, failures,
        attempt: { at: now().toISOString(), ok: false, code: r.code, retryAt: wait === null ? null : new Date(now().getTime() + wait).toISOString() },
      });
      return;
    }
    s = { ...s, ...applyOutcomes(s, batch, r.outcomes, r.companies) };
    writeState(s);
  }
  writeState(done());
}

let queued: readonly ResearchLevel[] | null = null;
let running: Promise<void> | null = null;

/**
 * Send what has not arrived. Safe to call as often as anything changes: a call
 * while a send is running is folded into ONE more send afterwards, with the
 * latest levels, rather than racing it.
 */
export function syncResearchLevels(want: readonly ResearchLevel[], now: () => Date = () => new Date()): Promise<void> {
  queued = want;
  if (running) return running;
  const run = async () => {
    busy = true;
    notify();
    try {
      while (queued) {
        const next = queued;
        queued = null;
        const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
        if (locks?.request) await locks.request(LOCK, () => sendOnce(next, now));
        else await sendOnce(next, now);
      }
    } catch {
      // A send that threw is an attempt that failed; the next change or timer tries again.
    } finally {
      busy = false;
      running = null;
      notify();
    }
  };
  running = run();
  return running;
}
