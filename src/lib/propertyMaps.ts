import type { Property } from "./realEstate";
export type PropertyMapProps = {
  properties?: readonly Property[]; onSelect?: (p: Property) => void;
  point?: [number, number] | null; onPick?: (lat: number, lng: number) => void;
};
export const PROPERTY_COLORS: Record<string, string> = {
  Land: "#678355", Apartment: "#596da4", "Villa / house": "#aa783b", Commercial: "#925e85", Office: "#477f83",
  Warehouse: "#797054", Industrial: "#786e9c", Farmhouse: "#41795e", Other: "#737373",
};
export type AddressMatch = { label: string; point: [number, number]; approximate: boolean; city: string; state: string; country: string; pincode: string };
const results = new Map<string, AddressMatch[]>();
let nextSearchAt = 0;
export async function findPropertyAddress(address: string): Promise<AddressMatch[]> {
  const key = address.trim().replace(/\s+/g, " ");
  const cached = results.get(key);
  if (cached) return cached;
  // Searches are explicit button presses, never automatic per-keystroke calls.
  const wait = Math.max(0, nextSearchAt - Date.now());
  nextSearchAt = Date.now() + wait + 1100;
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  const message = "Address search is unavailable. Try again or place the pin on the map.";
  const response = await fetch("/api/property-geocode?" + new URLSearchParams({ address: key }), { signal: AbortSignal.timeout(15000) }).catch(() => { throw new Error(message); });
  const reply = await response.json().catch(() => { throw new Error(message); });
  if (!response.ok || !Array.isArray(reply.matches)) throw new Error(reply.message || message);
  results.set(key, reply.matches);
  return reply.matches;
}
