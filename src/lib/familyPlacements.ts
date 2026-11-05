// WHERE THE FAMILY HAS MOVED A HOLDING — read by every surface that sections on an axis.
//
// *"Allow the ability for any security or row to move any sub tab by doing
//  right click — for example if i want to move DSP gold from alternate to any
//  other i should be able to do so"* — the family, 4 Nov 2026 (Stage 10lm).
//
// ── THE SAME STANDING AS THE REVIEW'S OWN MAP ───────────────────────────────
//
// `FAMILY_TAXONOMY` is the family's judgement, committed from their workbook;
// this is the same judgement made on the page. So it is read where that map is
// read — `familyAssetClass`, `familyBasket` and the category branch of
// `groupKeyFor` — and FIRST, because a move is the family's newest word on that
// one product. Every surface that asks "which section is this in" (both
// Portfolio Monitor tables, Morning CIO's allocation, the drill-down, the Excel
// sheets) therefore files a moved holding in the same place; none keeps a copy.
//
// A placement is a SECTION NAME keyed by PRODUCT (`productKeyOf`): a security,
// or a whole PMS mandate. Never a figure. It changes the heading a row sits
// under and nothing the row adds up to.
//
// ── TWO MEMORIES, AS THE TILE LAYOUTS HAVE ──────────────────────────────────
//
//   1. THE SHARED STORE (`/api/placements`): the family's moves, on any device.
//   2. THIS BROWSER (`localStorage`): painted from first, so a moved row never
//      opens in its old tab and jumps; and the whole memory where the store is
//      not connected. A move the store never confirmed is pushed on the next
//      load rather than overwritten by the older shared answer.
import { useSyncExternalStore } from "react";

export type PlacementAxis = "category" | "assetClass" | "basket";
export type Placement = { axis: PlacementAxis; product: string; section: string; updatedAt: string };
type Change = { axis: PlacementAxis; products: string[]; section: string | null };

export const PLACEMENTS_ENDPOINT = "/api/placements";
const LOCAL_KEY = "glow:family-placements";
const AXES: readonly PlacementAxis[] = ["category", "assetClass", "basket"];

/** Where a move went, in words — the cause picks the sentence (`upstreamStatus.ts`'s rule). */
export const PLACEMENT_REASONS = {
  notConfigured: "Saved in this browser only — the dashboard's shared store has not been switched on yet.",
  noFunction: "Saved in this browser only — the shared store is not running here.",
  signedOut: "Saved in this browser only — you have been signed out, so it could not be saved for everyone.",
  noAnswer: "Saved in this browser for now — the shared store did not answer.",
} as const;
export const PLACEMENTS_SHARED = "Saved for everyone — the dashboard shows it here on any device.";

export type PlacementsState = {
  /** Bumped only when a placement itself changes, so a page can key a memo on it. */
  version: number;
  status: "loading" | "shared" | "local";
  reason: string | null;
};

// ── THE REGISTRY ─────────────────────────────────────────────────────────────
let byKey = new Map<string, Placement>();
let unsynced: Change[] = [];
let state: PlacementsState = { version: 0, status: "loading", reason: null };
const listeners = new Set<() => void>();
const keyOf = (axis: PlacementAxis, product: string) => `${axis}|${product}`;

const isPlacement = (p: unknown): p is Placement => {
  const x = p as Placement | null;
  return !!x && typeof x === "object" && AXES.includes(x.axis)
    && typeof x.product === "string" && !!x.product
    && typeof x.section === "string" && !!x.section && typeof x.updatedAt === "string";
};

/** The section the family moved this product to on this axis, or null. */
export const placementOf = (axis: PlacementAxis, product: string): Placement | null =>
  byKey.get(keyOf(axis, product)) ?? null;

/** What the registry holds, as one comparable string — a section per product. */
const contentOf = () => [...byKey.entries()].map(([k, p]) => `${k}=${p.section}`).sort().join("\n");
let lastContent = "";

function emit(patch: Partial<Omit<PlacementsState, "version">>) {
  // A store answer that agrees with what is already drawn re-sections nothing.
  const content = contentOf();
  const changed = content !== lastContent;
  lastContent = content;
  state = { ...state, ...patch, version: state.version + (changed ? 1 : 0) };
  listeners.forEach((l) => l());
}

function replaceAll(list: readonly Placement[]) {
  byKey = new Map(list.filter(isPlacement).map((p) => [keyOf(p.axis, p.product), p]));
}

function applyChange(c: Change, updatedAt: string) {
  for (const product of c.products) {
    if (c.section === null) byKey.delete(keyOf(c.axis, product));
    else byKey.set(keyOf(c.axis, product), { axis: c.axis, product, section: c.section, updatedAt });
  }
}

function writeLocal() {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ placements: [...byKey.values()], unsynced })); } catch { /* private mode */ }
}

// THIS BROWSER'S COPY, READ BEFORE THE FIRST RENDER — so the first paint is
// already in the family's sections.
(function readLocal() {
  try {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { placements?: unknown; unsynced?: unknown };
    if (Array.isArray(v.placements)) replaceAll(v.placements as Placement[]);
    if (Array.isArray(v.unsynced)) unsynced = (v.unsynced as Change[]).filter((c) => c && AXES.includes(c.axis) && Array.isArray(c.products));
    lastContent = contentOf();
    if (byKey.size) state = { ...state, version: 1 };
  } catch { /* a value this build cannot parse */ }
})();

// ── THE SHARED STORE ─────────────────────────────────────────────────────────
type Reply = { ok: true; placements: Placement[] } | { ok: false; reason: string };

/** Read one answer from the store, naming the actual cause of any failure. */
export async function readPlacementReply(r: Response): Promise<Reply> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) {
    const text = await r.text().catch(() => "");
    return { ok: false, reason: text.includes("/__auth/login") ? PLACEMENT_REASONS.signedOut : PLACEMENT_REASONS.noFunction };
  }
  let j: { ok?: boolean; placements?: unknown; code?: string } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (j?.ok === true && Array.isArray(j.placements)) return { ok: true, placements: j.placements.filter(isPlacement) };
  if (j?.code === "NOT_CONFIGURED") return { ok: false, reason: PLACEMENT_REASONS.notConfigured };
  return { ok: false, reason: PLACEMENT_REASONS.noAnswer };
}

async function post(c: Change): Promise<Reply> {
  try {
    return await readPlacementReply(await fetch(PLACEMENTS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(c),
    }));
  } catch {
    return { ok: false, reason: PLACEMENT_REASONS.noAnswer };
  }
}

let started = false;
async function load() {
  let reply: Reply;
  try {
    reply = await readPlacementReply(await fetch(PLACEMENTS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }));
  } catch {
    reply = { ok: false, reason: PLACEMENT_REASONS.noAnswer };
  }
  if (!reply.ok) { emit({ status: "local", reason: reply.reason }); return; }
  // A move this browser made that the store never confirmed is the newest thing
  // anybody did to that row: pushed, in order, rather than overwritten.
  const pending = unsynced;
  for (const c of pending) {
    const r = await post(c);
    if (!r.ok) { emit({ status: "local", reason: r.reason }); return; }
    reply = r;
  }
  unsynced = [];
  replaceAll(reply.placements);
  writeLocal();
  emit({ status: "shared", reason: null });
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!started) { started = true; void load(); }
  return () => { listeners.delete(l); };
}

/**
 * MOVE A ROW'S PRODUCTS TO A SECTION, or back (`section: null`). Applied at once
 * — the row moves before the store answers — and resolves to whether the SHARED
 * store took it. A failed save keeps the move here and says where it went.
 */
export async function movePlacement(axis: PlacementAxis, products: readonly string[], section: string | null): Promise<boolean> {
  const c: Change = { axis, products: [...new Set(products)], section };
  if (!c.products.length) return false;
  applyChange(c, new Date().toISOString());
  writeLocal();
  emit({});
  const r = await post(c);
  if (r.ok) {
    replaceAll(r.placements);
    writeLocal();
    emit({ status: "shared", reason: null });
    return true;
  }
  // Only the newest unconfirmed move of a row is worth replaying.
  unsynced = [...unsynced.filter((u) => !(u.axis === c.axis && u.products.every((p) => c.products.includes(p)))), c];
  writeLocal();
  emit({ status: "local", reason: r.reason });
  return false;
}

/** Subscribe a component to the family's moves. */
export function useFamilyPlacements(): PlacementsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
