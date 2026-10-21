// External Google service boundary for local browser checks. No key or paid
// request is used. The visible label keeps screenshots unmistakably test data.
export function installGoogleMapsFixture() {
  const fixture = window.__mapsFixture = { requests: [], pending: [] };
  class Events {
    listeners = {};
    addListener(name, callback) {
      (this.listeners[name] ??= new Set()).add(callback);
      return { remove: () => this.listeners[name]?.delete(callback) };
    }
    emit(name, event) { this.listeners[name]?.forEach(callback => callback(event)); }
  }
  class LatLng {
    constructor(lat, lng) { this.latitude = lat; this.longitude = lng; }
    lat() { return this.latitude; } lng() { return this.longitude; }
  }
  class LatLngBounds {
    points = [];
    extend(p) { this.points.push(p); return this; }
    getCenter() { return this.points[0] ?? { lat: 22.4, lng: 79 }; }
    contains() { return true; }
  }
  class Map extends Events {
    constructor(root, options) {
      super(); this.root = root; this.center = options.center; this.zoom = options.zoom;
      root.replaceChildren(); root.style.position = "relative";
      root.dataset.googleMapFixture = "true";
      const label = document.createElement("div"); label.textContent = "Google Maps test fixture"; root.append(label);
      root.addEventListener("click", event => {
        if (event.target.closest("[data-property-marker]")) return;
        const rect = root.getBoundingClientRect();
        this.emit("click", { latLng: new LatLng(this.center.lat + (rect.height / 2 - event.clientY + rect.top) * 0.0001, this.center.lng + (event.clientX - rect.left - rect.width / 2) * 0.0001) });
      });
    }
    getBounds() { return new LatLngBounds(); }
    setCenter(p) { this.center = p; }
    getZoom() { return this.zoom; } setZoom(z) { this.zoom = z; }
    fitBounds(b) { this.center = b.getCenter(); }
  }
  class AdvancedMarkerElement extends Events {
    constructor(options) {
      super(); Object.assign(this, options);
      this.content.title = options.title;
      Object.assign(this.content.style, { position: "absolute", left: "50%", top: "50%", cursor: options.gmpDraggable ? "grab" : "pointer" });
      this.map = options.map;
      this.content.addEventListener("click", () => this.emit("click"));
      this.content.addEventListener("pointerdown", event => {
        if (!this.gmpDraggable) return;
        event.preventDefault();
        const start = { x: event.clientX, y: event.clientY };
        const up = event => {
          document.removeEventListener("pointerup", up);
          this.position = { lat: this.position.lat + (start.y - event.clientY) * 0.0001, lng: this.position.lng + (event.clientX - start.x) * 0.0001 };
          this.emit("dragend");
        };
        document.addEventListener("pointerup", up);
      });
    }
    set map(map) { this.currentMap = map; if (map) map.root.append(this.content); else this.content?.remove(); }
    get map() { return this.currentMap; }
  }
  const result = (approximate = false, label = "Test address, Mumbai, Maharashtra, India") => ({
    formatted_address: label, partial_match: approximate,
    geometry: { location: new LatLng(19.076, 72.8777), location_type: approximate ? "APPROXIMATE" : "ROOFTOP" },
    address_components: [
      { long_name: "Mumbai", types: ["locality"] }, { long_name: "Maharashtra", types: ["administrative_area_level_1"] },
      { long_name: "India", types: ["country"] }, { long_name: "400001", types: ["postal_code"] },
    ],
  });
  class Geocoder {
    async geocode({ address }) {
      fixture.requests.push(address);
      if (address.includes("Test wait")) return new Promise(resolve => fixture.pending.push(() => resolve({ results: [result()] })));
      if (address.includes("Test fail")) throw new Error("REQUEST_DENIED");
      if (address.includes("Test no match")) throw new Error("ZERO_RESULTS");
      if (address.includes("Test ambiguous")) return { results: [result(false, "Test address A, Mumbai"), result(true, "Test address B, Mumbai")] };
      return { results: [result(address.includes("Test approximate"))] };
    }
  }
  class InfoWindow {
    setContent(content) { this.content = content; }
    open({ map }) { map.root.append(this.content); }
    close() { this.content?.remove(); }
  }
  window.google = { maps: { Map, LatLngBounds, InfoWindow, marker: { AdvancedMarkerElement },
    importLibrary: async () => ({ Geocoder }), event: {
      clearInstanceListeners: target => { target.listeners = {}; },
      addListenerOnce: (target, name, callback) => { const timer = setTimeout(callback, 0); return { remove: () => clearTimeout(timer) }; },
    },
  } };
}
