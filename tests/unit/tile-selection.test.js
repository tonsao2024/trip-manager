// Unit tests — the “selected tile” look, checked from the source.
//
// Owner report: Members → กลุ่มย่อยในทริป, “เมื่อเลือกสมาชิกแล้วระบบไม่ไฮไลต์สีให้
// ว่าเลือกไปแล้ว”. The cause was CSS specificity: `flat.css` (loaded after
// `components.css`) declared `.tile:hover` — 0,2,0 — while the selected state was
// a lone `.tile-selected` — 0,1,0 — so a picked member stayed painted like a
// hovered one. `material.css` only ever restyled the expense form.
//
// tests/browser/tile-selection-check.mjs measures the painted pixels in Chromium;
// these checks keep the rule itself from regressing without a browser.
import fs from 'node:fs';
import path from 'node:path';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const root = path.resolve(import.meta.dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flat = read('src/css/flat.css');

/** Every declaration block whose selector list contains `needle`. */
function blocks(css, needle) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').some(sel => sel.trim() === needle || sel.trim().split(/\s+/).includes(needle))) {
      out.push({ selector: m[1].trim(), body: m[2] });
    }
  }
  return out;
}

export function testSelectedTileBeatsHover() {
  // Specificity: .tile.tile-selected (0,2,0) ties .tile:hover (0,2,0) and wins by
  // coming later; the :hover form must be listed after the plain state.
  const selected = flat.match(/\.tile\.tile-selected,\s*\n\.tile\.tile-selected:hover\s*\{([^}]*)\}/);
  assert(selected, 'flat.css declares .tile.tile-selected together with its :hover state');
  assert(/background:\s*color-mix\(/.test(selected[1]), 'the selected tile paints a tinted fill');
  assert(/border-color:\s*var\(--primary-strong\)/.test(selected[1]), 'the selected tile paints a stronger hairline');
  const selIndex = flat.indexOf('.tile.tile-selected');
  const hoverIndex = flat.indexOf('.tile:hover');
  assert(hoverIndex > -1 && selIndex > hoverIndex, '.tile:hover is declared before the selected state');
}

export function testSelectedTileShowsATick() {
  const tick = flat.match(/\.tile-grid \.tile\.tile-selected::after\s*\{([^}]*)\}/);
  assert(tick, 'a selected tile in a tile-grid draws a ::after marker');
  assert(/content:\s*"✓"/.test(tick[1]), 'the marker is a tick, not colour alone');
  assert(/display:\s*grid/.test(tick[1]) && /position:\s*absolute/.test(tick[1]), 'the tick is laid over the tile');
  // The plain state hides it, so an unselected tile never shows a marker.
  const hidden = flat.match(/\.tile\.tile-selected::after\s*\{\s*display:\s*none;\s*\}/);
  assert(hidden, 'the tick is hidden until the tile is selected');
  assert(/\.tile-grid \.tile\s*\{\s*padding-right:\s*\d+px/.test(flat), 'tiles reserve the gap the tick sits in');
}

export function testPendingTileKeepsItsDash() {
  assert(/\.tile\.tile-pending\.tile-selected\s*\{[^}]*border-style:\s*dashed/.test(flat),
    'a selected “no payer yet” tile keeps its dashed edge');
}

export function testOwnerPickerUsesTheSameState() {
  const app = read('src/js/app.js');
  assert(/doc-owner-tiles/.test(app), 'the document form has an owner picker');
  assert(/data-owner-pick="\$\{escapeHtml\(m\.id\)\}"/.test(app), 'every trip member is a pickable tile');
  assert(/aria-pressed="\$\{picked\.has/.test(app), 'owner tiles expose their state to assistive tech');
  assert(/btn\.classList\.toggle\('tile-selected', on\)/.test(app), 'picking an owner toggles .tile-selected');
  assert(/#group-tiles \[data-member\]/.test(app), 'the sub-group form still selects members with tiles');
}

export function testExpensePickerStillWins() {
  // material.css loads last and keeps the expense form's own tint; that rule must
  // stay at least as specific as the new shared one (0,4,0 vs 0,2,0).
  const material = read('src/css/material.css');
  assert(/\.expense-form \.tile-grid \.tile\.tile-selected/.test(material), 'the expense form keeps its own selected rule');
  const index = read('index.html');
  const flatAt = index.indexOf('flat.css');
  const materialAt = index.indexOf('material.css');
  assert(flatAt > -1 && materialAt > flatAt, 'material.css still loads after flat.css');
}
