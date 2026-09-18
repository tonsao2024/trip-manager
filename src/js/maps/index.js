let leafletPromise = null;

export async function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise(async (resolve, reject) => {
    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    try {
      const L = await import('https://esm.sh/leaflet@1.9.4');
      resolve(L);
    } catch (e) {
      reject(e);
    }
  });
  return leafletPromise;
}

export async function initMap(containerId, options = {}) {
  const Lmod = await loadLeaflet();
  const L = Lmod.default || Lmod;
  const map = L.map(containerId, {
    center: options.center || [35.3606, 138.7274],
    zoom: options.zoom || 10,
    zoomControl: true
  });
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  L.tileLayer(tileUrl, {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);
  return { map, L };
}

export function addItineraryMarkers(map, L, items, dayColors) {
  const markers = [];
  const latlngs = [];
  items.forEach((item, idx) => {
    if (!item.coordinates) return;
    const parts = item.coordinates.split(',').map(s => parseFloat(s.trim()));
    if (parts.length !== 2 || isNaN(parts[0])) return;
    const [lat, lng] = parts;
    latlngs.push([lat, lng]);
    const color = dayColors?.[item.date] || '#6366f1';
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:white;display:grid;place-items:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${idx + 1}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const marker = L.marker([lat, lng], { icon }).addTo(map);
    marker.bindPopup(`<b>${item.title}</b><br>${item.address || ''}<br><small>${item.date}</small>`);
    markers.push(marker);
  });
  if (latlngs.length > 1) {
    const polyline = L.polyline(latlngs, { color: '#8b5cf6', weight: 3, opacity: 0.6, dashArray: '6,6' }).addTo(map);
    // Note: This is not real routing, just connection line
    markers.push(polyline);
  }
  if (latlngs.length) {
    map.fitBounds(latlngs, { padding: [40, 40] });
  }
  return markers;
}
