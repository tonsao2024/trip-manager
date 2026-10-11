/** Stable, high-contrast colours for debt-map participants and transfer lines. */
export function debtMapColor(index = 0) {
  const numericIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const hue = ((Math.round(numericIndex * 137.508 + 203) % 360) + 360) % 360;
  return `hsl(${hue} 76% 43%)`;
}

const curvePoint = (start, control, end, t) => {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
  };
};

const curveTangent = (start, control, end, t) => ({
  x: 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
  y: 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y)
});

const boxFor = ({ x, y, width, height }) => ({
  left: x - width / 2,
  right: x + width / 2,
  top: y - height / 2,
  bottom: y + height / 2
});

const overlaps = (a, b, spacing) => !(
  a.right + spacing <= b.left || b.right + spacing <= a.left ||
  a.bottom + spacing <= b.top || b.bottom + spacing <= a.top
);

/**
 * Place transfer amount tags along quadratic SVG edges without allowing any two
 * tags (or a tag and a member label) to overlap. If a busy graph has no free
 * space, that amount gets its own row below the diagram instead of being drawn
 * on top of another value.
 *
 * `edges` contain { start, control, end, label }, and `obstacles` are optional
 * { left, top, right, bottom } member/node label bounds.
 *
 * @returns {{positions:Array<{x:number,y:number,width:number,height:number,label:string,fallback:boolean}>, height:number}}
 */
export function layoutDebtMapAmountLabels(edges = [], obstacles = [], {
  width = 820,
  height = 500,
  padding = 12,
  labelHeight = 22,
  labelSpacing = 5
} = {}) {
  const placed = [];
  const positions = [];
  const samples = [0.5, 0.35, 0.65, 0.2, 0.8, 0.12, 0.88, 0.43, 0.57, 0.28, 0.72, 0.06, 0.94];
  const normalOffsets = [0, 20, -20, 40, -40, 60, -60, 80, -80, 100, -100];
  const tangentOffsets = [0, -22, 22, -44, 44];
  let fallbackCount = 0;

  for (const edge of edges || []) {
    const label = String(edge?.label ?? '');
    const desiredWidth = Math.max(48, Math.ceil([...label].length * 6.6 + 16));
    const labelWidth = Math.min(Math.max(48, width - padding * 2), desiredWidth);
    let position = null;
    const candidates = [];
    const seen = new Set();

    if (edge?.start && edge?.control && edge?.end) {
      for (const t of samples) {
        const point = curvePoint(edge.start, edge.control, edge.end, t);
        const tangent = curveTangent(edge.start, edge.control, edge.end, t);
        const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
        const unitTangent = { x: tangent.x / tangentLength, y: tangent.y / tangentLength };
        const normal = { x: -unitTangent.y, y: unitTangent.x };
        for (const normalOffset of normalOffsets) {
          for (const tangentOffset of tangentOffsets) {
            const x = point.x + normal.x * normalOffset + unitTangent.x * tangentOffset;
            const y = point.y + normal.y * normalOffset + unitTangent.y * tangentOffset;
            const key = `${x.toFixed(1)},${y.toFixed(1)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ x, y, width: labelWidth, height: labelHeight, label, fallback: false });
          }
        }
      }
    }

    for (const candidate of candidates) {
      const bounds = boxFor(candidate);
      if (bounds.left < padding || bounds.right > width - padding ||
          bounds.top < padding || bounds.bottom > height - padding) continue;
      if ((obstacles || []).some(obstacle => overlaps(bounds, obstacle, labelSpacing))) continue;
      if (placed.some(existing => overlaps(bounds, existing.bounds, labelSpacing))) continue;
      position = candidate;
      break;
    }

    if (!position) {
      // A dedicated, one-label-per-row footer is the guaranteed no-overlap path
      // for very dense maps or long amount strings.
      position = {
        x: width / 2,
        y: height + 14 + fallbackCount * (labelHeight + labelSpacing + 3),
        width: labelWidth,
        height: labelHeight,
        label,
        fallback: true
      };
      fallbackCount++;
    }

    positions.push(position);
    placed.push({ position, bounds: boxFor(position) });
  }

  const footerHeight = fallbackCount
    ? 14 + labelHeight + (fallbackCount - 1) * (labelHeight + labelSpacing + 3) + labelHeight / 2
    : 0;
  return { positions, height: Math.ceil(height + footerHeight) };
}
