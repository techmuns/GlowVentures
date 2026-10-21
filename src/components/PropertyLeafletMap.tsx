import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { hasPin, type Property } from "@/lib/realEstate";
import { PROPERTY_COLORS, type PropertyMapProps } from "@/lib/propertyMaps";
export default function PropertyLeafletMap({ properties = [], onSelect, point, onPick }: PropertyMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const instance = useRef<L.Map | null>(null);
  const pins = useRef<L.LayerGroup>();
  const callbacks = useRef({ onSelect, onPick }); callbacks.current = { onSelect, onPick };
  const [tilesFailed, setTilesFailed] = useState(false);
  const tiles = useRef<L.TileLayer>();
  useEffect(() => {
    if (!root.current) return;
    // These maps are frequently removed when a dialog closes or a tab changes.
    // Leaflet's delayed zoom transition can otherwise run after its pane is gone.
    const map = L.map(root.current, { scrollWheelZoom: false, zoomAnimation: false,
      fadeAnimation: false, markerZoomAnimation: false }).setView([22.4, 79], 5, { animate: false });
    instance.current = map;
    tiles.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).on("tileerror", () => setTilesFailed(true)).addTo(map);
    pins.current = L.layerGroup().addTo(map);
    map.on("click", event => callbacks.current.onPick?.(event.latlng.lat, event.latlng.lng));
    const observer = new ResizeObserver(() => {
      if (instance.current === map && root.current?.isConnected) map.invalidateSize({ animate: false });
    }); observer.observe(root.current);
    return () => {
      instance.current = null;
      observer.disconnect();
      map.stop();
      map.remove();
      pins.current = undefined;
      tiles.current = undefined;
    };
  }, []);
  useEffect(() => {
    const map = instance.current, layer = pins.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const groups = new Map<string, Property[]>();
    for (const property of properties.filter(hasPin)) {
      const key = `${property.latitude},${property.longitude}`;
      groups.set(key, [...(groups.get(key) ?? []), property]);
    }
    for (const group of groups.values()) {
      const p = group[0];
      const marker = L.marker([p.latitude!, p.longitude!], { title: group.map(p => p.name).join(", "),
        icon: L.divIcon({ className: "property-pin-wrapper", iconSize: [30, 36], iconAnchor: [15, 34],
          html: `<span class="property-pin" style="background:${PROPERTY_COLORS[p.type] ?? PROPERTY_COLORS.Other}"><span>${group.length > 1 ? group.length : ""}</span></span>` }) }).addTo(layer);
      if (group.length === 1) marker.on("click", () => callbacks.current.onSelect?.(p));
      else {
        const list = document.createElement("div"); list.className = "property-pin-list";
        for (const item of group) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = item.name;
          button.addEventListener("click", () => callbacks.current.onSelect?.(item)); list.append(button);
        }
        marker.bindPopup(list);
      }
    }
    const coordinates = [...groups.values()].map(group => [group[0].latitude!, group[0].longitude!] as [number, number]);
    if (point) {
      const marker = L.marker(point, { draggable: !!onPick, title: onPick ? "Drag pin to the property" : "Property location",
        icon: L.divIcon({ className: "property-pin-wrapper", iconSize: [30, 36], iconAnchor: [15, 34], html: '<span class="property-pin" style="background:#aa783b"></span>' }) }).addTo(layer);
      marker.on("dragend", () => { const p = marker.getLatLng(); callbacks.current.onPick?.(p.lat, p.lng); });
      coordinates.push(point);
    }
    if (point && properties.length === 0 && map.getZoom() >= 15 && map.getBounds().contains(point)) { /* Keep the viewport steady while adjusting the pin. */ }
    else if (coordinates.length) map.fitBounds(L.latLngBounds(coordinates), { padding: [45, 45], maxZoom: coordinates.length === 1 ? 17 : 14, animate: false });
    else map.setView([22.4, 79], 5, { animate: false });
  }, [properties, point]);
  return <div className="relative">
    <div ref={root} className={`property-map ${onPick ? "property-map-picker" : ""}`} aria-label={onPick ? "Click map or drag pin to set property location" : "Property locations"} />
    {tilesFailed && <div className="absolute bottom-8 left-3 right-3 z-[500] rounded-md border border-ink-600 bg-ink-900 p-2 text-xs text-slate-300" role="status">
      Map tiles unavailable. <button className="underline" type="button" onClick={() => { setTilesFailed(false); tiles.current?.redraw(); }}>Retry map</button>
    </div>}
  </div>;
}
