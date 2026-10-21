import assert from "node:assert/strict";
import { validateProperty, propertyFigures, propertyTotal, hasPin, propertyShare } from "../../shared/realEstate.mjs";
import { onRequest } from "../../functions/api/real-estate.js";
import { property, memoryStore } from "./real-estate-fixtures.mjs";
import { handlePropertyGeocode } from "../../functions/api/property-geocode.js";
const store = memoryStore();
const site = "https://local.example";
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`ok ${name}`); };
async function call(body, { origin = site, method = body ? "POST" : "GET", env = { DASHBOARD_STORE: store }, raw } = {}) {
  const response = await onRequest({ request: new Request(`${site}/api/real-estate`, { method,
    headers: { origin, "content-type": "application/json" }, ...(method === "POST" ? { body: raw ?? JSON.stringify(body) } : {}) }), env });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const full = propertyFigures(property());
check("full property figures, net income and equity", () => assert.deepEqual(full, { share: 1, value: 15000000, cost: 10000000, debt: 3000000, rent: 50000, costs: 5000, equity: 12000000, netRent: 45000, yield: 4, gain: 5000000 }));
const scoped = propertyFigures(property(), new Set(["test-a"]));
check("co-owner values use 60%, while yield stays 4%", () => assert.deepEqual([scoped.value, scoped.cost, scoped.rent, scoped.equity, scoped.netRent, scoped.yield], [9000000, 6000000, 30000, 7200000, 27000, 4]));
check("an unrelated member has no property share", () => assert.equal(propertyShare(property(), new Set(["other"])), 0));
check("recorded family shares can be less than 100%", () => assert.equal(propertyFigures(property({ owners: [{ ownerId: null, name: "Test trust", share: 25 }] })).value, 3750000));
check("missing loan does not become zero debt", () => assert.equal(propertyFigures(property({ debt: null })).equity, null));
check("missing value does not produce a yield", () => assert.equal(propertyFigures(property({ value: null })).yield, null));
check("zero value does not divide by zero", () => assert.equal(propertyFigures(property({ value: 0 })).yield, null));
check("zero rent is a real zero yield", () => assert.equal(propertyFigures(property({ monthlyRent: 0 })).yield, 0));
check("partial totals name their coverage", () => assert.deepEqual(propertyTotal([property(), property({ value: null })], "value"), { value: 15000000, known: 1, count: 2 }));
check("no property does not become a measured zero", () => assert.deepEqual(propertyTotal([], "value"), { value: null, known: 0, count: 0 }));
check("a zero coordinate is a valid pin", () => assert.equal(hasPin(property({ latitude: 0, longitude: 0 })), true));
check("a missing pin is never a city-center estimate", () => assert.equal(hasPin(property({ latitude: null, longitude: null })), false));
const invalid = [
  { name: "" }, { city: "" }, { address: "" }, { country: "" }, { value: -1 }, { value: Infinity }, { value: "100" }, { value: undefined }, { cost: NaN }, { valuationDate: null },
  { valuationDate: "2026-02-30" }, { purchasedOn: "2026-13-01" }, { leaseEnd: "01/02/2026" }, { latitude: 91 }, { longitude: -181 }, { latitude: null }, { area: 0 }, { areaUnit: "bigha" },
  { owners: [] }, { owners: [{ name: "a", ownerId: null, share: 101 }] }, { owners: [{ name: "a", ownerId: null, share: 0 }] }, { owners: [{ name: "a", ownerId: null, share: 60 }, { name: "b", ownerId: null, share: 50 }] },
  { owners: [{ name: "a", ownerId: "test-a", share: 50 }, { name: "a", ownerId: "test-a", share: 50 }] }, { type: "Unknown" }, { notes: "x".repeat(2001) }, { status: "Vacant", monthlyRent: 1 }, { id: "../invalid" },
];
for (const [i, patch] of invalid.entries()) check(`invalid record ${i + 1} refused`, () => assert.ok(validateProperty(property(patch)).error));
check("a property offered for sale can still earn rent", () => assert.ok(validateProperty(property({ status: "For sale" })).property));
check("blank monetary fields remain blank", () => assert.equal(validateProperty(property({ cost: null })).property.cost, null));
check("an empty store reads successfully", () => {});
assert.deepEqual((await call()).body, { ok: true, properties: [] });
for (const id of ["test-apartment", "test-land", "test-office"]) assert.equal((await call({ op: "save", property: property({ id }) })).status, 200);
check("properties survive a paginated store read", () => {});
assert.equal((await call()).body.properties.length, 3);
await call({ op: "save", property: property({ monthlyRent: 60000 }) });
check("editing one property keeps the other two", () => {});
assert.equal((await call()).body.properties.find(p => p.id === "test-apartment").monthlyRent, 60000);
assert.equal((await call()).body.properties.length, 3);
assert.equal((await call({ op: "delete", id: "test-land" })).body.deleted, "test-land");
assert.equal((await call()).body.properties.length, 2);
for (const [name, args, code] of [
  ["cross-origin save", { origin: "https://other.example" }, 403], ["missing origin", { origin: "" }, 403], ["oversized body", { raw: "x".repeat(17000) }, 413],
  ["malformed JSON", { raw: "{" }, 400], ["unconfigured store", { env: {} }, 503], ["unsupported method", { method: "PUT" }, 405],
]) {
  assert.equal((await call({ op: "save", property: property() }, args)).status, code); checks++; console.log(`ok ${name}`);
}
assert.equal((await call({ op: "save", property: property({ value: -1 }) })).status, 400);
assert.equal((await call()).headers.get("cache-control"), "no-store");
const broken = { ...store, flush: async () => { throw new Error("offline"); } };
assert.equal((await call({ op: "save", property: property() }, { env: { DASHBOARD_STORE: broken } })).status, 502);
const feature = (coordinates, properties = {}) => ({ type: "Feature", geometry: { type: "Point", coordinates }, properties: { name: "Test address", city: "Mumbai", state: "Maharashtra", country: "India", type: "house", ...properties } });
let externalCalls = 0;
const cacheData = new Map();
const cache = { match: async key => cacheData.get(key.url)?.clone(), put: async (key, response) => cacheData.set(key.url, response) };
const geocode = (address = "Test address, Mumbai", { fetcher = async url => { externalCalls++; assert.equal(new URL(url).hostname, "photon.komoot.io"); return Response.json({ features: [feature([72.8777, 19.076]), feature([72.8777, 19.076]), feature([200, 95]), feature([0, 0], { name: "Test zero", housenumber: "1" })] }); }, method = "GET", env = {}, crossSite = false } = {}) => handlePropertyGeocode({ request: new Request(`${site}/api/property-geocode?${new URLSearchParams({ address })}`, { method, headers: crossSite ? { "sec-fetch-site": "cross-site" } : {} }), env }, { fetcher, cache });
const found = await geocode();
assert.equal(found.headers.get("cache-control"), "no-store");
const located = (await found.json()).matches;
assert.equal(located.length, 2, "Duplicate/invalid points are removed.");
assert.deepEqual(located[0].point, [19.076, 72.8777], "GeoJSON longitude/latitude is converted correctly.");
assert.equal(located[0].approximate, true);
assert.equal(located[1].approximate, false);
assert.deepEqual(located[1].point, [0, 0]);
await geocode(" Test   address, Mumbai "); assert.equal(externalCalls, 1, "Repeated searches reuse the normalized edge cache.");
assert.equal((await geocode("ab")).status, 400);
assert.equal((await geocode("x".repeat(501))).status, 400);
assert.equal((await geocode("a valid address", { method: "POST" })).status, 405);
assert.equal((await geocode("a valid address", { crossSite: true })).status, 403);
assert.equal((await geocode("a valid address", { env: { PROPERTY_GEOCODER_URL: "http://unsafe.invalid" } })).status, 503);
for (const [name, fetcher, status] of [
  ["no match", async () => Response.json({ features: [] }), 200],
  ["rate limited", async () => new Response("", { status: 429 }), 429],
  ["offline", async () => { throw new Error("offline"); }, 502],
  ["invalid body", async () => Response.json({ other: [] }), 502],
  ["oversized", async () => new Response("x".repeat(262145)), 502],
]) { const reply = await geocode(`Test ${name}`, { fetcher }); assert.equal(reply.status, status); if (name === "no match") assert.deepEqual(await reply.json(), { matches: [] }); }
console.log(`${checks} real-estate checks passed, plus CRUD and failure contracts.`);
