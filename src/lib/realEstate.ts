import { useCallback, useEffect, useRef, useState } from "react";
import { validateProperty, type Property } from "../../shared/realEstate.mjs";
import { getTableInputState, publishPropertyChange, refreshTableInputs, useTableInputs } from "./tableInputStore";
export * from "../../shared/realEstate.mjs";
export const PROPERTY_ENDPOINT = "/api/real-estate";
type Reply = { ok: true; properties?: Property[]; property?: Property; deleted?: string } | { ok: false; message: string };
async function request(body?: unknown, signal?: AbortSignal): Promise<Reply> {
  try {
    const response = await fetch(PROPERTY_ENDPOINT, { credentials: "same-origin", cache: "no-store", signal,
      ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!response.headers.get("content-type")?.includes("application/json")) return { ok: false, message: "Properties could not be loaded. Check your connection and sign in again." };
    const reply = await response.json();
    if (!response.ok || reply.ok !== true) return { ok: false, message: reply.message || "Property storage is unavailable. Try again." };
    if (!body) {
      if (!Array.isArray(reply.properties) || reply.properties.some((p: unknown) => !validateProperty(p).property)) return { ok: false, message: "Property records could not be read. Try again." };
    } else if (reply.property && !validateProperty(reply.property).property) return { ok: false, message: "The saved property could not be read. Refresh and try again." };
    return reply;
  } catch { return { ok: false, message: "Property storage is unavailable. Your entries are still here; try again." }; }
}
export function useProperties() {
  const numbers = useTableInputs();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  const controller = useRef<AbortController>();
  const reload = useCallback(async () => {
    if (getTableInputState().loaded) { await refreshTableInputs(); return; }
    controller.current?.abort();
    const c = new AbortController(); controller.current = c;
    const version = revision.current;
    const reply = await request(undefined, c.signal);
    if (c.signal.aborted || version !== revision.current) return;
    setLoading(false);
    if (reply.ok) { setProperties(previous => JSON.stringify(previous) === JSON.stringify(reply.properties) ? previous : reply.properties!); setReady(true); setError(""); }
    else setError(reply.message);
  }, []);
  useEffect(() => {
    if (numbers.loaded) { controller.current?.abort(); return; }
    void reload(); const focus = () => { void reload(); }; window.addEventListener("focus", focus);
    return () => { controller.current?.abort(); window.removeEventListener("focus", focus); }; }, [reload, numbers.loaded]);
  const mutate = useCallback(async (body: unknown) => {
    revision.current++;
    controller.current?.abort();
    const reply = await request(body);
    revision.current++;
    controller.current?.abort();
    if (reply.ok) {
      publishPropertyChange(reply.property, reply.deleted);
      window.dispatchEvent(new Event("glow:properties-saved"));
      setProperties(previous => reply.property ? [...previous.filter(p => p.id !== reply.property!.id), reply.property]
        : previous.filter(p => p.id !== reply.deleted));
      setError("");
    }
    return reply;
  }, []);
  return { properties: numbers.loaded ? numbers.properties : properties, loading: numbers.loaded ? false : loading,
    ready: numbers.loaded || ready, error: numbers.loaded ? numbers.status === "error" ? numbers.error : "" : error, reload, mutate };
}
