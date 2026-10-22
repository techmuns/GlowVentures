// Capital gains tax on a property sale: the 2024 rules, indexation and the gaps.
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
check("long-term only after more than 24 months", () => {
  assert.equal(longTermFrom("2024-10-22"), "2026-10-23"); assert.equal(longTermFrom("2024-02-29"), "2026-03-01");
  assert.equal(tax({ purchasedOn: "2024-10-22" }, { asOf: "2026-10-22" }).longTerm, false);
  assert.equal(tax({ purchasedOn: "2024-10-22" }, { asOf: "2026-10-23" }).longTerm, true);
});
const mixed = tax();
check("acquired before 23 Jul 2024: the resident individual pays the lower 20%-indexed tax, the trust 12.5% flat", () => {
  const indexedCost = 1e7 * 384 / 289;
  close(mixed.indexedCost, indexedCost, "indexed cost");
  close(mixed.gain, 5e6, "gain");
  const [a, b] = mixed.owners;
  assert.deepEqual([a.status, a.route, b.status, b.route], ["Resident individual", "indexed", "Trust", "flat"]);
  close(a.flatTax, 5e6 * 0.6 * 0.125 * CESS); close(a.tax, (15e6 - indexedCost) * 0.6 * 0.2 * CESS, "A");
  close(b.tax, 5e6 * 0.4 * 0.125 * CESS, "B");
  close(mixed.tax, a.tax + b.tax); close(mixed.afterTax, 15e6 - mixed.tax); assert.equal(mixed.route, "Mixed"); assert.equal(mixed.gap, null);
});
check("a selected member's tax is their own share's tax", () => {
  const onlyA = tax({}, { owners: new Set(["test-a"]) });
  close(onlyA.tax, mixed.owners[0].tax); close(onlyA.afterTax, 9e6 - mixed.owners[0].tax); assert.equal(onlyA.route, "20% indexed");
});
check("acquired on or after 23 Jul 2024: 12.5% without indexation for everyone", () => {
  const t = tax({ purchasedOn: "2024-08-01" });
  assert.equal(t.option.open, false); close(t.tax, 5e6 * 0.125 * CESS); assert.equal(t.route, "12.5%");
});
check("indexation never raises the tax: a large gain stays at 12.5% for the resident", () => {
  const t = tax({ value: 1e8 }, { owners: new Set(["test-a"]) });
  assert.equal(t.owners[0].route, "flat"); close(t.tax, 9e7 * 0.6 * 0.125 * CESS);
});
check("an indexed loss is a computed zero tax, never a negative one", () => {
  const t = tax({ value: 1.2e7 }, { owners: new Set(["test-a"]) });
  assert.equal(t.tax, 0); assert.equal(t.owners[0].route, "indexed"); assert.ok(t.indexedGain < 0);
});
check("no gain at the current value is a computed zero, short-term or long", () => {
  for (const purchasedOn of ["2020-01-10", "2026-01-01"]) { const t = tax({ value: 9e6, purchasedOn }); assert.equal(t.tax, 0); assert.equal(t.route, "No gain"); }
});
check("a short-term gain is not estimated: it is taxed at the owner's slab rate", () => {
  const t = tax({ purchasedOn: "2025-06-01" });
  assert.equal(t.tax, null); assert.equal(t.afterTax, null); assert.equal(t.gap.short, "Short-term · slab rate"); assert.match(t.gap.reason, /long-term from 2 Jun 2027/);
});
check("every missing input leaves the tax unknown with its reason", () => {
  assert.equal(tax({ acquisition: "" }).gap.short, "Acquisition not entered");
  assert.equal(tax({ cost: null }).gap.short, "No cost entered");
  assert.equal(tax({ purchasedOn: null }).gap.short, "No purchase date");
  assert.equal(tax({ value: null }).gap.short, "No current value");
  assert.equal(tax({ purchasedOn: "2027-01-01" }).gap.short, "Acquired after today");
  const share = tax({ owners: [{ name: "Test owner A", ownerId: "test-a", share: null }] });
  assert.equal(share.tax, null); assert.equal(share.gap.short, "Share not entered"); close(share.indexedCost, 1e7 * 384 / 289);
  for (const t of [tax({ cost: null }), share]) assert.equal(t.tax, null);
});
check("an unregistered owner or unknown residence leaves the tax open only where indexation would lower it", () => {
  const stranger = { owners: [{ name: "Test outsider", ownerId: null, share: 100 }] };
  assert.equal(tax(stranger).gap.short, "Owner not registered"); assert.match(tax(stranger).gap.reason, /20% with indexation would make it lower/);
  close(tax({ ...stranger, value: 1e8 }).tax, 9e7 * 0.125 * CESS);
  const noResidence = propertyGainsTax(record({ owners: [{ name: "Test owner A", ownerId: "test-a", share: 100 }] }), { asOf, ownerOf: () => ({ displayName: "Test owner A", kind: "individual" }) });
  assert.equal(noResidence.gap.short, "Residence not recorded");
});
check("the option is for land or buildings: type Other or blank leaves it open", () => {
  assert.equal(tax({ type: "Other" }).gap.short, "Property type needed");
  assert.equal(tax({ type: "" }).gap.short, "Property type needed");
  for (const type of ["Land", "Apartment", "Villa / house", "Commercial", "Office", "Warehouse", "Industrial", "Farmhouse"]) assert.equal(tax({ type }).option.open, true, type);
});
check("a year whose index is not notified leaves the indexed route, and so the resident's tax, unknown", () => {
  const t = tax({}, { asOf: "2027-05-01" });
  assert.equal(t.indexedCost, null); assert.match(t.indexGap, /FY 2027-28/); assert.equal(t.tax, null); assert.equal(t.gap.short, "Index not notified");
  close(t.owners[1].tax, 5e6 * 0.4 * 0.125 * CESS, "the trust's flat tax still stands");
});
check("improvements add to the cost and index from their own year", () => {
  const p = record({ improvements: [{ on: "2022-06-01", amount: 2e6 }] });
  assert.deepEqual([propertyFigures(p).cost, propertyFigures(p).gainPct], [1.2e7, 25]);
  const t = propertyGainsTax(p, { asOf, ownerOf });
  close(t.cost, 1.2e7); close(t.indexedCost, 1e7 * 384 / 289 + 2e6 * 384 / 331);
  const undated = tax({ improvements: [{ on: null, amount: 2e6 }] });
  assert.equal(undated.indexedCost, null); assert.equal(undated.gap.short, "Improvement date needed"); close(undated.cost, 1.2e7);
});
const inherited = patch => tax({ acquisition: "Inherited", purchasedOn: "2010-01-01", cost: 8e6, value: 15e6, owners: [{ name: "Test owner A", ownerId: "test-a", share: 100 }], ...patch });
check("an inherited property is taxed on the previous owner's cost and date, never the value on inheritance", () => {
  assert.equal(inherited().gap.short, "Previous owner's cost needed");
  assert.match(inherited().gap.reason, /not the value on the date of inheritance/);
  assert.equal(inherited({ priorCost: 2e6 }).gap.short, "Previous owner's date needed");
  const t = inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01" });
  assert.equal(t.basisLabel, "Previous owner's cost"); close(t.gain, 13e6); close(t.indexedCost, 2e6 * 384 / 117);
});
check("held since before 1 Apr 2001: the higher value on that date is the cost, and earlier improvements do not count", () => {
  const t = inherited({ priorCost: 2e6, priorAcquiredOn: "1995-05-01", fmv2001: 3e6, improvements: [{ on: "1999-01-01", amount: 5e5 }, { on: "2015-06-01", amount: 1e6 }] });
  assert.equal(t.basisLabel, "Fair market value on 1 Apr 2001"); assert.equal(t.improvementsBefore2001, 1);
  close(t.cost, 4e6); close(t.indexedCost, 3e6 * 3.84 + 1e6 * 384 / 254);
  close(t.tax, (15e6 - t.indexedCost) * 0.2 * CESS); assert.equal(t.route, "20% indexed");
  close(inherited({ priorCost: 2e6, priorAcquiredOn: "1995-05-01", fmv2001: 1e6 }).cost, 2e6, "a lower value on 1 Apr 2001 is not taken");
  assert.equal(inherited({ priorCost: 2e6, priorAcquiredOn: "1995-05-01", improvements: [{ on: null, amount: 1e6 }] }).gap.short, "Improvement date needed");
});
check("an inheritance received on or after 23 Jul 2024 leaves the option unsettled", () => {
  const t = inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01", purchasedOn: "2025-01-01", value: 1e7 });
  assert.equal(t.option.open, null); assert.equal(t.gap.short, "Inheritance date unsettled");
  // Where indexation would not lower it, the open question does not matter.
  close(inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01", purchasedOn: "2025-01-01" }).tax, 13e6 * 0.125 * CESS);
  assert.equal(inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01", purchasedOn: null }).option.open, null);
  // The holding period counts the previous owner's: received last year, long-term already.
  assert.equal(inherited({ priorCost: 2e6, priorAcquiredOn: "2005-06-01", purchasedOn: "2025-01-01" }).longTerm, true);
});
check("rural agricultural land is not a capital asset: a computed zero", () => {
  const t = tax({ type: "Land", ruralAgricultural: true });
  assert.deepEqual([t.tax, t.afterTax, t.notCapitalAsset, t.route], [0, 15e6, true, "Not a capital asset"]);
});
check("tax fields validate: dated improvements need amounts, empty rows drop, money is never negative", () => {
  const v = patch => validateProperty(property(patch));
  assert.deepEqual(v({ improvements: [{ on: "", amount: null }, { on: "2022-01-01", amount: 5e5 }] }).property.improvements, [{ on: "2022-01-01", amount: 5e5 }]);
  assert.match(v({ improvements: [{ on: "2022-01-01", amount: null }] }).error, /improvement's amount/);
  assert.ok(v({ improvements: [{ on: "2022-02-30", amount: 1 }] }).error);
  assert.ok(v({ improvements: [{ amount: 0 }] }).error);
  assert.ok(v({ improvements: Array.from({ length: 21 }, () => ({ amount: 1 })) }).error);
  assert.ok(v({ priorCost: -1 }).error); assert.ok(v({ fmv2001: "5" }).error); assert.ok(v({ priorAcquiredOn: "1995-13-01" }).error);
  const older = v({}).property;
  assert.deepEqual([older.improvements, older.priorCost, older.priorAcquiredOn, older.fmv2001, older.ruralAgricultural], [[], null, null, null, false]);
  assert.equal(v({ ruralAgricultural: "yes" }).property.ruralAgricultural, false);
});
check("the registry records each family member as resident from their own demat statement; trusts carry none", () => {
  for (const id of ["ajay-jaisinghani", "ankita-jaisinghani", "bharat-jaisinghani", "aarti-jaisinghani"]) {
    assert.equal(ownerById(id).residence, "resident", id); assert.match(ownerById(id).residenceEvidence, /Individual-Resident/);
  }
  for (const o of OWNERS.filter(o => o.kind === "trust")) assert.equal(o.residence, undefined);
});
console.log(`${checks} property tax checks passed.`);
