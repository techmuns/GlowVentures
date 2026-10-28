// Real estate bulk entry: the template, the row reader, the upload plan and the
// all-or-nothing save, through real .xlsx files. Synthetic records only.
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildPropertyWorkbook, readPropertyWorkbook, planPropertyUpload, templateColumns, MAX_UPLOAD_ROWS } from "../../shared/propertySheet.mjs";
import { validateProperty, propertyFigures, MONEY_FIELDS } from "../../shared/realEstate.mjs";
import { onRequest } from "../../functions/api/real-estate.js";
import { property, memoryStore } from "./real-estate-fixtures.mjs";
import { githubStore, serialize, toBase64, fromBase64 } from "../../shared/dashboardStore.mjs";
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`ok ${name}`); };
const members = [{ ownerId: "test-a", label: "Test owner A" }, { ownerId: "test-b", label: "Test owner B" }];
const saved = (patch = {}) => ({ ...validateProperty(property(patch)).property, updatedAt: "2026-10-01T00:00:00.000Z" });
// A user's edit of a downloaded template: open it, change cells by heading, save it.
async function edited(properties, edit, { members: m = members } = {}) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildPropertyWorkbook(ExcelJS, { properties, members: m }).xlsx.writeBuffer());
  const sheet = book.getWorksheet("Properties");
  const headings = sheet.getRow(1).values;
  const set = (row, heading, value) => { const col = headings.indexOf(heading); assert.ok(col > 0, `template has "${heading}"`); sheet.getRow(row).getCell(col).value = value; };
  await edit({ set, sheet, book, headings });
  return book.xlsx.writeBuffer();
}
let next = 0;
const plan = async (buffer, existing = []) => planPropertyUpload(await readPropertyWorkbook(ExcelJS, buffer), { existing, members, newId: () => `test-new-${++next}` });

await check("EMI is a money field, scaled by the selected owners' share like the loan", () => {
  assert.ok(MONEY_FIELDS.includes("monthlyEmi"));
  assert.equal(validateProperty(property()).property.monthlyEmi, null, "an older record without an EMI reads as not entered");
  assert.equal(propertyFigures(property({ monthlyEmi: 30000 }), new Set(["test-a"])).emi, 18000);
  assert.equal(propertyFigures(property()).emi, null);
  assert.ok(validateProperty(property({ monthlyEmi: -1 })).error.includes("EMI"));
});
await check("the template carries every field of the Add Property form, with dropdowns from one Lists sheet", async () => {
  const headers = templateColumns().map(c => c.header);
  for (const h of ["Property name", "Property type", "Status", "Address / survey no.", "City / district", "State", "Country", "PIN / postal code", "Acquisition", "Purchase / inheritance / gift date",
    "Area", "Area unit", "Area basis", "Owner 1", "Owner 1 share %", "Owner 4", "Owner 4 share %", "Purchase cost (₹) / value on date of inheritance or gift", "Current value (₹)", "Valuation date",
    "Monthly rent (₹)", "Monthly costs (₹)", "Loan outstanding (₹)", "EMI / month (₹)", "Previous owner's cost (₹)", "Previous owner acquired on", "Value on 1 Apr 2001 (₹)", "Rural agricultural land", "Tenant", "Lease ends", "Title status", "Earmarked / to be gifted", "Intended recipient", "Earmark note", "Notes", "Map latitude", "Map longitude", "Property ID (blank for a new property)", "Last saved (do not edit)"])
    assert.ok(headers.includes(h), `template column "${h}"`);
  assert.ok(!headers.some(h => /improvement/i.test(h)), "improvements are no longer asked for");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildPropertyWorkbook(ExcelJS, { members }).xlsx.writeBuffer());
  assert.deepEqual(book.worksheets.map(w => w.name), ["Properties", "How to fill", "Lists"]);
  assert.deepEqual(book.getWorksheet("Lists").getColumn(1).values.filter(Boolean), ["Family members", "Test owner A", "Test owner B"]);
  const validations = Object.entries(book.getWorksheet("Properties").dataValidations.model);
  assert.ok(validations.some(([, v]) => v.type === "list" && /^Lists!\$B\$2/.test(v.formulae[0])), "property type is a dropdown");
  assert.ok(validations.some(([, v]) => v.type === "list" && !v.showErrorMessage && /^Lists!\$A\$2/.test(v.formulae[0])), "owner names offer members but accept another name");
});
await check("a blank template reads as a file with no rows, never as properties of zero", async () => {
  const p = await plan(await buildPropertyWorkbook(ExcelJS, { members }).xlsx.writeBuffer());
  assert.equal(p.rows.length, 0); assert.equal(p.ready, false); assert.match(p.fileErrors[0], /no property rows/);
});
await check("new rows: rupees with commas, Excel and DD/MM/YYYY dates, % cells, any-case choices and members", async () => {
  const p = await plan(await edited([], ({ set, sheet, headings }) => {
    set(2, "Property name", "Test villa"); set(2, "Property type", "villa / HOUSE"); set(2, "Status", "rented"); set(2, "City / district", "Pune");
    set(2, "PIN / postal code", 411001); set(2, "Acquisition", "Purchased"); set(2, "Purchase / inheritance / gift date", new Date(Date.UTC(2021, 7, 15)));
    set(2, "Area", 3000); set(2, "Area unit", "SQ FT"); set(2, "Owner 1", "test owner a"); set(2, "Owner 1 share %", 0.6);
    sheet.getRow(2).getCell(headings.indexOf("Owner 1 share %")).numFmt = "0%";
    set(2, "Owner 2", "Test owner B"); set(2, "Owner 2 share %", "40%");
    set(2, "Purchase cost (₹) / value on date of inheritance or gift", "₹ 1,50,00,000"); set(2, "Current value (₹)", 25000000); set(2, "Valuation date", "01/10/2026");
    set(2, "Monthly rent (₹)", 0); set(2, "Loan outstanding (₹)", "50,00,000"); set(2, "EMI / month (₹)", 45000); set(2, "Lease ends", "31 Mar 2027"); set(2, "Title status", "Clear");
    set(3, "Property name", "Test plot"); set(3, "Property type", "Land"); set(3, "Current value (₹)", "-");
  }));
  assert.deepEqual(p.counts, { new: 2, update: 0, unchanged: 0, error: 0 }); assert.equal(p.ready, true);
  const villa = p.rows[0].property;
  assert.deepEqual([villa.type, villa.status, villa.areaUnit, villa.pincode, villa.purchasedOn, villa.valuationDate, villa.leaseEnd], ["Villa / house", "Rented", "sq ft", "411001", "2021-08-15", "2026-10-01", "2027-03-31"]);
  assert.deepEqual([villa.cost, villa.value, villa.monthlyRent, villa.monthlyCosts, villa.debt, villa.monthlyEmi], [15000000, 25000000, 0, null, 5000000, 45000], "a typed 0 is a measured zero; a blank stays not entered");
  assert.deepEqual(villa.owners, [{ ownerId: "test-a", name: "Test owner A", share: 60 }, { ownerId: "test-b", name: "Test owner B", share: 40 }]);
  assert.equal(p.rows[1].property.value, null, "a dash is not entered");
  assert.equal(p.items.length, 2); assert.ok(p.items.every(i => i.base === null));
});
await check("every bad cell is named with its column; one problem blocks the whole upload", async () => {
  const p = await plan(await edited([], ({ set }) => {
    set(2, "Property name", "Test good"); set(2, "Current value (₹)", 1000000);
    set(3, "Property name", "Test bad"); set(3, "Current value (₹)", "5 Cr"); set(3, "Lease ends", "31/02/2027"); set(3, "Property type", "Bungalow");
    set(3, "Owner 1 share %", 120); set(3, "Monthly rent (₹)", -5);
    set(4, "Property name", "Test shares"); set(4, "Owner 2 share %", 50); set(4, "Area", 100);
    set(5, "Property name", "Test inherited"); set(5, "Acquisition", "Inherited"); set(5, "Purchase cost (₹) / value on date of inheritance or gift", 0);
    set(6, "Property name", "Test formula"); set(6, "Current value (₹)", { formula: "1+1" });
  }));
  assert.equal(p.ready, false); assert.deepEqual(p.counts, { new: 1, update: 0, unchanged: 0, error: 4 });
  const errors = row => p.rows.find(r => r.row === row).errors.join(" | ");
  for (const pattern of [/Current value \(₹\): "5 Cr" is not a plain number of rupees/, /Lease ends: "31\/02\/2027" is not a date/, /Property type: "Bungalow" is not one of/, /Owner 1 share %: 120 is above 100/, /Monthly rent \(₹\): cannot be negative/])
    assert.match(errors(3), pattern);
  assert.match(errors(4), /Owner 2 share % is entered without a name/); assert.match(errors(4), /Area unit: choose the unit/);
  assert.match(errors(5), /date of inheritance blank/);
  assert.match(errors(6), /a formula with no saved result/);
});
await check("downloaded properties read back unchanged; an edit is an update listing what changed", async () => {
  const existing = [saved(), saved({ id: "test-office", name: "Test office", type: "Office", owners: [{ ownerId: null, name: "Test trust", share: 100 }] })];
  const same = await plan(await edited(existing, () => {}), existing);
  assert.deepEqual(same.counts, { new: 0, update: 0, unchanged: 2, error: 0 }); assert.equal(same.ready, false, "nothing to save");
  const changed = await plan(await edited(existing, ({ set }) => { set(2, "Monthly rent (₹)", 60000); set(2, "Tenant", null); set(2, "EMI / month (₹)", 25000); set(4, "Property name", "Test new"); }), existing);
  assert.deepEqual(changed.counts, { new: 1, update: 1, unchanged: 1, error: 0 });
  const update = changed.rows.find(r => r.action === "update");
  assert.deepEqual(update.changes.map(c => c.field), ["Monthly rent (₹)", "EMI / month (₹)", "Tenant"]);
  assert.equal(update.property.tenant, "", "a cleared cell clears the field");
  assert.equal(update.property.id, "test-apartment"); assert.equal(update.base, "2026-10-01T00:00:00.000Z");
  assert.ok(!changed.items.some(i => i.property.id === "test-office"), "unchanged rows are not saved");
  assert.equal(changed.items.length, 2);
});
await check("a stale file, an unknown or repeated ID and an emptied row are refused", async () => {
  const existing = [saved()];
  const buffer = await edited(existing, ({ set, headings, sheet }) => {
    set(2, "Monthly rent (₹)", 70000);
    const id = headings.indexOf("Property ID (blank for a new property)");
    sheet.getRow(3).getCell(id).value = "test-missing"; set(3, "Property name", "Test ghost");
    sheet.getRow(4).getCell(id).value = "test-apartment";
  });
  const p = await plan(buffer, [{ ...existing[0], updatedAt: "2026-10-05T00:00:00.000Z" }]);
  assert.equal(p.ready, false);
  assert.match(p.rows[0].errors.join(), /changed on the dashboard after the file was downloaded/);
  assert.match(p.rows[0].errors.join(), /more than one row/);
  assert.match(p.rows[1].errors.join(), /not on the dashboard/);
  assert.match(p.rows[2].errors.join(), /Property ID but no details/);
});
await check("a new row repeating a saved property, or another row, would add it twice and is refused", async () => {
  const existing = [saved()];
  const p = await plan(await edited([], ({ set }) => {
    set(2, "Property name", "test apartment"); set(2, "Address / survey no.", "Test  address");
    set(3, "Property name", "Test twin"); set(4, "Property name", "Test twin");
  }), existing);
  assert.match(p.rows[0].errors.join(), /already on the dashboard/);
  assert.equal(p.rows[1].action, "new"); assert.match(p.rows[2].errors.join(), /Same name and address as row 3/);
});
await check("the earmark reads like the form: Yes, a recipient matched to a member, and a note; marker only", async () => {
  const p = await plan(await edited([], ({ set }) => {
    set(2, "Property name", "Test earmarked"); set(2, "Earmarked / to be gifted", "yes"); set(2, "Intended recipient", "test owner b"); set(2, "Earmark note", "Test wedding gift");
    set(3, "Property name", "Test earmarked blank"); set(3, "Earmarked / to be gifted", "Yes");
    set(4, "Property name", "Test recipient only"); set(4, "Intended recipient", "Test owner A");
    set(5, "Property name", "Test not earmarked"); set(5, "Earmarked / to be gifted", "No");
  }));
  assert.deepEqual(p.rows[0].property.earmark, { recipientId: "test-b", recipient: "Test owner B", note: "Test wedding gift" });
  assert.deepEqual(p.rows[0].property.owners, [], "an earmark never moves ownership");
  assert.deepEqual(p.rows[1].property.earmark, { recipientId: null, recipient: "", note: "" }, "earmarked with the recipient still to be entered");
  assert.match(p.rows[2].errors.join(), /choose Yes for the recipient or note entered/);
  assert.equal(p.rows[3].property.earmark, null);
  const existing = [saved({ earmark: { recipientId: "test-b", recipient: "Test owner B", note: "Test note" } })];
  const same = await plan(await edited(existing, () => {}), existing);
  assert.equal(same.rows[0].action, "unchanged", "a downloaded earmark reads back unchanged");
  const cleared = await plan(await edited(existing, ({ set }) => { set(2, "Earmarked / to be gifted", null); set(2, "Intended recipient", null); set(2, "Earmark note", null); }), existing);
  assert.equal(cleared.rows[0].property.earmark, null);
  assert.deepEqual(cleared.rows[0].changes, [{ field: "Earmark", before: "To be gifted to Test owner B · Test note", after: "Not earmarked" }]);
});
await check("the tax fields read like the form: previous owner, 1 Apr 2001 value and rural land", async () => {
  const p = await plan(await edited([], ({ set }) => {
    set(2, "Property name", "Test gifted plot"); set(2, "Property type", "Land"); set(2, "Acquisition", "Gifted"); set(2, "Previous owner's cost (₹)", 400000); set(2, "Previous owner acquired on", "01/06/1998");
    set(2, "Value on 1 Apr 2001 (₹)", "6,00,000"); set(2, "Rural agricultural land", "yes");
  }));
  const plot = p.rows[0].property;
  assert.deepEqual([plot.priorCost, plot.priorAcquiredOn, plot.fmv2001, plot.ruralAgricultural], [400000, "1998-06-01", 600000, true]);
  assert.equal("improvements" in plot, false);
  const existing = [saved({ priorCost: 400000, ruralAgricultural: false })];
  const same = await plan(await edited(existing, () => {}), existing);
  assert.equal(same.rows[0].action, "unchanged", "a saved property downloads and reads back unchanged");
});
await check("an owner who is not a family member is kept as typed, with a note", async () => {
  const p = await plan(await edited([], ({ set }) => { set(2, "Property name", "Test held by trust"); set(2, "Owner 1", "Test trust"); set(2, "Owner 1 share %", 100); }));
  assert.deepEqual(p.rows[0].property.owners, [{ ownerId: null, name: "Test trust", share: 100 }]);
  assert.match(p.rows[0].notes[0], /not a family member/); assert.equal(p.ready, true);
});
await check("a renamed column, a missing sheet or a file that is not a workbook stops the file", async () => {
  const renamed = await readPropertyWorkbook(ExcelJS, await edited([], ({ sheet, headings }) => { sheet.getRow(1).getCell(headings.indexOf("EMI / month (₹)")).value = "EMI"; }));
  assert.match(renamed.fileErrors.join(), /Missing column "EMI \/ month \(₹\)"/); assert.match(renamed.notes.join(), /"EMI" is not in the template/);
  const other = new ExcelJS.Workbook(); other.addWorksheet("Sheet1").addRow(["Property name"]);
  assert.match((await readPropertyWorkbook(ExcelJS, await other.xlsx.writeBuffer())).fileErrors[0], /no "Properties" sheet/);
  assert.match((await readPropertyWorkbook(ExcelJS, new TextEncoder().encode("name,value\nx,1"))).fileErrors[0], /could not be opened/);
  const many = await readPropertyWorkbook(ExcelJS, await edited([], ({ set }) => { for (let r = 2; r <= MAX_UPLOAD_ROWS + 2; r++) set(r, "Property name", `Test ${r}`); }));
  assert.match(many.fileErrors[0], new RegExp(`at most ${MAX_UPLOAD_ROWS}`));
});
// ── THE SAVE ────────────────────────────────────────────────────────────────
const site = "https://local.example";
async function call(body, store, raw) {
  const response = await onRequest({ request: new Request(`${site}/api/real-estate`, { method: "POST", headers: { origin: site, "content-type": "application/json" }, body: raw ?? JSON.stringify(body) }), env: { DASHBOARD_STORE: store } });
  return { status: response.status, body: await response.json() };
}
await check("a bulk save stores every row in one commit, stamped with one saved time", async () => {
  const store = memoryStore(); let flushes = 0; store.flush = async () => { flushes++; };
  await store.put("real-estate:test-apartment", JSON.stringify(saved()));
  const items = [{ property: validateProperty(property({ monthlyRent: 65000 })).property, base: "2026-10-01T00:00:00.000Z" },
    ...Array.from({ length: 40 }, (_, i) => ({ property: validateProperty(property({ id: `test-bulk-${i}`, name: `Test bulk ${i}`, notes: "n".repeat(1500) })).property, base: null }))];
  const reply = await call({ op: "saveMany", properties: items }, store);
  assert.equal(reply.status, 200, reply.body.message); assert.equal(flushes, 1); assert.equal(store.data.size, 41);
  assert.equal(new Set(reply.body.properties.map(p => p.updatedAt)).size, 1);
  assert.equal(JSON.parse(store.data.get("real-estate:test-apartment")).monthlyRent, 65000);
});
await check("a bulk save with one stale, duplicate or invalid row saves nothing", async () => {
  const store = memoryStore();
  await store.put("real-estate:test-apartment", JSON.stringify(saved()));
  const fresh = { property: validateProperty(property({ id: "test-fresh", name: "Test fresh" })).property, base: null };
  for (const [name, bad, status, pattern] of [
    ["stale", { property: validateProperty(property()).property, base: "2026-09-01T00:00:00.000Z" }, 409, /changed on the dashboard/],
    ["already saved", { property: validateProperty(property()).property, base: null }, 409, /already saved/],
    ["deleted meanwhile", { property: validateProperty(property({ id: "test-gone" })).property, base: "2026-10-01T00:00:00.000Z" }, 409, /no longer on the dashboard/],
    ["invalid", { property: { ...property({ id: "test-bad" }), value: -1 }, base: null }, 400, /Enter a valid value/],
    ["no version", { property: validateProperty(property({ id: "test-nover" })).property }, 400, /saved version/],
  ]) {
    const reply = await call({ op: "saveMany", properties: [fresh, bad] }, store);
    assert.equal(reply.status, status, name); assert.match(reply.body.message, /^Nothing was saved\./); assert.match(reply.body.message, pattern);
    assert.equal(store.data.has("real-estate:test-fresh"), false, `${name}: the clean row is not saved either`);
  }
  assert.equal((await call({ op: "saveMany", properties: [fresh, fresh] }, store)).status, 400);
  assert.equal((await call({ op: "saveMany", properties: [] }, store)).status, 400);
  assert.equal((await call({ op: "saveMany", properties: Array.from({ length: MAX_UPLOAD_ROWS + 1 }, () => fresh) }, store)).status, 400);
  assert.equal((await call(null, store, "x".repeat(17000))).status, 413, "a single save keeps its 16 KB bound");
  assert.equal((await call({ op: "save", property: property({ notes: "x".repeat(2000) }), pad: "y".repeat(17000) }, store)).status, 413);
});
await check("the planned upload saves through the handler and reads back as unchanged", async () => {
  const store = memoryStore();
  const p = await plan(await edited([], ({ set }) => { set(2, "Property name", "Test round trip"); set(2, "Current value (₹)", 9000000); set(2, "EMI / month (₹)", 12000); }));
  const reply = await call({ op: "saveMany", properties: p.items }, store);
  assert.equal(reply.status, 200);
  const again = await plan(await edited(reply.body.properties, () => {}), reply.body.properties);
  assert.deepEqual(again.counts, { new: 0, update: 0, unchanged: 1, error: 0 });
});
await check("an edit saved by someone else while the upload commits refuses the whole upload", async () => {
  // A fake of GitHub's contents API: the first write finds another person's save already committed.
  const original = saved();
  let file = { sha: "sha1", text: serialize({ "real-estate:test-apartment": { value: JSON.stringify(original), metadata: null } }) }, writes = 0;
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (url, init = {}) => {
    if ((init.method ?? "GET") === "GET") return reply(200, { sha: file.sha, content: toBase64(file.text) });
    const body = JSON.parse(init.body);
    if (++writes === 1) file = { sha: "sha2", text: serialize({ "real-estate:test-apartment": { value: JSON.stringify({ ...original, monthlyRent: 1, updatedAt: "2026-10-02T00:00:00.000Z" }), metadata: null } }) };
    if (body.sha !== file.sha) return reply(409, { message: "sha mismatch" });
    file = { sha: `sha${writes + 2}`, text: fromBase64(body.content) }; return reply(200, { content: { sha: file.sha } });
  };
  const store = githubStore({ token: "test", repo: "test/test", branch: "test", path: "store.json" }, fetchImpl);
  const items = [{ property: validateProperty(property({ monthlyRent: 65000 })).property, base: original.updatedAt },
    { property: validateProperty(property({ id: "test-fresh", name: "Test fresh" })).property, base: null }];
  const result = await call({ op: "saveMany", properties: items }, store);
  assert.equal(result.status, 409); assert.match(result.body.message, /^Nothing was saved\. A property in the file was changed on the dashboard while saving/);
  assert.equal(JSON.parse(JSON.parse(file.text).records["real-estate:test-apartment"].value).monthlyRent, 1, "the other person's save stands");
  assert.equal(JSON.parse(file.text).records["real-estate:test-fresh"], undefined, "the clean new row is not saved either");
});
console.log(`${checks} real-estate bulk-entry checks passed.`);
