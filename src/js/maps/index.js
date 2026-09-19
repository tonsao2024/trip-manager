// Maps v3 — Leaflet + free tile providers (NO API key required, ever)
// Provider order: CARTO (light: Voyager / dark: Dark Matter) → OpenStreetMap → Esri World Street Map
// If one provider's tiles fail, we automatically fall back to the next.

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

let leafletPromise = null;

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

function addTileLayerWithFallback(map, L, providerIndex = 0) {
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
    errorTileUrl: ''
  });

  layer.on('tileerror', () => {
    failedTiles++;
    // If many tiles fail on this provider, switch to the next one automatically
    if (failedTiles >= 4 && !switched && providerIndex < TILE_PROVIDERS.length - 1) {
      switched = true;
      console.warn(`[Maps] Tiles failing on ${provider.name}, falling back to ${TILE_PROVIDERS[providerIndex + 1].name}`);
      map.removeLayer(layer);
      addTileLayerWithFallback(map, L, providerIndex + 1);
    }
  });

  layer.addTo(map);
  return layer;
}

export async function initMap(containerId, options = {}) {
  const L = await loadLeaflet();
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`ไม่พบ element #${containerId}`);

  const map = L.map(containerId, {
    center: options.center || [35.3606, 138.7274],
    zoom: options.zoom || 10,
    zoomControl: true,
    scrollWheelZoom: options.scrollWheelZoom !== false
  });

  addTileLayerWithFallback(map, L);

  // Attribution styling so it blends with the theme
  const attr = map.attributionControl?.getContainer();
  if (attr) {
    attr.style.background = 'color-mix(in srgb, var(--surface) 80%, transparent)';
    attr.style.color = 'var(--text-tertiary)';
    attr.style.fontSize = '10px';
    attr.style.borderRadius = '8px';
  }
  return { map, L };
}

// Re-apply tiles matching the current light/dark theme (call after theme toggle)
export function refreshMapTheme(map, L) {
  if (!map || !L) return;
  map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });
  addTileLayerWithFallback(map, L);
}

export function addItineraryMarkers(map, L, items, dayColors) {
  const markers = [];
  const latlngs = [];
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-raw').trim() || '#6366f1';

  items.forEach((item, idx) => {
    if (!item.coordinates) return;
    const parts = String(item.coordinates).split(',').map(s => parseFloat(s.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return;
    const [lat, lng] = parts;
    latlngs.push([lat, lng]);
    const color = dayColors?.[item.date] || primary;
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:${color};display:grid;place-items:center;border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.28);"><span style="transform:rotate(45deg);color:white;font-weight:800;font-size:12px;line-height:1;">${idx + 1}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 26],
      popupAnchor: [0, -26]
    });
    const marker = L.marker([lat, lng], { icon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:inherit;min-width:140px;">
        <b style="font-size:13px;">${idx + 1}. ${item.title || ''}</b><br>
        <span style="font-size:12px;color:#555;">${item.address || ''}</span><br>
        <small style="font-size:11px;color:#888;">${item.date || ''}</small>
      </div>`);
    markers.push(marker);
  });

  if (latlngs.length > 1) {
    const polyline = L.polyline(latlngs, { color: primary, weight: 3, opacity: 0.65, dashArray: '6,8' }).addTo(map);
    markers.push(polyline);
  }
  if (latlngs.length) {
    map.fitBounds(latlngs, { padding: [48, 48] });
  }
  return markers;
}
