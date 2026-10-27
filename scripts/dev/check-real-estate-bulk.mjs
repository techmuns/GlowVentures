// Real estate bulk entry, end to end in one browser: download the template, fill
// it as a user would, upload it, review, save, then download the saved
// properties, edit and re-upload. Uses the actual Pages handlers against an
// in-memory store; no property write reaches a deployed application. The page
// reads its properties from /api/table-inputs' shared snapshot, as it does in
// production, so a bulk save must reach that snapshot to show in the table.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { onRequest } from "../../functions/api/real-estate.js";
import { memoryStore } from "./real-estate-fixtures.mjs";
const base = process.env.BASE || "http://127.0.0.1:4173";
if (!/^http:\/\/(127\.0\.0\.\d+|localhost)(:\d+)?\/?$/.test(base)) throw new Error("This check writes local test records; use a localhost BASE.");
const out = path.resolve(".cache/real-estate-bulk-check"); await fs.mkdir(out, { recursive: true });
await build({ stdin: { contents: 'export { onRequest } from "./functions/api/table-inputs";', resolveDir: path.resolve("."), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", alias: { "@": path.resolve("src") }, outfile: path.join(out, "table-inputs.mjs"), logLevel: "error" });
const { onRequest: tableInputs } = await import(pathToFileURL(path.join(out, "table-inputs.mjs")).href);
const store = memoryStore();
const records = () => [...store.data.values()].map(v => JSON.parse(v));
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.stack || error.message));
const snapshots = []; // each /api/table-inputs read and whether it succeeded
await page.route("**/api/**", async route => {
  const r = route.request();
  if (new URL(r.url()).pathname === '/api/statement-data') return route.fulfill({ status: 204 });
  const handler = { "/api/real-estate": onRequest, "/api/table-inputs": tableInputs }[new URL(r.url()).pathname];
  if (handler) {
    const response = await handler({ request: new Request(r.url(), { method: r.method(), headers: { ...r.headers(), origin: new URL(base).origin }, ...(r.method() === "POST" ? { body: r.postData() } : {}) }), env: { DASHBOARD_STORE: store } });
    if (handler === tableInputs && r.method() === "GET") snapshots.push(response.ok);
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  }
  return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "External feeds disabled for local property check." }) });
});
const dialog = page.locator("dialog[data-bulk-entry]");
const openBulk = async () => { await page.getByRole("button", { name: "Bulk entry", exact: true }).click(); await dialog.getByRole("heading", { name: "Bulk entry" }).waitFor(); };
async function download(name) {
  const [file] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name, exact: true }).click()]);
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(await file.path());
  return { book, name: file.suggestedFilename() };
}
// What a user does in Excel: type into cells under the headings, save the file.
async function fill(book, rows, file) {
  const sheet = book.getWorksheet("Properties");
  const headings = sheet.getRow(1).values;
  for (const [row, cells] of Object.entries(rows)) for (const [heading, value] of Object.entries(cells)) {
    const col = headings.indexOf(heading); assert.ok(col > 0, `template has "${heading}"`);
    sheet.getRow(Number(row)).getCell(col).value = value;
  }
  const target = path.join(out, file); await book.xlsx.writeFile(target); return target;
}
async function upload(file) {
  await dialog.getByLabel("Filled property template", { exact: true }).setInputFiles(file);
  await dialog.locator("[data-bulk-summary]").waitFor();
  return Object.fromEntries(await dialog.locator("[data-bulk-row]").evaluateAll(rows => rows.map(r => [r.getAttribute("data-bulk-row"), { action: r.getAttribute("data-bulk-action"), text: r.innerText }])));
}
try {
  await page.goto(`${base}/real-estate`);
  await page.locator("[data-real-estate-table] tbody").getByText("No properties added").waitFor();
  await openBulk();
  assert.equal(await dialog.getByRole("button", { name: /^Download with/ }).count(), 0, "No current properties to include yet.");
  const blank = await download("Download template");
  assert.match(blank.name, /^Glow_Real_Estate_Template_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const headings = blank.book.getWorksheet("Properties").getRow(1).values.filter(Boolean);
  for (const h of ["Property type", "Status", "Address / survey no.", "Country", "Area", "Owner 1", "Owner 1 share %", "Purchase cost (₹) / value on date of inheritance or gift", "Current value (₹)", "Loan outstanding (₹)", "EMI / month (₹)", "Monthly rent (₹)", "Lease ends", "Earmarked / to be gifted", "Intended recipient", "Earmark note"])
    assert.ok(headings.includes(h), `the downloaded template has "${h}"`);
  const member = blank.book.getWorksheet("Lists").getColumn(1).values.filter(Boolean)[1];
  assert.ok(member, "the template lists the dashboard's family members");
  // A first attempt with one bad row: nothing may be saved.
  const firstTry = await fill(blank.book, {
    2: { "Property name": "Test bulk apartment", "Property type": "Apartment", "Status": "Rented", "City / district": "Mumbai", "State": "Maharashtra", "Country": "India", "Area": 1200, "Area unit": "sq ft",
      "Owner 1": member, "Owner 1 share %": 100, "Purchase cost (₹) / value on date of inheritance or gift": 30000000, "Current value (₹)": "4,50,00,000", "Loan outstanding (₹)": 10000000, "EMI / month (₹)": 95000,
      "Monthly rent (₹)": 120000, "Tenant": "Test tenant", "Lease ends": "31/03/2027", "Purchase / inheritance / gift date": "15/08/2019",
      "Earmarked / to be gifted": "Yes", "Intended recipient": member, "Earmark note": "Test gift note" },
    3: { "Property name": "Test bulk land", "Property type": "Land", "Area": 2, "Area unit": "acre", "Owner 1": "Test trust", "Owner 1 share %": 100, "Current value (₹)": "2 Cr" },
    4: { "Property name": "Test bulk inherited", "Property type": "Villa / house", "Acquisition": "Inherited", "Current value (₹)": 80000000, "Previous owner's cost (₹)": 2500000, "Previous owner acquired on": "01/04/1995",
      "Value on 1 Apr 2001 (₹)": 6000000, "Improvement 1 date": "15/06/2012", "Improvement 1 amount (₹)": 1500000 },
  }, "first-try.xlsx");
  let review = await upload(firstTry);
  assert.deepEqual(Object.fromEntries(Object.entries(review).map(([row, r]) => [row, r.action])), { 2: "new", 3: "error", 4: "new" });
  assert.match(review[3].text, /Current value \(₹\): "2 Cr" is not a plain number of rupees/);
  assert.match(await dialog.getByRole("alert").last().innerText(), /Nothing is saved until every row reads cleanly/);
  assert.equal(await dialog.getByRole("button", { name: /^Save / }).count(), 0, "A blocked upload offers no Save.");
  await page.screenshot({ path: path.join(out, "review-problem.png"), fullPage: true });
  assert.equal(store.data.size, 0, "A file with a problem row saves nothing.");
  // The corrected file saves all three, and they appear in the table.
  const fixed = await fill(blank.book, { 3: { "Current value (₹)": 20000000 } }, "fixed.xlsx");
  review = await upload(fixed);
  assert.deepEqual(Object.values(review).map(r => r.action), ["new", "new", "new"]);
  assert.match(review[3].text, /Test trust is not a family member on the dashboard; saved as typed/);
  await page.screenshot({ path: path.join(out, "review-ready.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Save 3 properties", exact: true }).click();
  await dialog.locator("[data-bulk-saved]").getByText("Saved 3 new properties.").waitFor();
  assert.equal(store.data.size, 3);
  const apartment = records().find(p => p.name === "Test bulk apartment");
  assert.deepEqual([apartment.type, apartment.status, apartment.area, apartment.areaUnit, apartment.cost, apartment.value, apartment.debt, apartment.monthlyEmi, apartment.monthlyRent, apartment.monthlyCosts, apartment.leaseEnd, apartment.purchasedOn],
    ["Apartment", "Rented", 1200, "sq ft", 30000000, 45000000, 10000000, 95000, 120000, null, "2027-03-31", "2019-08-15"]);
  assert.ok(apartment.owners[0].ownerId, "a family member from the list is linked to the member, like the form's owner picker");
  assert.deepEqual([apartment.earmark.recipient, apartment.earmark.note, !!apartment.earmark.recipientId], [member, "Test gift note", true]);
  const inherited = records().find(p => p.name === "Test bulk inherited");
  assert.equal(inherited.cost, null, "an inherited property without its value on that date keeps cost blank");
  assert.deepEqual([inherited.priorCost, inherited.priorAcquiredOn, inherited.fmv2001, inherited.improvements], [2500000, "1995-04-01", 6000000, [{ on: "2012-06-15", amount: 1500000 }]]);
  await page.getByRole("button", { name: "Close bulk entry", exact: true }).click();
  for (const name of ["Test bulk apartment", "Test bulk land", "Test bulk inherited"]) await page.locator("[data-real-estate-table] tbody").getByRole("button", { name, exact: true }).waitFor();
  // Single add / edit stays, and carries the EMI too.
  await page.getByRole("button", { name: "Test bulk apartment", exact: true }).click();
  assert.equal((await page.locator("dialog dl > div").filter({ has: page.getByText("EMI / month", { exact: true }) }).locator("dd").innerText()).replace(/\s/g, ""), "₹95,000");
  await page.getByRole("button", { name: "Edit property", exact: true }).click();
  assert.equal(await page.getByLabel("EMI / month (₹)", { exact: true }).inputValue(), "95000");
  await page.getByLabel("EMI / month (₹)", { exact: true }).fill("90000");
  await page.getByRole("button", { name: "Save property", exact: true }).click(); await page.getByRole("button", { name: "Edit property", exact: true }).waitFor();
  assert.equal(records().find(p => p.name === "Test bulk apartment").monthlyEmi, 90000);
  await page.getByRole("button", { name: "Close property", exact: true }).click();
  // Download the saved properties, edit one and add one: an update and a new row; the rest unchanged.
  await openBulk();
  const current = await download("Download with 3 current properties");
  assert.match(current.name, /^Glow_Real_Estate_Properties_/);
  const rowOf = name => current.book.getWorksheet("Properties").getColumn(1).values.indexOf(name);
  const edit = await fill(current.book, { [rowOf("Test bulk land")]: { "Monthly rent (₹)": 15000, "Status": "Rented" }, 5: { "Property name": "Test bulk office", "Property type": "Office", "Current value (₹)": 60000000 } }, "edit.xlsx");
  review = await upload(edit);
  const actions = Object.values(review).map(r => r.action).sort();
  assert.deepEqual(actions, ["new", "unchanged", "unchanged", "update"]);
  assert.match(Object.values(review).find(r => r.action === "update").text, /Monthly rent \(₹\): blank → 15,000/);
  await dialog.getByRole("button", { name: "Save 2 properties", exact: true }).click();
  await dialog.locator("[data-bulk-saved]").getByText("Saved 1 new property and 1 update.").waitFor();
  assert.equal(store.data.size, 4);
  assert.deepEqual([records().find(p => p.name === "Test bulk land").monthlyRent, records().find(p => p.name === "Test bulk land").status], [15000, "Rented"]);
  assert.equal(records().find(p => p.name === "Test bulk apartment").monthlyEmi, 90000, "an unchanged row keeps the form's later edit");
  // The same file again is stale now: refused, nothing saved.
  review = await upload(edit);
  assert.match(Object.values(review).find(r => r.text.includes("Test bulk land")).text, /changed on the dashboard after the file was downloaded/);
  assert.match(Object.values(review).find(r => r.text.includes("Test bulk office")).text, /already on the dashboard/);
  assert.equal(store.data.size, 4);
  // A file that is not the template is refused with its reason.
  await dialog.getByLabel("Filled property template", { exact: true }).setInputFiles({ name: "notes.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2") });
  await dialog.getByRole("alert").getByText(/Upload the template as an Excel Workbook \(\.xlsx\)/).waitFor();
  await page.locator("html").evaluate(el => el.classList.add("dark"));
  review = await upload(edit);
  await page.screenshot({ path: path.join(out, "review-dark.png"), fullPage: true });
  await page.locator("html").evaluate(el => el.classList.remove("dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "review-mobile.png"), fullPage: true });
  const fits = await dialog.evaluate(d => d.scrollWidth <= d.clientWidth + 1);
  assert.ok(fits, "The review scrolls inside its own table on a narrow screen.");
  assert.ok(snapshots.length && snapshots.every(Boolean), "the page read its properties from the shared table-inputs snapshot");
  assert.deepEqual(errors, []);
  console.log("Real estate bulk-entry browser check passed: template download, filled upload, per-row problems block the save, corrected upload saved, EMI via the form, current-properties round trip with update/new/unchanged, stale re-upload refused, non-xlsx refused, dark and mobile. Production records untouched.");
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(out, "failure.txt"), `${error.stack ?? error}\n\n${await page.locator("body").innerText().catch(() => "")}`);
  throw error;
} finally { await browser.close(); }
