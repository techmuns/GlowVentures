// Local/staging browser contract for the consolidated workbook and its sources.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
const base = process.env.BASE ?? "http://127.0.0.1:4173";
const manifest = JSON.parse(await fs.readFile("public/audit/manifest.json", "utf8"));
const revision = JSON.parse(await fs.readFile("src/data/readModels.json", "utf8"));
const book = JSON.parse(await fs.readFile(`public/views/${revision.revision}/consolidated/book.json`, "utf8"));
const output = path.resolve(".cache/consolidated-date-check");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, downloadsPath: output });
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
  assert.equal(await tabs.getByRole("button").count(), 2);
  assert.equal((await page.locator('[data-consolidated="ready"] thead th').first().innerText()).trim(), "Security", "the security is the first column");
  await page.screenshot({ path: "docs/page-check/consolidated-light.png", fullPage: true });
  // A holding's "Transactions on file" opens exactly its records on the second tab.
  const view = book.tabs[0], txnsAt = view.columns.findIndex(c => c.key === "txns");
  const linked = view.rows.findIndex(r => r.links?.txns);
  await page.locator(`[data-consolidated-row="${linked}"] td`).nth(txnsAt).getByRole("link").click();
  assert.equal(new URL(page.url()).searchParams.get("consolidated"), "Transactions");
  assert.equal(await page.locator('[data-consolidated-row]').count(), view.rows[linked].values[txnsAt], "the link opens only that holding's records");
  for (const name of await tabs.getByRole("button").allTextContents()) {
    await tabs.getByRole("button", { name, exact: true }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
    assert.ok(await page.locator('[data-consolidated-row]').count(), `${name} is populated`);
  }
  // Date bounds apply to the transaction's Date, including both endpoints,
  // while preserving search, holding scopes, history and complete Excel exports.
  const txns = book.tabs.find(t => t.name === "Transactions");
  const dateAt = txns.columns.findIndex(c => c.key === "date");
  const dates = [...new Set(txns.rows.map(r => r.values[dateAt]).filter(Boolean))].sort();
  const start = dates.at(-5), end = dates.at(-1);
  const from = page.getByLabel("From date", { exact: true }), to = page.getByLabel("To date", { exact: true });
  const search = page.getByRole("textbox", { name: "Search consolidated sheet" });
  async function expectTransactions(expected) {
    await page.waitForFunction(n => Number(document.querySelector('[data-infinite-rows]')?.dataset.infiniteRows) === n, expected.length);
    const shown = await page.locator('[data-consolidated-row]').evaluateAll(rs => rs.map(r => Number(r.dataset.consolidatedRow)));
    assert.deepEqual(shown, expected.slice(0, shown.length), "the displayed records match the selected dates in their original order");
    assert.equal(shown.length, Math.min(expected.length, 50), "date changes reset the table's row window");
  }
  const indices = predicate => txns.rows.flatMap((r, i) => predicate(r.values) ? [i] : []);
  await from.fill(start);
  await expectTransactions(indices(v => v[dateAt] >= start));
  await to.fill(end);
  await expectTransactions(indices(v => v[dateAt] >= start && v[dateAt] <= end));
  assert.equal(await from.getAttribute("max"), end);
  assert.equal(await to.getAttribute("min"), start);
  await from.fill("");
  await expectTransactions(indices(v => !!v[dateAt] && v[dateAt] <= end));
  await from.fill(end);
  const sameDay = indices(v => v[dateAt] === end);
  assert.ok(sameDay.length > 0, "the same-day fixture has records on the boundary");
  await expectTransactions(sameDay);
  await page.reload();
  await page.locator('[data-consolidated="ready"]').waitFor();
  assert.equal(await from.inputValue(), end);
  assert.equal(await to.inputValue(), end);
  await expectTransactions(sameDay);
  await tabs.getByRole("button", { name: "Consolidated View", exact: true }).click();
  assert.equal(await page.getByRole("group", { name: "Transaction date range" }).count(), 0);
  await page.goBack();
  await expectTransactions(sameDay);
  const sample = txns.rows[sameDay[0]].values;
  const accountAt = txns.columns.findIndex(c => c.key === "acct"), nameAt = txns.columns.findIndex(c => c.key === "name");
  const scoped = new URLSearchParams({ consolidated: "Transactions", scope: JSON.stringify({ acct: sample[accountAt] }), from: start, to: end });
  await page.goto(`${base}/audit?${scoped}`);
  await page.locator('[data-consolidated="ready"]').waitFor();
  await search.fill(sample[nameAt]);
  const matching = v => v[accountAt] === sample[accountAt] && v.some(c => String(c ?? "").toLowerCase().includes(sample[nameAt].toLowerCase()));
  await expectTransactions(indices(v => matching(v) && v[dateAt] >= start && v[dateAt] <= end));
  await page.getByRole("button", { name: "Clear dates", exact: true }).click();
  await expectTransactions(indices(matching));
  assert.equal(await search.inputValue(), sample[nameAt], "clearing dates keeps the search");
  assert.equal(new URL(page.url()).searchParams.get("scope"), scoped.get("scope"), "clearing dates keeps the holding scope");
  await page.goto(`${base}/audit?consolidated=Transactions&from=2100-01-01`);
  await page.locator('[data-consolidated="ready"]').waitFor();
  await expectTransactions([]);
  await page.getByText("No matching rows.", { exact: true }).waitFor();
  const tableDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel", exact: true }).click();
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.readFile(await (await tableDownload).path());
  assert.equal(exported.worksheets[0].rowCount, txns.rows.length + 1, "Excel still includes the complete transaction register");
  assert.equal(await from.inputValue(), "2100-01-01", "export preserves the selected date");
  await expectTransactions([]);
  await page.goto(`${base}/audit?consolidated=Transactions&from=${end}&to=${start}`);
  await page.locator('[data-consolidated="ready"]').waitFor();
  await page.getByRole("alert").filter({ hasText: "From date must be on or before To date." }).waitFor();
  await expectTransactions([]);
  await page.getByRole("button", { name: "Clear dates", exact: true }).click();
  await expectTransactions(txns.rows.map((_, i) => i));
  await from.fill(start);
  await to.fill(end);
  for (const dark of [false, true]) {
    await page.evaluate(d => document.documentElement.classList.toggle("dark", d), dark);
    for (const width of [1440, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `date controls fit at ${width}`);
      await page.screenshot({ path: `${output}/transactions-${dark ? "dark" : "light"}-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tabs.getByRole("button", { name: "Consolidated View", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel", exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  assert.deepEqual(workbook.worksheets.map(s => s.name), ["Consolidated View", "Transactions"]);
  for (const t of book.tabs) assert.equal(workbook.getWorksheet(t.name).rowCount, t.rows.length + 5);
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
  console.log("PASS consolidated browser: inclusive and one-sided dates, same-day ranges, clear/search/scope/history, invalid and empty ranges, complete Excel exports, 2 tabs, source links, both themes and responsive containment");
} finally { await browser.close(); }
