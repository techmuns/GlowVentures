// Uses the dashboard's existing authenticated GitHub store. Each property is
// its own key, so editing one property cannot replace another property's record.
import { storeFor } from "../../shared/dashboardStore.mjs";
import { PROPERTY_ID, validateProperty } from "../../shared/realEstate.mjs";
const PREFIX = "real-estate:";
const MAX_BODY = 16384;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: {
  "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff",
} });
const fail = (status, message) => json(status, { ok: false, message });

async function list(store) {
  const properties = [];
  let cursor;
  do {
    const page = await store.list({ prefix: PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await store.get(key.name, "json");
      const parsed = validateProperty(raw);
      if (parsed.property) properties.push({ ...parsed.property, updatedAt: raw.updatedAt });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return properties.sort((a, b) => a.name.localeCompare(b.name));
}

export async function onRequest({ request, env }) {
  if (!["GET", "POST"].includes(request.method)) return fail(405, "Use GET or POST.");
  const store = storeFor(env);
  if (!store) return fail(503, "Property storage is unavailable. Try again later.");
  if (request.method === "GET") {
    try { return json(200, { ok: true, properties: await list(store) }); }
    catch { return fail(502, "Properties could not be loaded. Try again."); }
  }
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Save properties from this dashboard.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail(415, "Send JSON.");
  // Bound the stream itself, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "Missing property.");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return fail(413, "Property details are too long."); }
      chunks.push(value);
    }
  } catch { return fail(400, "The property could not be read."); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail(400, "Invalid property data."); }
  try {
    if (body?.op === "save") {
      const parsed = validateProperty(body.property);
      if (parsed.error) return fail(400, parsed.error);
      const property = { ...parsed.property, updatedAt: new Date().toISOString() };
      await store.put(`${PREFIX}${property.id}`, JSON.stringify(property));
      await store.flush?.();
      return json(200, { ok: true, property });
    }
    if (body?.op === "delete" && typeof body.id === "string" && PROPERTY_ID.test(body.id)) {
      await store.delete(`${PREFIX}${body.id}`);
      await store.flush?.();
      return json(200, { ok: true, deleted: body.id });
    }
    return fail(400, "Invalid property request.");
  } catch { return fail(502, "The property was not saved. Your entries are still here; try again."); }
}
