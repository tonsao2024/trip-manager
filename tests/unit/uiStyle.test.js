// Unit tests — the v34 flat-style knobs (Appearance → “สไตล์หน้าจอ”).
// The CSS only reacts to data attributes, so these tests guard the contract
// between the stored preference and what is written on <html>.
import {
  UI_STYLE_KEY, UI_STYLE_DEFAULTS, RADIUS_OPTIONS, DENSITY_OPTIONS, DEPTH_OPTIONS,
  normalizeUiStyle, readUiStyle, saveUiStyle, applyUiStyle, setUiStyle, resetUiStyle, uiStyleLabel
} from '../../src/js/utils/uiStyle.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** A tiny stand-in for <html> so the module can be tested without a DOM. */
function fakeRoot() {
  return { dataset: {} };
}

export function testDefaultsAreFlat() {
  const style = normalizeUiStyle(undefined);
  assert(style.radius === 'soft', 'the default corners are soft');
  assert(style.density === 'regular', 'the default density is regular');
  assert(style.depth === 'flat', 'the default has no elevation');
  assert(JSON.stringify(style) === JSON.stringify(UI_STYLE_DEFAULTS), 'defaults are the exported constant');
}

export function testBadValuesCannotPoisonThePage() {
  const style = normalizeUiStyle({ radius: 'banana', density: 42, depth: '<script>' });
  assert(style.radius === 'soft' && style.density === 'regular' && style.depth === 'flat',
    'unknown values fall back to the defaults');
}

export function testOptionsAreUniqueAndComplete() {
  for (const [name, list] of [['radius', RADIUS_OPTIONS], ['density', DENSITY_OPTIONS], ['depth', DEPTH_OPTIONS]]) {
    assert(list.length >= 2, `${name} offers a choice`);
    const ids = list.map(o => o.id);
    assert(new Set(ids).size === ids.length, `${name} ids are unique`);
    for (const o of list) {
      assert(o.th && o.en, `${name}/${o.id} is labelled in Thai and English`);
      assert(o.hint?.th && o.hint?.en, `${name}/${o.id} explains itself in both languages`);
    }
  }
}

export function testApplyWritesDataset() {
  const root = fakeRoot();
  const applied = applyUiStyle({ radius: 'sharp', density: 'compact', depth: 'soft' }, root);
  assert(root.dataset.radius === 'sharp' && root.dataset.density === 'compact' && root.dataset.depth === 'soft',
    'the style lands on the element dataset (what flat.css reads)');
  assert(applied.radius === 'sharp', 'apply returns the normalised style');
}

export function testSaveAndReadRoundTrip() {
  try { localStorage.removeItem(UI_STYLE_KEY); } catch { /* ignore */ }
  assert(readUiStyle().density === 'regular', 'an empty store reads as the defaults');
  const next = saveUiStyle({ density: 'roomy' });
  assert(next.density === 'roomy', 'save returns the merged style');
  assert(readUiStyle().density === 'roomy', 'the saved density is read back');
  const stored = JSON.parse(localStorage.getItem(UI_STYLE_KEY) || '{}');
  assert(stored.radius === 'soft' && stored.depth === 'flat', 'a partial patch keeps the other keys');
  assert(setUiStyle({ radius: 'round' }).radius === 'round', 'setUiStyle persists in one call');
  const root = fakeRoot();
  resetUiStyle(root);
  assert(root.dataset.radius === 'soft' && !localStorage.getItem(UI_STYLE_KEY),
    'reset clears storage and repaints the defaults');
}

export function testCorruptStorageNeverThrows() {
  try { localStorage.setItem(UI_STYLE_KEY, '{not json'); } catch { /* ignore */ }
  const style = readUiStyle();
  assert(style.radius === 'soft' && style.depth === 'flat', 'corrupt storage falls back quietly');
  try { localStorage.removeItem(UI_STYLE_KEY); } catch { /* ignore */ }
}

export function testLabelsFollowLanguage() {
  const th = uiStyleLabel({ radius: 'sharp', density: 'compact', depth: 'soft' }, 'th');
  const en = uiStyleLabel({ radius: 'sharp', density: 'compact', depth: 'soft' }, 'en');
  assert(th.radius === 'คม' && en.radius === 'Sharp', 'radius label is localised');
  assert(th.density === 'กะทัดรัด' && en.density === 'Compact', 'density label is localised');
  assert(th.depth === 'เงานุ่ม' && en.depth === 'Soft', 'depth label is localised');
}
