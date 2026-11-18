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
  numberSize = 20,
  amountOnly = false
} = {}) {
  // Start at the middle of the arc and walk outwards: the label belongs where a
  // reader looks first, and sliding along the same curve keeps it on its line.
  const samples = Array.from({ length: 81 }, (_, i) => 0.1 + i * 0.01)
    .sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
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
      if (!position && amountOnly) {
        // Last-resort placement remains on the actual arc, never in a callout.
        const candidates = samples.map(t => {
          const point = curvePoint(edge.start, edge.control, edge.end, t);
          const angle = debtMapLabelAngle(edge, t);
          const box = boxFor({ ...point, width: labelWidth, height: labelHeight, angle });
          const score = [...obstacles, ...placed].filter(other => overlaps(box, other, gap)).length;
          return { kind: 'label', ...point, t, angle, width: labelWidth, height: labelHeight, label, box, score };
        });
        position = candidates.sort((a, b) => a.score - b.score)[0];
      }
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

/** Equal arc-length slots avoid crowding at the narrow ends of an ellipse. */
export function debtMapNodeAngles(count, radiusX, radiusY) {
  if (count <= 0) return [];
  const steps = Math.max(720, count * 32);
  const lengths = [0];
  let previous = { x: 0, y: -radiusY };
  for (let i = 1; i <= steps; i++) {
    const angle = i / steps * Math.PI * 2 - Math.PI / 2;
    const point = { x: radiusX * Math.cos(angle), y: radiusY * Math.sin(angle) };
    lengths.push(lengths[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  let cursor = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = lengths[steps] * i / count;
    while (cursor < steps && lengths[cursor] < target) cursor++;
    const fraction = (target - lengths[cursor - 1]) / (lengths[cursor] - lengths[cursor - 1] || 1);
    return (cursor - 1 + fraction) / steps * Math.PI * 2 - Math.PI / 2;
  });
}

/**
 * The sheet a debt map is drawn on.
 *
 * v45 (owner report 18 Nov 2026: “แผนที่หนี้ ตอนนี้มันกว้างใหญ่เกินไป ต้องสโครล
 * หลายรอบ กว่าจะเห็นครบ (ดูในคอม)”): the SVG is scaled to fit its card, so the
 * sheet's size *is* the reading experience —
 *  · a sheet much wider than the card shrinks every label below reading size
 *    (a 1323×1544 sheet in a 1200px card renders 11.5px amounts at ~10px, and
 *    taller sheets pushed it under 8px), and
 *  · a sheet taller than the screen turns one diagram into several screens of
 *    scrolling, which is exactly what the owner had to do.
 * The on-page sheet is therefore bounded: never wider than a desktop card (so
 * labels render at ~100%) and always landscape (so the whole map is one glance).
 * Retries widen it gently and stop at the cap; a map that is still too dense for
 * a full amount pill keeps that pill's numbered dot on its own line, and the
 * numbered list right below the drawing carries the amount.
 *
 * `detailed: true` is the expanded view (one tap → full-screen sheet): it keeps
 * the old generous growth, because there the reader can pan and zoom, so every
 * amount is drawn in full on its own line.
 */
export const DEBT_MAP_SHEET = {
  fitWidth: 1200,          // ≈ the desktop card's inner width
  fitCompactWidth: 1000,   // phones keep their own horizontal scroll
  fitGrowth: 0.12,         // gentle widening per retry
  fitMaxAttempt: 6,
  fitMaxRatio: 0.76,       // height ≤ 0.76 × width → landscape
  fitMinRatio: 0.5,
  detailWidth: 3600,       // expanded view: room for every pill
  detailGrowth: 0.35,
  detailMaxAttempt: 12
};

/**
 * @param {{people?:number,transfers?:number,attempt?:number,compact?:boolean,detailed?:boolean,maxWidth?:number}} [options]
 * @returns {{width:number,height:number,aspect:number,growth:number,attempt:number,maxAttempt:number,capped:boolean,canGrow:boolean}}
 */
export function debtMapCanvas({ people = 0, transfers = 0, attempt = 0, compact = false, detailed = false, maxWidth = 0 } = {}) {
  const n = Math.max(2, Math.round(Number(people) || 0));
  const moves = Math.max(1, Math.round(Number(transfers) || 0));
  const step = Math.max(0, Math.round(Number(attempt) || 0));

  if (detailed) {
    const maxAttempt = DEBT_MAP_SHEET.detailMaxAttempt;
    const cappedAttempt = Math.min(step, maxAttempt);
    const growth = 1 + cappedAttempt * DEBT_MAP_SHEET.detailGrowth;
    const cap = Number(maxWidth) > 0 ? Number(maxWidth) : DEBT_MAP_SHEET.detailWidth;
    const width = Math.min(cap, Math.max(900, n * 100 + 180) * growth);
    const height = Math.min(width * 1.6, Math.max(620, n * 90 + 160, moves * 38 + 80) * growth);
    return {
      width: Math.round(width), height: Math.round(height), aspect: Number((width / height).toFixed(3)),
      growth, attempt: cappedAttempt, maxAttempt, capped: width >= cap - 0.5,
      canGrow: width < cap - 0.5 && cappedAttempt < maxAttempt
    };
  }

  const maxAttempt = DEBT_MAP_SHEET.fitMaxAttempt;
  const cappedAttempt = Math.min(step, maxAttempt);
  const growth = 1 + cappedAttempt * DEBT_MAP_SHEET.fitGrowth;
  const cap = Number(maxWidth) > 0 ? Number(maxWidth) : (compact ? DEBT_MAP_SHEET.fitCompactWidth : DEBT_MAP_SHEET.fitWidth);
  const baseWidth = compact ? Math.max(560, n * 86 + 150) : Math.max(780, n * 98 + 210);
  const width = Math.min(cap, baseWidth * growth);
  // Height follows the width (landscape) with room for the people and the lines.
  const wanted = Math.max(compact ? 380 : 440, n * (compact ? 52 : 58) + 150, moves * (compact ? 15 : 17) + 200) * growth;
  const height = Math.min(width * DEBT_MAP_SHEET.fitMaxRatio, Math.max(wanted, width * DEBT_MAP_SHEET.fitMinRatio));
  return {
    width: Math.round(width), height: Math.round(height), aspect: Number((width / height).toFixed(3)),
    growth, attempt: cappedAttempt, maxAttempt, capped: width >= cap - 0.5,
    canGrow: width < cap - 0.5 && cappedAttempt < maxAttempt
  };
}
