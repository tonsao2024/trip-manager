import { normalizeCoverPosition, dragCoverPosition } from '../../src/js/utils/coverPosition.js';
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

export async function testSharedCoverWiringAndSelectFocus() {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/js/app.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/css/components.css', import.meta.url), 'utf8');
  assert(app.includes('updateTrip(tripId, { coverPosition: position })'), 'framing is saved to the shared trip');
  assert(app.includes('normalizeCoverPosition(latestTrip.coverPosition)'), 'subscribers see the saved framing');
  assert(rules.includes('managerMayUpdateCoverPosition(tripId)'), 'delegated framing writes have their own permission rule');
  assert(/\.input:focus\s*\{\s*background-color:/.test(css), 'focus does not reset the select chevron placement and repeat');
}
