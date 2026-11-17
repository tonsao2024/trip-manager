// Real expense form, Firestore stubs and production CSS: selection must be
// visible, accessible and persist on save; only the desktop sheet grows.
// npm run test:browser:expense-selection
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
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
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
    await page.setViewport({ width, height: 900, isMobile: width < 768, hasTouch: width < 768 });
    await page.evaluateOnNewDocument(m => localStorage.setItem('fuji_theme', m), mode);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__mobile?.ready);
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/expenses/add'));
    await page.waitForSelector('#expense-form #payer-tiles [data-payer="u2"]');
    const check = async (selector, expected) => {
      const state = await page.$eval(selector, el => ({
        pressed: el.getAttribute('aria-pressed'), selected: el.classList.contains('tile-selected'),
        bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderColor,
        tick: getComputedStyle(el, '::after').content, tickDisplay: getComputedStyle(el, '::after').display
      }));
      assert.equal(state.pressed, String(expected), `${mode} ${width} ${selector} aria`);
      assert.equal(state.selected, expected, `${mode} ${width} ${selector} class`);
      if (expected) assert(state.tick.includes('✓') && state.tickDisplay !== 'none', `${mode} ${width} ${selector} tick`);
      return state;
    };
    const toggle = async selector => page.$eval(selector, el => el.click());
    const payer = '#payer-tiles [data-payer="u2"]';
    const unselected = await check(payer, false);
    await toggle(payer);
    const selected = await check(payer, true);
    assert.notEqual(selected.bg, unselected.bg, `${mode} ${width}: payer fill unchanged`);
    assert.notEqual(selected.border, unselected.border, `${mode} ${width}: payer border unchanged`);
    // Pending payer is exclusive and must be reflected in aria and visuals.
    await page.$eval('#ex-type', el => { el.value = 'estimated'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await toggle('#payer-tiles [data-payer="__pending"]');
    await check('#payer-tiles [data-payer="__pending"]', true);
    await check(payer, false);
    await toggle(payer);
    await check('#payer-tiles [data-payer="__pending"]', false);
    await check(payer, true);
    await page.$eval('#ex-type', el => { el.value = 'actual'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    const share = '#share-tiles [data-share="u2"]';
    await check(share, true);
    await toggle(share); await check(share, false);
    await toggle('#share-all'); // all selected after u2 was removed
    await check(share, true);
    await toggle('#share-all'); await check(share, false);
    await toggle(share); await check(share, true);
    // Save a real new expense with this choice and verify stored IDs.
    await page.$eval('#ex-title', el => { el.value = 'ทดสอบเลือกคน'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#ex-subtotal', el => { el.value = '1000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#expense-form', el => el.requestSubmit());
    await page.waitForFunction(async () => {
      const { __store } = await import('/tests/smoke/stubs/firebase-firestore.mjs');
      return [...__store.values()].some(v => v.title === 'ทดสอบเลือกคน' && v.allocations?.length);
    }, { timeout: 10000 });
    const saved = await page.evaluate(async () => {
      const { __store } = await import('/tests/smoke/stubs/firebase-firestore.mjs');
      return [...__store.values()].find(v => v.title === 'ทดสอบเลือกคน');
    });
    assert.deepEqual(saved.allocations.map(a => a.memberId), ['u2']);
    assert(saved.payments.some(p => p.memberId === 'u2'));
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/expenses'));
    await page.waitForSelector('.expense-card[data-expense="e1"]');
    await toggle('.expense-card[data-expense="e1"]');
    await page.waitForSelector('.expense-sheet #sh-expense-form');
    const dimensions = await page.$eval('.expense-sheet', el => ({ width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    if (width >= 768) assert(dimensions.width >= Math.min(800, width - 32) && dimensions.width <= width - 32, `desktop popup width: ${JSON.stringify(dimensions)}`);
    else assert(dimensions.width <= width && dimensions.width >= width - 2, `mobile popup width: ${JSON.stringify(dimensions)}`);
    assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, `sheet overflows: ${JSON.stringify(dimensions)}`);
    const editShare = '#sh-share-tiles [data-share="u3"]';
    await check(editShare, false); await toggle(editShare); await check(editShare, true);
    const editPayer = '#sh-payer-tiles [data-payer="u2"]';
    await check(editPayer, false); await toggle(editPayer); await check(editPayer, true);
    // Remove the old payer so the pre-existing total remains valid.
    await toggle('#sh-payer-tiles [data-payer="u1"]');
    await page.$eval('#sh-expense-form', el => el.requestSubmit());
    await page.waitForFunction(async () => {
      const { __dump } = await import('/tests/smoke/stubs/firebase-firestore.mjs');
      const e = __dump('trips/t1/expenses/e1');
      return e?.payerId === 'u2' && e.allocations?.some(a => a.memberId === 'u3');
    }, { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('.expense-sheet'));
    await page.waitForSelector('.expense-card[data-expense="e1"]');
    await toggle('.expense-card[data-expense="e1"]');
    await page.waitForSelector('.expense-sheet #sh-expense-form');
    await check(editShare, true);
    await check(editPayer, true);
    console.log(`✅ ${mode} ${width}px: create, edit, selection and sheet width`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.close();
}
