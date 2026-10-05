// Brand palette — the single place where brand colour lives in JavaScript (v17 “Sky light”).
//
// The app no longer ships a colour-theme picker: every screen uses this one
// palette, and `src/css/tokens.css` mirrors the same values for CSS. Anything
// that needs a colour in JS (member avatars, category chips, day markers,
// confetti, canvas exports) reads it from here so the two stay in sync.

export const BRAND = Object.freeze({
  name: 'Sky light',
  nameTh: 'ท้องฟ้าสว่าง',
  // primary — sky blue, both ends of the gradient
  blue: '#2f6fe4',
  blueLight: '#64a1da',
  // accent — sunset amber (never put white text on it)
  amber: '#f0ae52',
  // supporting tones from the same family
  mist: '#abc1bf',
  steel: '#639cb5',
  ink: '#374656',
  sand: '#f6efe3',
  night: '#0d0f14',
  // legacy aliases — older modules still ask for “yellow” / “navy”
  yellow: '#f0ae52',
  navy: '#374656'
});

export const BRAND_PRIMARY = BRAND.blue;
export const BRAND_PRIMARY_LIGHT = BRAND.blueLight;
export const BRAND_ACCENT = BRAND.amber;
export const BRAND_INK = BRAND.ink;

export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueLight} 100%)`;
export const BRAND_GRADIENT_DUO = `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueLight} 55%, ${BRAND.amber} 100%)`;

/** Avatar / member colours, in fallback order (harmonised with the palette). */
export const MEMBER_COLORS = [
  '#2f6fe4', // sky
  '#f0ae52', // amber
  '#639cb5', // steel
  '#3f9d94', // teal
  '#ec7666', // coral
  '#8a7ce8', // violet
  '#7fa89c', // sage
  '#e25f7d'  // rose
];

/** Swatches offered when someone makes a new expense category. */
export const CATEGORY_COLOR_CHOICES = [
  '#2f6fe4', '#64a1da', '#639cb5', '#3f9d94', '#7fa89c', '#35a06f',
  '#9ac45c', '#f0ae52', '#ef8f4e', '#ec7666', '#e25f7d', '#8a7ce8',
  '#7d8b9c', '#c9a06a'
];

/** Confetti / celebration colours. */
export const CONFETTI_COLORS = ['#2f6fe4', '#64a1da', '#f0ae52', '#abc1bf', '#639cb5', '#ec7666', '#35a06f', '#8a7ce8'];

/** Hues (deg) used for the day-number markers — mirrors the palette above. */
export const DAY_HUES = [214, 205, 196, 186, 170, 152, 128, 42, 28, 12, 350, 274];

/** Colour for member #index (never undefined — wraps around). */
export function memberColorAt(index = 0) {
  const i = Number.isFinite(Number(index)) ? Math.abs(Math.trunc(Number(index))) : 0;
  return MEMBER_COLORS[i % MEMBER_COLORS.length];
}

/** Loose check used when migrating old saved colours. */
export function isKnownBrandColor(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return false;
  return Object.values(BRAND).some(c => String(c).toLowerCase() === v)
    || MEMBER_COLORS.includes(v) || CATEGORY_COLOR_CHOICES.includes(v);
}

export default BRAND;
