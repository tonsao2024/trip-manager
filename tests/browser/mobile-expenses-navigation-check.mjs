// Phone expense readability and the shared back-to-top control, in real Chromium.
// npm run test:browser:mobile-expenses-navigation
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
  for (const mode of ['light', 'dark']) for (const width of [320, 375, 430, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 720, isMobile: width < 768, hasTouch: width < 768 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(m => localStorage.setItem('fuji_theme', m), mode);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__mobile?.ready);
    await page.evaluate(async () => {
      const db = await import('/tests/smoke/stubs/firebase-firestore.mjs');
      const item = db.__dump('trips/t1/expenses/e1');
      db.__seed('trips/t1/expenses/e1', { ...item, title: 'รายการค่าใช้จ่ายที่มีชื่อยาวมากและต้องอ่านได้ทั้งหมดบนหน้าจอโทรศัพท์',
        subtotalMinor: 98765432102, netTotalMinor: 98765432102, thbMinor: 23703703704 });
    });
    for (const route of ['expenses', 'itinerary', 'dashboard', 'settings', 'expenses/add']) {
      await page.evaluate(route => window.__mobile.goto(`#/trip/t1/${route}`), route);
      if (route === 'expenses') {
        await page.waitForSelector('.expense-card[data-expense="e1"]');
        if (width < 768) {
          const report = await page.evaluate(() => {
            const root = document.querySelector('#expenses-view');
            const viewport = document.documentElement.clientWidth;
            const filters = [...root.querySelectorAll('#expense-filters .chip, #method-filters .chip, #cat-filters .chip')];
            const tiles = [...root.querySelectorAll('.kpi-strip .kpi-mini')];
            const clips = [...filters, ...tiles].filter(el => {
              const r = el.getBoundingClientRect();
              return r.left < -1 || r.right > viewport + 1 || el.scrollWidth > el.clientWidth + 1;
            }).map(el => el.textContent.trim());
            const title = root.querySelector('.expense-card[data-expense="e1"] .expense-title');
            const currency = root.querySelector('#exp-sum-total .money-primary');
            const decimal = currency?.querySelector('.money-dec');
            return { clips, viewport, documentWidth: document.documentElement.scrollWidth,
              kpiScroll: root.querySelector('.kpi-strip').scrollWidth - root.querySelector('.kpi-strip').clientWidth,
              titleText: title.textContent, titleStyle: getComputedStyle(title).textOverflow,
              titleWhitespace: getComputedStyle(title).whiteSpace,
              decimalVisible: decimal && getComputedStyle(decimal).display !== 'none',
              totalText: currency?.textContent };
          });
          assert.equal(report.documentWidth, report.viewport, JSON.stringify(report));
          assert.equal(report.kpiScroll, 0, JSON.stringify(report));
          assert.deepEqual(report.clips, [], JSON.stringify(report));
          assert.equal(report.titleStyle, 'clip');
          assert.notEqual(report.titleWhitespace, 'nowrap');
          assert(report.titleText.endsWith('โทรศัพท์') && report.decimalVisible && /\.\d\d/.test(report.totalText), JSON.stringify(report));
        }
      }
      assert.equal(await page.$('#app-footer'), null);
      // Ensure a route has enough content to scroll without changing production layout.
      await page.evaluate(() => { const extra = document.createElement('div'); extra.style.height = '1600px'; extra.id = 'test-spacer'; document.querySelector('#app').appendChild(extra); });
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForFunction(() => !document.getElementById('back-to-top').hidden);
      const geom = await page.evaluate(() => {
        const top = document.getElementById('back-to-top').getBoundingClientRect();
        const fab = document.getElementById('fab');
        const f = fab.getBoundingClientRect();
        const nav = document.getElementById('bottom-nav');
        const n = nav.getBoundingClientRect();
        const hit = document.elementFromPoint(top.left + top.width / 2, top.top + top.height / 2);
        return { left: top.left, right: top.right, bottom: top.bottom, navTop: n.top, navVisible: getComputedStyle(nav).display !== 'none',
          fabVisible: getComputedStyle(fab).display !== 'none', fabLeft: f.left,
          hit: hit?.closest('#back-to-top') !== null };
      });
      assert(geom.hit && geom.left >= 0 && geom.right <= width && geom.bottom <= 720, JSON.stringify(geom));
      if (geom.navVisible) assert(geom.bottom <= geom.navTop, 'back-to-top overlaps nav');
      if (geom.fabVisible) assert(geom.right < geom.fabLeft, 'back-to-top overlaps add action');
      if (route === 'expenses/add') {
        const save = await page.$eval('#expense-form .form-submit-row', el => el.getBoundingClientRect().top);
        assert(geom.bottom <= save, 'back-to-top overlaps the floating save bar');
      }
      await page.click('#back-to-top');
      await page.waitForFunction(() => window.scrollY < 2 && document.getElementById('back-to-top').hidden);
    }
    console.log(`✅ ${mode} ${width}px: expenses readable; back-to-top on all checked pages`);
    await page.close();
  }
} finally { await browser?.close(); server.close(); }
