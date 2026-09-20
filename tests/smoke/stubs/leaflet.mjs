// Minimal Leaflet stand-in (jsdom has no layout) — records created layers so the
// smoke test can assert tile URLs (e.g. switching to satellite imagery).
export const __created = { maps: [], tileLayers: [] };
export const __lastTileUrl = () => __created.tileLayers[__created.tileLayers.length - 1];

function chainable(extra = {}) {
  const api = {
    addTo: () => api, on: (evt, cb) => { api.__handlers = api.__handlers || {}; (api.__handlers[evt] = api.__handlers[evt] || []).push(cb); return api; },
    off: () => api, once: () => api, remove: () => api, removeLayer: () => api,
    clearLayers: () => api, addLayer: () => api, setStyle: () => api, setUrl: () => api, redraw: () => api,
    panTo: () => api, setMaxBounds: () => api, removeControl: () => api, zoomIn: () => api, zoomOut: () => api,
    bindTooltip: () => api, unbindTooltip: () => api, openTooltip: () => api, bindLabel: () => api,
    setOpacity: () => api, setRadius: () => api, setLatLngs: () => api, getLatLngs: () => [],
    setView: () => api, fitBounds: () => api, invalidateSize: () => api, eachLayer: () => api,
    openPopup: () => api, closePopup: () => api, bindPopup: (html) => { api.__popup = html; return api; },
    setLatLng: () => api, setIcon: () => api, getLatLng: () => ({ lat: 35, lng: 138 }),
    getBounds: () => ({ pad: () => ({ isValid: () => true }) }), getZoom: () => 10,
    setZIndex: () => api, bringToFront: () => api, bringToBack: () => api,
    whenReady: (cb) => { cb && cb(); return api; },
    getContainer: () => (globalThis.document?.createElement('div') ?? {}),
    ...extra
  };
  return api;
}

const L = {
  map: () => { const m = chainable(); __created.maps.push(m); return m; },
  tileLayer: (url, opts) => { const t = chainable({ __url: url, __opts: opts }); __created.tileLayers.push(t); return t; },
  marker: () => chainable(),
  divIcon: (opts) => ({ ...opts }),
  icon: (opts) => ({ ...opts }),
  polyline: () => chainable(),
  latLngBounds: () => chainable({ extend: () => chainable(), isValid: () => true }),
  latLng: (lat, lng) => ({ lat, lng }),
  layerGroup: () => chainable(),
  control: { attribution: () => chainable(), layers: () => chainable(), zoom: () => chainable(), scale: () => chainable() },
  popup: () => chainable(), tooltip: () => chainable(), featureGroup: () => chainable(),
  circleMarker: () => chainable(), circle: () => chainable(), polygon: () => chainable(),
  DomUtil: { create: () => globalThis.document?.createElement('div') },
  Browser: { mobile: false }
};
export default L;
export const map = L.map;
export const tileLayer = L.tileLayer;
export const marker = L.marker;
export const divIcon = L.divIcon;
export const polyline = L.polyline;
