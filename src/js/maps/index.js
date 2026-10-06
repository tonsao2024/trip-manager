// Maps v4 — Leaflet + free tile providers
// Key fixes in v4:
//  • "Map container is already initialized" can never happen again — every map is
//    registered per container element and reused / destroyed safely.
//  • The container node is never wiped while a live map owns it (loading states use
//    an overlay instead), so markers always keep rendering.
//  • Auto invalidateSize on resize / when the container becomes visible.
//  • CARTO raster tiles carry the trip's CARTO key (`key=` param) so the
//    "API key required" watermark never shows up.
// Provider order: CARTO (light: Voyager / dark: Dark Matter) → OpenStreetMap → Esri World Street Map

// CARTO Basemaps raster key — appended to every CARTO tile URL as `?key=`.
export const CARTO_API_KEY = 'cb1_40yb_1_3281af0bd5f0a306f9b8893a';

// Base maps the user can switch between (all CORS-friendly)
export const BASE_LAYERS = [
  {
    id: 'map',
    name: 'แผนที่',
    en: 'Map',
    icon: 'map',
    light: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
    dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20
  },
  {
    id: 'satellite',
    name: 'ดาวเทียม',
    en: 'Satellite',
    icon: 'satellite',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    labels: {
      light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
    }
  },
  {
    id: 'terrain',
    name: 'ภูมิประเทศ',
    en: 'Terrain',
    icon: 'mountain',
    light: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; OpenTopoMap (CC-BY-SA) &copy; OpenStreetMap contributors',
    maxZoom: 17
  }
];

// Legacy fallback chain kept for the automatic "tiles are failing" switch
const TILE_PROVIDERS = [
  { name: 'CARTO', ...BASE_LAYERS[0] },
  { name: 'OpenStreetMap', ...BASE_LAYERS[0], light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', dark: BASE_LAYERS[0].dark, maxZoom: 19 },
  { name: 'Esri', ...BASE_LAYERS[1] }
];

export const MAP_LAYER_STORAGE_KEY = 'fuji_map_layer';

export function getStoredLayerId() {
  try {
    const id = localStorage.getItem(MAP_LAYER_STORAGE_KEY);
    if (id && BASE_LAYERS.some(l => l.id === id)) return id;
  } catch {}
  return 'map';
}

export function setStoredLayerId(id) {
  try { localStorage.setItem(MAP_LAYER_STORAGE_KEY, id); } catch {}
}

export function getLayerDef(id) {
  return BASE_LAYERS.find(l => l.id === id) || BASE_LAYERS[0];
}

const FUJI_CENTER = [35.3606, 138.7274];

let leafletPromise = null;

// element -> { map, L, tile, markers: LayerGroup, ro: ResizeObserver }
const MAP_REGISTRY = new WeakMap();
// containerId -> element (so destroyMap(id) also works)
const CONTAINER_IDS = new Map();

function loadLeafletUMD() {
  // Fallback loader: classic script tag (works even if ESM CDN is blocked)
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet UMD loaded but window.L missing'));
    s.onerror = () => reject(new Error('โหลด Leaflet ไม่สำเร็จ (ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต)'));
    document.head.appendChild(s);
  });
}

export async function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    // CSS (idempotent)
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    try {
      const mod = await import('https://esm.sh/leaflet@1.9.4');
      return mod.default || mod;
    } catch (e) {
      console.warn('[Maps] ESM Leaflet failed, trying UMD fallback:', e.message);
      return loadLeafletUMD();
    }
  })();
  return leafletPromise;
}

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function buildTileLayer(map, L, def, entry, { withFallback = true } = {}) {
  const dark = isDarkTheme();
  let failedTiles = 0;
  let switched = false;

  const layer = L.tileLayer(dark ? def.dark : def.light, {
    attribution: def.attribution,
    maxZoom: def.maxZoom || 19,
    subdomains: 'abcd',
    crossOrigin: true,
    errorTileUrl: '',
    detectRetina: false
  });

  if (withFallback) {
    layer.on('tileerror', () => {
      failedTiles++;
      if (failedTiles >= 4 && !switched && def.id === 'map') {
        switched = true;
        console.warn('[Maps] Tiles failing on CARTO, falling back to OpenStreetMap');
        try { map.removeLayer(layer); } catch {}
        addTileLayerWithFallback(map, L, 1, entry);
      }
    });
  }

  layer.addTo(map);
  layer.bringToBack?.();

  // Satellite imagery needs a labels overlay to stay readable
  if (def.labels) {
    const labels = L.tileLayer(dark ? def.labels.dark : def.labels.light, {
      maxZoom: def.maxZoom || 19, subdomains: 'abcd', crossOrigin: true, opacity: 0.9, pane: 'overlayPane'
    });
    labels.addTo(map);
    if (entry) entry.labels = labels;
  }
  return layer;
}

function addTileLayerWithFallback(map, L, providerIndex = 0, entry = null) {
  const provider = TILE_PROVIDERS[Math.min(providerIndex, TILE_PROVIDERS.length - 1)];
  const def = { ...provider, id: provider.name.toLowerCase(), maxZoom: provider.maxZoom };
  const layer = buildTileLayer(map, L, def, entry, { withFallback: false });

  let failedTiles = 0;
  let switched = false;
  layer.on('tileerror', () => {
    failedTiles++;
    // If many tiles fail on this provider, switch to the next one automatically
    if (failedTiles >= 4 && !switched && providerIndex < TILE_PROVIDERS.length - 1) {
      switched = true;
      console.warn(`[Maps] Tiles failing on ${provider.name}, falling back to ${TILE_PROVIDERS[providerIndex + 1].name}`);
      try { map.removeLayer(layer); } catch {}
      addTileLayerWithFallback(map, L, providerIndex + 1, entry);
    }
  });

  layer.addTo(map);
  if (entry) entry.tile = layer;
  layer.bringToBack?.();
  return layer;
}

/** Swap the base map (แผนที่ / ดาวเทียม / ภูมิประเทศ) without touching markers. */
export function setMapLayer(containerId, layerId, L = null) {
  const el = document.getElementById(containerId) || CONTAINER_IDS.get(containerId);
  if (!el) return false;
  const entry = MAP_REGISTRY.get(el);
  if (!entry?.map) return false;
  const lib = L || entry.L || window.L;
  if (!lib) return false;

  const def = getLayerDef(layerId);
  try { if (entry.tile) entry.map.removeLayer(entry.tile); } catch {}
  try { if (entry.labels) { entry.map.removeLayer(entry.labels); entry.labels = null; } } catch {}
  entry.tile = buildTileLayer(entry.map, lib, def, entry, { withFallback: def.id === 'map' });
  entry.layerId = def.id;
  setStoredLayerId(def.id);
  return true;
}

export function getMapLayer(containerId) {
  const el = document.getElementById(containerId) || CONTAINER_IDS.get(containerId);
  const entry = el ? MAP_REGISTRY.get(el) : null;
  return entry?.layerId || getStoredLayerId();
}

/* --------------------------- Google Maps links --------------------------- */

/** Universal Google Maps directions link (works on mobile app + desktop). */
export function googleMapsDirectionsUrl(item) {
  const savedUrl = String(item?.googleMapsUrl || '').trim();
  if (/^https?:\/\//i.test(savedUrl)) return savedUrl;
  const pos = getItemLatLng(item);
  const query = pos ? `${pos.lat},${pos.lng}` : (item?.address || item?.title || '');
  if (!query) return '';
  const label = item?.title ? `&destination_place_id=&travelmode=driving` : '';
  if (pos) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query + (item?.title ? ` (${item.title})` : ''))}${label}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

/** Search / "open in maps" link for a place. */
export function googleMapsPlaceUrl(item) {
  const savedUrl = String(item?.googleMapsUrl || '').trim();
  if (/^https?:\/\//i.test(savedUrl)) return savedUrl;
  const pos = getItemLatLng(item);
  if (pos) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pos.lat},${pos.lng}`)}`;
  const q = item?.googleMapsUrl || item?.address || item?.title || '';
  if (!q) return '';
  if (/^https?:\/\//i.test(q)) return q;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function destroyEntry(el, entry) {
  const { map, ro } = entry || {};
  try { ro?.disconnect?.(); } catch {}
  try {
    if (map) { map.stop?.(); map.off(); map.remove(); }
  } catch (e) {
    console.warn('[Maps] cleanup failed', e?.message);
  }
  try {
    if (el) {
      // Leaflet leaves _leaflet_id behind — clear it so a fresh L.map() always works
      delete el._leaflet_id;
      el.innerHTML = '';
    }
  } catch {}
  try { MAP_REGISTRY.delete(el); } catch {}
  for (const [id, node] of CONTAINER_IDS.entries()) if (node === el) CONTAINER_IDS.delete(id);
}

/**
 * Destroy a map that is attached to #containerId (safe to call any time).
 */
export function destroyMap(containerId) {
  const el = document.getElementById(containerId) || CONTAINER_IDS.get(containerId);
  if (!el) return;
  const entry = MAP_REGISTRY.get(el);
  if (entry) destroyEntry(el, entry);
}

export function getMap(containerId) {
  const el = document.getElementById(containerId) || CONTAINER_IDS.get(containerId);
  if (!el) return null;
  const entry = MAP_REGISTRY.get(el);
  return entry?.map || null;
}

/**
 * Create (or safely reuse) a Leaflet map inside #containerId.
 * Never throws "Map container is already initialized".
 */
export async function initMap(containerId, options = {}) {
  const L = await loadLeaflet();
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`ไม่พบ element #${containerId}`);

  const existing = MAP_REGISTRY.get(el);
  if (existing?.map) {
    if (options.forceRecreate) {
      destroyEntry(el, existing);
    } else {
      // Reuse the live instance (tile theme + size refresh)
      if (options.center) {
        try { existing.map.setView(options.center, options.zoom || existing.map.getZoom(), { animate: true }); } catch {}
      } else if (options.zoom && existing.map.getZoom() !== options.zoom) {
        try { existing.map.setZoom(options.zoom); } catch {}
      }
      requestAnimationFrame(() => { try { existing.map.invalidateSize(); } catch {} });
      return { map: existing.map, L, reused: true };
    }
  }

  // Defensive: a previous Leaflet instance may still be attached to this node
  if (el._leaflet_id) {
    console.warn('[Maps] stale Leaflet container detected — cleaning up');
    try { el.innerHTML = ''; } catch {}
    try { delete el._leaflet_id; } catch {}
  }
  el.innerHTML = '';
  el.classList.add('leaflet-host');

  const map = L.map(el, {
    center: options.center || FUJI_CENTER,
    zoom: options.zoom || 10,
    zoomControl: options.zoomControl !== false,
    scrollWheelZoom: options.scrollWheelZoom !== false,
    attributionControl: true,
    preferCanvas: true,
    worldCopyJump: true
  });

  const entry = { map, L, tile: null, markers: L.layerGroup().addTo(map), ro: null };
  MAP_REGISTRY.set(el, entry);
  CONTAINER_IDS.set(containerId, el);

  const layerId = options.layerId || getStoredLayerId();
  const def = getLayerDef(layerId);
  entry.layerId = def.id;
  entry.tile = buildTileLayer(map, L, def, entry, { withFallback: def.id === 'map' });

  // Attribution styling so it blends with the theme
  const attr = map.attributionControl?.getContainer?.();
  if (attr) {
    attr.style.background = 'color-mix(in srgb, var(--surface) 80%, transparent)';
    attr.style.color = 'var(--text-tertiary)';
    attr.style.fontSize = '10px';
    attr.style.borderRadius = '8px';
    attr.style.padding = '2px 6px';
  }

  // Leaflet needs a size hint whenever the container becomes visible or resizes
  if (window.ResizeObserver) {
    try {
      entry.ro = new ResizeObserver(() => { try { map.invalidateSize(); } catch {} });
      entry.ro.observe(el);
    } catch {}
  }
  requestAnimationFrame(() => { try { map.invalidateSize(); } catch {} });

  return { map, L, reused: false };
}

/**
 * Force a size recalculation (call right after showing a hidden map container).
 */
export function refreshMapSize(containerId) {
  const map = getMap(containerId);
  if (!map) return;
  requestAnimationFrame(() => {
    try { map.invalidateSize(); } catch {}
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 180);
  });
}

// Re-apply tiles matching the current light/dark theme (call after theme toggle)
export function refreshMapTheme(map, L) {
  if (!map || !L) return;
  try {
    map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });
  } catch {}
  const el = map.getContainer?.();
  const entry = el ? MAP_REGISTRY.get(el) : null;
  const layerId = entry?.layerId || getStoredLayerId();
  const def = getLayerDef(layerId);
  if (entry) {
    entry.layerId = def.id;
    entry.tile = buildTileLayer(map, L, def, entry, { withFallback: def.id === 'map' });
  } else {
    buildTileLayer(map, L, def, null, { withFallback: def.id === 'map' });
  }
}

function parseCoord(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const lat = parseFloat(value.lat ?? value.latitude);
    const lng = parseFloat(value.lng ?? value.lon ?? value.longitude);
    return (isNaN(lat) || isNaN(lng)) ? null : { lat, lng };
  }
  const parts = String(value).split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return { lat: parts[0], lng: parts[1] };
}

export function getItemLatLng(item) {
  return parseCoord(item?.coordinates);
}

function escapePopupText(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Draw numbered markers + dashed order polyline for itinerary items.
 * Replaces any markers previously drawn on this map (no duplicates / no leaks).
 */
export function addItineraryMarkers(map, L, items, dayColors, opts = {}) {
  if (!map || !L) return { markers: [], count: 0 };
  const el = map.getContainer?.();
  const entry = el ? MAP_REGISTRY.get(el) : null;
  const layer = entry?.markers || L.layerGroup().addTo(map);
  layer.clearLayers();
  // v18: the popup’s “more details” button is delegated from the container, so the
  // current items must be reachable from the entry (see bindPopupDetails).
  if (entry) entry.items = items || [];
  bindPopupDetails(el);

  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-raw').trim() || '#1f6bfb';
  const thawLabel = opts.moreLabel || (opts.lang === 'en' ? 'More about this place' : 'รายละเอียดสถานที่เพิ่มเติม');
  const dirLabel = opts.directionsLabel || (opts.lang === 'en' ? 'Directions' : 'ไปที่นี่');
  const latlngs = [];
  const markers = [];

  (items || []).forEach((item, idx) => {
    const pos = getItemLatLng(item);
    if (!pos) return;
    const { lat, lng } = pos;
    latlngs.push([lat, lng]);
    const color = dayColors?.[item.date] || primary;
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div class="map-pin-marker" style="background:${color};"><span>${idx + 1}</span></div>`,
      iconSize: [30, 40],
      iconAnchor: [15, 38],
      popupAnchor: [0, -34]
    });
    const marker = L.marker([lat, lng], { icon, riseOnHover: true }).addTo(layer);
    // Tag the pin so the list → map focus can find & open the right popup.
    marker._fujiItemId = item.id;
    marker._fujiMasterId = item.masterId || null;
    const thumb = item.imageUrl
      ? `<div class="map-popup-thumb"><img src="${escapePopupText(item.imageUrl)}" alt="" onerror="this.parentElement.style.display='none'"></div>`
      : '';
    const money = (item.estimateMinor || item.estimateAmount)
      ? `<div class="map-popup-money">≈ ${escapePopupText(item.estimateCurrency || '')} ${Number(item.estimateAmount ?? (item.estimateMinor / 100)).toLocaleString()}</div>`
      : '';
    const mapsHref = googleMapsPlaceUrl(item);
    marker.bindPopup(`
      <div class="map-popup">
        ${thumb}
        <b>${idx + 1}. ${escapePopupText(item.title || '')}</b>
        ${item.address ? `<div class="map-popup-sub">${escapePopupText(item.address)}</div>` : ''}
        ${item.startAt ? `<div class="map-popup-sub">${escapePopupText(new Date(item.startAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))}</div>` : ''}
        ${money}
        <div class="map-popup-links">
          ${mapsHref ? `<a href="${escapePopupText(mapsHref)}" target="_blank" rel="noopener">${escapePopupText(dirLabel || 'Google Maps')}</a>` : ''}
          <button type="button" class="map-popup-more-btn" data-place-more="${escapePopupText(item.id)}">${escapePopupText(thawLabel || 'รายละเอียดสถานที่เพิ่มเติม')}</button>
        </div>
        <div class="map-popup-more" data-more-for="${escapePopupText(item.id)}"></div>
      </div>`);
    markers.push(marker);
  });

  let polyline = null;
  if (latlngs.length > 1) {
    polyline = L.polyline(latlngs, {
      color: primary, weight: 3, opacity: 0.7, dashArray: '7,9', lineCap: 'round'
    }).addTo(layer);
  }

  const bounds = latlngs.length ? latlngs : null;
  if (bounds && opts.fitBounds !== false) {
    try {
      if (latlngs.length === 1) map.setView(latlngs[0], opts.singleZoom || 13, { animate: true });
      else map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 });
    } catch {}
  }

  return { markers, polyline, count: latlngs.length };
}

/**
 * One-shot helper used by the itinerary page: init + draw + fit.
 * Safe to call repeatedly (e.g. after adding a new place with coordinates).
 */
/**
 * v18: “รายละเอียดสถานที่เพิ่มเติม” inside a map popup.
 *
 * One delegated listener per container element (bound at most once) answers the
 * button by asking the optional, key-less place-details helper (Overpass +
 * Wikipedia). The popup stays usable when the network is not there: the module
 * returns `ok:false` and we render the links we do have.
 */
const POPUP_BOUND = new WeakSet();
function bindPopupDetails(el) {
  if (!el || POPUP_BOUND.has(el)) return;
  POPUP_BOUND.add(el);
  el.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('[data-place-more]');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const id = btn.getAttribute('data-place-more');
    const entry = MAP_REGISTRY.get(el);
    const item = (entry?.items || []).find(i => i && (i.id === id || i.masterId === id));
    const box = el.querySelector(`[data-more-for="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
    if (!item || !box) return;
    if (box.dataset.loaded === '1') {
      box.classList.toggle('is-open');
      return;
    }
    box.innerHTML = `<div class="place-details place-details--loading"><span class="place-details-spinner"></span>${'กำลังค้นหา…'}</div>`;
    box.classList.add('is-open');
    btn.disabled = true;
    try {
      const { fetchPlaceDetails, placeDetailsHtml, placeDetailsSupported } = await import('../utils/placeDetails.js');
      if (!placeDetailsSupported(item)) {
        box.innerHTML = placeDetailsHtml({ ok: false, mapsUrl: googleMapsPlaceUrl(item) }, { lang: entry?.lang || 'th' });
      } else {
        const details = await fetchPlaceDetails(item, { lang: entry?.lang || 'th' });
        box.innerHTML = placeDetailsHtml(details, { lang: entry?.lang || 'th', compact: true });
        box.dataset.loaded = '1';
      }
    } catch (e) {
      box.innerHTML = placeDetailsHtml({ ok: false, mapsUrl: googleMapsPlaceUrl(item) }, { lang: entry?.lang || 'th' });
    } finally {
      btn.disabled = false;
    }
  });
}

/** Let the map remember which language the UI is in (for the details labels). */
export function setMapLang(containerId, lang) {
  const el = document.getElementById(containerId) || CONTAINER_IDS.get(containerId);
  const entry = el ? MAP_REGISTRY.get(el) : null;
  if (entry) entry.lang = lang;
}

export async function renderItineraryMap(containerId, items, options = {}) {
  const { map, L } = await initMap(containerId, {
    zoom: options.zoom || 10,
    center: options.center,
    forceRecreate: options.forceRecreate === true
  });
  const result = addItineraryMarkers(map, L, items, options.dayColors, options);
  refreshMapSize(containerId);
  return { map, L, ...result };
}

/**
 * Steer the map to an itinerary item's pinned coordinates and open its popup.
 * Works for virtual "back to hotel" cards too (they resolve to their master pin).
 * Returns false when there is no map or the item has no coordinates.
 */
export function focusItineraryItem(containerId, items, itemId, { zoom = 16, openPopup = true, focus = true } = {}) {
  const map = getMap(containerId);
  if (!map || !itemId) return false;
  const list = items || [];
  const item = list.find(i => i.id === itemId)
    || list.find(i => i.masterId === itemId)
    || { id: itemId };
  // v18 (requested): tapping a card with coordinates must centre that pin, and the
  // focused pin is lifted while the others dim, so it is obvious on the map.
  if (focus) setItemFocus(containerId, itemId);
  const pos = getItemLatLng(item);
  if (pos) {
    try {
      // Always head for the pin — keep a close zoom but never zoom out past 15.
      map.setView([pos.lat, pos.lng], Math.max(15, Math.min(zoom, map.getMaxZoom() || 18)), { animate: true });
    } catch { return false; }
    if (openPopup) {
      try {
        const el = map.getContainer?.();
        const entry = el ? MAP_REGISTRY.get(el) : null;
        const wantIds = [item.masterId, item.id, itemId].filter(Boolean);
        const layers = entry?.markers?.getLayers?.() || [];
        const marker = layers.find(l => wantIds.includes(l._fujiItemId))
          || layers.find(l => wantIds.includes(l._fujiMasterId));
        marker?.openPopup?.();
      } catch { /* popup is a bonus — focus still happened */ }
    }
    return true;
  }
  // v18 (requested): a card WITHOUT coordinates used to do nothing at all. Now the
  // map frames the rest of that day, so the place still gets its context.
  const dayKey = item.date || item.day || item.customDate || null;
  const pool = dayKey ? list.filter(i => (i.date || i.day || i.customDate) === dayKey) : list;
  const pts = pool.map(getItemLatLng).filter(Boolean);
  if (!pts.length) return false;
  try {
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 14, { animate: true });
    else map.fitBounds(pts.map(p => [p.lat, p.lng]), { padding: [46, 46], maxZoom: 15, animate: true });
  } catch { return false; }
  return true;
}

/**
 * v18: highlight one pin of a day's layer group and dim the rest.
 * `itemId = null` restores every pin to full strength.
 */
export function setItemFocus(containerId, itemId) {
  const el = document.getElementById(containerId) || CONTAINER_IDS.get(containerId);
  const entry = el ? MAP_REGISTRY.get(el) : null;
  const layers = entry?.markers?.getLayers?.() || [];
  if (!layers.length) return false;
  const master = itemId ? (entry?.items?.find?.(i => i?.id === itemId)?.masterId || null) : null;
  const wanted = [itemId, master].filter(Boolean);
  layers.forEach(l => {
    const on = !itemId || wanted.includes(l._fujiItemId) || wanted.includes(l._fujiMasterId);
    try {
      const node = l.getElement?.() || l._icon || null;
      if (node) {
        node.style.opacity = on ? '1' : '0.42';
        node.style.transition = 'opacity .22s ease, filter .22s ease';
        node.style.filter = on ? 'none' : 'saturate(.55)';
      }
      l.setZIndexOffset?.(on && itemId ? 1200 : 0);
    } catch { /* vector layers vary — the dim is cosmetic only */ }
  });
  return true;
}
