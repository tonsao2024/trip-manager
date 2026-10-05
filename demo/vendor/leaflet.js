/**
 * Dev/demo stand-in for Leaflet.
 *
 * It keeps the whole public surface the app uses (map / tileLayer / marker /
 * divIcon / polyline / layerGroup / latLngBounds / TileLayer …) but instead of
 * fetching tiles from the internet it renders a stylised map panel with the
 * numbered pins and the dashed route line — so the offline demo looks like the
 * real itinerary map without a single network request.
 *
 * The jsdom smoke test uses `tests/smoke/stubs/leaflet.mjs` (no DOM drawing);
 * this file is only used by `tools/preview/standalone.mjs`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const MAP_STYLE = `
.demo-map { position: absolute; inset: 0; overflow: hidden; background:
  radial-gradient(circle at 18% 22%, #eaf3fb 0%, transparent 55%),
  radial-gradient(circle at 82% 78%, #e6f0e8 0%, transparent 58%),
  linear-gradient(160deg, #f2f8fd 0%, #e8f1f7 55%, #eef5ef 100%); }
.demo-map::after { content: ''; position: absolute; inset: 0; opacity: .5;
  background-image: linear-gradient(rgba(99,156,181,.16) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(99,156,181,.16) 1px, transparent 1px);
  background-size: 46px 46px; }
.demo-map .dm-water { position: absolute; border-radius: 46% 54% 52% 48% / 44% 48% 52% 56%;
  background: linear-gradient(140deg, #bcd9ec 0%, #a9cde4 60%, #9cc4de 100%);
  filter: blur(.4px); opacity: .85; }
.demo-map .dm-pin { position: absolute; transform: translate(-50%, -100%); z-index: 3;
  transition: left .35s ease, top .35s ease; cursor: pointer; }
.demo-map .dm-pin .map-pin-marker { animation: markerDrop .5s cubic-bezier(.16,1,.3,1) backwards; }
.demo-map .dm-legend { position: absolute; left: 10px; bottom: 10px; z-index: 4;
  font-size: 9.5px; font-weight: 700; letter-spacing: .02em; color: #5b7288;
  background: rgba(255,255,255,.82); border: 1px solid rgba(99,156,181,.28);
  border-radius: 999px; padding: 3px 9px; backdrop-filter: blur(4px); }
.demo-map svg.dm-routes { position: absolute; inset: 0; z-index: 2; }
[data-theme="dark"] .demo-map { background:
  radial-gradient(circle at 18% 22%, #1b2735 0%, transparent 55%),
  radial-gradient(circle at 82% 78%, #1a2a2c 0%, transparent 58%),
  linear-gradient(160deg, #131a24 0%, #16202b 55%, #17222a 100%); }
[data-theme="dark"] .demo-map .dm-water { background: linear-gradient(140deg, #1d3a4f 0%, #1b3448 100%); }
[data-theme="dark"] .demo-map .dm-legend { background: rgba(21,26,35,.85); color: #a9b8c8; }
`;

function injectStyle(doc) {
  if (!doc || doc.getElementById('demo-map-style')) return;
  const style = doc.createElement('style');
  style.id = 'demo-map-style';
  style.textContent = MAP_STYLE;
  doc.head.appendChild(style);
}

/** Project lat/lng into 0..1 of the current view box. */
function makeProjector(view) {
  const { north, south, west, east } = view;
  const latSpan = Math.max(north - south, 0.01);
  const lngSpan = Math.max(east - west, 0.01);
  return (lat, lng) => ({
    x: (lng - west) / lngSpan,
    y: (north - lat) / latSpan
  });
}

class DemoLayer {
  constructor() { this.__children = []; this.__map = null; }
  addTo(target) {
    if (target && target.__register) target.__register(this);                              // straight onto the map
    else if (target && Array.isArray(target.__children)) target.__children.push(this);     // into a layer group
    if (target && target.__map && !target.__register) this.__map = target.__map;
    (this.__map || (target && target.__map))?.__render();
    return this;
  }
  on(event, cb) { (this.__handlers = this.__handlers || {})[event] = cb; return this; }
  off() { this.__handlers = {}; return this; }
  remove() { return this; }
  removeLayer(layer) { this.__children = this.__children.filter(c => c !== layer); this.__render(); return this; }
  clearLayers() { this.__children = []; this.__render(); return this; }
  addLayer(layer) { this.__children.push(layer); this.__render(); return this; }
  addTo_() { return this; }
  setStyle() { return this; }
  setUrl() { return this; }
  redraw() { return this; }
  panTo() { return this; }
  setMaxBounds() { return this; }
  removeControl() { return this; }
  zoomIn() { return this; }
  zoomOut() { return this; }
  bindTooltip() { return this; }
  unbindTooltip() { return this; }
  openTooltip() { return this; }
  setOpacity() { return this; }
  eachLayer() { return this; }
  getContainer() { return this.__container || null; }
  __render() { if (this.__map) this.__map.__render(); }
}

class DemoMarker extends DemoLayer {
  constructor(latlng, opts = {}) {
    super();
    this.__latlng = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
    this.__opts = opts;
    this.__el = null;
  }
  setLatLng(latlng) {
    this.__latlng = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
    this.__render();
    return this;
  }
  getLatLng() { return this.__latlng; }
  setIcon(icon) { this.__opts.icon = icon; this.__render(); return this; }
  bindPopup(html) { this.__popup = html; return this; }
  openPopup() { this.__open = true; this.__render(); return this; }
  closePopup() { this.__open = false; this.__render(); return this; }
  bindLabel() { return this; }
  bringToFront() { return this; }
  bringToBack() { return this; }
  setZIndex() { return this; }
}

class DemoPolyline extends DemoLayer {
  constructor(latlngs, opts = {}) {
    super();
    this.__latlngs = (latlngs || []).map(ll => (Array.isArray(ll) ? { lat: ll[0], lng: ll[1] } : ll));
    this.__opts = opts;
  }
  setLatLngs(latlngs) {
    this.__latlngs = (latlngs || []).map(ll => (Array.isArray(ll) ? { lat: ll[0], lng: ll[1] } : ll));
    this.__render();
    return this;
  }
  getLatLngs() { return this.__latlngs; }
}

class DemoLayerGroup extends DemoLayer {}

class DemoTileLayer extends DemoLayer {
  constructor(url, opts = {}) { super(); this.__url = url; this.__opts = opts; }
}

class DemoMap {
  constructor(container) {
    this.__container = container;
    this.__layers = [];
    this.__view = { north: 35.9, south: 35.2, west: 138.4, east: 139.2 };
    this.__center = { lat: 35.5, lng: 138.8 };
    this.__zoom = 10;
    this.attributionControl = { getContainer: () => this.__attrEl };
    this.zoomControl = { getContainer: () => null };
    injectStyle(container?.ownerDocument || (typeof document !== 'undefined' ? document : null));
    this.__build();
  }
  __build() {
    const el = this.__container;
    if (!el) return;
    el.innerHTML = '';
    el.classList.add('leaflet-host');
    const doc = el.ownerDocument;
    const wrap = doc.createElement('div');
    wrap.className = 'demo-map';
    const water = doc.createElement('div');
    water.className = 'dm-water';
    water.style.cssText = 'width:64%; height:52%; left:-14%; bottom:-16%;';
    wrap.appendChild(water);
    const water2 = doc.createElement('div');
    water2.className = 'dm-water';
    water2.style.cssText = 'width:38%; height:26%; right:-8%; top:-6%; opacity:.55;';
    wrap.appendChild(water2);
    this.__svg = doc.createElementNS(SVG_NS, 'svg');
    this.__svg.setAttribute('class', 'dm-routes');
    wrap.appendChild(this.__svg);
    this.__pins = doc.createElement('div');
    this.__pins.style.cssText = 'position:absolute; inset:0; z-index:3;';
    wrap.appendChild(this.__pins);
    const legend = doc.createElement('div');
    legend.className = 'dm-legend';
    legend.textContent = 'แผนที่ตัวอย่าง (ไม่ต่อเน็ต)';
    wrap.appendChild(legend);
    this.__attrEl = doc.createElement('div');
    this.__attrEl.style.cssText = 'position:absolute; right:8px; bottom:8px; z-index:4; font-size:9px; color:var(--text-tertiary); background:color-mix(in srgb, var(--surface) 80%, transparent); border-radius:8px; padding:2px 6px;';
    this.__attrEl.textContent = 'Fuji Planner • demo map';
    wrap.appendChild(this.__attrEl);
    el.appendChild(wrap);
    this.__render();
  }
  __register(layer) { this.__layers.push(layer); layer.__map = this; layer.__render(); return this; }
  __all(ctor) {
    const out = [];
    const visit = (layer) => {
      out.push(layer);
      (layer.__children || []).forEach(visit);
    };
    this.__layers.forEach(visit);
    return out.filter(l => (ctor ? l instanceof ctor : true));
  }
  __render() {
    if (!this.__pins) return;
    const project = makeProjector(this.__view);
    this.__pins.innerHTML = '';
    this.__svg.innerHTML = '';
    for (const layer of this.__all()) {
      if (layer instanceof DemoPolyline) {
        const pts = layer.__latlngs.map(({ lat, lng }) => {
          const { x, y } = project(lat, lng);
          return `${x * 100},${y * 100}`;
        }).join(' ');
        if (!pts) continue;
        const line = this.__pins.ownerDocument.createElementNS(SVG_NS, 'polyline');
        line.setAttribute('points', pts);
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', layer.__opts.color || '#2f6fe4');
        line.setAttribute('stroke-width', String(layer.__opts.weight || 3));
        line.setAttribute('stroke-opacity', String(layer.__opts.opacity ?? 0.7));
        line.setAttribute('stroke-dasharray', layer.__opts.dashArray || '7,9');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('style', 'position:absolute; inset:0; width:100%; height:100%;');
        this.__svg.appendChild(line);
      }
      if (layer instanceof DemoMarker) {
        const { x, y } = project(layer.__latlng.lat, layer.__latlng.lng);
        const pin = this.__pins.ownerDocument.createElement('div');
        pin.className = 'dm-pin';
        pin.style.left = `${Math.max(3, Math.min(97, x * 100))}%`;
        pin.style.top = `${Math.max(4, Math.min(98, y * 100))}%`;
        pin.innerHTML = layer.__opts.icon?.html || '<div class="map-pin-marker" style="background:#2f6fe4;"></div>';
        if (layer.__popup) pin.title = String(layer.__popup).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        pin.addEventListener('click', () => { if (layer.__handlers?.click) layer.__handlers.click(layer); });
        this.__pins.appendChild(pin);
      }
    }
  }
  eachLayer(cb) { this.__all().forEach(cb); return this; }
  removeLayer(layer) { this.__layers = this.__layers.filter(l => l !== layer); this.__render(); return this; }
  getContainer() { return this.__container; }
  on(event, cb) { (this.__handlers = this.__handlers || {})[event] = cb; return this; }
  off() { this.__handlers = {}; return this; }
  once() { return this; }
  stop() { return this; }
  invalidateSize() { this.__render(); return this; }
  remove() { if (this.__container) this.__container.innerHTML = ''; return this; }
  setView(latlng, zoom) {
    const center = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
    if (center && Number.isFinite(center.lat)) this.__center = center;
    if (zoom) this.__zoom = zoom;
    const span = 0.42 * Math.pow(2, Math.max(0, 12 - (this.__zoom || 10)) * 0.5);
    this.__view = { north: this.__center.lat + span / 2, south: this.__center.lat - span / 2, west: this.__center.lng - span, east: this.__center.lng + span };
    this.__render();
    return this;
  }
  fitBounds(bounds, opts = {}) {
    const box = Array.isArray(bounds) ? boundsFromPoints(bounds) : bounds;
    if (!box || !Number.isFinite(box.north)) return this;
    const padLat = Math.max((box.north - box.south) * 0.42, 0.04);
    const padLng = Math.max((box.east - box.west) * 0.18, 0.04);
    this.__view = {
      north: box.north + padLat, south: box.south - padLat,
      west: box.west - padLng, east: box.east + padLng
    };
    if (opts.maxZoom) this.__zoom = Math.min(this.__zoom || 10, opts.maxZoom);
    this.__render();
    return this;
  }
  getBounds() { return makeBounds(this.__view); }
  getZoom() { return this.__zoom; }
  getMaxZoom() { return 18; }
  whenReady(cb) { cb && cb(); return this; }
  panTo(latlng) { return this.setView(latlng, this.__zoom); }
  setMaxBounds() { return this; }
}

function boundsFromPoints(points) {
  const list = (points || []).map(p => (Array.isArray(p) ? { lat: p[0], lng: p[1] } : p)).filter(p => p && Number.isFinite(p.lat));
  if (!list.length) return null;
  const lats = list.map(p => p.lat);
  const lngs = list.map(p => p.lng);
  return { north: Math.max(...lats), south: Math.min(...lats), west: Math.min(...lngs), east: Math.max(...lngs) };
}

function makeBounds(box) {
  const b = { ...box };
  return {
    extend: (other) => {
      if (!other) return makeBounds(b);
      const n = other.north ?? other[0];
      return makeBounds(b);
    },
    pad: (n) => makeBounds({ ...b }),
    isValid: () => Number.isFinite(b.north) && Number.isFinite(b.south),
    getNorth: () => b.north, getSouth: () => b.south, getWest: () => b.west, getEast: () => b.east,
    contains: () => true
  };
}

const L = {
  map: (container) => new DemoMap(container),
  tileLayer: (url, opts) => new DemoTileLayer(url, opts),
  marker: (latlng, opts) => new DemoMarker(latlng, opts),
  divIcon: (opts) => ({ ...opts }),
  icon: (opts) => ({ ...opts }),
  polyline: (latlngs, opts) => new DemoPolyline(latlngs, opts),
  latLngBounds: (points) => makeBounds(boundsFromPoints(points) || {}),
  latLng: (lat, lng) => ({ lat, lng }),
  layerGroup: () => new DemoLayerGroup(),
  featureGroup: () => new DemoLayerGroup(),
  TileLayer: DemoTileLayer,
  Marker: DemoMarker,
  Polyline: DemoPolyline,
  LayerGroup: DemoLayerGroup,
  control: { attribution: () => null, layers: () => null, zoom: () => null, scale: () => null },
  popup: () => new DemoLayer(),
  tooltip: () => new DemoLayer(),
  circleMarker: () => new DemoLayer(),
  circle: () => new DemoLayer(),
  polygon: () => new DemoPolyline([], {}),
  DomUtil: { create: (tag) => (typeof document !== 'undefined' ? document.createElement(tag) : null) },
  Browser: { mobile: false },
  version: '1.9.4-demo'
};

export default L;
export const map = L.map;
export const tileLayer = L.tileLayer;
export const marker = L.marker;
export const divIcon = L.divIcon;
export const polyline = L.polyline;
export const latLngBounds = L.latLngBounds;
export const latLng = L.latLng;
export const layerGroup = L.layerGroup;
export const featureGroup = L.featureGroup;
export const TileLayer = DemoTileLayer;
export const Marker = DemoMarker;
export const Polyline = DemoPolyline;
export const LayerGroup = DemoLayerGroup;
export const control = L.control;
export const DomUtil = L.DomUtil;
export const Browser = L.Browser;
export const version = L.version;
