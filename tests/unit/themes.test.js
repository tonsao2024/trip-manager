// v18 — the colour-theme registry (the palettes came back: LINE / Facebook /
// Instagram / … + per-user custom colours and a vividness slider).
import {
  normalizeHex, hexToRgb, rgbToHex, mix, lighten, darken, intensify, rotate, contrastInk,
  THEMES, themeList, getTheme, themeName, DEFAULT_THEME_ID, CUSTOM_THEME_ID, CUSTOM_DEFAULTS,
  buildCustomPalette, paletteCompanion, themeVars, readStoredTheme, saveTheme, applyTheme, resetTheme,
  THEME_STORAGE_KEY
} from '../../src/js/utils/themes.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const HEX = /^#[0-9a-f]{6}$/;

export function testColourMaths() {
  assert(normalizeHex('#FFF') === '#ffffff', 'short hex is expanded');
  assert(normalizeHex('  #1F6BFB ') === '#1f6bfb', 'trimmed and lower-cased');
  assert(normalizeHex('rebeccapurple', '#000000') === '#000000', 'names are rejected with the fallback');
  assert(normalizeHex('#12345') === '', 'malformed hex has no default');
  assert(normalizeHex('#12g456', '#ffffff') === '#ffffff', 'non-hex digits are rejected');

  const rgb = hexToRgb('#1f6bfb');
  assert(rgb[0] === 31 && rgb[1] === 107 && rgb[2] === 251, 'hexToRgb decodes');
  assert(rgbToHex(rgb) === '#1f6bfb', 'the round trip is lossless');
  assert(hexToRgb('nope') === null, 'bad input is null, never a throw');

  assert(mix('#000000', 50, '#ffffff') === '#808080', 'a half mix is mid grey');
  assert(mix('#ff0000', 100, '#00ff00') === '#ff0000', '100% keeps A');
  assert(mix('#ff0000', 0, '#00ff00') === '#00ff00', '0% keeps B');
  assert(mix('junk', 50, '#ff0000') === '#ff0000', 'a broken A still returns a colour');
  assert(HEX.test(lighten('#2f6fe4', 30)) && HEX.test(darken('#2f6fe4', 30)), 'lighten/darken emit hex');
  assert(rotate('#ff0000', 120) !== '#ff0000', 'a hue rotation changes the colour');
  assert(HEX.test(rotate('#ff0000', 999)), 'absurd angles still produce a colour');

  assert(contrastInk('#ffffff') === '#14202e', 'white needs dark ink');
  assert(contrastInk('#1f6bfb') === '#ffffff', 'a saturated blue needs white');
  assert(contrastInk('#ffb02e') === '#14202e', 'amber needs dark ink');
  console.log('✓ colour maths');
}

export function testIntensify() {
  const washed = '#9fb6cc';
  const chroma = (hex) => { const [r, g, b] = hexToRgb(hex); return Math.max(r, g, b) - Math.min(r, g, b); };
  const soft = intensify(washed, 0);
  const punchy = intensify(washed, 100);
  assert(chroma(punchy) > chroma(soft), 'the vividness slider really makes colours punchier');
  assert(HEX.test(soft) && HEX.test(punchy), 'output is always a hex colour');
  assert(intensify('#1f6bfb', 60) !== '', 'a theme colour survives the pass');
  assert(intensify('not-a-colour') === 'not-a-colour', 'garbage is passed through untouched');
  assert(intensify('#1f6bfb', 500) === intensify('#1f6bfb', 100), 'the slider is clamped');
  console.log('✓ intensify (ความสดใส)');
}

export function testThemeRegistry() {
  assert(THEMES.length >= 12, `there should be a dozen palettes, got ${THEMES.length}`);
  const ids = THEMES.map(t => t.id);
  assert(new Set(ids).size === ids.length, 'theme ids are unique');
  for (const wanted of ['sky', 'line', 'facebook', 'insta', CUSTOM_THEME_ID]) {
    assert(ids.includes(wanted), `the ${wanted} theme must exist`);
  }
  assert(DEFAULT_THEME_ID === 'sky' && getTheme('does-not-exist').id === 'sky', 'unknown ids fall back to the default');
  assert(themeName('line', 'th') !== themeName('line', 'en'), 'names are translated');

  const REQUIRED = ['--primary-raw', '--grad-1', '--grad-2', '--brand-yellow-raw', '--brand-ink-raw',
    '--page-bg', '--page-bg-dark', '--on-primary'];
  for (const t of THEMES) {
    for (const key of REQUIRED) {
      assert(typeof t.vars[key] === 'string' && t.vars[key], `${t.id} is missing ${key}`);
    }
    assert(HEX.test(t.vars['--primary-raw']), `${t.id} must publish a raw hex (no color-mix() in the theme layer)`);
    assert(HEX.test(t.vars['--page-bg']) && HEX.test(t.vars['--page-bg-dark']), `${t.id} must ship both page backgrounds`);
    assert(HEX.test(t.vars['--on-primary']), `${t.id} must say which ink sits on the brand colour`);
    assert(t.th && t.en, `${t.id} needs both names`);
  }
  assert(themeList().length === THEMES.length && themeList() !== THEMES, 'themeList is a copy');
  console.log(`✓ ${THEMES.length} themes registered`);
}

export function testCustomPalette() {
  const vars = buildCustomPalette({ primary: '#7C3AED', accent: '#22C55E', intensity: 88 });
  assert(HEX.test(vars['--primary-raw']), 'the custom primary is a valid hex');
  assert(vars['--grad-1'] === vars['--primary-raw'], 'the gradient starts at the brand colour');
  assert(vars['--fuji-theme'] === 'custom', 'the applied theme is tagged');
  assert(/^linear-gradient\(/.test(vars['--gradient-primary']), 'the gradient var stays a gradient');
  for (const [k, v] of Object.entries(vars)) {
    if (k === '--gradient-primary' || k === '--fuji-theme') continue;
    assert(HEX.test(v), `buildCustomPalette produced ${k}=${v} (must be hex)`);
  }
  const fallbacks = buildCustomPalette({ primary: 'nonsense', accent: null });
  assert(fallbacks['--primary-raw'] === intensify(CUSTOM_DEFAULTS.primary, CUSTOM_DEFAULTS.intensity),
    'a broken colour picker value falls back to the default brand');
  console.log('✓ buildCustomPalette');

  const companion = paletteCompanion(vars);
  assert(companion.memberColors.length === 8, 'eight member colours');
  assert(companion.memberColors.every(c => HEX.test(c)), 'member colours are hex');
  assert(companion.dayHues.length === 16, 'day hues cover a fortnight');
  assert(companion.categoryColors.length === 14, 'category swatches');
  assert(companion.confetti.includes(companion.accent) || companion.confetti.length === 9, 'confetti follows the palette');
  assert(new Set(companion.dayHues.slice(0, 8)).size >= 4, 'the day colours are actually different hues');
}

export function testThemeStorageAndApply() {
  const root = fakeRoot();
  const line = THEMES.find(t => t.id === 'line');
  const state = applyTheme('line', null, root);
  assert(state.id === 'line' && state.theme.id === 'line', 'applyTheme returns the state');
  assert(root.props['--primary-raw'] === line.vars['--primary-raw'], 'the vars are written on the root element');
  assert(root.attrs['data-color'] === 'line', 'the theme is tagged for the CSS');
  assert(state.companion.memberColors.length === 8, 'the companion palette is derived for JS');

  assert(saveTheme({ id: 'line', custom: { primary: '#abcdef' } }) === true, 'the choice is stored');
  const stored = readStoredTheme();
  assert(stored.id === 'line', 'the choice is read back');
  assert(stored.custom.primary === '#abcdef', 'custom colours survive the round trip');

  localStorage.setItem(THEME_STORAGE_KEY, '{oops not json');
  assert(readStoredTheme().id === DEFAULT_THEME_ID, 'corrupt storage cannot break the boot');
  localStorage.setItem(THEME_STORAGE_KEY, '"line"');
  assert(readStoredTheme().id === 'line', 'a bare id (older builds) is still understood');
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ id: 'hackme', custom: { primary: '<script>' } }));
  const guarded = readStoredTheme();
  assert(guarded.id === DEFAULT_THEME_ID, 'an unknown id cannot be injected');
  assert(HEX.test(guarded.custom.primary), 'a hostile colour is sanitised before it reaches the stylesheet');

  resetTheme(root);
  assert(root.props['--primary-raw'] === null, 'reset clears the painted properties');
  assert(localStorage.getItem(THEME_STORAGE_KEY) === null, 'reset forgets the choice');
  assert(themeVars('nope')['--fuji-theme'] === DEFAULT_THEME_ID, 'themeVars falls back too');
  console.log('✓ read / save / apply / reset');
}

function fakeRoot() {
  const props = {}, attrs = {};
  return {
    props, attrs,
    style: {
      setProperty(k, v) { props[k] = v; },
      removeProperty(k) { props[k] = null; }
    },
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; }
  };
}
