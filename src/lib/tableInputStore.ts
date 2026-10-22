import { useEffect, useSyncExternalStore } from "react";
import type { InputChange, InputRecord, SavedInput } from "./tableInputs";

type State = { catalog: InputRecord[]; saved: SavedInput[]; status: "loading" | "ready" | "error"; error: string };
let state: State = { catalog: [], saved: [], status: "loading", error: "" };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach(fn => fn());
let started = false, revision = 0, writes = Promise.resolve();
async function reply(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign in again to see and save corrected numbers.");
  const result = await response.json();
  if (!response.ok || !result.ok || !Array.isArray(result.catalog) || !Array.isArray(result.saved)) throw new Error(result.message || "The saved numbers could not be loaded.");
  return result;
}
export async function refreshTableInputs() {
  const v = revision;
  try { const result = await reply(await fetch("/api/table-inputs", { credentials: "same-origin", cache: "no-store" }));
    if (v !== revision) return;
    state = { catalog: result.catalog, saved: result.saved, status: "ready", error: "" }; emit();
  } catch (e) { if (v === revision) { state = { ...state, status: "error", error: (e as Error).message }; emit(); } }
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
      revision++; state = { catalog: result.catalog, saved: result.saved, status: "ready", error: "" }; emit();
      window.dispatchEvent(new Event("glow:table-inputs-saved"));
    } catch (e) { failure = e as Error; }
  });
  writes = run.catch(() => {}); await run;
  if (failure) throw failure;
  return state;
}
