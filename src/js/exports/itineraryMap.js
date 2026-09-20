// Itinerary sheet (the PNG export) — pure markup builders.
//
// Kept in its own module so the *real* generated sheet can be rendered and
// captured in a browser during development (see tests/browser/export-check.mjs),
// not just structurally asserted in jsdom.
import { escapeHtml } from '../utils/sanitize.js';

const STATUS_TONE_DEFAULT = '#2563eb';

/**
 * Self-contained mini-map: no tiles, no CORS, always renders in the PNG.
 *
 * The pins are SVG (numbers render with any font) while the place names are
 * returned as HTML labels: inline SVG is rasterised through an <img> during the
 * export, where @font-face rules do not apply, so SVG text would fall back to a
 * font without Thai glyphs and show up as empty boxes.
 *
 * @param {Array<{title:string,date:string,lat:number,lng:number}>} placed
 * @param {{dayColors?:Object, width?:number, height?:number}} [options]
 * @returns {{svg:string, html:string}}
 */
export function schematicMap(placed, { dayColors = {}, width = 1000, height = 430 } = {}) {
  const W = width, H = height, pad = 62;
  if (!placed?.length) return { svg: '', html: '' };
  const lats = placed.map(p => p.lat), lngs = placed.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = Math.max(0.0008, maxLat - minLat), spanLng = Math.max(0.0008, maxLng - minLng);
  const point = (p) => ({
    x: pad + ((p.lng - minLng) / spanLng) * (W - pad * 2),
    y: H - pad - ((p.lat - minLat) / spanLat) * (H - pad * 2)
  });
  const pts = placed.map((p, i) => ({ ...point(p), i, item: p }));

  const grid = [];
  for (let x = pad; x <= W - pad + 1; x += (W - pad * 2) / 6) {
    grid.push(`<line x1="${x.toFixed(1)}" y1="${(pad / 2).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(H - pad / 2).toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`);
  }
  for (let y = pad / 2; y <= H - pad / 2 + 1; y += (H - pad) / 4) {
    grid.push(`<line x1="${(pad / 2).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(W - pad / 2).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`);
  }
  const route = pts.length > 1
    ? `<polyline points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="7 6" stroke-linejoin="round"/>`
    : '';
  const pins = pts.map((p) => {
    const colour = dayColors[p.item.date] || STATUS_TONE_DEFAULT;
    return `
      <g>
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="15" fill="${colour}" opacity="0.96"/>
        <text x="${p.x.toFixed(1)}" y="${(p.y + 4.5).toFixed(1)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#ffffff">${p.i + 1}</text>
      </g>`;
  }).join('');

  // Place names must stay readable even when two stops are close together:
  // nudge a label down (or up) until it no longer overlaps one already placed.
  const placedLabels = [];
  const labels = [...pts]
    .sort((a, b) => a.x - b.x)
    .map((p) => {
      let py = p.y;
      for (let guard = 0; guard < 10; guard++) {
        const clashLabel = placedLabels.some(l => Math.abs(l.x - p.x) < 190 && Math.abs(l.y - py) < 22);
        // Do not let a name sit on top of another pin (its own pin is fine).
        const clashPin = pts.some(q => q !== p && Math.abs(q.x - p.x) < 150 && Math.abs(q.y - py) < 20);
        if (!clashLabel && !clashPin) break;
        py = p.y + 24 * (guard % 2 === 0 ? 1 : -1) * (1 + Math.floor(guard / 2));
      }
      placedLabels.push({ x: p.x, y: py });
      return {
        x: (p.x / W) * 100,
        y: (Math.min(H - 16, Math.max(16, py)) / H) * 100,
        flip: p.x > W - 210,
        text: String(p.item.title || '').slice(0, 30)
      };
    })
    .sort((a, b) => a.y - b.y);

  const svg = `<svg class="schematic" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="plan sketch">
      <rect width="${W}" height="${H}" fill="#f8fafc"/>
      ${grid.join('')}
      ${route}
      ${pins}
    </svg>`;
  const html = labels
    .map(l => `<span class="itin-sheet-pin-label${l.flip ? ' is-flipped' : ''}" style="left:${l.x.toFixed(2)}%;top:${l.y.toFixed(2)}%;">${escapeHtml(l.text)}</span>`)
    .join('');
  return { svg, html };
}

/** Coordinates string → {lat,lng} (returns null when it is not a usable pair). */
export function parseLatLng(coordinates) {
  if (typeof coordinates !== 'string') return null;
  const m = coordinates.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
