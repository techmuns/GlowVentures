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
const context = await chromium.launchPersistentContext(path.join(out, `browser-profile-${process.pid}`), { executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, viewport: { width: 1512, height: 982 } });
const browser = context;
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
  assert.equal(await page.getByRole("form", { name: "Property editor" }).locator("[required]").count(), 0);
  await fill("Country", "");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  const draftKey = [...store.data.keys()][0];
  assert.equal(JSON.parse(store.data.get(draftKey)).monthlyRent, null);
  assert.deepEqual(JSON.parse(store.data.get(draftKey)).owners, []);
  await close(); await page.reload();
  await page.getByRole("button", { name: "Untitled property", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).click();
  await fill("Property name", "Test draft"); await fill("Current value (₹)", "5000000");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(JSON.parse(store.data.get(draftKey)).valuationDate, null);
  assert.equal(JSON.parse(store.data.get(draftKey)).value, 5000000);
  assert.notEqual(await page.locator("dialog dl > div").filter({ has: page.getByText("Current value", { exact: true }) }).locator("dd").innerText(), "—", "Entered whole-property value remains visible before ownership is completed.");
  await page.getByRole("button", { name: "Edit property", exact: true }).click();
  await page.getByRole("button", { name: "Add owner", exact: true }).click();
  await fill("Owner 1", "Test duplicate owner"); await page.getByLabel("Share %", { exact: true }).nth(0).fill("100");
  await page.getByRole("button", { name: "Add owner", exact: true }).click();
  await fill("Owner 2", "Test duplicate owner"); await page.getByLabel("Share %", { exact: true }).nth(1).fill("100");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(JSON.parse(store.data.get(draftKey)).owners.length, 1, "Duplicate owner rows must save once.");
  await page.getByRole("button", { name: "Edit property", exact: true }).click();
  await fill("Share %", ""); await fill("Address / survey no.", "Test later address");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(JSON.parse(store.data.get(draftKey)).owners[0].share, null);
  await close(); await page.reload(); await page.getByRole("button", { name: "Test draft", exact: true }).click();
  await page.getByRole("button", { name: "Delete property", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" }); assert.equal(store.data.size, 0);
  await page.getByRole("button", { name: "Add property", exact: true }).first().click();
  await fill("Property name", "Test apartment");
  await fill("Address / survey no.", "Test no match"); await page.getByRole("button", { name: "Find on map", exact: true }).click();
  await visible("No address found. Add a nearby landmark or place the pin on the map.");
  assert.equal(await page.locator(".leaflet-marker-icon").count(), 0);
  await fill("Address / survey no.", "Test fail"); await page.getByRole("button", { name: "Find on map", exact: true }).click();
  await visible("Address search is unavailable. Try again or place the pin on the map.");
  await fill("Address / survey no.", "Test ambiguous"); await page.getByRole("button", { name: "Find on map", exact: true }).click();
  await page.getByLabel("Matching addresses").getByRole("button", { name: /Test address B/ }).click();
  await visible("Approximate match. Drag the pin to the exact property.");
  assert.equal(await page.getByLabel("City / district", { exact: true }).inputValue(), "Mumbai");
  assert.equal(await page.getByLabel("State", { exact: true }).inputValue(), "Maharashtra");
  assert.equal(await page.getByLabel("PIN / postal code", { exact: true }).inputValue(), "400001");
  await fill("Owner 1", "Test owner A"); await fill("Purchase cost (₹)", "10000000"); await fill("Current value (₹)", "15000000");
  await fill("Share %", "100");
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
  assert.equal(await page.getByLabel("Property name", { exact: true }).inputValue(), "Test apartment");
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
  await fill("Address / survey no.", "Test wait old");
  const waitingSearch = page.waitForRequest(request => request.url().includes("/api/property-geocode?") && request.url().includes("Test+wait"));
  await page.getByRole("button", { name: "Find on map", exact: true }).click(); await waitingSearch;
  await fill("Address / survey no.", "Test current address");
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
  // The list beside the map; the tax table below carries its own button for the same property.
  await page.locator('[data-navigation-scroll="realestate-2"]').getByRole("button").filter({ hasText: "Test land" }).click();
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
  // An inherited property: no purchase cost, current value only, appreciation absent with its reason.
  const cellOf = async (name, label) => {
    const headers = await page.locator("[data-real-estate-table] thead th").allInnerTexts();
    const i = headers.findIndex(h => h.trim().toLowerCase() === label.toLowerCase());
    assert.ok(i >= 0, `${label} column is shown`);
    return (await page.locator("tbody [data-property]").filter({ hasText: name }).locator("td").nth(i).innerText()).trim();
  };
  await page.getByRole("button", { name: "Add property", exact: true }).first().click();
  await fill("Property name", "Test inherited"); await fill("Owner 1", "Test owner A"); await fill("Share %", "100");
  await page.getByRole("dialog").getByLabel(/^Acquisition/).selectOption("Inherited");
  assert.equal(await page.getByLabel("Purchase cost (₹)", { exact: true }).count(), 0, "An inherited property is not asked for a purchase cost.");
  await page.getByLabel("Date of inheritance", { exact: true }).waitFor();
  await fill("Value on date of inheritance (₹)", "0"); await fill("Current value (₹)", "20000000");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await visible("Leave the value on the date of inheritance blank if it is not known, rather than ₹0.");
  await fill("Value on date of inheritance (₹)", "");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal([...store.data.values()].map(v => JSON.parse(v)).find(p => p.name === "Test inherited").cost, null);
  await page.getByRole("dialog").getByText("Inherited · no cost", { exact: true }).waitFor();
  await close();
  assert.notEqual(await cellOf("Test inherited", "Current value"), "—");
  for (const label of ["Cost", "Appreciation", "Appreciation %"]) {
    const text = await cellOf("Test inherited", label);
    assert.match(text, /^—\s+Inherited · no cost$/, `${label} is absent with its reason`);
  }
  await page.getByRole("button", { name: "Edit Test inherited", exact: true }).click();
  await fill("Value on date of inheritance (₹)", "15000000");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor(); await close();
  assert.match(await cellOf("Test inherited", "Cost"), /On inheritance$/);
  assert.match(await cellOf("Test inherited", "Appreciation %"), /^\+33\.33%\s+Since inheritance$/);
  // Capital gains tax: the value on inheritance is not a cost for tax, so the previous owner's cost and date are asked for, together.
  const needs = /^—\s+Needs previous owner's cost, previous owner's acquisition date$/;
  assert.match(await cellOf("Test inherited", "Est. tax on sale"), needs);
  // The cell opens its working: what is still to enter, and a button to the form where it goes.
  assert.equal(await page.locator("[data-property-tax-table]").count(), 0, "No separate tax section: the table's own tax columns explain themselves.");
  const taxInfo = (name, what = "tax on a sale") => page.getByRole("button", { name: `How is the ${what} of ${name} worked out?`, exact: true });
  const popup = page.locator("dialog[data-return-calculation]");
  await taxInfo("Test inherited").click();
  assert.match(await popup.innerText(), /Still to enter: previous owner's cost, previous owner's acquisition date/);
  await popup.getByRole("button", { name: "Enter details", exact: true }).click();
  await popup.waitFor({ state: "detached" });
  assert.equal(await page.getByRole("button", { name: "Add improvement", exact: true }).count(), 0, "Improvements are no longer asked for.");
  await fill("Date of inheritance", "2010-01-01"); await fill("Previous owner's cost (₹)", "2000000"); await fill("Previous owner acquired on", "2005-06-01");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  const saved = [...store.data.values()].map(v => JSON.parse(v)).find(p => p.name === "Test inherited");
  assert.deepEqual([saved.priorCost, saved.priorAcquiredOn, "improvements" in saved], [2000000, "2005-06-01", false]);
  // ₹2 Cr less the previous owner's ₹20 L is a ₹1.8 Cr gain: 12.5% + 4% cess = ₹23.4 L. Indexed it would be
  // higher, so the tax of an owner who is not a registered member is settled at 12.5%.
  await page.locator("[data-property-tax]").getByText("₹23,40,000", { exact: true }).first().waitFor();
  assert.equal(await page.locator("[data-property-tax-owners] tbody tr").count(), 1);
  await page.locator("[data-property-tax]").screenshot({ path: path.join(out, "tax-details.png") });
  await close();
  assert.match(await cellOf("Test inherited", "Est. tax on sale"), /^₹23,40,000\s+12\.5%$/);
  assert.equal(await cellOf("Test inherited", "Value after tax"), "₹1,76,60,000");
  assert.match(await cellOf("Test inherited", "Cost"), /^₹1,50,00,000/, "Appreciation runs on the value on inheritance entered, nothing added.");
  // A click on the tax opens the sum behind it, in figures that add up to the cells: value − cost = gain; gain × rate
  // + cess = tax; value − tax = value after tax.
  await taxInfo("Test inherited").click();
  const working = (await popup.locator("[data-return-steps]").innerText()).replace(/\s+/g, " ");
  assert.match(working, /Held since 1 Jun 2005, when the previous owner acquired it: more than 2 years/);
  assert.match(working, /Current value ₹2,00,00,000 − the previous owner's cost ₹20,00,000 = taxable gain \+₹1,80,00,000/);
  assert.match(working, /12\.5% of the gain comes to ₹23,40,000; 20% of the gain over the indexed cost ₹65,64,103 comes to ₹27,94,667/);
  assert.match(working, /₹1,80,00,000 × 12\.5% = ₹22,50,000, plus 4% cess ₹90,000 = ₹23,40,000/);
  assert.match(working, /Value after tax: ₹2,00,00,000 − ₹23,40,000 = ₹1,76,60,000/);
  assert.equal((await popup.locator("[data-return-result]").innerText()).trim(), "₹23,40,000");
  await popup.screenshot({ path: path.join(out, "tax-working.png") });
  await page.keyboard.press("Escape"); await popup.waitFor({ state: "detached" });
  await taxInfo("Test inherited", "value after tax").click();
  assert.equal((await popup.locator("[data-return-result]").innerText()).trim(), "₹1,76,60,000");
  await page.getByRole("button", { name: "Close return calculation", exact: true }).click(); await popup.waitFor({ state: "detached" });
  // A blank acquisition is taxed as the purchase its cost and date were entered as; where 20% after indexation would
  // be lower, an owner who is not a registered member leaves it open, and the working says why.
  assert.match(await cellOf("Test land", "Est. tax on sale"), /^—\s+Owner not registered$/);
  await taxInfo("Test land").click();
  assert.match((await popup.innerText()).replace(/\s+/g, " "), /not a registered family member[\s\S]*20% after indexation would make it lower/);
  await page.keyboard.press("Escape"); await popup.waitFor({ state: "detached" });
  await page.screenshot({ path: path.join(out, "inherited.png"), fullPage: true });
  // An earmark: recipient and note on the list, filterable; ownership and value stay with the current owners.
  const valueBefore = await cellOf("Test office", "Current value");
  await page.getByRole("button", { name: "Edit Test office", exact: true }).click();
  await page.getByLabel("Earmarked / to be gifted", { exact: true }).check();
  await fill("Intended recipient", "Test recipient C"); await fill("Earmark note", "Test note for the gift");
  await page.getByLabel("Intended recipient", { exact: true }).evaluate(el => el.scrollIntoView({ block: "center" }));
  await page.getByRole("dialog").screenshot({ path: path.join(out, "earmark-editor.png") });
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  const earmarkedOffice = JSON.parse(store.data.get("real-estate:test-office"));
  assert.deepEqual(earmarkedOffice.earmark, { recipientId: null, recipient: "Test recipient C", note: "Test note for the gift" });
  assert.deepEqual(earmarkedOffice.owners, property().owners, "Earmarking moves no ownership.");
  await page.getByRole("dialog").getByText("To be gifted to Test recipient C", { exact: true }).waitFor();
  await page.getByRole("dialog").getByText("Test note for the gift", { exact: true }).waitFor();
  await close();
  assert.match(await cellOf("Test office", "Earmarked for"), /^Test recipient C\s+To be gifted$/);
  assert.equal(await cellOf("Test office", "Current value"), valueBefore, "Earmarking leaves the value with the current owners.");
  assert.equal(await cellOf("Test land", "Earmarked for"), "Not earmarked");
  const earmarkFilter = page.getByLabel("All earmarks", { exact: true });
  const shownIds = () => page.locator("tbody [data-property]").evaluateAll(rows => rows.map(r => r.getAttribute("data-property")));
  await earmarkFilter.selectOption("to:Test recipient C"); assert.deepEqual(await shownIds(), ["test-office"]);
  await earmarkFilter.selectOption("earmarked"); assert.deepEqual(await shownIds(), ["test-office"]);
  await page.screenshot({ path: path.join(out, "earmarked.png"), fullPage: true });
  await earmarkFilter.selectOption("not-earmarked"); assert.equal((await shownIds()).length, 3); assert.ok(!(await shownIds()).includes("test-office"));
  await page.getByRole("button", { name: "Clear filters", exact: true }).click(); assert.equal((await shownIds()).length, 4);
  await page.getByRole("button", { name: "Edit Test office", exact: true }).click();
  await page.getByLabel("Earmarked / to be gifted", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor(); await close();
  assert.equal(JSON.parse(store.data.get("real-estate:test-office")).earmark, null);
  assert.equal(await cellOf("Test office", "Earmarked for"), "Not earmarked");
  assert.deepEqual(errors, []);
  console.log("Real estate browser check passed: address-only search, choices, no match/error, approximate result, drag/save/reload, stale search, create, validate, retry, edit, filter, co-located pins, map editing, delete, earmark and its filter, light/dark and mobile. Free provider boundary mocked; production records untouched.");
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(out, "failure.txt"), `${error.stack ?? error}\n\n${await page.locator("body").innerText().catch(() => "")}`);
  throw error;
} finally { await browser.close(); }
