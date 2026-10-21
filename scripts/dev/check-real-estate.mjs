// A single browser, local data only. Uses the actual Pages handler against an
// in-memory dashboard store; no property write reaches a deployed application.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { onRequest } from "../../functions/api/real-estate.js";
import { assertUnfilteredSearchExport, downloadTableWorkbook } from "./table-excel.mjs";
import { property, memoryStore } from "./real-estate-fixtures.mjs";
import { handlePropertyGeocode } from "../../functions/api/property-geocode.js";
const base = process.env.BASE || "http://127.0.0.1:4173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base)) throw new Error("This check writes local test records; use a localhost BASE.");
const out = path.resolve(".cache/real-estate-check"); await fs.mkdir(out, { recursive: true });
const store = memoryStore();
let failing = false;
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.stack || error.message));
const searches = []; let releaseSearch;
const feature = (name, extra = {}) => ({ type: "Feature", geometry: { type: "Point", coordinates: [72.8777, 19.076] }, properties: { name, city: "Mumbai", state: "Maharashtra", country: "India", postcode: "400001", type: "house", ...extra } });
const searchFetcher = async url => {
  const address = new URL(url).searchParams.get("q"); searches.push(address);
  if (address.includes("Test wait")) await new Promise(resolve => { releaseSearch = resolve; });
  if (address.includes("Test fail")) return new Response("Temporary outage", { status: 503 });
  return Response.json({ features: address.includes("Test no match") ? [] : address.includes("Test ambiguous")
    ? [feature("Test address A", { housenumber: "1", street: "Test street" }), feature("Test address B")]
    : [feature("Test address")] });
};
await page.route("**/api/**", async route => {
  const r = route.request();
  if (new URL(r.url()).pathname === "/api/property-geocode") {
    const response = await handlePropertyGeocode({ request: new Request(r.url()) }, { fetcher: searchFetcher });
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  }
  if (new URL(r.url()).pathname === "/api/real-estate") {
    if (failing) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, message: "Test storage outage" }) });
    const response = await onRequest({ request: new Request(r.url(), { method: r.method(), headers: { ...r.headers(), origin: new URL(base).origin }, ...(r.method() === "POST" ? { body: r.postData() } : {}) }), env: { DASHBOARD_STORE: store } });
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  }
  return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "External feeds disabled for local property check." }) });
});
const fill = (label, value) => page.getByLabel(label, { exact: true }).fill(value);
const close = () => page.getByRole("button", { name: "Close property", exact: true }).click();
async function visible(text) { await page.getByText(text, { exact: true }).first().waitFor(); }
try {
  await page.goto(`${base}/real-estate`);
  await page.locator("[data-real-estate-table] tbody").getByText("No properties added").waitFor();
  assert.deepEqual(await page.locator('[data-nav-group="Daily"] [data-nav-entry]').evaluateAll(links => links.map(a => a.getAttribute("data-nav-entry"))), ["/cio", "/monitor", "/private-market", "/real-estate", "/polycab"]);
  await page.screenshot({ path: path.join(out, "empty.png"), fullPage: true });
  await page.getByRole("button", { name: "Add property", exact: true }).first().click();
  await fill("Property name *", "Test apartment");
  await fill("Address / survey no. *", "Test no match"); await page.getByRole("button", { name: "Find on map", exact: true }).click();
  await visible("No address found. Add a nearby landmark or place the pin on the map.");
  assert.equal(await page.locator(".leaflet-marker-icon").count(), 0);
  await fill("Address / survey no. *", "Test fail"); await page.getByRole("button", { name: "Find on map", exact: true }).click();
  await visible("Address search is unavailable. Try again or place the pin on the map.");
  await fill("Address / survey no. *", "Test ambiguous"); await page.getByRole("button", { name: "Find on map", exact: true }).click();
  await page.getByLabel("Matching addresses").getByRole("button", { name: /Test address B/ }).click();
  await visible("Approximate match. Drag the pin to the exact property.");
  assert.equal(await page.getByLabel("City / district *", { exact: true }).inputValue(), "Mumbai");
  assert.equal(await page.getByLabel("State", { exact: true }).inputValue(), "Maharashtra");
  assert.equal(await page.getByLabel("PIN / postal code", { exact: true }).inputValue(), "400001");
  await fill("Owner 1", "Test owner A"); await fill("Total cost (₹)", "10000000"); await fill("Current value (₹)", "15000000");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await visible("Add the valuation date for the current value.");
  await fill("Valuation date", "2026-10-01");
  await page.getByRole("dialog").getByLabel(/^Status/).selectOption("Rented"); await fill("Monthly rent (₹)", "50000"); await fill("Monthly costs (₹)", "5000"); await fill("Loan outstanding (₹)", "3000000");
  assert.equal(await page.getByLabel("Latitude", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Longitude", { exact: true }).count(), 0);
  const picker = page.getByLabel("Click map or drag pin to set property location", { exact: true });
  const pin = page.locator('.leaflet-marker-icon[title="Drag pin to the property"]');
  await pin.scrollIntoViewIfNeeded(); const pinBox = await pin.boundingBox(); assert.ok(pinBox);
  await page.mouse.move(pinBox.x + 14, pinBox.y + 14); await page.mouse.down();
  await page.mouse.move(pinBox.x + 64, pinBox.y - 16, { steps: 6 }); await page.mouse.up();
  await page.getByText("Pin set. Drag it to adjust the exact spot.", { exact: true }).waitFor();
  // Co-location below uses this exact test pin, chosen through the UI.
  let placedPoint;
  failing = true;
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await visible("Test storage outage");
  assert.equal(await page.getByLabel("Property name *", { exact: true }).inputValue(), "Test apartment");
  failing = false;
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(store.data.size, 1);
  const createdKey = [...store.data.keys()][0];
  const createdProperty = JSON.parse(store.data.get(createdKey)); placedPoint = { latitude: createdProperty.latitude, longitude: createdProperty.longitude };
  assert.ok(Math.abs(placedPoint.latitude - 19.076) > 0.00001 || Math.abs(placedPoint.longitude - 72.8777) > 0.00001, "The dragged pin must be saved instead of the original search point.");
  await close();
  await page.reload(); await page.getByRole("button", { name: "Test apartment", exact: true }).waitFor();
  await page.getByRole("button", { name: "Test apartment", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).click();
  assert.equal(searches.length, 3, "Reopening a saved property must not search its address again.");
  await fill("Address / survey no. *", "Test wait old");
  const waitingSearch = page.waitForRequest(request => request.url().includes("/api/property-geocode?") && request.url().includes("Test+wait"));
  await page.getByRole("button", { name: "Find on map", exact: true }).click(); await waitingSearch;
  await fill("Address / survey no. *", "Test current address");
  assert.ok(releaseSearch); releaseSearch();
  await fill("Monthly rent (₹)", "60000");
  await page.getByRole("dialog").getByLabel(/^Status/).selectOption("For sale");
  assert.equal(await page.getByLabel("Monthly rent (₹)", { exact: true }).inputValue(), "60000", "Offering a rented property for sale must retain its entered rent.");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(JSON.parse(store.data.values().next().value).monthlyRent, 60000);
  assert.deepEqual({ latitude: JSON.parse(store.data.get(createdKey)).latitude, longitude: JSON.parse(store.data.get(createdKey)).longitude }, placedPoint, "An old search cannot replace the adjusted pin.");
  await close();
  // Several types, locations and the exact same coordinates; one record is unpinned.
  for (const p of [property({ id: "test-land", name: "Test land", type: "Land", areaBasis: "Plot", area: 2, areaUnit: "acre", city: "Pune", status: "Vacant", monthlyRent: 0, latitude: null, longitude: null }),
    property({ id: "test-office", name: "Test office", type: "Office", city: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946 }),
    property({ id: "test-apartment-two", name: "Test second apartment", ...placedPoint })]) {
    await store.put(`real-estate:${p.id}`, JSON.stringify(p));
  }
  await page.reload(); await page.getByRole("button", { name: "Test land", exact: true }).waitFor();
  const exportTable = page.locator('[data-real-estate-table]');
  const completeExport = await downloadTableWorkbook(exportTable,'properties-all');
  await page.getByLabel("All states", { exact: true }).selectOption("Karnataka");
  const stateExport = await downloadTableWorkbook(exportTable,'properties-state-filter');
  assert.deepEqual(stateExport.getSheetValues(),completeExport.getSheetValues(),'Property location filters cannot narrow Excel');
  assert.equal(await page.getByLabel("All states",{exact:true}).inputValue(),'Karnataka');
  await assertUnfilteredSearchExport(page,exportTable,page.getByPlaceholder('Search properties…'),'properties-search');
  assert.equal(await page.locator("tbody [data-property]").count(), 1);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await visible("1 pinned · 0 need a pin");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await visible("3 pinned · 1 need a pin");
  await page.locator(".leaflet-marker-icon").first().waitFor();
  assert.equal(await page.locator(".leaflet-marker-icon").count(), 2);
  await page.locator('.leaflet-marker-icon[title="Test apartment, Test second apartment"]').click();
  await page.locator(".property-pin-list").getByRole("button", { name: "Test second apartment", exact: true }).click();
  await page.getByRole("heading", { name: "Test second apartment", exact: true }).waitFor(); await close();
  await page.screenshot({ path: path.join(out, "map.png"), fullPage: true });
  await page.getByRole("button").filter({ hasText: "Test land" }).click();
  await page.getByRole("button", { name: "Set map pin", exact: true }).click();
  await page.getByRole("button", { name: "Place pin on map", exact: true }).click();
  await picker.click({ position: { x: 210, y: 140 } });
  await page.getByText("Pin set. Drag it to adjust the exact spot.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor(); await close();
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await page.screenshot({ path: path.join(out, "table.png"), fullPage: true });
  await page.locator("html").evaluate(el => el.classList.add("dark"));
  await page.screenshot({ path: path.join(out, "dark.png"), fullPage: true });
  await page.locator("html").evaluate(el => el.classList.remove("dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  const narrowTable = await page.locator("[data-real-estate-table]").evaluate(table => ({
    viewport: table.parentElement.clientWidth, content: table.parentElement.scrollWidth,
    pane: document.querySelector("main").clientWidth,
  }));
  assert.ok(narrowTable.viewport > 0 && narrowTable.viewport <= narrowTable.pane, "The property table stays inside the available content pane.");
  assert.ok(narrowTable.content > narrowTable.viewport, "Wide property columns scroll inside their own container on narrow screens.");
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.getByRole("button", { name: "Test apartment", exact: true }).click();
  await page.getByRole("button", { name: "Delete property", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(store.data.has(createdKey), false);
  assert.equal(store.data.size, 3);
  assert.deepEqual(errors, []);
  console.log("Real estate browser check passed: address-only search, choices, no match/error, approximate result, drag/save/reload, stale search, create, validate, retry, edit, filter, co-located pins, map editing, delete, light/dark and mobile. Free provider boundary mocked; production records untouched.");
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(out, "failure.txt"), `${error.stack ?? error}\n\n${await page.locator("body").innerText().catch(() => "")}`);
  throw error;
} finally { await browser.close(); }
