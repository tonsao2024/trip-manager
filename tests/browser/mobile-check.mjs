// Phone-layout check (optional dev tool).
//
// Reports clamp their problems on real phones: "หน้าจอ iPhone Pro Max แสดงผลไม่
// สมบูรณ์" and "ชื่อ user แสดงไม่ครบ". This script renders the real app in a real
// Chromium at iPhone Pro Max size, on every route, and measures what actually
// happens: horizontal overflow, elements wider than the viewport, screen
// screenshots in tests/browser/out/mobile/.
//
// Run it with:
//   npm install --no-save jsdom puppeteer-core @sparticuz/chromium tailwindcss dayjs
//   node tests/browser/mobile-check.mjs           # all devices
//   node tests/browser/mobile-check.mjs 430x932   # one size
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { appDir, outRoot } from './mobile-build.mjs';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
// MOBILE_MODE=dark|light forces the stored appearance mode (screenshots land in
// tests/browser/out/mobile-dark/ so they never overwrite the default set).
const FORCE_MODE = ['light', 'dark', 'auto'].includes(process.env.MOBILE_MODE) ? process.env.MOBILE_MODE : '';
const shotDir = path.join(outRoot, FORCE_MODE ? `mobile-${FORCE_MODE}` : 'mobile');
const PORT = Number(process.env.MOBILE_PORT || 8098);

// iPhone 16 Pro Max is 440×956, 16 Pro 402×874, 16 393×852, 14 Pro Max 430×932,
// SE 375×667 — “หน้าจอไอโฟน 16 โปร” is the size the owner reported, so it must be
// in the default sweep; the small end of the range is where a layout usually breaks.
const DEVICES = [
  { id: 'iphone-16-pro-max', width: 440, height: 956, dsf: 3 },
  { id: 'iphone-16-pro', width: 402, height: 874, dsf: 3 },
  { id: 'iphone-16', width: 393, height: 852, dsf: 3 },
  { id: 'iphone-14-pro-max', width: 430, height: 932, dsf: 3 },
  { id: 'iphone-se', width: 375, height: 667, dsf: 2 }
];

const ROUTES = [
  ['dashboard', '#/trip/t1/dashboard'],
  ['itinerary', '#/trip/t1/itinerary'],
  ['expenses', '#/trip/t1/expenses'],
  ['expenses-day', '#/trip/t1/expenses', '#expense-group-toggle [data-group="day"]'],
  ['expense-popup', '#/trip/t1/expenses', '.expense-card'],
  ['expense-add', '#/trip/t1/expenses/add'],
  ['expense-custom', '#/trip/t1/expenses/add', '[data-split="unequal"]', '#split-area'],
  ['settlement', '#/trip/t1/settlement'],
  ['settlement-receipts', '#/trip/t1/settlement', '#settle-views [data-view="receipts"]'],
  ['members', '#/trip/t1/members', null, '#members-list'],
  ['member-form', '#/trip/t1/members', '#add-member-btn'],
  ['documents', '#/trip/t1/documents'],
  ['prep', '#/trip/t1/prep', null, '#prep-lists'],
  ['ideas', '#/trip/t1/ideas', null, '#ideas-list'],
  ['bookings', '#/trip/t1/bookings', null, '#booking-next'],
  ['export', '#/trip/t1/export', null, '#ics-all'],
  ['appearance', '#/trip/t1/dashboard', ['#user-avatar-btn', '#appearance-btn']],
  ['more', '#/trip/t1/more'],
  ['settings', '#/trip/t1/settings']
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/** index.html with the CDN bits replaced by local copies. */
function buildPage() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '')
    .replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>/, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/, '')
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace(/<script type="module" src="\.\/src\/js\/app\.js\?v=\d+"><\/script>/,
      '<script type="module" src="/tests/browser/mobile-driver.js"></script>')
    .replace(/\.\/src\/css\//g, '/src/css/')
    // The CDN script injects its <style> at the end of <head> at runtime, so the
    // utilities come after the app stylesheet. Reproduce that order here.
    .replace('</head>', '<link rel="stylesheet" href="/tests/browser/out/tailwind.css"></head>');
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'mobile.html'), html);
  return html;
}

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = url === '/' ? path.join(outRoot, 'mobile.html') : path.join(root, url);
      if (!file.startsWith(root)) { res.writeHead(403).end('no'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('missing'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const wanted = process.argv[2];
  const devices = wanted
    ? (() => { const [w, h] = wanted.split('x').map(Number); return [{ id: `custom-${w}x${h}`, width: w, height: h, dsf: 2 }]; })()
    : DEVICES;

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const thaiFontDir = path.join(root, 'node_modules', '@fontsource', 'noto-sans-thai', 'files');
  const thaiCss = [400, 600, 700, 800].map(w => {
    const file = path.join(thaiFontDir, `noto-sans-thai-thai-${w}-normal.woff2`);
    if (!fs.existsSync(file)) return '';
    return `@font-face{font-family:'Noto Sans Thai Check';font-style:normal;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format('woff2');}`;
  }).join('');

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') }
  });

  fs.mkdirSync(shotDir, { recursive: true });
  const server = await serve();
  const problems = [];

  for (const device of devices) {
    const page = await browser.newPage();
    await page.setViewport({ width: device.width, height: device.height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', (req) => req.continue());
    page.on('pageerror', (e) => console.log(`   [page error] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`   [console.${m.type()}]`, m.text().slice(0, 200)); });
    page.on('requestfailed', (r) => console.log('   [req failed]', r.url().replace('http://127.0.0.1:8098',''), r.failure()?.errorText));
    page.on('response', (r) => { if (r.status() >= 400) console.log('   [http', r.status() + ']', r.url().replace('http://127.0.0.1:8098','')); });
    if (FORCE_MODE) {
      await page.evaluateOnNewDocument((mode) => {
        try { localStorage.setItem('fuji_theme', mode); } catch { /* ignore */ }
      }, FORCE_MODE);
    }
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    if (thaiCss) {
      await page.addStyleTag({ content: `${thaiCss}*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
    }
    await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });

    console.log(`\n— ${device.id} (${device.width}×${device.height})${FORCE_MODE ? ` · ${FORCE_MODE} mode` : ''} —`);
    for (const [name, hash, tap, scrollTo] of ROUTES) {
      await page.evaluate((h) => window.__mobile.goto(h), hash);
      // `tap` may be one selector or a chain of them (open a sheet, then a button in it).
      for (const sel of [].concat(tap || [])) {
        if (sel) await page.evaluate((s) => window.__mobile.tap(s), sel);
      }
      if (name === 'expense-custom') {
        await page.evaluate(() => {
          const set = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
          set('ex-subtotal', '10000'); set('ex-discount', '500'); set('ex-service', '950'); set('ex-tax', '732');
          document.querySelector('[data-vatsc="exclude"]').click();
          document.querySelector('[data-payer]:not(.tile-selected)').click();
        });
        await page.type('[data-alloc]', '6000');
        const focused = await page.evaluate(() => document.activeElement?.matches('[data-alloc]') && document.activeElement.value === '6,000');
        if (!focused) problems.push(`${device.id}: custom input lost focus or did not group thousands`);
        const rowOverflow = await page.evaluate(() => [...document.querySelectorAll('.split-row')].some(el => el.scrollWidth > el.clientWidth + 1));
        if (rowOverflow) problems.push(`${device.id}: custom split row overflows`);
        const overlaps = await page.evaluate(() => [...document.querySelectorAll('.split-row')].some(row => {
          const input = row.querySelector('.split-input').getBoundingClientRect();
          const lock = row.querySelector('.split-lock-btn').getBoundingClientRect();
          const final = row.querySelector('.split-final').getBoundingClientRect();
          return input.right > lock.left + 1 || lock.right > final.left + 1;
        }));
        if (overlaps) problems.push(`${device.id}: custom input, lock or final amount overlap`);
      }
      if (name === 'itinerary') {
        await page.evaluate(() => window.__mobile.tap('#date-chips [data-date]'));
        await page.waitForSelector('.itin-thumb');
        const ratio = await page.evaluate(async () => {
          const thumb = document.querySelector('.itin-thumb');
          if (!thumb) return null;
          const img = new Image();
          img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900"><rect width="400" height="900" fill="#88aa99"/></svg>');
          thumb.append(img); await img.decode();
          const r = thumb.getBoundingClientRect();
          return r.width / r.height;
        });
        if (ratio == null || Math.abs(ratio - 16 / 9) > .02) problems.push(`${device.id}: portrait source broke 16:9 (${ratio})`);
      }
      if (name === 'expense-add' || name === 'expense-popup') {
        // v22 “ปุ่มบันทึกลอยไปด้วย”: the action row must stay on screen while the
        // form scrolls — in the page and inside the popup alike.
        const floating = await page.evaluate(async () => {
          const bar = document.querySelector('.expense-form .form-submit-row');
          if (!bar) return { ok: false, why: 'no action row', atTop: false, midway: false, atBottom: false };
          const scroller = bar.closest('.bottom-sheet-content');
          const visible = () => {
            const r = bar.getBoundingClientRect();
            const top = scroller ? Math.max(0, scroller.getBoundingClientRect().top) : 0;
            const bottom = Math.min(window.innerHeight, scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight);
            return r.top >= top - 1 && r.bottom <= bottom + 1 && r.height > 20;
          };
          const scrollTo = (y) => { if (scroller) scroller.scrollTop = y; else window.scrollTo(0, y); };
          const maxScroll = () => Math.max(0, scroller
            ? scroller.scrollHeight - scroller.clientHeight
            : document.documentElement.scrollHeight - window.innerHeight);
          const atTop = visible();
          scrollTo(Math.round(maxScroll() * 0.5));
          await new Promise(r => setTimeout(r, 250));
          const midway = visible();
          scrollTo(maxScroll());
          await new Promise(r => setTimeout(r, 250));
          const atBottom = visible();
          scrollTo(0);
          await new Promise(r => setTimeout(r, 100));
          return { ok: atTop && midway && atBottom, atTop, midway, atBottom, max: Math.round(maxScroll()) };
        });
        console.log(`   ${floating.ok ? '✓' : '✗'} ${name === 'expense-add' ? 'save bar floats (page)' : 'save bar floats (popup)'} — on screen: top:${floating.atTop} mid:${floating.midway} bottom:${floating.atBottom}${floating.why ? ' (' + floating.why + ')' : ''}`);
        if (!floating.ok) {
          problems.push(`${device.id}/${name}: the save bar does not follow the scroll (top:${floating.atTop} mid:${floating.midway} bottom:${floating.atBottom}, scrollable ${floating.max}px)`);
        }
      }
      if (scrollTo) {
        await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), scrollTo);
        await new Promise(r => setTimeout(r, 300));
      }
      const info = await page.evaluate(() => window.__mobile.overflow({ limit: 4 }));
      const audit = await page.evaluate(() => window.__mobile.audit());
      // On a phone the layout viewport must equal the visible width, otherwise the
      // browser zooms the page out and the right edge of every screen is cut off.
      const zoomed = info.layoutWidth > device.width + 1;
      const flag = zoomed || info.bad.length || audit.length ? '✗' : '✓';
      const detail = [...info.bad.map(b => `${b.sel}(+${b.over})`), ...audit].join(', ');
      console.log(`  ${flag} ${name.padEnd(12)} viewport=${info.layoutWidth}/${device.width}${detail ? ' ← ' + detail : ''}`);
      if (zoomed) problems.push(`${device.id}/${name}: the page is zoomed out (${info.layoutWidth} > ${device.width}) — content wider than the screen`);
      // An element that sticks out of the phone is exactly what the owner reports
      // as “แสดงไม่สมบูรณ์ / ตกขอบด้านขวา”: the page can be dragged sideways and the
      // right half of the row is unreadable. It used to be printed but ignored.
      if (info.bad.length) {
        problems.push(`${device.id}/${name}: ${info.bad.length} element(s) stick out of the screen — ${info.bad.map(b => `${b.sel}(+${b.over}px)`).join(', ')}`);
      }
      audit.forEach(a => problems.push(`${device.id}/${name}: ${a}`));
      const file = path.join(shotDir, `${device.id}-${name}.png`);
      if (name === 'expense-custom') {
        const hideFixed = await page.addStyleTag({ content: '#app-header, #bottom-nav, .fab, .bottom-nav, .fuji-fab { visibility: hidden !important; }' });
        await (await page.$('#split-area')).screenshot({ path: file });
        await hideFixed.evaluate(el => el.remove());
      }
      else await page.screenshot({ path: file, fullPage: false });
      // Close any sheet this step opened so the next screen starts clean.
      await page.evaluate(() => document.querySelector('.bottom-sheet-backdrop')?.click());
      await new Promise(r => setTimeout(r, 300));
    }
    await page.close();
  }

  // ---- desktop sanity: the name must come back when there is room for it ----
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    if (thaiCss) {
      await page.addStyleTag({ content: `${thaiCss}*, *::before, *::after { font-family: 'Noto Sans Thai Check', system-ui, sans-serif !important; }` });
    }
    await page.waitForFunction(() => window.__mobile?.ready, { timeout: 30000 });
    await page.evaluate(() => window.__mobile.goto('#/trip/t1/dashboard'));
    const desk = await page.evaluate(() => {
      const el = document.getElementById('user-display-name');
      return {
        shown: !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
        text: (el?.textContent || '').trim(),
        layout: window.innerWidth, client: document.documentElement.clientWidth
      };
    });
    console.log(`\n— desktop 1280×900${FORCE_MODE ? ` · ${FORCE_MODE} mode` : ''} —`);
    console.log(`  ${desk.shown ? '✓' : '✗'} header name visible again (${desk.text || 'empty'}) layout=${desk.layout}/${desk.client}`);
    if (!desk.shown) problems.push('desktop: the user name is hidden even on a wide screen');
    if (desk.layout > desk.client + 1) problems.push('desktop: the page is wider than the window');
    await page.screenshot({ path: path.join(shotDir, 'desktop-dashboard.png') });
    await page.close();
  }

  await browser.close();
  server.close();

  console.log(`\n${problems.length ? '❌' : '✅'} mobile layout check ${problems.length ? 'found problems' : 'passed'} — screenshots in tests/browser/out/mobile/`);
  problems.forEach(p => console.log(`  - ${p}`));
  process.exit(problems.length ? 1 : 0);
}

buildPage();
main().catch(e => { console.error(e); process.exit(2); });
