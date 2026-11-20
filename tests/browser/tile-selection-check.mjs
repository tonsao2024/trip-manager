// Real CSS + real markup: a picked tile must stay visibly picked.
//
// The owner reported (Members → “กลุ่มย่อยในทริป”): “เมื่อเลือกสมาชิกแล้วระบบไม่
// ไฮไลต์สีให้ว่าเลือกไปแล้ว ทำให้ไม่รู้ว่าเลือกอะไรไปบ้าง”. The markup always got
// `.tile-selected`; the stylesheet did not show it, because `flat.css` loaded
// after `components.css` and `.tile:hover` (0,2,0) beat `.tile-selected`
// (0,1,0) — and material.css only restyled the expense form’s tiles. This check
// measures the painted result on the real group form (and on the new documents
// owner picker), in both modes, at phone and desktop widths.
//
// npm run test:smoke then: node tests/browser/tile-selection-check.mjs
import './mobile-build.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="\.\/src\/js\/app\.js\?[^"]*"><\/script>/, '<script type="module" src="/tests/browser/mobile-driver.js"></script>')
  .replace(/\.\/src\//g, '/src/');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end(html); return; }
  const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(data));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
const problems = [];
try {
  browser = await puppeteer.launch({ args: [...chromium.args, '--no-sandbox'], executablePath: await chromium.executablePath(), headless: true });

  for (const mode of ['light', 'dark']) for (const width of [390, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, isMobile: width < 768, hasTouch: width < 768 });
    await page.evaluateOnNewDocument(m => localStorage.setItem('fuji_theme', m), mode);
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => window.__mobile?.ready);

    const state = (selector) => page.$eval(selector, el => {
      const cs = getComputedStyle(el);
      const after = getComputedStyle(el, '::after');
      return {
        selected: el.classList.contains('tile-selected'),
        pressed: el.getAttribute('aria-pressed'),
        bg: cs.backgroundColor, border: cs.borderTopColor, shadow: cs.boxShadow,
        tick: after.content, tickDisplay: after.display, tickSize: after.width
      };
    });

    // ---- Members page → “New group” sheet: pick two members -------------
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/members'));
    await page.waitForSelector('#add-group-btn');
    await page.evaluate(() => document.getElementById('add-group-btn').click());
    await page.waitForSelector('#group-tiles [data-member]');

    const first = '#group-tiles [data-member="u2"]';
    const second = '#group-tiles [data-member="u3"]';
    const before = await state(first);
    assert.equal(before.selected, false, `${mode} ${width}: tile starts unselected`);
    await page.evaluate(sel => document.querySelector(sel).click(), first);
    const after = await state(first);
    assert.equal(after.selected, true, `${mode} ${width}: clicking selects the member`);
    assert.notEqual(after.bg, before.bg, `${mode} ${width}: selected fill differs from unselected`);
    assert.notEqual(after.border, before.border, `${mode} ${width}: selected hairline differs from unselected`);
    assert(after.tick.includes('✓') && after.tickDisplay !== 'none', `${mode} ${width}: selected tile draws a tick (${after.tick})`);
    assert.notEqual(after.shadow, before.shadow, `${mode} ${width}: selected ring shadow appears`);

    // Hovered but unselected must NOT look selected.
    const other = await state(second);
    await page.hover(second);
    const hovered = await state(second);
    assert.equal(hovered.selected, false, `${mode} ${width}: hovering does not select`);
    assert.notEqual(hovered.bg, after.bg, `${mode} ${width}: hovered tile does not share the selected fill`);

    // A selected tile keeps its look while the pointer is over it (the old bug).
    await page.hover(first);
    const hoveredSelected = await state(first);
    assert.equal(hoveredSelected.selected, true, `${mode} ${width}: selected tile stays selected on hover`);
    assert.equal(hoveredSelected.bg, after.bg, `${mode} ${width}: hover does not wash out the selected fill`);
    assert(hoveredSelected.tick.includes('✓'), `${mode} ${width}: hover keeps the tick`);

    // Picking a second member leaves the first one selected (multi-select).
    await page.evaluate(sel => document.querySelector(sel).click(), second);
    assert.equal((await state(first)).selected, true, `${mode} ${width}: first pick survives`);
    assert.equal((await state(second)).selected, true, `${mode} ${width}: second pick highlights too`);
    const count = await page.$eval('#group-picked-count', el => el.textContent);
    assert(count.includes('2'), `${mode} ${width}: picked count follows the selection (${count})`);

    // Deselecting restores the plain tile.
    await page.evaluate(sel => document.querySelector(sel).click(), first);
    const off = await state(first);
    assert.equal(off.selected, false, `${mode} ${width}: clicking again unselects`);
    assert.equal(off.bg, before.bg, `${mode} ${width}: unselected fill returns`);
    assert(off.tick === 'none' || off.tickDisplay === 'none', `${mode} ${width}: tick disappears`);
    await page.keyboard.press('Escape').catch(() => {});

    // ---- Documents → owner picker uses the same selected state ---------
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/documents'));
    await page.waitForSelector('#add-doc-btn');
    await page.evaluate(() => document.getElementById('add-doc-btn').click());
    await page.waitForSelector('#doc-owner-tiles [data-owner-pick]');
    const ownerOn = '#doc-owner-tiles [data-owner-pick="u3"]';
    const ownerOff = await state(ownerOn);
    await page.evaluate(sel => document.querySelector(sel).click(), ownerOn);
    const ownerPicked = await state(ownerOn);
    assert.equal(ownerPicked.selected, true, `${mode} ${width}: document owner tile picks`);
    assert.notEqual(ownerPicked.bg, ownerOff.bg, `${mode} ${width}: document owner fill changes`);
    assert(ownerPicked.tick.includes('✓'), `${mode} ${width}: document owner tick`);

    await page.close();
  }
  console.log('✅ tile selection is visible on the group form and the document owner picker');
} catch (e) {
  problems.push(e.message);
  console.error('❌', e.message);
} finally {
  await browser?.close();
  server.close();
}
if (problems.length) process.exit(1);
