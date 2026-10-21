// Free public Photon/OpenStreetMap search, for explicit property-address lookups.
// No keys, billing, automatic completion, or paid-provider fallback.
const ENDPOINT = "https://photon.komoot.io/api/";
const errorMessage = "Address search is unavailable. Try again or place the pin on the map.";
const json = (body, status = 200, cache = "no-store") => new Response(JSON.stringify(body), { status, headers: {
  "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff",
} });
const text = value => typeof value === "string" ? value.trim().slice(0, 300) : "";
function matches(features) {
  const seen = new Set();
  return features.flatMap(feature => {
    const p = feature?.properties ?? {}, coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== "Point" || !Array.isArray(coordinates) || coordinates.length < 2) return [];
    const [lng, lat] = coordinates;
    if (![lat, lng].every(n => typeof n === "number" && Number.isFinite(n)) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const street = [text(p.housenumber), text(p.street)].filter(Boolean).join(" ");
    const city = text(p.city) || text(p.town) || text(p.village) || text(p.county);
    const label = [...new Set([text(p.name), street, text(p.district), city, text(p.state), text(p.postcode), text(p.country)].filter(Boolean))].join(", ");
    if (!label) return [];
    const key = `${label}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) return []; seen.add(key);
    return [{ label, point: [lat, lng], approximate: !(p.type === "house" && text(p.housenumber)),
      city, state: text(p.state), country: text(p.country), pincode: text(p.postcode) }];
  }).slice(0, 5);
}
export async function handlePropertyGeocode(context, { fetcher = fetch, cache = globalThis.caches?.default } = {}) {
  const { request, env = {} } = context;
  if (request.method !== "GET") return json({ message: "Use GET." }, 405);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ message: "Search from this dashboard." }, 403);
  const url = new URL(request.url), address = (url.searchParams.get("address") ?? "").trim().replace(/\s+/g, " ");
  if (address.length < 3 || address.length > 500) return json({ message: "Enter a property address between 3 and 500 characters." }, 400);
  let endpoint;
  try {
    endpoint = new URL(env.PROPERTY_GEOCODER_URL || ENDPOINT);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("Invalid endpoint");
  } catch { return json({ message: errorMessage }, 503); }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint.href + "\n" + address.toLowerCase()));
  const key = new Request(`${url.origin}/api/property-geocode?cache=${[...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("")}`);
  try {
    const cached = await cache?.match(key);
    if (cached) return json(await cached.json());
  } catch { /* Cache failure must not prevent address entry. */ }
  endpoint.searchParams.set("q", address); endpoint.searchParams.set("limit", "5"); endpoint.searchParams.set("lang", "en");
  try {
    const response = await fetcher(endpoint.href, { headers: { accept: "application/json", "user-agent": "GlowVenturesPropertyMap/1.0 (https://glowventures-1xw.pages.dev)" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return json({ message: errorMessage }, response.status === 429 ? 429 : 502);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 262144) { await reader.cancel(); throw new Error("Response too large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(body.features)) throw new Error("Invalid response");
    const reply = { matches: matches(body.features) };
    if (cache) {
      const write = cache.put(key, json(reply, 200, "public, max-age=604800")).catch(() => {});
      if (context.waitUntil) context.waitUntil(write); else await write;
    }
    return json(reply);
  } catch { return json({ message: errorMessage }, 502); }
}
export function onRequest(context) { return handlePropertyGeocode(context); }
