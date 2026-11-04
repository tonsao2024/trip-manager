/* ==================================================================
 * UI style (v34) — “ปรับแต่งหน้าตาได้ง่าย”
 *
 * The flat design has three knobs that change the WHOLE app at once. They are
 * plain attributes on <html> (`data-radius`, `data-density`, `data-depth`) that
 * src/css/flat.css turns into variables, so a new preset never needs a
 * component edit — add one row here and one block in the stylesheet.
 *
 * Storage: localStorage `fuji_ui_style` → { radius, density, depth }.
 * index.html applies the stored values before the first paint (no flash); this
 * module is what the Settings UI uses to read/change them live.
 * ================================================================== */

export const UI_STYLE_KEY = 'fuji_ui_style';

export const UI_STYLE_DEFAULTS = Object.freeze({
  radius: 'soft',
  density: 'regular',
  depth: 'flat'
});

/** Corner radius presets. `id` is what lands in data-radius. */
export const RADIUS_OPTIONS = Object.freeze([
  { id: 'sharp', th: 'คม', en: 'Sharp', hint: { th: 'มุมเหลี่ยม อ่านง่ายแบบตาราง', en: 'Square corners, table-like' } },
  { id: 'soft', th: 'นุ่มนวล', en: 'Soft', hint: { th: 'ค่าเริ่มต้น — มุมโค้งเล็กน้อย', en: 'Default — lightly rounded' } },
  { id: 'round', th: 'กลม', en: 'Round', hint: { th: 'มุมโค้งมาก ดูเป็นมิตร', en: 'Very rounded, friendly' } }
]);

/** Spacing / control-height presets. */
export const DENSITY_OPTIONS = Object.freeze([
  { id: 'compact', th: 'กะทัดรัด', en: 'Compact', hint: { th: 'เห็นข้อมูลมากขึ้นบนจอเดียว', en: 'Fits more on one screen' } },
  { id: 'regular', th: 'มาตรฐาน', en: 'Regular', hint: { th: 'ค่าเริ่มต้น — สมดุล', en: 'Default — balanced' } },
  { id: 'roomy', th: 'โปร่ง', en: 'Roomy', hint: { th: 'ปุ่มใหญ่ขึ้น ระยะห่างมากขึ้น', en: 'Bigger targets, more air' } }
]);

/** Shadow presets. */
export const DEPTH_OPTIONS = Object.freeze([
  { id: 'flat', th: 'แบนสนิท', en: 'Flat', hint: { th: 'ไม่มีเงา ใช้เส้นขอบแบ่งชั้น', en: 'No shadows, borders only' } },
  { id: 'soft', th: 'เงานุ่ม', en: 'Soft', hint: { th: 'เพิ่มเงาบาง ๆ ใต้การ์ด', en: 'A light shadow under cards' } }
]);

const ALLOWED = {
  radius: RADIUS_OPTIONS.map(o => o.id),
  density: DENSITY_OPTIONS.map(o => o.id),
  depth: DEPTH_OPTIONS.map(o => o.id)
};

const pick = (value, list, fallback) => (list.includes(String(value)) ? String(value) : fallback);

/** Normalise anything (corrupt storage, partial patch) into a complete style. */
export function normalizeUiStyle(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    radius: pick(src.radius, ALLOWED.radius, UI_STYLE_DEFAULTS.radius),
    density: pick(src.density, ALLOWED.density, UI_STYLE_DEFAULTS.density),
    depth: pick(src.depth, ALLOWED.depth, UI_STYLE_DEFAULTS.depth)
  };
}

/** Read the saved style (never throws — private mode returns the defaults). */
export function readUiStyle() {
  try {
    const raw = localStorage.getItem(UI_STYLE_KEY);
    if (!raw) return { ...UI_STYLE_DEFAULTS };
    return normalizeUiStyle(JSON.parse(raw));
  } catch {
    return { ...UI_STYLE_DEFAULTS };
  }
}

/** Merge a partial patch into the stored style and persist it. */
export function saveUiStyle(patch = {}) {
  const next = normalizeUiStyle({ ...readUiStyle(), ...patch });
  try { localStorage.setItem(UI_STYLE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

/** Write the style onto <html> (the CSS does the rest). */
export function applyUiStyle(style = readUiStyle(), root = null) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
  const next = normalizeUiStyle(style);
  if (el && el.dataset) {
    el.dataset.radius = next.radius;
    el.dataset.density = next.density;
    el.dataset.depth = next.depth;
  }
  return next;
}

/** Apply + persist in one call (what the Settings panel uses). */
export function setUiStyle(patch = {}, root = null) {
  const next = saveUiStyle(patch);
  applyUiStyle(next, root);
  return next;
}

/** Back to “soft / regular / flat”. */
export function resetUiStyle(root = null) {
  try { localStorage.removeItem(UI_STYLE_KEY); } catch { /* ignore */ }
  return applyUiStyle({ ...UI_STYLE_DEFAULTS }, root);
}

/** The style currently painted on <html> (falls back to storage). */
export function activeUiStyle() {
  if (typeof document === 'undefined' || !document.documentElement?.dataset) return readUiStyle();
  const d = document.documentElement.dataset;
  return normalizeUiStyle({
    radius: d.radius || readUiStyle().radius,
    density: d.density || readUiStyle().density,
    depth: d.depth || readUiStyle().depth
  });
}

/** Label lookup used by the Settings panel + the “current look” summary. */
export function uiStyleLabel(style = readUiStyle(), lang = 'th') {
  const wanted = normalizeUiStyle(style);
  const find = (options, id) => options.find(o => o.id === id) || options[0];
  return {
    radius: find(RADIUS_OPTIONS, wanted.radius)[lang === 'th' ? 'th' : 'en'],
    density: find(DENSITY_OPTIONS, wanted.density)[lang === 'th' ? 'th' : 'en'],
    depth: find(DEPTH_OPTIONS, wanted.depth)[lang === 'th' ? 'th' : 'en']
  };
}

export default {
  UI_STYLE_KEY, UI_STYLE_DEFAULTS, RADIUS_OPTIONS, DENSITY_OPTIONS, DEPTH_OPTIONS,
  normalizeUiStyle, readUiStyle, saveUiStyle, applyUiStyle, setUiStyle, resetUiStyle,
  activeUiStyle, uiStyleLabel
};
