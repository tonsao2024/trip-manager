// Minimal Leaflet stand-in (jsdom has no layout, so a fake map is returned).
function chainable(extra = {}) {
  const api = {
    addTo: () => api, on: () => api, off: () => api, once: () => api, remove: () => api, removeLayer: () => api,
    clearLayers: () => api, addLayer: () => api, setStyle: () => api, setUrl: () => api, redraw: () => api,
    panTo: () => api, setMaxBounds: () => api, removeControl: () => api, zoomIn: () => api, zoomOut: () => api,
    bindTooltip: () => api, unbindTooltip: () => api, openTooltip: () => api, bindLabel: () => api,
    setOpacity: () => api, setRadius: () => api, setLatLngs: () => api, getLatLngs: () => [],
    setView: () => api, fitBounds: () => api, invalidateSize: () => api, eachLayer: () => api,
    openPopup: () => api, closePopup: () => api, bindPopup: () => api, addLayer: () => api,
    setLatLng: () => api, setIcon: () => api, getLatLng: () => ({ lat: 35, lng: 138 }),
    getBounds: () => ({ pad: () => ({ isValid: () => true }) }), getZoom: () => 10,
    setZIndex: () => api, bringToFront: () => api, whenReady: (cb) => { cb && cb(); return api; },
    getContainer: () => (globalThis.document?.createElement('div') ?? {}),
    ...extra
  };
  return api;
}
const L = {
  map: () => chainable(),
  tileLayer: () => chainable(),
  marker: () => chainable(),
  divIcon: (opts) => ({ ...opts }),
  icon: (opts) => ({ ...opts }),
  polyline: () => chainable(),
  latLngBounds: () => chainable({ extend: () => chainable(), isValid: () => true }),
  latLng: (lat, lng) => ({ lat, lng }),
  layerGroup: () => chainable(),
  control: { attribution: () => chainable(), layers: () => chainable(), zoom: () => chainable(), scale: () => chainable() },
  popup: () => chainable(), tooltip: () => chainable(), featureGroup: () => chainable(), circleMarker: () => chainable(), circle: () => chainable(), polygon: () => chainable(),
  DomUtil: { create: () => globalThis.document?.createElement('div') },
  Browser: { mobile: false }
};
export default L;
export const map = L.map;
export const tileLayer = L.tileLayer;
export const marker = L.marker;
export const divIcon = L.divIcon;
export const polyline = L.polyline;
