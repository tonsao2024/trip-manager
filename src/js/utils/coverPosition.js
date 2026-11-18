/** Clamp persisted object-position percentages, including legacy/malformed trips. */
export function normalizeCoverPosition(value) {
  const clamp = v => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
  return { x: clamp(value?.x), y: clamp(value?.y) };
}

/** Move an object-fit: cover image by screen pixels, independent of image size. */
export function dragCoverPosition(position, dx, dy, frameWidth, frameHeight, imageWidth, imageHeight) {
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const overflowX = imageWidth * scale - frameWidth;
  const overflowY = imageHeight * scale - frameHeight;
  return normalizeCoverPosition({
    x: position.x - (overflowX > 0.5 ? dx / overflowX * 100 : 0),
    y: position.y - (overflowY > 0.5 ? dy / overflowY * 100 : 0)
  });
}
