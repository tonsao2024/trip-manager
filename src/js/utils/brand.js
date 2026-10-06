// Brand palette — the single place where brand colour lives in JavaScript.
//
// v18: the colour-theme picker is back (LINE / Facebook / Instagram / … + a fully
// custom palette), so the brand colours are no longer a frozen constant. The
// frozen `BRAND` object below is the DEFAULT (“Sky light”) palette and is used as
// a fallback in Node tests; inside the browser `brandPalette()` returns the theme
// that `src/js/utils/themes.js` applied to <html>, so member avatars, day pins,
// confetti, category swatches and PNG exports all match the CSS.

import { activeTheme, themeVars, getTheme, CUSTOM_THEME_ID } from './themes.js';

export const BRAND = Object.freeze({
  name: 'Sky light',
  nameTh: 'ท้องฟ้าสว่าง',
  // primary — sky blue, both ends of the gradient
  blue: '#1f6bfb',
  blueLight: '#57a6ff',
  // accent — sunset amber (never put white text on it)
  amber: '#ffb02e',
  // supporting tones from the same family
  mist: '#a9ccf0',
  steel: '#4a90d9',
  ink: '#28374d',
  sand: '#fdf3e2',
  night: '#0b1018',
  // legacy aliases — older modules still ask for “yellow” / “navy”
  yellow: '#ffb02e',
  navy: '#28374d'
});

export const BRAND_PRIMARY = BRAND.blue;
export const BRAND_PRIMARY_LIGHT = BRAND.blueLight;
export const BRAND_ACCENT = BRAND.amber;
export const BRAND_INK = BRAND.ink;

export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueLight} 100%)`;
export const BRAND_GRADIENT_DUO = `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueLight} 55%, ${BRAND.amber} 100%)`;

/** Avatar / member colours, in fallback order (harmonised with the palette). */
export const MEMBER_COLORS = [
  '#1f6bfb', '#ffb02e', '#4a90d9', '#3f9d94',
  '#ec7666', '#8a7ce8', '#7fa89c', '#e25f7d'
];

/** Swatches offered when someone makes a new expense category. */
export const CATEGORY_COLOR_CHOICES = [
  '#1f6bfb', '#57a6ff', '#4a90d9', '#3f9d94', '#7fa89c', '#35a06f',
  '#9ac45c', '#ffb02e', '#ef8f4e', '#ec7666', '#e25f7d', '#8a7ce8',
  '#7d8b9c', '#c9a06a'
];

/** Confetti / celebration colours. */
export const CONFETTI_COLORS = ['#1f6bfb', '#57a6ff', '#ffb02e', '#a9ccf0', '#4a90d9', '#ec7666', '#35a06f', '#8a7ce8'];

/** Hues (deg) used for the day-number markers — mirrors the palette above. */
export const DAY_HUES = [222, 205, 196, 186, 170, 152, 128, 42, 28, 12, 350, 274];

/* ------------------------------------------------------------------ *
 * Theme-aware accessors (use these instead of the constants above in UI code)
 * ------------------------------------------------------------------ */

function safeActiveTheme() {
  try {
    const state = activeTheme();
    if (state?.vars?.['--primary-raw']) return state;
  } catch { /* node / no localStorage */ }
  return null;
}

/** The palette currently painted on <html> (or the default brand in Node). */
export function brandPalette() {
  const state = safeActiveTheme();
  if (!state) {
    return { ...BRAND, gradient: BRAND_GRADIENT, themeId: 'sky', themeName: BRAND.name, themeNameTh: BRAND.nameTh };
  }
  const v = state.vars;
  const def = state.theme || getTheme(state.id);
  return {
    themeId: state.id,
    themeName: def?.en || BRAND.name,
    themeNameTh: def?.th || BRAND.nameTh,
    blue: v['--primary-raw'] || BRAND.blue,
    blueLight: v['--grad-2'] || BRAND.blueLight,
    amber: v['--brand-yellow-raw'] || BRAND.amber,
    mist: v['--brand-mist-raw'] || BRAND.mist,
    steel: v['--brand-steel-raw'] || BRAND.steel,
    ink: v['--brand-ink-raw'] || BRAND.ink,
    sand: v['--brand-sand-raw'] || BRAND.sand,
    night: v['--page-bg-dark'] || BRAND.night,
    gradient: v['--gradient-primary'] || BRAND_GRADIENT,
    // legacy aliases
    yellow: v['--brand-yellow-raw'] || BRAND.yellow,
    navy: v['--brand-ink-raw'] || BRAND.navy
  };
}

export function brandPrimary() { return brandPalette().blue; }
export function brandAccent() { return brandPalette().amber; }
export function brandGradient() { return brandPalette().gradient; }

/** Member colours of the active theme (falls back to the default family). */
export function memberColors() {
  const state = safeActiveTheme();
  return state?.companion?.memberColors?.length ? state.companion.memberColors : MEMBER_COLORS.slice();
}

/** Day-marker hues of the active theme. */
export function dayHues() {
  const state = safeActiveTheme();
  return state?.companion?.dayHues?.length ? state.companion.dayHues : DAY_HUES.slice();
}

/** Category swatches for the group editor. */
export function categoryColorChoices() {
  const state = safeActiveTheme();
  return state?.companion?.categoryColors?.length ? state.companion.categoryColors : CATEGORY_COLOR_CHOICES.slice();
}

export function confettiColors() {
  const state = safeActiveTheme();
  return state?.companion?.confetti?.length ? state.companion.confetti : CONFETTI_COLORS.slice();
}

/** Colour for member #index (never undefined — wraps around). */
export function memberColorAt(index = 0) {
  const list = memberColors();
  const i = Number.isFinite(Number(index)) ? Math.abs(Math.trunc(Number(index))) : 0;
  return list[i % list.length];
}

/** Loose check used when migrating old saved colours. */
export function isKnownBrandColor(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return false;
  const known = new Set([...Object.values(brandPalette()), ...memberColors(), ...categoryColorChoices()]
    .map(c => String(c).toLowerCase()));
  return known.has(v);
}

export { CUSTOM_THEME_ID, themeVars };

export default BRAND;
