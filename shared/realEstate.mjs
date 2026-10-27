// Whole-property figures are stored once. Displayed money follows the selected
// owners' recorded shares; an unknown amount remains unknown, including in totals.
export const PROPERTY_TYPES = ["Land", "Apartment", "Villa / house", "Commercial", "Office", "Warehouse", "Industrial", "Farmhouse", "Other"];
export const PROPERTY_STATUSES = ["Rented", "Vacant", "Self-used", "Under construction", "For sale"];
export const AREA_UNITS = ["sq ft", "sq m", "sq yd", "acre", "hectare", "cent", "guntha"];
export const TITLE_STATUSES = ["Not checked", "Clear", "Pending registration", "Under review", "Disputed"];
export const AREA_BASES = ["Plot", "Carpet", "Built-up", "Super built-up"];
// An inherited or gifted property has no purchase cost. Its cost is either
// blank or the value on the date it was received, and is labelled as such.
export const ACQUISITION_TYPES = ["Purchased", "Inherited", "Gifted"];
// `monthlyEmi` is the loan's monthly instalment: recorded beside the loan, never
// netted out of rent, because net rent describes the property, not its financing.
export const MONEY_FIELDS = ["cost", "value", "monthlyRent", "monthlyCosts", "debt", "monthlyEmi"];
// What capital gains tax on a sale needs beyond the cost (shared/propertyTax.mjs):
// dated improvements, each indexed from its own year; for an inherited or gifted
// property the previous owner's cost and acquisition date; the fair market value
// on 1 Apr 2001 for a property held since before then; and whether the land is
// rural agricultural land, which is not a capital asset.
export const MAX_IMPROVEMENTS = 20;
const TAX_MONEY = { priorCost: "previous owner's cost", fmv2001: "value on 1 Apr 2001" };
export const PROPERTY_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/;
const number = n => typeof n === "number" && Number.isFinite(n);
const date = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const text = s => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";

export function validateProperty(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !PROPERTY_ID.test(raw.id)) return { error: "Invalid property ID." };
  const p = { id: raw.id };
  for (const [key, max] of Object.entries({ name: 160, address: 500, city: 100, state: 100, country: 100, pincode: 20, tenant: 160, notes: 2000 })) {
    if (raw[key] != null && (typeof raw[key] !== "string" || raw[key].length > max)) return { error: `Check ${key}; maximum ${max} characters.` };
    p[key] = text(raw[key]);
  }
  for (const [key, options] of [["type", PROPERTY_TYPES], ["status", PROPERTY_STATUSES], ["acquisition", ACQUISITION_TYPES], ["areaUnit", AREA_UNITS], ["titleStatus", TITLE_STATUSES], ["areaBasis", AREA_BASES]]) {
    const value = raw[key] ?? "";
    if (value !== "" && !options.includes(value)) return { error: `Choose a valid ${key}.` };
    p[key] = value;
  }
  for (const key of [...MONEY_FIELDS, "area"]) {
    const n = raw[key] ?? null;
    if (n !== null && (!number(n) || n < 0 || n > 1e15 || (key === "area" && n === 0))) return { error: `Enter a valid ${{ monthlyRent: "monthly rent", monthlyCosts: "monthly costs", monthlyEmi: "EMI", debt: "loan outstanding" }[key] ?? key}. Leave unknown figures blank.` };
    p[key] = n;
  }
  // A ₹0 value on the date of inheritance would turn the whole current value into appreciation.
  if (receivedWithoutPurchase(p) && p.cost === 0) return { error: `Leave the value on the date of ${receivedEvent(p)} blank if it is not known, rather than ₹0.` };
  for (const [key, label] of Object.entries(TAX_MONEY)) {
    const n = raw[key] ?? null;
    if (n !== null && (!number(n) || n < 0 || n > 1e15)) return { error: `Enter a valid ${label}. Leave it blank if it is not known.` };
    p[key] = n;
  }
  p.ruralAgricultural = raw.ruralAgricultural === true;
  const improvements = raw.improvements ?? [];
  if (!Array.isArray(improvements) || improvements.length > MAX_IMPROVEMENTS) return { error: `Keep up to ${MAX_IMPROVEMENTS} improvements per property.` };
  p.improvements = [];
  for (const i of improvements) {
    if (!i || typeof i !== "object" || Array.isArray(i)) return { error: "Check the improvement details." };
    const on = i.on === "" ? null : i.on ?? null, amount = i.amount ?? null;
    if (on === null && amount === null) continue;
    if (on !== null && !date(on)) return { error: "Enter valid improvement dates or leave them blank." };
    if (amount === null || !number(amount) || amount <= 0 || amount > 1e15) return { error: "Enter each improvement's amount, or remove the row." };
    p.improvements.push({ on, amount });
  }
  for (const key of ["purchasedOn", "priorAcquiredOn", "valuationDate", "leaseEnd"]) {
    const value = raw[key] === "" ? null : raw[key] ?? null;
    if (value !== null && !date(value)) return { error: "Enter valid dates or leave them blank." };
    p[key] = value;
  }
  const owners = raw.owners ?? [];
  if (!Array.isArray(owners) || owners.length > 20) return { error: "Keep up to 20 owners per property." };
  const seen = new Set();
  p.owners = [];
  for (const o of owners) {
    if (!o || typeof o !== "object" || Array.isArray(o) || (o.name != null && (typeof o.name !== "string" || o.name.length > 160))
      || (o.share != null && (!number(o.share) || o.share < 0 || o.share > 100))
      || (o.ownerId != null && (typeof o.ownerId !== "string" || !PROPERTY_ID.test(o.ownerId)))) return { error: "Check the owner details and use a share from 0% to 100%, or leave it blank." };
    const name = text(o.name), share = o.share ?? null, ownerId = o.ownerId ?? null;
    if (!name && !ownerId && share === null) continue;
    const identity = ownerId || name.toLowerCase();
    const key = JSON.stringify([identity, name.toLowerCase(), share]);
    // Identical repeated rows describe the same holding, not extra ownership.
    if (identity && seen.has(key)) continue;
    if (identity) seen.add(key);
    p.owners.push({ ownerId, name, share });
  }
  // An earmark names who a property is meant for. It never moves ownership or
  // value: those follow `owners` until a transfer is recorded there.
  const earmark = raw.earmark ?? null;
  if (earmark !== null && (typeof earmark !== "object" || Array.isArray(earmark)
    || (earmark.recipient != null && (typeof earmark.recipient !== "string" || earmark.recipient.length > 160))
    || (earmark.recipientId != null && (typeof earmark.recipientId !== "string" || !PROPERTY_ID.test(earmark.recipientId)))
    || (earmark.note != null && (typeof earmark.note !== "string" || earmark.note.length > 1000)))) return { error: "Check the earmark: a recipient of up to 160 characters and a note of up to 1,000." };
  p.earmark = earmark === null ? null : { recipientId: earmark.recipientId ?? null, recipient: text(earmark.recipient), note: text(earmark.note) };
  for (const [key, limit] of [["latitude", 90], ["longitude", 180]]) {
    const value = raw[key] ?? null;
    if (value !== null && (!number(value) || Math.abs(value) > limit)) return { error: `Enter a valid ${key}.` };
    p[key] = value;
  }
  if ((p.latitude === null) !== (p.longitude === null)) return { error: "Set both map coordinates, or leave both blank." };
  return { property: p };
}

export const hasPin = p => number(p.latitude) && number(p.longitude);
export const propertyLabel = p => p.name || p.address || "Untitled property";
export const receivedWithoutPurchase = p => p.acquisition === "Inherited" || p.acquisition === "Gifted";
const receivedEvent = p => p.acquisition === "Inherited" ? "inheritance" : "the gift";
export const costLabel = p => receivedWithoutPurchase(p) ? `Value on date of ${p.acquisition === "Inherited" ? "inheritance" : "gift"}` : "Cost";
export const acquiredOnLabel = p => p.acquisition === "Inherited" ? "Inherited on" : p.acquisition === "Gifted" ? "Gifted on" : "Purchased";
export const isEarmarked = p => p.earmark != null;
export const earmarkLabel = p => !isEarmarked(p) ? "Not earmarked" : p.earmark.recipient ? `To be gifted to ${p.earmark.recipient}` : "To be gifted · recipient not entered";
export const EARMARK_MARKER_ONLY = "Marker only: ownership and value stay with the current owners until a transfer is recorded under Family ownership.";
// Why appreciation is not measured, in a few words and in full. Never a 0% or a 100% in its place.
export function appreciationGap(p) {
  if (p.value === null) return { short: "No current value", reason: "Needs the current value." };
  if (p.cost === null) return receivedWithoutPurchase(p)
    ? { short: `${p.acquisition} · no cost`, reason: `${p.acquisition}, so there is no purchase cost, and the value on the date of ${receivedEvent(p)} has not been entered.` }
    : { short: "No cost entered", reason: "Needs the cost." };
  if (p.cost === 0) return { short: "Cost is ₹0", reason: "The cost entered is ₹0, so there is no base to measure appreciation against." };
  return null;
}
export function propertyShare(p, owners = null) {
  const keys = p.owners.map(o => o.ownerId || o.name.toLowerCase());
  if (new Set(keys).size !== keys.length || p.owners.reduce((s, o) => s + (o.share ?? 0), 0) > 100.000001) return null;
  const selected = owners ? p.owners.filter(o => o.ownerId && owners.has(o.ownerId)) : p.owners;
  if (!selected.length) return owners && p.owners.some(o => o.ownerId) ? 0 : null;
  if (selected.some(o => !o.name || o.share === null)) return null;
  return selected.reduce((s, o) => s + o.share, 0) / 100;
}
/** The cost with its improvements: what appreciation is measured against. */
export const totalCost = p => p.cost === null ? null : p.cost + (p.improvements ?? []).reduce((s, i) => s + i.amount, 0);
function figuresAtShare(p, share) {
  const scaled = key => p[key] == null || share === null ? null : p[key] * share;
  const whole = totalCost(p);
  const value = scaled("value"), cost = whole === null || share === null ? null : whole * share, debt = scaled("debt"), emi = scaled("monthlyEmi"), rent = scaled("monthlyRent"), costs = scaled("monthlyCosts");
  return { share, value, cost, debt, emi, rent, costs,
    equity: value === null || debt === null ? null : value - debt,
    netRent: rent === null || costs === null ? null : rent - costs,
    yield: p.value === null || p.value <= 0 || p.monthlyRent === null ? null : p.monthlyRent * 12 / p.value * 100,
    gain: value === null || cost === null || appreciationGap(p) ? null : value - cost,
    gainPct: appreciationGap(p) ? null : (p.value - whole) / whole * 100 };
}
export const propertyFigures = (p, owners = null) => figuresAtShare(p, propertyShare(p, owners));
export const wholePropertyFigures = p => figuresAtShare(p, 1);
export function propertyTotal(properties, key, owners = null) {
  const known = properties.map(p => propertyFigures(p, owners)[key]).filter(n => n !== null && n !== undefined);
  return { value: known.length ? known.reduce((s, n) => s + n, 0) : null, known: known.length, count: properties.length };
}
