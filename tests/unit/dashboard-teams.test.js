// v43 (owner report: “การ์ด ทีม · ค่าใช้จ่ายต่อคนและรวมทีม … ทางขวาของการ์ดดูว่าง
// มีพื้นที่เปลือง … บนไอแพดสามารถยืดการ์ดย่อยนี้ให้เต็มเสมอการ์ดด้านบน” แล้วต่อด้วย
// “เมื่อยืดแล้วการจัดวางเนื้อหาภายในก็ควรสมดุลเป็นระเบียบด้วย”)
//
// The “ทั้งทริป / Whole trip” card is the benchmark the teams are compared with.
// On an iPad it used to sit in the left half of an otherwise empty row. The rules
// below keep it either paired with a team (no hole) or across the whole row — and
// when it is that wide its inside becomes three orderly bands instead of two
// lopsided halves: head → figures | categories → facts / leftover members.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
const flatCss = fs.readFileSync(path.join(here, '../../src/css/flat.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(here, '../../src/css/components.css'), 'utf8');

/** The rule block that starts at `needle` and runs to the next one. */
function cssBlock(startNeedle, endNeedle) {
  const start = flatCss.indexOf(startNeedle);
  const end = flatCss.indexOf(endNeedle, start + startNeedle.length);
  return start > -1 && end > start ? flatCss.slice(start, end) : '';
}

const twoBand = cssBlock('@container (min-width: 560px)', '@container (min-width: 900px)');
const threeBand = cssBlock('@container (min-width: 900px)', '.summary-stats-row {');

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
  ok(/team-trip-body/.test(card), 'the benchmark card groups its figures and categories in .team-trip-body');
  ok(/team-trip-side/.test(card), 'the categories keep their own band (.team-trip-side)');
  ok(/team-trip-foot/.test(card), 'facts / leftover members sit in a footer band (.team-trip-foot)');
  ok(!/team-card-top|team-card-foot/.test(card),
    'the benchmark card is not written as a team card’s top+foot pair any more');
  // The figures and the comparison label must survive the rewrite.
  ok(/เฉลี่ย \/ คน/.test(card) && /รวมทั้งทริป/.test(card), 'per-person and trip totals are still shown');
  ok(/ฐานเปรียบเทียบ/.test(card), 'the card still says it is the comparison base');
  // The categories band is named in the wide layout (the label is hidden when the
  // card is stacked, so a phone looks exactly like a team card).
  ok(/team-trip-label/.test(card) && /หมวดที่ใช้จ่าย/.test(card), 'the categories band carries its own label');
  ok(/\.team-trip-label \{ display: none; \}/.test(flatCss), 'that label is hidden while the card is stacked');
}

export function testBenchmarkTakesTheWholeRowOnTablet() {
  // the v43 rules (two tablet media queries exist — the column counts and this one)
  const v43 = flatCss.slice(flatCss.indexOf('/* v43 —'));
  const tablet = v43.slice(0, v43.indexOf('@media (min-width: 1024px)'));
  ok(/#team-board > \.team-card--trip:nth-child\(odd\)/.test(tablet),
    'the tablet grid gives the benchmark card the full row when it would start one alone');
  ok(/grid-column:\s*1 \/ -1/.test(tablet), 'the benchmark card spans both tablet columns');
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

export function testWideBenchmarkSplitsIntoBalancedBands() {
  ok(/container-type:\s*inline-size/.test(flatCss.match(/#team-board \.team-card--trip \{[^}]*\}/)?.[0] || ''),
    'the benchmark card is the container the queries measure');
  // 560px+: two equal halves — figures on the left, categories on the right.
  ok(/\.team-trip-body \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/.test(twoBand),
    'a mid-wide card splits into two equal halves');
  ok(/\.team-trip-side \{[\s\S]*?border-left:\s*1px dashed/.test(twoBand),
    'the halves are split by a dashed rule');
  ok(/\.team-stat \{ display: flex; flex-direction: column; justify-content: center; \}/.test(twoBand),
    'both figures share the height of the band beside them, centred');
  // facts + leftover members become one footer band across the whole card.
  ok(/\.team-trip-foot \{[\s\S]*?flex-direction:\s*row;[\s\S]*?border-top:\s*1px dashed/.test(twoBand),
    'facts / leftover members read as one footer band');
  ok(/\.team-facts \{ border-top: 0; margin-top: 0; padding-top: 0; \}/.test(twoBand),
    'the old per-card dashed rule is dropped once the footer has its own');
  // 900px+: one band per team column above, so the row lines up with the teams.
  ok(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) minmax\(0, 1\.15fr\)/.test(threeBand),
    'a very wide card gives every figure its own band, then the categories');
  ok(/\.team-stats \{ display: contents; \}/.test(threeBand),
    'the figure pair joins the band grid instead of nesting a second grid');
  ok(/\.team-trip-side \{ grid-column: 3; \}/.test(threeBand), 'the categories stay in the last band');
}

export function testNarrowBenchmarkStillStacks() {
  ok(/\.team-trip-body,\s*\n\.team-trip-side,\s*\n\.team-trip-foot \{ display: flex; flex-direction: column; gap: 6px; min-width: 0; \}/.test(flatCss),
    'a phone / half-width benchmark card keeps the stacked layout as the default');
  ok(/\.team-card--trip \.team-facts \{[^}]*border-top: 1px dashed/.test(componentsCss),
    'the stacked card keeps the dashed rule above its facts');
}
