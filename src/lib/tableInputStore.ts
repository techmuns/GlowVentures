import { useEffect, useSyncExternalStore } from "react";
import type { InputChange, InputRecord, SavedInput } from "./tableInputs";
import { callInputRecord, ownershipInputRecords, propertyInputRecord } from "./tableInputs";
import type { Property } from "../../shared/realEstate.mjs";
import type { EnteredCall } from "./enteredCalls";

type State = { catalog: InputRecord[]; saved: SavedInput[]; properties: Property[]; calls: EnteredCall[]; loaded: boolean; status: "loading" | "ready" | "error"; error: string };
let state: State = { catalog: [], saved: [], properties: [], calls: [], loaded: false, status: "loading", error: "" };
export const getTableInputState = () => state;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach(fn => fn());
// A no-change refresh must not rebuild map markers or close their popups.
const retainEqual = <T,>(old: T[], next: T[]): T[] => JSON.stringify(old) === JSON.stringify(next) ? old : next;
let started = false, revision = 0, readTicket = 0, writes = Promise.resolve();
async function reply(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign in again to see and save corrected numbers.");
  let result;
  try { result = await response.json(); } catch { throw new Error("The saved numbers could not be read. Refresh and try again."); }
  if (!response.ok || !result.ok || !Array.isArray(result.catalog) || !Array.isArray(result.saved) || !Array.isArray(result.properties) || !Array.isArray(result.calls)) throw new Error(result.message || "The saved numbers could not be loaded.");
  return result;
}
export async function refreshTableInputs() {
  const v = revision, ticket = ++readTicket;
  const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 15000);
  try { const result = await reply(await fetch("/api/table-inputs", { credentials: "same-origin", cache: "no-store", signal: controller.signal }));
    if (v !== revision || ticket !== readTicket) return;
    state = { catalog: result.catalog, saved: result.saved, properties: retainEqual(state.properties, result.properties), calls: retainEqual(state.calls, result.calls), loaded: true, status: "ready", error: "" }; emit();
  } catch (e) { if (v === revision && ticket === readTicket) { state = { ...state, status: "error", error: e instanceof TypeError || controller.signal.aborted ? "The saved numbers could not be loaded. Check your connection and try again." : (e as Error).message }; emit(); } }
  finally { window.clearTimeout(timeout); }
}
/** Existing property/call editors publish their acknowledged saves into the
 * same snapshot. Table rows and Excel inputs therefore cannot show different
 * versions while separate background reads are still in flight. */
export function publishPropertyChange(property?: Property, deleted?: string) {
  const id = property?.id ?? deleted; if (!id) return;
  revision++;
  const parentId = `property:${id}`;
  state = { ...state, properties: [...state.properties.filter(p => p.id !== id), ...(property ? [property] : [])],
    catalog: [...state.catalog.filter(r => r.id !== parentId && r.parentId !== parentId), ...(property ? [propertyInputRecord(property), ...ownershipInputRecords(property)] : [])] };
  emit();
}
/** A bulk upload's saved properties, published as one snapshot change. */
export function publishPropertyChanges(properties: Property[]) {
  if (!properties.length) return;
  revision++;
  const ids = new Set(properties.map(p => p.id)), parents = new Set(properties.map(p => `property:${p.id}`));
  state = { ...state, properties: [...state.properties.filter(p => !ids.has(p.id)), ...properties],
    catalog: [...state.catalog.filter(r => !parents.has(r.id) && !(r.parentId && parents.has(r.parentId))), ...properties.flatMap(p => [propertyInputRecord(p), ...ownershipInputRecords(p)])] };
  emit();
}
export function publishCallList(calls: EnteredCall[]) {
  revision++; state = { ...state, calls, catalog: [...state.catalog.filter(r => r.kind !== "call"), ...calls.map(callInputRecord)] }; emit();
}
export function useTableInputs() {
  useEffect(() => { if (!started) { started = true; void refreshTableInputs(); } }, []);
  return useSyncExternalStore(subscribe, () => state);
}
// Refresh other readers on focus and after existing property editors save.
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => { if (started) void refreshTableInputs(); });
  window.addEventListener("glow:properties-saved", () => { if (started) void refreshTableInputs(); });
  window.addEventListener("glow:calls-saved", () => { if (started) void refreshTableInputs(); });
}
export async function saveTableInputs(changes: InputChange[]) {
  revision++;
  let failure: Error | undefined;
  const run = writes.then(async () => {
    try {
      const result = await reply(await fetch("/api/table-inputs", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes }) }));
      revision++; state = { catalog: result.catalog, saved: result.saved, properties: retainEqual(state.properties, result.properties), calls: retainEqual(state.calls, result.calls), loaded: true, status: "ready", error: "" }; emit();
      window.dispatchEvent(new Event("glow:table-inputs-saved"));
    } catch (e) { failure = e instanceof TypeError ? new Error("The save could not be confirmed. Refresh to check your numbers before trying again.") : e as Error; }
  });
  writes = run.catch(() => {}); await run;
  if (failure) throw failure;
  return state;
}
