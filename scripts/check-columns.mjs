// Local/staging browser regression. Every API is local or mocked; never writes to production.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { installReadModelRoutes } from "./dev/read-model-api.mjs";
const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) throw new Error("Column regression must run on a local preview.");
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (/^<Tr> got/.test(message.text())) errors.push(message.text()); });
await context.route("**/api/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"status":"unreachable","error":"Local test feed unavailable"}' }));
await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
await installReadModelRoutes(page);
const table = (key) => page.locator(`table[data-table-view="${key}"]`).first();
const order = (key) => table(key).locator("thead tr").first().locator("th[data-col]").evaluateAll((ths) => ths.map((th) => th.dataset.col));
const footerValues = (key, ids) => table(key).evaluate((t, ids) => {
  const columns = [...t.tHead.rows[0].cells].map((c) => c.dataset.col);
  const values = {}; let index = 0;
  for (const cell of t.tFoot.rows[0].cells) {
    if (ids.includes(columns[index])) values[columns[index]] = cell.innerText.trim();
    index += cell.colSpan;
  }
  return values;
}, ids);
async function picker(key) {
  await page.locator(`[data-edit-columns="${key}"]`).first().click();
  await page.locator(`[data-column-editor="${key}"]`).waitFor();
}
async function pick(key, id, visible) {
  await picker(key);
  await page.locator(`[data-column-checkbox="${id}"]`).setChecked(visible);
  await page.keyboard.press("Escape");
  assert.equal((await order(key)).includes(id), visible);
}
async function align(key) {
  const grid = await table(key).evaluate((t) => {
    const header = t.tHead.rows[0].cells.length;
    return [...t.rows].filter((r) => r.closest("table") === t && r.cells.length).map((r) => ({ header, cells: [...r.cells].reduce((sum, cell) => sum + cell.colSpan, 0) }));
  });
  assert.ok(grid.length > 2);
  for (const row of grid) assert.equal(row.cells, row.header, `${key}: row/total no longer aligns`);
}
try {
  await page.goto(`${BASE}/private-market`, { waitUntil: "domcontentloaded" });
  await table("pm-book").waitFor();
  const original = await order("pm-book");
  const totals = await footerValues("pm-book", original);
  await pick("pm-book", "review:investmentRange", true);
  const expanded = page.locator('[data-pm-section-toggle="atCost"]');
  if (await page.locator('[data-pm-section="atCost"]').getAttribute("data-pm-section-open") !== "true") await expanded.click();
  const edu = page.locator('tr[data-pm-group]').filter({ hasText: /Edugorilla Community/i }).first();
  assert.equal(await edu.locator('[data-col-cell="review:investmentRange"]').innerText(), "20 Aug 2025");
  const matrix = page.locator('tr[data-pm-group]').filter({ hasText: /Matrix Gas/i }).first();
  assert.equal(await matrix.locator('[data-col-cell="review:investmentRange"]').innerText(), "Mar 2024");
  await align("pm-book");
  await table("pm-book").locator('[data-col-grip="review:investmentRange"]').focus();
  await page.keyboard.press("ArrowLeft");
  const moved = await order("pm-book");
  assert.notDeepEqual(moved, [...original, "review:investmentRange"]);
  await pick("pm-book", "cost", false);
  await align("pm-book");
  await page.reload({ waitUntil: "domcontentloaded" });
  await table("pm-book").waitFor();
  assert.deepEqual(await order("pm-book"), moved.filter((id) => id !== "cost"));
  await page.goto(`${BASE}/private-market?view=owners`, { waitUntil: "domcontentloaded" });
  await table("pm-book").waitFor();
  assert.deepEqual(await order("pm-book"), moved.filter((id) => id !== "cost"));
  await pick("pm-book", "cost", true);
  assert.deepEqual(await order("pm-book"), moved);
  await page.goto(`${BASE}/private-market`, { waitUntil: "domcontentloaded" });
  await table("pm-book").waitFor();
  assert.deepEqual(await footerValues("pm-book", original), totals, "Changing visibility modified existing totals");
  await table("pm-book").locator('[data-col-button="review:investmentRange"]').click();
  assert.equal(await table("pm-book").locator('[data-col="review:investmentRange"]').getAttribute("aria-sort"), "descending");
  // Pointer movement uses the same whole-column drag as all original columns.
  await table("pm-book").locator('[data-col-grip="review:investmentRange"]').scrollIntoViewIfNeeded();
  const from = await table("pm-book").locator('[data-col-grip="review:investmentRange"]').boundingBox();
  const target = await table("pm-book").locator('[data-col="call"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width - 2, target.y + target.height / 2, { steps: 15 });
  assert.equal(await page.locator("[data-col-ghost]").count(), 1);
  await page.mouse.up();
  assert.notDeepEqual(await order("pm-book"), moved, "Pointer drag did not move the added column");
  await align("pm-book");
  await picker("pm-book");
  await page.getByRole("button", { name: "Reset columns", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.deepEqual(await order("pm-book"), original);
  for (const [url, key, field] of [
    ["/monitor", "monitor", "review:investmentRange"],
    ["/family", "family-entities", "review:entityTotal"],
    ["/sectors", "sectors", "review:nifty50Weight"],
    ["/cio?tab=allocation&alloc=assetClass", "cio-allocation", "review:effectiveAllocation"],
    ["/private-market?view=transactions", "pm-calls", "amount"],
  ]) {
    await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
    await table(key).waitFor();
    const before = await order(key);
    await pick(key, field, !before.includes(field));
    await align(key);
    const after = await order(key);
    if (key === "monitor") {
      await page.goto(BASE + "/monitor?group=category", { waitUntil: "domcontentloaded" });
      await table(key).waitFor();
      assert.deepEqual(await order(key), after.filter((id) => !["viaFunds", "totalExposure"].includes(id)));
      await align(key);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await table(key).waitFor();
    assert.ok((await order(key)).includes(field) === !before.includes(field));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await picker("pm-calls");
  const box = await page.locator('[data-column-editor="pm-calls"]').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 845, "Picker overflows the phone viewport");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "/tmp/glow-edit-columns-mobile.png" });
  console.log("ok source dates, show/hide, keyboard and pointer movement, reload and axis persistence, unchanged totals, table alignment, reset and mobile picker");
} finally { await browser.close(); }
