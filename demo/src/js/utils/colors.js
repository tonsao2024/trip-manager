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
  const SENTINEL = '#010203';
  return (cssColor) => {
    try {
      if (!ctx) {
        const canvas = win.document.createElement('canvas');
        ctx = canvas.getContext('2d');
      }
      if (!ctx) return null;
      // A value the browser rejects leaves fillStyle on the sentinel — never
      // treat that as a successful conversion.
      ctx.fillStyle = SENTINEL;
      ctx.fillStyle = cssColor;
      const value = ctx.fillStyle;
      if (typeof value !== 'string' || value === SENTINEL) return null;
      return value;
    } catch {
      return null;
    }
  };
}

/**
 * Resolve ANY CSS color the browser understands into [r,g,b,a] by painting a
 * single pixel and reading it back. This is what finally kills
 * "unsupported color function 'color'": Chromium serialises color-mix()/oklch()
 * computed values as `color(srgb …)`, which html2canvas cannot parse but the
 * canvas can render exactly.
 */
export function makeCanvasColorResolver(win) {
  const cache = new Map();
  let ctx = null;
  return (cssColor) => {
    if (!cssColor) return null;
    const key = String(cssColor).trim();
    if (cache.has(key)) return cache.get(key);
    let result = null;
    try {
      if (!ctx) {
        const canvas = win.document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        ctx = canvas.getContext('2d', { willReadFrequently: true });
      }
      if (ctx) {
        // Probe: a value the browser rejects leaves fillStyle at the sentinel.
        const SENTINEL = '#010203';
        ctx.fillStyle = SENTINEL;
        ctx.fillStyle = key;
        const applied = ctx.fillStyle;
        const accepted = typeof applied === 'string' && applied !== SENTINEL;
        if (accepted) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = key;
          ctx.fillRect(0, 0, 1, 1);
          const data = ctx.getImageData(0, 0, 1, 1).data;
          result = [data[0], data[1], data[2], data[3] / 255];
        }
      }
    } catch {
      result = null;
    }
    cache.set(key, result);
    return result;
  };
}

/** Blend a translucent color over white — what html2canvas would have painted. */
function flattenOverWhite([r, g, b, a]) {
  if (a >= 1) return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  const mix = (c) => Math.round(c * a + 255 * (1 - a));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * A `backgroundColor` html2canvas can always parse.
 * `getComputedStyle(body).backgroundColor` is often `color(srgb …)` in Chromium
 * (that is how color-mix() serialises) and html2canvas throws on it, so resolve
 * it through the canvas and fall back to white.
 */
export function resolveSafeBackgroundColor(el, win = globalThis.window) {
  const fallback = 'rgb(255, 255, 255)';
  if (!el || !win?.getComputedStyle) return fallback;
  let raw = '';
  try {
    const computed = win.getComputedStyle(el);
    raw = computed?.getPropertyValue?.('background-color') || computed?.backgroundColor || '';
  } catch { return fallback; }
  if (!raw || raw === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(raw)) return fallback;
  if (!NEEDS_FIX.test(raw)) {
    const parsed = parseColor(raw);
    if (parsed) return parsed[3] >= 1 ? toRgba(parsed) : flattenOverWhite(parsed);
    return fallback;
  }
  const resolver = makeCanvasColorResolver(win);
  const resolved = resolver(raw);
  if (resolved) return resolved[3] >= 1 ? toRgba(resolved) : flattenOverWhite(resolved);
  const normalized = makeCanvasNormalizer(win)(raw);
  if (normalized && !NEEDS_FIX.test(normalized)) return normalized;
  return fallback;
}

const ANY_COLOR_FN_RE = /(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi;

/**
 * Rewrite every modern color function inside an arbitrary CSS value
 * (gradients, shadows, borders, SVG fills…) into rgb()/rgba().
 * `resolver` comes from makeCanvasColorResolver().
 */
export function rewriteColorFunctions(value, resolver, ctx = {}) {
  if (!value || typeof value !== 'string' || !resolver) return value;
  if (!ANY_COLOR_FN_RE.test(value)) return value;
  ANY_COLOR_FN_RE.lastIndex = 0;
  return value.replace(ANY_COLOR_FN_RE, (full) => {
    const parsed = parseColor(full);
    if (parsed) return toRgba(parsed);
    const resolved = resolver(full);
    if (!resolved) return full;
    // Fully transparent captures are usually a failed parse, not a real color.
    if (resolved[3] === 0 && !/transparent/i.test(full)) return full;
    return toRgba(resolved);
  });
}

const COLOR_PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'text-decoration-color',
  'caret-color', 'fill', 'stroke', 'stop-color', 'text-shadow', 'column-rule-color',
  // html2canvas parses these too — they are the ones people forget
  '-webkit-text-fill-color', '-webkit-text-stroke-color', '-webkit-text-stroke',
  'text-emphasis-color', 'border-block-start-color', 'border-block-end-color',
  'border-inline-start-color', 'border-inline-end-color', 'column-rule', 'outline',
  // shorthands html2canvas also inspects
  'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border'
];

const NEEDS_FIX = /color-mix\(|oklch\(|oklab\(|\blab\(|\blch\(|\bcolor\(|light-dark\(|color-contrast\(|device-cmyk\(/i;

/** Properties with no sensible rgb() equivalent → just drop them. */
const DROP_IF_UNRESOLVED = /shadow|background-image|filter|backdrop|mask|border-image/i;

/**
 * Values that are not plain colors and can never be converted: return `null` so
 * the caller can fall back instead of handing html2canvas something it will choke on.
 */
function safeFallbackFor(prop, resolved) {
  if (DROP_IF_UNRESOLVED.test(prop)) return prop === 'background-image' ? 'none' : 'none';
  if (/color$/i.test(prop) || prop === 'color') return resolved || 'rgb(0, 0, 0)';
  return resolved || 'rgb(0, 0, 0)';
}

/**
 * Pseudo elements (::before / ::after) cannot be patched inline and can still
 * carry `color-mix()` / `color()` values, so hand them the parent's (plain)
 * colour and drop everything gradient/shadow-like for the capture.
 * @returns {HTMLElement|null} the injected <style> (call .remove() when done)
 */
export function injectPlainPseudoSheet(win = globalThis.window) {
  const sheet = win?.document?.createElement?.('style');
  if (!sheet) return null;
  try { sheet.setAttribute('data-export-sanitizer', '1'); } catch { /* ignore */ }
  sheet.textContent = `
      *, *::before, *::after {
        -webkit-text-fill-color: currentColor !important;
        -webkit-text-stroke-color: currentColor !important;
        text-decoration-color: currentColor !important;
        column-rule-color: currentColor !important;
        outline-color: currentColor !important;
        caret-color: currentColor !important;
        text-emphasis-color: currentColor !important;
      }
      *::before, *::after {
        background-image: none !important;
        box-shadow: none !important;
        text-shadow: none !important;
        border-color: currentColor !important;
      }
    `;
  try { win.document.head?.appendChild(sheet); } catch { return sheet; }
  return sheet;
}

/**
 * Replace every modern color function in `root`'s subtree with an rgb()/rgba()
 * equivalent so html2canvas 1.4.x can parse the styles.
 *
 * Guarantees: when this resolves, NO property of any element in the captured
 * subtree (nor its ancestors, nor its ::before/::after) still contains
 * `color()`, `color-mix()`, `oklch()`, … — values that cannot be resolved are
 * degraded (shadow → none, gradient → none, color → current/black) instead of
 * being left in place, because leaving them is exactly what makes the export fail.
 *
 * @returns {() => void} restore()
 */
export function sanitizeColorsForExport(root, win = globalThis.window) {
  if (!root || !win?.getComputedStyle) return () => {};
  const normalize = makeCanvasNormalizer(win);
  const resolveCanvas = makeCanvasColorResolver(win);
  const restore = [];

  // The captured element AND its ancestors (body/html backgrounds are parsed by
  // html2canvas even when only a card is captured).
  const nodes = [root];
  for (let parent = root.parentElement; parent; parent = parent.parentElement) nodes.push(parent);
  nodes.push(...(root.querySelectorAll?.('*') || []));

  const safeValue = (prop, raw) => {
    let out = resolveColorValue(raw, { normalize });
    if (out && NEEDS_FIX.test(out)) out = rewriteColorFunctions(out, resolveCanvas);
    if (out && NEEDS_FIX.test(out)) out = resolveColorValue(out, { normalize });
    if (!out || NEEDS_FIX.test(out)) return null;
    return out;
  };

  for (const node of nodes) {
    let computed;
    try { computed = win.getComputedStyle(node); } catch { continue; }
    if (!computed) continue;
    for (const prop of COLOR_PROPS) {
      let raw = '';
      try { raw = computed.getPropertyValue(prop) || ''; } catch { continue; }
      if (!raw || !NEEDS_FIX.test(raw)) continue;
      let resolved = safeValue(prop, raw);
      if (!resolved) {
        // Unresolvable → degrade to something plain rather than leaving a
        // value html2canvas would throw on.
        const base = safeValue('color', (() => { try { return computed.getPropertyValue('color'); } catch { return ''; } })() || '');
        resolved = safeFallbackFor(prop, base);
      }
      if (!resolved || NEEDS_FIX.test(resolved)) continue;
      const previous = node.style.getPropertyValue(prop);
      const previousPriority = node.style.getPropertyPriority(prop);
      try {
        node.style.setProperty(prop, resolved, 'important');
        restore.push({ node, prop, previous, previousPriority });
      } catch { /* ignore */ }
      // Shorthand/longhand pairs: html2canvas reads the longhand, keep them in sync.
      if (prop === '-webkit-text-stroke') {
        try {
          node.style.setProperty('-webkit-text-stroke-color', resolved, 'important');
          restore.push({ node, prop: '-webkit-text-stroke-color', previous: '', previousPriority: '' });
        } catch { /* ignore */ }
      }
    }
  }

  // Pseudo elements (::before / ::after) cannot be patched inline — see below.
  const sheet = injectPlainPseudoSheet(win);

  return () => {
    try { sheet?.remove?.(); } catch { /* ignore */ }
    for (const { node, prop, previous, previousPriority } of restore) {
      try {
        if (previous) node.style.setProperty(prop, previous, previousPriority || '');
        else node.style.removeProperty(prop);
      } catch { /* ignore */ }
    }
  };
}

/* ------------------------------------------------------------------ *
 * Plain-style clone — the definitive export trick.
 *
 * html2canvas parses the *computed* styles of the captured subtree. Chromium
 * serialises every colour that came from `color-mix()`/`oklch()` as
 * `color(srgb …)`, and html2canvas throws on it ("Attempting to parse an
 * unsupported color function \"color\""). Sanitising the live element is
 * fragile: a single property no one thought of is enough to break the export.
 *
 * So before a capture we build a deep clone whose every property is written as
 * an inline `!important` declaration taken from the source's computed style —
 * with colours already converted to plain rgb()/rgba(). html2canvas then reads
 * values that WE produced, and no CSS rule (or custom property) can leak a
 * modern colour into the capture.
 * ------------------------------------------------------------------ */

/** Properties copied onto the clone (computed → inline, so rendering matches). */
const FLATTEN_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float',
  'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'text-decoration-line', 'text-indent', 'white-space',
  'word-break', 'overflow-wrap', 'text-overflow', 'vertical-align', 'opacity',
  'overflow', 'overflow-x', 'overflow-y', 'transform', 'transform-origin',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self', 'align-content', 'gap', 'row-gap', 'column-gap',
  'order', 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-column', 'grid-row',
  'list-style-type', 'border-collapse', 'border-spacing', 'table-layout',
  'object-fit', 'object-position', 'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
  'aspect-ratio', 'direction', 'visibility', 'mix-blend-mode', 'outline-width', 'outline-style', 'outline-color',
  '-webkit-text-fill-color', '-webkit-text-stroke-color', '-webkit-text-stroke-width'
];

/** Resolve one computed value to something html2canvas can always parse. */
function toPlainValue(prop, raw, { normalize, resolveCanvas }) {
  if (!raw || typeof raw !== 'string') return null;
  const isColor = /color$/i.test(prop) || prop === 'color';
  const isBgImage = prop === 'background-image';
  if (!NEEDS_FIX.test(raw)) {
    // Already plain — but still validate colours so we never pass something odd on.
    if (isColor && parseColor(raw) === null && !/^(transparent|currentcolor|inherit|none|initial|unset)$/i.test(raw)) {
      const viaCanvas = resolveCanvas(raw);
      if (viaCanvas) return toRgba(viaCanvas);
    }
    return raw;
  }
  let out = resolveColorValue(raw, { normalize });
  if (out && NEEDS_FIX.test(out)) out = rewriteColorFunctions(out, resolveCanvas);
  if (out && NEEDS_FIX.test(out)) out = resolveColorValue(out, { normalize });
  if (out && !NEEDS_FIX.test(out)) return out;
  if (isBgImage) return 'none';                     // gradients/shadows are the usual culprits
  if (prop === 'box-shadow' || prop === 'text-shadow' || prop === 'filter' || prop === 'backdrop-filter') return 'none';
  const viaCanvas = resolveCanvas(raw);
  if (viaCanvas) return toRgba(viaCanvas);
  return null;                                      // caller decides the fallback
}

/**
 * Deep-clone `root` with every computed style written inline (colours plain).
 * @returns {{node: Element, cleanup: () => void}|null}
 */
export function buildPlainClone(root, win = globalThis.window, { hidden = true } = {}) {
  if (!root || !win?.document || !root.cloneNode) return null;
  let clone;
  try { clone = root.cloneNode(true); } catch { return null; }
  const sources = [root, ...(root.querySelectorAll?.('*') || [])];
  const targets = [clone, ...(clone.querySelectorAll?.('*') || [])];
  if (sources.length !== targets.length) return null;

  const normalize = makeCanvasNormalizer(win);
  const resolveCanvas = makeCanvasColorResolver(win);

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const dst = targets[i];
    if (!dst?.style) continue;
    let cs;
    try { cs = win.getComputedStyle(src); } catch { continue; }
    if (!cs) continue;
    let css = '';
    for (const prop of FLATTEN_PROPS) {
      let raw = '';
      try { raw = cs.getPropertyValue(prop) || ''; } catch { continue; }
      if (!raw) continue;
      let value = toPlainValue(prop, raw, { normalize, resolveCanvas });
      if (value == null || value === '') {
        if (prop === 'background-color') value = 'rgba(0, 0, 0, 0)';
        else if (prop === 'background-image' || /shadow|filter/.test(prop)) value = 'none';
        else continue;
      }
      css += `${prop}:${value} !important;`;
    }
    try { dst.style.cssText = css; } catch { /* ignore */ }
    if (dst.tagName === 'CANVAS') continue;
  }

  // Rasterised canvases (map exports) must travel as images.
  try {
    for (const canvas of [...clone.querySelectorAll('canvas')]) {
      try {
        const img = win.document.createElement('img');
        img.setAttribute('src', canvas.toDataURL('image/png'));
        img.setAttribute('style', canvas.getAttribute('style') || '');
        img.className = canvas.className || '';
        canvas.replaceWith(img);
      } catch { /* keep the canvas as-is */ }
    }
  } catch { /* ignore */ }

  if (!hidden) return { node: clone, cleanup: () => {} };

  const wrap = win.document.createElement('div');
  wrap.setAttribute('data-export-clone', '1');
  wrap.setAttribute('aria-hidden', 'true');
  const width = Math.max(root.scrollWidth || 0, root.clientWidth || 0, 320);
  wrap.style.cssText = `position:fixed;left:-20000px;top:0;z-index:0;pointer-events:none;width:${width}px;`;
  wrap.appendChild(clone);
  try { win.document.body.appendChild(wrap); } catch { return null; }
  return { node: clone, cleanup: () => { try { wrap.remove(); } catch { /* ignore */ } } };
}

/**
 * Last-resort palette for a retry after html2canvas *still* complained: repaint
 * the subtree as flat cards (no gradients, no shadows, no filters) so nothing
 * modern can survive, whatever the browser serialised.
 */
export function hardPlainPalette(root, win = globalThis.window) {
  if (!root || !win?.getComputedStyle) return () => {};
  const resolveCanvas = makeCanvasColorResolver(win);
  const normalize = makeCanvasNormalizer(win);
  const nodes = [root];
  for (let parent = root.parentElement; parent; parent = parent.parentElement) nodes.push(parent);
  nodes.push(...(root.querySelectorAll?.('*') || []));
  const restore = [];
  const set = (node, prop, value) => {
    try {
      restore.push({ node, prop, previous: node.style.getPropertyValue(prop), previousPriority: node.style.getPropertyPriority(prop) });
      node.style.setProperty(prop, value, 'important');
    } catch { /* ignore */ }
  };
  const plainColor = (raw, fallback) => {
    let out = resolveColorValue(raw || '', { normalize });
    if (out && NEEDS_FIX.test(out)) out = rewriteColorFunctions(out, resolveCanvas);
    if (out && !NEEDS_FIX.test(out)) return out;
    const viaCanvas = raw ? resolveCanvas(raw) : null;
    if (viaCanvas) return toRgba(viaCanvas);
    return fallback;
  };
  for (const node of nodes) {
    let computed;
    try { computed = win.getComputedStyle(node); } catch { continue; }
    if (!computed) continue;
    const get = (p) => { try { return computed.getPropertyValue(p) || ''; } catch { return ''; } };
    set(node, 'background-image', 'none');
    set(node, 'box-shadow', 'none');
    set(node, 'text-shadow', 'none');
    set(node, 'filter', 'none');
    for (const prop of ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']) {
      const raw = get(prop);
      if (!raw) continue;
      set(node, prop, plainColor(raw, prop === 'background-color' ? 'transparent' : 'rgb(30, 30, 30)'));
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

/** Names of every property still carrying an unreadable colour (for diagnostics). */
export function findModernColors(root, win = globalThis.window) {
  if (!root || !win?.getComputedStyle) return [];
  const found = [];
  const nodes = [root];
  for (let parent = root.parentElement; parent; parent = parent.parentElement) nodes.push(parent);
  nodes.push(...(root.querySelectorAll?.('*') || []));
  for (const node of nodes) {
    let computed;
    try { computed = win.getComputedStyle(node); } catch { continue; }
    if (!computed) continue;
    for (const prop of COLOR_PROPS) {
      let raw = '';
      try { raw = computed.getPropertyValue(prop) || ''; } catch { continue; }
      if (raw && NEEDS_FIX.test(raw)) found.push(`${node.tagName?.toLowerCase() || '?'}.${prop}=${raw.slice(0, 40)}`);
    }
  }
  return found;
}

/** Does anything in this subtree still carry a color html2canvas cannot read? */
export function hasModernColors(root, win = globalThis.window) {
  if (!root || !win?.getComputedStyle) return false;
  const nodes = [root];
  for (let parent = root.parentElement; parent; parent = parent.parentElement) nodes.push(parent);
  nodes.push(...(root.querySelectorAll?.('*') || []));
  for (const node of nodes) {
    let computed;
    try { computed = win.getComputedStyle(node); } catch { continue; }
    if (!computed) continue;
    for (const prop of COLOR_PROPS) {
      let raw = '';
      try { raw = computed.getPropertyValue(prop) || ''; } catch { continue; }
      if (raw && NEEDS_FIX.test(raw)) return true;
    }
  }
  return false;
}
