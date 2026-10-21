import type { Property } from "./realEstate";
export type PropertyMapProps = {
  properties?: readonly Property[]; onSelect?: (p: Property) => void;
  point?: [number, number] | null; onPick?: (lat: number, lng: number) => void;
};
export const PROPERTY_COLORS: Record<string, string> = {
  Land: "#678355", Apartment: "#596da4", "Villa / house": "#aa783b", Commercial: "#925e85", Office: "#477f83",
  Warehouse: "#797054", Industrial: "#786e9c", Farmhouse: "#41795e", Other: "#737373",
};
type MapConfig = { enabled: false } | { enabled: true; apiKey: string; mapId: string };
let configuration: Promise<MapConfig> | undefined;
export function propertyMapConfig() {
  return configuration ??= fetch("/api/property-map-config", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then(async response => {
    if (!response.ok) throw new Error("Map settings could not be loaded. Try again.");
    const config = await response.json();
    if (config.enabled === false) return { enabled: false } as const;
    if (config.enabled !== true || typeof config.apiKey !== "string" || !config.apiKey || typeof config.mapId !== "string" || !config.mapId) throw new Error("Map settings could not be loaded. Try again.");
    return config as MapConfig;
  }).catch(error => { configuration = undefined; throw error; });
}
declare global {
  interface Window { __glowMapsReady?: () => void; gm_authFailure?: () => void }
}
let loaded: Promise<{ maps: typeof google.maps; mapId: string }> | undefined;
export function loadPropertyGoogleMaps() {
  return loaded ??= propertyMapConfig().then(config => {
    if (!config.enabled) throw new Error("Google Maps address search is not connected yet. You can still place the pin on the map.");
    return new Promise<{ maps: typeof google.maps; mapId: string }>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => fail(), 15000);
      const fail = () => {
        window.clearTimeout(timer); script.remove();
        window.__glowMapsReady = () => {};
        reject(new Error("Google Maps could not load. Check the connection and try again."));
      };
      window.gm_authFailure = () => {
        loaded = undefined;
        window.dispatchEvent(new Event("glow:maps-error"));
        fail();
      };
      window.__glowMapsReady = () => {
        window.clearTimeout(timer); delete window.__glowMapsReady;
        resolve({ maps: google.maps, mapId: config.mapId });
      };
      script.async = true;
      script.src = "https://maps.googleapis.com/maps/api/js?" + new URLSearchParams({
        key: config.apiKey, callback: "__glowMapsReady", loading: "async", v: "quarterly", libraries: "maps,marker", region: "IN", language: "en",
      });
      script.onerror = fail;
      document.head.append(script);
    });
  }).catch(error => { loaded = undefined; throw error; });
}
export type AddressMatch = { label: string; point: [number, number]; approximate: boolean; city: string; state: string; country: string; pincode: string };
export async function findPropertyAddress(address: string): Promise<AddressMatch[]> {
  const { maps } = await loadPropertyGoogleMaps();
  const { Geocoder } = await maps.importLibrary("geocoding") as google.maps.GeocodingLibrary;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      new Geocoder().geocode({ address }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Address search timed out.")), 12000); }),
    ]);
    return response.results.slice(0, 5).map(result => {
      const component = (...types: string[]) => types.map(type => result.address_components.find(c => c.types.includes(type))?.long_name).find(Boolean) ?? "";
      return {
        label: result.formatted_address,
        point: [result.geometry.location.lat(), result.geometry.location.lng()],
        approximate: !!result.partial_match || result.geometry.location_type !== "ROOFTOP",
        city: component("locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2"),
        state: component("administrative_area_level_1"), country: component("country"), pincode: component("postal_code"),
      };
    });
  } catch (error) {
    if (String(error).includes("ZERO_RESULTS")) return [];
    throw new Error("Address search is unavailable. Try again or place the pin on the map.");
  } finally { clearTimeout(timer); }
}
