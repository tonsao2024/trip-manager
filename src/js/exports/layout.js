/** Choose page cuts outside text lines/rows; always advance for oversized rows. */
export function exportPageCuts(height, pageHeight, protectedRanges = []) {
  const cuts = [0];
  while (cuts.at(-1) < height) {
    const start = cuts.at(-1);
    let end = Math.min(height, start + pageHeight);
    if (end < height) {
      for (let attempt = 0; attempt < protectedRanges.length + 1; attempt++) {
        const crossing = protectedRanges.filter(r => r.top < end && r.bottom > end);
        if (!crossing.length) break;
        const candidate = Math.floor(Math.min(...crossing.map(r => r.top)) - 2);
        if (candidate <= start + pageHeight * 0.35) break;
        end = candidate;
      }
    }
    cuts.push(Math.max(start + 1, end));
  }
  return cuts;
}
