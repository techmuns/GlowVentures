// WHICH KPI TILES A PAGE SHOWS — remembered, and the same next time.
//
// *"When we are selecting a particular KPI tile, after changing the metric that
//  we want to see on it, make sure that it is being saved and next time when we
//  come on the dashboard it should be in the same format as it was after we
//  changed it."*
//
// ── TWO MEMORIES, AND WHICH ONE WINS ────────────────────────────────────────
//
//   1. THE SHARED STORE (`/api/tile-sets`, Cloudflare KV). The layout the
//      dashboard was last left in, by anyone, on any device. This is what makes
//      "next time" true on a second laptop, on a phone, after a cleared browser
//      and inside the frame the dashboard is embedded in — none of which a
//      browser's own storage survives.
//   2. THIS BROWSER (`localStorage`). Painted from first, so a page never opens
//      on the default four and then jumps to the saved ones; and the whole of
//      the memory where the shared store is not connected.
//
// The shared store wins once it answers, EXCEPT over a change this browser made
// that the store never confirmed — that change is the newest thing anybody did
// to the strip, and it is pushed rather than overwritten. A choice the reader
// just made must never silently revert because a request failed on the way.
//
// Only METRIC IDS are ever stored. The page decides what an id means from the
// book when it renders, so nothing saved here can put a figure on screen, and an
// id a later build does not know is dropped by the strip rather than drawn blank.
import { useSyncExternalStore } from "react";

export const TILE_SETS_ENDPOINT = "/api/tile-sets";

export type TileSetsState =
  | { status: "loading" }
  | { status: "shared"; sets: Record<string, string[]> }
  | { status: "local"; reason: string };

/**
 * WHERE THE CHOICE IS KEPT, IN WORDS — shown inside the tile picker, never on
 * the strip. A reader who changes a tile on a deployment whose shared store is
 * not connected is entitled to know it will not follow them to another device,
 * and the cause picks the sentence: each of these sends a reader somewhere
 * different, which is `upstreamStatus.ts`'s rule arriving through a preference.
 */
export const TILE_REASONS = {
  notConfigured: "Saved in this browser only — the dashboard's shared store has not been switched on yet.",
  noFunction: "Saved in this browser only — the shared store is not running here.",
  signedOut: "Saved in this browser only — you have been signed out, so it could not be saved for everyone.",
  noAnswer: "Saved in this browser for now — the shared store did not answer.",
} as const;
export const SAVED_FOR_EVERYONE = "Saved for everyone — the dashboard opens this way on any device.";

type Reply = { ok: true; sets: Record<string, string[]> } | { ok: false; reason: string };

const cleanIds = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string") ? (v as string[]) : null;

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readTileReply(r: Response): Promise<Reply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    return { ok: false, reason: text.includes("/__auth/login") ? TILE_REASONS.signedOut : TILE_REASONS.noFunction };
  }
  let j: { ok?: boolean; sets?: unknown; code?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && j.sets && typeof j.sets === "object") {
    const sets: Record<string, string[]> = {};
    for (const [page, v] of Object.entries(j.sets as Record<string, unknown>)) {
      const ids = cleanIds((v as { ids?: unknown })?.ids);
      if (ids) sets[page] = ids;
    }
    return { ok: true, sets };
  }
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: TILE_REASONS.notConfigured };
  return { ok: false, reason: TILE_REASONS.noAnswer };
}

// ── ONE REQUEST PER PAGE LOAD, SHARED BY EVERY STRIP ─────────────────────────
//
// Morning CIO and Private Market each carry a strip, and a reader moving between
// them should not refetch or see the two disagree about what the store holds. A
// module-level snapshot with subscribers is the whole of it; a save replaces it
// with the store's own answer.
let state: TileSetsState = { status: "loading" };
let started = false;
const listeners = new Set<() => void>();
const emit = (next: TileSetsState) => { state = next; listeners.forEach((l) => l()); };

async function load() {
  let reply: Reply;
  try {
    reply = await readTileReply(await fetch(TILE_SETS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
  } catch {
    reply = { ok: false, reason: TILE_REASONS.noAnswer };
  }
  emit(reply.ok ? { status: "shared", sets: reply.sets } : { status: "local", reason: reply.reason });
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!started) { started = true; void load(); }
  return () => { listeners.delete(l); };
}

/** Save one page's set. Resolves to whether the SHARED store took it. */
export async function saveTileSet(page: string, ids: string[]): Promise<boolean> {
  let reply: Reply;
  try {
    const r = await fetch(TILE_SETS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ page, ids }),
    });
    reply = await readTileReply(r);
  } catch {
    reply = { ok: false, reason: TILE_REASONS.noAnswer };
  }
  if (reply.ok) {
    // The store's own answer, with this save applied — so a strip on another
    // page reads the same list without asking again.
    emit({ status: "shared", sets: { ...reply.sets, [page]: ids } });
    return true;
  }
  // A FAILED SAVE DOES NOT DISCARD WHAT THE STORE HAD. Only the status moves,
  // so the picker can say where the choice went.
  emit({ status: "local", reason: reply.reason });
  return false;
}

export function useTileSets(): TileSetsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ── THIS BROWSER'S COPY ─────────────────────────────────────────────────────
//
// `{ ids, synced }`. `synced: false` marks a choice the shared store has not
// confirmed — made while it was down, or before it was connected — and that
// flag is what lets the newest change win over an older shared one rather than
// being quietly overwritten on the next load. An older build stored a bare
// array; that is read too, as a choice of unknown age, which is pushed only
// where the store holds nothing for the page.
export type LocalTileSet = { ids: string[]; synced: boolean; legacy?: boolean };

export function readLocalTileSet(key: string): LocalTileSet | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    const legacy = cleanIds(v);
    if (legacy) return { ids: legacy, synced: false, legacy: true };
    const ids = cleanIds((v as LocalTileSet)?.ids);
    return ids ? { ids, synced: (v as LocalTileSet).synced === true } : null;
  } catch {
    return null;   // private mode, or a value this build cannot parse
  }
}

export function writeLocalTileSet(key: string, ids: string[], synced: boolean) {
  try { window.localStorage.setItem(key, JSON.stringify({ ids, synced })); } catch { /* private mode */ }
}

/**
 * WHICH SET TO SHOW, before the page's own catalogue filters it. Pure, so the
 * rule is testable without a browser:
 *
 *   a `?tiles=` address  >  an unsynced change made in this browser
 *                        >  the shared store's set  >  this browser's copy.
 *
 * `null` means "nothing chosen" and the strip draws its default.
 */
export function chooseTileSet(opts: {
  fromParam: string[] | null;
  local: LocalTileSet | null;
  shared: string[] | null;
  sharedLoaded: boolean;
}): { ids: string[] | null; push: boolean } {
  const { fromParam, local, shared, sharedLoaded } = opts;
  if (fromParam?.length) return { ids: fromParam, push: false };
  if (local && !local.synced && !local.legacy) return { ids: local.ids, push: sharedLoaded };
  if (shared?.length) return { ids: shared, push: false };
  if (local) return { ids: local.ids, push: sharedLoaded && !local.synced };
  return { ids: null, push: false };
}
