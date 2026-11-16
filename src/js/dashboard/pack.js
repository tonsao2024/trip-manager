/**
 * Dashboard packing: turning measured card heights into two balanced columns.
 *
 * The board is a 4px-row CSS grid (`#dashboard-board.is-masonry` in flat.css).
 * A plain two-column grid gives every card in a row the height of the tallest
 * one, so a short card (a booking list with one row) left a tall empty rectangle
 * under it while its neighbour ran on — the wasted space the owner reported.
 *
 * `packDashboard(items, {gutter})` answers, for each card in the saved order,
 * which column it belongs to and which grid row it starts at. It is pure: the
 * caller measures the DOM and applies the result.
 *
 * Rules
 *  - The saved order is the reading order, top-down per column.
 *  - A run of half cards between two full-width cards is one “band”; a band is
 *    split into two columns whose heights are as close as possible, so neither
 *    column ends in a long empty strip.
 *  - A full-width card is a band of its own and starts below everything before it.
 *  - The first half card of a band always starts the left column, so the top of a
 *    band follows the trip's saved order.
 */

export const DASH_ROW = 4;

/** Grid rows a card of `height` px occupies, gutter included. */
export function rowsFor(height, gutter = 14, rowUnit = DASH_ROW) {
  const px = Number.isFinite(height) && height > 0 ? height : 0;
  return Math.max(1, Math.ceil((px + gutter) / rowUnit));
}

/**
 * Which of two columns each card of a band belongs to.
 *
 * Returns an array of booleans (true = right column) of the same length. The
 * first card always stays in the left column, so a band starts in the trip's
 * saved order; after that the split is the one whose taller column is the
 * shortest, so neither column ends in a long empty strip. Cards keep their
 * order inside a column, which is what makes the board read top-down.
 *
 * Above 16 cards the exact search (2^n) is abandoned for the greedy
 * shorter-column rule — with that many cards both come out even anyway.
 */
export function balancedColumns(spans) {
  const n = spans.length;
  if (n === 0) return [];
  if (n === 1) return [false];
  const total = spans.reduce((a, b) => a + b, 0);
  if (n > 16) {
    const out = [];
    let left = 0, right = 0;
    spans.forEach((span, i) => {
      if (i === 0 || left <= right) { out.push(false); left += span; } else { out.push(true); right += span; }
    });
    return out;
  }
  // bit set = LEFT column, so starting at mask 1 keeps the first card on the left
  let bestMask = 1;
  let bestMax = Infinity;
  let bestDiff = Infinity;
  for (let mask = 1; mask < (1 << n); mask += 2) {
    let left = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) left += spans[i];
    const right = total - left;
    const worst = Math.max(left, right);
    const diff = Math.abs(left - right);
    if (worst < bestMax || (worst === bestMax && diff < bestDiff)) {
      bestMax = worst;
      bestDiff = diff;
      bestMask = mask;
    }
  }
  return spans.map((_, i) => (bestMask & (1 << i)) === 0);
}

/**
 * @param {Array<{key:string, full?:boolean, height:number}>} items saved order
 * @param {{gutter?:number, rowUnit?:number}} [options]
 * @returns {Array<{key:string, column:1|2|null, row:number, span:number}>}
 *          `column` is 1 or 2 for a half card, null for a full-width card;
 *          `row` is the 1-based grid row start.
 */
export function packDashboard(items, options = {}) {
  const gutter = Number.isFinite(options.gutter) ? options.gutter : 14;
  const rowUnit = Number.isFinite(options.rowUnit) ? options.rowUnit : DASH_ROW;
  const list = Array.isArray(items) ? items : [];
  const out = new Map();
  let top = 0; // px, the bottom edge of everything placed so far

  const flush = (band) => {
    if (!band.length) return;
    const right = balancedColumns(band.map(it => rowsFor(it.height, gutter, rowUnit)));
    const columns = [[], []];
    band.forEach((it, i) => {
      columns[right[i] ? 1 : 0].push({ it, span: rowsFor(it.height, gutter, rowUnit) });
    });
    let bottom = top;
    columns.forEach((column, index) => {
      let y = top;
      for (const { it, span } of column) {
        out.set(it.key, { key: it.key, column: index + 1, row: Math.round(y / rowUnit) + 1, span });
        y += span * rowUnit;
      }
      bottom = Math.max(bottom, y);
    });
    top = bottom;
  };

  let band = [];
  for (const item of list) {
    const span = rowsFor(item.height, gutter, rowUnit);
    if (item.full) {
      flush(band);
      band = [];
      out.set(item.key, { key: item.key, column: null, row: Math.round(top / rowUnit) + 1, span });
      top += span * rowUnit;
    } else {
      band.push(item);
    }
  }
  flush(band);
  return list.map(item => out.get(item.key)).filter(Boolean);
}
