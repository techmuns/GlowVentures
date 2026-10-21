import { useEffect, useRef, useState } from "react";
import { hasPin, type Property } from "@/lib/realEstate";
import { loadPropertyGoogleMaps, PROPERTY_COLORS, type PropertyMapProps } from "@/lib/propertyMaps";
export default function PropertyGoogleMap({ properties = [], onSelect, point, onPick }: PropertyMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onPick }); callbacks.current = { onSelect, onPick };
  const [ready, setReady] = useState<{ map: google.maps.Map; maps: typeof google.maps }>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const fitted = useRef("");
  useEffect(() => {
    let active = true;
    let map: google.maps.Map | undefined;
    const authError = () => { if (active) setError("Google Maps is unavailable. Check its access settings and retry."); };
    window.addEventListener("glow:maps-error", authError);
    loadPropertyGoogleMaps().then(({ maps, mapId }) => {
      if (!active || !root.current) return;
      map = new maps.Map(root.current, { center: { lat: 22.4, lng: 79 }, zoom: 5, mapId,
        gestureHandling: "cooperative", streetViewControl: false, fullscreenControl: true, mapTypeControl: true });
      map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) callbacks.current.onPick?.(event.latLng.lat(), event.latLng.lng());
      });
      fitted.current = "";
      setReady({ map, maps });
    }).catch(e => { if (active) setError(e.message); });
    return () => {
      active = false;
      window.removeEventListener("glow:maps-error", authError);
      if (map) google.maps.event.clearInstanceListeners(map);
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready) return;
    const { map, maps } = ready;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    let idleListener: google.maps.MapsEventListener | undefined;
    const popup = new maps.InfoWindow();
    const groups = new Map<string, Property[]>();
    for (const p of properties.filter(hasPin)) {
      const key = `${p.latitude},${p.longitude}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    const markerAt = (position: google.maps.LatLngLiteral, title: string, type: string, count = 1, draggable = false) => {
      const content = document.createElement("span"); content.className = "property-pin";
      content.style.background = PROPERTY_COLORS[type] ?? PROPERTY_COLORS.Other;
      content.dataset.propertyMarker = title;
      const label = document.createElement("span"); label.textContent = count > 1 ? String(count) : ""; content.append(label);
      const marker = new maps.marker.AdvancedMarkerElement({ map, position, title, content, gmpDraggable: draggable, gmpClickable: !draggable });
      markers.push(marker); return marker;
    };
    const bounds = new maps.LatLngBounds();
    for (const group of groups.values()) {
      const p = group[0], position = { lat: p.latitude!, lng: p.longitude! }; bounds.extend(position);
      const marker = markerAt(position, group.map(p => p.name).join(", "), p.type, group.length);
      marker.addListener("click", () => {
        if (group.length === 1) { callbacks.current.onSelect?.(p); return; }
        const list = document.createElement("div"); list.className = "property-pin-list";
        for (const p of group) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = p.name;
          button.addEventListener("click", () => callbacks.current.onSelect?.(p)); list.append(button);
        }
        popup.setContent(list); popup.open({ map, anchor: marker });
      });
    }
    if (point) {
      const position = { lat: point[0], lng: point[1] }; bounds.extend(position);
      const marker = markerAt(position, onPick ? "Drag pin to the property" : "Property location", "Villa / house", 1, !!onPick);
      marker.addListener("dragend", () => {
        const pos = marker.position;
        if (!pos) return;
        const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
        callbacks.current.onPick?.(lat, lng);
      });
    }
    const signature = JSON.stringify([...groups.keys()]);
    const initial = !fitted.current;
    if (markers.length && (initial || signature !== fitted.current || (point && !map.getBounds()?.contains({ lat: point[0], lng: point[1] })))) {
      if (markers.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(17); }
      else { map.fitBounds(bounds, 45); idleListener = maps.event.addListenerOnce(map, "idle", () => { if ((map.getZoom() ?? 0) > 17) map.setZoom(17); }); }
    }
    fitted.current = signature;
    return () => { idleListener?.remove(); popup.close(); markers.forEach(marker => { maps.event.clearInstanceListeners(marker); marker.map = null; }); };
  }, [ready, properties, point]);
  return <div className="relative">
    <div ref={root} className={`property-map ${onPick ? "property-map-picker" : ""}`} aria-label={onPick ? "Click map or drag pin to set property location" : "Property locations"} />
    {error && <div className="absolute inset-0 grid place-items-center bg-ink-900 p-5 text-sm text-slate-300" role="status"><div>{error} <button type="button" className="underline" onClick={() => { setError(""); setReady(undefined); setAttempt(a => a + 1); }}>Retry map</button></div></div>}
  </div>;
}
