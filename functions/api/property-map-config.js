// Deliberately exposes only a browser-restricted Maps key, behind the existing
// dashboard password gate. Never use a server/service-account key here.
export function onRequest({ request, env }) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (request.method !== "GET") return new Response(JSON.stringify({ message: "Use GET." }), { status: 405, headers });
  const apiKey = env.GOOGLE_MAPS_BROWSER_KEY?.trim();
  const mapId = env.GOOGLE_MAPS_MAP_ID?.trim();
  return new Response(JSON.stringify(apiKey && mapId ? { enabled: true, apiKey, mapId } : { enabled: false }), { headers });
}
