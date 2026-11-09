// Unit tests — design rules from docs/UNSLOP-AUDIT-2026-11-08.md that can be
// checked from the source alone (round 5). The rendered checks — contrast,
// touch targets, Thai line-heights, labels — live in tests/browser/design-check.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { linkFormLabels, nameIconControls, nameBareFields, enhanceA11y, observeA11y } from '../../src/js/utils/a11y.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const root = path.resolve(import.meta.dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const STYLESHEETS = ['src/css/tokens.css', 'src/css/components.css', 'src/css/refresh.css', 'src/css/animations.css', 'src/css/flat.css'];
const inlineStyle = () => (read('index.html').match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');

/** Every transition / animation declaration in the hand-written CSS. */
function motionDeclarations() {
  const out = [];
  const sources = [...STYLESHEETS.map((f) => [f, read(f)]), ['index.html <style>', inlineStyle()]];
  for (const [file, css] of sources) {
    for (const m of css.matchAll(/(?<![-\w])(transition|animation)(?:-timing-function)?\s*:\s*([^;{}]+)/g)) {
      out.push({ file, prop: m[1], value: m[2].trim() });
    }
  }
  return out;
}

export function testOneEasingCurve() {
  const css = read('src/css/tokens.css');
  assert(/--ease:\s*cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/.test(css), 'tokens.css defines the one curve as --ease');
  const stray = motionDeclarations().filter(({ prop, value }) => {
    // looping indicators (spinner, progress shimmer) keep their own rhythm
    if (prop === 'animation' && /\binfinite\b/.test(value)) return false;
    return /(?<![-\w])ease(?:-in-out|-in|-out)?(?![-\w])|cubic-bezier\(/.test(value);
  });
  assert(!stray.length, `every transition uses var(--ease): ${stray.slice(0, 4).map((d) => `${d.file} → ${d.value}`).join(' | ')}`);
  for (const file of ['src/js/components/modal.js', 'src/js/components/toast.js']) {
    const js = read(file);
    assert(!/style\.(?:transition|animation) = '[^']*(?:(?<![-\w])ease(?![-\w])|cubic-bezier)/.test(js), `${file}: inline motion uses var(--ease)`);
  }
}

export function testNoTransitionAll() {
  const all = motionDeclarations().filter(({ prop, value }) => prop === 'transition' && /(^|,)\s*all\b/.test(value));
  assert(!all.length, `no transition: all (${all.map((d) => d.file).join(', ')})`);
}

export function testReceiptPaperKeepsLightInk() {
  const flat = read('src/css/flat.css');
  const block = flat.match(/\.receipt,\s*\.itin-sheet\s*\{([^}]*)\}/);
  assert(block, 'the white receipt / itinerary paper re-declares its ink tokens');
  for (const token of ['--text', '--text-secondary', '--text-tertiary', '--success', '--danger', '--on-primary']) {
    assert(new RegExp(`${token}\\s*:`).test(block[1]), `the paper declares ${token}`);
  }
  assert(/--text-tertiary:\s*#6b6b6b/.test(block[1]), 'the paper uses the light tertiary ink (5.3:1 on white)');
  const sources = [read('src/css/components.css'), read('src/css/refresh.css'), flat, read('src/js/app.js')].join('\n');
  assert(!/#9ca3af/i.test(sources), 'the 2.5:1 grey #9ca3af is gone from the receipts');
}

export function testThaiMonoNeverBold() {
  // IBM Plex Mono has no Thai and the rules cap Mono at 500.
  const comp = read('src/css/components.css');
  const rule = comp.match(/\.notify-status-value\s*\{([^}]*)\}/);
  assert(rule && /font-weight:\s*500/.test(rule[1]) && !/font-mono/.test(rule[1]), 'notification status words use the sans face at 500');
  const refresh = read('src/css/refresh.css');
  const amount = refresh.match(/\.debt-row-amount\s*\{([^}]*)\}/);
  assert(amount && /font-weight:\s*500/.test(amount[1]), 'debt amounts (mono) stay at 500');
}

/* ------------------------------ a11y pass ------------------------------ */

function dom(html) {
  const { window } = new JSDOM(`<!doctype html><body>${html}</body>`);
  return window.document;
}

export function testLabelsPointAtTheirField() {
  const doc = dom(`
    <div class="input-group"><label class="input-label">ชื่อ</label><input class="input"></div>
    <div class="input-group"><label class="input-label">โน้ต</label><textarea></textarea></div>
    <div class="input-group"><label class="input-label">มีอยู่แล้ว</label><input id="keep"></div>
    <div class="input-group"><label class="input-label" for="other">ตั้งไว้แล้ว</label><input id="mine"></div>`);
  const linked = linkFormLabels(doc.body);
  assert(linked === 3, `three labels are linked (got ${linked})`);
  const [name, note, keep] = doc.querySelectorAll('.input-group');
  assert(name.querySelector('input').labels.length === 1, 'the label names the input that follows it');
  assert(note.querySelector('textarea').labels.length === 1, 'textareas are linked too');
  assert(keep.querySelector('label').htmlFor === 'keep', 'an existing id is reused');
  assert(doc.querySelector('label[for="other"]'), 'a label that already has for= is left alone');
  assert(linkFormLabels(doc.body) === 0, 'running the pass twice changes nothing');
}

export function testLabelsNeverGuessPastAnotherControl() {
  const doc = dom(`
    <div class="input-group"><label class="input-label">แบ่งแบบ</label><div role="radiogroup"><input type="radio" name="s"></div></div>
    <div class="input-group"><label class="input-label">ยืนยัน</label><input type="checkbox"></div>
    <div class="input-group"><label class="input-label">สกุล</label><button type="button">THB</button><input></div>`);
  assert(linkFormLabels(doc.body) === 0, 'segmented choices, checkboxes and buttons are not guessed');
}

export function testDuplicateIdsFallBackToLabelledby() {
  // Two copies of one form (a sheet re-opened over a closing one) share ids:
  // for="it-date" would name the first copy, so the second copy is pointed at its label.
  const doc = dom(`
    <div class="input-group" id="g1"><label class="input-label">วันที่</label><input id="it-date"></div>
    <div class="input-group" id="g2"><label class="input-label">วันที่</label><input id="it-date"></div>`);
  linkFormLabels(doc.getElementById('g1'));
  linkFormLabels(doc.getElementById('g2'));
  const second = doc.querySelector('#g2 input');
  const label2 = doc.querySelector('#g2 label');
  assert(doc.querySelector('#g1 input').labels.length === 1, 'the first copy is linked with for=');
  assert(!label2.hasAttribute('for'), 'the second label does not point at the first copy');
  assert(label2.id && second.getAttribute('aria-labelledby') === label2.id, 'the second copy is named through aria-labelledby');
}

export function testIconButtonsGetTheirTooltipAsName() {
  const doc = dom(`
    <button id="a" title="ปิด"><svg></svg></button>
    <button id="b" title="ลบ">ลบรายการ</button>
    <button id="c" title="แก้ไข" aria-label="แก้ไขรายการ"><svg></svg></button>
    <a id="d" href="#x" title="เปิดแผนที่"><svg></svg></a>`);
  assert(nameIconControls(doc.body) === 2, 'only the icon-only controls are named');
  assert(doc.getElementById('a').getAttribute('aria-label') === 'ปิด', 'the tooltip becomes the accessible name');
  assert(!doc.getElementById('b').hasAttribute('aria-label'), 'a button with words keeps its words');
  assert(doc.getElementById('c').getAttribute('aria-label') === 'แก้ไขรายการ', 'an explicit aria-label wins');
  assert(doc.getElementById('d').getAttribute('aria-label') === 'เปิดแผนที่', 'icon links are named too');
}

export function testBareFieldsFallBackToPlaceholder() {
  const doc = dom(`
    <input id="s" placeholder="ค้นหา…">
    <label for="n">ชื่อ</label><input id="n" placeholder="เช่น สมชาย">
    <input id="c" type="checkbox" placeholder="x">
    <input id="e">`);
  assert(nameBareFields(doc.body) === 1, 'only the unlabelled text field is named');
  assert(doc.getElementById('s').getAttribute('aria-label') === 'ค้นหา…', 'the placeholder becomes the name');
  assert(!doc.getElementById('n').hasAttribute('aria-label'), 'a labelled field is left alone');
  assert(!doc.getElementById('e').hasAttribute('aria-label'), 'no placeholder → nothing invented');
}

export async function testObserverFixesLaterMarkup() {
  const { window } = new JSDOM('<!doctype html><body><main id="app"></main></body>');
  const prev = globalThis.MutationObserver;
  globalThis.MutationObserver = window.MutationObserver;
  try {
    const doc = window.document;
    const observer = observeA11y(doc.body);
    assert(observer, 'an observer is returned');
    doc.getElementById('app').innerHTML = '<div class="form-group"><label>วันที่</label><input type="date"></div><button title="เพิ่ม"><svg></svg></button>';
    await new Promise((r) => setTimeout(r, 0));
    assert(doc.querySelector('input[type="date"]').labels.length === 1, 'a sheet rendered later gets its label linked');
    assert(doc.querySelector('button').getAttribute('aria-label') === 'เพิ่ม', 'and its icon button named');
    observer.disconnect();
  } finally {
    globalThis.MutationObserver = prev;
  }
  assert(enhanceA11y(null) === 0, 'no root → no work, no throw');
}
