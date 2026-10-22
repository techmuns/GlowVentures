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
    if (raw[key] != null && (typeof raw[key] !== "string" || raw[key].length > max)) return { error: `Check ${key}; maximum ${max} characters.` };
    p[key] = text(raw[key]);
  }
  for (const [key, options] of [["type", PROPERTY_TYPES], ["status", PROPERTY_STATUSES], ["areaUnit", AREA_UNITS], ["titleStatus", TITLE_STATUSES], ["areaBasis", ["Plot", "Carpet", "Built-up", "Super built-up"]]]) {
    const value = raw[key] ?? "";
    if (value !== "" && !options.includes(value)) return { error: `Choose a valid ${key}.` };
    p[key] = value;
  }
  for (const key of [...MONEY_FIELDS, "area"]) {
    const n = raw[key] ?? null;
    if (n !== null && (!number(n) || n < 0 || n > 1e15 || (key === "area" && n === 0))) return { error: `Enter a valid ${key === "monthlyRent" ? "monthly rent" : key}. Leave unknown figures blank.` };
    p[key] = n;
  }
  for (const key of ["purchasedOn", "valuationDate", "leaseEnd"]) {
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
export function propertyShare(p, owners = null) {
  const keys = p.owners.map(o => o.ownerId || o.name.toLowerCase());
  if (new Set(keys).size !== keys.length || p.owners.reduce((s, o) => s + (o.share ?? 0), 0) > 100.000001) return null;
  const selected = owners ? p.owners.filter(o => o.ownerId && owners.has(o.ownerId)) : p.owners;
  if (!selected.length) return owners && p.owners.some(o => o.ownerId) ? 0 : null;
  if (selected.some(o => !o.name || o.share === null)) return null;
  return selected.reduce((s, o) => s + o.share, 0) / 100;
}
function figuresAtShare(p, share) {
  const scaled = key => p[key] === null || share === null ? null : p[key] * share;
  const value = scaled("value"), cost = scaled("cost"), debt = scaled("debt"), rent = scaled("monthlyRent"), costs = scaled("monthlyCosts");
  return { share, value, cost, debt, rent, costs,
    equity: value === null || debt === null ? null : value - debt,
    netRent: rent === null || costs === null ? null : rent - costs,
    yield: p.value === null || p.value <= 0 || p.monthlyRent === null ? null : p.monthlyRent * 12 / p.value * 100,
    gain: value === null || cost === null ? null : value - cost };
}
export const propertyFigures = (p, owners = null) => figuresAtShare(p, propertyShare(p, owners));
export const wholePropertyFigures = p => figuresAtShare(p, 1);
export function propertyTotal(properties, key, owners = null) {
  const known = properties.map(p => propertyFigures(p, owners)[key]).filter(n => n !== null && n !== undefined);
  return { value: known.length ? known.reduce((s, n) => s + n, 0) : null, known: known.length, count: properties.length };
}
