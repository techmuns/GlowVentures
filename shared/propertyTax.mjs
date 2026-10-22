// The capital gains tax a property would carry if it were sold today at its
// current value, under the rules the Finance (No. 2) Act 2024 set for land and
// buildings and the Income-tax Act, 2025 carries from 1 April 2026:
//
//   · long-term after more than 24 months, counting a previous owner's holding
//     for an inherited or gifted property;
//   · a long-term gain is taxed at 12.5% without indexation;
//   · a resident individual or HUF selling land or a building acquired before
//     23 July 2024 pays no more than the old 20% with indexation would have
//     been — the excess over that is ignored, so the lower of the two applies;
//   · the cost of a property acquired before 1 April 2001 may be its fair market
//     value on that date, indexation then runs from FY 2001-02, and improvements
//     made before that date do not count;
//   · an inherited or gifted property carries the previous owner's cost;
//   · rural agricultural land is not a capital asset;
//   · 4% health and education cess on the tax.
//
// Tax is assessed per person, so it is struck per owner on that owner's share
// and only then added. Every input a rule needs and the record lacks leaves the
// tax unknown with its reason, never a zero or a guess. Not in the figure, and
// said on the page: surcharge (it turns on the owner's total income for the
// year), selling costs, and reinvestment exemptions.
import { ownerById } from "./owners.mjs";
import { propertyShare } from "./realEstate.mjs";

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
/** Transfers from this date lost indexation; land and buildings acquired before it keep the 20%-indexed ceiling. */
export const REFORM_DATE = "2024-07-23";
export const INDEX_BASE_DATE = "2001-04-01";
const LAND_OR_BUILDING = new Set(["Land", "Apartment", "Villa / house", "Commercial", "Office", "Warehouse", "Industrial", "Farmhouse"]);
const pct = rate => `${Math.round(rate * 1000) / 10}%`;
const day = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };

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

/** Whether an owner may take the 20%-with-indexation ceiling: a resident individual or HUF, as the owner registry records them. */
function optionHolder(o, ownerOf) {
  const owner = o.ownerId ? ownerOf(o.ownerId) : null;
  const name = owner?.displayName || o.name || "This owner";
  if (!owner?.kind) return { eligible: null, status: "Not recorded", why: `${name} is not a registered family member, so whether they are a resident individual or HUF is not recorded.` };
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
  const share = propertyShare(p, owners);
  const value = p.value === null || share === null ? null : p.value * share;
  const out = { asOf, fy, saleIndex, share, value, gap: null, notCapitalAsset: false, received: false, acquiredOn: null, longTermFrom: null, longTerm: null,
    basis: null, basisLabel: "", improvements: 0, improvementsCounted: 0, improvementsBefore2001: 0, cost: null, gain: null,
    acquisitionIndex: null, indexedCost: null, indexGap: "", indexedGain: null, option: null, owners: [], tax: null, afterTax: null, route: null };
  const stop = (short, reason) => ({ ...out, gap: { short, reason } });
  if (p.ruralAgricultural) return { ...out, notCapitalAsset: true, route: "Not a capital asset",
    ...(share === null ? { gap: { short: "Share not entered", reason: "Ownership share not entered or incomplete." } } : { tax: 0, afterTax: value }) };
  if (p.value === null) return stop("No current value", "Needs the current value.");
  if (!p.acquisition) return stop("Acquisition not entered", "Needs how the property was acquired: a purchase is taxed on its own cost and date, an inheritance or gift on the previous owner's.");
  const received = p.acquisition === "Inherited" || p.acquisition === "Gifted";
  const event = p.acquisition === "Inherited" ? "inheritance" : "the gift";
  const cost = received ? p.priorCost ?? null : p.cost, acquiredOn = received ? p.priorAcquiredOn ?? null : p.purchasedOn;
  if (cost === null) return stop(received ? "Previous owner's cost needed" : "No cost entered", received
    ? `${p.acquisition}: the cost for tax is what the previous owner paid, not the value on the date of ${event}. It is not entered.` : "Needs the purchase cost.");
  if (acquiredOn === null) return stop(received ? "Previous owner's date needed" : "No purchase date", received
    ? "Needs the date the previous owner acquired it: the holding period and indexation run from then." : "Needs the purchase date: the holding period and indexation run from it.");
  if (acquiredOn > asOf) return stop("Acquired after today", `The ${received ? "previous owner's acquisition" : "purchase"} date, ${day(acquiredOn)}, is after ${day(asOf)}.`);
  const pre2001 = acquiredOn < INDEX_BASE_DATE;
  const fmv = pre2001 && p.fmv2001 != null && p.fmv2001 > cost ? p.fmv2001 : null;
  const basis = fmv ?? cost;
  const improvements = p.improvements ?? [];
  const counted = improvements.filter(i => i.on === null || i.on >= INDEX_BASE_DATE);
  if (pre2001 && counted.some(i => i.on === null)) return stop("Improvement date needed", "Held since before 1 Apr 2001, when improvements made before that date do not count, so each improvement needs its date.");
  const total = basis + counted.reduce((s, i) => s + i.amount, 0);
  const ltFrom = longTermFrom(acquiredOn), longTerm = asOf >= ltFrom, gain = p.value - total;
  const acquisitionIndex = COST_INFLATION_INDEX[indexYear(acquiredOn)] ?? null;
  let indexedCost = null, indexGap = "";
  if (saleIndex === null) indexGap = `The Cost Inflation Index for FY ${fy} is not in this table yet.`;
  else if (counted.some(i => i.on === null)) indexGap = "An improvement has no date, so it cannot be indexed.";
  else if (counted.some(i => !COST_INFLATION_INDEX[indexYear(i.on)])) indexGap = "An improvement is dated in a year whose index is not in this table.";
  // Whole rupees, so each owner's tax and every total tie to the figures shown.
  else indexedCost = Math.round(basis * saleIndex / acquisitionIndex + counted.reduce((s, i) => s + i.amount * saleIndex / COST_INFLATION_INDEX[indexYear(i.on)], 0));
  let option;
  if (!LAND_OR_BUILDING.has(p.type)) option = { open: null, note: `${p.type ? `Type "${p.type}"` : "Property type not entered"}: the indexation option is for land or buildings.` };
  else if (acquiredOn >= REFORM_DATE) option = { open: false, note: `${received ? "The previous owner acquired it" : "Acquired"} on or after 23 Jul 2024, so 12.5% without indexation is the only rate.` };
  else if (received && (p.purchasedOn === null || p.purchasedOn >= REFORM_DATE)) option = { open: null, note: `The previous owner acquired it before 23 Jul 2024, but ${p.purchasedOn === null ? `the date of ${event} is not entered` : `it was received on ${day(p.purchasedOn)}`}; whether the option follows the previous owner's date is not settled here.` };
  else option = { open: true, note: "Acquired before 23 Jul 2024: a resident individual or HUF pays the lower of 12.5% without indexation and 20% with indexation." };
  const facts = { ...out, received, acquiredOn, longTermFrom: ltFrom, longTerm, basis, basisLabel: fmv !== null ? "Fair market value on 1 Apr 2001" : received ? "Previous owner's cost" : "Purchase cost",
    improvements: improvements.length, improvementsCounted: counted.length, improvementsBefore2001: improvements.length - counted.length, cost: total, gain,
    acquisitionIndex, indexedCost, indexGap, indexedGain: indexedCost === null ? null : p.value - indexedCost, option };
  const selected = owners ? p.owners.filter(o => o.ownerId && owners.has(o.ownerId)) : p.owners;
  const rows = share === null ? [] : selected.map(o => {
    const s = o.share / 100, holder = optionHolder(o, ownerOf);
    const flat = Math.round(Math.max(0, gain) * s * LONG_TERM_RATE * (1 + CESS));
    const indexed = indexedCost === null ? null : Math.round(Math.max(0, p.value - indexedCost) * s * INDEXED_RATE * (1 + CESS));
    const row = { name: o.name, ownerId: o.ownerId, share: s, status: holder.status, eligible: holder.eligible, holderNote: holder.why, flatTax: flat, indexedTax: indexed, tax: null, route: null, gap: null, note: "" };
    if (gain <= 0) return { ...row, tax: 0, route: "none", note: "No gain at the current value." };
    if (!longTerm) return { ...row, gap: { short: "Short-term · slab rate", reason: `Held 24 months or less: long-term from ${day(ltFrom)}. A short-term gain is taxed at the owner's slab rate on their total income, which this page does not carry.` } };
    if (option.open === false || holder.eligible === false) return { ...row, tax: flat, route: "flat", note: option.open === false ? option.note : holder.why };
    if (option.open && holder.eligible && indexed !== null) return { ...row, tax: Math.min(flat, indexed), route: indexed < flat ? "indexed" : "flat",
      note: `${holder.why} ${indexed < flat ? "20% with indexation is lower." : "Indexation does not lower the tax."}` };
    if (indexed !== null && indexed >= flat) return { ...row, tax: flat, route: "flat", note: "Indexation would not lower the tax." };
    const short = indexed === null ? (indexGap.startsWith("An improvement") ? "Improvement date needed" : "Index not notified")
      : option.open === null ? (LAND_OR_BUILDING.has(p.type) ? "Inheritance date unsettled" : "Property type needed") : holder.eligible === null && o.ownerId ? "Residence not recorded" : "Owner not registered";
    const why = [option.open === null ? option.note : "", holder.eligible === null ? holder.why : "", indexGap].filter(Boolean).join(" ");
    return { ...row, gap: { short, reason: `${why}${indexed !== null ? ` For a resident individual or HUF, 20% with indexation would make it lower.` : ""}` } };
  });
  if (share === null) return { ...facts, gap: { short: "Share not entered", reason: "Ownership share not entered or incomplete." } };
  const missing = rows.find(r => r.tax === null);
  if (missing) return { ...facts, owners: rows, gap: { short: missing.gap.short, reason: rows.length > 1 ? `${missing.name || "An owner"}: ${missing.gap.reason}` : missing.gap.reason } };
  const tax = rows.reduce((s, r) => s + r.tax, 0);
  const routes = new Set(rows.map(r => r.route));
  const route = !rows.length ? null : routes.size > 1 ? "Mixed" : routes.has("none") ? "No gain" : routes.has("indexed") ? `${pct(INDEXED_RATE)} indexed` : pct(LONG_TERM_RATE);
  return { ...facts, owners: rows, tax, afterTax: value - tax, route };
}
