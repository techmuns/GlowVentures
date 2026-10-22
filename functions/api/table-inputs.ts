import { storeFor, StoreError, type DashboardStore } from "../../shared/dashboardStore.mjs";
import { validateProperty } from "../../shared/realEstate.mjs";
import { isCall, validateDraft, type StoredCall } from "./capital-calls.js";
import { BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS } from "../../src/data/glowData";
import { applySavedInputs, buildInputCatalog, propertyInputRecord, ownershipInputRecords, callInputRecord, validateInputChanges, type InputChange, type SavedInput } from "../../src/lib/tableInputs";

const PREFIX = "table-input:";
const sourceCatalog = buildInputCatalog(BOOK_POSITIONS, BOOK_COMMITMENTS, BOOK_ACCOUNTS);
const json = (status: number, body: object) => Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const fail = (status: number, message: string) => json(status, { ok: false, message });
async function records(store: DashboardStore, prefix: string) {
  const out: { key: string; raw: unknown }[] = []; let cursor: string | undefined;
  do {
    const page = await store.list({ prefix, cursor });
    for (const key of page.keys) out.push({ key: key.name, raw: await store.get(key.name, "json") });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
async function snapshot(store: DashboardStore) {
  const raw = await records(store, PREFIX);
  const saved = raw.map(r => r.raw as SavedInput).filter(r => r && typeof r.id === "string" && typeof r.field === "string" && typeof r.updatedAt === "string" && (r.value === null || typeof r.value === "number" && Number.isFinite(r.value)));
  const properties = (await records(store, "real-estate:")).flatMap(r => {
    const parsed = validateProperty(r.raw);
    return parsed.property ? [{ ...parsed.property, updatedAt: (r.raw as { updatedAt?: string }).updatedAt }] : [];
  });
  const calls = (await records(store, "capital-call:")).map(r => r.raw).filter(isCall);
  return { saved, properties, calls, catalog: [...applySavedInputs(sourceCatalog, saved), ...properties.flatMap(p => [propertyInputRecord(p), ...ownershipInputRecords(p)]), ...calls.map(callInputRecord)] };
}
export async function onRequest({ request, env }: { request: Request; env: Record<string, unknown> }) {
  if (!["GET", "POST"].includes(request.method)) return fail(405, "Use GET or POST.");
  const store = storeFor(env);
  if (!store) return fail(503, "Saving numbers is unavailable. Try again later.");
  if (request.method === "POST" && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) return fail(403, "Save numbers from this dashboard.");
  try {
    if (request.method === "GET") return json(200, { ok: true, ...await snapshot(store) });
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return fail(415, "Send JSON.");
    const reader = request.body?.getReader(); if (!reader) return fail(400, "No changes supplied.");
    const decoder = new TextDecoder(); let text = "", size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 8_000_000) { await reader.cancel(); return fail(413, "The upload is too large."); } text += decoder.decode(value, { stream: true }); }
    let body; try { body = JSON.parse(text + decoder.decode()); } catch { return fail(400, "The changes could not be read."); }
    const current = await snapshot(store);
    const error = validateInputChanges(body.changes, current.catalog);
    if (error) return fail(409, error);
    const changes = body.changes as InputChange[], stamp = new Date().toISOString();
    const propertyUpdates = new Map<string, typeof current.properties[number]>();
    const callUpdates = new Map<string, StoredCall>();
    // Validate the ENTIRE batch before staging a single write. One flush is one
    // GitHub commit, so an invalid file cannot save half its corrections.
    for (const change of changes) if (change.id.startsWith("property:")) {
      const id = change.id.slice(9), old = current.properties.find(p => p.id === id)!;
      const p = propertyUpdates.get(id) ?? { ...old };
      Object.assign(p, { [change.field]: change.value, updatedAt: stamp }); propertyUpdates.set(id, p);
    }
    for (const change of changes) if (change.id.startsWith("property-owner:")) {
      const [id, index] = change.id.slice("property-owner:".length).split("|");
      const old = propertyUpdates.get(id) ?? current.properties.find(p => p.id === id)!;
      propertyUpdates.set(id, { ...old, updatedAt: stamp, owners: old.owners.map((owner, i) => i === Number(index) ? { ...owner, share: change.value === null ? null : change.value * 100 } : owner) });
    }
    for (const p of propertyUpdates.values()) { const parsed = validateProperty(p); if (parsed.error) return fail(400, parsed.error); }
    for (const change of changes) if (change.id.startsWith("capital-call:")) {
      const id = change.id.slice(13), old = current.calls.find(c => c.id === id)!;
      const parsed = validateDraft({ ...old, amount: change.value }, new Date(stamp));
      if (parsed.error) return fail(400, parsed.error); callUpdates.set(id, parsed.call!);
    }
    for (const change of changes) if (!change.id.startsWith("property:") && !change.id.startsWith("property-owner:") && !change.id.startsWith("capital-call:")) {
      const key = `${PREFIX}${change.id}:${change.field}`;
      const old = await store.get(key, "json"); store.expect?.(key, old ? JSON.stringify(old) : null);
      if (change.reset) await store.delete(key);
      else await store.put(key, JSON.stringify({ ...change, updatedAt: stamp }));
    }
    for (const p of propertyUpdates.values()) {
      const key = `real-estate:${p.id}`, old = await store.get(key, "json");
      store.expect?.(key, old ? JSON.stringify(old) : null); await store.put(key, JSON.stringify(p));
    }
    for (const c of callUpdates.values()) {
      const key = `capital-call:${c.id}`, old = await store.get(key, "json");
      store.expect?.(key, old ? JSON.stringify(old) : null); await store.put(key, JSON.stringify(c), { metadata: c });
    }
    await store.flush?.();
    return json(200, { ok: true, ...await snapshot(store), count: changes.length });
  } catch (error) {
    return fail(error instanceof StoreError && error.status === 409 ? 409 : 502,
      error instanceof StoreError && error.status === 409 ? error.message : "The save could not be confirmed. Refresh to check your numbers before trying again.");
  }
}
