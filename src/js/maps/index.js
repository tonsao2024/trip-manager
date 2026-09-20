// Maps v4 — Leaflet + free tile providers (NO API key required, ever)
// Key fixes in v4:
//  • "Map container is already initialized" can never happen again — every map is
//    registered per container element and reused / destroyed safely.
//  • The container node is never wiped while a live map owns it (loading states use
//    an overlay instead), so markers always keep rendering.
//  • Auto invalidateSize on resize / when the container becomes visible.
// Provider order: CARTO (light: Voyager / dark: Dark Matter) → OpenStreetMap → Esri World Street Map

const TILE_PROVIDERS = [
  {
    name: 'CARTO',
    light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20
  },
  {
    name: 'OpenStreetMap',
    light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  },
  {
    name: 'Esri',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  }
];

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

function addTileLayerWithFallback(map, L, providerIndex = 0, entry = null) {
  const provider = TILE_PROVIDERS[Math.min(providerIndex, TILE_PROVIDERS.length - 1)];
  const dark = isDarkTheme();
  const url = dark ? provider.dark : provider.light;
  let failedTiles = 0;
  let switched = false;

  const layer = L.tileLayer(url, {
    attribution: provider.attribution,
    maxZoom: provider.maxZoom,
    subdomains: provider.name === 'OpenStreetMap' ? 'abc' : 'abcd',
    crossOrigin: true,
    errorTileUrl: '',
    detectRetina: true
  });

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
  // Keep tile layer behind markers
  layer.bringToBack?.();
  return layer;
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

  addTileLayerWithFallback(map, L, 0, entry);

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
  addTileLayerWithFallback(map, L, 0, entry);
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

  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-raw').trim() || '#6366f1';
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
    const thumb = item.imageUrl
      ? `<div class="map-popup-thumb"><img src="${escapePopupText(item.imageUrl)}" alt="" onerror="this.parentElement.style.display='none'"></div>`
      : '';
    const money = (item.estimateMinor || item.estimateAmount)
      ? `<div class="map-popup-money">≈ ${escapePopupText(item.estimateCurrency || '')} ${Number(item.estimateAmount ?? (item.estimateMinor / 100)).toLocaleString()}</div>`
      : '';
    marker.bindPopup(`
      <div class="map-popup">
        ${thumb}
        <b>${idx + 1}. ${escapePopupText(item.title || '')}</b>
        ${item.address ? `<div class="map-popup-sub">${escapePopupText(item.address)}</div>` : ''}
        ${item.startAt ? `<div class="map-popup-sub">${escapePopupText(new Date(item.startAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))}</div>` : ''}
        ${money}
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

export function focusItineraryItem(containerId, items, itemId) {
  const map = getMap(containerId);
  if (!map) return false;
  const item = (items || []).find(i => i.id === itemId);
  const pos = getItemLatLng(item);
  if (!pos) return false;
  try { map.setView([pos.lat, pos.lng], 15, { animate: true }); } catch { return false; }
  return true;
}
