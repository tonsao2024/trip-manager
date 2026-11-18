import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '../../src/js/app.js'), 'utf8');
const flatCss = fs.readFileSync(path.join(here, '../../src/css/flat.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(here, '../../src/css/components.css'), 'utf8');

function ok(value, label) { if (!value) throw new Error(label); }

// v42 (owner report: “การ์ดสองการ์ด … มีความสูงไม่เท่ากัน มองแล้วไม่เป็นระเบียบ”)
// The dashboard board is a plain two-column grid again: a row is as tall as its
// tallest card and the neighbour stretches to match, so every side-by-side pair
// shares one top and one bottom. The v39 measured/masonry packing (which let two
// cards in a band end at different heights) is gone.
export function testBoardIsATwoColumnGrid() {
  ok(/\.dashboard-board\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(flatCss),
    'the board is two equal columns');
  ok(/\.dashboard-board\s*\{[^}]*align-items:\s*stretch/s.test(flatCss),
    'cards stretch to the height of their row, not their own content');
}

export function testCardFillsItsRow() {
  ok(/\.dash-widget\s*>\s*\.card\s*\{\s*height:\s*100%;?\s*\}/.test(flatCss),
    'the card inside a widget fills the stretched grid item');
  ok(/\.dash-widget--half\s*>\s*\.card\s*\{[^}]*height:\s*100%/s.test(flatCss) ||
    /\.dash-widget\s*>\s*\.card\s*\{\s*height:\s*100%;?\s*\}/.test(componentsCss),
    'half cards fill the row too');
  ok(/\.dash-widget--full\s*\{\s*grid-column:\s*1\s*\/\s*-1;?\s*\}/.test(componentsCss) ||
    /\.dash-widget--full\s*\{\s*grid-column:\s*1\s*\/\s*-1/.test(flatCss),
    'a full-width card takes a row of its own');
}

export function testNoMeasuredMasonryLeft() {
  ok(!/is-masonry/.test(flatCss), 'no masonry CSS is left behind');
  ok(!/is-masonry/.test(appSource), 'the app no longer toggles a masonry board');
  ok(!/packDashboard/.test(appSource), 'cards are placed by the grid, not by measured rows');
}

export function testSavedOrderDrivesTheBoard() {
  ok(/const applyDashboardOrder = \(raw\) => \{\s*const order = normalizeWidgetOrder\(raw\);[\s\S]*?dashboardBoard\.appendChild\(widget\)/.test(appSource),
    'the board paints the stored order, with no card moved to force a pair');
  ok(/addTile\) dashboardBoard\.appendChild\(addTile\)/.test(appSource),
    'the “add card” tile stays after the cards');
}

export function testPhonesStaySingleColumn() {
  ok(/@media \(max-width: 760px\) \{[\s\S]*?\.dashboard-board \{ grid-template-columns: minmax\(0, 1fr\); gap: 12px; \}/.test(flatCss),
    'a phone stack is one column, so nothing is stretched sideways');
}
