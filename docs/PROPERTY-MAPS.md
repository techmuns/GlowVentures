# Property maps

The property editor accepts an address, finds matching Google addresses, and
lets the user drag or click a pin before saving. Coordinates stay internal.
Opening a saved property never searches its address again or replaces its pin.
Unmatched/ambiguous addresses and approximate matches are explicitly identified.

## Google Maps activation

Activation requires the owner's Google Cloud project and billing authorization.
The code does not enable APIs, attach billing, create keys, or change production
configuration automatically. No Google Maps key was configured when this was built.

1. In the authorized project, enable **Maps JavaScript API** and **Geocoding API**.
2. Create a JavaScript map ID for production (not `DEMO_MAP_ID`).
3. Create a **browser** API key restricted to those two APIs and the dashboard's
   exact HTTPS referrers. Add only explicitly approved preview referrers for testing.
   Do not use a server/service-account key. Browser keys are delivered to browsers.
4. Set suitable API quotas for the owner's authorized usage. Billing budget
   alerts do not impose a hard spending cap.
5. With authorization for the specific environments, set Cloudflare Pages
   `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID`. Preview and production
   settings are separate. Activation follows the existing deployment pipeline;
   manual production deployments require separate authorization.
6. Verify an address lookup and drag using an authorized preview, then verify
   production read-only after its automatic deployment. Do not save test
   properties to production.

The authenticated `/api/property-map-config` returns only the browser key and
map ID, with `Cache-Control: no-store`. Until both exist, existing OpenStreetMap
maps and click/drag pin editing continue to work; address search explains that
Google Maps is not connected. There is no paid-provider fallback.

## Checks

- `npm run test:real-estate`: record, persistence and config allowlist contracts.
- `node scripts/dev/check-real-estate.mjs`: local browser and in-memory property
  store, including unconfigured Maps and manual pin entry.
- `node scripts/dev/check-real-estate-google.mjs`: local browser with a Google
  service-boundary fixture; address-only entry, errors/no match, address choices,
  approximate warning, drag/save/reload, stale searches, clear/click/cancel.
  It makes no real Google request and verifies no live Google credentials.

Official references: [API setup](https://developers.google.com/maps/documentation/javascript/get-api-key),
[Geocoding](https://developers.google.com/maps/documentation/javascript/geocoding),
[draggable pins](https://developers.google.com/maps/documentation/javascript/advanced-markers/draggable-markers),
[key restrictions](https://developers.google.com/maps/api-security-best-practices).
