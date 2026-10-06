/* ================================================================== *
 * Colour themes (v18) — the “ชุดสี” picker that v17 removed.
 *
 * A theme only ever writes the BRAND raw colour variables on <html>
 * (`--primary-raw`, `--grad-1`, `--grad-2`, `--brand-yellow-raw`, …) plus the
 * page background of each mode. Every other shade in the app is derived from
 * those inside `src/css/tokens.css` with `color-mix()`, so light mode, dark
 * mode, cards, chips, maps and PNG exports all follow the theme at once.
 *
 * The JS side (member avatars, day markers, confetti, category swatches) reads
 * the same numbers through `activeTheme()` / `themePalette()` below, which keeps
 * `src/js/utils/brand.js` and the CSS in sync.
 *
 * Storage: localStorage `fuji_color_theme` → { id, custom: { primary, accent,
 * ink, intensity } }. `id === 'custom'` uses the values in `custom`.
 * ================================================================== */

export const THEME_STORAGE_KEY = 'fuji_color_theme';
export const CUSTOM_THEME_ID = 'custom';
const MAX_CUSTOM_COLORS = 24;

/* ------------------------------ colour helpers ----------------------------- */

const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export function normalizeHex(value, fallback = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return fallback;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const to2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
export function rgbToHex(rgb) {
  const [r, g, b] = rgb;
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** percentage mix (percentA = how much of A). */
export function mix(hexA, pctA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a) return normalizeHex(hexB, '#000000');
  if (!b) return normalizeHex(hexA, '#000000');
  const w = clamp(pctA / 100);
  return rgbToHex([a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w), a[2] * w + b[2] * (1 - w)]);
}

export const lighten = (hex, amount) => mix(hex, 100 - amount, '#ffffff');
export const darken = (hex, amount) => mix(hex, 100 - amount, '#000000');

function toHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 0 };
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

function fromHsl({ h, s, l }) {
  // h is degrees, s and l are FRACTIONS (0…1) — exactly what toHsl returns.
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clamp(s), ll = clamp(l);
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return rgbToHex([v, v, v]);
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return rgbToHex([
    Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hh) * 255),
    Math.round(hue2rgb(p, q, hh - 1 / 3) * 255)
  ]);
}

/**
 * “ความสดใส” — push a colour towards vivid: more saturation, a slightly higher
 * lightness, never muddy. `intensity` 0 = soft / 100 = punchy (default 60).
 */
export function intensify(hex, intensity = 60) {
  const clean = normalizeHex(hex);
  if (!clean) return hex;
  const { h, s, l } = toHsl(clean);
  const k = clamp(Number(intensity) / 100, 0, 1);
  // v18.1: push saturation and lightness much higher for a vivid, lively look
  const target = 0.62 + 0.36 * k;             // saturation ceiling (higher = more vivid)
  const boost = s + (target - s) * (0.42 + 0.58 * k);
  const light = l + (0.50 - l) * (0.28 * k);   // nudge towards the most vivid lightness
  return fromHsl({ h, s: clamp(boost, 0.22, 1), l: clamp(light, 0.20, 0.78) });
}

/** Rotate a hue by `deg` (used to build a coherent companion palette). */
export function rotate(hex, deg, { sat = null, light = null } = {}) {
  const clean = normalizeHex(hex);
  if (!clean) return hex;
  const hsl = toHsl(clean);
  return fromHsl({
    h: hsl.h + deg,
    s: sat == null ? hsl.s : clamp(sat),
    l: light == null ? hsl.l : clamp(light)
  });
}

/** Readable text colour for a solid background (white or near-black ink). */
export function contrastInk(hex, lightInk = '#ffffff', darkInk = '#14202e') {
  const rgb = hexToRgb(hex);
  if (!rgb) return lightInk;
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.62 ? darkInk : lightInk;
}

/* --------------------------------- themes --------------------------------- */

/**
 * Every theme provides the brand raws; everything else in the app is derived.
 *   vars:            CSS custom properties written on <html>
 *   companion:       JS-side colour families (avatars, day pins, confetti)
 */
function theme(def) {
  const primary = normalizeHex(def.primary, '#2f6fe4');
  return {
    id: def.id,
    th: def.th,
    en: def.en,
    hint: def.hint || '',
    swatch: def.swatch || [primary, def.soft || lighten(primary, 42), def.accent || '#f0ae52'],
    gradient: def.gradient || '',
    brand: def.brand || 'solid',   // solid | duo | rainbow
    primary,
    accent: normalizeHex(def.accent, '#f0ae52'),
    ink: normalizeHex(def.ink, '#2b3a4c'),
    vars: {
      '--primary-raw': primary,
      '--grad-1': normalizeHex(def.grad1, primary),
      '--grad-2': normalizeHex(def.grad2, lighten(primary, 34)),
      '--brand-yellow-raw': normalizeHex(def.accent, '#f0ae52'),
      '--brand-ink-raw': normalizeHex(def.ink, '#2b3a4c'),
      '--brand-mist-raw': normalizeHex(def.mist, mix(primary, 22, '#e9f1fb')),
      '--brand-steel-raw': normalizeHex(def.steel, rotate(primary, 18, { sat: 0.4, light: 0.55 })),
      '--brand-sand-raw': normalizeHex(def.sand, mix(def.accent || '#f0ae52', 22, '#ffffff')),
      '--page-bg': normalizeHex(def.bg, mix(primary, 5, '#ffffff')),
      '--page-bg-dark': normalizeHex(def.bgDark, mix(primary, 12, '#0c0f15')),
      '--on-primary': def.onPrimary || contrastInk(primary),
      // an empty string means “keep the tokens.css default”
      '--gradient-primary': def.gradient || ''
    },
    companion: def.companion || null
  };
}

export const THEMES = [
  theme({
    id: 'sky', th: 'ฟ้าใส (ค่าเริ่มต้น)', en: 'Sky light (default)',
    hint: 'ฟ้า–เหลืองอบอุ่น แบบแอปเดินทางยุคใหม่',
    primary: '#0f5ef5', grad2: '#3d96ff', accent: '#ffa020',
    mist: '#8ec0f0', steel: '#3a82d4', sand: '#fdf3e2', ink: '#28374d',
    bg: '#f2f8ff', bgDark: '#0b1018',
    gradient: 'linear-gradient(135deg, #0f5ef5 0%, #3d96ff 55%, #7ec4ff 100%)'
  }),
  theme({
    id: 'line', th: 'ธีมไลน์ (LINE)', en: 'LINE green',
    hint: 'เขียวไลน์ สดใสเป็นมิตร อ่านง่าย',
    primary: '#0b9e4b', grad1: '#06c755', grad2: '#3ddc84', accent: '#ffd93d',
    mist: '#a9e8c4', steel: '#22a6b8', sand: '#f0fbf3', ink: '#0f2c1d',
    bg: '#f1fbf4', bgDark: '#08120c',
    gradient: 'linear-gradient(135deg, #06c755 0%, #2fd873 60%, #8ef0b0 100%)'
  }),
  theme({
    id: 'facebook', th: 'ธีมเฟซบุ๊ก', en: 'Facebook blue',
    hint: 'น้ำเงินคลาสสิก ตัดด้วยเหลืองอ่อน',
    primary: '#1877f2', grad2: '#4d9dff', accent: '#f7b32b',
    mist: '#b9d4f7', steel: '#5b8def', sand: '#eef4ff', ink: '#14263f',
    bg: '#f1f6ff', bgDark: '#0a1120',
    gradient: 'linear-gradient(135deg, #1877f2 0%, #4d9dff 60%, #9cc6ff 100%)'
  }),
  theme({
    id: 'insta', th: 'ธีมไอจี (Instagram)', en: 'Instagram',
    hint: 'ชมพู–ม่วง–ส้ม ไล่สีแบบไอจี',
    primary: '#d6297b', grad1: '#f5613c', grad2: '#b9257f', accent: '#ffd166',
    mist: '#f6cfe4', steel: '#8a5fbf', sand: '#fff0f6', ink: '#3b1230',
    bg: '#fff4f9', bgDark: '#150a13',
    gradient: 'linear-gradient(135deg, #feda75 0%, #fa7e1e 22%, #d62976 55%, #962fbf 80%, #4f5bd5 100%)',
    brand: 'rainbow'
  }),
  theme({
    id: 'sakura', th: 'ซากุระ', en: 'Sakura',
    hint: 'ชมพูอ่อนนุ่มละมุน ตัดกับทอง',
    primary: '#e8467d', grad2: '#ff92bb', accent: '#ffcf5c',
    mist: '#f6c3d6', steel: '#c07bb0', sand: '#fff3f7', ink: '#3d1224',
    bg: '#fff5f9', bgDark: '#160a10',
    gradient: 'linear-gradient(135deg, #ff6fa5 0%, #e8467d 55%, #ff9ec4 100%)'
  }),
  theme({
    id: 'matcha', th: 'มัทฉะ', en: 'Matcha',
    hint: 'เขียวมัทฉะสงบ ตัดด้วยส้มอุ่น',
    primary: '#2f9e6e', grad2: '#6fcf97', accent: '#f4a261',
    mist: '#bfe3cf', steel: '#4b9a8a', sand: '#f6f7ec', ink: '#17301f',
    bg: '#f2fbf5', bgDark: '#0a1512',
    gradient: 'linear-gradient(135deg, #2f9e6e 0%, #57c48c 60%, #a8e6bd 100%)'
  }),
  theme({
    id: 'sea', th: 'ทะเลใต้', en: 'Deep sea',
    hint: 'ฟ้าเขียวน้ำทะเล สดชื่น',
    primary: '#0aa2c0', grad2: '#48cae4', accent: '#ffb703',
    mist: '#a9e0ea', steel: '#2f7fbf', sand: '#eefaf9', ink: '#0a2b33',
    bg: '#eefaff', bgDark: '#06161b',
    gradient: 'linear-gradient(135deg, #0093b8 0%, #24b6d8 55%, #7fe0ef 100%)'
  }),
  theme({
    id: 'grape', th: 'องุ่นม่วง', en: 'Grape',
    hint: 'ม่วงลาเวนเดอร์ พร้อมเหลืองเลมอน',
    primary: '#6d4df6', grad2: '#a78bfa', accent: '#fde047',
    mist: '#cfc3f7', steel: '#7f8bd8', sand: '#f6f2ff', ink: '#241a4d',
    bg: '#f6f4ff', bgDark: '#100c1f',
    gradient: 'linear-gradient(135deg, #6d4df6 0%, #9271ff 55%, #c4b2ff 100%)'
  }),
  theme({
    id: 'sunset', th: '夕阳 / ซันเซ็ต', en: 'Sunset',
    hint: 'ส้มทองอบอุ่น เหมือนพระอาทิตย์ตก',
    primary: '#f2662c', grad2: '#ff9f68', accent: '#ffcf5c',
    mist: '#f6c9a8', steel: '#d97b6c', sand: '#fff3e6', ink: '#3f1c0c',
    bg: '#fff6ef', bgDark: '#180d08',
    gradient: 'linear-gradient(135deg, #ff8a3d 0%, #f2662c 45%, #ffd166 100%)'
  }),
  theme({
    id: 'berry', th: 'เบอร์รี่', en: 'Berry',
    hint: 'แดงเบอร์รี่เข้ม ตัดด้วยครีม',
    primary: '#d81e5b', grad2: '#ff6b8e', accent: '#ffd166',
    mist: '#f2b8c6', steel: '#a4506b', sand: '#fff1f2', ink: '#3c0a1c',
    bg: '#fff3f5', bgDark: '#170710',
    gradient: 'linear-gradient(135deg, #ff4d79 0%, #d81e5b 55%, #ff9db2 100%)'
  }),
  theme({
    id: 'cocoa', th: 'โกโก้', en: 'Cocoa',
    hint: 'น้ำตาลอุ่น คาราเมล สบายตา',
    primary: '#9c6a45', grad2: '#c49468', accent: '#e9b949',
    mist: '#ddc6b0', steel: '#8f7a68', sand: '#f8efe4', ink: '#2c1c12',
    bg: '#fbf5ee', bgDark: '#131009',
    gradient: 'linear-gradient(135deg, #b17d52 0%, #9c6a45 55%, #dcb98a 100%)'
  }),
  theme({
    id: 'mint', th: 'มินต์', en: 'Mint',
    hint: 'เขียวมินต์สว่าง คู่ส้มสดใส',
    primary: '#12a37f', grad2: '#5eead4', accent: '#fb923c',
    mist: '#b5ecdc', steel: '#3f9d94', sand: '#eefbf6', ink: '#0c2a22',
    bg: '#effcf8', bgDark: '#07140f',
    gradient: 'linear-gradient(135deg, #0fbf95 0%, #12a37f 50%, #6ee7c8 100%)'
  }),
  theme({
    id: 'night', th: 'พลูโต้อินดิโก', en: 'Indigo night',
    hint: 'น้ำเงินเข้มหรูหรา ตัดด้วยฟ้าอ่อน',
    primary: '#3548b8', grad2: '#6a7fe8', accent: '#7dd3fc',
    mist: '#b3bdf0', steel: '#5a6bb0', sand: '#eef0ff', ink: '#131a3a',
    bg: '#f1f3ff', bgDark: '#080b18',
    gradient: 'linear-gradient(135deg, #3548b8 0%, #5a70e0 55%, #9db4ff 100%)'
  }),
  theme({
    id: CUSTOM_THEME_ID, th: 'กำหนดเอง…', en: 'Custom',
    hint: 'เลือกสีเองได้ทั้งหมด (primary / accent / ความสดใส)',
    primary: '#2f6fe4', grad2: '#64a1da', accent: '#f0ae52'
  })
];

export const DEFAULT_THEME_ID = 'sky';

export function themeList() { return THEMES.slice(); }

export function getTheme(id) {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

export function themeName(id, lang = 'th') {
  const t = getTheme(id);
  return lang === 'th' ? t.th : t.en;
}

/* ---------------------------- custom theme palette ---------------------------- */

export const CUSTOM_DEFAULTS = Object.freeze({ primary: '#1f6bfb', accent: '#ffb02e', intensity: 72, ink: '' });

/**
 * Build a whole palette from two user colours + a “ความสดใส” slider.
 * Pure function → unit-tested in tests/unit/themes.test.js.
 */
export function buildCustomPalette(custom = {}) {
  const primaryRaw = normalizeHex(custom.primary, CUSTOM_DEFAULTS.primary);
  const accentRaw = normalizeHex(custom.accent, CUSTOM_DEFAULTS.accent);
  const intensity = Number.isFinite(Number(custom.intensity)) ? clamp(Number(custom.intensity), 0, 100) : CUSTOM_DEFAULTS.intensity;
  const primary = intensify(primaryRaw, intensity);
  const accent = intensify(accentRaw, intensity);
  const ink = normalizeHex(custom.ink, '') || darken(primary, 55);
  return {
    '--primary-raw': primary,
    '--grad-1': primary,
    '--grad-2': mix(primary, 62, '#ffffff'),
    '--brand-yellow-raw': accent,
    '--brand-ink-raw': ink,
    '--brand-mist-raw': mix(primary, 24, '#eaf2fb'),
    '--brand-steel-raw': rotate(primary, 20, { sat: 0.42, light: 0.55 }),
    '--brand-sand-raw': mix(accent, 20, '#ffffff'),
    '--page-bg': mix(primary, 6, '#ffffff'),
    '--page-bg-dark': mix(primary, 14, '#0b0f16'),
    '--on-primary': contrastInk(primary),
    '--gradient-primary': `linear-gradient(135deg, ${primary} 0%, ${mix(primary, 62, '#ffffff')} 100%)`,
    '--fuji-theme': 'custom',
    '--fuji-primary': primary,
    '--fuji-accent': accent
  };
}

/** Companion colour families (JS side) for a palette. */
export function paletteCompanion(vars) {
  const primary = vars['--primary-raw'] || '#2f6fe4';
  const accent = vars['--brand-yellow-raw'] || '#f0ae52';
  const steel = vars['--brand-steel-raw'] || '#639cb5';
  const base = [primary, accent, steel,
    rotate(primary, 132, { sat: 0.5, light: 0.44 }),
    rotate(primary, -28, { sat: 0.62, light: 0.55 }),
    rotate(primary, 250, { sat: 0.58, light: 0.6 }),
    rotate(primary, 74, { sat: 0.36, light: 0.5 }),
    rotate(primary, 190, { sat: 0.55, light: 0.5 })];
  const member = base.map(c => normalizeHex(c, primary)).slice(0, MAX_CUSTOM_COLORS);
  const hues = base.map(c => Math.round(toHsl(c).h));
  return {
    memberColors: member,
    categoryColors: [...member.slice(0, 8), ...member.slice(0, 6).map(c => lighten(c, 18))],
    confetti: [...member, lighten(accent, 24)],
    dayHues: hues.concat(hues.map(h => (h + 34) % 360)),
    primary, accent, steel, ink: vars['--brand-ink-raw'] || '#2b3a4c'
  };
}

/** Full CSS var map for a theme id + custom values. */
export function themeVars(id = DEFAULT_THEME_ID, custom = null) {
  if (id === CUSTOM_THEME_ID || id === 'custom') {
    const vars = buildCustomPalette(custom || {});
    return vars;
  }
  const t = getTheme(id);
  const vars = { ...t.vars, '--fuji-theme': t.id };
  return vars;
}

/* ------------------------------- store + apply ------------------------------- */

export function readStoredTheme() {
  let raw = null;
  try { raw = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* private mode */ }
  if (!raw) return { id: DEFAULT_THEME_ID, custom: { ...CUSTOM_DEFAULTS } };
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = { id: String(raw) }; }
  // Older builds stored a bare id ("line"); a corrupt value must never poison the boot.
  const wanted = typeof parsed === 'string' ? parsed : (parsed?.id ?? raw);
  const id = THEMES.some(t => t.id === wanted) ? wanted : DEFAULT_THEME_ID;
  const custom = { ...CUSTOM_DEFAULTS, ...(parsed?.custom || {}) };
  // sanitise the user colours so a bad value can never poison the stylesheet
  custom.primary = normalizeHex(custom.primary, CUSTOM_DEFAULTS.primary);
  custom.accent = normalizeHex(custom.accent, CUSTOM_DEFAULTS.accent);
  custom.intensity = clamp(Number(custom.intensity) || 0, 0, 100);
  return { id, custom };
}

export function saveTheme(state) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ id: state.id, custom: state.custom }));
    return true;
  } catch { return false; }
}

let ACTIVE = null;

/** The theme currently applied (falls back to the default palette). */
export function activeTheme() {
  if (ACTIVE) return ACTIVE;
  const stored = readStoredTheme();
  const vars = themeVars(stored.id, stored.custom);
  ACTIVE = { ...stored, vars, theme: getTheme(stored.id), companion: paletteCompanion(vars) };
  return ACTIVE;
}

/**
 * Paint the theme on an element (usually `document.documentElement`).
 * @returns {{id:string, custom:object, vars:object, theme:object, companion:object}}
 */
export function applyTheme(id = null, custom = null, root = null) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
  const stored = readStoredTheme();
  const nextId = id || stored.id;
  const nextCustom = { ...stored.custom, ...(custom || {}) };
  const vars = themeVars(nextId, nextCustom);
  const state = { id: nextId, custom: nextCustom, vars, theme: getTheme(nextId), companion: paletteCompanion(vars) };
  if (el) {
    for (const [key, value] of Object.entries(vars)) {
      if (value) el.style.setProperty(key, value);
      else el.style.removeProperty(key);
    }
    el.setAttribute('data-color', nextId);
  }
  ACTIVE = state;
  return state;
}

/** Re-apply whatever is stored (boot, mode switch, demo start-up). */
export function applyStoredTheme(root = null) {
  const stored = readStoredTheme();
  return applyTheme(stored.id, stored.custom, root);
}

/** Clear a theme (used by tests / “คืนค่าชุดสีเดิม”). */
export function resetTheme(root = null) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (el) {
    const defaults = themeVars(DEFAULT_THEME_ID, CUSTOM_DEFAULTS);
    for (const key of Object.keys(defaults)) el.style.removeProperty(key);
    el.removeAttribute('data-color');
  }
  try { localStorage.removeItem(THEME_STORAGE_KEY); } catch { /* ignore */ }
  ACTIVE = null;
}

export default THEMES;
