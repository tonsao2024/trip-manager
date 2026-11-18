// v43 (owner report: “การ์ด ทีม · ค่าใช้จ่ายต่อคนและรวมทีม … ทางขวาของการ์ดดูว่าง
// มีพื้นที่เปลือง … บนไอแพดสามารถยืดการ์ดย่อยนี้ให้เต็มเสมอการ์ดด้านบน”)
//
// The “ทั้งทริป / Whole trip” card is the benchmark the teams are compared with.
// On an iPad it used to sit in the left half of an otherwise empty row, so the
// rules below keep it either paired with a team (no hole) or across the whole
// row — and once it is that wide, CSS lays its numbers out as one strip.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
const flatCss = fs.readFileSync(path.join(here, '../../src/css/flat.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(here, '../../src/css/components.css'), 'utf8');

function ok(value, label) { if (!value) throw new Error(label); }

/** The benchmark card as rendered by the dashboard. */
function tripCardMarkup() {
  const start = appSource.indexOf('team-card team-card--trip');
  ok(start > -1, 'the dashboard still renders a whole-trip card');
  const end = appSource.indexOf('</article>', start);
  return appSource.slice(start, end);
}

export function testWholeTripCardIsOneSelfContainedCard() {
  const card = tripCardMarkup();
  ok(/team-trip-body/.test(card), 'the benchmark card groups its figures in .team-trip-body');
  ok(/team-trip-side/.test(card), 'categories / facts / leftover members share .team-trip-side');
  ok(!/team-card-top|team-card-foot/.test(card),
    'the benchmark card is not written as a team card’s top+foot pair any more');
  // The figures and the comparison label must survive the rewrite.
  ok(/เฉลี่ย \/ คน/.test(card) && /รวมทั้งทริป/.test(card), 'per-person and trip totals are still shown');
  ok(/ฐานเปรียบเทียบ/.test(card), 'the card still says it is the comparison base');
}

export function testBenchmarkTakesTheWholeRowOnTablet() {
  const tablet = flatCss.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{[^}]*#team-board > \.team-card--trip:nth-child\(odd\)[^}]*\}[^}]*\}/);
  ok(tablet, 'the tablet grid gives the benchmark card the full row when it would start one alone');
  ok(/grid-column:\s*1 \/ -1/.test(tablet[0]), 'the benchmark card spans both tablet columns');
  // Two columns are what makes an odd count the “alone” case.
  ok(/#team-board \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/.test(flatCss),
    'a tablet keeps two team columns');
}

export function testBenchmarkTakesTheWholeRowOnDesktop() {
  // team columns come from `data-team-count`; these are the counts where the
  // benchmark would still be pushed onto a row of its own.
  for (const count of ['6', '9', '13', '17']) {
    ok(new RegExp(`#team-board\\[data-team-count="${count}"\\] > \\.team-card--trip`).test(flatCss),
      `count ${count}: the benchmark card spans the desktop row`);
  }
  for (const count of ['3', '4']) {
    ok(!new RegExp(`#team-board\\[data-team-count="${count}"\\] > \\.team-card--trip`).test(flatCss),
      `count ${count}: the benchmark card already sits beside a team, so it is not stretched`);
  }
}

export function testWideBenchmarkReadsAsOneStrip() {
  const wide = flatCss.match(/@container \(min-width: 460px\) \{[\s\S]*?\n\}/);
  ok(wide, 'a wide benchmark card switches layout from the card’s own width');
  ok(/container-type:\s*inline-size/.test(flatCss.match(/#team-board \.team-card--trip \{[^}]*\}/)?.[0] || ''),
    'the benchmark card is the container the query measures');
  ok(/\.team-trip-body \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.1fr\) minmax\(0, 1fr\)/.test(wide[0]),
    'figures take the left half, categories and facts the right half');
  ok(/border-left:\s*1px dashed/.test(wide[0]), 'the two halves are split by a dashed rule');
  ok(/\.team-facts \{ border-top: 0/.test(wide[0]), 'the horizontal dashed rule is dropped once the halves sit side by side');
}

export function testNarrowBenchmarkStillStacks() {
  ok(/\.team-trip-body,\s*\n\.team-trip-side \{ display: flex; flex-direction: column; gap: 6px; min-width: 0; \}/.test(flatCss),
    'a phone / half-width benchmark card keeps the stacked layout as the default');
  ok(/\.team-card--trip \.team-facts \{[^}]*border-top: 1px dashed/.test(componentsCss),
    'the stacked card keeps the dashed rule above its facts');
}
