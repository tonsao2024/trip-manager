// Check the real routed pages and their fixed actions while scrolling.
// npm run test:browser:floating-actions
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
assert(html.includes('/tests/browser/mobile-driver.js'));
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end(html); return; }
  const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(data));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ args: [...chromium.args, '--no-sandbox'], executablePath: await chromium.executablePath(), headless: true });
  for (const mode of ['light', 'dark']) for (const width of [390, 768, 1024, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 820, isMobile: width < 768, hasTouch: width < 768 });
    await page.evaluateOnNewDocument(m => localStorage.setItem('fuji_theme', m), mode);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__mobile?.ready);
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important }' });
    for (const section of ['expenses', 'itinerary']) {
      await page.evaluate(route => window.__mobile.goto(`#/trip/t1/${route}`), section);
      await page.waitForSelector(section === 'expenses' ? '#add-expense-btn' : '#add-itinerary-btn');
      await page.waitForFunction(() => !document.querySelector('#fab').classList.contains('hidden'));
      const label = section === 'expenses' ? 'เพิ่มค่าใช้จ่าย' : 'เพิ่มสถานที่';
      assert.equal(await page.$eval('#fab', el => el.getAttribute('aria-label')), label);
      // Extend short fixtures so both scroll directions have a meaningful distance.
      await page.evaluate(() => { const spacer = document.createElement('div'); spacer.id = 'test-scroll-spacer'; spacer.style.height = '1400px'; document.querySelector('#app').appendChild(spacer); });
      const measure = () => {
        const fab = document.querySelector('#fab');
        const rect = fab.getBoundingClientRect();
        const nav = document.querySelector('#bottom-nav').getBoundingClientRect();
        const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { position: getComputedStyle(fab).position, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
          navTop: nav.top, navVisible: getComputedStyle(document.querySelector('#bottom-nav')).display !== 'none',
          hit: el === fab || fab.contains(el), scrollY: window.scrollY };
      };
      await page.evaluate(() => window.scrollTo(0, 0));
      const top = await page.evaluate(measure);
      assert.equal(top.position, 'fixed');
      assert(top.hit && top.right <= width && top.bottom <= 820, `${mode} ${width} ${section}: FAB offscreen or covered`);
      if (top.navVisible) assert(top.bottom <= top.navTop, 'FAB overlaps navigation');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const bottom = await page.evaluate(measure);
      assert(bottom.scrollY > 300 && Math.abs(top.y - bottom.y) < 1 && bottom.hit, `${mode} ${width} ${section}: FAB not fixed at bottom`);
      await page.evaluate(() => window.scrollTo(0, 200));
      const up = await page.evaluate(measure);
      assert(up.scrollY < bottom.scrollY && Math.abs(up.y - top.y) < 1 && up.hit, `${mode} ${width} ${section}: FAB not fixed scrolling up`);
      if (section === 'itinerary') {
        const date = await page.$eval('#date-chips [data-date]:not([data-date="__all"])', el => { el.click(); return el.dataset.date; });
        // Real pointer click while scrolled; reopening must work without a hash change.
        for (let n = 0; n < 2; n++) {
          await page.click('#fab');
          await page.waitForSelector('#itinerary-form');
          assert.equal(await page.$eval('#it-date', el => el.value), date, 'chosen day lost');
          await page.$eval('.bottom-sheet-backdrop', el => el.click());
          await page.waitForFunction(() => !document.querySelector('#itinerary-form'));
        }
      } else {
        await page.click('#fab');
        await page.waitForSelector('#expense-form');
        assert((await page.$eval('#fab', el => getComputedStyle(el).display)) === 'none', 'FAB should not overlap expense save bar');
      }
    }
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/dashboard'));
    await page.waitForFunction(() => document.querySelector('#fab').classList.contains('hidden'));
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/documents'));
    await page.waitForSelector('#add-doc-btn');
    const docs = await page.$eval('#fab', el => getComputedStyle(el).display);
    if (width >= 1024) assert.equal(docs, 'none', 'documents desktop FAB must remain unchanged');
    console.log(`✅ ${mode} ${width}px: persistent expense and itinerary actions`);
    await page.close();
  }
} finally { await browser?.close(); server.close(); }
