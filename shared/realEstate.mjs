// Whole-property figures are stored once. Displayed money follows the selected
// owners' recorded shares; an unknown amount remains unknown, including in totals.
export const PROPERTY_TYPES = ["Land", "Apartment", "Villa / house", "Commercial", "Office", "Warehouse", "Industrial", "Farmhouse", "Other"];
export const PROPERTY_STATUSES = ["Rented", "Vacant", "Self-used", "Under construction", "For sale"];
export const AREA_UNITS = ["sq ft", "sq m", "sq yd", "acre", "hectare", "cent", "guntha"];
export const TITLE_STATUSES = ["Not checked", "Clear", "Pending registration", "Under review", "Disputed"];
export const MONEY_FIELDS = ["cost", "value", "monthlyRent", "monthlyCosts", "debt"];
export const PROPERTY_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/;
const number = n => typeof n === "number" && Number.isFinite(n);
const date = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const text = s => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";

export function validateProperty(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !PROPERTY_ID.test(raw.id)) return { error: "Invalid property ID." };
  const p = { id: raw.id };
  for (const [key, max] of Object.entries({ name: 160, address: 500, city: 100, state: 100, country: 100, pincode: 20, tenant: 160, notes: 2000 })) {
    if (typeof raw[key] !== "string" || raw[key].length > max) return { error: `Check ${key}; maximum ${max} characters.` };
    p[key] = text(raw[key]);
  }
  if (!p.name || !p.address || !p.city || !p.country) return { error: "Enter the property name, address, city and country." };
  for (const [key, options] of [["type", PROPERTY_TYPES], ["status", PROPERTY_STATUSES], ["areaUnit", AREA_UNITS], ["titleStatus", TITLE_STATUSES], ["areaBasis", ["Plot", "Carpet", "Built-up", "Super built-up"]]]) {
    if (!options.includes(raw[key])) return { error: `Choose a valid ${key}.` };
    p[key] = raw[key];
  }
  for (const key of [...MONEY_FIELDS, "area"]) {
    const n = raw[key];
    if (n !== null && (!number(n) || n < 0 || n > 1e15 || (key === "area" && n === 0))) return { error: `Enter a valid ${key === "monthlyRent" ? "monthly rent" : key}. Leave unknown figures blank.` };
    p[key] = n;
  }
  for (const key of ["purchasedOn", "valuationDate", "leaseEnd"]) {
    if (raw[key] !== null && !date(raw[key])) return { error: "Enter valid dates or leave them blank." };
    p[key] = raw[key];
  }
  if (p.value !== null && !p.valuationDate) return { error: "Add the valuation date for the current value." };
  if (!["Rented", "For sale"].includes(p.status) && p.monthlyRent !== null && p.monthlyRent !== 0) return { error: "Only a rented property or a property for sale can have current monthly rent." };
  if (!Array.isArray(raw.owners) || !raw.owners.length || raw.owners.length > 20) return { error: "Add at least one owner and their share." };
  const seen = new Set();
  p.owners = [];
  for (const o of raw.owners) {
    if (!o || typeof o.name !== "string" || !text(o.name) || o.name.length > 160 || !number(o.share) || o.share <= 0 || o.share > 100
      || (o.ownerId !== null && (typeof o.ownerId !== "string" || !PROPERTY_ID.test(o.ownerId)))) return { error: "Each owner needs a name and a share above 0% and up to 100%." };
    const key = o.ownerId || text(o.name).toLowerCase();
    if (seen.has(key)) return { error: "List each owner once." };
    seen.add(key);
    p.owners.push({ ownerId: o.ownerId, name: text(o.name), share: o.share });
  }
  if (p.owners.reduce((s, o) => s + o.share, 0) > 100.000001) return { error: "The owners' shares cannot exceed 100%." };
  for (const [key, limit] of [["latitude", 90], ["longitude", 180]]) {
    if (raw[key] !== null && (!number(raw[key]) || Math.abs(raw[key]) > limit)) return { error: `Enter a valid ${key}.` };
    p[key] = raw[key];
  }
  if ((p.latitude === null) !== (p.longitude === null)) return { error: "Set both map coordinates, or leave both blank." };
  return { property: p };
}

export const hasPin = p => number(p.latitude) && number(p.longitude);
export const propertyShare = (p, owners = null) => p.owners.reduce((s, o) => s + (!owners || (o.ownerId && owners.has(o.ownerId)) ? o.share : 0), 0) / 100;
export function propertyFigures(p, owners = null) {
  const share = propertyShare(p, owners);
  const scaled = key => p[key] === null ? null : p[key] * share;
  const value = scaled("value"), cost = scaled("cost"), debt = scaled("debt"), rent = scaled("monthlyRent"), costs = scaled("monthlyCosts");
  return { share, value, cost, debt, rent, costs,
    equity: value === null || debt === null ? null : value - debt,
    netRent: rent === null || costs === null ? null : rent - costs,
    yield: value === null || value <= 0 || rent === null ? null : rent * 12 / value * 100,
    gain: value === null || cost === null ? null : value - cost };
}
export function propertyTotal(properties, key, owners = null) {
  const known = properties.map(p => propertyFigures(p, owners)[key]).filter(n => n !== null && n !== undefined);
  return { value: known.length ? known.reduce((s, n) => s + n, 0) : null, known: known.length, count: properties.length };
}
