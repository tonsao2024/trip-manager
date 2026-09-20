// Color utilities — resolve modern CSS color functions into plain rgb()/rgba()
// strings so canvas-based exporters (html2canvas) can parse them.
//
// Why: html2canvas 1.4.x throws
//   "Attempting to parse an unsupported color function 'color'"
// when a computed style contains color-mix(), oklch(), oklab(), lch() or lab().
// The design system uses color-mix() heavily (soft borders, tinted chips, …),
// so before an export we swap every such value for an equivalent rgb()/rgba().

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const FUNC_RE = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;

const NAMED = {
  transparent: [0, 0, 0, 0], none: [0, 0, 0, 0], currentcolor: null,
  black: [0, 0, 0, 1], white: [255, 255, 255, 1], red: [255, 0, 0, 1],
  green: [0, 128, 0, 1], blue: [0, 0, 255, 1], gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1], silver: [192, 192, 192, 1], yellow: [255, 255, 0, 1],
  orange: [255, 165, 0, 1], purple: [128, 0, 128, 1], pink: [255, 192, 203, 1]
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function parseHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some(n => isNaN(n))) return null;
  return [r, g, b, a];
}

function parseChannel(token, scale = 255) {
  const str = String(token).trim();
  if (str.endsWith('%')) return clamp(parseFloat(str) / 100, 0, 1) * scale;
  return clamp(parseFloat(str), 0, scale);
}

/**
 * Parse a plain CSS color (hex / rgb / rgba / hsl / hsla / named) → [r,g,b,a].
 * Returns null when the value is not a color we understand (e.g. gradients, URLs).
 */
export function parseColor(value) {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  if (!str || str.startsWith('url(') || str.startsWith('linear-gradient') || str.startsWith('radial-gradient')) return null;
  if (str in NAMED) {
    const named = NAMED[str];
    return named ? named.slice() : null;
  }
  if (HEX_RE.test(str)) return parseHex(str);

  const fn = str.match(/^([a-z-]+)\((.*)\)$/);
  if (!fn) return null;
  const name = fn[1];
  const body = fn[2];
  // rgb/rgba: comma or space syntax
  if (name === 'rgb' || name === 'rgba') {
    const parts = body.replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map(t => parseChannel(t));
    let a = 1;
    if (parts.length > 3) {
      const raw = parts[3];
      a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
    }
    if ([r, g, b].some(n => isNaN(n))) return null;
    return [r, g, b, isNaN(a) ? 1 : clamp(a, 0, 1)];
  }
  // hsl/hsla → convert
  if (name === 'hsl' || name === 'hsla') {
    const parts = body.replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
    const s = clamp(parts[1].endsWith('%') ? parseFloat(parts[1]) / 100 : parseFloat(parts[1]), 0, 1);
    const l = clamp(parts[2].endsWith('%') ? parseFloat(parts[2]) / 100 : parseFloat(parts[2]), 0, 1);
    let a = 1;
    if (parts.length > 3) {
      const raw = parts[3];
      a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let rgb = [0, 0, 0];
    if (hp < 1) rgb = [c, x, 0];
    else if (hp < 2) rgb = [x, c, 0];
    else if (hp < 3) rgb = [0, c, x];
    else if (hp < 4) rgb = [0, x, c];
    else if (hp < 5) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    const m = l - c / 2;
    const [r, g, b] = rgb.map(v => (v + m) * 255);
    if ([r, g, b].some(n => isNaN(n))) return null;
    return [r, g, b, isNaN(a) ? 1 : clamp(a, 0, 1)];
  }
  return null;
}

/** Split "a, b, c" on top-level commas (ignores commas inside nested parens). */
function splitTopLevel(input) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map(s => s.trim());
}

/** ["hsl(200 40% 50%)", "30%"] → { color: 'hsl(...)', percent: 30 } */
function splitColorAndPercent(token) {
  const match = String(token).trim().match(/^(.*?)\s+([\d.]+)%$/);
  if (match && !/[\d.]%$/.test(match[1].trim())) {
    return { color: match[1].trim(), percent: parseFloat(match[2]) };
  }
  return { color: String(token).trim(), percent: null };
}

/** Find the outermost "name(" call starting at index i; returns {name, args, end}. */
function readFunction(str, start) {
  const open = str.indexOf('(', start);
  if (open < 0) return null;
  const name = str.slice(start, open).trim().toLowerCase();
  let depth = 0;
  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { name, args: str.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

function toRgba([r, g, b, a]) {
  const rr = Math.round(clamp(r, 0, 255));
  const gg = Math.round(clamp(g, 0, 255));
  const bb = Math.round(clamp(b, 0, 255));
  const aa = a == null ? 1 : clamp(a, 0, 1);
  return aa >= 1 ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${Number(aa.toFixed(3))})`;
}

/** Mix two colors like CSS `color-mix(in srgb, …)` (premultiplied alpha). */
export function mixColors(colorA, percentA, colorB, percentB) {
  let pA = percentA;
  let pB = percentB;
  if (pA == null && pB == null) { pA = 50; pB = 50; }
  else if (pA == null) pA = 100 - pB;
  else if (pB == null) pB = 100 - pA;
  const sum = pA + pB;
  if (sum <= 0) return [0, 0, 0, 0];
  const wA = pA / sum;
  const wB = pB / sum;
  const alphaScale = sum > 100 ? 100 / sum : 1;
  const [r1, g1, b1, a1 = 1] = colorA;
  const [r2, g2, b2, a2 = 1] = colorB;
  const outA = a1 * wA + a2 * wB;
  const premix = (c1, c2) => {
    const num = c1 * a1 * wA + c2 * a2 * wB;
    return outA === 0 ? 0 : num / outA;
  };
  return [premix(r1, r2), premix(g1, g2), premix(b1, b2), outA * alphaScale];
}

/**
 * Resolve every color-mix() occurrence inside a CSS value.
 * `normalize` (optional) converts unknown color syntaxes (oklch, lab, …) to rgb,
 * which only a browser canvas can do — pass ctx.normalize in the browser.
 */
export function resolveColorValue(value, ctx = {}) {
  if (!value || typeof value !== 'string') return value;
  if (!value.includes('color-mix(')) {
    if (ctx.normalize && FUNC_RE.test(value.trim()) && parseColor(value) === null) {
      const normalized = ctx.normalize(value);
      if (normalized) return normalized;
    }
    return value;
  }

  let out = '';
  let i = 0;
  while (i < value.length) {
    const idx = value.toLowerCase().indexOf('color-mix(', i);
    if (idx < 0) { out += value.slice(i); break; }
    out += value.slice(i, idx);
    const call = readFunction(value, idx);
    if (!call) { out += value.slice(idx); break; }
    const parts = splitTopLevel(call.args);
    // parts[0] = "in srgb" (interpolation space)
    const colorParts = parts.slice(1);
    const a = splitColorAndPercent(colorParts[0] || '');
    const b = splitColorAndPercent(colorParts[1] || '');
    const resolveOperand = (operand) => {
      const resolved = resolveColorValue(operand.color, ctx);
      const parsed = parseColor(resolved) || (ctx.normalize ? parseColor(ctx.normalize(resolved)) : null);
      return parsed;
    };
    const ca = resolveOperand(a);
    const cb = resolveOperand(b);
    if (!ca || !cb) { out += value.slice(idx, call.end); i = call.end; continue; }
    out += toRgba(mixColors(ca, a.percent, cb, b.percent));
    i = call.end;
  }
  return out;
}

/** Best-effort converter for color syntaxes only the browser understands. */
export function makeCanvasNormalizer(win) {
  let ctx = null;
  return (cssColor) => {
    try {
      if (!ctx) {
        const canvas = win.document.createElement('canvas');
        ctx = canvas.getContext('2d');
      }
      if (!ctx) return null;
      ctx.fillStyle = '#000000';
      ctx.fillStyle = cssColor;
      const first = ctx.fillStyle;
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = cssColor;
      const second = ctx.fillStyle;
      if (first !== second) return null;                 // browser rejected the value
      if (typeof first !== 'string') return null;
      return first;
    } catch {
      return null;
    }
  };
}

const COLOR_PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'text-decoration-color',
  'caret-color', 'fill', 'stroke', 'stop-color', 'text-shadow', 'column-rule-color'
];

const NEEDS_FIX = /color-mix\(|oklch\(|oklab\(|\blab\(|\blch\(|\bcolor\(/i;

/**
 * Replace every modern color function in `root`'s subtree with an rgb()/rgba()
 * equivalent, so html2canvas can parse the styles.
 * Returns a restore() function that puts the original inline styles back.
 */
export function sanitizeColorsForExport(root, win = globalThis.window) {
  if (!root || !win?.getComputedStyle) return () => {};
  const normalize = makeCanvasNormalizer(win);
  const nodes = [root, ...root.querySelectorAll('*')];
  const restore = [];

  for (const node of nodes) {
    let computed;
    try { computed = win.getComputedStyle(node); } catch { continue; }
    if (!computed) continue;
    for (const prop of COLOR_PROPS) {
      const raw = computed.getPropertyValue(prop);
      if (!raw || !NEEDS_FIX.test(raw)) continue;
      const resolved = resolveColorValue(raw, { normalize });
      if (!resolved || resolved === raw || NEEDS_FIX.test(resolved)) continue;
      const previous = node.style.getPropertyValue(prop);
      const previousPriority = node.style.getPropertyPriority(prop);
      try {
        node.style.setProperty(prop, resolved, 'important');
        restore.push({ node, prop, previous, previousPriority });
      } catch { /* ignore */ }
    }
  }

  return () => {
    for (const { node, prop, previous, previousPriority } of restore) {
      try {
        if (previous) node.style.setProperty(prop, previous, previousPriority || '');
        else node.style.removeProperty(prop);
      } catch { /* ignore */ }
    }
  };
}
