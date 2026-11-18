import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const modalSource = read('src/js/components/modal.js');
const confirmSource = read('src/js/components/confirm.js');
const flatCss = read('src/css/flat.css');
const appSource = read('src/js/app.js');

function assert(condition, message) { if (!condition) throw new Error(message); }

// v44 (owner: “ทุก popup ทุกหน้า ต้องมีปุ่มกากบาทปิดมุมขวาบน”): the ✕ is created by the
// two popup constructors, so every sheet and every dialog in the app inherits it —
// no page can be missed, and a new popup gets it for free.
export function testEveryPopupGetsTheCornerCloseButton() {
  assert(/function closeButtonHtml\(\)/.test(modalSource), 'one shared ✕ markup builder');
  assert(/data-popup-close/.test(modalSource), 'the button is addressable from the popup code');

  // Bottom sheet (every sheet, including confirm / prompt dialogs).
  const sheetBlock = modalSource.slice(modalSource.indexOf('export function showBottomSheet'), modalSource.indexOf('export function showModal'));
  assert(/closeButtonHtml\(\)/.test(sheetBlock), 'every bottom sheet gets the ✕');
  assert(/querySelector\('\[data-popup-close\]'\)\?\.addEventListener\('click', close\)/.test(sheetBlock), 'tapping the ✕ closes the sheet');
  assert(/has-popup-close/.test(sheetBlock), 'the sheet is marked so CSS reserves room for the ✕');

  // Centered dialog.
  const modalBlock = modalSource.slice(modalSource.indexOf('export function showModal'));
  assert(/closable \? closeButtonHtml\(\) : ''/.test(modalBlock), 'every closable dialog gets the ✕');
  assert(/has-popup-close/.test(modalBlock), 'the dialog is marked so CSS reserves room for the ✕');
  assert(/if \(closable\) modal\.querySelector\('\[data-popup-close\]'\)/.test(modalBlock), 'tapping the ✕ closes the dialog');

  // A literal ✕ glyph: the icon font is a CDN request and must never be the reason
  // a window cannot be closed.
  assert(/<span aria-hidden="true">✕<\/span>/.test(modalSource), 'the ✕ is text, not an icon that can fail to load');
  assert(/aria-label="ปิด \/ Close"/.test(modalSource), 'the ✕ is announced to screen readers');

  // The confirm / prompt dialogs are sheets, so they inherit the control.
  assert(/showBottomSheet/.test(confirmSource), 'confirm / prompt dialogs are sheets and inherit the ✕');
  // The photo viewer used to carry its own ✕ — there must never be two.
  assert(!/data-lb="close"/.test(appSource), 'the photo viewer relies on the shared ✕ instead of a second one');
}

// The ✕ sits in the top-right corner of the popup and never on top of its title.
export function testCloseButtonSitsInTheTopRightCorner() {
  const rule = /\.popup-close\s*\{([^}]*)\}/.exec(flatCss)?.[1] || '';
  assert(/position:\s*absolute/.test(rule), 'the ✕ floats over the popup');
  assert(/top:\s*4px/.test(rule), 'the ✕ is pinned near the top edge');
  assert(/right:\s*8px/.test(rule), 'the ✕ is pinned to the right edge');
  assert(/z-index:\s*3/.test(rule), 'the ✕ stays above the sheet content');
  assert(/width:\s*34px/.test(rule) && /height:\s*34px/.test(rule), 'a 34px target — a comfortable tap');
  assert(/\.popup-close\s*\{[^}]*border-radius:\s*var\(--radius-full\)/.test(flatCss), 'the ✕ is a round control');
  assert(/\.modal-card \{ position: relative; \}/.test(flatCss), 'the dialog is a positioning context for the ✕');
  assert(!/\.bottom-sheet\s*\{[^}]*position:\s*relative/.test(flatCss), 'the sheet keeps its fixed positioning');
  assert(/\.modal-card\.has-popup-close\s*\{\s*padding-top:\s*46px/.test(flatCss), 'a dialog starts below its ✕');
  assert(/@media \(min-width: 768px\) \{[\s\S]*?\.bottom-sheet\.has-popup-close \.bottom-sheet-content\s*\{\s*padding-top:\s*40px/.test(flatCss),
    'a desktop sheet starts below its ✕ (phones use the drag-handle band)');
}

// v44 (owner: “ปรับเนื้อหาด้านใน … ให้กระชับขึ้น เป็นระเบียบมากขึ้น”): both list cards
// are two-line rows now, and the bookings + recent-expenses pair stays shorter than
// the members card.
export function testDashboardListCardsAreCompact() {
  assert(/#dashboard-view \.expense-row,[\s\S]*?#dashboard-view \.member-row \{[^}]*padding:\s*7px 10px/.test(flatCss),
    'both cards use a compact row rhythm');
  assert(/#dashboard-view \.expense-row \{ padding: 5px 10px; \}/.test(flatCss),
    'the expense rows are a notch tighter, which is what keeps the pair short');
  assert(/#dashboard-view \.member-row-sub \{[^}]*display:\s*flex/.test(flatCss),
    'the member facts sit on one line');
  assert(/#dashboard-view \.member-row-hint \{[^}]*display:\s*inline-flex/.test(flatCss),
    'the net hint carries the “≈ ¥” figure on one line');
  assert(/\.slice\(0, 4\)/.test(appSource.slice(appSource.indexOf('const recent = [...originalExpenses]'), appSource.indexOf('const recent = [...originalExpenses]') + 200)),
    'the recent list shows four rows (the card may not outgrow the members card)');
  assert(/class="expense-row-line"/.test(appSource), 'the “ประมาณการ” marker moved onto the title line');
  assert(/class="member-row-text"/.test(appSource), 'the member row has a named text column');
}
