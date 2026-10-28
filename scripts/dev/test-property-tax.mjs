// Capital gains tax on a property sale: five rules, every missing input named.
import assert from "node:assert/strict";
import { validateProperty, propertyFigures } from "../../shared/realEstate.mjs";
import { propertyGainsTax, COST_INFLATION_INDEX, financialYear, longTermFrom, indexYear } from "../../shared/propertyTax.mjs";
import { ownerById, OWNERS } from "../../shared/owners.mjs";
import { property } from "./real-estate-fixtures.mjs";
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`ok ${name}`); };
// Tax and indexed cost are struck in whole rupees.
const close = (actual, expected, label = "") => assert.ok(actual !== null && Math.abs(actual - expected) <= 1, `${label} ${actual} ≠ ${expected}`);
// Test owner A is a resident individual; test owner B a trust.
const registry = { "test-a": { displayName: "Test owner A", kind: "individual", residence: "resident", residenceEvidence: "test statement" }, "test-b": { displayName: "Test owner B", kind: "trust" } };
const ownerOf = id => registry[id] ?? null;
const asOf = "2026-10-22";
const record = patch => validateProperty(property({ acquisition: "Purchased", ...patch })).property;
const tax = (patch, opts = {}) => propertyGainsTax(record(patch), { asOf, ownerOf, ...opts });
const CESS = 1.04;
// Every settled figure reads straight across the tax table: value − cost for tax = taxable gain; value − tax = after tax.
const ties = t => { close(t.taxableGain, t.value - t.costForTax, "taxable gain"); close(t.afterTax, t.value - t.tax, "after tax"); };

check("the Cost Inflation Index runs unbroken from FY 2001-02 = 100 to FY 2026-27 = 384", () => {
  const years = Object.keys(COST_INFLATION_INDEX);
  assert.equal(years[0], "2001-02"); assert.equal(years.at(-1), "2026-27");
  years.forEach((fy, i) => { assert.equal(fy, `${2001 + i}-${String((2002 + i) % 100).padStart(2, "0")}`); if (i) assert.ok(COST_INFLATION_INDEX[fy] > COST_INFLATION_INDEX[years[i - 1]]); });
  assert.deepEqual([COST_INFLATION_INDEX["2001-02"], COST_INFLATION_INDEX["2019-20"], COST_INFLATION_INDEX["2024-25"], COST_INFLATION_INDEX["2025-26"], COST_INFLATION_INDEX["2026-27"]], [100, 289, 363, 376, 384]);
});
check("financial years run April to March; costs before 1 Apr 2001 index from FY 2001-02", () => {
  assert.deepEqual([financialYear("2024-03-31"), financialYear("2024-04-01"), financialYear("2026-10-22")], ["2023-24", "2024-25", "2026-27"]);
  assert.deepEqual([indexYear("1995-05-01"), indexYear("2001-03-31"), indexYear("2001-04-01")], ["2001-02", "2001-02", "2001-02"]);
});
check("long-term only after more than 2 years", () => {
  assert.equal(longTermFrom("2024-10-22"), "2026-10-23"); assert.equal(longTermFrom("2024-02-29"), "2026-03-01");
  assert.equal(tax({ purchasedOn: "2024-10-22" }, { asOf: "2026-10-22" }).longTerm, false);
  assert.equal(tax({ purchasedOn: "2024-10-22" }, { asOf: "2026-10-23" }).longTerm, true);
});
const mixed = tax();
check("bought before 23 Jul 2024: the resident individual pays the lower 20%-indexed tax, the trust 12.5%", () => {
  const indexedCost = 1e7 * 384 / 289;
  close(mixed.indexedCost, indexedCost, "indexed cost");
  close(mixed.gain, 5e6, "gain");
  const [a, b] = mixed.owners;
  assert.deepEqual([a.status, a.route, b.status, b.route], ["Resident individual", "indexed", "Trust", "flat"]);
  close(a.flatTax, 5e6 * 0.6 * 0.125 * CESS); close(a.tax, (15e6 - indexedCost) * 0.6 * 0.2 * CESS, "A");
  close(b.tax, 5e6 * 0.4 * 0.125 * CESS, "B"); assert.equal(b.indexedTax, null, "a trust has no 20% option");
  close(mixed.costForTax, indexedCost * 0.6 + 1e7 * 0.4, "each owner's cost on their own rate");
  close(mixed.tax, a.tax + b.tax); assert.equal(mixed.route, "Mixed"); assert.equal(mixed.gap, null); ties(mixed);
});
check("a selected member's tax is their own share's tax", () => {
  const onlyA = tax({}, { owners: new Set(["test-a"]) });
  close(onlyA.tax, mixed.owners[0].tax); close(onlyA.afterTax, 9e6 - mixed.owners[0].tax); assert.equal(onlyA.route, "20% indexed");
  close(onlyA.taxableGain, (15e6 - 1e7 * 384 / 289) * 0.6); close(onlyA.tax, onlyA.taxableGain * 0.2 * CESS); ties(onlyA);
});
check("bought on or after 23 Jul 2024: 12.5% for everyone, no indexation", () => {
  const t = tax({ purchasedOn: "2024-08-01" });
  assert.equal(t.indexable, false); assert.equal(t.indexedCost, null); assert.ok(t.owners.every(o => o.indexedTax === null));
  close(t.tax, 5e6 * 0.125 * CESS); assert.equal(t.route, "12.5%"); close(t.costForTax, 1e7); ties(t);
});
check("indexation never raises the tax: a large gain stays at 12.5% for the resident", () => {
  const t = tax({ value: 1e8 }, { owners: new Set(["test-a"]) });
  assert.equal(t.owners[0].route, "flat"); close(t.tax, 9e7 * 0.6 * 0.125 * CESS); ties(t);
});
check("an indexed loss is a computed zero tax, never a negative one", () => {
  const t = tax({ value: 1.2e7 }, { owners: new Set(["test-a"]) });
  assert.equal(t.tax, 0); assert.equal(t.owners[0].route, "indexed"); assert.ok(t.indexedGain < 0); assert.ok(t.taxableGain < 0);
});
check("no gain at the current value is a computed zero, short-term or long", () => {
  for (const purchasedOn of ["2020-01-10", "2026-01-01"]) { const t = tax({ value: 9e6, purchasedOn }); assert.equal(t.tax, 0); assert.equal(t.route, "No gain"); ties(t); }
});
check("a short-term gain is not estimated: it is taxed at the owner's slab rate", () => {
  const t = tax({ purchasedOn: "2025-06-01" });
  assert.equal(t.tax, null); assert.equal(t.afterTax, null); assert.equal(t.gap.short, "Short-term · slab rate"); assert.match(t.gap.reason, /long-term from 2 Jun 2027/);
  close(t.costForTax, 1e7, "the cost and gain are still known"); close(t.taxableGain, 5e6);
});
check("every missing input is named at once, and the tax stays unknown", () => {
  const both = tax({ cost: null, purchasedOn: null });
  assert.deepEqual(both.needs, ["purchase cost", "purchase date"]); assert.equal(both.gap.short, "Needs purchase cost, purchase date"); assert.equal(both.tax, null);
  assert.deepEqual(tax({ value: null }).needs, ["current value"]);
  assert.equal(tax({ purchasedOn: "2027-01-01" }).gap.short, "Bought after today");
  const share = tax({ owners: [{ name: "Test owner A", ownerId: "test-a", share: null }] });
  assert.equal(share.tax, null); assert.deepEqual(share.needs, ["ownership share"]); close(share.indexedCost, 1e7 * 384 / 289);
  assert.deepEqual(tax({ cost: null, owners: [{ name: "Test owner A", ownerId: "test-a", share: null }] }).needs, ["purchase cost", "ownership share"]);
});
check("a blank acquisition is taxed as the purchase its cost and date were entered as", () => {
  const blank = tax({ acquisition: "" });
  assert.equal(blank.gap, null); assert.equal(blank.tax, mixed.tax); assert.equal(blank.costLabel, "Purchase cost");
});
check("every property type is land or a building: the type never holds the tax back", () => {
  for (const type of ["", "Other", "Land", "Apartment", "Farmhouse"]) assert.equal(tax({ type }).tax, mixed.tax, type || "blank");
});
check("an unregistered owner or unknown residence leaves the tax open only where indexation would lower it", () => {
  const stranger = { owners: [{ name: "Test outsider", ownerId: null, share: 100 }] };
  assert.equal(tax(stranger).gap.short, "Owner not registered"); assert.match(tax(stranger).gap.reason, /20% after indexation would make it lower/);
  assert.equal(tax(stranger).costForTax, null, "the cost for tax waits on the rate");
  close(tax({ ...stranger, value: 1e8 }).tax, 9e7 * 0.125 * CESS);
  const noResidence = propertyGainsTax(record({ owners: [{ name: "Test owner A", ownerId: "test-a", share: 100 }] }), { asOf, ownerOf: () => ({ displayName: "Test owner A", kind: "individual" }) });
  assert.equal(noResidence.gap.short, "Residence not recorded");
});
check("a year whose index is not notified leaves the indexed route, and so the resident's tax, unknown", () => {
  const t = tax({}, { asOf: "2027-05-01" });
  assert.equal(t.indexedCost, null); assert.match(t.indexGap, /FY 2027-28/); assert.equal(t.tax, null); assert.equal(t.gap.short, "Index not notified");
  close(t.owners[1].tax, 5e6 * 0.4 * 0.125 * CESS, "the trust's flat tax still stands");
});
const inherited = patch => tax({ acquisition: "Inherited", purchasedOn: "2010-01-01", cost: 8e6, value: 15e6, owners: [{ name: "Test owner A", ownerId: "test-a", share: 100 }], ...patch });
check("an inherited property is taxed on the previous owner's cost and date, never the value on inheritance", () => {
  assert.deepEqual(inherited().needs, ["previous owner's cost", "previous owner's acquisition date"]);
  assert.match(inherited().gap.reason, /not the value on the date it was received/);
  assert.deepEqual(inherited({ priorCost: 2e6 }).needs, ["previous owner's acquisition date"]);
  const t = inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01" });
  assert.equal(t.costLabel, "Previous owner's cost"); close(t.gain, 13e6); close(t.indexedCost, 2e6 * 384 / 117); ties(t);
});
check("held since before 1 Apr 2001: the higher value on that date is the cost", () => {
  const t = inherited({ priorCost: 2e6, priorAcquiredOn: "1995-05-01", fmv2001: 3e6 });
  assert.equal(t.costLabel, "Value on 1 Apr 2001"); close(t.cost, 3e6); close(t.indexedCost, 3e6 * 3.84);
  close(t.tax, (15e6 - t.indexedCost) * 0.2 * CESS); assert.equal(t.route, "20% indexed"); ties(t);
  close(inherited({ priorCost: 2e6, priorAcquiredOn: "1995-05-01", fmv2001: 1e6 }).cost, 2e6, "a lower value on 1 Apr 2001 is not taken");
});
check("an inheritance takes the previous owner's date for the 23 Jul 2024 option too", () => {
  const t = inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01", purchasedOn: "2025-01-01", value: 1e7 });
  assert.equal(t.indexable, true); assert.equal(t.longTerm, true); assert.equal(t.route, "20% indexed");
  close(t.tax, (1e7 - 2e6 * 384 / 117) * 0.2 * CESS);
});
check("rural agricultural land is not a capital asset: a computed zero", () => {
  const t = tax({ type: "Land", ruralAgricultural: true });
  assert.deepEqual([t.tax, t.afterTax, t.notCapitalAsset, t.route], [0, 15e6, true, "Not a capital asset"]);
});
check("tax fields validate; improvements are no longer part of a property, and appreciation runs on the cost entered", () => {
  const v = patch => validateProperty(property(patch));
  const older = v({ improvements: [{ on: "2022-06-01", amount: 2e6 }] }).property;
  assert.equal("improvements" in older, false); assert.deepEqual([propertyFigures(older).cost, propertyFigures(older).gainPct], [1e7, 50]);
  assert.ok(v({ priorCost: -1 }).error); assert.ok(v({ fmv2001: "5" }).error); assert.ok(v({ priorAcquiredOn: "1995-13-01" }).error);
  const blank = v({}).property;
  assert.deepEqual([blank.priorCost, blank.priorAcquiredOn, blank.fmv2001, blank.ruralAgricultural], [null, null, null, false]);
  assert.equal(v({ ruralAgricultural: "yes" }).property.ruralAgricultural, false);
});
check("the registry records each family member as resident from their own demat statement; trusts carry none", () => {
  for (const id of ["ajay-jaisinghani", "ankita-jaisinghani", "bharat-jaisinghani", "aarti-jaisinghani"]) {
    assert.equal(ownerById(id).residence, "resident", id); assert.match(ownerById(id).residenceEvidence, /Individual-Resident/);
  }
  for (const o of OWNERS.filter(o => o.kind === "trust")) assert.equal(o.residence, undefined);
});
console.log(`${checks} property tax checks passed.`);
