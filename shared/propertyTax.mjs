// The capital gains tax a property would carry if it were sold today at its
// current value. The whole calculation is five rules (Finance (No. 2) Act 2024,
// carried by the Income-tax Act, 2025 from 1 April 2026):
//
//   1. Gain = current value − cost. The cost is the purchase cost; for an
//      inherited or gifted property, what the previous owner paid, and every date
//      is the previous owner's too; for a property held since before 1 Apr 2001,
//      its value on that date where that is higher.
//   2. Held 2 years or less: short-term, taxed at the owner's slab rate on their
//      total income, which this page does not carry, so the tax is unknown.
//   3. Held more than 2 years: 12.5% of the gain.
//   4. Bought before 23 Jul 2024 by a resident individual or HUF: 20% of the gain
//      over the indexed cost (cost × this year's Cost Inflation Index ÷ the
//      purchase year's) where that is lower than rule 3.
//   5. Plus 4% cess. Rural agricultural land is not a capital asset: no tax.
//
// Tax is assessed per person, so it is struck per owner on that owner's share and
// only then added. A missing input leaves the tax unknown and names the input,
// never a zero or a guess. Not in the figure, and said on the page: surcharge (it
// turns on the owner's total income for the year), selling costs, renovation or
// extension costs, and reinvestment exemptions.
import { ownerById } from "./owners.mjs";
import { propertyShare, receivedWithoutPurchase } from "./realEstate.mjs";

/** Cost Inflation Index, base FY 2001-02 = 100. FY 2026-27: s.72(8)(a), Income-tax Act 2025 (S.O. 3889(E), 15 Jul 2026). */
export const COST_INFLATION_INDEX = Object.freeze({
  "2001-02": 100, "2002-03": 105, "2003-04": 109, "2004-05": 113, "2005-06": 117, "2006-07": 122, "2007-08": 129,
  "2008-09": 137, "2009-10": 148, "2010-11": 167, "2011-12": 184, "2012-13": 200, "2013-14": 220, "2014-15": 240,
  "2015-16": 254, "2016-17": 264, "2017-18": 272, "2018-19": 280, "2019-20": 289, "2020-21": 301, "2021-22": 317,
  "2022-23": 331, "2023-24": 348, "2024-25": 363, "2025-26": 376, "2026-27": 384,
});
export const LONG_TERM_RATE = 0.125;
export const INDEXED_RATE = 0.2;
export const CESS = 0.04;
/** Transfers from this date lost indexation; property bought before it keeps the 20%-indexed option. */
export const REFORM_DATE = "2024-07-23";
export const INDEX_BASE_DATE = "2001-04-01";
const day = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
// Whole rupees, so each owner's tax and every total tie to the figures shown.
const taxAt = (gain, rate) => Math.round(Math.max(0, gain) * rate * (1 + CESS));

/** "2024-07-23" → "2024-25": the Indian financial year, 1 April to 31 March. */
export function financialYear(iso) {
  const y = Number(iso.slice(0, 4)), start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
/** The year whose index applies to a cost: its own, or FY 2001-02 for anything earlier. */
export const indexYear = iso => iso < INDEX_BASE_DATE ? "2001-02" : financialYear(iso);
/** Held for more than 24 months: long-term from the day after the second anniversary (29 Feb anniversaries fall on 28 Feb). */
export function longTermFrom(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y + 2, m, 0)).getUTCDate();
  return new Date(Date.UTC(y + 2, m - 1, Math.min(d, last) + 1)).toISOString().slice(0, 10);
}

/** Whether an owner may take the 20%-with-indexation option: a resident individual or HUF, as the owner registry records them. */
function optionHolder(o, ownerOf) {
  const owner = o.ownerId ? ownerOf(o.ownerId) : null;
  const name = owner?.displayName || o.name || "This owner";
  if (!owner?.kind) return { eligible: null, status: "Not registered", why: `${name} is not a registered family member, so whether they are a resident individual or HUF is not recorded.` };
  if (owner.kind !== "individual" && owner.kind !== "huf") return { eligible: false, status: owner.kind[0].toUpperCase() + owner.kind.slice(1), why: `${name} is a ${owner.kind}; the indexation option is for resident individuals and HUFs.` };
  if (owner.residence !== "resident") return { eligible: null, status: "Residence not recorded", why: `${name}'s tax residence is not recorded.` };
  return { eligible: true, status: owner.kind === "huf" ? "Resident HUF" : "Resident individual", why: `${name} is a resident ${owner.kind === "huf" ? "HUF" : "individual"} (${owner.residenceEvidence}).` };
}

/**
 * The tax on a sale on `asOf` at the current value, for the selected owners' share
 * (all recorded owners when `owners` is null). Whole-property working is returned
 * beside it for the property's details.
 */
export function propertyGainsTax(p, { asOf, owners = null, ownerOf = ownerById }) {
  const fy = financialYear(asOf), saleIndex = COST_INFLATION_INDEX[fy] ?? null;
  const share = propertyShare(p, owners), received = receivedWithoutPurchase(p);
  const value = p.value === null || share === null ? null : p.value * share;
  const out = { asOf, fy, saleIndex, share, value, gap: null, needs: [], notCapitalAsset: false, received, acquiredOn: null, longTermFrom: null, longTerm: null,
    costLabel: "", cost: null, gain: null, indexable: null, acquisitionIndex: null, indexedCost: null, indexedGain: null, indexGap: "",
    owners: [], costForTax: null, taxableGain: null, tax: null, afterTax: null, route: null };
  const shareGap = { short: "Needs ownership share", reason: "Ownership share not entered or incomplete." };
  if (p.ruralAgricultural) return { ...out, notCapitalAsset: true, route: "Not a capital asset",
    ...(share === null ? { needs: ["ownership share"], gap: shareGap } : { tax: 0, afterTax: value }) };
  // Every input the figure needs, named at once.
  const cost = received ? p.priorCost : p.cost, acquiredOn = received ? p.priorAcquiredOn : p.purchasedOn;
  const needs = [p.value === null && "current value", cost === null && (received ? "previous owner's cost" : "purchase cost"),
    acquiredOn === null && (received ? "previous owner's acquisition date" : "purchase date"), share === null && "ownership share"].filter(Boolean);
  if (p.value === null || cost === null || acquiredOn === null) return { ...out, needs, gap: { short: `Needs ${needs.join(", ")}`,
    reason: `Enter the ${needs.join(", ")}.${received ? ` ${p.acquisition}: tax uses what the previous owner paid and when they acquired it, not the value on the date it was received.` : ""}` } };
  if (acquiredOn > asOf) return { ...out, gap: { short: "Bought after today", reason: `The ${received ? "previous owner's purchase" : "purchase"} date, ${day(acquiredOn)}, is after ${day(asOf)}.` } };
  const fmv = acquiredOn < INDEX_BASE_DATE && p.fmv2001 != null && p.fmv2001 > cost ? p.fmv2001 : null;
  const basis = fmv ?? cost, gain = p.value - basis;
  const ltFrom = longTermFrom(acquiredOn), longTerm = asOf >= ltFrom, indexable = acquiredOn < REFORM_DATE;
  const acquisitionIndex = COST_INFLATION_INDEX[indexYear(acquiredOn)] ?? null;
  const indexedCost = indexable && saleIndex !== null ? Math.round(basis * saleIndex / acquisitionIndex) : null;
  const indexGap = indexable && saleIndex === null ? `The Cost Inflation Index for FY ${fy} is not in this table yet.` : "";
  const facts = { ...out, acquiredOn, longTermFrom: ltFrom, longTerm, costLabel: fmv !== null ? "Value on 1 Apr 2001" : received ? "Previous owner's cost" : "Purchase cost",
    cost: basis, gain, indexable, acquisitionIndex, indexedCost, indexedGain: indexedCost === null ? null : p.value - indexedCost, indexGap };
  if (share === null) return { ...facts, needs: ["ownership share"], gap: shareGap };
  const selected = owners ? p.owners.filter(o => o.ownerId && owners.has(o.ownerId)) : p.owners;
  const rows = selected.map(o => {
    const s = o.share / 100, holder = optionHolder(o, ownerOf);
    const flatTax = taxAt(gain * s, LONG_TERM_RATE);
    // The 20% option, where this owner and this purchase date can take it.
    const indexedTax = indexable && holder.eligible !== false && indexedCost !== null ? taxAt((p.value - indexedCost) * s, INDEXED_RATE) : null;
    const row = { name: o.name, ownerId: o.ownerId, share: s, status: holder.status, eligible: holder.eligible, holderNote: holder.why, flatTax, indexedTax, costForTax: null, tax: null, route: null, gap: null, note: "" };
    const settle = (route, note) => ({ ...row, route, note, tax: route === "none" ? 0 : route === "indexed" ? indexedTax : flatTax, costForTax: (route === "indexed" ? indexedCost : basis) * s });
    if (gain <= 0) return settle("none", "No gain at the current value.");
    if (!longTerm) return { ...row, costForTax: basis * s, gap: { short: "Short-term · slab rate", reason: `Held 2 years or less: long-term from ${day(ltFrom)}. A short-term gain is taxed at the owner's slab rate on their total income, which this page does not carry.` } };
    if (!indexable) return settle("flat", "Bought on or after 23 Jul 2024: 12.5% is the only rate.");
    if (holder.eligible === false) return settle("flat", holder.why);
    if (indexedTax !== null && indexedTax >= flatTax) return settle("flat", "20% after indexation would not be lower.");
    if (holder.eligible && indexedTax !== null) return settle("indexed", `${holder.why} 20% after indexation is lower.`);
    return { ...row, gap: indexedTax === null ? { short: "Index not notified", reason: indexGap }
      : { short: holder.status === "Not registered" ? "Owner not registered" : "Residence not recorded", reason: `${holder.why} For a resident individual or HUF, 20% after indexation would make it lower.` } };
  });
  const costForTax = rows.some(r => r.costForTax === null) ? null : rows.reduce((s, r) => s + r.costForTax, 0);
  const priced = { ...facts, owners: rows, costForTax, taxableGain: costForTax === null ? null : value - costForTax };
  const missing = rows.find(r => r.tax === null);
  if (missing) return { ...priced, gap: { short: missing.gap.short, reason: rows.length > 1 ? `${missing.name || "An owner"}: ${missing.gap.reason}` : missing.gap.reason } };
  const tax = rows.reduce((s, r) => s + r.tax, 0);
  const routes = new Set(rows.map(r => r.route));
  const route = !rows.length ? null : routes.size > 1 ? "Mixed" : routes.has("none") ? "No gain" : routes.has("indexed") ? "20% indexed" : "12.5%";
  return { ...priced, tax, afterTax: value - tax, route };
}
