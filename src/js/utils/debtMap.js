/**
 * Where an amount label sits on its own transfer arc.
 *
 * v42 fix (owner report: “ตัวเลขจำนวนเงินบังรายชื่อคนจ่าย”): an amount is now
 * drawn *along its line* — rotated to follow the arc — and the placer treats the
 * member name/role labels as solid obstacles, so a number can never land on a
 * name again. When a busy map has no room for the full plate, the transfer keeps
 * a numbered dot on its line and the amount is read from the numbered list.
 *
 * Coordinates are SVG user units. `angle` is degrees, already flipped upright so
 * the text never reads upside-down.
 */

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

const boxFor = ({ x, y, width, height, angle = 0 }) => {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfW = (width * cos + height * sin) / 2;
  const halfH = (width * sin + height * cos) / 2;
  return { left: x - halfW, right: x + halfW, top: y - halfH, bottom: y + halfH };
};

const overlaps = (a, b, spacing) => !(
  a.right + spacing <= b.left || b.right + spacing <= a.left ||
  a.bottom + spacing <= b.top || b.bottom + spacing <= a.top
);

/** Text width of an amount (Google Sans Code is fixed-width, so this is tight). */
const widthFor = (label, charWidth, minWidth = 58) =>
  Math.min(220, Math.max(minWidth, Math.ceil([...label].length * charWidth + 36)));

/** Tangent angle at `t`, normalised to (−90°, 90°] so the label text stays upright. */
export const debtMapLabelAngle = (edge, t = 0.5) => {
  const tangent = curveTangent(edge.start, edge.control, edge.end, t);
  let angle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180;
  return angle;
};

/**
 * Place every transfer's amount ON its own arc, rotated with the line.
 *
 * @param {Array<{start:{x,y},control:{x,y},end:{x,y},label:string}>} edges
 * @param {Array<{left:number,top:number,right:number,bottom:number}>} obstacles
 * @param {{width?:number,height?:number,padding?:number,gap?:number,labelHeight?:number,charWidth?:number,numberSize?:number}} options
 * @returns {Array<{kind:'label'|'number'|'none',x:number,y:number,t:number,angle:number,width:number,height:number,label:string,box:{left,right,top,bottom}}>}
 */
export function layoutDebtMapAmounts(edges = [], obstacles = [], {
  width = 820,
  height = 500,
  padding = 8,
  gap = 4,
  labelHeight = 21,
  charWidth = 6.7,
  numberSize = 20
} = {}) {
  // Start at the middle of the arc and walk outwards: the label belongs where a
  // reader looks first, and sliding along the same curve keeps it on its line.
  const samples = [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73, 0.2, 0.8, 0.14, 0.86];
  const placed = [];
  const positions = [];

  const fits = (box, extraObstacles = []) => {
    if (box.left < padding || box.right > width - padding || box.top < padding || box.bottom > height - padding) return false;
    if ((obstacles || []).some(obstacle => overlaps(box, obstacle, gap))) return false;
    if (extraObstacles.some(obstacle => overlaps(box, obstacle, gap))) return false;
    return true;
  };

  for (const edge of edges || []) {
    const label = String(edge?.label ?? '');
    let position = null;
    if (edge?.start && edge?.control && edge?.end) {
      const labelWidth = widthFor(label, charWidth);
      for (const t of samples) {
        const point = curvePoint(edge.start, edge.control, edge.end, t);
        const angle = debtMapLabelAngle(edge, t);
        const box = boxFor({ ...point, width: labelWidth, height: labelHeight, angle });
        if (!fits(box, placed)) continue;
        position = { kind: 'label', ...point, t, angle, width: labelWidth, height: labelHeight, label, box };
        break;
      }
      // No room for the plate → a small numbered dot still marks the line, and
      // the numbered list carries the amount. A dot only has to dodge the people.
      if (!position) {
        for (const t of samples) {
          const point = curvePoint(edge.start, edge.control, edge.end, t);
          const box = boxFor({ ...point, width: numberSize, height: numberSize, angle: 0 });
          if (!fits(box, placed)) continue;
          position = { kind: 'number', ...point, t, angle: 0, width: numberSize, height: numberSize, label, box };
          break;
        }
      }
    }
    if (!position) {
      position = { kind: 'none', x: width / 2, y: height / 2, t: 0.5, angle: 0, width: 0, height: 0, label, box: null };
    } else {
      placed.push(position.box);
    }
    positions.push(position);
  }
  return positions;
}

/** Stable, high-contrast colours for debt-map participants and transfer lines. */
export function debtMapColor(index = 0) {
  const numericIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const hue = ((Math.round(numericIndex * 137.508 + 203) % 360) + 360) % 360;
  return `hsl(${hue} 76% 43%)`;
}

/**
 * The visible pieces of one transfer arc, with the member labels cut out.
 *
 * v44 (owner: “ชื่อสมาชิกในแผนภาพ ไม่ควรโดนเส้นบัง …”) — the amount plates were
 * already kept off the names, but the *lines* themselves still ran straight
 * through a person's name. A stroke across Thai text makes the label hard to read
 * even when the text is painted on top of it, so each arc is now sampled and
 * split into the runs that stay clear of every name/role box. The result is a
 * clean gap where a line meets a label — the same trick printed maps use.
 *
 * Each run is a polyline `d` string (96 samples of a quadratic are visually
 * identical to the curve). The first and last runs are always kept so the line
 * still leaves the payer and reaches the receiver's arrow head.
 *
 * @param {{start:{x,y},control:{x,y},end:{x,y}}} edge
 * @param {Array<{left:number,top:number,right:number,bottom:number}>} obstacles text boxes
 * @param {{samples?:number,gap?:number,minRun?:number}} [options]
 * @returns {string[]} one `d` per visible run, in drawing order
 */
export function debtMapEdgeRuns(edge, obstacles = [], { samples = 96, gap = 5, minRun = 7 } = {}) {
  if (!edge?.start || !edge?.control || !edge?.end) return [];
  const boxes = (obstacles || []).filter(Boolean);
  if (!boxes.length) {
    const points = [];
    for (let i = 0; i <= samples; i++) points.push(curvePoint(edge.start, edge.control, edge.end, i / samples));
    return [points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')];
  }
  const blocked = (point) => boxes.some(box =>
    point.x >= box.left - gap && point.x <= box.right + gap &&
    point.y >= box.top - gap && point.y <= box.bottom + gap
  );
  const runs = [];
  let current = [];
  let sawBlocked = false;
  for (let i = 0; i <= samples; i++) {
    const point = curvePoint(edge.start, edge.control, edge.end, i / samples);
    if (blocked(point)) {
      sawBlocked = true;
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length) runs.push(current);

  // No name in the way → keep the single unbroken curve.
  if (!sawBlocked) return [runs[0].map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')];

  const length = (run) => run.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - run[i - 1].x, p.y - run[i - 1].y) : 0), 0);
  const kept = runs.filter((run, i) => i === 0 || i === runs.length - 1 || (run.length > 1 && length(run) >= minRun));
  return kept
    .filter(run => run.length > 1)
    .map(run => run.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
}

/** Place amounts that could not fit on their arcs in a dedicated diagram column.
 * The caller reserves this column and enough height; no plate overlaps a node. */
export function layoutDebtMapCallouts(placements, edges, graphWidth, { charWidth = 7, labelHeight = 23 } = {}) {
  let row = 0;
  return placements.map((position, i) => {
    if (position.kind === 'label') return position;
    const label = String(edges[i]?.label ?? '');
    const width = widthFor(label, charWidth);
    const x = graphWidth + 18 + width / 2;
    const y = 22 + row++ * (labelHeight + 8);
    return { kind: 'callout', x, y, angle: 0, width, height: labelHeight, label,
      box: boxFor({ x, y, width, height: labelHeight }) };
  });
}
