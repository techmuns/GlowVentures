// Local/staging browser contract for the consolidated workbook and its sources.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
const base = process.env.BASE ?? "http://127.0.0.1:4173";
const manifest = JSON.parse(await fs.readFile("public/audit/manifest.json", "utf8"));
const revision = JSON.parse(await fs.readFile("src/data/readModels.json", "utf8"));
const book = JSON.parse(await fs.readFile(`public/views/${revision.revision}/consolidated/book.json`, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  await fs.mkdir("docs/page-check", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => requests.push(new URL(r.url()).pathname));
  // The audit never needs a market feed; local verification isolates it.
  await page.route("**/api/**", r => r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"local audit verification"}' }));
  await page.goto(`${base}/audit`);
  await page.locator('[data-consolidated="ready"]').waitFor();
  assert.equal(await page.locator('details[data-audit-sources]').getAttribute("open"), null);
  assert.equal(requests.filter(p => p.startsWith("/audit/")).length, 0, "summary loads without fetching the original statement archive");
  const tabs = page.getByRole("navigation", { name: "Consolidated sheet subtabs" });
  assert.equal(await tabs.getByRole("button").count(), 17);
  await page.screenshot({ path: "docs/page-check/consolidated-light.png", fullPage: true });
  const firstLink = page.locator('[data-consolidated-row="0"] td').first().getByRole("link");
  await firstLink.click();
  assert.equal(new URL(page.url()).searchParams.get("consolidated"), "Holdings");
  assert.ok(new URL(page.url()).searchParams.get("scope"));
  await page.getByLabel("Search consolidated sheet").fill("");
  await page.locator('[data-consolidated-row]').first().locator('td').nth(1).getByRole("link").click();
  assert.equal(new URL(page.url()).searchParams.get("consolidated"), "Accounts");
  assert.equal(await page.locator('[data-consolidated-row]').count(), 1, "account hyperlink opens only its account row");
  for (const name of await tabs.getByRole("button").allTextContents()) {
    await tabs.getByRole("button", { name, exact: true }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
    assert.ok(await page.locator('[data-consolidated-row]').count(), `${name} is populated`);
  }
  await tabs.getByRole("button", { name: "Portfolio Allocation", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel", exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  assert.equal(workbook.worksheets.length, 17);
  assert.equal(workbook.getWorksheet("Accounts").rowCount, book.tabs.find(t => t.name === "Accounts").rows.length + 5);
  assert.ok(workbook.getWorksheet("Holdings").getCell("B6").value.hyperlink.startsWith("#'Accounts'!"));
  await page.locator('details[data-audit-sources] > summary').click();
  await page.locator('[data-xa="audit-chip"]').first().waitFor();
  assert.equal(await page.locator('[data-xa="audit-chip"]').count(), manifest.length);
  const file = await page.locator('[data-xa="audit-chip"]').first().getAttribute("data-file");
  await page.goto(`${base}/audit?file=${encodeURIComponent(file)}`);
  await page.locator('[data-xa="audit-chip"]').first().waitFor();
  assert.ok(await page.locator('details[data-audit-sources]').getAttribute("open") !== null, "old source deep links still open the source footnote");
  await page.goto(`${base}/audit`);
  await page.locator('[data-consolidated="ready"]').waitFor();
  await page.evaluate(() => { document.documentElement.classList.add("dark"); });
  await page.screenshot({ path: "docs/page-check/consolidated-dark.png", fullPage: true });
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no page overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS consolidated browser: 17 subtabs, summary/detail hyperlinks, collapsed source footnote, original source deep links, Excel download, both themes and responsive containment");
} finally { await browser.close(); }
