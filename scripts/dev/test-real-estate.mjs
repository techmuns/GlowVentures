import assert from "node:assert/strict";
import { validateProperty, propertyFigures, propertyTotal, hasPin, propertyShare, propertyLabel, wholePropertyFigures, appreciationGap, costLabel, acquiredOnLabel, isEarmarked, earmarkLabel } from "../../shared/realEstate.mjs";
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
check("full property figures, net income and equity", () => assert.deepEqual(full, { share: 1, value: 15000000, cost: 10000000, debt: 3000000, emi: null, rent: 50000, costs: 5000, equity: 12000000, netRent: 45000, yield: 4, gain: 5000000, gainPct: 50 }));
const inherited = patch => validateProperty(property({ acquisition: "Inherited", cost: null, ...patch })).property;
check("acquisition types are kept; an older record without one reads as not entered", () => {
  for (const type of ["Purchased", "Inherited", "Gifted"]) assert.equal(validateProperty(property({ acquisition: type })).property.acquisition, type);
  assert.equal(validateProperty(property()).property.acquisition, "");
  assert.ok(validateProperty(property({ acquisition: "Bought" })).error);
});
check("an inherited property may have no cost: value only, appreciation absent with its reason", () => {
  const f = propertyFigures(inherited());
  assert.deepEqual([f.value, f.cost, f.gain, f.gainPct], [15000000, null, null, null]);
  assert.match(appreciationGap(inherited()).reason, /Inherited, so there is no purchase cost/);
  assert.equal(propertyTotal([inherited(), property()], "gain").known, 1);
});
check("a ₹0 value on the date of inheritance or gift is refused rather than shown as 100% appreciation", () => {
  assert.match(validateProperty(property({ acquisition: "Inherited", cost: 0 })).error, /date of inheritance blank/);
  assert.match(validateProperty(property({ acquisition: "Gifted", cost: 0 })).error, /date of the gift blank/);
});
check("the value on the date of inheritance is labelled as such and measures appreciation since then", () => {
  const p = inherited({ cost: 12000000 });
  assert.equal(costLabel(p), "Value on date of inheritance"); assert.equal(acquiredOnLabel(p), "Inherited on");
  assert.deepEqual([propertyFigures(p).gain, propertyFigures(p).gainPct], [3000000, 25]);
  assert.equal(costLabel(property({ acquisition: "Gifted" })), "Value on date of gift"); assert.equal(costLabel(property()), "Cost");
});
check("a ₹0 cost on an older record never becomes a 100% or an infinite appreciation", () => {
  const f = propertyFigures(property({ cost: 0 }));
  assert.deepEqual([f.cost, f.gain, f.gainPct], [0, null, null]); assert.equal(appreciationGap(property({ cost: 0 })).short, "Cost is ₹0");
});
check("no current value means no appreciation, not a loss of the whole cost", () => { assert.equal(propertyFigures(property({ value: null })).gain, null); assert.equal(appreciationGap(property({ value: null })).short, "No current value"); });
check("an incomplete share hides the amount but keeps the whole-property percentage", () => {
  const f = propertyFigures(property({ owners: [{ name: "Test owner", ownerId: "test-a", share: null }] }));
  assert.deepEqual([f.gain, f.gainPct], [null, 50]);
});
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
  { value: -1 }, { value: Infinity }, { value: "100" }, { cost: NaN },
  { valuationDate: "2026-02-30" }, { purchasedOn: "2026-13-01" }, { leaseEnd: "01/02/2026" }, { latitude: 91 }, { longitude: -181 }, { latitude: null }, { area: 0 }, { areaUnit: "bigha" },
  { owners: [{ name: "a", ownerId: null, share: 101 }] },
  { type: "Unknown" }, { notes: "x".repeat(2001) }, { id: "../invalid" },
];
for (const [i, patch] of invalid.entries()) check(`invalid record ${i + 1} refused`, () => assert.ok(validateProperty(property(patch)).error));
check("a property offered for sale can still earn rent", () => assert.ok(validateProperty(property({ status: "For sale" })).property));
check("blank monetary fields remain blank", () => assert.equal(validateProperty(property({ cost: null })).property.cost, null));
const minimal = validateProperty({ id: "test-unfinished" }).property;
check("all visible fields may be absent", () => { assert.ok(minimal); assert.equal(minimal.name, ""); assert.equal(minimal.value, null); assert.equal(minimal.monthlyRent, null); assert.deepEqual(minimal.owners, []); });
check("an unnamed record has a clickable display label", () => assert.equal(propertyLabel(minimal), "Untitled property"));
check("an address labels an otherwise unnamed property", () => assert.equal(propertyLabel({ ...minimal, address: "Test address" }), "Test address"));
check("a value needs no valuation date or ownership", () => assert.equal(validateProperty({ id: "test-value-only", value: 5000000 }).property.value, 5000000));
const unfinishedOwner = validateProperty(property({ owners: [{ name: "Test owner", ownerId: "test-a", share: null }] })).property;
check("an owner's share can be added later", () => assert.equal(unfinishedOwner.owners[0].share, null));
check("missing ownership is unknown rather than zero or full ownership", () => { assert.equal(propertyShare(unfinishedOwner), null); assert.equal(propertyFigures(unfinishedOwner).value, null); assert.equal(propertyFigures(unfinishedOwner).yield, 4); });
check("unassigned records do not assume a selected member's share", () => assert.equal(propertyShare(minimal, new Set(["test-a"])), null));
check("unnamed owners are kept as separate unfinished entries", () => assert.equal(validateProperty({ id: "test-unnamed-owners", owners: [{ share: 50 }, { share: 50 }] }).property.owners.length, 2));
check("whole-property details keep entered figures without inventing ownership", () => assert.equal(wholePropertyFigures(unfinishedOwner).value, 15000000));
const duplicate = validateProperty(property({ owners: [{ name: "Test owner", ownerId: "test-a", share: 100 }, { name: "Test owner", ownerId: "test-a", share: 100 }] })).property;
check("identical duplicate owners save once and never double count", () => { assert.equal(duplicate.owners.length, 1); assert.equal(propertyFigures(duplicate).value, 15000000); });
const conflicting = validateProperty(property({ owners: [{ name: "Test owner", ownerId: "test-a", share: 60 }, { name: "Test owner", ownerId: "test-a", share: 40 }] })).property;
check("different entries for one owner stay editable without inflating totals", () => { assert.equal(conflicting.owners.length, 2); assert.equal(propertyShare(conflicting), null); });
const overallocated = validateProperty(property({ owners: [{ name: "Test A", ownerId: "test-a", share: 70 }, { name: "Test B", ownerId: "test-b", share: 60 }] })).property;
check("unfinished shares above 100% save but do not enter family totals", () => { assert.ok(overallocated); assert.equal(propertyFigures(overallocated).value, null); });
check("unknown and measured zero shares stay distinct", () => { assert.equal(propertyShare(minimal), null); assert.equal(propertyShare(property({ owners: [{ name: "Test A", ownerId: "test-a", share: 0 }] })), 0); });
const earmarked = validateProperty(property({ earmark: { recipientId: "test-c", recipient: " Test recipient C ", note: "Test note" } })).property;
check("an older record without an earmark reads as not earmarked", () => { assert.equal(validateProperty(property()).property.earmark, null); assert.equal(isEarmarked(validateProperty(property()).property), false); assert.equal(minimal.earmark, null); });
check("an earmark keeps its recipient, the recipient's member id and its note", () => {
  assert.deepEqual(earmarked.earmark, { recipientId: "test-c", recipient: "Test recipient C", note: "Test note" });
  assert.equal(earmarkLabel(earmarked), "To be gifted to Test recipient C");
});
check("an earmark may be saved before its recipient is entered", () => {
  const p = validateProperty(property({ earmark: {} })).property;
  assert.deepEqual(p.earmark, { recipientId: null, recipient: "", note: "" }); assert.equal(isEarmarked(p), true);
  assert.equal(earmarkLabel(p), "To be gifted · recipient not entered");
});
check("an earmark is a marker only: figures, shares and member scope stay with the current owners", () => {
  assert.deepEqual(propertyFigures(earmarked), propertyFigures(property()));
  assert.deepEqual(propertyFigures(earmarked, new Set(["test-a"])), propertyFigures(property(), new Set(["test-a"])));
  assert.equal(propertyShare(earmarked, new Set(["test-c"])), 0, "The intended recipient holds no share until a transfer is recorded.");
  assert.deepEqual(propertyTotal([earmarked], "value"), propertyTotal([property()], "value"));
});
for (const [i, earmark] of [["Test"], "Test", { recipient: "x".repeat(161) }, { note: "x".repeat(1001) }, { recipientId: "../bad" }, { recipient: 5 }].entries())
  check(`invalid earmark ${i + 1} refused`, () => assert.match(validateProperty(property({ earmark })).error, /earmark/));
assert.equal((await call({ op: "save", property: { id: "test-progressive" } })).status, 200);
assert.equal((await call()).body.properties.find(p => p.id === "test-progressive").name, "");
assert.equal((await call({ op: "save", property: { id: "test-progressive", name: "Test later details", value: 5000000, owners: [{ name: "Test owner", share: null }] } })).status, 200);
assert.equal((await call()).body.properties.find(p => p.id === "test-progressive").value, 5000000);
assert.equal((await call({ op: "save", property: { id: "test-progressive", earmark: { recipient: "Test recipient", note: "Test note" } } })).status, 200);
assert.deepEqual((await call()).body.properties.find(p => p.id === "test-progressive").earmark, { recipientId: null, recipient: "Test recipient", note: "Test note" });
assert.equal((await call({ op: "save", property: { id: "test-progressive", earmark: null } })).status, 200);
assert.equal((await call()).body.properties.find(p => p.id === "test-progressive").earmark, null);
check("an earmark saves, reads back and clears through the store", () => {});
await call({ op: "delete", id: "test-progressive" });
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
