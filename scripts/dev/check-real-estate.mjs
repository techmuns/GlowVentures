// A single browser, local data only. Uses the actual Pages handler against an
// in-memory dashboard store; no property write reaches a deployed application.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { onRequest } from "../../functions/api/real-estate.js";
import { property, memoryStore } from "./real-estate-fixtures.mjs";
const base = process.env.BASE || "http://127.0.0.1:4173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base)) throw new Error("This check writes local test records; use a localhost BASE.");
const out = path.resolve(".cache/real-estate-check"); await fs.mkdir(out, { recursive: true });
const store = memoryStore();
let failing = false;
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.message));
await page.route("**/api/**", async route => {
  const r = route.request();
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
  await fill("Property name *", "Test apartment"); await fill("Address / survey no. *", "Test address"); await fill("City / district *", "Mumbai"); await fill("State", "Maharashtra");
  await fill("Owner 1", "Test owner A"); await fill("Total cost (₹)", "10000000"); await fill("Current value (₹)", "15000000");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await visible("Add the valuation date for the current value.");
  await fill("Valuation date", "2026-10-01");
  await page.getByLabel("Status", { exact: true }).selectOption("Rented"); await fill("Monthly rent (₹)", "50000"); await fill("Monthly costs (₹)", "5000"); await fill("Loan outstanding (₹)", "3000000");
  await fill("Latitude", "19.076"); await fill("Longitude", "72.8777");
  failing = true;
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await visible("Test storage outage");
  assert.equal(await page.getByLabel("Property name *", { exact: true }).inputValue(), "Test apartment");
  failing = false;
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(store.data.size, 1);
  const createdKey = [...store.data.keys()][0];
  await close();
  await page.reload(); await page.getByRole("button", { name: "Test apartment", exact: true }).waitFor();
  await page.getByRole("button", { name: "Test apartment", exact: true }).click();
  await page.getByRole("button", { name: "Edit property", exact: true }).click();
  await fill("Monthly rent (₹)", "60000");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(JSON.parse(store.data.values().next().value).monthlyRent, 60000);
  await close();
  // Several types, locations and the exact same coordinates; one record is unpinned.
  for (const p of [property({ id: "test-land", name: "Test land", type: "Land", areaBasis: "Plot", area: 2, areaUnit: "acre", city: "Pune", status: "Vacant", monthlyRent: 0, latitude: null, longitude: null }),
    property({ id: "test-office", name: "Test office", type: "Office", city: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946 }),
    property({ id: "test-apartment-two", name: "Test second apartment" })]) {
    await store.put(`real-estate:${p.id}`, JSON.stringify(p));
  }
  await page.reload(); await page.getByRole("button", { name: "Test land", exact: true }).waitFor();
  await page.getByLabel("All states", { exact: true }).selectOption("Karnataka");
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
  const picker = page.getByLabel("Click map to set property pin", { exact: true });
  await picker.click({ position: { x: 210, y: 140 } });
  assert.ok(await page.getByLabel("Latitude", { exact: true }).inputValue());
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor(); await close();
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await page.screenshot({ path: path.join(out, "table.png"), fullPage: true });
  await page.locator("html").evaluate(el => el.classList.add("dark"));
  await page.screenshot({ path: path.join(out, "dark.png"), fullPage: true });
  await page.locator("html").evaluate(el => el.classList.remove("dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, "The document must not scroll horizontally; the property table has its own scroller.");
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.getByRole("button", { name: "Test apartment", exact: true }).click();
  await page.getByRole("button", { name: "Delete property", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(store.data.has(createdKey), false);
  assert.equal(store.data.size, 3);
  assert.deepEqual(errors, []);
  console.log("Real estate browser check passed: create, validate, save failure/retry, persist, edit, filter, co-located pins, map editing, table/map detail parity, delete, light/dark and mobile.");
} finally { await browser.close(); }
