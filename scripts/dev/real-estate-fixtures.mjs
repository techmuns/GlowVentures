// Synthetic records used only by local tests. Never shipped as portfolio data.
export const property = (patch = {}) => ({
  id: "test-apartment", name: "Test apartment", type: "Apartment", address: "Test address", city: "Mumbai", state: "Maharashtra", country: "India", pincode: "400001",
  owners: [{ name: "Test owner A", ownerId: "test-a", share: 60 }, { name: "Test owner B", ownerId: "test-b", share: 40 }],
  area: 1500, areaUnit: "sq ft", areaBasis: "Carpet", cost: 10000000, value: 15000000, monthlyRent: 50000, monthlyCosts: 5000, debt: 3000000,
  purchasedOn: "2020-01-10", valuationDate: "2026-10-01", leaseEnd: "2027-01-01", status: "Rented", tenant: "Test tenant", titleStatus: "Clear", notes: "Test record",
  latitude: 19.076, longitude: 72.8777, ...patch,
});
export function memoryStore() {
  const data = new Map();
  return { data, async list({ prefix, cursor }) {
    const keys = [...data.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = Number(cursor || 0), end = start + 2;
    return { keys: keys.slice(start, end).map(name => ({ name })), list_complete: end >= keys.length, cursor: end < keys.length ? String(end) : undefined };
  }, async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
  async put(key, value) { data.set(key, value); }, async delete(key) { data.delete(key); }, async flush() {} };
}
