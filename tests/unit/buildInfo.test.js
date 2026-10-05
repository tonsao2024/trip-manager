// Unit tests — build identity + the “last updated” date shown on the website.
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_VERSION, APP_VERSION_LABEL, APP_PALETTE, APP_UPDATED_ISO,
  appUpdatedDate, appUpdatedShort, appUpdatedLabel, appBuildLabel, appMeta
} from '../../src/js/utils/buildInfo.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testVersionFields() {
  assert(/^\d+$/.test(APP_VERSION), 'version is a plain number string');
  assert(APP_VERSION_LABEL === `v${APP_VERSION}`, 'label matches the version');
  assert(APP_PALETTE === 'Sky light', 'palette name matches the v17 design system');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(APP_UPDATED_ISO), 'ISO date format');
  const d = appUpdatedDate();
  assert(d instanceof Date && !isNaN(d.getTime()), 'date parses');
  assert(d.getFullYear() === Number(APP_UPDATED_ISO.slice(0, 4)), 'year comes from the ISO string');
}

export function testLabels() {
  const th = appUpdatedShort('th');
  const en = appUpdatedShort('en');
  assert(/\d/.test(th) && /\d/.test(en), 'dates have day + year numbers');
  assert(th !== en, 'Thai and English render differently');
  assert(en.includes('Oct') && en.includes('2026'), `English label (got ${en})`);
  assert(th.includes('ต.ค.') && th.includes('2569'), `Thai label uses the Buddhist year (got ${th})`);
  assert(appUpdatedLabel('th').startsWith('อัปเดตล่าสุด'), 'Thai wording');
  assert(appUpdatedLabel('en').startsWith('Updated'), 'English wording');
  const build = appBuildLabel('en');
  assert(build.includes(APP_VERSION_LABEL) && build.includes('Updated'), 'build label combines version + date');
  assert(appMeta().updated === APP_UPDATED_ISO, 'appMeta exposes the ISO date');
}

export function testIndexHtmlStaysInSync() {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../index.html'), 'utf8');
  const pick = (name) => (html.match(new RegExp(`<meta name="${name}" content="([^"]+)"`)) || [])[1];
  assert(pick('app-version') === APP_VERSION, 'index.html meta app-version matches buildInfo');
  assert(pick('app-palette') === APP_PALETTE, 'index.html meta app-palette matches buildInfo');
  assert(pick('app-updated') === APP_UPDATED_ISO, `index.html meta app-updated matches buildInfo (${pick('app-updated')} vs ${APP_UPDATED_ISO})`);
  assert(html.includes(`app.js?v=${APP_VERSION}`), 'app.js cache-buster matches the version');
  assert(html.includes(`tokens.css?v=${APP_VERSION}`), 'tokens.css cache-buster matches the version');
  assert(html.includes(`refresh.css?v=${APP_VERSION}`), 'refresh.css cache-buster matches the version');
  assert(html.includes(`components.css?v=${APP_VERSION}`), 'components.css cache-buster matches the version');
  assert(html.includes(`animations.css?v=${APP_VERSION}`), 'animations.css cache-buster matches the version');
}

export function testAppShowsTheStamp() {
  const app = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/js/app.js'), 'utf8');
  assert(app.includes("from './utils/buildInfo.js'"), 'app.js imports the build info');
  assert(app.includes('appUpdatedLabel(lang)'), 'the “last updated” label is rendered');
  assert(app.includes('data-build-stamp'), 'the stamp is marked for styling/tests');
}
