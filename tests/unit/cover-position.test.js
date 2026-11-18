import { normalizeCoverPosition, dragCoverPosition, coverCropStyle, coverCropAxes } from '../../src/js/utils/coverPosition.js';
function assert(ok, message) { if (!ok) throw new Error(message); }
export function testCoverPositionDefaultsAndBounds() {
  const fallback = normalizeCoverPosition({ x: 'bad', y: null });
  assert(fallback.x === 50 && fallback.y === 50, 'legacy or invalid values default to center');
  const bounded = normalizeCoverPosition({ x: -10, y: 120 });
  assert(bounded.x === 0 && bounded.y === 100, 'saved position stays in bounds');
}
export function testCoverDragUsesVisibleOverflow() {
  const start = { x: 50, y: 50 };
  const next = dragCoverPosition(start, 30, 20, 300, 100, 300, 300);
  assert(next.x === 50 && next.y === 40, 'drag changes only the cropped axis');
  assert(dragCoverPosition(start, 0, 10000, 300, 100, 300, 300).y === 0, 'drag clamps at the edge');
}

// v45 (owner: “ภาพหน้าปก ให้สามารถเลือกคริปภาพที่ดึงมาแสดงได้ด้วยสิ ตอนนี้ระบบครอปให้
// อัตโนมัติอาจจะได้ไม่ถูกใจ”): the crop is the reader's choice, and “how close it is”
// is part of that choice — a wide dashboard banner over a tall photo could only be
// panned before, never tightened onto the subject.
export function testCoverCropStoresZoomAndClampsIt() {
  assert(normalizeCoverPosition({ x: 50, y: 50 }).zoom === 1, 'a legacy crop without zoom keeps the widest framing');
  assert(normalizeCoverPosition({ x: 50, y: 50, zoom: 1.4 }).zoom === 1.4, 'a saved zoom survives');
  assert(normalizeCoverPosition({ x: 50, y: 50, zoom: 9 }).zoom === 3, 'zoom is clamped to what stays readable');
  assert(normalizeCoverPosition({ x: 50, y: 50, zoom: 0.2 }).zoom === 1, 'zooming out past the frame is not stored (cover would letterbox)');
  assert(normalizeCoverPosition({ x: 50, y: 50, zoom: 'bad' }).zoom === 1, 'a malformed zoom falls back');
  assert(normalizeCoverPosition({ x: 50, y: 50, zoom: 1.23456 }).zoom === 1.23, 'zoom is stored with two decimals, not float noise');
}

export function testCoverCropDragFollowsTheZoom() {
  // 300×100 frame, 300×300 photo: at zoom 1 the vertical overflow is 200px, so a
  // 20px drag moves 10%. At zoom 2 twice as much picture is off-frame (500px), so
  // the same drag moves 4% — the photo stays glued to the finger at every zoom.
  const at1 = dragCoverPosition({ x: 50, y: 50, zoom: 1 }, 0, 20, 300, 100, 300, 300);
  const at2 = dragCoverPosition({ x: 50, y: 50, zoom: 2 }, 0, 20, 300, 100, 300, 300);
  assert(at1.y === 40 && at1.zoom === 1, 'dragging at zoom 1 moves the full 10%');
  assert(at2.y === 46 && at2.zoom === 2, 'dragging at zoom 2 moves proportionally less');
  assert(dragCoverPosition({ x: 50, y: 50 }, 0, 20, 300, 100, 300, 300).zoom === 1, 'a legacy position keeps zoom 1 while dragging');
}

export function testCoverCropStyleAndAxes() {
  assert(coverCropStyle({ x: 30, y: 70 }) === 'object-position:30% 70%;', 'a crop without zoom needs no transform');
  assert(coverCropStyle({ x: 30, y: 70, zoom: 1.5 }) === 'object-position:30% 70%;transform:scale(1.5);', 'zoom is painted as a transform the frame clips');
  assert(coverCropStyle(null).startsWith('object-position:50% 50%'), 'a trip without a saved crop still renders centred');
  // The dashboard banner (4.3:1) over a 3:2 photo has no horizontal overflow, so a
  // horizontal slider would do nothing — the dialog hides that axis instead.
  const banner = coverCropAxes({ x: 50, y: 50, zoom: 1 }, 1200, 280, 3000, 2000);
  assert(banner.x === false && banner.y === true, 'an axis that cannot move is reported as such');
  assert(coverCropAxes({ x: 50, y: 50, zoom: 3 }, 1200, 280, 3000, 2000).x === true, 'zooming in gives the horizontal axis room again');
  assert(coverCropAxes({ x: 50, y: 50 }, 0, 0, 0, 0).x === true, 'before the photo loads both axes stay available');
}

export async function testSharedCoverWiringAndSelectFocus() {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/js/app.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/css/components.css', import.meta.url), 'utf8');
  assert(/updateTrip\(trip\.id, \{ coverPosition: \{ x: next\.x, y: next\.y, zoom: next\.zoom \} \}\)/.test(app), 'framing is saved to the shared trip');
  assert(app.includes('normalizeCoverPosition(latestTrip.coverPosition)'), 'subscribers see the saved framing');
  assert(rules.includes('managerMayUpdateCoverPosition(tripId)'), 'delegated framing writes have their own permission rule');
  assert(/\.input:focus\s*\{\s*background-color:/.test(css), 'focus does not reset the select chevron placement and repeat');
}

export async function testEveryCoverFrameReadsTheSavedCrop() {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/js/app.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/css/dimension.css', import.meta.url), 'utf8');
  const uses = (app.match(/coverCropStyle\(/g) || []).length;
  assert(uses >= 5, `banner, trip card, trip sheet thumbnail, form preview and settings preview all read the crop (${uses})`);
  assert(app.includes('data-cover-trip='), 'covers on screen can be repainted when a member saves a new crop');
  assert(/id="dash-cover-crop"/.test(app), 'the crop control sits on the cover itself, not only in the ⋯ menu');
  assert(/id="dash-position-cover"/.test(app), 'the ⋯ menu still offers the same editor');
  assert(/id="s-cover-crop"/.test(app), 'Settings can choose the crop too');
  assert(app.includes('cover.style.transform = position.zoom > 1'), 'a crop saved by another member lands without a reload');
  assert(rules.includes("hasOnly(['x', 'y', 'zoom'])"), 'the shared rules accept the zoom a crop stores');
  assert(/\.cover-position-control\.is-off \{ display: none; \}/.test(css), 'a dead axis is hidden, not shown greyed out');
  assert(/\.dash-cover-edit \{/.test(css), 'the on-cover button has its own style');
}
