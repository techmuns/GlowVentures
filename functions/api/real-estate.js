// Uses the dashboard's existing authenticated GitHub store. Each property is
// its own key, so editing one property cannot replace another property's record.
import { storeFor, StoreError } from "../../shared/dashboardStore.mjs";
import { PROPERTY_ID, validateProperty, propertyLabel } from "../../shared/realEstate.mjs";
import { MAX_UPLOAD_ROWS } from "../../shared/propertySheet.mjs";
const PREFIX = "real-estate:";
const MAX_BODY = 16384;
// A bulk upload of up to MAX_UPLOAD_ROWS properties; every other request keeps MAX_BODY.
const MAX_BULK_BODY = 2 * 1024 * 1024;
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
      if (size > MAX_BULK_BODY) { await reader.cancel(); return fail(413, "Property details are too long."); }
      chunks.push(value);
    }
  } catch { return fail(400, "The property could not be read."); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return size > MAX_BODY ? fail(413, "Property details are too long.") : fail(400, "Invalid property data."); }
  if (body?.op !== "saveMany" && size > MAX_BODY) return fail(413, "Property details are too long.");
  try {
    // A bulk upload saves every property or none. `base` is the saved record's
    // `updatedAt` the file was read against ("" for a record without one), or
    // null for a new property, so a file read before someone else's edit, or
    // uploaded twice, cannot overwrite or duplicate a record.
    if (body?.op === "saveMany") {
      const items = body.properties;
      if (!Array.isArray(items) || !items.length || items.length > MAX_UPLOAD_ROWS) return fail(400, `Send between 1 and ${MAX_UPLOAD_ROWS} properties.`);
      const invalid = [], stale = [], ready = [], ids = new Set();
      for (const [i, item] of items.entries()) {
        const parsed = validateProperty(item?.property);
        const name = parsed.property ? propertyLabel(parsed.property) : `Property ${i + 1}`;
        if (parsed.error) { invalid.push(`${name}: ${parsed.error}`); continue; }
        if (ids.has(parsed.property.id)) { invalid.push(`${name}: listed twice`); continue; }
        ids.add(parsed.property.id);
        if (item.base !== null && typeof item.base !== "string") { invalid.push(`${name}: missing its saved version`); continue; }
        const current = await store.get(`${PREFIX}${parsed.property.id}`, "json");
        // Held through the commit's retry, so another save landing meanwhile refuses the whole file.
        store.expect?.(`${PREFIX}${parsed.property.id}`, current ? JSON.stringify(current) : null);
        if (item.base === null ? current !== null : current === null || (current.updatedAt ?? "") !== item.base)
          stale.push(`${name} ${item.base === null ? "is already saved" : current === null ? "is no longer on the dashboard" : "was changed on the dashboard after the file was read"}`);
        ready.push(parsed.property);
      }
      const problems = [...invalid, ...stale];
      if (problems.length) return fail(invalid.length ? 400 : 409, `Nothing was saved. ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? `; and ${problems.length - 5} more` : ""}. Refresh, download the file again and upload it.`);
      const updatedAt = new Date().toISOString();
      const properties = ready.map(p => ({ ...p, updatedAt }));
      for (const p of properties) await store.put(`${PREFIX}${p.id}`, JSON.stringify(p));
      await store.flush?.();
      return json(200, { ok: true, properties });
    }
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
  } catch (error) {
    if (body?.op === "saveMany" && error instanceof StoreError && error.status === 409) return fail(409, "Nothing was saved. A property in the file was changed on the dashboard while saving. Refresh, download the file again and upload it.");
    return fail(502, "The property was not saved. Your entries are still here; try again.");
  }
}
