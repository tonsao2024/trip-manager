// Canvas exporters (html2canvas) cannot parse color-mix()/oklch() — these helpers
// rewrite them into rgb()/rgba() before an export runs.
import {
  parseColor, mixColors, resolveColorValue, sanitizeColorsForExport,
  resolveSafeBackgroundColor, hardPlainPalette, hasModernColors, makeCanvasColorResolver
} from '../../src/js/utils/colors.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${a}, expected ${b})`);

export function testColors() {
  console.log('Testing export color sanitizer...');

  eq(parseColor('#8bb89a').join(','), '139,184,154,1', 'hex → rgba');
  eq(parseColor('#fff').join(','), '255,255,255,1', 'short hex');
  eq(parseColor('rgba(10, 20, 30, 0.5)').join(','), '10,20,30,0.5', 'rgba');
  eq(parseColor('rgb(10 20 30 / 25%)').join(','), '10,20,30,0.25', 'space + percent alpha');
  eq(Math.round(parseColor('hsl(0, 100%, 50%)')[0]), 255, 'hsl red');
  eq(parseColor('transparent').join(','), '0,0,0,0', 'transparent');
  eq(parseColor('linear-gradient(red, blue)'), null, 'gradients are not colors');
  console.log('✓ parseColor');

  eq(mixColors([0, 0, 0, 1], 50, [255, 255, 255, 1], 50).slice(0, 3).map(Math.round).join(','), '128,128,128', '50/50 black-white');
  const faded = mixColors([255, 0, 0, 1], 30, [0, 0, 0, 0], null);
  assert(Math.abs(faded[3] - 0.3) < 0.01, 'mixing with transparent keeps 30% alpha');
  console.log('✓ mixColors');

  const one = resolveColorValue('color-mix(in srgb, #8bb89a 30%, transparent)');
  assert(/^rgba\(/.test(one), `mix(#8bb89a 30%, transparent) → rgba (got ${one})`);
  eq(resolveColorValue('color-mix(in srgb, #000 50%, #fff)'), 'rgb(128, 128, 128)', 'opaque mix → rgb');
  const nested = resolveColorValue('radial-gradient(circle, color-mix(in srgb, #8bb89a 25%, transparent), transparent 65%)');
  assert(!nested.includes('color-mix('), 'nested mixes inside gradients are rewritten');
  eq(resolveColorValue('color-mix(in srgb, var(--x) 30%, var(--y))'), 'color-mix(in srgb, var(--x) 30%, var(--y))', 'unresolvable var() mixes left untouched');
  eq(resolveColorValue('oklch(70% 0.1 150)', { normalize: () => 'rgb(120, 190, 150)' }), 'rgb(120, 190, 150)', 'oklch normalized via canvas');
  eq(resolveColorValue('rgb(1, 2, 3)'), 'rgb(1, 2, 3)', 'plain colors pass through');
  console.log('✓ resolveColorValue');

  // sanitizeColorsForExport walks a (fake) element tree
  const styles = {
    'background-color': 'color-mix(in srgb, #8bb89a 20%, transparent)',
    color: 'rgb(20, 20, 20)',
    'border-top-color': 'oklch(0.7 0.1 150)'
  };
  const written = [];
  const node = {
    style: {
      getPropertyValue: () => '',
      getPropertyPriority: () => '',
      setProperty: (p, v) => written.push([p, v]),
      removeProperty: () => {}
    },
    querySelectorAll: () => []
  };
  const win = {
    document: { createElement: () => ({ getContext: () => ({ set fillStyle(v) {}, get fillStyle() { return 'rgb(120, 190, 150)'; } }) }) },
    getComputedStyle: () => ({ getPropertyValue: (p) => styles[p] || '' })
  };
  const restore = sanitizeColorsForExport(node, win);
  assert(written.some(([p, v]) => p === 'background-color' && v.startsWith('rgba(')), 'background-color rewritten');
  assert(written.some(([p, v]) => p === 'border-top-color' && v.startsWith('rgb(120, 190, 150)')), 'oklch rewritten through the canvas');
  assert(!written.some(([p]) => p === 'color'), 'plain colors untouched');
  assert(typeof restore === 'function', 'restore() returned');
  console.log('✓ sanitizeColorsForExport');

  // --- v9.1: the export pipeline must NEVER leave a modern color behind -----
  const fakeWin = (computed, { canvasOk = true, canvasColor = 'rgb(120, 190, 150)' } = {}) => {
    const written = [];
    const nodes = [];
    const makeNode = () => {
      const node = {
        style: {
          getPropertyValue: () => '',
          getPropertyPriority: () => '',
          setProperty: (p, v) => written.push([p, v]),
          removeProperty: () => {}
        },
        querySelectorAll: () => [],
        parentElement: null
      };
      nodes.push(node);
      return node;
    };
    const win = {
      document: {
        createElement: () => ({
          getContext: () => ({
            set fillStyle(v) { this._v = v; },
            get fillStyle() { return canvasOk ? canvasColor : '#010203'; },
            clearRect() {}, fillRect() {},
            getImageData: () => ({ data: [120, 190, 150, 255] })
          })
        }),
        head: { appendChild: (n) => nodes.push(n) }
      },
      getComputedStyle: () => ({ getPropertyValue: (p) => computed[p] || '' })
    };
    return { win, written, nodes, makeNode };
  };

  {
    // a `color(srgb …)` body background must become a plain rgb() for html2canvas
    const { win } = fakeWin({ 'background-color': 'color(srgb 0.55 0.72 0.6)' });
    eq(resolveSafeBackgroundColor({}, win), 'rgb(120, 190, 150)', 'color() background resolved via canvas');
    const plain = fakeWin({ 'background-color': 'rgb(10, 20, 30)' });
    eq(resolveSafeBackgroundColor({}, plain.win), 'rgb(10, 20, 30)', 'plain background passes through');
    const translucent = fakeWin({ 'background-color': 'rgba(0, 0, 0, 0.5)' });
    eq(resolveSafeBackgroundColor({}, translucent.win), 'rgb(128, 128, 128)', 'translucent background flattened over white');
    const none = fakeWin({ 'background-color': 'transparent' });
    eq(resolveSafeBackgroundColor({}, none.win), 'rgb(255, 255, 255)', 'transparent → white, never null');
    const broken = fakeWin({ 'background-color': 'color(srgb 0.5 0.5 0.5)' }, { canvasOk: false });
    eq(resolveSafeBackgroundColor({}, broken.win), 'rgb(255, 255, 255)', 'unresolvable → white (html2canvas never sees color())');
    console.log('✓ resolveSafeBackgroundColor');
  }

  {
    // unresolvable values must be DEGRADED, not left in place
    const { win, written, makeNode } = fakeWin({
      'background-image': 'color-mix(in srgb, var(--x) 30%, var(--y))',
      'box-shadow': '0 2px 4px color(srgb 0.1 0.2 0.3 / 0.4)',
      color: 'rgb(20, 20, 20)'
    }, { canvasOk: false });
    const node = makeNode();
    const restore = sanitizeColorsForExport(node, win);
    const bg = written.find(([p]) => p === 'background-image');
    const shadow = written.find(([p]) => p === 'box-shadow');
    assert(bg && bg[1] === 'none', 'unresolvable gradient → background-image: none');
    assert(shadow && shadow[1] === 'none', 'unresolvable shadow → none');
    assert(!written.some(([, v]) => /color-mix\(|color\(/i.test(v)), 'nothing modern is written back');
    assert(typeof restore === 'function', 'restore() returned');
    console.log('✓ sanitizeColorsForExport degrades unresolvable values');
  }

  {
    // hard fallback for the retry: gradients/shadows/filters off, colors plain
    const { win, written, makeNode } = fakeWin({
      'background-image': 'linear-gradient(color(srgb 0.1 0.2 0.3), color(srgb 0.3 0.2 0.1))',
      'box-shadow': '0 0 0 color(srgb 0 0 0)',
      filter: 'blur(2px)',
      color: 'color(srgb 0.1 0.1 0.1)'
    });
    const node = makeNode();
    hardPlainPalette(node, win);
    assert(written.some(([p, v]) => p === 'background-image' && v === 'none'), 'hard palette kills gradients');
    assert(written.some(([p, v]) => p === 'box-shadow' && v === 'none'), 'hard palette kills shadows');
    assert(written.some(([p, v]) => p === 'filter' && v === 'none'), 'hard palette kills filters');
    console.log('✓ hardPlainPalette');
  }

  {
    const { win, makeNode } = fakeWin({ color: 'color(srgb 0.1 0.2 0.3)' });
    const node = makeNode();
    assert(hasModernColors(node, win) === true, 'detects modern colors');
    const clean = fakeWin({ color: 'rgb(1, 2, 3)' });
    assert(hasModernColors(clean.makeNode(), clean.win) === false, 'clean tree reported clean');
    const resolver = makeCanvasColorResolver(fakeWin({}, { canvasOk: false }).win);
    eq(resolver('color(srgb 0.1 0.2 0.3)'), null, 'rejected values resolve to null, not black');
    console.log('✓ hasModernColors + resolver validity');
  }

  console.log('All color tests passed');
}
