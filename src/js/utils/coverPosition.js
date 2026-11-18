/**
 * The saved crop of a trip's cover image.
 *
 * A cover is shown through frames of different shapes (the dashboard banner is
 * ~4:1, a trip card ~5:2, a thumbnail 1:1) and `object-fit: cover` decides what
 * is visible automatically — which is exactly what the owner did not want
 * (18 Nov 2026: “ภาพหน้าปก ให้สามารถเลือกคริปภาพที่ดึงมาแสดงได้ด้วยสิ ตอนนี้ระบบ
 * ครอปให้อัตโนมัติอาจจะได้ไม่ถูกใจ”). So the choice is stored on the trip:
 *
 *   x, y   — which part of the photo the frame shows (object-position, %)
 *   zoom   — how tight the crop is (1 = the widest crop that still fills the
 *            frame, 3 = three times closer); the frame clips the rest
 *
 * Every cover in the app reads the same three numbers, so one choice frames the
 * banner, the cards and the thumbnails alike.
 */

/** Clamp persisted crop values, including legacy/malformed trips. */
export function normalizeCoverPosition(value) {
  const clamp = v => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
  const zoom = typeof value?.zoom === 'number' && Number.isFinite(value.zoom) ? value.zoom : 1;
  return {
    x: clamp(value?.x),
    y: clamp(value?.y),
    // A zoom below 1 would letterbox the frame (object-fit: cover cannot show
    // more than “fills the frame”), and beyond 3 the photo turns into pixels.
    zoom: Math.round(Math.max(1, Math.min(3, zoom)) * 100) / 100
  };
}

/** Move an object-fit: cover image by screen pixels, independent of image size. */
export function dragCoverPosition(position, dx, dy, frameWidth, frameHeight, imageWidth, imageHeight) {
  const { x, y, zoom } = normalizeCoverPosition(position);
  // `zoom` is painted as a transform on the same element, so the overflow the
  // finger has to travel grows with it — 1% of position is 1% of what is visible.
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * zoom;
  const overflowX = imageWidth * scale - frameWidth;
  const overflowY = imageHeight * scale - frameHeight;
  return normalizeCoverPosition({
    x: x - (overflowX > 0.5 ? dx / overflowX * 100 : 0),
    y: y - (overflowY > 0.5 ? dy / overflowY * 100 : 0),
    zoom
  });
}

/**
 * The inline style that reproduces a saved crop inside any `object-fit: cover`
 * frame. The frame must clip (overflow: hidden) — every cover frame in the app
 * already does.
 */
export function coverCropStyle(position) {
  const { x, y, zoom } = normalizeCoverPosition(position);
  return `object-position:${x}% ${y}%;${zoom > 1 ? `transform:scale(${zoom});` : ''}`;
}

/**
 * Can this crop still move on the given axis? A frame wider than the photo has
 * no horizontal overflow, so a horizontal slider would only confuse — the crop
 * dialog hides that axis instead of showing a control that does nothing.
 */
export function coverCropAxes(position, frameWidth, frameHeight, imageWidth, imageHeight) {
  const { zoom } = normalizeCoverPosition(position);
  if (!(frameWidth > 0) || !(frameHeight > 0) || !(imageWidth > 0) || !(imageHeight > 0)) return { x: true, y: true };
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * zoom;
  return {
    x: imageWidth * scale - frameWidth > 0.5,
    y: imageHeight * scale - frameHeight > 0.5
  };
}
